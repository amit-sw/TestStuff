import streamlit as st
import tiktoken

from io import StringIO
import webvtt


def main():
    st.title("🔢 Token Counter")
    file_input = st.file_uploader("Upload a text file to count tokens")
    if file_input is not None:
        content = file_input.read().decode("utf-8")
        with st.expander("File Content Preview"):
            st.text_area("Content", content, height=200)
        encoding = tiktoken.encoding_for_model('gpt-5-mini')
        tokens_base = encoding.encode(content)
        num_tokens_base = len(tokens_base)

        with st.expander("Token Details - base file"):
            st.markdown("### Preview of Tokens")
            st.write(tokens_base[:1000])
        vtt = webvtt.read_buffer(StringIO(content))
        
        #text_list= [caption.text for caption in vtt]
        #old_all_text = "\n".join(text_list)
        
        all_text="\n".join(caption.text for caption in webvtt.read_buffer(StringIO(content)))
        with st.expander("Extracted Text Preview"):
            st.code(all_text[:1000])
        tokens_extracted = encoding.encode(all_text)
        num_tokens_extracted = len(tokens_extracted)
        with st.expander("Token Details - extracted text"):
            st.markdown("### Preview of Tokens from extracted text")
            st.write(tokens_extracted[:1000])
        savings = num_tokens_base - num_tokens_extracted
        savings_pct = (savings / num_tokens_base) * 100 if num_tokens_base > 0 else 0
        st.markdown(f"**Token Savings:** {savings} tokens ({savings_pct:.2f}%), original tokens: {num_tokens_base}, extracted tokens: {num_tokens_extracted}")
    
    
    
if __name__ == "__main__":
    main()