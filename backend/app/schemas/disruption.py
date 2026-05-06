"""
Disruption schemas for API serialization.
"""

from pydantic import BaseModel
from uuid import UUID
from datetime import date, datetime


class DisruptionResponse(BaseModel):
    id: UUID
    supplier_id: UUID
    disruption_type: str
    severity: str
    title: str
    description: str | None = None
    start_date: date
    end_date: date | None = None
    impact_score: float
    affected_skus_count: int
    region: str | None = None
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True


class DisruptionTimelineResponse(BaseModel):
    disruptions: list[DisruptionResponse]
    total_active: int
    total_resolved: int
