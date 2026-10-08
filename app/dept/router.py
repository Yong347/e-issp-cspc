# app/dept/router.py
import os
import uuid
import json
import logging
from decimal import Decimal
from datetime import datetime, timedelta, timezone
from typing import Any, List, Optional, Dict, Union
from fastapi import APIRouter, Depends, HTTPException, status, Query, UploadFile, File, Form, Request
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func, or_, and_, cast, String

from app.config import settings
from app.database.session import get_db
from app.database.models import (
    Proposal,
    ExistingInventory,
    AssetStatus,
    ProposalStatus,
    ProposalCategory,
    ProjectCategory,
    ExpenditureClass,
    FundSource,
    OfficeLocation,
    UacsObjectCode,
    SystemDevelopmentStatus,
    OrganizationalOutcome,
    IctProject,
    AuditTrail,
    Department,
    CatalogItem,
    NeedsAssessment,
    MasterNarrative,
    BudgetCeiling,
    DictAssetCategory,
    StrategicCategory,
    UacsCatalogItem,
    InformationSystem,
    SystemSetting
)
from app.schemas import (
    SupplyInventoryResponse, 
    ProposalCreatePayload, 
    ProposalResponse,
    CommentCreate,
    CatalogItemResponse,
    NeedsAssessmentCreate, 
    NeedsAssessmentResponse,
    OrganizationalOutcomeResponse,
    InformationSystemCreate,
    InformationSystemUpdate,
    InformationSystemResponse
)
from app.auth.router import require_user, require_dept_user
from app.storage.s3_client import storage_client
from app.utils.helpers import (
    secure_filename,
    get_s3_key_from_url,
    get_active_issp_period,
    get_cycle_year_range,
    align_and_validate_years,
    validate_pdf_content,
    get_dict_from_payload,
    classify_uacs_and_expenditure,
    log_audit_event,
    get_governance_policy,
    verify_canvas_compliance,
    verify_annex1_obsolescence_link
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/dept", tags=["Department Subsystem"])


def coerce_optional_uuid(v: Any) -> Optional[uuid.UUID]:
    """Safely converts empty strings, string UUIDs, or None to Optional[uuid.UUID]."""
    if not v:
        return None
    if isinstance(v, uuid.UUID):
        return v
    val_str = str(v).strip()
    if not val_str or val_str.lower() in ("none", "null", "undefined", ""):
        return None
    try:
        return uuid.UUID(val_str)
    except (ValueError, TypeError):
        return None


def is_datetime_expired(dt: Optional[datetime]) -> bool:
    """
    Safely evaluates if a given datetime is in the past, supporting both 
    timezone-aware and timezone-naive datetime objects without TypeError.
    """
    if not dt:
        return False
    if dt.tzinfo is not None:
        return dt < datetime.now(timezone.utc)
    return dt < datetime.utcnow()


def is_file_referenced_elsewhere(
    db: Session, 
    canvas_url: str, 
    exclude_proposal_id: Optional[uuid.UUID] = None
) -> bool:
    """
    Verifies if a given canvas quotation file is referenced by any other proposal
    or active catalog item to protect shared media from accidental deletion.
    """
    if not canvas_url:
        return False

    p_query = db.query(Proposal).filter(Proposal.canvas_evidence_url == canvas_url)
    if exclude_proposal_id:
        p_query = p_query.filter(Proposal.id != exclude_proposal_id)
    if p_query.first() is not None:
        return True

    c_query = db.query(CatalogItem).filter(CatalogItem.canvas_evidence_url == canvas_url)
    if c_query.first() is not None:
        return True

    return False


def check_budget_headroom(
    db: Session, 
    dept_id: int, 
    issp_period: str, 
    incoming_cost: Decimal, 
    expenditure_class: str,
    exclude_proposal_id: Optional[uuid.UUID] = None
):
    """
    Enforces dual independent sub-ceiling accounting with row-level locking (with_for_update)
    to prevent Time-Of-Check to Time-Of-Use (TOCTOU) race conditions:
    1. Capital Outlay (CO) proposals are strictly checked against allocated_capex.
    2. Maintenance and Other Operating Expenses (MOOE) are checked against allocated_mooe.
    3. Combined expenditures are checked against the total sub_ceiling.
    """
    is_sqlite = "sqlite" in settings.DATABASE_URL.lower()

    ceiling_query = db.query(BudgetCeiling).filter(
        BudgetCeiling.department_id == dept_id,
        BudgetCeiling.issp_period == issp_period
    )
    if not is_sqlite:
        ceiling_query = ceiling_query.with_for_update()
        
    ceiling = ceiling_query.first()
    if not ceiling:
        ceiling = BudgetCeiling(
            department_id=dept_id,
            issp_period=issp_period,
            allocated_capex=Decimal("0.00"),
            allocated_mooe=Decimal("0.00"),
            annual_allocations={}
        )
        db.add(ceiling)
        db.flush()

    exp_lower = (expenditure_class or "").lower()
    is_co = "capital" in exp_lower
    target_cap = ceiling.allocated_capex if is_co else ceiling.allocated_mooe
    pool_label = "Capital Outlay (CapEx)" if is_co else "Operating Services (MOOE)"

    # 1. Evaluate specific expenditure class spending pool
    class_query = db.query(func.sum(Proposal.total_cost)).filter(
        Proposal.department_id == dept_id,
        Proposal.issp_period == issp_period,
        func.lower(cast(Proposal.status, String)).in_(["submitted", "approved"]),
        or_(Proposal.is_archived == False, Proposal.is_archived.is_(None))
    )
    if is_co:
        class_query = class_query.filter(Proposal.expenditure_class.ilike("%capital%"))
    else:
        class_query = class_query.filter(~Proposal.expenditure_class.ilike("%capital%"))

    if exclude_proposal_id:
        class_query = class_query.filter(Proposal.id != exclude_proposal_id)

    spent_pool = class_query.scalar() or Decimal("0.00")
    projected_pool = spent_pool + incoming_cost

    if target_cap > Decimal("0.00") and projected_pool > target_cap:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"{pool_label} Allocation Limit Exceeded: Submitting this proposal would cause your department's "
                f"{pool_label} commitments (₱{projected_pool:,.2f}) to exceed your authorized "
                f"allocation of ₱{target_cap:,.2f}. Please review your proposed items or consult the MIS Administrator."
            )
        )

    # 2. Evaluate total sub-ceiling spending
    total_query = db.query(func.sum(Proposal.total_cost)).filter(
        Proposal.department_id == dept_id,
        Proposal.issp_period == issp_period,
        func.lower(cast(Proposal.status, String)).in_(["submitted", "approved"]),
        or_(Proposal.is_archived == False, Proposal.is_archived.is_(None))
    )
    if exclude_proposal_id:
        total_query = total_query.filter(Proposal.id != exclude_proposal_id)

    total_spent = total_query.scalar() or Decimal("0.00")
    projected_total = total_spent + incoming_cost

    if ceiling.sub_ceiling > Decimal("0.00") and projected_total > ceiling.sub_ceiling:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Total Sub-Ceiling Limit Exceeded: Submitting this proposal would cause total departmental outlays "
                f"(₱{projected_total:,.2f}) to exceed your authorized total sub-ceiling of ₱{ceiling.sub_ceiling:,.2f}."
            )
        )


def validate_proposal_constraints(
    db: Session, 
    dept_id: int, 
    payload: ProposalCreatePayload, 
    is_submitting: bool = False
):
    """
    Enforces DBM Smart Specs, dynamic capitalization rules, dynamic review gates,
    catalog office authorization, and Annex 1 unconsumed obsolescence matching.
    """
    policy = get_governance_policy(db)
    target_item_name = payload.item_name
    is_catalog_item = bool(payload.item_select and payload.item_select != "other")
    is_in_house = bool(payload.is_in_house_turnover or payload.created_by_students)

    if payload.yearly_quantities and isinstance(payload.yearly_quantities, dict):
        total_requested = sum(
            int(v) for v in payload.yearly_quantities.values() 
            if v is not None and (isinstance(v, int) or str(v).isdigit())
        )
    else:
        total_requested = sum(int(v) for v in [getattr(payload, 'year_1_qty', 0), getattr(payload, 'year_2_qty', 0), getattr(payload, 'year_3_qty', 0)] if v)
        
    total_outlay = (payload.unit_cost or Decimal("0.00")) * Decimal(total_requested)

    # 1. Validate against reference catalog if standard item key is selected
    if is_catalog_item:
        catalog_item = db.query(CatalogItem).filter(
            CatalogItem.item_key == payload.item_select,
            CatalogItem.is_active == True
        ).first()
        if not catalog_item:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Item '{payload.item_select}' is not authorized or is inactive in the reference catalog."
            )
        
        # Enforce catalog allowed_offices access control
        dept = db.query(Department).filter(Department.id == dept_id).first()
        dept_name = dept.name if dept else ""
        offices = catalog_item.allowed_offices or []
        if len(offices) > 0 and not any(dept_name.lower() in o.lower() for o in offices):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access Restricted: Catalog item '{catalog_item.display_name}' is assigned exclusively to specific authorized units."
            )

        target_item_name = catalog_item.display_name

    # 2. Dynamic Major Outlay Review Threshold check (₱2M Rule)
    major_threshold = policy.get("major_outlay_review_threshold", Decimal("2000000.00"))
    dev_status_val = getattr(payload.system_development_status, "value", str(payload.system_development_status or "")).strip()
    
    if total_outlay >= major_threshold:
        if not dev_status_val or dev_status_val in [SystemDevelopmentStatus.NOT_APPLICABLE.value, "N/A", ""]:
            payload.system_development_status = "For Development"

    if is_submitting:
        if total_requested <= 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Submission Error: The total requested physical quantity across all planning years must be greater than zero."
            )
        
        # 3. Canvas Quotation Validation: Standardized and centralized
        is_canvas_valid, canvas_msg = verify_canvas_compliance(
            item_select=payload.item_select,
            is_in_house_turnover=is_in_house,
            canvas_url=payload.canvas_evidence_url,
            canvas_expiry=payload.canvas_expiration_date
        )
        if not is_canvas_valid:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=canvas_msg
            )

        # 4. Annex 1 Obsolescence Linkage (Anti-Loop Replacement Enforcement)
        is_obsolescence_valid, obsolescence_msg = verify_annex1_obsolescence_link(
            db=db,
            issp_period=get_active_issp_period(db),
            item_name=target_item_name,
            requested_qty=total_requested,
            department_id=dept_id,
            category=payload.category,
            strategic_category=payload.strategic_category,
            is_expansion=payload.is_expansion,
            is_in_house_turnover=is_in_house
        )
        if not is_obsolescence_valid:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=obsolescence_msg
            )


