# app/dept/router.py
import os
import uuid
import logging
from decimal import Decimal
from datetime import datetime, timedelta, timezone
from typing import Any, List, Optional, Dict
from fastapi import APIRouter, Depends, HTTPException, status, Query, UploadFile, File, Form, Request
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func, or_

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
    BudgetCeiling
)
from app.schemas import (
    SupplyInventoryResponse, 
    ProposalCreatePayload, 
    ProposalResponse,
    CommentCreate,
    CatalogItemResponse,
    NeedsAssessmentCreate, 
    NeedsAssessmentResponse,
    OrganizationalOutcomeResponse
)
from app.auth.router import require_user, require_dept_user
from app.storage.s3_client import storage_client
from app.utils.helpers import (
    secure_filename,
    get_s3_key_from_url,
    get_active_issp_period,
    align_and_validate_years,
    check_and_update_glacier_metadata,
    validate_pdf_content,
    get_dict_from_payload,
    classify_uacs_and_expenditure,
    log_audit_event
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/dept", tags=["Department Subsystem"])


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
    exclude_proposal_id: Optional[uuid.UUID] = None
):
    """
    Calculates active departmental sub-ceiling headroom using precise Decimal arithmetic.
    Blocks submissions that would cause total expenditures to exceed the ceiling.
    """
    is_sqlite = "sqlite" in settings.DATABASE_URL.lower()

    dept_query = db.query(Department).filter(Department.id == dept_id)
    if not is_sqlite:
        dept_query = dept_query.with_for_update()
    dept = dept_query.first()
    if not dept:
        raise HTTPException(status_code=400, detail="Department record not found.")

    ceiling_query = db.query(BudgetCeiling).filter(
        BudgetCeiling.department_id == dept_id,
        BudgetCeiling.issp_period == issp_period
    )
    if not is_sqlite:
        ceiling_query = ceiling_query.with_for_update()
    ceiling = ceiling_query.first()
    
    if not ceiling:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Submission blocked: No budget sub-ceiling allocated for planning cycle '{issp_period}'."
        )

    query = db.query(func.sum(Proposal.total_cost)).filter(
        Proposal.department_id == dept_id,
        Proposal.issp_period == issp_period,
        Proposal.status.in_([ProposalStatus.SUBMITTED, ProposalStatus.APPROVED])
    )
    if exclude_proposal_id:
        query = query.filter(Proposal.id != exclude_proposal_id)
        
    current_spent = query.scalar() or Decimal("0.00")
    projected_total = current_spent + incoming_cost
    
    if projected_total > ceiling.sub_ceiling:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Budget Ceiling Breach: Submitting this proposal would cause total department expenditures "
                f"(₱{projected_total:,.2f}) to exceed your allocated sub-ceiling of ₱{ceiling.sub_ceiling:,.2f}."
            )
        )


def validate_proposal_constraints(
    db: Session, 
    dept_id: int, 
    payload: ProposalCreatePayload, 
    is_submitting: bool = False
):
    """
    Enforces DBM Smart Specs, DICT v.2026 capitalization rules (₱50,000 threshold),
    ₱2M budget lifecycle requirements, and Annex 1 hardware obsolescence justifications.
    """
    target_item_name = payload.item_name
    
    if payload.yearly_quantities and isinstance(payload.yearly_quantities, dict):
        total_requested = sum(
            int(v) for v in payload.yearly_quantities.values() 
            if v is not None and (isinstance(v, int) or str(v).isdigit())
        )
    else:
        total_requested = (payload.year_1_qty or 0) + (payload.year_2_qty or 0) + (payload.year_3_qty or 0)
        
    total_outlay = payload.unit_cost * Decimal(total_requested)

    # Validate against reference catalog if an item key is picked
    if payload.item_select != "other":
        catalog_item = db.query(CatalogItem).filter(
            CatalogItem.item_key == payload.item_select,
            CatalogItem.is_active == True
        ).first()
        if not catalog_item:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Item '{payload.item_select}' is not authorized or is inactive in the reference catalog."
            )
        target_item_name = catalog_item.display_name

    # Rule 2: Outlays exceeding ₱2,000,000.00 require a valid system lifecycle designation
    dev_status_val = getattr(payload.system_development_status, "value", str(payload.system_development_status or "")).strip()
    if total_outlay >= Decimal("2000000.00") and dev_status_val in [SystemDevelopmentStatus.NOT_APPLICABLE.value, "N/A", ""]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Proposals with an outlay exceeding ₱2,000,000.00 require a System Development Status ('For Development' or 'For Enhancement')."
        )

    if is_submitting:
        if total_requested <= 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Submission Error: The total requested quantity across all planning years must be greater than zero."
            )
        
        # Rule 1 & Rule 7: External items require a valid non-expired canvas; student-developed systems bypass mandatory canvas
        if not payload.created_by_students:
            if not payload.canvas_evidence_url:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Submission Error: A verified market quotation canvas is mandatory before submission."
                )
            if is_datetime_expired(payload.canvas_expiration_date):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Submission Locked: The linked canvas quotation has expired. Please upload an updated quotation before submitting."
                )
        else:
            # Student-developed system: Canvas is optional.
            # If uploaded and expired, block only if unit_cost > 0:
            if payload.unit_cost > Decimal("0.00") and payload.canvas_evidence_url and payload.canvas_expiration_date:
                if is_datetime_expired(payload.canvas_expiration_date):
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="Submission Notice: An expired quotation is linked to this student proposal with budgeted costs. Please update or detach the expired canvas before submitting."
                    )

        # Annex 1 Obsolescence Linkage: Replacing equipment requires documented EOL/Condemned units in department inventory
        strat_cat_val = getattr(payload.strategic_category, "value", str(payload.strategic_category))
        if not payload.is_expansion and not payload.created_by_students and strat_cat_val in [ProjectCategory.OFFICE_PRODUCTIVITY.value, "Office Productivity"]:
            unserviceable_filter = or_(
                ExistingInventory.is_end_of_life == True,
                ExistingInventory.status.in_([AssetStatus.CONDEMNED, AssetStatus.NEEDS_REPAIR, "Condemned", "Needs Repair"])
            )

            # Match keywords to prevent strict string mismatch
            name_words = [w for w in target_item_name.lower().split() if len(w) > 2 and w not in ["and", "for", "the", "with", "office"]]
            word_filters = [ExistingInventory.item_name.ilike(f"%{w}%") for w in name_words] if name_words else [ExistingInventory.item_name.ilike(f"%{target_item_name}%")]

            unserviceable_count = db.query(func.sum(ExistingInventory.quantity)).filter(
                ExistingInventory.department_id == dept_id,
                ExistingInventory.is_software == False,
                unserviceable_filter,
                or_(*word_filters, ExistingInventory.exact_model.ilike(f"%{target_item_name}%"))
            ).scalar() or 0

            # Allow standard buffer of 2 units above retired stock
            if total_requested > (unserviceable_count + 2):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=(
                        f"Annex 1 Obsolescence Discrepancy: Requesting {total_requested} units for '{target_item_name}', "
                        f"but your department inventory records only {unserviceable_count} End of Life (EOL) or Condemned assets. "
                        f"Either adjust the requested quantity or flag this item as an 'Expansion Project'."
                    )
                )


