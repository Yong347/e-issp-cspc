# app/tasks/pdf_tasks.py
import io
import re
import time
import json
import base64
import logging
import mimetypes
from decimal import Decimal
from typing import Optional, List, Dict, Any
from pathlib import Path
from celery.exceptions import SoftTimeLimitExceeded
from sqlalchemy import or_, func, cast, String
from sqlalchemy.orm import joinedload, selectinload

from app.config import settings
from app.database.session import SessionLocal
from app.services.issp_engine import ISSPSingularityEngine
from app.database.models import (
    MasterNarrative,
    OrganizationalOutcome,
    StrategicConcern,
    InformationSystem,
    IctProject,
    PerformanceMetric,
    Proposal,
    ExistingInventory,
    HumanCapital,
    StakeholderAnalysis,
    EGovernmentChecklist,
    NetworkInfrastructure,
    CybersecurityControl,
    DisasterRecoveryTeam,
    BusinessImpactAnalysis,
    DRBCPMetric,
    GlossaryTerm,
    IctStaffPosition,
    StrategicCategory,
    UacsCatalogItem,
    ProposalStatus
)
from app.storage.s3_client import storage_client
from app.celery_app import celery_app
from app.utils.helpers import (
    calculate_financial_summaries, 
    get_cycle_year_range, 
    get_adjusted_unit_cost_for_year,
    get_governance_policy,
    get_active_issp_period
)

logger = logging.getLogger(__name__)

# =========================================================================
# STATUTORY E-GOVERNMENT PROGRAMS SPECIFICATIONS (DICT v.2026)
# =========================================================================
CANONICAL_EGOV_SPECS = [
    ("elgu", "1. ELECTRONIC LOCAL GOVERNMENT UNIT (ELGU) SYSTEM (Applicable only to LGUs)"),
    ("egovpay", "2. GOVERNMENT DIGITAL PAYMENT SYSTEM FOR COLLECTION AND DISBURSEMENT"),
    ("pnpki", "3. GOVERNMENT PUBLIC KEY INFRASTRUCTURE (PNPKI)"),
    ("hcmis", "4. HUMAN CAPITAL MANAGEMENT INFORMATION SYSTEM (HCMIS)"),
    ("ifmis", "5. INTEGRATED FINANCIAL MANAGEMENT INFORMATION SYSTEM (IFMIS)"),
    ("portal", "6. ONLINE PUBLIC SERVICE PORTAL"),
    ("philgeps", "7. PROCUREMENT SYSTEM (PHILGEPS)"),
    ("records", "8. RECORDS AND KNOWLEDGE MANAGEMENT INFORMATION SYSTEM"),
    ("continuity", "9. PUBLIC SERVICE CONTINUITY PLAN (PSCP)")
]


# =========================================================================
# RUNTIME WEASYPRINT / PYDYF COMPATIBILITY PATCH
# =========================================================================
def patch_weasyprint_pydyf():
    """
    Hardens WeasyPrint 62.x against breaking changes in pydyf >= 0.11.0.
    In pydyf 0.11+, Stream.transform was replaced by Stream.set_matrix,
    causing `super().transform(...)` in weasyprint/pdf/stream.py:246 to fail with:
    AttributeError: 'super' object has no attribute 'transform'.
    """
    try:
        import pydyf
        if hasattr(pydyf, "Stream") and not hasattr(pydyf.Stream, "transform"):
            def _pydyf_stream_transform(self, a=1, b=0, c=0, d=1, e=0, f=0):
                if hasattr(self, "set_matrix"):
                    return self.set_matrix(a, b, c, d, e, f)
                return self.push(f"{a:f} {b:f} {c:f} {d:f} {e:f} {f:f} cm")
            pydyf.Stream.transform = _pydyf_stream_transform
    except Exception as e:
        logger.debug(f"pydyf patch note: {e}")

    try:
        from weasyprint.pdf import stream as wp_stream
        if hasattr(wp_stream, "Stream"):
            def _wp_stream_transform(self, a=1, b=0, c=0, d=1, e=0, f=0):
                if hasattr(self, "set_matrix"):
                    return self.set_matrix(a, b, c, d, e, f)
                elif hasattr(super(wp_stream.Stream, self), "transform"):
                    return super(wp_stream.Stream, self).transform(a, b, c, d, e, f)
                else:
                    return self.push(f"{a:f} {b:f} {c:f} {d:f} {e:f} {f:f} cm")
            wp_stream.Stream.transform = _wp_stream_transform
    except Exception as e:
        logger.debug(f"weasyprint stream patch note: {e}")


patch_weasyprint_pydyf()

# =========================================================================
# IN-MEMORY TASK STORE FOR STANDALONE & NON-REDIS RUNTIMES
# =========================================================================
TASK_PROGRESS_STORE: Dict[str, Dict[str, Any]] = {}


def get_task_progress(task_id: str) -> Optional[Dict[str, Any]]:
    return TASK_PROGRESS_STORE.get(str(task_id))


def set_task_progress(
    task_id: str, 
    state: str, 
    percent: int, 
    message: str, 
    result: Any = None, 
    error: Any = None
) -> None:
    TASK_PROGRESS_STORE[str(task_id)] = {
        "task_id": str(task_id),
        "state": state,
        "progress_percent": percent,
        "current_step_message": message,
        "result": result,
        "error": error,
        "timestamp": time.time()
    }


def safe_update_progress(
    task: Any, 
    state: str, 
    percent: int, 
    message: str, 
    result: Any = None, 
    error: Any = None
) -> None:
    task_id = None
    if task and hasattr(task, "request") and getattr(task.request, "id", None):
        task_id = str(task.request.id)
    elif isinstance(task, str):
        task_id = task

    if task_id:
        set_task_progress(task_id, state, percent, message, result, error)

    if task and hasattr(task, "update_state") and callable(getattr(task, "update_state")):
        try:
            task.update_state(
                state=state, 
                meta={
                    "progress": percent,
                    "progress_percent": percent,
                    "status": message,
                    "current_step_message": message
                }
            )
        except Exception as exc:
            logger.debug("safe_update_progress Celery backend push note: %s", exc)


def clean_text(val: Optional[str], default: str = "") -> str:
    """
    Safely sanitizes text input without stripping real user data containing 'test'.
    """
    if val is None:
        return default
    s = str(val).strip()
    if s.lower() in ("none", "null", "undefined", ""):
        return default
    return s


def clean_uacs_title(uacs_str: Optional[str]) -> str:
    if not uacs_str:
        return ""
    val = str(uacs_str).strip()
    if " - " in val:
        return val.split(" - ", 1)[1].strip()
    cleaned = re.sub(r'^\d{8}(?:\s+\d{2})?\s*[-–]?\s*', '', val).strip()
    return cleaned or val


def format_text_blocks(val: Optional[str], default: str = "") -> str:
    raw = clean_text(val, default)
    if not raw:
        return ""
    if "<p>" in raw or "<ul>" in raw or "<ol>" in raw:
        return raw.replace("<ol>", "<ul>").replace("</ol>", "</ul>")
    
    lines = [line.strip() for line in raw.split("\n") if line.strip()]
    if not lines:
        return ""
    
    is_bulleted = all(l.startswith(("-", "•", "*")) for l in lines)
    is_numbered = all(len(l) > 2 and l[0].isdigit() and l[1] in (".", ")", " ") for l in lines)
    if is_bulleted or is_numbered:
        items = []
        for l in lines:
            cleaned = l.lstrip("-•*0123456789.) ").strip()
            items.append(f"<li>{cleaned}</li>")
        return f"<ul>{''.join(items)}</ul>"

    paragraphs = raw.split("\n\n")
    if len(paragraphs) == 1 and len(lines) > 1:
        paragraphs = lines
    return "".join(f"<p style='text-align: justify; margin: 3px 0;'>{p.strip()}</p>" for p in paragraphs if p.strip())


def resolve_local_img_path(url: Optional[str]) -> Optional[str]:
    """
    Safely resolves image paths without suppressing user uploaded files
    that contain words such as 'test', 'sample', etc.
    """
    if not url:
        return None
    normalized = url.strip()
    if ".." in normalized or normalized.lower().startswith("file://"):
        logger.warning(f"Security Block: Traversal or local file scheme prohibited: {url}")
        return None

    if getattr(settings, "STORAGE_TYPE", "local") == "local":
        try:
            if "/static/uploads/" in normalized:
                relative_path = normalized.split("/static/uploads/")[-1]
                local_file = Path(settings.LOCAL_UPLOAD_DIR) / relative_path
                if local_file.exists() and local_file.is_file():
                    mime, _ = mimetypes.guess_type(str(local_file))
                    mime = mime or "image/png"
                    data = local_file.read_bytes()
                    return f"data:{mime};base64,{base64.b64encode(data).decode('utf-8')}"
        except Exception as disk_err:
            logger.warning(f"Direct disk image read bypassed for {url}: {disk_err}")

    try:
        return storage_client.get_as_base64_uri(normalized)
    except Exception as e:
        logger.error(f"Image conversion failed for url {url}: {str(e)}")
        return None


def fmt_currency(val: Any) -> str:
    if val is None:
        return "₱0.00"
    try:
        dec = Decimal(str(val))
        return f"₱{dec:,.2f}"
    except Exception:
        return "₱0.00"


def render_schematic_page(
    title: str, 
    subtitle: str, 
    img_url: Optional[str], 
    narrative_text: Optional[str] = None,
    section_id: Optional[str] = None
) -> str:
    resolved = resolve_local_img_path(img_url) if img_url else None
    id_attr = f' id="{section_id}"' if section_id else ""
    narrative_block = f'<div style="font-size: 8pt; line-height: 1.35; margin-bottom: 6px; text-align: justify;">{format_text_blocks(narrative_text)}</div>' if narrative_text else ""

    if resolved:
        return f"""
        <div class="full-page-schematic"{id_attr}>
            <div class="section-header">{title}</div>
            <p style="font-size: 8pt; color: #475569; margin-bottom: 4px;">{subtitle}</p>
            {narrative_block}
            <img src="{resolved}" class="schematic-img" alt="{title}" />
        </div>
        """
    else:
        return f"""
        <div class="full-page-schematic"{id_attr}>
            <div class="section-header">{title}</div>
            <p style="font-size: 8pt; color: #475569; margin-bottom: 6px;">{subtitle}</p>
            {narrative_block}
            <div class="schematic-placeholder-box">
                <div style="font-size: 10pt; font-weight: bold; color: #1e3a8a; margin-bottom: 4px;">
                    OFFICIAL SCHEMATIC SPECIFICATION FRAMEWORK
                </div>
                <div style="font-size: 8pt; color: #64748b; font-family: monospace;">
                    {title}
                </div>
                <div style="font-size: 7.5pt; color: #475569; margin-top: 8px; max-width: 600px; margin-left: auto; margin-right: auto; line-height: 1.4;">
                    Physical and logical architecture diagram maintained under institutional repository.
                    Approved under DICT ISSP Guidelines &bull; Reference Exhibit for Planning Horizon.
                </div>
            </div>
        </div>
        """


def resolve_proposal_category(itm: Proposal) -> str:
    """
    In DICT ISSP methodology, categorization is strictly governed by the 
    parent ICT Project or designated standalone operational bucket.
    """
    proj = getattr(itm, "project_rel", None)
    if proj and getattr(proj, "project_category", None):
        return str(getattr(proj.project_category, "value", proj.project_category)).strip()
    
    strat = str(getattr(itm, "strategic_category", "value" if hasattr(itm, "strategic_category") and hasattr(itm.strategic_category, "value") else itm.strategic_category or "")).strip()
    if strat:
        return strat

    cat_lower = str(getattr(itm.category, "value", itm.category or "")).strip().lower()
    if cat_lower in ["subscription", "services"]:
        return "Continuing Costs/Expenses"

    return "Office Productivity"


def infer_dict_category(item_name: str, is_software: bool) -> str:
    """Fallback inference for assets without an explicit DICT category."""
    name_clean = (item_name or "").strip().lower()
    if is_software:
        if any(k in name_clean for k in ["antivirus", "anti-virus", "edr", "endpoint"]):
            return "Antivirus"
        if any(k in name_clean for k in ["grammar", "grammarly"]):
            return "Grammar checker"
        if any(k in name_clean for k in ["graphics", "simulation", "cad", "autocad", "3d"]):
            return "Graphics and Simulation Software"
        if any(k in name_clean for k in ["help desk", "helpdesk", "ticketing"]):
            return "IT Help Desk Tool"
        if any(k in name_clean for k in ["photo", "video", "premiere", "photoshop"]):
            return "Photo and Video Editing Software"
        if any(k in name_clean for k in ["waf", "firewall", "web application firewall"]):
            return "Web Application Firewall"
        if any(k in name_clean for k in ["office", "productivity", "word", "excel", "suite"]):
            return "Office Productivity Tool"
        return "Others (ICT Software)"
    else:
        if any(k in name_clean for k in ["switch", "router", "access point", "network"]):
            return "Network Switch"
        if any(k in name_clean for k in ["printer", "scanner", "plotter", "copier"]):
            return "Printer"
        if any(k in name_clean for k in ["tablet", "ipad"]):
            return "Tablet"
        if any(k in name_clean for k in ["mobile", "phone", "smartphone"]):
            return "Mobile Phone"
        if any(k in name_clean for k in ["laptop", "notebook", "thinkpad"]):
            return "Laptop"
        if any(k in name_clean for k in ["desktop", "pc", "optiplex", "workstation"]):
            return "Desktop"
        if any(k in name_clean for k in ["server", "rackmount", "blade", "san", "nas"]):
            return "Servers"
        return "Others (ICT Equipment)"


