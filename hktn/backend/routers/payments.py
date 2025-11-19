from __future__ import annotations

from fastapi import APIRouter

from ..schemas import MDPPaymentRequest, ADPPaymentRequest, SDPPaymentRequest
from ..services import payments

router = APIRouter(prefix="/api", tags=["payments"])


@router.post("/payments/mdp")
async def pay_mdp(req: MDPPaymentRequest):
    """Mandatory Daily Payment - обязательный платеж по кредиту."""
    return await payments.pay_mdp(req)


@router.post("/payments/adp")
async def pay_adp(req: ADPPaymentRequest):
    """Additional Daily Payment - дополнительный платеж."""
    return await payments.pay_adp(req)


@router.post("/payments/sdp")
async def pay_sdp(req: SDPPaymentRequest):
    """Savings Daily Payment - пополнение накоплений."""
    return await payments.pay_sdp(req)

