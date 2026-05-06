"""
Disruption API endpoints.
"""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.services.disruption_service import DisruptionService
from app.schemas.disruption import DisruptionTimelineResponse, DisruptionResponse

router = APIRouter(prefix="/disruptions", tags=["Disruptions"])


@router.get("/timeline", response_model=DisruptionTimelineResponse)
async def get_disruption_timeline(
    db: AsyncSession = Depends(get_db),
):
    """Get full disruption timeline."""
    service = DisruptionService(db)
    return await service.get_timeline()


@router.get("/active", response_model=list[DisruptionResponse])
async def get_active_disruptions(
    db: AsyncSession = Depends(get_db),
):
    """Get currently active disruptions."""
    service = DisruptionService(db)
    return await service.get_active_disruptions()
