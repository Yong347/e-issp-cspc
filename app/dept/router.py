# app/dept/router.py
import os
import uuid
import logging
from decimal import Decimal
from datetime import datetime
from typing import Any, List, Optional
from urllib.parse import urlparse
from fastapi import APIRouter, Depends, HTTPException, status, Query, UploadFile, File, Form
from sqlalchemy.orm import Session
from sqlalchemy import func
from botocore.exceptions import ClientError

from app.config import settings
from app.database.session import get_db
from app.database.models import (
    Proposal,
    ExistingInventory,
    AssetStatus,
    ProposalStatus,
    AuditTrail,
    Department,
    CatalogItem,
    SubscriptionProposal,
    NeedsAssessment,
    MasterNarrative,
    BudgetCeiling,
    ProposalDeployment,  # Gap 13 Database Model
    CoreOfficeFunction  # Added to resolve offices-list 404
)
from app.schemas import (
    InventoryCreate, 
    InventoryResponse, 
    ProposalUpdatePayload, 
    CommentCreate,
    CatalogItemResponse,
    NeedsAssessmentCreate, 
    NeedsAssessmentResponse,
    SubscriptionProposalCreate, 
    SubscriptionProposalResponse,
    DeploymentCreate,   # Gap 13 Pydantic Request Schema
    DeploymentResponse,
    CoreOfficeFunctionResponse  # <--- Add this import
)
from app.auth.router import require_user, require_dept_user
from app.storage.s3_client import storage_client

# Import consolidated helper functions
from app.utils.helpers import (
    secure_filename,
    get_s3_key_from_url,
    get_active_issp_period,
    validate_active_years_alignment,
    align_and_validate_years,
    check_and_update_glacier_metadata,
    validate_pdf_content,  # Fix (Anomaly 14)
)

logger = logging.getLogger(__name__)

# Declare the unified router prefix and tags for the Department subsystem
router = APIRouter(prefix="/api/dept", tags=["Department Subsystem"])


def is_file_referenced_elsewhere(
    db: Session, 
    canvas_url: str, 
    exclude_proposal_id: Optional[uuid.UUID] = None, 
    exclude_subscription_id: Optional[uuid.UUID] = None
) -> bool:
    """
    Verifies if a given canvas evidence file URL is referenced by any other proposal,
    software subscription, or active catalog item to protect shared media from deletions.
    """
    if not canvas_url:
        return False

    p_query = db.query(Proposal).filter(Proposal.canvas_evidence_url == canvas_url)
    if exclude_proposal_id:
        p_query = p_query.filter(Proposal.id != exclude_proposal_id)
    if p_query.first() is not None:
        return True

    s_query = db.query(SubscriptionProposal).filter(SubscriptionProposal.canvas_evidence_url == canvas_url)
    if exclude_subscription_id:
        s_query = s_query.filter(SubscriptionProposal.id != exclude_subscription_id)
    if s_query.first() is not None:
        return True

    c_query = db.query(CatalogItem).filter(CatalogItem.canvas_evidence_url == canvas_url)
    if c_query.first() is not None:
        return True

    return False


def check_budget_headroom(db: Session, dept_id: int, issp_period: str, is_capex: bool, incoming_cost: float):
    """
    Fix (Anomaly 3): Calculates active budget sub-ceiling and total current spent balances (SUBMITTED + APPROVED)
    using precise quantized Decimals to prevent floating-point rounding errors.
    """
    is_sqlite = db.bind.dialect.name == "sqlite"

    # Serialize transactions conditionally based on dialect to prevent SQLite lock errors
    dept_query = db.query(Department).filter(Department.id == dept_id)
    if not is_sqlite:
        dept_query = dept_query.with_for_update()
    dept_query.first()

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
            detail=f"Submission blocked: No budget ceiling allocated for the '{issp_period}' planning cycle."
        )

    incoming_cost_dec = Decimal(str(incoming_cost)).quantize(Decimal("1.00"))

    if is_capex:
        spent = db.query(func.sum(Proposal.unit_cost * Proposal.total_qty)).filter(
            Proposal.department_id == dept_id,
            Proposal.issp_period == issp_period,
            Proposal.status.in_([ProposalStatus.SUBMITTED, ProposalStatus.APPROVED]),
            Proposal.is_archived == False
        ).scalar() or Decimal("0.00")
        
        spent_dec = Decimal(str(spent)).quantize(Decimal("1.00"))
        limit = ceiling.allocated_capex
        limit_dec = limit.quantize(Decimal("1.00")) if limit is not None else Decimal("0.00")
        if limit is not None and (spent_dec + incoming_cost_dec) > limit_dec:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Submission blocked: Budget ceiling exceeded. CapEx allocation limit is {limit_dec:,.2f}, "
                       f"already spent: {spent_dec:,.2f}, incoming proposal cost: {incoming_cost_dec:,.2f}."
            )
    else:
        spent = db.query(func.sum(SubscriptionProposal.total_multiyear_mooe)).filter(
            SubscriptionProposal.department_id == dept_id,
            SubscriptionProposal.issp_period == issp_period,
            SubscriptionProposal.status.in_([SubscriptionProposal.status.SUBMITTED, SubscriptionProposal.status.APPROVED]),
            SubscriptionProposal.is_archived == False
        ).scalar() or Decimal("0.00")
        
        spent_dec = Decimal(str(spent)).quantize(Decimal("1.00"))
        limit = ceiling.allocated_mooe
        limit_dec = limit.quantize(Decimal("1.00")) if limit is not None else Decimal("0.00")
        if limit is not None and (spent_dec + incoming_cost_dec) > limit_dec:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Submission blocked: Budget ceiling exceeded. MOOE allocation limit is {limit_dec:,.2f}, "
                       f"already spent: {spent_dec:,.2f}, incoming subscription cost: {incoming_cost_dec:,.2f}."
            )


def validate_proposal_constraints(db: Session, dept_id: int, payload: ProposalUpdatePayload, is_submitting: bool = False):
    """
    Enforces Smart Spec, Escape Hatch, and Quantity Justification policies on the backend.
    Checks are deferred for drafts, running strictly on transition submission flows.
    """
    dept = db.query(Department).filter(Department.id == dept_id).first()
    if not dept:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, 
            detail="Associated department not found."
        )

    target_item_name = payload.item_select
    if payload.item_select != "other":
        catalog_item = db.query(CatalogItem).filter(
            CatalogItem.item_key == payload.item_select,
            CatalogItem.is_active == True
        ).first()
        if not catalog_item:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Item '{payload.item_select}' is not authorized or is inactive in the standard catalog."
            )
        target_item_name = catalog_item.display_name

        if catalog_item.allowed_offices:
            if dept.name not in catalog_item.allowed_offices:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Item '{catalog_item.display_name}' is not permitted for the {dept.name} department."
                )

    if payload.item_select == "other":
        if is_submitting:
            prohibited_keywords = ["gaming", "playstation", "xbox", "nintendo", "unauthorized", "prohibited", "personal"]
            spec_lower = payload.custom_specification.lower() if payload.custom_specification else ""
            if any(keyword in spec_lower for keyword in prohibited_keywords):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Custom specifications contain restricted keywords. Non-standard hardware requests must be business-aligned."
                )
                
            if not payload.canvas_evidence_url:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Canvas Evidence upload is mandatory for unlisted custom items."
                )

    if is_submitting:
        total_requested = sum(payload.yearly_quantities.values())
        if total_requested <= 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="The total quantity requested across all planning years must be strictly greater than 0 on submission."
            )
        
        # Use the explicit payload.is_expansion boolean flag to restrict validation patterns
        if not payload.is_expansion:
            unserviceable_count = db.query(func.sum(ExistingInventory.quantity)).filter(
                ExistingInventory.department_id == dept_id,
                func.lower(ExistingInventory.item_name) == func.lower(target_item_name),
                ExistingInventory.status.in_([AssetStatus.CONDEMNED, AssetStatus.NEEDS_REPAIR])
            ).scalar() or 0

            if total_requested > (unserviceable_count + 2):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Requested quantity ({total_requested}) exceeds justified replacement thresholds of unserviceable units ({unserviceable_count}) for '{target_item_name}'. "
                           f"For new layouts, check the 'Is Expansion Project' option and specify your target room."
                )


