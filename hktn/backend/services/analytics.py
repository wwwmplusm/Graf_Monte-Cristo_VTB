from __future__ import annotations

import asyncio
import logging
from datetime import date, datetime, timedelta
from typing import Any, Dict, List, Optional, Sequence, Tuple

from fastapi import HTTPException, status

from hktn.core.database import (
    StoredConsent,
    find_approved_consents,
    find_consent_by_type,
    get_user_financial_inputs,
    get_cached_dashboard,
    save_dashboard_cache,
    invalidate_dashboard_cache,
    get_bank_data_cache,
    save_bank_data_cache,
)

from ..config import settings
from ..schemas import IntegrationStatusResponse
from .algorithms import (
    adp_calculation,
    mdp_calculation,
    sts_calculation,
    total_debit_balance_calculation,
    total_debt_calculation,
    transactions_categorization_salary_and_loans,
)
from .banking import (
    _coerce_to_float,
    _normalize_balance_entry,
    _sum_balance_amounts,
    fetch_bank_accounts_with_consent,
    fetch_bank_balances_with_consent,
    fetch_bank_credits,
    fetch_bank_data_with_consent,
)

logger = logging.getLogger("finpulse.backend.analytics")


def _require_consents(user_id: str) -> List[StoredConsent]:
    consents = find_approved_consents(user_id, consent_type="accounts")
    if not consents:
        raise HTTPException(
            status_code=status.HTTP_424_FAILED_DEPENDENCY,
            detail="No approved consents found.",
        )
    return list(consents)


def _parse_iso_date(value: Optional[str]) -> Optional[date]:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value).date()
    except ValueError:
        return None


def _future_date_or_fallback(raw_value: Optional[str], fallback_days: int) -> date:
    parsed = _parse_iso_date(raw_value)
    today = date.today()
    if parsed and parsed > today:
        return parsed
    return today + timedelta(days=max(fallback_days, 1))


def _load_financial_inputs(user_id: str) -> Dict[str, object]:
    payload = get_user_financial_inputs(user_id) or {}
    salary_amount = float(payload.get("salary_amount") or settings.default_salary_amount or 0.0)
    salary_date = _future_date_or_fallback(payload.get("next_salary_date"), settings.default_next_salary_days)
    credit_amount = float(payload.get("credit_payment_amount") or settings.default_credit_payment_amount or 0.0)
    credit_date = _future_date_or_fallback(payload.get("credit_payment_date"), settings.default_credit_payment_days)
    return {
        "salary_amount": salary_amount,
        "salary_date": salary_date,
        "credit_payment_amount": credit_amount,
        "credit_payment_date": credit_date,
    }


def _calculate_safe_to_spend(
    balance: float,
    salary_amount: float,
    salary_date: date,
    credit_payment_amount: float,
    credit_payment_date: date,
) -> Dict[str, object]:
    today = date.today()
    if salary_date <= today:
        salary_date = today + timedelta(days=max(settings.default_next_salary_days, 1))
    days_until_salary = max((salary_date - today).days, 1)

    credit_obligation = 0.0
    if credit_payment_amount and credit_payment_date and credit_payment_date <= salary_date:
        credit_obligation = credit_payment_amount

    safe_total = balance + salary_amount - credit_obligation
    safe_daily = max(0.0, round(safe_total / days_until_salary, 2))
    return {"value": safe_daily, "days": days_until_salary}


