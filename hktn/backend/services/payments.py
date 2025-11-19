from __future__ import annotations

import logging
from typing import Any, Dict, Optional

from fastapi import HTTPException

from hktn.core.database import find_consent_by_type
from hktn.core.obr_client import OBRAPIClient

from ..schemas import MDPPaymentRequest, ADPPaymentRequest, SDPPaymentRequest
from .banking import bank_client, get_bank_config

logger = logging.getLogger("finpulse.backend.payments")


async def pay_mdp(req: MDPPaymentRequest) -> Dict[str, Any]:
    """Mandatory Daily Payment - обязательный платеж по кредиту."""
    # 1. Найти payment consent для банка
    payment_consent = find_consent_by_type(req.user_id, req.bank_id, "payments")
    if not payment_consent:
        raise HTTPException(
            status_code=400,
            detail=f"Payment consent not found for user {req.user_id} and bank {req.bank_id}",
        )

    # 2. Получить account_id (используем первый доступный счет)
    account_consent = find_consent_by_type(req.user_id, req.bank_id, "accounts")
    if not account_consent:
        raise HTTPException(
            status_code=400,
            detail=f"Account consent not found for user {req.user_id} and bank {req.bank_id}",
        )

    # 3. Получить счета пользователя (упрощенная версия - используем первый счет)
    # В реальной реализации нужно получить список счетов через account consent
    account_id = f"account-{req.user_id}-{req.bank_id}"  # Placeholder

    # 4. Вызвать банковское API для single payment
    bank_config = get_bank_config(req.bank_id, require_url=True)
    async with bank_client(req.bank_id) as client:
        try:
            # Для MDP используем счет кредита как creditor_account
            creditor_account = req.loan_id or f"loan-{req.bank_id}"
            description = f"MDP: Обязательный платеж по кредиту {req.loan_id or 'default'}"

            payment_result = await client.initiate_single_payment(
                user_id=req.user_id,
                consent_id=payment_consent.consent_id,
                account_id=account_id,
                amount=req.amount,
                creditor_account=creditor_account,
                description=description,
            )

            logger.info(
                "MDP payment initiated: user=%s, bank=%s, amount=%.2f, payment_id=%s",
                req.user_id,
                req.bank_id,
                req.amount,
                payment_result.get("payment_id"),
            )

            return {
                "success": True,
                "payment_id": payment_result.get("payment_id"),
                "status": payment_result.get("status"),
                "amount": req.amount,
                "type": "mdp",
                "bank_id": req.bank_id,
                "bank_name": bank_config.display_name,
            }
        except Exception as exc:  # noqa: BLE001
            logger.error("Failed to initiate MDP payment: %s", exc)
            raise HTTPException(status_code=502, detail=f"Failed to initiate payment: {exc}") from exc


async def pay_adp(req: ADPPaymentRequest) -> Dict[str, Any]:
    """Additional Daily Payment - дополнительный платеж."""
    # 1. Найти payment consent для банка
    payment_consent = find_consent_by_type(req.user_id, req.bank_id, "payments")
    if not payment_consent:
        raise HTTPException(
            status_code=400,
            detail=f"Payment consent not found for user {req.user_id} and bank {req.bank_id}",
        )

    # 2. Получить account_id
    account_consent = find_consent_by_type(req.user_id, req.bank_id, "accounts")
    if not account_consent:
        raise HTTPException(
            status_code=400,
            detail=f"Account consent not found for user {req.user_id} and bank {req.bank_id}",
        )

    account_id = f"account-{req.user_id}-{req.bank_id}"  # Placeholder

    # 3. Вызвать банковское API для single payment
    bank_config = get_bank_config(req.bank_id, require_url=True)
    async with bank_client(req.bank_id) as client:
        try:
            creditor_account = req.loan_id or f"loan-{req.bank_id}"
            description = f"ADP: Дополнительный платеж по кредиту {req.loan_id or 'default'}"

            payment_result = await client.initiate_single_payment(
                user_id=req.user_id,
                consent_id=payment_consent.consent_id,
                account_id=account_id,
                amount=req.amount,
                creditor_account=creditor_account,
                description=description,
            )

            logger.info(
                "ADP payment initiated: user=%s, bank=%s, amount=%.2f, payment_id=%s",
                req.user_id,
                req.bank_id,
                req.amount,
                payment_result.get("payment_id"),
            )

            return {
                "success": True,
                "payment_id": payment_result.get("payment_id"),
                "status": payment_result.get("status"),
                "amount": req.amount,
                "type": "adp",
                "bank_id": req.bank_id,
                "bank_name": bank_config.display_name,
            }
        except Exception as exc:  # noqa: BLE001
            logger.error("Failed to initiate ADP payment: %s", exc)
            raise HTTPException(status_code=502, detail=f"Failed to initiate payment: {exc}") from exc


async def pay_sdp(req: SDPPaymentRequest) -> Dict[str, Any]:
    """Savings Daily Payment - пополнение накоплений."""
    # 1. Найти payment consent для банка
    payment_consent = find_consent_by_type(req.user_id, req.bank_id, "payments")
    if not payment_consent:
        raise HTTPException(
            status_code=400,
            detail=f"Payment consent not found for user {req.user_id} and bank {req.bank_id}",
        )

    # 2. Получить account_id
    account_consent = find_consent_by_type(req.user_id, req.bank_id, "accounts")
    if not account_consent:
        raise HTTPException(
            status_code=400,
            detail=f"Account consent not found for user {req.user_id} and bank {req.bank_id}",
        )

    account_id = f"account-{req.user_id}-{req.bank_id}"  # Placeholder

    # 3. Вызвать банковское API для single payment
    bank_config = get_bank_config(req.bank_id, require_url=True)
    async with bank_client(req.bank_id) as client:
        try:
            # Для SDP используем deposit_id как creditor_account
            creditor_account = req.deposit_id or f"deposit-{req.bank_id}"
            description = f"SDP: Пополнение накоплений {req.deposit_id or 'default'}"

            payment_result = await client.initiate_single_payment(
                user_id=req.user_id,
                consent_id=payment_consent.consent_id,
                account_id=account_id,
                amount=req.amount,
                creditor_account=creditor_account,
                description=description,
            )

            logger.info(
                "SDP payment initiated: user=%s, bank=%s, amount=%.2f, payment_id=%s",
                req.user_id,
                req.bank_id,
                req.amount,
                payment_result.get("payment_id"),
            )

            return {
                "success": True,
                "payment_id": payment_result.get("payment_id"),
                "status": payment_result.get("status"),
                "amount": req.amount,
                "type": "sdp",
                "bank_id": req.bank_id,
                "bank_name": bank_config.display_name,
            }
        except Exception as exc:  # noqa: BLE001
            logger.error("Failed to initiate SDP payment: %s", exc)
            raise HTTPException(status_code=502, detail=f"Failed to initiate payment: {exc}") from exc

