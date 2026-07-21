# app/admin/router.py
import os
import html
import uuid
import logging
from decimal import Decimal
from datetime import datetime  # <--- Add this import
from typing import List, Optional, Dict, Any
import bcrypt
from fastapi import APIRouter, Depends, HTTPException, status, Query, UploadFile, File
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.config import settings
from app.database.session import get_db
from app.database.models import (
    Proposal,
    SubscriptionProposal,
    BudgetCeiling,
    ProposalStatus,
    AuditTrail,
    Department,
    MasterNarrative,
    CatalogItem,
    SystemSetting,
    User,
    Campus,
    DegreeOffering,
    GaaPerformance,
    StrategicConcern,
    CoreOfficeFunction,
    GlossaryTerm,
    GeneralInstruction,
    ServerCapacityTrack,
    ClientOsCensus,
    OfficeSoftwareCensus,
    CrossAgencyProject,
    PerformanceMetric,
    AnnualCostBreakdown,
    IctStaffPosition
)
from app.schemas import (
    AdminOverridePayload,
    BudgetCeilingResponse,
    UpdateCeilingPayload,
    UpdateGlobalCeilingPayload,
    BulkCeilingValidationPayload,
    DepartmentAnalyticsResponse,
    MasterNarrativeUpdate,
    MasterNarrativeResponse,
    SystemGovernanceSettings,
    CatalogItemCreate, 
    CatalogItemUpdate, 
    CatalogItemResponse,
    ProposalResponse,              # <--- Added to the imports
    SubscriptionProposalResponse,
    WhitelistedUserCreate,
    WhitelistedUserUpdate,
    WhitelistedUserResponse,
    AuditLogEntryResponse,
    CampusCreate,
    CampusResponse,
    DegreeOfferingCreate,
    DegreeOfferingResponse,
    GaaPerformanceCreate,
    GaaPerformanceResponse,
    StrategicConcernCreate,
    StrategicConcernResponse,
    CoreOfficeFunctionCreate,
    CoreOfficeFunctionResponse,
    GlossaryTermCreate,
    GlossaryTermResponse,
    GeneralInstructionCreate,
    GeneralInstructionResponse,
    ServerCapacityCreate,
    ServerCapacityResponse,
    ClientOsCensusCreate,
    ClientOsCensusResponse,
    OfficeSoftwareCreate,
    OfficeSoftwareResponse,
    CrossAgencyProjectCreate,
    CrossAgencyProjectResponse,
    PerformanceMetricCreate,
    PerformanceMetricResponse,
    AnnualCostBreakdownCreate,
    AnnualCostBreakdownResponse,
    IctStaffPositionCreate,
    IctStaffPositionResponse
)
from app.auth.router import require_admin
from app.tasks.pdf_tasks import compile_issp_document
from app.storage.s3_client import storage_client

# Import consolidated helper functions
from app.utils.helpers import (
    secure_filename,
    get_s3_key_from_url,
    get_active_issp_period,
    validate_active_years_alignment,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/admin", tags=["Admin & Governance Subsystem"])


# ==========================================================
# DYNAMIC DEPARTMENT MANAGEMENT (CRUD)
# ==========================================================

@router.get("/departments", response_model=List[Dict[str, Any]])
def get_all_departments(
    db: Session = Depends(get_db), 
    admin: dict = Depends(require_admin)
):
    try:
        depts = db.query(Department).order_by(Department.name.asc()).all()
        return [{"department_id": d.id, "department_name": d.name} for d in depts]
    except Exception as e:
        logger.error(f"Failed to query departments database: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to load departments list.")


@router.post("/departments", status_code=status.HTTP_201_CREATED)
def create_department(
    payload: Dict[str, str], 
    db: Session = Depends(get_db), 
    admin: dict = Depends(require_admin)
):
    name = payload.get("name")
    if not name or not name.strip():
        raise HTTPException(status_code=400, detail="Department name is required.")
    
    clean_name = html.escape(name.strip())
    existing = db.query(Department).filter(Department.name == clean_name).first()
    if existing:
        raise HTTPException(status_code=400, detail="Department name already exists in the system registry.")
        
    try:
        new_dept = Department(name=clean_name)
        db.add(new_dept)
        db.flush() # Flush to get the ID for the audit trail
        
        audit = AuditTrail(
            action="SYSTEM_DEPARTMENT_CREATED",
            user_id=admin["id"],
            old_value=None,
            new_value={"department_id": new_dept.id, "department_name": new_dept.name}
        )
        db.add(audit)
        db.commit()
        db.refresh(new_dept)
        return {"status": "success", "department_id": new_dept.id, "department_name": new_dept.name}
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to create department: {str(e)}")
        raise HTTPException(status_code=500, detail="Database failure during department creation.")


@router.put("/departments/{dept_id}")
def update_department(
    dept_id: int,
    payload: Dict[str, str],
    db: Session = Depends(get_db),
    admin: dict = Depends(require_admin)
):
    name = payload.get("name")
    if not name or not name.strip():
        raise HTTPException(status_code=400, detail="Department name is required.")
    
    clean_name = html.escape(name.strip())
    
    try:
        dept = db.query(Department).filter(Department.id == dept_id).first()
        if not dept:
            raise HTTPException(status_code=404, detail="Department not found.")
        
        existing = db.query(Department).filter(Department.name == clean_name, Department.id != dept_id).first()
        if existing:
            raise HTTPException(status_code=400, detail="Department name already exists in the system registry.")
        
        old_name = dept.name
        dept.name = clean_name
        
        audit = AuditTrail(
            action="SYSTEM_DEPARTMENT_MODIFIED",
            user_id=admin["id"],
            old_value={"department_id": dept.id, "department_name": old_name},
            new_value={"department_id": dept.id, "department_name": clean_name}
        )
        db.add(audit)
        db.commit()
        return {"status": "success", "department_id": dept.id, "department_name": dept.name}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to update department ID {dept_id}: {str(e)}")
        raise HTTPException(status_code=500, detail="Database failure during department update.")


@router.delete("/departments/{dept_id}")
def delete_department(
    dept_id: int, 
    db: Session = Depends(get_db), 
    admin: dict = Depends(require_admin)
):
    try:
        dept = db.query(Department).filter(Department.id == dept_id).first()
        if not dept:
            raise HTTPException(status_code=404, detail="Department not found.")
            
        linked_users_count = db.query(User).filter(User.department_id == dept_id).count()
        if linked_users_count > 0:
            raise HTTPException(
                status_code=400, 
                detail=f"Cannot delete department. There are {linked_users_count} whitelisted users linked to this division."
            )
            
        audit = AuditTrail(
            action="SYSTEM_DEPARTMENT_DELETED",
            user_id=admin["id"],
            old_value={"department_id": dept.id, "department_name": dept.name},
            new_value={"event": "Department removed from system registries."}
        )
        db.add(audit)
        
        db.delete(dept)
        db.commit()
        return {"status": "success", "message": "Department successfully purged from registry."}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to delete department ID {dept_id}: {str(e)}")
        raise HTTPException(status_code=500, detail="Database failure during department deletion.")


# ==========================================================
# APPROVED PROPOSALS REFERENCE SEARCH
# ==========================================================

@router.get("/proposals/approved-canvas", response_model=List[Dict[str, Any]])
def get_approved_canvas_items(
    db: Session = Depends(get_db), 
    admin: dict = Depends(require_admin)
):
    try:
        capex = db.query(Proposal).filter(
            Proposal.status == ProposalStatus.APPROVED,
            Proposal.canvas_evidence_url.isnot(None),
            Proposal.is_archived == False
        ).all()
        
        mooe = db.query(SubscriptionProposal).filter(
            SubscriptionProposal.status == ProposalStatus.APPROVED,
            SubscriptionProposal.canvas_evidence_url.isnot(None),
            SubscriptionProposal.is_archived == False
        ).all()
        
        results = []
        for p in capex:
            supplier = p.payload.get("supplier_name") if p.payload else None
            results.append({
                "id": str(p.id),
                "type": "CapEx",
                "display_name": p.item_name if p.item_key != "other" else (p.custom_specification or p.item_name),
                "supplier_name": supplier or "Approved Provider",
                "canvas_evidence_url": p.canvas_evidence_url,
                "unit_cost": float(p.unit_cost)
            })
            
        for s in mooe:
            supplier = s.payload.get("supplier_name") if s.payload else None
            results.append({
                "id": str(s.id),
                "type": "MOOE",
                "display_name": s.software_name,
                "supplier_name": supplier or "Approved Provider",
                "canvas_evidence_url": s.canvas_evidence_url,
                "unit_cost": float(s.annual_cost_per_user)
            })
            
        return results
    except Exception as e:
        logger.error(f"Failed to query approved canvas reference items: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to load approved references.")


# ==========================================================
# PLANNING CYCLE LOCK & SAFE RESET
# ==========================================================

@router.post("/narratives/{issp_period}/activate")
def set_active_planning_cycle(
    issp_period: str,
    db: Session = Depends(get_db),
    admin: dict = Depends(require_admin)
):
    try:
        prev_active = db.query(MasterNarrative).filter(
            MasterNarrative.is_active == True,
            MasterNarrative.issp_period != issp_period
        ).first()
        prev_period = prev_active.issp_period if prev_active else "None"

        db.query(MasterNarrative).update({MasterNarrative.is_active: False})

        try:
            years = [int(y) for y in issp_period.split("-") if y.isdigit()]
            from_year = years[0] if len(years) >= 1 else None
            to_year = years[1] if len(years) >= 2 else None
        except Exception:
            from_year = None
            to_year = None

        target_narrative = db.query(MasterNarrative).filter(MasterNarrative.issp_period == issp_period).first()
        if not target_narrative:
            target_narrative = MasterNarrative(
                issp_period=issp_period,
                issp_period_from=from_year,
                issp_period_to=to_year,
                signatory_prepared_by="Not Configured",
                signatory_approved_by="Not Configured",
                is_active=True
            )
            db.add(target_narrative)
            db.flush()
        else:
            target_narrative.issp_period_from = from_year
            target_narrative.issp_period_to = to_year
            target_narrative.is_active = True

        has_offices = db.query(CoreOfficeFunction).filter(CoreOfficeFunction.issp_period == issp_period).first()
        if not has_offices and prev_active:
            old_offices = db.query(CoreOfficeFunction).filter(CoreOfficeFunction.issp_period == prev_active.issp_period).all()
            for old_office in old_offices:
                cloned_office = CoreOfficeFunction(
                    issp_period=issp_period,
                    office_name=old_office.office_name,
                    division=old_office.division,
                    description=old_office.description
                )
                db.add(cloned_office)

        audit = AuditTrail(
            action="SYSTEM_ISSP_CYCLE_ACTIVATED",
            user_id=admin["id"],
            old_value={"previous_active_cycle": prev_period},
            new_value={"new_active_cycle": issp_period}
        )
        db.add(audit)
        db.commit()
        return {
            "status": "success", 
            "message": f"Planning cycle '{issp_period}' activated. Template offices synchronized.", 
            "issp_period": issp_period
        }
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error activating cycle: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to activate planning cycle.")
    
@router.post("/narratives/{issp_period}/reset")
def reset_planning_cycle(
    issp_period: str,
    db: Session = Depends(get_db),
    admin: dict = Depends(require_admin)
):
    try:
        db.query(Proposal).filter(Proposal.issp_period == issp_period).delete(synchronize_session=False)
        db.query(SubscriptionProposal).filter(SubscriptionProposal.issp_period == issp_period).delete(synchronize_session=False)
        db.query(BudgetCeiling).filter(BudgetCeiling.issp_period == issp_period).delete(synchronize_session=False)
        db.query(MasterNarrative).filter(MasterNarrative.issp_period == issp_period).delete(synchronize_session=False)
        
        audit = AuditTrail(
            action="SYSTEM_ISSP_CYCLE_RESET",
            user_id=admin["id"],
            old_value={"purged_cycle": issp_period},
            new_value={"event": "All drafts, submissions, and ceilings linked to this cycle were permanently deleted."}
        )
        db.add(audit)
        db.commit()
        return {"status": "success", "message": f"Planning cycle '{issp_period}' and associated data purged successfully."}
    except Exception as e:
        db.rollback()
        logger.error(f"Error resetting cycle {issp_period}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Cycle reset failed: {str(e)}")


# ==========================================================
# DASHBOARD METRICS & AUDIT LEDGERS
# ==========================================================

@router.get("/dashboard-metrics")
def get_admin_dashboard_metrics(
    db: Session = Depends(get_db), 
    admin: dict = Depends(require_admin)
):
    try:
        issp_period = get_active_issp_period(db)
        
        global_setting = db.query(SystemSetting).filter(SystemSetting.key == "global_budget_ceiling").first()
        global_limit = Decimal(global_setting.value) if global_setting else settings.GLOBAL_BUDGET_CEILING
        
        capex_spent = db.query(func.sum(Proposal.unit_cost * Proposal.total_qty)).filter(
            Proposal.status == ProposalStatus.APPROVED,
            Proposal.issp_period == issp_period,
            Proposal.is_archived == False
        ).scalar() or Decimal("0.00")
        
        mooe_spent = db.query(func.sum(SubscriptionProposal.total_multiyear_mooe)).filter(
            SubscriptionProposal.status == ProposalStatus.APPROVED,
            SubscriptionProposal.issp_period == issp_period,
            SubscriptionProposal.is_archived == False
        ).scalar() or Decimal("0.00")
        
        total_spent = capex_spent + mooe_spent
        
        pending_capex = db.query(Proposal).filter(
            Proposal.status == ProposalStatus.SUBMITTED, 
            Proposal.is_archived == False
        ).count()
        pending_mooe = db.query(SubscriptionProposal).filter(
            SubscriptionProposal.status == ProposalStatus.SUBMITTED, 
            SubscriptionProposal.is_archived == False
        ).count()
        
        active_narrative = db.query(MasterNarrative).filter(MasterNarrative.is_active == True).first()
        
        return {
            "active_cycle": issp_period,
            "has_active_narrative": active_narrative is not None,
            "global_ceiling": float(global_limit),
            "total_spent": float(total_spent),
            "capex_spent": float(capex_spent),
            "mooe_spent": float(mooe_spent),
            "pending_proposals_count": pending_capex + pending_mooe,
            "total_registered_users": db.query(User).count(),
            "total_catalog_items": db.query(CatalogItem).count()
        }
    except Exception as e:
        logger.error(f"Failed to generate dashboard metrics: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to load dashboard metrics."
        )

@router.get("/audit-logs", response_model=List[AuditLogEntryResponse])
def get_audit_logs(
    category: Optional[str] = Query(None, description="Filter by: budget, state, override, user"),
    start_date: Optional[datetime] = Query(None),
    end_date: Optional[datetime] = Query(None),
    db: Session = Depends(get_db), 
    admin: dict = Depends(require_admin)
):
    try:
        query = db.query(AuditTrail).options(
            joinedload(AuditTrail.user),
            joinedload(AuditTrail.proposal),
            joinedload(AuditTrail.subscription)
        )
        
        if category:
            cat_lower = category.lower().strip()
            if cat_lower == "budget":
                query = query.filter(AuditTrail.action.ilike("%budget%"))
            elif cat_lower == "state":
                query = query.filter(AuditTrail.action.ilike("%state%"))
            elif cat_lower == "override":
                query = query.filter(AuditTrail.action.ilike("%override%"))
            elif cat_lower == "user":
                query = query.filter(AuditTrail.action.ilike("%user%"))
                
        if start_date:
            query = query.filter(AuditTrail.timestamp >= start_date)
        if end_date:
            query = query.filter(AuditTrail.timestamp <= end_date)
            
        logs = query.order_by(AuditTrail.timestamp.desc()).all()
        
        # Hydrate dynamic operator attributes to keep representation details clean
        for log in logs:
            if log.user:
                log.operator_email = log.user.email
                log.operator_role = log.user.role_tag.value
            else:
                log.operator_email = "System/Cron"
                log.operator_role = "SYSTEM"
                
        return logs
    except Exception as e:
        logger.error(f"Failed to query audit trail database ledger: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to load system audit trails."
        )


# ==========================================================
# USER WHITELISTING
# ==========================================================

@router.get("/users/whitelist", response_model=List[WhitelistedUserResponse])
def get_whitelisted_users(
    db: Session = Depends(get_db), 
    admin: dict = Depends(require_admin)
):
    try:
        return db.query(User).options(joinedload(User.department)).filter(User.is_whitelisted == True).all()
    except Exception as e:
        logger.error(f"Error retrieving whitelisted users: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve whitelisted users: {str(e)}"
        )


@router.post("/users/whitelist", response_model=WhitelistedUserResponse)
def add_user_to_whitelist(
    payload: WhitelistedUserCreate, 
    db: Session = Depends(get_db), 
    admin: dict = Depends(require_admin)
):
    try:
        if payload.assigned_department_id:
            dept = db.query(Department).filter(Department.id == payload.assigned_department_id).first()
            if not dept:
                raise HTTPException(status_code=400, detail="Department does not exist.")
        
        hashed_pwd = None
        if payload.password:
            salt = bcrypt.gensalt()
            hashed_pwd = bcrypt.hashpw(payload.password.encode("utf-8"), salt).decode("utf-8")

        existing = db.query(User).filter(User.email == payload.email).first()
        if existing:
            old_role = existing.role_tag.value
            old_dept = existing.department_id
            
            existing.is_whitelisted = True
            existing.department_id = payload.assigned_department_id
            existing.role_tag = payload.role_tag
            if hashed_pwd:
                existing.password_hash = hashed_pwd
                
            audit = AuditTrail(
                action="SYSTEM_USER_WHITELIST_MODIFIED",
                user_id=admin["id"],
                old_value={"email": existing.email, "role": old_role, "department_id": old_dept},
                new_value={"email": existing.email, "role": payload.role_tag.value, "department_id": payload.assigned_department_id}
            )
            db.add(audit)
            try:
                db.commit()
                db.refresh(existing)
            except Exception as e:
                db.rollback()
                logger.error(f"Error updating existing user whitelist: {str(e)}", exc_info=True)
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail=f"Database update failure during whitelisting execution: {str(e)}"
                )
            return existing

        new_user = User(
            email=payload.email,
            role_tag=payload.role_tag,
            department_id=payload.assigned_department_id,
            is_whitelisted=True,
            password_hash=hashed_pwd
        )
        db.add(new_user)
        db.flush()
        
        audit = AuditTrail(
            action="SYSTEM_USER_WHITELISTED",
            user_id=admin["id"],
            old_value=None,
            new_value={"user_id": new_user.id, "email": new_user.email, "role": payload.role_tag.value, "department_id": payload.assigned_department_id}
        )
        db.add(audit)
        
        try:
            db.commit()
            db.refresh(new_user)
        except Exception as e:
            db.rollback()
            logger.error(f"Error creating new whitelisted user: {str(e)}", exc_info=True)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Database transaction failure during whitelisting initialization: {str(e)}"
            )
        return new_user
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unhandled error in add_user_to_whitelist: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Unhandled whitelisting failure: {str(e)}"
        )


