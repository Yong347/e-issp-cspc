# alembic/versions/20261015_fix_created_by_students_not_null.py
"""fix_created_by_students_not_null

Revision ID: 20261015_fix_cbs_notnull
Revises: 20261010_reconcile_flows
Create Date: 2026-10-15 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic (<= 32 characters).
revision: str = '20261015_fix_cbs_notnull'
down_revision: Union[str, Sequence[str], None] = '20261010_reconcile_flows'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """
    Upgrades database schema to fix psycopg2 NotNullViolation on issp_core.created_by_students:
    1. Releases NOT NULL constraint on 'created_by_students' if present in 'issp_core'.
    2. Enforces server_default=false on 'created_by_students'.
    3. Ensures 'is_in_house_turnover' exists with server_default=false.
    4. Synchronizes existing NULL values between 'created_by_students' and 'is_in_house_turnover'.
    """
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    table_names = inspector.get_table_names()

    if 'issp_core' in table_names:
        cols = [c['name'] for c in inspector.get_columns('issp_core')]

        with op.batch_alter_table('issp_core', schema=None) as batch_op:
            if 'created_by_students' in cols:
                batch_op.alter_column(
                    'created_by_students',
                    existing_type=sa.Boolean(),
                    nullable=True,
                    server_default=sa.text('false')
                )
            else:
                batch_op.add_column(
                    sa.Column(
                        'created_by_students',
                        sa.Boolean(),
                        server_default=sa.text('false'),
                        nullable=True
                    )
                )

            if 'is_in_house_turnover' not in cols:
                batch_op.add_column(
                    sa.Column(
                        'is_in_house_turnover',
                        sa.Boolean(),
                        server_default=sa.text('false'),
                        nullable=False
                    )
                )

        # Backfill and synchronize values between the two alias columns
        op.execute(
            sa.text(
                "UPDATE issp_core "
                "SET created_by_students = COALESCE(is_in_house_turnover, false) "
                "WHERE created_by_students IS NULL"
            )
        )
        op.execute(
            sa.text(
                "UPDATE issp_core "
                "SET is_in_house_turnover = COALESCE(created_by_students, false) "
                "WHERE is_in_house_turnover IS NULL"
            )
        )


def downgrade() -> None:
    """Downgrade schema cleanly."""
    pass