# ==========================================================
# BUDGET HEADROOM MONITORING
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
        Proposal.status.in_([ProposalStatus.SUBMITTED, ProposalStatus.APPROVED]),
        or_(Proposal.is_archived == False, Proposal.is_archived.is_(None))
    ).scalar() or Decimal("0.00")

    spent_capex = db.query(func.sum(Proposal.total_cost)).filter(
        Proposal.department_id == dept_id,
        Proposal.issp_period == issp_period,
        Proposal.status.in_([ProposalStatus.SUBMITTED, ProposalStatus.APPROVED]),
        Proposal.expenditure_class == ExpenditureClass.CAPITAL_OUTLAY,
        or_(Proposal.is_archived == False, Proposal.is_archived.is_(None))
    ).scalar() or Decimal("0.00")

    spent_mooe = db.query(func.sum(Proposal.total_cost)).filter(
        Proposal.department_id == dept_id,
        Proposal.issp_period == issp_period,
        Proposal.status.in_([ProposalStatus.SUBMITTED, ProposalStatus.APPROVED]),
        Proposal.expenditure_class == ExpenditureClass.MOOE,
        or_(Proposal.is_archived == False, Proposal.is_archived.is_(None))
    ).scalar() or Decimal("0.00")
    
    drafted = db.query(func.sum(Proposal.total_cost)).filter(
        Proposal.department_id == dept_id,
        Proposal.issp_period == issp_period,
        Proposal.status == ProposalStatus.DRAFT,
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
                else "Dry-run failed: Submitting your draft package would violate allocated budget limits."
            )
        }
    }


# ==========================================================
# REFERENCE CATALOG & EXPIRATION ALERTS
# ==========================================================

@router.get("/catalog", response_model=List[CatalogItemResponse])
def get_dept_catalog(
    db: Session = Depends(get_db),
    user: dict = Depends(require_user)
):
    """Retrieves standard catalog references, automatically filtering out expired quotations."""
    all_items = db.query(CatalogItem).filter(CatalogItem.is_active == True).all()
    return [
        item for item in all_items 
        if not item.canvas_expiration_date or not is_datetime_expired(item.canvas_expiration_date)
    ]


@router.get("/catalog/expiring-alerts", response_model=Dict[str, Any])
def get_expiring_canvas_alerts(
    db: Session = Depends(get_db),
    user: dict = Depends(require_dept_user)
):
    """Identifies catalog and custom items whose quotation validity expires within 14 days."""
    now = datetime.now(timezone.utc)
    warning_boundary = now + timedelta(days=14)
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
        Proposal.status.in_([ProposalStatus.DRAFT, ProposalStatus.RETURNED]),
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
# MASTER OUTCOMES (BROADER SCOPE) & STRATEGIC PROJECTS
# ==========================================================

@router.get("/outcomes", response_model=List[OrganizationalOutcomeResponse])
def get_organizational_outcomes(
    db: Session = Depends(get_db),
    user: dict = Depends(require_user)
):
    """
    Returns Broader Scope categories (Part I.A.4 Organizational Outcomes)
    which must be populated at the top of every proposal.
    """
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
            "implementing_unit": proj.implementing_unit
        } for proj in projects
    ]


# ==========================================================
# ANNEX 1: DEPARTMENT BASELINE INVENTORY (READ-ONLY FOR DEPT)
# ==========================================================

