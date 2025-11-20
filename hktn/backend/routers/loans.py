"""Loans and Deposits API endpoints."""
from __future__ import annotations

import logging
from typing import Any, Dict, List

from fastapi import APIRouter, HTTPException, Query, status

from hktn.core.database import find_approved_consents
from ..services.banking import fetch_bank_credits
from ..services.algorithms import (
    mdp_calculation,
    adp_calculation,
    total_debt_calculation,
    loan_ranking_engine,
)

logger = logging.getLogger("finpulse.backend.loans")

router = APIRouter(prefix="/api", tags=["loans"])


@router.get("/loans")
async def get_loans(user_id: str = Query(..., description="User ID")) -> Dict[str, Any]:
    """
    Возвращает список всех кредитов пользователя с детальной информацией.
    
    Включает:
    - Список кредитов с полями: id, bank, type, balance, rate, monthly_payment, priority
    - Общие метрики: total_outstanding, mdp, adp
    - Стратегию ранжирования
    """
    try:
        # 1. Получить product consents
        product_consents = find_approved_consents(user_id, consent_type="products")
        if not product_consents:
            logger.warning("No product consents found for user %s", user_id)
            return {
                "status": "ok",
                "loans": [],
                "total_outstanding": 0.0,
                "mdp": 0.0,
                "adp": 0.0,
                "strategy": "avalanche",
            }
        
        # 2. Загрузить все кредиты из всех банков
        all_credits: List[Dict[str, Any]] = []
        for consent in product_consents:
            try:
                result = await fetch_bank_credits(
                    consent.bank_id,
                    consent.consent_id,
                    user_id,
                )
                if result.get("status") == "ok":
                    credits = result.get("credits", [])
                    # Фильтруем только кредиты (loan, credit_card, mortgage)
                    for credit in credits:
                        product_type = (
                            credit.get("productType") or 
                            credit.get("product_type") or 
                            credit.get("type", "")
                        ).lower()
                        if product_type in ["loan", "credit_card", "mortgage", "overdraft"]:
                            all_credits.append(credit)
            except Exception as e:
                logger.error("Failed to fetch credits from %s: %s", consent.bank_id, e)
        
        if not all_credits:
            return {
                "status": "ok",
                "loans": [],
                "total_outstanding": 0.0,
                "mdp": 0.0,
                "adp": 0.0,
                "strategy": "avalanche",
            }
        
        # 3. Рассчитать общий долг
        debt_result = total_debt_calculation(all_credits)
        
        # 4. Подготовить данные для MDP/ADP
        active_loans = debt_result.get("active_loans", [])
        debt_obligations = []  # TODO: получить из транзакций
        
        # 5. Рассчитать MDP и ADP
        mdp_result = mdp_calculation(active_loans, debt_obligations)
        adp_result = adp_calculation(
            mdp_result.get("mdp_today_base", 0.0),
            active_loans,
            estimated_monthly_income=50000.0,  # TODO: получить из dashboard
            repayment_speed="balanced",
            strategy="avalanche",
        )
        
        # 6. Ранжировать кредиты
        ranked_loans = loan_ranking_engine(
            active_loans,
            catalog_products=[],  # TODO: загрузить каталог
            strategy="avalanche",
            refi_threshold=2.0,
        )
        
        # 7. Формировать ответ
        loans_list = []
        for idx, loan in enumerate(ranked_loans):
            loan_id = loan.get("id") or loan.get("agreement_id") or f"loan-{idx}"
            loans_list.append({
                "id": loan_id,
                "bank": loan.get("bank_name") or "Unknown",
                "type": loan.get("product_type") or loan.get("productType") or "loan",
                "balance": loan.get("amount") or loan.get("outstanding_balance") or 0.0,
                "rate": loan.get("interest_rate") or loan.get("rate") or 0.0,
                "monthly_payment": loan.get("monthly_payment") or loan.get("Monthly_Payment") or 0.0,
                "priority": loan.get("priority_rank", idx + 1),
                "is_refi_candidate": loan.get("is_refi_candidate", False),
                "maturity_date": loan.get("maturity_date") or loan.get("end_date"),
            })
        
        return {
            "status": "ok",
            "loans": loans_list,
            "total_outstanding": debt_result.get("total_debt_base", 0.0),
            "mdp": mdp_result.get("mdp_today_base", 0.0),
            "adp": adp_result.get("adp_today_base", 0.0),
            "strategy": "avalanche",
        }
        
    except Exception as e:
        logger.error("Error in get_loans for user %s: %s", user_id, e, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch loans: {str(e)}",
        ) from e


@router.get("/deposits")
async def get_deposits(user_id: str = Query(..., description="User ID")) -> Dict[str, Any]:
    """
    Возвращает список всех вкладов/депозитов пользователя.
    
    Включает:
    - Список депозитов с полями: id, bank, type, balance, rate, term_months
    - Общие метрики: total_saved, sdp, target, progress
    """
    try:
        # 1. Получить product consents
        product_consents = find_approved_consents(user_id, consent_type="products")
        if not product_consents:
            return {
                "status": "ok",
                "deposits": [],
                "total_saved": 0.0,
                "sdp": 0.0,
                "target": 0.0,
                "progress_percent": 0.0,
            }
        
        # 2. Загрузить все продукты
        all_products: List[Dict[str, Any]] = []
        for consent in product_consents:
            try:
                result = await fetch_bank_credits(
                    consent.bank_id,
                    consent.consent_id,
                    user_id,
                )
                if result.get("status") == "ok":
                    all_products.extend(result.get("credits", []))
            except Exception as e:
                logger.error("Failed to fetch products from %s: %s", consent.bank_id, e)
        
        # 3. Фильтровать только депозиты
        deposits_list = []
        total_saved = 0.0
        
        for product in all_products:
            product_type = (
                product.get("productType") or 
                product.get("product_type") or 
                product.get("type", "")
            ).lower()
            
            if product_type in ["deposit", "savings"]:
                balance = float(product.get("amount") or product.get("balance") or 0.0)
                total_saved += balance
                
                deposits_list.append({
                    "id": product.get("agreement_id") or product.get("id") or f"deposit-{len(deposits_list)}",
                    "bank": product.get("bank_name") or "Unknown",
                    "type": product_type,
                    "balance": balance,
                    "rate": float(product.get("interest_rate") or product.get("rate") or 0.0),
                    "term_months": int(product.get("term_months") or product.get("term") or 0),
                    "maturity_date": product.get("maturity_date") or product.get("end_date"),
                })
        
        # 4. Рассчитать SDP (Savings Daily Payment)
        # Упрощенный расчет: если есть цель, делим на дни до цели
        # Иначе используем фиксированную сумму
        sdp = 0.0
        target = 0.0
        progress_percent = 0.0
        
        if deposits_list:
            # TODO: получить цель из user_financial_inputs
            # Пока используем упрощенный расчет
            sdp = total_saved / 30.0  # Упрощенный расчет
            target = total_saved * 1.5  # Примерная цель
            progress_percent = min(100.0, (total_saved / target * 100.0) if target > 0 else 0.0)
        
        return {
            "status": "ok",
            "deposits": deposits_list,
            "total_saved": total_saved,
            "sdp": sdp,
            "target": target,
            "progress_percent": progress_percent,
        }
        
    except Exception as e:
        logger.error("Error in get_deposits for user %s: %s", user_id, e, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch deposits: {str(e)}",
        ) from e

