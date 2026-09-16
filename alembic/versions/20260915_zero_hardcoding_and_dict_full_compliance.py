"""zero_hardcoding_and_dict_full_compliance

Revision ID: 20260915_zero_hardcoding
Revises: 20260914_dict_compliance
Create Date: 2026-09-15 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic (<= 32 characters).
revision: str = '20260915_zero_hardcoding'
down_revision: Union[str, Sequence[str], None] = '20260914_dict_compliance'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """
    Upgrades database schema to achieve full DICT ISSP v.2026 compliance
    and strips static hardcoded defaults:
    1. Adds aligns_others and aligns_others_specify to ict_projects.
    2. Adds drbcp_compliance_narrative_html to master_narratives (MITHI Res 2025-01).
    3. Drops static institutional string server defaults from database tables.
    """
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    table_names = inspector.get_table_names()

    # ==========================================================
    # 1. UPDATE 'ict_projects' (Part III.E Strategic Alignment)
    # ==========================================================
    if 'ict_projects' in table_names:
        proj_cols = [c['name'] for c in inspector.get_columns('ict_projects')]
        with op.batch_alter_table('ict_projects', schema=None) as batch_op:
            if 'aligns_others' not in proj_cols:
                batch_op.add_column(
                    sa.Column('aligns_others', sa.Boolean(), server_default='0', nullable=False)
                )
            if 'aligns_others_specify' not in proj_cols:
                batch_op.add_column(
                    sa.Column('aligns_others_specify', sa.String(length=255), nullable=True)
                )
            # Remove hardcoded implementing unit defaults
            if 'implementing_unit' in proj_cols:
                batch_op.alter_column('implementing_unit', server_default=None)

    # ==========================================================
    # 2. UPDATE 'master_narratives' (Annex 2 Section 6 & Defaults)
    # ==========================================================
    if 'master_narratives' in table_names:
        narrative_cols = [c['name'] for c in inspector.get_columns('master_narratives')]
        with op.batch_alter_table('master_narratives', schema=None) as batch_op:
            if 'drbcp_compliance_narrative_html' not in narrative_cols:
                batch_op.add_column(
                    sa.Column('drbcp_compliance_narrative_html', sa.Text(), nullable=True)
                )
            # Remove hardcoded agency strings from database server defaults
            if 'agency_name' in narrative_cols:
                batch_op.alter_column('agency_name', server_default=None)
            if 'signatory_prepared_by' in narrative_cols:
                batch_op.alter_column('signatory_prepared_by', server_default=None)
            if 'signatory_approved_by' in narrative_cols:
                batch_op.alter_column('signatory_approved_by', server_default=None)
            if 'agency_head_position' in narrative_cols:
                batch_op.alter_column('agency_head_position', server_default=None)
            if 'agency_website_url' in narrative_cols:
                batch_op.alter_column('agency_website_url', server_default=None)

    # ==========================================================
    # 3. UPDATE 'issp_core' (Proposals Ledger Defaults)
    # ==========================================================
    if 'issp_core' in table_names:
        core_cols = [c['name'] for c in inspector.get_columns('issp_core')]
        with op.batch_alter_table('issp_core', schema=None) as batch_op:
            if 'uacs_object_code' in core_cols:
                batch_op.alter_column('uacs_object_code', server_default=None)
            if 'target_office_automated' in core_cols:
                batch_op.alter_column('target_office_automated', server_default=None)


def downgrade() -> None:
    """Downgrade schema cleanly back to 20260914_dict_compliance."""
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    table_names = inspector.get_table_names()

    # 1. Rollback 'issp_core'
    if 'issp_core' in table_names:
        core_cols = [c['name'] for c in inspector.get_columns('issp_core')]
        with op.batch_alter_table('issp_core', schema=None) as batch_op:
            if 'uacs_object_code' in core_cols:
                batch_op.alter_column(
                    'uacs_object_code', 
                    server_default=sa.text("'50604050 03 - ICT Equipment (CO)'")
                )

    # 2. Rollback 'master_narratives'
    if 'master_narratives' in table_names:
        narrative_cols = [c['name'] for c in inspector.get_columns('master_narratives')]
        with op.batch_alter_table('master_narratives', schema=None) as batch_op:
            if 'drbcp_compliance_narrative_html' in narrative_cols:
                batch_op.drop_column('drbcp_compliance_narrative_html')
            if 'agency_head_position' in narrative_cols:
                batch_op.alter_column(
                    'agency_head_position', 
                    server_default=sa.text("'Agency Head'")
                )

    # 3. Rollback 'ict_projects'
    if 'ict_projects' in table_names:
        proj_cols = [c['name'] for c in inspector.get_columns('ict_projects')]
        with op.batch_alter_table('ict_projects', schema=None) as batch_op:
            if 'aligns_others_specify' in proj_cols:
                batch_op.drop_column('aligns_others_specify')
            if 'aligns_others' in proj_cols:
                batch_op.drop_column('aligns_others')