@router.get("/inventory", response_model=List[SupplyInventoryResponse])
def get_existing_inventory(
    search: Optional[str] = Query(None, description="Search by item name, model, or specs"),
    is_software: Optional[bool] = Query(None),
    is_end_of_life: Optional[bool] = Query(None),
    status_filter: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, le=1000),
    db: Session = Depends(get_db),
    user: dict = Depends(require_dept_user)
):
    """
    Rule 9: Department users view ONLY their own department's inventory.
    (Full cross-department asset control is administered by the Supply Officer under /api/supply).
    """
    query = db.query(ExistingInventory).filter(
        ExistingInventory.department_id == user["department_id"]
    )

    if is_software is not None:
        query = query.filter(ExistingInventory.is_software == is_software)
    if is_end_of_life is not None:
        query = query.filter(ExistingInventory.is_end_of_life == is_end_of_life)
    if status_filter and status_filter.strip().lower() != "all":
        clean_status = status_filter.strip().lower()
        matched_status = next(
            (s for s in AssetStatus if s.value.lower() == clean_status or s.name.lower() == clean_status), 
            None
        )
        if matched_status:
            query = query.filter(ExistingInventory.status == matched_status)

    if search:
        q_str = f"%{search.strip()}%"
        query = query.filter(
            or_(
                ExistingInventory.item_name.ilike(q_str),
                ExistingInventory.exact_model.ilike(q_str),
                ExistingInventory.specs.ilike(q_str)
            )
        )

    return query.order_by(ExistingInventory.date_acquired.desc()).offset(skip).limit(limit).all()


# ==========================================================
# PART IV.A: DETAILED UNIFIED RESOURCE PROPOSALS
# ==========================================================

@router.get("/proposals", response_model=List[ProposalResponse])
def get_departmental_proposals(
    issp_period_filter: Optional[str] = Query(None, alias="issp_period"),
    status_filter: Optional[ProposalStatus] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, le=1000),
    db: Session = Depends(get_db),
    user: dict = Depends(require_dept_user)
):
    """
    Retrieves all unified proposal line items (Hardware, Software, Subscriptions).
    Expired canvas items remain visible with full details.
    """
    target_period = issp_period_filter or get_active_issp_period(db)
    query = db.query(Proposal).options(
        joinedload(Proposal.outcome),
        joinedload(Proposal.project_rel),
        joinedload(Proposal.needs_assessment)
    ).filter(
        Proposal.department_id == user["department_id"],
        Proposal.issp_period == target_period,
        or_(Proposal.is_archived == False, Proposal.is_archived.is_(None))
    )
    if status_filter:
        query = query.filter(Proposal.status == status_filter)

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
        joinedload(Proposal.needs_assessment)
    ).filter(
        Proposal.id == proposal_id,
        Proposal.department_id == user["department_id"],
        or_(Proposal.is_archived == False, Proposal.is_archived.is_(None))
    ).first()

    if not proposal:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Proposal not found.")

    if proposal.is_restoring:
        s3_class, active_restore = check_and_update_glacier_metadata(db, proposal, proposal.canvas_evidence_url)
        if s3_class != proposal.s3_storage_class or active_restore != proposal.is_restoring:
            proposal.s3_storage_class = s3_class
            proposal.is_restoring = active_restore
            try:
                db.commit()
                db.refresh(proposal)
            except Exception as e:
                db.rollback()
                logger.error(f"Failed to refresh Glacier status: {str(e)}")

    return proposal


