"""Data models for the hackathon project core."""
from __future__ import annotations

from datetime import date
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class Transaction(BaseModel):
    """Represents a single bank transaction with optional merchant context."""

    transactionId: str
    amount: float
    currency: str
    accountId: Optional[str] = None
    description: Optional[str] = None
    bookingDate: date
    creditDebitIndicator: Optional[str] = None
    bankTransactionCode: Optional[str] = None
    merchant: Dict[str, Optional[str]] = Field(default_factory=dict)
    mccCode: Optional[str] = None
    category: Optional[str] = None
    transactionInformation: Optional[str] = None
    transactionLocation: Dict[str, Any] = Field(default_factory=dict)
    card: Dict[str, Optional[str]] = Field(default_factory=dict)


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
