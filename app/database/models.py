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
    JSON,  # Dialect-agnostic JSON compiles to JSONB on PostgreSQL / JSON on SQLite
    func,
    event,
    text,
    UniqueConstraint,
)
from sqlalchemy.types import TypeDecorator, CHAR
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
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
    """
    Exception raised specifically when cryptographic decryption fails during 
    the parsing of EncryptedJSON database columns.
    """
    def __init__(self, message: str = "Cryptographic decryption failed. Data corruption or incorrect key detected."):
        self.message = message
        super().__init__(message)


class BusinessRuleViolation(ValueError):
    """
    Exception raised when an action or database update violates an active 
    ISSP business rule, budget ceiling constraint, or compliance policy.
    """
    def __init__(self, message: str):
        self.message = message
        super().__init__(message)


# ==========================================================
# DIALECT-AGNOSTIC GUID COMPILATION DECORATOR
# ==========================================================

class GUID(TypeDecorator):
    """
    Platform-independent GUID implementation.
    Compiles cleanly to PostgreSQL's native UUID, falling back to CHAR(36)
    on SQLite development and testing environments to avoid schema mismatches.
    """
    impl = CHAR(36)
    cache_ok = True

    def load_dialect_impl(self, dialect):
        if dialect.name == "postgresql":
            return dialect.type_descriptor(PG_UUID(as_uuid=True))
        else:
            return dialect.type_descriptor(CHAR(36))

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        if dialect.name == "postgresql":
            return value
        else:
            if isinstance(value, uuid.UUID):
                return str(value)
            return value

    def process_result_value(self, value, dialect):
        if value is None:
            return None
        if isinstance(value, uuid.UUID):
            return value
        return uuid.UUID(value)


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

# Parse individual keys
keys_list = [k.strip() for k in AES_SECRET_KEYS_STR.split(",") if k.strip()]

# Pre-compute active ciphers once at startup to avoid CPU exhaustion
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

# Maintain alias compatibility
legacy_ciphers = active_ciphers


# Size-bounded, thread-safe cache for dynamic ciphers to prevent memory leaks
@lru_cache(maxsize=128)
def get_v2_cipher(key: str, salt: bytes) -> Fernet:
    """
    Derives and returns a Fernet cipher dynamically. 
    Using a bounded LRU cache prevents memory exhaustion from raw unbounded storage.
    """
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
    """
    Stores key-value pairs for dynamic system settings and administrative
    configurations (e.g., global budget ceilings).
    """
    __tablename__ = "system_settings"

    key: Mapped[str] = mapped_column(String(100), primary_key=True)
    value: Mapped[str] = mapped_column(String(255), nullable=False)


# ==========================================================
# CUSTOM ENCRYPTED JSON COLUMN DECORATOR
# ==========================================================

class EncryptedJSON(TypeDecorator):
    """
    Saves and loads dictionaries securely as encrypted JSON text.
    Implements fast v3 encryption utilizing pre-derived keys from the startup pool,
    while maintaining backward compatibility with dynamically-salted v2 structures and v1 sequences.
    """
    impl = Text
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        
        json_str = json.dumps(value)
        
        # Fast encryption using the primary pre-derived cipher
        ciphertext_bytes = active_ciphers[0].encrypt(json_str.encode("utf-8"))
        
        return f"v3${ciphertext_bytes.decode('utf-8')}"

    def process_result_value(self, value, dialect):
        if value is None:
            return None

        # Version 3: Fast pre-derived key static encryption
        if value.startswith("v3$"):
            parts = value.split("$")
            if len(parts) == 2:
                ciphertext = parts[1]
                ciphertext_bytes = ciphertext.encode("utf-8")
                for cipher in active_ciphers:
                    try:
                        decrypted_bytes = cipher.decrypt(ciphertext_bytes)
                        return json.loads(decrypted_bytes.decode("utf-8"))
                    except Exception:
                        continue
            # Ensure v3 decryption errors bypass legacy decryption cascades
            try:
                return json.loads(value)
            except json.JSONDecodeError as e:
                raise DecryptionError("Cryptographic decryption failed for v3 payload.") from e

        # Version 2: Row-level dynamic salting (legacy fallback with caching logic to reduce latency)
        if value.startswith("v2$"):
            try:
                parts = value.split("$")
                if len(parts) == 3:
                    _, salt_b64, ciphertext = parts
                    row_salt = base64.b64decode(salt_b64.encode("utf-8"))
                    ciphertext_bytes = ciphertext.encode("utf-8")
                    
                    for key in keys_list:
                        try:
                            cipher = get_v2_cipher(key, row_salt)
                            decrypted_bytes = cipher.decrypt(ciphertext_bytes)
                            return json.loads(decrypted_bytes.decode("utf-8"))
                        except Exception:
                            continue
            except Exception as e:
                logger.error("Row-level decryption failed under v2 formatting: %s", str(e))
            
            # Ensure v2 decryption errors bypass legacy decryption cascades
            try:
                return json.loads(value)
            except json.JSONDecodeError as e:
                raise DecryptionError("Cryptographic decryption failed for v2 payload.") from e

        # Version 1/Fallback: Legacy static salt execution sequence (only evaluated for non-prefixed values)
        value_bytes = value.encode("utf-8")
        for cipher in active_ciphers:
            try:
                decrypted_bytes = cipher.decrypt(value_bytes)
                return json.loads(decrypted_bytes.decode("utf-8"))
            except Exception:
                continue

        # Safe fallback: attempt to directly parse raw string as JSON if decryption fails
        try:
            return json.loads(value)
        except json.JSONDecodeError as e:
            logger.critical("Decryption completely failed. Block string is not readable JSON.")
            raise DecryptionError(
                "Cryptographic decryption failed. Data corruption or incorrect key detected."
            ) from e


