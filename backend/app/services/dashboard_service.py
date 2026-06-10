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
from app.schemas.dashboard import (
    DashboardSummary,
    SupplierHealthSummary,
    InventorySummary,
    DisruptionSummary,
    ActionSummary,
)
from app.services.risk_intelligence import RiskIntelligenceService


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
        """Aggregate supplier risk levels using the LIVE risk engine (not stale snapshots)."""
        total_q = await self.db.execute(select(func.count(Supplier.id)))
        total = total_q.scalar() or 0

        avg_rel_q = await self.db.execute(select(func.avg(Supplier.reliability_score)))
        avg_reliability = round(avg_rel_q.scalar() or 0.0, 3)

        # Use live risk computation so counts match what the Risks page shows
        risk_svc = RiskIntelligenceService(self.db)
        live_risks = await risk_svc.compute_all_supplier_risks()

        high_risk = sum(1 for r in live_risks if r["risk_level"] == "critical")
        medium_risk = sum(1 for r in live_risks if r["risk_level"] in ("high", "medium"))

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
        """Compute pending action metrics — counts unique suppliers, not individual cards."""
        cards_q = await self.db.execute(
            select(ActionCard).where(ActionCard.is_resolved == False)
        )
        unresolved_cards = cards_q.scalars().all()

        # A supplier is "pending" when it has at least one unresolved card.
        # Count unique supplier IDs so the badge matches the Risks / Pending Actions page count.
        pending_supplier_ids: set = set()
        critical_supplier_ids: set = set()
        savings = 0.0
        for card in unresolved_cards:
            sid = str(card.supplier_id) if card.supplier_id else str(card.id)
            pending_supplier_ids.add(sid)
            if card.priority == "critical":
                critical_supplier_ids.add(sid)
            savings += card.estimated_impact_inr

        return ActionSummary(
            pending_actions=len(pending_supplier_ids),
            critical_actions=len(critical_supplier_ids),
            estimated_savings_inr=round(savings, 2),
        )
