"""
Sync Engine - управление синхронизацией данных пользователя со всеми банками.

Основные функции:
- start_sync: быстрый старт синхронизации (не ждёт завершения)
- get_sync_status: проверка статуса текущей синхронизации
- _run_sync_background: фоновая синхронизация (параллельная)
"""

from __future__ import annotations

import asyncio
import logging
import uuid
from datetime import datetime, date
from enum import Enum
from typing import Any, Dict, List, Optional

from fastapi import HTTPException

from hktn.core.database import (
    StoredConsent,
    acquire_sync_lock,
    add_bank_status_log,
    find_approved_consents,
    get_bank_data_cache,
    get_sync_lock,
    invalidate_dashboard_cache,
    is_sync_locked,
    release_sync_lock,
    save_accounts,
    save_balances,
    save_bank_data_cache,
    save_credits,
    save_transactions,
)

from .banking import (
    bank_client,
    fetch_bank_accounts_with_consent,
    fetch_bank_balances_with_consent,
    fetch_bank_credits,
)

logger = logging.getLogger("finpulse.backend.sync_engine")


class SyncStatus(str, Enum):
    """Статусы синхронизации."""
    QUEUED = "queued"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


def _normalize_transaction(tx: Any) -> Optional[Dict[str, Any]]:
    """Convert Transaction models or dicts into JSON-safe dicts."""
    tx_dict: Optional[Dict[str, Any]] = None
    if hasattr(tx, "model_dump"):
        try:
            tx_dict = tx.model_dump()
        except Exception:  # noqa: BLE001
            tx_dict = None
    if tx_dict is None and hasattr(tx, "dict"):
        try:
            tx_dict = tx.dict()
        except Exception:  # noqa: BLE001
            tx_dict = None
    if tx_dict is None and isinstance(tx, dict):
        tx_dict = dict(tx)

    if not tx_dict:
        return None

    booking_date = tx_dict.get("bookingDate")
    if isinstance(booking_date, (datetime, date)):
        tx_dict["bookingDate"] = booking_date.isoformat()
    return tx_dict


def _group_transactions(transactions: List[Any]) -> Dict[str, List[Dict[str, Any]]]:
    grouped: Dict[str, List[Dict[str, Any]]] = {}
    for tx in transactions or []:
        tx_dict = _normalize_transaction(tx)
        if not tx_dict:
            continue
        account_id = tx_dict.get("accountId") or tx_dict.get("account_id") or "unknown"
        grouped.setdefault(str(account_id), []).append(tx_dict)
    return grouped


async def start_sync(user_id: str, force: bool = False) -> Dict[str, Any]:
    """
    Быстрый запуск синхронизации (не ждёт завершения).
    
    Args:
        user_id: ID пользователя
        force: Принудительное обновление (игнорировать кеш)
    
    Returns:
        {"sync_id": "...", "status": "queued"}
    
    Raises:
        HTTPException: Если синхронизация уже запущена
    """
    # 1. Проверка лока
    if is_sync_locked(user_id):
        existing_lock = get_sync_lock(user_id)
        raise HTTPException(
            status_code=409,
            detail=f"Sync already in progress (sync_id={existing_lock['sync_id']})"
        )
    
    # 2. Создание sync_id и лока
    sync_id = str(uuid.uuid4())
    if not acquire_sync_lock(user_id, sync_id, ttl_seconds=300):
        raise HTTPException(status_code=409, detail="Failed to acquire sync lock")
    
    # 3. Запуск фоновой задачи
    asyncio.create_task(_run_sync_background(user_id, sync_id, force=force))
    
    logger.info("Started sync for user %s (sync_id=%s, force=%s)", user_id, sync_id, force)
    return {"sync_id": sync_id, "status": SyncStatus.QUEUED}


