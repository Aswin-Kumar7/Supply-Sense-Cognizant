"""
Procurement Orchestration Service.

Coordinates the full procurement intelligence pipeline:
1. Fetch deterministic risk data (from Module 4 engines)
2. Feed into AI procurement agent for reasoning
3. Produce prioritized ActionCards with narratives
4. Generate executive briefings

This is the main entry point for Module 5 API endpoints.
"""

import asyncio
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.supplier import Supplier
from app.models.disruption import Disruption
from app.models.action_card import ActionCard
from app.services.risk_intelligence import RiskIntelligenceService
from app.services.procurement_agent import procurement_agent
from app.core.logging import logger

# Permitted AI-generated narrative fields — AI must never overwrite these with
# authoritative values like risk_score, financial_exposure_inr, or priority.
_ACTION_CARD_NARRATIVE_KEYS = frozenset({
    "title", "executive_summary", "reasoning", "urgency_narrative",
    "cost_of_delay_narrative", "recommended_action", "escalation_window",
    "alternate_supplier_rationale",
})
_EXEC_BRIEF_NARRATIVE_KEYS = frozenset({"summary", "top_risks", "immediate_actions"})
_ALTERNATE_NARRATIVE_KEYS = frozenset({
    "recommended_alternate", "rationale", "trade_offs", "transition_timeline",
})

# Human-readable verb per action_type, used to explain the chosen action.
_ACTION_VERB = {
    "switch_supplier": "switch to an alternate supplier",
    "expedite": "expedite open purchase orders",
    "increase_safety_stock": "raise safety-stock cover",
    "increase_stock": "raise safety-stock cover",
    "reorder": "place an immediate replenishment order",
    "substitute_sku": "activate substitute SKUs",
}


def _build_action_rationale(action_type: str, factors: dict, days_to_stockout: int) -> str:
    """
    A short, ALWAYS-present, grounded justification for the chosen action_type.

    It states the actual decision basis — the supplier's dominant risk signals —
    so a human can validate WHY this action was selected, even when the AI
    narrative is unavailable. Uses only real engine factor values (no fabrication).
    """
    fired = sorted(
        (
            (k, (v.get("value", 0) if isinstance(v, dict) else float(v or 0)))
            for k, v in (factors or {}).items()
        ),
        key=lambda kv: kv[1],
        reverse=True,
    )
    top = [(k.replace("_", " "), val) for k, val in fired if val > 0.3][:2]
    if top:
        basis = " and ".join(f"{name} ({val:.0%})" for name, val in top)
        signal_word = "signals are" if len(top) > 1 else "signal is"
    else:
        basis = "elevated overall risk"
        signal_word = "signal is"
    verb = _ACTION_VERB.get(action_type, (action_type or "act").replace("_", " "))
    urgency = (
        f", and only ~{days_to_stockout} days of stock cover remain"
        if days_to_stockout and days_to_stockout < 14 else ""
    )
    return f"Recommended to {verb} because the dominant risk {signal_word} {basis}{urgency}."