async def _calculate_dashboard_metrics(user_id: str) -> Dict[str, object]:
    consents = _require_consents(user_id)
    fetched_at = datetime.utcnow().isoformat()
    
    # Получаем все данные параллельно
    accounts_tasks = [
        fetch_bank_accounts_with_consent(consent.bank_id, consent.consent_id, user_id)
        for consent in consents
    ]
    balances_tasks = [
        fetch_bank_balances_with_consent(consent.bank_id, consent.consent_id, user_id)
        for consent in consents
    ]
    transactions_tasks = [
        fetch_bank_data_with_consent(consent.bank_id, consent.consent_id, user_id)
        for consent in consents
    ]
    
    # Gather each group separately to avoid unpacking issues
    accounts_results = await asyncio.gather(*accounts_tasks)
    balances_results = await asyncio.gather(*balances_tasks)
    transactions_results = await asyncio.gather(*transactions_tasks)
    
    # Собираем все данные
    all_accounts: List[Dict[str, Any]] = []
    all_balances: List[Dict[str, Any]] = []
    all_transactions: List[Any] = []
    bank_statuses: List[Dict[str, object]] = []
    
    for i, consent in enumerate(consents):
        config = settings.banks.get(consent.bank_id)
        bank_name = config.display_name if config else consent.bank_id
        
        accounts_res = accounts_results[i]
        balances_res = balances_results[i]
        transactions_res = transactions_results[i]
        
        # Save fresh data to cache
        save_bank_data_cache(user_id, consent.bank_id, "accounts", {
            "accounts": accounts_res.get("accounts") or [],
            "status_info": {"state": accounts_res.get("status"), "message": accounts_res.get("message")}
        })
        save_bank_data_cache(user_id, consent.bank_id, "balances", {
            "balances": balances_res.get("balances") or [],
            "status_info": {"state": balances_res.get("status"), "message": balances_res.get("message")}
        })
        save_bank_data_cache(user_id, consent.bank_id, "transactions", {
            "transactions": transactions_res.get("transactions") or [],
            "status_info": {"state": transactions_res.get("status"), "message": transactions_res.get("message")}
        })
        
        if accounts_res.get("status") == "ok":
            all_accounts.extend(accounts_res.get("accounts") or [])
        if balances_res.get("status") == "ok":
            all_balances.extend(balances_res.get("balances") or [])
        if transactions_res.get("status") == "ok":
            # Transactions are Transaction objects from OBR client
            tx_list = transactions_res.get("transactions") or []
            for tx in tx_list:
                if isinstance(tx, dict):
                    all_transactions.append(tx)
                else:
                    # Transaction model (Pydantic) - convert to dict
                    # Use model_dump() if available (Pydantic v2) or dict() (Pydantic v1)
                    if hasattr(tx, 'model_dump'):
                        tx_dict = tx.model_dump()
                    elif hasattr(tx, 'dict'):
                        tx_dict = tx.dict()
                    else:
                        # Fallback: manual conversion
                        tx_dict = {
                            "transactionId": getattr(tx, 'transactionId', ''),
                            "amount": getattr(tx, 'amount', 0),
                            "currency": getattr(tx, 'currency', 'RUB'),
                            "bookingDate": getattr(tx, 'bookingDate', date.today()),
                            "creditDebitIndicator": getattr(tx, 'creditDebitIndicator', None),
                            "bankTransactionCode": getattr(tx, 'bankTransactionCode', None),
                            "transactionInformation": getattr(tx, 'transactionInformation', None),
                        }
                    all_transactions.append(tx_dict)
        
        bank_statuses.append({
            "bank_id": consent.bank_id,
            "bank_name": bank_name,
            "status": "ok" if all([
                accounts_res.get("status") == "ok",
                balances_res.get("status") == "ok",
            ]) else "error",
            "fetched_at": fetched_at,
        })
    
    # Получаем кредиты через product consent
    all_credits: List[Dict[str, Any]] = []
    product_consents = find_approved_consents(user_id, consent_type="products")
    if product_consents:
        credit_tasks = [
            fetch_bank_credits(consent.bank_id, consent.consent_id, user_id)
            for consent in product_consents
        ]
        credit_results = await asyncio.gather(*credit_tasks, return_exceptions=True)
        for i, result in enumerate(credit_results):
            if isinstance(result, dict) and result.get("status") == "ok":
                credits = result.get("credits") or []
                logger.info("Fetched %d credits from bank, sample product types: %s", 
                           len(credits), 
                           [c.get("productType") or c.get("product_type") or c.get("type", "unknown") for c in credits[:3]] if credits else [])
                all_credits.extend(credits)
                
                # Save credits to cache
                consent = product_consents[i]
                save_bank_data_cache(user_id, consent.bank_id, "credits", {
                    "credits": credits,
                    "status_info": {"state": result.get("status"), "message": result.get("message")}
                })
    else:
        logger.warning("No product consents found for user %s", user_id)
    
    logger.info("Total credits/agreements collected: %d", len(all_credits))
    
    # Получаем депозиты (фильтруем из product agreements)
    all_deposits: List[Dict[str, Any]] = []
    if product_consents:
        for result in credit_results:
            if isinstance(result, dict) and result.get("status") == "ok":
                products = result.get("credits") or []
                for product in products:
                    product_type = product.get("productType") or product.get("product_type", "").lower()
                    if product_type in ["deposit", "savings"]:
                        all_deposits.append(product)
    
    # Используем алгоритмы для расчетов
    # 1. Категоризация транзакций
    from hktn.core.data_models import Transaction
    transaction_models: List[Transaction] = []
    for tx_dict in all_transactions:
        try:
            # Ensure bookingDate is a date object
            booking_date = tx_dict.get("bookingDate")
            if isinstance(booking_date, str):
                booking_date = datetime.fromisoformat(booking_date.replace("Z", "+00:00")).date()
            elif not isinstance(booking_date, date):
                booking_date = date.today()
            
            tx_dict["bookingDate"] = booking_date
            tx_model = Transaction(**tx_dict)
            transaction_models.append(tx_model)
        except Exception as e:
            logger.warning("Failed to parse transaction: %s, dict: %s", e, tx_dict)
            continue
    
    categorization_result = transactions_categorization_salary_and_loans(
        transaction_models,
        all_credits,
    )
    
    # 2. Расчет общего баланса дебетовых карт
    total_debit_balance = total_debit_balance_calculation(
        all_accounts,
        all_balances,
    )
    
    # 3. Расчет общей задолженности
    logger.info("Calculating debt from %d credit agreements", len(all_credits))
    if all_credits:
        logger.info("Sample credit agreement keys: %s", list(all_credits[0].keys())[:15] if all_credits else [])
        logger.info("Sample credit agreement: %s", {k: v for k, v in list(all_credits[0].items())[:10]} if all_credits else {})
        # Log the full first agreement for debugging
        logger.info("Full first credit agreement: %s", all_credits[0])
    debt_result = total_debt_calculation(all_credits)
    logger.info("Debt calculation result: total_debt=%.2f, loans=%.2f, cards=%.2f, active_loans=%d",
               debt_result["total_debt_base"], 
               debt_result["total_loans_debt_base"],
               debt_result["total_cards_debt_base"],
               len(debt_result["active_loans"]))
    
    # 4. Расчет MDP
    mdp_result = mdp_calculation(
        debt_result["active_loans"],
        categorization_result["debt_obligations_status"],
    )
    
    # 5. Расчет ADP (используем настройки из онбординга или значения по умолчанию)
    financial_inputs = _load_financial_inputs(user_id) or {}
    repayment_speed = financial_inputs.get("repayment_speed", "balanced")
    strategy = financial_inputs.get("repayment_strategy", "avalanche")
    
    adp_result = adp_calculation(
        mdp_result["mdp_today_base"],
        debt_result["active_loans"],
        categorization_result["estimated_monthly_income"],
        repayment_speed=repayment_speed,
        strategy=strategy,
    )
    
    # 6. Расчет STS
    sts_result = sts_calculation(
        total_debit_balance,
        categorization_result["estimated_monthly_income"],
        categorization_result["income_frequency_type"],
        categorization_result["next_income_window"],
        debt_result["active_loans"],
        categorization_result["debt_obligations_status"],
        mdp_result["mdp_today_base"],
        adp_result["adp_today_base"],
    )
    
    # Формируем loan_summary
    loan_summary = {
        "total_outstanding": debt_result["total_debt_base"],
        "mandatory_daily_payment": mdp_result["mdp_today_base"],
        "additional_daily_payment": adp_result["adp_today_base"],
        "total_monthly_payment": mdp_result["mdp_today_base"] * 30,  # Приблизительно
    }
    
    # Формируем events_next_30d
    financial_inputs = _load_financial_inputs(user_id)
    
    # Получаем параметры для расчета SDP
    savings_target = financial_inputs.get("savings_target")
    savings_goal_date = _parse_iso_date(financial_inputs.get("savings_goal_date"))
    
    # Формируем savings_summary с реальным расчетом SDP
    savings_summary = _calculate_savings_summary(
        all_deposits,
        target=savings_target,
        monthly_income=categorization_result["estimated_monthly_income"],
        goal_date=savings_goal_date,
    )
    next_income_start = categorization_result["next_income_window"].get("start")
    if next_income_start:
        try:
            if isinstance(next_income_start, str):
                income_date = datetime.fromisoformat(next_income_start.replace("Z", "+00:00")).date()
            else:
                income_date = next_income_start
        except (ValueError, TypeError):
            income_date = financial_inputs["salary_date"]
    else:
        income_date = financial_inputs["salary_date"]
    
    events_next_30d = _get_upcoming_events(
        financial_inputs["credit_payment_date"],
        financial_inputs["credit_payment_amount"],
        income_date,
    )
    
    # Обновляем amount для salary events
    for event in events_next_30d:
        if event.get("type") == "salary":
            event["amount"] = categorization_result["estimated_monthly_income"]
    
    # Вычисляем health score
    monthly_income = categorization_result["estimated_monthly_income"] or financial_inputs["salary_amount"]
    monthly_expenses = loan_summary["total_monthly_payment"] + savings_summary["daily_payment"] * 30
    total_credit_debt = debt_result["total_debt_base"]
    health_score = _calculate_health_score(
        total_debit_balance,
        total_credit_debt,
        monthly_income,
        monthly_expenses,
    )
    
    # Определяем режим пользователя
    user_mode = "loans" if debt_result["total_debt_base"] > 0 else "deposits"
    
    # Формируем impact для tomorrow
    tomorrow_impact = "Стабильный прогноз"
    if next_income_start:
        try:
            if isinstance(next_income_start, str):
                income_date_check = datetime.fromisoformat(next_income_start.replace("Z", "+00:00")).date()
            else:
                income_date_check = next_income_start
            if income_date_check == date.today() + timedelta(days=1):
                tomorrow_impact = "После завтрашнего дохода"
        except (ValueError, TypeError):
            pass
    
    # Собираем метаданные свежести данных
    # Данные только что загружены, поэтому используем текущий fetched_at
    data_freshness = []
    for consent in consents:
        data_freshness.append({
            "bank_id": consent.bank_id,
            "fetched_at": fetched_at,
            "age_minutes": 0,  # Данные только что загружены
        })
    
    logger.info(
        "Dashboard payload for %s generated (balance=%.2f, sts=%.2f, mode=%s)",
        user_id,
        total_debit_balance,
        sts_result["sts_daily_recommended"],
        user_mode,
    )
    
    return {
        "sts_today": {
            "amount": sts_result["sts_daily_recommended"],
            "spent": 0.0,  # TODO: отслеживать через транзакции за сегодня
            "tomorrow": {
                "amount": sts_result["sts_daily_recommended"],  # Упрощенная версия
                "impact": tomorrow_impact,
            },
        },
        "loan_summary": loan_summary,
        "savings_summary": savings_summary,
        "total_debit_cards_balance": total_debit_balance,
        "events_next_30d": events_next_30d,
        "health_score": health_score,
        "bank_statuses": bank_statuses,
        "user_mode": user_mode,
        "data_freshness": data_freshness,
    }


