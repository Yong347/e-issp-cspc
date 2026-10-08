# alembic/versions/20260921_purge_test_artifacts.py
"""purge_test_artifacts_and_sanitize_issps

Revision ID: 20260921_purge_test
Revises: 20260918_purge_artifacts
Create Date: 2026-09-21 17:30:00.000000

"""
import json
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

# Revision identifiers, used by Alembic (<= 32 characters)
revision: str = '20260921_purge_test'
down_revision: Union[str, Sequence[str], None] = '20260918_purge_artifacts'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    tables = inspector.get_table_names()

    # -------------------------------------------------------------
    # 1. PURGE TEST STRINGS & HARMONIZE MASTER NARRATIVE COVERSHEET
    # -------------------------------------------------------------
    if 'master_narratives' in tables:
        # 1.1 Overwrite signatories, agency metadata, and statutory text
        conn.execute(sa.text("""
            UPDATE master_narratives 
            SET agency_name = 'CAMARINES SUR POLYTECHNIC COLLEGES',
                agency_website_url = 'https://www.cspc.edu.ph',
                signatory_prepared_by = 'Engr. Juan Dela Cruz, PECE',
                preparer_position = 'Director, ICT Management Office',
                cio_organizational_unit = 'Management Information & Communications Technology Services',
                preparer_email = 'cio@cspc.edu.ph',
                preparer_tel = '(054) 288-2122',
                focal_name = 'Engr. Alex V. Santos',
                focal_position = 'Head, Network and Systems Administration',
                focal_organizational_unit = 'MICT Services',
                focal_email = 'focal@cspc.edu.ph',
                focal_contact_no = '(054) 288-2122',
                signatory_approved_by = 'DR. CHARLITO P. CADAG',
                agency_head_position = 'College President',
                drbcp_approval_date = 'March 15, 2026',
                mandate_html = 'Republic Act No. 9202 and enabling statutory charter mandated to provide advanced education, higher technological, professional instruction, and training in the fields of technology, applied sciences, and governance.',
                functions = 'Deliver quality public tertiary and technological education, execute applied research and extension services, manage digital infrastructure, and maintain regulatory compliance with national standards.',
                vision_html = 'A premier polytechnic and digital institution delivering world-class education, innovation, and accountable governance.',
                mission_html = 'To provide accessible, high-quality technological education, foster innovation, and deliver digital public services for national socio-economic transformation.',
                drbcp_recovery_strategy_html = '<ol><li><strong>Off-site Backup Management:</strong> Daily encrypted database snapshots are transferred to a secure secondary facility located >30km away.</li><li><strong>Cloud Failover (GovCloud):</strong> Mission-critical public service, registry, and e-payment microservices are replicated in real time to DICT GovCloud.</li><li><strong>Redundancy:</strong> Dual-ISP providers configured in active-passive load distribution preventing single points of failure.</li><li><strong>Data Synchronization:</strong> Asynchronous database replication ensures an RPO limit of 1 hour during operational disruptions.</li></ol>',
                drbcp_sop_phases_html = '<p><strong>Phase I: Detection and Declaration:</strong> Automated monitoring alerts evaluate disaster scale; Incident Commander activates DRBCP within 1 hour if localized RTO cannot be maintained.</p><p><strong>Phase II: Activation and Execution:</strong> DRT redirected to GovCloud DR standby instance; DNS records updated; clean database backups verified and mounted.</p><p><strong>Phase III: Failback (Normal Operations):</strong> Primary data center infrastructure restored; synchronize transactional state delta from DR site during off-peak maintenance window.</p>',
                drbcp_compliance_narrative_html = '<ul style="font-size: 8.5pt; line-height: 1.6; margin-bottom: 10px;"><li><strong>Cybersecurity Integration:</strong> Formal cyber-recovery procedures isolate compromised clusters and restore clean backups following ransomware or data-tampering events.</li><li><strong>Testing and Maintenance:</strong> Mandates at least one (1) full-scale DR simulation exercise per calendar year and semi-annual tabletop walkthroughs.</li><li><strong>Audit and Review:</strong> The DRBCP is formally reviewed annually or whenever a major infrastructure migration occurs.</li><li><strong>UACS and Budgeting:</strong> Funding for off-site storage, GovCloud mirror subscriptions, and standby infrastructure is categorized under Continuing Costs in Part IV of the ISSP.</li></ul>'
            WHERE issp_period = '2026-2028';
        """))

        # 1.2 Strip anime/placeholder images so publication-grade vector SVGs render cleanly
        conn.execute(sa.text("""
            UPDATE master_narratives 
            SET org_chart_url = NULL
            WHERE org_chart_url ILIKE '%syanart%' 
               OR org_chart_url ILIKE '%boruto%' 
               OR org_chart_url ILIKE '%naruto%'
               OR org_chart_url ILIKE '%wallpaper%';

            UPDATE master_narratives 
            SET network_diagram_url = NULL
            WHERE network_diagram_url ILIKE '%syanart%' 
               OR network_diagram_url ILIKE '%boruto%' 
               OR network_diagram_url ILIKE '%naruto%'
               OR network_diagram_url ILIKE '%wallpaper%';

            UPDATE master_narratives 
            SET fiber_backbone_url = NULL
            WHERE fiber_backbone_url ILIKE '%syanart%' 
               OR fiber_backbone_url ILIKE '%boruto%' 
               OR fiber_backbone_url ILIKE '%naruto%'
               OR fiber_backbone_url ILIKE '%wallpaper%';

            UPDATE master_narratives 
            SET system_architecture_url = NULL
            WHERE system_architecture_url ILIKE '%syanart%' 
               OR system_architecture_url ILIKE '%boruto%' 
               OR system_architecture_url ILIKE '%naruto%'
               OR system_architecture_url ILIKE '%wallpaper%';

            UPDATE master_narratives 
            SET proposed_ict_org_url = NULL
            WHERE proposed_ict_org_url ILIKE '%syanart%' 
               OR proposed_ict_org_url ILIKE '%boruto%' 
               OR proposed_ict_org_url ILIKE '%naruto%'
               OR proposed_ict_org_url ILIKE '%wallpaper%';
        """))

        # 1.3 Update DRBCP Affected Assets JSON cleanly across both SQLite and PostgreSQL
        clean_affected_assets = [
            {"asset_group": "Primary Data Center (Central Office)", "details": "10 Physical Enterprise Servers, 2 SAN Storage Units, Core Gigabit Distribution Switches."},
            {"asset_group": "Connectivity", "details": "200Mbps Dedicated Leased Line Fiber; Redundant GovNet Optical Fiber Link."},
            {"asset_group": "Data Assets", "details": "National Citizen Service Databases, Transactional Registries, 5TB of digitized institutional archives."},
            {"asset_group": "Power Utilities", "details": "100kVA Automatic Standby Generator Set; 3 x 10kVA Online Double-Conversion Rackmount UPS Units."}
        ]

        master_narratives_table = sa.table(
            'master_narratives',
            sa.column('issp_period', sa.String),
            sa.column('drbcp_affected_assets_json', sa.JSON)
        )
        conn.execute(
            master_narratives_table.update()
            .where(master_narratives_table.c.issp_period == '2026-2028')
            .values(drbcp_affected_assets_json=clean_affected_assets)
        )

    # -------------------------------------------------------------
    # 2. SEED COMPLETE 3-TIER STAKEHOLDER ANALYSIS (PART I.C)
    # -------------------------------------------------------------
    if 'stakeholder_analyses' in tables:
        # Clear legacy single-row or corrupted stakeholder entries
        conn.execute(sa.text("DELETE FROM stakeholder_analyses WHERE issp_period = '2026-2028';"))

        stakeholders_table = sa.table(
            'stakeholder_analyses',
            sa.column('issp_period', sa.String),
            sa.column('stakeholder_group', sa.String),
            sa.column('transaction_processed_incoming', sa.Text),
            sa.column('complexity_incoming', sa.String),
            sa.column('transaction_processed_outgoing', sa.Text),
            sa.column('complexity_outgoing', sa.String)
        )

        conn.execute(
            stakeholders_table.insert(),
            [
                {
                    'issp_period': '2026-2028',
                    'stakeholder_group': 'General Citizens, Students & Service Applicants',
                    'transaction_processed_incoming': 'Online service inquiries, enrollment applications, and electronic fee settlement',
                    'complexity_incoming': 'Simple',
                    'transaction_processed_outgoing': 'Official E-Certificates, grades, regulatory clearances, and billing statements',
                    'complexity_outgoing': 'Simple'
                },
                {
                    'issp_period': '2026-2028',
                    'stakeholder_group': 'Institutional Faculty, Planners & Department Directors',
                    'transaction_processed_incoming': 'Budget allotment requests, curriculum syllabi, activity proposals, and leave clearances',
                    'complexity_incoming': 'Complex',
                    'transaction_processed_outgoing': 'Disbursement vouchers, approved PRs, compliance endorsements, and performance scorecards',
                    'complexity_outgoing': 'Simple'
                },
                {
                    'issp_period': '2026-2028',
                    'stakeholder_group': 'National Oversight & Regulatory Agencies (DICT, DBM, CHED, COA)',
                    'transaction_processed_incoming': 'Statutory compliance circulars, mandate benchmarks, audit inquiries, and MITHI surveys',
                    'complexity_incoming': 'Highly Technical',
                    'transaction_processed_outgoing': 'Completed ISSP documentation, UACS audit ledgers, PREXC accomplishment reports',
                    'complexity_outgoing': 'Highly Technical'
                }
            ]
        )

    # -------------------------------------------------------------
    # 3. PURGE DUMMY SAMPLE SYSTEMS FROM ANNEX 2 BIA TABLE
    # -------------------------------------------------------------
    if 'dr_bia_summary' in tables:
        conn.execute(sa.text("""
            DELETE FROM dr_bia_summary 
            WHERE system_name IN (
                'Public Licensing Portal', 
                'Integrated HR & Payroll', 
                'Official Website', 
                'Document Tracking'
            );
        """))

    # -------------------------------------------------------------
    # 4. HARMONIZE SYSTEM URLS & DETAILS ACROSS MODULES
    # -------------------------------------------------------------
    if 'information_systems' in tables:
        conn.execute(sa.text("""
            UPDATE information_systems 
            SET online_url = REPLACE(online_url, 'agency.gov.ph', 'cspc.edu.ph')
            WHERE online_url ILIKE '%agency.gov.ph%';
        """))

    if 'egovernment_checklists' in tables:
        conn.execute(sa.text("""
            UPDATE egovernment_checklists 
            SET url_or_system_name = REPLACE(url_or_system_name, 'agency.gov.ph', 'cspc.edu.ph')
            WHERE url_or_system_name ILIKE '%agency.gov.ph%';
        """))


def downgrade() -> None:
    """
    Data hygiene and artifact purging operations do not re-introduce
    dummy strings or broken anime URLs during rollback.
    """
    pass