@celery_app.task(
    bind=True, 
    name="app.tasks.pdf_tasks.compile_issp_document",
    time_limit=1800,
    soft_time_limit=1500
)
def compile_issp_document(self, metadata: dict):
    patch_weasyprint_pydyf()
    db = SessionLocal()
    task_ref = self
    try:
        # Dynamically resolve active planning cycle from database or metadata
        issp_period = metadata.get("issp_period_years")
        if not issp_period:
            active_row = db.query(MasterNarrative).filter(MasterNarrative.is_active == True).first()
            issp_period = active_row.issp_period if active_row else get_active_issp_period(db)
        
        export_format = metadata.get("export_format", "pdf").lower().strip()
        
        safe_update_progress(task_ref, "PROGRESS", 15, "Certifying graph singularity and legal linkages...")
        try:
            ISSPSingularityEngine.validate_complete_issp_graph(db, issp_period)
        except Exception as exc:
            detail = getattr(exc, "detail", None)
            if isinstance(detail, dict) and "violations" in detail:
                violations = detail["violations"]
                v_str = "\n".join(f"• {v}" for v in violations)
                raise ValueError(f"ISSP Singularity Integrity Check Failed ({len(violations)} violations):\n{v_str}") from None
            elif detail:
                raise ValueError(f"ISSP Singularity Validation Failed: {detail}") from None
            raise ValueError(str(exc)) from None

        safe_update_progress(task_ref, "PROGRESS", 30, "Asserting four-way financial parity...")
        try:
            parity_data = calculate_financial_summaries(db, issp_period, only_approved=True)
        except TypeError:
            try:
                parity_data = ISSPSingularityEngine.calculate_part_iv_b_matrices(db, issp_period, only_approved=True)
            except Exception:
                parity_data = calculate_financial_summaries(db, issp_period)

        if not parity_data["is_parity_valid"]:
            raise ValueError(
                f"FATAL MATHEMATICAL PARITY BREACH: Tables B.1, B.2, B.3, and B.4 do not reconcile!\n"
                f"Maximum Discrepancy: ₱{parity_data['parity_discrepancy']:,.2f}."
            )

        safe_update_progress(task_ref, "PROGRESS", 45, "Extracting certified graph artifacts...")
        narrative = db.query(MasterNarrative).filter(MasterNarrative.issp_period == issp_period).first()
        if not narrative:
            narrative = db.query(MasterNarrative).filter(MasterNarrative.is_active == True).first()
            if narrative:
                issp_period = narrative.issp_period
            else:
                raise ValueError(f"Active planning cycle '{issp_period}' is not configured in the database.")

        outcomes = db.query(OrganizationalOutcome).filter(OrganizationalOutcome.issp_period == issp_period).all()
        concerns = db.query(StrategicConcern).filter(StrategicConcern.issp_period == issp_period).order_by(StrategicConcern.order_index.asc()).all()

        sys_query = db.query(InformationSystem).options(
            joinedload(InformationSystem.project_parent),
            joinedload(InformationSystem.strategic_concern),
            joinedload(InformationSystem.department)
        ).filter(InformationSystem.issp_period == issp_period)

        if hasattr(InformationSystem, 'submission_status'):
            sys_query = sys_query.filter(
                or_(
                    InformationSystem.submission_status == "Approved",
                    InformationSystem.submission_status.is_(None),
                    func.lower(cast(InformationSystem.submission_status, String)) == "approved"
                )
            )
        systems = sys_query.order_by(InformationSystem.name.asc()).all()

        projects = db.query(IctProject).options(
            joinedload(IctProject.information_system),
            selectinload(IctProject.resource_items),
            selectinload(IctProject.linked_systems),
            selectinload(IctProject.pmf_metrics)
        ).filter(IctProject.issp_period == issp_period).all()

        performance_metrics = db.query(PerformanceMetric).filter(PerformanceMetric.issp_period == issp_period).all()

        # Strict compilation: Only pull approved proposals that are bound to an ICT Project
        raw_approved_items = db.query(Proposal).options(
            joinedload(Proposal.project_rel),
            joinedload(Proposal.outcome),
            joinedload(Proposal.strategic_category_rel),
            joinedload(Proposal.department)
        ).filter(
            Proposal.issp_period == issp_period,
            func.lower(cast(Proposal.status, String)) == "approved",
            Proposal.project_id.isnot(None),
            or_(Proposal.is_archived == False, Proposal.is_archived.is_(None))
        ).all()

        items = raw_approved_items

        inventory = db.query(ExistingInventory).filter(
            or_(
                ExistingInventory.issp_period == issp_period,
                ExistingInventory.issp_period.is_(None)
            )
        ).all()

        human_capitals = db.query(HumanCapital).filter(HumanCapital.issp_period == issp_period).all()
        staff_positions = db.query(IctStaffPosition).filter(IctStaffPosition.issp_period == issp_period).all()
        stakeholders = db.query(StakeholderAnalysis).filter(StakeholderAnalysis.issp_period == issp_period).all()
        egov_checklists = db.query(EGovernmentChecklist).filter(EGovernmentChecklist.issp_period == issp_period).order_by(EGovernmentChecklist.id.asc()).all()
        network_infra = db.query(NetworkInfrastructure).filter(NetworkInfrastructure.issp_period == issp_period).all()
        cyber_controls = db.query(CybersecurityControl).filter(CybersecurityControl.issp_period == issp_period).all()
        dr_teams = db.query(DisasterRecoveryTeam).filter(DisasterRecoveryTeam.issp_period == issp_period).all()
        dr_bias = db.query(BusinessImpactAnalysis).filter(BusinessImpactAnalysis.issp_period == issp_period).all()
        dr_metrics = db.query(DRBCPMetric).filter(DRBCPMetric.issp_period == issp_period).all()
        glossary = db.query(GlossaryTerm).order_by(GlossaryTerm.order_index.asc()).all()

        # DUAL OUTPUT BRANCHING: WORD (.DOCX) VS PDF
        if export_format == "docx":
            safe_update_progress(task_ref, "PROGRESS", 70, "Building editable Word (.docx) document structure...")
            from app.services.docx_generator import create_issp_docx
            docx_buffer = create_issp_docx(
                narrative=narrative,
                outcomes=outcomes,
                concerns=concerns,
                systems=systems,
                projects=projects,
                performance_metrics=performance_metrics,
                items=items,
                inventory=inventory,
                parity_data=parity_data,
                human_capitals=human_capitals,
                staff_positions=staff_positions,
                stakeholders=stakeholders,
                egov_checklists=egov_checklists,
                glossary=glossary,
                network_infra=network_infra,
                cyber_controls=cyber_controls,
                dr_teams=dr_teams,
                dr_bias=dr_bias,
                dr_metrics=dr_metrics
            )
            docx_bytes = docx_buffer.getvalue()
            issp_id = f"ISSP-{issp_period}-FINAL"
            docx_key = f"generated_issps/{issp_id}.docx"

            if hasattr(storage_client, "upload_compiled_document"):
                storage_client.upload_compiled_document(docx_bytes, issp_id, ext="docx")
                docx_key = storage_client.get_generated_document_key(issp_id, ext="docx")
            elif getattr(storage_client, "storage_type", "local").lower() == "local":
                target_path = Path(settings.LOCAL_UPLOAD_DIR) / docx_key
                target_path.parent.mkdir(parents=True, exist_ok=True)
                target_path.write_bytes(docx_bytes)
            else:
                storage_client.client.put_object(
                    Bucket=storage_client.bucket_name,
                    Key=docx_key,
                    Body=docx_bytes,
                    ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                )

            download_url = storage_client.generate_download_url(docx_key)
            
            try:
                narrative_record = db.query(MasterNarrative).filter(MasterNarrative.issp_period == issp_period).first()
                if narrative_record:
                    narrative_record.final_docx_vault_url = download_url
                    db.commit()
            except Exception as db_save_err:
                db.rollback()
                logger.warning(f"Could not persist final_docx_vault_url: {db_save_err}")

            result_payload = {
                "status": "SUCCESS",
                "file_url": download_url,
                "certified_grand_total": str(parity_data["certified_grand_total"]),
                "issp_period": issp_period,
                "format": "docx",
                "generated_at": time.strftime("%Y-%m-%d %H:%M:%S")
            }
            safe_update_progress(task_ref, "SUCCESS", 100, "Word (.docx) compilation complete.", result=result_payload)
            return result_payload

        # DEFAULT: WEASYPRINT PDF COMPILATION
        safe_update_progress(task_ref, "PROGRESS", 65, "Compiling dynamic DICT v.2026 HTML templates...")
        html_content = generate_complete_issp_html(
            db, narrative, outcomes, concerns, systems, projects, performance_metrics, items, inventory,
            human_capitals, staff_positions, stakeholders, egov_checklists,
            glossary, network_infra, cyber_controls, dr_teams, dr_bias, dr_metrics, parity_data
        )

        safe_update_progress(task_ref, "PROGRESS", 80, "Rendering PDF binary via layout engine...")
        patch_weasyprint_pydyf()
        try:
            from weasyprint import HTML
        except (OSError, ImportError) as os_err:
            error_msg = (
                f"WeasyPrint native OS libraries missing: {str(os_err)}. "
                "Ensure libpango-1.0-0, libcairo2, and libgobject-2.0-0 are installed. "
                "Alternatively, export as Word (.docx) format."
            )
            safe_update_progress(task_ref, "FAILURE", 100, "WeasyPrint OS library missing.", error=error_msg)
            raise RuntimeError(error_msg) from os_err

        pdf_buffer = io.BytesIO()
        base_dir = str(Path(settings.LOCAL_UPLOAD_DIR).parent) if hasattr(settings, "LOCAL_UPLOAD_DIR") else None
        try:
            html_doc = HTML(string=html_content, base_url=base_dir)
            html_doc.write_pdf(target=pdf_buffer)
        except OSError as render_os_err:
            error_msg = (
                f"WeasyPrint rendering failed: {str(render_os_err)}. "
                "Host environment lacks required Pango/Cairo C-libraries. "
                "Export as Word (.docx) format or run in container."
            )
            safe_update_progress(task_ref, "FAILURE", 100, "Rendering failed.", error=error_msg)
            raise RuntimeError(error_msg) from render_os_err

        pdf_bytes = pdf_buffer.getvalue()

        safe_update_progress(task_ref, "PROGRESS", 95, "Archiving certified binary to secure institutional vault...")
        issp_id = f"ISSP-{issp_period}-FINAL"
        storage_client.upload_compiled_pdf(pdf_bytes, issp_id)
        download_url = storage_client.generate_download_url(storage_client.get_generated_pdf_key(issp_id))

        try:
            narrative_record = db.query(MasterNarrative).filter(MasterNarrative.issp_period == issp_period).first()
            if narrative_record:
                narrative_record.final_pdf_vault_url = download_url
                db.commit()
                logger.info(f"Persisted certified PDF vault URL for cycle {issp_period} to database.")
        except Exception as db_save_err:
            db.rollback()
            logger.warning(f"Failed to record final_pdf_vault_url to MasterNarrative: {db_save_err}")

        result_payload = {
            "status": "SUCCESS",
            "file_url": download_url,
            "certified_grand_total": str(parity_data["certified_grand_total"]),
            "issp_period": issp_period,
            "format": "pdf",
            "generated_at": time.strftime("%Y-%m-%d %H:%M:%S")
        }
        safe_update_progress(task_ref, "SUCCESS", 100, "PDF compilation complete.", result=result_payload)
        return result_payload

    except SoftTimeLimitExceeded:
        db.rollback()
        logger.error("Timeout exceeded during document compilation.")
        timeout_msg = "CompilationError: Execution time limit exceeded."
        safe_update_progress(task_ref, "FAILURE", 100, "Compilation timed out.", error=timeout_msg)
        raise Exception(timeout_msg)
    except Exception as e:
        db.rollback()
        logger.error(f"Compilation failure: {str(e)}", exc_info=True)
        safe_update_progress(task_ref, "FAILURE", 100, "Compilation failed.", error=str(e))
        raise e
    finally:
        db.close()


def render_cybersecurity_checklist_table(controls_list: List[CybersecurityControl], is_proposed: bool = False) -> str:
    standard_domains = [
        "PHYSICAL SECURITY",
        "PERIMETER SECURITY",
        "NETWORK SECURITY",
        "ENDPOINT SECURITY",
        "DATA SECURITY",
        "APPLICATION SECURITY",
        "OTHER MEASURES"
    ]

    active_controls = [c for c in controls_list if c.is_proposed == is_proposed]
    
    seen_domains = set()
    ordered_domains = []
    for d in standard_domains:
        seen_domains.add(d.upper())
        ordered_domains.append(d.upper())
    for c in active_controls:
        domain_norm = (c.control_domain or "OTHER MEASURES").strip().upper()
        if domain_norm not in seen_domains:
            seen_domains.add(domain_norm)
            ordered_domains.append(domain_norm)

    rows_html = ""
    for domain in ordered_domains:
        seen_names = set()
        domain_controls = []
        for c in active_controls:
            if (c.control_domain or "").strip().upper() == domain:
                c_norm = (c.control_name or "").strip().lower()
                if c_norm not in seen_names:
                    seen_names.add(c_norm)
                    domain_controls.append(c)
        
        mandatory = [c for c in domain_controls if c.is_mandatory]
        optional = [c for c in domain_controls if not c.is_mandatory]

        mand_html = "".join(
            f'<div style="margin: 1.5px 0;">{"[X]" if c.is_implemented else "[ ]"} {c.control_name}</div>'
            for c in mandatory
        ) if mandatory else '<span style="color:#94a3b8; font-style:italic;">No mandatory controls configured</span>'

        opt_html = "".join(
            f'<div style="margin: 1.5px 0;">{"[X]" if c.is_implemented else "[ ]"} {c.control_name}</div>'
            for c in optional
        ) if optional else '<span style="color:#94a3b8; font-style:italic;">None specified</span>'

        rows_html += f"""
        <tr>
            <td class="bold" style="width: 25%; background:#f8fafc; vertical-align: top;">{domain}</td>
            <td style="width: 45%; vertical-align: top;">{mand_html}</td>
            <td style="width: 30%; vertical-align: top;">{opt_html}</td>
        </tr>
        """

    return f"""
    <table class="data-table" style="width: 100%; border-collapse: collapse; margin-top: 4px; margin-bottom: 8px;">
        <thead>
            <tr style="background:#f1f5f9;">
                <th style="width: 25%; text-align: left; padding: 4px 6px; border: 1px solid #334155;">Security Domain</th>
                <th style="width: 45%; text-align: left; padding: 4px 6px; border: 1px solid #334155;">MANDATORY</th>
                <th style="width: 30%; text-align: left; padding: 4px 6px; border: 1px solid #334155;">OPTIONAL</th>
            </tr>
        </thead>
        <tbody>
            {rows_html}
        </tbody>
    </table>
    """


def render_information_system_full_spec(
    s: InformationSystem, 
    is_proposed: bool = False, 
    narrative: MasterNarrative = None,
    projects: List[IctProject] = None
) -> str:
    classification_str = str(getattr(s.classification, "value", s.classification or "")).lower()

    is_support = bool(getattr(s, "is_support_to_operations", False)) or ("support" in classification_str)
    is_admin = bool(getattr(s, "is_general_administrative", False)) or ("administrative" in classification_str or "admin" in classification_str)
    is_operations = bool(getattr(s, "is_operations", False)) or ("operations" in classification_str or (not is_support and not is_admin))
    is_ops = is_operations

    is_frontline = bool(getattr(s, "is_frontline_service", False)) or ("frontline" in classification_str and "non-frontline" not in classification_str)
    is_non_frontline = bool(getattr(s, "is_non_frontline_service", False)) or ("non-frontline" in classification_str)

    hosting_str = getattr(s, "frontline_hosting_type", None) or getattr(s, "hosting_type", "Online")
    if hasattr(hosting_str, "value"):
        hosting_str = hosting_str.value
    hosting_str = str(hosting_str or "Online")

    status_label = getattr(s.status, "value", str(s.status or "Operational"))
    enhancement_details = getattr(s, "enhancement_details", None)
    pia_target_date = getattr(s, "pia_target_date_text", None)
    proposed_cost = getattr(s, "proposed_cost", None)

    linked_proj_title = None
    if getattr(s, "project_parent", None) and s.project_parent.project_title:
        linked_proj_title = s.project_parent.project_title
    elif getattr(s, "project_id", None) and projects:
        p_obj = next((p for p in projects if str(p.id) == str(s.project_id)), None)
        if p_obj:
            linked_proj_title = p_obj.project_title
    elif getattr(s, "projects", None) and len(s.projects) > 0:
        linked_proj_title = s.projects[0].project_title

    if is_operations or is_ops:
        frontline_details = ""
        if is_frontline:
            frontline_details = f"""
            <div style="margin-left: 14px; margin-top: 2px;">
                Identify if: &nbsp;
                {'[X]' if hosting_str == 'Online' else '[ ]'} Online &nbsp;
                {'[X]' if hosting_str == 'On-premise' else '[ ]'} On-premise &nbsp;
                {'[X]' if hosting_str == 'Hybrid' else '[ ]'} Hybrid
                {f'<span style="font-family:monospace; margin-left:6px;">(Provide link: {s.online_url})</span>' if s.online_url else ''}
            </div>
            """

        operations_details = f"""
        <div style="margin-left: 14px; margin-top: 2px;">
            <div>{'[X]' if is_frontline else '[ ]'} Frontline Service (directly used for public/client service delivery)</div>
            {frontline_details}
            <div>{'[X]' if is_non_frontline else '[ ]'} Non-Frontline Service (supports core mandate but not directly used by clients/public)</div>
        </div>
        """
    else:
        operations_details = """
        <div style="margin-left: 14px; margin-top: 2px; color: #64748b;">
            <div>[ ] Frontline Service (directly used for public/client service delivery)</div>
            <div>[ ] Non-Frontline Service (supports core mandate but not directly used by clients/public)</div>
        </div>
        """

    pia_answered_yes = bool(s.has_undergone_pia)
    pia_target_text = f"No, Not Conducted (Target: {pia_target_date})" if (not pia_answered_yes and pia_target_date) else ("Yes" if pia_answered_yes else "No")

    proposed_cost_row = f'<tr><td class="bold">ESTIMATED PROPOSED COST</td><td class="font-mono bold" style="color:#047857;">{fmt_currency(proposed_cost or 0)}</td></tr>' if is_proposed else ''
    linked_project_row = f'<tr><td class="bold">LINKED ICT PROJECT (PART III.E)</td><td class="bold" style="color:#1e3a8a;">{linked_proj_title}</td></tr>' if (is_proposed and linked_proj_title) else ''

    return f"""
    <table class="system-spec-table">
        <tr class="band-band">
            <td colspan="2" style="font-size: 8.5pt; padding: 4px 6px;">INFORMATION SYSTEM NAME: &nbsp; <strong>{s.name}</strong></td>
        </tr>
        <tr>
            <td style="width: 25%;" class="bold">CLASSIFICATION</td>
            <td>
                <div>{'[X]' if is_support else '[ ]'} Support to Operations</div>
                <div>{'[X]' if is_admin else '[ ]'} General Administrative Systems</div>
                <div>{'[X]' if is_operations or is_ops else '[ ]'} Operations</div>
                {operations_details}
            </td>
        </tr>
        <tr>
            <td class="bold">DESCRIPTION &amp; PURPOSE</td>
            <td style="text-align: justify;">{s.description_and_purpose}</td>
        </tr>
        {f'<tr><td class="bold">STATUS</td><td class="bold" style="color:#1d4ed8;">{status_label}</td></tr>' if is_proposed else ''}
        {proposed_cost_row}
        {linked_project_row}
        {f'<tr><td class="bold">ENHANCEMENT DETAILS</td><td style="text-align: justify;">{enhancement_details}</td></tr>' if (is_proposed and 'enhancement' in status_label.lower() and enhancement_details) else ''}
        <tr>
            <td class="bold">DEVELOPMENT STRATEGY</td>
            <td>{getattr(s.development_strategy, 'value', str(s.development_strategy))}</td>
        </tr>
        <tr>
            <td class="bold">DEVELOPMENT PLATFORM</td>
            <td>{s.development_platform}</td>
        </tr>
        <tr>
            <td class="bold">DATABASE NAME</td>
            <td class="font-mono">{s.database_name}</td>
        </tr>
        <tr>
            <td class="bold">DATA STORAGE</td>
            <td>{s.data_storage_type}</td>
        </tr>
        <tr>
            <td class="bold">INTERNAL USERS</td>
            <td>{s.internal_users}</td>
        </tr>
        <tr>
            <td class="bold">EXTERNAL USERS</td>
            <td>{s.external_users}</td>
        </tr>
        <tr>
            <td class="bold">OWNER</td>
            <td>{s.system_owner_office}</td>
        </tr>
        <tr>
            <td class="bold">INTEROPERABILITY</td>
            <td>
                <div>{'[X]' if s.is_integrated_with_others else '[ ]'} Integrated with another system</div>
                {f'<div style="margin-left:14px; font-size:7.5pt; color:#334155;">Internal System: <strong>{s.internal_integrated_systems or "None"}</strong><br/>External System: <strong>{s.external_integrated_systems or "None"}</strong></div>' if s.is_integrated_with_others else ''}
                <div style="margin-left: 10px; margin-top: 2px;">
                    {'[X]' if s.generates_data_for_others else '[ ]'} Generates data that is utilized by other system<br/>
                    {'[X]' if s.processes_data_from_others else '[ ]'} Processes data generated from other system
                </div>
                <div style="margin-top: 2px;">
                    {'[X]' if s.is_deployed_on_shared_platform else '[ ]'} Deployed on a shared platform
                </div>
            </td>
        </tr>
        <tr>
            <td class="bold">PRIVACY IMPACT ASSESSMENT (PIA)</td>
            <td>
                Is the system processing personal information?<br/>
                &nbsp;&nbsp;{'[X] Yes' if s.processes_personal_information else '[ ] Yes'}&nbsp;&nbsp;&nbsp;&nbsp;
                {'[ ] No' if s.processes_personal_information else '[X] No'}<br/>
                If Yes, did the system undergo PIA?<br/>
                &nbsp;&nbsp;{'[X] Yes' if pia_answered_yes else '[ ] Yes'}&nbsp;&nbsp;&nbsp;&nbsp;
                {'[X] ' + pia_target_text if not pia_answered_yes else '[ ] No'}
            </td>
        </tr>
    </table>
    """


