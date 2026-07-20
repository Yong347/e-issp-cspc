# app/schemas.py
import uuid
import html
from datetime import datetime
from decimal import Decimal
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field, EmailStr, field_validator, model_validator, ConfigDict

# Import settings to resolve Pylance undefined variable errors
from app.config import settings

# Import standard Enums directly from the Database models as the single source of truth
from app.database.models import RoleTag, ProposalStatus, AssetStatus, ScopeChoice

# Global map translating raw form-select codes to formal MFO classifications
MFO_MAPPING = {
    "he": "Advanced and Higher Education Services",
    "rs": "Research Services",
    "es": "Extension Services",
    "sto": "Support to Operations (STO)",
    "admin": "General Administrative and Support Services (GASS)"
}

# Shared utility to sanitize text fields against stored XSS
def sanitize_text(v: Optional[str]) -> Optional[str]:
    if v is not None:
        return html.escape(v.strip())
    return v


# ==========================================================
# 1. AUTHENTICATION & SESSION SCHEMAS
# ==========================================================

class GoogleAuthRequest(BaseModel):
    """Payload structure for whitelisted domain verification"""
    id_token: str = Field(..., description="Standard OAuth 2.0 Identity Token")
    email: EmailStr = Field(..., description="Validated email within domain")


class TokenResponse(BaseModel):
    """Session tokens with assigned role authorizations"""
    access_token: str
    token_type: str
    role: str
    department_id: Optional[int] = None

    model_config = ConfigDict(from_attributes=True)


# ==========================================================
# 2. BASE PRICE CATALOG & DYNAMIC RULE ENGINE SCHEMAS
# ==========================================================

class CatalogItemSchema(BaseModel):
    """Global base price reference catalog used to audit and compute standard item rates"""
    item_key: str = Field(..., example="pc_standard", description="Internal lookup key for catalog mapping")
    display_name: str = Field(..., example="Standard Office PC (Clerical)", description="Descriptive label shown on catalog listings")
    standard_unit_cost: Decimal = Field(..., ge=0, le=100_000_000, description="Reference baseline price in PHP")
    category: str = Field(..., example="computing", description="Broad category group for inventory aggregation")
    canvas_evidence_url: Optional[str] = Field(None, description="Pre-verified PDF catalog evidence document")
    supplier_name: Optional[str] = Field(None, description="Pre-verified item provider")


class CatalogItemCreate(BaseModel):
    """Payload for adding standard catalog items via the Admin interface"""
    item_key: str = Field(..., example="pc_standard", description="Unique internal lookup key")
    display_name: str = Field(..., example="Standard Office PC (Clerical)", description="Descriptive system label")
    standard_unit_cost: Decimal = Field(..., ge=0, le=100_000_000, description="Reference baseline price in PHP")
    category: str = Field(..., example="computing", description="Broad category group for inventory aggregation")
    is_active: bool = Field(True, description="Status flag indicating if item is visible to departments")
    allowed_offices: List[str] = Field(default=[], description="Offices permitted to request this item type")
    canvas_evidence_url: Optional[str] = Field(None, description="Pre-verified PDF catalog evidence document")
    supplier_name: Optional[str] = Field(None, description="Pre-verified item provider")

    @field_validator('item_key')
    @classmethod
    def reject_reserved_other_key(cls, v: str) -> str:
        if v.strip().lower() == "other":
            raise ValueError("The item key 'other' is a reserved system namespace for custom/unlisted equipment requests.")
        return v


class CatalogItemUpdate(BaseModel):
    """Payload for modifying active catalog items and their base pricing dynamically"""
    item_key: Optional[str] = Field(None, example="pc_standard")
    display_name: Optional[str] = Field(None, example="Standard Office PC (Clerical)")
    standard_unit_cost: Optional[Decimal] = Field(None, ge=0, le=100_000_000)
    category: Optional[str] = Field(None, example="computing")
    is_active: Optional[bool] = None
    allowed_offices: Optional[List[str]] = None
    canvas_evidence_url: Optional[str] = Field(None, description="Pre-verified PDF catalog evidence document")
    supplier_name: Optional[str] = Field(None, description="Pre-verified item provider")


class CatalogItemResponse(CatalogItemSchema):
    """Dynamic database record representation for standard catalog items"""
    id: uuid.UUID
    is_active: bool
    allowed_offices: List[str]

    model_config = ConfigDict(from_attributes=True)


class DropdownRestrictionRule(BaseModel):
    """Dynamic rule specifications to restrict selection options by organizational role/office"""
    office_tag: str = Field(..., example="Clerical")
    restricted_categories: List[str] = Field(..., example=["Gaming", "High-End Server"])
    allowed_catalog_keys: List[str] = Field(..., example=["pc_standard", "print_laser"])


class FormEngineSchemaResponse(BaseModel):
    """Dynamic form configurations containing active catalog and rule constraints"""
    schema_version: str = Field(..., example="v4.1")
    user_office_tag: str
    allowed_items_catalog: List[CatalogItemResponse]
    restrictions: Optional[DropdownRestrictionRule] = None


# ==========================================================
# 3. EXISTING INVENTORY TRACKING (Annex A-5)
# ==========================================================

class InventoryCreate(BaseModel):
    """Annex A-5 current infrastructure asset declaration inputs with age tracker integration"""
    item_name: str = Field(..., description="Hardware or equipment item label")
    quantity: int = Field(..., ge=1, le=10_000, description="Quantity in inventory")
    status: AssetStatus = Field(..., description="Operational State (Functional, Needs Repair, Condemned)")
    unserviceable_report_url: Optional[str] = Field(None, description="Upload requirement if asset is Condemned or Needs Repair")
    date_acquired: datetime = Field(default_factory=datetime.utcnow, description="Standard acquisition date mapping device lifecycle age")

    @model_validator(mode='after')
    def validate_condemned_status(self) -> 'InventoryCreate':
        """Force validation constraint demanding an unserviceable report (IIRUP) for condemned and damaged items"""
        if self.status in [AssetStatus.CONDEMNED, AssetStatus.NEEDS_REPAIR] and not self.unserviceable_report_url:
            raise ValueError("An Unserviceable Report PDF URL is mandatory when the asset is marked as Condemned or Needs Repair.")
        return self


class InventoryResponse(BaseModel):
    """Active catalog database schema definition for inventory items"""
    id: uuid.UUID
    department_id: int
    item_name: str
    quantity: int
    status: AssetStatus
    unserviceable_report_url: Optional[str] = None
    date_acquired: datetime

    model_config = ConfigDict(from_attributes=True)


# ==========================================================
# 4. DEPARTMENT NEEDS ASSESSMENT (needs_assessment.html)
# ==========================================================

class NeedsAssessmentCreate(BaseModel):
    """Structured department justification criteria mapped to MFOs"""
    title: str = Field(..., description="Action title of the proposal block", example="Upgrading Obsolete Networking for CAD Laboratories")
    mfo_alignment: str = Field(..., description="Targeted Major Final Output category or short code mapping", example="he")
    current_problem: str = Field(..., description="Specific operational bottleneck details")
    proposed_solution: str = Field(..., description="Summary of the proposed technical intervention")
    expected_impacts: List[str] = Field(default=[], example=["efficiency", "service_delivery", "safety"])
    other_impact: Optional[str] = Field(None, description="Optional narrative expansion for impacts")

    @field_validator('mfo_alignment', mode='before')
    @classmethod
    def resolve_mfo_code(cls, v: str) -> str:
        """
        Intercepts inputs and maps descriptions back to standard code keys.
        Handles connectors, abbreviations, and cased variations without aggressive character-stripping false positives.
        """
        if not isinstance(v, str):
            return v
        
        val_clean = v.strip().lower()
        if val_clean in MFO_MAPPING:
            return val_clean

        exact_mappings = {
            "advanced and higher education services": "he",
            "higher education services": "he",
            "advanced education services": "he",
            "research services": "rs",
            "extension services": "es",
            "support to operations": "sto",
            "general administrative and support services": "admin",
            "general administration and support": "admin"
        }
        if val_clean in exact_mappings:
            return exact_mappings[val_clean]

        if "higher education" in val_clean or "advanced education" in val_clean:
            return "he"
        if "research" in val_clean and "general" not in val_clean:
            return "rs"
        if "extension" in val_clean:
            return "es"
        if "support to operations" in val_clean or "sto" in val_clean:
            return "sto"
        if "admin" in val_clean or "gass" in val_clean or "general administration" in val_clean:
            return "admin"

        return v.strip()


