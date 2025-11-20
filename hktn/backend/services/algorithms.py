"""Algorithms for financial calculations according to the specification."""
from __future__ import annotations

import logging
import statistics
from datetime import date, datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple

from hktn.core.data_models import Transaction

logger = logging.getLogger("finpulse.backend.algorithms")

# Salary keywords for transaction categorization
SALARY_KEYWORDS = ["зарплата", "salary", "payroll", "аванс", "премия", "доход", "заработная"]

# Debit account subtypes whitelist
DEBIT_ACCOUNT_SUBTYPES = ["Checking", "CurrentAccount", "Savings", "Personal"]

# Credit product types
CREDIT_PRODUCT_TYPES = ["loan", "credit_card", "overdraft", "mortgage"]

# Safety buffer for STS calculation (in RUB)
SAFETY_BUFFER = 5000.0


def transactions_categorization_salary_and_loans(
    transactions: List[Transaction],
    credit_agreements: List[Dict[str, Any]],
    user_timezone: str = "Europe/Moscow",
) -> Dict[str, Any]:
    """
    Categorize transactions and identify salary income and loan payment obligations.
    
    Returns:
        - estimated_monthly_income: float
        - income_frequency_type: "regular_monthly" | "regular_biweekly" | "irregular"
        - next_income_window: {start: date, end: date}
        - debt_obligations_status: List[{agreement_id, planned_amount, paid_in_current_period, last_payment_date, source}]
    """
    today = date.today()
    current_month_start = today.replace(day=1)
    
    # Filter salary transactions (Credit + keywords)
    salary_transactions: List[Transaction] = []
    for tx in transactions:
        if tx.creditDebitIndicator and tx.creditDebitIndicator.lower() == "credit":
            info_lower = (tx.transactionInformation or "").lower()
            code = tx.bankTransactionCode or ""
            
            # Check if transaction matches salary criteria
            if code == "02" or any(keyword in info_lower for keyword in SALARY_KEYWORDS):
                salary_transactions.append(tx)
    
    # Monthly aggregation
    monthly_sums: Dict[str, float] = {}
    for tx in salary_transactions:
        month_key = tx.bookingDate.strftime("%Y-%m")
        if month_key not in monthly_sums:
            monthly_sums[month_key] = 0.0
        monthly_sums[month_key] += abs(tx.amount)
    
    # Calculate estimated monthly income (median)
    sums_list = [v for k, v in monthly_sums.items() if k < current_month_start.strftime("%Y-%m")]
    
    if not sums_list or len(sums_list) < 1:
        estimated_monthly_income = 0.0
        income_frequency_type = "irregular"
        next_income_window = {"start": today + timedelta(days=1), "end": today + timedelta(days=30)}
    else:
        estimated_monthly_income = statistics.median(sums_list)
        
        # Determine frequency
        if len(salary_transactions) < 2:
            income_frequency_type = "irregular"
            next_income_window = {"start": today + timedelta(days=1), "end": today + timedelta(days=30)}
        else:
            # Calculate gaps between salary transactions
            sorted_txs = sorted(salary_transactions, key=lambda t: t.bookingDate)
            gaps = []
            for i in range(1, len(sorted_txs)):
                gap = (sorted_txs[i].bookingDate - sorted_txs[i-1].bookingDate).days
                gaps.append(gap)
            
            if gaps:
                median_gap = statistics.median(gaps)
                std_dev = statistics.stdev(gaps) if len(gaps) > 1 else 0
                
                if std_dev > 5:
                    income_frequency_type = "irregular"
                    next_income_window = {"start": today + timedelta(days=1), "end": today + timedelta(days=30)}
                else:
                    if 25 <= median_gap <= 35:
                        income_frequency_type = "regular_monthly"
                    elif 12 <= median_gap <= 18:
                        income_frequency_type = "regular_biweekly"
                    else:
                        income_frequency_type = "irregular"
                    
                    last_salary_date = sorted_txs[-1].bookingDate
                    next_date = last_salary_date + timedelta(days=int(median_gap))
                    next_income_window = {"start": next_date, "end": next_date + timedelta(days=3)}
            else:
                income_frequency_type = "irregular"
                next_income_window = {"start": today + timedelta(days=1), "end": today + timedelta(days=30)}
    
    # Build debt obligations status
    debt_obligations_status: List[Dict[str, Any]] = []
    
    for agreement in credit_agreements:
        agreement_id = agreement.get("agreementId") or agreement.get("agreement_id") or agreement.get("id")
        if not agreement_id:
            continue
        
        status_val = agreement.get("status", "").lower()
        if status_val not in ["active", "in_arrears"]:
            continue
        
        # Get planned payment amount from schedule or calculate
        planned_amount = None
        payment_schedule = agreement.get("paymentSchedule") or agreement.get("payment_schedule")
        if payment_schedule and isinstance(payment_schedule, list):
            # Find next payment
            for payment in payment_schedule:
                payment_date_str = payment.get("date") or payment.get("paymentDate")
                if payment_date_str:
                    try:
                        payment_date = datetime.fromisoformat(payment_date_str.replace("Z", "+00:00")).date()
                        if payment_date >= today:
                            planned_amount = float(payment.get("amount") or payment.get("paymentAmount") or 0)
                            break
                    except (ValueError, TypeError):
                        pass
        
        # Fallback: calculate from agreement data
        if planned_amount is None or planned_amount == 0:
            amount = float(agreement.get("amount") or agreement.get("currentBalance") or 0)
            interest_rate = float(agreement.get("interestRate") or agreement.get("interest_rate") or 0)
            if amount > 0 and interest_rate > 0:
                # Simple annuity calculation
                monthly_rate = interest_rate / 100 / 12
                term_months = int(agreement.get("termMonths") or agreement.get("term_months") or 12)
                if term_months > 0:
                    annuity_factor = (monthly_rate * (1 + monthly_rate) ** term_months) / ((1 + monthly_rate) ** term_months - 1)
                    planned_amount = amount * annuity_factor
                else:
                    # Minimum payment estimate
                    planned_amount = amount * 0.01 + (amount * interest_rate / 100 / 12)
            else:
                planned_amount = float(agreement.get("monthlyPayment") or agreement.get("monthly_payment") or 0)
        
        if planned_amount is None or planned_amount == 0:
            continue
        
        # Match transactions for this agreement
        account_number = agreement.get("accountNumber") or agreement.get("account_number")
        paid_in_current_period = False
        last_payment_date = None
        
        # Filter transactions for current month
        current_month_txs = [
            tx for tx in transactions
            if tx.bookingDate >= current_month_start
            and tx.creditDebitIndicator and tx.creditDebitIndicator.lower() == "debit"
        ]
        
        for tx in current_month_txs:
            info = (tx.transactionInformation or "").lower()
            # Check if transaction matches this agreement
            if agreement_id.lower() in info or (account_number and account_number in info):
                if abs(tx.amount) >= planned_amount * 0.9:  # 90% threshold
                    paid_in_current_period = True
                    if not last_payment_date or tx.bookingDate > last_payment_date:
                        last_payment_date = tx.bookingDate
                    break
        
        debt_obligations_status.append({
            "agreement_id": agreement_id,
            "planned_amount": planned_amount,
            "paid_in_current_period": paid_in_current_period,
            "last_payment_date": last_payment_date.isoformat() if last_payment_date else None,
            "source": "contract" if payment_schedule else "estimated",
        })
    
    return {
        "estimated_monthly_income": round(estimated_monthly_income, 2),
        "income_frequency_type": income_frequency_type,
        "next_income_window": {
            "start": next_income_window["start"].isoformat() if isinstance(next_income_window["start"], date) else next_income_window["start"],
            "end": next_income_window["end"].isoformat() if isinstance(next_income_window["end"], date) else next_income_window["end"],
        },
        "debt_obligations_status": debt_obligations_status,
    }


