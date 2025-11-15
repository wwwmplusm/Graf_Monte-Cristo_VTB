"""Compatibility wrapper for legacy imports.

This module keeps the historical `hktn.backend_app:app` entrypoint working
while the real FastAPI application lives inside `hktn.backend`.
"""

try:  # pragma: no cover - compatibility for direct module import
    from .backend.app import app, create_app
    from .backend.config import settings
except ImportError:  # pragma: no cover
    from backend.app import app, create_app  # type: ignore
    from backend.config import settings  # type: ignore

from hktn.core.obr_client import OBRAPIClient  # re-exported for legacy tests

BANK_CONFIGS = settings.banks
TEAM_CLIENT_ID = settings.team_client_id
TEAM_CLIENT_SECRET = settings.team_client_secret

__all__ = ["app", "create_app", "BANK_CONFIGS", "TEAM_CLIENT_ID", "TEAM_CLIENT_SECRET", "OBRAPIClient"]
