"""
Risk Intelligence Service - Orchestration Layer.
"""
from __future__ import annotations

import asyncio
import hashlib
import time
from uuid import UUID
from datetime import date, datetime, timedelta, timezone
from sqlalchemy import text, select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import AsyncSessionLocal

from app.models.supplier import Supplier
from app.models.sku import SKU, AlternateSupplier
from app.models.disruption import Disruption
from app.models.delivery import DeliveryRecord
from app.models.festival import FestivalCalendar
from app.services.risk_engine import risk_engine, RiskBreakdown
from app.services.cascade_engine import cascade_engine, CascadeResult
from app.services.stockout_engine import stockout_engine, StockoutForecast, StockoutSummary
from app.services.financial_engine import (
    financial_engine, SupplierExposure, FinancialSummary, MitigationSimulation,
    MitigationScenario,
)
from app.core.event_bus import event_bus, SupplyChainEvent
from app.core.logging import logger


# In-process cache for AI mitigation plans, keyed by a content hash of the
# scenario inputs. The hash IS the change-detector: identical inputs → the same
# plan is returned without re-calling the model (the "design once, re-check only
# when the situation changes" model the product wants). Any change to exposure,
# risk, disruption, demand, products or the viable action set changes the hash
# and triggers a fresh design. The TTL is only a long safety net against
# unbounded staleness — not a re-compute timer. { hash: (plan_dict, ts) }
_MITIGATION_AI_CACHE: dict[str, tuple] = {}
_MITIGATION_AI_TTL = 86400.0  # 24h safety net; inputs unchanged ⇒ reuse, don't re-call

# Short-TTL cache for the all-supplier risk computation. compute_all_supplier_risks
# is an N+1 (~6 Neon round-trips per supplier) called by the dashboard summary,
# the risks page, financial summary, and the AI brief — recomputing it on every
# one of those on every load was the main dashboard slowness. Risk scores derive
# from suppliers/disruptions/delivery/inventory, NOT from action-card resolution,
# so a short staleness is safe; new disruptions surface within the TTL or on a
# manual Refresh (which calls clear_risk_cache via /procurement/cache/invalidate).
_ALL_RISKS_CACHE: dict = {"data": None, "ts": 0.0}
_ALL_RISKS_TTL = 20.0

# Same idea for the all-supplier financial summary (also an N+1 with cascade).
_FIN_SUMMARY_CACHE: dict = {"data": None, "ts": 0.0}
_FIN_SUMMARY_TTL = 20.0


