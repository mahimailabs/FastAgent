from typing import Annotated

from dependency_injector.wiring import Provide, inject
from fastapi import APIRouter, Depends

from src.core.container import Container
from src.core.security import get_current_user
from src.schemas.user_schema import User, UserListResponse, UserUpdate
from src.services.user_service import UserService

router = APIRouter(
    prefix="/users",
    tags=["users"],
)

CurrentUser = Annotated[str, Depends(get_current_user)]
Service = Annotated[UserService, Depends(Provide[Container.user_service])]


@router.get("/me", response_model=User)
@inject
async def read_users_me(
    current_user: CurrentUser,
    user_service: Service,
):
    """Get the current authenticated user's profile."""
    return await user_service.sync_clerk_user(current_user)


@router.patch("/me", response_model=User)
@inject
async def update_user_me(
    user_update: UserUpdate,
    current_user: CurrentUser,
    user_service: Service,
):
    """Update the current authenticated user's profile."""
    original_user = await user_service.sync_clerk_user(current_user)
    return await user_service.patch(original_user.id, user_update)


@router.get("/", response_model=UserListResponse)
@inject
async def get_users(
    current_user: CurrentUser,
    user_service: Service,
):
    """Get all users (requires authentication)."""
    return await user_service.get_list()