class NeedsAssessmentResponse(NeedsAssessmentCreate):
    """Response criteria returned to needs_assessment.html lists"""
    id: uuid.UUID
    department_id: int
    is_archived: bool = False

    model_config = ConfigDict(from_attributes=True)


# ==========================================================
# 5. PROPOSAL SCHEMAS (CAPEX & MOOE SUBSCRIPTIONS)
# ==========================================================

class ProposalUpdatePayload(BaseModel):
    """Client request parameters for editing departmental hardware requests (Annex A-6/A-1)"""
    item_select: str = Field(..., description="Selected hardware or system item catalog identifier")
    custom_specification: Optional[str] = Field(None, description="Custom details if unlisted item type is selected")
    
    # DYNAMIC FIELD replacing year1_qty, year2_qty, year3_qty
    yearly_quantities: Dict[str, int] = Field(
        default_factory=dict,
        example={"2026": 5, "2027": 2, "2028": 0},
        description="Map of calendar year string keys to their corresponding integer quantities requested"
    )
    
    unit_cost: Decimal = Field(..., ge=0, le=100_000_000, description="Unit cost in PHP")
    canvas_evidence_url: Optional[str] = Field(None, description="Target S3 asset URL mapping canvas verification document")
    target_offices_json: List[str] = Field(default=[], description="Part IV.A targeted internal units or campus locations receiving deployment")
    
    # Target Strategic Project Key Map
    project_key: Optional[str] = Field(None, description="Standard key mapping to university target ICT Project")
    is_expansion: bool = Field(False, description="Explicitly flags if this is an expansion project")

    @field_validator('target_offices_json')
    @classmethod
    def sanitize_target_offices(cls, v: List[str]) -> List[str]:
        """Neutralizes potential stored XSS scripts embedded within deployment locations"""
        return [html.escape(item.strip()) for item in v if item.strip()]

    # Sanitize inputs and enforce max character limits of 500 on custom specifications
    @field_validator('custom_specification', mode='before')
    @classmethod
    def clean_and_validate_specification(cls, v: Optional[str]) -> Optional[str]:
        sanitized = sanitize_text(v)
        if sanitized and len(sanitized) > 500:
            raise ValueError("Custom specification must not exceed 500 characters.")
        return sanitized

    @model_validator(mode='after')
    def validate_proposal_criteria(self) -> 'ProposalUpdatePayload':
        # Validate format of year strings and ensure no negative or overflow values exist
        for year, qty in self.yearly_quantities.items():
            if not year.isdigit() or len(year) != 4:
                raise ValueError(f"Invalid fiscal year key '{year}' detected. Year keys must be 4-digit calendar strings.")
            if qty < 0:
                raise ValueError(f"Requested quantity for planning year {year} cannot be negative.")
            if qty > 10_000:
                raise ValueError(f"Requested quantity for planning year {year} exceeds maximum allowable threshold (10,000 units).")

        # Allow 0 quantities on raw draft creation to prevent 422 errors.
        total_qty = sum(self.yearly_quantities.values())
        if total_qty < 0:
            raise ValueError("The total quantity requested across all planning years cannot be negative.")
        
        # Custom Item Compliance Constraints (Resolves Section 4 Compliance Rules)
        if self.item_select.strip().lower() == "other":
            if not self.custom_specification or len(self.custom_specification) <= 4:
                raise ValueError("Custom specification is mandatory for unlisted ('other') items and must be longer than 4 characters.")
            
            blocked_keywords = ["gaming", "playstation", "xbox", "nintendo", "console", "entertainment"]
            spec_lower = self.custom_specification.lower()
            for keyword in blocked_keywords:
                if keyword in spec_lower:
                    raise ValueError(f"Compliance Violation: Blocked keyword '{keyword}' detected in custom specifications.")
        
        # Enforce target office selection when the expansion project option is selected
        if self.is_expansion and not self.target_offices_json:
            raise ValueError("At least one target office location must be selected for an expansion project.")

        return self


class ProposalResponse(BaseModel):
    """Full SQL relational mappings tracking state progression"""
    id: uuid.UUID
    department_id: int
    item_name: str
    custom_specification: Optional[str] = None
    yearly_quantities: Dict[str, int] = Field(default_factory=dict, description="Map of planning years to requested quantities")
    total_qty: int
    unit_cost: Decimal
    project_key: Optional[str] = Field(None, description="Standard key mapping to university target ICT Project")
    status: ProposalStatus = Field(..., description="Reflects the workflow state and locks edit capabilities accordingly")
    version: int
    is_archived: bool
    canvas_evidence_url: Optional[str] = None
    target_offices_json: List[str] = []
    s3_storage_class: str = Field("STANDARD", example="GLACIER", description="Tracks AWS S3 storage lifecycle tier")
    is_restoring: bool = Field(False, description="True if a cold archival retrieval is currently processing")
    is_expansion: bool = Field(False, description="Explicitly flags if this is an expansion project")

    @field_validator('s3_storage_class', mode='before')
    @classmethod
    def resolve_storage_class(cls, v: str) -> str:
        """Outputs LOCAL if storage configuration is directed to a local filesystem"""
        if getattr(settings, "STORAGE_TYPE", "local").lower() == "local":
            return "LOCAL"
        return v or "STANDARD"

    model_config = ConfigDict(from_attributes=True)


class SubscriptionProposalCreate(BaseModel):
    """Capture payload for the Software / Cloud Subscription Form (Annex A-2 / MOOE)"""
    subscription_type: str = Field(..., description="e.g., SaaS, Cloud Subscription, PaaS, IaaS, Annual License")
    software_name: str = Field(..., description="Specific Software/Service Name, e.g., Adobe Creative Cloud, Zoom Pro")
    justification: str = Field(..., description="Operational Justification for recurring subscription")
    
    # DYNAMIC FIELD replacing year1_users, year2_users, year3_users
    yearly_users: Dict[str, int] = Field(
        default_factory=dict,
        example={"2026": 50, "2027": 100, "2028": 120},
        description="Map of calendar year string keys to target active license or user counts"
    )
    
    annual_cost_per_user: Decimal = Field(..., ge=0, le=100_000_000, description="Est. Annual Cost per User/License")
    canvas_evidence_url: Optional[str] = Field(
        None, 
        description="Path to uploaded supplier canvas/pricing evidence. Required for custom 'other' types."
    )
    target_offices_json: List[str] = Field(default=[], description="Part IV.A targeted internal units or campus locations utilizing software licenses")
    
    # Target Strategic Project Key Map
    project_key: Optional[str] = Field(None, description="Standard key mapping to university target ICT Project")
    is_expansion: bool = Field(False, description="Explicitly flags if this is an expansion project")

    # Prevent Stored XSS attacks inside input fields of MOOE subscriptions
    @field_validator('software_name', 'justification', mode='before')
    @classmethod
    def sanitize_subscription_texts(cls, v: Optional[str]) -> Optional[str]:
        return sanitize_text(v)

    @field_validator('target_offices_json')
    @classmethod
    def sanitize_target_offices(cls, v: List[str]) -> List[str]:
        """Neutralizes potential stored XSS scripts embedded within deployment locations"""
        return [html.escape(item.strip()) for item in v if item.strip()]

    @model_validator(mode='after')
    def validate_subscription_criteria(self) -> 'SubscriptionProposalCreate':
        # Validate format of year strings and ensure no negative or overflow values exist
        for year, count in self.yearly_users.items():
            if not year.isdigit() or len(year) != 4:
                raise ValueError(f"Invalid fiscal year key '{year}' detected. Year keys must be 4-digit calendar strings.")
            if count < 0:
                raise ValueError(f"Allocated user seat count for planning year {year} cannot be negative.")
            if count > 100_000:
                raise ValueError(f"Allocated user seat count for planning year {year} exceeds maximum allowable threshold (100,005 users).")

        # Allow 0 users on raw draft creation to prevent 422 errors.
        total_users = sum(self.yearly_users.values())
        if total_users < 0:
            raise ValueError("The total active licenses/users requested across all planning years cannot be negative.")
        
        # Prevent non-institutional entertainment integrations
        blocked_keywords = ["gaming", "playstation", "xbox", "entertainment", "stream"]
        name_lower = self.software_name.lower()
        for keyword in blocked_keywords:
            if keyword in name_lower:
                raise ValueError(f"Compliance Violation: Blocked keyword '{keyword}' detected in software name.")
        
        # Enforce target office selection when the expansion project option is selected
        if self.is_expansion and not self.target_offices_json:
            raise ValueError("At least one target office location must be selected for an expansion project.")

        return self


