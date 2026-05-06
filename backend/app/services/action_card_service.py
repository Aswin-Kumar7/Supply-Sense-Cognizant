"""
Action card service - business logic for action recommendations.
"""

from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories.action_card_repo import ActionCardRepository
from app.schemas.action_card import ActionCardResponse, ActionCardListResponse


class ActionCardService:
    def __init__(self, db: AsyncSession):
        self.repo = ActionCardRepository(db)

    async def get_action_cards(self) -> ActionCardListResponse:
        cards = await self.repo.get_all()
        unresolved = await self.repo.get_unresolved_count()
        return ActionCardListResponse(
            action_cards=[
                ActionCardResponse.model_validate(c) for c in cards
            ],
            total=len(cards),
            unresolved=unresolved or 0,
        )

    async def get_unresolved_actions(self) -> list[ActionCardResponse]:
        cards = await self.repo.get_unresolved()
        return [ActionCardResponse.model_validate(c) for c in cards]
