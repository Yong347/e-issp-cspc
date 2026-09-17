# seed.py
import os
import sys
import logging
import argparse
import uuid
from decimal import Decimal
from datetime import datetime, timedelta, timezone
import bcrypt
from sqlalchemy import create_engine, event, inspect, text, String, or_
from sqlalchemy.types import TypeDecorator
from sqlalchemy.orm import sessionmaker

# Import Base and ALL canonical models
import app.database.models as models_module
from app.database.models import (
    Base, 
    User, 
    Department, 
    BudgetCeiling, 
    RoleTag,
    MasterNarrative,
    CatalogItem,
    ScopeChoice,
    Campus,
    OrganizationalOutcome,
    StrategicConcern,
    InformationSystem,
    IctProject,
    CrossAgencyProject,
    PerformanceMetric,
    NetworkInfrastructure,
    CybersecurityControl,
    GlossaryTerm,
    GeneralInstruction,
    ClientOsCensus,
    OfficeSoftwareCensus,
    ServerCapacityTrack,
    IctStaffPosition,
    HumanCapital,
    StakeholderAnalysis,
    EGovernmentChecklist,
    DisasterRecoveryTeam,
    BusinessImpactAnalysis,
    DRBCPMetric,
    ExistingInventory,
    Proposal,
    NeedsAssessment,
    IsspNode,
    IsspVocabulary,
    IsspContent,
    IsspAsset,
    SystemSetting,
    NodeType,
    PageOrientation,
    ContentType,
    AssetRole,
    ProposalStatus,
    ProposalCategory,
    ProjectCategory,
    ExpenditureClass,
    FundSource,
    OfficeLocation,
    UacsObjectCode,
    SystemClassification,
    SystemHostingType,
    DevelopmentStrategy,
    SystemStatus,
    SystemDevelopmentStatus,
    TransactionComplexity,
    ResultHierarchy,
    AssetStatus,
    AnnualCostBreakdown,
    AuditTrail,
    SafeEnumStr,
    SafeEnumType
)
from app.config import settings
from app.services.issp_engine import ISSPSingularityEngine
from app.utils.helpers import calculate_financial_summaries

logging.basicConfig(level=logging.INFO, format="[ISSP SEEDER] %(asctime)s - %(levelname)s: %(message)s", force=True)
logger = logging.getLogger(__name__)


def patch_resilient_encrypted_json():
    """
    Hardens EncryptedJSON against key rotation, salt mismatches, or legacy cipher strings.
    1. Expands active_ciphers in models_module using historical candidate salts and keys.
    2. Dynamically wraps EncryptedJSON.process_result_value to gracefully fall back to {}
       if decryption fails, avoiding DecryptionError crashes and enabling database auto-healing.
    """
    try:
        from cryptography.fernet import Fernet
        from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
        from cryptography.hazmat.primitives import hashes
        import base64

        candidate_salts = set()
        active_salt = getattr(settings, "DB_ENCRYPTION_SALT", None)
        if active_salt:
            candidate_salts.add(str(active_salt))

        fallback_salts = [
            "issp_secure_static_encryption_salt",
            "default_insecure_static_encryption_salt",
            "static_encryption_salt",
            "changeme_encryption_salt",
            getattr(settings, "SECRET_KEY", None),
            "issp-vault",
            "salt"
        ]
        for s in fallback_salts:
            if s:
                candidate_salts.add(str(s))

        candidate_keys = set()
        active_keys_str = getattr(settings, "DB_ENCRYPTION_KEY", None) or ""
        for k in active_keys_str.split(","):
            if k.strip():
                candidate_keys.add(k.strip())

        secret_key = getattr(settings, "SECRET_KEY", None)
        if secret_key:
            candidate_keys.add(secret_key.strip())

        if hasattr(models_module, "active_ciphers"):
            existing_ciphers = models_module.active_ciphers
            for k in candidate_keys:
                for s in candidate_salts:
                    try:
                        kdf = PBKDF2HMAC(
                            algorithm=hashes.SHA256(),
                            length=32,
                            salt=s.encode("utf-8") if isinstance(s, str) else s,
                            iterations=100_000,
                        )
                        derived_key = base64.urlsafe_b64encode(kdf.derive(k.encode("utf-8") if isinstance(k, str) else k))
                        cipher = Fernet(derived_key)
                        s_key = getattr(cipher, "_signing_key", None)
                        if not any(getattr(c, "_signing_key", None) == s_key for c in existing_ciphers):
                            existing_ciphers.append(cipher)
                    except Exception:
                        pass
    except Exception as cipher_err:
        logger.debug(f"Candidate cipher registration note: {cipher_err}")

    if hasattr(models_module, "EncryptedJSON"):
        orig_process = models_module.EncryptedJSON.process_result_value

        def safe_process_result_value(self, value, dialect):
            if value is None:
                return None
            try:
                return orig_process(self, value, dialect)
            except Exception as exc:
                logger.warning(
                    f"Decryption recovery: Unable to decrypt EncryptedJSON payload ({exc}). "
                    f"Recovering with empty dictionary {{}} to allow auto-healing."
                )
                return {}

        models_module.EncryptedJSON.process_result_value = safe_process_result_value


# Apply resilient decryption patch immediately upon module load
patch_resilient_encrypted_json()


