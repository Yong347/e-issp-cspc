# alembic/versions/20260918_purge_legacy_artifacts.py
"""purge_legacy_artifacts_and_sanitize_data

Revision ID: 20260918_purge_artifacts
Revises: 20260916_branding_audit
Create Date: 2026-09-18 10:00:00.000000

"""
import json
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic (<= 32 characters).
revision: str = '20260918_purge_artifacts'
down_revision: Union[str, Sequence[str], None] = '20260916_branding_audit'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """
    Purges residual academic artifacts, deduplicates cybersecurity controls/glossary terms,
    cleanses collegiate URLs, and removes template dummy BIA records across SQLite and PostgreSQL.
    """
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = inspector.get_table_names()

    # -------------------------------------------------------------
    # 1. Sanitize Information Systems URLs (Part II.C & III.D)
    # -------------------------------------------------------------
    if 'information_systems' in tables:
        bind.execute(sa.text("""
            UPDATE information_systems 
            SET online_url = REPLACE(online_url, 'cspc.edu.ph', 'agency.gov.ph')
            WHERE online_url ILIKE '%cspc.edu.ph%';
        """))

    # -------------------------------------------------------------
    # 2. Sanitize E-Government Programs Checklist URLs (Part II.D)
    # -------------------------------------------------------------
    if 'egovernment_checklists' in tables:
        bind.execute(sa.text("""
            UPDATE egovernment_checklists 
            SET url_or_system_name = REPLACE(url_or_system_name, 'cspc.edu.ph', 'agency.gov.ph')
            WHERE url_or_system_name ILIKE '%cspc.edu.ph%';
        """))
        bind.execute(sa.text("""
            UPDATE egovernment_checklists 
            SET equivalent_system_details = 'Not applicable (National Government Agency)'
            WHERE equivalent_system_details ILIKE '%suc%' 
               OR equivalent_system_details ILIKE '%college%'
               OR equivalent_system_details ILIKE '%polytechnic%';
        """))

    # -------------------------------------------------------------
    # 3. Deduplicate Cybersecurity Controls (Prevent Triplicate Checkboxes)
    # -------------------------------------------------------------
    if 'cybersecurity_controls' in tables:
        # Keep only the lowest primary key per unique domain/name combination
        bind.execute(sa.text("""
            DELETE FROM cybersecurity_controls
            WHERE id NOT IN (
                SELECT MIN(id)
                FROM cybersecurity_controls
                GROUP BY issp_period, is_proposed, control_domain, control_name
            );
        """))

    # -------------------------------------------------------------
    # 4. Deduplicate Glossary Terms (Prevent duplicate ISSP, RTO, RPO rows)
    # -------------------------------------------------------------
    if 'glossary_terms' in tables:
        # Remove standalone duplicate abbreviations if full statutory definitions exist
        bind.execute(sa.text("""
            DELETE FROM glossary_terms
            WHERE term IN ('ISSP', 'RTO', 'RPO')
              AND EXISTS (
                  SELECT 1 FROM glossary_terms g2 
                  WHERE g2.term ILIKE '%Strategic Plan%' 
                     OR g2.term ILIKE '%Recovery Time%' 
                     OR g2.term ILIKE '%Recovery Point%'
              );
        """))

        # Deduplicate any remaining duplicate term entries by lowest id
        bind.execute(sa.text("""
            DELETE FROM glossary_terms
            WHERE id NOT IN (
                SELECT MIN(id)
                FROM glossary_terms
                GROUP BY LOWER(TRIM(term))
            );
        """))

    # -------------------------------------------------------------
    # 5. Purge Dummy Template Sample Systems from Annex 2 BIA
    # -------------------------------------------------------------
    if 'dr_bia_summary' in tables:
        # Check if actual systems exist; if so, purge sample template entries from DICT PDF 3
        has_actual_systems = bind.execute(sa.text("""
            SELECT COUNT(*) FROM dr_bia_summary 
            WHERE system_name NOT IN (
                'Public Licensing Portal', 
                'Integrated HR & Payroll', 
                'Official Website', 
                'Document Tracking'
            );
        """)).scalar() or 0

        if has_actual_systems > 0:
            bind.execute(sa.text("""
                DELETE FROM dr_bia_summary 
                WHERE system_name IN (
                    'Public Licensing Portal', 
                    'Integrated HR & Payroll', 
                    'Official Website', 
                    'Document Tracking'
                );
            """))

    # -------------------------------------------------------------
    # 6. Purge Academic / Student Stakeholder Artifacts (Part I.C)
    # -------------------------------------------------------------
    if 'stakeholder_analyses' in tables:
        bind.execute(sa.text("""
            DELETE FROM stakeholder_analyses 
            WHERE stakeholder_group ILIKE '%student%' 
               OR stakeholder_group ILIKE '%faculty%'
               OR stakeholder_group ILIKE '%alumni%';
        """))

        # Ensure at least one standard government stakeholder group exists
        remaining_count = bind.execute(sa.text("SELECT COUNT(*) FROM stakeholder_analyses")).scalar() or 0
        if remaining_count == 0:
            bind.execute(sa.text("""
                INSERT INTO stakeholder_analyses (
                    issp_period, stakeholder_group, 
                    transaction_processed_incoming, complexity_incoming, 
                    transaction_processed_outgoing, complexity_outgoing
                ) VALUES (
                    '2026-2028',
                    'General Citizens and Service Applicants',
                    'Online Service Inquiries, Application Submissions, and Electronic Fee Settlement',
                    'Simple',
                    'Official E-Certificates, Regulatory Clearances, and Validated Service Statements',
                    'Simple'
                );
            """))

    # -------------------------------------------------------------
    # 7. Sanitize DRBCP Affected Assets JSON in Master Narrative
    # -------------------------------------------------------------
    if 'master_narratives' in tables:
        rows = bind.execute(sa.text("SELECT issp_period, drbcp_affected_assets_json FROM master_narratives")).fetchall()
        for row in rows:
            period = row[0]
            raw_assets = row[1]
            
            if isinstance(raw_assets, str):
                try:
                    assets_data = json.loads(raw_assets)
                except Exception:
                    assets_data = []
            elif isinstance(raw_assets, list):
                assets_data = list(raw_assets)
            else:
                assets_data = []

            modified = False
            sanitized_assets = []

            for asset in assets_data:
                if isinstance(asset, dict):
                    grp = str(asset.get("asset_group", "")).strip()
                    dtls = str(asset.get("details", "")).strip()
                    # Filter out test strings
                    if grp.lower().startswith("testtt"):
                        modified = True
                        continue
                    # Replace collegiate mentions
                    if "student" in dtls.lower() or "academic" in dtls.lower():
                        dtls = dtls.replace("Student Registries", "Citizen Registries")
                        dtls = dtls.replace("student registries", "citizen registries")
                        dtls = dtls.replace("academic archives", "institutional archives")
                        asset["details"] = dtls
                        modified = True
                    sanitized_assets.append(asset)
                elif isinstance(asset, str):
                    if asset.lower().startswith("testtt"):
                        modified = True
                        continue
                    clean_str = asset.replace("Student Registries", "Citizen Registries").replace("academic archives", "institutional archives")
                    if clean_str != asset:
                        modified = True
                    sanitized_assets.append(clean_str)

            if modified or len(sanitized_assets) == 0:
                if len(sanitized_assets) == 0:
                    sanitized_assets = [
                        {"asset_group": "Primary Data Center (Central Office)", "details": "10 Physical Enterprise Servers, 2 SAN Storage Units, Core Gigabit Distribution Switches."},
                        {"asset_group": "Connectivity", "details": "200Mbps Dedicated Leased Line Fiber; Redundant GovNet Optical Fiber Link."},
                        {"asset_group": "Data Assets", "details": "National Citizen Service Databases, Transactional Registries, 5TB of digitized institutional archives."},
                        {"asset_group": "Power Utilities", "details": "100kVA Automatic Standby Generator Set; 3 x 10kVA Online Double-Conversion Rackmount UPS Units."}
                    ]

                bind.execute(
                    sa.text("""
                        UPDATE master_narratives 
                        SET drbcp_affected_assets_json = :clean_json 
                        WHERE issp_period = :period
                    """),
                    {"clean_json": json.dumps(sanitized_assets), "period": period}
                )

        # Clear any test strings from recovery strategy and SOP phases
        bind.execute(sa.text("""
            UPDATE master_narratives 
            SET drbcp_recovery_strategy_html = '<ol><li><strong>Off-site Backup Management:</strong> Daily encrypted database snapshots are transferred to a secure secondary facility located >30km away.</li><li><strong>Cloud Failover (GovCloud):</strong> Mission-critical public service, registry, and e-payment microservices are replicated in real time to DICT GovCloud.</li><li><strong>Redundancy:</strong> Dual-ISP providers configured in active-passive load distribution preventing single points of failure.</li><li><strong>Data Synchronization:</strong> Asynchronous database replication ensures an RPO limit of 1 hour during operational disruptions.</li></ol>'
            WHERE drbcp_recovery_strategy_html ILIKE '%testtt%' OR drbcp_recovery_strategy_html IS NULL;
        """))

        bind.execute(sa.text("""
            UPDATE master_narratives 
            SET drbcp_sop_phases_html = '<p><strong>Phase I: Detection and Declaration:</strong> Automated monitoring alerts evaluate disaster scale; Incident Commander activates DRBCP within 1 hour if localized RTO cannot be maintained.</p><p><strong>Phase II: Activation and Execution:</strong> DRT redirected to GovCloud DR standby instance; DNS records updated; clean database backups verified and mounted.</p><p><strong>Phase III: Failback (Normal Operations):</strong> Primary data center infrastructure restored; synchronize transactional state delta from DR site during off-peak maintenance window.</p>'
            WHERE drbcp_sop_phases_html ILIKE '%testtt%' OR drbcp_sop_phases_html IS NULL;
        """))


def downgrade() -> None:
    """
    Data hygiene and artifact sanitization migrations do not re-introduce
    corrupt records or legacy collegiate URLs on rollback.
    """
    pass