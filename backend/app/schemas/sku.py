"""
SKU schemas for API serialization.
"""

from pydantic import BaseModel
from uuid import UUID
from datetime import datetime


class SKUResponse(BaseModel):
    id: UUID
    sku_code: str
    name: str
    category: str
    subcategory: str | None = None
    supplier_id: UUID
    unit_cost_inr: float
    current_stock: int
    reorder_point: int
    safety_stock: int
    daily_demand_avg: int
    is_critical: bool
    created_at: datetime

    class Config:
        from_attributes = True


class SKURiskResponse(BaseModel):
    """SKU with computed risk metrics for the risk table."""
    id: UUID
    sku_code: str
    name: str
    category: str
    supplier_name: str
    current_stock: int
    daily_demand_avg: int
    days_of_stock: int
    stockout_risk: str  # low, medium, high, critical
    unit_cost_inr: float
    is_critical: bool

    class Config:
        from_attributes = True


class SKUListResponse(BaseModel):
    skus: list[SKURiskResponse]
    total: int
