"""add missing UPDATE policies for finalized_month and exception_log

Revision ID: 0004
Revises: 0003
Create Date: 2026-07-02

Discovered live: migration 0002 only gave non-CREATED_BY_TABLES a SELECT and
INSERT policy. Postgres RLS defaults to DENY for any action with no policy --
so reopening a finalized month (an UPDATE on finalized_month.status) matched
zero rows and SQLAlchemy raised StaleDataError, not a clean RLS error. Same
gap exists for exception_log's Phase-2 resolve action (status/resolution_type/
resolver_reason/resolved_by/resolved_at). audit_log and
monthly_abstract_snapshot deliberately keep NO update policy -- both are
append-only/immutable by design (plan §3.1/§5.5) -- this migration does not
touch them.
"""

from alembic import op

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None

TABLES_NEEDING_UPDATE = ["finalized_month", "exception_log"]


def upgrade() -> None:
    for table in TABLES_NEEDING_UPDATE:
        op.execute(
            f"CREATE POLICY upd_{table} ON {table} FOR UPDATE "
            f"USING (can_access_project(project_id)) WITH CHECK (can_access_project(project_id))"
        )


def downgrade() -> None:
    for table in TABLES_NEEDING_UPDATE:
        op.execute(f"DROP POLICY IF EXISTS upd_{table} ON {table}")
