import base64
import os

import streamlit as st
from openai import OpenAI
client = None
prompt = None

def set_up():
    global client, prompt
    for k, v in st.secrets.items():
        os.environ[k] = str(v)
    client = OpenAI(
        api_key=os.environ["OPENROUTER_API_KEY"],
        base_url=os.environ.get("OPENROUTER_API_BASE", "https://openrouter.ai/api/v1"),
    )
    prompt = f"""You are expert dance instructor. 
    Provide feedback to the user on the dance - focussing on technique and facial expressions.
    The user can only provide a picture, not a video.
    Start by identifying the dance and providing a historical perspective.
    Then provide the feedback - keep it short.
    """

def one_analysis(data_url):
    """Return a generator of text deltas for streaming outside this function."""

    def token_gen():
        # Create the streaming response lazily when the generator is consumed.
        stream = client.chat.completions.create(
            model=os.environ.get("OPENROUTER_MODEL", "openai/gpt-4o-mini-vision"),
            messages=[
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": prompt},
                        {"type": "image_url", "image_url": {"url": data_url}},
                    ],
                }
            ],
            stream=True,
        )

        for chunk in stream:
            delta = chunk.choices[0].delta
            if delta and getattr(delta, "content", None):
                yield delta.content

    return token_gen()

    

def one_run():
    uploaded_file = st.file_uploader("Upload a dance pose you'd like me to provide feedback on", type=["jpg", "jpeg", "png"])
    if uploaded_file:
        image_b64 = base64.b64encode(uploaded_file.getvalue()).decode("utf-8")
        data_url = f"data:{uploaded_file.type};base64,{image_b64}"
        with st.spinner("Reviewing your pose...", show_time=True):
            content = st.write_stream(one_analysis(data_url))
        # content now contains the final combined text if you need it later
    else:
        st.write("Waiting for image upload")
    
def main():
    st.title("Dance Feedback")
    set_up()
    one_run()
     
    
if __name__ == "__main__":
    main()
