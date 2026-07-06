"""row-level security — tenant isolation enforced at the DB layer

Revision ID: 0002
Revises: 0001
Create Date: 2026-07-02

Implements plan §3.3: accessible_project_ids()/can_access_project() helper
functions, RLS enabled on every project-scoped table, SELECT/INSERT policies
per table. The app sets app.current_user_id / app.user_role as session GUCs
per request (app.database.set_rls_context) before any RLS-protected query runs.

Tables that are NOT project-scoped (vendors, contractors, dia_grades, users,
project_assignments) get no RLS here — they are company-wide or identity
tables, not tenant data (plan §3.1).
"""

from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None

# Every table carrying project_id directly. store_issue_grn_link and
# inter_site_transfer_grn_link also carry project_id (denormalized for RLS,
# plan §3.2) and are included. physical_count_cut_piece too.
PROJECT_SCOPED_TABLES = [
    "towers",
    "floors",
    "elements",
    "grn",
    "store_issue",
    "store_issue_grn_link",
    "inter_site_transfer",
    "inter_site_transfer_grn_link",
    "bbs_plan",
    "jmr_actual",
    "element_progress",
    "physical_count",
    "physical_count_cut_piece",
    "scrap_sale",
    "monthly_abstract_snapshot",
    "finalized_month",
    "audit_log",
    "exception_log",
]

# Tables where a row is a direct user-authored transaction (has created_by) —
# these get an INSERT policy that also checks created_by matches the caller,
# so a request can't forge another user's authorship even within their own project.
CREATED_BY_TABLES = [
    "grn",
    "store_issue",
    "inter_site_transfer",
    "bbs_plan",
    "jmr_actual",
    "element_progress",
    "physical_count",
    "scrap_sale",
]

# projects itself is the tenant root — handled separately since its own
# id (not a project_id column) is what can_access_project checks.


def upgrade() -> None:
    op.execute(
        """
        CREATE OR REPLACE FUNCTION accessible_project_ids() RETURNS SETOF UUID
        LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
        AS $$
            SELECT project_id FROM project_assignments
             WHERE user_id = NULLIF(current_setting('app.current_user_id', true), '')::UUID
            UNION
            SELECT id FROM projects
             WHERE current_setting('app.user_role', true) = 'admin'
        $$;
        """
    )
    op.execute(
        """
        CREATE OR REPLACE FUNCTION can_access_project(p UUID) RETURNS BOOLEAN
        LANGUAGE SQL STABLE
        AS $$
            SELECT p IN (SELECT accessible_project_ids())
        $$;
        """
    )

    # ---- projects itself
    op.execute("ALTER TABLE projects ENABLE ROW LEVEL SECURITY")
    op.execute("CREATE POLICY sel_projects ON projects FOR SELECT USING (can_access_project(id))")
    op.execute(
        "CREATE POLICY ins_projects ON projects FOR INSERT "
        "WITH CHECK (current_setting('app.user_role', true) = 'admin')"
    )
    op.execute(
        "CREATE POLICY upd_projects ON projects FOR UPDATE "
        "USING (can_access_project(id)) WITH CHECK (can_access_project(id))"
    )

    for table in PROJECT_SCOPED_TABLES:
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
            # join tables / system-authored tables (link tables, audit_log,
            # exception_log, finalized_month, monthly_abstract_snapshot,
            # physical_count_cut_piece) — scoped by project only, no
            # per-row-author check since they don't carry created_by directly.
            op.execute(
                f"CREATE POLICY ins_{table} ON {table} FOR INSERT WITH CHECK (can_access_project(project_id))"
            )

    # audit_log is append-only: no UPDATE or DELETE policy for any role.
    # No non-admin role has a DELETE policy on ANY project-scoped table —
    # deletion never happens; corrections are new rows (plan §5.1).


def downgrade() -> None:
    for table in reversed(PROJECT_SCOPED_TABLES):
        op.execute(f"DROP POLICY IF EXISTS sel_{table} ON {table}")
        op.execute(f"DROP POLICY IF EXISTS ins_{table} ON {table}")
        op.execute(f"DROP POLICY IF EXISTS upd_{table} ON {table}")
        op.execute(f"ALTER TABLE {table} DISABLE ROW LEVEL SECURITY")

    op.execute("DROP POLICY IF EXISTS upd_projects ON projects")
    op.execute("DROP POLICY IF EXISTS ins_projects ON projects")
    op.execute("DROP POLICY IF EXISTS sel_projects ON projects")
    op.execute("ALTER TABLE projects DISABLE ROW LEVEL SECURITY")

    op.execute("DROP FUNCTION IF EXISTS can_access_project(UUID)")
    op.execute("DROP FUNCTION IF EXISTS accessible_project_ids()")
