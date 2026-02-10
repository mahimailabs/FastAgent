from fastapi import APIRouter

from src.api.v1.endpoints.auth import router as auth_router
from src.api.v1.endpoints.users import router as users_router

routers = APIRouter(prefix="/v1")

router_list = [
    users_router,
    auth_router,
]

for router in router_list:
    routers.include_router(router)