def total_debit_balance_calculation(
    accounts: List[Dict[str, Any]],
    balances: List[Dict[str, Any]],
    fx_rates: Optional[Dict[str, float]] = None,
) -> float:
    """
    Calculate total balance across all debit cards and liquid accounts.
    
    Args:
        accounts: List of account dictionaries
        balances: List of balance dictionaries
        fx_rates: Currency exchange rates to RUB (default: {"RUB": 1.0, "USD": 75.0, "EUR": 80.0})
    
    Returns:
        Total debit balance in RUB
    """
    if fx_rates is None:
        fx_rates = {"RUB": 1.0, "RUR": 1.0, "USD": 75.0, "EUR": 80.0}
    
    # Filter enabled debit accounts
    enabled_account_ids = set()
    for account in accounts:
        status = account.get("status", "").lower()
        account_subtype = account.get("accountSubType") or account.get("account_subtype") or ""
        
        if status in ["enabled", "active"] and account_subtype in DEBIT_ACCOUNT_SUBTYPES:
            account_id = account.get("accountId") or account.get("account_id") or account.get("id")
            if account_id:
                enabled_account_ids.add(account_id)
    
    # Sum balances for enabled accounts
    total = 0.0
    for balance_entry in balances:
        account_id = balance_entry.get("accountId") or balance_entry.get("account_id")
        if account_id not in enabled_account_ids:
            continue
        
        # Get balance amount
        amount = None
        balance_type = balance_entry.get("type", "").lower()
        
        if balance_type == "interimavailable":
            amount_dict = balance_entry.get("amount") or balance_entry.get("balanceAmount")
            if isinstance(amount_dict, dict):
                amount = float(amount_dict.get("amount") or amount_dict.get("Amount") or 0)
                currency = amount_dict.get("currency") or amount_dict.get("Currency") or "RUB"
            else:
                amount = float(balance_entry.get("amount") or balance_entry.get("currentBalance") or 0)
                currency = balance_entry.get("currency") or "RUB"
        else:
            continue
        
        if amount is None:
            continue
        
        # Handle credit/debit indicator
        indicator = balance_entry.get("creditDebitIndicator") or balance_entry.get("credit_debit_indicator")
        if indicator and indicator.lower() == "debit":
            amount = -abs(amount)
        elif indicator and indicator.lower() == "credit":
            amount = abs(amount)
        
        # Normalize (don't allow negative for spending)
        safe_balance = max(0.0, amount)
        
        # Convert to RUB
        currency_upper = currency.upper()
        rate = fx_rates.get(currency_upper, 1.0)
        total += safe_balance * rate
    
    return round(total, 2)


