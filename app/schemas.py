# app/schemas.py
import uuid
import html
import json
import enum
from datetime import datetime
from decimal import Decimal
from typing import Optional, List, Dict, Any, Union
from pydantic import BaseModel, Field, EmailStr, field_validator, model_validator, ConfigDict

from app.config import settings

# Import canonical enums directly from database models as the single source of truth
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
    ScopeChoice,
    NodeType,
    PageOrientation,
    ContentType,
    AssetRole
)

# DICT Annex 1 Standard Inventory Classification Catalog
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
    """
    Coerces empty strings, whitespace, or string representations of null
    ('null', 'none', 'undefined', '') into None.
    """
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
    """
    Safely converts empty strings, string UUIDs, or None to Optional[uuid.UUID] or string.
    Prevents Pydantic validation failures when frontend components submit empty selectors.
    """
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
    """
    Bi-directional, case-insensitive enum coercion.
    Resolves member names, values, and SafeEnumStr instances seamlessly.
    """
    if v is None:
        return None
    if isinstance(v, enum_cls):
        return v
    v_str = str(getattr(v, "value", v)).strip()
    if not v_str or v_str.lower() in ("none", "null", "undefined", ""):
        return None

    # 1. Exact value or name match
    for member in enum_cls:
        if member.value == v_str or member.name == v_str:
            return member

    # 2. Case-insensitive value or name match
    v_lower = v_str.lower()
    for member in enum_cls:
        if member.value.lower() == v_lower or member.name.lower() == v_lower:
            return member

    # 3. Normalized underscore/space match
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
        return v


# ==========================================================
# 0. DOCUMENT TREE ARCHITECTURE SCHEMAS
# ==========================================================

class IsspVocabularyBase(BaseModel):
    display_title: str = Field(..., max_length=255, description="Official DICT title header")
    toc_label: str = Field(..., max_length=255, description="Short label for Table of Contents")


class IsspVocabularyCreate(IsspVocabularyBase):
    pass


class IsspVocabularyResponse(IsspVocabularyBase):
    id: int
    node_id: int
    model_config = ConfigDict(from_attributes=True)


class IsspContentBase(BaseModel):
    content_type: ContentType
    json_data: Dict[str, Any] = Field(..., description="Structured JSON payload")

    @field_validator('content_type', mode='before')
    @classmethod
    def coerce_content_type(cls, v: Any) -> Any:
        return coerce_enum(ContentType, v)


class IsspContentCreate(IsspContentBase):
    pass


class IsspContentResponse(IsspContentBase):
    id: int
    node_id: int
    model_config = ConfigDict(from_attributes=True)


class IsspAssetBase(BaseModel):
    file_path: str = Field(..., max_length=255, description="S3 or local storage URL")
    asset_role: AssetRole
    custom_title: Optional[str] = Field(None, max_length=255, description="Header text for full page diagrams")
    aspect_ratio_preserve: bool = Field(True, description="Enforce aspect ratio bounds")

    @field_validator('asset_role', mode='before')
    @classmethod
    def coerce_asset_role(cls, v: Any) -> Any:
        return coerce_enum(AssetRole, v)


class IsspAssetCreate(IsspAssetBase):
    node_id: int


class IsspAssetResponse(IsspAssetBase):
    id: int
    node_id: int
    model_config = ConfigDict(from_attributes=True)


class IsspNodeBase(BaseModel):
    node_type: NodeType
    system_key: str = Field(..., max_length=100, description="Unique system lookup key")
    sequence_order: Decimal = Field(..., description="Decimal sorting order index")
    page_orientation: PageOrientation = Field(PageOrientation.LANDSCAPE)
    force_page_break: bool = Field(False)

    @field_validator('node_type', mode='before')
    @classmethod
    def coerce_node_type(cls, v: Any) -> Any:
        return coerce_enum(NodeType, v)

    @field_validator('page_orientation', mode='before')
    @classmethod
    def coerce_page_orientation(cls, v: Any) -> Any:
        return coerce_enum(PageOrientation, v) or PageOrientation.LANDSCAPE


class IsspNodeCreate(IsspNodeBase):
    parent_id: Optional[int] = None


class IsspNodeUpdate(BaseModel):
    node_type: Optional[NodeType] = None
    system_key: Optional[str] = None
    sequence_order: Optional[Decimal] = None
    page_orientation: Optional[PageOrientation] = None
    force_page_break: Optional[bool] = None
    parent_id: Optional[int] = None

    @field_validator('node_type', mode='before')
    @classmethod
    def coerce_node_type(cls, v: Any) -> Any:
        return coerce_enum(NodeType, v)

    @field_validator('page_orientation', mode='before')
    @classmethod
    def coerce_page_orientation(cls, v: Any) -> Any:
        return coerce_enum(PageOrientation, v)


class IsspNodeReorderPayload(BaseModel):
    node_id: int
    parent_id: Optional[int] = None
    sequence_order: Decimal


class IsspNodeResponse(IsspNodeBase):
    id: int
    parent_id: Optional[int] = None
    created_at: datetime
    vocabulary: Optional[IsspVocabularyResponse] = None
    contents: List[IsspContentResponse] = []
    assets: List[IsspAssetResponse] = []
    children: List["IsspNodeResponse"] = []
    model_config = ConfigDict(from_attributes=True)


