from typing import Optional

from pydantic import BaseModel


class ChatRequest(BaseModel):
    content: str
    conversation_id: Optional[str] = "default"


class ChatResponse(BaseModel):
    conversation_id: str
    response_id: str
    content: str
