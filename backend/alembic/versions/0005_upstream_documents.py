"""upstream document capture — purchase orders, supplier invoices, quality checks

Revision ID: 0005
Revises: 0004
Create Date: 2026-07-06

Implements plan §3.5 (the 2026-07 process reframing): the GRN was treated as
a trusted entry point; under the trust-tier model (PROCESS_AND_VALIDATION.md
§2) it is Tier-2 and must be validated against its PO + supplier invoice +
weighbridge (Tier-1 anchors). This migration is purely additive: five new
project-scoped tables + four nullable columns on grn. Nothing downstream of
grn (issue/transfer/BBS/JMR/physical/scrap/A-N/month-close) is touched, and
no existing grn row's meaning changes -- every new grn column defaults to
NULL, matching the "GRN trusted only for the frozen historical back-test,
validated upstream going forward" clarification (plan §0.5 point 2).
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None

NEW_TABLES = [
    "purchase_order",
    "purchase_order_line",
    "supplier_invoice",
    "supplier_invoice_line",
    "quality_check",
]

# Tables with created_by -- get the per-row-author INSERT/UPDATE policy
# (plan §3.3's CREATED_BY_TABLES pattern). Line tables have no created_by of
# their own (they're inserted alongside their parent, same as other line
# shapes in this schema) so they get project-only policies, like the
# existing join tables.
CREATED_BY_TABLES = ["purchase_order", "supplier_invoice", "quality_check"]


def upgrade() -> None:
    op.create_table(
        "purchase_order",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), primary_key=True),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("po_number", sa.String(100), nullable=False),
        sa.Column("vendor_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("vendors.id"), nullable=False),
        sa.Column("order_date", sa.Date, nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="open"),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.func.now()),
        sa.CheckConstraint("status IN ('open','partial','closed','cancelled')", name="ck_po_status"),
    )
    op.create_index("idx_po_project", "purchase_order", ["project_id"])
    op.create_index("idx_po_vendor", "purchase_order", ["vendor_id"])

    op.create_table(
        "purchase_order_line",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), primary_key=True),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("po_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("purchase_order.id", ondelete="CASCADE"), nullable=False),
        sa.Column("dia_grade_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("dia_grades.id"), nullable=False),
        sa.Column("ordered_qty_kg", sa.Numeric(12, 2), nullable=False),
        sa.Column("rate_per_kg", sa.Numeric(12, 4)),
        sa.CheckConstraint("ordered_qty_kg > 0", name="ck_po_line_qty_positive"),
    )
    op.create_index("idx_po_line_po", "purchase_order_line", ["po_id"])
    op.create_index("idx_po_line_project", "purchase_order_line", ["project_id"])

    op.create_table(
        "supplier_invoice",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), primary_key=True),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("invoice_number", sa.String(100), nullable=False),
        sa.Column("vendor_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("vendors.id"), nullable=False),
        sa.Column("po_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("purchase_order.id")),
        sa.Column("invoice_date", sa.Date, nullable=False),
        sa.Column("eway_bill_number", sa.String(50)),
        sa.Column("vehicle_number", sa.String(20)),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("idx_invoice_project", "supplier_invoice", ["project_id"])
    op.create_index("idx_invoice_po", "supplier_invoice", ["po_id"])

    op.create_table(
        "supplier_invoice_line",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), primary_key=True),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("invoice_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("supplier_invoice.id", ondelete="CASCADE"), nullable=False),
        sa.Column("dia_grade_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("dia_grades.id"), nullable=False),
        sa.Column("invoiced_qty_kg", sa.Numeric(12, 2), nullable=False),
        sa.Column("rate_per_kg", sa.Numeric(12, 4)),
        sa.CheckConstraint("invoiced_qty_kg > 0", name="ck_invoice_line_qty_positive"),
    )
    op.create_index("idx_invoice_line_invoice", "supplier_invoice_line", ["invoice_id"])
    op.create_index("idx_invoice_line_project", "supplier_invoice_line", ["project_id"])

    op.create_table(
        "quality_check",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), primary_key=True),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("grn_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("grn.id"), nullable=False),
        sa.Column("mtc_number", sa.String(100)),
        sa.Column("grade", sa.String(20)),
        sa.Column("accepted_qty_kg", sa.Numeric(12, 2), nullable=False),
        sa.Column("rejected_qty_kg", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("remarks", sa.Text),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.func.now()),
        sa.CheckConstraint("accepted_qty_kg >= 0", name="ck_qc_accepted_nonneg"),
        sa.CheckConstraint("rejected_qty_kg >= 0", name="ck_qc_rejected_nonneg"),
    )
    op.create_index("idx_qc_project", "quality_check", ["project_id"])
    op.create_index("idx_qc_grn", "quality_check", ["grn_id"])

    # ---- grn extension: all nullable, no backfill needed on existing rows.
    # weighbridge_weight_kg (existing, §3.2) remains section A's accepted-net
    # source; gross/tare let the service PROVE that net against the slip.
    op.add_column("grn", sa.Column("po_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("purchase_order.id")))
    op.add_column("grn", sa.Column("supplier_invoice_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("supplier_invoice.id")))
    op.add_column("grn", sa.Column("gross_weight_kg", sa.Numeric(12, 2)))
    op.add_column("grn", sa.Column("tare_weight_kg", sa.Numeric(12, 2)))

    # ---- RLS (plan §3.3 pattern) -- can_access_project() already exists (0002)
    for table in NEW_TABLES:
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
        op.execute(f"CREATE POLICY sel_{table} ON {table} FOR SELECT USING (can_access_project(project_id))")
        if table in CREATED_BY_TABLES:
            op.execute(
                f"CREATE POLICY ins_{table} ON {table} FOR INSERT WITH CHECK ("
                f"  can_access_project(project_id) AND "
                f"  created_by = NULLIF(current_setting('app.current_user_id', true), '')::UUID"
                f")"
            )
            op.execute(
                f"CREATE POLICY upd_{table} ON {table} FOR UPDATE "
                f"USING (can_access_project(project_id)) WITH CHECK (can_access_project(project_id))"
            )
        else:
            op.execute(
                f"CREATE POLICY ins_{table} ON {table} FOR INSERT WITH CHECK (can_access_project(project_id))"
            )
    # purchase_order.status is updated as lines are received against it (open ->
    # partial -> closed) -- give it an UPDATE policy even though it's in
    # CREATED_BY_TABLES already covers this; explicit for clarity, no-op if duplicate.


def downgrade() -> None:
    for table in reversed(NEW_TABLES):
        op.execute(f"DROP POLICY IF EXISTS upd_{table} ON {table}")
        op.execute(f"DROP POLICY IF EXISTS ins_{table} ON {table}")
        op.execute(f"DROP POLICY IF EXISTS sel_{table} ON {table}")
        op.execute(f"ALTER TABLE {table} DISABLE ROW LEVEL SECURITY")

    op.drop_column("grn", "tare_weight_kg")
    op.drop_column("grn", "gross_weight_kg")
    op.drop_column("grn", "supplier_invoice_id")
    op.drop_column("grn", "po_id")

    for table in reversed(NEW_TABLES):
        op.drop_table(table)
