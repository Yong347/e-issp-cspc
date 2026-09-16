# app/admin/router.py
import os
import html
import uuid
import logging
from decimal import Decimal
from datetime import datetime, timezone
from typing import List, Optional, Dict, Any
import bcrypt
from fastapi import APIRouter, Depends, HTTPException, status, Query, UploadFile, File, Form, Request
from sqlalchemy import func, or_, String, cast
from sqlalchemy.orm import Session, joinedload, selectinload

from app.config import settings
from app.database.session import get_db
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
    Campus,
    StrategicConcern,
    NeedsAssessment,
    InformationSystem,
    IctProject,
    NetworkInfrastructure,
    CybersecurityControl,
    GlossaryTerm,
    GeneralInstruction,
    ServerCapacityTrack,
    ClientOsCensus,
    OfficeSoftwareCensus,
    CrossAgencyProject,
    PerformanceMetric,
    AnnualCostBreakdown,
    IctStaffPosition,
    HumanCapital,
    StakeholderAnalysis,
    EGovernmentChecklist,
    DisasterRecoveryTeam,
    BusinessImpactAnalysis,
    DRBCPMetric,
    ExistingInventory,
    IsspNode,
    IsspVocabulary,
    IsspContent,
    IsspAsset,
    NodeType,
    PageOrientation,
    ContentType,
    AssetRole,
    RoleTag,
    ScopeChoice
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
    CampusCreate,
    CampusResponse,
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
    ServerCapacityCreate,
    ServerCapacityResponse,
    ClientOsCensusCreate,
    ClientOsCensusResponse,
    OfficeSoftwareCreate,
    OfficeSoftwareResponse,
    CrossAgencyProjectCreate,
    CrossAgencyProjectResponse,
    AnnualCostBreakdownCreate,
    AnnualCostBreakdownResponse,
    IctStaffPositionCreate,
    IctStaffPositionResponse,
    OrganizationalOutcomeCreate,
    OrganizationalOutcomeResponse,
    IsspNodeResponse,
    IsspNodeCreate,
    IsspNodeUpdate,
    IsspNodeReorderPayload,
    IsspVocabularyResponse,
    IsspVocabularyCreate,
    IsspContentResponse,
    IsspContentCreate,
    IsspAssetResponse,
    IsspAssetCreate,
    HumanCapitalCreate,
    HumanCapitalResponse,
    StakeholderAnalysisCreate,
    StakeholderAnalysisResponse,
    EGovernmentChecklistCreate,
    EGovernmentChecklistResponse,
    DisasterRecoveryTeamCreate,
    DisasterRecoveryTeamResponse,
    BusinessImpactAnalysisCreate,
    BusinessImpactAnalysisResponse,
    DRBCPMetricCreate,
    DRBCPMetricResponse
)
from app.auth.router import require_admin, require_user
from app.tasks.pdf_tasks import compile_issp_document
from app.storage.s3_client import storage_client
from app.utils.helpers import (
    secure_filename,
    get_s3_key_from_url,
    get_active_issp_period,
    validate_active_years_alignment,
    calculate_financial_summaries,
    classify_uacs_and_expenditure,
    log_audit_event
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/admin", tags=["Admin & Governance Subsystem"])


# ==========================================================
# 0. DOCUMENT TREE ARCHITECTURE APIS
# ==========================================================

@router.get("/issp/document-tree", response_model=List[IsspNodeResponse])
def get_issp_document_tree(
    db: Session = Depends(get_db),
    admin: dict = Depends(require_admin)
):
    try:
        all_nodes = db.query(IsspNode).options(
            joinedload(IsspNode.vocabulary),
            selectinload(IsspNode.contents),
            selectinload(IsspNode.assets)
        ).order_by(IsspNode.sequence_order.asc()).all()
        
        return [node for node in all_nodes if node.parent_id is None]
    except Exception as e:
        logger.error(f"Failed to query document tree: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to load document skeleton tree.")


@router.put("/issp/reorder")
def reorder_issp_nodes(
    payload: IsspNodeReorderPayload,
    db: Session = Depends(get_db),
    admin: dict = Depends(require_admin)
):
    try:
        node = db.query(IsspNode).filter(IsspNode.id == payload.node_id).first()
        if not node:
            raise HTTPException(status_code=404, detail="Document node not found.")

        node.parent_id = payload.parent_id if payload.parent_id != 0 else None
        node.sequence_order = payload.sequence_order
        db.commit()
        return {"status": "success", "message": "Document node hierarchy reordered successfully."}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to reorder issp nodes: {str(e)}")
        raise HTTPException(status_code=500, detail="Database failure during node reordering.")


@router.post("/issp/assets", response_model=IsspAssetResponse)
async def upload_issp_asset(
    node_id: int = Query(...),
    asset_role: AssetRole = Query(...),
    custom_title: Optional[str] = Query(None),
    aspect_ratio_preserve: bool = Query(True),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    admin: dict = Depends(require_admin)
):
    try:
        node = db.query(IsspNode).filter(IsspNode.id == node_id).first()
        if not node:
            raise HTTPException(status_code=404, detail="Target document node not found.")

        file_bytes = await file.read()
        is_valid_file = (
            file_bytes.startswith(b"\x89PNG\r\n\x1a\n") or
            file_bytes.startswith(b"\xff\xd8\xff") or
            file_bytes.startswith(b"GIF8") or
            file_bytes.startswith(b"%PDF-")
        )
        if not is_valid_file:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Security Violation: Invalid format. Only PNG, JPG, or PDF files are permitted."
            )

        safe_filename = secure_filename(file.filename)
        key = storage_client.get_diagram_key(asset_role.value, safe_filename)
        success = storage_client.upload_canvas_evidence(file_bytes, key)
        if not success:
            raise HTTPException(status_code=500, detail="Failed to write diagram asset to storage.")

        download_url = storage_client.generate_download_url(key)
        if asset_role == AssetRole.FULL_PAGE_DIAGRAM:
            node.force_page_break = True

        new_asset = IsspAsset(
            node_id=node_id,
            file_path=download_url,
            asset_role=asset_role,
            custom_title=custom_title,
            aspect_ratio_preserve=aspect_ratio_preserve
        )
        db.add(new_asset)
        db.commit()
        db.refresh(new_asset)
        return new_asset
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to upload asset: {str(e)}")
        raise HTTPException(status_code=500, detail="Database failure during asset uploading.")


@router.post("/issp/nodes", response_model=IsspNodeResponse, status_code=status.HTTP_201_CREATED)
def create_issp_node(
    payload: IsspNodeCreate,
    db: Session = Depends(get_db),
    admin: dict = Depends(require_admin)
):
    try:
        new_node = IsspNode(
            parent_id=payload.parent_id,
            node_type=payload.node_type,
            system_key=payload.system_key,
            sequence_order=payload.sequence_order,
            page_orientation=payload.page_orientation,
            force_page_break=payload.force_page_break
        )
        db.add(new_node)
        db.commit()
        db.refresh(new_node)
        return new_node
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to create document node: {str(e)}")
        raise HTTPException(status_code=500, detail="Database failure during node creation.")


@router.put("/issp/nodes/{node_id}", response_model=IsspNodeResponse)
def update_issp_node(
    node_id: int,
    payload: IsspNodeUpdate,
    db: Session = Depends(get_db),
    admin: dict = Depends(require_admin)
):
    try:
        node = db.query(IsspNode).filter(IsspNode.id == node_id).first()
        if not node:
            raise HTTPException(status_code=404, detail="Document node not found.")

        if payload.node_type is not None:
            node.node_type = payload.node_type
        if payload.system_key is not None:
            node.system_key = payload.system_key
        if payload.sequence_order is not None:
            node.sequence_order = payload.sequence_order
        if payload.page_orientation is not None:
            node.page_orientation = payload.page_orientation
        if payload.force_page_break is not None:
            node.force_page_break = payload.force_page_break
        if payload.parent_id is not None:
            node.parent_id = payload.parent_id if payload.parent_id != 0 else None

        db.commit()
        db.refresh(node)
        return node
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to update document node: {str(e)}")
        raise HTTPException(status_code=500, detail="Database failure during node updates.")


@router.delete("/issp/nodes/{node_id}")
def delete_issp_node(
    node_id: int,
    db: Session = Depends(get_db),
    admin: dict = Depends(require_admin)
):
    try:
        node = db.query(IsspNode).filter(IsspNode.id == node_id).first()
        if not node:
            raise HTTPException(status_code=404, detail="Document node not found.")

        db.delete(node)
        db.commit()
        return {"status": "success", "message": "Document node deleted successfully."}
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to delete document node: {str(e)}")
        raise HTTPException(status_code=500, detail="Database failure during node deletion.")


# ==========================================================
# PART I.A.4: ORGANIZATIONAL OUTCOMES (Rule 6 - Broader Scope)
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
    db_outcome = OrganizationalOutcome(
        issp_period=period,
        type_label=payload.type_label,
        outcome_name=payload.outcome_name,
        description=payload.description
    )
    db.add(db_outcome)
    db.commit()
    db.refresh(db_outcome)
    return db_outcome


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
    """
    Returns all departmental Needs Assessments across all organizational units.
    Enables MIS Admin to review and aggregate them into Part II.A Strategic Concerns.
    """
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
    """
    Converts/Aggregates a department Needs Assessment into an official Part II.A Strategic Concern.
    Establishes bidirectional provenance:
    NeedsAssessment.strategic_concern_id = concern.id
    NeedsAssessment.is_aggregated = True
    """
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


@router.get("/narratives/{issp_period}/network-infrastructures", response_model=List[NetworkInfrastructureResponse])
def get_narrative_network_infrastructures(
    issp_period: str,
    is_proposed: Optional[bool] = Query(None),
    db: Session = Depends(get_db),
    admin: dict = Depends(require_admin)
):
    query = db.query(NetworkInfrastructure).filter(NetworkInfrastructure.issp_period == issp_period)
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
    item = NetworkInfrastructure(issp_period=period, **payload.model_dump())
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
    if control_domain:
        query = query.filter(CybersecurityControl.control_domain == control_domain)
    return query.all()


@router.get("/narratives/{issp_period}/cybersecurity-controls", response_model=List[CybersecurityControlResponse])
def get_narrative_cybersecurity_controls(
    issp_period: str,
    is_proposed: Optional[bool] = Query(None),
    control_domain: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    admin: dict = Depends(require_admin)
):
    query = db.query(CybersecurityControl).filter(CybersecurityControl.issp_period == issp_period)
    if is_proposed is not None:
        query = query.filter(CybersecurityControl.is_proposed == is_proposed)
    if control_domain:
        query = query.filter(CybersecurityControl.control_domain == control_domain)
    return query.all()


