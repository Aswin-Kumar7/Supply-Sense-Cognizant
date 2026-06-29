"""
Procurement Intelligence API endpoints.

Cache strategy:
- Cache keys are content-addressable: keyed by policy version so that activating
  a new policy version automatically routes past stale results without explicit
  invalidation.
- TTL is configurable per-request via ?ttl_seconds (default 600 = 10 min).
- In-process dict is the hot layer — zero-latency on cache hits.
- PostgreSQL analysis_cache table is the warm layer — survives restarts.
- On first request after startup the DB row is loaded into memory so Bedrock is never called
  unless the stored result is actually stale.
- Manual cache bust: POST /procurement/cache/invalidate
- Freshness metadata: GET /procurement/freshness
- Provenance replay: GET /procurement/provenance/{snapshot_id}
"""
from __future__ import annotations

import json
import time
import asyncio
from uuid import UUID
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Query, Response as FastAPIResponse
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db, AsyncSessionLocal
from app.core.freshness import compute_freshness, DEFAULT_STALE_AFTER
from app.models.analysis_cache import AnalysisCache
from app.services.procurement_service import ProcurementService
from app.core.logging import logger

router = APIRouter(prefix="/procurement", tags=["Procurement Intelligence"])

DEFAULT_TTL = 600  # 10 minutes

# ── Content-addressable cache key prefixes ────────────────────────────────────
# Including policy versions ensures activating a new policy auto-busts the key.
_RISK_POLICY_V = 1
_FINANCIAL_POLICY_V = 1
_ACTION_CARDS_KEY = f"action_cards:rp{_RISK_POLICY_V}:fp{_FINANCIAL_POLICY_V}"
_EXEC_BRIEF_KEY = f"exec_brief:rp{_RISK_POLICY_V}:fp{_FINANCIAL_POLICY_V}"


# ── In-process hot cache ──────────────────────────────────────────────────────
# { key: (result, stored_at_monotonic, generated_at_iso) }
_CACHE: dict[str, tuple] = {}
_GENERATING: dict[str, bool] = {}


def _age(key: str) -> float:
    """Seconds since this key was cached in-process. inf if not cached."""
    if key not in _CACHE:
        return float("inf")
    return time.monotonic() - _CACHE[key][1]


def _generated_at(key: str) -> Optional[str]:
    """ISO-8601 UTC timestamp when the cached result was generated, or None."""
    if key not in _CACHE:
        return None
    return _CACHE[key][2]


# ── DB helpers ────────────────────────────────────────────────────────────────

async def _load_from_db(key: str, ttl: int) -> object | None:
    """Read a cache entry from DB. Returns None if missing or older than ttl."""
    async with AsyncSessionLocal() as session:
        row = (await session.execute(
            select(AnalysisCache).where(AnalysisCache.cache_key == key)
        )).scalar_one_or_none()

    if row is None:
        return None

    age = (datetime.now(timezone.utc) - row.generated_at.replace(tzinfo=timezone.utc)).total_seconds()
    if age > ttl:
        return None

    result = json.loads(row.result_json)
    generated_at_iso = row.generated_at.replace(tzinfo=timezone.utc).isoformat()
    _CACHE[key] = (result, time.monotonic() - age, generated_at_iso)
    logger.info(f"procurement cache: warmed '{key}' from DB ({age:.0f}s old)")
    return result


async def _save_to_db(key: str, result: object) -> None:
    """Upsert a cache entry into the DB."""
    try:
        result_json = json.dumps(result, default=str)
        async with AsyncSessionLocal() as session:
            await session.execute(delete(AnalysisCache).where(AnalysisCache.cache_key == key))
            session.add(AnalysisCache(
                cache_key=key,
                result_json=result_json,
                generated_at=datetime.now(timezone.utc).replace(tzinfo=None),
            ))
            await session.commit()
        logger.info(f"procurement cache: persisted '{key}' to DB")
    except Exception as exc:
        logger.warning(f"procurement cache: DB write failed for '{key}': {exc}")


# ── Core get-or-generate logic ────────────────────────────────────────────────

async def _get_or_generate(key: str, ttl: int, coro_factory, refresh_fn=None):
    """
    1. Return in-process cache if fresh.
    2. Try DB if in-process is cold.
    3. Otherwise generate (blocking first time, background if stale).
    """
    if _age(key) < ttl:
        return _CACHE[key][0]

    db_result = await _load_from_db(key, ttl)
    if db_result is not None:
        return db_result

    if key in _CACHE:
        if not _GENERATING.get(key):
            _GENERATING[key] = True
            asyncio.create_task(_refresh(key, refresh_fn or coro_factory))
        return _CACHE[key][0]

    _GENERATING[key] = True
    try:
        result = await coro_factory()
        now_iso = datetime.now(timezone.utc).isoformat()
        _CACHE[key] = (result, time.monotonic(), now_iso)
        asyncio.create_task(_save_to_db(key, result))
        return result
    finally:
        _GENERATING[key] = False


async def _refresh(key: str, refresh_fn):
    """Background refresh using a fresh DB session (not the request-scoped one)."""
    try:
        async with AsyncSessionLocal() as session:
            service = ProcurementService(session)
            result = await refresh_fn(service)
            now_iso = datetime.now(timezone.utc).isoformat()
            _CACHE[key] = (result, time.monotonic(), now_iso)
            await _save_to_db(key, result)
    except Exception as exc:
        logger.warning(f"procurement cache: background refresh failed for '{key}': {exc}")
    finally:
        _GENERATING[key] = False


