# app/schemas.py
import uuid
import html
import json
import enum
from datetime import datetime, timezone
from decimal import Decimal
from typing import Literal, Optional, List, Dict, Any, Union
from pydantic import BaseModel, Field, EmailStr, field_validator, model_validator, ConfigDict

from app.config import settings

# Import canonical enums from database models for backwards compatibility and fallback options
from app.database.models import (
    RoleTag, 
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
    ScopeChoice
)

# DICT Annex 1 Standard Inventory Classification Catalog fallback
try:
    from app.database.models import DictAssetCategory
except ImportError:
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
# SANITIZATION & DESERIALIZATION UTILITIES
# ==========================================================

def sanitize_text(v: Optional[str]) -> Optional[str]:
    if v is not None:
        return html.escape(v.strip())
    return v

def clean_optional_string(v: Any) -> Optional[str]:
    """Coerces empty strings, whitespace, or string representations of null into None."""
    if v is None:
        return None
    s = str(v).strip()
    if not s or s.lower() in ("none", "null", "undefined", ""):
        return None
    return s

def deserialize_json_if_string(v: Any) -> Any:
    if isinstance(v, str):
        v_clean = v.strip()
        if (v_clean.startswith("{") and v_clean.endswith("}")) or (v_clean.startswith("[") and v_clean.endswith("]")):
            try:
                return json.loads(v_clean)
            except Exception:
                pass
    return v

def deserialize_list_if_string(v: Any) -> List[Any]:
    if v is None:
        return []
    res = deserialize_json_if_string(v)
    return res if isinstance(res, list) else []

def deserialize_dict_if_string(v: Any) -> Dict[Any, Any]:
    if v is None:
        return {}
    res = deserialize_json_if_string(v)
    return res if isinstance(res, dict) else {}

def coerce_optional_uuid(v: Any) -> Optional[Union[uuid.UUID, str]]:
    """Safely converts empty strings, string UUIDs, or None to Optional[uuid.UUID] or string."""
    if v is None:
        return None
    if isinstance(v, uuid.UUID):
        return v
    if isinstance(v, str):
        v_clean = v.strip()
        if not v_clean or v_clean.lower() in ("none", "null", "undefined", ""):
            return None
        try:
            return uuid.UUID(v_clean)
        except (ValueError, AttributeError):
            return v_clean
    return v

def coerce_enum(enum_cls: Any, v: Any) -> Any:
    """Bi-directional, case-insensitive enum coercion with string fallback."""
    if v is None:
        return None
    if isinstance(v, enum_cls):
        return v
    v_str = str(getattr(v, "value", v)).strip()
    if not v_str or v_str.lower() in ("none", "null", "undefined", ""):
        return None

    for member in enum_cls:
        if member.value == v_str or member.name == v_str:
            return member

    v_lower = v_str.lower()
    for member in enum_cls:
        if member.value.lower() == v_lower or member.name.lower() == v_lower:
            return member

    v_normalized = v_lower.replace(" ", "_").replace("-", "_")
    for member in enum_cls:
        if member.name.lower() == v_normalized:
            return member

    try:
        return enum_cls(v_str)
    except Exception:
        for member in enum_cls:
            if v_lower in member.value.lower() or member.name.lower() in v_lower:
                return member
        return v_str


# ==========================================================
# 1. AUTHENTICATION & SESSION SCHEMAS
# ==========================================================

class TokenResponse(BaseModel):
    access_token: str
    token_type: str
    role: str
    department_id: Optional[int] = None
    model_config = ConfigDict(from_attributes=True)


# ==========================================================
# 2. BASE PRICE CATALOG & SPECIFICATIONS
# ==========================================================

class CatalogItemSchema(BaseModel):
    item_key: str = Field(..., example="pc_standard")
    display_name: str = Field(..., example="Standard Office Desktop PC")
    standard_unit_cost: Decimal = Field(..., ge=0, le=100_000_000)
    category: str = Field(..., example="computing_devices")
    canvas_evidence_url: Optional[str] = None
    supplier_name: Optional[str] = None


class CatalogItemCreate(BaseModel):
    item_key: str = Field(..., example="pc_standard")
    display_name: str = Field(..., example="Standard Office Desktop PC")
    standard_unit_cost: Decimal = Field(..., ge=0, le=100_000_000)
    category: str = Field(..., example="computing_devices")
    is_active: bool = Field(True)
    allowed_offices: List[str] = Field(default=[])
    canvas_evidence_url: Optional[str] = None
    supplier_name: Optional[str] = None
    canvas_expiration_date: Optional[datetime] = None

    @field_validator('item_key')
    @classmethod
    def reject_reserved_other_key(cls, v: str) -> str:
        if v.strip().lower() == "other":
            raise ValueError("The item key 'other' is a reserved system namespace for custom requests.")
        return v


class CatalogItemUpdate(BaseModel):
    item_key: Optional[str] = None
    display_name: Optional[str] = None
    standard_unit_cost: Optional[Decimal] = Field(None, ge=0, le=100_000_000)
    category: Optional[str] = None
    is_active: Optional[bool] = None
    allowed_offices: Optional[List[str]] = None
    canvas_evidence_url: Optional[str] = None
    supplier_name: Optional[str] = None
    canvas_expiration_date: Optional[datetime] = None


class CatalogItemResponse(CatalogItemSchema):
    id: Union[uuid.UUID, str]
    is_active: bool
    allowed_offices: List[str]
    canvas_expiration_date: Optional[datetime] = None

    @field_validator('id', mode='before')
    @classmethod
    def coerce_id(cls, v: Any) -> Any:
        return coerce_optional_uuid(v)

    @field_validator('allowed_offices', mode='before')
    @classmethod
    def deserialize_fields(cls, v: Any) -> Any:
        return deserialize_list_if_string(v)

    model_config = ConfigDict(from_attributes=True)


# ==========================================================
# 3. MASTER ICT INVENTORY (Annex 1 Managed by Supply User)
# ==========================================================

class SupplyInventoryCreate(BaseModel):
    department_id: int = Field(..., description="Target Department / Office ID")
    issp_period: Optional[str] = Field(default=None, description="Active ISSP planning period snapshot")
    replacement_proposal_id: Optional[Union[uuid.UUID, str]] = Field(default=None, description="Linked proposal that consumed this unit")
    item_name: str = Field(..., max_length=200, description="Name of Unit / ICT Resource Description")
    dict_category: Optional[Union[DictAssetCategory, str]] = Field(
        default=None, 
        description="Official DICT Annex 1 Standard Category (e.g. Desktop, Laptop, Servers, WAF)"
    )
    other_category_name: Optional[str] = Field(
        default=None, 
        max_length=200, 
        description="Specified asset category details if 'Others' is selected"
    )
    specs: Optional[str] = Field(None, description="Hardware Specifications")
    exact_model: Optional[str] = Field(None, max_length=200, description="Exact Brand and Model")
    quantity: int = Field(1, ge=1, description="Physical Unit Count")
    status: Union[AssetStatus, str] = Field(default="Functional", description="Operational Condition")
    date_acquired: datetime = Field(default_factory=datetime.utcnow, description="Date Acquired")
    acquired_price: Decimal = Field(default=Decimal("0.00"), ge=0, description="Historical Acquisition Price (PHP)")
    office_location: Union[OfficeLocation, str] = Field(default="Central Office")
    is_central_office: bool = Field(default=True)
    is_end_of_life: bool = Field(default=False)
    is_backup: bool = Field(default=False)
    is_software: bool = Field(default=False)
    is_perpetual: bool = Field(default=True)
    unserviceable_report_url: Optional[str] = None

    @field_validator('dict_category', mode='before')
    @classmethod
    def coerce_dict_category(cls, v: Any) -> Any:
        return coerce_enum(DictAssetCategory, v)

    @field_validator('status', mode='before')
    @classmethod
    def coerce_status(cls, v: Any) -> Any:
        return str(getattr(v, 'value', v) or "Functional")

    @field_validator('office_location', mode='before')
    @classmethod
    def coerce_location(cls, v: Any) -> Any:
        return str(getattr(v, 'value', v) or "Central Office")

    @field_validator('replacement_proposal_id', mode='before')
    @classmethod
    def coerce_replacement_id(cls, v: Any) -> Any:
        return coerce_optional_uuid(v)

    @field_validator('item_name', 'specs', 'exact_model', 'other_category_name', mode='before')
    @classmethod
    def sanitize_inventory_fields(cls, v: Optional[str]) -> Optional[str]:
        return sanitize_text(v)


class SupplyInventoryResponse(SupplyInventoryCreate):
    id: Union[uuid.UUID, str]

    @field_validator('id', mode='before')
    @classmethod
    def coerce_id(cls, v: Any) -> Any:
        return coerce_optional_uuid(v)

    model_config = ConfigDict(from_attributes=True)


# ==========================================================
# 4. PART I: STRATEGIC CONTEXT & OUTCOMES
# ==========================================================

class OrganizationalOutcomeCreate(BaseModel):
    type_label: str = Field(default="Organizational Outcome", example="Organizational Outcome")
    outcome_name: str = Field(..., max_length=255, example="Citizen Frontline Public Services Program")
    description: Optional[str] = Field(None, example="Quality frontline public service delivery and administrative operations.")


class OrganizationalOutcomeUpdate(BaseModel):
    type_label: Optional[str] = None
    outcome_name: Optional[str] = None
    description: Optional[str] = None


class OrganizationalOutcomeResponse(BaseModel):
    id: int
    issp_period: str
    type_label: str
    outcome_name: str
    program_name: Optional[str] = None
    description: Optional[str] = None

    @model_validator(mode='after')
    def populate_aliases(self) -> 'OrganizationalOutcomeResponse':
        if not self.program_name and self.outcome_name:
            self.program_name = self.outcome_name
        elif not self.outcome_name and self.program_name:
            self.outcome_name = self.program_name
        return self

    model_config = ConfigDict(from_attributes=True)


class HumanCapitalCreate(BaseModel):
    is_proposed: bool = Field(default=False, description="False for Part I.B.2 Current, True for Part III.C Proposed")
    employment_status: str = Field(..., example="Plantilla (Filled)")
    it_positions_count: int = Field(0, ge=0)
    non_it_positions_count: int = Field(0, ge=0)
    male_count: int = Field(0, ge=0)
    female_count: int = Field(0, ge=0)


class HumanCapitalResponse(HumanCapitalCreate):
    id: int
    issp_period: str
    model_config = ConfigDict(from_attributes=True)


class StakeholderAnalysisCreate(BaseModel):
    stakeholder_group: str = Field(..., example="General Public / Citizens")
    transaction_processed_incoming: Optional[str] = Field(None, example="Online Applications, Inquiries, and Filings")
    complexity_incoming: str = Field(default="Simple", example="Simple to Complex")
    transaction_processed_outgoing: Optional[str] = Field(None, example="Permits, Clearances, Certificates, and Statements")
    complexity_outgoing: str = Field(default="Simple", example="Simple to Highly Technical")

    @field_validator('complexity_incoming', 'complexity_outgoing', mode='before')
    @classmethod
    def coerce_complexity_strings(cls, v: Any) -> str:
        if v is None:
            return "Simple"
        if hasattr(v, "value"):
            return str(v.value)
        return str(v).strip()


