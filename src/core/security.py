from typing import Annotated, Any

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer
from supabase import AsyncClient, create_async_client

from src.core.config import config

oauth2_scheme = HTTPBearer()


async def get_supabase_client() -> AsyncClient:
    if not config.SUPABASE_URL or not config.SUPABASE_KEY:
        raise RuntimeError("SUPABASE_URL and SUPABASE_KEY must be set in configuration")
    return await create_async_client(config.SUPABASE_URL, config.SUPABASE_KEY)


async def get_current_user(
    token: Annotated[Any, Depends(oauth2_scheme)],
    supabase: AsyncClient = Depends(get_supabase_client),
):
    try:
        # Supabase-py async client verification
        user = await supabase.auth.get_user(token.credentials)
        if not user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid authentication credentials",
                headers={"WWW-Authenticate": "Bearer"},
            )
        return user.user
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Could not validate credentials: {str(e)}",
            headers={"WWW-Authenticate": "Bearer"},
        )
