from __future__ import annotations

from fastapi import APIRouter

from ..services import banking

router = APIRouter(prefix="/api", tags=["banks"])


@router.get("/banks")
async def list_banks(user_id: str | None = None):
    return banking.list_banks(user_id)


@router.get("/banks/{bank_id}/bootstrap")
async def bootstrap_bank(bank_id: str, user_id: str):
    return await banking.bootstrap_bank(bank_id, user_id)
