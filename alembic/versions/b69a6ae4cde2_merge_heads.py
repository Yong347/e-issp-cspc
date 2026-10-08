"""merge_heads

Revision ID: b69a6ae4cde2
Revises: 20261025_dept_sys_proposals
Create Date: 2026-10-01 20:14:41.698837

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b69a6ae4cde2'
down_revision: Union[str, Sequence[str], None] = '20261025_dept_sys_proposals'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass