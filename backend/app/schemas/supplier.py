"""
Supplier schemas for API serialization.
"""
from __future__ import annotations

from typing import Optional
from pydantic import BaseModel
from uuid import UUID
from datetime import datetime


class SupplierResponse(BaseModel):
    id: UUID
    name: str
    city: str
    state: str
    region: str
    category: str
    tier: int
    reliability_score: float
    lead_time_days: int
    risk_zone: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    created_at: datetime
    risk_breakdown: Optional[dict] = None

    class Config:
        from_attributes = True


class SupplierListResponse(BaseModel):
    suppliers: list[SupplierResponse]
    total: int


class SupplierDependencyResponse(BaseModel):
    id: UUID
    supplier_id: UUID
    depends_on_id: UUID
    dependency_type: str
    criticality: float

    class Config:
        from_attributes = True


class DependencyTreeNode(BaseModel):
    supplier_id: UUID
    supplier_name: str
    tier: int
    dependencies: list["DependencyTreeNode"] = []

    class Config:
        from_attributes = True
