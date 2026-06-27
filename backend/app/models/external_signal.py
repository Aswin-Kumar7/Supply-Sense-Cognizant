"""
External signal model.

Stores ingested signals from external sources (news, weather, logistics APIs).
Every signal is assigned a credibility score, deduplication key, and source
metadata so the prediction engine can weight evidence appropriately.

All signals are clearly labeled with their source and data_mode so they
are never presented as observed facts when they are estimates or synthetic.
"""
import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import String, DateTime, Float, Text, Boolean
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base

# Signal types — the set of event categories the engine recognises.
SIGNAL_TYPES = frozenset({
    "weather_disruption",
    "port_congestion",
    "supplier_financial_distress",
    "geopolitical_event",
    "logistics_delay",
    "demand_spike",
    "regulatory_change",
    "synthetic",          # clearly labelled synthetic/demo signals
})

# Data modes — be explicit about provenance.
DATA_MODES = frozenset({"observed", "estimated", "synthetic", "forecast"})


class ExternalSignal(Base):
    """Ingested signal from an external source or synthetic generator."""

    __tablename__ = "external_signals"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    # Deduplication key — prevents re-ingesting the same event twice.
    # Format: "{source}:{event_id}" or SHA-256 of content for content-addressed sources.
    dedup_key: Mapped[str] = mapped_column(String(200), nullable=False, unique=True, index=True)
    # Source identifier: "open_meteo", "news_api", "synthetic_engine", etc.
    source: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    # Structured type for filtering: see SIGNAL_TYPES above
    signal_type: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    # Human-readable summary of the signal
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    content: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # Credibility [0.0, 1.0] — 1.0 for verified official sources, lower for scraped/synthetic
    credibility_score: Mapped[float] = mapped_column(Float, nullable=False, default=0.5)
    # Geographic scope (ISO country code, region name, or city)
    geography: Mapped[Optional[str]] = mapped_column(String(200), nullable=True, index=True)
    # Affected supplier IDs as JSON array (if known at ingestion time)
    affected_supplier_ids: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    # Severity estimate [0.0, 1.0] — how severe the event is believed to be
    severity_estimate: Mapped[float] = mapped_column(Float, nullable=False, default=0.5)
    # Is this signal synthetic / generated for demo purposes?
    data_mode: Mapped[str] = mapped_column(String(20), nullable=False, default="observed")
    # When the event was observed in the external source
    observed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    # When we ingested the signal
    ingested_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
    # Whether this signal has been processed by the prediction engine
    is_processed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
