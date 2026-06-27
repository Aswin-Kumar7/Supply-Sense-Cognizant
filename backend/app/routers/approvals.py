"""
Approval workflow endpoints.

The approval lifecycle for high-impact action cards:
  draft → review_required → approved | rejected → executed

POST /approvals/{action_card_id}/submit   — submit for review (analyst)
POST /approvals/{action_card_id}/approve  — approve (approver)
POST /approvals/{action_card_id}/reject   — reject (approver)
GET  /approvals/{action_card_id}          — history (viewer)
GET  /approvals/{action_card_id}/state    — current state (viewer)

Only approved cards can be marked as executed. A rejected card must be
resubmitted (creating a new review cycle) before it can be approved.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import require_auth, require_role
from app.core.database import get_db
from app.models.action_card import ActionCard
from app.models.api_key import ApiKey
from app.models.approval_record import ApprovalRecord, APPROVAL_STATES

router = APIRouter(prefix="/approvals", tags=["Approvals"])


class ApprovalRequest(BaseModel):
    note: Optional[str] = None


class ApprovalRecordResponse(BaseModel):
    id: str
    action_card_id: str
    state: str
    reviewer_id: Optional[str]
    note: Optional[str]
    created_at: str


def _record_to_dict(r: ApprovalRecord) -> dict:
    return {
        "id": str(r.id),
        "action_card_id": str(r.action_card_id),
        "state": r.state,
        "reviewer_id": r.reviewer_id,
        "note": r.note,
        "created_at": r.created_at.isoformat(),
    }


async def _get_card(db: AsyncSession, card_id: str) -> ActionCard:
    try:
        uid = uuid.UUID(card_id)
    except ValueError:
        raise HTTPException(status_code=422, detail="Invalid action card ID")
    card = (await db.execute(
        select(ActionCard).where(ActionCard.id == uid)
    )).scalar_one_or_none()
    if card is None:
        raise HTTPException(status_code=404, detail="Action card not found")
    return card


async def _current_state(db: AsyncSession, card_id: str) -> Optional[str]:
    """Return the most recent approval state for a card, or None if no records exist."""
    try:
        uid = uuid.UUID(card_id)
    except ValueError:
        return None
    row = (await db.execute(
        select(ApprovalRecord)
        .where(ApprovalRecord.action_card_id == uid)
        .order_by(ApprovalRecord.created_at.desc())
    )).scalar_one_or_none()
    return row.state if row else None


async def _add_record(
    db: AsyncSession,
    card_id: str,
    state: str,
    reviewer_id: Optional[str],
    note: Optional[str],
) -> ApprovalRecord:
    record = ApprovalRecord(
        id=uuid.uuid4(),
        action_card_id=uuid.UUID(card_id),
        state=state,
        reviewer_id=reviewer_id,
        note=note,
        created_at=datetime.now(timezone.utc),
    )
    db.add(record)
    await db.commit()
    return record


@router.get("/{action_card_id}/state")
async def get_approval_state(
    action_card_id: str,
    principal: ApiKey = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    """Return the current approval state for an action card."""
    await _get_card(db, action_card_id)
    state = await _current_state(db, action_card_id)
    return {
        "action_card_id": action_card_id,
        "state": state or "no_record",
        "requires_review": state == "review_required",
        "is_approved": state == "approved",
        "is_rejected": state == "rejected",
    }


@router.get("/{action_card_id}")
async def get_approval_history(
    action_card_id: str,
    principal: ApiKey = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    """Return the full approval history for an action card (oldest first)."""
    await _get_card(db, action_card_id)
    try:
        uid = uuid.UUID(action_card_id)
    except ValueError:
        raise HTTPException(status_code=422, detail="Invalid action card ID")

    rows = (await db.execute(
        select(ApprovalRecord)
        .where(ApprovalRecord.action_card_id == uid)
        .order_by(ApprovalRecord.created_at)
    )).scalars().all()

    return [_record_to_dict(r) for r in rows]


@router.post("/{action_card_id}/submit", status_code=status.HTTP_201_CREATED)
async def submit_for_review(
    action_card_id: str,
    body: ApprovalRequest,
    principal: ApiKey = Depends(require_role("analyst")),
    db: AsyncSession = Depends(get_db),
):
    """Submit an action card for review. Requires analyst role or higher."""
    await _get_card(db, action_card_id)
    current = await _current_state(db, action_card_id)
    if current in ("approved", "executed"):
        raise HTTPException(
            status_code=400,
            detail=f"Cannot submit: card is already in state '{current}'",
        )
    record = await _add_record(
        db, action_card_id,
        state="review_required",
        reviewer_id=principal.owner_id or str(principal.id),
        note=body.note,
    )
    return _record_to_dict(record)


@router.post("/{action_card_id}/approve", status_code=status.HTTP_201_CREATED)
async def approve_action(
    action_card_id: str,
    body: ApprovalRequest,
    principal: ApiKey = Depends(require_role("approver")),
    db: AsyncSession = Depends(get_db),
):
    """Approve an action card. Requires approver role or higher."""
    await _get_card(db, action_card_id)
    current = await _current_state(db, action_card_id)
    if current != "review_required":
        raise HTTPException(
            status_code=400,
            detail=f"Cannot approve: card must be in 'review_required' state (current: '{current}')",
        )
    record = await _add_record(
        db, action_card_id,
        state="approved",
        reviewer_id=principal.owner_id or str(principal.id),
        note=body.note,
    )
    return _record_to_dict(record)


@router.post("/{action_card_id}/reject", status_code=status.HTTP_201_CREATED)
async def reject_action(
    action_card_id: str,
    body: ApprovalRequest,
    principal: ApiKey = Depends(require_role("approver")),
    db: AsyncSession = Depends(get_db),
):
    """Reject an action card. Requires approver role or higher."""
    await _get_card(db, action_card_id)
    current = await _current_state(db, action_card_id)
    if current != "review_required":
        raise HTTPException(
            status_code=400,
            detail=f"Cannot reject: card must be in 'review_required' state (current: '{current}')",
        )
    record = await _add_record(
        db, action_card_id,
        state="rejected",
        reviewer_id=principal.owner_id or str(principal.id),
        note=body.note or "No rationale provided",
    )
    return _record_to_dict(record)