def total_debt_calculation(
    agreements: List[Dict[str, Any]],
    fx_rates: Optional[Dict[str, float]] = None,
) -> Dict[str, Any]:
    """
    Calculate total debt: loans + credit cards.
    
    Returns:
        {
            "total_debt_base": float,
            "total_loans_debt_base": float,
            "total_cards_debt_base": float,
            "active_loans": List[Dict]
        }
    """
    if fx_rates is None:
        fx_rates = {"RUB": 1.0, "RUR": 1.0, "USD": 75.0, "EUR": 80.0}
    
    total_loans = 0.0
    total_cards = 0.0
    active_loans: List[Dict[str, Any]] = []
    
    logger.info("Processing %d agreements for debt calculation", len(agreements))
    
    for agreement in agreements:
        status = agreement.get("status", "").lower()
        # Try multiple field name variations
        product_type = (
            agreement.get("productType") or 
            agreement.get("product_type") or 
            agreement.get("type") or
            agreement.get("productCategory") or
            agreement.get("product_category") or
            ""
        )
        
        logger.debug(
            "Agreement: status=%s, product_type=%s, keys=%s",
            status,
            product_type,
            list(agreement.keys())[:10] if isinstance(agreement, dict) else "not_dict"
        )
        
        if status not in ["active", "in_arrears"]:
            logger.debug("Skipping agreement with status '%s'", status)
            continue
        
        product_type_lower = product_type.lower()
        # More flexible matching - check if any credit keyword is in product_type
        is_credit_type = (
            product_type_lower in CREDIT_PRODUCT_TYPES or
            any(keyword in product_type_lower for keyword in ["credit", "loan", "кредит", "заем", "займ", "overdraft", "mortgage", "ипотека"])
        )
        
        if not is_credit_type:
            logger.debug("Skipping agreement with product_type '%s' (not recognized as credit)", product_type)
            continue
        
        # Get debt amount - try multiple field variations
        debt_amount = 0.0
        
        # Try to determine if it's a loan or credit card
        is_loan = "loan" in product_type_lower or "mortgage" in product_type_lower or "ипотека" in product_type_lower
        is_card = "card" in product_type_lower or "credit_card" in product_type_lower
        
        if is_loan or not is_card:  # Default to loan if unclear
            # For loans: amount + overdue_amount
            principal = float(
                agreement.get("amount") or 
                agreement.get("currentBalance") or 
                agreement.get("current_balance") or
                agreement.get("outstandingBalance") or 
                agreement.get("outstanding_balance") or
                agreement.get("principalOutstanding") or
                agreement.get("principal_outstanding") or
                agreement.get("balance") or
                0
            )
            overdue = float(
                agreement.get("overdueAmount") or 
                agreement.get("overdue_amount") or 
                agreement.get("overdue") or
                0
            )
            debt_amount = principal + overdue
            if debt_amount > 0:
                total_loans += debt_amount
                logger.info("Found loan: product_type=%s, principal=%.2f, overdue=%.2f, total=%.2f", 
                           product_type, principal, overdue, debt_amount)
        elif is_card:
            # Waterfall: outstanding_balance → used_amount → amount
            debt_amount = (
                float(agreement.get("outstandingBalance") or agreement.get("outstanding_balance") or 0) or
                float(agreement.get("usedAmount") or agreement.get("used_amount") or 0) or
                float(agreement.get("amount") or agreement.get("currentBalance") or agreement.get("current_balance") or 0) or
                0.0
            )
            if debt_amount > 0:
                total_cards += debt_amount
                logger.info("Found credit card: product_type=%s, debt_amount=%.2f", product_type, debt_amount)
        
        if debt_amount > 0:
            currency = agreement.get("currency") or "RUB"
            currency_upper = currency.upper()
            rate = fx_rates.get(currency_upper, 1.0)
            debt_rub = debt_amount * rate
            
            active_loans.append({
                "agreement_id": agreement.get("agreementId") or agreement.get("agreement_id") or agreement.get("id"),
                "product_type": product_type,
                "amount": debt_rub,
                "interest_rate": float(agreement.get("interestRate") or agreement.get("interest_rate") or 0),
                "currency": currency,
            })
        else:
            # Log why debt_amount is 0
            logger.warning(
                "Credit agreement has zero debt amount: product_type=%s, status=%s, keys=%s",
                product_type,
                status,
                list(agreement.keys())[:15] if isinstance(agreement, dict) else "not_dict"
            )
            # Try to log available amount fields
            amount_fields = ["amount", "currentBalance", "current_balance", "outstandingBalance", 
                           "outstanding_balance", "principalOutstanding", "principal_outstanding", "balance"]
            available_amounts = {field: agreement.get(field) for field in amount_fields if field in agreement}
            if available_amounts:
                logger.debug("Available amount fields: %s", available_amounts)
    
    total_debt = total_loans + total_cards
    
    logger.info("Debt calculation complete: total=%.2f (loans=%.2f, cards=%.2f), active_loans=%d",
               total_debt, total_loans, total_cards, len(active_loans))
    
    return {
        "total_debt_base": round(total_debt, 2),
        "total_loans_debt_base": round(total_loans, 2),
        "total_cards_debt_base": round(total_cards, 2),
        "active_loans": active_loans,
    }


