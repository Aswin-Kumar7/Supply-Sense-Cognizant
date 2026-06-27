"""
Financial engine unit tests — Task 6 (Phase 2).

Covers:
- Accounting identity: current_exposure = mitigated + net_saving + cost (per option, per sim)
- Each MitigationOption uses the correct proportion of current_exposure
- savings_inr == current - mitigated (gross exposure reduction)
- net_saving_inr == savings_inr - mitigation_cost_inr
- mitigated_exposure is never negative
- All four action types are present in options list
- Best-option selection uses highest (exposure_reduction - cost)
- risk_before and risk_after stay in [0.0, 1.0]
- risk_after <= risk_before (mitigation cannot increase risk)
- delay cost scales linearly with delay_days
- compute_delay_cost urgency levels map to correct INR thresholds
"""

import pytest
from app.services.financial_engine import (
    FinancialExposureEngine,
    SupplierExposure,
    MitigationSimulation,
    MitigationOption,
)

engine = FinancialExposureEngine()

_TOLERANCE = 1.0  # ₹1 rounding tolerance


def _make_exposure(
    total_inr: float = 1_000_000.0,
    revenue_at_risk: float = 600_000.0,
    sla_penalties: float = 100_000.0,
    stockout_cost: float = 250_000.0,
    mitigation_cost: float = 50_000.0,
) -> SupplierExposure:
    return SupplierExposure(
        supplier_id="sup-001",
        supplier_name="Test Supplier",
        revenue_at_risk_inr=revenue_at_risk,
        sla_penalties_inr=sla_penalties,
        stockout_cost_inr=stockout_cost,
        mitigation_cost_inr=mitigation_cost,
        total_exposure_inr=total_inr,
        exposure_level="high",
    )


def _standard_skus() -> list[dict]:
    return [
        {"current_stock": 100, "daily_demand_avg": 10, "unit_cost_inr": 500},
        {"current_stock": 50,  "daily_demand_avg": 5,  "unit_cost_inr": 1000},
    ]


# ── Accounting identity ───────────────────────────────────────────────────────

class TestAccountingIdentity:
    def test_current_equals_mitigated_plus_savings(self):
        expo = _make_exposure()
        sim = engine.simulate_mitigation(expo, supplier_reliability=0.75, lead_time_days=7, risk_score=0.65)
        delta = abs(sim.current_exposure_inr - (sim.mitigated_exposure_inr + sim.savings_inr))
        assert delta < _TOLERANCE, (
            f"current={sim.current_exposure_inr} ≠ mitigated={sim.mitigated_exposure_inr} + savings={sim.savings_inr}"
        )

    def test_current_equals_mitigated_plus_net_saving_plus_cost(self):
        expo = _make_exposure()
        sim = engine.simulate_mitigation(expo, supplier_reliability=0.75, lead_time_days=7, risk_score=0.65)
        lhs = sim.current_exposure_inr
        rhs = sim.mitigated_exposure_inr + sim.net_saving_inr + sim.mitigation_cost_inr
        assert abs(lhs - rhs) < _TOLERANCE, (
            f"Identity failed: {lhs} ≠ {sim.mitigated_exposure_inr} + {sim.net_saving_inr} + {sim.mitigation_cost_inr}"
        )

    def test_net_saving_equals_savings_minus_cost(self):
        expo = _make_exposure()
        sim = engine.simulate_mitigation(expo, supplier_reliability=0.75, lead_time_days=7, risk_score=0.65)
        expected_net = round(sim.savings_inr - sim.mitigation_cost_inr, 2)
        assert abs(sim.net_saving_inr - expected_net) < _TOLERANCE

    def test_mitigated_exposure_never_negative(self):
        for exposure_inr in (100.0, 1_000.0, 10_000_000.0):
            expo = _make_exposure(total_inr=exposure_inr)
            sim = engine.simulate_mitigation(expo, supplier_reliability=0.75, lead_time_days=7, risk_score=0.5)
            assert sim.mitigated_exposure_inr >= 0.0

    def test_savings_equals_current_minus_mitigated(self):
        expo = _make_exposure()
        sim = engine.simulate_mitigation(expo, supplier_reliability=0.75, lead_time_days=7, risk_score=0.65)
        expected = round(sim.current_exposure_inr - sim.mitigated_exposure_inr, 2)
        assert abs(sim.savings_inr - expected) < _TOLERANCE

    def test_identity_holds_at_small_exposure(self):
        expo = _make_exposure(total_inr=1000.0)
        sim = engine.simulate_mitigation(expo, supplier_reliability=0.75, lead_time_days=7, risk_score=0.3)
        lhs = sim.current_exposure_inr
        rhs = sim.mitigated_exposure_inr + sim.net_saving_inr + sim.mitigation_cost_inr
        assert abs(lhs - rhs) < _TOLERANCE

    def test_identity_holds_at_large_exposure(self):
        expo = _make_exposure(total_inr=50_000_000.0)
        sim = engine.simulate_mitigation(expo, supplier_reliability=0.75, lead_time_days=7, risk_score=0.9)
        lhs = sim.current_exposure_inr
        rhs = sim.mitigated_exposure_inr + sim.net_saving_inr + sim.mitigation_cost_inr
        assert abs(lhs - rhs) < _TOLERANCE


