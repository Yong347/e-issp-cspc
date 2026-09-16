# app/database/models.py
import os
import enum
import uuid
import json
import base64
import logging
from decimal import Decimal
from datetime import datetime
from typing import Any, Dict, List, Optional
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
    UniqueConstraint,
    CheckConstraint
)
from sqlalchemy.types import TypeDecorator, CHAR
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship
from sqlalchemy.ext.mutable import MutableDict
from sqlalchemy.ext.hybrid import hybrid_property
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives import hashes

from app.config import settings

logger = logging.getLogger("app.database.models")

# ==========================================================
# SYSTEM EXCEPTIONS
# ==========================================================

class DecryptionError(Exception):
    """Raised when cryptographic decryption fails during EncryptedJSON parsing."""
    def __init__(self, message: str = "Cryptographic decryption failed. Data corruption or incorrect key detected."):
        self.message = message
        super().__init__(message)


class BusinessRuleViolation(ValueError):
    """Raised when an operation violates an active ISSP business rule or budget constraint."""
    def __init__(self, message: str):
        self.message = message
        super().__init__(message)


# ==========================================================
# DIALECT-AGNOSTIC GUID & SAFE ENUM STRING TYPES
# ==========================================================

class GUID(TypeDecorator):
    """
    Platform-independent GUID implementation.
    Standardizes on CHAR(36) representations across SQLite and PostgreSQL engines.
    Prevents PostgreSQL 'operator does not exist: character varying = uuid' errors
    while seamlessly handling native UUID instances and string UUIDs.
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
    - If send_name=True, binds member.name (for native PostgreSQL enums like assetstatus, proposalstatus).
    - If send_name=False, binds member.value (for VARCHAR columns storing human-readable values).
    - Resolves both member names ('CONDEMNED') and string values ('Condemned') seamlessly.
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


# ==========================================================
# CRYPTOGRAPHIC KEY AND SALT ACQUISITION
# ==========================================================

AES_SECRET_KEYS_STR = getattr(settings, "DB_ENCRYPTION_KEY", None)
if not AES_SECRET_KEYS_STR:
    raise KeyError("Configuration Error: The DB_ENCRYPTION_KEY environment variable is not defined.")

AES_SALT_STR = getattr(settings, "DB_ENCRYPTION_SALT", None)
if not AES_SALT_STR:
    raise KeyError("Configuration Error: The DB_ENCRYPTION_SALT environment variable is not defined.")

legacy_salt = AES_SALT_STR.encode("utf-8")
keys_list = [k.strip() for k in AES_SECRET_KEYS_STR.split(",") if k.strip()]

active_ciphers = []
for k in keys_list:
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=legacy_salt,
        iterations=100_000,
    )
    _key_bytes = kdf.derive(k.encode("utf-8"))
    fernet_key = base64.urlsafe_b64encode(_key_bytes)
    active_ciphers.append(Fernet(fernet_key))

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


class Base(DeclarativeBase):
    pass


# ==========================================================
# SYSTEM CONFIGURATION / SETTINGS MODEL
# ==========================================================

class SystemSetting(Base):
    __tablename__ = "system_settings"

    key: Mapped[str] = mapped_column(String(100), primary_key=True)
    value: Mapped[str] = mapped_column(String(255), nullable=False)


# ==========================================================
# CUSTOM ENCRYPTED JSON COLUMN DECORATOR
# ==========================================================

class EncryptedJSON(TypeDecorator):
    impl = Text
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        json_str = json.dumps(value)
        ciphertext_bytes = active_ciphers[0].encrypt(json_str.encode("utf-8"))
        return f"v3${ciphertext_bytes.decode('utf-8')}"

    def process_result_value(self, value, dialect):
        if value is None:
            return None

        if value.startswith("v3$"):
            parts = value.split("$")
            if len(parts) == 2:
                ciphertext_bytes = parts[1].encode("utf-8")
                for cipher in active_ciphers:
                    try:
                        decrypted_bytes = cipher.decrypt(ciphertext_bytes)
                        return json.loads(decrypted_bytes.decode("utf-8"))
                    except Exception:
                        continue
            try:
                return json.loads(value)
            except json.JSONDecodeError as e:
                raise DecryptionError("Cryptographic decryption failed for v3 payload.") from e

        if value.startswith("v2$"):
            try:
                parts = value.split("$")
                if len(parts) == 3:
                    row_salt = base64.b64decode(parts[1].encode("utf-8"))
                    ciphertext_bytes = parts[2].encode("utf-8")
                    for key in keys_list:
                        try:
                            cipher = get_v2_cipher(key, row_salt)
                            decrypted_bytes = cipher.decrypt(ciphertext_bytes)
                            return json.loads(decrypted_bytes.decode("utf-8"))
                        except Exception:
                            continue
            except Exception as e:
                logger.error("Row-level decryption failed under v2 formatting: %s", str(e))
            try:
                return json.loads(value)
            except json.JSONDecodeError as e:
                raise DecryptionError("Cryptographic decryption failed for v2 payload.") from e

        value_bytes = value.encode("utf-8")
        for cipher in active_ciphers:
            try:
                decrypted_bytes = cipher.decrypt(value_bytes)
                return json.loads(decrypted_bytes.decode("utf-8"))
            except Exception:
                continue

        try:
            return json.loads(value)
        except json.JSONDecodeError as e:
            logger.critical("Decryption completely failed. Block string is not readable JSON.")
            raise DecryptionError("Cryptographic decryption failed. Data corruption or incorrect key detected.") from e


# ==========================================================
# SYSTEM ENUMERATIONS (DICT ISSP v.2026 Canonical)
# ==========================================================

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
    ICT_TRAINING = "50202010 00 - Training Expenses (MOOE)"  # Mandated by DICT Guidelines Page 24


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


class NodeType(str, enum.Enum):
    ROOT = "root"
    PART = "part"
    SECTION = "section"
    SUBSECTION = "subsection"
    LEAF = "leaf"


class PageOrientation(str, enum.Enum):
    PORTRAIT = "portrait"
    LANDSCAPE = "landscape"
    portrait = "portrait"
    landscape = "landscape"


class ContentType(str, enum.Enum):
    RICH_TEXT = "rich_text"
    KEY_VALUE_TABLE = "key_value_table"
    STAFFING_MATRIX = "staffing_matrix"
    BUDGRID = "budget_grid"


class AssetRole(str, enum.Enum):
    LOGO = "logo"
    INLINE_DIAGRAM = "inline_diagram"
    FULL_PAGE_DIAGRAM = "full_page_diagram"


class DictAssetCategory(str, enum.Enum):
    """
    Standard DICT Annex 1 Asset Categories (Template Pages 1-3).
    Replaces fragile substring guesswork with a rigid single source of truth.
    """
    # 1. ICT Equipment Categories (Annex 1, Section 1)
    SERVERS = "Servers"
    DESKTOP = "Desktop"
    LAPTOP = "Laptop"
    MOBILE_PHONE = "Mobile Phone"
    TABLET = "Tablet"
    PRINTER = "Printer"
    NETWORK_SWITCH = "Network Switch"
    OTHERS_EQUIPMENT = "Others (ICT Equipment)"

    # 2. ICT Software Categories (Annex 1, Section 2)
    OFFICE_PRODUCTIVITY = "Office Productivity Tool"
    GRAMMAR_CHECKER = "Grammar checker"
    GRAPHICS_SIMULATION = "Graphics and Simulation Software"
    ANTIVIRUS = "Antivirus"
    IT_HELPDESK = "IT Help Desk Tool"
    PHOTO_VIDEO_EDITING = "Photo and Video Editing Software"
    WAF = "Web Application Firewall"
    OTHERS_SOFTWARE = "Others (ICT Software)"


# ==========================================================
# RESTRUCTURED DOCUMENT TREE MODELS
# ==========================================================

class IsspNode(Base):
    __tablename__ = "issp_nodes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    parent_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("issp_nodes.id", ondelete="CASCADE"), 
        nullable=True, 
        index=True
    )
    node_type: Mapped[NodeType] = mapped_column(SafeEnumType(NodeType, send_name=True), nullable=False)
    system_key: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    sequence_order: Mapped[Decimal] = mapped_column(Numeric(6, 3), nullable=False)
    page_orientation: Mapped[PageOrientation] = mapped_column(
        SafeEnumType(PageOrientation, send_name=True), 
        default=PageOrientation.LANDSCAPE, 
        nullable=False
    )
    force_page_break: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now(), nullable=False)

    parent: Mapped[Optional["IsspNode"]] = relationship("IsspNode", back_populates="children", remote_side=[id])
    children: Mapped[List["IsspNode"]] = relationship("IsspNode", back_populates="parent", cascade="all, delete-orphan")

    vocabulary: Mapped[Optional["IsspVocabulary"]] = relationship(
        "IsspVocabulary", 
        back_populates="node", 
        cascade="all, delete-orphan",
        uselist=False
    )
    contents: Mapped[List["IsspContent"]] = relationship("IsspContent", back_populates="node", cascade="all, delete-orphan")
    assets: Mapped[List["IsspAsset"]] = relationship("IsspAsset", back_populates="node", cascade="all, delete-orphan")


class IsspVocabulary(Base):
    __tablename__ = "issp_vocabulary"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    node_id: Mapped[int] = mapped_column(
        ForeignKey("issp_nodes.id", ondelete="CASCADE"), 
        nullable=False, 
        index=True
    )
    display_title: Mapped[str] = mapped_column(String(255), nullable=False)
    toc_label: Mapped[str] = mapped_column(String(255), nullable=False)

    node: Mapped["IsspNode"] = relationship("IsspNode", back_populates="vocabulary")


class IsspContent(Base):
    __tablename__ = "issp_contents"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    node_id: Mapped[int] = mapped_column(
        ForeignKey("issp_nodes.id", ondelete="CASCADE"), 
        nullable=False, 
        index=True
    )
    content_type: Mapped[ContentType] = mapped_column(SafeEnumType(ContentType, send_name=True), nullable=False)
    json_data: Mapped[Dict[str, Any]] = mapped_column(JSON, nullable=False)

    node: Mapped["IsspNode"] = relationship("IsspNode", back_populates="contents")


class IsspAsset(Base):
    __tablename__ = "issp_assets"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    node_id: Mapped[int] = mapped_column(
        ForeignKey("issp_nodes.id", ondelete="CASCADE"), 
        nullable=False, 
        index=True
    )
    file_path: Mapped[str] = mapped_column(String(255), nullable=False)
    asset_role: Mapped[AssetRole] = mapped_column(SafeEnumType(AssetRole, send_name=True), nullable=False)
    custom_title: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    aspect_ratio_preserve: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    node: Mapped["IsspNode"] = relationship("IsspNode", back_populates="assets")


# ==========================================================
# REGIONAL SITE & INSTITUTIONAL LAYOUT MODELS
# ==========================================================

class Campus(Base):
    """
    Physical Campus / Regional Office / Operating Site Registry.
    Retains the canonical database table name 'campuses' to avoid foreign key breaks
    while serving as a generic site locator for NGAs, SUCs, GOCCs, and LGUs.
    """
    __tablename__ = "campuses"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    location: Mapped[str] = mapped_column(String(200), nullable=False)
    code: Mapped[str] = mapped_column(String(10), unique=True, nullable=False)

    departments: Mapped[List["Department"]] = relationship("Department", back_populates="campus")
    users: Mapped[List["User"]] = relationship("User", back_populates="campus")
    server_capacities: Mapped[List["ServerCapacityTrack"]] = relationship("ServerCapacityTrack", back_populates="campus", cascade="all, delete-orphan")


class Department(Base):
    __tablename__ = "departments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(150), unique=True, nullable=False)

    campus_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("campuses.id", ondelete="SET NULL"), 
        nullable=True, 
        index=True
    )
    campus: Mapped[Optional[Campus]] = relationship("Campus", back_populates="departments")

    users: Mapped[List["User"]] = relationship("User", back_populates="department")
    proposals: Mapped[List["Proposal"]] = relationship("Proposal", back_populates="department", cascade="all, delete-orphan")
    needs_assessments: Mapped[List["NeedsAssessment"]] = relationship("NeedsAssessment", back_populates="department", cascade="all, delete-orphan")
    budget_ceilings: Mapped[List["BudgetCeiling"]] = relationship("BudgetCeiling", back_populates="department", cascade="all, delete-orphan")
    inventory: Mapped[List["ExistingInventory"]] = relationship("ExistingInventory", back_populates="department", cascade="all, delete-orphan")


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    role_tag: Mapped[RoleTag] = mapped_column(SafeEnumType(RoleTag, send_name=True), nullable=False)
    
    department_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("departments.id", ondelete="SET NULL"), 
        nullable=True, 
        index=True
    )
    campus_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("campuses.id", ondelete="SET NULL"), 
        nullable=True, 
        index=True
    )

    is_whitelisted: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    password_hash: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    
    department: Mapped[Optional[Department]] = relationship("Department", back_populates="users")
    campus: Mapped[Optional[Campus]] = relationship("Campus", back_populates="users")


# ==========================================================
# PART I: STRATEGIC CONTEXT & GOVERNANCE
# ==========================================================

class MasterNarrative(Base):
    __tablename__ = "master_narratives"

    issp_period: Mapped[str] = mapped_column(String(50), primary_key=True)
    agency_name: Mapped[str] = mapped_column(String(255), default=settings.DEFAULT_AGENCY_NAME, nullable=False)
    issp_period_from: Mapped[int] = mapped_column(Integer, nullable=False)
    issp_period_to: Mapped[int] = mapped_column(Integer, nullable=False)
    agency_website_url: Mapped[Optional[str]] = mapped_column(String(255), default=settings.DEFAULT_AGENCY_WEBSITE, nullable=True)

    is_amendment: Mapped[bool] = mapped_column(Boolean, default=False, server_default=text("false"), nullable=False)
    amendment_number: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    scope_choice: Mapped[Optional[ScopeChoice]] = mapped_column(SafeEnumType(ScopeChoice), default=ScopeChoice.DEPARTMENT_WIDE, nullable=True)
    scope_json: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSON, default=dict, server_default=text("'{}'"), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=False, server_default=text("false"), nullable=False)
    
    # Automated Lifecycle Archival & Snapshot Vault URL
    is_archived: Mapped[bool] = mapped_column(Boolean, default=False, server_default=text("false"), nullable=False)
    final_pdf_vault_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)

    # Official DICT Co-Branding, Seal & Certification Logos
    agency_logo_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    dict_logo_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    bagong_pilipinas_logo_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    cert_logo_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)

    signatory_prepared_by: Mapped[str] = mapped_column(String(200), default="Chief Information Officer", nullable=False)
    preparer_position: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
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

    mandate_html: Mapped[str] = mapped_column(Text, default="", server_default=text("''"), nullable=False)
    functions: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    vision_html: Mapped[str] = mapped_column(Text, default="", server_default=text("''"), nullable=False)
    mission_html: Mapped[str] = mapped_column(Text, default="", server_default=text("''"), nullable=False)
    present_situation_html: Mapped[str] = mapped_column(Text, default="", server_default=text("''"), nullable=False)

    # Dynamic Enterprise Architecture & Annex 2 (DRBCP) Narrative Sections
    enterprise_architecture_narrative: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    drbcp_affected_assets_json: Mapped[Optional[List[Dict[str, Any]]]] = mapped_column(JSON, default=list, server_default=text("'[]'"), nullable=True)
    drbcp_recovery_strategy_html: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    drbcp_sop_phases_html: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    drbcp_compliance_narrative_html: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # MITHI Res 2025-01 / SPAR 4 Pillars

    planners_json: Mapped[List[Dict[str, Any]]] = mapped_column(JSON, default=list, server_default=text("'[]'"), nullable=False)
    manpower_json: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSON, default=dict, server_default=text("'{}'"), nullable=True)
    annual_ict_budget: Mapped[Decimal] = mapped_column(Numeric(15, 2), default=Decimal("0.00"), server_default=text("0.00"), nullable=False)
    org_chart_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    authoring_cycle_duration: Mapped[Optional[int]] = mapped_column(Integer, default=3, nullable=True)

    major_final_outputs: Mapped[List[Dict[str, Any]]] = mapped_column(JSON, default=list, server_default=text("'[]'"), nullable=False)
    strategic_concerns_json: Mapped[List[Dict[str, Any]]] = mapped_column(JSON, default=list, server_default=text("'[]'"), nullable=False)

    conceptual_framework_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    systems_json: Mapped[List[Dict[str, Any]]] = mapped_column(JSON, default=list, server_default=text("'[]'"), nullable=False)
    databases_json: Mapped[List[Dict[str, Any]]] = mapped_column(JSON, default=list, server_default=text("'[]'"), nullable=False)

    internal_projects_json: Mapped[List[Dict[str, Any]]] = mapped_column(JSON, default=list, server_default=text("'[]'"), nullable=False)
    cross_projects_json: Mapped[List[Dict[str, Any]]] = mapped_column(JSON, default=list, server_default=text("'[]'"), nullable=False)
    pmf_matrix_json: Mapped[List[Dict[str, Any]]] = mapped_column(JSON, default=list, server_default=text("'[]'"), nullable=False)

    existing_ict_org_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    proposed_ict_org_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    placement_ict_org_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)

    # Dynamic JSON Store for Subsystem and Module Network Layouts (Eliminates hardcoded CSPC/SUC columns)
    subsystem_network_layouts_json: Mapped[List[Dict[str, Any]]] = mapped_column(
        JSON,
        default=list,
        server_default=text("'[]'"),
        nullable=False
    )

    mithi_network_profile: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSON, default=dict, server_default=text("'{}'"), nullable=True)
    mithi_special_solutions: Mapped[List[Dict[str, Any]]] = mapped_column(JSON, default=list, server_default=text("'[]'"), nullable=False)
    mithi_data_center: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSON, default=dict, server_default=text("'{}'"), nullable=True)
    mithi_hardware_inventory: Mapped[List[Dict[str, Any]]] = mapped_column(JSON, default=list, server_default=text("'[]'"), nullable=False)
    
    mithi_security_dr: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSON, default=dict, server_default=text("'{}'"), nullable=True)
    mithi_data_archiving: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSON, default=dict, server_default=text("'{}'"), nullable=True)
    mithi_ict_issues: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSON, default=dict, server_default=text("'{}'"), nullable=True)

    implementation_schedules: Mapped[List[Dict[str, Any]]] = mapped_column(JSON, default=list, server_default=text("'[]'"), nullable=False)
    functional_interface_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    
    site_development_plan_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    fiber_backbone_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    system_architecture_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    process_flow_diagram_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    network_diagram_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)

    outcomes: Mapped[List["OrganizationalOutcome"]] = relationship(
        "OrganizationalOutcome", 
        back_populates="narrative", 
        cascade="all, delete-orphan"
    )
    proposals: Mapped[List["Proposal"]] = relationship(
        "Proposal", 
        back_populates="master_narrative",
        cascade="save-update, merge",
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
    annual_costs_relation: Mapped[List["AnnualCostBreakdown"]] = relationship(
        "AnnualCostBreakdown", 
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

    def get_subsystem_layout(self, system_name: str) -> Optional[str]:
        """Retrieves subsystem layout diagram dynamically from JSON store."""
        if not system_name:
            return None
        target = system_name.strip().lower()
        for item in (self.subsystem_network_layouts_json or []):
            if isinstance(item, dict) and item.get("system_name", "").strip().lower() == target:
                return item.get("diagram_url")
        return None

    def set_subsystem_layout(self, system_name: str, diagram_url: str):
        """Sets or appends a subsystem layout diagram dynamically without hardcoded columns."""
        if not system_name:
            return
        target = system_name.strip().lower()
        layouts = list(self.subsystem_network_layouts_json or [])
        for item in layouts:
            if isinstance(item, dict) and item.get("system_name", "").strip().lower() == target:
                item["diagram_url"] = diagram_url
                self.subsystem_network_layouts_json = layouts
                return
        layouts.append({"system_name": system_name.strip(), "diagram_url": diagram_url})
        self.subsystem_network_layouts_json = layouts

    # Backward-Compatible Virtual Property Getters & Setters for Legacy Columns
    @property
    def net_layout_sias_url(self) -> Optional[str]:
        return self.get_subsystem_layout("Core Frontline Operations IS") or self.get_subsystem_layout("sias")

    @net_layout_sias_url.setter
    def net_layout_sias_url(self, value: Optional[str]) -> None:
        if value:
            self.set_subsystem_layout("Core Frontline Operations IS", value)

    @property
    def net_layout_library_url(self) -> Optional[str]:
        return self.get_subsystem_layout("Records & Knowledge Repository IS") or self.get_subsystem_layout("library")

    @net_layout_library_url.setter
    def net_layout_library_url(self, value: Optional[str]) -> None:
        if value:
            self.set_subsystem_layout("Records & Knowledge Repository IS", value)

    @property
    def net_layout_security_url(self) -> Optional[str]:
        return self.get_subsystem_layout("Security Operations & Access Control") or self.get_subsystem_layout("security")

    @net_layout_security_url.setter
    def net_layout_security_url(self, value: Optional[str]) -> None:
        if value:
            self.set_subsystem_layout("Security Operations & Access Control", value)

    @property
    def net_layout_hris_url(self) -> Optional[str]:
        return self.get_subsystem_layout("Human Resource Information System (HRIS)") or self.get_subsystem_layout("hris")

    @net_layout_hris_url.setter
    def net_layout_hris_url(self, value: Optional[str]) -> None:
        if value:
            self.set_subsystem_layout("Human Resource Information System (HRIS)", value)

    @property
    def net_layout_dms_url(self) -> Optional[str]:
        return self.get_subsystem_layout("Electronic Document Management System (EDMS)") or self.get_subsystem_layout("dms")

    @net_layout_dms_url.setter
    def net_layout_dms_url(self, value: Optional[str]) -> None:
        if value:
            self.set_subsystem_layout("Electronic Document Management System (EDMS)", value)

    @property
    def net_layout_supplies_url(self) -> Optional[str]:
        return self.get_subsystem_layout("Property, Supply & Asset Management IS") or self.get_subsystem_layout("supplies")

    @net_layout_supplies_url.setter
    def net_layout_supplies_url(self, value: Optional[str]) -> None:
        if value:
            self.set_subsystem_layout("Property, Supply & Asset Management IS", value)

    @property
    def net_layout_budget_url(self) -> Optional[str]:
        return self.get_subsystem_layout("Financial, Budget & Accounting IS") or self.get_subsystem_layout("budget")

    @net_layout_budget_url.setter
    def net_layout_budget_url(self, value: Optional[str]) -> None:
        if value:
            self.set_subsystem_layout("Financial, Budget & Accounting IS", value)

    @property
    def net_layout_sias_upgrade_url(self) -> Optional[str]:
        return self.get_subsystem_layout("Public Online Portals & E-Payment Gateways") or self.get_subsystem_layout("sias_upgrade")

    @net_layout_sias_upgrade_url.setter
    def net_layout_sias_upgrade_url(self, value: Optional[str]) -> None:
        if value:
            self.set_subsystem_layout("Public Online Portals & E-Payment Gateways", value)

    @property
    def net_layout_extension_url(self) -> Optional[str]:
        return self.get_subsystem_layout("Regional Extension & Field Branch Linkages") or self.get_subsystem_layout("extension")

    @net_layout_extension_url.setter
    def net_layout_extension_url(self, value: Optional[str]) -> None:
        if value:
            self.set_subsystem_layout("Regional Extension & Field Branch Linkages", value)

    @property
    def b_3_a_ict_org_url(self) -> Optional[str]:
        return self.existing_ict_org_url

    @b_3_a_ict_org_url.setter
    def b_3_a_ict_org_url(self, value: Optional[str]) -> None:
        if value:
            self.existing_ict_org_url = value

    @property
    def legal_basis(self) -> str:
        return self.mandate_html

    @legal_basis.setter
    def legal_basis(self, value: Optional[str]) -> None:
        if value is not None and str(value).strip():
            self.mandate_html = str(value).strip()

    @property
    def vision_statement(self) -> str:
        return self.vision_html

    @vision_statement.setter
    def vision_statement(self, value: Optional[str]) -> None:
        if value is not None and str(value).strip():
            self.vision_html = str(value).strip()

    @property
    def mission_statement(self) -> str:
        return self.mission_html

    @mission_statement.setter
    def mission_statement(self, value: Optional[str]) -> None:
        if value is not None and str(value).strip():
            self.mission_html = str(value).strip()

    @property
    def cio_name(self) -> str:
        return self.signatory_prepared_by

    @cio_name.setter
    def cio_name(self, value: Optional[str]) -> None:
        if value is not None and str(value).strip():
            self.signatory_prepared_by = str(value).strip()

    @property
    def cio_plantilla_position(self) -> Optional[str]:
        return self.preparer_position

    @cio_plantilla_position.setter
    def cio_plantilla_position(self, value: Optional[str]) -> None:
        if value is not None:
            self.preparer_position = value

    @property
    def cio_email(self) -> Optional[str]:
        return self.preparer_email

    @cio_email.setter
    def cio_email(self, value: Optional[str]) -> None:
        if value is not None:
            self.preparer_email = value

    @property
    def cio_contact_no(self) -> Optional[str]:
        return self.preparer_tel

    @cio_contact_no.setter
    def cio_contact_no(self, value: Optional[str]) -> None:
        if value is not None:
            self.preparer_tel = value

    @property
    def head_of_agency_name(self) -> str:
        return self.signatory_approved_by

    @head_of_agency_name.setter
    def head_of_agency_name(self, value: Optional[str]) -> None:
        if value is not None and str(value).strip():
            self.signatory_approved_by = str(value).strip()

    @property
    def agency_head_title(self) -> str:
        return self.agency_head_position or settings.DEFAULT_AGENCY_HEAD_TITLE

    @agency_head_title.setter
    def agency_head_title(self, value: Optional[str]) -> None:
        if value is not None and str(value).strip():
            self.agency_head_position = str(value).strip()

    @property
    def website_url(self) -> Optional[str]:
        return self.agency_website_url

    @website_url.setter
    def website_url(self, value: Optional[str]) -> None:
        if value is not None:
            self.agency_website_url = value


class OrganizationalOutcome(Base):
    """
    Broader scope statutory program categories:
    - Organizational Outcomes (OO) for NGAs
    - Strategic Objectives (SO) for GOCCs
    - Major Final Outputs (MFO) for SUCs and LGUs
    """
    __tablename__ = "organizational_outcomes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    issp_period: Mapped[str] = mapped_column(
        ForeignKey("master_narratives.issp_period", onupdate="CASCADE", ondelete="CASCADE"), 
        nullable=False, 
        index=True
    )
    type_label: Mapped[str] = mapped_column(String(50), default="Organizational Outcome", nullable=False)
    outcome_name: Mapped[str] = mapped_column(String(255), nullable=False)
    program_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    narrative: Mapped["MasterNarrative"] = relationship("MasterNarrative", back_populates="outcomes")
    proposals: Mapped[List["Proposal"]] = relationship("Proposal", back_populates="outcome")
    strategic_concerns: Mapped[List["StrategicConcern"]] = relationship("StrategicConcern", back_populates="outcome", cascade="all, delete-orphan")


class HumanCapital(Base):
    """
    Part I.B.2 Staffing Matrix (Current and Proposed Aggregate Counts).
    """
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
    complexity_incoming: Mapped[str] = mapped_column(String(50), default="Simple", nullable=False)
    complexity_outgoing: Mapped[str] = mapped_column(String(50), default="Simple", nullable=False)

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


# ==========================================================
# PART II: CURRENT ICT ASSESSMENT & STRATEGIC CONCERNS
# ==========================================================

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
    program_name: Mapped[str] = mapped_column(String(100), nullable=False)
    is_utilized: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    url_or_system_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    equivalent_system_details: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_manual: Mapped[bool] = mapped_column(Boolean, default=False, server_default=text("false"), nullable=False)
    is_proposed_development: Mapped[bool] = mapped_column(Boolean, default=False, server_default=text("false"), nullable=False)
    adoption_ratio: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    channels_json: Mapped[List[str]] = mapped_column(JSON, default=list, nullable=False)
    is_connected_to_portal: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    master_narrative: Mapped["MasterNarrative"] = relationship("MasterNarrative", back_populates="egov_checklists_relation")


# ==========================================================
# PART II.C & PART III.D: INFORMATION SYSTEMS
# ==========================================================

class InformationSystem(Base):
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

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[SystemStatus] = mapped_column(SafeEnumType(SystemStatus), default=SystemStatus.OPERATIONAL, nullable=False)
    classification: Mapped[SystemClassification] = mapped_column(SafeEnumType(SystemClassification), nullable=False)
    hosting_type: Mapped[SystemHostingType] = mapped_column(SafeEnumType(SystemHostingType), default=SystemHostingType.HYBRID, nullable=False)
    online_url: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    description_and_purpose: Mapped[str] = mapped_column(Text, nullable=False)
    enhancement_details: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # Mandated by DICT Guidelines Page 13
    development_strategy: Mapped[DevelopmentStrategy] = mapped_column(SafeEnumType(DevelopmentStrategy), nullable=False)
    development_platform: Mapped[str] = mapped_column(String(200), nullable=False)
    database_name: Mapped[str] = mapped_column(String(200), nullable=False)
    data_storage_type: Mapped[str] = mapped_column(String(200), nullable=False)

    internal_users: Mapped[str] = mapped_column(Text, nullable=False)
    external_users: Mapped[str] = mapped_column(Text, nullable=False)
    system_owner_office: Mapped[str] = mapped_column(String(200), nullable=False)

    is_integrated_with_others: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    internal_integrated_systems: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    external_integrated_systems: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    generates_data_for_others: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    processes_data_from_others: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_deployed_on_shared_platform: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    processes_personal_information: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    has_undergone_pia: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    master_narrative: Mapped["MasterNarrative"] = relationship("MasterNarrative", back_populates="information_systems_relation")
    strategic_concern: Mapped[Optional["StrategicConcern"]] = relationship("StrategicConcern", back_populates="information_systems")
    projects: Mapped[List["IctProject"]] = relationship("IctProject", back_populates="information_system")
    bia_record: Mapped[Optional["BusinessImpactAnalysis"]] = relationship("BusinessImpactAnalysis", back_populates="system", uselist=False)


# ==========================================================
# PART III.E & PART III.F: ICT PROJECTS & PMF
# ==========================================================

class IctProject(Base):
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
    project_category: Mapped[ProjectCategory] = mapped_column(SafeEnumType(ProjectCategory), default=ProjectCategory.INTERNAL_ICT_PROJECT, nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    objectives: Mapped[str] = mapped_column(Text, nullable=False)

    aligns_pip: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    aligns_ncsp: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    aligns_egmp: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    aligns_pcb: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    aligns_others: Mapped[bool] = mapped_column(Boolean, default=False, server_default=text("false"), nullable=False)
    aligns_others_specify: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    harmonizes_national_priority: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    harmonizes_resource_optimization: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    harmonizes_pegif: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    harmonizes_cross_collaboration: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    harmonizes_scalability: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    duration_start_year: Mapped[int] = mapped_column(Integer, nullable=False)
    duration_end_year: Mapped[int] = mapped_column(Integer, nullable=False)

    # Dynamic multi-year annual deliverables mapping (supports 1 to N years)
    annual_deliverables: Mapped[Dict[str, str]] = mapped_column(
        MutableDict.as_mutable(JSON),
        default=dict,
        server_default=text("'{}'"),
        nullable=False
    )

    # Backward-compatible column aliases for existing database migrations and queries
    year_1_deliverables: Mapped[Optional[str]] = mapped_column(Text, nullable=True, default="")
    year_2_deliverables: Mapped[Optional[str]] = mapped_column(Text, nullable=True, default="")
    year_3_deliverables: Mapped[Optional[str]] = mapped_column(Text, nullable=True, default="")

    implementing_unit: Mapped[str] = mapped_column(String(200), default="ICT Management Office", nullable=False)
    funding_source: Mapped[FundSource] = mapped_column(SafeEnumType(FundSource), default=FundSource.GAA, nullable=False)

    lead_agency: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    partner_agencies: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    master_narrative: Mapped["MasterNarrative"] = relationship("MasterNarrative", back_populates="ict_projects_relation")
    information_system: Mapped[Optional["InformationSystem"]] = relationship("InformationSystem", back_populates="projects")
    pmf_metrics: Mapped[List["PerformanceMetric"]] = relationship("PerformanceMetric", back_populates="project_rel", cascade="all, delete-orphan")
    resource_items: Mapped[List["Proposal"]] = relationship("Proposal", back_populates="project_rel")

    def get_deliverable_for_year(self, year_num: int, calendar_year: Optional[int] = None) -> str:
        """Retrieves deliverable for a specific year, falling back gracefully across keys."""
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
        try:
            items = self.__dict__.get("resource_items") or getattr(self, "resource_items", None)
            if not items:
                return Decimal("0.00")
            total = Decimal("0.00")
            for item in items:
                if getattr(item, "is_archived", False):
                    continue
                tc = getattr(item, "total_cost", None)
                if tc is not None:
                    total += Decimal(str(tc))
                else:
                    qty = getattr(item, "total_qty", 0) or 0
                    unit = getattr(item, "unit_cost", 0) or 0
                    total += Decimal(qty) * Decimal(str(unit))
            return total
        except Exception as e:
            logger.debug(f"Could not compute total project cost for {getattr(self, 'id', '')}: {e}")
            return Decimal("0.00")


class PerformanceMetric(Base):
    __tablename__ = "performance_metrics"

    id: Mapped[uuid.UUID] = mapped_column(GUID, primary_key=True, default=uuid.uuid4)
    issp_period: Mapped[str] = mapped_column(
        ForeignKey("master_narratives.issp_period", onupdate="CASCADE", ondelete="CASCADE"), 
        nullable=False, 
        index=True
    )
    project_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        GUID,
        ForeignKey("ict_projects.id", ondelete="CASCADE"), 
        nullable=True, 
        index=True
    )
    project_title: Mapped[str] = mapped_column(String(200), nullable=False)
    result_hierarchy: Mapped[str] = mapped_column(SafeEnumStringType, nullable=False)
    indicator: Mapped[str] = mapped_column(Text, nullable=False)
    baseline: Mapped[str] = mapped_column(String(200), nullable=False)
    target: Mapped[str] = mapped_column(String(200), nullable=False)
    collection_method: Mapped[str] = mapped_column(String(200), nullable=False)
    responsibility: Mapped[str] = mapped_column(String(150), nullable=False)

    master_narrative: Mapped["MasterNarrative"] = relationship("MasterNarrative", back_populates="performance_metrics_relation")
    project_rel: Mapped[Optional["IctProject"]] = relationship("IctProject", back_populates="pmf_metrics")

    @property
    def kpi_indicator(self) -> str:
        return self.indicator

    @kpi_indicator.setter
    def kpi_indicator(self, val: str) -> None:
        self.indicator = val

    @property
    def baseline_data(self) -> str:
        return self.baseline

    @baseline_data.setter
    def baseline_data(self, val: str) -> None:
        self.baseline = val

    @property
    def target_metric(self) -> str:
        return self.target

    @target_metric.setter
    def target_metric(self, val: str) -> None:
        self.target = val

    @property
    def data_collection_method(self) -> str:
        return self.collection_method

    @data_collection_method.setter
    def data_collection_method(self, val: str) -> None:
        self.collection_method = val

    @property
    def responsible_unit(self) -> str:
        return self.responsibility

    @responsible_unit.setter
    def responsible_unit(self, val: str) -> None:
        self.responsibility = val


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


# ==========================================================
# PART IV: RESOURCE REQUIREMENTS (UNIFIED CAPEX & MOOE ATOMS)
# ==========================================================

class Proposal(Base):
    """
    Central unified resource proposal ledger combining CapEx and MOOE.
    Target deployment office is automated to the submitting department.
    Broader Scope (Organizational Outcome) is directly linked via outcome_id.
    Optional foreign key needs_assessment_id binds line item directly to Sec 8.0.
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
        ForeignKey("master_narratives.issp_period", onupdate="CASCADE", ondelete="RESTRICT"),
        nullable=False, 
        index=True
    )
    
    # Broader Scope Target: Organizational Outcome (Part I.A.4)
    outcome_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("organizational_outcomes.id", ondelete="RESTRICT"), 
        nullable=False, 
        index=True
    )
    project_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        GUID,
        ForeignKey("ict_projects.id", ondelete="SET NULL"),
        nullable=True,
        index=True
    )
    # Optional Link to Source Needs Assessment (Section 8.0)
    needs_assessment_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        GUID,
        ForeignKey("needs_assessments.id", ondelete="SET NULL"),
        nullable=True,
        index=True
    )

    # Merged Categorization
    category: Mapped[ProposalCategory] = mapped_column(SafeEnumType(ProposalCategory, send_name=True), default=ProposalCategory.HARDWARE, nullable=False, index=True)
    strategic_category: Mapped[ProjectCategory] = mapped_column(
        SafeEnumType(ProjectCategory), 
        default=ProjectCategory.OFFICE_PRODUCTIVITY, 
        nullable=False
    )
    office_location: Mapped[OfficeLocation] = mapped_column(
        SafeEnumType(OfficeLocation), 
        default=OfficeLocation.CENTRAL_OFFICE, 
        nullable=False
    )
    fund_source: Mapped[FundSource] = mapped_column(
        SafeEnumType(FundSource), 
        default=FundSource.GAA, 
        nullable=False
    )
    uacs_object_code: Mapped[UacsObjectCode] = mapped_column(
        SafeEnumType(UacsObjectCode), 
        default=UacsObjectCode.ICT_EQUIPMENT, 
        nullable=False
    )
    expenditure_class: Mapped[ExpenditureClass] = mapped_column(
        SafeEnumType(ExpenditureClass), 
        default=ExpenditureClass.CAPITAL_OUTLAY, 
        nullable=False
    )
    status: Mapped[ProposalStatus] = mapped_column(SafeEnumType(ProposalStatus, send_name=True), default=ProposalStatus.DRAFT, nullable=False)
    
    item_name: Mapped[str] = mapped_column(String(200), nullable=False)
    item_key: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    unit_cost: Mapped[Decimal] = mapped_column(Numeric(15, 2), default=Decimal("0.00"), nullable=False)
    
    year_1_qty: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    year_2_qty: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    year_3_qty: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    yearly_quantities: Mapped[Dict[str, int]] = mapped_column(
        MutableDict.as_mutable(JSON), 
        default=dict, 
        nullable=False
    )
    
    total_qty: Mapped[int] = mapped_column(Integer, default=0, nullable=False, index=True)
    total_cost: Mapped[Decimal] = mapped_column(Numeric(15, 2), default=Decimal("0.00"), nullable=False)

    justification: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    subscription_type: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)

    # For Proposals exceeding ₱2,000,000.00 in budget (For Development / For Enhancement)
    system_development_status: Mapped[SystemDevelopmentStatus] = mapped_column(
        SafeEnumType(SystemDevelopmentStatus), 
        default=SystemDevelopmentStatus.NOT_APPLICABLE, 
        nullable=False
    )

    # In-House / Internally Developed Software Flag (Supports Turnover Deeds & Non-Monetary Assets)
    created_by_students: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # Target Deployment Office automated to logged-in user department
    target_office_automated: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    project_key: Mapped[Optional[str]] = mapped_column(String(100), nullable=True, index=True)

    payload: Mapped[Dict[str, Any]] = mapped_column(
        MutableDict.as_mutable(EncryptedJSON),
        default=dict,
        nullable=False
    )
    
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    is_archived: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    canvas_evidence_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    custom_specification: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)

    s3_storage_class: Mapped[str] = mapped_column(String(50), default="STANDARD", nullable=False)
    is_restoring: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_expansion: Mapped[bool] = mapped_column(Boolean, default=False, server_default=text("false"), nullable=False)
    canvas_expiration_date: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True, index=True)

    department: Mapped[Department] = relationship("Department", back_populates="proposals")
    outcome: Mapped[OrganizationalOutcome] = relationship("OrganizationalOutcome", back_populates="proposals")
    project_rel: Mapped[Optional["IctProject"]] = relationship("IctProject", back_populates="resource_items")
    needs_assessment: Mapped[Optional["NeedsAssessment"]] = relationship("NeedsAssessment", back_populates="proposals")
    master_narrative: Mapped[Optional["MasterNarrative"]] = relationship("MasterNarrative", back_populates="proposals")
    audit_logs: Mapped[List["AuditTrail"]] = relationship("AuditTrail", back_populates="proposal", cascade="all, delete-orphan")

    @property
    def is_in_house_turnover(self) -> bool:
        """Generic alias for in-house / non-commercial asset developments."""
        return self.created_by_students

    @is_in_house_turnover.setter
    def is_in_house_turnover(self, val: bool) -> None:
        self.created_by_students = bool(val)

    @property
    def project(self) -> Optional["IctProject"]:
        return self.project_rel

    @project.setter
    def project(self, val: Optional["IctProject"]) -> None:
        self.project_rel = val

    @property
    def item_select(self) -> Optional[str]:
        return self.item_key

    @item_select.setter
    def item_select(self, val: Optional[str]) -> None:
        self.item_key = val

    @property
    def software_name(self) -> str:
        return self.item_name

    @software_name.setter
    def software_name(self, val: str) -> None:
        self.item_name = val

    @property
    def annual_cost_per_user(self) -> Decimal:
        return self.unit_cost

    @annual_cost_per_user.setter
    def annual_cost_per_user(self, val: Decimal) -> None:
        self.unit_cost = val

    @property
    def yearly_users(self) -> Dict[str, int]:
        return self.yearly_quantities

    @yearly_users.setter
    def yearly_users(self, val: Dict[str, int]) -> None:
        self.yearly_quantities = val

    @property
    def total_multiyear_mooe(self) -> Decimal:
        return self.total_cost

    def sync_payload(self) -> None:
        if self.payload is None:
            self.payload = {}
        self.payload["canvas_evidence_url"] = self.canvas_evidence_url
        self.payload["custom_specification"] = self.custom_specification
        self.payload["item_name"] = self.item_name
        self.payload["item_key"] = self.item_key
        self.payload["unit_cost"] = str(self.unit_cost) if self.unit_cost is not None else "0.00"
        self.payload["total_cost"] = str(self.total_cost) if self.total_cost is not None else "0.00"
        self.payload["project_key"] = self.project_key
        self.payload["is_expansion"] = bool(self.is_expansion)
        self.payload["target_office_automated"] = self.target_office_automated
        self.payload["year_1_qty"] = self.year_1_qty
        self.payload["year_2_qty"] = self.year_2_qty
        self.payload["year_3_qty"] = self.year_3_qty
        self.payload["needs_assessment_id"] = str(self.needs_assessment_id) if self.needs_assessment_id else None

        dev_status = self.system_development_status
        if hasattr(dev_status, "value"):
            self.payload["system_development_status"] = dev_status.value
        elif dev_status is not None:
            self.payload["system_development_status"] = str(dev_status)
        else:
            self.payload["system_development_status"] = SystemDevelopmentStatus.NOT_APPLICABLE.value

        self.payload["created_by_students"] = bool(self.created_by_students)
        self.payload["canvas_expiration_date"] = (
            self.canvas_expiration_date.isoformat() if self.canvas_expiration_date else None
        )


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

    @hybrid_property
    def dynamic_mooe_allocation(self) -> Decimal:
        return self.allocated_mooe

    @sub_ceiling.setter
    def sub_ceiling(self, value: Decimal) -> None:
        """
        Sets sub_ceiling naturally without overwriting CapEx and MOOE with an unauthorized 70/30 split.
        If both capex and mooe are zero, allocates to capex by default.
        """
        if value is None:
            value = Decimal("0.00")
        elif not isinstance(value, Decimal):
            value = Decimal(str(value))
        quantized_total = value.quantize(Decimal("1.00"))
        
        if (self.allocated_capex or Decimal("0.00")) == Decimal("0.00") and (self.allocated_mooe or Decimal("0.00")) == Decimal("0.00"):
            self.allocated_capex = quantized_total
            self.allocated_mooe = Decimal("0.00")

    @sub_ceiling.expression
    def sub_ceiling(cls):
        return cls.allocated_capex + cls.allocated_mooe


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