class StakeholderAnalysisUpdate(BaseModel):
    stakeholder_group: Optional[str] = None
    transaction_processed_incoming: Optional[str] = None
    complexity_incoming: Optional[str] = None
    transaction_processed_outgoing: Optional[str] = None
    complexity_outgoing: Optional[str] = None

    @field_validator('complexity_incoming', 'complexity_outgoing', mode='before')
    @classmethod
    def coerce_complexity_strings(cls, v: Any) -> Optional[str]:
        if v is None:
            return None
        if hasattr(v, "value"):
            return str(v.value)
        return str(v).strip()


class StakeholderAnalysisResponse(BaseModel):
    id: int
    issp_period: str
    stakeholder_group: str
    transaction_processed_incoming: Optional[str] = None
    transaction_processed_outgoing: Optional[str] = None
    complexity_incoming: str
    complexity_outgoing: str
    incoming_complexity: Optional[str] = None
    outgoing_complexity: Optional[str] = None

    @model_validator(mode='after')
    def populate_aliases(self) -> 'StakeholderAnalysisResponse':
        self.incoming_complexity = self.complexity_incoming
        self.outgoing_complexity = self.complexity_outgoing
        return self

    model_config = ConfigDict(from_attributes=True)


# ==========================================================
# 5. PART II: CURRENT ICT ASSESSMENT & STRATEGIC CONCERNS
# ==========================================================

class StrategicConcernCreate(BaseModel):
    outcome_id: Optional[int] = None
    mfo: str = Field(..., example="Citizen Frontline Public Services Program")
    critical_system: str = Field(..., example="Citizen Frontline Registry and Electronic Payment System")
    problems: str = Field(..., example="High transaction latency and legacy manual verification delays.")
    intended_use: str = Field(..., example="Deploy containerized microservices and automated digital payment integration.")
    order_index: int = Field(default=0)


class StrategicConcernResponse(StrategicConcernCreate):
    id: Union[uuid.UUID, str]
    issp_period: str

    @field_validator('id', mode='before')
    @classmethod
    def coerce_id(cls, v: Any) -> Any:
        return coerce_optional_uuid(v)

    model_config = ConfigDict(from_attributes=True)


class NetworkInfrastructureCreate(BaseModel):
    is_proposed: bool = Field(default=False, description="False for Part II.B.1 Existing, True for Part III.A.1 Proposed")
    topology_description: str = Field(...)
    connectivity_type: str = Field(..., example="Dedicated Leased Line Fiber Optic")
    bandwidth_mbps: int = Field(default=0, ge=0)
    upload_speed_mbps: Optional[int] = Field(None, ge=0)
    download_speed_mbps: Optional[int] = Field(None, ge=0)
    office_location: Optional[str] = Field(default="Central Office", example="Central Office")
    is_ipv6_ready: bool = Field(default=False)
    diagram_url: Optional[str] = None


class NetworkInfrastructureResponse(NetworkInfrastructureCreate):
    id: int
    issp_period: str
    model_config = ConfigDict(from_attributes=True)


class CybersecurityControlCreate(BaseModel):
    is_proposed: bool = Field(default=False, description="False for Part II.B.2 Existing, True for Part III.A.2 Proposed")
    control_domain: str = Field(..., example="Perimeter Security")
    control_name: str = Field(..., example="Web Application Firewalls (WAFs)")
    is_mandatory: bool = Field(default=True)
    is_implemented: bool = Field(default=False)


class CybersecurityControlResponse(CybersecurityControlCreate):
    id: int
    issp_period: str
    model_config = ConfigDict(from_attributes=True)


class EGovernmentChecklistCreate(BaseModel):
    program_name: str = Field(..., example="2. GOVERNMENT DIGITAL PAYMENT SYSTEM FOR COLLECTION AND DISBURSEMENT")
    is_utilized: bool = Field(default=False)
    url_or_system_name: Optional[str] = None
    equivalent_system_details: Optional[str] = None
    equivalent_system_name: Optional[str] = Field(default=None, description="Name of equivalent in-house or outsourced system")
    equivalent_system_url: Optional[str] = Field(default=None, description="Portal address of equivalent system")
    has_other_payment_platform: bool = Field(default=False, description="Using other digital or electronic payment platform")
    is_manual: bool = Field(default=False, description="Manual processing / transaction in place")
    is_proposed_development: bool = Field(default=False, description="Proposed development of equivalent system")
    proposed_development_name: Optional[str] = Field(default=None, description="Name or details of proposed equivalent system")
    total_employees: Optional[str] = Field(default=None, description="Total number of agency employees")
    active_pnpki_count: Optional[str] = Field(default=None, description="Total employees with active PNPKI certificates")
    is_proposed_equivalent: Optional[bool] = Field(default=False, description="Alias for is_proposed_development")
    adoption_ratio: Optional[str] = Field(None, example="50% of eligible employees with active PNPKI certificates")
    channels_json: Optional[List[str]] = Field(default_factory=list, example=["Website", "Email", "Mobile", "Landline", "Social Media"])
    is_connected_to_portal: bool = Field(default=False)

    @field_validator('channels_json', mode='before')
    @classmethod
    def deserialize_channels(cls, v: Any) -> List[str]:
        return deserialize_list_if_string(v)

    @model_validator(mode='after')
    def sync_proposal_flags(self) -> 'EGovernmentChecklistCreate':
        if self.is_proposed_equivalent and not self.is_proposed_development:
            self.is_proposed_development = self.is_proposed_equivalent
        return self


class EGovernmentChecklistUpdate(BaseModel):
    program_name: Optional[str] = None
    is_utilized: Optional[bool] = None
    url_or_system_name: Optional[str] = None
    equivalent_system_details: Optional[str] = None
    equivalent_system_name: Optional[str] = None
    equivalent_system_url: Optional[str] = None
    has_other_payment_platform: Optional[bool] = None
    is_manual: Optional[bool] = None
    is_proposed_development: Optional[bool] = None
    is_proposed_equivalent: Optional[bool] = Field(default=None, description="Alias for is_proposed_development")
    proposed_development_name: Optional[str] = None
    total_employees: Optional[str] = None
    active_pnpki_count: Optional[str] = None
    adoption_ratio: Optional[str] = None
    channels_json: Optional[List[str]] = None
    is_connected_to_portal: Optional[bool] = None

    @field_validator('channels_json', mode='before')
    @classmethod
    def deserialize_channels(cls, v: Any) -> Optional[List[str]]:
        if v is None:
            return None
        return deserialize_list_if_string(v)

    @model_validator(mode='after')
    def sync_proposal_flags(self) -> 'EGovernmentChecklistUpdate':
        if self.is_proposed_equivalent is not None and self.is_proposed_development is None:
            self.is_proposed_development = self.is_proposed_equivalent
        elif self.is_proposed_equivalent and not self.is_proposed_development:
            self.is_proposed_development = self.is_proposed_equivalent
        return self


class EGovernmentChecklistResponse(EGovernmentChecklistCreate):
    id: int
    issp_period: str
    model_config = ConfigDict(from_attributes=True)


# ==========================================================
# 6. PART II.C & III.D: INFORMATION SYSTEMS
# ==========================================================

class InformationSystemCreate(BaseModel):
    """
    Department-friendly intake model for Information Systems proposals.
    Includes direct linkage to major ICT Projects (Part III.E), target fiscal year,
    and UACS object code integration for 4-way parity.
    """
    department_id: Optional[int] = Field(default=None, description="Proposing Department ID")
    needs_assessment_id: Optional[Union[uuid.UUID, str]] = Field(default=None, description="Linked Section 8.0 Needs Assessment")
    strategic_concern_id: Optional[Union[uuid.UUID, str]] = None
    project_id: Optional[Union[uuid.UUID, str]] = Field(default=None, description="Linked Major ICT Project ID (Part III.E)")
    name: str = Field(..., max_length=255, example="Citizen Frontline Registry and Electronic Payment System")
    status: Union[SystemStatus, str] = Field(default="For Development")
    submission_status: str = Field(default="Draft", description="Draft | Submitted | Approved | Returned")
    rejection_reason: Optional[str] = None
    classification: Optional[Union[SystemClassification, str]] = Field(default="Operations - Frontline Service")
    
    # Financial Cost Proposal (Aggregated into Part III.E Project Costs & Part IV.A)
    proposed_cost: Decimal = Field(default=Decimal("0.00"), ge=0, description="Estimated total budget or development outlay for this system")
    is_client_facing: bool = Field(default=True, description="Public/client facing or internal back-office")

    # Target implementation fiscal year, UACS Object Code, and Expenditure Class for 4-way parity
    target_year: Optional[int] = Field(default=None, description="Target year when development/enhancement will be executed")
    uacs_object_code: Optional[str] = Field(default="50604070 01 - ICT Software (Perpetual CO)", description="UACS Object Code")
    expenditure_class: Optional[str] = Field(default="Capital Outlay", description="Capital Outlay | Maintenance and Other Operating Expenses")

    # 100% DICT Template Multi-Classification Checkboxes (Template Pages 11 & 20)
    is_support_to_operations: bool = Field(default=False, description="Support to Operations")
    is_general_administrative: bool = Field(default=False, description="General Administrative Systems")
    is_operations: bool = Field(default=True, description="Operations")

    # Subordinated frontline details (DICT Part II.C & III.D)
    is_frontline_service: bool = Field(default=True, description="Directly used for public/client service delivery")
    frontline_hosting_type: Union[SystemHostingType, str] = Field(default="Online", description="Online | On-premise | Hybrid")
    online_url: Optional[str] = Field(default=None, description="Public web portal address")
    is_non_frontline_service: bool = Field(default=False, description="Supports core mandate but not directly used by clients/public")
    hosting_type: Optional[Union[SystemHostingType, str]] = Field(default=None, description="Legacy alias for frontline_hosting_type")

    description_and_purpose: str = Field(default="")
    enhancement_details: Optional[str] = Field(default=None, description="Details of enhancements when status is 'For Enhancement'")
    development_strategy: Union[DevelopmentStrategy, str] = Field(default="Outsourced")
    development_platform: str = Field(default="Web-Based Architecture", example="Python FastAPI, React, PostgreSQL")
    database_name: str = Field(default="AppDatabase", example="production_db")
    data_storage_type: str = Field(default="Cloud / On-premise Storage", example="GovCloud Enterprise NVMe Storage")
    internal_users: str = Field(default="Department Personnel", example="Administrative Staff, Division Officers")
    external_users: str = Field(default="General Public", example="General Public, Corporate Entities")
    system_owner_office: str = Field(default="Department Office", example="Public Frontline Services Division")
    
    # Interoperability Capabilities
    is_integrated_with_others: bool = Field(default=False)
    internal_integrated_systems: Optional[str] = None
    external_integrated_systems: Optional[str] = None
    generates_data_for_others: bool = Field(default=False)
    processes_data_from_others: bool = Field(default=False)
    is_deployed_on_shared_platform: bool = Field(default=False)
    
    # Data Privacy Act (PIA) Compliance
    processes_personal_information: bool = Field(default=False)
    has_undergone_pia: bool = Field(default=False)
    pia_target_date_text: Optional[str] = Field(default=None, max_length=100, description="Target audit date if PIA is not yet completed")

    @field_validator('strategic_concern_id', 'needs_assessment_id', 'project_id', mode='before')
    @classmethod
    def coerce_ids(cls, v: Any) -> Any:
        return coerce_optional_uuid(v)

    @field_validator('status', 'classification', 'hosting_type', 'frontline_hosting_type', 'development_strategy', 'expenditure_class', mode='before')
    @classmethod
    def coerce_str_enums(cls, v: Any) -> str:
        return str(getattr(v, 'value', v) or "")

    @field_validator('uacs_object_code', mode='before')
    @classmethod
    def clean_uacs_input(cls, v: Any) -> Optional[str]:
        return clean_optional_string(v) or "50604070 01 - ICT Software (Perpetual CO)"

    @model_validator(mode='after')
    def sync_frontline_and_hosting(self) -> 'InformationSystemCreate':
        if self.hosting_type and not self.frontline_hosting_type:
            self.frontline_hosting_type = self.hosting_type
        elif self.frontline_hosting_type and not self.hosting_type:
            self.hosting_type = self.frontline_hosting_type

        if self.is_client_facing and not self.is_frontline_service:
            self.is_frontline_service = True
        elif not self.is_client_facing and self.is_frontline_service:
            self.is_client_facing = True

        class_str = str(getattr(self.classification, 'value', self.classification) or "").lower()
        if class_str:
            if "support" in class_str:
                self.is_support_to_operations = True
            if "general administrative" in class_str or "administrative" in class_str:
                self.is_general_administrative = True
            if ("operations" in class_str and "support" not in class_str) or "frontline" in class_str:
                self.is_operations = True
            if "frontline" in class_str:
                if "non-frontline" in class_str:
                    self.is_non_frontline_service = True
                    self.is_frontline_service = False
                else:
                    self.is_frontline_service = True
                    self.is_non_frontline_service = False

        if not self.is_support_to_operations and not self.is_general_administrative and not self.is_operations:
            self.is_operations = True

        return self


