from fastapi import APIRouter, Query
from fastapi.responses import HTMLResponse
from typing import List

router = APIRouter()


@router.get('/perform',)
async def perform_any_action():
    # Perform any action here
    ...
    return {
        "message": "Action performed successfully."
    }
