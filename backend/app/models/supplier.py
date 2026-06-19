"""
Supplier and dependency chain models.
Models multi-tier Indian supply chain relationships.
"""

import uuid
from datetime import datetime, timezone
from sqlalchemy import String, Float, Integer, DateTime, ForeignKey, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Supplier(Base):
    __tablename__ = "suppliers"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    city: Mapped[str] = mapped_column(String(100), nullable=False)
    state: Mapped[str] = mapped_column(String(100), nullable=False)
    region: Mapped[str] = mapped_column(String(50), nullable=False)
    category: Mapped[str] = mapped_column(String(50), nullable=False)
    tier: Mapped[int] = mapped_column(Integer, default=1)
    reliability_score: Mapped[float] = mapped_column(Float, default=0.85)
    lead_time_days: Mapped[int] = mapped_column(Integer, default=7)
    risk_zone: Mapped[str] = mapped_column(String(50), nullable=True)
    latitude: Mapped[float] = mapped_column(Float, nullable=True)
    longitude: Mapped[float] = mapped_column(Float, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc).replace(tzinfo=None)
    )

    # Relationships
    skus: Mapped[list["SKU"]] = relationship(back_populates="supplier")
    deliveries: Mapped[list["DeliveryRecord"]] = relationship(
        back_populates="supplier"
    )
