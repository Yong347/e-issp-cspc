# alembic/versions/20260916_dict_branding_and_audit_expansion.py
"""dict_branding_and_audit_expansion

Revision ID: 20260916_branding_audit
Revises: 20260916_rm_legacy_sias
Create Date: 2026-09-16 15:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic (<= 32 characters).
revision: str = '20260916_branding_audit'
down_revision: Union[str, Sequence[str], None] = '20260916_rm_legacy_sias'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """
    Upgrades database schema for DICT v.2026 compliance:
    1. Adds 'dict_logo_url' and 'bagong_pilipinas_logo_url' to 'master_narratives'.
    2. Expands 'audit_trails' with 'module', 'ip_address', and role-scoped 'department_id'.
    """
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    table_names = inspector.get_table_names()

    # ==========================================================
    # 1. UPDATE 'master_narratives' (DICT & Bagong Pilipinas Logos)
    # ==========================================================
    if 'master_narratives' in table_names:
        narrative_cols = [c['name'] for c in inspector.get_columns('master_narratives')]
        with op.batch_alter_table('master_narratives', schema=None) as batch_op:
            if 'dict_logo_url' not in narrative_cols:
                batch_op.add_column(
                    sa.Column('dict_logo_url', sa.String(length=500), nullable=True)
                )
            if 'bagong_pilipinas_logo_url' not in narrative_cols:
                batch_op.add_column(
                    sa.Column('bagong_pilipinas_logo_url', sa.String(length=500), nullable=True)
                )

    # ==========================================================
    # 2. UPDATE 'audit_trails' (COA Security & Role-Scoped Audit)
    # ==========================================================
    if 'audit_trails' in table_names:
        audit_cols = [c['name'] for c in inspector.get_columns('audit_trails')]
        audit_indexes = [ix['name'] for ix in inspector.get_indexes('audit_trails')]

        with op.batch_alter_table('audit_trails', schema=None) as batch_op:
            if 'module' not in audit_cols:
                batch_op.add_column(
                    sa.Column('module', sa.String(length=100), server_default='GOVERNANCE', nullable=False)
                )

            if 'ip_address' not in audit_cols:
                batch_op.add_column(
                    sa.Column('ip_address', sa.String(length=50), nullable=True)
                )

            if 'department_id' not in audit_cols:
                batch_op.add_column(
                    sa.Column('department_id', sa.Integer(), nullable=True)
                )
                batch_op.create_index(
                    batch_op.f('ix_audit_trails_department_id'),
                    ['department_id'],
                    unique=False
                )
                batch_op.create_foreign_key(
                    'fk_audit_trails_department_id',
                    'departments',
                    ['department_id'],
                    ['id'],
                    ondelete='SET NULL'
                )
            elif 'ix_audit_trails_department_id' not in audit_indexes:
                batch_op.create_index(
                    batch_op.f('ix_audit_trails_department_id'),
                    ['department_id'],
                    unique=False
                )


def downgrade() -> None:
    """Downgrade schema cleanly back to 20260916_rm_legacy_sias."""
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    table_names = inspector.get_table_names()

    # 1. Rollback 'audit_trails'
    if 'audit_trails' in table_names:
        audit_cols = [c['name'] for c in inspector.get_columns('audit_trails')]
        audit_indexes = [ix['name'] for ix in inspector.get_indexes('audit_trails')]

        with op.batch_alter_table('audit_trails', schema=None) as batch_op:
            if 'department_id' in audit_cols:
                batch_op.drop_constraint('fk_audit_trails_department_id', type_='foreignkey')
                if 'ix_audit_trails_department_id' in audit_indexes:
                    batch_op.drop_index(batch_op.f('ix_audit_trails_department_id'))
                batch_op.drop_column('department_id')

            if 'ip_address' in audit_cols:
                batch_op.drop_column('ip_address')

            if 'module' in audit_cols:
                batch_op.drop_column('module')

    # 2. Rollback 'master_narratives'
    if 'master_narratives' in table_names:
        narrative_cols = [c['name'] for c in inspector.get_columns('master_narratives')]
        with op.batch_alter_table('master_narratives', schema=None) as batch_op:
            if 'bagong_pilipinas_logo_url' in narrative_cols:
                batch_op.drop_column('bagong_pilipinas_logo_url')
            if 'dict_logo_url' in narrative_cols:
                batch_op.drop_column('dict_logo_url')