async def _run_sync_background(user_id: str, sync_id: str, force: bool = False) -> None:
    """
    Фоновая синхронизация всех банков для пользователя.
    
    Args:
        user_id: ID пользователя
        sync_id: ID синхронизации
        force: Игнорировать кеш и запросить свежие данные
    """
    start_time = datetime.utcnow()
    logger.info("Background sync started for user %s (sync_id=%s)", user_id, sync_id)
    
    try:
        # Получаем все одобренные consents
        accounts_consents = find_approved_consents(user_id, consent_type="accounts")
        products_consents = find_approved_consents(user_id, consent_type="products")
        
        if not accounts_consents:
            logger.warning("No approved consents found for user %s", user_id)
            return
        
        # Создаём tasks для параллельной синхронизации
        sync_tasks = []
        for consent in accounts_consents:
            task = _sync_single_bank(user_id, consent, products_consents, force=force)
            sync_tasks.append(task)
        
        # Запускаем все синхронизации параллельно
        results = await asyncio.gather(*sync_tasks, return_exceptions=True)
        
        # Логируем результаты
        banks_synced = []
        banks_failed = []
        
        for i, result in enumerate(results):
            bank_id = accounts_consents[i].bank_id
            if isinstance(result, Exception):
                logger.error("Sync failed for bank %s: %s", bank_id, result)
                banks_failed.append({"bank_id": bank_id, "error": str(result)})
                add_bank_status_log(user_id, bank_id, "sync", "failed", str(result))
            else:
                banks_synced.append(bank_id)
                add_bank_status_log(user_id, bank_id, "sync", "success", "Data synced successfully")
        
        # Инвалидируем кеш метрик для пересчёта
        invalidate_dashboard_cache(user_id)
        
        elapsed = (datetime.utcnow() - start_time).total_seconds()
        logger.info(
            "Background sync completed for user %s (sync_id=%s, elapsed=%.2fs, synced=%d, failed=%d)",
            user_id,
            sync_id,
            elapsed,
            len(banks_synced),
            len(banks_failed)
        )
        
    except Exception as e:
        logger.exception("Fatal error in background sync for user %s (sync_id=%s): %s", user_id, sync_id, e)
        add_bank_status_log(user_id, "system", "sync", "failed", f"Fatal error: {e}")
    finally:
        # Всегда освобождаем лок
        release_sync_lock(user_id)
        logger.info("Released sync lock for user %s (sync_id=%s)", user_id, sync_id)


async def run_full_refresh(user_id: str, force: bool = False, include_dashboard: bool = True) -> Dict[str, Any]:
    """
    Синхронизирует все банки и, по желанию, сразу пересчитывает dashboard.
    Используется для демонстрации "конца в конец" (consents -> данные -> аналитика).
    """
    if is_sync_locked(user_id):
        existing_lock = get_sync_lock(user_id)
        raise HTTPException(
            status_code=409,
            detail=f"Sync already in progress (sync_id={existing_lock['sync_id']})" if existing_lock else "Sync already in progress",
        )

    sync_id = str(uuid.uuid4())
    if not acquire_sync_lock(user_id, sync_id, ttl_seconds=300):
        raise HTTPException(status_code=409, detail="Failed to acquire sync lock")

    accounts_consents = find_approved_consents(user_id, consent_type="accounts")
    products_consents = find_approved_consents(user_id, consent_type="products")

    if not accounts_consents:
        raise HTTPException(status_code=424, detail="No approved consents found.")

    results: List[Dict[str, Any]] = []
    try:
        for consent in accounts_consents:
            try:
                res = await _sync_single_bank(user_id, consent, products_consents, force=force)
                results.append({"bank_id": consent.bank_id, "status": res.get("status", "success")})
            except Exception as exc:  # noqa: BLE001
                results.append({"bank_id": consent.bank_id, "status": "error", "error": str(exc)})

        invalidate_dashboard_cache(user_id)

        dashboard = None
        if include_dashboard:
            from .analytics import get_dashboard_metrics  # Local import to avoid cycle

            dashboard = await get_dashboard_metrics(user_id, force_refresh=True)

        return {
            "user_id": user_id,
            "banks": results,
            "dashboard": dashboard,
            "forced": force,
            "sync_id": sync_id,
        }
    finally:
        release_sync_lock(user_id)


