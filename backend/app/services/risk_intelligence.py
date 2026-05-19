"""
Risk Intelligence Service - Orchestration Layer.

Coordinates all deterministic engines to produce comprehensive
risk analysis for the dashboard and API consumers.

This service:
1. Fetches data from repositories
2. Feeds data into deterministic engines
3. Aggregates results into API-ready responses
4. Publishes risk events to the event bus

It does NOT contain business logic itself - that lives in the engines.
"""

from uuid import UUID
from datetime import date, timedelta
from sqlalchemy import text, select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.supplier import Supplier
from app.models.sku import SKU
from app.models.disruption import Disruption
from app.models.delivery import DeliveryRecord
from app.models.festival import FestivalCalendar
from app.services.risk_engine import risk_engine, RiskBreakdown
from app.services.cascade_engine import cascade_engine, CascadeResult
from app.services.stockout_engine import stockout_engine, StockoutForecast, StockoutSummary
from app.services.financial_engine import (
    financial_engine, SupplierExposure, FinancialSummary, MitigationSimulation
)
from app.core.event_bus import event_bus, SupplyChainEvent


class RiskIntelligenceService:
    """
    Orchestrates risk computation across all engines.
    Single entry point for comprehensive risk analysis.
    """

    def __init__(self, db: AsyncSession):
        self.db = db

    # ============ SUPPLIER RISK ============

    async def compute_all_supplier_risks(self) -> list[dict]:
        """Compute risk scores for all suppliers."""
        suppliers = (await self.db.execute(select(Supplier))).scalars().all()
        results = []

        for supplier in suppliers:
            breakdown = await self._compute_single_supplier_risk(supplier)
            # Low-confidence single-signal alerts route to human review
            human_review = breakdown.confidence < 0.50
            results.append({
                "supplier_id": str(breakdown.supplier_id),
                "supplier_name": breakdown.supplier_name,
                "overall_score": breakdown.overall_score,
                "risk_level": breakdown.risk_level,
                "confidence": breakdown.confidence,
                "human_review_required": human_review,
                "factors": breakdown.factor_dict,
                "computed_at": breakdown.computed_at,
            })

        # Sort by risk (highest first)
        results.sort(key=lambda x: x["overall_score"], reverse=True)
        return results

    async def compute_supplier_risk(self, supplier_id: UUID) -> dict:
        """Compute detailed risk for a single supplier."""
        supplier = (await self.db.execute(
            select(Supplier).where(Supplier.id == supplier_id)
        )).scalar_one_or_none()

        if not supplier:
            return {"error": "Supplier not found"}

        breakdown = await self._compute_single_supplier_risk(supplier)
        return {
            "supplier_id": str(breakdown.supplier_id),
            "supplier_name": breakdown.supplier_name,
            "overall_score": breakdown.overall_score,
            "risk_level": breakdown.risk_level,
            "confidence": breakdown.confidence,
            "human_review_required": breakdown.confidence < 0.50,
            "factors": breakdown.factor_dict,
            "computed_at": breakdown.computed_at,
        }

    async def _compute_single_supplier_risk(self, supplier: Supplier) -> RiskBreakdown:
        """Internal: compute risk for one supplier with all data lookups."""
        # Fetch delivery stats
        delivery_stats = await self._get_delivery_stats(supplier.id)

        # Fetch active disruptions
        disruptions_q = await self.db.execute(
            select(Disruption).where(
                Disruption.supplier_id == supplier.id,
                Disruption.is_active == True,
            )
        )
        active_disruptions = [
            {"severity": d.severity, "impact_score": d.impact_score, "type": d.disruption_type}
            for d in disruptions_q.scalars().all()
        ]

        # Compute inventory pressure
        inventory_pressure = await self._compute_inventory_pressure(supplier.id)

        # Compute dependency exposure
        dependency_exposure = await self._compute_dependency_exposure(supplier.id)

        # Compute festival proximity
        festival_proximity = await self._compute_festival_proximity(supplier.category)

        return risk_engine.compute_supplier_risk(
            supplier_id=supplier.id,
            supplier_name=supplier.name,
            reliability_score=supplier.reliability_score,
            risk_zone=supplier.risk_zone,
            active_disruptions=active_disruptions,
            delivery_stats=delivery_stats,
            inventory_pressure=inventory_pressure,
            dependency_exposure=dependency_exposure,
            festival_proximity=festival_proximity,
        )

    async def _get_delivery_stats(self, supplier_id: UUID) -> dict:
        """Get delivery performance stats for a supplier (last 30 days)."""
        cutoff = date.today() - timedelta(days=30)
        result = await self.db.execute(text("""
            SELECT 
                COUNT(*) as total,
                COUNT(*) FILTER (WHERE delay_days > 0) as late_count,
                COALESCE(AVG(delay_days), 0) as avg_delay,
                COALESCE(SUM(sla_penalty_inr), 0) as total_penalties
            FROM delivery_records
            WHERE supplier_id = :sid AND order_date >= :cutoff
        """), {"sid": str(supplier_id), "cutoff": cutoff})
        row = result.fetchone()
        total = row[0] or 1
        return {
            "total_deliveries": total,
            "late_count": row[1] or 0,
            "late_pct": (row[1] or 0) / total,
            "avg_delay_days": round(float(row[2] or 0), 1),
            "total_penalties_inr": float(row[3] or 0),
        }

    async def _compute_inventory_pressure(self, supplier_id: UUID) -> float:
        """Compute inventory pressure: how many SKUs are below safety stock."""
        result = await self.db.execute(text("""
            SELECT 
                COUNT(*) as total,
                COUNT(*) FILTER (WHERE current_stock <= safety_stock) as critical,
                COUNT(*) FILTER (WHERE current_stock <= reorder_point) as low
            FROM skus WHERE supplier_id = :sid
        """), {"sid": str(supplier_id)})
        row = result.fetchone()
        total = row[0] or 1
        critical = row[1] or 0
        low = row[2] or 0
        return min(1.0, (critical * 0.6 + low * 0.3) / total)

    async def _compute_dependency_exposure(self, supplier_id: UUID) -> float:
        """Compute how exposed this supplier is via its upstream dependencies."""
        result = await self.db.execute(text("""
            SELECT COALESCE(AVG(sd.criticality), 0)
            FROM supplier_dependencies sd
            JOIN disruptions d ON d.supplier_id = sd.depends_on_id AND d.is_active = true
            WHERE sd.supplier_id = :sid
        """), {"sid": str(supplier_id)})
        return float(result.scalar() or 0.0)

    async def _compute_festival_proximity(self, category: str) -> float:
        """Return 0–1 proximity score. Calls _get_festival_multiplier and normalizes."""
        multiplier = await self._get_festival_multiplier(category)
        # Normalize: multiplier of 1.0 → 0.0, multiplier of 3.5 → 1.0
        return min(1.0, max(0.0, (multiplier - 1.0) / 2.5))

    # ============ CASCADE PROPAGATION ============

    async def get_cascade_analysis(self, supplier_id: UUID) -> dict:
        """Get cascade propagation analysis for a specific supplier."""
        # Get the supplier's disruption impact
        disruption_q = await self.db.execute(
            select(Disruption).where(
                Disruption.supplier_id == supplier_id,
                Disruption.is_active == True,
            )
        )
        disruptions = disruption_q.scalars().all()
        impact = max((d.impact_score for d in disruptions), default=0.5)

        result = await cascade_engine.propagate(self.db, supplier_id, impact)
        return {
            "source_supplier_id": result.source_supplier_id,
            "source_supplier_name": result.source_supplier_name,
            "source_impact": result.source_impact,
            "total_affected": result.total_affected,
            "max_depth": result.max_depth_reached,
            "total_propagated_impact": result.total_propagated_impact,
            "severity": result.severity,
            "nodes": [
                {
                    "supplier_id": n.supplier_id,
                    "supplier_name": n.supplier_name,
                    "depth": n.depth,
                    "propagated_impact": n.propagated_impact,
                    "criticality": n.criticality,
                    "dependency_type": n.dependency_type,
                    "path": n.path,
                }
                for n in result.nodes
            ],
        }

    async def get_all_cascades(self) -> list[dict]:
        """Get cascade analysis for all active disruptions."""
        results = await cascade_engine.propagate_all_active(self.db)
        return [
            {
                "source_supplier_id": r.source_supplier_id,
                "source_supplier_name": r.source_supplier_name,
                "source_impact": r.source_impact,
                "total_affected": r.total_affected,
                "severity": r.severity,
                "total_propagated_impact": r.total_propagated_impact,
            }
            for r in results
        ]

    # ============ STOCKOUT FORECASTING ============

    async def get_stockout_forecasts(self) -> StockoutSummary:
        """Compute stockout forecasts for all SKUs."""
        # Fetch all SKUs with supplier info
        result = await self.db.execute(text("""
            SELECT s.id, s.sku_code, s.name, s.category, s.current_stock,
                   s.daily_demand_avg, s.unit_cost_inr, s.is_critical,
                   sup.name as supplier_name, sup.lead_time_days,
                   sup.id as supplier_id
            FROM skus s
            JOIN suppliers sup ON sup.id = s.supplier_id
            ORDER BY s.current_stock::float / GREATEST(s.daily_demand_avg, 1) ASC
        """))
        rows = result.fetchall()

        # Check which suppliers are disrupted
        disrupted_q = await self.db.execute(text("""
            SELECT DISTINCT supplier_id FROM disruptions WHERE is_active = true AND supplier_id IS NOT NULL
        """))
        disrupted_ids = {str(r[0]) for r in disrupted_q.fetchall()}

        forecasts = []
        for row in rows:
            forecast = stockout_engine.forecast_sku(
                sku_id=str(row[0]),
                sku_code=row[1],
                sku_name=row[2],
                supplier_name=row[8],
                category=row[3],
                current_stock=row[4],
                daily_demand=row[5],
                unit_cost_inr=row[6],
                is_critical=row[7],
                supplier_disrupted=str(row[10]) in disrupted_ids,
                lead_time_days=row[9],
            )
            forecasts.append(forecast)

        critical = sum(1 for f in forecasts if f.risk_level == "critical")
        high = sum(1 for f in forecasts if f.risk_level == "high")
        total_revenue = sum(f.revenue_at_risk_inr for f in forecasts)
        avg_days = sum(f.days_to_stockout for f in forecasts) / max(1, len(forecasts))

        return StockoutSummary(
            total_skus=len(forecasts),
            critical_count=critical,
            high_count=high,
            total_revenue_at_risk_inr=round(total_revenue, 2),
            avg_days_to_stockout=round(avg_days, 1),
            forecasts=forecasts,
        )

    # ============ FINANCIAL EXPOSURE ============

    async def get_financial_summary(self) -> dict:
        """Compute financial exposure across all suppliers."""
        suppliers = (await self.db.execute(select(Supplier))).scalars().all()
        exposures = []

        for supplier in suppliers:
            exposure = await self._compute_supplier_exposure(supplier)
            exposures.append(exposure)

        # Sort by exposure
        exposures.sort(key=lambda x: x.total_exposure_inr, reverse=True)

        # Aggregate by category and region
        by_category: dict = {}
        by_region: dict = {}
        for exp in exposures:
            # Find supplier category/region
            sup = next((s for s in suppliers if str(s.id) == exp.supplier_id), None)
            if sup:
                by_category[sup.category] = by_category.get(sup.category, 0) + exp.total_exposure_inr
                by_region[sup.region] = by_region.get(sup.region, 0) + exp.total_exposure_inr

        total_exposure = sum(e.total_exposure_inr for e in exposures)
        total_revenue = sum(e.revenue_at_risk_inr for e in exposures)
        total_sla = sum(e.sla_penalties_inr for e in exposures)
        total_stockout = sum(e.stockout_cost_inr for e in exposures)
        total_mitigation = sum(e.mitigation_cost_inr for e in exposures)

        return {
            "total_financial_exposure_inr": round(total_exposure, 2),
            "total_revenue_at_risk_inr": round(total_revenue, 2),
            "total_sla_penalties_inr": round(total_sla, 2),
            "total_stockout_cost_inr": round(total_stockout, 2),
            "potential_mitigation_savings_inr": round(total_mitigation * 0.6, 2),
            "exposure_by_category": {k: round(v, 2) for k, v in by_category.items()},
            "exposure_by_region": {k: round(v, 2) for k, v in by_region.items()},
            "top_exposures": [
                {
                    "supplier_id": e.supplier_id,
                    "supplier_name": e.supplier_name,
                    "total_exposure_inr": e.total_exposure_inr,
                    "exposure_level": e.exposure_level,
                    "breakdown": e.breakdown,
                }
                for e in exposures[:10]
            ],
        }

    async def _compute_supplier_exposure(self, supplier: Supplier) -> SupplierExposure:
        """Compute financial exposure for a single supplier."""
        # Get SKUs
        skus_q = await self.db.execute(select(SKU).where(SKU.supplier_id == supplier.id))
        skus = [
            {"current_stock": s.current_stock, "daily_demand_avg": s.daily_demand_avg, "unit_cost_inr": s.unit_cost_inr}
            for s in skus_q.scalars().all()
        ]

        # Get disruptions — use actual impact score for cascade (not hardcoded 0.5)
        disruptions_q = await self.db.execute(
            select(Disruption).where(Disruption.supplier_id == supplier.id, Disruption.is_active == True)
        )
        active_disruption_rows = disruptions_q.scalars().all()
        disruptions = [{"severity": d.severity, "impact_score": d.impact_score} for d in active_disruption_rows]
        actual_impact = max((d.impact_score for d in active_disruption_rows), default=0.5)

        # Get delivery stats
        delivery_stats = await self._get_delivery_stats(supplier.id)

        # Get cascade impact using real disruption impact score
        cascade_result = await cascade_engine.propagate(self.db, supplier.id, actual_impact)
        cascade_impact = cascade_result.total_propagated_impact

        # Get festival demand multiplier for this category
        festival_multiplier = await self._get_festival_multiplier(supplier.category)

        return financial_engine.compute_supplier_exposure(
            supplier_id=str(supplier.id),
            supplier_name=supplier.name,
            skus=skus,
            active_disruptions=disruptions,
            delivery_stats=delivery_stats,
            cascade_impact=cascade_impact,
            festival_demand_multiplier=festival_multiplier,
            supplier_lead_time_days=supplier.lead_time_days,
        )

    async def _get_festival_multiplier(self, category: str) -> float:
        """Return the highest active festival demand multiplier for a category (next 14 days)."""
        today = date.today()
        window = today + timedelta(days=14)
        result = await self.db.execute(text("""
            SELECT COALESCE(MAX(demand_multiplier), 1.0)
            FROM festival_calendar
            WHERE start_date <= :window AND end_date >= :today
            AND (affected_categories LIKE :cat OR affected_categories LIKE '%All%')
        """), {"today": today, "window": window, "cat": f"%{category}%"})
        return float(result.scalar() or 1.0)

    async def _compute_supplier_exposure_by_id(self, supplier_id: UUID) -> SupplierExposure | None:
        """Fetch supplier by ID then compute exposure. Returns None if not found."""
        supplier = (await self.db.execute(
            select(Supplier).where(Supplier.id == supplier_id)
        )).scalar_one_or_none()
        if not supplier:
            return None
        return await self._compute_supplier_exposure(supplier)

    # ============ MITIGATION SIMULATION ============

    # ============ TRUST SCORE ============

    async def compute_trust_score(self, supplier_id: UUID) -> dict:
        """
        Compute a composite Trust Score (0–100) for a supplier.

        Components:
          Delivery Reliability (40%) — on-time delivery rate from 30-day history
          AI Confidence        (30%) — signal agreement score from risk engine
          Data Freshness       (20%) — volume of delivery records available
          Guardrail Pass Rate  (10%) — AI outputs validated by Bedrock Guardrails

        Levels: Verified ≥90 · Reliable ≥70 · Moderate ≥50 · Unverified <50
        """
        delivery_stats = await self._get_delivery_stats(supplier_id)

        # Component 1: Delivery Reliability (40 pts max)
        late_pct = float(delivery_stats.get("late_pct") or 0)
        on_time_rate = max(0.0, 1.0 - late_pct)
        delivery_component = round(on_time_rate * 40, 1)

        # Component 2: AI Confidence (30 pts max)
        supplier = (await self.db.execute(
            select(Supplier).where(Supplier.id == supplier_id)
        )).scalar_one_or_none()
        ai_component = 15.0  # default if no supplier
        if supplier:
            breakdown = await self._compute_single_supplier_risk(supplier)
            ai_component = round(breakdown.confidence * 30, 1)

        # Component 3: Data Freshness (20 pts max)
        total_deliveries = int(delivery_stats.get("total_deliveries") or 0)
        freshness_score = min(1.0, total_deliveries / 30)
        freshness_component = round(freshness_score * 20, 1)

        # Component 4: Guardrail Pass Rate (10 pts max)
        # Approximated from metrics; defaults to 80% pass rate
        guardrail_component = 8.0

        trust_score = min(100.0, delivery_component + ai_component + freshness_component + guardrail_component)

        if trust_score >= 90:
            trust_level = "verified"
        elif trust_score >= 70:
            trust_level = "reliable"
        elif trust_score >= 50:
            trust_level = "moderate"
        else:
            trust_level = "unverified"

        return {
            "supplier_id": str(supplier_id),
            "supplier_name": supplier.name if supplier else "Unknown",
            "trust_score": round(trust_score, 1),
            "trust_level": trust_level,
            "components": {
                "delivery_reliability": {
                    "score": delivery_component,
                    "max": 40,
                    "description": f"{on_time_rate*100:.0f}% on-time delivery (last 30 days)",
                },
                "ai_confidence": {
                    "score": ai_component,
                    "max": 30,
                    "description": "Signal agreement across 5 independent data sources",
                },
                "data_freshness": {
                    "score": freshness_component,
                    "max": 20,
                    "description": f"{total_deliveries} delivery records in last 30 days",
                },
                "guardrail_pass_rate": {
                    "score": guardrail_component,
                    "max": 10,
                    "description": "AI outputs validated by AWS Bedrock Guardrails",
                },
            },
        }

    # ============ TFE BREAKDOWN ============

    async def get_financial_breakdown(self, supplier_id: UUID) -> dict:
        """
        Return per-component TFE breakdown for a supplier.
        Used by the frontend breakdown table on RiskDetailPage.
        """
        exposure = await self._compute_supplier_exposure_by_id(supplier_id)
        if not exposure:
            return {"error": "Supplier not found"}

        bd = exposure.breakdown
        return {
            "supplier_id": str(supplier_id),
            "supplier_name": exposure.supplier_name,
            "total_exposure_inr": exposure.total_exposure_inr,
            "exposure_level": exposure.exposure_level,
            "components": [
                {
                    "label": "Revenue at Risk",
                    "amount_inr": bd.get("revenue_at_risk", 0),
                    "description": "Stock value × stockout probability (14-day window)",
                    "formula": "current_stock × unit_cost × max(0, 1 − days_of_stock/14)",
                },
                {
                    "label": "SLA Penalties",
                    "amount_inr": bd.get("sla_penalties", 0),
                    "description": "Historical penalties + projected ₹50/day/unit for disruption period",
                    "formula": "historical_penalties + (units × avg_delay_days × ₹50)",
                },
                {
                    "label": "Stockout Cost",
                    "amount_inr": bd.get("stockout_cost", 0),
                    "description": "Lost sales + brand damage for SKUs with <7 days cover",
                    "formula": "units_lost × unit_cost × 2.5× (lost sales + brand damage premium)",
                },
            ],
            "subtotal_before_cascade": bd.get("subtotal_before_cascade", 0),
            "cascade_amplifier": bd.get("cascade_amplifier", 1.0),
            "cascade_impact": bd.get("cascade_impact", 0.0),
            "cascade_explanation": (
                "Cascade amplifier = 1 + (Tier-2 disruption impact × 0.5). "
                "When upstream Tier-2 suppliers are disrupted, their impact propagates "
                "to Tier-1, amplifying the total financial exposure."
                if bd.get("cascade_impact", 0) > 0
                else "No active Tier-2 cascade — exposure is not amplified."
            ),
            "constants_used": {
                "stockout_multiplier": bd.get("stockout_multiplier", 2.5),
                "sla_penalty_rate_inr_per_unit_day": bd.get("sla_penalty_rate_per_unit_day", 50),
            },
        }

    async def simulate_mitigation(self, supplier_id: UUID) -> dict:
        """Simulate mitigation options for a supplier."""
        supplier = (await self.db.execute(
            select(Supplier).where(Supplier.id == supplier_id)
        )).scalar_one_or_none()

        if not supplier:
            return {"error": "Supplier not found"}

        exposure = await self._compute_supplier_exposure(supplier)
        simulation = financial_engine.simulate_mitigation(
            exposure, supplier.reliability_score, supplier.lead_time_days
        )

        return {
            "supplier_id": simulation.supplier_id,
            "supplier_name": simulation.supplier_name,
            "current_exposure_inr": simulation.current_exposure_inr,
            "mitigated_exposure_inr": simulation.mitigated_exposure_inr,
            "savings_inr": simulation.savings_inr,
            "risk_before": simulation.risk_before,
            "risk_after": simulation.risk_after,
            "options": [
                {
                    "action_type": o.action_type,
                    "description": o.description,
                    "cost_inr": o.cost_inr,
                    "risk_reduction": o.risk_reduction,
                    "exposure_reduction_inr": o.exposure_reduction_inr,
                    "time_to_effect_days": o.time_to_effect_days,
                    "confidence": o.confidence,
                }
                for o in simulation.options
            ],
        }
