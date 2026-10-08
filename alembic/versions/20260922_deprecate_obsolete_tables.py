"""deprecate_obsolete_tables_and_columns

Revision ID: 20260922_deprecate_tables
Revises: 20260919_signatures_diagrams
Create Date: 2026-09-22 12:05:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic (<= 32 characters).
revision: str = '20260922_deprecate_tables'
down_revision: Union[str, Sequence[str], None] = '20260919_signatures_diagrams'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """
    Upgrades database schema for pure DICT ISSP v.2026 compliance:
    1. Removes foreign key constraints and `campus_id` columns from `departments` and `users`.
    2. Drops obsolete legacy census and tracking tables superseded by Annex 1 & Annex 2:
       - `server_capacity_tracking`
       - `client_os_census`
       - `office_software_census`
       - `annual_cost_breakdown`
       - `campuses`
    3. Drops obsolete legacy MITHI survey and transmittal letter columns from `master_narratives`.
    """
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = inspector.get_table_names()

    # ==========================================================
    # 1. REMOVE CAMPUS FOREIGN KEYS & COLUMNS FROM DEPARTMENTS & USERS
    # ==========================================================
    if 'departments' in tables:
        dept_cols = [c['name'] for c in inspector.get_columns('departments')]
        dept_indexes = [ix['name'] for ix in inspector.get_indexes('departments')]
        with op.batch_alter_table('departments', schema=None) as batch_op:
            if 'campus_id' in dept_cols:
                try:
                    batch_op.drop_constraint('fk_departments_campus_id', type_='foreignkey')
                except Exception:
                    pass
                if 'ix_departments_campus_id' in dept_indexes:
                    batch_op.drop_index('ix_departments_campus_id')
                batch_op.drop_column('campus_id')

    if 'users' in tables:
        user_cols = [c['name'] for c in inspector.get_columns('users')]
        user_indexes = [ix['name'] for ix in inspector.get_indexes('users')]
        with op.batch_alter_table('users', schema=None) as batch_op:
            if 'campus_id' in user_cols:
                try:
                    batch_op.drop_constraint('fk_users_campus_id', type_='foreignkey')
                except Exception:
                    pass
                if 'ix_users_campus_id' in user_indexes:
                    batch_op.drop_index('ix_users_campus_id')
                batch_op.drop_column('campus_id')

    # ==========================================================
    # 2. DROP OBSOLETE LEGACY TABLES
    # ==========================================================
    if 'server_capacity_tracking' in tables:
        op.drop_table('server_capacity_tracking')

    if 'client_os_census' in tables:
        op.drop_table('client_os_census')

    if 'office_software_census' in tables:
        op.drop_table('office_software_census')

    if 'annual_cost_breakdown' in tables:
        op.drop_table('annual_cost_breakdown')

    if 'campuses' in tables:
        op.drop_table('campuses')

    # ==========================================================
    # 3. DROP OBSOLETE COLUMNS FROM MASTER_NARRATIVES
    # ==========================================================
    if 'master_narratives' in tables:
        narrative_cols = [c['name'] for c in inspector.get_columns('master_narratives')]
        obsolete_narrative_cols = [
            'mithi_network_profile',
            'mithi_data_center',
            'mithi_security_dr',
            'mithi_data_archiving',
            'mithi_ict_issues',
            'mithi_special_solutions',
            'mithi_hardware_inventory',
            'transmittal_recipient',
            'transmittal_recipient_title',
            'transmittal_recipient_agency',
            'transmittal_recipient_address',
            'transmittal_date'
        ]

        cols_to_drop = [c for c in obsolete_narrative_cols if c in narrative_cols]
        if cols_to_drop:
            with op.batch_alter_table('master_narratives', schema=None) as batch_op:
                for col in cols_to_drop:
                    batch_op.drop_column(col)


def downgrade() -> None:
    """
    Downgrade schema: re-creates dropped tables and legacy master_narrative columns.
    """
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = inspector.get_table_names()

    # 1. Re-add obsolete master_narratives columns
    if 'master_narratives' in tables:
        narrative_cols = [c['name'] for c in inspector.get_columns('master_narratives')]
        with op.batch_alter_table('master_narratives', schema=None) as batch_op:
            if 'transmittal_date' not in narrative_cols:
                batch_op.add_column(sa.Column('transmittal_date', sa.String(length=100), nullable=True))
            if 'transmittal_recipient_address' not in narrative_cols:
                batch_op.add_column(sa.Column('transmittal_recipient_address', sa.Text(), nullable=True))
            if 'transmittal_recipient_agency' not in narrative_cols:
                batch_op.add_column(sa.Column('transmittal_recipient_agency', sa.String(length=200), nullable=True))
            if 'transmittal_recipient_title' not in narrative_cols:
                batch_op.add_column(sa.Column('transmittal_recipient_title', sa.String(length=200), nullable=True))
            if 'transmittal_recipient' not in narrative_cols:
                batch_op.add_column(sa.Column('transmittal_recipient', sa.String(length=200), nullable=True))
            if 'mithi_hardware_inventory' not in narrative_cols:
                batch_op.add_column(sa.Column('mithi_hardware_inventory', sa.JSON(), server_default='[]', nullable=False))
            if 'mithi_special_solutions' not in narrative_cols:
                batch_op.add_column(sa.Column('mithi_special_solutions', sa.JSON(), server_default='[]', nullable=False))
            if 'mithi_ict_issues' not in narrative_cols:
                batch_op.add_column(sa.Column('mithi_ict_issues', sa.JSON(), server_default='{}', nullable=True))
            if 'mithi_data_archiving' not in narrative_cols:
                batch_op.add_column(sa.Column('mithi_data_archiving', sa.JSON(), server_default='{}', nullable=True))
            if 'mithi_security_dr' not in narrative_cols:
                batch_op.add_column(sa.Column('mithi_security_dr', sa.JSON(), server_default='{}', nullable=True))
            if 'mithi_data_center' not in narrative_cols:
                batch_op.add_column(sa.Column('mithi_data_center', sa.JSON(), server_default='{}', nullable=True))
            if 'mithi_network_profile' not in narrative_cols:
                batch_op.add_column(sa.Column('mithi_network_profile', sa.JSON(), server_default='{}', nullable=True))

    # 2. Re-create campuses table
    if 'campuses' not in tables:
        op.create_table(
            'campuses',
            sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
            sa.Column('name', sa.String(length=100), nullable=False),
            sa.Column('location', sa.String(length=200), nullable=False),
            sa.Column('code', sa.String(length=10), nullable=False),
            sa.PrimaryKeyConstraint('id', name='pk_campuses'),
            sa.UniqueConstraint('code', name='uq_campuses_code'),
            sa.UniqueConstraint('name', name='uq_campuses_name')
        )

    # 3. Re-create annual_cost_breakdown
    if 'annual_cost_breakdown' not in tables:
        op.create_table(
            'annual_cost_breakdown',
            sa.Column('id', sa.CHAR(length=36), nullable=False),
            sa.Column('issp_period', sa.String(length=50), nullable=False),
            sa.Column('project_key', sa.String(length=100), nullable=False),
            sa.Column('cost_type', sa.String(length=50), nullable=False),
            sa.Column('item_description', sa.String(length=200), nullable=False),
            sa.Column('unit_cost', sa.Numeric(precision=15, scale=2), nullable=False),
            sa.Column('yearly_quantities', sa.JSON(), server_default='{}', nullable=False),
            sa.ForeignKeyConstraint(['issp_period'], ['master_narratives.issp_period'], name='fk_annual_cost_issp_period', onupdate='CASCADE', ondelete='CASCADE'),
            sa.PrimaryKeyConstraint('id', name='pk_annual_cost_breakdown')
        )

    # 4. Re-create office_software_census
    if 'office_software_census' not in tables:
        op.create_table(
            'office_software_census',
            sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
            sa.Column('software_name', sa.String(length=100), nullable=False),
            sa.Column('license_count', sa.Integer(), server_default='0', nullable=False),
            sa.PrimaryKeyConstraint('id', name='pk_office_software_census'),
            sa.UniqueConstraint('software_name', name='uq_office_software_name')
        )

    # 5. Re-create client_os_census
    if 'client_os_census' not in tables:
        op.create_table(
            'client_os_census',
            sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
            sa.Column('os_name', sa.String(length=100), nullable=False),
            sa.Column('workstations_count', sa.Integer(), server_default='0', nullable=False),
            sa.Column('servers_count', sa.Integer(), server_default='0', nullable=False),
            sa.PrimaryKeyConstraint('id', name='pk_client_os_census'),
            sa.UniqueConstraint('os_name', name='uq_client_os_name')
        )

    # 6. Re-create server_capacity_tracking
    if 'server_capacity_tracking' not in tables:
        op.create_table(
            'server_capacity_tracking',
            sa.Column('id', sa.CHAR(length=36), nullable=False),
            sa.Column('campus_id', sa.Integer(), nullable=False),
            sa.Column('capacity_tier', sa.String(length=50), nullable=False),
            sa.Column('location', sa.String(length=50), nullable=False),
            sa.Column('quantity', sa.Integer(), server_default='1', nullable=False),
            sa.ForeignKeyConstraint(['campus_id'], ['campuses.id'], name='fk_server_cap_campus_id', ondelete='CASCADE'),
            sa.PrimaryKeyConstraint('id', name='pk_server_capacity_tracking')
        )

    # 7. Restore campus_id columns to departments and users
    if 'departments' in tables:
        dept_cols = [c['name'] for c in inspector.get_columns('departments')]
        with op.batch_alter_table('departments', schema=None) as batch_op:
            if 'campus_id' not in dept_cols:
                batch_op.add_column(sa.Column('campus_id', sa.Integer(), nullable=True))
                batch_op.create_index('ix_departments_campus_id', ['campus_id'], unique=False)
                batch_op.create_foreign_key('fk_departments_campus_id', 'campuses', ['campus_id'], ['id'], ondelete='SET NULL')

    if 'users' in tables:
        user_cols = [c['name'] for c in inspector.get_columns('users')]
        with op.batch_alter_table('users', schema=None) as batch_op:
            if 'campus_id' not in user_cols:
                batch_op.add_column(sa.Column('campus_id', sa.Integer(), nullable=True))
                batch_op.create_index('ix_users_campus_id', ['campus_id'], unique=False)
                batch_op.create_foreign_key('fk_users_campus_id', 'campuses', ['campus_id'], ['id'], ondelete='SET NULL')