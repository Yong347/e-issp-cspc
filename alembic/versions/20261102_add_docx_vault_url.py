# alembic/versions/20261102_add_docx_vault_url.py
"""add_final_docx_vault_url_to_master_narratives

Revision ID: 20261102_docx_vault
Revises: c765a958f5f3
Create Date: 2026-11-02 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic (<= 32 characters).
revision: str = '20261102_docx_vault'
down_revision: Union[str, Sequence[str], None] = 'c765a958f5f3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """
    Upgrades database schema for DICT ISSP v.2026 dual-export compilation:
    Adds 'final_docx_vault_url' to 'master_narratives' for independent Word (.docx)
    document snapshot vault storage and retrieval without colliding with PDF storage.
    """
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    table_names = inspector.get_table_names()

    if 'master_narratives' in table_names:
        cols = [c['name'] for c in inspector.get_columns('master_narratives')]
        with op.batch_alter_table('master_narratives', schema=None) as batch_op:
            if 'final_docx_vault_url' not in cols:
                batch_op.add_column(
                    sa.Column('final_docx_vault_url', sa.String(length=500), nullable=True)
                )


def downgrade() -> None:
    """Downgrade schema cleanly back to c765a958f5f3."""
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    table_names = inspector.get_table_names()

    if 'master_narratives' in table_names:
        cols = [c['name'] for c in inspector.get_columns('master_narratives')]
        with op.batch_alter_table('master_narratives', schema=None) as batch_op:
            if 'final_docx_vault_url' in cols:
                batch_op.drop_column('final_docx_vault_url')