def validate_subscription_constraints(db: Session, dept_id: int, payload: SubscriptionProposalCreate, is_submitting: bool = False):
    """
    Enforces justification limits and canvas attachment validation routines specifically tailored
    to software licensing and operations (MOOE) structures.
    """
    if is_submitting:
        if not payload.justification or len(payload.justification.strip()) < 10:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Subscription justification text must be detailed and at least 10 characters long."
            )
        if not payload.canvas_evidence_url:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Submission locked: Canvas evidence verification upload is mandatory for active software subscriptions."
            )
        
        total_users = sum(payload.yearly_users.values())
        if total_users <= 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="The total active licenses/users requested across all planning years must be strictly greater than 0 on submission."
            )


# ==========================================================
# EXPLICIT METADATA SYNCHRONIZATION ENDPOINTS
# ==========================================================

@router.post("/proposals/{proposal_id}/sync-metadata")
def sync_proposal_storage_metadata(
    proposal_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: dict = Depends(require_dept_user)
):
    """ Explicit endpoint to verify and synchronize S3 Glacier restoration status with real-time progress calculations. """
    proposal = db.query(Proposal).filter(
        Proposal.id == proposal_id,
        Proposal.department_id == user["department_id"]
    ).first()

    if not proposal:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Proposal record not found.")

    key = get_s3_key_from_url(proposal.canvas_evidence_url)
    metadata = {"storage_class": "STANDARD", "is_restoring": False, "restore_progress": 100}
    if key:
        metadata = storage_client.check_glacier_metadata(key)

    proposal.s3_storage_class = metadata["storage_class"]
    proposal.is_restoring = metadata["is_restoring"]
    
    try:
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to persist updated storage metadata: {str(e)}"
        )

    return {
        "status": "synchronized",
        "storage_class": proposal.s3_storage_class,
        "is_restoring": proposal.is_restoring,
        "restore_progress": metadata["restore_progress"]
    }


@router.post("/subscriptions/{subscription_id}/sync-metadata")
def sync_subscription_storage_metadata(
    subscription_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: dict = Depends(require_dept_user)
):
    """ Explicit endpoint to verify and synchronize Glacier restoration status for MOOE subscriptions with progress metrics. """
    sub = db.query(SubscriptionProposal).filter(
        SubscriptionProposal.id == subscription_id,
        SubscriptionProposal.department_id == user["department_id"]
    ).first()

    if not sub:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Subscription record not found.")

    key = get_s3_key_from_url(sub.canvas_evidence_url)
    metadata = {"storage_class": "STANDARD", "is_restoring": False, "restore_progress": 100}
    if key:
        metadata = storage_client.check_glacier_metadata(key)

    sub.s3_storage_class = metadata["storage_class"]
    sub.is_restoring = metadata["is_restoring"]
    
    try:
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to persist updated storage metadata: {str(e)}"
        )

    return {
        "status": "synchronized",
        "storage_class": sub.s3_storage_class,
        "is_restoring": sub.is_restoring,
        "restore_progress": metadata["restore_progress"]
    }


# ==========================================================
# BUDGET HEADROOM AND REAL-TIME MONITORING
# ==========================================================

@router.get("/budget-summary")
def get_department_budget_summary(
    db: Session = Depends(get_db), 
    user: dict = Depends(require_dept_user)
):
    """ Provides a consolidated summary of spent vs. allocated ceilings with a dry-run check. """
    dept_id = user["department_id"]
    issp_period = get_active_issp_period(db)
    
    ceiling = db.query(BudgetCeiling).filter(
        BudgetCeiling.department_id == dept_id,
        BudgetCeiling.issp_period == issp_period
    ).first()
    
    allocated_capex = ceiling.allocated_capex if ceiling else Decimal("0.00")
    allocated_mooe = ceiling.allocated_mooe if ceiling else Decimal("0.00")
    sub_ceiling = ceiling.sub_ceiling if ceiling else Decimal("0.00")
        
    capex_spent = db.query(func.sum(Proposal.unit_cost * Proposal.total_qty)).filter(
        Proposal.department_id == dept_id,
        Proposal.issp_period == issp_period,
        Proposal.status.in_([ProposalStatus.SUBMITTED, ProposalStatus.APPROVED]),
        Proposal.is_archived == False
    ).scalar() or Decimal("0.00")
    
    mooe_spent = db.query(func.sum(SubscriptionProposal.total_multiyear_mooe)).filter(
        SubscriptionProposal.department_id == dept_id,
        SubscriptionProposal.issp_period == issp_period,
        SubscriptionProposal.status.in_([ProposalStatus.SUBMITTED, ProposalStatus.APPROVED]),
        SubscriptionProposal.is_archived == False
    ).scalar() or Decimal("0.00")
    
    capex_drafted = db.query(func.sum(Proposal.unit_cost * Proposal.total_qty)).filter(
        Proposal.department_id == dept_id,
        Proposal.issp_period == issp_period,
        Proposal.status == ProposalStatus.DRAFT,
        Proposal.is_archived == False
    ).scalar() or Decimal("0.00")
    
    mooe_drafted = db.query(func.sum(SubscriptionProposal.total_multiyear_mooe)).filter(
        SubscriptionProposal.department_id == dept_id,
        SubscriptionProposal.issp_period == issp_period,
        SubscriptionProposal.status == ProposalStatus.DRAFT,
        SubscriptionProposal.is_archived == False
    ).scalar() or Decimal("0.00")

    total_spent = capex_spent + mooe_spent
    total_drafted = capex_drafted + mooe_drafted
    projected_total = total_spent + total_drafted
    
    capex_exceeded = (capex_spent + capex_drafted) > allocated_capex if allocated_capex > 0 else False
    mooe_exceeded = (mooe_spent + mooe_drafted) > allocated_mooe if allocated_mooe > 0 else False
    sub_ceiling_exceeded = projected_total > sub_ceiling if sub_ceiling > 0 else False
    
    dry_run_passed = not (capex_exceeded or mooe_exceeded or sub_ceiling_exceeded)
    
    return {
        "issp_period": issp_period,
        "allocated_capex": float(allocated_capex),
        "allocated_mooe": float(allocated_mooe),
        "sub_ceiling": float(sub_ceiling),
        "current_spent_capex": float(capex_spent),
        "current_spent_mooe": float(mooe_spent),
        "total_spent": float(total_spent),
        "remaining_headroom": float(sub_ceiling - total_spent),
        "draft_dry_run": {
            "drafted_capex": float(capex_drafted),
            "drafted_mooe": float(mooe_drafted),
            "total_drafted": float(total_drafted),
            "projected_total_spent": float(projected_total),
            "capex_limit_exceeded": capex_exceeded,
            "mooe_limit_exceeded": mooe_exceeded,
            "sub_ceiling_exceeded": sub_ceiling_exceeded,
            "dry_run_validation_passed": dry_run_passed,
            "message": (
                "Dry-run passed: Your entire draft package fits within remaining headroom limits."
                if dry_run_passed 
                else "Dry-run failed: Submitting your draft package would violate allocated budget boundaries."
            )
        }
    }


# ==========================================================
# DIAGNOSTICS & BASE CATALOG MANAGEMENT
# ==========================================================

@router.get("/catalog", response_model=List[CatalogItemResponse])
def get_dept_catalog(
    db: Session = Depends(get_db),
    user: dict = Depends(require_user)
):
    """ Retrieves standard catalog items directly from the catalog_items table. """
    return db.query(CatalogItem).filter(CatalogItem.is_active == True).all()


@router.get("/offices-list", response_model=List[CoreOfficeFunctionResponse])
def get_offices_list(
    db: Session = Depends(get_db),
    user: dict = Depends(require_user)
):
    """
    Retrieves the list of SUC core offices mapped 
    to the active ISSP planning period.
    """
    issp_period = get_active_issp_period(db)
    return (
        db.query(CoreOfficeFunction)
        .filter(CoreOfficeFunction.issp_period == issp_period)
        .all()
    )


@router.post("/inventory", response_model=InventoryResponse, status_code=status.HTTP_201_CREATED)
def log_existing_inventory(
    payload: InventoryCreate,
    db: Session = Depends(get_db),
    user: dict = Depends(require_dept_user)
):
    """ Logs an existing physical asset (Annex A-5) to justify subsequent proposals. """
    new_asset = ExistingInventory(
        department_id=user["department_id"],
        item_name=payload.item_name,
        quantity=payload.quantity,
        status=payload.status,
        unserviceable_report_url=payload.unserviceable_report_url
    )
    db.add(new_asset)
    try:
        db.commit()
        db.refresh(new_asset)
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database transaction failure during inventory generation: {str(e)}"
        )
    return new_asset


@router.get("/inventory", response_model=List[InventoryResponse])
def get_existing_inventory(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, le=1000),
    db: Session = Depends(get_db),
    user: dict = Depends(require_dept_user)
):
    """ Retrieves the calling department's logged physical inventory. """
    return db.query(ExistingInventory).filter(
        ExistingInventory.department_id == user["department_id"]
    ).offset(skip).limit(limit).all()


@router.get("/proposals")
def get_departmental_proposals(
    issp_period_filter: Optional[str] = Query(None, alias="issp_period"),
    status_filter: Optional[ProposalStatus] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, le=1000),
    db: Session = Depends(get_db),
    user: dict = Depends(require_dept_user)
):
    """ Retrieves active proposals submitted by the calling department within the active or selected cycle. """
    target_period = issp_period_filter or get_active_issp_period(db)

    query = db.query(Proposal).filter(
        Proposal.department_id == user["department_id"],
        Proposal.issp_period == target_period,
        Proposal.is_archived == False
    )
    if status_filter:
        query = query.filter(Proposal.status == status_filter)
    return query.offset(skip).limit(limit).all()


