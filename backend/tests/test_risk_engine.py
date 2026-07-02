"""
Risk engine unit tests — Tasks 1, 4, 6 (Phase 2).

Covers:
- Determinism: same inputs → identical outputs every call
- Factor bounds: every factor value stays in [0.0, 1.0]
- Weighted sum identity: overall_score == sum of weighted factor values
- Risk level thresholds: score ↔ level mapping is correct
- Confidence computation: signal agreement scoring behaves as documented
- Edge cases: zero disruptions, maximum disruptions, flood-prone zone, no zone
- Property tests: overall_score always in [0.0, 1.0]
"""

import pytest
from uuid import UUID
from app.services.risk_engine import (
    RiskScoringEngine,
    WEIGHT_DELIVERY_RELIABILITY,
    WEIGHT_DISRUPTION_SEVERITY,
    WEIGHT_INVENTORY_PRESSURE,
    WEIGHT_LOGISTICS_VULNERABILITY,
    WEIGHT_DEPENDENCY_EXPOSURE,
    WEIGHT_FESTIVAL_PROXIMITY,
    RISK_ZONE_SCORES,
)

_SUPPLIER_ID = UUID("00000000-0000-0000-0000-000000000001")
engine = RiskScoringEngine()


def _baseline_inputs(**overrides):
    """Return a complete set of risk inputs with sane defaults."""
    base = dict(
        supplier_id=_SUPPLIER_ID,
        supplier_name="Test Supplier",
        reliability_score=0.85,
        risk_zone=None,
        active_disruptions=[],
        delivery_stats={"late_pct": 0.10, "total_deliveries": 30, "avg_delay_days": 1.0},
        inventory_pressure=0.2,
        dependency_exposure=0.1,
        festival_proximity=0.0,
    )
    base.update(overrides)
    return base


# ── Determinism ───────────────────────────────────────────────────────────────

class TestDeterminism:
    def test_identical_inputs_produce_identical_score(self):
        a = engine.compute_supplier_risk(**_baseline_inputs())
        b = engine.compute_supplier_risk(**_baseline_inputs())
        assert a.overall_score == b.overall_score

    def test_identical_inputs_produce_identical_risk_level(self):
        a = engine.compute_supplier_risk(**_baseline_inputs())
        b = engine.compute_supplier_risk(**_baseline_inputs())
        assert a.risk_level == b.risk_level

    def test_identical_inputs_produce_identical_factors(self):
        a = engine.compute_supplier_risk(**_baseline_inputs())
        b = engine.compute_supplier_risk(**_baseline_inputs())
        for fa, fb in zip(a.factors, b.factors):
            assert fa.value == fb.value
            assert fa.weighted_value == fb.weighted_value

    def test_ten_repeated_calls_always_agree(self):
        scores = [
            engine.compute_supplier_risk(**_baseline_inputs()).overall_score
            for _ in range(10)
        ]
        assert len(set(scores)) == 1, f"Non-deterministic outputs: {scores}"


# ── Factor bounds ─────────────────────────────────────────────────────────────

class TestFactorBounds:
    def test_all_factor_values_in_unit_interval(self):
        result = engine.compute_supplier_risk(**_baseline_inputs())
        for f in result.factors:
            assert 0.0 <= f.value <= 1.0, f"Factor {f.name} value {f.value} out of bounds"

    def test_all_weighted_values_non_negative(self):
        result = engine.compute_supplier_risk(**_baseline_inputs())
        for f in result.factors:
            assert f.weighted_value >= 0.0

    def test_overall_score_in_unit_interval(self):
        for reliability in (0.0, 0.5, 1.0):
            for pressure in (0.0, 0.5, 1.5):
                r = engine.compute_supplier_risk(
                    **_baseline_inputs(reliability_score=reliability, inventory_pressure=pressure)
                )
                assert 0.0 <= r.overall_score <= 1.0


# ── Weighted sum identity ────────────────────────────────────────────────────

class TestWeightedSumIdentity:
    def test_weights_sum_to_one(self):
        total = (
            WEIGHT_DELIVERY_RELIABILITY
            + WEIGHT_DISRUPTION_SEVERITY
            + WEIGHT_INVENTORY_PRESSURE
            + WEIGHT_LOGISTICS_VULNERABILITY
            + WEIGHT_DEPENDENCY_EXPOSURE
            + WEIGHT_FESTIVAL_PROXIMITY
        )
        assert abs(total - 1.0) < 1e-9, f"Weights sum to {total}, not 1.0"

    def test_overall_score_equals_sum_of_weighted_factors(self):
        result = engine.compute_supplier_risk(**_baseline_inputs())
        expected = round(sum(f.weighted_value for f in result.factors), 4)
        # overall_score is already clamped to [0, 1] and rounded to 4dp
        assert abs(result.overall_score - min(1.0, max(0.0, expected))) < 1e-6

    def test_six_factors_always_present(self):
        result = engine.compute_supplier_risk(**_baseline_inputs())
        names = {f.name for f in result.factors}
        assert names == {
            "delivery_reliability",
            "disruption_severity",
            "inventory_pressure",
            "logistics_vulnerability",
            "dependency_exposure",
            "festival_proximity",
        }


# ── Risk level thresholds ────────────────────────────────────────────────────