# ==========================================================
# SYSTEM ENUMS
# ==========================================================

class RoleTag(str, enum.Enum):
    ROLE_MIS_ADMIN = "ROLE_MIS_ADMIN"
    ROLE_DEPT_USER = "ROLE_DEPT_USER"


class ProposalStatus(str, enum.Enum):
    DRAFT = "Draft"
    SUBMITTED = "Submitted"
    RETURNED = "Returned"
    APPROVED = "Approved"


class AssetStatus(str, enum.Enum):
    FUNCTIONAL = "Functional"
    NEEDS_REPAIR = "Needs Repair"
    CONDEMNED = "Condemned"


class ScopeChoice(str, enum.Enum):
    DEPARTMENT_WIDE = "Department-Wide"
    CENTRAL_OFFICE_ONLY = "Central Office only"
    WITH_REGIONAL_OFFICES = "With Regional Offices"
    WITH_BUREAUS = "With Bureaus"
    AGENCY_WIDE = "Agency-Wide"


# ==========================================================
# RESTRUCTURED DOCUMENT TREE ENUMS (Gap Restructuring)
# ==========================================================

class NodeType(str, enum.Enum):
    ROOT = "root"
    PART = "part"
    SECTION = "section"
    SUBSECTION = "subsection"
    LEAF = "leaf"


class PageOrientation(str, enum.Enum):
    PORTRAIT = "portrait"
    LANDSCAPE = "landscape"


class ContentType(str, enum.Enum):
    RICH_TEXT = "rich_text"
    KEY_VALUE_TABLE = "key_value_table"
    STAFFING_MATRIX = "staffing_matrix"
    BUDGET_GRID = "budget_grid"


class AssetRole(str, enum.Enum):
    LOGO = "logo"
    INLINE_DIAGRAM = "inline_diagram"
    FULL_PAGE_DIAGRAM = "full_page_diagram"


# ==========================================================
# RESTRUCTURED DOCUMENT TREE MODELS (Gap Restructuring)
# ==========================================================

class IsspNode(Base):
    """
    Self-referencing ordered hierarchical tree to support strict DICT structuring
    and orientation mappings (e.g. Part I -> A -> A.1 -> A.1.1).
    """
    __tablename__ = "issp_nodes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    parent_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("issp_nodes.id", ondelete="CASCADE"), 
        nullable=True,
        index=True
    )
    node_type: Mapped[NodeType] = mapped_column(Enum(NodeType), nullable=False)
    system_key: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    sequence_order: Mapped[Decimal] = mapped_column(Numeric(6, 3), nullable=False)
    page_orientation: Mapped[PageOrientation] = mapped_column(
        Enum(PageOrientation), 
        default=PageOrientation.LANDSCAPE, 
        nullable=False
    )
    force_page_break: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now(), nullable=False)

    # Self-referencing tree relationships
    parent: Mapped[Optional["IsspNode"]] = relationship("IsspNode", back_populates="children", remote_side=[id])
    children: Mapped[List["IsspNode"]] = relationship("IsspNode", back_populates="parent", cascade="all, delete-orphan")

    # Mapped children components
    vocabulary: Mapped[Optional["IsspVocabulary"]] = relationship(
        "IsspVocabulary", 
        back_populates="node", 
        cascade="all, delete-orphan",
        uselist=False
    )
    contents: Mapped[List["IsspContent"]] = relationship("IsspContent", back_populates="node", cascade="all, delete-orphan")
    assets: Mapped[List["IsspAsset"]] = relationship("IsspAsset", back_populates="node", cascade="all, delete-orphan")