# ==========================================================
# SECTION 8.0: NEEDS ASSESSMENT
# ==========================================================

class NeedsAssessment(Base):
    __tablename__ = "needs_assessments"

    id: Mapped[uuid.UUID] = mapped_column(GUID, primary_key=True, default=uuid.uuid4)
    department_id: Mapped[int] = mapped_column(
        ForeignKey("departments.id", ondelete="CASCADE"), 
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

    # Aggregation & Strategic Provenance Fields
    is_aggregated: Mapped[bool] = mapped_column(Boolean, default=False, server_default=text("false"), nullable=False)
    strategic_concern_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        GUID,
        ForeignKey("strategic_concerns.id", ondelete="SET NULL"),
        nullable=True,
        index=True
    )

    department: Mapped["Department"] = relationship("Department", back_populates="needs_assessments")
    proposals: Mapped[List["Proposal"]] = relationship("Proposal", back_populates="needs_assessment")
    strategic_concern: Mapped[Optional["StrategicConcern"]] = relationship("StrategicConcern", back_populates="needs_assessments")


class AnnualCostBreakdown(Base):
    __tablename__ = "annual_cost_breakdown"

    id: Mapped[uuid.UUID] = mapped_column(GUID, primary_key=True, default=uuid.uuid4)
    issp_period: Mapped[str] = mapped_column(
        ForeignKey("master_narratives.issp_period", onupdate="CASCADE", ondelete="CASCADE"), 
        nullable=False, 
        index=True
    )
    project_key: Mapped[str] = mapped_column(String(100), nullable=False)
    cost_type: Mapped[str] = mapped_column(String(50), nullable=False)
    item_description: Mapped[str] = mapped_column(String(200), nullable=False)
    unit_cost: Mapped[Decimal] = mapped_column(Numeric(15, 2), nullable=False)
    yearly_quantities: Mapped[Dict[str, int]] = mapped_column(JSON, default=dict, nullable=False)

    master_narrative: Mapped["MasterNarrative"] = relationship("MasterNarrative", back_populates="annual_costs_relation")


