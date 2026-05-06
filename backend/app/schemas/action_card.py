"""
Action card schemas for API serialization.
"""

from pydantic import BaseModel
from uuid import UUID
from datetime import datetime


class ActionCardResponse(BaseModel):
    id: UUID
    title: str
    description: str | None = None
    action_type: str
    priority: str
    supplier_id: UUID | None = None
    sku_id: UUID | None = None
    estimated_impact_inr: float
    is_resolved: bool
    created_at: datetime
    resolved_at: datetime | None = None

    class Config:
        from_attributes = True


class ActionCardListResponse(BaseModel):
    action_cards: list[ActionCardResponse]
    total: int
    unresolved: int
