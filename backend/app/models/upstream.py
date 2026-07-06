"""Upstream document capture (plan §3.5, 2026-07 process reframing).

Sits BEFORE the grn in the chain -- these tables and grn's new nullable
columns let the tool validate a GRN against its PO + supplier invoice +
weighbridge instead of trusting it outright (PROCESS_AND_VALIDATION.md §4).
Every field is nullable/optional: a site whose real flow lacks one of these
documents can still record a GRN -- the inbound-reconciliation rule simply
has less to check, per the "living catalogue" principle (plan §0.5 point 3).
"""

import uuid
from datetime import date
from decimal import Decimal

from sqlalchemy import CheckConstraint, ForeignKey, Numeric, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.mixins import CreatedAtMixin, TenantMixin, UUIDPkMixin


class PurchaseOrder(UUIDPkMixin, TenantMixin, CreatedAtMixin, Base):
    """Tier-1 anchor: contractual qty, centrally approved (plan §3.5)."""

    __tablename__ = "purchase_order"
    __table_args__ = (
        CheckConstraint(
            "status IN ('open','partial','closed','cancelled')", name="ck_po_status"
        ),
    )

    po_number: Mapped[str] = mapped_column(String(100), nullable=False)
    vendor_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("vendors.id"), nullable=False)
    order_date: Mapped[date] = mapped_column(nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="open")
    created_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)

    lines: Mapped[list["PurchaseOrderLine"]] = relationship(
        back_populates="purchase_order", cascade="all, delete-orphan"
    )


class PurchaseOrderLine(UUIDPkMixin, TenantMixin, Base):
    """Per-dia ordered qty + rate -- what Sigma(GRN) is checked against."""

    __tablename__ = "purchase_order_line"
    __table_args__ = (CheckConstraint("ordered_qty_kg > 0", name="ck_po_line_qty_positive"),)

    po_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("purchase_order.id", ondelete="CASCADE"), nullable=False
    )
    dia_grade_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("dia_grades.id"), nullable=False)
    ordered_qty_kg: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    rate_per_kg: Mapped[Decimal | None] = mapped_column(Numeric(12, 4))

    purchase_order: Mapped["PurchaseOrder"] = relationship(back_populates="lines")


class SupplierInvoice(UUIDPkMixin, TenantMixin, CreatedAtMixin, Base):
    """Tier-1 anchor: GST-tracked, hard to fabricate (plan §3.5)."""

    __tablename__ = "supplier_invoice"

    invoice_number: Mapped[str] = mapped_column(String(100), nullable=False)
    vendor_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("vendors.id"), nullable=False)
    po_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("purchase_order.id"))
    invoice_date: Mapped[date] = mapped_column(nullable=False)
    eway_bill_number: Mapped[str | None] = mapped_column(String(50))
    vehicle_number: Mapped[str | None] = mapped_column(String(20))
    created_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)

    lines: Mapped[list["SupplierInvoiceLine"]] = relationship(
        back_populates="supplier_invoice", cascade="all, delete-orphan"
    )


class SupplierInvoiceLine(UUIDPkMixin, TenantMixin, Base):
    __tablename__ = "supplier_invoice_line"
    __table_args__ = (CheckConstraint("invoiced_qty_kg > 0", name="ck_invoice_line_qty_positive"),)

    invoice_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("supplier_invoice.id", ondelete="CASCADE"), nullable=False
    )
    dia_grade_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("dia_grades.id"), nullable=False)
    invoiced_qty_kg: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    rate_per_kg: Mapped[Decimal | None] = mapped_column(Numeric(12, 4))

    supplier_invoice: Mapped["SupplierInvoice"] = relationship(back_populates="lines")


class QualityCheck(UUIDPkMixin, TenantMixin, CreatedAtMixin, Base):
    """Acceptance record, child of grn -- MTC/QC fields represented here
    rather than as their own tables until a site's flow shows they need to
    be first-class (plan §3.5, the living-catalogue principle)."""

    __tablename__ = "quality_check"
    __table_args__ = (
        CheckConstraint("accepted_qty_kg >= 0", name="ck_qc_accepted_nonneg"),
        CheckConstraint("rejected_qty_kg >= 0", name="ck_qc_rejected_nonneg"),
    )

    grn_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("grn.id"), nullable=False)
    mtc_number: Mapped[str | None] = mapped_column(String(100))
    grade: Mapped[str | None] = mapped_column(String(20))
    accepted_qty_kg: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    rejected_qty_kg: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    remarks: Mapped[str | None] = mapped_column(Text)
    created_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