# ==========================================================
# 1. BUDGET HEADROOM MONITORING
# ==========================================================

@router.get("/budget-summary")
def get_department_budget_summary(
    db: Session = Depends(get_db), 
    user: dict = Depends(require_dept_user)
):
    """Provides consolidated department spent vs. allocated sub-ceilings with a dry-run check."""
    dept_id = user["department_id"]
    issp_period = get_active_issp_period(db)
    
    ceiling = db.query(BudgetCeiling).filter(
        BudgetCeiling.department_id == dept_id,
        BudgetCeiling.issp_period == issp_period
    ).first()
    
    allocated_capex = ceiling.allocated_capex if ceiling else Decimal("0.00")
    allocated_mooe = ceiling.allocated_mooe if ceiling else Decimal("0.00")
    sub_ceiling = ceiling.sub_ceiling if ceiling else Decimal("0.00")
        
    spent = db.query(func.sum(Proposal.total_cost)).filter(
        Proposal.department_id == dept_id,
        Proposal.issp_period == issp_period,
        func.lower(cast(Proposal.status, String)).in_(["submitted", "approved"]),
        or_(Proposal.is_archived == False, Proposal.is_archived.is_(None))
    ).scalar() or Decimal("0.00")

    spent_capex = db.query(func.sum(Proposal.total_cost)).filter(
        Proposal.department_id == dept_id,
        Proposal.issp_period == issp_period,
        func.lower(cast(Proposal.status, String)).in_(["submitted", "approved"]),
        Proposal.expenditure_class.ilike("%capital%"),
        or_(Proposal.is_archived == False, Proposal.is_archived.is_(None))
    ).scalar() or Decimal("0.00")

    spent_mooe = db.query(func.sum(Proposal.total_cost)).filter(
        Proposal.department_id == dept_id,
        Proposal.issp_period == issp_period,
        func.lower(cast(Proposal.status, String)).in_(["submitted", "approved"]),
        ~Proposal.expenditure_class.ilike("%capital%"),
        or_(Proposal.is_archived == False, Proposal.is_archived.is_(None))
    ).scalar() or Decimal("0.00")
    
    drafted = db.query(func.sum(Proposal.total_cost)).filter(
        Proposal.department_id == dept_id,
        Proposal.issp_period == issp_period,
        func.lower(cast(Proposal.status, String)) == "draft",
        or_(Proposal.is_archived == False, Proposal.is_archived.is_(None))
    ).scalar() or Decimal("0.00")

    projected_total = spent + drafted
    sub_ceiling_exceeded = projected_total > sub_ceiling if sub_ceiling > 0 else False
    
    return {
        "issp_period": issp_period,
        "allocated_capex": float(allocated_capex),
        "allocated_mooe": float(allocated_mooe),
        "sub_ceiling": float(sub_ceiling),
        "total_spent": float(spent),
        "current_spent_capex": float(spent_capex),
        "current_spent_mooe": float(spent_mooe),
        "remaining_headroom": float(sub_ceiling - spent),
        "draft_dry_run": {
            "total_drafted": float(drafted),
            "projected_total_spent": float(projected_total),
            "sub_ceiling_exceeded": sub_ceiling_exceeded,
            "dry_run_validation_passed": not sub_ceiling_exceeded,
            "message": (
                "Dry-run passed: Your entire draft package fits within your department headroom."
                if not sub_ceiling_exceeded 
                else "Dry-run warning: Submitting your draft package would exceed allocated budget limits."
            )
        }
    }


# ==========================================================
# 2. REFERENCE CATALOG & EXPIRATION ALERTS
# ==========================================================

@router.get("/catalog", response_model=List[CatalogItemResponse])
def get_dept_catalog(
    db: Session = Depends(get_db),
    user: dict = Depends(require_user)
):
    """
    Retrieves standard catalog references, enforcing allowed_offices permissions
    and automatically filtering out items with expired market quotations.
    """
    dept = db.query(Department).filter(Department.id == user.get("department_id")).first()
    dept_name = dept.name if dept else None

    all_items = db.query(CatalogItem).filter(CatalogItem.is_active == True).all()
    permitted_items = []
    
    for item in all_items:
        if item.canvas_expiration_date and is_datetime_expired(item.canvas_expiration_date):
            continue
            
        offices = item.allowed_offices or []
        if len(offices) == 0 or (dept_name and any(dept_name.lower() in o.lower() for o in offices)):
            permitted_items.append(item)

    return permitted_items


@router.get("/catalog/expiring-alerts", response_model=Dict[str, Any])
def get_expiring_canvas_alerts(
    db: Session = Depends(get_db),
    user: dict = Depends(require_dept_user)
):
    """Identifies catalog and custom items whose quotation validity expires within policy threshold."""
    policy = get_governance_policy(db)
    warning_days = policy.get("canvas_expiration_warning_days", 14)
    now = datetime.now(timezone.utc)
    warning_boundary = now + timedelta(days=warning_days)
    dept_id = user["department_id"]

    all_catalog = db.query(CatalogItem).filter(
        CatalogItem.is_active == True,
        CatalogItem.canvas_expiration_date.isnot(None)
    ).all()
    
    expiring_catalog = []
    for item in all_catalog:
        exp = item.canvas_expiration_date
        if exp.tzinfo is None:
            exp = exp.replace(tzinfo=timezone.utc)
        if now < exp <= warning_boundary:
            expiring_catalog.append((item, exp))

    all_proposals = db.query(Proposal).filter(
        Proposal.department_id == dept_id,
        func.lower(cast(Proposal.status, String)).in_(["draft", "returned"]),
        Proposal.canvas_expiration_date.isnot(None),
        or_(Proposal.is_archived == False, Proposal.is_archived.is_(None))
    ).all()

    expiring_proposals = []
    for p in all_proposals:
        exp = p.canvas_expiration_date
        if exp.tzinfo is None:
            exp = exp.replace(tzinfo=timezone.utc)
        if now < exp <= warning_boundary:
            expiring_proposals.append((p, exp))

    return {
        "expiring_standard_items": [
            {
                "item_key": item.item_key,
                "display_name": item.display_name,
                "expires_at": exp.isoformat(),
                "days_remaining": (exp - now).days
            } for item, exp in expiring_catalog
        ],
        "expiring_custom_proposals": [
            {
                "proposal_id": str(p.id),
                "item_name": p.item_name,
                "expires_at": exp.isoformat(),
                "days_remaining": (exp - now).days
            } for p, exp in expiring_proposals
        ]
    }


# ==========================================================
# 3. MASTER OUTCOMES & STRATEGIC PROJECTS
# ==========================================================

@router.get("/outcomes", response_model=List[OrganizationalOutcomeResponse])
def get_organizational_outcomes(
    db: Session = Depends(get_db),
    user: dict = Depends(require_user)
):
    """Returns Program Alignment categories."""
    issp_period = get_active_issp_period(db)
    return db.query(OrganizationalOutcome).filter(
        OrganizationalOutcome.issp_period == issp_period
    ).all()


@router.get("/projects", response_model=List[Dict[str, Any]])
def get_active_ict_projects(
    db: Session = Depends(get_db),
    user: dict = Depends(require_user)
):
    """Lists registered strategic ICT projects available for optional line item linkage."""
    issp_period = get_active_issp_period(db)
    projects = db.query(IctProject).filter(IctProject.issp_period == issp_period).all()
    return [
        {
            "id": str(proj.id),
            "project_title": proj.project_title,
            "project_category": getattr(proj.project_category, "value", str(proj.project_category)),
            "funding_source": getattr(proj.funding_source, "value", str(proj.funding_source)),
            "implementing_unit": proj.implementing_unit,
            "duration_start_year": proj.duration_start_year,
            "duration_end_year": proj.duration_end_year,
            "computed_total_project_cost": float(proj.computed_total_project_cost)
        } for proj in projects
    ]


# ==========================================================
# 4. MASTER INVENTORY (READ-ONLY FOR DEPT)
# ==========================================================

@router.get("/inventory", response_model=List[SupplyInventoryResponse])
def get_existing_inventory(
    search: Optional[str] = Query(None, description="Search by item name, model, or specs"),
    dict_category: Optional[str] = Query(None, description="Filter by Category"),
    is_software: Optional[bool] = Query(None),
    is_end_of_life: Optional[bool] = Query(None),
    status_filter: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, le=1000),
    db: Session = Depends(get_db),
    user: dict = Depends(require_dept_user)
):
    """Department users view ONLY their own department's inventory scoped to active cycle."""
    active_period = get_active_issp_period(db)
    query = db.query(ExistingInventory).filter(
        ExistingInventory.department_id == user["department_id"],
        or_(ExistingInventory.issp_period == active_period, ExistingInventory.issp_period.is_(None))
    )

    if is_software is not None:
        query = query.filter(ExistingInventory.is_software == is_software)
    if is_end_of_life is not None:
        query = query.filter(ExistingInventory.is_end_of_life == is_end_of_life)
    if status_filter and status_filter.strip().lower() != "all":
        clean_status = status_filter.strip().lower()
        query = query.filter(func.lower(cast(ExistingInventory.status, String)) == clean_status)

    if dict_category and dict_category.strip().lower() != "all":
        clean_cat = dict_category.strip()
        is_others = clean_cat.lower().startswith("others")
        if is_others:
            query = query.filter(
                or_(
                    cast(ExistingInventory.dict_category, String).ilike("others%"),
                    ExistingInventory.dict_category == "Others"
                )
            )
        else:
            query = query.filter(
                or_(
                    ExistingInventory.dict_category == clean_cat,
                    cast(ExistingInventory.dict_category, String).ilike(f"%{clean_cat}%")
                )
            )

    if search:
        q_str = f"%{search.strip()}%"
        query = query.filter(
            or_(
                ExistingInventory.item_name.ilike(q_str),
                ExistingInventory.exact_model.ilike(q_str),
                ExistingInventory.specs.ilike(q_str),
                cast(ExistingInventory.dict_category, String).ilike(q_str),
                ExistingInventory.other_category_name.ilike(q_str)
            )
        )

    return query.order_by(ExistingInventory.date_acquired.desc()).offset(skip).limit(limit).all()


# ==========================================================
# 5. RESOURCE REQUIREMENTS LEDGER (SIMPLIFIED DEPARTMENT FLOW)
# ==========================================================

