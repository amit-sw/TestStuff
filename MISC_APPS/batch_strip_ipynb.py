from __future__ import annotations

import argparse
from pathlib import Path

import nbformat


def strip_outputs(notebook: nbformat.NotebookNode) -> nbformat.NotebookNode:
    """Remove outputs and execution counts from every code cell."""
    for cell in notebook.cells:
        if cell.get("cell_type") == "code":
            cell["outputs"] = []
            cell["execution_count"] = None
    return notebook


def process_directory(src_dir: Path, dest_dir: Path) -> int:
    """Strip outputs from all .ipynb files under src_dir and write to dest_dir preserving structure."""
    count = 0
    src_dir = src_dir.resolve()
    dest_dir.mkdir(parents=True, exist_ok=True)

    for notebook_path in src_dir.rglob("*.ipynb"):
        relative = notebook_path.relative_to(src_dir)
        target_path = dest_dir / relative
        target_path.parent.mkdir(parents=True, exist_ok=True)

        notebook = nbformat.read(notebook_path, as_version=4)
        cleaned = strip_outputs(notebook)
        nbformat.write(cleaned, target_path)
        count += 1

    return count


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Strip output cells from all .ipynb files in a directory and write them to another."
    )
    parser.add_argument("source", type=Path, help="Directory containing .ipynb files to clean")
    parser.add_argument("destination", type=Path, help="Directory to write cleaned notebooks to")
    args = parser.parse_args()

    cleaned_count = process_directory(args.source, args.destination)
    print(f"Processed {cleaned_count} notebook(s) from {args.source} to {args.destination}")


if __name__ == "__main__":
    main()
