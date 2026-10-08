# alembic/versions/20261010_reconcile_v2026_flows.py
"""reconcile_v2026_flows

Revision ID: 20261010_reconcile_flows
Revises: 20261005_purge_doctree
Create Date: 2026-10-10 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic (<= 32 characters).
revision: str = '20261010_reconcile_flows'
down_revision: Union[str, Sequence[str], None] = '20261005_purge_doctree'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """
    Upgrades database schema for DICT ISSP v.2026 workflow reconciliation:
    1. Adds multi-classification boolean flags (is_support_to_operations,
       is_general_administrative, is_operations) to 'information_systems',
       matching the independent checkboxes in DICT Template Part II.C & Part III.D.
    2. Backfills the new boolean classification columns from existing classification strings.
    3. Alters 'issp_core.outcome_id' to nullable (nullable=True), enabling department
       users to submit raw technical proposals prior to administrative outcome classification.
    """
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    table_names = inspector.get_table_names()

    # ==========================================================
    # 1. UPGRADE 'information_systems' (MULTI-CLASSIFICATION FLAGS)
    # ==========================================================
    if 'information_systems' in table_names:
        sys_cols = [c['name'] for c in inspector.get_columns('information_systems')]

        with op.batch_alter_table('information_systems', schema=None) as batch_op:
            if 'is_support_to_operations' not in sys_cols:
                batch_op.add_column(
                    sa.Column(
                        'is_support_to_operations',
                        sa.Boolean(),
                        server_default=sa.text('0'),
                        nullable=False
                    )
                )
            if 'is_general_administrative' not in sys_cols:
                batch_op.add_column(
                    sa.Column(
                        'is_general_administrative',
                        sa.Boolean(),
                        server_default=sa.text('0'),
                        nullable=False
                    )
                )
            if 'is_operations' not in sys_cols:
                batch_op.add_column(
                    sa.Column(
                        'is_operations',
                        sa.Boolean(),
                        server_default=sa.text('1'),
                        nullable=False
                    )
                )

        # Harmonize boolean flags based on existing classification and frontline columns
        # Uses LOWER(...) LIKE to maintain cross-database parity between PostgreSQL and SQLite
        bind.execute(sa.text("""
            UPDATE information_systems
            SET
                is_support_to_operations = CASE
                    WHEN LOWER(classification) LIKE '%support%' THEN 1
                    ELSE 0
                END,
                is_general_administrative = CASE
                    WHEN LOWER(classification) LIKE '%general administrative%'
                      OR LOWER(classification) LIKE '%administrative%' THEN 1
                    ELSE 0
                END,
                is_operations = CASE
                    WHEN LOWER(classification) LIKE '%operations%'
                      OR is_frontline_service = 1
                      OR is_non_frontline_service = 1 THEN 1
                    ELSE 0
                END;
        """))

        # Defensive fallback: If none of the three are flagged, default is_operations = 1
        bind.execute(sa.text("""
            UPDATE information_systems
            SET is_operations = 1
            WHERE is_support_to_operations = 0
              AND is_general_administrative = 0
              AND is_operations = 0;
        """))

    # ==========================================================
    # 2. UPGRADE 'issp_core' (MAKE OUTCOME_ID NULLABLE)
    # ==========================================================
    if 'issp_core' in table_names:
        core_cols = [c['name'] for c in inspector.get_columns('issp_core')]

        if 'outcome_id' in core_cols:
            with op.batch_alter_table('issp_core', schema=None) as batch_op:
                batch_op.alter_column(
                    'outcome_id',
                    existing_type=sa.Integer(),
                    nullable=True
                )


def downgrade() -> None:
    """
    Downgrade schema cleanly back to 20261005_purge_doctree:
    1. Reverts 'issp_core.outcome_id' to non-nullable (nullable=False), backfilling
       any NULL values to the lowest existing outcome ID prior to constraint re-application.
    2. Drops the multi-classification boolean columns from 'information_systems'.
    """
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    table_names = inspector.get_table_names()

    # 1. Rollback 'issp_core.outcome_id'
    if 'issp_core' in table_names:
        core_cols = [c['name'] for c in inspector.get_columns('issp_core')]

        if 'outcome_id' in core_cols:
            # Backfill any orphan nulls to the first available outcome before setting NOT NULL
            if 'organizational_outcomes' in table_names:
                bind.execute(sa.text("""
                    UPDATE issp_core
                    SET outcome_id = (SELECT id FROM organizational_outcomes ORDER BY id ASC LIMIT 1)
                    WHERE outcome_id IS NULL;
                """))

            with op.batch_alter_table('issp_core', schema=None) as batch_op:
                batch_op.alter_column(
                    'outcome_id',
                    existing_type=sa.Integer(),
                    nullable=False
                )

    # 2. Rollback 'information_systems'
    if 'information_systems' in table_names:
        sys_cols = [c['name'] for c in inspector.get_columns('information_systems')]

        with op.batch_alter_table('information_systems', schema=None) as batch_op:
            if 'is_operations' in sys_cols:
                batch_op.drop_column('is_operations')
            if 'is_general_administrative' in sys_cols:
                batch_op.drop_column('is_general_administrative')
            if 'is_support_to_operations' in sys_cols:
                batch_op.drop_column('is_support_to_operations')