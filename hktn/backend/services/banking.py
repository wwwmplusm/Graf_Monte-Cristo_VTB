from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager
from datetime import datetime, date
from typing import Any, Dict, List, Optional, Sequence, Tuple

from fastapi import HTTPException, status

from hktn.core.database import (
    add_bank_status_log,
    find_approved_consents,
    get_bank_data_cache,
    save_bank_data_cache,
    save_accounts,
    save_balances,
    save_transactions,
    save_credits,
)
from hktn.core.obr_client import OBRAPIClient
from hktn.core.data_models import Transaction as TxModel

from ..config import BankConfig, settings
from ..state import api_cache

logger = logging.getLogger("finpulse.backend.banking")


BALANCE_FIELDS = (
    "amount",
    "balance",
    "availableBalance",
    "currentBalance",
    "ledgerBalance",
    "available_balance",
    "current_balance",
    "clearedBalance",
    "cleared_balance",
)


def _coerce_to_float(value: Any) -> Optional[float]:
    if value is None:
        return None
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return float(value)
    if isinstance(value, str):
        try:
            normalized = value.strip().replace("\u00a0", "").replace(",", ".")
            return float(normalized)
        except ValueError:
            return None
    if isinstance(value, dict):
        for field in ("amount", "Amount", "value", "Value", "balance", "Balance", "current", "Current"):
            candidate = value.get(field)
            numeric = _coerce_to_float(candidate)
            if numeric is not None:
                return numeric
        return None
    return None


def _extract_balance_entries(payload: Any) -> List[Dict[str, Any]]:
    if isinstance(payload, dict):
        for candidate in ("balances", "items", "data", "accountBalances"):
            section = payload.get(candidate)
            if isinstance(section, list):
                return section
        if isinstance(payload.get("data"), dict):
            nested = payload["data"].get("balances")
            if isinstance(nested, list):
                return nested
    if isinstance(payload, list):
        return payload
    return []


def _normalize_balance_entry(entry: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    if not isinstance(entry, dict):
        return None

    amount = None
    normalized_keys = {key.lower(): key for key in entry.keys()}
    for field in BALANCE_FIELDS:
        candidate_key = normalized_keys.get(field.lower())
        if candidate_key:
            amount = _coerce_to_float(entry[candidate_key])
            if amount is not None:
                break
    if amount is None and "balanceAmount" in entry and isinstance(entry["balanceAmount"], dict):
        amount = _coerce_to_float(entry["balanceAmount"].get("amount"))
    if amount is None and "BalanceAmount" in entry and isinstance(entry["BalanceAmount"], dict):
        amount = _coerce_to_float(entry["BalanceAmount"].get("Amount") or entry["BalanceAmount"].get("amount"))

    if amount is None:
        return None

    account_id = (
        entry.get("accountId")
        or entry.get("account_id")
        or entry.get("resource_id")
        or entry.get("id")
    )

    return {
        "bank_id": entry.get("bank_id") or entry.get("bankId"),
        "account_id": account_id,
        "amount": amount,
        "currency": entry.get("currency") or entry.get("currency_code"),
    }


def _sum_balance_amounts(entries: List[Dict[str, Any]]) -> float:
    total = 0.0
    for entry in entries:
        normalized = _normalize_balance_entry(entry)
        if normalized and normalized.get("amount") is not None:
            total += normalized["amount"]
    return round(total, 2)


def _tx_to_dict(tx: Any) -> Optional[Dict[str, Any]]:
    """Normalize Transaction-like objects to plain dicts."""
    if isinstance(tx, TxModel):
        return tx.model_dump()
    if hasattr(tx, "model_dump"):
        try:
            return tx.model_dump()
        except Exception:  # noqa: BLE001
            pass
    if hasattr(tx, "dict"):
        try:
            return tx.dict()
        except Exception:  # noqa: BLE001
            pass
    if isinstance(tx, dict):
        tx_dict = tx
    else:
        return None

    booking_date = tx_dict.get("bookingDate")
    if isinstance(booking_date, (datetime, date)):
        tx_dict["bookingDate"] = booking_date.isoformat()
    return tx_dict
    return None


def _transactions_by_account(transactions: Sequence[Any]) -> Dict[str, List[Dict[str, Any]]]:
    """Group transactions by account to simplify DB persistence."""
    grouped: Dict[str, List[Dict[str, Any]]] = {}
    for tx in transactions or []:
        tx_dict = _tx_to_dict(tx)
        if not tx_dict:
            continue
        account_id = (
            tx_dict.get("accountId")
            or tx_dict.get("account_id")
            or tx_dict.get("debtorAccount")
            or "unknown"
        )
        grouped.setdefault(str(account_id), []).append(tx_dict)
    return grouped


def _ensure_team_credentials() -> Tuple[str, str]:
    if not settings.team_client_id or not settings.team_client_secret:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Server is missing TEAM credentials.",
        )
    return settings.team_client_id, settings.team_client_secret


