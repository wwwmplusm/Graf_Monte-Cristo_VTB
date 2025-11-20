from __future__ import annotations

from typing import Dict, List, Literal, Optional

from pydantic import BaseModel


PipelineStatus = Literal["ok", "partial", "error"]
StepStatus = Literal["ok", "no_data", "no_access", "error"]


# Auth schemas
class LoginRequest(BaseModel):
    user_id: str
    user_name: Optional[str] = None


class UserProfile(BaseModel):
    user_id: str
    name: str
    subscription_plan: Literal["free", "premium"] = "free"
    is_active: bool = True


class LoginResponse(BaseModel):
    token: str
    profile: UserProfile


# Consent schemas
class ConsentInitiateRequest(BaseModel):
    user_id: str
    bank_id: str


class BankConsents(BaseModel):
    account: bool
    product: bool
    payment: bool


class BankConsentRequest(BaseModel):
    bank_id: str
    consents: BankConsents


class OnboardingConsentsRequest(BaseModel):
    user_id: str
    banks: List[BankConsentRequest]


# Payment schemas
class MDPPaymentRequest(BaseModel):
    user_id: str
    bank_id: str
    loan_id: Optional[str] = None
    amount: float


class ADPPaymentRequest(BaseModel):
    user_id: str
    bank_id: str
    loan_id: Optional[str] = None
    amount: float


class SDPPaymentRequest(BaseModel):
    user_id: str
    bank_id: str
    deposit_id: Optional[str] = None
    amount: float


# Onboarding schemas
class OnboardingStartRequest(BaseModel):
    user_id: str
    user_name: Optional[str] = None


class OnboardingStatusResponse(BaseModel):
    onboarding_id: str
    current_step: int
    completed_steps: List[int]
    consents_status: Dict[str, Dict[str, str]]  # bank_id -> consent_type -> status


class OnboardingFinalizeRequest(BaseModel):
    onboarding_id: str
    user_id: str


class BaseScorePayload(BaseModel):
    status: Literal["ok", "no_data", "error"]
    value: Optional[float]
    currency: str
    reason: str


class PipelineStep(BaseModel):
    name: str
    status: StepStatus
    details: str
    error_code: Optional[str] = None


class BankRawMetrics(BaseModel):
    sum_account_balances: float
    sum_credit_debts: float
    used_in_base_score: bool


class BankPipelineStatus(BaseModel):
    bank_id: str
    bank_name: str
    pipeline_status: PipelineStatus
    steps: List[PipelineStep]
    raw_metrics: BankRawMetrics


class IntegrationStatusResponse(BaseModel):
    user_id: str
    base_score: BaseScorePayload
    banks: List[BankPipelineStatus]


# Dashboard schemas
class STSToday(BaseModel):
    amount: float
    spent: float
    tomorrow: Dict[str, Any]  # {amount: float, impact: str}


class LoanSummary(BaseModel):
    total_outstanding: float
    mandatory_daily_payment: float
    additional_daily_payment: float
    total_monthly_payment: float


class SavingsSummary(BaseModel):
    total_saved: float
    daily_payment: float
    target: float
    progress_percent: float


class HealthScore(BaseModel):
    value: float
    status: Literal["excellent", "good", "fair", "poor"]
    reasons: Optional[List[str]] = None


class BankStatus(BaseModel):
    bank_id: str
    bank_name: str
    status: Literal["ok", "error"]
    fetched_at: Optional[str] = None


class CacheInfo(BaseModel):
    is_cached: bool
    calculated_at: Optional[str] = None
    age_minutes: Optional[int] = None


class DashboardResponse(BaseModel):
    sts_today: STSToday
    loan_summary: LoanSummary
    savings_summary: SavingsSummary
    total_debit_cards_balance: float
    events_next_30d: List[Dict[str, Any]]
    health_score: HealthScore
    bank_statuses: List[BankStatus]
    user_mode: Literal["loans", "deposits"]
    cache_info: CacheInfo
