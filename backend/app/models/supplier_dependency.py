"""
Supplier dependency model - tracks multi-tier supply chain relationships.
"""

import uuid
from sqlalchemy import String, Float, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class SupplierDependency(Base):
    __tablename__ = "supplier_dependencies"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    # supplier_id = Tier-1 vendor (the buyer — e.g. Bharat FMCG Industries)
    # depends_on_id = Tier-2 upstream supplier (e.g. PackRight Solutions)
    # Meaning: Tier-1 depends on Tier-2 for packaging / raw material.
    # Cascade direction: if Tier-2 (depends_on_id) is disrupted,
    #   the cascade engine finds Tier-1 (supplier_id) as the affected party.
    supplier_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("suppliers.id"), nullable=False
    )
    depends_on_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("suppliers.id"), nullable=False
    )
    dependency_type: Mapped[str] = mapped_column(
        String(50), nullable=False
    )  # raw_material, packaging, logistics
    criticality: Mapped[float] = mapped_column(Float, default=0.5)
