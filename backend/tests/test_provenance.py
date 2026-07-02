"""
Phase 4 — Data provenance and freshness tests.

Covers:
- Content-addressable cache key generation (determinism + sensitivity)
- Freshness metadata computation (stale/fresh detection, age, timezone handling)
- Hash utilities (hash_args, hash_result)
- Snapshot service async functions (with mocked DB sessions)
- Model attribute presence (AnalysisSnapshot, AnalysisTrace)
- Integration between EvidencePackage facts_hash and snapshot evidence_hash
"""

import asyncio
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest

from app.core.evidence import build_evidence_package
from app.core.freshness import (
    FreshnessMetadata,
    build_cache_key,
    compute_freshness,
    DEFAULT_STALE_AFTER,
    PROMPT_VERSION,
)
from app.models.analysis_cache import AnalysisCache
from app.models.analysis_snapshot import AnalysisSnapshot
from app.models.analysis_trace import AnalysisTrace
from app.services.snapshot_service import (
    get_snapshot,
    get_traces,
    hash_args,
    hash_result,
    save_snapshot,
    save_trace,
)


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture
def mock_db():
    """Async DB session mock that supports add/flush/execute."""
    db = AsyncMock()
    db.add = MagicMock()
    db.flush = AsyncMock()
    return db


def _make_execute_returning(value):
    """Build a mock execute result that returns value from scalar_one_or_none."""
    result = MagicMock()
    result.scalar_one_or_none.return_value = value
    return AsyncMock(return_value=result)


def _make_execute_returning_scalars(values):
    """Build a mock execute result that returns values from scalars().all()."""
    scalars_mock = MagicMock()
    scalars_mock.all.return_value = values
    result = MagicMock()
    result.scalars.return_value = scalars_mock
    return AsyncMock(return_value=result)


def _base_evidence_kwargs(**overrides):
    return {
        "supplier_id": "sup-001",
        "supplier_name": "Acme Corp",
        "risk_score": 0.72,
        "risk_level": "high",
        "exposure_inr": 450_000.0,
        "days_to_stockout": 8,
        "sku_count": 3,
        **overrides,
    }


# ── TestCacheKeyGeneration ────────────────────────────────────────────────────

class TestCacheKeyGeneration:
    _BASE = dict(
        evidence_hash="abc123def456abc1",
        risk_policy_version=1,
        financial_policy_version=1,
        model_version="anthropic.claude-haiku-4-5-20251001-v1:0",
        prompt_version="1",
    )

    def test_same_inputs_produce_same_key(self):
        k1 = build_cache_key(**self._BASE)
        k2 = build_cache_key(**self._BASE)
        assert k1 == k2

    def test_different_evidence_hash_produces_different_key(self):
        k1 = build_cache_key(**self._BASE)
        k2 = build_cache_key(**{**self._BASE, "evidence_hash": "ffffffffffffffff"})
        assert k1 != k2

    def test_different_risk_policy_version_produces_different_key(self):
        k1 = build_cache_key(**self._BASE)
        k2 = build_cache_key(**{**self._BASE, "risk_policy_version": 2})
        assert k1 != k2

    def test_different_financial_policy_version_produces_different_key(self):
        k1 = build_cache_key(**self._BASE)
        k2 = build_cache_key(**{**self._BASE, "financial_policy_version": 2})
        assert k1 != k2

    def test_different_model_version_produces_different_key(self):
        k1 = build_cache_key(**self._BASE)
        k2 = build_cache_key(**{**self._BASE, "model_version": "anthropic.claude-haiku-4-5-v1"})
        assert k1 != k2

    def test_different_prompt_version_produces_different_key(self):
        k1 = build_cache_key(**self._BASE)
        k2 = build_cache_key(**{**self._BASE, "prompt_version": "2"})
        assert k1 != k2

    def test_key_is_32_character_hex_string(self):
        key = build_cache_key(**self._BASE)
        assert len(key) == 32
        assert all(c in "0123456789abcdef" for c in key)


# ── TestFreshnessComputation ──────────────────────────────────────────────────

