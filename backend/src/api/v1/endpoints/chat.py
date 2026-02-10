import json

from dependency_injector.wiring import Provide, inject
from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse

from src.core.container import Container
from src.schemas.chat_schema import ChatRequest
from src.services.chat_service import ChatService

router = APIRouter(prefix="/chat", tags=["chat"])


@router.post("/")
@inject
async def chat(
    chat_request: ChatRequest,
    # clerk_id: str = Depends(get_current_user),
    chat_service: ChatService = Depends(Provide[Container.chat_service]),
):
    response = await chat_service.generate_response(
        message=chat_request.content,
        thread_id=chat_request.conversation_id or "default",
    )
    return response


@router.post("/stream")
@inject
async def stream_chat(
    chat_request: ChatRequest,
    # clerk_id: str = Depends(get_current_user),
    chat_service: ChatService = Depends(Provide[Container.chat_service]),
):
    async def event_generator():
        async for event in chat_service.stream_response(
            message=chat_request.content,
            thread_id=chat_request.conversation_id or "default",
        ):
            yield f"data: {json.dumps(event, default=str)}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
