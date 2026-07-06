"""non-superuser application role — RLS is a no-op for superusers/table owners

Revision ID: 0003
Revises: 0002
Create Date: 2026-07-02

Discovered during Foundation verification (plan §3.3 assumed this but never
stated it explicitly): PostgreSQL superusers and table owners BYPASS Row-Level
Security entirely, by design (rolbypassrls). The steel_recon role created by
docker-compose's POSTGRES_USER is automatically a superuser -- so every RLS
policy in 0002 was a documented no-op until this migration, verified live:
a QS-scoped session could read AND WRITE another project's rows with zero
RLS errors, because Postgres never even evaluated the policies for that role.

This migration creates a dedicated, non-superuser, non-owner application role
that the running API connects as. Migrations themselves continue to run as
the superuser/owner (steel_recon), since DDL changes are an operator action,
not a tenant-scoped one -- only the app's runtime connection needs this role.
"""

from alembic import op

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None

APP_ROLE = "steel_recon_app"


def upgrade() -> None:
    op.execute(
        f"""
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '{APP_ROLE}') THEN
                CREATE ROLE {APP_ROLE} LOGIN PASSWORD 'dev_app_password' NOSUPERUSER NOBYPASSRLS;
            END IF;
        END
        $$;
        """
    )
    op.execute(f"GRANT USAGE ON SCHEMA public TO {APP_ROLE}")
    # SELECT/INSERT/UPDATE on everything -- RLS policies (0002) restrict rows,
    # this only grants the operation category. No DELETE anywhere: the ledger
    # is append-only (plan §5.1); corrections are new rows, never mutations.
    op.execute(f"GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO {APP_ROLE}")
    # audit_log gets SELECT+INSERT only, no UPDATE -- append-only, no edits (plan §3.1)
    op.execute(f"REVOKE UPDATE ON audit_log FROM {APP_ROLE}")
    op.execute(f"GRANT EXECUTE ON FUNCTION accessible_project_ids() TO {APP_ROLE}")
    op.execute(f"GRANT EXECUTE ON FUNCTION can_access_project(UUID) TO {APP_ROLE}")
    # Future tables created by later migrations should inherit these grants automatically:
    op.execute(f"ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE ON TABLES TO {APP_ROLE}")


def downgrade() -> None:
    op.execute(f"ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE SELECT, INSERT, UPDATE ON TABLES FROM {APP_ROLE}")
    # Function EXECUTE grants must be revoked explicitly -- DROP ROLE fails with
    # DependentObjectsStillExistError otherwise (discovered running this downgrade live).
    op.execute(f"REVOKE EXECUTE ON FUNCTION can_access_project(UUID) FROM {APP_ROLE}")
    op.execute(f"REVOKE EXECUTE ON FUNCTION accessible_project_ids() FROM {APP_ROLE}")
    op.execute(f"REVOKE ALL ON ALL TABLES IN SCHEMA public FROM {APP_ROLE}")
    op.execute(f"REVOKE USAGE ON SCHEMA public FROM {APP_ROLE}")
    op.execute(f"DROP ROLE IF EXISTS {APP_ROLE}")
