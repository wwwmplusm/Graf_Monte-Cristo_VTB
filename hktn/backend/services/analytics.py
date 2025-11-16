from __future__ import annotations

import asyncio
import logging
from datetime import date, datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Sequence

from fastapi import HTTPException, status

from hktn.core.analytics_engine import (
    build_financial_portrait,
    calculate_daily_s2s,
    derive_obligations,
    estimate_goal_probability,
    extract_recurring_events,
    rank_credits,
    run_analysis_with_details,
    _discover_events,
    _extract_account_balance,
    _prepare_transactions_df,
    _profile_events,
    _derive_event_label,
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
from .banking import (
    _sum_balance_amounts,
    fetch_bank_accounts_with_consent,
    fetch_bank_balances_with_consent,
    fetch_bank_credits,
    fetch_bank_data_with_consent,
)
from .goals import compose_user_goal
from .products import apply_consent_flags, build_account_product, build_credit_product, group_products_by_bank

logger = logging.getLogger("finpulse.backend.analytics")


def _parse_iso_date(value: Any) -> Optional[date]:
    if isinstance(value, date):
        return value
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, str) and value:
        try:
            return date.fromisoformat(value)
        except ValueError:
            try:
                return datetime.fromisoformat(value).date()
            except ValueError:
                return None
    return None


