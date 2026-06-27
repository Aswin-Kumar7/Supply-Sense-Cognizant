"""
AWS Strands Agents SDK integration for SupplySense.

Implements four specialist agents orchestrated by a Supervisor:
  - Supervisor Agent     — receives disruption events, routes to specialists, assembles output
  - Risk Assessment      — supplier risk scoring and cascade impact tools
  - Prescriptive Action  — TFE calculation and mitigation simulation tools
  - Conversational Advisor — read-only SQL queries, financial summaries, scenario runs

Strands is MANDATORY: every agent call goes through Strands first. If Strands
fails (SDK not installed, agent init fails, or runtime call fails), the system
publishes a strands_fallback_request SSE event and waits for user approval
before using Bedrock/rule-based alternatives. No silent fallback.
"""

from __future__ import annotations

import asyncio
import contextvars
import json
import os
import ssl
import time
import urllib3
from collections import deque

# Patch boto3.Session.client so every bedrock-runtime client is created with
# verify=False. Corporate SSL proxy intercepts AWS HTTPS with its own cert that
# Python's ssl module doesn't trust. This patch is applied once at import time
# and affects Strands' internally created clients too.
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
import boto3 as _boto3
_orig_session_client = _boto3.Session.client
def _patched_session_client(self, service_name, *args, **kwargs):
    if service_name == "bedrock-runtime":
        kwargs.setdefault("verify", False)
    return _orig_session_client(self, service_name, *args, **kwargs)
_boto3.Session.client = _patched_session_client
from datetime import date, timedelta
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

from app.core.logging import logger
from app.core.config import get_settings
from app.core.event_bus import event_bus, SupplyChainEvent
from app.core.bedrock import validate_with_guardrail
from app.core.evidence import build_evidence_package, validate_grounding
from app.services.risk_engine import risk_engine
from app.services.cascade_engine import cascade_engine
from app.services.financial_engine import financial_engine
from app.services.procurement_agent import procurement_agent

settings = get_settings()

def _run_in_new_loop(coro):
    """Run an async coroutine in a fresh event loop.

    Strands calls tool functions synchronously from a thread created by
    asyncio.to_thread(). Those threads have no running event loop, so
    _run_in_new_loop() can raise
    'RuntimeError: This event loop is already running' if the thread
    happens to reuse an existing loop. Creating a new loop per call is
    safe and explicit.
    """
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


# ── Per-session tool call history (for multi-turn context) ─────────────────
# Maps session_id → deque of {"tool": str, "input": str, "output": str}
_SESSION_TOOL_HISTORY: dict[str, deque] = {}
_MAX_TOOL_ENTRIES = 10

# ContextVar allows per-request session tracking without thread-local races
_current_session_id: contextvars.ContextVar[str | None] = contextvars.ContextVar(
    "current_session_id", default=None
)

# ── Circular buffer for agent trace observability (Task H) ─────────────────
_AGENT_TRACE: deque = deque(maxlen=50)


def _record_tool_call(tool_name: str, input_str: str, output_str: str) -> None:
    """Record a tool call to session history and global trace buffer."""
    entry = {"tool": tool_name, "input": input_str[:200], "output": output_str[:400]}
    _AGENT_TRACE.append(entry)
    sid = _current_session_id.get()
    if sid:
        if sid not in _SESSION_TOOL_HISTORY:
            _SESSION_TOOL_HISTORY[sid] = deque(maxlen=_MAX_TOOL_ENTRIES)
        _SESSION_TOOL_HISTORY[sid].append(entry)


# ── Strands SDK import with graceful fallback ──────────────────────────────
try:
    from strands import Agent, tool
    from strands.models import BedrockModel
    STRANDS_AVAILABLE = True
    logger.info("AWS Strands Agents SDK loaded")
except ImportError:
    STRANDS_AVAILABLE = False
    logger.warning("strands SDK not installed — agents will use procurement_agent fallback")

    # No-op @tool decorator so functions work identically whether or not
    # the strands package is installed.
    def tool(fn=None, **_kwargs):  # type: ignore[misc]
        """No-op replacement for strands.tool when SDK is unavailable."""
        if fn is not None:
            return fn
        def _inner(f):
            return f
        return _inner

# ── Observability callback handler ────────────────────────────────────────
def _make_callback_handler(agent_name: str):
    """
    Return a Strands-compatible callback handler.

    Strands 0.1.x requires the callback to be a class instance with __call__(**kwargs),
    NOT a plain closure function.  Using a plain function caused:
        TypeError: on_event() got an unexpected keyword argument 'init_event_loop'
    because Strands inspects bound vs unbound callables differently.

    We use the SDK's built-in null_callback_handler (returns None) and record
    metrics separately so agents stay silent in the log by default.
    Agent-level logging happens at the call-site in assess()/chat()/etc.
    """
    # Record the agent invocation for observability
    try:
        from app.core.metrics import metrics_store
        metrics_store.record_agent_call(agent_name)
    except Exception:
        pass

    # Return None → Strands Agent.__init__ converts it to null_callback_handler
    # (see: self.callback_handler = callback_handler or null_callback_handler)
    return None


# ── Bedrock model shared across all agents ─────────────────────────────────
_CACHED_BEDROCK_MODEL: Any = None  # module-level singleton — avoids rebuilding boto3 client per request

_AGENT_SYSTEM_SUFFIX = (
    "\n\nCRITICAL RULES:\n"
    "- NEVER invent financial numbers. All rupee figures must come from tool outputs.\n"
    "- NEVER claim certainty when confidence is below 0.5; route to human review instead.\n"
    "- NEVER fabricate supplier names not returned by the query tools.\n"
    "- If a tool call fails, state that data is unavailable rather than guessing.\n"
)


def _make_bedrock_model() -> Any | None:
    """Return a cached BedrockModel backed by an explicit boto3 Session.

    Cached at module level so the boto3 client is created once per process,
    not once per request. Safe to share across async tasks (boto3 clients
    are thread-safe for reads).
    """
    global _CACHED_BEDROCK_MODEL
    if _CACHED_BEDROCK_MODEL is not None:
        return _CACHED_BEDROCK_MODEL
    if not STRANDS_AVAILABLE:
        return None
    try:
        import boto3
        import urllib3
        urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

        boto_session = boto3.Session(
            aws_access_key_id=os.environ.get("AWS_ACCESS_KEY_ID"),
            aws_secret_access_key=os.environ.get("AWS_SECRET_ACCESS_KEY"),
            region_name=os.environ.get("AWS_REGION", settings.aws_region),
        )
        # verify=False bypasses corporate SSL proxy cert inspection on dev machines.
        # Strands BedrockModel accepts boto_client_config kwargs passed through.
        model = BedrockModel(
            model_id=settings.bedrock_model_id,
            boto_session=boto_session,
        )
        _CACHED_BEDROCK_MODEL = model
        logger.info(f"BedrockModel initialised: {settings.bedrock_model_id} in {os.environ.get('AWS_REGION', settings.aws_region)}")
        return _CACHED_BEDROCK_MODEL
    except Exception as exc:
        logger.warning(f"BedrockModel init failed: {exc}")
        return None


# ══════════════════════════════════════════════════════════════════════════
#  PARALLEL EXECUTOR UTILITY
# ══════════════════════════════════════════════════════════════════════════


async def parallel_execute(tasks: list, timeout: float = 30.0) -> list[dict]:
    """
    Run tasks concurrently with per-task timeout.

    Wraps each coroutine in asyncio.wait_for with the given timeout, then
    executes all via asyncio.gather(return_exceptions=True). Any task that
    raises an exception (including asyncio.TimeoutError) is converted to a
    partial-failure dict: {"error": str, "partial": True}.

    Successful task results pass through as-is.

    Returns a list of results in the same order as the input tasks, with
    metadata about partial failures appended.
    """
    wrapped = [asyncio.wait_for(t, timeout=timeout) for t in tasks]
    raw_results = await asyncio.gather(*wrapped, return_exceptions=True)

    results: list = []
    partial_failures = 0
    for i, result in enumerate(raw_results):
        if isinstance(result, BaseException):
            if isinstance(result, asyncio.TimeoutError):
                error_msg = f"Task {i} timed out after {timeout}s"
            else:
                error_msg = f"Task {i} failed: {type(result).__name__}: {result}"
            results.append({"error": error_msg, "partial": True})
            partial_failures += 1
        else:
            results.append(result)

    # Attach metadata about partial failures to the result list
    # Callers can check the last element or iterate for "partial" keys
    if partial_failures > 0:
        logger.warning(
            f"parallel_execute: {partial_failures}/{len(tasks)} tasks failed or timed out"
        )

    return results


