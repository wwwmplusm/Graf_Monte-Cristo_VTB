from __future__ import annotations

import asyncio
import logging
from datetime import date, datetime, timedelta
from typing import Dict, List, Optional

from fastapi import HTTPException, status

from hktn.core.database import StoredConsent, find_approved_consents, get_user_financial_inputs

from ..config import settings
from .banking import _sum_balance_amounts, fetch_bank_balances_with_consent

logger = logging.getLogger("finpulse.backend.analytics")


def _require_consents(user_id: str) -> List[StoredConsent]:
    consents = find_approved_consents(user_id, consent_type="accounts")
    if not consents:
        raise HTTPException(
            status_code=status.HTTP_424_FAILED_DEPENDENCY,
            detail="No approved consents found.",
        )
    return list(consents)


def _parse_iso_date(value: Optional[str]) -> Optional[date]:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value).date()
    except ValueError:
        return None


def _future_date_or_fallback(raw_value: Optional[str], fallback_days: int) -> date:
    parsed = _parse_iso_date(raw_value)
    today = date.today()
    if parsed and parsed > today:
        return parsed
    return today + timedelta(days=max(fallback_days, 1))


def _load_financial_inputs(user_id: str) -> Dict[str, object]:
    payload = get_user_financial_inputs(user_id) or {}
    salary_amount = float(payload.get("salary_amount") or settings.default_salary_amount or 0.0)
    salary_date = _future_date_or_fallback(payload.get("next_salary_date"), settings.default_next_salary_days)
    credit_amount = float(payload.get("credit_payment_amount") or settings.default_credit_payment_amount or 0.0)
    credit_date = _future_date_or_fallback(payload.get("credit_payment_date"), settings.default_credit_payment_days)
    return {
        "salary_amount": salary_amount,
        "salary_date": salary_date,
        "credit_payment_amount": credit_amount,
        "credit_payment_date": credit_date,
    }


def _calculate_safe_to_spend(
    balance: float,
    salary_amount: float,
    salary_date: date,
    credit_payment_amount: float,
    credit_payment_date: date,
) -> Dict[str, object]:
    today = date.today()
    if salary_date <= today:
        salary_date = today + timedelta(days=max(settings.default_next_salary_days, 1))
    days_until_salary = max((salary_date - today).days, 1)

    credit_obligation = 0.0
    if credit_payment_amount and credit_payment_date and credit_payment_date <= salary_date:
        credit_obligation = credit_payment_amount

    safe_total = balance + salary_amount - credit_obligation
    safe_daily = max(0.0, round(safe_total / days_until_salary, 2))
    return {"value": safe_daily, "days": days_until_salary}


async def get_dashboard_metrics(user_id: str) -> Dict[str, object]:
    consents = _require_consents(user_id)
    balance_tasks = [
        fetch_bank_balances_with_consent(consent.bank_id, consent.consent_id, user_id)
        for consent in consents
    ]
    balance_results = await asyncio.gather(*balance_tasks)

    total_balance = 0.0
    fetched_at = datetime.utcnow().isoformat()
    bank_statuses: List[Dict[str, object]] = []

    for consent, result in zip(consents, balance_results):
        config = settings.banks.get(consent.bank_id)
        bank_name = config.display_name if config else consent.bank_id
        entry = {
            "bank_id": consent.bank_id,
            "bank_name": bank_name,
            "status": result.get("status", "error"),
            "fetched_at": None,
        }
        if result.get("status") == "ok":
            total_balance += _sum_balance_amounts(result.get("balances") or [])
            entry["fetched_at"] = fetched_at
        bank_statuses.append(entry)

    financial_inputs = _load_financial_inputs(user_id)
    safe = _calculate_safe_to_spend(
        balance=total_balance,
        salary_amount=financial_inputs["salary_amount"],
        salary_date=financial_inputs["salary_date"],
        credit_payment_amount=financial_inputs["credit_payment_amount"],
        credit_payment_date=financial_inputs["credit_payment_date"],
    )

    logger.info(
        "Dashboard payload for %s generated (balance=%.2f, sts=%.2f)",
        user_id,
        total_balance,
        safe["value"],
    )

    return {
        "total_balance": round(total_balance, 2),
        "bank_statuses": bank_statuses,
        "safe_to_spend_daily": safe["value"],
        "salary_amount": round(financial_inputs["salary_amount"], 2),
        "next_salary_date": financial_inputs["salary_date"].isoformat(),
        "days_until_next_salary": safe["days"],
        "upcoming_credit_payment": {
            "amount": round(financial_inputs["credit_payment_amount"], 2),
            "next_payment_date": financial_inputs["credit_payment_date"].isoformat(),
        },
    }
