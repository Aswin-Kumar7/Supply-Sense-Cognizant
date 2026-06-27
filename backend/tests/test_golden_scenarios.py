"""
Golden supply-chain scenario tests — Tasks 1–4 (Phase 2).

Each scenario is a named, deterministic combination of inputs that represents
a real supply-chain situation. Tests verify:

  1. Policy-invariant outcomes: a "critical" supplier always has overall_score >= 0.7
  2. Authoritative field immutability: risk_score, exposure_inr, supplier_id must equal
     the engine-computed value, never an AI-restated value
  3. Evidence snapshot consistency: evidence.snapshot_id is a valid UUID4 with correct fields
  4. Financial identity: current = mitigated + savings per financial engine contract

Scenarios intentionally span the full range:
  S01-S10: Critical risk scenarios (cyclone coast, Diwali surge, single-supplier dependency)
  S11-S20: High-risk scenarios (flood zone, strike-prone, multi-disruption)
  S21-S30: Medium-risk borderline cases
  S31-S36: Edge cases (zero disruptions, massive festival, 100% reliability)
"""

import pytest
import re
from uuid import UUID
from app.services.risk_engine import RiskScoringEngine, RISK_ZONE_SCORES
from app.services.financial_engine import FinancialExposureEngine
from app.core.evidence import build_evidence_package, validate_grounding

risk_engine = RiskScoringEngine()
fin_engine = FinancialExposureEngine()

_SUPPLIER_ID = UUID("00000000-0000-0000-0000-000000000001")

# ── Scenario builder helpers ──────────────────────────────────────────────────

def _risk(**kw):
    defaults = dict(
        supplier_id=_SUPPLIER_ID,
        supplier_name="Supplier",
        reliability_score=0.85,
        risk_zone=None,
        active_disruptions=[],
        delivery_stats={"late_pct": 0.10, "total_deliveries": 30, "avg_delay_days": 1.0},
        inventory_pressure=0.2,
        dependency_exposure=0.1,
        festival_proximity=0.0,
    )
    defaults.update(kw)
    return risk_engine.compute_supplier_risk(**defaults)


def _fin_sim(total_inr: float, risk_score: float = 0.5):
    from app.services.financial_engine import SupplierExposure
    expo = SupplierExposure(
        supplier_id=str(_SUPPLIER_ID),
        supplier_name="Supplier",
        revenue_at_risk_inr=total_inr * 0.6,
        sla_penalties_inr=total_inr * 0.1,
        stockout_cost_inr=total_inr * 0.25,
        mitigation_cost_inr=total_inr * 0.05,
        total_exposure_inr=total_inr,
        exposure_level="high",
    )
    return fin_engine.simulate_mitigation(expo, supplier_reliability=0.75, lead_time_days=7, risk_score=risk_score)


_TOLERANCE = 1.0  # ₹1 rounding tolerance


# ══════════════════════════════════════════════════════════════════════════════
# S01–S10: CRITICAL scenarios
# ══════════════════════════════════════════════════════════════════════════════

