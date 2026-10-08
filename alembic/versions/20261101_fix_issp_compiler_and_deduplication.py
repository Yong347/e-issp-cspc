# alembic/versions/20261101_fix_issp_compiler_and_deduplication.py
"""fix_issp_compiler_and_deduplication

Revision ID: 20261101_fix_compiler
Revises: 63a8683b99e1
Create Date: 2026-11-01 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic (<= 32 characters).
revision: str = '20261101_fix_compiler'
down_revision: Union[str, Sequence[str], None] = '63a8683b99e1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """
    Executes database hygiene, deduplication, and schema consistency corrections:
    1. Deduplicates 'egovernment_checklists' so duplicate programs (e.g. multiple eGovPay,
       Online Portals) are purged, standardizing on the canonical 9 DICT checklist items.
    2. Purges dummy, anime, and test diagram URLs (e.g. Boruto/Naruto wallpapers, syanart)
       from 'master_narratives' and 'network_infrastructures'.
    3. Normalizes 'master_narratives.scope_choice' casing and format to guarantee
       that cover page checkboxes render accurately ([X] Department-Wide).
    4. Harmonizes 'issp_core' proposals ledger:
       - Capitalizes and standardizes proposal status strings ('Submitted', 'Approved', 'Draft', 'Returned').
       - Fills missing 'expenditure_class' values based on UACS object codes or capitalization thresholds,
         resolving the bug where items disappeared from Part IV.A tables and mismatched Table B.1 math.
       - Ensures 'is_in_house_turnover' and 'created_by_students' boolean defaults are non-null.
    5. Cleanses placeholder strings ('testtt', 'None', 'dummy') from narrative fields.
    """
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = inspector.get_table_names()

    # =========================================================================
    # 1. DEDUPLICATE & NORMALIZE E-GOVERNMENT PROGRAMS (PART II.D)
    # =========================================================================
    if 'egovernment_checklists' in tables:
        # Standardize canonical program naming conventions before deduplication
        bind.execute(sa.text("""
            UPDATE egovernment_checklists
            SET program_name = 'eGovPay'
            WHERE LOWER(TRIM(program_name)) IN ('egovpay', 'e-govpay', 'egov pay');
        """))

        bind.execute(sa.text("""
            UPDATE egovernment_checklists
            SET program_name = 'Online Public Service Portal'
            WHERE LOWER(TRIM(program_name)) IN ('online public service portal', 'public service portal', 'portal');
        """))

        bind.execute(sa.text("""
            UPDATE egovernment_checklists
            SET program_name = 'PNPKI'
            WHERE LOWER(TRIM(program_name)) IN ('pnpki', 'philippine national public key infrastructure');
        """))

        bind.execute(sa.text("""
            UPDATE egovernment_checklists
            SET program_name = 'eLGU'
            WHERE LOWER(TRIM(program_name)) IN ('elgu', 'e-lgu');
        """))

        bind.execute(sa.text("""
            UPDATE egovernment_checklists
            SET program_name = 'HCMIS'
            WHERE LOWER(TRIM(program_name)) IN ('hcmis', 'human capital management information system');
        """))

        bind.execute(sa.text("""
            UPDATE egovernment_checklists
            SET program_name = 'IFMIS'
            WHERE LOWER(TRIM(program_name)) IN ('ifmis', 'integrated financial management information system');
        """))

        bind.execute(sa.text("""
            UPDATE egovernment_checklists
            SET program_name = 'PhilGEPS'
            WHERE LOWER(TRIM(program_name)) IN ('philgeps', 'philippine government electronic procurement system');
        """))

        bind.execute(sa.text("""
            UPDATE egovernment_checklists
            SET program_name = 'Records and Knowledge Management'
            WHERE LOWER(TRIM(program_name)) IN ('records and knowledge management', 'records & knowledge management', 'records management');
        """))

        bind.execute(sa.text("""
            UPDATE egovernment_checklists
            SET program_name = 'Public Service Continuity Plan'
            WHERE LOWER(TRIM(program_name)) IN ('public service continuity plan', 'pscp', 'public service continuity plan (pscp)');
        """))

        # Universally deduplicate by issp_period and program_name across PostgreSQL and SQLite
        bind.execute(sa.text("""
            DELETE FROM egovernment_checklists
            WHERE id NOT IN (
                SELECT MIN(id)
                FROM egovernment_checklists
                GROUP BY issp_period, LOWER(TRIM(program_name))
            );
        """))

    # =========================================================================
    # 2. PURGE ANIME, DUMMY & PLACEHOLDER IMAGES FROM MASTER SCHEMATICS
    # =========================================================================
    if 'master_narratives' in tables:
        narrative_cols = [c['name'] for c in inspector.get_columns('master_narratives')]
        image_columns = [
            'network_diagram_url',
            'fiber_backbone_url',
            'system_architecture_url',
            'site_development_plan_url',
            'process_flow_diagram_url',
            'existing_ict_org_url',
            'proposed_ict_org_url',
            'agency_logo_url',
            'dict_logo_url',
            'bagong_pilipinas_logo_url'
        ]

        active_img_cols = [col for col in image_columns if col in narrative_cols]

        for col in active_img_cols:
            bind.execute(sa.text(f"""
                UPDATE master_narratives
                SET {col} = NULL
                WHERE {col} IS NOT NULL
                  AND (
                    LOWER({col}) LIKE '%syanart%'
                    OR LOWER({col}) LIKE '%boruto%'
                    OR LOWER({col}) LIKE '%naruto%'
                    OR LOWER({col}) LIKE '%wallpaper%'
                    OR LOWER({col}) LIKE '%anime%'
                    OR LOWER({col}) LIKE '%test%'
                    OR LOWER({col}) LIKE '%dummy%'
                    OR LOWER({col}) LIKE '%placeholder%'
                  );
            """))

    if 'network_infrastructures' in tables:
        net_cols = [c['name'] for c in inspector.get_columns('network_infrastructures')]
        if 'diagram_url' in net_cols:
            bind.execute(sa.text("""
                UPDATE network_infrastructures
                SET diagram_url = NULL
                WHERE diagram_url IS NOT NULL
                  AND (
                    LOWER(diagram_url) LIKE '%syanart%'
                    OR LOWER(diagram_url) LIKE '%boruto%'
                    OR LOWER(diagram_url) LIKE '%naruto%'
                    OR LOWER(diagram_url) LIKE '%wallpaper%'
                    OR LOWER(diagram_url) LIKE '%anime%'
                    OR LOWER(diagram_url) LIKE '%test%'
                    OR LOWER(diagram_url) LIKE '%dummy%'
                  );
            """))

    # =========================================================================
    # 3. NORMALIZE MASTER NARRATIVES COVER SCOPE CHOICES & PLACEHOLDER TEXT
    # =========================================================================
    if 'master_narratives' in tables:
        # Standardize scope_choice casing so cover page template matches [X] Department-Wide
        bind.execute(sa.text("""
            UPDATE master_narratives
            SET scope_choice = 'Department-Wide'
            WHERE scope_choice IS NULL 
               OR scope_choice = '' 
               OR LOWER(TRIM(scope_choice)) IN ('department_wide', 'department-wide', 'department wide', 'department');
        """))

        bind.execute(sa.text("""
            UPDATE master_narratives
            SET scope_choice = 'Agency-Wide'
            WHERE LOWER(TRIM(scope_choice)) IN ('agency_wide', 'agency-wide', 'agency wide', 'agency');
        """))

        bind.execute(sa.text("""
            UPDATE master_narratives
            SET scope_choice = 'LGU'
            WHERE LOWER(TRIM(scope_choice)) IN ('lgu', 'local government unit');
        """))

        bind.execute(sa.text("""
            UPDATE master_narratives
            SET scope_choice = 'Other Government Entity'
            WHERE LOWER(TRIM(scope_choice)) IN ('other government entity', 'other_government_entity', 'other');
        """))

        # Cleanse residual test text from narrative columns
        bind.execute(sa.text("""
            UPDATE master_narratives
            SET drbcp_recovery_strategy_text = '1. Off-site Backup Management: Daily encrypted database snapshots are transferred to a secure secondary facility located >30km away.
