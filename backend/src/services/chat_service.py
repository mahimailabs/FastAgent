import logging
import os

from langchain.agents import create_agent
from langchain.agents.middleware import SummarizationMiddleware
from langchain.chat_models import init_chat_model
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver

from src.core.config import Config
from src.core.exceptions import NotFoundError

logger = logging.getLogger(__name__)


class ChatService:
    def __init__(self, config: Config):
        self.config = config
        os.environ["OPENAI_API_KEY"] = config.OPENAI_API_KEY or ""
        self.model = init_chat_model(config.OPENAI_MODEL_NAME)

    async def generate_response(self, message: str, thread_id: str) -> str:
        # asyncpg expects postgresql:// scheme
        conn_string = self.config.SQLALCHEMY_DATABASE_URI.replace(
            "postgresql+asyncpg://", "postgresql://"
        )

        async with AsyncPostgresSaver.from_conn_string(conn_string) as checkpointer:
            # Setup the checkpointer (create tables if needed)
            await checkpointer.setup()

            agent = create_agent(
                model=self.model,
                tools=[],
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
            return response["messages"][-1].content

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