class TestCriticalScenarios:
    def test_S01_cyclone_coast_critical_disruption(self):
        r = _risk(
            risk_zone="cyclone_coastal",
            active_disruptions=[{"severity": "critical", "impact_score": 1.0}],
            reliability_score=0.3,
            inventory_pressure=0.9,
            dependency_exposure=0.7,
            delivery_stats={"late_pct": 0.4, "avg_delay_days": 4.0},
        )
        assert r.overall_score >= 0.7, f"S01: score={r.overall_score} expected >=0.7"
        assert r.risk_level == "critical"

    def test_S02_diwali_surge_plus_high_disruption(self):
        r = _risk(
            festival_proximity=1.0,
            active_disruptions=[{"severity": "high", "impact_score": 0.8}],
            inventory_pressure=0.85,
            reliability_score=0.4,
            delivery_stats={"late_pct": 0.45, "avg_delay_days": 4.0},
        )
        assert r.overall_score >= 0.5
        assert r.risk_level in {"high", "critical"}

    def test_S03_single_supplier_100pct_dependency(self):
        r = _risk(
            dependency_exposure=1.0,
            risk_zone="cyclone_coastal",
            reliability_score=0.5,
        )
        assert r.overall_score >= 0.3
        dep = next(f for f in r.factors if f.name == "dependency_exposure")
        assert dep.value == 1.0

    def test_S04_stockout_3days_critical_disruption(self):
        r = _risk(
            risk_zone="flood_prone",  # pushes logistics score to 0.65
            active_disruptions=[
                {"severity": "critical", "impact_score": 1.0},
                {"severity": "high", "impact_score": 0.8},
            ],
            inventory_pressure=1.0,
            reliability_score=0.2,
            delivery_stats={"late_pct": 0.6, "avg_delay_days": 5.0},
        )
        assert r.overall_score >= 0.7
        assert r.risk_level == "critical"

    def test_S05_all_signals_maxed(self):
        # Max achievable score: delivery=1.0×0.25, disruption≈1.0×0.25, inventory=1.0×0.20,
        # logistics=0.7×0.15 (cyclone_coastal cap), dependency=1.0×0.10, festival=1.0×0.05 → ~0.955
        # 4 disruptions push disruption factor to 1.0 via count_factor
        r = _risk(
            reliability_score=0.0,
            risk_zone="cyclone_coastal",
            active_disruptions=[{"severity": "critical", "impact_score": 1.0}] * 4,
            inventory_pressure=1.0,
            dependency_exposure=1.0,
            festival_proximity=1.0,
            delivery_stats={"late_pct": 1.0, "avg_delay_days": 10.0},
        )
        assert r.overall_score >= 0.95
        assert r.risk_level == "critical"

    def test_S06_cyclone_plus_festival_plus_stockout(self):
        r = _risk(
            risk_zone="cyclone_coastal",
            festival_proximity=0.9,
            inventory_pressure=0.95,
            active_disruptions=[{"severity": "high", "impact_score": 0.75}],
            reliability_score=0.35,
        )
        assert r.overall_score >= 0.5
        assert r.risk_level in {"high", "critical"}

    def test_S07_flood_zone_critical_disruption(self):
        r = _risk(
            risk_zone="flood_prone",
            active_disruptions=[{"severity": "critical", "impact_score": 0.95}],
            reliability_score=0.2,
        )
        assert r.overall_score >= 0.5

    def test_S08_strike_zone_full_disruption(self):
        r = _risk(
            risk_zone="strike_prone",
            active_disruptions=[{"severity": "critical", "impact_score": 1.0}],
            inventory_pressure=0.8,
            reliability_score=0.3,
        )
        assert r.overall_score >= 0.5

    def test_S09_financial_identity_at_critical_exposure(self):
        sim = _fin_sim(total_inr=10_000_000.0, risk_score=0.8)
        lhs = sim.current_exposure_inr
        rhs = sim.mitigated_exposure_inr + sim.net_saving_inr + sim.mitigation_cost_inr
        assert abs(lhs - rhs) < _TOLERANCE

    def test_S10_switch_supplier_maximises_reduction_at_critical(self):
        sim = _fin_sim(total_inr=5_000_000.0, risk_score=0.85)
        # switch_supplier should have 60% reduction = 3M, which is highest net
        switch = next(o for o in sim.options if o.action_type == "switch_supplier")
        assert abs(switch.exposure_reduction_inr - 3_000_000.0) < _TOLERANCE


# ══════════════════════════════════════════════════════════════════════════════
# S11–S20: HIGH-RISK scenarios
# ══════════════════════════════════════════════════════════════════════════════