2. Cloud Failover (GovCloud): Mission-critical public service, registry, and e-payment microservices are replicated in real time to DICT GovCloud.
3. Redundancy: Dual-ISP providers configured in active-passive load distribution preventing single points of failure.
4. Data Synchronization: Asynchronous database replication ensures an RPO limit of 1 hour during operational disruptions.'
            WHERE drbcp_recovery_strategy_text IS NULL 
               OR LOWER(drbcp_recovery_strategy_text) LIKE '%testtt%';
        """))

        bind.execute(sa.text("""
            UPDATE master_narratives
            SET drbcp_sop_phases_text = 'Phase I: Detection and Declaration: Automated monitoring alerts evaluate disaster scale; Incident Commander activates DRBCP within 1 hour if localized RTO cannot be maintained.
Phase II: Activation and Execution: DRT redirected to GovCloud DR standby instance; DNS records updated; clean database backups verified and mounted.
Phase III: Failback (Normal Operations): Primary data center infrastructure restored; synchronize transactional state delta from DR site during off-peak maintenance window.'
            WHERE drbcp_sop_phases_text IS NULL 
               OR LOWER(drbcp_sop_phases_text) LIKE '%testtt%';
        """))

    # =========================================================================
    # 4. STANDARDIZE PROPOSALS LEDGER (FIX PART IV.A MATH & MISSING ITEMS)
    # =========================================================================
    if 'issp_core' in tables:
        # 4.1 Normalize Proposal Status Strings
        bind.execute(sa.text("""
            UPDATE issp_core SET status = 'Submitted' WHERE LOWER(TRIM(status)) = 'submitted';
            UPDATE issp_core SET status = 'Approved' WHERE LOWER(TRIM(status)) = 'approved';
            UPDATE issp_core SET status = 'Draft' WHERE LOWER(TRIM(status)) = 'draft';
            UPDATE issp_core SET status = 'Returned' WHERE LOWER(TRIM(status)) = 'returned';
        """))

        # 4.2 Standardize Category Strings
        bind.execute(sa.text("""
            UPDATE issp_core SET category = 'Hardware' WHERE LOWER(TRIM(category)) IN ('hardware', 'equipment');
            UPDATE issp_core SET category = 'Software' WHERE LOWER(TRIM(category)) = 'software';
            UPDATE issp_core SET category = 'Subscription' WHERE LOWER(TRIM(category)) IN ('subscription', 'cloud');
            UPDATE issp_core SET category = 'Services' WHERE LOWER(TRIM(category)) IN ('services', 'service', 'consulting');
        """))

        # 4.3 Ensure Strategic Category has valid default
        bind.execute(sa.text("""
            UPDATE issp_core 
            SET strategic_category = 'Office Productivity' 
            WHERE strategic_category IS NULL OR TRIM(strategic_category) = '';
        """))

        # 4.4 Populate Missing or Blank Expenditure Class (Fixes missing item rows in Part IV.A)
        # Rule: Subscriptions are ALWAYS MOOE
        bind.execute(sa.text("""
            UPDATE issp_core
            SET expenditure_class = 'Maintenance and Other Operating Expenses'
            WHERE LOWER(TRIM(category)) = 'subscription'
               OR LOWER(item_name) LIKE '%subscription%'
               OR LOWER(item_name) LIKE '%cloud license%';
        """))

        # Rule: Explicit UACS matching
        bind.execute(sa.text("""
            UPDATE issp_core
            SET expenditure_class = 'Capital Outlay'
            WHERE (expenditure_class IS NULL OR TRIM(expenditure_class) = '')
              AND (uacs_object_code LIKE '%(CO)%' OR uacs_object_code LIKE '506%');
        """))

        bind.execute(sa.text("""
            UPDATE issp_core
            SET expenditure_class = 'Maintenance and Other Operating Expenses'
            WHERE (expenditure_class IS NULL OR TRIM(expenditure_class) = '')
              AND (uacs_object_code LIKE '%(MOOE)%' OR uacs_object_code LIKE '502%');
        """))

        # Rule: Capitalization threshold fallback (50,000 threshold)
        bind.execute(sa.text("""
            UPDATE issp_core
            SET expenditure_class = CASE 
                WHEN unit_cost >= 50000.00 THEN 'Capital Outlay'
                ELSE 'Maintenance and Other Operating Expenses'
            END
            WHERE expenditure_class IS NULL OR TRIM(expenditure_class) = '';
        """))

        # 4.5 Standardize Default UACS Object Code where missing
        bind.execute(sa.text("""
            UPDATE issp_core
            SET uacs_object_code = '50604050 03 - ICT Equipment (CO)'
            WHERE (uacs_object_code IS NULL OR TRIM(uacs_object_code) = '')
              AND expenditure_class = 'Capital Outlay'
              AND LOWER(TRIM(category)) = 'hardware';
        """))

        bind.execute(sa.text("""
            UPDATE issp_core
            SET uacs_object_code = '50203210 03 - Semi-Expendable ICT Equipment (MOOE)'
            WHERE (uacs_object_code IS NULL OR TRIM(uacs_object_code) = '')
              AND expenditure_class = 'Maintenance and Other Operating Expenses'
              AND LOWER(TRIM(category)) = 'hardware';
        """))

        bind.execute(sa.text("""
            UPDATE issp_core
            SET uacs_object_code = '50299070 00 - ICT Software Subscription (MOOE)'
            WHERE (uacs_object_code IS NULL OR TRIM(uacs_object_code) = '')
              AND LOWER(TRIM(category)) = 'subscription';
        """))

        # 4.6 Synchronize Turnover Flags
        bind.execute(sa.text("""
            UPDATE issp_core
            SET is_in_house_turnover = COALESCE(created_by_students, false)
            WHERE is_in_house_turnover IS NULL;
        """))

        bind.execute(sa.text("""
            UPDATE issp_core
            SET created_by_students = COALESCE(is_in_house_turnover, false)
            WHERE created_by_students IS NULL;
        """))

    # =========================================================================
    # 5. CLEAN UP DUPLICATE / DUMMY BIA TEST RECORDS
    # =========================================================================
    if 'dr_bia_summary' in tables:
        bind.execute(sa.text("""
            DELETE FROM dr_bia_summary
            WHERE system_name IS NULL
               OR LOWER(TRIM(system_name)) LIKE '%testtt%'
               OR LOWER(TRIM(system_name)) LIKE '%dummy%';
        """))


def downgrade() -> None:
    """
    Data cleansing, image de-linking, and deduplication migrations do not
    re-introduce corrupted or duplicate records upon rollback.
    """
    pass