class SubscriptionProposalResponse(SubscriptionProposalCreate):
    """Response schema for Subscription entries tracking active operational workflow lock states"""
    id: uuid.UUID
    department_id: int
    status: ProposalStatus = Field(..., description="Explicitly tracks workflow progression state")
    total_multiyear_mooe: Decimal = Field(..., description="Calculated total multi-year MOOE budget based on accumulated allocations")
    project_key: Optional[str] = Field(None, description="Standard key mapping to university target ICT Project")
    is_archived: bool = False
    target_offices_json: List[str] = []
    s3_storage_class: str = Field("STANDARD", example="GLACIER", description="Tracks active storage tier for COA retrieval")
    is_restoring: bool = Field(False, description="True if a cold archival retrieval is currently active")

    @field_validator('s3_storage_class', mode='before')
    @classmethod
    def resolve_storage_class(cls, v: str) -> str:
        """Outputs LOCAL if storage configuration is directed to a local filesystem"""
        if getattr(settings, "STORAGE_TYPE", "local").lower() == "local":
            return "LOCAL"
        return v or "STANDARD"

    model_config = ConfigDict(from_attributes=True)


# --- Polymorphic Admin Overrides ---

class AdminHardwareOverride(BaseModel):
    """Specific overrides reserved strictly for CapEx/Hardware entries"""
    item_name: Optional[str] = Field(None, description="Corrected name matching standardized naming guidelines")
    custom_specification: Optional[str] = None
    unit_cost: Optional[Decimal] = Field(None, ge=0, le=100_000_000)
    
    # Dynamic key-value overrides replacing flat parameters
    yearly_quantities: Optional[Dict[str, int]] = Field(None, description="Overridden map of year keys to quantities")
    target_offices_json: Optional[List[str]] = None
    project_key: Optional[str] = Field(None, description="Overridden strategic project key mapping")

    @field_validator('yearly_quantities')
    @classmethod
    def validate_quantities_override(cls, v: Optional[Dict[str, int]]) -> Optional[Dict[str, int]]:
        if v is not None:
            for year, qty in v.items():
                if not year.isdigit() or len(year) != 4:
                    raise ValueError(f"Invalid key '{year}'. Override year keys must be 4-digit calendar strings.")
                if qty < 0:
                    raise ValueError(f"Quantity override for year {year} cannot be negative.")
                if qty > 10_000:
                    raise ValueError(f"Quantity override for year {year} exceeds maximum allowable threshold (10,000 units).")
        return v


class AdminSubscriptionOverride(BaseModel):
    """Specific overrides reserved strictly for MOOE/Subscription entries"""
    subscription_type: Optional[str] = None
    software_name: Optional[str] = None
    justification: Optional[str] = None
    
    # Dynamic key-value overrides replacing flat parameters
    yearly_users: Optional[Dict[str, int]] = Field(None, description="Overridden map of year keys to user licenses")
    annual_cost_per_user: Optional[Decimal] = Field(None, ge=0, le=100_000_000)
    target_offices_json: Optional[List[str]] = None
    project_key: Optional[str] = Field(None, description="Overridden strategic project key mapping")

    @field_validator('yearly_users')
    @classmethod
    def validate_users_override(cls, v: Optional[Dict[str, int]]) -> Optional[Dict[str, int]]:
        if v is not None:
            for year, count in v.items():
                if not year.isdigit() or len(year) != 4:
                    raise ValueError(f"Invalid key '{year}'. Override year keys must be 4-digit calendar strings.")
                if count < 0:
                    raise ValueError(f"User license override for year {year} cannot be negative.")
                if count > 100_000:
                    raise ValueError(f"User license override for year {year} exceeds maximum allowable threshold (100,000 users).")
        return v


class AdminOverridePayload(BaseModel):
    """Consolidated polymorphic override container targeting physical CapEx items or MOOE line items"""
    hardware: Optional[AdminHardwareOverride] = None
    subscription: Optional[AdminSubscriptionOverride] = None


# ==========================================================
# 6. SYSTEM BUDGET CEILINGS & CONTROLS
# ==========================================================

class BudgetCeilingResponse(BaseModel):
    """Real-time monitoring metrics for departmental expenditures"""
    department_id: int
    department_name: str
    allocated_capex: Decimal = Field(default=Decimal("0.00"), description="Granular CapEx Allocation Limit")
    allocated_mooe: Decimal = Field(default=Decimal("0.00"), description="Granular MOOE Allocation Limit")
    sub_ceiling: Decimal = Field(default=Decimal("0.00"), description="Assigned Consolidated Departmental Ceiling Limit")
    global_ceiling: Decimal = Field(default=Decimal("0.00"), description="Overall Consolidated Institutional Budget Ceiling")
    current_spent: Decimal = Field(default=Decimal("0.00"), description="Sum value of approved items")

    model_config = ConfigDict(from_attributes=True)


class UpdateCeilingPayload(BaseModel):
    """Admin budget allocation updater"""
    department_id: int
    allocated_capex: Decimal = Field(default=Decimal("0.00"), ge=0, description="Allocated CapEx budget limit in PHP")
    allocated_mooe: Decimal = Field(default=Decimal("0.00"), ge=0, description="Allocated MOOE budget limit in PHP")
    sub_ceiling: Optional[Decimal] = Field(None, description="Consolidated department ceiling limit")

    @model_validator(mode='after')
    def resolve_default_split(self) -> 'UpdateCeilingPayload':
        """Performs a standard 70/30 division on consolidated budget inputs while ensuring exact sum retention"""
        if self.sub_ceiling is not None and self.allocated_capex == Decimal("0.00") and self.allocated_mooe == Decimal("0.00"):
            sub_dec = Decimal(str(self.sub_ceiling)).quantize(Decimal("1.00"))
            self.allocated_capex = (sub_dec * Decimal("0.70")).quantize(Decimal("1.00"))
            self.allocated_mooe = sub_dec - self.allocated_capex
        return self


class UpdateGlobalCeilingPayload(BaseModel):
    """Admin global ceiling updater"""
    global_ceiling: Decimal = Field(..., gt=0, description="New global institutional ceiling limit")


