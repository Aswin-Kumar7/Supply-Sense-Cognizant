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