class InformationSystemUpdate(BaseModel):
    department_id: Optional[int] = None
    needs_assessment_id: Optional[Union[uuid.UUID, str]] = None
    strategic_concern_id: Optional[Union[uuid.UUID, str]] = None
    project_id: Optional[Union[uuid.UUID, str]] = None
    name: Optional[str] = None
    status: Optional[str] = None
    submission_status: Optional[str] = None
    rejection_reason: Optional[str] = None
    classification: Optional[str] = None
    proposed_cost: Optional[Decimal] = Field(None, ge=0)
    is_client_facing: Optional[bool] = None
    target_year: Optional[int] = None
    uacs_object_code: Optional[str] = None
    expenditure_class: Optional[str] = None
    is_support_to_operations: Optional[bool] = None
    is_general_administrative: Optional[bool] = None
    is_operations: Optional[bool] = None
    is_frontline_service: Optional[bool] = None
    frontline_hosting_type: Optional[str] = None
    online_url: Optional[str] = None
    is_non_frontline_service: Optional[bool] = None
    hosting_type: Optional[str] = None
    description_and_purpose: Optional[str] = None
    enhancement_details: Optional[str] = None
    development_strategy: Optional[str] = None
    development_platform: Optional[str] = None
    database_name: Optional[str] = None
    data_storage_type: Optional[str] = None
    internal_users: Optional[str] = None
    external_users: Optional[str] = None
    system_owner_office: Optional[str] = None
    is_integrated_with_others: Optional[bool] = None
    internal_integrated_systems: Optional[str] = None
    external_integrated_systems: Optional[str] = None
    generates_data_for_others: Optional[bool] = None
    processes_data_from_others: Optional[bool] = None
    is_deployed_on_shared_platform: Optional[bool] = None
    processes_personal_information: Optional[bool] = None
    has_undergone_pia: Optional[bool] = None
    pia_target_date_text: Optional[str] = None

    @field_validator('strategic_concern_id', 'needs_assessment_id', 'project_id', mode='before')
    @classmethod
    def coerce_ids(cls, v: Any) -> Any:
        return coerce_optional_uuid(v)

    @field_validator('status', 'classification', 'hosting_type', 'frontline_hosting_type', 'development_strategy', 'expenditure_class', mode='before')
    @classmethod
    def coerce_str_enums(cls, v: Any) -> Optional[str]:
        if v is None:
            return None
        return str(getattr(v, 'value', v) or "")


class InformationSystemResponse(InformationSystemCreate):
    id: Union[uuid.UUID, str]
    issp_period: str
    department_name: Optional[str] = None
    project_title: Optional[str] = None
    needs_assessment_title: Optional[str] = None
    proposed_cost: Decimal = Decimal("0.00")
    is_client_facing: bool = True
    target_year: Optional[int] = None
    uacs_object_code: Optional[str] = "50604070 01 - ICT Software (Perpetual CO)"
    expenditure_class: Optional[str] = "Capital Outlay"

    @field_validator('id', 'strategic_concern_id', 'needs_assessment_id', 'project_id', mode='before')
    @classmethod
    def coerce_ids(cls, v: Any) -> Any:
        return coerce_optional_uuid(v) or v

    model_config = ConfigDict(from_attributes=True)


class SystemApprovalPayload(BaseModel):
    strategic_concern_id: Optional[Union[uuid.UUID, str]] = None
    project_id: Optional[Union[uuid.UUID, str]] = None
    status: str = Field(default="For Development", description="Operational | For Development | For Enhancement")
    action: str = Field(default="APPROVE", description="APPROVE | RETURN")
    rejection_reason: Optional[str] = None
    target_year: Optional[int] = None
    uacs_object_code: Optional[str] = None
    expenditure_class: Optional[str] = None

    @field_validator('strategic_concern_id', 'project_id', mode='before')
    @classmethod
    def coerce_ids(cls, v: Any) -> Any:
        return coerce_optional_uuid(v)


# ==========================================================
# 7. PART III.E & III.F: ICT PROJECTS & PMF
# ==========================================================

class ProjectLinksPayload(BaseModel):
    proposal_ids: List[Union[uuid.UUID, str]] = Field(default_factory=list, description="IDs of proposals to bind to this project")
    system_ids: List[Union[uuid.UUID, str]] = Field(default_factory=list, description="IDs of systems to bind to this project")

    @field_validator('proposal_ids', 'system_ids', mode='before')
    @classmethod
    def coerce_uuid_list(cls, v: Any) -> List[Any]:
        if not isinstance(v, list):
            return []
        return [coerce_optional_uuid(i) for i in v if i]


class IctProjectCreate(BaseModel):
    system_id: Optional[Union[uuid.UUID, str]] = None
    project_title: str = Field(..., max_length=255, example="Citizen Frontline Portal Modernization and GovCloud Migration Project")
    project_category: Union[ProjectCategory, str] = Field(default="Internal ICT Projects")
    description: Optional[str] = Field(default="")
    objectives: Optional[str] = Field(default="")
    
    # Strategic Alignment Checklists
    aligns_pip: bool = Field(default=False)
    aligns_ncsp: bool = Field(default=False)
    aligns_egmp: bool = Field(default=False)
    aligns_pcb: bool = Field(default=False)
    aligns_others: bool = Field(default=False, description="Strategic Alignment 'Others (Specify)'")
    aligns_others_specify: Optional[str] = Field(default=None, max_length=255)
    
    # Dynamic Harmonization Framework Criteria
    harmonization_criteria: Dict[str, bool] = Field(
        default_factory=dict,
        description="Dynamic harmonization criteria map, e.g. {'National Prioritization': true, 'PeGIF': true, ...}"
    )

    # Legacy booleans preserved for backward compatibility
    harmonizes_national_priority: bool = Field(default=False)
    harmonizes_resource_optimization: bool = Field(default=False)
    harmonizes_pegif: bool = Field(default=False)
    harmonizes_cross_collaboration: bool = Field(default=False)
    harmonizes_scalability: bool = Field(default=False)
    
    # Dynamic 3-year duration bounds calculated from active UTC calendar year
    duration_start_year: Optional[int] = Field(default_factory=lambda: datetime.now(timezone.utc).year)
    duration_end_year: Optional[int] = Field(default_factory=lambda: datetime.now(timezone.utc).year + 2)
    
    # Dynamic Multi-Year Deliverables / Milestones Map (2 to 5+ Years)
    annual_deliverables: Dict[str, str] = Field(
        default_factory=dict, 
        description="Dynamic year-keyed deliverables map, e.g. {'2028': '...', '2029': '...', '2030': '...'}"
    )
    
    year_1_deliverables: Optional[str] = Field(default="")
    year_2_deliverables: Optional[str] = Field(default="")
    year_3_deliverables: Optional[str] = Field(default="")
    
    implementing_unit: Optional[str] = Field(default="ICT Management Office")
    funding_source: Union[FundSource, str] = Field(default="General Appropriations Act (GAA)")
    lead_agency: Optional[str] = None
    partner_agencies: Optional[str] = None

    @field_validator('system_id', mode='before')
    @classmethod
    def coerce_system_id(cls, v: Any) -> Any:
        return coerce_optional_uuid(v)

    @field_validator('project_category', 'funding_source', mode='before')
    @classmethod
    def coerce_cat_funding(cls, v: Any) -> str:
        return str(getattr(v, 'value', v) or "")

    @field_validator('annual_deliverables', 'harmonization_criteria', mode='before')
    @classmethod
    def deserialize_dynamic_dicts(cls, v: Any) -> Dict[str, Any]:
        return deserialize_dict_if_string(v)

    @model_validator(mode='after')
    def sync_criteria_and_deliverables(self) -> 'IctProjectCreate':
        if not self.harmonization_criteria:
            self.harmonization_criteria = {
                "National Prioritization (PDP 2023-2028)": self.harmonizes_national_priority,
                "Resource Optimization (GovNet, GovCloud)": self.harmonizes_resource_optimization,
                "PeGIF Standardized APIs & Interoperability": self.harmonizes_pegif,
                "Cross-Agency Collaboration (JMC / MOA)": self.harmonizes_cross_collaboration,
                "Scalability and Sustainability (SPAR / PREXC)": self.harmonizes_scalability
            }
        else:
            for k, val in self.harmonization_criteria.items():
                k_lower = k.lower()
                b_val = bool(val)
                if "priority" in k_lower or "pdp" in k_lower: self.harmonizes_national_priority = b_val
                if "resource" in k_lower or "cloud" in k_lower or "govnet" in k_lower: self.harmonizes_resource_optimization = b_val
                if "interoperability" in k_lower or "pegif" in k_lower or "api" in k_lower: self.harmonizes_pegif = b_val
                if "cross" in k_lower or "collaboration" in k_lower or "jmc" in k_lower: self.harmonizes_cross_collaboration = b_val
                if "scalability" in k_lower or "sustainability" in k_lower or "spar" in k_lower or "prexc" in k_lower: self.harmonizes_scalability = b_val

        # Synchronize annual deliverables bidirectionally with year-by-year keys without hardcoded years
        start_yr = self.duration_start_year or datetime.now(timezone.utc).year
        if not self.annual_deliverables:
            deliverables = {}
            if self.year_1_deliverables:
                deliverables["Year 1"] = self.year_1_deliverables
                deliverables[str(start_yr)] = self.year_1_deliverables
            if self.year_2_deliverables:
                deliverables["Year 2"] = self.year_2_deliverables
                deliverables[str(start_yr + 1)] = self.year_2_deliverables
            if self.year_3_deliverables:
                deliverables["Year 3"] = self.year_3_deliverables
                deliverables[str(start_yr + 2)] = self.year_3_deliverables
            self.annual_deliverables = deliverables
        else:
            start_yr_str = str(start_yr)
            if not self.year_1_deliverables:
                self.year_1_deliverables = self.annual_deliverables.get("Year 1") or self.annual_deliverables.get(start_yr_str) or ""
            if not self.year_2_deliverables:
                self.year_2_deliverables = self.annual_deliverables.get("Year 2") or self.annual_deliverables.get(str(int(start_yr_str) + 1)) or ""
            if not self.year_3_deliverables:
                self.year_3_deliverables = self.annual_deliverables.get("Year 3") or self.annual_deliverables.get(str(int(start_yr_str) + 2)) or ""
        return self


