"""
Supplier schemas for API serialization.
"""

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
    risk_zone: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    created_at: datetime
    # XAI tooltip: each factor's raw value, weighted contribution, and explanation
    risk_breakdown: dict | None = None

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