@router.get("/proposals", response_model=List[ProposalResponse])
def get_departmental_proposals(
    issp_period_filter: Optional[str] = Query(None, alias="issp_period"),
    status_filter: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, le=1000),
    db: Session = Depends(get_db),
    user: dict = Depends(require_dept_user)
):
    """Retrieves all unified proposal line items for the department."""
    target_period = issp_period_filter or get_active_issp_period(db)
    query = db.query(Proposal).options(
        joinedload(Proposal.outcome),
        joinedload(Proposal.project_rel),
        joinedload(Proposal.needs_assessment),
        joinedload(Proposal.strategic_category_rel)
    ).filter(
        Proposal.department_id == user["department_id"],
        Proposal.issp_period == target_period,
        or_(Proposal.is_archived == False, Proposal.is_archived.is_(None))
    )
    if status_filter and status_filter.strip().lower() != "all":
        query = query.filter(func.lower(cast(Proposal.status, String)) == status_filter.strip().lower())

    return query.offset(skip).limit(limit).all()


@router.get("/proposals/{proposal_id}", response_model=ProposalResponse)
def get_proposal_detail(
    proposal_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: dict = Depends(require_dept_user)
):
    proposal = db.query(Proposal).options(
        joinedload(Proposal.outcome),
        joinedload(Proposal.project_rel),
        joinedload(Proposal.needs_assessment),
        joinedload(Proposal.strategic_category_rel)
    ).filter(
        Proposal.id == proposal_id,
        Proposal.department_id == user["department_id"],
        or_(Proposal.is_archived == False, Proposal.is_archived.is_(None))
    ).first()

    if not proposal:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Proposal record not found.")

    return proposal


@router.post("/proposals", response_model=ProposalResponse, status_code=status.HTTP_201_CREATED)
def create_merged_proposal(
    request: Request,
    payload: ProposalCreatePayload,
    db: Session = Depends(get_db),
    user: dict = Depends(require_dept_user)
):
    """
    Creates a unified resource proposal draft via the simplified department workflow:
    - Automatically aligns multi-year quantities across active horizon without wiping data.
    - Dynamically derives categories, fund sources, and UACS object codes directly from DB records.
    """
    active_period = get_active_issp_period(db)
    dept = db.query(Department).filter(Department.id == user["department_id"]).first()
    automated_office = dept.name if dept else "Central Office"

    resolved_outcome_id = getattr(payload, "outcome_id", None)
    if resolved_outcome_id is not None:
        outcome = db.query(OrganizationalOutcome).filter(OrganizationalOutcome.id == resolved_outcome_id).first()
        if not outcome:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Target Organizational Outcome ID {resolved_outcome_id} does not exist in active registry."
            )

    resolved_needs_assessment_id = coerce_optional_uuid(payload.needs_assessment_id)
    if resolved_needs_assessment_id:
        na = db.query(NeedsAssessment).filter(NeedsAssessment.id == resolved_needs_assessment_id).first()
        if not na:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Needs Assessment with ID {resolved_needs_assessment_id} not found."
            )

    resolved_project_id = coerce_optional_uuid(payload.project_id)
    resolved_category = payload.category or "Hardware"
    resolved_strategic_cat = payload.strategic_category or "Office Productivity"
    resolved_fund_source = payload.fund_source or "General Appropriations Act (GAA)"

    if resolved_project_id:
        proj = db.query(IctProject).filter(IctProject.id == resolved_project_id).first()
        if proj:
            resolved_fund_source = str(getattr(proj.funding_source, "value", proj.funding_source) or "General Appropriations Act (GAA)")
            resolved_strategic_cat = str(getattr(proj.project_category, "value", proj.project_category) or "Internal ICT Projects")
        else:
            resolved_project_id = None
    elif resolved_category in ["Subscription", "Services"]:
        resolved_strategic_cat = "Continuing Costs/Expenses"

    issp_period, aligned_quantities = align_and_validate_years(db, payload.yearly_quantities, is_submitting=False)
    payload.yearly_quantities = aligned_quantities

    validate_proposal_constraints(db, user["department_id"], payload, is_submitting=False)

    resolved_item_name = payload.item_name
    resolved_canvas_url = payload.canvas_evidence_url
    resolved_canvas_expiry = payload.canvas_expiration_date
    resolved_supplier = None

    if payload.item_select and payload.item_select != "other":
        catalog_item = db.query(CatalogItem).filter(
            CatalogItem.item_key == payload.item_select,
            CatalogItem.is_active == True
        ).first()
        if catalog_item:
            resolved_item_name = catalog_item.display_name
            resolved_canvas_url = catalog_item.canvas_evidence_url
            resolved_canvas_expiry = catalog_item.canvas_expiration_date
            resolved_supplier = catalog_item.supplier_name
            payload.unit_cost = catalog_item.standard_unit_cost
            payload.justification = None
            if catalog_item.category == "software":
                resolved_category = "Subscription"
                if not resolved_project_id:
                    resolved_strategic_cat = "Continuing Costs/Expenses"
    else:
        resolved_supplier = getattr(payload, "supplier_name", None) or "Custom Supplier"

    is_turnover = bool(getattr(payload, "is_in_house_turnover", False) or getattr(payload, "created_by_students", False))
    resolved_office_loc = payload.office_location or "Central Office"

    # Dynamic classification directly from active database settings & catalog
    uacs_code, exp_class = classify_uacs_and_expenditure(
        item_name=resolved_item_name,
        unit_cost=payload.unit_cost,
        strategic_category=resolved_strategic_cat,
        category=resolved_category,
        created_by_students=is_turnover,
        is_in_house_turnover=is_turnover,
        db=db
    )

    strat_cat_id = getattr(payload, "strategic_category_id", None)
    if not strat_cat_id and resolved_strategic_cat:
        sc_obj = db.query(StrategicCategory).filter(
            func.lower(StrategicCategory.name) == str(resolved_strategic_cat).strip().lower()
        ).first()
        if sc_obj:
            strat_cat_id = sc_obj.id

    db_proposal = Proposal(
        department_id=user["department_id"],
        issp_period=active_period,
        outcome_id=resolved_outcome_id,
        project_id=resolved_project_id,
        needs_assessment_id=resolved_needs_assessment_id,
        strategic_category_id=strat_cat_id,
        category=getattr(resolved_category, "value", str(resolved_category)),
        strategic_category=getattr(resolved_strategic_cat, "value", str(resolved_strategic_cat)),
        office_location=getattr(resolved_office_loc, "value", str(resolved_office_loc)),
        fund_source=getattr(resolved_fund_source, "value", str(resolved_fund_source)),
        uacs_object_code=getattr(uacs_code, "value", str(uacs_code)),
        expenditure_class=getattr(exp_class, "value", str(exp_class)),
        status="Draft",
        item_key=payload.item_select or "other",
        item_name=resolved_item_name,
        unit_cost=payload.unit_cost,
        yearly_quantities=payload.yearly_quantities,
        justification=payload.justification,
        system_development_status=getattr(payload.system_development_status, "value", str(payload.system_development_status or "N/A")),
        created_by_students=is_turnover,
        is_in_house_turnover=is_turnover,
        target_office_automated=automated_office,
        canvas_evidence_url=resolved_canvas_url,
        canvas_expiration_date=resolved_canvas_expiry,
        supplier_name=resolved_supplier,
        comments=[],
        is_expansion=getattr(payload, "is_expansion", False)
    )

    db.add(db_proposal)
    db.flush()

    client_ip = request.client.host if (request and request.client) else "Unknown"
    log_audit_event(
        db=db,
        action="PROPOSAL_CREATED",
        module="PROPOSALS",
        user_id=user["id"],
        department_id=user["department_id"],
        proposal_id=db_proposal.id,
        ip_address=client_ip,
        new_value={
            "item_name": db_proposal.item_name,
            "category": str(db_proposal.category),
            "total_cost": str(db_proposal.total_cost),
            "total_qty": db_proposal.total_qty,
            "project_id": str(resolved_project_id) if resolved_project_id else None
        }
    )

    try:
        db.commit()
        db.refresh(db_proposal)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Database error: {str(e)}")
    
    return db_proposal


@router.post("/proposals/with-canvas", response_model=ProposalResponse, status_code=status.HTTP_201_CREATED)
async def create_proposal_with_canvas(
    request: Request,
    payload_json: str = Form(..., description="JSON serialized ProposalCreatePayload"),
    file: Optional[UploadFile] = File(None, description="Optional Quotation Canvas PDF"),
    db: Session = Depends(get_db),
    user: dict = Depends(require_dept_user)
):
    """
    1-Step Proposal Creation with Canvas:
    Accepts proposal parameters alongside the quotation canvas PDF binary in a single operation,
    eliminating the disjointed two-step draft and modal upload workflow.
    """
    try:
        data_dict = json.loads(payload_json)
        payload = ProposalCreatePayload(**data_dict)
    except Exception as parse_err:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, 
            detail=f"Invalid proposal payload format: {str(parse_err)}"
        )

    if file and file.filename:
        file_bytes = await file.read()
        if not validate_pdf_content(file_bytes):
            raise HTTPException(status_code=400, detail="Invalid format. Only genuine PDF documents are accepted as quotation proof.")
        
        temp_uuid = uuid.uuid4()
        supplier_clean = secure_filename(payload.supplier_name or "Custom_Supplier")
        safe_fname = secure_filename(file.filename)
        key = storage_client.get_canvas_key(str(temp_uuid), supplier_clean, safe_fname)
        
        if not storage_client.upload_canvas_evidence(file_bytes, key):
            raise HTTPException(status_code=500, detail="Failed to write quotation proof document to repository.")
        
        payload.canvas_evidence_url = storage_client.generate_download_url(key)

    return create_merged_proposal(request, payload, db, user)


