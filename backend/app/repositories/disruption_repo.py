"""
Disruption repository - database queries for disruption events.
"""

from uuid import UUID
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.disruption import Disruption


class DisruptionRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_all(self, limit: int = 50, offset: int = 0):
        query = (
            select(Disruption)
            .order_by(Disruption.start_date.desc())
            .offset(offset)
            .limit(limit)
        )
        result = await self.db.execute(query)
        return result.scalars().all()

    async def get_active(self):
        query = (
            select(Disruption)
            .where(Disruption.is_active == True)
            .order_by(Disruption.impact_score.desc())
        )
        result = await self.db.execute(query)
        return result.scalars().all()

    async def get_by_supplier(self, supplier_id: UUID):
        query = select(Disruption).where(
            Disruption.supplier_id == supplier_id
        )
        result = await self.db.execute(query)
        return result.scalars().all()

    async def get_active_count(self) -> int:
        query = select(func.count(Disruption.id)).where(
            Disruption.is_active == True
        )
        result = await self.db.execute(query)
        return result.scalar()

    async def get_resolved_count(self) -> int:
        query = select(func.count(Disruption.id)).where(
            Disruption.is_active == False
        )
        result = await self.db.execute(query)
        return result.scalar()
