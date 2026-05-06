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
    supplier_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("suppliers.id"), nullable=False
    )
    depends_on_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("suppliers.id"), nullable=False
    )
    dependency_type: Mapped[str] = mapped_column(
        String(50), nullable=False
    )  # raw_material, logistics, packaging
    criticality: Mapped[float] = mapped_column(Float, default=0.5)
