"""merge_heads

Revision ID: c765a958f5f3
Revises: 20261101_fix_compiler
Create Date: 2026-10-05 19:15:34.774715

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c765a958f5f3'
down_revision: Union[str, Sequence[str], None] = '20261101_fix_compiler'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