@router.put("/users/whitelist/{user_id}", response_model=WhitelistedUserResponse)
def update_whitelisted_user(
    user_id: int,
    payload: WhitelistedUserUpdate,
    db: Session = Depends(get_db),
    admin: dict = Depends(require_admin)
):
    try:
        target_user = db.query(User).filter(User.id == user_id).first()
        if not target_user:
            raise HTTPException(status_code=404, detail="Whitelisted user not found.")

        old_state = {
            "email": target_user.email,
            "role": target_user.role_tag.value,
            "department_id": target_user.department_id
        }
        
        new_state = {}

        if payload.email is not None:
            parts = payload.email.split('@')
            if len(parts) != 2 or parts[1] != "cspc.edu.ph":
                raise HTTPException(status_code=400, detail="Email must belong to 'cspc.edu.ph' domain.")
            
            existing = db.query(User).filter(User.email == payload.email, User.id != user_id).first()
            if existing:
                raise HTTPException(status_code=400, detail="Email address is already whitelisted.")
            target_user.email = payload.email.lower()
            new_state["email"] = target_user.email

        if payload.role_tag is not None:
            target_user.role_tag = payload.role_tag
            new_state["role"] = payload.role_tag.value

        if payload.assigned_department_id is not None:
            if payload.assigned_department_id == 0:
                target_user.department_id = None
                new_state["department_id"] = None
            else:
                dept = db.query(Department).filter(Department.id == payload.assigned_department_id).first()
                if not dept:
                    raise HTTPException(status_code=400, detail="Department does not exist.")
                target_user.department_id = payload.assigned_department_id
                new_state["department_id"] = payload.assigned_department_id

        if payload.password:
            salt = bcrypt.gensalt()
            target_user.password_hash = bcrypt.hashpw(payload.password.encode("utf-8"), salt).decode("utf-8")
            new_state["password_rotated"] = True

        audit = AuditTrail(
            action="SYSTEM_USER_WHITELIST_MODIFIED",
            user_id=admin["id"],
            old_value=old_state,
            new_value=new_state
        )
        db.add(audit)
        
        db.commit()
        db.refresh(target_user)
        return target_user
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to update user ID {user_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Database failure during user update: {str(e)}")


@router.delete("/users/whitelist/{user_id}")
def delete_whitelisted_user(
    user_id: int,
    db: Session = Depends(get_db),
    admin: dict = Depends(require_admin)
):
    try:
        user_to_delete = db.query(User).filter(User.id == user_id).first()
        if not user_to_delete:
            raise HTTPException(status_code=404, detail="Whitelisted user not found.")
        
        if user_to_delete.email == admin["email"]:
            raise HTTPException(status_code=400, detail="Administrative lockout protection: You cannot delete your own session account.")

        audit = AuditTrail(
            action="SYSTEM_USER_REMOVED",
            user_id=admin["id"],
            old_value={"user_id": user_to_delete.id, "email": user_to_delete.email, "role": user_to_delete.role_tag.value},
            new_value={"event": "User account permanently removed from system whitelist."}
        )
        db.add(audit)

        db.delete(user_to_delete)
        db.commit()
        return {"status": "success", "message": "User successfully removed from system whitelist."}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to delete user ID {user_id}: {str(e)}")
        raise HTTPException(status_code=500, detail="Database failure during user deletion.")


# ==========================================================
# GOVERNANCE SETTINGS
# ==========================================================

@router.get("/governance/settings")
def get_governance_settings(
    db: Session = Depends(get_db), 
    admin: dict = Depends(require_admin)
):
    try:
        settings_list = db.query(SystemSetting).all()
        return {s.key: s.value for s in settings_list}
    except Exception as e:
        logger.error(f"Error retrieving governance settings: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to load governance settings: {str(e)}"
        )


@router.put("/governance/settings")
def update_governance_settings(
    payload: Dict[str, str], 
    db: Session = Depends(get_db), 
    admin: dict = Depends(require_admin)
):
    try:
        for key, val in payload.items():
            setting = db.query(SystemSetting).filter(SystemSetting.key == key).first()
            if setting:
                setting.value = str(val)
            else:
                new_setting = SystemSetting(key=key, value=str(val))
                db.add(new_setting)
        try:
            db.commit()
        except Exception as e:
            db.rollback()
            logger.error(f"Database error writing governance settings: {str(e)}", exc_info=True)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to persist governance setting modifications: {str(e)}"
            )
        return {"status": "success", "updated_keys": list(payload.keys())}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unhandled exception in update_governance_settings: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update governance settings: {str(e)}"
        )


# ==========================================================
# WORKFLOW TRANSITIONS
# ==========================================================

@router.put("/proposals/{proposal_id}/approve")
def approve_proposal(
    proposal_id: uuid.UUID,
    db: Session = Depends(get_db),
    admin: dict = Depends(require_admin)
):
    try:
        proposal = db.query(Proposal).filter(Proposal.id == proposal_id).first()

        if proposal:
            if proposal.status != ProposalStatus.SUBMITTED:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only submitted proposals can be approved.")

            old_status = proposal.status.value
            proposal.status = ProposalStatus.APPROVED
            proposal.version += 1

            audit = AuditTrail(
                proposal_id=proposal.id,
                action="STATE_TRANSITION_APPROVED",
                user_id=admin["id"],
                old_value={"status": old_status},
                new_value={"status": ProposalStatus.APPROVED.value}
            )
            db.add(audit)
            try:
                db.commit()
            except Exception as e:
                db.rollback()
                logger.error(f"Database commit error during proposal approval: {str(e)}", exc_info=True)
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail=f"Database transaction failure during proposal approval: {str(e)}"
                )
            return {"status": "success", "new_status": proposal.status.value}

        sub_proposal = db.query(SubscriptionProposal).filter(SubscriptionProposal.id == proposal_id).first()
        if sub_proposal:
            if sub_proposal.status != ProposalStatus.SUBMITTED:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only submitted subscription proposals can be approved.")

            old_status = sub_proposal.status.value
            sub_proposal.status = ProposalStatus.APPROVED

            audit = AuditTrail(
                subscription_id=sub_proposal.id,
                action="STATE_TRANSITION_APPROVED",
                user_id=admin["id"],
                old_value={"status": old_status},
                new_value={"status": ProposalStatus.APPROVED.value}
            )
            db.add(audit)
            try:
                db.commit()
            except Exception as e:
                db.rollback()
                logger.error(f"Database commit error during subscription approval: {str(e)}", exc_info=True)
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail=f"Database transaction failure during subscription approval: {str(e)}"
                )
            return {"status": "success", "new_status": sub_proposal.status.value}

        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Proposal not found in CapEx or MOOE tables.")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unhandled failure in approve_proposal: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Unhandled approval error occurred: {str(e)}"
        )