def mdp_calculation(
    active_loans: List[Dict[str, Any]],
    debt_obligations_status: List[Dict[str, Any]],
    today: Optional[date] = None,
) -> Dict[str, Any]:
    """
    Calculate Mandatory Daily Payments.
    
    Returns:
        {
            "mdp_today_base": float,
            "per_loan_mdp": List[Dict]
        }
    """
    if today is None:
        today = date.today()
    
    total_mdp = 0.0
    per_loan_mdp: List[Dict[str, Any]] = []
    
    for loan in active_loans:
        agreement_id = loan.get("agreement_id")
        loan_amount = loan.get("amount", 0.0)
        interest_rate = loan.get("interest_rate", 0.0)
        
        # Find obligation status
        obligation = next(
            (ob for ob in debt_obligations_status if ob.get("agreement_id") == agreement_id),
            None
        )
        
        # Determine planned payment
        if obligation and obligation.get("planned_amount", 0) > 0:
            monthly_payment = obligation["planned_amount"]
        else:
            # Fallback: estimate annuity
            if interest_rate > 0 and loan_amount > 0:
                monthly_rate = interest_rate / 100 / 12
                interest_part = loan_amount * monthly_rate
                principal_part = loan_amount * 0.01  # Min 1% principal
                monthly_payment = interest_part + principal_part
            else:
                monthly_payment = loan_amount * 0.01  # Fallback
        
        # Determine payment date
        payment_date = None
        if obligation:
            # Try to get from agreement or use heuristic
            # For now, use 15th of month as default
            payment_date = today.replace(day=15)
            if payment_date < today:
                # Next month
                if today.month == 12:
                    payment_date = date(today.year + 1, 1, 15)
                else:
                    payment_date = date(today.year, today.month + 1, 15)
        
        if not payment_date:
            payment_date = today.replace(day=15)
            if payment_date < today:
                if today.month == 12:
                    payment_date = date(today.year + 1, 1, 15)
                else:
                    payment_date = date(today.year, today.month + 1, 15)
        
        # Check if paid
        paid = obligation.get("paid_in_current_period", False) if obligation else False
        remaining = 0.0 if paid else monthly_payment
        
        # Calculate days until payment
        days_left = max(1, (payment_date - today).days)
        
        # Daily payment
        daily_mdp = remaining / days_left if days_left > 0 else remaining
        
        total_mdp += daily_mdp
        
        per_loan_mdp.append({
            "agreement_id": agreement_id,
            "daily_mdp": round(daily_mdp, 2),
            "monthly_payment": round(monthly_payment, 2),
            "payment_date": payment_date.isoformat(),
            "paid": paid,
        })
    
    return {
        "mdp_today_base": round(total_mdp, 2),
        "per_loan_mdp": per_loan_mdp,
    }


