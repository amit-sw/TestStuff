import streamlit as st

from pydantic import BaseModel
from typing import TypedDict



from langchain_core.messages import BaseMessage, SystemMessage, HumanMessage, AIMessage
from langgraph.graph import StateGraph, START, END
from langchain_openai import ChatOpenAI
from openai import OpenAI

from pydantic import BaseModel
from typing import TypedDict, Annotated, List
import operator

class Queries(BaseModel):
    queries: List[str]

class AgentState(TypedDict):
    agent: str
    initialMessage: str
    responseToUser: str
    incrementalResponse: str
    lnode: str
    category: str
    message_history: list[BaseMessage]
    email: str
    name: str
    csv_data: str
    analytics_question: str

class CategoryResponse(BaseModel):
    category: str
    response: str

VALID_CATEGORIES = ["negative", "positive", "neutral"]

def create_llm_msg(system_prompt: str, messageHistory: list[BaseMessage]):
    resp = []
    resp.append(SystemMessage(content=system_prompt))
    resp.extend(messageHistory)
    return resp

class salesCompAgent():
    def __init__(self, api_key, embedding_model):
        self.client = OpenAI(api_key=api_key)
        self.model = ChatOpenAI(model=st.secrets['OPENAI_MODEL'], api_key=api_key)

        self.user_record = {}
        if st.session_state.get("user_record"):
            self.user_record = st.session_state.user_record


        workflow = StateGraph(AgentState)
        workflow.add_node("classifier", self.initial_classifier)

        workflow.add_edge(START, "classifier")
        workflow.add_edge("classifier", END)
        self.graph = workflow.compile()

    def initial_classifier(self, state: AgentState):
        print("initial classifier")
        CLASSIFIER_PROMPT = "Classify the message sentiment as positive or negative or neutral. Also respond to the user with an answer, and a joke."
        llm_messages = create_llm_msg(CLASSIFIER_PROMPT, state['message_history'])
        llm_response = self.model.with_structured_output(CategoryResponse).invoke(llm_messages)
        category = llm_response.category
        user_response = llm_response.response
        print(f"category is {category}, user-response is {user_response}")
        return{
            "lnode": "initial_classifier", 
            "category": category,
            "responseToUser": user_response
        }

        