class IsspVocabulary(Base):
    """
    Stores aligned DICT displaying headers and titles, avoiding invented words.
    """
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
    """
    Dynamic container to handle rich texts, grids, and tables structurally.
    """
    __tablename__ = "issp_contents"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    node_id: Mapped[int] = mapped_column(
        ForeignKey("issp_nodes.id", ondelete="CASCADE"), 
        nullable=False,
        index=True
    )
    content_type: Mapped[ContentType] = mapped_column(Enum(ContentType), nullable=False)
    json_data: Mapped[Dict[str, Any]] = mapped_column(JSON, nullable=False)

    node: Mapped["IsspNode"] = relationship("IsspNode", back_populates="contents")


class IsspAsset(Base):
    """
    Tracks and registers full page diagrams vs inline icons.
    """
    __tablename__ = "issp_assets"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    node_id: Mapped[int] = mapped_column(
        ForeignKey("issp_nodes.id", ondelete="CASCADE"), 
        nullable=False,
        index=True
    )
    file_path: Mapped[str] = mapped_column(String(255), nullable=False)
    asset_role: Mapped[AssetRole] = mapped_column(Enum(AssetRole), nullable=False)
    custom_title: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    aspect_ratio_preserve: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    node: Mapped["IsspNode"] = relationship("IsspNode", back_populates="assets")


# ==========================================================
# CAMPUS REGISTRIES
# ==========================================================

class Campus(Base):
    """
    SUC Multi-Campus Physical Layout Reference Configuration.
    Allows segmentation of departmental users, planners, headcounts and budgets.
    """
    __tablename__ = "campuses"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    location: Mapped[str] = mapped_column(String(200), nullable=False)
    code: Mapped[str] = mapped_column(String(10), unique=True, nullable=False)

    departments: Mapped[List["Department"]] = relationship("Department", back_populates="campus")
    users: Mapped[List["User"]] = relationship("User", back_populates="campus")
    server_capacities: Mapped[List["ServerCapacityTrack"]] = relationship("ServerCapacityTrack", back_populates="campus", cascade="all, delete-orphan")


# ==========================================================
# SYSTEM DATABASE MODELS
# ==========================================================

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
    
    proposals: Mapped[List["Proposal"]] = relationship(
        "Proposal", 
        back_populates="department", 
        cascade="all, delete-orphan"
    )
    subscription_proposals: Mapped[List["SubscriptionProposal"]] = relationship(
        "SubscriptionProposal", 
        back_populates="department", 
        cascade="all, delete-orphan"
    )
    needs_assessments: Mapped[List["NeedsAssessment"]] = relationship(
        "NeedsAssessment", 
        back_populates="department", 
        cascade="all, delete-orphan"
    )
    
    budget_ceilings: Mapped[List["BudgetCeiling"]] = relationship(
        "BudgetCeiling", 
        back_populates="department", 
        cascade="all, delete-orphan"
    )
    inventory: Mapped[List["ExistingInventory"]] = relationship(
        "ExistingInventory", 
        back_populates="department", 
        cascade="all, delete-orphan"
    )


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    role_tag: Mapped[RoleTag] = mapped_column(Enum(RoleTag), nullable=False)
    
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


class CatalogItem(Base):
    """
    Stores reference list and standard hardware specifications, units, costs, 
    and office capabilities. Includes pre-verified institutional evidence.
    """
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


