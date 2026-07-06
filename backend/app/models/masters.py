import uuid
from decimal import Decimal

from sqlalchemy import CheckConstraint, Numeric, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.mixins import CreatedAtMixin, UUIDPkMixin


class Vendor(UUIDPkMixin, CreatedAtMixin, Base):
    __tablename__ = "vendors"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    gst: Mapped[str | None] = mapped_column(String(50))
    is_active: Mapped[bool] = mapped_column(default=True)


class Contractor(UUIDPkMixin, CreatedAtMixin, Base):
    __tablename__ = "contractors"
    __table_args__ = (UniqueConstraint("code"),)

    code: Mapped[str] = mapped_column(String(20), nullable=False)  # KLC, GLC, OTHER_WORKS
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    is_active: Mapped[bool] = mapped_column(default=True)


class DiaGrade(UUIDPkMixin, CreatedAtMixin, Base):
    __tablename__ = "dia_grades"
    __table_args__ = (UniqueConstraint("diameter_mm", "grade"),)

    diameter_mm: Mapped[Decimal] = mapped_column(Numeric(4, 1), nullable=False)
    grade: Mapped[str] = mapped_column(String(20), nullable=False, default="Fe500")
    unit_weight_kg_per_m: Mapped[Decimal] = mapped_column(Numeric(6, 4), nullable=False)
    is_active: Mapped[bool] = mapped_column(default=True)


class RuleThreshold(UUIDPkMixin, CreatedAtMixin, Base):
    """Per-rule mode + threshold, per-project overridable (project_id NULL = company default).
    This is the row read at runtime to flip advisory<->blocking with no deploy (plan §5.3).
    """

    __tablename__ = "rule_thresholds"
    __table_args__ = (
        UniqueConstraint("rule_name", "project_id", "threshold_key"),
        CheckConstraint("mode IN ('advisory','blocking')", name="ck_rule_threshold_mode"),
    )

    rule_name: Mapped[str] = mapped_column(String(100), nullable=False)
    project_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))  # NULL = global default
    threshold_key: Mapped[str] = mapped_column(String(100), nullable=False)
    threshold_value: Mapped[Decimal | None] = mapped_column(Numeric(12, 4))
    mode: Mapped[str] = mapped_column(String(10), nullable=False, default="advisory")
    is_active: Mapped[bool] = mapped_column(default=True)