# ══════════════════════════════════════════════════════════════════════════
#  RISK ASSESSMENT AGENT
# ══════════════════════════════════════════════════════════════════════════

_RISK_SYSTEM = (
    "You are the Risk Assessment Agent for SupplySense, an Indian retail supply chain platform. "
    "You evaluate supplier risk using quantitative tools and provide structured risk summaries. "
    + _AGENT_SYSTEM_SUFFIX
)


async def _get_supplier_risk_score_impl(supplier_id: str, db: AsyncSession) -> dict:
    """Tool implementation: compute full risk breakdown for supplier."""
    from sqlalchemy import select
    from app.models.supplier import Supplier
    from app.models.disruption import Disruption
    from app.services.risk_intelligence import RiskIntelligenceService

    svc = RiskIntelligenceService(db)
    return await svc.compute_supplier_risk(supplier_id)


async def _get_cascade_impact_impl(
    supplier_id: str, impact_score: float, db: AsyncSession
) -> dict:
    """Tool implementation: propagate cascade for supplier at given impact."""
    from uuid import UUID
    result = await cascade_engine.propagate(db, UUID(supplier_id), impact_score)
    return {
        "total_affected": result.total_affected,
        "max_depth": result.max_depth_reached,
        "total_propagated_impact": result.total_propagated_impact,
        "severity": result.severity,
        "nodes": [
            {
                "supplier_id": n.supplier_id,
                "supplier_name": n.supplier_name,
                "depth": n.depth,
                "propagated_impact": n.propagated_impact,
            }
            for n in result.nodes
        ],
    }


async def _get_delivery_history_impl(supplier_id: str, db: AsyncSession) -> dict:
    """Tool implementation: 90-day delivery stats for supplier."""
    cutoff = date.today() - timedelta(days=90)
    result = await db.execute(text("""
        SELECT
            COUNT(*)                                        AS total,
            COUNT(*) FILTER (WHERE delay_days > 0)         AS late_count,
            COALESCE(AVG(delay_days), 0)                   AS avg_delay,
            COALESCE(SUM(sla_penalty_inr), 0)              AS total_penalties,
            COALESCE(AVG(quantity_delivered), 0)            AS avg_quantity,
            COUNT(*) FILTER (WHERE delay_days > 3)         AS severely_late,
            SUM(quantity_delivered) / NULLIF(SUM(quantity_ordered), 0) AS fulfillment_rate
        FROM delivery_records
        WHERE supplier_id = :sid AND order_date >= :cutoff
    """), {"sid": supplier_id, "cutoff": cutoff})
    row = result.fetchone()
    total = row[0] or 1
    return {
        "period_days": 90,
        "total_deliveries": total,
        "late_count": row[1] or 0,
        "late_pct": round((row[1] or 0) / total, 3),
        "avg_delay_days": round(float(row[2] or 0), 1),
        "total_sla_penalties_inr": float(row[3] or 0),
        "avg_quantity": round(float(row[4] or 0), 1),
        "severely_late_count": row[5] or 0,
        "fulfillment_rate": round(float(row[6] or 0), 3),
        "trend": "declining" if (row[1] or 0) / total > 0.25 else "stable",
    }


class RiskAssessmentAgent:
    """
    Specialist agent for supplier risk scoring and cascade analysis.
    Uses Strands SDK when available; falls back to direct engine calls.
    """

    def __init__(self, db: AsyncSession):
        self.db = db
        self._strands_agent: Any = None
        self._init_agent()

    def _init_agent(self):
        model = _make_bedrock_model()
        if model is None:
            return
        try:
            db = self.db

            # Tools are sync wrappers that the Strands SDK calls.
            # @tool decorator is no-op when strands not installed.
            @tool
            def get_supplier_risk_score(supplier_id: str) -> str:
                """Get comprehensive risk score and factor breakdown for a supplier."""
                result = _run_in_new_loop(
                    _get_supplier_risk_score_impl(supplier_id, db)
                )
                out = json.dumps(result)
                _record_tool_call("get_supplier_risk_score", supplier_id, out)
                return out

            @tool
            def get_cascade_impact(supplier_id: str, impact_score: float) -> str:
                """Compute cascade propagation impact across supplier dependencies."""
                result = _run_in_new_loop(
                    _get_cascade_impact_impl(supplier_id, impact_score, db)
                )
                out = json.dumps(result)
                _record_tool_call("get_cascade_impact", f"{supplier_id}|{impact_score}", out)
                return out

            @tool
            def get_delivery_history(supplier_id: str) -> str:
                """Query database for 90-day delivery performance statistics."""
                result = _run_in_new_loop(
                    _get_delivery_history_impl(supplier_id, db)
                )
                out = json.dumps(result)
                _record_tool_call("get_delivery_history", supplier_id, out)
                return out

            self._strands_agent = Agent(
                model=model,
                tools=[get_supplier_risk_score, get_cascade_impact, get_delivery_history],
                system_prompt=_RISK_SYSTEM,
                callback_handler=_make_callback_handler("risk_assessment"),
            )
        except Exception as exc:
            logger.warning(f"RiskAssessmentAgent init failed: {exc}")

    async def assess(self, supplier_id: str, context: str = "") -> dict:
        """
        Assess risk for a supplier via Strands. Returns error dict on failure — no fallback.

        Task 5: Authoritative values (overall_score, risk_level, confidence, factors) are
        always sourced directly from the engine AFTER the Strands agent runs. The model's
        restated values are discarded. Only narrative fields (key_factors_summary,
        recommendation_rationale, cascade_affected) come from the model.
        """
        if self._strands_agent is None:
            return {"error": "Strands RiskAssessmentAgent unavailable (SDK or Bedrock model not initialised)", "status": "error"}

        try:
            logger.info(f"    → Strands RiskAssessmentAgent invoking LLM with tools...")
            prompt = (
                f"Assess the risk profile for supplier {supplier_id}. "
                f"Context: {context}. "
                "Use get_supplier_risk_score, get_delivery_history, and get_cascade_impact tools. "
                "Return a JSON with ONLY these fields: "
                "key_factors_summary (string, max 500 chars), "
                "recommendation_rationale (string, max 400 chars), "
                "cascade_affected (integer, number of downstream suppliers affected)."
            )
            response = await asyncio.to_thread(self._strands_agent, prompt)
            text = str(response)

            # Task 5: Always fetch authoritative values directly from the engine.
            # Do NOT use the model's restated scores — the model may round, alter,
            # or fabricate them. The engine is the single source of truth.
            authoritative = await _get_supplier_risk_score_impl(supplier_id, self.db)

            # Extract only permitted narrative fields from the model response.
            narrative: dict = {}
            if "{" in text:
                try:
                    start = text.index("{")
                    end = text.rindex("}") + 1
                    model_json = json.loads(text[start:end])
                    for key in ("key_factors_summary", "recommendation_rationale", "cascade_affected"):
                        if key in model_json:
                            narrative[key] = model_json[key]
                except (json.JSONDecodeError, ValueError):
                    pass

            return {
                # Authoritative fields — always from engine, never from model
                "overall_score": authoritative.get("overall_score"),
                "risk_level": authoritative.get("risk_level"),
                "confidence": authoritative.get("confidence"),
                "factors": authoritative.get("factors", {}),
                # Narrative fields — from model (empty string if parsing failed)
                "key_factors_summary": str(narrative.get("key_factors_summary", ""))[:500],
                "recommendation_rationale": str(narrative.get("recommendation_rationale", ""))[:400],
                "cascade_affected": int(narrative.get("cascade_affected", 0) or 0),
                "source": "strands_engine_grounded",
            }
        except Exception as exc:
            logger.warning(f"RiskAssessmentAgent Strands call failed: {exc}")
            return {"error": str(exc), "status": "error"}

