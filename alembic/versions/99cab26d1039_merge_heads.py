"""merge_heads

Revision ID: 99cab26d1039
Revises: 20261102_docx_vault
Create Date: 2026-10-06 23:17:49.509940

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '99cab26d1039'
down_revision: Union[str, Sequence[str], None] = '20261102_docx_vault'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