@router.post("/proposals", response_model=ProposalResponse, status_code=status.HTTP_201_CREATED)
def create_merged_proposal(
    request: Request,
    payload: ProposalCreatePayload,
    db: Session = Depends(get_db),
    user: dict = Depends(require_dept_user)
):
    """
    Creates a unified resource proposal.
    - Rule 1: Student-developed systems bypass mandatory canvas requirement and are Capital Outlay.
              Optional canvas quotation or supporting deed is safely retained if provided.
    - Rule 3 & 4: CapEx / MOOE merged; auto-classified by ₱50k threshold.
    - Rule 5: Target deployment office automated to the logged-in department.
    - Rule 6: Outcome ID (Broader Scope) is populated at the top of the proposal.
    - Provenance: Optionally binds line item to department Needs Assessment (Section 8.0).
    - Dynamic N-Year Horizon: Synchronizes arbitrary year maps without fixed 3-year boundaries.
    - Audit Trail: Immutable COA audit event logged with client IP and state.
    """
    active_period = get_active_issp_period(db)
    dept = db.query(Department).filter(Department.id == user["department_id"]).first()
    automated_office = dept.name if dept else "Central Office"

    # Validate Organizational Outcome existence
    outcome = db.query(OrganizationalOutcome).filter(OrganizationalOutcome.id == payload.outcome_id).first()
    if not outcome:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Target Organizational Outcome ID {payload.outcome_id} does not exist."
        )

    # Validate linked Needs Assessment if provided
    if payload.needs_assessment_id:
        na = db.query(NeedsAssessment).filter(NeedsAssessment.id == payload.needs_assessment_id).first()
        if not na:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Needs Assessment with ID {payload.needs_assessment_id} not found."
            )

    issp_period, aligned_quantities = align_and_validate_years(db, payload.yearly_quantities, is_submitting=False)
    payload.yearly_quantities = aligned_quantities

    # Synchronize backward-compatible year quantity fields
    sorted_years = sorted([k for k in aligned_quantities.keys() if k.isdigit()])
    payload.year_1_qty = int(aligned_quantities.get(sorted_years[0], 0) or 0) if len(sorted_years) >= 1 else 0
    payload.year_2_qty = int(aligned_quantities.get(sorted_years[1], 0) or 0) if len(sorted_years) >= 2 else 0
    payload.year_3_qty = int(aligned_quantities.get(sorted_years[2], 0) or 0) if len(sorted_years) >= 3 else 0

    validate_proposal_constraints(db, user["department_id"], payload, is_submitting=False)

    resolved_item_name = payload.item_name
    resolved_canvas_url = payload.canvas_evidence_url
    resolved_canvas_expiry = payload.canvas_expiration_date
    resolved_supplier = None

    if payload.item_select != "other":
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
    else:
        resolved_supplier = "Custom Supplier"

    # Centralized Accounting Classification & UACS Object Code Resolution
    uacs_code, exp_class = classify_uacs_and_expenditure(
        item_name=resolved_item_name,
        unit_cost=payload.unit_cost,
        strategic_category=payload.strategic_category,
        category=payload.category,
        created_by_students=payload.created_by_students
    )

    db_proposal = Proposal(
        department_id=user["department_id"],
        issp_period=active_period,
        outcome_id=payload.outcome_id,
        project_id=payload.project_id,
        needs_assessment_id=payload.needs_assessment_id,
        category=payload.category,
        strategic_category=payload.strategic_category,
        office_location=payload.office_location,
        fund_source=payload.fund_source,
        uacs_object_code=uacs_code,
        expenditure_class=exp_class,
        status=ProposalStatus.DRAFT,
        item_key=payload.item_select,
        item_name=resolved_item_name,
        unit_cost=payload.unit_cost,
        year_1_qty=payload.year_1_qty,
        year_2_qty=payload.year_2_qty,
        year_3_qty=payload.year_3_qty,
        yearly_quantities=payload.yearly_quantities,
        justification=payload.justification,
        system_development_status=payload.system_development_status,
        created_by_students=payload.created_by_students,
        target_office_automated=automated_office,
        canvas_evidence_url=resolved_canvas_url,
        canvas_expiration_date=resolved_canvas_expiry,
        payload={"comments": [], "supplier_name": resolved_supplier},
        is_expansion=payload.is_expansion
    )

    db_proposal.sync_payload()
    db.add(db_proposal)

    # Record COA Immutable Audit Event
    client_ip = request.client.host if (request and hasattr(request, "client") and request.client) else "Unknown"
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
            "category": db_proposal.category.value if hasattr(db_proposal.category, "value") else str(db_proposal.category),
            "total_cost": str(db_proposal.total_cost),
            "total_qty": db_proposal.total_qty
        }
    )

    try:
        db.commit()
        db.refresh(db_proposal)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Database error: {str(e)}")
    
    return db_proposal


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
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Proposal not found.")

    canvas_url = proposal.canvas_evidence_url
    s3_storage_class, is_restoring = check_and_update_glacier_metadata(db, proposal, canvas_url)
    
    proposal.s3_storage_class = s3_storage_class
    proposal.is_restoring = is_restoring
    db.flush()

    if is_restoring or s3_storage_class in ["GLACIER", "DEEP_ARCHIVE"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Editing is locked while S3 Glacier restoration is active."
        )

    if proposal.status in [ProposalStatus.SUBMITTED, ProposalStatus.APPROVED]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Editing locked. This proposal is currently in {proposal.status.value} state."
        )

    # Validate Organizational Outcome existence
    outcome = db.query(OrganizationalOutcome).filter(OrganizationalOutcome.id == payload.outcome_id).first()
    if not outcome:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Target Organizational Outcome ID {payload.outcome_id} does not exist."
        )

    # Validate linked Needs Assessment if provided
    if payload.needs_assessment_id:
        na = db.query(NeedsAssessment).filter(NeedsAssessment.id == payload.needs_assessment_id).first()
        if not na:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Needs Assessment with ID {payload.needs_assessment_id} not found."
            )

    issp_period, aligned_quantities = align_and_validate_years(db, payload.yearly_quantities, is_submitting=False)
    payload.yearly_quantities = aligned_quantities

    sorted_years = sorted([k for k in aligned_quantities.keys() if k.isdigit()])
    payload.year_1_qty = int(aligned_quantities.get(sorted_years[0], 0) or 0) if len(sorted_years) >= 1 else 0
    payload.year_2_qty = int(aligned_quantities.get(sorted_years[1], 0) or 0) if len(sorted_years) >= 2 else 0
    payload.year_3_qty = int(aligned_quantities.get(sorted_years[2], 0) or 0) if len(sorted_years) >= 3 else 0

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
    resolved_supplier = (proposal.payload or {}).get("supplier_name") or "Custom Supplier"

    if payload.item_select != "other":
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

    # Centralized Accounting Classification & UACS Object Code Resolution
    uacs_code, exp_class = classify_uacs_and_expenditure(
        item_name=resolved_item_name,
        unit_cost=payload.unit_cost,
        strategic_category=payload.strategic_category,
        category=payload.category,
        created_by_students=payload.created_by_students
    )

    dept = db.query(Department).filter(Department.id == user["department_id"]).first()
    automated_office = dept.name if dept else "Central Office"

    proposal.outcome_id = payload.outcome_id
    proposal.project_id = payload.project_id
    proposal.needs_assessment_id = payload.needs_assessment_id
    proposal.category = payload.category
    proposal.strategic_category = payload.strategic_category
    proposal.office_location = payload.office_location
    proposal.fund_source = payload.fund_source
    proposal.uacs_object_code = uacs_code
    proposal.expenditure_class = exp_class
    proposal.item_key = payload.item_select
    proposal.item_name = resolved_item_name
    proposal.unit_cost = payload.unit_cost
    proposal.year_1_qty = payload.year_1_qty
    proposal.year_2_qty = payload.year_2_qty
    proposal.year_3_qty = payload.year_3_qty
    proposal.yearly_quantities = payload.yearly_quantities
    proposal.justification = payload.justification
    proposal.system_development_status = payload.system_development_status
    proposal.created_by_students = payload.created_by_students
    proposal.target_office_automated = automated_office
    proposal.canvas_evidence_url = resolved_canvas_url
    proposal.canvas_expiration_date = resolved_canvas_expiry
    proposal.is_expansion = payload.is_expansion

    old_payload = dict(proposal.payload) if proposal.payload else {}
    old_payload["supplier_name"] = resolved_supplier
    proposal.payload = old_payload
    proposal.version += 1
    proposal.sync_payload()

    new_state = {
        "item_name": proposal.item_name,
        "unit_cost": str(proposal.unit_cost),
        "yearly_quantities": payload.yearly_quantities,
        "justification": proposal.justification
    }

    # Centralized COA Audit Logging Hook
    client_ip = request.client.host if (request and hasattr(request, "client") and request.client) else "Unknown"
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
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Proposal not found.")

    if proposal.status not in [ProposalStatus.DRAFT, ProposalStatus.RETURNED]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Deletions are forbidden when status is {proposal.status.value}."
        )

    canvas_url = proposal.canvas_evidence_url
    is_shared = is_file_referenced_elsewhere(db, canvas_url, exclude_proposal_id=proposal_id)
    key = get_s3_key_from_url(canvas_url) if canvas_url and not is_shared else None

    # Centralized COA Audit Logging Hook
    client_ip = request.client.host if (request and hasattr(request, "client") and request.client) else "Unknown"
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
    proposal = db.query(Proposal).filter(
        Proposal.id == proposal_id,
        Proposal.department_id == user["department_id"],
        or_(Proposal.is_archived == False, Proposal.is_archived.is_(None))
    ).first()

    if not proposal:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Proposal not found.")

    if proposal.status not in [ProposalStatus.DRAFT, ProposalStatus.RETURNED]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot submit proposal. Current status is {proposal.status.value}."
        )

    # Rule 1 & Rule 7: Student-developed systems bypass mandatory canvas.
    if not proposal.created_by_students:
        if not proposal.canvas_evidence_url:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Submission locked: A verified quotation canvas PDF is required before submission."
            )
        if is_datetime_expired(proposal.canvas_expiration_date):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Submission locked: The linked canvas quotation has expired. Please upload an updated quotation proof."
            )
    else:
        if (proposal.unit_cost or Decimal("0.00")) > Decimal("0.00") and proposal.canvas_evidence_url and proposal.canvas_expiration_date:
            if is_datetime_expired(proposal.canvas_expiration_date):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Submission Notice: An expired quotation is linked to this student proposal with budgeted costs. Please update or detach the expired canvas before submitting."
                )

    issp_period, aligned_quantities = align_and_validate_years(db, proposal.yearly_quantities, is_submitting=True)
    proposal.yearly_quantities = aligned_quantities

    sorted_years = sorted([k for k in aligned_quantities.keys() if k.isdigit()])
    proposal.year_1_qty = int(aligned_quantities.get(sorted_years[0], 0) or 0) if len(sorted_years) >= 1 else 0
    proposal.year_2_qty = int(aligned_quantities.get(sorted_years[1], 0) or 0) if len(sorted_years) >= 2 else 0
    proposal.year_3_qty = int(aligned_quantities.get(sorted_years[2], 0) or 0) if len(sorted_years) >= 3 else 0

    # Block submission if unresolved action items remain
    comments = proposal.payload.get("comments", []) if proposal.payload else []
    if any(c.get("requires_department_action") and not c.get("is_resolved") for c in comments):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot submit proposal. There are unresolved action items pinned to this draft."
        )

    # Headroom check
    incoming_cost = proposal.total_cost
    check_budget_headroom(db, user["department_id"], proposal.issp_period, incoming_cost, exclude_proposal_id=proposal.id)

    payload_to_verify = ProposalCreatePayload(
        outcome_id=proposal.outcome_id,
        project_id=proposal.project_id,
        needs_assessment_id=proposal.needs_assessment_id,
        category=proposal.category,
        strategic_category=proposal.strategic_category,
        office_location=proposal.office_location,
        fund_source=proposal.fund_source,
        item_select=proposal.item_key or "other",
        item_name=proposal.item_name,
        unit_cost=proposal.unit_cost,
        year_1_qty=proposal.year_1_qty,
        year_2_qty=proposal.year_2_qty,
        year_3_qty=proposal.year_3_qty,
        yearly_quantities=proposal.yearly_quantities,
        justification=proposal.justification,
        system_development_status=proposal.system_development_status,
        created_by_students=proposal.created_by_students,
        canvas_evidence_url=proposal.canvas_evidence_url,
        canvas_expiration_date=proposal.canvas_expiration_date,
        is_expansion=proposal.is_expansion
    )
    validate_proposal_constraints(db, user["department_id"], payload_to_verify, is_submitting=True)

    old_status = proposal.status.value
    proposal.status = ProposalStatus.SUBMITTED
    proposal.version += 1

    # Centralized COA Audit Logging Hook
    client_ip = request.client.host if (request and hasattr(request, "client") and request.client) else "Unknown"
    log_audit_event(
        db=db,
        action="STATE_TRANSITION_SUBMITTED",
        module="PROPOSALS",
        user_id=user["id"],
        department_id=user["department_id"],
        proposal_id=proposal.id,
        ip_address=client_ip,
        old_value={"status": old_status},
        new_value={"status": ProposalStatus.SUBMITTED.value, "total_cost": str(proposal.total_cost)}
    )
    
    try:
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to submit proposal: {str(e)}"
        )
    return {"status": "success", "new_status": proposal.status.value}


