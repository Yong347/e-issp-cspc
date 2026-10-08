# app/main.py
"""
=============================================================================
DICT ISSP v.2026 COMPLIANCE ENGINE — FASTAPI APPLICATION CORE & LIFESPAN
=============================================================================
Core Capabilities:
- Application Bootstrapping, Dynamic Lifespan Context & Diagnostics
- Dialect-Agnostic Schema Alignment & Native Operator Cleaning (Postgres/SQLite)
- Resilience Patching for Cryptographic Decryption & JSON Serialization
- CORS Security Middleware & Structured JSON Error Handlers
- Single Source of Truth Router Registrations (Auth, Dept, Admin, Supply)
=============================================================================
"""

import os
import sys
import re
import time
import json
import enum
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
from sqlalchemy.ext.mutable import MutableDict, MutableList

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
    ScopeChoice,
    ResilientJSON,
    ResilientMutableDict,
    ResilientMutableList,
    EncryptedJSON,
    StrategicCategory,
    UacsCatalogItem,
    SystemTaxonomy,
    DynamicChecklistCriteria
)
from app.database.session import engine, db_session, SessionLocal

# Configure stdout diagnostics logging
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


def patch_resilient_encrypted_json():
    """
    Hardens EncryptedJSON and ResilientJSON against key rotation, salt mismatches, or legacy cipher strings.
    Dynamically wraps process_result_value to gracefully fall back to {}
    if decryption fails, avoiding DecryptionError crashes and enabling database auto-healing.
    Also ensures MutableDict and MutableList have resilient string coercion active across all models.
    """
    try:
        from cryptography.fernet import Fernet
        from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
        from cryptography.hazmat.primitives import hashes
        import base64

        # Enforce resilient coercion globally on MutableDict and MutableList
        if hasattr(models_module, "ResilientMutableDict"):
            MutableDict.coerce = classmethod(models_module.ResilientMutableDict.coerce)
        if hasattr(models_module, "ResilientMutableList"):
            MutableList.coerce = classmethod(models_module.ResilientMutableList.coerce)

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

    for json_cls_name in ("EncryptedJSON", "ResilientJSON"):
        if hasattr(models_module, json_cls_name):
            target_cls = getattr(models_module, json_cls_name)
            orig_process = target_cls.process_result_value

            def safe_process_result_value(self, value, dialect):
                if value is None:
                    return {}
                try:
                    res = orig_process(self, value, dialect)
                    return res if isinstance(res, dict) else {}
                except Exception as exc:
                    logger.warning(
                        f"Decryption recovery: Unable to decrypt payload ({exc}). "
                        f"Recovering with empty dictionary {{}} to allow auto-healing."
                    )
                    return {}

            target_cls.process_result_value = safe_process_result_value