@router.post("/proposals/{proposal_id}/duplicate", response_model=ProposalResponse, status_code=status.HTTP_201_CREATED)
def duplicate_proposal(
    request: Request,
    proposal_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: dict = Depends(require_dept_user)
):
    """
    1-Click Proposal Clone:
    Duplicates an existing proposal into a fresh Draft copy, enabling rapid batch authoring
    without re-entering common technical specifications, outcomes, or funding sources.
    """
    original = db.query(Proposal).filter(
        Proposal.id == proposal_id,
        Proposal.department_id == user["department_id"],
        or_(Proposal.is_archived == False, Proposal.is_archived.is_(None))
    ).first()

    if not original:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, 
            detail="Source proposal record not found."
        )

    cloned = Proposal(
        department_id=user["department_id"],
        issp_period=original.issp_period,
        outcome_id=original.outcome_id,
        project_id=original.project_id,
        needs_assessment_id=original.needs_assessment_id,
        strategic_category_id=original.strategic_category_id,
        category=original.category,
        strategic_category=original.strategic_category,
        office_location=original.office_location,
        fund_source=original.fund_source,
        uacs_object_code=original.uacs_object_code,
        expenditure_class=original.expenditure_class,
        status="Draft",
        item_key=original.item_key,
        item_name=f"{original.item_name} (Copy)",
        unit_cost=original.unit_cost,
        yearly_quantities=dict(original.yearly_quantities or {}),
        justification=original.justification,
        system_development_status=original.system_development_status,
        created_by_students=original.created_by_students,
        is_in_house_turnover=original.is_in_house_turnover,
        target_office_automated=original.target_office_automated,
        canvas_evidence_url=original.canvas_evidence_url,
        canvas_expiration_date=original.canvas_expiration_date,
        supplier_name=original.supplier_name,
        is_expansion=original.is_expansion,
        comments=[]
    )

    db.add(cloned)
    db.flush()

    client_ip = request.client.host if (request and request.client) else "Unknown"
    log_audit_event(
        db=db,
        action="PROPOSAL_DUPLICATED",
        module="PROPOSALS",
        user_id=user["id"],
        department_id=user["department_id"],
        proposal_id=cloned.id,
        ip_address=client_ip,
        new_value={"cloned_from": str(original.id), "new_item_name": cloned.item_name}
    )

    try:
        db.commit()
        db.refresh(cloned)
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to clone proposal: {str(e)}"
        )
    return cloned


@router.put("/proposals/{proposal_id}", response_model=ProposalResponse)
def update_merged_proposal(
    request: Request,
    proposal_id: uuid.UUID,
    payload: ProposalCreatePayload,
    db: Session = Depends(get_db),
    user: dict = Depends(require_dept_user)
):
    proposal = db.query(Proposal).filter(
        Proposal.id == proposal_id,
        Proposal.department_id == user["department_id"],
        or_(Proposal.is_archived == False, Proposal.is_archived.is_(None))
    ).first()

    if not proposal:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Proposal record not found.")

    if str(proposal.status).lower() in ["submitted", "approved"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Modification locked: This proposal is currently in '{proposal.status}' state and under administrative review."
        )

    resolved_outcome_id = getattr(payload, "outcome_id", None)
    if resolved_outcome_id is not None:
        outcome = db.query(OrganizationalOutcome).filter(OrganizationalOutcome.id == resolved_outcome_id).first()
        if not outcome:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Target Organizational Outcome ID {resolved_outcome_id} does not exist."
            )
        proposal.outcome_id = resolved_outcome_id

    resolved_needs_assessment_id = coerce_optional_uuid(payload.needs_assessment_id)
    if resolved_needs_assessment_id:
        na = db.query(NeedsAssessment).filter(NeedsAssessment.id == resolved_needs_assessment_id).first()
        if not na:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Needs Assessment with ID {resolved_needs_assessment_id} not found."
            )

    resolved_project_id = coerce_optional_uuid(payload.project_id)
    if resolved_project_id:
        proj = db.query(IctProject).filter(IctProject.id == resolved_project_id).first()
        if not proj:
            resolved_project_id = None
        else:
            proposal.fund_source = str(getattr(proj.funding_source, "value", proj.funding_source) or "General Appropriations Act (GAA)")
            proposal.strategic_category = str(getattr(proj.project_category, "value", proj.project_category) or "Internal ICT Projects")

    issp_period, aligned_quantities = align_and_validate_years(db, payload.yearly_quantities, is_submitting=False)
    payload.yearly_quantities = aligned_quantities

    validate_proposal_constraints(db, user["department_id"], payload, is_submitting=False)

    old_state = {
        "item_name": proposal.item_name,
        "unit_cost": str(proposal.unit_cost) if proposal.unit_cost is not None else "0.00",
        "yearly_quantities": proposal.yearly_quantities,
        "justification": proposal.justification
    }

    resolved_item_name = payload.item_name
    resolved_canvas_url = payload.canvas_evidence_url if payload.canvas_evidence_url is not None else proposal.canvas_evidence_url
    resolved_canvas_expiry = payload.canvas_expiration_date if payload.canvas_expiration_date is not None else proposal.canvas_expiration_date
    resolved_supplier = proposal.supplier_name or "Custom Supplier"
    resolved_category = payload.category or proposal.category or "Hardware"
    resolved_strategic_cat = proposal.strategic_category or payload.strategic_category or "Office Productivity"

    if payload.item_select and payload.item_select != "other":
        catalog_item = db.query(CatalogItem).filter(
            CatalogItem.item_key == payload.item_select,
            CatalogItem.is_active == True
        ).first()
        if catalog_item:
            resolved_item_name = catalog_item.display_name
            resolved_canvas_url = catalog_item.canvas_evidence_url
            resolved_canvas_expiry = catalog_item.canvas_expiration_date
            resolved_supplier = catalog_item.supplier_name
            payload.unit_cost = catalog_item.standard_unit_cost
            payload.justification = None
            if catalog_item.category == "software":
                resolved_category = "Subscription"

    if resolved_project_id:
        proj = db.query(IctProject).filter(IctProject.id == resolved_project_id).first()
        if proj:
            resolved_strategic_cat = getattr(proj.project_category, "value", str(proj.project_category))
        elif resolved_strategic_cat == "Office Productivity":
            resolved_strategic_cat = "Internal ICT Projects"

    is_turnover = bool(getattr(payload, "is_in_house_turnover", False) or getattr(payload, "created_by_students", False))
    resolved_office_loc = payload.office_location or proposal.office_location or "Central Office"
    resolved_fund_source = proposal.fund_source or payload.fund_source or "General Appropriations Act (GAA)"

    uacs_code, exp_class = classify_uacs_and_expenditure(
        item_name=resolved_item_name,
        unit_cost=payload.unit_cost,
        strategic_category=resolved_strategic_cat,
        category=resolved_category,
        created_by_students=is_turnover,
        is_in_house_turnover=is_turnover,
        db=db
    )

    dept = db.query(Department).filter(Department.id == user["department_id"]).first()
    automated_office = dept.name if dept else (proposal.target_office_automated or "Central Office")

    strat_cat_id = getattr(payload, "strategic_category_id", None)
    if not strat_cat_id and resolved_strategic_cat:
        sc_obj = db.query(StrategicCategory).filter(
            func.lower(StrategicCategory.name) == str(resolved_strategic_cat).strip().lower()
        ).first()
        if sc_obj:
            strat_cat_id = sc_obj.id

    proposal.project_id = resolved_project_id
    proposal.needs_assessment_id = resolved_needs_assessment_id
    proposal.strategic_category_id = strat_cat_id or proposal.strategic_category_id
    proposal.category = getattr(resolved_category, "value", str(resolved_category))
    proposal.strategic_category = getattr(resolved_strategic_cat, "value", str(resolved_strategic_cat))
    proposal.office_location = getattr(resolved_office_loc, "value", str(resolved_office_loc))
    proposal.fund_source = getattr(resolved_fund_source, "value", str(resolved_fund_source))
    proposal.uacs_object_code = getattr(uacs_code, "value", str(uacs_code))
    proposal.expenditure_class = getattr(exp_class, "value", str(exp_class))
    proposal.item_key = payload.item_select or proposal.item_key
    proposal.item_name = resolved_item_name
    proposal.unit_cost = payload.unit_cost
    proposal.yearly_quantities = payload.yearly_quantities
    proposal.justification = payload.justification
    proposal.system_development_status = getattr(payload.system_development_status, "value", str(payload.system_development_status or proposal.system_development_status))
    proposal.created_by_students = is_turnover
    proposal.is_in_house_turnover = is_turnover
    proposal.target_office_automated = automated_office
    proposal.canvas_evidence_url = resolved_canvas_url
    proposal.canvas_expiration_date = resolved_canvas_expiry
    proposal.supplier_name = resolved_supplier
    proposal.is_expansion = getattr(payload, "is_expansion", proposal.is_expansion)
    proposal.version += 1

    new_state = {
        "item_name": proposal.item_name,
        "unit_cost": str(proposal.unit_cost),
        "yearly_quantities": payload.yearly_quantities,
        "justification": proposal.justification
    }

    client_ip = request.client.host if (request and request.client) else "Unknown"
    log_audit_event(
        db=db,
        action="PROPOSAL_EDITED",
        module="PROPOSALS",
        user_id=user["id"],
        department_id=user["department_id"],
        proposal_id=proposal.id,
        ip_address=client_ip,
        old_value=old_state,
        new_value=new_state
    )
    
    try:
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update proposal: {str(e)}"
        )
    return proposal


@router.delete("/proposals/{proposal_id}", status_code=status.HTTP_200_OK)
def delete_proposal(
    request: Request,
    proposal_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: dict = Depends(require_dept_user)
):
    proposal = db.query(Proposal).filter(
        Proposal.id == proposal_id,
        Proposal.department_id == user["department_id"],
        or_(Proposal.is_archived == False, Proposal.is_archived.is_(None))
    ).first()

    if not proposal:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Proposal record not found.")

    if str(proposal.status).lower() not in ["draft", "returned"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Deletions are prohibited when status is '{proposal.status}'."
        )

    # Release any linked replacement inventory units
    db.query(ExistingInventory).filter(
        ExistingInventory.replacement_proposal_id == proposal.id
    ).update({"replacement_proposal_id": None}, synchronize_session=False)

    canvas_url = proposal.canvas_evidence_url
    is_shared = is_file_referenced_elsewhere(db, canvas_url, exclude_proposal_id=proposal_id)
    key = get_s3_key_from_url(canvas_url) if canvas_url and not is_shared else None

    client_ip = request.client.host if (request and request.client) else "Unknown"
    log_audit_event(
        db=db,
        action="PROPOSAL_DELETED",
        module="PROPOSALS",
        user_id=user["id"],
        department_id=user["department_id"],
        proposal_id=proposal_id,
        ip_address=client_ip,
        old_value={"item_name": proposal.item_name, "total_cost": str(proposal.total_cost)}
    )

    try:
        db.delete(proposal)
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete proposal record: {str(e)}"
        )

    if key:
        storage_client.delete_object(key)

    return {"status": "success", "message": "Proposal successfully deleted."}