@router.get("/proposals/{proposal_id}")
def get_proposal_detail(
    proposal_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: dict = Depends(require_dept_user)
):
    """
    Retrieves detailed information of a specific proposal.
    Provides safe and idempotent metadata-sync reads.
    """
    proposal = db.query(Proposal).filter(
        Proposal.id == proposal_id,
        Proposal.department_id == user["department_id"]
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
                logger.error(f"Auto-sync failure on read for proposal detail '{proposal_id}': {str(e)}")

    return proposal


@router.post("/proposals", status_code=status.HTTP_201_CREATED)
def create_draft_proposal(
    payload: ProposalUpdatePayload,
    db: Session = Depends(get_db),
    user: dict = Depends(require_dept_user)
):
    """
    Creates a new draft proposal (DRAFT).
    Fix (Anomaly 5 & 27): Prevents cost and custom spec bypasses on standard catalog items.
    """
    issp_period, aligned_quantities = align_and_validate_years(db, payload.yearly_quantities, is_submitting=False)
    payload.yearly_quantities = aligned_quantities

    validate_proposal_constraints(db, user["department_id"], payload, is_submitting=False)

    total_qty = sum(payload.yearly_quantities.values())

    resolved_item_name = payload.item_select
    resolved_canvas_url = payload.canvas_evidence_url
    resolved_supplier = None

    if payload.item_select != "other":
        catalog_item = db.query(CatalogItem).filter(
            CatalogItem.item_key == payload.item_select,
            CatalogItem.is_active == True
        ).first()
        if catalog_item:
            resolved_item_name = catalog_item.display_name
            resolved_canvas_url = catalog_item.canvas_evidence_url
            resolved_supplier = catalog_item.supplier_name
            payload.unit_cost = catalog_item.standard_unit_cost
            payload.custom_specification = None  # Clear specs to prevent bypasses

    try:
        json_payload = {
            "comments": [],
            "supplier_name": resolved_supplier
        }

        db_proposal = Proposal(
            department_id=user["department_id"],
            issp_period=issp_period,
            status=ProposalStatus.DRAFT,
            item_key=payload.item_select,
            item_name=resolved_item_name,
            unit_cost=payload.unit_cost,
            yearly_quantities=payload.yearly_quantities,
            total_qty=total_qty,
            payload=json_payload,
            target_offices_json=payload.target_offices_json,
            canvas_evidence_url=resolved_canvas_url,
            custom_specification=payload.custom_specification,
            is_expansion=payload.is_expansion
        )
        db_proposal.s3_storage_class = "STANDARD"
        db_proposal.is_restoring = False
        db.add(db_proposal)
        db.commit()
        db.refresh(db_proposal)
        
        return {
            "status": "success",
            "proposal_id": db_proposal.id,
            "current_status": db_proposal.status.value
        }
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Database error: {str(e)}")


@router.put("/proposals/{proposal_id}")
def update_proposal_item(
    proposal_id: uuid.UUID,
    payload: ProposalUpdatePayload,
    db: Session = Depends(get_db),
    user: dict = Depends(require_dept_user)
):
    """
    Updates mutable fields of a proposal.
    Fix (Anomaly 7): Synchronizes Glacier metadata states prior to write operations.
    Fix (Anomaly 27 & 5): Wipes out spec drift on standard catalog alterations.
    """
    proposal = db.query(Proposal).filter(
        Proposal.id == proposal_id,
        Proposal.department_id == user["department_id"]
    ).first()

    if not proposal:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Proposal not found.")

    canvas_url = proposal.canvas_evidence_url
    s3_storage_class, is_restoring = check_and_update_glacier_metadata(db, proposal, canvas_url)
    
    proposal.s3_storage_class = s3_storage_class
    proposal.is_restoring = is_restoring
    db.flush()

    if is_restoring or s3_storage_class in ["GLACIER", "DEEP_ARCHIVE"]:
        if is_restoring:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="This item's canvas proof is currently undergoing AWS S3 Glacier restoration. Editing is locked."
            )
        else:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="This item's canvas proof is currently archived on cold storage. Please initiate a restore request first."
            )

    if proposal.status in [ProposalStatus.SUBMITTED, ProposalStatus.APPROVED]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Editing locked. This proposal is currently in {proposal.status.value} state."
        )

    issp_period, aligned_quantities = align_and_validate_years(db, payload.yearly_quantities, is_submitting=False)
    payload.yearly_quantities = aligned_quantities

    validate_proposal_constraints(db, user["department_id"], payload, is_submitting=False)

    total_qty = sum(payload.yearly_quantities.values())

    # Protect currency parameters from loss of precision inside historical logs
    old_state = {
        "item_name": proposal.item_name,
        "unit_cost": str(proposal.unit_cost) if proposal.unit_cost is not None else "0.00",
        "total_qty": proposal.total_qty,
        "yearly_quantities": proposal.yearly_quantities,
        "custom_specification": proposal.custom_specification,
        "target_offices_json": proposal.target_offices_json,
        "is_expansion": proposal.is_expansion
    }

    resolved_item_name = payload.item_select
    resolved_canvas_url = payload.canvas_evidence_url
    resolved_supplier = None

    if payload.item_select != "other":
        catalog_item = db.query(CatalogItem).filter(
            CatalogItem.item_key == payload.item_select,
            CatalogItem.is_active == True
        ).first()
        if catalog_item:
            resolved_item_name = catalog_item.display_name
            resolved_canvas_url = catalog_item.canvas_evidence_url
            resolved_supplier = catalog_item.supplier_name
            payload.unit_cost = catalog_item.standard_unit_cost
            payload.custom_specification = None  # Clear specs to prevent custom spec bypass
    else:
        resolved_supplier = "Custom Supplier"

    proposal.item_key = payload.item_select
    proposal.item_name = resolved_item_name
    proposal.unit_cost = payload.unit_cost
    proposal.yearly_quantities = payload.yearly_quantities
    proposal.total_qty = total_qty
    proposal.target_offices_json = payload.target_offices_json
    proposal.canvas_evidence_url = resolved_canvas_url
    proposal.custom_specification = payload.custom_specification
    proposal.is_expansion = payload.is_expansion

    old_payload = dict(proposal.payload) if proposal.payload else {}
    old_payload["supplier_name"] = resolved_supplier
    if "custom_specification" in old_payload:
        old_payload.pop("custom_specification")
    if "canvas_evidence_url" in old_payload:
        old_payload.pop("canvas_evidence_url")
    proposal.payload = old_payload
    proposal.version += 1

    new_state = {
        "item_name": proposal.item_name,
        "unit_cost": str(proposal.unit_cost),
        "total_qty": proposal.total_qty,
        "yearly_quantities": payload.yearly_quantities,
        "custom_specification": payload.custom_specification,
        "target_offices_json": proposal.target_offices_json,
        "is_expansion": payload.is_expansion
    }

    audit = AuditTrail(
        proposal_id=proposal.id,
        action="PROPOSAL_EDITED",
        user_id=user["id"],
        old_value=old_state,
        new_value=new_state
    )
    db.add(audit)
    
    try:
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database transaction failure during proposal mutation: {str(e)}"
        )
    return {"status": "success", "message": "Proposal updated successfully."}


@router.delete("/proposals/{proposal_id}", status_code=status.HTTP_200_OK)
def delete_proposal(
    proposal_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: dict = Depends(require_dept_user)
):
    """ Enforces deletion state constraints (DRAFT or RETURNED only). Cleanly coordinates storage purges. """
    proposal = db.query(Proposal).filter(
        Proposal.id == proposal_id,
        Proposal.department_id == user["department_id"]
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

    if canvas_url and not is_shared:
        key = get_s3_key_from_url(canvas_url)
        if not key:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Security Violation: Failed to parse a valid storage key from the canvas URL."
            )
    else:
        key = None

    try:
        db.delete(proposal)
        db.commit()
        logger.info(f"Database record deletion committed successfully: {proposal_id}")
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database transaction failure during proposal deletion: {str(e)}"
        )

    if key:
        if getattr(settings, "STORAGE_TYPE", "local").lower() == "s3":
            try:
                storage_client.client.delete_object(
                    Bucket=storage_client.bucket_name,
                    Key=key
                )
                logger.info(f"S3 asset deleted successfully: {key}")
            except Exception as s3_err:
                logger.critical(f"Failed to delete S3 asset '{key}': {str(s3_err)}")
        else:
            upload_directory = os.path.abspath(os.path.normpath(settings.LOCAL_UPLOAD_DIR))
            sanitized_key = key.replace("\\", "/")
            target_path = os.path.abspath(os.path.normpath(os.path.join(upload_directory, sanitized_key)))
            
            try:
                is_safe_path = os.path.commonpath([upload_directory, target_path]) == upload_directory
            except ValueError:
                is_safe_path = False

            if is_safe_path:
                if os.path.exists(target_path):
                    try:
                        os.remove(target_path)
                        logger.info(f"Local file cleaned up successfully: {target_path}")
                    except Exception as local_err:
                        logger.critical(f"Failed to delete local file '{target_path}': {str(local_err)}")

    return {"status": "success", "message": "Proposal successfully removed from queue."}