# ==========================================================
# COMPATIBILITY ALIAS ENDPOINTS (MAPPED TO UNIFIED PROPOSALS)
# ==========================================================

@router.get("/subscriptions", response_model=List[ProposalResponse])
def get_departmental_subscriptions(
    issp_period_filter: Optional[str] = Query(None, alias="issp_period"),
    status_filter: Optional[ProposalStatus] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, le=1000),
    db: Session = Depends(get_db),
    user: dict = Depends(require_dept_user)
):
    target_period = issp_period_filter or get_active_issp_period(db)
    query = db.query(Proposal).options(
        joinedload(Proposal.outcome),
        joinedload(Proposal.project_rel),
        joinedload(Proposal.needs_assessment)
    ).filter(
        Proposal.department_id == user["department_id"],
        Proposal.issp_period == target_period,
        or_(
            Proposal.category.in_([ProposalCategory.SUBSCRIPTION, ProposalCategory.SOFTWARE]),
            Proposal.expenditure_class == ExpenditureClass.MOOE,
            Proposal.strategic_category == ProjectCategory.CONTINUING_COSTS
        ),
        or_(Proposal.is_archived == False, Proposal.is_archived.is_(None))
    )
    if status_filter:
        query = query.filter(Proposal.status == status_filter)

    return query.offset(skip).limit(limit).all()