class BulkCeilingItem(BaseModel):
    """Structured departmental allocation details within dynamic bulk validation payloads"""
    department_id: int
    allocated_capex: Decimal = Field(default=Decimal("0.00"), ge=0, description="Allocated CapEx limit per department")
    allocated_mooe: Decimal = Field(default=Decimal("0.00"), ge=0, description="Allocated MOOE limit per department")
    sub_ceiling_input: Optional[Decimal] = Field(None, alias="sub_ceiling", description="Optional direct consolidated sub-ceiling input")

    @model_validator(mode='after')
    def resolve_and_split_sub_ceiling(self) -> 'BulkCeilingItem':
        """Calculates precise 70/30 splitting to prevent rounding discrepancies"""
        if self.sub_ceiling_input is not None and self.allocated_capex == Decimal("0.00") and self.allocated_mooe == Decimal("0.00"):
            sub_dec = Decimal(str(self.sub_ceiling_input)).quantize(Decimal("1.00"))
            self.allocated_capex = (sub_dec * Decimal("0.70")).quantize(Decimal("1.00"))
            self.allocated_mooe = sub_dec - self.allocated_capex
        return self

    @property
    def sub_ceiling(self) -> Decimal:
        """Returns consolidated sum of CapEx and MOOE allocations"""
        return self.allocated_capex + self.allocated_mooe


class BulkCeilingValidationPayload(BaseModel):
    """Programmatically enforces budget ceiling constraints"""
    global_ceiling: Decimal = Field(..., gt=0)
    sub_ceilings: List[BulkCeilingItem]

    @model_validator(mode='after')
    def validate_ceiling_constraint(self) -> 'BulkCeilingValidationPayload':
        """Validates mathematical constraints and intercepts duplicate entries"""
        seen_depts = set()
        total_subs = Decimal("0.00")
        for item in self.sub_ceilings:
            if item.department_id in seen_depts:
                raise ValueError(f"Duplicate allocation payload detected for department ID: {item.department_id}")
            seen_depts.add(item.department_id)
            total_subs += item.allocated_capex + item.allocated_mooe

        if total_subs > self.global_ceiling:
            raise ValueError(
                f"Constraint Violation: Sum of Department Sub-Ceilings (₱{total_subs:,.2f}) "
                f"exceeds the Global Budget Ceiling (₱{self.global_ceiling:,.2f})."
            )
        return self


# ==========================================================
# 7. ASYNC TASK PROGRESS & DOCUMENT VAULT SCHEMAS
# ==========================================================

class AsyncTaskStatusResponse(BaseModel):
    """Task tracking metadata for dynamic UI progress updates"""
    task_id: uuid.UUID
    state: str = Field(..., description="Reflects state transitions of Celery tracking tasks")
    progress_percent: int = Field(..., ge=0, le=100)
    current_step_message: str = Field(..., example="Pass 1: Rendering memory tree...")
    download_url: Optional[str] = Field(None, description="Target S3 download path once SUCCESS is reached")


class GeneratedDocumentResponse(BaseModel):
    """Storage reference details for compiled official PDF records"""
    id: str = Field(..., example="ISSP-CSPC-2026-V1")
    generation_date: str = Field(..., example="2026-05-06T01:35:00Z")
    coverage_period: str = Field(..., example="FY 2026 - 2028")
    triggered_by: str = Field(..., example="Ian P. Benitez")
    file_size_bytes: int = Field(..., ge=0)
    s3_vault_url: str = Field(..., description="Secure path to the generated document PDF")
    s3_storage_class: str = Field("STANDARD", example="GLACIER", description="Tracks active storage tier for COA retrieval")
    is_restoring: bool = Field(False, description="True if a cold retrieval operation is currently active")

    @field_validator('s3_storage_class', mode='before')
    @classmethod
    def resolve_storage_class(cls, v: str) -> str:
        """Outputs LOCAL if storage configuration is directed to a local filesystem"""
        if getattr(settings, "STORAGE_TYPE", "local").lower() == "local":
            return "LOCAL"
        return v or "STANDARD"

    model_config = ConfigDict(from_attributes=True)


# ==========================================================
# 8. IMMUTABLE AUDIT LOG & WHITELIST SCHEMAS
# ==========================================================

class AuditLogEntryResponse(BaseModel):
    """Immutable change tracking log to comply with COA policy"""
    id: int
    proposal_id: Optional[uuid.UUID] = None
    subscription_id: Optional[uuid.UUID] = None
    action: str = Field(..., example="UPDATE_PROPOSAL_PRICE")
    user_id: int = Field(..., description="ID of the user who initiated the action")
    timestamp: datetime = Field(...)
    old_value: Optional[Dict[str, Any]] = Field(None, description="Previous JSON state before change")
    new_value: Optional[Dict[str, Any]] = Field(None, description="New JSON state after change")

    model_config = ConfigDict(from_attributes=True)


class WhitelistedUserCreate(BaseModel):
    """Admin-defined baseline criteria to pre-assign domains and departments"""
    email: EmailStr = Field(..., example="staff_member@cspc.edu.ph")
    assigned_department_id: Optional[int] = Field(None, description="Department link, null for administrators")
    role_tag: RoleTag
    password: Optional[str] = Field(
        None, 
        min_length=8, 
        description="Optional local password for standard login. Excluded from serialized API responses.",
        exclude=True
    )


class WhitelistedUserUpdate(BaseModel):
    """Admin-defined parameters for modifying whitelisted user profiles"""
    email: Optional[EmailStr] = None
    assigned_department_id: Optional[int] = Field(None, description="Assigned department, use 0 to unassign")
    role_tag: Optional[RoleTag] = None
    password: Optional[str] = Field(None, min_length=8, description="Set new password for local authentication")
    
    
class WhitelistedUserResponse(BaseModel):
    """Pre-assignment metadata configuration with database attribute mapping"""
    id: int
    email: EmailStr
    role_tag: RoleTag
    assigned_department_id: Optional[int] = None
    department_id: Optional[int] = None
    department_name: Optional[str] = None

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
        
        # Parse SQLAlchemy database model attributes
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
# 9. SUB-SCHEMAS FOR ISSP NARRATIVES (PARTS I - III)
# ==========================================================

class ISPlannerSchema(BaseModel):
    """Details of the Information Systems Planner or planning team members"""
    name: str = Field(..., example="Engr. John Doe")
    position: str = Field(..., example="Director, MIS")
    email: EmailStr = Field(..., example="jdoe@cspc.edu.ph")
    contact_number: Optional[str] = Field(None, example="+63 917 123 4567")


class ManpowerSchema(BaseModel):
    """Structured IT staff complement census"""
    total_employees: int = Field(..., ge=0)
    admin_regular: int = Field(..., ge=0)
    admin_casual: int = Field(..., ge=0)
    academic_regular: int = Field(..., ge=0)
    academic_casual: int = Field(..., ge=0)


class MFOSchema(BaseModel):
    """Part I.A.4 - Explicit Major Final Output structural definition"""
    id: int = Field(..., description="Unique incremental MFO sequence identifier")
    title: str = Field(..., description="Major Final Output heading", example="Higher Education Services")
    description: str = Field(..., description="Full descriptive summary of educational program outputs")


class CoreOfficeRegistrySchema(BaseModel):
    """Part I / Annex A-3 - Structural description of Core Offices and Description of Functions (BP 512)"""
    id: int = Field(..., description="Unique core office identifier sequence")
    office_name: str = Field(..., example="Office of the President", description="Name of the college office")
    description: str = Field(..., description="Full legal and operational description of office responsibilities")
    division: str = Field(..., example="Administration", description="Division category classification")


class StrategicConcernSchema(BaseModel):
    """Section I.C/I.E - Mapping of Major Final Outputs (MFO) to strategic IT problems"""
    mfo: str = Field(..., description="Major Final Output description")
    systems: str = Field(..., description="Critical Business Systems or platforms used")
    problems: str = Field(..., description="Key technical or administrative problems encountered")
    intended_use: str = Field(..., description="Intended strategic use of ICT solutions")


