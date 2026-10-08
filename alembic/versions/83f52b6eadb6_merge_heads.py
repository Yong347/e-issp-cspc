"""merge_heads

Revision ID: 83f52b6eadb6
Revises: a6b7bd169077
Create Date: 2026-10-03 16:17:31.180515

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '83f52b6eadb6'
down_revision: Union[str, Sequence[str], None] = 'a6b7bd169077'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