def is_fresh(cached: Dict[str, Any], max_age_minutes: int = 15) -> bool:
    """
    Проверяет свежесть кеша.
    
    Args:
        cached: Словарь с ключами calculated_at, expires_at
        max_age_minutes: Максимальный возраст кеша в минутах
    
    Returns:
        True если кеш свежий, False если устарел
    """
    try:
        calculated_at = datetime.fromisoformat(cached["calculated_at"])
        max_age = timedelta(minutes=max_age_minutes)
        age = datetime.utcnow() - calculated_at
        return age < max_age
    except (KeyError, ValueError, TypeError) as e:
        logger.warning("Failed to check cache freshness: %s", e)
        return False


def get_dashboard_cache_info(user_id: str) -> Optional[Dict[str, Any]]:
    """
    Возвращает информацию о кеше dashboard для пользователя.
    
    Returns:
        Dict с ключами: calculated_at, age_minutes или None если кеш не найден
    """
    cached = get_cached_dashboard(user_id)
    if not cached:
        return None
    
    try:
        calculated_at = datetime.fromisoformat(cached["calculated_at"])
        age = datetime.utcnow() - calculated_at
        age_minutes = int(age.total_seconds() / 60)
        
        return {
            "calculated_at": cached["calculated_at"],
            "age_minutes": age_minutes,
        }
    except (KeyError, ValueError, TypeError) as e:
        logger.warning("Failed to get cache info: %s", e)
        return None


