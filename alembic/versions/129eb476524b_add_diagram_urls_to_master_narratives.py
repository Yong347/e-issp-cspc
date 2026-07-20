"""add_diagram_urls_to_master_narratives

Revision ID: 129eb476524b
Revises: f62e6d3027ac
Create Date: 2026-07-18 09:39:17.564187

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '129eb476524b'
down_revision: Union[str, Sequence[str], None] = 'f62e6d3027ac'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Execute modifications using batch operations to support SQLite constraints
    with op.batch_alter_table('issp_core', schema=None) as batch_op:
        batch_op.add_column(sa.Column('project_key', sa.String(length=100), nullable=True))
        batch_op.create_index(batch_op.f('ix_issp_core_project_key'), ['project_key'], unique=False)

    with op.batch_alter_table('master_narratives', schema=None) as batch_op:
        batch_op.add_column(sa.Column('network_topology_url', sa.String(length=500), nullable=True))

    with op.batch_alter_table('subscription_proposals', schema=None) as batch_op:
        batch_op.add_column(sa.Column('project_key', sa.String(length=100), nullable=True))
        batch_op.create_index(batch_op.f('ix_subscription_proposals_project_key'), ['project_key'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('subscription_proposals', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_subscription_proposals_project_key'))
        batch_op.drop_column('project_key')

    with op.batch_alter_table('master_narratives', schema=None) as batch_op:
        batch_op.drop_column('network_topology_url')

    with op.batch_alter_table('issp_core', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_issp_core_project_key'))
        batch_op.drop_column('project_key')