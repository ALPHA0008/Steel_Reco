"""Record WHO resolved an exception, not just which account.

Site logins are shared per project ("qs_testproject"), so resolved_by names an
account rather than a person -- and the person changes across shifts and relief
staff. An approval overrides a check the tool is still failing, so the record
has to say which human made that call.

resolver_role is taken from the authenticated session, never typed: the role is
fixed for a project's QS account, and letting it be entered would make it a
claim rather than a fact. Only the name is entered.

Existing rows keep NULL -- they were resolved before this was captured, and
back-filling them with the account name would invent a signature that was never
given.

Revision ID: 0012
Revises: 0011
"""

import sqlalchemy as sa
from alembic import op

revision = "0012"
down_revision = "0011"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("exception_log", sa.Column("resolver_name", sa.String(120), nullable=True))
    op.add_column("exception_log", sa.Column("resolver_role", sa.String(40), nullable=True))
    # Deliberately no CHECK requiring a name alongside resolution_type: rows
    # resolved before this migration legitimately have none, and a constraint
    # that has to carve out "except the old ones" is a date-stamped rule that
    # rots. The requirement is enforced where it can be explained to the user
    # -- the schema layer and the service layer (see ExceptionService.resolve).


def downgrade() -> None:
    op.drop_column("exception_log", "resolver_role")
    op.drop_column("exception_log", "resolver_name")