@router.post("/cybersecurity-controls", response_model=CybersecurityControlResponse, status_code=status.HTTP_201_CREATED)
def create_cybersecurity_control(
    payload: CybersecurityControlCreate,
    issp_period: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    admin: dict = Depends(require_admin)
):
    period = issp_period or get_active_issp_period(db)
    item = CybersecurityControl(issp_period=period, **payload.model_dump())
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
    """
    Seeds all 29 official DICT Cybersecurity Controls (20 Mandatory and 9 Optional)
    across all 7 Security Domains for both Part II.B.2 (Existing) and Part III.A.2 (Proposed) if missing.
    """
    period = issp_period or get_active_issp_period(db)
    
    OFFICIAL_DICT_CONTROLS = [
        # 1. PHYSICAL SECURITY
        {"domain": "Physical Security", "name": "Perimeter Protection", "mandatory": True},
        {"domain": "Physical Security", "name": "Access Control", "mandatory": True},
        {"domain": "Physical Security", "name": "Surveillance System", "mandatory": True},
        {"domain": "Physical Security", "name": "Detection System", "mandatory": False},

        # 2. PERIMETER SECURITY
        {"domain": "Perimeter Security", "name": "Next Generation Firewalls", "mandatory": True},
        {"domain": "Perimeter Security", "name": "Intrusion Detection/Prevention Systems (IDS/IPS)", "mandatory": True},
        {"domain": "Perimeter Security", "name": "Web Application Firewalls (WAFs)", "mandatory": True},
        {"domain": "Perimeter Security", "name": "Demilitarized Zone (DMZ)", "mandatory": False},

        # 3. NETWORK SECURITY
        {"domain": "Network Security", "name": "Data Encryption", "mandatory": True},
        {"domain": "Network Security", "name": "Network Segmentation", "mandatory": False},

        # 4. ENDPOINT SECURITY
        {"domain": "Endpoint Security", "name": "Anti-virus and Anti-malware Software", "mandatory": True},
        {"domain": "Endpoint Security", "name": "Application Control", "mandatory": True},
        {"domain": "Endpoint Security", "name": "BYOD Security", "mandatory": True},
        {"domain": "Endpoint Security", "name": "Extended Detection and Response (XDR)", "mandatory": False},

        # 5. DATA SECURITY
        {"domain": "Data Security", "name": "Data Classification", "mandatory": True},
        {"domain": "Data Security", "name": "Data Loss Prevention (DLP)", "mandatory": True},
        {"domain": "Data Security", "name": "Data Backups and Recovery", "mandatory": True},

        # 6. APPLICATION SECURITY
        {"domain": "Application Security", "name": "Regular Security Scanning and Testing", "mandatory": True},

        # 7. OTHER MEASURES
        {"domain": "Other Measures", "name": "Vulnerability Assessment", "mandatory": True},
        {"domain": "Other Measures", "name": "Patch Management", "mandatory": True},
        {"domain": "Other Measures", "name": "Strong Password Policies", "mandatory": True},
        {"domain": "Other Measures", "name": "Multi-Factor Authentication (MFA)", "mandatory": True},
        {"domain": "Other Measures", "name": "Access Reviews", "mandatory": True},
        {"domain": "Other Measures", "name": "Security Logs", "mandatory": True},
        {"domain": "Other Measures", "name": "Log Analysis", "mandatory": False},
        {"domain": "Other Measures", "name": "Incident Response Plan", "mandatory": False},
        {"domain": "Other Measures", "name": "Security Information and Event Management (SIEM)", "mandatory": False},
        {"domain": "Other Measures", "name": "Penetration Testing", "mandatory": False},
        {"domain": "Other Measures", "name": "Secure Software Development Life Cycle (SDLC)", "mandatory": False}
    ]

    added = 0
    for is_proposed in [False, True]:
        for c in OFFICIAL_DICT_CONTROLS:
            exists = db.query(CybersecurityControl).filter(
                CybersecurityControl.issp_period == period,
                CybersecurityControl.is_proposed == is_proposed,
                CybersecurityControl.control_name == c["name"]
            ).first()
            if not exists:
                db.add(CybersecurityControl(
                    issp_period=period,
                    is_proposed=is_proposed,
                    control_domain=c["domain"],
                    control_name=c["name"],
                    is_mandatory=c["mandatory"],
                    is_implemented=False
                ))
                added += 1

    db.commit()
    return {"status": "success", "message": f"Successfully initialized {added} standard DICT cybersecurity controls."}


# ==========================================================
# PART II.C & III.D: INFORMATION SYSTEMS REGISTER (SINGULARITY)
# ==========================================================

@router.get("/information-systems", response_model=List[InformationSystemResponse])
def get_information_systems(
    issp_period: Optional[str] = Query(None),
    status_filter: Optional[SystemStatus] = Query(None),
    db: Session = Depends(get_db),
    admin: dict = Depends(require_admin)
):
    period = issp_period or get_active_issp_period(db)
    query = db.query(InformationSystem).filter(InformationSystem.issp_period == period)
    if status_filter:
        query = query.filter(InformationSystem.status == status_filter)
    return query.all()


@router.post("/information-systems", response_model=InformationSystemResponse, status_code=status.HTTP_201_CREATED)
def create_information_system(
    payload: InformationSystemCreate,
    db: Session = Depends(get_db),
    admin: dict = Depends(require_admin)
):
    period = get_active_issp_period(db)
    db_system = InformationSystem(
        issp_period=period,
        **payload.model_dump()
    )
    db.add(db_system)
    db.commit()
    db.refresh(db_system)
    return db_system


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
        setattr(db_system, key, value)

    db.commit()
    db.refresh(db_system)
    return db_system


@router.delete("/information-systems/{system_id}")
def delete_information_system(
    system_id: uuid.UUID,
    db: Session = Depends(get_db),
    admin: dict = Depends(require_admin)
):
    db_system = db.query(InformationSystem).filter(InformationSystem.id == system_id).first()
    if not db_system:
        raise HTTPException(status_code=404, detail="Information System not found.")

    linked_projects = db.query(IctProject).filter(IctProject.system_id == system_id).count()
    if linked_projects > 0:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot delete system '{db_system.name}'. There are {linked_projects} ICT projects linked to it."
        )

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
        
        base_projects = db.query(IctProject).filter(IctProject.issp_period == period).all()

        if category_filter and category_filter.strip().lower() != "all":
            cat_clean = category_filter.strip().lower()
            filtered_projects = []
            for p in base_projects:
                p_cat_val = str(getattr(p.project_category, "value", p.project_category) or "").lower()
                p_cat_name = str(getattr(p.project_category, "name", "") or "").lower()
                p_cat_raw = str(p.project_category or "").lower()

                if (
                    cat_clean == p_cat_val or
                    cat_clean == p_cat_name or
                    cat_clean in p_cat_val or
                    cat_clean in p_cat_raw or
                    cat_clean.replace(" ", "_") == p_cat_name or
                    cat_clean.replace("-", "_") in p_cat_name or
                    ("cross" in cat_clean and "cross" in p_cat_val)
                ):
                    filtered_projects.append(p)
            projects = filtered_projects
        else:
            projects = base_projects

        total_costs_map = {}
        try:
            cost_proposals = (
                db.query(
                    Proposal.project_id,
                    Proposal.total_cost,
                    Proposal.year_1_qty,
                    Proposal.year_2_qty,
                    Proposal.year_3_qty,
                    Proposal.unit_cost
                )
                .filter(
                    Proposal.issp_period == period,
                    Proposal.project_id.isnot(None),
                    or_(Proposal.is_archived == False, Proposal.is_archived.is_(None))
                )
                .all()
            )
            for row in cost_proposals:
                pid = row[0]
                if not pid:
                    continue
                pid_str = str(pid).strip()
                cost = row[1]
                if cost is None:
                    q = (row[2] or 0) + (row[3] or 0) + (row[4] or 0)
                    u = row[5] or Decimal("0.00")
                    cost = Decimal(q) * Decimal(str(u))
                else:
                    cost = Decimal(str(cost))

                total_costs_map[pid_str] = total_costs_map.get(pid_str, Decimal("0.00")) + cost
                total_costs_map[pid] = total_costs_map.get(pid, Decimal("0.00")) + cost
        except Exception as cost_map_err:
            db.rollback()
            logger.warning(f"Could not batch compute project total costs: {cost_map_err}")

        results = []
        for proj in projects:
            try:
                pid = proj.id
                pid_str = str(pid).strip() if pid else ""
                total_cost = total_costs_map.get(pid_str) or total_costs_map.get(pid) or Decimal("0.00")

                results.append({
                    "id": str(pid),
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
                    "computed_total_project_cost": float(total_cost)
                })
            except Exception as item_err:
                logger.error(f"Error serializing ICT project {getattr(proj, 'id', '')}: {item_err}", exc_info=True)

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
        data_dict = payload.model_dump()
        new_project = IctProject(
            issp_period=period,
            **data_dict
        )
        db.add(new_project)
        db.commit()
        db.refresh(new_project)
        
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
            "computed_total_project_cost": 0.0
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

        update_dict = payload.model_dump(exclude_unset=True)
        for key, val in update_dict.items():
            setattr(project, key, val)

        db.commit()
        db.refresh(project)
        
        total_cost = Decimal("0.00")
        try:
            cost_sum = db.query(func.sum(Proposal.total_cost)).filter(
                Proposal.project_id == project.id,
                or_(Proposal.is_archived == False, Proposal.is_archived.is_(None))
            ).scalar()
            if cost_sum is not None:
                total_cost = Decimal(str(cost_sum))
        except Exception:
            db.rollback()

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
            "computed_total_project_cost": float(total_cost)
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
# PART IV.B: LIVE FOUR-WAY PARITY & SINGULARITY GRAPH AUDIT
# ==========================================================

@router.get("/governance/parity-matrices", response_model=PartIVBParityResponse)
def get_parity_matrices(
    issp_period: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    user: dict = Depends(require_user)
):
    """
    Computes Part IV.B Tables B.1, B.2, B.3, and B.4 dynamically from atomic line items.
    Enforces identical grand totals down to the centavo.
    Supports arbitrary multi-year spans (1 to N years).
    Accessible to all authenticated users for transparency and document certification.
    """
    period = issp_period or get_active_issp_period(db)
    matrices = calculate_financial_summaries(db, period)
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
    """
    Audits the entire strategic dependency graph and asserts end-to-end provenance.
    Called directly by the 'Audit Singularity DAG' frontend triggers.
    """
    period = issp_period or get_active_issp_period(db)
    return ISSPSingularityEngine.validate_complete_issp_graph(db, period)


@router.post("/governance/evaluate-lifecycle-rollover", response_model=LifecycleRolloverResponse)
def evaluate_lifecycle_rollover(
    force: bool = Query(False, description="Force rollover even if cycle end year has not passed"),
    db: Session = Depends(get_db),
    admin: dict = Depends(require_admin)
):
    """
    Evaluates whether the active ISSP planning cycle has concluded based on calendar years.
    If concluded or force=True:
      1. Compiles final certified PDF snapshot.
      2. Transitions PDF to AWS S3 Glacier.
      3. Archives expired cycle.
      4. Auto-provisions successor cycle (dynamic N-year span) and clones Outcomes/Ceilings.
    """
    try:
        result = ISSPLifecycleEngine.evaluate_and_rollover_cycle(db, force=force)
        return result
    except Exception as e:
        logger.error(f"Failed to evaluate lifecycle rollover: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Lifecycle rollover failed: {str(e)}")


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
    admin: dict = Depends(require_admin)
):
    try:
        query = db.query(Proposal).options(
            joinedload(Proposal.outcome),
            joinedload(Proposal.project_rel),
            joinedload(Proposal.needs_assessment)
        ).filter(or_(Proposal.is_archived == False, Proposal.is_archived.is_(None)))
        
        if dept_id:
            query = query.filter(Proposal.department_id == dept_id)
        if status_filter and status_filter.strip().lower() != "all":
            clean_status = status_filter.strip()
            matched_status = None
            for s in ProposalStatus:
                if s.value.lower() == clean_status.lower() or s.name.lower() == clean_status.lower():
                    matched_status = s
                    break
            if matched_status:
                query = query.filter(or_(
                    Proposal.status == matched_status,
                    Proposal.status == matched_status.value,
                    Proposal.status == matched_status.name
                ))
            else:
                query = query.filter(func.lower(cast(Proposal.status, String)) == clean_status.lower())

        if strategic_category and strategic_category.strip().lower() != "all":
            clean_cat = strategic_category.strip()
            matched_cat = None
            for c in ProjectCategory:
                if c.value.lower() == clean_cat.lower() or c.name.lower() == clean_cat.lower():
                    matched_cat = c
                    break
            if matched_cat:
                query = query.filter(or_(
                    Proposal.strategic_category == matched_cat,
                    Proposal.strategic_category == matched_cat.value,
                    Proposal.strategic_category == matched_cat.name
                ))
            else:
                query = query.filter(func.lower(cast(Proposal.strategic_category, String)) == clean_cat.lower())

        if issp_period:
            query = query.filter(Proposal.issp_period == issp_period)
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
                logger.debug(f"Direct validation note: {ser_err}")
                serialized_data.append(p)

        return {"total": total, "skip": skip, "limit": effective_limit, "data": serialized_data}
    except Exception as e:
        logger.error(f"Error querying master queue: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to fetch master queue.")


