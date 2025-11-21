from __future__ import annotations

from fastapi import APIRouter, Request, HTTPException
from fastapi.responses import RedirectResponse

from ..config import settings
from ..schemas import ConsentInitiateRequest, FullConsentInitRequest, ConsentRefreshRequest
from ..services import consents

router = APIRouter(prefix="/api", tags=["consents"])


@router.post("/consent/initiate")
async def initiate_consent(req: ConsentInitiateRequest):
    return await consents.initiate_full_consent_flow(req)


@router.post("/consents/init")
async def initiate_multiple_consents(req: FullConsentInitRequest):
    return await consents.initiate_consents_for_banks(
        user_id=req.user_id,
        bank_ids=req.banks,
        include_products=req.include_products,
        include_payments=req.include_payments,
    )


@router.post("/consent/initiate/product")
async def initiate_product_consent(req: ConsentInitiateRequest):
    return await consents.initiate_product_consent(req)


@router.post("/consent/initiate/payment")
async def initiate_payment_consent_endpoint(req: ConsentInitiateRequest):
    """Initiate payment consent for a bank."""
    return await consents.initiate_payment_consent(req)


@router.post("/consents/start")
async def start_consent_alias(req: ConsentInitiateRequest):
    """Specification-friendly alias for /api/consent/initiate."""
    return await consents.initiate_full_consent_flow(req)


@router.get("/consent/callback")
async def consent_callback(request: Request, consent_id: str):
    consents.mark_consent_from_callback(consent_id)
    return RedirectResponse(url=f"{settings.frontend_url}/callback")


@router.get("/consent/status")
async def get_consent_status(user_id: str, bank_id: str | None = None, request_id: str | None = None):
    if request_id:
        if not bank_id:
            raise HTTPException(status_code=400, detail="bank_id is required when providing request_id")
        return await consents.poll_consent_status(user_id=user_id, bank_id=bank_id, request_id=request_id)
    bank_ids = [bank_id] if bank_id else None
    return await consents.get_consents_status(user_id=user_id, bank_ids=bank_ids, auto_refresh=True)


@router.get("/consents/status")
async def get_consent_status_alias(user_id: str, bank_id: str | None = None, request_id: str | None = None):
    """Specification-friendly alias for /api/consent/status."""
    return await get_consent_status(user_id=user_id, bank_id=bank_id, request_id=request_id)


@router.post("/consents/refresh")
async def refresh_consents(req: ConsentRefreshRequest):
    return await consents.refresh_consents_status(req.user_id, bank_ids=req.banks)
