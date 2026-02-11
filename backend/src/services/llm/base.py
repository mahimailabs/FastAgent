from abc import ABC, abstractmethod
from typing import Any

from src.core.config import Config


class ChatModelProvider(ABC):
    @abstractmethod
    def create(self, config: Config) -> Any:
        """Create and return a chat model instance."""
