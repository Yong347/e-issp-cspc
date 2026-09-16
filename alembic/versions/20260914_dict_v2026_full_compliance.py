"""dict_v2026_full_compliance

Revision ID: 20260914_dict_compliance
Revises: 20260913_dynamic_lifecycle
Create Date: 2026-09-14 14:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic (<= 32 characters).
revision: str = '20260914_dict_compliance'
down_revision: Union[str, Sequence[str], None] = '20260913_dynamic_lifecycle'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade database schema with DICT ISSP v.2026 dynamic coversheet, DRBCP, and Annex 1 categorizer fields."""
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    table_names = inspector.get_table_names()

    # ==========================================================
    # 1. UPDATE 'master_narratives'
    # ==========================================================
    if 'master_narratives' in table_names:
        narrative_cols = [c['name'] for c in inspector.get_columns('master_narratives')]
        with op.batch_alter_table('master_narratives', schema=None) as batch_op:
            if 'agency_head_position' not in narrative_cols:
                batch_op.add_column(
                    sa.Column(
                        'agency_head_position', 
                        sa.String(length=200), 
                        server_default=sa.text("'Agency Head'"), 
                        nullable=True
                    )
                )

            if 'drbcp_approval_date' not in narrative_cols:
                batch_op.add_column(
                    sa.Column(
                        'drbcp_approval_date', 
                        sa.String(length=100), 
                        nullable=True
                    )
                )

    # ==========================================================
    # 2. UPDATE 'existing_inventory' (DICT Annex 1 Categorizer)
    # ==========================================================
    if 'existing_inventory' in table_names:
        inv_cols = [c['name'] for c in inspector.get_columns('existing_inventory')]
        inv_indexes = [ix['name'] for ix in inspector.get_indexes('existing_inventory')]
        with op.batch_alter_table('existing_inventory', schema=None) as batch_op:
            if 'dict_category' not in inv_cols:
                batch_op.add_column(
                    sa.Column(
                        'dict_category', 
                        sa.String(length=100), 
                        nullable=True
                    )
                )
            if 'ix_existing_inventory_dict_category' not in inv_indexes and 'dict_category' in inv_cols or 'dict_category' not in inv_cols:
                batch_op.create_index(
                    batch_op.f('ix_existing_inventory_dict_category'), 
                    ['dict_category'], 
                    unique=False
                )

            if 'other_category_name' not in inv_cols:
                batch_op.add_column(
                    sa.Column(
                        'other_category_name', 
                        sa.String(length=200), 
                        nullable=True
                    )
                )


def downgrade() -> None:
    """Downgrade schema cleanly back to 20260913_dynamic_lifecycle."""
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    table_names = inspector.get_table_names()

    # 1. Rollback 'existing_inventory'
    if 'existing_inventory' in table_names:
        inv_cols = [c['name'] for c in inspector.get_columns('existing_inventory')]
        inv_indexes = [ix['name'] for ix in inspector.get_indexes('existing_inventory')]
        with op.batch_alter_table('existing_inventory', schema=None) as batch_op:
            if 'other_category_name' in inv_cols:
                batch_op.drop_column('other_category_name')
            if 'ix_existing_inventory_dict_category' in inv_indexes:
                batch_op.drop_index(batch_op.f('ix_existing_inventory_dict_category'))
            if 'dict_category' in inv_cols:
                batch_op.drop_column('dict_category')

    # 2. Rollback 'master_narratives'
    if 'master_narratives' in table_names:
        narrative_cols = [c['name'] for c in inspector.get_columns('master_narratives')]
        with op.batch_alter_table('master_narratives', schema=None) as batch_op:
            if 'drbcp_approval_date' in narrative_cols:
                batch_op.drop_column('drbcp_approval_date')
            if 'agency_head_position' in narrative_cols:
                batch_op.drop_column('agency_head_position')