# ==========================================================
# ANNEX 1: ASSET INVENTORY & OBSOLESCENCE (MANAGED BY SUPPLY USER)
# ==========================================================

class ExistingInventory(Base):
    """
    ICT INVENTORY: Handled globally by ROLE_SUPPLY_USER.
    Departments can view their own department's items.
    Explicitly categorizes assets into DICT Annex 1 Standard Categories (Template Pages 1-3).
    """
    __tablename__ = "existing_inventory"

    id: Mapped[uuid.UUID] = mapped_column(GUID, primary_key=True, default=uuid.uuid4)
    department_id: Mapped[int] = mapped_column(
        ForeignKey("departments.id", ondelete="CASCADE"), 
        nullable=False, 
        index=True
    )
    
    # DICT Standard Category Mapping
    dict_category: Mapped[Optional[DictAssetCategory]] = mapped_column(
        SafeEnumType(DictAssetCategory),
        nullable=True,
        index=True
    )
    other_category_name: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)

    item_name: Mapped[str] = mapped_column(String(200), nullable=False)
    specs: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    exact_model: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    quantity: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    status: Mapped[AssetStatus] = mapped_column(
        SafeEnumType(AssetStatus, send_name=True), 
        default=AssetStatus.FUNCTIONAL, 
        nullable=False
    )
    date_acquired: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    acquired_price: Mapped[Decimal] = mapped_column(Numeric(15, 2), default=Decimal("0.00"), nullable=False)

    office_location: Mapped[OfficeLocation] = mapped_column(
        SafeEnumType(OfficeLocation), 
        default=OfficeLocation.CENTRAL_OFFICE, 
        nullable=False
    )
    is_central_office: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_end_of_life: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_backup: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_software: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_perpetual: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    unserviceable_report_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)

    department: Mapped[Department] = relationship("Department", back_populates="inventory")