@router.get("/subscriptions/{subscription_id}", response_model=ProposalResponse)
def get_subscription_detail(
    subscription_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: dict = Depends(require_dept_user)
):
    return get_proposal_detail(subscription_id, db, user)


@router.post("/subscriptions", response_model=ProposalResponse, status_code=status.HTTP_201_CREATED)
def create_subscription_alias(
    request: Request,
    payload: ProposalCreatePayload,
    db: Session = Depends(get_db),
    user: dict = Depends(require_dept_user)
):
    payload.category = ProposalCategory.SUBSCRIPTION
    return create_merged_proposal(request=request, payload=payload, db=db, user=user)


@router.put("/subscriptions/{subscription_id}", response_model=ProposalResponse)
def update_subscription_alias(
    request: Request,
    subscription_id: uuid.UUID,
    payload: ProposalCreatePayload,
    db: Session = Depends(get_db),
    user: dict = Depends(require_dept_user)
):
    payload.category = ProposalCategory.SUBSCRIPTION
    return update_merged_proposal(request=request, proposal_id=subscription_id, payload=payload, db=db, user=user)


@router.delete("/subscriptions/{subscription_id}")
def delete_subscription_alias(
    request: Request,
    subscription_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: dict = Depends(require_dept_user)
):
    return delete_proposal(request=request, proposal_id=subscription_id, db=db, user=user)


@router.put("/subscriptions/{subscription_id}/submit")
def submit_subscription_alias(
    request: Request,
    subscription_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: dict = Depends(require_dept_user)
):
    return submit_proposal(request=request, proposal_id=subscription_id, db=db, user=user)


@router.post("/subscriptions/{subscription_id}/restore")
def request_subscription_restore(
    request: Request,
    subscription_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: dict = Depends(require_dept_user)
):
    return request_glacier_restore(request=request, proposal_id=subscription_id, db=db, user=user)


@router.post("/subscriptions/{subscription_id}/sync-metadata")
def sync_subscription_metadata(
    subscription_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: dict = Depends(require_dept_user)
):
    proposal = db.query(Proposal).filter(
        Proposal.id == subscription_id,
        Proposal.department_id == user["department_id"]
    ).first()
    if not proposal:
        raise HTTPException(status_code=404, detail="Subscription record not found.")

    s3_class, is_restoring = check_and_update_glacier_metadata(db, proposal, proposal.canvas_evidence_url)
    proposal.s3_storage_class = s3_class
    proposal.is_restoring = is_restoring
    db.commit()
    return {
        "status": "success",
        "storage_class": s3_class,
        "is_restoring": is_restoring,
        "restore_progress": 100 if s3_class == "STANDARD" else (50 if is_restoring else 0)
    }


@router.post("/proposals/{proposal_id}/sync-metadata")
def sync_proposal_storage_metadata(
    proposal_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: dict = Depends(require_dept_user)
):
    proposal = db.query(Proposal).filter(
        Proposal.id == proposal_id,
        Proposal.department_id == user["department_id"]
    ).first()
    if not proposal:
        raise HTTPException(status_code=404, detail="Proposal record not found.")

    s3_class, is_restoring = check_and_update_glacier_metadata(db, proposal, proposal.canvas_evidence_url)
    proposal.s3_storage_class = s3_class
    proposal.is_restoring = is_restoring
    db.commit()
    return {
        "status": "success",
        "storage_class": s3_class,
        "is_restoring": is_restoring,
        "restore_progress": 100 if s3_class == "STANDARD" else (50 if is_restoring else 0)
    }


