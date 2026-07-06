import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import CheckConstraint, Computed, ForeignKey, Numeric, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.mixins import CreatedAtMixin, TenantMixin, UUIDPkMixin


class Grn(UUIDPkMixin, TenantMixin, CreatedAtMixin, Base):
    """Goods Receipt Note. No contractor_id — steel is received into a shared
    store pool, never earmarked to a contractor at receipt (plan §5.3, confirmed
    with My Home store management).
    """

    __tablename__ = "grn"
    __table_args__ = (
        CheckConstraint("weighbridge_weight_kg > 0", name="ck_grn_weight_positive"),
        CheckConstraint(
            "receipt_type IN ('against_po','other_site_sap','other_site_excel')",
            name="ck_grn_receipt_type",
        ),
    )

    vendor_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("vendors.id"), nullable=False)
    dia_grade_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("dia_grades.id"), nullable=False)
    po_reference: Mapped[str | None] = mapped_column(String(100))
    weighbridge_weight_kg: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    receipt_type: Mapped[str] = mapped_column(String(20), nullable=False)
    source_site: Mapped[str | None] = mapped_column(String(100))  # set when receipt_type = other_site_*
    gate_entry_at: Mapped[datetime] = mapped_column(nullable=False)
    effective_date: Mapped[date] = mapped_column(nullable=False)  # gate_entry_at::date, set by service
    slip_photo_uri: Mapped[str | None] = mapped_column(String(500))
    notes: Mapped[str | None] = mapped_column(Text)
    corrected_from_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("grn.id"))
    created_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)

    # Upstream document capture (plan §3.5, migration 0005) -- all nullable.
    # A GRN with none of these set still saves; it just carries the
    # inbound-reconciliation advisory ("no PO/invoice to check against")
    # instead of a proven match. weighbridge_weight_kg above remains the
    # accepted net; gross/tare let the service PROVE that net against the slip.
    po_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("purchase_order.id"))
    supplier_invoice_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("supplier_invoice.id")
    )
    gross_weight_kg: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    tare_weight_kg: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))


class StoreIssue(UUIDPkMixin, TenantMixin, CreatedAtMixin, Base):
    """Issue to contractor — the core-bug fix (plan §3.2). D = SUM(out) - SUM(in),
    a genuine sum of these rows, never `= net received` by formula.
    """

    __tablename__ = "store_issue"
    __table_args__ = (
        CheckConstraint("quantity_kg > 0", name="ck_store_issue_qty_positive"),
        CheckConstraint("direction IN ('out','in')", name="ck_store_issue_direction"),
    )

    contractor_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("contractors.id"), nullable=False)
    dia_grade_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("dia_grades.id"), nullable=False)
    quantity_kg: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    direction: Mapped[str] = mapped_column(String(3), nullable=False)  # in = return to store
    issuing_staff: Mapped[str | None] = mapped_column(String(255))
    effective_date: Mapped[date] = mapped_column(nullable=False)
    corrected_from_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("store_issue.id"))
    created_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)


class StoreIssueGrnLink(Base):
    """Provenance join table — replaces an earlier linked_grn_ids UUID[] design,
    which could not carry a real FK. Postgres arrays can't enforce that a linked
    id actually exists; this table can (plan §3.2, fixed after cross-review).
    """

    __tablename__ = "store_issue_grn_link"

    store_issue_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("store_issue.id", ondelete="CASCADE"), primary_key=True
    )
    grn_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("grn.id"), primary_key=True)
    project_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("projects.id"), nullable=False)


class InterSiteTransfer(UUIDPkMixin, TenantMixin, CreatedAtMixin, Base):
    __tablename__ = "inter_site_transfer"
    __table_args__ = (
        CheckConstraint("quantity_kg > 0", name="ck_transfer_qty_positive"),
        CheckConstraint("flag IN ('loan','return')", name="ck_transfer_flag"),
        CheckConstraint("record_source IN ('sap','excel')", name="ck_transfer_source"),
    )

    from_project_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("projects.id"), nullable=False)
    to_project_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("projects.id"), nullable=False)
    dia_grade_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("dia_grades.id"), nullable=False)
    quantity_kg: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    flag: Mapped[str] = mapped_column(String(10), nullable=False)
    record_source: Mapped[str] = mapped_column(String(10), nullable=False)
    ho_approval_ref: Mapped[str | None] = mapped_column(String(100))
    expected_return_date: Mapped[date | None] = mapped_column()
    actual_return_date: Mapped[date | None] = mapped_column()
    effective_date: Mapped[date] = mapped_column(nullable=False)
    corrected_from_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("inter_site_transfer.id")
    )
    created_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)


