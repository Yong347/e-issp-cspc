"""purge_signatures_and_layout_diagrams

Revision ID: 20261020_purge_sigs_diagrams
Revises: 20261015_fix_cbs_notnull
Create Date: 2026-10-20 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic (<= 32 characters).
revision: str = '20261020_purge_sigs_diagrams'
down_revision: Union[str, Sequence[str], None] = '20261015_fix_cbs_notnull'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """
    Purges non-standard visual and digital signature artifacts for DICT ISSP v.2026 compliance:
    1. Removes 'architecture_diagram_url' from 'information_systems' (individual systems cards
       contain strictly tabular text fields matching CSPC ISSP Pages 17–46 & 54–95).
    2. Removes digital signature image fields ('cio_signature_url', 'head_signature_url')
       from 'master_narratives' in favor of official physical sign-off lines on the cover page.
    3. Removes accreditation seal ('cert_logo_url') and legacy modular subsystem diagrams
       ('subsystem_network_layouts_json') from 'master_narratives'.
    """
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = inspector.get_table_names()

    # ==========================================================
    # 1. PURGE FROM 'information_systems'
    # ==========================================================
    if 'information_systems' in tables:
        sys_cols = [c['name'] for c in inspector.get_columns('information_systems')]
        with op.batch_alter_table('information_systems', schema=None) as batch_op:
            if 'architecture_diagram_url' in sys_cols:
                batch_op.drop_column('architecture_diagram_url')

    # ==========================================================
    # 2. PURGE FROM 'master_narratives'
    # ==========================================================
    if 'master_narratives' in tables:
        narrative_cols = [c['name'] for c in inspector.get_columns('master_narratives')]
        cols_to_drop = [
            'cio_signature_url',
            'head_signature_url',
            'cert_logo_url',
            'subsystem_network_layouts_json'
        ]

        with op.batch_alter_table('master_narratives', schema=None) as batch_op:
            for col in cols_to_drop:
                if col in narrative_cols:
                    batch_op.drop_column(col)


def downgrade() -> None:
    """
    Downgrade schema cleanly: re-adds dropped diagram and signature columns.
    """
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = inspector.get_table_names()

    # 1. Rollback 'master_narratives'
    if 'master_narratives' in tables:
        narrative_cols = [c['name'] for c in inspector.get_columns('master_narratives')]
        with op.batch_alter_table('master_narratives', schema=None) as batch_op:
            if 'subsystem_network_layouts_json' not in narrative_cols:
                batch_op.add_column(
                    sa.Column(
                        'subsystem_network_layouts_json',
                        sa.JSON(),
                        server_default=sa.text("'[]'"),
                        nullable=False
                    )
                )
            if 'cert_logo_url' not in narrative_cols:
                batch_op.add_column(
                    sa.Column('cert_logo_url', sa.String(length=500), nullable=True)
                )
            if 'head_signature_url' not in narrative_cols:
                batch_op.add_column(
                    sa.Column('head_signature_url', sa.String(length=500), nullable=True)
                )
            if 'cio_signature_url' not in narrative_cols:
                batch_op.add_column(
                    sa.Column('cio_signature_url', sa.String(length=500), nullable=True)
                )

    # 2. Rollback 'information_systems'
    if 'information_systems' in tables:
        sys_cols = [c['name'] for c in inspector.get_columns('information_systems')]
        with op.batch_alter_table('information_systems', schema=None) as batch_op:
            if 'architecture_diagram_url' not in sys_cols:
                batch_op.add_column(
                    sa.Column('architecture_diagram_url', sa.String(length=500), nullable=True)
                )