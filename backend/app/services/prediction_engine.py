"""
Probabilistic disruption prediction engine.

HONESTY CONTRACT
----------------
All outputs from this engine are explicitly labeled:
  prediction_type:          "depletion_projection" — this is NOT a trained ML model.
  is_empirically_calibrated: False — no historical backtesting has calibrated the scores.
  methodology:              "sigmoid_of_risk_score" — honest about the method.
  calibration_status:       "not_calibrated" — no measured precision/recall yet.

The engine converts the deterministic risk score into a disruption probability
using a sigmoid transformation and produces a prediction interval.  This is an
honest heuristic, not a forecasting model.  The labeling requirement (S1-11,
S1-25) is enforced at the data layer, not as a comment.

Usage:
    from app.services.prediction_engine import PredictionEngine
    engine = PredictionEngine()
    result = engine.predict_disruption(risk_score=0.72, signal_count=3)
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Optional


# ── Constants ─────────────────────────────────────────────────────────────────

# Sigmoid steepness — higher = sharper transition around the midpoint.
_SIGMOID_K = 8.0
# Midpoint of the sigmoid (risk score at which P ≈ 0.5).
_SIGMOID_MIDPOINT = 0.5
# Half-width of the 80% prediction interval at zero signals.
_BASE_INTERVAL_HALF_WIDTH = 0.20
# Minimum half-width (interval collapses to this with infinite signals).
_MIN_INTERVAL_HALF_WIDTH = 0.05
# Number of signals at which the interval reaches half its base width.
_SIGNAL_DECAY_RATE = 4


def _sigmoid(x: float, k: float = _SIGMOID_K, midpoint: float = _SIGMOID_MIDPOINT) -> float:
    """Logistic sigmoid mapping any real input to (0, 1)."""
    return 1.0 / (1.0 + math.exp(-k * (x - midpoint)))


def _interval_half_width(signal_count: int) -> float:
    """
    Prediction interval half-width shrinks as signal count grows.
    At zero signals: _BASE_INTERVAL_HALF_WIDTH.
    At infinity signals: _MIN_INTERVAL_HALF_WIDTH.
    """
    decay = _BASE_INTERVAL_HALF_WIDTH - _MIN_INTERVAL_HALF_WIDTH
    width = _MIN_INTERVAL_HALF_WIDTH + decay / (1 + signal_count / _SIGNAL_DECAY_RATE)
    return round(width, 4)


@dataclass
class DisruptionPrediction:
    """
    Prediction of disruption probability for one supplier.

    All fields that could be mistaken for a trained model's output carry
    explicit honesty labels.  The prediction_type field MUST be checked by
    any consumer before presenting values as production forecasts.
    """
    supplier_id: str
    supplier_name: str
    # Point estimate: P(disruption within horizon_days)
    disruption_probability: float
    # Nominal horizon for the prediction
    horizon_days: int
    # 80% prediction interval [lower, upper]
    prediction_interval: list   # [lower: float, upper: float]
    # Evidence strength (heuristic, not calibrated confidence)
    evidence_strength: float
    signal_count: int
    # ── Honesty labels — must never be hidden or removed ──────────────────────
    prediction_type: str = "depletion_projection"
    is_empirically_calibrated: bool = False
    methodology: str = "sigmoid_of_risk_score"
    calibration_status: str = "not_calibrated"
    data_mode: str = "estimated"

    def to_dict(self) -> dict:
        return {
            "supplier_id": self.supplier_id,
            "supplier_name": self.supplier_name,
            "disruption_probability": self.disruption_probability,
            "horizon_days": self.horizon_days,
            "prediction_interval": self.prediction_interval,
            "evidence_strength": self.evidence_strength,
            "signal_count": self.signal_count,
            "prediction_type": self.prediction_type,
            "is_empirically_calibrated": self.is_empirically_calibrated,
            "methodology": self.methodology,
            "calibration_status": self.calibration_status,
            "data_mode": self.data_mode,
        }


class PredictionEngine:
    """
    Converts deterministic risk scores into probability estimates.

    This is a heuristic bridge, not a trained model.  It provides
    the structural skeleton needed for a future calibrated model:
    the interface, labeling, and interval plumbing are ready;
    the probability values are sigmoid-transformed heuristics until
    backtesting against historical outcomes is available.
    """

    def predict_disruption(
        self,
        risk_score: float,
        supplier_id: str = "",
        supplier_name: str = "",
        signal_count: int = 0,
        horizon_days: int = 14,
    ) -> DisruptionPrediction:
        """
        Predict disruption probability for a supplier.

        risk_score:   [0, 1] from the deterministic risk engine.
        signal_count: number of corroborating external signals ingested.
        horizon_days: forecast horizon (default 14-day early-warning window).
        """
        prob = round(_sigmoid(risk_score), 4)
        hw = _interval_half_width(signal_count)
        lower = round(max(0.0, prob - hw), 4)
        upper = round(min(1.0, prob + hw), 4)

        # Evidence strength is a heuristic combination of signal count and score magnitude.
        strength = round(min(1.0, (signal_count / 10.0) * 0.5 + abs(risk_score - 0.5) * 1.0), 4)

        return DisruptionPrediction(
            supplier_id=supplier_id,
            supplier_name=supplier_name,
            disruption_probability=prob,
            horizon_days=horizon_days,
            prediction_interval=[lower, upper],
            evidence_strength=strength,
            signal_count=signal_count,
        )

    def batch_predict(
        self,
        suppliers: list,
        horizon_days: int = 14,
    ) -> list:
        """
        Predict disruption probabilities for a list of supplier risk dicts.

        Each dict must have: supplier_id, supplier_name, overall_score.
        Optional: signal_count (defaults to 0 if absent).
        """
        return [
            self.predict_disruption(
                risk_score=s.get("overall_score", 0.0),
                supplier_id=s.get("supplier_id", ""),
                supplier_name=s.get("supplier_name", ""),
                signal_count=s.get("signal_count", 0),
                horizon_days=horizon_days,
            )
            for s in suppliers
        ]


prediction_engine = PredictionEngine()
