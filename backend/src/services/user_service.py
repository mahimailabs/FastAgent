from src.models.user_model import UserDb
from src.repository.user_repository import UserRepository
from src.services.base_service import BaseService


class UserService(BaseService):
    def __init__(self, user_repository: UserRepository):
        self.user_repository = user_repository
        super().__init__(user_repository)

    async def sync_clerk_user(
        self, clerk_id: str, email: str | None = None, name: str | None = None
    ) -> UserDb:
        """
        Syncs a Clerk user to the local database.
        If the user exists by clerk_id, returns it.
        Otherwise, creates a new user.

        Args:
            clerk_id: The Clerk user ID from the JWT token
            email: Optional email from JWT token claims
            name: Optional full name

        Returns:
            UserDb: The synced user record
        """
        user = await self.user_repository.get_by_clerk_id(clerk_id)
        if user:
            # Only update profile fields when explicit non-null values are provided.
            should_update = False
            if email is not None and user.email != email:
                user.email = email
                should_update = True
            if name is not None and user.name != name:
                user.name = name
                should_update = True

            if should_update and user.id:
                await self.user_repository.update(user.id, user)
            return user

        # Create new user on first login
        new_user = UserDb(
            clerk_id=clerk_id,
            email=email,
            name=name,
        )
        return await self.user_repository.create(new_user)

    async def delete_clerk_user(self, clerk_id: str) -> None:
        """
        Deletes a user by their Clerk ID.
        """
        await self.user_repository.delete_by_clerk_id(clerk_id)
