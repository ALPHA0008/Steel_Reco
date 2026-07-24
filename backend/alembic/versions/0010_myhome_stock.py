"""Add myhome_stock table -- steel physically sitting at My Home's own yard
(distinct from contractor-held physical_count stock).

This is a new physical-stock bucket the Abstract's Total Physical (K) rolls
up alongside I (full length) and J (cut pieces): K = I + J + MyHome. Same
"latest snapshot per dia, never summed" semantics as physical_count -- a QS
records the current MyHome-yard quantity per diameter, and only the newest
row per dia counts.

Purely additive: one new table, RLS policies scoped like every other
project-scoped transaction table. Touches no existing table or data.

Revision ID: 0010
Revises: 0009
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0010"
down_revision = "0009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "myhome_stock",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), primary_key=True),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("dia_grade_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("dia_grades.id"), nullable=False),
        sa.Column("qty_kg", sa.Numeric(12, 2), nullable=False),
        sa.Column("effective_date", sa.Date, nullable=False),
        sa.Column("notes", sa.Text),
        sa.Column("corrected_from_id", postgresql.UUID(as_uuid=True)),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.func.now()),
        sa.CheckConstraint("qty_kg >= 0", name="ck_myhome_stock_qty_nonneg"),
    )
    op.create_foreign_key(
        "fk_myhome_stock_corrected_from", "myhome_stock", "myhome_stock", ["corrected_from_id"], ["id"]
    )
    op.create_index(
        "idx_myhome_stock_dia_date", "myhome_stock", ["project_id", "dia_grade_id", "effective_date"]
    )

    # RLS, following the exact pattern of every other project-scoped,
    # created_by-carrying transaction table (migration 0002).
    op.execute("ALTER TABLE myhome_stock ENABLE ROW LEVEL SECURITY")
    op.execute("CREATE POLICY sel_myhome_stock ON myhome_stock FOR SELECT USING (can_access_project(project_id))")
    op.execute(
        "CREATE POLICY ins_myhome_stock ON myhome_stock FOR INSERT WITH CHECK ("
        "  can_access_project(project_id) AND "
        "  created_by = NULLIF(current_setting('app.current_user_id', true), '')::UUID"
        ")"
    )
    op.execute(
        "CREATE POLICY upd_myhome_stock ON myhome_stock FOR UPDATE "
        "USING (can_access_project(project_id)) WITH CHECK (can_access_project(project_id))"
    )


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS upd_myhome_stock ON myhome_stock")
    op.execute("DROP POLICY IF EXISTS ins_myhome_stock ON myhome_stock")
    op.execute("DROP POLICY IF EXISTS sel_myhome_stock ON myhome_stock")
    op.execute("ALTER TABLE myhome_stock DISABLE ROW LEVEL SECURITY")
    op.drop_table("myhome_stock")