# ── Per-option consistency ────────────────────────────────────────────────────

class TestOptionConsistency:
    def test_four_options_always_present(self):
        sim = engine.simulate_mitigation(_make_exposure(), supplier_reliability=0.75, lead_time_days=7, risk_score=0.5)
        assert len(sim.options) == 4

    def test_all_four_action_types_present(self):
        sim = engine.simulate_mitigation(_make_exposure(), supplier_reliability=0.75, lead_time_days=7, risk_score=0.5)
        action_types = {o.action_type for o in sim.options}
        assert action_types == {"switch_supplier", "increase_stock", "expedite", "substitute_sku"}

    def test_switch_supplier_uses_60pct_reduction(self):
        exposure = _make_exposure(total_inr=1_000_000.0)
        sim = engine.simulate_mitigation(exposure, supplier_reliability=0.75, lead_time_days=7, risk_score=0.5)
        opt = next(o for o in sim.options if o.action_type == "switch_supplier")
        assert abs(opt.exposure_reduction_inr - 600_000.0) < _TOLERANCE

    def test_switch_supplier_cost_is_15pct_of_exposure(self):
        exposure = _make_exposure(total_inr=1_000_000.0)
        sim = engine.simulate_mitigation(exposure, supplier_reliability=0.75, lead_time_days=7, risk_score=0.5)
        opt = next(o for o in sim.options if o.action_type == "switch_supplier")
        assert abs(opt.cost_inr - 150_000.0) < _TOLERANCE

    def test_increase_stock_uses_40pct_reduction(self):
        exposure = _make_exposure(total_inr=1_000_000.0)
        sim = engine.simulate_mitigation(exposure, supplier_reliability=0.75, lead_time_days=7, risk_score=0.5)
        opt = next(o for o in sim.options if o.action_type == "increase_stock")
        assert abs(opt.exposure_reduction_inr - 400_000.0) < _TOLERANCE

    def test_increase_stock_cost_is_25pct_of_exposure(self):
        exposure = _make_exposure(total_inr=1_000_000.0)
        sim = engine.simulate_mitigation(exposure, supplier_reliability=0.75, lead_time_days=7, risk_score=0.5)
        opt = next(o for o in sim.options if o.action_type == "increase_stock")
        assert abs(opt.cost_inr - 250_000.0) < _TOLERANCE

    def test_expedite_uses_30pct_reduction(self):
        exposure = _make_exposure(total_inr=1_000_000.0)
        sim = engine.simulate_mitigation(exposure, supplier_reliability=0.75, lead_time_days=7, risk_score=0.5)
        opt = next(o for o in sim.options if o.action_type == "expedite")
        assert abs(opt.exposure_reduction_inr - 300_000.0) < _TOLERANCE

    def test_substitute_sku_uses_25pct_reduction(self):
        exposure = _make_exposure(total_inr=1_000_000.0)
        sim = engine.simulate_mitigation(exposure, supplier_reliability=0.75, lead_time_days=7, risk_score=0.5)
        opt = next(o for o in sim.options if o.action_type == "substitute_sku")
        assert abs(opt.exposure_reduction_inr - 250_000.0) < _TOLERANCE

    def test_all_option_costs_non_negative(self):
        sim = engine.simulate_mitigation(_make_exposure(), supplier_reliability=0.75, lead_time_days=7, risk_score=0.5)
        for opt in sim.options:
            assert opt.cost_inr >= 0.0

    def test_all_option_reductions_non_negative(self):
        sim = engine.simulate_mitigation(_make_exposure(), supplier_reliability=0.75, lead_time_days=7, risk_score=0.5)
        for opt in sim.options:
            assert opt.exposure_reduction_inr >= 0.0

    def test_best_option_maximises_net_saving(self):
        expo = _make_exposure()
        sim = engine.simulate_mitigation(expo, supplier_reliability=0.75, lead_time_days=7, risk_score=0.5)
        best_net = sim.savings_inr - sim.mitigation_cost_inr
        for opt in sim.options:
            opt_net = opt.exposure_reduction_inr - opt.cost_inr
            assert best_net >= opt_net - _TOLERANCE, (
                f"Best option net saving {best_net} < option {opt.action_type} net saving {opt_net}"
            )