@router.put("/proposals/{proposal_id}/submit")
def submit_proposal(
    proposal_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: dict = Depends(require_dept_user)
):
    """ Transitions a proposal: DRAFT/RETURNED -> SUBMITTED. Verifies constraints and headroom safety. """
    proposal = db.query(Proposal).filter(
        Proposal.id == proposal_id,
        Proposal.department_id == user["department_id"]
    ).first()

    if not proposal:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Proposal not found.")

    if proposal.status not in [ProposalStatus.DRAFT, ProposalStatus.RETURNED]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot submit proposal. Current status is {proposal.status.value}."
        )

    issp_period, aligned_quantities = align_and_validate_years(db, proposal.yearly_quantities, is_submitting=True)
    proposal.yearly_quantities = aligned_quantities

    comments = proposal.payload.get("comments", []) if proposal.payload else []
    has_unresolved_comments = any(c.get("requires_department_action") and not c.get("is_resolved") for c in comments)
    if has_unresolved_comments:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot submit proposal. There are unresolved action items pinned to this draft."
        )

    incoming_cost = proposal.unit_cost * proposal.total_qty
    check_budget_headroom(db, user["department_id"], proposal.issp_period, is_capex=True, incoming_cost=incoming_cost)

    payload_to_verify = ProposalUpdatePayload(
        item_select=proposal.item_key or "other",
        custom_specification=proposal.custom_specification,
        yearly_quantities=proposal.yearly_quantities,
        unit_cost=proposal.unit_cost,
        canvas_evidence_url=proposal.canvas_evidence_url,
        target_offices_json=proposal.target_offices_json,
        is_expansion=proposal.is_expansion
    )
    validate_proposal_constraints(db, user["department_id"], payload_to_verify, is_submitting=True)

    if proposal.item_name != "other":
        catalog_item = db.query(CatalogItem).filter(CatalogItem.display_name == proposal.item_name).first()
        target_display_name = catalog_item.display_name if catalog_item else proposal.item_name
    else:
        target_display_name = proposal.custom_specification or ""

    missing_reports = db.query(ExistingInventory).filter(
        ExistingInventory.department_id == user["department_id"],
        (func.lower(ExistingInventory.item_name) == func.lower(target_display_name)),
        ExistingInventory.status.in_([AssetStatus.CONDEMNED, AssetStatus.NEEDS_REPAIR]),
        ExistingInventory.unserviceable_report_url.is_(None)
    ).first()

    if missing_reports:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Submission blocked: A signed unserviceable report (IIRUP) must be uploaded to existing "
                f"inventories for any condemned or needs-repair '{target_display_name}' items being replaced."
            )
        )

    old_status = proposal.status.value
    proposal.status = ProposalStatus.SUBMITTED
    proposal.version += 1

    audit = AuditTrail(
        proposal_id=proposal.id,
        action="STATE_TRANSITION_SUBMITTED",
        user_id=user["id"],
        old_value={"status": old_status},
        new_value={"status": ProposalStatus.SUBMITTED.value}
    )
    db.add(audit)
    
    try:
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database transaction failure during proposal submission: {str(e)}"
        )
    return {"status": "success", "new_status": proposal.status.value}


# ==========================================================
# FILE WORKSPACES AND CANVAS EVIDENCE UPLOADS
# ==========================================================

@router.post("/upload/canvas")
async def upload_canvas_evidence(
    proposal_id: str = Form(...),
    supplier_name: str = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: dict = Depends(require_user)
):
    """
    Uploads standard market canvas quotation evidence.
    Fix (Anomaly 6): Ensures uploads are locked for Submitted or Approved proposals.
    Fix (Anomaly 14): Validates binary-level PDF signature magic bytes.
    """
    try:
        proposal_uuid = uuid.UUID(proposal_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid UUID format for proposal_id."
        )

    proposal = db.query(Proposal).filter(
        Proposal.id == proposal_uuid,
        Proposal.is_archived == False
    ).first()

    sub_proposal = None
    if not proposal:
        sub_proposal = db.query(SubscriptionProposal).filter(
            SubscriptionProposal.id == proposal_uuid,
            SubscriptionProposal.is_archived == False
        ).first()

    if not proposal and not sub_proposal:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Target record not found.")

    target_dept_id = proposal.department_id if proposal else sub_proposal.department_id

    if user["role"] != "ROLE_MIS_ADMIN" and target_dept_id != user["department_id"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, 
            detail="AuthZ Failed: You do not have permission to modify this record."
        )

    # Fix (Anomaly 6): Block quotation uploads on locked workflows
    status_to_check = proposal.status if proposal else sub_proposal.status
    if status_to_check not in [ProposalStatus.DRAFT, ProposalStatus.RETURNED]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Upload locked: Associated proposal has already been locked for review."
        )

    # Fix (Anomaly 14): Read file bytes and validate magic bytes signature
    file_bytes = await file.read()
    if not validate_pdf_content(file_bytes):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid file format. Only PDF files are allowed."
        )
    await file.seek(0)

    safe_supplier = secure_filename(supplier_name) if supplier_name else "default_supplier"
    safe_filename = secure_filename(file.filename)
    key = storage_client.get_canvas_key(str(proposal_uuid), safe_supplier, safe_filename)
    
    success = storage_client.upload_canvas_evidence(file_bytes, key)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to persist canvas document to secure storage."
        )

    download_url = storage_client.generate_download_url(key)

    if proposal:
        proposal.canvas_evidence_url = download_url
        current_payload = dict(proposal.payload) if proposal.payload else {}
        current_payload["supplier_name"] = supplier_name
        if "canvas_evidence_url" in current_payload:
            current_payload.pop("canvas_evidence_url")
        proposal.payload = current_payload
    else:
        sub_proposal.canvas_evidence_url = download_url
    
    try:
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database transaction failure during canvas uploading: {str(e)}"
        )

    return {
        "status": "success",
        "proposal_id": proposal_uuid,
        "supplier": supplier_name,
        "file_url": download_url
    }


@router.post("/upload/unserviceable-report")
async def upload_unserviceable_evidence(
    inventory_id: str = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: dict = Depends(require_dept_user)
):
    """
    Uploads unserviceability reports (IIRUP) to substantiate equipment replacement justifications.
    Fix (Anomaly 14): Validates binary-level PDF signature magic bytes.
    """
    try:
        inventory_uuid = uuid.UUID(inventory_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid UUID format for inventory_id."
        )

    asset = db.query(ExistingInventory).filter(
        ExistingInventory.id == inventory_uuid,
        ExistingInventory.department_id == user["department_id"]
    ).first()

    if not asset:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Inventory asset not found.")

    if asset.status == AssetStatus.FUNCTIONAL:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Functional items do not require an unserviceable report.")

    # Fix (Anomaly 14): Validate binary magic-bytes signature
    file_bytes = await file.read()
    if not validate_pdf_content(file_bytes):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid file format. Only PDF files are allowed."
        )
    await file.seek(0)

    safe_filename = secure_filename(file.filename)
    file_url = storage_client.upload_unserviceable_report(
        file_data=file_bytes,
        department_id=str(user["department_id"]),
        filename=safe_filename
    )

    if not file_url:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to upload report to storage.")

    asset.unserviceable_report_url = file_url
    try:
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database transaction failure during unserviceable report linking: {str(e)}"
        )

    return {"status": "success", "inventory_id": asset.id, "file_url": file_url}


# ==========================================================
# INLINE DISCUSSION AND ACTION-REQUIRED COMMENT THREADS
# ==========================================================

@router.get("/action-items/summary")
def get_action_items_summary(
    db: Session = Depends(get_db),
    user: dict = Depends(require_dept_user)
):
    """ Returns a lightweight summary of unresolved action items and returned proposals. """
    unread_actions = 0
    returned_proposals = 0

    dept_id = user["department_id"]

    # Fetch User's Capex and MOOE items
    capex_items = db.query(Proposal).filter(Proposal.department_id == dept_id).all()
    mooe_items = db.query(SubscriptionProposal).filter(SubscriptionProposal.department_id == dept_id).all()
    
    all_items = capex_items + mooe_items

    for item in all_items:
        # 1. Check for Returned Status
        if item.status == ProposalStatus.RETURNED:
            returned_proposals += 1

        # 2. Check Payload for Unresolved Actionable Comments
        payload = item.payload or {}
        comments = payload.get("comments", [])
        
        for comment in comments:
            if comment.get("requires_department_action") is True and comment.get("is_resolved") is False:
                unread_actions += 1

    return {
        "unread_actions": unread_actions,
        "returned_proposals": returned_proposals
    }


