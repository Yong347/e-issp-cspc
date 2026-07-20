import uuid
import pytest
from decimal import Decimal
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# Import custom compilation utilities to map Postgres-specific columns to SQLite types
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.dialects.postgresql import JSONB, UUID

from app.main import app
from app.config import settings
from app.database.models import (
    Base, Department, User, BudgetCeiling, RoleTag, ProposalStatus, 
    Proposal, ExistingInventory, AssetStatus
)
from app.database.session import get_db

# --- SQLITE COMPILATION OVERRIDES ---
@compiles(JSONB, "sqlite")
def compile_jsonb_sqlite(element, compiler, **kw):
    """
    Tells SQLAlchemy to render Postgres-specific 'JSONB' fields
    as standard 'JSON' columns when running tests on SQLite.
    """
    return "JSON"

@compiles(UUID, "sqlite")
def compile_uuid_sqlite(element, compiler, **kw):
    """
    Tells SQLAlchemy to render Postgres-specific 'UUID' fields 
    as standard 'VARCHAR' strings in SQLite to prevent table creation crashes.
    """
    return "VARCHAR(36)"


# Setup a clean SQLite database specifically for running automated unit tests
TEST_DATABASE_URL = "sqlite:///./test_issp.db"

engine = create_engine(TEST_DATABASE_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

@pytest.fixture(scope="module", autouse=True)
def setup_test_database():
    """
    Scaffolds temporary tables and seeds standard structural relationships 
    required for testing. Runs once before tests start, and cleans up afterwards.
    """
    Base.metadata.create_all(bind=engine)
    db = TestingSessionLocal()
    
    # Seed Department
    dept = Department(id=1, name="College of Engineering")
    db.add(dept)
    
    # Seed Whitelisted User (Department Level)
    user = User(
        id=2,
        email="faculty.eng@cspc.edu.ph",
        role_tag=RoleTag.ROLE_DEPT_USER,
        department_id=1,
        is_whitelisted=True
    )
    db.add(user)

    # Seed Admin User for standard login test
    admin_attrs = {
        "id": 3,
        "email": "mis@cspc.edu.ph",
        "role_tag": RoleTag.ROLE_MIS_ADMIN,
        "is_whitelisted": True
    }
    
    # Native bcrypt password hashing (Bypasses passlib legacy initialization bug)
    try:
        import bcrypt
        salt = bcrypt.gensalt()
        hashed_pw = bcrypt.hashpw("admin123".encode("utf-8"), salt).decode("utf-8")
    except ImportError:
        hashed_pw = "admin123"

    # Match password column dynamically
    columns = User.__table__.columns.keys()
    if "hashed_password" in columns:
        admin_attrs["hashed_password"] = hashed_pw
    elif "password_hash" in columns:
        admin_attrs["password_hash"] = hashed_pw
    elif "password" in columns:
        admin_attrs["password"] = hashed_pw
        
    admin_user = User(**admin_attrs)
    db.add(admin_user)
    
    # Seed Budget Ceiling
    ceiling = BudgetCeiling(
        id=1,
        department_id=1,
        sub_ceiling=Decimal("5000000.00"),
        global_ceiling=Decimal("50000000.00")
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

# Override the database session dependency inside the FastAPI app
app.dependency_overrides[get_db] = override_get_db
client = TestClient(app)


# --- THE TEST SUITE ---

def test_google_auth_whitelist_rejection():
    """
    Verifies that non-whitelisted emails are blocked during Google Auth.
    """
    payload = {
        "id_token": "mock_token",
        "email": "hacker@cspc.edu.ph"
    }
    response = client.post("/api/auth/google", json=payload)
    assert response.status_code == 403
    assert "not whitelisted" in response.json()["detail"]


def test_standard_login_success():
    """
    Verifies standard system administrator login credentials.
    """
    payload = {
        "email": "mis@cspc.edu.ph",
        "password": "admin123"
    }
    response = client.post("/api/auth/login", json=payload)
    assert response.status_code == 200
    assert response.json()["role"] == "ROLE_MIS_ADMIN"


def test_complete_proposal_lifecycle_and_state_locking():
    """
    Verifies the complete lifecycle transitions of the State Machine:
    Draft (Editable) -> Submitted (Locked) -> Approved (Permanently Locked)
    """
    # 1. Create a new draft proposal
    proposal_payload = {
        "item_select": "laptop_faculty",
        "custom_specification": "Standard Unit",
        "yearly_quantities": {"2026": 5, "2027": 0, "2028": 0},
        "unit_cost": 45000.00,
        "canvas_evidence_url": None
    }
    create_response = client.post("/api/dept/proposals", json=proposal_payload)
    assert create_response.status_code == 201
    proposal_id = create_response.json()["proposal_id"]
    assert create_response.json()["current_status"] == "Draft"

    # 2. Update the proposal while in Draft status (Should be allowed)
    update_payload = {
        "item_select": "laptop_faculty",
        "custom_specification": "Updated Unit",
        "yearly_quantities": {"2026": 5, "2027": 0, "2028": 0},
        "unit_cost": 42000.00,
        "canvas_evidence_url": None
    }
    update_response = client.put(f"/api/dept/proposals/{proposal_id}", json=update_payload)
    assert update_response.status_code == 200

    # 3. Transition State: Submit the proposal (Draft -> Submitted)
    submit_response = client.put(f"/api/dept/proposals/{proposal_id}/submit")
    assert submit_response.status_code == 200
    assert submit_response.json()["new_status"] == "Submitted"

    # 4. Attempt to update after submission (Should be locked and blocked)
    locked_update_response = client.put(f"/api/dept/proposals/{proposal_id}", json=update_payload)
    assert locked_update_response.status_code == 403
    assert "Editing locked" in locked_update_response.json()["detail"]


def test_prevent_submission_with_missing_unserviceable_report():
    """
    Verifies the submission lock: A department cannot submit their proposals 
    if they have logged 'Condemned' or 'Needs Repair' inventory items but have 
    not uploaded the required unserviceable report (URL is null).
    """
    db = TestingSessionLocal()
    
    # 1. Seed a Condemned item missing a report URL
    asset = ExistingInventory(
        department_id=1,
        item_name="Old Faulty Workstation",
        quantity=3,
        status=AssetStatus.CONDEMNED,
        unserviceable_report_url=None
    )
    db.add(asset)
    db.commit()

    # 2. Create a fresh draft proposal
    proposal_payload = {
        "item_select": "laptop_faculty",
        "custom_specification": "Replacement Unit",
        "yearly_quantities": {"2026": 3, "2027": 0, "2028": 0},
        "unit_cost": 50000.00,
        "canvas_evidence_url": None
    }
    create_response = client.post("/api/dept/proposals", json=proposal_payload)
    assert create_response.status_code == 201
    proposal_id = create_response.json()["proposal_id"]

    # 3. Attempt to submit (Should be BLOCKED)
    submit_response = client.put(f"/api/dept/proposals/{proposal_id}/submit")
    assert submit_response.status_code == 400
    assert "unserviceable report" in submit_response.json()["detail"]

    # Cleanup Database State for future tests
    db.query(ExistingInventory).delete()
    db.commit()
    db.close()


def test_budget_ceiling_validator_violation():
    """
    Verifies that database insertion of departmental ceilings 
    violating sum(sub_ceilings) <= global_ceiling raises an error.
    """
    db = TestingSessionLocal()
    # Attempt to create a sub-ceiling of 60M when the global ceiling is 50M
    invalid_ceiling = BudgetCeiling(
        department_id=99,
        allocated_capex=Decimal("45000000.00"),
        allocated_mooe=Decimal("20000000.00"),
        issp_period="2026-2028"
    )
    db.add(invalid_ceiling)
    
    with pytest.raises(Exception) as excinfo:
        db.commit()
    
    assert "exceeds the Global Budget Ceiling" in str(excinfo.value)
    db.close()


def test_escape_hatch_other_validation():
    """
    Verifies that selecting custom 'other' items requires a detailed 
    specification and mandatory canvas proof.
    """
    # 1. Post request missing a canvas evidence URL and spec
    invalid_payload = {
        "item_select": "other",
        "custom_specification": "",
        "yearly_quantities": {"2026": 1, "2027": 0, "2028": 0},
        "unit_cost": 75000.00,
        "canvas_evidence_url": None
    }
    response = client.post("/api/dept/proposals", json=invalid_payload)
    assert response.status_code in [400, 422]  # Validation failure block


def test_glacier_restoration_lockout():
    """
    Verifies that editing is blocked on items archived on AWS Glacier 
    where a cold-retrieval restoration is currently active.
    """
    db = TestingSessionLocal()
    
    # Create proposal and force state variables into Cold-storage
    proposal = Proposal(
        department_id=1,
        status=ProposalStatus.DRAFT,
        item_name="pc_standard",
        unit_cost=Decimal("35000.00"),
        yearly_quantities={"2026": 5, "2027": 0, "2028": 0},
        total_qty=5,
        payload={"custom_specification": "Standard PC"},
        is_archived=False,
        s3_storage_class="GLACIER",
        is_restoring=True
    )
    db.add(proposal)
    db.commit()
    proposal_id = proposal.id

    # Attempt to update mutable fields
    payload = {
        "item_select": "pc_standard",
        "custom_specification": "Attempted update during restoration",
        "yearly_quantities": {"2026": 10, "2027": 0, "2028": 0},
        "unit_cost": 35000.00,
        "canvas_evidence_url": None
    }
    response = client.put(f"/api/dept/proposals/{proposal_id}", json=payload)
    assert response.status_code == 403
    assert "Glacier" in response.json()["detail"] or "restoration" in response.json()["detail"]
    
    db.delete(proposal)
    db.commit()
    db.close()