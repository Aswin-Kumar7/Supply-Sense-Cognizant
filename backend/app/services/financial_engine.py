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

from dataclasses import dataclass, field
from uuid import UUID


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
class MitigationSimulation:
    """Result of simulating a mitigation strategy.

    Accounting identity (always holds):
        current_exposure_inr = mitigated_exposure_inr + savings_inr + mitigation_cost_inr
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
    ) -> MitigationSimulation:
        """
        Generate mitigation options with financial impact projections.
        """
        options = []
        current_exposure = supplier_exposure.total_exposure_inr

        # Option 1: Switch to alternate supplier
        options.append(MitigationOption(
            action_type="switch_supplier",
            description="Activate alternate supplier with 15% cost premium",
            cost_inr=round(current_exposure * 0.15, 2),
            risk_reduction=0.6,
            exposure_reduction_inr=round(current_exposure * 0.6, 2),
            time_to_effect_days=lead_time_days + 3,
            confidence=0.75,
        ))

        # Option 2: Increase safety stock
        options.append(MitigationOption(
            action_type="increase_stock",
            description="Pre-order 2 weeks additional safety stock",
            cost_inr=round(current_exposure * 0.25, 2),
            risk_reduction=0.4,
            exposure_reduction_inr=round(current_exposure * 0.4, 2),
            time_to_effect_days=lead_time_days,
            confidence=0.85,
        ))

        # Option 3: Expedite current orders
        options.append(MitigationOption(
            action_type="expedite",
            description="Pay expedite premium for priority shipping",
            cost_inr=round(current_exposure * 0.10, 2),
            risk_reduction=0.3,
            exposure_reduction_inr=round(current_exposure * 0.3, 2),
            time_to_effect_days=2,
            confidence=0.70,
        ))

        # Option 4: Substitute SKUs
        options.append(MitigationOption(
            action_type="substitute_sku",
            description="Activate substitute products from alternate sources",
            cost_inr=round(current_exposure * 0.08, 2),
            risk_reduction=0.25,
            exposure_reduction_inr=round(current_exposure * 0.25, 2),
            time_to_effect_days=1,
            confidence=0.65,
        ))

        # Best option = highest net saving (exposure reduced minus cost to act)
        best = max(options, key=lambda o: o.exposure_reduction_inr - o.cost_inr)
        mitigated_exposure = round(max(0.0, current_exposure - best.exposure_reduction_inr), 2)
        # gross exposure reduction — identity: current = mitigated + savings + cost
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
        )

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
