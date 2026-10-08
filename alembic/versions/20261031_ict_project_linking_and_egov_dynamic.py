"""ict_project_linking_and_egov_dynamic

Revision ID: 20261031_proj_egov
Revises: f07e4731dfc3
Create Date: 2026-10-31 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic (<= 32 characters).
revision: str = '20261031_proj_egov'

# Note: Chained to merge head 'f07e4731dfc3'. If your branch is directly at
# '20261030_dynamic_enhancements', change this string to '20261030_dynamic_enhancements'.
down_revision: Union[str, Sequence[str], None] = 'f07e4731dfc3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """
    Upgrades database schema for full DICT ISSP v.2026 specification alignment:
    1. information_systems:
       - Adds 'project_id' foreign key (CHAR(36)) linking information systems to ict_projects.
       - Creates index 'ix_information_systems_project_id'.
       - Backfills 'project_id' bidirectionally from existing 'ict_projects.system_id'.
    2. egovernment_checklists:
       - Adds 'equivalent_system_name' (VARCHAR(255)) for named equivalent platforms.
       - Adds 'equivalent_system_url' (VARCHAR(255)) for online equivalent portal links.
       - Adds 'has_other_payment_platform' (BOOLEAN) for eGovPay alternative gateways.
       - Adds 'proposed_development_name' (VARCHAR(255)) for proposed development details.
       - Adds 'total_employees' (VARCHAR(50)) and 'active_pnpki_count' (VARCHAR(50)) for PNPKI metrics.
       - Backfills canonical DICT template parameters.
    3. stakeholder_analyses:
       - Ensures 'complexity_incoming' and 'complexity_outgoing' accept flexible range strings
         (e.g., 'Simple to Complex', 'Simple to Highly Technical').
    """
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = inspector.get_table_names()
    is_sqlite = bind.dialect.name == "sqlite"

    bool_false = sa.text('0') if is_sqlite else sa.text('false')

    # =========================================================================
    # 1. UPGRADE 'information_systems' (LINK TO MAJOR ICT PROJECT)
    # =========================================================================
    if 'information_systems' in tables:
        sys_cols = [c['name'] for c in inspector.get_columns('information_systems')]
        sys_indexes = [ix['name'] for ix in inspector.get_indexes('information_systems')]

        with op.batch_alter_table('information_systems', schema=None) as batch_op:
            if 'project_id' not in sys_cols:
                batch_op.add_column(
                    sa.Column('project_id', sa.CHAR(length=36), nullable=True)
                )

            if 'ix_information_systems_project_id' not in sys_indexes and 'project_id' not in sys_cols:
                batch_op.create_index(
                    'ix_information_systems_project_id',
                    ['project_id'],
                    unique=False
                )

            if 'project_id' not in sys_cols:
                batch_op.create_foreign_key(
                    'fk_info_sys_project_id',
                    'ict_projects',
                    ['project_id'],
                    ['id'],
                    ondelete='SET NULL'
                )

        # Data Migration: Backfill information_systems.project_id from existing ict_projects.system_id
        if 'ict_projects' in tables:
            bind.execute(sa.text("""
                UPDATE information_systems
                SET project_id = (
                    SELECT id FROM ict_projects
                    WHERE ict_projects.system_id = information_systems.id
                    LIMIT 1
                )
                WHERE project_id IS NULL
                  AND EXISTS (
                      SELECT 1 FROM ict_projects
                      WHERE ict_projects.system_id = information_systems.id
                  );
            """))

    # =========================================================================
    # 2. UPGRADE 'egovernment_checklists' (DYNAMIC EGP CHECKLIST CRITERIA)
    # =========================================================================
    if 'egovernment_checklists' in tables:
        egov_cols = [c['name'] for c in inspector.get_columns('egovernment_checklists')]

        with op.batch_alter_table('egovernment_checklists', schema=None) as batch_op:
            if 'equivalent_system_name' not in egov_cols:
                batch_op.add_column(
                    sa.Column('equivalent_system_name', sa.String(length=255), nullable=True)
                )

            if 'equivalent_system_url' not in egov_cols:
                batch_op.add_column(
                    sa.Column('equivalent_system_url', sa.String(length=255), nullable=True)
                )

            if 'has_other_payment_platform' not in egov_cols:
                batch_op.add_column(
                    sa.Column('has_other_payment_platform', sa.Boolean(), server_default=bool_false, nullable=False)
                )

            if 'proposed_development_name' not in egov_cols:
                batch_op.add_column(
                    sa.Column('proposed_development_name', sa.String(length=255), nullable=True)
                )

            if 'total_employees' not in egov_cols:
                batch_op.add_column(
                    sa.Column('total_employees', sa.String(length=50), nullable=True)
                )

            if 'active_pnpki_count' not in egov_cols:
                batch_op.add_column(
                    sa.Column('active_pnpki_count', sa.String(length=50), nullable=True)
                )

        # Backfill existing values into granular columns
        bind.execute(sa.text("""
            UPDATE egovernment_checklists
            SET has_other_payment_platform = 1
            WHERE (LOWER(program_name) LIKE '%egovpay%' OR LOWER(program_name) LIKE '%payment%')
              AND is_utilized = 0;
        """))

        bind.execute(sa.text("""
            UPDATE egovernment_checklists
            SET equivalent_system_name = 'HRIS',
                proposed_development_name = 'PRIME-HRM III enabled HRIS'
            WHERE LOWER(program_name) LIKE '%hcmis%'
              AND (equivalent_system_name IS NULL OR equivalent_system_name = '');
        """))

        bind.execute(sa.text("""
            UPDATE egovernment_checklists
            SET equivalent_system_name = 'Document Tracking and Records Management System'
            WHERE LOWER(program_name) LIKE '%records%'
              AND (equivalent_system_name IS NULL OR equivalent_system_name = '');
        """))

    # =========================================================================
    # 3. UPGRADE 'stakeholder_analyses' (FLEXIBLE COMPLEXITY STRINGS)
    # =========================================================================
    if 'stakeholder_analyses' in tables:
        with op.batch_alter_table('stakeholder_analyses', schema=None) as batch_op:
            batch_op.alter_column(
                'complexity_incoming',
                existing_type=sa.String(length=50),
                type_=sa.String(length=100),
                nullable=False,
                server_default=sa.text("'Simple'")
            )
            batch_op.alter_column(
                'complexity_outgoing',
                existing_type=sa.String(length=50),
                type_=sa.String(length=100),
                nullable=False,
                server_default=sa.text("'Simple'")
            )


def downgrade() -> None:
    """
    Rolls back schema modifications cleanly:
    1. Reverts stakeholder_analyses columns.
    2. Drops dynamic checklist columns from egovernment_checklists.
    3. Drops project_id foreign key, index, and column from information_systems.
    """
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = inspector.get_table_names()

    # 1. Rollback stakeholder_analyses
    if 'stakeholder_analyses' in tables:
        with op.batch_alter_table('stakeholder_analyses', schema=None) as batch_op:
            batch_op.alter_column(
                'complexity_outgoing',
                existing_type=sa.String(length=100),
                type_=sa.String(length=50),
                nullable=False,
                server_default=sa.text("'Simple'")
            )
            batch_op.alter_column(
                'complexity_incoming',
                existing_type=sa.String(length=100),
                type_=sa.String(length=50),
                nullable=False,
                server_default=sa.text("'Simple'")
            )

    # 2. Rollback egovernment_checklists
    if 'egovernment_checklists' in tables:
        egov_cols = [c['name'] for c in inspector.get_columns('egovernment_checklists')]
        with op.batch_alter_table('egovernment_checklists', schema=None) as batch_op:
            if 'active_pnpki_count' in egov_cols:
                batch_op.drop_column('active_pnpki_count')
            if 'total_employees' in egov_cols:
                batch_op.drop_column('total_employees')
            if 'proposed_development_name' in egov_cols:
                batch_op.drop_column('proposed_development_name')
            if 'has_other_payment_platform' in egov_cols:
                batch_op.drop_column('has_other_payment_platform')
            if 'equivalent_system_url' in egov_cols:
                batch_op.drop_column('equivalent_system_url')
            if 'equivalent_system_name' in egov_cols:
                batch_op.drop_column('equivalent_system_name')

    # 3. Rollback information_systems
    if 'information_systems' in tables:
        sys_cols = [c['name'] for c in inspector.get_columns('information_systems')]
        sys_indexes = [ix['name'] for ix in inspector.get_indexes('information_systems')]
        with op.batch_alter_table('information_systems', schema=None) as batch_op:
            if 'project_id' in sys_cols:
                try:
                    batch_op.drop_constraint('fk_info_sys_project_id', type_='foreignkey')
                except Exception:
                    pass
                if 'ix_information_systems_project_id' in sys_indexes:
                    batch_op.drop_index('ix_information_systems_project_id')
                batch_op.drop_column('project_id')