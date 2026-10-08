"""full_singularity_dynamic

Revision ID: 20261001_dynamic
Revises: 20260922_deprecate_tables
Create Date: 2026-10-01 00:00:00.000000
"""
import json
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic (<= 32 characters).
revision: str = '20261001_dynamic'
down_revision: Union[str, Sequence[str], None] = '20260922_deprecate_tables'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade database schema to full dynamic capability."""
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = inspector.get_table_names()
    is_sqlite = bind.dialect.name == "sqlite"

    # ==========================================================
    # 1. CREATE NEW DYNAMIC MASTER TABLES
    # ==========================================================

    # 1.1 Table: strategic_categories
    if 'strategic_categories' not in tables:
        op.create_table(
            'strategic_categories',
            sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
            sa.Column('name', sa.String(length=100), nullable=False),
            sa.Column('code', sa.String(length=50), nullable=False),
            sa.Column('is_project_linked', sa.Boolean(), server_default='0', nullable=False),
            sa.Column('is_recurring_expense', sa.Boolean(), server_default='0', nullable=False),
            sa.Column('order_index', sa.Integer(), server_default='0', nullable=False),
            sa.Column('is_active', sa.Boolean(), server_default='1', nullable=False),
            sa.Column('description', sa.Text(), nullable=True),
            sa.PrimaryKeyConstraint('id', name='pk_strategic_categories'),
            sa.UniqueConstraint('name', name='uq_strategic_categories_name'),
            sa.UniqueConstraint('code', name='uq_strategic_categories_code')
        )
        op.create_index('ix_strategic_categories_code', 'strategic_categories', ['code'], unique=True)

    # 1.2 Table: uacs_catalog
    if 'uacs_catalog' not in tables:
        op.create_table(
            'uacs_catalog',
            sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
            sa.Column('uacs_code', sa.String(length=50), nullable=False),
            sa.Column('account_title', sa.String(length=200), nullable=False),
            sa.Column('expenditure_class', sa.String(length=100), server_default='Capital Outlay', nullable=False),
            sa.Column('is_subscription_default', sa.Boolean(), server_default='0', nullable=False),
            sa.Column('is_active', sa.Boolean(), server_default='1', nullable=False),
            sa.Column('description', sa.Text(), nullable=True),
            sa.PrimaryKeyConstraint('id', name='pk_uacs_catalog'),
            sa.UniqueConstraint('uacs_code', name='uq_uacs_catalog_uacs_code')
        )
        op.create_index('ix_uacs_catalog_uacs_code', 'uacs_catalog', ['uacs_code'], unique=True)

    # 1.3 Table: system_taxonomies
    if 'system_taxonomies' not in tables:
        op.create_table(
            'system_taxonomies',
            sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
            sa.Column('taxonomy_type', sa.String(length=50), nullable=False),
            sa.Column('code', sa.String(length=50), nullable=False),
            sa.Column('display_name', sa.String(length=200), nullable=False),
            sa.Column('description', sa.Text(), nullable=True),
            sa.Column('is_active', sa.Boolean(), server_default='1', nullable=False),
            sa.Column('order_index', sa.Integer(), server_default='0', nullable=False),
            sa.PrimaryKeyConstraint('id', name='pk_system_taxonomies'),
            sa.UniqueConstraint('taxonomy_type', 'code', name='uq_taxonomy_type_code')
        )
        op.create_index('ix_system_taxonomies_type', 'system_taxonomies', ['taxonomy_type'], unique=False)
        op.create_index('ix_system_taxonomies_code', 'system_taxonomies', ['code'], unique=False)

    # 1.4 Table: dynamic_checklist_criteria
    if 'dynamic_checklist_criteria' not in tables:
        op.create_table(
            'dynamic_checklist_criteria',
            sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
            sa.Column('checklist_type', sa.String(length=50), nullable=False),
            sa.Column('domain_or_category', sa.String(length=100), nullable=False),
            sa.Column('criteria_name', sa.String(length=200), nullable=False),
            sa.Column('is_mandatory', sa.Boolean(), server_default='1', nullable=False),
            sa.Column('national_portal_url', sa.String(length=255), nullable=True),
            sa.Column('description', sa.Text(), nullable=True),
            sa.Column('is_active', sa.Boolean(), server_default='1', nullable=False),
            sa.Column('order_index', sa.Integer(), server_default='0', nullable=False),
            sa.PrimaryKeyConstraint('id', name='pk_dynamic_checklist_criteria')
        )
        op.create_index('ix_dynamic_checklist_type', 'dynamic_checklist_criteria', ['checklist_type'], unique=False)

    # ==========================================================
    # 2. CONVERT POSTGRESQL NATIVE ENUMS TO VARCHAR(100)
    # ==========================================================
    if not is_sqlite:
        op.execute(sa.text("""
            DO $$
            BEGIN
                -- 1. issp_core.category
                IF EXISTS (
                    SELECT 1 FROM information_schema.columns 
                    WHERE table_name = 'issp_core' AND column_name = 'category' 
                      AND (data_type = 'USER-DEFINED' OR udt_name = 'proposalcategory')
                ) THEN
                    ALTER TABLE issp_core ALTER COLUMN category DROP DEFAULT;
                    ALTER TABLE issp_core ALTER COLUMN category TYPE VARCHAR(100) USING category::text;
                    ALTER TABLE issp_core ALTER COLUMN category SET DEFAULT 'Hardware';
                    DROP TYPE IF EXISTS proposalcategory CASCADE;
                END IF;

                -- 2. issp_core.status
                IF EXISTS (
                    SELECT 1 FROM information_schema.columns 
                    WHERE table_name = 'issp_core' AND column_name = 'status' 
                      AND (data_type = 'USER-DEFINED' OR udt_name = 'proposalstatus')
                ) THEN
                    ALTER TABLE issp_core ALTER COLUMN status DROP DEFAULT;
                    ALTER TABLE issp_core ALTER COLUMN status TYPE VARCHAR(100) USING status::text;
                    ALTER TABLE issp_core ALTER COLUMN status SET DEFAULT 'Draft';
                    DROP TYPE IF EXISTS proposalstatus CASCADE;
                END IF;

                -- 3. issp_core.strategic_category
                IF EXISTS (
                    SELECT 1 FROM information_schema.columns 
                    WHERE table_name = 'issp_core' AND column_name = 'strategic_category' 
                      AND (data_type = 'USER-DEFINED' OR udt_name = 'projectcategory')
                ) THEN
                    ALTER TABLE issp_core ALTER COLUMN strategic_category DROP DEFAULT;
                    ALTER TABLE issp_core ALTER COLUMN strategic_category TYPE VARCHAR(100) USING strategic_category::text;
                    ALTER TABLE issp_core ALTER COLUMN strategic_category SET DEFAULT 'Office Productivity';
                    DROP TYPE IF EXISTS projectcategory CASCADE;
                END IF;

                -- 4. existing_inventory.status
                IF EXISTS (
                    SELECT 1 FROM information_schema.columns 
                    WHERE table_name = 'existing_inventory' AND column_name = 'status' 
                      AND (data_type = 'USER-DEFINED' OR udt_name = 'assetstatus')
                ) THEN
                    ALTER TABLE existing_inventory ALTER COLUMN status DROP DEFAULT;
                    ALTER TABLE existing_inventory ALTER COLUMN status TYPE VARCHAR(100) USING status::text;
                    ALTER TABLE existing_inventory ALTER COLUMN status SET DEFAULT 'Functional';
                    DROP TYPE IF EXISTS assetstatus CASCADE;
                END IF;
            EXCEPTION WHEN OTHERS THEN
                NULL;
            END $$;
        """))

    # ==========================================================
    # 3. ALTER EXISTING TABLES
    # ==========================================================

    # 3.1 Update 'issp_core'
    if 'issp_core' in tables:
        core_cols = [c['name'] for c in inspector.get_columns('issp_core')]
        with op.batch_alter_table('issp_core', schema=None) as batch_op:
            if 'strategic_category_id' not in core_cols:
                batch_op.add_column(sa.Column('strategic_category_id', sa.Integer(), nullable=True))
                batch_op.create_index(batch_op.f('ix_issp_core_strategic_category_id'), ['strategic_category_id'], unique=False)
                batch_op.create_foreign_key(
                    'fk_issp_core_strategic_cat_id',
                    'strategic_categories',
                    ['strategic_category_id'],
                    ['id'],
                    ondelete='SET NULL'
                )

            if 'supplier_name' not in core_cols:
                batch_op.add_column(sa.Column('supplier_name', sa.String(length=200), nullable=True))

            if 'comments' not in core_cols:
                batch_op.add_column(sa.Column('comments', sa.JSON(), server_default='[]', nullable=False))

            if 'is_in_house_turnover' not in core_cols:
                batch_op.add_column(sa.Column('is_in_house_turnover', sa.Boolean(), server_default='0', nullable=False))

            if 'category' in core_cols and is_sqlite:
                batch_op.alter_column('category', existing_type=sa.String(), type_=sa.String(length=100))

            if 'status' in core_cols and is_sqlite:
                batch_op.alter_column('status', existing_type=sa.String(), type_=sa.String(length=100))

    # 3.2 Update 'information_systems'
    if 'information_systems' in tables:
        sys_cols = [c['name'] for c in inspector.get_columns('information_systems')]
        with op.batch_alter_table('information_systems', schema=None) as batch_op:
            if 'architecture_diagram_url' not in sys_cols:
                batch_op.add_column(sa.Column('architecture_diagram_url', sa.String(length=500), nullable=True))

    # 3.3 Update 'performance_metrics'
    if 'performance_metrics' in tables:
        pmf_cols = [c['name'] for c in inspector.get_columns('performance_metrics')]
        with op.batch_alter_table('performance_metrics', schema=None) as batch_op:
            if 'project_id' in pmf_cols:
                batch_op.alter_column('project_id', existing_type=sa.CHAR(length=36), nullable=True)

            if 'annual_targets' not in pmf_cols:
                batch_op.add_column(sa.Column('annual_targets', sa.JSON(), server_default='{}', nullable=False))

    # 3.4 Update 'existing_inventory'
    if 'existing_inventory' in tables:
        inv_cols = [c['name'] for c in inspector.get_columns('existing_inventory')]
        with op.batch_alter_table('existing_inventory', schema=None) as batch_op:
            if 'issp_period' not in inv_cols:
                batch_op.add_column(
                    sa.Column('issp_period', sa.String(length=50), server_default='2026-2028', nullable=False)
                )
                batch_op.create_index(batch_op.f('ix_existing_inventory_issp_period'), ['issp_period'], unique=False)
                batch_op.create_foreign_key(
                    'fk_existing_inventory_issp_period',
                    'master_narratives',
                    ['issp_period'],
                    ['issp_period'],
                    onupdate='CASCADE',
                    ondelete='CASCADE'
                )

            if 'replacement_proposal_id' not in inv_cols:
                batch_op.add_column(sa.Column('replacement_proposal_id', sa.CHAR(length=36), nullable=True))
                batch_op.create_index(
                    batch_op.f('ix_existing_inventory_replacement_proposal_id'),
                    ['replacement_proposal_id'],
                    unique=False
                )
                batch_op.create_foreign_key(
                    'fk_existing_inventory_replacement_proposal_id',
                    'issp_core',
                    ['replacement_proposal_id'],
                    ['id'],
                    ondelete='SET NULL'
                )

            if 'status' in inv_cols and is_sqlite:
                batch_op.alter_column('status', existing_type=sa.String(), type_=sa.String(length=100))

    # 3.5 Update 'needs_assessments'
    if 'needs_assessments' in tables:
        na_cols = [c['name'] for c in inspector.get_columns('needs_assessments')]
        with op.batch_alter_table('needs_assessments', schema=None) as batch_op:
            if 'issp_period' not in na_cols:
                batch_op.add_column(
                    sa.Column('issp_period', sa.String(length=50), server_default='2026-2028', nullable=False)
                )
                batch_op.create_index(batch_op.f('ix_needs_assessments_issp_period'), ['issp_period'], unique=False)
                batch_op.create_foreign_key(
                    'fk_needs_assessments_issp_period',
                    'master_narratives',
                    ['issp_period'],
                    ['issp_period'],
                    onupdate='CASCADE',
                    ondelete='CASCADE'
                )

    # 3.6 Update 'budget_ceilings'
    if 'budget_ceilings' in tables:
        bc_cols = [c['name'] for c in inspector.get_columns('budget_ceilings')]
        with op.batch_alter_table('budget_ceilings', schema=None) as batch_op:
            if 'annual_allocations' not in bc_cols:
                batch_op.add_column(
                    sa.Column('annual_allocations', sa.JSON(), server_default='{}', nullable=False)
                )

    # ==========================================================
    # 4. HISTORICAL DATA MIGRATIONS & BACKFILLS
    # ==========================================================

    # 4.1 Backfill issp_core.yearly_quantities from legacy year_1_qty..year_3_qty
    if 'issp_core' in tables:
        core_cols = [c['name'] for c in inspector.get_columns('issp_core')]
        select_fields = ["id", "issp_period", "yearly_quantities"]
        if "year_1_qty" in core_cols: select_fields.append("year_1_qty")
        if "year_2_qty" in core_cols: select_fields.append("year_2_qty")
        if "year_3_qty" in core_cols: select_fields.append("year_3_qty")
        if "created_by_students" in core_cols: select_fields.append("created_by_students")

        proposals = bind.execute(sa.text(f"SELECT {', '.join(select_fields)} FROM issp_core")).fetchall()
        for p in proposals:
            row_dict = dict(zip(select_fields, p))
            p_id = row_dict.get("id")
            period = row_dict.get("issp_period") or "2026-2028"
            raw_yq = row_dict.get("yearly_quantities")

            yq_map = {}
            if isinstance(raw_yq, str):
                try:
                    yq_map = json.loads(raw_yq)
                except Exception:
                    yq_map = {}
            elif isinstance(raw_yq, dict):
                yq_map = dict(raw_yq)

            # If empty or missing digits, backfill from legacy year quantities
            if not yq_map or not any(str(k).isdigit() for k in yq_map.keys()):
                start_yr = 2026
                if period and "-" in period:
                    try:
                        start_yr = int(period.split("-")[0])
                    except Exception:
                        start_yr = 2026

                y1 = row_dict.get("year_1_qty") or 0
                y2 = row_dict.get("year_2_qty") or 0
                y3 = row_dict.get("year_3_qty") or 0

                yq_map[str(start_yr)] = int(y1)
                yq_map[str(start_yr + 1)] = int(y2)
                yq_map[str(start_yr + 2)] = int(y3)

                bind.execute(
                    sa.text("UPDATE issp_core SET yearly_quantities = :data WHERE id = :id"),
                    {"data": json.dumps(yq_map), "id": str(p_id)}
                )

            # Sync is_in_house_turnover from created_by_students
            if "created_by_students" in row_dict:
                cbs = bool(row_dict.get("created_by_students"))
                bind.execute(
                    sa.text("UPDATE issp_core SET is_in_house_turnover = :cbs WHERE id = :id"),
                    {"cbs": cbs, "id": str(p_id)}
                )

    # 4.2 Backfill existing_inventory.issp_period from active master_narratives
    if 'existing_inventory' in tables:
        active_period = bind.execute(sa.text(
            "SELECT issp_period FROM master_narratives WHERE is_active = true LIMIT 1"
        )).scalar() or "2026-2028"

        bind.execute(
            sa.text("UPDATE existing_inventory SET issp_period = :p WHERE issp_period IS NULL OR issp_period = ''"),
            {"p": active_period}
        )

    # 4.3 Backfill needs_assessments.issp_period from active master_narratives
    if 'needs_assessments' in tables:
        active_period = bind.execute(sa.text(
            "SELECT issp_period FROM master_narratives WHERE is_active = true LIMIT 1"
        )).scalar() or "2026-2028"

        bind.execute(
            sa.text("UPDATE needs_assessments SET issp_period = :p WHERE issp_period IS NULL OR issp_period = ''"),
            {"p": active_period}
        )

    # 4.4 Migrate subsystem layouts from master_narratives into information_systems.architecture_diagram_url
    if 'master_narratives' in tables and 'information_systems' in tables:
        narrative_rows = bind.execute(sa.text("SELECT subsystem_network_layouts_json FROM master_narratives")).fetchall()
        for nrow in narrative_rows:
            raw_layouts = nrow[0]
            layouts = []
            if isinstance(raw_layouts, str):
                try:
                    layouts = json.loads(raw_layouts)
                except Exception:
                    layouts = []
            elif isinstance(raw_layouts, list):
                layouts = raw_layouts

            for item in layouts:
                if isinstance(item, dict):
                    sys_name = item.get("system_name", "").strip()
                    d_url = item.get("diagram_url", "").strip()
                    if sys_name and d_url:
                        bind.execute(
                            sa.text("""
                                UPDATE information_systems 
                                SET architecture_diagram_url = :url 
                                WHERE LOWER(TRIM(name)) = LOWER(:name) 
                                  AND (architecture_diagram_url IS NULL OR architecture_diagram_url = '')
                            """),
                            {"url": d_url, "name": sys_name}
                        )

    # ==========================================================
    # 5. SEED CANONICAL DICT v.2026 DATA & GOVERNANCE POLICIES
    # ==========================================================

    # 5.1 Seed Strategic Categories
    op.execute(sa.text("""
        INSERT INTO strategic_categories (name, code, is_project_linked, is_recurring_expense, order_index, is_active, description)
        VALUES 
            ('Office Productivity', 'OFFICE_PRODUCTIVITY', false, false, 1, true, 'Desktop workstations, administrative laptops, office peripherals, and personal productivity tools.'),
            ('Internal ICT Projects', 'INTERNAL_ICT_PROJECT', true, false, 2, true, 'Mission-critical internal ICT programs, containerization, portal modernization, and agency infrastructure.'),
            ('Cross-Agency ICT Projects', 'CROSS_AGENCY_ICT_PROJECT', true, false, 3, true, 'Multi-agency cooperative projects, National Single Window, and PeGIF API gateways.'),
            ('Continuing Costs/Expenses', 'CONTINUING_COSTS', false, true, 4, true, 'Recurring institutional operating subscriptions, GovCloud standby hosting, ISP bandwidth, and maintenance.')
        ON CONFLICT (code) DO UPDATE SET
            name = EXCLUDED.name,
            is_project_linked = EXCLUDED.is_project_linked,
            is_recurring_expense = EXCLUDED.is_recurring_expense,
            order_index = EXCLUDED.order_index;
    """))

    # Link existing proposals to strategic_category_id
    op.execute(sa.text("""
        UPDATE issp_core 
        SET strategic_category_id = (
            SELECT id FROM strategic_categories 
            WHERE strategic_categories.name = issp_core.strategic_category 
            LIMIT 1
        )
        WHERE strategic_category_id IS NULL;
    """))

    # 5.2 Seed UACS Catalog
    op.execute(sa.text("""
        INSERT INTO uacs_catalog (uacs_code, account_title, expenditure_class, is_subscription_default, is_active, description)
        VALUES 
            ('50604050 03', 'ICT Equipment (CO)', 'Capital Outlay', false, true, 'Capital Outlay ICT hardware units >= ₱50,000 threshold.'),
            ('50604050 07', 'Printing Equipment (CO)', 'Capital Outlay', false, true, 'Heavy-duty multi-function production printing units >= ₱50,000 threshold.'),
            ('50604070 01', 'ICT Software (Perpetual CO)', 'Capital Outlay', false, true, 'Perpetual commercial software licenses and internally developed systems.'),
            ('50203210 03', 'Semi-Expendable ICT Equipment (MOOE)', 'Maintenance and Other Operating Expenses', false, true, 'ICT equipment under the capitalization threshold (< ₱50,000).'),
            ('50203210 07', 'Semi-Expendable Printing Equipment (MOOE)', 'Maintenance and Other Operating Expenses', false, true, 'Office printers and scanners under the capitalization threshold (< ₱50,000).'),
            ('50299070 00', 'ICT Software Subscription (MOOE)', 'Maintenance and Other Operating Expenses', true, true, 'Mandatory recurring software licenses, SaaS subscriptions, and cloud services (ALWAYS MOOE).'),
            ('50202010 00', 'Training Expenses (MOOE)', 'Maintenance and Other Operating Expenses', false, true, 'ICT seminars, technical workshops, and certification programs (DICT Guidelines p. 24).'),
            ('50211030 00', 'Consulting/Outsourced Development (MOOE)', 'Maintenance and Other Operating Expenses', false, true, 'Technical consulting contractors, microservices engineering, and security penetration testing.')
        ON CONFLICT (uacs_code) DO UPDATE SET
            account_title = EXCLUDED.account_title,
            expenditure_class = EXCLUDED.expenditure_class,
            is_subscription_default = EXCLUDED.is_subscription_default;
    """))

    # 5.3 Seed System Policy Settings
    op.execute(sa.text("""
        INSERT INTO system_settings (key, value)
        VALUES 
            ('capitalization_threshold', '50000.00'),
            ('major_outlay_review_threshold', '2000000.00'),
            ('inflation_rates_by_year', '{"2026": 0.0, "2027": 3.0, "2028": 5.0}'),
            ('hardware_replacement_buffer_units', '3'),
            ('canvas_expiration_warning_days', '14')
        ON CONFLICT (key) DO NOTHING;
    """))

    # 5.4 Seed System Taxonomies
    op.execute(sa.text("""
        INSERT INTO system_taxonomies (taxonomy_type, code, display_name, order_index, is_active)
        VALUES 
            ('FUND_SOURCE', 'GAA', 'General Appropriations Act (GAA)', 1, true),
            ('FUND_SOURCE', 'FAP', 'Foreign-Assisted Projects (FAP)', 2, true),
            ('FUND_SOURCE', 'LOCALLY_FUNDED', 'Locally Funded', 3, true),
            ('FUND_SOURCE', 'OTHER_INCOME', 'Other Income Generating Sources', 4, true),
            ('DEPLOYMENT_LOCATION', 'CENTRAL_OFFICE', 'Central Office', 1, true),
            ('DEPLOYMENT_LOCATION', 'REGIONAL_OFFICE', 'Field/Regional Office', 2, true),
            ('ASSET_STATUS', 'FUNCTIONAL', 'Functional', 1, true),
            ('ASSET_STATUS', 'NEEDS_REPAIR', 'Needs Repair', 2, true),
            ('ASSET_STATUS', 'CONDEMNED', 'Condemned', 3, true)
        ON CONFLICT (taxonomy_type, code) DO NOTHING;
    """))

    # 5.5 Seed Dynamic Checklist Criteria
    op.execute(sa.text("""
        INSERT INTO dynamic_checklist_criteria (checklist_type, domain_or_category, criteria_name, is_mandatory, national_portal_url, is_active, order_index)
        VALUES 
            ('EGOV_PROGRAM', 'National E-Gov', 'eLGU', false, 'https://elgu.dict.gov.ph', true, 1),
            ('EGOV_PROGRAM', 'National E-Gov', 'eGovPay', true, 'https://egovpay.gov.ph', true, 2),
            ('EGOV_PROGRAM', 'National E-Gov', 'PNPKI', true, 'https://dict.gov.ph/pnpki', true, 3),
            ('EGOV_PROGRAM', 'National E-Gov', 'HCMIS', false, NULL, true, 4),
            ('EGOV_PROGRAM', 'National E-Gov', 'IFMIS', false, NULL, true, 5),
            ('EGOV_PROGRAM', 'National E-Gov', 'Online Public Service Portal', true, NULL, true, 6),
            ('EGOV_PROGRAM', 'National E-Gov', 'PhilGEPS', true, 'https://notices.philgeps.gov.ph', true, 7),
            ('EGOV_PROGRAM', 'National E-Gov', 'Records and Knowledge Management', true, NULL, true, 8),
            ('EGOV_PROGRAM', 'National E-Gov', 'Public Service Continuity Plan', true, NULL, true, 9),
            ('CYBERSECURITY', 'Physical Security', 'Perimeter Protection', true, NULL, true, 1),
            ('CYBERSECURITY', 'Physical Security', 'Access Control', true, NULL, true, 2),
            ('CYBERSECURITY', 'Physical Security', 'Surveillance System', true, NULL, true, 3),
            ('CYBERSECURITY', 'Physical Security', 'Detection System', false, NULL, true, 4),
            ('CYBERSECURITY', 'Perimeter Security', 'Next Generation Firewalls', true, NULL, true, 5),
            ('CYBERSECURITY', 'Perimeter Security', 'Intrusion Detection/Prevention Systems (IDS/IPS)', true, NULL, true, 6),
            ('CYBERSECURITY', 'Perimeter Security', 'Web Application Firewalls (WAFs)', true, NULL, true, 7),
            ('CYBERSECURITY', 'Perimeter Security', 'Demilitarized Zone (DMZ)', false, NULL, true, 8),
            ('CYBERSECURITY', 'Network Security', 'Data Encryption', true, NULL, true, 9),
            ('CYBERSECURITY', 'Network Security', 'Network Segmentation', false, NULL, true, 10),
            ('CYBERSECURITY', 'Endpoint Security', 'Anti-virus and Anti-malware Software', true, NULL, true, 11),
            ('CYBERSECURITY', 'Endpoint Security', 'Application Control', true, NULL, true, 12),
            ('CYBERSECURITY', 'Endpoint Security', 'BYOD Security', true, NULL, true, 13),
            ('CYBERSECURITY', 'Endpoint Security', 'Extended Detection and Response (XDR)', false, NULL, true, 14),
            ('CYBERSECURITY', 'Data Security', 'Data Classification', true, NULL, true, 15),
            ('CYBERSECURITY', 'Data Security', 'Data Loss Prevention (DLP)', true, NULL, true, 16),
            ('CYBERSECURITY', 'Data Security', 'Data Backups and Recovery', true, NULL, true, 17),
            ('CYBERSECURITY', 'Application Security', 'Regular Security Scanning and Testing', true, NULL, true, 18),
            ('CYBERSECURITY', 'Other Measures', 'Vulnerability Assessment', true, NULL, true, 19),
            ('CYBERSECURITY', 'Other Measures', 'Patch Management', true, NULL, true, 20),
            ('CYBERSECURITY', 'Other Measures', 'Strong Password Policies', true, NULL, true, 21),
            ('CYBERSECURITY', 'Other Measures', 'Multi-Factor Authentication (MFA)', true, NULL, true, 22),
            ('CYBERSECURITY', 'Other Measures', 'Access Reviews', true, NULL, true, 23),
            ('CYBERSECURITY', 'Other Measures', 'Security Logs', true, NULL, true, 24),
            ('CYBERSECURITY', 'Other Measures', 'Log Analysis', false, NULL, true, 25),
            ('CYBERSECURITY', 'Other Measures', 'Incident Response Plan', false, NULL, true, 26),
            ('CYBERSECURITY', 'Other Measures', 'Security Information and Event Management (SIEM)', false, NULL, true, 27),
            ('CYBERSECURITY', 'Other Measures', 'Penetration Testing', false, NULL, true, 28),
            ('CYBERSECURITY', 'Other Measures', 'Secure Software Development Life Cycle (SDLC)', false, NULL, true, 29)
        ON CONFLICT DO NOTHING;
    """))


def downgrade() -> None:
    """Downgrade schema cleanly back to 20260922_deprecate_tables."""
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = inspector.get_table_names()

    # 1. Rollback budget_ceilings
    if 'budget_ceilings' in tables:
        bc_cols = [c['name'] for c in inspector.get_columns('budget_ceilings')]
        with op.batch_alter_table('budget_ceilings', schema=None) as batch_op:
            if 'annual_allocations' in bc_cols:
                batch_op.drop_column('annual_allocations')

    # 2. Rollback needs_assessments
    if 'needs_assessments' in tables:
        na_cols = [c['name'] for c in inspector.get_columns('needs_assessments')]
        with op.batch_alter_table('needs_assessments', schema=None) as batch_op:
            if 'issp_period' in na_cols:
                batch_op.drop_constraint('fk_needs_assessments_issp_period', type_='foreignkey')
                batch_op.drop_index(batch_op.f('ix_needs_assessments_issp_period'))
                batch_op.drop_column('issp_period')

    # 3. Rollback existing_inventory
    if 'existing_inventory' in tables:
        inv_cols = [c['name'] for c in inspector.get_columns('existing_inventory')]
        with op.batch_alter_table('existing_inventory', schema=None) as batch_op:
            if 'replacement_proposal_id' in inv_cols:
                batch_op.drop_constraint('fk_existing_inventory_replacement_proposal_id', type_='foreignkey')
                batch_op.drop_index(batch_op.f('ix_existing_inventory_replacement_proposal_id'))
                batch_op.drop_column('replacement_proposal_id')
            if 'issp_period' in inv_cols:
                batch_op.drop_constraint('fk_existing_inventory_issp_period', type_='foreignkey')
                batch_op.drop_index(batch_op.f('ix_existing_inventory_issp_period'))
                batch_op.drop_column('issp_period')

    # 4. Rollback performance_metrics
    if 'performance_metrics' in tables:
        pmf_cols = [c['name'] for c in inspector.get_columns('performance_metrics')]
        with op.batch_alter_table('performance_metrics', schema=None) as batch_op:
            if 'annual_targets' in pmf_cols:
                batch_op.drop_column('annual_targets')

    # 5. Rollback information_systems
    if 'information_systems' in tables:
        sys_cols = [c['name'] for c in inspector.get_columns('information_systems')]
        with op.batch_alter_table('information_systems', schema=None) as batch_op:
            if 'architecture_diagram_url' in sys_cols:
                batch_op.drop_column('architecture_diagram_url')

    # 6. Rollback issp_core
    if 'issp_core' in tables:
        core_cols = [c['name'] for c in inspector.get_columns('issp_core')]
        with op.batch_alter_table('issp_core', schema=None) as batch_op:
            if 'is_in_house_turnover' in core_cols:
                batch_op.drop_column('is_in_house_turnover')
            if 'comments' in core_cols:
                batch_op.drop_column('comments')
            if 'supplier_name' in core_cols:
                batch_op.drop_column('supplier_name')
            if 'strategic_category_id' in core_cols:
                batch_op.drop_constraint('fk_issp_core_strategic_cat_id', type_='foreignkey')
                batch_op.drop_index(batch_op.f('ix_issp_core_strategic_category_id'))
                batch_op.drop_column('strategic_category_id')

    # 7. Drop newly created tables in reverse dependency order
    if 'dynamic_checklist_criteria' in tables:
        op.drop_table('dynamic_checklist_criteria')
    if 'system_taxonomies' in tables:
        op.drop_table('system_taxonomies')
    if 'uacs_catalog' in tables:
        op.drop_table('uacs_catalog')
    if 'strategic_categories' in tables:
        op.drop_table('strategic_categories')