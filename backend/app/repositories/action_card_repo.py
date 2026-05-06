"""
Action card repository - database queries for action recommendations.
"""

from uuid import UUID
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.action_card import ActionCard


class ActionCardRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_all(self, limit: int = 50, offset: int = 0):
        query = (
            select(ActionCard)
            .order_by(ActionCard.created_at.desc())
            .offset(offset)
            .limit(limit)
        )
        result = await self.db.execute(query)
        return result.scalars().all()

    async def get_unresolved(self):
        query = (
            select(ActionCard)
            .where(ActionCard.is_resolved == False)
            .order_by(ActionCard.created_at.desc())
        )
        result = await self.db.execute(query)
        return result.scalars().all()

    async def get_by_priority(self, priority: str):
        query = select(ActionCard).where(ActionCard.priority == priority)
        result = await self.db.execute(query)
        return result.scalars().all()

    async def get_unresolved_count(self) -> int:
        query = select(func.count(ActionCard.id)).where(
            ActionCard.is_resolved == False
        )
        result = await self.db.execute(query)
        return result.scalar()

    async def get_critical_count(self) -> int:
        query = select(func.count(ActionCard.id)).where(
            ActionCard.is_resolved == False,
            ActionCard.priority == "critical",
        )
        result = await self.db.execute(query)
        return result.scalar()