class ProposedSystemSchema(BaseModel):
    """Section II.B - Database of proposed application systems and operational strategies"""
    name: str = Field(..., description="System / Sub-System Name")
    description: str = Field(..., description="Scope and functionalities of the system")
    status: str = Field(..., description="Development Status (e.g., For Enhancement, For Development, Operational)")
    dev_strategy: str = Field(..., description="Development strategy (e.g., In-House, Outsourced, Co-Developed)")
    computing_scheme: str = Field(..., description="Hosting Scheme (e.g., Cloud, Hybrid, On-Premise)")
    text_internal: Optional[str] = None
    text_external: Optional[str] = None
    users_internal: str = Field(..., description="Target internal user offices or groups")
    users_external: str = Field(..., description="Target external user stakeholders or clients")
    owners: str = Field(..., description="Responsible business unit or department owner")


class DatabaseRequiredSchema(BaseModel):
    """Section II.C - Logical databases and target storage media layouts"""
    name: str = Field(..., description="Database/Data Registry Name")
    description: str = Field(..., description="Data stored and operational purpose")
    status: str = Field(..., description="Operational status (e.g., Existing, Proposed)")
    is_served: str = Field(..., description="Information System served by this database")
    storage_media: str = Field(..., description="Storage and backup media types used")
    owners: str = Field(..., description="Entity holding database ownership rights")


class ICTProjectSchema(BaseModel):
    """Section III.A & III.B - Structured framework projects and timelines"""
    name: str = Field(..., description="ICT Project Name")
    objectives: str = Field(..., description="Project objectives, separated by newlines")
    duration: str = Field(..., example="2026 - 2028")
    deliverables: str = Field(..., description="Concrete project deliverables and outputs")
    lead_agency: Optional[str] = Field(None, example="Camarines Sur Polytechnic Colleges")
    implementing_agencies: Optional[str] = Field(None, example="MIS Department, Procurement Office")


class PMFRowSchema(BaseModel):
    """Section III.C - Performance Measurement Framework matrix records with project association"""
    project_title: str = Field(..., description="The exact title of the associated ICT Project as defined in Section III.A/B")
    result_hierarchy: str = Field(..., description="Performance levels: Intermediate, Immediate, or Outputs")
    indicator: str = Field(..., description="Objectively Verifiable Indicator (OVI)")
    baseline: str = Field(..., description="Current performance baseline metrics")
    target: str = Field(..., description="Expected target metrics over the ISSP cycle")
    collection_method: str = Field(..., description="Data gathering strategy and tools")
    responsibility: str = Field(..., description="Accountable office or personnel")


# ==========================================================
# 10. TECHNICAL COVERSHEETS AND SCHEDULE DECLARATIONS
# ==========================================================

class MithiSpecialSolutionsSchema(BaseModel):
    """MITHI Survey (Annex A-1) - Section 6 Special Solutions Packages"""
    solution_name: str = Field(..., example="Geographic Information System", description="Special solution package name")
    is_used: bool = Field(False, description="Is the special solution package actively used")
    maintenance_cost: Decimal = Field(Decimal("0.00"), ge=0, description="Annual maintenance cost in PHP")


class MithiDataCenterSchema(BaseModel):
    """MITHI Survey (Annex A-1) - Section 7 Data Center configuration"""
    has_data_center: bool = Field(..., description="Does the agency have an on-premise physical data center")
    data_center_count: int = Field(0, ge=0, description="Number of active data centers")
    has_backup_site: bool = Field(..., description="Is there a secure disaster recovery backup site")
    maintenance_strategy: str = Field(..., example="In-house", description="Maintenance strategy details")


class MithiNetworkProfile(BaseModel):
    """MITHI Survey (Annex A-1) - Network connectivity details"""
    has_lan: bool = Field(..., description="Indicates active local area network presence")
    has_intranet: bool = Field(..., description="Indicates internal private portal presence")
    has_vpn: bool = Field(..., description="Indicates virtual private network channels")
    is_connected_to_internet: bool = Field(..., description="Indicates global web routing status")
    internet_access_modes: List[str] = Field(..., example=["Leased Line", "WiFi", "DSL"])
    isps: List[str] = Field(..., example=["PLDT", "Globe"])
    combined_bandwidth_mbps: int = Field(..., ge=0, description="Combined bandwidth throughput in Mbps")
    employees_with_internet_access: int = Field(..., ge=0)
    employees_with_official_email: int = Field(..., ge=0)


class MithiHardwareItemSchema(BaseModel):
    """DICT Annex A-1: Section 1.1 Computing Devices and Peripherals by Type (Dynamic N-Year layout)"""
    device_type: str = Field(..., example="Desktop PC", description="Hardware or equipment classification type")
    
    # Maps to support dynamic multi-year tracking
    yearly_owned: Dict[str, int] = Field(default_factory=dict, description="Map of calendar year strings to owned quantities")
    yearly_leased: Dict[str, int] = Field(default_factory=dict, description="Map of calendar year strings to leased quantities")
    older_than_3_years: int = Field(0, ge=0, description="Total units older than 3 years")

    @model_validator(mode='after')
    def validate_mithi_hardware(self) -> 'MithiHardwareItemSchema':
        for year, val in self.yearly_owned.items():
            if not year.isdigit() or len(year) != 4:
                raise ValueError(f"Invalid calendar year '{year}' in yearly_owned.")
            if val < 0:
                raise ValueError(f"Owned value for year {year} cannot be negative.")
            if val > 10_000:
                raise ValueError(f"Owned value for year {year} exceeds maximum allowable threshold (10,000 units).")
        for year, val in self.yearly_leased.items():
            if not year.isdigit() or len(year) != 4:
                raise ValueError(f"Invalid calendar year '{year}' in yearly_leased.")
            if val < 0:
                raise ValueError(f"Leased value for year {year} cannot be negative.")
            if val > 10_000:
                raise ValueError(f"Leased value for year {year} exceeds maximum allowable threshold (10,000 units).")
        return self


class ImplementationScheduleItem(BaseModel):
    """Parts V.A & V.B - Annual, quarterly, or monthly timeline milestones"""
    project_id: uuid.UUID
    project_name: str
    milestones: Dict[str, bool] = Field(..., description="Active checkmarks (e.g., {'2026_Q1': True, '2026_Q2': False})")


# ==========================================================
# 11. MITHI EXTENDED SURVEY SCHEMAS (Section 4, 5, 8.2)
# ==========================================================

class MithiSecurityDrSchema(BaseModel):
    """MITHI Survey (Annex A-1) - Section 4 Security, Disaster Recovery & Backup Checklist"""
    has_security_policy: bool = Field(False, description="Presence of active security policy guidelines")
    has_dr_plan: bool = Field(False, description="Presence of disaster recovery plans")
    has_back_up_power: bool = Field(False, description="Back-up power unit presence (e.g., Generator, UPS)")
    has_digital_signatures: bool = Field(False, description="Deployment of certified digital signatures")
    has_encryption: bool = Field(False, description="Active encryption frameworks for critical SUC databases")
    has_offsite_backup: bool = Field(False, description="Active off-site backup pipelines")
    has_hardware_firewall: bool = Field(False, description="Hardware firewall network implementations")
    has_physical_access_control: bool = Field(False, description="Physical access restrictions to server rooms")
    has_software_firewall: bool = Field(False, description="Active endpoint security software firewalls")
    has_secure_servers: bool = Field(False, description="Secure operating servers deployment status")


class MithiDataArchivingSchema(BaseModel):
    """MITHI Survey (Annex A-1) - Section 5 Data Archiving Configurations"""
    has_archiving_system: bool = Field(False, description="Presence of institutional data archiving systems")
    archiving_mode: str = Field("Manual", description="Archiving mode: Manual, Electronic, Both")
    archiving_medium: List[str] = Field(default_factory=list, description="Storage media: Optical, Hard Disk, Tape, etc.")
    archived_information: List[str] = Field(default_factory=list, description="Classifications: Publications, Letters, etc.")


