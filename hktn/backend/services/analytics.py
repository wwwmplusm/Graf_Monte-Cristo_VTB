from __future__ import annotations

import asyncio
import logging
from datetime import date, timedelta
from typing import Any, Dict, List, Sequence

from fastapi import HTTPException, status

from hktn.core.analytics_engine import (
    build_financial_portrait,
    calculate_safe_to_spend,
    derive_obligations,
    estimate_goal_probability,
    extract_recurring_events,
    rank_credits,
    run_analysis_with_details,
    _extract_account_balance,
)
from hktn.core.data_models import Transaction
from hktn.core.database import (
    find_approved_consents,
    get_product_consents_for_user,
    get_recent_bank_status_logs,
    get_user_goal,
    StoredConsent,
)

from ..schemas import AnalysisRequest, FinancialPortraitRequest, IngestRequest
from .banking import fetch_bank_accounts_with_consent, fetch_bank_credits, fetch_bank_data_with_consent
from .goals import compose_user_goal
from .products import apply_consent_flags, build_account_product, build_credit_product, group_products_by_bank

logger = logging.getLogger("finpulse.backend.analytics")


def _require_consents(user_id: str) -> Sequence[StoredConsent]:
    approved_consents = find_approved_consents(user_id, consent_type="accounts")
    if not approved_consents:
        raise HTTPException(
            status_code=status.HTTP_424_FAILED_DEPENDENCY,
            detail="No approved consents found.",
        )
    return approved_consents


async def get_user_credits(user_id: str) -> Dict[str, Any]:
    approved_consents = _require_consents(user_id)
    tasks = [
        fetch_bank_credits(consent.bank_id, consent.consent_id, user_id, create_product_consent=True)
        for consent in approved_consents
    ]
    bank_results = await asyncio.gather(*tasks)

    all_credits: List[Dict[str, Any]] = []
    bank_statuses: List[Dict[str, str]] = []
    for res in bank_results:
        bank_statuses.append({"bank_name": res["bank_id"], "status": res["status"], "message": res["message"]})
        if res["status"] == "ok":
            all_credits.extend(res["credits"])

    ranked = rank_credits(all_credits)
    return {"credits": all_credits, "credit_rankings": ranked, "bank_statuses": bank_statuses}


async def get_dashboard_metrics(user_id: str) -> Dict[str, Any]:
    approved_consents = _require_consents(user_id)

    stored_goal = get_user_goal(user_id)
    user_goal = compose_user_goal(stored_goal)

    tx_tasks = [
        fetch_bank_data_with_consent(consent.bank_id, consent.consent_id, user_id)
        for consent in approved_consents
    ]
    credit_tasks = [
        fetch_bank_credits(consent.bank_id, consent.consent_id, user_id)
        for consent in approved_consents
    ]
    account_tasks = [
        fetch_bank_accounts_with_consent(consent.bank_id, consent.consent_id, user_id)
        for consent in approved_consents
    ]

    tx_results, credit_results, account_results = await asyncio.gather(
        asyncio.gather(*tx_tasks),
        asyncio.gather(*credit_tasks),
        asyncio.gather(*account_tasks),
    )

    all_transactions: List[Transaction] = []
    all_credits: List[Dict[str, Any]] = []
    all_accounts: List[Dict[str, Any]] = []
    bank_statuses: Dict[str, Dict[str, str]] = {}

    for res in tx_results:
        bank_statuses[res["bank_id"]] = {
            "bank_name": res["bank_id"],
            "status": res["status"],
            "message": res["message"],
        }
        if res["status"] == "ok":
            all_transactions.extend(res["transactions"])

    for res in credit_results:
        entry = bank_statuses.setdefault(
            res["bank_id"],
            {"bank_name": res["bank_id"], "status": res["status"], "message": res["message"]},
        )
        if res["status"] == "ok":
            all_credits.extend(res["credits"])
        else:
            if entry["status"] == "ok":
                entry["status"] = "partial_error"
            entry["message"] += f"; credits failed: {res['message']}"

    for res in account_results:
        entry = bank_statuses.setdefault(
            res["bank_id"],
            {"bank_name": res["bank_id"], "status": res["status"], "message": res["message"]},
        )
        if res["status"] == "ok":
            all_accounts.extend(res.get("accounts") or [])
        else:
            if entry["status"] == "ok":
                entry["status"] = "partial_error"
            suffix = f"accounts failed: {res['message']}"
            entry["message"] = f"{entry.get('message', '')}; {suffix}" if entry.get("message") else suffix

    if not all_transactions:
        raise HTTPException(
            status_code=status.HTTP_424_FAILED_DEPENDENCY,
            detail="Could not fetch any transactions.",
        )

    current_balance = sum(_extract_account_balance(account) for account in all_accounts)

    (
        analysis_result,
        trajectories,
        forecast_dates,
        noise_profile,
        event_profiles,
    ) = run_analysis_with_details(
        all_transactions,
        current_balance,
        date.today() + timedelta(days=30),
        0,
    )

    obligations = derive_obligations(all_credits, event_profiles)
    safe_to_spend = calculate_safe_to_spend(obligations, trajectories, forecast_dates)
    goal_probability = estimate_goal_probability(user_goal, trajectories, forecast_dates, obligations, event_profiles)
    recurring_events = extract_recurring_events(event_profiles)

    total_debt = sum(float(credit.get("balance", 0) or 0) for credit in all_credits)
    monthly_income = sum(float(event.get("mu_amount", 0) or 0) for event in event_profiles if event.get("is_income"))
    monthly_payments = sum(float(obligation.get("amount") or 0.0) for obligation in obligations)
    health_score = 0
    if monthly_income > 0:
        debt_to_income_ratio = monthly_payments / monthly_income if monthly_income else 0
        health_score = max(0, int((1 - debt_to_income_ratio * 2) * 100))

    upcoming_payloads: List[Dict[str, Any]] = []
    for obligation in obligations:
        due_date = obligation.get("due_date")
        if not isinstance(due_date, date):
            continue
        payload = {
            "name": obligation.get("label") or "Payment",
            "amount": obligation.get("amount"),
            "due_date": due_date,
            "source": obligation.get("source"),
            "mcc_code": obligation.get("mcc_code"),
            "category": obligation.get("category"),
            "merchant_name": obligation.get("merchant_name"),
            "bank_transaction_code": obligation.get("bank_transaction_code"),
            "frequency_days": obligation.get("frequency_days"),
        }
        upcoming_payloads.append(payload)

    upcoming_payloads.sort(key=lambda item: item["due_date"])
    upcoming_payments = [
        {**payload, "due_date": payload["due_date"].isoformat()} for payload in upcoming_payloads[:5]
    ]

    return {
        "analysis": analysis_result.dict(),
        "safe_to_spend": safe_to_spend,
        "goal_probability": goal_probability,
        "bank_statuses": bank_statuses,
        "recurring_events": recurring_events,
        "total_debt": total_debt,
        "monthly_income": monthly_income,
        "monthly_payments": monthly_payments,
        "health_score": health_score,
        "upcoming_payments": upcoming_payments,
        "current_balance": round(current_balance, 2),
    }