async def get_dashboard_metrics(user_id: str, force_refresh: bool = False) -> Dict[str, object]:
    """
    Получает dashboard метрики с умным кешированием.
    
    Strategy:
    1. Проверяем кеш в БД
    2. Если свежий (< 15 минут) - возвращаем из кеша
    3. Если устарел или force_refresh - пересчитываем
    4. Сохраняем в кеш
    
    Args:
        user_id: ID пользователя
        force_refresh: Принудительно обновить данные (игнорировать кеш)
    
    Returns:
        Dict с данными dashboard
    """
    # 1. Проверяем кеш (если не force_refresh)
    if not force_refresh:
        cached = get_cached_dashboard(user_id)
        if cached and is_fresh(cached, max_age_minutes=15):
            logger.info("Serving dashboard from cache for user %s", user_id)
            return cached["dashboard_data"]
    
    # 2. Получаем свежие данные (существующий код)
    logger.info("Calculating fresh dashboard for user %s (force_refresh=%s)", user_id, force_refresh)
    dashboard_data = await _calculate_dashboard_metrics(user_id)
    
    # 3. Сохраняем в кеш
    save_dashboard_cache(user_id, dashboard_data, ttl_minutes=30)
    
    return dashboard_data


BALANCE_CURRENCY_WHITELIST = {"RUB", "RUR"}
CREDIT_AMOUNT_FIELDS = (
    "amount",
    "currentBalance",
    "outstandingBalance",
    "balance",
    "debtAmount",
    "principal",
    "availableBalance",
    "ledgerBalance",
)


