"""Data models for the hackathon project core."""
from __future__ import annotations

from datetime import date
from typing import List, Optional

from pydantic import BaseModel, Field


class Transaction(BaseModel):
    """Represents a single bank transaction."""

    transactionId: str
    amount: float
    currency: str
    description: Optional[str] = None
    bookingDate: date


class Account(BaseModel):
    """Represents a user's account."""

    accountId: str
    nickname: Optional[str] = None
    # Extend with additional fields once API contract is finalized.


class BankConsent(BaseModel):
    """Stores consent metadata for a bank."""

    bank_id: str
    consent_id: str


class AnalysisResult(BaseModel):
    """Outcome structure returned by analytics engine."""

    payment_date: date
    payment_amount: float
    success_probability_percent: int
    recommendation: str
    color_zone: str = Field(description="green, yellow, or red")

