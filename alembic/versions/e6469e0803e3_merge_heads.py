"""merge_heads

Revision ID: e6469e0803e3
Revises: 20261028_seed_glossary
Create Date: 2026-10-07 12:59:38.869130

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e6469e0803e3'
down_revision: Union[str, Sequence[str], None] = '20261028_seed_glossary'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