class IctProjectUpdate(BaseModel):
    system_id: Optional[Union[uuid.UUID, str]] = None
    project_title: Optional[str] = None
    project_category: Optional[str] = None
    description: Optional[str] = None
    objectives: Optional[str] = None
    aligns_pip: Optional[bool] = None
    aligns_ncsp: Optional[bool] = None
    aligns_egmp: Optional[bool] = None
    aligns_pcb: Optional[bool] = None
    aligns_others: Optional[bool] = None
    aligns_others_specify: Optional[str] = None
    harmonization_criteria: Optional[Dict[str, bool]] = None
    harmonizes_national_priority: Optional[bool] = None
    harmonizes_resource_optimization: Optional[bool] = None
    harmonizes_pegif: Optional[bool] = None
    harmonizes_cross_collaboration: Optional[bool] = None
    harmonizes_scalability: Optional[bool] = None
    duration_start_year: Optional[int] = None
    duration_end_year: Optional[int] = None
    annual_deliverables: Optional[Dict[str, str]] = None
    year_1_deliverables: Optional[str] = None
    year_2_deliverables: Optional[str] = None
    year_3_deliverables: Optional[str] = None
    implementing_unit: Optional[str] = None
    funding_source: Optional[str] = None
    lead_agency: Optional[str] = None
    partner_agencies: Optional[str] = None

    @field_validator('system_id', mode='before')
    @classmethod
    def coerce_system_id(cls, v: Any) -> Any:
        return coerce_optional_uuid(v)

    @field_validator('project_category', 'funding_source', mode='before')
    @classmethod
    def coerce_cat_funding(cls, v: Any) -> Optional[str]:
        if v is None:
            return None
        return str(getattr(v, 'value', v) or "")

    @field_validator('annual_deliverables', 'harmonization_criteria', mode='before')
    @classmethod
    def deserialize_dynamic_dicts(cls, v: Any) -> Optional[Dict[str, Any]]:
        if v is None:
            return None
        return deserialize_dict_if_string(v)


class IctProjectResponse(IctProjectCreate):
    id: Union[uuid.UUID, str]
    issp_period: str
    computed_total_project_cost: Decimal = Decimal("0.00")
    harmonization_criteria: Dict[str, bool] = Field(default_factory=dict)
    linked_proposals: List[Dict[str, Any]] = Field(default_factory=list, description="Child proposals and items assigned to this project")
    linked_systems: List[Dict[str, Any]] = Field(default_factory=list, description="Child information systems linked to this project")

    @field_validator('id', mode='before')
    @classmethod
    def coerce_project_id(cls, v: Any) -> Any:
        return coerce_optional_uuid(v) or str(v)

    @field_validator('computed_total_project_cost', mode='before')
    @classmethod
    def coerce_total_cost(cls, v: Any) -> Decimal:
        if v is None:
            return Decimal("0.00")
        try:
            return Decimal(str(v))
        except Exception:
            return Decimal("0.00")

    model_config = ConfigDict(from_attributes=True)


class CrossAgencyProjectCreate(BaseModel):
    name: str = Field(..., example="National Single Window & Inter-Agency Interoperability Project")
    objectives: str = Field(default="")
    duration: str = Field(default_factory=lambda: settings.DEFAULT_ISSP_CYCLE)
    deliverables: str = Field(default="")
    lead_agency: str = Field(default="Department of Information and Communications Technology (DICT)", example="DICT")
    implementing_agencies: str = Field(default="")


class CrossAgencyProjectResponse(CrossAgencyProjectCreate):
    id: Union[uuid.UUID, str]
    issp_period: str

    @field_validator('id', mode='before')
    @classmethod
    def coerce_id(cls, v: Any) -> Any:
        return coerce_optional_uuid(v) or str(v)

    model_config = ConfigDict(from_attributes=True)


class PerformanceMetricCreate(BaseModel):
    project_id: Optional[Union[uuid.UUID, str]] = None
    project_title: Optional[str] = Field(default="Institutional ICT Governance", example="Institutional ICT Governance")
    result_hierarchy: str = Field(default="Immediate Outcome", example="Immediate Outcome")
    indicator: str = Field(..., example="Percentage of citizen frontline services accessible online")
    baseline: str = Field(..., example="35%")
    target: str = Field(..., example="100% adoption")
    annual_targets: Dict[str, str] = Field(
        default_factory=dict,
        description="Multi-year target milestones, e.g. {'2028': '50%', '2029': '80%', '2030': '100%'}"
    )
    collection_method: str = Field(..., example="Application APM analytics")
    responsibility: str = Field(..., example="Information and Communications Technology Division (ICTD)")

    @field_validator('project_id', mode='before')
    @classmethod
    def coerce_project_id(cls, v: Any) -> Any:
        return coerce_optional_uuid(v)

    @field_validator('annual_targets', mode='before')
    @classmethod
    def deserialize_annual_targets(cls, v: Any) -> Dict[str, str]:
        parsed = deserialize_dict_if_string(v)
        return {str(k): str(val) for k, val in parsed.items()} if parsed else {}


class PerformanceMetricResponse(BaseModel):
    id: Union[uuid.UUID, str]
    issp_period: str
    project_id: Optional[Union[uuid.UUID, str]] = None
    project_title: str
    result_hierarchy: str
    indicator: str
    baseline: str
    target: str
    annual_targets: Dict[str, str] = Field(default_factory=dict)
    collection_method: str
    responsibility: str

    @field_validator('id', 'project_id', mode='before')
    @classmethod
    def coerce_ids(cls, v: Any) -> Any:
        return coerce_optional_uuid(v) or v

    @field_validator('annual_targets', mode='before')
    @classmethod
    def deserialize_annual_targets(cls, v: Any) -> Dict[str, str]:
        parsed = deserialize_dict_if_string(v)
        return {str(k): str(val) for k, val in parsed.items()} if parsed else {}

    model_config = ConfigDict(from_attributes=True)


# ==========================================================
# 8. PART IV.A: RESOURCE REQUIREMENTS (SIMPLIFIED & UNIFIED)
# ==========================================================

class ProposalCreatePayload(BaseModel):
    outcome_id: Optional[int] = Field(None, description="Target Organizational Outcome ID (Broader Scope)")
    department_id: Optional[int] = Field(None, description="Target Department ID (Admin assignment)")
    needs_assessment_id: Optional[Union[uuid.UUID, str]] = Field(None, description="Linked Department Needs Assessment")
    strategic_category_id: Optional[int] = Field(None, description="Optional foreign key to StrategicCategory")
    subscription_type: Optional[str] = Field(None, description="Subscription type designation")
    project_key: Optional[str] = Field(None, description="Project key identifier")
    project_id: Optional[Union[uuid.UUID, str]] = Field(None, description="Linked Strategic ICT Project ID")
    system_id: Optional[Union[uuid.UUID, str]] = Field(None, description="Linked Information System ID")
    
    category: Optional[str] = Field(default="Hardware", description="Hardware, Software, Subscription, or Services")
    strategic_category: Optional[str] = Field(default="Office Productivity", description="Dynamic Strategic Category")
    office_location: Optional[str] = Field(default="Central Office")
    fund_source: Optional[str] = Field(default="General Appropriations Act (GAA)")
    
    item_select: str = Field(default="other", description="Catalog key identifier ('other' for custom requests)")
    item_name: str = Field(..., max_length=255, description="Name and description of item requested")
    unit_cost: Decimal = Field(..., ge=0, description="Unit cost in Philippine Peso (PHP)")

    yearly_quantities: Dict[str, int] = Field(
        default_factory=dict, 
        description="Arbitrary multi-year quantity mapping, e.g. {'2028': 5, '2029': 2, '2030': 4, ...}"
    )
    year_1_qty: Optional[int] = Field(default=0, ge=0)
    year_2_qty: Optional[int] = Field(default=0, ge=0)
    year_3_qty: Optional[int] = Field(default=0, ge=0)

    justification: Optional[str] = Field(None, description="Detailed technical justification")
    system_development_status: Optional[str] = Field(
        default="N/A",
        description="For Development / For Enhancement if total budget threshold is reached"
    )

    created_by_students: bool = Field(
        default=False, 
        description="Flag indicating in-house / non-commercial internally developed software"
    )
    is_in_house_turnover: Optional[bool] = Field(
        default=None, 
        description="Generic public-sector alias for internally developed / non-commercial asset turnovers"
    )

    canvas_evidence_url: Optional[str] = None
    canvas_expiration_date: Optional[datetime] = None
    supplier_name: Optional[str] = None
    is_expansion: bool = Field(default=False, description="True if adding new capacity rather than replacing retired units")

    uacs_object_code: Optional[str] = None
    expenditure_class: Optional[str] = None

    @field_validator('project_id', 'needs_assessment_id', 'system_id', mode='before')
    @classmethod
    def coerce_uuid_selectors(cls, v: Any) -> Any:
        return coerce_optional_uuid(v)

    @field_validator('category', 'strategic_category', 'office_location', 'fund_source', 'system_development_status', mode='before')
    @classmethod
    def coerce_dynamic_string(cls, v: Any) -> Optional[str]:
        if v is None:
            return None
        return str(getattr(v, 'value', v) or "").strip()

    @field_validator('item_select', mode='before')
    @classmethod
    def clean_item_select(cls, v: Any) -> str:
        s = clean_optional_string(v)
        return s if s else "other"

    @field_validator('canvas_evidence_url', 'supplier_name', 'uacs_object_code', 'expenditure_class', mode='before')
    @classmethod
    def clean_empty_strings(cls, v: Any) -> Optional[str]:
        return clean_optional_string(v)

    @field_validator('canvas_expiration_date', mode='before')
    @classmethod
    def parse_canvas_expiration(cls, v: Any) -> Optional[datetime]:
        if v is None:
            return None
        if isinstance(v, datetime):
            return v
        s = str(v).strip()
        if not s or s.lower() in ("none", "null", "undefined", ""):
            return None
        try:
            return datetime.fromisoformat(s.replace("Z", "+00:00"))
        except Exception:
            return None

    @field_validator('item_name', 'justification', mode='before')
    @classmethod
    def clean_and_sanitize_inputs(cls, v: Optional[str]) -> Optional[str]:
        return sanitize_text(v)

    @field_validator('yearly_quantities', mode='before')
    @classmethod
    def deserialize_quantities(cls, v: Any) -> Dict[str, int]:
        parsed = deserialize_dict_if_string(v)
        res = {}
        for key, val in parsed.items():
            try:
                res[str(key).strip()] = int(val) if val is not None else 0
            except (ValueError, TypeError):
                res[str(key).strip()] = 0
        return res

    @model_validator(mode='after')
    def sync_quantities_and_aliases(self) -> 'ProposalCreatePayload':
        if not self.category:
            self.category = "Hardware"
        if not self.strategic_category:
            self.strategic_category = "Office Productivity"
        if not self.office_location:
            self.office_location = "Central Office"
        if not self.fund_source:
            self.fund_source = "General Appropriations Act (GAA)"
        if not self.system_development_status:
            self.system_development_status = "N/A"

        # Bidirectional turnover alias sync
        if self.is_in_house_turnover is not None:
            self.created_by_students = bool(self.is_in_house_turnover)
        elif self.created_by_students:
            self.is_in_house_turnover = True
        else:
            self.is_in_house_turnover = False
            self.created_by_students = False

        # Synchronize yearly quantities across any planning horizon without hardcoded years
        if self.yearly_quantities and len(self.yearly_quantities) > 0:
            years_sorted = sorted([k for k in self.yearly_quantities.keys() if str(k).isdigit() and len(str(k)) == 4])
            if len(years_sorted) >= 1:
                self.year_1_qty = int(self.yearly_quantities.get(years_sorted[0], 0) or 0)
                self.yearly_quantities["Year 1"] = self.year_1_qty
            if len(years_sorted) >= 2:
                self.year_2_qty = int(self.yearly_quantities.get(years_sorted[1], 0) or 0)
                self.yearly_quantities["Year 2"] = self.year_2_qty
            if len(years_sorted) >= 3:
                self.year_3_qty = int(self.yearly_quantities.get(years_sorted[2], 0) or 0)
                self.yearly_quantities["Year 3"] = self.year_3_qty
        else:
            self.yearly_quantities = {
                "Year 1": self.year_1_qty or 0,
                "Year 2": self.year_2_qty or 0,
                "Year 3": self.year_3_qty or 0
            }

        return self


