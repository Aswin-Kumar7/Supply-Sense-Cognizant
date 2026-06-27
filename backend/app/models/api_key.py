"""
API key model for authentication.

Keys are stored as SHA-256 hashes — the plaintext is never persisted.
The roles list drives RBAC: viewer < analyst < approver < admin.
"""
import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import String, Boolean, DateTime, Text
from sqlalchemy.dialects.postgresql import UUID, ARRAY
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class ApiKey(Base):
    """Hashed API key with role assignments."""

    __tablename__ = "api_keys"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    # SHA-256 hex digest of the plaintext key — never store plaintext
    key_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)
    # Human-readable label for the key (e.g. "frontend-prod", "ci-runner")
    label: Mapped[str] = mapped_column(String(200), nullable=False)
    # Comma-separated roles: "viewer", "analyst", "approver", "admin"
    roles_csv: Mapped[str] = mapped_column(Text, nullable=False, default="viewer")
    # Owning entity — user ID, service name, or tenant identifier
    owner_id: Mapped[Optional[str]] = mapped_column(String(200), nullable=True, index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
    last_used_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    @property
    def roles(self) -> list:
        return [r.strip() for r in self.roles_csv.split(",") if r.strip()]
