"""
Immutable analysis snapshot.

Persists the evidence package, policy versions, and model metadata used to
generate each analysis result. Snapshots are write-once — never updated after
creation — so any displayed result can be replayed given its snapshot_id.

The cache_key is content-addressable: same evidence + same policies + same
model produce the same key, enabling cache hits without explicit invalidation.
"""
import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import String, DateTime, Integer
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class AnalysisSnapshot(Base):
    """Write-once record of the evidence and policy context for one analysis run."""

    __tablename__ = "analysis_snapshots"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    # Content-addressable key (32-char hex) — see core.freshness.build_cache_key
    cache_key: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    # Supplier scope — None for multi-supplier snapshots (exec brief, etc.)
    supplier_id: Mapped[Optional[str]] = mapped_column(String(50), nullable=True, index=True)
    # Evidence fingerprint from EvidencePackage.facts_hash
    evidence_hash: Mapped[str] = mapped_column(String(32), nullable=False)
    # Policy versions active at generation time
    risk_policy_version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    financial_policy_version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    # Model and prompt version for reproducibility
    model_version: Mapped[str] = mapped_column(String(100), nullable=False)
    prompt_version: Mapped[str] = mapped_column(String(20), nullable=False, default="1")
    # Full evidence payload — allows replay without re-querying the database
    evidence_json: Mapped[dict] = mapped_column(JSONB, nullable=False)
    # How was this result produced?  "ai_generated" | "deterministic_fallback" | "cache"
    generation_mode: Mapped[str] = mapped_column(String(30), nullable=False, default="ai_generated")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
