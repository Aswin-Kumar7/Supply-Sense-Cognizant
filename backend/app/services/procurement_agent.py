"""
Procurement Intelligence Agent for SupplySense.

Generates intelligent procurement recommendations by synthesizing:
- Deterministic risk scores (from risk_engine)
- Stockout forecasts (from stockout_engine)
- Financial exposure (from financial_engine)
- Cascade propagation (from cascade_engine)
- Supplier context (from database)

Architecture:
- AI generates NARRATIVES and REASONING only
- All numbers come from deterministic engines (never AI-generated)
- Structured output templates prevent hallucination
- Graceful fallback to rule-based recommendations when Bedrock unavailable

Why AI here:
- Synthesizing 6+ data signals into coherent advice requires reasoning
- Explaining WHY a recommendation matters needs natural language
- Prioritizing across multiple dimensions needs contextual judgment
- Executive communication needs human-readable narratives
"""

from dataclasses import dataclass, field
from datetime import datetime, date, timedelta
from typing import Optional
from uuid import UUID

from app.core.bedrock import bedrock
from app.core.logging import logger


# ============ STRUCTURED OUTPUT TYPES ============

@dataclass
class IntelligentActionCard:
    """AI-enhanced ActionCard with reasoning and narratives."""
    # Deterministic fields (from engines, NOT AI)
    id: str
    supplier_id: str
    supplier_name: str
    sku_ids: list[str]
    action_type: str  # reorder, switch_supplier, expedite, increase_stock
    priority: str  # critical, high, medium, low
    financial_exposure_inr: float
    days_to_stockout: int
    risk_score: float
    confidence: float

    # AI-generated fields (narratives and reasoning)
    title: str = ""
    executive_summary: str = ""
    reasoning: str = ""
    urgency_narrative: str = ""
    cost_of_delay_narrative: str = ""
    recommended_action: str = ""
    escalation_window: str = ""
    alternate_supplier_rationale: str = ""

    # Metadata
    generated_at: str = field(default_factory=lambda: datetime.utcnow().isoformat())
    ai_generated: bool = True


@dataclass
class ProcurementBrief:
    """Executive procurement briefing."""
    summary: str
    critical_actions_count: int
    total_exposure_inr: float
    top_risks: list[str]
    immediate_actions: list[str]
    generated_at: str = field(default_factory=lambda: datetime.utcnow().isoformat())


# ============ PROMPT TEMPLATES ============

SYSTEM_PROMPT = """You are an expert procurement intelligence advisor for an Indian retail supply chain platform called SupplySense.

Your role:
- Generate concise, actionable procurement recommendations
- Explain WHY actions are urgent using business context
- Communicate in enterprise-grade language suitable for procurement heads and CFOs
- Focus on operational consequences and financial impact
- Reference Indian geography, logistics corridors, and seasonal patterns

Rules:
- NEVER invent financial numbers - use only the data provided
- Keep recommendations under 3 sentences each
- Use rupee amounts as provided (never calculate new ones)
- Be specific about timelines and deadlines
- Reference supplier names and cities directly
"""

ACTION_CARD_PROMPT = """Generate a procurement action card based on this operational data:

SUPPLIER: {supplier_name} ({city}, {state})
RISK SCORE: {risk_score:.0%} ({risk_level})
FINANCIAL EXPOSURE: ₹{exposure_inr:,.0f}
DAYS TO STOCKOUT: {days_to_stockout} days
AFFECTED SKUs: {sku_count} products
DISRUPTION: {disruption_context}
CASCADE IMPACT: {cascade_context}

Generate a JSON response with these fields:
{{
  "title": "concise action title (max 80 chars)",
  "executive_summary": "2-sentence summary for procurement head",
  "reasoning": "why this action is needed (2-3 sentences)",
  "urgency_narrative": "why timing matters (1-2 sentences)",
  "cost_of_delay_narrative": "financial consequence of inaction (1-2 sentences)",
  "recommended_action": "specific next step (1 sentence)",
  "escalation_window": "deadline description (e.g., '48 hours')",
  "alternate_supplier_rationale": "why alternate is recommended if applicable (1 sentence)"
}}"""