# ==========================================================
# FILE WORKSPACES & CANVAS UPLOADS
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
    Enables updating outdated/expired quotation proofs cleanly.
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
        raise HTTPException(status_code=404, detail="Proposal not found.")

    if user["role"] != "ROLE_MIS_ADMIN" and proposal.department_id != user["department_id"]:
        raise HTTPException(status_code=403, detail="Permission denied.")

    if proposal.status not in [ProposalStatus.DRAFT, ProposalStatus.RETURNED]:
        raise HTTPException(status_code=403, detail="Upload locked: Proposal is under review.")

    file_bytes = await file.read()
    if not validate_pdf_content(file_bytes):
        raise HTTPException(status_code=400, detail="Invalid format. Only genuine PDF files are permitted.")
    await file.seek(0)

    safe_supplier = secure_filename(supplier_name) if supplier_name else "default_supplier"
    safe_filename = secure_filename(file.filename)
    key = storage_client.get_canvas_key(str(proposal_uuid), safe_supplier, safe_filename)
    
    success = storage_client.upload_canvas_evidence(file_bytes, key)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to write canvas file to storage.")

    download_url = storage_client.generate_download_url(key)
    proposal.canvas_evidence_url = download_url
    
    if canvas_expiration_date:
        try:
            proposal.canvas_expiration_date = datetime.fromisoformat(canvas_expiration_date.replace("Z", "+00:00"))
        except Exception:
            pass

    current_payload = get_dict_from_payload(proposal.payload)
    current_payload["supplier_name"] = supplier_name
    proposal.payload = current_payload
    proposal.sync_payload()

    # Centralized COA Audit Logging Hook
    client_ip = request.client.host if (request and hasattr(request, "client") and request.client) else "Unknown"
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
        raise HTTPException(status_code=404, detail="Inventory asset not found.")

    if asset.status == AssetStatus.FUNCTIONAL:
        raise HTTPException(status_code=400, detail="Functional items do not require an unserviceable report.")

    file_bytes = await file.read()
    if not validate_pdf_content(file_bytes):
        raise HTTPException(status_code=400, detail="Invalid format. Only PDF files are permitted.")
    await file.seek(0)

    safe_filename = secure_filename(file.filename)
    file_url = storage_client.upload_unserviceable_report(
        file_data=file_bytes,
        department_id=str(user["department_id"]),
        filename=safe_filename
    )

    if not file_url:
        raise HTTPException(status_code=500, detail="Failed to write report to storage.")

    asset.unserviceable_report_url = file_url

    # Centralized COA Audit Logging Hook
    client_ip = request.client.host if (request and hasattr(request, "client") and request.client) else "Unknown"
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
# NOTIFICATIONS & REVISION REMARKS (ROLE-SCOPED INBOX)
# ==========================================================

