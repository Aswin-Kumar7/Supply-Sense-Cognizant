"""
Typed policy configuration schemas.

Each policy type has a concrete Pydantic model with validated ranges.
These schemas are stored as JSONB in PolicyRecord.config and loaded
at runtime to replace hardcoded constants in the engines.

Policy version is recorded with every analysis result so any historical
output can be replayed by fetching the matching policy snapshot.
"""

from pydantic import BaseModel, Field, ConfigDict, model_validator
from typing import Literal
import uuid


# ── Risk Policy ──────────────────────────────────────────────────────────────

class RiskPolicyConfig(BaseModel):
    """
    Weights, zone scores, severity multipliers, and level thresholds
    for the deterministic risk scoring engine.
    Weights must sum to 1.0 ± 1e-6.
    """
    model_config = ConfigDict(extra="forbid")

    # Factor weights (must sum to 1.0)
    weight_delivery_reliability: float = Field(0.25, ge=0.0, le=1.0)
    weight_disruption_severity: float = Field(0.25, ge=0.0, le=1.0)
    weight_inventory_pressure: float = Field(0.20, ge=0.0, le=1.0)
    weight_logistics_vulnerability: float = Field(0.15, ge=0.0, le=1.0)
    weight_dependency_exposure: float = Field(0.10, ge=0.0, le=1.0)
    weight_festival_proximity: float = Field(0.05, ge=0.0, le=1.0)

    # Risk zone vulnerability scores (0 = no extra risk, 1 = full vulnerability)
    zone_cyclone_coastal: float = Field(0.70, ge=0.0, le=1.0)
    zone_flood_prone: float = Field(0.65, ge=0.0, le=1.0)
    zone_strike_prone: float = Field(0.50, ge=0.0, le=1.0)
    zone_default: float = Field(0.10, ge=0.0, le=1.0)

    # Risk level thresholds (score boundaries, ascending)
    threshold_medium: float = Field(0.30, ge=0.0, lt=1.0)
    threshold_high: float = Field(0.50, ge=0.0, lt=1.0)
    threshold_critical: float = Field(0.70, ge=0.0, lt=1.0)

    @model_validator(mode="after")
    def weights_sum_to_one(self) -> "RiskPolicyConfig":
        total = (
            self.weight_delivery_reliability
            + self.weight_disruption_severity
            + self.weight_inventory_pressure
            + self.weight_logistics_vulnerability
            + self.weight_dependency_exposure
            + self.weight_festival_proximity
        )
        if abs(total - 1.0) > 1e-6:
            raise ValueError(f"Risk weights must sum to 1.0, got {total:.9f}")
        if not (self.threshold_medium < self.threshold_high < self.threshold_critical):
            raise ValueError("Risk thresholds must be strictly ascending: medium < high < critical")
        return self


# ── Financial Policy ─────────────────────────────────────────────────────────

class FinancialPolicyConfig(BaseModel):
    """
    SLA rates, stockout multiplier, expedite premium, and mitigation option
    proportions for the deterministic financial exposure engine.
    All monetary assumptions are explicit and owner-tagged.
    """
    model_config = ConfigDict(extra="forbid")

    # SLA penalty: ₹ per unit-day of delay
    sla_penalty_per_unit_day_inr: float = Field(50.0, ge=0.0)

    # Stockout cost multiplier applied to inventory value at risk (lost sales + brand damage)
    stockout_cost_multiplier: float = Field(2.5, ge=1.0, le=10.0)

    # Expedite cost premium as fraction of unit cost (0.35 = 35% premium)
    expedite_premium_fraction: float = Field(0.35, ge=0.0, le=2.0)

    # Mitigation option proportions (fraction of current_exposure)
    switch_supplier_cost_fraction: float = Field(0.15, ge=0.0, le=1.0)
    switch_supplier_reduction_fraction: float = Field(0.60, ge=0.0, le=1.0)
    increase_stock_cost_fraction: float = Field(0.25, ge=0.0, le=1.0)
    increase_stock_reduction_fraction: float = Field(0.40, ge=0.0, le=1.0)
    expedite_cost_fraction: float = Field(0.10, ge=0.0, le=1.0)
    expedite_reduction_fraction: float = Field(0.30, ge=0.0, le=1.0)
    substitute_sku_cost_fraction: float = Field(0.08, ge=0.0, le=1.0)
    substitute_sku_reduction_fraction: float = Field(0.25, ge=0.0, le=1.0)

    # Exposure level thresholds (INR)
    threshold_medium_inr: float = Field(100_000.0, ge=0.0)
    threshold_high_inr: float = Field(500_000.0, ge=0.0)
    threshold_critical_inr: float = Field(2_000_000.0, ge=0.0)


