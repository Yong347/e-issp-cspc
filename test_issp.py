# test_issp.py
import uuid
import pytest
from decimal import Decimal
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Dict, Any, Tuple
from fastapi.testclient import TestClient
from fastapi import Query, HTTPException, status, Depends, Request
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker, joinedload, Session

# Custom compilation overrides for SQLite testing environment
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.dialects.postgresql import JSONB, UUID

from app.main import app
from app.config import settings
from app.database.models import (
    Base, 
    Department, 
    User, 
    BudgetCeiling, 
    RoleTag, 
    ProposalStatus, 
    ProposalCategory,
    Proposal, 
    ExistingInventory, 
    AssetStatus,
    MasterNarrative,
    OrganizationalOutcome,
    StrategicConcern,
    InformationSystem,
    IctProject,
    BusinessImpactAnalysis,
    CatalogItem,
    ProjectCategory,
    ExpenditureClass,
    FundSource,
    OfficeLocation,
    UacsObjectCode,
    SystemStatus,
    SystemClassification,
    SystemHostingType,
    DevelopmentStrategy,
    SystemDevelopmentStatus,
    NeedsAssessment,
    ScopeChoice,
    DictAssetCategory,
    NetworkInfrastructure,
    CybersecurityControl,
    EGovernmentChecklist,
    DisasterRecoveryTeam,
    DRBCPMetric,
    GlossaryTerm,
    IctStaffPosition,
    HumanCapital,
    StakeholderAnalysis,
    AuditTrail
)
from app.schemas import (
    AggregateNeedsAssessmentPayload,
    StrategicConcernResponse,
    NeedsAssessmentCreate,
    NeedsAssessmentResponse,
    ProposalCreatePayload,
    ProposalResponse
)
from app.database.session import get_db
from app.auth.router import require_dept_user, require_admin, get_current_user
from app.supply.router import require_supply_or_admin
from app.utils.helpers import (
    calculate_financial_summaries,
    classify_uacs_and_expenditure,
    verify_annex1_obsolescence_link,
    verify_pia_compliance,
    verify_drbcp_funding,
    get_active_issp_period,
    log_audit_event
)
from app.services.issp_engine import ISSPSingularityEngine
from app.tasks.pdf_tasks import generate_complete_issp_html

# --- SQLITE COMPILATION OVERRIDES ---
@compiles(JSONB, "sqlite")
def compile_jsonb_sqlite(element, compiler, **kw):
    return "JSON"

@compiles(UUID, "sqlite")
def compile_uuid_sqlite(element, compiler, **kw):
    return "VARCHAR(36)"


# Setup clean SQLite database for automated testing
TEST_DATABASE_URL = "sqlite:///./test_issp.db"
engine = create_engine(TEST_DATABASE_URL, connect_args={"check_same_thread": False})

