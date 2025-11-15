from __future__ import annotations

from typing import Any, Dict, Optional

from hktn.core.analytics_engine import UserGoal

VALID_GOAL_PACES = {"conservative", "optimal", "fast"}


def _ensure_goal_details(payload: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    if isinstance(payload, dict):
        return dict(payload)
    return {}


def compose_user_goal(
    stored_goal: Optional[Dict[str, Any]],
    goal_type_override: Optional[str] = None,
    goal_details_override: Optional[Dict[str, Any]] = None,
    pace_override: Optional[str] = None,
) -> UserGoal:
    base_details = _ensure_goal_details(goal_details_override) or _ensure_goal_details(
        (stored_goal or {}).get("goal_details")
        if stored_goal
        else {}
    )
    goal_type = goal_type_override or (stored_goal or {}).get("goal_type")
    if not goal_type:
        goal_type = "pay_debts"

    pace_candidates = (
        pace_override,
        base_details.get("pace"),
        base_details.get("save_speed"),
        base_details.get("close_speed"),
    )
    pace = next(
        (candidate for candidate in pace_candidates if isinstance(candidate, str) and candidate in VALID_GOAL_PACES),
        "optimal",
    )
    return UserGoal(goal_type=goal_type, pace=pace, goal_details=base_details)
