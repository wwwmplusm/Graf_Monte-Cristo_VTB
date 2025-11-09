from __future__ import annotations

from fastapi import APIRouter

from ..schemas import AnalysisRequest, FinancialPortraitRequest, IngestRequest
from ..services import analytics

router = APIRouter(prefix="/api", tags=["analytics"])


@router.get("/credits")
async def get_user_credits(user_id: str):
    return await analytics.get_user_credits(user_id)


@router.get("/dashboard")
async def get_dashboard_metrics(user_id: str):
    return await analytics.get_dashboard_metrics(user_id)


@router.post("/financial-portrait")
async def build_financial_portrait(req: FinancialPortraitRequest):
    return await analytics.build_financial_portrait_view(req)


@router.post("/ingest/run")
async def run_initial_ingestion(req: IngestRequest):
    return await analytics.run_initial_ingestion(req)


@router.post("/analyze")
async def start_analysis(req: AnalysisRequest):
    return await analytics.start_analysis(req)
