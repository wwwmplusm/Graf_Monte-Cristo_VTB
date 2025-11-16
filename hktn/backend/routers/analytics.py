from __future__ import annotations

from fastapi import APIRouter

from ..services import analytics

router = APIRouter(prefix="/api", tags=["analytics"])


@router.get("/dashboard")
async def get_dashboard_metrics(user_id: str):
    return await analytics.get_dashboard_metrics(user_id)