IsspNodeResponse.model_rebuild()


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
    item_name: str = Field(..., max_length=200, description="Name of Unit / ICT Resource Description")
    dict_category: Optional[DictAssetCategory] = Field(
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
    status: AssetStatus = Field(default=AssetStatus.FUNCTIONAL, description="Operational Condition")
    date_acquired: datetime = Field(default_factory=datetime.utcnow, description="Date Acquired")
    acquired_price: Decimal = Field(default=Decimal("0.00"), ge=0, description="Historical Acquisition Price (PHP)")
    office_location: OfficeLocation = Field(default=OfficeLocation.CENTRAL_OFFICE)
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
        return coerce_enum(AssetStatus, v) or AssetStatus.FUNCTIONAL

    @field_validator('office_location', mode='before')
    @classmethod
    def coerce_location(cls, v: Any) -> Any:
        return coerce_enum(OfficeLocation, v) or OfficeLocation.CENTRAL_OFFICE

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
    outcome_name: str = Field(..., max_length=255, example="Public Service Modernization Program")
    description: Optional[str] = Field(None, example="Quality frontline public service delivery and administrative operations.")


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
    complexity_incoming: TransactionComplexity = Field(default=TransactionComplexity.SIMPLE)
    transaction_processed_outgoing: Optional[str] = Field(None, example="Permits, Clearances, Certificates, and Statements")
    complexity_outgoing: TransactionComplexity = Field(default=TransactionComplexity.SIMPLE)

    @field_validator('complexity_incoming', 'complexity_outgoing', mode='before')
    @classmethod
    def coerce_complexity_enums(cls, v: Any) -> Any:
        return coerce_enum(TransactionComplexity, v)


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
    mfo: str = Field(..., example="Frontline Service Modernization")
    critical_system: str = Field(..., example="Enterprise Resource Planning System")
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
    program_name: str = Field(..., example="eGovPay")
    is_utilized: bool = Field(default=False)
    url_or_system_name: Optional[str] = None
    equivalent_system_details: Optional[str] = None
    is_manual: bool = Field(default=False, description="Manual processing / transaction in place")
    is_proposed_development: bool = Field(default=False, description="Proposed development of equivalent system")
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


class EGovernmentChecklistResponse(EGovernmentChecklistCreate):
    id: int
    issp_period: str
    model_config = ConfigDict(from_attributes=True)


# ==========================================================
# 6. PART II.C & III.D: INFORMATION SYSTEMS
# ==========================================================

class InformationSystemCreate(BaseModel):
    strategic_concern_id: Optional[Union[uuid.UUID, str]] = None
    name: str = Field(..., max_length=255, example="Enterprise Document Management System")
    status: SystemStatus = Field(default=SystemStatus.OPERATIONAL)
    classification: SystemClassification = Field(default=SystemClassification.OPERATIONS_FRONTLINE)
    hosting_type: SystemHostingType = Field(default=SystemHostingType.HYBRID)
    online_url: Optional[str] = None
    description_and_purpose: str = Field(default="")
    enhancement_details: Optional[str] = Field(default=None, description="Details of enhancements to be done when status is 'For Enhancement'")
    development_strategy: DevelopmentStrategy = Field(default=DevelopmentStrategy.OUTSOURCED)
    development_platform: str = Field(default="", example="Python FastAPI, React, PostgreSQL")
    database_name: str = Field(default="", example="production_db")
    data_storage_type: str = Field(default="", example="Enterprise Cloud Storage")
    internal_users: str = Field(default="", example="Administrative Staff, Division Officers")
    external_users: str = Field(default="", example="General Public, Commercial Entities")
    system_owner_office: str = Field(default="", example="Management Information Systems Division")
    is_integrated_with_others: bool = Field(default=False)
    internal_integrated_systems: Optional[str] = None
    external_integrated_systems: Optional[str] = None
    generates_data_for_others: bool = Field(default=False)
    processes_data_from_others: bool = Field(default=False)
    is_deployed_on_shared_platform: bool = Field(default=False)
    processes_personal_information: bool = Field(default=False)
    has_undergone_pia: bool = Field(default=False)

    @field_validator('strategic_concern_id', mode='before')
    @classmethod
    def coerce_concern_id(cls, v: Any) -> Any:
        return coerce_optional_uuid(v)

    @field_validator('status', mode='before')
    @classmethod
    def coerce_status(cls, v: Any) -> Any:
        return coerce_enum(SystemStatus, v) or SystemStatus.OPERATIONAL

    @field_validator('classification', mode='before')
    @classmethod
    def coerce_classification(cls, v: Any) -> Any:
        return coerce_enum(SystemClassification, v)

    @field_validator('hosting_type', mode='before')
    @classmethod
    def coerce_hosting(cls, v: Any) -> Any:
        return coerce_enum(SystemHostingType, v) or SystemHostingType.HYBRID

    @field_validator('development_strategy', mode='before')
    @classmethod
    def coerce_strategy(cls, v: Any) -> Any:
        return coerce_enum(DevelopmentStrategy, v)


class InformationSystemUpdate(BaseModel):
    strategic_concern_id: Optional[Union[uuid.UUID, str]] = None
    name: Optional[str] = None
    status: Optional[SystemStatus] = None
    classification: Optional[SystemClassification] = None
    hosting_type: Optional[SystemHostingType] = None
    online_url: Optional[str] = None
    description_and_purpose: Optional[str] = None
    enhancement_details: Optional[str] = None
    development_strategy: Optional[DevelopmentStrategy] = None
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

    @field_validator('strategic_concern_id', mode='before')
    @classmethod
    def coerce_concern_id(cls, v: Any) -> Any:
        return coerce_optional_uuid(v)

    @field_validator('status', mode='before')
    @classmethod
    def coerce_status(cls, v: Any) -> Any:
        return coerce_enum(SystemStatus, v)

    @field_validator('classification', mode='before')
    @classmethod
    def coerce_classification(cls, v: Any) -> Any:
        return coerce_enum(SystemClassification, v)

    @field_validator('hosting_type', mode='before')
    @classmethod
    def coerce_hosting(cls, v: Any) -> Any:
        return coerce_enum(SystemHostingType, v)

    @field_validator('development_strategy', mode='before')
    @classmethod
    def coerce_strategy(cls, v: Any) -> Any:
        return coerce_enum(DevelopmentStrategy, v)


class InformationSystemResponse(InformationSystemCreate):
    id: Union[uuid.UUID, str]
    issp_period: str

    @field_validator('id', 'strategic_concern_id', mode='before')
    @classmethod
    def coerce_ids(cls, v: Any) -> Any:
        return coerce_optional_uuid(v) or v

    model_config = ConfigDict(from_attributes=True)


# ==========================================================
# 7. PART III.E & III.F: ICT PROJECTS & PMF
# ==========================================================

class IctProjectCreate(BaseModel):
    system_id: Optional[Union[uuid.UUID, str]] = None
    project_title: str = Field(..., max_length=255, example="Enterprise Cloud Infrastructure Modernization")
    project_category: ProjectCategory = Field(default=ProjectCategory.INTERNAL_ICT_PROJECT)
    description: Optional[str] = Field(default="")
    objectives: Optional[str] = Field(default="")
    aligns_pip: bool = Field(default=False)
    aligns_ncsp: bool = Field(default=False)
    aligns_egmp: bool = Field(default=False)
    aligns_pcb: bool = Field(default=False)
    aligns_others: bool = Field(default=False, description="DICT Part III.E Strategic Alignment 'Others (Specify)'")
    aligns_others_specify: Optional[str] = Field(default=None, max_length=255, description="Specific program if aligns_others is True")
    harmonizes_national_priority: bool = Field(default=False)
    harmonizes_resource_optimization: bool = Field(default=False)
    harmonizes_pegif: bool = Field(default=False)
    harmonizes_cross_collaboration: bool = Field(default=False)
    harmonizes_scalability: bool = Field(default=False)
    duration_start_year: Optional[int] = Field(default=2026, example=2026)
    duration_end_year: Optional[int] = Field(default=2028, example=2028)
    
    # Dynamic annual deliverables dictionary supporting arbitrary year spans (1 to N years)
    annual_deliverables: Dict[str, str] = Field(
        default_factory=dict, 
        description="Dynamic year-keyed deliverables map, e.g. {'Year 1': '...', 'Year 2': '...'}"
    )
    
    # Backward-compatible properties for 3-year templates
    year_1_deliverables: Optional[str] = Field(default="")
    year_2_deliverables: Optional[str] = Field(default="")
    year_3_deliverables: Optional[str] = Field(default="")
    
    implementing_unit: Optional[str] = Field(default="ICT Management Office")
    funding_source: FundSource = Field(default=FundSource.GAA)
    lead_agency: Optional[str] = None
    partner_agencies: Optional[str] = None

    @field_validator('system_id', mode='before')
    @classmethod
    def coerce_system_id(cls, v: Any) -> Any:
        return coerce_optional_uuid(v)

    @field_validator('project_category', mode='before')
    @classmethod
    def coerce_proj_cat(cls, v: Any) -> Any:
        return coerce_enum(ProjectCategory, v) or ProjectCategory.INTERNAL_ICT_PROJECT

    @field_validator('funding_source', mode='before')
    @classmethod
    def coerce_funding(cls, v: Any) -> Any:
        return coerce_enum(FundSource, v) or FundSource.GAA

    @field_validator('annual_deliverables', mode='before')
    @classmethod
    def deserialize_annual_deliverables(cls, v: Any) -> Dict[str, str]:
        parsed = deserialize_dict_if_string(v)
        return {str(k): str(val) for k, val in parsed.items()} if parsed else {}

    @model_validator(mode='after')
    def sync_deliverables(self) -> 'IctProjectCreate':
        if not self.annual_deliverables:
            deliverables = {}
            if self.year_1_deliverables:
                deliverables["Year 1"] = self.year_1_deliverables
            if self.year_2_deliverables:
                deliverables["Year 2"] = self.year_2_deliverables
            if self.year_3_deliverables:
                deliverables["Year 3"] = self.year_3_deliverables
            self.annual_deliverables = deliverables
        else:
            if not self.year_1_deliverables and "Year 1" in self.annual_deliverables:
                self.year_1_deliverables = self.annual_deliverables["Year 1"]
            if not self.year_2_deliverables and "Year 2" in self.annual_deliverables:
                self.year_2_deliverables = self.annual_deliverables["Year 2"]
            if not self.year_3_deliverables and "Year 3" in self.annual_deliverables:
                self.year_3_deliverables = self.annual_deliverables["Year 3"]
        return self


class IctProjectUpdate(BaseModel):
    system_id: Optional[Union[uuid.UUID, str]] = None
    project_title: Optional[str] = None
    project_category: Optional[ProjectCategory] = None
    description: Optional[str] = None
    objectives: Optional[str] = None
    aligns_pip: Optional[bool] = None
    aligns_ncsp: Optional[bool] = None
    aligns_egmp: Optional[bool] = None
    aligns_pcb: Optional[bool] = None
    aligns_others: Optional[bool] = None
    aligns_others_specify: Optional[str] = None
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
    funding_source: Optional[FundSource] = None
    lead_agency: Optional[str] = None
    partner_agencies: Optional[str] = None

    @field_validator('system_id', mode='before')
    @classmethod
    def coerce_system_id(cls, v: Any) -> Any:
        return coerce_optional_uuid(v)

    @field_validator('project_category', mode='before')
    @classmethod
    def coerce_proj_cat(cls, v: Any) -> Any:
        return coerce_enum(ProjectCategory, v)

    @field_validator('funding_source', mode='before')
    @classmethod
    def coerce_funding(cls, v: Any) -> Any:
        return coerce_enum(FundSource, v)

    @field_validator('annual_deliverables', mode='before')
    @classmethod
    def deserialize_annual_deliverables(cls, v: Any) -> Optional[Dict[str, str]]:
        if v is None:
            return None
        parsed = deserialize_dict_if_string(v)
        return {str(k): str(val) for k, val in parsed.items()} if parsed else {}


class IctProjectResponse(IctProjectCreate):
    id: Union[uuid.UUID, str]
    issp_period: str
    computed_total_project_cost: Decimal = Decimal("0.00")

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
    name: str = Field(..., example="National Single Window Data Exchange")
    objectives: str = Field(default="")
    duration: str = Field(default="2026-2028", example="2026-2028")
    deliverables: str = Field(default="")
    lead_agency: str = Field(default="DICT", example="DICT")
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
    project_title: str = Field(..., example="Enterprise Cloud Infrastructure Modernization")
    result_hierarchy: str = Field(default="Immediate Outcome", example="Immediate Outcome")
    indicator: str = Field(..., example="Average transaction completion duration reduction")
    baseline: str = Field(..., example="3 working days")
    target: str = Field(..., example="Under 15 minutes")
    collection_method: str = Field(..., example="Automated application APM analytics")
    responsibility: str = Field(..., example="ICT Management Division")

    @field_validator('project_id', mode='before')
    @classmethod
    def coerce_project_id(cls, v: Any) -> Any:
        return coerce_optional_uuid(v)


class PerformanceMetricResponse(BaseModel):
    id: Union[uuid.UUID, str]
    issp_period: str
    project_id: Optional[Union[uuid.UUID, str]] = None
    project_title: str
    result_hierarchy: str
    indicator: str
    baseline: str
    target: str
    collection_method: str
    responsibility: str

    @field_validator('id', 'project_id', mode='before')
    @classmethod
    def coerce_ids(cls, v: Any) -> Any:
        return coerce_optional_uuid(v) or v

    model_config = ConfigDict(from_attributes=True)


# ==========================================================
# 8. PART IV.A: RESOURCE REQUIREMENTS (UNIFIED CAPEX & MOOE)
# ==========================================================

class ProposalCreatePayload(BaseModel):
    outcome_id: int = Field(..., description="Target Organizational Outcome ID (Broader Scope)")
    department_id: Optional[int] = Field(None, description="Target Department ID (Admin assignment)")
    needs_assessment_id: Optional[Union[uuid.UUID, str]] = Field(None, description="Linked Department Needs Assessment")
    subscription_type: Optional[str] = Field(None, description="Subscription type designation")
    project_key: Optional[str] = Field(None, description="Project key identifier")
    
    category: ProposalCategory = Field(default=ProposalCategory.HARDWARE, description="Hardware, Software, or Subscription")
    strategic_category: ProjectCategory = Field(default=ProjectCategory.OFFICE_PRODUCTIVITY)
    office_location: OfficeLocation = Field(default=OfficeLocation.CENTRAL_OFFICE)
    fund_source: FundSource = Field(default=FundSource.GAA)
    
    item_select: str = Field(default="other", description="Catalog key identifier ('other' for custom requests)")
    item_name: str = Field(..., max_length=200, description="Name and description of item requested")
    unit_cost: Decimal = Field(..., ge=0, description="Unit cost in Philippine Peso (PHP)")

    yearly_quantities: Dict[str, int] = Field(default_factory=dict, description="Arbitrary year mapping, e.g. {'2026': 5, '2027': 2, ...}")
    year_1_qty: int = Field(default=0, ge=0)
    year_2_qty: int = Field(default=0, ge=0)
    year_3_qty: int = Field(default=0, ge=0)

    project_id: Optional[Union[uuid.UUID, str]] = Field(None, description="Linked Strategic ICT Project ID")
    justification: Optional[str] = Field(None, description="Detailed technical justification")

    system_development_status: SystemDevelopmentStatus = Field(
        default=SystemDevelopmentStatus.NOT_APPLICABLE,
        description="For Development / For Enhancement if budget >= ₱2,000,000.00"
    )

    created_by_students: bool = Field(
        default=False, 
        description="If True, item is Capital Outlay and bypasses market quotation canvas requirements"
    )
    is_in_house_turnover: Optional[bool] = Field(
        default=None, 
        description="Generic public-sector alias for internally developed / non-commercial asset turnovers"
    )

    canvas_evidence_url: Optional[str] = None
    canvas_expiration_date: Optional[datetime] = None
    is_expansion: bool = Field(default=False, description="True if adding new capacity rather than replacing retired units")

    uacs_object_code: Optional[UacsObjectCode] = None
    expenditure_class: Optional[ExpenditureClass] = None

    @field_validator('project_id', 'needs_assessment_id', mode='before')
    @classmethod
    def coerce_uuid_selectors(cls, v: Any) -> Any:
        return coerce_optional_uuid(v)

    @field_validator('category', mode='before')
    @classmethod
    def coerce_category(cls, v: Any) -> Any:
        return coerce_enum(ProposalCategory, v) or ProposalCategory.HARDWARE

    @field_validator('strategic_category', mode='before')
    @classmethod
    def coerce_strategic_cat(cls, v: Any) -> Any:
        return coerce_enum(ProjectCategory, v) or ProjectCategory.OFFICE_PRODUCTIVITY

    @field_validator('office_location', mode='before')
    @classmethod
    def coerce_location(cls, v: Any) -> Any:
        return coerce_enum(OfficeLocation, v) or OfficeLocation.CENTRAL_OFFICE

    @field_validator('fund_source', mode='before')
    @classmethod
    def coerce_fund_source(cls, v: Any) -> Any:
        return coerce_enum(FundSource, v) or FundSource.GAA

    @field_validator('system_development_status', mode='before')
    @classmethod
    def coerce_dev_status(cls, v: Any) -> Any:
        return coerce_enum(SystemDevelopmentStatus, v) or SystemDevelopmentStatus.NOT_APPLICABLE

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
                res[str(key)] = int(val) if val is not None else 0
            except (ValueError, TypeError):
                res[str(key)] = 0
        return res

    @model_validator(mode='after')
    def validate_and_classify_outlays(self) -> 'ProposalCreatePayload':
        if self.is_in_house_turnover is not None and not self.created_by_students:
            self.created_by_students = self.is_in_house_turnover
        elif self.created_by_students and self.is_in_house_turnover is None:
            self.is_in_house_turnover = True

        if self.yearly_quantities and len(self.yearly_quantities) > 0:
            years_sorted = sorted([k for k in self.yearly_quantities.keys() if str(k).isdigit()])
            if len(years_sorted) >= 1:
                self.year_1_qty = int(self.yearly_quantities.get(years_sorted[0], 0) or 0)
            if len(years_sorted) >= 2:
                self.year_2_qty = int(self.yearly_quantities.get(years_sorted[1], 0) or 0)
            if len(years_sorted) >= 3:
                self.year_3_qty = int(self.yearly_quantities.get(years_sorted[2], 0) or 0)
        else:
            self.yearly_quantities = {
                "Year 1": self.year_1_qty,
                "Year 2": self.year_2_qty,
                "Year 3": self.year_3_qty
            }

        total_qty = sum(int(v) for v in self.yearly_quantities.values() if v is not None and (isinstance(v, int) or str(v).isdigit()))
        total_outlay = self.unit_cost * Decimal(total_qty)

        if self.created_by_students:
            self.expenditure_class = ExpenditureClass.CAPITAL_OUTLAY
            self.uacs_object_code = UacsObjectCode.ICT_SOFTWARE
        else:
            CAPITALIZATION_THRESHOLD = Decimal("50000.00")
            item_lower = (self.item_name or "").lower()

            if self.category == ProposalCategory.SUBSCRIPTION:
                self.expenditure_class = ExpenditureClass.MOOE
                self.uacs_object_code = UacsObjectCode.ICT_SOFTWARE_SUBSCRIPTION
            elif self.unit_cost >= CAPITALIZATION_THRESHOLD:
                self.expenditure_class = ExpenditureClass.CAPITAL_OUTLAY
                if "printer" in item_lower or "scanner" in item_lower or "plotter" in item_lower:
                    self.uacs_object_code = UacsObjectCode.PRINTING_EQUIPMENT
                elif "software" in item_lower:
                    self.uacs_object_code = UacsObjectCode.ICT_SOFTWARE
                else:
                    self.uacs_object_code = UacsObjectCode.ICT_EQUIPMENT
            else:
                self.expenditure_class = ExpenditureClass.MOOE
                if "printer" in item_lower or "scanner" in item_lower or "plotter" in item_lower:
                    self.uacs_object_code = UacsObjectCode.SEMI_EXPENDABLE_PRINTING
                elif "subscription" in item_lower or "cloud" in item_lower or "suite" in item_lower:
                    self.uacs_object_code = UacsObjectCode.ICT_SOFTWARE_SUBSCRIPTION
                elif "training" in item_lower or "seminar" in item_lower or "workshop" in item_lower:
                    self.uacs_object_code = UacsObjectCode.ICT_TRAINING
                elif "contractor" in item_lower or "development" in item_lower:
                    self.uacs_object_code = UacsObjectCode.ICT_CONSULTING_DEVELOPMENT
                else:
                    self.uacs_object_code = UacsObjectCode.SEMI_EXPENDABLE_ICT

            if self.item_select == "other":
                if not self.justification or len(self.justification.strip()) < 5:
                    raise ValueError("Technical specifications and justification are mandatory for custom requests.")

        if total_outlay >= Decimal("2000000.00") and self.system_development_status == SystemDevelopmentStatus.NOT_APPLICABLE:
            raise ValueError(
                "Proposals with total outlays exceeding ₱2,000,000.00 require a System Development Status option "
                "('For Development' or 'For Enhancement') per DICT guidelines."
            )

        return self


class ProposalResponse(BaseModel):
    id: Union[uuid.UUID, str]
    department_id: int
    issp_period: str
    outcome_id: int
    project_id: Optional[Union[uuid.UUID, str]] = None
    needs_assessment_id: Optional[Union[uuid.UUID, str]] = None
    
    category: ProposalCategory = ProposalCategory.HARDWARE
    strategic_category: ProjectCategory = ProjectCategory.OFFICE_PRODUCTIVITY
    office_location: OfficeLocation = OfficeLocation.CENTRAL_OFFICE
    fund_source: FundSource = FundSource.GAA
    uacs_object_code: UacsObjectCode = UacsObjectCode.ICT_EQUIPMENT
    expenditure_class: ExpenditureClass = ExpenditureClass.CAPITAL_OUTLAY
    status: ProposalStatus = ProposalStatus.DRAFT
    
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
    system_development_status: SystemDevelopmentStatus = SystemDevelopmentStatus.NOT_APPLICABLE
    created_by_students: bool = False
    is_in_house_turnover: bool = False
    
    target_office_automated: Optional[str] = None
    canvas_evidence_url: Optional[str] = None
    canvas_expiration_date: Optional[datetime] = None
    
    version: int = 1
    is_archived: bool = False
    is_expansion: bool = False
    outcome: Optional[OrganizationalOutcomeResponse] = None

    @field_validator('id', 'project_id', 'needs_assessment_id', mode='before')
    @classmethod
    def coerce_uuid_fields(cls, v: Any) -> Any:
        return coerce_optional_uuid(v) or v

    @field_validator('category', mode='before')
    @classmethod
    def coerce_category(cls, v: Any) -> Any:
        return coerce_enum(ProposalCategory, v) or ProposalCategory.HARDWARE

    @field_validator('strategic_category', mode='before')
    @classmethod
    def coerce_strategic_category(cls, v: Any) -> Any:
        return coerce_enum(ProjectCategory, v) or ProjectCategory.OFFICE_PRODUCTIVITY

    @field_validator('office_location', mode='before')
    @classmethod
    def coerce_office_location(cls, v: Any) -> Any:
        return coerce_enum(OfficeLocation, v) or OfficeLocation.CENTRAL_OFFICE

    @field_validator('fund_source', mode='before')
    @classmethod
    def coerce_fund_source(cls, v: Any) -> Any:
        return coerce_enum(FundSource, v) or FundSource.GAA

    @field_validator('uacs_object_code', mode='before')
    @classmethod
    def coerce_uacs(cls, v: Any) -> Any:
        return coerce_enum(UacsObjectCode, v) or UacsObjectCode.ICT_EQUIPMENT

    @field_validator('expenditure_class', mode='before')
    @classmethod
    def coerce_exp_class(cls, v: Any) -> Any:
        return coerce_enum(ExpenditureClass, v) or ExpenditureClass.CAPITAL_OUTLAY

    @field_validator('status', mode='before')
    @classmethod
    def coerce_status(cls, v: Any) -> Any:
        return coerce_enum(ProposalStatus, v) or ProposalStatus.DRAFT

    @field_validator('system_development_status', mode='before')
    @classmethod
    def coerce_dev_status(cls, v: Any) -> Any:
        return coerce_enum(SystemDevelopmentStatus, v) or SystemDevelopmentStatus.NOT_APPLICABLE

    @field_validator('yearly_quantities', mode='before')
    @classmethod
    def deserialize_yearly_quantities(cls, v: Any) -> Dict[str, int]:
        parsed = deserialize_dict_if_string(v)
        res = {}
        for key, val in parsed.items():
            try:
                res[str(key)] = int(val) if val is not None else 0
            except (ValueError, TypeError):
                res[str(key)] = 0
        return res

    @model_validator(mode='after')
    def sync_aliases(self) -> 'ProposalResponse':
        self.is_in_house_turnover = self.created_by_students
        return self

    model_config = ConfigDict(from_attributes=True)


class AdminOverridePayload(BaseModel):
    item_name: Optional[str] = None
    unit_cost: Optional[Decimal] = Field(None, ge=0)
    year_1_qty: Optional[int] = Field(None, ge=0)
    year_2_qty: Optional[int] = Field(None, ge=0)
    year_3_qty: Optional[int] = Field(None, ge=0)
    yearly_quantities: Optional[Dict[str, int]] = None
    justification: Optional[str] = None
    project_id: Optional[Union[uuid.UUID, str]] = None
    needs_assessment_id: Optional[Union[uuid.UUID, str]] = None
    category: Optional[ProposalCategory] = None
    strategic_category: Optional[ProjectCategory] = None
    fund_source: Optional[FundSource] = None
    office_location: Optional[OfficeLocation] = None
    system_development_status: Optional[SystemDevelopmentStatus] = None
    created_by_students: Optional[bool] = None
    is_in_house_turnover: Optional[bool] = None

    @field_validator('project_id', 'needs_assessment_id', mode='before')
    @classmethod
    def coerce_project_id(cls, v: Any) -> Any:
        return coerce_optional_uuid(v)

    @field_validator('category', mode='before')
    @classmethod
    def coerce_category(cls, v: Any) -> Any:
        return coerce_enum(ProposalCategory, v)

    @field_validator('strategic_category', mode='before')
    @classmethod
    def coerce_strategic_cat(cls, v: Any) -> Any:
        return coerce_enum(ProjectCategory, v)

    @field_validator('fund_source', mode='before')
    @classmethod
    def coerce_fund_source(cls, v: Any) -> Any:
        return coerce_enum(FundSource, v)

    @field_validator('office_location', mode='before')
    @classmethod
    def coerce_location(cls, v: Any) -> Any:
        return coerce_enum(OfficeLocation, v)

    @field_validator('system_development_status', mode='before')
    @classmethod
    def coerce_dev_status(cls, v: Any) -> Any:
        return coerce_enum(SystemDevelopmentStatus, v)

    @field_validator('yearly_quantities', mode='before')
    @classmethod
    def deserialize_quantities(cls, v: Any) -> Optional[Dict[str, int]]:
        if v is None:
            return None
        parsed = deserialize_dict_if_string(v)
        res = {}
        for key, val in parsed.items():
            try:
                res[str(key)] = int(val) if val is not None else 0
            except (ValueError, TypeError):
                res[str(key)] = 0
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
    year_columns: List[str] = Field(default_factory=list, description="Dynamic list of fiscal year column headers, e.g. ['FY 2026', 'FY 2027', ...]")


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
    system_name: str = Field(..., example="Frontline Service Portal")
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
# 11. NEEDS ASSESSMENT & DEPARTMENT JUSTIFICATIONS
# ==========================================================

class NeedsAssessmentCreate(BaseModel):
    title: str = Field(..., example="High-Performance Laboratory Network Upgrade")
    mfo_alignment: str = Field(..., example="General Public Service Modernization")
    current_problem: str = Field(...)
    proposed_solution: str = Field(...)
    expected_impacts: List[str] = Field(default=[])
    other_impact: Optional[str] = None


class NeedsAssessmentResponse(BaseModel):
    id: Union[uuid.UUID, str]
    department_id: int
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
    mfo: str = Field(..., example="Public Service Modernization")
    critical_system: str = Field(..., example="Operational Infrastructure Cluster")
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
    model_config = ConfigDict(from_attributes=True)


class UpdateCeilingPayload(BaseModel):
    department_id: int
    allocated_capex: Decimal = Field(default=Decimal("0.00"), ge=0)
    allocated_mooe: Decimal = Field(default=Decimal("0.00"), ge=0)
    sub_ceiling: Optional[Decimal] = None

    @model_validator(mode='after')
    def resolve_sub_ceiling_assignment(self) -> 'UpdateCeilingPayload':
        """
        Ensures sub_ceiling matches allocated_capex and allocated_mooe without
        forcing an arbitrary 70/30 split ratio.
        """
        if self.sub_ceiling is not None and self.allocated_capex == Decimal("0.00") and self.allocated_mooe == Decimal("0.00"):
            self.allocated_capex = Decimal(str(self.sub_ceiling)).quantize(Decimal("0.01"))
            self.allocated_mooe = Decimal("0.00")
        return self


class UpdateGlobalCeilingPayload(BaseModel):
    global_ceiling: Decimal = Field(..., gt=0)


class BulkCeilingValidationPayload(BaseModel):
    issp_period: Optional[str] = Field(default="2026-2028")
    department_ids: Optional[List[int]] = Field(default_factory=list)


# ==========================================================
# 13. MASTER NARRATIVES (DICT v.2026 STANDARDIZED SCHEMAS)
# ==========================================================

class ISPlannerSchema(BaseModel):
    name: str = Field(..., example="Information Systems Planner")
    position: str = Field(..., example="Lead Systems Analyst")
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
    academic_regular: Optional[int] = Field(default=0, ge=0)
    academic_casual: Optional[int] = Field(default=0, ge=0)


class MasterNarrativeUpdate(BaseModel):
    agency_name: Optional[str] = None
    issp_period_from: Optional[int] = Field(None, example=2026)
    issp_period_to: Optional[int] = Field(None, example=2028)
    agency_website_url: Optional[str] = None
    website_url: Optional[str] = None
    
    # Template Page 1 Scope & Amendment Indicators
    is_amendment: Optional[bool] = False
    amendment_number: Optional[str] = None
    scope_choice: Optional[Union[ScopeChoice, str]] = ScopeChoice.DEPARTMENT_WIDE
    scope_json: Optional[Dict[str, Any]] = Field(default_factory=dict)
    is_active: Optional[bool] = False

    # Preparer / Signatory
    signatory_prepared_by: Optional[str] = None
    preparer_position: Optional[str] = None
    preparer_tel: Optional[str] = None
    preparer_fax: Optional[str] = None
    preparer_email: Optional[str] = None

    # Part I.B.1 CIO Specifics
    cio_name: Optional[str] = None
    cio_plantilla_position: Optional[str] = None
    cio_organizational_unit: Optional[str] = None
    cio_email: Optional[str] = None
    cio_contact_no: Optional[str] = None

    # Part I.B.1 Alternate ISSP Focal Person Specifics
    focal_name: Optional[str] = None
    focal_position: Optional[str] = None
    focal_organizational_unit: Optional[str] = None
    focal_email: Optional[str] = None
    focal_contact_no: Optional[str] = None

    # Head of Agency
    head_of_agency_name: Optional[str] = None
    agency_head_position: Optional[str] = Field(None, description="Official title/position of the Head of Agency")
    signatory_approved_by: Optional[str] = None

    # Part I.A Mandates
    mandate_html: Optional[str] = ""
    legal_basis: Optional[str] = None
    functions: Optional[str] = None
    vision_html: Optional[str] = ""
    vision_statement: Optional[str] = None
    mission_html: Optional[str] = ""
    mission_statement: Optional[str] = None
    present_situation_html: Optional[str] = ""

    # Part III.B Enterprise Architecture Dynamic Narrative
    enterprise_architecture_narrative: Optional[str] = None

    # Official DICT v.2026 Core Schematics & Branding Seals (Diagram Vault)
    agency_logo_url: Optional[str] = None
    dict_logo_url: Optional[str] = None
    bagong_pilipinas_logo_url: Optional[str] = None
    cert_logo_url: Optional[str] = None
    network_diagram_url: Optional[str] = None       # Part II.B.1 Existing LAN/WAN Topology
    fiber_backbone_url: Optional[str] = None        # Part III.A.1 Proposed Network / Fiber Layout
    system_architecture_url: Optional[str] = None   # Part III.B Enterprise Architecture Schematic
    org_chart_url: Optional[str] = None             # Part I.B Overall Agency Org Structure
    proposed_ict_org_url: Optional[str] = None      # Part III.C Proposed ICT Unit Structure
    subsystem_network_layouts_json: Optional[List[Dict[str, Any]]] = Field(default_factory=list)

    # Annex 2 DRBCP Dynamic Sections (Sections 1 to 6)
    drbcp_approval_date: Optional[str] = Field(None, description="Official approval date of the DRBCP")
    drbcp_affected_assets_json: Optional[List[Any]] = None
    drbcp_recovery_strategy_html: Optional[str] = None
    drbcp_sop_phases_html: Optional[str] = None
    drbcp_compliance_narrative_html: Optional[str] = Field(None, description="MITHI Res 2025-01 / SPAR Reporting 4 Pillars")

    # Automated Lifecycle Archival Attributes
    is_archived: Optional[bool] = False
    final_pdf_vault_url: Optional[str] = None

    planners_json: Optional[List[ISPlannerSchema]] = Field(default=[])
    manpower_json: Optional[ManpowerSchema] = None
    annual_ict_budget: Optional[Decimal] = Decimal("0.00")

    @field_validator(
        'preparer_email', 'cio_email', 'focal_email', 'agency_website_url', 
        'website_url', 'agency_logo_url', 'dict_logo_url', 'bagong_pilipinas_logo_url', 
        'cert_logo_url', mode='before'
    )
    @classmethod
    def sanitize_emails_and_urls(cls, v: Any) -> Optional[str]:
        return clean_optional_string(v)

    @field_validator('scope_choice', mode='before')
    @classmethod
    def coerce_scope_choice(cls, v: Any) -> Any:
        return coerce_enum(ScopeChoice, v) or ScopeChoice.DEPARTMENT_WIDE

    @field_validator('drbcp_affected_assets_json', 'subsystem_network_layouts_json', mode='before')
    @classmethod
    def deserialize_json_lists(cls, v: Any) -> Any:
        return deserialize_list_if_string(v)

    @field_validator('scope_json', mode='before')
    @classmethod
    def deserialize_scope_json(cls, v: Any) -> Any:
        return deserialize_dict_if_string(v)


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
    
    # CIO Signatories
    signatory_prepared_by: Optional[str] = ""
    cio_name: Optional[str] = None
    preparer_position: Optional[str] = None
    cio_plantilla_position: Optional[str] = None
    cio_organizational_unit: Optional[str] = None
    preparer_email: Optional[str] = None
    cio_email: Optional[str] = None
    preparer_tel: Optional[str] = None
    cio_contact_no: Optional[str] = None

    # Alternate ISSP Focal Person
    focal_name: Optional[str] = None
    focal_position: Optional[str] = None
    focal_organizational_unit: Optional[str] = None
    focal_email: Optional[str] = None
    focal_contact_no: Optional[str] = None

    # Agency Head
    signatory_approved_by: Optional[str] = ""
    head_of_agency_name: Optional[str] = None
    agency_head_position: Optional[str] = None

    # Mandates
    mandate_html: Optional[str] = ""
    legal_basis: Optional[str] = None
    functions: Optional[str] = None
    vision_html: Optional[str] = ""
    vision_statement: Optional[str] = None
    mission_html: Optional[str] = ""
    mission_statement: Optional[str] = None
    present_situation_html: Optional[str] = None
    
    # Part III.B Enterprise Architecture Dynamic Narrative
    enterprise_architecture_narrative: Optional[str] = None

    # Official DICT v.2026 Core Schematics & Branding Seals
    agency_logo_url: Optional[str] = None
    dict_logo_url: Optional[str] = None
    bagong_pilipinas_logo_url: Optional[str] = None
    cert_logo_url: Optional[str] = None
    network_diagram_url: Optional[str] = None       # Part II.B.1 Existing Network Infrastructure Topology
    fiber_backbone_url: Optional[str] = None        # Part III.A.1 Proposed Network / Fiber Layout
    system_architecture_url: Optional[str] = None   # Part III.B Enterprise Architecture Schematic
    org_chart_url: Optional[str] = None             # Part I.B Agency Overall Org Structure
    proposed_ict_org_url: Optional[str] = None      # Part III.C Proposed ICT Unit Structure
    subsystem_network_layouts_json: List[Dict[str, Any]] = Field(default_factory=list)

    # Annex 2 DRBCP Dynamic Sections (Sections 1 to 6)
    drbcp_approval_date: Optional[str] = None
    drbcp_affected_assets_json: Optional[List[Any]] = Field(default_factory=list)
    drbcp_recovery_strategy_html: Optional[str] = None
    drbcp_sop_phases_html: Optional[str] = None
    drbcp_compliance_narrative_html: Optional[str] = None

    # Automated Lifecycle Archival Attributes
    is_archived: bool = False
    final_pdf_vault_url: Optional[str] = None

    planners_json: List[ISPlannerSchema] = []
    annual_ict_budget: Decimal = Decimal("0.00")

    @field_validator('scope_choice', mode='before')
    @classmethod
    def coerce_scope_choice(cls, v: Any) -> Any:
        return coerce_enum(ScopeChoice, v)

    @field_validator('drbcp_affected_assets_json', 'subsystem_network_layouts_json', mode='before')
    @classmethod
    def deserialize_json_lists(cls, v: Any) -> Any:
        return deserialize_list_if_string(v)

    @model_validator(mode='after')
    def populate_narrative_aliases(self) -> 'MasterNarrativeResponse':
        self.legal_basis = self.mandate_html
        self.vision_statement = self.vision_html
        self.mission_statement = self.mission_html
        self.cio_name = self.signatory_prepared_by
        self.cio_plantilla_position = self.preparer_position
        self.cio_email = self.preparer_email
        self.cio_contact_no = self.preparer_tel
        self.head_of_agency_name = self.signatory_approved_by
        if not self.agency_head_position:
            self.agency_head_position = getattr(settings, "DEFAULT_AGENCY_HEAD_TITLE", "Head of Agency")
        if not self.agency_name:
            self.agency_name = getattr(settings, "DEFAULT_AGENCY_NAME", "National Government Agency")
        self.website_url = self.agency_website_url
        return self

    model_config = ConfigDict(from_attributes=True)


class LifecycleRolloverResponse(BaseModel):
    status: str
    expired_cycle: Optional[str] = None
    new_active_cycle: Optional[str] = None
    message: Optional[str] = None
    final_pdf_vault_url: Optional[str] = None
    model_config = ConfigDict(from_attributes=True)


class SystemGovernanceSettings(BaseModel):
    global_budget_ceiling: Decimal = Field(default=Decimal("200000000.00"))
    issp_active_cycle: str = Field(default="2026-2028")
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
    author_role: RoleTag
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
    def coerce_role(cls, v: Any) -> Any:
        return coerce_enum(RoleTag, v)

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
    role_tag: RoleTag
    password: str = Field(..., min_length=8, description="Mandatory initial password set by Admin for manual onboarding")

    @field_validator('role_tag', mode='before')
    @classmethod
    def coerce_role(cls, v: Any) -> Any:
        return coerce_enum(RoleTag, v)


class WhitelistedUserUpdate(BaseModel):
    email: Optional[EmailStr] = None
    assigned_department_id: Optional[int] = None
    role_tag: Optional[RoleTag] = None
    password: Optional[str] = Field(None, min_length=8)

    @field_validator('role_tag', mode='before')
    @classmethod
    def coerce_role(cls, v: Any) -> Any:
        return coerce_enum(RoleTag, v)


class WhitelistedUserResponse(BaseModel):
    id: int
    email: EmailStr
    role_tag: RoleTag
    assigned_department_id: Optional[int] = None
    department_id: Optional[int] = None
    department_name: Optional[str] = None

    @field_validator('role_tag', mode='before')
    @classmethod
    def coerce_role(cls, v: Any) -> Any:
        return coerce_enum(RoleTag, v)

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
            "role_tag": getattr(data, "role_tag", None),
            "assigned_department_id": dept_id,
            "department_id": dept_id,
            "department_name": dept_name
        }

    model_config = ConfigDict(from_attributes=True)


# ==========================================================
# 15. AUXILIARY CENSUS & INSTITUTIONAL SCHEMAS
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
    status: str = Field(..., example="Plantilla")
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
                res[str(key)] = int(val) if val is not None else 0
            except (ValueError, TypeError):
                res[str(key)] = 0
        return res

    model_config = ConfigDict(from_attributes=True)