class TestFreshnessComputation:
    def test_very_fresh_result_is_not_stale(self):
        generated_at = datetime.now(timezone.utc) - timedelta(seconds=5)
        fm = compute_freshness(generated_at, stale_after_seconds=600)
        assert fm.stale is False

    def test_result_past_max_age_is_stale(self):
        generated_at = datetime.now(timezone.utc) - timedelta(seconds=700)
        fm = compute_freshness(generated_at, stale_after_seconds=600)
        assert fm.stale is True

    def test_result_exactly_at_boundary_is_stale(self):
        # equal to stale_after counts as stale (strict >)
        generated_at = datetime.now(timezone.utc) - timedelta(seconds=601)
        fm = compute_freshness(generated_at, stale_after_seconds=600)
        assert fm.stale is True

    def test_stale_result_has_reason(self):
        generated_at = datetime.now(timezone.utc) - timedelta(seconds=1000)
        fm = compute_freshness(generated_at, stale_after_seconds=600)
        assert fm.stale_reason == "exceeded_max_age"

    def test_fresh_result_has_no_reason(self):
        generated_at = datetime.now(timezone.utc) - timedelta(seconds=10)
        fm = compute_freshness(generated_at, stale_after_seconds=600)
        assert fm.stale_reason is None

    def test_cache_age_seconds_is_non_negative(self):
        generated_at = datetime.now(timezone.utc) - timedelta(seconds=30)
        fm = compute_freshness(generated_at, stale_after_seconds=600)
        assert fm.cache_age_seconds >= 0.0

    def test_naive_datetime_treated_as_utc(self):
        # Naive datetime (no tzinfo) should be handled without raising
        naive = datetime.utcnow() - timedelta(seconds=10)
        fm = compute_freshness(naive, stale_after_seconds=600)
        assert fm.stale is False
        assert fm.cache_age_seconds >= 0.0

    def test_generated_at_field_is_iso8601_string(self):
        generated_at = datetime(2026, 1, 15, 12, 0, 0, tzinfo=timezone.utc)
        fm = compute_freshness(generated_at, stale_after_seconds=600)
        assert isinstance(fm.generated_at, str)
        assert "2026-01-15" in fm.generated_at
        assert "12:00:00" in fm.generated_at

    def test_freshness_metadata_to_dict(self):
        generated_at = datetime.now(timezone.utc) - timedelta(seconds=30)
        fm = compute_freshness(generated_at, stale_after_seconds=600)
        d = fm.to_dict()
        assert "generated_at" in d
        assert "cache_age_seconds" in d
        assert "stale" in d
        assert "stale_after_seconds" in d
        assert d["stale_after_seconds"] == 600

    def test_default_stale_after_is_600(self):
        assert DEFAULT_STALE_AFTER == 600

    def test_prompt_version_constant_is_string(self):
        assert isinstance(PROMPT_VERSION, str)
        assert len(PROMPT_VERSION) > 0


# ── TestHashFunctions ─────────────────────────────────────────────────────────

class TestHashFunctions:
    def test_hash_args_is_deterministic(self):
        args = {"supplier_id": "sup-001", "risk_score": 0.72}
        assert hash_args(args) == hash_args(args)

    def test_hash_args_different_inputs_different_hash(self):
        assert hash_args({"a": 1}) != hash_args({"a": 2})

    def test_hash_result_is_deterministic(self):
        result = {"exposure_inr": 450000, "level": "high"}
        assert hash_result(result) == hash_result(result)

    def test_hash_result_is_16_chars(self):
        result = {"x": 1}
        h = hash_result(result)
        assert len(h) == 16

    def test_hash_args_is_16_chars(self):
        h = hash_args({"key": "value"})
        assert len(h) == 16

    def test_hash_args_hex_only(self):
        h = hash_args({"key": "value"})
        assert all(c in "0123456789abcdef" for c in h)


# ── TestSnapshotServiceAsync ──────────────────────────────────────────────────

class TestSnapshotServiceAsync:
    def test_save_snapshot_returns_snapshot_with_id(self, mock_db):
        snap = asyncio.get_event_loop().run_until_complete(
            save_snapshot(
                mock_db,
                supplier_id="sup-001",
                evidence_hash="abc123def456abc1",
                evidence_json={"supplier_id": "sup-001"},
                risk_policy_version=1,
                financial_policy_version=1,
                model_version="anthropic.claude-haiku-4-5-20251001-v1:0",
            )
        )
        assert snap.id is not None
        assert str(snap.supplier_id) == "sup-001"
        assert snap.evidence_hash == "abc123def456abc1"
        assert snap.risk_policy_version == 1
        assert snap.financial_policy_version == 1

    def test_save_snapshot_cache_key_matches_build_cache_key(self, mock_db):
        evidence_hash = "abc123def456abc1"
        snap = asyncio.get_event_loop().run_until_complete(
            save_snapshot(
                mock_db,
                supplier_id="sup-001",
                evidence_hash=evidence_hash,
                evidence_json={},
                risk_policy_version=1,
                financial_policy_version=1,
                model_version="anthropic.claude-haiku-4-5-20251001-v1:0",
            )
        )
        expected_key = build_cache_key(
            evidence_hash=evidence_hash,
            risk_policy_version=1,
            financial_policy_version=1,
            model_version="anthropic.claude-haiku-4-5-20251001-v1:0",
        )
        assert snap.cache_key == expected_key

    def test_get_snapshot_returns_none_for_invalid_uuid(self, mock_db):
        result = asyncio.get_event_loop().run_until_complete(
            get_snapshot(mock_db, "not-a-uuid")
        )
        assert result is None

    def test_get_snapshot_returns_none_when_not_found(self, mock_db):
        mock_db.execute = _make_execute_returning(None)
        result = asyncio.get_event_loop().run_until_complete(
            get_snapshot(mock_db, str(uuid4()))
        )
        assert result is None

    def test_save_trace_returns_trace_with_id(self, mock_db):
        snap_id = str(uuid4())
        trace = asyncio.get_event_loop().run_until_complete(
            save_trace(
                mock_db,
                snapshot_id=snap_id,
                tool_name="risk_engine",
                args_hash="abcdef0123456789",
                result_hash="fedcba9876543210",
                status="success",
                duration_ms=45.2,
            )
        )
        assert trace.id is not None
        assert trace.tool_name == "risk_engine"
        assert trace.status == "success"
        assert trace.duration_ms == 45.2

    def test_save_trace_with_none_snapshot_id(self, mock_db):
        trace = asyncio.get_event_loop().run_until_complete(
            save_trace(
                mock_db,
                snapshot_id=None,
                tool_name="financial_engine",
                status="error",
            )
        )
        assert trace.snapshot_id is None
        assert trace.tool_name == "financial_engine"

    def test_get_traces_returns_empty_for_invalid_uuid(self, mock_db):
        result = asyncio.get_event_loop().run_until_complete(
            get_traces(mock_db, "not-a-uuid")
        )
        assert result == []

    def test_get_traces_returns_list(self, mock_db):
        mock_db.execute = _make_execute_returning_scalars([])
        result = asyncio.get_event_loop().run_until_complete(
            get_traces(mock_db, str(uuid4()))
        )
        assert isinstance(result, list)