class MithiIctIssuesSchema(BaseModel):
    """MITHI Survey (Annex A-1) - Section 8.2 ICT Implementation Bottlenecks"""
    has_budget_issues: bool = Field(False, description="Insufficient budget constraints")
    has_procurement_issues: bool = Field(False, description="Government standard procurement bottlenecks")
    has_reluctant_stakeholders: bool = Field(False, description="Resistance to digital systems transition")
    has_management_support_issues: bool = Field(False, description="Lack of institutional executive support")
    has_personnel_recruitment_issues: bool = Field(False, description="Difficulty recruiting or retaining IT personnel")
    has_employee_skills_issues: bool = Field(False, description="Low level of ICT literacy among SUC employees")
    has_bandwidth_issues: bool = Field(False, description="Unavailability of required network bandwidth")
    has_contract_management_issues: bool = Field(False, description="Difficulties in contracts and vendor management")


# ==========================================================
# 12. PART IV.B RELATIONAL STAFFING SCHEMAS
# ==========================================================

class IctStaffPositionCreate(BaseModel):
    """Administrative creation schema for institutional IT staffing models"""
    position_title: str = Field(..., example="Database Administrator", description="Official position title")
    status: str = Field(..., example="Permanent", description="Permanent, Contractual, or Casual")
    count: int = Field(1, ge=0, description="Total headcount for this position")


class IctStaffPositionResponse(IctStaffPositionCreate):
    """Relational database response mapping details for IT personnel"""
    id: uuid.UUID
    issp_period: str

    model_config = ConfigDict(from_attributes=True)


# ==========================================================
# 13. MASTER NARRATIVE CONFIGURATIONS
# ==========================================================

class MasterNarrativeUpdate(BaseModel):
    """Form fields mapping directly to Part I-III setup fields and DICT configuration guidelines"""
    agency_name: Optional[str] = Field("Camarines Sur Polytechnic Colleges", description="Official agency heading name")
    issp_period_from: Optional[int] = Field(None, description="Starting year of the ISSP cycle (e.g., 2026)", example=2026)
    issp_period_to: Optional[int] = Field(None, description="Ending year of the ISSP cycle (e.g., 2028)", example=2028)
    agency_website_url: Optional[str] = Field(None, example="https://www.cspc.edu.ph")
    
    scope_choice: Optional[ScopeChoice] = Field(
        None, 
        description="DICT Scope Choices: Department-Wide, Central Office only, With Regional Offices, With Bureaus, Agency-Wide"
    )
    scope_json: Optional[Dict[str, Any]] = Field(default_factory=dict, description="Detailed mapped scope parameters")

    is_active: Optional[bool] = Field(False, description="Enables this planning period as the active submission cycle")

    # Path to the custom uploaded logo
    agency_logo_url: Optional[str] = Field(None, description="Path to the uploaded agency logo")

    # Path to the uploaded cert logo
    cert_logo_url: Optional[str] = Field(None, description="Path to the uploaded secondary certification logo (TUV SUD)")

    # Cover Page Letter of Transmittal Properties (DICT Standard Page 1)
    transmittal_recipient: Optional[str] = Field("ATTY. IVAN JOHN E. UY", description="Recipient name for the formal transmittal coversheet")
    transmittal_recipient_title: Optional[str] = Field("Secretary", description="Official title of the transmittal coversheet recipient")
    transmittal_recipient_agency: Optional[str] = Field("Department of Information and Communications Technology", description="Target government department or commission name")
    transmittal_recipient_address: Optional[str] = Field("DICT Bldg., C.P. Garcia Avenue, Diliman, Quezon City", description="Full physical postal address of target recipient")
    transmittal_date: Optional[str] = Field("22 February 2023", description="Specific formal transmittal document authorization date")
    
    signatory_prepared_by: Optional[str] = Field(None, description="Printed Name & credentials of preparer", example="Engr. John Doe, MSCS")
    preparer_position: Optional[str] = Field(None, example="Director, MIS")
    preparer_tel: Optional[str] = Field(None, example="(054) 471-1234")
    preparer_fax: Optional[str] = Field(None, example="(054) 471-1235")
    preparer_email: Optional[EmailStr] = Field(None, example="mis_director@cspc.edu.ph")
    
    signatory_approved_by: Optional[str] = Field(None, description="Printed Name & credentials of the Agency Head", example="Dr. Amado A. Oliva Jr.")

    # Size boundaries to prevent WeasyPrint engine layout hangs on custom HTML narratives
    mandate_html: Optional[str] = Field("", max_length=50000, description="DICT mandated legal references and background")
    vision_html: Optional[str] = Field("", max_length=50000, description="Official institutional vision statement")
    mission_html: Optional[str] = Field("", max_length=50000, description="Official institutional mission statement")
    present_situation_html: Optional[str] = Field("", max_length=50000, description="Current operational state narrative")
    
    planners_json: Optional[List[ISPlannerSchema]] = Field([], description="Array of planning team profiles")
    manpower_json: Optional[ManpowerSchema] = Field(None, description="Detailed IT manpower demographic metrics")
    annual_ict_budget: Optional[Decimal] = Field(Decimal("0.00"), description="Starting/Baseline annual allocation")
    
    # Nested lists mapping out sections
    major_final_outputs: Optional[List[MFOSchema]] = Field([], description="Part I.A.4 dynamic Major Final Outputs registry")
    core_offices_json: Optional[List[CoreOfficeRegistrySchema]] = Field([], description="Part I / Annex A-3 Core Offices and functions directory")
    strategic_concerns_json: Optional[List[StrategicConcernSchema]] = Field([], description="Part I.C mapped problems matrix")
    systems_json: Optional[List[ProposedSystemSchema]] = Field([], description="Part II.B application strategies table")
    databases_json: Optional[List[DatabaseRequiredSchema]] = Field([], description="Part II.C databases requirements table")
    internal_projects_json: Optional[List[ICTProjectSchema]] = Field([], description="Part III.A strategic internal projects")
    cross_projects_json: Optional[List[ICTProjectSchema]] = Field([], description="Part III.B cross-agency collaborative systems")
    pmf_matrix_json: Optional[List[PMFRowSchema]] = Field([], description="Part III.C system objective metrics and OVIs")

    # Part IV.B ICT Organizational Charts
    existing_ict_org_url: Optional[str] = Field(None, description="Path to active existing ICT organizational chart diagram")
    proposed_ict_org_url: Optional[str] = Field(None, description="Path to proposed ICT organizational chart diagram")
    placement_ict_org_url: Optional[str] = Field(None, description="Path to placement of proposed ICT organizational structure in institutional chart")
    
    # Advanced structured fields derived from technical forms and planning requirements
    site_development_plan_url: Optional[str] = Field(None, description="Path to the uploaded Annex A-2 Campus Site Development Plan")
    fiber_backbone_url: Optional[str] = Field(None, description="Path to the uploaded Fiber Optic Backbone Cabling Diagram")
    system_architecture_url: Optional[str] = Field(None, description="Path to the uploaded System Architecture Diagram")
    
    # CSPC Network Diagram & Core topology (Page 129 compliance layout element)
    network_topology_url: Optional[str] = Field(None, description="Path to the uploaded CSPC Network Diagram & Core topology")

    # Gap 6 ISSP Process Flow diagram representation
    process_flow_diagram_url: Optional[str] = Field(None, description="Path to the uploaded ISSP Process Flow diagram")

    mithi_network_profile: Optional[MithiNetworkProfile] = Field(None, description="Detailed network configurations")
    mithi_special_solutions: Optional[List[MithiSpecialSolutionsSchema]] = Field([], description="DICT Annex A-1 Section 6 Special Software Solutions")
    mithi_data_center: Optional[MithiDataCenterSchema] = Field(None, description="DICT Annex A-1 Section 7 Data Center metrics")
    mithi_hardware_inventory: Optional[List[MithiHardwareItemSchema]] = Field([], description="DICT Annex A-1 physical inventory asset declarations")
    
    # Extended Annex A-1 MITHI Survey structured data parameters
    mithi_security_dr: Optional[MithiSecurityDrSchema] = Field(None, description="DICT Annex A-1 Section 4 Security metrics")
    mithi_data_archiving: Optional[MithiDataArchivingSchema] = Field(None, description="DICT Annex A-1 Section 5 Data Archiving metrics")
    mithi_ict_issues: Optional[MithiIctIssuesSchema] = Field(None, description="DICT Annex A-1 Section 8.2 ICT Issues checklists")

    implementation_schedules: Optional[List[ImplementationScheduleItem]] = Field([], description="Timelines and schedule milestones")

    @model_validator(mode='after')
    def validate_issp_cycle_range(self) -> 'MasterNarrativeUpdate':
        """Enforces logical range constraints on planning year parameters"""
        if self.issp_period_from is not None and self.issp_period_to is not None:
            current_year = datetime.now().year
            if self.issp_period_from < current_year - 5:
                raise ValueError(f"The starting year of the ISSP cycle ({self.issp_period_from}) cannot be earlier than {current_year - 5}.")
            
            if self.issp_period_from > self.issp_period_to:
                raise ValueError("The starting year of the ISSP cycle must be less than or equal to the ending year.")
            
            # Enforce maximum span of 10 years to prevent layout overlapping
            span = self.issp_period_to - self.issp_period_from + 1
            if span < 2 or span > 10:
                raise ValueError(f"ISSP planning span must be between 2 and 10 years. Current input is {span} years.")
        return self


