"""merge_heads

Revision ID: a8bf4152b09e
Revises: 20261001_dynamic
Create Date: 2026-09-29 17:58:48.964734

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a8bf4152b09e'
down_revision: Union[str, Sequence[str], None] = '20261001_dynamic'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass