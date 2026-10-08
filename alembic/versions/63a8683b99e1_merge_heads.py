"""merge_heads

Revision ID: 63a8683b99e1
Revises: 83f52b6eadb6
Create Date: 2026-10-04 19:56:52.891825

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '63a8683b99e1'
down_revision: Union[str, Sequence[str], None] = '83f52b6eadb6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
