"""sync_missing_v2026_columns

Revision ID: 20260915_sync_columns
Revises: 20260915_zero_hardcoding
Create Date: 2026-09-15 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic (<= 32 characters).
revision: str = '20260915_sync_columns'
down_revision: Union[str, Sequence[str], None] = '20260915_zero_hardcoding'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """
    Synchronizes missing columns across core tables:
    1. organizational_outcomes: program_name (syncs outcome_name to program_name)
    2. information_systems: enhancement_details
    3. ict_projects: annual_deliverables
    4. egovernment_checklists: is_manual, is_proposed_development
    """
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    table_names = inspector.get_table_names()

    # 1. organizational_outcomes
    if 'organizational_outcomes' in table_names:
        oo_cols = [c['name'] for c in inspector.get_columns('organizational_outcomes')]
        with op.batch_alter_table('organizational_outcomes', schema=None) as batch_op:
            if 'program_name' not in oo_cols:
                batch_op.add_column(sa.Column('program_name', sa.String(length=255), nullable=True))

        # Synchronize program_name and outcome_name if existing records have one set
        op.execute(
            sa.text(
                "UPDATE organizational_outcomes "
                "SET program_name = outcome_name "
                "WHERE program_name IS NULL AND outcome_name IS NOT NULL"
            )
        )
        op.execute(
            sa.text(
                "UPDATE organizational_outcomes "
                "SET outcome_name = program_name "
                "WHERE outcome_name IS NULL AND program_name IS NOT NULL"
            )
        )

    # 2. information_systems
    if 'information_systems' in table_names:
        sys_cols = [c['name'] for c in inspector.get_columns('information_systems')]
        with op.batch_alter_table('information_systems', schema=None) as batch_op:
            if 'enhancement_details' not in sys_cols:
                batch_op.add_column(sa.Column('enhancement_details', sa.Text(), nullable=True))

    # 3. ict_projects
    if 'ict_projects' in table_names:
        proj_cols = [c['name'] for c in inspector.get_columns('ict_projects')]
        with op.batch_alter_table('ict_projects', schema=None) as batch_op:
            if 'annual_deliverables' not in proj_cols:
                batch_op.add_column(
                    sa.Column('annual_deliverables', sa.JSON(), server_default='{}', nullable=False)
                )

    # 4. egovernment_checklists
    if 'egovernment_checklists' in table_names:
        egov_cols = [c['name'] for c in inspector.get_columns('egovernment_checklists')]
        with op.batch_alter_table('egovernment_checklists', schema=None) as batch_op:
            if 'is_manual' not in egov_cols:
                batch_op.add_column(
                    sa.Column('is_manual', sa.Boolean(), server_default='0', nullable=False)
                )
            if 'is_proposed_development' not in egov_cols:
                batch_op.add_column(
                    sa.Column('is_proposed_development', sa.Boolean(), server_default='0', nullable=False)
                )


def downgrade() -> None:
    """Downgrade schema cleanly."""
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    table_names = inspector.get_table_names()

    # 1. egovernment_checklists
    if 'egovernment_checklists' in table_names:
        egov_cols = [c['name'] for c in inspector.get_columns('egovernment_checklists')]
        with op.batch_alter_table('egovernment_checklists', schema=None) as batch_op:
            if 'is_proposed_development' in egov_cols:
                batch_op.drop_column('is_proposed_development')
            if 'is_manual' in egov_cols:
                batch_op.drop_column('is_manual')

    # 2. ict_projects
    if 'ict_projects' in table_names:
        proj_cols = [c['name'] for c in inspector.get_columns('ict_projects')]
        with op.batch_alter_table('ict_projects', schema=None) as batch_op:
            if 'annual_deliverables' in proj_cols:
                batch_op.drop_column('annual_deliverables')

    # 3. information_systems
    if 'information_systems' in table_names:
        sys_cols = [c['name'] for c in inspector.get_columns('information_systems')]
        with op.batch_alter_table('information_systems', schema=None) as batch_op:
            if 'enhancement_details' in sys_cols:
                batch_op.drop_column('enhancement_details')

    # 4. organizational_outcomes
    if 'organizational_outcomes' in table_names:
        oo_cols = [c['name'] for c in inspector.get_columns('organizational_outcomes')]
        with op.batch_alter_table('organizational_outcomes', schema=None) as batch_op:
            if 'program_name' in oo_cols:
                batch_op.drop_column('program_name')