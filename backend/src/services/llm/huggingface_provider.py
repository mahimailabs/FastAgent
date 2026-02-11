from typing import Any

from langchain_huggingface import ChatHuggingFace, HuggingFaceEndpoint

from src.core.config import Config
from src.services.llm.base import ChatModelProvider


class HuggingFaceChatModelProvider(ChatModelProvider):
    def create(self, config: Config) -> Any:
        token = config.HUGGINGFACE_API_TOKEN.get_secret_value()
        if not token:
            raise ValueError(
                "HUGGINGFACE_API_TOKEN is required when LLM_PROVIDER=huggingface"
            )
        if not config.MODEL_NAME:
            raise ValueError("MODEL_NAME is required when LLM_PROVIDER=huggingface")

        endpoint = HuggingFaceEndpoint(
            repo_id=config.MODEL_NAME,
            huggingfacehub_api_token=token,
            task="text-generation",
        )
        return ChatHuggingFace(llm=endpoint)
