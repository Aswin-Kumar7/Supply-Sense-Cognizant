"""
Phase 6 — Prediction engine and backtesting tests.

Covers:
- DisruptionPrediction output bounds [0, 1]
- Sigmoid monotonicity (higher risk → higher probability)
- Prediction interval: lower < upper, both in [0, 1]
- Interval width shrinks with more signals
- All honesty labels present and correct
- evidence_strength in [0, 1]
- Batch prediction returns correct count
- BacktestResult metrics in [0, 1]
- True positive and false positive detection
- run_backtest with all-positive and all-negative scenarios
- data_mode and interpretation labels in backtest output
- ExternalSignal model attributes
- SIGNAL_TYPES and DATA_MODES are frozensets
- Deduplication key structure
"""
import math
import pytest

from app.services.prediction_engine import (
    PredictionEngine,
    DisruptionPrediction,
    _sigmoid,
    _interval_half_width,
    prediction_engine,
)
from app.services.backtesting import (
    LabeledScenario,
    BacktestResult,
    run_backtest,
    SYNTHETIC_EXERCISE_SCENARIOS,
)
from app.models.external_signal import ExternalSignal, SIGNAL_TYPES, DATA_MODES


# ── Helpers ───────────────────────────────────────────────────────────────────

def _engine() -> PredictionEngine:
    return PredictionEngine()


def _predict(risk_score: float, signal_count: int = 0) -> DisruptionPrediction:
    return _engine().predict_disruption(
        risk_score=risk_score,
        supplier_id="sup-001",
        supplier_name="Test Supplier",
        signal_count=signal_count,
        horizon_days=14,
    )


# ── TestSigmoidFunction ───────────────────────────────────────────────────────

class TestSigmoidFunction:
    def test_output_is_between_0_and_1(self):
        for x in [-2, -1, 0, 0.5, 1, 2]:
            assert 0.0 < _sigmoid(x) < 1.0

    def test_monotonically_increasing(self):
        scores = [0.0, 0.25, 0.5, 0.75, 1.0]
        probs = [_sigmoid(s) for s in scores]
        for i in range(len(probs) - 1):
            assert probs[i] < probs[i + 1]

    def test_midpoint_is_approximately_half(self):
        assert abs(_sigmoid(0.5) - 0.5) < 0.01

    def test_high_risk_gives_high_probability(self):
        assert _sigmoid(0.9) > 0.9

    def test_low_risk_gives_low_probability(self):
        assert _sigmoid(0.1) < 0.3


# ── TestIntervalHalfWidth ─────────────────────────────────────────────────────

class TestIntervalHalfWidth:
    def test_zero_signals_gives_max_width(self):
        w0 = _interval_half_width(0)
        w4 = _interval_half_width(4)
        assert w0 > w4

    def test_more_signals_give_narrower_interval(self):
        widths = [_interval_half_width(n) for n in [0, 2, 5, 10, 20]]
        for i in range(len(widths) - 1):
            assert widths[i] >= widths[i + 1]

    def test_width_is_positive(self):
        for n in [0, 1, 10, 100]:
            assert _interval_half_width(n) > 0


# ── TestPredictionOutputBounds ────────────────────────────────────────────────

class TestPredictionOutputBounds:
    def test_probability_is_between_0_and_1(self):
        for rs in [0.0, 0.3, 0.5, 0.7, 1.0]:
            pred = _predict(rs)
            assert 0.0 <= pred.disruption_probability <= 1.0

    def test_high_risk_gives_higher_probability_than_low_risk(self):
        low = _predict(0.1)
        high = _predict(0.9)
        assert high.disruption_probability > low.disruption_probability

    def test_prediction_interval_lower_lt_upper(self):
        pred = _predict(0.5)
        lower, upper = pred.prediction_interval
        assert lower < upper

    def test_prediction_interval_lower_gte_zero(self):
        pred = _predict(0.0)
        assert pred.prediction_interval[0] >= 0.0

    def test_prediction_interval_upper_lte_one(self):
        pred = _predict(1.0)
        assert pred.prediction_interval[1] <= 1.0

    def test_more_signals_narrower_interval(self):
        pred_0 = _predict(0.5, signal_count=0)
        pred_10 = _predict(0.5, signal_count=10)
        width_0 = pred_0.prediction_interval[1] - pred_0.prediction_interval[0]
        width_10 = pred_10.prediction_interval[1] - pred_10.prediction_interval[0]
        assert width_0 > width_10

    def test_evidence_strength_is_between_0_and_1(self):
        for rs in [0.0, 0.5, 1.0]:
            pred = _predict(rs, signal_count=5)
            assert 0.0 <= pred.evidence_strength <= 1.0


# ── TestHonestyLabels ─────────────────────────────────────────────────────────

class TestHonestyLabels:
    def test_prediction_type_is_depletion_projection(self):
        pred = _predict(0.7)
        assert pred.prediction_type == "depletion_projection"

    def test_is_empirically_calibrated_is_false(self):
        pred = _predict(0.7)
        assert pred.is_empirically_calibrated is False

    def test_methodology_is_sigmoid(self):
        pred = _predict(0.7)
        assert "sigmoid" in pred.methodology.lower()

    def test_calibration_status_is_not_calibrated(self):
        pred = _predict(0.7)
        assert pred.calibration_status == "not_calibrated"

    def test_data_mode_is_estimated(self):
        pred = _predict(0.7)
        assert pred.data_mode == "estimated"

    def test_to_dict_contains_all_honesty_labels(self):
        d = _predict(0.5).to_dict()
        assert d["prediction_type"] == "depletion_projection"
        assert d["is_empirically_calibrated"] is False
        assert d["methodology"] == "sigmoid_of_risk_score"
        assert d["calibration_status"] == "not_calibrated"
        assert d["data_mode"] == "estimated"

    def test_horizon_days_is_preserved(self):
        pred = _engine().predict_disruption(
            risk_score=0.5,
            horizon_days=30,
        )
        assert pred.horizon_days == 30