class FlexibleEnum(TypeDecorator):
    """
    Bi-directional Enum TypeDecorator.
    - Resolves both member names ('FUNCTIONAL', 'CROSS_AGENCY_ICT_PROJECT') and string values ('Cross-Agency ICT Projects').
    - When binding:
      If send_name=True, binds member.name (for native PostgreSQL enums like assetstatus).
      If send_name=False, binds member.value (for VARCHAR columns like strategic_category).
    """
    impl = String(200)
    cache_ok = True

    def __init__(self, enum_cls, send_name=False, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.enum_cls = enum_cls
        self.send_name = send_name

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        if isinstance(value, self.enum_cls):
            return value.name if self.send_name else value.value
        val_str = str(value).strip()
        for member in self.enum_cls:
            if (
                member.name == val_str or 
                member.value == val_str or 
                member.name.lower() == val_str.lower() or 
                member.value.lower() == val_str.lower() or
                member.name.lower().replace("_", " ") == val_str.lower().replace("-", " ")
            ):
                return member.name if self.send_name else member.value
        return val_str

    def process_result_value(self, value, dialect):
        if value is None:
            return None
        if isinstance(value, self.enum_cls):
            return value
        val_str = str(value).strip()
        for member in self.enum_cls:
            if (
                member.value == val_str or 
                member.name == val_str or 
                member.value.lower() == val_str.lower() or 
                member.name.lower() == val_str.lower() or
                member.name.lower().replace("_", " ") == val_str.lower().replace("-", " ")
            ):
                return member
        return SafeEnumStr(value)


def patch_runtime_enum_columns():
    """
    Patches column type processors dynamically so that:
    1. VARCHAR columns storing Enum values seamlessly deserialize strings without LookupError.
    2. Native PostgreSQL Enum columns bind uppercase names so PostgreSQL never raises InvalidTextRepresentation.
    3. Re-verifies resilient EncryptedJSON patching across all mappers.
    """
    if hasattr(models_module, 'enforce_issp_singularity_and_accounting'):
        models_module.enforce_issp_singularity_and_accounting.__globals__['item_lower'] = ''

    patch_resilient_encrypted_json()

    native_enum_columns = {
        ("existing_inventory", "status"): (AssetStatus, True),
        ("issp_core", "status"): (ProposalStatus, True),
        ("issp_core", "category"): (ProposalCategory, True),
        ("issp_nodes", "node_type"): (NodeType, True),
        ("issp_nodes", "page_orientation"): (PageOrientation, True),
        ("issp_contents", "content_type"): (ContentType, True),
        ("issp_assets", "asset_role"): (AssetRole, True),
    }

    varchar_enum_columns = {
        ("users", "role_tag"): (RoleTag, False),
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
                column.type = FlexibleEnum(enum_cls, send_name=send_name)

    # Patch ORM class mappers
    for mapper in Base.registry.mappers:
        t_name = mapper.local_table.name
        for prop in mapper.column_attrs:
            for col in prop.columns:
                key = (t_name, col.name)
                if key in configs:
                    enum_cls, send_name = configs[key]
                    col.type = FlexibleEnum(enum_cls, send_name=send_name)


def is_domain_allowed(email: str) -> bool:
    allowed_domains = getattr(settings, "ALLOWED_EMAIL_DOMAINS", ["*"])
    if not allowed_domains or "*" in allowed_domains:
        return True
    if not email or "@" not in email:
        return False
    parts = email.split("@")
    if len(parts) != 2:
        return False
    domain = parts[1].strip().lower()
    return domain in [d.strip().lower() for d in allowed_domains if d.strip()]


def align_database_schemas(engine):
    """
    Defensively inspects target database tables at runtime and appends any 
    columns defined in canonical models that are physically missing.
    Converts legacy PostgreSQL enum columns to VARCHAR where canonical models expect strings.
    Actively sanitizes residual SUC/CSPC artifacts from the database.
    Expands master_narratives with DICT/Bagong Pilipinas seals and audit_trails with module tracking.
    Cleans up empty or literal string payload fields in issp_core.
    """
    logger.info("Running defensive schema alignment and data sanitization...")
    is_sqlite = "sqlite" in settings.DATABASE_URL.lower()
    bool_false = "0" if is_sqlite else "false"
    bool_true = "1" if is_sqlite else "true"
    uuid_type = "VARCHAR(36)"

    def safe_exec(connection, sql_statement, params=None):
        try:
            with connection.begin_nested():
                connection.execute(sql_statement, params or {})
        except Exception as e:
            logger.debug(f"Defensive statement note: {e}")

    with engine.begin() as conn:
        if not is_sqlite:
            try:
                conn.execute(text("""
                    SELECT pg_terminate_backend(pid) 
                    FROM pg_stat_activity 
                    WHERE datname = current_database() 
                      AND pid <> pg_backend_pid() 
                      AND state IN ('idle in transaction', 'idle in transaction (aborted)');
                """))
                conn.execute(text("SET lock_timeout = '5s';"))
            except Exception as lock_err:
                logger.debug(f"Lock configuration note: {lock_err}")

            # Clean legacy custom operators
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

            # Convert users.role_tag from ENUM to VARCHAR(100)
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

            # Convert issp_core.system_development_status to VARCHAR(100)
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

            # Convert master_narratives.scope_choice to VARCHAR(100)
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

        # Normalize corrupt or empty string payload columns
        safe_exec(conn, text("""
            UPDATE issp_core 
            SET payload = '{}' 
            WHERE payload IS NULL OR payload = '' OR payload = 'null' OR payload = 'None';
        """))

        # ACTIVE DATA SANITIZATION: Overwrite stale SUC/CSPC values in DB tables safely
        clean_head_title = settings.DEFAULT_AGENCY_HEAD_TITLE.replace("'", "''")
        clean_website = settings.DEFAULT_AGENCY_WEBSITE.replace("'", "''")
        clean_agency_name = settings.DEFAULT_AGENCY_NAME.replace("'", "''")

        safe_exec(conn, text(f"""
            UPDATE master_narratives 
            SET agency_head_position = '{clean_head_title}' 
            WHERE agency_head_position ILIKE '%president%' OR agency_head_position ILIKE '%suc%' OR agency_head_position IS NULL;
        """))
        safe_exec(conn, text(f"""
            UPDATE master_narratives 
            SET agency_website_url = '{clean_website}' 
            WHERE agency_website_url ILIKE '%cspc.edu.ph%' OR agency_website_url IS NULL;
        """))
        safe_exec(conn, text(f"""
            UPDATE master_narratives 
            SET agency_name = '{clean_agency_name}' 
            WHERE agency_name ILIKE '%cspc%' OR agency_name ILIKE '%polytechnic%' OR agency_name IS NULL;
        """))
        safe_exec(conn, text("""
            UPDATE egovernment_checklists 
            SET equivalent_system_details = 'Not applicable (National Government Agency)' 
            WHERE equivalent_system_details ILIKE '%suc%' OR equivalent_system_details ILIKE '%college%';
        """))
        safe_exec(conn, text("""
            UPDATE network_infrastructures 
            SET office_location = 'Central Office' 
            WHERE office_location ILIKE '%nabua%' OR office_location ILIKE '%buhi%';
        """))
        safe_exec(conn, text("""
            UPDATE network_infrastructures 
            SET topology_description = 'Core fiber optic distribution backbone connecting administrative, operational, and public assistance divisions.' 
            WHERE topology_description ILIKE '%academic%' OR topology_description ILIKE '%laboratories%';
        """))

        inspector = inspect(conn)
        table_names = inspector.get_table_names()

        # 1. Patch 'master_narratives' table
        if "master_narratives" in table_names:
            narrative_cols = [c['name'] for c in inspector.get_columns('master_narratives')]
            columns_to_sync_narrative = {
                "agency_name": "VARCHAR(255)",
                "agency_website_url": "VARCHAR(255)",
                "agency_logo_url": "VARCHAR(500)",
                "dict_logo_url": "VARCHAR(500)",
                "bagong_pilipinas_logo_url": "VARCHAR(500)",
                "cert_logo_url": "VARCHAR(500)",
                "is_amendment": f"BOOLEAN DEFAULT {bool_false}",
                "amendment_number": "VARCHAR(50)",
                "scope_choice": "VARCHAR(100) DEFAULT 'Department-Wide'",
                "scope_json": "JSON DEFAULT '{}'",
                "cio_organizational_unit": "VARCHAR(200)",
                "agency_head_position": f"VARCHAR(200) DEFAULT '{clean_head_title}'",
                "drbcp_approval_date": "VARCHAR(100)",
                "functions": "TEXT",
                "focal_name": "VARCHAR(200)",
                "focal_position": "VARCHAR(200)",
                "focal_organizational_unit": "VARCHAR(200)",
                "focal_email": "VARCHAR(255)",
                "focal_contact_no": "VARCHAR(100)",
                "authoring_cycle_duration": "INTEGER DEFAULT 3",
                "org_chart_url": "VARCHAR(500)",
                "fiber_backbone_url": "VARCHAR(500)",
                "system_architecture_url": "VARCHAR(500)",
                "network_diagram_url": "VARCHAR(500)",
                "proposed_ict_org_url": "VARCHAR(500)",
                "subsystem_network_layouts_json": "JSON DEFAULT '[]'",
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
                "enterprise_architecture_narrative": "TEXT",
                "drbcp_affected_assets_json": "JSON DEFAULT '[]'",
                "drbcp_recovery_strategy_html": "TEXT",
                "drbcp_sop_phases_html": "TEXT",
                "drbcp_compliance_narrative_html": "TEXT",
                "is_archived": f"BOOLEAN DEFAULT {bool_false}",
                "final_pdf_vault_url": "VARCHAR(500)"
            }
            for col_name, col_def in columns_to_sync_narrative.items():
                if col_name not in narrative_cols:
                    logger.info(f"Defensive Sync: Appending missing column '{col_name}' to 'master_narratives'.")
                    safe_exec(conn, text(f"ALTER TABLE master_narratives ADD COLUMN {col_name} {col_def}"))

        # 2. Patch 'organizational_outcomes' table
        if "organizational_outcomes" in table_names:
            oo_cols = [c['name'] for c in inspector.get_columns('organizational_outcomes')]
            columns_to_sync_oo = {
                "issp_period": "VARCHAR(50) DEFAULT '2026-2028'",
                "type_label": "VARCHAR(50) DEFAULT 'Organizational Outcome'",
                "outcome_name": "VARCHAR(255)",
                "program_name": "VARCHAR(255)",
                "description": "TEXT"
            }
            for col_name, col_def in columns_to_sync_oo.items():
                if col_name not in oo_cols:
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
                    safe_exec(conn, text(f"ALTER TABLE strategic_concerns ADD COLUMN {col_name} {col_def}"))

        # 4. Patch 'ict_projects' table
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
                    safe_exec(conn, text(f"ALTER TABLE ict_projects ADD COLUMN {col_name} {col_def}"))

        # 5. Patch 'issp_core' table
        if "issp_core" in table_names:
            core_cols_map = {c['name']: str(c['type']).upper() for c in inspector.get_columns('issp_core')}
            columns_to_sync_core = {
                "project_id": f"{uuid_type}",
                "item_key": "VARCHAR(100)",
                "strategic_category": "VARCHAR(100) DEFAULT 'Office Productivity'",
                "office_location": "VARCHAR(100) DEFAULT 'Central Office'",
                "fund_source": "VARCHAR(100) DEFAULT 'General Appropriations Act (GAA)'",
                "uacs_object_code": "VARCHAR(150) DEFAULT '50604050 03 - ICT Equipment (CO)'",
                "expenditure_class": "VARCHAR(100) DEFAULT 'Capital Outlay'",
                "year_1_qty": "INTEGER DEFAULT 0",
                "year_2_qty": "INTEGER DEFAULT 0",
                "year_3_qty": "INTEGER DEFAULT 0",
                "is_archived": f"BOOLEAN DEFAULT {bool_false}",
                "category": "VARCHAR(50) DEFAULT 'Hardware'",
                "created_by_students": f"BOOLEAN DEFAULT {bool_false}",
                "target_office_automated": "VARCHAR(200)",
                "system_development_status": "VARCHAR(100) DEFAULT 'N/A'",
                "total_cost": "NUMERIC(15, 2) DEFAULT 0.00",
                "outcome_id": "INTEGER",
                "canvas_expiration_date": "TIMESTAMP NULL",
                "is_expansion": f"BOOLEAN DEFAULT {bool_false}",
                "needs_assessment_id": f"{uuid_type}"
            }
            for col_name, col_def in columns_to_sync_core.items():
                if col_name not in core_cols_map:
                    safe_exec(conn, text(f"ALTER TABLE issp_core ADD COLUMN {col_name} {col_def}"))

        # 6. Patch 'existing_inventory' table
        if "existing_inventory" in table_names:
            inv_cols = [c['name'] for c in inspector.get_columns('existing_inventory')]
            columns_to_sync_inv = {
                "exact_model": "VARCHAR(200)",
                "specs": "TEXT",
                "date_acquired": "TIMESTAMP DEFAULT CURRENT_TIMESTAMP",
                "acquired_price": "NUMERIC(15, 2) DEFAULT 0.00",
                "office_location": "VARCHAR(100) DEFAULT 'Central Office'",
                "is_central_office": f"BOOLEAN DEFAULT {bool_true}",
                "is_end_of_life": f"BOOLEAN DEFAULT {bool_false}",
                "is_backup": f"BOOLEAN DEFAULT {bool_false}",
                "is_software": f"BOOLEAN DEFAULT {bool_false}",
                "is_perpetual": f"BOOLEAN DEFAULT {bool_true}",
                "unserviceable_report_url": "VARCHAR(500)",
                "dict_category": "VARCHAR(100)",
                "other_category_name": "VARCHAR(200)"
            }
            for col_name, col_def in columns_to_sync_inv.items():
                if col_name not in inv_cols:
                    safe_exec(conn, text(f"ALTER TABLE existing_inventory ADD COLUMN {col_name} {col_def}"))

        # 7. Patch 'information_systems' table
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
                    safe_exec(conn, text(f"ALTER TABLE information_systems ADD COLUMN {col_name} {col_def}"))

        # 8. Patch 'needs_assessments' table (Section 8.0 Aggregation & Provenance)
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

        # 9. Patch 'audit_trails' table
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


def seed_document_hierarchy(db):
    """
    Seeds the self-referencing document tree matching DICT ISSP v.2026 Table of Contents (Pages 2-4).
    """
    logger.info("Initializing DICT compliance document tree seeding...")

    agency_title = f"{settings.DEFAULT_AGENCY_NAME} ISSP"

    tree_structure = [
        {"key": "root_document", "type": NodeType.ROOT, "parent": None, "seq": "1.000", "title": agency_title, "toc": "ISSP Document Root", "break": False, "orient": PageOrientation.LANDSCAPE},
        {"key": "glossary", "type": NodeType.LEAF, "parent": "root_document", "seq": "1.100", "title": "Definition of Terms", "toc": "Definition of Terms", "break": True, "orient": PageOrientation.LANDSCAPE},
        {"key": "part_1", "type": NodeType.PART, "parent": "root_document", "seq": "2.000", "title": "PART I. AGENCY PROFILE & STRATEGIC CONTEXT", "toc": "PART I. AGENCY PROFILE & STRATEGIC CONTEXT", "break": True, "orient": PageOrientation.LANDSCAPE},
        {"key": "part_1_a", "type": NodeType.SECTION, "parent": "part_1", "seq": "2.100", "title": "A. Mandate, Vision, Mission, and Organizational Outcome", "toc": "A. Mandate, Vision, Mission, and Organizational Outcome", "break": False, "orient": PageOrientation.LANDSCAPE},
        {"key": "part_1_b", "type": NodeType.SECTION, "parent": "part_1", "seq": "2.200", "title": "B. Organizational Structure", "toc": "B. Organizational Structure", "break": False, "orient": PageOrientation.LANDSCAPE},
        {"key": "part_1_c", "type": NodeType.SECTION, "parent": "part_1", "seq": "2.300", "title": "C. Stakeholder Analysis", "toc": "C. Stakeholder Analysis", "break": False, "orient": PageOrientation.LANDSCAPE},
        {"key": "part_2", "type": NodeType.PART, "parent": "root_document", "seq": "3.000", "title": "PART II. CURRENT ICT ASSESSMENT", "toc": "PART II. CURRENT ICT ASSESSMENT", "break": True, "orient": PageOrientation.LANDSCAPE},
        {"key": "part_2_a", "type": NodeType.SECTION, "parent": "part_2", "seq": "3.100", "title": "A. Strategic Concerns for ICT Use", "toc": "A. Strategic Concerns for ICT Use", "break": False, "orient": PageOrientation.LANDSCAPE},
        {"key": "part_2_b", "type": NodeType.SECTION, "parent": "part_2", "seq": "3.200", "title": "B. Existing Network Infrastructure & Cybersecurity Controls", "toc": "B. Existing Network Infrastructure", "break": False, "orient": PageOrientation.LANDSCAPE},
        {"key": "part_2_c", "type": NodeType.SECTION, "parent": "part_2", "seq": "3.300", "title": "C. Existing/Operational Information Systems (IS) Inventory", "toc": "C. Existing/Operational Information Systems Inventory", "break": False, "orient": PageOrientation.LANDSCAPE},
        {"key": "part_2_d", "type": NodeType.SECTION, "parent": "part_2", "seq": "3.400", "title": "D. E-Government Programs (EGP) Checklist", "toc": "D. E-Government Programs Checklist", "break": False, "orient": PageOrientation.LANDSCAPE},
        {"key": "part_3", "type": NodeType.PART, "parent": "root_document", "seq": "4.000", "title": "PART III. PROPOSED ICT STRATEGY", "toc": "PART III. PROPOSED ICT STRATEGY", "break": True, "orient": PageOrientation.LANDSCAPE},
        {"key": "part_3_a", "type": NodeType.SECTION, "parent": "part_3", "seq": "4.100", "title": "A. Proposed Network Infrastructure & Cybersecurity Controls", "toc": "A. Proposed Network Infrastructure", "break": False, "orient": PageOrientation.LANDSCAPE},
        {"key": "part_3_b", "type": NodeType.SECTION, "parent": "part_3", "seq": "4.200", "title": "B. Enterprise Architecture", "toc": "B. Enterprise Architecture", "break": False, "orient": PageOrientation.LANDSCAPE},
        {"key": "part_3_c", "type": NodeType.SECTION, "parent": "part_3", "seq": "4.300", "title": "C. Proposed ICT Human Capital", "toc": "C. Proposed ICT Human Capital", "break": False, "orient": PageOrientation.LANDSCAPE},
        {"key": "part_3_d", "type": NodeType.SECTION, "parent": "part_3", "seq": "4.400", "title": "D. Proposed Information Systems", "toc": "D. Proposed Information Systems", "break": False, "orient": PageOrientation.LANDSCAPE},
        {"key": "part_3_e", "type": NodeType.SECTION, "parent": "part_3", "seq": "4.500", "title": "E. ICT Projects", "toc": "E. ICT Projects", "break": False, "orient": PageOrientation.LANDSCAPE},
        {"key": "part_3_e1", "type": NodeType.SUBSECTION, "parent": "part_3_e", "seq": "4.510", "title": "E.1. Internal ICT Projects", "toc": "E.1. Internal ICT Projects", "break": False, "orient": PageOrientation.LANDSCAPE},
        {"key": "part_3_e2", "type": NodeType.SUBSECTION, "parent": "part_3_e", "seq": "4.520", "title": "E.2. Cross-Agency ICT Projects", "toc": "E.2. Cross-Agency ICT Projects", "break": False, "orient": PageOrientation.LANDSCAPE},
        {"key": "part_3_f", "type": NodeType.SECTION, "parent": "part_3", "seq": "4.600", "title": "F. Performance Measurement Framework", "toc": "F. Performance Measurement Framework", "break": False, "orient": PageOrientation.LANDSCAPE},
        {"key": "part_3_f1", "type": NodeType.SUBSECTION, "parent": "part_3_f", "seq": "4.610", "title": "F.1. Internal ICT Projects", "toc": "F.1. Internal ICT Projects", "break": False, "orient": PageOrientation.LANDSCAPE},
        {"key": "part_3_f2", "type": NodeType.SUBSECTION, "parent": "part_3_f", "seq": "4.620", "title": "F.2. Cross-Agency ICT Projects", "toc": "F.2. Cross-Agency ICT Projects", "break": False, "orient": PageOrientation.LANDSCAPE},
        {"key": "part_4", "type": NodeType.PART, "parent": "root_document", "seq": "5.000", "title": "PART IV. RESOURCE REQUIREMENTS", "toc": "PART IV. RESOURCE REQUIREMENTS", "break": True, "orient": PageOrientation.LANDSCAPE},
        {"key": "part_4_a", "type": NodeType.SECTION, "parent": "part_4", "seq": "5.100", "title": "A. Detailed Resource Deployment and Cost Breakdown", "toc": "A. Detailed Resource Deployment", "break": False, "orient": PageOrientation.LANDSCAPE},
        {"key": "part_4_b", "type": NodeType.SECTION, "parent": "part_4", "seq": "5.200", "title": "B. Summary of Investments (Four-Way Parity)", "toc": "B. Summary of Investments", "break": False, "orient": PageOrientation.LANDSCAPE},
        {"key": "annex_1", "type": NodeType.PART, "parent": "root_document", "seq": "6.000", "title": "ANNEX 1: EXISTING INFORMATION & COMMUNICATIONS TECHNOLOGY (ICT) ASSET INVENTORY", "toc": "ANNEX 1: EXISTING ICT ASSET INVENTORY", "break": True, "orient": PageOrientation.LANDSCAPE},
        {"key": "annex_2", "type": NodeType.PART, "parent": "root_document", "seq": "7.000", "title": "ANNEX 2: DISASTER RECOVERY AND BUSINESS CONTINUITY PLAN (DRBCP)", "toc": "ANNEX 2: DISASTER RECOVERY AND BUSINESS CONTINUITY PLAN", "break": True, "orient": PageOrientation.LANDSCAPE}
    ]

    node_instances = {}
    for item in tree_structure:
        node = db.query(IsspNode).filter(IsspNode.system_key == item["key"]).first()
        parent_id = node_instances.get(item["parent"]).id if item["parent"] and item["parent"] in node_instances else None
        
        if not node:
            node = IsspNode(
                parent_id=parent_id,
                node_type=item["type"],
                system_key=item["key"],
                sequence_order=Decimal(item["seq"]),
                page_orientation=item["orient"],
                force_page_break=item["break"]
            )
            db.add(node)
            db.flush()
            db.add(IsspVocabulary(
                node_id=node.id,
                display_title=item["title"],
                toc_label=item["toc"]
            ))
            db.flush()
        node_instances[item["key"]] = node

    db.flush()


def bootstrap_metadata(db):
    """
    Seeds the complete singular relational graph across Parts I, II, III, IV, and Annexes.
    Guarantees strict four-way financial parity and dynamic provenance without SUC hardcoding.
    Includes DICT logo and Bagong Pilipinas seal configuration hooks.
    """
    baseline_period = getattr(settings, "DEFAULT_ISSP_CYCLE", "2026-2028")
    agency_name = getattr(settings, "DEFAULT_AGENCY_NAME", "Department of Information and Communications Technology")
    agency_website = getattr(settings, "DEFAULT_AGENCY_WEBSITE", "https://dict.gov.ph")
    head_title = getattr(settings, "DEFAULT_AGENCY_HEAD_TITLE", "Secretary")

    allowed_domains = getattr(settings, "ALLOWED_EMAIL_DOMAINS", ["*"])
    seed_domain = "agency.gov.ph"
    for d in allowed_domains:
        if d and d != "*":
            seed_domain = d.strip().lower()
            break

    logger.info(f"Purging any legacy university campus artifacts...")
    legacy_campuses = db.query(Campus).filter(
        or_(
            Campus.name.ilike('%nabua%'),
            Campus.name.ilike('%buhi%'),
            Campus.code.ilike('%cspc%')
        )
    ).all()
    for lc in legacy_campuses:
        db.delete(lc)
    db.flush()

    logger.info(f"Seeding organizational operational facilities for {agency_name}...")
    campuses_to_seed = [
        {"name": "Central Office / National Headquarters", "location": "National Capital Region (NCR), Philippines", "code": "CO-NCR"},
        {"name": "Regional Operations Center / Field Office", "location": "Regional Administrative Center, Philippines", "code": "RO-FIELD"}
    ]
    campus_instances = {}
    for camp_data in campuses_to_seed:
        campus = db.query(Campus).filter(Campus.code == camp_data["code"]).first()
        if not campus:
            campus = Campus(**camp_data)
            db.add(campus)
            db.flush()
        campus_instances[camp_data["code"]] = campus

    for c in db.query(Campus).all():
        campus_instances[c.code] = c

    logger.info("Seeding institutional administrative and operational divisions...")
    departments_to_seed = [
        "Information and Communications Technology Division (ICTD)",
        "Administrative and Financial Management Service",
        "Planning, Policy, and Monitoring Division",
        "Public Frontline Services and Operations Division",
        "Human Resource Development Division",
        "Accounting and Financial Management Office",
        "Procurement and Property Management Office",
        "Legal and Regulatory Affairs Service",
        "Internal Audit and Compliance Division"
    ]
    dept_instances = {}
    main_campus = campus_instances["CO-NCR"]
    for name in departments_to_seed:
        dept = db.query(Department).filter(Department.name == name).first()
        if not dept:
            dept = Department(name=name, campus_id=main_campus.id)
            db.add(dept)
            db.flush()
        dept_instances[name] = dept

    ict_dept = dept_instances["Information and Communications Technology Division (ICTD)"]
    operations_dept = dept_instances["Public Frontline Services and Operations Division"]
    admin_dept = dept_instances["Administrative and Financial Management Service"]
    hr_dept = dept_instances["Human Resource Development Division"]

    # -------------------------------------------------------------
    # 0. REFERENCE CATALOG ITEMS (Pre-Approved Procurement)
    # -------------------------------------------------------------
    logger.info("Seeding standard reference pricing catalog...")
    catalog_items = [
        {
            "item_key": "pc_standard",
            "display_name": "Standard Administrative Desktop Workstation",
            "standard_unit_cost": Decimal("35000.00"),
            "category": "computing_devices",
            "is_active": True,
            "allowed_offices": ["Information and Communications Technology Division (ICTD)", "Public Frontline Services and Operations Division", "Accounting and Financial Management Office"]
        },
        {
            "item_key": "laptop_enterprise",
            "display_name": "High-Performance Mobile Workstation Laptop",
            "standard_unit_cost": Decimal("70000.00"),
            "category": "computing_devices",
            "is_active": True,
            "allowed_offices": ["Information and Communications Technology Division (ICTD)", "Planning, Policy, and Monitoring Division", "Public Frontline Services and Operations Division"]
        },
        {
            "item_key": "switch_core",
            "display_name": "24-Port Managed Core Gigabit PoE+ Switch",
            "standard_unit_cost": Decimal("75000.00"),
            "category": "networking",
            "is_active": True,
            "allowed_offices": ["Information and Communications Technology Division (ICTD)"]
        },
        {
            "item_key": "printer_laser",
            "display_name": "Heavy-Duty Multifunction Network Laser Printer",
            "standard_unit_cost": Decimal("45000.00"),
            "category": "printers_imaging",
            "is_active": True,
            "allowed_offices": ["Public Frontline Services and Operations Division", "Procurement and Property Management Office", "Accounting and Financial Management Office"]
        },
        {
            "item_key": "office_suite_cloud",
            "display_name": "Office Productivity Suite Cloud Subscription",
            "standard_unit_cost": Decimal("8500.00"),
            "category": "software",
            "is_active": True,
            "allowed_offices": []
        }
    ]
    for ci in catalog_items:
        if not db.query(CatalogItem).filter(CatalogItem.item_key == ci["item_key"]).first():
            db.add(CatalogItem(**ci))
    db.flush()

    # -------------------------------------------------------------
    # 1. MASTER NARRATIVE & SIGNATORIES (Part I.A & I.B & Annex 2)
    # -------------------------------------------------------------
    logger.info("Seeding Master Narrative coversheet with DICT co-branding...")
    narrative = db.query(MasterNarrative).filter(MasterNarrative.issp_period == baseline_period).first()
    
    ea_default_text = (
        f"The proposed Enterprise Architecture of {agency_name} rationalizes disparate legacy platforms and siloed databases "
        "into microservices containerized on GovCloud, utilizing PeGIF-compliant API gateways to establish automated "
        "interoperability with national oversight agencies, citizen service portals, and online payment gateways."
    )
    drbcp_affected_assets_default = [
        {"asset_group": "Primary Data Center (Central Office)", "details": "10 Physical Enterprise Servers, 2 SAN Storage Units, Core Gigabit Distribution Switches."},
        {"asset_group": "Connectivity", "details": "200Mbps Dedicated Leased Line Fiber; Redundant GovNet Optical Fiber Link."},
        {"asset_group": "Data Assets", "details": "National Citizen Service Databases, Transactional Registries, 5TB of digitized institutional archives."},
        {"asset_group": "Power Utilities", "details": "100kVA Automatic Standby Generator Set; 3 x 10kVA Online Double-Conversion Rackmount UPS Units."}
    ]
    drbcp_recovery_strategy_default = (
        "<ol>"
        "<li><strong>Off-site Backup Management:</strong> Daily encrypted database snapshots are transferred to a secure secondary facility located >30km away.</li>"
        "<li><strong>Cloud Failover (GovCloud):</strong> Mission-critical public service, registry, and e-payment microservices are replicated in real time to DICT GovCloud.</li>"
        "<li><strong>Redundancy:</strong> Dual-ISP providers configured in active-passive load distribution preventing single points of failure.</li>"
        "<li><strong>Data Synchronization:</strong> Asynchronous database replication ensures an RPO limit of 1 hour during operational disruptions.</li>"
        "</ol>"
    )
    drbcp_sop_phases_default = (
        "<p><strong>Phase I: Detection and Declaration:</strong> Automated monitoring alerts evaluate disaster scale; Incident Commander activates DRBCP within 1 hour if localized RTO cannot be maintained.</p>"
        "<p><strong>Phase II: Activation and Execution:</strong> DRT redirected to GovCloud DR standby instance; DNS records updated; clean database backups verified and mounted.</p>"
        "<p><strong>Phase III: Failback (Normal Operations):</strong> Primary data center infrastructure restored; synchronize transactional state delta from DR site during off-peak maintenance window.</p>"
    )
    drbcp_compliance_narrative_default = (
        "<ul style=\"font-size: 8.5pt; line-height: 1.6; margin-bottom: 10px;\">"
        "<li><strong>Cybersecurity Integration:</strong> The DRBCP incorporates cyber-recovery procedures to isolate corrupted environments and restore clean backups following ransomware or data-tampering events.</li>"
        "<li><strong>Testing and Maintenance:</strong> Mandates at least one (1) comprehensive full-scale DR simulation exercise per year and semi-annual tabletop walkthroughs.</li>"
        "<li><strong>Audit and Review:</strong> The DRBCP is formally reviewed annually or whenever a major infrastructure migration occurs.</li>"
        "<li><strong>UACS and Budgeting:</strong> Funding for off-site storage, GovCloud mirror subscriptions, and standby infrastructure is categorized under Continuing Costs in Part IV of the ISSP.</li>"
        "</ul>"
    )

    if not narrative:
        narrative = MasterNarrative(
            issp_period=baseline_period,
            agency_name=agency_name,
            issp_period_from=2026,
            issp_period_to=2028,
            agency_website_url=agency_website,
            agency_logo_url=None,
            dict_logo_url=None,
            bagong_pilipinas_logo_url=None,
            cert_logo_url=None,
            is_active=True,
            is_amendment=False,
            amendment_number=None,
            scope_choice=ScopeChoice.DEPARTMENT_WIDE,
            scope_json={"with_regional_offices": True, "with_bureaus": False},
            mandate_html=f"The mandate of {agency_name} is established under its enabling statutory charter to provide progressive leadership in administrative governance, national policy formulation, and citizen frontline service delivery.",
            functions="Deliver efficient public services to citizens and stakeholders; execute regulatory and monitoring responsibilities; formulate national development policies; and uphold digital transformation across all institutional operations.",
            vision_html="A digitally empowered, transparent, and resilient public institution delivering world-class public service for all citizens.",
            mission_html="To provide accountable, citizen-centric, and accessible digital governance through strategic technological modernization and innovation.",
            present_situation_html="Frontline service workflows and legacy registries face transaction sync latency during peak public access periods. Cloud virtualization, microservices containerization, and automated GovCloud real-time failover are prioritized for implementation.",
            enterprise_architecture_narrative=ea_default_text,
            drbcp_affected_assets_json=drbcp_affected_assets_default,
            drbcp_recovery_strategy_html=drbcp_recovery_strategy_default,
            drbcp_sop_phases_html=drbcp_sop_phases_default,
            drbcp_compliance_narrative_html=drbcp_compliance_narrative_default,
            subsystem_network_layouts_json=[],
            is_archived=False,
            final_pdf_vault_url=None,
            signatory_prepared_by="Chief Information Officer",
            preparer_position="Director, ICT Management Office",
            cio_organizational_unit="ICT Management Service",
            preparer_tel="09190000000",
            preparer_email=f"cio@{seed_domain}",
            focal_name="Alternate Focal Person",
            focal_position="Chief, Planning and Governance Division",
            focal_organizational_unit="Planning and Monitoring Service",
            focal_email=f"focal@{seed_domain}",
            focal_contact_no="09300000000",
            signatory_approved_by=head_title,
            agency_head_position=head_title,
            drbcp_approval_date="March 15, 2026",
            annual_ict_budget=Decimal("45000000.00"),
            planners_json=[],
            major_final_outputs=[],
            strategic_concerns_json=[],
            systems_json=[],
            databases_json=[],
            internal_projects_json=[],
            cross_projects_json=[],
            pmf_matrix_json=[],
            mithi_special_solutions=[],
            mithi_hardware_inventory=[],
            implementation_schedules=[]
        )
        db.add(narrative)
        db.flush()
    else:
        # Actively overwrite any stale legacy SUC/CSPC values
        if "cspc" in (narrative.agency_name or "").lower() or not narrative.agency_name:
            narrative.agency_name = agency_name
        if "cspc" in (narrative.agency_website_url or "").lower() or not narrative.agency_website_url:
            narrative.agency_website_url = agency_website
        if "president" in (narrative.agency_head_position or "").lower() or "suc" in (narrative.agency_head_position or "").lower():
            narrative.agency_head_position = head_title
        if "cspc" in (narrative.preparer_email or "").lower():
            narrative.preparer_email = f"cio@{seed_domain}"
        if "cspc" in (narrative.focal_email or "").lower():
            narrative.focal_email = f"focal@{seed_domain}"
        if "cspc" in (narrative.signatory_approved_by or "").lower():
            narrative.signatory_approved_by = head_title
            
        if not getattr(narrative, 'enterprise_architecture_narrative', None):
            narrative.enterprise_architecture_narrative = ea_default_text
        if not getattr(narrative, 'drbcp_affected_assets_json', None):
            narrative.drbcp_affected_assets_json = drbcp_affected_assets_default
        if not getattr(narrative, 'drbcp_recovery_strategy_html', None):
            narrative.drbcp_recovery_strategy_html = drbcp_recovery_strategy_default
        if not getattr(narrative, 'drbcp_sop_phases_html', None):
            narrative.drbcp_sop_phases_html = drbcp_sop_phases_default
        if hasattr(narrative, 'drbcp_compliance_narrative_html') and not getattr(narrative, 'drbcp_compliance_narrative_html', None):
            setattr(narrative, 'drbcp_compliance_narrative_html', drbcp_compliance_narrative_default)
        if hasattr(narrative, 'drbcp_approval_date') and not getattr(narrative, 'drbcp_approval_date', None):
            setattr(narrative, 'drbcp_approval_date', "March 15, 2026")
        db.flush()

    # -------------------------------------------------------------
    # 2. ORGANIZATIONAL OUTCOMES (Part I.A.4 Broader Scope)
    # -------------------------------------------------------------
    logger.info("Seeding Organizational Outcomes (Part I.A.4 Broader Scope)...")
    outcomes_to_seed = [
        {
            "outcome_name": "Citizen Frontline Public Services Program", 
            "type_label": "Organizational Outcome", 
            "description": "To provide quality, prompt, accessible, and automated public service delivery to citizens and institutional stakeholders."
        },
        {
            "outcome_name": "General Administration and Support (GAS)", 
            "type_label": "Organizational Outcome", 
            "description": "To ensure transparent, efficient, automated, and audited administrative governance and resource management."
        },
        {
            "outcome_name": "Policy Formulation, Monitoring, and Research Program", 
            "type_label": "Organizational Outcome", 
            "description": "To formulate strategic sector policies, conduct applied regulatory studies, and monitor national governance frameworks."
        },
        {
            "outcome_name": "Community and Regional Development Extension Program", 
            "type_label": "Major Final Output", 
            "description": "To deploy technical assistance, capacity development, and regional extension initiatives nationwide."
        }
    ]
    outcome_instances = {}
    for out_data in outcomes_to_seed:
        outcome = db.query(OrganizationalOutcome).filter(
            OrganizationalOutcome.outcome_name == out_data["outcome_name"],
            OrganizationalOutcome.issp_period == baseline_period
        ).first()
        if not outcome:
            outcome = OrganizationalOutcome(
                issp_period=baseline_period,
                program_name=out_data["outcome_name"],
                **out_data
            )
            db.add(outcome)
            db.flush()
        else:
            if not outcome.program_name and outcome.outcome_name:
                outcome.program_name = outcome.outcome_name
            db.flush()
        outcome_instances[out_data["outcome_name"]] = outcome

    oo_frontline = outcome_instances["Citizen Frontline Public Services Program"]
    oo_gas = outcome_instances["General Administration and Support (GAS)"]
    oo_policy = outcome_instances["Policy Formulation, Monitoring, and Research Program"]
    oo_ext = outcome_instances["Community and Regional Development Extension Program"]

    # Purge any legacy/orphaned outcomes from previous seed versions
    canonical_outcome_names = {o["outcome_name"] for o in outcomes_to_seed}
    legacy_outcomes = db.query(OrganizationalOutcome).filter(
        OrganizationalOutcome.issp_period == baseline_period,
        ~OrganizationalOutcome.outcome_name.in_(canonical_outcome_names)
    ).all()
    for lout in legacy_outcomes:
        db.query(Proposal).filter(
            Proposal.issp_period == baseline_period,
            Proposal.outcome_id == lout.id
        ).update({"outcome_id": oo_gas.id}, synchronize_session=False)
        db.delete(lout)
    db.flush()

    # -------------------------------------------------------------
    # 4. STAKEHOLDER ANALYSIS (Part I.C)
    # -------------------------------------------------------------
    logger.info("Seeding Stakeholder Analysis (Part I.C)...")
    db.query(StakeholderAnalysis).filter(
        StakeholderAnalysis.issp_period == baseline_period,
        StakeholderAnalysis.stakeholder_group.ilike('%test%')
    ).delete(synchronize_session=False)
    db.flush()

    if db.query(StakeholderAnalysis).filter(StakeholderAnalysis.issp_period == baseline_period).count() == 0:
        stakeholders_list = [
            StakeholderAnalysis(
                issp_period=baseline_period,
                stakeholder_group="General Citizens and Service Applicants",
                transaction_processed_incoming="Online Service Inquiries, Application Submissions, and Electronic Fee Settlement",
                complexity_incoming="Simple",
                transaction_processed_outgoing="Official E-Certificates, Regulatory Clearances, and Validated Service Statements",
                complexity_outgoing="Simple"
            ),
            StakeholderAnalysis(
                issp_period=baseline_period,
                stakeholder_group="Institutional Staff and Department Directors",
                transaction_processed_incoming="Budget Allotment Requests, Operational Activity Filings, and Personnel Clearances",
                complexity_incoming="Complex",
                transaction_processed_outgoing="Disbursement Authorizations, Compliance Endorsements, and Performance Certifications",
                complexity_outgoing="Simple"
            ),
            StakeholderAnalysis(
                issp_period=baseline_period,
                stakeholder_group="National Oversight and Regulatory Agencies (DICT, DBM, COA)",
                transaction_processed_incoming="Statutory Audit Inquiries, Mandate Compliance Verification, and Circular Reviews",
                complexity_incoming="Highly Technical",
                transaction_processed_outgoing="Institutional Alignment Metrics, UACS Audit Reports, and Public Service Scorecards",
                complexity_outgoing="Highly Technical"
            )
        ]
        db.add_all(stakeholders_list)
        db.flush()

    # -------------------------------------------------------------
    # 5. STRATEGIC CONCERNS (Part II.A)
    # -------------------------------------------------------------
    logger.info("Seeding Strategic Concerns (Part II.A)...")
    sc1 = db.query(StrategicConcern).filter(
        StrategicConcern.issp_period == baseline_period,
        StrategicConcern.critical_system == "Citizen Frontline Registry and Electronic Payment System"
    ).first()
    if not sc1:
        sc1 = StrategicConcern(
            issp_period=baseline_period,
            outcome_id=oo_frontline.id,
            mfo="Citizen Frontline Public Services Program",
            critical_system="Citizen Frontline Registry and Electronic Payment System",
            problems="Peak public transaction registration latency exceeding 72 hours and occasional server timeouts during service application surges.",
            intended_use="Deploy containerized microservices on GovCloud with automated digital payment gateway integration via eGovPay.",
            order_index=1
        )
        db.add(sc1)
        db.flush()

    sc2 = db.query(StrategicConcern).filter(
        StrategicConcern.issp_period == baseline_period,
        StrategicConcern.critical_system == "Enterprise Document Tracking and Knowledge Management System"
    ).first()
    if not sc2:
        sc2 = StrategicConcern(
            issp_period=baseline_period,
            outcome_id=oo_gas.id,
            mfo="General Administration and Support (GAS)",
            critical_system="Enterprise Document Tracking and Knowledge Management System",
            problems="Manual document routing and lack of centralized electronic records repository for institutional decision-makers.",
            intended_use="Web-based electronic document tracking platform with single-sign-on identity federation and audit trail verification.",
            order_index=2
        )
        db.add(sc2)
        db.flush()

    sc3 = db.query(StrategicConcern).filter(
        StrategicConcern.issp_period == baseline_period,
        StrategicConcern.critical_system == "Policy Research and Statistical Analytics Repository"
    ).first()
    if not sc3:
        sc3 = StrategicConcern(
            issp_period=baseline_period,
            outcome_id=oo_policy.id,
            mfo="Policy Formulation, Monitoring, and Research Program",
            critical_system="Policy Research and Statistical Analytics Repository",
            problems="Siloed archival of policy research outputs and lack of centralized statistical indexation for government analysts.",
            intended_use="Deploy cloud-hosted open-access policy data repository with standardized metadata and public API endpoints.",
            order_index=3
        )
        db.add(sc3)
        db.flush()

    sc4 = db.query(StrategicConcern).filter(
        StrategicConcern.issp_period == baseline_period,
        StrategicConcern.critical_system == "Community Assistance and Regional Extension Information System"
    ).first()
    if not sc4:
        sc4 = StrategicConcern(
            issp_period=baseline_period,
            outcome_id=oo_ext.id,
            mfo="Community and Regional Development Extension Program",
            critical_system="Community Assistance and Regional Extension Information System",
            problems="Paper-based tracking of regional extension beneficiaries and technical assistance programs across regional offices.",
            intended_use="Web-based regional portal for automated community beneficiary profiling and measurable impact analytics.",
            order_index=4
        )
        db.add(sc4)
        db.flush()

    canonical_concern_systems = {
        "Citizen Frontline Registry and Electronic Payment System",
        "Enterprise Document Tracking and Knowledge Management System",
        "Policy Research and Statistical Analytics Repository",
        "Community Assistance and Regional Extension Information System"
    }
    legacy_concerns = db.query(StrategicConcern).filter(
        StrategicConcern.issp_period == baseline_period,
        ~StrategicConcern.critical_system.in_(canonical_concern_systems)
    ).all()
    for lcon in legacy_concerns:
        db.delete(lcon)
    db.flush()

    # -------------------------------------------------------------
    # 5.1 SECTION 8.0: DEPARTMENT NEEDS ASSESSMENTS (INTAKE POOL)
    # -------------------------------------------------------------
    logger.info("Seeding Section 8.0 Department Needs Assessments...")
    na1 = db.query(NeedsAssessment).filter(
        NeedsAssessment.department_id == operations_dept.id,
        NeedsAssessment.title == "Online Public Service Registration and E-Payment Processing Latency"
    ).first()
    if not na1:
        na1 = NeedsAssessment(
            department_id=operations_dept.id,
            title="Online Public Service Registration and E-Payment Processing Latency",
            mfo_alignment="Citizen Frontline Public Services Program",
            current_problem="Application surges cause transaction processing latency exceeding 72 hours and physical queues at public assistance counters.",
            proposed_solution="Containerized microservices deployed on GovCloud with automated digital payment gateway integration via eGovPay.",
            expected_impacts=["Sub-15 minute public service turnaround", "Elimination of paper-based application backlogs across all regional branches"],
            is_archived=False,
            is_aggregated=True,
            strategic_concern_id=sc1.id
        )
        db.add(na1)
        db.flush()
    else:
        na1.is_aggregated = True
        na1.strategic_concern_id = sc1.id

    na2 = db.query(NeedsAssessment).filter(
        NeedsAssessment.department_id == admin_dept.id,
        NeedsAssessment.title == "Administrative High-Performance Workstation and Managed Network Upgrade"
    ).first()
    if not na2:
        na2 = NeedsAssessment(
            department_id=admin_dept.id,
            title="Administrative High-Performance Workstation and Managed Network Upgrade",
            mfo_alignment="General Administration and Support (GAS)",
            current_problem="Obsolete workstation hardware and switch throughput bottlenecks throttling data processing and institutional reporting.",
            proposed_solution="Deployment of enterprise workstation laptops and high-speed PoE+ managed network switches.",
            expected_impacts=["Sub-second local network processing speed", "Gigabit distribution across operational divisions"],
            is_archived=False,
            is_aggregated=False,
            strategic_concern_id=None
        )
        db.add(na2)
        db.flush()

    na3 = db.query(NeedsAssessment).filter(
        NeedsAssessment.department_id == ict_dept.id,
        NeedsAssessment.title == "Cloud-Based High-Availability Architecture for Mission-Critical Services"
    ).first()
    if not na3:
        na3 = NeedsAssessment(
            department_id=ict_dept.id,
            title="Cloud-Based High-Availability Architecture for Mission-Critical Services",
            mfo_alignment="General Administration and Support (GAS)",
            current_problem="On-premise servers vulnerable to localized power outages, typhoons, and single-point network failure.",
            proposed_solution="Hybrid GovCloud failover standby instances ensuring automated failover within 4 hours RTO.",
            expected_impacts=["99.9% uptime for frontline citizen services and institutional portals", "Off-site encrypted backup redundancy"],
            is_archived=False,
            is_aggregated=True,
            strategic_concern_id=sc2.id
        )
        db.add(na3)
        db.flush()
    else:
        na3.is_aggregated = True
        na3.strategic_concern_id = sc2.id

    # -------------------------------------------------------------
    # 6. NETWORK INFRASTRUCTURE & CYBERSECURITY (Parts II.B & III.A)
    # -------------------------------------------------------------
    logger.info("Seeding Network Infrastructure and Official DICT Cybersecurity Controls (Pages 10 & 17)...")
    db.query(NetworkInfrastructure).filter(NetworkInfrastructure.issp_period == baseline_period).delete()
    db.flush()

    net_existing = NetworkInfrastructure(
        issp_period=baseline_period,
        is_proposed=False,
        office_location="Central Office",
        connectivity_type="Dedicated Leased Line Fiber Optic",
        bandwidth_mbps=100,
        upload_speed_mbps=100,
        download_speed_mbps=100,
        is_ipv6_ready=True,
        topology_description="Core fiber optic distribution backbone connecting administrative, operational, and public assistance divisions."
    )
    net_proposed = NetworkInfrastructure(
        issp_period=baseline_period,
        is_proposed=True,
        office_location="Central & Regional Offices",
        connectivity_type="Redundant GovNet Fiber Backbone + SD-WAN",
        bandwidth_mbps=500,
        upload_speed_mbps=500,
        download_speed_mbps=500,
        is_ipv6_ready=True,
        topology_description="SD-WAN enterprise routing linking national headquarters with field branches and GovCloud hybrid interconnectivity."
    )
    db.add_all([net_existing, net_proposed])
    db.flush()

    # Complete 100% DICT Template v. 2026 Checklist (Pages 10 & 17 of Template)
    OFFICIAL_DICT_CYBERSECURITY_CONTROLS = [
        # 1. PHYSICAL SECURITY
        {"domain": "Physical Security", "name": "Perimeter Protection", "mandatory": True, "existing_impl": True, "proposed_impl": True},
        {"domain": "Physical Security", "name": "Access Control", "mandatory": True, "existing_impl": True, "proposed_impl": True},
        {"domain": "Physical Security", "name": "Surveillance System", "mandatory": True, "existing_impl": True, "proposed_impl": True},
        {"domain": "Physical Security", "name": "Detection System", "mandatory": False, "existing_impl": False, "proposed_impl": True},

        # 2. PERIMETER SECURITY
        {"domain": "Perimeter Security", "name": "Next Generation Firewalls", "mandatory": True, "existing_impl": True, "proposed_impl": True},
        {"domain": "Perimeter Security", "name": "Intrusion Detection/Prevention Systems (IDS/IPS)", "mandatory": True, "existing_impl": False, "proposed_impl": True},
        {"domain": "Perimeter Security", "name": "Web Application Firewalls (WAFs)", "mandatory": True, "existing_impl": False, "proposed_impl": True},
        {"domain": "Perimeter Security", "name": "Demilitarized Zone (DMZ)", "mandatory": False, "existing_impl": True, "proposed_impl": True},

        # 3. NETWORK SECURITY
        {"domain": "Network Security", "name": "Data Encryption", "mandatory": True, "existing_impl": True, "proposed_impl": True},
        {"domain": "Network Security", "name": "Network Segmentation", "mandatory": False, "existing_impl": False, "proposed_impl": True},

        # 4. ENDPOINT SECURITY
        {"domain": "Endpoint Security", "name": "Anti-virus and Anti-malware Software", "mandatory": True, "existing_impl": True, "proposed_impl": True},
        {"domain": "Endpoint Security", "name": "Application Control", "mandatory": True, "existing_impl": False, "proposed_impl": True},
        {"domain": "Endpoint Security", "name": "BYOD Security", "mandatory": True, "existing_impl": False, "proposed_impl": True},
        {"domain": "Endpoint Security", "name": "Extended Detection and Response (XDR)", "mandatory": False, "existing_impl": False, "proposed_impl": True},

        # 5. DATA SECURITY
        {"domain": "Data Security", "name": "Data Classification", "mandatory": True, "existing_impl": True, "proposed_impl": True},
        {"domain": "Data Security", "name": "Data Loss Prevention (DLP)", "mandatory": True, "existing_impl": False, "proposed_impl": True},
        {"domain": "Data Security", "name": "Data Backups and Recovery", "mandatory": True, "existing_impl": True, "proposed_impl": True},

        # 6. APPLICATION SECURITY
        {"domain": "Application Security", "name": "Regular Security Scanning and Testing", "mandatory": True, "existing_impl": False, "proposed_impl": True},

        # 7. OTHER MEASURES
        {"domain": "Other Measures", "name": "Vulnerability Assessment", "mandatory": True, "existing_impl": True, "proposed_impl": True},
        {"domain": "Other Measures", "name": "Patch Management", "mandatory": True, "existing_impl": True, "proposed_impl": True},
        {"domain": "Other Measures", "name": "Strong Password Policies", "mandatory": True, "existing_impl": True, "proposed_impl": True},
        {"domain": "Other Measures", "name": "Multi-Factor Authentication (MFA)", "mandatory": True, "existing_impl": False, "proposed_impl": True},
        {"domain": "Other Measures", "name": "Access Reviews", "mandatory": True, "existing_impl": True, "proposed_impl": True},
        {"domain": "Other Measures", "name": "Security Logs", "mandatory": True, "existing_impl": True, "proposed_impl": True},
        {"domain": "Other Measures", "name": "Log Analysis", "mandatory": False, "existing_impl": False, "proposed_impl": True},
        {"domain": "Other Measures", "name": "Incident Response Plan", "mandatory": False, "existing_impl": False, "proposed_impl": True},
        {"domain": "Other Measures", "name": "Security Information and Event Management (SIEM)", "mandatory": False, "existing_impl": False, "proposed_impl": True},
        {"domain": "Other Measures", "name": "Penetration Testing", "mandatory": False, "existing_impl": False, "proposed_impl": True},
        {"domain": "Other Measures", "name": "Secure Software Development Life Cycle (SDLC)", "mandatory": False, "existing_impl": False, "proposed_impl": True}
    ]

    # Delete any non-standard or corrupt controls from previous test runs
    official_names = {c["name"] for c in OFFICIAL_DICT_CYBERSECURITY_CONTROLS}
    db.query(CybersecurityControl).filter(
        CybersecurityControl.issp_period == baseline_period,
        ~CybersecurityControl.control_name.in_(official_names)
    ).delete(synchronize_session=False)
    db.flush()

    # Seed controls for both Existing (Part II.B.2) and Proposed (Part III.A.2)
    for c_def in OFFICIAL_DICT_CYBERSECURITY_CONTROLS:
        # Part II.B.2 Existing Control
        existing_ctrl = db.query(CybersecurityControl).filter(
            CybersecurityControl.issp_period == baseline_period,
            CybersecurityControl.is_proposed == False,
            CybersecurityControl.control_name == c_def["name"]
        ).first()

        if not existing_ctrl:
            db.add(CybersecurityControl(
                issp_period=baseline_period,
                is_proposed=False,
                control_domain=c_def["domain"],
                control_name=c_def["name"],
                is_mandatory=c_def["mandatory"],
                is_implemented=c_def["existing_impl"]
            ))
        else:
            existing_ctrl.control_domain = c_def["domain"]
            existing_ctrl.is_mandatory = c_def["mandatory"]

        # Part III.A.2 Proposed Control
        proposed_ctrl = db.query(CybersecurityControl).filter(
            CybersecurityControl.issp_period == baseline_period,
            CybersecurityControl.is_proposed == True,
            CybersecurityControl.control_name == c_def["name"]
        ).first()

        if not proposed_ctrl:
            db.add(CybersecurityControl(
                issp_period=baseline_period,
                is_proposed=True,
                control_domain=c_def["domain"],
                control_name=c_def["name"],
                is_mandatory=c_def["mandatory"],
                is_implemented=c_def["proposed_impl"]
            ))
        else:
            proposed_ctrl.control_domain = c_def["domain"]
            proposed_ctrl.is_mandatory = c_def["mandatory"]

    db.flush()

    # -------------------------------------------------------------
    # 7. E-GOVERNMENT CHECKLIST (Part II.D) - Sanitized from CSPC
    # -------------------------------------------------------------
    logger.info("Upserting and sanitizing E-Government Programs Checklist (Part II.D)...")
    egov_definitions = [
        {"program_name": "eLGU", "is_utilized": False, "url_or_system_name": None, "equivalent_system_details": "Not applicable (National Government Agency)", "adoption_ratio": None, "is_connected_to_portal": False},
        {"program_name": "eGovPay", "is_utilized": True, "url_or_system_name": "https://egovpay.gov.ph", "equivalent_system_details": "Integrated via Landbank Link.BizPortal for digital service fee collection", "adoption_ratio": None, "is_connected_to_portal": True},
        {"program_name": "PNPKI", "is_utilized": True, "url_or_system_name": "https://dict.gov.ph/pnpki", "equivalent_system_details": "Active digital signing deployed across agency directors", "adoption_ratio": "55% of eligible officials with active PNPKI certs", "is_connected_to_portal": False},
        {"program_name": "HCMIS", "is_utilized": True, "url_or_system_name": f"https://hcmis.{seed_domain}", "equivalent_system_details": "Automated institutional HRMIS and biometric payroll system", "adoption_ratio": None, "is_connected_to_portal": False},
        {"program_name": "IFMIS", "is_utilized": True, "url_or_system_name": f"https://ifmis.{seed_domain}", "equivalent_system_details": "Integrated accounting and digital disbursements ledger", "adoption_ratio": None, "is_connected_to_portal": False},
        {"program_name": "Online Public Service Portal", "is_utilized": True, "url_or_system_name": f"https://services.{seed_domain}", "equivalent_system_details": "Public citizen services portal connected to national eGov PH Super App", "channels_json": ["Website", "Email", "Mobile", "Social Media"], "is_connected_to_portal": True},
        {"program_name": "PhilGEPS", "is_utilized": True, "url_or_system_name": "https://notices.philgeps.gov.ph", "equivalent_system_details": "100% of public competitive bids and awarded contracts published", "adoption_ratio": None, "is_connected_to_portal": False},
        {"program_name": "Records and Knowledge Management", "is_utilized": True, "url_or_system_name": f"https://records.{seed_domain}", "equivalent_system_details": "Integrated Electronic Document Management and Archiving System", "adoption_ratio": None, "is_connected_to_portal": False},
        {"program_name": "Public Service Continuity Plan", "is_utilized": True, "url_or_system_name": f"https://{seed_domain}/pscp", "equivalent_system_details": "Formally approved by Executive Department Directorate", "adoption_ratio": None, "is_connected_to_portal": False}
    ]

    for ed in egov_definitions:
        eg_record = db.query(EGovernmentChecklist).filter(
            EGovernmentChecklist.issp_period == baseline_period,
            EGovernmentChecklist.program_name == ed["program_name"]
        ).first()
        if not eg_record:
            db.add(EGovernmentChecklist(issp_period=baseline_period, **ed))
        else:
            for k, v in ed.items():
                setattr(eg_record, k, v)
    db.flush()

    # -------------------------------------------------------------
    # 8. INFORMATION SYSTEMS (Part II.C & Part III.D)
    # -------------------------------------------------------------
    logger.info("Seeding Information Systems (Parts II.C & III.D)...")

    canonical_system_names = {
        "Human Resource Management Information System (HRMIS)",
        "Citizen Frontline Registry and Electronic Payment System",
        "Enterprise Document Tracking and Knowledge Management System"
    }
    legacy_systems = db.query(InformationSystem).filter(
        InformationSystem.issp_period == baseline_period,
        ~InformationSystem.name.in_(canonical_system_names)
    ).all()
    for lsys in legacy_systems:
        db.delete(lsys)
    db.flush()

    # 8.1 Part II.C: Operational Baseline System
    hrmis_system = db.query(InformationSystem).filter(
        InformationSystem.issp_period == baseline_period,
        InformationSystem.name == "Human Resource Management Information System (HRMIS)"
    ).first()
    if not hrmis_system:
        hrmis_system = InformationSystem(
            issp_period=baseline_period,
            strategic_concern_id=sc2.id,
            name="Human Resource Management Information System (HRMIS)",
            status=SystemStatus.OPERATIONAL,
            classification=SystemClassification.GENERAL_ADMINISTRATIVE,
            hosting_type=SystemHostingType.ON_PREMISE,
            online_url=f"https://hcmis.{seed_domain}",
            description_and_purpose="Automated employee records, leave administration, payroll computation, and daily biometric attendance indexing.",
            enhancement_details=None,
            development_strategy=DevelopmentStrategy.IN_HOUSE,
            development_platform="Python FastAPI, React, PostgreSQL",
            database_name="hrmis_master_db",
            data_storage_type="On-Premise SAN Storage with Automated Off-Site Mirror",
            internal_users="Agency Personnel, HR Officers, Accounting Staff, Executive Directorate",
            external_users="Civil Service Commission (CSC), Government Service Insurance System (GSIS)",
            system_owner_office="Human Resource Development Division",
            is_integrated_with_others=True,
            internal_integrated_systems="Enterprise Document Tracking System",
            external_integrated_systems="GSIS Electronic Billing and Collection System (eBCS)",
            generates_data_for_others=True,
            processes_data_from_others=True,
            is_deployed_on_shared_platform=False,
            processes_personal_information=True,
            has_undergone_pia=True
        )
        db.add(hrmis_system)
        db.flush()
    else:
        hrmis_system.online_url = f"https://hcmis.{seed_domain}"
        hrmis_system.status = SystemStatus.OPERATIONAL
        db.flush()

    # 8.2 Part II.C & III.D: Existing System Scheduled for Enhancement
    frontline_system = db.query(InformationSystem).filter(
        InformationSystem.issp_period == baseline_period,
        InformationSystem.name == "Citizen Frontline Registry and Electronic Payment System"
    ).first()
    if not frontline_system:
        frontline_system = InformationSystem(
            issp_period=baseline_period,
            strategic_concern_id=sc1.id,
            name="Citizen Frontline Registry and Electronic Payment System",
            status=SystemStatus.FOR_ENHANCEMENT,
            classification=SystemClassification.OPERATIONS_FRONTLINE,
            hosting_type=SystemHostingType.HYBRID,
            online_url=f"https://portal.{seed_domain}",
            description_and_purpose="Handles online citizen service applications, public registry indexing, fee assessment, and electronic transaction accounting.",
            enhancement_details="Containerization of frontline microservices on GovCloud, integration with national eGovPay API gateway, and automated disaster recovery database clustering.",
            development_strategy=DevelopmentStrategy.OUTSOURCED,
            development_platform="Next.js, Python FastAPI, PostgreSQL Enterprise",
            database_name="frontline_registry_db",
            data_storage_type="GovCloud Enterprise NVMe Storage",
            internal_users="Frontline Officers, Operations Staff, Financial Cashiers",
            external_users="General Citizens, Corporate Entities, National Oversight Agencies",
            system_owner_office="Public Frontline Services and Operations Division",
            is_integrated_with_others=True,
            internal_integrated_systems="Enterprise Document Tracking System",
            external_integrated_systems="DICT eGov Portal, Landbank Link.BizPortal",
            generates_data_for_others=True,
            processes_data_from_others=True,
            is_deployed_on_shared_platform=True,
            processes_personal_information=True,
            has_undergone_pia=True
        )
        db.add(frontline_system)
        db.flush()
    else:
        frontline_system.online_url = f"https://portal.{seed_domain}"
        if not frontline_system.enhancement_details:
            frontline_system.enhancement_details = "Containerization of frontline microservices on GovCloud, integration with national eGovPay API gateway, and automated disaster recovery database clustering."
        db.flush()

    # 8.3 Part III.D: New System Scheduled for Development
    dms_system = db.query(InformationSystem).filter(
        InformationSystem.issp_period == baseline_period,
        InformationSystem.name == "Enterprise Document Tracking and Knowledge Management System"
    ).first()
    if not dms_system:
        dms_system = InformationSystem(
            issp_period=baseline_period,
            strategic_concern_id=sc2.id,
            name="Enterprise Document Tracking and Knowledge Management System",
            status=SystemStatus.FOR_DEVELOPMENT,
            classification=SystemClassification.SUPPORT_TO_OPERATIONS,
            hosting_type=SystemHostingType.ONLINE,
            online_url=f"https://dms.{seed_domain}",
            description_and_purpose="Automated document routing, digital barcode tracking, executive directives indexing, and records archiving.",
            development_strategy=DevelopmentStrategy.IN_HOUSE,
            development_platform="Python FastAPI, React, PostgreSQL",
            database_name="enterprise_dms_db",
            data_storage_type="GovCloud Hybrid Object Storage with Local Mirror",
            internal_users="Agency Personnel, Directorate Heads, Records Custodians",
            external_users="Authorized Liaison Officers, Inter-Agency Coordinators",
            system_owner_office="Administrative and Financial Management Service",
            is_integrated_with_others=True,
            internal_integrated_systems="Citizen Frontline Registry",
            external_integrated_systems="National Data Exchange (NGDX)",
            generates_data_for_others=False,
            processes_data_from_others=True,
            is_deployed_on_shared_platform=True,
            processes_personal_information=True,
            has_undergone_pia=True
        )
        db.add(dms_system)
        db.flush()
    else:
        dms_system.online_url = f"https://dms.{seed_domain}"
        db.flush()

    # -------------------------------------------------------------
    # 9. ICT PROJECTS (Part III.E.1 Internal & III.E.2 Cross-Agency)
    # -------------------------------------------------------------
    logger.info("Seeding Strategic ICT Projects (Part III.E)...")
    canonical_project_titles = {
        "Citizen Frontline Portal Modernization and GovCloud Migration Project",
        "National Single Window & Inter-Agency Interoperability Project"
    }

    orphan_projects = db.query(IctProject).filter(
        IctProject.issp_period == baseline_period,
        ~IctProject.project_title.in_(canonical_project_titles)
    ).all()
    for op_proj in orphan_projects:
        db.query(PerformanceMetric).filter(
            PerformanceMetric.issp_period == baseline_period,
            or_(
                PerformanceMetric.project_id == op_proj.id,
                PerformanceMetric.project_title == op_proj.project_title
            )
        ).delete(synchronize_session=False)
        db.delete(op_proj)
    db.flush()

    proj_frontline_modernization = db.query(IctProject).filter(
        IctProject.issp_period == baseline_period,
        IctProject.project_title == "Citizen Frontline Portal Modernization and GovCloud Migration Project"
    ).first()
    if not proj_frontline_modernization:
        proj_frontline_modernization = IctProject(
            issp_period=baseline_period,
            system_id=frontline_system.id,
            project_title="Citizen Frontline Portal Modernization and GovCloud Migration Project",
            project_category=ProjectCategory.INTERNAL_ICT_PROJECT,
            description="Complete re-architecture and deployment of the agency frontline registration services to GovCloud containerized clusters.",
            objectives="Eliminate peak service processing delays and reduce citizen transaction turnaround time from 3 working days to under 15 minutes.",
            aligns_pip=True,
            aligns_ncsp=True,
            aligns_egmp=True,
            aligns_pcb=True,
            aligns_others=False,
            aligns_others_specify=None,
            harmonizes_national_priority=True,
            harmonizes_resource_optimization=True,
            harmonizes_pegif=True,
            harmonizes_cross_collaboration=True,
            harmonizes_scalability=True,
            duration_start_year=2026,
            duration_end_year=2028,
            annual_deliverables={
                "Year 1": "GovCloud infrastructure provisioning, database migration, and security penetration testing.",
                "Year 2": "eGovPay payment gateway integration and automated citizen verification module deployment.",
                "Year 3": "Full nationwide disaster recovery drill, high-availability testing, and staff training.",
                "2026": "GovCloud infrastructure provisioning, database migration, and security penetration testing.",
                "2027": "eGovPay payment gateway integration and automated citizen verification module deployment.",
                "2028": "Full nationwide disaster recovery drill, high-availability testing, and staff training."
            },
            year_1_deliverables="GovCloud infrastructure provisioning, database migration, and security penetration testing.",
            year_2_deliverables="eGovPay payment gateway integration and automated citizen verification module deployment.",
            year_3_deliverables="Full nationwide disaster recovery drill, high-availability testing, and staff training.",
            implementing_unit="Information and Communications Technology Division (ICTD)",
            funding_source=FundSource.GAA
        )
        db.add(proj_frontline_modernization)
        db.flush()

    proj_cross_nsw = db.query(IctProject).filter(
        IctProject.issp_period == baseline_period,
        IctProject.project_title == "National Single Window & Inter-Agency Interoperability Project"
    ).first()
    if not proj_cross_nsw:
        proj_cross_nsw = IctProject(
            issp_period=baseline_period,
            system_id=frontline_system.id,
            project_title="National Single Window & Inter-Agency Interoperability Project",
            project_category=ProjectCategory.CROSS_AGENCY_ICT_PROJECT,
            description="Joint interoperability initiative enabling automated data exchange between national agencies, oversight departments, and public registries.",
            objectives="Establish PeGIF-compliant API gateways on the National Government Data Exchange (NGDX) to eliminate redundant document requirements.",
            aligns_pip=False,
            aligns_ncsp=True,
            aligns_egmp=True,
            aligns_pcb=True,
            aligns_others=False,
            aligns_others_specify=None,
            harmonizes_national_priority=True,
            harmonizes_resource_optimization=True,
            harmonizes_pegif=True,
            harmonizes_cross_collaboration=True,
            harmonizes_scalability=True,
            duration_start_year=2026,
            duration_end_year=2028,
            annual_deliverables={
                "Year 1": "Joint Memorandum Circular (JMC) signing, PeGIF API gateway architecture, and data exchange staging.",
                "Year 2": "Secure NGDX data pipeline integration and multi-agency test runs.",
                "Year 3": "Production deployment and automated cross-agency verification.",
                "2026": "Joint Memorandum Circular (JMC) signing, PeGIF API gateway architecture, and data exchange staging.",
                "2027": "Secure NGDX data pipeline integration and multi-agency test runs.",
                "2028": "Production deployment and automated cross-agency verification."
            },
            year_1_deliverables="Joint Memorandum Circular (JMC) signing, PeGIF API gateway architecture, and data exchange staging.",
            year_2_deliverables="Secure NGDX data pipeline integration and multi-agency test runs.",
            year_3_deliverables="Production deployment and automated cross-agency verification.",
            implementing_unit="Information and Communications Technology Division (ICTD)",
            funding_source=FundSource.GAA,
            lead_agency="Department of Information and Communications Technology (DICT)",
            partner_agencies="Department of Budget and Management (DBM), Bureau of the Treasury (BTr)"
        )
        db.add(proj_cross_nsw)
        db.flush()

    # -------------------------------------------------------------
    # 10. PMF METRICS FRAMEWORK (Part III.F)
    # -------------------------------------------------------------
    logger.info("Seeding Performance Measurement Framework (Part III.F)...")
    canonical_metric_indicators = {
        "Percentage of citizen services adopting online digital processing modules",
        "Average public service transaction completion duration",
        "PeGIF-compliant API endpoints deployed and registered on NGDX"
    }
    db.query(PerformanceMetric).filter(
        PerformanceMetric.issp_period == baseline_period,
        ~PerformanceMetric.indicator.in_(canonical_metric_indicators)
    ).delete(synchronize_session=False)
    db.flush()

    pmf_metrics = [
        {
            "project_id": proj_frontline_modernization.id,
            "project_title": proj_frontline_modernization.project_title,
            "result_hierarchy": "Output",
            "indicator": "Percentage of citizen services adopting online digital processing modules",
            "baseline": "35%",
            "target": "100% adoption",
            "collection_method": "Automated database audit logs",
            "responsibility": "Public Frontline Services and Operations Division"
        },
        {
            "project_id": proj_frontline_modernization.id,
            "project_title": proj_frontline_modernization.project_title,
            "result_hierarchy": "Immediate Outcome",
            "indicator": "Average public service transaction completion duration",
            "baseline": "3 working days",
            "target": "Under 15 minutes",
            "collection_method": "Application APM analytics",
            "responsibility": "Information and Communications Technology Division (ICTD)"
        },
        {
            "project_id": proj_cross_nsw.id,
            "project_title": proj_cross_nsw.project_title,
            "result_hierarchy": "Output",
            "indicator": "PeGIF-compliant API endpoints deployed and registered on NGDX",
            "baseline": "0 endpoints",
            "target": "5 secure API gateways",
            "collection_method": "API gateway transaction audit logs",
            "responsibility": "Information and Communications Technology Division (ICTD)"
        }
    ]
    for pm in pmf_metrics:
        if not db.query(PerformanceMetric).filter(
            PerformanceMetric.issp_period == baseline_period,
            PerformanceMetric.project_title == pm["project_title"],
            PerformanceMetric.indicator == pm["indicator"]
        ).first():
            db.add(PerformanceMetric(issp_period=baseline_period, **pm))
    db.flush()

    # -------------------------------------------------------------
    # 11. PART IV.A DETAILED RESOURCE DEPLOYMENT
    # -------------------------------------------------------------
    logger.info("Seeding Part IV.A Detailed Resource Line Items...")
    canonical_items_config = [
        {
            "item_name": "High-Performance Mobile Workstation Laptop",
            "department_id": ict_dept.id,
            "outcome_id": oo_gas.id,
            "project_id": None,
            "needs_assessment_id": na2.id,
            "category": ProposalCategory.HARDWARE,
            "strategic_category": ProjectCategory.OFFICE_PRODUCTIVITY,
            "office_location": OfficeLocation.CENTRAL_OFFICE,
            "fund_source": FundSource.GAA,
            "uacs_object_code": UacsObjectCode.ICT_EQUIPMENT,
            "expenditure_class": ExpenditureClass.CAPITAL_OUTLAY,
            "item_key": "laptop_enterprise",
            "unit_cost": Decimal("70000.00"),
            "year_1_qty": 10,
            "year_2_qty": 5,
            "year_3_qty": 5,
            "total_qty": 20,
            "total_cost": Decimal("1400000.00"),
            "yearly_quantities": {"2026": 10, "2027": 5, "2028": 5},
            "justification": "Required enterprise mobile workstations for technical analysts managing core digital infrastructure.",
            "system_development_status": SystemDevelopmentStatus.NOT_APPLICABLE,
            "created_by_students": False,
            "target_office_automated": ict_dept.name,
            "is_expansion": False
        },
        {
            "item_name": "Office Productivity Suite Cloud Subscription",
            "department_id": admin_dept.id,
            "outcome_id": oo_gas.id,
            "project_id": None,
            "needs_assessment_id": None,
            "category": ProposalCategory.SUBSCRIPTION,
            "strategic_category": ProjectCategory.OFFICE_PRODUCTIVITY,
            "office_location": OfficeLocation.CENTRAL_OFFICE,
            "fund_source": FundSource.GAA,
            "uacs_object_code": UacsObjectCode.ICT_SOFTWARE_SUBSCRIPTION,
            "expenditure_class": ExpenditureClass.MOOE,
            "item_key": "office_suite_cloud",
            "unit_cost": Decimal("8500.00"),
            "year_1_qty": 60,
            "year_2_qty": 60,
            "year_3_qty": 60,
            "total_qty": 180,
            "total_cost": Decimal("1530000.00"),
            "yearly_quantities": {"2026": 60, "2027": 60, "2028": 60},
            "justification": "Annual institutional productivity software licenses across administrative operational divisions.",
            "system_development_status": SystemDevelopmentStatus.NOT_APPLICABLE,
            "created_by_students": False,
            "target_office_automated": admin_dept.name,
            "is_expansion": True
        },
        {
            "item_name": "GovCloud Microservices Migration Contractor",
            "department_id": ict_dept.id,
            "outcome_id": oo_frontline.id,
            "project_id": proj_frontline_modernization.id,
            "needs_assessment_id": na1.id,
            "category": ProposalCategory.SOFTWARE,
            "strategic_category": ProjectCategory.INTERNAL_ICT_PROJECT,
            "office_location": OfficeLocation.CENTRAL_OFFICE,
            "fund_source": FundSource.GAA,
            "uacs_object_code": UacsObjectCode.ICT_CONSULTING_DEVELOPMENT,
            "expenditure_class": ExpenditureClass.MOOE,
            "item_key": "other",
            "unit_cost": Decimal("1500000.00"),
            "year_1_qty": 1,
            "year_2_qty": 1,
            "year_3_qty": 0,
            "total_qty": 2,
            "total_cost": Decimal("3000000.00"),
            "yearly_quantities": {"2026": 1, "2027": 1, "2028": 0},
            "justification": "Specialized cloud engineering contractor to execute microservices containerization and load testing.",
            "system_development_status": SystemDevelopmentStatus.FOR_ENHANCEMENT,
            "created_by_students": False,
            "target_office_automated": ict_dept.name,
            "is_expansion": True
        },
        {
            "item_name": "PeGIF & NGDX Integration Engineering Consultant",
            "department_id": ict_dept.id,
            "outcome_id": oo_gas.id,
            "project_id": proj_cross_nsw.id,
            "needs_assessment_id": None,
            "category": ProposalCategory.SOFTWARE,
            "strategic_category": ProjectCategory.CROSS_AGENCY_ICT_PROJECT,
            "office_location": OfficeLocation.CENTRAL_OFFICE,
            "fund_source": FundSource.GAA,
            "uacs_object_code": UacsObjectCode.ICT_CONSULTING_DEVELOPMENT,
            "expenditure_class": ExpenditureClass.MOOE,
            "item_key": "other",
            "unit_cost": Decimal("400000.00"),
            "year_1_qty": 1,
            "year_2_qty": 1,
            "year_3_qty": 1,
            "total_qty": 3,
            "total_cost": Decimal("1200000.00"),
            "yearly_quantities": {"2026": 1, "2027": 1, "2028": 1},
            "justification": "Specialized API consultant to implement and certify secure NGDX national gateways.",
            "system_development_status": SystemDevelopmentStatus.NOT_APPLICABLE,
            "created_by_students": False,
            "target_office_automated": ict_dept.name,
            "is_expansion": True
        },
        {
            "item_name": "GovCloud Disaster Recovery Standby Subscription",
            "department_id": ict_dept.id,
            "outcome_id": oo_gas.id,
            "project_id": None,
            "needs_assessment_id": na3.id,
            "category": ProposalCategory.SUBSCRIPTION,
            "strategic_category": ProjectCategory.CONTINUING_COSTS,
            "office_location": OfficeLocation.CENTRAL_OFFICE,
            "fund_source": FundSource.GAA,
            "uacs_object_code": UacsObjectCode.ICT_SOFTWARE_SUBSCRIPTION,
            "expenditure_class": ExpenditureClass.MOOE,
            "item_key": "other",
            "unit_cost": Decimal("500000.00"),
            "year_1_qty": 1,
            "year_2_qty": 1,
            "year_3_qty": 1,
            "total_qty": 3,
            "total_cost": Decimal("1500000.00"),
            "yearly_quantities": {"2026": 1, "2027": 1, "2028": 1},
            "justification": "Mandatory cloud standby failover instances ensuring sub-4-hour RTO for mission-critical portals.",
            "system_development_status": SystemDevelopmentStatus.NOT_APPLICABLE,
            "created_by_students": False,
            "target_office_automated": ict_dept.name,
            "is_expansion": True
        }
    ]

    canonical_names = {item["item_name"] for item in canonical_items_config}

    for conf in canonical_items_config:
        items_matched = db.query(Proposal).filter(
            Proposal.issp_period == baseline_period,
            Proposal.item_name == conf["item_name"]
        ).all()

        if not items_matched:
            item = Proposal(
                issp_period=baseline_period,
                status=ProposalStatus.APPROVED,
                **conf
            )
            db.add(item)
        else:
            item = items_matched[0]
            for k, v in conf.items():
                setattr(item, k, v)
            item.status = ProposalStatus.APPROVED
            item.is_archived = False
            item.sync_payload()
            # Archive any accidental duplicate records for the same item name to protect Four-Way Parity
            for dup in items_matched[1:]:
                dup.is_archived = True
                dup.sync_payload()

    legacy_items = db.query(Proposal).filter(
        Proposal.issp_period == baseline_period,
        ~Proposal.item_name.in_(canonical_names)
    ).all()
    for leg in legacy_items:
        leg.is_archived = True
        leg.sync_payload()

    db.flush()

    # -------------------------------------------------------------
    # 12. ANNEX 1: MASTER ASSET INVENTORY
    # -------------------------------------------------------------
    logger.info("Seeding Annex 1 Master Asset Inventory across departments (DICT Categories)...")
    inventory_items = [
        # 1. Servers
        {"department_id": ict_dept.id, "item_name": "Enterprise 2U Rackmount Server", "specs": "16-Core Processor, 64GB RAM, 2TB SSD Enterprise", "exact_model": "Rackmount R750", "dict_category": "Servers", "quantity": 30, "status": AssetStatus.FUNCTIONAL, "acquired_price": Decimal("250000.00"), "office_location": OfficeLocation.CENTRAL_OFFICE, "is_central_office": True, "is_end_of_life": False, "is_backup": False, "is_software": False},
        {"department_id": ict_dept.id, "item_name": "Legacy 2U Decommissioned Server", "specs": "8-Core Processor, 32GB RAM, 1TB HDD", "exact_model": "Rackmount R720", "dict_category": "Servers", "quantity": 5, "status": AssetStatus.CONDEMNED, "acquired_price": Decimal("180000.00"), "office_location": OfficeLocation.CENTRAL_OFFICE, "is_central_office": True, "is_end_of_life": True, "is_backup": False, "is_software": False},
        {"department_id": ict_dept.id, "item_name": "Hot-Standby Rackmount Server", "specs": "8-Core Processor, 32GB RAM, 1TB SSD", "exact_model": "Rackmount R640", "dict_category": "Servers", "quantity": 1, "status": AssetStatus.FUNCTIONAL, "acquired_price": Decimal("190000.00"), "office_location": OfficeLocation.CENTRAL_OFFICE, "is_central_office": True, "is_end_of_life": False, "is_backup": True, "is_software": False},

        # 2. Desktops
        {"department_id": ict_dept.id, "item_name": "Standard Administrative Desktop Workstation", "specs": "Intel Core i5, 8GB RAM, 500GB HDD", "exact_model": "Desktop 3040", "dict_category": "Desktop", "quantity": 120, "status": AssetStatus.FUNCTIONAL, "acquired_price": Decimal("38000.00"), "office_location": OfficeLocation.CENTRAL_OFFICE, "is_central_office": True, "is_end_of_life": False, "is_backup": False, "is_software": False},
        {"department_id": ict_dept.id, "item_name": "Legacy Decommissioned Desktop PC", "specs": "Intel Core i3, 4GB RAM, 500GB HDD", "exact_model": "Desktop 3020", "dict_category": "Desktop", "quantity": 15, "status": AssetStatus.CONDEMNED, "acquired_price": Decimal("32000.00"), "office_location": OfficeLocation.CENTRAL_OFFICE, "is_central_office": True, "is_end_of_life": True, "is_backup": False, "is_software": False},
        {"department_id": ict_dept.id, "item_name": "Administrative Standby Desktop PC", "specs": "Intel Core i5, 8GB RAM, 1TB HDD", "exact_model": "ProDesk 400", "dict_category": "Desktop", "quantity": 10, "status": AssetStatus.FUNCTIONAL, "acquired_price": Decimal("40000.00"), "office_location": OfficeLocation.CENTRAL_OFFICE, "is_central_office": True, "is_end_of_life": False, "is_backup": True, "is_software": False},
        {"department_id": operations_dept.id, "item_name": "Public Assistance Frontline Desktop Workstation", "specs": "Intel Core i5 10th Gen, 16GB RAM, 512GB SSD", "exact_model": "Frontline 7080", "dict_category": "Desktop", "quantity": 15, "status": AssetStatus.FUNCTIONAL, "acquired_price": Decimal("42000.00"), "office_location": OfficeLocation.CENTRAL_OFFICE, "is_central_office": True, "is_end_of_life": False, "is_backup": False, "is_software": False},

        # 3. Laptops
        {"department_id": ict_dept.id, "item_name": "Enterprise Mobile Laptop", "specs": "Intel Core i7, 16GB RAM, 512GB SSD", "exact_model": "ProBook L14", "dict_category": "Laptop", "quantity": 80, "status": AssetStatus.FUNCTIONAL, "acquired_price": Decimal("55000.00"), "office_location": OfficeLocation.CENTRAL_OFFICE, "is_central_office": True, "is_end_of_life": False, "is_backup": False, "is_software": False},
        {"department_id": ict_dept.id, "item_name": "Legacy Unserviceable Laptop", "specs": "Intel Core i3, 4GB RAM, 500GB HDD", "exact_model": "ProBook E440", "dict_category": "Laptop", "quantity": 10, "status": AssetStatus.CONDEMNED, "acquired_price": Decimal("35000.00"), "office_location": OfficeLocation.CENTRAL_OFFICE, "is_central_office": True, "is_end_of_life": True, "is_backup": False, "is_software": False},
        {"department_id": ict_dept.id, "item_name": "Administrative Standby Laptop", "specs": "Intel Core i5, 8GB RAM, 256GB SSD", "exact_model": "Latitude 3480", "dict_category": "Laptop", "quantity": 6, "status": AssetStatus.FUNCTIONAL, "acquired_price": Decimal("48000.00"), "office_location": OfficeLocation.CENTRAL_OFFICE, "is_central_office": True, "is_end_of_life": False, "is_backup": True, "is_software": False},
        {"department_id": admin_dept.id, "item_name": "Heavy-Duty Workstation Laptop", "specs": "Intel Core i7, 32GB RAM, 1TB SSD", "exact_model": "Workstation P15", "dict_category": "Laptop", "quantity": 25, "status": AssetStatus.FUNCTIONAL, "acquired_price": Decimal("85000.00"), "office_location": OfficeLocation.CENTRAL_OFFICE, "is_central_office": True, "is_end_of_life": False, "is_backup": False, "is_software": False},

        # 4. Mobile Phone & Tablet
        {"department_id": ict_dept.id, "item_name": "Field Inspection Dispatch Phone", "specs": "Octa-Core, 4GB RAM, 128GB Storage, 5G", "exact_model": "Galaxy A15", "dict_category": "Mobile Phone", "quantity": 55, "status": AssetStatus.FUNCTIONAL, "acquired_price": Decimal("9500.00"), "office_location": OfficeLocation.CENTRAL_OFFICE, "is_central_office": True, "is_end_of_life": False, "is_backup": False, "is_software": False},
        {"department_id": ict_dept.id, "item_name": "Field Operations Inspection Tablet", "specs": "10.1-inch, 4GB RAM, 64GB Storage, LTE", "exact_model": "Tab M10", "dict_category": "Tablet", "quantity": 30, "status": AssetStatus.FUNCTIONAL, "acquired_price": Decimal("12000.00"), "office_location": OfficeLocation.CENTRAL_OFFICE, "is_central_office": True, "is_end_of_life": False, "is_backup": False, "is_software": False},

        # 5. Printers
        {"department_id": ict_dept.id, "item_name": "Heavy-Duty Multifunction Network Laser Printer", "specs": "Multifunction Network Laser Printer", "exact_model": "LaserJet Pro M428fdw", "dict_category": "Printer", "quantity": 25, "status": AssetStatus.FUNCTIONAL, "acquired_price": Decimal("35000.00"), "office_location": OfficeLocation.CENTRAL_OFFICE, "is_central_office": True, "is_end_of_life": False, "is_backup": False, "is_software": False},
        {"department_id": ict_dept.id, "item_name": "Monochrome Decommissioned Laser Printer", "specs": "Monochrome Laser Printer", "exact_model": "LaserJet P2035", "dict_category": "Printer", "quantity": 5, "status": AssetStatus.CONDEMNED, "acquired_price": Decimal("18000.00"), "office_location": OfficeLocation.CENTRAL_OFFICE, "is_central_office": True, "is_end_of_life": True, "is_backup": False, "is_software": False},

        # 6. Network Switches
        {"department_id": ict_dept.id, "item_name": "24-Port Managed Core Gigabit PoE+ Switch", "specs": "24-Port Gigabit Managed PoE+ Switch", "exact_model": "Switch 2960-X", "dict_category": "Network Switch", "quantity": 50, "status": AssetStatus.FUNCTIONAL, "acquired_price": Decimal("75000.00"), "office_location": OfficeLocation.CENTRAL_OFFICE, "is_central_office": True, "is_end_of_life": False, "is_backup": False, "is_software": False},

        # 7. Others (Hardware) - Specified
        {"department_id": ict_dept.id, "item_name": "Online Rackmount Double-Conversion UPS", "specs": "3000VA / 2700W 2U Rackmount UPS", "exact_model": "Smart-UPS RT 3000VA", "dict_category": "Others (ICT Equipment)", "other_category_name": "Uninterruptible Power Supply (UPS)", "quantity": 8, "status": AssetStatus.FUNCTIONAL, "acquired_price": Decimal("65000.00"), "office_location": OfficeLocation.CENTRAL_OFFICE, "is_central_office": True, "is_end_of_life": False, "is_backup": True, "is_software": False},

        # 8. Software Applications
        {"department_id": ict_dept.id, "item_name": "Office Productivity Tool", "specs": "Desktop productivity perpetual licenses", "exact_model": "Office Standard Suite", "dict_category": "Office Productivity Tool", "quantity": 30, "status": AssetStatus.FUNCTIONAL, "acquired_price": Decimal("15000.00"), "office_location": OfficeLocation.CENTRAL_OFFICE, "is_central_office": True, "is_end_of_life": False, "is_backup": False, "is_software": True, "is_perpetual": True},
        {"department_id": ict_dept.id, "item_name": "Grammar checker", "specs": "Professional writing and document grammar tool", "exact_model": "Professional Writing Suite", "dict_category": "Grammar checker", "quantity": 120, "status": AssetStatus.FUNCTIONAL, "acquired_price": Decimal("3500.00"), "office_location": OfficeLocation.CENTRAL_OFFICE, "is_central_office": True, "is_end_of_life": False, "is_backup": False, "is_software": True, "is_perpetual": False},
        {"department_id": ict_dept.id, "item_name": "Graphics and Simulation Software", "specs": "Technical simulation and design tools", "exact_model": "Engineering Design Suite", "dict_category": "Graphics and Simulation Software", "quantity": 80, "status": AssetStatus.FUNCTIONAL, "acquired_price": Decimal("45000.00"), "office_location": OfficeLocation.CENTRAL_OFFICE, "is_central_office": True, "is_end_of_life": False, "is_backup": False, "is_software": True, "is_perpetual": True},
        {"department_id": ict_dept.id, "item_name": "Antivirus", "specs": "Endpoint Detection and Response Cloud Subscription", "exact_model": "Endpoint Protection Cloud", "dict_category": "Antivirus", "quantity": 55, "status": AssetStatus.FUNCTIONAL, "acquired_price": Decimal("2500.00"), "office_location": OfficeLocation.CENTRAL_OFFICE, "is_central_office": True, "is_end_of_life": False, "is_backup": False, "is_software": True, "is_perpetual": False},
        {"department_id": ict_dept.id, "item_name": "IT Help Desk Tool", "specs": "Institutional service desk ticketing platform", "exact_model": "Service Desk Management System", "dict_category": "IT Help Desk Tool", "quantity": 30, "status": AssetStatus.FUNCTIONAL, "acquired_price": Decimal("12000.00"), "office_location": OfficeLocation.CENTRAL_OFFICE, "is_central_office": True, "is_end_of_life": False, "is_backup": False, "is_software": True, "is_perpetual": True},
        {"department_id": ict_dept.id, "item_name": "Photo and Video Editing Software", "specs": "Media production creative workstation software", "exact_model": "Creative Production Suite", "dict_category": "Photo and Video Editing Software", "quantity": 25, "status": AssetStatus.FUNCTIONAL, "acquired_price": Decimal("32000.00"), "office_location": OfficeLocation.CENTRAL_OFFICE, "is_central_office": True, "is_end_of_life": False, "is_backup": False, "is_software": True, "is_perpetual": True},
        {"department_id": ict_dept.id, "item_name": "Web Application Firewall", "specs": "Perimeter cloud application security", "exact_model": "Cloud WAF Enterprise Protection", "dict_category": "Web Application Firewall", "quantity": 50, "status": AssetStatus.FUNCTIONAL, "acquired_price": Decimal("40000.00"), "office_location": OfficeLocation.CENTRAL_OFFICE, "is_central_office": True, "is_end_of_life": False, "is_backup": False, "is_software": True, "is_perpetual": True}
    ]

    for inv in inventory_items:
        existing = db.query(ExistingInventory).filter(
            ExistingInventory.department_id == inv["department_id"],
            ExistingInventory.item_name == inv["item_name"],
            ExistingInventory.status == inv["status"],
            ExistingInventory.exact_model == inv["exact_model"]
        ).first()

        if not existing:
            db.add(ExistingInventory(
                date_acquired=datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=365 * (5 if inv["is_end_of_life"] else 1)),
                **inv
            ))
        else:
            for k, v in inv.items():
                if hasattr(existing, k):
                    setattr(existing, k, v)
    db.flush()

    # -------------------------------------------------------------
    # 13. ANNEX 2: DRBCP BIA, TEAMS & KPIS
    # -------------------------------------------------------------
    logger.info("Seeding Annex 2 Disaster Recovery & Business Continuity...")
    
    db.query(BusinessImpactAnalysis).filter(
        BusinessImpactAnalysis.issp_period == baseline_period,
        or_(
            BusinessImpactAnalysis.system_name.ilike('%sias%'),
            BusinessImpactAnalysis.system_name.ilike('%student%'),
            BusinessImpactAnalysis.system_name.ilike('%test%')
        )
    ).delete(synchronize_session=False)
    db.flush()

    canonical_bias = [
        {
            "system_id": frontline_system.id,
            "system_name": frontline_system.name,
            "classification": "Frontline / Mission-Critical",
            "mtpd_hours": 8,
            "rto_hours": 4,
            "rpo_hours": 1
        },
        {
            "system_id": dms_system.id,
            "system_name": dms_system.name,
            "classification": "Administrative / Support to Operations",
            "mtpd_hours": 24,
            "rto_hours": 8,
            "rpo_hours": 4
        },
        {
            "system_id": hrmis_system.id,
            "system_name": hrmis_system.name,
            "classification": "Administrative / General Support",
            "mtpd_hours": 24,
            "rto_hours": 12,
            "rpo_hours": 4
        }
    ]

    for bia_data in canonical_bias:
        existing_bia = db.query(BusinessImpactAnalysis).filter(
            BusinessImpactAnalysis.issp_period == baseline_period,
            BusinessImpactAnalysis.system_name == bia_data["system_name"]
        ).first()
        if not existing_bia:
            db.add(BusinessImpactAnalysis(issp_period=baseline_period, **bia_data))
        else:
            for k, v in bia_data.items():
                setattr(existing_bia, k, v)
    db.flush()

    db.query(DisasterRecoveryTeam).filter(
        DisasterRecoveryTeam.issp_period == baseline_period,
        or_(
            DisasterRecoveryTeam.contact_person.ilike('%test%'),
            DisasterRecoveryTeam.responsibility.ilike('%test%')
        )
    ).delete(synchronize_session=False)
    db.flush()

    dr_teams_to_seed = [
        {"role": "Incident Commander", "responsibility": "Declares disaster state and authorizes GovCloud DR standby site activation.", "contact_person": "DIRECTOR / INCIDENT COMMANDER", "contact_details": "09190000000"},
        {"role": "Infrastructure Lead", "responsibility": "Restores servers, national network distribution, and GovCloud connectivity.", "contact_person": "INFRASTRUCTURE LEAD", "contact_details": "09300000000"},
        {"role": "Data/App Custodian", "responsibility": "Ensures database integrity, snapshot rollbacks, and application failover validation.", "contact_person": "LEAD SYSTEMS ANALYST", "contact_details": "09120000000"},
        {"role": "Security Officer", "responsibility": "Monitors for cyber threats and anomalous traffic patterns during failover.", "contact_person": "CHIEF INFORMATION SECURITY OFFICER", "contact_details": "09980000000"}
    ]
    for dt in dr_teams_to_seed:
        existing_dt = db.query(DisasterRecoveryTeam).filter(
            DisasterRecoveryTeam.issp_period == baseline_period,
            DisasterRecoveryTeam.role == dt["role"]
        ).first()
        if not existing_dt:
            db.add(DisasterRecoveryTeam(issp_period=baseline_period, **dt))
        else:
            for k, v in dt.items():
                setattr(existing_dt, k, v)
    db.flush()

    db.query(DRBCPMetric).filter(
        DRBCPMetric.issp_period == baseline_period,
        DRBCPMetric.indicator.ilike('%test%')
    ).delete(synchronize_session=False)
    db.flush()

    dr_kpis_to_seed = [
        {"indicator": "System Availability", "target_metric": "99.9% Up-time (excluding planned maintenance)"},
        {"indicator": "RTO Achievement", "target_metric": "Recovery within 4 hours of disaster declaration"},
        {"indicator": "Backup Success Rate", "target_metric": "100% successful daily automated backups"},
        {"indicator": "Testing Frequency", "target_metric": "1 Comprehensive Exercise per Year"}
    ]
    for kpi in dr_kpis_to_seed:
        existing_kpi = db.query(DRBCPMetric).filter(
            DRBCPMetric.issp_period == baseline_period,
            DRBCPMetric.indicator == kpi["indicator"]
        ).first()
        if not existing_kpi:
            db.add(DRBCPMetric(issp_period=baseline_period, **kpi))
        else:
            for k, v in kpi.items():
                setattr(existing_kpi, k, v)
    db.flush()

    # -------------------------------------------------------------
    # 14. BUDGET CEILINGS (Departmental Allotments)
    # -------------------------------------------------------------
    logger.info("Seeding departmental budget ceilings...")
    for d_name, d_inst in dept_instances.items():
        existing_ceiling = db.query(BudgetCeiling).filter(
            BudgetCeiling.department_id == d_inst.id,
            BudgetCeiling.issp_period == baseline_period
        ).first()
        if not existing_ceiling:
            db_ceiling = BudgetCeiling(
                department_id=d_inst.id,
                allocated_capex=Decimal("25000000.00"),
                allocated_mooe=Decimal("15000000.00"),
                issp_period=baseline_period
            )
            db.add(db_ceiling)

    # -------------------------------------------------------------
    # 15. SYSTEM SETTINGS
    # -------------------------------------------------------------
    if not db.query(SystemSetting).filter(SystemSetting.key == "global_budget_ceiling").first():
        db.add(SystemSetting(key="global_budget_ceiling", value="200000000.00"))

    if not db.query(SystemSetting).filter(SystemSetting.key == "issp_active_cycle").first():
        db.add(SystemSetting(key="issp_active_cycle", value=baseline_period))

    # -------------------------------------------------------------
    # 16. GLOSSARY (OFFICIAL DICT DEFINITIONS - Template Page 5)
    # -------------------------------------------------------------
    terms_to_seed = [
        {"term": "Agency", "definition": "Refers to any bureau, office, commission, authority, or instrumentality of the national government, including government-owned or–controlled corporations (GOCC), authorized by law or by their respective charters to contract for or undertake information and communications technology networks and databases, infrastructure or development projects.", "order_index": 1},
        {"term": "Business Process", "definition": "A collection of business transactions between business partners and/or internal activities within one business. These transactions and/or activities together support the objective of the business process.", "order_index": 2},
        {"term": "Chief Information Officer", "definition": "Refers to a senior officer responsible for the development, planning, and implementation of the government entity's information systems strategic plan (ISSP) or ICT plan, and management of the agency's ICT systems, platforms, and applications.", "order_index": 3},
        {"term": "Information Systems Strategic Plan (ISSP)", "definition": "A multi-year blueprint that defines an agency's overall ICT direction, demonstrating how its information systems and digital infrastructure support its core statutory mandate and national priorities.", "order_index": 4},
        {"term": "MITHI", "definition": "Medium-Term Information and Communications Technology Harmonization Initiative - a joint oversight mechanism (DICT, DBM, NEDA) harmonizing government ICT programs.", "order_index": 5},
        {"term": "PeGIF", "definition": "Philippine e-Government Interoperability Framework - technical standard facilitating automated data exchange across government systems via secure APIs.", "order_index": 6},
        {"term": "Recovery Time Objective (RTO)", "definition": "The target duration of time and service level within which a business process or mission-critical system must be restored after a disaster or disruption.", "order_index": 7},
        {"term": "Recovery Point Objective (RPO)", "definition": "The maximum acceptable amount of data loss measured in time preceding a disaster or disruption.", "order_index": 8}
    ]
    for t in terms_to_seed:
        if not db.query(GlossaryTerm).filter(GlossaryTerm.term == t["term"]).first():
            db.add(GlossaryTerm(**t))

    # -------------------------------------------------------------
    # 16.1 GENERAL INSTRUCTIONS (Official DICT Guidelines - Page 11)
    # -------------------------------------------------------------
    instructions_to_seed = [
        {"step_number": 1, "instruction_text": "Accomplish Part I (Agency Profile & Strategic Context) citing the specific enabling statutory charter or executive issuance."},
        {"step_number": 2, "instruction_text": "Audit and document Part II (Current ICT Assessment) ensuring that strategic concerns link directly to Organizational Outcomes (OO/MFO/SO)."},
        {"step_number": 3, "instruction_text": "Establish Part III (Proposed ICT Strategy) ensuring Privacy Impact Assessments (PIA) are scheduled for all systems processing personal data."},
        {"step_number": 4, "instruction_text": "Enforce DBM Capitalization Thresholds (₱50,000.00) and multi-year physical deployment targets under Part IV.A resource tables."},
        {"step_number": 5, "instruction_text": "Assert strict four-way mathematical parity across Part IV.B Summary of Investment tables (Grand Total B.1 == B.2 == B.3 == B.4)."}
    ]
    for i in instructions_to_seed:
        if not db.query(GeneralInstruction).filter(GeneralInstruction.step_number == i["step_number"]).first():
            db.add(GeneralInstruction(**i))

    os_census_to_seed = [
        {"os_name": "Windows 11 Enterprise", "workstations_count": 250, "servers_count": 0},
        {"os_name": "Windows 10 Pro", "workstations_count": 180, "servers_count": 0},
        {"os_name": "Ubuntu Linux LTS 24.04", "workstations_count": 45, "servers_count": 8},
        {"os_name": "Windows Server 2022 Datacenter", "workstations_count": 0, "servers_count": 6},
        {"os_name": "Red Hat Enterprise Linux 9", "workstations_count": 0, "servers_count": 4}
    ]
    for osc in os_census_to_seed:
        if not db.query(ClientOsCensus).filter(ClientOsCensus.os_name == osc["os_name"]).first():
            db.add(ClientOsCensus(**osc))

    software_census_to_seed = [
        {"software_name": "Office 365 Enterprise", "license_count": 450},
        {"software_name": "Google Workspace Enterprise", "license_count": 600},
        {"software_name": "Adobe Creative Cloud Suite", "license_count": 35},
        {"software_name": "AutoCAD Design Suite", "license_count": 50},
        {"software_name": "SPSS Statistics Enterprise License", "license_count": 25}
    ]
    for swc in software_census_to_seed:
        if not db.query(OfficeSoftwareCensus).filter(OfficeSoftwareCensus.software_name == swc["software_name"]).first():
            db.add(OfficeSoftwareCensus(**swc))

    ext_campus = campus_instances.get("RO-FIELD") or main_campus

    server_capacities_to_seed = [
        {"campus_id": main_campus.id, "capacity_tier": "Above 4TB", "location": "IN-HOUSE", "quantity": 4},
        {"campus_id": main_campus.id, "capacity_tier": "2TB to 4TB", "location": "IN-HOUSE", "quantity": 6},
        {"campus_id": ext_campus.id, "capacity_tier": "Below 2TB", "location": "IN-HOUSE", "quantity": 2}
    ]
    for sc_data in server_capacities_to_seed:
        if not db.query(ServerCapacityTrack).filter(
            ServerCapacityTrack.campus_id == sc_data["campus_id"],
            ServerCapacityTrack.capacity_tier == sc_data["capacity_tier"],
            ServerCapacityTrack.location == sc_data["location"]
        ).first():
            db.add(ServerCapacityTrack(**sc_data))

    annual_costs_to_seed = [
        {"project_key": "Internet_Main", "cost_type": "Continuing", "item_description": "Dedicated Leased Line Fiber 100Mbps", "unit_cost": Decimal("1200000.00"), "yearly_quantities": {"2026": 1, "2027": 1, "2028": 1}},
        {"project_key": "Cloud_DR", "cost_type": "Continuing", "item_description": "GovCloud Disaster Recovery Mirror", "unit_cost": Decimal("500000.00"), "yearly_quantities": {"2026": 1, "2027": 1, "2028": 1}}
    ]
    for acb in annual_costs_to_seed:
        if not db.query(AnnualCostBreakdown).filter(
            AnnualCostBreakdown.issp_period == baseline_period,
            AnnualCostBreakdown.project_key == acb["project_key"]
        ).first():
            db.add(AnnualCostBreakdown(issp_period=baseline_period, **acb))

    # Record initial audit entry for COA compliance tracking
    initial_audit = AuditTrail(
        module="GOVERNANCE",
        action="SYSTEM_BOOTSTRAP_SEEDED",
        user_id=None,
        new_value={"cycle": baseline_period, "agency": agency_name, "version": "DICT v.2026"}
    )
    db.add(initial_audit)

    db.commit()
    logger.info("Relational database graph successfully committed.")

    # -------------------------------------------------------------
    # 17. ASSERT FOUR-WAY FINANCIAL PARITY (Part IV.B)
    # -------------------------------------------------------------
    logger.info("Executing Four-Way Financial Parity Assertion (Part IV.B)...")
    parity_data = calculate_financial_summaries(db, baseline_period)
    if not parity_data["is_parity_valid"]:
        raise ValueError(f"Parity Failed! Discrepancy: ₱{parity_data['parity_discrepancy']:,.2f}")
    
    logger.info(f"★ CERTIFIED BALANCED ★ Grand Total across B.1, B.2, B.3, B.4: ₱{parity_data['certified_grand_total']:,.2f}")

    # -------------------------------------------------------------
    # 18. END-TO-END SINGULARITY GRAPH CERTIFICATION
    # -------------------------------------------------------------
    logger.info("Certifying Complete Graph Singularity (DICT v.2026 Provenance)...")
    graph_validation = ISSPSingularityEngine.validate_complete_issp_graph(db, baseline_period)
    logger.info(f"★ GRAPH PROVENANCE CERTIFIED ★ {graph_validation['message']}")

    # -------------------------------------------------------------
    # 19. SEED DICT DOCUMENT TREE
    # -------------------------------------------------------------
    seed_document_hierarchy(db)
    db.commit()
    return dept_instances


def onboard_user(db, email, password, role_tag, dept_name, dept_instances):
    if not is_domain_allowed(email):
        logger.error(f"Onboarding Blocked: '{email}' is outside authorized domains: {settings.ALLOWED_EMAIL_DOMAINS}")
        return

    role_map = {
        "mis_admin": RoleTag.ROLE_MIS_ADMIN,
        "dept_user": RoleTag.ROLE_DEPT_USER,
        "supply_user": RoleTag.ROLE_SUPPLY_USER,
    }
    resolved_role = role_map.get(role_tag, RoleTag.ROLE_DEPT_USER)

    dept_id = None
    if dept_name and dept_instances and dept_name in dept_instances:
        dept_id = dept_instances[dept_name].id

    user = db.query(User).filter(User.email == email).first()
    hashed_pwd = bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

    if not user:
        user = User(
            email=email,
            role_tag=resolved_role,
            department_id=dept_id,
            is_whitelisted=True,
            password_hash=hashed_pwd
        )
        db.add(user)
        db.flush()
        logger.info(f"User account created: '{email}' ({resolved_role.value})")

        # Record user onboarding in audit trail
        audit = AuditTrail(
            module="AUTHENTICATION",
            action="USER_SEEDED_INITIAL",
            user_id=user.id,
            department_id=dept_id,
            new_value={"email": email, "role": resolved_role.value}
        )
        db.add(audit)
        db.flush()
    else:
        user.password_hash = hashed_pwd
        user.role_tag = resolved_role
        user.department_id = dept_id
        user.is_whitelisted = True
        db.flush()
        logger.info(f"User credentials updated: '{email}'")

        # Record user credential sync in audit trail
        audit = AuditTrail(
            module="AUTHENTICATION",
            action="USER_SEED_CREDENTIALS_UPDATED",
            user_id=user.id,
            department_id=dept_id,
            new_value={"email": email, "role": resolved_role.value}
        )
        db.add(audit)
        db.flush()


def main():
    parser = argparse.ArgumentParser(description="Secure e-ISSP Database Seeder (DICT ISSP v.2026 Canonical)")
    parser.add_argument("--seed-metadata", action="store_true", help="Seed baseline singular relational graph.")
    parser.add_argument("--create-user", action="store_true", help="Onboard a user.")
    parser.add_argument("--email", type=str, help="Institutional email address.")
    parser.add_argument("--password", type=str, help="Password for user.")
    parser.add_argument("--role", type=str, choices=["mis_admin", "dept_user", "supply_user"], help="Authorization role.")
    parser.add_argument("--department", type=str, help="Department name to link.")

    args = parser.parse_args()

    engine = create_engine(settings.DATABASE_URL)
    if "sqlite" in settings.DATABASE_URL.lower():
        @event.listens_for(engine, "connect")
        def set_sqlite_pragma(dbapi_connection, connection_record):
            cursor = dbapi_connection.cursor()
            try:
                cursor.execute("PRAGMA foreign_keys=ON")
            except Exception:
                pass
            cursor.close()

    align_database_schemas(engine)
    patch_runtime_enum_columns()
    patch_resilient_encrypted_json()
    Base.metadata.create_all(bind=engine)

    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    db = SessionLocal()

    try:
        dept_instances = bootstrap_metadata(db)
        default_seed_pwd = getattr(settings, "DEFAULT_SEED_PASSWORD", None) or "admin123"

        if args.create_user and args.email and args.password and args.role:
            onboard_user(db, args.email, args.password, args.role, args.department, dept_instances)
        else:
            allowed = getattr(settings, "ALLOWED_EMAIL_DOMAINS", ["*"])
            seed_domain = "agency.gov.ph"
            for d in allowed:
                if d and d != "*":
                    seed_domain = d.strip().lower()
                    break

            onboard_user(db, f"mis@{seed_domain}", default_seed_pwd, "mis_admin", None, dept_instances)
            onboard_user(db, f"planner@{seed_domain}", default_seed_pwd, "dept_user", "Public Frontline Services and Operations Division", dept_instances)
            onboard_user(db, f"supply@{seed_domain}", default_seed_pwd, "supply_user", "Procurement and Property Management Office", dept_instances)
        
        db.commit()
        logger.info("Default seed execution completed successfully.")
    except Exception as e:
        db.rollback()
        logger.error(f"Seeding failed: {str(e)}", exc_info=True)
        sys.exit(1)
    finally:
        db.close()


if __name__ == "__main__":
    main()