@router.post("/proposals/{proposal_id}/comments")
def post_inline_comment(
    proposal_id: uuid.UUID,
    payload: CommentCreate,
    db: Session = Depends(get_db),
    user: dict = Depends(require_user)
):
    """ Posts an inline discussion remark or pins an action item block to a proposal draft. """
    target = db.query(Proposal).filter(Proposal.id == proposal_id).first()
    if not target:
        target = db.query(SubscriptionProposal).filter(SubscriptionProposal.id == proposal_id).first()

    if not target:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Target record not found.")

    if user["role"] != "ROLE_MIS_ADMIN" and target.department_id != user["department_id"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access Denied: You do not have permission to comment on this record."
        )

    current_payload = dict(target.payload) if target.payload else {}

    if "comments" not in current_payload:
        current_payload["comments"] = []

    author_name_fallback = user["email"].split("@")[0].replace(".", " ").title()

    new_comment = {
        "id": str(uuid.uuid4()),
        "author_name": author_name_fallback,
        "author_email": user["email"],
        "author_role": user["role"],
        "text": payload.text,
        "timestamp": datetime.utcnow().isoformat(),
        "is_resolved": False,
        "field_name": getattr(payload, "field_name", None),  
        "requires_department_action": getattr(payload, "requires_department_action", False)
    }

    current_payload["comments"].append(new_comment)
    target.payload = current_payload
    try:
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database transaction failure during comment registration: {str(e)}"
        )

    return {
        "status": "success",
        "comment": new_comment
    }


@router.get("/proposals/{proposal_id}/comments")
def get_proposal_comments(
    proposal_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: dict = Depends(require_user)
):
    """
    Retrieves discussion threads and pinned feedback comments.
    Fix (Anomaly 28): Restricts comments retrieval strictly to the resource owners.
    """
    target = db.query(Proposal).filter(Proposal.id == proposal_id).first()
    if not target:
        target = db.query(SubscriptionProposal).filter(SubscriptionProposal.id == proposal_id).first()

    if not target:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Target record not found.")

    # Enforce strict ownership validations on comments access queries
    if user["role"] != "ROLE_MIS_ADMIN" and target.department_id != user["department_id"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access Denied: You do not have permission to view comments for this record."
        )

    payload_data = target.payload or {}
    return payload_data.get("comments", [])


@router.post("/proposals/{proposal_id}/comments/{comment_id}/resolve")
def resolve_proposal_comment(
    proposal_id: uuid.UUID,
    comment_id: str,
    db: Session = Depends(get_db),
    user: dict = Depends(require_dept_user)
):
    """ Resolves a feedback remark requiring department action. Unlocks proposal submission flows. """
    target = db.query(Proposal).filter(
        Proposal.id == proposal_id,
        Proposal.department_id == user["department_id"]
    ).first()
    
    if not target:
        target = db.query(SubscriptionProposal).filter(
            SubscriptionProposal.id == proposal_id,
            SubscriptionProposal.department_id == user["department_id"]
        ).first()

    if not target:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Target proposal or subscription not found.")

    current_payload = dict(target.payload) if target.payload else {}
    comments = current_payload.get("comments", [])
    
    comment_found = False
    for comment in comments:
        if comment.get("id") == comment_id:
            comment["is_resolved"] = True
            comment_found = True
            break

    if not comment_found:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Comment not found in this proposal.")

    target.payload = current_payload
    try:
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database transaction failure during comment resolution: {str(e)}"
        )
    return {"status": "success", "message": "Comment resolved successfully."}


# ==========================================================
# DEPARTMENT STRATEGIC PLAN (Section 8.0 Needs)
# ==========================================================

@router.post("/needs-assessment", response_model=NeedsAssessmentResponse, status_code=status.HTTP_201_CREATED)
def create_needs_assessment(
    payload: NeedsAssessmentCreate,
    db: Session = Depends(get_db),
    user: dict = Depends(require_dept_user)
):
    """ Section 8.0 - Logs a structured departmental justification mapped to standard MFOs. """
    new_assessment = NeedsAssessment(
        department_id=user["department_id"],
        title=payload.title,
        mfo_alignment=payload.mfo_alignment,
        current_problem=payload.current_problem,
        proposed_solution=payload.proposed_solution,
        expected_impacts=payload.expected_impacts,
        other_impact=payload.other_impact
    )
    db.add(new_assessment)
    try:
        db.commit()
        db.refresh(new_assessment)
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database transaction failure during needs assessment creation: {str(e)}"
        )
    return new_assessment


@router.get("/needs-assessment", response_model=List[NeedsAssessmentResponse])
def get_needs_assessments(
    db: Session = Depends(get_db),
    user: dict = Depends(require_dept_user)
):
    """ Section 8.0 - Lists active Needs Assessment alignment profiles for the calling department. """
    return db.query(NeedsAssessment).filter(
        NeedsAssessment.department_id == user["department_id"],
        NeedsAssessment.is_archived == False
    ).all()


# ==========================================================
# SOFTWARE LICENSES & CLOUD SUBSCRIPTIONS (Annex A-2 MOOE)
# ==========================================================

@router.post("/subscriptions", response_model=SubscriptionProposalResponse, status_code=status.HTTP_201_CREATED)
def create_mooe_subscription(
    payload: SubscriptionProposalCreate,
    db: Session = Depends(get_db),
    user: dict = Depends(require_dept_user)
):
    """ Section 9.4 - Registers recurring cloud service or software license subscriptions (MOOE). """
    issp_period, aligned_users = align_and_validate_years(db, payload.yearly_users, is_submitting=False)
    payload.yearly_users = aligned_users

    validate_subscription_constraints(db, user["department_id"], payload, is_submitting=False)
    
    total_users = sum(payload.yearly_users.values())
    total_cost = payload.annual_cost_per_user * total_users
    
    db_entry = SubscriptionProposal(
        department_id=user["department_id"],
        issp_period=issp_period,
        subscription_type=payload.subscription_type,
        software_name=payload.software_name,
        justification=payload.justification,
        yearly_users=payload.yearly_users,
        annual_cost_per_user=payload.annual_cost_per_user,
        total_multiyear_mooe=total_cost,
        status=ProposalStatus.DRAFT,
        canvas_evidence_url=payload.canvas_evidence_url,
        target_offices_json=payload.target_offices_json,
        is_expansion=payload.is_expansion,
        payload={"comments": []}
    )
    db_entry.is_restoring = False
    db_entry.s3_storage_class = "STANDARD"

    db.add(db_entry)
    try:
        db.commit()
        db.refresh(db_entry)
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database transaction failure during subscription proposal generation: {str(e)}"
        )
    return db_entry


