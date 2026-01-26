from src.models.user_model import UserDb
from src.repository.user_repository import UserRepository
from src.services.base_service import BaseService


class UserService(BaseService):
    def __init__(self, user_repository: UserRepository):
        self.user_repository = user_repository
        super().__init__(user_repository)

    async def sync_supabase_user(self, supabase_user) -> UserDb:
        """
        Syncs a Supabase user to the local database.
        If the user exists by supabase_id, returns it.
        Otherwise, creates a new user.
        """
        user = await self.user_repository.get_by_supabase_id(supabase_user.id)
        if user:
            return user

        # Create new user
        new_user = UserDb(
            supabase_id=supabase_user.id,
            email=supabase_user.email,
            name=supabase_user.user_metadata.get("full_name")
            or supabase_user.user_metadata.get("name"),
        )
        return await self.user_repository.create(new_user)
