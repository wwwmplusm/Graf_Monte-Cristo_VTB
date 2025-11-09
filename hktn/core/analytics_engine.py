"""Financial Pulse analytics engine with probabilistic forecasting."""
from __future__ import annotations

import math
import re
from collections import Counter
from datetime import date, datetime, timedelta
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple, Literal

import numpy as np
import pandas as pd
from scipy.spatial.distance import cosine
from sklearn.cluster import DBSCAN
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.preprocessing import StandardScaler

from pydantic import BaseModel, Field

from .data_models import AnalysisResult, Transaction

# Feature weighting balances numeric and textual signal strength.
_NUMERIC_FEATURE_WEIGHT = 2.5
_TEXT_FEATURE_WEIGHT = 1.0
_DEFAULT_SIMULATIONS = 1200
_MIN_SIGMA_AMOUNT = 1.0


class UserGoal(BaseModel):
    """Represents user's desired financial outcome and preferred pace."""

    goal_type: Literal["pay_debts", "save_money"] = "pay_debts"
    pace: Literal["conservative", "optimal", "fast"] = "optimal"
    goal_details: Dict[str, Any] = Field(default_factory=dict)


def _safe_float(value: Any) -> Optional[float]:
    """Best-effort conversion to float."""
    if value is None:
        return None
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return float(value)
    if isinstance(value, str):
        try:
            return float(value.strip())
        except ValueError:
            return None
    return None


def estimate_goal_probability(
    goal: UserGoal,
    trajectories: np.ndarray,
    forecast_dates: Sequence[date],
    obligations: Optional[Sequence[Dict[str, Any]]] = None,
    event_profiles: Optional[Sequence[Dict[str, Any]]] = None,
) -> int:
    """
    Approximate probability (0-100%) that a user will hit the selected goal.
    save_money: share of forecast paths ending above the target balance.
    pay_debts: compares recurring income vs. required obligations.
    """
    if trajectories.size == 0 or not forecast_dates:
        return 0

    details = goal.goal_details or {}
    terminal_balances = trajectories[:, -1]

    if goal.goal_type == "save_money":
        target_candidates = (
            details.get("save_amount"),
            details.get("target_amount"),
            details.get("targeted_balance"),
        )
        target_amount = next(
            (val for val in ( _safe_float(candidate) for candidate in target_candidates ) if val is not None),
            None,
        )
        if target_amount is None or target_amount <= 0:
            target_amount = float(np.median(terminal_balances))
        probability = float(np.mean(terminal_balances >= target_amount))
        return int(round(np.clip(probability * 100.0, 0.0, 100.0)))

    # pay_debts
    obligation_total = sum(float(item.get("amount") or 0.0) for item in obligations or [])
    targeted_payment = _safe_float(details.get("targeted_monthly_payment"))
    if obligation_total <= 0 and targeted_payment:
        obligation_total = targeted_payment
    if obligation_total <= 0:
        return 85  # nothing to pay off

    income_total = 0.0
    for profile in event_profiles or []:
        if profile.get("is_income"):
            income_total += float(profile.get("mu_amount") or 0.0)
    if income_total <= 0:
        declared_income = _safe_float(details.get("declared_income"))
        income_total = declared_income or 0.0
    if income_total <= 0:
        return 25

    coverage_ratio = income_total / max(obligation_total, 1.0)
    probability = np.clip(coverage_ratio / 1.5, 0.0, 1.0) * 100.0
    return int(round(probability))


def _coerce_to_date(value: Any) -> Optional[date]:
    """Normalize multiple date formats to python date."""
    if value is None:
        return None
    if isinstance(value, date) and not isinstance(value, datetime):
        return value
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, pd.Timestamp):
        return value.to_pydatetime().date()
    if isinstance(value, str):
        try:
            normalized = value.replace("Z", "")
            return datetime.fromisoformat(normalized).date()
        except ValueError:
            return None
    return None


