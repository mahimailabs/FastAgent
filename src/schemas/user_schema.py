from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


class UserBase(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None


class UserUpdate(UserBase):
    pass


class User(UserBase):
    id: int
    uuid: str
    clerk_id: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class UserListResponse(BaseModel):
    founds: list[User]
    search_options: dict
