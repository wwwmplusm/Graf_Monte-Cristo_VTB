"""Compatibility wrapper for legacy imports.

This module keeps the historical `hktn.backend_app:app` entrypoint working
while the real FastAPI application lives inside `hktn.backend`.
"""

from .backend.app import app, create_app

__all__ = ["app", "create_app"]
