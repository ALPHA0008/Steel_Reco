"""Add nullable latitude/longitude to projects for the admin geo-map.

Purely additive: two nullable NUMERIC columns. Touches no existing data and
no other table. Sites without coordinates simply don't appear on the map.

Revision ID: 0009
Revises: 0008
"""
import sqlalchemy as sa
from alembic import op

revision = "0009"
down_revision = "0008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("projects", sa.Column("latitude", sa.Numeric(9, 6), nullable=True))
    op.add_column("projects", sa.Column("longitude", sa.Numeric(9, 6), nullable=True))


def downgrade() -> None:
    op.drop_column("projects", "longitude")
    op.drop_column("projects", "latitude")