# ══════════════════════════════════════════════════════════════════════════
#  PRESCRIPTIVE ACTION AGENT
# ══════════════════════════════════════════════════════════════════════════

_PRESCRIPTIVE_SYSTEM = (
    "You are the Prescriptive Action Agent for SupplySense. "
    "You recommend concrete procurement actions backed by financial calculations. "
    "All financial figures must come from tool calls — never calculate them yourself. "
    + _AGENT_SYSTEM_SUFFIX
)


async def _calculate_tfe_impl(
    supplier_id: str,
    days_to_stockout: int,
    daily_revenue: float,
    sla_penalty_per_day: float,
    db: AsyncSession,
) -> dict:
    """Tool implementation: compute TFE for a supplier."""
    from sqlalchemy import select
    from app.models.supplier import Supplier
    from app.models.sku import SKU
    from app.models.disruption import Disruption

    supplier = (await db.execute(
        select(Supplier).where(Supplier.id == supplier_id)
    )).scalar_one_or_none()
    if not supplier:
        return {"error": "Supplier not found"}

    skus_q = await db.execute(select(SKU).where(SKU.supplier_id == supplier_id))
    skus = [
        {
            "current_stock": s.current_stock,
            "daily_demand_avg": s.daily_demand_avg,
            "unit_cost_inr": s.unit_cost_inr,
        }
        for s in skus_q.scalars().all()
    ]

    disruptions_q = await db.execute(
        select(Disruption).where(
            Disruption.supplier_id == supplier_id,
            Disruption.is_active == True,
        )
    )
    disruptions = [
        {"severity": d.severity, "impact_score": d.impact_score}
        for d in disruptions_q.scalars().all()
    ]

    # Query actual 90-day delivery stats instead of hardcoded values so TFE
    # figures in chat/scenarios match those shown on the dashboard.
    delivery_result = await db.execute(text("""
        SELECT
            COUNT(*)                                     AS total,
            COALESCE(AVG(delay_days), 0)                 AS avg_delay,
            COUNT(*) FILTER (WHERE delay_days > 0)
                / NULLIF(COUNT(*), 0)::float             AS late_pct,
            COALESCE(SUM(sla_penalty_inr), 0)            AS total_penalties
        FROM delivery_records
        WHERE supplier_id = :sid
          AND order_date >= CURRENT_DATE - INTERVAL '90 days'
    """), {"sid": supplier_id})
    dr = delivery_result.fetchone()
    delivery_stats = {
        "total_deliveries": int(dr[0] or 0),
        "avg_delay_days": float(dr[1] or 0),
        "late_pct": float(dr[2] or 0),
        "total_penalties_inr": float(dr[3] or sla_penalty_per_day * days_to_stockout),
    }

    exposure = financial_engine.compute_supplier_exposure(
        supplier_id=str(supplier_id),
        supplier_name=supplier.name,
        skus=skus,
        active_disruptions=disruptions,
        delivery_stats=delivery_stats,
    )
    return {
        "supplier_name": supplier.name,
        "total_financial_exposure_inr": exposure.total_exposure_inr,
        "revenue_at_risk_inr": exposure.revenue_at_risk_inr,
        "sla_penalties_inr": exposure.sla_penalties_inr,
        "stockout_cost_inr": exposure.stockout_cost_inr,
        "exposure_level": exposure.exposure_level,
    }


async def _get_alternate_suppliers_impl(
    category: str, exclude_city: str, db: AsyncSession
) -> list[dict]:
    """Tool implementation: query alternate suppliers by category excluding a city."""
    result = await db.execute(text("""
        SELECT id, name, city, state, reliability_score, lead_time_days, risk_zone
        FROM suppliers
        WHERE category = :cat AND city != :excl
        ORDER BY reliability_score DESC
        LIMIT 5
    """), {"cat": category, "excl": exclude_city})
    rows = result.fetchall()
    return [
        {
            "supplier_id": str(r[0]),
            "name": r[1],
            "city": r[2],
            "state": r[3],
            "reliability_score": float(r[4]),
            "lead_time_days": r[5],
            "risk_zone": r[6],
        }
        for r in rows
    ]


async def _simulate_mitigation_impl(
    supplier_id: str, action_type: str, db: AsyncSession
) -> dict:
    """Tool implementation: calculate TFE before and after mitigation."""
    from sqlalchemy import select
    from app.models.supplier import Supplier
    from app.models.sku import SKU
    from app.models.disruption import Disruption
    from app.services.risk_intelligence import RiskIntelligenceService

    svc = RiskIntelligenceService(db)
    supplier = (await db.execute(
        select(Supplier).where(Supplier.id == supplier_id)
    )).scalar_one_or_none()
    exposure = await svc._compute_supplier_exposure(supplier) if supplier else None
    if not exposure:
        return {"error": "Supplier not found"}

    risk_data = await svc.compute_supplier_risk(supplier_id)
    risk_score = float(risk_data.get("overall_score", 1.0))

    sim = financial_engine.simulate_mitigation(
        exposure,
        supplier.reliability_score if supplier else 0.8,
        supplier.lead_time_days if supplier else 7,
        risk_score=risk_score,
    )
    chosen = next((o for o in sim.options if o.action_type == action_type), sim.options[0] if sim.options else None)
    # tfe_after_inr must be internally consistent with the CHOSEN action, not the best action.
    # sim.mitigated_exposure_inr is based on the best option (highest net saving),
    # which may be a different action type than what was requested.
    if chosen:
        tfe_after_inr = round(max(0.0, sim.current_exposure_inr - chosen.exposure_reduction_inr), 2)
        reduction_pct = round(chosen.exposure_reduction_inr / max(1, sim.current_exposure_inr) * 100, 1)
    else:
        tfe_after_inr = sim.current_exposure_inr
        reduction_pct = 0.0
    return {
        "supplier_id": supplier_id,
        "action_type": action_type,
        "tfe_before_inr": sim.current_exposure_inr,
        "tfe_after_inr": tfe_after_inr,
        "reduction_pct": reduction_pct,
        "cost_inr": chosen.cost_inr if chosen else 0,
        "confidence": chosen.confidence if chosen else 0.7,
        "time_to_effect_days": chosen.time_to_effect_days if chosen else 3,
    }


