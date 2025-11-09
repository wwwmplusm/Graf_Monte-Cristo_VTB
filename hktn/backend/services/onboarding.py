from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from typing import Any, Dict

from fastapi import HTTPException, status

from core.database import (
    commit_onboarding_session,
    find_approved_consents,
    get_latest_onboarding_session,
    get_product_consents_for_user,
    get_user_consents,
    get_user_goal,
    upsert_product_consents,
)

from ..schemas import FinancialPortraitRequest, IngestRequest, OnboardingCommitRequest, ProductConsentRequest
from .banking import fetch_bank_accounts_with_consent, fetch_bank_credits
from .products import apply_consent_flags, build_account_product, build_credit_product, group_products_by_bank

logger = logging.getLogger("finpulse.backend.onboarding")


async def preview_products(req: IngestRequest) -> Dict[str, Any]:
    """Fetch lightweight preview of accounts and credits for onboarding."""
    approved_consents = find_approved_consents(req.user_id)
    if not approved_consents:
        raise HTTPException(
            status_code=status.HTTP_424_FAILED_DEPENDENCY,
            detail="No approved consents found.",
        )

    account_tasks = [
        fetch_bank_accounts_with_consent(bank_id, consent_id, req.user_id)
        for bank_id, consent_id in approved_consents
    ]
    credit_tasks = [
        fetch_bank_credits(bank_id, consent_id, req.user_id, req.user_name, create_product_consent=True)
        for bank_id, consent_id in approved_consents
    ]

    account_results, credit_results = await asyncio.gather(
        asyncio.gather(*account_tasks),
        asyncio.gather(*credit_tasks),
    )

    products_by_bank: Dict[str, list[Dict[str, Any]]] = {}
    for res in account_results:
        bank_id = res["bank_id"]
        products_by_bank.setdefault(bank_id, [])
        if res["status"] != "ok":
            continue
        for account in res.get("accounts", []) or []:
            enriched = build_account_product(account, bank_id)
            if not enriched:
                continue
            products_by_bank[bank_id].append(enriched)

    for res in credit_results:
        bank_id = res["bank_id"]
        products_by_bank.setdefault(bank_id, [])
        if res["status"] != "ok":
            continue
        for credit in res.get("credits", []) or []:
            enriched = build_credit_product(credit, bank_id)
            if not enriched:
                continue
            products_by_bank[bank_id].append(enriched)

    existing_consents = get_product_consents_for_user(req.user_id)
    products_by_bank = apply_consent_flags(products_by_bank, existing_consents)
    latest_state = get_user_consents(req.user_id) or []

    return {"productsByBank": products_by_bank, "latestConsentState": latest_state}


def save_product_consents(req: ProductConsentRequest) -> Dict[str, Any]:
    """Persist the user's product consent selections."""
    if not req.user_id:
        raise HTTPException(status_code=400, detail="user_id is required.")

    approved_consents = find_approved_consents(req.user_id)
    if not approved_consents:
        raise HTTPException(
            status_code=status.HTTP_424_FAILED_DEPENDENCY,
            detail="No approved consents found.",
        )

    try:
        payload = [item.model_dump() for item in req.items]
        upsert_product_consents(req.user_id, payload)
        current_consents = get_product_consents_for_user(req.user_id)
        latest_state = get_user_consents(req.user_id) or []
        return {
            "status": "ok",
            "consents": current_consents,
            "latestConsentState": latest_state,
        }
    except Exception as exc:  # noqa: BLE001
        logger.error("Failed to save product consents for user %s: %s", req.user_id, exc)
        raise HTTPException(status_code=500, detail="Could not save product consents.") from exc


def finalize_onboarding(req: OnboardingCommitRequest) -> Dict[str, Any]:
    """Commit the onboarding flow and store a snapshot."""
    if not req.user_id:
        raise HTTPException(status_code=400, detail="user_id is required.")

    try:
        approved_consents = find_approved_consents(req.user_id)
        if not approved_consents:
            raise HTTPException(
                status_code=status.HTTP_424_FAILED_DEPENDENCY,
                detail="No approved consents found.",
            )

        product_consents = get_product_consents_for_user(req.user_id)
        if not product_consents:
            raise HTTPException(
                status_code=status.HTTP_424_FAILED_DEPENDENCY,
                detail="No product consents have been saved.",
            )

        user_goal = get_user_goal(req.user_id)
        if not user_goal:
            raise HTTPException(
                status_code=status.HTTP_424_FAILED_DEPENDENCY,
                detail="No financial goal has been saved.",
            )

        connected_bank_ids = [bank_id for bank_id, _ in approved_consents]
        commit_onboarding_session(req.user_id, connected_bank_ids, product_consents, user_goal)

        snapshot = {
            "banks_connected": connected_bank_ids,
            "products_consented": product_consents,
            "goal_profile": user_goal,
            "completed_at": datetime.now(timezone.utc).isoformat(),
        }
        return {"status": "ok", "message": "Onboarding completed", "data": snapshot}
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        logger.error("Failed to commit onboarding for user %s: %s", req.user_id, exc)
        raise HTTPException(status_code=500, detail="Could not finalize onboarding session.") from exc


async def load_app_state(user_id: str, include_portrait: bool = False) -> Dict[str, Any]:
    """Return onboarding snapshot, consents and optional portrait for the SPA shell."""
    snapshot = get_latest_onboarding_session(user_id)
    product_consents = get_product_consents_for_user(user_id)
    consents = get_user_consents(user_id)

    response: Dict[str, Any] = {
        "user_id": user_id,
        "is_onboarded": snapshot is not None,
        "onboarding_snapshot": snapshot,
        "product_consents": product_consents,
        "consents": consents,
    }

    if not snapshot:
        response["reason"] = "onboarding_not_completed"
        return response

    user_goal = get_user_goal(user_id)
    response["goal"] = user_goal

    portrait = None
    portrait_error = None

    if include_portrait:
        try:
            portrait_request = FinancialPortraitRequest(
                user_id=user_id,
                goal_type=(user_goal or {}).get("goal_type"),
                goal_details=(user_goal or {}).get("goal_details"),
                pace=(user_goal or {}).get("goal_details", {}).get("save_speed")
                or (user_goal or {}).get("goal_details", {}).get("close_speed"),
            )
            # Lazy import to avoid circular dependency at module load time.
            from .analytics import build_financial_portrait_view

            portrait = await build_financial_portrait_view(portrait_request)
        except HTTPException as exc:
            if exc.status_code == status.HTTP_424_FAILED_DEPENDENCY:
                portrait_error = exc.detail
            else:
                raise

    response["portrait"] = portrait
    response["portrait_error"] = portrait_error
    return response