def patch_runtime_enum_columns():
    """
    Patches column type processors dynamically so that:
    1. Native PostgreSQL Enum columns bind uppercase enum names without type representation errors.
    2. VARCHAR columns storing human-readable string values deserialize cleanly.
    3. Excludes legacy purged document tree tables and dynamic database-backed tables.
    4. Re-verifies resilient EncryptedJSON patching across all mappers.
    """
    pass


    patch_resilient_encrypted_json()

    # Native database enum columns
    native_enum_columns = {
        ("users", "role_tag"): (RoleTag, True),
    }

    # Reference VARCHAR enum fallback columns
    varchar_enum_columns = {
        ("issp_core", "office_location"): (OfficeLocation, False),
        ("issp_core", "fund_source"): (FundSource, False),
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

    # Patch Table columns with defensive type inspection
    for table in Base.metadata.tables.values():
        for column in table.columns:
            key = (table.name, column.name)
            if key in configs:
                enum_cls, send_name = configs[key]
                if isinstance(enum_cls, type) and issubclass(enum_cls, enum.Enum):
                    column.type = SafeEnumType(enum_cls, send_name=send_name)

    # Patch ORM class mappers with defensive type inspection
    for mapper in Base.registry.mappers:
        t_name = mapper.local_table.name
        for prop in mapper.column_attrs:
            for col in prop.columns:
                key = (t_name, col.name)
                if key in configs:
                    enum_cls, send_name = configs[key]
                    if isinstance(enum_cls, type) and issubclass(enum_cls, enum.Enum):
                        col.type = SafeEnumType(enum_cls, send_name=send_name)


def strip_html_tags(text_val: str) -> str:
    """Helper to convert any residual HTML strings into clean structured plain text."""
    if not text_val:
        return ""
    clean = re.sub(r'</?(p|br|li|h[1-6]|tr|div)[^>]*>', '\n', str(text_val), flags=re.IGNORECASE)
    clean = re.sub(r'<[^>]+>', '', clean)
    clean = clean.replace('&amp;', '&').replace('&lt;', '<').replace('&gt;', '>').replace('&quot;', '"').replace('&#39;', "'")
    clean = re.sub(r'\n\s*\n+', '\n\n', clean).strip()
    return clean


def align_database_schemas(engine):
    """
    Defensively inspects target database tables at runtime and:
    1. Defensively drops legacy document tree tables and PostgreSQL types.
    2. Converts legacy native ENUM columns to standard VARCHAR types to prevent InvalidTextRepresentation.
    3. Synchronizes missing columns for DICT v.2026 specifications.
    4. Ensures zero hardcoded deletion of user-created projects or institutional names.
    5. Preserves legitimate human signatory names on the cover page without overwriting them with generic titles.
    6. Seeds initial baseline records for dynamic strategic categories, UACS catalog, and policy settings ONLY if empty.
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
            logger.debug(f"Defensive statement bypassed: {e}")

    with engine.begin() as conn:
        # ==========================================================
        # 1. PURGE LEGACY TABLES & POSTGRESQL NATIVE TYPES
        # ==========================================================
        safe_exec(conn, text("DROP TABLE IF EXISTS issp_assets CASCADE;"))
        safe_exec(conn, text("DROP TABLE IF EXISTS issp_contents CASCADE;"))
        safe_exec(conn, text("DROP TABLE IF EXISTS issp_vocabulary CASCADE;"))
        safe_exec(conn, text("DROP TABLE IF EXISTS issp_nodes CASCADE;"))

        if not is_sqlite:
            safe_exec(conn, text("""
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

            # Safely terminate orphan idle transactions
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

            # Defensive Alter: Convert issp_core.system_development_status to VARCHAR(100)
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

            # Defensive Alter: Convert issp_core.category from ENUM to VARCHAR(100)
            safe_exec(conn, text("""
                DO $$
                BEGIN
                    IF EXISTS (
                        SELECT 1 
                        FROM information_schema.columns 
                        WHERE table_name = 'issp_core' 
                          AND column_name = 'category' 
                          AND (data_type = 'USER-DEFINED' OR udt_name = 'proposalcategory')
                    ) THEN
                        ALTER TABLE issp_core ALTER COLUMN category DROP DEFAULT;
                        ALTER TABLE issp_core ALTER COLUMN category TYPE VARCHAR(100) USING category::text;
                        ALTER TABLE issp_core ALTER COLUMN category SET DEFAULT 'Hardware';
                        DROP TYPE IF EXISTS proposalcategory CASCADE;
                    END IF;
                EXCEPTION WHEN OTHERS THEN
                    NULL;
                END $$;
            """))

            # Defensive Alter: Convert issp_core.status from ENUM to VARCHAR(100)
            safe_exec(conn, text("""
                DO $$
                BEGIN
                    IF EXISTS (
                        SELECT 1 
                        FROM information_schema.columns 
                        WHERE table_name = 'issp_core' 
                          AND column_name = 'status' 
                          AND (data_type = 'USER-DEFINED' OR udt_name = 'proposalstatus')
                    ) THEN
                        ALTER TABLE issp_core ALTER COLUMN status DROP DEFAULT;
                        ALTER TABLE issp_core ALTER COLUMN status TYPE VARCHAR(100) USING status::text;
                        ALTER TABLE issp_core ALTER COLUMN status SET DEFAULT 'Draft';
                        DROP TYPE IF EXISTS proposalstatus CASCADE;
                    END IF;
                EXCEPTION WHEN OTHERS THEN
                    NULL;
                END $$;
            """))

            # Defensive Alter: Convert issp_core.strategic_category to VARCHAR(100)
            safe_exec(conn, text("""
                DO $$
                BEGIN
                    IF EXISTS (
                        SELECT 1 
                        FROM information_schema.columns 
                        WHERE table_name = 'issp_core' 
                          AND column_name = 'strategic_category' 
                          AND (data_type = 'USER-DEFINED' OR udt_name = 'projectcategory')
                    ) THEN
                        ALTER TABLE issp_core ALTER COLUMN strategic_category DROP DEFAULT;
                        ALTER TABLE issp_core ALTER COLUMN strategic_category TYPE VARCHAR(100) USING strategic_category::text;
                        ALTER TABLE issp_core ALTER COLUMN strategic_category SET DEFAULT 'Office Productivity';
                        DROP TYPE IF EXISTS projectcategory CASCADE;
                    END IF;
                EXCEPTION WHEN OTHERS THEN
                    NULL;
                END $$;
            """))

            # Defensive Alter: Convert existing_inventory.status to VARCHAR(100)
            safe_exec(conn, text("""
                DO $$
                BEGIN
                    IF EXISTS (
                        SELECT 1 
                        FROM information_schema.columns 
                        WHERE table_name = 'existing_inventory' 
                          AND column_name = 'status' 
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

            # Defensive Alter: Convert master_narratives.scope_choice to VARCHAR(100)
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

            # Defensive Alter: Ensure issp_core.outcome_id is nullable
            safe_exec(conn, text("""
                DO $$
                BEGIN
                    IF EXISTS (
                        SELECT 1 FROM information_schema.columns 
                        WHERE table_name = 'issp_core' AND column_name = 'outcome_id'
                          AND is_nullable = 'NO'
                    ) THEN
                        ALTER TABLE issp_core ALTER COLUMN outcome_id DROP NOT NULL;
                    END IF;
                EXCEPTION WHEN OTHERS THEN
                    NULL;
                END $$;
            """))

            # Defensive Alter: Release NOT NULL constraint from issp_core.created_by_students
            safe_exec(conn, text("""
                DO $$
                BEGIN
                    IF EXISTS (
                        SELECT 1 FROM information_schema.columns 
                        WHERE table_name = 'issp_core' AND column_name = 'created_by_students'
                    ) THEN
                        ALTER TABLE issp_core ALTER COLUMN created_by_students DROP NOT NULL;
                        ALTER TABLE issp_core ALTER COLUMN created_by_students SET DEFAULT false;
                        UPDATE issp_core 
                        SET created_by_students = COALESCE(is_in_house_turnover, false) 
                        WHERE created_by_students IS NULL;
                    END IF;
                EXCEPTION WHEN OTHERS THEN
                    NULL;
                END $$;
            """))

            # Defensive Alter: Ensure stakeholder_analyses complexity fields accept flexible range strings
            safe_exec(conn, text("""
                DO $$
                BEGIN
                    IF EXISTS (
                        SELECT 1 FROM information_schema.columns 
                        WHERE table_name = 'stakeholder_analyses' AND column_name = 'complexity_incoming'
                    ) THEN
                        ALTER TABLE stakeholder_analyses ALTER COLUMN complexity_incoming TYPE VARCHAR(100);
                        ALTER TABLE stakeholder_analyses ALTER COLUMN complexity_outgoing TYPE VARCHAR(100);
                    END IF;
                EXCEPTION WHEN OTHERS THEN
                    NULL;
                END $$;
            """))

        # Normalize corrupt, legacy ciphertext, or empty string payload columns in issp_core
        safe_exec(conn, text("""
            UPDATE issp_core 
            SET payload = '{}' 
            WHERE payload IS NULL 
               OR payload = '' 
               OR payload = 'null' 
               OR payload = 'None'
               OR payload LIKE 'v3$%' 
               OR payload LIKE 'v2$%';
        """))

        # ==========================================================
        # 2. DYNAMIC FIELD BACKFILL (NEVER OVERWRITE REAL SIGNATORY NAMES)
        # ==========================================================
        default_agency = getattr(settings, "DEFAULT_AGENCY_NAME", "National Government Agency").replace("'", "''")
        default_website = getattr(settings, "DEFAULT_AGENCY_WEBSITE", "https://agency.gov.ph").replace("'", "''")
        default_head_title = getattr(settings, "DEFAULT_AGENCY_HEAD_TITLE", "Head of Agency").replace("'", "''")

        # Safely populate institutional identity ONLY when completely empty
        safe_exec(conn, text(f"""
            UPDATE master_narratives 
            SET agency_name = '{default_agency}'
            WHERE agency_name IS NULL OR agency_name = '';
        """))

        safe_exec(conn, text(f"""
            UPDATE master_narratives 
            SET agency_website_url = '{default_website}'
            WHERE agency_website_url IS NULL OR agency_website_url = '';
        """))

        safe_exec(conn, text(f"""
            UPDATE master_narratives 
            SET agency_head_position = '{default_head_title}' 
            WHERE agency_head_position IS NULL OR agency_head_position = '';
        """))

        # Preserve human signatory full names without overwriting them with generic position titles
        safe_exec(conn, text("""
            UPDATE master_narratives 
            SET signatory_prepared_by = 'REY T. CORTEZ, MIT'
            WHERE signatory_prepared_by IS NULL OR signatory_prepared_by = ''
               OR LOWER(TRIM(signatory_prepared_by)) IN ('chief information officer', 'cio', 'none', 'null', 'undefined');
        """))

        safe_exec(conn, text("""
            UPDATE master_narratives 
            SET preparer_position = 'Chief Information Officer'
            WHERE preparer_position IS NULL OR preparer_position = '';
        """))

        safe_exec(conn, text("""
            UPDATE master_narratives 
            SET signatory_approved_by = 'AMADO A. OLIVA JR, PhD.'
            WHERE signatory_approved_by IS NULL OR signatory_approved_by = ''
               OR LOWER(TRIM(signatory_approved_by)) IN ('head of agency', 'agency head', 'college president', 'president', 'none', 'null', 'undefined');
        """))

        # Safely resolve dynamic active cycle period
        active_period = conn.execute(text(
            "SELECT issp_period FROM master_narratives WHERE is_active = true LIMIT 1"
        )).scalar()
        if not active_period:
            active_period = conn.execute(text(
                "SELECT value FROM system_settings WHERE key = 'issp_active_cycle' LIMIT 1"
            )).scalar() or getattr(settings, "DEFAULT_ISSP_CYCLE", "2028-2030")

        # Seed Baseline Stakeholder Analysis ONLY if table is completely empty for active cycle
        stakeholders_count = conn.execute(
            text("SELECT COUNT(*) FROM stakeholder_analyses WHERE issp_period = :period"),
            {"period": active_period}
        ).scalar() or 0

        if stakeholders_count == 0:
            safe_exec(conn, text("""
                INSERT INTO stakeholder_analyses (
                    issp_period, stakeholder_group, transaction_processed_incoming, 
                    complexity_incoming, transaction_processed_outgoing, complexity_outgoing
                ) VALUES 
                (:period, 'General Citizens and Service Applicants', 'Online service inquiries, application submissions, and electronic fee settlement', 'Simple', 'Official E-Certificates, clearances, regulatory statements, and receipts', 'Simple'),
                (:period, 'Institutional Staff, Planners and Division Heads', 'Budget allotment requests, work programs, activity proposals, and leave clearances', 'Complex', 'Disbursement vouchers, approved PRs, compliance endorsements, and performance scorecards', 'Simple'),
                (:period, 'National Oversight and Regulatory Agencies (DICT, DBM, COA)', 'Statutory compliance circulars, mandate benchmarks, audit inquiries, and MITHI surveys', 'Highly Technical', 'Completed ISSP documentation, UACS audit ledgers, PREXC accomplishment reports', 'Highly Technical');
            """), {"period": active_period})

        # Purge sample dummy systems from Annex 2 BIA summary ONLY if actual systems exist
        safe_exec(conn, text("""
            DELETE FROM dr_bia_summary
            WHERE system_name IN (
                'Public Licensing Portal',
                'Integrated HR & Payroll',
                'Official Website',
                'Document Tracking'
            ) AND EXISTS (
                SELECT 1 FROM dr_bia_summary d2 
                WHERE d2.system_name NOT IN ('Public Licensing Portal', 'Integrated HR & Payroll', 'Official Website', 'Document Tracking')
            );
        """))

        # Deduplicate Duplicate Cybersecurity Controls
        if not is_sqlite:
            safe_exec(conn, text("""
                DELETE FROM cybersecurity_controls a USING cybersecurity_controls b
                WHERE a.id > b.id
                  AND LOWER(TRIM(a.control_name)) = LOWER(TRIM(b.control_name))
                  AND a.is_proposed = b.is_proposed
                  AND a.issp_period = b.issp_period;
            """))
        else:
            safe_exec(conn, text("""
                DELETE FROM cybersecurity_controls
                WHERE id NOT IN (
                    SELECT MIN(id)
                    FROM cybersecurity_controls
                    GROUP BY LOWER(TRIM(control_name)), is_proposed, issp_period
                );
            """))

        # Deduplicate Duplicate Glossary Terms
        safe_exec(conn, text("""
            DELETE FROM glossary_terms
            WHERE UPPER(TRIM(term)) IN ('ISSP', 'RTO', 'RPO')
              AND EXISTS (
                  SELECT 1 FROM glossary_terms g2
                  WHERE g2.id <> glossary_terms.id
                    AND (
                        g2.term ILIKE '%Information Systems Strategic Plan%'
                        OR g2.term ILIKE '%Recovery Time Objective%'
                        OR g2.term ILIKE '%Recovery Point Objective%'
                    )
              );
        """))

        # Inspect database tables safely for missing column synchronization
        inspector = inspect(conn)
        table_names = inspector.get_table_names()

        # ==========================================================
        # 3. COLUMN SYNCHRONIZATION FOR DICT v.2026 SPECIFICATIONS
        # ==========================================================

        # Patch 'master_narratives' table (Plain text fields + dual export vault URLs)
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
                "agency_head_position": f"VARCHAR(200) DEFAULT '{default_head_title}'",
                "drbcp_approval_date": "VARCHAR(100)",
                "authoring_cycle_duration": "INTEGER DEFAULT 3",
                "site_development_plan_url": "VARCHAR(500)",
                "fiber_backbone_url": "VARCHAR(500)",
                "system_architecture_url": "VARCHAR(500)",
                "process_flow_diagram_url": "VARCHAR(500)",
                "network_diagram_url": "VARCHAR(500)",
                "org_chart_url": "VARCHAR(500)",
                "existing_ict_org_url": "VARCHAR(500)",
                "proposed_ict_org_url": "VARCHAR(500)",
                "subsystem_network_layouts_json": "JSON DEFAULT '[]'",
                "planners_json": "JSON DEFAULT '[]'",
                "manpower_json": "JSON DEFAULT '{}'",
                "annual_ict_budget": "NUMERIC(15, 2) DEFAULT 0.00",
                "mandate_text": "TEXT DEFAULT ''",
                "vision_text": "TEXT DEFAULT ''",
                "mission_text": "TEXT DEFAULT ''",
                "present_situation_text": "TEXT DEFAULT ''",
                "enterprise_architecture_narrative": "TEXT",
                "drbcp_affected_assets_json": "JSON DEFAULT '[]'",
                "drbcp_recovery_strategy_text": "TEXT",
                "drbcp_sop_phases_text": "TEXT",
                "drbcp_compliance_narrative_text": "TEXT",
                "is_archived": f"BOOLEAN DEFAULT {bool_false}",
                "final_pdf_vault_url": "VARCHAR(500)",
                "final_docx_vault_url": "VARCHAR(500)",
                "dict_logo_url": "VARCHAR(500)",
                "bagong_pilipinas_logo_url": "VARCHAR(500)",
                "agency_logo_url": "VARCHAR(500)",
                "cert_logo_url": "VARCHAR(500)"
            }
            for col_name, col_def in columns_to_sync_narrative.items():
                if col_name not in narrative_cols:
                    logger.info(f"Defensive Sync: Appending missing column '{col_name}' to 'master_narratives'.")
                    safe_exec(conn, text(f"ALTER TABLE master_narratives ADD COLUMN {col_name} {col_def}"))

            # Backfill plain-text fields from legacy HTML fields if needed, stripping tags cleanly
            if 'mandate_html' in narrative_cols and 'mandate_text' in narrative_cols:
                safe_exec(conn, text("""
                    UPDATE master_narratives
                    SET mandate_text = mandate_html
                    WHERE (mandate_text IS NULL OR mandate_text = '') AND mandate_html IS NOT NULL AND mandate_html != '';
                """))
            if 'vision_html' in narrative_cols and 'vision_text' in narrative_cols:
                safe_exec(conn, text("""
                    UPDATE master_narratives
                    SET vision_text = vision_html
                    WHERE (vision_text IS NULL OR vision_text = '') AND vision_html IS NOT NULL AND vision_html != '';
                """))
            if 'mission_html' in narrative_cols and 'mission_text' in narrative_cols:
                safe_exec(conn, text("""
                    UPDATE master_narratives
                    SET mission_text = mission_html
                    WHERE (mission_text IS NULL OR mission_text = '') AND mission_html IS NOT NULL AND mission_html != '';
                """))
            if 'present_situation_html' in narrative_cols and 'present_situation_text' in narrative_cols:
                safe_exec(conn, text("""
                    UPDATE master_narratives
                    SET present_situation_text = present_situation_html
                    WHERE (present_situation_text IS NULL OR present_situation_text = '') AND present_situation_html IS NOT NULL AND present_situation_html != '';
                """))

        # Patch 'information_systems' table (Part II.C & Part III.D specifications)
        if "information_systems" in table_names:
            sys_cols = [c['name'] for c in inspector.get_columns('information_systems')]
            columns_to_sync_sys = {
                "issp_period": "VARCHAR(50) DEFAULT '2026-2028'",
                "strategic_concern_id": f"{uuid_type}",
                "department_id": "INTEGER",
                "needs_assessment_id": f"{uuid_type}",
                "project_id": f"{uuid_type}",
                "submission_status": "VARCHAR(50) DEFAULT 'Approved'",
                "rejection_reason": "TEXT",
                "name": "VARCHAR(255) DEFAULT ''",
                "status": "VARCHAR(50) DEFAULT 'Operational'",
                "classification": "VARCHAR(100) DEFAULT 'Operations - Frontline Service'",
                "proposed_cost": "NUMERIC(15, 2) DEFAULT 0.00",
                "is_client_facing": f"BOOLEAN DEFAULT {bool_true}",
                "is_support_to_operations": f"BOOLEAN DEFAULT {bool_false}",
                "is_general_administrative": f"BOOLEAN DEFAULT {bool_false}",
                "is_operations": f"BOOLEAN DEFAULT {bool_true}",
                "is_frontline_service": f"BOOLEAN DEFAULT {bool_true}",
                "frontline_hosting_type": "VARCHAR(50) DEFAULT 'Online'",
                "online_url": "VARCHAR(255)",
                "is_non_frontline_service": f"BOOLEAN DEFAULT {bool_false}",
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
                "has_undergone_pia": f"BOOLEAN DEFAULT {bool_false}",
                "pia_target_date_text": "VARCHAR(100)"
            }
            for col_name, col_def in columns_to_sync_sys.items():
                if col_name not in sys_cols:
                    logger.info(f"Defensive Sync: Appending missing column '{col_name}' to 'information_systems'.")
                    safe_exec(conn, text(f"ALTER TABLE information_systems ADD COLUMN {col_name} {col_def}"))

            # Indexes on new columns
            sys_indexes = [ix['name'] for ix in inspector.get_indexes('information_systems')]
            if "ix_information_systems_department_id" not in sys_indexes:
                safe_exec(conn, text("CREATE INDEX IF NOT EXISTS ix_information_systems_department_id ON information_systems (department_id)"))
            if "ix_information_systems_needs_assessment_id" not in sys_indexes:
                safe_exec(conn, text("CREATE INDEX IF NOT EXISTS ix_information_systems_needs_assessment_id ON information_systems (needs_assessment_id)"))
            if "ix_information_systems_submission_status" not in sys_indexes:
                safe_exec(conn, text("CREATE INDEX IF NOT EXISTS ix_information_systems_submission_status ON information_systems (submission_status)"))
            if "ix_information_systems_project_id" not in sys_indexes:
                safe_exec(conn, text("CREATE INDEX IF NOT EXISTS ix_information_systems_project_id ON information_systems (project_id)"))

            # Backfill submission_status & link department_id where matching system_owner_office
            safe_exec(conn, text("UPDATE information_systems SET submission_status = 'Approved' WHERE submission_status IS NULL OR submission_status = ''"))
            safe_exec(conn, text("""
                UPDATE information_systems
                SET department_id = (
                    SELECT id FROM departments
                    WHERE LOWER(TRIM(departments.name)) = LOWER(TRIM(information_systems.system_owner_office))
                    LIMIT 1
                )
                WHERE department_id IS NULL 
                  AND system_owner_office IS NOT NULL 
                  AND system_owner_office <> '';
            """))

            # Backfill information_systems.project_id from existing ict_projects.system_id
            safe_exec(conn, text("""
                UPDATE information_systems
                SET project_id = (
                    SELECT id FROM ict_projects
                    WHERE ict_projects.system_id = information_systems.id
                    LIMIT 1
                )
                WHERE project_id IS NULL;
            """))

            # Synchronize is_client_facing with is_frontline_service
            safe_exec(conn, text("""
                UPDATE information_systems 
                SET is_client_facing = is_frontline_service 
                WHERE is_client_facing IS NULL;
            """))

            # Harmonize multi-classification boolean flags
            safe_exec(conn, text("""
                UPDATE information_systems 
                SET 
                    is_support_to_operations = CASE 
                        WHEN LOWER(classification) LIKE '%support%' THEN 1 
                        ELSE 0 
                    END,
                    is_general_administrative = CASE 
                        WHEN LOWER(classification) LIKE '%general administrative%' OR LOWER(classification) LIKE '%administrative%' THEN 1 
                        ELSE 0 
                    END,
                    is_operations = CASE 
                        WHEN LOWER(classification) LIKE '%operations%' 
                          OR is_frontline_service = 1 
                          OR is_non_frontline_service = 1 THEN 1 
                        ELSE 0 
                    END,
                    is_frontline_service = CASE 
                        WHEN LOWER(classification) LIKE '%frontline%' AND LOWER(classification) NOT LIKE '%non-frontline%' THEN 1 
                        ELSE 0 
                    END,
                    is_non_frontline_service = CASE 
                        WHEN LOWER(classification) LIKE '%non-frontline%' THEN 1 
                        ELSE 0 
                    END;
            """))

            safe_exec(conn, text("""
                UPDATE information_systems
                SET is_operations = 1
                WHERE (is_support_to_operations = 0 OR is_support_to_operations IS NULL)
                  AND (is_general_administrative = 0 OR is_general_administrative IS NULL)
                  AND (is_operations = 0 OR is_operations IS NULL);
            """))

        # Patch 'organizational_outcomes' table
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
                    logger.info(f"Defensive Sync: Appending missing column '{col_name}' to 'organizational_outcomes'.")
                    safe_exec(conn, text(f"ALTER TABLE organizational_outcomes ADD COLUMN {col_name} {col_def}"))
            
            safe_exec(conn, text("UPDATE organizational_outcomes SET outcome_name = program_name WHERE outcome_name IS NULL AND program_name IS NOT NULL"))
            safe_exec(conn, text("UPDATE organizational_outcomes SET program_name = outcome_name WHERE program_name IS NULL AND outcome_name IS NOT NULL"))

        # Patch 'strategic_concerns' table
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

        # Patch 'issp_core' table (Unified Proposals Ledger)
        if "issp_core" in table_names:
            core_cols = [c['name'] for c in inspector.get_columns('issp_core')]
            columns_to_sync_core = {
                "project_id": f"{uuid_type}",
                "needs_assessment_id": f"{uuid_type}",
                "strategic_category_id": "INTEGER",
                "outcome_id": "INTEGER",
                "item_key": "VARCHAR(100)",
                "item_name": "VARCHAR(255) DEFAULT ''",
                "category": "VARCHAR(100) DEFAULT 'Hardware'",
                "strategic_category": "VARCHAR(100) DEFAULT 'Office Productivity'",
                "office_location": "VARCHAR(100) DEFAULT 'Central Office'",
                "fund_source": "VARCHAR(100) DEFAULT 'General Appropriations Act (GAA)'",
                "uacs_object_code": "VARCHAR(150) DEFAULT '50604050 03 - ICT Equipment (CO)'",
                "expenditure_class": "VARCHAR(100) DEFAULT 'Capital Outlay'",
                "yearly_quantities": "JSON DEFAULT '{}'",
                "total_qty": "INTEGER DEFAULT 0",
                "total_cost": "NUMERIC(15, 2) DEFAULT 0.00",
                "system_development_status": "VARCHAR(100) DEFAULT 'N/A'",
                "created_by_students": f"BOOLEAN DEFAULT {bool_false}",
                "is_in_house_turnover": f"BOOLEAN DEFAULT {bool_false}",
                "target_office_automated": "VARCHAR(200)",
                "canvas_evidence_url": "VARCHAR(500)",
                "canvas_expiration_date": "TIMESTAMP NULL",
                "supplier_name": "VARCHAR(200)",
                "comments": "JSON DEFAULT '[]'",
                "is_expansion": f"BOOLEAN DEFAULT {bool_false}",
                "is_archived": f"BOOLEAN DEFAULT {bool_false}"
            }
            for col_name, col_def in columns_to_sync_core.items():
                if col_name not in core_cols:
                    logger.info(f"Defensive Sync: Appending missing column '{col_name}' to 'issp_core'.")
                    safe_exec(conn, text(f"ALTER TABLE issp_core ADD COLUMN {col_name} {col_def}"))

        # Patch 'existing_inventory' table
        if "existing_inventory" in table_names:
            inv_cols = [c['name'] for c in inspector.get_columns('existing_inventory')]
            columns_to_sync_inv = {
                "department_id": "INTEGER",
                "issp_period": "VARCHAR(50) DEFAULT '2026-2028'",
                "replacement_proposal_id": f"{uuid_type}",
                "dict_category": "VARCHAR(100)",
                "other_category_name": "VARCHAR(200)",
                "item_name": "VARCHAR(200) DEFAULT ''",
                "specs": "TEXT",
                "exact_model": "VARCHAR(200)",
                "quantity": "INTEGER DEFAULT 1",
                "status": "VARCHAR(100) DEFAULT 'Functional'",
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

        # Patch 'egovernment_checklists' table
        if "egovernment_checklists" in table_names:
            egov_cols = [c['name'] for c in inspector.get_columns('egovernment_checklists')]
            columns_to_sync_egov = {
                "is_manual": f"BOOLEAN DEFAULT {bool_false}",
                "is_proposed_development": f"BOOLEAN DEFAULT {bool_false}",
                "adoption_ratio": "VARCHAR(100)",
                "channels_json": "JSON DEFAULT '[]'",
                "is_connected_to_portal": f"BOOLEAN DEFAULT {bool_false}",
                "equivalent_system_name": "VARCHAR(255)",
                "equivalent_system_url": "VARCHAR(255)",
                "has_other_payment_platform": f"BOOLEAN DEFAULT {bool_false}",
                "proposed_development_name": "VARCHAR(255)",
                "total_employees": "VARCHAR(50)",
                "active_pnpki_count": "VARCHAR(50)"
            }
            for col_name, col_def in columns_to_sync_egov.items():
                if col_name not in egov_cols:
                    logger.info(f"Defensive Sync: Appending missing column '{col_name}' to 'egovernment_checklists'.")
                    safe_exec(conn, text(f"ALTER TABLE egovernment_checklists ADD COLUMN {col_name} {col_def}"))

        # Patch 'stakeholder_analyses' table
        if "stakeholder_analyses" in table_names:
            sh_cols = [c['name'] for c in inspector.get_columns('stakeholder_analyses')]
            columns_to_sync_sh = {
                "issp_period": "VARCHAR(50) DEFAULT '2026-2028'",
                "stakeholder_group": "VARCHAR(150)",
                "transaction_processed_incoming": "TEXT",
                "transaction_processed_outgoing": "TEXT",
                "complexity_incoming": "VARCHAR(100) DEFAULT 'Simple'",
                "complexity_outgoing": "VARCHAR(100) DEFAULT 'Simple'"
            }
            for col_name, col_def in columns_to_sync_sh.items():
                if col_name not in sh_cols:
                    logger.info(f"Defensive Sync: Appending missing column '{col_name}' to 'stakeholder_analyses'.")
                    safe_exec(conn, text(f"ALTER TABLE stakeholder_analyses ADD COLUMN {col_name} {col_def}"))

        # Patch 'network_infrastructures' table
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

        # Patch 'dr_bia_summary' table
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

        # Patch 'performance_metrics' table
        if "performance_metrics" in table_names:
            pmf_cols = [c['name'] for c in inspector.get_columns('performance_metrics')]
            if "project_id" not in pmf_cols:
                logger.info(f"Defensive Sync: Appending missing column 'project_id' to 'performance_metrics' as {uuid_type}.")
                safe_exec(conn, text(f"ALTER TABLE performance_metrics ADD COLUMN project_id {uuid_type}"))
            if "annual_targets" not in pmf_cols:
                safe_exec(conn, text("ALTER TABLE performance_metrics ADD COLUMN annual_targets JSON DEFAULT '{}'"))

        # Patch 'budget_ceilings' table
        if "budget_ceilings" in table_names:
            bc_cols = [c['name'] for c in inspector.get_columns('budget_ceilings')]
            columns_to_sync_bc = {
                "allocated_capex": "NUMERIC(15, 2) DEFAULT 0.00",
                "allocated_mooe": "NUMERIC(15, 2) DEFAULT 0.00",
                "issp_period": "VARCHAR(50) DEFAULT '2026-2028'",
                "annual_allocations": "JSON DEFAULT '{}'"
            }
            for col_name, col_def in columns_to_sync_bc.items():
                if col_name not in bc_cols:
                    logger.info(f"Defensive Sync: Appending missing column '{col_name}' to 'budget_ceilings'.")
                    safe_exec(conn, text(f"ALTER TABLE budget_ceilings ADD COLUMN {col_name} {col_def}"))

        # Patch 'ict_projects' table
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
                "harmonization_criteria": "JSON DEFAULT '{}'",
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

            safe_exec(conn, text("UPDATE ict_projects SET harmonization_criteria = '{}' WHERE harmonization_criteria IS NULL;"))

        # Clean broken foreign keys defensively
        if "ict_projects" in table_names and "performance_metrics" in table_names:
            safe_exec(conn, text("""
                DELETE FROM performance_metrics 
                WHERE project_id IS NOT NULL 
                  AND project_id NOT IN (SELECT id FROM ict_projects);
            """))

        # Patch 'needs_assessments' table
        if "needs_assessments" in table_names:
            na_cols = [c['name'] for c in inspector.get_columns('needs_assessments')]
            columns_to_sync_na = {
                "issp_period": "VARCHAR(50) DEFAULT '2026-2028'",
                "is_aggregated": f"BOOLEAN DEFAULT {bool_false}",
                "strategic_concern_id": f"{uuid_type}"
            }
            for col_name, col_def in columns_to_sync_na.items():
                if col_name not in na_cols:
                    logger.info(f"Defensive Sync: Appending missing column '{col_name}' to 'needs_assessments'.")
                    safe_exec(conn, text(f"ALTER TABLE needs_assessments ADD COLUMN {col_name} {col_def}"))

        # Patch 'audit_trails' table
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

        # ==========================================================
        # 4. SEED CANONICAL DYNAMIC TABLES ONLY IF COMPLETELY EMPTY
        # ==========================================================
        if "strategic_categories" in table_names:
            count_cats = conn.execute(text("SELECT COUNT(*) FROM strategic_categories;")).scalar() or 0
            if count_cats == 0:
                safe_exec(conn, text(f"""
                    INSERT INTO strategic_categories (name, code, is_project_linked, is_recurring_expense, order_index, is_active, description)
                    VALUES 
                        ('Office Productivity', 'OFFICE_PRODUCTIVITY', {bool_false}, {bool_false}, 1, {bool_true}, 'Workstations, laptops, and peripheral tools.'),
                        ('Internal ICT Projects', 'INTERNAL_ICT_PROJECT', {bool_true}, {bool_false}, 2, {bool_true}, 'Agency internal IT modernizations.'),
                        ('Cross-Agency ICT Projects', 'CROSS_AGENCY_ICT_PROJECT', {bool_true}, {bool_false}, 3, {bool_true}, 'PeGIF and multi-agency cooperative initiatives.'),
                        ('Continuing Costs/Expenses', 'CONTINUING_COSTS', {bool_false}, {bool_true}, 4, {bool_true}, 'Recurring operating subscriptions and bandwidth.');
                """))

        if "uacs_catalog" in table_names:
            count_uacs = conn.execute(text("SELECT COUNT(*) FROM uacs_catalog;")).scalar() or 0
            if count_uacs == 0:
                safe_exec(conn, text(f"""
                    INSERT INTO uacs_catalog (uacs_code, account_title, expenditure_class, is_subscription_default, is_active, description)
                    VALUES 
                        ('50604050 03', 'ICT Equipment (CO)', 'Capital Outlay', {bool_false}, {bool_true}, 'Hardware >= capitalization threshold.'),
                        ('50604050 07', 'Printing Equipment (CO)', 'Capital Outlay', {bool_false}, {bool_true}, 'Production printers >= capitalization threshold.'),
                        ('50604070 01', 'ICT Software (Perpetual CO)', 'Capital Outlay', {bool_false}, {bool_true}, 'Perpetual licenses and in-house systems.'),
                        ('50203210 03', 'Semi-Expendable ICT Equipment (MOOE)', 'Maintenance and Other Operating Expenses', {bool_false}, {bool_true}, 'ICT equipment under the capitalization threshold.'),
                        ('50203210 07', 'Semi-Expendable Printing Equipment (MOOE)', 'Maintenance and Other Operating Expenses', {bool_false}, {bool_true}, 'Office printers under the capitalization threshold.'),
                        ('50299070 00', 'ICT Software Subscription (MOOE)', 'Maintenance and Other Operating Expenses', {bool_true}, {bool_true}, 'Recurring software subscriptions and cloud hosting.'),
                        ('50202010 00', 'Training Expenses (MOOE)', 'Maintenance and Other Operating Expenses', {bool_false}, {bool_true}, 'Seminars and certification programs.'),
                        ('50211030 00', 'Consulting/Outsourced Development (MOOE)', 'Maintenance and Other Operating Expenses', {bool_false}, {bool_true}, 'Consulting contractors and penetration testing.');
                """))

        if "system_taxonomies" in table_names:
            count_strat = conn.execute(text("SELECT COUNT(*) FROM system_taxonomies WHERE taxonomy_type = 'DEVELOPMENT_STRATEGY';")).scalar() or 0
            if count_strat == 0:
                safe_exec(conn, text(f"""
                    INSERT INTO system_taxonomies (taxonomy_type, code, display_name, order_index, is_active)
                    VALUES 
                        ('DEVELOPMENT_STRATEGY', 'IN_HOUSE', 'In-House Development', 1, {bool_true}),
                        ('DEVELOPMENT_STRATEGY', 'OUTSOURCED', 'Outsourced', 2, {bool_true}),
                        ('DEVELOPMENT_STRATEGY', 'COTS', 'Commercial Off-The-Shelf (COTS)', 3, {bool_true}),
                        ('DEVELOPMENT_STRATEGY', 'COMBINATION', 'Combination / Hybrid', 4, {bool_true});
                """))

        if "dynamic_checklist_criteria" in table_names:
            count_harm = conn.execute(text("SELECT COUNT(*) FROM dynamic_checklist_criteria WHERE checklist_type = 'HARMONIZATION_FRAMEWORK';")).scalar() or 0
            if count_harm == 0:
                safe_exec(conn, text(f"""
                    INSERT INTO dynamic_checklist_criteria (checklist_type, domain_or_category, criteria_name, is_mandatory, is_active, order_index)
                    VALUES 
                        ('HARMONIZATION_FRAMEWORK', 'Harmonization', 'National Prioritization (PDP 2023-2028)', {bool_false}, {bool_true}, 1),
                        ('HARMONIZATION_FRAMEWORK', 'Harmonization', 'Resource Optimization (GovNet, GovCloud)', {bool_false}, {bool_true}, 2),
                        ('HARMONIZATION_FRAMEWORK', 'Harmonization', 'PeGIF Standardized APIs & Interoperability', {bool_true}, {bool_true}, 3),
                        ('HARMONIZATION_FRAMEWORK', 'Harmonization', 'Cross-Agency Collaboration (JMC / MOA)', {bool_false}, {bool_true}, 4),
                        ('HARMONIZATION_FRAMEWORK', 'Harmonization', 'Scalability and Sustainability (SPAR / PREXC)', {bool_true}, {bool_true}, 5);
                """))

        if "system_settings" in table_names:
            defaults = [
                ("capitalization_threshold", "50000.00"),
                ("major_outlay_review_threshold", "2000000.00"),
                ("inflation_rates_by_year", '{"2028": 0.0, "2029": 3.0, "2030": 5.0}'),
                ("hardware_replacement_buffer_units", "3"),
                ("canvas_expiration_warning_days", "14"),
            ]
            for k, v in defaults:
                safe_exec(conn, text(f"""
                    INSERT INTO system_settings (key, value)
                    SELECT '{k}', '{v}'
                    WHERE NOT EXISTS (SELECT 1 FROM system_settings WHERE key = '{k}');
                """))


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Handles application startup and shutdown procedures safely.
    Defensively verifies schemas, purges legacy tables, patches runtime enums,
    and automatically executes cycle expiration / rollover checks.
    """
    agency_label = getattr(settings, "DEFAULT_AGENCY_NAME", "INSTITUTIONAL")
    logger.info("=" * 70)
    logger.info(f"INITIALIZING {agency_label.upper()} E-ISSP COMPLIANCE ENGINE (DICT v.2026)")
    logger.info("=" * 70)
    
    # 0. Defensively patch models listener globals
    # 1. Verify and compile database schema structures
    try:
        logger.info("Verifying and registering database schema metadata...")
        Base.metadata.create_all(bind=engine)
        logger.info("Database base tables verified successfully.")
    except Exception as e:
        logger.critical(f"Failed to initialize metadata tables on startup: {str(e)}", exc_info=True)

    # 2. Defensive Schema Alignment, Operator Sanitization & Data Cleansing
    try:
        align_database_schemas(engine)
    except Exception as schema_err:
        logger.error(f"Defensive schema alignment encountered a non-fatal warning: {str(schema_err)}")

    # 3. Defensively patch all mapped Enum columns for runtime reflection
    try:
        patch_runtime_enum_columns()
    except Exception as enum_err:
        logger.error(f"Runtime enum column patching warning: {str(enum_err)}")

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
    """Returns consolidated engine configurations, active document storage tier, and budget limits."""
    storage_mode = getattr(settings, "STORAGE_TYPE", "local")
    budget_limit = getattr(settings, "GLOBAL_BUDGET_CEILING", 0.0)
    region = getattr(settings, "AWS_S3_REGION_NAME", "LOCAL_REPOSITORY") if storage_mode == "s3" else "LOCAL_REPOSITORY"
    
    return JSONResponse(
        content={
            "status": "online",
            "agency": getattr(settings, "DEFAULT_AGENCY_NAME", "Universal ISSP Engine"),
            "version": "5.0-DICT-v.2026",
            "storage_repository": storage_mode,
            "region": region,
            "global_budget_limit": f"PHP {budget_limit:,.2f}" if budget_limit else "Not Configured"
        }
    )