from __future__ import annotations

import os
from pathlib import Path
from typing import Dict, List, Optional

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")


class BankConfig(dict):
    """Dictionary-backed bank configuration with attribute helpers."""

    def __init__(self, display_name: str, url: Optional[str]):
        super().__init__(display_name=display_name, url=url)

    @property
    def display_name(self) -> str:
        return self.get("display_name", "")

    @display_name.setter
    def display_name(self, value: str) -> None:
        self["display_name"] = value

    @property
    def url(self) -> Optional[str]:
        return self.get("url")

    @url.setter
    def url(self, value: Optional[str]) -> None:
        self["url"] = value


def _build_bank_configs() -> Dict[str, BankConfig]:
    """Load partner bank configuration from environment variables."""
    return {
        "vbank": BankConfig(display_name="VBank", url=os.getenv("VBANK_API_URL")),
        "abank": BankConfig(display_name="ABank", url=os.getenv("ABANK_API_URL")),
        "sbank": BankConfig(display_name="SBank", url=os.getenv("SBANK_API_URL")),
    }


class Settings:
    """Runtime settings shared across the backend application."""

    def __init__(self) -> None:
        self.title: str = "FinPulse Experience API"
        self.version: str = "4.0.0"
        self.frontend_url: str = os.getenv("FRONTEND_URL", "http://localhost:5173")
        self.cors_origins: List[str] = [
            "http://localhost:3000",
            "http://localhost:5173",
            "http://127.0.0.1:5173",
        ]
        self.api_cache_ttl: int = int(os.getenv("API_CACHE_TTL", "300"))
        self.api_cache_size: int = int(os.getenv("API_CACHE_SIZE", "100"))
        self.team_client_id: Optional[str] = os.getenv("CLIENT_ID")
        self.team_client_secret: Optional[str] = os.getenv("CLIENT_SECRET")
        self.banks: Dict[str, BankConfig] = _build_bank_configs()
        self.default_salary_amount: float = float(os.getenv("DEFAULT_SALARY_AMOUNT", "0"))
        self.default_next_salary_days: int = int(os.getenv("DEFAULT_NEXT_SALARY_DAYS", "14"))
        self.default_credit_payment_amount: float = float(os.getenv("DEFAULT_CREDIT_PAYMENT_AMOUNT", "0"))
        self.default_credit_payment_days: int = int(os.getenv("DEFAULT_CREDIT_PAYMENT_DAYS", "10"))


settings = Settings()
