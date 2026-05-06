"""
Delivery history model.
Tracks 90-day delivery performance for reliability scoring.
"""

import uuid
from datetime import datetime, date
from sqlalchemy import String, Float, Integer, DateTime, Date, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class DeliveryRecord(Base):
    __tablename__ = "delivery_records"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    supplier_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("suppliers.id"), nullable=False
    )
    sku_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("skus.id"), nullable=False
    )
    order_date: Mapped[date] = mapped_column(Date, nullable=False)
    expected_date: Mapped[date] = mapped_column(Date, nullable=False)
    actual_date: Mapped[date] = mapped_column(Date, nullable=True)
    quantity_ordered: Mapped[int] = mapped_column(Integer, nullable=False)
    quantity_delivered: Mapped[int] = mapped_column(Integer, nullable=True)
    delay_days: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(
        String(30), default="delivered"
    )  # delivered, delayed, partial, cancelled
    sla_penalty_inr: Mapped[float] = mapped_column(Float, default=0.0)

    # Relationships
    supplier: Mapped["Supplier"] = relationship(back_populates="deliveries")
