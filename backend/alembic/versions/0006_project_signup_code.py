"""project signup code — gates self-service QS signup to one project

Revision ID: 0006
Revises: 0005
Create Date: 2026-07

Adds a single nullable column, `projects.signup_code`. Self-service QS
signup (app.services.auth_service.signup) requires the caller to supply the
project's code along with which project they're joining -- otherwise anyone
who finds the signup page could pick any project and get full read/write
access to that site's ledger. Nullable so existing projects are unaffected
until an admin sets a code (POST /admin/projects/{id}/signup-code); a project
with no code set cannot be signed up against (enforced in the service, not
the DB, since "no code yet" and "wrong code" both mean "reject").

Purely additive: one column on a non-RLS-protected table (`projects` itself
carries RLS via can_access_project(), but this column has no bearing on any
existing query, section formula, or invariant).
"""

from alembic import op
import sqlalchemy as sa

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("projects", sa.Column("signup_code", sa.String(32), nullable=True))


def downgrade() -> None:
    op.drop_column("projects", "signup_code")
