from __future__ import annotations

import logging
from typing import Any, Dict

from fastapi import HTTPException, status

from hktn.core.database import (
    find_consent_by_type,
    get_consent_by_request_id,
    get_user_consents,
    save_consent,
    update_consent_from_request,
    update_consent_status,
)
from hktn.core.obr_client import AUTHORIZED_CONSENT_STATUSES, FAILED_CONSENT_STATUSES

from ..schemas import ConsentInitiateRequest, OnboardingConsentsRequest, BankConsentRequest
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


async def initiate_payment_consent(req: ConsentInitiateRequest) -> Dict[str, Any]:
    """Initiate payment consent for the selected bank."""
    from hktn.core.database import find_consent_by_type
    
    bank_config = get_bank_config(req.bank_id, require_url=True)
    async with bank_client(req.bank_id) as client:
        try:
            logger.info("Initiating PAYMENT consent for user '%s' with bank '%s'", req.user_id, req.bank_id)
            
            # Get debtor_account from user's accounts if account consent exists
            debtor_account: Optional[str] = None
            account_consent = find_consent_by_type(req.user_id, req.bank_id, "accounts")
            if account_consent:
                try:
                    accounts = await client.fetch_accounts_with_consent(req.user_id, account_consent.consent_id)
                    if accounts and len(accounts) > 0:
                        # Extract account_id from first account
                        first_account = accounts[0]
                        debtor_account = (
                            first_account.get("accountId")
                            or first_account.get("account_id")
                            or first_account.get("id")
                            or first_account.get("identification")
                        )
                        if debtor_account:
                            logger.info("Using account %s as debtor_account for payment consent", debtor_account)
                except Exception as e:
                    logger.warning("Failed to fetch accounts for payment consent: %s", e)
            
            # Fallback: use placeholder format if no account found
            if not debtor_account:
                debtor_account = f"account-{req.user_id}-{req.bank_id}"
                logger.warning("Using placeholder debtor_account: %s", debtor_account)
            
            # Create VRP consent (Variable Recurring Payment) for flexible payments
            consent_meta = await client.initiate_payment_consent(
                user_id=req.user_id,
                debtor_account=debtor_account,
                consent_type="vrp",
                vrp_max_individual_amount=100000.0,  # Max 100k per payment
                vrp_daily_limit=500000.0,  # Max 500k per day
                vrp_monthly_limit=10000000.0,  # Max 10M per month
            )
            if not consent_meta or not (consent_meta.consent_id or consent_meta.request_id):
                raise HTTPException(status_code=502, detail="Bank did not provide payment consent identifier.")

            consent_identifier = consent_meta.consent_id or consent_meta.request_id
            initial_status = "APPROVED" if consent_meta.auto_approved else "AWAITING_USER"
            save_consent(
                req.user_id,
                req.bank_id,
                consent_identifier,
                initial_status,
                request_id=consent_meta.request_id,
                approval_url=consent_meta.approval_url,
                consent_type="payments",
            )

            if consent_meta.consent_id and consent_meta.auto_approved:
                update_consent_status(consent_meta.consent_id, "APPROVED")

            return {
                "bank_id": req.bank_id,
                "bank_name": bank_config.display_name,
                "type": "payment",
                "state": "approved" if consent_meta.auto_approved else "pending",
                "status": consent_meta.status,
                "consent_id": consent_meta.consent_id,
                "request_id": consent_meta.request_id,
                "approval_url": consent_meta.approval_url,
                "auto_approved": consent_meta.auto_approved,
            }
        except HTTPException as exc:
            logger.error("Failed to initiate PAYMENT consent for bank %s: %s", req.bank_id, exc)
            return {
                "bank_id": req.bank_id,
                "bank_name": bank_config.display_name,
                "type": "payment",
                "state": "error",
                "status": "error",
                "error_message": str(exc.detail if hasattr(exc, "detail") else exc),
            }
        except Exception as exc:  # noqa: BLE001
            logger.error("Failed to initiate PAYMENT consent for bank %s: %s", req.bank_id, exc)
            return {
                "bank_id": req.bank_id,
                "bank_name": bank_config.display_name,
                "type": "payment",
                "state": "error",
                "status": "error",
                "error_message": str(exc),
            }


