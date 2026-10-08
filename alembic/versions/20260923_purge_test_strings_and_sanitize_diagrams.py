# alembic/versions/20260923_purge_test_strings_and_sanitize_diagrams.py
"""purge_test_strings_and_sanitize_diagrams

Revision ID: 20260923_purge_test_sanitization
Revises: 20260922_deprecate_tables
Create Date: 2026-09-23 00:00:00.000000

"""
import json
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic (<= 32 characters).
revision: str = '20260923_purge_test_sanitization'
down_revision: Union[str, Sequence[str], None] = '20260922_deprecate_tables'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """
    Upgrades database data state by:
    1. Purging test strings ('testtttt...') from egovernment_checklists.
    2. Sanitizing anime and placeholder image URLs from all diagram columns and subsystem JSON stores.
    3. Purging corrupted test entries from DRBCP and stakeholder analysis tables.
    """
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = inspector.get_table_names()

    # ==========================================================
    # 1. PURGE TEST STRINGS FROM E-GOVERNMENT CHECKLISTS
    # ==========================================================
    if 'egovernment_checklists' in tables:
        # Sanitize equivalent_system_details when polluted with test strings
        bind.execute(sa.text("""
            UPDATE egovernment_checklists 
            SET equivalent_system_details = 'Integrated via Landbank Link.BizPortal for digital service fee collection' 
            WHERE equivalent_system_details ILIKE '%testtt%'
               OR equivalent_system_details ILIKE '%testttt%';
        """))

        bind.execute(sa.text("""
            UPDATE egovernment_checklists 
            SET url_or_system_name = NULL 
            WHERE url_or_system_name ILIKE '%testtt%'
               OR url_or_system_name ILIKE '%testttt%';
        """))

        bind.execute(sa.text("""
            UPDATE egovernment_checklists 
            SET equivalent_system_details = 'Not applicable (National Government Agency)' 
            WHERE equivalent_system_details ILIKE '%suc%' 
               OR equivalent_system_details ILIKE '%college%' 
               OR equivalent_system_details ILIKE '%polytechnic%';
        """))

    # ==========================================================
    # 2. PURGE ANIME & PLACEHOLDER ARTWORK FROM MASTER NARRATIVES
    # ==========================================================
    if 'master_narratives' in tables:
        cols = [c['name'] for c in inspector.get_columns('master_narratives')]

        # 2.1 Reset diagram columns containing syanart, boruto, naruto, or wallpaper test assets
        diagram_columns = [
            'org_chart_url',
            'existing_ict_org_url',
            'proposed_ict_org_url',
            'network_diagram_url',
            'fiber_backbone_url',
            'system_architecture_url',
            'site_development_plan_url',
            'process_flow_diagram_url',
            'conceptual_framework_url',
            'agency_logo_url',
            'cert_logo_url'
        ]

        for col in diagram_columns:
            if col in cols:
                bind.execute(sa.text(f"""
                    UPDATE master_narratives 
                    SET {col} = NULL 
                    WHERE {col} ILIKE '%syanart%' 
                       OR {col} ILIKE '%boruto%' 
                       OR {col} ILIKE '%naruto%' 
                       OR {col} ILIKE '%wallpaper%'
                       OR {col} ILIKE '%anime%';
                """))

        # 2.2 Sanitize subsystem_network_layouts_json
        if 'subsystem_network_layouts_json' in cols:
            rows = bind.execute(sa.text("SELECT issp_period, subsystem_network_layouts_json FROM master_narratives")).fetchall()
            for row in rows:
                period = row[0]
                raw_layouts = row[1]

                if isinstance(raw_layouts, str):
                    try:
                        layouts = json.loads(raw_layouts)
                    except Exception:
                        layouts = []
                elif isinstance(raw_layouts, list):
                    layouts = list(raw_layouts)
                else:
                    layouts = []

                modified = False
                clean_layouts = []

                for item in layouts:
                    if isinstance(item, dict):
                        url = str(item.get("diagram_url", "")).lower()
                        if any(k in url for k in ["syanart", "boruto", "naruto", "wallpaper", "anime"]):
                            modified = True
                            continue
                        clean_layouts.append(item)
                    elif isinstance(item, str):
                        if any(k in item.lower() for k in ["syanart", "boruto", "naruto", "wallpaper", "anime"]):
                            modified = True
                            continue
                        clean_layouts.append(item)

                if modified or raw_layouts != clean_layouts:
                    bind.execute(
                        sa.text("""
                            UPDATE master_narratives 
                            SET subsystem_network_layouts_json = :clean_json 
                            WHERE issp_period = :period
                        """),
                        {"clean_json": json.dumps(clean_layouts), "period": period}
                    )

        # 2.3 Sanitize text columns in master_narratives
        bind.execute(sa.text("""
            UPDATE master_narratives 
            SET drbcp_recovery_strategy_html = '<ol><li><strong>Off-site Backup Management:</strong> Daily encrypted database snapshots are transferred to a secure secondary facility located >30km away.</li><li><strong>Cloud Failover (GovCloud):</strong> Mission-critical public service, registry, and e-payment microservices are replicated in real time to DICT GovCloud.</li><li><strong>Redundancy:</strong> Dual-ISP providers configured in active-passive load distribution preventing single points of failure.</li><li><strong>Data Synchronization:</strong> Asynchronous database replication ensures an RPO limit of 1 hour during operational disruptions.</li></ol>'
            WHERE drbcp_recovery_strategy_html ILIKE '%testtt%' 
               OR drbcp_recovery_strategy_html ILIKE '%testttt%'
               OR drbcp_recovery_strategy_html IS NULL;
        """))

        bind.execute(sa.text("""
            UPDATE master_narratives 
            SET drbcp_sop_phases_html = '<p><strong>Phase I: Detection and Declaration:</strong> Automated monitoring alerts evaluate disaster scale; Incident Commander activates DRBCP within 1 hour if localized RTO cannot be maintained.</p><p><strong>Phase II: Activation and Execution:</strong> DRT redirected to GovCloud DR standby instance; DNS records updated; clean database backups verified and mounted.</p><p><strong>Phase III: Failback (Normal Operations):</strong> Primary data center infrastructure restored; synchronize transactional state delta from DR site during off-peak maintenance window.</p>'
            WHERE drbcp_sop_phases_html ILIKE '%testtt%' 
               OR drbcp_sop_phases_html ILIKE '%testttt%'
               OR drbcp_sop_phases_html IS NULL;
        """))

        bind.execute(sa.text("""
            UPDATE master_narratives 
            SET signatory_prepared_by = 'Chief Information Officer'
            WHERE signatory_prepared_by ILIKE '%testtt%' 
               OR signatory_prepared_by ILIKE '%testttt%'
               OR signatory_prepared_by IS NULL;
        """))

        bind.execute(sa.text("""
            UPDATE master_narratives 
            SET preparer_position = 'Director, ICT Management Office'
            WHERE preparer_position ILIKE '%testtt%' 
               OR preparer_position ILIKE '%testttt%'
               OR preparer_position IS NULL;
        """))

        bind.execute(sa.text("""
            UPDATE master_narratives 
            SET cio_organizational_unit = 'Management Information & Communications Technology Services'
            WHERE cio_organizational_unit ILIKE '%testtt%' 
               OR cio_organizational_unit ILIKE '%testttt%'
               OR cio_organizational_unit IS NULL;
        """))

        bind.execute(sa.text("""
            UPDATE master_narratives 
            SET signatory_approved_by = 'Head of Agency'
            WHERE signatory_approved_by ILIKE '%testtt%' 
               OR signatory_approved_by ILIKE '%testttt%'
               OR signatory_approved_by IS NULL;
        """))

        bind.execute(sa.text("""
            UPDATE master_narratives 
            SET agency_head_position = 'Head of Agency'
            WHERE agency_head_position ILIKE '%testtt%' 
               OR agency_head_position ILIKE '%testttt%'
               OR agency_head_position IS NULL;
        """))

    # ==========================================================
    # 3. PURGE TEST ROWS FROM DR TEAMS & STAKEHOLDERS
    # ==========================================================
    if 'dr_team_members' in tables:
        bind.execute(sa.text("""
            DELETE FROM dr_team_members 
            WHERE contact_person ILIKE '%testtt%' 
               OR responsibility ILIKE '%testtt%'
               OR contact_person ILIKE '%testttt%' 
               OR responsibility ILIKE '%testttt%';
        """))

    if 'stakeholder_analyses' in tables:
        bind.execute(sa.text("""
            DELETE FROM stakeholder_analyses 
            WHERE stakeholder_group ILIKE '%testtt%' 
               OR transaction_processed_incoming ILIKE '%testtt%'
               OR transaction_processed_outgoing ILIKE '%testtt%'
               OR stakeholder_group ILIKE '%testttt%';
        """))

    if 'dr_bia_summary' in tables:
        bind.execute(sa.text("""
            DELETE FROM dr_bia_summary 
            WHERE system_name ILIKE '%testtt%' 
               OR system_name ILIKE '%testttt%';
        """))

    if 'dr_kpi_metrics' in tables:
        bind.execute(sa.text("""
            DELETE FROM dr_kpi_metrics 
            WHERE indicator ILIKE '%testtt%' 
               OR target_metric ILIKE '%testtt%'
               OR indicator ILIKE '%testttt%';
        """))


def downgrade() -> None:
    """
    Sanitization and data hygiene operations do not restore
    corrupt test strings or placeholder artwork on downgrade.
    """
    pass