def extract_recurring_events(
    event_profiles: Sequence[Dict[str, Any]],
    limit: int = 8,
) -> List[Dict[str, Any]]:
    """Produce a simplified list of recurring events for UI."""
    events: List[Dict[str, Any]] = []
    today = date.today()

    for profile in event_profiles or []:
        label = profile.get("label") or profile.get("merchant") or "Recurring"
        amount = round(float(profile.get("mu_amount") or 0.0), 2)
        is_income = bool(profile.get("is_income"))
        frequency_days = int(profile.get("frequency_days") or profile.get("frequencyDays") or 30)
        frequency_days = max(frequency_days, 1)
        last_date = _coerce_to_date(
            profile.get("last_date")
            or profile.get("lastDate")
            or profile.get("last_occurrence")
            or profile.get("lastOccurrence")
        )
        next_date = last_date or today
        while next_date <= today:
            next_date += timedelta(days=frequency_days)

        events.append(
            {
                "name": label,
                "amount": amount,
                "is_income": is_income,
                "next_date": next_date.isoformat(),
                "frequency_days": frequency_days,
            }
        )

    events.sort(key=lambda item: item["next_date"])
    return events[:limit]


def _calculate_annuity_payment(principal: float, annual_rate_percent: float, term_months: int) -> float:
    """
    Compute best-effort annuity payment when API does not return min_payment explicitly.
    """
    if principal <= 0:
        return 0.0
    if term_months <= 0:
        return 0.0
    if annual_rate_percent <= 0:
        return round(principal / term_months, 2)

    monthly_rate = (annual_rate_percent / 100.0) / 12.0
    try:
        factor = (1 + monthly_rate) ** term_months
        denom = factor - 1
        if denom == 0:
            payment = principal / term_months
        else:
            payment = principal * (monthly_rate * factor / denom)
    except OverflowError:
        payment = principal / term_months
    return round(payment, 2)


def _parse_payment_date(date_raw: Optional[str]) -> Optional[date]:
    """Safely parse payment date from ISO-like formats."""
    if not date_raw:
        return None
    try:
        normalized = date_raw.replace("Z", "")
        return datetime.fromisoformat(normalized).date()
    except (ValueError, TypeError, AttributeError):
        return None


