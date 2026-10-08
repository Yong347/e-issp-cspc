"""purge_doctree_and_dict_v2026_spec

Revision ID: 20261005_purge_doctree
Revises: a8bf4152b09e
Create Date: 2026-10-05 00:00:00.000000

"""
import re
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic (<= 32 characters).
revision: str = '20261005_purge_doctree'
down_revision: Union[str, Sequence[str], None] = 'a8bf4152b09e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def strip_html_tags(text_val: Union[str, None]) -> str:
    """Utility to convert legacy HTML formatting into clean, structured plain text."""
    if not text_val:
        return ""
    # Convert block elements to clean line breaks
    clean = re.sub(r'</?(p|br|li|h[1-6]|tr|div)[^>]*>', '\n', str(text_val), flags=re.IGNORECASE)
    # Strip remaining inline tags
    clean = re.sub(r'<[^>]+>', '', clean)
    # Decode basic HTML entities
    clean = clean.replace('&amp;', '&').replace('&lt;', '<').replace('&gt;', '>').replace('&quot;', '"').replace('&#39;', "'")
    # Normalize multiple newlines into standard paragraph breaks
    clean = re.sub(r'\n\s*\n+', '\n\n', clean).strip()
    return clean


def upgrade() -> None:
    """
    1. Purges legacy document tree tables (issp_assets, issp_contents, issp_vocabulary, issp_nodes).
    2. Migrates raw HTML fields in master_narratives to plain-text DICT v.2026 fields.
    3. Adds granular frontline, enhancement, and architecture columns to information_systems.
    4. Handles SQLite batch constraints and PostgreSQL native enums defensively.
    """
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = inspector.get_table_names()
    is_sqlite = bind.dialect.name == "sqlite"

    # ==========================================================
    # 1. PURGE LEGACY DOCUMENT TREE TABLES
    # ==========================================================
    tables_to_drop = ['issp_assets', 'issp_contents', 'issp_vocabulary', 'issp_nodes']
    for tbl in tables_to_drop:
        if tbl in tables:
            op.drop_table(tbl)

    # Drop PostgreSQL native enums belonging to the document tree
    if not is_sqlite:
        op.execute(sa.text("""
            DO $$
            BEGIN
                DROP TYPE IF EXISTS assetrole CASCADE;
                DROP TYPE IF EXISTS contenttype CASCADE;
                DROP TYPE IF EXISTS pageorientation CASCADE;
                DROP TYPE IF EXISTS nodetype CASCADE;
            EXCEPTION WHEN OTHERS THEN
                NULL;
            END $$;
        """))

    # ==========================================================
    # 2. UPGRADE 'master_narratives' TO CLEAN PLAIN TEXT
    # ==========================================================
    if 'master_narratives' in tables:
        narrative_cols = [c['name'] for c in inspector.get_columns('master_narratives')]

        with op.batch_alter_table('master_narratives', schema=None) as batch_op:
            if 'mandate_text' not in narrative_cols:
                batch_op.add_column(sa.Column('mandate_text', sa.Text(), server_default='', nullable=False))
            if 'vision_text' not in narrative_cols:
                batch_op.add_column(sa.Column('vision_text', sa.Text(), server_default='', nullable=False))
            if 'mission_text' not in narrative_cols:
                batch_op.add_column(sa.Column('mission_text', sa.Text(), server_default='', nullable=False))
            if 'present_situation_text' not in narrative_cols:
                batch_op.add_column(sa.Column('present_situation_text', sa.Text(), server_default='', nullable=False))
            if 'drbcp_recovery_strategy_text' not in narrative_cols:
                batch_op.add_column(sa.Column('drbcp_recovery_strategy_text', sa.Text(), nullable=True))
            if 'drbcp_sop_phases_text' not in narrative_cols:
                batch_op.add_column(sa.Column('drbcp_sop_phases_text', sa.Text(), nullable=True))
            if 'drbcp_compliance_narrative_text' not in narrative_cols:
                batch_op.add_column(sa.Column('drbcp_compliance_narrative_text', sa.Text(), nullable=True))

        # Data Migration: Extract clean text from legacy HTML fields if present
        select_cols = ['issp_period']
        for col in [
            'mandate_html', 'vision_html', 'mission_html', 'present_situation_html',
            'drbcp_recovery_strategy_html', 'drbcp_sop_phases_html', 'drbcp_compliance_narrative_html'
        ]:
            if col in narrative_cols:
                select_cols.append(col)

        if len(select_cols) > 1:
            rows = bind.execute(sa.text(f"SELECT {', '.join(select_cols)} FROM master_narratives")).fetchall()
            for r in rows:
                r_dict = dict(zip(select_cols, r))
                period = r_dict['issp_period']

                updates = {}
                if 'mandate_html' in r_dict and r_dict['mandate_html']:
                    updates['mandate_text'] = strip_html_tags(r_dict['mandate_html'])
                if 'vision_html' in r_dict and r_dict['vision_html']:
                    updates['vision_text'] = strip_html_tags(r_dict['vision_html'])
                if 'mission_html' in r_dict and r_dict['mission_html']:
                    updates['mission_text'] = strip_html_tags(r_dict['mission_html'])
                if 'present_situation_html' in r_dict and r_dict['present_situation_html']:
                    updates['present_situation_text'] = strip_html_tags(r_dict['present_situation_html'])
                if 'drbcp_recovery_strategy_html' in r_dict and r_dict['drbcp_recovery_strategy_html']:
                    updates['drbcp_recovery_strategy_text'] = strip_html_tags(r_dict['drbcp_recovery_strategy_html'])
                if 'drbcp_sop_phases_html' in r_dict and r_dict['drbcp_sop_phases_html']:
                    updates['drbcp_sop_phases_text'] = strip_html_tags(r_dict['drbcp_sop_phases_html'])
                if 'drbcp_compliance_narrative_html' in r_dict and r_dict['drbcp_compliance_narrative_html']:
                    updates['drbcp_compliance_narrative_text'] = strip_html_tags(r_dict['drbcp_compliance_narrative_html'])

                if updates:
                    set_statements = ", ".join([f"{k} = :{k}" for k in updates.keys()])
                    updates['period'] = period
                    bind.execute(
                        sa.text(f"UPDATE master_narratives SET {set_statements} WHERE issp_period = :period"),
                        updates
                    )

    # ==========================================================
    # 3. UPGRADE 'information_systems' (DICT v.2026 SPEC)
    # ==========================================================
    if 'information_systems' in tables:
        sys_cols = [c['name'] for c in inspector.get_columns('information_systems')]

        with op.batch_alter_table('information_systems', schema=None) as batch_op:
            if 'is_frontline_service' not in sys_cols:
                batch_op.add_column(sa.Column('is_frontline_service', sa.Boolean(), server_default='1', nullable=False))
            if 'frontline_hosting_type' not in sys_cols:
                batch_op.add_column(sa.Column('frontline_hosting_type', sa.String(length=50), server_default='Online', nullable=False))
            if 'is_non_frontline_service' not in sys_cols:
                batch_op.add_column(sa.Column('is_non_frontline_service', sa.Boolean(), server_default='0', nullable=False))
            if 'enhancement_details' not in sys_cols:
                batch_op.add_column(sa.Column('enhancement_details', sa.Text(), nullable=True))
            if 'pia_target_date_text' not in sys_cols:
                batch_op.add_column(sa.Column('pia_target_date_text', sa.String(length=100), nullable=True))
            if 'architecture_diagram_url' not in sys_cols:
                batch_op.add_column(sa.Column('architecture_diagram_url', sa.String(length=500), nullable=True))

        # Data Migration: Harmonize boolean flags based on classification and hosting_type
        bind.execute(sa.text("""
            UPDATE information_systems 
            SET 
                is_frontline_service = CASE 
                    WHEN classification ILIKE '%frontline%' THEN 1 
                    ELSE 0 
                END,
                is_non_frontline_service = CASE 
                    WHEN classification ILIKE '%non-frontline%' THEN 1 
                    ELSE 0 
                END,
                frontline_hosting_type = COALESCE(hosting_type, 'Online')
            WHERE is_frontline_service IS NULL OR frontline_hosting_type IS NULL;
        """))