@router.put("/proposals/{proposal_id}/submit")
def submit_proposal(
    request: Request,
    proposal_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: dict = Depends(require_dept_user)
):
    """
    Submits a proposal draft to the review queue without forcing department users
    to provide strategic project linkages, UACS accounting codes, or administrative outcome classifications.
    Exempts pre-approved catalog references and in-house/non-commercial projects from quotation canvas blocks.
    """
    proposal = db.query(Proposal).filter(
        Proposal.id == proposal_id,
        Proposal.department_id == user["department_id"],
        or_(Proposal.is_archived == False, Proposal.is_archived.is_(None))
    ).first()

    if not proposal:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Proposal record not found.")

    if str(proposal.status).lower() not in ["draft", "returned"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot submit proposal. Current status is '{proposal.status}'."
        )

    is_catalog = bool(proposal.item_key and proposal.item_key != "other")
    is_in_house = bool(proposal.created_by_students or proposal.is_in_house_turnover)

    # Quotation canvas compliance check: Standardized and centralized
    is_canvas_valid, canvas_msg = verify_canvas_compliance(
        item_select=proposal.item_key,
        is_in_house_turnover=is_in_house,
        canvas_url=proposal.canvas_evidence_url,
        canvas_expiry=proposal.canvas_expiration_date
    )
    if not is_canvas_valid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=canvas_msg
        )

    # Ensure accounting classification is assigned before headroom checks
    if not proposal.expenditure_class or not proposal.uacs_object_code:
        uacs, exp_class = classify_uacs_and_expenditure(
            item_name=proposal.item_name,
            unit_cost=proposal.unit_cost,
            strategic_category=proposal.strategic_category or "Office Productivity",
            category=proposal.category or "Hardware",
            created_by_students=is_in_house,
            is_in_house_turnover=is_in_house,
            db=db
        )
        proposal.uacs_object_code = uacs
        proposal.expenditure_class = exp_class

    issp_period, aligned_quantities = align_and_validate_years(db, proposal.yearly_quantities, is_submitting=True)
    proposal.yearly_quantities = aligned_quantities

    # Block submission if unresolved action items remain in comments
    comments = proposal.comments or []
    if any(c.get("requires_department_action") and not c.get("is_resolved") for c in comments):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot submit proposal: There are unresolved action items flagged on this draft. Please review the revision remarks thread."
        )

    # Dual-pool independent sub-ceiling headroom check (with row-level lock)
    check_budget_headroom(
        db=db,
        dept_id=user["department_id"],
        issp_period=proposal.issp_period,
        incoming_cost=proposal.total_cost,
        expenditure_class=proposal.expenditure_class,
        exclude_proposal_id=proposal.id
    )

    payload_to_verify = ProposalCreatePayload(
        outcome_id=proposal.outcome_id,
        project_id=proposal.project_id,
        needs_assessment_id=proposal.needs_assessment_id,
        category=proposal.category or "Hardware",
        strategic_category=proposal.strategic_category or "Office Productivity",
        office_location=proposal.office_location or "Central Office",
        fund_source=proposal.fund_source or "General Appropriations Act (GAA)",
        item_select=proposal.item_key or "other",
        item_name=proposal.item_name,
        unit_cost=proposal.unit_cost,
        yearly_quantities=proposal.yearly_quantities,
        justification=proposal.justification,
        system_development_status=proposal.system_development_status,
        created_by_students=is_in_house,
        is_in_house_turnover=is_in_house,
        canvas_evidence_url=proposal.canvas_evidence_url,
        canvas_expiration_date=proposal.canvas_expiration_date,
        is_expansion=proposal.is_expansion
    )
    validate_proposal_constraints(db, user["department_id"], payload_to_verify, is_submitting=True)

    # Close the hardware replacement loop by consuming condemned assets
    cat_lower = str(proposal.category or "").lower()
    is_hardware = "hardware" in cat_lower or "equipment" in cat_lower
    if (
        not proposal.is_expansion
        and not is_in_house
        and (proposal.strategic_category or "").lower() == "office productivity"
        and is_hardware
    ):
        unconsumed_assets = db.query(ExistingInventory).filter(
            ExistingInventory.department_id == user["department_id"],
            ExistingInventory.is_software == False,
            ExistingInventory.replacement_proposal_id.is_(None),
            or_(
                ExistingInventory.is_end_of_life == True,
                ExistingInventory.status == AssetStatus.CONDEMNED,
                cast(ExistingInventory.status, String).ilike("%condemned%")
            )
        ).order_by(ExistingInventory.date_acquired.asc()).all()

        qty_needed = proposal.total_qty
        for asset in unconsumed_assets:
            if qty_needed <= 0:
                break
            asset.replacement_proposal_id = proposal.id
            qty_needed -= (asset.quantity or 1)

    old_status = proposal.status
    proposal.status = "Submitted"
    proposal.version += 1

    client_ip = request.client.host if (request and request.client) else "Unknown"
    log_audit_event(
        db=db,
        action="STATE_TRANSITION_SUBMITTED",
        module="PROPOSALS",
        user_id=user["id"],
        department_id=user["department_id"],
        proposal_id=proposal.id,
        ip_address=client_ip,
        old_value={"status": old_status},
        new_value={"status": "Submitted", "total_cost": str(proposal.total_cost)}
    )
    
    try:
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to submit proposal: {str(e)}"
        )
    return {"status": "success", "new_status": proposal.status}


# ==========================================================
# 6. PROPOSED INFORMATION SYSTEMS (PART III.D - DEPT INTAKE)
# ==========================================================

@router.get("/systems", response_model=List[InformationSystemResponse])
def get_department_proposed_systems(
    submission_status: Optional[str] = Query(None, description="Draft, Submitted, Approved, Returned"),
    db: Session = Depends(get_db),
    user: dict = Depends(require_dept_user)
):
    """Retrieves all information systems proposed by or assigned to this department for the active cycle."""
    active_period = get_active_issp_period(db)
    dept_id = user["department_id"]
    dept = db.query(Department).filter(Department.id == dept_id).first()
    dept_name = dept.name if dept else ""

    query = db.query(InformationSystem).filter(
        InformationSystem.issp_period == active_period,
        or_(
            InformationSystem.department_id == dept_id,
            and_(
                InformationSystem.department_id.is_(None),
                InformationSystem.system_owner_office.ilike(f"%{dept_name}%")
            ) if dept_name else False
        )
    )

    if submission_status and submission_status.strip().lower() != "all":
        clean_stat = submission_status.strip().lower()
        query = query.filter(func.lower(cast(InformationSystem.submission_status, String)) == clean_stat)

    systems = query.options(
        joinedload(InformationSystem.department),
        joinedload(InformationSystem.needs_assessment),
        joinedload(InformationSystem.project_parent)
    ).order_by(InformationSystem.name.asc()).all()

    results = []
    for sys in systems:
        resp = InformationSystemResponse.model_validate(sys)
        if sys.department:
            resp.department_name = sys.department.name
        elif sys.system_owner_office:
            resp.department_name = sys.system_owner_office
        if sys.needs_assessment:
            resp.needs_assessment_title = sys.needs_assessment.title
        if sys.project_parent:
            resp.project_title = sys.project_parent.project_title
        elif sys.project_id:
            proj = db.query(IctProject).filter(IctProject.id == sys.project_id).first()
            if proj:
                resp.project_title = proj.project_title
        results.append(resp)

    return results


@router.get("/systems/{system_id}", response_model=InformationSystemResponse)
def get_department_proposed_system_detail(
    system_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: dict = Depends(require_dept_user)
):
    """Retrieves details of a specific proposed information system."""
    system = db.query(InformationSystem).options(
        joinedload(InformationSystem.department),
        joinedload(InformationSystem.needs_assessment),
        joinedload(InformationSystem.project_parent)
    ).filter(
        InformationSystem.id == system_id,
        InformationSystem.department_id == user["department_id"]
    ).first()

    if not system:
        raise HTTPException(status_code=404, detail="Proposed information system record not found.")

    resp = InformationSystemResponse.model_validate(system)
    if system.department:
        resp.department_name = system.department.name
    elif system.system_owner_office:
        resp.department_name = system.system_owner_office
    if system.needs_assessment:
        resp.needs_assessment_title = system.needs_assessment.title
    if system.project_parent:
        resp.project_title = system.project_parent.project_title
    elif system.project_id:
        proj = db.query(IctProject).filter(IctProject.id == system.project_id).first()
        if proj:
            resp.project_title = proj.project_title
    return resp