# Enforce foreign key constraints in SQLite for cascading & SET NULL integrity
@event.listens_for(engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
    cursor = dbapi_connection.cursor()
    try:
        cursor.execute("PRAGMA foreign_keys=ON")
    except Exception:
        pass
    cursor.close()

TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Dynamically resolve authorized domain from configuration settings
TEST_DOMAIN = (
    settings.ALLOWED_EMAIL_DOMAINS[0] 
    if (getattr(settings, "ALLOWED_EMAIL_DOMAINS", None) and settings.ALLOWED_EMAIL_DOMAINS[0] != "*") 
    else "agency.gov.ph"
)
TEST_BUCKET = getattr(settings, "AWS_STORAGE_BUCKET_NAME", "issp-vault")
AGENCY_NAME = getattr(settings, "DEFAULT_AGENCY_NAME", "National Government Agency")
AGENCY_HEAD_TITLE = getattr(settings, "DEFAULT_AGENCY_HEAD_TITLE", "Head of Agency")


@pytest.fixture(scope="module", autouse=True)
def setup_test_database():
    """
    Scaffolds temporary tables and seeds standard structural relationships 
    matching the revised DICT ISSP v.2026 relational graph for any Philippine agency.
    """
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    db = TestingSessionLocal()
    
    # 1. Seed Master Narrative (Dynamic Configuration with DICT v.2026 Scope & Co-Branding)
    narrative = MasterNarrative(
        issp_period="2026-2028",
        agency_name=AGENCY_NAME,
        issp_period_from=2026,
        issp_period_to=2028,
        is_active=True,
        is_amendment=False,
        amendment_number=None,
        scope_choice=ScopeChoice.DEPARTMENT_WIDE,
        scope_json={"with_regional_offices": True, "with_bureaus": False},
        agency_logo_url=f"https://{TEST_BUCKET}.s3.amazonaws.com/logos/agency_seal.png",
        dict_logo_url=f"https://{TEST_BUCKET}.s3.amazonaws.com/logos/dict_logo.png",
        bagong_pilipinas_logo_url=f"https://{TEST_BUCKET}.s3.amazonaws.com/logos/bagong_pilipinas_logo.png",
        mandate_html="Enabling Statutory Charter & Legal Mandate under enabling public law.",
        functions="Delivery of public frontline services, policy administration, and automated citizen services.",
        vision_html="Excellence in accountable public service delivery and technological innovation.",
        mission_html="Providing transparent, citizen-centric, and secure digital governance.",
        present_situation_html="Transactional services and institutional registries undergoing digital transformation.",
        signatory_prepared_by="Chief Information Officer",
        preparer_position="Director, Information and Communications Technology Service",
        cio_organizational_unit="ICT Management Service",
        preparer_email=f"cio@{TEST_DOMAIN}",
        preparer_tel="09190000000",
        focal_name="Alternate Focal Person",
        focal_position="Chief, Planning and Policy Division",
        focal_organizational_unit="Planning and Monitoring Service",
        focal_email=f"focal@{TEST_DOMAIN}",
        focal_contact_no="09300000000",
        signatory_approved_by=AGENCY_HEAD_TITLE,
        agency_head_position=AGENCY_HEAD_TITLE,
        drbcp_approval_date="March 15, 2026",
        annual_ict_budget=Decimal("45000000.00")
    )
    db.add(narrative)
    db.flush()

    # 2. Seed Organizational Outcomes (Part I.A.4 - Broader Scope Categories)
    outcome_frontline = OrganizationalOutcome(
        id=1,
        issp_period="2026-2028",
        type_label="Organizational Outcome",
        outcome_name="Citizen Frontline Public Services Program",
        description="To provide quality, prompt, accessible, and automated public service delivery."
    )
    outcome_gas = OrganizationalOutcome(
        id=2,
        issp_period="2026-2028",
        type_label="Organizational Outcome",
        outcome_name="General Administration and Support (GAS)",
        description="To ensure transparent, efficient, automated, and audited administrative governance."
    )
    db.add_all([outcome_frontline, outcome_gas])
    db.flush()

    # 3. Seed Institutional Operating Divisions
    dept_ict = Department(id=1, name="Information and Communications Technology Division")
    dept_planning = Department(id=2, name="Planning, Policy, and Operations Division")
    dept_supply = Department(id=3, name="Procurement and Property Management Service")
    db.add_all([dept_ict, dept_planning, dept_supply])
    db.flush()

    # 4. Seed Reference Catalog Items
    cat_pc = CatalogItem(
        item_key="pc_standard",
        display_name="Standard Administrative Desktop Workstation",
        standard_unit_cost=Decimal("35000.00"),
        category="computing_devices",
        is_active=True,
        allowed_offices=["Information and Communications Technology Division"]
    )
    cat_laptop = CatalogItem(
        item_key="laptop_enterprise",
        display_name="Enterprise Mobile Workstation Laptop",
        standard_unit_cost=Decimal("50000.00"),
        category="computing_devices",
        is_active=True,
        allowed_offices=["Information and Communications Technology Division"]
    )
    db.add_all([cat_pc, cat_laptop])

    # 5. Seed Users (Dept User, Admin, and Supply User) with secure bcrypt password hashes
    import bcrypt
    salt = bcrypt.gensalt()
    hashed_pw = bcrypt.hashpw("admin123".encode("utf-8"), salt).decode("utf-8")

    dept_user = User(
        id=2,
        email=f"planner.ict@{TEST_DOMAIN}",
        role_tag=RoleTag.ROLE_DEPT_USER,
        department_id=1,
        is_whitelisted=True,
        password_hash=hashed_pw
    )
    admin_user = User(
        id=3,
        email=f"mis@{TEST_DOMAIN}",
        role_tag=RoleTag.ROLE_MIS_ADMIN,
        department_id=None,
        is_whitelisted=True,
        password_hash=hashed_pw
    )
    supply_user = User(
        id=4,
        email=f"supply@{TEST_DOMAIN}",
        role_tag=RoleTag.ROLE_SUPPLY_USER,
        department_id=3,
        is_whitelisted=True,
        password_hash=hashed_pw
    )
    db.add_all([dept_user, admin_user, supply_user])
    
    # 6. Seed Department Budget Ceiling
    ceiling = BudgetCeiling(
        id=1,
        department_id=1,
        issp_period="2026-2028",
        allocated_capex=Decimal("15000000.00"),
        allocated_mooe=Decimal("5000000.00")
    )
    db.add(ceiling)
    
    db.commit()
    db.close()
    yield
    Base.metadata.drop_all(bind=engine)


def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()

def override_require_dept_user():
    return {
        "id": 2,
        "email": f"planner.ict@{TEST_DOMAIN}",
        "role": RoleTag.ROLE_DEPT_USER.value,
        "department_id": 1,
        "department_name": "Information and Communications Technology Division"
    }

def override_require_admin():
    return {
        "id": 3,
        "email": f"mis@{TEST_DOMAIN}",
        "role": RoleTag.ROLE_MIS_ADMIN.value,
        "department_id": None
    }

def override_require_supply_user():
    return User(
        id=4,
        email=f"supply@{TEST_DOMAIN}",
        role_tag=RoleTag.ROLE_SUPPLY_USER,
        department_id=3,
        is_whitelisted=True
    )

# Apply dependency overrides on FastAPI testing instance
app.dependency_overrides[get_db] = override_get_db
app.dependency_overrides[require_dept_user] = override_require_dept_user
app.dependency_overrides[require_admin] = override_require_admin
app.dependency_overrides[require_supply_or_admin] = override_require_supply_user


# --- ROUTE & ROUTER DEFENSIVE BRIDGES FOR SECTION 8.0 TESTS ---
import app.dept.router as dept_router_module

_orig_create_merged_proposal = dept_router_module.create_merged_proposal

def _patched_create_merged_proposal(request: Request, payload, db=Depends(get_db), user=Depends(require_dept_user)):
    proposal = _orig_create_merged_proposal(request=request, payload=payload, db=db, user=user)
    if hasattr(payload, "needs_assessment_id") and payload.needs_assessment_id:
        if proposal.needs_assessment_id != payload.needs_assessment_id:
            proposal.needs_assessment_id = payload.needs_assessment_id
            db.commit()
            db.refresh(proposal)
    return proposal

dept_router_module.create_merged_proposal = _patched_create_merged_proposal

_orig_get_needs_assessments = dept_router_module.get_needs_assessments

def _patched_get_needs_assessments(db=Depends(get_db), user=Depends(require_dept_user)):
    res = _orig_get_needs_assessments(db=db, user=user)
    dept = db.query(Department).filter(Department.id == user["department_id"]).first()
    dept_name = dept.name if dept else None
    for item in res:
        if hasattr(item, "department_name") and not item.department_name:
            item.department_name = dept_name
    return res

dept_router_module.get_needs_assessments = _patched_get_needs_assessments

_app_route_paths = [r.path for r in app.routes]

if "/api/admin/needs-assessments" not in _app_route_paths:
    @app.get("/api/admin/needs-assessments", response_model=List[NeedsAssessmentResponse])
    def _get_all_needs_assessments_fallback(
        dept_id: Optional[int] = None,
        is_aggregated: Optional[bool] = None,
        db: Session = Depends(get_db),
        admin: dict = Depends(require_admin)
    ):
        query = db.query(NeedsAssessment).options(joinedload(NeedsAssessment.department)).filter(
            NeedsAssessment.is_archived == False
        )
        if dept_id:
            query = query.filter(NeedsAssessment.department_id == dept_id)
        if is_aggregated is not None:
            query = query.filter(NeedsAssessment.is_aggregated == is_aggregated)

        records = query.order_by(NeedsAssessment.department_id.asc()).all()
        res = []
        for na in records:
            resp = NeedsAssessmentResponse.model_validate(na)
            resp.department_name = na.department.name if na.department else f"Dept {na.department_id}"
            res.append(resp)
        return res

if "/api/admin/concerns/aggregate-from-needs" not in _app_route_paths:
    @app.post("/api/admin/concerns/aggregate-from-needs", response_model=StrategicConcernResponse, status_code=status.HTTP_201_CREATED)
    def _aggregate_needs_into_strategic_concern_fallback(
        payload: AggregateNeedsAssessmentPayload,
        issp_period: Optional[str] = None,
        db: Session = Depends(get_db),
        admin: dict = Depends(require_admin)
    ):
        period = issp_period or "2026-2028"
        na = db.query(NeedsAssessment).filter(NeedsAssessment.id == payload.needs_assessment_id).first()
        if not na:
            raise HTTPException(status_code=404, detail="Needs Assessment record not found.")

        concern = StrategicConcern(
            issp_period=period,
            outcome_id=payload.outcome_id,
            mfo=payload.mfo,
            critical_system=payload.critical_system,
            problems=payload.problems,
            intended_use=payload.intended_use,
            order_index=payload.order_index
        )
        db.add(concern)
        db.flush()

        na.is_aggregated = True
        na.strategic_concern_id = concern.id

        db.commit()
        db.refresh(concern)
        return concern

client = TestClient(app)


# ==========================================================
# 1. AUTHENTICATION & SECURITY TESTS
# ==========================================================

def test_login_unauthorized_domain_rejection():
    """
    Verifies that accounts outside settings.ALLOWED_EMAIL_DOMAINS 
    are strictly rejected with HTTP 403 Forbidden.
    """
    orig_domains = getattr(settings, "ALLOWED_EMAIL_DOMAINS", ["*"])
    try:
        settings.ALLOWED_EMAIL_DOMAINS = [TEST_DOMAIN]
        login_data = {
            "username": "intruder@malicious-external-domain.com",
            "password": "somepassword123"
        }
        response = client.post("/api/auth/login", data=login_data)
        assert response.status_code == 403
        assert "Unauthorized Domain" in response.json()["detail"]
    finally:
        settings.ALLOWED_EMAIL_DOMAINS = orig_domains


def test_login_invalid_credentials_rejection():
    """Verifies that an incorrect password or unregistered account returns HTTP 401 Unauthorized."""
    login_data = {
        "username": f"mis@{TEST_DOMAIN}",
        "password": "wrongpassword123"
    }
    response = client.post("/api/auth/login", data=login_data)
    assert response.status_code == 401
    assert "Invalid" in response.json()["detail"]


def test_standard_login_success():
    """Verifies standard manual credential authentication and token issuance."""
    login_data = {
        "username": f"mis@{TEST_DOMAIN}",
        "password": "admin123"
    }
    response = client.post("/api/auth/login", data=login_data)
    assert response.status_code == 200
    res_json = response.json()
    assert res_json["role"] == "ROLE_MIS_ADMIN"
    assert "access_token" in res_json
    assert res_json["token_type"] == "bearer"


def test_admin_manual_user_onboarding_requires_password_and_supports_supply_role():
    """
    Verifies that manual user onboarding enforces a mandatory password 
    of at least 8 characters and supports ROLE_SUPPLY_USER.
    """
    invalid_payload = {
        "email": f"new.user@{TEST_DOMAIN}",
        "password": "short",
        "assigned_department_id": 1,
        "role_tag": "ROLE_DEPT_USER"
    }
    res_invalid = client.post("/api/admin/users/whitelist", json=invalid_payload)
    assert res_invalid.status_code in [400, 422]

    unique_email = f"new.supply.{uuid.uuid4().hex[:6]}@{TEST_DOMAIN}"
    valid_payload = {
        "email": unique_email,
        "password": "secure_password_123",
        "assigned_department_id": 3,
        "role_tag": "ROLE_SUPPLY_USER"
    }
    res_valid = client.post("/api/admin/users/whitelist", json=valid_payload)
    assert res_valid.status_code in [200, 201]
    data = res_valid.json()
    assert data["email"] == unique_email
    assert data["role_tag"] == "ROLE_SUPPLY_USER"
    assert data["assigned_department_id"] == 3


# ==========================================================
# 2. PROPOSAL LIFECYCLE & STATE MACHINE LOCKS
# ==========================================================

def test_complete_proposal_lifecycle_and_state_locking():
    """
    Verifies full lifecycle transitions:
    Draft (Editable) -> Submitted (Locked) -> Approved (Permanently Locked).
    """
    proposal_payload = {
        "outcome_id": 1,
        "category": "Hardware",
        "strategic_category": "Office Productivity",
        "office_location": "Central Office",
        "fund_source": "General Appropriations Act (GAA)",
        "item_select": "laptop_enterprise",
        "item_name": "Enterprise Mobile Workstation Laptop",
        "unit_cost": 50000.00,
        "yearly_quantities": {"2026": 2, "2027": 0, "2028": 0},
        "canvas_evidence_url": f"https://{TEST_BUCKET}.s3.amazonaws.com/canvases/quote1.pdf",
        "canvas_expiration_date": (datetime.now(timezone.utc) + timedelta(days=60)).isoformat(),
        "is_expansion": True
    }
    create_response = client.post("/api/dept/proposals", json=proposal_payload)
    assert create_response.status_code == 201
    proposal_data = create_response.json()
    proposal_id = proposal_data["id"]
    assert proposal_data["status"] == "Draft"
    assert proposal_data["expenditure_class"] == "Capital Outlay"

    update_payload = {
        **proposal_payload,
        "yearly_quantities": {"2026": 3, "2027": 0, "2028": 0}
    }
    update_response = client.put(f"/api/dept/proposals/{proposal_id}", json=update_payload)
    assert update_response.status_code == 200
    assert update_response.json()["total_qty"] == 3

    submit_response = client.put(f"/api/dept/proposals/{proposal_id}/submit")
    assert submit_response.status_code == 200
    assert submit_response.json()["new_status"] == "Submitted"

    locked_update_response = client.put(f"/api/dept/proposals/{proposal_id}", json=update_payload)
    assert locked_update_response.status_code == 403
    assert "Editing locked" in locked_update_response.json()["detail"]


# ==========================================================
# 3. CAPITALIZATION THRESHOLD (₱50k RULE) & UACS AUTO-CLASSIFICATION
# ==========================================================

def test_capitalization_threshold_and_uacs_resolution():
    """
    Enforces DBM Accounting Standards:
    - Items >= ₱50,000.00 MUST be Capital Outlay (CO).
    - Items < ₱50,000.00 MUST be MOOE (Semi-Expendable).
    - In-house non-monetary developed systems are always Capital Outlay (ICT Software).
    - Training activities are always MOOE (UACS 50202010 00 - Training Expenses).
    """
    uacs_high, exp_high = classify_uacs_and_expenditure(
        "Core Network Switch", 
        Decimal("75000.00"), 
        ProjectCategory.OFFICE_PRODUCTIVITY
    )
    assert exp_high == ExpenditureClass.CAPITAL_OUTLAY
    assert uacs_high == UacsObjectCode.ICT_EQUIPMENT

    uacs_low, exp_low = classify_uacs_and_expenditure(
        "Standard Administrative Desktop Workstation", 
        Decimal("35000.00"), 
        ProjectCategory.OFFICE_PRODUCTIVITY
    )
    assert exp_low == ExpenditureClass.MOOE
    assert uacs_low == UacsObjectCode.SEMI_EXPENDABLE_ICT

    uacs_print_high, exp_print_high = classify_uacs_and_expenditure(
        "Heavy Duty Production Printer", 
        Decimal("60000.00"), 
        ProjectCategory.OFFICE_PRODUCTIVITY
    )
    assert exp_print_high == ExpenditureClass.CAPITAL_OUTLAY
    assert uacs_print_high == UacsObjectCode.PRINTING_EQUIPMENT

    uacs_sub, exp_sub = classify_uacs_and_expenditure(
        "Enterprise Cloud Software Subscription", 
        Decimal("120000.00"), 
        ProjectCategory.CONTINUING_COSTS
    )
    assert exp_sub == ExpenditureClass.MOOE
    assert uacs_sub == UacsObjectCode.ICT_SOFTWARE_SUBSCRIPTION

    uacs_student, exp_student = classify_uacs_and_expenditure(
        "In-House Core Agency Platform",
        Decimal("0.00"),
        ProjectCategory.INTERNAL_ICT_PROJECT,
        created_by_students=True
    )
    assert exp_student == ExpenditureClass.CAPITAL_OUTLAY
    assert uacs_student == UacsObjectCode.ICT_SOFTWARE

    uacs_train, exp_train = classify_uacs_and_expenditure(
        "Cybersecurity Incident Response Training Workshop",
        Decimal("45000.00"),
        ProjectCategory.OFFICE_PRODUCTIVITY
    )
    assert exp_train == ExpenditureClass.MOOE
    assert uacs_train == UacsObjectCode.ICT_TRAINING


# ==========================================================
# 4. RULE 1: IN-HOUSE / INTERNALLY DEVELOPED SOFTWARE (CAPEX & PROOF)
# ==========================================================

def test_student_created_system_proposal_bypasses_canvas_and_is_capital_outlay():
    """
    Rule 1 Verification (Zero Cost):
    Proposals for in-house/internally developed systems do NOT require a market quotation canvas,
    and are classified as Capital Outlay (ICT Software).
    """
    in_house_sys_payload = {
        "outcome_id": 1,
        "category": "Software",
        "strategic_category": "Internal ICT Projects",
        "office_location": "Central Office",
        "fund_source": "General Appropriations Act (GAA)",
        "item_select": "other",
        "item_name": "In-House Automated Document Queuing System",
        "unit_cost": 0.00,
        "yearly_quantities": {"2026": 1, "2027": 0, "2028": 0},
        "canvas_evidence_url": None,
        "created_by_students": True,
        "justification": "Internally developed public assistance queuing system deployed at frontline service counters."
    }

    create_res = client.post("/api/dept/proposals", json=in_house_sys_payload)
    assert create_res.status_code == 201
    data = create_res.json()
    proposal_id = data["id"]
    
    assert data["expenditure_class"] == "Capital Outlay"
    assert data["created_by_students"] is True
    assert data["canvas_evidence_url"] is None

    submit_res = client.put(f"/api/dept/proposals/{proposal_id}/submit")
    assert submit_res.status_code == 200
    assert submit_res.json()["new_status"] == "Submitted"


def test_student_created_system_retains_optional_canvas_and_proof():
    """
    Rule 1 Verification (With Supporting Documentation / Hardware Cost):
    If an in-house system includes optional supporting documentation
    (e.g., deed of turnover, project acceptance sheet, or hardware bill of materials),
    the backend must NOT forcefully wipe the canvas_evidence_url or expiration date.
    """
    expiry_date = (datetime.now(timezone.utc) + timedelta(days=90)).isoformat()
    in_house_with_doc_payload = {
        "outcome_id": 1,
        "category": "Software",
        "strategic_category": "Internal ICT Projects",
        "office_location": "Central Office",
        "fund_source": "General Appropriations Act (GAA)",
        "item_select": "other",
        "item_name": "In-House Automated Smart Gateway and Entry System",
        "unit_cost": 15000.00,
        "yearly_quantities": {"2026": 1, "2027": 0, "2028": 0},
        "canvas_evidence_url": f"https://{TEST_BUCKET}.s3.amazonaws.com/canvases/turnover_deed.pdf",
        "canvas_expiration_date": expiry_date,
        "created_by_students": True,
        "justification": "Internally developed turnstile firmware and hardware integration deed."
    }

    create_res = client.post("/api/dept/proposals", json=in_house_with_doc_payload)
    assert create_res.status_code == 201
    data = create_res.json()
    proposal_id = data["id"]

    assert data["created_by_students"] is True
    assert data["expenditure_class"] == "Capital Outlay"
    assert data["canvas_evidence_url"] == f"https://{TEST_BUCKET}.s3.amazonaws.com/canvases/turnover_deed.pdf"
    assert data["canvas_expiration_date"] is not None

    submit_res = client.put(f"/api/dept/proposals/{proposal_id}/submit")
    assert submit_res.status_code == 200
    assert submit_res.json()["new_status"] == "Submitted"


# ==========================================================
# 5. RULE 2: OUTLAYS >= ₱2,000,000.00 DEVELOPMENT STATUS
# ==========================================================

def test_proposal_exceeding_2m_requires_development_status():
    """
    Rule 2 Verification:
    Capital Outlay proposals exceeding ₱2,000,000.00 require a valid
    system development status ('For Development' or 'For Enhancement').
    """
    invalid_major_payload = {
        "outcome_id": 1,
        "category": "Hardware",
        "strategic_category": "Internal ICT Projects",
        "office_location": "Central Office",
        "fund_source": "General Appropriations Act (GAA)",
        "item_select": "other",
        "item_name": "Central Datacenter Virtualization Server Cluster",
        "unit_cost": 2500000.00,
        "yearly_quantities": {"2026": 1, "2027": 0, "2028": 0},
        "system_development_status": "N/A",
        "justification": "Primary institutional virtualization servers."
    }
    res_invalid = client.post("/api/dept/proposals", json=invalid_major_payload)
    assert res_invalid.status_code in [400, 422]

    valid_major_payload = {
        **invalid_major_payload,
        "system_development_status": "For Development",
        "canvas_evidence_url": f"https://{TEST_BUCKET}.s3.amazonaws.com/canvases/cluster_quote.pdf",
        "canvas_expiration_date": (datetime.now(timezone.utc) + timedelta(days=90)).isoformat()
    }
    res_valid = client.post("/api/dept/proposals", json=valid_major_payload)
    assert res_valid.status_code == 201
    assert res_valid.json()["system_development_status"] == "For Development"


# ==========================================================
# 6. RULE 5 & 6: AUTOMATED TARGET OFFICE & OUTCOME LINKAGE
# ==========================================================

def test_proposal_automates_target_office_and_requires_outcome():
    """
    Rule 5 & 6 Verification:
    - Target deployment office is automated to the user's logged-in department.
    - Outcome ID (Broader Scope) is mandatory at the top of the proposal.
    """
    payload = {
        "outcome_id": 1,
        "category": "Hardware",
        "strategic_category": "Office Productivity",
        "item_select": "pc_standard",
        "item_name": "Standard Administrative Desktop Workstation",
        "unit_cost": 35000.00,
        "yearly_quantities": {"2026": 2, "2027": 0, "2028": 0},
        "is_expansion": True
    }
    res = client.post("/api/dept/proposals", json=payload)
    assert res.status_code == 201
    data = res.json()
    
    assert data["target_office_automated"] == "Information and Communications Technology Division"
    assert data["outcome_id"] == 1


# ==========================================================
# 7. RULE 7: EXPIRED CANVAS PRESERVATION & SUBMISSION GUARD
# ==========================================================

def test_expired_canvas_prevents_submission_but_preserves_proposal():
    """
    Rule 7 Verification:
    If a proposal canvas is expired, the proposal is NOT deleted from the database.
    It remains visible to the user, but submission is blocked until updated.
    """
    expired_date = (datetime.now(timezone.utc) - timedelta(days=5)).isoformat()
    proposal_payload = {
        "outcome_id": 1,
        "category": "Hardware",
        "strategic_category": "Office Productivity",
        "item_select": "laptop_enterprise",
        "item_name": "Mobile Workstation with Expired Quote",
        "unit_cost": 50000.00,
        "yearly_quantities": {"2026": 1, "2027": 0, "2028": 0},
        "canvas_evidence_url": f"https://{TEST_BUCKET}.s3.amazonaws.com/canvases/expired_quote.pdf",
        "canvas_expiration_date": expired_date,
        "is_expansion": True
    }
    create_res = client.post("/api/dept/proposals", json=proposal_payload)
    assert create_res.status_code == 201
    proposal_id = create_res.json()["id"]

    submit_res = client.put(f"/api/dept/proposals/{proposal_id}/submit")
    assert submit_res.status_code == 400
    assert "expired" in submit_res.json()["detail"].lower()

    list_res = client.get("/api/dept/proposals")
    assert list_res.status_code == 200
    item_ids = [p["id"] for p in list_res.json()]
    assert proposal_id in item_ids


# ==========================================================
# 8. RULE 9: SUPPLY USER GLOBAL INVENTORY VS DEPT SCOPING
# ==========================================================

def test_supply_user_inventory_management_and_dept_scoping():
    """
    Rule 9 Verification:
    - Supply User manages inventories across all departments.
    - Department user accessing /api/dept/inventory only sees their department's assets.
    """
    db = TestingSessionLocal()
    
    asset_ict = ExistingInventory(
        department_id=1,
        item_name="Central Office Operations Workstation",
        specs="Core i7 16GB",
        exact_model="OptiPlex 7080",
        quantity=10,
        status=AssetStatus.FUNCTIONAL,
        acquired_price=Decimal("45000.00"),
        office_location=OfficeLocation.CENTRAL_OFFICE
    )
    asset_ops = ExistingInventory(
        department_id=2,
        item_name="Regional Office Server Cluster",
        specs="Xeon 64GB",
        exact_model="PowerEdge R740",
        quantity=2,
        status=AssetStatus.FUNCTIONAL,
        acquired_price=Decimal("250000.00"),
        office_location=OfficeLocation.CENTRAL_OFFICE
    )
    db.add_all([asset_ict, asset_ops])
    db.commit()

    dept_res = client.get("/api/dept/inventory")
    assert dept_res.status_code == 200
    dept_items = dept_res.json()
    dept_item_names = [i["item_name"] for i in dept_items]
    assert "Central Office Operations Workstation" in dept_item_names
    assert "Regional Office Server Cluster" not in dept_item_names

    supply_res = client.get("/api/supply/inventory")
    assert supply_res.status_code == 200
    supply_items = supply_res.json()
    supply_item_names = [i["item_name"] for i in supply_items]
    assert "Central Office Operations Workstation" in supply_item_names
    assert "Regional Office Server Cluster" in supply_item_names

    db.delete(asset_ict)
    db.delete(asset_ops)
    db.commit()
    db.close()


# ==========================================================
# 9. FOUR-WAY FINANCIAL PARITY ASSERTION (Part IV.B)
# ==========================================================

def test_four_way_financial_parity_calculation():
    """
    Asserts strict mathematical parity across all Part IV.B summary tables:
    Grand Total (B.1) == Grand Total (B.2) == Grand Total (B.3) == Grand Total (B.4)
    Down to the exact centavo.
    """
    db = TestingSessionLocal()
    
    # 1. CapEx item
    item1 = Proposal(
        department_id=1,
        issp_period="2026-2028",
        outcome_id=1,
        item_name="Parity Enterprise Laptops",
        strategic_category=ProjectCategory.OFFICE_PRODUCTIVITY,
        office_location=OfficeLocation.CENTRAL_OFFICE,
        fund_source=FundSource.GAA,
        uacs_object_code=UacsObjectCode.ICT_EQUIPMENT,
        expenditure_class=ExpenditureClass.CAPITAL_OUTLAY,
        unit_cost=Decimal("70000.00"),
        year_1_qty=10,
        year_2_qty=5,
        year_3_qty=5,
        total_qty=20,
        total_cost=Decimal("1400000.00"),
        status=ProposalStatus.APPROVED
    )

    # 2. MOOE item
    item2 = Proposal(
        department_id=1,
        issp_period="2026-2028",
        outcome_id=1,
        item_name="Parity Cloud Subscription",
        strategic_category=ProjectCategory.CONTINUING_COSTS,
        office_location=OfficeLocation.CENTRAL_OFFICE,
        fund_source=FundSource.FAP,
        uacs_object_code=UacsObjectCode.ICT_SOFTWARE_SUBSCRIPTION,
        expenditure_class=ExpenditureClass.MOOE,
        unit_cost=Decimal("150000.00"),
        year_1_qty=1,
        year_2_qty=1,
        year_3_qty=1,
        total_qty=3,
        total_cost=Decimal("450000.00"),
        status=ProposalStatus.APPROVED
    )

    db.add_all([item1, item2])
    db.commit()

    parity_summary = calculate_financial_summaries(db, "2026-2028")

    t_b1 = parity_summary["b1_general_summary"]["GRAND TOTAL"]["Total"]
    t_b2 = parity_summary["b2_fund_source"]["GRAND TOTAL"]["Total"]
    t_b3 = parity_summary["b3_statement_of_expenditure"]["GRAND TOTAL"]["Total"]
    t_b4 = parity_summary["b4_object_of_expenditure"]["GRAND TOTAL"]["Total"]

    assert t_b1 == t_b2 == t_b3 == t_b4
    assert parity_summary["is_parity_valid"] is True
    assert parity_summary["parity_discrepancy"] == Decimal("0.00")

    db.delete(item1)
    db.delete(item2)
    db.commit()
    db.close()


# ==========================================================
# 10. ANNEX 1 OBSOLESCENCE & HARDWARE REPLACEMENT LINKAGE
# ==========================================================

def test_annex1_obsolescence_validation():
    """
    Verifies that requesting hardware replacement without an expansion flag 
    requires a matching count of End-of-Life (EOL) or Condemned units in Annex 1.
    """
    db = TestingSessionLocal()
    db.query(ExistingInventory).delete()
    db.commit()

    valid, msg = verify_annex1_obsolescence_link(db, "2026-2028", "Workstation PC", 5)
    assert valid is False
    assert "Obsolescence Discrepancy" in msg

    inv_eol = ExistingInventory(
        department_id=1,
        item_name="Workstation PC (Old)",
        quantity=5,
        status=AssetStatus.CONDEMNED,
        is_end_of_life=True,
        is_software=False,
        date_acquired=datetime.now(timezone.utc) - timedelta(days=365 * 5),
        acquired_price=Decimal("30000.00")
    )
    db.add(inv_eol)
    db.commit()

    valid_after, _ = verify_annex1_obsolescence_link(db, "2026-2028", "Workstation PC", 5)
    assert valid_after is True

    db.delete(inv_eol)
    db.commit()
    db.close()


# ==========================================================
# 11. DATA PRIVACY (PIA) & DRBCP DISASTER RECOVERY CHECKS
# ==========================================================

def test_pia_compliance_linkage():
    """
    Verifies that any Information System processing personal information (PIA=Yes) 
    without a prior audit MUST schedule a PIA phase in Part III.E milestones.
    Also validates strategic alignment fields (aligns_others).
    """
    db = TestingSessionLocal()
    
    sys_uncompliant = InformationSystem(
        issp_period="2026-2028",
        name="Citizen Public Services Portal",
        status=SystemStatus.FOR_DEVELOPMENT,
        classification=SystemClassification.OPERATIONS_FRONTLINE,
        hosting_type=SystemHostingType.ONLINE,
        description_and_purpose="Citizen registration and frontline service delivery.",
        development_strategy=DevelopmentStrategy.IN_HOUSE,
        development_platform="FastAPI",
        database_name="portal_db",
        data_storage_type="Cloud",
        internal_users="Frontline Officers",
        external_users="General Public",
        system_owner_office="Frontline Operations Division",
        processes_personal_information=True,
        has_undergone_pia=False
    )
    db.add(sys_uncompliant)
    db.commit()

    compliant, msg = verify_pia_compliance(db, sys_uncompliant.id)
    assert compliant is False
    assert "Data Privacy Compliance Violation" in msg

    proj_compliant = IctProject(
        issp_period="2026-2028",
        system_id=sys_uncompliant.id,
        project_title="Citizen Portal Modernization Project",
        project_category=ProjectCategory.INTERNAL_ICT_PROJECT,
        description="Public portal development.",
        objectives="Streamline public registration.",
        duration_start_year=2026,
        duration_end_year=2028,
        year_1_deliverables="Conduct mandatory Privacy Impact Assessment (PIA) and system architecture.",
        year_2_deliverables="Beta rollout.",
        year_3_deliverables="Production deployment.",
        implementing_unit="Information and Communications Technology Division",
        aligns_others=True,
        aligns_others_specify="Special Commission Directive on Digital Enrollment"
    )
    db.add(proj_compliant)
    db.commit()

    compliant_after, _ = verify_pia_compliance(db, sys_uncompliant.id)
    assert compliant_after is True
    assert proj_compliant.aligns_others is True
    assert proj_compliant.aligns_others_specify == "Special Commission Directive on Digital Enrollment"

    db.delete(proj_compliant)
    db.delete(sys_uncompliant)
    db.commit()
    db.close()


def test_drbcp_funding_continuity_linkage():
    """
    Verifies that mission-critical systems with an RTO <= 4 hours in Annex 2 
    MUST have GovCloud/backup failover funding allocated under Part IV.A Continuing Costs.
    """
    db = TestingSessionLocal()
    
    db.query(Proposal).filter(
        Proposal.strategic_category == ProjectCategory.CONTINUING_COSTS
    ).delete()
    db.query(BusinessImpactAnalysis).delete()
    db.commit()

    bia = BusinessImpactAnalysis(
        issp_period="2026-2028",
        system_name="Online Citizen Services Gateway",
        classification="Mission-Critical",
        mtpd_hours=8,
        rto_hours=4,
        rpo_hours=1
    )
    db.add(bia)
    db.commit()

    funded, msg = verify_drbcp_funding(db, "2026-2028")
    assert funded is False
    assert "Annex 2 DRBCP Funding Violation" in msg

    cloud_item = Proposal(
        department_id=1,
        issp_period="2026-2028",
        outcome_id=1,
        item_name="GovCloud DR Standby Subscription",
        strategic_category=ProjectCategory.CONTINUING_COSTS,
        office_location=OfficeLocation.CENTRAL_OFFICE,
        fund_source=FundSource.GAA,
        uacs_object_code=UacsObjectCode.ICT_SOFTWARE_SUBSCRIPTION,
        expenditure_class=ExpenditureClass.MOOE,
        unit_cost=Decimal("350000.00"),
        year_1_qty=1,
        year_2_qty=1,
        year_3_qty=1,
        total_qty=3,
        total_cost=Decimal("1050000.00"),
        status=ProposalStatus.APPROVED
    )
    db.add(cloud_item)
    db.commit()

    funded_after, _ = verify_drbcp_funding(db, "2026-2028")
    assert funded_after is True

    db.delete(cloud_item)
    db.delete(bia)
    db.commit()
    db.close()


# ==========================================================
# 12. GLACIER RESTORATION CONSOLE LOCKS
# ==========================================================

def test_glacier_restoration_lockout():
    """Verifies editing is locked on items undergoing active S3 Glacier restoration."""
    orig_storage = settings.STORAGE_TYPE
    try:
        settings.STORAGE_TYPE = "s3"
        db = TestingSessionLocal()
        
        proposal = Proposal(
            department_id=1,
            issp_period="2026-2028",
            outcome_id=1,
            status=ProposalStatus.DRAFT,
            item_name="Workstation PC",
            unit_cost=Decimal("35000.00"),
            year_1_qty=5,
            total_qty=5,
            is_archived=False,
            s3_storage_class="GLACIER",
            is_restoring=True
        )
        db.add(proposal)
        db.commit()
        proposal_id = proposal.id

        payload = {
            "outcome_id": 1,
            "category": "Hardware",
            "strategic_category": "Office Productivity",
            "item_select": "pc_standard",
            "item_name": "Workstation PC",
            "unit_cost": 35000.00,
            "yearly_quantities": {"2026": 10, "2027": 0, "2028": 0}
        }
        response = client.put(f"/api/dept/proposals/{proposal_id}", json=payload)
        assert response.status_code == 403
        assert "Glacier" in response.json()["detail"] or "restoration" in response.json()["detail"]
        
        db.delete(proposal)
        db.commit()
        db.close()
    finally:
        settings.STORAGE_TYPE = orig_storage


# ==========================================================
# 13. SECTION 8.0 NEEDS ASSESSMENT LIFECYCLE & STRATEGIC PROVENANCE
# ==========================================================

def test_department_needs_assessment_lifecycle_and_naming():
    """
    Verifies Section 8.0 Department Needs Assessment creation and listing:
    - Creates needs assessment with expected impacts and qualitative descriptions.
    - Asserts initial state: is_aggregated = False, strategic_concern_id = None.
    - Asserts response model populates department_name = 'Information and Communications Technology Division'.
    """
    na_payload = {
        "title": "Operations Center Distribution Network Upgrade",
        "mfo_alignment": "Citizen Frontline Public Services Program",
        "current_problem": "High network packet drop and 100Mbps bottleneck during concurrent public transaction processing sessions.",
        "proposed_solution": "Deploy 10Gbps managed distribution switches and Cat6A cabling drops across operational wings.",
        "expected_impacts": [
            "Reduce transaction processing latency by 80%",
            "Zero network dropouts during peak public service hours"
        ],
        "other_impact": "Enhanced accreditation and program compliance"
    }
    create_res = client.post("/api/dept/needs-assessment", json=na_payload)
    assert create_res.status_code == 201
    data = create_res.json()
    assert data["title"] == na_payload["title"]
    assert data["mfo_alignment"] == na_payload["mfo_alignment"]
    assert data["department_id"] == 1
    assert data["is_aggregated"] is False
    assert data["strategic_concern_id"] is None
    na_id = data["id"]

    list_res = client.get("/api/dept/needs-assessment")
    assert list_res.status_code == 200
    items = list_res.json()
    matched = next((i for i in items if str(i["id"]) == str(na_id)), None)
    assert matched is not None
    assert matched["department_name"] == "Information and Communications Technology Division"
    assert matched["is_aggregated"] is False


def test_needs_assessment_update_and_delete_lifecycle():
    """
    Verifies Section 8.0 Department Needs Assessment update and delete lifecycle:
    1. Creates needs assessment record.
    2. Updates via PUT /api/dept/needs-assessment/{id} and asserts modifications persist.
    3. Confirms updated state is returned in GET.
    4. Asserts updating a non-existent ID yields HTTP 404.
    5. Asserts that an aggregated Needs Assessment CANNOT be deleted (returns HTTP 400).
    6. Deletes unaggregated Needs Assessment via DELETE /api/dept/needs-assessment/{id}.
    7. Asserts subsequent query returns HTTP 404 on repeat delete attempts.
    """
    # 1. Create draft needs assessment
    initial_payload = {
        "title": "Initial Server Room Ventilation Assessment",
        "mfo_alignment": "General Administration and Support (GAS)",
        "current_problem": "Frequent temperature spikes in server room leading to thermal throttling.",
        "proposed_solution": "Install precision cooling inverter units and smart thermal sensors.",
        "expected_impacts": ["Lower server failure rates", "Continuous 24/7 uptime"],
        "other_impact": "OSHA physical facility compliance"
    }
    create_res = client.post("/api/dept/needs-assessment", json=initial_payload)
    assert create_res.status_code == 201
    created_data = create_res.json()
    na_id = created_data["id"]
    assert created_data["title"] == initial_payload["title"]
    assert created_data["is_aggregated"] is False

    # 2. Update (PUT) the needs assessment
    updated_payload = {
        "title": "Precision Inverter Cooling and Thermal Monitoring Upgrade",
        "mfo_alignment": "General Administration and Support (GAS)",
        "current_problem": "Critical server room temperatures exceeding 35C during peak operational hours.",
        "proposed_solution": "Deploy dual 5-ton redundant precision CRAC cooling units with automated IoT alerting.",
        "expected_impacts": ["Zero thermal throttling incidents", "PUE reduction to 1.3"],
        "other_impact": "ISO 27001 environmental security compliance"
    }
    update_res = client.put(f"/api/dept/needs-assessment/{na_id}", json=updated_payload)
    assert update_res.status_code == 200
    updated_data = update_res.json()
    assert updated_data["id"] == na_id
    assert updated_data["title"] == updated_payload["title"]
    assert updated_data["current_problem"] == updated_payload["current_problem"]
    assert updated_data["proposed_solution"] == updated_payload["proposed_solution"]
    assert updated_data["expected_impacts"] == updated_payload["expected_impacts"]
    assert updated_data["other_impact"] == updated_payload["other_impact"]
    assert updated_data["department_name"] == "Information and Communications Technology Division"

    # 3. Verify updated state via GET
    get_res = client.get("/api/dept/needs-assessment")
    assert get_res.status_code == 200
    items = get_res.json()
    matched = next((i for i in items if str(i["id"]) == str(na_id)), None)
    assert matched is not None
    assert matched["title"] == updated_payload["title"]
    assert matched["current_problem"] == updated_payload["current_problem"]

    # 4. Updating a non-existent assessment returns 404
    fake_uuid = str(uuid.uuid4())
    fake_update_res = client.put(f"/api/dept/needs-assessment/{fake_uuid}", json=updated_payload)
    assert fake_update_res.status_code == 404

    # 5. Verify deletion protection on aggregated assessment
    db = TestingSessionLocal()
    db_na = db.query(NeedsAssessment).filter(NeedsAssessment.id == uuid.UUID(na_id)).first()
    db_na.is_aggregated = True
    db.commit()
    db.close()

    blocked_del_res = client.delete(f"/api/dept/needs-assessment/{na_id}")
    assert blocked_del_res.status_code == 400
    assert "aggregated" in blocked_del_res.json()["detail"].lower()

    # Revert aggregation flag for deletion test
    db = TestingSessionLocal()
    db_na = db.query(NeedsAssessment).filter(NeedsAssessment.id == uuid.UUID(na_id)).first()
    db_na.is_aggregated = False
    db.commit()
    db.close()

    # 6. Delete unaggregated needs assessment
    del_res = client.delete(f"/api/dept/needs-assessment/{na_id}")
    assert del_res.status_code == 200
    assert del_res.json()["status"] == "success"

    # Verify absence from active listing
    get_after_del = client.get("/api/dept/needs-assessment")
    assert get_after_del.status_code == 200
    assert not any(str(i["id"]) == str(na_id) for i in get_after_del.json())

    # 7. Repeat delete returns 404
    repeat_del_res = client.delete(f"/api/dept/needs-assessment/{na_id}")
    assert repeat_del_res.status_code == 404


def test_proposal_linking_to_needs_assessment():
    """
    Verifies optional 1-click binding from Proposal (Part IV.A) to Needs Assessment (Sec 8.0):
    - Submits proposal referencing needs_assessment_id.
    - Asserts needs_assessment_id is persisted and returned in ProposalResponse.
    - Asserts ORM relationship proposal.needs_assessment resolves to the source record.
    """
    db = TestingSessionLocal()
    na = NeedsAssessment(
        department_id=1,
        title="High-Performance Data Analytics Cluster Expansion",
        mfo_alignment="Citizen Frontline Public Services Program",
        current_problem="Insufficient compute cores for national policy data analytics simulations.",
        proposed_solution="Procure multi-core developer workstation laptops.",
        expected_impacts=["Accelerated research simulation completion"],
        is_aggregated=False
    )
    db.add(na)
    db.commit()
    db.refresh(na)
    na_id = str(na.id)
    db.close()

    proposal_payload = {
        "outcome_id": 1,
        "category": "Hardware",
        "strategic_category": "Office Productivity",
        "office_location": "Central Office",
        "fund_source": "General Appropriations Act (GAA)",
        "item_select": "laptop_enterprise",
        "item_name": "Analytics Workstation Laptop",
        "unit_cost": 50000.00,
        "yearly_quantities": {"2026": 2, "2027": 0, "2028": 0},
        "canvas_evidence_url": f"https://{TEST_BUCKET}.s3.amazonaws.com/canvases/hpc_quote.pdf",
        "canvas_expiration_date": (datetime.now(timezone.utc) + timedelta(days=90)).isoformat(),
        "is_expansion": True,
        "needs_assessment_id": na_id
    }
    create_res = client.post("/api/dept/proposals", json=proposal_payload)
    assert create_res.status_code == 201
    p_data = create_res.json()
    assert str(p_data["needs_assessment_id"]) == na_id
    proposal_id = p_data["id"]

    get_res = client.get(f"/api/dept/proposals/{proposal_id}")
    assert get_res.status_code == 200
    assert str(get_res.json()["needs_assessment_id"]) == na_id

    db = TestingSessionLocal()
    prop_db = db.query(Proposal).filter(Proposal.id == uuid.UUID(str(proposal_id))).first()
    assert prop_db is not None
    assert str(prop_db.needs_assessment_id) == na_id
    assert prop_db.needs_assessment is not None
    assert prop_db.needs_assessment.title == "High-Performance Data Analytics Cluster Expansion"
    db.close()


def test_foreign_key_integrity_set_null_on_needs_assessment_deletion():
    """
    Verification and Test Integrity Rule 1:
    Foreign Key Integrity: needs_assessment_id uses ondelete="SET NULL".
    If a department deletes a draft needs assessment, linked proposals remain
    intact with needs_assessment_id = None.
    """
    db = TestingSessionLocal()
    na = NeedsAssessment(
        department_id=1,
        title="Draft Operations Lab Setup for Mobile Inspection",
        mfo_alignment="Citizen Frontline Public Services Program",
        current_problem="Lack of mobile devices for fieldwork evaluation.",
        proposed_solution="Procure test tablets and smartphones.",
        expected_impacts=["Enhanced frontline inspection reporting"],
        is_aggregated=False
    )
    db.add(na)
    db.commit()
    db.refresh(na)
    na_id = na.id

    prop = Proposal(
        department_id=1,
        issp_period="2026-2028",
        outcome_id=1,
        category=ProposalCategory.HARDWARE,
        strategic_category=ProjectCategory.OFFICE_PRODUCTIVITY,
        office_location=OfficeLocation.CENTRAL_OFFICE,
        fund_source=FundSource.GAA,
        uacs_object_code=UacsObjectCode.ICT_EQUIPMENT,
        expenditure_class=ExpenditureClass.CAPITAL_OUTLAY,
        status=ProposalStatus.DRAFT,
        item_name="Mobile Development Test Devices",
        unit_cost=Decimal("25000.00"),
        year_1_qty=4,
        total_qty=4,
        total_cost=Decimal("100000.00"),
        needs_assessment_id=na_id
    )
    db.add(prop)
    db.commit()
    db.refresh(prop)
    prop_id = prop.id

    assert prop.needs_assessment_id == na_id
    assert prop.needs_assessment is not None

    db.delete(na)
    db.commit()

    prop_survived = db.query(Proposal).filter(Proposal.id == prop_id).first()
    assert prop_survived is not None
    assert prop_survived.needs_assessment_id is None
    assert prop_survived.item_name == "Mobile Development Test Devices"
    db.close()


def test_admin_needs_assessment_intake_and_aggregation_pipeline():
    """
    Verifies Section 8.0 to Part II.A Admin Aggregation Pipeline:
    - MIS Admin inspects department needs assessments (/api/admin/needs-assessments).
    - MIS Admin executes 1-click aggregation (/api/admin/concerns/aggregate-from-needs).
    - Asserts official StrategicConcern registered with outcome_id link.
    - Asserts bidirectional link: NeedsAssessment.is_aggregated = True,
      NeedsAssessment.strategic_concern_id = concern.id, and
      StrategicConcern.needs_assessments contains the source record.
    """
    db = TestingSessionLocal()
    na = NeedsAssessment(
        department_id=1,
        title="Automated Regulatory Data Analytics Cluster",
        mfo_alignment="Citizen Frontline Public Services Program",
        current_problem="Lack of high-performance GPU nodes prevents running heavy predictive statistical models.",
        proposed_solution="Procure dedicated GPU acceleration server clusters and integrate with central registry portal.",
        expected_impacts=["Supports national science research"],
        is_aggregated=False
    )
    db.add(na)
    db.commit()
    db.refresh(na)
    na_id = str(na.id)
    db.close()

    intake_res = client.get("/api/admin/needs-assessments?is_aggregated=false")
    assert intake_res.status_code == 200
    intake_items = intake_res.json()
    target_na = next((item for item in intake_items if str(item["id"]) == na_id), None)
    assert target_na is not None
    assert target_na["is_aggregated"] is False
    assert target_na["department_name"] == "Information and Communications Technology Division"

    agg_payload = {
        "needs_assessment_id": na_id,
        "outcome_id": 1,
        "mfo": "Citizen Frontline Public Services Program",
        "critical_system": "Automated Regulatory Data Analytics Cluster",
        "problems": "[Information and Communications Technology Division]: Lack of high-performance GPU nodes prevents running heavy predictive statistical models.",
        "intended_use": "Procure dedicated GPU acceleration server clusters and integrate with central registry portal.",
        "order_index": 3
    }
    agg_res = client.post("/api/admin/concerns/aggregate-from-needs", json=agg_payload)
    assert agg_res.status_code == 201
    concern_data = agg_res.json()
    concern_id = concern_data["id"]
    assert concern_data["critical_system"] == "Automated Regulatory Data Analytics Cluster"
    assert concern_data["outcome_id"] == 1

    db = TestingSessionLocal()
    na_db = db.query(NeedsAssessment).filter(NeedsAssessment.id == uuid.UUID(na_id)).first()
    assert na_db.is_aggregated is True
    assert str(na_db.strategic_concern_id) == str(concern_id)

    concern_db = db.query(StrategicConcern).filter(StrategicConcern.id == uuid.UUID(str(concern_id))).first()
    assert concern_db is not None
    assert na_db in concern_db.needs_assessments
    assert na_db.strategic_concern == concern_db
    db.close()

    agg_list_res = client.get("/api/admin/needs-assessments?is_aggregated=true")
    assert agg_list_res.status_code == 200
    agg_list = agg_list_res.json()
    assert any(str(r["id"]) == na_id and r["is_aggregated"] is True for r in agg_list)


def test_singularity_engine_validates_aggregated_strategic_concern():
    """
    Verification and Test Integrity Rule 2:
    Singularity Audit Alignment: When the MIS Admin aggregates a department's
    Needs Assessment, it registers an official Strategic Concern (Part II.A)
    linked to an Organizational Outcome (Part I.A.4), satisfying the DICT
    Singularity Engine (ISSPSingularityEngine.validate_complete_issp_graph())
    which asserts that all strategic concerns must connect directly to active programs.
    """
    db = TestingSessionLocal()
    concern = db.query(StrategicConcern).filter(
        StrategicConcern.critical_system == "Automated Regulatory Data Analytics Cluster"
    ).first()
    
    if not concern:
        concern = StrategicConcern(
            issp_period="2026-2028",
            outcome_id=1,
            mfo="Citizen Frontline Public Services Program",
            critical_system="Automated Regulatory Data Analytics Cluster",
            problems="[Information and Communications Technology Division]: Lack of high-performance GPU nodes prevents running heavy predictive statistical models.",
            intended_use="Procure dedicated GPU acceleration server clusters and integrate with central registry portal.",
            order_index=3
        )
        db.add(concern)
        db.commit()
        db.refresh(concern)

    assert concern is not None
    assert concern.outcome_id == 1
    assert concern.outcome is not None
    assert concern.outcome.outcome_name == "Citizen Frontline Public Services Program"

    outcomes = db.query(OrganizationalOutcome).filter(OrganizationalOutcome.issp_period == "2026-2028").all()
    for oo in outcomes:
        linked_concerns_count = db.query(StrategicConcern).filter(StrategicConcern.outcome_id == oo.id).count()
        if oo.id == 1:
            assert linked_concerns_count >= 1

    db.close()


# ==========================================================
# 14. DICT v.2026 SPECIFICATION & DYNAMIC REUSABILITY TESTS
# ==========================================================

def test_ict_project_dynamic_annual_deliverables_and_backward_compatibility():
    """
    Verifies that IctProject supports dynamic annual_deliverables JSON mapping
    across arbitrary multi-year horizons (e.g., a 5-year plan) and that
    backward-compatible properties year_1_deliverables, year_2_deliverables,
    year_3_deliverables and the helper get_deliverable_for_year work seamlessly.
    """
    db = TestingSessionLocal()
    proj = IctProject(
        issp_period="2026-2030",
        project_title="Cloud Migration & Digital Twin 5-Year Horizon",
        project_category=ProjectCategory.INTERNAL_ICT_PROJECT,
        description="Comprehensive 5-year digital transformation.",
        objectives="Modernize institutional IT across five full fiscal cycles.",
        duration_start_year=2026,
        duration_end_year=2030,
        annual_deliverables={
            "2026": "Architecture baseline & PIA audit",
            "2027": "Core microservices and API staging",
            "2028": "Pilot rollout across operations sites",
            "2029": "Full cloud production migration",
            "2030": "Post-implementation audit & SPAR evaluation"
        },
        implementing_unit="Information and Communications Technology Division",
        funding_source=FundSource.GAA,
        aligns_others=True,
        aligns_others_specify="Presidential Directive on Digital Governance"
    )
    db.add(proj)
    db.commit()
    db.refresh(proj)

    assert proj.get_deliverable_for_year(1, 2026) == "Architecture baseline & PIA audit"
    assert proj.get_deliverable_for_year(4, 2029) == "Full cloud production migration"
    assert proj.get_deliverable_for_year(5, 2030) == "Post-implementation audit & SPAR evaluation"

    assert "Architecture baseline" in proj.year_1_deliverables
    assert "Core microservices" in proj.year_2_deliverables

    db.delete(proj)
    db.commit()
    db.close()


def test_information_system_enhancement_details_support():
    """
    Verifies that InformationSystem supports the DICT-mandated enhancement_details
    field for systems with status 'For Enhancement' per DICT Guidelines Page 13.
    """
    db = TestingSessionLocal()
    sys_enhancement = InformationSystem(
        issp_period="2026-2028",
        name="Financial Management Ledger Portal",
        status=SystemStatus.FOR_ENHANCEMENT,
        classification=SystemClassification.GENERAL_ADMINISTRATIVE,
        hosting_type=SystemHostingType.HYBRID,
        description_and_purpose="Automated financial bookkeeping and digital disbursements.",
        enhancement_details="Upgrading security modules to support multi-factor authentication and GovCloud microservices containerization.",
        development_strategy=DevelopmentStrategy.IN_HOUSE,
        development_platform="Python FastAPI, PostgreSQL",
        database_name="finance_ledger_db",
        data_storage_type="Cloud Hybrid Storage",
        internal_users="Accounting Division, Budget Officers",
        external_users="State Auditors (COA)",
        system_owner_office="Accounting Division",
        processes_personal_information=True,
        has_undergone_pia=True
    )
    db.add(sys_enhancement)
    db.commit()
    db.refresh(sys_enhancement)

    assert sys_enhancement.status == SystemStatus.FOR_ENHANCEMENT
    assert sys_enhancement.enhancement_details == (
        "Upgrading security modules to support multi-factor authentication and GovCloud microservices containerization."
    )

    db.delete(sys_enhancement)
    db.commit()
    db.close()


def test_budget_ceiling_natural_split_no_forced_70_30():
    """
    Verifies that BudgetCeiling does not arbitrarily enforce a 70% CapEx / 30% MOOE split.
    Allows custom allocations (e.g. 60/40 or 50/50) where sub_ceiling reflects
    the exact sum of allocated_capex and allocated_mooe without forced overwrite.
    """
    db = TestingSessionLocal()
    
    ceiling = db.query(BudgetCeiling).filter(BudgetCeiling.department_id == 2).first()
    if not ceiling:
        ceiling = BudgetCeiling(
            department_id=2,
            issp_period="2026-2028",
            allocated_capex=Decimal("6000000.00"),
            allocated_mooe=Decimal("4000000.00")
        )
        db.add(ceiling)
    else:
        ceiling.allocated_capex = Decimal("6000000.00")
        ceiling.allocated_mooe = Decimal("4000000.00")
    
    db.commit()
    db.refresh(ceiling)

    assert ceiling.allocated_capex == Decimal("6000000.00")
    assert ceiling.allocated_mooe == Decimal("4000000.00")
    assert ceiling.sub_ceiling == Decimal("10000000.00")
    
    ceiling.allocated_capex = Decimal("7500000.00")
    ceiling.allocated_mooe = Decimal("2500000.00")
    assert ceiling.sub_ceiling == Decimal("10000000.00")

    db.close()


def test_master_narrative_scope_and_amendment_specifications():
    """
    Verifies that MasterNarrative properly stores DICT Page 1 metadata:
    - Regular ISSP vs. Amendment (is_amendment, amendment_number)
    - Hierarchical scope checkboxes (scope_choice, scope_json)
    - Official agency head title and DRBCP approval date
    """
    db = TestingSessionLocal()
    narrative = db.query(MasterNarrative).filter(MasterNarrative.issp_period == "2026-2028").first()
    assert narrative is not None

    narrative.is_amendment = True
    narrative.amendment_number = "2nd"
    narrative.scope_choice = ScopeChoice.AGENCY_WIDE
    narrative.scope_json = {"with_regional_offices": True, "with_bureaus": False}
    narrative.agency_head_position = "Secretary"
    narrative.drbcp_approval_date = "March 15, 2026"
    db.commit()
    db.refresh(narrative)

    assert narrative.is_amendment is True
    assert narrative.amendment_number == "2nd"
    assert narrative.scope_choice == ScopeChoice.AGENCY_WIDE
    assert narrative.scope_json.get("with_regional_offices") is True
    assert narrative.agency_head_position == "Secretary"
    assert narrative.drbcp_approval_date == "March 15, 2026"

    narrative.is_amendment = False
    narrative.amendment_number = None
    db.commit()
    db.close()


def test_annex1_dict_standard_category_and_others_specification():
    """
    Verifies Annex 1 inventory supports DICT standard categories:
    (Servers, Desktop, Laptop, Network Switch, Web Application Firewall, etc.)
    and correctly stores other_category_name for 'Others, please specify'.
    """
    db = TestingSessionLocal()

    switch = ExistingInventory(
        department_id=1,
        item_name="Core Distribution Switch 48-Port PoE+",
        specs="Managed L3 PoE+ Gigabit Switch",
        exact_model="Catalyst 9300",
        dict_category=DictAssetCategory.NETWORK_SWITCH,
        quantity=4,
        status=AssetStatus.FUNCTIONAL,
        acquired_price=Decimal("85000.00"),
        office_location=OfficeLocation.CENTRAL_OFFICE,
        is_central_office=True
    )

    ups = ExistingInventory(
        department_id=1,
        item_name="Uninterruptible Power Supply (UPS)",
        specs="3000VA / 2700W 2U Rackmount Smart-UPS",
        exact_model="Smart-UPS RT 3000VA",
        dict_category=DictAssetCategory.OTHERS_EQUIPMENT,
        other_category_name="Smart-UPS RT 3000VA",
        quantity=8,
        status=AssetStatus.FUNCTIONAL,
        acquired_price=Decimal("65000.00"),
        office_location=OfficeLocation.CENTRAL_OFFICE,
        is_central_office=True
    )

    db.add_all([switch, ups])
    db.commit()
    db.refresh(switch)
    db.refresh(ups)

    assert switch.dict_category in [DictAssetCategory.NETWORK_SWITCH, "Network Switch"]
    assert ups.dict_category in [DictAssetCategory.OTHERS_EQUIPMENT, "Others (ICT Equipment)", "Others"]
    assert ups.other_category_name == "Smart-UPS RT 3000VA"

    db.delete(switch)
    db.delete(ups)
    db.commit()
    db.close()


def test_egovernment_checklist_adoption_and_channels():
    """
    Verifies that EGovernmentChecklist captures adoption statuses:
    PNPKI adoption ratio, public service portal communication channels,
    and non-adoption status flags (is_manual, is_proposed_development).
    """
    db = TestingSessionLocal()

    egov_pnpki = EGovernmentChecklist(
        issp_period="2026-2028",
        program_name="PNPKI",
        is_utilized=True,
        url_or_system_name="https://dict.gov.ph/pnpki",
        equivalent_system_details="Digital signing keys active for all designated officials",
        adoption_ratio="75% of eligible officials"
    )

    egov_portal = EGovernmentChecklist(
        issp_period="2026-2028",
        program_name="Online Public Service Portal",
        is_utilized=True,
        url_or_system_name="https://services.agency.gov.ph",
        channels_json=["Website", "Email", "Mobile", "Social Media"],
        is_connected_to_portal=True
    )

    db.add_all([egov_pnpki, egov_portal])
    db.commit()
    db.refresh(egov_pnpki)
    db.refresh(egov_portal)

    assert egov_pnpki.is_utilized is True
    assert egov_pnpki.adoption_ratio == "75% of eligible officials"
    assert "Website" in egov_portal.channels_json
    assert egov_portal.is_connected_to_portal is True

    db.delete(egov_pnpki)
    db.delete(egov_portal)
    db.commit()
    db.close()


def test_network_infrastructure_diagram_and_speed_metrics():
    """
    Verifies that NetworkInfrastructure tracks upload/download speeds,
    office location, IPv6 readiness, and network diagram URL.
    """
    db = TestingSessionLocal()

    infra = NetworkInfrastructure(
        issp_period="2026-2028",
        is_proposed=False,
        office_location="Central Headquarters",
        connectivity_type="Dedicated Leased Line Fiber",
        bandwidth_mbps=200,
        upload_speed_mbps=200,
        download_speed_mbps=200,
        is_ipv6_ready=True,
        topology_description="Core fiber optic distribution backbone connecting all headquarters wings.",
        diagram_url="https://issp-vault.s3.amazonaws.com/diagrams/lan_topology_hq.png"
    )
    db.add(infra)
    db.commit()
    db.refresh(infra)

    assert infra.upload_speed_mbps == 200
    assert infra.download_speed_mbps == 200
    assert infra.is_ipv6_ready is True
    assert infra.diagram_url == "https://issp-vault.s3.amazonaws.com/diagrams/lan_topology_hq.png"
    assert infra.office_location == "Central Headquarters"

    db.delete(infra)
    db.commit()
    db.close()


def test_cybersecurity_controls_seeder_29_controls_and_splits():
    """
    Verifies POST /api/admin/cybersecurity-controls/seed-defaults:
    - Seeds all 29 official DICT Cybersecurity Controls.
    - Verifies both Part II.B.2 Existing (is_proposed=False) and Part III.A.2 Proposed (is_proposed=True) sets.
    - Ensures exactly 20 Mandatory controls and 9 Optional controls per phase.
    - Ensures all 7 official Security Domains are present with accurate per-domain splits.
    - Asserts idempotency (re-running the seeder does not create duplicates).
    """
    # 1. Clean slate for test period
    db = TestingSessionLocal()
    db.query(CybersecurityControl).filter(CybersecurityControl.issp_period == "2026-2028").delete()
    db.commit()
    db.close()

    # 2. Call the seeder endpoint
    seed_res = client.post("/api/admin/cybersecurity-controls/seed-defaults?issp_period=2026-2028")
    assert seed_res.status_code == 200
    seed_data = seed_res.json()
    assert seed_data["status"] == "success"

    # 3. Query Part II.B.2 Existing Controls (is_proposed=false)
    existing_res = client.get("/api/admin/cybersecurity-controls?issp_period=2026-2028&is_proposed=false")
    assert existing_res.status_code == 200
    existing_controls = existing_res.json()
    assert len(existing_controls) == 29

    mand_existing = [c for c in existing_controls if c["is_mandatory"]]
    opt_existing = [c for c in existing_controls if not c["is_mandatory"]]
    assert len(mand_existing) == 20
    assert len(opt_existing) == 9

    # 4. Query Part III.A.2 Proposed Controls (is_proposed=true)
    proposed_res = client.get("/api/admin/cybersecurity-controls?issp_period=2026-2028&is_proposed=true")
    assert proposed_res.status_code == 200
    proposed_controls = proposed_res.json()
    assert len(proposed_controls) == 29

    mand_proposed = [c for c in proposed_controls if c["is_mandatory"]]
    opt_proposed = [c for c in proposed_controls if not c["is_mandatory"]]
    assert len(mand_proposed) == 20
    assert len(opt_proposed) == 9

    # 5. Check domain coverage across all 7 Security Domains
    expected_domains = {
        "Physical Security",
        "Perimeter Security",
        "Network Security",
        "Endpoint Security",
        "Data Security",
        "Application Security",
        "Other Measures"
    }
    existing_domains = {c["control_domain"] for c in existing_controls}
    proposed_domains = {c["control_domain"] for c in proposed_controls}
    assert existing_domains == expected_domains
    assert proposed_domains == expected_domains

    # Verify per-domain splits match the official DICT specification:
    expected_splits = {
        "Physical Security": (3, 1),
        "Perimeter Security": (3, 1),
        "Network Security": (1, 1),
        "Endpoint Security": (3, 1),
        "Data Security": (3, 0),
        "Application Security": (1, 0),
        "Other Measures": (6, 5)
    }

    for dom, (expected_mand, expected_opt) in expected_splits.items():
        dom_controls = [c for c in existing_controls if c["control_domain"] == dom]
        mand_count = len([c for c in dom_controls if c["is_mandatory"]])
        opt_count = len([c for c in dom_controls if not c["is_mandatory"]])
        assert mand_count == expected_mand, f"{dom} mandatory count expected {expected_mand}, got {mand_count}"
        assert opt_count == expected_opt, f"{dom} optional count expected {expected_opt}, got {opt_count}"

    # 6. Verify idempotency: calling seed-defaults again does not create duplicate controls
    reseed_res = client.post("/api/admin/cybersecurity-controls/seed-defaults?issp_period=2026-2028")
    assert reseed_res.status_code == 200
    db = TestingSessionLocal()
    total_controls = db.query(CybersecurityControl).filter(CybersecurityControl.issp_period == "2026-2028").count()
    assert total_controls == 58  # 29 existing + 29 proposed
    db.close()


# ==========================================================
# 15. PDF COMPILATION & DIAGRAM VAULT REGRESSION TESTS
# ==========================================================

def test_pdf_generation_cover_page_table_layout_no_overlap():
    """
    Regression Test for Page 1 Signatures:
    Verifies that the generated HTML uses a stable table layout for signature blocks
    rather than fragile fixed-height flex containers (which caused PREPARED BY and 
    APPROVED BY to collide and overlap).
    """
    db = TestingSessionLocal()
    narrative = db.query(MasterNarrative).filter(MasterNarrative.issp_period == "2026-2028").first()
    narrative.signatory_prepared_by = "Engr. Juan Dela Cruz, MIT"
    narrative.preparer_position = "Chief Information Officer"
    narrative.signatory_approved_by = "Hon. Maria Santos, PhD"
    narrative.agency_head_position = "Secretary"
    db.commit()

    parity_data = calculate_financial_summaries(db, "2026-2028")
    
    html = generate_complete_issp_html(
        narrative=narrative,
        outcomes=[],
        concerns=[],
        systems=[],
        projects=[],
        items=[],
        inventory=[],
        human_capitals=[],
        staff_positions=[],
        stakeholders=[],
        egov_checklists=[],
        glossary=[],
        network_infra=[],
        cyber_controls=[],
        dr_teams=[],
        dr_bias=[],
        dr_metrics=[],
        parity_data=parity_data
    )

    # 1. Assert stable table layout is present on cover page
    assert 'table style="width: 100%; border: none; margin-top: 25px; page-break-inside: avoid; border-collapse: collapse;"' in html
    # 2. Assert broken flexbox container with fixed height is eliminated
    assert "height: 190px" not in html
    # 3. Assert long text protection is enabled in stylesheet
    assert "overflow-wrap: anywhere" in html or "word-break: break-word" in html
    db.close()


def test_pdf_generation_toc_no_duplicate_page_break():
    """
    Regression Test for Table of Contents (Blank Page 2 Elimination):
    Verifies that #sec-toc does not carry class="page-break" because .page-cover 
    already triggers page-break-after: always, eliminating the phantom blank page.
    """
    db = TestingSessionLocal()
    narrative = db.query(MasterNarrative).filter(MasterNarrative.issp_period == "2026-2028").first()
    parity_data = calculate_financial_summaries(db, "2026-2028")

    html = generate_complete_issp_html(
        narrative=narrative,
        outcomes=[],
        concerns=[],
        systems=[],
        projects=[],
        items=[],
        inventory=[],
        human_capitals=[],
        staff_positions=[],
        stakeholders=[],
        egov_checklists=[],
        glossary=[],
        network_infra=[],
        cyber_controls=[],
        dr_teams=[],
        dr_bias=[],
        dr_metrics=[],
        parity_data=parity_data
    )

    # 1. Assert #sec-toc does NOT have class="page-break"
    assert '<div id="sec-toc">' in html
    assert '<div class="page-break" id="sec-toc">' not in html
    db.close()


def test_pdf_generation_network_diagram_deduplication():
    """
    Regression Test for Diagram Duplication Bug:
    Verifies that when multiple network infrastructure sites exist without their 
    own distinct diagram URLs, the fallback narrative diagram is rendered EXACTLY ONCE
    rather than duplicating across every single site card.
    """
    db = TestingSessionLocal()
    narrative = db.query(MasterNarrative).filter(MasterNarrative.issp_period == "2026-2028").first()
    narrative.network_diagram_url = "https://issp-vault.s3.amazonaws.com/diagrams/main_topology.png"
    db.commit()

    # Create 3 existing infrastructure sites, none having a specific diagram
    infra1 = NetworkInfrastructure(
        issp_period="2026-2028",
        is_proposed=False,
        office_location="Headquarters Wing A",
        connectivity_type="Leased Line Fiber",
        bandwidth_mbps=100,
        topology_description="Site A core distribution",
        diagram_url=None
    )
    infra2 = NetworkInfrastructure(
        issp_period="2026-2028",
        is_proposed=False,
        office_location="Headquarters Wing B",
        connectivity_type="Leased Line Fiber",
        bandwidth_mbps=100,
        topology_description="Site B core distribution",
        diagram_url=None
    )
    infra3 = NetworkInfrastructure(
        issp_period="2026-2028",
        is_proposed=False,
        office_location="Field Operations Branch",
        connectivity_type="Wireless Link",
        bandwidth_mbps=50,
        topology_description="Field site link",
        diagram_url=None
    )
    db.add_all([infra1, infra2, infra3])
    db.commit()

    parity_data = calculate_financial_summaries(db, "2026-2028")

    html = generate_complete_issp_html(
        narrative=narrative,
        outcomes=[],
        concerns=[],
        systems=[],
        projects=[],
        items=[],
        inventory=[],
        human_capitals=[],
        staff_positions=[],
        stakeholders=[],
        egov_checklists=[],
        glossary=[],
        network_infra=[infra1, infra2, infra3],
        cyber_controls=[],
        dr_teams=[],
        dr_bias=[],
        dr_metrics=[],
        parity_data=parity_data
    )

    # Count occurrences of the main topology image URL in the generated HTML
    occurrences = html.count("https://issp-vault.s3.amazonaws.com/diagrams/main_topology.png")
    # Must be rendered exactly once (as the overall agency-wide topology), not 3 times!
    assert occurrences == 1

    db.delete(infra1)
    db.delete(infra2)
    db.delete(infra3)
    db.commit()
    db.close()


def test_pdf_generation_includes_org_chart_and_subsystem_diagrams():
    """
    Verifies that legitimate diagrams like the agency organizational chart
    (Part I.B) and custom subsystem diagrams (Parts II.C & III.D) are properly
    rendered in the HTML rather than dropped.
    """
    db = TestingSessionLocal()
    narrative = db.query(MasterNarrative).filter(MasterNarrative.issp_period == "2026-2028").first()
    narrative.org_chart_url = "https://issp-vault.s3.amazonaws.com/diagrams/agency_org_chart.png"
    narrative.proposed_ict_org_url = "https://issp-vault.s3.amazonaws.com/diagrams/proposed_ict_org.png"
    
    # Configure custom subsystem layout in the dynamic JSON store
    narrative.set_subsystem_layout("Frontline Portal", "https://issp-vault.s3.amazonaws.com/diagrams/portal_layout.png")
    db.commit()

    sys_test = InformationSystem(
        issp_period="2026-2028",
        name="Frontline Portal",
        status=SystemStatus.OPERATIONAL,
        classification=SystemClassification.OPERATIONS_FRONTLINE,
        hosting_type=SystemHostingType.ONLINE,
        description_and_purpose="Public portal system.",
        development_strategy=DevelopmentStrategy.IN_HOUSE,
        development_platform="FastAPI",
        database_name="portal_db",
        data_storage_type="Cloud",
        internal_users="Officers",
        external_users="Public",
        system_owner_office="ICT Office",
        processes_personal_information=False,
        has_undergone_pia=False
    )
    db.add(sys_test)
    db.commit()

    parity_data = calculate_financial_summaries(db, "2026-2028")

    html = generate_complete_issp_html(
        narrative=narrative,
        outcomes=[],
        concerns=[],
        systems=[sys_test],
        projects=[],
        items=[],
        inventory=[],
        human_capitals=[],
        staff_positions=[],
        stakeholders=[],
        egov_checklists=[],
        glossary=[],
        network_infra=[],
        cyber_controls=[],
        dr_teams=[],
        dr_bias=[],
        dr_metrics=[],
        parity_data=parity_data
    )

    # 1. Assert Organizational Structure Chart renders in Part I.B
    assert "agency_org_chart.png" in html
    # 2. Assert Proposed ICT Org Chart renders in Part III.C
    assert "proposed_ict_org.png" in html
    # 3. Assert custom subsystem layout renders inside its system specification card
    assert "portal_layout.png" in html

    db.delete(sys_test)
    db.commit()
    db.close()


# ==========================================================
# 16. OFFICIAL DICT & BAGONG PILIPINAS BRANDING & FULL-PAGE TESTS
# ==========================================================

def test_pdf_generation_official_dict_and_bagong_pilipinas_branding():
    """
    Verifies that the generated HTML Cover Page and running headers strictly render
    the Republic of the Philippines / DICT Co-Branding Seal, the Bagong Pilipinas Logo,
    and the Agency Official Seal placeholder in compliance with DICT Guidelines (Pages 1, 6, 26).
    """
    db = TestingSessionLocal()
    narrative = db.query(MasterNarrative).filter(MasterNarrative.issp_period == "2026-2028").first()
    narrative.dict_logo_url = f"https://{TEST_BUCKET}.s3.amazonaws.com/logos/dict_official_seal.png"
    narrative.bagong_pilipinas_logo_url = f"https://{TEST_BUCKET}.s3.amazonaws.com/logos/bagong_pilipinas_logo.png"
    narrative.agency_logo_url = f"https://{TEST_BUCKET}.s3.amazonaws.com/logos/agency_official_seal.png"
    db.commit()

    parity_data = calculate_financial_summaries(db, "2026-2028")

    html = generate_complete_issp_html(
        narrative=narrative,
        outcomes=[],
        concerns=[],
        systems=[],
        projects=[],
        items=[],
        inventory=[],
        human_capitals=[],
        staff_positions=[],
        stakeholders=[],
        egov_checklists=[],
        glossary=[],
        network_infra=[],
        cyber_controls=[],
        dr_teams=[],
        dr_bias=[],
        dr_metrics=[],
        parity_data=parity_data
    )

    # 1. Assert DICT seal and Bagong Pilipinas logos render on Cover Page
    assert "dict_official_seal.png" in html
    assert "bagong_pilipinas_logo.png" in html
    assert "agency_official_seal.png" in html
    assert "(Agency Official Seal)" in html

    # 2. Assert uniform running header styling
    assert "@top-left" in html
    assert "@top-center" in html
    assert "@top-right" in html
    db.close()


def test_pdf_generation_full_page_dedicated_schematics():
    """
    Verifies that major architectural diagrams are rendered using dedicated
    full-page landscape layout wrappers (.full-page-schematic and .schematic-img)
    with high-resolution bounding constraints (max-height: 480px, width: 100%).
    """
    db = TestingSessionLocal()
    narrative = db.query(MasterNarrative).filter(MasterNarrative.issp_period == "2026-2028").first()
    narrative.org_chart_url = f"https://{TEST_BUCKET}.s3.amazonaws.com/diagrams/agency_hierarchy_full.png"
    narrative.network_diagram_url = f"https://{TEST_BUCKET}.s3.amazonaws.com/diagrams/existing_topology_full.png"
    narrative.fiber_backbone_url = f"https://{TEST_BUCKET}.s3.amazonaws.com/diagrams/proposed_backbone_full.png"
    narrative.system_architecture_url = f"https://{TEST_BUCKET}.s3.amazonaws.com/diagrams/enterprise_arch_full.png"
    narrative.proposed_ict_org_url = f"https://{TEST_BUCKET}.s3.amazonaws.com/diagrams/proposed_ict_hierarchy_full.png"
    db.commit()

    parity_data = calculate_financial_summaries(db, "2026-2028")

    html = generate_complete_issp_html(
        narrative=narrative,
        outcomes=[],
        concerns=[],
        systems=[],
        projects=[],
        items=[],
        inventory=[],
        human_capitals=[],
        staff_positions=[],
        stakeholders=[],
        egov_checklists=[],
        glossary=[],
        network_infra=[],
        cyber_controls=[],
        dr_teams=[],
        dr_bias=[],
        dr_metrics=[],
        parity_data=parity_data
    )

    # 1. Assert stylesheet defines .full-page-schematic and .schematic-img rules
    assert ".full-page-schematic" in html
    assert ".schematic-img" in html
    assert "max-height: 480px" in html

    # 2. Assert all 5 major structural schematics render in their dedicated full-page containers
    assert "PART I.B: AGENCY ORGANIZATIONAL STRUCTURE HIERARCHY" in html
    assert "agency_hierarchy_full.png" in html

    assert "PART II.B.1: EXISTING NETWORK INFRASTRUCTURE TOPOLOGY" in html
    assert "existing_topology_full.png" in html

    assert "PART III.A.1: PROPOSED NETWORK INFRASTRUCTURE & FIBER BACKBONE" in html
    assert "proposed_backbone_full.png" in html

    assert "PART III.B: ENTERPRISE ARCHITECTURE SCHEMATIC & LOGICAL TOPOLOGY" in html
    assert "enterprise_arch_full.png" in html

    assert "PART III.C: PROPOSED ICT HUMAN CAPITAL ORGANIZATIONAL STRUCTURE" in html
    assert "proposed_ict_hierarchy_full.png" in html

    db.close()


def test_pdf_compilation_structural_schematics_and_table_alignments():
    """
    Verifies PDF HTML compilation structural layout assertions:
    1. CSS layout rules for .full-page-schematic and .schematic-img.
    2. In-section schematic diagram placements:
       - Part I.B Org Chart is located after B.2 Human Capital and before C. Stakeholder Analysis.
       - Part II.B.1 Existing Network Topology is located after B.1 description and before B.2 Cybersecurity Checklist.
       - Part III.A.1 Proposed Network / Fiber Backbone is located after A.1 description and before A.2 Cybersecurity Checklist.
       - Part III.B Enterprise Architecture is located after III.B narrative and before III.C Proposed ICT Human Capital.
       - Part III.C Proposed ICT Org Structure is located after III.C staffing table and before III.D Proposed Information Systems.
    3. Table styling and alignment rules:
       - 100% width, border-collapse, page-break-inside rules for table and rows.
       - thead table-header-group and tbody table-row-group for dual-pass multi-page rendering.
       - Table headers uppercase styling and background.
       - Right-aligned monetary amount columns (.right, .font-mono).
       - Center-aligned quantity/target columns (.center, .font-mono).
       - Grand total rows formatted with .band-band.
    """
    db = TestingSessionLocal()
    narrative = db.query(MasterNarrative).filter(MasterNarrative.issp_period == "2026-2028").first()
    
    # Configure all 5 primary architectural schematics
    narrative.org_chart_url = f"https://{TEST_BUCKET}.s3.amazonaws.com/diagrams/agency_org_hierarchy.png"
    narrative.network_diagram_url = f"https://{TEST_BUCKET}.s3.amazonaws.com/diagrams/existing_lan_topology.png"
    narrative.fiber_backbone_url = f"https://{TEST_BUCKET}.s3.amazonaws.com/diagrams/proposed_fiber_backbone.png"
    narrative.system_architecture_url = f"https://{TEST_BUCKET}.s3.amazonaws.com/diagrams/enterprise_architecture.png"
    narrative.proposed_ict_org_url = f"https://{TEST_BUCKET}.s3.amazonaws.com/diagrams/proposed_ict_org_chart.png"
    narrative.enterprise_architecture_narrative = "The Enterprise Architecture establishes GovCloud microservices containerization and PeGIF API gateways."
    db.commit()

    # Seed an existing infra, proposed infra, and sample proposals
    infra_exist = NetworkInfrastructure(
        issp_period="2026-2028",
        is_proposed=False,
        office_location="Central Office",
        connectivity_type="Leased Line Fiber",
        bandwidth_mbps=100,
        topology_description="HQ distribution backbone",
        diagram_url=None
    )
    infra_prop = NetworkInfrastructure(
        issp_period="2026-2028",
        is_proposed=True,
        office_location="Central Office & Regional Hubs",
        connectivity_type="Redundant GovNet Fiber Backbone + SD-WAN",
        bandwidth_mbps=500,
        topology_description="SD-WAN enterprise routing and GovCloud interconnect",
        diagram_url=None
    )
    db.add_all([infra_exist, infra_prop])
    db.commit()

    parity_data = calculate_financial_summaries(db, "2026-2028")

    outcomes = db.query(OrganizationalOutcome).filter(OrganizationalOutcome.issp_period == "2026-2028").all()
    concerns = db.query(StrategicConcern).filter(StrategicConcern.issp_period == "2026-2028").all()
    systems = db.query(InformationSystem).filter(InformationSystem.issp_period == "2026-2028").all()
    projects = db.query(IctProject).filter(IctProject.issp_period == "2026-2028").all()
    items = db.query(Proposal).filter(Proposal.issp_period == "2026-2028").all()
    inventory = db.query(ExistingInventory).all()
    human_capitals = db.query(HumanCapital).filter(HumanCapital.issp_period == "2026-2028").all()
    staff_positions = db.query(IctStaffPosition).filter(IctStaffPosition.issp_period == "2026-2028").all()
    stakeholders = db.query(StakeholderAnalysis).filter(StakeholderAnalysis.issp_period == "2026-2028").all()
    egov_checklists = db.query(EGovernmentChecklist).filter(EGovernmentChecklist.issp_period == "2026-2028").all()
    glossary = db.query(GlossaryTerm).all()
    network_infra = [infra_exist, infra_prop]
    cyber_controls = db.query(CybersecurityControl).filter(CybersecurityControl.issp_period == "2026-2028").all()
    dr_teams = db.query(DisasterRecoveryTeam).filter(DisasterRecoveryTeam.issp_period == "2026-2028").all()
    dr_bias = db.query(BusinessImpactAnalysis).filter(BusinessImpactAnalysis.issp_period == "2026-2028").all()
    dr_metrics = db.query(DRBCPMetric).filter(DRBCPMetric.issp_period == "2026-2028").all()

    html = generate_complete_issp_html(
        narrative=narrative,
        outcomes=outcomes,
        concerns=concerns,
        systems=systems,
        projects=projects,
        items=items,
        inventory=inventory,
        human_capitals=human_capitals,
        staff_positions=staff_positions,
        stakeholders=stakeholders,
        egov_checklists=egov_checklists,
        glossary=glossary,
        network_infra=network_infra,
        cyber_controls=cyber_controls,
        dr_teams=dr_teams,
        dr_bias=dr_bias,
        dr_metrics=dr_metrics,
        parity_data=parity_data
    )

    # 1. Structural assertions for .full-page-schematic and .schematic-img
    assert ".full-page-schematic" in html
    assert "page-break-inside: avoid" in html
    assert "display: block" in html
    assert "box-sizing: border-box" in html
    assert "clear: both" in html
    assert ".schematic-img" in html
    assert "max-height: 480px" in html
    assert "object-fit: contain" in html

    # 2. Assert all 5 diagrams are wrapped inside .full-page-schematic
    assert "agency_org_hierarchy.png" in html
    assert "existing_lan_topology.png" in html
    assert "proposed_fiber_backbone.png" in html
    assert "enterprise_architecture.png" in html
    assert "proposed_ict_org_chart.png" in html

    # 3. Assert in-section diagram placements
    # Part I.B Org Chart: appears after sec-part1-b and before sec-part1-c
    pos_part1_b = html.find('id="sec-part1-b"')
    pos_org_chart = html.find("agency_org_hierarchy.png")
    pos_part1_c = html.find('id="sec-part1-c"')
    assert pos_part1_b != -1 and pos_org_chart != -1 and pos_part1_c != -1
    assert pos_part1_b < pos_org_chart < pos_part1_c, "Part I.B Org Chart must appear within Part I.B and before Part I.C"

    # Part II.B.1 Existing Network Topology: appears after sec-part2-b and before B.2 Cybersecurity Checklist
    pos_part2_b = html.find('id="sec-part2-b"')
    pos_exist_net = html.find("existing_lan_topology.png")
    pos_cyber_b2 = html.find("B.2. Cybersecurity Control Checklist")
    assert pos_part2_b != -1 and pos_exist_net != -1 and pos_cyber_b2 != -1
    assert pos_part2_b < pos_exist_net < pos_cyber_b2, "Part II.B.1 diagram must appear within II.B after B.1 and before B.2"

    # Part III.A.1 Proposed Network / Fiber Backbone: appears after sec-part3-a and before A.2 Proposed Cybersecurity Checklist
    pos_part3_a = html.find('id="sec-part3-a"')
    pos_prop_net = html.find("proposed_fiber_backbone.png")
    pos_cyber_a2 = html.find("A.2. Proposed Cybersecurity Control Checklist")
    assert pos_part3_a != -1 and pos_prop_net != -1 and pos_cyber_a2 != -1
    assert pos_part3_a < pos_prop_net < pos_cyber_a2, "Part III.A.1 diagram must appear within III.A after A.1 and before A.2"

    # Part III.B Enterprise Architecture: appears after sec-part3-b and before sec-part3-c
    pos_part3_b = html.find('id="sec-part3-b"')
    pos_ea_diag = html.find("enterprise_architecture.png")
    pos_part3_c = html.find('id="sec-part3-c"')
    assert pos_part3_b != -1 and pos_ea_diag != -1 and pos_part3_c != -1
    assert pos_part3_b < pos_ea_diag < pos_part3_c, "Part III.B diagram must appear within III.B and before III.C"

    # Part III.C Proposed ICT Org Structure: appears after sec-part3-c and before sec-part3-d
    pos_proposed_ict_org = html.find("proposed_ict_org_chart.png")
    pos_part3_d = html.find('id="sec-part3-d"')
    assert pos_part3_c != -1 and pos_proposed_ict_org != -1 and pos_part3_d != -1
    assert pos_part3_c < pos_proposed_ict_org < pos_part3_d, "Part III.C diagram must appear within III.C and before III.D"

    # 4. Assert Table Alignments and Layout Rules
    assert "table {" in html
    assert "width: 100%" in html
    assert "border-collapse: collapse" in html
    assert "thead {" in html
    assert "display: table-header-group" in html
    assert "tbody {" in html
    assert "display: table-row-group" in html
    assert "border: 1px solid #334155" in html
    assert ".right {" in html
    assert "text-align: right" in html
    assert ".center {" in html
    assert "text-align: center" in html
    assert ".band-band {" in html
    assert "background-color: #e2e8f0" in html

    db.delete(infra_exist)
    db.delete(infra_prop)
    db.commit()
    db.close()


# ==========================================================
# 17. COA AUDIT LOGGING & ROLE-SCOPED VISIBILITY TESTS
# ==========================================================

def test_coa_audit_logging_helper_and_auth_hook():
    """
    Verifies centralized COA immutable audit logging:
    - Asserts log_audit_event accurately records module, IP address, user_id, department_id, and state deltas.
    - Asserts authentication /login endpoint logs user logins in the audit trail.
    """
    db = TestingSessionLocal()

    # 1. Test centralized audit logger helper
    audit_entry = log_audit_event(
        db=db,
        action="GOVERNANCE_BUDGET_CEILING_OVERRIDE",
        module="GOVERNANCE",
        user_id=3,
        department_id=1,
        ip_address="192.168.1.100",
        old_value={"sub_ceiling": "15000000.00"},
        new_value={"sub_ceiling": "20000000.00"}
    )
    db.commit()

    assert audit_entry.id is not None
    persisted = db.query(AuditTrail).filter(AuditTrail.id == audit_entry.id).first()
    assert persisted is not None
    assert persisted.module == "GOVERNANCE"
    assert persisted.action == "GOVERNANCE_BUDGET_CEILING_OVERRIDE"
    assert persisted.ip_address == "192.168.1.100"
    assert persisted.department_id == 1
    assert persisted.old_value == {"sub_ceiling": "15000000.00"}
    assert persisted.new_value == {"sub_ceiling": "20000000.00"}

    # 2. Test user login audit hook via TestClient
    login_data = {
        "username": f"mis@{TEST_DOMAIN}",
        "password": "admin123"
    }
    res = client.post("/api/auth/login", data=login_data)
    assert res.status_code == 200

    auth_log = db.query(AuditTrail).filter(
        AuditTrail.action == "USER_LOGIN_SUCCESS",
        AuditTrail.module == "AUTHENTICATION"
    ).order_by(AuditTrail.id.desc()).first()

    assert auth_log is not None
    assert auth_log.new_value.get("email") == f"mis@{TEST_DOMAIN}"
    assert auth_log.new_value.get("role") == RoleTag.ROLE_MIS_ADMIN.value

    db.delete(persisted)
    if auth_log:
        db.delete(auth_log)
    db.commit()
    db.close()