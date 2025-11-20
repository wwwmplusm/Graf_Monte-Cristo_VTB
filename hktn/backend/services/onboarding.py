from __future__ import annotations

import logging
import uuid
from typing import Any, Dict

from fastapi import HTTPException

from hktn.core.database import (
    get_user_consents,
    save_onboarding_session,
    get_onboarding_session,
    update_onboarding_session_status,
    save_accounts,
    save_transactions,
    save_balances,
    save_credits,
)

from ..schemas import OnboardingStartRequest, OnboardingStatusResponse, OnboardingFinalizeRequest

logger = logging.getLogger("finpulse.backend.onboarding")


async def start_onboarding(req: OnboardingStartRequest) -> Dict[str, Any]:
    """Начинает онбординг для пользователя."""
    onboarding_id = str(uuid.uuid4())
    
    logger.info("Starting onboarding for user %s (onboarding_id=%s)", req.user_id, onboarding_id)
    
    # Сохраняем onboarding session в БД
    save_onboarding_session(
        onboarding_id=onboarding_id,
        user_id=req.user_id,
        user_name=req.user_name,
        status="started",
    )
    
    return {
        "onboarding_id": onboarding_id,
        "user_id": req.user_id,
        "user_name": req.user_name,
        "status": "started",
    }


async def get_onboarding_status(onboarding_id: str) -> OnboardingStatusResponse:
    """Возвращает статус онбординга."""
    # Получаем onboarding session из БД
    session = get_onboarding_session(onboarding_id)
    if not session:
        raise HTTPException(
            status_code=404,
            detail=f"Onboarding session {onboarding_id} not found",
        )
    
    user_id = session["user_id"]
    
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
    
    # Запускаем первую синхронизацию данных - последовательно загружаем данные из каждого банка
    from .banking import (
        fetch_bank_accounts_with_consent,
        fetch_bank_balances_with_consent,
        fetch_bank_credits,
        fetch_bank_data_with_consent,
    )
    
    bootstrap_results = []
    connected_banks = set()
    
    for consent in approved_consents:
        bank_id = consent.get("bank_id")
        if bank_id and bank_id not in connected_banks:
            connected_banks.add(bank_id)
            consent_id = consent.get("consent_id")
            
            try:
                # Последовательно загружаем данные из банка
                logger.info("Loading data from bank %s for user %s", bank_id, user_id)
                
                accounts_res = await fetch_bank_accounts_with_consent(bank_id, consent_id, user_id)
                balances_res = await fetch_bank_balances_with_consent(bank_id, consent_id, user_id)
                credits_res = await fetch_bank_credits(bank_id, consent_id, user_id)
                transactions_res = await fetch_bank_data_with_consent(bank_id, consent_id, user_id)
                
                # Сохраняем данные в БД
                accounts_list = accounts_res.get("accounts", [])
                credits_list = credits_res.get("credits", [])
                transactions_list = transactions_res.get("transactions", [])
                balances_list = balances_res.get("balances", [])
                
                if accounts_list:
                    save_accounts(user_id, bank_id, accounts_list)
                
                if credits_list:
                    save_credits(user_id, bank_id, credits_list)
                
                # Сохраняем транзакции и балансы по каждому счету
                for account in accounts_list:
                    account_id = account.get("accountId") or account.get("account_id")
                    if account_id:
                        # Сохраняем балансы для этого счета
                        account_balances = [b for b in balances_list if (b.get("accountId") or b.get("account_id")) == account_id]
                        if account_balances:
                            save_balances(user_id, bank_id, account_id, account_balances)
                        
                        # Сохраняем транзакции для этого счета
                        account_transactions = [t for t in transactions_list if hasattr(t, 'accountId') and t.accountId == account_id]
                        if account_transactions:
                            # Конвертируем Transaction объекты в dict если нужно
                            tx_dicts = []
                            for tx in account_transactions:
                                if isinstance(tx, dict):
                                    tx_dicts.append(tx)
                                else:
                                    tx_dicts.append(tx.model_dump() if hasattr(tx, 'model_dump') else dict(tx))
                            save_transactions(user_id, bank_id, account_id, tx_dicts)
                
                bootstrap_results.append({
                    "bank_id": bank_id,
                    "status": "ok",
                    "accounts_count": len(accounts_list),
                    "credits_count": len(credits_list),
                    "transactions_count": len(transactions_list),
                    "balances_count": len(balances_list),
                })
                logger.info("Successfully loaded and saved data from bank %s", bank_id)
                
            except Exception as e:
                logger.error("Failed to load data from bank %s: %s", bank_id, e)
                bootstrap_results.append({
                    "bank_id": bank_id,
                    "status": "error",
                    "error": str(e),
                })
    
    # Обновляем статус onboarding session
    update_onboarding_session_status(req.onboarding_id, "completed")
    
    logger.info("Onboarding finalized for user %s. Ready to use.", user_id)
    
    return {
        "onboarding_id": req.onboarding_id,
        "user_id": user_id,
        "status": "completed",
        "ready": True,
        "approved_consents_count": len(approved_consents),
        "bootstrap_results": bootstrap_results,
    }