class ProposalResponse(BaseModel):
    id: Union[uuid.UUID, str]
    department_id: int
    issp_period: str
    outcome_id: Optional[int] = None
    project_id: Optional[Union[uuid.UUID, str]] = None
    project_title: Optional[str] = None 
    system_id: Optional[Union[uuid.UUID, str]] = None
    needs_assessment_id: Optional[Union[uuid.UUID, str]] = None
    strategic_category_id: Optional[int] = None
    
    category: str = "Hardware"
    strategic_category: str = "Office Productivity"
    office_location: str = "Central Office"
    fund_source: str = "General Appropriations Act (GAA)"
    uacs_object_code: str = "50604050 03 - ICT Equipment (CO)"
    expenditure_class: str = "Capital Outlay"
    status: str = "Draft"
    
    item_name: str
    item_key: Optional[str] = None
    unit_cost: Decimal = Decimal("0.00")
    
    year_1_qty: int = 0
    year_2_qty: int = 0
    year_3_qty: int = 0
    yearly_quantities: Dict[str, int] = Field(default_factory=dict)
    total_qty: int = 0
    total_cost: Decimal = Decimal("0.00")
    
    justification: Optional[str] = None
    system_development_status: str = "N/A"
    created_by_students: bool = False
    is_in_house_turnover: bool = False
    
    target_office_automated: Optional[str] = None
    canvas_evidence_url: Optional[str] = None
    canvas_expiration_date: Optional[datetime] = None
    supplier_name: Optional[str] = None
    comments: List[Dict[str, Any]] = Field(default_factory=list)
    
    version: int = 1
    is_archived: bool = False
    is_expansion: bool = False
    outcome: Optional[OrganizationalOutcomeResponse] = None

    @field_validator('id', 'project_id', 'needs_assessment_id', 'system_id', mode='before')
    @classmethod
    def coerce_uuid_fields(cls, v: Any) -> Any:
        return coerce_optional_uuid(v) or v

    @field_validator('category', 'strategic_category', 'office_location', 'fund_source', 'uacs_object_code', 'expenditure_class', 'status', 'system_development_status', mode='before')
    @classmethod
    def coerce_to_string(cls, v: Any) -> str:
        return str(getattr(v, 'value', v) or "").strip()

    @field_validator('yearly_quantities', mode='before')
    @classmethod
    def deserialize_yearly_quantities(cls, v: Any) -> Dict[str, int]:
        parsed = deserialize_dict_if_string(v)
        res = {}
        for key, val in parsed.items():
            try:
                res[str(key).strip()] = int(val) if val is not None else 0
            except (ValueError, TypeError):
                res[str(key).strip()] = 0
        return res

    @field_validator('comments', mode='before')
    @classmethod
    def deserialize_comments_list(cls, v: Any) -> List[Dict[str, Any]]:
        return deserialize_list_if_string(v)

    @model_validator(mode='after')
    def sync_aliases(self) -> 'ProposalResponse':
        self.is_in_house_turnover = bool(self.created_by_students or self.is_in_house_turnover)
        self.created_by_students = self.is_in_house_turnover
        if hasattr(self, 'project_rel') and self.project_rel:
            self.project_title = getattr(self.project_rel, 'project_title', None)
        return self

    model_config = ConfigDict(from_attributes=True)


class AdminOverridePayload(BaseModel):
    outcome_id: Optional[int] = Field(None, description="Broader Scope Organizational Outcome ID")
    item_name: Optional[str] = None
    unit_cost: Optional[Decimal] = Field(None, ge=0)
    yearly_quantities: Optional[Dict[str, int]] = None
    justification: Optional[str] = None
    project_id: Optional[Union[uuid.UUID, str]] = None
    system_id: Optional[Union[uuid.UUID, str]] = None
    needs_assessment_id: Optional[Union[uuid.UUID, str]] = None
    strategic_category_id: Optional[int] = None
    category: Optional[str] = None
    strategic_category: Optional[str] = None
    fund_source: Optional[str] = None
    office_location: Optional[str] = None
    uacs_object_code: Optional[str] = None
    expenditure_class: Optional[str] = None
    system_development_status: Optional[str] = None
    created_by_students: Optional[bool] = None
    is_in_house_turnover: Optional[bool] = None
    canvas_evidence_url: Optional[str] = None
    canvas_expiration_date: Optional[datetime] = None
    supplier_name: Optional[str] = None

    @field_validator('project_id', 'needs_assessment_id', 'system_id', mode='before')
    @classmethod
    def coerce_project_id(cls, v: Any) -> Any:
        return coerce_optional_uuid(v)

    @field_validator('category', 'strategic_category', 'fund_source', 'office_location', 'uacs_object_code', 'expenditure_class', 'system_development_status', mode='before')
    @classmethod
    def coerce_to_string(cls, v: Any) -> Optional[str]:
        if v is None:
            return None
        return str(getattr(v, 'value', v) or "").strip()

    @field_validator('canvas_evidence_url', 'supplier_name', mode='before')
    @classmethod
    def clean_optional_strings(cls, v: Any) -> Optional[str]:
        return clean_optional_string(v)

    @field_validator('canvas_expiration_date', mode='before')
    @classmethod
    def parse_canvas_expiration(cls, v: Any) -> Optional[datetime]:
        if v is None:
            return None
        if isinstance(v, datetime):
            return v
        s = str(v).strip()
        if not s or s.lower() in ("none", "null", "undefined", ""):
            return None
        try:
            return datetime.fromisoformat(s.replace("Z", "+00:00"))
        except Exception:
            return None

    @field_validator('yearly_quantities', mode='before')
    @classmethod
    def deserialize_quantities(cls, v: Any) -> Optional[Dict[str, int]]:
        if v is None:
            return None
        parsed = deserialize_dict_if_string(v)
        res = {}
        for key, val in parsed.items():
            try:
                res[str(key).strip()] = int(val) if val is not None else 0
            except (ValueError, TypeError):
                res[str(key).strip()] = 0
        return res

    @model_validator(mode='after')
    def sync_override_aliases(self) -> 'AdminOverridePayload':
        if self.is_in_house_turnover is not None and self.created_by_students is None:
            self.created_by_students = self.is_in_house_turnover
        elif self.created_by_students is not None and self.is_in_house_turnover is None:
            self.is_in_house_turnover = self.created_by_students

        return self


# ==========================================================
# 9. PART IV.B: SUMMARY OF INVESTMENTS & 4-WAY PARITY
# ==========================================================

class FinancialMatrixRow(BaseModel):
    total: Decimal = Decimal("0.00")
    model_config = ConfigDict(extra='allow')


class PartIVBParityResponse(BaseModel):
    b1_general_summary: Dict[str, Dict[str, Decimal]]
    b2_fund_source: Dict[str, Dict[str, Decimal]]
    b3_statement_of_expenditure: Dict[str, Dict[str, Decimal]]
    b4_object_of_expenditure: Dict[str, Dict[str, Decimal]]
    certified_grand_total: Decimal
    is_parity_valid: bool = True
    parity_discrepancy: Decimal = Decimal("0.00")
    year_columns: List[str] = Field(default_factory=list, description="Dynamic list of fiscal year column headers, e.g. ['FY 2028', 'FY 2029', 'FY 2030', ...]")


# ==========================================================
# 10. ANNEX 2: DISASTER RECOVERY & BUSINESS CONTINUITY (DRBCP)
# ==========================================================

class DisasterRecoveryTeamCreate(BaseModel):
    role: str = Field(..., example="Incident Commander")
    responsibility: str = Field(...)
    contact_person: str = Field(...)
    contact_details: str = Field(...)


class DisasterRecoveryTeamResponse(DisasterRecoveryTeamCreate):
    id: int
    issp_period: str
    model_config = ConfigDict(from_attributes=True)


class BusinessImpactAnalysisCreate(BaseModel):
    system_id: Optional[Union[uuid.UUID, str]] = None
    system_name: str = Field(..., example="Citizen Frontline Registry and Electronic Payment System")
    classification: str = Field(default="Frontline / Mission-Critical")
    mtpd_hours: int = Field(default=24, ge=1)
    rto_hours: int = Field(default=4, ge=0)
    rpo_hours: int = Field(default=1, ge=0)

    @field_validator('system_id', mode='before')
    @classmethod
    def coerce_system_id(cls, v: Any) -> Any:
        return coerce_optional_uuid(v)


class BusinessImpactAnalysisResponse(BusinessImpactAnalysisCreate):
    id: int
    issp_period: str

    @field_validator('system_id', mode='before')
    @classmethod
    def coerce_system_id(cls, v: Any) -> Any:
        return coerce_optional_uuid(v) or v

    model_config = ConfigDict(from_attributes=True)


class DRBCPMetricCreate(BaseModel):
    indicator: str = Field(..., example="System Availability")
    target_metric: str = Field(..., example="99.9% Up-time (excluding planned maintenance)")


class DRBCPMetricResponse(DRBCPMetricCreate):
    id: int
    issp_period: str
    model_config = ConfigDict(from_attributes=True)


# ==========================================================
# 11. NEEDS ASSESSMENT & DEPARTMENT JUSTIFICATIONS (SEC 8.0)
# ==========================================================

class NeedsAssessmentCreate(BaseModel):
    issp_period: Optional[str] = Field(None, description="Planning period snapshot")
    title: str = Field(..., example="Online Public Service Registration and E-Payment Processing Latency")
    mfo_alignment: str = Field(..., example="Citizen Frontline Public Services Program")
    current_problem: str = Field(...)
    proposed_solution: str = Field(...)
    expected_impacts: List[str] = Field(default=[])
    other_impact: Optional[str] = None


class NeedsAssessmentResponse(BaseModel):
    id: Union[uuid.UUID, str]
    department_id: int
    issp_period: str
    department_name: Optional[str] = None
    title: str
    mfo_alignment: str
    current_problem: str
    proposed_solution: str
    expected_impacts: List[str] = Field(default=[])
    other_impact: Optional[str] = None
    is_archived: bool = False
    is_aggregated: bool = False
    strategic_concern_id: Optional[Union[uuid.UUID, str]] = None

    @field_validator('id', 'strategic_concern_id', mode='before')
    @classmethod
    def coerce_id(cls, v: Any) -> Any:
        return coerce_optional_uuid(v)

    @field_validator('expected_impacts', mode='before')
    @classmethod
    def deserialize_impacts(cls, v: Any) -> List[str]:
        return deserialize_list_if_string(v)

    model_config = ConfigDict(from_attributes=True)