def _is_rub_currency(value: Optional[str]) -> bool:
    if not value:
        return True
    normalized = value.strip().upper()
    return normalized in BALANCE_CURRENCY_WHITELIST


def _message_implies_access_issue(message: Optional[str]) -> bool:
    if not message:
        return False
    lower = message.lower()
    indicators = ["permission", "scope", "readbalances", "readaccounts", "readproduct", "forbidden", "401", "403"]
    return any(keyword in lower for keyword in indicators)


def _derive_step_status(result_status: Optional[str], data_count: int, message: Optional[str]) -> str:
    normalized = (result_status or "").lower()
    if normalized == "ok":
        return "ok" if data_count > 0 else "no_data"
    if _message_implies_access_issue(message):
        return "no_access"
    return "error"


def _resolve_pipeline_status(step_statuses: List[str]) -> str:
    if any(status == "error" for status in step_statuses):
        return "error"
    if any(status in {"no_data", "no_access"} for status in step_statuses):
        return "partial"
    return "ok"


def _build_step_entry(name: str, status: str, details: str, message: Optional[str]) -> Dict[str, Any]:
    error_code = message if status in {"error", "no_access"} and message else None
    return {"name": name, "status": status, "details": details, "error_code": error_code}


def _sum_rub_balances(entries: Sequence[Any]) -> Tuple[float, bool]:
    """
    Expecting `/accounts/{account_id}/balances` to return `data.Balance[]` (Open Banking v3.1).
    Each entry should include `amount` / `currentBalance` / `availableBalance` + `currency`.
    Adjust this parser if banks send the payload under a different name.
    """
    total = 0.0
    found = False
    for entry in entries or []:
        normalized = _normalize_balance_entry(entry)
        if not normalized:
            continue
        currency = normalized.get("currency")
        if not _is_rub_currency(currency):
            continue
        amount = normalized.get("amount")
        if amount is None:
            continue
        if amount > 0:
            total += amount
        found = True
    return round(total, 2), found