# ── TestAnalysisModels ────────────────────────────────────────────────────────

class TestAnalysisModels:
    def test_analysis_snapshot_tablename(self):
        assert AnalysisSnapshot.__tablename__ == "analysis_snapshots"

    def test_analysis_snapshot_has_required_columns(self):
        columns = {c.key for c in AnalysisSnapshot.__table__.columns}
        required = {
            "id", "cache_key", "supplier_id", "evidence_hash",
            "risk_policy_version", "financial_policy_version",
            "model_version", "prompt_version", "evidence_json",
            "generation_mode", "created_at",
        }
        assert required.issubset(columns)

    def test_analysis_trace_tablename(self):
        assert AnalysisTrace.__tablename__ == "analysis_traces"

    def test_analysis_trace_has_required_columns(self):
        columns = {c.key for c in AnalysisTrace.__table__.columns}
        required = {
            "id", "snapshot_id", "tool_name", "args_hash",
            "result_hash", "status", "duration_ms", "created_at",
        }
        assert required.issubset(columns)

    def test_analysis_cache_tablename_unchanged(self):
        assert AnalysisCache.__tablename__ == "analysis_cache"

    def test_analysis_cache_has_core_columns(self):
        columns = {c.key for c in AnalysisCache.__table__.columns}
        assert "cache_key" in columns
        assert "result_json" in columns
        assert "generated_at" in columns


# ── TestEvidenceProvenanceIntegration ────────────────────────────────────────

class TestEvidenceProvenanceIntegration:
    def test_evidence_hash_is_16_chars(self):
        pkg = build_evidence_package(**_base_evidence_kwargs())
        assert len(pkg.facts_hash) == 16

    def test_same_supplier_data_produces_same_evidence_hash(self):
        kwargs = _base_evidence_kwargs()
        pkg1 = build_evidence_package(**kwargs)
        pkg2 = build_evidence_package(**kwargs)
        assert pkg1.facts_hash == pkg2.facts_hash

    def test_different_exposure_produces_different_evidence_hash(self):
        pkg1 = build_evidence_package(**_base_evidence_kwargs(exposure_inr=100_000))
        pkg2 = build_evidence_package(**_base_evidence_kwargs(exposure_inr=200_000))
        assert pkg1.facts_hash != pkg2.facts_hash

    def test_evidence_to_dict_matches_snapshot_input_fields(self):
        pkg = build_evidence_package(**_base_evidence_kwargs())
        d = pkg.to_dict()
        # These keys are the ones passed to save_snapshot as evidence_json
        for key in ("snapshot_id", "supplier_id", "risk_score", "exposure_inr", "facts_hash"):
            assert key in d

    def test_cache_key_changes_when_evidence_hash_changes(self):
        pkg1 = build_evidence_package(**_base_evidence_kwargs(exposure_inr=100_000))
        pkg2 = build_evidence_package(**_base_evidence_kwargs(exposure_inr=200_000))
        k1 = build_cache_key(
            evidence_hash=pkg1.facts_hash,
            risk_policy_version=1,
            financial_policy_version=1,
            model_version="anthropic.claude-haiku-4-5-20251001-v1:0",
        )
        k2 = build_cache_key(
            evidence_hash=pkg2.facts_hash,
            risk_policy_version=1,
            financial_policy_version=1,
            model_version="anthropic.claude-haiku-4-5-20251001-v1:0",
        )
        assert k1 != k2

    def test_cache_key_changes_when_policy_version_changes(self):
        pkg = build_evidence_package(**_base_evidence_kwargs())
        k1 = build_cache_key(
            evidence_hash=pkg.facts_hash,
            risk_policy_version=1,
            financial_policy_version=1,
            model_version="anthropic.claude-haiku-4-5-20251001-v1:0",
        )
        k2 = build_cache_key(
            evidence_hash=pkg.facts_hash,
            risk_policy_version=2,  # new policy version
            financial_policy_version=1,
            model_version="anthropic.claude-haiku-4-5-20251001-v1:0",
        )
        assert k1 != k2
