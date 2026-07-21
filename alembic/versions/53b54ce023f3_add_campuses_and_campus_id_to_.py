"""add_campuses_and_campus_id_to_departments

Revision ID: 53b54ce023f3
Revises: 129eb476524b
Create Date: 2026-07-19 19:14:55.395645

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '53b54ce023f3'
down_revision: Union[str, Sequence[str], None] = '129eb476524b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema using batch operations to support SQLite constraints."""
    
    with op.batch_alter_table('departments', schema=None) as batch_op:
        batch_op.add_column(sa.Column('campus_id', sa.Integer(), nullable=True))
        batch_op.create_index(batch_op.f('ix_departments_campus_id'), ['campus_id'], unique=False)
        batch_op.create_foreign_key('fk_departments_campus_id', 'campuses', ['campus_id'], ['id'], ondelete='SET NULL')
    
    with op.batch_alter_table('existing_inventory', schema=None) as batch_op:
        batch_op.add_column(sa.Column('date_acquired', sa.DateTime(), nullable=False, server_default=sa.func.now()))
        batch_op.alter_column('date_acquired', server_default=None)
    
    with op.batch_alter_table('master_narratives', schema=None) as batch_op:
        batch_op.add_column(sa.Column('process_flow_diagram_url', sa.String(length=500), nullable=True))
        
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.add_column(sa.Column('campus_id', sa.Integer(), nullable=True))
        batch_op.create_index(batch_op.f('ix_users_campus_id'), ['campus_id'], unique=False)
        batch_op.create_foreign_key('fk_users_campus_id', 'campuses', ['campus_id'], ['id'], ondelete='SET NULL')


def downgrade() -> None:
    """Downgrade schema using batch operations to support SQLite constraints."""
    
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.drop_constraint('fk_users_campus_id', type_='foreignkey')
        batch_op.drop_index(batch_op.f('ix_users_campus_id'))
        batch_op.drop_column('campus_id')

    with op.batch_alter_table('master_narratives', schema=None) as batch_op:
        batch_op.drop_column('process_flow_diagram_url')

    with op.batch_alter_table('existing_inventory', schema=None) as batch_op:
        batch_op.drop_column('date_acquired')

    with op.batch_alter_table('departments', schema=None) as batch_op:
        batch_op.drop_constraint('fk_departments_campus_id', type_='foreignkey')
        batch_op.drop_index(batch_op.f('ix_departments_campus_id'))
        batch_op.drop_column('campus_id')