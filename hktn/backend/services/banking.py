from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager
from typing import Any, Dict, List, Optional, Sequence, Tuple

from fastapi import HTTPException, status

from core.database import add_bank_status_log, find_approved_consents
from core.obr_client import OBRAPIClient

from ..config import BankConfig, settings
from ..state import api_cache

logger = logging.getLogger("finpulse.backend.banking")


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
    )
    try:
        yield client
    finally:
        await client.close()


def list_banks(user_id: Optional[str] = None) -> Dict[str, List[Dict[str, Any]]]:
    connected_bank_ids = set()
    if user_id:
        connected_bank_ids = {bank_id for bank_id, _ in find_approved_consents(user_id)}

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
    create_product_consent: bool = False,
) -> Dict[str, Any]:
    _require_bank(bank_id)
    async with bank_client(bank_id) as client:
        try:
            prod_consent_id = consent_id
            if create_product_consent:
                prod_consent_meta = await client.initiate_product_consent(user_id, user_display_name=user_name)
                if prod_consent_meta and prod_consent_meta.consent_id:
                    prod_consent_id = prod_consent_meta.consent_id

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


async def bootstrap_bank(bank_id: str, user_id: str) -> Dict[str, Any]:
    """Aggregate initial payload for a connected bank."""
    config = _require_bank(bank_id)
    if not config.url:
        message = "Bank endpoint URL is not configured."
        add_bank_status_log(user_id, bank_id, "bootstrap", "error", message)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=message,
        )

    approved_consents = find_approved_consents(user_id)
    consent_id = next((consent for bid, consent in approved_consents if bid == bank_id), None)
    if not consent_id:
        message = "No approved consents found."
        add_bank_status_log(user_id, bank_id, "bootstrap", "error", message)
        raise HTTPException(status_code=status.HTTP_424_FAILED_DEPENDENCY, detail=message)

    accounts_task = fetch_bank_accounts_with_consent(bank_id, consent_id, user_id)
    transactions_task = fetch_bank_data_with_consent(bank_id, consent_id, user_id)
    credits_task = fetch_bank_credits(bank_id, consent_id, user_id)

    accounts_res, transactions_res, credits_res = await asyncio.gather(
        accounts_task,
        transactions_task,
        credits_task,
    )

    transactions_snapshot = list(transactions_res.get("transactions") or [])[:100]
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
    }

    result = {
        "bank_id": bank_id,
        "user_id": user_id,
        "baseUrl": config.url,
        "accounts": accounts_res.get("accounts") or [],
        "credits": credits_res.get("credits") or [],
        "transactions": transactions_snapshot,
        "status": status_block,
    }
    add_bank_status_log(user_id, bank_id, "bootstrap", "ok", "Bootstrap payload generated.")
    return result