class ExistingInventory(Base):
    """
    Handles Annex A-5 (Existing Physical Assets Logging).
    Enforces justification logic before dynamic multi-year needs can be proposed.
    """
    __tablename__ = "existing_inventory"

    id: Mapped[uuid.UUID] = mapped_column(GUID, primary_key=True, default=uuid.uuid4)
    department_id: Mapped[int] = mapped_column(
        ForeignKey("departments.id", ondelete="CASCADE"), 
        nullable=False, 
        index=True
    )
    
    item_name: Mapped[str] = mapped_column(String(200), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    status: Mapped[AssetStatus] = mapped_column(Enum(AssetStatus), default=AssetStatus.FUNCTIONAL, nullable=False)
    unserviceable_report_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    
    date_acquired: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    department: Mapped[Department] = relationship("Department", back_populates="inventory")


class Proposal(Base):
    """
    Handles Dynamic Needs Proposals (Annex A-6 / CapEx).
    Provides structured setters to automatically synchronize flat database columns
    with the nested encrypted payload dictionary to prevent state drift.
    """
    __tablename__ = "issp_core"

    id: Mapped[uuid.UUID] = mapped_column(GUID, primary_key=True, default=uuid.uuid4)
    department_id: Mapped[int] = mapped_column(
        ForeignKey("departments.id", ondelete="CASCADE"), 
        nullable=False, 
        index=True
    )
    
    issp_period: Mapped[Optional[str]] = mapped_column(
        String(50), 
        ForeignKey("master_narratives.issp_period", ondelete="SET NULL", onupdate="CASCADE"), 
        nullable=True,
        index=True
    )
    status: Mapped[ProposalStatus] = mapped_column(Enum(ProposalStatus), default=ProposalStatus.DRAFT, nullable=False)
    
    item_name: Mapped[str] = mapped_column(String(200), nullable=False)
    item_key: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    unit_cost: Mapped[Decimal] = mapped_column(Numeric(15, 2), default=Decimal("0.00"), nullable=False)
    
    yearly_quantities: Mapped[Dict[str, int]] = mapped_column(
        MutableDict.as_mutable(JSON), 
        default=dict, 
        nullable=False
    )
    
    total_qty: Mapped[int] = mapped_column(Integer, default=0, nullable=False, index=True)

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

    target_offices_json: Mapped[List[str]] = mapped_column(JSON, default=list, nullable=False)

    s3_storage_class: Mapped[str] = mapped_column(String(50), default="STANDARD", nullable=False)
    is_restoring: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    department: Mapped[Department] = relationship("Department", back_populates="proposals")
    
    master_narrative: Mapped[Optional["MasterNarrative"]] = relationship(
        "MasterNarrative", 
        back_populates="proposals"
    )
    
    deployments_relation: Mapped[List["ProposalDeployment"]] = relationship(
        "ProposalDeployment", 
        back_populates="proposal", 
        cascade="all, delete-orphan"
    )

    audit_logs: Mapped[List["AuditTrail"]] = relationship(
        "AuditTrail", 
        foreign_keys="AuditTrail.proposal_id", 
        back_populates="proposal"
    )

    is_expansion: Mapped[bool] = mapped_column(
        Boolean, 
        default=False, 
        server_default=text("false"), 
        nullable=False
    )

    def sync_payload(self) -> None:
        """
        Forces explicit flat database fields to synchronize into the encrypted JSON
        payload block to preserve absolute state integrity.
        """
        if self.payload is None:
            self.payload = {}
        self.payload["canvas_evidence_url"] = self.canvas_evidence_url
        self.payload["custom_specification"] = self.custom_specification
        self.payload["item_name"] = self.item_name
        self.payload["item_key"] = self.item_key
        self.payload["unit_cost"] = str(self.unit_cost)
        self.payload["project_key"] = self.project_key
        self.payload["is_expansion"] = self.is_expansion


class SubscriptionProposal(Base):
    """
    Handles Annex a-2 / MOOE Software and Cloud Subscriptions.
    Provides structured setters to automatically synchronize flat database columns
    with the nested encrypted payload dictionary to prevent state drift.
    """
    __tablename__ = "subscription_proposals"

    id: Mapped[uuid.UUID] = mapped_column(GUID, primary_key=True, default=uuid.uuid4)
    department_id: Mapped[int] = mapped_column(
        ForeignKey("departments.id", ondelete="CASCADE"), 
        nullable=False, 
        index=True
    )
    
    issp_period: Mapped[Optional[str]] = mapped_column(
        String(50), 
        ForeignKey("master_narratives.issp_period", ondelete="SET NULL", onupdate="CASCADE"), 
        nullable=True,
        index=True
    )
    
    subscription_type: Mapped[str] = mapped_column(String(100), nullable=False)
    software_name: Mapped[str] = mapped_column(String(255), nullable=False)
    justification: Mapped[str] = mapped_column(Text, nullable=False)
    
    yearly_users: Mapped[Dict[str, int]] = mapped_column(
        MutableDict.as_mutable(JSON), 
        default=dict, 
        nullable=False
    )
    
    annual_cost_per_user: Mapped[Decimal] = mapped_column(Numeric(15, 2), default=Decimal("0.00"), nullable=False)
    
    total_multiyear_mooe: Mapped[Decimal] = mapped_column(Numeric(15, 2), default=Decimal("0.00"), nullable=False, index=True)
    
    project_key: Mapped[Optional[str]] = mapped_column(String(100), nullable=True, index=True)

    status: Mapped[ProposalStatus] = mapped_column(Enum(ProposalStatus), default=ProposalStatus.DRAFT, nullable=False)
    is_archived: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    canvas_evidence_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)

    payload: Mapped[Dict[str, Any]] = mapped_column(
        MutableDict.as_mutable(EncryptedJSON),
        default=dict,
        nullable=False
    )

    target_offices_json: Mapped[List[str]] = mapped_column(JSON, default=list, nullable=False)

    s3_storage_class: Mapped[str] = mapped_column(String(50), default="STANDARD", nullable=False)
    is_restoring: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    department: Mapped[Department] = relationship("Department", back_populates="subscription_proposals")
    
    master_narrative: Mapped[Optional["MasterNarrative"]] = relationship(
        "MasterNarrative", 
        back_populates="subscriptions"
    )
    
    audit_logs: Mapped[List["AuditTrail"]] = relationship(
        "AuditTrail", 
        foreign_keys="AuditTrail.subscription_id", 
        back_populates="subscription"
    )

    is_expansion: Mapped[bool] = mapped_column(
        Boolean, 
        default=False, 
        server_default=text("false"), 
        nullable=False
    )

    def sync_payload(self) -> None:
        """
        Forces software subscription inputs to synchronize into the encrypted JSON
        payload block to preserve absolute state integrity.
        """
        if self.payload is None:
            self.payload = {}
        self.payload["canvas_evidence_url"] = self.canvas_evidence_url
        self.payload["software_name"] = self.software_name
        self.payload["justification"] = self.justification
        self.payload["subscription_type"] = self.subscription_type
        self.payload["annual_cost_per_user"] = str(self.annual_cost_per_user)
        self.payload["project_key"] = self.project_key
        self.payload["is_expansion"] = self.is_expansion


# ==========================================================
# DEPLOYMENT ALLOCATIONS MATRIX
# ==========================================================

class ProposalDeployment(Base):
    """
    Table IV.A: Equipment Deployment Allocation Mapping.
    Relational lookup matching exact item quantities directly to individual SUC office units.
    """
    __tablename__ = "proposal_deployments"

    id: Mapped[uuid.UUID] = mapped_column(GUID, primary_key=True, default=uuid.uuid4)
    proposal_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("issp_core.id", ondelete="CASCADE"), 
        nullable=False, 
        index=True
    )
    office_name: Mapped[str] = mapped_column(String(150), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, default=1, nullable=False)

    proposal: Mapped[Proposal] = relationship("Proposal", back_populates="deployments_relation")


class NeedsAssessment(Base):
    """
    Maps department justification criteria aligned to Major Final Outputs (MFO).
    """
    __tablename__ = "needs_assessments"

    id: Mapped[uuid.UUID] = mapped_column(GUID, primary_key=True, default=uuid.uuid4)
    department_id: Mapped[int] = mapped_column(
        ForeignKey("departments.id", ondelete="CASCADE"), 
        nullable=False, 
        index=True
    )
    
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    mfo_alignment: Mapped[str] = mapped_column(String(255), nullable=False)
    current_problem: Mapped[str] = mapped_column(Text, nullable=False)
    proposed_solution: Mapped[str] = mapped_column(Text, nullable=False)
    expected_impacts: Mapped[List[str]] = mapped_column(JSON, default=list, nullable=False)
    other_impact: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_archived: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    department: Mapped[Department] = relationship("Department", back_populates="needs_assessments")


