from __future__ import annotations

from typing import List, Literal, Optional

from pydantic import BaseModel


PipelineStatus = Literal["ok", "partial", "error"]
StepStatus = Literal["ok", "no_data", "no_access", "error"]


class ConsentInitiateRequest(BaseModel):
    user_id: str
    bank_id: str


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