EXECUTIVE_BRIEF_PROMPT = """Generate an executive procurement briefing based on this supply chain status:

TOTAL SUPPLIERS AT RISK: {at_risk_count}
TOTAL FINANCIAL EXPOSURE: ₹{total_exposure:,.0f}
CRITICAL STOCKOUTS: {critical_stockouts} SKUs within 3 days
HIGH RISK STOCKOUTS: {high_stockouts} SKUs within 7 days
ACTIVE DISRUPTIONS: {active_disruptions}
ACTIVE CASCADES: {cascade_count}
TOP RISK SUPPLIERS: {top_suppliers}

Generate a JSON response:
{{
  "summary": "3-4 sentence executive briefing suitable for a CFO",
  "top_risks": ["risk 1", "risk 2", "risk 3"],
  "immediate_actions": ["action 1", "action 2", "action 3"]
}}"""

ALTERNATE_SUPPLIER_PROMPT = """Evaluate alternate supplier options for this procurement decision:

PRIMARY SUPPLIER: {primary_name} ({primary_city})
- Reliability: {primary_reliability:.0%}
- Lead Time: {primary_lead_time} days
- Risk Score: {primary_risk:.0%}
- Current Issue: {issue}

ALTERNATE OPTIONS:
{alternates_text}

Generate a JSON response:
{{
  "recommended_alternate": "supplier name",
  "rationale": "2-3 sentence explanation of why this alternate is preferred",
  "trade_offs": "1 sentence on what you give up",
  "transition_timeline": "estimated days to switch"
}}"""


# ============ FALLBACK GENERATORS (when Bedrock unavailable) ============

def _fallback_action_card(
    supplier_name: str, risk_level: str, exposure_inr: float,
    days_to_stockout: int, action_type: str
) -> dict:
    """Rule-based fallback when AI is unavailable."""
    urgency = "immediate" if days_to_stockout <= 3 else "within 48 hours" if days_to_stockout <= 7 else "this week"

    titles = {
        "reorder": f"Emergency reorder required: {supplier_name} supply at risk",
        "switch_supplier": f"Activate alternate supplier: {supplier_name} disrupted",
        "expedite": f"Expedite shipments from {supplier_name}: stockout in {days_to_stockout}d",
        "increase_stock": f"Increase safety stock: {supplier_name} reliability degraded",
    }

    return {
        "title": titles.get(action_type, f"Action required: {supplier_name}"),
        "executive_summary": f"{supplier_name} is at {risk_level} risk with ₹{exposure_inr:,.0f} exposure. {days_to_stockout} days until stockout.",
        "reasoning": f"Supplier risk score indicates {risk_level} severity. Financial exposure of ₹{exposure_inr:,.0f} requires {urgency} action to prevent revenue loss.",
        "urgency_narrative": f"Action needed {urgency}. Delay increases exposure by approximately ₹{exposure_inr * 0.15:,.0f} per day.",
        "cost_of_delay_narrative": f"Each day of inaction adds ₹{exposure_inr * 0.15:,.0f} in potential losses from SLA penalties and lost sales.",
        "recommended_action": f"Initiate {action_type.replace('_', ' ')} process for {supplier_name} immediately.",
        "escalation_window": urgency,
        "alternate_supplier_rationale": "Geographic diversification reduces single-point-of-failure risk." if action_type == "switch_supplier" else "",
    }


def _fallback_executive_brief(
    at_risk_count: int, total_exposure: float,
    critical_stockouts: int, top_suppliers: list[str]
) -> dict:
    """Rule-based executive brief fallback."""
    return {
        "summary": f"Supply chain alert: {at_risk_count} suppliers at elevated risk with ₹{total_exposure:,.0f} total financial exposure. {critical_stockouts} SKUs face critical stockout within 3 days. Immediate procurement action required.",
        "top_risks": [f"{s} - elevated risk" for s in top_suppliers[:3]],
        "immediate_actions": [
            f"Activate alternate suppliers for {critical_stockouts} critical SKUs",
            f"Expedite pending orders from top {min(3, at_risk_count)} risk suppliers",
            "Increase safety stock for festival-sensitive categories",
        ],
    }