@router.get("/notifications", response_model=List[Dict[str, Any]])
def get_department_notifications(
    category: Optional[str] = Query(None),
    days: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    user: dict = Depends(require_dept_user)
):
    """
    Role-Scoped Department & Supply Inbox:
    Department planners are never exposed to global COA logs or cross-department activities.
    Their views are scoped strictly to actions relevant to their domain (e.g. proposal returns,
    inline comments, budget ceiling notifications, and inventory approvals).
    """
    dept_id = user["department_id"]
    notifications = []

    proposals_query = db.query(Proposal).filter(Proposal.department_id == dept_id)
    proposals_list = proposals_query.all()
    proposal_map = {p.id: p.item_name for p in proposals_list}
    proposal_ids = [str(pid) for pid in proposal_map.keys()]
    proposal_uuids = list(proposal_map.keys())

    audit_query = db.query(AuditTrail).options(joinedload(AuditTrail.user))

    # Strict Role Scoping: Only fetch logs explicitly belonging to this department or its proposals
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
        operator_role = log.user.role_tag.value if log.user else "SYSTEM"

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
                title = "Compliance Override Applied"
                description = f"MIS Admin applied a parameter override to '{target_name}'."
                type_ = "override"
            elif log.action == "PROPOSAL_CREATED":
                title = "Proposal Drafted"
                description = f"New proposal line item '{target_name}' created in workspace."
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
        payload_dict = get_dict_from_payload(p.payload)
        for c in payload_dict.get("comments", []):
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
        payload_dict = get_dict_from_payload(p.payload)
        for c in payload_dict.get("comments", []):
            if isinstance(c, dict) and c.get("requires_department_action") and not c.get("is_resolved"):
                unread_actions += 1

    returned_proposals = db.query(Proposal).filter(
        Proposal.department_id == dept_id,
        Proposal.issp_period == active_period,
        Proposal.status == ProposalStatus.RETURNED,
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
        raise HTTPException(status_code=404, detail="Proposal not found.")

    if user["role"] != "ROLE_MIS_ADMIN" and target.department_id != user["department_id"]:
        raise HTTPException(status_code=403, detail="Permission denied.")

    current_payload = get_dict_from_payload(target.payload)
    if "comments" not in current_payload:
        current_payload["comments"] = []

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

    current_payload["comments"].append(new_comment)
    target.payload = current_payload

    # Centralized COA Audit Logging Hook
    client_ip = request.client.host if (request and hasattr(request, "client") and request.client) else "Unknown"
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
        raise HTTPException(status_code=404, detail="Proposal not found.")

    if user["role"] != "ROLE_MIS_ADMIN" and target.department_id != user["department_id"]:
        raise HTTPException(status_code=403, detail="Permission denied.")

    return get_dict_from_payload(target.payload).get("comments", [])


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
        raise HTTPException(status_code=404, detail="Proposal not found.")

    current_payload = get_dict_from_payload(target.payload)
    comments = current_payload.get("comments", [])
    
    comment_found = False
    for comment in comments:
        if comment.get("id") == comment_id:
            comment["is_resolved"] = True
            comment_found = True
            break

    if not comment_found:
        raise HTTPException(status_code=404, detail="Comment not found.")

    target.payload = current_payload

    # Centralized COA Audit Logging Hook
    client_ip = request.client.host if (request and hasattr(request, "client") and request.client) else "Unknown"
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
# NEEDS ASSESSMENT (SECTION 8.0)
# ==========================================================

@router.post("/needs-assessment", response_model=NeedsAssessmentResponse, status_code=status.HTTP_201_CREATED)
def create_needs_assessment(
    request: Request,
    payload: NeedsAssessmentCreate,
    db: Session = Depends(get_db),
    user: dict = Depends(require_dept_user)
):
    dept = db.query(Department).filter(Department.id == user["department_id"]).first()
    dept_name = dept.name if dept else None

    new_assessment = NeedsAssessment(
        department_id=user["department_id"],
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

    client_ip = request.client.host if (request and hasattr(request, "client") and request.client) else "Unknown"
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
    dept = db.query(Department).filter(Department.id == user["department_id"]).first()
    dept_name = dept.name if dept else None
    
    items = db.query(NeedsAssessment).filter(
        NeedsAssessment.department_id == user["department_id"],
        NeedsAssessment.is_archived == False
    ).order_by(NeedsAssessment.created_at.desc() if hasattr(NeedsAssessment, "created_at") else NeedsAssessment.id.desc()).all()

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
    """
    Updates an existing Section 8.0 Department Needs Assessment record.
    Preserves audit trails and propagates modifications to linked Strategic Concerns if applicable.
    """
    assessment = db.query(NeedsAssessment).filter(
        NeedsAssessment.id == assessment_id,
        NeedsAssessment.department_id == user["department_id"],
        NeedsAssessment.is_archived == False
    ).first()

    if not assessment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, 
            detail="Needs Assessment record not found or belongs to another department."
        )

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

    # If linked to a Strategic Concern, keep the concern in sync
    if assessment.strategic_concern_id and assessment.strategic_concern:
        assessment.strategic_concern.problems = f"[{user.get('department_name', 'Department')}]: {assessment.current_problem}"
        assessment.strategic_concern.intended_use = assessment.proposed_solution

    client_ip = request.client.host if (request and hasattr(request, "client") and request.client) else "Unknown"
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

    dept = db.query(Department).filter(Department.id == user["department_id"]).first()
    resp = NeedsAssessmentResponse.model_validate(assessment)
    resp.department_name = dept.name if dept else None
    return resp


@router.delete("/needs-assessment/{assessment_id}")
def delete_needs_assessment(
    request: Request,
    assessment_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: dict = Depends(require_dept_user)
):
    """
    Deletes an unaggregated Needs Assessment.
    If already aggregated into Part II.A Strategic Concerns, deletion is rejected
    to protect downstream singularity graph integrity.
    """
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
            detail="Cannot delete a Needs Assessment that has already been aggregated into Part II.A Strategic Concerns by the MIS Administrator."
        )

    client_ip = request.client.host if (request and hasattr(request, "client") and request.client) else "Unknown"
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
# GLACIER RETRIEVAL COLD RECOVERY
# ==========================================================

@router.post("/proposals/{proposal_id}/restore")
def request_glacier_restore(
    request: Request,
    proposal_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: dict = Depends(require_dept_user)
):
    if getattr(settings, "STORAGE_TYPE", "local").lower() != "s3":
        raise HTTPException(status_code=400, detail="Glacier restoration requires S3 storage mode.")

    proposal = db.query(Proposal).filter(
        Proposal.id == proposal_id,
        Proposal.department_id == user["department_id"],
        or_(Proposal.is_archived == False, Proposal.is_archived.is_(None))
    ).first()

    if not proposal:
        raise HTTPException(status_code=404, detail="Proposal not found.")

    canvas_url = proposal.canvas_evidence_url
    if not canvas_url:
        raise HTTPException(status_code=400, detail="Proposal has no linked canvas quotation.")

    key = get_s3_key_from_url(canvas_url)
    if not key:
        raise HTTPException(status_code=400, detail="Failed to resolve storage key.")

    try:
        success = storage_client.restore_object(key, days=7)
        if not success:
            raise HTTPException(status_code=500, detail="S3 restore request failed.")

        proposal.is_restoring = True

        # Centralized COA Audit Logging Hook
        client_ip = request.client.host if (request and hasattr(request, "client") and request.client) else "Unknown"
        log_audit_event(
            db=db,
            action="GLACIER_RESTORE_REQUESTED",
            module="PROPOSALS",
            user_id=user["id"],
            department_id=user["department_id"],
            proposal_id=proposal.id,
            ip_address=client_ip,
            new_value={"key": key, "days": 7}
        )

        db.commit()
        return {"status": "restoring", "message": "Glacier cold retrieval job initiated."}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Glacier restore failed: {str(e)}")