"""
Health check endpoint for container orchestration and frontend status indicator.
Also exposes /health/metrics for CloudWatch-style observability.
"""

import time
import asyncio
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

from app.core.database import get_db
from app.agents.strands_agents import STRANDS_AVAILABLE
from app.core.metrics import metrics_store

router = APIRouter(tags=["Health"])

_START_TIME = time.time()


@router.get("/health")
async def health_check(db: AsyncSession = Depends(get_db)):
    """
    Extended health check returning per-subsystem status.
    Used by the frontend TopBar health indicator.
    """
    # Database
    db_status = "ok"
    db_error = None
    try:
        # If the DB host is unreachable, this can otherwise hang the request.
        await asyncio.wait_for(db.execute(text("SELECT 1")), timeout=2)
    except Exception as e:
        from app.core.logging import logger
        logger.error(f"Database health check query failed: {e}", exc_info=True)
        db_status = "error"
        db_error = str(e)

    # Bedrock — check if AWS creds are configured (no actual call)
    bedrock_status = "ok"
    try:
        import boto3
        session = boto3.session.Session()
        creds = session.get_credentials()
        if creds is None:
            bedrock_status = "unavailable"
    except Exception:
        bedrock_status = "unavailable"

    # Strands agents
    strands_status = "ok" if STRANDS_AVAILABLE else "unavailable"

    # Synthetic engine
    synthetic_status = "ok"
    try:
        from app.services.synthetic_engine import synthetic_engine
        synthetic_status = "ok" if getattr(synthetic_engine, "_running", False) else "stopped"
    except Exception:
        synthetic_status = "stopped"

    # Chat session count
    session_count = 0
    try:
        from app.routers.chat import _SESSION_STORE
        session_count = len(_SESSION_STORE)
    except Exception:
        pass

    # SSE subscribers — keep metrics store current
    try:
        from app.core.event_bus import event_bus
        metrics_store.set_sse_count(event_bus.subscriber_count)
    except Exception:
        pass

    # Overall status
    if db_status == "error":
        overall = "unhealthy"
    elif bedrock_status == "unavailable" or strands_status == "unavailable":
        overall = "degraded"
    else:
        overall = "healthy"

    return {
        "status": overall,
        "service": "supplysense-api",
        "database": db_status,
        "db_error": db_error,
        "bedrock": bedrock_status,
        "strands_agents": strands_status,
        "synthetic_engine": synthetic_status,
        "session_count": session_count,
        "uptime_seconds": int(time.time() - _START_TIME),
    }


@router.get("/health/metrics")
async def health_metrics():
    """
    CloudWatch-style observability metrics for SupplySense.

    Returns:
    - Total API request count and per-endpoint breakdown (with p50/p95 latency)
    - Agent invocation counts by agent name
    - Bedrock real vs fallback call counts and latency
    - SSE current and peak connection counts
    - Synthetic engine event emission total
    """
    return metrics_store.snapshot()
