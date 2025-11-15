from __future__ import annotations

import logging
from typing import Any, Dict

from fastapi import HTTPException, status

from hktn.core.database import (
    get_consent_by_request_id,
    save_consent,
    update_consent_from_request,
    update_consent_status,
)
from hktn.core.obr_client import AUTHORIZED_CONSENT_STATUSES, FAILED_CONSENT_STATUSES

from ..schemas import ConsentInitiateRequest
from .banking import bank_client, get_bank_config

logger = logging.getLogger("finpulse.backend.consents")


async def initiate_consent(req: ConsentInitiateRequest) -> Dict[str, Any]:
    bank_config = get_bank_config(req.bank_id, require_url=True)
    async with bank_client(req.bank_id) as client:
        try:
            logger.info("Initiating consent for user '%s' with bank '%s'", req.user_id, req.bank_id)
            consent_meta = await client.initiate_consent(req.user_id)
            consent_identifier = consent_meta.consent_id or consent_meta.request_id
            if not consent_identifier:
                raise HTTPException(
                    status_code=502,
                    detail="Bank did not provide consent or request identifier.",
                )

            initial_status = "APPROVED" if consent_meta.auto_approved else "AWAITING_USER"
            save_consent(
                req.user_id,
                req.bank_id,
                consent_identifier,
                initial_status,
                request_id=consent_meta.request_id,
                approval_url=consent_meta.approval_url,
                consent_type="accounts",
            )

            if consent_meta.consent_id and consent_meta.auto_approved:
                update_consent_status(consent_meta.consent_id, "APPROVED")

            response_payload: Dict[str, Any] = {
                "bank_id": req.bank_id,
                "bank_name": bank_config.display_name,
                "user_id": req.user_id,
                "state": "approved" if consent_meta.auto_approved else "pending",
                "status": consent_meta.status,
                "consent_id": consent_meta.consent_id,
                "request_id": consent_meta.request_id,
                "approval_url": consent_meta.approval_url,
                "auto_approved": consent_meta.auto_approved,
            }

            if consent_meta.auto_approved:
                logger.info("Consent %s auto-approved for user '%s'.", consent_meta.consent_id, req.user_id)
            else:
                logger.info(
                    "Consent awaiting user action (request_id=%s) for user '%s'.",
                    consent_meta.request_id,
                    req.user_id,
                )
            return response_payload
        except HTTPException:
            raise
        except Exception as exc:  # noqa: BLE001
            logger.error("Failed to initiate consent for bank %s: %s", req.bank_id, exc)
            raise HTTPException(status_code=502, detail=f"Could not initiate consent with bank: {exc}") from exc


async def initiate_product_consent(req: ConsentInitiateRequest) -> Dict[str, Any]:
    """Initiate product-agreement consent for the selected bank."""
    bank_config = get_bank_config(req.bank_id, require_url=True)
    async with bank_client(req.bank_id) as client:
        try:
            logger.info("Initiating PRODUCT consent for user '%s' with bank '%s'", req.user_id, req.bank_id)
            consent_meta = await client.initiate_product_consent(req.user_id)
            if not consent_meta or not (consent_meta.consent_id or consent_meta.request_id):
                raise HTTPException(status_code=502, detail="Bank did not provide product consent identifier.")

            consent_identifier = consent_meta.consent_id or consent_meta.request_id
            initial_status = "APPROVED" if consent_meta.auto_approved else "AWAITING_USER"
            save_consent(
                req.user_id,
                req.bank_id,
                consent_identifier,
                initial_status,
                request_id=consent_meta.request_id,
                approval_url=consent_meta.approval_url,
                consent_type="products",
            )

            if consent_meta.consent_id and consent_meta.auto_approved:
                update_consent_status(consent_meta.consent_id, "APPROVED")

            return {
                "bank_id": req.bank_id,
                "bank_name": bank_config.display_name,
                "type": "product",
                "state": "approved" if consent_meta.auto_approved else "pending",
                "status": consent_meta.status,
                "consent_id": consent_meta.consent_id,
                "request_id": consent_meta.request_id,
                "approval_url": consent_meta.approval_url,
                "auto_approved": consent_meta.auto_approved,
            }
        except HTTPException as exc:
            logger.error("Failed to initiate PRODUCT consent for bank %s: %s", req.bank_id, exc)
            return {
                "bank_id": req.bank_id,
                "bank_name": bank_config.display_name,
                "type": "product",
                "state": "error",
                "status": "error",
                "error_message": str(exc.detail if hasattr(exc, "detail") else exc),
            }
        except Exception as exc:  # noqa: BLE001
            logger.error("Failed to initiate PRODUCT consent for bank %s: %s", req.bank_id, exc)
            return {
                "bank_id": req.bank_id,
                "bank_name": bank_config.display_name,
                "type": "product",
                "state": "error",
                "status": "error",
                "error_message": str(exc),
            }


async def poll_consent_status(user_id: str, bank_id: str, request_id: str) -> Dict[str, Any]:
    if not request_id:
        raise HTTPException(status_code=400, detail="request_id is required.")
    get_bank_config(bank_id, require_url=True)

    async with bank_client(bank_id) as client:
        try:
            logger.info("Polling consent status for request_id=%s at bank %s", request_id, bank_id)
            payload = await client.get_consent_status_by_request_id(request_id)
            data_section = payload.get("data", {}) if isinstance(payload, dict) else {}
            consent_id = (
                data_section.get("consentId")
                or data_section.get("consent_id")
                or payload.get("consent_id")
            )
            status_value = (
                data_section.get("status")
                or payload.get("status")
                or "unknown"
            )
            response: Dict[str, Any] = {
                "state": "pending",
                "status": status_value,
                "bank_id": bank_id,
                "request_id": request_id,
            }
            stored = get_consent_by_request_id(request_id)
            if stored and stored.get("approval_url"):
                response["approval_url"] = stored["approval_url"]
            approval_link = (
                payload.get("links", {}).get("consentApproval")
                if isinstance(payload, dict)
                else None
            )
            if approval_link:
                response["approval_url"] = approval_link

            if status_value in FAILED_CONSENT_STATUSES:
                response["state"] = "failed"
                if consent_id:
                    update_consent_from_request(request_id, consent_id, status_value)
                return response

            if consent_id:
                response["consent_id"] = consent_id
                if status_value in AUTHORIZED_CONSENT_STATUSES:
                    updated = update_consent_from_request(request_id, consent_id, "APPROVED")
                    if not updated:
                        consent_kind = (stored or {}).get("consent_type") or "accounts"
                        save_consent(
                            user_id,
                            bank_id,
                            consent_id,
                            "APPROVED",
                            request_id=request_id,
                            consent_type=consent_kind,
                        )
                    update_consent_status(consent_id, "APPROVED")
                    response["state"] = "approved"
            return response
        except HTTPException:
            raise
        except Exception as exc:  # noqa: BLE001
            logger.error("Failed to fetch consent status for bank %s: %s", bank_id, exc)
            raise HTTPException(status_code=502, detail=f"Failed to fetch consent status: {exc}") from exc


def mark_consent_from_callback(consent_id: str) -> bool:
    """Mark consent as approved when redirected back from bank."""
    return update_consent_status(consent_id, "APPROVED")