def generate_complete_issp_html(
    db: Any,
    narrative: MasterNarrative,
    outcomes: List[OrganizationalOutcome],
    concerns: List[StrategicConcern],
    systems: List[InformationSystem],
    projects: List[IctProject],
    performance_metrics: List[PerformanceMetric],
    items: List[Proposal],
    inventory: List[ExistingInventory],
    human_capitals: List[HumanCapital],
    staff_positions: List[IctStaffPosition],
    stakeholders: List[StakeholderAnalysis],
    egov_checklists: List[EGovernmentChecklist],
    glossary: List[GlossaryTerm],
    network_infra: List[NetworkInfrastructure],
    cyber_controls: List[CybersecurityControl],
    dr_teams: List[DisasterRecoveryTeam],
    dr_bias: List[BusinessImpactAnalysis],
    dr_metrics: List[DRBCPMetric],
    parity_data: Dict[str, Any]
) -> str:
    # Dynamically extract planning cycle span from narrative
    start_year = getattr(narrative, "issp_period_from", None)
    end_year = getattr(narrative, "issp_period_to", None)
    
    if start_year is None or end_year is None:
        period_str = str(getattr(narrative, "issp_period", "") or "").strip()
        if "-" in period_str:
            try:
                parts = period_str.split("-")
                start_year = int(parts[0].strip())
                end_year = int(parts[1].strip())
            except Exception:
                start_year, end_year = 2026, 2028
        else:
            try:
                start_year = int(period_str)
                end_year = start_year
            except Exception:
                start_year, end_year = 2026, 2028

    if start_year > end_year:
        start_year, end_year = end_year, start_year

    years_range = list(range(start_year, end_year + 1))
    year_headers = [f"FY {y}" for y in years_range]
    plan_years_label = f"{start_year} - {end_year}" if start_year != end_year else f"{start_year}"

    agency_logo = resolve_local_img_path(narrative.agency_logo_url) or ""
    running_header_logo = agency_logo

    agency_name_clean = clean_text(narrative.agency_name, getattr(settings, "DEFAULT_AGENCY_NAME", "National Government Agency"))
    default_web = getattr(settings, "DEFAULT_AGENCY_WEBSITE", "https://agency.gov.ph")
    agency_website_clean = clean_text(narrative.agency_website_url, default_web).replace("https://", "").replace("http://", "").rstrip("/")
    agency_address = clean_text(getattr(narrative, "agency_address", None), "")

    standalone_metrics = [m for m in performance_metrics if not m.project_id]

    agency_header_name = agency_name_clean.upper()

    # Dynamic Signatory Names without hardcoded placeholders
    cio_display_name = clean_text(
        getattr(narrative, 'signatory_prepared_by', None) or getattr(narrative, 'cio_name', None), 
        "CHIEF INFORMATION OFFICER"
    ).upper()

    head_display_name = clean_text(
        getattr(narrative, 'signatory_approved_by', None) or getattr(narrative, 'head_of_agency_name', None), 
        clean_text(getattr(narrative, 'agency_head_position', None), getattr(settings, "DEFAULT_AGENCY_HEAD_TITLE", "HEAD OF AGENCY"))
    ).upper()

    head_title = clean_text(getattr(narrative, 'agency_head_position', None), getattr(settings, "DEFAULT_AGENCY_HEAD_TITLE", "Head of Agency"))

    # Robust running header logo css to prevent gap or missing layout
    if running_header_logo:
        logo_css = f'background-image: url("{running_header_logo}"); background-size: 26px 26px; background-repeat: no-repeat; background-position: left center; padding-left: 32px;'
    else:
        logo_css = 'padding-left: 0;'

    # Shared running header block starting from Table of Contents through to end of document
    shared_running_header = f"""
        @top-left {{
            content: "{agency_header_name}";
            font-family: "Palatino Linotype", "Book Antiqua", Palatino, serif;
            font-size: 8.5pt;
            font-weight: bold;
            color: #0f172a;
            white-space: nowrap;
            text-align: left;
            vertical-align: middle;
            {logo_css}
            padding-bottom: 4px;
            border-bottom: 1.5px solid #cbd5e1;
            height: 32px;
        }}
        @top-center {{
            content: "";
            vertical-align: middle;
            padding-bottom: 4px;
            border-bottom: 1.5px solid #cbd5e1;
            height: 32px;
        }}
        @top-right {{
            content: "INFORMATION SYSTEMS STRATEGIC PLAN {plan_years_label}";
            font-family: "Palatino Linotype", "Book Antiqua", Palatino, serif;
            font-size: 8.5pt;
            font-weight: bold;
            color: #0f172a;
            text-align: right;
            vertical-align: middle;
            white-space: nowrap;
            padding-bottom: 4px;
            border-bottom: 1.5px solid #cbd5e1;
            height: 32px;
        }}
    """

    css = f"""
    <style>
        @page {{
            size: A4 landscape;
            margin: 1.2in 1.0in 1.0in 1.0in;
            {shared_running_header}
            @bottom-left {{
                content: "OFFICIAL GOVERNMENT DOCUMENT — DICT ISSP v.2026 STANDARD";
                font-family: "Palatino Linotype", "Book Antiqua", Palatino, serif;
                font-size: 7.5pt;
                color: #94a3b8;
                vertical-align: middle;
            }}
            @bottom-right {{
                content: "Page " counter(page);
                font-family: "Palatino Linotype", "Book Antiqua", Palatino, serif;
                font-size: 8pt;
                color: #64748b;
                vertical-align: middle;
            }}
        }}

        /* STRICT FIRST-PAGE COVER ISOLATION: NO HEADERS OR FOOTERS ON COVER PAGE */
        @page:first {{
            size: A4 landscape;
            margin: 0.85in 0.9in 0.85in 0.9in;
            @top-left {{ content: none !important; border: none !important; }}
            @top-center {{ content: none !important; border: none !important; }}
            @top-right {{ content: none !important; border: none !important; }}
            @bottom-left {{ content: none !important; border: none !important; }}
            @bottom-center {{ content: none !important; border: none !important; }}
            @bottom-right {{ content: none !important; border: none !important; }}
        }}

        @page cover_layout {{
            size: A4 landscape;
            margin: 0.85in 0.9in 0.85in 0.9in;
            @top-left {{ content: none !important; border: none !important; }}
            @top-center {{ content: none !important; border: none !important; }}
            @top-right {{ content: none !important; border: none !important; }}
            @bottom-left {{ content: none !important; border: none !important; }}
            @bottom-center {{ content: none !important; border: none !important; }}
            @bottom-right {{ content: none !important; border: none !important; }}
        }}

        /* HEADERS START CONTINUOUSLY ON TABLE OF CONTENTS */
        @page toc_layout {{
            size: A4 landscape;
            margin: 1.2in 1.0in 1.0in 1.0in;
            {shared_running_header}
            @bottom-left {{
                content: "OFFICIAL GOVERNMENT DOCUMENT — DICT ISSP v.2026 STANDARD";
                font-family: "Palatino Linotype", "Book Antiqua", Palatino, serif;
                font-size: 7.5pt;
                color: #94a3b8;
                vertical-align: middle;
            }}
            @bottom-right {{
                content: "Page " counter(page, lower-roman);
                font-family: "Palatino Linotype", "Book Antiqua", Palatino, serif;
                font-size: 8pt;
                color: #64748b;
                vertical-align: middle;
            }}
        }}

        .page-cover {{
            page: cover_layout;
            break-after: page;
        }}

        .page-toc {{
            page: toc_layout;
            break-before: page;
            break-after: page;
        }}

        .page-defs {{
            page: toc_layout;
            break-before: page;
            break-after: page;
        }}

        @page part1_start {{
            size: A4 landscape;
            margin: 1.2in 1.0in 1.0in 1.0in;
            counter-reset: page 1;
            {shared_running_header}
            @bottom-left {{
                content: "OFFICIAL GOVERNMENT DOCUMENT — DICT ISSP v.2026 STANDARD";
                font-family: "Palatino Linotype", "Book Antiqua", Palatino, serif;
                font-size: 7.5pt;
                color: #94a3b8;
                vertical-align: middle;
            }}
            @bottom-right {{
                content: "Page " counter(page);
                font-family: "Palatino Linotype", "Book Antiqua", Palatino, serif;
                font-size: 8pt;
                color: #64748b;
                vertical-align: middle;
            }}
        }}

        .page-body-start {{
            page: part1_start;
            break-before: page;
        }}

        .page-break {{
            break-before: page;
        }}

        .full-page-schematic {{
            break-before: page;
            break-inside: avoid;
            text-align: center;
            width: 100%;
            display: block;
            margin: 0 auto;
            box-sizing: border-box;
        }}

        .schematic-img {{
            max-height: 480px;
            max-width: 95%;
            height: auto;
            border: 1px solid #cbd5e1;
            margin: 6px auto;
            display: block;
        }}

        .schematic-placeholder-box {{
            width: 95%;
            height: 380px;
            margin: 10px auto;
            border: 2px dashed #94a3b8;
            border-radius: 6px;
            background: #f8fafc;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            text-align: center;
            padding: 20px;
            box-sizing: border-box;
        }}

        h1, h2, h3, h4, .section-header, .sub-header {{
            break-after: avoid;
            page-break-after: avoid;
        }}

        body {{
            font-family: "Palatino Linotype", "Book Antiqua", Palatino, serif;
            font-size: 9pt;
            line-height: 1.35;
            color: #0f172a;
        }}

        table {{
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 8px;
            break-inside: auto;
        }}

        thead {{
            display: table-header-group;
        }}

        tr {{
            break-inside: avoid;
            page-break-inside: avoid;
        }}

        th, td {{
            border: 1px solid #334155;
            padding: 3.5px 5px;
            font-size: 7.5pt;
            vertical-align: top;
        }}

        th {{
            background-color: #f1f5f9;
            font-weight: bold;
            text-transform: uppercase;
        }}

        ul {{
            list-style-type: disc !important;
            margin: 3px 0 6px 18px !important;
            padding-left: 0 !important;
        }}

        ul > li {{
            margin-bottom: 2.5px !important;
            line-height: 1.35 !important;
            break-inside: avoid;
        }}

        .section-header {{
            font-size: 11pt;
            font-weight: bold;
            color: #1e3a8a;
            border-bottom: 2px solid #1e3a8a;
            padding-bottom: 2.5px;
            margin-bottom: 5px;
            text-transform: uppercase;
        }}

        .sub-header {{
            font-size: 8.5pt;
            font-weight: bold;
            color: #1e3a8a;
            margin-top: 5px;
            margin-bottom: 2.5px;
            text-transform: uppercase;
        }}

        .band-band {{ background-color: #e2e8f0; font-weight: bold; text-transform: uppercase; break-after: avoid; }}
        .band-sub {{ background-color: #f8fafc; font-style: italic; break-after: avoid; }}
        .right {{ text-align: right; }}
        .center {{ text-align: center; }}
        .bold {{ font-weight: bold; }}
        .font-mono {{ font-family: monospace; }}

        .toc-table {{
            width: 100%;
            border-collapse: collapse;
            border: none;
            margin-bottom: 0;
        }}
        .toc-table tr {{
            border: none;
            break-inside: avoid;
        }}
        .toc-table td {{
            border: none;
            padding: 1.5px 0;
            font-size: 8pt;
            vertical-align: bottom;
            line-height: 1.25;
        }}
        .toc-title {{
            width: 92%;
        }}
        .toc-title a {{
            text-decoration: none;
            color: #0f172a;
        }}
        .toc-page {{
            width: 8%;
            text-align: right;
            font-family: monospace;
            font-weight: bold;
            white-space: nowrap;
        }}
        .toc-page a {{
            text-decoration: none;
            color: #1e3a8a;
        }}
        .toc-page a::after {{
            content: target-counter(attr(href, url), page);
        }}

        .system-spec-table {{
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 8px;
            break-inside: avoid;
        }}
        .system-spec-table td {{
            padding: 2.5px 4.5px !important;
            font-size: 7.5pt !important;
            line-height: 1.18 !important;
        }}

        .part4a-table {{
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 4px;
            break-inside: auto;
        }}
        .part4a-table th, .part4a-table td {{
            padding: 2.5px 4px !important;
            font-size: 7pt !important;
            line-height: 1.15 !important;
        }}

        .annex1-table {{
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 0;
            break-inside: auto;
        }}
        .annex1-table th, .annex1-table td {{
            padding: 2px 4px !important;
            font-size: 7pt !important;
            line-height: 1.1 !important;
        }}
    </style>
    """

    # --- COVER PAGE ---
    raw_scope = str(getattr(narrative.scope_choice, "value", narrative.scope_choice or "")).strip().lower()
    scope_json = narrative.scope_json or {}
    has_reg = bool(scope_json.get("with_regional_offices"))
    has_bur = bool(scope_json.get("with_bureaus"))
    is_amend = bool(getattr(narrative, "is_amendment", False))
    amend_num = getattr(narrative, "amendment_number", "1st") or "1st"

    is_dept_wide = "department" in raw_scope or not raw_scope
    is_dept_co = ("central office" in raw_scope or "head office" in raw_scope) and not is_dept_wide
    is_dept_co_only = is_dept_co and not has_reg and not has_bur
    is_agency_wide = "agency" in raw_scope
    is_agency_co_only = is_agency_wide and not has_reg
    is_other_gov = "other" in raw_scope
    is_lgu = "lgu" in raw_scope

    address_display = agency_address if agency_address else ""

    cover_html = f"""
    <div class="page-cover">
        <div style="text-align: center; margin-bottom: 20px;">
            {f'<img src="{running_header_logo}" style="height: 135px; width: 135px; object-fit: contain; margin: 0 auto 10px auto; display: block;" />' if running_header_logo else ''}
            <p style="font-size: 9.5pt; text-transform: uppercase; letter-spacing: 1.2px; margin: 0; color: #475569; line-height: 1.4; font-family: sans-serif;">
                Republic of the Philippines<br/>
                <strong style="color: #0f172a; font-size: 14pt; font-family: 'Palatino Linotype', serif;">{agency_name_clean.upper()}</strong><br/>
                {f'<span style="font-size: 9pt; color: #64748b;">{address_display}</span>' if address_display else ''}
            </p>
        </div>

        <div style="text-align: center; margin: 16px 0 14px 0;">
            <h1 style="font-size: 20pt; font-weight: bold; color: #0f172a; margin: 4px 0; letter-spacing: 0.5px;">
                INFORMATION SYSTEMS STRATEGIC PLAN (ISSP)
            </h1>
            <div style="font-size: 9.5pt; font-weight: bold; margin: 6px 0; color: #334155; font-family: sans-serif;">
                {'[X]' if not is_amend else '[ ]'} REGULAR ISSP &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
                {'[X]' if is_amend else '[ ]'} AMENDMENT &lt;{amend_num}&gt;
            </div>
            <p style="font-size: 11pt; font-weight: bold; color: #1e3a8a; margin: 4px 0;">
                For the period {start_year} to {end_year}
            </p>
            <h2 style="font-size: 12.5pt; font-weight: bold; text-transform: uppercase; margin: 4px 0; color: #0f172a;">
                {agency_name_clean}
            </h2>
            <p style="font-size: 8.5pt; color: #64748b; font-family: monospace; margin: 0;">
                {agency_website_clean}
            </p>
        </div>

        <table style="width: 100%; border: none; margin-top: 24px; border-collapse: collapse;">
            <tr>
                <td style="width: 52%; border: none; vertical-align: top; padding-right: 28px;">
                    <div style="margin-bottom: 32px;">
                        <strong style="text-transform: uppercase; font-size: 9pt; display: block; color: #0f172a; font-family: sans-serif;">
                            PREPARED BY:
                        </strong>
                        <div style="width: 88%; margin-left: auto; text-align: center; margin-top: 32px;">
                            <strong style="font-size: 10.5pt; display: block; text-transform: uppercase; padding-bottom: 2px;">
                                {cio_display_name}
                            </strong>
                            <div style="border-top: 1.5px solid #0f172a; padding-top: 3px;">
                                <span style="font-size: 8pt; color: #475569;">Name &amp; Signature of Chief Information Officer</span>
                            </div>
                        </div>
                    </div>

                    <div>
                        <strong style="text-transform: uppercase; font-size: 9pt; display: block; color: #0f172a; font-family: sans-serif;">
                            APPROVED BY:
                        </strong>
                        <div style="width: 88%; margin-left: auto; text-align: center; margin-top: 32px;">
                            <strong style="font-size: 10.5pt; display: block; text-transform: uppercase; padding-bottom: 2px;">
                                {head_display_name}
                            </strong>
                            <div style="border-top: 1.5px solid #0f172a; padding-top: 3px;">
                                <span style="font-size: 8pt; color: #475569;">Name &amp; Signature of Agency Head</span>
                                <span style="font-size: 7.5pt; color: #64748b; display: block;">({head_title})</span>
                            </div>
                        </div>
                    </div>
                </td>

                <td style="width: 48%; border: none; vertical-align: top;">
                    <div style="background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; padding: 12px 14px; font-size: 8pt; line-height: 1.6; font-family: sans-serif;">
                        <strong style="color: #1e3a8a; text-transform: uppercase; display: block; margin-bottom: 4px; border-bottom: 1px solid #e2e8f0; padding-bottom: 2px;">
                            Scope
                        </strong>
                        <div>{'[X]' if is_dept_wide else '[ ]'} Department-Wide</div>
                        <div style="margin-left: 14px;">{'[X]' if is_dept_co and not is_dept_wide else '[ ]'} Department - Central Office / Head Office</div>
                        <div style="margin-left: 28px;">{'[X]' if is_dept_co_only else '[ ]'} Central Office only</div>
                        <div style="margin-left: 28px;">{'[X]' if (is_dept_co and has_reg and not is_dept_wide) else '[ ]'} With Regional Offices / Field Offices &nbsp;&nbsp; {'[X]' if (is_dept_co and has_bur and not is_dept_wide) else '[ ]'} With Bureaus</div>
                        <div>{'[X]' if is_agency_wide else '[ ]'} Agency-Wide</div>
                        <div style="margin-left: 28px;">{'[X]' if is_agency_co_only else '[ ]'} Central Office only</div>
                        <div style="margin-left: 28px;">{'[X]' if (is_agency_wide and has_reg) else '[ ]'} With Regional Offices / Field Offices</div>
                        <div style="margin-left: 28px;">{'[X]' if is_other_gov else '[ ]'} Other Government Entity</div>
                        <div>{'[X]' if is_lgu else '[ ]'} LGU</div>
                    </div>
                </td>
            </tr>
        </table>
    </div>
    """

    # --- 2. TABLE OF CONTENTS ---
    def make_toc_row(href: str, title: str, indent: int = 0, is_bold: bool = False) -> str:
        pad = f"padding-left: {indent * 14}px;" if indent > 0 else ""
        weight = "font-weight: bold; color: #1e3a8a;" if is_bold else "color: #0f172a;"
        return f"""
        <tr>
            <td class="toc-title" style="{pad}"><a href="{href}" style="{weight}">{title}</a></td>
            <td class="toc-page"><a href="{href}"></a></td>
        </tr>
        """

    part4a_toc_rows = "".join(
        make_toc_row(f"#sec-part4-a{idx+1}", f"A.{idx+1}. [YEAR #{idx+1}] (FY {yr})", indent=2)
        for idx, yr in enumerate(years_range)
    )

    toc_html = f"""
    <div class="page-toc" id="sec-toc">
        <div class="section-header">TABLE OF CONTENTS</div>
        <table class="toc-table">
            <tbody>
                {make_toc_row("#sec-defs", "DEFINITION OF TERMS", indent=0, is_bold=True)}
                {make_toc_row("#sec-part1", "PART I. AGENCY PROFILE & STRATEGIC CONTEXT", indent=0, is_bold=True)}
                {make_toc_row("#sec-part1-a", "A. MANDATE, VISION, MISSION, AND ORGANIZATIONAL OUTCOME", indent=1)}
                {make_toc_row("#sec-part1-a1", "A.1. MANDATE", indent=2)}
                {make_toc_row("#sec-part1-a2", "A.2. VISION STATEMENT", indent=2)}
                {make_toc_row("#sec-part1-a3", "A.3. MISSION STATEMENT", indent=2)}
                {make_toc_row("#sec-part1-a4", "A.4. ORGANIZATIONAL OUTCOME", indent=2)}
                {make_toc_row("#sec-part1-b", "B. ORGANIZATIONAL STRUCTURE", indent=1)}
                {make_toc_row("#sec-part1-b1", "B.1. CHIEF INFORMATION OFFICER (CIO)", indent=2)}
                {make_toc_row("#sec-part1-b2", "B.2. HUMAN CAPITAL", indent=2)}
                {make_toc_row("#sec-part1-c", "C. STAKEHOLDER ANALYSIS", indent=1)}
                {make_toc_row("#sec-part2", "PART II. CURRENT ICT ASSESSMENT", indent=0, is_bold=True)}
                {make_toc_row("#sec-part2-a", "A. STRATEGIC CONCERNS FOR ICT USE", indent=1)}
                {make_toc_row("#sec-part2-b", "B. EXISTING NETWORK INFRASTRUCTURE", indent=1)}
                {make_toc_row("#sec-part2-b1", "B1. LAN/WAN SET-UP INCLUDING CONNECTIVITY TYPE AND BANDWIDTH", indent=2)}
                {make_toc_row("#sec-part2-b2", "B2. CYBERSECURITY CONTROL CHECKLIST", indent=2)}
                {make_toc_row("#sec-part2-c", "C. EXISTING/OPERATIONAL INFORMATION SYSTEMS (IS) INVENTORY", indent=1)}
                {make_toc_row("#sec-part2-d", "D. E-GOVERNMENT PROGRAMS (EGP) CHECKLIST", indent=1)}
                {make_toc_row("#sec-part3", "PART III. PROPOSED ICT STRATEGY", indent=0, is_bold=True)}
                {make_toc_row("#sec-part3-a", "A. PROPOSED NETWORK INFRASTRUCTURE", indent=1)}
                {make_toc_row("#sec-part3-a1", "A.1. LAN/WAN SET-UP INCLUDING CONNECTIVITY TYPE AND BANDWIDTH", indent=2)}
                {make_toc_row("#sec-part3-a2", "A.2. CYBERSECURITY CONTROL CHECKLIST", indent=2)}
                {make_toc_row("#sec-part3-b", "B. ENTERPRISE ARCHITECTURE", indent=1)}
                {make_toc_row("#sec-part3-c", "C. PROPOSED ICT HUMAN CAPITAL", indent=1)}
                {make_toc_row("#sec-part3-d", "D. PROPOSED INFORMATION SYSTEMS", indent=1)}
                {make_toc_row("#sec-part3-e", "E. ICT PROJECTS", indent=1, is_bold=True)}
                {make_toc_row("#sec-part3-e1", "E.1. INTERNAL ICT PROJECTS", indent=2)}
                {make_toc_row("#sec-part3-e2", "E.2. CROSS-AGENCY ICT PROJECTS", indent=2)}
                {make_toc_row("#sec-part3-f", "F. PERFORMANCE MEASUREMENT FRAMEWORK", indent=1, is_bold=True)}
                {make_toc_row("#sec-part3-f1", "F.1. INTERNAL ICT PROJECTS", indent=2)}
                {make_toc_row("#sec-part3-f2", "F.2. CROSS-AGENCY ICT PROJECTS", indent=2)}
                {make_toc_row("#sec-part3-f3", "F.3. INSTITUTIONAL & AGENCY-WIDE ICT GOVERNANCE KPIS", indent=2) if standalone_metrics else ""}
                {make_toc_row("#sec-part4", "PART IV. RESOURCE REQUIREMENTS", indent=0, is_bold=True)}
                {make_toc_row("#sec-part4-a", "A. DETAILED RESOURCE DEPLOYMENT AND COST BREAKDOWN", indent=1)}
                {part4a_toc_rows}
                {make_toc_row("#sec-part4-b", "B. SUMMARY OF INVESTMENTS", indent=1)}
                {make_toc_row("#sec-part4-b1", "B.1. GENERAL SUMMARY", indent=2)}
                {make_toc_row("#sec-part4-b2", "B.2. FUND SOURCE", indent=2)}
                {make_toc_row("#sec-part4-b3", "B.3. STATEMENT OF EXPENDITURE", indent=2)}
                {make_toc_row("#sec-part4-b4", "B.4. OBJECT OF EXPENDITURE", indent=2)}
                {make_toc_row("#sec-annex1", "ANNEX 1: EXISTING INFORMATION & COMMUNICATIONS TECHNOLOGY (ICT) ASSET INVENTORY", indent=0, is_bold=True)}
                {make_toc_row("#sec-annex2", "ANNEX 2: DISASTER RECOVERY AND BUSINESS CONTINUITY PLAN (DRBCP) FOR ICT RESOURCES", indent=0, is_bold=True)}
            </tbody>
        </table>
    </div>
    """

    # --- 3. DEFINITION OF TERMS ---
    seen_glossary = set()
    filtered_glossary = []
    for g in glossary:
        t_clean = g.term.strip()
        t_lower = t_clean.lower()
        if t_lower not in seen_glossary:
            seen_glossary.add(t_lower)
            filtered_glossary.append(g)

    defs_rows = "".join(f"""
        <tr>
            <td class="bold" style="width: 25%;">{g.term}</td>
            <td style="text-align: justify;">{g.definition}</td>
        </tr>
    """ for g in filtered_glossary)
    
    defs_html = f"""
    <div class="page-defs" id="sec-defs">
        <div class="section-header">DEFINITION OF TERMS</div>
        <table>
            <thead><tr><th style="width:25%;">Terms</th><th>Definition</th></tr></thead>
            <tbody>{defs_rows or '<tr><td colspan="2" class="center">No glossary entries registered.</td></tr>'}</tbody>
        </table>
    </div>
    """

    # --- 4. PART I: AGENCY PROFILE & STRATEGIC CONTEXT ---
    mandate_clean = clean_text(getattr(narrative, 'mandate_text', None) or getattr(narrative, 'mandate_html', None), "Statutory legal basis establishing mandate, administrative leadership, and public service functions.")
    functions_clean = clean_text(narrative.functions, "Deliver efficient public services, execute regulatory and policy duties, and advance institutional digital transformation.")
    vision_clean = clean_text(getattr(narrative, 'vision_text', None) or getattr(narrative, 'vision_html', None), "A premier institution delivering responsive public service, digital innovation, and excellence.")
    mission_clean = clean_text(getattr(narrative, 'mission_text', None) or getattr(narrative, 'mission_html', None), "To provide accountable, citizen-centric, and accessible digital governance through strategic technological modernization.")

    clean_domain = agency_website_clean.split('/')[0] if agency_website_clean else "agency.gov.ph"
    cio_pos = clean_text(getattr(narrative, 'cio_plantilla_position', None) or getattr(narrative, 'preparer_position', ''), "Director, ICT Management Office")
    cio_unit = clean_text(narrative.cio_organizational_unit, "Management Information & Communications Technology Services")
    cio_email = clean_text(narrative.preparer_email, f"cio@{clean_domain}")
    cio_phone = clean_text(narrative.preparer_tel, "N/A")

    focal_name = clean_text(narrative.focal_name, "")
    focal_pos = clean_text(narrative.focal_position, "Head, Systems and Infrastructure Administration")
    focal_unit = clean_text(narrative.focal_organizational_unit, "ICT Management Service")
    focal_email = clean_text(narrative.focal_email, f"focal@{clean_domain}")
    focal_phone = clean_text(narrative.focal_contact_no, "N/A")

    hc_current = [h for h in human_capitals if not h.is_proposed]
    hc_total_it = sum(h.it_positions_count for h in hc_current)
    hc_total_non_it = sum(h.non_it_positions_count for h in hc_current)
    hc_total_male = sum(h.male_count for h in hc_current)
    hc_total_female = sum(h.female_count for h in hc_current)

    hc_rows = "".join(f"""
        <tr>
            <td class="bold">{h.employment_status}</td>
            <td class="center font-mono">{h.it_positions_count}</td>
            <td class="center font-mono">{h.non_it_positions_count}</td>
            <td class="center font-mono">{'N/A' if 'unfilled' in h.employment_status.lower() else h.male_count}</td>
            <td class="center font-mono">{'N/A' if 'unfilled' in h.employment_status.lower() else h.female_count}</td>
        </tr>
    """ for h in hc_current)

    stakeholders_rows = "".join(f"""
        <tr>
            <td rowspan="2" class="bold" style="vertical-align: middle; width: 26%;">{s.stakeholder_group}</td>
            <td style="width: 52%;"><strong>INCOMING:</strong> {s.transaction_processed_incoming or 'N/A'}</td>
            <td class="center font-bold" style="width: 22%;">{getattr(s, 'complexity_incoming', getattr(s, 'incoming_complexity', 'Simple'))}</td>
        </tr>
        <tr>
            <td><strong>OUTGOING:</strong> {s.transaction_processed_outgoing or 'N/A'}</td>
            <td class="center font-bold">{getattr(s, 'complexity_outgoing', getattr(s, 'outgoing_complexity', 'Simple'))}</td>
        </tr>
    """ for s in stakeholders)

    valid_outcomes = [oo for oo in outcomes if getattr(oo, 'outcome_name', None) or getattr(oo, 'program_name', None)]
    outcomes_html = "".join(
        f"<li><strong>[{oo.type_label}] {getattr(oo, 'outcome_name', getattr(oo, 'program_name', ''))}:</strong> {oo.description or ''}</li>"
        for oo in valid_outcomes
    ) if valid_outcomes else "<li>No organizational outcomes mapped.</li>"

    focal_card_html = f"""
    <td style="width: 50%; border: 1px solid #cbd5e1; border-radius: 4px; padding: 6px 10px; background: #f8fafc; font-size: 8pt;">
        <strong style="color: #1e3a8a; text-transform: uppercase; display: block; margin-bottom: 3px;">Alternate ISSP Focal Person</strong>
        <div>● <strong>Name of ISSP Focal:</strong> {focal_name}</div>
        <div>● <strong>Position:</strong> {focal_pos}</div>
        <div>● <strong>Organizational Unit:</strong> {focal_unit}</div>
        <div>● <strong>E-mail Address:</strong> {focal_email}</div>
        <div>● <strong>Contact Number/s:</strong> {focal_phone}</div>
    </td>
    """ if focal_name else '<td style="width: 50%; border: none;"></td>'

    part1_html = f"""
    <div class="page-body-start" id="sec-part1">
        <div class="section-header">PART I. AGENCY PROFILE &amp; STRATEGIC CONTEXT</div>
        <div class="sub-header" id="sec-part1-a">A. Mandate, Vision, Mission, and Organizational Outcome</div>
        <p id="sec-part1-a1"><strong>A.1. Mandate:</strong></p>
        <div style="text-align: justify; margin-bottom: 3px;"><strong>Legal Basis:</strong> {format_text_blocks(mandate_clean)}</div>
        <div style="text-align: justify; margin-bottom: 3px;"><strong>Function:</strong> {format_text_blocks(functions_clean)}</div>
        <p id="sec-part1-a2"><strong>A.2. Vision Statement:</strong> {vision_clean}</p>
        <p id="sec-part1-a3"><strong>A.3. Mission Statement:</strong> {mission_clean}</p>
        <p id="sec-part1-a4"><strong>A.4. Organizational Outcomes:</strong></p>
        <ul>{outcomes_html}</ul>

        <div class="sub-header" id="sec-part1-b" style="margin-top: 8px;">B. Organizational Structure</div>
        
        <table style="width: 100%; border: none; margin-bottom: 8px;">
            <tr>
                <td style="width: 50%; border: 1px solid #cbd5e1; border-radius: 4px; padding: 6px 10px; background: #f8fafc; font-size: 8pt;" id="sec-part1-b1">
                    <strong style="color: #1e3a8a; text-transform: uppercase; display: block; margin-bottom: 3px;">B.1. Chief Information Officer (CIO)</strong>
                    <div>● <strong>Name of CIO:</strong> {cio_display_name}</div>
                    <div>● <strong>Plantilla Position:</strong> {cio_pos}</div>
                    <div>● <strong>Organizational Unit:</strong> {cio_unit}</div>
                    <div>● <strong>E-mail Address:</strong> {cio_email}</div>
                    <div>● <strong>Contact Number/s:</strong> {cio_phone}</div>
                </td>
                {focal_card_html}
            </tr>
        </table>

        <div class="sub-header" id="sec-part1-b2" style="margin-top: 6px;">B.2. Human Capital</div>
        <table>
            <thead>
                <tr>
                    <th rowspan="2">EMPLOYMENT STATUS</th>
                    <th rowspan="2" class="center">IT POSITIONS</th>
                    <th rowspan="2" class="center">NON-IT POSITIONS</th>
                    <th colspan="2" class="center">SEX</th>
                </tr>
                <tr><th class="center">MALE</th><th class="center">FEMALE</th></tr>
            </thead>
            <tbody>
                {hc_rows or '<tr><td colspan="5" class="center">No current human capital records.</td></tr>'}
                <tr class="band-band">
                    <td class="bold">Grand Total</td>
                    <td class="center font-mono bold">{hc_total_it}</td>
                    <td class="center font-mono bold">{hc_total_non_it}</td>
                    <td class="center font-mono bold">{hc_total_male}</td>
                    <td class="center font-mono bold">{hc_total_female}</td>
                </tr>
            </tbody>
        </table>

        <div class="sub-header" id="sec-part1-c" style="margin-top: 10px;">C. Stakeholder Analysis</div>
        <table>
            <thead>
                <tr>
                    <th style="width:26%;">Stakeholders</th>
                    <th style="width:52%;">Transaction Processed</th>
                    <th class="center" style="width:22%;">Complexity</th>
                </tr>
            </thead>
            <tbody>{stakeholders_rows or '<tr><td colspan="3" class="center">No stakeholder transactions recorded.</td></tr>'}</tbody>
        </table>
    </div>
    """

    # --- 5. PART II: CURRENT ICT ASSESSMENT ---
    concerns_rows = "".join(f"""
        <tr>
            <td class="bold">{sc.mfo}</td>
            <td class="bold">{sc.critical_system}</td>
            <td style="text-align: justify;">{sc.problems}</td>
            <td style="text-align: justify;">{sc.intended_use}</td>
        </tr>
    """ for sc in concerns)

    existing_infra = [n for n in network_infra if not n.is_proposed]
    infra_ii_b_cards = []
    for n in existing_infra:
        infra_ii_b_cards.append(f"""
        <div style="background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 4px; padding: 5px 8px; margin-bottom: 6px; font-size: 7.5pt;">
            <div>
                <strong>Site / Office:</strong> {n.office_location or 'Central Office'} &nbsp;|&nbsp;
                <strong>Connectivity Type:</strong> {n.connectivity_type} &nbsp;|&nbsp;
                <strong>Bandwidth:</strong> {n.bandwidth_mbps} Mbps &nbsp;|&nbsp;
                <strong>Upload Speed:</strong> {getattr(n, 'upload_speed_mbps', n.bandwidth_mbps)} Mbps &nbsp;|&nbsp;
                <strong>Download Speed:</strong> {getattr(n, 'download_speed_mbps', n.bandwidth_mbps)} Mbps &nbsp;|&nbsp;
                <strong>IPv6 Ready:</strong> {'Yes' if n.is_ipv6_ready else 'No'}
            </div>
            <p style="margin: 2px 0;"><strong>Architecture Topology Description:</strong> {n.topology_description}</p>
        </div>
        """)
    infra_ii_b_html = "".join(infra_ii_b_cards)

    existing_net_block = render_schematic_page(
        title="B1. LAN/WAN SET-UP INCLUDING CONNECTIVITY TYPE AND BANDWIDTH (SCHEMATIC)",
        subtitle="Physical and logical network diagram across central headquarters and campus distribution nodes.",
        img_url=narrative.network_diagram_url,
        section_id=None
    )

    cyber_ii_b_table = render_cybersecurity_checklist_table(cyber_controls, is_proposed=False)
    
    existing_systems = [
        s for s in systems 
        if getattr(s.status, 'value', str(s.status or '')).lower().strip() == "operational"
        or getattr(s.status, 'name', '').lower().strip() == "operational"
    ]
    
    sys_ii_c_html = "".join(
        render_information_system_full_spec(s, is_proposed=False, narrative=narrative, projects=projects)
        for s in existing_systems
    )

    total_census_employees = hc_total_it + hc_total_non_it
    egov_rows = []
    
    egov_db_map = {}
    for item in egov_checklists:
        name_l = (item.program_name or "").lower()
        for key, _ in CANONICAL_EGOV_SPECS:
            matched = False
            if key == "pnpki":
                matched = "pnpki" in name_l or "pki" in name_l
            elif key == "continuity":
                matched = "continuity" in name_l or "pscp" in name_l
            elif key == "egovpay":
                matched = "egovpay" in name_l or "payment" in name_l or "collection" in name_l
            elif key == "philgeps":
                matched = "philgeps" in name_l or "procurement" in name_l
            else:
                matched = key in name_l
            if matched:
                if key not in egov_db_map or item.is_utilized:
                    egov_db_map[key] = item
                break

    for key, display_label in CANONICAL_EGOV_SPECS:
        e = egov_db_map.get(key)
        is_used = bool(e and e.is_utilized)
        has_equiv = bool(e and (e.equivalent_system_details or getattr(e, 'equivalent_system_name', None)))
        equiv_title = getattr(e, 'equivalent_system_name', None) or (e.equivalent_system_details if e else "None") or "None"
        equiv_url = getattr(e, 'equivalent_system_url', None) or ""
        has_other_pay = bool(e and (getattr(e, 'has_other_payment_platform', False) or ("payment" in key and not is_used)))
        is_manual = bool(e and e.is_manual)
        is_proposed = bool(e and e.is_proposed_development)
        prop_dev_name = getattr(e, 'proposed_development_name', None) if e else ""

        if key == "pnpki":
            emp_count = getattr(e, 'total_employees', None) or (str(total_census_employees) if total_census_employees > 0 else "N/A")
            pnpki_count = getattr(e, 'active_pnpki_count', None) or "0"
            ratio = getattr(e, 'adoption_ratio', None)
            if not ratio and pnpki_count.isdigit() and str(emp_count).isdigit() and int(emp_count) > 0:
                ratio = f"{(int(pnpki_count) / int(emp_count) * 100):.1f}%"
            elif not ratio:
                ratio = "N/A"

            row_html = f"""
            <tr>
                <td class="bold" style="width: 32%;">{display_label}</td>
                <td colspan="2" style="width: 68%;">
                    Total number of employees: <strong>{emp_count}</strong><br/>
                    Total number of employees with active PNPKI: <strong>{pnpki_count}</strong><br/>
                    Percentage of adoption of PNPKI: <strong>{ratio}</strong>
                </td>
            </tr>
            """
        elif key == "portal":
            channels = getattr(e, 'channels_json', []) or ["Website", "Email", "Landline", "Social Media", "Mobile"]
            ch_str = str(channels).lower()
            conn = bool(e and e.is_connected_to_portal)
            row_html = f"""
            <tr>
                <td class="bold" style="width: 32%;">{display_label}</td>
                <td style="width: 34%;">
                    What are the existing consumer protection and citizen assistance, feedback and grievance mechanisms in your agency?<br/>
                    <div style="margin-top: 2px;">
                        {'[X]' if 'website' in ch_str else '[ ]'} Website &nbsp;&nbsp;
                        {'[X]' if 'email' in ch_str else '[ ]'} Email &nbsp;&nbsp;
                        {'[X]' if 'landline' in ch_str else '[ ]'} Landline &nbsp;&nbsp;
                        {'[X]' if 'social' in ch_str else '[ ]'} Social Media &nbsp;&nbsp;
                        {'[X]' if 'mobile' in ch_str else '[ ]'} Mobile
                    </div>
                </td>
                <td style="width: 34%;">
                    Are these mechanisms already connected with online public service portals?<br/>
                    <div style="margin-top: 2px;">
                        <strong>{'[X] Yes' if conn else '[ ] Yes'}&nbsp;&nbsp;&nbsp;&nbsp;{'[ ] No' if conn else '[X] No'}</strong>
                    </div>
                </td>
            </tr>
            """
        elif key == "records":
            row_html = f"""
            <tr>
                <td class="bold" style="width: 32%;">{display_label}</td>
                <td style="width: 34%;">
                    Is there an existing repository for Records and Knowledge Management in your agency?<br/>
                    <div style="margin-top: 2px;">
                        <strong>{'[X] Yes' if is_used else '[ ] Yes'}&nbsp;&nbsp;&nbsp;&nbsp;{'[ ] No' if is_used else '[X] No'}</strong>
                    </div>
                </td>
                <td style="width: 34%;">
                    If Yes, indicate the system:<br/>
                    <u>{e.url_or_system_name if e and e.url_or_system_name else equiv_title}</u>
                </td>
            </tr>
            """
        elif key == "continuity":
            row_html = f"""
            <tr>
                <td class="bold" style="width: 32%;">{display_label}</td>
                <td colspan="2" style="width: 68%;">
                    Is there an existing Public Service Continuity Plan in your agency?<br/>
                    <div style="margin-top: 2px;">
                        <strong>{'[X] Yes' if is_used else '[ ] Yes'}&nbsp;&nbsp;&nbsp;&nbsp;{'[ ] No' if is_used else '[X] No'}</strong>
                    </div>
                </td>
            </tr>
            """
        else:
            row_html = f"""
            <tr>
                <td class="bold" style="width: 32%;">{display_label}</td>
                <td style="width: 34%;">
                    Is your agency utilizing the program?<br/>
                    <div style="margin-top: 2px;">
                        {'[X]' if is_used else '[ ]'} Yes<br/>
                        {'[X]' if not is_used else '[ ]'} No
                    </div>
                    {f'<div class="font-mono text-[7.5pt]" style="margin-top: 2px;">Indicate url: <u>{e.url_or_system_name}</u></div>' if (is_used and e and e.url_or_system_name) else ''}
                </td>
                <td style="width: 34%;">
                    If No,<br/>
                    {'[X]' if has_equiv else '[ ]'} Using equivalent system: <u>{equiv_title}</u><br/>
                    {f'&nbsp;&nbsp;&nbsp;&nbsp;Indicate url: <u>{equiv_url}</u><br/>' if equiv_url else ''}
                    {f'{"[X]" if has_other_pay else "[ ]"} Using other digital or electronic payment platform<br/>' if ("egovpay" in key or has_other_pay) else ''}
                    {'[X]' if is_manual else '[ ]'} Manual Transaction<br/>
                    {'[X]' if is_proposed else '[ ]'} Proposed development of equivalent system{f': <u>{prop_dev_name}</u>' if prop_dev_name else ''}
                </td>
            </tr>
            """
        egov_rows.append(row_html)

    egov_html = f"""
    <table>
        <thead>
            <tr>
                <th style="width: 32%;">PROGRAM / INITIATIVE NAME</th>
                <th style="width: 34%;">UTILIZATION STATUS</th>
                <th style="width: 34%;">DETAILS / EQUIVALENT PLATFORM</th>
            </tr>
        </thead>
        <tbody>
            {''.join(egov_rows)}
        </tbody>
    </table>
    """

    part2_html = f"""
    <div class="page-break" id="sec-part2">
        <div class="section-header">PART II. CURRENT ICT ASSESSMENT</div>
        <div class="sub-header" id="sec-part2-a">A. Strategic Concerns for ICT Use</div>
        <table>
            <thead><tr><th style="width:20%;">OO / SO / MFO</th><th style="width:25%;">Critical Business System</th><th style="width:25%;">Problem / Barrier</th><th style="width:30%;">Intended Use of ICT</th></tr></thead>
            <tbody>{concerns_rows or '<tr><td colspan="4" class="center">No strategic concerns mapped.</td></tr>'}</tbody>
        </table>

        <div class="sub-header" id="sec-part2-b" style="margin-top: 8px;">B. Existing Network Infrastructure</div>
        <p id="sec-part2-b1" style="font-weight:bold; margin-bottom:3px;">B1. LAN/WAN SET-UP INCLUDING CONNECTIVITY TYPE AND BANDWIDTH:</p>
        {infra_ii_b_html or '<p style="font-style:italic; color:#64748b;">No network infrastructure registered.</p>'}
    </div>
    {existing_net_block}

    <div class="page-break">
        <p id="sec-part2-b2" style="font-weight:bold; margin-top:6px; margin-bottom:3px;">B2. CYBERSECURITY CONTROL CHECKLIST:</p>
        {cyber_ii_b_table}
    </div>

    <div class="page-break" id="sec-part2-c">
        <div class="section-header">PART II. CURRENT ICT ASSESSMENT (CONTINUED)</div>
        <div class="sub-header">C. Existing/Operational Information Systems (IS) Inventory</div>
        {sys_ii_c_html or '<p style="font-style:italic; color:#64748b;">No operational information systems cataloged.</p>'}
    </div>

    <div class="page-break" id="sec-part2-d">
        <div class="section-header">PART II. CURRENT ICT ASSESSMENT (CONTINUED)</div>
        <div class="sub-header">D. E-Government Programs (EGP) Checklist</div>
        {egov_html}
    </div>
    """

    # --- 6. PART III: PROPOSED ICT STRATEGY ---
    proposed_infra = [n for n in network_infra if n.is_proposed]
    infra_iii_a_cards = []
    for n in proposed_infra:
        infra_iii_a_cards.append(f"""
        <div style="background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 4px; padding: 5px 8px; margin-bottom: 6px; font-size: 7.5pt;">
            <div>
                <strong>Deployment Site:</strong> {n.office_location or 'Central & Regional Offices'} &nbsp;|&nbsp;
                <strong>Connectivity Type:</strong> {n.connectivity_type} &nbsp;|&nbsp;
                <strong>Target Bandwidth:</strong> {n.bandwidth_mbps} Mbps &nbsp;|&nbsp;
                <strong>Upload Speed:</strong> {getattr(n, 'upload_speed_mbps', n.bandwidth_mbps)} Mbps &nbsp;|&nbsp;
                <strong>Download Speed:</strong> {getattr(n, 'download_speed_mbps', n.bandwidth_mbps)} Mbps &nbsp;|&nbsp;
                <strong>IPv6 Ready:</strong> {'Yes' if n.is_ipv6_ready else 'No'}
            </div>
            <p style="margin: 2px 0;"><strong>Proposed Architecture Topology:</strong> {n.topology_description}</p>
        </div>
        """)
    infra_iii_a_html = "".join(infra_iii_a_cards)

    proposed_net_block = render_schematic_page(
        title="A.1. LAN/WAN SET-UP INCLUDING CONNECTIVITY TYPE AND BANDWIDTH (SCHEMATIC)",
        subtitle="High-speed optical fiber backbone, distribution switches, and campus network connectivity.",
        img_url=narrative.fiber_backbone_url,
        section_id=None
    )

    cyber_iii_a_table = render_cybersecurity_checklist_table(cyber_controls, is_proposed=True)
    
    ea_narrative_text = clean_text(
        narrative.enterprise_architecture_narrative,
        f"The proposed Enterprise Architecture of {agency_name_clean} rationalizes disparate legacy platforms and siloed databases into microservices containerized on GovCloud, utilizing PeGIF-compliant API gateways to establish automated interoperability with national oversight agencies, citizen service portals, and online payment gateways."
    )

    ea_block = render_schematic_page(
        title="B. ENTERPRISE ARCHITECTURE",
        subtitle="Target microservices, PeGIF API gateways, and National Government Data Exchange (NGDX) pipelines.",
        img_url=narrative.system_architecture_url,
        narrative_text=ea_narrative_text,
        section_id="sec-part3-b"
    )

    staff_rows = "".join(f"""
        <tr>
            <td class="bold">{pos.position_title}</td>
            <td>{pos.status}</td>
            <td class="center font-mono bold">{pos.count}</td>
        </tr>
    """ for pos in staff_positions)
    total_staff_count = sum(pos.count for pos in staff_positions)

    proposed_systems = [
        s for s in systems 
        if getattr(s.status, 'value', str(s.status or '')).lower().strip() != "operational"
        and getattr(s.status, 'name', '').lower().strip() != "operational"
    ]
    
    sys_iii_d_html = "".join(
        render_information_system_full_spec(s, is_proposed=True, narrative=narrative, projects=projects)
        for s in proposed_systems
    )

    internal_projs = [p for p in projects if "cross" not in str(p.project_category).lower()]
    cross_projs = [p for p in projects if "cross" in str(p.project_category).lower()]

    def render_project_card(proj: IctProject, is_cross: bool = False) -> str:
        p_start = getattr(proj, 'duration_start_year', None) or start_year
        p_end = getattr(proj, 'duration_end_year', None) or end_year
        p_years = list(range(p_start, p_end + 1)) if p_end >= p_start else [p_start]
        fund_str = getattr(proj.funding_source, 'value', str(proj.funding_source))
        aligns_others_text = f" ({proj.aligns_others_specify})" if getattr(proj, 'aligns_others', False) and getattr(proj, 'aligns_others_specify', None) else ""

        harm_map = getattr(proj, "harmonization_criteria", None)
        if isinstance(harm_map, str):
            try: harm_map = json.loads(harm_map)
            except Exception: harm_map = None
        
        if isinstance(harm_map, dict) and len(harm_map) > 0:
            harmonization_items_html = "".join(
                f"<div>{'[X]' if val else '[ ]'} {crit_name}</div>"
                for crit_name, val in harm_map.items()
            )
        else:
            harmonization_items_html = f"""
            <div>{'[X]' if proj.harmonizes_national_priority else '[ ]'} National Prioritization</div>
            <div>{'[X]' if proj.harmonizes_resource_optimization else '[ ]'} Resource Optimization</div>
            <div>{'[X]' if proj.harmonizes_pegif else '[ ]'} Interoperability Framework</div>
            <div>{'[X]' if proj.harmonizes_cross_collaboration else '[ ]'} Cross-Agency Collaboration</div>
            <div>{'[X]' if proj.harmonizes_scalability else '[ ]'} Scalability and Sustainability</div>
            """

        annual_map = getattr(proj, "annual_deliverables", None) or {}
        if isinstance(annual_map, str):
            try: annual_map = json.loads(annual_map)
            except Exception: annual_map = {}

        milestone_rows = ""
        for idx, yr in enumerate(p_years):
            m_text = annual_map.get(str(yr)) or annual_map.get(f"Year {idx + 1}")
            if not m_text:
                if idx == 0:
                    m_text = getattr(proj, "year_1_deliverables", "N/A")
                elif idx == 1:
                    m_text = getattr(proj, "year_2_deliverables", "N/A")
                elif idx == 2:
                    m_text = getattr(proj, "year_3_deliverables", "N/A")
                else:
                    m_text = "N/A"
            milestone_rows += f"""
            <tr>
                <td class="bold">YEAR {idx + 1} DELIVERABLES/MILESTONE ({yr})</td>
                <td style="text-align: justify;">{m_text or 'N/A'}</td>
            </tr>
            """

        linked_props = [
            itm for itm in getattr(proj, "resource_items", []) 
            if not getattr(itm, "is_archived", False) 
            and str(getattr(itm, "status", "")).lower() == "approved"
            and (itm.project_id == proj.id or str(itm.project_id) == str(proj.id))
        ]
        
        linked_sys = list(getattr(proj, "linked_systems", []) or [])
        if getattr(proj, "information_system", None) and proj.information_system not in linked_sys:
            linked_sys.append(proj.information_system)

        components_rows = ""
        for s in linked_sys:
            components_rows += f"""
            <tr>
                <td style="border: 1px solid #cbd5e1; padding: 2px 4px;"><strong>[SYSTEM]</strong> {s.name}</td>
                <td style="border: 1px solid #cbd5e1; padding: 2px 4px;">Information System</td>
                <td class="center font-mono" style="border: 1px solid #cbd5e1; padding: 2px 4px;">1</td>
                <td class="right font-mono" style="border: 1px solid #cbd5e1; padding: 2px 4px;">{fmt_currency(s.proposed_cost)}</td>
            </tr>
            """

        for itm in linked_props:
            components_rows += f"""
            <tr>
                <td style="border: 1px solid #cbd5e1; padding: 2px 4px;">{itm.item_name}</td>
                <td style="border: 1px solid #cbd5e1; padding: 2px 4px;">{itm.category}</td>
                <td class="center font-mono" style="border: 1px solid #cbd5e1; padding: 2px 4px;">{itm.total_qty}</td>
                <td class="right font-mono" style="border: 1px solid #cbd5e1; padding: 2px 4px;">{fmt_currency(itm.total_cost)}</td>
            </tr>
            """

        components_block = f"""
        <tr>
            <td class="bold">PROJECT COMPONENTS (PART IV.A)</td>
            <td style="padding: 0;">
                <table style="width: 100%; border-collapse: collapse; margin: 0; font-size: 7.5pt;">
                    <thead>
                        <tr style="background: #f1f5f9;">
                            <th style="border: 1px solid #cbd5e1; padding: 2.5px 4px; text-align: left;">Resource / System Item</th>
                            <th style="border: 1px solid #cbd5e1; padding: 2.5px 4px; text-align: left;">Type</th>
                            <th style="border: 1px solid #cbd5e1; padding: 2.5px 4px; text-align: center;">Qty</th>
                            <th style="border: 1px solid #cbd5e1; padding: 2.5px 4px; text-align: right;">Total Outlay</th>
                        </tr>
                    </thead>
                    <tbody>
                        {components_rows}
                    </tbody>
                </table>
            </td>
        </tr>
        """ if components_rows else ""

        return f"""
        <table style="margin-bottom: 10px;">
            <tr>
                <td style="width: 28%;" class="bold">PROJECT TITLE</td>
                <td style="width: 72%;" class="bold">{proj.project_title}</td>
            </tr>
            <tr>
                <td class="bold">DESCRIPTION</td>
                <td style="text-align: justify;">{proj.description}</td>
            </tr>
            <tr>
                <td class="bold">OBJECTIVES</td>
                <td style="text-align: justify;">{proj.objectives}</td>
            </tr>
            <tr>
                <td class="bold">STRATEGIC ALIGNMENT</td>
                <td>
                    <div>{'[X]' if proj.aligns_pip else '[ ]'} Public Investment Program</div>
                    <div>{'[X]' if proj.aligns_ncsp else '[ ]'} National Cybersecurity Plan</div>
                    <div>{'[X]' if proj.aligns_egmp else '[ ]'} E-Government Master Plan</div>
                    <div>{'[X]' if proj.aligns_pcb else '[ ]'} Program Convergence Budgeting</div>
                    <div>{'[X]' if getattr(proj, 'aligns_others', False) else '[ ]'} Others{aligns_others_text}</div>
                </td>
            </tr>
            <tr>
                <td class="bold">HARMONIZATION FRAMEWORK</td>
                <td>{harmonization_items_html}</td>
            </tr>
            <tr>
                <td class="bold">DURATION</td>
                <td>{p_start} to {p_end} ({len(p_years)} Years)</td>
            </tr>
            {milestone_rows}
            <tr>
                <td class="bold">IMPLEMENTING UNIT</td>
                <td>{proj.implementing_unit}</td>
            </tr>
            {components_block}
            <tr>
                <td class="bold">TOTAL PROJECT COST</td>
                <td class="font-mono bold">{fmt_currency(proj.computed_total_project_cost)}</td>
            </tr>
            <tr>
                <td class="bold">FUNDING SOURCE</td>
                <td>
                    {'[X]' if fund_str == 'General Appropriations Act (GAA)' or 'gaa' in fund_str.lower() else '[ ]'} GAA &nbsp;&nbsp;&nbsp;&nbsp;
                    {'[X]' if 'foreign' in fund_str.lower() else '[ ]'} Foreign-assisted projects &nbsp;&nbsp;&nbsp;&nbsp;
                    {'[X]' if 'locally' in fund_str.lower() else '[ ]'} Locally funded &nbsp;&nbsp;&nbsp;&nbsp;
                    {'[X]' if 'income' in fund_str.lower() else '[ ]'} Other Income Generating Sources
                </td>
            </tr>
            {f'<tr><td class="bold">LEAD AGENCY</td><td>{proj.lead_agency or "Not Specified"}</td></tr><tr><td class="bold">IMPLEMENTING AGENCY</td><td>{proj.partner_agencies or "None"}</td></tr>' if is_cross else ''}
        </table>
        """

    def render_pmf_table(proj_list: List[IctProject]) -> str:
        tables_html = ""
        for p in proj_list:
            rows = "".join(f"""
                <tr>
                    <td class="bold">{getattr(m, 'result_hierarchy', '')}</td>
                    <td>{getattr(m, 'indicator', '')}</td>
                    <td class="center font-mono">{getattr(m, 'baseline', '')}</td>
                    <td class="center font-mono bold">{getattr(m, 'target', '')}</td>
                    <td>{getattr(m, 'collection_method', '')}</td>
                    <td>{getattr(m, 'responsibility', '')}</td>
                </tr>
            """ for m in p.pmf_metrics)

            tables_html += f"""
            <div style="margin-bottom: 8px;">
                <strong style="color: #1e3a8a; font-size: 8.5pt;">ICT Project: {p.project_title}</strong>
                <table style="margin-top: 2.5px;">
                    <thead>
                        <tr>
                            <th style="width:16%;">HIERARCHY OF TARGETED RESULTS</th>
                            <th style="width:30%;">KEY PERFORMANCE INDICATORS (KPIS)</th>
                            <th class="center" style="width:12%;">BASELINE DATA</th>
                            <th class="center" style="width:12%;">TARGETS</th>
                            <th style="width:15%;">DATA COLLECTION METHODS</th>
                            <th style="width:15%;">RESPONSIBILITY TO COLLECT DATA</th>
                        </tr>
                    </thead>
                    <tbody>{rows or '<tr><td colspan="6" class="center">No KPIs defined for this project.</td></tr>'}</tbody>
                </table>
            </div>
            """
        return tables_html or '<p style="font-style:italic; color:#64748b;">No projects cataloged.</p>'

    pmf_f3_html = ""
    if standalone_metrics:
        rows = "".join(f"""
            <tr>
                <td class="bold">{getattr(m, 'result_hierarchy', 'Output')}</td>
                <td>{getattr(m, 'indicator', '')}</td>
                <td class="center font-mono">{getattr(m, 'baseline', '')}</td>
                <td class="center font-mono bold">{getattr(m, 'target', '')}</td>
                <td>{getattr(m, 'collection_method', '')}</td>
                <td>{getattr(m, 'responsibility', '')}</td>
            </tr>
        """ for m in standalone_metrics)
        pmf_f3_html = f"""
        <div style="margin-top: 10px;">
            <p id="sec-part3-f3" style="font-weight:bold; margin-bottom:3px;">F.3. INSTITUTIONAL &amp; AGENCY-WIDE ICT GOVERNANCE KPIS:</p>
            <table style="margin-top: 3px;">
                <thead>
                    <tr>
                        <th style="width:16%;">HIERARCHY OF TARGETED RESULTS</th>
                        <th style="width:30%;">KEY PERFORMANCE INDICATORS (KPIS)</th>
                        <th class="center" style="width:12%;">BASELINE DATA</th>
                        <th class="center" style="width:12%;">TARGETS</th>
                        <th style="width:15%;">DATA COLLECTION METHODS</th>
                        <th style="width:15%;">RESPONSIBILITY TO COLLECT DATA</th>
                    </tr>
                </thead>
                <tbody>{rows}</tbody>
            </table>
        </div>
        """

    part3_html = f"""
    <div class="page-break" id="sec-part3">
        <div class="section-header">PART III. PROPOSED ICT STRATEGY</div>
        <div class="sub-header" id="sec-part3-a">A. Proposed Network Infrastructure</div>
        <p id="sec-part3-a1" style="font-weight:bold; margin-bottom:3px;">A.1. LAN/WAN SET-UP INCLUDING CONNECTIVITY TYPE AND BANDWIDTH:</p>
        {infra_iii_a_html or '<p style="font-style:italic; color:#64748b;">No proposed network expansions logged.</p>'}
    </div>
    {proposed_net_block}

    <div class="page-break">
        <p id="sec-part3-a2" style="font-weight:bold; margin-top:6px; margin-bottom:3px;">A.2. CYBERSECURITY CONTROL CHECKLIST:</p>
        {cyber_iii_a_table}
    </div>
    {ea_block}

    <div class="page-break" id="sec-part3-c">
        <div class="section-header">PART III. PROPOSED ICT STRATEGY (CONTINUED)</div>
        <div class="sub-header">C. Proposed ICT Human Capital</div>
        <table>
            <thead><tr><th style="width:50%;">IT POSITION</th><th style="width:30%;">EMPLOYMENT STATUS</th><th class="center" style="width:20%;">PHYSICAL COUNT</th></tr></thead>
            <tbody>
                {staff_rows or '<tr><td colspan="3" class="center">No proposed staffing positions logged.</td></tr>'}
                <tr class="band-band"><td colspan="2" class="bold">Grand Total</td><td class="center font-mono bold">{total_staff_count}</td></tr>
            </tbody>
        </table>
    </div>

    <div class="page-break" id="sec-part3-d">
        <div class="section-header">PART III. PROPOSED ICT STRATEGY (CONTINUED)</div>
        <div class="sub-header">D. Proposed Information Systems</div>
        {sys_iii_d_html or '<p style="font-style:italic; color:#64748b;">No proposed systems logged.</p>'}
    </div>

    <div class="page-break" id="sec-part3-e">
        <div class="section-header">PART III. PROPOSED ICT STRATEGY (CONTINUED)</div>
        <div class="sub-header">E. ICT Projects</div>
        <p id="sec-part3-e1" style="font-weight:bold; margin-bottom:4px;">E.1. INTERNAL ICT PROJECTS:</p>
        {"".join(render_project_card(p, is_cross=False) for p in internal_projs) or '<p style="font-style:italic; color:#64748b;">No internal projects logged.</p>'}

        <p id="sec-part3-e2" style="font-weight:bold; margin-top:8px; margin-bottom:4px;">E.2. CROSS-AGENCY ICT PROJECTS:</p>
        {"".join(render_project_card(p, is_cross=True) for p in cross_projs) or '<p style="font-style:italic; color:#64748b;">No cross-agency projects logged.</p>'}

        <div class="sub-header" id="sec-part3-f" style="margin-top: 10px;">F. Performance Measurement Framework</div>
        <p id="sec-part3-f1" style="font-weight:bold; margin-bottom:4px;">F.1. INTERNAL ICT PROJECTS:</p>
        {render_pmf_table(internal_projs)}

        <p id="sec-part3-f2" style="font-weight:bold; margin-top:6px; margin-bottom:4px;">F.2. CROSS-AGENCY ICT PROJECTS:</p>
        {render_pmf_table(cross_projs)}
        {pmf_f3_html}
    </div>
    """

    # --- 7. PART IV.A: DETAILED RESOURCE DEPLOYMENT ---
    def render_part_iv_a_table(year_index: int, cal_year: int, target_sec_id: str):
        rows = ""
        year_total = Decimal("0.00")

        # Discover all active categories from proposals
        discovered_categories = []
        for itm in items:
            c = resolve_proposal_category(itm)
            if c and c not in discovered_categories:
                discovered_categories.append(c)
        
        # Ensure canonical categories are present
        canonical_cats = [
            "Office Productivity",
            "Internal ICT Projects",
            "Cross-Agency ICT Projects",
            "Continuing Costs/Expenses"
        ]
        for cc in canonical_cats:
            if cc not in discovered_categories:
                discovered_categories.append(cc)

        for cat_name in discovered_categories:
            is_proj_linked = "project" in cat_name.lower()

            cat_items = []
            for itm in items:
                resolved_cat = resolve_proposal_category(itm)

                if resolved_cat.lower() == cat_name.lower():
                    qty = 0
                    if itm.yearly_quantities and isinstance(itm.yearly_quantities, dict):
                        qty = int(itm.yearly_quantities.get(str(cal_year), 0) or itm.yearly_quantities.get(cal_year, 0) or 0)
                        if qty == 0:
                            qty = int(itm.yearly_quantities.get(f"Year {year_index}", 0) or 0)
                    elif year_index == 1:
                        qty = getattr(itm, "year_1_qty", 0) or 0
                    elif year_index == 2:
                        qty = getattr(itm, "year_2_qty", 0) or 0
                    elif year_index == 3:
                        qty = getattr(itm, "year_3_qty", 0) or 0

                    if qty > 0:
                        cat_items.append((itm, qty))

            if not cat_items:
                continue

            cat_subtotal = Decimal("0.00")
            for itm, q in cat_items:
                adj_unit = get_adjusted_unit_cost_for_year(db, itm.unit_cost, cal_year, start_year)
                cat_subtotal += Decimal(q) * adj_unit

            rows += f"""
            <tr class="band-band">
                <td colspan="5" class="bold">{cat_name.upper()}</td>
                <td class="right font-mono bold">{fmt_currency(cat_subtotal)}</td>
            </tr>
            """

            if is_proj_linked:
                project_ids = list({itm.project_id for itm, _ in cat_items if itm.project_id})
                for pid in project_ids:
                    p_obj = next((p for p in projects if p.id == pid or str(p.id) == str(pid)), None)
                    p_title = p_obj.project_title if p_obj else f"Project #{pid}"
                    p_items = [(itm, q) for itm, q in cat_items if itm.project_id == pid]

                    p_subtotal = sum(
                        Decimal(q) * get_adjusted_unit_cost_for_year(db, itm.unit_cost, cal_year, start_year)
                        for itm, q in p_items
                    )

                    rows += f"""
                    <tr style="background:#f1f5f9; font-weight:bold;">
                        <td colspan="5" style="padding-left:10px; color:#1e3a8a;">[{p_title.upper()}]</td>
                        <td class="right font-mono">{fmt_currency(p_subtotal)}</td>
                    </tr>
                    """

                    for exp_class_name in ["Capital Outlay", "Maintenance and Other Operating Expenses"]:
                        is_co_target = "capital" in exp_class_name.lower()
                        exp_items = [
                            (itm, q) for itm, q in p_items
                            if ("capital" in str(getattr(itm.expenditure_class, 'value', itm.expenditure_class or '')).lower()) == is_co_target
                        ]
                        if not exp_items:
                            continue

                        exp_subtotal = sum(
                            Decimal(q) * get_adjusted_unit_cost_for_year(db, itm.unit_cost, cal_year, start_year)
                            for itm, q in exp_items
                        )

                        rows += f"""
                        <tr class="band-sub">
                            <td colspan="5" style="padding-left:16px;" class="bold">{exp_class_name.upper()}</td>
                            <td class="right font-mono bold">{fmt_currency(exp_subtotal)}</td>
                        </tr>
                        """

                        for itm, qty in exp_items:
                            adj_unit = get_adjusted_unit_cost_for_year(db, itm.unit_cost, cal_year, start_year)
                            line_cost = Decimal(qty) * adj_unit
                            year_total += line_cost
                            deploy_office = itm.target_office_automated or getattr(itm.department, 'name', '') or itm.office_location or "Central Office"
                            proj = getattr(itm, "project_rel", None)
                            resolved_fund = getattr(proj, "funding_source", None) or itm.fund_source
                            fund_val = str(getattr(resolved_fund, 'value', resolved_fund or itm.fund_source or 'GAA'))

                            rows += f"""
                            <tr>
                                <td style="padding-left:24px;">{itm.item_name}</td>
                                <td>{deploy_office}</td>
                                <td>{fund_val}</td>
                                <td class="right font-mono">{fmt_currency(adj_unit)}</td>
                                <td class="center font-mono">{qty}</td>
                                <td class="right font-mono bold">{fmt_currency(line_cost)}</td>
                            </tr>
                            """
            else:
                for exp_class_name in ["Capital Outlay", "Maintenance and Other Operating Expenses"]:
                    is_co_target = "capital" in exp_class_name.lower()
                    exp_items = [
                        (itm, q) for itm, q in cat_items
                        if ("capital" in str(getattr(itm.expenditure_class, 'value', itm.expenditure_class or '')).lower()) == is_co_target
                    ]
                    if not exp_items:
                        continue

                    exp_subtotal = sum(
                        Decimal(q) * get_adjusted_unit_cost_for_year(db, itm.unit_cost, cal_year, start_year)
                        for itm, q in exp_items
                    )

                    rows += f"""
                    <tr class="band-sub">
                        <td colspan="5" style="padding-left:12px;" class="bold">{exp_class_name.upper()}</td>
                        <td class="right font-mono bold">{fmt_currency(exp_subtotal)}</td>
                    </tr>
                    """

                    for itm, qty in exp_items:
                        adj_unit = get_adjusted_unit_cost_for_year(db, itm.unit_cost, cal_year, start_year)
                        line_cost = Decimal(qty) * adj_unit
                        year_total += line_cost
                        deploy_office = itm.target_office_automated or getattr(itm.department, 'name', '') or itm.office_location or "Central Office"
                        proj = getattr(itm, "project_rel", None)
                        resolved_fund = getattr(proj, "funding_source", None) or itm.fund_source
                        fund_val = str(getattr(resolved_fund, 'value', resolved_fund or itm.fund_source or 'GAA'))

                        rows += f"""
                        <tr>
                            <td style="padding-left:20px;">{itm.item_name}</td>
                            <td>{deploy_office}</td>
                            <td>{fund_val}</td>
                            <td class="right font-mono">{fmt_currency(adj_unit)}</td>
                            <td class="center font-mono">{qty}</td>
                            <td class="right font-mono bold">{fmt_currency(line_cost)}</td>
                        </tr>
                        """

        year_anchors = f'<span id="sec-part4"></span><span id="sec-part4-a"></span><span id="{target_sec_id}"></span>' if year_index == 1 else f'<span id="{target_sec_id}"></span>'

        return f"""
        <div class="page-break">
            {year_anchors}
            <div class="section-header">PART IV. RESOURCE REQUIREMENTS</div>
            <div class="sub-header">A.{year_index}. [YEAR #{year_index}] (FY {cal_year})</div>
            <table class="part4a-table">
                <thead>
                    <tr>
                        <th style="width:34%;">ITEM</th>
                        <th style="width:18%;">OFFICE LOCATION (DEPLOYMENT)</th>
                        <th style="width:16%;">FUND SOURCE</th>
                        <th class="right" style="width:10%;">UNIT COST</th>
                        <th class="center" style="width:8%;">PHYSICAL TARGET</th>
                        <th class="right" style="width:14%;">TOTAL COST</th>
                    </tr>
                </thead>
                <tbody>
                    {rows or '<tr><td colspan="6" class="center">No items budgeted for this fiscal year.</td></tr>'}
                    <tr class="band-band">
                        <td colspan="5" class="right bold">GRAND TOTAL:</td>
                        <td class="right font-mono bold">{fmt_currency(year_total)}</td>
                    </tr>
                </tbody>
            </table>
            <p style="font-size: 7.5pt; font-style: italic; margin-top: 3px; color: #475569;">
                *All costs indicated in this section are based on market research conducted by {agency_name_clean} (inclusive of administrative inflation buffer adjustments).
            </p>
        </div>
        """

    part4a_html = "".join(
        render_part_iv_a_table(idx + 1, yr, f"sec-part4-a{idx + 1}")
        for idx, yr in enumerate(years_range)
    )

    # --- 8. PART IV.B: SUMMARY OF INVESTMENTS ---
    def render_matrix_table(title: str, matrix_dict: dict, section_id: str = ""):
        col_headers_th = "".join(f'<th class="right font-mono">{y}</th>' for y in year_headers)
        total_header_label = f"{len(years_range)}-YEAR TOTAL (PHP)" if len(years_range) > 0 else "TOTAL AMOUNT (PHP)"
        is_uacs_table = "B.4" in title or "OBJECT OF EXPENDITURE" in title.upper()

        table_rows = ""
        for key, row_vals in matrix_dict.items():
            is_grand = (key.upper() == "GRAND TOTAL")
            style = 'style="background:#e2e8f0; font-weight:bold;"' if is_grand else ""
            cells_td = "".join(
                f'<td class="right font-mono">{fmt_currency(row_vals.get(y) if row_vals.get(y) is not None else row_vals.get(y.replace("FY ", ""), 0))}</td>' 
                for y in year_headers
            )

            t_val = row_vals.get('Total') if row_vals.get('Total') is not None else row_vals.get('total', 0)
            display_label = key if is_grand or not is_uacs_table else clean_uacs_title(key)

            table_rows += f"""
            <tr {style}>
                <td class="bold">{display_label}</td>
                {cells_td}
                <td class="right font-mono bold">{fmt_currency(t_val)}</td>
            </tr>
            """
        return f"""
        <div style="margin-top: 8px;" {f'id="{section_id}"' if section_id else ''}>
            <div class="bold" style="font-size: 8.5pt; color: #1e3a8a; margin-bottom: 2.5px;">{title}</div>
            <table>
                <thead><tr><th>Category / Classification</th>{col_headers_th}<th class="right font-bold">{total_header_label}</th></tr></thead>
                <tbody>{table_rows}</tbody>
            </table>
        </div>
        """

    part4b_html = f"""
    <div class="page-break" id="sec-part4-b">
        <div class="section-header">B. SUMMARY OF INVESTMENTS</div>
        {render_matrix_table("B.1. GENERAL SUMMARY", parity_data["b1_general_summary"], "sec-part4-b1")}
        {render_matrix_table("B.2. FUND SOURCE", parity_data["b2_fund_source"], "sec-part4-b2")}
    </div>
    <div class="page-break">
        <div class="section-header">B. SUMMARY OF INVESTMENTS (CONTINUED)</div>
        {render_matrix_table("B.3. STATEMENT OF EXPENDITURE", parity_data["b3_statement_of_expenditure"], "sec-part4-b3")}
        {render_matrix_table("B.4. OBJECT OF EXPENDITURE", parity_data["b4_object_of_expenditure"], "sec-part4-b4")}
    </div>
    """

    # --- 9. ANNEX 1: ASSET INVENTORY ---
    std_equipment = [
        "Servers", 
        "Desktop", 
        "Laptop", 
        "Mobile Phone", 
        "Tablet", 
        "Printer", 
        "Network Switch"
    ]

    def match_eq_category(item, target_cat):
        if item.is_software:
            return False
        cat_val = getattr(item, 'dict_category', None)
        if cat_val:
            val_str = getattr(cat_val, "value", str(cat_val))
            if val_str.strip().lower() == target_cat.strip().lower():
                return True
        inferred = infer_dict_category(item.item_name or "", False)
        return inferred.strip().lower() == target_cat.strip().lower()

    eq_rows_html = ""
    tot_c_ops = 0
    tot_c_eol = 0
    tot_c_bak = 0
    tot_f_ops = 0
    tot_f_eol = 0
    tot_f_bak = 0

    for cat in std_equipment:
        c_items = [i for i in inventory if match_eq_category(i, cat)]
        
        c_ops = sum(i.quantity for i in c_items if (i.is_central_office or str(i.office_location).lower() == "central office") and not i.is_end_of_life and str(getattr(i.status, "name", i.status)).upper() == "FUNCTIONAL")
        c_eol = sum(i.quantity for i in c_items if (i.is_central_office or str(i.office_location).lower() == "central office") and (i.is_end_of_life or str(getattr(i.status, "name", i.status)).upper() == "CONDEMNED"))
        c_bak = sum(i.quantity for i in c_items if (i.is_central_office or str(i.office_location).lower() == "central office") and i.is_backup)

        f_ops = sum(i.quantity for i in c_items if not (i.is_central_office or str(i.office_location).lower() == "central office") and not i.is_end_of_life and str(getattr(i.status, "name", i.status)).upper() == "FUNCTIONAL")
        f_eol = sum(i.quantity for i in c_items if not (i.is_central_office or str(i.office_location).lower() == "central office") and (i.is_end_of_life or str(getattr(i.status, "name", i.status)).upper() == "CONDEMNED"))
        f_bak = sum(i.quantity for i in c_items if not (i.is_central_office or str(i.office_location).lower() == "central office") and i.is_backup)

        tot_c_ops += c_ops
        tot_c_eol += c_eol
        tot_c_bak += c_bak
        tot_f_ops += f_ops
        tot_f_eol += f_eol
        tot_f_bak += f_bak

        eq_rows_html += f"""
        <tr>
            <td rowspan="3" class="bold" style="vertical-align:middle;">{cat}</td>
            <td>Central Office</td>
            <td class="center font-mono">{c_ops}</td><td class="center font-mono">{c_eol}</td><td class="center font-mono">{c_bak}</td>
        </tr>
        <tr>
            <td>Field/Regional Office</td>
            <td class="center font-mono">{f_ops}</td><td class="center font-mono">{f_eol}</td><td class="center font-mono">{f_bak}</td>
        </tr>
        <tr class="band-sub">
            <td class="bold">Total</td>
            <td class="center font-mono bold">{c_ops + f_ops}</td><td class="center font-mono bold">{c_eol + f_eol}</td><td class="center font-mono bold">{c_bak + f_bak}</td>
        </tr>
        """

    other_eq_items = [i for i in inventory if not i.is_software and not any(match_eq_category(i, cat) for cat in std_equipment)]
    other_eq_counts = {}
    for i in other_eq_items:
        name = (i.other_category_name or i.item_name or "").strip()
        if name:
            other_eq_counts[name] = other_eq_counts.get(name, 0) + (i.quantity or 1)
    other_eq_summary = ", ".join(f"{name} ({qty})" for name, qty in other_eq_counts.items()) if other_eq_counts else ""

    o_c_ops = sum(i.quantity for i in other_eq_items if (i.is_central_office or str(i.office_location).lower() == "central office") and not i.is_end_of_life and str(getattr(i.status, "name", i.status)).upper() == "FUNCTIONAL")
    o_c_eol = sum(i.quantity for i in other_eq_items if (i.is_central_office or str(i.office_location).lower() == "central office") and (i.is_end_of_life or str(getattr(i.status, "name", i.status)).upper() == "CONDEMNED"))
    o_c_bak = sum(i.quantity for i in other_eq_items if (i.is_central_office or str(i.office_location).lower() == "central office") and i.is_backup)

    o_f_ops = sum(i.quantity for i in other_eq_items if not (i.is_central_office or str(i.office_location).lower() == "central office") and not i.is_end_of_life and str(getattr(i.status, "name", i.status)).upper() == "FUNCTIONAL")
    o_f_eol = sum(i.quantity for i in other_eq_items if not (i.is_central_office or str(i.office_location).lower() == "central office") and (i.is_end_of_life or str(getattr(i.status, "name", i.status)).upper() == "CONDEMNED"))
    o_f_bak = sum(i.quantity for i in other_eq_items if not (i.is_central_office or str(i.office_location).lower() == "central office") and i.is_backup)

    tot_c_ops += o_c_ops
    tot_c_eol += o_c_eol
    tot_c_bak += o_c_bak
    tot_f_ops += o_f_ops
    tot_f_eol += o_f_eol
    tot_f_bak += o_f_bak

    other_eq_title_ext = f'<br/><span style="font-size:7pt; font-style:italic; font-weight:normal; color:#475569;">({other_eq_summary})</span>' if other_eq_summary else ''

    eq_rows_html += f"""
    <tr>
        <td rowspan="3" class="bold" style="vertical-align:middle;">Others, please specify{other_eq_title_ext}</td>
        <td>Central Office</td>
        <td class="center font-mono">{o_c_ops}</td><td class="center font-mono">{o_c_eol}</td><td class="center font-mono">{o_c_bak}</td>
    </tr>
    <tr>
        <td>Field/Regional Office</td>
        <td class="center font-mono">{o_f_ops}</td><td class="center font-mono">{o_f_eol}</td><td class="center font-mono">{o_f_bak}</td>
    </tr>
    <tr class="band-sub">
        <td class="bold">Total</td>
        <td class="center font-mono bold">{o_c_ops + o_f_ops}</td><td class="center font-mono bold">{o_c_eol + o_f_eol}</td><td class="center font-mono bold">{o_c_bak + o_f_bak}</td>
    </tr>
    <tr class="band-band">
        <td rowspan="3" class="bold" style="vertical-align:middle;">Grand Total (ICT Equipment)</td>
        <td>Central Office Total</td>
        <td class="center font-mono bold">{tot_c_ops}</td><td class="center font-mono bold">{tot_c_eol}</td><td class="center font-mono bold">{tot_c_bak}</td>
    </tr>
    <tr class="band-band">
        <td>Field/Regional Office Total</td>
        <td class="center font-mono bold">{tot_f_ops}</td><td class="center font-mono bold">{tot_f_eol}</td><td class="center font-mono bold">{tot_f_bak}</td>
    </tr>
    <tr class="band-band" style="background:#cbd5e1;">
        <td class="bold">Consolidated Equipment Total</td>
        <td class="center font-mono bold">{tot_c_ops + tot_f_ops}</td><td class="center font-mono bold">{tot_c_eol + tot_f_eol}</td><td class="center font-mono bold">{tot_c_bak + tot_f_bak}</td>
    </tr>
    """

    std_software = [
        "Office Productivity Tool", 
        "Grammar checker", 
        "Graphics and Simulation Software", 
        "Antivirus", 
        "IT Help Desk Tool", 
        "Photo and Video Editing Software", 
        "Web Application Firewall"
    ]

    def match_sw_category(item, target_cat):
        if not item.is_software:
            return False
        cat_val = getattr(item, 'dict_category', None)
        if cat_val:
            val_str = getattr(cat_val, "value", str(cat_val))
            if val_str.strip().lower() == target_cat.strip().lower():
                return True
        inferred = infer_dict_category(item.item_name or "", True)
        return inferred.strip().lower() == target_cat.strip().lower()

    sw_rows_html = ""
    tot_c_perp = 0
    tot_c_sub = 0
    tot_f_perp = 0
    tot_f_sub = 0

    for scat in std_software:
        s_items = [i for i in inventory if match_sw_category(i, scat)]
        c_perp = sum(i.quantity for i in s_items if (i.is_central_office or str(i.office_location).lower() == "central office") and bool(i.is_perpetual))
        c_sub = sum(i.quantity for i in s_items if (i.is_central_office or str(i.office_location).lower() == "central office") and not i.is_perpetual)
        f_perp = sum(i.quantity for i in s_items if not (i.is_central_office or str(i.office_location).lower() == "central office") and bool(i.is_perpetual))
        f_sub = sum(i.quantity for i in s_items if not (i.is_central_office or str(i.office_location).lower() == "central office") and not i.is_perpetual)

        tot_c_perp += c_perp
        tot_c_sub += c_sub
        tot_f_perp += f_perp
        tot_f_sub += f_sub

        sw_rows_html += f"""
        <tr>
            <td rowspan="3" class="bold" style="vertical-align:middle;">{scat}</td>
            <td>Central Office</td>
            <td class="center font-mono">{c_perp}</td><td class="center font-mono">{c_sub}</td>
        </tr>
        <tr>
            <td>Field/Regional Office</td>
            <td class="center font-mono">{f_perp}</td><td class="center font-mono">{f_sub}</td>
        </tr>
        <tr class="band-sub">
            <td class="bold">Total</td>
            <td class="center font-mono bold">{c_perp + f_perp}</td><td class="center font-mono bold">{c_sub + f_sub}</td>
        </tr>
        """

    other_sw_items = [i for i in inventory if i.is_software and not any(match_sw_category(i, scat) for scat in std_software)]
    other_sw_counts = {}
    for i in other_sw_items:
        name = (i.other_category_name or i.item_name or "").strip()
        if name:
            other_sw_counts[name] = other_sw_counts.get(name, 0) + (i.quantity or 1)
    other_sw_summary = ", ".join(f"{name} ({qty})" for name, qty in other_sw_counts.items()) if other_sw_counts else ""

    o_sw_c_perp = sum(i.quantity for i in other_sw_items if (i.is_central_office or str(i.office_location).lower() == "central office") and bool(i.is_perpetual))
    o_sw_c_sub = sum(i.quantity for i in other_sw_items if (i.is_central_office or str(i.office_location).lower() == "central office") and not i.is_perpetual)
    o_sw_f_perp = sum(i.quantity for i in other_sw_items if not (i.is_central_office or str(i.office_location).lower() == "central office") and bool(i.is_perpetual))
    o_sw_f_sub = sum(i.quantity for i in other_sw_items if not (i.is_central_office or str(i.office_location).lower() == "central office") and not i.is_perpetual)

    tot_c_perp += o_sw_c_perp
    tot_c_sub += o_sw_c_sub
    tot_f_perp += o_sw_f_perp
    tot_f_sub += o_sw_f_sub

    other_sw_title_ext = f'<br/><span style="font-size:7pt; font-style:italic; font-weight:normal; color:#475569;">({other_sw_summary})</span>' if other_sw_summary else ''

    sw_rows_html += f"""
    <tr>
        <td rowspan="3" class="bold" style="vertical-align:middle;">Others, please specify{other_sw_title_ext}</td>
        <td>Central Office</td>
        <td class="center font-mono">{o_sw_c_perp}</td><td class="center font-mono">{o_sw_c_sub}</td>
    </tr>
    <tr>
        <td>Field/Regional Office</td>
        <td class="center font-mono">{o_sw_f_perp}</td><td class="center font-mono">{o_sw_f_sub}</td>
    </tr>
    <tr class="band-sub">
        <td class="bold">Total</td>
        <td class="center font-mono bold">{o_sw_c_perp + o_sw_f_perp}</td><td class="center font-mono bold">{o_sw_c_sub + o_sw_f_sub}</td>
    </tr>
    """

    annex1_html = f"""
    <div class="page-break" id="sec-annex1">
        <div class="section-header">ANNEX 1: EXISTING INFORMATION &amp; COMMUNICATIONS TECHNOLOGY (ICT) ASSET INVENTORY</div>
        <div class="sub-header">1. ICT Equipment Inventory</div>
        <table class="annex1-table">
            <thead><tr><th style="width:34%;">ICT RESOURCES</th><th style="width:26%;">OFFICE LOCATION</th><th class="center" style="width:13%;">OPERATIONAL</th><th class="center" style="width:14%;">END OF LIFE</th><th class="center" style="width:13%;">BACKUP</th></tr></thead>
            <tbody>{eq_rows_html}</tbody>
        </table>
    </div>

    <div class="page-break" id="sec-annex1">
        <div class="section-header">ANNEX 1: EXISTING INFORMATION &amp; COMMUNICATIONS TECHNOLOGY (ICT) ASSET INVENTORY (CONTINUED)</div>
        <div class="sub-header">2. ICT Software Inventory</div>
        <table class="annex1-table">
            <thead><tr><th style="width:40%;">ICT RESOURCES</th><th style="width:30%;">OFFICE LOCATION</th><th class="center" style="width:15%;">PERPETUAL</th><th class="center" style="width:15%;">SUBSCRIPTION</th></tr></thead>
            <tbody>{sw_rows_html}</tbody>
        </table>
    </div>
    """

    # --- 10. ANNEX 2: DRBCP ---
    drt_rows = "".join(f"""
        <tr>
            <td class="bold">{m.role}</td>
            <td>{m.responsibility}</td>
            <td class="bold">{clean_text(m.contact_person, 'Designated Officer')}{f' ({m.contact_details})' if m.contact_details else ''}</td>
        </tr>
    """ for m in dr_teams)

    real_bias = [
        b for b in dr_bias 
        if b.system_name and b.system_name.strip()
    ]

    bia_rows = "".join(f"""
        <tr>
            <td class="bold">{b.system_name}</td>
            <td>{b.classification}</td>
            <td class="center font-mono">{getattr(b, 'mtpd_hours', 24)}h</td>
            <td class="center bold font-mono" style="color:#1e3a8a;">{b.rto_hours}h</td>
            <td class="center bold font-mono" style="color:#0d9488;">{b.rpo_hours}h</td>
        </tr>
    """ for b in real_bias)

    dr_kpi_rows = "".join(f"""
        <tr><td class="bold">{k.indicator}</td><td class="bold">{k.target_metric}</td></tr>
    """ for k in dr_metrics)

    affected_assets_data = getattr(narrative, 'drbcp_affected_assets_json', None)
    affected_assets_items = []
    if affected_assets_data and isinstance(affected_assets_data, list):
        for a in affected_assets_data:
            if isinstance(a, dict) and a.get("asset_group"):
                grp = clean_text(str(a.get("asset_group")))
                dtls = clean_text(str(a.get("details", "")))
                if grp and dtls:
                    affected_assets_items.append(f"<li><strong>{grp}:</strong> {dtls}</li>")
            elif isinstance(a, str):
                clean_str = clean_text(a)
                if clean_str:
                    affected_assets_items.append(f"<li>{clean_str}</li>")

    affected_assets_html = "".join(affected_assets_items) if affected_assets_items else (
        "<li><strong>Primary Data Center (Central Office):</strong> Enterprise servers, SAN storage units, core network distribution switches.</li>"
        "<li><strong>Connectivity:</strong> Dedicated leased line fiber optic; redundant GovNet link.</li>"
        "<li><strong>Data Assets:</strong> Operational service registries, transactional databases, and digitized archival records.</li>"
        "<li><strong>Power Utilities:</strong> Standby automatic generator set and online rackmount UPS units.</li>"
    )

    dr_recovery_strategy_text = format_text_blocks(
        getattr(narrative, 'drbcp_recovery_strategy_text', None) or getattr(narrative, 'drbcp_recovery_strategy_html', None),
        "1. Off-site Backup Management: Daily encrypted database snapshots are transferred to a secure secondary facility located >30km away.\n"
        "2. Cloud Failover (GovCloud): Mission-critical public service, registry, and e-payment microservices are replicated in real time to DICT GovCloud.\n"
        "3. Redundancy: Dual-ISP providers configured in active-passive load distribution preventing single points of failure.\n"
        "4. Data Synchronization: Asynchronous database replication ensures an RPO limit of 1 hour during operational disruptions."
    )

    dr_sop_phases_text = format_text_blocks(
        getattr(narrative, 'drbcp_sop_phases_text', None) or getattr(narrative, 'drbcp_sop_phases_html', None),
        "Phase I: Detection and Declaration: Automated monitoring alerts evaluate disaster scale; Incident Commander activates DRBCP within 1 hour if localized RTO cannot be maintained.\n"
        "Phase II: Activation and Execution: DRT redirected to GovCloud DR standby instance; DNS records updated; clean database backups verified and mounted.\n"
        "Phase III: Failback (Normal Operations): Primary data center infrastructure restored; synchronize transactional state delta from DR site during off-peak maintenance window."
    )

    sec6_compliance_html = format_text_blocks(
        getattr(narrative, 'drbcp_compliance_narrative_text', None) or getattr(narrative, 'drbcp_compliance_narrative_html', None),
        "Cybersecurity Integration: Formal cyber-recovery procedures isolate compromised clusters and restore clean backups following ransomware or data-tampering events.\n"
        "Testing and Maintenance: Mandates at least one (1) full-scale DR simulation exercise per calendar year and semi-annual tabletop walkthroughs.\n"
        "Audit and Review: The DRBCP is formally reviewed annually or whenever a major infrastructure migration occurs.\n"
        "UACS and Budgeting: Funding for off-site storage, GovCloud mirror subscriptions, and standby infrastructure is categorized under Continuing Costs in Part IV of the ISSP."
    )

    drbcp_approval_date = clean_text(getattr(narrative, 'drbcp_approval_date', None), f"March 15, {start_year}")

    annex2_html = f"""
    <div class="page-break" id="sec-annex2">
        <div class="section-header">ANNEX 2: DISASTER RECOVERY AND BUSINESS CONTINUITY PLAN (DRBCP) FOR ICT RESOURCES</div>
        <p style="font-size:8pt; color:#475569; margin-bottom: 4px;">Governed under DICT Standards, ISO 22301, and MITHI Resolution 2025-01.</p>
        
        <div class="sub-header" style="margin-top: 4px;">1. Plan Overview &amp; Governance</div>
        <p style="margin:2px 0; font-size: 8pt;"><strong>Agency:</strong> {agency_name_clean} &nbsp;|&nbsp; <strong>Version:</strong> {narrative.issp_period}.1 &nbsp;|&nbsp; <strong>Approval Date:</strong> {drbcp_approval_date}</p>
        <table>
            <thead><tr><th style="width:25%;">Role</th><th style="width:45%;">Responsibility</th><th style="width:30%;">Contact</th></tr></thead>
            <tbody>{drt_rows or '<tr><td colspan="3" class="center">No DRT personnel configured.</td></tr>'}</tbody>
        </table>

        <div class="sub-header" style="margin-top:4px;">2. Business Impact Analysis (BIA) Summary</div>
        <table>
            <thead>
                <tr>
                    <th style="width:30%;">System Name</th>
                    <th style="width:25%;">Classification</th>
                    <th class="center" style="width:15%;">MTPD</th>
                    <th class="center" style="width:15%;">RTO</th>
                    <th class="center" style="width:15%;">RPO</th>
                </tr>
            </thead>
            <tbody>{bia_rows or '<tr><td colspan="5" class="center">No mission-critical systems evaluated for DRBCP.</td></tr>'}</tbody>
        </table>

        <div class="sub-header" style="margin-top:4px;">3. ICT Component Inventory &amp; Affected Assets</div>
        <ul style="font-size: 8pt; margin: 2px 0;">{affected_assets_html}</ul>

        <div class="sub-header" style="margin-top:4px;">4. Technical Recovery Strategy</div>
        <div style="font-size: 8pt; line-height: 1.35; margin-bottom: 6px;">{dr_recovery_strategy_text}</div>

        <div class="sub-header" style="margin-top:4px;">5. Standard Operating Procedures (SOP)</div>
        <div style="font-size: 8pt; line-height: 1.35; margin-bottom: 6px;">{dr_sop_phases_text}</div>

        <div class="sub-header" style="margin-top:4px;">6. Compliance, Scalability, and Sustainability (MITHI Resolution 2025-01 &amp; SPAR Reporting)</div>
        <div style="font-size: 8pt; line-height: 1.35; margin-bottom: 6px;">{sec6_compliance_html}</div>

        <div class="sub-header" style="margin-top:6px;">Key Performance Indicators (KPIs) for DRBCP</div>
        <table>
            <thead><tr><th style="width:50%;">Indicator</th><th style="width:50%;">Target Metric</th></tr></thead>
            <tbody>{dr_kpi_rows or '<tr><td colspan="2" class="center">No DR KPIs defined.</td></tr>'}</tbody>
        </table>
    </div>
    """

    return f"<!DOCTYPE html><html><head><meta charset='utf-8'><title>ISSP Compilation</title>{css}</head><body>{cover_html}{toc_html}{defs_html}{part1_html}{part2_html}{part3_html}{part4a_html}{part4b_html}{annex1_html}{annex2_html}</body></html>"