class InterSiteTransferGrnLink(Base):
    """Same provenance mechanism as store_issue_grn_link — a transferred batch
    must trace back to the GRN it came from (plan §3.2, added after cross-review
    caught that the original design omitted this on transfers entirely).
    """

    __tablename__ = "inter_site_transfer_grn_link"

    transfer_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("inter_site_transfer.id", ondelete="CASCADE"), primary_key=True
    )
    grn_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("grn.id"), primary_key=True)
    project_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("projects.id"), nullable=False)


class BbsPlan(UUIDPkMixin, TenantMixin, CreatedAtMixin, Base):
    """Planned bar-mark quantities. dia_weights JSONB holds the sparse per-dia
    payload observed in the real BBS sheets (7 mostly-empty dia columns per row).
    """

    __tablename__ = "bbs_plan"

    tower_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("towers.id"), nullable=False)
    floor_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("floors.id"), nullable=False)
    element_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("elements.id"))
    bar_mark: Mapped[str | None] = mapped_column(String(50))
    pour_description: Mapped[str | None] = mapped_column(String(255))  # e.g. "Raft", "Footings", "JMR"
    dia_grade_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("dia_grades.id"), nullable=False)
    planned_weight_kg: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    dia_weights: Mapped[dict | None] = mapped_column(JSONB)  # sparse alt-dia breakdown, if the source row has one
    drawing_ref: Mapped[str | None] = mapped_column(String(100))
    contractor_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("contractors.id"))
    backfill_run_id: Mapped[str | None] = mapped_column(String(100))  # idempotent backfill replace key
    source_file: Mapped[str | None] = mapped_column(String(500))
    corrected_from_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("bbs_plan.id"))
    created_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)


class JmrActual(UUIDPkMixin, TenantMixin, CreatedAtMixin, Base):
    __tablename__ = "jmr_actual"

    tower_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("towers.id"), nullable=False)
    floor_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("floors.id"), nullable=False)
    element_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("elements.id"))
    bar_mark: Mapped[str | None] = mapped_column(String(50))
    dia_grade_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("dia_grades.id"), nullable=False)
    measured_weight_kg: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    contractor_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("contractors.id"))
    pour_number: Mapped[str | None] = mapped_column(String(50))
    drawing_ref: Mapped[str | None] = mapped_column(String(100))
    effective_date: Mapped[date] = mapped_column(nullable=False)
    corrected_from_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("jmr_actual.id"))
    created_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)


class ElementProgress(UUIDPkMixin, TenantMixin, CreatedAtMixin, Base):
    """The completion_pct mechanism for WIP (Section F). Matches the legacy
    sheet's observed x50% literal multiplier, captured as real data instead
    of a hardcoded number (plan §3.2, added after tracing the real formulas).
    """

    __tablename__ = "element_progress"
    __table_args__ = (
        UniqueConstraint("element_id", "as_of_date"),
        CheckConstraint("completion_pct BETWEEN 0 AND 100", name="ck_progress_pct_range"),
    )

    element_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("elements.id"), nullable=False)
    as_of_date: Mapped[date] = mapped_column(nullable=False)
    completion_pct: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False)
    created_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)