class AggregateNeedsAssessmentPayload(BaseModel):
    needs_assessment_id: Union[uuid.UUID, str]
    outcome_id: Optional[int] = None
    mfo: str = Field(..., example="Citizen Frontline Public Services Program")
    critical_system: str = Field(..., example="Citizen Frontline Registry and Electronic Payment System")
    problems: str = Field(...)
    intended_use: str = Field(...)
    order_index: int = Field(default=1)

    @field_validator('needs_assessment_id', mode='before')
    @classmethod
    def coerce_id(cls, v: Any) -> Any:
        return coerce_optional_uuid(v)


# ==========================================================
# 12. BUDGET CEILINGS & GOVERNANCE
# ==========================================================

class BudgetCeilingResponse(BaseModel):
    department_id: int
    department_name: str
    allocated_capex: Decimal = Decimal("0.00")
    allocated_mooe: Decimal = Decimal("0.00")
    sub_ceiling: Decimal = Decimal("0.00")
    global_ceiling: Decimal = Decimal("0.00")
    current_spent: Decimal = Decimal("0.00")
    annual_allocations: Dict[str, Any] = Field(default_factory=dict)
    model_config = ConfigDict(from_attributes=True)


class UpdateCeilingPayload(BaseModel):
    department_id: int
    allocated_capex: Decimal = Field(default=Decimal("0.00"), ge=0)
    allocated_mooe: Decimal = Field(default=Decimal("0.00"), ge=0)
    sub_ceiling: Optional[Decimal] = None
    annual_allocations: Optional[Dict[str, Any]] = None

    @model_validator(mode='after')
    def resolve_sub_ceiling_assignment(self) -> 'UpdateCeilingPayload':
        if self.sub_ceiling is not None and self.allocated_capex == Decimal("0.00") and self.allocated_mooe == Decimal("0.00"):
            self.allocated_capex = Decimal(str(self.sub_ceiling)).quantize(Decimal("0.01"))
            self.allocated_mooe = Decimal("0.00")
        return self


class UpdateGlobalCeilingPayload(BaseModel):
    global_ceiling: Decimal = Field(..., gt=0)


class BulkCeilingValidationPayload(BaseModel):
    issp_period: Optional[str] = Field(default_factory=lambda: settings.DEFAULT_ISSP_CYCLE)
    department_ids: Optional[List[int]] = Field(default_factory=list)


# ==========================================================
# 13. MASTER NARRATIVES & COMPLETED PLAN ARCHIVE SCHEMAS
# ==========================================================

class IsspCompositionBlock(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()), min_length=1, max_length=64)
    type: Literal["paragraph", "bullet_list", "numbered_list", "table", "survey", "attachment"]
    title: str = Field(default="", max_length=200)
    content: str = Field(default="", max_length=20000)
    items: List[str] = Field(default_factory=list, max_length=200)
    columns: List[str] = Field(default_factory=list, max_length=20)
    rows: List[List[str]] = Field(default_factory=list, max_length=500)
    questions: List[str] = Field(default_factory=list, max_length=200)
    file_key: Optional[str] = Field(default=None, max_length=500)
    file_name: Optional[str] = Field(default=None, max_length=255)

    @model_validator(mode="after")
    def validate_block_content(self):
        if self.type == "table":
            if not self.columns:
                raise ValueError("Tables require at least one column.")
            if any(len(row) != len(self.columns) for row in self.rows):
                raise ValueError("Every table row must match the number of columns.")
        if self.type == "survey" and not self.questions:
            raise ValueError("Survey blocks require at least one question.")
        if self.type in ("bullet_list", "numbered_list") and not self.items:
            raise ValueError("List blocks require at least one item.")
        if self.type == "attachment" and not (self.file_key and self.file_name):
            raise ValueError("Attachment blocks require an uploaded file.")
        return self


class IsspCompositionSection(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()), min_length=1, max_length=64)
    title: str = Field(..., min_length=1, max_length=200)
    parent_official_key: Optional[str] = Field(default=None, max_length=64)
    children: List["IsspCompositionSection"] = Field(default_factory=list, max_length=100)
    blocks: List[IsspCompositionBlock] = Field(default_factory=list, max_length=200)


class IsspOfficialSectionSetting(BaseModel):
    visible: bool = True
    title: Optional[str] = Field(default=None, max_length=200)
    order: Optional[int] = Field(default=None, ge=0, le=1000)
    replacement_section_id: Optional[str] = Field(default=None, max_length=64)


class IsspOutlineNodeResponse(BaseModel):
    key: str
    title: str
    title_override: Optional[str] = None
    anchor: str
    source: str
    record_count: int = 0
    records: List[Dict[str, Any]] = Field(default_factory=list)
    visible: bool = True
    order: Optional[int] = None
    replacement_section_id: Optional[str] = None
    children: List["IsspOutlineNodeResponse"] = Field(default_factory=list)


class IsspDocumentCompositionPayload(BaseModel):
    version: Literal[1, 2] = 2
    sections: List[IsspCompositionSection] = Field(default_factory=list, max_length=100)
    official_sections: Dict[str, IsspOfficialSectionSetting] = Field(default_factory=dict, max_length=100)

    @model_validator(mode="after")
    def validate_tree(self):
        section_ids = set()
        block_ids = set()
        section_count = 0
        block_count = 0

        def visit(section: IsspCompositionSection, depth: int) -> None:
            nonlocal section_count, block_count
            section_count += 1
            if depth > 5 or section_count > 250:
                raise ValueError("Composition may contain at most 250 sections and 5 nested levels.")
            if section.id in section_ids:
                raise ValueError("Section IDs must be unique within a composition.")
            section_ids.add(section.id)
            for block in section.blocks:
                block_count += 1
                if block_count > 1000 or block.id in block_ids:
                    raise ValueError("Composition block IDs must be unique and at most 1000 blocks are allowed.")
                block_ids.add(block.id)
            for child in section.children:
                visit(child, depth + 1)

        for section in self.sections:
            visit(section, 1)
        return self


class IsspDocumentCompositionResponse(IsspDocumentCompositionPayload):
    issp_period: str
    updated_at: Optional[datetime] = None
    outline: List[IsspOutlineNodeResponse] = Field(default_factory=list)

class ISPlannerSchema(BaseModel):
    name: str = Field(..., example="Lead Systems Analyst")
    position: str = Field(..., example="Information Technology Officer I")
    email: Optional[str] = Field(None, example="planner@agency.gov.ph")
    contact_number: Optional[str] = Field(None, example="09190000000")

    @field_validator('email', mode='before')
    @classmethod
    def clean_planner_email(cls, v: Any) -> Optional[str]:
        return clean_optional_string(v)


class ManpowerSchema(BaseModel):
    total_employees: int = Field(default=0, ge=0)
    admin_regular: int = Field(default=0, ge=0)
    admin_casual: int = Field(default=0, ge=0)
    technical_regular: Optional[int] = Field(default=0, ge=0)
    contractual_cos: Optional[int] = Field(default=0, ge=0)


class MasterNarrativeUpdate(BaseModel):
    agency_name: Optional[str] = None
    issp_period_from: Optional[int] = Field(None, example=2028)
    issp_period_to: Optional[int] = Field(None, example=2030)
    agency_website_url: Optional[str] = None
    website_url: Optional[str] = None
    
    is_amendment: Optional[bool] = False
    amendment_number: Optional[str] = None
    scope_choice: Optional[Union[ScopeChoice, str]] = ScopeChoice.DEPARTMENT_WIDE
    scope_json: Optional[Dict[str, Any]] = Field(default_factory=dict)
    is_active: Optional[bool] = False

    signatory_prepared_by: Optional[str] = None
    preparer_position: Optional[str] = None
    preparer_tel: Optional[str] = None
    preparer_fax: Optional[str] = None
    preparer_email: Optional[str] = None

    cio_name: Optional[str] = None
    cio_plantilla_position: Optional[str] = None
    cio_organizational_unit: Optional[str] = None
    cio_email: Optional[str] = None
    cio_contact_no: Optional[str] = None

    focal_name: Optional[str] = None
    focal_position: Optional[str] = None
    focal_organizational_unit: Optional[str] = None
    focal_email: Optional[str] = None
    focal_contact_no: Optional[str] = None

    head_of_agency_name: Optional[str] = None
    agency_head_position: Optional[str] = Field(None, description="Official title/position of the Head of Agency")
    signatory_approved_by: Optional[str] = None

    # Normalized Clean Plain-Text Fields
    mandate_text: Optional[str] = ""
    functions: Optional[str] = None
    vision_text: Optional[str] = ""
    mission_text: Optional[str] = ""
    present_situation_text: Optional[str] = ""
    enterprise_architecture_narrative: Optional[str] = None

    # Backward-compatible HTML property aliases
    mandate_html: Optional[str] = None
    legal_basis: Optional[str] = None
    vision_html: Optional[str] = None
    vision_statement: Optional[str] = None
    mission_html: Optional[str] = None
    mission_statement: Optional[str] = None
    present_situation_html: Optional[str] = None

    # Official Schematics & Seals (Canonical 4 Schematics Standard)
    agency_logo_url: Optional[str] = None
    dict_logo_url: Optional[str] = None
    bagong_pilipinas_logo_url: Optional[str] = None
    network_diagram_url: Optional[str] = None
    fiber_backbone_url: Optional[str] = None
    system_architecture_url: Optional[str] = None
    org_chart_url: Optional[str] = None
    existing_ict_org_url: Optional[str] = None
    proposed_ict_org_url: Optional[str] = None
    site_development_plan_url: Optional[str] = None
    process_flow_diagram_url: Optional[str] = None

    drbcp_approval_date: Optional[str] = Field(None, description="Official approval date of the DRBCP")
    drbcp_affected_assets_json: Optional[List[Any]] = None
    drbcp_recovery_strategy_text: Optional[str] = None
    drbcp_sop_phases_text: Optional[str] = None
    drbcp_compliance_narrative_text: Optional[str] = None
    
    # Backward-compatible DRBCP aliases
    drbcp_recovery_strategy_html: Optional[str] = None
    drbcp_sop_phases_html: Optional[str] = None
    drbcp_compliance_narrative_html: Optional[str] = None

    is_archived: Optional[bool] = False
    final_pdf_vault_url: Optional[str] = None
    final_docx_vault_url: Optional[str] = None

    planners_json: Optional[List[ISPlannerSchema]] = Field(default=[])
    manpower_json: Optional[ManpowerSchema] = None
    annual_ict_budget: Optional[Decimal] = Decimal("0.00")

    @field_validator(
        'preparer_email', 'cio_email', 'focal_email', 'agency_website_url', 
        'website_url', 'agency_logo_url', 'dict_logo_url', 'bagong_pilipinas_logo_url', 
        'network_diagram_url', 'fiber_backbone_url', 'system_architecture_url',
        'org_chart_url', 'existing_ict_org_url', 'proposed_ict_org_url',
        'site_development_plan_url', 'process_flow_diagram_url', 
        'final_pdf_vault_url', 'final_docx_vault_url',
        mode='before'
    )
    @classmethod
    def sanitize_emails_and_urls(cls, v: Any) -> Optional[str]:
        return clean_optional_string(v)

    @field_validator('scope_choice', mode='before')
    @classmethod
    def coerce_scope_choice(cls, v: Any) -> Any:
        return coerce_enum(ScopeChoice, v) or ScopeChoice.DEPARTMENT_WIDE

    @field_validator('drbcp_affected_assets_json', mode='before')
    @classmethod
    def deserialize_json_lists(cls, v: Any) -> Any:
        return deserialize_list_if_string(v)

    @field_validator('scope_json', mode='before')
    @classmethod
    def deserialize_scope_json(cls, v: Any) -> Any:
        return deserialize_dict_if_string(v)

    @model_validator(mode='before')
    @classmethod
    def synchronize_plain_text_and_html_inputs(cls, data: Any) -> Any:
        if isinstance(data, dict):
            if not data.get("mandate_text"):
                data["mandate_text"] = data.get("mandate_html") or data.get("legal_basis") or ""
            if not data.get("vision_text"):
                data["vision_text"] = data.get("vision_html") or data.get("vision_statement") or ""
            if not data.get("mission_text"):
                data["mission_text"] = data.get("mission_html") or data.get("mission_statement") or ""
            if not data.get("present_situation_text"):
                data["present_situation_text"] = data.get("present_situation_html") or ""
            if not data.get("drbcp_recovery_strategy_text"):
                data["drbcp_recovery_strategy_text"] = data.get("drbcp_recovery_strategy_html")
            if not data.get("drbcp_sop_phases_text"):
                data["drbcp_sop_phases_text"] = data.get("drbcp_sop_phases_html")
            if not data.get("drbcp_compliance_narrative_text"):
                data["drbcp_compliance_narrative_text"] = data.get("drbcp_compliance_narrative_html")

            cio = data.get("cio_name") or data.get("signatory_prepared_by")
            if cio and str(cio).strip():
                data["cio_name"] = str(cio).strip()
                data["signatory_prepared_by"] = str(cio).strip()

            head = data.get("head_of_agency_name") or data.get("signatory_approved_by")
            if head and str(head).strip():
                data["head_of_agency_name"] = str(head).strip()
                data["signatory_approved_by"] = str(head).strip()
        return data


