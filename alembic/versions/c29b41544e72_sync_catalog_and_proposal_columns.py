# alembic/versions/c29b41544e72_sync_catalog_and_proposal_columns.py

"""sync_catalog_and_proposal_columns

Revision ID: c29b41544e72
Revises: 53b54ce023f3
Create Date: 2026-07-20 12:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.engine.reflection import Inspector

# revision identifiers, used by Alembic.
revision: str = 'c29b41544e72'
down_revision: Union[str, Sequence[str], None] = '53b54ce023f3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = Inspector.from_engine(conn)
    
    # 1. Inspect and update 'catalog_items' defensively
    existing_cols_catalog = [col['name'] for col in inspector.get_columns('catalog_items')]
    with op.batch_alter_table('catalog_items', schema=None) as batch_op:
        if 'canvas_evidence_url' not in existing_cols_catalog:
            batch_op.add_column(sa.Column('canvas_evidence_url', sa.String(length=500), nullable=True))
        if 'supplier_name' not in existing_cols_catalog:
            batch_op.add_column(sa.Column('supplier_name', sa.String(length=200), nullable=True))

    # 2. Inspect and update 'issp_core' defensively
    existing_cols_core = [col['name'] for col in inspector.get_columns('issp_core')]
    with op.batch_alter_table('issp_core', schema=None) as batch_op:
        if 'is_expansion' not in existing_cols_core:
            batch_op.add_column(sa.Column('is_expansion', sa.Boolean(), server_default=sa.text('false'), nullable=False))
        if 's3_storage_class' not in existing_cols_core:
            batch_op.add_column(sa.Column('s3_storage_class', sa.String(length=50), server_default='STANDARD', nullable=False))
        if 'is_restoring' not in existing_cols_core:
            batch_op.add_column(sa.Column('is_restoring', sa.Boolean(), server_default=sa.text('false'), nullable=False))
        if 'target_offices_json' not in existing_cols_core:
            batch_op.add_column(sa.Column('target_offices_json', sa.JSON(), server_default='[]', nullable=False))

    # 3. Inspect and update 'subscription_proposals' defensively
    existing_cols_sub = [col['name'] for col in inspector.get_columns('subscription_proposals')]
    with op.batch_alter_table('subscription_proposals', schema=None) as batch_op:
        if 'is_expansion' not in existing_cols_sub:
            batch_op.add_column(sa.Column('is_expansion', sa.Boolean(), server_default=sa.text('false'), nullable=False))
        if 's3_storage_class' not in existing_cols_sub:
            batch_op.add_column(sa.Column('s3_storage_class', sa.String(length=50), server_default='STANDARD', nullable=False))
        if 'is_restoring' not in existing_cols_sub:
            batch_op.add_column(sa.Column('is_restoring', sa.Boolean(), server_default=sa.text('false'), nullable=False))
        if 'target_offices_json' not in existing_cols_sub:
            batch_op.add_column(sa.Column('target_offices_json', sa.JSON(), server_default='[]', nullable=False))


def downgrade() -> None:
    conn = op.get_bind()
    inspector = Inspector.from_engine(conn)
    
    # Check 'subscription_proposals'
    existing_cols_sub = [col['name'] for col in inspector.get_columns('subscription_proposals')]
    with op.batch_alter_table('subscription_proposals', schema=None) as batch_op:
        if 'target_offices_json' in existing_cols_sub:
            batch_op.drop_column('target_offices_json')
        if 'is_restoring' in existing_cols_sub:
            batch_op.drop_column('is_restoring')
        if 's3_storage_class' in existing_cols_sub:
            batch_op.drop_column('s3_storage_class')
        if 'is_expansion' in existing_cols_sub:
            batch_op.drop_column('is_expansion')

    # Check 'issp_core'
    existing_cols_core = [col['name'] for col in inspector.get_columns('issp_core')]
    with op.batch_alter_table('issp_core', schema=None) as batch_op:
        if 'target_offices_json' in existing_cols_core:
            batch_op.drop_column('target_offices_json')
        if 'is_restoring' in existing_cols_core:
            batch_op.drop_column('is_restoring')
        if 's3_storage_class' in existing_cols_core:
            batch_op.drop_column('s3_storage_class')
        if 'is_expansion' in existing_cols_core:
            batch_op.drop_column('is_expansion')

    # Check 'catalog_items'
    existing_cols_catalog = [col['name'] for col in inspector.get_columns('catalog_items')]
    with op.batch_alter_table('catalog_items', schema=None) as batch_op:
        if 'supplier_name' in existing_cols_catalog:
            batch_op.drop_column('supplier_name')
        if 'canvas_evidence_url' in existing_cols_catalog:
            batch_op.drop_column('canvas_evidence_url')