"""
Health check endpoint for container orchestration and frontend status indicator.
Also exposes /health/metrics for CloudWatch-style observability.
"""

import os
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

    # Bedrock — verify creds and model access with a real (cheap) API call
    bedrock_status = "ok"
    try:
        import boto3
        _session = boto3.Session(
            aws_access_key_id=os.environ.get("AWS_ACCESS_KEY_ID"),
            aws_secret_access_key=os.environ.get("AWS_SECRET_ACCESS_KEY"),
            region_name=os.environ.get("AWS_REGION", "ap-south-1"),
        )
        # Use bedrock (not bedrock-runtime) to list models — proves creds are
        # valid and region is reachable without needing model-access approval.
        _client = _session.client("bedrock", verify=False)
        _resp = await asyncio.wait_for(
            asyncio.to_thread(_client.list_foundation_models),
            timeout=5,
        )
        if _resp.get("ResponseMetadata", {}).get("HTTPStatusCode") != 200:
            bedrock_status = "degraded"
    except Exception as _bedrock_exc:
        from app.core.logging import logger
        logger.warning(f"Bedrock health check failed: {type(_bedrock_exc).__name__}: {_bedrock_exc}")
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