def _calculate_loan_summary(credits: List[Dict[str, Any]]) -> Dict[str, float]:
    """Вычисляет сводку по кредитам: MDP, ADP, total_monthly_payment."""
    total_outstanding = _sum_credit_debts(credits)
    
    # Вычисляем MDP (Mandatory Daily Payment) - обязательный дневной платеж
    # Берем средний месячный платеж и делим на 30 дней
    total_monthly_payment = 0.0
    for credit in credits:
        monthly_payment = _coerce_to_float(credit.get("monthlyPayment") or credit.get("monthly_payment") or credit.get("payment"))
        if monthly_payment:
            total_monthly_payment += monthly_payment
    
    mandatory_daily_payment = round(total_monthly_payment / 30.0, 2) if total_monthly_payment > 0 else 0.0
    
    # ADP (Additional Daily Payment) - дополнительный дневной платеж
    # Обычно составляет 20-30% от обязательного платежа
    additional_daily_payment = round(mandatory_daily_payment * 0.25, 2)
    
    return {
        "total_outstanding": total_outstanding,
        "mandatory_daily_payment": mandatory_daily_payment,
        "additional_daily_payment": additional_daily_payment,
        "total_monthly_payment": round(total_monthly_payment, 2),
    }


def _calculate_savings_summary(
    deposits: List[Dict[str, Any]],
    target: Optional[float] = None,
    monthly_income: Optional[float] = None,
    goal_date: Optional[date] = None,
) -> Dict[str, Any]:
    """Вычисляет сводку по накоплениям: SDP, total_saved, progress."""
    total_saved = 0.0
    for deposit in deposits:
        balance = _coerce_to_float(deposit.get("balance") or deposit.get("currentBalance") or deposit.get("amount"))
        if balance:
            total_saved += balance
    
    # Расчет SDP (Savings Daily Payment) на основе цели
    daily_payment = 500.0  # Fallback по умолчанию
    
    if target and goal_date:
        # Если задана цель и дата достижения цели
        today = date.today()
        days_remaining = max(1, (goal_date - today).days)
        remaining_amount = max(0, target - total_saved)
        if days_remaining > 0:
            daily_payment = remaining_amount / days_remaining
        else:
            daily_payment = 0.0
    elif monthly_income and monthly_income > 0:
        # Если цель не задана, используем 10% от дохода в день
        daily_payment = (monthly_income * 0.1) / 30.0
    
    # Target по умолчанию
    if target is None:
        target = 100000.0  # Placeholder
    
    progress_percent = round((total_saved / target * 100.0), 2) if target > 0 else 0.0
    
    return {
        "total_saved": round(total_saved, 2),
        "daily_payment": round(daily_payment, 2),
        "target": target,
        "progress_percent": progress_percent,
    }