# ==========================================================
# ANNEX 2: DISASTER RECOVERY & BUSINESS CONTINUITY (DRBCP)
# ==========================================================

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


# ==========================================================
# DICT AUXILIARY CENSUS & GLOSSARY REGISTRIES
# ==========================================================

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


class ServerCapacityTrack(Base):
    __tablename__ = "server_capacity_tracking"

    id: Mapped[uuid.UUID] = mapped_column(GUID, primary_key=True, default=uuid.uuid4)
    campus_id: Mapped[int] = mapped_column(ForeignKey("campuses.id", ondelete="CASCADE"), nullable=False, index=True)
    capacity_tier: Mapped[str] = mapped_column(String(50), nullable=False)
    location: Mapped[str] = mapped_column(String(50), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, default=1, nullable=False)

    campus: Mapped[Campus] = relationship("Campus", back_populates="server_capacities")


class ClientOsCensus(Base):
    __tablename__ = "client_os_census"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    os_name: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    workstations_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    servers_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)


class OfficeSoftwareCensus(Base):
    __tablename__ = "office_software_census"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    software_name: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    license_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)


class IctStaffPosition(Base):
    """
    Part III.C Proposed ICT Human Capital (Template Page 19).
    """
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


# ==========================================================
# AUTOMATED PAYLOAD & CAPITALIZATION EVENT LISTENERS
# ==========================================================

@event.listens_for(OrganizationalOutcome, 'before_insert')
@event.listens_for(OrganizationalOutcome, 'before_update')
def sync_organizational_outcome_names(mapper, connection, target: OrganizationalOutcome):
    """
    Ensures that outcome_name and program_name remain synchronized in memory.
    If either is specified, the other is automatically populated.
    """
    if not target.outcome_name and target.program_name:
        target.outcome_name = target.program_name
    elif not target.program_name and target.outcome_name:
        target.program_name = target.outcome_name


@event.listens_for(MasterNarrative, 'before_insert')
@event.listens_for(MasterNarrative, 'before_update')
def enforce_master_narrative_integrity(mapper, connection, target: MasterNarrative):
    """
    Guarantees that mandatory non-nullable columns in master_narratives
    never attempt to insert NULL into PostgreSQL, pulling dynamic defaults from configuration.
    """
    if not target.agency_name:
        target.agency_name = settings.DEFAULT_AGENCY_NAME
    if not target.signatory_prepared_by:
        target.signatory_prepared_by = "Chief Information Officer"
    if not target.signatory_approved_by:
        target.signatory_approved_by = target.agency_head_position or settings.DEFAULT_AGENCY_HEAD_TITLE
    if not target.agency_head_position:
        target.agency_head_position = settings.DEFAULT_AGENCY_HEAD_TITLE
    if not target.agency_website_url:
        target.agency_website_url = settings.DEFAULT_AGENCY_WEBSITE
    if target.mandate_html is None:
        target.mandate_html = ""
    if target.vision_html is None:
        target.vision_html = ""
    if target.mission_html is None:
        target.mission_html = ""
    if target.present_situation_html is None:
        target.present_situation_html = ""
    if target.annual_ict_budget is None:
        target.annual_ict_budget = Decimal("0.00")
    if target.is_active is None:
        target.is_active = False
    if target.is_amendment is None:
        target.is_amendment = False
    if target.is_archived is None:
        target.is_archived = False
    if target.scope_choice is None:
        target.scope_choice = ScopeChoice.DEPARTMENT_WIDE
    if target.scope_json is None:
        target.scope_json = {}
    if target.planners_json is None:
        target.planners_json = []
    if target.major_final_outputs is None:
        target.major_final_outputs = []
    if target.strategic_concerns_json is None:
        target.strategic_concerns_json = []
    if target.systems_json is None:
        target.systems_json = []
    if target.databases_json is None:
        target.databases_json = []
    if target.internal_projects_json is None:
        target.internal_projects_json = []
    if target.cross_projects_json is None:
        target.cross_projects_json = []
    if target.pmf_matrix_json is None:
        target.pmf_matrix_json = []
    if target.mithi_special_solutions is None:
        target.mithi_special_solutions = []
    if target.mithi_hardware_inventory is None:
        target.mithi_hardware_inventory = []
    if target.implementation_schedules is None:
        target.implementation_schedules = []
    if target.drbcp_affected_assets_json is None:
        target.drbcp_affected_assets_json = []
    if target.subsystem_network_layouts_json is None:
        target.subsystem_network_layouts_json = []


@event.listens_for(IctProject, 'before_insert')
@event.listens_for(IctProject, 'before_update')
def sync_ict_project_annual_deliverables(mapper, connection, target: IctProject):
    """
    Synchronizes dynamic annual deliverables JSON with backward-compatible 
    year_1, year_2, year_3 columns seamlessly.
    """
    if target.annual_deliverables is None:
        target.annual_deliverables = {}
    
    start_y = target.duration_start_year or 2026
    end_y = target.duration_end_year or (start_y + 2)

    # Sync from columns to JSON if JSON is unpopulated
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

    # Sync from JSON to columns for backward-compatibility
    if "Year 1" in target.annual_deliverables or str(start_y) in target.annual_deliverables:
        target.year_1_deliverables = target.annual_deliverables.get("Year 1") or target.annual_deliverables.get(str(start_y)) or ""
    if "Year 2" in target.annual_deliverables or str(start_y + 1) in target.annual_deliverables:
        target.year_2_deliverables = target.annual_deliverables.get("Year 2") or target.annual_deliverables.get(str(start_y + 1)) or ""
    if "Year 3" in target.annual_deliverables or str(end_y) in target.annual_deliverables:
        target.year_3_deliverables = target.annual_deliverables.get("Year 3") or target.annual_deliverables.get(str(end_y)) or ""


