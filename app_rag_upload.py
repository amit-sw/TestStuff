import streamlit as st
from openai import OpenAI
import os
import tempfile

st.title("OpenAI RAG App")

# Initialize client
os.environ["OPENAI_API_KEY"] = st.secrets["OPENAI_API_KEY"]
client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])

# Upload and index PDF
uploaded_file = st.file_uploader("Upload a PDF file", type=["pdf"])

if st.button("Index"):
    if uploaded_file:
        # Save uploaded PDF temporarily
        with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp_file:
            tmp_file.write(uploaded_file.read())
            tmp_file_path = tmp_file.name

        # Upload file to OpenAI
        uploaded = client.files.create(
            file=open(tmp_file_path, "rb"),
            purpose="assistants"
        )

        st.session_state["file_id"] = uploaded.id
        st.success(f"File uploaded successfully! File ID: {uploaded.id}")
    else:
        st.warning("Please upload a PDF file first.")

# Query section
question = st.text_input("Ask a question about the uploaded file:")

if st.button("Query using RAG"):
    from openai import OpenAI

    # Initialize the client
    client = OpenAI(api_key="YOUR_OPENAI_API_KEY")

    # Your question
    question = "Summarize the installation process described in the manual."

    # Query the Vector Store using the Responses API
    response = client.responses.create(
        model="gpt-5-mini",
        input=[
            {"role": "user", "content": question}
        ],
        reasoning={"effort": "medium"},
        file_search={"vector_store_ids": ["vs_690d844e1e008191aaa33587c4b6ad16"]}
    )

    # Print the answer
    print(response.output_text)
    st.write(response.output_text)

st.write("Done")