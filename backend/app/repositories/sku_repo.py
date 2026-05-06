"""
SKU repository - database queries for SKU and inventory data.
"""

from uuid import UUID
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.sku import SKU, AlternateSupplier


class SKURepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_all(self, limit: int = 100, offset: int = 0):
        query = select(SKU).offset(offset).limit(limit)
        result = await self.db.execute(query)
        return result.scalars().all()

    async def get_by_id(self, sku_id: UUID):
        query = select(SKU).where(SKU.id == sku_id)
        result = await self.db.execute(query)
        return result.scalar_one_or_none()

    async def get_by_supplier(self, supplier_id: UUID):
        query = select(SKU).where(SKU.supplier_id == supplier_id)
        result = await self.db.execute(query)
        return result.scalars().all()

    async def get_critical_skus(self):
        query = select(SKU).where(SKU.is_critical == True)
        result = await self.db.execute(query)
        return result.scalars().all()

    async def get_low_stock_skus(self):
        query = select(SKU).where(SKU.current_stock <= SKU.reorder_point)
        result = await self.db.execute(query)
        return result.scalars().all()

    async def get_alternates(self, sku_id: UUID):
        query = select(AlternateSupplier).where(
            AlternateSupplier.sku_id == sku_id
        )
        result = await self.db.execute(query)
        return result.scalars().all()

    async def get_count(self) -> int:
        query = select(func.count(SKU.id))
        result = await self.db.execute(query)
        return result.scalar()