async def _sync_single_bank(
    user_id: str,
    account_consent: StoredConsent,
    products_consents: List[StoredConsent],
    force: bool = False
) -> Dict[str, Any]:
    """
    Синхронизация данных одного банка.
    
    Args:
        user_id: ID пользователя
        account_consent: Consent для счетов/транзакций
        products_consents: Список product consents (для всех банков)
        force: Игнорировать кеш
    
    Returns:
        Dict с результатами синхронизации
    """
    bank_id = account_consent.bank_id
    consent_id = account_consent.consent_id
    
    logger.info("Syncing bank %s for user %s (force=%s)", bank_id, user_id, force)
    
    # Находим product consent для этого банка
    product_consent = next(
        (c for c in products_consents if c.bank_id == bank_id),
        None
    )
    
    try:
        # Параллельно запрашиваем данные из разных endpoints
        tasks = [
            _fetch_and_save_accounts(user_id, bank_id, consent_id, force),
            _fetch_and_save_balances(user_id, bank_id, consent_id, force),
            _fetch_and_save_transactions(user_id, bank_id, consent_id, force),
        ]
        
        # Если есть product consent, добавляем запрос кредитов
        if product_consent:
            tasks.append(
                _fetch_and_save_product_agreements(
                    user_id,
                    bank_id,
                    product_consent.consent_id,
                    force
                )
            )
        
        # Выполняем параллельно
        await asyncio.gather(*tasks)
        
        logger.info("Successfully synced bank %s for user %s", bank_id, user_id)
        return {"bank_id": bank_id, "status": "success"}
        
    except Exception as e:
        logger.error("Failed to sync bank %s for user %s: %s", bank_id, user_id, e)
        raise


async def _fetch_and_save_accounts(
    user_id: str,
    bank_id: str,
    consent_id: str,
    force: bool
) -> None:
    """Получает и сохраняет счета."""
    # Проверяем кеш
    if not force:
        cached = get_bank_data_cache(user_id, bank_id, "accounts")
        if cached:
            logger.info("Using cached accounts for user %s bank %s", user_id, bank_id)
            return
    
    # Запрашиваем свежие данные
    result = await fetch_bank_accounts_with_consent(bank_id, consent_id, user_id)
    accounts = result.get("accounts", [])
    
    # Сохраняем в БД
    save_accounts(user_id, bank_id, accounts)
    
    # Обновляем кеш
    save_bank_data_cache(user_id, bank_id, "accounts", accounts)
    
    logger.info("Fetched and saved %d accounts for user %s bank %s", len(accounts), user_id, bank_id)


async def _fetch_and_save_balances(
    user_id: str,
    bank_id: str,
    consent_id: str,
    force: bool
) -> None:
    """Получает и сохраняет балансы."""
    # Проверяем кеш
    if not force:
        cached = get_bank_data_cache(user_id, bank_id, "balances")
        if cached:
            logger.info("Using cached balances for user %s bank %s", user_id, bank_id)
            return
    
    # Запрашиваем свежие данные
    result = await fetch_bank_balances_with_consent(bank_id, consent_id, user_id)
    balances = result.get("balances", [])
    
    # Сохраняем в БД (для каждого баланса нужен account_id)
    for balance in balances:
        account_id = balance.get("accountId") or balance.get("account_id") or "unknown"
        save_balances(user_id, bank_id, account_id, [balance])
    
    # Обновляем кеш
    save_bank_data_cache(user_id, bank_id, "balances", balances)
    
    logger.info("Fetched and saved balances for user %s bank %s", user_id, bank_id)