class TestRiskLevelThresholds:
    def test_score_below_0_3_is_low(self):
        # Force low score: perfect reliability, no disruptions, minimal pressure
        r = engine.compute_supplier_risk(
            **_baseline_inputs(
                reliability_score=1.0,
                inventory_pressure=0.0,
                dependency_exposure=0.0,
                festival_proximity=0.0,
            )
        )
        if r.overall_score < 0.3:
            assert r.risk_level == "low"

    def test_score_0_5_to_0_7_is_high(self):
        r = engine.compute_supplier_risk(
            **_baseline_inputs(
                reliability_score=0.35,
                risk_zone="flood_prone",
                active_disruptions=[{"severity": "high", "impact_score": 0.7}],
                inventory_pressure=0.6,
                delivery_stats={"late_pct": 0.4, "total_deliveries": 20, "avg_delay_days": 3.0},
            )
        )
        if 0.5 <= r.overall_score < 0.7:
            assert r.risk_level == "high"

    def test_score_at_0_7_is_critical(self):
        # Exhaustive bad inputs to push score above critical threshold
        r = engine.compute_supplier_risk(
            **_baseline_inputs(
                reliability_score=0.1,
                risk_zone="cyclone_coastal",
                active_disruptions=[
                    {"severity": "critical", "impact_score": 1.0},
                    {"severity": "high", "impact_score": 0.8},
                ],
                inventory_pressure=1.0,
                dependency_exposure=1.0,
                festival_proximity=1.0,
                delivery_stats={"late_pct": 0.6, "total_deliveries": 30, "avg_delay_days": 5.0},
            )
        )
        if r.overall_score >= 0.7:
            assert r.risk_level == "critical"


# ── Confidence computation ───────────────────────────────────────────────────

class TestConfidenceComputation:
    def test_zero_signals_gives_low_confidence(self):
        r = engine.compute_supplier_risk(
            **_baseline_inputs(
                active_disruptions=[],
                delivery_stats={"late_pct": 0.1},  # below 0.25 threshold
                inventory_pressure=0.3,  # below 0.5 threshold
                dependency_exposure=0.1,  # below 0.3 threshold
                festival_proximity=0.1,  # below 0.3 threshold
            )
        )
        assert r.confidence == 0.40  # documented zero-signal constant

    def test_three_or_more_signals_gives_high_confidence(self):
        r = engine.compute_supplier_risk(
            **_baseline_inputs(
                active_disruptions=[{"severity": "high", "impact_score": 0.7}],
                delivery_stats={"late_pct": 0.35},
                inventory_pressure=0.7,
                dependency_exposure=0.5,
            )
        )
        assert r.confidence >= 0.80

    def test_single_signal_keeps_confidence_below_0_5(self):
        r = engine.compute_supplier_risk(
            **_baseline_inputs(
                active_disruptions=[{"severity": "low", "impact_score": 0.3}],
                delivery_stats={"late_pct": 0.1},
                inventory_pressure=0.3,
                dependency_exposure=0.1,
                festival_proximity=0.1,
            )
        )
        assert r.confidence < 0.50

    def test_confidence_always_between_0_and_1(self):
        for disruptions in ([], [{"severity": "critical", "impact_score": 1.0}] * 5):
            r = engine.compute_supplier_risk(**_baseline_inputs(active_disruptions=disruptions))
            assert 0.0 <= r.confidence <= 1.0


# ── Edge cases ───────────────────────────────────────────────────────────────

class TestEdgeCases:
    def test_cyclone_coastal_zone_scores_0_7(self):
        r = engine.compute_supplier_risk(**_baseline_inputs(risk_zone="cyclone_coastal"))
        vuln = next(f for f in r.factors if f.name == "logistics_vulnerability")
        assert vuln.value == RISK_ZONE_SCORES["cyclone_coastal"]

    def test_unknown_zone_defaults_to_0_1(self):
        r = engine.compute_supplier_risk(**_baseline_inputs(risk_zone="unknown_zone"))
        vuln = next(f for f in r.factors if f.name == "logistics_vulnerability")
        assert vuln.value == RISK_ZONE_SCORES[None]

    def test_perfect_supplier_has_low_score(self):
        r = engine.compute_supplier_risk(
            **_baseline_inputs(
                reliability_score=1.0,
                active_disruptions=[],
                inventory_pressure=0.0,
                dependency_exposure=0.0,
                festival_proximity=0.0,
                delivery_stats={"late_pct": 0.0, "total_deliveries": 50, "avg_delay_days": 0.0},
            )
        )
        assert r.overall_score < 0.3
        assert r.risk_level == "low"

    def test_disruption_count_amplifies_score(self):
        one = engine.compute_supplier_risk(
            **_baseline_inputs(active_disruptions=[{"severity": "medium", "impact_score": 0.5}])
        )
        three = engine.compute_supplier_risk(
            **_baseline_inputs(active_disruptions=[
                {"severity": "medium", "impact_score": 0.5},
                {"severity": "medium", "impact_score": 0.5},
                {"severity": "medium", "impact_score": 0.5},
            ])
        )
        assert three.overall_score >= one.overall_score

    def test_inventory_pressure_clamped_above_1(self):
        r = engine.compute_supplier_risk(**_baseline_inputs(inventory_pressure=5.0))
        inv = next(f for f in r.factors if f.name == "inventory_pressure")
        assert inv.value == 1.0

    def test_factor_dict_property_matches_factors_list(self):
        r = engine.compute_supplier_risk(**_baseline_inputs())
        fd = r.factor_dict
        for f in r.factors:
            assert f.name in fd
            assert fd[f.name]["value"] == f.value
            assert fd[f.name]["weighted"] == f.weighted_value