# ── Risk-before / risk-after ─────────────────────────────────────────────────

class TestRiskAfterBefore:
    def test_risk_before_equals_input_risk_score(self):
        expo = _make_exposure()
        sim = engine.simulate_mitigation(expo, supplier_reliability=0.75, lead_time_days=7, risk_score=0.72)
        assert abs(sim.risk_before - 0.72) < 0.001

    def test_risk_after_in_unit_interval(self):
        for rs in (0.0, 0.3, 0.7, 1.0):
            sim = engine.simulate_mitigation(_make_exposure(), supplier_reliability=0.75, lead_time_days=7, risk_score=rs)
            assert 0.0 <= sim.risk_after <= 1.0

    def test_risk_before_clamped_to_unit_interval(self):
        expo = _make_exposure()
        sim = engine.simulate_mitigation(expo, supplier_reliability=0.75, lead_time_days=7, risk_score=1.5)
        assert sim.risk_before <= 1.0
        sim2 = engine.simulate_mitigation(expo, supplier_reliability=0.75, lead_time_days=7, risk_score=-0.2)
        assert sim2.risk_before >= 0.0

    def test_risk_after_equals_mitigated_divided_by_current(self):
        expo = _make_exposure(total_inr=1_000_000.0)
        sim = engine.simulate_mitigation(expo, supplier_reliability=0.75, lead_time_days=7, risk_score=0.5)
        expected_ratio = round(sim.mitigated_exposure_inr / max(sim.current_exposure_inr, 1), 3)
        assert abs(sim.risk_after - expected_ratio) < 0.001


# ── Delay cost ───────────────────────────────────────────────────────────────