async def build_financial_portrait_view(req: FinancialPortraitRequest) -> Dict[str, Any]:
    approved_consents = _require_consents(req.user_id)

    tx_tasks = [
        fetch_bank_data_with_consent(consent.bank_id, consent.consent_id, req.user_id)
        for consent in approved_consents
    ]
    credit_tasks = [
        fetch_bank_credits(consent.bank_id, consent.consent_id, req.user_id, create_product_consent=True)
        for consent in approved_consents
    ]
    account_tasks = [
        fetch_bank_accounts_with_consent(consent.bank_id, consent.consent_id, req.user_id)
        for consent in approved_consents
    ]

    tx_results, credit_results, account_results = await asyncio.gather(
        asyncio.gather(*tx_tasks),
        asyncio.gather(*credit_tasks),
        asyncio.gather(*account_tasks),
    )

    all_transactions: List[Transaction] = []
    all_credits: List[Dict[str, Any]] = []
    all_accounts: List[Dict[str, Any]] = []
    enriched_credits: List[Dict[str, Any]] = []
    enriched_accounts: List[Dict[str, Any]] = []
    tx_statuses: List[Dict[str, str]] = []
    credit_statuses: List[Dict[str, str]] = []
    account_statuses: List[Dict[str, str]] = []

    for res in tx_results:
        tx_statuses.append({"bank": res["bank_id"], "status": res["status"], "message": res.get("message") or ""})
        if res["status"] == "ok":
            all_transactions.extend(res["transactions"])

    for res in credit_results:
        credit_statuses.append({"bank": res["bank_id"], "status": res["status"], "message": res.get("message") or ""})
        if res["status"] == "ok":
            all_credits.extend(res.get("credits") or [])
            for credit in res.get("credits", []) or []:
                enriched = build_credit_product(credit, res["bank_id"])
                if enriched:
                    enriched_credits.append(enriched)

    for res in account_results:
        account_statuses.append({"bank": res["bank_id"], "status": res["status"], "message": res.get("message") or ""})
        if res["status"] == "ok":
            all_accounts.extend(res.get("accounts") or [])
            for account in res.get("accounts", []) or []:
                enriched = build_account_product(account, res["bank_id"])
                if enriched:
                    enriched_accounts.append(enriched)

    product_consents = get_product_consents_for_user(req.user_id)
    bank_status_logs = get_recent_bank_status_logs(req.user_id)

    if not all_transactions:
        return {
            "error": "Could not fetch any transactions.",
            "bank_statuses": {
                "transactions": tx_statuses,
                "credits": credit_statuses,
                "accounts": account_statuses,
            },
            "product_consents": product_consents,
            "bank_status_logs": bank_status_logs,
        }

    stored_goal = get_user_goal(req.user_id)
    user_goal = compose_user_goal(stored_goal, req.goal_type, req.goal_details, req.pace)

    portrait = build_financial_portrait(
        transactions=all_transactions,
        credits=enriched_credits or all_credits,
        accounts=enriched_accounts or all_accounts,
        user_goal=user_goal,
    )
    portrait["bank_statuses"] = {
        "transactions": tx_statuses,
        "credits": credit_statuses,
        "accounts": account_statuses,
    }
    portrait["product_consents"] = product_consents
    portrait["bank_status_logs"] = bank_status_logs
    portrait["accounts"] = enriched_accounts or all_accounts
    portrait["credits"] = enriched_credits or all_credits
    portrait["transactions_sample"] = all_transactions[:100]
    products_by_bank = group_products_by_bank(portrait["accounts"], portrait["credits"])
    portrait["products_by_bank"] = apply_consent_flags(products_by_bank, product_consents)
    (
        portrait_analysis,
        portrait_trajectories,
        portrait_forecast_dates,
        portrait_noise_profile,
        portrait_event_profiles,
    ) = run_analysis_with_details(
        all_transactions,
        float(portrait.get("current_balance") or 0.0),
        date.today() + timedelta(days=30),
        0,
    )
    recurring_source = portrait.get("discovered_events") or portrait_event_profiles
    obligations = derive_obligations(portrait["credits"], recurring_source)
    goal_probability = estimate_goal_probability(
        user_goal,
        portrait_trajectories,
        portrait_forecast_dates,
        obligations,
        recurring_source,
    )
    portrait["analysis"] = portrait_analysis.dict()
    portrait["diagnostics"] = {
        "noise_profile": portrait_noise_profile,
        "forecast_dates": [d.isoformat() for d in portrait_forecast_dates],
        "trajectory_sample": list(portrait_trajectories.shape),
    }
    portrait["goal_probability"] = goal_probability
    if not portrait.get("recurring_events"):
        portrait["recurring_events"] = extract_recurring_events(recurring_source)
    logger.info(
        "Financial portrait for %s: debt=%.2f, monthly=%.2f, sts=%.2f, loans=%d, accounts=%d",
        req.user_id,
        portrait.get("financial_health", {}).get("total_debt", 0.0),
        portrait.get("financial_health", {}).get("total_monthly_payments", 0.0),
        portrait.get("safe_to_spend_daily", 0.0),
        len(portrait["credits"]),
        len(portrait["accounts"]),
    )
    return portrait


