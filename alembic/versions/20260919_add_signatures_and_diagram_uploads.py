# alembic/versions/20260919_add_signatures_and_diagram_uploads.py
"""add_signatures_and_diagram_uploads

Revision ID: 20260919_signatures_diagrams
Revises: 20260918_purge_artifacts
Create Date: 2026-09-19 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic (<= 32 characters).
revision: str = '20260919_signatures_diagrams'
down_revision: Union[str, Sequence[str], None] = '20260918_purge_artifacts'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """
    Upgrades database schema for DICT ISSP v.2026 complete schematic, signature, and seal uploads:
    1. Adds 'cio_signature_url' and 'head_signature_url' to 'master_narratives' for formal cover page signing.
    2. Ensures 'cert_logo_url', 'existing_ict_org_url', 'proposed_ict_org_url', 'site_development_plan_url', 
       'process_flow_diagram_url', and 'subsystem_network_layouts_json' exist on 'master_narratives'.
    3. Ensures 'diagram_url' exists on 'network_infrastructures'.
    """
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    table_names = inspector.get_table_names()

    # ==========================================================
    # 1. UPDATE 'master_narratives'
    # ==========================================================
    if 'master_narratives' in table_names:
        cols = [c['name'] for c in inspector.get_columns('master_narratives')]
        with op.batch_alter_table('master_narratives', schema=None) as batch_op:
            if 'cio_signature_url' not in cols:
                batch_op.add_column(
                    sa.Column('cio_signature_url', sa.String(length=500), nullable=True)
                )
            if 'head_signature_url' not in cols:
                batch_op.add_column(
                    sa.Column('head_signature_url', sa.String(length=500), nullable=True)
                )
            if 'cert_logo_url' not in cols:
                batch_op.add_column(
                    sa.Column('cert_logo_url', sa.String(length=500), nullable=True)
                )
            if 'existing_ict_org_url' not in cols:
                batch_op.add_column(
                    sa.Column('existing_ict_org_url', sa.String(length=500), nullable=True)
                )
            if 'proposed_ict_org_url' not in cols:
                batch_op.add_column(
                    sa.Column('proposed_ict_org_url', sa.String(length=500), nullable=True)
                )
            if 'site_development_plan_url' not in cols:
                batch_op.add_column(
                    sa.Column('site_development_plan_url', sa.String(length=500), nullable=True)
                )
            if 'process_flow_diagram_url' not in cols:
                batch_op.add_column(
                    sa.Column('process_flow_diagram_url', sa.String(length=500), nullable=True)
                )
            if 'subsystem_network_layouts_json' not in cols:
                batch_op.add_column(
                    sa.Column(
                        'subsystem_network_layouts_json', 
                        sa.JSON(), 
                        server_default=sa.text("'[]'"), 
                        nullable=False
                    )
                )

    # ==========================================================
    # 2. UPDATE 'network_infrastructures'
    # ==========================================================
    if 'network_infrastructures' in table_names:
        net_cols = [c['name'] for c in inspector.get_columns('network_infrastructures')]
        with op.batch_alter_table('network_infrastructures', schema=None) as batch_op:
            if 'diagram_url' not in net_cols:
                batch_op.add_column(
                    sa.Column('diagram_url', sa.String(length=500), nullable=True)
                )


def downgrade() -> None:
    """Downgrade schema cleanly back to 20260918_purge_artifacts."""
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    table_names = inspector.get_table_names()

    # 1. Rollback 'network_infrastructures'
    if 'network_infrastructures' in table_names:
        net_cols = [c['name'] for c in inspector.get_columns('network_infrastructures')]
        with op.batch_alter_table('network_infrastructures', schema=None) as batch_op:
            if 'diagram_url' in net_cols:
                batch_op.drop_column('diagram_url')

    # 2. Rollback 'master_narratives'
    if 'master_narratives' in table_names:
        cols = [c['name'] for c in inspector.get_columns('master_narratives')]
        with op.batch_alter_table('master_narratives', schema=None) as batch_op:
            if 'head_signature_url' in cols:
                batch_op.drop_column('head_signature_url')
            if 'cio_signature_url' in cols:
                batch_op.drop_column('cio_signature_url')
            if 'cert_logo_url' in cols:
                batch_op.drop_column('cert_logo_url')
            if 'process_flow_diagram_url' in cols:
                batch_op.drop_column('process_flow_diagram_url')
            if 'site_development_plan_url' in cols:
                batch_op.drop_column('site_development_plan_url')
            if 'proposed_ict_org_url' in cols:
                batch_op.drop_column('proposed_ict_org_url')
            if 'existing_ict_org_url' in cols:
                batch_op.drop_column('existing_ict_org_url')