class MasterNarrativeResponse(BaseModel):
    """Encompasses all written master parameters as well as diagram storage keys"""
    issp_period: str
    agency_name: str
    signatory_prepared_by: str
    signatory_approved_by: str
    mandate_html: str
    vision_html: str
    mission_html: str
    planners_json: List[ISPlannerSchema]
    manpower_json: Optional[ManpowerSchema] = None
    annual_ict_budget: Decimal
    core_offices_json: List[CoreOfficeRegistrySchema]
    strategic_concerns_json: List[StrategicConcernSchema]
    systems_json: List[ProposedSystemSchema]
    databases_json: List[DatabaseRequiredSchema]
    internal_projects_json: List[ICTProjectSchema]
    cross_projects_json: List[ICTProjectSchema]
    pmf_matrix_json: List[PMFRowSchema]
    
    org_chart_url: Optional[str] = Field(None, description="Part IV.B diagram mapping asset location")
    functional_interface_url: Optional[str] = Field(None, description="Part I.C diagram mapping asset location")
    conceptual_framework_url: Optional[str] = Field(None, description="Part II.A diagram mapping asset location")
    network_layout_url: Optional[str] = Field(None, description="Part II.D diagram mapping asset location")

    is_active: bool
    agency_logo_url: Optional[str] = None
    cert_logo_url: Optional[str] = None

    # Document transmittal coversheet properties
    transmittal_recipient: Optional[str] = None
    transmittal_recipient_title: Optional[str] = None
    transmittal_recipient_agency: Optional[str] = None
    transmittal_recipient_address: Optional[str] = None
    transmittal_date: Optional[str] = None

    # Part IV.B ICT Organizational diagram properties
    existing_ict_org_url: Optional[str] = None
    proposed_ict_org_url: Optional[str] = None
    placement_ict_org_url: Optional[str] = None
    
    # Advanced targets layout paths
    site_development_plan_url: Optional[str] = None
    fiber_backbone_url: Optional[str] = None
    system_architecture_url: Optional[str] = None
    
    # CSPC Network Diagram & Core topology (Page 129 compliance layout element)
    network_topology_url: Optional[str] = Field(None, description="Part V Network diagram and core topology mapping asset location")

    # Gap 6 ISSP Process Flow diagram representation
    process_flow_diagram_url: Optional[str] = Field(None, description="Path to the uploaded ISSP Process Flow diagram")

    # Advanced technical survey layouts
    mithi_network_profile: Optional[MithiNetworkProfile] = None
    mithi_special_solutions: List[MithiSpecialSolutionsSchema] = []
    mithi_data_center: Optional[MithiDataCenterSchema] = None
    mithi_hardware_inventory: List[MithiHardwareItemSchema] = []
    
    # Extended structured surveys response mappings (Gaps 4, 5, 8.2)
    mithi_security_dr: Optional[MithiSecurityDrSchema] = None
    mithi_data_archiving: Optional[MithiDataArchivingSchema] = None
    mithi_ict_issues: Optional[MithiIctIssuesSchema] = None

    implementation_schedules: List[ImplementationScheduleItem] = []

    # Coerce empty JSON dictionary inputs to None to prevent Pydantic validation crashes
    @field_validator('mithi_network_profile', 'mithi_data_center', 'manpower_json', mode='before')
    @classmethod
    def clear_empty_dicts(cls, v: Any) -> Any:
        if isinstance(v, dict) and not v:
            return None
        return v

    model_config = ConfigDict(from_attributes=True)


# ==========================================================
# 14. METRICS, COMMENTS & AUDIT REMARKS
# ==========================================================

class DepartmentAnalyticsResponse(BaseModel):
    """Monitoring model flag parameters identifying potential resource abuse"""
    department_id: int
    department_name: str
    total_proposals: int
    custom_proposals: int
    custom_ratio_percent: float
    requires_review_abuse: bool = Field(..., description="True if 'Other' requests exceed the 20% limit")
    missing_canvas_count: int = Field(..., description="Count of 'Other' items lacking uploaded canvas evidence files")


class CommentCreate(BaseModel):
    """Thread comment schema for general or cell-specific target parameters"""
    text: str = Field(..., min_length=1, max_length=1000, description="The inline remark or reply message body")
    field_name: Optional[str] = Field(None, description="Optional cell reference (e.g., 'unit_cost')")
    proposal_id: Optional[uuid.UUID] = Field(None, description="Pin comment directly to a specific proposal ID")
    requires_department_action: bool = Field(
        False, 
        description="Tracks if this comment acts as a workflow gate requiring department action before re-submission"
    )


class CommentResponse(BaseModel):
    """Fully compiled comment thread response for admin_remarks.html trackable state changes"""
    id: uuid.UUID
    proposal_id: Optional[uuid.UUID] = None
    field_name: Optional[str] = Field(None, description="E.g., 'unit_cost' if comment is pinned to a specific cell")
    author_name: str
    author_email: Optional[EmailStr] = None
    author_role: RoleTag
    text: str
    is_resolved: bool = False
    requires_department_action: bool = Field(
        False, 
        description="Tracks if this comment acts as a workflow gate requiring department action before re-submission"
    )

    model_config = ConfigDict(from_attributes=True)


# ==========================================================
# 15. SYSTEM GOVERNANCE THRESHOLD SETTINGS
# ==========================================================

class SystemGovernanceSettings(BaseModel):
    """Global thresholds managed by administrators to enforce systemic compliance rules"""
    custom_request_ratio_threshold: float = Field(0.20, description="Percentage limit of custom items before flagging")
    worker_timeout_seconds: int = Field(300, description="Watchdog task watchdog killer timeout")
    retention_period_years: int = Field(10, description="COA retention period mandate")
    archive_glacier_age_days: int = Field(365, description="Transition age to S3 Glacier storage")


# ==========================================================
# 16. EXTENDED AUXILIARY SCHEMAS (Gaps 1-3, 7-8, 10-13, 15-17, 23-25)
# ==========================================================

# --- Gap 1: Multi-Campus Structural Support ---
class CampusCreate(BaseModel):
    name: str = Field(..., example="CSPC Buhi Campus")
    location: str = Field(..., example="Buhi, Camarines Sur")
    code: str = Field(..., example="BUHI")


class CampusResponse(BaseModel):
    id: int
    name: str
    location: str
    code: str
    model_config = ConfigDict(from_attributes=True)