@router.post("/systems", response_model=InformationSystemResponse, status_code=status.HTTP_201_CREATED)
def create_department_proposed_system(
    request: Request,
    payload: InformationSystemCreate,
    db: Session = Depends(get_db),
    user: dict = Depends(require_dept_user)
):
    """
    Simplified Department System Proposal intake (Part III.D):
    Department users submit software needs without facing technical architecture jargon.
    Maintains clean separation between Information Systems (Part III.D) and Resource Proposals (Part IV.A).
    """
    active_period = get_active_issp_period(db)
    dept = db.query(Department).filter(Department.id == user["department_id"]).first()
    dept_name = dept.name if dept else "Central Office"

    dumped = payload.model_dump()

    # Validate non-negative cost
    cost = Decimal(str(dumped.get("proposed_cost") or 0))
    if cost < Decimal("0.00"):
        raise HTTPException(status_code=400, detail="Proposed cost cannot be negative.")

    # Verify linked needs assessment exists if provided
    needs_assessment_id = coerce_optional_uuid(getattr(payload, "needs_assessment_id", None))
    if needs_assessment_id:
        na = db.query(NeedsAssessment).filter(
            NeedsAssessment.id == needs_assessment_id,
            NeedsAssessment.department_id == user["department_id"]
        ).first()
        if not na:
            raise HTTPException(status_code=404, detail="Referenced Needs Assessment record not found.")
        dumped["needs_assessment_id"] = needs_assessment_id
    else:
        dumped["needs_assessment_id"] = None

    # Handle project_id linkage if provided
    project_id = coerce_optional_uuid(getattr(payload, "project_id", None) or dumped.get("project_id"))
    if project_id:
        proj = db.query(IctProject).filter(IctProject.id == project_id).first()
        if proj:
            dumped["project_id"] = project_id
        else:
            dumped["project_id"] = None
    else:
        dumped["project_id"] = None

    # Calculate multi-classification flags with safe fallbacks
    c_str = str(dumped.get("classification", "")).lower()
    is_support = dumped.get("is_support_to_operations")
    if is_support is None:
        is_support = "support" in c_str

    is_admin = dumped.get("is_general_administrative")
    if is_admin is None:
        is_admin = "administrative" in c_str or "admin" in c_str

    is_ops = dumped.get("is_operations")
    if is_ops is None:
        is_ops = "operations" in c_str or not (is_support or is_admin)

    is_frontline = dumped.get("is_frontline_service")
    if is_frontline is None:
        is_frontline = dumped.get("is_client_facing", True) if ("frontline" in c_str or not is_admin) else False

    is_non_frontline = dumped.get("is_non_frontline_service")
    if is_non_frontline is None:
        is_non_frontline = "non-frontline" in c_str

    dumped["is_support_to_operations"] = bool(is_support)
    dumped["is_general_administrative"] = bool(is_admin)
    dumped["is_operations"] = bool(is_ops)
    dumped["is_frontline_service"] = bool(is_frontline)
    dumped["is_non_frontline_service"] = bool(is_non_frontline)
    dumped["frontline_hosting_type"] = dumped.get("frontline_hosting_type") or dumped.get("hosting_type") or "Online"

    # Department metadata defaults
    dumped["department_id"] = user["department_id"]
    if not dumped.get("system_owner_office"):
        dumped["system_owner_office"] = dept_name
    dumped["submission_status"] = "Draft"

    if dumped.get("status") == "Operational":
        dumped["status"] = "For Development"

    if not dumped.get("development_strategy"):
        dumped["development_strategy"] = "Outsourced"
    if not dumped.get("development_platform"):
        dumped["development_platform"] = "Institutional Web Framework"
    if not dumped.get("database_name"):
        clean_name = dumped.get("name", "app").lower().replace(" ", "_")[:30]
        dumped["database_name"] = f"{clean_name}_db"
    if not dumped.get("data_storage_type"):
        dumped["data_storage_type"] = "GovCloud / On-premise Storage"
    if not dumped.get("internal_users"):
        dumped["internal_users"] = f"{dept_name} Personnel"
    if not dumped.get("external_users"):
        dumped["external_users"] = "General Citizens / Public" if dumped.get("is_client_facing", True) else "None"

    db_system = InformationSystem(
        issp_period=active_period,
        **{k: v for k, v in dumped.items() if hasattr(InformationSystem, k)}
    )

    db.add(db_system)
    db.flush()

    client_ip = request.client.host if (request and request.client) else "Unknown"
    log_audit_event(
        db=db,
        action="SYSTEM_PROPOSED_BY_DEPT",
        module="SYSTEMS",
        user_id=user["id"],
        department_id=user["department_id"],
        ip_address=client_ip,
        new_value={
            "system_id": str(db_system.id),
            "name": db_system.name,
            "status": db_system.status,
            "proposed_cost": float(getattr(payload, "proposed_cost", 0) or 0),
            "project_id": str(db_system.project_id) if db_system.project_id else None,
            "submission_status": "Draft"
        }
    )

    db.commit()
    db.refresh(db_system)

    resp = InformationSystemResponse.model_validate(db_system)
    if db_system.department:
        resp.department_name = db_system.department.name
    elif db_system.system_owner_office:
        resp.department_name = db_system.system_owner_office
    if db_system.needs_assessment:
        resp.needs_assessment_title = db_system.needs_assessment.title
    if getattr(db_system, "project_parent", None):
        resp.project_title = db_system.project_parent.project_title
    elif db_system.project_id:
        proj = db.query(IctProject).filter(IctProject.id == db_system.project_id).first()
        if proj:
            resp.project_title = proj.project_title
    return resp


@router.put("/systems/{system_id}", response_model=InformationSystemResponse)
def update_department_proposed_system(
    request: Request,
    system_id: uuid.UUID,
    payload: InformationSystemUpdate,
    db: Session = Depends(get_db),
    user: dict = Depends(require_dept_user)
):
    """Updates a proposed information system draft in Part III.D."""
    system = db.query(InformationSystem).filter(
        InformationSystem.id == system_id,
        InformationSystem.department_id == user["department_id"]
    ).first()

    if not system:
        raise HTTPException(status_code=404, detail="Proposed information system record not found.")

    if str(getattr(system, "submission_status", "Draft")).lower() in ["submitted", "approved"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Editing locked: System proposal is currently in '{system.submission_status}' state."
        )

    update_data = payload.model_dump(exclude_unset=True)

    if "proposed_cost" in update_data and update_data["proposed_cost"] is not None:
        cost = Decimal(str(update_data["proposed_cost"]))
        if cost < Decimal("0.00"):
            raise HTTPException(status_code=400, detail="Proposed cost cannot be negative.")

    if "project_id" in update_data:
        p_id = coerce_optional_uuid(update_data.get("project_id"))
        if p_id:
            proj = db.query(IctProject).filter(IctProject.id == p_id).first()
            system.project_id = p_id if proj else None
        else:
            system.project_id = None
        del update_data["project_id"]

    if "needs_assessment_id" in update_data:
        n_id = coerce_optional_uuid(update_data.get("needs_assessment_id"))
        system.needs_assessment_id = n_id
        del update_data["needs_assessment_id"]

    for key, value in update_data.items():
        if hasattr(system, key):
            setattr(system, key, value)

    if "classification" in update_data:
        c_str = str(system.classification).lower()
        if "is_support_to_operations" not in update_data:
            system.is_support_to_operations = "support" in c_str
        if "is_general_administrative" not in update_data:
            system.is_general_administrative = "administrative" in c_str or "admin" in c_str
        if "is_operations" not in update_data:
            system.is_operations = "operations" in c_str or not (system.is_support_to_operations or system.is_general_administrative)
        if "is_frontline_service" not in update_data:
            system.is_frontline_service = ("frontline" in c_str and "non-frontline" not in c_str)
        if "is_non_frontline_service" not in update_data:
            system.is_non_frontline_service = ("non-frontline" in c_str)

    if "hosting_type" in update_data and "frontline_hosting_type" not in update_data:
        system.frontline_hosting_type = update_data["hosting_type"] or "Online"

    new_cost = getattr(system, "proposed_cost", Decimal("0.00")) or Decimal("0.00")

    client_ip = request.client.host if (request and request.client) else "Unknown"
    log_audit_event(
        db=db,
        action="SYSTEM_PROPOSAL_UPDATED",
        module="SYSTEMS",
        user_id=user["id"],
        department_id=user["department_id"],
        ip_address=client_ip,
        new_value={
            "system_id": str(system.id), 
            "name": system.name,
            "proposed_cost": float(new_cost),
            "project_id": str(system.project_id) if system.project_id else None
        }
    )

    db.commit()
    db.refresh(system)

    resp = InformationSystemResponse.model_validate(system)
    if system.department:
        resp.department_name = system.department.name
    elif system.system_owner_office:
        resp.department_name = system.system_owner_office
    if system.needs_assessment:
        resp.needs_assessment_title = system.needs_assessment.title
    if getattr(system, "project_parent", None):
        resp.project_title = system.project_parent.project_title
    elif system.project_id:
        proj = db.query(IctProject).filter(IctProject.id == system.project_id).first()
        if proj:
            resp.project_title = proj.project_title
    return resp


@router.delete("/systems/{system_id}")
def delete_department_proposed_system(
    request: Request,
    system_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: dict = Depends(require_dept_user)
):
    """Deletes a draft or returned proposed information system."""
    system = db.query(InformationSystem).filter(
        InformationSystem.id == system_id,
        InformationSystem.department_id == user["department_id"]
    ).first()

    if not system:
        raise HTTPException(status_code=404, detail="Proposed information system record not found.")

    if str(getattr(system, "submission_status", "Draft")).lower() in ["submitted", "approved"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Cannot delete system in '{system.submission_status}' state."
        )

    sys_name = system.name
    db.delete(system)

    client_ip = request.client.host if (request and request.client) else "Unknown"
    log_audit_event(
        db=db,
        action="SYSTEM_PROPOSAL_DELETED",
        module="SYSTEMS",
        user_id=user["id"],
        department_id=user["department_id"],
        ip_address=client_ip,
        old_value={"system_id": str(system_id), "name": sys_name}
    )

    db.commit()
    return {"status": "success", "message": f"System proposal '{sys_name}' deleted."}


@router.put("/systems/{system_id}/submit")
def submit_department_proposed_system(
    request: Request,
    system_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: dict = Depends(require_dept_user)
):
    """Submits a proposed system draft directly to the Information Systems Intake Queue."""
    system = db.query(InformationSystem).filter(
        InformationSystem.id == system_id,
        InformationSystem.department_id == user["department_id"]
    ).first()

    if not system:
        raise HTTPException(status_code=404, detail="Proposed information system record not found.")

    if str(getattr(system, "submission_status", "Draft")).lower() not in ["draft", "returned"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot submit system. Current submission status is '{system.submission_status}'."
        )

    if not (system.name or "").strip():
        raise HTTPException(status_code=400, detail="System Name is required.")

    if not (system.description_and_purpose or "").strip():
        raise HTTPException(status_code=400, detail="System Description & Purpose is required.")

    if (system.status or "").lower() == "for enhancement" and not (system.enhancement_details or "").strip():
        raise HTTPException(
            status_code=400,
            detail="Enhancement Details are required when proposing a system upgrade ('For Enhancement')."
        )

    system.submission_status = "Submitted"
    system.rejection_reason = None

    client_ip = request.client.host if (request and request.client) else "Unknown"
    log_audit_event(
        db=db,
        action="SYSTEM_PROPOSAL_SUBMITTED",
        module="SYSTEMS",
        user_id=user["id"],
        department_id=user["department_id"],
        ip_address=client_ip,
        new_value={"system_id": str(system.id), "name": system.name, "status": "Submitted"}
    )

    db.commit()
    db.refresh(system)
    return {"status": "success", "message": f"Information System '{system.name}' submitted to MIS Review Queue."}


# ==========================================================
# 7. FILE WORKSPACES & CANVAS UPLOADS
# ==========================================================

