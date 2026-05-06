"""
Risk snapshot model.
Point-in-time risk assessments for suppliers and SKUs.
"""

import uuid
from datetime import datetime
from sqlalchemy import String, Float, Integer, DateTime, ForeignKey, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class RiskSnapshot(Base):
    __tablename__ = "risk_snapshots"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    supplier_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("suppliers.id"), nullable=False
    )
    risk_score: Mapped[float] = mapped_column(Float, nullable=False)
    risk_level: Mapped[str] = mapped_column(
        String(20), nullable=False
    )  # low, medium, high, critical
    factors: Mapped[str] = mapped_column(Text, nullable=True)
    stockout_probability: Mapped[float] = mapped_column(Float, default=0.0)
    days_of_stock: Mapped[int] = mapped_column(Integer, default=30)
    snapshot_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow
    )
