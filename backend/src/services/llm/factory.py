from typing import Any

from src.core.config import Config, LLMProvider
from src.services.llm.base import ChatModelProvider
from src.services.llm.huggingface_provider import HuggingFaceChatModelProvider
from src.services.llm.openai_provider import OpenAIChatModelProvider


class ChatModel:
    def __init__(self) -> None:
        self._providers: dict[LLMProvider, ChatModelProvider] = {
            LLMProvider.OPENAI: OpenAIChatModelProvider(),
            LLMProvider.HUGGINGFACE: HuggingFaceChatModelProvider(),
        }

    def create(self, config: Config) -> Any:
        provider = self._providers.get(config.LLM_PROVIDER)
        if provider is None:
            raise ValueError(f"Unsupported LLM_PROVIDER: {config.LLM_PROVIDER}")
        return provider.create(config)
