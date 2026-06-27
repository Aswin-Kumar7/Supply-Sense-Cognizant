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
from app.services.stockout_engine import stockout_engine


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

            # Delegate risk labeling to the canonical stockout_engine so both
            # /skus and /risk/stockout endpoints use the same thresholds.
            lead_time = getattr(sku, "lead_time_days", None) or 7
            forecast = stockout_engine.forecast_sku(
                sku_id=str(sku.id),
                sku_code=sku.sku_code,
                sku_name=sku.name,
                supplier_name=supplier_name,
                category=sku.category,
                current_stock=sku.current_stock,
                daily_demand=sku.daily_demand_avg,
                unit_cost_inr=float(sku.unit_cost_inr or 0),
                is_critical=bool(sku.is_critical),
                lead_time_days=lead_time,
            )
            stockout_risk = forecast.risk_level

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