async def _get_or_generate_alternate(supplier_id: str, ttl: int, coro_factory):
    key = f"alternates:{supplier_id}:rp{_RISK_POLICY_V}:fp{_FINANCIAL_POLICY_V}"
    return await _get_or_generate(key, ttl, coro_factory)


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/action-cards")
async def get_intelligent_action_cards(
    response: FastAPIResponse,
    ttl_seconds: int = Query(default=DEFAULT_TTL, ge=60, le=7200),
    db: AsyncSession = Depends(get_db),
):
    """
    AI-enhanced procurement ActionCards with freshness headers.

    Response headers:
    - X-Generated-At: ISO-8601 UTC timestamp when result was generated
    - X-Cache-Age-Seconds: how old the cached result is
    - X-Stale: "true" if age exceeds the requested TTL
    - X-Evidence-Policy: content-addressable cache key
    """
    service = ProcurementService(db)
    result = await _get_or_generate(
        _ACTION_CARDS_KEY, ttl_seconds,
        lambda: service.generate_action_cards(),
        refresh_fn=lambda svc: svc.generate_action_cards(),
    )
    age = _age(_ACTION_CARDS_KEY)
    response.headers["X-Generated-At"] = _generated_at(_ACTION_CARDS_KEY) or ""
    response.headers["X-Cache-Age-Seconds"] = str(round(age, 1) if age != float("inf") else 0)
    response.headers["X-Stale"] = "true" if age > ttl_seconds else "false"
    response.headers["X-Evidence-Policy"] = _ACTION_CARDS_KEY
    return result


@router.get("/executive-brief")
async def get_executive_brief(
    ttl_seconds: int = Query(default=DEFAULT_TTL, ge=60, le=7200),
    db: AsyncSession = Depends(get_db),
):
    """
    Executive procurement briefing with embedded freshness metadata.

    The response includes cache_age_seconds and stale fields so the UI
    can report exactly how old the briefing is without a separate request.
    """
    service = ProcurementService(db)
    result = await _get_or_generate(
        _EXEC_BRIEF_KEY, ttl_seconds,
        lambda: service.generate_executive_brief(),
        refresh_fn=lambda svc: svc.generate_executive_brief(),
    )
    age = _age(_EXEC_BRIEF_KEY)
    # Return a copy with freshness metadata embedded — do not mutate the cached dict.
    return {
        **result,
        "cache_age_seconds": round(age, 1) if age != float("inf") else 0,
        "stale": age > ttl_seconds,
    }


@router.get("/alternate-suppliers/{supplier_id}")
async def get_alternate_recommendation(
    supplier_id: UUID,
    ttl_seconds: int = Query(default=DEFAULT_TTL, ge=60, le=7200),
    db: AsyncSession = Depends(get_db),
):
    """Alternate supplier recommendation with configurable TTL cache."""
    sid = str(supplier_id)
    service = ProcurementService(db)
    return await _get_or_generate_alternate(
        sid, ttl_seconds,
        lambda: service.get_alternate_supplier_recommendation(sid),
    )


@router.get("/freshness")
async def get_cache_freshness():
    """
    Report freshness metadata for all cached procurement resources.

    Returns cache age, generation timestamp, and staleness status for each
    resource. Useful for dashboards and debugging stale-data issues.
    """
    resources = {
        "action_cards": _ACTION_CARDS_KEY,
        "exec_brief": _EXEC_BRIEF_KEY,
    }
    report = {}
    for name, key in resources.items():
        age = _age(key)
        cached = key in _CACHE
        report[name] = {
            "cached": cached,
            "cache_key": key,
            "generated_at": _generated_at(key),
            "cache_age_seconds": round(age, 1) if (cached and age != float("inf")) else None,
            "stale_after_seconds": DEFAULT_STALE_AFTER,
            "stale": (age > DEFAULT_STALE_AFTER) if cached else None,
        }
    return report


@router.get("/provenance/{snapshot_id}")
async def get_analysis_provenance(
    snapshot_id: str,
    db: AsyncSession = Depends(get_db),
):
    """
    Retrieve the immutable evidence snapshot used to generate an analysis.

    The snapshot records the exact evidence package, policy versions, model,
    and prompt that produced the result — enabling full replay from its ID.
    """
    from fastapi import HTTPException
    from app.services.snapshot_service import get_snapshot, get_traces

    snapshot = await get_snapshot(db, snapshot_id)
    if snapshot is None:
        raise HTTPException(status_code=404, detail="Snapshot not found")

    traces = await get_traces(db, snapshot_id)

    return {
        "snapshot_id": str(snapshot.id),
        "supplier_id": snapshot.supplier_id,
        "evidence_hash": snapshot.evidence_hash,
        "cache_key": snapshot.cache_key,
        "risk_policy_version": snapshot.risk_policy_version,
        "financial_policy_version": snapshot.financial_policy_version,
        "model_version": snapshot.model_version,
        "prompt_version": snapshot.prompt_version,
        "generation_mode": snapshot.generation_mode,
        "created_at": snapshot.created_at.isoformat(),
        "evidence": snapshot.evidence_json,
        "traces": [
            {
                "tool_name": t.tool_name,
                "status": t.status,
                "duration_ms": t.duration_ms,
                "args_hash": t.args_hash,
                "result_hash": t.result_hash,
                "created_at": t.created_at.isoformat(),
            }
            for t in traces
        ],
    }


@router.post("/cache/invalidate")
async def invalidate_cache():
    """Force-clear in-process and DB cache (AI results + risk computation)."""
    _CACHE.clear()
    # Also drop the all-supplier risk cache so a manual Refresh is fully fresh.
    try:
        from app.services.risk_intelligence import clear_risk_cache
        clear_risk_cache()
    except Exception:
        pass
    async with AsyncSessionLocal() as session:
        await session.execute(delete(AnalysisCache))
        await session.commit()
    logger.info("procurement cache: manually invalidated")
    return {"status": "cleared"}