def _create_obligations_from_credits(credits: Sequence[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Transform credit agreements into deterministic payment obligations."""
    obligations: List[Dict[str, Any]] = []
    for credit in credits or []:
        payment_amount = float(credit.get("min_payment") or credit.get("payment") or 0.0)
        if payment_amount <= 0:
            principal = float(credit.get("balance") or credit.get("principal") or 0.0)
            rate = float(credit.get("rate") or credit.get("interest_rate") or 0.0)
            term_months = int(credit.get("term_months") or credit.get("termMonths") or 36)
            if principal > 0:
                payment_amount = _calculate_annuity_payment(principal, rate * 100 if rate < 1 else rate, term_months)

        if payment_amount <= 0:
            continue

        obligations.append(
            {
                "label": credit.get("name") or credit.get("product") or "Кредитный платеж",
                "amount": round(payment_amount, 2),
                "due_date": _parse_payment_date(credit.get("next_payment_date")),
                "source": "credit_agreement",
            }
        )
    return obligations


def _credit_identifier(credit: Dict[str, Any]) -> Optional[str]:
    for key in ("id", "agreement_id", "credit_id", "product_id"):
        if credit.get(key):
            return str(credit[key])
    return None


PACE_COEFFICIENTS: Dict[str, float] = {
    "conservative": 0.10,
    "optimal": 0.25,
    "fast": 0.50,
}


def _find_next_income_event(event_profiles: List[Dict[str, Any]], start_date: date) -> Optional[Dict[str, Any]]:
    """Locate the soonest expected income event."""
    candidates: List[Dict[str, Any]] = []
    for event in event_profiles or []:
        if not event.get("is_income"):
            continue
        last_date: date = event.get("last_date") or start_date
        frequency = timedelta(days=max(int(round(event.get("frequency_days", 30) or 30)), 1))
        next_date = last_date
        while next_date <= start_date:
            next_date += frequency
        candidates.append(
            {
                "next_occurrence": next_date,
                "mu_amount": float(event.get("mu_amount") or 0.0),
                "label": event.get("label") or "Доход",
            }
        )
    if not candidates:
        return None
    return min(candidates, key=lambda item: item["next_occurrence"])


def _extract_account_balance(account: Dict[str, Any]) -> float:
    """Best-effort balance extraction across heterogeneous account payloads."""
    balance_keys = (
        "available_balance",
        "availableBalance",
        "balance",
        "current_balance",
        "currentBalance",
    )
    for key in balance_keys:
        if key in account and account[key] is not None:
            try:
                return float(account[key])
            except (TypeError, ValueError):
                continue
    return 0.0


def calculate_daily_s2s(
    current_balance: float,
    event_profiles: List[Dict[str, Any]],
    obligations: List[Dict[str, Any]],
    user_goal: UserGoal,
    start_date: Optional[date] = None,
) -> float:
    """Estimate safe-to-spend per day leveraging detected income cycle and obligations."""
    if start_date is None:
        start_date = date.today()

    next_income = _find_next_income_event(event_profiles, start_date)
    if next_income:
        cycle_end = next_income["next_occurrence"]
    else:
        cycle_end = start_date + timedelta(days=30)

    days_in_cycle = max((cycle_end - start_date).days, 1)

    cycle_expenses = 0.0
    for obligation in obligations or []:
        due_date = obligation.get("due_date")
        if isinstance(due_date, date) and start_date < due_date <= cycle_end:
            cycle_expenses += float(obligation.get("amount") or 0.0)

    for event in event_profiles or []:
        if event.get("is_income"):
            continue
        cycle_expenses += abs(float(event.get("mu_amount") or 0.0))

    free_cash = current_balance - cycle_expenses
    if free_cash <= 0:
        return 0.0

    reserve = 0.0
    if user_goal.goal_type == "pay_debts":
        reserve = free_cash * PACE_COEFFICIENTS.get(user_goal.pace, 0.25)

    spendable = max(0.0, free_cash - reserve)
    return round(spendable / days_in_cycle, 2)


def _normalize_description(value: Optional[str]) -> str:
    """Normalize merchant description: lowercase alpha characters only."""
    if not isinstance(value, str):
        return "unknown"
    cleaned = re.sub(r"[^a-zA-Zа-яА-Я\s]", " ", value).lower()
    normalized = re.sub(r"\s+", " ", cleaned).strip()
    return normalized or "unknown"


def _prepare_transactions_df(transactions: Sequence[Transaction]) -> pd.DataFrame:
    """Convert transactions into a consistently typed DataFrame."""
    if not transactions:
        return pd.DataFrame(columns=["transactionId", "amount", "description", "bookingDate"])

    df = pd.DataFrame([tx.model_dump() for tx in transactions])
    df["bookingDate"] = pd.to_datetime(df["bookingDate"])
    df = df.sort_values("bookingDate").reset_index(drop=True)
    df["description"] = df["description"].fillna("")
    df["normalized_description"] = df["description"].apply(_normalize_description)
    df["day_of_month"] = df["bookingDate"].dt.day.astype(float)
    df["is_income"] = (df["amount"] >= 0).astype(int)
    return df


def _discover_events(df: pd.DataFrame) -> pd.DataFrame:
    """Cluster transactions that form recurring financial events."""
    if df.empty:
        df["cluster_id"] = []
        return df

    text_vectorizer = TfidfVectorizer(min_df=1, ngram_range=(1, 2))
    text_features = text_vectorizer.fit_transform(df["normalized_description"]).toarray()
    if text_features.size == 0:
        text_features = np.zeros((len(df), 1))

    scaler = StandardScaler()
    numeric_features = df[["amount", "day_of_month"]].astype(float)
    scaled_numeric = scaler.fit_transform(numeric_features) * _NUMERIC_FEATURE_WEIGHT
    scaled_text = text_features * _TEXT_FEATURE_WEIGHT

    feature_matrix = np.hstack([scaled_numeric, scaled_text])

    if len(df) < 2:
        cluster_labels = np.full(len(df), -1, dtype=int)
    else:
        dbscan = DBSCAN(eps=0.85, min_samples=2, metric="euclidean")
        cluster_labels = dbscan.fit_predict(feature_matrix)

    df_with_clusters = df.copy()
    df_with_clusters["cluster_id"] = cluster_labels
    return df_with_clusters


def _cluster_label(descriptions: Iterable[str]) -> str:
    """Generate a human readable label for cluster."""
    filtered = [desc for desc in descriptions if desc]
    if not filtered:
        return "Recurring event"

    token_counter: Counter[str] = Counter()
    for desc in filtered:
        token_counter.update(desc.split())

    most_common = token_counter.most_common(2)
    label = " ".join(token for token, _ in most_common[:2])
    return label.title() if label else "Recurring event"


def _cluster_coherence(normalized_descriptions: Sequence[str]) -> float:
    """Estimate textual cohesion inside the cluster using cosine similarity."""
    if len(normalized_descriptions) <= 1:
        return 1.0

    vectorizer = TfidfVectorizer()
    matrix = vectorizer.fit_transform(normalized_descriptions).toarray()
    centroid = matrix.mean(axis=0)
    # Guard against degenerate vectors.
    if not np.any(centroid):
        return 0.5
    similarities = []
    for row in matrix:
        if not np.any(row):
            continue
        similarities.append(1 - cosine(centroid, row))
    return float(np.mean(similarities)) if similarities else 0.5


def _profile_events(df_with_clusters: pd.DataFrame) -> Tuple[List[Dict[str, object]], Dict[str, float]]:
    """Build probabilistic profiles for discovered events and background noise."""
    event_profiles: List[Dict[str, object]] = []

    for cluster_id, cluster_df in df_with_clusters.groupby("cluster_id"):
        if cluster_id == -1:
            continue

        cluster_df = cluster_df.sort_values("bookingDate")
        amount_series = cluster_df["amount"]
        day_series = cluster_df["day_of_month"]

        # Exponentially weighted mean emphasises recent behavior.
        mu_amount = float(cluster_df["amount"].ewm(alpha=0.35).mean().iloc[-1])
        sigma_amount = float(amount_series.std(ddof=0)) if len(cluster_df) > 1 else 0.0
        sigma_amount = max(sigma_amount, _MIN_SIGMA_AMOUNT)

        mu_day = float(day_series.mean())
        sigma_day = float(day_series.std(ddof=0)) if len(cluster_df) > 1 else 1.5
        sigma_day = max(sigma_day, 1.5)

        intervals = cluster_df["bookingDate"].diff().dt.days.dropna()
        if not intervals.empty:
            frequency_days = float(np.clip(np.median(intervals), 1, 45))
        else:
            frequency_days = 30.0

        descriptions = cluster_df["description"].tolist()
        normalized_descriptions = cluster_df["normalized_description"].tolist()
        label = _cluster_label(normalized_descriptions)
        coherence = _cluster_coherence(normalized_descriptions)
        last_date = cluster_df["bookingDate"].iloc[-1].date()
        dominant_sign = cluster_df["is_income"].mean()

        event_profiles.append(
            {
                "cluster_id": int(cluster_id),
                "label": label,
                "mu_amount": mu_amount,
                "sigma_amount": sigma_amount,
                "mu_day": mu_day,
                "sigma_day": sigma_day,
                "frequency_days": frequency_days,
                "last_date": last_date,
                "is_income": bool(dominant_sign >= 0.5),
                "coherence": coherence,
                "sample_size": len(cluster_df),
                "descriptions": descriptions,
            }
        )

    noise_df = df_with_clusters[df_with_clusters["cluster_id"] == -1]
    if noise_df.empty:
        noise_profile = {"mu_daily_spend_noise": 0.0, "sigma_daily_spend_noise": 0.0}
    else:
        daily_totals = noise_df.groupby(noise_df["bookingDate"].dt.date)["amount"].sum()
        mu_noise = float(daily_totals.mean()) if not daily_totals.empty else 0.0
        sigma_noise = float(daily_totals.std(ddof=0)) if len(daily_totals) > 1 else _MIN_SIGMA_AMOUNT
        noise_profile = {
            "mu_daily_spend_noise": mu_noise,
            "sigma_daily_spend_noise": max(abs(sigma_noise), _MIN_SIGMA_AMOUNT),
        }

    return event_profiles, noise_profile


def _initial_event_schedule(event_profiles: Sequence[Dict[str, object]], start_date: date) -> List[date]:
    """Calculate the next occurrence date for each event at simulation start."""
    schedule: List[date] = []
    for event in event_profiles:
        frequency = max(int(round(event["frequency_days"])), 1)
        last_date: date = event["last_date"]
        next_date = last_date
        while next_date <= start_date:
            next_date = next_date + timedelta(days=frequency)
        schedule.append(next_date)
    return schedule


def _draw_event_amount(rng: np.random.Generator, mu: float, sigma: float) -> float:
    sigma_safe = sigma if sigma > 0 else max(abs(mu) * 0.1, _MIN_SIGMA_AMOUNT)
    return float(rng.normal(mu, sigma_safe))


def _run_monte_carlo_simulation(
    current_balance: float,
    event_profiles: Sequence[Dict[str, object]],
    noise_profile: Dict[str, float],
    horizon_days: int,
    n_simulations: int = _DEFAULT_SIMULATIONS,
    random_seed: Optional[int] = 42,
) -> np.ndarray:
    """Simulate future balance trajectories using Monte Carlo sampling."""
    horizon_days = max(int(horizon_days), 1)
    if n_simulations <= 0:
        raise ValueError("n_simulations must be positive")

    rng = np.random.default_rng(random_seed)
    trajectories = np.zeros((n_simulations, horizon_days), dtype=float)
    start_date = date.today()

    for sim_idx in range(n_simulations):
        balance = current_balance
        next_occurrences = _initial_event_schedule(event_profiles, start_date)
        for day_offset in range(horizon_days):
            current_date = start_date + timedelta(days=day_offset + 1)
            daily_delta = 0.0

            for idx, event in enumerate(event_profiles):
                if current_date < next_occurrences[idx]:
                    continue

                mu_amount = float(event["mu_amount"])
                sigma_amount = float(event["sigma_amount"])
                expected_day = float(event["mu_day"])
                sigma_day = float(event["sigma_day"])

                day_gap = abs(current_date.day - expected_day)
                trigger_probability = math.exp(-0.5 * (day_gap / sigma_day) ** 2)
                trigger_probability = min(max(trigger_probability, 0.1), 0.99)

                if rng.random() <= trigger_probability:
                    daily_delta += _draw_event_amount(rng, mu_amount, sigma_amount)
                    frequency = max(int(round(event["frequency_days"])), 1)
                    next_occurrences[idx] = current_date + timedelta(days=frequency)
                else:
                    # event skipped; revisit the next day without advancing schedule
                    pass

            mu_noise = float(noise_profile.get("mu_daily_spend_noise", 0.0))
            sigma_noise = float(noise_profile.get("sigma_daily_spend_noise", 0.0))
            if abs(mu_noise) > 1e-6 or sigma_noise > 1e-6:
                daily_delta += _draw_event_amount(rng, mu_noise, max(sigma_noise, _MIN_SIGMA_AMOUNT))

            balance += daily_delta
            trajectories[sim_idx, day_offset] = balance

    return trajectories


def _color_zone(probability_percent: float) -> Tuple[str, str]:
    """Map probability to color code and human recommendation."""
    if probability_percent >= 95:
        return "green", "Платеж почти гарантирован. Можно планировать дополнительные цели."
    if probability_percent >= 70:
        return "yellow", "Вероятность средняя: оптимизируйте расходы и держите резерв."
    return "red", "Высокий риск дефицита. Рассмотрите пополнение или перенос платежа."


def _execute_engine(
    transactions: Sequence[Transaction],
    current_balance: float,
    payment_date: date,
    payment_amount: float,
) -> Tuple[AnalysisResult, Dict[str, object]]:
    df = _prepare_transactions_df(transactions)
    if df.empty:
        result = AnalysisResult(
            payment_date=payment_date,
            payment_amount=payment_amount,
            success_probability_percent=0,
            recommendation="Недостаточно данных для анализа. Загрузите транзакции.",
            color_zone="red",
        )
        details = {
            "trajectories": np.zeros((_DEFAULT_SIMULATIONS, 1)),
            "forecast_dates": [date.today()],
            "event_profiles": [],
            "noise_profile": {"mu_daily_spend_noise": 0.0, "sigma_daily_spend_noise": _MIN_SIGMA_AMOUNT},
            "payment_index": 0,
        }
        return result, details

    df_with_clusters = _discover_events(df)
    event_profiles, noise_profile = _profile_events(df_with_clusters)

    today = date.today()
    days_until_payment = max((payment_date - today).days, 0)
    horizon_days = max(days_until_payment + 1, 30)

    trajectories = _run_monte_carlo_simulation(
        current_balance=current_balance,
        event_profiles=event_profiles,
        noise_profile=noise_profile,
        horizon_days=horizon_days,
    )

    forecast_dates = [today + timedelta(days=offset + 1) for offset in range(horizon_days)]
    payment_index = min(days_until_payment, horizon_days - 1)

    payment_balances = trajectories[:, payment_index]
    probability = float(np.mean(payment_balances >= payment_amount) * 100.0)
    probability_percent = int(round(probability))

    color_zone, recommendation = _color_zone(probability)

    analysis = AnalysisResult(
        payment_date=payment_date,
        payment_amount=payment_amount,
        success_probability_percent=probability_percent,
        recommendation=recommendation,
        color_zone=color_zone,
    )

    details = {
        "trajectories": trajectories,
        "forecast_dates": forecast_dates,
        "event_profiles": event_profiles,
        "noise_profile": noise_profile,
        "payment_index": payment_index,
    }

    return analysis, details


def run_analysis(
    transactions: Sequence[Transaction],
    current_balance: float,
    payment_date: date,
    payment_amount: float,
) -> AnalysisResult:
    """Public API returning only AnalysisResult for backward compatibility."""
    analysis, _details = _execute_engine(transactions, current_balance, payment_date, payment_amount)
    return analysis


def run_analysis_with_details(
    transactions: Sequence[Transaction],
    current_balance: float,
    payment_date: date,
    payment_amount: float,
) -> Tuple[AnalysisResult, np.ndarray, List[date], Dict[str, object], List[Dict[str, object]]]:
    """Extended API returning forecast trajectories and diagnostic profiles."""
    analysis, details = _execute_engine(transactions, current_balance, payment_date, payment_amount)
    return (
        analysis,
        details["trajectories"],
        details["forecast_dates"],
        details["noise_profile"],
        details["event_profiles"],
    )


def calculate_safe_to_spend(
    obligations: Sequence[Dict[str, object]],
    forecast_trajectories: np.ndarray,
    forecast_dates: Sequence[date],
    confidence_level: float = 0.8,
) -> float:
    """Estimate safe-to-spend amount at a chosen confidence level."""
    if forecast_trajectories.size == 0 or not forecast_dates:
        return 0.0

    confidence_level = float(np.clip(confidence_level, 0.01, 0.99))
    percentile = (1.0 - confidence_level) * 100.0
    lower_envelope = np.percentile(forecast_trajectories, percentile, axis=0)

    horizon_end = forecast_dates[-1]
    obligations_total = 0.0
    for obligation in obligations or []:
        amount = float(obligation.get("amount", 0.0) or 0.0)
        due_raw = obligation.get("due_date")
        due_date: Optional[date] = None
        if isinstance(due_raw, date):
            due_date = due_raw
        elif isinstance(due_raw, pd.Timestamp):
            due_date = due_raw.date()
        elif hasattr(due_raw, "to_pydatetime"):
            due_date = due_raw.to_pydatetime().date()
        elif isinstance(due_raw, str):
            try:
                due_date = datetime.fromisoformat(due_raw).date()
            except ValueError:
                due_date = None
        if due_date is None or due_date > horizon_end:
            continue
        obligations_total += amount

    safe_buffer = float(np.min(lower_envelope)) - obligations_total
    return max(0.0, round(safe_buffer, 2))


def rank_credits(credits: Sequence[Dict[str, object]]) -> List[Dict[str, object]]:
    """Produce a stress-based ranking for outstanding credits."""
    ranked: List[Dict[str, object]] = []
    for credit in credits or []:
        balance = float(credit.get("balance") or credit.get("principal") or 0.0)
        rate = float(credit.get("rate") or credit.get("interest_rate") or 0.0)
        min_payment = float(credit.get("min_payment") or credit.get("payment") or 0.0)
        days_past_due = float(credit.get("days_past_due") or 0.0)

        utilization = min(balance / max(credit.get("limit", balance or 1.0), 1.0), 1.0)
        stress_score = rate * 100 + min_payment / max(balance, 1.0) * 50 + days_past_due * 2 + utilization * 25

        ranked.append(
            {
                "name": credit.get("name") or credit.get("product") or "Кредит",
                "balance": round(balance, 2),
                "rate": round(rate, 4),
                "min_payment": round(min_payment, 2),
                "days_past_due": int(days_past_due),
                "stress_score": round(stress_score, 2),
            }
        )

    ranked.sort(key=lambda item: item["stress_score"], reverse=True)
    return ranked


def build_financial_portrait(
    transactions: Sequence[Transaction],
    credits: Sequence[Dict[str, Any]],
    accounts: Sequence[Dict[str, Any]],
    user_goal: UserGoal,
) -> Dict[str, Any]:
    """Compose a holistic financial portrait combining probabilistic and deterministic insights."""
    df = _prepare_transactions_df(transactions)
    if df.empty:
        return {
            "safe_to_spend_daily": 0.0,
            "credit_rankings": [],
            "discovered_events": [],
            "recurring_events": [],
            "upcoming_payments": [],
            "financial_health": {"total_debt": 0.0, "total_monthly_payments": 0.0},
            "noise_profile": {"mu_daily_spend_noise": 0.0, "sigma_daily_spend_noise": 0.0},
            "next_income_event": None,
            "error": "Недостаточно транзакций для анализа.",
        }

    df_with_clusters = _discover_events(df)
    event_profiles, noise_profile = _profile_events(df_with_clusters)

    obligations = _create_obligations_from_credits(credits)
    current_balance = sum(_extract_account_balance(acc) for acc in accounts or [])
    daily_s2s = calculate_daily_s2s(current_balance, event_profiles, obligations, user_goal)

    ranked_credits = rank_credits(credits)
    next_income_event = _find_next_income_event(event_profiles, date.today())

    upcoming_payments = [
        obligation
        for obligation in obligations
        if isinstance(obligation.get("due_date"), date) and obligation["due_date"] >= date.today()
    ]
    upcoming_payments.sort(key=lambda item: item["due_date"])

    total_debt = sum(float(c.get("balance") or c.get("principal") or 0.0) for c in credits or [])
    total_monthly_payments = sum(obligation["amount"] for obligation in obligations)

    upcoming_payments_payload = [
        {
            "name": obligation.get("label") or "Обязательный платёж",
            "amount": obligation.get("amount"),
            "due_date": obligation.get("due_date").isoformat()
            if isinstance(obligation.get("due_date"), date)
            else obligation.get("due_date"),
            "source": obligation.get("source"),
        }
        for obligation in upcoming_payments
    ]

    goal_details = user_goal.goal_details or {}
    close_loan_ids = [str(item) for item in goal_details.get("close_loan_ids") or []]
    targeted_balance = 0.0
    if close_loan_ids:
        lookup = {_credit_identifier(credit): credit for credit in credits or []}
        for loan_id in close_loan_ids:
            credit = lookup.get(str(loan_id))
            if not credit:
                continue
            targeted_balance += float(
                credit.get("outstanding_balance")
                or credit.get("balance")
                or credit.get("principal")
                or 0.0
            )
    targeted_balance = round(targeted_balance, 2) if targeted_balance else 0.0

    timeline_months = goal_details.get("timeline_months")
    expected_close_date = goal_details.get("expected_close_date")
    if not expected_close_date and timeline_months:
        try:
            months_int = int(timeline_months)
            expected_close_date = (date.today() + timedelta(days=months_int * 30)).isoformat()
        except (TypeError, ValueError):
            expected_close_date = None

    targeted_monthly_payment = goal_details.get("targeted_monthly_payment")
    if not targeted_monthly_payment and timeline_months and targeted_balance:
        try:
            targeted_monthly_payment = round(targeted_balance / max(float(timeline_months), 1.0), 2)
        except (TypeError, ValueError):
            targeted_monthly_payment = None

    if user_goal.goal_type == "pay_debts":
        target_amount = goal_details.get("targeted_loan_amount") or targeted_balance or total_debt
    else:
        target_amount = goal_details.get("save_amount") or goal_details.get("target_amount")
    if target_amount is not None:
        try:
            target_amount = round(float(target_amount), 2)
        except (TypeError, ValueError):
            target_amount = None

    goal_summary = {
        "type": user_goal.goal_type,
        "pace": user_goal.pace,
        "speed": goal_details.get("close_speed") or goal_details.get("save_speed") or user_goal.pace,
        "target_amount": target_amount,
        "close_loan_ids": close_loan_ids,
        "targeted_balance": targeted_balance or None,
        "timeline_months": timeline_months,
        "expected_close_date": expected_close_date,
        "recommended_monthly_payment": targeted_monthly_payment,
    }

    return {
        "safe_to_spend_daily": daily_s2s,
        "current_balance": round(current_balance, 2),
        "credit_rankings": ranked_credits,
        "discovered_events": event_profiles,
        "upcoming_payments": upcoming_payments_payload,
        "timeline": upcoming_payments_payload,
        "financial_health": {
            "total_debt": round(total_debt, 2),
            "total_monthly_payments": round(total_monthly_payments, 2),
        },
        "recurring_events": extract_recurring_events(event_profiles),
        "noise_profile": noise_profile,
        "next_income_event": next_income_event,
        "goal_summary": goal_summary,
    }
