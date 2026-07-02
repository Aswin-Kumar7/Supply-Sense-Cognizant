"""
Durable tool/model call trace.

One record per tool invocation or Bedrock call made during an analysis run.
Together with the parent AnalysisSnapshot these records make the provenance
of every result fully auditable: which tools were called, with what inputs,
and whether they succeeded.
"""
import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import String, DateTime, Float
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class AnalysisTrace(Base):
    """Single tool or model call within an analysis run."""

    __tablename__ = "analysis_traces"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    # Parent snapshot — nullable so traces can be saved even if snapshot write failed
    snapshot_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), nullable=True, index=True
    )
    # Tool or model name ("risk_engine", "financial_engine", "bedrock_invoke", etc.)
    tool_name: Mapped[str] = mapped_column(String(100), nullable=False)
    # SHA-256[:16] of the serialised arguments — used to detect duplicate calls
    args_hash: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    # SHA-256[:16] of the serialised result — used to verify output stability
    result_hash: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    # "success" | "error" | "timeout" | "skipped"
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="success")
    duration_ms: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