class BudgetCeiling(Base):
    """
    Implements administrative departmental sub-ceiling structures
    to prevent budget race conditions across departments.
    """
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
    
    issp_period: Mapped[Optional[str]] = mapped_column(
        String(50),
        ForeignKey("master_narratives.issp_period", ondelete="SET NULL", onupdate="CASCADE"),
        default="2026-2028",
        nullable=True,
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
        Calculates CapEx first, then subtracts it from the consolidated sub-ceiling
        value to determine MOOE, avoiding independent quantization rounding/precision loss.
        """
        if value is None:
            value = Decimal("0.00")
        elif not isinstance(value, Decimal):
            value = Decimal(str(value))
        quantized_total = value.quantize(Decimal("1.00"))
        self.allocated_capex = (quantized_total * Decimal("0.70")).quantize(Decimal("1.00"))
        self.allocated_mooe = quantized_total - self.allocated_capex

    @sub_ceiling.expression
    def sub_ceiling(cls):
        return cls.allocated_capex + cls.allocated_mooe


class AuditTrail(Base):
    """
    Provides immutable system auditing required for COA policy adherence.
    Ensures log history is preserved securely when target users or items are deleted.
    """
    __tablename__ = "audit_trails"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    proposal_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("issp_core.id", ondelete="SET NULL"), 
        nullable=True
    )
    subscription_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("subscription_proposals.id", ondelete="SET NULL"), 
        nullable=True
    )
    action: Mapped[str] = mapped_column(String(100), nullable=False)
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

    proposal: Mapped[Optional[Proposal]] = relationship("Proposal", foreign_keys=[proposal_id], back_populates="audit_logs")
    subscription: Mapped[Optional[SubscriptionProposal]] = relationship("SubscriptionProposal", foreign_keys=[subscription_id], back_populates="audit_logs")
    user: Mapped[Optional[User]] = relationship("User")


# ==========================================================
# DICT ANNEX A-4 STRUCTURAL ADDITIONS
# ==========================================================

class DegreeOffering(Base):
    """
    DICT Annex A-4: Dynamic collection of graduate and undergraduate degree offerings.
    """
    __tablename__ = "degree_offerings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    department_name: Mapped[str] = mapped_column(String(150), nullable=False)
    degree_name: Mapped[str] = mapped_column(String(150), nullable=False)
    level: Mapped[str] = mapped_column(String(50), nullable=False)
    accreditation_status: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)


class GaaPerformance(Base):
    """
    DICT Annex A-4: GAA institutional target performance indicators.
    """
    __tablename__ = "gaa_performance"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    indicator_name: Mapped[str] = mapped_column(String(250), nullable=False)
    target_value: Mapped[str] = mapped_column(String(100), nullable=False)


# ==========================================================
# DICT GLOSSARY & INSTRUCTIONS REGISTRY
# ==========================================================

class GlossaryTerm(Base):
    """
    Dynamic dictionary containing vocabulary definitions (Pages 6-10 compliance framework).
    """
    __tablename__ = "glossary_terms"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    term: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    definition: Mapped[str] = mapped_column(Text, nullable=False)
    order_index: Mapped[int] = mapped_column(Integer, default=0, nullable=False)


class GeneralInstruction(Base):
    """
    General Submission Guidelines Configuration (Page 11 compliance framework).
    """
    __tablename__ = "general_instructions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    step_number: Mapped[int] = mapped_column(Integer, unique=True, nullable=False)
    instruction_text: Mapped[str] = mapped_column(Text, nullable=False)


# ==========================================================
# DICT MITHI INVENTORIES & OS REGISTRIES
# ==========================================================

class ServerCapacityTrack(Base):
    """
    Section 1.3 server hosting storage profile census tracking capacity allocations.
    """
    __tablename__ = "server_capacity_tracking"

    id: Mapped[uuid.UUID] = mapped_column(GUID, primary_key=True, default=uuid.uuid4)
    campus_id: Mapped[int] = mapped_column(ForeignKey("campuses.id", ondelete="CASCADE"), nullable=False, index=True)
    capacity_tier: Mapped[str] = mapped_column(String(50), nullable=False)
    location: Mapped[str] = mapped_column(String(50), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, default=1, nullable=False)

    campus: Mapped[Campus] = relationship("Campus", back_populates="server_capacities")


class ClientOsCensus(Base):
    """
    Section 2.1 client operating systems licenses tracking.
    """
    __tablename__ = "client_os_census"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    os_name: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    workstations_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    servers_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)


class OfficeSoftwareCensus(Base):
    """
    Section 2.2 office productivity automation licenses tracking.
    """
    __tablename__ = "office_software_census"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    software_name: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    license_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)


# ==========================================================
# PART IV.B RELATIONAL STAFFING SYSTEM (Staff Registry)
# ==========================================================

class IctStaffPosition(Base):
    """
    Part IV.B: Relational mapping for the SUC ICT Organizational structure.
    Tracks active staffing positions, classifications (Permanent, Casual, Contractual),
    and headcounts to fulfill compliance reporting requirements.
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
# CORE REGISTRIES & COLLABORATIVE MATRIX
# ==========================================================

class StrategicConcern(Base):
    """
    Table I.E: Relational Strategic Concerns KRA/MFO mapping directory.
    """
    __tablename__ = "strategic_concerns"

    id: Mapped[uuid.UUID] = mapped_column(GUID, primary_key=True, default=uuid.uuid4)
    issp_period: Mapped[str] = mapped_column(
        ForeignKey("master_narratives.issp_period", onupdate="CASCADE", ondelete="CASCADE"), 
        nullable=False,
        index=True
    )
    mfo: Mapped[str] = mapped_column(String(255), nullable=False)
    critical_system: Mapped[str] = mapped_column(String(255), nullable=False)
    problems: Mapped[str] = mapped_column(Text, nullable=False)
    intended_use: Mapped[str] = mapped_column(Text, nullable=False)
    order_index: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    master_narrative: Mapped["MasterNarrative"] = relationship("MasterNarrative", back_populates="strategic_concerns_relation")


class CoreOfficeFunction(Base):
    """
    Annex A-3: Physical directory detailing authorized organizational functions of the SUC offices.
    """
    __tablename__ = "core_office_functions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    issp_period: Mapped[str] = mapped_column(
        ForeignKey("master_narratives.issp_period", onupdate="CASCADE", ondelete="CASCADE"), 
        nullable=False,
        index=True
    )
    office_name: Mapped[str] = mapped_column(String(150), nullable=False)
    division: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)

    master_narrative: Mapped["MasterNarrative"] = relationship("MasterNarrative", back_populates="office_functions_relation")


