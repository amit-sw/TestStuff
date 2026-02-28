"""Streamlit app to analyze token counts for files within a directory tree."""

from __future__ import annotations

import os
import sqlite3
from pathlib import Path
from typing import Callable, Dict, Iterable, List, Optional, Tuple

import pandas as pd
import streamlit as st
import tiktoken

DEFAULT_DB_PATH = Path(st.secrets.get("TOKEN_DB_PATH", "token_counts.sqlite3"))
ENCODING_NAME = st.secrets.get("TOKEN_ENCODING", "cl100k_base")
MAX_READ_BYTES = int(st.secrets.get("TOKEN_MAX_READ_BYTES", 5_000_000))


@st.cache_resource(show_spinner=False)
def get_encoder():
    """Return a cached tiktoken encoder."""
    return tiktoken.get_encoding(ENCODING_NAME)


@st.cache_resource(show_spinner=False)
def get_connection(db_path: str):
    """Initialise or return a cached SQLite connection."""
    path = Path(db_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    init_db(conn)
    return conn


def init_db(conn: sqlite3.Connection) -> None:
    """Ensure required tables and indexes exist."""
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS file_tokens (
            root_path TEXT NOT NULL,
            path TEXT NOT NULL,
            parent_path TEXT NOT NULL,
            tokens INTEGER NOT NULL,
            computed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS dir_tokens (
            root_path TEXT NOT NULL,
            path TEXT NOT NULL,
            parent_path TEXT,
            tokens INTEGER NOT NULL,
            computed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_file_tokens_root_path
            ON file_tokens(root_path);
        CREATE INDEX IF NOT EXISTS idx_dir_tokens_root_path
            ON dir_tokens(root_path);
        """
    )
    conn.commit()


def is_text_file(path: Path) -> bool:
    """Heuristic to skip binary files."""
    try:
        with path.open("rb") as handle:
            chunk = handle.read(1024)
    except Exception:
        return False
    return b"\x00" not in chunk


def count_tokens_in_file(path: Path, encoder) -> Tuple[Optional[int], Optional[str]]:
    """Return token count for the given file or an error message."""
    if not path.is_file():
        return None, f"Not a file: {path}"

    if not is_text_file(path):
        return None, f"Skipped binary file: {path}"

    try:
        with path.open("r", encoding="utf-8", errors="ignore") as handle:
            text = handle.read(MAX_READ_BYTES)
    except Exception as exc:
        return None, f"Could not read {path}: {exc}"

    try:
        token_count = len(encoder.encode(text))
    except Exception as exc:  # Defensive: encoding may fail for unusual text
        return None, f"Encoding failed for {path}: {exc}"

    return token_count, None


def accumulate_directory_totals(
    root: Path,
    encoder,
    excluded_dirs: Optional[Iterable[Path]] = None,
    progress_callback: Optional[Callable[[int, int], None]] = None,
) -> Tuple[List[Dict[str, object]], List[Dict[str, object]], List[str]]:
    """Walk the directory tree and compute file and directory token totals."""
    root = root.resolve()
    if not root.is_dir():
        raise NotADirectoryError(f"{root} is not a directory")

    file_records: List[Dict[str, object]] = []
    dir_totals: Dict[Path, int] = {root: 0}
    issues: List[str] = []

    excluded_dirs = {d.resolve() for d in excluded_dirs or []}

    files_processed = 0
    total_tokens = 0

    for current_root, dir_names, files in os.walk(root):
        current_path = Path(current_root)

        dir_names[:] = [name for name in dir_names if (current_path / name).resolve() not in excluded_dirs]
        dir_totals.setdefault(current_path, 0)

        for file_name in files:
            file_path = current_path / file_name
            tokens, error = count_tokens_in_file(file_path, encoder)
            if error:
                issues.append(error)
                continue
            if tokens is None:
                continue

            file_records.append(
                {
                    "path": str(file_path),
                    "parent_path": str(current_path),
                    "tokens": tokens,
                }
            )

            files_processed += 1
            total_tokens += tokens
            if progress_callback:
                progress_callback(files_processed, total_tokens)

            ancestor = current_path
            while True:
                dir_totals[ancestor] = dir_totals.get(ancestor, 0) + tokens
                if ancestor == root:
                    break
                ancestor = ancestor.parent
                if root not in ancestor.parents and ancestor != root:
                    break

    dir_records: List[Dict[str, object]] = []
    for dir_path, total_tokens in dir_totals.items():
        parent = str(dir_path.parent) if dir_path != root else None
        dir_records.append(
            {
                "path": str(dir_path),
                "parent_path": parent,
                "tokens": total_tokens,
            }
        )

    return file_records, dir_records, issues


def store_results(
    conn: sqlite3.Connection,
    root: Path,
    file_records: List[Dict[str, object]],
    dir_records: List[Dict[str, object]],
) -> None:
    """Persist token counts for the specified root path."""
    root_str = str(root)
    with conn:
        conn.execute("DELETE FROM file_tokens WHERE root_path = ?", (root_str,))
        conn.execute("DELETE FROM dir_tokens WHERE root_path = ?", (root_str,))
        conn.executemany(
            "INSERT INTO file_tokens (root_path, path, parent_path, tokens) VALUES (?, ?, ?, ?)",
            [(root_str, rec["path"], rec["parent_path"], rec["tokens"]) for rec in file_records],
        )
        conn.executemany(
            "INSERT INTO dir_tokens (root_path, path, parent_path, tokens) VALUES (?, ?, ?, ?)",
            [
                (
                    root_str,
                    rec["path"],
                    rec.get("parent_path"),
                    rec["tokens"],
                )
                for rec in dir_records
            ],
        )


def fetch_results(
    conn: sqlite3.Connection, root: Path
) -> Tuple[pd.DataFrame, pd.DataFrame, Optional[int]]:
    """Load stored results for the given root directory."""
    root_str = str(root)
    files = conn.execute(
        """
        SELECT path, parent_path, tokens, computed_at
        FROM file_tokens
        WHERE root_path = ?
        ORDER BY tokens DESC
        """,
        (root_str,),
    ).fetchall()

    dirs = conn.execute(
        """
        SELECT path, parent_path, tokens, computed_at
        FROM dir_tokens
        WHERE root_path = ?
        ORDER BY tokens DESC
        """,
        (root_str,),
    ).fetchall()

    files_df = pd.DataFrame(files, columns=["path", "parent_path", "tokens", "computed_at"])
    dirs_df = pd.DataFrame(dirs, columns=["path", "parent_path", "tokens", "computed_at"])

    root_total: Optional[int] = None
    if not dirs_df.empty:
        match = dirs_df.loc[dirs_df["path"] == root_str]
        if not match.empty:
            root_total = int(match.iloc[0]["tokens"])

    return files_df, dirs_df, root_total


def format_relative_columns(df: pd.DataFrame, root: Path) -> pd.DataFrame:
    """Add relative path information for display."""
    if df.empty or "path" not in df.columns:
        return df
    root_resolved = str(root.resolve())
    df = df.copy()
    try:
        df["relative_path"] = df["path"].apply(
            lambda p: os.path.relpath(p, root_resolved) if p else ""
        )
    except Exception:
        df["relative_path"] = df["path"]
    return df


def parse_exclusions(raw: str, root_path: Path) -> List[Path]:
    """Parse newline or comma separated exclusions relative to the root."""
    entries = [part.strip() for part in raw.replace("\n", ",").split(",")]
    exclusions = []
    for entry in entries:
        if not entry:
            continue
        path = Path(entry)
        if not path.is_absolute():
            path = (root_path / path).resolve()
        else:
            path = path.resolve()
        exclusions.append(path)
    return exclusions


def count_total_files(root: Path, excluded_dirs: Iterable[Path]) -> int:
    """Count files within root while respecting the exclusion list."""
    root = root.resolve()
    excluded_set = {Path(p).resolve() for p in excluded_dirs}
    total = 0
    for current_root, dir_names, files in os.walk(root):
        current_path = Path(current_root)
        dir_names[:] = [
            name for name in dir_names if (current_path / name).resolve() not in excluded_set
        ]
        total += len(files)
    return total


def main() -> None:
    st.title("Directory Token Explorer")
    st.caption(
        "Traverse a directory, compute token counts with tiktoken, and store the results in SQLite."
    )

    db_path = st.text_input("SQLite database path", value=str(DEFAULT_DB_PATH))
    conn = get_connection(db_path)
    encoder = get_encoder()

    default_root = Path.cwd()
    root_input = st.text_input(
        "Directory to analyse",
        value=str(default_root),
        help="Provide an absolute or relative path to the directory you want to scan.",
    )

    default_exclude = st.secrets.get("TOKEN_DEFAULT_EXCLUDES", ".venv")
    with st.expander("Options"):
        excludes_input = st.text_area(
            "Exclude directories (one per line or comma separated)",
            value=default_exclude,
            help="These directories will be skipped during traversal.",
        )

    analyze = st.button("Analyse directory", type="primary")

    root_path = Path(root_input).expanduser()

    if analyze:
        if not root_path.exists():
            st.error(f"Path does not exist: {root_path}")
        elif not root_path.is_dir():
            st.error(f"Not a directory: {root_path}")
        else:
            with st.spinner(
                "Scanning directory and computing token counts...", show_time=True
            ):
                try:
                    excluded = parse_exclusions(excludes_input, root_path)
                    total_files = count_total_files(root_path, excluded)
                    progress_placeholder = st.empty()
                    progress_bar = st.progress(0.0)

                    def report(files_done: int, tokens_done: int) -> None:
                        fraction = 0.0
                        if total_files:
                            fraction = min(files_done / total_files, 0.999)
                        progress_bar.progress(fraction)
                        progress_placeholder.info(
                            f"Processed {files_done:,} files | {tokens_done:,} tokens"
                        )

                    file_records, dir_records, issues = accumulate_directory_totals(
                        root_path, encoder, excluded, report
                    )
                    progress_bar.progress(1.0)
                    store_results(conn, root_path.resolve(), file_records, dir_records)
                    progress_placeholder.success(
                        f"Scan complete: {len(file_records):,} files |"
                        f" {sum(rec['tokens'] for rec in file_records):,} tokens"
                    )
                    st.success(
                        f"Stored {len(file_records)} files and {len(dir_records)} directories for {root_path}."
                    )
                    if issues:
                        st.warning(
                            f"Skipped {len(issues)} items (binary files, read errors, etc.)."
                        )
                        with st.expander("View skipped items"):
                            display_limit = 200
                            for message in issues[:display_limit]:
                                st.write(message)
                            if len(issues) > display_limit:
                                st.write(f"... and {len(issues) - display_limit} more")
                except Exception as exc:
                    st.error(f"Analysis failed: {exc}")

    if not root_path.exists():
        return

    files_df, dirs_df, root_total = fetch_results(conn, root_path.resolve())
    if files_df.empty and dirs_df.empty:
        st.info("No stored results for this directory yet. Click 'Analyse directory' to begin.")
        return

    st.subheader("Summary")
    col1, col2, col3 = st.columns(3)
    col1.metric("Total tokens", f"{root_total or 0:,}")
    col2.metric("Files analysed", f"{len(files_df):,}")
    col3.metric("Directories", f"{len(dirs_df):,}")

    dirs_display = format_relative_columns(dirs_df, root_path.resolve())
    files_display = format_relative_columns(files_df, root_path.resolve())

    st.subheader("Directory token totals")
    st.dataframe(dirs_display[["relative_path", "tokens", "computed_at"]])

    st.subheader("File token counts")
    st.dataframe(files_display[["relative_path", "parent_path", "tokens", "computed_at"]])


if __name__ == "__main__":
    main()
