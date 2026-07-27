import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import CheckConstraint, ForeignKey, Numeric, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.mixins import CreatedAtMixin, UUIDPkMixin


class User(UUIDPkMixin, CreatedAtMixin, Base):
    __tablename__ = "users"
    __table_args__ = (CheckConstraint("role IN ('QS','admin')", name="ck_user_role"),)

    username: Mapped[str] = mapped_column(String(100), nullable=False, unique=True)
    email: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(String(20), nullable=False, default="QS")
    is_active: Mapped[bool] = mapped_column(default=True)
    last_login_at: Mapped[datetime | None] = mapped_column()


class ProjectAssignment(UUIDPkMixin, Base):
    """Source of truth for tenant scope — accessible_project_ids() (plan §3.3)
    reads this table. One row per QS in v1; extensible to many-to-many later.
    """

    __tablename__ = "project_assignments"
    __table_args__ = (UniqueConstraint("user_id", "project_id"),)

    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    project_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("projects.id"), nullable=False)
    is_primary: Mapped[bool] = mapped_column(default=True)
    assigned_at: Mapped[datetime] = mapped_column(server_default=func.now())


class FinalizedMonth(UUIDPkMixin, Base):
    """Month-lock rows, kept separate from monthly_abstract_snapshot by design
    (plan §3.2) — a lock is a distinct concern from a snapshot's content, and a
    reopened+re-finalized month must produce a new snapshot version while
    keeping the original. current_snapshot_id is the explicit link between them.
    """

    __tablename__ = "finalized_month"
    __table_args__ = (
        UniqueConstraint("project_id", "year", "month"),
        CheckConstraint("month BETWEEN 1 AND 12", name="ck_finalized_month_range"),
        CheckConstraint("status IN ('locked','reopened')", name="ck_finalized_month_status"),
    )

    project_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("projects.id"), nullable=False)
    year: Mapped[int] = mapped_column(nullable=False)
    month: Mapped[int] = mapped_column(nullable=False)
    status: Mapped[str] = mapped_column(String(10), nullable=False, default="locked")
    reason: Mapped[str | None] = mapped_column(Text)  # required (app-enforced) when status='reopened'
    current_snapshot_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("monthly_abstract_snapshot.id")
    )
    locked_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    locked_at: Mapped[datetime] = mapped_column(server_default=func.now())


class AuditLog(UUIDPkMixin, Base):
    """Append-only. Written in the same transaction as the ledger write it
    describes (plan §5.3). The app DB role has no DELETE grant on this table.
    """

    __tablename__ = "audit_log"
    __table_args__ = (
        CheckConstraint(
            "action IN ('CREATE','UPDATE','DELETE','CORRECT','FINALIZE','REOPEN')",
            name="ck_audit_action",
        ),
    )

    user_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))
    project_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("projects.id"))
    table_name: Mapped[str] = mapped_column(String(100), nullable=False)
    row_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    action: Mapped[str] = mapped_column(String(20), nullable=False)
    before_json: Mapped[dict | None] = mapped_column(JSONB)
    after_json: Mapped[dict | None] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())


class ExceptionLog(UUIDPkMixin, Base):
    """Rules-engine output — a failed RuleResult IS this row (plan §5.2)."""

    __tablename__ = "exception_log"
    __table_args__ = (
        CheckConstraint("status IN ('open','pending','resolved','dismissed')", name="ck_exception_status"),
        CheckConstraint(
            "resolution_type IS NULL OR resolution_type IN ('approved','corrected','follow_up')",
            name="ck_exception_resolution_type",
        ),
        CheckConstraint(
            "validation_state IS NULL OR validation_state IN ('verified','accepted','pending')",
            name="ck_exception_validation_state",
        ),
        CheckConstraint(
            "status <> 'pending' OR follow_up_due_date IS NOT NULL",
            name="ck_exception_pending_needs_due_date",
        ),
    )

    project_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("projects.id"), nullable=False)
    rule_name: Mapped[str] = mapped_column(String(100), nullable=False)
    severity: Mapped[str] = mapped_column(String(20), nullable=False, default="advisory")
    transaction_table: Mapped[str | None] = mapped_column(String(100))
    transaction_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    threshold_value: Mapped[Decimal | None] = mapped_column(Numeric(14, 4))
    actual_value: Mapped[Decimal | None] = mapped_column(Numeric(14, 4))
    message: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="open")
    resolution_type: Mapped[str | None] = mapped_column(String(20))
    resolver_reason: Mapped[str | None] = mapped_column(Text)
    resolved_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))
    resolved_at: Mapped[datetime | None] = mapped_column()
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

    # Validated-resolution fields (migration 0011). A resolution is no longer
    # believed on the QS's word: 'corrected' is re-checked against live data,
    # and 'follow_up' must carry the date it was promised for and only reaches
    # 'resolved' once it is actually actioned.
    follow_up_due_date: Mapped[date | None] = mapped_column()
    validation_state: Mapped[str | None] = mapped_column(String(20))
    validated_at: Mapped[datetime | None] = mapped_column()
    reopened_count: Mapped[int] = mapped_column(default=0, server_default="0")
