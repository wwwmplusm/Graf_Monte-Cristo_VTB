from __future__ import annotations

import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from hktn.core.database import init_db
from .config import settings
from .routers import analytics, banks, consents

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("finpulse.backend")


def create_app() -> FastAPI:
    app = FastAPI(title=settings.title, version=settings.version)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(banks.router)
    app.include_router(consents.router)
    app.include_router(analytics.router)

    @app.on_event("startup")
    def _on_startup() -> None:
        logger.info("Bootstrapping FinPulse backend")
        init_db()

    return app


app = create_app()