def _get_upcoming_events(
    credit_payment_date: date,
    credit_payment_amount: float,
    salary_date: date,
) -> List[Dict[str, Any]]:
    """Получает события на следующие 30 дней."""
    today = date.today()
    events = []
    
    # Добавляем событие платежа по кредиту если оно в пределах 30 дней
    if credit_payment_date and credit_payment_date > today:
        days_until = (credit_payment_date - today).days
        if days_until <= 30:
            events.append({
                "date": credit_payment_date.isoformat(),
                "type": "loan_payment",
                "amount": credit_payment_amount,
                "description": "Платеж по кредиту",
            })
    
    # Добавляем событие получения зарплаты если оно в пределах 30 дней
    if salary_date and salary_date > today:
        days_until = (salary_date - today).days
        if days_until <= 30:
            events.append({
                "date": salary_date.isoformat(),
                "type": "salary",
                "amount": 0.0,  # Будет заполнено из financial_inputs
                "description": "Получение зарплаты",
            })
    
    # Сортируем по дате
    events.sort(key=lambda x: x["date"])
    
    return events[:10]  # Возвращаем максимум 10 событий


def _calculate_health_score(
    total_balance: float,
    total_credit_debt: float,
    monthly_income: float,
    monthly_expenses: float,
) -> Dict[str, Any]:
    """Вычисляет показатель финансового здоровья (0-100)."""
    # Базовая формула: учитываем баланс, долги, доходы и расходы
    score = 50.0  # Базовый балл
    
    # Учитываем соотношение долга к балансу
    if total_balance > 0:
        debt_ratio = total_credit_debt / total_balance
        if debt_ratio < 0.5:
            score += 20
        elif debt_ratio < 1.0:
            score += 10
        elif debt_ratio > 2.0:
            score -= 20
    
    # Учитываем соотношение доходов к расходам
    if monthly_income > 0:
        expense_ratio = monthly_expenses / monthly_income
        if expense_ratio < 0.7:
            score += 20
        elif expense_ratio < 0.9:
            score += 10
        elif expense_ratio > 1.0:
            score -= 20
    
    # Нормализуем в диапазон 0-100
    score = max(0.0, min(100.0, score))
    
    # Определяем статус
    if score >= 75:
        status = "excellent"
    elif score >= 60:
        status = "good"
    elif score >= 40:
        status = "fair"
    else:
        status = "poor"
    
    return {
        "value": round(score, 1),
        "status": status,
    }


def _sum_credit_debts(entries: Sequence[Any]) -> float:
    """
    Open banking `/product-agreements` or `/credits` often include fields like
    `currentBalance`, `outstandingBalance`, `amount` or `principal`. We sum positive RUB values here.
    """
    total = 0.0
    for entry in entries or []:
        if not isinstance(entry, dict):
            continue
        amount = None
        for field in CREDIT_AMOUNT_FIELDS:
            if field in entry:
                amount = _coerce_to_float(entry[field])
                if amount is not None:
                    break
        if amount is None:
            continue
        currency_field = entry.get("currency") or entry.get("currency_code")
        if not _is_rub_currency(currency_field):
            continue
        total += abs(amount)
    return round(total, 2)


