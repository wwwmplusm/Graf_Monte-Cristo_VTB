from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Any, Dict, List, Optional, Sequence, Tuple

from ..config import settings

BALANCE_FIELDS: Tuple[str, ...] = (
    "outstanding_balance",
    "outstandingBalance",
    "remaining_balance",
    "remainingBalance",
    "balance",
    "current_balance",
    "currentBalance",
    "principal",
    "principal_amount",
    "principalAmount",
    "amount",
    "available_balance",
    "availableBalance",
    "total_balance",
    "totalBalance",
)

PAYMENT_FIELDS: Tuple[str, ...] = (
    "min_payment",
    "minimum_payment",
    "payment",
    "monthly_payment",
    "monthlyPayment",
    "scheduled_payment",
    "installment_amount",
    "installmentAmount",
)

RATE_FIELDS: Tuple[str, ...] = (
    "rate",
    "interest_rate",
    "interestRate",
    "apr",
    "percentage",
    "rate_percent",
    "ratePercent",
)

DATE_FIELDS: Tuple[str, ...] = (
    "next_payment_date",
    "nextPaymentDate",
    "due_date",
    "dueDate",
    "payment_due_date",
    "paymentDueDate",
    "maturity_date",
    "maturityDate",
)


def _coerce_number(value: Any) -> Optional[float]:
    if value is None:
        return None
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return float(value)
    if isinstance(value, str):
        try:
            normalized = value.strip().replace("\u00a0", "").replace(" ", "").replace(",", ".")
            return float(normalized)
        except ValueError:
            return None
    if isinstance(value, dict):
        for nested_key in ("amount", "value", "balance", "current", "val"):
            if nested_key in value:
                nested = _coerce_number(value[nested_key])
                if nested is not None:
                    return nested
    if isinstance(value, (list, tuple)):
        for item in value:
            nested = _coerce_number(item)
            if nested is not None:
                return nested
    return None


def _extract_number(payload: Dict[str, Any], field_names: Sequence[str]) -> Optional[float]:
    for key in field_names:
        if key in payload:
            number = _coerce_number(payload[key])
            if number is not None:
                return number
    return None


def _extract_date(payload: Dict[str, Any], field_names: Sequence[str]) -> Optional[str]:
    for key in field_names:
        raw_value = payload.get(key)
        if not raw_value:
            continue
        if isinstance(raw_value, datetime):
            return raw_value.date().isoformat()
        if isinstance(raw_value, date):
            return raw_value.isoformat()
        if isinstance(raw_value, str):
            try:
                normalized = raw_value.replace("Z", "")
                return datetime.fromisoformat(normalized).date().isoformat()
            except ValueError:
                try:
                    return datetime.strptime(normalized, "%Y-%m-%dT%H:%M:%S").date().isoformat()
                except Exception:  # noqa: BLE001
                    continue
    return None


def _infer_product_type(candidates: Sequence[Optional[str]], default_type: str) -> str:
    for candidate in candidates:
        if not candidate:
            continue
        lowered = str(candidate).lower()
        if any(token in lowered for token in ("credit card", "creditcard", "кредитная карта")):
            return "credit_card"
        if "card" in lowered and any(token in lowered for token in ("credit", "кредит")):
            return "credit_card"
        if any(token in lowered for token in ("debit", "дебет", "checking")) and "card" in lowered:
            return "debit_card"
        if any(token in lowered for token in ("deposit", "вклад", "накоп", "savings")):
            return "deposit"
        if any(token in lowered for token in ("loan", "кредит", "ипотека", "installment")):
            return "loan"
    return default_type


