import os
from typing import Any

from langchain.chat_models import init_chat_model

from src.core.config import Config
from src.services.llm.base import ChatModelProvider


class OpenAIChatModelProvider(ChatModelProvider):
    def create(self, config: Config) -> Any:
        if not config.OPENAI_API_KEY:
            raise ValueError("OPENAI_API_KEY is required when LLM_PROVIDER=openai")
        if not config.MODEL_NAME:
            raise ValueError("MODEL_NAME is required when LLM_PROVIDER=openai")

        os.environ["OPENAI_API_KEY"] = config.OPENAI_API_KEY.get_secret_value()
        return init_chat_model(config.MODEL_NAME)
