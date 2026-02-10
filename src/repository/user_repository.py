import logging
from typing import Any, Callable

from sqlmodel import delete, select

from src.models.user_model import UserDb
from src.repository.base_repository import BaseRepository

logger = logging.getLogger(__name__)


class UserRepository(BaseRepository):
    """User repository using UserDb model with BaseRepository pattern."""

    def __init__(self, session_factory: Callable[..., Any]):
        super().__init__(session_factory, UserDb)

    async def get_by_clerk_id(self, clerk_id: str):
        async with self.session_factory() as session:
            statement = select(self.model).where(self.model.clerk_id == clerk_id)
            result = await session.execute(statement)
            return result.scalars().first()

    async def delete_by_clerk_id(self, clerk_id: str):
        """Delete a user by their Clerk ID."""

        async with self.session_factory() as session:
            statement = delete(self.model).where(self.model.clerk_id == clerk_id)
            await session.execute(statement)
            await session.commit()
