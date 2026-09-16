"""dynamic_horizon_and_lifecycle

Revision ID: 20260913_dynamic_horizon_and_lifecycle
Revises: 20260911_v2026_alignment
Create Date: 2026-09-13 15:46:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '20260913_dynamic_lifecycle'
down_revision: Union[str, Sequence[str], None] = '20260911_v2026_alignment'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade database schema to support dynamic year horizons, lifecycle archival, and dynamic DRBCP/EA narratives."""
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    table_names = inspector.get_table_names()

    # ==========================================================
    # 1. UPDATE 'master_narratives'
    # ==========================================================
    if 'master_narratives' in table_names:
        narrative_cols = [c['name'] for c in inspector.get_columns('master_narratives')]
        with op.batch_alter_table('master_narratives', schema=None) as batch_op:
            if 'enterprise_architecture_narrative' not in narrative_cols:
                batch_op.add_column(sa.Column('enterprise_architecture_narrative', sa.Text(), nullable=True))

            if 'drbcp_affected_assets_json' not in narrative_cols:
                batch_op.add_column(sa.Column('drbcp_affected_assets_json', sa.JSON(), server_default='[]', nullable=True))

            if 'drbcp_recovery_strategy_html' not in narrative_cols:
                batch_op.add_column(sa.Column('drbcp_recovery_strategy_html', sa.Text(), nullable=True))

            if 'drbcp_sop_phases_html' not in narrative_cols:
                batch_op.add_column(sa.Column('drbcp_sop_phases_html', sa.Text(), nullable=True))

            if 'is_archived' not in narrative_cols:
                batch_op.add_column(sa.Column('is_archived', sa.Boolean(), server_default='0', nullable=False))
                batch_op.create_index(batch_op.f('ix_master_narratives_is_archived'), ['is_archived'], unique=False)

            if 'final_pdf_vault_url' not in narrative_cols:
                batch_op.add_column(sa.Column('final_pdf_vault_url', sa.String(length=500), nullable=True))

    # ==========================================================
    # 2. UPDATE 'needs_assessments' (Section 8.0 Aggregation & Linkage)
    # ==========================================================
    if 'needs_assessments' in table_names:
        na_cols = [c['name'] for c in inspector.get_columns('needs_assessments')]
        with op.batch_alter_table('needs_assessments', schema=None) as batch_op:
            if 'is_aggregated' not in na_cols:
                batch_op.add_column(sa.Column('is_aggregated', sa.Boolean(), server_default='0', nullable=False))
                batch_op.create_index(batch_op.f('ix_needs_assessments_is_aggregated'), ['is_aggregated'], unique=False)

            if 'strategic_concern_id' not in na_cols:
                batch_op.add_column(sa.Column('strategic_concern_id', sa.CHAR(length=36), nullable=True))
                batch_op.create_index(batch_op.f('ix_needs_assessments_strategic_concern_id'), ['strategic_concern_id'], unique=False)
                batch_op.create_foreign_key(
                    'fk_needs_assessments_strategic_concern_id',
                    'strategic_concerns',
                    ['strategic_concern_id'],
                    ['id'],
                    ondelete='SET NULL'
                )

    # ==========================================================
    # 3. UPDATE 'issp_core' (Proposal to Needs Assessment Provenance)
    # ==========================================================
    if 'issp_core' in table_names:
        core_cols = [c['name'] for c in inspector.get_columns('issp_core')]
        with op.batch_alter_table('issp_core', schema=None) as batch_op:
            if 'needs_assessment_id' not in core_cols:
                batch_op.add_column(sa.Column('needs_assessment_id', sa.CHAR(length=36), nullable=True))
                batch_op.create_index(batch_op.f('ix_issp_core_needs_assessment_id'), ['needs_assessment_id'], unique=False)
                batch_op.create_foreign_key(
                    'fk_issp_core_needs_assessment_id',
                    'needs_assessments',
                    ['needs_assessment_id'],
                    ['id'],
                    ondelete='SET NULL'
                )


def downgrade() -> None:
    """Downgrade schema cleanly back to 20260911_v2026_alignment."""
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    table_names = inspector.get_table_names()

    # 1. Rollback 'issp_core'
    if 'issp_core' in table_names:
        core_cols = [c['name'] for c in inspector.get_columns('issp_core')]
        with op.batch_alter_table('issp_core', schema=None) as batch_op:
            if 'needs_assessment_id' in core_cols:
                batch_op.drop_constraint('fk_issp_core_needs_assessment_id', type_='foreignkey')
                batch_op.drop_index(batch_op.f('ix_issp_core_needs_assessment_id'))
                batch_op.drop_column('needs_assessment_id')

    # 2. Rollback 'needs_assessments'
    if 'needs_assessments' in table_names:
        na_cols = [c['name'] for c in inspector.get_columns('needs_assessments')]
        with op.batch_alter_table('needs_assessments', schema=None) as batch_op:
            if 'strategic_concern_id' in na_cols:
                batch_op.drop_constraint('fk_needs_assessments_strategic_concern_id', type_='foreignkey')
                batch_op.drop_index(batch_op.f('ix_needs_assessments_strategic_concern_id'))
                batch_op.drop_column('strategic_concern_id')
            if 'is_aggregated' in na_cols:
                batch_op.drop_index(batch_op.f('ix_needs_assessments_is_aggregated'))
                batch_op.drop_column('is_aggregated')

    # 3. Rollback 'master_narratives'
    if 'master_narratives' in table_names:
        narrative_cols = [c['name'] for c in inspector.get_columns('master_narratives')]
        with op.batch_alter_table('master_narratives', schema=None) as batch_op:
            if 'final_pdf_vault_url' in narrative_cols:
                batch_op.drop_column('final_pdf_vault_url')
            if 'is_archived' in narrative_cols:
                batch_op.drop_index(batch_op.f('ix_master_narratives_is_archived'))
                batch_op.drop_column('is_archived')
            if 'drbcp_sop_phases_html' in narrative_cols:
                batch_op.drop_column('drbcp_sop_phases_html')
            if 'drbcp_recovery_strategy_html' in narrative_cols:
                batch_op.drop_column('drbcp_recovery_strategy_html')
            if 'drbcp_affected_assets_json' in narrative_cols:
                batch_op.drop_column('drbcp_affected_assets_json')
            if 'enterprise_architecture_narrative' in narrative_cols:
                batch_op.drop_column('enterprise_architecture_narrative')