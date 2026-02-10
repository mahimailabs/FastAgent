from fastapi import APIRouter

router = APIRouter(prefix="/tools", tags=["tools"])


@router.post("/add")
async def addition(a: int, b: int):
    """Adds two numbers"""
    return {"result": a + b}