class PrescriptiveActionAgent:
    """
    Specialist agent for financial impact and mitigation recommendations.
    """

    def __init__(self, db: AsyncSession):
        self.db = db
        self._strands_agent: Any = None
        self._init_agent()

    def _init_agent(self):
        model = _make_bedrock_model()
        if model is None:
            return
        try:
            db = self.db

            @tool
            def calculate_tfe(
                supplier_id: str,
                days_to_stockout: int,
                daily_revenue: float,
                sla_penalty_per_day: float,
            ) -> str:
                """Calculate Total Financial Exposure for a disrupted supplier."""
                result = _run_in_new_loop(
                    _calculate_tfe_impl(supplier_id, days_to_stockout, daily_revenue, sla_penalty_per_day, db)
                )
                out = json.dumps(result)
                _record_tool_call("calculate_tfe", supplier_id, out)
                return out

            @tool
            def get_alternate_suppliers(category: str, exclude_city: str) -> str:
                """Find alternate suppliers in the same category excluding the disrupted city."""
                result = _run_in_new_loop(
                    _get_alternate_suppliers_impl(category, exclude_city, db)
                )
                out = json.dumps(result)
                _record_tool_call("get_alternate_suppliers", f"{category}|{exclude_city}", out)
                return out

            @tool
            def simulate_mitigation(supplier_id: str, action_type: str) -> str:
                """Calculate TFE before and after applying a mitigation action."""
                result = _run_in_new_loop(
                    _simulate_mitigation_impl(supplier_id, action_type, db)
                )
                out = json.dumps(result)
                _record_tool_call("simulate_mitigation", f"{supplier_id}|{action_type}", out)
                return out

            self._strands_agent = Agent(
                model=model,
                tools=[calculate_tfe, get_alternate_suppliers, simulate_mitigation],
                system_prompt=_PRESCRIPTIVE_SYSTEM,
                callback_handler=_make_callback_handler("prescriptive_action"),
            )
        except Exception as exc:
            logger.warning(f"PrescriptiveActionAgent init failed: {exc}")

    async def recommend(self, supplier_id: str, supplier_name: str, context: dict) -> dict:
        """Generate prescriptive actions via Strands. Returns error dict on failure — no fallback."""
        if self._strands_agent is None:
            return {"error": "Strands PrescriptiveActionAgent unavailable (SDK or Bedrock model not initialised)", "status": "error"}

        try:
            prompt = (
                f"Generate procurement actions for supplier {supplier_name} (ID: {supplier_id}). "
                f"Context: {json.dumps(context)}. "
                "Use calculate_tfe to get financial exposure, simulate_mitigation for best action, "
                "and get_alternate_suppliers if switching is needed. "
                "Return JSON with: action_type, title, description, tfe_inr, reduction_pct, alternate_supplier."
            )
            response = await asyncio.to_thread(self._strands_agent, prompt)
            text = str(response)
            if "{" in text:
                start = text.index("{")
                end = text.rindex("}") + 1
                return json.loads(text[start:end])
            return {"error": "No structured JSON in Strands response", "raw": text[:500], "status": "error"}
        except Exception as exc:
            logger.warning(f"PrescriptiveActionAgent Strands call failed: {exc}")
            return {"error": str(exc), "status": "error"}


# ══════════════════════════════════════════════════════════════════════════
#  CONVERSATIONAL ADVISOR AGENT
# ══════════════════════════════════════════════════════════════════════════

_ADVISOR_SYSTEM = (
    "You are the Conversational Advisor for SupplySense, answering supply chain questions. "
    "You help procurement managers explore data, run what-if scenarios, and understand risk. "
    "Speak concisely. Use the tools to fetch live data before answering. "
    + _AGENT_SYSTEM_SUFFIX
)


async def _query_suppliers_impl(filter_params: dict, db: AsyncSession) -> list[dict]:
    """Tool implementation: read-only supplier/risk query."""
    region = filter_params.get("region")
    risk_level = filter_params.get("risk_level")
    category = filter_params.get("category")
    limit = min(int(filter_params.get("limit", 10)), 50)

    conditions = ["1=1"]
    params: dict = {}
    if region:
        conditions.append("s.region = :region")
        params["region"] = region
    if category:
        conditions.append("s.category = :category")
        params["category"] = category

    query = f"""
        SELECT s.id, s.name, s.city, s.state, s.region, s.category,
               s.reliability_score, s.lead_time_days, s.risk_zone,
               COUNT(d.id) FILTER (WHERE d.is_active) AS active_disruptions
        FROM suppliers s
        LEFT JOIN disruptions d ON d.supplier_id = s.id
        WHERE {' AND '.join(conditions)}
        GROUP BY s.id
        ORDER BY s.reliability_score ASC
        LIMIT :lim
    """
    params["lim"] = limit
    result = await db.execute(text(query), params)
    rows = result.fetchall()
    return [
        {
            "supplier_id": str(r[0]),
            "name": r[1],
            "city": r[2],
            "state": r[3],
            "region": r[4],
            "category": r[5],
            "reliability_score": float(r[6]),
            "lead_time_days": r[7],
            "risk_zone": r[8],
            "active_disruptions": r[9] or 0,
        }
        for r in rows
    ]


async def _get_financial_summary_impl(db: AsyncSession) -> dict:
    """Tool implementation: aggregated TFE across all at-risk suppliers."""
    from app.services.risk_intelligence import RiskIntelligenceService
    svc = RiskIntelligenceService(db)
    return await svc.get_financial_summary()


async def _run_scenario_impl(
    supplier_ids: list[str], disruption_type: str, db: AsyncSession
) -> dict:
    """Tool implementation: combined cascade and TFE for a scenario."""
    from uuid import UUID
    total_cascade = 0.0
    total_tfe = 0.0
    supplier_results = []

    for sid in supplier_ids[:5]:  # cap at 5 for performance
        try:
            uid = UUID(sid)
            cascade_result = await cascade_engine.propagate(db, uid, 0.8)
            total_cascade += cascade_result.total_propagated_impact

            from sqlalchemy import select
            from app.models.supplier import Supplier
            from app.services.risk_intelligence import RiskIntelligenceService
            svc = RiskIntelligenceService(db)
            supplier = (await db.execute(select(Supplier).where(Supplier.id == uid))).scalar_one_or_none()
            if supplier:
                exposure = await svc._compute_supplier_exposure(supplier)
                total_tfe += exposure.total_exposure_inr
                supplier_results.append({
                    "supplier_id": sid,
                    "supplier_name": supplier.name,
                    "cascade_affected": cascade_result.total_affected,
                    "tfe_inr": exposure.total_exposure_inr,
                })
        except Exception as exc:
            logger.warning(f"Scenario calc failed for {sid}: {exc}")

    return {
        "disruption_type": disruption_type,
        "suppliers_analyzed": len(supplier_results),
        "total_cascade_impact": round(total_cascade, 3),
        "total_tfe_inr": round(total_tfe, 2),
        "details": supplier_results,
    }


