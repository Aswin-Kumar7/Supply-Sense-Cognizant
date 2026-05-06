"""
Action card model.
Represents recommended procurement/mitigation actions.
"""

import uuid
from datetime import datetime
from sqlalchemy import String, Float, Integer, DateTime, ForeignKey, Text, Boolean
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class ActionCard(Base):
    __tablename__ = "action_cards"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=True)
    action_type: Mapped[str] = mapped_column(
        String(50), nullable=False
    )  # reorder, switch_supplier, increase_safety_stock, expedite
    priority: Mapped[str] = mapped_column(
        String(20), nullable=False
    )  # low, medium, high, critical
    supplier_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("suppliers.id"), nullable=True
    )
    sku_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("skus.id"), nullable=True
    )
    estimated_impact_inr: Mapped[float] = mapped_column(Float, default=0.0)
    is_resolved: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow
    )
    resolved_at: Mapped[datetime] = mapped_column(DateTime, nullable=True)