def adp_calculation(
    mdp_today_base: float,
    active_loans: List[Dict[str, Any]],
    estimated_monthly_income: float,
    repayment_speed: str = "balanced",
    strategy: str = "avalanche",
) -> Dict[str, Any]:
    """
    Calculate Additional Daily Payments.
    
    Args:
        repayment_speed: "conservative" | "balanced" | "fast"
        strategy: "avalanche" | "snowball"
    
    Returns:
        {
            "adp_today_base": float,
            "target_loan_id": str,
            "target_reason": str
        }
    """
    # Calculate budget coefficient
    speed_coefficients = {
        "conservative": 0.1,
        "balanced": 0.3,
        "fast": 0.5,
    }
    k = speed_coefficients.get(repayment_speed.lower(), 0.3)
    
    raw_adp = mdp_today_base * k
    
    # Cap check (max 20% of income per day)
    if estimated_monthly_income > 0:
        max_daily_cap = (estimated_monthly_income * 0.2) / 30
        adp_today_base = min(raw_adp, max_daily_cap)
    else:
        adp_today_base = raw_adp
    
    if not active_loans:
        return {
            "adp_today_base": 0.0,
            "target_loan_id": None,
            "target_reason": None,
        }
    
    # Rank loans by strategy
    if strategy.lower() == "avalanche":
        # Sort by interest_rate DESC, then amount ASC
        ranked = sorted(
            active_loans,
            key=lambda l: (-l.get("interest_rate", 0), l.get("amount", 0))
        )
    else:  # snowball
        # Sort by amount ASC, then interest_rate DESC
        ranked = sorted(
            active_loans,
            key=lambda l: (l.get("amount", 0), -l.get("interest_rate", 0))
        )
    
    if not ranked:
        return {
            "adp_today_base": 0.0,
            "target_loan_id": None,
            "target_reason": None,
        }
    
    target_loan = ranked[0]
    target_loan_id = target_loan.get("agreement_id")
    
    # Cap ADP to loan balance
    loan_balance = target_loan.get("amount", 0)
    if adp_today_base > loan_balance:
        adp_today_base = loan_balance
    
    target_reason = "Highest Rate" if strategy.lower() == "avalanche" else "Smallest Balance"
    
    return {
        "adp_today_base": round(adp_today_base, 2),
        "target_loan_id": target_loan_id,
        "target_reason": target_reason,
    }


