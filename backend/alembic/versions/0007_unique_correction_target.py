"""unique correction target — DB-level guard against correction forks

Revision ID: 0007
Revises: 0006
Create Date: 2026-07

The service layer already rejects correcting a row that another row
supersedes (AlreadyCorrected, corrections chain A<-B<-C and never fork),
but that check is read-then-write: two concurrent corrections of the same
original can both pass the SELECT before either INSERT lands, leaving two
"active" replacements that both count in the Abstract — the exact
double-count the correction workflow exists to prevent.

A partial unique index on corrected_from_id makes the invariant a database
guarantee: the second INSERT fails with a unique violation (surfaced as the
existing generic data_integrity_error 422) no matter how the writes race.
Partial (WHERE corrected_from_id IS NOT NULL) because ordinary entries all
carry NULL there and NULLs must stay unrestricted.

Applied to every transaction table that has the corrected_from_id column,
not just jmr_actual — the column exists schema-wide and the fork hazard is
identical wherever a correction workflow lands next.
"""

from alembic import op
import sqlalchemy as sa

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None

# every transaction table carrying corrected_from_id (schema-wide audit
# column from 0001) — indexed uniformly so a future correction workflow on
# any of them inherits the fork guard for free.
_TABLES = [
    "grn",
    "inter_site_transfer",
    "store_issue",
    "jmr_actual",
    "physical_count",
    "scrap_sale",
]


def upgrade() -> None:
    for table in _TABLES:
        op.create_index(
            f"uq_{table}_corrected_from_id",
            table,
            ["corrected_from_id"],
            unique=True,
            postgresql_where=sa.text("corrected_from_id IS NOT NULL"),
        )


def downgrade() -> None:
    for table in _TABLES:
        op.drop_index(f"uq_{table}_corrected_from_id", table_name=table)
