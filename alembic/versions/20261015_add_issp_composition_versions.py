"""Add ISSP composition version history.

Revision ID: 20261015_comp_versions
Revises: 20261013_compositions
Create Date: 2026-10-15
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision: str = "20261015_comp_versions"
down_revision: Union[str, Sequence[str], None] = "20261013_compositions"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    if "issp_composition_versions" not in inspect(bind).get_table_names():
        op.create_table(
            "issp_composition_versions",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column(
                "issp_period",
                sa.String(length=50),
                sa.ForeignKey("master_narratives.issp_period", onupdate="CASCADE", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("composition_json", sa.JSON(), nullable=False),
            sa.Column("saved_by_user_id", sa.Integer(), nullable=True),
            sa.Column("saved_at", sa.DateTime(), nullable=False),
        )
        op.create_index("ix_issp_composition_versions_issp_period", "issp_composition_versions", ["issp_period"])


def downgrade() -> None:
    bind = op.get_bind()
    if "issp_composition_versions" in inspect(bind).get_table_names():
        op.drop_table("issp_composition_versions")
