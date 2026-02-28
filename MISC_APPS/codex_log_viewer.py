#!/usr/bin/env python3
"""View Codex session logs in a user-focused timeline table.

Supported input shapes (JSON or JSONL):
- List of message objects
- Object containing messages (e.g. {"messages": [...]}, {"events": [...]}, {"items": [...]})
- Per-line JSON objects (JSONL)

The script tries to infer:
- timestamp
- user text (for user-role entries)
- assistant response length (characters)
"""

from __future__ import annotations

import argparse
import csv
import json
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Iterable


TIME_KEYS = (
    "timestamp",
    "created_at",
    "createdAt",
    "time",
    "ts",
    "date",
)

ROLE_KEYS = ("role", "sender", "type", "author_role")

TEXT_KEYS = (
    "text",
    "content",
    "message",
    "body",
    "input",
    "output",
)

MESSAGES_CONTAINER_KEYS = ("messages", "events", "items", "records", "conversation")


@dataclass
class Message:
    timestamp: str
    role: str
    text: str


@dataclass
class Row:
    filepath: str
    timestamp: str
    user_says: str
    response_length: int


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description=(
            "Parse Codex session log files and display timestamp + user message + "
            "assistant response length."
        )
    )
    p.add_argument(
        "-f",
        "--file",
        default="-",
        help="Path to exported Codex log file (default: '-' for STDIN)",
    )
    p.add_argument(
        "-d",
        "--dir",
        default="",
        help="Path to a directory tree containing exported log files",
    )
    p.add_argument(
        "-n",
        "--limit",
        type=int,
        default=0,
        help="Max number of rows to print (0 = all)",
    )
    p.add_argument(
        "--contains",
        default="",
        help="Only show rows where user text contains this case-insensitive substring",
    )
    p.add_argument(
        "--preview-chars",
        type=int,
        default=3080,
        help="Max characters shown in 'User says' column",
    )
    p.add_argument(
        "--show-unmatched",
        action="store_true",
        help="Include user messages that have no subsequent assistant response",
    )
    p.add_argument(
        "-o",
        "--output",
        default="-",
        help="CSV output path (default: '-' for STDOUT)",
    )
    return p.parse_args()


def normalize_timestamp(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, (int, float)):
        try:
            return datetime.fromtimestamp(float(value)).isoformat(sep=" ", timespec="seconds")
        except Exception:
            return str(value)
    s = str(value).strip()
    if not s:
        return ""

    # Basic ISO cleanup
    if s.endswith("Z"):
        s = s[:-1] + "+00:00"

    try:
        dt = datetime.fromisoformat(s)
        return dt.isoformat(sep=" ", timespec="seconds")
    except Exception:
        return str(value)


def find_first(obj: dict[str, Any], keys: Iterable[str], default: Any = "") -> Any:
    for key in keys:
        if key in obj and obj[key] is not None:
            return obj[key]
    return default


def extract_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value.strip()
    if isinstance(value, list):
        parts: list[str] = []
        for item in value:
            if isinstance(item, str):
                parts.append(item)
            elif isinstance(item, dict):
                if "text" in item and isinstance(item["text"], str):
                    parts.append(item["text"])
                elif "content" in item:
                    parts.append(extract_text(item["content"]))
                elif "value" in item:
                    parts.append(extract_text(item["value"]))
            else:
                parts.append(str(item))
        return "\n".join(p for p in parts if p).strip()
    if isinstance(value, dict):
        for k in TEXT_KEYS:
            if k in value:
                txt = extract_text(value[k])
                if txt:
                    return txt
        # As a fallback, serialize compactly
        return json.dumps(value, ensure_ascii=True)
    return str(value).strip()


def normalize_role(raw: Any) -> str:
    if raw is None:
        return ""
    role = str(raw).strip().lower()
    aliases = {
        "human": "user",
        "assistant_response": "assistant",
        "ai": "assistant",
        "bot": "assistant",
    }
    return aliases.get(role, role)


def obj_to_message(obj: dict[str, Any], fallback_ts: str = "") -> Message | None:
    role = normalize_role(find_first(obj, ROLE_KEYS, ""))

    ts_raw = find_first(obj, TIME_KEYS, "")
    timestamp = normalize_timestamp(ts_raw) or fallback_ts

    text_candidate = find_first(obj, TEXT_KEYS, None)
    if text_candidate is None:
        # Common nested structures in exported logs:
        # {"payload": {...}}, {"message": {...}}
        for key in ("payload", "message"):
            nested = obj.get(key)
            if isinstance(nested, dict):
                nested_msg = obj_to_message(nested, fallback_ts=timestamp)
                if nested_msg:
                    if not nested_msg.timestamp:
                        nested_msg.timestamp = timestamp
                    return nested_msg

    text = extract_text(text_candidate)
    if not role and not text:
        return None

    return Message(timestamp=timestamp, role=role, text=text)


