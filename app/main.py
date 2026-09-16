# app/main.py
import os
import sys
import time
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, status, HTTPException
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.exceptions import RequestValidationError
from fastapi.encoders import jsonable_encoder

from sqlalchemy import inspect, text, String
from sqlalchemy.orm import Session

from app.config import settings
from app.auth.router import router as auth_router
from app.dept.router import router as dept_router
from app.admin.router import router as admin_router
from app.supply.router import router as supply_router
import app.database.models as models_module
from app.database.models import (
    Base, 
    DecryptionError, 
    BusinessRuleViolation,
    SafeEnumType,
    SafeEnumStr,
    AssetStatus,
    ProposalStatus,
    ProposalCategory,
    NodeType,
    PageOrientation,
    ContentType,
    AssetRole,
    RoleTag,
    ProjectCategory,
    OfficeLocation,
    FundSource,
    UacsObjectCode,
    ExpenditureClass,
    SystemDevelopmentStatus,
    SystemStatus,
    SystemClassification,
    SystemHostingType,
    DevelopmentStrategy,
    ScopeChoice
)
from app.database.session import engine, db_session, SessionLocal

# Configure diagnostic stdout logging
logging.basicConfig(
    level=logging.INFO,
    format="[E-ISSP SYSTEM] %(asctime)s - %(levelname)s - %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)]
)
logger = logging.getLogger("app.main")

# Resolve allowed CORS origins safely
cors_origins = settings.CORS_ORIGINS
if not cors_origins:
    cors_origins = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:8000",
        "http://127.0.0.1:8000"
    ]
elif isinstance(cors_origins, str):
    cors_origins = [origin.strip() for origin in cors_origins.split(",") if origin.strip()]


def patch_runtime_enum_columns():
    """
    Patches column type processors dynamically so that:
    1. Native PostgreSQL Enum columns bind uppercase enum names (e.g. 'FUNCTIONAL').
    2. VARCHAR columns storing human-readable string values deserialize cleanly.
    """
    if hasattr(models_module, 'enforce_issp_singularity_and_accounting'):
        models_module.enforce_issp_singularity_and_accounting.__globals__['item_lower'] = ''

    native_enum_columns = {
        ("existing_inventory", "status"): (AssetStatus, True),
        ("issp_core", "status"): (ProposalStatus, True),
        ("issp_core", "category"): (ProposalCategory, True),
        ("issp_nodes", "node_type"): (NodeType, True),
        ("issp_nodes", "page_orientation"): (PageOrientation, True),
        ("issp_contents", "content_type"): (ContentType, True),
        ("issp_assets", "asset_role"): (AssetRole, True),
        ("users", "role_tag"): (RoleTag, True),
    }

    varchar_enum_columns = {
        ("issp_core", "strategic_category"): (ProjectCategory, False),
        ("issp_core", "office_location"): (OfficeLocation, False),
        ("issp_core", "fund_source"): (FundSource, False),
        ("issp_core", "uacs_object_code"): (UacsObjectCode, False),
        ("issp_core", "expenditure_class"): (ExpenditureClass, False),
        ("issp_core", "system_development_status"): (SystemDevelopmentStatus, False),
        ("existing_inventory", "office_location"): (OfficeLocation, False),
        ("information_systems", "status"): (SystemStatus, False),
        ("information_systems", "classification"): (SystemClassification, False),
        ("information_systems", "hosting_type"): (SystemHostingType, False),
        ("information_systems", "development_strategy"): (DevelopmentStrategy, False),
        ("ict_projects", "project_category"): (ProjectCategory, False),
        ("ict_projects", "funding_source"): (FundSource, False),
        ("master_narratives", "scope_choice"): (ScopeChoice, False),
    }

    if hasattr(models_module, 'DictAssetCategory'):
        varchar_enum_columns[("existing_inventory", "dict_category")] = (getattr(models_module, 'DictAssetCategory'), False)

    configs = {**native_enum_columns, **varchar_enum_columns}

    # Patch Table columns
    for table in Base.metadata.tables.values():
        for column in table.columns:
            key = (table.name, column.name)
            if key in configs:
                enum_cls, send_name = configs[key]
                column.type = SafeEnumType(enum_cls, send_name=send_name)

    # Patch ORM class mappers
    for mapper in Base.registry.mappers:
        t_name = mapper.local_table.name
        for prop in mapper.column_attrs:
            for col in prop.columns:
                key = (t_name, col.name)
                if key in configs:
                    enum_cls, send_name = configs[key]
                    col.type = SafeEnumType(enum_cls, send_name=send_name)


