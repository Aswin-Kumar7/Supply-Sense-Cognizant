"""
Supplier API endpoints.
"""

from typing import Optional
from uuid import UUID
from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.services.supplier_service import SupplierService
from app.schemas.supplier import SupplierListResponse, SupplierResponse

router = APIRouter(prefix="/suppliers", tags=["Suppliers"])


@router.get("", response_model=SupplierListResponse)
async def list_suppliers(
    limit: int = Query(default=100, le=500),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    """List all suppliers with pagination."""
    service = SupplierService(db)
    return await service.get_all_suppliers(limit=limit, offset=offset)


@router.get("/dependencies/all")
async def get_all_dependencies(
    db: AsyncSession = Depends(get_db),
):
    """Get all supplier dependency relationships."""
    service = SupplierService(db)
    return await service.get_all_dependencies()


@router.get("/alternate-detail/{alt_supplier_id}")
async def get_alternate_supplier_detail(
    alt_supplier_id: UUID,
    primary_supplier_id: Optional[UUID] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    if primary_supplier_id is None:
        # Find the first primary supplier associated with this alternate supplier
        res = await db.execute(text("""
            SELECT DISTINCT sk.supplier_id
            FROM alternate_suppliers als
            JOIN skus sk ON sk.id = als.sku_id
            WHERE als.supplier_id = :alt_id
            LIMIT 1
        """), {"alt_id": str(alt_supplier_id)})
        row = res.fetchone()
        if not row:
            from fastapi import HTTPException
            raise HTTPException(status_code=404, detail="Alternate supplier has no associated primary suppliers")
        primary_supplier_id = row[0]

    """
    Return full detail for a specific alternate supplier:
    - Supplier profile (name, city, region, reliability, lead time)
    - All SKUs it can cover (from the primary supplier)
    - Cost premium & quality score per SKU
    - Ordering summary
    """
    result = await db.execute(text("""
        SELECT
            s.id                    AS supplier_id,
            s.name                  AS supplier_name,
            s.city,
            s.state,
            s.region,
            s.category,
            s.reliability_score,
            s.lead_time_days        AS base_lead_time_days,
            s.risk_zone,
            als.id                  AS alternate_id,
            als.cost_premium_pct,
            als.lead_time_days      AS alt_lead_time_days,
            als.quality_score,
            sk.id                   AS sku_id,
            sk.name                 AS sku_name,
            sk.sku_code,
            sk.current_stock,
            sk.daily_demand_avg,
            sk.unit_cost_inr,
            sk.is_critical
        FROM alternate_suppliers als
        JOIN skus sk ON sk.id = als.sku_id
        JOIN suppliers s ON s.id = als.supplier_id
        WHERE s.id = :alt_id
          AND sk.supplier_id = :primary_id
        ORDER BY als.cost_premium_pct ASC
    """), {"alt_id": str(alt_supplier_id), "primary_id": str(primary_supplier_id)})
    rows = result.fetchall()

    if not rows:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Alternate supplier not found")

    # Profile from first row
    r0 = rows[0]
    supplier = {
        "supplier_id": str(r0[0]),
        "supplier_name": r0[1],
        "city": r0[2],
        "state": r0[3],
        "region": r0[4],
        "category": r0[5],
        "reliability_score": float(r0[6]),
        "base_lead_time_days": int(r0[7]),
        "risk_zone": r0[8],
        "cost_premium_pct": float(r0[10]),
        "alt_lead_time_days": int(r0[11]),
        "quality_score": float(r0[12]),
    }

    skus = [
        {
            "sku_id": str(r[13]),
            "sku_name": r[14],
            "sku_code": r[15],
            "current_stock": int(r[16] or 0),
            "daily_demand_avg": float(r[17] or 0),
            "unit_cost_inr": float(r[18] or 0),
            "adjusted_unit_cost_inr": round(float(r[18] or 0) * (1 + float(r[10]) / 100), 2),
            "is_critical": bool(r[19]),
            "cost_premium_pct": float(r[10]),
            "quality_score": float(r[12]),
            "lead_time_days": int(r[11]),
        }
        for r in rows
    ]

    total_order_value = sum(
        s["daily_demand_avg"] * s["lead_time_days"] * s["adjusted_unit_cost_inr"]
        for s in skus
    )

    primary_name_res = await db.execute(text("SELECT name FROM suppliers WHERE id = :primary_id"), {"primary_id": str(primary_supplier_id)})
    primary_name_row = primary_name_res.fetchone()
    primary_supplier_name = primary_name_row[0] if primary_name_row else "Primary Supplier"

    return {
        "supplier": supplier,
        "skus_covered": skus,
        "skus_count": len(skus),
        "estimated_order_value_inr": round(total_order_value, 2),
        "primary_supplier_id": str(primary_supplier_id),
        "primary_supplier_name": primary_supplier_name,
    }


@router.get("/{supplier_id}", response_model=SupplierResponse)
async def get_supplier(
    supplier_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    """Get a single supplier by ID."""
    service = SupplierService(db)
    return await service.get_supplier(supplier_id)


@router.get("/{supplier_id}/dependencies")
async def get_supplier_dependencies(
    supplier_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    """Get dependency tree for a supplier."""
    service = SupplierService(db)
    return await service.get_dependencies(supplier_id)


@router.get("/{supplier_id}/alternate-suppliers")
async def get_alternate_suppliers_for_supplier(
    supplier_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    """
    Return alternate suppliers that can cover SKUs supplied by this supplier.
    Joins alternate_suppliers → skus → suppliers to return full supplier detail.
    """
    result = await db.execute(text("""
        SELECT DISTINCT ON (s.id)
            als.id                  AS alternate_id,
            s.id                    AS supplier_id,
            s.name                  AS supplier_name,
            s.city,
            s.state,
            s.region,
            s.category,
            s.reliability_score,
            s.lead_time_days        AS base_lead_time_days,
            als.cost_premium_pct,
            als.lead_time_days      AS alt_lead_time_days,
            als.quality_score,
            sk.name                 AS sku_name,
            sk.sku_code
        FROM alternate_suppliers als
        JOIN skus sk ON sk.id = als.sku_id
        JOIN suppliers s  ON s.id  = als.supplier_id
        WHERE sk.supplier_id = :sid
        ORDER BY s.id, als.cost_premium_pct ASC
        LIMIT 20
    """), {"sid": str(supplier_id)})
    rows = result.fetchall()
    return {
        "supplier_id": str(supplier_id),
        "count": len(rows),
        "alternates": [
            {
                "alternate_id": str(r[0]),
                "supplier_id": str(r[1]),
                "supplier_name": r[2],
                "city": r[3],
                "state": r[4],
                "region": r[5],
                "category": r[6],
                "reliability_score": float(r[7]),
                "lead_time_days": r[10],
                "cost_premium_pct": float(r[9]),
                "quality_score": float(r[11]),
                "covers_sku": r[12],
                "sku_code": r[13],
            }
            for r in rows
        ],
    }
