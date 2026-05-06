"""
Dashboard summary schema - aggregated metrics for the main view.
"""

from pydantic import BaseModel


class SupplierHealthSummary(BaseModel):
    total_suppliers: int
    high_risk_count: int
    medium_risk_count: int
    low_risk_count: int
    avg_reliability: float


class InventorySummary(BaseModel):
    total_skus: int
    critical_stockout_risk: int
    low_stock_count: int
    total_inventory_value_inr: float


class DisruptionSummary(BaseModel):
    active_disruptions: int
    critical_disruptions: int
    affected_suppliers: int
    avg_impact_score: float


class ActionSummary(BaseModel):
    pending_actions: int
    critical_actions: int
    estimated_savings_inr: float


class DashboardSummary(BaseModel):
    supplier_health: SupplierHealthSummary
    inventory: InventorySummary
    disruptions: DisruptionSummary
    actions: ActionSummary
