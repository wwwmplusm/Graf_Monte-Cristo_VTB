from __future__ import annotations

from fastapi import APIRouter

from ..schemas import IntegrationStatusResponse
from ..services import analytics

router = APIRouter(prefix="/api", tags=["analytics"])


@router.get("/dashboard")
async def get_dashboard_metrics(user_id: str):
    return await analytics.get_dashboard_metrics(user_id)


@router.get("/integration-status", response_model=IntegrationStatusResponse)
async def get_integration_status(user_id: str):
    return await analytics.get_integration_status(user_id)
