# app/admin/router.py
import os
import io
import csv
import html
import uuid
import json
import logging
import threading
import time
import inspect
from decimal import Decimal
from datetime import datetime, timezone
from typing import List, Optional, Dict, Any, Union

from fastapi import (
    APIRouter, 
    Depends, 
    HTTPException, 
    status, 
    Query, 
    UploadFile, 
    File, 
    Form, 
    Request
)
from fastapi.responses import StreamingResponse
from sqlalchemy import func, or_, and_, String, cast, text
from sqlalchemy.orm import Session, joinedload, selectinload
from pydantic import BaseModel, Field
import bcrypt

from app.config import settings
from app.database.session import get_db, SessionLocal
from app.services.issp_engine import ISSPSingularityEngine
from app.services.lifecycle_service import ISSPLifecycleEngine
from app.database.models import (
    Proposal,
    ResourceRequirementItem,
    BudgetCeiling,
    ProposalStatus,
    ProposalCategory,
    ProjectCategory,
    ExpenditureClass,
    FundSource,
    OfficeLocation,
    UacsObjectCode,
    StrategicCategory,
    UacsCatalogItem,
    SystemTaxonomy,
    SystemClassification,
    SystemHostingType,
    DevelopmentStrategy,
    SystemStatus,
    SystemDevelopmentStatus,
    OrganizationalOutcome,
    AuditTrail,
    Department,
    MasterNarrative,
    CatalogItem,
    SystemSetting,
    User,
    StrategicConcern,
    NeedsAssessment,
    InformationSystem,
    IctProject,
    NetworkInfrastructure,
    CybersecurityControl,
    GlossaryTerm,
    GeneralInstruction,
    CrossAgencyProject,
    PerformanceMetric,
    IctStaffPosition,
    HumanCapital,
    StakeholderAnalysis,
    EGovernmentChecklist,
    DisasterRecoveryTeam,
    BusinessImpactAnalysis,
    DRBCPMetric,
    ExistingInventory,
    RoleTag,
    ScopeChoice,
    DynamicChecklistCriteria
)
from app.schemas import (
    AdminOverridePayload,
    BudgetCeilingResponse,
    UpdateCeilingPayload,
    UpdateGlobalCeilingPayload,
    DepartmentAnalyticsResponse,
    MasterNarrativeUpdate,
    MasterNarrativeResponse,
    LifecycleRolloverResponse,
    SystemGovernanceSettings,
    CatalogItemCreate, 
    CatalogItemUpdate, 
    CatalogItemResponse,
    ProposalCreatePayload,
    ProposalResponse,
    WhitelistedUserCreate,
    WhitelistedUserUpdate,
    WhitelistedUserResponse,
    AuditLogEntryResponse,
    StrategicConcernCreate,
    StrategicConcernResponse,
    NeedsAssessmentResponse,
    AggregateNeedsAssessmentPayload,
    InformationSystemCreate,
    InformationSystemUpdate,
    InformationSystemResponse,
    IctProjectCreate,
    IctProjectUpdate,
    IctProjectResponse,
    PerformanceMetricCreate,
    PerformanceMetricResponse,
    PartIVBParityResponse,
    NetworkInfrastructureCreate,
    NetworkInfrastructureResponse,
    CybersecurityControlCreate,
    CybersecurityControlResponse,
    GlossaryTermCreate,
    GlossaryTermResponse,
    GeneralInstructionCreate,
    GeneralInstructionResponse,
    CrossAgencyProjectCreate,
    CrossAgencyProjectResponse,
    IctStaffPositionCreate,
    IctStaffPositionResponse,
    OrganizationalOutcomeCreate,
    OrganizationalOutcomeResponse,
    HumanCapitalCreate,
    HumanCapitalResponse,
    StakeholderAnalysisCreate,
    StakeholderAnalysisUpdate,
    StakeholderAnalysisResponse,
    EGovernmentChecklistCreate,
    EGovernmentChecklistUpdate,
    EGovernmentChecklistResponse,
    DisasterRecoveryTeamCreate,
    DisasterRecoveryTeamResponse,
    BusinessImpactAnalysisCreate,
    BusinessImpactAnalysisResponse,
    DRBCPMetricCreate,
    DRBCPMetricResponse,
    StrategicCategoryCreate,
    StrategicCategoryUpdate,
    StrategicCategoryResponse,
    UacsCatalogItemCreate,
    UacsCatalogItemResponse,
    PolicySettingsResponse,
    PolicySettingsUpdate,
    InflationSettingsResponse,
    InflationSettingsUpdate,
    BatchApprovePayload,
    HarmonizationCriterionCreate,
    HarmonizationCriterionUpdate,
    HarmonizationCriterionResponse,
    DevelopmentStrategyCreate,
    DevelopmentStrategyResponse
)
from app.auth.router import require_admin, require_user, require_supply_or_admin
from app.tasks.pdf_tasks import compile_issp_document
from app.storage.s3_client import storage_client
from app.utils.helpers import (
    secure_filename,
    get_s3_key_from_url,
    get_active_issp_period,
    validate_active_years_alignment,
    align_and_validate_years,
    calculate_financial_summaries,
    classify_uacs_and_expenditure,
    log_audit_event,
    get_cycle_year_range,
    get_governance_policy,
    get_adjusted_unit_cost_for_year,
    sanitize_for_json
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/admin", tags=["Admin & Governance Subsystem"])


# ==========================================================
# THREAD-SAFE IN-PROCESS COMPILATION TASK RUNNER & FALLBACK
# ==========================================================
STANDALONE_TASK_STORE: Dict[str, Dict[str, Any]] = {}
TASK_STORE_LOCK = threading.Lock()


def prune_old_tasks():
    """Prunes finished standalone tasks older than 2 hours to prevent memory leaks."""
    now = time.time()
    with TASK_STORE_LOCK:
        expired_keys = [
            k for k, v in STANDALONE_TASK_STORE.items()
            if now - v.get("created_at", now) > 7200
        ]
        for k in expired_keys:
            del STANDALONE_TASK_STORE[k]


class StandaloneTaskRunner:
    """Mock Celery task context that captures state in STANDALONE_TASK_STORE."""
    def __init__(self, task_id: str):
        self.task_id = task_id

    def update_state(self, state: str = "PROGRESS", meta: Optional[Dict[str, Any]] = None):
        with TASK_STORE_LOCK:
            if self.task_id in STANDALONE_TASK_STORE:
                STANDALONE_TASK_STORE[self.task_id]["state"] = state
                if meta and isinstance(meta, dict):
                    if "progress" in meta:
                        STANDALONE_TASK_STORE[self.task_id]["progress"] = meta["progress"]
                    if "status" in meta:
                        STANDALONE_TASK_STORE[self.task_id]["status"] = meta["status"]


def execute_in_process_compilation(task_id: str, compiled_meta: dict):
    """Executes document compilation inside a background thread when Redis is offline."""
    runner = StandaloneTaskRunner(task_id)
    try:
        target_func = getattr(compile_issp_document, "__wrapped__", compile_issp_document)
        sig = inspect.signature(target_func)
        
        if len(sig.parameters) >= 2:
            result = target_func(runner, compiled_meta)
        else:
            result = target_func(compiled_meta)

        with TASK_STORE_LOCK:
            STANDALONE_TASK_STORE[task_id]["state"] = "SUCCESS"
            STANDALONE_TASK_STORE[task_id]["progress"] = 100
            STANDALONE_TASK_STORE[task_id]["status"] = "Compilation Complete"
            STANDALONE_TASK_STORE[task_id]["result"] = result
    except Exception as exc:
        logger.error(f"In-process compilation failed for task {task_id}: {exc}", exc_info=True)
        with TASK_STORE_LOCK:
            STANDALONE_TASK_STORE[task_id]["state"] = "FAILURE"
            STANDALONE_TASK_STORE[task_id]["progress"] = 100
            STANDALONE_TASK_STORE[task_id]["status"] = "Compilation Failed"
            STANDALONE_TASK_STORE[task_id]["error"] = str(exc)


# ==========================================================
# PYDANTIC INTAKE SCHEMAS FOR ADMIN ACTIONS
# ==========================================================

class SystemApprovalPayload(BaseModel):
    strategic_concern_id: Optional[Union[uuid.UUID, str]] = None
    project_id: Optional[Union[uuid.UUID, str]] = None
    status: str = Field(default="For Development", description="Operational | For Development | For Enhancement")
    action: str = Field(default="APPROVE", description="APPROVE | RETURN")
    rejection_reason: Optional[str] = None


class ProjectLinksPayload(BaseModel):
    proposal_ids: List[Union[uuid.UUID, str]] = Field(default_factory=list)
    system_ids: List[Union[uuid.UUID, str]] = Field(default_factory=list)


# ==========================================================
# 1. CORE DASHBOARD METRICS & ANALYTICS
# ==========================================================

@router.get("/dashboard-metrics")
def get_dashboard_metrics(
    db: Session = Depends(get_db),
    admin: dict = Depends(require_admin)
):
    active_period = get_active_issp_period(db)
    
    global_ceiling_row = db.query(SystemSetting).filter(SystemSetting.key == "global_budget_ceiling").first()
    global_ceiling = float(global_ceiling_row.value) if global_ceiling_row else float(settings.GLOBAL_BUDGET_CEILING)

    # Calculate spent strictly on project-bound approved proposals
    total_spent = db.query(func.sum(Proposal.total_cost)).filter(
        Proposal.issp_period == active_period,
        func.lower(cast(Proposal.status, String)) == "approved",
        Proposal.project_id.isnot(None),
        or_(Proposal.is_archived == False, Proposal.is_archived.is_(None))
    ).scalar() or 0.0

    pending_count = db.query(Proposal).filter(
        Proposal.issp_period == active_period,
        func.lower(cast(Proposal.status, String)) == "submitted",
        or_(Proposal.is_archived == False, Proposal.is_archived.is_(None))
    ).count()

    approved_count = db.query(Proposal).filter(
        Proposal.issp_period == active_period,
        func.lower(cast(Proposal.status, String)) == "approved",
        or_(Proposal.is_archived == False, Proposal.is_archived.is_(None))
    ).count()

    return {
        "global_ceiling": global_ceiling,
        "total_spent": float(total_spent),
        "pending_count": pending_count,
        "approved_count": approved_count,
        "active_cycle": active_period
    }


@router.get("/department-analytics", response_model=List[DepartmentAnalyticsResponse])
def get_department_analytics(
    db: Session = Depends(get_db),
    admin: dict = Depends(require_admin)
):
    active_period = get_active_issp_period(db)
    depts = db.query(Department).all()
    results = []

    for d in depts:
        props = db.query(Proposal).filter(
            Proposal.department_id == d.id,
            Proposal.issp_period == active_period,
            or_(Proposal.is_archived == False, Proposal.is_archived.is_(None))
        ).all()

        total = len(props)
        custom = sum(1 for p in props if not p.item_key or p.item_key == "other")
        ratio = (custom / total * 100.0) if total > 0 else 0.0
        missing_canvas = sum(
            1 for p in props 
            if (not p.item_key or p.item_key == "other") 
            and not p.created_by_students 
            and not p.is_in_house_turnover 
            and not p.canvas_evidence_url
        )
        abuse = ratio > 20.0

        results.append(DepartmentAnalyticsResponse(
            department_id=d.id,
            department_name=d.name,
            total_proposals=total,
            custom_proposals=custom,
            custom_ratio_percent=round(ratio, 2),
            missing_canvas_count=missing_canvas,
            requires_review_abuse=abuse
        ))

    return results


@router.get("/audit-logs", response_model=List[AuditLogEntryResponse])
def get_audit_logs(
    module: Optional[str] = Query(None),
    limit: int = Query(100, ge=1, le=1000),
    db: Session = Depends(get_db),
    admin: dict = Depends(require_admin)
):
    query = db.query(AuditTrail).options(joinedload(AuditTrail.user))
    if module and module.strip().lower() != "all":
        query = query.filter(AuditTrail.module == module.strip().upper())
    
    logs = query.order_by(AuditTrail.timestamp.desc()).limit(limit).all()
    out = []
    for l in logs:
        out.append(AuditLogEntryResponse(
            id=l.id,
            proposal_id=l.proposal_id,
            department_id=l.department_id,
            module=l.module,
            action=l.action,
            ip_address=l.ip_address,
            user_id=l.user_id,
            operator_email=l.user.email if l.user else "System/Cron",
            operator_role=l.user.role_tag.value if l.user else "SYSTEM",
            timestamp=l.timestamp,
            old_value=l.old_value,
            new_value=l.new_value
        ))
    return out


# ==========================================================
# 2. DEPARTMENTS & USER WHITELISTING
# ==========================================================

@router.get("/departments")
def get_departments_list(
    db: Session = Depends(get_db),
    user: dict = Depends(require_user)
):
    depts = db.query(Department).order_by(Department.name.asc()).all()
    return [{"department_id": d.id, "department_name": d.name, "id": d.id, "name": d.name} for d in depts]


@router.post("/departments", status_code=status.HTTP_201_CREATED)
def create_department(
    payload: Dict[str, Any],
    db: Session = Depends(get_db),
    admin: dict = Depends(require_admin)
):
    name = (payload.get("name") or payload.get("department_name") or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Department name is required.")
    
    existing = db.query(Department).filter(func.lower(Department.name) == name.lower()).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"Department '{name}' already exists.")
    
    dept = Department(name=name)
    db.add(dept)
    db.commit()
    db.refresh(dept)
    return {"department_id": dept.id, "department_name": dept.name, "id": dept.id, "name": dept.name}


@router.put("/departments/{dept_id}")
def update_department(
    dept_id: int,
    payload: Dict[str, Any],
    db: Session = Depends(get_db),
    admin: dict = Depends(require_admin)
):
    dept = db.query(Department).filter(Department.id == dept_id).first()
    if not dept:
        raise HTTPException(status_code=404, detail="Department not found.")
    
    name = (payload.get("name") or payload.get("department_name") or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Department name is required.")

    dept.name = name
    db.commit()
    return {"department_id": dept.id, "department_name": dept.name, "id": dept.id, "name": dept.name}


@router.delete("/departments/{dept_id}")
def delete_department(
    dept_id: int,
    db: Session = Depends(get_db),
    admin: dict = Depends(require_admin)
):
    dept = db.query(Department).filter(Department.id == dept_id).first()
    if not dept:
        raise HTTPException(status_code=404, detail="Department not found.")
    
    linked_proposals = db.query(Proposal).filter(Proposal.department_id == dept_id).count()
    if linked_proposals > 0:
        raise HTTPException(status_code=400, detail=f"Cannot delete department. {linked_proposals} proposals are currently linked to it.")

    db.delete(dept)
    db.commit()
    return {"status": "success", "message": f"Department '{dept.name}' deleted."}


@router.get("/users/whitelist", response_model=List[WhitelistedUserResponse])
def get_whitelisted_users(
    db: Session = Depends(get_db),
    admin: dict = Depends(require_admin)
):
    users = db.query(User).options(joinedload(User.department)).all()
    return users


@router.post("/users/whitelist", response_model=WhitelistedUserResponse, status_code=status.HTTP_201_CREATED)
def add_whitelisted_user(
    payload: WhitelistedUserCreate,
    db: Session = Depends(get_db),
    admin: dict = Depends(require_admin)
):
    email = payload.email.strip().lower()
    existing = db.query(User).filter(User.email == email).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"User with email '{email}' already registered.")

    hashed_pw = bcrypt.hashpw(payload.password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
    
    new_user = User(
        email=email,
        password_hash=hashed_pw,
        role_tag=payload.role_tag,
        department_id=payload.assigned_department_id,
        is_whitelisted=True
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user


@router.put("/users/whitelist/{user_id}", response_model=WhitelistedUserResponse)
def update_whitelisted_user(
    user_id: int,
    payload: WhitelistedUserUpdate,
    db: Session = Depends(get_db),
    admin: dict = Depends(require_admin)
):
    target = db.query(User).filter(User.id == user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="User not found.")

    if payload.email:
        target.email = payload.email.strip().lower()
    if payload.role_tag:
        target.role_tag = payload.role_tag
    if payload.assigned_department_id is not None:
        target.department_id = payload.assigned_department_id
    if payload.password and payload.password.strip():
        target.password_hash = bcrypt.hashpw(payload.password.strip().encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

    db.commit()
    db.refresh(target)
    return target


@router.delete("/users/whitelist/{user_id}")
def delete_whitelisted_user(
    user_id: int,
    db: Session = Depends(get_db),
    admin: dict = Depends(require_admin)
):
    target = db.query(User).filter(User.id == user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="User not found.")
    
    if target.id == admin["id"]:
        raise HTTPException(status_code=400, detail="Cannot delete your active administrative session.")

    db.delete(target)
    db.commit()
    return {"status": "success", "message": f"User '{target.email}' deleted."}


# ==========================================================
# 3. REFERENCE PRICING CATALOG
# ==========================================================

@router.get("/catalog", response_model=List[CatalogItemResponse])
def get_catalog_items(
    db: Session = Depends(get_db),
    admin: dict = Depends(require_admin)
):
    return db.query(CatalogItem).all()


@router.post("/catalog", response_model=CatalogItemResponse, status_code=status.HTTP_201_CREATED)
def create_catalog_item(
    payload: CatalogItemCreate,
    db: Session = Depends(get_db),
    admin: dict = Depends(require_admin)
):
    existing = db.query(CatalogItem).filter(CatalogItem.item_key == payload.item_key).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"Catalog item key '{payload.item_key}' already exists.")

    dumped = {k: v for k, v in payload.model_dump().items() if hasattr(CatalogItem, k)}
    item = CatalogItem(**dumped)
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.put("/catalog/{item_id}", response_model=CatalogItemResponse)
def update_catalog_item(
    item_id: uuid.UUID,
    payload: CatalogItemUpdate,
    db: Session = Depends(get_db),
    admin: dict = Depends(require_admin)
):
    item = db.query(CatalogItem).filter(CatalogItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Catalog item not found.")

    for k, v in payload.model_dump(exclude_unset=True).items():
        if hasattr(item, k):
            setattr(item, k, v)

    db.commit()
    db.refresh(item)
    return item


@router.delete("/catalog/{item_id}")
def delete_catalog_item(
    item_id: uuid.UUID,
    db: Session = Depends(get_db),
    admin: dict = Depends(require_admin)
):
    item = db.query(CatalogItem).filter(CatalogItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Catalog item not found.")

    db.delete(item)
    db.commit()
    return {"status": "success", "message": "Catalog item removed."}


# ==========================================================
# 4. GLOSSARY & INSTRUCTIONS REGISTRIES
# ==========================================================

@router.get("/glossary", response_model=List[GlossaryTermResponse])
def get_glossary(
    db: Session = Depends(get_db),
    admin: dict = Depends(require_admin)
):
    return db.query(GlossaryTerm).order_by(GlossaryTerm.order_index.asc()).all()


@router.post("/glossary", response_model=GlossaryTermResponse, status_code=status.HTTP_201_CREATED)
def create_glossary_term(
    payload: GlossaryTermCreate,
    db: Session = Depends(get_db),
    admin: dict = Depends(require_admin)
):
    term_clean = payload.term.strip()
    existing = db.query(GlossaryTerm).filter(func.lower(GlossaryTerm.term) == term_clean.lower()).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"Glossary term '{term_clean}' already exists.")

    max_idx = db.query(func.max(GlossaryTerm.order_index)).scalar() or 0
    item = GlossaryTerm(
        term=term_clean,
        definition=payload.definition.strip(),
        order_index=max_idx + 1
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.put("/glossary/{term_id}", response_model=GlossaryTermResponse)
def update_glossary_term(
    term_id: int,
    payload: GlossaryTermCreate,
    db: Session = Depends(get_db),
    admin: dict = Depends(require_admin)
):
    item = db.query(GlossaryTerm).filter(GlossaryTerm.id == term_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Glossary term not found.")

    item.term = payload.term.strip()
    item.definition = payload.definition.strip()
    db.commit()
    db.refresh(item)
    return item


@router.delete("/glossary/{term_id}")
def delete_glossary_term(
    term_id: int,
    db: Session = Depends(get_db),
    admin: dict = Depends(require_admin)
):
    item = db.query(GlossaryTerm).filter(GlossaryTerm.id == term_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Glossary term not found.")

    db.delete(item)
    db.commit()
    return {"status": "success", "message": "Glossary term deleted."}


@router.get("/instructions", response_model=List[GeneralInstructionResponse])
def get_instructions(
    db: Session = Depends(get_db),
    admin: dict = Depends(require_admin)
):
    return db.query(GeneralInstruction).order_by(GeneralInstruction.step_number.asc()).all()


@router.post("/instructions", response_model=GeneralInstructionResponse, status_code=status.HTTP_201_CREATED)
def create_instruction(
    payload: GeneralInstructionCreate,
    db: Session = Depends(get_db),
    admin: dict = Depends(require_admin)
):
    existing = db.query(GeneralInstruction).filter(GeneralInstruction.step_number == payload.step_number).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"Step number {payload.step_number} already exists.")

    dumped = {k: v for k, v in payload.model_dump().items() if hasattr(GeneralInstruction, k)}
    item = GeneralInstruction(**dumped)
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.put("/instructions/{inst_id}", response_model=GeneralInstructionResponse)
def update_instruction(
    inst_id: int,
    payload: GeneralInstructionCreate,
    db: Session = Depends(get_db),
    admin: dict = Depends(require_admin)
):
    item = db.query(GeneralInstruction).filter(GeneralInstruction.id == inst_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Instruction not found.")

    item.step_number = payload.step_number
    item.instruction_text = payload.instruction_text
    db.commit()
    db.refresh(item)
    return item


@router.delete("/instructions/{inst_id}")
def delete_instruction(
    inst_id: int,
    db: Session = Depends(get_db),
    admin: dict = Depends(require_admin)
):
    item = db.query(GeneralInstruction).filter(GeneralInstruction.id == inst_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Instruction not found.")

    db.delete(item)
    db.commit()
    return {"status": "success", "message": "Instruction removed."}


# ==========================================================
# 5. BUDGET CEILINGS & GOVERNANCE LIMITS
# ==========================================================

@router.get("/budget-ceilings", response_model=List[BudgetCeilingResponse])
def get_budget_ceilings(
    issp_period: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    admin: dict = Depends(require_admin)
):
    target_period = issp_period or get_active_issp_period(db)
    
    global_row = db.query(SystemSetting).filter(SystemSetting.key == "global_budget_ceiling").first()
    global_limit = Decimal(global_row.value) if global_row else Decimal(str(settings.GLOBAL_BUDGET_CEILING))

    depts = db.query(Department).all()
    results = []

    for d in depts:
        ceiling = db.query(BudgetCeiling).filter(
            BudgetCeiling.department_id == d.id,
            BudgetCeiling.issp_period == target_period
        ).first()

        capex = ceiling.allocated_capex if ceiling else Decimal("0.00")
        mooe = ceiling.allocated_mooe if ceiling else Decimal("0.00")
        annual_map = ceiling.annual_allocations if ceiling else {}

        spent = db.query(func.sum(Proposal.total_cost)).filter(
            Proposal.department_id == d.id,
            Proposal.issp_period == target_period,
            func.lower(cast(Proposal.status, String)).in_(["submitted", "approved"]),
            or_(Proposal.is_archived == False, Proposal.is_archived.is_(None))
        ).scalar() or Decimal("0.00")

        results.append(BudgetCeilingResponse(
            department_id=d.id,
            department_name=d.name,
            allocated_capex=capex,
            allocated_mooe=mooe,
            sub_ceiling=capex + mooe,
            global_ceiling=global_limit,
            current_spent=spent,
            annual_allocations=annual_map
        ))

    return results


@router.post("/budget-ceilings")
def update_budget_ceiling_allocation(
    payload: UpdateCeilingPayload,
    request: Request,
    db: Session = Depends(get_db),
    admin: dict = Depends(require_admin)
):
    active_period = get_active_issp_period(db)
    ceiling = db.query(BudgetCeiling).filter(
        BudgetCeiling.department_id == payload.department_id,
        BudgetCeiling.issp_period == active_period
    ).first()

    old_vals = {}
    if not ceiling:
        ceiling = BudgetCeiling(
            department_id=payload.department_id,
            issp_period=active_period,
            allocated_capex=payload.allocated_capex,
            allocated_mooe=payload.allocated_mooe,
            annual_allocations=payload.annual_allocations or {}
        )
        db.add(ceiling)
    else:
        old_vals = {
            "allocated_capex": float(ceiling.allocated_capex),
            "allocated_mooe": float(ceiling.allocated_mooe),
            "sub_ceiling": float(ceiling.sub_ceiling)
        }
        ceiling.allocated_capex = payload.allocated_capex
        ceiling.allocated_mooe = payload.allocated_mooe
        if payload.annual_allocations:
            ceiling.annual_allocations = payload.annual_allocations

    log_audit_event(
        db=db,
        action="SYSTEM_BUDGET_CEILING_UPDATED",
        module="GOVERNANCE",
        user_id=admin["id"],
        department_id=payload.department_id,
        ip_address=request.client.host if request.client else None,
        old_value=old_vals,
        new_value={
            "department_id": payload.department_id,
            "allocated_capex": float(payload.allocated_capex),
            "allocated_mooe": float(payload.allocated_mooe),
            "sub_ceiling": float(payload.allocated_capex + payload.allocated_mooe)
        }
    )

    db.commit()
    return {"status": "success", "message": "Department sub-ceiling updated."}


@router.post("/global-budget-ceiling")
def update_global_budget_ceiling(
    payload: UpdateGlobalCeilingPayload,
    request: Request,
    db: Session = Depends(get_db),
    admin: dict = Depends(require_admin)
):
    setting = db.query(SystemSetting).filter(SystemSetting.key == "global_budget_ceiling").first()
    old_val = setting.value if setting else str(settings.GLOBAL_BUDGET_CEILING)

    if not setting:
        db.add(SystemSetting(key="global_budget_ceiling", value=str(payload.global_ceiling)))
    else:
        setting.value = str(payload.global_ceiling)

    log_audit_event(
        db=db,
        action="GLOBAL_CEILING_UPDATED",
        module="GOVERNANCE",
        user_id=admin["id"],
        ip_address=request.client.host if request.client else None,
        old_value={"global_ceiling": old_val},
        new_value={"global_ceiling": str(payload.global_ceiling)}
    )

    db.commit()
    return {"status": "success", "global_ceiling": float(payload.global_ceiling)}


@router.get("/budget-validation")
def validate_budget_preflight(
    issp_period: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    admin: dict = Depends(require_admin)
):
    target_period = issp_period or get_active_issp_period(db)
    ceilings = db.query(BudgetCeiling).filter(BudgetCeiling.issp_period == target_period).all()
    
    breaches = []
    for c in ceilings:
        spent = db.query(func.sum(Proposal.total_cost)).filter(
            Proposal.department_id == c.department_id,
            Proposal.issp_period == target_period,
            func.lower(cast(Proposal.status, String)).in_(["submitted", "approved"]),
            or_(Proposal.is_archived == False, Proposal.is_archived.is_(None))
        ).scalar() or Decimal("0.00")

        if spent > c.sub_ceiling:
            dept = db.query(Department).filter(Department.id == c.department_id).first()
            breaches.append({
                "department_id": c.department_id,
                "department_name": dept.name if dept else f"Dept {c.department_id}",
                "allocated_sub_ceiling_php": float(c.sub_ceiling),
                "committed_spent_php": float(spent),
                "budget_overage_php": float(spent - c.sub_ceiling)
            })

    return {
        "issp_period": target_period,
        "validation_passed": len(breaches) == 0,
        "total_violations_detected": len(breaches),
        "breaches": breaches
    }


# ==========================================================
# 6. MASTER NARRATIVES & COVERSHEET MANAGEMENT
# ==========================================================

@router.get("/narratives/{issp_period}", response_model=MasterNarrativeResponse)
def get_master_narrative(
    issp_period: str,
    db: Session = Depends(get_db),
    admin: dict = Depends(require_admin)
):
    narrative = db.query(MasterNarrative).filter(MasterNarrative.issp_period == issp_period).first()
    if not narrative:
        parts = issp_period.split("-")
        start = int(parts[0]) if len(parts) > 0 and parts[0].isdigit() else 2026
        end = int(parts[1]) if len(parts) > 1 and parts[1].isdigit() else 2028
        narrative = MasterNarrative(
            issp_period=issp_period,
            agency_name=settings.DEFAULT_AGENCY_NAME,
            issp_period_from=start,
            issp_period_to=end,
            agency_website_url=settings.DEFAULT_AGENCY_WEBSITE,
            is_active=True
        )
        db.add(narrative)
        db.commit()
        db.refresh(narrative)

    return MasterNarrativeResponse.model_validate(narrative)


@router.post("/narratives/{issp_period}", response_model=MasterNarrativeResponse)
def update_master_narrative(
    issp_period: str,
    payload: Dict[str, Any],
    request: Request,
    db: Session = Depends(get_db),
    admin: dict = Depends(require_admin)
):
    narrative = db.query(MasterNarrative).filter(MasterNarrative.issp_period == issp_period).first()
    if not narrative:
        parts = issp_period.split("-")
        start = int(parts[0]) if len(parts) > 0 and parts[0].isdigit() else 2026
        end = int(parts[1]) if len(parts) > 1 and parts[1].isdigit() else 2028
        narrative = MasterNarrative(issp_period=issp_period, issp_period_from=start, issp_period_to=end)
        db.add(narrative)

    # Explicitly map alias and signatory fields if present in payload
    if "cio_name" in payload and payload["cio_name"]:
        narrative.signatory_prepared_by = str(payload["cio_name"]).strip()
    if "head_of_agency_name" in payload and payload["head_of_agency_name"]:
        narrative.signatory_approved_by = str(payload["head_of_agency_name"]).strip()
    if "agency_head_title" in payload and payload["agency_head_title"]:
        narrative.agency_head_position = str(payload["agency_head_title"]).strip()
    if "mandate_text" in payload and payload["mandate_text"] is not None:
        narrative.mandate_text = str(payload["mandate_text"]).strip()
    elif "mandate_html" in payload and payload["mandate_html"] is not None and not narrative.mandate_text:
        narrative.mandate_text = str(payload["mandate_html"]).strip()

    for k, v in payload.items():
        if hasattr(narrative, k) and v is not None:
            # Case-insensitive normalization for scope_choice
            if k == "scope_choice" and isinstance(v, str):
                v_clean = v.strip().lower().replace("_", "-")
                if "department" in v_clean:
                    v = "Department-Wide"
                elif "agency" in v_clean:
                    v = "Agency-Wide"
                elif "lgu" in v_clean:
                    v = "LGU"
                elif "other" in v_clean:
                    v = "Other Government Entity"
            setattr(narrative, k, v)

    log_audit_event(
        db=db,
        action="NARRATIVE_STUDIO_UPDATED",
        module="GOVERNANCE",
        user_id=admin["id"],
        ip_address=request.client.host if request.client else None,
        new_value={"issp_period": issp_period}
    )

    db.commit()
    db.refresh(narrative)
    return MasterNarrativeResponse.model_validate(narrative)


@router.post("/narratives/{issp_period}/activate")
def activate_planning_cycle(
    issp_period: str,
    request: Request,
    db: Session = Depends(get_db),
    admin: dict = Depends(require_admin)
):
    parts = issp_period.split("-")
    start = int(parts[0]) if len(parts) > 0 and parts[0].isdigit() else 2026
    end = int(parts[1]) if len(parts) > 1 and parts[1].isdigit() else 2028

    db.query(MasterNarrative).update({"is_active": False}, synchronize_session=False)

    target = db.query(MasterNarrative).filter(MasterNarrative.issp_period == issp_period).first()
    if not target:
        target = MasterNarrative(
            issp_period=issp_period,
            agency_name=settings.DEFAULT_AGENCY_NAME,
            issp_period_from=start,
            issp_period_to=end,
            agency_website_url=settings.DEFAULT_AGENCY_WEBSITE,
            is_active=True
        )
        db.add(target)
    else:
        target.is_active = True
        target.issp_period_from = start
        target.issp_period_to = end

    setting = db.query(SystemSetting).filter(SystemSetting.key == "issp_active_cycle").first()
    if not setting:
        db.add(SystemSetting(key="issp_active_cycle", value=issp_period))
    else:
        setting.value = issp_period

    db.commit()
    return {"status": "success", "active_cycle": issp_period}


@router.post("/narratives/{issp_period}/upload-diagram")
async def upload_narrative_diagram(
    issp_period: str,
    category: str = Query(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    admin: dict = Depends(require_admin)
):
    narrative = db.query(MasterNarrative).filter(MasterNarrative.issp_period == issp_period).first()
    if not narrative:
        raise HTTPException(status_code=404, detail="Planning cycle narrative not found.")

    file_bytes = await file.read()
    safe_name = secure_filename(file.filename)
    key = f"diagrams/{issp_period}/{category}_{safe_name}"

    uploaded = storage_client.upload_binary(file_bytes, key)
    if not uploaded:
        raise HTTPException(status_code=500, detail="Failed to upload schematic to storage.")

    url = storage_client.generate_download_url(key)

    col_map = {
        "agency_logo": "agency_logo_url",
        "network_diagram": "network_diagram_url",
        "fiber_backbone": "fiber_backbone_url",
        "system_architecture": "system_architecture_url",
        "existing_ict_org": "existing_ict_org_url",
        "proposed_ict_org": "proposed_ict_org_url",
        "site_development_plan": "site_development_plan_url",
        "process_flow_diagram": "process_flow_diagram_url"
    }

    target_col = col_map.get(category, f"{category}_url")
    if hasattr(narrative, target_col):
        setattr(narrative, target_col, url)
        db.commit()

    return {"status": "success", "file_url": url, "category": category}


# ==========================================================
# 7. DRBCP TEAMS, BIA & METRICS
# ==========================================================

@router.get("/narratives/{issp_period}/dr-teams", response_model=List[DisasterRecoveryTeamResponse])
def get_dr_teams(issp_period: str, db: Session = Depends(get_db), admin: dict = Depends(require_admin)):
    return db.query(DisasterRecoveryTeam).filter(DisasterRecoveryTeam.issp_period == issp_period).all()


@router.post("/narratives/{issp_period}/dr-teams", response_model=DisasterRecoveryTeamResponse, status_code=status.HTTP_201_CREATED)
def create_dr_team(issp_period: str, payload: DisasterRecoveryTeamCreate, db: Session = Depends(get_db), admin: dict = Depends(require_admin)):
    dumped = {k: v for k, v in payload.model_dump().items() if hasattr(DisasterRecoveryTeam, k)}
    item = DisasterRecoveryTeam(issp_period=issp_period, **dumped)
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.put("/dr-teams/{id}", response_model=DisasterRecoveryTeamResponse)
def update_dr_team(id: int, payload: DisasterRecoveryTeamCreate, db: Session = Depends(get_db), admin: dict = Depends(require_admin)):
    item = db.query(DisasterRecoveryTeam).filter(DisasterRecoveryTeam.id == id).first()
    if not item:
        raise HTTPException(status_code=404, detail="DR Team member not found.")
    for k, v in payload.model_dump().items():
        if hasattr(item, k):
            setattr(item, k, v)
    db.commit()
    db.refresh(item)
    return item


@router.delete("/dr-teams/{id}")
def delete_dr_team(id: int, db: Session = Depends(get_db), admin: dict = Depends(require_admin)):
    item = db.query(DisasterRecoveryTeam).filter(DisasterRecoveryTeam.id == id).first()
    if not item:
        raise HTTPException(status_code=404, detail="DR Team member not found.")
    db.delete(item)
    db.commit()
    return {"status": "success", "message": "DR Team member removed."}


@router.get("/narratives/{issp_period}/dr-bias", response_model=List[BusinessImpactAnalysisResponse])
def get_dr_bias(issp_period: str, db: Session = Depends(get_db), admin: dict = Depends(require_admin)):
    return db.query(BusinessImpactAnalysis).filter(BusinessImpactAnalysis.issp_period == issp_period).all()


@router.post("/narratives/{issp_period}/dr-bias", response_model=BusinessImpactAnalysisResponse, status_code=status.HTTP_201_CREATED)
def create_dr_bia(issp_period: str, payload: BusinessImpactAnalysisCreate, db: Session = Depends(get_db), admin: dict = Depends(require_admin)):
    dumped = {k: v for k, v in payload.model_dump().items() if hasattr(BusinessImpactAnalysis, k)}
    item = BusinessImpactAnalysis(issp_period=issp_period, **dumped)
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.put("/dr-bias/{id}", response_model=BusinessImpactAnalysisResponse)
def update_dr_bia(id: int, payload: BusinessImpactAnalysisCreate, db: Session = Depends(get_db), admin: dict = Depends(require_admin)):
    item = db.query(BusinessImpactAnalysis).filter(BusinessImpactAnalysis.id == id).first()
    if not item:
        raise HTTPException(status_code=404, detail="BIA record not found.")
    for k, v in payload.model_dump().items():
        if hasattr(item, k):
            setattr(item, k, v)
    db.commit()
    db.refresh(item)
    return item


@router.delete("/dr-bias/{id}")
def delete_dr_bia(id: int, db: Session = Depends(get_db), admin: dict = Depends(require_admin)):
    item = db.query(BusinessImpactAnalysis).filter(BusinessImpactAnalysis.id == id).first()
    if not item:
        raise HTTPException(status_code=404, detail="BIA record not found.")
    db.delete(item)
    db.commit()
    return {"status": "success", "message": "BIA record deleted."}


@router.get("/narratives/{issp_period}/dr-metrics", response_model=List[DRBCPMetricResponse])
def get_dr_metrics(issp_period: str, db: Session = Depends(get_db), admin: dict = Depends(require_admin)):
    return db.query(DRBCPMetric).filter(DRBCPMetric.issp_period == issp_period).all()


@router.post("/narratives/{issp_period}/dr-metrics", response_model=DRBCPMetricResponse, status_code=status.HTTP_201_CREATED)
def create_dr_metric(issp_period: str, payload: DRBCPMetricCreate, db: Session = Depends(get_db), admin: dict = Depends(require_admin)):
    dumped = {k: v for k, v in payload.model_dump().items() if hasattr(DRBCPMetric, k)}
    item = DRBCPMetric(issp_period=issp_period, **dumped)
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.put("/dr-metrics/{id}", response_model=DRBCPMetricResponse)
def update_dr_metric(id: int, payload: DRBCPMetricCreate, db: Session = Depends(get_db), admin: dict = Depends(require_admin)):
    item = db.query(DRBCPMetric).filter(DRBCPMetric.id == id).first()
    if not item:
        raise HTTPException(status_code=404, detail="DR Metric not found.")
    for k, v in payload.model_dump().items():
        if hasattr(item, k):
            setattr(item, k, v)
    db.commit()
    db.refresh(item)
    return item


@router.delete("/dr-metrics/{id}")
def delete_dr_metric(id: int, db: Session = Depends(get_db), admin: dict = Depends(require_admin)):
    item = db.query(DRBCPMetric).filter(DRBCPMetric.id == id).first()
    if not item:
        raise HTTPException(status_code=404, detail="DR Metric not found.")
    db.delete(item)
    db.commit()
    return {"status": "success", "message": "DR Metric removed."}


# ==========================================================
# 8. STAKEHOLDERS, HUMAN CAPITALS & STAFF
# ==========================================================

@router.get("/narratives/{issp_period}/stakeholders", response_model=List[StakeholderAnalysisResponse])
def get_stakeholders_by_cycle(issp_period: str, db: Session = Depends(get_db), admin: dict = Depends(require_admin)):
    return db.query(StakeholderAnalysis).filter(StakeholderAnalysis.issp_period == issp_period).all()


@router.get("/stakeholders", response_model=List[StakeholderAnalysisResponse])
def get_stakeholders_default(issp_period: Optional[str] = Query(None), db: Session = Depends(get_db), admin: dict = Depends(require_admin)):
    period = issp_period or get_active_issp_period(db)
    return db.query(StakeholderAnalysis).filter(StakeholderAnalysis.issp_period == period).all()


@router.post("/narratives/{issp_period}/stakeholders", response_model=StakeholderAnalysisResponse, status_code=status.HTTP_201_CREATED)
def create_stakeholder_by_cycle(issp_period: str, payload: StakeholderAnalysisCreate, db: Session = Depends(get_db), admin: dict = Depends(require_admin)):
    dumped = {k: v for k, v in payload.model_dump().items() if hasattr(StakeholderAnalysis, k)}
    item = StakeholderAnalysis(issp_period=issp_period, **dumped)
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.post("/stakeholders", response_model=StakeholderAnalysisResponse, status_code=status.HTTP_201_CREATED)
def create_stakeholder_default(payload: StakeholderAnalysisCreate, issp_period: Optional[str] = Query(None), db: Session = Depends(get_db), admin: dict = Depends(require_admin)):
    period = issp_period or get_active_issp_period(db)
    dumped = {k: v for k, v in payload.model_dump().items() if hasattr(StakeholderAnalysis, k)}
    item = StakeholderAnalysis(issp_period=period, **dumped)
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.put("/stakeholders/{id}", response_model=StakeholderAnalysisResponse)
def update_stakeholder(id: int, payload: StakeholderAnalysisUpdate, db: Session = Depends(get_db), admin: dict = Depends(require_admin)):
    item = db.query(StakeholderAnalysis).filter(StakeholderAnalysis.id == id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Stakeholder not found.")
    for k, v in payload.model_dump(exclude_unset=True).items():
        if hasattr(item, k):
            setattr(item, k, v)
    db.commit()
    db.refresh(item)
    return item


@router.delete("/stakeholders/{id}")
def delete_stakeholder(id: int, db: Session = Depends(get_db), admin: dict = Depends(require_admin)):
    item = db.query(StakeholderAnalysis).filter(StakeholderAnalysis.id == id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Stakeholder not found.")
    db.delete(item)
    db.commit()
    return {"status": "success", "message": "Stakeholder removed."}


@router.get("/narratives/{issp_period}/human-capitals", response_model=List[HumanCapitalResponse])
def get_human_capitals(issp_period: str, db: Session = Depends(get_db), admin: dict = Depends(require_admin)):
    return db.query(HumanCapital).filter(HumanCapital.issp_period == issp_period).all()


@router.post("/narratives/{issp_period}/human-capitals", response_model=HumanCapitalResponse, status_code=status.HTTP_201_CREATED)
def create_human_capital(issp_period: str, payload: HumanCapitalCreate, db: Session = Depends(get_db), admin: dict = Depends(require_admin)):
    dumped = {k: v for k, v in payload.model_dump().items() if hasattr(HumanCapital, k)}
    item = HumanCapital(issp_period=issp_period, **dumped)
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.put("/human-capitals/{id}", response_model=HumanCapitalResponse)
def update_human_capital(id: int, payload: HumanCapitalCreate, db: Session = Depends(get_db), admin: dict = Depends(require_admin)):
    item = db.query(HumanCapital).filter(HumanCapital.id == id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Human Capital entry not found.")
    for k, v in payload.model_dump().items():
        if hasattr(item, k):
            setattr(item, k, v)
    db.commit()
    db.refresh(item)
    return item


@router.delete("/human-capitals/{id}")
def delete_human_capital(id: int, db: Session = Depends(get_db), admin: dict = Depends(require_admin)):
    item = db.query(HumanCapital).filter(HumanCapital.id == id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Human Capital entry not found.")
    db.delete(item)
    db.commit()
    return {"status": "success", "message": "Human Capital entry removed."}


@router.get("/narratives/{issp_period}/staff-positions", response_model=List[IctStaffPositionResponse])
def get_staff_positions(issp_period: str, db: Session = Depends(get_db), admin: dict = Depends(require_admin)):
    return db.query(IctStaffPosition).filter(IctStaffPosition.issp_period == issp_period).all()


@router.post("/narratives/{issp_period}/staff-positions", response_model=IctStaffPositionResponse, status_code=status.HTTP_201_CREATED)
def create_staff_position(issp_period: str, payload: IctStaffPositionCreate, db: Session = Depends(get_db), admin: dict = Depends(require_admin)):
    dumped = {k: v for k, v in payload.model_dump().items() if hasattr(IctStaffPosition, k)}
    item = IctStaffPosition(issp_period=issp_period, **dumped)
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.put("/staff-positions/{id}", response_model=IctStaffPositionResponse)
def update_staff_position(id: uuid.UUID, payload: IctStaffPositionCreate, db: Session = Depends(get_db), admin: dict = Depends(require_admin)):
    item = db.query(IctStaffPosition).filter(IctStaffPosition.id == id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Staff Position not found.")
    for k, v in payload.model_dump().items():
        if hasattr(item, k):
            setattr(item, k, v)
    db.commit()
    db.refresh(item)
    return item


@router.delete("/staff-positions/{id}")
def delete_staff_position(id: uuid.UUID, db: Session = Depends(get_db), admin: dict = Depends(require_admin)):
    item = db.query(IctStaffPosition).filter(IctStaffPosition.id == id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Staff Position not found.")
    db.delete(item)
    db.commit()
    return {"status": "success", "message": "Staff Position deleted."}


@router.get("/narratives/{issp_period}/egov-checklists", response_model=List[EGovernmentChecklistResponse])
def get_egov_checklists_by_cycle(issp_period: str, db: Session = Depends(get_db), admin: dict = Depends(require_admin)):
    return db.query(EGovernmentChecklist).filter(EGovernmentChecklist.issp_period == issp_period).order_by(EGovernmentChecklist.id.asc()).all()


@router.get("/egov-checklists", response_model=List[EGovernmentChecklistResponse])
def get_egov_checklists_default(issp_period: Optional[str] = Query(None), db: Session = Depends(get_db), admin: dict = Depends(require_admin)):
    period = issp_period or get_active_issp_period(db)
    return db.query(EGovernmentChecklist).filter(EGovernmentChecklist.issp_period == period).order_by(EGovernmentChecklist.id.asc()).all()


# Filtered model_dump prevents 'is_proposed_equivalent' TypeError
@router.post("/narratives/{issp_period}/egov-checklists", response_model=EGovernmentChecklistResponse, status_code=status.HTTP_201_CREATED)
def create_egov_checklist_by_cycle(issp_period: str, payload: EGovernmentChecklistCreate, db: Session = Depends(get_db), admin: dict = Depends(require_admin)):
    dumped = {k: v for k, v in payload.model_dump().items() if hasattr(EGovernmentChecklist, k)}
    item = EGovernmentChecklist(issp_period=issp_period, **dumped)
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


# Filtered model_dump prevents 'is_proposed_equivalent' TypeError
@router.post("/egov-checklists", response_model=EGovernmentChecklistResponse, status_code=status.HTTP_201_CREATED)
def create_egov_checklist_default(payload: EGovernmentChecklistCreate, issp_period: Optional[str] = Query(None), db: Session = Depends(get_db), admin: dict = Depends(require_admin)):
    period = issp_period or get_active_issp_period(db)
    dumped = {k: v for k, v in payload.model_dump().items() if hasattr(EGovernmentChecklist, k)}
    item = EGovernmentChecklist(issp_period=period, **dumped)
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


# Filtered model_dump prevents 'is_proposed_equivalent' TypeError
@router.put("/egov-checklists/{id}", response_model=EGovernmentChecklistResponse)
def update_egov_checklist(id: int, payload: EGovernmentChecklistUpdate, db: Session = Depends(get_db), admin: dict = Depends(require_admin)):
    item = db.query(EGovernmentChecklist).filter(EGovernmentChecklist.id == id).first()
    if not item:
        raise HTTPException(status_code=404, detail="EGP item not found.")
    update_data = {k: v for k, v in payload.model_dump(exclude_unset=True).items() if hasattr(EGovernmentChecklist, k)}
    for k, v in update_data.items():
        setattr(item, k, v)
    db.commit()
    db.refresh(item)
    return item


@router.delete("/egov-checklists/{id}")
def delete_egov_checklist(id: int, db: Session = Depends(get_db), admin: dict = Depends(require_admin)):
    item = db.query(EGovernmentChecklist).filter(EGovernmentChecklist.id == id).first()
    if not item:
        raise HTTPException(status_code=404, detail="EGP item not found.")
    db.delete(item)
    db.commit()
    return {"status": "success", "message": "EGP item removed."}


@router.get("/narratives/{issp_period}/cross-projects", response_model=List[CrossAgencyProjectResponse])
def get_cross_projects(issp_period: str, db: Session = Depends(get_db), admin: dict = Depends(require_admin)):
    return db.query(CrossAgencyProject).filter(CrossAgencyProject.issp_period == issp_period).all()


@router.post("/narratives/{issp_period}/cross-projects", response_model=CrossAgencyProjectResponse, status_code=status.HTTP_201_CREATED)
def create_cross_project(issp_period: str, payload: CrossAgencyProjectCreate, db: Session = Depends(get_db), admin: dict = Depends(require_admin)):
    dumped = {k: v for k, v in payload.model_dump().items() if hasattr(CrossAgencyProject, k)}
    item = CrossAgencyProject(issp_period=issp_period, **dumped)
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.put("/cross-projects/{id}", response_model=CrossAgencyProjectResponse)
def update_cross_project(id: uuid.UUID, payload: CrossAgencyProjectCreate, db: Session = Depends(get_db), admin: dict = Depends(require_admin)):
    item = db.query(CrossAgencyProject).filter(CrossAgencyProject.id == id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Cross Project not found.")
    for k, v in payload.model_dump().items():
        if hasattr(item, k):
            setattr(item, k, v)
    db.commit()
    db.refresh(item)
    return item


@router.delete("/cross-projects/{id}")
def delete_cross_project(id: uuid.UUID, db: Session = Depends(get_db), admin: dict = Depends(require_admin)):
    item = db.query(CrossAgencyProject).filter(CrossAgencyProject.id == id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Cross Project not found.")
    db.delete(item)
    db.commit()
    return {"status": "success", "message": "Cross Project deleted."}


# ==========================================================
# PART I.A.4: ORGANIZATIONAL OUTCOMES (Broader Scope)
# ==========================================================

@router.get("/outcomes", response_model=List[OrganizationalOutcomeResponse])
def get_organizational_outcomes(
    issp_period: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    admin: dict = Depends(require_admin)
):
    target_period = issp_period or get_active_issp_period(db)
    return db.query(OrganizationalOutcome).filter(OrganizationalOutcome.issp_period == target_period).all()


@router.post("/outcomes", response_model=OrganizationalOutcomeResponse, status_code=status.HTTP_201_CREATED)
def create_organizational_outcome(
    payload: OrganizationalOutcomeCreate,
    db: Session = Depends(get_db),
    admin: dict = Depends(require_admin)
):
    period = get_active_issp_period(db)
    type_label_clean = (payload.type_label or "Organizational Outcome").strip()
    outcome_name_clean = payload.outcome_name.strip()
    db_outcome = OrganizationalOutcome(
        issp_period=period,
        type_label=type_label_clean,
        outcome_name=outcome_name_clean,
        program_name=outcome_name_clean,
        description=payload.description.strip() if payload.description else None
    )
    db.add(db_outcome)
    db.commit()
    db.refresh(db_outcome)
    return db_outcome


@router.put("/outcomes/{outcome_id}", response_model=OrganizationalOutcomeResponse)
def update_organizational_outcome(
    outcome_id: int,
    payload: OrganizationalOutcomeCreate,
    db: Session = Depends(get_db),
    admin: dict = Depends(require_admin)
):
    outcome = db.query(OrganizationalOutcome).filter(OrganizationalOutcome.id == outcome_id).first()
    if not outcome:
        raise HTTPException(status_code=404, detail="Organizational Outcome not found.")

    outcome.type_label = (payload.type_label or "Organizational Outcome").strip()
    outcome.outcome_name = payload.outcome_name.strip()
    outcome.program_name = payload.outcome_name.strip()
    outcome.description = payload.description.strip() if payload.description else None

    db.commit()
    db.refresh(outcome)
    return outcome


@router.delete("/outcomes/{outcome_id}")
def delete_organizational_outcome(
    outcome_id: int,
    db: Session = Depends(get_db),
    admin: dict = Depends(require_admin)
):
    outcome = db.query(OrganizationalOutcome).filter(OrganizationalOutcome.id == outcome_id).first()
    if not outcome:
        raise HTTPException(status_code=404, detail="Organizational Outcome program not found.")
    
    linked_proposals = db.query(Proposal).filter(Proposal.outcome_id == outcome_id).count()
    if linked_proposals > 0:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot delete program outcome. There are {linked_proposals} active proposals linked to it."
        )

    db.delete(outcome)
    db.commit()
    return {"status": "success", "message": "Outcome category purged successfully."}


# ==========================================================
# PART II.A: STRATEGIC CONCERNS MATRIX & NEEDS AGGREGATION
# ==========================================================

@router.get("/narratives/{issp_period}/concerns", response_model=List[StrategicConcernResponse])
def get_strategic_concerns(
    issp_period: str,
    db: Session = Depends(get_db),
    admin: dict = Depends(require_admin)
):
    return db.query(StrategicConcern).filter(StrategicConcern.issp_period == issp_period).order_by(StrategicConcern.order_index.asc()).all()


@router.post("/narratives/{issp_period}/concerns", response_model=StrategicConcernResponse, status_code=status.HTTP_201_CREATED)
def create_strategic_concern(
    issp_period: str,
    payload: StrategicConcernCreate,
    db: Session = Depends(get_db),
    admin: dict = Depends(require_admin)
):
    new_concern = StrategicConcern(
        issp_period=issp_period,
        outcome_id=payload.outcome_id,
        mfo=payload.mfo,
        critical_system=payload.critical_system,
        problems=payload.problems,
        intended_use=payload.intended_use,
        order_index=payload.order_index
    )
    db.add(new_concern)
    db.commit()
    db.refresh(new_concern)
    return new_concern


@router.put("/concerns/{concern_id}", response_model=StrategicConcernResponse)
def update_strategic_concern(
    concern_id: uuid.UUID,
    payload: StrategicConcernCreate,
    db: Session = Depends(get_db),
    admin: dict = Depends(require_admin)
):
    concern = db.query(StrategicConcern).filter(StrategicConcern.id == concern_id).first()
    if not concern:
        raise HTTPException(status_code=404, detail="Strategic concern record not found.")

    concern.outcome_id = payload.outcome_id
    concern.mfo = payload.mfo
    concern.critical_system = payload.critical_system
    concern.problems = payload.problems
    concern.intended_use = payload.intended_use
    concern.order_index = payload.order_index

    db.commit()
    db.refresh(concern)
    return concern


@router.delete("/concerns/{concern_id}")
def delete_strategic_concern(
    concern_id: uuid.UUID,
    db: Session = Depends(get_db),
    admin: dict = Depends(require_admin)
):
    concern = db.query(StrategicConcern).filter(StrategicConcern.id == concern_id).first()
    if not concern:
        raise HTTPException(status_code=404, detail="Strategic concern not found.")
    
    if concern.needs_assessments:
        for na in concern.needs_assessments:
            na.is_aggregated = False
            na.strategic_concern_id = None

    if concern.information_systems:
        for sys in concern.information_systems:
            sys.strategic_concern_id = None

    db.delete(concern)
    db.commit()
    return {"status": "success", "message": "Strategic concern purged."}


@router.get("/needs-assessments", response_model=List[NeedsAssessmentResponse])
def get_all_needs_assessments(
    dept_id: Optional[int] = Query(None),
    is_aggregated: Optional[bool] = Query(None),
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


@router.post("/concerns/aggregate-from-needs", response_model=StrategicConcernResponse, status_code=status.HTTP_201_CREATED)
def aggregate_needs_into_strategic_concern(
    payload: AggregateNeedsAssessmentPayload,
    issp_period: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    admin: dict = Depends(require_admin)
):
    period = issp_period or get_active_issp_period(db)
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


# ==========================================================
# PART II.B & III.A: NETWORK INFRASTRUCTURE & CYBERSECURITY
# ==========================================================

@router.get("/network-infrastructures", response_model=List[NetworkInfrastructureResponse])
def get_network_infrastructures(
    issp_period: Optional[str] = Query(None),
    is_proposed: Optional[bool] = Query(None),
    db: Session = Depends(get_db),
    admin: dict = Depends(require_admin)
):
    period = issp_period or get_active_issp_period(db)
    query = db.query(NetworkInfrastructure).filter(NetworkInfrastructure.issp_period == period)
    if is_proposed is not None:
        query = query.filter(NetworkInfrastructure.is_proposed == is_proposed)
    return query.all()


@router.post("/network-infrastructures", response_model=NetworkInfrastructureResponse, status_code=status.HTTP_201_CREATED)
def create_network_infrastructure(
    payload: NetworkInfrastructureCreate,
    issp_period: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    admin: dict = Depends(require_admin)
):
    period = issp_period or get_active_issp_period(db)
    dumped = {k: v for k, v in payload.model_dump().items() if hasattr(NetworkInfrastructure, k)}
    item = NetworkInfrastructure(issp_period=period, **dumped)
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.put("/network-infrastructures/{id}", response_model=NetworkInfrastructureResponse)
def update_network_infrastructure(
    id: int,
    payload: NetworkInfrastructureCreate,
    db: Session = Depends(get_db),
    admin: dict = Depends(require_admin)
):
    item = db.query(NetworkInfrastructure).filter(NetworkInfrastructure.id == id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Network infrastructure record not found.")
    for k, v in payload.model_dump(exclude_unset=True).items():
        if hasattr(item, k):
            setattr(item, k, v)
    db.commit()
    db.refresh(item)
    return item


@router.delete("/network-infrastructures/{id}")
def delete_network_infrastructure(
    id: int,
    db: Session = Depends(get_db),
    admin: dict = Depends(require_admin)
):
    item = db.query(NetworkInfrastructure).filter(NetworkInfrastructure.id == id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Network infrastructure record not found.")
    db.delete(item)
    db.commit()
    return {"status": "success", "message": "Network infrastructure record removed."}


@router.get("/cybersecurity-controls", response_model=List[CybersecurityControlResponse])
def get_cybersecurity_controls(
    issp_period: Optional[str] = Query(None),
    is_proposed: Optional[bool] = Query(None),
    control_domain: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    admin: dict = Depends(require_admin)
):
    period = issp_period or get_active_issp_period(db)
    query = db.query(CybersecurityControl).filter(CybersecurityControl.issp_period == period)
    if is_proposed is not None:
        query = query.filter(CybersecurityControl.is_proposed == is_proposed)
    if control_domain and control_domain.strip().lower() != "all":
        query = query.filter(CybersecurityControl.control_domain == control_domain.strip())
    return query.all()


@router.post("/cybersecurity-controls", response_model=CybersecurityControlResponse, status_code=status.HTTP_201_CREATED)
def create_cybersecurity_control(
    payload: CybersecurityControlCreate,
    issp_period: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    admin: dict = Depends(require_admin)
):
    period = issp_period or get_active_issp_period(db)
    dumped = {k: v for k, v in payload.model_dump().items() if hasattr(CybersecurityControl, k)}
    item = CybersecurityControl(issp_period=period, **dumped)
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.put("/cybersecurity-controls/{id}", response_model=CybersecurityControlResponse)
def update_cybersecurity_control(
    id: int,
    payload: CybersecurityControlCreate,
    db: Session = Depends(get_db),
    admin: dict = Depends(require_admin)
):
    item = db.query(CybersecurityControl).filter(CybersecurityControl.id == id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Cybersecurity control not found.")
    for k, v in payload.model_dump(exclude_unset=True).items():
        if hasattr(item, k):
            setattr(item, k, v)
    db.commit()
    db.refresh(item)
    return item


@router.delete("/cybersecurity-controls/{id}")
def delete_cybersecurity_control(
    id: int,
    db: Session = Depends(get_db),
    admin: dict = Depends(require_admin)
):
    item = db.query(CybersecurityControl).filter(CybersecurityControl.id == id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Cybersecurity control not found.")
    db.delete(item)
    db.commit()
    return {"status": "success", "message": "Cybersecurity control removed."}


@router.post("/cybersecurity-controls/seed-defaults")
def seed_default_cybersecurity_controls(
    issp_period: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    admin: dict = Depends(require_admin)
):
    """Seeds the 29 canonical DICT Cybersecurity Controls across all 7 Security Domains."""
    period = issp_period or get_active_issp_period(db)
    
    canonical_controls = [
        ("Physical Security", "Perimeter Protection", True),
        ("Physical Security", "Access Control", True),
        ("Physical Security", "Surveillance System", True),
        ("Physical Security", "Detection System", False),
        ("Perimeter Security", "Next Generation Firewalls", True),
        ("Perimeter Security", "Intrusion Detection/Prevention Systems (IDS/IPS)", True),
        ("Perimeter Security", "Web Application Firewalls (WAFs)", True),
        ("Perimeter Security", "Demilitarized Zone (DMZ)", False),
        ("Network Security", "Data Encryption", True),
        ("Network Security", "Network Segmentation", False),
        ("Endpoint Security", "Anti-virus and Anti-malware Software", True),
        ("Endpoint Security", "Application Control", True),
        ("Endpoint Security", "BYOD Security", True),
        ("Endpoint Security", "Extended Detection and Response (XDR)", False),
        ("Data Security", "Data Classification", True),
        ("Data Security", "Data Loss Prevention (DLP)", True),
        ("Data Security", "Data Backups and Recovery", True),
        ("Application Security", "Regular Security Scanning and Testing", True),
        ("Other Measures", "Vulnerability Assessment", True),
        ("Other Measures", "Patch Management", True),
        ("Other Measures", "Strong Password Policies", True),
        ("Other Measures", "Multi-Factor Authentication (MFA)", True),
        ("Other Measures", "Access Reviews", True),
        ("Other Measures", "Security Logs", True),
        ("Other Measures", "Log Analysis", False),
        ("Other Measures", "Incident Response Plan", False),
        ("Other Measures", "Security Information and Event Management (SIEM)", False),
        ("Other Measures", "Penetration Testing", False),
        ("Other Measures", "Secure Software Development Life Cycle (SDLC)", False),
    ]

    added_count = 0
    for is_prop in [False, True]:
        for domain, name, is_mand in canonical_controls:
            exists = db.query(CybersecurityControl).filter(
                CybersecurityControl.issp_period == period,
                CybersecurityControl.is_proposed == is_prop,
                CybersecurityControl.control_domain == domain,
                CybersecurityControl.control_name == name
            ).first()
            if not exists:
                ctrl = CybersecurityControl(
                    issp_period=period,
                    is_proposed=is_prop,
                    control_domain=domain,
                    control_name=name,
                    is_mandatory=is_mand,
                    is_implemented=False
                )
                db.add(ctrl)
                added_count += 1

    db.commit()
    return {"status": "success", "message": f"Seeded {added_count} canonical cybersecurity controls for cycle {period}."}


# ==========================================================
# PART II.C & III.D: INFORMATION SYSTEMS REGISTER & INTAKE
# ==========================================================

@router.get("/information-systems", response_model=List[InformationSystemResponse])
def get_information_systems(
    issp_period: Optional[str] = Query(None),
    status_filter: Optional[str] = Query(None),
    submission_status: Optional[str] = Query(None),
    dept_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    admin: dict = Depends(require_admin)
):
    period = issp_period or get_active_issp_period(db)
    query = db.query(InformationSystem).filter(InformationSystem.issp_period == period)
    
    if dept_id:
        query = query.filter(InformationSystem.department_id == dept_id)

    if submission_status and submission_status.strip().lower() != "all":
        query = query.filter(func.lower(cast(InformationSystem.submission_status, String)) == submission_status.strip().lower())

    if status_filter and status_filter.strip().lower() != "all":
        clean = status_filter.strip().lower()
        if clean in ["operational", "existing", "ii.c"]:
            query = query.filter(func.lower(cast(InformationSystem.status, String)) == "operational")
        elif clean in ["proposed", "iii.d", "for development / for enhancement"]:
            query = query.filter(func.lower(cast(InformationSystem.status, String)) != "operational")
        else:
            query = query.filter(func.lower(cast(InformationSystem.status, String)) == clean)

    systems = query.options(
        joinedload(InformationSystem.department),
        joinedload(InformationSystem.needs_assessment),
        joinedload(InformationSystem.project_parent),
        joinedload(InformationSystem.strategic_concern)
    ).all()

    results = []
    for sys in systems:
        resp = InformationSystemResponse.model_validate(sys)
        if sys.department:
            resp.department_name = sys.department.name
        elif sys.system_owner_office:
            resp.department_name = sys.system_owner_office
        if sys.needs_assessment:
            resp.needs_assessment_title = sys.needs_assessment.title
            
        if getattr(sys, "project_id", None):
            resp.project_id = sys.project_id
            if getattr(sys, "project_parent", None):
                resp.project_title = sys.project_parent.project_title
        elif sys.projects and len(sys.projects) > 0:
            resp.project_id = sys.projects[0].id
            resp.project_title = sys.projects[0].project_title

        results.append(resp)
            
    return results


@router.post("/information-systems", response_model=InformationSystemResponse, status_code=status.HTTP_201_CREATED)
def create_information_system(
    payload: InformationSystemCreate,
    db: Session = Depends(get_db),
    admin: dict = Depends(require_admin)
):
    period = get_active_issp_period(db)
    dumped = {k: v for k, v in payload.model_dump().items() if hasattr(InformationSystem, k)}
    
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
        is_frontline = "frontline" in c_str and "non-frontline" not in c_str

    is_non_frontline = dumped.get("is_non_frontline_service")
    if is_non_frontline is None:
        is_non_frontline = "non-frontline" in c_str

    dumped["is_support_to_operations"] = bool(is_support)
    dumped["is_general_administrative"] = bool(is_admin)
    dumped["is_operations"] = bool(is_ops)
    dumped["is_frontline_service"] = bool(is_frontline)
    dumped["is_non_frontline_service"] = bool(is_non_frontline)
    dumped["frontline_hosting_type"] = dumped.get("frontline_hosting_type") or dumped.get("hosting_type") or "Online"
    dumped["submission_status"] = "Approved"

    if payload.project_id:
        try:
            dumped["project_id"] = uuid.UUID(str(payload.project_id))
        except ValueError:
            dumped["project_id"] = payload.project_id

    db_system = InformationSystem(
        issp_period=period,
        **dumped
    )
    db.add(db_system)
    db.commit()
    db.refresh(db_system)

    resp = InformationSystemResponse.model_validate(db_system)
    if db_system.department:
        resp.department_name = db_system.department.name
    elif db_system.system_owner_office:
        resp.department_name = db_system.system_owner_office
    if db_system.needs_assessment:
        resp.needs_assessment_title = db_system.needs_assessment.title
    if db_system.project_parent:
        resp.project_id = db_system.project_id
        resp.project_title = db_system.project_parent.project_title
    return resp


@router.put("/information-systems/{system_id}", response_model=InformationSystemResponse)
def update_information_system(
    system_id: uuid.UUID,
    payload: InformationSystemUpdate,
    db: Session = Depends(get_db),
    admin: dict = Depends(require_admin)
):
    db_system = db.query(InformationSystem).filter(InformationSystem.id == system_id).first()
    if not db_system:
        raise HTTPException(status_code=404, detail="Information System not found.")

    update_data = payload.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        if hasattr(db_system, key):
            if key == "project_id" and value:
                try:
                    setattr(db_system, key, uuid.UUID(str(value)))
                except ValueError:
                    setattr(db_system, key, value)
            else:
                setattr(db_system, key, value)

    if "classification" in update_data:
        c_str = str(db_system.classification).lower()
        if "is_support_to_operations" not in update_data:
            db_system.is_support_to_operations = "support" in c_str
        if "is_general_administrative" not in update_data:
            db_system.is_general_administrative = "administrative" in c_str or "admin" in c_str
        if "is_operations" not in update_data:
            db_system.is_operations = "operations" in c_str or not (db_system.is_support_to_operations or db_system.is_general_administrative)
        if "is_frontline_service" not in update_data:
            db_system.is_frontline_service = ("frontline" in c_str and "non-frontline" not in c_str)
        if "is_non_frontline_service" not in update_data:
            db_system.is_non_frontline_service = ("non-frontline" in c_str)

    if "hosting_type" in update_data and "frontline_hosting_type" not in update_data:
        db_system.frontline_hosting_type = update_data["hosting_type"] or "Online"

    db.commit()
    db.refresh(db_system)

    resp = InformationSystemResponse.model_validate(db_system)
    if db_system.department:
        resp.department_name = db_system.department.name
    elif db_system.system_owner_office:
        resp.department_name = db_system.system_owner_office
    if db_system.needs_assessment:
        resp.needs_assessment_title = db_system.needs_assessment.title
    if db_system.project_parent:
        resp.project_id = db_system.project_id
        resp.project_title = db_system.project_parent.project_title
    return resp


@router.put("/information-systems/{system_id}/review", response_model=InformationSystemResponse)
def review_and_classify_system(
    system_id: uuid.UUID,
    payload: SystemApprovalPayload,
    request: Request,
    db: Session = Depends(get_db),
    admin: dict = Depends(require_admin)
):
    """
    Administrative Review Endpoint:
    Allows MIS Admin to approve or return proposed systems submitted by department end-users,
    formally binding them to a Strategic Concern (Part II.A) and an ICT Project (Part III.E).
    When approved, updates the existing proposal or creates a linked line item ensuring NO double counting!
    """
    system = db.query(InformationSystem).filter(InformationSystem.id == system_id).first()
    if not system:
        raise HTTPException(status_code=404, detail="Information System record not found.")

    action_upper = (payload.action or "APPROVE").strip().upper()

    if action_upper == "RETURN":
        system.submission_status = "Returned"
        system.rejection_reason = payload.rejection_reason or "Proposal requires revision or additional technical details."
        
        log_audit_event(
            db=db,
            action="SYSTEM_PROPOSAL_RETURNED",
            module="GOVERNANCE",
            user_id=admin["id"],
            department_id=system.department_id,
            ip_address=request.client.host if request.client else None,
            new_value={"system_name": system.name, "reason": system.rejection_reason}
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
        return resp

    # APPROVE & CLASSIFY
    system.submission_status = "Approved"
    system.status = payload.status
    system.rejection_reason = None

    if payload.strategic_concern_id:
        sc_val = str(payload.strategic_concern_id).strip()
        if sc_val and sc_val.lower() not in ("none", "null", ""):
            try:
                system.strategic_concern_id = uuid.UUID(sc_val)
            except ValueError:
                system.strategic_concern_id = sc_val

    # Resolve target project
    proj_uuid = None
    target_project = None
    raw_pid = payload.project_id or system.project_id
    if raw_pid:
        pid_clean = str(raw_pid).strip()
        if pid_clean and pid_clean.lower() not in ("none", "null", ""):
            try:
                proj_uuid = uuid.UUID(pid_clean)
            except ValueError:
                proj_uuid = pid_clean
            target_project = db.query(IctProject).filter(IctProject.id == proj_uuid).first()

    if target_project:
        target_project.system_id = system.id
        system.project_id = target_project.id
        strat_cat_name = str(getattr(target_project.project_category, "value", target_project.project_category) or "Internal ICT Projects")
        fund_source_val = str(getattr(target_project.funding_source, "value", target_project.funding_source) or "General Appropriations Act (GAA)")
    else:
        strat_cat_name = "Internal ICT Projects"
        fund_source_val = "General Appropriations Act (GAA)"

    sc_obj = db.query(StrategicCategory).filter(
        func.lower(StrategicCategory.name) == func.lower(strat_cat_name)
    ).first()
    strat_cat_id = sc_obj.id if sc_obj else None

    # Resolve Target Program Outcome
    target_outcome_id = None
    if system.strategic_concern_id:
        concern = db.query(StrategicConcern).filter(StrategicConcern.id == system.strategic_concern_id).first()
        if concern and concern.outcome_id:
            target_outcome_id = concern.outcome_id
    
    if not target_outcome_id:
        default_outcome = db.query(OrganizationalOutcome).filter(
            OrganizationalOutcome.issp_period == system.issp_period
        ).first()
        if default_outcome:
            target_outcome_id = default_outcome.id

    # Update or Bind matching Proposal line item in Part IV.A
    linked_props = db.query(Proposal).filter(
        Proposal.issp_period == system.issp_period,
        or_(
            func.lower(Proposal.item_name) == func.lower(f"Software Engineering: {system.name}"),
            func.lower(Proposal.item_name) == func.lower(f"Software Development: {system.name}"),
            func.lower(Proposal.item_name) == func.lower(f"Information System Outlay: {system.name}"),
            func.lower(Proposal.item_name) == func.lower(system.name),
            and_(
                Proposal.needs_assessment_id.isnot(None),
                Proposal.needs_assessment_id == system.needs_assessment_id
            ) if system.needs_assessment_id else False
        )
    ).all()

    proposed_cost = getattr(system, "proposed_cost", Decimal("0.00")) or Decimal("0.00")

    for p in linked_props:
        if proj_uuid:
            p.project_id = proj_uuid
        p.strategic_category = strat_cat_name
        p.strategic_category_id = strat_cat_id or p.strategic_category_id
        p.fund_source = fund_source_val
        if proposed_cost > Decimal("0.00") and p.unit_cost != proposed_cost:
            p.unit_cost = proposed_cost
            p.total_cost = proposed_cost
        if not p.outcome_id and target_outcome_id:
            p.outcome_id = target_outcome_id
        p.status = "Approved"

    if not linked_props and proposed_cost > Decimal("0.00"):
        start_yr = str(system.issp_period.split("-")[0]) if "-" in system.issp_period else "2026"
        target_dept_id = system.department_id or 1
        dept = db.query(Department).filter(Department.id == target_dept_id).first()
        automated_office = dept.name if dept else (system.system_owner_office or "Central Office")

        uacs_code, exp_class = classify_uacs_and_expenditure(
            item_name=f"Software Development: {system.name}",
            unit_cost=proposed_cost,
            strategic_category=strat_cat_name,
            category="Software",
            created_by_students=False,
            db=db
        )

        new_prop = Proposal(
            department_id=target_dept_id,
            issp_period=system.issp_period,
            outcome_id=target_outcome_id,
            project_id=proj_uuid,
            needs_assessment_id=system.needs_assessment_id,
            strategic_category_id=strat_cat_id,
            category="Software",
            strategic_category=strat_cat_name,
            office_location=automated_office,
            fund_source=fund_source_val,
            uacs_object_code=uacs_code,
            expenditure_class=exp_class,
            status="Approved",
            item_name=f"Software Development: {system.name}",
            unit_cost=proposed_cost,
            yearly_quantities={start_yr: 1, "Year 1": 1},
            total_qty=1,
            total_cost=proposed_cost,
            justification=f"Approved development and implementation outlay for {system.name}.",
            system_development_status=system.status,
            target_office_automated=automated_office
        )
        db.add(new_prop)

    log_audit_event(
        db=db,
        action="SYSTEM_PROPOSAL_APPROVED",
        module="GOVERNANCE",
        user_id=admin["id"],
        department_id=system.department_id,
        ip_address=request.client.host if request.client else None,
        new_value={
            "system_name": system.name, 
            "status": system.status, 
            "strategic_concern_id": str(system.strategic_concern_id) if system.strategic_concern_id else None,
            "project_id": str(proj_uuid) if proj_uuid else None
        }
    )

    db.commit()
    db.refresh(system)

    resp = InformationSystemResponse.model_validate(system)
    if db_system_dept := system.department:
        resp.department_name = db_system_dept.name
    elif system.system_owner_office:
        resp.department_name = system.system_owner_office
    if system.needs_assessment:
        resp.needs_assessment_title = system.needs_assessment.title
    if system.project_parent:
        resp.project_id = system.project_id
        resp.project_title = system.project_parent.project_title
    return resp


@router.delete("/information-systems/{system_id}")
def delete_information_system(
    system_id: uuid.UUID,
    db: Session = Depends(get_db),
    admin: dict = Depends(require_admin)
):
    db_system = db.query(InformationSystem).filter(InformationSystem.id == system_id).first()
    if not db_system:
        raise HTTPException(status_code=404, detail="Information System not found.")

    linked_projects = db.query(IctProject).filter(
        or_(
            IctProject.system_id == system_id,
            IctProject.id == db_system.project_id
        )
    ).count()
    if linked_projects > 0:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot delete system '{db_system.name}'. There are {linked_projects} ICT projects linked to it."
        )

    db.query(BusinessImpactAnalysis).filter(BusinessImpactAnalysis.system_id == system_id).delete(synchronize_session=False)

    db.delete(db_system)
    db.commit()
    return {"status": "success", "message": "Information System removed from registry."}


# ==========================================================
# PART III.E: ICT PROJECTS (INTERNAL & CROSS-AGENCY)
# ==========================================================

@router.get("/ict-projects")
def get_ict_projects(
    issp_period: Optional[str] = Query(None),
    category_filter: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    admin: dict = Depends(require_admin)
):
    try:
        period = issp_period or get_active_issp_period(db)
        base_projects = db.query(IctProject).options(
            selectinload(IctProject.resource_items),
            selectinload(IctProject.linked_systems),
            joinedload(IctProject.information_system)
        ).filter(IctProject.issp_period == period).all()

        if category_filter and category_filter.strip().lower() != "all":
            cat_clean = category_filter.strip().lower()
            filtered_projects = [
                p for p in base_projects 
                if cat_clean in str(getattr(p.project_category, "value", p.project_category) or "").lower()
            ]
            projects = filtered_projects
        else:
            projects = base_projects

        results = []
        for proj in projects:
            pid_str = str(proj.id)

            linked_items = []
            for item in proj.resource_items:
                if not getattr(item, "is_archived", False):
                    linked_items.append({
                        "id": str(item.id),
                        "item_name": item.item_name,
                        "category": str(getattr(item.category, "value", item.category) or "Hardware"),
                        "strategic_category": str(getattr(item.strategic_category, "value", item.strategic_category) or ""),
                        "uacs_object_code": str(getattr(item.uacs_object_code, "value", item.uacs_object_code) or ""),
                        "expenditure_class": str(getattr(item.expenditure_class, "value", item.expenditure_class) or ""),
                        "unit_cost": float(item.unit_cost or 0),
                        "total_qty": int(item.total_qty or 0),
                        "total_cost": float(item.total_cost or 0),
                        "status": str(getattr(item.status, "value", item.status) or "Draft"),
                        "office_location": item.target_office_automated or item.office_location or "Central Office"
                    })

            linked_sys_list = []
            all_systems = list(proj.linked_systems or [])
            if proj.information_system and proj.information_system not in all_systems:
                all_systems.append(proj.information_system)

            for s in all_systems:
                linked_sys_list.append({
                    "id": str(s.id),
                    "name": s.name,
                    "status": str(getattr(s.status, "value", s.status) or "Operational"),
                    "proposed_cost": float(s.proposed_cost or 0),
                    "classification": str(getattr(s.classification, "value", s.classification) or "")
                })

            total_project_cost = float(proj.computed_total_project_cost)

            results.append({
                "id": pid_str,
                "issp_period": str(proj.issp_period or period),
                "system_id": str(proj.system_id) if proj.system_id else None,
                "project_title": str(proj.project_title or ""),
                "project_category": str(getattr(proj.project_category, "value", proj.project_category) or "Internal ICT Projects"),
                "description": str(proj.description or ""),
                "objectives": str(proj.objectives or ""),
                "aligns_pip": bool(getattr(proj, "aligns_pip", False)),
                "aligns_ncsp": bool(getattr(proj, "aligns_ncsp", False)),
                "aligns_egmp": bool(getattr(proj, "aligns_egmp", False)),
                "aligns_pcb": bool(getattr(proj, "aligns_pcb", False)),
                "aligns_others": bool(getattr(proj, "aligns_others", False)),
                "aligns_others_specify": getattr(proj, "aligns_others_specify", None),
                "harmonization_criteria": getattr(proj, "harmonization_criteria", {}) or {},
                "harmonizes_national_priority": bool(getattr(proj, "harmonizes_national_priority", False)),
                "harmonizes_resource_optimization": bool(getattr(proj, "harmonizes_resource_optimization", False)),
                "harmonizes_pegif": bool(getattr(proj, "harmonizes_pegif", False)),
                "harmonizes_cross_collaboration": bool(getattr(proj, "harmonizes_cross_collaboration", False)),
                "harmonizes_scalability": bool(getattr(proj, "harmonizes_scalability", False)),
                "duration_start_year": int(getattr(proj, "duration_start_year", 2026) or 2026),
                "duration_end_year": int(getattr(proj, "duration_end_year", 2028) or 2028),
                "annual_deliverables": getattr(proj, "annual_deliverables", {}) or {},
                "year_1_deliverables": str(getattr(proj, "year_1_deliverables", "") or ""),
                "year_2_deliverables": str(getattr(proj, "year_2_deliverables", "") or ""),
                "year_3_deliverables": str(getattr(proj, "year_3_deliverables", "") or ""),
                "implementing_unit": str(getattr(proj, "implementing_unit", "") or "ICT Management Office"),
                "funding_source": str(getattr(proj.funding_source, "value", proj.funding_source) or "General Appropriations Act (GAA)"),
                "lead_agency": str(proj.lead_agency) if proj.lead_agency else None,
                "partner_agencies": str(proj.partner_agencies) if proj.partner_agencies else None,
                "computed_total_project_cost": total_project_cost,
                "linked_proposals": linked_items,
                "linked_systems": linked_sys_list
            })

        return results
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to query ict-projects: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to query ICT projects: {str(e)}")


@router.post("/ict-projects", status_code=status.HTTP_201_CREATED)
def create_ict_project(
    payload: IctProjectCreate,
    db: Session = Depends(get_db),
    admin: dict = Depends(require_admin)
):
    try:
        period = get_active_issp_period(db)
        data_dict = {k: v for k, v in payload.model_dump().items() if hasattr(IctProject, k)}
        new_project = IctProject(
            issp_period=period,
            **data_dict
        )
        db.add(new_project)
        db.commit()
        db.refresh(new_project)

        if new_project.system_id:
            db.query(InformationSystem).filter(InformationSystem.id == new_project.system_id).update(
                {"project_id": new_project.id},
                synchronize_session=False
            )
            db.commit()
        
        return {
            "id": str(new_project.id),
            "issp_period": new_project.issp_period,
            "system_id": str(new_project.system_id) if new_project.system_id else None,
            "project_title": new_project.project_title,
            "project_category": str(getattr(new_project.project_category, "value", new_project.project_category) or "Internal ICT Projects"),
            "description": new_project.description or "",
            "objectives": new_project.objectives or "",
            "aligns_pip": bool(new_project.aligns_pip),
            "aligns_ncsp": bool(new_project.aligns_ncsp),
            "aligns_egmp": bool(new_project.aligns_egmp),
            "aligns_pcb": bool(new_project.aligns_pcb),
            "aligns_others": bool(getattr(new_project, "aligns_others", False)),
            "aligns_others_specify": getattr(new_project, "aligns_others_specify", None),
            "harmonization_criteria": getattr(new_project, "harmonization_criteria", {}) or {},
            "harmonizes_national_priority": bool(new_project.harmonizes_national_priority),
            "harmonizes_resource_optimization": bool(new_project.harmonizes_resource_optimization),
            "harmonizes_pegif": bool(new_project.harmonizes_pegif),
            "harmonizes_cross_collaboration": bool(new_project.harmonizes_cross_collaboration),
            "harmonizes_scalability": bool(new_project.harmonizes_scalability),
            "duration_start_year": new_project.duration_start_year,
            "duration_end_year": new_project.duration_end_year,
            "annual_deliverables": getattr(new_project, "annual_deliverables", {}) or {},
            "year_1_deliverables": new_project.year_1_deliverables or "",
            "year_2_deliverables": new_project.year_2_deliverables or "",
            "year_3_deliverables": new_project.year_3_deliverables or "",
            "implementing_unit": new_project.implementing_unit or "ICT Management Office",
            "funding_source": str(getattr(new_project.funding_source, "value", new_project.funding_source) or "General Appropriations Act (GAA)"),
            "lead_agency": new_project.lead_agency,
            "partner_agencies": new_project.partner_agencies,
            "computed_total_project_cost": 0.0,
            "linked_proposals": [],
            "linked_systems": []
        }
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to create ICT project: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to create ICT project: {str(e)}")


@router.put("/ict-projects/{project_id}")
def update_ict_project(
    project_id: uuid.UUID,
    payload: IctProjectUpdate,
    db: Session = Depends(get_db),
    admin: dict = Depends(require_admin)
):
    try:
        project = db.query(IctProject).filter(IctProject.id == project_id).first()
        if not project:
            raise HTTPException(status_code=404, detail="ICT Project not found.")

        update_dict = {k: v for k, v in payload.model_dump(exclude_unset=True).items() if hasattr(project, k)}
        for key, val in update_dict.items():
            setattr(project, key, val)

        if "system_id" in update_dict:
            if project.system_id:
                db.query(InformationSystem).filter(InformationSystem.id == project.system_id).update(
                    {"project_id": project.id},
                    synchronize_session=False
                )

        # Propagate Category and Fund Source updates down to all linked proposals
        if "funding_source" in update_dict or "project_category" in update_dict:
            strat_cat_val = str(getattr(project.project_category, "value", project.project_category) or "Internal ICT Projects")
            sc_obj = db.query(StrategicCategory).filter(
                func.lower(StrategicCategory.name) == func.lower(strat_cat_val)
            ).first()
            strat_cat_id = sc_obj.id if sc_obj else None

            db.query(Proposal).filter(Proposal.project_id == project.id).update({
                "fund_source": str(getattr(project.funding_source, "value", project.funding_source) or "General Appropriations Act (GAA)"),
                "strategic_category": strat_cat_val,
                "strategic_category_id": strat_cat_id
            }, synchronize_session=False)

        db.commit()
        db.refresh(project)
        
        return {
            "id": str(project.id),
            "issp_period": project.issp_period,
            "system_id": str(project.system_id) if project.system_id else None,
            "project_title": project.project_title,
            "project_category": str(getattr(project.project_category, "value", project.project_category) or "Internal ICT Projects"),
            "description": project.description or "",
            "objectives": project.objectives or "",
            "aligns_pip": bool(project.aligns_pip),
            "aligns_ncsp": bool(project.aligns_ncsp),
            "aligns_egmp": bool(project.aligns_egmp),
            "aligns_pcb": bool(project.aligns_pcb),
            "aligns_others": bool(getattr(project, "aligns_others", False)),
            "aligns_others_specify": getattr(project, "aligns_others_specify", None),
            "harmonization_criteria": getattr(project, "harmonization_criteria", {}) or {},
            "harmonizes_national_priority": bool(project.harmonizes_national_priority),
            "harmonizes_resource_optimization": bool(project.harmonizes_resource_optimization),
            "harmonizes_pegif": bool(project.harmonizes_pegif),
            "harmonizes_cross_collaboration": bool(project.harmonizes_cross_collaboration),
            "harmonizes_scalability": bool(project.harmonizes_scalability),
            "duration_start_year": project.duration_start_year,
            "duration_end_year": project.duration_end_year,
            "annual_deliverables": getattr(project, "annual_deliverables", {}) or {},
            "year_1_deliverables": project.year_1_deliverables or "",
            "year_2_deliverables": project.year_2_deliverables or "",
            "year_3_deliverables": project.year_3_deliverables or "",
            "implementing_unit": project.implementing_unit or "ICT Management Office",
            "funding_source": str(getattr(project.funding_source, "value", project.funding_source) or "General Appropriations Act (GAA)"),
            "lead_agency": project.lead_agency,
            "partner_agencies": project.partner_agencies,
            "computed_total_project_cost": float(project.computed_total_project_cost)
        }
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to update ICT project: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to update ICT project: {str(e)}")


@router.delete("/ict-projects/{project_id}")
def delete_ict_project(
    project_id: uuid.UUID,
    db: Session = Depends(get_db),
    admin: dict = Depends(require_admin)
):
    try:
        project = db.query(IctProject).filter(IctProject.id == project_id).first()
        if not project:
            raise HTTPException(status_code=404, detail="ICT Project not found.")

        linked_items = db.query(Proposal).filter(Proposal.project_id == project_id).count()
        if linked_items > 0:
            raise HTTPException(
                status_code=400,
                detail=f"Cannot delete project '{project.project_title}'. There are {linked_items} financial line items linked to it in Part IV.A."
            )

        db.query(PerformanceMetric).filter(PerformanceMetric.project_id == project_id).delete(synchronize_session=False)

        db.query(InformationSystem).filter(InformationSystem.project_id == project_id).update(
            {"project_id": None},
            synchronize_session=False
        )

        db.delete(project)
        db.commit()
        return {"status": "success", "message": "ICT Project removed from framework."}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to delete ICT project: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to delete ICT project: {str(e)}")


# ==========================================================
# 9. REVISED PROJECT LINKING & REAL-TIME COST RECALCULATION
# ==========================================================

@router.post("/ict-projects/{project_id}/links")
def update_project_links(
    project_id: uuid.UUID,
    payload: ProjectLinksPayload,
    db: Session = Depends(get_db),
    admin: dict = Depends(require_admin)
):
    """
    Binds or unbinds proposals and information systems directly to an ICT project.
    Guarantees:
    1. Unlinked/detached proposals have their project_id cleared (project_id = None).
    2. Detached proposals immediately stop inflating the project's computed total cost.
    3. Attached proposals automatically inherit the project's Strategic Category and Fund Source.
    4. Session relationship caches are expired so next reads reflect the true database state.
    """
    project = db.query(IctProject).filter(IctProject.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="ICT Project not found.")

    strat_cat_val = str(getattr(project.project_category, "value", project.project_category) or "Internal ICT Projects")
    sc_obj = db.query(StrategicCategory).filter(
        func.lower(StrategicCategory.name) == func.lower(strat_cat_val)
    ).first()
    strat_cat_id = sc_obj.id if sc_obj else None
    proj_fund_source = str(getattr(project.funding_source, "value", project.funding_source) or "General Appropriations Act (GAA)")

    # 1. Update proposal linkages
    if payload.proposal_ids is not None:
        p_uuids = set()
        for pid in payload.proposal_ids:
            if pid:
                try:
                    p_uuids.add(uuid.UUID(str(pid)))
                except ValueError:
                    p_uuids.add(pid)

        # Unlink proposals that were detached
        current_proposals = db.query(Proposal).filter(Proposal.project_id == project.id).all()
        for p in current_proposals:
            if p.id not in p_uuids:
                p.project_id = None
                p.strategic_category = "Office Productivity"
                p.strategic_category_id = None

        # Bind selected proposals and inherit project parameters
        for pid in p_uuids:
            prop = db.query(Proposal).filter(Proposal.id == pid).first()
            if prop:
                prop.project_id = project.id
                prop.strategic_category = strat_cat_val
                prop.fund_source = proj_fund_source
                if strat_cat_id:
                    prop.strategic_category_id = strat_cat_id

    # 2. Update system linkages
    if payload.system_ids is not None:
        s_uuids = set()
        for sid in payload.system_ids:
            if sid:
                try:
                    s_uuids.add(uuid.UUID(str(sid)))
                except ValueError:
                    s_uuids.add(sid)

        # Unlink systems that were detached
        current_systems = db.query(InformationSystem).filter(
            or_(
                InformationSystem.project_id == project.id,
                InformationSystem.id == project.system_id
            )
        ).all()
        for s in current_systems:
            if s.id not in s_uuids:
                s.project_id = None
                if project.system_id == s.id:
                    project.system_id = None

        for sid in s_uuids:
            sys_obj = db.query(InformationSystem).filter(InformationSystem.id == sid).first()
            if sys_obj:
                sys_obj.project_id = project.id

        if s_uuids:
            project.system_id = list(s_uuids)[0]

    db.commit()
    db.expire_all()
    db.refresh(project)

    return {
        "status": "success",
        "message": f"Project linkages updated for '{project.project_title}'.",
        "computed_total_project_cost": float(project.computed_total_project_cost)
    }


# ==========================================================
# PART III.F: PERFORMANCE MEASUREMENT FRAMEWORK (DECOUPLED)
# ==========================================================

@router.get("/narratives/{issp_period}/metrics", response_model=List[PerformanceMetricResponse])
def get_performance_metrics(issp_period: str, db: Session = Depends(get_db), admin: dict = Depends(require_admin)):
    return db.query(PerformanceMetric).filter(PerformanceMetric.issp_period == issp_period).all()


@router.post("/narratives/{issp_period}/metrics", response_model=PerformanceMetricResponse, status_code=status.HTTP_201_CREATED)
def add_performance_metric(
    issp_period: str, 
    payload: PerformanceMetricCreate, 
    db: Session = Depends(get_db), 
    admin: dict = Depends(require_admin)
):
    resolved_title = payload.project_title.strip() if payload.project_title else "Institutional ICT Governance"
    
    metric = PerformanceMetric(
        issp_period=issp_period,
        project_id=payload.project_id if payload.project_id else None,
        project_title=resolved_title,
        result_hierarchy=payload.result_hierarchy,
        indicator=payload.indicator.strip(),
        baseline=payload.baseline.strip(),
        target=payload.target.strip(),
        annual_targets=payload.annual_targets or {},
        collection_method=payload.collection_method.strip(),
        responsibility=payload.responsibility.strip()
    )
    db.add(metric)
    db.commit()
    db.refresh(metric)
    return metric


@router.put("/metrics/{id}", response_model=PerformanceMetricResponse)
def update_performance_metric(
    id: uuid.UUID, 
    payload: PerformanceMetricCreate, 
    db: Session = Depends(get_db), 
    admin: dict = Depends(require_admin)
):
    metric = db.query(PerformanceMetric).filter(PerformanceMetric.id == id).first()
    if not metric:
        raise HTTPException(status_code=404, detail="Performance metric not found.")

    for k, v in payload.model_dump().items():
        if hasattr(metric, k):
            setattr(metric, k, v)

    db.commit()
    db.refresh(metric)
    return metric


@router.delete("/metrics/{id}")
def delete_performance_metric(id: uuid.UUID, db: Session = Depends(get_db), admin: dict = Depends(require_admin)):
    db.query(PerformanceMetric).filter(PerformanceMetric.id == id).delete()
    db.commit()
    return {"status": "success"}


# ==========================================================
# DYNAMIC STRATEGIC CATEGORIES CRUD (PART IV.A & TABLE B.1)
# ==========================================================

@router.get("/strategic-categories", response_model=List[StrategicCategoryResponse])
def get_strategic_categories(db: Session = Depends(get_db), admin: dict = Depends(require_admin)):
    return db.query(StrategicCategory).filter(StrategicCategory.is_active == True).order_by(StrategicCategory.order_index.asc()).all()


@router.get("/governance/strategic-categories", response_model=List[StrategicCategoryResponse], include_in_schema=False)
def get_strategic_categories_governance_alias(db: Session = Depends(get_db), admin: dict = Depends(require_admin)):
    return get_strategic_categories(db=db, admin=admin)


@router.post("/strategic-categories", response_model=StrategicCategoryResponse, status_code=status.HTTP_201_CREATED)
def create_strategic_category(payload: StrategicCategoryCreate, db: Session = Depends(get_db), admin: dict = Depends(require_admin)):
    name = payload.name.strip()
    code = (payload.code or name.upper().replace(" ", "_")).strip()
    
    existing = db.query(StrategicCategory).filter(or_(StrategicCategory.code == code, StrategicCategory.name == name)).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"Strategic category with name or code '{code}' already exists.")

    cat = StrategicCategory(
        name=name,
        code=code,
        is_project_linked=payload.is_project_linked,
        is_recurring_expense=payload.is_recurring_expense,
        order_index=payload.order_index,
        is_active=payload.is_active,
        description=payload.description
    )
    db.add(cat)
    db.commit()
    db.refresh(cat)
    return cat


@router.post("/governance/strategic-categories", response_model=StrategicCategoryResponse, status_code=status.HTTP_201_CREATED)
def create_strategic_category_governance_alias(payload: StrategicCategoryCreate, db: Session = Depends(get_db), admin: dict = Depends(require_admin)):
    return create_strategic_category(payload=payload, db=db, admin=admin)


@router.put("/strategic-categories/{cat_id}", response_model=StrategicCategoryResponse)
def update_strategic_category(cat_id: int, payload: StrategicCategoryUpdate, db: Session = Depends(get_db), admin: dict = Depends(require_admin)):
    cat = db.query(StrategicCategory).filter(StrategicCategory.id == cat_id).first()
    if not cat:
        raise HTTPException(status_code=404, detail="Strategic category not found.")
    
    old_name = cat.name
    if payload.name:
        new_name = payload.name.strip()
        if new_name != old_name:
            db.query(Proposal).filter(Proposal.strategic_category == old_name).update(
                {"strategic_category": new_name}, 
                synchronize_session=False
            )
            cat.name = new_name

    for k, v in payload.model_dump(exclude_unset=True).items():
        if k != "name" and hasattr(cat, k):
            setattr(cat, k, v)
    
    db.commit()
    db.refresh(cat)
    return cat


@router.put("/governance/strategic-categories/{cat_id}", response_model=StrategicCategoryResponse, include_in_schema=False)
def update_strategic_category_governance_alias(cat_id: int, payload: StrategicCategoryUpdate, db: Session = Depends(get_db), admin: dict = Depends(require_admin)):
    return update_strategic_category(cat_id=cat_id, payload=payload, db=db, admin=admin)


@router.delete("/strategic-categories/{cat_id}")
def delete_strategic_category(cat_id: int, db: Session = Depends(get_db), admin: dict = Depends(require_admin)):
    cat = db.query(StrategicCategory).filter(StrategicCategory.id == cat_id).first()
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found.")

    linked_count = db.query(Proposal).filter(
        or_(Proposal.strategic_category_id == cat.id, Proposal.strategic_category == cat.name)
    ).count()

    if linked_count > 0:
        raise HTTPException(
            status_code=400, 
            detail=f"Cannot delete category '{cat.name}'. It is currently linked to {linked_count} resource proposals."
        )

    db.delete(cat)
    db.commit()
    return {"status": "success", "message": f"Category '{cat.name}' deleted."}


@router.delete("/governance/strategic-categories/{cat_id}", include_in_schema=False)
def delete_strategic_category_governance_alias(cat_id: int, db: Session = Depends(get_db), admin: dict = Depends(require_admin)):
    return delete_strategic_category(cat_id=cat_id, db=db, admin=admin)


# ==========================================================
# DYNAMIC UACS / OBJECT OF EXPENDITURE CRUD (TABLE B.4)
# ==========================================================

@router.get("/uacs-catalog", response_model=List[UacsCatalogItemResponse])
def get_uacs_catalog(db: Session = Depends(get_db), admin: dict = Depends(require_admin)):
    return db.query(UacsCatalogItem).filter(UacsCatalogItem.is_active == True).order_by(UacsCatalogItem.id.asc()).all()


@router.post("/uacs-catalog", response_model=UacsCatalogItemResponse, status_code=status.HTTP_201_CREATED)
def create_uacs_entry(payload: UacsCatalogItemCreate, db: Session = Depends(get_db), admin: dict = Depends(require_admin)):
    code = payload.uacs_code.strip()
    existing = db.query(UacsCatalogItem).filter(UacsCatalogItem.uacs_code == code).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"UACS code '{code}' already exists in catalog.")

    dumped = {k: v for k, v in payload.model_dump().items() if hasattr(UacsCatalogItem, k)}
    item = UacsCatalogItem(**dumped)
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.put("/uacs-catalog/{item_id}", response_model=UacsCatalogItemResponse)
def update_uacs_entry(item_id: int, payload: Dict[str, Any], db: Session = Depends(get_db), admin: dict = Depends(require_admin)):
    item = db.query(UacsCatalogItem).filter(UacsCatalogItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="UACS entry not found.")
    
    if "account_title" in payload: item.account_title = payload["account_title"].strip()
    if "expenditure_class" in payload: item.expenditure_class = payload["expenditure_class"].strip()
    if "is_subscription_default" in payload: item.is_subscription_default = bool(payload["is_subscription_default"])
    if "description" in payload: item.description = payload["description"]
    
    db.commit()
    db.refresh(item)
    return item


@router.delete("/uacs-catalog/{item_id}")
def delete_uacs_entry(item_id: int, db: Session = Depends(get_db), admin: dict = Depends(require_admin)):
    item = db.query(UacsCatalogItem).filter(UacsCatalogItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="UACS entry not found.")
    db.delete(item)
    db.commit()
    return {"status": "success", "message": "UACS object code removed from catalog."}


@router.put("/proposals/{proposal_id}/uacs")
def assign_proposal_uacs(
    proposal_id: uuid.UUID,
    payload: Dict[str, Any],
    request: Request,
    db: Session = Depends(get_db),
    admin: dict = Depends(require_admin)
):
    """Explicitly assigns UACS Object Code and Expenditure Class to a proposal."""
    proposal = db.query(Proposal).filter(Proposal.id == proposal_id).first()
    if not proposal:
        raise HTTPException(status_code=404, detail="Proposal not found.")

    uacs_code = payload.get("uacs_object_code")
    exp_class = payload.get("expenditure_class")

    old_vals = {
        "uacs_object_code": proposal.uacs_object_code,
        "expenditure_class": proposal.expenditure_class
    }

    if uacs_code:
        proposal.uacs_object_code = str(uacs_code).strip()
    if exp_class:
        proposal.expenditure_class = str(exp_class).strip()
    elif uacs_code:
        if "(CO)" in str(uacs_code):
            proposal.expenditure_class = "Capital Outlay"
        elif "(MOOE)" in str(uacs_code):
            proposal.expenditure_class = "Maintenance and Other Operating Expenses"

    proposal.version += 1

    log_audit_event(
        db=db,
        action="PROPOSAL_UACS_ASSIGNED",
        module="PROPOSALS",
        user_id=admin["id"],
        department_id=proposal.department_id,
        proposal_id=proposal.id,
        ip_address=request.client.host if request.client else None,
        old_value=old_vals,
        new_value={
            "uacs_object_code": proposal.uacs_object_code,
            "expenditure_class": proposal.expenditure_class
        }
    )

    db.commit()
    db.refresh(proposal)
    return {"status": "success", "message": "UACS object code assigned to proposal.", "proposal_id": str(proposal.id)}


# ==========================================================
# GOVERNANCE POLICIES & INFLATION ADJUSTMENT SETTINGS
# ==========================================================

@router.get("/governance/policy-settings", response_model=PolicySettingsResponse)
def get_policy_settings(db: Session = Depends(get_db), admin: dict = Depends(require_admin)):
    policy = get_governance_policy(db)
    return PolicySettingsResponse(
        capitalization_threshold=float(policy["capitalization_threshold"]),
        major_outlay_review_threshold=float(policy["major_outlay_review_threshold"]),
        hardware_replacement_buffer_units=int(policy["hardware_replacement_buffer_units"]),
        canvas_expiration_warning_days=int(policy["canvas_expiration_warning_days"]),
        inflation_rates_by_year={str(k): float(v) for k, v in policy.get("inflation_rates_by_year", {}).items()}
    )


@router.post("/governance/policy-settings")
def update_policy_settings(payload: PolicySettingsUpdate, db: Session = Depends(get_db), admin: dict = Depends(require_admin)):
    def upsert_setting(k, v):
        row = db.query(SystemSetting).filter(SystemSetting.key == k).first()
        if not row:
            db.add(SystemSetting(key=k, value=str(v)))
        else:
            row.value = str(v)

    if payload.capitalization_threshold is not None:
        upsert_setting("capitalization_threshold", payload.capitalization_threshold)
    if payload.major_outlay_review_threshold is not None:
        upsert_setting("major_outlay_review_threshold", payload.major_outlay_review_threshold)
    if payload.hardware_replacement_buffer_units is not None:
        upsert_setting("hardware_replacement_buffer_units", payload.hardware_replacement_buffer_units)
    if payload.canvas_expiration_warning_days is not None:
        upsert_setting("canvas_expiration_warning_days", payload.canvas_expiration_warning_days)

    db.commit()
    return {"status": "success", "message": "Governance policy settings updated."}


@router.get("/governance/inflation-settings", response_model=InflationSettingsResponse)
def get_inflation_settings(db: Session = Depends(get_db), admin: dict = Depends(require_admin)):
    active_period = get_active_issp_period(db)
    narrative = db.query(MasterNarrative).filter(MasterNarrative.issp_period == active_period).first()
    years = get_cycle_year_range(narrative, active_period)
    start_year = years[0] if years else 2026

    policy = get_governance_policy(db)
    stored_rates = policy.get("inflation_rates_by_year", {})

    response_rates = []
    for idx, yr in enumerate(years):
        if idx == 0:
            rate_percent = 0.0
        elif str(yr) in stored_rates:
            rate_percent = float(stored_rates[str(yr)])
        else:
            rate_percent = 3.0 if idx == 1 else (5.0 if idx == 2 else 5.0 + (idx - 2) * 2.0)

        response_rates.append({
            "year": yr,
            "year_index": idx + 1,
            "rate_percent": rate_percent,
            "is_base_year": (idx == 0)
        })

    return InflationSettingsResponse(
        active_cycle=active_period,
        start_year=start_year,
        rates=response_rates
    )


@router.post("/governance/inflation-settings")
def update_inflation_settings(
    payload: InflationSettingsUpdate, 
    db: Session = Depends(get_db), 
    admin: dict = Depends(require_admin)
):
    rates_dict = payload.rates
    setting = db.query(SystemSetting).filter(SystemSetting.key == "inflation_rates_by_year").first()
    if not setting:
        db.add(SystemSetting(key="inflation_rates_by_year", value=json.dumps(rates_dict)))
    else:
        setting.value = json.dumps(rates_dict)

    active_period = get_active_issp_period(db)
    narrative = db.query(MasterNarrative).filter(MasterNarrative.issp_period == active_period).first()
    start_year = narrative.issp_period_from if narrative else 2026

    proposals = db.query(Proposal).filter(Proposal.issp_period == active_period).all()
    for p in proposals:
        base_unit = p.unit_cost if p.unit_cost is not None else Decimal("0.00")
        accumulated = Decimal("0.00")
        for yr_str, qty in (p.yearly_quantities or {}).items():
            try:
                c_yr = int(yr_str)
                q_int = int(qty)
                if q_int > 0:
                    adj_unit = get_adjusted_unit_cost_for_year(db, base_unit, c_yr, start_year)
                    accumulated += Decimal(q_int) * adj_unit
            except (ValueError, TypeError):
                continue
        p.total_cost = accumulated

    db.commit()
    return {
        "status": "success", 
        "message": "Inflation buffer percentages updated and synchronized across all proposal total costs."
    }


# ==========================================================
# DYNAMIC HARMONIZATION CRITERIA CRUD
# ==========================================================

@router.get("/governance/harmonization-criteria", response_model=List[HarmonizationCriterionResponse])
def get_harmonization_criteria(
    db: Session = Depends(get_db), 
    admin: dict = Depends(require_admin)
):
    rows = db.query(DynamicChecklistCriteria).filter(
        DynamicChecklistCriteria.checklist_type == "HARMONIZATION_FRAMEWORK",
        DynamicChecklistCriteria.is_active == True
    ).order_by(DynamicChecklistCriteria.order_index.asc()).all()

    if not rows:
        default_criteria = [
            ("National Prioritization (PDP 2023-2028)", False, "Alignment with National Development Goals"),
            ("Resource Optimization (GovNet, GovCloud)", False, "Shared infrastructure hosting & bandwidth"),
            ("PeGIF Standardized APIs & Interoperability", True, "Interoperability with NGDX/PeGIF"),
            ("Cross-Agency Collaboration (JMC / MOA)", False, "Formal cross-agency governance agreement"),
            ("Scalability and Sustainability (SPAR / PREXC)", True, "Program convergence & performance alignment")
        ]
        for idx, (name, is_mand, desc) in enumerate(default_criteria, start=1):
            crit = DynamicChecklistCriteria(
                checklist_type="HARMONIZATION_FRAMEWORK",
                domain_or_category="Harmonization",
                criteria_name=name,
                is_mandatory=is_mand,
                description=desc,
                order_index=idx,
                is_active=True
            )
            db.add(crit)
        db.commit()
        rows = db.query(DynamicChecklistCriteria).filter(
            DynamicChecklistCriteria.checklist_type == "HARMONIZATION_FRAMEWORK",
            DynamicChecklistCriteria.is_active == True
        ).order_by(DynamicChecklistCriteria.order_index.asc()).all()

    return [
        HarmonizationCriterionResponse(
            id=r.id,
            name=r.criteria_name,
            is_mandatory=r.is_mandatory,
            description=r.description
        ) for r in rows
    ]


@router.post("/governance/harmonization-criteria", response_model=HarmonizationCriterionResponse, status_code=status.HTTP_201_CREATED)
def create_harmonization_criterion(
    payload: HarmonizationCriterionCreate, 
    db: Session = Depends(get_db), 
    admin: dict = Depends(require_admin)
):
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Criterion name is required.")
    
    max_idx = db.query(func.max(DynamicChecklistCriteria.order_index)).filter(
        DynamicChecklistCriteria.checklist_type == "HARMONIZATION_FRAMEWORK"
    ).scalar() or 0

    crit = DynamicChecklistCriteria(
        checklist_type="HARMONIZATION_FRAMEWORK",
        domain_or_category="Harmonization",
        criteria_name=name,
        is_mandatory=payload.is_mandatory,
        description=payload.description,
        order_index=max_idx + 1,
        is_active=True
    )
    db.add(crit)
    db.commit()
    db.refresh(crit)
    return HarmonizationCriterionResponse(
        id=crit.id,
        name=crit.criteria_name,
        is_mandatory=crit.is_mandatory,
        description=crit.description
    )


@router.put("/governance/harmonization-criteria/{criterion_id}", response_model=HarmonizationCriterionResponse)
def update_harmonization_criterion(
    criterion_id: int,
    payload: HarmonizationCriterionUpdate,
    db: Session = Depends(get_db),
    admin: dict = Depends(require_admin)
):
    crit = db.query(DynamicChecklistCriteria).filter(
        DynamicChecklistCriteria.id == criterion_id,
        DynamicChecklistCriteria.checklist_type == "HARMONIZATION_FRAMEWORK"
    ).first()
    if not crit:
        raise HTTPException(status_code=404, detail="Harmonization criterion not found.")

    if payload.name is not None:
        crit.criteria_name = payload.name.strip()
    if payload.is_mandatory is not None:
        crit.is_mandatory = payload.is_mandatory
    if payload.description is not None:
        crit.description = payload.description

    db.commit()
    db.refresh(crit)
    return HarmonizationCriterionResponse(
        id=crit.id,
        name=crit.criteria_name,
        is_mandatory=crit.is_mandatory,
        description=crit.description
    )


@router.delete("/governance/harmonization-criteria/{criterion_id}")
def delete_harmonization_criterion(
    criterion_id: int,
    db: Session = Depends(get_db),
    admin: dict = Depends(require_admin)
):
    crit = db.query(DynamicChecklistCriteria).filter(
        DynamicChecklistCriteria.id == criterion_id,
        DynamicChecklistCriteria.checklist_type == "HARMONIZATION_FRAMEWORK"
    ).first()
    if not crit:
        raise HTTPException(status_code=404, detail="Harmonization criterion not found.")

    db.delete(crit)
    db.commit()
    return {"status": "success", "message": "Harmonization criterion removed from framework."}


# ==========================================================
# DYNAMIC DEVELOPMENT STRATEGIES CRUD
# ==========================================================

@router.get("/governance/development-strategies", response_model=List[DevelopmentStrategyResponse])
def get_development_strategies(
    db: Session = Depends(get_db), 
    admin: dict = Depends(require_admin)
):
    rows = db.query(SystemTaxonomy).filter(
        SystemTaxonomy.taxonomy_type == "DEVELOPMENT_STRATEGY",
        SystemTaxonomy.is_active == True
    ).order_by(SystemTaxonomy.order_index.asc()).all()

    if not rows:
        default_strats = [
            ("IN_HOUSE", "In-House Development", "Internally developed by agency IT"),
            ("OUTSOURCED", "Outsourced", "Contracted to third-party vendor"),
            ("COTS", "Commercial Off-The-Shelf (COTS)", "Commercial off-the-shelf software"),
            ("COMBINATION", "Combination / Hybrid", "Hybrid in-house & vendor development")
        ]
        for idx, (code, name, desc) in enumerate(default_strats, start=1):
            item = SystemTaxonomy(
                taxonomy_type="DEVELOPMENT_STRATEGY",
                code=code,
                display_name=name,
                description=desc,
                order_index=idx,
                is_active=True
            )
            db.add(item)
        db.commit()
        rows = db.query(SystemTaxonomy).filter(
            SystemTaxonomy.taxonomy_type == "DEVELOPMENT_STRATEGY",
            SystemTaxonomy.is_active == True
        ).order_by(SystemTaxonomy.order_index.asc()).all()

    return [
        DevelopmentStrategyResponse(
            code=r.code,
            display_name=r.display_name,
            description=r.description
        ) for r in rows
    ]


@router.post("/governance/development-strategies", response_model=DevelopmentStrategyResponse, status_code=status.HTTP_201_CREATED)
def create_development_strategy(
    payload: DevelopmentStrategyCreate,
    db: Session = Depends(get_db),
    admin: dict = Depends(require_admin)
):
    code_clean = payload.code.strip().upper().replace(" ", "_")
    existing = db.query(SystemTaxonomy).filter(
        SystemTaxonomy.taxonomy_type == "DEVELOPMENT_STRATEGY",
        SystemTaxonomy.code == code_clean
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"Development strategy code '{code_clean}' already exists.")

    max_idx = db.query(func.max(SystemTaxonomy.order_index)).filter(
        SystemTaxonomy.taxonomy_type == "DEVELOPMENT_STRATEGY"
    ).scalar() or 0

    item = SystemTaxonomy(
        taxonomy_type="DEVELOPMENT_STRATEGY",
        code=code_clean,
        display_name=payload.display_name.strip(),
        description=payload.description,
        order_index=max_idx + 1,
        is_active=True
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return DevelopmentStrategyResponse(
        code=item.code,
        display_name=item.display_name,
        description=item.description
    )


@router.delete("/governance/development-strategies/{code}")
def delete_development_strategy(
    code: str,
    db: Session = Depends(get_db),
    admin: dict = Depends(require_admin)
):
    item = db.query(SystemTaxonomy).filter(
        SystemTaxonomy.taxonomy_type == "DEVELOPMENT_STRATEGY",
        SystemTaxonomy.code == code.strip().upper()
    ).first()
    if not item:
        raise HTTPException(status_code=404, detail="Strategy taxonomy not found.")

    db.delete(item)
    db.commit()
    return {"status": "success", "message": f"Strategy taxonomy '{code}' deleted."}


# ==========================================================
# DBM SPREADSHEET EXPORT (CSV FOR OSPS & NEP UPLOADS)
# ==========================================================

@router.get("/governance/export-budget-csv")
def export_budget_csv(
    issp_period: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    admin: dict = Depends(require_admin)
):
    period = issp_period or get_active_issp_period(db)
    
    # Query approved proposals strictly bound to an ICT Project
    items = db.query(Proposal).filter(
        Proposal.issp_period == period,
        func.lower(cast(Proposal.status, String)) == "approved",
        Proposal.project_id.isnot(None),
        or_(Proposal.is_archived == False, Proposal.is_archived.is_(None))
    ).all()

    narrative = db.query(MasterNarrative).filter(MasterNarrative.issp_period == period).first()
    year_range = get_cycle_year_range(narrative, period)
    start_year = year_range[0] if year_range else 2026

    output = io.StringIO()
    writer = csv.writer(output)

    headers = [
        "Strategic Category", "Item Description", "Deployment Office", "Fund Source", 
        "UACS Object Code", "Expenditure Class", "Base Unit Cost (PHP)"
    ]
    for yr in year_range:
        headers.extend([f"FY {yr} Physical Qty", f"FY {yr} Adjusted Unit Cost", f"FY {yr} Subtotal Outlay (PHP)"])
    headers.extend(["Total Physical Units", "Grand Total Outlay (PHP)"])
    writer.writerow(headers)

    for itm in items:
        base_cost = itm.unit_cost or Decimal("0.00")
        row = [
            itm.strategic_category,
            itm.item_name,
            itm.target_office_automated or itm.office_location,
            itm.fund_source,
            itm.uacs_object_code,
            itm.expenditure_class,
            f"{float(base_cost):.2f}"
        ]
        q_map = itm.yearly_quantities or {}
        for yr in year_range:
            qty = int(q_map.get(str(yr), 0))
            adj_unit = get_adjusted_unit_cost_for_year(db, base_cost, yr, start_year)
            subtotal = Decimal(qty) * adj_unit
            row.extend([qty, f"{float(adj_unit):.2f}", f"{float(subtotal):.2f}"])

        row.extend([itm.total_qty, f"{float(itm.total_cost):.2f}"])
        writer.writerow(row)

    output.seek(0)
    filename = f"ISSP_{period}_Part_IV_A_DBM_Export.csv"
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


# ==========================================================
# COMPILER VERIFICATION FOR INDIVIDUAL MODULES
# ==========================================================

@router.post("/governance/verify-compiler-sync")
def verify_compiler_sync(
    module: str = Query(..., description="Module identifier (e.g. outcomes, concerns, systems, projects, cross_projects, metrics, budget, parity, inventory, framework, glossary, staff, diagrams, narratives)"),
    issp_period: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    admin: dict = Depends(require_admin)
):
    """
    Audits an individual module's database records against the DICT Singularity Graph and compilation engine.
    Ensures zero runtime disconnects before document generation is initiated.
    """
    target_period = issp_period or get_active_issp_period(db)
    narrative = db.query(MasterNarrative).filter(MasterNarrative.issp_period == target_period).first()
    if not narrative:
        raise HTTPException(status_code=400, detail=f"Planning cycle '{target_period}' is not configured.")

    mod_clean = module.strip().lower()
    report = {
        "status": "VERIFIED",
        "module": module,
        "issp_period": target_period,
        "records_count": 0,
        "compiler_ready": True,
        "message": f"All '{module}' records are verified in the compiler database and ready for document generation.",
        "checks": [],
        "warnings": []
    }

    if mod_clean in ["outcomes", "part_i", "part_i_a4"]:
        outcomes = db.query(OrganizationalOutcome).filter(OrganizationalOutcome.issp_period == target_period).all()
        report["records_count"] = len(outcomes)
        if len(outcomes) == 0:
            report["compiler_ready"] = False
            report["status"] = "DISCONNECT"
            report["warnings"].append("No Organizational Outcomes (Part I.A.4) registered. At least one is mandatory.")
        else:
            unlinked = []
            for oo in outcomes:
                c_cnt = db.query(StrategicConcern).filter(
                    StrategicConcern.issp_period == target_period,
                    or_(
                        StrategicConcern.outcome_id == oo.id,
                        func.lower(func.trim(StrategicConcern.mfo)) == func.lower(func.trim(oo.outcome_name or oo.program_name or ""))
                    )
                ).count()
                if c_cnt == 0:
                    unlinked.append(oo.outcome_name or oo.program_name)
            if unlinked:
                report["compiler_ready"] = False
                report["status"] = "DISCONNECT"
                report["warnings"].append(f"Outcome(s) not yet mapped to any Strategic Concern: {', '.join(unlinked)}")
            report["checks"].append(f"✓ {len(outcomes)} statutory Program Outcomes verified in database.")

    elif mod_clean in ["concerns", "part_ii_a", "strategic_concerns"]:
        concerns = db.query(StrategicConcern).filter(StrategicConcern.issp_period == target_period).all()
        report["records_count"] = len(concerns)
        unmapped = []
        for c in concerns:
            s_cnt = db.query(InformationSystem).filter(
                InformationSystem.issp_period == target_period,
                or_(
                    InformationSystem.strategic_concern_id == c.id, 
                    func.lower(func.trim(InformationSystem.name)) == func.lower(func.trim(c.critical_system))
                )
            ).count()

            p_cnt = db.query(IctProject).filter(
                IctProject.issp_period == target_period,
                or_(
                    func.lower(func.trim(IctProject.project_title)).contains(func.lower(func.trim(c.critical_system))),
                    func.lower(func.trim(IctProject.description)).contains(func.lower(func.trim(c.critical_system)))
                )
            ).count()

            prop_cnt = db.query(Proposal).filter(
                Proposal.issp_period == target_period,
                or_(
                    func.lower(func.trim(Proposal.item_name)).contains(func.lower(func.trim(c.critical_system))),
                    func.lower(func.trim(Proposal.justification)).contains(func.lower(func.trim(c.critical_system)))
                )
            ).count()

            na_cnt = db.query(NeedsAssessment).filter(
                NeedsAssessment.strategic_concern_id == c.id
            ).count()

            if (s_cnt + p_cnt + prop_cnt + na_cnt) == 0:
                unmapped.append(c.critical_system)
        if unmapped:
            report["compiler_ready"] = False
            report["status"] = "DISCONNECT"
            report["warnings"].append(f"Concern(s) with no System, Project, Hardware, or Needs Assessment addressing them: {', '.join(unmapped)}")
        report["checks"].append(f"✓ {len(concerns)} Strategic Concerns indexed for Table II.A.")

    elif mod_clean in ["systems", "part_ii_c", "part_iii_d", "information_systems"]:
        systems = db.query(InformationSystem).filter(InformationSystem.issp_period == target_period).all()
        report["records_count"] = len(systems)
        pending_review = [s.name for s in systems if getattr(s, "submission_status", "Approved") in ["Draft", "Submitted", "Returned"]]
        if pending_review:
            report["compiler_ready"] = False
            report["status"] = "DISCONNECT"
            report["warnings"].append(f"Department-proposed systems pending MIS review: {', '.join(pending_review)}")
        for s in systems:
            if s.processes_personal_information and not s.has_undergone_pia and not getattr(s, "pia_target_date_text", None):
                report["compiler_ready"] = False
                report["status"] = "DISCONNECT"
                report["warnings"].append(f"System '{s.name}' processes personal data without a completed PIA or Target Audit Date [1].")
        report["checks"].append(f"✓ {len(systems)} Information Systems ready for Parts II.C & III.D.")

    elif mod_clean in ["projects", "part_iii_e", "part_iii_e1", "ict_projects"]:
        projects = db.query(IctProject).filter(
            IctProject.issp_period == target_period,
            ~IctProject.project_category.ilike("%cross%")
        ).all()
        report["records_count"] = len(projects)
        unfunded = []
        missing_kpis = []
        for p in projects:
            p_cost = float(p.computed_total_project_cost or 0)
            if p_cost == 0:
                unfunded.append(p.project_title)
            kpi_cnt = db.query(PerformanceMetric).filter(
                PerformanceMetric.issp_period == target_period,
                or_(PerformanceMetric.project_id == p.id, func.lower(func.trim(PerformanceMetric.project_title)) == func.lower(func.trim(p.project_title)))
            ).count()
            if kpi_cnt == 0:
                missing_kpis.append(p.project_title)
        if unfunded:
            report["compiler_ready"] = False
            report["status"] = "DISCONNECT"
            report["warnings"].append(f"Internal project(s) with ₱0.00 allocated line items: {', '.join(unfunded)}")
        if missing_kpis:
            report["compiler_ready"] = False
            report["status"] = "DISCONNECT"
            report["warnings"].append(f"Project(s) lacking PMF KPIs in Part III.F: {', '.join(missing_kpis)}")
        report["checks"].append(f"✓ {len(projects)} Internal ICT Projects validated for Part III.E.1.")

    elif mod_clean in ["cross_projects", "part_iii_e2"]:
        cross_projects = db.query(IctProject).filter(
            IctProject.issp_period == target_period,
            IctProject.project_category.ilike("%cross%")
        ).all()
        report["records_count"] = len(cross_projects)
        missing_lead = [p.project_title for p in cross_projects if not p.lead_agency or not p.lead_agency.strip()]
        if missing_lead:
            report["compiler_ready"] = False
            report["status"] = "DISCONNECT"
            report["warnings"].append(f"Cross-Agency project(s) missing mandatory designated Lead Agency: {', '.join(missing_lead)}")
        report["checks"].append(f"✓ {len(cross_projects)} Cross-Agency ICT Projects registered for Part III.E.2.")

    elif mod_clean in ["metrics", "part_iii_f", "pmf"]:
        metrics = db.query(PerformanceMetric).filter(PerformanceMetric.issp_period == target_period).all()
        report["records_count"] = len(metrics)
        report["checks"].append(f"✓ {len(metrics)} PMF Scorecard KPIs ready for Part III.F.")

    elif mod_clean in ["budget", "ceilings", "allocations"]:
        ceilings = db.query(BudgetCeiling).filter(BudgetCeiling.issp_period == target_period).all()
        report["records_count"] = len(ceilings)
        report["checks"].append(f"✓ {len(ceilings)} Department Budget Sub-Ceilings configured.")

    elif mod_clean in ["parity", "part_iv_b"]:
        matrices = calculate_financial_summaries(db, target_period, only_approved=True)
        report["compiler_ready"] = matrices["is_parity_valid"]
        report["status"] = "VERIFIED" if matrices["is_parity_valid"] else "DISCONNECT"
        report["checks"].append(f"✓ Certified Grand Total: ₱{matrices['certified_grand_total']:,.2f}")
        if not matrices["is_parity_valid"]:
            report["warnings"].append(f"Parity mismatch: Tables B.1-B.4 differ by ₱{matrices['parity_discrepancy']:,.2f}")

    elif mod_clean in ["inventory", "annex1"]:
        items = db.query(ExistingInventory).filter(
            or_(ExistingInventory.issp_period == target_period, ExistingInventory.issp_period.is_(None))
        ).all()
        report["records_count"] = len(items)
        report["checks"].append(f"✓ {len(items)} physical and software asset line items cataloged in Annex 1 [4].")

    elif mod_clean in ["framework", "checklists"]:
        cyber_count = db.query(CybersecurityControl).filter(CybersecurityControl.issp_period == target_period).count()
        egov_count = db.query(EGovernmentChecklist).filter(EGovernmentChecklist.issp_period == target_period).count()
        dr_count = db.query(DisasterRecoveryTeam).filter(DisasterRecoveryTeam.issp_period == target_period).count()
        report["records_count"] = cyber_count + egov_count + dr_count
        report["checks"].append(f"✓ Checklists verified: {cyber_count} Cybersecurity Controls, {egov_count} EGP items, {dr_count} DRT personnel.")

    elif mod_clean in ["glossary", "definitions"]:
        items = db.query(GlossaryTerm).all()
        report["records_count"] = len(items)
        report["checks"].append(f"✓ {len(items)} Glossary definitions ready for Page 5 compilation.")

    elif mod_clean in ["staff", "part_iii_c", "positions"]:
        staff = db.query(IctStaffPosition).filter(IctStaffPosition.issp_period == target_period).all()
        hc = db.query(HumanCapital).filter(HumanCapital.issp_period == target_period, HumanCapital.is_proposed == True).all()
        report["records_count"] = len(staff) + len(hc)
        report["checks"].append(f"✓ {len(staff)} Proposed ICT staff position profiles ready for Part III.C.")

    elif mod_clean in ["diagrams", "vault"]:
        schematics = [
            ("Agency Logo", getattr(narrative, "agency_logo_url", None)),
            ("Existing Network Diagram", getattr(narrative, "network_diagram_url", None)),
            ("Proposed Fiber Backbone", getattr(narrative, "fiber_backbone_url", None)),
            ("Enterprise Architecture", getattr(narrative, "system_architecture_url", None)),
        ]
        attached = [name for name, url in schematics if url]
        report["records_count"] = len(attached)
        report["checks"].append(f"✓ {len(attached)}/4 Primary Document Schematics attached.")

    elif mod_clean in ["narratives", "part_i"]:
        report["records_count"] = 1
        if not narrative.mandate_text or len(narrative.mandate_text.strip()) < 15:
            report["compiler_ready"] = False
            report["status"] = "DISCONNECT"
            report["warnings"].append("Legal Mandate (Part I.A.1) text is empty or missing statutory basis.")
        if not narrative.signatory_prepared_by or not narrative.signatory_approved_by:
            report["compiler_ready"] = False
            report["status"] = "DISCONNECT"
            report["warnings"].append("Signatories (CIO and Agency Head) are incomplete on the coversheet.")
        report["checks"].append("✓ Master Narrative coversheet and strategic context verified.")

    if not report["compiler_ready"]:
        report["message"] = f"{len(report['warnings'])} compiler pipeline disconnect(s) detected for '{module}'."

    return report


@router.get("/governance/fund-sources")
def get_fund_sources(db: Session = Depends(get_db), admin: dict = Depends(require_admin)):
    rows = db.query(SystemTaxonomy).filter(
        SystemTaxonomy.taxonomy_type == "FUND_SOURCE",
        SystemTaxonomy.is_active == True
    ).order_by(SystemTaxonomy.order_index.asc()).all()
    if not rows:
        default_sources = [
            ("GAA", "General Appropriations Act (GAA)", 1),
            ("FAP", "Foreign-Assisted Projects (FAP)", 2),
            ("LOCALLY_FUNDED", "Locally Funded", 3),
            ("OTHER_INCOME", "Other Income Generating Sources", 4)
        ]
        for code, name, idx in default_sources:
            item = SystemTaxonomy(
                taxonomy_type="FUND_SOURCE",
                code=code,
                display_name=name,
                order_index=idx,
                is_active=True
            )
            db.add(item)
        db.commit()
        rows = db.query(SystemTaxonomy).filter(
            SystemTaxonomy.taxonomy_type == "FUND_SOURCE",
            SystemTaxonomy.is_active == True
        ).order_by(SystemTaxonomy.order_index.asc()).all()
    return [{"code": r.code, "display_name": r.display_name, "description": r.description} for r in rows]


@router.post("/governance/fund-sources")
def create_fund_source(payload: Dict[str, Any], db: Session = Depends(get_db), admin: dict = Depends(require_admin)):
    display_name = payload.get("display_name", "").strip()
    code = (payload.get("code") or display_name.upper().replace(" ", "_")).strip()
    if not display_name:
        raise HTTPException(status_code=400, detail="Fund source display name is required.")
    item = SystemTaxonomy(
        taxonomy_type="FUND_SOURCE",
        code=code,
        display_name=display_name,
        description=payload.get("description"),
        is_active=True
    )
    db.add(item)
    db.commit()
    return {"status": "success", "code": item.code, "display_name": item.display_name}


@router.delete("/governance/fund-sources/{code}")
def delete_fund_source(code: str, db: Session = Depends(get_db), admin: dict = Depends(require_admin)):
    item = db.query(SystemTaxonomy).filter(
        SystemTaxonomy.taxonomy_type == "FUND_SOURCE",
        SystemTaxonomy.code == code.strip()
    ).first()
    if not item:
        raise HTTPException(status_code=404, detail="Fund source taxonomy not found.")
    db.delete(item)
    db.commit()
    return {"status": "success", "message": f"Fund source '{code}' deleted."}


# ==========================================================
# PART IV.B: LIVE FOUR-WAY PARITY & SINGULARITY GRAPH AUDIT
# ==========================================================

@router.get("/governance/parity-matrices", response_model=PartIVBParityResponse)
def get_parity_matrices(
    issp_period: Optional[str] = Query(None),
    only_approved: bool = Query(False, description="Filter for approved proposals only; defaults to False for live parity"),
    db: Session = Depends(get_db),
    user: dict = Depends(require_user)
):
    period = issp_period or get_active_issp_period(db)
    matrices = ISSPSingularityEngine.calculate_part_iv_b_matrices(db, period, only_approved=only_approved)
    return PartIVBParityResponse(
        b1_general_summary=matrices["b1_general_summary"],
        b2_fund_source=matrices["b2_fund_source"],
        b3_statement_of_expenditure=matrices["b3_statement_of_expenditure"],
        b4_object_of_expenditure=matrices["b4_object_of_expenditure"],
        certified_grand_total=matrices["certified_grand_total"],
        is_parity_valid=matrices["is_parity_valid"],
        parity_discrepancy=matrices["parity_discrepancy"],
        year_columns=matrices.get("year_columns", [])
    )


@router.get("/governance/validate-graph")
def audit_singularity_graph(
    issp_period: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    admin: dict = Depends(require_admin)
):
    period = issp_period or get_active_issp_period(db)
    return ISSPSingularityEngine.validate_complete_issp_graph(db, period)


@router.post("/governance/evaluate-lifecycle-rollover", response_model=LifecycleRolloverResponse)
def evaluate_lifecycle_rollover(
    force: bool = Query(False, description="Force rollover even if cycle end year has not passed"),
    db: Session = Depends(get_db),
    admin: dict = Depends(require_admin)
):
    try:
        result = ISSPLifecycleEngine.evaluate_and_rollover_cycle(db, force=force)
        return result
    except Exception as e:
        logger.error(f"Failed to evaluate lifecycle rollover: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Lifecycle rollover failed: {str(e)}")


@router.post("/governance/restore-document")
def restore_governance_document(
    payload: Dict[str, Any],
    db: Session = Depends(get_db),
    admin: dict = Depends(require_admin)
):
    cycle = payload.get("cycle") or payload.get("issp_period")
    if not cycle:
        raise HTTPException(status_code=400, detail="Planning cycle is required for restoration.")
    return {
        "status": "restoring",
        "message": f"Archived plan retrieval job initiated for cycle FY {cycle}."
    }


# ==========================================================
# QUEUES, PROPOSALS & OVERRIDES (Part IV.A Financial Atoms)
# ==========================================================

@router.get("/proposals")
def get_admin_master_queue(
    dept_id: Optional[int] = Query(None),
    status_filter: Optional[str] = Query(None),
    strategic_category: Optional[str] = Query(None),
    issp_period: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: Optional[int] = Query(1000, ge=1, le=100000),
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_supply_or_admin)
):
    try:
        query = db.query(Proposal).options(
            joinedload(Proposal.outcome),
            joinedload(Proposal.project_rel),
            joinedload(Proposal.needs_assessment),
            joinedload(Proposal.department)
        ).filter(or_(Proposal.is_archived == False, Proposal.is_archived.is_(None)))
        
        if dept_id:
            query = query.filter(Proposal.department_id == dept_id)
        if status_filter and status_filter.strip().lower() != "all":
            clean_status = status_filter.strip().lower()
            query = query.filter(func.lower(cast(Proposal.status, String)) == clean_status)

        if strategic_category and strategic_category.strip().lower() != "all":
            clean_cat = strategic_category.strip().lower()
            query = query.filter(func.lower(cast(Proposal.strategic_category, String)) == clean_cat)

        if issp_period and issp_period.strip().lower() != "all":
            query = query.filter(Proposal.issp_period == issp_period.strip())
        if search:
            query = query.filter(Proposal.item_name.ilike(f"%{search}%"))

        total = query.count()
        effective_limit = limit or 1000
        results = query.order_by(Proposal.version.desc()).offset(skip).limit(effective_limit).all()

        serialized_data = []
        for p in results:
            try:
                serialized_data.append(ProposalResponse.model_validate(p))
            except Exception as ser_err:
                logger.debug(f"Direct serialization note: {ser_err}")
                serialized_data.append(p)

        return {"total": total, "skip": skip, "limit": effective_limit, "data": serialized_data}
    except Exception as e:
        logger.error(f"Error querying master queue: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to fetch master queue.")


@router.post("/proposals/batch-approve")
def batch_approve_proposals(
    payload: Union[BatchApprovePayload, Dict[str, Any]],
    request: Request,
    db: Session = Depends(get_db),
    admin: dict = Depends(require_admin)
):
    """1-Click batch approval of submitted proposals into the Intake Pool."""
    raw_ids = []
    if isinstance(payload, BatchApprovePayload):
        raw_ids = payload.proposal_ids
    elif isinstance(payload, dict):
        raw_ids = payload.get("proposal_ids", [])
    
    if not raw_ids:
        raise HTTPException(status_code=400, detail="No proposal IDs provided for batch approval.")

    proposal_uuids = []
    for pid in raw_ids:
        try:
            proposal_uuids.append(uuid.UUID(str(pid).strip()))
        except Exception:
            continue

    if not proposal_uuids:
        raise HTTPException(status_code=400, detail="No valid proposal UUIDs found.")

    proposals = db.query(Proposal).filter(
        Proposal.id.in_(proposal_uuids),
        func.lower(cast(Proposal.status, String)) == "submitted"
    ).all()

    default_outcome = None
    for p in proposals:
        if not p.outcome_id:
            if not default_outcome:
                default_outcome = db.query(OrganizationalOutcome).filter(
                    OrganizationalOutcome.issp_period == p.issp_period
                ).first()
            if default_outcome:
                p.outcome_id = default_outcome.id

        old_status = p.status
        p.status = "Approved"
        p.version += 1
        log_audit_event(
            db=db,
            action="STATE_TRANSITION_APPROVED",
            module="PROPOSALS",
            user_id=admin["id"],
            department_id=p.department_id,
            proposal_id=p.id,
            ip_address=request.client.host if request.client else None,
            old_value={"status": old_status},
            new_value={"status": "Approved", "outcome_id": p.outcome_id, "project_id": str(p.project_id) if p.project_id else None}
        )

    db.commit()
    return {"status": "success", "approved_count": len(proposals)}


@router.post("/proposals", response_model=ProposalResponse, status_code=status.HTTP_201_CREATED)
def admin_create_proposal(
    payload: ProposalCreatePayload,
    request: Request,
    db: Session = Depends(get_db),
    admin: dict = Depends(require_admin)
):
    active_period = get_active_issp_period(db)
    target_dept_id = getattr(payload, "department_id", None) or 1
    target_dept = db.query(Department).filter(Department.id == target_dept_id).first()
    automated_office = target_dept.name if target_dept else "Central Office"

    is_turnover = bool(getattr(payload, "is_in_house_turnover", False) or getattr(payload, "created_by_students", False))

    outcome_id = payload.outcome_id
    if not outcome_id:
        default_oo = db.query(OrganizationalOutcome).filter(
            OrganizationalOutcome.issp_period == active_period
        ).first()
        if default_oo:
            outcome_id = default_oo.id

    sc_name = payload.strategic_category or "Office Productivity"
    strat_cat_id = getattr(payload, "strategic_category_id", None)
    if not strat_cat_id and sc_name:
        sc_row = db.query(StrategicCategory).filter(func.lower(StrategicCategory.name) == sc_name.lower().strip()).first()
        if sc_row:
            strat_cat_id = sc_row.id

    uacs_code, exp_class = classify_uacs_and_expenditure(
        item_name=payload.item_name,
        unit_cost=payload.unit_cost,
        strategic_category=sc_name,
        category=payload.category,
        created_by_students=is_turnover,
        is_in_house_turnover=is_turnover,
        db=db
    )

    _, aligned_quantities = align_and_validate_years(db, payload.yearly_quantities or {}, is_submitting=False)

    db_proposal = Proposal(
        department_id=target_dept_id,
        issp_period=active_period,
        outcome_id=outcome_id,
        project_id=payload.project_id,
        needs_assessment_id=getattr(payload, "needs_assessment_id", None),
        strategic_category_id=strat_cat_id,
        category=payload.category or "Hardware",
        strategic_category=sc_name,
        office_location=payload.office_location or "Central Office",
        fund_source=payload.fund_source or "General Appropriations Act (GAA)",
        uacs_object_code=getattr(payload, "uacs_object_code", None) or uacs_code,
        expenditure_class=getattr(payload, "expenditure_class", None) or exp_class,
        status="Approved",
        item_key=payload.item_select or "other",
        item_name=payload.item_name,
        unit_cost=payload.unit_cost,
        yearly_quantities=aligned_quantities,
        justification=payload.justification,
        system_development_status=payload.system_development_status or "N/A",
        created_by_students=is_turnover,
        is_in_house_turnover=is_turnover,
        target_office_automated=automated_office,
        canvas_evidence_url=payload.canvas_evidence_url,
        canvas_expiration_date=payload.canvas_expiration_date,
        supplier_name=payload.supplier_name,
        comments=[],
        is_expansion=payload.is_expansion
    )

    db.add(db_proposal)
    db.flush()

    log_audit_event(
        db=db,
        action="PROPOSAL_CREATED_BY_ADMIN",
        module="PROPOSALS",
        user_id=admin["id"],
        department_id=target_dept_id,
        proposal_id=db_proposal.id,
        ip_address=request.client.host if request.client else None,
        new_value={"item_name": db_proposal.item_name, "total_cost": float(db_proposal.total_cost)}
    )

    db.commit()
    db.refresh(db_proposal)
    return db_proposal


@router.put("/proposals/{proposal_id}/approve")
def approve_proposal(
    proposal_id: uuid.UUID,
    request: Request,
    db: Session = Depends(get_db),
    admin: dict = Depends(require_admin)
):
    proposal = db.query(Proposal).filter(Proposal.id == proposal_id).first()
    if not proposal:
        raise HTTPException(status_code=404, detail="Proposal not found.")

    if not proposal.outcome_id:
        default_outcome = db.query(OrganizationalOutcome).filter(
            OrganizationalOutcome.issp_period == proposal.issp_period
        ).first()
        if default_outcome:
            proposal.outcome_id = default_outcome.id
        else:
            raise HTTPException(
                status_code=400,
                detail="Approval Blocked: Please assign an Organizational Outcome (Part I.A.4) to this proposal via Override before approving."
            )

    old_status = proposal.status
    proposal.status = "Approved"
    proposal.version += 1

    log_audit_event(
        db=db,
        action="STATE_TRANSITION_APPROVED",
        module="PROPOSALS",
        user_id=admin["id"],
        department_id=proposal.department_id,
        proposal_id=proposal.id,
        ip_address=request.client.host if request.client else None,
        old_value={"status": old_status},
        new_value={
            "status": "Approved", 
            "outcome_id": proposal.outcome_id,
            "project_id": str(proposal.project_id) if proposal.project_id else None
        }
    )
    db.commit()
    db.refresh(proposal)
    return {
        "status": "success", 
        "message": "Proposal approved successfully into Intake Pool. Please bind it to an ICT Project to define its categorization in the plan.", 
        "proposal_id": proposal.id
    }


@router.put("/proposals/{proposal_id}/return")
def return_proposal(
    proposal_id: uuid.UUID,
    request: Request,
    db: Session = Depends(get_db),
    admin: dict = Depends(require_admin)
):
    proposal = db.query(Proposal).filter(Proposal.id == proposal_id).first()
    if not proposal:
        raise HTTPException(status_code=404, detail="Proposal not found.")

    old_status = proposal.status
    proposal.status = "Returned"
    proposal.version += 1

    log_audit_event(
        db=db,
        action="STATE_TRANSITION_RETURNED",
        module="PROPOSALS",
        user_id=admin["id"],
        department_id=proposal.department_id,
        proposal_id=proposal.id,
        ip_address=request.client.host if request.client else None,
        old_value={"status": old_status},
        new_value={"status": "Returned"}
    )
    db.commit()
    db.refresh(proposal)
    return {"status": "success", "message": "Proposal returned to department.", "proposal_id": proposal.id}


@router.put("/proposals/{proposal_id}/override")
def admin_override_proposal(
    proposal_id: uuid.UUID, 
    payload: AdminOverridePayload,
    request: Request,
    db: Session = Depends(get_db),
    admin: dict = Depends(require_admin)
):
    try:
        proposal = db.query(Proposal).filter(
            Proposal.id == proposal_id,
            or_(Proposal.is_archived == False, Proposal.is_archived.is_(None))
        ).first()

        if not proposal:
            raise HTTPException(status_code=404, detail="Proposal not found.")

        old_state = {
            "item_name": proposal.item_name,
            "unit_cost": float(proposal.unit_cost) if proposal.unit_cost is not None else 0.0,
            "total_qty": proposal.total_qty,
            "outcome_id": proposal.outcome_id,
            "project_id": str(proposal.project_id) if proposal.project_id else None,
            "strategic_category": proposal.strategic_category,
            "office_location": proposal.office_location,
            "fund_source": proposal.fund_source,
            "uacs_object_code": proposal.uacs_object_code,
            "expenditure_class": proposal.expenditure_class
        }

        if payload.item_name is not None:
            proposal.item_name = html.escape(payload.item_name.strip())
        if payload.unit_cost is not None:
            proposal.unit_cost = payload.unit_cost
        if payload.outcome_id is not None:
            proposal.outcome_id = payload.outcome_id
            
        if payload.project_id is not None:
            proposal.project_id = payload.project_id
            if payload.project_id:
                proj = db.query(IctProject).filter(IctProject.id == payload.project_id).first()
                if proj:
                    proposal.fund_source = str(getattr(proj.funding_source, "value", proj.funding_source) or "General Appropriations Act (GAA)")
                    proposal.strategic_category = str(getattr(proj.project_category, "value", proj.project_category) or "Internal ICT Projects")
                    sc_row = db.query(StrategicCategory).filter(
                        func.lower(StrategicCategory.name) == func.lower(proposal.strategic_category)
                    ).first()
                    proposal.strategic_category_id = sc_row.id if sc_row else None
            else:
                if payload.strategic_category is None:
                    proposal.strategic_category = "Office Productivity"
                    sc_row = db.query(StrategicCategory).filter(
                        func.lower(StrategicCategory.name) == "office productivity"
                    ).first()
                    if sc_row:
                        proposal.strategic_category_id = sc_row.id

        if getattr(payload, "needs_assessment_id", None) is not None:
            proposal.needs_assessment_id = payload.needs_assessment_id
        if getattr(payload, "strategic_category_id", None) is not None:
            proposal.strategic_category_id = payload.strategic_category_id
        if payload.category is not None:
            proposal.category = str(getattr(payload.category, "value", payload.category))
        if payload.strategic_category is not None and not payload.project_id:
            proposal.strategic_category = str(getattr(payload.strategic_category, "value", payload.strategic_category))
            sc_row = db.query(StrategicCategory).filter(
                func.lower(StrategicCategory.name) == str(proposal.strategic_category).strip().lower()
            ).first()
            if sc_row:
                proposal.strategic_category_id = sc_row.id
        if payload.office_location is not None:
            proposal.office_location = str(getattr(payload.office_location, "value", payload.office_location))
        if payload.fund_source is not None and not payload.project_id:
            proposal.fund_source = str(getattr(payload.fund_source, "value", payload.fund_source))
        if payload.justification is not None:
            proposal.justification = html.escape(payload.justification.strip())
        if payload.system_development_status is not None:
            proposal.system_development_status = str(getattr(payload.system_development_status, "value", payload.system_development_status))
        
        is_turnover = getattr(payload, "is_in_house_turnover", None)
        if is_turnover is None:
            is_turnover = getattr(payload, "created_by_students", None)
        if is_turnover is not None:
            proposal.is_in_house_turnover = bool(is_turnover)
            proposal.created_by_students = bool(is_turnover)

        if payload.yearly_quantities is not None:
            _, aligned_quantities = align_and_validate_years(db, payload.yearly_quantities, is_submitting=False)
            proposal.yearly_quantities = aligned_quantities

        # Preserve Admin-assigned UACS object code and expenditure class without overwriting
        if getattr(payload, "uacs_object_code", None):
            proposal.uacs_object_code = str(getattr(payload.uacs_object_code, "value", payload.uacs_object_code))
        if getattr(payload, "expenditure_class", None):
            proposal.expenditure_class = str(getattr(payload.expenditure_class, "value", payload.expenditure_class))
        elif proposal.uacs_object_code:
            if "(CO)" in proposal.uacs_object_code:
                proposal.expenditure_class = "Capital Outlay"
            elif "(MOOE)" in proposal.uacs_object_code:
                proposal.expenditure_class = "Maintenance and Other Operating Expenses"

        if not proposal.uacs_object_code or not proposal.expenditure_class:
            uacs, exp_class = classify_uacs_and_expenditure(
                item_name=proposal.item_name,
                unit_cost=proposal.unit_cost,
                strategic_category=proposal.strategic_category,
                category=proposal.category,
                created_by_students=proposal.is_in_house_turnover,
                is_in_house_turnover=proposal.is_in_house_turnover,
                db=db
            )
            if not proposal.uacs_object_code:
                proposal.uacs_object_code = uacs
            if not proposal.expenditure_class:
                proposal.expenditure_class = exp_class

        proposal.version += 1

        new_state = {
            "item_name": proposal.item_name,
            "unit_cost": float(proposal.unit_cost) if proposal.unit_cost is not None else 0.0,
            "total_qty": proposal.total_qty,
            "outcome_id": proposal.outcome_id,
            "project_id": str(proposal.project_id) if proposal.project_id else None,
            "strategic_category": proposal.strategic_category,
            "office_location": proposal.office_location,
            "fund_source": proposal.fund_source,
            "uacs_object_code": proposal.uacs_object_code,
            "expenditure_class": proposal.expenditure_class
        }

        log_audit_event(
            db=db,
            action="PROPOSAL_OVERRIDDEN_BY_ADMIN",
            module="PROPOSALS",
            user_id=admin["id"],
            department_id=proposal.department_id,
            proposal_id=proposal.id,
            ip_address=request.client.host if request.client else None,
            old_value=old_state,
            new_value=new_state
        )
        db.commit()
        db.refresh(proposal)

        return {"status": "success", "message": "Proposal overridden successfully.", "proposal_id": str(proposal.id)}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Override failure: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Database failure during override.")


@router.delete("/proposals/{proposal_id}")
def admin_delete_proposal(
    proposal_id: uuid.UUID,
    request: Request,
    db: Session = Depends(get_db),
    admin: dict = Depends(require_admin)
):
    proposal = db.query(Proposal).filter(Proposal.id == proposal_id).first()
    if not proposal:
        raise HTTPException(status_code=404, detail="Proposal not found.")

    deleted_snapshot = {
        "item_name": proposal.item_name,
        "total_cost": float(proposal.total_cost),
        "department_id": proposal.department_id
    }
    dept_id = proposal.department_id

    db.delete(proposal)
    log_audit_event(
        db=db,
        action="PROPOSAL_DELETED_BY_ADMIN",
        module="PROPOSALS",
        user_id=admin["id"],
        department_id=dept_id,
        proposal_id=proposal_id,
        ip_address=request.client.host if request.client else None,
        old_value=deleted_snapshot
    )

    db.commit()
    return {"status": "success", "message": "Proposal line item deleted."}


@router.get("/proposals/approved-canvas")
def get_approved_canvas_proposals(
    issp_period: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_supply_or_admin)
):
    period = issp_period or get_active_issp_period(db)
    approved = db.query(Proposal).filter(
        Proposal.issp_period == period,
        func.lower(cast(Proposal.status, String)) == "approved",
        Proposal.canvas_evidence_url.isnot(None),
        or_(Proposal.is_archived == False, Proposal.is_archived.is_(None))
    ).all()

    return [
        {
            "id": str(p.id),
            "type": "CapEx" if "capital" in (p.expenditure_class or "").lower() else "MOOE",
            "display_name": p.item_name,
            "unit_cost": float(p.unit_cost or 0),
            "supplier_name": p.supplier_name,
            "canvas_evidence_url": p.canvas_evidence_url,
            "canvas_expiration_date": p.canvas_expiration_date.isoformat() if p.canvas_expiration_date else None
        }
        for p in approved
    ]


# ==========================================================
# RESET PLANNING CYCLE (Safe Flush for Draft States)
# ==========================================================

@router.post("/narratives/{issp_period}/reset")
def reset_planning_cycle(
    issp_period: str,
    request: Request,
    db: Session = Depends(get_db),
    admin: dict = Depends(require_admin)
):
    """
    Safely resets the active planning cycle:
    Flushes unapproved proposal drafts and resets submitted systems back to Draft mode.
    Preserves approved items and statutory master narratives intact.
    """
    try:
        deleted_count = db.query(Proposal).filter(
            Proposal.issp_period == issp_period,
            func.lower(cast(Proposal.status, String)) == ["draft", "returned"]
        ).delete(synchronize_session=False)

        db.query(InformationSystem).filter(
            InformationSystem.issp_period == issp_period,
            func.lower(cast(InformationSystem.submission_status, String)) == "submitted"
        ).update({"submission_status": "Draft"}, synchronize_session=False)

        log_audit_event(
            db=db,
            action="PLANNING_CYCLE_RESET",
            module="GOVERNANCE",
            user_id=admin["id"],
            ip_address=request.client.host if request.client else None,
            new_value={"issp_period": issp_period, "purged_drafts": deleted_count}
        )
        db.commit()
        return {"status": "success", "message": f"Planning cycle FY {issp_period} safely reset. Purged {deleted_count} draft items."}
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to reset cycle '{issp_period}': {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to reset cycle: {str(e)}")


# ==========================================================
# ASYNC COMPILATION & RESILIENT BACKGROUND TASKS
# ==========================================================

@router.post("/governance/generate-issp")
def trigger_document_generation(
    issp_period: Optional[str] = Query(None),
    export_format: str = Query("pdf", description="Format output: 'pdf' or 'docx'"),
    db: Session = Depends(get_db),
    admin: dict = Depends(require_admin)
):
    """
    Triggers document compilation (PDF or DOCX).
    Resilience Guarantee:
    Attempts to dispatch via Celery background worker if Redis is reachable.
    If Redis or Celery is absent (e.g. single-container Azure App Service),
    falls back cleanly to an in-process thread runner using STANDALONE_TASK_STORE,
    preventing 500 Connection Refused and 502 Bad Gateway timeouts.
    """
    target_period = issp_period or get_active_issp_period(db)
    clean_format = (export_format or "pdf").lower().strip()
    if clean_format not in ("pdf", "docx"):
        clean_format = "pdf"

    narrative = db.query(MasterNarrative).filter(MasterNarrative.issp_period == target_period).first()
    if not narrative:
        raise HTTPException(status_code=400, detail=f"Planning cycle '{target_period}' not configured.")

    # Strict compilation alignment: All proposals must be bound to an ICT Project
    approved_proposals = db.query(Proposal).filter(
        func.lower(cast(Proposal.status, String)) == "approved",
        Proposal.issp_period == target_period,
        Proposal.project_id.isnot(None),
        or_(Proposal.is_archived == False, Proposal.is_archived.is_(None))
    ).all()

    if not approved_proposals:
        raise HTTPException(
            status_code=400, 
            detail="Compilation blocked: No approved proposals bound to ICT projects exist for this cycle. All proposals must be assigned to an ICT Project in Part III.E."
        )

    # Derive accurate parity figures directly from canonical parity calculator
    matrices = calculate_financial_summaries(db, target_period, only_approved=True)
    certified_total = matrices["certified_grand_total"]

    compiled_meta = {
        "issp_id": f"ISSP-{target_period}-FINAL",
        "agency_name": narrative.agency_name,
        "issp_period_years": target_period,
        "allocated_budget": str(certified_total),
        "total_capex": str(matrices["b3_statement_of_expenditure"]["Capital Outlay"]["Total"]),
        "total_mooe": str(matrices["b3_statement_of_expenditure"]["Maintenance and Other Operating Expenses"]["Total"]),
        "export_format": clean_format
    }

    task_id = str(uuid.uuid4())
    dispatched_via_celery = False

    # Attempt Celery task queuing if Redis broker is operational
    try:
        celery_task = compile_issp_document.delay(compiled_meta)
        task_id = celery_task.id
        dispatched_via_celery = True
    except Exception as celery_err:
        logger.warning(
            f"Celery/Redis broker dispatch bypassed ({celery_err}). "
            "Switching to in-process thread compilation."
        )

    # In-process standalone background thread fallback
    if not dispatched_via_celery:
        prune_old_tasks()
        with TASK_STORE_LOCK:
            STANDALONE_TASK_STORE[task_id] = {
                "state": "PROGRESS",
                "progress": 10,
                "status": "Starting in-process compilation...",
                "created_at": time.time(),
                "result": None,
                "error": None
            }
        thread = threading.Thread(
            target=execute_in_process_compilation,
            args=(task_id, compiled_meta),
            daemon=True
        )
        thread.start()

    return {
        "status": "queued",
        "task_id": task_id,
        "format": clean_format,
        "active_cycle": target_period,
        "combined_plan_cost_php": str(certified_total),
        "approved_proposals_count": len(approved_proposals)
    }


@router.get("/governance/task-status/{task_id}")
def get_task_status(task_id: str, admin: dict = Depends(require_admin)):
    """
    Checks the status of a document compilation task.
    Transparently supports both in-process standalone tasks and Celery AsyncResults.
    """
    # 1. Inspect in-memory task store first
    with TASK_STORE_LOCK:
        if task_id in STANDALONE_TASK_STORE:
            info = STANDALONE_TASK_STORE[task_id]
            state = info.get("state", "PROGRESS")
            progress = info.get("progress", 50)
            status_msg = info.get("status", "Rendering...")
            
            if state == "SUCCESS":
                return {
                    "state": "SUCCESS",
                    "progress_percent": 100,
                    "current_step_message": "Compilation Complete",
                    "result": info.get("result")
                }
            elif state == "FAILURE":
                return {
                    "state": "FAILURE",
                    "progress_percent": 100,
                    "current_step_message": "Compilation Failed",
                    "error": info.get("error", "Unknown compilation error.")
                }
            return {
                "state": state,
                "progress_percent": progress,
                "current_step_message": status_msg
            }

    # 2. Fallback to Celery AsyncResult if available
    try:
        from celery.result import AsyncResult
        from app.celery_app import celery_app
        res = AsyncResult(task_id, app=celery_app)

        if res.state == "PROGRESS":
            meta = res.info or {}
            return {
                "state": "PROGRESS", 
                "progress_percent": meta.get("progress", 50), 
                "current_step_message": meta.get("status", "Rendering...")
            }
        elif res.state == "SUCCESS":
            return {
                "state": "SUCCESS", 
                "progress_percent": 100, 
                "current_step_message": "Compilation Complete", 
                "result": res.result
            }
        elif res.state == "FAILURE":
            return {
                "state": "FAILURE", 
                "progress_percent": 100, 
                "current_step_message": "Compilation Failed", 
                "error": str(res.info)
            }

        return {
            "state": res.state, 
            "progress_percent": 10, 
            "current_step_message": f"Task state: {res.state}"
        }
    except Exception as e:
        logger.error(f"Task status poll error: {str(e)}")
        return {
            "state": "FAILURE",
            "progress_percent": 100,
            "current_step_message": "Compilation worker unreachable.",
            "error": f"Task status poll error: {str(e)}"
        }
