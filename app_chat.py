import streamlit as st
import os
os.environ["LANGCHAIN_TRACING_V2"]="true"
os.environ["LANGCHAIN_API_KEY"]=st.secrets['LANGCHAIN_API_KEY']
os.environ["LANGCHAIN_PROJECT"]="AIClub Pro"
os.environ['LANGCHAIN_ENDPOINT']="https://api.smith.langchain.com"



import random

from langchain_core.callbacks import BaseCallbackHandler
from langchain_core.messages import BaseMessage, HumanMessage, AIMessage, SystemMessage
from langsmith import Client

from graph import salesCompAgent

DEBUGGING=1

PLAN_PROMPT = ("You are an expert writer tasked with writing a high level outline of a short 3 paragraph essay. "
                    "Write such an outline for the user provided topic. Give the three main headers of an outline of "
                      "the essay along with any relevant notes or instructions for the sections. ")
WRITER_PROMPT = ("You are an essay assistant tasked with writing excellent 3 paragraph essays. "
                      "Generate the best essay possible for the user's request and the initial outline. "
                      "If the user provides critique, respond with a revised version of your previous attempts. "
                      "Utilize all the information below as needed: \n"
                      "------\n"
                      "{content}")
RESEARCH_PLAN_PROMPT = ("You are a researcher charged with providing information that can "
                              "be used when writing the following essay. Generate a list of "
                              "queries that will gather "
                              "any relevant information. Only generate 3 queries max.")
REFLECTION_PROMPT = ("You are a teacher grading an 3 paragraph essay submission. "
                          "Generate critique and recommendations for the user's submission. "
                          "Provide detailed recommendations, including requests for length, depth, style, etc.")
RESEARCH_CRITIQUE_PROMPT = ("You are a researcher charged with providing information that can "
                                  "be used when making any requested revisions (as outlined below). "
                                  "Generate a prompt with a list of additional information that'd help here. "
                                  "Only generate 3 items max.")
RESEARCH_CRITIQUE_ITEM_PROMPT = ("You are a researcher charged with further investigation of the "
                                  "following information that can"
                                  "be used when making any requested revisions (as outlined below). "
                                  "Generate a prompt with a list of additional information that'd help here. "
                                  "Only generate 3 items max.")


class LangsmithRunRecorder(BaseCallbackHandler):
    def __init__(self):
        self.root_run_id = None

    def on_chain_start(self, serialized, inputs, *, run_id, parent_run_id, **kwargs):
        if parent_run_id is None and self.root_run_id is None:
            self.root_run_id = str(run_id)

    def on_llm_start(self, serialized, prompts, *, run_id, parent_run_id, **kwargs):
        if parent_run_id is None and self.root_run_id is None:
            self.root_run_id = str(run_id)


def record_langsmith_feedback(feedback_label: str) -> None:
    run_id = st.session_state.get("last_langsmith_run_id")
    if not run_id:
        print("No LangSmith run id available for feedback; skipping logging.")
        return

    try:
        client = Client()
    except Exception as exc:
        print(f"Unable to initialize LangSmith client: {exc}")
        return

    score = 1 if feedback_label == "positive" else 0
    source_info = {"source": "streamlit_feedback"}
    thread_id = st.session_state.get("thread_id")
    if thread_id:
        source_info["thread_id"] = thread_id

    try:
        client.create_feedback(
            run_id=run_id,
            key="user_feedback",
            score=score,
            value=feedback_label,
            source_info=source_info,
        )
    except Exception as exc:
        print(f"Failed to log LangSmith feedback: {exc}")


def initialize_prompts():
    prompts={"prompt":"Tell a joke"}
    st.session_state.prompts=prompts
    
def feedback_positive():
    st.success("YEAH!!")
    print("User just gave up a thumbs up")
    record_langsmith_feedback("positive")
    
def feedback_negative():
    st.warning("NO!!")
    print("User just gave up a thumbs down")
    record_langsmith_feedback("negative")
        
def accept_feedback():
    col1, col2 = st.columns(2)
    with col1:
        if st.button("👍 Helpful", key="thumbs_up", on_click=feedback_positive):
            print("Thanks for the feedback!")
    with col2:
        if st.button("👎 Not Helpful", key="thumbs_down",on_click=feedback_negative):
            print("Sorry to hear that!")