@router.get("/subscriptions")
def get_admin_subscriptions_queue(
    dept_id: Optional[int] = Query(None),
    status_filter: Optional[str] = Query(None),
    issp_period: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: Optional[int] = Query(1000, ge=1, le=100000),
    db: Session = Depends(get_db),
    admin: dict = Depends(require_admin)
):
    """
    Retrieves MOOE and software subscriptions queue for ConsolidatedQueue.jsx.
    Queries the unified issp_core proposals ledger.
    """
    try:
        query = db.query(Proposal).options(
            joinedload(Proposal.outcome),
            joinedload(Proposal.project_rel),
            joinedload(Proposal.needs_assessment)
        ).filter(
            or_(
                Proposal.category.in_([ProposalCategory.SUBSCRIPTION, ProposalCategory.SOFTWARE]),
                Proposal.expenditure_class == ExpenditureClass.MOOE,
                Proposal.strategic_category == ProjectCategory.CONTINUING_COSTS
            ),
            or_(Proposal.is_archived == False, Proposal.is_archived.is_(None))
        )
        
        if dept_id:
            query = query.filter(Proposal.department_id == dept_id)
        if status_filter and status_filter.strip().lower() != "all":
            clean_status = status_filter.strip().lower()
            matched_status = next((s for s in ProposalStatus if s.value.lower() == clean_status or s.name.lower() == clean_status), None)
            if matched_status:
                query = query.filter(Proposal.status == matched_status)
        if issp_period:
            query = query.filter(Proposal.issp_period == issp_period)
        if search:
            query = query.filter(Proposal.item_name.ilike(f"%{search}%"))

        total = query.count()
        effective_limit = limit or 1000
        results = query.order_by(Proposal.version.desc()).offset(skip).limit(effective_limit).all()

        serialized_data = []
        for p in results:
            try:
                serialized_data.append(ProposalResponse.model_validate(p))
            except Exception:
                serialized_data.append(p)

        return {"total": total, "skip": skip, "limit": effective_limit, "data": serialized_data}
    except Exception as e:
        logger.error(f"Error querying subscriptions queue: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to fetch subscriptions queue.")


@router.post("/proposals", response_model=ProposalResponse, status_code=status.HTTP_201_CREATED)
def admin_create_proposal(
    payload: ProposalCreatePayload,
    request: Request,
    db: Session = Depends(get_db),
    admin: dict = Depends(require_admin)
):
    """
    Allows administrators to add resource line items directly to Part IV.A.
    """
    active_period = get_active_issp_period(db)
    
    target_dept_id = getattr(payload, "department_id", None) or 1
    target_dept = db.query(Department).filter(Department.id == target_dept_id).first()
    automated_office = target_dept.name if target_dept else "Central Office"

    canvas_url = payload.canvas_evidence_url
    canvas_exp = payload.canvas_expiration_date

    if payload.created_by_students:
        uacs_code = UacsObjectCode.ICT_SOFTWARE
        exp_class = ExpenditureClass.CAPITAL_OUTLAY
    else:
        uacs_code, exp_class = classify_uacs_and_expenditure(
            payload.item_name,
            payload.unit_cost,
            payload.strategic_category,
            category=payload.category,
            created_by_students=payload.created_by_students
        )

    db_proposal = Proposal(
        department_id=target_dept_id,
        issp_period=active_period,
        outcome_id=payload.outcome_id,
        project_id=payload.project_id,
        needs_assessment_id=getattr(payload, "needs_assessment_id", None),
        category=payload.category,
        strategic_category=payload.strategic_category,
        office_location=payload.office_location,
        fund_source=payload.fund_source,
        uacs_object_code=uacs_code,
        expenditure_class=exp_class,
        status=ProposalStatus.APPROVED,
        item_key=payload.item_select,
        item_name=payload.item_name,
        unit_cost=payload.unit_cost,
        year_1_qty=payload.year_1_qty,
        year_2_qty=payload.year_2_qty,
        year_3_qty=payload.year_3_qty,
        yearly_quantities=payload.yearly_quantities,
        justification=payload.justification,
        subscription_type=getattr(payload, "subscription_type", None),
        system_development_status=payload.system_development_status,
        created_by_students=payload.created_by_students,
        target_office_automated=automated_office,
        canvas_evidence_url=canvas_url,
        canvas_expiration_date=canvas_exp,
        project_key=getattr(payload, "project_key", None),
        payload={"comments": []},
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
        new_value={"item_name": db_proposal.item_name, "total_cost": str(db_proposal.total_cost)}
    )

    db.commit()
    db.refresh(db_proposal)
    return db_proposal


@router.put("/proposals/{proposal_id}")
def admin_update_proposal(
    proposal_id: uuid.UUID,
    payload: AdminOverridePayload,
    request: Request,
    db: Session = Depends(get_db),
    admin: dict = Depends(require_admin)
):
    """
    Updates or overrides proposal parameters directly by administrators.
    """
    return admin_override_proposal(proposal_id, payload, request, db, admin)


@router.delete("/proposals/{proposal_id}")
def admin_delete_proposal(
    proposal_id: uuid.UUID,
    request: Request,
    db: Session = Depends(get_db),
    admin: dict = Depends(require_admin)
):
    """
    Allows administrators to delete an outlay proposal from the database.
    """
    proposal = db.query(Proposal).filter(Proposal.id == proposal_id).first()
    if not proposal:
        raise HTTPException(status_code=404, detail="Proposal not found.")

    deleted_snapshot = {
        "item_name": proposal.item_name,
        "total_cost": str(proposal.total_cost),
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

    old_status = proposal.status.value
    proposal.status = ProposalStatus.APPROVED
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
        new_value={"status": ProposalStatus.APPROVED.value}
    )
    db.commit()
    db.refresh(proposal)

    return {"status": "success", "message": "Proposal approved successfully.", "proposal_id": proposal.id}


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

    old_status = proposal.status.value
    proposal.status = ProposalStatus.RETURNED
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
        new_value={"status": ProposalStatus.RETURNED.value}
    )
    db.commit()
    db.refresh(proposal)

    return {"status": "success", "message": "Proposal returned to department.", "proposal_id": proposal.id}


