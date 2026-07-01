"""
Financial Exposure Engine for SupplySense.

Calculates rupee-denominated business exposure:
- Total Financial Exposure (TFE)
- Revenue at risk per supplier
- SLA penalty projections
- Mitigation savings potential
- Cost escalation over time

All calculations are deterministic and auditable.
Currency: Indian Rupees (INR)
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import TYPE_CHECKING
from uuid import UUID

if TYPE_CHECKING:
    from app.schemas.policy import FinancialPolicyConfig


@dataclass
class SupplierExposure:
    """Financial exposure for a single supplier."""
    supplier_id: str
    supplier_name: str
    revenue_at_risk_inr: float
    sla_penalties_inr: float
    stockout_cost_inr: float
    mitigation_cost_inr: float
    total_exposure_inr: float
    exposure_level: str  # low, medium, high, critical
    breakdown: dict = field(default_factory=dict)


@dataclass
class FinancialSummary:
    """Aggregated financial exposure across the supply chain."""
    total_financial_exposure_inr: float
    total_revenue_at_risk_inr: float
    total_sla_penalties_inr: float
    total_stockout_cost_inr: float
    potential_mitigation_savings_inr: float
    exposure_by_category: dict
    exposure_by_region: dict
    top_exposures: list[SupplierExposure]
    risk_trend: str  # increasing, stable, decreasing


@dataclass
class MitigationOption:
    """A single mitigation action with financial impact."""
    action_type: str  # switch_supplier, increase_stock, expedite, substitute_sku
    description: str
    cost_inr: float
    risk_reduction: float  # 0.0 to 1.0
    exposure_reduction_inr: float
    time_to_effect_days: int
    confidence: float


@dataclass
class MitigationScenario:
    """
    Live signals that make a mitigation plan fit THIS situation instead of a
    one-size-fits-all menu. All optional with safe defaults so the engine stays
    backward-compatible (scenario=None ⇒ legacy fixed-fraction behaviour).

    Drives two things in simulate_mitigation():
      1. Which options are even viable (you can't switch to a supplier that
         doesn't exist, or reorder from one whose plant just flooded).
      2. How much each viable option costs / reduces — derived from real data
         (the actual alternate's premium & lead time, the demand spike, how many
         days of cover are left) rather than a constant.
    """
    days_to_stockout: int = 30
    inventory_cover_days: int = 30
    has_alternate: bool = False
    alt_cost_premium_pct: float = 0.15   # fraction, e.g. 0.08 = +8% (best real alternate)
    alt_lead_time_days: int = 10
    alt_quality: float = 0.80            # 0..1 (best real alternate's quality score)
    demand_multiplier: float = 1.0       # 1.0 = normal; >1 = festival/seasonal spike
    disruption_type: str = ""            # "flood", "strike", "fire", "demand_surge", "" ...

    @property
    def supplier_operational(self) -> bool:
        """True when the primary supplier can still physically fulfil — i.e. the
        disruption is demand/logistics-side, not a supplier-site collapse.
        Reordering from a flooded/struck/shut plant is pointless; switching is not."""
        hard = {"flood", "fire", "earthquake", "strike", "shutdown", "closure",
                "lockdown", "bankruptcy", "explosion", "cyclone"}
        dt = (self.disruption_type or "").lower()
        return not any(h in dt for h in hard)

    @property
    def product_blocked(self) -> bool:
        """True when the GOODS themselves are blocked (quality hold / recall),
        not just delayed. Rushing the shipment of a held batch is pointless —
        expedite is not a valid response; substituting the SKU is."""
        dt = (self.disruption_type or "").lower()
        return any(h in dt for h in ("quality", "recall", "hold", "contaminat", "fssai"))


@dataclass
class MitigationSimulation:
    """Result of simulating a mitigation strategy.

    Accounting identity (always holds):
        current_exposure_inr = mitigated_exposure_inr + net_saving_inr + mitigation_cost_inr
    i.e. the original exposure splits into: residual risk + net saving + cost of action.
    """
    supplier_id: str
    supplier_name: str
    current_exposure_inr: float
    mitigated_exposure_inr: float   # exposure remaining after best action
    savings_inr: float              # gross exposure reduction (current - mitigated)
    mitigation_cost_inr: float      # cost to execute the best action
    net_saving_inr: float           # savings_inr - mitigation_cost_inr (true financial gain)
    risk_before: float
    risk_after: float
    options: list[MitigationOption] = field(default_factory=list)
    policy_version: int = 1         # version of FinancialPolicyConfig used


class FinancialExposureEngine:
    """
    Deterministic financial exposure calculator.
    All amounts in INR. All calculations auditable.
    """

    # SLA penalty rate: ₹ per day of delay per unit
    SLA_PENALTY_RATE = 50.0
    # Stockout cost multiplier (lost sales + brand damage)
    STOCKOUT_MULTIPLIER = 2.5
    # Expedite premium percentage
    EXPEDITE_PREMIUM = 0.35

    def compute_supplier_exposure(
        self,
        supplier_id: str,
        supplier_name: str,
        skus: list[dict],
        active_disruptions: list[dict],
        delivery_stats: dict,
        cascade_impact: float = 0.0,
        festival_demand_multiplier: float = 1.0,
        supplier_lead_time_days: int = 7,
    ) -> SupplierExposure:
        """
        Compute total financial exposure for a supplier.

        Components:
        1. Revenue at risk: SKU value × stockout probability (festival-adjusted demand)
        2. SLA penalties: historical + projected over lead-time window
        3. Stockout cost: lost sales + brand damage
        4. Mitigation cost: what it would cost to fix
        """
        # Revenue at risk: effective demand accounts for festival surge
        revenue_at_risk = 0.0
        for sku in skus:
            stock = float(sku.get("current_stock") or 0)
            base_demand = float(sku.get("daily_demand_avg") or 1) or 1
            effective_demand = base_demand * festival_demand_multiplier
            cost = float(sku.get("unit_cost_inr") or 0)
            days_of_stock = stock / max(effective_demand, 1)
            risk_factor = max(0.0, 1.0 - (days_of_stock / 14))
            sku_value = stock * cost
            revenue_at_risk += sku_value * risk_factor

        # SLA penalties: units in transit during disruption = daily_demand × lead_time window
        historical_penalties = float(delivery_stats.get("total_penalties_inr") or 0)
        projected_penalties = 0.0
        if active_disruptions:
            avg_delay = float(delivery_stats.get("avg_delay_days") or 2) or 2
            # Units at risk = one lead-time worth of orders per SKU
            total_units = sum(
                float(s.get("daily_demand_avg") or 0) * supplier_lead_time_days for s in skus
            )
            projected_penalties = total_units * avg_delay * self.SLA_PENALTY_RATE

        sla_penalties = historical_penalties + projected_penalties

        # Stockout cost: units at risk × cost × multiplier
        stockout_cost = 0.0
        for sku in skus:
            stock = float(sku.get("current_stock") or 0)
            demand = float(sku.get("daily_demand_avg") or 1) or 1
            cost = float(sku.get("unit_cost_inr") or 0)
            days_of_stock = stock / demand
            if days_of_stock < 7:
                days_without = max(0.0, 7 - days_of_stock)
                units_lost = days_without * demand
                stockout_cost += units_lost * cost * self.STOCKOUT_MULTIPLIER

        # Mitigation cost: expedite premium on affected SKUs
        mitigation_cost = sum(
            float(s.get("daily_demand_avg") or 0) * 7
            * float(s.get("unit_cost_inr") or 0) * self.EXPEDITE_PREMIUM
            for s in skus
        ) if active_disruptions else 0.0

        # Add cascade amplification (Tier-2 disruptions propagate to Tier-1)
        cascade_impact_safe = float(cascade_impact or 0)
        cascade_amplifier = 1.0 + (cascade_impact_safe * 0.5)
        total_exposure = (revenue_at_risk + sla_penalties + stockout_cost) * cascade_amplifier

        # Determine exposure level
        exposure_level = self._exposure_level(total_exposure)

        return SupplierExposure(
            supplier_id=supplier_id,
            supplier_name=supplier_name,
            revenue_at_risk_inr=round(revenue_at_risk, 2),
            sla_penalties_inr=round(sla_penalties, 2),
            stockout_cost_inr=round(stockout_cost, 2),
            mitigation_cost_inr=round(mitigation_cost, 2),
            total_exposure_inr=round(total_exposure, 2),
            exposure_level=exposure_level,
            breakdown={
                "revenue_at_risk": round(revenue_at_risk, 2),
                "sla_penalties": round(sla_penalties, 2),
                "stockout_cost": round(stockout_cost, 2),
                "mitigation_cost": round(mitigation_cost, 2),
                "cascade_amplifier": round(cascade_amplifier, 3),
                "cascade_impact": round(cascade_impact_safe, 4),
                "subtotal_before_cascade": round(revenue_at_risk + sla_penalties + stockout_cost, 2),
                "total_exposure": round(total_exposure, 2),
                # Multiplier explanation for UI display
                "stockout_multiplier": self.STOCKOUT_MULTIPLIER,
                "sla_penalty_rate_per_unit_day": self.SLA_PENALTY_RATE,
            },
        )

    def simulate_mitigation(
        self,
        supplier_exposure: SupplierExposure,
        supplier_reliability: float,
        lead_time_days: int,
        risk_score: float = 1.0,
        policy: "FinancialPolicyConfig | None" = None,
        policy_version: int = 1,
        scenario: "MitigationScenario | None" = None,
    ) -> MitigationSimulation:
        """
        Generate mitigation options with financial impact projections.

        Two modes:
        - scenario is None  → legacy fixed-fraction behaviour (backward-compatible;
          policy still applies if supplied).
        - scenario provided → each option's cost / reduction / time / confidence is
          derived from the live situation (real alternate premium & lead time, the
          demand spike, days of cover left, disruption type), and options that don't
          physically fit are dropped. This is what makes the plan situation-specific
          instead of the same four lines every time.
        """
        current_exposure = supplier_exposure.total_exposure_inr

        if scenario is not None:
            options = self._scenario_options(
                current_exposure, supplier_reliability, lead_time_days, scenario
            )
        else:
            options = self._legacy_options(current_exposure, lead_time_days, policy)

        # Best option = highest net saving (exposure reduced minus cost to act)
        best = max(options, key=lambda o: o.exposure_reduction_inr - o.cost_inr)
        mitigated_exposure = round(max(0.0, current_exposure - best.exposure_reduction_inr), 2)
        # gross exposure reduction
        savings = round(current_exposure - mitigated_exposure, 2)
        net_saving = round(savings - best.cost_inr, 2)

        return MitigationSimulation(
            supplier_id=supplier_exposure.supplier_id,
            supplier_name=supplier_exposure.supplier_name,
            current_exposure_inr=current_exposure,
            mitigated_exposure_inr=mitigated_exposure,
            savings_inr=savings,
            mitigation_cost_inr=round(best.cost_inr, 2),
            net_saving_inr=net_saving,
            risk_before=round(min(1.0, max(0.0, risk_score)), 3),
            risk_after=round(mitigated_exposure / max(current_exposure, 1), 3),
            options=options,
            policy_version=policy_version,
        )

    # ── Option generators ──────────────────────────────────────────────────

    def _legacy_options(
        self, current_exposure: float, lead_time_days: int,
        policy: "FinancialPolicyConfig | None",
    ) -> list[MitigationOption]:
        """Original fixed-fraction option set (policy-aware). Unchanged behaviour."""
        if policy is not None:
            ss_cost, ss_red = policy.switch_supplier_cost_fraction, policy.switch_supplier_reduction_fraction
            is_cost, is_red = policy.increase_stock_cost_fraction, policy.increase_stock_reduction_fraction
            ex_cost, ex_red = policy.expedite_cost_fraction, policy.expedite_reduction_fraction
            sk_cost, sk_red = policy.substitute_sku_cost_fraction, policy.substitute_sku_reduction_fraction
        else:
            ss_cost, ss_red = 0.15, 0.60
            is_cost, is_red = 0.25, 0.40
            ex_cost, ex_red = 0.10, 0.30
            sk_cost, sk_red = 0.08, 0.25

        return [
            MitigationOption("switch_supplier", f"Activate alternate supplier with {ss_cost:.0%} cost premium",
                             round(current_exposure * ss_cost, 2), ss_red,
                             round(current_exposure * ss_red, 2), lead_time_days + 3, 0.75),
            MitigationOption("increase_stock", "Pre-order 2 weeks additional safety stock",
                             round(current_exposure * is_cost, 2), is_red,
                             round(current_exposure * is_red, 2), lead_time_days, 0.85),
            MitigationOption("expedite", "Pay expedite premium for priority shipping",
                             round(current_exposure * ex_cost, 2), ex_red,
                             round(current_exposure * ex_red, 2), 2, 0.70),
            MitigationOption("substitute_sku", "Activate substitute products from alternate sources",
                             round(current_exposure * sk_cost, 2), sk_red,
                             round(current_exposure * sk_red, 2), 1, 0.65),
        ]

    def _scenario_options(
        self, exposure: float, reliability: float, lead_time_days: int,
        sc: "MitigationScenario",
    ) -> list[MitigationOption]:
        """
        Build a situation-fit option set. Each option's economics are a transparent,
        clamped function of the live signals; physically-impossible options are
        dropped so the recommendation set itself reflects the scenario.
        """
        def clamp(x: float, lo: float, hi: float) -> float:
            return max(lo, min(hi, x))

        opts: list[MitigationOption] = []
        urgency = clamp(sc.days_to_stockout / 7.0, 0.0, 1.0)  # 1.0 = comfortable, →0 = imminent
        spike = clamp(sc.demand_multiplier - 1.0, 0.0, 1.0)   # 0 = normal, →1 = strong festival/seasonal spike

        # ── switch_supplier ── only if a real alternate exists ──────────────
        # Cost = the alternate's ACTUAL premium (not a flat 15%). Reduction scales
        # with the alternate's quality; a weak alternate doesn't de-risk as much.
        if sc.has_alternate:
            ss_cost = clamp(sc.alt_cost_premium_pct, 0.05, 0.45)
            # Switching is high-effort and only ever covers part of the exposure
            # (qualification, ramp, split volume). Keep reduction moderate so the
            # alternate's actual COST premium genuinely discriminates — a cheap
            # fast alternate wins, a pricey/slow one loses to reorder/buffering.
            ss_red = clamp(0.30 + 0.28 * sc.alt_quality, 0.30, 0.58)
            # A long alternate lead time erodes how much it can save before stockout.
            if sc.alt_lead_time_days > sc.days_to_stockout:
                ss_red *= clamp(sc.days_to_stockout / max(sc.alt_lead_time_days, 1), 0.4, 1.0)
            opts.append(MitigationOption(
                "switch_supplier",
                f"Redirect orders to the qualified alternate (+{ss_cost*100:.0f}% cost, "
                f"~{sc.alt_lead_time_days}d onboarding, {sc.alt_quality*100:.0f}% quality)",
                round(exposure * ss_cost, 2), round(ss_red, 3),
                round(exposure * ss_red, 2), sc.alt_lead_time_days + 3,
                clamp(0.55 + 0.35 * sc.alt_quality, 0.5, 0.92),
            ))

        # ── expedite ── only useful if a shipment can still land before stockout,
        # and only if the goods aren't themselves blocked (a quality-held batch
        # can't be rushed — you substitute the SKU instead).
        if sc.days_to_stockout >= 1 and not sc.product_blocked:
            # Effectiveness collapses as the stockout closes inside expedite transit (~2d).
            reach = clamp(sc.days_to_stockout / 3.0, 0.15, 1.0)
            ex_red = clamp(0.30 * reach, 0.05, 0.30)
            ex_cost = clamp(0.10 + 0.06 * (1 - urgency), 0.08, 0.18)  # rush costs more the later you leave it
            opts.append(MitigationOption(
                "expedite",
                "Priority-ship in-pipeline orders to bridge the immediate gap",
                round(exposure * ex_cost, 2), round(ex_red, 3),
                round(exposure * ex_red, 2), 2,
                clamp(0.6 + 0.2 * reach, 0.55, 0.85),
            ))

        # ── increase_stock ── pre-buy buffer; most valuable on a demand spike /
        # thin cover, least valuable when cover is already deep and demand is flat.
        thin_cover = clamp(1 - sc.inventory_cover_days / 21.0, 0.0, 1.0)
        is_red = clamp(0.28 + 0.25 * spike + 0.12 * thin_cover, 0.20, 0.62)
        is_cost = clamp(0.22 + 0.12 * spike, 0.18, 0.38)  # buying into a spike costs more
        opts.append(MitigationOption(
            "increase_stock",
            ("Pre-position safety stock ahead of the demand surge"
             if spike > 0.15 else "Build a safety buffer to cover the disruption window"),
            round(exposure * is_cost, 2), round(is_red, 3),
            round(exposure * is_red, 2), lead_time_days,
            clamp(0.78 + 0.12 * thin_cover, 0.7, 0.9),
        ))

        # ── reorder ── only when the primary supplier can still fulfil (not a
        # site collapse). An immediate replenishment from a healthy vendor.
        if sc.supplier_operational and reliability >= 0.55:
            re_red = clamp(0.30 + 0.20 * reliability, 0.30, 0.55)
            opts.append(MitigationOption(
                "reorder",
                "Place an immediate replenishment order with the primary supplier",
                round(exposure * 0.20, 2), round(re_red, 3),
                round(exposure * re_red, 2), max(1, lead_time_days - 1),
                clamp(0.6 + 0.25 * reliability, 0.6, 0.88),
            ))

        # ── substitute_sku ── compatible in-stock alternate product; always a
        # modest fallback, slightly better when a demand spike makes substitutes scarce.
        sk_red = clamp(0.22 + 0.08 * spike, 0.20, 0.32)
        opts.append(MitigationOption(
            "substitute_sku",
            "Switch affected demand to a compatible in-stock substitute SKU",
            round(exposure * 0.08, 2), round(sk_red, 3),
            round(exposure * sk_red, 2), 1, 0.62,
        ))

        # ── Time feasibility ── an action that only takes effect AFTER stock runs
        # out cannot neutralise the immediate exposure. Discount its reduction by
        # how much of the gap-to-stockout it actually covers. This is what stops a
        # 20-day supplier switch from looking like the best move when you stock out
        # in 2 days, and lets fast bridges (expedite/substitute) win urgent cases.
        for o in opts:
            if o.time_to_effect_days > sc.days_to_stockout:
                feas = clamp(sc.days_to_stockout / max(o.time_to_effect_days, 1), 0.2, 1.0)
                o.exposure_reduction_inr = round(o.exposure_reduction_inr * feas, 2)
                o.risk_reduction = round(o.risk_reduction * feas, 3)
                o.confidence = round(o.confidence * (0.7 + 0.3 * feas), 2)

        return opts

    def compute_delay_cost(
        self,
        supplier_exposure: SupplierExposure,
        delay_days: int,
    ) -> dict:
        """
        Compute the additional cost incurred by NOT acting for delay_days.

        Components:
        - Daily revenue leakage: revenue_at_risk / 14 (2-week window assumption)
        - Daily SLA accrual: sla_penalties / 30 per day
        - Daily stockout progression: proportional to stockout_cost
        Total daily cost × delay_days = total delay cost.
        """
        daily_revenue_leak = supplier_exposure.revenue_at_risk_inr / 14.0
        daily_sla = supplier_exposure.sla_penalties_inr / 30.0
        daily_stockout = supplier_exposure.stockout_cost_inr / 7.0
        daily_cost = round(daily_revenue_leak + daily_sla + daily_stockout, 2)
        total_delay_cost = round(daily_cost * delay_days, 2)

        if total_delay_cost >= 200000:
            urgency = "immediate"
        elif total_delay_cost >= 50000:
            urgency = "high"
        elif total_delay_cost >= 10000:
            urgency = "medium"
        else:
            urgency = "low"

        urgency_narrative = {
            "immediate": f"Every day of inaction costs ₹{daily_cost:,.0f}. Escalate now.",
            "high": f"₹{daily_cost:,.0f}/day accruing — act within 24 hours.",
            "medium": f"Manageable at ₹{daily_cost:,.0f}/day but escalating.",
            "low": f"Low urgency at ₹{daily_cost:,.0f}/day; monitor.",
        }[urgency]

        return {
            "supplier_id": supplier_exposure.supplier_id,
            "daily_cost_inr": daily_cost,
            "delay_days": delay_days,
            "total_delay_cost_inr": total_delay_cost,
            "urgency": urgency,
            "urgency_narrative": urgency_narrative,
        }

    def compute_three_scenario_delay(
        self,
        supplier_exposure: SupplierExposure,
        cascade_impact: float = 0.0,
    ) -> dict:
        """
        Compute cost-of-delay under three distinct scenarios.

        Best case  — substitute SKU mitigation applies immediately, no cascade
                     Effect: 25% of exposure removed before delay cost accrues
        Expected   — current trajectory continues for 3 days before SLA kicks in
                     Effect: baseline 3-day delay cost with SLA accrual
        Worst case — cascade triggers, substitute fails, full 7-day TFE plus
                     cascade-propagated amplification
                     Effect: 7-day delay cost × (1 + cascade_impact)

        All figures are deterministic — no LLM involvement.
        """
        base = supplier_exposure.total_exposure_inr
        daily_cost = round(
            supplier_exposure.revenue_at_risk_inr / 14.0
            + supplier_exposure.sla_penalties_inr / 30.0
            + supplier_exposure.stockout_cost_inr / 7.0,
            2,
        )

        # Best case: substitute SKU reduces exposure by 25%, only 1-day delay
        best_base = base * 0.75
        best_tfe = round(best_base + daily_cost * 1, 2)

        # Expected case: 3-day delay, baseline trajectory
        expected_tfe = round(base + daily_cost * 3, 2)

        # Worst case: 7-day delay, cascade amplifies
        cascade_amp = 1.0 + (cascade_impact * 0.5)
        worst_tfe = round((base + daily_cost * 7) * cascade_amp, 2)

        def _urgency(val: float) -> str:
            if val >= 200000:
                return "immediate"
            if val >= 50000:
                return "high"
            if val >= 10000:
                return "medium"
            return "low"

        return {
            "supplier_id": supplier_exposure.supplier_id,
            "daily_cost_inr": daily_cost,
            "best_case": {
                "tfe_inr": best_tfe,
                "horizon_days": 1,
                "urgency": _urgency(best_tfe),
                "assumption": "Substitute SKU activated immediately; no cascade. 25% exposure reduction.",
            },
            "expected_case": {
                "tfe_inr": expected_tfe,
                "horizon_days": 3,
                "urgency": _urgency(expected_tfe),
                "assumption": "Current trajectory continues for 3 days. SLA penalties begin accruing.",
            },
            "worst_case": {
                "tfe_inr": worst_tfe,
                "horizon_days": 7,
                "urgency": _urgency(worst_tfe),
                "assumption": f"Cascade triggers ({cascade_impact:.0%} propagated), substitute fails, full 7-day TFE.",
            },
        }



    def _exposure_level(self, total_inr: float) -> str:
        if total_inr >= 500000:
            return "critical"
        elif total_inr >= 200000:
            return "high"
        elif total_inr >= 50000:
            return "medium"
        return "low"


# Singleton
financial_engine = FinancialExposureEngine()
