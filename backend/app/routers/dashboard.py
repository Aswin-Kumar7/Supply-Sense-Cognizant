"""
Dashboard API endpoints - aggregated metrics and live state.
"""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.schemas.dashboard import DashboardSummary
from app.services.dashboard_service import DashboardService
from app.services.supplier_service import SupplierService
from app.services.risk_intelligence import RiskIntelligenceService

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


@router.get("/summary", response_model=DashboardSummary)
async def get_dashboard_summary(db: AsyncSession = Depends(get_db)):
    """Get aggregated dashboard metrics from current state."""
    service = DashboardService(db)
    return await service.get_summary()


@router.get("/overview")
async def get_overview(db: AsyncSession = Depends(get_db)):
    """
    Aggregated overview combining executive brief, supplier list, and stockout summary.

    Pulls the executive brief through the procurement cache so the dashboard
    does not trigger redundant Bedrock calls on every page load.
    """
    from app.routers import procurement as procurement_router

    supplier_service = SupplierService(db)
    risk_service = RiskIntelligenceService(db)

    suppliers = await supplier_service.get_all_suppliers()
    stockout_summary = await risk_service.get_stockout_forecasts()

    async def _brief_coro():
        from app.services.procurement_service import ProcurementService
        svc = ProcurementService(db)
        return await svc.generate_executive_brief()

    brief = await procurement_router._get_or_generate("dashboard_brief", 300, _brief_coro)

    return {
        "executive_brief": brief,
        "suppliers": suppliers,
        "stockout": {
            "total_skus": stockout_summary.total_skus,
            "critical_count": stockout_summary.critical_count,
            "high_count": stockout_summary.high_count,
            "total_revenue_at_risk_inr": stockout_summary.total_revenue_at_risk_inr,
            "avg_days_to_stockout": stockout_summary.avg_days_to_stockout,
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
                for f in stockout_summary.forecasts
            ],
        },
    }