async def _fetch_and_save_transactions(
    user_id: str,
    bank_id: str,
    consent_id: str,
    force: bool,
) -> None:
    """Fetches transactions and persists them grouped by account."""
    if not force:
        cached = get_bank_data_cache(user_id, bank_id, "transactions")
        if cached and isinstance(cached.get("data"), dict):
            cached_transactions = cached["data"].get("transactions") or []
            grouped = _group_transactions(cached_transactions)
            for account_id, tx_list in grouped.items():
                save_transactions(user_id, bank_id, account_id, tx_list)
            logger.info("Using cached transactions for user %s bank %s", user_id, bank_id)
            return

    result = await fetch_bank_data_with_consent(bank_id, consent_id, user_id)
    txs = result.get("transactions") or []
    grouped = _group_transactions(txs)

    for account_id, tx_list in grouped.items():
        save_transactions(user_id, bank_id, account_id, tx_list)

    flattened: List[Dict[str, Any]] = []
    for tx_list in grouped.values():
        flattened.extend(tx_list)

    save_bank_data_cache(user_id, bank_id, "transactions", {
        "transactions": flattened,
        "status_info": {"state": result.get("status"), "message": result.get("message")},
    })

    logger.info("Fetched and saved %d transactions for user %s bank %s", len(flattened), user_id, bank_id)


async def _fetch_and_save_product_agreements(
    user_id: str,
    bank_id: str,
    product_consent_id: str,
    force: bool
) -> None:
    """
    Получает и сохраняет продуктовые соглашения (кредиты, депозиты).
    
    ВАЖНО: Делаем ОДИН запрос к /product-agreements и фильтруем локально.
    """
    # Проверяем кеш
    if not force:
        cached = get_bank_data_cache(user_id, bank_id, "products")
        if cached:
            logger.info("Using cached product agreements for user %s bank %s", user_id, bank_id)
            return
    
    # Запрашиваем все продукты одним запросом
    result = await fetch_bank_credits(
        bank_id=bank_id,
        consent_id=product_consent_id,
        user_id=user_id,
        create_product_consent=False  # Не создаём consent, используем существующий
    )
    
    all_products = result.get("credits", [])  # На самом деле это все agreements
    
    # Фильтруем локально на credits и deposits
    credits = [p for p in all_products if _is_credit_product(p)]
    deposits = [p for p in all_products if _is_deposit_product(p)]
    
    # Сохраняем кредиты
    save_credits(user_id, bank_id, credits)
    
    # Обновляем кеш (сохраняем все продукты)
    save_bank_data_cache(user_id, bank_id, "products", all_products)
    
    logger.info(
        "Fetched and saved product agreements for user %s bank %s (credits=%d, deposits=%d)",
        user_id,
        bank_id,
        len(credits),
        len(deposits)
    )


def _is_credit_product(product: Dict[str, Any]) -> bool:
    """Проверяет, является ли продукт кредитом."""
    product_type = (product.get("product_type") or "").lower()
    product_name = (product.get("product_name") or "").lower()
    return any(
        keyword in product_type or keyword in product_name
        for keyword in ["credit", "loan", "кредит", "займ"]
    )


def _is_deposit_product(product: Dict[str, Any]) -> bool:
    """Проверяет, является ли продукт депозитом."""
    product_type = (product.get("product_type") or "").lower()
    product_name = (product.get("product_name") or "").lower()
    return any(
        keyword in product_type or keyword in product_name
        for keyword in ["deposit", "вклад", "накопительный"]
    )


async def get_sync_status(user_id: str) -> Dict[str, Any]:
    """
    Проверяет статус синхронизации для пользователя.
    
    Args:
        user_id: ID пользователя
    
    Returns:
        Dict с полями:
        - status: "running" | "completed"
        - sync_id: ID текущей синхронизации (если running)
        - synced_at: Время последней синхронизации (если completed)
    """
    # Проверяем активный лок
    lock = get_sync_lock(user_id)
    if lock:
        return {
            "status": SyncStatus.RUNNING,
            "sync_id": lock["sync_id"],
            "locked_at": lock["locked_at"],
            "expires_at": lock["expires_at"]
        }
    
    # Если лока нет, синхронизация завершена
    # Берём время последней синхронизации из кеша
    last_sync_time = None
    cached_accounts = get_bank_data_cache(user_id, "vbank", "accounts")  # Берём любой банк
    if cached_accounts:
        last_sync_time = cached_accounts.get("fetched_at")
    
    return {
        "status": SyncStatus.COMPLETED,
        "synced_at": last_sync_time
    }
