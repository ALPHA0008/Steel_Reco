"""weight CHECK constraints — close the negative/zero-weight manipulation gaps

Revision ID: 0008
Revises: 0007
Create Date: 2026-07

The sweep found three numeric columns with NO CHECK backstop, unlike every
other weight/quantity in the schema (grn.weighbridge_weight_kg > 0,
store_issue.quantity_kg > 0, scrap_sale.weight_kg > 0 all existed from 0001):

1. jmr_actual.measured_weight_kg -- a negative measured weight would SUBTRACT
   from Section E (consumption), letting a contractor's booked consumption be
   silently understated (lower consumption -> higher theoretical stock ->
   masks wastage). Zero is meaningless as a measurement.
2. bbs_plan.planned_weight_kg -- a zero/negative planned weight corrupts the
   BBS-vs-consumption ceiling the manipulation rules check against.
3. grn gross/tare -- no constraint that tare < gross, so a GRN could carry a
   tare heavier than its gross (net negative), which the inbound-reconciliation
   rule then compares against the weighbridge net nonsensically.

Verified against live data before adding: zero rows violate any of these, so
the constraints apply cleanly (no NOT VALID / backfill needed).

Pydantic gt=0 guards are added alongside (app.schemas.transactions) so the
common case is a clean 422 field error, not a generic data_integrity_error --
but these DB CHECKs are the real enforcement, matching the existing pattern.
"""

from alembic import op

revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_check_constraint(
        "ck_jmr_measured_weight_positive", "jmr_actual", "measured_weight_kg > 0"
    )
    op.create_check_constraint(
        "ck_bbs_planned_weight_positive", "bbs_plan", "planned_weight_kg > 0"
    )
    # gross/tare are nullable (only present when weighbridge slip is captured);
    # the CHECK only bites when BOTH are given -- a partial slip stays valid.
    op.create_check_constraint(
        "ck_grn_tare_below_gross",
        "grn",
        "gross_weight_kg IS NULL OR tare_weight_kg IS NULL OR tare_weight_kg < gross_weight_kg",
    )


def downgrade() -> None:
    op.drop_constraint("ck_grn_tare_below_gross", "grn", type_="check")
    op.drop_constraint("ck_bbs_planned_weight_positive", "bbs_plan", type_="check")
    op.drop_constraint("ck_jmr_measured_weight_positive", "jmr_actual", type_="check")