@router.put("/proposals/{proposal_id}/return")
def return_proposal(
    proposal_id: uuid.UUID,
    db: Session = Depends(get_db),
    admin: dict = Depends(require_admin)
):
    try:
        proposal = db.query(Proposal).filter(Proposal.id == proposal_id).first()

        if proposal:
            if proposal.status != ProposalStatus.SUBMITTED:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only submitted proposals can be returned.")

            old_status = proposal.status.value
            proposal.status = ProposalStatus.RETURNED
            proposal.version += 1

            audit = AuditTrail(
                proposal_id=proposal.id,
                action="STATE_TRANSITION_RETURNED",
                user_id=admin["id"],
                old_value={"status": old_status},
                new_value={"status": ProposalStatus.RETURNED.value}
            )
            db.add(audit)
            try:
                db.commit()
            except Exception as e:
                db.rollback()
                logger.error(f"Database commit error during proposal return: {str(e)}", exc_info=True)
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail=f"Database transaction failure during proposal return: {str(e)}"
                )
            return {"status": "success", "new_status": proposal.status.value}

        sub_proposal = db.query(SubscriptionProposal).filter(SubscriptionProposal.id == proposal_id).first()
        if sub_proposal:
            if sub_proposal.status != ProposalStatus.SUBMITTED:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only submitted subscription proposals can be returned.")

            old_status = sub_proposal.status.value
            sub_proposal.status = ProposalStatus.RETURNED

            audit = AuditTrail(
                subscription_id=sub_proposal.id,
                action="STATE_TRANSITION_RETURNED",
                user_id=admin["id"],
                old_value={"status": old_status},
                new_value={"status": ProposalStatus.RETURNED.value}
            )
            db.add(audit)
            try:
                db.commit()
            except Exception as e:
                db.rollback()
                logger.error(f"Database commit error during subscription return: {str(e)}", exc_info=True)
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail=f"Database transaction failure during subscription return: {str(e)}"
                )
            return {"status": "success", "new_status": sub_proposal.status.value}

        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Proposal not found in CapEx or MOOE tables.")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unhandled failure in return_proposal: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Unhandled return error occurred: {str(e)}"
        )


# ==========================================================
# QUEUES & OVERRIDES
# ==========================================================

@router.get("/proposals", response_model=List[ProposalResponse])  # <--- Added response_model here
def get_admin_master_queue(
    dept_id: Optional[int] = Query(None),
    status_filter: Optional[ProposalStatus] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, le=1000),
    db: Session = Depends(get_db),
    admin: dict = Depends(require_admin)
):
    try:
        query = db.query(Proposal).filter(Proposal.is_archived == False)
        
        if dept_id:
            query = query.filter(Proposal.department_id == dept_id)
        if status_filter:
            query = query.filter(Proposal.status == status_filter)
            
        return query.offset(skip).limit(limit).all()
    except Exception as e:
        logger.error(f"Error querying master proposals queue: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to query master proposals queue: {str(e)}"
        )


@router.get("/subscriptions", response_model=List[SubscriptionProposalResponse])  # <--- Added response_model here
def get_admin_subscription_queue(
    dept_id: Optional[int] = Query(None),
    status_filter: Optional[ProposalStatus] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, le=1000),
    db: Session = Depends(get_db),
    admin: dict = Depends(require_admin)
):
    try:
        query = db.query(SubscriptionProposal).filter(SubscriptionProposal.is_archived == False)
        
        if dept_id:
            query = query.filter(SubscriptionProposal.department_id == dept_id)
        if status_filter:
            query = query.filter(SubscriptionProposal.status == status_filter)
            
        return query.offset(skip).limit(limit).all()
    except Exception as e:
        logger.error(f"Error querying master subscriptions queue: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to query master subscriptions queue: {str(e)}"
        )


@router.put("/proposals/{proposal_id}/override")
def admin_override_proposal(
    proposal_id: uuid.UUID, 
    payload: AdminOverridePayload,
    db: Session = Depends(get_db),
    admin: dict = Depends(require_admin)
):
    try:
        global_setting = db.query(SystemSetting).filter(SystemSetting.key == "global_budget_ceiling").first()
        global_limit = Decimal(global_setting.value) if global_setting else settings.GLOBAL_BUDGET_CEILING

        hw_proposal = db.query(Proposal).filter(
            Proposal.id == proposal_id,
            Proposal.is_archived == False
        ).first()

        if hw_proposal:
            if hw_proposal.status != ProposalStatus.SUBMITTED:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Admin overrides can only be executed on proposals currently in Submitted status."
                )

            if payload.hardware is None:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST, 
                    detail="Payload mismatch: Hardware override parameters are missing."
                )

            old_state = {
                "item_name": hw_proposal.item_name,
                "unit_cost": str(hw_proposal.unit_cost) if hw_proposal.unit_cost is not None else "0.00",
                "yearly_quantities": hw_proposal.yearly_quantities,
                "total_qty": hw_proposal.total_qty,
                "custom_specification": hw_proposal.custom_specification,
                "target_offices_json": hw_proposal.target_offices_json,
                "project_key": hw_proposal.project_key
            }

            hw = payload.hardware
            has_changes = False

            if hw.item_name is not None and hw.item_name != hw_proposal.item_name:
                hw_proposal.item_name = html.escape(hw.item_name.strip())
                has_changes = True
            if hw.unit_cost is not None and hw.unit_cost != hw_proposal.unit_cost:
                hw_proposal.unit_cost = hw.unit_cost
                has_changes = True
            
            if hw.yearly_quantities is not None and hw.yearly_quantities != hw_proposal.yearly_quantities:
                validate_active_years_alignment(db, list(hw.yearly_quantities.keys()))
                hw_proposal.yearly_quantities = hw.yearly_quantities
                has_changes = True
                
            if hw.target_offices_json is not None and hw.target_offices_json != hw_proposal.target_offices_json:
                hw_proposal.target_offices_json = [html.escape(str(o).strip()) for o in hw.target_offices_json if o]
                has_changes = True

            if hw.project_key is not None and hw.project_key != hw_proposal.project_key:
                hw_proposal.project_key = html.escape(hw.project_key.strip()) if hw.project_key else None
                has_changes = True

            new_total_qty = sum(hw_proposal.yearly_quantities.values()) if hw_proposal.yearly_quantities else 0
            if new_total_qty != hw_proposal.total_qty:
                hw_proposal.total_qty = new_total_qty
                has_changes = True

            if hw.custom_specification is not None and hw.custom_specification != hw_proposal.custom_specification:
                hw_proposal.custom_specification = html.escape(hw.custom_specification.strip())
                has_changes = True

            if not has_changes:
                return {
                    "status": "success",
                    "message": "No override modifications detected.",
                    "proposal_id": hw_proposal.id
                }

            ceiling_cfg = db.query(BudgetCeiling).filter(
                BudgetCeiling.department_id == hw_proposal.department_id,
                BudgetCeiling.issp_period == hw_proposal.issp_period
            ).first()
            sub_ceiling = ceiling_cfg.sub_ceiling if ceiling_cfg else global_limit

            projected_capex_cost = Decimal(str(hw_proposal.unit_cost)) * Decimal(str(hw_proposal.total_qty))

            other_capex_spent = db.query(func.sum(Proposal.unit_cost * Proposal.total_qty)).filter(
                Proposal.department_id == hw_proposal.department_id,
                Proposal.status.in_([ProposalStatus.APPROVED, ProposalStatus.SUBMITTED]),
                Proposal.issp_period == hw_proposal.issp_period,
                Proposal.is_archived == False,
                Proposal.id != hw_proposal.id
            ).scalar() or Decimal("0.00")

            other_mooe_spent = db.query(func.sum(SubscriptionProposal.total_multiyear_mooe)).filter(
                SubscriptionProposal.department_id == hw_proposal.department_id,
                SubscriptionProposal.status.in_([ProposalStatus.APPROVED, ProposalStatus.SUBMITTED]),
                SubscriptionProposal.issp_period == hw_proposal.issp_period,
                SubscriptionProposal.is_archived == False
            ).scalar() or Decimal("0.00")

            total_projected_spent = other_capex_spent + projected_capex_cost + other_mooe_spent

            if total_projected_spent > sub_ceiling:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Budget Constraint Violation: Overriding this proposal would cause total expenditures "
                           f"(₱{total_projected_spent:,.2f}) to exceed the sub-ceiling of ₱{sub_ceiling:,.2f}."
                )

            hw_proposal.version += 1
            
            new_state = {
                "item_name": hw_proposal.item_name,
                "unit_cost": str(hw_proposal.unit_cost) if hw_proposal.unit_cost is not None else "0.00",
                "yearly_quantities": hw_proposal.yearly_quantities,
                "total_qty": hw_proposal.total_qty,
                "custom_specification": hw_proposal.custom_specification,
                "target_offices_json": hw_proposal.target_offices_json,
                "project_key": hw_proposal.project_key
            }

            audit = AuditTrail(
                proposal_id=hw_proposal.id,
                action="PROPOSAL_OVERRIDDEN_BY_ADMIN",
                user_id=admin["id"],
                old_value=old_state,
                new_value=new_state
            )
            db.add(audit)
            try:
                db.commit()
                db.refresh(hw_proposal)
            except Exception as e:
                db.rollback()
                logger.error(f"Database error committing hardware override: {str(e)}", exc_info=True)
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Database transaction failure during hardware override."
                )
            
            return {
                "status": "success",
                "message": "CapEx Proposal overridden successfully by Admin.",
                "proposal_id": hw_proposal.id
            }

        sub_proposal = db.query(SubscriptionProposal).filter(
            SubscriptionProposal.id == proposal_id,
            SubscriptionProposal.is_archived == False
        ).first()

        if sub_proposal:
            if sub_proposal.status != ProposalStatus.SUBMITTED:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Admin overrides can only be executed on subscription proposals currently in Submitted status."
                )

            if payload.subscription is None:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST, 
                    detail="Payload mismatch: Subscription override parameters are missing."
                )

            old_state = {
                "subscription_type": sub_proposal.subscription_type,
                "software_name": sub_proposal.software_name,
                "justification": sub_proposal.justification,
                "yearly_users": sub_proposal.yearly_users,
                "annual_cost_per_user": str(sub_proposal.annual_cost_per_user) if sub_proposal.annual_cost_per_user is not None else "0.00",
                "total_multiyear_mooe": str(sub_proposal.total_multiyear_mooe) if sub_proposal.total_multiyear_mooe is not None else "0.00",
                "target_offices_json": sub_proposal.target_offices_json,
                "project_key": sub_proposal.project_key
            }

            sub = payload.subscription
            has_changes = False

            if sub.subscription_type is not None and sub.subscription_type != sub_proposal.subscription_type:
                sub_proposal.subscription_type = html.escape(sub.subscription_type.strip())
                has_changes = True
            if sub.software_name is not None and sub.software_name != sub_proposal.software_name:
                sub_proposal.software_name = html.escape(sub.software_name.strip())
                has_changes = True
            if sub.justification is not None and sub.justification != sub_proposal.justification:
                sub_proposal.justification = html.escape(sub.justification.strip())
                has_changes = True
                
            if sub.yearly_users is not None and sub.yearly_users != sub_proposal.yearly_users:
                validate_active_years_alignment(db, list(sub.yearly_users.keys()))
                sub_proposal.yearly_users = sub.yearly_users
                has_changes = True
                
            if sub.annual_cost_per_user is not None and sub.annual_cost_per_user != sub_proposal.annual_cost_per_user:
                sub_proposal.annual_cost_per_user = sub.annual_cost_per_user
                has_changes = True
            if sub.target_offices_json is not None and sub.target_offices_json != sub_proposal.target_offices_json:
                sub_proposal.target_offices_json = [html.escape(str(o).strip()) for o in sub.target_offices_json if o]
                has_changes = True
            if sub.project_key is not None and sub.project_key != sub_proposal.project_key:
                sub_proposal.project_key = html.escape(sub.project_key.strip()) if sub.project_key else None
                has_changes = True

            total_users = sum(sub_proposal.yearly_users.values()) if sub_proposal.yearly_users else 0
            cost = sub_proposal.annual_cost_per_user if sub_proposal.annual_cost_per_user is not None else Decimal("0.00")
            new_total_mooe = Decimal(total_users) * cost

            if new_total_mooe != sub_proposal.total_multiyear_mooe:
                sub_proposal.total_multiyear_mooe = new_total_mooe
                has_changes = True

            if not has_changes:
                return {
                    "status": "success",
                    "message": "No override modifications detected.",
                    "proposal_id": sub_proposal.id
                }

            ceiling_cfg = db.query(BudgetCeiling).filter(
                BudgetCeiling.department_id == sub_proposal.department_id,
                BudgetCeiling.issp_period == sub_proposal.issp_period
            ).first()
            sub_ceiling = ceiling_cfg.sub_ceiling if ceiling_cfg else global_limit

            other_mooe_spent = db.query(func.sum(SubscriptionProposal.total_multiyear_mooe)).filter(
                SubscriptionProposal.department_id == sub_proposal.department_id,
                SubscriptionProposal.status.in_([ProposalStatus.APPROVED, ProposalStatus.SUBMITTED]),
                SubscriptionProposal.issp_period == sub_proposal.issp_period,
                SubscriptionProposal.is_archived == False,
                SubscriptionProposal.id != sub_proposal.id
            ).scalar() or Decimal("0.00")

            other_capex_spent = db.query(func.sum(Proposal.unit_cost * Proposal.total_qty)).filter(
                Proposal.department_id == sub_proposal.department_id,
                Proposal.status.in_([ProposalStatus.APPROVED, ProposalStatus.SUBMITTED]),
                Proposal.issp_period == os.environ.get("ISSP_PERIOD", sub_proposal.issp_period),
                Proposal.is_archived == False
            ).scalar() or Decimal("0.00")

            total_projected_spent = other_mooe_spent + new_total_mooe + other_capex_spent

            if total_projected_spent > sub_ceiling:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Budget Constraint Violation: Overriding this subscription would cause total expenditures "
                           f"(₱{total_projected_spent:,.2f}) to exceed the sub-ceiling of ₱{sub_ceiling:,.2f}."
                )

            new_state = {
                "subscription_type": sub_proposal.subscription_type,
                "software_name": sub_proposal.software_name,
                "justification": sub_proposal.justification,
                "yearly_users": sub_proposal.yearly_users,
                "annual_cost_per_user": str(sub_proposal.annual_cost_per_user) if sub_proposal.annual_cost_per_user is not None else "0.00",
                "total_multiyear_mooe": str(sub_proposal.total_multiyear_mooe) if sub_proposal.total_multiyear_mooe is not None else "0.00",
                "target_offices_json": sub_proposal.target_offices_json,
                "project_key": sub_proposal.project_key
            }

            audit = AuditTrail(
                subscription_id=sub_proposal.id,
                action="PROPOSAL_OVERRIDDEN_BY_ADMIN",
                user_id=admin["id"],
                old_value=old_state,
                new_value=new_state
            )
            db.add(audit)
            try:
                db.commit()
                db.refresh(sub_proposal)
            except Exception as e:
                db.rollback()
                logger.error(f"Database error committing subscription override: {str(e)}", exc_info=True)
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Database transaction failure during subscription override."
                )
            
            return {
                "status": "success",
                "message": "MOOE Subscription overridden successfully by Admin.",
                "proposal_id": sub_proposal.id
            }

        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Proposal not found in CapEx or MOOE tables.")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unhandled exception in admin_override_proposal: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Unhandled override failure: {str(e)}"
        )