def sts_calculation(
    total_debit_balance_base: float,
    estimated_monthly_income: float,
    income_frequency_type: str,
    next_income_window: Dict[str, str],
    active_loans: List[Dict[str, Any]],
    debt_obligations_status: List[Dict[str, Any]],
    mdp_today_base: float,
    adp_today_base: float,
    horizon_days: int = 30,
    safety_buffer: float = SAFETY_BUFFER,
) -> Dict[str, Any]:
    """
    Calculate Safe-to-Spend using 30-day simulation.
    
    Returns:
        {
            "sts_daily_recommended": float,
            "status": "OK" | "DANGER",
            "min_low_point": float
        }
    """
    today = date.today()
    current_sim_balance = total_debit_balance_base
    min_low_point = total_debit_balance_base
    
    # Parse next income date
    next_income_date = None
    if next_income_window:
        start_str = next_income_window.get("start")
        if start_str:
            try:
                if isinstance(start_str, str):
                    # Handle ISO format strings
                    if "T" in start_str or "Z" in start_str:
                        next_income_date = datetime.fromisoformat(start_str.replace("Z", "+00:00")).date()
                    else:
                        # Handle date-only format YYYY-MM-DD
                        next_income_date = datetime.strptime(start_str, "%Y-%m-%d").date()
                elif isinstance(start_str, date):
                    next_income_date = start_str
            except (ValueError, TypeError) as e:
                logger.warning("Failed to parse next_income_window.start: %s", e)
                pass
    
    # Simulate 30 days
    for day_offset in range(1, horizon_days + 1):
        sim_date = today + timedelta(days=day_offset)
        
        # Apply credit payments
        for obligation in debt_obligations_status:
            payment_date_str = obligation.get("payment_date")
            if not payment_date_str:
                continue
            
            try:
                payment_date = datetime.fromisoformat(payment_date_str.replace("Z", "+00:00")).date()
                if payment_date == sim_date:
                    planned_amount = obligation.get("planned_amount", 0)
                    current_sim_balance -= planned_amount
            except (ValueError, TypeError):
                pass
        
        # Apply income (only for regular)
        if income_frequency_type in ["regular_monthly", "regular_biweekly"] and next_income_date:
            if sim_date == next_income_date:
                current_sim_balance += estimated_monthly_income
                # Calculate next income date
                if income_frequency_type == "regular_monthly":
                    if next_income_date.month == 12:
                        next_income_date = date(next_income_date.year + 1, 1, next_income_date.day)
                    else:
                        next_income_date = date(next_income_date.year, next_income_date.month + 1, next_income_date.day)
                elif income_frequency_type == "regular_biweekly":
                    next_income_date = next_income_date + timedelta(days=14)
        
        # Track minimum
        min_low_point = min(min_low_point, current_sim_balance)
    
    # Calculate free cash
    free_cash = min_low_point - safety_buffer - adp_today_base
    
    # Calculate days until next income
    if next_income_date:
        days_until_income = max(1, (next_income_date - today).days)
    else:
        days_until_income = horizon_days
    
    # Daily STS
    if free_cash < 0:
        sts_daily = 0.0
        status = "DANGER"
    else:
        sts_daily = free_cash / days_until_income
        status = "OK"
    
    return {
        "sts_daily_recommended": round(max(0.0, sts_daily), 2),
        "status": status,
        "min_low_point": round(min_low_point, 2),
    }

