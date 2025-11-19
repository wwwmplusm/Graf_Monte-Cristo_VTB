from __future__ import annotations

import logging
import uuid
from typing import Any, Dict

from fastapi import HTTPException

from hktn.core.database import get_user_consents

from ..schemas import OnboardingStartRequest, OnboardingStatusResponse, OnboardingFinalizeRequest

logger = logging.getLogger("finpulse.backend.onboarding")


async def start_onboarding(req: OnboardingStartRequest) -> Dict[str, Any]:
    """Начинает онбординг для пользователя."""
    onboarding_id = str(uuid.uuid4())
    
    logger.info("Starting onboarding for user %s (onboarding_id=%s)", req.user_id, onboarding_id)
    
    # Сохраняем user_id и user_name (можно использовать user_profiles таблицу)
    # Для простоты используем onboarding_id как ключ
    
    return {
        "onboarding_id": onboarding_id,
        "user_id": req.user_id,
        "user_name": req.user_name,
        "status": "started",
    }


async def get_onboarding_status(onboarding_id: str) -> OnboardingStatusResponse:
    """Возвращает статус онбординга."""
    # Извлекаем user_id из onboarding_id (в реальной реализации нужно хранить маппинг)
    # Для упрощения используем формат: onboarding_id = user_id или храним в БД
    
    # Парсим user_id из onboarding_id (временное решение)
    # В реальной реализации нужно хранить onboarding_id -> user_id в БД
    user_id = onboarding_id  # Placeholder - в реальности нужна таблица маппинга
    
    # Получаем все consents пользователя
    consents = get_user_consents(user_id)
    
    # Группируем по bank_id и consent_type
    consents_status: Dict[str, Dict[str, str]] = {}
    for consent in consents:
        bank_id = consent.get("bank_id")
        consent_type = consent.get("consent_type", "accounts")
        status = consent.get("status", "unknown")
        
        if bank_id not in consents_status:
            consents_status[bank_id] = {}
        
        consents_status[bank_id][consent_type] = status
    
    # Определяем текущий шаг и завершенные шаги
    # Шаг 1: User info (всегда завершен если есть onboarding_id)
    # Шаг 2: Banks and consents (завершен если есть хотя бы один consent)
    # Шаг 3: Products (завершен если есть product consents)
    # Шаг 4: Goals (завершен если есть user_profile с goal)
    
    completed_steps = [1]  # User info всегда завершен
    current_step = 2
    
    if consents:
        completed_steps.append(2)  # Banks and consents завершен
        current_step = 3
        
        # Проверяем наличие product consents
        has_product_consents = any(
            c.get("consent_type") == "products" for c in consents
        )
        if has_product_consents:
            completed_steps.append(3)  # Products завершен
            current_step = 4
    
    return OnboardingStatusResponse(
        onboarding_id=onboarding_id,
        current_step=current_step,
        completed_steps=completed_steps,
        consents_status=consents_status,
    )


async def finalize_onboarding(req: OnboardingFinalizeRequest) -> Dict[str, Any]:
    """Завершает онбординг."""
    user_id = req.user_id
    
    logger.info("Finalizing onboarding for user %s (onboarding_id=%s)", user_id, req.onboarding_id)
    
    # Проверяем что все consents approved
    consents = get_user_consents(user_id)
    approved_consents = [c for c in consents if c.get("status") == "APPROVED"]
    
    if not approved_consents:
        raise HTTPException(
            status_code=400,
            detail="No approved consents found. Cannot finalize onboarding.",
        )
    
    # Проверяем наличие обязательного account consent
    account_consents = [c for c in approved_consents if c.get("consent_type") == "accounts"]
    if not account_consents:
        raise HTTPException(
            status_code=400,
            detail="No approved account consents found. Cannot finalize onboarding.",
        )
    
    # Запускаем первую синхронизацию данных (можно вызвать bootstrap endpoint)
    logger.info("Onboarding finalized for user %s. Ready to use.", user_id)
    
    return {
        "onboarding_id": req.onboarding_id,
        "user_id": user_id,
        "status": "completed",
        "ready": True,
        "approved_consents_count": len(approved_consents),
    }