# ==========================================================
# BUDGET GOVERNANCE & ALLOCATIONS
# ==========================================================

@router.get("/budget-ceilings", response_model=List[BudgetCeilingResponse])
def get_budget_ceilings(
    db: Session = Depends(get_db),
    admin: dict = Depends(require_admin)
):
    try:
        issp_period = get_active_issp_period(db)

        departments = db.query(Department).all()
        results = []

        global_setting = db.query(SystemSetting).filter(SystemSetting.key == "global_budget_ceiling").first()
        global_limit = Decimal(global_setting.value) if global_setting else settings.GLOBAL_BUDGET_CEILING
        
        ceilings_map = {
            c.department_id: c 
            for c in db.query(BudgetCeiling).filter(BudgetCeiling.issp_period == issp_period).all()
        }

        capex_spent_by_dept = dict(
            db.query(
                Proposal.department_id,
                func.sum(Proposal.unit_cost * Proposal.total_qty)
            ).filter(
                Proposal.status == ProposalStatus.APPROVED,
                Proposal.issp_period == issp_period,
                Proposal.is_archived == False
            ).group_by(Proposal.department_id).all()
        )

        mooe_spent_by_dept = dict(
            db.query(
                SubscriptionProposal.department_id,
                func.sum(SubscriptionProposal.total_multiyear_mooe)
            ).filter(
                SubscriptionProposal.status == ProposalStatus.APPROVED,
                SubscriptionProposal.issp_period == issp_period,
                SubscriptionProposal.is_archived == False
            ).group_by(SubscriptionProposal.department_id).all()
        )

        for dept in departments:
            c = ceilings_map.get(dept.id)
            sub_ceiling = c.sub_ceiling if c else Decimal("0.00")
            allocated_capex = c.allocated_capex if c else Decimal("0.00")
            allocated_mooe = c.allocated_mooe if c else Decimal("0.00")

            spent_result = capex_spent_by_dept.get(dept.id) or Decimal("0.00")
            mooe_result = mooe_spent_by_dept.get(dept.id) or Decimal("0.00")
            current_spent = Decimal(spent_result) + Decimal(mooe_result)
            
            results.append(
                BudgetCeilingResponse(
                    department_id=dept.id,
                    department_name=dept.name,
                    allocated_capex=allocated_capex,
                    allocated_mooe=allocated_mooe,
                    sub_ceiling=sub_ceiling,
                    global_ceiling=global_limit,
                    current_spent=current_spent
                )
            )
        return results
    except Exception as e:
        logger.error(f"Error querying budget ceilings dashboard: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to load budget ceilings metadata: {str(e)}"
        )


@router.post("/budget-ceilings")
def set_departmental_ceiling(
    payload: UpdateCeilingPayload,
    db: Session = Depends(get_db),
    admin: dict = Depends(require_admin)
):
    try:
        issp_period = get_active_issp_period(db)
        is_sqlite = db.bind.dialect.name == "sqlite"

        # Fix (Anomaly 26): Query and serialize the row modification lock to prevent overlapping write races
        dept_query = db.query(Department).filter(Department.id == payload.department_id)
        if not is_sqlite:
            dept_query = dept_query.with_for_update()
        dept = dept_query.first()
        if not dept:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Associated department not found."
            )

        global_query = db.query(SystemSetting).filter(SystemSetting.key == "global_budget_ceiling")
        if not is_sqlite:
            global_query = global_query.with_for_update()
        global_setting = global_query.first()
        
        global_limit = Decimal(global_setting.value) if global_setting else settings.GLOBAL_BUDGET_CEILING

        sum_other_ceilings = db.query(func.sum(BudgetCeiling.allocated_capex + BudgetCeiling.allocated_mooe)).filter(
            BudgetCeiling.department_id != payload.department_id,
            BudgetCeiling.issp_period == issp_period
        ).scalar() or Decimal("0.00")

        if sum_other_ceilings + payload.sub_ceiling > global_limit:
             raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Validation Failed: Sum of Department Sub-Ceilings exceeds the Global Budget Ceiling of PHP {global_limit:,.2f}"
             )

        existing_query = db.query(BudgetCeiling).filter(
            BudgetCeiling.department_id == payload.department_id,
            BudgetCeiling.issp_period == issp_period
        )
        if not is_sqlite:
            existing_query = existing_query.with_for_update()
        existing = existing_query.first()
        
        old_capex = existing.allocated_capex if existing else Decimal("0.00")
        old_mooe = existing.allocated_mooe if existing else Decimal("0.00")
        
        if existing:
            existing.allocated_capex = payload.allocated_capex
            existing.allocated_mooe = payload.allocated_mooe
        else:
            new_ceiling = BudgetCeiling(
                department_id=payload.department_id,
                allocated_capex=payload.allocated_capex,
                allocated_mooe=payload.allocated_mooe,
                issp_period=issp_period
            )
            db.add(new_ceiling)
        
        audit = AuditTrail(
            action="SYSTEM_BUDGET_CEILING_UPDATED",
            user_id=admin["id"],
            old_value={
                "department_id": payload.department_id,
                "allocated_capex": str(old_capex),
                "allocated_mooe": str(old_mooe)
            },
            new_value={
                "department_id": payload.department_id,
                "allocated_capex": str(payload.allocated_capex),
                "allocated_mooe": str(payload.allocated_mooe),
                "cycle": issp_period
            }
        )
        db.add(audit)
        
        try:
            db.commit()
        except Exception as e:
            db.rollback()
            logger.error(f"Database transaction failure on departmental ceiling: {str(e)}", exc_info=True)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to update departmental budget ceiling: {str(e)}"
            )
        return {"status": "success", "message": f"Sub-ceiling successfully updated to PHP {payload.sub_ceiling:,.2f}"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unhandled error in set_departmental_ceiling: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Unhandled ceiling update failure: {str(e)}"
        )


@router.post("/budget-ceilings/bulk")
def update_budget_ceilings_bulk(
    payload: BulkCeilingValidationPayload,
    db: Session = Depends(get_db),
    admin: dict = Depends(require_admin)
):
    try:
        issp_period = get_active_issp_period(db)
        is_sqlite = db.bind.dialect.name == "sqlite"

        submitted_dept_ids = {item.department_id for item in payload.sub_ceilings}
        existing_dept_count = db.query(Department).filter(Department.id.in_(submitted_dept_ids)).count()
        if existing_dept_count != len(submitted_dept_ids):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Validation Failed: One or more department IDs submitted do not exist in the database."
            )

        try:
            existing_ceilings = db.query(BudgetCeiling).filter(BudgetCeiling.issp_period == issp_period).all()
            ceilings_map = {c.department_id: c.sub_ceiling for c in existing_ceilings}

            for item in payload.sub_ceilings:
                ceilings_map[item.department_id] = item.sub_ceiling

            total_allocations = sum(ceilings_map.values())
            if total_allocations > payload.global_ceiling:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=(
                        f"Constraint Violation: Cumulative departmental sub-ceilings (₱{total_allocations:,.2f}) "
                        f"exceed the updated Global Ceiling (₱{payload.global_ceiling:,.2f})."
                    )
                )

            with db.begin_nested():
                global_setting = db.query(SystemSetting).filter(SystemSetting.key == "global_budget_ceiling").first()
                if not global_setting:
                    global_setting = SystemSetting(key="global_budget_ceiling", value=str(payload.global_ceiling))
                    db.add(global_setting)
                else:
                    global_setting.value = str(payload.global_ceiling)

                for item in payload.sub_ceilings:
                    record_query = db.query(BudgetCeiling).filter(
                        BudgetCeiling.department_id == item.department_id,
                        BudgetCeiling.issp_period == issp_period
                    )
                    # Fix (Anomaly 26): Enforce row level validation locking prior to mass modifications
                    if not is_sqlite:
                        record_query = record_query.with_for_update()
                    record = record_query.first()

                    if record:
                        record.sub_ceiling = item.sub_ceiling
                    else:
                        new_record = BudgetCeiling(
                            department_id=item.department_id,
                            issp_period=issp_period
                        )
                        new_record.sub_ceiling = item.sub_ceiling
                        db.add(new_record)
                
                # We log a single bulk audit trail entry for compactness
                audit = AuditTrail(
                    action="SYSTEM_BULK_BUDGET_CEILINGS_UPDATED",
                    user_id=admin["id"],
                    old_value={"event": "Bulk sub-ceiling allocations modified."},
                    new_value={"global_ceiling": str(payload.global_ceiling), "cycle": issp_period, "departments_updated_count": len(payload.sub_ceilings)}
                )
                db.add(audit)
                    
            db.commit()
            return {
                "status": "success",
                "message": "Bulk budget ceilings validated and updated successfully.",
                "global_ceiling": float(payload.global_ceiling),
                "allocated_departments_count": len(payload.sub_ceilings),
                "total_allocated_php": float(total_allocations)
            }
        except HTTPException:
            db.rollback()
            raise
        except Exception as e:
            db.rollback()
            logger.error(f"Failed to update budget ceilings in bulk: {str(e)}", exc_info=True)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Database transaction failure during bulk ceiling update: {str(e)}"
            )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unhandled bulk update failure: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Unhandled bulk ceiling modification error: {str(e)}"
        )


@router.post("/global-budget-ceiling")
def update_global_budget_ceiling(
    payload: UpdateGlobalCeilingPayload,
    db: Session = Depends(get_db),
    admin: dict = Depends(require_admin)
):
    try:
        issp_period = get_active_issp_period(db)
        sum_sub_ceilings = db.query(func.sum(BudgetCeiling.allocated_capex + BudgetCeiling.allocated_mooe)).filter(
            BudgetCeiling.issp_period == issp_period
        ).scalar() or Decimal("0.00")
        
        if payload.global_ceiling < sum_sub_ceilings:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"Cannot reduce overall ceiling to PHP {payload.global_ceiling:,.2f}. "
                    f"The sum of already allocated departmental sub-ceilings is PHP {sum_sub_ceilings:,.2f}."
                )
            )
        
        try:
            setting = db.query(SystemSetting).filter(SystemSetting.key == "global_budget_ceiling").first()
            old_val = setting.value if setting else "N/A"
            if not setting:
                setting = SystemSetting(key="global_budget_ceiling", value=str(payload.global_ceiling))
                db.add(setting)
            else:
                setting.value = str(payload.global_ceiling)
                
            audit = AuditTrail(
                action="SYSTEM_GLOBAL_CEILING_UPDATED",
                user_id=admin["id"],
                old_value={"global_ceiling": old_val},
                new_value={"global_ceiling": str(payload.global_ceiling)}
            )
            db.add(audit)
            db.commit()
        except Exception as e:
            db.rollback()
            logger.error(f"Database error committing global ceiling: {str(e)}", exc_info=True)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Database transaction failure during dynamic global ceiling update: {str(e)}"
            )
        
        return {
            "status": "success",
            "message": f"Institutional Global Budget Ceiling successfully updated to PHP {payload.global_ceiling:,.2f}."
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unhandled error in update_global_budget_ceiling: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Unhandled global ceiling update error: {str(e)}"
        )


