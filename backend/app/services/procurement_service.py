"""
Procurement Orchestration Service.

Coordinates the full procurement intelligence pipeline:
1. Fetch deterministic risk data (from Module 4 engines)
2. Feed into AI procurement agent for reasoning
3. Produce prioritized ActionCards with narratives
4. Generate executive briefings

This is the main entry point for Module 5 API endpoints.
"""

from datetime import datetime, timezone

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.supplier import Supplier
from app.models.sku import SKU
from app.models.disruption import Disruption
from app.services.risk_intelligence import RiskIntelligenceService
from app.services.procurement_agent import procurement_agent
from app.core.logging import logger


class ProcurementService:
    """Orchestrates procurement intelligence generation."""

    def __init__(self, db: AsyncSession):
        self.db = db
        self.risk_service = RiskIntelligenceService(db)

    async def generate_action_cards(self) -> list[dict]:
        """
        Generate AI-enhanced ActionCards for all at-risk suppliers.
        Combines deterministic risk data with AI reasoning.
        """
        # Step 1: Get all supplier risks
        risks = await self.risk_service.compute_all_supplier_risks()

        # Step 2: Get stockout forecasts
        stockout_summary = await self.risk_service.get_stockout_forecasts()
        stockout_by_supplier: dict = {}
        for f in stockout_summary.forecasts:
            if f.supplier_name not in stockout_by_supplier:
                stockout_by_supplier[f.supplier_name] = []
            stockout_by_supplier[f.supplier_name].append(f)

        # Step 3: Get financial exposure
        financial = await self.risk_service.get_financial_summary()
        exposure_map = {e["supplier_id"]: e for e in financial["top_exposures"]}

        # Step 4: Get active disruptions context
        disruptions_q = await self.db.execute(
            select(Disruption).where(Disruption.is_active == True)
        )
        active_disruptions = disruptions_q.scalars().all()
        disruption_by_supplier = {}
        for d in active_disruptions:
            sid = str(d.supplier_id) if d.supplier_id else None
            if sid:
                disruption_by_supplier[sid] = f"{d.disruption_type}: {d.title} (severity: {d.severity})"

        # Step 5: Get cascade data
        cascades = await self.risk_service.get_all_cascades()
        cascade_map = {c["source_supplier_id"]: c for c in cascades}

        # Step 6: Generate ActionCards for suppliers above threshold
        action_cards = []
        for risk in risks:
            if risk["overall_score"] < 0.12:  # Skip very low risk
                continue

            supplier_id = risk["supplier_id"]
            supplier_name = risk["supplier_name"]

            # Get supplier details
            supplier = (await self.db.execute(
                select(Supplier).where(Supplier.id == supplier_id)
            )).scalar_one_or_none()
            if not supplier:
                continue

            # Determine action type based on risk factors
            action_type = self._determine_action_type(risk, supplier_id, disruption_by_supplier)

            # Get stockout info
            supplier_stockouts = stockout_by_supplier.get(supplier_name, [])
            min_days = min((s.days_to_stockout for s in supplier_stockouts), default=30)
            sku_count = len(supplier_stockouts)

            # Get exposure
            exposure = exposure_map.get(supplier_id, {})
            exposure_inr = exposure.get("total_exposure_inr", 0)

            # No financial stake — SKU cost data missing or stock is healthy enough.
            # Skip so ₹0 rows never appear on the Risks page.
            if exposure_inr == 0:
                continue

            # Get disruption context
            disruption_ctx = disruption_by_supplier.get(supplier_id, "No active disruption")

            # Get cascade context
            cascade = cascade_map.get(supplier_id)
            cascade_ctx = f"{cascade['total_affected']} downstream suppliers affected, propagated impact: {cascade['total_propagated_impact']:.2f}" if cascade else "No cascade detected"

            # Generate AI-enhanced card
            ai_card = await procurement_agent.generate_action_card(
                supplier_name=supplier_name,
                city=supplier.city,
                state=supplier.state,
                risk_score=risk["overall_score"],
                risk_level=risk["risk_level"],
                exposure_inr=exposure_inr,
                days_to_stockout=min_days,
                sku_count=sku_count,
                disruption_context=disruption_ctx,
                cascade_context=cascade_ctx,
                action_type=action_type,
            )

            action_cards.append({
                # Deterministic data
                "supplier_id": supplier_id,
                "supplier_name": supplier_name,
                "city": supplier.city,
                "region": supplier.region,
                "category": supplier.category,
                "risk_score": risk["overall_score"],
                "risk_level": risk["risk_level"],
                "confidence": risk["confidence"],
                "financial_exposure_inr": exposure_inr,
                "days_to_stockout": min_days,
                "affected_skus": sku_count,
                "action_type": action_type,
                "priority": self._compute_priority(risk["overall_score"], min_days, exposure_inr),
                # AI-generated narratives
                **ai_card,
            })

        # Sort by priority
        priority_order = {"critical": 0, "high": 1, "medium": 2, "low": 3}
        action_cards.sort(key=lambda c: (priority_order.get(c["priority"], 4), -c["financial_exposure_inr"]))

        return action_cards

    async def generate_executive_brief(self) -> dict:
        """Generate executive procurement briefing from current state."""
        # Gather metrics
        risks = await self.risk_service.compute_all_supplier_risks()
        stockout = await self.risk_service.get_stockout_forecasts()
        financial = await self.risk_service.get_financial_summary()
        cascades = await self.risk_service.get_all_cascades()

        at_risk = [r for r in risks if r["overall_score"] >= 0.15]
        top_suppliers = [r["supplier_name"] for r in at_risk[:5]]

        brief = await procurement_agent.generate_executive_brief(
            at_risk_count=len(at_risk),
            total_exposure=financial["total_financial_exposure_inr"],
            critical_stockouts=stockout.critical_count,
            high_stockouts=stockout.high_count,
            active_disruptions=len([r for r in risks if r["factors"].get("disruption_severity", {}).get("value", 0) > 0]),
            cascade_count=len(cascades),
            top_suppliers=top_suppliers,
        )

        return {
            # Deterministic metrics
            "at_risk_suppliers": len(at_risk),
            "total_exposure_inr": financial["total_financial_exposure_inr"],
            "critical_stockouts": stockout.critical_count,
            "high_stockouts": stockout.high_count,
            "cascade_count": len(cascades),
            "avg_days_to_stockout": stockout.avg_days_to_stockout,
            # AI-generated content
            **brief,
            "generated_at": datetime.now(timezone.utc).isoformat(),
        }

    async def get_alternate_supplier_recommendation(self, supplier_id: str) -> dict:
        """Get AI-evaluated alternate supplier recommendation."""
        supplier = (await self.db.execute(
            select(Supplier).where(Supplier.id == supplier_id)
        )).scalar_one_or_none()

        if not supplier:
            from fastapi import HTTPException
            raise HTTPException(status_code=404, detail="Supplier not found")

        # Get disruption context
        disruption_q = await self.db.execute(
            select(Disruption).where(
                Disruption.supplier_id == supplier_id,
                Disruption.is_active == True,
            )
        )
        disruptions = disruption_q.scalars().all()
        issue = disruptions[0].title if disruptions else "Elevated risk score"

        # Find potential alternates (same category, different region)
        alternates_q = await self.db.execute(
            select(Supplier).where(
                Supplier.category == supplier.category,
                Supplier.id != supplier.id,
                Supplier.reliability_score >= 0.75,
            )
        )
        alternates = [
            {
                "name": s.name,
                "city": s.city,
                "reliability": s.reliability_score,
                "lead_time": s.lead_time_days,
                "cost_premium": 0.15 if s.region != supplier.region else 0.05,
            }
            for s in alternates_q.scalars().all()
        ]

        result = await procurement_agent.evaluate_alternate_suppliers(
            primary_name=supplier.name,
            primary_city=supplier.city,
            primary_reliability=supplier.reliability_score,
            primary_lead_time=supplier.lead_time_days,
            primary_risk=round(1.0 - supplier.reliability_score, 2),
            issue=issue,
            alternates=alternates,
        )

        return {
            "primary_supplier": {
                "id": str(supplier.id),
                "name": supplier.name,
                "city": supplier.city,
                "reliability": supplier.reliability_score,
            },
            "alternates_evaluated": len(alternates),
            **result,
        }

    def _determine_action_type(self, risk: dict, supplier_id: str, disruptions: dict) -> str:
        """Determine recommended action type from risk profile."""
        has_disruption = supplier_id in disruptions
        high_inventory_pressure = risk["factors"].get("inventory_pressure", {}).get("value", 0) > 0.5
        high_dependency = risk["factors"].get("dependency_exposure", {}).get("value", 0) > 0.5

        if has_disruption and risk["overall_score"] >= 0.3:
            return "switch_supplier"
        elif high_inventory_pressure:
            return "reorder"
        elif high_dependency:
            return "expedite"
        else:
            return "increase_stock"

    def _compute_priority(self, risk_score: float, days_to_stockout: int, exposure_inr: float) -> str:
        """Compute action priority from multiple signals."""
        # Critical: any one extreme condition
        if days_to_stockout <= 3 or risk_score >= 0.7 or exposure_inr >= 500000:
            return "critical"
        # High: multiple elevated conditions
        signals = sum([
            days_to_stockout <= 7,
            risk_score >= 0.4,
            exposure_inr >= 200000,
        ])
        if signals >= 2:
            return "high"
        elif signals >= 1:
            return "medium"
        return "low"
