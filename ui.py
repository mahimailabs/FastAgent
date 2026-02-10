import os

import requests
import streamlit as st
from dotenv import load_dotenv

load_dotenv()

st.title("Kurious FastAPI Template")

BASE_URL = os.getenv("API_BASE_URL", "http://localhost:8000")


def save_feedback(index: int) -> None:
    """Persist feedback for a specific assistant response."""
    feedback_key = f"feedback_{index}"
    feedback_value = st.session_state.get(feedback_key)
    if feedback_value is None:
        return

    if index >= len(st.session_state.messages):
        return

    st.session_state.messages[index]["feedback"] = feedback_value

    st.session_state.latest_feedback = {
        "message_index": index,
        "value": feedback_value,
    }
    st.toast("Feedback saved — thank you!")


with st.sidebar:
    st.header("User Settings")
    user = st.text_input(
        "user", value=st.session_state.get("user", ""), key="user_input"
    )

    if user and user.strip():
        st.session_state["user"] = user.strip()
        st.success(f"Welcome, {st.session_state['user']}!")
    else:
        if "user" in st.session_state:
            del st.session_state["user"]

if "messages" not in st.session_state:
    st.session_state.messages = []

if "latest_feedback" not in st.session_state:
    st.session_state.latest_feedback = None

is_user_valid = st.session_state.get("user") and st.session_state["user"].strip()

if not is_user_valid:
    st.info("👋 Please enter a user id in the sidebar to start chatting.")
else:
    for idx, message in enumerate(st.session_state.messages):
        with st.chat_message(message["role"]):
            st.markdown(message["content"])
            if message["role"] == "assistant":
                feedback = message.get("feedback")
                feedback_key = f"feedback_{idx}"
                st.session_state[feedback_key] = feedback
                st.feedback(
                    "faces",
                    key=feedback_key,
                    disabled=feedback is not None,
                    on_change=save_feedback,
                    args=(idx,),
                )

    if prompt := st.chat_input("What is up?"):
        st.session_state.messages.append({"role": "user", "content": prompt})
        with st.chat_message("user"):
            st.markdown(prompt)

        with st.chat_message("assistant"):
            try:
                api_url = f"{BASE_URL}/api/chat"
                payload = {"query": prompt, "user_id": st.session_state["user"]}

                latest_feedback = st.session_state.get("latest_feedback")
                if latest_feedback and latest_feedback.get("value") is not None:
                    payload["feedback"] = latest_feedback

                try:
                    response = requests.post(
                        api_url,
                        json=payload,
                        headers={
                            "accept": "application/json",
                            "Content-Type": "application/json",
                        },
                        timeout=30,
                    )
                    response.raise_for_status()
                except requests.exceptions.RequestException as e:
                    st.error(f"Error: {str(e)}")
                    st.session_state.messages.append(
                        {"role": "assistant", "content": str(e)}
                    )
                    st.stop()

                response_data = response.json()
                assistant_response = response_data.get("answer", str(response_data))

                st.markdown(assistant_response)
                assistant_index = len(st.session_state.messages)
                feedback_key = f"feedback_{assistant_index}"
                st.session_state.setdefault(feedback_key, None)
                st.feedback(
                    "faces",
                    key=feedback_key,
                    on_change=save_feedback,
                    args=(assistant_index,),
                )
                st.session_state.messages.append(
                    {
                        "role": "assistant",
                        "content": assistant_response,
                        "feedback": None,
                    }
                )
                st.session_state.latest_feedback = None

            except requests.exceptions.RequestException as e:
                error_message = f"Error: {str(e)}"
                st.error(error_message)
                st.session_state.messages.append(
                    {"role": "assistant", "content": error_message}
                )