@router.get("/budget-validation")
def run_pre_generation_budget_check(
    db: Session = Depends(get_db),
    admin: dict = Depends(require_admin)
):
    try:
        issp_period = get_active_issp_period(db)

        global_setting = db.query(SystemSetting).filter(SystemSetting.key == "global_budget_ceiling").first()
        global_limit = Decimal(global_setting.value) if global_setting else settings.GLOBAL_BUDGET_CEILING

        departments = db.query(Department).all()
        violations = []
        is_safe = True

        capex_spent = dict(
            db.query(
                Proposal.department_id,
                func.sum(Proposal.unit_cost * Proposal.total_qty)
            ).filter(
                Proposal.status == ProposalStatus.APPROVED,
                Proposal.issp_period == issp_period,
                Proposal.is_archived == False
            ).group_by(Proposal.department_id).all()
        )

        mooe_spent = dict(
            db.query(
                SubscriptionProposal.department_id,
                func.sum(SubscriptionProposal.total_multiyear_mooe)
            ).filter(
                SubscriptionProposal.status == ProposalStatus.APPROVED,
                SubscriptionProposal.issp_period == issp_period,
                SubscriptionProposal.is_archived == False
            ).group_by(SubscriptionProposal.department_id).all()
        )

        ceilings_map = {
            c.department_id: c.sub_ceiling 
            for c in db.query(BudgetCeiling).filter(BudgetCeiling.issp_period == issp_period).all()
        }

        for dept in departments:
            spent_result = capex_spent.get(dept.id, Decimal("0.00")) or Decimal("0.00")
            mooe_result = mooe_spent.get(dept.id, Decimal("0.00")) or Decimal("0.00")
            
            actual_spent = Decimal(spent_result) + Decimal(mooe_result)
            limit = ceilings_map.get(dept.id, global_limit)
            
            if actual_spent > limit:
                is_safe = False
                violations.append({
                    "department_id": dept.id,
                    "department_name": dept.name,
                    "allocated_sub_ceiling_php": float(limit),
                    "actual_expenditures_php": float(actual_spent),
                    "budget_overage_php": float(actual_spent - limit),
                    "status_flag": "RED_BUDGET_BREACH"
                })
                
        return {
            "validation_passed": is_safe,
            "total_violations_detected": len(violations),
            "breaches": violations,
            "message": (
                "System expenditures are fully cleared and ready for official document generation." 
                if is_safe 
                else "Departmental budget ceiling breaches detected. Please trim quantities or override item costs before generating the final ISSP."
            )
        }
    except Exception as e:
        logger.error(f"Error running pre-generation budget validation: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Budget validation process failed: {str(e)}"
        )


# ==========================================================
# ANALYTICS & MONITORING
# ==========================================================

@router.get("/department-analytics", response_model=List[DepartmentAnalyticsResponse])
def get_department_analytics(
    db: Session = Depends(get_db),
    admin: dict = Depends(require_admin)
):
    try:
        departments = db.query(Department).all()
        results = []
        settings_obj = SystemGovernanceSettings()
        
        for dept in departments:
            proposals = db.query(Proposal).filter(
                Proposal.department_id == dept.id,
                Proposal.is_archived == False
            ).all()
            
            subscriptions = db.query(SubscriptionProposal).filter(
                SubscriptionProposal.department_id == dept.id,
                SubscriptionProposal.is_archived == False
            ).all()
            
            total_count = len(proposals) + len(subscriptions)
            custom_count = 0
            missing_canvas_count = 0
            
            for p in proposals:
                if p.item_name.strip().lower() == "other":
                    custom_count += 1
                    if not p.canvas_evidence_url:
                        missing_canvas_count += 1
                        
            for s in subscriptions:
                if s.subscription_type.strip().lower() == "other":
                    custom_count += 1
                    if not s.canvas_evidence_url:
                        missing_canvas_count += 1
            
            # Fix (Anomaly 23): Safeguard division operations by verifying total counts are positive
            custom_ratio = (custom_count / total_count) if total_count > 0 else 0.0
            requires_review = custom_ratio > settings_obj.custom_request_ratio_threshold
            
            results.append(
                DepartmentAnalyticsResponse(
                    department_id=dept.id,
                    department_name=dept.name,
                    total_proposals=total_count,
                    custom_proposals=custom_count,
                    custom_ratio_percent=round(custom_ratio * 100.0, 2),
                    requires_review_abuse=requires_review,
                    missing_canvas_count=missing_canvas_count
                )
            )
            
        return results
    except Exception as e:
        logger.error(f"Error compiling department governance analytics metrics: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to load analytics datasets: {str(e)}"
        )


# ==========================================================
# GOVERNANCE & DOCUMENT COMPILATION
# ==========================================================

@router.post("/governance/generate-issp")
def trigger_document_generation(
    issp_period: str = Query("2024-2026", description="The planning period cycle to compile (e.g. 2024-2026)"),
    db: Session = Depends(get_db),
    admin: dict = Depends(require_admin)
):
    try:
        narrative = db.query(MasterNarrative).filter(MasterNarrative.issp_period == issp_period).first()
        if not narrative:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Coversheet and planning narratives for cycle '{issp_period}' have not been configured yet."
            )

        approved_capex = db.query(Proposal).filter(
            Proposal.status == ProposalStatus.APPROVED,
            Proposal.issp_period == issp_period,
            Proposal.is_archived == False
        ).all()

        approved_mooe = db.query(SubscriptionProposal).filter(
            SubscriptionProposal.status == ProposalStatus.APPROVED,
            SubscriptionProposal.issp_period == issp_period,
            SubscriptionProposal.is_archived == False
        ).all()

        cold_capex = [p for p in approved_capex if p.s3_storage_class in ["GLACIER", "DEEP_ARCHIVE"] or p.is_restoring]
        cold_mooe = [sub for sub in approved_mooe if sub.s3_storage_class in ["GLACIER", "DEEP_ARCHIVE"] or sub.is_restoring]

        if cold_capex or cold_mooe:
            cold_names = [p.item_name for p in cold_capex] + [sub.software_name for sub in cold_mooe]
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Compilation blocked: The following approved items have attachments archived in AWS S3 Glacier or are currently restoring: {', '.join(cold_names)}. "
                       "Please restore all cold assets to STANDARD storage class before generating the final ISSP document."
            )

        total_capex = sum(p.unit_cost * p.total_qty for p in approved_capex)
        total_mooe = sum(sub.total_multiyear_mooe for sub in approved_mooe)
        combined_investment = total_capex + total_mooe

        compiled_metadata = {
            "issp_id": f"ISSP-CSPC-{issp_period}-V{narrative.issp_period_from or 2024}",
            "agency_name": narrative.agency_name,
            "issp_period_years": issp_period,
            "signatory_prepared_by": narrative.signatory_prepared_by,
            "signatory_approved_by": narrative.signatory_approved_by,
            "allocated_budget": str(combined_investment),
            "total_capex": str(total_capex),
            "total_mooe": str(total_mooe)
        }

        task = compile_issp_document.delay(compiled_metadata)

        return {
            "status": "queued",
            "task_id": task.id,
            "active_cycle": issp_period,
            "total_capex_php": str(total_capex),
            "total_mooe_php": str(total_mooe),
            "combined_plan_cost_php": str(combined_investment),
            "approved_capex_count": len(approved_capex),
            "approved_mooe_count": len(approved_mooe),
            "message": "Approved departmental proposals aggregated and narrative profiles mapped. Compilation initiated."
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to queue asynchronous document compilation task: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Document generation initialization failed: {str(e)}"
        )


@router.get("/governance/task-status/{task_id}")
def get_task_status(
    task_id: str,
    admin: dict = Depends(require_admin)
):
    try:
        from celery.result import AsyncResult
        from app.celery_app import celery_app
        res = AsyncResult(task_id, app=celery_app)
        
        if res.state == "PENDING" and res.info is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Task ID is invalid, untracked, or has expired from cache."
            )

        if res.state == "PROGRESS":
            return {"state": res.state, "meta": res.info}
        elif res.state == "SUCCESS":
            return {"state": res.state, "result": res.result}
        elif res.state == "FAILURE":
            return {"state": res.state, "error": str(res.info)}
        return {"state": res.state}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to query asynchronous task status {task_id}: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to query background task state parameters: {str(e)}"
        )


# ==========================================================
# MASTER NARRATIVES & COVERSHEET MANAGER
# ==========================================================

@router.post("/narratives/{issp_period}", response_model=MasterNarrativeResponse, tags=["Admin Master Authorship"])
def save_or_update_master_narrative(
    issp_period: str,
    payload: MasterNarrativeUpdate,
    db: Session = Depends(get_db),
    admin: dict = Depends(require_admin)
):
    try:
        if payload.issp_period_from and payload.issp_period_to:
            derived_period = f"{payload.issp_period_from}-{payload.issp_period_to}"
        else:
            derived_period = issp_period

        narrative = db.query(MasterNarrative).filter(MasterNarrative.issp_period == derived_period).first()
        
        if not narrative and issp_period != derived_period:
            narrative = db.query(MasterNarrative).filter(MasterNarrative.issp_period == issp_period).first()
            if narrative:
                narrative.issp_period = derived_period
                
        if not narrative:
            narrative = MasterNarrative(
                issp_period=derived_period,
                signatory_prepared_by="Not Configured",
                signatory_approved_by="Not Configured"
            )
            db.add(narrative)
            
        data = payload.dict(exclude_unset=True)
        data.pop("template_layout_json", None)
        
        for key, value in data.items():
            setattr(narrative, key, value)
            
        try:
            db.commit()
            db.refresh(narrative)
        except Exception as e:
            db.rollback()
            logger.error(f"Database error writing master narrative text details: {str(e)}", exc_info=True)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to commit narrative authoring changes: {str(e)}"
            )
        return narrative
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unhandled error in save_or_update_master_narrative: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Unhandled narrative submission error: {str(e)}"
        )


@router.get("/narratives/{issp_period}", response_model=MasterNarrativeResponse, tags=["Admin Master Authorship"])
def get_master_narrative(
    issp_period: str,
    db: Session = Depends(get_db),
    admin: dict = Depends(require_admin)
):
    try:
        narrative = db.query(MasterNarrative).filter(MasterNarrative.issp_period == issp_period).first()
        if not narrative:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"No narrative structure found for cycle: {issp_period}")
        return narrative
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error querying master narrative metadata for cycle {issp_period}: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to load planning narrative structure: {str(e)}"
        )


@router.post("/narratives/{issp_period}/upload-diagram", tags=["Admin Master Authorship"])
async def upload_system_diagram(
    issp_period: str,
    category: str = Query(..., description="Valid Categories: agency_logo, cert_logo, org_chart, functional_interface, conceptual_framework, network_layout, existing_ict_org, proposed_ict_org, placement_ict_org, site_development_plan, fiber_backbone, system_architecture, network_topology, process_flow_diagram"),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    admin: dict = Depends(require_admin)
):
    try:
        allowed_categories = [
            "agency_logo", "cert_logo", "org_chart", "functional_interface",
            "conceptual_framework", "network_layout", "existing_ict_org",
            "proposed_ict_org", "placement_ict_org", "site_development_plan",
            "fiber_backbone", "system_architecture", "network_topology",
            "process_flow_diagram"
        ]
        if category not in allowed_categories:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid diagram category: '{category}'. Must be one of {allowed_categories}."
            )

        allowed_types = ["image/png", "image/jpeg", "image/jpg", "image/gif"]
        if file.content_type not in allowed_types:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Upload Failed: File type '{file.content_type}' is not supported. Please upload an image file (PNG/JPG)."
            )

        max_file_size = 5 * 1024 * 1024
        file_bytes = await file.read()
        if len(file_bytes) > max_file_size:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Upload Failed: Image exceeds the maximum permitted size limit of 5MB."
            )

        # Fix (Anomaly 14): Validate image and PDF layout diagrams content types using signature magic bytes
        is_valid_file = (
            file_bytes.startswith(b"\x89PNG\r\n\x1a\n") or  # PNG
            file_bytes.startswith(b"\xff\xd8\xff") or        # JPEG
            file_bytes.startswith(b"GIF8") or                # GIF
            file_bytes.startswith(b"%PDF-")                  # PDF
        )
        if not is_valid_file:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Security Violation: Invalid file format. Only PNG, JPG, or PDF documents are permitted as system diagrams."
            )

        narrative = db.query(MasterNarrative).filter(MasterNarrative.issp_period == issp_period).first()
        if not narrative:
            narrative = MasterNarrative(
                issp_period=issp_period,
                signatory_prepared_by="Not Configured",
                signatory_approved_by="Not Configured"
            )
            db.add(narrative)
            try:
                db.flush()
            except Exception as e:
                db.rollback()
                logger.error(f"Failed to create placeholder master narrative shell during diagram prep: {str(e)}", exc_info=True)
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail=f"Failed to create placeholder master narrative shell: {str(e)}"
                )

        safe_filename = secure_filename(file.filename)
        key = storage_client.get_diagram_key(category, safe_filename)
        
        success = storage_client.upload_canvas_evidence(file_bytes, key)
        if not success:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to write diagram asset to the storage layer."
            )

        download_url = storage_client.generate_download_url(key)

        if category == "agency_logo":
            narrative.agency_logo_url = download_url
        elif category == "cert_logo":
            narrative.cert_logo_url = download_url
        elif category == "org_chart":
            narrative.org_chart_url = download_url
        elif category == "functional_interface":
            narrative.functional_interface_url = download_url
        elif category == "conceptual_framework":
            narrative.conceptual_framework_url = download_url
        elif category == "network_layout":
            narrative.network_layout_url = download_url
        elif category == "existing_ict_org":
            narrative.existing_ict_org_url = download_url
        elif category == "proposed_ict_org":
            narrative.proposed_ict_org_url = download_url
        elif category == "placement_ict_org":
            narrative.placement_ict_org_url = download_url
        elif category == "site_development_plan":
            narrative.site_development_plan_url = download_url
        elif category == "fiber_backbone":
            narrative.fiber_backbone_url = download_url
        elif category == "system_architecture":
            narrative.system_architecture_url = download_url
        elif category == "network_topology":
            narrative.network_topology_url = download_url
        elif category == "process_flow_diagram":
            narrative.process_flow_diagram_url = download_url

        try:
            db.commit()
        except Exception as e:
            db.rollback()
            logger.error(f"Failed committing diagram url configuration link: {str(e)}", exc_info=True)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Database transaction failure during diagram upload tracking: {str(e)}"
            )
        return {
            "status": "success",
            "category": category,
            "issp_period": issp_period,
            "file_url": download_url
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unhandled error uploading system diagram asset: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to upload graphic diagram: {str(e)}"
        )