class MasterNarrativeResponse(BaseModel):
    issp_period: str
    agency_name: Optional[str] = None
    issp_period_from: int
    issp_period_to: int
    website_url: Optional[str] = None
    agency_website_url: Optional[str] = None
    is_amendment: bool = False
    amendment_number: Optional[str] = None
    scope_choice: Optional[Union[ScopeChoice, str]] = None
    scope_json: Optional[Dict[str, Any]] = None
    is_active: bool
    
    # Official Text Signatories
    signatory_prepared_by: Optional[str] = ""
    cio_name: Optional[str] = None
    preparer_position: Optional[str] = None
    cio_plantilla_position: Optional[str] = None
    cio_organizational_unit: Optional[str] = None
    preparer_email: Optional[str] = None
    cio_email: Optional[str] = None
    preparer_tel: Optional[str] = None
    cio_contact_no: Optional[str] = None

    focal_name: Optional[str] = None
    focal_position: Optional[str] = None
    focal_organizational_unit: Optional[str] = None
    focal_email: Optional[str] = None
    focal_contact_no: Optional[str] = None

    signatory_approved_by: Optional[str] = ""
    head_of_agency_name: Optional[str] = None
    agency_head_position: Optional[str] = None

    # Normalized Clean Plain Text Fields
    mandate_text: str = ""
    functions: Optional[str] = None
    vision_text: str = ""
    mission_text: str = ""
    present_situation_text: str = ""
    enterprise_architecture_narrative: Optional[str] = None

    # Backward-compatible HTML aliases populated in response
    mandate_html: Optional[str] = ""
    legal_basis: Optional[str] = None
    vision_html: Optional[str] = ""
    vision_statement: Optional[str] = None
    mission_html: Optional[str] = ""
    mission_statement: Optional[str] = None
    present_situation_html: Optional[str] = None

    # Official Logos and Diagrams
    agency_logo_url: Optional[str] = None
    dict_logo_url: Optional[str] = None
    bagong_pilipinas_logo_url: Optional[str] = None
    network_diagram_url: Optional[str] = None
    fiber_backbone_url: Optional[str] = None
    system_architecture_url: Optional[str] = None
    org_chart_url: Optional[str] = None
    existing_ict_org_url: Optional[str] = None
    proposed_ict_org_url: Optional[str] = None
    site_development_plan_url: Optional[str] = None
    process_flow_diagram_url: Optional[str] = None

    drbcp_approval_date: Optional[str] = None
    drbcp_affected_assets_json: Optional[List[Any]] = Field(default_factory=list)
    drbcp_recovery_strategy_text: Optional[str] = None
    drbcp_sop_phases_text: Optional[str] = None
    drbcp_compliance_narrative_text: Optional[str] = None

    drbcp_recovery_strategy_html: Optional[str] = None
    drbcp_sop_phases_html: Optional[str] = None
    drbcp_compliance_narrative_html: Optional[str] = None

    is_archived: bool = False
    final_pdf_vault_url: Optional[str] = None
    final_docx_vault_url: Optional[str] = None

    planners_json: List[ISPlannerSchema] = []
    annual_ict_budget: Decimal = Decimal("0.00")
    authoring_cycle_duration: Optional[int] = 3

    @field_validator('scope_choice', mode='before')
    @classmethod
    def coerce_scope_choice(cls, v: Any) -> Any:
        return coerce_enum(ScopeChoice, v)

    @field_validator(
        'agency_logo_url', 'dict_logo_url', 'bagong_pilipinas_logo_url',
        'network_diagram_url', 'fiber_backbone_url', 'system_architecture_url',
        'org_chart_url', 'existing_ict_org_url', 'proposed_ict_org_url',
        'site_development_plan_url', 'process_flow_diagram_url',
        mode='after'
    )
    @classmethod
    def normalize_diagram_urls(cls, v: Optional[str]) -> Optional[str]:
        from app.storage.s3_client import storage_client
        return storage_client.normalize_asset_url(v)

    @field_validator('drbcp_affected_assets_json', mode='before')
    @classmethod
    def deserialize_json_lists(cls, v: Any) -> Any:
        return deserialize_list_if_string(v)

    @model_validator(mode='after')
    def populate_narrative_aliases(self) -> 'MasterNarrativeResponse':
        if not self.mandate_text and self.mandate_html:
            self.mandate_text = self.mandate_html
        if not self.vision_text and self.vision_html:
            self.vision_text = self.vision_html
        if not self.mission_text and self.mission_html:
            self.mission_text = self.mission_html
        if not self.present_situation_text and self.present_situation_html:
            self.present_situation_text = self.present_situation_html

        self.mandate_html = self.mandate_text
        self.legal_basis = self.mandate_text
        self.vision_html = self.vision_text
        self.vision_statement = self.vision_text
        self.mission_html = self.mission_text
        self.mission_statement = self.mission_text
        self.present_situation_html = self.present_situation_text
        
        self.drbcp_recovery_strategy_html = self.drbcp_recovery_strategy_text
        self.drbcp_sop_phases_html = self.drbcp_sop_phases_text
        self.drbcp_compliance_narrative_html = self.drbcp_compliance_narrative_text

        if not self.cio_name and self.signatory_prepared_by:
            self.cio_name = self.signatory_prepared_by
        elif not self.signatory_prepared_by and self.cio_name:
            self.signatory_prepared_by = self.cio_name

        if not self.head_of_agency_name and self.signatory_approved_by:
            self.head_of_agency_name = self.signatory_approved_by
        elif not self.signatory_approved_by and self.head_of_agency_name:
            self.signatory_approved_by = self.head_of_agency_name

        self.cio_plantilla_position = self.preparer_position
        self.cio_email = self.preparer_email
        self.cio_contact_no = self.preparer_tel
        
        if not self.agency_head_position:
            self.agency_head_position = getattr(settings, "DEFAULT_AGENCY_HEAD_TITLE", "Head of Agency")
        if not self.agency_name:
            self.agency_name = getattr(settings, "DEFAULT_AGENCY_NAME", "National Government Agency")
        self.website_url = self.agency_website_url
        return self

    model_config = ConfigDict(from_attributes=True)


class IsspPlanArchiveResponse(BaseModel):
    """Schema for historical, completed ISSP plan snapshots preserved in storage."""
    id: int
    issp_period: str
    agency_name: str
    start_year: int
    end_year: int
    certified_grand_total: Decimal = Decimal("0.00")
    pdf_vault_url: Optional[str] = None
    docx_vault_url: Optional[str] = None
    archived_at: Optional[datetime] = None
    archived_by_user: Optional[str] = None
    notes: Optional[str] = None
    model_config = ConfigDict(from_attributes=True)


class LifecycleRolloverResponse(BaseModel):
    status: str
    expired_cycle: Optional[str] = None
    new_active_cycle: Optional[str] = None
    message: Optional[str] = None
    final_pdf_vault_url: Optional[str] = None
    final_docx_vault_url: Optional[str] = None
    model_config = ConfigDict(from_attributes=True)


class SystemGovernanceSettings(BaseModel):
    global_budget_ceiling: Decimal = Field(default=Decimal("200000000.00"))
    issp_active_cycle: str = Field(default_factory=lambda: settings.DEFAULT_ISSP_CYCLE)
    model_config = ConfigDict(from_attributes=True)


class DepartmentAnalyticsResponse(BaseModel):
    department_id: int
    department_name: str
    total_proposals: int
    custom_proposals: int
    custom_ratio_percent: float
    missing_canvas_count: int
    requires_review_abuse: bool
    model_config = ConfigDict(from_attributes=True)


# ==========================================================
# 14. FEEDBACK, AUDIT & ASYNC TASK PROGRESS
# ==========================================================

class CommentCreate(BaseModel):
    text: str = Field(..., min_length=1, max_length=1000)
    field_name: Optional[str] = None
    proposal_id: Optional[Union[uuid.UUID, str]] = None
    requires_department_action: bool = False

    @field_validator('proposal_id', mode='before')
    @classmethod
    def coerce_proposal_id(cls, v: Any) -> Any:
        return coerce_optional_uuid(v)


class CommentResponse(BaseModel):
    id: Union[uuid.UUID, str]
    proposal_id: Optional[Union[uuid.UUID, str]] = None
    field_name: Optional[str] = None
    author_name: str
    author_email: Optional[str] = None
    author_role: Union[RoleTag, str] = "ROLE_DEPT_USER"
    text: str
    is_resolved: bool = False
    requires_department_action: bool = False

    @field_validator('id', 'proposal_id', mode='before')
    @classmethod
    def coerce_ids(cls, v: Any) -> Any:
        return coerce_optional_uuid(v)

    @field_validator('author_email', mode='before')
    @classmethod
    def clean_comment_email(cls, v: Any) -> Optional[str]:
        return clean_optional_string(v)

    @field_validator('author_role', mode='before')
    @classmethod
    def coerce_role(cls, v: Any) -> str:
        return str(getattr(v, 'value', v) or "ROLE_DEPT_USER")

    model_config = ConfigDict(from_attributes=True)


class AsyncTaskStatusResponse(BaseModel):
    task_id: Union[uuid.UUID, str]
    state: str
    progress_percent: int = Field(..., ge=0, le=100)
    current_step_message: str
    download_url: Optional[str] = None


class AuditLogEntryResponse(BaseModel):
    id: int
    proposal_id: Optional[Union[uuid.UUID, str]] = None
    department_id: Optional[int] = None
    module: str = "GOVERNANCE"
    action: str
    ip_address: Optional[str] = None
    user_id: Optional[int] = None
    operator_email: Optional[str] = None
    operator_role: Optional[str] = None
    timestamp: datetime
    old_value: Optional[Dict[str, Any]] = None
    new_value: Optional[Dict[str, Any]] = None

    @field_validator('proposal_id', mode='before')
    @classmethod
    def coerce_proposal_id(cls, v: Any) -> Any:
        return coerce_optional_uuid(v)

    model_config = ConfigDict(from_attributes=True)


