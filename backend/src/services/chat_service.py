import logging
from typing import Any, AsyncIterator

from langchain.agents import create_agent
from langchain.agents.middleware import SummarizationMiddleware
from langchain_mcp_adapters.client import MultiServerMCPClient
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver

from src.core.config import Config
from src.core.exceptions import NotFoundError
from src.services.llm import ChatModel

logger = logging.getLogger(__name__)


class ChatService:
    def __init__(self, config: Config):
        self.config = config
        self.model = ChatModel().create(config)
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
            logger.info(
                f"Loaded {len(tools)} MCP tools from {self.config.MCP_SERVER_URL}"
            )
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

    def _json_safe(self, value: Any) -> Any:
        if value is None or isinstance(value, (str, int, float, bool)):
            return value
        if isinstance(value, list):
            return [self._json_safe(item) for item in value]
        if isinstance(value, tuple):
            return [self._json_safe(item) for item in value]
        if isinstance(value, dict):
            return {str(key): self._json_safe(item) for key, item in value.items()}
        if hasattr(value, "model_dump"):
            try:
                return self._json_safe(value.model_dump())
            except Exception:
                return str(value)
        return str(value)

    def _sanitize_tool_input(self, value: Any) -> Any:
        safe_value = self._json_safe(value)
        if isinstance(safe_value, dict):
            # LangChain tool-start payload often includes a verbose runtime object.
            safe_value.pop("runtime", None)
        return safe_value

    def _sanitize_tool_output(self, value: Any) -> Any:
        if (
            isinstance(value, list)
            and value
            and isinstance(value[0], dict)
            and "type" in value[0]
        ):
            return self._normalize_content(value)
        if hasattr(value, "content"):
            return self._normalize_content(getattr(value, "content", ""))
        return self._json_safe(value)

    def _extract_tool_calls(self, messages: list[Any]) -> list[dict[str, Any]]:
        call_map: dict[str, dict[str, Any]] = {}

        for msg in messages:
            raw_calls = getattr(msg, "tool_calls", None) or []
            for call in raw_calls:
                call_id = str(call.get("id") or f"tool-{len(call_map) + 1}")
                call_map[call_id] = {
                    "id": call_id,
                    "name": str(call.get("name") or call.get("tool") or "tool"),
                    "input": self._sanitize_tool_input(call.get("args")),
                    "status": "running",
                }

        for msg in messages:
            tool_call_id = getattr(msg, "tool_call_id", None)
            if tool_call_id and tool_call_id in call_map:
                call_map[tool_call_id]["output"] = self._sanitize_tool_output(
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

    async def stream_response(
        self, message: str, thread_id: str
    ) -> AsyncIterator[dict[str, Any]]:
        # asyncpg expects postgresql:// scheme
        conn_string = self.config.SQLALCHEMY_DATABASE_URI.replace(
            "postgresql+asyncpg://", "postgresql://"
        )

        async with AsyncPostgresSaver.from_conn_string(conn_string) as checkpointer:
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

            token_buffer: list[str] = []
            tool_runs: dict[str, dict[str, Any]] = {}
            final_payload: dict[str, Any] | None = None

            async for event in agent.astream_events(
                {"messages": [{"role": "user", "content": message}]},
                {"configurable": {"thread_id": thread_id}},
                version="v2",
            ):
                event_name = event.get("event")

                if event_name == "on_chat_model_stream":
                    chunk = event.get("data", {}).get("chunk")
                    chunk_text = self._normalize_content(
                        getattr(chunk, "content", "") if chunk else ""
                    )
                    if chunk_text:
                        token_buffer.append(chunk_text)
                        yield {"type": "token", "content": chunk_text}
                    continue

                if event_name == "on_tool_start":
                    run_id = str(event.get("run_id"))
                    tool_name = str(event.get("name") or "tool")
                    tool_input = self._sanitize_tool_input(
                        event.get("data", {}).get("input")
                    )
                    tool_runs[run_id] = {
                        "id": run_id,
                        "name": tool_name,
                        "input": tool_input,
                        "status": "running",
                    }
                    yield {
                        "type": "tool_start",
                        "id": run_id,
                        "name": tool_name,
                        "input": tool_input,
                    }
                    continue

                if event_name == "on_tool_end":
                    run_id = str(event.get("run_id"))
                    tool_name = str(event.get("name") or "tool")
                    output = self._sanitize_tool_output(
                        event.get("data", {}).get("output")
                    )
                    if run_id in tool_runs:
                        tool_runs[run_id]["output"] = output
                        tool_runs[run_id]["status"] = "completed"
                    else:
                        tool_runs[run_id] = {
                            "id": run_id,
                            "name": tool_name,
                            "output": output,
                            "status": "completed",
                        }
                    yield {
                        "type": "tool_end",
                        "id": run_id,
                        "name": tool_name,
                        "output": output,
                    }
                    continue

                if event_name == "on_chain_end":
                    output = event.get("data", {}).get("output")
                    if isinstance(output, dict) and isinstance(
                        output.get("messages"), list
                    ):
                        messages = output["messages"]
                        if messages:
                            final_message = messages[-1]
                            final_content = self._normalize_content(
                                getattr(final_message, "content", "")
                            )
                            if final_content:
                                token_buffer = [final_content]

                            response_id = str(getattr(final_message, "id", ""))
                            final_payload = {
                                "type": "final",
                                "content": "".join(token_buffer).strip(),
                                "tool_calls": list(tool_runs.values()),
                                "conversation_id": thread_id,
                                "response_id": response_id,
                            }

            if final_payload is None:
                final_payload = {
                    "type": "final",
                    "content": "".join(token_buffer).strip(),
                    "tool_calls": list(tool_runs.values()),
                    "conversation_id": thread_id,
                    "response_id": "",
                }

            yield final_payload

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