class CrossAgencyProject(Base):
    """
    Part III.B: Joint cross-government cooperative systems initiatives.
    """
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


class PerformanceMetric(Base):
    """
    Part III.C: Performance Measurement Framework (PMF) milestones and verification indices.
    """
    __tablename__ = "performance_metrics"

    id: Mapped[uuid.UUID] = mapped_column(GUID, primary_key=True, default=uuid.uuid4)
    issp_period: Mapped[str] = mapped_column(
        ForeignKey("master_narratives.issp_period", onupdate="CASCADE", ondelete="CASCADE"), 
        nullable=False,
        index=True
    )
    project_title: Mapped[str] = mapped_column(String(200), nullable=False)
    result_hierarchy: Mapped[str] = mapped_column(String(100), nullable=False)
    indicator: Mapped[str] = mapped_column(Text, nullable=False)
    baseline: Mapped[str] = mapped_column(String(200), nullable=False)
    target: Mapped[str] = mapped_column(String(200), nullable=False)
    collection_method: Mapped[str] = mapped_column(String(200), nullable=False)
    responsibility: Mapped[str] = mapped_column(String(150), nullable=False)

    master_narrative: Mapped["MasterNarrative"] = relationship("MasterNarrative", back_populates="performance_metrics_relation")


class AnnualCostBreakdown(Base):
    """
    Part V.D / Annex A-5: Standard cost allocation matrix details for SUC CapEx, MOOE and Continuing programs.
    """
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
# MASTER NARRATIVE ARCHITECTURE
# ==========================================================