# ==========================================================
# BASE REFERENCE CATALOG
# ==========================================================

@router.get("/catalog", response_model=List[CatalogItemResponse])
def get_hardware_catalog(
    db: Session = Depends(get_db),
    admin: dict = Depends(require_admin)
):
    try:
        return db.query(CatalogItem).all()
    except Exception as e:
        logger.error(f"Error querying standard hardware catalog entries: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to query hardware catalog: {str(e)}"
        )


@router.post("/catalog", response_model=CatalogItemResponse)
def create_catalog_item(
    payload: CatalogItemCreate,
    db: Session = Depends(get_db),
    admin: dict = Depends(require_admin)
):
    try:
        if payload.item_key.strip().lower() == "other":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Registration Failed: The item key 'other' is a reserved namespace."
            )

        existing = db.query(CatalogItem).filter(CatalogItem.item_key == payload.item_key).first()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Catalog item with key '{payload.item_key}' already exists."
            )

        existing_name = db.query(CatalogItem).filter(
            CatalogItem.display_name == payload.display_name,
            CatalogItem.is_active == True
        ).first()
        if existing_name:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Catalog item with name '{payload.display_name}' already exists in active catalog items."
            )

        new_item = CatalogItem(
            item_key=payload.item_key,
            display_name=payload.display_name,
            standard_unit_cost=payload.standard_unit_cost,
            category=payload.category,
            is_active=payload.is_active,
            allowed_offices=payload.allowed_offices,
            canvas_evidence_url=payload.canvas_evidence_url,
            supplier_name=payload.supplier_name
        )
        db.add(new_item)
        try:
            db.commit()
            db.refresh(new_item)
        except Exception as e:
            db.rollback()
            logger.error(f"Database transaction failure writing catalog entry: {str(e)}", exc_info=True)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Database transaction failure during catalog item generation: {str(e)}"
            )
        return new_item
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unhandled error in create_catalog_item: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Unhandled catalog entry failure: {str(e)}"
        )


@router.put("/catalog/{item_id}", response_model=CatalogItemResponse)
def update_catalog_item(
    item_id: uuid.UUID,
    payload: CatalogItemUpdate,
    db: Session = Depends(get_db),
    admin: dict = Depends(require_admin)
):
    try:
        item = db.query(CatalogItem).filter(CatalogItem.id == item_id).first()
        if not item:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, 
                detail="Catalog item not found."
            )

        if payload.item_key is not None and payload.item_key != item.item_key:
            if payload.item_key.strip().lower() == "other":
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST, 
                    detail="The item key 'other' is a reserved system namespace."
                )
            existing = db.query(CatalogItem).filter(CatalogItem.item_key == payload.item_key).first()
            if existing:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST, 
                    detail=f"Catalog item with key '{payload.item_key}' already exists."
                )
            item.item_key = payload.item_key

        if payload.display_name is not None and payload.display_name != item.display_name:
            existing_name = db.query(CatalogItem).filter(
                CatalogItem.display_name == payload.display_name,
                CatalogItem.is_active == True,
                CatalogItem.id != item_id
            ).first()
            if existing_name:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST, 
                    detail=f"Catalog item with display name '{payload.display_name}' already exists as an active catalog item."
                )
            item.display_name = payload.display_name

        if payload.standard_unit_cost is not None:
            item.standard_unit_cost = payload.standard_unit_cost
        if payload.category is not None:
            item.category = payload.category
        if payload.is_active is not None:
            item.is_active = payload.is_active
        if payload.allowed_offices is not None:
            item.allowed_offices = payload.allowed_offices
        if payload.canvas_evidence_url is not None:
            item.canvas_evidence_url = payload.canvas_evidence_url
        if payload.supplier_name is not None:
            item.supplier_name = payload.supplier_name

        try:
            db.commit()
            db.refresh(item)
        except Exception as e:
            db.rollback()
            logger.error(f"Database transaction failure writing modified catalog entry: {str(e)}", exc_info=True)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Database transaction failure during catalog item update: {str(e)}"
            )
        return item
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unhandled error in update_catalog_item: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Unhandled catalog update failure: {str(e)}"
        )


# ==========================================================
# GAP 1: CAMPUS REGISTRY
# ==========================================================

@router.get("/campuses", response_model=List[CampusResponse])
def get_campuses(
    db: Session = Depends(get_db), 
    admin: dict = Depends(require_admin)
):
    try:
        return db.query(Campus).order_by(Campus.name.asc()).all()
    except Exception as e:
        logger.error(f"Failed to query campuses database: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to load campuses list.")


@router.post("/campuses", response_model=CampusResponse, status_code=status.HTTP_201_CREATED)
def create_campus(
    payload: CampusCreate, 
    db: Session = Depends(get_db), 
    admin: dict = Depends(require_admin)
):
    existing = db.query(Campus).filter(Campus.code == payload.code.upper()).first()
    if existing:
        raise HTTPException(status_code=400, detail="Campus code already registered.")
    try:
        new_campus = Campus(name=payload.name, location=payload.location, code=payload.code.upper())
        db.add(new_campus)
        db.commit()
        db.refresh(new_campus)
        return new_campus
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to create campus: {str(e)}")
        raise HTTPException(status_code=500, detail="Database failure during campus creation.")


@router.put("/campuses/{campus_id}", response_model=CampusResponse)
def update_campus(
    campus_id: int, 
    payload: CampusCreate, 
    db: Session = Depends(get_db), 
    admin: dict = Depends(require_admin)
):
    campus = db.query(Campus).filter(Campus.id == campus_id).first()
    if not campus:
        raise HTTPException(status_code=404, detail="Campus not found")
    
    existing = db.query(Campus).filter(Campus.code == payload.code.upper(), Campus.id != campus_id).first()
    if existing:
        raise HTTPException(status_code=400, detail="Campus code already registered on another campus.")
    
    try:
        campus.name = payload.name
        campus.location = payload.location
        campus.code = payload.code.upper()
        db.commit()
        db.refresh(campus)
        return campus
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to update campus ID {campus_id}: {str(e)}")
        raise HTTPException(status_code=500, detail="Database failure during campus update.")


@router.delete("/campuses/{campus_id}", status_code=status.HTTP_200_OK)
def delete_campus(
    campus_id: int, 
    db: Session = Depends(get_db), 
    admin: dict = Depends(require_admin)
):
    campus = db.query(Campus).filter(Campus.id == campus_id).first()
    if not campus:
        raise HTTPException(status_code=404, detail="Campus not found")
    try:
        db.delete(campus)
        db.commit()
        return {"status": "success", "message": "Campus successfully purged."}
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to delete campus ID {campus_id}: {str(e)}")
        raise HTTPException(status_code=500, detail="Database failure during campus deletion.")


# ==========================================================
# GAP 2: ACCREDITATION LEVEL TRACKING (Annex A-4)
# ==========================================================

@router.get("/degrees", response_model=List[DegreeOfferingResponse])
def get_degrees(
    db: Session = Depends(get_db), 
    admin: dict = Depends(require_admin)
):
    try:
        return db.query(DegreeOffering).order_by(DegreeOffering.department_name.asc()).all()
    except Exception as e:
        logger.error(f"Failed to query degree offerings database: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to load degree offerings.")


@router.post("/degrees", response_model=DegreeOfferingResponse, status_code=status.HTTP_201_CREATED)
def create_degree(
    payload: DegreeOfferingCreate, 
    db: Session = Depends(get_db), 
    admin: dict = Depends(require_admin)
):
    try:
        new_degree = DegreeOffering(
            department_name=payload.department_name,
            degree_name=payload.degree_name,
            level=payload.level,
            accreditation_status=payload.accreditation_status
        )
        db.add(new_degree)
        db.commit()
        db.refresh(new_degree)
        return new_degree
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to create degree offering: {str(e)}")
        raise HTTPException(status_code=500, detail="Database failure during degree offering registry.")


@router.put("/degrees/{degree_id}", response_model=DegreeOfferingResponse)
def update_degree(
    degree_id: int, 
    payload: DegreeOfferingCreate, 
    db: Session = Depends(get_db), 
    admin: dict = Depends(require_admin)
):
    degree = db.query(DegreeOffering).filter(DegreeOffering.id == degree_id).first()
    if not degree:
        raise HTTPException(status_code=404, detail="Degree offering record not found")
    try:
        degree.department_name = payload.department_name
        degree.degree_name = payload.degree_name
        degree.level = payload.level
        degree.accreditation_status = payload.accreditation_status
        db.commit()
        db.refresh(degree)
        return degree
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to update degree ID {degree_id}: {str(e)}")
        raise HTTPException(status_code=500, detail="Database failure during degree update.")


@router.delete("/degrees/{degree_id}", status_code=status.HTTP_200_OK)
def delete_degree(
    degree_id: int, 
    db: Session = Depends(get_db), 
    admin: dict = Depends(require_admin)
):
    degree = db.query(DegreeOffering).filter(DegreeOffering.id == degree_id).first()
    if not degree:
        raise HTTPException(status_code=404, detail="Degree offering record not found")
    try:
        db.delete(degree)
        db.commit()
        return {"status": "success", "message": "Degree offering purged successfully."}
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to delete degree ID {degree_id}: {str(e)}")
        raise HTTPException(status_code=500, detail="Database failure during degree deletion.")


# ==========================================================
# GAP 3: GAA PERFORMANCE TARGET MILESTONES (Annex A-4)
# ==========================================================

@router.get("/gaa-targets", response_model=List[GaaPerformanceResponse])
def get_gaa_targets(
    db: Session = Depends(get_db), 
    admin: dict = Depends(require_admin)
):
    try:
        return db.query(GaaPerformance).all()
    except Exception as e:
        logger.error(f"Failed to query GAA target performance indicators: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to load GAA targets.")


@router.post("/gaa-targets", response_model=GaaPerformanceResponse, status_code=status.HTTP_201_CREATED)
def create_gaa_target(
    payload: GaaPerformanceCreate, 
    db: Session = Depends(get_db), 
    admin: dict = Depends(require_admin)
):
    try:
        new_target = GaaPerformance(indicator_name=payload.indicator_name, target_value=payload.target_value)
        db.add(new_target)
        db.commit()
        db.refresh(new_target)
        return new_target
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to create GAA target performance record: {str(e)}")
        raise HTTPException(status_code=500, detail="Database failure during GAA indicator setup.")


@router.put("/gaa-targets/{target_id}", response_model=GaaPerformanceResponse)
def update_gaa_target(
    target_id: int, 
    payload: GaaPerformanceCreate, 
    db: Session = Depends(get_db), 
    admin: dict = Depends(require_admin)
):
    target = db.query(GaaPerformance).filter(GaaPerformance.id == target_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="GAA target metric not found")
    try:
        target.indicator_name = payload.indicator_name
        target.target_value = payload.target_value
        db.commit()
        db.refresh(target)
        return target
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to update GAA indicator ID {target_id}: {str(e)}")
        raise HTTPException(status_code=500, detail="Database failure during GAA indicator update.")


@router.delete("/gaa-targets/{target_id}", status_code=status.HTTP_200_OK)
def delete_gaa_target(
    target_id: int, 
    db: Session = Depends(get_db), 
    admin: dict = Depends(require_admin)
):
    target = db.query(GaaPerformance).filter(GaaPerformance.id == target_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="GAA target metric not found")
    try:
        db.delete(target)
        db.commit()
        return {"status": "success", "message": "GAA Metric removed."}
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to delete GAA indicator ID {target_id}: {str(e)}")
        raise HTTPException(status_code=500, detail="Database failure during GAA indicator removal.")


# ==========================================================
# GAP 4: STRATEGIC CONCERNS MATRIX (Table I.E)
# ==========================================================

@router.get("/narratives/{issp_period}/concerns", response_model=List[StrategicConcernResponse])
def get_strategic_concerns(
    issp_period: str, 
    db: Session = Depends(get_db), 
    admin: dict = Depends(require_admin)
):
    try:
        return db.query(StrategicConcern).filter(StrategicConcern.issp_period == issp_period).all()
    except Exception as e:
        logger.error(f"Failed to query strategic concerns database: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to load strategic concerns.")