@event.listens_for(Proposal, 'before_insert')
@event.listens_for(Proposal, 'before_update')
def enforce_issp_singularity_and_accounting(mapper, connection, target: Proposal):
    if target.system_development_status is None:
        target.system_development_status = SystemDevelopmentStatus.NOT_APPLICABLE
    if target.category is None:
        target.category = ProposalCategory.HARDWARE
    if target.strategic_category is None:
        target.strategic_category = ProjectCategory.OFFICE_PRODUCTIVITY
    if target.status is None:
        target.status = ProposalStatus.DRAFT
    if target.office_location is None:
        target.office_location = OfficeLocation.CENTRAL_OFFICE
    if target.fund_source is None:
        target.fund_source = FundSource.GAA
    if target.created_by_students is None:
        target.created_by_students = False
    if target.is_expansion is None:
        target.is_expansion = False
    if target.is_archived is None:
        target.is_archived = False
    if target.is_restoring is None:
        target.is_restoring = False
    if target.s3_storage_class is None:
        target.s3_storage_class = "STANDARD"

    # =========================================================================
    # DYNAMIC MULTI-YEAR QUANTITY AGGREGATION (Handles 1 to N Years Dynamically)
    # =========================================================================
    if target.yearly_quantities and isinstance(target.yearly_quantities, dict):
        total_q = 0
        sorted_years = sorted([
            k for k in target.yearly_quantities.keys() 
            if str(target.yearly_quantities[k]).isdigit() or isinstance(target.yearly_quantities[k], int)
        ])

        for k in sorted_years:
            val = target.yearly_quantities.get(k, 0)
            total_q += int(val) if val is not None else 0

        target.total_qty = total_q
        target.year_1_qty = int(target.yearly_quantities.get(sorted_years[0], 0)) if len(sorted_years) >= 1 else 0
        target.year_2_qty = int(target.yearly_quantities.get(sorted_years[1], 0)) if len(sorted_years) >= 2 else 0
        target.year_3_qty = int(target.yearly_quantities.get(sorted_years[2], 0)) if len(sorted_years) >= 3 else 0
    else:
        target.total_qty = (target.year_1_qty or 0) + (target.year_2_qty or 0) + (target.year_3_qty or 0)
        target.yearly_quantities = {
            "Year 1": target.year_1_qty or 0,
            "Year 2": target.year_2_qty or 0,
            "Year 3": target.year_3_qty or 0
        }

    unit_cost_val = target.unit_cost if target.unit_cost is not None else Decimal("0.00")
    target.total_cost = Decimal(target.total_qty) * unit_cost_val

    item_name_lower = (target.item_name or "").lower()

    # Capitalization & Accounting Classification Rules:
    # 1. Systems created in-house or non-monetary assets are Capital Outlay (ICT Software)
    if target.created_by_students:
        target.expenditure_class = ExpenditureClass.CAPITAL_OUTLAY
        target.uacs_object_code = UacsObjectCode.ICT_SOFTWARE
    elif target.category == ProposalCategory.SUBSCRIPTION:
        target.expenditure_class = ExpenditureClass.MOOE
        target.uacs_object_code = UacsObjectCode.ICT_SOFTWARE_SUBSCRIPTION
    # 2. Training Expenses mandated by DICT Guidelines Page 24
    elif any(k in item_name_lower for k in ["training", "seminar", "workshop"]):
        target.expenditure_class = ExpenditureClass.MOOE
        target.uacs_object_code = UacsObjectCode.ICT_TRAINING
    # 3. Contractor & Consulting services are MOOE under UACS 50211030 00 (DICT Template Page 29)
    elif any(k in item_name_lower for k in ["contractor", "consultant", "consulting"]):
        target.expenditure_class = ExpenditureClass.MOOE
        target.uacs_object_code = UacsObjectCode.ICT_CONSULTING_DEVELOPMENT
    else:
        # 4. DBM Standard: Items >= 50,000.00 are Capital Outlay (CO); items < 50,000.00 are MOOE (Semi-Expendable)
        CAPITALIZATION_THRESHOLD = Decimal("50000.00")

        if unit_cost_val >= CAPITALIZATION_THRESHOLD:
            target.expenditure_class = ExpenditureClass.CAPITAL_OUTLAY
            if "printer" in item_name_lower or "scanner" in item_name_lower or "plotter" in item_name_lower:
                target.uacs_object_code = UacsObjectCode.PRINTING_EQUIPMENT
            elif "software" in item_name_lower:
                target.uacs_object_code = UacsObjectCode.ICT_SOFTWARE
            else:
                target.uacs_object_code = UacsObjectCode.ICT_EQUIPMENT
        else:
            target.expenditure_class = ExpenditureClass.MOOE
            if "printer" in item_name_lower or "scanner" in item_name_lower or "plotter" in item_name_lower:
                target.uacs_object_code = UacsObjectCode.SEMI_EXPENDABLE_PRINTING
            elif "suite" in item_name_lower or "license" in item_name_lower or "subscription" in item_name_lower or "cloud" in item_name_lower:
                target.uacs_object_code = UacsObjectCode.ICT_SOFTWARE_SUBSCRIPTION
            elif "development" in item_name_lower:
                target.uacs_object_code = UacsObjectCode.ICT_CONSULTING_DEVELOPMENT
            else:
                target.uacs_object_code = UacsObjectCode.SEMI_EXPENDABLE_ICT

    target.sync_payload()