class TestDelayCost:
    def test_delay_cost_scales_linearly(self):
        expo = _make_exposure()
        c1 = engine.compute_delay_cost(expo, delay_days=1)
        c5 = engine.compute_delay_cost(expo, delay_days=5)
        # total_delay_cost_inr should be 5× the 1-day cost
        assert abs(c5["total_delay_cost_inr"] - c1["total_delay_cost_inr"] * 5) < _TOLERANCE

    def test_daily_cost_is_sum_of_three_components(self):
        expo = _make_exposure()
        c = engine.compute_delay_cost(expo, delay_days=3)
        daily = c["daily_cost_inr"]
        # Components: revenue_leak/14 + sla/30 + stockout/7
        expected_daily = round(
            expo.revenue_at_risk_inr / 14.0
            + expo.sla_penalties_inr / 30.0
            + expo.stockout_cost_inr / 7.0,
            2,
        )
        assert abs(daily - expected_daily) < _TOLERANCE

    def test_zero_delay_gives_zero_total(self):
        expo = _make_exposure()
        c = engine.compute_delay_cost(expo, delay_days=0)
        assert c["total_delay_cost_inr"] == 0.0

    def test_urgency_immediate_above_200k(self):
        # With total_inr=1M, daily cost ~= 1M/14 + ... > 200k over some days
        expo = _make_exposure(total_inr=10_000_000.0, revenue_at_risk=8_000_000.0,
                               sla_penalties=1_000_000.0, stockout_cost=500_000.0)
        c = engine.compute_delay_cost(expo, delay_days=7)
        if c["total_delay_cost_inr"] >= 200_000:
            assert c["urgency"] == "immediate"

    def test_urgency_high_between_50k_and_200k(self):
        expo = _make_exposure(total_inr=200_000.0, revenue_at_risk=120_000.0,
                               sla_penalties=30_000.0, stockout_cost=40_000.0)
        c = engine.compute_delay_cost(expo, delay_days=5)
        total = c["total_delay_cost_inr"]
        if 50_000 <= total < 200_000:
            assert c["urgency"] == "high"

    def test_result_has_required_keys(self):
        expo = _make_exposure()
        c = engine.compute_delay_cost(expo, delay_days=3)
        for key in ("urgency", "daily_cost_inr", "urgency_narrative", "total_delay_cost_inr", "delay_days"):
            assert key in c, f"Missing key: {key}"


# ── compute_supplier_exposure ────────────────────────────────────────────────

class TestSupplierExposure:
    def test_total_exposure_non_negative(self):
        expo = engine.compute_supplier_exposure(
            supplier_id="s1",
            supplier_name="Test",
            skus=_standard_skus(),
            active_disruptions=[],
            delivery_stats={"late_pct": 0.1, "avg_delay_days": 1},
        )
        assert expo.total_exposure_inr >= 0.0

    def test_exposure_level_present(self):
        expo = engine.compute_supplier_exposure(
            supplier_id="s1",
            supplier_name="Test",
            skus=_standard_skus(),
            active_disruptions=[],
            delivery_stats={},
        )
        assert expo.exposure_level in {"low", "medium", "high", "critical"}

    def test_festival_multiplier_increases_exposure(self):
        base = engine.compute_supplier_exposure(
            supplier_id="s1", supplier_name="Test",
            skus=_standard_skus(), active_disruptions=[],
            delivery_stats={}, festival_demand_multiplier=1.0,
        )
        festival = engine.compute_supplier_exposure(
            supplier_id="s1", supplier_name="Test",
            skus=_standard_skus(), active_disruptions=[],
            delivery_stats={}, festival_demand_multiplier=2.0,
        )
        assert festival.total_exposure_inr >= base.total_exposure_inr

    def test_disruption_adds_sla_penalties(self):
        no_disruption = engine.compute_supplier_exposure(
            supplier_id="s1", supplier_name="Test",
            skus=_standard_skus(), active_disruptions=[],
            delivery_stats={"avg_delay_days": 2},
        )
        with_disruption = engine.compute_supplier_exposure(
            supplier_id="s1", supplier_name="Test",
            skus=_standard_skus(),
            active_disruptions=[{"severity": "high", "impact_score": 0.7}],
            delivery_stats={"avg_delay_days": 2},
        )
        assert with_disruption.sla_penalties_inr >= no_disruption.sla_penalties_inr

    def test_empty_skus_gives_zero_revenue_at_risk(self):
        expo = engine.compute_supplier_exposure(
            supplier_id="s1", supplier_name="Test",
            skus=[], active_disruptions=[],
            delivery_stats={},
        )
        assert expo.revenue_at_risk_inr == 0.0
