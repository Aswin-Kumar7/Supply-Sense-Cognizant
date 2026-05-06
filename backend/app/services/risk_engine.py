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

from dataclasses import dataclass, field
from datetime import date, timedelta
from uuid import UUID


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

    @property
    def factor_dict(self) -> dict:
        return {f.name: {"value": f.value, "weighted": f.weighted_value, "explanation": f.explanation} for f in self.factors}


class RiskScoringEngine:
    """
    Deterministic risk scoring engine.
    Computes supplier risk from multiple data signals.
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
    ) -> RiskBreakdown:
        """
        Compute comprehensive risk score for a supplier.
        All inputs are pre-fetched data; this method is pure computation.
        """
        factors = []

        # Factor 1: Delivery Reliability (inverted - low reliability = high risk)
        delivery_risk = self._compute_delivery_risk(reliability_score, delivery_stats)
        factors.append(RiskFactor(
            name="delivery_reliability",
            value=delivery_risk,
            weight=WEIGHT_DELIVERY_RELIABILITY,
            explanation=f"Reliability {reliability_score:.0%}, late deliveries: {delivery_stats.get('late_pct', 0):.0%}",
        ))

        # Factor 2: Disruption Severity
        disruption_risk = self._compute_disruption_risk(active_disruptions)
        factors.append(RiskFactor(
            name="disruption_severity",
            value=disruption_risk,
            weight=WEIGHT_DISRUPTION_SEVERITY,
            explanation=f"{len(active_disruptions)} active disruptions, max severity: {self._max_severity(active_disruptions)}",
        ))

        # Factor 3: Inventory Pressure
        factors.append(RiskFactor(
            name="inventory_pressure",
            value=min(1.0, inventory_pressure),
            weight=WEIGHT_INVENTORY_PRESSURE,
            explanation=f"Inventory pressure index: {inventory_pressure:.2f}",
        ))

        # Factor 4: Logistics Vulnerability
        logistics_risk = RISK_ZONE_SCORES.get(risk_zone, 0.1)
        factors.append(RiskFactor(
            name="logistics_vulnerability",
            value=logistics_risk,
            weight=WEIGHT_LOGISTICS_VULNERABILITY,
            explanation=f"Risk zone: {risk_zone or 'none'}, vulnerability: {logistics_risk:.2f}",
        ))

        # Factor 5: Dependency Exposure
        factors.append(RiskFactor(
            name="dependency_exposure",
            value=min(1.0, dependency_exposure),
            weight=WEIGHT_DEPENDENCY_EXPOSURE,
            explanation=f"Upstream dependency risk: {dependency_exposure:.2f}",
        ))

        # Factor 6: Festival Proximity
        factors.append(RiskFactor(
            name="festival_proximity",
            value=min(1.0, festival_proximity),
            weight=WEIGHT_FESTIVAL_PROXIMITY,
            explanation=f"Festival demand multiplier proximity: {festival_proximity:.2f}",
        ))

        # Compute overall score
        overall = sum(f.weighted_value for f in factors)
        overall = round(min(1.0, max(0.0, overall)), 4)

        # Determine risk level
        risk_level = self._score_to_level(overall)

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
        max_impact = max(d.get("impact_score", 0.5) for d in disruptions)
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

    def _score_to_level(self, score: float) -> str:
        if score >= 0.7:
            return "critical"
        elif score >= 0.5:
            return "high"
        elif score >= 0.3:
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

        total = len(SIGNAL_WEIGHTS)
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