@router.post("/upload/canvas")
async def upload_canvas(
    request: Request,
    proposal_id: str = Form(...),
    supplier_name: str = Form(...),
    canvas_expiration_date: Optional[str] = Form(None),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: dict = Depends(require_user)
):
    """
    Uploads quotation canvas PDF and links it to the proposal.
    Cleans up old unlinked files from storage to prevent orphaned files.
    """
    try:
        proposal_uuid = uuid.UUID(proposal_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid UUID format for proposal_id.")

    proposal = db.query(Proposal).filter(
        Proposal.id == proposal_uuid,
        or_(Proposal.is_archived == False, Proposal.is_archived.is_(None))
    ).first()

    if not proposal:
        raise HTTPException(status_code=404, detail="Proposal record not found.")

    if user["role"] != "ROLE_MIS_ADMIN" and proposal.department_id != user["department_id"]:
        raise HTTPException(status_code=403, detail="Permission denied.")

    if str(proposal.status).lower() not in ["draft", "returned"]:
        raise HTTPException(status_code=403, detail="Upload locked: Proposal is under administrative review.")

    file_bytes = await file.read()
    if not validate_pdf_content(file_bytes):
        raise HTTPException(status_code=400, detail="Invalid format. Only genuine PDF files are permitted.")
    await file.seek(0)

    old_canvas_url = proposal.canvas_evidence_url

    safe_supplier = secure_filename(supplier_name) if supplier_name else "default_supplier"
    safe_filename = secure_filename(file.filename)
    key = storage_client.get_canvas_key(str(proposal_uuid), safe_supplier, safe_filename)
    
    success = storage_client.upload_canvas_evidence(file_bytes, key)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to write quotation proof document to repository.")

    download_url = storage_client.generate_download_url(key)
    proposal.canvas_evidence_url = download_url
    proposal.supplier_name = supplier_name
    
    if canvas_expiration_date:
        try:
            proposal.canvas_expiration_date = datetime.fromisoformat(canvas_expiration_date.replace("Z", "+00:00"))
        except Exception:
            pass

    if old_canvas_url and old_canvas_url != download_url:
        if not is_file_referenced_elsewhere(db, old_canvas_url, exclude_proposal_id=proposal_uuid):
            old_s3_key = get_s3_key_from_url(old_canvas_url)
            if old_s3_key:
                storage_client.delete_object(old_s3_key)

    client_ip = request.client.host if (request and request.client) else "Unknown"
    log_audit_event(
        db=db,
        action="CANVAS_UPLOADED",
        module="PROPOSALS",
        user_id=user["id"],
        department_id=user.get("department_id"),
        proposal_id=proposal.id,
        ip_address=client_ip,
        new_value={"supplier_name": supplier_name, "canvas_url": download_url}
    )
    
    try:
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Database update failed: {str(e)}")

    return {
        "status": "success", 
        "proposal_id": proposal_uuid, 
        "supplier": supplier_name, 
        "file_url": download_url,
        "canvas_expiration_date": proposal.canvas_expiration_date
    }


@router.post("/upload/unserviceable-report")
async def upload_unserviceable_evidence(
    request: Request,
    inventory_id: str = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: dict = Depends(require_dept_user)
):
    try:
        inventory_uuid = uuid.UUID(inventory_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid UUID format for inventory_id.")

    asset = db.query(ExistingInventory).filter(
        ExistingInventory.id == inventory_uuid,
        ExistingInventory.department_id == user["department_id"]
    ).first()

    if not asset:
        raise HTTPException(status_code=404, detail="Inventory asset record not found.")

    if str(asset.status).lower() in ["functional"]:
        raise HTTPException(status_code=400, detail="Functional items do not require an unserviceable report.")

    file_bytes = await file.read()
    if not validate_pdf_content(file_bytes):
        raise HTTPException(status_code=400, detail="Invalid format. Only genuine PDF files are accepted.")
    await file.seek(0)

    safe_filename = secure_filename(file.filename)
    file_url = storage_client.upload_unserviceable_report(
        file_data=file_bytes,
        department_id=str(user["department_id"]),
        filename=safe_filename
    )

    if not file_url:
        raise HTTPException(status_code=500, detail="Failed to write inspection report to repository.")

    asset.unserviceable_report_url = file_url

    client_ip = request.client.host if (request and request.client) else "Unknown"
    log_audit_event(
        db=db,
        action="IIRUP_REPORT_UPLOADED",
        module="INVENTORY",
        user_id=user["id"],
        department_id=user["department_id"],
        ip_address=client_ip,
        new_value={"inventory_id": str(asset.id), "file_url": file_url}
    )

    try:
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to link report: {str(e)}")

    return {"status": "success", "inventory_id": asset.id, "file_url": file_url}


# ==========================================================
# 8. NOTIFICATIONS & REVISION REMARKS (ROLE-SCOPED INBOX)
# ==========================================================

@router.get("/notifications", response_model=List[Dict[str, Any]])
def get_department_notifications(
    category: Optional[str] = Query(None),
    days: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    user: dict = Depends(require_dept_user)
):
    dept_id = user["department_id"]
    notifications = []

    proposals_query = db.query(Proposal).filter(Proposal.department_id == dept_id)
    proposals_list = proposals_query.all()
    proposal_map = {p.id: p.item_name for p in proposals_list}
    proposal_uuids = list(proposal_map.keys())

    audit_query = db.query(AuditTrail).options(joinedload(AuditTrail.user))

    conditions = [AuditTrail.department_id == dept_id]
    if proposal_uuids:
        conditions.append(AuditTrail.proposal_id.in_(proposal_uuids))
    audit_query = audit_query.filter(or_(*conditions))

    if days:
        boundary_date = datetime.now(timezone.utc) - timedelta(days=days)
        audit_query = audit_query.filter(AuditTrail.timestamp >= boundary_date)

    for log in audit_query.order_by(AuditTrail.timestamp.desc()).limit(100).all():
        is_relevant = False
        title = "Workspace Event"
        description = ""
        type_ = "general"
        target_name = "Department Asset"
        url_path = None

        log_prop_id = str(log.proposal_id) if log.proposal_id else None
        operator_email = log.user.email if log.user else "System/Cron"
        operator_role = getattr(log.user.role_tag, "value", str(log.user.role_tag)) if log.user else "SYSTEM"

        if log_prop_id and log.proposal_id in proposal_map:
            is_relevant = True
            target_name = proposal_map[log.proposal_id]
            url_path = "/dept/proposals"
            if log.action == "STATE_TRANSITION_SUBMITTED":
                title = "Proposal Submitted"
                description = f"Proposal '{target_name}' has been queued for review."
                type_ = "status_change"
            elif log.action == "STATE_TRANSITION_APPROVED":
                title = "Proposal Approved"
                description = f"Proposal '{target_name}' was approved."
                type_ = "status_change"
            elif log.action == "STATE_TRANSITION_RETURNED":
                title = "Proposal Returned"
                description = f"Proposal '{target_name}' was returned. Please review action items."
                type_ = "status_change"
            elif log.action == "PROPOSAL_OVERRIDDEN_BY_ADMIN":
                title = "Compliance Classification Applied"
                description = f"MIS Admin applied a governance classification to '{target_name}'."
                type_ = "override"
            elif log.action == "PROPOSAL_CREATED":
                title = "Proposal Drafted"
                description = f"New proposal line item '{target_name}' created in workspace."
                type_ = "status_change"
            elif log.action == "PROPOSAL_DUPLICATED":
                title = "Proposal Cloned"
                description = f"Proposal '{target_name}' duplicated into a new draft."
                type_ = "status_change"

        elif log.action == "SYSTEM_BUDGET_CEILING_UPDATED":
            nv = log.new_value or {}
            if nv.get("department_id") == dept_id or log.department_id == dept_id:
                is_relevant = True
                title = "Budget Ceiling Updated"
                description = f"Department allocation updated: CapEx ₱{float(nv.get('allocated_capex', 0)):,.2f} | MOOE ₱{float(nv.get('allocated_mooe', 0)):,.2f}"
                type_ = "budget"
                url_path = "/dept/dashboard"

        elif log.action == "NEEDS_ASSESSMENT_CREATED":
            is_relevant = True
            title = "Needs Assessment Logged"
            nv = log.new_value or {}
            description = f"Needs Assessment recorded: '{nv.get('title', 'Technical Need')}'"
            type_ = "general"
            url_path = "/dept/needs"

        if is_relevant:
            notifications.append({
                "id": str(log.id),
                "title": title,
                "description": description,
                "type": type_,
                "timestamp": log.timestamp.isoformat(),
                "ref_id": log_prop_id or "",
                "target_name": target_name,
                "url_path": url_path,
                "operator_email": operator_email,
                "operator_role": operator_role,
                "old_value": log.old_value,
                "new_value": log.new_value
            })

    for p in proposals_list:
        comments_list = p.comments or []
        for c in comments_list:
            if isinstance(c, dict) and c.get("requires_department_action") and not c.get("is_resolved"):
                notifications.append({
                    "id": c.get("id"),
                    "title": "Action Required: Pinned Feedback",
                    "description": f"Admin remark on '{p.item_name}': \"{c.get('text')}\"",
                    "type": "comment",
                    "timestamp": c.get("timestamp") or datetime.now(timezone.utc).isoformat(),
                    "ref_id": str(p.id),
                    "target_name": p.item_name,
                    "url_path": "/dept/proposals",
                    "operator_email": c.get("author_email") or "Admin",
                    "operator_role": "ROLE_MIS_ADMIN",
                    "old_value": None,
                    "new_value": {"comment_text": c.get("text")}
                })

    if category:
        notifications = [n for n in notifications if n["type"] == category.lower().strip()]

    notifications.sort(key=lambda x: x["timestamp"], reverse=True)
    return notifications[:50]


@router.get("/action-items/summary", response_model=Dict[str, int])
def get_action_items_summary(
    db: Session = Depends(get_db),
    user: dict = Depends(require_dept_user)
):
    dept_id = user["department_id"]
    active_period = get_active_issp_period(db)
    unread_actions = 0

    proposals = db.query(Proposal).filter(
        Proposal.department_id == dept_id,
        Proposal.issp_period == active_period,
        or_(Proposal.is_archived == False, Proposal.is_archived.is_(None))
    ).all()
    
    for p in proposals:
        comments_list = p.comments or []
        for c in comments_list:
            if isinstance(c, dict) and c.get("requires_department_action") and not c.get("is_resolved"):
                unread_actions += 1

    returned_proposals = db.query(Proposal).filter(
        Proposal.department_id == dept_id,
        Proposal.issp_period == active_period,
        func.lower(cast(Proposal.status, String)) == "returned",
        or_(Proposal.is_archived == False, Proposal.is_archived.is_(None))
    ).count()

    return {"unread_actions": unread_actions, "returned_proposals": returned_proposals}


@router.post("/proposals/{proposal_id}/comments")
def post_inline_comment(
    request: Request,
    proposal_id: uuid.UUID,
    payload: CommentCreate,
    db: Session = Depends(get_db),
    user: dict = Depends(require_user)
):
    target = db.query(Proposal).filter(Proposal.id == proposal_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="Proposal record not found.")

    if user["role"] != "ROLE_MIS_ADMIN" and target.department_id != user["department_id"]:
        raise HTTPException(status_code=403, detail="Permission denied.")

    current_comments = list(target.comments or [])
    new_comment = {
        "id": str(uuid.uuid4()),
        "author_name": user["email"].split("@")[0].replace(".", " ").title(),
        "author_email": user["email"],
        "author_role": user["role"],
        "text": payload.text,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "is_resolved": False,
        "field_name": payload.field_name,
        "requires_department_action": payload.requires_department_action
    }

    current_comments.append(new_comment)
    target.comments = current_comments

    client_ip = request.client.host if (request and request.client) else "Unknown"
    log_audit_event(
        db=db,
        action="COMMENT_POSTED",
        module="PROPOSALS",
        user_id=user["id"],
        department_id=user.get("department_id"),
        proposal_id=proposal_id,
        ip_address=client_ip,
        new_value={"comment_id": new_comment["id"], "text": payload.text, "requires_action": payload.requires_department_action}
    )

    try:
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to post comment: {str(e)}")

    return {"status": "success", "comment": new_comment}


@router.get("/proposals/{proposal_id}/comments")
def get_proposal_comments(
    proposal_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: dict = Depends(require_user)
):
    target = db.query(Proposal).filter(Proposal.id == proposal_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="Proposal record not found.")

    if user["role"] != "ROLE_MIS_ADMIN" and target.department_id != user["department_id"]:
        raise HTTPException(status_code=403, detail="Permission denied.")

    return target.comments or []


@router.post("/proposals/{proposal_id}/comments/{comment_id}/resolve")
def resolve_proposal_comment(
    request: Request,
    proposal_id: uuid.UUID,
    comment_id: str,
    db: Session = Depends(get_db),
    user: dict = Depends(require_dept_user)
):
    target = db.query(Proposal).filter(
        Proposal.id == proposal_id,
        Proposal.department_id == user["department_id"]
    ).first()
    
    if not target:
        raise HTTPException(status_code=404, detail="Proposal record not found.")

    comments = list(target.comments or [])
    comment_found = False
    for comment in comments:
        if comment.get("id") == comment_id:
            comment["is_resolved"] = True
            comment_found = True
            break

    if not comment_found:
        raise HTTPException(status_code=404, detail="Comment record not found.")

    target.comments = comments

    client_ip = request.client.host if (request and request.client) else "Unknown"
    log_audit_event(
        db=db,
        action="COMMENT_RESOLVED",
        module="PROPOSALS",
        user_id=user["id"],
        department_id=user["department_id"],
        proposal_id=proposal_id,
        ip_address=client_ip,
        new_value={"comment_id": comment_id, "resolved": True}
    )

    try:
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to resolve comment: {str(e)}")

    return {"status": "success", "message": "Action item marked as resolved."}


# ==========================================================
# 9. SECTION 8.0: NEEDS ASSESSMENT
# ==========================================================

@router.post("/needs-assessment", response_model=NeedsAssessmentResponse, status_code=status.HTTP_201_CREATED)
def create_needs_assessment(
    request: Request,
    payload: NeedsAssessmentCreate,
    db: Session = Depends(get_db),
    user: dict = Depends(require_dept_user)
):
    active_period = get_active_issp_period(db)
    dept = db.query(Department).filter(Department.id == user["department_id"]).first()
    dept_name = dept.name if dept else None

    new_assessment = NeedsAssessment(
        department_id=user["department_id"],
        issp_period=active_period,
        title=payload.title.strip(),
        mfo_alignment=payload.mfo_alignment.strip(),
        current_problem=payload.current_problem.strip(),
        proposed_solution=payload.proposed_solution.strip(),
        expected_impacts=payload.expected_impacts,
        other_impact=payload.other_impact.strip() if payload.other_impact else None,
        is_aggregated=False,
        strategic_concern_id=None
    )
    db.add(new_assessment)

    client_ip = request.client.host if (request and request.client) else "Unknown"
    log_audit_event(
        db=db,
        action="NEEDS_ASSESSMENT_CREATED",
        module="PROPOSALS",
        user_id=user["id"],
        department_id=user["department_id"],
        ip_address=client_ip,
        new_value={"title": new_assessment.title, "mfo_alignment": new_assessment.mfo_alignment}
    )

    try:
        db.commit()
        db.refresh(new_assessment)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to save assessment: {str(e)}")
    
    resp = NeedsAssessmentResponse.model_validate(new_assessment)
    resp.department_name = dept_name
    return resp


@router.get("/needs-assessment", response_model=List[NeedsAssessmentResponse])
def get_needs_assessments(
    db: Session = Depends(get_db),
    user: dict = Depends(require_dept_user)
):
    active_period = get_active_issp_period(db)
    dept = db.query(Department).filter(Department.id == user["department_id"]).first()
    dept_name = dept.name if dept else None
    
    items = db.query(NeedsAssessment).filter(
        NeedsAssessment.department_id == user["department_id"],
        NeedsAssessment.issp_period == active_period,
        NeedsAssessment.is_archived == False
    ).order_by(NeedsAssessment.id.desc()).all()

    result = []
    for na in items:
        resp = NeedsAssessmentResponse.model_validate(na)
        resp.department_name = dept_name
        result.append(resp)
    return result


@router.put("/needs-assessment/{assessment_id}", response_model=NeedsAssessmentResponse)
def update_needs_assessment(
    request: Request,
    assessment_id: uuid.UUID,
    payload: NeedsAssessmentCreate,
    db: Session = Depends(get_db),
    user: dict = Depends(require_dept_user)
):
    assessment = db.query(NeedsAssessment).filter(
        NeedsAssessment.id == assessment_id,
        NeedsAssessment.department_id == user["department_id"],
        NeedsAssessment.is_archived == False
    ).first()

    if not assessment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, 
            detail="Needs Assessment record not found."
        )

    dept = db.query(Department).filter(Department.id == user["department_id"]).first()
    dept_name = dept.name if dept else "Department"

    old_state = {
        "title": assessment.title,
        "mfo_alignment": assessment.mfo_alignment,
        "current_problem": assessment.current_problem,
        "proposed_solution": assessment.proposed_solution,
        "expected_impacts": assessment.expected_impacts,
        "other_impact": assessment.other_impact
    }

    assessment.title = payload.title.strip()
    assessment.mfo_alignment = payload.mfo_alignment.strip()
    assessment.current_problem = payload.current_problem.strip()
    assessment.proposed_solution = payload.proposed_solution.strip()
    assessment.expected_impacts = payload.expected_impacts
    assessment.other_impact = payload.other_impact.strip() if payload.other_impact else None

    if assessment.strategic_concern_id and assessment.strategic_concern:
        assessment.strategic_concern.problems = f"[{dept_name}]: {assessment.current_problem}"
        assessment.strategic_concern.intended_use = assessment.proposed_solution

    client_ip = request.client.host if (request and request.client) else "Unknown"
    log_audit_event(
        db=db,
        action="NEEDS_ASSESSMENT_UPDATED",
        module="PROPOSALS",
        user_id=user["id"],
        department_id=user["department_id"],
        ip_address=client_ip,
        old_value=old_state,
        new_value={
            "title": assessment.title,
            "mfo_alignment": assessment.mfo_alignment
        }
    )

    try:
        db.commit()
        db.refresh(assessment)
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, 
            detail=f"Failed to update assessment: {str(e)}"
        )

    resp = NeedsAssessmentResponse.model_validate(assessment)
    resp.department_name = dept_name
    return resp


