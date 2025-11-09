"""Core package exposing primary interfaces for the FinPulse project."""

from .analytics_engine import build_financial_portrait, run_analysis, UserGoal
from .data_models import AnalysisResult, Transaction
from .obr_client import ConsentInitResult, OBRAPIClient

__all__ = [
    "run_analysis",
    "build_financial_portrait",
    "UserGoal",
    "OBRAPIClient",
    "ConsentInitResult",
    "AnalysisResult",
    "Transaction",
]