def _generate_budget_breakdown(
    spendable_total: float,
    event_profiles: Sequence[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """Distribute spendable cash across recurring spending categories."""
    if spendable_total <= 0:
        return []

    category_spend: Dict[str, float] = {}
    for event in event_profiles or []:
        if event.get("is_income"):
            continue
        if event.get("source") not in (None, "expense_event", "recurring_debit"):
            continue
        avg_amount = abs(float(event.get("mu_amount") or 0.0))
        if avg_amount <= 0:
            continue
        label = _derive_event_label(event)
        category_spend[label] = category_spend.get(label, 0.0) + avg_amount

    total_avg_spend = sum(category_spend.values())
    if total_avg_spend <= 0:
        return []

    budget: List[Dict[str, Any]] = []
    for category, avg_amount in category_spend.items():
        proportion = avg_amount / total_avg_spend
        budget.append(
            {
                "category": category,
                "amount": round(spendable_total * proportion, 2),
            }
        )

    budget.sort(key=lambda item: item["amount"], reverse=True)
    return budget


def _collect_cycle_events(
    obligations: Sequence[Dict[str, Any]],
    cycle_start_iso: Optional[str],
    cycle_end_iso: Optional[str],
) -> List[Dict[str, Any]]:
    """Return obligations that fall within the current planning cycle."""
    cycle_start = _parse_iso_date(cycle_start_iso)
    cycle_end = _parse_iso_date(cycle_end_iso)
    if not cycle_start or not cycle_end:
        return []

    events: List[Dict[str, Any]] = []
    for obligation in obligations or []:
        due_date = obligation.get("due_date")
        due = _parse_iso_date(due_date)
        if due is None:
            continue
        if not (cycle_start <= due < cycle_end):
            continue
        events.append(
            {
                "name": obligation.get("label") or "Обязательный платёж",
                "amount": float(obligation.get("amount") or 0.0),
                "date": due.isoformat(),
                "is_income": False,
                "source": obligation.get("source"),
                "mcc_code": obligation.get("mcc_code"),
                "merchant_name": obligation.get("merchant_name"),
            }
        )

    events.sort(key=lambda item: item["date"])
    return events


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

    account_tasks = [
        fetch_bank_accounts_with_consent(consent.bank_id, consent.consent_id, user_id) for consent in approved_consents
    ]
    balance_tasks = [
        fetch_bank_balances_with_consent(consent.bank_id, consent.consent_id, user_id) for consent in approved_consents
    ]
    credit_tasks = [fetch_bank_credits(consent.bank_id, consent.consent_id, user_id) for consent in approved_consents]
    tx_tasks = [fetch_bank_data_with_consent(consent.bank_id, consent.consent_id, user_id) for consent in approved_consents]

    account_results, balance_results, credit_results, tx_results = await asyncio.gather(
        asyncio.gather(*account_tasks),
        asyncio.gather(*balance_tasks),
        asyncio.gather(*credit_tasks),
        asyncio.gather(*tx_tasks),
    )

    all_accounts: List[Dict[str, Any]] = []
    bank_statuses: Dict[str, Dict[str, Any]] = {}
    total_balance = 0.0
    fetched_at = datetime.now(timezone.utc).isoformat()

    for res in account_results:
        bank_id = res["bank_id"]
        bank_statuses[bank_id] = {
            "bank_name": res.get("bank_name", bank_id),
            "status": res["status"],
            "fetched_at": None,
        }
        if res["status"] == "ok":
            all_accounts.extend(res.get("accounts", []))
            bank_statuses[bank_id]["fetched_at"] = fetched_at

    for res in balance_results:
        if res["status"] != "ok":
            continue
        for balance_entry in res.get("balances", []):
            amount = _extract_account_balance({"balances": [balance_entry]})
            total_balance += amount

    all_credits: List[Dict[str, Any]] = [
        credit for res in credit_results if res["status"] == "ok" for credit in res.get("credits", [])
    ]
    all_transactions: List[Transaction] = [
        tx for res in tx_results if res["status"] == "ok" for tx in res.get("transactions", [])
    ]

    if not all_transactions:
        raise HTTPException(
            status_code=status.HTTP_424_FAILED_DEPENDENCY,
            detail="Нет транзакций для анализа.",
        )

    df = _prepare_transactions_df(all_transactions)
    event_profiles, _ = _profile_events(_discover_events(df))
    income_events = [event for event in event_profiles if event.get("is_income")]

    today = date.today()
    next_income_date: Optional[date] = None
    if income_events:
        next_dates: List[date] = []
        for event in income_events:
            last_date = event.get("last_date") or today
            if not isinstance(last_date, date):
                continue
            frequency = timedelta(days=int(event.get("frequency_days") or 30))
            candidate = last_date
            while candidate <= today:
                candidate += frequency
            next_dates.append(candidate)
        if next_dates:
            next_income_date = min(next_dates)

    horizon_end_date = next_income_date or (today + timedelta(days=30))
    days_until_next_income = max((horizon_end_date - today).days, 1)

    obligations = derive_obligations(all_credits, event_profiles)
    upcoming_payments_total = 0.0
    for obligation in obligations:
        due_date = obligation.get("due_date")
        if isinstance(due_date, datetime):
            due_date = due_date.date()
        if isinstance(due_date, date) and today <= due_date <= horizon_end_date:
            upcoming_payments_total += float(obligation.get("amount") or 0.0)

    spendable_balance = total_balance - upcoming_payments_total
    safe_to_spend_daily = spendable_balance / days_until_next_income if days_until_next_income > 0 else 0.0

    return {
        "total_balance": round(total_balance, 2),
        "accounts": all_accounts,
        "bank_statuses": bank_statuses,
        "safe_to_spend_daily": round(max(0.0, safe_to_spend_daily), 2),
        "next_income_date": next_income_date.isoformat() if next_income_date else None,
        "days_until_next_income": days_until_next_income,
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
    balance_tasks = [
        fetch_bank_balances_with_consent(consent.bank_id, consent.consent_id, req.user_id)
        for consent in approved_consents
    ]

    tx_results, credit_results, account_results, balance_results = await asyncio.gather(
        asyncio.gather(*tx_tasks),
        asyncio.gather(*credit_tasks),
        asyncio.gather(*account_tasks),
        asyncio.gather(*balance_tasks),
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

    balance_total = 0.0
    balance_statuses: List[Dict[str, str]] = []
    for res in balance_results:
        balance_statuses.append({"bank": res["bank_id"], "status": res["status"], "message": res.get("message") or ""})
        entries = res.get("balances") or []
        balance_total += _sum_balance_amounts(entries)


    product_consents = get_product_consents_for_user(req.user_id)
    bank_status_logs = get_recent_bank_status_logs(req.user_id)

    if not all_transactions:
        return {
            "error": "Could not fetch any transactions.",
        "bank_statuses": {
            "transactions": tx_statuses,
            "credits": credit_statuses,
            "accounts": account_statuses,
            "balances": balance_statuses,
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
        balance_override=balance_total if balance_total > 0 else None,
    )
    portrait["bank_statuses"] = {
        "transactions": tx_statuses,
        "credits": credit_statuses,
        "accounts": account_statuses,
        "balances": balance_statuses,
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
