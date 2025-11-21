"""
Sync API Router - endpoints для управления синхронизацией данных пользователя.
"""

from __future__ import annotations

from fastapi import APIRouter, Query

from ..services import sync_engine

router = APIRouter(prefix="/api/sync", tags=["sync"])


@router.post("/start")
async def start_sync_endpoint(
    user_id: str = Query(..., description="ID пользователя"),
    force: bool = Query(False, description="Принудительное обновление (игнорировать кеш)")
):
    """
    Запускает синхронизацию данных пользователя со всеми подключёнными банками.
    
    Синхронизация выполняется в фоне. Используйте GET /api/sync/status для проверки прогресса.
    
    Returns:
        {
            "sync_id": "uuid...",
            "status": "queued"
        }
    
    Raises:
        409 Conflict: Если синхронизация уже запущена
    """
    result = await sync_engine.start_sync(user_id, force=force)
    return result


@router.get("/status")
async def get_sync_status_endpoint(
    user_id: str = Query(..., description="ID пользователя")
):
    """
    Проверяет статус синхронизации пользователя.
    
    Frontend может опрашивать этот endpoint (polling) каждые 2-3 секунды.
    
    Returns:
        Если синхронизация запущена:
        {
            "status": "running",
            "sync_id": "uuid...",
            "locked_at": "2025-01-01T12:00:00",
            "expires_at": "2025-01-01T12:05:00"
        }
        
        Если синхронизация завершена:
        {
            "status": "completed",
            "synced_at": "2025-01-01T12:00:00"
        }
    """
    status = await sync_engine.get_sync_status(user_id)
    return status


@router.post("/full-refresh")
async def full_refresh_endpoint(
    user_id: str = Query(..., description="ID пользователя"),
    force: bool = Query(False, description="Принудительное обновление (игнорировать кеш)"),
    include_dashboard: bool = Query(True, description="Пересчитывать аналитические метрики после загрузки данных"),
):
    """
    Выполняет полный конвейер: синхронизирует все банки и сразу пересчитывает dashboard.
    """
    return await sync_engine.run_full_refresh(user_id=user_id, force=force, include_dashboard=include_dashboard)
