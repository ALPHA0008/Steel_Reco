"""Validated exception resolution: follow-ups carry a due date and a pending
state, and 'corrected' claims are re-checked against live data.

Before this, resolving an exception simply believed whatever the QS typed --
"corrected" marked it resolved without checking the data was actually fixed,
and "follow up" closed it with no commitment to when. This adds the state and
audit fields that make a resolution provable:

  status gains 'pending'  -- a follow-up that has been promised but not yet
                            actioned. NOT resolved: it still blocks finalize
                            and re-surfaces once its due date passes.
  follow_up_due_date      -- when the QS committed to resolving it. Required
                            for follow_up, rejected past the finalize horizon.
  validation_state        -- how the claim was checked: 'verified' (the rule
                            was re-run and now passes), 'accepted' (a conscious
                            approve-as-is override), or 'pending' (awaiting the
                            follow-up date).
  validated_at            -- when the re-check ran.
  reopened_count          -- how many times an overdue follow-up has bounced
                            back into the queue, so chronic deferral is visible.

Purely additive; every existing row keeps its current status and gets NULL for
the new columns (a resolved row stays resolved).

Revision ID: 0011
Revises: 0010
"""
import sqlalchemy as sa
from alembic import op

revision = "0011"
down_revision = "0010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("exception_log", sa.Column("follow_up_due_date", sa.Date, nullable=True))
    op.add_column("exception_log", sa.Column("validation_state", sa.String(20), nullable=True))
    op.add_column("exception_log", sa.Column("validated_at", sa.TIMESTAMP(timezone=True), nullable=True))
    op.add_column(
        "exception_log",
        sa.Column("reopened_count", sa.Integer, nullable=False, server_default="0"),
    )

    # 'pending' joins the status enum. Drop and recreate the CHECK rather than
    # ALTER, since Postgres has no "add value to CHECK" operation.
    op.drop_constraint("ck_exception_status", "exception_log", type_="check")
    op.create_check_constraint(
        "ck_exception_status",
        "exception_log",
        "status IN ('open','pending','resolved','dismissed')",
    )

    op.create_check_constraint(
        "ck_exception_validation_state",
        "exception_log",
        "validation_state IS NULL OR validation_state IN ('verified','accepted','pending')",
    )

    # A pending follow-up must carry the date it was promised for -- that date
    # is what makes it enforceable rather than an open-ended deferral.
    op.create_check_constraint(
        "ck_exception_pending_needs_due_date",
        "exception_log",
        "status <> 'pending' OR follow_up_due_date IS NOT NULL",
    )

    # Finding overdue follow-ups is the hot query for the reminder sweep.
    op.create_index(
        "idx_exception_pending_due",
        "exception_log",
        ["project_id", "status", "follow_up_due_date"],
    )


def downgrade() -> None:
    op.drop_index("idx_exception_pending_due", table_name="exception_log")
    op.drop_constraint("ck_exception_pending_needs_due_date", "exception_log", type_="check")
    op.drop_constraint("ck_exception_validation_state", "exception_log", type_="check")

    # Any row parked in 'pending' has no home in the old enum -- send it back to
    # 'open', which is what it effectively is (unresolved and blocking).
    op.execute("UPDATE exception_log SET status = 'open' WHERE status = 'pending'")
    op.drop_constraint("ck_exception_status", "exception_log", type_="check")
    op.create_check_constraint(
        "ck_exception_status",
        "exception_log",
        "status IN ('open','resolved','dismissed')",
    )

    op.drop_column("exception_log", "reopened_count")
    op.drop_column("exception_log", "validated_at")
    op.drop_column("exception_log", "validation_state")
    op.drop_column("exception_log", "follow_up_due_date")
