"""compile_narratives_and_inventories

Revision ID: f62e6d3027ac
Revises: 1c46431b9ce2
Create Date: 2026-07-15 08:50:46.558283

"""
from typing import Sequence, Union

from alembic import op
import app.database.models
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f62e6d3027ac'
down_revision: Union[str, Sequence[str], None] = '1c46431b9ce2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema using batch operations to support SQLite constraints."""
    
    with op.batch_alter_table('budget_ceilings', schema=None) as batch_op:
        batch_op.drop_constraint('budget_ceilings_department_id_key', type_='unique')
        batch_op.create_index(batch_op.f('ix_budget_ceilings_department_id'), ['department_id'], unique=True)
        batch_op.create_index(batch_op.f('ix_budget_ceilings_issp_period'), ['issp_period'], unique=False)
        batch_op.drop_constraint('budget_ceilings_department_id_fkey', type_='foreignkey')
        batch_op.create_foreign_key('fk_budget_ceilings_issp_period', 'master_narratives', ['issp_period'], ['issp_period'], onupdate='CASCADE', ondelete='RESTRICT')
        batch_op.create_foreign_key('fk_budget_ceilings_department_id', 'departments', ['department_id'], ['id'], ondelete='CASCADE')

    with op.batch_alter_table('existing_inventory', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_existing_inventory_department_id'), ['department_id'], unique=False)
        batch_op.drop_constraint('existing_inventory_department_id_fkey', type_='foreignkey')
        batch_op.create_foreign_key('fk_existing_inventory_department_id', 'departments', ['department_id'], ['id'], ondelete='CASCADE')

    with op.batch_alter_table('issp_core', schema=None) as batch_op:
        batch_op.add_column(sa.Column('item_key', sa.String(length=100), nullable=True))
        batch_op.create_index(batch_op.f('ix_issp_core_department_id'), ['department_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_issp_core_issp_period'), ['issp_period'], unique=False)
        batch_op.drop_constraint('issp_core_issp_period_fkey', type_='foreignkey')
        batch_op.drop_constraint('issp_core_department_id_fkey', type_='foreignkey')
        batch_op.create_foreign_key('fk_issp_core_issp_period', 'master_narratives', ['issp_period'], ['issp_period'], onupdate='CASCADE', ondelete='RESTRICT')
        batch_op.create_foreign_key('fk_issp_core_department_id', 'departments', ['department_id'], ['id'], ondelete='CASCADE')

    with op.batch_alter_table('needs_assessments', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_needs_assessments_department_id'), ['department_id'], unique=False)
        batch_op.drop_constraint('needs_assessments_department_id_fkey', type_='foreignkey')
        batch_op.create_foreign_key('fk_needs_assessments_department_id', 'departments', ['department_id'], ['id'], ondelete='CASCADE')

    with op.batch_alter_table('subscription_proposals', schema=None) as batch_op:
        batch_op.add_column(sa.Column('payload', app.database.models.EncryptedJSON(), nullable=False, server_default='{}'))
        batch_op.create_index(batch_op.f('ix_subscription_proposals_department_id'), ['department_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_subscription_proposals_issp_period'), ['issp_period'], unique=False)
        batch_op.drop_constraint('subscription_proposals_department_id_fkey', type_='foreignkey')
        batch_op.drop_constraint('subscription_proposals_issp_period_fkey', type_='foreignkey')
        batch_op.create_foreign_key('fk_subscription_proposals_department_id', 'departments', ['department_id'], ['id'], ondelete='CASCADE')
        batch_op.create_foreign_key('fk_subscription_proposals_issp_period', 'master_narratives', ['issp_period'], ['issp_period'], onupdate='CASCADE', ondelete='RESTRICT')

    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_users_department_id'), ['department_id'], unique=False)
        batch_op.drop_constraint('users_department_id_fkey', type_='foreignkey')
        batch_op.create_foreign_key('fk_users_department_id', 'departments', ['department_id'], ['id'], ondelete='SET NULL')


def downgrade() -> None:
    """Downgrade schema using batch operations to support SQLite constraints."""
    
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.drop_constraint('fk_users_department_id', type_='foreignkey')
        batch_op.drop_index(batch_op.f('ix_users_department_id'))

    with op.batch_alter_table('subscription_proposals', schema=None) as batch_op:
        batch_op.drop_constraint('fk_subscription_proposals_issp_period', type_='foreignkey')
        batch_op.drop_constraint('fk_subscription_proposals_department_id', type_='foreignkey')
        batch_op.drop_index(batch_op.f('ix_subscription_proposals_issp_period'))
        batch_op.drop_index(batch_op.f('ix_subscription_proposals_department_id'))
        batch_op.drop_column('payload')

    with op.batch_alter_table('needs_assessments', schema=None) as batch_op:
        batch_op.drop_constraint('fk_needs_assessments_department_id', type_='foreignkey')
        batch_op.drop_index(batch_op.f('ix_needs_assessments_department_id'))

    with op.batch_alter_table('issp_core', schema=None) as batch_op:
        batch_op.drop_constraint('fk_issp_core_department_id', type_='foreignkey')
        batch_op.drop_constraint('fk_issp_core_issp_period', type_='foreignkey')
        batch_op.drop_index(batch_op.f('ix_issp_core_issp_period'))
        batch_op.drop_index(batch_op.f('ix_issp_core_department_id'))
        batch_op.drop_column('item_key')

    with op.batch_alter_table('existing_inventory', schema=None) as batch_op:
        batch_op.drop_constraint('fk_existing_inventory_department_id', type_='foreignkey')
        batch_op.drop_index(batch_op.f('ix_existing_inventory_department_id'))

    with op.batch_alter_table('budget_ceilings', schema=None) as batch_op:
        batch_op.drop_constraint('fk_budget_ceilings_department_id', type_='foreignkey')
        batch_op.drop_constraint('fk_budget_ceilings_issp_period', type_='foreignkey')
        batch_op.drop_index(batch_op.f('ix_budget_ceilings_issp_period'))
        batch_op.drop_index(batch_op.f('ix_budget_ceilings_department_id'))