# ── TestBatchPredict ──────────────────────────────────────────────────────────

class TestBatchPredict:
    def test_returns_one_prediction_per_supplier(self):
        suppliers = [
            {"supplier_id": f"s-{i}", "supplier_name": f"S{i}", "overall_score": 0.5}
            for i in range(5)
        ]
        preds = _engine().batch_predict(suppliers)
        assert len(preds) == 5

    def test_missing_signal_count_defaults_to_zero(self):
        suppliers = [{"supplier_id": "s-1", "supplier_name": "S1", "overall_score": 0.5}]
        preds = _engine().batch_predict(suppliers)
        assert preds[0].signal_count == 0

    def test_empty_input_returns_empty_list(self):
        assert _engine().batch_predict([]) == []


# ── TestBacktesting ───────────────────────────────────────────────────────────

class TestBacktesting:
    def _all_positive_scenarios(self, n: int = 5) -> list:
        return [
            LabeledScenario(f"P{i}", f"s-{i}", f"S{i}", 0.9, 3, True, 7, "synthetic")
            for i in range(n)
        ]

    def _all_negative_scenarios(self, n: int = 5) -> list:
        return [
            LabeledScenario(f"N{i}", f"s-{i}", f"S{i}", 0.1, 0, False, None, "synthetic")
            for i in range(n)
        ]

    def test_precision_between_0_and_1(self):
        result = run_backtest(SYNTHETIC_EXERCISE_SCENARIOS, _engine(), threshold=0.5)
        if not math.isnan(result.precision):
            assert 0.0 <= result.precision <= 1.0

    def test_recall_between_0_and_1(self):
        result = run_backtest(SYNTHETIC_EXERCISE_SCENARIOS, _engine(), threshold=0.5)
        if not math.isnan(result.recall):
            assert 0.0 <= result.recall <= 1.0

    def test_f1_between_0_and_1(self):
        result = run_backtest(SYNTHETIC_EXERCISE_SCENARIOS, _engine(), threshold=0.5)
        if not math.isnan(result.f1_score):
            assert 0.0 <= result.f1_score <= 1.0

    def test_all_positive_scenarios_have_no_true_negatives(self):
        result = run_backtest(self._all_positive_scenarios(), _engine(), threshold=0.5)
        assert result.true_negatives == 0

    def test_all_negative_scenarios_have_no_true_positives(self):
        result = run_backtest(self._all_negative_scenarios(), _engine(), threshold=0.5)
        assert result.true_positives == 0

    def test_total_equals_sum_of_quadrants(self):
        result = run_backtest(SYNTHETIC_EXERCISE_SCENARIOS, _engine(), threshold=0.5)
        total = result.true_positives + result.false_positives + result.false_negatives + result.true_negatives
        assert total == result.total_scenarios

    def test_synthetic_data_mode_label(self):
        result = run_backtest(SYNTHETIC_EXERCISE_SCENARIOS, _engine(), threshold=0.5)
        assert result.data_mode == "synthetic"
        assert result.is_real_historical_data is False

    def test_synthetic_interpretation_label(self):
        result = run_backtest(SYNTHETIC_EXERCISE_SCENARIOS, _engine(), threshold=0.5)
        assert result.interpretation == "scenario_exercise"

    def test_avg_lead_time_is_positive_when_tp_present(self):
        result = run_backtest(SYNTHETIC_EXERCISE_SCENARIOS, _engine(), threshold=0.5)
        if result.true_positives > 0 and result.avg_lead_time_days is not None:
            assert result.avg_lead_time_days > 0

    def test_builtin_scenarios_have_ten_entries(self):
        assert len(SYNTHETIC_EXERCISE_SCENARIOS) == 10

    def test_lower_threshold_catches_more_positives(self):
        r_strict = run_backtest(SYNTHETIC_EXERCISE_SCENARIOS, _engine(), threshold=0.8)
        r_lax = run_backtest(SYNTHETIC_EXERCISE_SCENARIOS, _engine(), threshold=0.3)
        # More predictions with lower threshold
        strict_predicted = r_strict.true_positives + r_strict.false_positives
        lax_predicted = r_lax.true_positives + r_lax.false_positives
        assert lax_predicted >= strict_predicted


# ── TestExternalSignalModel ───────────────────────────────────────────────────

class TestExternalSignalModel:
    def test_tablename(self):
        assert ExternalSignal.__tablename__ == "external_signals"

    def test_required_columns_exist(self):
        cols = {c.key for c in ExternalSignal.__table__.columns}
        for col in (
            "id", "dedup_key", "source", "signal_type", "title",
            "credibility_score", "severity_estimate", "data_mode",
            "ingested_at", "is_processed",
        ):
            assert col in cols

    def test_signal_types_is_frozenset(self):
        assert isinstance(SIGNAL_TYPES, frozenset)

    def test_signal_types_contains_expected_types(self):
        for t in ("weather_disruption", "port_congestion", "supplier_financial_distress", "synthetic"):
            assert t in SIGNAL_TYPES

    def test_data_modes_is_frozenset(self):
        assert isinstance(DATA_MODES, frozenset)

    def test_data_modes_contains_expected_modes(self):
        for m in ("observed", "estimated", "synthetic", "forecast"):
            assert m in DATA_MODES

    def test_synthetic_is_a_valid_signal_type(self):
        assert "synthetic" in SIGNAL_TYPES
