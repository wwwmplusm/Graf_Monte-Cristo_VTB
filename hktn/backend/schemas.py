from __future__ import annotations

from datetime import date, timedelta
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class ConsentInitiateRequest(BaseModel):
    user_id: str
    bank_id: str


class AnalysisRequest(BaseModel):
    user_id: str
    current_balance: float = 50_000.0
    payment_date: date = Field(default_factory=lambda: date.today() + timedelta(days=15))
    payment_amount: float = 25_000.0


class GoalRequest(BaseModel):
    user_id: str
    goal_type: str
    goal_details: Dict[str, Any]


class IngestRequest(BaseModel):
    user_id: str
    user_name: Optional[str] = None


class FinancialPortraitRequest(BaseModel):
    user_id: str
    user_name: Optional[str] = None
    goal_type: Optional[str] = None
    pace: Optional[str] = None
    goal_details: Optional[Dict[str, Any]] = None
    force_error_for_bank: Optional[str] = None


class ProductConsentItem(BaseModel):
    bank_id: str
    product_id: str
    product_type: Optional[str] = None
    consented: bool


class ProductConsentRequest(BaseModel):
    user_id: str
    items: List[ProductConsentItem]


class OnboardingCommitRequest(BaseModel):
    user_id: str


class PreviewResponse(BaseModel):
    productsByBank: Dict[str, List[Dict[str, Any]]]
    latestConsentState: List[Dict[str, Any]] = Field(default_factory=list)