def parse_log_text(raw_text: str) -> list[Message]:
    raw = raw_text.strip()
    if not raw:
        return []

    messages: list[Message] = []

    def add_obj(obj: Any) -> None:
        if isinstance(obj, dict):
            m = obj_to_message(obj)
            if m:
                messages.append(m)

    def handle_json_value(data: Any) -> None:
        if isinstance(data, list):
            for item in data:
                if isinstance(item, dict):
                    add_obj(item)
        elif isinstance(data, dict):
            # If dict is a direct message event
            direct = obj_to_message(data)
            if direct and (direct.role or direct.text):
                messages.append(direct)

            # Also look for message arrays in known container keys
            for key in MESSAGES_CONTAINER_KEYS:
                value = data.get(key)
                if isinstance(value, list):
                    for item in value:
                        if isinstance(item, dict):
                            add_obj(item)

    # Try JSON first
    try:
        parsed = json.loads(raw)
        handle_json_value(parsed)
        if messages:
            return messages
    except json.JSONDecodeError:
        pass

    # Fallback: JSONL
    for line in raw.splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            obj = json.loads(line)
        except json.JSONDecodeError:
            continue
        if isinstance(obj, dict):
            add_obj(obj)

    return messages


def parse_log_file(path: Path) -> list[Message]:
    return parse_log_text(path.read_text(encoding="utf-8", errors="replace"))


def pair_rows(messages: list[Message], source_path: str, include_unmatched: bool = False) -> list[Row]:
    rows: list[Row] = []
    i = 0
    n = len(messages)
    while i < n:
        msg = messages[i]
        if msg.role == "user":
            user_text = msg.text
            ts = msg.timestamp
            response_len = 0

            j = i + 1
            while j < n:
                nxt = messages[j]
                if nxt.role == "assistant":
                    response_len = len(nxt.text)
                    break
                if nxt.role == "user":
                    break
                j += 1

            if include_unmatched or response_len > 0:
                rows.append(
                    Row(
                        filepath=source_path,
                        timestamp=ts,
                        user_says=user_text,
                        response_length=response_len,
                    )
                )
        i += 1
    return rows


def shorten(s: str, max_chars: int) -> str:
    s = " ".join(s.split())
    if max_chars <= 3 or len(s) <= max_chars:
        return s
    return s[: max_chars - 3] + "..."


def write_csv(rows: list[Row], preview_chars: int, output_path: str) -> None:
    header = ["filepath", "timestamp", "user_says", "response_length"]

    if output_path == "-":
        import sys

        writer = csv.writer(sys.stdout)
        writer.writerow(header)
        for r in rows:
            writer.writerow(
                [r.filepath, r.timestamp, shorten(r.user_says, preview_chars), r.response_length]
            )
        return

    with Path(output_path).open("w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(header)
        for r in rows:
            writer.writerow(
                [r.filepath, r.timestamp, shorten(r.user_says, preview_chars), r.response_length]
            )


def collect_files_from_tree(root: Path) -> list[Path]:
    return [p for p in root.rglob("*") if p.is_file()]


def main() -> int:
    args = parse_args()
    all_rows: list[Row] = []

    if args.dir:
        root = Path(args.dir)
        if not root.exists() or not root.is_dir():
            print(f"Error: directory not found: {root}")
            return 1

        files = collect_files_from_tree(root)
        for file_path in files:
            messages = parse_log_file(file_path)
            if not messages:
                continue
            source = str(file_path.resolve())
            rows = pair_rows(messages, source_path=source, include_unmatched=args.show_unmatched)
            all_rows.extend(rows)
    else:
        if args.file == "-":
            import sys

            messages = parse_log_text(sys.stdin.read())
            source = "<stdin>"
        else:
            path = Path(args.file)
            if not path.exists() or not path.is_file():
                print(f"Error: file not found: {path}")
                return 1
            messages = parse_log_file(path)
            source = str(path.resolve())

        if not messages:
            print(
                "No parseable messages found. Supported formats: JSON list/dict or JSONL with role/content/timestamp fields."
            )
            return 2
        all_rows = pair_rows(messages, source_path=source, include_unmatched=args.show_unmatched)

    if not all_rows:
        print("No parseable messages found in the provided inputs.")
        return 2

    rows = all_rows
    if args.contains:
        needle = args.contains.lower()
        rows = [r for r in rows if needle in r.user_says.lower()]

    rows.sort(key=lambda r: (r.timestamp, r.filepath))

    if args.limit and args.limit > 0:
        rows = rows[: args.limit]

    if not rows:
        print("No matching user rows found.")
        return 0

    write_csv(rows, preview_chars=args.preview_chars, output_path=args.output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
