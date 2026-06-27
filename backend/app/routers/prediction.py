"""
Prediction and signal ingestion endpoints.

All prediction responses carry explicit honesty labels:
  prediction_type:          "depletion_projection"
  is_empirically_calibrated: false
  methodology:              "sigmoid_of_risk_score"
  calibration_status:       "not_calibrated"

These labels must never be stripped by consumers before presenting to users.

GET  /prediction/supplier/{supplier_id}  — single-supplier disruption probability
GET  /prediction/portfolio               — ranked portfolio-level predictions
POST /prediction/backtest                — run exercise backtest (synthetic only)
POST /signals/ingest                     — ingest an external signal
GET  /signals                            — list recent signals
"""
from __future__ import annotations

import hashlib
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import require_auth, require_role
from app.core.database import get_db
from app.models.api_key import ApiKey
from app.models.external_signal import ExternalSignal, SIGNAL_TYPES, DATA_MODES
from app.services.prediction_engine import prediction_engine
from app.services.backtesting import run_backtest, SYNTHETIC_EXERCISE_SCENARIOS, LabeledScenario
from app.services.risk_intelligence import RiskIntelligenceService

router = APIRouter(tags=["Prediction & Signals"])

_PREDICTION_DISCLAIMER = (
    "Probabilities are heuristic estimates derived from a sigmoid transform of the "
    "deterministic risk score. They have NOT been calibrated against historical disruption "
    "outcomes. Do not present these values as measured model performance."
)


# ── Prediction endpoints ──────────────────────────────────────────────────────

