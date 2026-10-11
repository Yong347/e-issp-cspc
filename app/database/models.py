# app/database/models.py
"""
=============================================================================
DICT ISSP v.2026 COMPLIANCE ENGINE — CORE RELATIONAL MODELS & ARCHITECTURE
=============================================================================
Singularity Relational Core:
- Dialect-Agnostic GUID (CHAR(36)) & Resilient JSON/Mutable Types
- Master Governance Root (MasterNarrative: Cover Sheet, Scope, DRBCP & Vault)
- Permanent Historical Plan Archives (IsspPlanArchive: Pre-Deletion Preservation)
- Program Outcomes (Part I.A.4) -> Strategic Concerns (Part II.A)
- Information Systems Register (Parts II.C & III.D) with Multi-Classification,
  Target Year, and UACS Classification
- ICT Projects Portfolio (Part III.E) with Dynamic Harmonization Framework &
  Direct System Cost Aggregation
- Unified Proposals Ledger (Part IV.A) with Dynamic 3-Year Compounded Targets
  and Bi-directional Information System Linkage
- Annex 1 Master Inventory (Equipment & Software) with Anti-Loop EOL Tracking
- Annex 2 Disaster Recovery and Business Continuity Plan (DRBCP)
=============================================================================
"""

import os
import re
import enum
import uuid
import json
import base64
import logging
from decimal import Decimal
from datetime import datetime
from typing import Any, Dict, List, Optional, Union
from functools import lru_cache

from sqlalchemy import (
    Boolean,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    JSON,
    func,
    event,
    text,
    cast,
    or_,
    and_,
    UniqueConstraint,
    CheckConstraint
)
from sqlalchemy.types import TypeDecorator, CHAR
from sqlalchemy.orm import (
    DeclarativeBase, 
    Mapped, 
    mapped_column, 
    relationship,
    object_session
)
from sqlalchemy.ext.mutable import Mutable, MutableDict, MutableList
from sqlalchemy.ext.hybrid import hybrid_property
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives import hashes

from app.config import settings

logger = logging.getLogger("app.database.models")


# =========================================================================
# SYSTEM EXCEPTIONS
# =========================================================================

class DecryptionError(Exception):
    """Raised when cryptographic decryption fails during legacy payload decoding."""
    def __init__(self, message: str = "Cryptographic decryption failed. Data corruption or incorrect key detected."):
        self.message = message
        super().__init__(message)


class BusinessRuleViolation(ValueError):
    """Raised when an operation violates an active ISSP business rule or budget constraint."""
    def __init__(self, message: str):
        self.message = message
        super().__init__(message)


# =========================================================================
# DIALECT-AGNOSTIC GUID & SAFE ENUM STRING TYPES
# =========================================================================

class GUID(TypeDecorator):
    """
    Platform-independent GUID implementation.
    Standardizes on CHAR(36) string representations across SQLite and PostgreSQL.
    Prevents PostgreSQL 'operator does not exist: character varying = uuid' errors
    while seamlessly handling native UUID instances and string representations.
    """
    impl = CHAR(36)
    cache_ok = True

    def load_dialect_impl(self, dialect):
        return dialect.type_descriptor(CHAR(36))

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        if isinstance(value, uuid.UUID):
            return str(value)
        val_str = str(value).strip()
        return val_str if val_str else None

    def process_result_value(self, value, dialect):
        if value is None:
            return None
        if isinstance(value, uuid.UUID):
            return value
        val_str = str(value).strip()
        if not val_str:
            return None
        try:
            return uuid.UUID(val_str)
        except (ValueError, AttributeError):
            return val_str


class SafeEnumStr(str):
    """
    String wrapper that provides a `.value` property.
    Prevents AttributeError when templates or services call `.value` on standard string fields.
    """
    @property
    def value(self) -> str:
        return str(self)


class SafeEnumStringType(TypeDecorator):
    """SQLAlchemy column type decorator that returns SafeEnumStr instances."""
    impl = String(100)
    cache_ok = True

    def process_result_value(self, value, dialect):
        if value is None:
            return None
        return SafeEnumStr(value)

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        return getattr(value, "value", str(value))


class SafeEnumType(TypeDecorator):
    """
    Bi-directional Platform-independent Enum TypeDecorator.
    - If send_name=True, binds member.name (for native PostgreSQL enums).
    - If send_name=False, binds member.value (for VARCHAR columns storing human-readable values).
    - Resolves member names, string values, and raw strings seamlessly without throwing LookupError.
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


# =========================================================================
# CRYPTOGRAPHIC KEY AND SALT ACQUISITION (LEGACY BACKWARD COMPATIBILITY)
# =========================================================================

AES_SECRET_KEYS_STR = getattr(settings, "DB_ENCRYPTION_KEY", None) or "default_insecure_key_for_dev_mode"
AES_SALT_STR = getattr(settings, "DB_ENCRYPTION_SALT", None) or "default_insecure_salt_for_dev_mode"

legacy_salt = AES_SALT_STR.encode("utf-8")
keys_list = [k.strip() for k in AES_SECRET_KEYS_STR.split(",") if k.strip()]

active_ciphers = []
for k in keys_list:
    try:
        kdf = PBKDF2HMAC(
            algorithm=hashes.SHA256(),
            length=32,
            salt=legacy_salt,
            iterations=100_000,
        )
        _key_bytes = kdf.derive(k.encode("utf-8"))
        fernet_key = base64.urlsafe_b64encode(_key_bytes)
        active_ciphers.append(Fernet(fernet_key))
    except Exception as _cipher_err:
        logger.debug(f"Cipher init note: {_cipher_err}")

if not active_ciphers:
    active_ciphers.append(Fernet(Fernet.generate_key()))

legacy_ciphers = active_ciphers


@lru_cache(maxsize=128)
def get_v2_cipher(key: str, salt: bytes) -> Fernet:
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=salt,
        iterations=100_000,
    )
    derived_key = kdf.derive(key.encode("utf-8"))
    fernet_key = base64.urlsafe_b64encode(derived_key)
    return Fernet(fernet_key)


# =========================================================================
# RESILIENT MUTABLE DICT & MUTABLE LIST COERCION
# =========================================================================

class ResilientMutableDict(MutableDict):
    """
    Robust MutableDict that safely coerces strings, ciphertext, and dicts.
    Prevents ValueError: Attribute '<name>' does not accept objects of type <class 'str'>
    when reading from database columns or handling unparsed JSON strings.
    """
    @classmethod
    def coerce(cls, key, value):
        if isinstance(value, cls):
            return value
        if isinstance(value, dict):
            return cls(value)
        if isinstance(value, str):
            val_clean = value.strip()
            if not val_clean or val_clean in ("", "{}", "null", "None"):
                return cls()
            if val_clean.startswith("v3$") or val_clean.startswith("v2$"):
                for cipher in active_ciphers:
                    try:
                        ct = val_clean.split("$")[-1]
                        decrypted = cipher.decrypt(ct.encode("utf-8")).decode("utf-8")
                        parsed = json.loads(decrypted)
                        if isinstance(parsed, dict):
                            return cls(parsed)
                    except Exception:
                        continue
            try:
                parsed = json.loads(val_clean)
                if isinstance(parsed, dict):
                    return cls(parsed)
            except Exception:
                pass
            return cls()
        if value is None:
            return cls()
        try:
            return super().coerce(key, value)
        except ValueError:
            return cls()


class ResilientMutableList(MutableList):
    """
    Robust MutableList that safely coerces strings and lists.
    Prevents ValueError: Attribute '<name>' does not accept objects of type <class 'str'>
    when reading from database columns or handling unparsed JSON strings.
    """
    @classmethod
    def coerce(cls, key, value):
        if isinstance(value, cls):
            return value
        if isinstance(value, list):
            return cls(value)
        if isinstance(value, str):
            val_clean = value.strip()
            if not val_clean or val_clean in ("", "[]", "null", "None"):
                return cls()
            try:
                parsed = json.loads(val_clean)
                if isinstance(parsed, list):
                    return cls(parsed)
            except Exception:
                pass
            return cls()
        if value is None:
            return cls()
        try:
            return super().coerce(key, value)
        except ValueError:
            return cls()


_orig_mutable_dict_coerce = MutableDict.coerce

def _global_safe_mutable_dict_coerce(cls, key, value):
    return ResilientMutableDict.coerce(key, value)

MutableDict.coerce = classmethod(_global_safe_mutable_dict_coerce)

_orig_mutable_list_coerce = MutableList.coerce

def _global_safe_mutable_list_coerce(cls, key, value):
    return ResilientMutableList.coerce(key, value)

MutableList.coerce = classmethod(_global_safe_mutable_list_coerce)


# =========================================================================
# RESILIENT JSON COLUMN DECORATOR
# =========================================================================

class ResilientJSON(TypeDecorator):
    """
    Platform-independent, robust JSON TypeDecorator that guarantees:
    - Storing as clean JSON text across SQLite, PostgreSQL TEXT, or PostgreSQL JSON/JSONB.
    - Result processing handles dict, JSON string ('{}'), legacy EncryptedJSON ('v3$...'), or None.
    - Always produces a Python dict on fetch, never an unparsed string.
    """
    impl = Text
    cache_ok = True

    def load_dialect_impl(self, dialect):
        return dialect.type_descriptor(Text())

    def process_bind_param(self, value, dialect):
        if value is None:
            return "{}"
        if isinstance(value, str):
            try:
                parsed = json.loads(value)
                return json.dumps(parsed)
            except Exception:
                return "{}"
        try:
            return json.dumps(value)
        except Exception:
            return "{}"

    def process_result_value(self, value, dialect):
        if value is None:
            return {}
        if isinstance(value, dict):
            return value
        if isinstance(value, str):
            val_clean = value.strip()
            if not val_clean or val_clean in ("{}", "null", "None", ""):
                return {}
            if val_clean.startswith("v3$") or val_clean.startswith("v2$"):
                for cipher in active_ciphers:
                    try:
                        ct = val_clean.split("$")[-1]
                        decrypted = cipher.decrypt(ct.encode("utf-8")).decode("utf-8")
                        parsed = json.loads(decrypted)
                        if isinstance(parsed, dict):
                            return parsed
                    except Exception:
                        continue
            try:
                parsed = json.loads(val_clean)
                if isinstance(parsed, dict):
                    return parsed
            except Exception:
                pass
            return {}
        return value if isinstance(value, dict) else {}


class EncryptedJSON(ResilientJSON):
    """Backwards-compatible EncryptedJSON subclassing ResilientJSON."""
    pass


class Base(DeclarativeBase):
    pass


# =========================================================================
# SYSTEM GOVERNANCE & TAXONOMY MODELS
# =========================================================================

class SystemSetting(Base):
    __tablename__ = "system_settings"

    key: Mapped[str] = mapped_column(String(100), primary_key=True)
    value: Mapped[str] = mapped_column(String(255), nullable=False)


class StrategicCategory(Base):
    """
    Admin-managed Strategic Procurement Categories for Part IV.A and Table B.1.
    Replaces static ProjectCategory Enum with dynamic database-backed CRUD.
    """
    __tablename__ = "strategic_categories"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    code: Mapped[str] = mapped_column(String(50), unique=True, nullable=False, index=True)
    is_project_linked: Mapped[bool] = mapped_column(Boolean, default=False, server_default=text("false"), nullable=False)
    is_recurring_expense: Mapped[bool] = mapped_column(Boolean, default=False, server_default=text("false"), nullable=False)
    order_index: Mapped[int] = mapped_column(Integer, default=0, server_default=text("0"), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default=text("true"), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    proposals: Mapped[List["Proposal"]] = relationship("Proposal", back_populates="strategic_category_rel")


class UacsCatalogItem(Base):
    """
    Admin-managed Unified Accounts Code Structure (UACS) catalog for Table B.4.
    Replaces static UacsObjectCode Enum. Defines whether an account is CO or MOOE
    and if it acts as the default account code for software subscriptions.
    """
    __tablename__ = "uacs_catalog"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    uacs_code: Mapped[str] = mapped_column(String(50), unique=True, nullable=False, index=True)
    account_title: Mapped[str] = mapped_column(String(200), nullable=False)
    expenditure_class: Mapped[str] = mapped_column(String(100), default="Capital Outlay", nullable=False)
    is_subscription_default: Mapped[bool] = mapped_column(Boolean, default=False, server_default=text("false"), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default=text("true"), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)


class SystemTaxonomy(Base):
    """
    Generic Lookup Taxonomy Table.
    Enables dynamic administration of:
    - DEVELOPMENT_STRATEGY (In-House, Outsourced, COTS, Combination)
    - FUND_SOURCE (GAA, FAP, Locally Funded, Other Income, Trust Funds)
    - DEPLOYMENT_LOCATION (Central Office, Regional Offices, Field Campuses)
    - ASSET_STATUS (Functional, Needs Repair, Condemned, For Disposal)
    """
    __tablename__ = "system_taxonomies"
    __table_args__ = (
        UniqueConstraint("taxonomy_type", "code", name="uq_taxonomy_type_code"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    taxonomy_type: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    code: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    display_name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default=text("true"), nullable=False)
    order_index: Mapped[int] = mapped_column(Integer, default=0, server_default=text("0"), nullable=False)


class DynamicChecklistCriteria(Base):
    """
    Dynamic evaluation criteria for cybersecurity standards, national e-gov programs,
    and the DICT Harmonization Framework.
    Allows Admins to register new government portals and harmonization requirements dynamically.
    """
    __tablename__ = "dynamic_checklist_criteria"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    checklist_type: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    domain_or_category: Mapped[str] = mapped_column(String(100), nullable=False)
    criteria_name: Mapped[str] = mapped_column(String(200), nullable=False)
    is_mandatory: Mapped[bool] = mapped_column(Boolean, default=True, server_default=text("true"), nullable=False)
    national_portal_url: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default=text("true"), nullable=False)
    order_index: Mapped[int] = mapped_column(Integer, default=0, server_default=text("0"), nullable=False)


# =========================================================================
# CANONICAL SYSTEM ENUMERATIONS (REFERENCE FALLBACKS)
# =========================================================================

class RoleTag(str, enum.Enum):
    ROLE_MIS_ADMIN = "ROLE_MIS_ADMIN"
    ROLE_DEPT_USER = "ROLE_DEPT_USER"
    ROLE_SUPPLY_USER = "ROLE_SUPPLY_USER"


class ProposalStatus(str, enum.Enum):
    DRAFT = "Draft"
    SUBMITTED = "Submitted"
    RETURNED = "Returned"
    APPROVED = "Approved"


class ProposalCategory(str, enum.Enum):
    HARDWARE = "Hardware"
    SOFTWARE = "Software"
    SUBSCRIPTION = "Subscription"
    SERVICES = "Services"


class ProjectCategory(str, enum.Enum):
    OFFICE_PRODUCTIVITY = "Office Productivity"
    INTERNAL_ICT_PROJECT = "Internal ICT Projects"
    CROSS_AGENCY_ICT_PROJECT = "Cross-Agency ICT Projects"
    CONTINUING_COSTS = "Continuing Costs/Expenses"


class ExpenditureClass(str, enum.Enum):
    CAPITAL_OUTLAY = "Capital Outlay"
    MOOE = "Maintenance and Other Operating Expenses"


class FundSource(str, enum.Enum):
    GAA = "General Appropriations Act (GAA)"
    FAP = "Foreign-Assisted Projects (FAP)"
    LOCALLY_FUNDED = "Locally Funded"
    OTHER_INCOME = "Other Income Generating Sources"


class OfficeLocation(str, enum.Enum):
    CENTRAL_OFFICE = "Central Office"
    REGIONAL_OFFICE = "Field/Regional Office"


class UacsObjectCode(str, enum.Enum):
    ICT_EQUIPMENT = "50604050 03 - ICT Equipment (CO)"
    PRINTING_EQUIPMENT = "50604050 07 - Printing Equipment (CO)"
    SEMI_EXPENDABLE_ICT = "50203210 03 - Semi-Expendable ICT Equipment (MOOE)"
    SEMI_EXPENDABLE_PRINTING = "50203210 07 - Semi-Expendable Printing Equipment (MOOE)"
    ICT_SOFTWARE = "50604070 01 - ICT Software (Perpetual CO)"
    ICT_SOFTWARE_SUBSCRIPTION = "50299070 00 - ICT Software Subscription (MOOE)"
    ICT_CONSULTING_DEVELOPMENT = "50211030 00 - Consulting/Outsourced Development (MOOE)"
    ICT_TRAINING = "50202010 00 - Training Expenses (MOOE)"


class SystemClassification(str, enum.Enum):
    SUPPORT_TO_OPERATIONS = "Support to Operations"
    GENERAL_ADMINISTRATIVE = "General Administrative Systems"
    OPERATIONS_FRONTLINE = "Operations - Frontline Service"
    OPERATIONS_NON_FRONTLINE = "Operations - Non-Frontline Service"


class SystemHostingType(str, enum.Enum):
    ONLINE = "Online"
    ON_PREMISE = "On-premise"
    HYBRID = "Hybrid"


class DevelopmentStrategy(str, enum.Enum):
    IN_HOUSE = "In-House Development"
    OUTSOURCED = "Outsourced"
    COTS = "Commercial Off-The-Shelf (COTS)"
    COMBINATION = "Combination / Hybrid"


class SystemStatus(str, enum.Enum):
    OPERATIONAL = "Operational"
    FOR_DEVELOPMENT = "For Development"
    FOR_ENHANCEMENT = "For Enhancement"


class SystemDevelopmentStatus(str, enum.Enum):
    FOR_DEVELOPMENT = "For Development"
    FOR_ENHANCEMENT = "For Enhancement"
    NOT_APPLICABLE = "N/A"


class TransactionComplexity(str, enum.Enum):
    SIMPLE = "Simple"
    COMPLEX = "Complex"
    HIGHLY_TECHNICAL = "Highly Technical"


class ResultHierarchy(str, enum.Enum):
    INTERMEDIATE_OUTCOME = "Intermediate Outcome"
    IMMEDIATE_OUTCOME = "Immediate Outcome"
    OUTPUT = "Output"


class AssetStatus(str, enum.Enum):
    FUNCTIONAL = "Functional"
    NEEDS_REPAIR = "Needs Repair"
    CONDEMNED = "Condemned"


class ScopeChoice(str, enum.Enum):
    DEPARTMENT_WIDE = "Department-Wide"
    DEPARTMENT_CENTRAL_OFFICE = "Department - Central Office / Head Office"
    CENTRAL_OFFICE_ONLY = "Central Office only"
    WITH_REGIONAL_OFFICES = "With Regional Offices"
    WITH_BUREAUS = "With Bureaus"
    AGENCY_WIDE = "Agency-Wide"
    OTHER_GOVERNMENT_ENTITY = "Other Government Entity"
    LGU = "LGU"


class DictAssetCategory(str, enum.Enum):
    SERVERS = "Servers"
    DESKTOP = "Desktop"
    LAPTOP = "Laptop"
    MOBILE_PHONE = "Mobile Phone"
    TABLET = "Tablet"
    PRINTER = "Printer"
    NETWORK_SWITCH = "Network Switch"
    OTHERS_EQUIPMENT = "Others (ICT Equipment)"

    OFFICE_PRODUCTIVITY = "Office Productivity Tool"
    GRAMMAR_CHECKER = "Grammar checker"
    GRAPHICS_SIMULATION = "Graphics and Simulation Software"
    ANTIVIRUS = "Antivirus"
    IT_HELPDESK = "IT Help Desk Tool"
    PHOTO_VIDEO_EDITING = "Photo and Video Editing Software"
    WAF = "Web Application Firewall"
    OTHERS_SOFTWARE = "Others (ICT Software)"


# ==========================================================
# ADMINISTRATIVE STRUCTURE MODELS
# ==========================================================

class Department(Base):
    __tablename__ = "departments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(150), unique=True, nullable=False)

    users: Mapped[List["User"]] = relationship("User", back_populates="department")
    proposals: Mapped[List["Proposal"]] = relationship("Proposal", back_populates="department", cascade="all, delete-orphan")
    needs_assessments: Mapped[List["NeedsAssessment"]] = relationship("NeedsAssessment", back_populates="department", cascade="all, delete-orphan")
    proposed_systems: Mapped[List["InformationSystem"]] = relationship("InformationSystem", back_populates="department")
    budget_ceilings: Mapped[List["BudgetCeiling"]] = relationship("BudgetCeiling", back_populates="department", cascade="all, delete-orphan")
    inventory: Mapped[List["ExistingInventory"]] = relationship("ExistingInventory", back_populates="department", cascade="all, delete-orphan")


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    role_tag: Mapped[RoleTag] = mapped_column(SafeEnumType(RoleTag, send_name=True), default=RoleTag.ROLE_DEPT_USER, nullable=False)
    department_id: Mapped[Optional[int]] = mapped_column(ForeignKey("departments.id", ondelete="SET NULL"), nullable=True, index=True)
    is_whitelisted: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    password_hash: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    
    department: Mapped[Optional[Department]] = relationship("Department", back_populates="users")


# =========================================================================
# PERMANENT HISTORICAL PLAN ARCHIVES (PRE-DELETION PRESERVATION)
# =========================================================================

class IsspPlanArchive(Base):
    """
    Permanent archive ledger.
    Stores certified snapshots of deleted or concluded ISSP cycles 
    so historical PDF and Word (.docx) files are never lost.
    """
    __tablename__ = "issp_plan_archives"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    issp_period: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    agency_name: Mapped[str] = mapped_column(String(255), nullable=False)
    start_year: Mapped[int] = mapped_column(Integer, nullable=False)
    end_year: Mapped[int] = mapped_column(Integer, nullable=False)
    certified_grand_total: Mapped[Decimal] = mapped_column(Numeric(15, 2), default=Decimal("0.00"), nullable=False)
    pdf_vault_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    docx_vault_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    archived_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    archived_by_user: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)


# =========================================================================
# PART I: STRATEGIC CONTEXT & GOVERNANCE ROOT
# =========================================================================

class MasterNarrative(Base):
    """
    DICT ISSP v.2026 Part I Narrative, Profile & Governance Root.
    Uses configurable, non-hardcoded defaults for agency leadership and signatories,
    preserving human names and institutional titles entered by users.
    Explicitly tracks both final_pdf_vault_url and final_docx_vault_url for independent export retrieval.
    """
    __tablename__ = "master_narratives"

    issp_period: Mapped[str] = mapped_column(String(50), primary_key=True)
    agency_name: Mapped[str] = mapped_column(String(255), default=settings.DEFAULT_AGENCY_NAME, nullable=False)
    issp_period_from: Mapped[int] = mapped_column(Integer, nullable=False)
    issp_period_to: Mapped[int] = mapped_column(Integer, nullable=False)
    agency_website_url: Mapped[Optional[str]] = mapped_column(String(255), default=settings.DEFAULT_AGENCY_WEBSITE, nullable=True)

    is_amendment: Mapped[bool] = mapped_column(Boolean, default=False, server_default=text("false"), nullable=False)
    amendment_number: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    scope_choice: Mapped[str] = mapped_column(String(100), default="Department-Wide", nullable=False)
    scope_json: Mapped[Dict[str, Any]] = mapped_column(JSON, default=dict, server_default=text("'{}'"), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=False, server_default=text("false"), nullable=False)
    
    # Automated Lifecycle Archival & Snapshot Vault URLs (PDF and Word formats tracked independently)
    is_archived: Mapped[bool] = mapped_column(Boolean, default=False, server_default=text("false"), nullable=False)
    final_pdf_vault_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    final_docx_vault_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)

    # Official Agency Institutional Seal (Single central emblem)
    agency_logo_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    dict_logo_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    bagong_pilipinas_logo_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)

    # Signatory Information
    signatory_prepared_by: Mapped[str] = mapped_column(String(200), default="Chief Information Officer", nullable=False)
    preparer_position: Mapped[Optional[str]] = mapped_column(String(200), default="Chief Information Officer", nullable=True)
    cio_organizational_unit: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    preparer_tel: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    preparer_fax: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    preparer_email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    focal_name: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    focal_position: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    focal_organizational_unit: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    focal_email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    focal_contact_no: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)

    signatory_approved_by: Mapped[str] = mapped_column(String(200), default=settings.DEFAULT_AGENCY_HEAD_TITLE, nullable=False)
    agency_head_position: Mapped[Optional[str]] = mapped_column(String(200), default=settings.DEFAULT_AGENCY_HEAD_TITLE, nullable=True)
    drbcp_approval_date: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)

    # Clean Narrative Text Columns (Structured Plain Text)
    mandate_text: Mapped[str] = mapped_column(Text, default="", server_default=text("''"), nullable=False)
    functions: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    vision_text: Mapped[str] = mapped_column(Text, default="", server_default=text("''"), nullable=False)
    mission_text: Mapped[str] = mapped_column(Text, default="", server_default=text("''"), nullable=False)
    present_situation_text: Mapped[str] = mapped_column(Text, default="", server_default=text("''"), nullable=False)

    enterprise_architecture_narrative: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Clean DRBCP Text Columns (Structured Plain Text)
    drbcp_affected_assets_json: Mapped[List[Dict[str, Any]]] = mapped_column(JSON, default=list, server_default=text("'[]'"), nullable=False)
    drbcp_recovery_strategy_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    drbcp_sop_phases_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    drbcp_compliance_narrative_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    
    subsystem_network_layouts_json: Mapped[Optional[List[Any]]] = mapped_column(JSON, default=list, server_default=text("'[]'"), nullable=True)
    
    planners_json: Mapped[List[Dict[str, Any]]] = mapped_column(JSON, default=list, server_default=text("'[]'"), nullable=False)
    manpower_json: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSON, default=dict, server_default=text("'{}'"), nullable=True)
    annual_ict_budget: Mapped[Decimal] = mapped_column(Numeric(15, 2), default=Decimal("0.00"), server_default=text("0.00"), nullable=False)
    authoring_cycle_duration: Mapped[Optional[int]] = mapped_column(Integer, default=3, nullable=True)

    # Official Primary Schematics
    network_diagram_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    fiber_backbone_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    system_architecture_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    org_chart_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    existing_ict_org_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    proposed_ict_org_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    site_development_plan_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    process_flow_diagram_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)

    # Relationships
    outcomes: Mapped[List["OrganizationalOutcome"]] = relationship(
        "OrganizationalOutcome", 
        back_populates="narrative", 
        cascade="all, delete-orphan"
    )
    proposals: Mapped[List["Proposal"]] = relationship(
        "Proposal", 
        back_populates="master_narrative",
        cascade="all, delete-orphan",
        passive_deletes=True
    )
    strategic_concerns_relation: Mapped[List["StrategicConcern"]] = relationship(
        "StrategicConcern", 
        back_populates="master_narrative", 
        cascade="all, delete-orphan",
        passive_deletes=True
    )
    information_systems_relation: Mapped[List["InformationSystem"]] = relationship(
        "InformationSystem",
        back_populates="master_narrative",
        cascade="all, delete-orphan",
        passive_deletes=True
    )
    ict_projects_relation: Mapped[List["IctProject"]] = relationship(
        "IctProject",
        back_populates="master_narrative",
        cascade="all, delete-orphan",
        passive_deletes=True
    )
    cross_projects_relation: Mapped[List["CrossAgencyProject"]] = relationship(
        "CrossAgencyProject", 
        back_populates="master_narrative", 
        cascade="all, delete-orphan",
        passive_deletes=True
    )
    performance_metrics_relation: Mapped[List["PerformanceMetric"]] = relationship(
        "PerformanceMetric", 
        back_populates="master_narrative", 
        cascade="all, delete-orphan",
        passive_deletes=True
    )
    staff_positions_relation: Mapped[List["IctStaffPosition"]] = relationship(
        "IctStaffPosition",
        back_populates="master_narrative",
        cascade="all, delete-orphan",
        passive_deletes=True
    )
    human_capitals_relation: Mapped[List["HumanCapital"]] = relationship(
        "HumanCapital",
        back_populates="master_narrative",
        cascade="all, delete-orphan",
        passive_deletes=True
    )
    stakeholder_analyses_relation: Mapped[List["StakeholderAnalysis"]] = relationship(
        "StakeholderAnalysis",
        back_populates="master_narrative",
        cascade="all, delete-orphan",
        passive_deletes=True
    )
    egov_checklists_relation: Mapped[List["EGovernmentChecklist"]] = relationship(
        "EGovernmentChecklist",
        back_populates="master_narrative",
        cascade="all, delete-orphan",
        passive_deletes=True
    )
    dr_team_relation: Mapped[List["DisasterRecoveryTeam"]] = relationship(
        "DisasterRecoveryTeam",
        back_populates="master_narrative",
        cascade="all, delete-orphan",
        passive_deletes=True
    )
    dr_bia_relation: Mapped[List["BusinessImpactAnalysis"]] = relationship(
        "BusinessImpactAnalysis",
        back_populates="master_narrative",
        cascade="all, delete-orphan",
        passive_deletes=True
    )
    dr_metrics_relation: Mapped[List["DRBCPMetric"]] = relationship(
        "DRBCPMetric",
        back_populates="master_narrative",
        cascade="all, delete-orphan",
        passive_deletes=True
    )
    network_infrastructures: Mapped[List["NetworkInfrastructure"]] = relationship(
        "NetworkInfrastructure",
        back_populates="master_narrative",
        cascade="all, delete-orphan"
    )
    cybersecurity_controls: Mapped[List["CybersecurityControl"]] = relationship(
        "CybersecurityControl",
        back_populates="master_narrative",
        cascade="all, delete-orphan"
    )
    inventory_snapshots: Mapped[List["ExistingInventory"]] = relationship(
        "ExistingInventory",
        back_populates="master_narrative",
        cascade="all, delete-orphan"
    )
    needs_assessments_snapshots: Mapped[List["NeedsAssessment"]] = relationship(
        "NeedsAssessment",
        back_populates="master_narrative",
        cascade="all, delete-orphan"
    )

    # Dynamic Planning Horizon properties (strictly derived from issp_period_from or active calendar year)
    @property
    def planning_years(self) -> List[int]:
        start = self.issp_period_from or datetime.utcnow().year
        end = self.issp_period_to or (start + 2)
        if start > end:
            start, end = end, start
        return list(range(start, end + 1))

    @property
    def planning_span_years(self) -> int:
        return len(self.planning_years)

    @property
    def cio_name(self) -> str:
        return self.signatory_prepared_by

    @cio_name.setter
    def cio_name(self, val: Optional[str]) -> None:
        if val is not None and str(val).strip():
            self.signatory_prepared_by = str(val).strip()

    @property
    def cio_plantilla_position(self) -> Optional[str]:
        return self.preparer_position

    @cio_plantilla_position.setter
    def cio_plantilla_position(self, val: Optional[str]) -> None:
        self.preparer_position = val

    @property
    def cio_email(self) -> Optional[str]:
        return self.preparer_email

    @cio_email.setter
    def cio_email(self, val: Optional[str]) -> None:
        self.preparer_email = val

    @property
    def cio_contact_no(self) -> Optional[str]:
        return self.preparer_tel

    @cio_contact_no.setter
    def cio_contact_no(self, val: Optional[str]) -> None:
        self.preparer_tel = val

    @property
    def head_of_agency_name(self) -> str:
        return self.signatory_approved_by

    @head_of_agency_name.setter
    def head_of_agency_name(self, val: Optional[str]) -> None:
        if val is not None and str(val).strip():
            self.signatory_approved_by = str(val).strip()

    @property
    def agency_head_title(self) -> str:
        return self.agency_head_position or settings.DEFAULT_AGENCY_HEAD_TITLE

    @agency_head_title.setter
    def agency_head_title(self, val: Optional[str]) -> None:
        if val is not None:
            self.agency_head_position = str(val).strip()

    @property
    def website_url(self) -> Optional[str]:
        return self.agency_website_url

    @website_url.setter
    def website_url(self, val: Optional[str]) -> None:
        self.agency_website_url = val

    @property
    def is_department_wide_scope(self) -> bool:
        sc = str(self.scope_choice or "").strip().lower().replace("_", "-")
        return sc in ("department-wide", "department", "dept-wide", "")

    @property
    def is_agency_wide_scope(self) -> bool:
        sc = str(self.scope_choice or "").strip().lower().replace("_", "-")
        return "agency" in sc


class OrganizationalOutcome(Base):
    __tablename__ = "organizational_outcomes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    issp_period: Mapped[str] = mapped_column(
        ForeignKey("master_narratives.issp_period", onupdate="CASCADE", ondelete="CASCADE"), 
        nullable=False, 
        index=True
    )
    type_label: Mapped[str] = mapped_column(String(100), default="Organizational Outcome", nullable=False)
    outcome_name: Mapped[str] = mapped_column(String(255), nullable=False)
    program_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    narrative: Mapped["MasterNarrative"] = relationship("MasterNarrative", back_populates="outcomes")
    proposals: Mapped[List["Proposal"]] = relationship("Proposal", back_populates="outcome")
    strategic_concerns: Mapped[List["StrategicConcern"]] = relationship("StrategicConcern", back_populates="outcome", cascade="all, delete-orphan")


class HumanCapital(Base):
    __tablename__ = "human_capitals"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    issp_period: Mapped[str] = mapped_column(
        ForeignKey("master_narratives.issp_period", onupdate="CASCADE", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    is_proposed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    employment_status: Mapped[str] = mapped_column(String(100), nullable=False)
    it_positions_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    non_it_positions_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    male_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    female_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    master_narrative: Mapped["MasterNarrative"] = relationship("MasterNarrative", back_populates="human_capitals_relation")


class StakeholderAnalysis(Base):
    __tablename__ = "stakeholder_analyses"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    issp_period: Mapped[str] = mapped_column(
        ForeignKey("master_narratives.issp_period", onupdate="CASCADE", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    stakeholder_group: Mapped[str] = mapped_column(String(150), nullable=False)
    transaction_processed_incoming: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    transaction_processed_outgoing: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    complexity_incoming: Mapped[str] = mapped_column(String(100), default="Simple", server_default=text("'Simple'"), nullable=False)
    complexity_outgoing: Mapped[str] = mapped_column(String(100), default="Simple", server_default=text("'Simple'"), nullable=False)

    master_narrative: Mapped["MasterNarrative"] = relationship("MasterNarrative", back_populates="stakeholder_analyses_relation")

    @property
    def incoming_complexity(self) -> str:
        return self.complexity_incoming

    @incoming_complexity.setter
    def incoming_complexity(self, val: Any) -> None:
        self.complexity_incoming = getattr(val, "value", str(val)) if val is not None else "Simple"

    @property
    def outgoing_complexity(self) -> str:
        return self.complexity_outgoing

    @outgoing_complexity.setter
    def outgoing_complexity(self, val: Any) -> None:
        self.complexity_outgoing = getattr(val, "value", str(val)) if val is not None else "Simple"


# =========================================================================
# PART II: CURRENT ICT ASSESSMENT & STRATEGIC CONCERNS
# =========================================================================

class StrategicConcern(Base):
    __tablename__ = "strategic_concerns"

    id: Mapped[uuid.UUID] = mapped_column(GUID, primary_key=True, default=uuid.uuid4)
    issp_period: Mapped[str] = mapped_column(
        ForeignKey("master_narratives.issp_period", onupdate="CASCADE", ondelete="CASCADE"), 
        nullable=False, 
        index=True
    )
    outcome_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("organizational_outcomes.id", ondelete="CASCADE"), 
        nullable=True, 
        index=True
    )
    mfo: Mapped[str] = mapped_column(String(255), nullable=False)
    critical_system: Mapped[str] = mapped_column(String(255), nullable=False)
    problems: Mapped[str] = mapped_column(Text, nullable=False)
    intended_use: Mapped[str] = mapped_column(Text, nullable=False)
    order_index: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    master_narrative: Mapped["MasterNarrative"] = relationship("MasterNarrative", back_populates="strategic_concerns_relation")
    outcome: Mapped[Optional["OrganizationalOutcome"]] = relationship("OrganizationalOutcome", back_populates="strategic_concerns")
    information_systems: Mapped[List["InformationSystem"]] = relationship("InformationSystem", back_populates="strategic_concern")
    needs_assessments: Mapped[List["NeedsAssessment"]] = relationship("NeedsAssessment", back_populates="strategic_concern")


class NetworkInfrastructure(Base):
    __tablename__ = "network_infrastructures"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    issp_period: Mapped[str] = mapped_column(
        ForeignKey("master_narratives.issp_period", onupdate="CASCADE", ondelete="CASCADE"), 
        nullable=False, 
        index=True
    )
    is_proposed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    topology_description: Mapped[str] = mapped_column(Text, nullable=False)
    connectivity_type: Mapped[str] = mapped_column(String(100), nullable=False)
    bandwidth_mbps: Mapped[int] = mapped_column(Integer, nullable=False)
    upload_speed_mbps: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    download_speed_mbps: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    office_location: Mapped[Optional[str]] = mapped_column(String(200), default="Central Office", nullable=True)
    is_ipv6_ready: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    diagram_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)

    master_narrative: Mapped["MasterNarrative"] = relationship("MasterNarrative", back_populates="network_infrastructures")


class CybersecurityControl(Base):
    __tablename__ = "cybersecurity_controls"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    issp_period: Mapped[str] = mapped_column(
        ForeignKey("master_narratives.issp_period", onupdate="CASCADE", ondelete="CASCADE"), 
        nullable=False, 
        index=True
    )
    is_proposed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    control_domain: Mapped[str] = mapped_column(String(100), nullable=False)
    control_name: Mapped[str] = mapped_column(String(200), nullable=False)
    is_mandatory: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_implemented: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    master_narrative: Mapped["MasterNarrative"] = relationship("MasterNarrative", back_populates="cybersecurity_controls")


class EGovernmentChecklist(Base):
    __tablename__ = "egovernment_checklists"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    issp_period: Mapped[str] = mapped_column(
        ForeignKey("master_narratives.issp_period", onupdate="CASCADE", ondelete="CASCADE"),
        nullable=False, 
        index=True
    )
    program_name: Mapped[str] = mapped_column(String(150), nullable=False)
    is_utilized: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    url_or_system_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    equivalent_system_details: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    equivalent_system_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    equivalent_system_url: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    has_other_payment_platform: Mapped[bool] = mapped_column(Boolean, default=False, server_default=text("false"), nullable=False)
    is_manual: Mapped[bool] = mapped_column(Boolean, default=False, server_default=text("false"), nullable=False)
    is_proposed_development: Mapped[bool] = mapped_column(Boolean, default=False, server_default=text("false"), nullable=False)
    proposed_development_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    total_employees: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    active_pnpki_count: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    adoption_ratio: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    channels_json: Mapped[List[str]] = mapped_column(JSON, default=list, nullable=False)
    is_connected_to_portal: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    master_narrative: Mapped["MasterNarrative"] = relationship("MasterNarrative", back_populates="egov_checklists_relation")

    @property
    def is_proposed_equivalent(self) -> bool:
        return self.is_proposed_development

    @is_proposed_equivalent.setter
    def is_proposed_equivalent(self, val: bool) -> None:
        self.is_proposed_development = bool(val)


# =========================================================================
# PART II.C & PART III.D: INFORMATION SYSTEMS REGISTER
# =========================================================================

class InformationSystem(Base):
    """
    Accommodates both Part II.C (Operational) and Part III.D (Proposed/Enhancement)
    following official DICT v.2026 specifications.
    Supports independent checkboxes for multi-classification (Support, Admin, Operations).
    Supports department proposals, needs assessment linkage, proposed budget estimation,
    direct linkage to an ICT Project (Part III.E), target implementation year,
    UACS accounting codes, and administrative review states.
    """
    __tablename__ = "information_systems"

    id: Mapped[uuid.UUID] = mapped_column(GUID, primary_key=True, default=uuid.uuid4)
    issp_period: Mapped[str] = mapped_column(
        ForeignKey("master_narratives.issp_period", onupdate="CASCADE", ondelete="CASCADE"), 
        nullable=False, 
        index=True
    )
    strategic_concern_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        GUID,
        ForeignKey("strategic_concerns.id", ondelete="SET NULL"), 
        nullable=True, 
        index=True
    )
    department_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("departments.id", ondelete="SET NULL"), 
        nullable=True, 
        index=True
    )
    needs_assessment_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        GUID,
        ForeignKey("needs_assessments.id", ondelete="SET NULL"), 
        nullable=True, 
        index=True
    )
    project_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        GUID,
        ForeignKey("ict_projects.id", ondelete="SET NULL"),
        nullable=True,
        index=True
    )
    submission_status: Mapped[str] = mapped_column(
        String(50), 
        default="Approved", 
        server_default=text("'Approved'"), 
        nullable=False, 
        index=True
    )
    rejection_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[str] = mapped_column(String(50), default="Operational", nullable=False)
    classification: Mapped[Optional[str]] = mapped_column(String(200), default="Operations - Frontline Service", nullable=True)

    proposed_cost: Mapped[Decimal] = mapped_column(
        Numeric(15, 2), default=Decimal("0.00"), server_default=text("0.00"), nullable=False
    )
    is_client_facing: Mapped[bool] = mapped_column(
        Boolean, default=True, server_default=text("true"), nullable=False
    )

    # Target Implementation Year, UACS Object Code & Expenditure Class for 4-Way Parity Integration
    target_year: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    uacs_object_code: Mapped[Optional[str]] = mapped_column(
        String(150), 
        default="50604070 01 - ICT Software (Perpetual CO)", 
        server_default=text("'50604070 01 - ICT Software (Perpetual CO)'"), 
        nullable=True
    )
    expenditure_class: Mapped[Optional[str]] = mapped_column(
        String(100), 
        default="Capital Outlay", 
        server_default=text("'Capital Outlay'"), 
        nullable=True
    )

    # Independent Multi-Classification Checkboxes
    is_support_to_operations: Mapped[bool] = mapped_column(Boolean, default=False, server_default=text("false"), nullable=False)
    is_general_administrative: Mapped[bool] = mapped_column(Boolean, default=False, server_default=text("false"), nullable=False)
    is_operations: Mapped[bool] = mapped_column(Boolean, default=True, server_default=text("true"), nullable=False)

    # Subordinated Frontline details under Operations
    is_frontline_service: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    frontline_hosting_type: Mapped[str] = mapped_column(String(50), default="Online", nullable=False)
    online_url: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    is_non_frontline_service: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    description_and_purpose: Mapped[str] = mapped_column(Text, nullable=False)
    enhancement_details: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    
    development_strategy: Mapped[str] = mapped_column(String(100), default="Outsourced", server_default=text("'Outsourced'"), nullable=False)
    development_platform: Mapped[str] = mapped_column(String(200), default="Web-Based Architecture", server_default=text("'Web-Based Architecture'"), nullable=False)
    database_name: Mapped[str] = mapped_column(String(200), default="AppDatabase", server_default=text("'AppDatabase'"), nullable=False)
    data_storage_type: Mapped[str] = mapped_column(String(200), default="Cloud / On-premise Storage", server_default=text("'Cloud / On-premise Storage'"), nullable=False)

    internal_users: Mapped[str] = mapped_column(Text, default="Department Personnel", server_default=text("'Department Personnel'"), nullable=False)
    external_users: Mapped[Text] = mapped_column(Text, default="General Public", server_default=text("'General Public'"), nullable=False)
    system_owner_office: Mapped[str] = mapped_column(String(200), default="Department Office", server_default=text("'Department Office'"), nullable=False)

    is_integrated_with_others: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    internal_integrated_systems: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    external_integrated_systems: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    generates_data_for_others: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    processes_data_from_others: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_deployed_on_shared_platform: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    processes_personal_information: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    has_undergone_pia: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    pia_target_date_text: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)

    master_narrative: Mapped["MasterNarrative"] = relationship("MasterNarrative", back_populates="information_systems_relation")
    strategic_concern: Mapped[Optional["StrategicConcern"]] = relationship("StrategicConcern", back_populates="information_systems")
    department: Mapped[Optional["Department"]] = relationship("Department", back_populates="proposed_systems")
    needs_assessment: Mapped[Optional["NeedsAssessment"]] = relationship("NeedsAssessment", back_populates="proposed_systems")
    projects: Mapped[List["IctProject"]] = relationship("IctProject", foreign_keys="IctProject.system_id", back_populates="information_system")
    project_parent: Mapped[Optional["IctProject"]] = relationship("IctProject", foreign_keys=[project_id], back_populates="linked_systems")
    proposal_rel: Mapped[Optional["Proposal"]] = relationship(
        "Proposal", 
        foreign_keys="Proposal.system_id", 
        back_populates="system_rel", 
        uselist=False
    )
    bia_record: Mapped[Optional["BusinessImpactAnalysis"]] = relationship("BusinessImpactAnalysis", back_populates="system", uselist=False)

    @property
    def hosting_type(self) -> str:
        return self.frontline_hosting_type

    @hosting_type.setter
    def hosting_type(self, val: Any) -> None:
        self.frontline_hosting_type = str(getattr(val, "value", val) or "Online")


# =========================================================================
# PART III.E & PART III.F: ICT PROJECTS & PMF
# =========================================================================

class IctProject(Base):
    """Part III.E ICT Projects (E.1 Internal and E.2 Cross-Agency)."""
    __tablename__ = "ict_projects"

    id: Mapped[uuid.UUID] = mapped_column(GUID, primary_key=True, default=uuid.uuid4)
    issp_period: Mapped[str] = mapped_column(
        ForeignKey("master_narratives.issp_period", onupdate="CASCADE", ondelete="CASCADE"), 
        nullable=False, 
        index=True
    )
    system_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        GUID,
        ForeignKey("information_systems.id", ondelete="SET NULL"), 
        nullable=True, 
        index=True
    )

    project_title: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    project_category: Mapped[str] = mapped_column(String(100), default="Internal ICT Projects", nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    objectives: Mapped[str] = mapped_column(Text, nullable=False)

    # Strategic Alignment
    aligns_pip: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    aligns_ncsp: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    aligns_egmp: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    aligns_pcb: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    aligns_others: Mapped[bool] = mapped_column(Boolean, default=False, server_default=text("false"), nullable=False)
    aligns_others_specify: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    # Dynamic Harmonization Framework Criteria (JSON key-value mapping)
    harmonization_criteria: Mapped[Dict[str, bool]] = mapped_column(
        ResilientMutableDict.as_mutable(JSON),
        default=lambda: {
            "National Prioritization (PDP 2023-2028)": False,
            "Resource Optimization (GovNet, GovCloud)": False,
            "PeGIF Standardized APIs & Interoperability": True,
            "Cross-Agency Collaboration (JMC / MOA)": False,
            "Scalability and Sustainability (SPAR / PREXC)": True
        },
        server_default=text("'{}'"),
        nullable=False
    )

    # Legacy booleans preserved for backward compatibility
    harmonizes_national_priority: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    harmonizes_resource_optimization: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    harmonizes_pegif: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    harmonizes_cross_collaboration: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    harmonizes_scalability: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    duration_start_year: Mapped[int] = mapped_column(Integer, nullable=False)
    duration_end_year: Mapped[int] = mapped_column(Integer, nullable=False)

    annual_deliverables: Mapped[Dict[str, str]] = mapped_column(
        ResilientMutableDict.as_mutable(JSON),
        default=dict,
        server_default=text("'{}'"),
        nullable=False
    )

    year_1_deliverables: Mapped[Optional[str]] = mapped_column(Text, nullable=True, default="")
    year_2_deliverables: Mapped[Optional[str]] = mapped_column(Text, nullable=True, default="")
    year_3_deliverables: Mapped[Optional[str]] = mapped_column(Text, nullable=True, default="")

    implementing_unit: Mapped[str] = mapped_column(String(200), default="ICT Management Office", nullable=False)
    funding_source: Mapped[str] = mapped_column(String(100), default="General Appropriations Act (GAA)", nullable=False)

    lead_agency: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    partner_agencies: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    master_narrative: Mapped["MasterNarrative"] = relationship("MasterNarrative", back_populates="ict_projects_relation")
    information_system: Mapped[Optional["InformationSystem"]] = relationship("InformationSystem", foreign_keys=[system_id], back_populates="projects")
    linked_systems: Mapped[List["InformationSystem"]] = relationship("InformationSystem", foreign_keys="InformationSystem.project_id", back_populates="project_parent")
    pmf_metrics: Mapped[List["PerformanceMetric"]] = relationship("PerformanceMetric", back_populates="project_rel", cascade="all, delete-orphan")
    resource_items: Mapped[List["Proposal"]] = relationship("Proposal", back_populates="project_rel")

    def get_deliverable_for_year(self, year_num: int, calendar_year: Optional[int] = None) -> str:
        deliv_map = self.annual_deliverables or {}
        if calendar_year and str(calendar_year) in deliv_map:
            return deliv_map[str(calendar_year)]
        key = f"Year {year_num}"
        if key in deliv_map:
            return deliv_map[key]
        if year_num == 1:
            return self.year_1_deliverables or ""
        if year_num == 2:
            return self.year_2_deliverables or ""
        if year_num == 3:
            return self.year_3_deliverables or ""
        return ""

    @property
    def computed_total_project_cost(self) -> Decimal:
        """
        Dynamically computes the exact total project cost from active, approved 
        child line items in Part IV.A and linked Information Systems for this project 
        in the active planning cycle.
        Guarantees exact mathematical parity with Tables B.1, B.2, B.3, and B.4.
        """
        try:
            sess = object_session(self)
            if sess is not None:
                # 1. Sum all approved proposals in issp_core linked to this project
                proposal_sum = sess.query(func.sum(Proposal.total_cost)).filter(
                    Proposal.project_id == self.id,
                    Proposal.issp_period == self.issp_period,
                    func.lower(cast(Proposal.status, String)) == "approved",
                    or_(Proposal.is_archived == False, Proposal.is_archived.is_(None))
                ).scalar() or Decimal("0.00")

                # 2. Add approved Information Systems whose proposed_cost is not yet synced in a Proposal row
                accounted_system_ids = {
                    str(r[0]) for r in sess.query(Proposal.system_id).filter(
                        Proposal.project_id == self.id,
                        Proposal.issp_period == self.issp_period,
                        Proposal.system_id.isnot(None),
                        func.lower(cast(Proposal.status, String)) == "approved",
                        or_(Proposal.is_archived == False, Proposal.is_archived.is_(None))
                    ).all() if r[0]
                }

                unaccounted_systems = sess.query(InformationSystem).filter(
                    InformationSystem.issp_period == self.issp_period,
                    or_(
                        InformationSystem.project_id == self.id,
                        InformationSystem.id == self.system_id
                    ),
                    func.lower(cast(InformationSystem.submission_status, String)) == "approved",
                    InformationSystem.proposed_cost > 0
                ).all()

                extra_cost = Decimal("0.00")
                for s in unaccounted_systems:
                    if str(s.id) not in accounted_system_ids:
                        extra_cost += Decimal(str(s.proposed_cost or 0))

                return (Decimal(str(proposal_sum)) + extra_cost).quantize(Decimal("0.01"))
            else:
                total = Decimal("0.00")
                accounted_sids = set()
                for itm in (getattr(self, "resource_items", []) or []):
                    if (
                        str(getattr(itm, "project_id", "")) == str(self.id)
                        and not getattr(itm, "is_archived", False)
                        and str(getattr(itm, "status", "")).lower() == "approved"
                    ):
                        tc = getattr(itm, "total_cost", Decimal("0.00")) or Decimal("0.00")
                        total += Decimal(str(tc))
                        if getattr(itm, "system_id", None):
                            accounted_sids.add(str(itm.system_id))

                all_sys = list(getattr(self, "linked_systems", []) or [])
                if getattr(self, "information_system", None) and self.information_system not in all_sys:
                    all_sys.append(self.information_system)

                for s in all_sys:
                    if (
                        str(getattr(s, "submission_status", "Approved")).lower() == "approved"
                        and str(s.id) not in accounted_sids
                    ):
                        cost_val = getattr(s, "proposed_cost", Decimal("0.00")) or Decimal("0.00")
                        total += Decimal(str(cost_val))

                return total.quantize(Decimal("0.01"))
        except Exception:
            return Decimal("0.00")


class PerformanceMetric(Base):
    """Part III.F Performance Measurement Framework (F.1 & F.2)."""
    __tablename__ = "performance_metrics"

    id: Mapped[uuid.UUID] = mapped_column(GUID, primary_key=True, default=uuid.uuid4)
    issp_period: Mapped[str] = mapped_column(
        ForeignKey("master_narratives.issp_period", onupdate="CASCADE", ondelete="CASCADE"), 
        nullable=False, 
        index=True
    )
    project_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        GUID,
        ForeignKey("ict_projects.id", ondelete="SET NULL"), 
        nullable=True, 
        index=True
    )
    project_title: Mapped[str] = mapped_column(String(200), default="General ICT Governance", nullable=False)
    result_hierarchy: Mapped[str] = mapped_column(SafeEnumStringType, nullable=False)
    indicator: Mapped[str] = mapped_column(Text, nullable=False)
    baseline: Mapped[str] = mapped_column(String(200), nullable=False)
    target: Mapped[str] = mapped_column(String(200), nullable=False)
    
    annual_targets: Mapped[Dict[str, str]] = mapped_column(
        JSON,
        default=dict,
        server_default=text("'{}'"),
        nullable=False
    )

    collection_method: Mapped[str] = mapped_column(String(200), nullable=False)
    responsibility: Mapped[str] = mapped_column(String(150), nullable=False)

    master_narrative: Mapped["MasterNarrative"] = relationship("MasterNarrative", back_populates="performance_metrics_relation")
    project_rel: Mapped[Optional["IctProject"]] = relationship("IctProject", back_populates="pmf_metrics")


class CrossAgencyProject(Base):
    __tablename__ = "cross_agency_projects"

    id: Mapped[uuid.UUID] = mapped_column(GUID, primary_key=True, default=uuid.uuid4)
    issp_period: Mapped[str] = mapped_column(
        ForeignKey("master_narratives.issp_period", onupdate="CASCADE", ondelete="CASCADE"), 
        nullable=False, 
        index=True
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    objectives: Mapped[str] = mapped_column(Text, nullable=False)
    duration: Mapped[str] = mapped_column(String(100), nullable=False)
    deliverables: Mapped[str] = mapped_column(Text, nullable=False)
    lead_agency: Mapped[str] = mapped_column(String(150), nullable=False)
    implementing_agencies: Mapped[str] = mapped_column(String(200), nullable=False)

    master_narrative: Mapped["MasterNarrative"] = relationship("MasterNarrative", back_populates="cross_projects_relation")


# =========================================================================
# PART IV: RESOURCE REQUIREMENTS (UNIFIED PROPOSALS LEDGER)
# =========================================================================

class Proposal(Base):
    """
    DICT ISSP v.2026 Unified Resource Requirement Line Item (Part IV.A).
    Clean, queryable, without redundant static year columns or encrypted blobs.
    outcome_id is nullable to allow department users to submit raw technical proposals.
    created_by_students and is_in_house_turnover are explicitly mapped columns to prevent
    database NotNullViolation constraints while remaining fully synchronized.
    Now directly relates to InformationSystem via system_id foreign key.
    """
    __tablename__ = "issp_core"

    id: Mapped[uuid.UUID] = mapped_column(GUID, primary_key=True, default=uuid.uuid4)
    department_id: Mapped[int] = mapped_column(
        ForeignKey("departments.id", ondelete="CASCADE"), 
        nullable=False, 
        index=True
    )
    issp_period: Mapped[str] = mapped_column(
        String(50), 
        ForeignKey("master_narratives.issp_period", onupdate="CASCADE", ondelete="CASCADE"),
        nullable=False, 
        index=True
    )
    
    # Provenance Linkages
    outcome_id: Mapped[Optional[int]] = mapped_column(
        Integer,
        ForeignKey("organizational_outcomes.id", ondelete="SET NULL"), 
        nullable=True, 
        index=True
    )
    project_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        GUID,
        ForeignKey("ict_projects.id", ondelete="SET NULL"),
        nullable=True,
        index=True
    )
    system_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        GUID,
        ForeignKey("information_systems.id", ondelete="SET NULL"),
        nullable=True,
        index=True
    )
    needs_assessment_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        GUID,
        ForeignKey("needs_assessments.id", ondelete="SET NULL"),
        nullable=True,
        index=True
    )
    strategic_category_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("strategic_categories.id", ondelete="SET NULL"),
        nullable=True,
        index=True
    )

    # Classification & Categorization
    category: Mapped[str] = mapped_column(String(100), default="Hardware", nullable=False, index=True)
    strategic_category: Mapped[str] = mapped_column(String(100), default="Office Productivity", nullable=False)
    office_location: Mapped[str] = mapped_column(String(100), default="Central Office", nullable=False)
    fund_source: Mapped[str] = mapped_column(String(100), default="General Appropriations Act (GAA)", nullable=False)
    
    # UACS and Expenditure Class
    uacs_object_code: Mapped[str] = mapped_column(String(150), default="50604050 03 - ICT Equipment (CO)", server_default=text("''"), nullable=False)
    expenditure_class: Mapped[str] = mapped_column(String(100), default="Capital Outlay", server_default=text("''"), nullable=False)
    status: Mapped[str] = mapped_column(String(100), default="Draft", nullable=False, index=True)
    
    # Pricing & Multi-Year Quantities
    item_name: Mapped[str] = mapped_column(String(255), nullable=False)
    item_key: Mapped[Optional[str]] = mapped_column(String(100), default="other", nullable=True)
    unit_cost: Mapped[Decimal] = mapped_column(Numeric(15, 2), default=Decimal("0.00"), nullable=False)
    
    yearly_quantities: Mapped[Dict[str, int]] = mapped_column(
        ResilientMutableDict.as_mutable(JSON), 
        default=dict, 
        server_default=text("'{}'"),
        nullable=False
    )
    total_qty: Mapped[int] = mapped_column(Integer, default=0, nullable=False, index=True)
    total_cost: Mapped[Decimal] = mapped_column(Numeric(15, 2), default=Decimal("0.00"), nullable=False)

    justification: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    system_development_status: Mapped[str] = mapped_column(String(100), default="N/A", nullable=False)

    # Native Public Sector Attributes
    created_by_students: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default=text("false"), nullable=False
    )
    is_in_house_turnover: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default=text("false"), nullable=False
    )
    is_expansion: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default=text("false"), nullable=False
    )
    target_office_automated: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    
    # Market Quotation / Proof Attachment
    canvas_evidence_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    canvas_expiration_date: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True, index=True)
    supplier_name: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)

    # Native Queryable Revision Comments & Payload
    comments: Mapped[List[Dict[str, Any]]] = mapped_column(
        ResilientMutableList.as_mutable(JSON), 
        default=list, 
        server_default=text("'[]'"), 
        nullable=False
    )
    payload: Mapped[Dict[str, Any]] = mapped_column(
        ResilientMutableDict.as_mutable(ResilientJSON),
        default=dict,
        server_default=text("'{}'"),
        nullable=False
    )
    
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    is_archived: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    
    s3_storage_class: Mapped[str] = mapped_column(String(50), default="STANDARD", nullable=False)
    is_restoring: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # Relationships
    department: Mapped[Department] = relationship("Department", back_populates="proposals")
    outcome: Mapped[Optional[OrganizationalOutcome]] = relationship("OrganizationalOutcome", back_populates="proposals")
    project_rel: Mapped[Optional["IctProject"]] = relationship("IctProject", back_populates="resource_items")
    system_rel: Mapped[Optional["InformationSystem"]] = relationship(
        "InformationSystem",
        foreign_keys=[system_id],
        back_populates="proposal_rel"
    )
    needs_assessment: Mapped[Optional["NeedsAssessment"]] = relationship("NeedsAssessment", back_populates="proposals")
    master_narrative: Mapped[Optional["MasterNarrative"]] = relationship("MasterNarrative", back_populates="proposals")
    strategic_category_rel: Mapped[Optional["StrategicCategory"]] = relationship("StrategicCategory", back_populates="proposals")
    audit_logs: Mapped[List["AuditTrail"]] = relationship("AuditTrail", back_populates="proposal", cascade="all, delete-orphan")

    @property
    def archive_storage_tier(self) -> str:
        return self.s3_storage_class

    @property
    def year_1_qty(self) -> int:
        yq = self.yearly_quantities or {}
        if "Year 1" in yq:
            return int(yq["Year 1"] or 0)
        keys = sorted([k for k in yq.keys() if str(k).isdigit() and len(str(k)) == 4])
        if len(keys) >= 1:
            return int(yq.get(keys[0], 0) or 0)
        return int(yq.get("1", 0) or 0)

    @property
    def year_2_qty(self) -> int:
        yq = self.yearly_quantities or {}
        if "Year 2" in yq:
            return int(yq["Year 2"] or 0)
        keys = sorted([k for k in yq.keys() if str(k).isdigit() and len(str(k)) == 4])
        if len(keys) >= 2:
            return int(yq.get(keys[1], 0) or 0)
        return int(yq.get("2", 0) or 0)

    @property
    def year_3_qty(self) -> int:
        yq = self.yearly_quantities or {}
        if "Year 3" in yq:
            return int(yq["Year 3"] or 0)
        keys = sorted([k for k in yq.keys() if str(k).isdigit() and len(str(k)) == 4])
        if len(keys) >= 3:
            return int(yq.get(keys[2], 0) or 0)
        return int(yq.get("3", 0) or 0)

    def sync_payload(self) -> None:
        if self.payload is None or not isinstance(self.payload, dict):
            self.payload = {}
        self.payload["item_name"] = self.item_name
        self.payload["unit_cost"] = str(self.unit_cost)
        self.payload["total_cost"] = str(self.total_cost)
        self.payload["canvas_evidence_url"] = self.canvas_evidence_url
        self.payload["canvas_expiration_date"] = self.canvas_expiration_date.isoformat() if self.canvas_expiration_date else None
        self.payload["supplier_name"] = self.supplier_name
        self.payload["category"] = self.category
        self.payload["strategic_category"] = self.strategic_category
        self.payload["office_location"] = self.office_location
        self.payload["fund_source"] = self.fund_source
        self.payload["is_in_house_turnover"] = self.is_in_house_turnover
        self.payload["created_by_students"] = self.created_by_students
        self.payload["is_expansion"] = self.is_expansion
        self.payload["uacs_object_code"] = self.uacs_object_code
        self.payload["expenditure_class"] = self.expenditure_class
        if self.system_id:
            self.payload["system_id"] = str(self.system_id)


ResourceRequirementItem = Proposal


class CatalogItem(Base):
    __tablename__ = "catalog_items"

    id: Mapped[uuid.UUID] = mapped_column(GUID, primary_key=True, default=uuid.uuid4)
    item_key: Mapped[str] = mapped_column(String(100), unique=True, index=True, nullable=False)
    display_name: Mapped[str] = mapped_column(String(200), nullable=False)
    standard_unit_cost: Mapped[Decimal] = mapped_column(Numeric(15, 2), nullable=False)
    category: Mapped[str] = mapped_column(String(100), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    allowed_offices: Mapped[List[str]] = mapped_column(JSON, default=list, nullable=False)
    canvas_evidence_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    supplier_name: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    canvas_expiration_date: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True, index=True)


class BudgetCeiling(Base):
    __tablename__ = "budget_ceilings"
    __table_args__ = (
        UniqueConstraint("department_id", "issp_period", name="uq_budget_ceilings_dept_period"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    department_id: Mapped[int] = mapped_column(
        ForeignKey("departments.id", ondelete="CASCADE"), 
        nullable=False, 
        index=True
    )
    allocated_capex: Mapped[Decimal] = mapped_column(Numeric(15, 2), default=Decimal("0.00"), nullable=False)
    allocated_mooe: Mapped[Decimal] = mapped_column(Numeric(15, 2), default=Decimal("0.00"), nullable=False)
    
    annual_allocations: Mapped[Dict[str, Any]] = mapped_column(
        JSON,
        default=dict,
        server_default=text("'{}'"),
        nullable=False
    )

    issp_period: Mapped[str] = mapped_column(
        String(50), 
        ForeignKey("master_narratives.issp_period", ondelete="CASCADE", onupdate="CASCADE"),
        default=settings.DEFAULT_ISSP_CYCLE,
        nullable=False, 
        index=True
    )

    department: Mapped[Department] = relationship("Department", back_populates="budget_ceilings")

    @hybrid_property
    def sub_ceiling(self) -> Decimal:
        capex_val = self.allocated_capex if self.allocated_capex is not None else Decimal("0.00")
        mooe_val = self.allocated_mooe if self.allocated_mooe is not None else Decimal("0.00")
        return capex_val + mooe_val

    @sub_ceiling.setter
    def sub_ceiling(self, value: Decimal) -> None:
        if value is None:
            value = Decimal("0.00")
        elif not isinstance(value, Decimal):
            value = Decimal(str(value))
        quantized = value.quantize(Decimal("1.00"))
        if (self.allocated_capex or Decimal("0.00")) == Decimal("0.00") and (self.allocated_mooe or Decimal("0.00")) == Decimal("0.00"):
            self.allocated_capex = quantized
            self.allocated_mooe = Decimal("0.00")


class AuditTrail(Base):
    __tablename__ = "audit_trails"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    proposal_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        GUID,
        ForeignKey("issp_core.id", ondelete="SET NULL"), 
        nullable=True
    )
    department_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("departments.id", ondelete="SET NULL"),
        nullable=True,
        index=True
    )
    module: Mapped[str] = mapped_column(
        String(100), 
        default="GOVERNANCE", 
        server_default=text("'GOVERNANCE'"), 
        nullable=False
    )
    action: Mapped[str] = mapped_column(String(100), nullable=False)
    ip_address: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    user_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), 
        nullable=True
    )
    timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), 
        server_default=func.now(), 
        nullable=False
    )
    old_value: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSON, nullable=True)
    new_value: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSON, nullable=True)

    proposal: Mapped[Optional[Proposal]] = relationship("Proposal", back_populates="audit_logs")
    department: Mapped[Optional[Department]] = relationship("Department")
    user: Mapped[Optional[User]] = relationship("User")


# =========================================================================
# SECTION 8.0: NEEDS ASSESSMENT
# =========================================================================

class NeedsAssessment(Base):
    __tablename__ = "needs_assessments"

    id: Mapped[uuid.UUID] = mapped_column(GUID, primary_key=True, default=uuid.uuid4)
    department_id: Mapped[int] = mapped_column(
        ForeignKey("departments.id", ondelete="CASCADE"), 
        nullable=False, 
        index=True
    )
    issp_period: Mapped[str] = mapped_column(
        String(50),
        ForeignKey("master_narratives.issp_period", onupdate="CASCADE", ondelete="CASCADE"),
        default=settings.DEFAULT_ISSP_CYCLE,
        nullable=False,
        index=True
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    mfo_alignment: Mapped[str] = mapped_column(String(100), nullable=False)
    current_problem: Mapped[str] = mapped_column(Text, nullable=False)
    proposed_solution: Mapped[str] = mapped_column(Text, nullable=False)
    expected_impacts: Mapped[List[str]] = mapped_column(JSON, default=list, nullable=False)
    other_impact: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_archived: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    is_aggregated: Mapped[bool] = mapped_column(Boolean, default=False, server_default=text("false"), nullable=False)
    strategic_concern_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        GUID,
        ForeignKey("strategic_concerns.id", ondelete="SET NULL"),
        nullable=True,
        index=True
    )

    department: Mapped["Department"] = relationship("Department", back_populates="needs_assessments")
    proposals: Mapped[List["Proposal"]] = relationship("Proposal", back_populates="needs_assessment")
    proposed_systems: Mapped[List["InformationSystem"]] = relationship("InformationSystem", back_populates="needs_assessment")
    strategic_concern: Mapped[Optional["StrategicConcern"]] = relationship("StrategicConcern", back_populates="needs_assessments")
    master_narrative: Mapped[Optional["MasterNarrative"]] = relationship("MasterNarrative", back_populates="needs_assessments_snapshots")


# =========================================================================
# ANNEX 1: MASTER ASSET INVENTORY (MANAGED BY SUPPLY USER)
# =========================================================================

class ExistingInventory(Base):
    __tablename__ = "existing_inventory"

    id: Mapped[uuid.UUID] = mapped_column(GUID, primary_key=True, default=uuid.uuid4)
    department_id: Mapped[int] = mapped_column(
        ForeignKey("departments.id", ondelete="CASCADE"), 
        nullable=False, 
        index=True
    )
    issp_period: Mapped[str] = mapped_column(
        String(50), 
        ForeignKey("master_narratives.issp_period", onupdate="CASCADE", ondelete="CASCADE"),
        default=settings.DEFAULT_ISSP_CYCLE,
        nullable=False, 
        index=True
    )
    
    replacement_proposal_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        GUID,
        ForeignKey("issp_core.id", ondelete="SET NULL"),
        nullable=True,
        index=True
    )

    dict_category: Mapped[Optional[str]] = mapped_column(String(100), nullable=True, index=True)
    other_category_name: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)

    item_name: Mapped[str] = mapped_column(String(200), nullable=False)
    specs: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    exact_model: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    quantity: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    status: Mapped[str] = mapped_column(String(100), default="Functional", nullable=False)
    date_acquired: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    acquired_price: Mapped[Decimal] = mapped_column(Numeric(15, 2), default=Decimal("0.00"), nullable=False)

    office_location: Mapped[str] = mapped_column(String(100), default="Central Office", nullable=False)
    is_central_office: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_end_of_life: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_backup: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_software: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_perpetual: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    unserviceable_report_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)

    department: Mapped[Department] = relationship("Department", back_populates="inventory")
    master_narrative: Mapped[Optional["MasterNarrative"]] = relationship("MasterNarrative", back_populates="inventory_snapshots")


# =========================================================================
# ANNEX 2: DISASTER RECOVERY & BUSINESS CONTINUITY (DRBCP)
# =========================================================================

class BusinessImpactAnalysis(Base):
    __tablename__ = "dr_bia_summary"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    issp_period: Mapped[str] = mapped_column(
        ForeignKey("master_narratives.issp_period", onupdate="CASCADE", ondelete="CASCADE"),
        nullable=False, 
        index=True
    )
    system_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        GUID,
        ForeignKey("information_systems.id", ondelete="CASCADE"), 
        nullable=True, 
        unique=True
    )
    system_name: Mapped[str] = mapped_column(String(150), nullable=False)
    classification: Mapped[str] = mapped_column(String(100), nullable=False)
    mtpd_hours: Mapped[int] = mapped_column(Integer, default=24, nullable=False)
    rto_hours: Mapped[int] = mapped_column(Integer, default=4, nullable=False)
    rpo_hours: Mapped[int] = mapped_column(Integer, default=1, nullable=False)

    master_narrative: Mapped["MasterNarrative"] = relationship("MasterNarrative", back_populates="dr_bia_relation")
    system: Mapped[Optional["InformationSystem"]] = relationship("InformationSystem", back_populates="bia_record")


class DisasterRecoveryTeam(Base):
    __tablename__ = "dr_team_members"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    issp_period: Mapped[str] = mapped_column(
        ForeignKey("master_narratives.issp_period", onupdate="CASCADE", ondelete="CASCADE"),
        nullable=False, 
        index=True
    )
    role: Mapped[str] = mapped_column(String(100), nullable=False)
    responsibility: Mapped[str] = mapped_column(Text, nullable=False)
    contact_person: Mapped[str] = mapped_column(String(150), nullable=False)
    contact_details: Mapped[str] = mapped_column(String(150), nullable=False)

    master_narrative: Mapped["MasterNarrative"] = relationship("MasterNarrative", back_populates="dr_team_relation")


class DRBCPMetric(Base):
    __tablename__ = "dr_kpi_metrics"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    issp_period: Mapped[str] = mapped_column(
        ForeignKey("master_narratives.issp_period", onupdate="CASCADE", ondelete="CASCADE"),
        nullable=False, 
        index=True
    )
    indicator: Mapped[str] = mapped_column(String(100), nullable=False)
    target_metric: Mapped[str] = mapped_column(String(150), nullable=False)

    master_narrative: Mapped["MasterNarrative"] = relationship("MasterNarrative", back_populates="dr_metrics_relation")


# =========================================================================
# DICT AUXILIARY CENSUS & GLOSSARY REGISTRIES
# =========================================================================

class GlossaryTerm(Base):
    __tablename__ = "glossary_terms"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    term: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    definition: Mapped[str] = mapped_column(Text, nullable=False)
    order_index: Mapped[int] = mapped_column(Integer, default=0, nullable=False)


class GeneralInstruction(Base):
    __tablename__ = "general_instructions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    step_number: Mapped[int] = mapped_column(Integer, unique=True, nullable=False)
    instruction_text: Mapped[str] = mapped_column(Text, nullable=False)


class IctStaffPosition(Base):
    __tablename__ = "ict_staff_positions"

    id: Mapped[uuid.UUID] = mapped_column(GUID, primary_key=True, default=uuid.uuid4)
    issp_period: Mapped[str] = mapped_column(
        ForeignKey("master_narratives.issp_period", onupdate="CASCADE", ondelete="CASCADE"),
        nullable=False, 
        index=True
    )
    position_title: Mapped[str] = mapped_column(String(150), nullable=False)
    status: Mapped[str] = mapped_column(String(50), nullable=False)
    count: Mapped[int] = mapped_column(Integer, default=1, nullable=False)

    master_narrative: Mapped["MasterNarrative"] = relationship("MasterNarrative", back_populates="staff_positions_relation")


# =========================================================================
# AUTOMATED REVISED EVENT LISTENERS
# =========================================================================

@event.listens_for(OrganizationalOutcome, 'before_insert')
@event.listens_for(OrganizationalOutcome, 'before_update')
def sync_organizational_outcome_names(mapper, connection, target: OrganizationalOutcome):
    if not target.outcome_name and target.program_name:
        target.outcome_name = target.program_name
    elif not target.program_name and target.outcome_name:
        target.program_name = target.outcome_name


@event.listens_for(MasterNarrative, 'before_insert')
@event.listens_for(MasterNarrative, 'before_update')
def enforce_master_narrative_integrity(mapper, connection, target: MasterNarrative):
    if not target.agency_name:
        target.agency_name = settings.DEFAULT_AGENCY_NAME

    cio_clean = (target.signatory_prepared_by or "").strip()
    if not cio_clean:
        target.signatory_prepared_by = target.preparer_position or "Chief Information Officer"
    else:
        target.signatory_prepared_by = cio_clean

    if not target.preparer_position or not target.preparer_position.strip():
        target.preparer_position = "Chief Information Officer"

    head_clean = (target.signatory_approved_by or "").strip()
    if not head_clean:
        target.signatory_approved_by = target.agency_head_position or settings.DEFAULT_AGENCY_HEAD_TITLE
    else:
        target.signatory_approved_by = head_clean

    if not target.agency_head_position or not target.agency_head_position.strip():
        target.agency_head_position = settings.DEFAULT_AGENCY_HEAD_TITLE

    if not target.agency_website_url:
        target.agency_website_url = settings.DEFAULT_AGENCY_WEBSITE

    if target.mandate_text is None: target.mandate_text = ""
    if target.vision_text is None: target.vision_text = ""
    if target.mission_text is None: target.mission_text = ""
    if target.present_situation_text is None: target.present_situation_text = ""
    if target.annual_ict_budget is None: target.annual_ict_budget = Decimal("0.00")
    if target.is_active is None: target.is_active = False
    if target.is_amendment is None: target.is_amendment = False
    if target.is_archived is None: target.is_archived = False

    if target.scope_choice:
        sc_clean = str(target.scope_choice).strip().lower().replace("_", "-")
        if sc_clean in ("department-wide", "department", "dept-wide"):
            target.scope_choice = "Department-Wide"
        elif sc_clean in ("agency-wide", "agency"):
            target.scope_choice = "Agency-Wide"
        elif sc_clean == "lgu":
            target.scope_choice = "LGU"
        elif "other" in sc_clean:
            target.scope_choice = "Other Government Entity"
    else:
        target.scope_choice = "Department-Wide"

    if target.scope_json is None: target.scope_json = {}
    if target.planners_json is None: target.planners_json = []

    if not target.drbcp_affected_assets_json:
        target.drbcp_affected_assets_json = [
            {"asset_group": "Primary Data Center (Central Office)", "details": "Physical enterprise servers, SAN/NAS storage arrays, core distribution switches."},
            {"asset_group": "Connectivity", "details": "Dedicated leased line fiber optic, redundant GovNet backbone, and SD-WAN routing."},
            {"asset_group": "Data Assets", "details": "Citizen frontline transactional databases, institutional document registries, and secure offsite snapshots."},
            {"asset_group": "Power Utilities", "details": "Standby automatic generator set and online double-conversion rackmount UPS units."}
        ]

    if not target.drbcp_recovery_strategy_text:
        target.drbcp_recovery_strategy_text = (
            "1. Off-site Backup Management: Daily encrypted database snapshots are transferred to a secure secondary facility located >30km away.\n"
            "2. Cloud Failover (GovCloud): Mission-critical public service, registry, and e-payment microservices are replicated in real time to DICT GovCloud.\n"
            "3. Redundancy: Dual-ISP providers configured in active-passive load distribution preventing single points of failure.\n"
            "4. Data Synchronization: Asynchronous database replication ensures an RPO limit of 1 hour during operational disruptions."
        )

    if not target.drbcp_sop_phases_text:
        target.drbcp_sop_phases_text = (
            "Phase I: Detection and Declaration: Automated monitoring alerts evaluate disaster scale; Incident Commander activates DRBCP within 1 hour if localized RTO cannot be maintained.\n"
            "Phase II: Activation and Execution: DRT redirected to GovCloud DR standby instance; DNS records updated; clean database backups verified and mounted.\n"
            "Phase III: Failback (Normal Operations): Primary data center infrastructure restored; synchronize transactional state delta from DR site during off-peak maintenance window."
        )

    if not target.drbcp_compliance_narrative_text:
        target.drbcp_compliance_narrative_text = (
            "Cybersecurity Integration: Formal cyber-recovery procedures isolate compromised networks and restore verified clean backups following ransomware or cyberattack incidents.\n"
            "Testing and Maintenance: Mandates at least one (1) full-scale DR simulation exercise per calendar year and semi-annual tabletop walkthroughs.\n"
            "Audit and Review: The DRBCP is reviewed annually or whenever major infrastructure or platform migrations occur.\n"
            "UACS and Budgeting: Funding for off-site replication, GovCloud standby subscriptions, and hardware maintenance is allocated under Continuing Costs in Part IV of the ISSP."
        )


@event.listens_for(InformationSystem, 'before_insert')
@event.listens_for(InformationSystem, 'before_update')
def sync_information_system_classification(mapper, connection, target: InformationSystem):
    """
    Synchronizes the classification display string with the independent multi-classification checkboxes.
    Guarantees that at least one classification is selected (defaults to Operations if none).
    Ensures submission_status has a safe default and aligns is_client_facing with is_frontline_service.
    Guarantees target_year, uacs_object_code, and expenditure_class have clean defaults.
    """
    if not target.is_support_to_operations and not target.is_general_administrative and not target.is_operations:
        target.is_operations = True

    if target.is_operations and not target.is_frontline_service and not target.is_non_frontline_service:
        if target.is_support_to_operations or target.is_general_administrative:
            target.is_operations = False
        else:
            target.is_frontline_service = True

    classes = []
    if target.is_support_to_operations:
        classes.append("Support to Operations")
    if target.is_general_administrative:
        classes.append("General Administrative Systems")
    if target.is_operations:
        if target.is_frontline_service and target.is_non_frontline_service:
            classes.append("Operations (Frontline & Non-Frontline)")
        elif target.is_frontline_service:
            classes.append("Operations - Frontline Service")
        elif target.is_non_frontline_service:
            classes.append("Operations - Non-Frontline Service")
        else:
            classes.append("Operations")

    target.classification = ", ".join(classes)

    if not getattr(target, "submission_status", None):
        target.submission_status = "Approved"

    if target.is_client_facing is None and target.is_frontline_service is not None:
        target.is_client_facing = bool(target.is_frontline_service)
    elif target.is_frontline_service is None and target.is_client_facing is not None:
        target.is_frontline_service = bool(target.is_client_facing)

    # Defensive defaults for target_year, uacs_object_code, and expenditure_class
    if target.target_year is None and target.issp_period and "-" in target.issp_period:
        try:
            target.target_year = int(target.issp_period.split("-")[0].strip())
        except Exception:
            pass

    if not getattr(target, "uacs_object_code", None):
        cost_val = Decimal(str(target.proposed_cost or 0))
        target.uacs_object_code = (
            "50604070 01 - ICT Software (Perpetual CO)" 
            if cost_val >= Decimal("50000.00") 
            else "50211030 00 - Consulting/Outsourced Development (MOOE)"
        )
    if not getattr(target, "expenditure_class", None):
        target.expenditure_class = "Capital Outlay" if "(CO)" in (target.uacs_object_code or "") else "Maintenance and Other Operating Expenses"


@event.listens_for(IctProject, 'before_insert')
@event.listens_for(IctProject, 'before_update')
def sync_ict_project_annual_deliverables(mapper, connection, target: IctProject):
    """
    Synchronizes dynamic annual_deliverables JSON map across all planning horizon years.
    Also synchronizes harmonization_criteria JSON map with legacy booleans bidirectionally.
    """
    if target.annual_deliverables is None:
        target.annual_deliverables = {}
    
    current_cal_year = datetime.utcnow().year
    start_y = target.duration_start_year or (
        int(target.issp_period.split("-")[0]) 
        if target.issp_period and "-" in target.issp_period 
        else current_cal_year
    )
    end_y = target.duration_end_year or (start_y + 2)

    if not target.annual_deliverables:
        if target.year_1_deliverables:
            target.annual_deliverables["Year 1"] = target.year_1_deliverables
            target.annual_deliverables[str(start_y)] = target.year_1_deliverables
        if target.year_2_deliverables:
            target.annual_deliverables["Year 2"] = target.year_2_deliverables
            target.annual_deliverables[str(start_y + 1)] = target.year_2_deliverables
        if target.year_3_deliverables:
            target.annual_deliverables["Year 3"] = target.year_3_deliverables
            target.annual_deliverables[str(end_y)] = target.year_3_deliverables

    if "Year 1" in target.annual_deliverables or str(start_y) in target.annual_deliverables:
        target.year_1_deliverables = target.annual_deliverables.get("Year 1") or target.annual_deliverables.get(str(start_y)) or ""
    if "Year 2" in target.annual_deliverables or str(start_y + 1) in target.annual_deliverables:
        target.year_2_deliverables = target.annual_deliverables.get("Year 2") or target.annual_deliverables.get(str(start_y + 1)) or ""
    if "Year 3" in target.annual_deliverables or str(end_y) in target.annual_deliverables:
        target.year_3_deliverables = target.annual_deliverables.get("Year 3") or target.annual_deliverables.get(str(end_y)) or ""

    if target.harmonization_criteria is None or not isinstance(target.harmonization_criteria, dict):
        target.harmonization_criteria = {
            "National Prioritization (PDP 2023-2028)": bool(target.harmonizes_national_priority),
            "Resource Optimization (GovNet, GovCloud)": bool(target.harmonizes_resource_optimization),
            "PeGIF Standardized APIs & Interoperability": bool(target.harmonizes_pegif),
            "Cross-Agency Collaboration (JMC / MOA)": bool(target.harmonizes_cross_collaboration),
            "Scalability and Sustainability (SPAR / PREXC)": bool(target.harmonizes_scalability)
        }
    else:
        hc = target.harmonization_criteria
        for k, v in hc.items():
            k_lower = k.lower()
            if "national" in k_lower or "pdp" in k_lower:
                target.harmonizes_national_priority = bool(v)
            elif "resource" in k_lower or "cloud" in k_lower or "govnet" in k_lower:
                target.harmonizes_resource_optimization = bool(v)
            elif "pegif" in k_lower or "api" in k_lower or "interoperab" in k_lower:
                target.harmonizes_pegif = bool(v)
            elif "cross" in k_lower or "collaboration" in k_lower or "jmc" in k_lower:
                target.harmonizes_cross_collaboration = bool(v)
            elif "scalab" in k_lower or "sustainab" in k_lower or "prexc" in k_lower or "spar" in k_lower:
                target.harmonizes_scalability = bool(v)


@event.listens_for(Proposal, 'before_insert')
@event.listens_for(Proposal, 'before_update')
def enforce_proposal_accounting_and_totals(mapper, connection, target: Proposal):
    """
    Enforces dynamic multi-year physical targets and calculates total_cost
    as the exact sum of annual inflation-adjusted outlays.
    Derives start_year dynamically from target.issp_period without static year assumptions.
    Respects parent project category inheritance without forcibly overriding valid strategic categories.
    """
    from app.utils.helpers import get_adjusted_unit_cost_for_year

    current_cal_year = datetime.utcnow().year
    start_year = current_cal_year
    if target.issp_period and "-" in target.issp_period:
        try:
            start_year = int(target.issp_period.split("-")[0].strip())
        except Exception:
            start_year = current_cal_year

    base_unit = target.unit_cost if target.unit_cost is not None else Decimal("0.00")
    total_accumulated = Decimal("0.00")
    calculated_total_qty = 0
    processed_calendar_years = set()

    raw_quantities = target.yearly_quantities if isinstance(target.yearly_quantities, dict) else {}
    clean_quantities = {}

    for yr_str, qty_val in raw_quantities.items():
        try:
            qty = int(qty_val) if qty_val is not None else 0
        except (ValueError, TypeError):
            qty = 0

        k_clean = str(yr_str).strip()
        cal_yr = None

        if k_clean.isdigit() and len(k_clean) == 4:
            cal_yr = int(k_clean)
        else:
            digits = re.findall(r'\d+', k_clean)
            if digits:
                num = int(digits[0])
                if num >= 2000:
                    cal_yr = num
                elif 1 <= num <= 50:
                    cal_yr = start_year + num - 1

        if cal_yr:
            if cal_yr not in processed_calendar_years:
                processed_calendar_years.add(cal_yr)
                if qty > 0:
                    adj_unit = get_adjusted_unit_cost_for_year(connection, base_unit, cal_yr, start_year)
                    total_accumulated += Decimal(qty) * adj_unit
                    calculated_total_qty += qty
            clean_quantities[str(cal_yr)] = qty
            idx = cal_yr - start_year + 1
            if idx > 0:
                clean_quantities[f"Year {idx}"] = qty

    if calculated_total_qty == 0:
        y1 = getattr(target, 'year_1_qty', 0) or 0
        y2 = getattr(target, 'year_2_qty', 0) or 0
        y3 = getattr(target, 'year_3_qty', 0) or 0
        if y1 > 0:
            total_accumulated += Decimal(y1) * get_adjusted_unit_cost_for_year(connection, base_unit, start_year, start_year)
            calculated_total_qty += y1
            clean_quantities[str(start_year)] = y1
            clean_quantities["Year 1"] = y1
        if y2 > 0:
            total_accumulated += Decimal(y2) * get_adjusted_unit_cost_for_year(connection, base_unit, start_year + 1, start_year)
            calculated_total_qty += y2
            clean_quantities[str(start_year + 1)] = y2
            clean_quantities["Year 2"] = y2
        if y3 > 0:
            total_accumulated += Decimal(y3) * get_adjusted_unit_cost_for_year(connection, base_unit, start_year + 2, start_year)
            calculated_total_qty += y3
            clean_quantities[str(start_year + 2)] = y3
            clean_quantities["Year 3"] = y3

    if total_accumulated == Decimal("0.00") and calculated_total_qty > 0 and base_unit > Decimal("0.00"):
        total_accumulated = Decimal(calculated_total_qty) * Decimal(str(base_unit))

    target.total_qty = calculated_total_qty
    target.total_cost = total_accumulated
    if clean_quantities:
        target.yearly_quantities = clean_quantities

    status_raw = str(target.status or "Draft").strip().lower()
    if status_raw == "submitted": target.status = "Submitted"
    elif status_raw == "approved": target.status = "Approved"
    elif status_raw == "returned": target.status = "Returned"
    else: target.status = "Draft"

    cat_raw = str(target.category or "Hardware").strip().lower()
    if "soft" in cat_raw: target.category = "Software"
    elif "sub" in cat_raw: target.category = "Subscription"
    elif "serv" in cat_raw: target.category = "Services"
    else: target.category = "Hardware"

    if target.project_rel and getattr(target.project_rel, "project_category", None):
        target.strategic_category = str(getattr(target.project_rel.project_category, "value", target.project_rel.project_category)).strip()
    elif not target.strategic_category or not target.strategic_category.strip():
        target.strategic_category = "Office Productivity"
        
    if not target.office_location: target.office_location = "Central Office"
    if not target.fund_source: target.fund_source = "General Appropriations Act (GAA)"
    if not target.system_development_status: target.system_development_status = "N/A"

    if target.is_in_house_turnover is None and target.created_by_students is not None:
        target.is_in_house_turnover = bool(target.created_by_students)
    elif target.created_by_students is None and target.is_in_house_turnover is not None:
        target.created_by_students = bool(target.is_in_house_turnover)
    elif target.is_in_house_turnover or target.created_by_students:
        target.is_in_house_turnover = True
        target.created_by_students = True
    else:
        target.is_in_house_turnover = False
        target.created_by_students = False

    if not target.uacs_object_code or target.uacs_object_code.strip() == "":
        try:
            from app.utils.helpers import classify_uacs_and_expenditure
            uacs, exp_class = classify_uacs_and_expenditure(
                item_name=target.item_name,
                unit_cost=target.unit_cost,
                strategic_category=target.strategic_category,
                category=target.category,
                created_by_students=target.created_by_students,
                is_in_house_turnover=target.is_in_house_turnover
            )
            target.uacs_object_code = uacs
            target.expenditure_class = exp_class
        except Exception:
            target.uacs_object_code = "50604050 03 - ICT Equipment (CO)"
            target.expenditure_class = "Capital Outlay"
    elif not target.expenditure_class or target.expenditure_class.strip() == "":
        if "(CO)" in (target.uacs_object_code or ""):
            target.expenditure_class = "Capital Outlay"
        elif "(MOOE)" in (target.uacs_object_code or ""):
            target.expenditure_class = "Maintenance and Other Operating Expenses"
        else:
            try:
                from app.utils.helpers import classify_uacs_and_expenditure
                _, exp_class = classify_uacs_and_expenditure(
                    item_name=target.item_name,
                    unit_cost=target.unit_cost,
                    strategic_category=target.strategic_category,
                    category=target.category,
                    created_by_students=target.created_by_students,
                    is_in_house_turnover=target.is_in_house_turnover
                )
                target.expenditure_class = exp_class
            except Exception:
                target.expenditure_class = "Capital Outlay"

    exp_lower = str(target.expenditure_class).lower()
    if "capital" in exp_lower:
        target.expenditure_class = "Capital Outlay"
    else:
        target.expenditure_class = "Maintenance and Other Operating Expenses"

    if target.is_expansion is None: target.is_expansion = False
    if target.is_archived is None: target.is_archived = False
    if target.is_restoring is None: target.is_restoring = False
    if not target.s3_storage_class: target.s3_storage_class = "STANDARD"

    target.sync_payload()


enforce_issp_singularity_and_accounting = enforce_proposal_accounting_and_totals


@event.listens_for(ExistingInventory, 'before_insert')
@event.listens_for(ExistingInventory, 'before_update')
def sync_inventory_office_location(mapper, connection, target: ExistingInventory):
    if target.office_location is not None:
        loc_val = getattr(target.office_location, "value", str(target.office_location))
        target.is_central_office = (loc_val in ["Central Office", "CENTRAL_OFFICE"])
    elif target.is_central_office:
        target.office_location = "Central Office"
    else:
        target.office_location = "Field/Regional Office"
