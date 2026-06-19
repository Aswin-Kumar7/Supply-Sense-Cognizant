"""
Disruption schemas for API serialization.
"""
from __future__ import annotations

from typing import Optional
from pydantic import BaseModel
from uuid import UUID
from datetime import date, datetime


class DisruptionResponse(BaseModel):
    id: UUID
    supplier_id: Optional[UUID] = None
    disruption_type: str
    severity: str
    title: str
    description: Optional[str] = None
    start_date: date
    end_date: Optional[date] = None
    impact_score: float
    affected_skus_count: int
    region: Optional[str] = None
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True


class DisruptionTimelineResponse(BaseModel):
    disruptions: list[DisruptionResponse]
    total_active: int
    total_resolved: int
