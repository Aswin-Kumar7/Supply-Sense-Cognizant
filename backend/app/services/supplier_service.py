"""
Supplier service - business logic for supplier operations.
"""

from uuid import UUID
from datetime import date, timedelta
from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories.supplier_repo import SupplierRepository
from app.schemas.supplier import (
    SupplierResponse,
    SupplierListResponse,
    SupplierDependencyResponse,
)
from app.core.exceptions import NotFoundError
from app.services.risk_engine import risk_engine, RISK_ZONE_SCORES


def _compute_festival_proximity(supplier, festivals: list[dict]) -> float:
    """Match supplier region/category against upcoming festivals; return 0.0–1.0."""
    today = date.today()
    supplier_region = (supplier.region or "").lower()
    supplier_category = (supplier.category or "").lower()
    best = 0.0
    for f in festivals:
        festival_region = (f["region"] or "").lower()
        if festival_region not in ("all", "pan india") and festival_region != supplier_region:
            continue
        categories = [c.strip().lower() for c in f["affected_categories"].split(",") if c.strip()]
        if categories and supplier_category not in categories:
            continue
        days_until = (f["start_date"] - today).days
        if days_until < 0:
            continue
        # Closer = higher score; 0 days → 1.0, 30 days → ~0.07
        proximity = 1.0 / (1.0 + days_until / 3.0)
        best = max(best, proximity)
    return round(best, 3)


async def _compute_risk_breakdown(
    repo: SupplierRepository, supplier, festivals: list[dict] | None = None
) -> dict | None:
    """Compute risk_breakdown dict for a supplier using risk_engine factor data."""
    try:
        inputs = await repo.get_risk_inputs(supplier.id)
        festival_proximity = (
            _compute_festival_proximity(supplier, festivals) if festivals is not None else 0.0
        )

        breakdown = risk_engine.compute_supplier_risk(
            supplier_id=supplier.id,
            supplier_name=supplier.name,
            reliability_score=supplier.reliability_score,
            risk_zone=supplier.risk_zone,
            active_disruptions=inputs["active_disruptions"],
            delivery_stats=inputs["delivery_stats"],
            inventory_pressure=inputs["inventory_pressure"],
            dependency_exposure=inputs["dependency_exposure"],
            festival_proximity=festival_proximity,
        )
        return breakdown.factor_dict
    except Exception:
        return None


class SupplierService:
    def __init__(self, db: AsyncSession):
        self.repo = SupplierRepository(db)

    async def get_all_suppliers(
        self, limit: int = 100, offset: int = 0
    ) -> SupplierListResponse:
        suppliers = await self.repo.get_all(limit=limit, offset=offset)
        total = await self.repo.get_count()
        festivals = await self.repo.get_upcoming_festivals()

        result = []
        for s in suppliers:
            data = SupplierResponse.model_validate(s)
            data.risk_breakdown = await _compute_risk_breakdown(self.repo, s, festivals)
            result.append(data)

        return SupplierListResponse(suppliers=result, total=total)

    async def get_supplier(self, supplier_id: UUID) -> SupplierResponse:
        supplier = await self.repo.get_by_id(supplier_id)
        if not supplier:
            raise NotFoundError("Supplier", str(supplier_id))
        data = SupplierResponse.model_validate(supplier)
        data.risk_breakdown = await _compute_risk_breakdown(self.repo, supplier)
        return data

    async def get_dependencies(
        self, supplier_id: UUID
    ) -> list[SupplierDependencyResponse]:
        deps = await self.repo.get_dependencies(supplier_id)
        return [SupplierDependencyResponse.model_validate(d) for d in deps]

    async def get_all_dependencies(
        self,
    ) -> list[SupplierDependencyResponse]:
        deps = await self.repo.get_all_dependencies()
        return [SupplierDependencyResponse.model_validate(d) for d in deps]
