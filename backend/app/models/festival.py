"""
Festival calendar model.
Indian festival/seasonal demand spikes for procurement planning.
"""

import uuid
from datetime import date
from sqlalchemy import String, Float, Integer, Date
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class FestivalCalendar(Base):
    __tablename__ = "festival_calendar"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)
    region: Mapped[str] = mapped_column(String(100), nullable=False)
    demand_multiplier: Mapped[float] = mapped_column(Float, default=1.5)
    affected_categories: Mapped[str] = mapped_column(
        String(200), nullable=True
    )  # comma-separated: FMCG,Pharma
    procurement_lead_days: Mapped[int] = mapped_column(
        Integer, default=14
    )
