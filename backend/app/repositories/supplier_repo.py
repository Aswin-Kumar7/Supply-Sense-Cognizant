"""
Supplier repository - database queries for supplier data.
"""

from datetime import date, timedelta
from uuid import UUID
from sqlalchemy import select, func, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.supplier import Supplier
from app.models.supplier_dependency import SupplierDependency


class SupplierRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_all(self, limit: int = 100, offset: int = 0):
        query = select(Supplier).offset(offset).limit(limit)
        result = await self.db.execute(query)
        return result.scalars().all()

    async def get_by_id(self, supplier_id: UUID):
        query = select(Supplier).where(Supplier.id == supplier_id)
        result = await self.db.execute(query)
        return result.scalar_one_or_none()

    async def get_risk_inputs(self, supplier_id: UUID) -> dict:
        """Fetch the raw signal data needed to build a risk_breakdown for a supplier."""
        cutoff = date.today() - timedelta(days=30)

        delivery = await self.db.execute(text("""
            SELECT
                COUNT(*) AS total,
                COUNT(*) FILTER (WHERE delay_days > 0) AS late_count,
                COALESCE(AVG(delay_days), 0) AS avg_delay,
                COALESCE(SUM(sla_penalty_inr), 0) AS total_penalties
            FROM delivery_records
            WHERE supplier_id = :sid AND order_date >= :cutoff
        """), {"sid": str(supplier_id), "cutoff": cutoff})
        d = delivery.fetchone()
        total = d[0] or 1
        delivery_stats = {
            "total_deliveries": total,
            "late_count": d[1] or 0,
            "late_pct": (d[1] or 0) / total,
            "avg_delay_days": round(float(d[2] or 0), 1),
            "total_penalties_inr": float(d[3] or 0),
        }

        disruptions = await self.db.execute(text("""
            SELECT severity, impact_score, disruption_type
            FROM disruptions
            WHERE supplier_id = :sid AND is_active = true
        """), {"sid": str(supplier_id)})
        active_disruptions = [
            {"severity": r[0], "impact_score": r[1], "type": r[2]}
            for r in disruptions.fetchall()
        ]

        inv = await self.db.execute(text("""
            SELECT
                COUNT(*) AS total,
                COUNT(*) FILTER (WHERE current_stock <= safety_stock) AS critical,
                COUNT(*) FILTER (WHERE current_stock <= reorder_point) AS low
            FROM skus WHERE supplier_id = :sid
        """), {"sid": str(supplier_id)})
        iv = inv.fetchone()
        iv_total = iv[0] or 1
        inventory_pressure = min(1.0, ((iv[1] or 0) * 0.6 + (iv[2] or 0) * 0.3) / iv_total)

        dep = await self.db.execute(text("""
            SELECT COALESCE(AVG(sd.criticality), 0)
            FROM supplier_dependencies sd
            JOIN disruptions d ON d.supplier_id = sd.depends_on_id AND d.is_active = true
            WHERE sd.supplier_id = :sid
        """), {"sid": str(supplier_id)})
        dependency_exposure = float(dep.scalar() or 0.0)

        return {
            "delivery_stats": delivery_stats,
            "active_disruptions": active_disruptions,
            "inventory_pressure": inventory_pressure,
            "dependency_exposure": dependency_exposure,
        }

    async def get_upcoming_festivals(self, days_ahead: int = 30) -> list[dict]:
        """One query returning all festivals starting within the next days_ahead days."""
        today = date.today()
        cutoff = today + timedelta(days=days_ahead)
        result = await self.db.execute(text("""
            SELECT region, affected_categories, start_date, demand_multiplier
            FROM festival_calendar
            WHERE start_date BETWEEN :today AND :cutoff
            ORDER BY start_date
        """), {"today": today, "cutoff": cutoff})
        return [
            {
                "region": r[0],
                "affected_categories": r[1] or "",
                "start_date": r[2],
                "demand_multiplier": float(r[3] or 1.0),
            }
            for r in result.fetchall()
        ]

    async def get_count(self) -> int:
        query = select(func.count(Supplier.id))
        result = await self.db.execute(query)
        return result.scalar()

    async def get_dependencies(self, supplier_id: UUID):
        query = select(SupplierDependency).where(
            SupplierDependency.supplier_id == supplier_id
        )
        result = await self.db.execute(query)
        return result.scalars().all()

    async def get_all_dependencies(self):
        query = select(SupplierDependency)
        result = await self.db.execute(query)
        return result.scalars().all()

    async def get_by_risk_zone(self, risk_zone: str):
        query = select(Supplier).where(Supplier.risk_zone == risk_zone)
        result = await self.db.execute(query)
        return result.scalars().all()

    async def get_risk_history(self, supplier_id: UUID, days: int = 30) -> list[dict]:
        """Query risk_snapshots for a supplier ordered by snapshot_at (last `days` days)."""
        cutoff = __import__("datetime").date.today() - __import__("datetime").timedelta(days=days)
        result = await self.db.execute(text("""
            SELECT
                risk_score,
                risk_level,
                snapshot_at::date AS snapshot_date
            FROM risk_snapshots
            WHERE supplier_id = :sid
              AND snapshot_at >= :cutoff
            ORDER BY snapshot_at ASC
        """), {"sid": str(supplier_id), "cutoff": cutoff})
        rows = result.fetchall()
        return [
            {
                "date": str(row[2]),
                "risk_score": float(row[0]),
                "risk_level": row[1],
            }
            for row in rows
        ]

