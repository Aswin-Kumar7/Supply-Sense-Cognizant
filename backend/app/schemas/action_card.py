"""
Action card schemas for API serialization.
"""
from __future__ import annotations

from typing import Optional
from pydantic import BaseModel
from uuid import UUID
from datetime import datetime


class ActionCardResponse(BaseModel):
    id: UUID
    title: str
    description: Optional[str] = None
    action_type: str
    priority: str
    supplier_id: Optional[UUID] = None
    sku_id: Optional[UUID] = None
    estimated_impact_inr: float
    is_resolved: bool
    resolution_note: Optional[str] = None
    created_at: datetime
    resolved_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class ActionCardListResponse(BaseModel):
    action_cards: list[ActionCardResponse]
    total: int
    unresolved: int
