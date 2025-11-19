from __future__ import annotations

from fastapi import APIRouter, Request
from fastapi.responses import RedirectResponse

from ..config import settings
from ..schemas import ConsentInitiateRequest, OnboardingConsentsRequest
from ..services import consents

router = APIRouter(prefix="/api", tags=["consents"])


@router.post("/consent/initiate")
async def initiate_consent(req: ConsentInitiateRequest):
    return await consents.initiate_full_consent_flow(req)


@router.post("/consent/initiate/product")
async def initiate_product_consent(req: ConsentInitiateRequest):
    return await consents.initiate_product_consent(req)


@router.post("/consent/initiate/payment")
async def initiate_payment_consent_endpoint(req: ConsentInitiateRequest):
    """Initiate payment consent for a bank."""
    return await consents.initiate_payment_consent(req)


@router.post("/onboarding/consents")
async def create_all_consents(req: OnboardingConsentsRequest):
    """Создает все необходимые consents для выбранных банков."""
    return await consents.create_multiple_consents(req)


@router.post("/consents/start")
async def start_consent_alias(req: ConsentInitiateRequest):
    """Specification-friendly alias for /api/consent/initiate."""
    return await consents.initiate_full_consent_flow(req)


@router.get("/consent/callback")
async def consent_callback(request: Request, consent_id: str):
    consents.mark_consent_from_callback(consent_id)
    return RedirectResponse(url=f"{settings.frontend_url}/callback")


@router.get("/consent/status")
async def get_consent_status(user_id: str, bank_id: str, request_id: str):
    return await consents.poll_consent_status(user_id=user_id, bank_id=bank_id, request_id=request_id)


@router.get("/consents/status")
async def get_consent_status_alias(user_id: str, bank_id: str, request_id: str):
    """Specification-friendly alias for /api/consent/status."""
    return await consents.poll_consent_status(user_id=user_id, bank_id=bank_id, request_id=request_id)
