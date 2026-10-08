"""merge_heads

Revision ID: 5d53827aaa42
Revises: 20261031_proj_egov
Create Date: 2026-10-02 17:29:06.426899

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '5d53827aaa42'
down_revision: Union[str, Sequence[str], None] = '20261031_proj_egov'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
