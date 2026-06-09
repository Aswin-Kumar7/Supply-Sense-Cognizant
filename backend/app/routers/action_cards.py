"""
Action card API endpoints.
"""

from datetime import datetime
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.action_card import ActionCard
from app.services.action_card_service import ActionCardService
from app.services.risk_intelligence import RiskIntelligenceService
from app.services.financial_engine import financial_engine
from app.schemas.action_card import ActionCardListResponse, ActionCardResponse

# Maps the highest-firing risk factor to the most appropriate action type
_FACTOR_TO_ACTION: dict[str, str] = {
    'inventory_pressure':      'reorder',
    'festival_proximity':      'increase_safety_stock',
    'delivery_reliability':    'expedite',
    'disruption_severity':     'switch_supplier',
    'logistics_vulnerability': 'switch_supplier',
    'dependency_exposure':     'switch_supplier',
}

def _action_type_from_factors(factors: dict) -> str:
    if not factors:
        return 'reorder'
    top = max(
        factors.items(),
        key=lambda kv: kv[1].get('value', 0) if isinstance(kv[1], dict) else float(kv[1]),
        default=(None, 0),
    )
    return _FACTOR_TO_ACTION.get(top[0] or '', 'reorder')

router = APIRouter(prefix="/actions", tags=["Action Cards"])


@router.get("", response_model=ActionCardListResponse)
async def list_action_cards(
    db: AsyncSession = Depends(get_db),
):
    """List all action cards."""
    service = ActionCardService(db)
    return await service.get_action_cards()


@router.get("/pending", response_model=list[ActionCardResponse])
async def get_pending_actions(
    db: AsyncSession = Depends(get_db),
):
    """Get unresolved action cards."""
    service = ActionCardService(db)
    return await service.get_unresolved_actions()


class SimulateMitigationRequest(BaseModel):
    supplier_id: UUID


@router.post("/simulate-mitigation")
async def simulate_mitigation(
    request: SimulateMitigationRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Simulate mitigation for a supplier and return:
    - original_tfe_inr: current total financial exposure
    - mitigated_tfe_inr: exposure after best mitigation option
    - reduction_pct: percentage reduction
    - actions_taken: list of mitigation options with costs and impact
    """
    service = RiskIntelligenceService(db)
    result = await service.simulate_mitigation(request.supplier_id)

    if "error" in result:
        return result

    reduction_pct = 0.0
    if result["current_exposure_inr"] > 0:
        reduction_pct = round(
            (result["current_exposure_inr"] - result["mitigated_exposure_inr"])
            / result["current_exposure_inr"]
            * 100,
            1,
        )

    return {
        "supplier_id": str(request.supplier_id),
        "original_tfe_inr": result["current_exposure_inr"],
        "mitigated_tfe_inr": result["mitigated_exposure_inr"],
        "reduction_pct": reduction_pct,
        "savings_inr": result["savings_inr"],
        "actions_taken": result["options"],
    }


class ResolveActionRequest(BaseModel):
    resolution_note: str | None = None


@router.patch("/{action_card_id}/resolve")
async def resolve_action_card(
    action_card_id: UUID,
    body: ResolveActionRequest,
    db: AsyncSession = Depends(get_db),
):
    """Mark an action card as resolved and persist the resolution note."""
    result = await db.execute(select(ActionCard).where(ActionCard.id == action_card_id))
    card = result.scalar_one_or_none()
    if not card:
        raise HTTPException(status_code=404, detail="Action card not found")
    card.is_resolved = True
    card.resolved_at = datetime.utcnow()  # TIMESTAMP WITHOUT TIME ZONE — do not use timezone-aware
    # Persist the resolution note (may be None if user provided no free-text)
    note = (body.resolution_note or "").strip() or None
    card.resolution_note = note
    await db.commit()
    return {"status": "resolved", "action_card_id": str(action_card_id)}


@router.patch("/resolve-supplier/{supplier_id}")
async def resolve_all_for_supplier(
    supplier_id: UUID,
    body: ResolveActionRequest,
    db: AsyncSession = Depends(get_db),
):
    """Mark ALL unresolved action cards for a supplier as resolved at once.

    Called when a user completes an action on the mitigation plan page — resolving
    every outstanding card for that supplier ensures the supplier disappears from
    the active risk list on the dashboard and risks page immediately.
    """
    result = await db.execute(
        select(ActionCard).where(
            ActionCard.supplier_id == supplier_id,
            ActionCard.is_resolved == False,
        )
    )
    cards = result.scalars().all()
    if not cards:
        return {"status": "no_cards", "supplier_id": str(supplier_id), "count": 0}

    now = datetime.utcnow()
    note = (body.resolution_note or "").strip() or None
    for card in cards:
        card.is_resolved = True
        card.resolved_at = now
        card.resolution_note = note

    await db.commit()
    return {"status": "resolved", "supplier_id": str(supplier_id), "count": len(cards)}


@router.patch("/{action_card_id}/unresolve")
async def unresolve_action_card(
    action_card_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    """Mark a resolved action card as pending again."""
    result = await db.execute(select(ActionCard).where(ActionCard.id == action_card_id))
    card = result.scalar_one_or_none()
    if not card:
        raise HTTPException(status_code=404, detail="Action card not found")
    card.is_resolved = False
    card.resolved_at = None
    await db.commit()
    return {"status": "unresolved", "action_card_id": str(action_card_id)}


@router.patch("/unresolve-supplier/{supplier_id}")
async def unresolve_all_for_supplier(
    supplier_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    """Mark ALL resolved action cards for a supplier as pending again.

    Called when a user toggles a resolved supplier back to pending from
    PendingActionsPage — ensures every card for that supplier is reopened,
    not just the representative one.
    """
    result = await db.execute(
        select(ActionCard).where(
            ActionCard.supplier_id == supplier_id,
            ActionCard.is_resolved == True,
        )
    )
    cards = result.scalars().all()
    if not cards:
        return {"status": "no_cards", "supplier_id": str(supplier_id), "count": 0}

    for card in cards:
        card.is_resolved = False
        card.resolved_at = None
        card.resolution_note = None

    await db.commit()
    return {"status": "unresolved", "supplier_id": str(supplier_id), "count": len(cards)}


@router.get("/{action_card_id}/cost-of-delay")
async def cost_of_delay(
    action_card_id: UUID,
    delay_days: int = 3,
    db: AsyncSession = Depends(get_db),
):
    """
    Return the financial cost of delaying action on a given action card.
    Uses the action card's supplier_id to fetch live exposure, then
    calls financial_engine.compute_delay_cost() and
    financial_engine.compute_three_scenario_delay() — no LLM involved.
    """
    from app.services.cascade_engine import cascade_engine

    # Fetch the action card
    result = await db.execute(
        select(ActionCard).where(ActionCard.id == action_card_id)
    )
    card = result.scalar_one_or_none()
    if not card:
        raise HTTPException(status_code=404, detail="Action card not found")

    if not card.supplier_id:
        # No supplier attached — use card's estimated_impact_inr as proxy
        from app.services.financial_engine import SupplierExposure
        proxy_exposure = SupplierExposure(
            supplier_id=str(action_card_id),
            supplier_name="(action card)",
            revenue_at_risk_inr=card.estimated_impact_inr * 0.5,
            sla_penalties_inr=card.estimated_impact_inr * 0.2,
            stockout_cost_inr=card.estimated_impact_inr * 0.3,
            mitigation_cost_inr=0.0,
            total_exposure_inr=card.estimated_impact_inr,
            exposure_level="high",
        )
        delay_data = financial_engine.compute_delay_cost(proxy_exposure, delay_days)
        delay_data["action_card_id"] = str(action_card_id)
        delay_data["three_scenarios"] = financial_engine.compute_three_scenario_delay(
            proxy_exposure, cascade_impact=0.0
        )
        return delay_data

    # Compute live supplier exposure
    svc = RiskIntelligenceService(db)
    exposure = await svc._compute_supplier_exposure_by_id(card.supplier_id)
    if not exposure:
        raise HTTPException(status_code=404, detail="Supplier exposure not available")

    # Fetch cascade impact for worst-case scenario
    try:
        cascade_result = await cascade_engine.propagate(db, card.supplier_id, 0.8)
        cascade_impact = cascade_result.total_propagated_impact
    except Exception:
        cascade_impact = 0.0

    delay_data = financial_engine.compute_delay_cost(exposure, delay_days)
    delay_data["action_card_id"] = str(action_card_id)
    delay_data["three_scenarios"] = financial_engine.compute_three_scenario_delay(
        exposure, cascade_impact=cascade_impact
    )
    return delay_data


@router.post("/sync-risks")
async def sync_action_cards_with_risks(db: AsyncSession = Depends(get_db)):
    """
    Idempotent sync: ensure every medium/high/critical supplier has an unresolved
    action card. Called on app load so Pending Actions always mirrors the Risks page.
    Skips suppliers that already have at least one unresolved card.
    """
    risk_svc = RiskIntelligenceService(db)
    all_risks = await risk_svc.compute_all_supplier_risks()

    actionable = [r for r in all_risks if r["risk_level"] in ("critical", "high", "medium")]

    # Skip any supplier that has EVER had a card (resolved or not).
    # Only create cards for suppliers with zero history — this prevents re-adding
    # suppliers the user has already resolved.
    all_cards = (await db.execute(select(ActionCard))).scalars().all()
    covered = {str(c.supplier_id) for c in all_cards if c.supplier_id}

    created = []
    for risk in actionable:
        sid = risk["supplier_id"]
        if sid in covered:
            continue

        action_type = _action_type_from_factors(risk.get("factors", {}))
        exposure = await risk_svc._compute_supplier_exposure_by_id(UUID(sid))
        estimated_impact = exposure.total_exposure_inr if exposure else 0.0

        # No financial stake — skip. ₹0 exposure means either cost data is missing
        # for this supplier's SKUs or stock is healthy enough that there's nothing to mitigate.
        if estimated_impact == 0.0:
            continue

        # Build a human-readable description from fired factors
        factors = risk.get("factors", {}) or {}
        fired = [
            k for k, v in factors.items()
            if (v.get("value", 0) if isinstance(v, dict) else float(v)) > 0.4
        ]
        factor_text = ", ".join(fired).replace("_", " ") if fired else "multiple risk signals"

        card = ActionCard(
            title=f"{risk['supplier_name']} — {risk['risk_level'].capitalize()} risk requires attention",
            description=(
                f"{risk['supplier_name']} is scoring {round(risk['overall_score'] * 100)}% risk "
                f"({risk['risk_level']} level). Key signals: {factor_text}. "
                f"Review and take action to reduce exposure."
            ),
            action_type=action_type,
            priority=risk["risk_level"],
            supplier_id=UUID(sid),
            estimated_impact_inr=estimated_impact,
        )
        db.add(card)
        covered.add(sid)
        created.append(sid)

    if created:
        await db.commit()

    return {"synced": len(created), "already_covered": len(actionable) - len(created)}