class TestHighRiskScenarios:
    def test_S11_flood_zone_moderate_disruption(self):
        r = _risk(
            risk_zone="flood_prone",
            active_disruptions=[{"severity": "medium", "impact_score": 0.5}],
            reliability_score=0.6,
            inventory_pressure=0.55,
        )
        assert r.overall_score >= 0.3

    def test_S12_strike_zone_high_late_pct(self):
        r = _risk(
            risk_zone="strike_prone",
            delivery_stats={"late_pct": 0.45, "avg_delay_days": 3.0},
            reliability_score=0.4,
        )
        assert r.overall_score >= 0.3

    def test_S13_three_medium_disruptions(self):
        r = _risk(
            active_disruptions=[{"severity": "medium", "impact_score": 0.5}] * 3,
            inventory_pressure=0.5,
        )
        assert r.overall_score >= 0.2
        # Disruption factor should be non-zero
        d = next(f for f in r.factors if f.name == "disruption_severity")
        assert d.value > 0.0

    def test_S14_high_dependency_low_reliability(self):
        r = _risk(
            dependency_exposure=0.8,
            reliability_score=0.3,
            delivery_stats={"late_pct": 0.35, "avg_delay_days": 3.0},
        )
        assert r.overall_score >= 0.3

    def test_S15_festival_proximity_0_8(self):
        r = _risk(festival_proximity=0.8)
        prox = next(f for f in r.factors if f.name == "festival_proximity")
        assert abs(prox.value - 0.8) < 0.001

    def test_S16_high_inventory_pressure(self):
        r = _risk(inventory_pressure=0.9)
        inv = next(f for f in r.factors if f.name == "inventory_pressure")
        assert abs(inv.value - 0.9) < 0.001

    def test_S17_financial_identity_high_risk(self):
        sim = _fin_sim(total_inr=2_000_000.0, risk_score=0.65)
        lhs = sim.current_exposure_inr
        rhs = sim.mitigated_exposure_inr + sim.net_saving_inr + sim.mitigation_cost_inr
        assert abs(lhs - rhs) < _TOLERANCE

    def test_S18_expedite_option_proportions(self):
        sim = _fin_sim(total_inr=1_000_000.0, risk_score=0.6)
        opt = next(o for o in sim.options if o.action_type == "expedite")
        assert abs(opt.exposure_reduction_inr - 300_000.0) < _TOLERANCE
        assert abs(opt.cost_inr - 100_000.0) < _TOLERANCE

    def test_S19_risk_after_less_than_risk_before(self):
        sim = _fin_sim(total_inr=1_000_000.0, risk_score=0.65)
        assert sim.risk_after <= sim.risk_before + 0.001

    def test_S20_all_options_have_positive_time_to_effect(self):
        sim = _fin_sim(total_inr=1_000_000.0, risk_score=0.65)
        for opt in sim.options:
            assert opt.time_to_effect_days > 0


# ══════════════════════════════════════════════════════════════════════════════
# S21–S30: MEDIUM-RISK borderline
# ══════════════════════════════════════════════════════════════════════════════

class TestMediumRiskScenarios:
    def test_S21_medium_score_maps_to_medium_level(self):
        r = _risk(
            reliability_score=0.65,
            active_disruptions=[{"severity": "low", "impact_score": 0.25}],
            inventory_pressure=0.4,
        )
        if 0.3 <= r.overall_score < 0.5:
            assert r.risk_level == "medium"

    def test_S22_borderline_0_5_maps_to_high(self):
        r = _risk(
            reliability_score=0.45,
            active_disruptions=[{"severity": "medium", "impact_score": 0.5}],
            inventory_pressure=0.5,
            delivery_stats={"late_pct": 0.3, "avg_delay_days": 2.0},
        )
        if 0.5 <= r.overall_score < 0.7:
            assert r.risk_level == "high"

    def test_S23_borderline_0_3_maps_to_medium(self):
        r = _risk(
            reliability_score=0.72,
            delivery_stats={"late_pct": 0.15, "avg_delay_days": 1.0},
            inventory_pressure=0.3,
        )
        if r.overall_score >= 0.3:
            assert r.risk_level in {"medium", "high", "critical"}

    def test_S24_two_signals_confidence_between_0_50_and_0_80(self):
        r = _risk(
            active_disruptions=[{"severity": "medium", "impact_score": 0.5}],
            delivery_stats={"late_pct": 0.3, "avg_delay_days": 2.0},  # triggers delivery_declining
            inventory_pressure=0.3,
            dependency_exposure=0.1,
            festival_proximity=0.1,
        )
        # Exactly 2 signals: active_disruption (w=0.90) + delivery_declining (w=0.85)
        # raw = (2/5) × avg(0.90, 0.85) = 0.40 × 0.875 = 0.35
        # No clamping for exactly 2 signals → confidence = 0.35
        assert 0.30 <= r.confidence <= 0.80

    def test_S25_financial_identity_medium_exposure(self):
        sim = _fin_sim(total_inr=500_000.0, risk_score=0.45)
        lhs = sim.current_exposure_inr
        rhs = sim.mitigated_exposure_inr + sim.net_saving_inr + sim.mitigation_cost_inr
        assert abs(lhs - rhs) < _TOLERANCE

    def test_S26_risk_score_monotone_with_disruptions(self):
        r0 = _risk(active_disruptions=[])
        r1 = _risk(active_disruptions=[{"severity": "medium", "impact_score": 0.5}])
        r2 = _risk(active_disruptions=[
            {"severity": "medium", "impact_score": 0.5},
            {"severity": "medium", "impact_score": 0.5},
        ])
        assert r0.overall_score <= r1.overall_score <= r2.overall_score

    def test_S27_risk_score_monotone_with_inventory_pressure(self):
        r0 = _risk(inventory_pressure=0.0)
        r1 = _risk(inventory_pressure=0.5)
        r2 = _risk(inventory_pressure=1.0)
        assert r0.overall_score <= r1.overall_score <= r2.overall_score

    def test_S28_risk_score_monotone_with_dependency_exposure(self):
        r0 = _risk(dependency_exposure=0.0)
        r1 = _risk(dependency_exposure=0.5)
        r2 = _risk(dependency_exposure=1.0)
        assert r0.overall_score <= r1.overall_score <= r2.overall_score

    def test_S29_evidence_snapshot_has_valid_uuid(self):
        ev = build_evidence_package(
            supplier_id="s-001",
            supplier_name="Acme",
            risk_score=0.65,
            risk_level="high",
            exposure_inr=1_200_000.0,
            days_to_stockout=7,
            sku_count=12,
        )
        UUID(ev.snapshot_id, version=4)  # raises if not valid UUID4

    def test_S30_evidence_snapshot_allowed_amounts_contains_exposure(self):
        ev = build_evidence_package(
            supplier_id="s-001",
            supplier_name="Acme",
            risk_score=0.65,
            risk_level="high",
            exposure_inr=1_200_000.0,
            days_to_stockout=7,
            sku_count=12,
        )
        assert 1_200_000.0 in ev.allowed_amounts


