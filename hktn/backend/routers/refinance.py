"""Refinancing API endpoints."""
from __future__ import annotations

import logging
from typing import Any, Dict, List

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel

from hktn.core.database import find_approved_consents
from ..services.banking import fetch_bank_credits, fetch_bank_data_with_consent
from ..services.algorithms import (
    financing_need_detector,
    best_financing_offer_selector,
    loan_ranking_engine,
    total_debt_calculation,
    mdp_calculation,
    sts_calculation,
)

logger = logging.getLogger("finpulse.backend.refinance")

router = APIRouter(prefix="/api/refinance", tags=["refinance"])


class RefinanceApplicationRequest(BaseModel):
    user_id: str
    offer_id: str
    loan_ids: List[str]
    phone: str


@router.get("/optimize-loans")
async def optimize_loans(
    user_id: str = Query(..., description="User ID"),
) -> Dict[str, Any]:
    """
    Подбирает лучшие условия рефинансирования для кредитов пользователя.
    
    Возвращает:
    - Список предложений рефинансирования
    - Экономию в месяц
    - Рекомендации по стратегии
    """
    try:
        # 1. Получить product consents
        product_consents = find_approved_consents(user_id, consent_type="products")
        if not product_consents:
            return {
                "status": "ok",
                "offers": [],
                "financing_needed": False,
                "urgency": "NONE",
            }
        
        # 2. Загрузить все кредиты
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
                "offers": [],
                "financing_needed": False,
                "urgency": "NONE",
            }
        
        # 3. Рассчитать долг и ранжировать кредиты
        debt_result = total_debt_calculation(all_credits)
        active_loans = debt_result.get("active_loans", [])
        
        # Загрузить каталог продуктов (упрощенно - из всех банков)
        catalog_products: List[Dict[str, Any]] = []
        for consent in product_consents:
            try:
                # Пытаемся получить каталог продуктов
                result = await fetch_bank_data_with_consent(
                    consent.bank_id,
                    consent.consent_id,
                    user_id,
                    "products",
                )
                if result.get("status") == "ok":
                    products = result.get("data", {}).get("products", [])
                    if isinstance(products, list):
                        catalog_products.extend(products)
            except Exception as e:
                logger.warning("Failed to fetch catalog from %s: %s", consent.bank_id, e)
        
        # Ранжировать кредиты
        ranked_loans = loan_ranking_engine(
            active_loans,
            catalog_products,
            strategy="avalanche",
            refi_threshold=2.0,
        )
        
        # 4. Определить необходимость финансирования
        # Упрощенные данные для детектора
        estimated_income = 50000.0  # TODO: получить из dashboard
        sts_status = "OK"  # TODO: получить из dashboard
        
        financing_result = financing_need_detector(
            estimated_monthly_income=estimated_income,
            active_loans=active_loans,
            sts_status=sts_status,
            ordered_loans=ranked_loans,
            total_overdue_debt_base=debt_result.get("total_overdue_debt_base", 0.0),
            dti_threshold=0.5,
        )
        
        # 5. Подобрать лучшие офферы
        refi_candidates = financing_result.get("refi_candidates", [])
        offers = []
        
        if refi_candidates and catalog_products:
            offers = best_financing_offer_selector(
                refi_candidates=refi_candidates,
                active_loans=active_loans,
                catalog_offers=catalog_products,
                estimated_monthly_income=estimated_income,
                min_rate_diff=1.5,
            )
        
        # 6. Форматировать ответ
        formatted_offers = []
        for idx, offer in enumerate(offers):
            offer_data = offer.get("offer_data", {})
            formatted_offers.append({
                "id": f"refi-offer-{idx}",
                "bank": offer_data.get("bankName") or offer_data.get("bank_name") or "Unknown",
                "rate": float(offer_data.get("interestRate") or offer_data.get("rate") or 0.0),
                "term_months": int(offer_data.get("termMonths") or offer_data.get("max_term_months") or 60),
                "strategy": offer.get("strategy"),
                "monthly_payment": round(offer.get("new_monthly_payment", 0.0), 2),
                "savings": round(offer.get("monthly_saving", 0.0), 2),
                "loan_amount": round(offer.get("loan_amount", 0.0), 2),
                "commission": 0.0,  # TODO: получить из оффера
                "breakeven_months": 0,  # TODO: рассчитать
            })
        
        return {
            "status": "ok",
            "offers": formatted_offers,
            "financing_needed": financing_result.get("financing_needed", False),
            "urgency": financing_result.get("urgency", "NONE"),
            "triggers": financing_result.get("triggers", []),
        }
        
    except Exception as e:
        logger.error("Error in optimize_loans for user %s: %s", user_id, e, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to optimize loans: {str(e)}",
        ) from e


@router.post("/apply")
async def apply_refinance(req: RefinanceApplicationRequest) -> Dict[str, Any]:
    """
    Подает заявку на рефинансирование.
    
    В реальном приложении здесь был бы вызов банковского API для создания заявки.
    Для демо возвращаем успешный результат.
    """
    try:
        logger.info(
            "Refinance application: user=%s, offer=%s, loans=%s, phone=%s",
            req.user_id,
            req.offer_id,
            req.loan_ids,
            req.phone,
        )
        
        # TODO: Реальная интеграция с банковским API
        # Здесь должен быть вызов POST /product-application или аналогичного endpoint
        
        # Для демо возвращаем успех
        return {
            "status": "approved",
            "application_id": f"app-{req.user_id}-{req.offer_id}",
            "message": "Заявка успешно подана. Банк свяжется с вами в ближайшее время.",
        }
        
    except Exception as e:
        logger.error("Error in apply_refinance: %s", e, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to submit application: {str(e)}",
        ) from e

