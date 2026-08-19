"""restructure issp document tree

Revision ID: 99e52e8f17ac
Revises: c29b41544e72
Create Date: 2026-08-19 08:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '99e52e8f17ac'
down_revision: Union[str, Sequence[str], None] = 'c29b41544e72'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade database schema with structured document tree elements."""
    
    # 1. Create table 'issp_nodes'
    op.create_table(
        'issp_nodes',
        sa.Column('id', sa.Integer(), nullable=False, autoincrement=True),
        sa.Column('parent_id', sa.Integer(), nullable=True),
        sa.Column('node_type', sa.Enum('root', 'part', 'section', 'subsection', 'leaf', name='nodetype'), nullable=False),
        sa.Column('system_key', sa.String(length=100), nullable=False),
        sa.Column('sequence_order', sa.Numeric(precision=6, scale=3), nullable=False),
        sa.Column('page_orientation', sa.Enum('portrait', 'landscape', name='pageorientation'), server_default='landscape', nullable=False),
        sa.Column('force_page_break', sa.Boolean(), server_default='0', nullable=False),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(['parent_id'], ['issp_nodes.id'], name='fk_issp_nodes_parent_id', ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id', name='pk_issp_nodes')
    )
    op.create_index('ix_issp_nodes_parent_id', 'issp_nodes', ['parent_id'], unique=False)
    op.create_index('ix_issp_nodes_system_key', 'issp_nodes', ['system_key'], unique=True)

    # 2. Create table 'issp_vocabulary'
    op.create_table(
        'issp_vocabulary',
        sa.Column('id', sa.Integer(), nullable=False, autoincrement=True),
        sa.Column('node_id', sa.Integer(), nullable=False),
        sa.Column('display_title', sa.String(length=255), nullable=False),
        sa.Column('toc_label', sa.String(length=255), nullable=False),
        sa.ForeignKeyConstraint(['node_id'], ['issp_nodes.id'], name='fk_issp_vocabulary_node_id', ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id', name='pk_issp_vocabulary')
    )
    op.create_index('ix_issp_vocabulary_node_id', 'issp_vocabulary', ['node_id'], unique=False)

    # 3. Create table 'issp_contents'
    op.create_table(
        'issp_contents',
        sa.Column('id', sa.Integer(), nullable=False, autoincrement=True),
        sa.Column('node_id', sa.Integer(), nullable=False),
        sa.Column('content_type', sa.Enum('rich_text', 'key_value_table', 'staffing_matrix', 'budget_grid', name='contenttype'), nullable=False),
        sa.Column('json_data', sa.JSON(), nullable=False),
        sa.ForeignKeyConstraint(['node_id'], ['issp_nodes.id'], name='fk_issp_contents_node_id', ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id', name='pk_issp_contents')
    )
    op.create_index('ix_issp_contents_node_id', 'issp_contents', ['node_id'], unique=False)

    # 4. Create table 'issp_assets'
    op.create_table(
        'issp_assets',
        sa.Column('id', sa.Integer(), nullable=False, autoincrement=True),
        sa.Column('node_id', sa.Integer(), nullable=False),
        sa.Column('file_path', sa.String(length=255), nullable=False),
        sa.Column('asset_role', sa.Enum('logo', 'inline_diagram', 'full_page_diagram', name='assetrole'), nullable=False),
        sa.Column('custom_title', sa.String(length=255), nullable=True),
        sa.Column('aspect_ratio_preserve', sa.Boolean(), server_default='1', nullable=False),
        sa.ForeignKeyConstraint(['node_id'], ['issp_nodes.id'], name='fk_issp_assets_node_id', ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id', name='pk_issp_assets')
    )
    op.create_index('ix_issp_assets_node_id', 'issp_assets', ['node_id'], unique=False)


def downgrade() -> None:
    """Downgrade database schema back to its previous state."""
    op.drop_table('issp_assets')
    op.drop_table('issp_contents')
    op.drop_table('issp_vocabulary')
    op.drop_table('issp_nodes')