# ============ PROCUREMENT AGENT ============

class ProcurementIntelligenceAgent:
    """
    AI-powered procurement recommendation engine.
    
    Synthesizes deterministic risk data into actionable intelligence.
    Falls back to rule-based generation when Bedrock is unavailable.
    """

    async def generate_action_card(
        self,
        supplier_name: str,
        city: str,
        state: str,
        risk_score: float,
        risk_level: str,
        exposure_inr: float,
        days_to_stockout: int,
        sku_count: int,
        disruption_context: str,
        cascade_context: str,
        action_type: str = "reorder",
    ) -> dict:
        """Generate an intelligent ActionCard with AI reasoning."""

        if bedrock.is_available:
            prompt = ACTION_CARD_PROMPT.format(
                supplier_name=supplier_name,
                city=city,
                state=state,
                risk_score=risk_score,
                risk_level=risk_level,
                exposure_inr=exposure_inr,
                days_to_stockout=days_to_stockout,
                sku_count=sku_count,
                disruption_context=disruption_context,
                cascade_context=cascade_context,
            )
            result = await bedrock.invoke_structured(SYSTEM_PROMPT, prompt)
            if result:
                return result

        # Fallback to deterministic generation
        logger.info("Using fallback action card generation")
        return _fallback_action_card(supplier_name, risk_level, exposure_inr, days_to_stockout, action_type)

    async def generate_executive_brief(
        self,
        at_risk_count: int,
        total_exposure: float,
        critical_stockouts: int,
        high_stockouts: int,
        active_disruptions: int,
        cascade_count: int,
        top_suppliers: list[str],
    ) -> dict:
        """Generate executive procurement briefing."""

        if bedrock.is_available:
            prompt = EXECUTIVE_BRIEF_PROMPT.format(
                at_risk_count=at_risk_count,
                total_exposure=total_exposure,
                critical_stockouts=critical_stockouts,
                high_stockouts=high_stockouts,
                active_disruptions=active_disruptions,
                cascade_count=cascade_count,
                top_suppliers=", ".join(top_suppliers[:5]),
            )
            result = await bedrock.invoke_structured(SYSTEM_PROMPT, prompt)
            if result:
                return result

        return _fallback_executive_brief(at_risk_count, total_exposure, critical_stockouts, top_suppliers)

    async def evaluate_alternate_suppliers(
        self,
        primary_name: str,
        primary_city: str,
        primary_reliability: float,
        primary_lead_time: int,
        primary_risk: float,
        issue: str,
        alternates: list[dict],
    ) -> dict:
        """Evaluate and recommend alternate suppliers with reasoning."""

        alternates_text = "\n".join([
            f"- {a['name']} ({a['city']}): Reliability {a['reliability']:.0%}, Lead Time {a['lead_time']}d, Cost Premium {a['cost_premium']:.0%}"
            for a in alternates
        ])

        if bedrock.is_available:
            prompt = ALTERNATE_SUPPLIER_PROMPT.format(
                primary_name=primary_name,
                primary_city=primary_city,
                primary_reliability=primary_reliability,
                primary_lead_time=primary_lead_time,
                primary_risk=primary_risk,
                issue=issue,
                alternates_text=alternates_text,
            )
            result = await bedrock.invoke_structured(SYSTEM_PROMPT, prompt)
            if result:
                return result

        # Fallback: pick highest reliability alternate
        if alternates:
            best = max(alternates, key=lambda a: a["reliability"])
            return {
                "recommended_alternate": best["name"],
                "rationale": f"{best['name']} offers {best['reliability']:.0%} reliability with {best['lead_time']}d lead time. Geographic diversification from {best['city']} reduces concentration risk.",
                "trade_offs": f"{best['cost_premium']:.0%} cost premium vs primary supplier.",
                "transition_timeline": f"{best['lead_time'] + 3} days",
            }
        return {"recommended_alternate": "None available", "rationale": "No alternates configured.", "trade_offs": "", "transition_timeline": "N/A"}


# Singleton
procurement_agent = ProcurementIntelligenceAgent()
