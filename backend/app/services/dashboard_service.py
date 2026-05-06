"""
Dashboard Aggregation Service.

Computes live dashboard metrics by combining:
- Database state (suppliers, SKUs, disruptions)
- Real-time event stream state
- Computed risk scores

This service is the single source of truth for dashboard KPIs.
Future modules will add AI-computed predictions here.
"""

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.supplier import Supplier
from app.models.sku import SKU
from app.models.disruption import Disruption
from app.models.action_card import ActionCard
from app.models.risk import RiskSnapshot
from app.schemas.dashboard import (
    DashboardSummary,
    SupplierHealthSummary,
    InventorySummary,
    DisruptionSummary,
    ActionSummary,
)


class DashboardService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_summary(self) -> DashboardSummary:
        """Compute full dashboard summary from current state."""
        supplier_health = await self._compute_supplier_health()
        inventory = await self._compute_inventory_summary()
        disruptions = await self._compute_disruption_summary()
        actions = await self._compute_action_summary()

        return DashboardSummary(
            supplier_health=supplier_health,
            inventory=inventory,
            disruptions=disruptions,
            actions=actions,
        )

    async def _compute_supplier_health(self) -> SupplierHealthSummary:
        """Aggregate supplier risk levels from risk snapshots."""
        total_q = await self.db.execute(select(func.count(Supplier.id)))
        total = total_q.scalar() or 0

        avg_rel_q = await self.db.execute(select(func.avg(Supplier.reliability_score)))
        avg_reliability = round(avg_rel_q.scalar() or 0.0, 3)

        # Count by risk level from snapshots
        high_q = await self.db.execute(
            select(func.count(RiskSnapshot.id)).where(RiskSnapshot.risk_level == "critical")
        )
        high_risk = high_q.scalar() or 0

        med_q = await self.db.execute(
            select(func.count(RiskSnapshot.id)).where(RiskSnapshot.risk_level.in_(["high", "medium"]))
        )
        medium_risk = med_q.scalar() or 0

        return SupplierHealthSummary(
            total_suppliers=total,
            high_risk_count=high_risk,
            medium_risk_count=medium_risk,
            low_risk_count=max(0, total - high_risk - medium_risk),
            avg_reliability=avg_reliability,
        )

    async def _compute_inventory_summary(self) -> InventorySummary:
        """Compute inventory health metrics."""
        total_q = await self.db.execute(select(func.count(SKU.id)))
        total_skus = total_q.scalar() or 0

        # Critical: stock <= safety_stock
        critical_q = await self.db.execute(
            select(func.count(SKU.id)).where(SKU.current_stock <= SKU.safety_stock)
        )
        critical_stockout = critical_q.scalar() or 0

        # Low stock: stock <= reorder_point
        low_q = await self.db.execute(
            select(func.count(SKU.id)).where(SKU.current_stock <= SKU.reorder_point)
        )
        low_stock = low_q.scalar() or 0

        # Total inventory value
        value_q = await self.db.execute(
            select(func.sum(SKU.current_stock * SKU.unit_cost_inr))
        )
        total_value = round(value_q.scalar() or 0.0, 2)

        return InventorySummary(
            total_skus=total_skus,
            critical_stockout_risk=critical_stockout,
            low_stock_count=low_stock,
            total_inventory_value_inr=total_value,
        )

    async def _compute_disruption_summary(self) -> DisruptionSummary:
        """Compute active disruption metrics."""
        active_q = await self.db.execute(
            select(func.count(Disruption.id)).where(Disruption.is_active == True)
        )
        active = active_q.scalar() or 0

        critical_q = await self.db.execute(
            select(func.count(Disruption.id)).where(
                Disruption.is_active == True,
                Disruption.severity == "critical",
            )
        )
        critical = critical_q.scalar() or 0

        # Count distinct affected suppliers
        affected_q = await self.db.execute(
            select(func.count(func.distinct(Disruption.supplier_id))).where(
                Disruption.is_active == True,
                Disruption.supplier_id.isnot(None),
            )
        )
        affected_suppliers = affected_q.scalar() or 0

        # Average impact score of active disruptions
        avg_impact_q = await self.db.execute(
            select(func.avg(Disruption.impact_score)).where(Disruption.is_active == True)
        )
        avg_impact = round(avg_impact_q.scalar() or 0.0, 3)

        return DisruptionSummary(
            active_disruptions=active,
            critical_disruptions=critical,
            affected_suppliers=affected_suppliers,
            avg_impact_score=avg_impact,
        )

    async def _compute_action_summary(self) -> ActionSummary:
        """Compute pending action metrics."""
        pending_q = await self.db.execute(
            select(func.count(ActionCard.id)).where(ActionCard.is_resolved == False)
        )
        pending = pending_q.scalar() or 0

        critical_q = await self.db.execute(
            select(func.count(ActionCard.id)).where(
                ActionCard.is_resolved == False,
                ActionCard.priority == "critical",
            )
        )
        critical = critical_q.scalar() or 0

        savings_q = await self.db.execute(
            select(func.sum(ActionCard.estimated_impact_inr)).where(
                ActionCard.is_resolved == False
            )
        )
        savings = round(savings_q.scalar() or 0.0, 2)

        return ActionSummary(
            pending_actions=pending,
            critical_actions=critical,
            estimated_savings_inr=savings,
        )
