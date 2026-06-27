"""
Approval record model.

Persists the review and approval lifecycle for high-impact action cards.
An action card moves through: draft → review_required → approved | rejected.
Every state transition is durable and auditable — once written, records are
never deleted, only superseded by newer records for the same card.
"""
import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import String, DateTime, Text, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base

# Valid approval states — the lifecycle progresses forward; no backward moves.
APPROVAL_STATES = frozenset({"draft", "review_required", "approved", "rejected", "executed"})


class ApprovalRecord(Base):
    """Single state-transition event in an action card's approval lifecycle."""

    __tablename__ = "approval_records"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    # The action card this decision relates to
    action_card_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("action_cards.id"), nullable=False, index=True
    )
    # Current state after this transition
    state: Mapped[str] = mapped_column(
        String(30), nullable=False, default="draft"
    )  # draft | review_required | approved | rejected | executed
    # Who made this decision (reviewer/approver ID or "system")
    reviewer_id: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    # Optional free-text rationale for the decision
    note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # Confidence level that triggered review (if state == review_required)
    trigger_confidence: Mapped[Optional[float]] = mapped_column(
        # reuse Text column via manual typing — avoids Float import complexity
        String(30), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
