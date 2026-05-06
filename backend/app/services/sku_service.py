"""
SKU service - business logic for inventory and SKU risk.
"""

from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.repositories.sku_repo import SKURepository
from app.models.sku import SKU
from app.models.supplier import Supplier
from app.schemas.sku import SKURiskResponse, SKUListResponse
from app.core.exceptions import NotFoundError


class SKUService:
    def __init__(self, db: AsyncSession):
        self.repo = SKURepository(db)
        self.db = db

    async def get_sku_risk_table(
        self, limit: int = 100, offset: int = 0
    ) -> SKUListResponse:
        skus = await self.repo.get_all(limit=limit, offset=offset)
        total = await self.repo.get_count()

        risk_skus = []
        for sku in skus:
            # Fetch supplier name
            result = await self.db.execute(
                select(Supplier.name).where(Supplier.id == sku.supplier_id)
            )
            supplier_name = result.scalar() or "Unknown"

            # Compute days of stock
            days_of_stock = (
                sku.current_stock // sku.daily_demand_avg
                if sku.daily_demand_avg > 0
                else 999
            )

            # Determine risk level
            stockout_risk = self._compute_stockout_risk(sku, days_of_stock)

            risk_skus.append(
                SKURiskResponse(
                    id=sku.id,
                    sku_code=sku.sku_code,
                    name=sku.name,
                    category=sku.category,
                    supplier_name=supplier_name,
                    current_stock=sku.current_stock,
                    daily_demand_avg=sku.daily_demand_avg,
                    days_of_stock=days_of_stock,
                    stockout_risk=stockout_risk,
                    unit_cost_inr=sku.unit_cost_inr,
                    is_critical=sku.is_critical,
                )
            )

        return SKUListResponse(skus=risk_skus, total=total)

    def _compute_stockout_risk(self, sku: SKU, days_of_stock: int) -> str:
        if days_of_stock <= 3:
            return "critical"
        elif days_of_stock <= 7:
            return "high"
        elif days_of_stock <= 14:
            return "medium"
        return "low"