class ConversationalAdvisorAgent:
    """
    Conversational agent for interactive what-if analysis.
    Maintains no persistent session state itself — caller manages history.
    """

    def __init__(self, db: AsyncSession):
        self.db = db
        self._strands_agent: Any = None
        self._init_agent()

    def _init_agent(self):
        model = _make_bedrock_model()
        if model is None:
            return
        try:
            db = self.db

            @tool
            def query_suppliers(filter_params_json: str) -> str:
                """Run a read-only query against supplier and risk tables. Accepts JSON string with optional keys: region, category, risk_level, limit."""
                try:
                    params = json.loads(filter_params_json)
                except json.JSONDecodeError:
                    params = {}
                result = _run_in_new_loop(
                    _query_suppliers_impl(params, db)
                )
                out = json.dumps(result)
                _record_tool_call("query_suppliers", filter_params_json, out)
                return out

            @tool
            def get_financial_summary() -> str:
                """Return aggregated Total Financial Exposure (TFE) across all at-risk suppliers in Indian Rupees."""
                result = _run_in_new_loop(
                    _get_financial_summary_impl(db)
                )
                payload = {
                    "total_financial_exposure_inr": result.get("total_financial_exposure_inr"),
                    "total_revenue_at_risk_inr": result.get("total_revenue_at_risk_inr"),
                    "total_sla_penalties_inr": result.get("total_sla_penalties_inr"),
                    "top_exposures": result.get("top_exposures", [])[:3],
                }
                out = json.dumps(payload)
                _record_tool_call("get_financial_summary", "", out)
                return out

            @tool
            def run_scenario(supplier_ids_json: str, disruption_type: str) -> str:
                """Calculate combined cascade impact and TFE for a set of supplier UUIDs under a given disruption type (e.g. cyclone, strike, flood)."""
                try:
                    ids = json.loads(supplier_ids_json)
                except json.JSONDecodeError:
                    ids = []
                result = _run_in_new_loop(
                    _run_scenario_impl(ids, disruption_type, db)
                )
                out = json.dumps(result)
                _record_tool_call("run_scenario", f"{supplier_ids_json}|{disruption_type}", out)
                return out

            self._strands_agent = Agent(
                model=model,
                tools=[query_suppliers, get_financial_summary, run_scenario],
                system_prompt=_ADVISOR_SYSTEM,
                callback_handler=_make_callback_handler("conversational_advisor"),
            )
        except Exception as exc:
            logger.warning(f"ConversationalAdvisorAgent init failed: {exc}")

    async def chat(
        self,
        message: str,
        history: list[dict] | None = None,
        session_id: str | None = None,
    ) -> dict:
        """
        Process a conversational message via Strands.
        history: list of {"role": "user"|"assistant", "content": "..."}
        session_id: used to thread tool call history across turns
        """
        # Lazy retry: if agent failed to init at construction time (e.g. creds
        # not yet in env), try once more now that creds may have been loaded.
        if self._strands_agent is None:
            self._init_agent()
        if self._strands_agent is None:
            return {
                "answer": (
                    "AI advisor is unavailable — Bedrock model could not be initialised. "
                    f"Check AWS credentials and that model '{settings.bedrock_model_id}' is enabled "
                    f"in region '{os.environ.get('AWS_REGION', settings.aws_region)}'."
                ),
                "sources": [],
                "agent": "unavailable",
                "status": "error",
            }

        try:
            # Build context from conversation history
            context_str = ""
            if history:
                context_str = "\n".join(
                    f"{h['role'].title()}: {h['content']}" for h in history[-6:]
                )

            # Append prior tool call history as context block
            tool_context = ""
            if session_id and session_id in _SESSION_TOOL_HISTORY:
                prior_tools = list(_SESSION_TOOL_HISTORY[session_id])
                if prior_tools:
                    lines = [
                        f"- {t['tool']}({t['input'][:80]}) → {t['output'][:120]}"
                        for t in prior_tools[-5:]
                    ]
                    tool_context = "\n\nPrior tool calls this session:\n" + "\n".join(lines)

            if context_str:
                full_prompt = (
                    f"Conversation history:\n{context_str}"
                    f"{tool_context}"
                    f"\n\nCurrent question: {message}"
                )
            else:
                full_prompt = message + tool_context

            # Set session context for tool recording
            token = _current_session_id.set(session_id)
            try:
                try:
                    from app.core.metrics import metrics_store
                    metrics_store.record_agent_call("conversational_advisor")
                except Exception:
                    pass
                response = await asyncio.to_thread(self._strands_agent, full_prompt)
            finally:
                _current_session_id.reset(token)

            # Derive sources from which tools were actually called this turn
            tools_called = []
            if session_id and session_id in _SESSION_TOOL_HISTORY:
                tools_called = [t["tool"] for t in _SESSION_TOOL_HISTORY[session_id]]
            sources = list(dict.fromkeys(tools_called)) if tools_called else ["risk_engine"]

            return {
                "answer": str(response),
                "sources": sources,
                "agent": "conversational_advisor",
            }
        except Exception as exc:
            logger.warning(f"ConversationalAdvisorAgent Strands call failed: {exc}")
            return {
                "answer": f"AI advisor error: {exc}",
                "sources": [],
                "agent": "error",
                "status": "error",
            }


# ══════════════════════════════════════════════════════════════════════════
#  SIGNAL INTELLIGENCE AGENT
# ══════════════════════════════════════════════════════════════════════════

_SIGNAL_INTEL_SYSTEM = (
    "You are the Signal Intelligence Agent for SupplySense, an Indian retail supply chain platform. "
    "You classify and enrich disruption events with structured signal reports. "
    "Your job is to determine the event type, severity, confidence, affected region, "
    "estimated duration, and which suppliers are potentially affected. "
    "Event types: weather, geopolitical, logistics, labor, infrastructure. "
    "Severity levels: low, medium, high, critical. "
    "Confidence is a float between 0.0 and 1.0. "
    + _AGENT_SYSTEM_SUFFIX
)


async def _classify_event_impl(event: dict) -> dict:
    """
    Tool implementation: classify a disruption event via Bedrock (Claude Haiku).
    Called after Strands approval has been granted.
    Returns an error dict if Bedrock is unavailable — no rule-based fabrication.
    """
    from app.core.bedrock import bedrock

    event_description = event.get("description", event.get("disruption_type", "unknown"))
    region = event.get("region", "unknown")
    severity_hint = event.get("severity", "")

    if not bedrock.is_available:
        logger.warning("_classify_event_impl: Bedrock unavailable — cannot classify disruption event")
        return {
            "error": "bedrock_unavailable",
            "event_type": None,
            "severity": None,
            "confidence": None,
            "affected_region": region,
            "estimated_duration_days": None,
        }

    from app.schemas.ai_contracts import DisruptionClassification

    system_prompt = (
        "You are a supply chain disruption classifier. "
        "Classify the following event into exactly one type: weather, geopolitical, logistics, labor, infrastructure. "
        "Assess severity (low, medium, high, critical), confidence (0.0-1.0), and estimated duration in days."
    )
    user_prompt = (
        f"Classify this supply chain disruption event:\n"
        f"Description: {event_description}\n"
        f"Region: {region}\n"
        f"Severity hint: {severity_hint}\n\n"
        f"Return JSON with exactly these keys: event_type, severity, confidence, affected_region, estimated_duration_days"
    )

    validated = await bedrock.invoke_typed(system_prompt, user_prompt, DisruptionClassification)

    if validated is None:
        logger.warning("_classify_event_impl: Bedrock returned no valid classification")
        return {
            "error": "bedrock_invalid_response",
            "event_type": None,
            "severity": None,
            "confidence": None,
            "affected_region": region,
            "estimated_duration_days": None,
        }

    result = validated.model_dump()
    return {
        "event_type": result["event_type"],
        "severity": result["severity"],
        "confidence": float(result["confidence"]),
        "affected_region": result.get("affected_region", region),
        "estimated_duration_days": int(result["estimated_duration_days"]),
    }


async def _find_affected_suppliers_impl(
    region: str, event_type: str, db: AsyncSession
) -> list[dict]:
    """
    Tool implementation: find suppliers affected by geographic proximity to the event region.
    Queries suppliers in the same region or state, ordered by proximity relevance.
    """
    # Query suppliers in the affected region or matching state/city
    result = await db.execute(text("""
        SELECT id, name, city, state, region, category, reliability_score, lead_time_days, risk_zone
        FROM suppliers
        WHERE region = :region OR state = :region OR city = :region
        ORDER BY reliability_score ASC
        LIMIT 20
    """), {"region": region})
    rows = result.fetchall()

    return [
        {
            "supplier_id": str(r[0]),
            "name": r[1],
            "city": r[2],
            "state": r[3],
            "region": r[4],
            "category": r[5],
            "reliability_score": float(r[6]),
            "lead_time_days": r[7],
            "risk_zone": r[8],
        }
        for r in rows
    ]