@router.post("/narratives/{issp_period}/concerns", response_model=StrategicConcernResponse, status_code=status.HTTP_201_CREATED)
def create_strategic_concern(
    issp_period: str, 
    payload: StrategicConcernCreate, 
    db: Session = Depends(get_db), 
    admin: dict = Depends(require_admin)
):
    narrative = db.query(MasterNarrative).filter(MasterNarrative.issp_period == issp_period).first()
    if not narrative:
         raise HTTPException(status_code=404, detail="Planning period narrative not found.")
    try:
        new_concern = StrategicConcern(
            issp_period=issp_period,
            mfo=payload.mfo,
            critical_system=payload.critical_system,
            problems=payload.problems,
            intended_use=payload.intended_use
        )
        db.add(new_concern)
        db.commit()
        db.refresh(new_concern)
        return new_concern
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to register strategic concern: {str(e)}")
        raise HTTPException(status_code=500, detail="Database failure during strategic concern entry creation.")


@router.put("/concerns/{concern_id}", response_model=StrategicConcernResponse)
def update_strategic_concern(
    concern_id: uuid.UUID, 
    payload: StrategicConcernCreate, 
    db: Session = Depends(get_db), 
    admin: dict = Depends(require_admin)
):
    concern = db.query(StrategicConcern).filter(StrategicConcern.id == concern_id).first()
    if not concern:
        raise HTTPException(status_code=404, detail="Strategic concern record not found")
    try:
        concern.mfo = payload.mfo
        concern.critical_system = payload.critical_system
        concern.problems = payload.problems
        concern.intended_use = payload.intended_use
        db.commit()
        db.refresh(concern)
        return concern
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to update concern ID {concern_id}: {str(e)}")
        raise HTTPException(status_code=500, detail="Database failure during concern update.")


@router.delete("/concerns/{concern_id}", status_code=status.HTTP_200_OK)
def delete_strategic_concern(
    concern_id: uuid.UUID, 
    db: Session = Depends(get_db), 
    admin: dict = Depends(require_admin)
):
    concern = db.query(StrategicConcern).filter(StrategicConcern.id == concern_id).first()
    if not concern:
        raise HTTPException(status_code=404, detail="Strategic concern record not found")
    try:
        db.delete(concern)
        db.commit()
        return {"status": "success", "message": "Strategic concern metric successfully removed."}
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to delete concern ID {concern_id}: {str(e)}")
        raise HTTPException(status_code=500, detail="Database failure during concern deletion.")


# ==========================================================
# GAP 19: CORE OFFICES DIRECTORY (Annex A-3)
# ==========================================================

@router.get("/narratives/{issp_period}/offices", response_model=List[CoreOfficeFunctionResponse])
def get_office_functions(
    issp_period: str, 
    db: Session = Depends(get_db), 
    admin: dict = Depends(require_admin)
):
    try:
        return db.query(CoreOfficeFunction).filter(CoreOfficeFunction.issp_period == issp_period).order_by(CoreOfficeFunction.office_name.asc()).all()
    except Exception as e:
        logger.error(f"Failed to query core office functions: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to load core office functions.")


@router.post("/narratives/{issp_period}/offices", response_model=CoreOfficeFunctionResponse, status_code=status.HTTP_201_CREATED)
def create_office_function(
    issp_period: str, 
    payload: CoreOfficeFunctionCreate, 
    db: Session = Depends(get_db), 
    admin: dict = Depends(require_admin)
):
    narrative = db.query(MasterNarrative).filter(MasterNarrative.issp_period == issp_period).first()
    if not narrative:
         raise HTTPException(status_code=404, detail="Planning period narrative not found.")
    try:
        new_office = CoreOfficeFunction(
            issp_period=issp_period,
            office_name=payload.office_name,
            division=payload.division,
            description=payload.description
        )
        db.add(new_office)
        db.commit()
        db.refresh(new_office)
        return new_office
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to record office details: {str(e)}")
        raise HTTPException(status_code=500, detail="Database failure during core office profile registry.")


@router.put("/offices/{office_id}", response_model=CoreOfficeFunctionResponse)
def update_office_function(
    office_id: int, 
    payload: CoreOfficeFunctionCreate, 
    db: Session = Depends(get_db), 
    admin: dict = Depends(require_admin)
):
    office = db.query(CoreOfficeFunction).filter(CoreOfficeFunction.id == office_id).first()
    if not office:
        raise HTTPException(status_code=404, detail="Office record not found")
    try:
        office.office_name = payload.office_name
        office.division = payload.division
        office.description = payload.description
        db.commit()
        db.refresh(office)
        return office
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to update office ID {office_id}: {str(e)}")
        raise HTTPException(status_code=500, detail="Database failure during core office details updates.")


@router.delete("/offices/{office_id}", status_code=status.HTTP_200_OK)
def delete_office_function(
    office_id: int, 
    db: Session = Depends(get_db), 
    admin: dict = Depends(require_admin)
):
    office = db.query(CoreOfficeFunction).filter(CoreOfficeFunction.id == office_id).first()
    if not office:
        raise HTTPException(status_code=404, detail="Office record not found")
    try:
        db.delete(office)
        db.commit()
        return {"status": "success", "message": "Office record purged."}
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to delete office ID {office_id}: {str(e)}")
        raise HTTPException(status_code=500, detail="Database failure during office deletion.")


# ==========================================================
# GAP 7: GLOSSARY TERMS & DEFINITIONS (Pages 6-10)
# ==========================================================

@router.get("/glossary", response_model=List[GlossaryTermResponse])
def get_glossary(
    db: Session = Depends(get_db), 
    admin: dict = Depends(require_admin)
):
    try:
        return db.query(GlossaryTerm).order_by(GlossaryTerm.term.asc()).all()
    except Exception as e:
        logger.error(f"Failed to query glossary terms: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to load glossary dictionary.")


@router.post("/glossary", response_model=GlossaryTermResponse, status_code=status.HTTP_201_CREATED)
def create_glossary_term(
    payload: GlossaryTermCreate, 
    db: Session = Depends(get_db), 
    admin: dict = Depends(require_admin)
):
    existing = db.query(GlossaryTerm).filter(GlossaryTerm.term == payload.term).first()
    if existing:
        raise HTTPException(status_code=400, detail="Glossary term already registered.")
    try:
        new_term = GlossaryTerm(term=payload.term, definition=payload.definition)
        db.add(new_term)
        db.commit()
        db.refresh(new_term)
        return new_term
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to record glossary term: {str(e)}")
        raise HTTPException(status_code=500, detail="Database failure during glossary key setup.")


@router.put("/glossary/{term_id}", response_model=GlossaryTermResponse)
def update_glossary_term(
    term_id: int, 
    payload: GlossaryTermCreate, 
    db: Session = Depends(get_db), 
    admin: dict = Depends(require_admin)
):
    term = db.query(GlossaryTerm).filter(GlossaryTerm.id == term_id).first()
    if not term:
        raise HTTPException(status_code=404, detail="Glossary term not found")
    try:
        term.term = payload.term
        term.definition = payload.definition
        db.commit()
        db.refresh(term)
        return term
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to update glossary term ID {term_id}: {str(e)}")
        raise HTTPException(status_code=500, detail="Database failure during term update.")


@router.delete("/glossary/{term_id}", status_code=status.HTTP_200_OK)
def delete_glossary_term(
    term_id: int, 
    db: Session = Depends(get_db), 
    admin: dict = Depends(require_admin)
):
    term = db.query(GlossaryTerm).filter(GlossaryTerm.id == term_id).first()
    if not term:
        raise HTTPException(status_code=404, detail="Glossary term not found")
    try:
        db.delete(term)
        db.commit()
        return {"status": "success", "message": "Glossary term successfully removed."}
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to delete glossary term ID {term_id}: {str(e)}")
        raise HTTPException(status_code=500, detail="Database failure during glossary term deletion.")


# ==========================================================
# GAP 8: GENERAL SUBMISSION INSTRUCTIONS (Page 11)
# ==========================================================

@router.get("/instructions", response_model=List[GeneralInstructionResponse])
def get_instructions(
    db: Session = Depends(get_db), 
    admin: dict = Depends(require_admin)
):
    try:
        return db.query(GeneralInstruction).order_by(GeneralInstruction.step_number.asc()).all()
    except Exception as e:
        logger.error(f"Failed to query general instructions: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to load instructions registry.")


@router.post("/instructions", response_model=GeneralInstructionResponse, status_code=status.HTTP_201_CREATED)
def create_instruction(
    payload: GeneralInstructionCreate, 
    db: Session = Depends(get_db), 
    admin: dict = Depends(require_admin)
):
    existing = db.query(GeneralInstruction).filter(GeneralInstruction.step_number == payload.step_number).first()
    if existing:
        raise HTTPException(status_code=400, detail="Instruction step number already taken.")
    try:
        new_inst = GeneralInstruction(step_number=payload.step_number, instruction_text=payload.instruction_text)
        db.add(new_inst)
        db.commit()
        db.refresh(new_inst)
        return new_inst
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to record instruction guideline: {str(e)}")
        raise HTTPException(status_code=500, detail="Database failure during instruction step registration.")


@router.put("/instructions/{inst_id}", response_model=GeneralInstructionResponse)
def update_instruction(
    inst_id: int, 
    payload: GeneralInstructionCreate, 
    db: Session = Depends(get_db), 
    admin: dict = Depends(require_admin)
):
    inst = db.query(GeneralInstruction).filter(GeneralInstruction.id == inst_id).first()
    if not inst:
        raise HTTPException(status_code=404, detail="Instruction step not found")
    try:
        inst.step_number = payload.step_number
        inst.instruction_text = payload.instruction_text
        db.commit()
        db.refresh(inst)
        return inst
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to update instruction ID {inst_id}: {str(e)}")
        raise HTTPException(status_code=500, detail="Database failure during instruction update.")


@router.delete("/instructions/{inst_id}", status_code=status.HTTP_200_OK)
def delete_instruction(
    inst_id: int, 
    db: Session = Depends(get_db), 
    admin: dict = Depends(require_admin)
):
    inst = db.query(GeneralInstruction).filter(GeneralInstruction.id == inst_id).first()
    if not inst:
        raise HTTPException(status_code=404, detail="Instruction step not found")
    try:
        db.delete(inst)
        db.commit()
        return {"status": "success", "message": "Instruction step removed."}
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to delete instruction ID {inst_id}: {str(e)}")
        raise HTTPException(status_code=500, detail="Database failure during instruction step delete.")


# ==========================================================
# GAP 15: HDD SERVER STORAGE CAPACITY SURVEYS (Annex A-1)
# ==========================================================

@router.get("/server-capacities", response_model=List[ServerCapacityResponse])
def get_server_capacities(
    db: Session = Depends(get_db), 
    admin: dict = Depends(require_admin)
):
    try:
        return db.query(ServerCapacityTrack).all()
    except Exception as e:
        logger.error(f"Failed to query server capacity tracking: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to load server capacity tracking metrics.")


@router.post("/server-capacities", response_model=ServerCapacityResponse, status_code=status.HTTP_201_CREATED)
def create_server_capacity(
    payload: ServerCapacityCreate, 
    db: Session = Depends(get_db), 
    admin: dict = Depends(require_admin)
):
    try:
        new_capacity = ServerCapacityTrack(
            campus_id=payload.campus_id,
            capacity_tier=payload.capacity_tier,
            location=payload.location,
            quantity=payload.quantity
        )
        db.add(new_capacity)
        db.commit()
        db.refresh(new_capacity)
        return new_capacity
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to record server capacity track: {str(e)}")
        raise HTTPException(status_code=500, detail="Database failure during server capacity profile setup.")