def _require_bank(bank_id: str, require_url: bool = True) -> BankConfig:
    config = settings.banks.get(bank_id)
    if not config:
        raise HTTPException(status_code=404, detail=f"Bank '{bank_id}' is not supported.")
    if require_url and not config.url:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Bank endpoint URL is not configured.",
        )
    return config


def get_bank_config(bank_id: str, require_url: bool = False) -> BankConfig:
    """Return bank configuration ensuring it exists."""
    return _require_bank(bank_id, require_url=require_url)


@asynccontextmanager
async def bank_client(bank_id: str):
    config = _require_bank(bank_id, require_url=True)
    client_id, client_secret = _ensure_team_credentials()
    client = OBRAPIClient(
        api_base_url=config.url,
        team_client_id=client_id,
        team_client_secret=client_secret,
        bank_id=bank_id,
    )
    try:
        yield client
    finally:
        await client.close()


def list_banks(user_id: Optional[str] = None) -> Dict[str, List[Dict[str, Any]]]:
    connected_bank_ids = set()
    if user_id:
        connected_bank_ids = {
            consent.bank_id for consent in find_approved_consents(user_id, consent_type="accounts")
        }

    banks = []
    for bank_id, config in settings.banks.items():
        entry: Dict[str, Any] = {
            "id": bank_id,
            "name": config.display_name,
            "connected": bank_id in connected_bank_ids,
            "baseUrl": config.url,
            "status": "configured" if config.url else "missing_url",
        }
        if not config.url:
            entry["error"] = "Bank endpoint URL is not configured."
        banks.append(entry)
    return {"banks": banks}


async def fetch_bank_data_with_consent(bank_id: str, consent_id: str, user_id: str) -> Dict[str, Any]:
    cache_key = f"{user_id}:{bank_id}:{consent_id}"
    if cache_key in api_cache:
        logger.info("Serving data from cache for bank %s", bank_id)
        return api_cache[cache_key]

    _require_bank(bank_id)
    async with bank_client(bank_id) as client:
        try:
            transactions = await client.fetch_transactions_with_consent(user_id, consent_id)
            message = f"Fetched {len(transactions)} transactions"
            result = {
                "bank_id": bank_id,
                "status": "ok",
                "transactions": transactions,
                "message": message,
            }
            api_cache[cache_key] = result
            add_bank_status_log(user_id, bank_id, "fetch_transactions", "ok", message)
            return result
        except Exception as exc:  # noqa: BLE001
            error_message = str(exc)
            logger.error("Failed to fetch data for bank %s: %s", bank_id, error_message)
            add_bank_status_log(user_id, bank_id, "fetch_transactions", "error", error_message)
            return {"bank_id": bank_id, "status": "error", "transactions": [], "message": error_message}


async def fetch_bank_credits(
    bank_id: str,
    consent_id: str,
    user_id: str,
    user_name: Optional[str] = None,
    create_product_consent: bool = True,  # ИЗМЕНЕНО: по умолчанию True
) -> Dict[str, Any]:
    """
    Получает кредиты с использованием product consent.
    Сначала ищет существующий product consent в БД, если нет - создаёт новый.
    """
    from hktn.core.database import find_consent_by_type, save_consent
    
    _require_bank(bank_id)
    async with bank_client(bank_id) as client:
        try:
            # 1. Ищем существующий product consent в БД
            product_consent = find_consent_by_type(user_id, bank_id, "products")
            
            if product_consent:
                prod_consent_id = product_consent.consent_id
                logger.info(
                    "Using existing product consent %s for user %s bank %s",
                    prod_consent_id,
                    user_id,
                    bank_id
                )
            elif create_product_consent:
                # 2. Создаём новый product consent
                logger.info("Creating new product consent for user %s bank %s", user_id, bank_id)
                prod_consent_meta = await client.initiate_product_consent(user_id, user_display_name=user_name)
                
                if prod_consent_meta and prod_consent_meta.consent_id:
                    prod_consent_id = prod_consent_meta.consent_id
                    
                    # 3. Сохраняем в БД
                    save_consent(
                        user_id=user_id,
                        bank_id=bank_id,
                        consent_id=prod_consent_id,
                        status="APPROVED" if prod_consent_meta.auto_approved else "PENDING",
                        request_id=prod_consent_meta.request_id,
                        approval_url=prod_consent_meta.approval_url,
                        consent_type="products"
                    )
                    logger.info("Product consent %s saved to DB", prod_consent_id)
                else:
                    # Fallback: пробуем с account consent
                    logger.warning("Could not create product consent, trying with account consent")
                    prod_consent_id = consent_id
            else:
                # Используем account consent как fallback
                prod_consent_id = consent_id

            credits = await client.fetch_credits_with_consent(user_id, prod_consent_id)
            for credit in credits or []:
                if isinstance(credit, dict):
                    credit.setdefault("bank_id", bank_id)
                    credit.setdefault("bank_name", settings.banks[bank_id].display_name)
            message = f"Fetched {len(credits)} credits"
            add_bank_status_log(user_id, bank_id, "fetch_credits", "ok", message)
            return {
                "bank_id": bank_id,
                "status": "ok",
                "credits": credits,
                "message": message,
            }
        except Exception as exc:  # noqa: BLE001
            error_message = str(exc)
            logger.error("Failed to fetch credits for bank %s: %s", bank_id, error_message)
            add_bank_status_log(user_id, bank_id, "fetch_credits", "error", error_message)
            return {"bank_id": bank_id, "status": "error", "credits": [], "message": error_message}


