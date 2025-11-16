from __future__ import annotations

import asyncio
import logging
from datetime import date, datetime, timedelta
from typing import Any, Dict, List, Optional, Sequence, Tuple

from fastapi import HTTPException, status

from hktn.core.database import StoredConsent, find_approved_consents, get_user_financial_inputs

from ..config import settings
from ..schemas import IntegrationStatusResponse
from .banking import (
    _coerce_to_float,
    _normalize_balance_entry,
    _sum_balance_amounts,
    fetch_bank_accounts_with_consent,
    fetch_bank_balances_with_consent,
    fetch_bank_credits,
)

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


BALANCE_CURRENCY_WHITELIST = {"RUB", "RUR"}
CREDIT_AMOUNT_FIELDS = (
    "amount",
    "currentBalance",
    "outstandingBalance",
    "balance",
    "debtAmount",
    "principal",
    "availableBalance",
    "ledgerBalance",
)


def _is_rub_currency(value: Optional[str]) -> bool:
    if not value:
        return True
    normalized = value.strip().upper()
    return normalized in BALANCE_CURRENCY_WHITELIST


def _message_implies_access_issue(message: Optional[str]) -> bool:
    if not message:
        return False
    lower = message.lower()
    indicators = ["permission", "scope", "readbalances", "readaccounts", "readproduct", "forbidden", "401", "403"]
    return any(keyword in lower for keyword in indicators)


def _derive_step_status(result_status: Optional[str], data_count: int, message: Optional[str]) -> str:
    normalized = (result_status or "").lower()
    if normalized == "ok":
        return "ok" if data_count > 0 else "no_data"
    if _message_implies_access_issue(message):
        return "no_access"
    return "error"


def _resolve_pipeline_status(step_statuses: List[str]) -> str:
    if any(status == "error" for status in step_statuses):
        return "error"
    if any(status in {"no_data", "no_access"} for status in step_statuses):
        return "partial"
    return "ok"


def _build_step_entry(name: str, status: str, details: str, message: Optional[str]) -> Dict[str, Any]:
    error_code = message if status in {"error", "no_access"} and message else None
    return {"name": name, "status": status, "details": details, "error_code": error_code}


def _sum_rub_balances(entries: Sequence[Any]) -> Tuple[float, bool]:
    """
    Expecting `/accounts/{account_id}/balances` to return `data.Balance[]` (Open Banking v3.1).
    Each entry should include `amount` / `currentBalance` / `availableBalance` + `currency`.
    Adjust this parser if banks send the payload under a different name.
    """
    total = 0.0
    found = False
    for entry in entries or []:
        normalized = _normalize_balance_entry(entry)
        if not normalized:
            continue
        currency = normalized.get("currency")
        if not _is_rub_currency(currency):
            continue
        amount = normalized.get("amount")
        if amount is None:
            continue
        if amount > 0:
            total += amount
        found = True
    return round(total, 2), found


def _sum_credit_debts(entries: Sequence[Any]) -> float:
    """
    Open banking `/product-agreements` or `/credits` often include fields like
    `currentBalance`, `outstandingBalance`, `amount` or `principal`. We sum positive RUB values here.
    """
    total = 0.0
    for entry in entries or []:
        if not isinstance(entry, dict):
            continue
        amount = None
        for field in CREDIT_AMOUNT_FIELDS:
            if field in entry:
                amount = _coerce_to_float(entry[field])
                if amount is not None:
                    break
        if amount is None:
            continue
        currency_field = entry.get("currency") or entry.get("currency_code")
        if not _is_rub_currency(currency_field):
            continue
        total += abs(amount)
    return round(total, 2)


