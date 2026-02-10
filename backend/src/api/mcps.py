from fastapi import APIRouter

from src.api.v1.mcp.tools import router as tools_router

router = APIRouter(prefix="/v1")

router.include_router(tools_router)