class ProcurementService:
    """Orchestrates procurement intelligence generation."""

    def __init__(self, db: AsyncSession):
        self.db = db
        self.risk_service = RiskIntelligenceService(db)

    async def generate_action_cards(self) -> list[dict]:
        """
        AI-enhance canonical ActionCard rows from the DB.

        sync-risks (action_cards router) is the single source of truth for
        which suppliers need action and what their priority/action_type is.
        This method reads those unresolved DB rows and overlays AI narratives
        on top, ensuring the procurement view is always in sync with the risk
        view instead of independently recomputing a divergent card set.
        """
        # Step 1: Read canonical unresolved cards (created by sync-risks)
        cards_q = await self.db.execute(
            select(ActionCard).where(ActionCard.is_resolved == False)
        )
        db_cards = cards_q.scalars().all()
        if not db_cards:
            return []

        # Step 2: Fetch supplementary data once (outside the per-card loop)
        financial = await self.risk_service.get_financial_summary()
        exposure_map = {e["supplier_id"]: e for e in financial["top_exposures"]}

        stockout_summary = await self.risk_service.get_stockout_forecasts()
        stockout_by_supplier: dict = {}
        for f in stockout_summary.forecasts:
            stockout_by_supplier.setdefault(f.supplier_name, []).append(f)

        disruptions_q = await self.db.execute(
            select(Disruption).where(Disruption.is_active == True)
        )
        disruption_by_supplier = {}
        for d in disruptions_q.scalars().all():
            sid = str(d.supplier_id) if d.supplier_id else None
            if sid:
                disruption_by_supplier[sid] = f"{d.disruption_type}: {d.title} (severity: {d.severity})"

        cascades = await self.risk_service.get_all_cascades()
        cascade_map = {c["source_supplier_id"]: c for c in cascades}

        # Risk factors (cached) → grounds the always-present action rationale so a
        # human can see WHY each action_type was chosen.
        all_risks = await self.risk_service.compute_all_supplier_risks()
        factor_map = {r["supplier_id"]: r.get("factors", {}) for r in all_risks}

        # priority → approximate risk_score (used only to prompt the AI — never exposed to UI)
        _PRIORITY_SCORE = {"critical": 0.85, "high": 0.65, "medium": 0.45, "low": 0.2}

        # Step 3: Collect per-card inputs (DB queries — must stay sequential)
        card_inputs = []
        for card in db_cards:
            if not card.supplier_id:
                continue

            supplier_id = str(card.supplier_id)
            supplier = (await self.db.execute(
                select(Supplier).where(Supplier.id == card.supplier_id)
            )).scalar_one_or_none()
            if not supplier:
                continue

            exposure = exposure_map.get(supplier_id, {})
            exposure_inr = exposure.get("total_exposure_inr", card.estimated_impact_inr or 0)
            if exposure_inr == 0:
                continue

            supplier_stockouts = stockout_by_supplier.get(supplier.name, [])
            min_days = min((s.days_to_stockout for s in supplier_stockouts), default=30)
            sku_count = len(supplier_stockouts) or 1

            disruption_ctx = disruption_by_supplier.get(supplier_id, "No active disruption")
            cascade = cascade_map.get(supplier_id)
            cascade_ctx = (
                f"{cascade['total_affected']} downstream suppliers affected, "
                f"propagated impact: {cascade['total_propagated_impact']:.2f}"
                if cascade else "No cascade detected"
            )

            risk_level = card.priority or "medium"
            risk_score = _PRIORITY_SCORE.get(risk_level, 0.45)

            card_inputs.append({
                "supplier_id": supplier_id,
                "supplier": supplier,
                "card": card,
                "exposure_inr": exposure_inr,
                "min_days": min_days,
                "sku_count": sku_count,
                "risk_level": risk_level,
                "risk_score": risk_score,
                "disruption_ctx": disruption_ctx,
                "cascade_ctx": cascade_ctx,
            })

        # Step 4: Generate AI narratives with BOUNDED concurrency.
        # Firing all N cards at Bedrock at once (e.g. after a cache bust) throttles
        # Nova Lite and most calls fail. A small semaphore keeps us under the rate
        # limit; each card has its own timeout and failures are isolated so one
        # slow/throttled card can't poison the rest.
        _ai_unavailable = {
            "generation_mode": "ai_unavailable", "ai_generated": False,
            "ai_error": True, "ai_error_reason": "throttled_or_timeout",
        }
        _sem = asyncio.Semaphore(3)

        async def _gen_card(inp) -> dict:
            async with _sem:
                try:
                    return await asyncio.wait_for(
                        procurement_agent.generate_action_card(
                            supplier_name=inp["supplier"].name,
                            city=inp["supplier"].city,
                            state=inp["supplier"].state,
                            risk_score=inp["risk_score"],
                            risk_level=inp["risk_level"],
                            exposure_inr=inp["exposure_inr"],
                            days_to_stockout=inp["min_days"],
                            sku_count=inp["sku_count"],
                            disruption_context=inp["disruption_ctx"],
                            cascade_context=inp["cascade_ctx"],
                            action_type=inp["card"].action_type or "reorder",
                        ),
                        timeout=20.0,
                    )
                except Exception as exc:
                    logger.warning(f"action card AI gen failed for {inp['supplier'].name}: {exc}")
                    return dict(_ai_unavailable)

        ai_results = await asyncio.gather(*[_gen_card(inp) for inp in card_inputs])

        # Step 5: Assemble final cards
        action_cards = []
        for inp, ai_card in zip(card_inputs, ai_results):
            supplier = inp["supplier"]
            supplier_id = inp["supplier_id"]

            # Only pull narrative keys — AI must never overwrite authoritative fields.
            # Exclude None values so missing AI narratives leave fields absent (not null).
            ai_narratives = {
                k: v for k, v in ai_card.items()
                if k in _ACTION_CARD_NARRATIVE_KEYS and v is not None
            }

            action_cards.append({
                # Canonical DB identity and state (always set last so AI cannot override)
                "id": supplier_id,
                "supplier_id": supplier_id,
                "supplier_name": supplier.name,
                "city": supplier.city,
                "region": supplier.region,
                "category": supplier.category,
                "action_type": inp["card"].action_type or "reorder",
                # Always-present, grounded "why this action" for human validation
                "action_rationale": _build_action_rationale(
                    inp["card"].action_type or "reorder",
                    factor_map.get(supplier_id, {}),
                    inp["min_days"],
                ),
                "priority": inp["risk_level"],
                "financial_exposure_inr": inp["exposure_inr"],
                "days_to_stockout": inp["min_days"],
                "affected_skus": inp["sku_count"],
                "is_resolved": inp["card"].is_resolved,
                # AI narrative overlay (omitted keys mean AI did not produce them)
                **ai_narratives,
                # AI status metadata — always present
                "generation_mode": ai_card.get("generation_mode", "ai_unavailable"),
                "ai_generated": ai_card.get("ai_generated", False),
                "ai_error": ai_card.get("ai_error", False),
                "ai_error_reason": ai_card.get("ai_error_reason"),
                "evidence_snapshot_id": ai_card.get("evidence_snapshot_id"),
                "validation_status": "narrative_filtered",
            })

        priority_order = {"critical": 0, "high": 1, "medium": 2, "low": 3}
        action_cards.sort(key=lambda c: (priority_order.get(c["priority"], 4), -c["financial_exposure_inr"]))
        return action_cards

    async def generate_executive_brief(self) -> dict:
        """Generate executive procurement briefing from current state."""
        # Gather metrics
        risks = await self.risk_service.compute_all_supplier_risks()
        stockout = await self.risk_service.get_stockout_forecasts()
        financial = await self.risk_service.get_financial_summary()
        cascades = await self.risk_service.get_all_cascades()

        at_risk = [r for r in risks if r["overall_score"] >= 0.15]
        top_suppliers = [r["supplier_name"] for r in at_risk[:5]]

        brief = await procurement_agent.generate_executive_brief(
            at_risk_count=len(at_risk),
            total_exposure=financial["total_financial_exposure_inr"],
            critical_stockouts=stockout.critical_count,
            high_stockouts=stockout.high_count,
            active_disruptions=len([r for r in risks if r["factors"].get("disruption_severity", {}).get("value", 0) > 0]),
            cascade_count=len(cascades),
            top_suppliers=top_suppliers,
        )

        brief_narratives = {
            k: v for k, v in brief.items()
            if k in _EXEC_BRIEF_NARRATIVE_KEYS and v is not None
        }

        return {
            # Deterministic metrics — always set last so AI cannot overwrite them
            "at_risk_suppliers": len(at_risk),
            "total_exposure_inr": financial["total_financial_exposure_inr"],
            "critical_stockouts": stockout.critical_count,
            "high_stockouts": stockout.high_count,
            "cascade_count": len(cascades),
            "avg_days_to_stockout": stockout.avg_days_to_stockout,
            # AI-generated narrative fields only (absent if AI unavailable)
            **brief_narratives,
            # AI status metadata
            "generation_mode": brief.get("generation_mode", "ai_unavailable"),
            "ai_generated": brief.get("ai_generated", False),
            "ai_error": brief.get("ai_error", False),
            "ai_error_reason": brief.get("ai_error_reason"),
            "generated_at": datetime.now(timezone.utc).isoformat(),
        }

    async def get_alternate_supplier_recommendation(self, supplier_id: str) -> dict:
        """Get AI-evaluated alternate supplier recommendation."""
        supplier = (await self.db.execute(
            select(Supplier).where(Supplier.id == supplier_id)
        )).scalar_one_or_none()

        if not supplier:
            from fastapi import HTTPException
            raise HTTPException(status_code=404, detail="Supplier not found")

        # Get disruption context
        disruption_q = await self.db.execute(
            select(Disruption).where(
                Disruption.supplier_id == supplier_id,
                Disruption.is_active == True,
            )
        )
        disruptions = disruption_q.scalars().all()
        issue = disruptions[0].title if disruptions else "Elevated risk score"

        # Find potential alternates (same category, different region)
        alternates_q = await self.db.execute(
            select(Supplier).where(
                Supplier.category == supplier.category,
                Supplier.id != supplier.id,
                Supplier.reliability_score >= 0.75,
            )
        )
        alternates = [
            {
                "name": s.name,
                "city": s.city,
                "reliability": s.reliability_score,
                "lead_time": s.lead_time_days,
                "cost_premium": 0.15 if s.region != supplier.region else 0.05,
            }
            for s in alternates_q.scalars().all()
        ]

        result = await procurement_agent.evaluate_alternate_suppliers(
            primary_name=supplier.name,
            primary_city=supplier.city,
            primary_reliability=supplier.reliability_score,
            primary_lead_time=supplier.lead_time_days,
            primary_risk=round(1.0 - supplier.reliability_score, 2),
            issue=issue,
            alternates=alternates,
        )

        alternate_narratives = {k: v for k, v in result.items() if k in _ALTERNATE_NARRATIVE_KEYS}

        return {
            "primary_supplier": {
                "id": str(supplier.id),
                "name": supplier.name,
                "city": supplier.city,
                "reliability": supplier.reliability_score,
            },
            "alternates_evaluated": len(alternates),
            **alternate_narratives,
        }