async def _collect_bank_status(
    consent: StoredConsent,
    user_id: str,
) -> Tuple[Dict[str, Any], float, float, bool, bool]:
    accounts_task = fetch_bank_accounts_with_consent(consent.bank_id, consent.consent_id, user_id)
    balances_task = fetch_bank_balances_with_consent(consent.bank_id, consent.consent_id, user_id)
    credits_task = fetch_bank_credits(consent.bank_id, consent.consent_id, user_id)

    accounts_res, balances_res, credits_res = await asyncio.gather(
        accounts_task,
        balances_task,
        credits_task,
    )

    accounts = accounts_res.get("accounts") or []
    balances = balances_res.get("balances") or []
    credits = credits_res.get("credits") or []

    sum_balances, has_balance_data = _sum_rub_balances(balances)
    sum_credits = _sum_credit_debts(credits)
    has_credit_data = bool(credits)

    accounts_status = _derive_step_status(
        accounts_res.get("status"),
        len(accounts),
        accounts_res.get("message"),
    )
    balances_status = _derive_step_status(
        balances_res.get("status"),
        len(balances),
        balances_res.get("message"),
    )
    products_status = _derive_step_status(
        credits_res.get("status"),
        len(credits),
        credits_res.get("message"),
    )

    bank_config = settings.banks.get(consent.bank_id)
    bank_name = bank_config.display_name if bank_config else consent.bank_id

    steps = [
        _build_step_entry(
            "consent",
            "ok",
            f"Consent {consent.consent_id} ({consent.consent_type}) утверждён.",
            None,
        ),
        _build_step_entry(
            "accounts",
            accounts_status,
            f"Запрос `/accounts?client_id={user_id}` → ожидаем `data.accounts[]` с accountId/currency. Получено {len(accounts)} записей.",
            accounts_res.get("message"),
        ),
        _build_step_entry(
            "balances",
            balances_status,
            f"Запрос `/accounts/{{account_id}}/balances` → ожидаем `Balance[]` ({', '.join(['amount', 'currentBalance', 'availableBalance'])}) и currency. Найдено {len(balances)} записей, итого {sum_balances} RUB.",
            balances_res.get("message"),
        ),
        _build_step_entry(
            "products",
            products_status,
            f"Запрос `/product-agreements` или `/credits` → ожидаем кредитные договоры с полями `currentBalance`/`outstandingBalance`. Получено {len(credits)} записей.",
            credits_res.get("message"),
        ),
    ]

    step_statuses = [step["status"] for step in steps]
    pipeline_status = _resolve_pipeline_status(step_statuses)

    raw_metrics = {
        "sum_account_balances": sum_balances,
        "sum_credit_debts": sum_credits,
        "used_in_base_score": has_balance_data,
    }

    return (
        {
            "bank_id": consent.bank_id,
            "bank_name": bank_name,
            "pipeline_status": pipeline_status,
            "steps": steps,
            "raw_metrics": raw_metrics,
        },
        sum_balances,
        sum_credits,
        has_balance_data,
        has_credit_data,
    )


async def get_integration_status(user_id: str) -> Dict[str, Any]:
    consents = _require_consents(user_id)
    tasks = [_collect_bank_status(consent, user_id) for consent in consents]

    bank_results = await asyncio.gather(*tasks)
    banks: List[Dict[str, Any]] = []
    total_balance = 0.0
    total_credit_debt = 0.0
    balance_data_found = False
    credit_data_found = False

    for bank_payload, bank_balance, bank_credit, has_balance, has_credit in bank_results:
        banks.append(bank_payload)
        total_balance += bank_balance
        total_credit_debt += bank_credit
        balance_data_found = balance_data_found or has_balance
        credit_data_found = credit_data_found or has_credit

    if not balance_data_found:
        base_score_payload = {
            "status": "no_data",
            "value": None,
            "currency": "RUB",
            "reason": "Не удалось получить балансы по RUB счетам на стороне банков.",
        }
    else:
        base_score_value = max(0.0, round(total_balance - total_credit_debt, 2))
        reason_parts = [
            "Расчёт основан на доступных RUB остатках с `/accounts/{account_id}/balances`."
        ]
        if not credit_data_found:
            reason_parts.append(
                "Кредитная задолженность не учитывается — нет данных из `/product-agreements`."
            )
        base_score_payload = {
            "status": "ok",
            "value": base_score_value,
            "currency": "RUB",
            "reason": " ".join(reason_parts),
        }

    result_model = IntegrationStatusResponse(
        user_id=user_id,
        base_score=base_score_payload,
        banks=banks,
    )

    logger.info(
        "Integration status for %s computed (balance=%.2f, credit=%.2f)",
        user_id,
        total_balance,
        total_credit_debt,
    )

    return result_model
