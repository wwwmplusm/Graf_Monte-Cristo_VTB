"""
Experimental helper to demo the end-to-end flow without touching the main app.

It uses the public FastAPI surface (consents -> sync/full-refresh -> dashboard)
instead of calling sandbox banks directly. All sensitive credentials must be
provided via environment variables and are never hardcoded in the repo.

Usage:
    export CLIENT_ID=team260
    export CLIENT_SECRET=...
    python -m hktn.experiments.data_export_playground
"""

from __future__ import annotations

import json
import os
import pathlib
import time
from typing import Dict, List

import requests

BACKEND_URL = os.getenv("FINPULSE_API_URL", "http://localhost:8000/api")
BANK_IDS = [bank.strip() for bank in os.getenv("BANKS", "vbank,abank,sbank").split(",") if bank.strip()]
TARGET_USERS = [user.strip() for user in os.getenv("EXPORT_USERS", "team260-demo").split(",") if user.strip()]
EXPORT_ROOT = pathlib.Path(os.getenv("EXPORT_ROOT", "team260_demo_exports"))

requests.packages.urllib3.disable_warnings()  # noqa: E402  # Not for production; this is a playground.


def _write_json(base_dir: pathlib.Path, filename: str, payload: Dict) -> None:
    base_dir.mkdir(parents=True, exist_ok=True)
    target = base_dir / filename
    target.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"💾 Saved {target}")


def _init_consents(user_id: str) -> Dict:
    payload = {
        "user_id": user_id,
        "banks": BANK_IDS,
        "include_products": True,
        "include_payments": True,
    }
    resp = requests.post(f"{BACKEND_URL}/consents/init", json=payload, timeout=30)
    resp.raise_for_status()
    return resp.json()


def _refresh_and_fetch(user_id: str) -> Dict:
    # Trigger a full refresh (accounts + products) and request dashboard metrics
    refresh_resp = requests.post(
        f"{BACKEND_URL}/sync/full-refresh",
        params={"user_id": user_id, "force": True, "include_dashboard": True},
        timeout=120,
    )
    refresh_resp.raise_for_status()
    return refresh_resp.json()


def run_export_for_user(user_id: str) -> None:
    print(f"\n🚀 Starting export for {user_id} against {BACKEND_URL}")
    export_dir = EXPORT_ROOT / user_id

    consent_response = _init_consents(user_id)
    _write_json(export_dir, "consents.json", consent_response)

    time.sleep(1)  # Small pause to let banks process pending consents
    refresh_response = _refresh_and_fetch(user_id)
    _write_json(export_dir, "full_refresh.json", refresh_response)

    if refresh_response.get("dashboard"):
        _write_json(export_dir, "dashboard.json", refresh_response["dashboard"])

    print(f"✅ Completed export for {user_id}")


if __name__ == "__main__":
    print("This script is for local experimentation; it is not used by the backend service.")
    print(f"Users: {TARGET_USERS}, Banks: {BANK_IDS}, Backend: {BACKEND_URL}")
    for uid in TARGET_USERS:
        try:
            run_export_for_user(uid)
        except Exception as exc:  # noqa: BLE001
            print(f"⚠️  Failed to export for {uid}: {exc}")
