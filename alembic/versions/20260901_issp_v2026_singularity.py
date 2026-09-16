"""migrate_to_issp_v2026_singularity

Revision ID: 20260901_singularity
Revises: 99e52e8f17ad
Create Date: 2026-09-01 00:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '20260901_singularity'
down_revision: Union[str, Sequence[str], None] = '99e52e8f17ad'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema to full DICT ISSP v.2026 relational singularity."""

    # ==========================================================
    # 1. CREATE NEW NORMALIZED TABLES
    # ==========================================================

    # 1.1 Table: information_systems (Parts II.C & III.D)
    op.create_table(
        'information_systems',
        sa.Column('id', sa.CHAR(length=36), nullable=False),
        sa.Column('issp_period', sa.String(length=50), nullable=False),
        sa.Column('strategic_concern_id', sa.CHAR(length=36), nullable=True),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('status', sa.String(length=50), server_default='Operational', nullable=False),
        sa.Column('classification', sa.String(length=100), nullable=False),
        sa.Column('hosting_type', sa.String(length=50), server_default='Hybrid', nullable=False),
        sa.Column('online_url', sa.String(length=255), nullable=True),
        sa.Column('description_and_purpose', sa.Text(), nullable=False),
        sa.Column('development_strategy', sa.String(length=100), nullable=False),
        sa.Column('development_platform', sa.String(length=200), nullable=False),
        sa.Column('database_name', sa.String(length=200), nullable=False),
        sa.Column('data_storage_type', sa.String(length=200), nullable=False),
        sa.Column('internal_users', sa.Text(), nullable=False),
        sa.Column('external_users', sa.Text(), nullable=False),
        sa.Column('system_owner_office', sa.String(length=200), nullable=False),
        sa.Column('is_integrated_with_others', sa.Boolean(), server_default='0', nullable=False),
        sa.Column('internal_integrated_systems', sa.Text(), nullable=True),
        sa.Column('external_integrated_systems', sa.Text(), nullable=True),
        sa.Column('generates_data_for_others', sa.Boolean(), server_default='0', nullable=False),
        sa.Column('processes_data_from_others', sa.Boolean(), server_default='0', nullable=False),
        sa.Column('is_deployed_on_shared_platform', sa.Boolean(), server_default='0', nullable=False),
        sa.Column('processes_personal_information', sa.Boolean(), server_default='0', nullable=False),
        sa.Column('has_undergone_pia', sa.Boolean(), server_default='0', nullable=False),
        sa.ForeignKeyConstraint(['issp_period'], ['master_narratives.issp_period'], name='fk_info_sys_issp_period', onupdate='CASCADE', ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['strategic_concern_id'], ['strategic_concerns.id'], name='fk_info_sys_concern_id', ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id', name='pk_information_systems')
    )
    op.create_index('ix_information_systems_issp_period', 'information_systems', ['issp_period'], unique=False)
    op.create_index('ix_information_systems_strategic_concern_id', 'information_systems', ['strategic_concern_id'], unique=False)

    # 1.2 Table: ict_projects (Part III.E)
    op.create_table(
        'ict_projects',
        sa.Column('id', sa.CHAR(length=36), nullable=False),
        sa.Column('issp_period', sa.String(length=50), nullable=False),
        sa.Column('system_id', sa.CHAR(length=36), nullable=True),
        sa.Column('project_title', sa.String(length=255), nullable=False),
        sa.Column('project_category', sa.String(length=100), server_default='Internal ICT Projects', nullable=False),
        sa.Column('description', sa.Text(), nullable=False),
        sa.Column('objectives', sa.Text(), nullable=False),
        sa.Column('aligns_pip', sa.Boolean(), server_default='0', nullable=False),
        sa.Column('aligns_ncsp', sa.Boolean(), server_default='0', nullable=False),
        sa.Column('aligns_egmp', sa.Boolean(), server_default='0', nullable=False),
        sa.Column('aligns_pcb', sa.Boolean(), server_default='0', nullable=False),
        sa.Column('harmonizes_national_priority', sa.Boolean(), server_default='0', nullable=False),
        sa.Column('harmonizes_resource_optimization', sa.Boolean(), server_default='0', nullable=False),
        sa.Column('harmonizes_pegif', sa.Boolean(), server_default='0', nullable=False),
        sa.Column('harmonizes_cross_collaboration', sa.Boolean(), server_default='0', nullable=False),
        sa.Column('harmonizes_scalability', sa.Boolean(), server_default='0', nullable=False),
        sa.Column('duration_start_year', sa.Integer(), nullable=False),
        sa.Column('duration_end_year', sa.Integer(), nullable=False),
        sa.Column('year_1_deliverables', sa.Text(), nullable=False),
        sa.Column('year_2_deliverables', sa.Text(), nullable=False),
        sa.Column('year_3_deliverables', sa.Text(), nullable=False),
        sa.Column('implementing_unit', sa.String(length=200), nullable=False),
        sa.Column('funding_source', sa.String(length=100), server_default='General Appropriations Act (GAA)', nullable=False),
        sa.Column('lead_agency', sa.String(length=200), nullable=True),
        sa.Column('partner_agencies', sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(['issp_period'], ['master_narratives.issp_period'], name='fk_ict_proj_issp_period', onupdate='CASCADE', ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['system_id'], ['information_systems.id'], name='fk_ict_proj_system_id', ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id', name='pk_ict_projects'),
        sa.UniqueConstraint('project_title', name='uq_ict_projects_title')
    )
    op.create_index('ix_ict_projects_issp_period', 'ict_projects', ['issp_period'], unique=False)
    op.create_index('ix_ict_projects_system_id', 'ict_projects', ['system_id'], unique=False)

    # 1.3 Table: network_infrastructures (Parts II.B.1 & III.A.1)
    op.create_table(
        'network_infrastructures',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('issp_period', sa.String(length=50), nullable=False),
        sa.Column('is_proposed', sa.Boolean(), server_default='0', nullable=False),
        sa.Column('topology_description', sa.Text(), nullable=False),
        sa.Column('connectivity_type', sa.String(length=100), nullable=False),
        sa.Column('bandwidth_mbps', sa.Integer(), nullable=False),
        sa.Column('is_ipv6_ready', sa.Boolean(), server_default='0', nullable=False),
        sa.Column('diagram_url', sa.String(length=500), nullable=True),
        sa.ForeignKeyConstraint(['issp_period'], ['master_narratives.issp_period'], name='fk_net_infra_issp_period', onupdate='CASCADE', ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id', name='pk_network_infrastructures')
    )
    op.create_index('ix_network_infrastructures_issp_period', 'network_infrastructures', ['issp_period'], unique=False)

    # 1.4 Table: cybersecurity_controls (Parts II.B.2 & III.A.2)
    op.create_table(
        'cybersecurity_controls',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('issp_period', sa.String(length=50), nullable=False),
        sa.Column('is_proposed', sa.Boolean(), server_default='0', nullable=False),
        sa.Column('control_domain', sa.String(length=100), nullable=False),
        sa.Column('control_name', sa.String(length=200), nullable=False),
        sa.Column('is_mandatory', sa.Boolean(), server_default='1', nullable=False),
        sa.Column('is_implemented', sa.Boolean(), server_default='0', nullable=False),
        sa.ForeignKeyConstraint(['issp_period'], ['master_narratives.issp_period'], name='fk_cyber_ctrl_issp_period', onupdate='CASCADE', ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id', name='pk_cybersecurity_controls')
    )
    op.create_index('ix_cybersecurity_controls_issp_period', 'cybersecurity_controls', ['issp_period'], unique=False)

    # ==========================================================
    # 2. ALTER EXISTING TABLES FOR RELATIONAL INTEGRATION
    # ==========================================================

    # 2.1 Update 'issp_core' (Proposal / ResourceRequirementItem)
    with op.batch_alter_table('issp_core', schema=None) as batch_op:
        batch_op.add_column(sa.Column('project_id', sa.CHAR(length=36), nullable=True))
        batch_op.add_column(sa.Column('strategic_category', sa.String(length=100), server_default='Office Productivity', nullable=False))
        batch_op.add_column(sa.Column('office_location', sa.String(length=100), server_default='Central Office', nullable=False))
        batch_op.add_column(sa.Column('fund_source', sa.String(length=100), server_default='General Appropriations Act (GAA)', nullable=False))
        batch_op.add_column(sa.Column('uacs_object_code', sa.String(length=150), server_default='50604050 03 - ICT Equipment (CO)', nullable=False))
        batch_op.add_column(sa.Column('expenditure_class', sa.String(length=100), server_default='Capital Outlay', nullable=False))
        batch_op.add_column(sa.Column('year_1_qty', sa.Integer(), server_default='0', nullable=False))
        batch_op.add_column(sa.Column('year_2_qty', sa.Integer(), server_default='0', nullable=False))
        batch_op.add_column(sa.Column('year_3_qty', sa.Integer(), server_default='0', nullable=False))
        batch_op.create_index(batch_op.f('ix_issp_core_project_id'), ['project_id'], unique=False)
        batch_op.create_foreign_key('fk_issp_core_project_id', 'ict_projects', ['project_id'], ['id'], ondelete='SET NULL')

    # 2.2 Update 'existing_inventory' (Annex 1 Office Location)
    with op.batch_alter_table('existing_inventory', schema=None) as batch_op:
        batch_op.add_column(sa.Column('office_location', sa.String(length=100), server_default='Central Office', nullable=False))

    # 2.3 Update 'master_narratives' (Part I Statutory & Focal Signatories)
    with op.batch_alter_table('master_narratives', schema=None) as batch_op:
        batch_op.add_column(sa.Column('functions', sa.Text(), nullable=True))
        batch_op.add_column(sa.Column('focal_name', sa.String(length=200), nullable=True))
        batch_op.add_column(sa.Column('focal_position', sa.String(length=200), nullable=True))
        batch_op.add_column(sa.Column('focal_organizational_unit', sa.String(length=200), nullable=True))
        batch_op.add_column(sa.Column('focal_email', sa.String(length=255), nullable=True))
        batch_op.add_column(sa.Column('focal_contact_no', sa.String(length=100), nullable=True))

    # 2.4 Update 'performance_metrics' (Link to ict_projects)
    with op.batch_alter_table('performance_metrics', schema=None) as batch_op:
        batch_op.add_column(sa.Column('project_id', sa.CHAR(length=36), nullable=True))
        batch_op.create_index(batch_op.f('ix_performance_metrics_project_id'), ['project_id'], unique=False)
        batch_op.create_foreign_key('fk_perf_metric_project_id', 'ict_projects', ['project_id'], ['id'], ondelete='CASCADE')

    # 2.5 Update 'dr_bia_summary' (Link to information_systems)
    with op.batch_alter_table('dr_bia_summary', schema=None) as batch_op:
        batch_op.add_column(sa.Column('system_id', sa.CHAR(length=36), nullable=True))
        batch_op.add_column(sa.Column('mtpd_hours', sa.Integer(), server_default='24', nullable=False))
        batch_op.create_unique_constraint('uq_dr_bia_system_id', ['system_id'])
        batch_op.create_foreign_key('fk_dr_bia_system_id', 'information_systems', ['system_id'], ['id'], ondelete='CASCADE')


def downgrade() -> None:
    """Downgrade schema cleanly back to 99e52e8f17ad."""

    # Rollback dr_bia_summary alterations
    with op.batch_alter_table('dr_bia_summary', schema=None) as batch_op:
        batch_op.drop_constraint('fk_dr_bia_system_id', type_='foreignkey')
        batch_op.drop_constraint('uq_dr_bia_system_id', type_='unique')
        batch_op.drop_column('mtpd_hours')
        batch_op.drop_column('system_id')

    # Rollback performance_metrics alterations
    with op.batch_alter_table('performance_metrics', schema=None) as batch_op:
        batch_op.drop_constraint('fk_perf_metric_project_id', type_='foreignkey')
        batch_op.drop_index(batch_op.f('ix_performance_metrics_project_id'))
        batch_op.drop_column('project_id')

    # Rollback master_narratives alterations
    with op.batch_alter_table('master_narratives', schema=None) as batch_op:
        batch_op.drop_column('focal_contact_no')
        batch_op.drop_column('focal_email')
        batch_op.drop_column('focal_organizational_unit')
        batch_op.drop_column('focal_position')
        batch_op.drop_column('focal_name')
        batch_op.drop_column('functions')

    # Rollback existing_inventory alterations
    with op.batch_alter_table('existing_inventory', schema=None) as batch_op:
        batch_op.drop_column('office_location')

    # Rollback issp_core alterations
    with op.batch_alter_table('issp_core', schema=None) as batch_op:
        batch_op.drop_constraint('fk_issp_core_project_id', type_='foreignkey')
        batch_op.drop_index(batch_op.f('ix_issp_core_project_id'))
        batch_op.drop_column('year_3_qty')
        batch_op.drop_column('year_2_qty')
        batch_op.drop_column('year_1_qty')
        batch_op.drop_column('expenditure_class')
        batch_op.drop_column('uacs_object_code')
        batch_op.drop_column('fund_source')
        batch_op.drop_column('office_location')
        batch_op.drop_column('strategic_category')
        batch_op.drop_column('project_id')

    # Drop new normalized tables in reverse order
    op.drop_table('cybersecurity_controls')
    op.drop_table('network_infrastructures')
    op.drop_table('ict_projects')
    op.drop_table('information_systems')