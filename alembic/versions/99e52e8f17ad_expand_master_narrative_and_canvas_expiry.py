"""expand_master_narrative_and_canvas_expiry

Revision ID: 99e52e8f17ad
Revises: 99e52e8f17ac
Create Date: 2026-08-23 09:12:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '99e52e8f17ad'
down_revision: Union[str, Sequence[str], None] = '99e52e8f17ac'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade database schema."""
    # 1. Update 'catalog_items'
    with op.batch_alter_table('catalog_items', schema=None) as batch_op:
        batch_op.add_column(sa.Column('canvas_expiration_date', sa.DateTime(), nullable=True))
        batch_op.create_index(batch_op.f('ix_catalog_items_canvas_expiration_date'), ['canvas_expiration_date'], unique=False)

    # 2. Update 'issp_core' (Proposals)
    with op.batch_alter_table('issp_core', schema=None) as batch_op:
        batch_op.add_column(sa.Column('canvas_expiration_date', sa.DateTime(), nullable=True))
        batch_op.create_index(batch_op.f('ix_issp_core_canvas_expiration_date'), ['canvas_expiration_date'], unique=False)

    # 3. Update 'subscription_proposals' (MOOE Subscriptions)
    with op.batch_alter_table('subscription_proposals', schema=None) as batch_op:
        batch_op.add_column(sa.Column('canvas_expiration_date', sa.DateTime(), nullable=True))
        batch_op.create_index(batch_op.f('ix_subscription_proposals_canvas_expiration_date'), ['canvas_expiration_date'], unique=False)

    # 4. Update 'master_narratives'
    with op.batch_alter_table('master_narratives', schema=None) as batch_op:
        # Add the 9 System-Specific Network Layouts
        batch_op.add_column(sa.Column('net_layout_sias_url', sa.String(length=500), nullable=True))
        batch_op.add_column(sa.Column('net_layout_library_url', sa.String(length=500), nullable=True))
        batch_op.add_column(sa.Column('net_layout_security_url', sa.String(length=500), nullable=True))
        batch_op.add_column(sa.Column('net_layout_hris_url', sa.String(length=500), nullable=True))
        batch_op.add_column(sa.Column('net_layout_dms_url', sa.String(length=500), nullable=True))
        batch_op.add_column(sa.Column('net_layout_supplies_url', sa.String(length=500), nullable=True))
        batch_op.add_column(sa.Column('net_layout_budget_url', sa.String(length=500), nullable=True))
        batch_op.add_column(sa.Column('net_layout_sias_upgrade_url', sa.String(length=500), nullable=True))
        batch_op.add_column(sa.Column('net_layout_extension_url', sa.String(length=500), nullable=True))
        
        # Add SUC MIS/ICT Org Chart and CSPC Network Diagram (Page 129)
        batch_op.add_column(sa.Column('b_3_a_ict_org_url', sa.String(length=500), nullable=True))
        batch_op.add_column(sa.Column('network_diagram_url', sa.String(length=500), nullable=True))
        
        # Drop the consolidated/mismatched columns safely
        batch_op.drop_column('network_topology_url')
        batch_op.drop_column('network_layout_url')


def downgrade() -> None:
    """Downgrade database schema."""
    # 1. Rollback 'master_narratives'
    with op.batch_alter_table('master_narratives', schema=None) as batch_op:
        batch_op.add_column(sa.Column('network_layout_url', sa.String(length=500), nullable=True))
        batch_op.add_column(sa.Column('network_topology_url', sa.String(length=500), nullable=True))
        
        batch_op.drop_column('network_diagram_url')
        batch_op.drop_column('b_3_a_ict_org_url')
        batch_op.drop_column('net_layout_extension_url')
        batch_op.drop_column('net_layout_sias_upgrade_url')
        batch_op.drop_column('net_layout_budget_url')
        batch_op.drop_column('net_layout_supplies_url')
        batch_op.drop_column('net_layout_dms_url')
        batch_op.drop_column('net_layout_hris_url')
        batch_op.drop_column('net_layout_security_url')
        batch_op.drop_column('net_layout_library_url')
        batch_op.drop_column('net_layout_sias_url')

    # 2. Rollback 'subscription_proposals'
    with op.batch_alter_table('subscription_proposals', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_subscription_proposals_canvas_expiration_date'))
        batch_op.drop_column('canvas_expiration_date')

    # 3. Rollback 'issp_core'
    with op.batch_alter_table('issp_core', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_issp_core_canvas_expiration_date'))
        batch_op.drop_column('canvas_expiration_date')

    # 4. Rollback 'catalog_items'
    with op.batch_alter_table('catalog_items', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_catalog_items_canvas_expiration_date'))
        batch_op.drop_column('canvas_expiration_date')