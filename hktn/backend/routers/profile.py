from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException

from core.database import save_user_profile

from ..schemas import GoalRequest

logger = logging.getLogger("finpulse.backend.profile")
router = APIRouter(prefix="/api", tags=["profile"])


@router.post("/profile/goal")
async def set_user_goal(req: GoalRequest):
    """Persist the user's selected financial goal."""
    try:
        save_user_profile(req.user_id, req.goal_type, req.goal_details)
        logger.info("Goal saved for user %s (%s)", req.user_id, req.goal_type)
        return {"status": "ok", "message": "Goal saved successfully."}
    except Exception as exc:  # noqa: BLE001
        logger.error("Failed to save goal for user %s: %s", req.user_id, exc)
        raise HTTPException(status_code=500, detail="Could not save user profile.") from exc
