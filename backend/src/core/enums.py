from enum import Enum


class ModelName(str, Enum):
    GPT_4o_MINI = "gpt-4o-mini"
    GPT_4o = "gpt-4o"
    LLAMA_3_8B_INSTANT = "llama-3.8b-instant"


class Role(str, Enum):
    USER = "user"
    ASSISTANT = "assistant"
    SYSTEM = "system"