@event.listens_for(ExistingInventory, 'before_insert')
@event.listens_for(ExistingInventory, 'before_update')
def sync_inventory_office_location(mapper, connection, target: ExistingInventory):
    if target.office_location is not None:
        loc_val = getattr(target.office_location, "value", str(target.office_location))
        target.is_central_office = (loc_val in [OfficeLocation.CENTRAL_OFFICE.value, "Central Office"])
    elif target.is_central_office:
        target.office_location = OfficeLocation.CENTRAL_OFFICE
    else:
        target.office_location = OfficeLocation.REGIONAL_OFFICE

    if target.dict_category is None:
        item_lower = (target.item_name or "").lower()
        if target.is_software:
            if "antivirus" in item_lower:
                target.dict_category = DictAssetCategory.ANTIVIRUS
            elif "grammar" in item_lower:
                target.dict_category = DictAssetCategory.GRAMMAR_CHECKER
            elif "graphics" in item_lower or "simulation" in item_lower or "cad" in item_lower:
                target.dict_category = DictAssetCategory.GRAPHICS_SIMULATION
            elif "help desk" in item_lower or "helpdesk" in item_lower:
                target.dict_category = DictAssetCategory.IT_HELPDESK
            elif "photo" in item_lower or "video" in item_lower:
                target.dict_category = DictAssetCategory.PHOTO_VIDEO_EDITING
            elif "firewall" in item_lower or "waf" in item_lower:
                target.dict_category = DictAssetCategory.WAF
            elif "office" in item_lower or "productivity" in item_lower:
                target.dict_category = DictAssetCategory.OFFICE_PRODUCTIVITY
            else:
                target.dict_category = DictAssetCategory.OTHERS_SOFTWARE
        else:
            if "switch" in item_lower or "router" in item_lower or "access point" in item_lower:
                target.dict_category = DictAssetCategory.NETWORK_SWITCH
            elif "printer" in item_lower or "scanner" in item_lower or "plotter" in item_lower:
                target.dict_category = DictAssetCategory.PRINTER
            elif "tablet" in item_lower or "ipad" in item_lower:
                target.dict_category = DictAssetCategory.TABLET
            elif "mobile" in item_lower or "phone" in item_lower:
                target.dict_category = DictAssetCategory.MOBILE_PHONE
            elif "laptop" in item_lower or "notebook" in item_lower or "macbook" in item_lower:
                target.dict_category = DictAssetCategory.LAPTOP
            elif "desktop" in item_lower or "pc" in item_lower or "optiplex" in item_lower:
                target.dict_category = DictAssetCategory.DESKTOP
            elif "server" in item_lower or "poweredge" in item_lower or "blade" in item_lower:
                target.dict_category = DictAssetCategory.SERVERS
            else:
                target.dict_category = DictAssetCategory.OTHERS_EQUIPMENT
