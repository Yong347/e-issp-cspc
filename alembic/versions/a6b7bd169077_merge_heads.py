"""merge_heads

Revision ID: a6b7bd169077
Revises: 5d53827aaa42
Create Date: 2026-10-02 20:40:32.350317

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a6b7bd169077'
down_revision: Union[str, Sequence[str], None] = '5d53827aaa42'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
