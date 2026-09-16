# alembic/versions/20260911_dict_v2026_alignment.py
"""align_dict_issp_v2026_specifications

Revision ID: 20260911_v2026_alignment
Revises: 20260901_singularity
Create Date: 2026-09-11 15:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '20260911_v2026_alignment'
down_revision: Union[str, Sequence[str], None] = '20260901_singularity'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade database schema with missing DICT v.2026 specification fields."""

    # 1. Update 'master_narratives' (Transmittal Letter, Scope, Amendment, & CIO Unit)
    with op.batch_alter_table('master_narratives', schema=None) as batch_op:
        batch_op.add_column(sa.Column('is_amendment', sa.Boolean(), server_default='0', nullable=False))
        batch_op.add_column(sa.Column('amendment_number', sa.String(length=50), nullable=True))
        batch_op.add_column(sa.Column('cio_organizational_unit', sa.String(length=200), nullable=True))
        batch_op.add_column(sa.Column('transmittal_recipient', sa.String(length=200), nullable=True))
        batch_op.add_column(sa.Column('transmittal_recipient_title', sa.String(length=200), nullable=True))
        batch_op.add_column(sa.Column('transmittal_recipient_agency', sa.String(length=200), nullable=True))
        batch_op.add_column(sa.Column('transmittal_recipient_address', sa.Text(), nullable=True))
        batch_op.add_column(sa.Column('transmittal_date', sa.String(length=100), nullable=True))

    # 2. Update 'egovernment_checklists' (PNPKI adoption ratio, channels, portal status)
    with op.batch_alter_table('egovernment_checklists', schema=None) as batch_op:
        batch_op.add_column(sa.Column('adoption_ratio', sa.String(length=100), nullable=True))
        batch_op.add_column(sa.Column('channels_json', sa.JSON(), server_default='[]', nullable=False))
        batch_op.add_column(sa.Column('is_connected_to_portal', sa.Boolean(), server_default='0', nullable=False))

    # 3. Update 'network_infrastructures' (Granular speeds & office deployment site)
    with op.batch_alter_table('network_infrastructures', schema=None) as batch_op:
        batch_op.add_column(sa.Column('upload_speed_mbps', sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column('download_speed_mbps', sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column('office_location', sa.String(length=200), server_default='Central Office', nullable=True))


def downgrade() -> None:
    """Downgrade schema cleanly back to 20260901_singularity."""

    # Rollback 'network_infrastructures' alterations
    with op.batch_alter_table('network_infrastructures', schema=None) as batch_op:
        batch_op.drop_column('office_location')
        batch_op.drop_column('download_speed_mbps')
        batch_op.drop_column('upload_speed_mbps')

    # Rollback 'egovernment_checklists' alterations
    with op.batch_alter_table('egovernment_checklists', schema=None) as batch_op:
        batch_op.drop_column('is_connected_to_portal')
        batch_op.drop_column('channels_json')
        batch_op.drop_column('adoption_ratio')

    # Rollback 'master_narratives' alterations
    with op.batch_alter_table('master_narratives', schema=None) as batch_op:
        batch_op.drop_column('transmittal_date')
        batch_op.drop_column('transmittal_recipient_address')
        batch_op.drop_column('transmittal_recipient_agency')
        batch_op.drop_column('transmittal_recipient_title')
        batch_op.drop_column('transmittal_recipient')
        batch_op.drop_column('cio_organizational_unit')
        batch_op.drop_column('amendment_number')
        batch_op.drop_column('is_amendment')