@router.get("/subscriptions", response_model=List[SubscriptionProposalResponse])
def get_mooe_subscriptions(
    issp_period_filter: Optional[str] = Query(None, alias="issp_period"),
    db: Session = Depends(get_db),
    user: dict = Depends(require_dept_user)
):
    """ Retrieves active software and cloud subscription proposals (MOOE) in the selected cycle. """
    target_period = issp_period_filter or get_active_issp_period(db)

    return db.query(SubscriptionProposal).filter(
        SubscriptionProposal.department_id == user["department_id"],
        SubscriptionProposal.issp_period == target_period,
        SubscriptionProposal.is_archived == False
    ).all()


@router.get("/subscriptions/{subscription_id}", response_model=SubscriptionProposalResponse)
def get_mooe_subscription_detail(
    subscription_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: dict = Depends(require_dept_user)
):
    """ Retrieves detailed information of a specific subscription proposal safely and idempotently. """
    sub = db.query(SubscriptionProposal).filter(
        SubscriptionProposal.id == subscription_id,
        SubscriptionProposal.department_id == user["department_id"]
    ).first()

    if not sub:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Subscription proposal not found.")

    if sub.is_restoring:
        s3_class, active_restore = check_and_update_glacier_metadata(db, sub, sub.canvas_evidence_url)
        if s3_class != sub.s3_storage_class or active_restore != sub.is_restoring:
            sub.s3_storage_class = s3_class
            sub.is_restoring = active_restore
            try:
                db.commit()
                db.refresh(sub)
            except Exception as e:
                db.rollback()
                logger.error(f"Auto-sync failure on read for subscription detail '{subscription_id}': {str(e)}")

    return sub


@router.put("/subscriptions/{subscription_id}")
def update_mooe_subscription(
    subscription_id: uuid.UUID,
    payload: SubscriptionProposalCreate,
    db: Session = Depends(get_db),
    user: dict = Depends(require_dept_user)
):
    """ Modifies an unsubmitted MOOE/Subscription line item. Enforces status checks and S3 Glacier locks. """
    sub = db.query(SubscriptionProposal).filter(
        SubscriptionProposal.id == subscription_id,
        SubscriptionProposal.department_id == user["department_id"]
    ).first()

    if not sub:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Subscription proposal not found.")

    canvas_url = sub.canvas_evidence_url
    s3_storage_class, is_restoring = check_and_update_glacier_metadata(db, sub, canvas_url)
    
    sub.s3_storage_class = s3_storage_class
    sub.is_restoring = is_restoring

    if is_restoring or s3_storage_class in ["GLACIER", "DEEP_ARCHIVE"]:
        if is_restoring:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="This subscription's canvas proof is currently undergoing AWS S3 Glacier restoration. Editing is locked."
            )
        else:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="This subscription's canvas proof is currently archived on cold storage. Please initiate a restore request first."
            )

    if sub.status in [ProposalStatus.SUBMITTED, ProposalStatus.APPROVED]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Modifications are locked while the proposal is in {sub.status.value} state."
        )

    issp_period, aligned_users = align_and_validate_years(db, payload.yearly_users, is_submitting=False)
    payload.yearly_users = aligned_users

    validate_subscription_constraints(db, user["department_id"], payload, is_submitting=False)

    total_users = sum(payload.yearly_users.values())
    total_cost = payload.annual_cost_per_user * total_users

    sub.subscription_type = payload.subscription_type
    sub.software_name = payload.software_name
    sub.justification = payload.justification
    sub.yearly_users = payload.yearly_users
    sub.annual_cost_per_user = payload.annual_cost_per_user
    sub.total_multiyear_mooe = total_cost
    sub.canvas_evidence_url = payload.canvas_evidence_url
    sub.target_offices_json = payload.target_offices_json
    sub.is_expansion = payload.is_expansion

    try:
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database transaction failure during subscription mutation: {str(e)}"
        )
    return {"status": "success", "message": "Subscription proposal updated successfully."}


@router.delete("/subscriptions/{subscription_id}")
def delete_mooe_subscription(
    subscription_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: dict = Depends(require_dept_user)
):
    """ Deletes a subscription proposal. Orchestrates deletion by running DB commit first and then safe storage cleanups. """
    sub = db.query(SubscriptionProposal).filter(
        SubscriptionProposal.id == subscription_id,
        SubscriptionProposal.department_id == user["department_id"]
    ).first()

    if not sub:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Subscription proposal not found.")

    if sub.status not in [ProposalStatus.DRAFT, ProposalStatus.RETURNED]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Deletions are blocked when the state is {sub.status.value}."
        )

    canvas_url = sub.canvas_evidence_url
    is_shared = is_file_referenced_elsewhere(db, canvas_url, exclude_subscription_id=subscription_id)

    if canvas_url and not is_shared:
        key = get_s3_key_from_url(canvas_url)
        if not key:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Security Violation: Failed to parse a valid storage key from the canvas URL."
            )
    else:
        key = None

    try:
        db.delete(sub)
        db.commit()
        logger.info(f"Database record deletion committed successfully: {subscription_id}")
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database transaction failure during subscription proposal removal: {str(e)}"
        )

    if key:
        if getattr(settings, "STORAGE_TYPE", "local").lower() == "s3":
            try:
                storage_client.client.delete_object(
                    Bucket=storage_client.bucket_name, 
                    Key=key
                )
                logger.info(f"S3 asset deleted successfully: {key}")
            except Exception as s3_err:
                logger.critical(f"Failed to delete S3 asset '{key}': {str(s3_err)}")
        else:
            upload_directory = os.path.abspath(os.path.normpath(settings.LOCAL_UPLOAD_DIR))
            sanitized_key = key.replace("\\", "/")
            target_path = os.path.abspath(os.path.normpath(os.path.join(upload_directory, sanitized_key)))
            
            try:
                is_safe_path = os.path.commonpath([upload_directory, target_path]) == upload_directory
            except ValueError:
                is_safe_path = False

            if is_safe_path:
                if os.path.exists(target_path):
                    try:
                        os.remove(target_path)
                        logger.info(f"Local file cleaned up successfully: {target_path}")
                    except Exception as local_err:
                        logger.critical(f"Failed to delete local file '{target_path}': {str(local_err)}")

    return {"status": "success", "message": "Subscription proposal deleted successfully."}