def start_chat(container=st):
    #st.title("Cl3vr")
    #st.markdown("""
    #<div style="display:flex;align-items:center;gap:2px;margin:0 0 0.25rem 0;">
    #<h1 style="margin:0;">Cl3vr</h1>
    #<span style="background:#f59e0b;color:white;border-radius:999px;padding:2px 8px;font-size:0.8rem;font-weight:700;">BETA</span>
    #</div>
    #""", unsafe_allow_html=True)

    st.markdown("""
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Audiowide&display=swap');
        .header-container {
            display: flex;
            align-items: center;
            gap: 10px;
        }
    </style>
    <h1 style="font-family:'Audiowide', sans-serif; font-size:2.5rem; letter-spacing:2px;" class="header-container">
        <strong style="font-weight:900;">C L 3 V R</strong>
        <span style="background:#f59e0b;color:white;border-radius:999px;padding:2px 8px;font-size:0.8rem;font-weight:700;">BETA</span>
    </h1>
    """, unsafe_allow_html=True)

    st.subheader("Your AI assistant for Sales Compensation")
    st.markdown("Get instant answers to your sales compensation questions, design comp plans or SPIFs, analyze performance data, and streamline your workflows—all with AI-powered assistance.")
    #st.markdown("© 2025 Cl3vr AI. All rights reserved.")
    st.markdown("<br>", unsafe_allow_html=True)

    if "messages" not in st.session_state:
        st.session_state.messages = []

    if "thread_id" not in st.session_state:
        st.session_state.thread_id = random.randint(1000, 100000000)
    thread_id = st.session_state.thread_id


    user_record = st.session_state.get('user_record')

    if user_record:
        user_id = user_record.get('id', 0)
        #st.write(f"{user_id=}")
        conv_history = None

        if conv_history:
            for idx, conv in enumerate(conv_history):
                conv_id = conv.get('thread_id')
                short_title = conv.get('short_title')
                conv_name = short_title or f"{conv.get('thread_id')}"
                conv_key = conv_name + f"{idx}"

                if st.sidebar.button(conv_name, type="tertiary", key=conv_key):
                    #st.error("to do")
                    r = conv['conv']
                    #restore_conv_history_to_ui(conv_id, r)


    for message in st.session_state.messages:
        if message["role"] != "system":
            with st.chat_message(message["role"]):
                display_text = message["content"].replace("$", "\\$")
                display_text = display_text.replace("\\\\$", "\\$")
                st.markdown(display_text)
                #st.markdown(message["content"].replace("$", "\\$")) 
    
    if prompt := st.chat_input("Ask me anything related to sales comp..", accept_file=True, file_type=["pdf", "md", "doc", "csv"]):
        if prompt and prompt["files"]:
            uploaded_file=prompt["files"][0]
            file_contents, filetype = "XXX XXX XXX TO-DO", "csv"
            if filetype != 'csv':
                prompt.text = prompt.text + f"\n Here are the file contents: {file_contents}"
        
        user_prompt = prompt.text
        st.session_state.messages.append({"role": "user", "content": user_prompt})
        
        with st.chat_message("user"):
            st.write(user_prompt.replace("$", "\\$"))

        message_history = []
        msgs = st.session_state.messages
    
    # Iterate through chat history, and based on the role (user or assistant) tag it as HumanMessage or AIMessage
        for m in msgs:
            if m["role"] == "user":
                message_history.append(HumanMessage(content=m["content"]))
            elif m["role"] == "assistant":
                message_history.append(AIMessage(content=m["content"]))
        
        app = salesCompAgent(st.secrets['OPENAI_API_KEY'], st.secrets['EMBEDDING_MODEL'])
        #app = ewriter_langgraph()
        
        
        thread={"configurable":{"thread_id":thread_id}}
        run_recorder = LangsmithRunRecorder()
        config={"configurable":{"thread_id":thread_id},
                "tags": ["production", "sentiment-analysis", "v1.0"],
                    "metadata": {
                    "user_id": "user_123",
                    "session_id": "session_456",
                    "environment": "production"
                    },
                "callbacks": [run_recorder]
            }
        parameters = {'initialMessage': prompt.text, 
                      #'sessionState': st.session_state, 
                        #'sessionHistory': st.session_state.messages, 
                        'message_history': message_history}
        
        if 'csv_data' in st.session_state:
            parameters['csv_data'] = st.session_state['csv_data']
        
        if prompt['files'] and filetype == 'csv':
            parameters['csv_data'] = file_contents
            st.session_state['csv_data'] = file_contents

        with st.spinner("Thinking ...", show_time=True):
            full_response = ""
            




            for s in app.graph.stream(parameters, config):
                if run_recorder.root_run_id and st.session_state.get("last_langsmith_run_id") != run_recorder.root_run_id:
                    st.session_state["last_langsmith_run_id"] = run_recorder.root_run_id
                if DEBUGGING:
                    print(f"GRAPH RUN: {s}")
                for k,v in s.items():
                    if DEBUGGING:
                        print(f"Key: {k}, Value: {v}")
                
                if resp := v.get("responseToUser"):
                    with st.chat_message("assistant"):
                        # Clean up response: remove weird line breaks
                        cleaned_resp = resp.replace('\n', ' ').replace('  ', ' ')
                        st.markdown(cleaned_resp, unsafe_allow_html=True)
                        st.session_state.messages.append({"role": "assistant", "content": cleaned_resp})
                        accept_feedback()
                        #save_conv_history_to_db(thread_id)
                
                if resp := v.get("incrementalResponse"):
                    with st.chat_message("assistant"):
                        placeholder = st.empty()
                        for response in resp:
                            full_response = full_response + response.content
                            display_text = full_response.replace("$", "\\$")
                            display_text = display_text.replace("\\\$", "\\$")
                            placeholder.markdown(display_text)
                            #placeholder.markdown(full_response.replace("$", "\\$"))
                    st.session_state.messages.append({"role": "assistant", "content": full_response})
                    accept_feedback()
                    
                    #save_conv_history_to_db(thread_id)

            if run_recorder.root_run_id:
                st.session_state["last_langsmith_run_id"] = run_recorder.root_run_id

if __name__ == '__main__':
    st.set_page_config(page_title="Cl3vr - Your AI assistant for Sales Compensation")
    initialize_prompts()
    start_chat()

