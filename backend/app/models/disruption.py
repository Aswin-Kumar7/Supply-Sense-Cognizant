"""
Disruption event model.
Tracks supply chain disruptions: natural disasters, strikes, quality issues.
"""
from __future__ import annotations

import uuid
from datetime import datetime, date, timezone
from typing import Optional
from sqlalchemy import String, Float, Integer, DateTime, Date, ForeignKey, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class Disruption(Base):
    __tablename__ = "disruptions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    supplier_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("suppliers.id"), nullable=True
    )
    disruption_type: Mapped[str] = mapped_column(
        String(50), nullable=False
    )  # cyclone, strike, quality, logistics, regulatory
    severity: Mapped[str] = mapped_column(
        String(20), nullable=False
    )  # low, medium, high, critical
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=True)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=True)
    impact_score: Mapped[float] = mapped_column(Float, default=0.5)
    affected_skus_count: Mapped[int] = mapped_column(Integer, default=0)
    region: Mapped[str] = mapped_column(String(100), nullable=True)
    is_active: Mapped[bool] = mapped_column(default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc).replace(tzinfo=None)
    )