class MasterNarrative(Base):
    """
    Central database table storing all MIS Admin authored narratives, 
    diagram associations, matrices, and dynamic template layout parameters.
    """
    __tablename__ = "master_narratives"

    issp_period: Mapped[str] = mapped_column(String(50), primary_key=True)
    agency_name: Mapped[str] = mapped_column(
        String(255), 
        default="Camarines Sur Polytechnic Colleges", 
        nullable=False
    )
    issp_period_from: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    issp_period_to: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    agency_website_url: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    scope_choice: Mapped[Optional[ScopeChoice]] = mapped_column(Enum(ScopeChoice), nullable=True)
    scope_json: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSON, default=dict, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    agency_logo_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    cert_logo_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)

    transmittal_recipient: Mapped[Optional[str]] = mapped_column(
        String(255), 
        default="ATTY. IVAN JOHN E. UY", 
        nullable=True
    )
    transmittal_recipient_title: Mapped[Optional[str]] = mapped_column(
        String(255), 
        default="Secretary", 
        nullable=True
    )
    transmittal_recipient_agency: Mapped[Optional[str]] = mapped_column(
        String(255), 
        default="Department of Information and Communications Technology", 
        nullable=True
    )
    transmittal_recipient_address: Mapped[Optional[str]] = mapped_column(
        Text, 
        default="DICT Bldg., C.P. Garcia Avenue, Diliman, Quezon City", 
        nullable=True
    )
    transmittal_date: Mapped[Optional[str]] = mapped_column(
        String(50), 
        default="22 February 2023", 
        nullable=True
    )

    signatory_prepared_by: Mapped[str] = mapped_column(String(200), nullable=False)
    preparer_position: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    preparer_tel: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    preparer_fax: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    preparer_email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    signatory_approved_by: Mapped[str] = mapped_column(String(200), nullable=False)

    mandate_html: Mapped[str] = mapped_column(Text, default="", nullable=False)
    vision_html: Mapped[str] = mapped_column(Text, default="", nullable=False)
    mission_html: Mapped[str] = mapped_column(Text, default="", nullable=False)
    present_situation_html: Mapped[str] = mapped_column(Text, default="", nullable=False)

    planners_json: Mapped[List[Dict[str, Any]]] = mapped_column(JSON, default=list, nullable=False)
    manpower_json: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSON, default=dict, nullable=True)
    annual_ict_budget: Mapped[Decimal] = mapped_column(Numeric(15, 2), default=Decimal("0.00"), nullable=False)
    org_chart_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)

    major_final_outputs: Mapped[List[Dict[str, Any]]] = mapped_column(JSON, default=list, nullable=False)
    core_offices_json: Mapped[List[Dict[str, Any]]] = mapped_column(JSON, default=list, nullable=False)
    strategic_concerns_json: Mapped[List[Dict[str, Any]]] = mapped_column(JSON, default=list, nullable=False)

    conceptual_framework_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    network_layout_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    systems_json: Mapped[List[Dict[str, Any]]] = mapped_column(JSON, default=list, nullable=False)
    databases_json: Mapped[List[Dict[str, Any]]] = mapped_column(JSON, default=list, nullable=False)

    internal_projects_json: Mapped[List[Dict[str, Any]]] = mapped_column(JSON, default=list, nullable=False)
    cross_projects_json: Mapped[List[Dict[str, Any]]] = mapped_column(JSON, default=list, nullable=False)
    pmf_matrix_json: Mapped[List[Dict[str, Any]]] = mapped_column(JSON, default=list, nullable=False)

    existing_ict_org_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    proposed_ict_org_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    placement_ict_org_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)

    mithi_network_profile: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSON, default=dict, nullable=True)
    mithi_special_solutions: Mapped[List[Dict[str, Any]]] = mapped_column(JSON, default=list, nullable=False)
    mithi_data_center: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSON, default=dict, nullable=True)
    mithi_hardware_inventory: Mapped[List[Dict[str, Any]]] = mapped_column(JSON, default=list, nullable=False)
    
    mithi_security_dr: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSON, default=dict, nullable=True)
    mithi_data_archiving: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSON, default=dict, nullable=True)
    mithi_ict_issues: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSON, default=dict, nullable=True)

    implementation_schedules: Mapped[List[Dict[str, Any]]] = mapped_column(JSON, default=list, nullable=False)
    functional_interface_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    
    site_development_plan_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    fiber_backbone_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    system_architecture_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    network_topology_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    process_flow_diagram_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)

    proposals: Mapped[List[Proposal]] = relationship(
        "Proposal", 
        back_populates="master_narrative",
        cascade="save-update, merge",
        passive_deletes=True
    )
    subscriptions: Mapped[List[SubscriptionProposal]] = relationship(
        "SubscriptionProposal", 
        back_populates="master_narrative",
        cascade="save-update, merge",
        passive_deletes=True
    )
    
    strategic_concerns_relation: Mapped[List[StrategicConcern]] = relationship(
        "StrategicConcern", 
        back_populates="master_narrative", 
        cascade="all, delete-orphan",
        passive_deletes=True
    )

    office_functions_relation: Mapped[List[CoreOfficeFunction]] = relationship(
        "CoreOfficeFunction", 
        back_populates="master_narrative", 
        cascade="all, delete-orphan",
        passive_deletes=True
    )

    cross_projects_relation: Mapped[List[CrossAgencyProject]] = relationship(
        "CrossAgencyProject", 
        back_populates="master_narrative", 
        cascade="all, delete-orphan",
        passive_deletes=True
    )

    performance_metrics_relation: Mapped[List[PerformanceMetric]] = relationship(
        "PerformanceMetric", 
        back_populates="master_narrative", 
        cascade="all, delete-orphan",
        passive_deletes=True
    )

    annual_costs_relation: Mapped[List[AnnualCostBreakdown]] = relationship(
        "AnnualCostBreakdown", 
        back_populates="master_narrative", 
        cascade="all, delete-orphan",
        passive_deletes=True
    )

    staff_positions_relation: Mapped[List[IctStaffPosition]] = relationship(
        "IctStaffPosition",
        back_populates="master_narrative",
        cascade="all, delete-orphan",
        passive_deletes=True
    )


# ==========================================================
# AUTOMATED PAYLOAD SYNCHRONIZATION EVENT LISTENERS
# ==========================================================

@event.listens_for(Proposal, 'before_insert')
@event.listens_for(Proposal, 'before_update')
def receive_before_save(mapper, connection, target):
    if target.yearly_quantities:
        target.total_qty = sum(int(qty) for qty in target.yearly_quantities.values() if qty is not None)
    else:
        target.total_qty = 0
    target.sync_payload()


@event.listens_for(SubscriptionProposal, 'before_insert')
@event.listens_for(SubscriptionProposal, 'before_update')
def receive_subscription_before_save(mapper, connection, target):
    if target.yearly_users and target.annual_cost_per_user:
        accumulated_mooe = Decimal("0.00")
        for year, users in target.yearly_users.items():
            if users is not None:
                accumulated_mooe += Decimal(str(users)) * target.annual_cost_per_user
        target.total_multiyear_mooe = accumulated_mooe
    else:
        target.total_multiyear_mooe = Decimal("0.00")
    target.sync_payload()


@event.listens_for(ExistingInventory, 'before_insert')
@event.listens_for(ExistingInventory, 'before_update')
def validate_inventory_state(mapper, connection, target):
    if target.status in [AssetStatus.CONDEMNED, AssetStatus.NEEDS_REPAIR]:
        if not target.unserviceable_report_url or not target.unserviceable_report_url.strip():
            raise BusinessRuleViolation(
                "An Unserviceable Report PDF URL is mandatory for Condemned or Needs Repair items."
            )