# --- Gap 2: Accreditation Levels ---
class DegreeOfferingCreate(BaseModel):
    department_name: str = Field(..., example="College of Engineering")
    degree_name: str = Field(..., example="Bachelor of Science in Civil Engineering")
    level: str = Field(..., example="Undergraduate")
    accreditation_status: Optional[str] = Field("Level III Re-Accredited", example="Level III Re-Accredited")


class DegreeOfferingResponse(BaseModel):
    id: int
    department_name: str
    degree_name: str
    level: str
    accreditation_status: Optional[str]
    model_config = ConfigDict(from_attributes=True)


# --- Gap 3: GAA Target Milestones ---
class GaaPerformanceCreate(BaseModel):
    indicator_name: str = Field(..., example="Percentage of graduates employed within 2 years")
    target_value: str = Field(..., example="67%")


class GaaPerformanceResponse(BaseModel):
    id: int
    indicator_name: str
    target_value: str
    model_config = ConfigDict(from_attributes=True)


# --- Gap 4: Strategic Concerns Matrix ---
class StrategicConcernCreate(BaseModel):
    mfo: str = Field(..., example="Advance Higher Education Services")
    critical_system: str = Field(..., example="Student Information and Accounting System (SIAS)")
    problems: str = Field(..., example="Delayed enrollment processing and grading latency.")
    intended_use: str = Field(..., example="SIAS Cloud migration with decentralized caches.")

    @field_validator('mfo', mode='before')
    @classmethod
    def resolve_mfo_normalization(cls, v: str) -> str:
        return NeedsAssessmentCreate.resolve_mfo_code(v)


class StrategicConcernResponse(BaseModel):
    id: uuid.UUID
    issp_period: str
    mfo: str
    critical_system: str
    problems: str
    intended_use: str

    @field_validator('mfo', mode='before')
    @classmethod
    def resolve_mfo_normalization_response(cls, v: str) -> str:
        return NeedsAssessmentCreate.resolve_mfo_code(v)

    model_config = ConfigDict(from_attributes=True)


# --- Gap 19: Core Offices Directory ---
class CoreOfficeFunctionCreate(BaseModel):
    office_name: str = Field(..., example="Office of the President")
    division: str = Field(..., example="Administration")
    description: str = Field(..., example="Executes institutional policies and oversees SUC academic operations.")


class CoreOfficeFunctionResponse(BaseModel):
    id: int
    issp_period: str
    office_name: str
    division: str
    description: str
    model_config = ConfigDict(from_attributes=True)


# --- Gap 7: Glossary Terms ---
class GlossaryTermCreate(BaseModel):
    term: str = Field(..., example="Batas Pambansa Blg. 512")
    definition: str = Field(..., example="The college charter law creating Camarines Sur Polytechnic Colleges.")


class GlossaryTermResponse(BaseModel):
    id: int
    term: str
    definition: str
    model_config = ConfigDict(from_attributes=True)


# --- Gap 8: General Submission Instructions ---
class GeneralInstructionCreate(BaseModel):
    step_number: int = Field(..., example=1)
    instruction_text: str = Field(..., example="This template is prescribed primarily to guide government agencies...")


class GeneralInstructionResponse(BaseModel):
    id: int
    step_number: int
    instruction_text: str
    model_config = ConfigDict(from_attributes=True)


# --- Gap 15: Server HDD Capacities ---
class ServerCapacityCreate(BaseModel):
    campus_id: int
    capacity_tier: str = Field(..., example="Above 4TB")
    location: str = Field(..., example="IN-HOUSE")
    quantity: int = Field(..., ge=0)


class ServerCapacityResponse(BaseModel):
    id: uuid.UUID
    campus_id: int
    capacity_tier: str
    location: str
    quantity: int
    model_config = ConfigDict(from_attributes=True)


# --- Gap 16: Operating Systems Census ---
class ClientOsCensusCreate(BaseModel):
    os_name: str = Field(..., example="Windows 7")
    workstations_count: int = Field(..., ge=0)
    servers_count: int = Field(..., ge=0)


class ClientOsCensusResponse(BaseModel):
    id: int
    os_name: str
    workstations_count: int
    servers_count: int
    model_config = ConfigDict(from_attributes=True)


# --- Gap 17: Office Software Census ---
class OfficeSoftwareCreate(BaseModel):
    software_name: str = Field(..., example="MS Office 2010")
    license_count: int = Field(..., ge=0)


class OfficeSoftwareResponse(BaseModel):
    id: int
    software_name: str
    license_count: int
    model_config = ConfigDict(from_attributes=True)


# --- Gap 24: Cross-Agency Collaborative Projects ---
class CrossAgencyProjectCreate(BaseModel):
    name: str = Field(..., example="National Government Portal integration")
    objectives: str = Field(..., example="To unify national citizen records pipelines.")
    duration: str = Field(..., example="2026 - 2028")
    deliverables: str = Field(..., example="API gateways and single sign-on modules.")
    lead_agency: str = Field(..., example="DICT")
    implementing_agencies: str = Field(..., example="CSPC MIS, SUC registrars")


class CrossAgencyProjectResponse(BaseModel):
    id: uuid.UUID
    issp_period: str
    name: str
    objectives: str
    duration: str
    deliverables: str
    lead_agency: str
    implementing_agencies: str
    model_config = ConfigDict(from_attributes=True)


# --- Gap 25: Performance Measurement Framework Grid ---
class PerformanceMetricCreate(BaseModel):
    project_title: str = Field(..., example="Deployment of Moodle LMS")
    result_hierarchy: str = Field(..., example="Immediate outcome")
    indicator: str = Field(..., example="Percentage of courses active inside LMS")
    baseline: str = Field(..., example="10% adoption")
    target: str = Field(..., example="100% adoption")
    collection_method: str = Field(..., example="LMS system logs audits")
    responsibility: str = Field(..., example="MICT office")


class PerformanceMetricResponse(BaseModel):
    id: uuid.UUID
    issp_period: str
    project_title: str
    result_hierarchy: str
    indicator: str
    baseline: str
    target: str
    collection_method: str
    responsibility: str
    model_config = ConfigDict(from_attributes=True)


# --- Gap 10: Multi-Year Investment Summary Cross-Tabulation ---
class InvestmentSummaryRow(BaseModel):
    item_name: str
    unit_cost: Decimal
    yearly_quantities: Dict[str, int]
    yearly_costs: Dict[str, Decimal]
    total_quantity: int
    total_cost: Decimal


# --- Gap 11/12: Annual Cost Breakdown & Continuing Institutional Costs ---
class AnnualCostBreakdownCreate(BaseModel):
    project_key: str = Field(..., example="WiFi")
    cost_type: str = Field(..., example="CapEx")
    item_description: str = Field(..., example="Enterprise Access Point")
    unit_cost: Decimal = Field(..., ge=0)
    yearly_quantities: Dict[str, int] = Field(default_factory=dict, example={"2026": 5, "2027": 0, "2028": 0})


class AnnualCostBreakdownResponse(BaseModel):
    id: uuid.UUID
    issp_period: str
    project_key: str
    cost_type: str
    item_description: str
    unit_cost: Decimal
    yearly_quantities: Dict[str, int]
    model_config = ConfigDict(from_attributes=True)


# --- Gap 13: Office-by-Office Resource Deployment Matrix ---
class DeploymentCreate(BaseModel):
    office_name: str = Field(..., example="Dean's Office")
    quantity: int = Field(..., ge=1)


class DeploymentResponse(BaseModel):
    id: uuid.UUID
    proposal_id: uuid.UUID
    office_name: str
    quantity: int
    model_config = ConfigDict(from_attributes=True)


# --- Gap 23: Interactive Gantt Timeline Editor ---
class MilestoneUpdatePayload(BaseModel):
    project_id: uuid.UUID
    milestones: Dict[str, bool] = Field(..., example={"2026_Q1": True, "2026_Q2": True, "2026_Q3": False, "2026_Q4": False})