"""Add cycle-owned ISSP document compositions.

Revision ID: 20261013_compositions
Revises: 20260101_baseline
Create Date: 2026-10-13
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision: str = "20261013_compositions"
down_revision: Union[str, Sequence[str], None] = "20260101_baseline"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    if "issp_document_compositions" not in inspect(bind).get_table_names():
        op.create_table(
            "issp_document_compositions",
            sa.Column(
                "issp_period",
                sa.String(length=50),
                sa.ForeignKey("master_narratives.issp_period", onupdate="CASCADE", ondelete="CASCADE"),
                primary_key=True,
            ),
            sa.Column("composition_json", sa.JSON(), nullable=False),
            sa.Column("updated_by_user_id", sa.Integer(), nullable=True),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
        )


def downgrade() -> None:
    bind = op.get_bind()
    if "issp_document_compositions" in inspect(bind).get_table_names():
        op.drop_table("issp_document_compositions")