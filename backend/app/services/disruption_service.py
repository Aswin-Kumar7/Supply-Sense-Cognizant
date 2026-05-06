"""
Disruption service - business logic for disruption tracking.
"""

from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories.disruption_repo import DisruptionRepository
from app.schemas.disruption import DisruptionResponse, DisruptionTimelineResponse


class DisruptionService:
    def __init__(self, db: AsyncSession):
        self.repo = DisruptionRepository(db)

    async def get_timeline(self) -> DisruptionTimelineResponse:
        disruptions = await self.repo.get_all()
        active_count = await self.repo.get_active_count()
        resolved_count = await self.repo.get_resolved_count()

        return DisruptionTimelineResponse(
            disruptions=[
                DisruptionResponse.model_validate(d) for d in disruptions
            ],
            total_active=active_count,
            total_resolved=resolved_count,
        )

    async def get_active_disruptions(self) -> list[DisruptionResponse]:
        disruptions = await self.repo.get_active()
        return [DisruptionResponse.model_validate(d) for d in disruptions]
