"""
Risk Intelligence API endpoints.

Provides:
- Supplier risk scoring with factor breakdown
- Cascade propagation analysis
- Stockout forecasting
- Financial exposure calculations
- Mitigation simulation
"""

from uuid import UUID
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.services.risk_intelligence import RiskIntelligenceService

router = APIRouter(prefix="/risk", tags=["Risk Intelligence"])


@router.get("/suppliers")
async def get_all_supplier_risks(db: AsyncSession = Depends(get_db)):
    """Get risk scores for all suppliers with factor breakdowns."""
    service = RiskIntelligenceService(db)
    return await service.compute_all_supplier_risks()


@router.get("/suppliers/{supplier_id}")
async def get_supplier_risk(supplier_id: UUID, db: AsyncSession = Depends(get_db)):
    """Get detailed risk analysis for a specific supplier."""
    service = RiskIntelligenceService(db)
    return await service.compute_supplier_risk(supplier_id)


@router.get("/cascade/{supplier_id}")
async def get_cascade_analysis(supplier_id: UUID, db: AsyncSession = Depends(get_db)):
    """Get cascade propagation analysis for a supplier disruption."""
    service = RiskIntelligenceService(db)
    return await service.get_cascade_analysis(supplier_id)


@router.get("/cascades")
async def get_all_cascades(db: AsyncSession = Depends(get_db)):
    """Get cascade analysis for all active disruptions."""
    service = RiskIntelligenceService(db)
    return await service.get_all_cascades()


@router.get("/stockout")
async def get_stockout_forecasts(db: AsyncSession = Depends(get_db)):
    """Get stockout forecasts for all SKUs."""
    service = RiskIntelligenceService(db)
    summary = await service.get_stockout_forecasts()
    return {
        "total_skus": summary.total_skus,
        "critical_count": summary.critical_count,
        "high_count": summary.high_count,
        "total_revenue_at_risk_inr": summary.total_revenue_at_risk_inr,
        "avg_days_to_stockout": summary.avg_days_to_stockout,
        "forecasts": [
            {
                "sku_id": f.sku_id,
                "sku_code": f.sku_code,
                "sku_name": f.sku_name,
                "supplier_name": f.supplier_name,
                "category": f.category,
                "current_stock": f.current_stock,
                "daily_demand": f.daily_demand,
                "adjusted_demand": f.adjusted_demand,
                "days_to_stockout": f.days_to_stockout,
                "projected_stockout_date": f.projected_stockout_date,
                "risk_level": f.risk_level,
                "revenue_at_risk_inr": f.revenue_at_risk_inr,
                "is_critical": f.is_critical,
                "demand_factors": f.demand_factors,
            }
            for f in summary.forecasts
        ],
    }


@router.get("/financial")
async def get_financial_exposure(db: AsyncSession = Depends(get_db)):
    """Get financial exposure summary across all suppliers."""
    service = RiskIntelligenceService(db)
    return await service.get_financial_summary()


@router.get("/mitigation/{supplier_id}")
async def simulate_mitigation(supplier_id: UUID, db: AsyncSession = Depends(get_db)):
    """Simulate mitigation options for a supplier."""
    service = RiskIntelligenceService(db)
    return await service.simulate_mitigation(supplier_id)


@router.get("/financial/{supplier_id}/breakdown")
async def get_financial_breakdown(supplier_id: UUID, db: AsyncSession = Depends(get_db)):
    """
    Return per-component TFE breakdown for a supplier.

    Shows the exact arithmetic behind every number:
    - Revenue at Risk = stock_value × stockout_probability
    - SLA Penalties = historical + projected (₹50/unit/day)
    - Stockout Cost = units_lost × cost × 2.5× multiplier
    - Cascade Amplifier = 1.0 + (tier2_impact × 0.5)
    - Total = (sum of components) × cascade_amplifier
    """
    service = RiskIntelligenceService(db)
    return await service.get_financial_breakdown(supplier_id)


@router.get("/trust/{supplier_id}")
async def get_trust_score(supplier_id: UUID, db: AsyncSession = Depends(get_db)):
    """
    Return composite Trust Score (0–100) for a supplier.

    Components:
      Delivery Reliability (40%) — on-time rate from 30-day delivery history
      AI Confidence        (30%) — signal agreement score from risk engine
      Data Freshness       (20%) — volume of delivery records available
      Guardrail Pass Rate  (10%) — AI outputs validated by Bedrock Guardrails

    Levels: Verified ≥90 · Reliable ≥70 · Moderate ≥50 · Unverified <50
    """
    service = RiskIntelligenceService(db)
    return await service.compute_trust_score(supplier_id)


@router.get("/suppliers/{supplier_id}/history")
async def get_supplier_risk_history(
    supplier_id: UUID,
    days: int = Query(default=30, ge=1, le=90),
    db: AsyncSession = Depends(get_db),
):
    """
    Get risk score history for a supplier over the last N days (1–90).
    Returns a list of {date, risk_score, risk_level} entries suitable
    for sparkline / trend charts in the frontend.
    """
    from app.repositories.supplier_repo import SupplierRepository
    repo = SupplierRepository(db)
    history = await repo.get_risk_history(supplier_id, days=days)
    return {
        "supplier_id": str(supplier_id),
        "days": days,
        "count": len(history),
        "history": history,
    }

