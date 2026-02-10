import logging
import os
from typing import Any

from langchain.agents import create_agent
from langchain.agents.middleware import SummarizationMiddleware
from langchain.chat_models import init_chat_model
from langchain_mcp_adapters.client import MultiServerMCPClient
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver

from src.core.config import Config
from src.core.exceptions import NotFoundError

logger = logging.getLogger(__name__)


class ChatService:
    def __init__(self, config: Config):
        self.config = config
        os.environ["OPENAI_API_KEY"] = config.OPENAI_API_KEY or ""
        self.model = init_chat_model(config.OPENAI_MODEL_NAME)
        self._mcp_client = MultiServerMCPClient(
            {
                "kurious-tools": {
                    "transport": "http",
                    "url": config.MCP_SERVER_URL,
                }
            }
        )

    async def _load_tools(self) -> list[Any]:
        try:
            tools = await self._mcp_client.get_tools()
            logger.info(f"Loaded {len(tools)} MCP tools from {self.config.MCP_SERVER_URL}")
            return tools
        except Exception as exc:
            logger.warning(f"Falling back to no tools. MCP load failed: {exc}")
            return []

    def _normalize_content(self, value: Any) -> str:
        if isinstance(value, list):
            return " ".join(
                str(part.get("text", "")) if isinstance(part, dict) else str(part)
                for part in value
            ).strip()
        return str(value)

    def _extract_tool_calls(self, messages: list[Any]) -> list[dict[str, Any]]:
        call_map: dict[str, dict[str, Any]] = {}

        for msg in messages:
            raw_calls = getattr(msg, "tool_calls", None) or []
            for call in raw_calls:
                call_id = str(call.get("id") or f"tool-{len(call_map) + 1}")
                call_map[call_id] = {
                    "id": call_id,
                    "name": str(call.get("name") or call.get("tool") or "tool"),
                    "input": call.get("args"),
                    "status": "running",
                }

        for msg in messages:
            tool_call_id = getattr(msg, "tool_call_id", None)
            if tool_call_id and tool_call_id in call_map:
                call_map[tool_call_id]["output"] = self._normalize_content(
                    getattr(msg, "content", "")
                )
                call_map[tool_call_id]["status"] = "completed"

        return list(call_map.values())

    async def generate_response(self, message: str, thread_id: str) -> dict[str, Any]:
        # asyncpg expects postgresql:// scheme
        conn_string = self.config.SQLALCHEMY_DATABASE_URI.replace(
            "postgresql+asyncpg://", "postgresql://"
        )

        async with AsyncPostgresSaver.from_conn_string(conn_string) as checkpointer:
            # Setup the checkpointer (create tables if needed)
            await checkpointer.setup()
            tools = await self._load_tools()

            agent = create_agent(
                model=self.model,
                tools=tools,
                checkpointer=checkpointer,
                debug=True if self.config.DEBUG else False,
                middleware=[
                    SummarizationMiddleware(
                        model=self.model,
                        trigger=("tokens", 2000),
                        keep=("messages", 10),
                    ),
                ],
            )

            response = await agent.ainvoke(
                {"messages": [{"role": "user", "content": message}]},
                {"configurable": {"thread_id": thread_id}},
            )
            messages = response["messages"]
            final_message = messages[-1]
            content = self._normalize_content(final_message.content)
            tool_calls = self._extract_tool_calls(messages)
            return {
                "content": str(content),
                "tool_calls": tool_calls,
                "conversation_id": thread_id,
                "response_id": str(getattr(final_message, "id", "")),
            }

    async def reset_thread(self, thread_id: str) -> None:
        try:
            conn_string = self.config.SQLALCHEMY_DATABASE_URI.replace(
                "postgresql+asyncpg://", "postgresql://"
            )
            async with AsyncPostgresSaver.from_conn_string(conn_string) as checkpointer:
                await checkpointer.adelete_thread(thread_id)
        except Exception:
            logger.error(f"Failed to reset thread: {thread_id}")
            raise NotFoundError(detail=f"Thread {thread_id} not found")
