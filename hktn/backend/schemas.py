from __future__ import annotations

from typing import List, Literal, Optional

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
