"""
SKU API endpoints.
"""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.services.sku_service import SKUService
from app.schemas.sku import SKUListResponse

router = APIRouter(prefix="/skus", tags=["SKUs"])


@router.get("", response_model=SKUListResponse)
async def list_skus_with_risk(
    limit: int = Query(default=100, le=500),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    """List all SKUs with computed risk metrics."""
    service = SKUService(db)
    return await service.get_sku_risk_table(limit=limit, offset=offset)
