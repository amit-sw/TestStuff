import nbformat
import streamlit as st


def strip_outputs(notebook: nbformat.NotebookNode) -> nbformat.NotebookNode:
    """Remove outputs and execution counts from every code cell."""
    for cell in notebook.cells:
        if cell.get("cell_type") == "code":
            cell["outputs"] = []
            cell["execution_count"] = None
    return notebook


def render_notebook_cells(notebook: nbformat.NotebookNode) -> None:
    """Render cells inline so the user can see the cleaned content."""
    for idx, cell in enumerate(notebook.cells, start=1):
        label = f"Cell {idx} ({cell.get('cell_type', 'unknown')})"
        st.markdown(f"### {label}")
        if cell.get("cell_type") == "markdown":
            st.markdown(cell.get("source", ""))
        elif cell.get("cell_type") == "code":
            st.code(cell.get("source", ""), language="python")
        else:
            st.text(cell.get("source", ""))


def main() -> None:
    st.set_page_config(page_title="Notebook Output Remover", page_icon="📓", layout="wide")
    st.title("Notebook Output Remover")
    st.write(
        "Upload a `.ipynb` file in the sidebar to strip outputs. "
        "The cleaned notebook will be rendered below and available for download with a `MIN_` prefix."
    )

    st.sidebar.header("Notebook I/O")
    uploaded = st.sidebar.file_uploader("Choose a Jupyter Notebook (.ipynb)", type=["ipynb"])
    if not uploaded:
        st.info("Awaiting an upload from the sidebar.")
        return

    try:
        # Decode bytes to text and parse as a notebook.
        notebook = nbformat.reads(uploaded.getvalue().decode("utf-8"), as_version=4)
    except Exception as exc:  # pragma: no cover - surfacing errors directly to user
        st.error(f"Unable to read notebook: {exc}")
        return

    cleaned_nb = strip_outputs(notebook)
    cleaned_bytes = nbformat.writes(cleaned_nb).encode("utf-8")

    download_name = f"MIN_{uploaded.name}"
    st.sidebar.download_button(
        label=f"Download cleaned notebook as {download_name}",
        data=cleaned_bytes,
        file_name=download_name,
        mime="application/x-ipynb+json",
    )

    st.success("Outputs stripped. Preview of the cleaned notebook:")
    render_notebook_cells(cleaned_nb)


if __name__ == "__main__":
    main()