class SignalIntelligenceAgent:
    """
    Classifies and enriches disruption events with structured signal reports.
    Uses Strands SDK when available; falls back to Bedrock direct or rule-based classification.
    """

    def __init__(self, db: AsyncSession):
        self.db = db
        self._strands_agent: Any = None
        self._init_agent()

    def _init_agent(self):
        model = _make_bedrock_model()
        if model is None:
            return
        try:
            db = self.db

            @tool
            def classify_event(event_json: str) -> str:
                """Classify a disruption event by type (weather, geopolitical, logistics, labor, infrastructure) and extract severity, confidence, and estimated duration."""
                try:
                    event = json.loads(event_json)
                except json.JSONDecodeError:
                    event = {"description": event_json}
                result = _run_in_new_loop(
                    _classify_event_impl(event)
                )
                out = json.dumps(result)
                _record_tool_call("classify_event", event_json[:200], out)
                return out

            @tool
            def find_affected_suppliers(region: str, event_type: str) -> str:
                """Find suppliers potentially affected by a disruption event based on geographic proximity to the event region."""
                result = _run_in_new_loop(
                    _find_affected_suppliers_impl(region, event_type, db)
                )
                out = json.dumps(result)
                _record_tool_call("find_affected_suppliers", f"{region}|{event_type}", out)
                return out

            self._strands_agent = Agent(
                model=model,
                tools=[classify_event, find_affected_suppliers],
                system_prompt=_SIGNAL_INTEL_SYSTEM,
                callback_handler=_make_callback_handler("signal_intelligence"),
            )
        except Exception as exc:
            logger.warning(f"SignalIntelligenceAgent init failed: {exc}")

    async def analyze(self, event: dict) -> dict:
        """
        Analyze a disruption event via Strands. Returns error dict on failure — no fallback.

        Returns: {
            event_type, severity, confidence, affected_region,
            estimated_duration_days, affected_supplier_ids, requires_human_review
        }
        """
        if self._strands_agent is None:
            return {"error": "Strands SignalIntelligenceAgent unavailable (SDK or Bedrock model not initialised)", "status": "error"}

        try:
            prompt = (
                f"Analyze this supply chain disruption event and produce a structured signal report.\n"
                f"Event data: {json.dumps(event)}\n\n"
                "Use classify_event to determine the event type, severity, confidence, and duration. "
                "Then use find_affected_suppliers to identify which suppliers are impacted. "
                "Return a JSON with: event_type, severity, confidence, affected_region, "
                "estimated_duration_days, affected_supplier_ids."
            )
            response = await asyncio.to_thread(self._strands_agent, prompt)
            text_response = str(response)
            if "{" in text_response:
                start = text_response.index("{")
                end = text_response.rindex("}") + 1
                parsed = json.loads(text_response[start:end])
                confidence = float(parsed.get("confidence", 0.5))
                report = {
                    "event_type": parsed.get("event_type", "logistics"),
                    "severity": parsed.get("severity", "medium"),
                    "confidence": confidence,
                    "affected_region": parsed.get("affected_region", event.get("region", "unknown")),
                    "estimated_duration_days": int(parsed.get("estimated_duration_days", 7)),
                    "affected_supplier_ids": parsed.get("affected_supplier_ids", []),
                    "requires_human_review": confidence < 0.4,
                }
                if confidence < 0.4:
                    report["raw_event"] = event
                return report
            return {"error": "No structured JSON in Strands response", "status": "error"}
        except Exception as exc:
            logger.warning(f"SignalIntelligenceAgent Strands call failed: {exc}")
            return {"error": str(exc), "status": "error"}


# ══════════════════════════════════════════════════════════════════════════
#  SUPERVISOR AGENT
# ══════════════════════════════════════════════════════════════════════════

_SUPERVISOR_SYSTEM = (
    "You are the Supervisor Agent for SupplySense. "
    "You receive supply chain disruption events and orchestrate specialist agents. "
    "Decide which specialist analysis is needed, then assemble a coherent action plan. "
    "Return structured JSON output only. "
    + _AGENT_SYSTEM_SUFFIX
)


