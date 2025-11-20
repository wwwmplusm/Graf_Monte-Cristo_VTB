from __future__ import annotations

from fastapi import APIRouter, HTTPException

from ..schemas import (
    OnboardingStartRequest,
    OnboardingStatusResponse,
    OnboardingFinalizeRequest,
    OnboardingConsentsRequest,
)
from ..services import onboarding, consents

router = APIRouter(prefix="/api", tags=["onboarding"])


@router.post("/onboarding/start")
async def start_onboarding(req: OnboardingStartRequest):
    """Начинает онбординг для пользователя."""
    return await onboarding.start_onboarding(req)


@router.get("/onboarding/status")
async def get_onboarding_status(onboarding_id: str):
    """Возвращает статус онбординга."""
    return await onboarding.get_onboarding_status(onboarding_id)


@router.post("/onboarding/finalize")
async def finalize_onboarding(req: OnboardingFinalizeRequest):
    """Завершает онбординг."""
    return await onboarding.finalize_onboarding(req)


@router.post("/onboarding/consents")
async def create_all_consents(req: OnboardingConsentsRequest):
    """Создает все необходимые consents для выбранных банков."""
    return await consents.create_multiple_consents(req)


@router.get("/onboarding/consents/status")
async def get_consents_status(user_id: str):
    """Возвращает текущий статус всех согласий пользователя."""
    return await consents.get_consents_status(user_id)

