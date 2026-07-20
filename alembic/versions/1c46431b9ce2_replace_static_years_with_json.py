"""replace_static_years_with_json

Revision ID: 1c46431b9ce2
Revises: 
Create Date: 2026-07-11 17:35:12.781165

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '1c46431b9ce2'
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Execute modifications using batch operations for SQLite compatibility
    with op.batch_alter_table('issp_core', schema=None) as batch_op:
        batch_op.add_column(sa.Column('yearly_quantities', sa.JSON(), nullable=False, server_default='{}'))
        batch_op.create_index(batch_op.f('ix_issp_core_total_qty'), ['total_qty'], unique=False)
        batch_op.drop_column('year3_qty')
        batch_op.drop_column('year2_qty')
        batch_op.drop_column('year1_qty')

    with op.batch_alter_table('subscription_proposals', schema=None) as batch_op:
        batch_op.add_column(sa.Column('yearly_users', sa.JSON(), nullable=False, server_default='{}'))
        batch_op.create_index(batch_op.f('ix_subscription_proposals_total_multiyear_mooe'), ['total_multiyear_mooe'], unique=False)
        batch_op.drop_column('year2_users')
        batch_op.drop_column('year1_users')
        batch_op.drop_column('year3_users')


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('subscription_proposals', schema=None) as batch_op:
        batch_op.add_column(sa.Column('year3_users', sa.INTEGER(), nullable=False, server_default='0'))
        batch_op.add_column(sa.Column('year1_users', sa.INTEGER(), nullable=False, server_default='0'))
        batch_op.add_column(sa.Column('year2_users', sa.INTEGER(), nullable=False, server_default='0'))
        batch_op.drop_index(batch_op.f('ix_subscription_proposals_total_multiyear_mooe'))
        batch_op.drop_column('yearly_users')

    with op.batch_alter_table('issp_core', schema=None) as batch_op:
        batch_op.add_column(sa.Column('year1_qty', sa.INTEGER(), nullable=False, server_default='0'))
        batch_op.add_column(sa.Column('year2_qty', sa.INTEGER(), nullable=False, server_default='0'))
        batch_op.add_column(sa.Column('year3_qty', sa.INTEGER(), nullable=False, server_default='0'))
        batch_op.drop_index(batch_op.f('ix_issp_core_total_qty'))
        batch_op.drop_column('yearly_quantities')