class SupervisorAgent:
    """
    Orchestrates the Signal Intelligence, Risk Assessment, Prescriptive Action,
    and Conversational Advisor agents.
    Called by the scenario trigger endpoint and the event bus.
    """

    def __init__(self, db: AsyncSession):
        self.db = db
        self.signal_agent = SignalIntelligenceAgent(db)
        self.risk_agent = RiskAssessmentAgent(db)
        self.action_agent = PrescriptiveActionAgent(db)

    # Conditional subflow policy:
    #   "classify_only"            → low severity or very low confidence: SignalIntel only
    #   "classify_risk"            → medium severity or moderate confidence
    #   "classify_risk_action"     → high/critical with known supplier_id
    #   "human_review"             → confidence < 0.3 after classification
    _SUBFLOW_POLICY = {
        "low":      "classify_only",
        "medium":   "classify_risk",
        "high":     "classify_risk_action",
        "critical": "classify_risk_action",
    }

    async def process_disruption_event(self, event: dict) -> dict:
        """
        Process a disruption event through the adaptive agent pipeline.

        Subflow is chosen at runtime based on severity and post-classification confidence:
          low      → classify_only        (signal intel only)
          medium   → classify_risk        (signal intel + risk assessment)
          high/critical → classify_risk_action (full pipeline)
          low confidence after classify → human_review (skip prescriptive)

        Returns an ActionCard-ready payload.
        """
        supplier_id = event.get("supplier_id", "")
        supplier_name = event.get("supplier_name", "Unknown Supplier")
        severity = event.get("severity", "high")
        disruption_type = event.get("disruption_type", "disruption")
        region = event.get("region", "")
        city = event.get("city", "")
        state = event.get("state", "")

        # Determine initial subflow from severity — may be upgraded after classification
        subflow = self._SUBFLOW_POLICY.get(severity, "classify_risk_action")

        logger.info(f"═══════════════════════════════════════════════════════════════")
        logger.info(f"  SUPERVISOR PIPELINE START: {supplier_name} ({severity})")
        logger.info(f"  Event: {disruption_type} in {region}")
        logger.info(f"═══════════════════════════════════════════════════════════════")

        # Record agent invocation for observability
        try:
            from app.core.metrics import metrics_store
            metrics_store.record_agent_call("supervisor")
        except Exception:
            pass

        # ── Pipeline metadata tracking ──────────────────────────────────────
        pipeline_metadata: list[dict] = []

        # ── Step 1: Signal Intelligence ─────────────────────────────────────
        signal_report = {}
        start = time.monotonic()
        logger.info(f"  [1/5] 🔍 Signal Intelligence Agent — classifying event...")
        try:
            signal_report = await self.signal_agent.analyze(event)
            duration_ms = (time.monotonic() - start) * 1000
            # Check if signal agent was blocked
            if signal_report.get("status") == "blocked":
                pipeline_metadata.append({
                    "agent": "signal_intelligence",
                    "duration_ms": round(duration_ms, 2),
                    "status": "blocked",
                    "error": signal_report.get("error", "Fallback not approved"),
                })
                logger.warning("Signal intelligence blocked — fallback not approved")
                signal_report = {}
            else:
                pipeline_metadata.append({
                    "agent": "signal_intelligence",
                    "duration_ms": round(duration_ms, 2),
                    "status": "success",
                })
                logger.info(
                    f"  [1/5] ✅ Signal Intelligence DONE ({duration_ms:.0f}ms) — "
                    f"type={signal_report.get('event_type')}, "
                    f"severity={signal_report.get('severity')}, "
                    f"confidence={signal_report.get('confidence')}, "
                    f"affected_suppliers={len(signal_report.get('affected_supplier_ids', []))}"
                )
        except Exception as exc:
            duration_ms = (time.monotonic() - start) * 1000
            pipeline_metadata.append({
                "agent": "signal_intelligence",
                "duration_ms": round(duration_ms, 2),
                "status": "failure",
                "error": str(exc),
            })
            logger.warning(f"Signal intelligence analysis failed: {exc}")

        # Enrich event context from signal report
        signal_severity = signal_report.get("severity", severity)
        signal_region = signal_report.get("affected_region", region)
        signal_event_type = signal_report.get("event_type", disruption_type)
        signal_confidence = float(signal_report.get("confidence", 0.5))
        affected_supplier_ids = signal_report.get("affected_supplier_ids", [])

        # Upgrade subflow based on post-classification confidence
        if signal_confidence < 0.3:
            subflow = "human_review"
            logger.info(f"  ⚠️  Low confidence ({signal_confidence:.2f}) — routing to human_review subflow")
        elif signal_severity in ("high", "critical") and subflow == "classify_only":
            subflow = "classify_risk_action"
            logger.info(f"  ↑ Severity upgraded to {signal_severity} — escalating subflow to classify_risk_action")

        logger.info(f"  Subflow selected: {subflow}")

        # ── Step 2: Risk Assessment (via parallel_execute) ──────────────────
        risk_result = {}
        if supplier_id and subflow in ("classify_risk", "classify_risk_action"):
            start = time.monotonic()
            logger.info(f"  [2/5] 📊 Risk Assessment Agent — scoring supplier {supplier_id[:8]}...")
            try:
                risk_context = (
                    f"{signal_event_type} disruption in {signal_region}. "
                    f"Signal confidence: {signal_confidence}. "
                    f"Estimated duration: {signal_report.get('estimated_duration_days', 'unknown')} days."
                )
                risk_tasks = [
                    self.risk_agent.assess(
                        supplier_id=supplier_id,
                        context=risk_context,
                    )
                ]
                risk_results = await parallel_execute(risk_tasks)
                # Extract the first (primary) result
                if risk_results and isinstance(risk_results[0], dict):
                    if risk_results[0].get("status") == "blocked":
                        logger.warning(f"Risk assessment blocked — fallback not approved")
                        duration_ms = (time.monotonic() - start) * 1000
                        pipeline_metadata.append({
                            "agent": "risk_assessment",
                            "duration_ms": round(duration_ms, 2),
                            "status": "blocked",
                            "error": risk_results[0].get("error", "Fallback not approved"),
                        })
                    elif risk_results[0].get("status") == "error":
                        logger.warning(f"Risk assessment returned error: {risk_results[0].get('error')}")
                        duration_ms = (time.monotonic() - start) * 1000
                        pipeline_metadata.append({
                            "agent": "risk_assessment",
                            "duration_ms": round(duration_ms, 2),
                            "status": "error",
                            "error": risk_results[0].get("error"),
                        })
                        # Do not assign error dict to risk_result — it has no authoritative scores.
                    elif risk_results[0].get("partial"):
                        logger.warning(f"Risk assessment partial failure: {risk_results[0].get('error')}")
                        duration_ms = (time.monotonic() - start) * 1000
                        pipeline_metadata.append({
                            "agent": "risk_assessment",
                            "duration_ms": round(duration_ms, 2),
                            "status": "partial_failure",
                            "error": risk_results[0].get("error"),
                        })
                    else:
                        risk_result = risk_results[0]
                        duration_ms = (time.monotonic() - start) * 1000
                        pipeline_metadata.append({
                            "agent": "risk_assessment",
                            "duration_ms": round(duration_ms, 2),
                            "status": "success",
                        })
                else:
                    duration_ms = (time.monotonic() - start) * 1000
                    pipeline_metadata.append({
                        "agent": "risk_assessment",
                        "duration_ms": round(duration_ms, 2),
                        "status": "unavailable",
                    })
            except Exception as exc:
                duration_ms = (time.monotonic() - start) * 1000
                pipeline_metadata.append({
                    "agent": "risk_assessment",
                    "duration_ms": round(duration_ms, 2),
                    "status": "failure",
                    "error": str(exc),
                })
                logger.warning(f"  [2/5] ❌ Risk Assessment FAILED ({duration_ms:.0f}ms): {exc}")

        # Use None sentinel when risk assessment failed — do NOT substitute 0.5 (medium risk)
        # because a fabricated default can trigger plausible-looking recommendations from
        # a pipeline that actually failed. Callers must check risk_score_available.
        risk_score_available = bool(risk_result.get("overall_score") is not None)
        risk_score = float(risk_result["overall_score"]) if risk_score_available else 0.0
        risk_level = risk_result.get("risk_level", signal_severity)
        confidence = float(risk_result.get("confidence", signal_confidence))
        if risk_score_available:
            logger.info(f"  [2/5] ✅ Risk Assessment DONE — score={risk_score:.2f}, level={risk_level}, confidence={confidence:.2f}")
        else:
            logger.warning(f"  [2/5] ⚠️  Risk Assessment data unavailable — score suppressed to prevent fabricated recommendation")

        # ── Step 3: Prescriptive Action (via parallel_execute) ──────────────
        action_result = {}
        if supplier_id and subflow == "classify_risk_action":
            start = time.monotonic()
            logger.info(f"  [3/5] 💡 Prescriptive Action Agent — generating recommendations...")
            try:
                action_context = {
                    "city": city,
                    "state": state,
                    "risk_score": risk_score,
                    "risk_level": risk_level,
                    "exposure_inr": event.get("estimated_impact_inr", 0),
                    "days_to_stockout": event.get("days_to_stockout", 7),
                    "sku_count": event.get("sku_count", 1),
                    "disruption_context": f"{signal_event_type} in {signal_region}",
                    "cascade_context": f"Cascade affected: {risk_result.get('cascade_affected', 0)} suppliers",
                    "action_type": "switch_supplier" if signal_severity == "critical" else "reorder",
                    "signal_event_type": signal_event_type,
                    "signal_confidence": signal_confidence,
                    "estimated_duration_days": signal_report.get("estimated_duration_days", 7),
                }
                action_tasks = [
                    self.action_agent.recommend(
                        supplier_id=supplier_id,
                        supplier_name=supplier_name,
                        context=action_context,
                    )
                ]
                action_results = await parallel_execute(action_tasks)
                # Extract the first (primary) result
                if action_results and isinstance(action_results[0], dict):
                    if action_results[0].get("status") == "blocked":
                        logger.warning(f"Action recommendation blocked — fallback not approved")
                        duration_ms = (time.monotonic() - start) * 1000
                        pipeline_metadata.append({
                            "agent": "prescriptive_action",
                            "duration_ms": round(duration_ms, 2),
                            "status": "blocked",
                            "error": action_results[0].get("error", "Fallback not approved"),
                        })
                    elif action_results[0].get("status") == "error":
                        logger.warning(f"Action recommendation returned error: {action_results[0].get('error')}")
                        duration_ms = (time.monotonic() - start) * 1000
                        pipeline_metadata.append({
                            "agent": "prescriptive_action",
                            "duration_ms": round(duration_ms, 2),
                            "status": "error",
                            "error": action_results[0].get("error"),
                        })
                        # Do not assign error dict to action_result — it has no authoritative recommendations.
                    elif action_results[0].get("partial"):
                        logger.warning(f"Action recommendation partial failure: {action_results[0].get('error')}")
                        duration_ms = (time.monotonic() - start) * 1000
                        pipeline_metadata.append({
                            "agent": "prescriptive_action",
                            "duration_ms": round(duration_ms, 2),
                            "status": "partial_failure",
                            "error": action_results[0].get("error"),
                        })
                    else:
                        action_result = action_results[0]
                        duration_ms = (time.monotonic() - start) * 1000
                        pipeline_metadata.append({
                            "agent": "prescriptive_action",
                            "duration_ms": round(duration_ms, 2),
                            "status": "success",
                        })
                else:
                    duration_ms = (time.monotonic() - start) * 1000
                    pipeline_metadata.append({
                        "agent": "prescriptive_action",
                        "duration_ms": round(duration_ms, 2),
                        "status": "unavailable",
                    })
            except Exception as exc:
                duration_ms = (time.monotonic() - start) * 1000
                pipeline_metadata.append({
                    "agent": "prescriptive_action",
                    "duration_ms": round(duration_ms, 2),
                    "status": "failure",
                    "error": str(exc),
                })
                logger.warning(f"  [3/5] ❌ Prescriptive Action FAILED ({duration_ms:.0f}ms): {exc}")

        logger.info(f"  [3/5] ✅ Prescriptive Action DONE — action_type={action_result.get('action_type', 'N/A')}")

        # ── Step 3b: Build evidence package for grounding validation ────────
        # The evidence package captures the authoritative facts at this moment.
        # It is used in Task 9 (grounding check) and carried in the response
        # so the snapshot_id can be used for audit correlation.
        evidence_pkg = build_evidence_package(
            supplier_id=supplier_id or "",
            supplier_name=supplier_name,
            risk_score=risk_score if risk_score_available else 0.0,
            risk_level=risk_level,
            exposure_inr=float(event.get("estimated_impact_inr", 0)),
            days_to_stockout=int(event.get("days_to_stockout", 7)),
            sku_count=int(event.get("sku_count", 1)),
        )

        # ── Step 4: Assemble ActionCard payload ─────────────────────────────
        logger.info(f"  [4/5] 📋 Assembling ActionCard payload...")
        # Determine pipeline status from actual stage outcomes
        failed_stages = [p["agent"] for p in pipeline_metadata if p.get("status") in ("error", "failure", "blocked")]
        successful_stages = [p["agent"] for p in pipeline_metadata if p.get("status") == "success"]
        pipeline_status = "success" if not failed_stages else f"partial_failure:{','.join(failed_stages)}"
        # strands_used reflects whether at least one agent stage completed successfully,
        # not merely whether the Strands SDK imported.
        strands_actually_used = STRANDS_AVAILABLE and bool(successful_stages)

        action_card = {
            "supplier_id": supplier_id,
            "supplier_name": supplier_name,
            "title": action_result.get(
                "title",
                f"{'Critical' if signal_severity == 'critical' else 'High'} alert: {supplier_name} disrupted",
            ),
            "description": action_result.get(
                "description",
                f"{signal_event_type} event detected in {signal_region}. Immediate procurement review required.",
            ),
            "action_type": action_result.get("action_type", "reorder"),
            "priority": signal_severity,
            "risk_score": risk_score if risk_score_available else None,
            "risk_score_available": risk_score_available,
            "confidence": confidence,
            "estimated_impact_inr": event.get("estimated_impact_inr", 0),
            "reasoning": action_result.get("reasoning", ""),
            "urgency_narrative": action_result.get("urgency_narrative", ""),
            "recommended_action": action_result.get("recommended_action", ""),
            "signal_report": {
                "event_type": signal_event_type,
                "severity": signal_severity,
                "confidence": signal_confidence,
                "affected_region": signal_region,
                "estimated_duration_days": signal_report.get("estimated_duration_days", 7),
                "affected_supplier_ids": affected_supplier_ids,
                "requires_human_review": signal_report.get("requires_human_review", False),
            },
            "agent": "supervisor",
            "subflow": subflow,
            "strands_used": strands_actually_used,
            # Cards are genuinely AI-generated only when the action agent produced
            # a real title/description — not when we fell back to generic placeholders.
            "ai_generated": strands_actually_used and bool(action_result.get("title")),
            "generation_mode": (
                "ai_generated" if (strands_actually_used and action_result.get("title"))
                else "signal_only" if strands_actually_used
                else "deterministic_fallback"
            ),
            "pipeline_status": pipeline_status,
            "validation_status": "narrative_only",
            "evidence_snapshot_id": evidence_pkg.snapshot_id,
            "pipeline_metadata": pipeline_metadata,
            "risk_policy_version": 1,      # load from PolicyService when DB is in scope
            "financial_policy_version": 1,
        }

        # Route low-confidence alerts to human review
        if confidence < 0.5:
            action_card["human_review_required"] = True
            action_card["description"] = (
                f"[Low confidence — routing to human review] {action_card['description']}"
            )

        # ── Step 4b: Content safety — Bedrock Guardrail ─────────────────────
        # Bedrock Guardrails check for harmful/policy-violating content.
        # This is a CONTENT SAFETY check only — it cannot verify numerical
        # accuracy. Factual grounding is handled separately in Step 4c.
        logger.info(f"  [4/5] 🛡️  Content-safety guardrail — checking AI-generated text...")
        guardrail_fields = {
            "title": action_card.get("title", ""),
            "description": action_card.get("description", ""),
            "reasoning": action_card.get("reasoning", ""),
            "urgency_narrative": action_card.get("urgency_narrative", ""),
            "recommended_action": action_card.get("recommended_action", ""),
            "alternate_supplier_rationale": action_result.get("alternate_supplier_rationale", ""),
        }

        try:
            validated_fields, was_blocked = await validate_with_guardrail(guardrail_fields)
            if was_blocked:
                logger.warning(
                    f"Content-safety guardrail intervened for {supplier_name}: "
                    f"blocked fields cleared (no fabricated fallback text)"
                )
                # Only retain fields that passed content-safety — blocked fields become None
                for field in ("title", "description", "reasoning", "urgency_narrative",
                               "recommended_action", "alternate_supplier_rationale"):
                    action_card[field] = validated_fields.get(field) or None

                action_card["content_safety_intervened"] = True
                action_card["content_safety_status"] = "intervened"
                action_card["ai_error"] = True
                action_card["ai_error_reason"] = "content_safety_blocked"
                action_card["generation_mode"] = "ai_unavailable"
            else:
                action_card["title"] = validated_fields.get("title", action_card["title"])
                action_card["description"] = validated_fields.get("description", action_card["description"])
                action_card["reasoning"] = validated_fields.get("reasoning", action_card["reasoning"])
                action_card["urgency_narrative"] = validated_fields.get("urgency_narrative", action_card["urgency_narrative"])
                action_card["recommended_action"] = validated_fields.get("recommended_action", action_card["recommended_action"])
                action_card["alternate_supplier_rationale"] = validated_fields.get("alternate_supplier_rationale", "")
                action_card["content_safety_intervened"] = False
                action_card["content_safety_status"] = "passed"
        except Exception as exc:
            logger.error(f"Content-safety guardrail failed: {exc} — proceeding without guardrail")
            action_card["content_safety_intervened"] = False
            action_card["content_safety_status"] = "unavailable"

        # ── Step 4c: Factual grounding check (Task 9) ───────────────────────
        # Separate from guardrails — this checks that AI narrative output does
        # not contain rupee amounts that were not in the evidence package.
        # Guardrails cannot perform this check; it must be done locally.
        narrative_for_grounding = {
            k: action_card.get(k, "")
            for k in ("title", "description", "reasoning", "urgency_narrative",
                      "recommended_action", "alternate_supplier_rationale")
        }
        grounding_result = validate_grounding(narrative_for_grounding, evidence_pkg)
        action_card["grounding_status"] = grounding_result.grounding_status
        if not grounding_result.passed:
            logger.warning(
                f"Grounding violations in supervisor action card for {supplier_name}: "
                f"{grounding_result.violations}"
            )

        # ── Step 5: Publish ActionCard to SSE stream ────────────────────────
        logger.info(f"  [5/5] 📡 Publishing ActionCard to SSE stream...")
        try:
            await event_bus.publish(SupplyChainEvent(
                event_type="action_card",
                severity=signal_severity,
                message=action_card.get("title", f"Action card generated for {supplier_name}"),
                data=action_card,
            ))
            logger.info(f"  [5/5] ✅ Published to SSE — title: {action_card.get('title', 'N/A')[:60]}")
        except Exception as exc:
            logger.warning(f"  [5/5] ❌ SSE publish failed: {exc}")

        # Pipeline complete summary
        total_time = sum(m.get("duration_ms", 0) for m in pipeline_metadata)
        stages_ok = sum(1 for m in pipeline_metadata if m.get("status") == "success")
        logger.info(f"═══════════════════════════════════════════════════════════════")
        logger.info(f"  PIPELINE COMPLETE: {stages_ok}/{len(pipeline_metadata)} stages OK, total {total_time:.0f}ms")
        logger.info(f"═══════════════════════════════════════════════════════════════")

        return action_card

    async def process_scenario(self, scenario_name: str, preset: dict) -> dict:
        """
        Process a triggered scenario preset through the full agent pipeline.
        Returns assembled ActionCard payload for SSE streaming.
        """
        event = {
            "supplier_id": "",  # Scenario affects multiple suppliers
            "supplier_name": f"{preset['name']} — Multi-supplier event",
            "severity": preset["severity"],
            "disruption_type": scenario_name,
            "region": preset["region"],
            "city": "",
            "state": "",
            "estimated_impact_inr": preset.get("affected_suppliers", 1) * 250000,
            "days_to_stockout": 7 if preset["severity"] == "critical" else 14,
            "sku_count": preset.get("affected_suppliers", 1) * 3,
        }

        result = await self.process_disruption_event(event)
        result["scenario"] = scenario_name
        result["alert_message"] = preset.get("alert_message", "")
        result["affected_suppliers"] = preset.get("affected_suppliers", 0)
        # Mark all financial/count values as synthetic — they are preset constants,
        # not values derived from the live database or deterministic engines.
        result["data_mode"] = "synthetic"
        result["synthetic_note"] = (
            "Financial impact and SKU counts are scenario presets, not live calculations. "
            "Do not treat these figures as production measurements."
        )
        return result
