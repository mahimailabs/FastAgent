import logging
from typing import Any, Callable

from sqlmodel import select

from src.models.user_model import UserDb
from src.repository.base_repository import BaseRepository

logger = logging.getLogger(__name__)


class UserRepository(BaseRepository):
    """User repository using UserDb model with BaseRepository pattern."""

    def __init__(self, session_factory: Callable[..., Any]):
        super().__init__(session_factory, UserDb)

    async def get_by_supabase_id(self, supabase_id: str):
        async with self.session_factory() as session:
            statement = select(self.model).where(self.model.supabase_id == supabase_id)
            result = await session.execute(statement)
            return result.scalars().first()