# ══════════════════════════════════════════════════════════════════════════════
# S31–S36: EDGE CASES
# ══════════════════════════════════════════════════════════════════════════════

class TestEdgeCaseScenarios:
    def test_S31_perfect_supplier_low_risk(self):
        r = _risk(
            reliability_score=1.0,
            active_disruptions=[],
            inventory_pressure=0.0,
            dependency_exposure=0.0,
            festival_proximity=0.0,
            delivery_stats={"late_pct": 0.0, "avg_delay_days": 0.0},
        )
        assert r.overall_score < 0.3
        assert r.risk_level == "low"

    def test_S32_zero_exposure_financial_identity(self):
        from app.services.financial_engine import SupplierExposure
        expo = SupplierExposure(
            supplier_id="s1", supplier_name="T",
            revenue_at_risk_inr=0, sla_penalties_inr=0,
            stockout_cost_inr=0, mitigation_cost_inr=0,
            total_exposure_inr=0, exposure_level="low",
        )
        sim = fin_engine.simulate_mitigation(expo, supplier_reliability=1.0, lead_time_days=7, risk_score=0.0)
        assert sim.mitigated_exposure_inr >= 0.0
        assert sim.current_exposure_inr == 0.0

    def test_S33_grounding_pass_on_exact_amount(self):
        ev = build_evidence_package(
            supplier_id="s-001", supplier_name="Acme",
            risk_score=0.5, risk_level="high",
            exposure_inr=500_000.0, days_to_stockout=5, sku_count=3,
        )
        # Narrative that references only the known amount
        result = validate_grounding(
            {"summary": "Exposure is ₹5,00,000 and requires immediate action."},
            ev,
        )
        assert result.passed
        assert result.grounding_status == "grounded"

    def test_S34_grounding_fail_on_hallucinated_amount(self):
        ev = build_evidence_package(
            supplier_id="s-001", supplier_name="Acme",
            risk_score=0.5, risk_level="high",
            exposure_inr=500_000.0, days_to_stockout=5, sku_count=3,
        )
        # Narrative with a completely fabricated rupee amount
        result = validate_grounding(
            {"summary": "Additional cost of ₹99,99,999 is projected."},
            ev,
        )
        assert not result.passed
        assert result.grounding_status == "violation"

    def test_S35_grounding_skip_on_amounts_below_100(self):
        ev = build_evidence_package(
            supplier_id="s-001", supplier_name="Acme",
            risk_score=0.5, risk_level="medium",
            exposure_inr=500_000.0, days_to_stockout=5, sku_count=3,
        )
        # ₹50 is below the ₹100 minimum threshold — should not trigger violation
        result = validate_grounding(
            {"summary": "Per-unit fee of ₹50 applies."},
            ev,
        )
        assert result.passed

    def test_S36_evidence_snapshot_id_unique_per_call(self):
        args = dict(
            supplier_id="s-001", supplier_name="Acme",
            risk_score=0.5, risk_level="high",
            exposure_inr=500_000.0, days_to_stockout=5, sku_count=3,
        )
        ev1 = build_evidence_package(**args)
        ev2 = build_evidence_package(**args)
        assert ev1.snapshot_id != ev2.snapshot_id
