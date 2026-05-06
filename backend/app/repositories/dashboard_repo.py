"""
Dashboard repository - aggregated queries for summary metrics.
"""

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.supplier import Supplier
from app.models.sku import SKU
from app.models.disruption import Disruption
from app.models.action_card import ActionCard


class DashboardRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_supplier_stats(self) -> dict:
        total = await self.db.execute(select(func.count(Supplier.id)))
        avg_rel = await self.db.execute(
            select(func.avg(Supplier.reliability_score))
        )
        return {
            "total": total.scalar() or 0,
            "avg_reliability": round(avg_rel.scalar() or 0, 3),
        }

    async def get_inventory_stats(self) -> dict:
        total = await self.db.execute(select(func.count(SKU.id)))
        low_stock = await self.db.execute(
            select(func.count(SKU.id)).where(
                SKU.current_stock <= SKU.reorder_point
            )
        )
        value = await self.db.execute(
            select(func.sum(SKU.current_stock * SKU.unit_cost_inr))
        )
        return {
            "total_skus": total.scalar() or 0,
            "low_stock_count": low_stock.scalar() or 0,
            "total_value_inr": round(value.scalar() or 0, 2),
        }

    async def get_disruption_stats(self) -> dict:
        active = await self.db.execute(
            select(func.count(Disruption.id)).where(
                Disruption.is_active == True
            )
        )
        critical = await self.db.execute(
            select(func.count(Disruption.id)).where(
                Disruption.is_active == True,
                Disruption.severity == "critical",
            )
        )
        return {
            "active": active.scalar() or 0,
            "critical": critical.scalar() or 0,
        }