async def run_initial_ingestion(req: IngestRequest) -> Dict[str, Any]:
    logger.info("Starting initial ingestion for user %s", req.user_id)
    approved_consents = _require_consents(req.user_id)

    tasks = [
        fetch_bank_data_with_consent(consent.bank_id, consent.consent_id, req.user_id)
        for consent in approved_consents
    ]
    bank_results = await asyncio.gather(*tasks)

    all_transactions: List[Transaction] = []
    bank_statuses: List[Dict[str, str]] = []
    for res in bank_results:
        bank_statuses.append(
            {"bank_name": res["bank_id"], "status": res["status"], "message": res["message"]}
        )
        if res["status"] == "ok":
            all_transactions.extend(res["transactions"])

    if not all_transactions:
        raise HTTPException(
            status_code=status.HTTP_424_FAILED_DEPENDENCY,
            detail="Could not fetch any transactions.",
        )

    logger.info(
        "Initial ingestion completed for user %s (%d transactions)",
        req.user_id,
        len(all_transactions),
    )

    return {
        "status": "ok",
        "transactions_count": len(all_transactions),
        "bank_statuses": bank_statuses,
        "message": "Initial data ingestion complete.",
    }


async def start_analysis(req: AnalysisRequest) -> Dict[str, Any]:
    approved_consents = _require_consents(req.user_id)

    tasks = [
        fetch_bank_data_with_consent(consent.bank_id, consent.consent_id, req.user_id)
        for consent in approved_consents
    ]
    bank_results = await asyncio.gather(*tasks)

    all_transactions: List[Transaction] = []
    bank_statuses: List[Dict[str, str]] = []
    for res in bank_results:
        bank_statuses.append(
            {"bank_name": res["bank_id"], "status": res["status"], "message": res["message"]}
        )
        if res["status"] == "ok":
            all_transactions.extend(res["transactions"])

    if not all_transactions:
        raise HTTPException(
            status_code=status.HTTP_424_FAILED_DEPENDENCY,
            detail="Could not fetch any transactions.",
        )

    (
        analysis_result,
        trajectories,
        forecast_dates,
        noise_profile,
        event_profiles,
    ) = run_analysis_with_details(
        all_transactions,
        req.current_balance,
        req.payment_date,
        req.payment_amount,
    )

    return {
        "analysis_result": analysis_result.dict(),
        "bank_statuses": bank_statuses,
        "discovered_events": event_profiles,
        "noise_profile": noise_profile,
        "forecast_dates": [d.isoformat() for d in forecast_dates],
        "trajectory_shape": list(trajectories.shape),
    }