class PhysicalCount(UUIDPkMixin, TenantMixin, CreatedAtMixin, Base):
    __tablename__ = "physical_count"
    __table_args__ = (
        CheckConstraint("bundle_count >= 0", name="ck_pc_bundle_nonneg"),
        CheckConstraint("loose_rod_count >= 0", name="ck_pc_loose_nonneg"),
    )

    contractor_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("contractors.id"), nullable=False)
    dia_grade_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("dia_grades.id"), nullable=False)
    bundle_count: Mapped[int] = mapped_column(default=0)
    each_bundle_weight_kg: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    loose_rod_count: Mapped[int] = mapped_column(default=0)
    each_rod_weight_kg: Mapped[Decimal | None] = mapped_column(Numeric(12, 4))
    photo_uri: Mapped[str | None] = mapped_column(String(500))
    effective_date: Mapped[date] = mapped_column(nullable=False)
    notes: Mapped[str | None] = mapped_column(Text)
    corrected_from_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("physical_count.id"))
    created_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)

    # Without this, PhysicalCountResponse.model_validate(count) (from_attributes=True)
    # has no "cut_pieces" attribute to read on the ORM object at all -- caught before
    # it could become a 500 on the first physical-count creation.
    cut_pieces: Mapped[list["PhysicalCountCutPiece"]] = relationship(
        back_populates="physical_count", cascade="all, delete-orphan"
    )


class PhysicalCountCutPiece(UUIDPkMixin, Base):
    """Closes the biggest leak (PRD §3.2): classification is NOT NULL + CHECK
    enum, so an unclassified cut piece is rejected by the database itself.
    """

    __tablename__ = "physical_count_cut_piece"
    __table_args__ = (
        CheckConstraint("length_mm >= 0", name="ck_cutpiece_length_nonneg"),
        CheckConstraint("nos >= 0", name="ck_cutpiece_nos_nonneg"),
        CheckConstraint("weight_kg >= 0", name="ck_cutpiece_weight_nonneg"),
        CheckConstraint(
            "classification IN ('reusable','used_as_safety_steel','scrap')",
            name="ck_cutpiece_classification",
        ),
        CheckConstraint("length_mm > 1500 OR classification = 'scrap'", name="scrap_rule"),
    )

    physical_count_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("physical_count.id", ondelete="CASCADE"), nullable=False
    )
    project_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("projects.id"), nullable=False)
    length_mm: Mapped[int] = mapped_column(nullable=False)
    nos: Mapped[int] = mapped_column(nullable=False)
    weight_kg: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    classification: Mapped[str] = mapped_column(String(20), nullable=False)

    physical_count: Mapped["PhysicalCount"] = relationship(back_populates="cut_pieces")


class ScrapSale(UUIDPkMixin, TenantMixin, CreatedAtMixin, Base):
    __tablename__ = "scrap_sale"
    __table_args__ = (
        CheckConstraint("weight_kg > 0", name="ck_scrap_weight_positive"),
        CheckConstraint("rate_per_kg >= 0", name="ck_scrap_rate_nonneg"),
    )

    buyer_name: Mapped[str] = mapped_column(String(255), nullable=False)
    weight_kg: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    rate_per_kg: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    gate_pass_no: Mapped[str | None] = mapped_column(String(100))
    invoice_ref: Mapped[str | None] = mapped_column(String(100))
    # DB-generated (migration 0001: GENERATED ALWAYS AS weight_kg*rate_per_kg
    # STORED) -- this model previously omitted it entirely, so ORM instances
    # never had access to it. Computed() tells SQLAlchemy to exclude this from
    # INSERT/UPDATE (Postgres rejects explicit writes, even NULL, to a
    # GENERATED ALWAYS column) and re-fetch it after insert instead.
    total_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), Computed("weight_kg * rate_per_kg"))
    effective_date: Mapped[date] = mapped_column(nullable=False)
    notes: Mapped[str | None] = mapped_column(Text)
    corrected_from_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("scrap_sale.id"))
    created_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)


class MonthlyAbstractSnapshot(UUIDPkMixin, TenantMixin, CreatedAtMixin, Base):
    """Immutable finalized A-N output. The only place a summary number is
    ever persisted (plan §0 core invariant). Retained across reopen/re-finalize
    so history is never lost; finalized_month.current_snapshot_id (see
    app.models.system.FinalizedMonth) points at whichever is authoritative now.
    """

    __tablename__ = "monthly_abstract_snapshot"
    __table_args__ = (UniqueConstraint("project_id", "year", "month", "id"),)

    year: Mapped[int] = mapped_column(nullable=False)
    month: Mapped[int] = mapped_column(nullable=False)
    sections: Mapped[dict] = mapped_column(JSONB, nullable=False)
    source_txn_hash: Mapped[str | None] = mapped_column(String(64))
    pipeline_version: Mapped[str] = mapped_column(String(50), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="finalized")
    finalized_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
