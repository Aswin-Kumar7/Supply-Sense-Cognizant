"""
Snapshot persistence service.

Writes immutable analysis snapshots and durable tool traces to the database.
All writes are wrapped in try/except at the call site in procurement_service.py
so a snapshot persistence failure never fails the analysis pipeline.
"""
from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from typing import Optional
from uuid import UUID, uuid4

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.freshness import build_cache_key
from app.models.analysis_snapshot import AnalysisSnapshot
from app.models.analysis_trace import AnalysisTrace


async def save_snapshot(
    db: AsyncSession,
    *,
    supplier_id: Optional[str],
    evidence_hash: str,
    evidence_json: dict,
    risk_policy_version: int,
    financial_policy_version: int,
    model_version: str,
    prompt_version: str = "1",
    generation_mode: str = "ai_generated",
) -> AnalysisSnapshot:
    """
    Persist an immutable evidence snapshot.

    The cache_key is computed deterministically from the evidence hash,
    policy versions, and model metadata — so two analyses that used identical
    inputs produce the same key and can share a cached result.

    Uses flush() not commit() so the caller controls the transaction boundary.
    """
    cache_key = build_cache_key(
        evidence_hash=evidence_hash,
        risk_policy_version=risk_policy_version,
        financial_policy_version=financial_policy_version,
        model_version=model_version,
        prompt_version=prompt_version,
    )
    snapshot = AnalysisSnapshot(
        id=uuid4(),
        cache_key=cache_key,
        supplier_id=supplier_id,
        evidence_hash=evidence_hash,
        risk_policy_version=risk_policy_version,
        financial_policy_version=financial_policy_version,
        model_version=model_version,
        prompt_version=prompt_version,
        evidence_json=evidence_json,
        generation_mode=generation_mode,
        created_at=datetime.now(timezone.utc),
    )
    db.add(snapshot)
    await db.flush()
    return snapshot


async def get_snapshot(db: AsyncSession, snapshot_id: str) -> Optional[AnalysisSnapshot]:
    """Retrieve a snapshot by its UUID string. Returns None for bad or unknown IDs."""
    try:
        uid = UUID(snapshot_id)
    except ValueError:
        return None
    return (await db.execute(
        select(AnalysisSnapshot).where(AnalysisSnapshot.id == uid)
    )).scalar_one_or_none()


async def save_trace(
    db: AsyncSession,
    *,
    snapshot_id: Optional[str],
    tool_name: str,
    args_hash: Optional[str] = None,
    result_hash: Optional[str] = None,
    status: str = "success",
    duration_ms: Optional[float] = None,
) -> AnalysisTrace:
    """
    Persist a single tool or model call trace.

    snapshot_id is optional so traces can be stored even when the parent
    snapshot write failed (e.g., if analysis_snapshots table doesn't exist yet).
    """
    sid: Optional[UUID] = None
    if snapshot_id:
        try:
            sid = UUID(snapshot_id)
        except ValueError:
            pass

    trace = AnalysisTrace(
        id=uuid4(),
        snapshot_id=sid,
        tool_name=tool_name,
        args_hash=args_hash,
        result_hash=result_hash,
        status=status,
        duration_ms=duration_ms,
        created_at=datetime.now(timezone.utc),
    )
    db.add(trace)
    await db.flush()
    return trace


async def get_traces(db: AsyncSession, snapshot_id: str) -> list:
    """Retrieve all traces for a snapshot, ordered by creation time."""
    try:
        uid = UUID(snapshot_id)
    except ValueError:
        return []
    result = await db.execute(
        select(AnalysisTrace)
        .where(AnalysisTrace.snapshot_id == uid)
        .order_by(AnalysisTrace.created_at)
    )
    return list(result.scalars().all())


def hash_args(args: dict) -> str:
    """Stable 16-char hex digest of tool call arguments for trace records."""
    serialised = json.dumps(args, sort_keys=True, default=str)
    return hashlib.sha256(serialised.encode()).hexdigest()[:16]


def hash_result(result: object) -> str:
    """Stable 16-char hex digest of a tool call result for trace records."""
    serialised = json.dumps(result, sort_keys=True, default=str)
    return hashlib.sha256(serialised.encode()).hexdigest()[:16]