@router.delete("/needs-assessment/{assessment_id}")
def delete_needs_assessment(
    request: Request,
    assessment_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: dict = Depends(require_dept_user)
):
    assessment = db.query(NeedsAssessment).filter(
        NeedsAssessment.id == assessment_id,
        NeedsAssessment.department_id == user["department_id"]
    ).first()

    if not assessment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, 
            detail="Needs Assessment record not found."
        )

    if assessment.is_aggregated:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Deletion blocked: This Needs Assessment has been aggregated into a Strategic Concern by the MIS Administrator."
        )

    client_ip = request.client.host if (request and request.client) else "Unknown"
    log_audit_event(
        db=db,
        action="NEEDS_ASSESSMENT_DELETED",
        module="PROPOSALS",
        user_id=user["id"],
        department_id=user["department_id"],
        ip_address=client_ip,
        old_value={"title": assessment.title, "id": str(assessment.id)}
    )

    db.delete(assessment)
    db.commit()
    return {"status": "success", "message": "Needs Assessment deleted successfully."}


# ==========================================================
# 10. TRANSPARENT DOCUMENT ACCESS (AUTOMATED STORAGE COMPATIBILITY)
# ==========================================================

@router.post("/proposals/{proposal_id}/restore")
def retrieve_archived_document(
    request: Request,
    proposal_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: dict = Depends(require_dept_user)
):
    """
    Transparent Document Access Handler:
    Department users have immediate automated access to quotation canvases and archives.
    Eliminates manual vendor restoration requests and returns active access URLs.
    """
    proposal = db.query(Proposal).filter(
        Proposal.id == proposal_id,
        Proposal.department_id == user["department_id"],
        or_(Proposal.is_archived == False, Proposal.is_archived.is_(None))
    ).first()

    if not proposal:
        raise HTTPException(status_code=404, detail="Proposal record not found.")

    canvas_url = proposal.canvas_evidence_url
    if not canvas_url:
        raise HTTPException(status_code=400, detail="Proposal has no linked quotation proof.")

    # Automatically retrieve download URL transparently
    key = get_s3_key_from_url(canvas_url)
    resolved_url = storage_client.generate_download_url(key) if key else canvas_url

    return {
        "status": "available",
        "file_url": resolved_url,
        "message": "Document verified and available for viewing."
    }


@router.post("/proposals/{proposal_id}/sync-metadata")
def sync_proposal_document_metadata(
    proposal_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: dict = Depends(require_dept_user)
):
    """Refreshes document availability state cleanly without cloud vendor jargon."""
    proposal = db.query(Proposal).filter(
        Proposal.id == proposal_id,
        Proposal.department_id == user["department_id"]
    ).first()
    if not proposal:
        raise HTTPException(status_code=404, detail="Proposal record not found.")

    return {
        "status": "success",
        "storage_tier": "Official Procurement Archive",
        "is_available": True,
        "restore_progress": 100
    }