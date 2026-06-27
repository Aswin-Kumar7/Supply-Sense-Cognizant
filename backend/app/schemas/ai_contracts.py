"""
Pydantic contracts for all AI-generated output in SupplySense.

Every model response must be validated against one of these contracts before
entering application state. Using extra="forbid" ensures that unexpected fields
— including authoritative overrides like risk_score, priority, or supplier_id —
are rejected at the boundary and never reach the response pipeline.

Design rules:
- No monetary or numeric authoritative fields allowed in any contract.
- All string fields have max_length to prevent runaway model output.
- Enum fields prevent the model from inventing event types or severity levels.
- Lists are length-bounded to prevent prompt-stuffed arrays.
"""
from __future__ import annotations

from typing import Literal
from pydantic import BaseModel, Field, field_validator, ConfigDict


# ── Action card narrative ─────────────────────────────────────────────────────

class ActionNarrative(BaseModel):
    """
    The only fields AI is permitted to produce for a procurement action card.

    All authoritative values (risk_score, financial_exposure_inr, priority,
    supplier_id, action_type, days_to_stockout) are populated by deterministic
    engines AFTER this model is validated. AI must never produce those fields.
    """
    model_config = ConfigDict(extra="forbid")

    title: str = Field(max_length=120, description="Concise action title")
    executive_summary: str = Field(max_length=600)
    reasoning: str = Field(max_length=700)
    urgency_narrative: str = Field(max_length=400)
    cost_of_delay_narrative: str = Field(max_length=400)
    recommended_action: str = Field(max_length=400)
    escalation_window: str = Field(max_length=60)
    alternate_supplier_rationale: str = Field(default="", max_length=400)

    @field_validator(
        "title", "executive_summary", "reasoning",
        "urgency_narrative", "cost_of_delay_narrative",
        "recommended_action", "escalation_window",
        "alternate_supplier_rationale",
        mode="before",
    )
    @classmethod
    def strip_whitespace(cls, v: object) -> object:
        return v.strip() if isinstance(v, str) else v


# ── Executive brief narrative ─────────────────────────────────────────────────

class ExecutiveBriefNarrative(BaseModel):
    """Narrative-only fields for the executive procurement briefing."""
    model_config = ConfigDict(extra="forbid")

    summary: str = Field(max_length=800)
    top_risks: list[str] = Field(default_factory=list)
    immediate_actions: list[str] = Field(default_factory=list)

    @field_validator("top_risks", "immediate_actions", mode="before")
    @classmethod
    def limit_list_items(cls, v: object) -> object:
        if isinstance(v, list):
            return [str(item)[:300] for item in v[:5]]
        return v


# ── Alternate supplier narrative ──────────────────────────────────────────────

class AlternateSupplierNarrative(BaseModel):
    """Narrative-only fields for alternate supplier evaluation."""
    model_config = ConfigDict(extra="forbid")

    recommended_alternate: str = Field(max_length=200)
    rationale: str = Field(max_length=600)
    trade_offs: str = Field(max_length=300)
    transition_timeline: str = Field(max_length=60)


# ── Signal intelligence classification ───────────────────────────────────────

SeverityLevel = Literal["low", "medium", "high", "critical"]
EventType = Literal[
    "supplier_disruption", "weather_event", "logistics_delay",
    "demand_surge", "quality_issue", "geopolitical", "strike",
    "regulatory", "financial_distress", "force_majeure", "unknown",
]


class SignalClassification(BaseModel):
    """Structured output for the signal intelligence agent."""
    model_config = ConfigDict(extra="forbid")

    event_type: EventType
    severity: SeverityLevel
    confidence: float = Field(ge=0.0, le=1.0)
    affected_region: str = Field(max_length=100)
    estimated_duration_days: int = Field(ge=0, le=365)
    requires_human_review: bool = False
    summary: str = Field(max_length=500)
    affected_supplier_ids: list[str] = Field(default_factory=list)

    @field_validator("confidence", mode="before")
    @classmethod
    def clamp_confidence(cls, v: object) -> object:
        if isinstance(v, (int, float)):
            return max(0.0, min(1.0, float(v)))
        return v

    @field_validator("affected_supplier_ids", mode="before")
    @classmethod
    def limit_ids(cls, v: object) -> object:
        if isinstance(v, list):
            return v[:20]
        return v


# ── Risk assessment narrative ─────────────────────────────────────────────────

class RiskNarrative(BaseModel):
    """
    Narrative-only output from the risk assessment agent.

    The authoritative overall_score, risk_level, confidence, and factors
    are re-fetched directly from the engine after the agent runs (Task 5).
    This contract contains only what the model is allowed to contribute.
    """
    model_config = ConfigDict(extra="forbid")

    key_factors_summary: str = Field(max_length=600)
    recommendation_rationale: str = Field(max_length=500)
    cascade_affected: int = Field(ge=0, default=0)

    @field_validator("cascade_affected", mode="before")
    @classmethod
    def clamp_cascade(cls, v: object) -> object:
        try:
            return max(0, int(v))
        except (TypeError, ValueError):
            return 0


# ── Action proposal narrative ─────────────────────────────────────────────────

class ActionProposalNarrative(BaseModel):
    """
    Narrative-only output from the prescriptive action agent.
    The action_type is validated against an enum so the model cannot
    invent action types not supported by the mitigation engine.
    """
    model_config = ConfigDict(extra="forbid")

    action_type: Literal["switch_supplier", "expedite", "increase_stock", "substitute_sku", "reorder"]
    title: str = Field(max_length=120)
    description: str = Field(max_length=600)
    reasoning: str = Field(max_length=600)
    urgency_narrative: str = Field(max_length=400)
    recommended_action: str = Field(max_length=400)
    alternate_supplier_rationale: str = Field(default="", max_length=400)


# ── Disruption event classification ──────────────────────────────────────────

DisruptionEventType = Literal["weather", "geopolitical", "logistics", "labor", "infrastructure"]


class DisruptionClassification(BaseModel):
    """Typed output for _classify_event_impl — replaces invoke_structured call."""
    model_config = ConfigDict(extra="forbid")

    event_type: DisruptionEventType
    severity: SeverityLevel
    confidence: float = Field(ge=0.0, le=1.0)
    affected_region: str = Field(max_length=100)
    estimated_duration_days: int = Field(ge=0, le=365)

    @field_validator("confidence", mode="before")
    @classmethod
    def clamp_confidence(cls, v: object) -> object:
        if isinstance(v, (int, float)):
            return max(0.0, min(1.0, float(v)))
        return v