# ── Action Policy ─────────────────────────────────────────────────────────────

class ActionPolicyConfig(BaseModel):
    """
    Escalation rules, action type eligibility, and spend/quantity limits.
    These constrain what the AI can recommend and what can be auto-approved.
    """
    model_config = ConfigDict(extra="forbid")

    # Minimum risk score required before each action type is permitted
    min_risk_score_reorder: float = Field(0.3, ge=0.0, le=1.0)
    min_risk_score_switch_supplier: float = Field(0.5, ge=0.0, le=1.0)
    min_risk_score_expedite: float = Field(0.4, ge=0.0, le=1.0)
    min_risk_score_increase_stock: float = Field(0.3, ge=0.0, le=1.0)

    # Auto-approval threshold: actions below this spend are auto-approved
    auto_approve_spend_limit_inr: float = Field(50_000.0, ge=0.0)

    # High-impact threshold: actions above this require explicit approval
    require_approval_spend_limit_inr: float = Field(500_000.0, ge=0.0)

    # Escalation window for different risk levels (hours)
    escalation_window_critical_hours: int = Field(4, ge=1)
    escalation_window_high_hours: int = Field(24, ge=1)
    escalation_window_medium_hours: int = Field(72, ge=1)


# ── Review Policy ────────────────────────────────────────────────────────────

class ReviewPolicyConfig(BaseModel):
    """
    Confidence thresholds that determine when human review is required
    and what action states are permitted before approval.
    """
    model_config = ConfigDict(extra="forbid")

    # Risk assessments with confidence below this go to human review
    confidence_review_threshold: float = Field(0.60, ge=0.0, le=1.0)

    # Pipeline stages that, if failed, require mandatory review before publishing
    block_on_stage_failure: list[str] = Field(
        default_factory=lambda: ["risk_assessment", "grounding_validation"]
    )

    # Whether recommendations with grounding violations can be published (with warning)
    allow_grounding_violation_publish: bool = Field(False)

    # Max time (hours) a review-required item stays in queue before auto-escalation
    review_queue_max_hours: int = Field(48, ge=1)


# ── Combined policy snapshot ─────────────────────────────────────────────────

class PolicySnapshot(BaseModel):
    """Snapshot of all active policies at a point in time, for audit replay."""
    model_config = ConfigDict(extra="forbid")

    snapshot_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    risk_version: int
    financial_version: int
    action_version: int
    review_version: int
    risk: RiskPolicyConfig
    financial: FinancialPolicyConfig
    action: ActionPolicyConfig
    review: ReviewPolicyConfig
    captured_at: str = ""


# ── API request/response schemas ─────────────────────────────────────────────

class PolicyCreateRequest(BaseModel):
    """Request body for creating a new policy version."""
    policy_type: Literal["risk", "financial", "action", "review"]
    name: str = Field(max_length=200)
    description: str = Field(default="", max_length=1000)
    config: dict
    created_by: str = Field(default="system", max_length=200)


class PolicyResponse(BaseModel):
    """API response for a single policy record."""
    id: str
    policy_type: str
    version: int
    name: str
    description: str
    is_active: bool
    is_default: bool
    created_at: str
    activated_at: str | None
    created_by: str


class PolicyActivateRequest(BaseModel):
    """Request to activate a specific policy version."""
    activated_by: str = Field(default="system", max_length=200)
