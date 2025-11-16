from __future__ import annotations

from pydantic import BaseModel


class ConsentInitiateRequest(BaseModel):
    user_id: str
    bank_id: str