async def initiate_full_consent_flow(req: ConsentInitiateRequest) -> Dict[str, Any]:
    """
    Create all three types of consents: account + product + payment.
    Product and payment consents are created regardless of account consent auto-approval status.
    """
    user_id = req.user_id
    bank_id = req.bank_id

    # 1. Account consent (обязательный)
    account_result = await initiate_consent(req)

    # 2. Product consent (всегда, не критично если не получится)
    try:
        logger.info("Creating product consent for %s@%s", user_id, bank_id)
        product_result = await initiate_product_consent(req)
        if product_result.get("state") != "error":
            logger.info("Product consent created: %s", product_result.get("consent_id"))
        else:
            logger.warning("Product consent error: %s", product_result.get("error_message"))
    except Exception as exc:  # noqa: BLE001
        logger.warning("Product consent creation failed (non-critical): %s", exc)

    # 3. Payment consent (всегда, не критично если не получится)
    try:
        logger.info("Creating payment consent for %s@%s", user_id, bank_id)
        payment_result = await initiate_payment_consent(req)
        if payment_result.get("state") != "error":
            logger.info("Payment consent created: %s", payment_result.get("consent_id"))
        else:
            logger.warning("Payment consent error: %s", payment_result.get("error_message"))
    except Exception as exc:  # noqa: BLE001
        logger.warning("Payment consent creation failed (non-critical): %s", exc)

    return account_result


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


async def create_multiple_consents(req: OnboardingConsentsRequest) -> Dict[str, Any]:
    """Создает все необходимые consents для выбранных банков."""
    results = []
    user_id = req.user_id
    overall_status = "completed"
    has_errors = False
    has_pending = False

    for bank_data in req.banks:
        bank_id = bank_data.bank_id
        consents_to_create = bank_data.consents
        
        # Get bank config for bank_name
        bank_config = get_bank_config(bank_id, require_url=False)
        bank_name = bank_config.display_name if bank_config else bank_id
        
        bank_result: Dict[str, Any] = {
            "bank_id": bank_id,
            "bank_name": bank_name,
            "account_consent": None,
            "product_consent": None,
            "payment_consent": None,
        }

        # Create account consent if requested
        if consents_to_create.account:
            try:
                # Check for existing approved consent first
                existing_account_consent = find_consent_by_type(user_id, bank_id, "accounts")
                
                if existing_account_consent:
                    logger.info(
                        "Reusing existing account consent %s for %s@%s",
                        existing_account_consent.consent_id,
                        user_id,
                        bank_id,
                    )
                    bank_result["account_consent"] = {
                        "status": "approved",
                        "consent_id": existing_account_consent.consent_id,
                        "request_id": None,
                        "approval_url": None,
                        "reused": True,
                    }
                else:
                    # Create new consent if none exists
                    account_req = ConsentInitiateRequest(user_id=user_id, bank_id=bank_id)
                    account_result = await initiate_consent(account_req)
                    
                    # Determine status based on result
                    if account_result.get("state") == "approved":
                        status_value = "approved"
                    elif account_result.get("state") == "pending":
                        status_value = "pending"
                        has_pending = True
                    else:
                        status_value = "creating"
                        has_pending = True
                    
                    bank_result["account_consent"] = {
                        "status": status_value,
                        "consent_id": account_result.get("consent_id"),
                        "request_id": account_result.get("request_id"),
                        "approval_url": account_result.get("approval_url"),
                        "reused": False,
                    }
                    
                    logger.info(
                        "Account consent created for %s@%s: %s (status: %s)",
                        user_id,
                        bank_id,
                        account_result.get("consent_id"),
                        status_value,
                    )
            except Exception as exc:  # noqa: BLE001
                error_msg = str(exc)
                bank_result["account_consent"] = {
                    "status": "error",
                    "error_message": error_msg,
                }
                has_errors = True
                logger.error(
                    "Failed to create account consent for %s@%s: %s",
                    user_id,
                    bank_id,
                    error_msg,
                )

        # Create product consent if requested
        if consents_to_create.product:
            try:
                # Check for existing approved consent first
                existing_product_consent = find_consent_by_type(user_id, bank_id, "products")
                
                if existing_product_consent:
                    logger.info(
                        "Reusing existing product consent %s for %s@%s",
                        existing_product_consent.consent_id,
                        user_id,
                        bank_id,
                    )
                    bank_result["product_consent"] = {
                        "status": "approved",
                        "consent_id": existing_product_consent.consent_id,
                        "request_id": None,
                        "approval_url": None,
                        "reused": True,
                    }
                else:
                    # Create new consent if none exists
                    product_req = ConsentInitiateRequest(user_id=user_id, bank_id=bank_id)
                    product_result = await initiate_product_consent(product_req)
                    
                    if product_result.get("state") == "error":
                        bank_result["product_consent"] = {
                            "status": "error",
                            "error_message": product_result.get("error_message", "Unknown error"),
                        }
                        has_errors = True
                    else:
                        if product_result.get("state") == "approved":
                            status_value = "approved"
                        elif product_result.get("state") == "pending":
                            status_value = "pending"
                            has_pending = True
                        else:
                            status_value = "creating"
                            has_pending = True
                        
                        bank_result["product_consent"] = {
                            "status": status_value,
                            "consent_id": product_result.get("consent_id"),
                            "request_id": product_result.get("request_id"),
                            "approval_url": product_result.get("approval_url"),
                            "reused": False,
                        }
                        
                        logger.info(
                            "Product consent created for %s@%s: %s (status: %s)",
                            user_id,
                            bank_id,
                            product_result.get("consent_id"),
                            status_value,
                        )
            except Exception as exc:  # noqa: BLE001
                error_msg = str(exc)
                bank_result["product_consent"] = {
                    "status": "error",
                    "error_message": error_msg,
                }
                has_errors = True
                logger.error(
                    "Failed to create product consent for %s@%s: %s",
                    user_id,
                    bank_id,
                    error_msg,
                )

        # Create payment consent if requested
        if consents_to_create.payment:
            try:
                # Check for existing approved consent first
                existing_payment_consent = find_consent_by_type(user_id, bank_id, "payments")
                
                if existing_payment_consent:
                    logger.info(
                        "Reusing existing payment consent %s for %s@%s",
                        existing_payment_consent.consent_id,
                        user_id,
                        bank_id,
                    )
                    bank_result["payment_consent"] = {
                        "status": "approved",
                        "consent_id": existing_payment_consent.consent_id,
                        "request_id": None,
                        "approval_url": None,
                        "reused": True,
                    }
                else:
                    # Create new consent if none exists
                    payment_req = ConsentInitiateRequest(user_id=user_id, bank_id=bank_id)
                    payment_result = await initiate_payment_consent(payment_req)
                    
                    if payment_result.get("state") == "error":
                        bank_result["payment_consent"] = {
                            "status": "error",
                            "error_message": payment_result.get("error_message", "Unknown error"),
                        }
                        has_errors = True
                    else:
                        if payment_result.get("state") == "approved":
                            status_value = "approved"
                        elif payment_result.get("state") == "pending":
                            status_value = "pending"
                            has_pending = True
                        else:
                            status_value = "creating"
                            has_pending = True
                        
                        bank_result["payment_consent"] = {
                            "status": status_value,
                            "consent_id": payment_result.get("consent_id"),
                            "request_id": payment_result.get("request_id"),
                            "approval_url": payment_result.get("approval_url"),
                            "reused": False,
                        }
                        
                        logger.info(
                            "Payment consent created for %s@%s: %s (status: %s)",
                            user_id,
                            bank_id,
                            payment_result.get("consent_id"),
                            status_value,
                        )
            except Exception as exc:  # noqa: BLE001
                error_msg = str(exc)
                bank_result["payment_consent"] = {
                    "status": "error",
                    "error_message": error_msg,
                }
                has_errors = True
                logger.error(
                    "Failed to create payment consent for %s@%s: %s",
                    user_id,
                    bank_id,
                    error_msg,
                )

        results.append(bank_result)

    # Determine overall status
    if has_errors and has_pending:
        overall_status = "partial"
    elif has_errors:
        overall_status = "error"
    elif has_pending:
        overall_status = "in_progress"

    return {
        "results": results,
        "user_id": user_id,
        "overall_status": overall_status,
    }


