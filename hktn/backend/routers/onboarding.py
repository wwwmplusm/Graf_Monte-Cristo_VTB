from __future__ import annotations

from fastapi import APIRouter

from ..schemas import IngestRequest, OnboardingCommitRequest, PreviewResponse, ProductConsentRequest
from ..services import onboarding

router = APIRouter(prefix="/api", tags=["onboarding"])


@router.post("/ingest/preview", response_model=PreviewResponse)
async def preview_products(req: IngestRequest):
    return await onboarding.preview_products(req)


@router.post("/products/consent")
async def save_product_consents(req: ProductConsentRequest):
    return onboarding.save_product_consents(req)


@router.post("/onboarding/commit")
async def finalize_onboarding(req: OnboardingCommitRequest):
    return onboarding.finalize_onboarding(req)


@router.get("/app/state")
async def get_app_state(user_id: str, include_portrait: bool = False):
    return await onboarding.load_app_state(user_id, include_portrait)