def downgrade() -> None:
    """
    Downgrade schema:
    1. Reverts information_systems columns.
    2. Drops plain-text columns from master_narratives.
    3. Recreates document tree tables.
    """
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = inspector.get_table_names()

    # 1. Rollback 'information_systems'
    if 'information_systems' in tables:
        sys_cols = [c['name'] for c in inspector.get_columns('information_systems')]
        with op.batch_alter_table('information_systems', schema=None) as batch_op:
            if 'architecture_diagram_url' in sys_cols:
                batch_op.drop_column('architecture_diagram_url')
            if 'pia_target_date_text' in sys_cols:
                batch_op.drop_column('pia_target_date_text')
            if 'enhancement_details' in sys_cols:
                batch_op.drop_column('enhancement_details')
            if 'is_non_frontline_service' in sys_cols:
                batch_op.drop_column('is_non_frontline_service')
            if 'frontline_hosting_type' in sys_cols:
                batch_op.drop_column('frontline_hosting_type')
            if 'is_frontline_service' in sys_cols:
                batch_op.drop_column('is_frontline_service')

    # 2. Rollback 'master_narratives'
    if 'master_narratives' in tables:
        narrative_cols = [c['name'] for c in inspector.get_columns('master_narratives')]
        with op.batch_alter_table('master_narratives', schema=None) as batch_op:
            if 'drbcp_compliance_narrative_text' in narrative_cols:
                batch_op.drop_column('drbcp_compliance_narrative_text')
            if 'drbcp_sop_phases_text' in narrative_cols:
                batch_op.drop_column('drbcp_sop_phases_text')
            if 'drbcp_recovery_strategy_text' in narrative_cols:
                batch_op.drop_column('drbcp_recovery_strategy_text')
            if 'present_situation_text' in narrative_cols:
                batch_op.drop_column('present_situation_text')
            if 'mission_text' in narrative_cols:
                batch_op.drop_column('mission_text')
            if 'vision_text' in narrative_cols:
                batch_op.drop_column('vision_text')
            if 'mandate_text' in narrative_cols:
                batch_op.drop_column('mandate_text')

    # 3. Recreate legacy document tree tables
    if 'issp_nodes' not in tables:
        op.create_table(
            'issp_nodes',
            sa.Column('id', sa.Integer(), nullable=False, autoincrement=True),
            sa.Column('parent_id', sa.Integer(), nullable=True),
            sa.Column('node_type', sa.String(length=50), nullable=False),
            sa.Column('system_key', sa.String(length=100), nullable=False),
            sa.Column('sequence_order', sa.Numeric(precision=6, scale=3), nullable=False),
            sa.Column('page_orientation', sa.String(length=50), server_default='landscape', nullable=False),
            sa.Column('force_page_break', sa.Boolean(), server_default='0', nullable=False),
            sa.Column('created_at', sa.DateTime(), server_default=sa.func.now(), nullable=False),
            sa.ForeignKeyConstraint(['parent_id'], ['issp_nodes.id'], name='fk_issp_nodes_parent_id', ondelete='CASCADE'),
            sa.PrimaryKeyConstraint('id', name='pk_issp_nodes')
        )
        op.create_index('ix_issp_nodes_parent_id', 'issp_nodes', ['parent_id'], unique=False)
        op.create_index('ix_issp_nodes_system_key', 'issp_nodes', ['system_key'], unique=True)

    if 'issp_vocabulary' not in tables:
        op.create_table(
            'issp_vocabulary',
            sa.Column('id', sa.Integer(), nullable=False, autoincrement=True),
            sa.Column('node_id', sa.Integer(), nullable=False),
            sa.Column('display_title', sa.String(length=255), nullable=False),
            sa.Column('toc_label', sa.String(length=255), nullable=False),
            sa.ForeignKeyConstraint(['node_id'], ['issp_nodes.id'], name='fk_issp_vocabulary_node_id', ondelete='CASCADE'),
            sa.PrimaryKeyConstraint('id', name='pk_issp_vocabulary')
        )
        op.create_index('ix_issp_vocabulary_node_id', 'issp_vocabulary', ['node_id'], unique=False)

    if 'issp_contents' not in tables:
        op.create_table(
            'issp_contents',
            sa.Column('id', sa.Integer(), nullable=False, autoincrement=True),
            sa.Column('node_id', sa.Integer(), nullable=False),
            sa.Column('content_type', sa.String(length=50), nullable=False),
            sa.Column('json_data', sa.JSON(), nullable=False),
            sa.ForeignKeyConstraint(['node_id'], ['issp_nodes.id'], name='fk_issp_contents_node_id', ondelete='CASCADE'),
            sa.PrimaryKeyConstraint('id', name='pk_issp_contents')
        )
        op.create_index('ix_issp_contents_node_id', 'issp_contents', ['node_id'], unique=False)

    if 'issp_assets' not in tables:
        op.create_table(
            'issp_assets',
            sa.Column('id', sa.Integer(), nullable=False, autoincrement=True),
            sa.Column('node_id', sa.Integer(), nullable=False),
            sa.Column('file_path', sa.String(length=255), nullable=False),
            sa.Column('asset_role', sa.String(length=50), nullable=False),
            sa.Column('custom_title', sa.String(length=255), nullable=True),
            sa.Column('aspect_ratio_preserve', sa.Boolean(), server_default='1', nullable=False),
            sa.ForeignKeyConstraint(['node_id'], ['issp_nodes.id'], name='fk_issp_assets_node_id', ondelete='CASCADE'),
            sa.PrimaryKeyConstraint('id', name='pk_issp_assets')
        )
        op.create_index('ix_issp_assets_node_id', 'issp_assets', ['node_id'], unique=False)