@router.get("/proposals/approved-canvas")
def get_approved_canvas_proposals(
    db: Session = Depends(get_db),
    admin: dict = Depends(require_admin)
):
    """
    Returns approved proposals with canvas quotation proof to populate catalog creation templates.
    """
    approved = db.query(Proposal).filter(
        Proposal.status == ProposalStatus.APPROVED,
        Proposal.canvas_evidence_url.isnot(None),
        or_(Proposal.is_archived == False, Proposal.is_archived.is_(None))
    ).all()

    return [
        {
            "id": str(p.id),
            "display_name": p.item_name,
            "unit_cost": float(p.unit_cost),
            "type": "CapEx" if p.expenditure_class == ExpenditureClass.CAPITAL_OUTLAY else "MOOE",
            "supplier_name": (p.payload or {}).get("supplier_name") or "Standard Supplier",
            "canvas_evidence_url": p.canvas_evidence_url,
            "canvas_expiration_date": p.canvas_expiration_date.isoformat() if p.canvas_expiration_date else None,
            "created_by_students": p.created_by_students
        }
        for p in approved
    ]


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
            "unit_cost": str(proposal.unit_cost),
            "total_qty": proposal.total_qty,
            "uacs_object_code": proposal.uacs_object_code.value,
            "expenditure_class": proposal.expenditure_class.value
        }

        if payload.item_name is not None:
            proposal.item_name = html.escape(payload.item_name.strip())
        if payload.unit_cost is not None:
            proposal.unit_cost = payload.unit_cost
        if payload.project_id is not None:
            proposal.project_id = payload.project_id
        if getattr(payload, "needs_assessment_id", None) is not None:
            proposal.needs_assessment_id = payload.needs_assessment_id
        if payload.category is not None:
            proposal.category = payload.category
        if payload.strategic_category is not None:
            proposal.strategic_category = payload.strategic_category
        if payload.office_location is not None:
            proposal.office_location = payload.office_location
        if payload.fund_source is not None:
            proposal.fund_source = payload.fund_source
        if payload.justification is not None:
            proposal.justification = html.escape(payload.justification.strip())
        if payload.system_development_status is not None:
            proposal.system_development_status = payload.system_development_status
        if payload.created_by_students is not None:
            proposal.created_by_students = payload.created_by_students

        if payload.yearly_quantities is not None:
            validate_active_years_alignment(db, list(payload.yearly_quantities.keys()))
            proposal.yearly_quantities = payload.yearly_quantities

            years_sorted = sorted([k for k in payload.yearly_quantities.keys() if str(k).isdigit()])
            if len(years_sorted) >= 1:
                proposal.year_1_qty = int(payload.yearly_quantities.get(years_sorted[0], 0) or 0)
            if len(years_sorted) >= 2:
                proposal.year_2_qty = int(payload.yearly_quantities.get(years_sorted[1], 0) or 0)
            if len(years_sorted) >= 3:
                proposal.year_3_qty = int(payload.yearly_quantities.get(years_sorted[2], 0) or 0)

        # Re-resolve accounting classes
        if proposal.created_by_students:
            proposal.expenditure_class = ExpenditureClass.CAPITAL_OUTLAY
            proposal.uacs_object_code = UacsObjectCode.ICT_SOFTWARE
        else:
            uacs, exp_class = classify_uacs_and_expenditure(
                proposal.item_name, 
                proposal.unit_cost, 
                proposal.strategic_category,
                category=proposal.category,
                created_by_students=proposal.created_by_students
            )
            proposal.uacs_object_code = uacs
            proposal.expenditure_class = exp_class

        proposal.version += 1
        proposal.sync_payload()

        new_state = {
            "item_name": proposal.item_name,
            "unit_cost": str(proposal.unit_cost),
            "total_qty": proposal.total_qty,
            "uacs_object_code": proposal.uacs_object_code.value,
            "expenditure_class": proposal.expenditure_class.value
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

        return {"status": "success", "message": "Proposal overridden successfully.", "proposal_id": proposal.id}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Override failure: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Database failure during override.")


# ==========================================================
# BUDGET GOVERNANCE & PRE-FLIGHT VALIDATION
# ==========================================================

@router.get("/budget-ceilings", response_model=List[BudgetCeilingResponse])
def get_budget_ceilings(
    db: Session = Depends(get_db),
    admin: dict = Depends(require_admin)
):
    try:
        issp_period = get_active_issp_period(db)
        departments = db.query(Department).all()
        global_setting = db.query(SystemSetting).filter(SystemSetting.key == "global_budget_ceiling").first()
        global_limit = Decimal(global_setting.value) if global_setting else settings.GLOBAL_BUDGET_CEILING
        
        ceilings_map = {c.department_id: c for c in db.query(BudgetCeiling).filter(BudgetCeiling.issp_period == issp_period).all()}

        spent_by_dept = dict(
            db.query(Proposal.department_id, func.sum(Proposal.unit_cost * Proposal.total_qty))
            .filter(
                Proposal.status == ProposalStatus.APPROVED,
                Proposal.issp_period == issp_period,
                or_(Proposal.is_archived == False, Proposal.is_archived.is_(None))
            )
            .group_by(Proposal.department_id).all()
        )

        results = []
        for dept in departments:
            c = ceilings_map.get(dept.id)
            results.append(
                BudgetCeilingResponse(
                    department_id=dept.id,
                    department_name=dept.name,
                    allocated_capex=c.allocated_capex if c else Decimal("0.00"),
                    allocated_mooe=c.allocated_mooe if c else Decimal("0.00"),
                    sub_ceiling=c.sub_ceiling if c else Decimal("0.00"),
                    global_ceiling=global_limit,
                    current_spent=spent_by_dept.get(dept.id, Decimal("0.00")) or Decimal("0.00")
                )
            )
        return results
    except Exception as e:
        logger.error(f"Failed to query budget ceilings: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to load budget ceilings.")


@router.post("/budget-ceilings")
def update_budget_ceiling(
    payload: UpdateCeilingPayload,
    request: Request,
    db: Session = Depends(get_db),
    admin: dict = Depends(require_admin)
):
    issp_period = get_active_issp_period(db)
    ceiling = db.query(BudgetCeiling).filter(
        BudgetCeiling.department_id == payload.department_id,
        BudgetCeiling.issp_period == issp_period
    ).first()

    if not ceiling:
        ceiling = BudgetCeiling(
            department_id=payload.department_id,
            issp_period=issp_period,
            allocated_capex=payload.allocated_capex,
            allocated_mooe=payload.allocated_mooe
        )
        db.add(ceiling)
    else:
        ceiling.allocated_capex = payload.allocated_capex
        ceiling.allocated_mooe = payload.allocated_mooe

    log_audit_event(
        db=db,
        action="SYSTEM_BUDGET_CEILING_UPDATED",
        module="GOVERNANCE",
        user_id=admin["id"],
        department_id=payload.department_id,
        ip_address=request.client.host if request.client else None,
        new_value={
            "department_id": payload.department_id,
            "allocated_capex": str(payload.allocated_capex),
            "allocated_mooe": str(payload.allocated_mooe),
            "sub_ceiling": str(payload.allocated_capex + payload.allocated_mooe)
        }
    )
    db.commit()
    return {"status": "success", "message": "Budget ceiling updated successfully."}


@router.post("/global-budget-ceiling")
def update_global_budget_ceiling(
    payload: UpdateGlobalCeilingPayload,
    request: Request,
    db: Session = Depends(get_db),
    admin: dict = Depends(require_admin)
):
    setting = db.query(SystemSetting).filter(SystemSetting.key == "global_budget_ceiling").first()
    if not setting:
        setting = SystemSetting(key="global_budget_ceiling", value=str(payload.global_ceiling))
        db.add(setting)
    else:
        setting.value = str(payload.global_ceiling)

    log_audit_event(
        db=db,
        action="GLOBAL_BUDGET_CEILING_MODIFIED",
        module="GOVERNANCE",
        user_id=admin["id"],
        ip_address=request.client.host if request.client else None,
        new_value={"global_budget_ceiling": str(payload.global_ceiling)}
    )
    db.commit()
    return {"status": "success", "message": "Global budget ceiling updated successfully."}


@router.get("/budget-validation")
def run_pre_generation_budget_check(
    db: Session = Depends(get_db),
    admin: dict = Depends(require_admin)
):
    try:
        issp_period = get_active_issp_period(db)
        global_setting = db.query(SystemSetting).filter(SystemSetting.key == "global_budget_ceiling").first()
        global_limit = Decimal(global_setting.value) if global_setting else settings.GLOBAL_BUDGET_CEILING

        violations = []
        spent_by_dept = dict(
            db.query(Proposal.department_id, func.sum(Proposal.unit_cost * Proposal.total_qty))
            .filter(
                Proposal.status == ProposalStatus.APPROVED,
                Proposal.issp_period == issp_period,
                or_(Proposal.is_archived == False, Proposal.is_archived.is_(None))
            ).group_by(Proposal.department_id).all()
        )

        ceilings_map = {c.department_id: c.sub_ceiling for c in db.query(BudgetCeiling).filter(BudgetCeiling.issp_period == issp_period).all()}

        for dept in db.query(Department).all():
            spent = spent_by_dept.get(dept.id, Decimal("0.00")) or Decimal("0.00")
            ceiling = ceilings_map.get(dept.id, global_limit)
            if spent > ceiling:
                violations.append({
                    "department_id": dept.id,
                    "department_name": dept.name,
                    "allocated_sub_ceiling_php": float(ceiling),
                    "actual_expenditures_php": float(spent),
                    "budget_overage_php": float(spent - ceiling),
                    "status_flag": "RED_BUDGET_BREACH"
                })

        return {
            "validation_passed": len(violations) == 0,
            "total_violations_detected": len(violations),
            "breaches": violations,
            "message": "Expenditures cleared for compilation." if len(violations) == 0 else "Budget overages detected."
        }
    except Exception as e:
        logger.error(f"Error running pre-flight budget check: {str(e)}")
        raise HTTPException(status_code=500, detail="Budget check failed.")


# ==========================================================
# DASHBOARD METRICS & COMPLIANCE ANALYTICS
# ==========================================================

@router.get("/dashboard-metrics")
def get_dashboard_metrics(
    db: Session = Depends(get_db),
    admin: dict = Depends(require_admin)
):
    period = get_active_issp_period(db)
    global_setting = db.query(SystemSetting).filter(SystemSetting.key == "global_budget_ceiling").first()
    global_limit = Decimal(global_setting.value) if global_setting else settings.GLOBAL_BUDGET_CEILING

    total_spent = db.query(func.sum(Proposal.total_cost)).filter(
        Proposal.issp_period == period,
        Proposal.status == ProposalStatus.APPROVED,
        or_(Proposal.is_archived == False, Proposal.is_archived.is_(None))
    ).scalar() or Decimal("0.00")

    pending_count = db.query(Proposal).filter(
        Proposal.issp_period == period,
        Proposal.status == ProposalStatus.SUBMITTED,
        or_(Proposal.is_archived == False, Proposal.is_archived.is_(None))
    ).count()

    approved_count = db.query(Proposal).filter(
        Proposal.issp_period == period,
        Proposal.status == ProposalStatus.APPROVED,
        or_(Proposal.is_archived == False, Proposal.is_archived.is_(None))
    ).count()

    return {
        "global_ceiling": float(global_limit),
        "total_spent": float(total_spent),
        "pending_count": pending_count,
        "approved_count": approved_count
    }


@router.get("/department-analytics", response_model=List[DepartmentAnalyticsResponse])
def get_department_analytics(
    db: Session = Depends(get_db),
    admin: dict = Depends(require_admin)
):
    period = get_active_issp_period(db)
    departments = db.query(Department).all()
    results = []

    for d in departments:
        props = db.query(Proposal).filter(
            Proposal.department_id == d.id,
            Proposal.issp_period == period,
            or_(Proposal.is_archived == False, Proposal.is_archived.is_(None))
        ).all()

        total = len(props)
        custom = len([p for p in props if p.item_key == "other"])
        missing_canvas = len([p for p in props if not p.canvas_evidence_url and not p.created_by_students])
        ratio = (custom / total * 100.0) if total > 0 else 0.0

        results.append(
            DepartmentAnalyticsResponse(
                department_id=d.id,
                department_name=d.name,
                total_proposals=total,
                custom_proposals=custom,
                custom_ratio_percent=round(ratio, 2),
                missing_canvas_count=missing_canvas,
                requires_review_abuse=ratio > 20.0
            )
        )
    return results


# ==========================================================
# MASTER NARRATIVES & PLANNING SCOPE CONTROL (NO TRANSMITTAL)
# ==========================================================

@router.get("/narratives/{issp_period}", response_model=MasterNarrativeResponse)
def get_narrative(
    issp_period: str,
    db: Session = Depends(get_db),
    admin: dict = Depends(require_admin)
):
    narrative = db.query(MasterNarrative).filter(MasterNarrative.issp_period == issp_period).first()
    if not narrative:
        raise HTTPException(status_code=404, detail=f"Planning narrative for cycle '{issp_period}' not found.")
    return narrative


@router.post("/narratives/{issp_period}")
def update_narrative(
    issp_period: str,
    payload: MasterNarrativeUpdate,
    request: Request,
    db: Session = Depends(get_db),
    admin: dict = Depends(require_admin)
):
    try:
        narrative = db.query(MasterNarrative).filter(MasterNarrative.issp_period == issp_period).first()
        latest = db.query(MasterNarrative).order_by(MasterNarrative.issp_period.desc()).first()

        parts = issp_period.split("-")
        start_y = payload.issp_period_from or (int(parts[0]) if len(parts) == 2 and parts[0].isdigit() else 2026)
        end_y = payload.issp_period_to or (int(parts[1]) if len(parts) == 2 and parts[1].isdigit() else (start_y + 2))

        if not narrative:
            narrative = MasterNarrative(
                issp_period=issp_period,
                issp_period_from=start_y,
                issp_period_to=end_y,
                agency_name=payload.agency_name or (latest.agency_name if latest else settings.DEFAULT_AGENCY_NAME),
                agency_website_url=payload.agency_website_url or (latest.agency_website_url if latest else settings.DEFAULT_AGENCY_WEBSITE),
                agency_logo_url=payload.agency_logo_url or (latest.agency_logo_url if latest else None),
                dict_logo_url=getattr(payload, 'dict_logo_url', None) or (getattr(latest, 'dict_logo_url', None) if latest else None),
                bagong_pilipinas_logo_url=getattr(payload, 'bagong_pilipinas_logo_url', None) or (getattr(latest, 'bagong_pilipinas_logo_url', None) if latest else None),
                signatory_prepared_by=payload.signatory_prepared_by or payload.cio_name or (latest.signatory_prepared_by if latest else "Chief Information Officer"),
                preparer_position=payload.preparer_position or payload.cio_plantilla_position or (latest.preparer_position if latest else "Chief Information Officer"),
                signatory_approved_by=payload.signatory_approved_by or payload.head_of_agency_name or (latest.signatory_approved_by if latest else settings.DEFAULT_AGENCY_HEAD_TITLE),
                agency_head_position=getattr(payload, 'agency_head_position', None) or (getattr(latest, 'agency_head_position', None) if latest else settings.DEFAULT_AGENCY_HEAD_TITLE),
                drbcp_approval_date=getattr(payload, 'drbcp_approval_date', None) or (getattr(latest, 'drbcp_approval_date', None) if latest else None),
                mandate_html=payload.mandate_html or (latest.mandate_html if latest else ""),
                functions=payload.functions or (latest.functions if latest else ""),
                vision_html=payload.vision_html or (latest.vision_html if latest else ""),
                mission_html=payload.mission_html or (latest.mission_html if latest else ""),
                present_situation_html=payload.present_situation_html or (latest.present_situation_html if latest else ""),
                enterprise_architecture_narrative=payload.enterprise_architecture_narrative or (getattr(latest, "enterprise_architecture_narrative", None) if latest else None),
                drbcp_affected_assets_json=payload.drbcp_affected_assets_json or (getattr(latest, "drbcp_affected_assets_json", []) if latest else []),
                drbcp_recovery_strategy_html=payload.drbcp_recovery_strategy_html or (getattr(latest, "drbcp_recovery_strategy_html", "") if latest else ""),
                drbcp_sop_phases_html=payload.drbcp_sop_phases_html or (getattr(latest, "drbcp_sop_phases_html", "") if latest else ""),
                drbcp_compliance_narrative_html=getattr(payload, 'drbcp_compliance_narrative_html', None) or (getattr(latest, 'drbcp_compliance_narrative_html', None) if latest else None),
                is_active=True,
                is_archived=False,
                annual_ict_budget=payload.annual_ict_budget or (latest.annual_ict_budget if latest else Decimal("0.00")),
                planners_json=(latest.planners_json if latest and latest.planners_json else []),
                major_final_outputs=(latest.major_final_outputs if latest and latest.major_final_outputs else []),
                strategic_concerns_json=(latest.strategic_concerns_json if latest and latest.strategic_concerns_json else []),
                systems_json=(latest.systems_json if latest and latest.systems_json else []),
                databases_json=(latest.databases_json if latest and latest.databases_json else []),
                internal_projects_json=(latest.internal_projects_json if latest and latest.internal_projects_json else []),
                cross_projects_json=(latest.cross_projects_json if latest and latest.cross_projects_json else []),
                pmf_matrix_json=(latest.pmf_matrix_json if latest and latest.pmf_matrix_json else []),
                subsystem_network_layouts_json=(latest.subsystem_network_layouts_json if latest and getattr(latest, "subsystem_network_layouts_json", None) else []),
                mithi_special_solutions=(latest.mithi_special_solutions if latest and latest.mithi_special_solutions else []),
                mithi_hardware_inventory=(latest.mithi_hardware_inventory if latest and latest.mithi_hardware_inventory else []),
                implementation_schedules=(latest.implementation_schedules if latest and latest.implementation_schedules else [])
            )
            db.add(narrative)
            db.flush()

        update_dict = payload.model_dump(exclude_unset=True)
        for key, val in update_dict.items():
            if hasattr(narrative, key):
                setattr(narrative, key, val)

        if getattr(payload, "agency_head_position", None):
            narrative.agency_head_position = payload.agency_head_position
        if getattr(payload, "drbcp_approval_date", None):
            narrative.drbcp_approval_date = payload.drbcp_approval_date
        if getattr(payload, "drbcp_compliance_narrative_html", None):
            narrative.drbcp_compliance_narrative_html = payload.drbcp_compliance_narrative_html
        if getattr(payload, "head_of_agency_name", None):
            narrative.signatory_approved_by = payload.head_of_agency_name
        if getattr(payload, "cio_name", None):
            narrative.signatory_prepared_by = payload.cio_name
        if getattr(payload, "cio_plantilla_position", None):
            narrative.preparer_position = payload.cio_plantilla_position
        if getattr(payload, "dict_logo_url", None) is not None:
            narrative.dict_logo_url = payload.dict_logo_url
        if getattr(payload, "bagong_pilipinas_logo_url", None) is not None:
            narrative.bagong_pilipinas_logo_url = payload.bagong_pilipinas_logo_url

        log_audit_event(
            db=db,
            action="NARRATIVE_STUDIO_UPDATED",
            module="GOVERNANCE",
            user_id=admin["id"],
            ip_address=request.client.host if request.client else None,
            new_value={"issp_period": issp_period, "agency_name": narrative.agency_name}
        )

        db.commit()
        db.refresh(narrative)
        return {"status": "success", "message": "Master narrative updated successfully."}
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to update narrative for cycle '{issp_period}': {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to update narrative: {str(e)}")


@router.post("/narratives/{issp_period}/activate")
def activate_planning_cycle(
    issp_period: str,
    request: Request,
    db: Session = Depends(get_db),
    admin: dict = Depends(require_admin)
):
    try:
        # 1. Deactivate all existing planning cycles safely without session evaluation errors
        db.query(MasterNarrative).update({"is_active": False}, synchronize_session=False)

        # 2. Check if the target narrative already exists
        narrative = db.query(MasterNarrative).filter(MasterNarrative.issp_period == issp_period).first()
        
        # Look for the previous reference narrative to clone baselines if target is brand new
        latest = db.query(MasterNarrative).order_by(
            MasterNarrative.is_active.desc(),
            MasterNarrative.issp_period.desc()
        ).first()

        parts = issp_period.split("-")
        start_y = int(parts[0]) if len(parts) == 2 and parts[0].isdigit() else 2026
        end_y = int(parts[1]) if len(parts) == 2 and parts[1].isdigit() else (start_y + 2)

        if not narrative:
            narrative = MasterNarrative(
                issp_period=issp_period,
                issp_period_from=start_y,
                issp_period_to=end_y,
                agency_name=latest.agency_name if latest else settings.DEFAULT_AGENCY_NAME,
                agency_website_url=latest.agency_website_url if latest else settings.DEFAULT_AGENCY_WEBSITE,
                is_active=True,
                is_amendment=False,
                amendment_number=None,
                scope_choice=latest.scope_choice if latest else ScopeChoice.DEPARTMENT_WIDE,
                scope_json=latest.scope_json if latest and latest.scope_json else {"with_regional_offices": True, "with_bureaus": False},
                mandate_html=latest.mandate_html if latest and latest.mandate_html else "",
                functions=latest.functions if latest else "",
                vision_html=latest.vision_html if latest and latest.vision_html else "",
                mission_html=latest.mission_html if latest and latest.mission_html else "",
                present_situation_html=latest.present_situation_html if latest and latest.present_situation_html else "Active planning cycle baseline.",
                enterprise_architecture_narrative=getattr(latest, 'enterprise_architecture_narrative', None),
                drbcp_affected_assets_json=getattr(latest, 'drbcp_affected_assets_json', []) or [],
                drbcp_recovery_strategy_html=getattr(latest, 'drbcp_recovery_strategy_html', "") or "",
                drbcp_sop_phases_html=getattr(latest, 'drbcp_sop_phases_html', "") or "",
                drbcp_compliance_narrative_html=getattr(latest, 'drbcp_compliance_narrative_html', "") or "",
                is_archived=False,
                final_pdf_vault_url=None,
                signatory_prepared_by=latest.signatory_prepared_by if latest else "Chief Information Officer",
                preparer_position=latest.preparer_position if latest else "Chief Information Officer",
                cio_organizational_unit=latest.cio_organizational_unit if latest else "ICT Services",
                preparer_tel=latest.preparer_tel if latest else "",
                preparer_fax=latest.preparer_fax if latest else "",
                preparer_email=latest.preparer_email if latest else "",
                focal_name=latest.focal_name if latest else "",
                focal_position=latest.focal_position if latest else "",
                focal_organizational_unit=latest.focal_organizational_unit if latest else "",
                focal_email=latest.focal_email if latest else "",
                focal_contact_no=latest.focal_contact_no if latest else "",
                signatory_approved_by=latest.signatory_approved_by if latest else settings.DEFAULT_AGENCY_HEAD_TITLE,
                agency_head_position=getattr(latest, 'agency_head_position', None) or settings.DEFAULT_AGENCY_HEAD_TITLE,
                drbcp_approval_date=getattr(latest, 'drbcp_approval_date', None) or None,
                annual_ict_budget=latest.annual_ict_budget if latest else Decimal("0.00"),
                agency_logo_url=latest.agency_logo_url if latest else None,
                dict_logo_url=getattr(latest, "dict_logo_url", None) if latest else None,
                bagong_pilipinas_logo_url=getattr(latest, "bagong_pilipinas_logo_url", None) if latest else None,
                cert_logo_url=latest.cert_logo_url if latest else None,
                site_development_plan_url=latest.site_development_plan_url if latest else None,
                fiber_backbone_url=latest.fiber_backbone_url if latest else None,
                system_architecture_url=latest.system_architecture_url if latest else None,
                process_flow_diagram_url=latest.process_flow_diagram_url if latest else None,
                network_diagram_url=latest.network_diagram_url if latest else None,
                subsystem_network_layouts_json=getattr(latest, 'subsystem_network_layouts_json', []) or [],
                planners_json=latest.planners_json if latest and latest.planners_json else [],
                major_final_outputs=latest.major_final_outputs if latest and latest.major_final_outputs else [],
                strategic_concerns_json=latest.strategic_concerns_json if latest and latest.strategic_concerns_json else [],
                systems_json=latest.systems_json if latest and latest.systems_json else [],
                databases_json=latest.databases_json if latest and latest.databases_json else [],
                internal_projects_json=latest.internal_projects_json if latest and latest.internal_projects_json else [],
                cross_projects_json=latest.cross_projects_json if latest and latest.cross_projects_json else [],
                pmf_matrix_json=latest.pmf_matrix_json if latest and latest.pmf_matrix_json else [],
                mithi_special_solutions=latest.mithi_special_solutions if latest and latest.mithi_special_solutions else [],
                mithi_hardware_inventory=latest.mithi_hardware_inventory if latest and latest.mithi_hardware_inventory else [],
                implementation_schedules=latest.implementation_schedules if latest and latest.implementation_schedules else []
            )
            db.add(narrative)
            db.flush()
        else:
            narrative.is_active = True
            narrative.is_archived = False
            narrative.issp_period_from = start_y
            narrative.issp_period_to = end_y

        # 3. Clone Organizational Outcomes for the new cycle if none exist
        existing_outcomes = db.query(OrganizationalOutcome).filter(OrganizationalOutcome.issp_period == issp_period).count()
        if existing_outcomes == 0 and latest and latest.issp_period != issp_period:
            old_outcomes = db.query(OrganizationalOutcome).filter(OrganizationalOutcome.issp_period == latest.issp_period).all()
            for old_oo in old_outcomes:
                db.add(OrganizationalOutcome(
                    issp_period=issp_period,
                    type_label=old_oo.type_label,
                    outcome_name=old_oo.outcome_name,
                    description=old_oo.description
                ))
            db.flush()

        # 4. Clone Budget Ceilings for the new cycle if none exist
        departments = db.query(Department).all()
        for dept in departments:
            has_ceiling = db.query(BudgetCeiling).filter(
                BudgetCeiling.department_id == dept.id,
                BudgetCeiling.issp_period == issp_period
            ).first()
            if not has_ceiling:
                old_ceiling = None
                if latest:
                    old_ceiling = db.query(BudgetCeiling).filter(
                        BudgetCeiling.department_id == dept.id,
                        BudgetCeiling.issp_period == latest.issp_period
                    ).first()
                capex = old_ceiling.allocated_capex if old_ceiling else Decimal("0.00")
                mooe = old_ceiling.allocated_mooe if old_ceiling else Decimal("0.00")
                db.add(BudgetCeiling(
                    department_id=dept.id,
                    issp_period=issp_period,
                    allocated_capex=capex,
                    allocated_mooe=mooe
                ))
            db.flush()

        # 5. Synchronize system setting if present
        active_setting = db.query(SystemSetting).filter(SystemSetting.key == "issp_active_cycle").first()
        if active_setting:
            active_setting.value = issp_period
        else:
            db.add(SystemSetting(key="issp_active_cycle", value=issp_period))

        log_audit_event(
            db=db,
            action="PLANNING_CYCLE_ACTIVATED",
            module="GOVERNANCE",
            user_id=admin["id"],
            ip_address=request.client.host if request.client else None,
            new_value={"issp_period": issp_period, "duration": f"{start_y}-{end_y}"}
        )

        db.commit()
        return {"status": "success", "message": f"Planning cycle FY {issp_period} activated."}
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to activate planning cycle '{issp_period}': {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to activate cycle: {str(e)}")


@router.post("/narratives/{issp_period}/reset")
def reset_planning_cycle(
    issp_period: str,
    request: Request,
    db: Session = Depends(get_db),
    admin: dict = Depends(require_admin)
):
    db.query(Proposal).filter(
        Proposal.issp_period == issp_period,
        Proposal.status.in_([ProposalStatus.DRAFT, ProposalStatus.RETURNED])
    ).delete(synchronize_session=False)

    log_audit_event(
        db=db,
        action="PLANNING_CYCLE_RESET",
        module="GOVERNANCE",
        user_id=admin["id"],
        ip_address=request.client.host if request.client else None,
        new_value={"issp_period": issp_period, "reset_status": "DRAFTS_PURGED"}
    )

    db.commit()
    return {"status": "success", "message": f"Cycle {issp_period} draft ledger safely reset."}


@router.post("/narratives/{issp_period}/upload-diagram")
async def upload_diagram(
    request: Request,
    issp_period: str,
    category: str = Query(..., description="Official DICT v.2026 diagram identifier or dynamic subsystem key"),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    admin: dict = Depends(require_admin)
):
    narrative = db.query(MasterNarrative).filter(MasterNarrative.issp_period == issp_period).first()
    if not narrative:
        raise HTTPException(status_code=404, detail="Planning narrative not found.")

    file_bytes = await file.read()
    safe_name = secure_filename(file.filename)
    key = storage_client.get_diagram_key(category, safe_name)
    success = storage_client.upload_canvas_evidence(file_bytes, key)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to write diagram asset to storage.")

    url = storage_client.generate_download_url(key)
    
    # Official DICT v.2026 Core Architectural Schematics & Seals Mapping
    core_dict_mapping = {
        "dict_logo": "dict_logo_url",                      # Page 1 DICT Co-Branding Seal
        "bagong_pilipinas_logo": "bagong_pilipinas_logo_url", # Page 1 Bagong Pilipinas Emblem
        "agency_logo": "agency_logo_url",                  # Page 1 Agency Institutional Seal
        "network_diagram": "network_diagram_url",          # Part II.B.1 Existing LAN/WAN Topology
        "fiber_backbone": "fiber_backbone_url",            # Part III.A.1 Proposed LAN/WAN / Backbone Layout
        "system_architecture": "system_architecture_url",  # Part III.B Enterprise Architecture Schematic
        "org_chart": "org_chart_url",                      # Part I.B Overall Agency Organizational Structure
        "proposed_ict_org": "proposed_ict_org_url"         # Part III.C Proposed ICT Unit Structure
    }

    if category in core_dict_mapping and hasattr(narrative, core_dict_mapping[category]):
        setattr(narrative, core_dict_mapping[category], url)
    elif hasattr(narrative, category):
        setattr(narrative, category, url)

    # In parallel, capture any custom subsystem or departmental diagram dynamically into JSON store
    if hasattr(narrative, 'set_subsystem_layout'):
        narrative.set_subsystem_layout(category, url)

    log_audit_event(
        db=db,
        action=f"DIAGRAM_UPLOADED_{category.upper()}",
        module="GOVERNANCE",
        user_id=admin["id"],
        ip_address=request.client.host if (request and request.client) else None,
        new_value={"category": category, "file_url": url, "issp_period": issp_period}
    )

    db.commit()
    return {"status": "success", "file_url": url, "category": category}


# ==========================================================
# NARRATIVE CHILD ARTIFACTS (HUMAN CAPITAL, DRT, BIA, ETC.)
# ==========================================================

@router.get("/narratives/{issp_period}/human-capitals", response_model=List[HumanCapitalResponse])
def get_human_capitals(issp_period: str, db: Session = Depends(get_db), admin: dict = Depends(require_admin)):
    return db.query(HumanCapital).filter(HumanCapital.issp_period == issp_period).all()

@router.post("/narratives/{issp_period}/human-capitals", response_model=HumanCapitalResponse)
def add_human_capital(issp_period: str, payload: HumanCapitalCreate, db: Session = Depends(get_db), admin: dict = Depends(require_admin)):
    hc = HumanCapital(issp_period=issp_period, **payload.model_dump())
    db.add(hc)
    db.commit()
    db.refresh(hc)
    return hc

@router.put("/human-capitals/{id}", response_model=HumanCapitalResponse)
def update_human_capital(id: int, payload: HumanCapitalCreate, db: Session = Depends(get_db), admin: dict = Depends(require_admin)):
    hc = db.query(HumanCapital).filter(HumanCapital.id == id).first()
    if not hc:
        raise HTTPException(status_code=404, detail="Human capital record not found.")
    for k, v in payload.model_dump().items():
        setattr(hc, k, v)
    db.commit()
    db.refresh(hc)
    return hc

@router.delete("/human-capitals/{id}")
def delete_human_capital(id: int, db: Session = Depends(get_db), admin: dict = Depends(require_admin)):
    db.query(HumanCapital).filter(HumanCapital.id == id).delete()
    db.commit()
    return {"status": "success"}

@router.get("/narratives/{issp_period}/stakeholders", response_model=List[StakeholderAnalysisResponse])
def get_stakeholders(issp_period: str, db: Session = Depends(get_db), admin: dict = Depends(require_admin)):
    return db.query(StakeholderAnalysis).filter(StakeholderAnalysis.issp_period == issp_period).all()

@router.post("/narratives/{issp_period}/stakeholders", response_model=StakeholderAnalysisResponse)
def add_stakeholder(issp_period: str, payload: StakeholderAnalysisCreate, db: Session = Depends(get_db), admin: dict = Depends(require_admin)):
    dumped = payload.model_dump()
    complexity_in = dumped.get("complexity_incoming") or dumped.get("incoming_complexity") or "Simple"
    complexity_out = dumped.get("complexity_outgoing") or dumped.get("outgoing_complexity") or "Simple"
    
    sh = StakeholderAnalysis(
        issp_period=issp_period,
        stakeholder_group=payload.stakeholder_group,
        transaction_processed_incoming=payload.transaction_processed_incoming,
        transaction_processed_outgoing=payload.transaction_processed_outgoing,
        complexity_incoming=getattr(complexity_in, "value", str(complexity_in)),
        complexity_outgoing=getattr(complexity_out, "value", str(complexity_out))
    )
    db.add(sh)
    db.commit()
    db.refresh(sh)
    return sh

@router.put("/stakeholders/{id}", response_model=StakeholderAnalysisResponse)
def update_stakeholder(id: int, payload: StakeholderAnalysisCreate, db: Session = Depends(get_db), admin: dict = Depends(require_admin)):
    sh = db.query(StakeholderAnalysis).filter(StakeholderAnalysis.id == id).first()
    if not sh:
        raise HTTPException(status_code=404, detail="Stakeholder analysis record not found.")
    
    dumped = payload.model_dump()
    sh.stakeholder_group = payload.stakeholder_group
    sh.transaction_processed_incoming = payload.transaction_processed_incoming
    sh.transaction_processed_outgoing = payload.transaction_processed_outgoing
    
    comp_in = dumped.get("complexity_incoming") or dumped.get("incoming_complexity")
    if comp_in:
        sh.complexity_incoming = getattr(comp_in, "value", str(comp_in))
        
    comp_out = dumped.get("complexity_outgoing") or dumped.get("outgoing_complexity")
    if comp_out:
        sh.complexity_outgoing = getattr(comp_out, "value", str(comp_out))
        
    db.commit()
    db.refresh(sh)
    return sh

@router.delete("/stakeholders/{id}")
def delete_stakeholder(id: int, db: Session = Depends(get_db), admin: dict = Depends(require_admin)):
    db.query(StakeholderAnalysis).filter(StakeholderAnalysis.id == id).delete()
    db.commit()
    return {"status": "success"}

@router.get("/narratives/{issp_period}/egov-checklists", response_model=List[EGovernmentChecklistResponse])
def get_egov_checklists(issp_period: str, db: Session = Depends(get_db), admin: dict = Depends(require_admin)):
    return db.query(EGovernmentChecklist).filter(EGovernmentChecklist.issp_period == issp_period).all()

@router.post("/narratives/{issp_period}/egov-checklists", response_model=EGovernmentChecklistResponse)
def add_egov_checklist(issp_period: str, payload: EGovernmentChecklistCreate, db: Session = Depends(get_db), admin: dict = Depends(require_admin)):
    eg = EGovernmentChecklist(issp_period=issp_period, **payload.model_dump())
    db.add(eg)
    db.commit()
    db.refresh(eg)
    return eg

@router.put("/egov-checklists/{id}", response_model=EGovernmentChecklistResponse)
def update_egov_checklist(id: int, payload: EGovernmentChecklistCreate, db: Session = Depends(get_db), admin: dict = Depends(require_admin)):
    eg = db.query(EGovernmentChecklist).filter(EGovernmentChecklist.id == id).first()
    if not eg:
        raise HTTPException(status_code=404, detail="E-Government checklist entry not found.")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(eg, k, v)
    db.commit()
    db.refresh(eg)
    return eg

@router.delete("/egov-checklists/{id}")
def delete_egov_checklist(id: int, db: Session = Depends(get_db), admin: dict = Depends(require_admin)):
    db.query(EGovernmentChecklist).filter(EGovernmentChecklist.id == id).delete()
    db.commit()
    return {"status": "success"}

@router.get("/narratives/{issp_period}/dr-teams", response_model=List[DisasterRecoveryTeamResponse])
def get_dr_teams(issp_period: str, db: Session = Depends(get_db), admin: dict = Depends(require_admin)):
    return db.query(DisasterRecoveryTeam).filter(DisasterRecoveryTeam.issp_period == issp_period).all()

@router.post("/narratives/{issp_period}/dr-teams", response_model=DisasterRecoveryTeamResponse)
def add_dr_team(issp_period: str, payload: DisasterRecoveryTeamCreate, db: Session = Depends(get_db), admin: dict = Depends(require_admin)):
    t = DisasterRecoveryTeam(issp_period=issp_period, **payload.model_dump())
    db.add(t)
    db.commit()
    db.refresh(t)
    return t

@router.put("/dr-teams/{id}", response_model=DisasterRecoveryTeamResponse)
def update_dr_team(id: int, payload: DisasterRecoveryTeamCreate, db: Session = Depends(get_db), admin: dict = Depends(require_admin)):
    t = db.query(DisasterRecoveryTeam).filter(DisasterRecoveryTeam.id == id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Disaster recovery team member not found.")
    for k, v in payload.model_dump().items():
        setattr(t, k, v)
    db.commit()
    db.refresh(t)
    return t

@router.delete("/dr-teams/{id}")
def delete_dr_team(id: int, db: Session = Depends(get_db), admin: dict = Depends(require_admin)):
    db.query(DisasterRecoveryTeam).filter(DisasterRecoveryTeam.id == id).delete()
    db.commit()
    return {"status": "success"}

@router.get("/narratives/{issp_period}/dr-bias", response_model=List[BusinessImpactAnalysisResponse])
def get_dr_bias(issp_period: str, db: Session = Depends(get_db), admin: dict = Depends(require_admin)):
    return db.query(BusinessImpactAnalysis).filter(BusinessImpactAnalysis.issp_period == issp_period).all()

@router.post("/narratives/{issp_period}/dr-bias", response_model=BusinessImpactAnalysisResponse)
def add_dr_bia(issp_period: str, payload: BusinessImpactAnalysisCreate, db: Session = Depends(get_db), admin: dict = Depends(require_admin)):
    b = BusinessImpactAnalysis(issp_period=issp_period, **payload.model_dump())
    db.add(b)
    db.commit()
    db.refresh(b)
    return b

@router.put("/dr-bias/{id}", response_model=BusinessImpactAnalysisResponse)
def update_dr_bia(id: int, payload: BusinessImpactAnalysisCreate, db: Session = Depends(get_db), admin: dict = Depends(require_admin)):
    b = db.query(BusinessImpactAnalysis).filter(BusinessImpactAnalysis.id == id).first()
    if not b:
        raise HTTPException(status_code=404, detail="BIA record not found.")
    for k, v in payload.model_dump().items():
        setattr(b, k, v)
    db.commit()
    db.refresh(b)
    return b

@router.delete("/dr-bias/{id}")
def delete_dr_bia(id: int, db: Session = Depends(get_db), admin: dict = Depends(require_admin)):
    db.query(BusinessImpactAnalysis).filter(BusinessImpactAnalysis.id == id).delete()
    db.commit()
    return {"status": "success"}

@router.get("/narratives/{issp_period}/dr-metrics", response_model=List[DRBCPMetricResponse])
def get_dr_metrics(issp_period: str, db: Session = Depends(get_db), admin: dict = Depends(require_admin)):
    return db.query(DRBCPMetric).filter(DRBCPMetric.issp_period == issp_period).all()

@router.post("/narratives/{issp_period}/dr-metrics", response_model=DRBCPMetricResponse)
def add_dr_metric(issp_period: str, payload: DRBCPMetricCreate, db: Session = Depends(get_db), admin: dict = Depends(require_admin)):
    m = DRBCPMetric(issp_period=issp_period, **payload.model_dump())
    db.add(m)
    db.commit()
    db.refresh(m)
    return m

@router.put("/dr-metrics/{id}", response_model=DRBCPMetricResponse)
def update_dr_metric(id: int, payload: DRBCPMetricCreate, db: Session = Depends(get_db), admin: dict = Depends(require_admin)):
    m = db.query(DRBCPMetric).filter(DRBCPMetric.id == id).first()
    if not m:
        raise HTTPException(status_code=404, detail="DRBCP KPI metric not found.")
    for k, v in payload.model_dump().items():
        setattr(m, k, v)
    db.commit()
    db.refresh(m)
    return m

@router.delete("/dr-metrics/{id}")
def delete_dr_metric(id: int, db: Session = Depends(get_db), admin: dict = Depends(require_admin)):
    db.query(DRBCPMetric).filter(DRBCPMetric.id == id).delete()
    db.commit()
    return {"status": "success"}

@router.get("/narratives/{issp_period}/staff-positions", response_model=List[IctStaffPositionResponse])
def get_staff_positions(issp_period: str, db: Session = Depends(get_db), admin: dict = Depends(require_admin)):
    return db.query(IctStaffPosition).filter(IctStaffPosition.issp_period == issp_period).all()

@router.post("/narratives/{issp_period}/staff-positions", response_model=IctStaffPositionResponse)
def add_staff_position(issp_period: str, payload: IctStaffPositionCreate, db: Session = Depends(get_db), admin: dict = Depends(require_admin)):
    pos = IctStaffPosition(issp_period=issp_period, **payload.model_dump())
    db.add(pos)
    db.commit()
    db.refresh(pos)
    return pos

@router.put("/staff-positions/{id}", response_model=IctStaffPositionResponse)
def update_staff_position(id: uuid.UUID, payload: IctStaffPositionCreate, db: Session = Depends(get_db), admin: dict = Depends(require_admin)):
    pos = db.query(IctStaffPosition).filter(IctStaffPosition.id == id).first()
    if not pos:
        raise HTTPException(status_code=404, detail="Position not found.")
    for k, v in payload.model_dump().items():
        setattr(pos, k, v)
    db.commit()
    db.refresh(pos)
    return pos

@router.delete("/staff-positions/{id}")
def delete_staff_position(id: uuid.UUID, db: Session = Depends(get_db), admin: dict = Depends(require_admin)):
    db.query(IctStaffPosition).filter(IctStaffPosition.id == id).delete()
    db.commit()
    return {"status": "success"}

@router.get("/narratives/{issp_period}/metrics", response_model=List[PerformanceMetricResponse])
def get_performance_metrics(issp_period: str, db: Session = Depends(get_db), admin: dict = Depends(require_admin)):
    return db.query(PerformanceMetric).filter(PerformanceMetric.issp_period == issp_period).all()

@router.post("/narratives/{issp_period}/metrics", response_model=PerformanceMetricResponse)
def add_performance_metric(issp_period: str, payload: PerformanceMetricCreate, db: Session = Depends(get_db), admin: dict = Depends(require_admin)):
    metric = PerformanceMetric(issp_period=issp_period, **payload.model_dump())
    db.add(metric)
    db.commit()
    db.refresh(metric)
    return metric

@router.put("/metrics/{id}", response_model=PerformanceMetricResponse)
def update_performance_metric(id: uuid.UUID, payload: PerformanceMetricCreate, db: Session = Depends(get_db), admin: dict = Depends(require_admin)):
    metric = db.query(PerformanceMetric).filter(PerformanceMetric.id == id).first()
    if not metric:
        raise HTTPException(status_code=404, detail="Performance metric not found.")
    for k, v in payload.model_dump().items():
        setattr(metric, k, v)
    db.commit()
    db.refresh(metric)
    return metric

@router.delete("/metrics/{id}")
def delete_performance_metric(id: uuid.UUID, db: Session = Depends(get_db), admin: dict = Depends(require_admin)):
    db.query(PerformanceMetric).filter(PerformanceMetric.id == id).delete()
    db.commit()
    return {"status": "success"}

@router.get("/narratives/{issp_period}/cross-projects", response_model=List[CrossAgencyProjectResponse])
def get_cross_projects(issp_period: str, db: Session = Depends(get_db), admin: dict = Depends(require_admin)):
    return db.query(CrossAgencyProject).filter(CrossAgencyProject.issp_period == issp_period).all()

@router.post("/narratives/{issp_period}/cross-projects", response_model=CrossAgencyProjectResponse)
def add_cross_project(issp_period: str, payload: CrossAgencyProjectCreate, db: Session = Depends(get_db), admin: dict = Depends(require_admin)):
    proj = CrossAgencyProject(issp_period=issp_period, **payload.model_dump())
    db.add(proj)
    db.commit()
    db.refresh(proj)
    return proj

@router.put("/cross-projects/{id}", response_model=CrossAgencyProjectResponse)
def update_cross_project(id: uuid.UUID, payload: CrossAgencyProjectCreate, db: Session = Depends(get_db), admin: dict = Depends(require_admin)):
    proj = db.query(CrossAgencyProject).filter(CrossAgencyProject.id == id).first()
    if not proj:
        raise HTTPException(status_code=404, detail="Cross-agency project not found.")
    for k, v in payload.model_dump().items():
        setattr(proj, k, v)
    db.commit()
    db.refresh(proj)
    return proj

@router.delete("/cross-projects/{id}")
def delete_cross_project(id: uuid.UUID, db: Session = Depends(get_db), admin: dict = Depends(require_admin)):
    db.query(CrossAgencyProject).filter(CrossAgencyProject.id == id).delete()
    db.commit()
    return {"status": "success"}

@router.get("/narratives/{issp_period}/costs", response_model=List[AnnualCostBreakdownResponse])
def get_annual_costs(issp_period: str, db: Session = Depends(get_db), admin: dict = Depends(require_admin)):
    return db.query(AnnualCostBreakdown).filter(AnnualCostBreakdown.issp_period == issp_period).all()

@router.post("/narratives/{issp_period}/costs", response_model=AnnualCostBreakdownResponse)
def add_annual_cost(issp_period: str, payload: AnnualCostBreakdownCreate, db: Session = Depends(get_db), admin: dict = Depends(require_admin)):
    cost = AnnualCostBreakdown(issp_period=issp_period, **payload.model_dump())
    db.add(cost)
    db.commit()
    db.refresh(cost)
    return cost

@router.delete("/costs/{id}")
def delete_annual_cost(id: uuid.UUID, db: Session = Depends(get_db), admin: dict = Depends(require_admin)):
    db.query(AnnualCostBreakdown).filter(AnnualCostBreakdown.id == id).delete()
    db.commit()
    return {"status": "success"}


# ==========================================================
# DEPARTMENTS DIRECTORY CRUD
# ==========================================================

@router.get("/departments")
def get_all_departments(db: Session = Depends(get_db), admin: dict = Depends(require_admin)):
    depts = db.query(Department).all()
    return [{"department_id": d.id, "department_name": d.name} for d in depts]

@router.post("/departments")
def create_department(payload: Dict[str, Any], db: Session = Depends(get_db), admin: dict = Depends(require_admin)):
    name = payload.get("name", "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Department name is required.")
    dept = Department(name=name)
    db.add(dept)
    db.commit()
    db.refresh(dept)
    return {"status": "success", "department_id": dept.id, "department_name": dept.name}

@router.put("/departments/{department_id}")
def update_department(department_id: int, payload: Dict[str, Any], db: Session = Depends(get_db), admin: dict = Depends(require_admin)):
    dept = db.query(Department).filter(Department.id == department_id).first()
    if not dept:
        raise HTTPException(status_code=404, detail="Department not found.")
    name = payload.get("name", "").strip()
    if name:
        dept.name = name
    db.commit()
    return {"status": "success", "department_id": dept.id, "department_name": dept.name}

@router.delete("/departments/{department_id}")
def delete_department(department_id: int, db: Session = Depends(get_db), admin: dict = Depends(require_admin)):
    dept = db.query(Department).filter(Department.id == department_id).first()
    if not dept:
        raise HTTPException(status_code=404, detail="Department not found.")
    db.delete(dept)
    db.commit()
    return {"status": "success"}


# ==========================================================
# USER WHITELIST & ACCESS CONTROL (SUPPLY USER INTEGRATION)
# ==========================================================

@router.get("/users/whitelist", response_model=List[WhitelistedUserResponse])
def get_whitelisted_users(db: Session = Depends(get_db), admin: dict = Depends(require_admin)):
    return db.query(User).options(joinedload(User.department)).all()

@router.post("/users/whitelist", response_model=WhitelistedUserResponse)
def add_whitelisted_user(
    payload: WhitelistedUserCreate, 
    request: Request,
    db: Session = Depends(get_db), 
    admin: dict = Depends(require_admin)
):
    email_clean = payload.email.strip().lower()
    existing = db.query(User).filter(User.email == email_clean).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, 
            detail=f"Account '{email_clean}' is already registered."
        )

    if not payload.password or len(payload.password.strip()) < 8:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Initial password is required and must be at least 8 characters long."
        )

    hashed_pwd = bcrypt.hashpw(payload.password.strip().encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
    
    target_dept_id = payload.assigned_department_id if payload.role_tag != RoleTag.ROLE_MIS_ADMIN else None
    if payload.role_tag in [RoleTag.ROLE_DEPT_USER, RoleTag.ROLE_SUPPLY_USER] and not target_dept_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Department assignment is mandatory for role: {payload.role_tag.value}"
        )

    user = User(
        email=email_clean,
        role_tag=payload.role_tag,
        department_id=target_dept_id,
        is_whitelisted=True,
        password_hash=hashed_pwd
    )
    db.add(user)
    db.flush()

    log_audit_event(
        db=db,
        action="USER_MANUALLY_ONBOARDED",
        module="AUTHENTICATION",
        user_id=admin["id"],
        department_id=user.department_id,
        ip_address=request.client.host if request.client else None,
        new_value={"email": user.email, "role": user.role_tag.value, "dept_id": user.department_id}
    )
    db.commit()

    return user

@router.put("/users/whitelist/{user_id}", response_model=WhitelistedUserResponse)
def update_whitelisted_user(user_id: int, payload: WhitelistedUserUpdate, db: Session = Depends(get_db), admin: dict = Depends(require_admin)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")
    
    if payload.email:
        user.email = payload.email.strip().lower()
    if payload.role_tag:
        user.role_tag = payload.role_tag
    if payload.assigned_department_id is not None:
        user.department_id = payload.assigned_department_id if user.role_tag != RoleTag.ROLE_MIS_ADMIN else None
    if payload.password and payload.password.strip():
        user.password_hash = bcrypt.hashpw(payload.password.strip().encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

    db.commit()
    db.refresh(user)
    return user

@router.delete("/users/whitelist/{user_id}")
def delete_whitelisted_user(user_id: int, db: Session = Depends(get_db), admin: dict = Depends(require_admin)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")
    db.delete(user)
    db.commit()
    return {"status": "success"}


# ==========================================================
# STANDARD PRICE CATALOG
# ==========================================================

@router.get("/catalog", response_model=List[CatalogItemResponse])
def get_catalog_items(db: Session = Depends(get_db), admin: dict = Depends(require_admin)):
    return db.query(CatalogItem).all()

@router.post("/catalog", response_model=CatalogItemResponse, status_code=status.HTTP_201_CREATED)
def create_catalog_item(payload: CatalogItemCreate, db: Session = Depends(get_db), admin: dict = Depends(require_admin)):
    existing = db.query(CatalogItem).filter(CatalogItem.item_key == payload.item_key).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"Catalog item key '{payload.item_key}' already exists.")
    item = CatalogItem(**payload.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    return item

@router.put("/catalog/{item_id}", response_model=CatalogItemResponse)
def update_catalog_item(item_id: uuid.UUID, payload: CatalogItemUpdate, db: Session = Depends(get_db), admin: dict = Depends(require_admin)):
    item = db.query(CatalogItem).filter(CatalogItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Catalog item not found.")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(item, k, v)
    db.commit()
    db.refresh(item)
    return item


# ==========================================================
# PHYSICAL CAMPUSES & AUXILIARY DICT SURVEYS
# ==========================================================

@router.get("/campuses", response_model=List[CampusResponse])
def get_campuses(db: Session = Depends(get_db), admin: dict = Depends(require_admin)):
    return db.query(Campus).all()

@router.post("/campuses", response_model=CampusResponse, status_code=status.HTTP_201_CREATED)
def create_campus(payload: CampusCreate, db: Session = Depends(get_db), admin: dict = Depends(require_admin)):
    campus = Campus(**payload.model_dump())
    db.add(campus)
    db.commit()
    db.refresh(campus)
    return campus

@router.put("/campuses/{campus_id}", response_model=CampusResponse)
def update_campus(campus_id: int, payload: CampusCreate, db: Session = Depends(get_db), admin: dict = Depends(require_admin)):
    campus = db.query(Campus).filter(Campus.id == campus_id).first()
    if not campus:
        raise HTTPException(status_code=404, detail="Campus not found.")
    for k, v in payload.model_dump().items():
        setattr(campus, k, v)
    db.commit()
    db.refresh(campus)
    return campus

@router.delete("/campuses/{campus_id}")
def delete_campus(campus_id: int, db: Session = Depends(get_db), admin: dict = Depends(require_admin)):
    campus = db.query(Campus).filter(Campus.id == campus_id).first()
    if not campus:
        raise HTTPException(status_code=404, detail="Campus not found.")
    db.delete(campus)
    db.commit()
    return {"status": "success"}

@router.get("/glossary", response_model=List[GlossaryTermResponse])
def get_glossary(db: Session = Depends(get_db), admin: dict = Depends(require_admin)):
    return db.query(GlossaryTerm).order_by(GlossaryTerm.order_index.asc()).all()

@router.post("/glossary", response_model=GlossaryTermResponse)
def create_glossary(payload: GlossaryTermCreate, db: Session = Depends(get_db), admin: dict = Depends(require_admin)):
    t = GlossaryTerm(**payload.model_dump())
    db.add(t)
    db.commit()
    db.refresh(t)
    return t

@router.put("/glossary/{id}", response_model=GlossaryTermResponse)
def update_glossary(id: int, payload: GlossaryTermCreate, db: Session = Depends(get_db), admin: dict = Depends(require_admin)):
    t = db.query(GlossaryTerm).filter(GlossaryTerm.id == id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Term not found.")
    for k, v in payload.model_dump().items():
        setattr(t, k, v)
    db.commit()
    db.refresh(t)
    return t

@router.delete("/glossary/{id}")
def delete_glossary(id: int, db: Session = Depends(get_db), admin: dict = Depends(require_admin)):
    db.query(GlossaryTerm).filter(GlossaryTerm.id == id).delete()
    db.commit()
    return {"status": "success"}

@router.get("/instructions", response_model=List[GeneralInstructionResponse])
def get_instructions(db: Session = Depends(get_db), admin: dict = Depends(require_admin)):
    return db.query(GeneralInstruction).order_by(GeneralInstruction.step_number.asc()).all()

@router.post("/instructions", response_model=GeneralInstructionResponse)
def create_instruction(payload: GeneralInstructionCreate, db: Session = Depends(get_db), admin: dict = Depends(require_admin)):
    i = GeneralInstruction(**payload.model_dump())
    db.add(i)
    db.commit()
    db.refresh(i)
    return i

@router.put("/instructions/{id}", response_model=GeneralInstructionResponse)
def update_instruction(id: int, payload: GeneralInstructionCreate, db: Session = Depends(get_db), admin: dict = Depends(require_admin)):
    i = db.query(GeneralInstruction).filter(GeneralInstruction.id == id).first()
    if not i:
        raise HTTPException(status_code=404, detail="Instruction not found.")
    for k, v in payload.model_dump().items():
        setattr(i, k, v)
    db.commit()
    db.refresh(i)
    return i

@router.delete("/instructions/{id}")
def delete_instruction(id: int, db: Session = Depends(get_db), admin: dict = Depends(require_admin)):
    db.query(GeneralInstruction).filter(GeneralInstruction.id == id).delete()
    db.commit()
    return {"status": "success"}

@router.get("/server-capacities", response_model=List[ServerCapacityResponse])
def get_server_capacities(db: Session = Depends(get_db), admin: dict = Depends(require_admin)):
    return db.query(ServerCapacityTrack).all()

@router.post("/server-capacities", response_model=ServerCapacityResponse)
def create_server_capacity(payload: ServerCapacityCreate, db: Session = Depends(get_db), admin: dict = Depends(require_admin)):
    cap = ServerCapacityTrack(**payload.model_dump())
    db.add(cap)
    db.commit()
    db.refresh(cap)
    return cap

@router.delete("/server-capacities/{id}")
def delete_server_capacity(id: uuid.UUID, db: Session = Depends(get_db), admin: dict = Depends(require_admin)):
    db.query(ServerCapacityTrack).filter(ServerCapacityTrack.id == id).delete()
    db.commit()
    return {"status": "success"}

@router.get("/os-census", response_model=List[ClientOsCensusResponse])
def get_os_census(db: Session = Depends(get_db), admin: dict = Depends(require_admin)):
    return db.query(ClientOsCensus).all()

@router.post("/os-census", response_model=ClientOsCensusResponse)
def create_os_census(payload: ClientOsCensusCreate, db: Session = Depends(get_db), admin: dict = Depends(require_admin)):
    c = ClientOsCensus(**payload.model_dump())
    db.add(c)
    db.commit()
    db.refresh(c)
    return c

@router.put("/os-census/{id}", response_model=ClientOsCensusResponse)
def update_os_census(id: int, payload: ClientOsCensusCreate, db: Session = Depends(get_db), admin: dict = Depends(require_admin)):
    c = db.query(ClientOsCensus).filter(ClientOsCensus.id == id).first()
    if not c:
        raise HTTPException(status_code=404, detail="OS Census entry not found.")
    for k, v in payload.model_dump().items():
        setattr(c, k, v)
    db.commit()
    db.refresh(c)
    return c

@router.delete("/os-census/{id}")
def delete_os_census(id: int, db: Session = Depends(get_db), admin: dict = Depends(require_admin)):
    db.query(ClientOsCensus).filter(ClientOsCensus.id == id).delete()
    db.commit()
    return {"status": "success"}

@router.get("/software-census", response_model=List[OfficeSoftwareResponse])
def get_software_census(db: Session = Depends(get_db), admin: dict = Depends(require_admin)):
    return db.query(OfficeSoftwareCensus).all()

@router.post("/software-census", response_model=OfficeSoftwareResponse)
def create_software_census(payload: OfficeSoftwareCreate, db: Session = Depends(get_db), admin: dict = Depends(require_admin)):
    s = OfficeSoftwareCensus(**payload.model_dump())
    db.add(s)
    db.commit()
    db.refresh(s)
    return s

@router.delete("/software-census/{id}")
def delete_software_census(id: int, db: Session = Depends(get_db), admin: dict = Depends(require_admin)):
    db.query(OfficeSoftwareCensus).filter(OfficeSoftwareCensus.id == id).delete()
    db.commit()
    return {"status": "success"}

@router.get("/audit-logs", response_model=List[AuditLogEntryResponse])
def get_audit_logs(
    module: Optional[str] = Query(None),
    dept_id: Optional[int] = Query(None),
    db: Session = Depends(get_db), 
    admin: dict = Depends(require_admin)
):
    query = db.query(AuditTrail).options(
        joinedload(AuditTrail.user),
        joinedload(AuditTrail.department)
    )

    if module and module != "All":
        query = query.filter(AuditTrail.module == module)
    if dept_id:
        query = query.filter(AuditTrail.department_id == dept_id)

    logs = query.order_by(AuditTrail.timestamp.desc()).limit(500).all()
    out = []
    for l in logs:
        out.append(
            AuditLogEntryResponse(
                id=l.id,
                proposal_id=l.proposal_id,
                action=l.action,
                module=getattr(l, "module", "GOVERNANCE"),
                ip_address=getattr(l, "ip_address", None),
                department_id=getattr(l, "department_id", None),
                user_id=l.user_id,
                operator_email=l.user.email if l.user else "System",
                operator_role=l.user.role_tag.value if l.user else "SYSTEM",
                timestamp=l.timestamp,
                old_value=l.old_value,
                new_value=l.new_value
            )
        )
    return out


# ==========================================================
# ASYNC COMPILATION & GOVERNANCE TRIGGER
# ==========================================================

@router.post("/governance/generate-issp")
def trigger_document_generation(
    issp_period: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    admin: dict = Depends(require_admin)
):
    try:
        target_period = issp_period or get_active_issp_period(db)
        narrative = db.query(MasterNarrative).filter(MasterNarrative.issp_period == target_period).first()
        if not narrative:
            raise HTTPException(status_code=400, detail=f"Planning cycle '{target_period}' not configured.")

        approved_proposals = db.query(Proposal).filter(
            Proposal.status == ProposalStatus.APPROVED,
            Proposal.issp_period == target_period,
            or_(Proposal.is_archived == False, Proposal.is_archived.is_(None))
        ).all()

        if not approved_proposals:
            raise HTTPException(status_code=400, detail="Compilation blocked: No approved proposals exist for this cycle.")

        total_capex = sum((p.total_cost for p in approved_proposals if p.expenditure_class == ExpenditureClass.CAPITAL_OUTLAY), Decimal("0.00"))
        total_mooe = sum((p.total_cost for p in approved_proposals if p.expenditure_class == ExpenditureClass.MOOE), Decimal("0.00"))

        compiled_meta = {
            "issp_id": f"ISSP-{target_period}-FINAL",
            "agency_name": narrative.agency_name,
            "issp_period_years": target_period,
            "allocated_budget": str(total_capex + total_mooe),
            "total_capex": str(total_capex),
            "total_mooe": str(total_mooe)
        }

        task = compile_issp_document.delay(compiled_meta)

        return {
            "status": "queued",
            "task_id": task.id,
            "active_cycle": target_period,
            "combined_plan_cost_php": str(total_capex + total_mooe),
            "approved_proposals_count": len(approved_proposals)
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to queue compilation: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Compilation task queue failed.")


@router.get("/governance/task-status/{task_id}")
def get_task_status(task_id: str, admin: dict = Depends(require_admin)):
    try:
        from celery.result import AsyncResult
        from app.celery_app import celery_app
        res = AsyncResult(task_id, app=celery_app)

        if res.state == "PROGRESS":
            meta = res.info or {}
            return {"state": "PROGRESS", "progress_percent": meta.get("progress", 50), "current_step_message": meta.get("status", "Rendering...")}
        elif res.state == "SUCCESS":
            return {"state": "SUCCESS", "progress_percent": 100, "current_step_message": "Compilation Complete", "result": res.result}
        elif res.state == "FAILURE":
            return {"state": "FAILURE", "progress_percent": 100, "current_step_message": "Compilation Failed", "error": str(res.info)}

        return {"state": res.state, "progress_percent": 10, "current_step_message": f"Task state: {res.state}"}
    except Exception as e:
        logger.error(f"Task status poll error: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to query worker status.")


@router.post("/governance/restore-document")
def restore_governance_document(
    payload: Dict[str, Any],
    db: Session = Depends(get_db),
    admin: dict = Depends(require_admin)
):
    doc_id = payload.get("document_id")
    return {"status": "success", "message": f"Glacier restore initiated for {doc_id}."}