class WhitelistedUserCreate(BaseModel):
    email: EmailStr = Field(..., description="Institutional email address")
    assigned_department_id: Optional[int] = None
    role_tag: Union[RoleTag, str] = Field(default="ROLE_DEPT_USER")
    password: str = Field(..., min_length=8, description="Mandatory initial password set by Admin for manual onboarding")

    @field_validator('role_tag', mode='before')
    @classmethod
    def coerce_role(cls, v: Any) -> str:
        return str(getattr(v, 'value', v) or "ROLE_DEPT_USER")


class WhitelistedUserUpdate(BaseModel):
    email: Optional[EmailStr] = None
    assigned_department_id: Optional[int] = None
    role_tag: Optional[Union[RoleTag, str]] = None
    password: Optional[str] = Field(None, min_length=8)

    @field_validator('role_tag', mode='before')
    @classmethod
    def coerce_role(cls, v: Any) -> Optional[str]:
        if v is None:
            return None
        return str(getattr(v, 'value', v) or "ROLE_DEPT_USER")


class WhitelistedUserResponse(BaseModel):
    id: int
    email: EmailStr
    role_tag: str
    assigned_department_id: Optional[int] = None
    department_id: Optional[int] = None
    department_name: Optional[str] = None

    @field_validator('role_tag', mode='before')
    @classmethod
    def coerce_role(cls, v: Any) -> str:
        return str(getattr(v, 'value', v) or "ROLE_DEPT_USER")

    @model_validator(mode='before')
    @classmethod
    def populate_attributes(cls, data: Any) -> Any:
        if isinstance(data, dict):
            dept_id = data.get("department_id") or data.get("assigned_department_id")
            data["assigned_department_id"] = dept_id
            data["department_id"] = dept_id
            if "department" in data and isinstance(data["department"], dict):
                data["department_name"] = data["department"].get("name")
            return data
        
        dept_id = getattr(data, "department_id", None)
        dept_rel = getattr(data, "department", None)
        dept_name = dept_rel.name if dept_rel else None

        return {
            "id": getattr(data, "id", None),
            "email": getattr(data, "email", None),
            "role_tag": str(getattr(data, "role_tag", "ROLE_DEPT_USER")),
            "assigned_department_id": dept_id,
            "department_id": dept_id,
            "department_name": dept_name
        }

    model_config = ConfigDict(from_attributes=True)


# ==========================================================
# 15. DYNAMIC TAXONOMY & GOVERNANCE CATALOG SCHEMAS
# ==========================================================

class StrategicCategoryCreate(BaseModel):
    name: str = Field(..., max_length=100, example="Office Productivity")
    code: Optional[str] = Field(None, max_length=50, example="OFFICE_PRODUCTIVITY")
    is_project_linked: bool = Field(default=False)
    is_recurring_expense: bool = Field(default=False)
    order_index: int = Field(default=0)
    is_active: bool = Field(default=True)
    description: Optional[str] = None


class StrategicCategoryUpdate(BaseModel):
    name: Optional[str] = None
    code: Optional[str] = None
    is_project_linked: Optional[bool] = None
    is_recurring_expense: Optional[bool] = None
    order_index: Optional[int] = None
    is_active: Optional[bool] = None
    description: Optional[str] = None


class StrategicCategoryResponse(StrategicCategoryCreate):
    id: int
    model_config = ConfigDict(from_attributes=True)


class UacsCatalogItemCreate(BaseModel):
    uacs_code: str = Field(..., max_length=50, example="50604050 03")
    account_title: str = Field(..., max_length=200, example="ICT Equipment (CO)")
    expenditure_class: str = Field(default="Capital Outlay", example="Capital Outlay")
    is_subscription_default: bool = Field(default=False)
    is_active: bool = Field(default=True)
    description: Optional[str] = None


class UacsCatalogItemUpdate(BaseModel):
    uacs_code: Optional[str] = None
    account_title: Optional[str] = None
    expenditure_class: Optional[str] = None
    is_subscription_default: Optional[bool] = None
    is_active: Optional[bool] = None
    description: Optional[str] = None


class UacsCatalogItemResponse(UacsCatalogItemCreate):
    id: int
    model_config = ConfigDict(from_attributes=True)


class HarmonizationCriterionCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=200, example="PeGIF Standardized APIs & Interoperability")
    is_mandatory: bool = Field(default=False)
    description: Optional[str] = None


class HarmonizationCriterionUpdate(BaseModel):
    name: Optional[str] = None
    is_mandatory: Optional[bool] = None
    description: Optional[str] = None


class HarmonizationCriterionResponse(BaseModel):
    id: int
    name: str
    is_mandatory: bool = False
    description: Optional[str] = None

    @model_validator(mode='before')
    @classmethod
    def populate_criteria_name(cls, data: Any) -> Any:
        if hasattr(data, 'criteria_name') and not getattr(data, 'name', None):
            return {
                "id": getattr(data, 'id', None),
                "name": getattr(data, 'criteria_name', None),
                "is_mandatory": getattr(data, 'is_mandatory', False),
                "description": getattr(data, 'description', None)
            }
        elif isinstance(data, dict) and 'criteria_name' in data and 'name' not in data:
            data['name'] = data['criteria_name']
        return data

    model_config = ConfigDict(from_attributes=True)


class DevelopmentStrategyCreate(BaseModel):
    code: str = Field(..., min_length=2, max_length=50, example="COTS")
    display_name: str = Field(..., min_length=2, max_length=200, example="Commercial Off-The-Shelf (COTS)")
    description: Optional[str] = None


class DevelopmentStrategyResponse(BaseModel):
    code: str
    display_name: str
    description: Optional[str] = None
    model_config = ConfigDict(from_attributes=True)


class InflationSettingItem(BaseModel):
    year: int
    year_index: int
    rate_percent: float
    is_base_year: bool = False


class InflationSettingsResponse(BaseModel):
    active_cycle: str
    start_year: int
    rates: List[InflationSettingItem]


class InflationSettingsUpdate(BaseModel):
    rates: Dict[str, float] = Field(..., example={"2028": 0.0, "2029": 3.0, "2030": 5.0})


class PolicySettingsResponse(BaseModel):
    capitalization_threshold: float = 50000.00
    major_outlay_review_threshold: float = 2000000.00
    hardware_replacement_buffer_units: int = 3
    canvas_expiration_warning_days: int = 14
    inflation_rates_by_year: Dict[str, float] = Field(default_factory=dict)


class PolicySettingsUpdate(BaseModel):
    capitalization_threshold: Optional[float] = None
    major_outlay_review_threshold: Optional[float] = None
    hardware_replacement_buffer_units: Optional[int] = None
    canvas_expiration_warning_days: Optional[int] = None


class BatchApprovePayload(BaseModel):
    proposal_ids: List[Union[uuid.UUID, str]] = Field(..., min_length=1)

    @field_validator('proposal_ids', mode='before')
    @classmethod
    def coerce_proposal_id_list(cls, v: Any) -> List[Any]:
        if not isinstance(v, list):
            return []
        return [coerce_optional_uuid(i) for i in v if i]


# ==========================================================
# 16. AUXILIARY CENSUS & INSTITUTIONAL SCHEMAS
# ==========================================================

class CampusCreate(BaseModel):
    name: str = Field(..., example="Regional Operations Center / Field Office")
    location: str = Field(..., example="Regional Administrative Center, Philippines")
    code: str = Field(..., example="RO-FIELD")


class CampusResponse(BaseModel):
    id: int
    name: str
    location: str
    code: str
    model_config = ConfigDict(from_attributes=True)


class GlossaryTermCreate(BaseModel):
    term: str = Field(..., example="Republic Act No. 10844")
    definition: str = Field(..., example="Department of Information and Communications Technology Act of 2015.")


class GlossaryTermUpdate(BaseModel):
    term: Optional[str] = None
    definition: Optional[str] = None


class GlossaryTermResponse(BaseModel):
    id: int
    term: str
    definition: str
    model_config = ConfigDict(from_attributes=True)


class GeneralInstructionCreate(BaseModel):
    step_number: int = Field(..., example=1)
    instruction_text: str = Field(...)


class GeneralInstructionResponse(BaseModel):
    id: int
    step_number: int
    instruction_text: str
    model_config = ConfigDict(from_attributes=True)


class ServerCapacityCreate(BaseModel):
    campus_id: int
    capacity_tier: str = Field(..., example="Above 4TB")
    location: str = Field(..., example="IN-HOUSE")
    quantity: int = Field(..., ge=0)


class ServerCapacityResponse(BaseModel):
    id: Union[uuid.UUID, str]
    campus_id: int
    capacity_tier: str
    location: str
    quantity: int

    @field_validator('id', mode='before')
    @classmethod
    def coerce_id(cls, v: Any) -> Any:
        return coerce_optional_uuid(v)

    model_config = ConfigDict(from_attributes=True)


class ClientOsCensusCreate(BaseModel):
    os_name: str = Field(..., example="Windows 11 Enterprise")
    workstations_count: int = Field(..., ge=0)
    servers_count: int = Field(..., ge=0)


class ClientOsCensusResponse(BaseModel):
    id: int
    os_name: str
    workstations_count: int
    servers_count: int
    model_config = ConfigDict(from_attributes=True)


class OfficeSoftwareCreate(BaseModel):
    software_name: str = Field(..., example="Office Productivity Suite")
    license_count: int = Field(..., ge=0)


class OfficeSoftwareResponse(BaseModel):
    id: int
    software_name: str
    license_count: int
    model_config = ConfigDict(from_attributes=True)


class IctStaffPositionCreate(BaseModel):
    position_title: str = Field(..., example="Information Technology Officer I")
    status: str = Field(..., example="Plantilla (Permanent)")
    count: int = Field(1, ge=0)


class IctStaffPositionResponse(IctStaffPositionCreate):
    id: Union[uuid.UUID, str]
    issp_period: str

    @field_validator('id', mode='before')
    @classmethod
    def coerce_id(cls, v: Any) -> Any:
        return coerce_optional_uuid(v)

    model_config = ConfigDict(from_attributes=True)


class AnnualCostBreakdownCreate(BaseModel):
    project_key: str = Field(..., example="Internet_Connectivity")
    cost_type: str = Field(..., example="Continuing")
    item_description: str = Field(..., example="Dedicated Leased Line Fiber")
    unit_cost: Decimal = Field(..., ge=0)
    yearly_quantities: Dict[str, int] = Field(default_factory=dict)


class AnnualCostBreakdownResponse(BaseModel):
    id: Union[uuid.UUID, str]
    issp_period: str
    project_key: str
    cost_type: str
    item_description: str
    unit_cost: Decimal
    yearly_quantities: Dict[str, int]

    @field_validator('id', mode='before')
    @classmethod
    def coerce_id(cls, v: Any) -> Any:
        return coerce_optional_uuid(v)

    @field_validator('yearly_quantities', mode='before')
    @classmethod
    def deserialize_fields(cls, v: Any) -> Dict[str, int]:
        parsed = deserialize_dict_if_string(v)
        res = {}
        for key, val in parsed.items():
            try:
                res[str(key).strip()] = int(val) if val is not None else 0
            except (ValueError, TypeError):
                res[str(key).strip()] = 0
        return res

    model_config = ConfigDict(from_attributes=True)