@router.get("/prediction/supplier/{supplier_id}")
async def predict_supplier_disruption(
    supplier_id: str,
    horizon_days: int = Query(default=14, ge=1, le=90),
    db: AsyncSession = Depends(get_db),
):
    """
    Predict disruption probability for one supplier over the given horizon.

    Returns an 80% prediction interval and evidence strength alongside
    the point estimate. All honesty labels are embedded in the response.
    """
    svc = RiskIntelligenceService(db)
    try:
        risks = await svc.compute_all_supplier_risks()
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Risk engine unavailable: {exc}")

    try:
        uid = uuid.UUID(supplier_id)
    except ValueError:
        raise HTTPException(status_code=422, detail="Invalid supplier ID format")

    match = next((r for r in risks if r.get("supplier_id") == supplier_id), None)
    if match is None:
        raise HTTPException(status_code=404, detail="Supplier not found or has no risk data")

    # Count relevant external signals for this supplier
    signal_count = (await db.execute(
        select(ExternalSignal).where(
            ExternalSignal.is_processed == False,
        )
    )).scalars().all()
    supplier_signals = [
        s for s in signal_count
        if s.affected_supplier_ids and supplier_id in (s.affected_supplier_ids or [])
    ]

    prediction = prediction_engine.predict_disruption(
        risk_score=match["overall_score"],
        supplier_id=supplier_id,
        supplier_name=match.get("supplier_name", ""),
        signal_count=len(supplier_signals),
        horizon_days=horizon_days,
    )

    return {
        **prediction.to_dict(),
        "disclaimer": _PREDICTION_DISCLAIMER,
        "as_of": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/prediction/portfolio")
async def predict_portfolio(
    horizon_days: int = Query(default=14, ge=1, le=90),
    min_probability: float = Query(default=0.0, ge=0.0, le=1.0),
    db: AsyncSession = Depends(get_db),
):
    """
    Predict disruption probabilities for all suppliers, ranked highest first.

    Filter by min_probability to focus on elevated-risk suppliers.
    """
    svc = RiskIntelligenceService(db)
    try:
        risks = await svc.compute_all_supplier_risks()
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Risk engine unavailable: {exc}")

    predictions = prediction_engine.batch_predict(risks, horizon_days=horizon_days)
    ranked = sorted(predictions, key=lambda p: p.disruption_probability, reverse=True)
    filtered = [p.to_dict() for p in ranked if p.disruption_probability >= min_probability]

    return {
        "predictions": filtered,
        "total": len(filtered),
        "horizon_days": horizon_days,
        "disclaimer": _PREDICTION_DISCLAIMER,
        "as_of": datetime.now(timezone.utc).isoformat(),
        "prediction_type": "depletion_projection",
        "is_empirically_calibrated": False,
    }


class BacktestRequest(BaseModel):
    threshold: float = Field(default=0.5, ge=0.0, le=1.0)
    horizon_days: int = Field(default=14, ge=1, le=90)
    use_builtin_scenarios: bool = True


@router.post("/prediction/backtest")
async def run_prediction_backtest(body: BacktestRequest):
    """
    Run the synthetic exercise backtest against built-in labeled scenarios.

    Results are structural/integration tests only.  All outputs carry:
      data_mode: "synthetic"
      interpretation: "scenario_exercise"
      is_real_historical_data: false

    These results MUST NOT be quoted as production accuracy metrics.
    """
    if not body.use_builtin_scenarios:
        raise HTTPException(
            status_code=422,
            detail="Custom scenario upload not yet supported. Use use_builtin_scenarios=true.",
        )

    result = run_backtest(
        scenarios=SYNTHETIC_EXERCISE_SCENARIOS,
        engine=prediction_engine,
        threshold=body.threshold,
        horizon_days=body.horizon_days,
    )

    return {
        "threshold": body.threshold,
        "horizon_days": body.horizon_days,
        "total_scenarios": result.total_scenarios,
        "true_positives": result.true_positives,
        "false_positives": result.false_positives,
        "false_negatives": result.false_negatives,
        "true_negatives": result.true_negatives,
        "precision": result.precision if result.precision == result.precision else None,  # None if NaN
        "recall": result.recall if result.recall == result.recall else None,
        "f1_score": result.f1_score if result.f1_score == result.f1_score else None,
        "false_alert_rate": result.false_alert_rate if result.false_alert_rate == result.false_alert_rate else None,
        "avg_lead_time_days": result.avg_lead_time_days,
        "is_real_historical_data": result.is_real_historical_data,
        "data_mode": result.data_mode,
        "interpretation": result.interpretation,
        "disclaimer": (
            "These metrics are from synthetic exercise scenarios. "
            "They do NOT reflect measured performance on real historical data."
        ),
    }


# ── Signal ingestion endpoints ────────────────────────────────────────────────

class IngestSignalRequest(BaseModel):
    source: str
    signal_type: str
    title: str
    content: Optional[str] = None
    credibility_score: float = Field(default=0.5, ge=0.0, le=1.0)
    geography: Optional[str] = None
    severity_estimate: float = Field(default=0.5, ge=0.0, le=1.0)
    data_mode: str = "observed"
    affected_supplier_ids: Optional[list] = None
    observed_at: Optional[str] = None

    @field_validator("signal_type")
    @classmethod
    def validate_signal_type(cls, v: str) -> str:
        if v not in SIGNAL_TYPES:
            raise ValueError(f"signal_type must be one of {sorted(SIGNAL_TYPES)}")
        return v

    @field_validator("data_mode")
    @classmethod
    def validate_data_mode(cls, v: str) -> str:
        if v not in DATA_MODES:
            raise ValueError(f"data_mode must be one of {sorted(DATA_MODES)}")
        return v


@router.post("/signals/ingest", status_code=status.HTTP_201_CREATED)
async def ingest_signal(
    body: IngestSignalRequest,
    principal: ApiKey = Depends(require_role("analyst")),
    db: AsyncSession = Depends(get_db),
):
    """
    Ingest an external signal. Requires analyst role or higher.

    Duplicate signals (same source + content fingerprint) are silently skipped.
    The dedup_key ensures idempotent ingestion.
    """
    # Content-addressable deduplication key
    fingerprint = hashlib.sha256(
        f"{body.source}:{body.title}:{body.content or ''}".encode()
    ).hexdigest()[:32]
    dedup_key = f"{body.source}:{fingerprint}"

    # Check for duplicate
    existing = (await db.execute(
        select(ExternalSignal).where(ExternalSignal.dedup_key == dedup_key)
    )).scalar_one_or_none()
    if existing:
        return {
            "status": "duplicate_skipped",
            "signal_id": str(existing.id),
            "dedup_key": dedup_key,
        }

    observed_at = None
    if body.observed_at:
        try:
            observed_at = datetime.fromisoformat(body.observed_at.replace("Z", "+00:00"))
        except ValueError:
            pass

    signal = ExternalSignal(
        id=uuid.uuid4(),
        dedup_key=dedup_key,
        source=body.source,
        signal_type=body.signal_type,
        title=body.title,
        content=body.content,
        credibility_score=body.credibility_score,
        geography=body.geography,
        severity_estimate=body.severity_estimate,
        data_mode=body.data_mode,
        affected_supplier_ids=body.affected_supplier_ids,
        observed_at=observed_at,
        ingested_at=datetime.now(timezone.utc),
        is_processed=False,
    )
    db.add(signal)
    await db.commit()

    return {
        "status": "ingested",
        "signal_id": str(signal.id),
        "dedup_key": dedup_key,
    }


@router.get("/signals")
async def list_signals(
    source: Optional[str] = None,
    signal_type: Optional[str] = None,
    limit: int = Query(default=50, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
):
    """List recently ingested signals, optionally filtered by source or type."""
    query = select(ExternalSignal).order_by(ExternalSignal.ingested_at.desc()).limit(limit)
    if source:
        query = query.where(ExternalSignal.source == source)
    if signal_type:
        query = query.where(ExternalSignal.signal_type == signal_type)

    rows = (await db.execute(query)).scalars().all()
    return {
        "signals": [
            {
                "id": str(s.id),
                "source": s.source,
                "signal_type": s.signal_type,
                "title": s.title,
                "credibility_score": s.credibility_score,
                "severity_estimate": s.severity_estimate,
                "geography": s.geography,
                "data_mode": s.data_mode,
                "ingested_at": s.ingested_at.isoformat(),
            }
            for s in rows
        ],
        "total": len(rows),
    }
