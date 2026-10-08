"""merge_heads

Revision ID: f07e4731dfc3
Revises: 20260921_purge_test, 20260923_purge_test_sanitization, 20261030_dynamic_enhancements
Create Date: 2026-10-02 14:56:07.892273

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f07e4731dfc3'
down_revision: Union[str, Sequence[str], None] = ('20260921_purge_test', '20260923_purge_test_sanitization', '20261030_dynamic_enhancements')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