def build_account_product(account: Dict[str, Any], bank_id: str) -> Optional[Dict[str, Any]]:
    if not isinstance(account, dict):
        return None
    config = settings.banks.get(bank_id)
    bank_name = config.display_name if config else bank_id
    account_id = (
        account.get("accountId")
        or account.get("account_id")
        or account.get("id")
        or account.get("resource_id")
        or str(uuid.uuid4())
    )
    balance = _extract_number(account, BALANCE_FIELDS)
    rate = _extract_number(account, RATE_FIELDS)
    rate_value = None
    if rate is not None:
        rate_value = round(rate * 100, 2) if rate <= 1 else round(rate, 2)
    product_type = _infer_product_type(
        (
            str(account.get("product_type")),
            str(account.get("accountSubType")),
            str(account.get("accountType")),
            str(account.get("nickname")),
        ),
        "debit_card",
    )
    name = (
        account.get("nickname")
        or account.get("accountName")
        or account.get("product")
        or account.get("product_name")
        or "Счет"
    )
    return {
        "id": account_id,
        "type": product_type,
        "product_type": product_type,
        "name": name,
        "bank_id": bank_id,
        "bank_name": bank_name,
        "consented": False,
        "tos_url": account.get("tos_url") or "#",
        "outstanding_balance": round(balance, 2) if balance is not None else None,
        "balance": round(balance, 2) if balance is not None else None,
        "min_payment": None,
        "next_payment_date": None,
        "rate": rate_value,
        "raw_product": account,
    }


def build_credit_product(credit: Dict[str, Any], bank_id: str) -> Optional[Dict[str, Any]]:
    if not isinstance(credit, dict):
        return None
    config = settings.banks.get(bank_id)
    bank_name = config.display_name if config else bank_id
    credit_id = (
        credit.get("agreement_id")
        or credit.get("credit_id")
        or credit.get("id")
        or str(uuid.uuid4())
    )
    balance = _extract_number(credit, BALANCE_FIELDS)
    min_payment = _extract_number(credit, PAYMENT_FIELDS)
    next_payment = _extract_date(credit, DATE_FIELDS)
    rate = _extract_number(credit, RATE_FIELDS)
    normalized_rate = None
    if rate is not None:
        normalized_rate = round(rate * 100, 2) if rate <= 1 else round(rate, 2)
    product_type = _infer_product_type(
        (
            str(credit.get("product_type")),
            str(credit.get("type")),
            str(credit.get("product")),
            str(credit.get("name")),
        ),
        "loan",
    )
    name = credit.get("name") or credit.get("product_name") or credit.get("product") or "Кредит"
    return {
        "id": credit_id,
        "type": product_type,
        "product_type": product_type,
        "name": name,
        "bank_id": bank_id,
        "bank_name": bank_name,
        "consented": False,
        "tos_url": credit.get("tos_url") or "#",
        "outstanding_balance": round(balance, 2) if balance is not None else None,
        "balance": round(balance, 2) if balance is not None else None,
        "min_payment": round(min_payment, 2) if min_payment is not None else None,
        "next_payment_date": next_payment,
        "rate": normalized_rate,
        "raw_product": credit,
    }


def group_products_by_bank(
    accounts: Sequence[Dict[str, Any]],
    credits: Sequence[Dict[str, Any]],
) -> Dict[str, List[Dict[str, Any]]]:
    grouped: Dict[str, List[Dict[str, Any]]] = {}
    for product in list(accounts) + list(credits):
        bank_id = product.get("bank_id") or "unknown"
        grouped.setdefault(bank_id, []).append(product)
    return grouped


def apply_consent_flags(
    products_by_bank: Dict[str, List[Dict[str, Any]]],
    product_consents: Sequence[Dict[str, Any]] | None,
) -> Dict[str, List[Dict[str, Any]]]:
    if not product_consents:
        return products_by_bank
    index = {
        (item.get("bank_id"), item.get("product_id")): bool(item.get("consented"))
        for item in product_consents
    }
    for bank_products in products_by_bank.values():
        for product in bank_products:
            key = (product.get("bank_id"), product.get("id"))
            if key in index:
                product["consented"] = index[key]
    return products_by_bank
