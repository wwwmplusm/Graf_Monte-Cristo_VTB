from __future__ import annotations

from fastapi import APIRouter

from ..schemas import IntegrationStatusResponse
from ..services import analytics

router = APIRouter(prefix="/api", tags=["analytics"])


@router.get("/dashboard")
async def get_dashboard_metrics(user_id: str, force_refresh: bool = False):
    """
    Получает dashboard метрики.
    
    Query params:
        user_id: ID пользователя
        force_refresh: Принудительно обновить данные (игнорировать кеш)
    """
    dashboard_data = await analytics.get_dashboard_metrics(user_id, force_refresh=force_refresh)
    
    # Добавляем информацию о свежести
    cache_info = analytics.get_dashboard_cache_info(user_id)
    
    if cache_info:
        dashboard_data["cache_info"] = {
            "is_cached": True,
            "calculated_at": cache_info["calculated_at"],
            "age_minutes": cache_info["age_minutes"],
        }
    else:
        dashboard_data["cache_info"] = {
            "is_cached": False,
            "calculated_at": None,
            "age_minutes": None,
        }
    
    return dashboard_data


@router.get("/integration-status", response_model=IntegrationStatusResponse)
async def get_integration_status(user_id: str):
    return await analytics.get_integration_status(user_id)