async def get_consents_status(user_id: str) -> Dict[str, Any]:
    """Возвращает текущий статус всех согласий пользователя."""
    consents = get_user_consents(user_id)
    
    # Group consents by bank_id
    banks_dict: Dict[str, Dict[str, Any]] = {}
    
    for consent in consents:
        bank_id = consent.get("bank_id")
        consent_type = consent.get("consent_type", "accounts")
        status = consent.get("status", "unknown")
        consent_id = consent.get("consent_id")
        request_id = consent.get("request_id")
        approval_url = consent.get("approval_url")
        
        if bank_id not in banks_dict:
            # Get bank config for bank_name
            bank_config = get_bank_config(bank_id, require_url=False)
            bank_name = bank_config.display_name if bank_config else bank_id
            
            banks_dict[bank_id] = {
                "bank_id": bank_id,
                "bank_name": bank_name,
                "account_consent": None,
                "product_consent": None,
                "payment_consent": None,
            }
        
        # Map consent_type to the result structure
        consent_key_map = {
            "accounts": "account_consent",
            "products": "product_consent",
            "payments": "payment_consent",
        }
        
        consent_key = consent_key_map.get(consent_type, "account_consent")
        
        # Map status from DB to API status
        if status == "APPROVED":
            api_status = "approved"
        elif status == "AWAITING_USER":
            api_status = "pending"
        else:
            api_status = "creating"
        
        banks_dict[bank_id][consent_key] = {
            "status": api_status,
            "consent_id": consent_id,
            "request_id": request_id,
            "approval_url": approval_url,
        }
    
    results = list(banks_dict.values())
    
    return {
        "results": results,
        "user_id": user_id,
    }