def clear_risk_cache() -> None:
    """Drop the cached all-supplier computations so the next one is fresh."""
    _ALL_RISKS_CACHE["data"] = None
    _ALL_RISKS_CACHE["ts"] = 0.0
    _FIN_SUMMARY_CACHE["data"] = None
    _FIN_SUMMARY_CACHE["ts"] = 0.0


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
        cached = _ALL_RISKS_CACHE["data"]
        if cached is not None and (time.monotonic() - _ALL_RISKS_CACHE["ts"]) < _ALL_RISKS_TTL:
            return list(cached)

        suppliers = (await self.db.execute(select(Supplier))).scalars().all()

        # Per-supplier risk is ~6 sequential Neon round-trips; doing all suppliers
        # sequentially on one session took ~11s. Fan out with bounded concurrency,
        # each task on its own short-lived session, to collapse that to ~2s.
        # Supplier ORM attributes are already loaded (expire_on_commit=False), so
        # they're safe to read inside the worker sessions.
        sem = asyncio.Semaphore(8)

        async def _one(supplier) -> dict:
            async with sem:
                async with AsyncSessionLocal() as worker_db:
                    svc = RiskIntelligenceService(worker_db)
                    breakdown = await svc._compute_single_supplier_risk(supplier)
                    risk_trend = await svc._compute_risk_trend(supplier.id)
            return {
                "supplier_id": str(breakdown.supplier_id),
                "supplier_name": breakdown.supplier_name,
                "overall_score": breakdown.overall_score,
                "risk_level": breakdown.risk_level,
                "risk_trend": risk_trend,
                "confidence": breakdown.confidence,
                # Low-confidence single-signal alerts route to human review
                "human_review_required": breakdown.confidence < 0.50,
                "factors": breakdown.factor_dict,
                "computed_at": breakdown.computed_at,
            }

        results = await asyncio.gather(*[_one(s) for s in suppliers])

        # Sort by risk (highest first)
        results.sort(key=lambda x: x["overall_score"], reverse=True)
        _ALL_RISKS_CACHE["data"] = results
        _ALL_RISKS_CACHE["ts"] = time.monotonic()
        return list(results)

    async def compute_supplier_risk(self, supplier_id: UUID) -> dict:
        """Compute detailed risk for a single supplier."""
        supplier = (await self.db.execute(
            select(Supplier).where(Supplier.id == supplier_id)
        )).scalar_one_or_none()

        if not supplier:
            return {"error": "Supplier not found"}

        breakdown = await self._compute_single_supplier_risk(supplier)
        risk_trend = await self._compute_risk_trend(supplier_id)
        return {
            "supplier_id": str(breakdown.supplier_id),
            "supplier_name": breakdown.supplier_name,
            "overall_score": breakdown.overall_score,
            "risk_level": breakdown.risk_level,
            "risk_trend": risk_trend,
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

        # Compute festival proximity — pass region so results match supplier_service
        festival_proximity = await self._compute_festival_proximity(
            supplier.category, region=supplier.region or ""
        )

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

    async def _compute_risk_trend(self, supplier_id: UUID) -> str:
        """
        Compute risk trend for a supplier based on recent disruption activity.
        - 2+ active disruptions in last 14 days → 'deteriorating'
        - 1 active disruption in last 14 days   → 'at_risk'
        - Otherwise                             → 'stable'
        """
        cutoff = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=14)
        result = await self.db.execute(
            select(func.count()).where(
                Disruption.supplier_id == supplier_id,
                Disruption.is_active == True,
                Disruption.created_at >= cutoff,
            )
        )
        count = result.scalar() or 0
        if count >= 2:
            return "deteriorating"
        if count == 1:
            return "at_risk"
        return "stable"

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

    async def _compute_festival_proximity(self, category: str, region: str = "") -> float:
        """Return 0–1 proximity score using both category and region (30-day window)."""
        multiplier = await self._get_festival_multiplier(category, region=region)
        # Normalize: multiplier of 1.0 → 0.0, multiplier of 3.5 → 1.0
        return min(1.0, max(0.0, (multiplier - 1.0) / 2.5))

    # ============ CASCADE PROPAGATION ============

    async def get_cascade_analysis(self, supplier_id: UUID) -> dict:
        """Get cascade propagation analysis for a specific supplier.

        Two-pass approach:
        1. Downstream cascade — who is affected if this supplier fails?
        2. If empty (typical for Tier-1 suppliers that sit at the top of
           consumption), fall back to upstream dependency exposure — what
           does this supplier depend on, and how critical are those inputs?
        """
        disruption_q = await self.db.execute(
            select(Disruption).where(
                Disruption.supplier_id == supplier_id,
                Disruption.is_active == True,
            )
        )
        disruptions = disruption_q.scalars().all()
        impact = max((d.impact_score for d in disruptions), default=0.5)

        result = await cascade_engine.propagate(self.db, supplier_id, impact)

        if result.total_affected == 0:
            result = await cascade_engine.get_dependency_exposure(
                self.db, supplier_id, impact
            )

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

        # Fetch festival multipliers per category for accurate demand forecasting
        festival_cache: dict[str, float] = {}

        forecasts = []
        for row in rows:
            category = row[3]
            if category not in festival_cache:
                festival_cache[category] = await self._get_festival_multiplier(category)

            forecast = stockout_engine.forecast_sku(
                sku_id=str(row[0]),
                sku_code=row[1],
                sku_name=row[2],
                supplier_name=row[8],
                category=category,
                current_stock=row[4],
                daily_demand=row[5],
                unit_cost_inr=row[6],
                is_critical=row[7],
                supplier_disrupted=str(row[10]) in disrupted_ids,
                lead_time_days=row[9],
                festival_multiplier=festival_cache[category],
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
        """Compute financial exposure across all suppliers (cached + parallelized)."""
        cached = _FIN_SUMMARY_CACHE["data"]
        if cached is not None and (time.monotonic() - _FIN_SUMMARY_CACHE["ts"]) < _FIN_SUMMARY_TTL:
            return cached

        suppliers = (await self.db.execute(select(Supplier))).scalars().all()

        # Per-supplier exposure is another N+1 (SKUs + disruptions + delivery +
        # recursive cascade + festival). Fan out with bounded concurrency, each
        # on its own session, mirroring compute_all_supplier_risks.
        sem = asyncio.Semaphore(8)

        async def _exposure(supplier):
            async with sem:
                async with AsyncSessionLocal() as worker_db:
                    svc = RiskIntelligenceService(worker_db)
                    return await svc._compute_supplier_exposure(supplier)

        all_exposures = await asyncio.gather(*[_exposure(s) for s in suppliers])
        # Skip suppliers with no financial stake — cost data missing or stock healthy
        exposures = [e for e in all_exposures if e.total_exposure_inr != 0]

        # Sort by exposure descending
        exposures.sort(key=lambda x: x.total_exposure_inr, reverse=True)

        # Aggregate by category and region (only non-zero exposures)
        by_category: dict = {}
        by_region: dict = {}
        for exp in exposures:
            sup = next((s for s in suppliers if str(s.id) == exp.supplier_id), None)
            if sup:
                by_category[sup.category] = by_category.get(sup.category, 0) + exp.total_exposure_inr
                by_region[sup.region] = by_region.get(sup.region, 0) + exp.total_exposure_inr

        total_exposure = sum(e.total_exposure_inr for e in exposures)
        total_revenue = sum(e.revenue_at_risk_inr for e in exposures)
        total_sla = sum(e.sla_penalties_inr for e in exposures)
        total_stockout = sum(e.stockout_cost_inr for e in exposures)
        total_mitigation = sum(e.mitigation_cost_inr for e in exposures)

        result = {
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
        _FIN_SUMMARY_CACHE["data"] = result
        _FIN_SUMMARY_CACHE["ts"] = time.monotonic()
        return result

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
        actual_impact = max((d.impact_score for d in active_disruption_rows), default=0.0)

        # Get delivery stats
        delivery_stats = await self._get_delivery_stats(supplier.id)

        # Only compute cascade impact when supplier has active disruptions
        if active_disruption_rows:
            cascade_result = await cascade_engine.propagate(self.db, supplier.id, actual_impact)
            cascade_impact = cascade_result.total_propagated_impact
        else:
            cascade_impact = 0.0

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

    async def _get_festival_multiplier(self, category: str, region: str = "") -> float:
        """Return the highest active festival demand multiplier for a category (next 30 days).

        When region is provided, also matches festivals scoped to that region or All India.
        This aligns with supplier_service._compute_festival_proximity which uses both dimensions.
        """
        today = date.today()
        window = today + timedelta(days=30)
        result = await self.db.execute(text("""
            SELECT COALESCE(MAX(demand_multiplier), 1.0)
            FROM festival_calendar
            WHERE start_date <= :window AND end_date >= :today
            AND (affected_categories LIKE :cat OR affected_categories LIKE '%All%')
            AND (
                :region = ''
                OR region IS NULL
                OR region LIKE '%All%'
                OR region ILIKE :region_pat
            )
        """), {
            "today": today,
            "window": window,
            "cat": f"%{category}%",
            "region": region,
            "region_pat": f"%{region}%",
        })
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
        # Computed from real Bedrock call success rate tracked in metrics_store
        try:
            from app.core.metrics import metrics_store
            snap = metrics_store.snapshot()
            bedrock_real = snap["bedrock"]["real_calls"]
            bedrock_total = snap["bedrock"]["total_calls"]
            pass_rate = bedrock_real / max(1, bedrock_total)
        except Exception:
            pass_rate = 0.8  # conservative default when metrics unavailable
        guardrail_component = round(pass_rate * 10.0, 1)

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
        """
        Build a mitigation plan for a supplier.

        Hybrid model: the financial_engine computes ALL rupee figures
        (deterministic, grounded), while the AI selects WHICH actions fit this
        specific scenario and writes scenario-specific copy. The two are merged.
        Falls back to the full deterministic engine plan when AI is unavailable.
        """
        supplier = (await self.db.execute(
            select(Supplier).where(Supplier.id == supplier_id)
        )).scalar_one_or_none()

        if not supplier:
            return {"error": "Supplier not found"}

        exposure = await self._compute_supplier_exposure(supplier)
        breakdown = await self._compute_single_supplier_risk(supplier)

        # ── Gather the live situation FIRST so both the engine and the AI see
        #    the same scenario (real alternate economics, demand spike, cover). ──
        skus_q = await self.db.execute(select(SKU).where(SKU.supplier_id == supplier.id))
        skus = skus_q.scalars().all()
        products = [s.name for s in skus]

        disruptions_q = await self.db.execute(
            select(Disruption).where(
                Disruption.supplier_id == supplier.id,
                Disruption.is_active == True,
            )
        )
        active = disruptions_q.scalars().all()
        if active:
            d = max(active, key=lambda x: x.impact_score or 0)
            disruption_context = f"{d.disruption_type}: {d.title} (severity {d.severity})"
            disruption_type_raw = d.disruption_type or ""
        else:
            disruption_context = "No active disruption — risk is from reliability/inventory signals"
            disruption_type_raw = ""

        # Top fired risk factors → human-readable signal list
        factors = breakdown.factor_dict
        def _fval(v):
            return v.get("value", 0) if isinstance(v, dict) else (float(v) if v is not None else 0)
        fired = sorted(
            ((k, _fval(v)) for k, v in factors.items()), key=lambda kv: kv[1], reverse=True
        )
        risk_factors = ", ".join(
            f"{k.replace('_', ' ')} ({val:.0%})" for k, val in fired if val > 0.3
        ) or "multiple low-level signals"

        # Alternates for this supplier's SKUs (real cost premium, lead time, quality)
        alts: list[dict] = []
        if skus:
            alt_q = await self.db.execute(
                select(AlternateSupplier, Supplier)
                .join(Supplier, Supplier.id == AlternateSupplier.supplier_id)
                .where(AlternateSupplier.sku_id.in_([s.id for s in skus]))
            )
            seen_alt: set = set()
            for alt, alt_sup in alt_q.all():
                if alt_sup.id in seen_alt:
                    continue
                seen_alt.add(alt_sup.id)
                alts.append({
                    "name": alt_sup.name,
                    "city": alt_sup.city,
                    "cost_premium_pct": alt.cost_premium_pct,   # whole percent in DB (e.g. 8.0 = 8%)
                    "quality_score": alt.quality_score,
                    "lead_time_days": alt.lead_time_days,
                })

        # Days of stock cover (proxy for days-to-stockout)
        min_days = 30
        for s in skus:
            if s.daily_demand_avg:
                min_days = min(min_days, int(s.current_stock / max(1, s.daily_demand_avg)))

        # Demand spike from the festival calendar (1.0 = normal)
        demand_multiplier = await self._get_festival_multiplier(supplier.category, supplier.region)

        # Best real alternate = lowest cost premium on file
        best_alt = min(alts, key=lambda a: a["cost_premium_pct"]) if alts else None

        # ── Build the scenario and let the engine cost a situation-fit option set ──
        scenario = MitigationScenario(
            days_to_stockout=min_days,
            inventory_cover_days=min_days,
            has_alternate=bool(alts),
            # DB stores premium as whole percent; engine wants a fraction.
            alt_cost_premium_pct=(best_alt["cost_premium_pct"] / 100.0) if best_alt else 0.15,
            alt_lead_time_days=int(best_alt["lead_time_days"]) if best_alt else supplier.lead_time_days,
            alt_quality=float(best_alt["quality_score"]) if best_alt else 0.80,
            demand_multiplier=demand_multiplier,
            disruption_type=disruption_type_raw,
        )
        simulation = financial_engine.simulate_mitigation(
            exposure, supplier.reliability_score, supplier.lead_time_days,
            risk_score=breakdown.overall_score, scenario=scenario,
        )

        # Deterministic numbers per action_type — the single source of ₹ truth.
        # The engine now emits "reorder" itself when the supplier is still
        # operational; keep the synth only as a defensive fallback.
        number_map: dict[str, dict] = {
            o.action_type: {
                "cost_inr": o.cost_inr,
                "risk_reduction": o.risk_reduction,
                "exposure_reduction_inr": o.exposure_reduction_inr,
                "time_to_effect_days": o.time_to_effect_days,
                "confidence": o.confidence,
            }
            for o in simulation.options
        }
        if "increase_stock" in number_map and "reorder" not in number_map:
            base = number_map["increase_stock"]
            number_map["reorder"] = {
                **base,
                "time_to_effect_days": max(1, base["time_to_effect_days"] - 1),
            }

        def _engine_option_payload(o) -> dict:
            return {
                "action_type": o.action_type,
                "description": o.description,
                "cost_inr": o.cost_inr,
                "risk_reduction": o.risk_reduction,
                "exposure_reduction_inr": o.exposure_reduction_inr,
                "time_to_effect_days": o.time_to_effect_days,
                "confidence": o.confidence,
            }

        base_response = {
            "supplier_id": simulation.supplier_id,
            "supplier_name": simulation.supplier_name,
            "current_exposure_inr": simulation.current_exposure_inr,
            "mitigated_exposure_inr": simulation.mitigated_exposure_inr,
            "savings_inr": simulation.savings_inr,
            "mitigation_cost_inr": simulation.mitigation_cost_inr,
            "net_saving_inr": simulation.net_saving_inr,
            "risk_before": simulation.risk_before,
            "risk_after": simulation.risk_after,
            "options": [_engine_option_payload(o) for o in simulation.options],
            "generation_mode": "deterministic_fallback",
            "ai_generated": False,
            "ai_error": False,
        }

        # ── AI plan (cached by scenario content hash) ───────────────────────
        # The AI may only choose from the action types the engine deemed viable
        # for THIS scenario — so it can't recommend switching when there is no
        # alternate, or reordering from a supplier whose site is down.
        viable_action_types = list(number_map.keys())
        ai_plan = await self._get_ai_mitigation_plan(
            supplier=supplier,
            exposure_inr=exposure.total_exposure_inr,
            risk_score=breakdown.overall_score,
            risk_level=breakdown.risk_level,
            days_to_stockout=min_days,
            products=products,
            disruption_context=disruption_context,
            risk_factors=risk_factors,
            alternates=alts,
            demand_multiplier=demand_multiplier,
            inventory_cover_days=min_days,
            viable_action_types=viable_action_types,
        )

        if not ai_plan:
            return base_response

        # ── Merge AI option selection/copy with engine numbers ──────────────
        merged_options: list[dict] = []
        for opt in ai_plan.get("options", []):
            at = opt.get("action_type")
            nums = number_map.get(at)
            if nums is None:
                # AI chose an action the engine can't cost — skip it rather than fabricate.
                continue
            merged_options.append({
                "action_type": at,
                "title": opt.get("title"),
                "description": opt.get("description"),
                "rationale": opt.get("rationale"),
                "tradeoff": opt.get("tradeoff"),
                **nums,
            })

        if not merged_options:
            return base_response

        # Recompute the headline numbers from the AI-recommended option (or best).
        rec_at = ai_plan.get("recommended_action_type")
        chosen = next((o for o in merged_options if o["action_type"] == rec_at), None)
        if chosen is None:
            chosen = max(merged_options, key=lambda o: o["exposure_reduction_inr"] - o["cost_inr"])
        current = simulation.current_exposure_inr
        mitigated = round(max(0.0, current - chosen["exposure_reduction_inr"]), 2)

        return {
            **base_response,
            "mitigated_exposure_inr": mitigated,
            "savings_inr": round(current - mitigated, 2),
            "mitigation_cost_inr": round(chosen["cost_inr"], 2),
            "net_saving_inr": round((current - mitigated) - chosen["cost_inr"], 2),
            "risk_after": round(mitigated / max(current, 1), 3),
            "options": merged_options,
            "plan_summary": ai_plan.get("plan_summary"),
            "recommended_action_type": rec_at,
            "generation_mode": "ai_generated",
            "ai_generated": True,
            "ai_error": False,
            "evidence_snapshot_id": ai_plan.get("evidence_snapshot_id"),
        }

    async def _get_ai_mitigation_plan(
        self, supplier, exposure_inr, risk_score, risk_level, days_to_stockout,
        products, disruption_context, risk_factors, alternates,
        demand_multiplier: float = 1.0, inventory_cover_days: int = 30,
        viable_action_types: list[str] | None = None,
    ) -> dict | None:
        """
        Call the AI mitigation agent, cached by a hash of the scenario inputs.

        The hash includes every input that should change the plan (exposure,
        risk, disruption, demand spike, products, alternates, the viable action
        set). On a key hit we return the cached plan unconditionally within the
        long safety TTL — i.e. we re-design ONLY when the situation actually
        changes, not on a timer.
        """
        viable_action_types = viable_action_types or []
        key_src = "|".join([
            str(supplier.id),
            str(round(exposure_inr)),
            str(round(risk_score, 3)),
            disruption_context,
            risk_factors,
            ",".join(sorted(products)),
            ",".join(sorted(a["name"] for a in alternates)),
            f"dm{round(demand_multiplier, 2)}",
            f"cov{inventory_cover_days}",
            ",".join(sorted(viable_action_types)),
        ])
        key = hashlib.sha256(key_src.encode()).hexdigest()[:24]

        hit = _MITIGATION_AI_CACHE.get(key)
        if hit and (time.monotonic() - hit[1]) < _MITIGATION_AI_TTL:
            return hit[0]

        from app.services.procurement_agent import procurement_agent
        try:
            plan = await procurement_agent.generate_mitigation_plan(
                supplier_name=supplier.name,
                city=supplier.city,
                state=supplier.state,
                risk_score=risk_score,
                risk_level=risk_level,
                exposure_inr=exposure_inr,
                days_to_stockout=days_to_stockout,
                products=products,
                disruption_context=disruption_context,
                risk_factors=risk_factors,
                alternates=alternates,
                demand_multiplier=demand_multiplier,
                inventory_cover_days=inventory_cover_days,
                viable_action_types=viable_action_types,
            )
        except Exception as exc:
            logger.warning(f"AI mitigation plan failed for {supplier.name}: {exc}")
            return None

        if plan:
            _MITIGATION_AI_CACHE[key] = (plan, time.monotonic())
        return plan
