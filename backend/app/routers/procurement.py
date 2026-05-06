"""
Procurement Intelligence API endpoints.

Cache strategy:
- TTL is configurable per-request via ?ttl_seconds (default 600 = 10 min, mirrors frontend setting).
- In-process dict is the hot layer — zero-latency on cache hits.
- PostgreSQL analysis_cache table is the warm layer — survives restarts.
- On first request after startup the DB row is loaded into memory so Bedrock is never called
  unless the stored result is actually stale.
- Manual cache bust: POST /procurement/cache/invalidate
"""

import json
import time
import asyncio
from uuid import UUID
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db, AsyncSessionLocal
from app.models.analysis_cache import AnalysisCache
from app.services.procurement_service import ProcurementService
from app.core.logging import logger

router = APIRouter(prefix="/procurement", tags=["Procurement Intelligence"])

DEFAULT_TTL = 600  # 10 minutes

# ── In-process hot cache ──────────────────────────────────────────────────────
# { key: (result, stored_at_monotonic) }
_CACHE: dict[str, tuple[object, float]] = {}
_GENERATING: dict[str, bool] = {}


def _age(key: str) -> float:
    """Seconds since this key was cached in-process. inf if not cached."""
    if key not in _CACHE:
        return float("inf")
    return time.monotonic() - _CACHE[key][1]


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
    # Warm the in-process cache with the remaining ttl budget converted to monotonic
    _CACHE[key] = (result, time.monotonic() - age)
    logger.info(f"procurement cache: warmed '{key}' from DB ({age:.0f}s old)")
    return result


async def _save_to_db(key: str, result: object) -> None:
    """Upsert a cache entry into the DB."""
    try:
        result_json = json.dumps(result, default=str)
        async with AsyncSessionLocal() as session:
            # Delete old row then insert fresh (works on both PG and SQLite)
            await session.execute(delete(AnalysisCache).where(AnalysisCache.cache_key == key))
            session.add(AnalysisCache(
                cache_key=key,
                result_json=result_json,
                generated_at=datetime.now(timezone.utc),
            ))
            await session.commit()
        logger.info(f"procurement cache: persisted '{key}' to DB")
    except Exception as exc:
        logger.warning(f"procurement cache: DB write failed for '{key}': {exc}")


# ── Core get-or-generate logic ────────────────────────────────────────────────

async def _get_or_generate(key: str, ttl: int, coro_factory):
    """
    1. Return in-process cache if fresh.
    2. Try DB if in-process is cold.
    3. Otherwise generate (blocking first time, background if stale).
    """
    if _age(key) < ttl:
        return _CACHE[key][0]

    # Try DB before calling Bedrock
    db_result = await _load_from_db(key, ttl)
    if db_result is not None:
        return db_result

    # Cache is genuinely stale/empty
    if key in _CACHE:
        # Serve the stale result immediately; refresh in background
        if not _GENERATING.get(key):
            _GENERATING[key] = True
            asyncio.create_task(_refresh(key, coro_factory))
        return _CACHE[key][0]

    # First ever call — must wait
    _GENERATING[key] = True
    try:
        result = await coro_factory()
        _CACHE[key] = (result, time.monotonic())
        asyncio.create_task(_save_to_db(key, result))
        return result
    finally:
        _GENERATING[key] = False


async def _refresh(key: str, coro_factory):
    try:
        result = await coro_factory()
        _CACHE[key] = (result, time.monotonic())
        await _save_to_db(key, result)
    except Exception as exc:
        logger.warning(f"procurement cache: background refresh failed for '{key}': {exc}")
    finally:
        _GENERATING[key] = False


# ── Alternate-supplier per-supplier cache ────────────────────────────────────
# Keyed by supplier_id; also written to DB.

async def _get_or_generate_alternate(supplier_id: str, ttl: int, coro_factory):
    key = f"alternates:{supplier_id}"
    return await _get_or_generate(key, ttl, coro_factory)


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/action-cards")
async def get_intelligent_action_cards(
    ttl_seconds: int = Query(default=DEFAULT_TTL, ge=60, le=7200),
    db: AsyncSession = Depends(get_db),
):
    """
    AI-enhanced procurement ActionCards.
    TTL is configurable (default 600s = 10 min); matches the frontend cache buffer setting.
    """
    service = ProcurementService(db)
    return await _get_or_generate(
        "action_cards", ttl_seconds,
        lambda: service.generate_action_cards(),
    )


@router.get("/executive-brief")
async def get_executive_brief(
    ttl_seconds: int = Query(default=DEFAULT_TTL, ge=60, le=7200),
    db: AsyncSession = Depends(get_db),
):
    """
    Executive procurement briefing.
    TTL is configurable (default 600s = 10 min); matches the frontend cache buffer setting.
    """
    service = ProcurementService(db)
    return await _get_or_generate(
        "exec_brief", ttl_seconds,
        lambda: service.generate_executive_brief(),
    )


@router.get("/alternate-suppliers/{supplier_id}")
async def get_alternate_recommendation(
    supplier_id: UUID,
    ttl_seconds: int = Query(default=DEFAULT_TTL, ge=60, le=7200),
    db: AsyncSession = Depends(get_db),
):
    """Alternate supplier recommendation with configurable TTL cache."""
    service = ProcurementService(db)
    return await _get_or_generate_alternate(
        str(supplier_id), ttl_seconds,
        lambda: service.get_alternate_supplier_recommendation(str(supplier_id)),
    )


@router.post("/cache/invalidate")
async def invalidate_cache():
    """Force-clear in-process and DB cache (triggers fresh Bedrock generation on next request)."""
    _CACHE.clear()
    async with AsyncSessionLocal() as session:
        await session.execute(delete(AnalysisCache))
        await session.commit()
    logger.info("procurement cache: manually invalidated (in-process + DB)")
    return {"status": "cleared"}