async def fetch_bank_accounts_with_consent(bank_id: str, consent_id: str, user_id: str) -> Dict[str, Any]:
    _require_bank(bank_id)
    async with bank_client(bank_id) as client:
        try:
            accounts = await client.fetch_accounts_with_consent(user_id, consent_id)
            for account in accounts or []:
                if isinstance(account, dict):
                    account.setdefault("bank_id", bank_id)
                    account.setdefault("bank_name", settings.banks[bank_id].display_name)
            message = f"Fetched {len(accounts)} accounts"
            add_bank_status_log(user_id, bank_id, "fetch_accounts", "ok", message)
            return {
                "bank_id": bank_id,
                "status": "ok",
                "accounts": accounts,
                "message": message,
            }
        except Exception as exc:  # noqa: BLE001
            error_message = str(exc)
            logger.error("Failed to fetch accounts for bank %s: %s", bank_id, error_message)
            add_bank_status_log(user_id, bank_id, "fetch_accounts", "error", error_message)
            return {"bank_id": bank_id, "status": "error", "accounts": [], "message": error_message}


async def fetch_bank_balances_with_consent(bank_id: str, consent_id: str, user_id: str) -> Dict[str, Any]:
    _require_bank(bank_id)
    async with bank_client(bank_id) as client:
        try:
            balances_data = await client.fetch_balances_with_consent(user_id, consent_id)
            entries = balances_data.get("balances", [])
            message = f"Fetched {len(entries)} balance records"
            add_bank_status_log(user_id, bank_id, "fetch_balances", "ok", message)
            return {
                "bank_id": bank_id,
                "status": "ok",
                "balances": entries,
                "message": message,
            }
        except Exception as exc:  # noqa: BLE001
            error_message = str(exc)
            logger.error("Failed to fetch balances for bank %s: %s", bank_id, error_message)
            add_bank_status_log(user_id, bank_id, "fetch_balances", "error", error_message)
            return {"bank_id": bank_id, "status": "error", "balances": [], "message": error_message}


