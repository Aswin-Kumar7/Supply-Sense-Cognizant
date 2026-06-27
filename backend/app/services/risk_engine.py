"""
Deterministic Risk Scoring Engine for SupplySense.

Computes supplier risk scores using a reproducible formula:
  risk_score = weighted_sum(
    delivery_reliability,
    disruption_severity,
    festival_proximity,
    inventory_pressure,
    logistics_vulnerability,
    dependency_exposure
  )

Architecture Principles:
- Purely deterministic: same inputs → same outputs
- Explainable: every score has a breakdown
- Auditable: factor weights are explicit constants
- Composable: individual factors can be inspected independently

Why NOT AI for this:
- Risk scoring is arithmetic, not reasoning
- Reproducibility is critical for financial decisions
- Auditors need deterministic trails
- AI adds value in INTERPRETING these scores, not computing them
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, timedelta
from typing import TYPE_CHECKING
from uuid import UUID

if TYPE_CHECKING:
    from app.schemas.policy import RiskPolicyConfig


# ============ SCORING WEIGHTS (tunable, explicit) ============
# These weights determine how much each factor contributes to overall risk.
# Sum = 1.0 for normalized output.

WEIGHT_DELIVERY_RELIABILITY = 0.25
WEIGHT_DISRUPTION_SEVERITY = 0.25
WEIGHT_INVENTORY_PRESSURE = 0.20
WEIGHT_LOGISTICS_VULNERABILITY = 0.15
WEIGHT_DEPENDENCY_EXPOSURE = 0.10
WEIGHT_FESTIVAL_PROXIMITY = 0.05

# Severity multipliers for disruption types
SEVERITY_MULTIPLIERS = {
    "critical": 1.0,
    "high": 0.75,
    "medium": 0.5,
    "low": 0.25,
}

# Risk zone vulnerability scores
RISK_ZONE_SCORES = {
    "cyclone_coastal": 0.7,
    "flood_prone": 0.65,
    "strike_prone": 0.5,
    None: 0.1,
}


@dataclass
class RiskFactor:
    """Individual risk factor with value and explanation."""
    name: str
    value: float  # 0.0 to 1.0
    weight: float
    explanation: str
    weighted_value: float = 0.0

    def __post_init__(self):
        self.weighted_value = round(self.value * self.weight, 4)


@dataclass
class RiskBreakdown:
    """Complete risk assessment with factor-level explainability."""
    supplier_id: UUID
    supplier_name: str
    overall_score: float  # 0.0 (safe) to 1.0 (critical)
    risk_level: str  # low, medium, high, critical
    factors: list[RiskFactor] = field(default_factory=list)
    confidence: float = 0.85
    computed_at: str = ""
    policy_version: int = 1  # version of RiskPolicyConfig used for this computation

    @property
    def factor_dict(self) -> dict:
        return {f.name: {"value": f.value, "weighted": f.weighted_value, "explanation": f.explanation} for f in self.factors}


class RiskScoringEngine:
    """
    Deterministic risk scoring engine.
    Computes supplier risk from multiple data signals.
    Accepts an optional RiskPolicyConfig to override hardcoded constants,
    enabling versioned policy replay and customer-specific tuning.
    """

    def compute_supplier_risk(
        self,
        supplier_id: UUID,
        supplier_name: str,
        reliability_score: float,
        risk_zone: str | None,
        active_disruptions: list[dict],
        delivery_stats: dict,
        inventory_pressure: float,
        dependency_exposure: float,
        festival_proximity: float,
        policy: "RiskPolicyConfig | None" = None,
        policy_version: int = 1,
    ) -> "RiskBreakdown":
        """
        Compute comprehensive risk score for a supplier.
        All inputs are pre-fetched data; this method is pure computation.
        When policy is None the module-level constants are used (backward-compatible).
        """
        # Resolve weights and zone scores from policy or module-level constants
        if policy is not None:
            w_delivery = policy.weight_delivery_reliability
            w_disruption = policy.weight_disruption_severity
            w_inventory = policy.weight_inventory_pressure
            w_logistics = policy.weight_logistics_vulnerability
            w_dependency = policy.weight_dependency_exposure
            w_festival = policy.weight_festival_proximity
            zone_scores = {
                "cyclone_coastal": policy.zone_cyclone_coastal,
                "flood_prone": policy.zone_flood_prone,
                "strike_prone": policy.zone_strike_prone,
                None: policy.zone_default,
            }
            t_medium = policy.threshold_medium
            t_high = policy.threshold_high
            t_critical = policy.threshold_critical
        else:
            w_delivery = WEIGHT_DELIVERY_RELIABILITY
            w_disruption = WEIGHT_DISRUPTION_SEVERITY
            w_inventory = WEIGHT_INVENTORY_PRESSURE
            w_logistics = WEIGHT_LOGISTICS_VULNERABILITY
            w_dependency = WEIGHT_DEPENDENCY_EXPOSURE
            w_festival = WEIGHT_FESTIVAL_PROXIMITY
            zone_scores = RISK_ZONE_SCORES
            t_medium, t_high, t_critical = 0.30, 0.50, 0.70

        factors = []

        # Factor 1: Delivery Reliability (inverted - low reliability = high risk)
        delivery_risk = self._compute_delivery_risk(reliability_score, delivery_stats)
        factors.append(RiskFactor(
            name="delivery_reliability",
            value=delivery_risk,
            weight=w_delivery,
            explanation=f"Reliability {reliability_score:.0%}, late deliveries: {delivery_stats.get('late_pct', 0):.0%}",
        ))

        # Factor 2: Disruption Severity
        disruption_risk = self._compute_disruption_risk(active_disruptions)
        factors.append(RiskFactor(
            name="disruption_severity",
            value=disruption_risk,
            weight=w_disruption,
            explanation=f"{len(active_disruptions)} active disruptions, max severity: {self._max_severity(active_disruptions)}",
        ))

        # Factor 3: Inventory Pressure
        factors.append(RiskFactor(
            name="inventory_pressure",
            value=min(1.0, inventory_pressure),
            weight=w_inventory,
            explanation=f"Inventory pressure index: {inventory_pressure:.2f}",
        ))

        # Factor 4: Logistics Vulnerability
        logistics_risk = zone_scores.get(risk_zone, zone_scores.get(None, 0.1))
        factors.append(RiskFactor(
            name="logistics_vulnerability",
            value=logistics_risk,
            weight=w_logistics,
            explanation=f"Risk zone: {risk_zone or 'none'}, vulnerability: {logistics_risk:.2f}",
        ))

        # Factor 5: Dependency Exposure
        factors.append(RiskFactor(
            name="dependency_exposure",
            value=min(1.0, dependency_exposure),
            weight=w_dependency,
            explanation=f"Upstream dependency risk: {dependency_exposure:.2f}",
        ))

        # Factor 6: Festival Proximity
        factors.append(RiskFactor(
            name="festival_proximity",
            value=min(1.0, festival_proximity),
            weight=w_festival,
            explanation=f"Festival demand multiplier proximity: {festival_proximity:.2f}",
        ))

        # Compute overall score
        overall = sum(f.weighted_value for f in factors)
        overall = round(min(1.0, max(0.0, overall)), 4)

        # Determine risk level using policy thresholds
        risk_level = self._score_to_level(overall, t_medium, t_high, t_critical)

        # Compute confidence using signal agreement scoring
        confidence = self._compute_confidence(
            delivery_stats,
            active_disruptions,
            inventory_pressure=inventory_pressure,
            dependency_exposure=dependency_exposure,
            festival_proximity=festival_proximity,
        )

        return RiskBreakdown(
            supplier_id=supplier_id,
            supplier_name=supplier_name,
            overall_score=overall,
            risk_level=risk_level,
            factors=factors,
            confidence=confidence,
            computed_at=date.today().isoformat(),
            policy_version=policy_version,
        )

    def _compute_delivery_risk(self, reliability: float, stats: dict) -> float:
        """Convert reliability metrics to risk score."""
        base_risk = 1.0 - reliability
        late_penalty = stats.get("late_pct", 0) * 0.3
        return min(1.0, base_risk + late_penalty)

    def _compute_disruption_risk(self, disruptions: list[dict]) -> float:
        """Aggregate active disruption severity into single risk score."""
        if not disruptions:
            return 0.0
        # Apply severity multiplier so label semantics affect the score
        def _weighted_impact(d: dict) -> float:
            raw = float(d.get("impact_score", 0.5))
            sev = str(d.get("severity", "medium")).lower()
            return raw * SEVERITY_MULTIPLIERS.get(sev, 0.5)

        max_impact = max(_weighted_impact(d) for d in disruptions)
        count_factor = min(1.0, len(disruptions) * 0.25)
        return min(1.0, max_impact * 0.7 + count_factor * 0.3)

    def _max_severity(self, disruptions: list[dict]) -> str:
        if not disruptions:
            return "none"
        severities = [d.get("severity", "low") for d in disruptions]
        for level in ["critical", "high", "medium", "low"]:
            if level in severities:
                return level
        return "low"

    def _score_to_level(
        self,
        score: float,
        t_medium: float = 0.30,
        t_high: float = 0.50,
        t_critical: float = 0.70,
    ) -> str:
        if score >= t_critical:
            return "critical"
        elif score >= t_high:
            return "high"
        elif score >= t_medium:
            return "medium"
        return "low"

    def _compute_confidence(
        self,
        delivery_stats: dict,
        disruptions: list,
        inventory_pressure: float = 0.0,
        dependency_exposure: float = 0.0,
        festival_proximity: float = 0.0,
    ) -> float:
        """
        Signal agreement scoring:
          confidence = (signals pointing to high risk / total active signals)
                       × average signal quality weight

        Signal quality weights:
          - active disruption in database: 0.90
          - delivery history shows declining trend (late_pct > 0.25): 0.85
          - festival proximity within 14 days (proximity > 0.3): 0.75
          - inventory below safety stock (pressure > 0.5): 0.80
          - dependency exposure from upstream (exposure > 0.3): 0.70

        If ≥3 signals agree → confidence HIGH (≥0.80)
        If only 1 signal  → confidence LOW (<0.50) — alert routes to human review
        """
        SIGNAL_WEIGHTS = {
            "active_disruption": 0.90,
            "delivery_declining": 0.85,
            "inventory_low": 0.80,
            "festival_proximity": 0.75,
            "dependency_exposure": 0.70,
        }

        active_signals: list[str] = []
        if len(disruptions) > 0:
            active_signals.append("active_disruption")
        if delivery_stats.get("late_pct", 0) > 0.25:
            active_signals.append("delivery_declining")
        if inventory_pressure > 0.5:
            active_signals.append("inventory_low")
        if festival_proximity > 0.3:
            active_signals.append("festival_proximity")
        if dependency_exposure > 0.3:
            active_signals.append("dependency_exposure")

        # Denominator: count only signals for which we actually have data.
        # delivery_declining requires delivery history; dependency_exposure requires
        # an upstream graph. If inputs are empty/zero those dimensions shouldn't
        # count against the confidence fraction.
        total = sum([
            1,  # active_disruption is always checkable
            1 if delivery_stats else 0,
            1 if inventory_pressure is not None else 0,
            1 if festival_proximity is not None else 0,
            1 if dependency_exposure is not None else 0,
        ])
        total = max(total, 1)
        agreeing = len(active_signals)

        if agreeing == 0:
            return 0.40  # no signals — very low confidence

        avg_quality = sum(SIGNAL_WEIGHTS[s] for s in active_signals) / agreeing
        raw = (agreeing / total) * avg_quality

        # Enforce thresholds: ≥3 signals → ≥0.80; exactly 1 signal → <0.50
        if agreeing >= 3:
            raw = max(raw, 0.80)
        elif agreeing == 1:
            raw = min(raw, 0.49)

        return round(min(0.95, raw), 2)


# Singleton
risk_engine = RiskScoringEngine()