@router.put("/subscriptions/{subscription_id}/submit")
def submit_mooe_subscription(
    subscription_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: dict = Depends(require_dept_user)
):
    """ Transitions a subscription proposal: DRAFT/RETURNED -> SUBMITTED. Blocks submissions containing unresolved remarks. """
    sub = db.query(SubscriptionProposal).filter(
        SubscriptionProposal.id == subscription_id,
        SubscriptionProposal.department_id == user["department_id"]
    ).first()

    if not sub:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Subscription proposal not found.")

    if sub.status not in [ProposalStatus.DRAFT, ProposalStatus.RETURNED]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Submission is only allowed for Draft or Returned items."
        )

    issp_period, aligned_users = align_and_validate_years(db, sub.yearly_users, is_submitting=True)
    sub.yearly_users = aligned_users

    comments = sub.payload.get("comments", []) if sub.payload else []
    has_unresolved_comments = any(c.get("requires_department_action") and not c.get("is_resolved") for c in comments)
    if has_unresolved_comments:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot submit subscription. There are unresolved action items pinned to this draft."
        )

    check_budget_headroom(db, user["department_id"], sub.issp_period, is_capex=False, incoming_cost=sub.total_multiyear_mooe)

    payload_to_verify = SubscriptionProposalCreate(
        subscription_type=sub.subscription_type,
        software_name=sub.software_name,
        justification=sub.justification,
        yearly_users=sub.yearly_users,
        annual_cost_per_user=sub.annual_cost_per_user,
        canvas_evidence_url=sub.canvas_evidence_url,
        target_offices_json=sub.target_offices_json,
        is_expansion=sub.is_expansion
    )
    validate_subscription_constraints(db, user["department_id"], payload_to_verify, is_submitting=True)

    old_status = sub.status.value
    sub.status = ProposalStatus.SUBMITTED

    audit = AuditTrail(
        subscription_id=sub.id,
        action="STATE_TRANSITION_SUBMITTED",
        user_id=user["id"],
        old_value={"status": old_status},
        new_value={"status": ProposalStatus.SUBMITTED.value}
    )
    db.add(audit)
    
    try:
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database transaction failure during subscription submission: {str(e)}"
        )
    return {"status": "success", "new_status": sub.status.value}


@router.post("/proposals/{proposal_id}/restore")
def request_glacier_restore(
    proposal_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: dict = Depends(require_dept_user)
):
    """ Initiates Glacier restoration for proposal canvas proofs. """
    if getattr(settings, "STORAGE_TYPE", "local").lower() != "s3":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Glacier restoration is only supported when STORAGE_TYPE is configured as 's3'."
        )

    proposal = db.query(Proposal).filter(
        Proposal.id == proposal_id,
        Proposal.department_id == user["department_id"]
    ).first()

    if not proposal:
        raise HTTPException(status_code=404, detail="Proposal not found.")

    canvas_url = proposal.canvas_evidence_url
    if not canvas_url:
        raise HTTPException(status_code=400, detail="This proposal has no linked canvas document.")

    key = get_s3_key_from_url(canvas_url)
    if not key:
        raise HTTPException(status_code=400, detail="Failed to parse storage key from URL.")

    try:
        metadata = storage_client.client.head_object(Bucket=storage_client.bucket_name, Key=key)
        restore_status = metadata.get("Restore", "")
        if 'ongoing-request="true"' in restore_status:
            return {
                "status": "restoring",
                "message": "S3 Glacier retrieval job already in progress."
            }

        success = storage_client.restore_object(key, days=7)
        if not success:
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to submit restore request to S3.")

        proposal.is_restoring = True
        db.commit()
        
        return {
            "status": "restoring",
            "message": "S3 Glacier retrieval job initiated. Standard restores complete in 3-5 hours."
        }
    except ClientError as e:
        db.rollback()
        if e.response['Error']['Code'] == 'InvalidObjectState':
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="This asset is already being restored or is already online."
            )
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"S3 Storage Client Error: {str(e)}")
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Glacier restore failed: {str(e)}")


@router.post("/subscriptions/{subscription_id}/restore")
def request_subscription_glacier_restore(
    subscription_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: dict = Depends(require_dept_user)
):
    """ Initiates Glacier restoration for subscription canvas proofs. """
    if getattr(settings, "STORAGE_TYPE", "local").lower() != "s3":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Glacier restoration is only supported when STORAGE_TYPE is configured as 's3'."
        )

    sub = db.query(SubscriptionProposal).filter(
        SubscriptionProposal.id == subscription_id,
        SubscriptionProposal.department_id == user["department_id"]
    ).first()

    if not sub:
        raise HTTPException(status_code=404, detail="Subscription proposal not found.")

    canvas_url = sub.canvas_evidence_url
    if not canvas_url:
        raise HTTPException(status_code=400, detail="This subscription proposal has no linked canvas document.")

    key = get_s3_key_from_url(canvas_url)
    if not key:
        raise HTTPException(status_code=400, detail="Failed to parse storage key from URL.")

    try:
        metadata = storage_client.client.head_object(Bucket=storage_client.bucket_name, Key=key)
        restore_status = metadata.get("Restore", "")
        if 'ongoing-request="true"' in restore_status:
            return {
                "status": "restoring",
                "message": "S3 Glacier retrieval job already in progress."
            }

        success = storage_client.restore_object(key, days=7)
        if not success:
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to submit restore request to S3.")

        sub.is_restoring = True
        db.commit()
        
        return {
            "status": "restoring",
            "message": "S3 Glacier retrieval job initiated. Standard restores complete in 3-5 hours."
        }
    except ClientError as e:
        db.rollback()
        if e.response['Error']['Code'] == 'InvalidObjectState':
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="This asset is already being restored or is already online."
            )
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"S3 Storage Client Error: {str(e)}")
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Glacier restore failed: {str(e)}")


# ==========================================================
# PROPOSAL DEPLOYMENTS (Gap 13 Core Office Mapping)
# ==========================================================

@router.get("/proposals/{proposal_id}/deployments", response_model=List[DeploymentResponse])
def get_proposal_deployments(
    proposal_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: dict = Depends(require_dept_user)
):
    """ Retrieves the physical deployment allocations mapped for a given proposal. """
    proposal = db.query(Proposal).filter(
        Proposal.id == proposal_id,
        Proposal.department_id == user["department_id"]
    ).first()

    if not proposal:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Proposal not found.")

    return db.query(ProposalDeployment).filter(
        ProposalDeployment.proposal_id == proposal_id
    ).all()


@router.post("/proposals/{proposal_id}/deployments", response_model=DeploymentResponse, status_code=status.HTTP_201_CREATED)
def create_proposal_deployment(
    proposal_id: uuid.UUID,
    payload: DeploymentCreate,
    db: Session = Depends(get_db),
    user: dict = Depends(require_dept_user)
):
    """ Maps an item quantity configuration to a target office for the specified proposal. """
    proposal = db.query(Proposal).filter(
        Proposal.id == proposal_id,
        Proposal.department_id == user["department_id"]
    ).first()

    if not proposal:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Proposal not found.")

    new_deployment = ProposalDeployment(
        proposal_id=proposal_id,
        office_name=payload.office_name,
        quantity=payload.quantity
    )
    db.add(new_deployment)
    try:
        db.commit()
        db.refresh(new_deployment)
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to record deployment mapping allocation: {str(e)}"
        )
    return new_deployment


@router.delete("/deployments/{deployment_id}", status_code=status.HTTP_200_OK)
def delete_proposal_deployment(
    deployment_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: dict = Depends(require_dept_user)
):
    """ Removes an established deployment allocation mapping record. """
    deployment = db.query(ProposalDeployment).join(Proposal).filter(
        ProposalDeployment.id == deployment_id,
        Proposal.department_id == user["department_id"]
    ).first()

    if not deployment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Deployment record not found.")

    try:
        db.delete(deployment)
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete deployment record: {str(e)}"
        )
    return {"status": "success", "message": "Deployment record successfully removed."}