from fastapi import APIRouter

from src.api.v1.mcp.tools import router as tools_router

router = APIRouter(prefix="/v1")

router_list = [
    tools_router,
]

for router in router_list:
    router.include_router(router)