async def bootstrap_bank(bank_id: str, user_id: str, use_cache: bool = True, persist: bool = True) -> Dict[str, Any]:
    """Aggregate initial payload for a connected bank."""
    # Check cache first if requested
    if use_cache:
        cached_accounts = get_bank_data_cache(user_id, bank_id, "accounts")
        cached_balances = get_bank_data_cache(user_id, bank_id, "balances")
        cached_transactions = get_bank_data_cache(user_id, bank_id, "transactions")
        cached_credits = get_bank_data_cache(user_id, bank_id, "credits")
        
        if all([cached_accounts, cached_balances, cached_transactions, cached_credits]):
            logger.info(f"Serving bank {bank_id} data from cache for user {user_id}")
            return {
                "bank_id": bank_id,
                "user_id": user_id,
                "accounts": cached_accounts["data"].get("accounts", []),
                "balances": cached_balances["data"].get("balances", []),
                "transactions": cached_transactions["data"].get("transactions", [])[:100],
                "credits": cached_credits["data"].get("credits", []),
                "status": {
                    "accounts": cached_accounts["data"].get("status_info", {"state": "ok"}),
                    "balances": cached_balances["data"].get("status_info", {"state": "ok"}),
                    "transactions": cached_transactions["data"].get("status_info", {"state": "ok"}),
                    "credits": cached_credits["data"].get("status_info", {"state": "ok"}),
                },
                "fetched_at": cached_accounts["fetched_at"],
                "from_cache": True,
            }
    
    config = _require_bank(bank_id)
    if not config.url:
        message = "Bank endpoint URL is not configured."
        add_bank_status_log(user_id, bank_id, "bootstrap", "error", message)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=message,
        )

    approved_consents = find_approved_consents(user_id, consent_type="accounts")
    consent = next((entry for entry in approved_consents if entry.bank_id == bank_id), None)
    if not consent:
        message = "No approved consents found."
        add_bank_status_log(user_id, bank_id, "bootstrap", "error", message)
        raise HTTPException(status_code=status.HTTP_424_FAILED_DEPENDENCY, detail=message)

    accounts_task = fetch_bank_accounts_with_consent(bank_id, consent.consent_id, user_id)
    transactions_task = fetch_bank_data_with_consent(bank_id, consent.consent_id, user_id)
    credits_task = fetch_bank_credits(bank_id, consent.consent_id, user_id)
    balances_task = fetch_bank_balances_with_consent(bank_id, consent.consent_id, user_id)

    accounts_res, transactions_res, credits_res, balances_res = await asyncio.gather(
        accounts_task,
        transactions_task,
        credits_task,
        balances_task,
    )

    transactions_payload = [
        tx_dict
        for tx_dict in (_tx_to_dict(tx) for tx in transactions_res.get("transactions") or [])
        if tx_dict
    ]
    transactions_snapshot = transactions_payload[:100]
    status_block = {
        "accounts": {
            "state": accounts_res.get("status"),
            "message": accounts_res.get("message"),
        },
        "transactions": {
            "state": transactions_res.get("status"),
            "message": transactions_res.get("message"),
        },
        "credits": {
            "state": credits_res.get("status"),
            "message": credits_res.get("message"),
        },
        "balances": {
            "state": balances_res.get("status"),
            "message": balances_res.get("message"),
        },
    }

    if persist:
        try:
            accounts_payload = accounts_res.get("accounts") or []
            balances_payload = balances_res.get("balances") or []
            credits_payload = credits_res.get("credits") or []

            save_accounts(user_id, bank_id, accounts_payload)

            for balance in balances_payload:
                account_id = (
                    balance.get("accountId")
                    or balance.get("account_id")
                    or balance.get("resource_id")
                    or "unknown"
                )
                save_balances(user_id, bank_id, account_id, [balance])

            grouped_txs = _transactions_by_account(transactions_payload)
            for account_id, tx_list in grouped_txs.items():
                save_transactions(user_id, bank_id, account_id, tx_list)

            save_credits(user_id, bank_id, credits_payload)
            logger.info(
                "Persisted bootstrap snapshot for user %s bank %s (accounts=%d, balances=%d, tx_groups=%d, credits=%d)",
                user_id,
                bank_id,
                len(accounts_payload),
                len(balances_payload),
                len(grouped_txs),
                len(credits_payload),
            )
        except Exception as exc:  # noqa: BLE001
            logger.warning("Failed to persist bootstrap payload for %s@%s: %s", user_id, bank_id, exc)

    # Save to cache
    fetched_at = datetime.utcnow().isoformat()
    save_bank_data_cache(user_id, bank_id, "accounts", {
        "accounts": accounts_res.get("accounts") or [],
        "status_info": status_block["accounts"]
    })
    save_bank_data_cache(user_id, bank_id, "balances", {
        "balances": balances_res.get("balances") or [],
        "status_info": status_block["balances"]
    })
    save_bank_data_cache(user_id, bank_id, "transactions", {
        "transactions": transactions_payload,
        "status_info": status_block["transactions"]
    })
    save_bank_data_cache(user_id, bank_id, "credits", {
        "credits": credits_res.get("credits") or [],
        "status_info": status_block["credits"]
    })
    
    result = {
        "bank_id": bank_id,
        "user_id": user_id,
        "baseUrl": config.url,
        "accounts": accounts_res.get("accounts") or [],
        "credits": credits_res.get("credits") or [],
        "transactions": transactions_snapshot,
        "status": status_block,
        "balances": balances_res.get("balances") or [],
        "fetched_at": fetched_at,
        "from_cache": False,
    }
    add_bank_status_log(user_id, bank_id, "bootstrap", "ok", "Bootstrap payload generated.")
    return result