@router.delete("/server-capacities/{capacity_id}", status_code=status.HTTP_200_OK)
def delete_server_capacity(
    capacity_id: uuid.UUID, 
    db: Session = Depends(get_db), 
    admin: dict = Depends(require_admin)
):
    record = db.query(ServerCapacityTrack).filter(ServerCapacityTrack.id == capacity_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Record not found")
    try:
        db.delete(record)
        db.commit()
        return {"status": "success", "message": "Server capacity metrics records purged."}
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to delete server capacity track ID {capacity_id}: {str(e)}")
        raise HTTPException(status_code=500, detail="Database failure during server capacity delete.")


# ==========================================================
# GAP 16: OPERATING SYSTEMS LICENSE CENSUS (Section 2.1)
# ==========================================================

@router.get("/os-census", response_model=List[ClientOsCensusResponse])
def get_os_census(
    db: Session = Depends(get_db), 
    admin: dict = Depends(require_admin)
):
    try:
        return db.query(ClientOsCensus).order_by(ClientOsCensus.os_name.asc()).all()
    except Exception as e:
        logger.error(f"Failed to query client OS census: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to load OS platform census data.")


@router.post("/os-census", response_model=ClientOsCensusResponse, status_code=status.HTTP_201_CREATED)
def create_os_census_record(
    payload: ClientOsCensusCreate, 
    db: Session = Depends(get_db), 
    admin: dict = Depends(require_admin)
):
    existing = db.query(ClientOsCensus).filter(ClientOsCensus.os_name == payload.os_name).first()
    if existing:
        raise HTTPException(status_code=400, detail="OS name already registered in census.")
    try:
        new_record = ClientOsCensus(
            os_name=payload.os_name,
            workstations_count=payload.workstations_count,
            servers_count=payload.servers_count
        )
        db.add(new_record)
        db.commit()
        db.refresh(new_record)
        return new_record
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to log operating system census data: {str(e)}")
        raise HTTPException(status_code=500, detail="Database failure during client OS registry setup.")


@router.put("/os-census/{census_id}", response_model=ClientOsCensusResponse)
def update_os_census_record(
    census_id: int, 
    payload: ClientOsCensusCreate, 
    db: Session = Depends(get_db), 
    admin: dict = Depends(require_admin)
):
    record = db.query(ClientOsCensus).filter(ClientOsCensus.id == census_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Census record not found")
    try:
        record.os_name = payload.os_name
        record.workstations_count = payload.workstations_count
        record.servers_count = payload.servers_count
        db.commit()
        db.refresh(record)
        return record
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to update OS census ID {census_id}: {str(e)}")
        raise HTTPException(status_code=500, detail="Database failure during OS census updates.")


@router.delete("/os-census/{census_id}", status_code=status.HTTP_200_OK)
def delete_os_census_record(
    census_id: int, 
    db: Session = Depends(get_db), 
    admin: dict = Depends(require_admin)
):
    record = db.query(ClientOsCensus).filter(ClientOsCensus.id == census_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Census record not found")
    try:
        db.delete(record)
        db.commit()
        return {"status": "success", "message": "Census record removed."}
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to delete OS census ID {census_id}: {str(e)}")
        raise HTTPException(status_code=500, detail="Database failure during OS census delete.")


# ==========================================================
# GAP 17: OFFICE AUTOMATION SOFTWARE CENSUS (Section 2.2)
# ==========================================================

@router.get("/software-census", response_model=List[OfficeSoftwareResponse])
def get_software_census(
    db: Session = Depends(get_db), 
    admin: dict = Depends(require_admin)
):
    try:
        return db.query(OfficeSoftwareCensus).order_by(OfficeSoftwareCensus.software_name.asc()).all()
    except Exception as e:
        logger.error(f"Failed to query office software census: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to load office software census profiles.")


@router.post("/software-census", response_model=OfficeSoftwareResponse, status_code=status.HTTP_201_CREATED)
def create_software_census(
    payload: OfficeSoftwareCreate, 
    db: Session = Depends(get_db), 
    admin: dict = Depends(require_admin)
):
    existing = db.query(OfficeSoftwareCensus).filter(OfficeSoftwareCensus.software_name == payload.software_name).first()
    if existing:
        raise HTTPException(status_code=400, detail="Software name already registered in census.")
    try:
        new_rec = OfficeSoftwareCensus(software_name=payload.software_name, license_count=payload.license_count)
        db.add(new_rec)
        db.commit()
        db.refresh(new_rec)
        return new_rec
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to log software licenses parameters: {str(e)}")
        raise HTTPException(status_code=500, detail="Database failure during software census setup.")


@router.delete("/software-census/{census_id}", status_code=status.HTTP_200_OK)
def delete_software_census(
    census_id: int, 
    db: Session = Depends(get_db), 
    admin: dict = Depends(require_admin)
):
    record = db.query(OfficeSoftwareCensus).filter(OfficeSoftwareCensus.id == census_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Record not found")
    try:
        db.delete(record)
        db.commit()
        return {"status": "success", "message": "Record removed successfully."}
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to delete software census ID {census_id}: {str(e)}")
        raise HTTPException(status_code=500, detail="Database failure during software census delete.")


# ==========================================================
# GAP 24: CROSS-AGENCY COLLABORATIVE PROJECTS (Part III.B)
# ==========================================================

@router.get("/narratives/{issp_period}/cross-projects", response_model=List[CrossAgencyProjectResponse])
def get_cross_projects(
    issp_period: str, 
    db: Session = Depends(get_db), 
    admin: dict = Depends(require_admin)
):
    try:
        return db.query(CrossAgencyProject).filter(CrossAgencyProject.issp_period == issp_period).all()
    except Exception as e:
        logger.error(f"Failed to query cross agency collaborative projects: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to load cooperative projects.")


@router.post("/narratives/{issp_period}/cross-projects", response_model=CrossAgencyProjectResponse, status_code=status.HTTP_201_CREATED)
def create_cross_project(
    issp_period: str, 
    payload: CrossAgencyProjectCreate, 
    db: Session = Depends(get_db), 
    admin: dict = Depends(require_admin)
):
    narrative = db.query(MasterNarrative).filter(MasterNarrative.issp_period == issp_period).first()
    if not narrative:
         raise HTTPException(status_code=404, detail="Planning period narrative not found.")
    try:
        new_proj = CrossAgencyProject(
            issp_period=issp_period,
            name=payload.name,
            objectives=payload.objectives,
            duration=payload.duration,
            deliverables=payload.deliverables,
            lead_agency=payload.lead_agency,
            implementing_agencies=payload.implementing_agencies
        )
        db.add(new_proj)
        db.commit()
        db.refresh(new_proj)
        return new_proj
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to index cross agency project: {str(e)}")
        raise HTTPException(status_code=500, detail="Database failure during joint project registry.")


@router.delete("/cross-projects/{project_id}", status_code=status.HTTP_200_OK)
def delete_cross_project(
    project_id: uuid.UUID, 
    db: Session = Depends(get_db), 
    admin: dict = Depends(require_admin)
):
    record = db.query(CrossAgencyProject).filter(CrossAgencyProject.id == project_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Project not found")
    try:
        db.delete(record)
        db.commit()
        return {"status": "success", "message": "Project deleted."}
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to delete collaborative project ID {project_id}: {str(e)}")
        raise HTTPException(status_code=500, detail="Database failure during project profiles delete.")


# ==========================================================
# GAP 25: PERFORMANCE MEASUREMENT FRAMEWORK (PMF) (Part III.C)
# ==========================================================

@router.get("/narratives/{issp_period}/metrics", response_model=List[PerformanceMetricResponse])
def get_performance_metrics(
    issp_period: str, 
    db: Session = Depends(get_db), 
    admin: dict = Depends(require_admin)
):
    try:
        return db.query(PerformanceMetric).filter(PerformanceMetric.issp_period == issp_period).all()
    except Exception as e:
        logger.error(f"Failed to query performance metrics: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to load performance metrics.")


@router.post("/narratives/{issp_period}/metrics", response_model=PerformanceMetricResponse, status_code=status.HTTP_201_CREATED)
def create_performance_metric(
    issp_period: str, 
    payload: PerformanceMetricCreate, 
    db: Session = Depends(get_db), 
    admin: dict = Depends(require_admin)
):
    narrative = db.query(MasterNarrative).filter(MasterNarrative.issp_period == issp_period).first()
    if not narrative:
         raise HTTPException(status_code=404, detail="Planning period narrative not found.")
    try:
        new_metric = PerformanceMetric(
            issp_period=issp_period,
            project_title=payload.project_title,
            result_hierarchy=payload.result_hierarchy,
            indicator=payload.indicator,
            baseline=payload.baseline,
            target=payload.target,
            collection_method=payload.collection_method,
            responsibility=payload.responsibility
        )
        db.add(new_metric)
        db.commit()
        db.refresh(new_metric)
        return new_metric
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to append performance framework metrics: {str(e)}")
        raise HTTPException(status_code=500, detail="Database failure during milestone creation.")


@router.delete("/metrics/{metric_id}", status_code=status.HTTP_200_OK)
def delete_performance_metric(
    metric_id: uuid.UUID, 
    db: Session = Depends(get_db), 
    admin: dict = Depends(require_admin)
):
    record = db.query(PerformanceMetric).filter(PerformanceMetric.id == metric_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Metric not found")
    try:
        db.delete(record)
        db.commit()
        return {"status": "success", "message": "Metric removed."}
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to delete performance metric ID {metric_id}: {str(e)}")
        raise HTTPException(status_code=500, detail="Database failure during performance framework delete.")


# ==========================================================
# GAP 11 & 12: ANNUAL COST BREAKDOWN MATRIX (Part V.D / Annex A-5)
# ==========================================================

@router.get("/narratives/{issp_period}/costs", response_model=List[AnnualCostBreakdownResponse])
def get_annual_costs(
    issp_period: str, 
    db: Session = Depends(get_db), 
    admin: dict = Depends(require_admin)
):
    try:
        return db.query(AnnualCostBreakdown).filter(AnnualCostBreakdown.issp_period == issp_period).all()
    except Exception as e:
        logger.error(f"Failed to query cost breakdown registry: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to load cost matrices.")


@router.post("/narratives/{issp_period}/costs", response_model=AnnualCostBreakdownResponse, status_code=status.HTTP_201_CREATED)
def create_annual_cost(
    issp_period: str, 
    payload: AnnualCostBreakdownCreate, 
    db: Session = Depends(get_db), 
    admin: dict = Depends(require_admin)
):
    narrative = db.query(MasterNarrative).filter(MasterNarrative.issp_period == issp_period).first()
    if not narrative:
         raise HTTPException(status_code=404, detail="Planning period narrative not found.")
    try:
        new_cost = AnnualCostBreakdown(
            issp_period=issp_period,
            project_key=payload.project_key,
            cost_type=payload.cost_type,
            item_description=payload.item_description,
            unit_cost=payload.unit_cost,
            yearly_quantities=payload.yearly_quantities
        )
        db.add(new_cost)
        db.commit()
        db.refresh(new_cost)
        return new_cost
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to record annual cost matrix details: {str(e)}")
        raise HTTPException(status_code=500, detail="Database failure during cost breakdown registration.")


@router.delete("/costs/{cost_id}", status_code=status.HTTP_200_OK)
def delete_annual_cost(
    cost_id: uuid.UUID, 
    db: Session = Depends(get_db), 
    admin: dict = Depends(require_admin)
):
    record = db.query(AnnualCostBreakdown).filter(AnnualCostBreakdown.id == cost_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Record not found")
    try:
        db.delete(record)
        db.commit()
        return {"status": "success", "message": "Cost record removed."}
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to delete cost metric ID {cost_id}: {str(e)}")
        raise HTTPException(status_code=500, detail="Database failure during budget breakdown delete.")


# ==========================================================
# GAP 18: RELATIONAL STAFFING SYSTEM (Staff Registry)
# ==========================================================

@router.get("/narratives/{issp_period}/staff-positions", response_model=List[IctStaffPositionResponse])
def get_staff_positions(
    issp_period: str,
    db: Session = Depends(get_db),
    admin: dict = Depends(require_admin)
):
    try:
        return db.query(IctStaffPosition).filter(IctStaffPosition.issp_period == issp_period).all()
    except Exception as e:
        logger.error(f"Failed to query IT staff positions: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to load IT staff positions.")


@router.post("/narratives/{issp_period}/staff-positions", response_model=IctStaffPositionResponse, status_code=status.HTTP_201_CREATED)
def create_staff_position(
    issp_period: str,
    payload: IctStaffPositionCreate,
    db: Session = Depends(get_db),
    admin: dict = Depends(require_admin)
):
    narrative = db.query(MasterNarrative).filter(MasterNarrative.issp_period == issp_period).first()
    if not narrative:
        raise HTTPException(status_code=404, detail="Planning period narrative not found.")
    try:
        new_position = IctStaffPosition(
            issp_period=issp_period,
            position_title=payload.position_title,
            status=payload.status,
            count=payload.count
        )
        db.add(new_position)
        db.commit()
        db.refresh(new_position)
        return new_position
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to record staff position: {str(e)}")
        raise HTTPException(status_code=500, detail="Database failure during staff position creation.")


@router.put("/staff-positions/{position_id}", response_model=IctStaffPositionResponse)
def update_staff_position(
    position_id: uuid.UUID,
    payload: IctStaffPositionCreate,
    db: Session = Depends(get_db),
    admin: dict = Depends(require_admin)
):
    position = db.query(IctStaffPosition).filter(IctStaffPosition.id == position_id).first()
    if not position:
        raise HTTPException(status_code=404, detail="Staff position record not found")
    try:
        position.position_title = payload.position_title
        position.status = payload.status
        position.count = payload.count
        db.commit()
        db.refresh(position)
        return position
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to update staff position ID {position_id}: {str(e)}")
        raise HTTPException(status_code=500, detail="Database failure during staff position update.")


@router.delete("/staff-positions/{position_id}", status_code=status.HTTP_200_OK)
def delete_staff_position(
    position_id: uuid.UUID,
    db: Session = Depends(get_db),
    admin: dict = Depends(require_admin)
):
    position = db.query(IctStaffPosition).filter(IctStaffPosition.id == position_id).first()
    if not position:
        raise HTTPException(status_code=404, detail="Staff position record not found")
    try:
        db.delete(position)
        db.commit()
        return {"status": "success", "message": "Staff position purged successfully."}
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to delete staff position ID {position_id}: {str(e)}")
        raise HTTPException(status_code=500, detail="Database failure during staff position deletion.")