def align_database_schemas(engine):
    """
    Defensively inspects target database tables at runtime and appends any
    columns defined in the canonical models that are physically missing.
    Uses nested savepoints (conn.begin_nested()) to guarantee that a failure
    in any single statement never aborts the overall transaction in PostgreSQL.
    Converts legacy native ENUM columns (system_development_status, scope_choice)
    to standard VARCHAR types to prevent InvalidTextRepresentation crashes.
    Strips static institutional server defaults so configuration parameters govern values.
    """
    logger.info("Running defensive schema alignment checks...")
    is_sqlite = "sqlite" in settings.DATABASE_URL.lower()
    bool_false = "0" if is_sqlite else "false"
    bool_true = "1" if is_sqlite else "true"
    uuid_type = "VARCHAR(36)"

    def safe_exec(connection, sql_statement, params=None):
        try:
            with connection.begin_nested():
                connection.execute(sql_statement, params or {})
        except Exception as e:
            logger.debug(f"Defensive statement bypassed: {e}")

    with engine.begin() as conn:
        if not is_sqlite:
            # 1. Safely terminate orphan idle transactions
            safe_exec(conn, text("""
                SELECT pg_terminate_backend(pid) 
                FROM pg_stat_activity 
                WHERE datname = current_database() 
                  AND pid <> pg_backend_pid() 
                  AND state IN ('idle in transaction', 'idle in transaction (aborted)');
            """))
            safe_exec(conn, text("SET lock_timeout = '5s';"))

            # Drop broken custom operators that hijack standard varchar comparisons
            safe_exec(conn, text("""
                DO $$
                BEGIN
                    DROP OPERATOR IF EXISTS public.=(character varying, uuid) CASCADE;
                    DROP OPERATOR IF EXISTS public.=(uuid, character varying) CASCADE;
                    DROP OPERATOR IF EXISTS public.=(character, uuid) CASCADE;
                    DROP OPERATOR IF EXISTS public.=(uuid, character) CASCADE;
                    DROP FUNCTION IF EXISTS public.varchar_eq_uuid(character varying, uuid) CASCADE;
                    DROP FUNCTION IF EXISTS public.uuid_eq_varchar(uuid, character varying) CASCADE;
                    DROP FUNCTION IF EXISTS public.bpchar_eq_uuid(character, uuid) CASCADE;
                    DROP FUNCTION IF EXISTS public.uuid_eq_bpchar(uuid, character) CASCADE;
                EXCEPTION WHEN OTHERS THEN
                    NULL;
                END $$;
            """))

            # Add implicit cast compatibility so uuid = varchar comparisons never fail
            safe_exec(conn, text("""
                DO $$
                BEGIN
                    IF NOT EXISTS (
                        SELECT 1 FROM pg_cast 
                        WHERE castsource = 'character varying'::regtype 
                          AND casttarget = 'uuid'::regtype
                    ) THEN
                        CREATE CAST (character varying AS uuid) WITH INOUT AS IMPLICIT;
                    END IF;
                EXCEPTION WHEN OTHERS THEN NULL;
                END $$;
            """))

            safe_exec(conn, text("""
                DO $$
                BEGIN
                    IF NOT EXISTS (
                        SELECT 1 FROM pg_cast 
                        WHERE castsource = 'uuid'::regtype 
                          AND casttarget = 'character varying'::regtype
                    ) THEN
                        CREATE CAST (uuid AS character varying) WITH INOUT AS IMPLICIT;
                    END IF;
                EXCEPTION WHEN OTHERS THEN NULL;
                END $$;
            """))

            # Defensive Alter: Convert users.role_tag from ENUM to VARCHAR(100)
            safe_exec(conn, text("""
                DO $$
                BEGIN
                    IF EXISTS (
                        SELECT 1 
                        FROM information_schema.columns 
                        WHERE table_name = 'users' 
                          AND column_name = 'role_tag' 
                          AND (data_type = 'USER-DEFINED' OR udt_name = 'roletag')
                    ) THEN
                        ALTER TABLE users ALTER COLUMN role_tag DROP DEFAULT;
                        ALTER TABLE users ALTER COLUMN role_tag TYPE VARCHAR(100) USING role_tag::text;
                        ALTER TABLE users ALTER COLUMN role_tag SET DEFAULT 'ROLE_DEPT_USER';
                        DROP TYPE IF EXISTS roletag CASCADE;
                    END IF;
                EXCEPTION WHEN OTHERS THEN
                    NULL;
                END $$;
            """))

            # Defensive Alter: Convert issp_core.system_development_status from ENUM to VARCHAR(100)
            safe_exec(conn, text("""
                DO $$
                BEGIN
                    IF EXISTS (
                        SELECT 1 
                        FROM information_schema.columns 
                        WHERE table_name = 'issp_core' 
                          AND column_name = 'system_development_status' 
                          AND (data_type = 'USER-DEFINED' OR udt_name = 'systemdevelopmentstatus')
                    ) THEN
                        ALTER TABLE issp_core ALTER COLUMN system_development_status DROP DEFAULT;
                        ALTER TABLE issp_core ALTER COLUMN system_development_status TYPE VARCHAR(100) USING system_development_status::text;
                        ALTER TABLE issp_core ALTER COLUMN system_development_status SET DEFAULT 'N/A';
                        UPDATE issp_core SET system_development_status = 'For Development' WHERE system_development_status ILIKE '%development%';
                        UPDATE issp_core SET system_development_status = 'For Enhancement' WHERE system_development_status ILIKE '%enhancement%';
                        UPDATE issp_core SET system_development_status = 'N/A' WHERE system_development_status IS NULL OR system_development_status NOT IN ('For Development', 'For Enhancement');
                        DROP TYPE IF EXISTS systemdevelopmentstatus CASCADE;
                    END IF;
                EXCEPTION WHEN OTHERS THEN
                    NULL;
                END $$;
            """))

            # Defensive Alter: Convert master_narratives.scope_choice from ENUM to VARCHAR(100)
            safe_exec(conn, text("""
                DO $$
                BEGIN
                    IF EXISTS (
                        SELECT 1 
                        FROM information_schema.columns 
                        WHERE table_name = 'master_narratives' 
                          AND column_name = 'scope_choice' 
                          AND (data_type = 'USER-DEFINED' OR udt_name = 'scopechoice')
                    ) THEN
                        ALTER TABLE master_narratives ALTER COLUMN scope_choice DROP DEFAULT;
                        ALTER TABLE master_narratives ALTER COLUMN scope_choice TYPE VARCHAR(100) USING scope_choice::text;
                        ALTER TABLE master_narratives ALTER COLUMN scope_choice SET DEFAULT 'Department-Wide';
                        DROP TYPE IF EXISTS scopechoice CASCADE;
                    END IF;
                EXCEPTION WHEN OTHERS THEN
                    NULL;
                END $$;
            """))

        # Inspect database tables safely
        inspector = inspect(conn)
        table_names = inspector.get_table_names()

        # 1. Patch 'master_narratives' table (Zero Hardcoding, DICT Co-Branding & MITHI Res 2025-01 Compliance)
        if "master_narratives" in table_names:
            narrative_cols = [c['name'] for c in inspector.get_columns('master_narratives')]
            columns_to_sync_narrative = {
                "agency_name": "VARCHAR(255)",
                "agency_website_url": "VARCHAR(255)",
                "is_amendment": f"BOOLEAN DEFAULT {bool_false}",
                "amendment_number": "VARCHAR(50)",
                "scope_choice": "VARCHAR(100) DEFAULT 'Department-Wide'",
                "scope_json": "JSON DEFAULT '{}'",
                "cio_organizational_unit": "VARCHAR(200)",
                "functions": "TEXT",
                "focal_name": "VARCHAR(200)",
                "focal_position": "VARCHAR(200)",
                "focal_organizational_unit": "VARCHAR(200)",
                "focal_email": "VARCHAR(255)",
                "focal_contact_no": "VARCHAR(100)",
                "agency_head_position": "VARCHAR(200)",
                "drbcp_approval_date": "VARCHAR(100)",
                "authoring_cycle_duration": "INTEGER",
                "site_development_plan_url": "VARCHAR(500)",
                "fiber_backbone_url": "VARCHAR(500)",
                "system_architecture_url": "VARCHAR(500)",
                "process_flow_diagram_url": "VARCHAR(500)",
                "network_diagram_url": "VARCHAR(500)",
                "b_3_a_ict_org_url": "VARCHAR(500)",
                "net_layout_sias_url": "VARCHAR(500)",
                "net_layout_library_url": "VARCHAR(500)",
                "net_layout_security_url": "VARCHAR(500)",
                "net_layout_hris_url": "VARCHAR(500)",
                "net_layout_dms_url": "VARCHAR(500)",
                "net_layout_supplies_url": "VARCHAR(500)",
                "net_layout_budget_url": "VARCHAR(500)",
                "net_layout_sias_upgrade_url": "VARCHAR(500)",
                "net_layout_extension_url": "VARCHAR(500)",
                "planners_json": "JSON DEFAULT '[]'",
                "manpower_json": "JSON DEFAULT '{}'",
                "major_final_outputs": "JSON DEFAULT '[]'",
                "strategic_concerns_json": "JSON DEFAULT '[]'",
                "systems_json": "JSON DEFAULT '[]'",
                "databases_json": "JSON DEFAULT '[]'",
                "internal_projects_json": "JSON DEFAULT '[]'",
                "cross_projects_json": "JSON DEFAULT '[]'",
                "pmf_matrix_json": "JSON DEFAULT '[]'",
                "mithi_special_solutions": "JSON DEFAULT '[]'",
                "mithi_hardware_inventory": "JSON DEFAULT '[]'",
                "implementation_schedules": "JSON DEFAULT '[]'",
                "annual_ict_budget": "NUMERIC(15, 2) DEFAULT 0.00",
                # Dynamic Section Extensions
                "enterprise_architecture_narrative": "TEXT",
                "drbcp_affected_assets_json": "JSON DEFAULT '[]'",
                "drbcp_recovery_strategy_html": "TEXT",
                "drbcp_sop_phases_html": "TEXT",
                "drbcp_compliance_narrative_html": "TEXT",
                "is_archived": f"BOOLEAN DEFAULT {bool_false}",
                "final_pdf_vault_url": "VARCHAR(500)",
                # Official DICT v.2026 Co-Branding Seals & Institutional Logos
                "dict_logo_url": "VARCHAR(500)",
                "bagong_pilipinas_logo_url": "VARCHAR(500)",
                "agency_logo_url": "VARCHAR(500)",
                "cert_logo_url": "VARCHAR(500)"
            }
            for col_name, col_def in columns_to_sync_narrative.items():
                if col_name not in narrative_cols:
                    logger.info(f"Defensive Sync: Appending missing column '{col_name}' to 'master_narratives'.")
                    safe_exec(conn, text(f"ALTER TABLE master_narratives ADD COLUMN {col_name} {col_def}"))

        # 2. Patch 'organizational_outcomes' table (Defensively sync both outcome_name & program_name)
        if "organizational_outcomes" in table_names:
            oo_cols = [c['name'] for c in inspector.get_columns('organizational_outcomes')]
            columns_to_sync_oo = {
                "issp_period": "VARCHAR(50) DEFAULT '2026-2028'",
                "type_label": "VARCHAR(50) DEFAULT 'Major Final Output'",
                "outcome_name": "VARCHAR(255)",
                "program_name": "VARCHAR(255)",
                "description": "TEXT"
            }
            for col_name, col_def in columns_to_sync_oo.items():
                if col_name not in oo_cols:
                    logger.info(f"Defensive Sync: Appending missing column '{col_name}' to 'organizational_outcomes'.")
                    safe_exec(conn, text(f"ALTER TABLE organizational_outcomes ADD COLUMN {col_name} {col_def}"))
            
            safe_exec(conn, text("UPDATE organizational_outcomes SET outcome_name = program_name WHERE outcome_name IS NULL AND program_name IS NOT NULL"))
            safe_exec(conn, text("UPDATE organizational_outcomes SET program_name = outcome_name WHERE program_name IS NULL AND outcome_name IS NOT NULL"))

        # 3. Patch 'strategic_concerns' table
        if "strategic_concerns" in table_names:
            sc_cols = [c['name'] for c in inspector.get_columns('strategic_concerns')]
            columns_to_sync_sc = {
                "issp_period": "VARCHAR(50) DEFAULT '2026-2028'",
                "outcome_id": "INTEGER",
                "mfo": "VARCHAR(255)",
                "critical_system": "VARCHAR(255)",
                "problems": "TEXT",
                "intended_use": "TEXT",
                "order_index": "INTEGER DEFAULT 0"
            }
            for col_name, col_def in columns_to_sync_sc.items():
                if col_name not in sc_cols:
                    logger.info(f"Defensive Sync: Appending missing column '{col_name}' to 'strategic_concerns'.")
                    safe_exec(conn, text(f"ALTER TABLE strategic_concerns ADD COLUMN {col_name} {col_def}"))

        # 4. Patch 'human_capitals' table
        if "human_capitals" in table_names:
            hc_cols = [c['name'] for c in inspector.get_columns('human_capitals')]
            columns_to_sync_hc = {
                "issp_period": "VARCHAR(50) DEFAULT '2026-2028'",
                "is_proposed": f"BOOLEAN DEFAULT {bool_false}",
                "employment_status": "VARCHAR(100) DEFAULT 'Plantilla (Filled)'",
                "it_positions_count": "INTEGER DEFAULT 0",
                "non_it_positions_count": "INTEGER DEFAULT 0",
                "male_count": "INTEGER DEFAULT 0",
                "female_count": "INTEGER DEFAULT 0"
            }
            for col_name, col_def in columns_to_sync_hc.items():
                if col_name not in hc_cols:
                    logger.info(f"Defensive Sync: Appending missing column '{col_name}' to 'human_capitals'.")
                    safe_exec(conn, text(f"ALTER TABLE human_capitals ADD COLUMN {col_name} {col_def}"))

        # 5. Patch 'ict_staff_positions' table
        if "ict_staff_positions" in table_names:
            isp_cols = [c['name'] for c in inspector.get_columns('ict_staff_positions')]
            columns_to_sync_isp = {
                "issp_period": "VARCHAR(50) DEFAULT '2026-2028'",
                "position_title": "VARCHAR(150)",
                "status": "VARCHAR(50) DEFAULT 'Plantilla'",
                "count": "INTEGER DEFAULT 1"
            }
            for col_name, col_def in columns_to_sync_isp.items():
                if col_name not in isp_cols:
                    logger.info(f"Defensive Sync: Appending missing column '{col_name}' to 'ict_staff_positions'.")
                    safe_exec(conn, text(f"ALTER TABLE ict_staff_positions ADD COLUMN {col_name} {col_def}"))

        # 6. Patch 'stakeholder_analyses' table
        if "stakeholder_analyses" in table_names:
            sh_cols = [c['name'] for c in inspector.get_columns('stakeholder_analyses')]
            columns_to_sync_sh = {
                "issp_period": "VARCHAR(50) DEFAULT '2026-2028'",
                "stakeholder_group": "VARCHAR(150)",
                "transaction_processed_incoming": "TEXT",
                "transaction_processed_outgoing": "TEXT",
                "complexity_incoming": "VARCHAR(50) DEFAULT 'Simple'",
                "complexity_outgoing": "VARCHAR(50) DEFAULT 'Simple'"
            }
            for col_name, col_def in columns_to_sync_sh.items():
                if col_name not in sh_cols:
                    logger.info(f"Defensive Sync: Appending missing column '{col_name}' to 'stakeholder_analyses'.")
                    safe_exec(conn, text(f"ALTER TABLE stakeholder_analyses ADD COLUMN {col_name} {col_def}"))

        # 7. Patch 'issp_core' table (Unified Proposals Ledger)
        if "issp_core" in table_names:
            core_cols = [c['name'] for c in inspector.get_columns('issp_core')]
            columns_to_sync_core = {
                "project_id": f"{uuid_type}",
                "needs_assessment_id": f"{uuid_type}",
                "outcome_id": "INTEGER",
                "item_key": "VARCHAR(100)",
                "item_name": "VARCHAR(200) DEFAULT ''",
                "category": "VARCHAR(50) DEFAULT 'Hardware'",
                "strategic_category": "VARCHAR(100) DEFAULT 'Office Productivity'",
                "office_location": "VARCHAR(100) DEFAULT 'Central Office'",
                "fund_source": "VARCHAR(100) DEFAULT 'General Appropriations Act (GAA)'",
                "uacs_object_code": "VARCHAR(150)",
                "expenditure_class": "VARCHAR(100) DEFAULT 'Capital Outlay'",
                "year_1_qty": "INTEGER DEFAULT 0",
                "year_2_qty": "INTEGER DEFAULT 0",
                "year_3_qty": "INTEGER DEFAULT 0",
                "total_qty": "INTEGER DEFAULT 0",
                "total_cost": "NUMERIC(15, 2) DEFAULT 0.00",
                "created_by_students": f"BOOLEAN DEFAULT {bool_false}",
                "system_development_status": "VARCHAR(50) DEFAULT 'N/A'",
                "target_office_automated": "VARCHAR(200)",
                "canvas_expiration_date": "TIMESTAMP NULL",
                "is_expansion": f"BOOLEAN DEFAULT {bool_false}",
                "is_archived": f"BOOLEAN DEFAULT {bool_false}"
            }
            for col_name, col_def in columns_to_sync_core.items():
                if col_name not in core_cols:
                    logger.info(f"Defensive Sync: Appending missing column '{col_name}' to 'issp_core'.")
                    safe_exec(conn, text(f"ALTER TABLE issp_core ADD COLUMN {col_name} {col_def}"))

        # 8. Patch 'existing_inventory' table (Annex 1 Standard Categorization)
        if "existing_inventory" in table_names:
            inv_cols = [c['name'] for c in inspector.get_columns('existing_inventory')]
            columns_to_sync_inv = {
                "department_id": "INTEGER",
                "dict_category": "VARCHAR(100)",
                "other_category_name": "VARCHAR(200)",
                "item_name": "VARCHAR(200) DEFAULT ''",
                "specs": "TEXT",
                "exact_model": "VARCHAR(200)",
                "quantity": "INTEGER DEFAULT 1",
                "status": "VARCHAR(50) DEFAULT 'Functional'",
                "date_acquired": "TIMESTAMP DEFAULT CURRENT_TIMESTAMP",
                "acquired_price": "NUMERIC(15, 2) DEFAULT 0.00",
                "office_location": "VARCHAR(100) DEFAULT 'Central Office'",
                "is_central_office": f"BOOLEAN DEFAULT {bool_true}",
                "is_end_of_life": f"BOOLEAN DEFAULT {bool_false}",
                "is_backup": f"BOOLEAN DEFAULT {bool_false}",
                "is_software": f"BOOLEAN DEFAULT {bool_false}",
                "is_perpetual": f"BOOLEAN DEFAULT {bool_true}",
                "unserviceable_report_url": "VARCHAR(500)"
            }
            for col_name, col_def in columns_to_sync_inv.items():
                if col_name not in inv_cols:
                    logger.info(f"Defensive Sync: Appending missing column '{col_name}' to 'existing_inventory'.")
                    safe_exec(conn, text(f"ALTER TABLE existing_inventory ADD COLUMN {col_name} {col_def}"))

        # 9. Patch 'catalog_items' table
        if "catalog_items" in table_names:
            cat_cols = [c['name'] for c in inspector.get_columns('catalog_items')]
            columns_to_sync_cat = {
                "canvas_evidence_url": "VARCHAR(500)",
                "supplier_name": "VARCHAR(200)",
                "canvas_expiration_date": "TIMESTAMP NULL"
            }
            for col_name, col_def in columns_to_sync_cat.items():
                if col_name not in cat_cols:
                    logger.info(f"Defensive Sync: Appending missing column '{col_name}' to 'catalog_items'.")
                    safe_exec(conn, text(f"ALTER TABLE catalog_items ADD COLUMN {col_name} {col_def}"))

        # 10. Patch 'egovernment_checklists' table
        if "egovernment_checklists" in table_names:
            egov_cols = [c['name'] for c in inspector.get_columns('egovernment_checklists')]
            columns_to_sync_egov = {
                "is_manual": f"BOOLEAN DEFAULT {bool_false}",
                "is_proposed_development": f"BOOLEAN DEFAULT {bool_false}",
                "adoption_ratio": "VARCHAR(100)",
                "channels_json": "JSON DEFAULT '[]'",
                "is_connected_to_portal": f"BOOLEAN DEFAULT {bool_false}"
            }
            for col_name, col_def in columns_to_sync_egov.items():
                if col_name not in egov_cols:
                    logger.info(f"Defensive Sync: Appending missing column '{col_name}' to 'egovernment_checklists'.")
                    safe_exec(conn, text(f"ALTER TABLE egovernment_checklists ADD COLUMN {col_name} {col_def}"))

        # 11. Patch 'network_infrastructures' table
        if "network_infrastructures" in table_names:
            net_cols = [c['name'] for c in inspector.get_columns('network_infrastructures')]
            columns_to_sync_net = {
                "upload_speed_mbps": "INTEGER",
                "download_speed_mbps": "INTEGER",
                "office_location": "VARCHAR(200) DEFAULT 'Central Office'",
                "diagram_url": "VARCHAR(500)"
            }
            for col_name, col_def in columns_to_sync_net.items():
                if col_name not in net_cols:
                    logger.info(f"Defensive Sync: Appending missing column '{col_name}' to 'network_infrastructures'.")
                    safe_exec(conn, text(f"ALTER TABLE network_infrastructures ADD COLUMN {col_name} {col_def}"))

        # 12. Patch 'dr_bia_summary' table
        if "dr_bia_summary" in table_names:
            bia_cols = [c['name'] for c in inspector.get_columns('dr_bia_summary')]
            columns_to_sync_bia = {
                "system_id": f"{uuid_type}",
                "mtpd_hours": "INTEGER DEFAULT 24"
            }
            for col_name, col_def in columns_to_sync_bia.items():
                if col_name not in bia_cols:
                    logger.info(f"Defensive Sync: Appending missing column '{col_name}' to 'dr_bia_summary'.")
                    safe_exec(conn, text(f"ALTER TABLE dr_bia_summary ADD COLUMN {col_name} {col_def}"))

        # 13. Patch 'performance_metrics' table
        if "performance_metrics" in table_names:
            pmf_cols = [c['name'] for c in inspector.get_columns('performance_metrics')]
            if "project_id" not in pmf_cols:
                logger.info(f"Defensive Sync: Appending missing column 'project_id' to 'performance_metrics' as {uuid_type}.")
                safe_exec(conn, text(f"ALTER TABLE performance_metrics ADD COLUMN project_id {uuid_type}"))

        # 14. Patch 'budget_ceilings' table
        if "budget_ceilings" in table_names:
            bc_cols = [c['name'] for c in inspector.get_columns('budget_ceilings')]
            columns_to_sync_bc = {
                "allocated_capex": "NUMERIC(15, 2) DEFAULT 0.00",
                "allocated_mooe": "NUMERIC(15, 2) DEFAULT 0.00",
                "issp_period": "VARCHAR(50) DEFAULT '2026-2028'"
            }
            for col_name, col_def in columns_to_sync_bc.items():
                if col_name not in bc_cols:
                    logger.info(f"Defensive Sync: Appending missing column '{col_name}' to 'budget_ceilings'.")
                    safe_exec(conn, text(f"ALTER TABLE budget_ceilings ADD COLUMN {col_name} {col_def}"))

        # 15. Patch 'ict_projects' table (Part III.E Strategic Alignment Extension)
        if "ict_projects" in table_names:
            proj_cols = [c['name'] for c in inspector.get_columns('ict_projects')]
            columns_to_sync_proj = {
                "issp_period": "VARCHAR(50) DEFAULT '2026-2028'",
                "system_id": f"{uuid_type}",
                "project_title": "VARCHAR(255) DEFAULT ''",
                "project_category": "VARCHAR(100) DEFAULT 'Internal ICT Projects'",
                "description": "TEXT DEFAULT ''",
                "objectives": "TEXT DEFAULT ''",
                "aligns_pip": f"BOOLEAN DEFAULT {bool_false}",
                "aligns_ncsp": f"BOOLEAN DEFAULT {bool_false}",
                "aligns_egmp": f"BOOLEAN DEFAULT {bool_false}",
                "aligns_pcb": f"BOOLEAN DEFAULT {bool_false}",
                "aligns_others": f"BOOLEAN DEFAULT {bool_false}",
                "aligns_others_specify": "VARCHAR(255)",
                "harmonizes_national_priority": f"BOOLEAN DEFAULT {bool_false}",
                "harmonizes_resource_optimization": f"BOOLEAN DEFAULT {bool_false}",
                "harmonizes_pegif": f"BOOLEAN DEFAULT {bool_false}",
                "harmonizes_cross_collaboration": f"BOOLEAN DEFAULT {bool_false}",
                "harmonizes_scalability": f"BOOLEAN DEFAULT {bool_false}",
                "duration_start_year": "INTEGER DEFAULT 2026",
                "duration_end_year": "INTEGER DEFAULT 2028",
                "annual_deliverables": "JSON DEFAULT '{}'",
                "year_1_deliverables": "TEXT DEFAULT ''",
                "year_2_deliverables": "TEXT DEFAULT ''",
                "year_3_deliverables": "TEXT DEFAULT ''",
                "implementing_unit": "VARCHAR(200)",
                "funding_source": "VARCHAR(100) DEFAULT 'General Appropriations Act (GAA)'",
                "lead_agency": "VARCHAR(200)",
                "partner_agencies": "TEXT"
            }
            for col_name, col_def in columns_to_sync_proj.items():
                if col_name not in proj_cols:
                    logger.info(f"Defensive Sync: Appending missing column '{col_name}' to 'ict_projects'.")
                    safe_exec(conn, text(f"ALTER TABLE ict_projects ADD COLUMN {col_name} {col_def}"))

        # 16. Patch 'information_systems' table
        if "information_systems" in table_names:
            sys_cols = [c['name'] for c in inspector.get_columns('information_systems')]
            columns_to_sync_sys = {
                "issp_period": "VARCHAR(50) DEFAULT '2026-2028'",
                "strategic_concern_id": f"{uuid_type}",
                "name": "VARCHAR(255) DEFAULT ''",
                "status": "VARCHAR(50) DEFAULT 'Operational'",
                "classification": "VARCHAR(100) DEFAULT 'Operations - Frontline Service'",
                "hosting_type": "VARCHAR(50) DEFAULT 'Hybrid'",
                "online_url": "VARCHAR(255)",
                "description_and_purpose": "TEXT DEFAULT ''",
                "enhancement_details": "TEXT",
                "development_strategy": "VARCHAR(100) DEFAULT 'Outsourced'",
                "development_platform": "VARCHAR(200) DEFAULT ''",
                "database_name": "VARCHAR(200) DEFAULT ''",
                "data_storage_type": "VARCHAR(200) DEFAULT ''",
                "internal_users": "TEXT DEFAULT ''",
                "external_users": "TEXT DEFAULT ''",
                "system_owner_office": "VARCHAR(200) DEFAULT ''",
                "is_integrated_with_others": f"BOOLEAN DEFAULT {bool_false}",
                "internal_integrated_systems": "TEXT",
                "external_integrated_systems": "TEXT",
                "generates_data_for_others": f"BOOLEAN DEFAULT {bool_false}",
                "processes_data_from_others": f"BOOLEAN DEFAULT {bool_false}",
                "is_deployed_on_shared_platform": f"BOOLEAN DEFAULT {bool_false}",
                "processes_personal_information": f"BOOLEAN DEFAULT {bool_false}",
                "has_undergone_pia": f"BOOLEAN DEFAULT {bool_false}"
            }
            for col_name, col_def in columns_to_sync_sys.items():
                if col_name not in sys_cols:
                    logger.info(f"Defensive Sync: Appending missing column '{col_name}' to 'information_systems'.")
                    safe_exec(conn, text(f"ALTER TABLE information_systems ADD COLUMN {col_name} {col_def}"))

        # 17. Patch 'needs_assessments' table (Section 8.0 Aggregation & Linkage)
        if "needs_assessments" in table_names:
            na_cols = [c['name'] for c in inspector.get_columns('needs_assessments')]
            columns_to_sync_na = {
                "is_aggregated": f"BOOLEAN DEFAULT {bool_false}",
                "strategic_concern_id": f"{uuid_type}"
            }
            for col_name, col_def in columns_to_sync_na.items():
                if col_name not in na_cols:
                    logger.info(f"Defensive Sync: Appending missing column '{col_name}' to 'needs_assessments'.")
                    safe_exec(conn, text(f"ALTER TABLE needs_assessments ADD COLUMN {col_name} {col_def}"))

        # 18. Patch 'audit_trails' table (COA Security & Role-Scoped Audit Trails)
        if "audit_trails" in table_names:
            audit_cols = [c['name'] for c in inspector.get_columns('audit_trails')]
            columns_to_sync_audit = {
                "module": "VARCHAR(100) DEFAULT 'GOVERNANCE'",
                "ip_address": "VARCHAR(50)",
                "department_id": "INTEGER"
            }
            for col_name, col_def in columns_to_sync_audit.items():
                if col_name not in audit_cols:
                    logger.info(f"Defensive Sync: Appending missing column '{col_name}' to 'audit_trails'.")
                    safe_exec(conn, text(f"ALTER TABLE audit_trails ADD COLUMN {col_name} {col_def}"))

            audit_indexes = [ix['name'] for ix in inspector.get_indexes('audit_trails')]
            if "ix_audit_trails_department_id" not in audit_indexes:
                safe_exec(conn, text("CREATE INDEX ix_audit_trails_department_id ON audit_trails (department_id)"))


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Handles application startup and shutdown procedures safely.
    Defensively verifies schemas, patches runtime enums, neutralizes operator conflicts,
    and automatically executes cycle expiration / rollover checks.
    """
    agency_label = getattr(settings, "DEFAULT_AGENCY_NAME", "INSTITUTIONAL")
    logger.info("=" * 70)
    logger.info(f"INITIALIZING {agency_label.upper()} E-ISSP COMPLIANCE ENGINE (DICT v.2026)")
    logger.info("=" * 70)
    
    # 0. Defensively patch models listener globals
    if hasattr(models_module, 'enforce_issp_singularity_and_accounting'):
        models_module.enforce_issp_singularity_and_accounting.__globals__['item_lower'] = ''

    # 1. Defensive Schema Alignment & Operator Sanitization
    try:
        align_database_schemas(engine)
    except Exception as schema_err:
        logger.error(f"Defensive schema alignment encountered a non-fatal warning: {str(schema_err)}")

    # 2. Defensively patch all mapped Enum columns for runtime reflection
    try:
        patch_runtime_enum_columns()
    except Exception as enum_err:
        logger.error(f"Runtime enum column patching warning: {str(enum_err)}")

    # 3. Verify and compile database schema structures
    try:
        logger.info("Verifying and registering database schema metadata...")
        Base.metadata.create_all(bind=engine)
        logger.info("Database base tables verified successfully.")
    except Exception as e:
        logger.critical(f"Failed to initialize metadata tables on startup: {str(e)}", exc_info=True)

    # 4. Automated Lifecycle Rollover Evaluation on Startup
    try:
        with SessionLocal() as db:
            from app.services.lifecycle_service import ISSPLifecycleEngine
            rollover_res = ISSPLifecycleEngine.evaluate_and_rollover_cycle(db)
            logger.info(f"Lifecycle evaluation on boot: {rollover_res.get('status')} - {rollover_res.get('message', '')}")
    except Exception as lc_err:
        logger.warning(f"Lifecycle startup check note: {str(lc_err)}")

    # 5. Scan and Log Registered Routing Tables
    logger.info("Scanning active API routing tables...")
    routes_registered = []
    for route in app.routes:
        methods = getattr(route, "methods", None)
        methods_str = f"[{', '.join(methods)}]" if methods else "[STATIC/WS]"
        routes_registered.append(f"  -> {route.path} {methods_str}")
        
    for r in sorted(routes_registered):
        logger.info(r)
        
    logger.info(f"Scan complete: {len(app.routes)} active routes registered.")
    logger.info("=" * 70)
    
    yield  # Application serves incoming requests
    
    logger.info("=" * 70)
    logger.info(f"SHUTTING DOWN {agency_label.upper()} E-ISSP COMPLIANCE ENGINE")
    logger.info("De-allocating connection pool and worker instances...")
    logger.info("=" * 70)


# Initialize the FastAPI application using dynamic settings
app_title = f"{getattr(settings, 'DEFAULT_AGENCY_NAME', 'e-ISSP')} Compliance Backend Engine"

app = FastAPI(
    title=app_title,
    description="Singular governance engine supporting DICT standard compliance, 4-way financial parity, and automated dual-pass PDF rendering.",
    version="5.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan
)

# Standard Cross-Origin Resource Sharing (CORS) Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition"]
)


# ==========================================================
# DIAGNOSTICS & REQUEST TRACKING MIDDLEWARE
# ==========================================================

@app.middleware("http")
async def log_requests(request: Request, call_next):
    """
    Tracks and logs every incoming network request, processing duration, and response status.
    Ensures safe database session rollback upon unhandled errors.
    """
    start_time = time.time()
    logger.info(f"Incoming Request: {request.method} {request.url.path}")
    try:
        response = await call_next(request)
        process_time_ms = (time.time() - start_time) * 1000
        logger.info(
            f"Outgoing Response: {request.method} {request.url.path} - "
            f"Status: {response.status_code} - Latency: {process_time_ms:.2f}ms"
        )
        return response
    except Exception as exc:
        try:
            db_session.rollback()
            logger.info("Interception: Scoped database session rolled back cleanly.")
        except Exception as db_exc:
            logger.error(f"Failed to roll back database session on request exception: {str(db_exc)}")
        finally:
            db_session.remove()

        process_time_ms = (time.time() - start_time) * 1000
        logger.error(
            f"Request failed: {request.method} {request.url.path} - "
            f"Latency: {process_time_ms:.2f}ms - Unhandled Exception: {str(exc)}",
            exc_info=True
        )
        raise exc


# ==========================================================
# CORS-SAFE EXCEPTION HANDLERS
# ==========================================================

def get_cors_headers(request: Request) -> dict[str, str]:
    headers = {}
    origin = request.headers.get("origin")
    if origin:
        if origin in cors_origins:
            headers["Access-Control-Allow-Origin"] = origin
            headers["Access-Control-Allow-Credentials"] = "true"
        elif "*" in cors_origins:
            headers["Access-Control-Allow-Origin"] = "*"
    return headers


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    logger.warning(f"Request schema validation failed: {exc.errors()}")
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        headers=get_cors_headers(request),
        content={"detail": jsonable_encoder(exc.errors())}
    )


@app.exception_handler(DecryptionError)
async def decryption_exception_handler(request: Request, exc: DecryptionError):
    logger.critical(f"Internal cryptographic failure: {str(exc)}")
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        headers=get_cors_headers(request),
        content={"detail": "An internal system cryptographic error occurred during data processing."}
    )


@app.exception_handler(BusinessRuleViolation)
async def business_rule_exception_handler(request: Request, exc: BusinessRuleViolation):
    logger.warning(f"Business constraint failure intercepted: {str(exc)}")
    return JSONResponse(
        status_code=status.HTTP_400_BAD_REQUEST,
        headers=get_cors_headers(request),
        content={"detail": str(exc)}
    )


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        headers=get_cors_headers(request),
        content={"detail": exc.detail}
    )


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    raw_error_message = str(exc)
    sanitized_error = raw_error_message
    for keyword in ["password", "secret", "token", "key", "private", "database_url"]:
        if keyword in sanitized_error.lower():
            sanitized_error = f"[REDACTED_SENSITIVE_DATA_CONTAINING_{keyword.upper()}]"
            break

    logger.error(f"Unhandled Exception: {sanitized_error}", exc_info=exc)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        headers=get_cors_headers(request),
        content={"detail": f"{type(exc).__name__}: {str(exc)}"}
    )


# ==========================================================
# ROUTER INTEGRATION & STATIC FILE SERVING
# ==========================================================

app.include_router(auth_router)
app.include_router(dept_router)
app.include_router(admin_router)
app.include_router(supply_router)

# Mount local upload file system statically
if settings.STORAGE_TYPE == "local":
    try:
        os.makedirs(settings.LOCAL_UPLOAD_DIR, exist_ok=True)
        app.mount(
            "/static/uploads", 
            StaticFiles(directory=settings.LOCAL_UPLOAD_DIR), 
            name="static"
        )
        logger.info(f"Successfully mounted local uploads directory: {settings.LOCAL_UPLOAD_DIR}")
    except Exception as e:
        logger.error(f"Failed to configure or mount local upload directory: {str(e)}")


# ==========================================================
# DIAGNOSTICS & HEALTH ENDPOINTS
# ==========================================================

@app.get("/api/health", tags=["System Diagnostics"])
async def check_engine_health():
    """Returns consolidated engine configurations, active storage class, and budget limits."""
    storage_mode = getattr(settings, "STORAGE_TYPE", "local")
    budget_limit = getattr(settings, "GLOBAL_BUDGET_CEILING", 0.0)
    region = getattr(settings, "AWS_S3_REGION_NAME", "LOCAL_EMULATOR") if storage_mode == "s3" else "LOCAL_EMULATOR"
    
    return JSONResponse(
        content={
            "status": "online",
            "agency": getattr(settings, "DEFAULT_AGENCY_NAME", "Universal ISSP Engine"),
            "version": "5.0-DICT-v.2026",
            "storage_mode": storage_mode,
            "region": region,
            "global_budget_limit": f"PHP {budget_limit:,.2f}" if budget_limit else "Not Configured"
        }
    )