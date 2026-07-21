import uuid
from decimal import Decimal

from sqlalchemy import CheckConstraint, ForeignKey, Numeric, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.mixins import CreatedAtMixin, UUIDPkMixin


class Project(UUIDPkMixin, CreatedAtMixin, Base):
    __tablename__ = "projects"
    __table_args__ = (CheckConstraint("status IN ('active','closed')", name="ck_project_status"),)

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    location: Mapped[str | None] = mapped_column(String(255))
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active")
    contract_wastage_pct: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False, default=Decimal("3.00"))
    signup_code: Mapped[str | None] = mapped_column(String(32))
    """Gates self-service QS signup to this project (migration 0006). None
    until an admin sets one; a project with no code cannot be signed up
    against."""

    # Optional site coordinates for the admin geo-map (migration 0009).
    # Nullable: a site with no coords just doesn't plot.
    latitude: Mapped[Decimal | None] = mapped_column(Numeric(9, 6))
    longitude: Mapped[Decimal | None] = mapped_column(Numeric(9, 6))


class Tower(UUIDPkMixin, CreatedAtMixin, Base):
    __tablename__ = "towers"
    __table_args__ = (UniqueConstraint("project_id", "name"),)

    project_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("projects.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    sequence: Mapped[int] = mapped_column(default=0)


class Floor(UUIDPkMixin, CreatedAtMixin, Base):
    __tablename__ = "floors"
    __table_args__ = (UniqueConstraint("tower_id", "level_name"),)

    tower_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("towers.id"), nullable=False)
    project_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("projects.id"), nullable=False)
    level_name: Mapped[str] = mapped_column(String(100), nullable=False)  # e.g. "B3","B2","B1","GF","1F"
    sequence: Mapped[int] = mapped_column(default=0)


class Element(UUIDPkMixin, CreatedAtMixin, Base):
    __tablename__ = "elements"
    __table_args__ = (
        UniqueConstraint("floor_id", "element_type", "name"),
        CheckConstraint(
            "element_type IN ('footing','column','shear_wall','slab','staircase','ramp',"
            "'retaining_wall','beam','podium','misc')",
            name="ck_element_type",
        ),
    )

    tower_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("towers.id"), nullable=False)
    floor_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("floors.id"), nullable=False)
    project_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("projects.id"), nullable=False)
    element_type: Mapped[str] = mapped_column(String(50), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