async def _collect_bank_status(
    consent: StoredConsent,
    user_id: str,
) -> Tuple[Dict[str, Any], float, float, bool, bool]:
    accounts_task = fetch_bank_accounts_with_consent(consent.bank_id, consent.consent_id, user_id)
    balances_task = fetch_bank_balances_with_consent(consent.bank_id, consent.consent_id, user_id)
    credits_task = fetch_bank_credits(consent.bank_id, consent.consent_id, user_id)

    accounts_res, balances_res, credits_res = await asyncio.gather(
        accounts_task,
        balances_task,
        credits_task,
    )

    accounts = accounts_res.get("accounts") or []
    balances = balances_res.get("balances") or []
    credits = credits_res.get("credits") or []

    sum_balances, has_balance_data = _sum_rub_balances(balances)
    sum_credits = _sum_credit_debts(credits)
    has_credit_data = bool(credits)

    accounts_status = _derive_step_status(
        accounts_res.get("status"),
        len(accounts),
        accounts_res.get("message"),
    )
    balances_status = _derive_step_status(
        balances_res.get("status"),
        len(balances),
        balances_res.get("message"),
    )
    products_status = _derive_step_status(
        credits_res.get("status"),
        len(credits),
        credits_res.get("message"),
    )

    bank_config = settings.banks.get(consent.bank_id)
    bank_name = bank_config.display_name if bank_config else consent.bank_id

    steps = [
        _build_step_entry(
            "consent",
            "ok",
            f"Consent {consent.consent_id} ({consent.consent_type}) утверждён.",
            None,
        ),
        _build_step_entry(
            "accounts",
            accounts_status,
            f"Запрос `/accounts?client_id={user_id}` → ожидаем `data.accounts[]` с accountId/currency. Получено {len(accounts)} записей.",
            accounts_res.get("message"),
        ),
        _build_step_entry(
            "balances",
            balances_status,
            f"Запрос `/accounts/{{account_id}}/balances` → ожидаем `Balance[]` ({', '.join(['amount', 'currentBalance', 'availableBalance'])}) и currency. Найдено {len(balances)} записей, итого {sum_balances} RUB.",
            balances_res.get("message"),
        ),
        _build_step_entry(
            "products",
            products_status,
            f"Запрос `/product-agreements` или `/credits` → ожидаем кредитные договоры с полями `currentBalance`/`outstandingBalance`. Получено {len(credits)} записей.",
            credits_res.get("message"),
        ),
    ]

    step_statuses = [step["status"] for step in steps]
    pipeline_status = _resolve_pipeline_status(step_statuses)

    raw_metrics = {
        "sum_account_balances": sum_balances,
        "sum_credit_debts": sum_credits,
        "used_in_base_score": has_balance_data,
    }

    return (
        {
            "bank_id": consent.bank_id,
            "bank_name": bank_name,
            "pipeline_status": pipeline_status,
            "steps": steps,
            "raw_metrics": raw_metrics,
        },
        sum_balances,
        sum_credits,
        has_balance_data,
        has_credit_data,
    )


async def get_integration_status(user_id: str) -> Dict[str, Any]:
    consents = _require_consents(user_id)
    tasks = [_collect_bank_status(consent, user_id) for consent in consents]

    bank_results = await asyncio.gather(*tasks)
    banks: List[Dict[str, Any]] = []
    total_balance = 0.0
    total_credit_debt = 0.0
    balance_data_found = False
    credit_data_found = False

    for bank_payload, bank_balance, bank_credit, has_balance, has_credit in bank_results:
        banks.append(bank_payload)
        total_balance += bank_balance
        total_credit_debt += bank_credit
        balance_data_found = balance_data_found or has_balance
        credit_data_found = credit_data_found or has_credit

    if not balance_data_found:
        base_score_payload = {
            "status": "no_data",
            "value": None,
            "currency": "RUB",
            "reason": "Не удалось получить балансы по RUB счетам на стороне банков.",
        }
    else:
        base_score_value = max(0.0, round(total_balance - total_credit_debt, 2))
        reason_parts = [
            "Расчёт основан на доступных RUB остатках с `/accounts/{account_id}/balances`."
        ]
        if not credit_data_found:
            reason_parts.append(
                "Кредитная задолженность не учитывается — нет данных из `/product-agreements`."
            )
        base_score_payload = {
            "status": "ok",
            "value": base_score_value,
            "currency": "RUB",
            "reason": " ".join(reason_parts),
        }

    result_model = IntegrationStatusResponse(
        user_id=user_id,
        base_score=base_score_payload,
        banks=banks,
    )

    logger.info(
        "Integration status for %s computed (balance=%.2f, credit=%.2f)",
        user_id,
        total_balance,
        total_credit_debt,
    )

    return result_model
