# app/tasks/pdf_tasks.py
import io
import time
import logging
from decimal import Decimal
from typing import Optional, List, Dict, Any
from pathlib import Path
from celery.exceptions import SoftTimeLimitExceeded

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
    ProjectCategory,
    ExpenditureClass,
    FundSource,
    OfficeLocation,
    UacsObjectCode,
    SystemStatus,
    ProposalStatus,
    AssetStatus,
    ScopeChoice
)
from app.storage.s3_client import storage_client
from app.celery_app import celery_app
from app.utils.helpers import calculate_financial_summaries

logger = logging.getLogger(__name__)


def resolve_local_img_path(url: Optional[str]) -> Optional[str]:
    """Resolves S3 and remote URLs into base64 data URIs to ensure secure sandbox rendering."""
    if not url:
        return None
    normalized = url.strip().lower()
    if ".." in normalized or normalized.startswith("file://"):
        logger.warning(f"Security Block: Traversal or local file scheme prohibited: {url}")
        return None
    try:
        return storage_client.get_as_base64_uri(url)
    except Exception as e:
        logger.error(f"Image conversion failed for url {url}: {str(e)}")
        return url


def fmt_currency(val: Any) -> str:
    """Safely formats decimal currency values with Philippine Peso symbol."""
    if val is None:
        return "₱0.00"
    try:
        dec = Decimal(str(val))
        return f"₱{dec:,.2f}"
    except Exception:
        return "₱0.00"


@celery_app.task(
    bind=True, 
    name="app.tasks.pdf_tasks.compile_issp_document",
    time_limit=1800,       # 30 minutes hard limit watchdog for large documents
    soft_time_limit=1500   # 25 minutes soft limit
)
def compile_issp_document(self, metadata: dict):
    """
    Orchestrates the dynamic multi-pass compilation of the official DICT ISSP v.2026 PDF.
    Extracts all data dynamically from the relational database graph and enforces
    four-way financial parity down to the exact centavo across any arbitrary N-year span.
    """
    db = SessionLocal()
    try:
        issp_period = metadata.get("issp_period_years", "2026-2028")
        
        # Step 1: Pre-Compilation Singularity Graph Certification
        self.update_state(state="PROGRESS", meta={"progress": 15, "status": "Certifying graph singularity and legal linkages..."})
        ISSPSingularityEngine.validate_complete_issp_graph(db, issp_period)

        # Step 2: Compute Dynamic Parity Matrices
        self.update_state(state="PROGRESS", meta={"progress": 30, "status": "Asserting four-way financial parity..."})
        parity_data = calculate_financial_summaries(db, issp_period)
        if not parity_data["is_parity_valid"]:
            raise ValueError(
                f"FATAL MATHEMATICAL PARITY BREACH: Tables B.1, B.2, B.3, and B.4 do not reconcile!\n"
                f"Maximum Discrepancy: ₱{parity_data['parity_discrepancy']:,.2f}."
            )

        # Step 3: Query Relational Entities
        self.update_state(state="PROGRESS", meta={"progress": 45, "status": "Extracting certified graph artifacts..."})
        narrative = db.query(MasterNarrative).filter(MasterNarrative.issp_period == issp_period).first()
        if not narrative:
            raise ValueError(f"Active planning cycle '{issp_period}' is not configured in the database.")

        outcomes = db.query(OrganizationalOutcome).filter(OrganizationalOutcome.issp_period == issp_period).all()
        concerns = db.query(StrategicConcern).filter(StrategicConcern.issp_period == issp_period).order_by(StrategicConcern.order_index.asc()).all()
        systems = db.query(InformationSystem).filter(InformationSystem.issp_period == issp_period).all()
        projects = db.query(IctProject).filter(IctProject.issp_period == issp_period).all()
        items = db.query(Proposal).filter(
            Proposal.issp_period == issp_period,
            Proposal.status == ProposalStatus.APPROVED,
            (Proposal.is_archived == False) | (Proposal.is_archived.is_(None))
        ).all()
        inventory = db.query(ExistingInventory).all()
        human_capitals = db.query(HumanCapital).filter(HumanCapital.issp_period == issp_period).all()
        staff_positions = db.query(IctStaffPosition).filter(IctStaffPosition.issp_period == issp_period).all()
        stakeholders = db.query(StakeholderAnalysis).filter(StakeholderAnalysis.issp_period == issp_period).all()
        egov_checklists = db.query(EGovernmentChecklist).filter(EGovernmentChecklist.issp_period == issp_period).all()
        glossary = db.query(GlossaryTerm).order_by(GlossaryTerm.order_index.asc()).all()
        network_infra = db.query(NetworkInfrastructure).filter(NetworkInfrastructure.issp_period == issp_period).all()
        cyber_controls = db.query(CybersecurityControl).filter(CybersecurityControl.issp_period == issp_period).all()
        dr_teams = db.query(DisasterRecoveryTeam).filter(DisasterRecoveryTeam.issp_period == issp_period).all()
        dr_bias = db.query(BusinessImpactAnalysis).filter(BusinessImpactAnalysis.issp_period == issp_period).all()
        dr_metrics = db.query(DRBCPMetric).filter(DRBCPMetric.issp_period == issp_period).all()

        # Step 4: Generate Full Compliance HTML
        self.update_state(state="PROGRESS", meta={"progress": 65, "status": "Compiling dynamic DICT v.2026 HTML templates..."})
        html_content = generate_complete_issp_html(
            narrative, outcomes, concerns, systems, projects, items, inventory,
            human_capitals, staff_positions, stakeholders, egov_checklists,
            glossary, network_infra, cyber_controls, dr_teams, dr_bias, dr_metrics, parity_data
        )

        # Step 5: WeasyPrint Dual-Pass Compilation
        self.update_state(state="PROGRESS", meta={"progress": 80, "status": "Rendering PDF binary via layout engine..."})
        try:
            from weasyprint import HTML
        except OSError as os_err:
            raise RuntimeError(
                f"WeasyPrint OS shared libraries missing: {str(os_err)}. "
                "Ensure libpango-1.0-0, libcairo2, and libgobject-2.0-0 are installed."
            ) from os_err

        pdf_buffer = io.BytesIO()
        html_doc = HTML(string=html_content, base_url=str(Path(settings.LOCAL_UPLOAD_DIR).parent))
        html_doc.write_pdf(target=pdf_buffer)
        pdf_bytes = pdf_buffer.getvalue()

        # Step 6: Vault Storage
        self.update_state(state="PROGRESS", meta={"progress": 95, "status": "Archiving certified binary to secure storage..."})
        issp_id = f"ISSP-{issp_period}-FINAL"
        storage_client.upload_compiled_pdf(pdf_bytes, issp_id)
        download_url = storage_client.generate_download_url(storage_client.get_generated_pdf_key(issp_id))

        return {
            "status": "SUCCESS",
            "file_url": download_url,
            "certified_grand_total": str(parity_data["certified_grand_total"]),
            "issp_period": issp_period,
            "generated_at": time.strftime("%Y-%m-%d %H:%M:%S")
        }

    except SoftTimeLimitExceeded:
        db.rollback()
        logger.error("Celery timeout exceeded during PDF compilation.")
        raise Exception("CompilationError: Execution time limit exceeded.")
    except Exception as e:
        db.rollback()
        logger.error(f"Compilation failure: {str(e)}", exc_info=True)
        raise e
    finally:
        db.close()


def render_cybersecurity_checklist_table(controls_list: List[CybersecurityControl], is_proposed: bool = False) -> str:
    """
    Renders the official DICT 3-column cybersecurity control checklist (Pages 10 & 17).
    Columns: Security Domain | MANDATORY | OPTIONAL
    """
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
        domain_controls = [c for c in active_controls if (c.control_domain or "").strip().upper() == domain]
        
        mandatory = [c for c in domain_controls if c.is_mandatory]
        optional = [c for c in domain_controls if not c.is_mandatory]

        mand_html = "".join(
            f'<div style="margin: 2px 0;">{"[X]" if c.is_implemented else "[ ]"} {c.control_name}</div>'
            for c in mandatory
        ) if mandatory else '<span style="color:#94a3b8; font-style:italic;">No mandatory controls configured</span>'

        opt_html = "".join(
            f'<div style="margin: 2px 0;">{"[X]" if c.is_implemented else "[ ]"} {c.control_name}</div>'
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
    <table style="width: 100%; border-collapse: collapse; page-break-inside: avoid; break-inside: avoid; margin-top: 6px; margin-bottom: 14px;">
        <thead>
            <tr style="background:#f1f5f9;">
                <th style="width: 25%; text-align: left; padding: 6px 8px; border: 1px solid #334155;">Security Domain</th>
                <th style="width: 45%; text-align: left; padding: 6px 8px; border: 1px solid #334155;">MANDATORY</th>
                <th style="width: 30%; text-align: left; padding: 6px 8px; border: 1px solid #334155;">OPTIONAL</th>
            </tr>
        </thead>
        <tbody>
            {rows_html}
        </tbody>
    </table>
    """


def render_information_system_full_spec(s: InformationSystem, is_proposed: bool = False, custom_diagram_url: Optional[str] = None) -> str:
    """Renders the comprehensive 100% DICT-compliant specification card for an Information System."""
    classification_str = str(getattr(s.classification, "value", s.classification or "")).lower()
    is_frontline = "frontline" in classification_str
    hosting_str = getattr(s.hosting_type, "value", str(s.hosting_type or "Hybrid"))
    status_label = getattr(s.status, "value", str(s.status or "Operational"))
    enhancement_details = getattr(s, "enhancement_details", None)

    subsystem_diag_html = ""
    if custom_diagram_url:
        diag_src = resolve_local_img_path(custom_diagram_url)
        if diag_src:
            subsystem_diag_html = f"""
            <tr>
                <td class="bold">ARCHITECTURE LAYOUT</td>
                <td style="text-align: center;">
                    <img src="{diag_src}" style="max-height: 220px; max-width: 95%; border: 1px solid #cbd5e1; border-radius: 4px; margin: 6px 0;" />
                </td>
            </tr>
            """

    return f"""
    <table style="margin-bottom: 15px; page-break-inside: avoid; break-inside: avoid;">
        <tr class="band-band">
            <td colspan="2" style="font-size: 9.5pt;">{s.name}</td>
        </tr>
        <tr>
            <td style="width: 25%;" class="bold">CLASSIFICATION</td>
            <td>
                <div>{'[X]' if not is_frontline and 'support' in classification_str else '[ ]'} Support to Operations</div>
                <div>{'[X]' if 'administrative' in classification_str else '[ ]'} General Administrative Systems</div>
                <div>{'[X]' if is_frontline or 'operations' in classification_str else '[ ]'} Operations</div>
                <div style="margin-left: 15px; margin-top: 2px;">
                    <div>{'[X]' if is_frontline else '[ ]'} Frontline Service (directly used for public/client service delivery)</div>
                    <div style="margin-left: 15px;">
                        Identify if: &nbsp;
                        {'[X]' if hosting_str == 'Online' else '[ ]'} Online &nbsp;
                        {'[X]' if hosting_str == 'On-premise' else '[ ]'} On-premise &nbsp;
                        {'[X]' if hosting_str == 'Hybrid' else '[ ]'} Hybrid
                        {f'<span style="font-family:monospace; margin-left:8px;">(Link: {s.online_url})</span>' if s.online_url else ''}
                    </div>
                    <div>{'[X]' if not is_frontline and 'operations' in classification_str else '[ ]'} Non-Frontline Service (supports core mandate but not directly used by clients/public)</div>
                </div>
            </td>
        </tr>
        <tr>
            <td class="bold">DESCRIPTION & PURPOSE</td>
            <td style="text-align: justify;">{s.description_and_purpose}</td>
        </tr>
        {f'<tr><td class="bold">STATUS</td><td class="bold text-blue-700">{status_label}</td></tr>' if is_proposed else ''}
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
            <td class="bold">OWNER (OFFICE)</td>
            <td>{s.system_owner_office}</td>
        </tr>
        <tr>
            <td class="bold">INTEROPERABILITY</td>
            <td>
                <div>{'[X]' if s.is_integrated_with_others else '[ ]'} Integrated with another system</div>
                {f'<div style="margin-left:15px; font-size:8pt; color:#334155;">Internal Systems: {s.internal_integrated_systems or "None"} | External Systems: {s.external_integrated_systems or "None"}</div>' if s.is_integrated_with_others else ''}
                <div style="margin-left: 10px; margin-top: 3px;">
                    ● Generates data that is utilized by other system: <strong>{'YES' if s.generates_data_for_others else 'NO'}</strong><br/>
                    ● Processes data generated from other system: <strong>{'YES' if s.processes_data_from_others else 'NO'}</strong>
                </div>
                <div style="margin-top: 3px;">
                    {'[X]' if s.is_deployed_on_shared_platform else '[ ]'} Deployed on a shared platform (GovCloud / Common Server)
                </div>
            </td>
        </tr>
        <tr>
            <td class="bold">PRIVACY IMPACT ASSESSMENT (PIA)</td>
            <td>
                Processes personal information? &nbsp; <strong>{'[X] YES' if s.processes_personal_information else '[ ] NO'}</strong><br/>
                Undergone formal Privacy Impact Assessment? &nbsp; <strong>{'[X] YES' if s.has_undergone_pia else '[ ] NO'}</strong>
            </td>
        </tr>
        {subsystem_diag_html}
    </table>
    """


def generate_complete_issp_html(
    narrative: MasterNarrative,
    outcomes: List[OrganizationalOutcome],
    concerns: List[StrategicConcern],
    systems: List[InformationSystem],
    projects: List[IctProject],
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
    """Builds the complete, single-source HTML document strictly formatted for A4 Landscape across dynamic year horizons."""

    # 1. DYNAMIC PLANNING HORIZON DERIVATION
    if parity_data and parity_data.get("year_columns"):
        year_headers = parity_data.get("year_columns")
        years_range = []
        for yh in year_headers:
            digits = "".join(c for c in str(yh) if c.isdigit())
            if digits:
                years_range.append(int(digits))
    else:
        start_year_val = narrative.issp_period_from or 2026
        end_year_val = narrative.issp_period_to or (start_year_val + 2)
        years_range = list(range(start_year_val, end_year_val + 1))
        year_headers = [f"FY {y}" for y in years_range]

    start_year = years_range[0] if years_range else 2026
    end_year = years_range[-1] if years_range else 2028

    agency_logo = resolve_local_img_path(narrative.agency_logo_url) or ""
    dict_logo = resolve_local_img_path(getattr(narrative, "dict_logo_url", None)) or ""
    bp_logo = resolve_local_img_path(getattr(narrative, "bagong_pilipinas_logo_url", None)) or ""
    agency_name_clean = (narrative.agency_name or settings.DEFAULT_AGENCY_NAME).strip()
    agency_website_clean = (narrative.agency_website_url or settings.DEFAULT_AGENCY_WEBSITE).strip()

    # 2. BULLETPROOF CSS FOR WEASYPRINT (Block Layouts, Uniform Running Headers, Table Border Integrity)
    css = f"""
    <style>
        @page {{
            size: A4 landscape;
            margin: 0.8in 0.8in 0.8in 0.8in;
            @top-left {{
                content: "";
                background-image: url("{agency_logo or dict_logo}");
                background-size: contain;
                background-repeat: no-repeat;
                background-position: left center;
                height: 32px;
                width: 32px;
                border-bottom: 1px solid #cbd5e1;
                padding-bottom: 4px;
            }}
            @top-center {{
                content: "REPUBLIC OF THE PHILIPPINES\\A {agency_name_clean.upper()}";
                font-family: "Palatino Linotype", "Book Antiqua", Palatino, serif;
                font-size: 7.5pt;
                font-weight: bold;
                color: #1e293b;
                white-space: pre-wrap;
                text-align: left;
                border-bottom: 1px solid #cbd5e1;
                padding-bottom: 4px;
                padding-left: 8px;
                line-height: 1.25;
            }}
            @top-right {{
                content: "INFORMATION SYSTEMS STRATEGIC PLAN (ISSP)\\A {narrative.issp_period}";
                font-family: "Palatino Linotype", "Book Antiqua", Palatino, serif;
                font-size: 7.5pt;
                font-weight: bold;
                color: #1e3a8a;
                text-align: right;
                white-space: pre-wrap;
                border-bottom: 1px solid #cbd5e1;
                padding-bottom: 4px;
                line-height: 1.25;
            }}
            @bottom-right {{
                content: "Page " counter(page) " of " counter(pages);
                font-family: "Palatino Linotype", "Book Antiqua", Palatino, serif;
                font-size: 8pt;
                color: #64748b;
            }}
        }}

        @page cover_layout {{
            size: A4 landscape;
            margin: 0.8in 1in 0.8in 1in;
            @top-left {{ content: none; }}
            @top-center {{ content: none; }}
            @top-right {{ content: none; }}
            @bottom-right {{ content: none; }}
        }}

        .page-cover {{
            page: cover_layout;
            page-break-after: always;
            break-after: page;
        }}

        .page-break {{
            page-break-before: always;
            break-before: page;
        }}

        /* Block container ensuring full 100% width in WeasyPrint (Prevents vertical single-character text collapse) */
        .full-page-schematic {{
            page-break-inside: avoid;
            break-inside: avoid;
            text-align: center;
            width: 100%;
            display: block;
            margin: 12px 0;
            box-sizing: border-box;
            clear: both;
        }}

        .full-page-schematic .section-header {{
            width: 100%;
            text-align: left;
            display: block;
            margin-bottom: 4px;
        }}

        .full-page-schematic p {{
            width: 100%;
            text-align: left;
            display: block;
            margin-top: 0;
            margin-bottom: 6px;
        }}

        .schematic-img {{
            max-height: 480px;
            max-width: 100%;
            width: auto;
            height: auto;
            object-fit: contain;
            border: 1px solid #cbd5e1;
            border-radius: 6px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.05);
            margin: 8px auto;
            display: block;
        }}

        h1, h2, h3, h4, .section-header, .sub-header, .keep-with-next {{
            page-break-after: avoid;
            break-after: avoid;
        }}

        body {{
            font-family: "Palatino Linotype", "Book Antiqua", Palatino, serif;
            font-size: 10pt;
            line-height: 1.45;
            color: #0f172a;
            word-wrap: break-word;
            overflow-wrap: anywhere;
        }}

        table {{
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 14px;
            page-break-inside: auto;
        }}

        tr {{
            page-break-inside: avoid;
            break-inside: avoid;
            page-break-after: auto;
        }}

        thead {{
            display: table-header-group;
        }}

        tbody {{
            display: table-row-group;
        }}

        th, td {{
            border: 1px solid #334155;
            padding: 5px 7px;
            font-size: 8.5pt;
            vertical-align: top;
            word-break: break-word;
        }}

        th {{
            background-color: #f1f5f9;
            font-weight: bold;
            text-transform: uppercase;
            letter-spacing: 0.3px;
        }}

        .section-header {{
            font-size: 12pt;
            font-weight: bold;
            color: #1e3a8a;
            border-bottom: 2px solid #1e3a8a;
            padding-bottom: 4px;
            margin-bottom: 10px;
            text-transform: uppercase;
        }}

        .sub-header {{
            font-size: 9.5pt;
            font-weight: bold;
            color: #1e3a8a;
            margin-top: 10px;
            margin-bottom: 4px;
            text-transform: uppercase;
        }}

        .band-band {{ background-color: #e2e8f0; font-weight: bold; text-transform: uppercase; page-break-after: avoid; break-after: avoid; }}
        .band-sub {{ background-color: #f8fafc; font-style: italic; page-break-after: avoid; break-after: avoid; }}
        .right {{ text-align: right; }}
        .center {{ text-align: center; }}
        .bold {{ font-weight: bold; }}
        .font-mono {{ font-family: monospace; }}

        .toc-table {{ width: 100%; border: none; }}
        .toc-table td {{ border: none; padding: 2.5px 0; font-size: 8.5pt; }}
        .toc-entry {{ text-decoration: none; color: inherit; display: block; }}
        .toc-entry::after {{
            content: target-counter(attr(href), page);
            float: right;
            font-family: monospace;
            font-weight: bold;
        }}
    </style>
    """

    # --- 1. COVER PAGE: Official DICT + Bagong Pilipinas Co-Branding ---
    dict_header_logos = f"""
    <table style="width: 100%; border: none; margin-bottom: 12px; border-collapse: collapse;">
        <tr>
            <td style="width: 25%; border: none; text-align: left; vertical-align: middle;">
                {f'<img src="{dict_logo}" style="max-height: 55px;" />' if dict_logo else (f'<img src="{agency_logo}" style="max-height: 55px;" />' if agency_logo else '')}
            </td>
            <td style="width: 50%; border: none; text-align: center; vertical-align: middle;">
                <p style="font-size: 8.5pt; text-transform: uppercase; letter-spacing: 1.2px; margin: 0; color: #475569; line-height: 1.3;">
                    Republic of the Philippines<br/>
                    <strong style="color: #0f172a; font-size: 9.5pt;">{agency_name_clean.upper()}</strong>
                </p>
            </td>
            <td style="width: 25%; border: none; text-align: right; vertical-align: middle;">
                {f'<img src="{bp_logo}" style="max-height: 55px;" />' if bp_logo else ''}
            </td>
        </tr>
    </table>
    """

    scope_val = str(getattr(narrative.scope_choice, "value", narrative.scope_choice or ""))
    scope_json = narrative.scope_json or {}
    has_reg = bool(scope_json.get("with_regional_offices"))
    has_bur = bool(scope_json.get("with_bureaus"))
    is_amend = bool(getattr(narrative, "is_amendment", False))
    amend_num = getattr(narrative, "amendment_number", "1st") or "1st"

    cio_name = getattr(narrative, 'cio_name', None) or getattr(narrative, 'signatory_prepared_by', '')
    cio_title = getattr(narrative, 'cio_plantilla_position', None) or getattr(narrative, 'preparer_position', 'Chief Information Officer')
    head_name = getattr(narrative, 'head_of_agency_name', None) or getattr(narrative, 'signatory_approved_by', '')
    head_pos = getattr(narrative, 'agency_head_position', None) or settings.DEFAULT_AGENCY_HEAD_TITLE

    is_dept_wide = scope_val == "Department-Wide"
    is_dept_co = "Central Office / Head Office" in scope_val or is_dept_wide
    is_dept_co_only = is_dept_co and not has_reg and not has_bur
    is_agency_wide = "Agency-Wide" in scope_val
    is_agency_co_only = is_agency_wide and not has_reg
    is_other_gov = scope_val == "Other Government Entity"
    is_lgu = scope_val == "LGU"

    cover_html = f"""
    <div class="page-cover">
        {dict_header_logos}
        <div style="text-align: center; margin: 15px 0 10px 0; overflow-wrap: break-word; word-break: break-word;">
            {f'<div style="margin: 8px 0;"><img src="{agency_logo}" style="max-height: 75px; object-fit: contain;" /><p style="font-size: 8pt; color: #94a3b8; margin: 2px 0;">(Agency Official Seal)</p></div>' if agency_logo else ''}
            <h1 style="font-size: 19pt; font-weight: bold; color: #0f172a; margin: 4px 0; letter-spacing: 0.5px;">
                INFORMATION SYSTEMS STRATEGIC PLAN (ISSP)
            </h1>
            <div style="font-size: 10pt; font-weight: bold; margin: 6px 0;">
                {'[X]' if not is_amend else '[ ]'} REGULAR ISSP &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
                {'[X]' if is_amend else '[ ]'} AMENDMENT &lt;{amend_num}&gt;
            </div>
            <p style="font-size: 11pt; font-weight: bold; color: #1e3a8a; margin: 2px 0;">
                For the period {narrative.issp_period_from} to {narrative.issp_period_to}
            </p>
            <h2 style="font-size: 13.5pt; font-weight: bold; text-transform: uppercase; margin: 4px 0; color: #0f172a;">
                {agency_name_clean}
            </h2>
            <p style="font-size: 8.5pt; color: #64748b; font-family: monospace; margin: 0;">
                &lt;{agency_website_clean}&gt;
            </p>
        </div>

        <table style="width: 100%; border: none; margin-top: 25px; page-break-inside: avoid; border-collapse: collapse;">
            <tr>
                <td style="width: 50%; border: none; vertical-align: top; padding-right: 25px;">
                    <div style="margin-bottom: 35px;">
                        <strong style="text-transform: uppercase; color: #1e3a8a; font-size: 8.5pt; display: block; margin-bottom: 35px;">
                            PREPARED BY:
                        </strong>
                        <div style="border-top: 1px solid #334155; padding-top: 4px; width: 90%;">
                            <strong style="font-size: 10pt; display: block; word-break: break-all;">{cio_name}</strong>
                            <span style="font-size: 8.5pt; color: #334155; display: block; word-break: break-word;">{cio_title}</span>
                            <span style="font-size: 7.5pt; color: #64748b;">Name &amp; Signature of Chief Information Officer</span>
                        </div>
                    </div>

                    <div>
                        <strong style="text-transform: uppercase; color: #1e3a8a; font-size: 8.5pt; display: block; margin-bottom: 35px;">
                            APPROVED BY:
                        </strong>
                        <div style="border-top: 1px solid #334155; padding-top: 4px; width: 90%;">
                            <strong style="font-size: 10pt; display: block; word-break: break-all;">{head_name}</strong>
                            <span style="font-size: 8.5pt; color: #334155; display: block; word-break: break-word;">{head_pos}</span>
                            <span style="font-size: 7.5pt; color: #64748b;">Name &amp; Signature of Agency Head</span>
                        </div>
                    </div>
                </td>

                <td style="width: 50%; border: none; vertical-align: top;">
                    <div style="background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; padding: 12px 16px; font-size: 8.5pt; line-height: 1.6;">
                        <strong style="color: #1e3a8a; text-transform: uppercase; display: block; margin-bottom: 6px; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px;">
                            Scope of Plan
                        </strong>
                        <div>{'[X]' if is_dept_wide else '[ ]'} Department-Wide</div>
                        <div style="margin-left: 12px;">{'[X]' if is_dept_co else '[ ]'} Department - Central Office / Head Office</div>
                        <div style="margin-left: 24px;">{'[X]' if is_dept_co_only else '[ ]'} Central Office only</div>
                        <div style="margin-left: 24px;">{'[X]' if (is_dept_co and has_reg) else '[ ]'} With Regional Offices / Field Offices &nbsp;&nbsp; {'[X]' if (is_dept_co and has_bur) else '[ ]'} With Bureaus</div>
                        <div>{'[X]' if is_agency_wide else '[ ]'} Agency-Wide</div>
                        <div style="margin-left: 24px;">{'[X]' if is_agency_co_only else '[ ]'} Central Office only</div>
                        <div style="margin-left: 24px;">{'[X]' if (is_agency_wide and has_reg) else '[ ]'} With Regional Offices / Field Offices</div>
                        <div style="margin-left: 24px;">{'[X]' if is_other_gov else '[ ]'} Other Government Entity</div>
                        <div>{'[X]' if is_lgu else '[ ]'} LGU</div>
                    </div>
                </td>
            </tr>
        </table>
    </div>
    """

    # --- 2. TABLE OF CONTENTS ---
    part4a_toc_rows = "".join(
        f'<tr><td style="padding-left: 15px;"><a href="#sec-part4-a{idx+1}" class="toc-entry">A.{idx+1}. Detailed Resource Deployment and Cost Breakdown - [FY {yr}]</a></td></tr>'
        for idx, yr in enumerate(years_range)
    )

    toc_html = f"""
    <div id="sec-toc">
        <div class="section-header">TABLE OF CONTENTS</div>
        <table class="toc-table">
            <tbody>
                <tr><td><a href="#sec-defs" class="toc-entry bold">DEFINITION OF TERMS</a></td></tr>
                <tr><td><a href="#sec-part1" class="toc-entry bold">PART I. AGENCY PROFILE & STRATEGIC CONTEXT</a></td></tr>
                <tr><td style="padding-left: 15px;"><a href="#sec-part1-a" class="toc-entry">A. Mandate, Vision, Mission, and Organizational Outcome</a></td></tr>
                <tr><td style="padding-left: 15px;"><a href="#sec-part1-b" class="toc-entry">B. Organizational Structure</a></td></tr>
                <tr><td style="padding-left: 15px;"><a href="#sec-part1-c" class="toc-entry">C. Stakeholder Analysis</a></td></tr>
                <tr><td><a href="#sec-part2" class="toc-entry bold">PART II. CURRENT ICT ASSESSMENT</a></td></tr>
                <tr><td style="padding-left: 15px;"><a href="#sec-part2-a" class="toc-entry">A. Strategic Concerns for ICT Use</a></td></tr>
                <tr><td style="padding-left: 15px;"><a href="#sec-part2-b" class="toc-entry">B. Existing Network Infrastructure & Cybersecurity Controls</a></td></tr>
                <tr><td style="padding-left: 15px;"><a href="#sec-part2-c" class="toc-entry">C. Existing/Operational Information Systems (IS) Inventory</a></td></tr>
                <tr><td style="padding-left: 15px;"><a href="#sec-part2-d" class="toc-entry">D. E-Government Programs (EGP) Checklist</a></td></tr>
                <tr><td><a href="#sec-part3" class="toc-entry bold">PART III. PROPOSED ICT STRATEGY</a></td></tr>
                <tr><td style="padding-left: 15px;"><a href="#sec-part3-a" class="toc-entry">A. Proposed Network Infrastructure & Cybersecurity Controls</a></td></tr>
                <tr><td style="padding-left: 15px;"><a href="#sec-part3-b" class="toc-entry">B. Enterprise Architecture</a></td></tr>
                <tr><td style="padding-left: 15px;"><a href="#sec-part3-c" class="toc-entry">C. Proposed ICT Human Capital</a></td></tr>
                <tr><td style="padding-left: 15px;"><a href="#sec-part3-d" class="toc-entry">D. Proposed Information Systems</a></td></tr>
                <tr><td style="padding-left: 15px;"><a href="#sec-part3-e" class="toc-entry bold">E. ICT Projects</a></td></tr>
                <tr><td style="padding-left: 25px;"><a href="#sec-part3-e1" class="toc-entry">E.1. Internal ICT Projects</a></td></tr>
                <tr><td style="padding-left: 25px;"><a href="#sec-part3-e2" class="toc-entry">E.2. Cross-Agency ICT Projects</a></td></tr>
                <tr><td style="padding-left: 15px;"><a href="#sec-part3-f" class="toc-entry bold">F. Performance Measurement Framework</a></td></tr>
                <tr><td style="padding-left: 25px;"><a href="#sec-part3-f1" class="toc-entry">F.1. Internal ICT Projects</a></td></tr>
                <tr><td style="padding-left: 25px;"><a href="#sec-part3-f2" class="toc-entry">F.2. Cross-Agency ICT Projects</a></td></tr>
                <tr><td><a href="#sec-part4" class="toc-entry bold">PART IV. RESOURCE REQUIREMENTS</a></td></tr>
                {part4a_toc_rows}
                <tr><td style="padding-left: 15px;"><a href="#sec-part4-b" class="toc-entry">B. Summary of Investments (Four-Way Parity)</a></td></tr>
                <tr><td><a href="#sec-annex1" class="toc-entry bold">ANNEX 1: EXISTING INFORMATION & COMMUNICATIONS TECHNOLOGY (ICT) ASSET INVENTORY</a></td></tr>
                <tr><td><a href="#sec-annex2" class="toc-entry bold">ANNEX 2: DISASTER RECOVERY AND BUSINESS CONTINUITY PLAN (DRBCP)</a></td></tr>
            </tbody>
        </table>
    </div>
    """

    # --- 3. DEFINITION OF TERMS ---
    defs_rows = "".join(f"""
        <tr>
            <td class="bold" style="width: 25%;">{g.term}</td>
            <td style="text-align: justify;">{g.definition}</td>
        </tr>
    """ for g in glossary)
    defs_html = f"""
    <div class="page-break" id="sec-defs">
        <div class="section-header">DEFINITION OF TERMS</div>
        <table>
            <thead><tr><th style="width:25%;">Terms</th><th>Definition</th></tr></thead>
            <tbody>{defs_rows or '<tr><td colspan="2" class="center">No glossary entries registered.</td></tr>'}</tbody>
        </table>
    </div>
    """

    # --- 4. PART I: AGENCY PROFILE & STRATEGIC CONTEXT ---
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
            <td class="bold">{s.stakeholder_group}</td>
            <td><strong>INCOMING:</strong> {s.transaction_processed_incoming or 'N/A'}<br/><strong>OUTGOING:</strong> {s.transaction_processed_outgoing or 'N/A'}</td>
            <td class="center bold">{getattr(s, 'complexity_incoming', getattr(s, 'incoming_complexity', 'Simple'))}</td>
            <td class="center bold">{getattr(s, 'complexity_outgoing', getattr(s, 'outgoing_complexity', 'Simple'))}</td>
        </tr>
    """ for s in stakeholders)

    outcomes_html = "".join(
        f"<li><strong>[{oo.type_label}] {getattr(oo, 'outcome_name', getattr(oo, 'program_name', ''))}:</strong> {oo.description or ''}</li>"
        for oo in outcomes
    )

    # In-Section Placement: Agency Organizational Structure Hierarchy (Part I.B)
    org_chart_diagram = resolve_local_img_path(narrative.org_chart_url)
    org_chart_block = f"""
    <div class="full-page-schematic" style="margin: 10px 0;">
        <div class="section-header" style="width: 100%; text-align: left;">PART I.B: AGENCY ORGANIZATIONAL STRUCTURE HIERARCHY</div>
        <p style="font-size: 8.5pt; color: #475569; margin-bottom: 6px; text-align: left; width: 100%;">Administrative structure and organizational placement of the ICT Management Service within the agency hierarchy.</p>
        <img src="{org_chart_diagram}" class="schematic-img" style="max-height: 480px;" />
    </div>
    """ if org_chart_diagram else ""

    part1_html = f"""
    <div class="page-break" id="sec-part1">
        <div class="section-header">PART I. AGENCY PROFILE & STRATEGIC CONTEXT</div>
        <div class="sub-header" id="sec-part1-a">A. Mandate, Vision, Mission, and Organizational Outcome</div>
        <p><strong>A.1. Mandate:</strong></p>
        <p style="text-align: justify;"><strong>Legal Basis:</strong> {narrative.mandate_html or ''}</p>
        <p style="text-align: justify;"><strong>Function:</strong> {narrative.functions or ''}</p>
        <p><strong>A.2. Vision Statement:</strong> {narrative.vision_html or ''}</p>
        <p><strong>A.3. Mission Statement:</strong> {narrative.mission_html or ''}</p>
        <p><strong>A.4. Organizational Outcomes:</strong></p>
        <ul>{outcomes_html or '<li>No organizational outcomes mapped.</li>'}</ul>

        <div class="sub-header" id="sec-part1-b" style="margin-top: 15px;">B. Organizational Structure</div>
        
        <table style="width: 100%; border: none; margin-bottom: 12px; page-break-inside: avoid;">
            <tr>
                <td style="width: 50%; border: 1px solid #cbd5e1; border-radius: 4px; padding: 8px 12px; background: #f8fafc; font-size: 8.5pt;">
                    <strong style="color: #1e3a8a; text-transform: uppercase; display: block; margin-bottom: 4px;">B.1. Chief Information Officer (CIO)</strong>
                    <div>● <strong>Name of CIO:</strong> {cio_name}</div>
                    <div>● <strong>Plantilla Position:</strong> {cio_title}</div>
                    <div>● <strong>Organizational Unit:</strong> {narrative.cio_organizational_unit or 'ICT Management Office'}</div>
                    <div>● <strong>E-mail Address:</strong> {narrative.preparer_email or ''}</div>
                    <div>● <strong>Contact Number/s:</strong> {narrative.preparer_tel or ''}</div>
                </td>
                <td style="width: 50%; border: 1px solid #cbd5e1; border-radius: 4px; padding: 8px 12px; background: #f8fafc; font-size: 8.5pt;">
                    <strong style="color: #1e3a8a; text-transform: uppercase; display: block; margin-bottom: 4px;">Alternate ISSP Focal Person</strong>
                    <div>● <strong>Name of ISSP Focal:</strong> {narrative.focal_name or 'N/A'}</div>
                    <div>● <strong>Position:</strong> {narrative.focal_position or 'N/A'}</div>
                    <div>● <strong>Organizational Unit:</strong> {narrative.focal_organizational_unit or 'N/A'}</div>
                    <div>● <strong>E-mail Address:</strong> {narrative.focal_email or 'N/A'}</div>
                    <div>● <strong>Contact Number/s:</strong> {narrative.focal_contact_no or 'N/A'}</div>
                </td>
            </tr>
        </table>

        <div class="sub-header" style="margin-top: 10px;">B.2. Human Capital</div>
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

        {org_chart_block}

        <div class="sub-header" id="sec-part1-c" style="margin-top: 15px;">C. Stakeholder Analysis</div>
        <table>
            <thead><tr><th style="width:25%;">Stakeholders</th><th style="width:45%;">Transaction Processed</th><th class="center" style="width:15%;">Incoming Complexity</th><th class="center" style="width:15%;">Outgoing Complexity</th></tr></thead>
            <tbody>{stakeholders_rows or '<tr><td colspan="4" class="center">No stakeholder transactions recorded.</td></tr>'}</tbody>
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

    # Render Network Infrastructure (II.B.1)
    existing_infra = [n for n in network_infra if not n.is_proposed]
    infra_ii_b_cards = []
    rendered_existing_diagrams = set()

    for n in existing_infra:
        diag_html = ""
        if n.diagram_url:
            diag_src = resolve_local_img_path(n.diagram_url)
            if diag_src and diag_src not in rendered_existing_diagrams:
                diag_html = f'<div style="text-align:center; margin:8px 0;"><img src="{diag_src}" style="max-height:220px; max-width:95%; border:1px solid #cbd5e1; border-radius:4px;" /></div>'
                rendered_existing_diagrams.add(diag_src)

        infra_ii_b_cards.append(f"""
        <div style="background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 4px; padding: 8px 12px; margin-bottom: 10px; font-size: 8.5pt; page-break-inside: avoid;">
            <div>
                <strong>Site / Office:</strong> {n.office_location or 'Central Office'} &nbsp;|&nbsp;
                <strong>Connectivity Type:</strong> {n.connectivity_type} &nbsp;|&nbsp;
                <strong>Bandwidth:</strong> {n.bandwidth_mbps} Mbps &nbsp;|&nbsp;
                <strong>Upload Speed:</strong> {getattr(n, 'upload_speed_mbps', n.bandwidth_mbps)} Mbps &nbsp;|&nbsp;
                <strong>Download Speed:</strong> {getattr(n, 'download_speed_mbps', n.bandwidth_mbps)} Mbps &nbsp;|&nbsp;
                <strong>IPv6 Ready:</strong> {'Yes' if n.is_ipv6_ready else 'No'}
            </div>
            <p style="margin: 4px 0;"><strong>Architecture Topology Description:</strong> {n.topology_description}</p>
            {diag_html}
        </div>
        """)

    infra_ii_b_html = "".join(infra_ii_b_cards)

    # In-Section Placement: Existing Network Infrastructure Topology (Part II.B.1)
    existing_net_diagram = resolve_local_img_path(narrative.network_diagram_url)
    existing_net_block = f"""
    <div class="full-page-schematic" style="margin: 10px 0;">
        <div class="section-header" style="width: 100%; text-align: left;">PART II.B.1: EXISTING NETWORK INFRASTRUCTURE TOPOLOGY</div>
        <p style="font-size: 8.5pt; color: #475569; margin-bottom: 6px; text-align: left; width: 100%;">Physical and logical LAN/WAN topology across central headquarters, perimeter security, and remote branches.</p>
        <img src="{existing_net_diagram}" class="schematic-img" style="max-height: 480px;" />
    </div>
    """ if existing_net_diagram else ""

    cyber_ii_b_table = render_cybersecurity_checklist_table(cyber_controls, is_proposed=False)
    
    # DICT v.2026 Page 14 Alignment:
    # Systems that are either "Operational" or "For Enhancement" are existing systems in the agency's current inventory.
    existing_systems = [
        s for s in systems 
        if getattr(s.status, 'value', str(s.status or '')).lower().strip() in ["operational", "for enhancement"]
        or getattr(s.status, 'name', '').lower().strip() in ["operational", "for_enhancement"]
    ]
    
    sys_ii_c_html = "".join(
        render_information_system_full_spec(
            s, 
            is_proposed=False,
            custom_diagram_url=narrative.get_subsystem_layout(s.name) if hasattr(narrative, 'get_subsystem_layout') else None
        ) for s in existing_systems
    )

    # 9-Initiative E-Government Checklist
    def render_egov_row(prog_name: str, display_title: str) -> str:
        item = next((e for e in egov_checklists if prog_name.lower() in e.program_name.lower()), None)
        is_used = item.is_utilized if item else False
        url_text = (item.url_or_system_name or '') if item else ''
        equiv = (item.equivalent_system_details or '') if item else ''
        ratio = getattr(item, 'adoption_ratio', '') if item else ''
        conn = getattr(item, 'is_connected_to_portal', False) if item else False

        if prog_name == "pnpki":
            return f"""
            <tr>
                <td class="bold">3. GOVERNMENT PUBLIC KEY INFRASTRUCTURE (PKI) PROGRAM</td>
                <td colspan="2">
                    Ratio of active PNPKI certificates over total employees: &nbsp;
                    <strong>{ratio or 'Not reported'}</strong>
                </td>
            </tr>
            """
        elif prog_name == "portal":
            channels = getattr(item, 'channels_json', []) or []
            return f"""
            <tr>
                <td class="bold">6. ONLINE PUBLIC SERVICE PORTAL</td>
                <td>
                    Consumer assistance / feedback channels in-place:<br/>
                    {'[X]' if 'website' in str(channels).lower() else '[ ]'} Website &nbsp;&nbsp;
                    {'[X]' if 'email' in str(channels).lower() else '[ ]'} Email &nbsp;&nbsp;
                    {'[X]' if 'landline' in str(channels).lower() else '[ ]'} Landline &nbsp;&nbsp;
                    {'[X]' if 'mobile' in str(channels).lower() else '[ ]'} Mobile &nbsp;&nbsp;
                    {'[X]' if 'social' in str(channels).lower() else '[ ]'} Social Media
                </td>
                <td>
                    Connected with online public service portals?<br/>
                    <strong>{'[X] YES' if conn else '[ ] NO'}</strong>
                </td>
            </tr>
            """
        elif prog_name == "records":
            return f"""
            <tr>
                <td class="bold">8. RECORDS AND KNOWLEDGE MANAGEMENT IS</td>
                <td>Existing repository present? <strong>{'[X] YES' if is_used else '[ ] NO'}</strong></td>
                <td>{f'System Name: <strong>{url_text or equiv}</strong>' if is_used else 'Manual processing in place'}</td>
            </tr>
            """
        elif prog_name == "continuity":
            return f"""
            <tr>
                <td class="bold">9. PUBLIC SERVICE CONTINUITY PLAN (PSCP)</td>
                <td colspan="2">Existing Public Service Continuity Plan approved? <strong>{'[X] YES' if is_used else '[ ] NO'}</strong> {f'({equiv})' if equiv else ''}</td>
            </tr>
            """
        else:
            return f"""
            <tr>
                <td class="bold" style="width: 30%;">{display_title}</td>
                <td style="width: 35%;">
                    Utilized? &nbsp; <strong>{'[X] YES' if is_used else '[ ] NO'}</strong><br/>
                    {f'<span class="font-mono" style="font-size:8pt;">URL: {url_text}</span>' if is_used and url_text else ''}
                </td>
                <td style="width: 35%;">
                    {'[X] Using equivalent system' if not is_used and equiv else '[ ] Manual transaction' if not is_used else '[X] Implemented'}<br/>
                    {f'<span style="font-size:8pt; color:#334155;">Details: {equiv}</span>' if equiv else ''}
                </td>
            </tr>
            """

    egov_html = f"""
    <table>
        <thead>
            <tr>
                <th style="width: 30%;">Initiative / System</th>
                <th style="width: 35%;">Adoption Status</th>
                <th style="width: 35%;">Details / Equivalent Platform</th>
            </tr>
        </thead>
        <tbody>
            {render_egov_row("elgu", "1. ELECTRONIC LOCAL GOVERNMENT UNIT (ELGU) SYSTEM")}
            {render_egov_row("egovpay", "2. GOVERNMENT DIGITAL PAYMENT SYSTEM (eGovPay)")}
            {render_egov_row("pnpki", "3. GOVERNMENT PUBLIC KEY INFRASTRUCTURE (PKI) PROGRAM")}
            {render_egov_row("hcmis", "4. HUMAN CAPITAL MANAGEMENT INFORMATION SYSTEM (HCMIS)")}
            {render_egov_row("ifmis", "5. INTEGRATED FINANCIAL MANAGEMENT IS (IFMIS)")}
            {render_egov_row("portal", "6. ONLINE PUBLIC SERVICE PORTAL")}
            {render_egov_row("philgeps", "7. PHILIPPINE GOVT PROCUREMENT SYSTEM (PhilGEPS)")}
            {render_egov_row("records", "8. RECORDS AND KNOWLEDGE MANAGEMENT IS")}
            {render_egov_row("continuity", "9. PUBLIC SERVICE CONTINUITY PLAN (PSCP)")}
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

        <div class="sub-header" id="sec-part2-b" style="margin-top: 15px;">B. Existing Network Infrastructure & Cybersecurity Controls</div>
        <p class="keep-with-next"><strong>B.1. LAN/WAN set-up including Connectivity Type and Bandwidth:</strong></p>
        {infra_ii_b_html or '<p style="font-style:italic; color:#64748b;">No network infrastructure registered.</p>'}
        {existing_net_block}

        <p class="keep-with-next" style="margin-top: 10px;"><strong>B.2. Cybersecurity Control Checklist:</strong></p>
        {cyber_ii_b_table}

        <div class="sub-header" id="sec-part2-c" style="margin-top: 15px;">C. Existing/Operational Information Systems (IS) Inventory</div>
        {sys_ii_c_html or '<p style="font-style:italic; color:#64748b;">No operational information systems cataloged.</p>'}

        <div class="sub-header" id="sec-part2-d" style="margin-top: 15px;">D. E-Government Programs (EGP) Checklist</div>
        {egov_html}
    </div>
    """

    # --- 6. PART III: PROPOSED ICT STRATEGY ---
    # Render Proposed Network (III.A.1)
    proposed_infra = [n for n in network_infra if n.is_proposed]
    infra_iii_a_cards = []
    rendered_proposed_diagrams = set()

    for n in proposed_infra:
        diag_html = ""
        if n.diagram_url:
            diag_src = resolve_local_img_path(n.diagram_url)
            if diag_src and diag_src not in rendered_proposed_diagrams:
                diag_html = f'<div style="text-align:center; margin:8px 0;"><img src="{diag_src}" style="max-height:220px; max-width:95%; border:1px solid #cbd5e1; border-radius:4px;" /></div>'
                rendered_proposed_diagrams.add(diag_src)

        infra_iii_a_cards.append(f"""
        <div style="background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 4px; padding: 8px 12px; margin-bottom: 10px; font-size: 8.5pt; page-break-inside: avoid;">
            <div>
                <strong>Deployment Site:</strong> {n.office_location or 'Central Office'} &nbsp;|&nbsp;
                <strong>Connectivity Type:</strong> {n.connectivity_type} &nbsp;|&nbsp;
                <strong>Target Bandwidth:</strong> {n.bandwidth_mbps} Mbps &nbsp;|&nbsp;
                <strong>Upload Speed:</strong> {getattr(n, 'upload_speed_mbps', n.bandwidth_mbps)} Mbps &nbsp;|&nbsp;
                <strong>Download Speed:</strong> {getattr(n, 'download_speed_mbps', n.bandwidth_mbps)} Mbps &nbsp;|&nbsp;
                <strong>IPv6 Ready:</strong> {'Yes' if n.is_ipv6_ready else 'No'}
            </div>
            <p style="margin: 4px 0;"><strong>Proposed Architecture Topology:</strong> {n.topology_description}</p>
            {diag_html}
        </div>
        """)

    infra_iii_a_html = "".join(infra_iii_a_cards)

    # In-Section Placement: Proposed Network & Fiber Backbone (Part III.A.1)
    proposed_net_diagram = resolve_local_img_path(narrative.fiber_backbone_url)
    proposed_net_block = f"""
    <div class="full-page-schematic" style="margin: 10px 0;">
        <div class="section-header" style="width: 100%; text-align: left;">PART III.A.1: PROPOSED NETWORK INFRASTRUCTURE &amp; FIBER BACKBONE</div>
        <p style="font-size: 8.5pt; color: #475569; margin-bottom: 6px; text-align: left; width: 100%;">High-speed fiber backbone routing, SD-WAN failover, and GovCloud hybrid interconnectivity architecture.</p>
        <img src="{proposed_net_diagram}" class="schematic-img" style="max-height: 480px;" />
    </div>
    """ if proposed_net_diagram else ""

    cyber_iii_a_table = render_cybersecurity_checklist_table(cyber_controls, is_proposed=True)
    
    # In-Section Placement: Enterprise Architecture Schematic (Part III.B)
    ea_diagram = resolve_local_img_path(narrative.system_architecture_url or narrative.conceptual_framework_url)
    ea_block = f"""
    <div class="full-page-schematic" style="margin: 10px 0;">
        <div class="section-header" style="width: 100%; text-align: left;">PART III.B: ENTERPRISE ARCHITECTURE SCHEMATIC &amp; LOGICAL TOPOLOGY</div>
        <p style="font-size: 8.5pt; color: #475569; margin-bottom: 6px; text-align: left; width: 100%;">Target GovCloud microservices, PeGIF API gateways, and National Government Data Exchange (NGDX) pipelines.</p>
        <img src="{ea_diagram}" class="schematic-img" style="max-height: 480px;" />
    </div>
    """ if ea_diagram else ""

    ea_narrative_text = narrative.enterprise_architecture_narrative or ""

    staff_rows = "".join(f"""
        <tr>
            <td class="bold">{pos.position_title}</td>
            <td>{pos.status}</td>
            <td class="center font-mono bold">{pos.count}</td>
        </tr>
    """ for pos in staff_positions)
    total_staff_count = sum(pos.count for pos in staff_positions)

    # In-Section Placement: Proposed ICT Organizational Structure (Part III.C)
    proposed_ict_org_diagram = resolve_local_img_path(narrative.proposed_ict_org_url)
    proposed_ict_org_block = f"""
    <div class="full-page-schematic" style="margin: 10px 0;">
        <div class="section-header" style="width: 100%; text-align: left;">PART III.C: PROPOSED ICT HUMAN CAPITAL ORGANIZATIONAL STRUCTURE</div>
        <p style="font-size: 8.5pt; color: #475569; margin-bottom: 6px; text-align: left; width: 100%;">Proposed specialized divisions, technical reporting lines, and capacity augmentation hierarchy.</p>
        <img src="{proposed_ict_org_diagram}" class="schematic-img" style="max-height: 480px;" />
    </div>
    """ if proposed_ict_org_diagram else ""

    proposed_systems = [
        s for s in systems 
        if getattr(s.status, 'value', str(s.status or '')).lower().strip() != "operational"
        and getattr(s.status, 'name', '').lower().strip() != "operational"
    ]
    
    sys_iii_d_html = "".join(
        render_information_system_full_spec(
            s, 
            is_proposed=True,
            custom_diagram_url=narrative.get_subsystem_layout(s.name) if hasattr(narrative, 'get_subsystem_layout') else None
        ) for s in proposed_systems
    )

    internal_projs = [p for p in projects if "cross" not in str(p.project_category).lower()]
    cross_projs = [p for p in projects if "cross" in str(p.project_category).lower()]

    def render_project_card(proj: IctProject, is_cross: bool = False) -> str:
        p_start = getattr(proj, 'duration_start_year', None) or start_year
        p_end = getattr(proj, 'duration_end_year', None) or end_year
        p_years = list(range(p_start, p_end + 1)) if p_end >= p_start else [p_start]
        fund_str = getattr(proj.funding_source, 'value', str(proj.funding_source))
        aligns_others_text = f" ({proj.aligns_others_specify})" if getattr(proj, 'aligns_others', False) and getattr(proj, 'aligns_others_specify', None) else ""

        col_width_pct = int(100 / max(1, len(p_years)))
        annual_map = getattr(proj, "annual_deliverables", None) or {}
        if isinstance(annual_map, str):
            try:
                import json
                annual_map = json.loads(annual_map)
            except Exception:
                annual_map = {}

        milestone_ths = ""
        milestone_tds = ""
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

            milestone_ths += f'<th style="width: {col_width_pct}%;">Year {idx + 1} Milestones (FY {yr})</th>'
            milestone_tds += f'<td>{m_text or "N/A"}</td>'

        return f"""
        <div style="border: 1px solid #334155; padding: 12px; margin-bottom: 15px; background-color: #f8fafc; border-radius: 4px; page-break-inside: avoid; break-inside: avoid;">
            <div style="font-size: 11pt; font-weight: bold; color: #1e3a8a; margin-bottom: 4px;">{proj.project_title}</div>
            <p style="margin: 2px 0;"><strong>Description:</strong> {proj.description}</p>
            <p style="margin: 2px 0;"><strong>Objectives:</strong> {proj.objectives}</p>
            
            <div style="display: flex; gap: 20px; margin: 6px 0; background: #ffffff; padding: 6px 10px; border: 1px solid #e2e8f0; border-radius: 4px;">
                <div style="width: 50%;">
                    <strong style="color: #1e3a8a; font-size: 8pt; text-transform: uppercase;">Strategic Alignment:</strong>
                    <div style="font-size: 8pt; margin-top: 2px;">
                        {'[X]' if proj.aligns_pip else '[ ]'} Public Investment Program (PIP)<br/>
                        {'[X]' if proj.aligns_ncsp else '[ ]'} National Cybersecurity Plan (NCSP)<br/>
                        {'[X]' if proj.aligns_egmp else '[ ]'} E-Government Master Plan (EGMP)<br/>
                        {'[X]' if proj.aligns_pcb else '[ ]'} Program Convergence Budgeting (PCB)<br/>
                        {'[X]' if getattr(proj, 'aligns_others', False) else '[ ]'} Others{aligns_others_text}
                    </div>
                </div>
                <div style="width: 50%;">
                    <strong style="color: #1e3a8a; font-size: 8pt; text-transform: uppercase;">Harmonization Framework:</strong>
                    <div style="font-size: 8pt; margin-top: 2px;">
                        {'[X]' if proj.harmonizes_national_priority else '[ ]'} National Prioritization<br/>
                        {'[X]' if proj.harmonizes_resource_optimization else '[ ]'} Resource Optimization<br/>
                        {'[X]' if proj.harmonizes_pegif else '[ ]'} Interoperability Framework (PeGIF)<br/>
                        {'[X]' if proj.harmonizes_cross_collaboration else '[ ]'} Cross-Agency Collaboration<br/>
                        {'[X]' if proj.harmonizes_scalability else '[ ]'} Scalability and Sustainability
                    </div>
                </div>
            </div>

            <p style="margin: 3px 0; font-size: 8.5pt;">
                <strong>Duration:</strong> {p_start} to {p_end} &nbsp;|&nbsp;
                <strong>Implementing Unit:</strong> {proj.implementing_unit} &nbsp;|&nbsp;
                <strong>Funding Source:</strong> {fund_str} &nbsp;|&nbsp;
                <strong>Total Project Cost:</strong> <span class="font-mono bold">{fmt_currency(proj.computed_total_project_cost)}</span>
            </p>
            {f'<p style="margin: 2px 0; font-size: 8.5pt;"><strong>Lead Agency:</strong> {proj.lead_agency} &nbsp;|&nbsp; <strong>Partner Agencies:</strong> {proj.partner_agencies}</p>' if is_cross else ''}

            <table style="margin: 8px 0;">
                <thead>
                    <tr>
                        {milestone_ths}
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        {milestone_tds}
                    </tr>
                </tbody>
            </table>
        </div>
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
            <div style="margin-bottom: 12px; page-break-inside: avoid; break-inside: avoid;">
                <strong style="color: #1e3a8a; font-size: 9.5pt;">ICT Project: {p.project_title}</strong>
                <table style="margin-top: 4px;">
                    <thead>
                        <tr>
                            <th style="width:16%;">HIERARCHY OF RESULTS</th>
                            <th style="width:30%;">KEY PERFORMANCE INDICATORS (KPIS)</th>
                            <th class="center" style="width:12%;">BASELINE</th>
                            <th class="center" style="width:12%;">TARGETS</th>
                            <th style="width:15%;">COLLECTION METHODS</th>
                            <th style="width:15%;">RESPONSIBILITY</th>
                        </tr>
                    </thead>
                    <tbody>{rows or '<tr><td colspan="6" class="center">No KPIs defined for this project.</td></tr>'}</tbody>
                </table>
            </div>
            """
        return tables_html or '<p style="font-style:italic; color:#64748b;">No projects cataloged.</p>'

    part3_html = f"""
    <div class="page-break" id="sec-part3">
        <div class="section-header">PART III. PROPOSED ICT STRATEGY</div>
        <div class="sub-header" id="sec-part3-a">A. Proposed Network Infrastructure & Cybersecurity Controls</div>
        <p class="keep-with-next"><strong>A.1. Proposed LAN/WAN Set-up:</strong></p>
        {infra_iii_a_html or '<p style="font-style:italic; color:#64748b;">No proposed network expansions logged.</p>'}
        {proposed_net_block}

        <p class="keep-with-next" style="margin-top: 10px;"><strong>A.2. Proposed Cybersecurity Control Checklist:</strong></p>
        {cyber_iii_a_table}

        <div class="sub-header" id="sec-part3-b" style="margin-top: 15px;">B. Enterprise Architecture</div>
        <div style="margin-bottom: 12px; page-break-inside: avoid;">
            <p style="text-align: justify; font-size: 9pt;">{ea_narrative_text}</p>
        </div>
        {ea_block}

        <div class="sub-header" id="sec-part3-c" style="margin-top: 15px;">C. Proposed ICT Human Capital</div>
        <table>
            <thead><tr><th style="width:50%;">IT POSITION</th><th style="width:30%;">EMPLOYMENT STATUS</th><th class="center" style="width:20%;">PHYSICAL COUNT</th></tr></thead>
            <tbody>
                {staff_rows or '<tr><td colspan="3" class="center">No proposed staffing positions logged.</td></tr>'}
                <tr class="band-band"><td colspan="2" class="bold">Grand Total</td><td class="center font-mono bold">{total_staff_count}</td></tr>
            </tbody>
        </table>
        {proposed_ict_org_block}

        <div class="sub-header" id="sec-part3-d" style="margin-top: 15px;">D. Proposed Information Systems</div>
        {sys_iii_d_html or '<p style="font-style:italic; color:#64748b;">No proposed systems logged.</p>'}

        <div class="sub-header" id="sec-part3-e" style="margin-top: 15px;">E. ICT Projects</div>
        <p id="sec-part3-e1" class="keep-with-next"><strong>E.1. INTERNAL ICT PROJECTS:</strong></p>
        {"".join(render_project_card(p, is_cross=False) for p in internal_projs) or '<p style="font-style:italic; color:#64748b;">No internal projects logged.</p>'}

        <p id="sec-part3-e2" class="keep-with-next" style="margin-top: 12px;"><strong>E.2. CROSS-AGENCY ICT PROJECTS:</strong></p>
        {"".join(render_project_card(p, is_cross=True) for p in cross_projs) or '<p style="font-style:italic; color:#64748b;">No cross-agency projects logged.</p>'}

        <div class="sub-header" id="sec-part3-f" style="margin-top: 15px;">F. Performance Measurement Framework</div>
        <p id="sec-part3-f1" class="keep-with-next"><strong>F.1. INTERNAL ICT PROJECTS:</strong></p>
        {render_pmf_table(internal_projs)}

        <p id="sec-part3-f2" class="keep-with-next" style="margin-top: 10px;"><strong>F.2. CROSS-AGENCY ICT PROJECTS:</strong></p>
        {render_pmf_table(cross_projs)}
    </div>
    """

    # --- 7. PART IV.A: DETAILED RESOURCE DEPLOYMENT ---
    def render_part_iv_a_table(year_index: int, cal_year: int, target_sec_id: str):
        yr_str = f"FY {cal_year}"
        rows = ""
        year_total = Decimal("0.00")

        for cat in ProjectCategory:
            cat_items = []
            for itm in items:
                itm_cat_val = getattr(itm.strategic_category, 'value', str(itm.strategic_category or '')).strip()
                if itm_cat_val == cat.value or itm.strategic_category == cat:
                    qty = 0
                    if itm.yearly_quantities and isinstance(itm.yearly_quantities, dict):
                        qty = int(itm.yearly_quantities.get(str(cal_year), 0) or 0)
                        if qty == 0 and cal_year in itm.yearly_quantities:
                            qty = int(itm.yearly_quantities.get(cal_year, 0) or 0)
                        if qty == 0:
                            qty = int(itm.yearly_quantities.get(f"Year {year_index}", 0) or 0)
                    elif cal_year == start_year:
                        qty = itm.year_1_qty or 0
                    elif cal_year == start_year + 1:
                        qty = itm.year_2_qty or 0
                    elif cal_year == start_year + 2:
                        qty = itm.year_3_qty or 0
                    
                    if qty > 0:
                        cat_items.append((itm, qty))

            if not cat_items:
                continue

            cat_subtotal = sum(Decimal(q) * itm.unit_cost for itm, q in cat_items)
            rows += f"""
            <tr class="band-band">
                <td colspan="5" class="bold">{cat.value.upper()}</td>
                <td class="right font-mono bold">{fmt_currency(cat_subtotal)}</td>
            </tr>
            """

            if cat in [ProjectCategory.INTERNAL_ICT_PROJECT, ProjectCategory.CROSS_AGENCY_ICT_PROJECT]:
                project_ids = []
                seen_pids = set()
                has_unlinked = False
                for itm, _ in cat_items:
                    if itm.project_id:
                        if itm.project_id not in seen_pids:
                            seen_pids.add(itm.project_id)
                            project_ids.append(itm.project_id)
                    else:
                        has_unlinked = True

                for pid in project_ids:
                    p_obj = next((p for p in projects if p.id == pid or str(p.id) == str(pid)), None)
                    p_title = p_obj.project_title if p_obj else f"Project ID: {pid}"
                    p_items = [(itm, q) for itm, q in cat_items if itm.project_id == pid or str(itm.project_id) == str(pid)]
                    p_subtotal = sum(Decimal(q) * itm.unit_cost for itm, q in p_items)

                    rows += f"""
                    <tr style="background:#f1f5f9; font-weight:bold; page-break-after: avoid;">
                        <td colspan="5" style="padding-left:15px; color:#1e3a8a;">[{p_title.upper()}]</td>
                        <td class="right font-mono">{fmt_currency(p_subtotal)}</td>
                    </tr>
                    """

                    for exp_class in ExpenditureClass:
                        exp_items = [(itm, q) for itm, q in p_items if (getattr(itm.expenditure_class, 'value', str(itm.expenditure_class)) == exp_class.value or itm.expenditure_class == exp_class)]
                        if not exp_items:
                            continue
                        exp_subtotal = sum(Decimal(q) * itm.unit_cost for itm, q in exp_items)
                        rows += f"""
                        <tr class="band-sub">
                            <td colspan="5" style="padding-left:25px;" class="bold">{exp_class.value.upper()}</td>
                            <td class="right font-mono bold">{fmt_currency(exp_subtotal)}</td>
                        </tr>
                        """

                        uacs_seen = set()
                        uacs_codes = []
                        for itm, _ in exp_items:
                            code_val = getattr(itm.uacs_object_code, 'value', str(itm.uacs_object_code or ''))
                            if code_val not in uacs_seen:
                                uacs_seen.add(code_val)
                                uacs_codes.append(itm.uacs_object_code)

                        for ucode in uacs_codes:
                            code_val = getattr(ucode, 'value', str(ucode or ''))
                            u_items = [(itm, q) for itm, q in exp_items if (getattr(itm.uacs_object_code, 'value', str(itm.uacs_object_code)) == code_val or itm.uacs_object_code == ucode)]
                            u_subtotal = sum(Decimal(q) * itm.unit_cost for itm, q in u_items)

                            rows += f"""
                            <tr style="background:#ffffff; font-weight:bold; page-break-after: avoid;">
                                <td colspan="5" style="padding-left:35px; color:#475569;">[{code_val}]</td>
                                <td class="right font-mono">{fmt_currency(u_subtotal)}</td>
                            </tr>
                            """

                            for itm, qty in u_items:
                                line_cost = Decimal(qty) * itm.unit_cost
                                year_total += line_cost
                                deploy_office = itm.target_office_automated or getattr(itm.department, 'name', '') or getattr(itm.office_location, 'value', str(itm.office_location))
                                fund_val = getattr(itm.fund_source, 'value', str(itm.fund_source))
                                in_house_flag = getattr(itm, 'created_by_students', False) or getattr(itm, 'is_in_house_turnover', False)
                                in_house_tag = " [In-House / Non-Commercial Asset]" if in_house_flag else ""
                                
                                rows += f"""
                                <tr>
                                    <td style="padding-left:45px;">{itm.item_name}{in_house_tag}</td>
                                    <td>{deploy_office}</td>
                                    <td>{fund_val}</td>
                                    <td class="right font-mono">{fmt_currency(itm.unit_cost)}</td>
                                    <td class="center font-mono bold" style="white-space: nowrap;">{qty}</td>
                                    <td class="right font-mono bold">{fmt_currency(line_cost)}</td>
                                </tr>
                                """

                if has_unlinked:
                    unlinked_items = [(itm, q) for itm, q in cat_items if not itm.project_id]
                    unlinked_subtotal = sum(Decimal(q) * itm.unit_cost for itm, q in unlinked_items)
                    rows += f"""
                    <tr style="background:#f1f5f9; font-weight:bold; page-break-after: avoid;">
                        <td colspan="5" style="padding-left:15px; color:#1e3a8a;">[OTHER / GENERAL INITIATIVES]</td>
                        <td class="right font-mono">{fmt_currency(unlinked_subtotal)}</td>
                    </tr>
                    """

                    for exp_class in ExpenditureClass:
                        exp_items = [(itm, q) for itm, q in unlinked_items if (getattr(itm.expenditure_class, 'value', str(itm.expenditure_class)) == exp_class.value or itm.expenditure_class == exp_class)]
                        if not exp_items:
                            continue
                        exp_subtotal = sum(Decimal(q) * itm.unit_cost for itm, q in exp_items)
                        rows += f"""
                        <tr class="band-sub">
                            <td colspan="5" style="padding-left:25px;" class="bold">{exp_class.value.upper()}</td>
                            <td class="right font-mono bold">{fmt_currency(exp_subtotal)}</td>
                        </tr>
                        """

                        uacs_seen = set()
                        uacs_codes = []
                        for itm, _ in exp_items:
                            code_val = getattr(itm.uacs_object_code, 'value', str(itm.uacs_object_code or ''))
                            if code_val not in uacs_seen:
                                uacs_seen.add(code_val)
                                uacs_codes.append(itm.uacs_object_code)

                        for ucode in uacs_codes:
                            code_val = getattr(ucode, 'value', str(ucode or ''))
                            u_items = [(itm, q) for itm, q in exp_items if (getattr(itm.uacs_object_code, 'value', str(itm.uacs_object_code)) == code_val or itm.uacs_object_code == ucode)]
                            u_subtotal = sum(Decimal(q) * itm.unit_cost for itm, q in u_items)

                            rows += f"""
                            <tr style="background:#ffffff; font-weight:bold; page-break-after: avoid;">
                                <td colspan="5" style="padding-left:35px; color:#475569;">[{code_val}]</td>
                                <td class="right font-mono">{fmt_currency(u_subtotal)}</td>
                            </tr>
                            """

                            for itm, qty in u_items:
                                line_cost = Decimal(qty) * itm.unit_cost
                                year_total += line_cost
                                deploy_office = itm.target_office_automated or getattr(itm.department, 'name', '') or getattr(itm.office_location, 'value', str(itm.office_location))
                                fund_val = getattr(itm.fund_source, 'value', str(itm.fund_source))
                                in_house_flag = getattr(itm, 'created_by_students', False) or getattr(itm, 'is_in_house_turnover', False)
                                in_house_tag = " [In-House / Non-Commercial Asset]" if in_house_flag else ""
                                
                                rows += f"""
                                <tr>
                                    <td style="padding-left:45px;">{itm.item_name}{in_house_tag}</td>
                                    <td>{deploy_office}</td>
                                    <td>{fund_val}</td>
                                    <td class="right font-mono">{fmt_currency(itm.unit_cost)}</td>
                                    <td class="center font-mono bold" style="white-space: nowrap;">{qty}</td>
                                    <td class="right font-mono bold">{fmt_currency(line_cost)}</td>
                                </tr>
                                """
            else:
                for exp_class in ExpenditureClass:
                    exp_items = [(itm, q) for itm, q in cat_items if (getattr(itm.expenditure_class, 'value', str(itm.expenditure_class)) == exp_class.value or itm.expenditure_class == exp_class)]
                    if not exp_items:
                        continue
                    exp_subtotal = sum(Decimal(q) * itm.unit_cost for itm, q in exp_items)
                    rows += f"""
                    <tr class="band-sub">
                        <td colspan="5" style="padding-left:15px;" class="bold">{exp_class.value.upper()}</td>
                        <td class="right font-mono bold">{fmt_currency(exp_subtotal)}</td>
                    </tr>
                    """

                    uacs_seen = set()
                    uacs_codes = []
                    for itm, _ in exp_items:
                        code_val = getattr(itm.uacs_object_code, 'value', str(itm.uacs_object_code or ''))
                        if code_val not in uacs_seen:
                            uacs_seen.add(code_val)
                            uacs_codes.append(itm.uacs_object_code)

                    for ucode in uacs_codes:
                        code_val = getattr(ucode, 'value', str(ucode or ''))
                        u_items = [(itm, q) for itm, q in exp_items if (getattr(itm.uacs_object_code, 'value', str(itm.uacs_object_code)) == code_val or itm.uacs_object_code == ucode)]
                        u_subtotal = sum(Decimal(q) * itm.unit_cost for itm, q in u_items)

                        rows += f"""
                        <tr style="background:#ffffff; font-weight:bold; page-break-after: avoid;">
                            <td colspan="5" style="padding-left:25px; color:#475569;">[{code_val}]</td>
                            <td class="right font-mono">{fmt_currency(u_subtotal)}</td>
                        </tr>
                        """

                        for itm, qty in u_items:
                            line_cost = Decimal(qty) * itm.unit_cost
                            year_total += line_cost
                            deploy_office = itm.target_office_automated or getattr(itm.department, 'name', '') or getattr(itm.office_location, 'value', str(itm.office_location))
                            fund_val = getattr(itm.fund_source, 'value', str(itm.fund_source))
                            in_house_flag = getattr(itm, 'created_by_students', False) or getattr(itm, 'is_in_house_turnover', False)
                            in_house_tag = " [In-House / Non-Commercial Asset]" if in_house_flag else ""
                            
                            rows += f"""
                            <tr>
                                <td style="padding-left:35px;">{itm.item_name}{in_house_tag}</td>
                                <td>{deploy_office}</td>
                                <td>{fund_val}</td>
                                <td class="right font-mono">{fmt_currency(itm.unit_cost)}</td>
                                <td class="center font-mono bold" style="white-space: nowrap;">{qty}</td>
                                <td class="right font-mono bold">{fmt_currency(line_cost)}</td>
                            </tr>
                            """

        return f"""
        <div class="page-break" id="{target_sec_id}">
            <div class="section-header">PART IV. RESOURCE REQUIREMENTS</div>
            <div class="sub-header">A.{year_index}. Detailed Resource Deployment and Cost Breakdown - [{yr_str}]</div>
            <table>
                <thead>
                    <tr>
                        <th style="width:30%;">ITEM</th>
                        <th style="width:18%;">OFFICE LOCATION (DEPLOYMENT)</th>
                        <th style="width:18%;">FUND SOURCE</th>
                        <th class="right" style="width:11%;">UNIT COST</th>
                        <th class="center" style="width:11%; white-space: nowrap;">PHYSICAL TARGET</th>
                        <th class="right" style="width:12%; white-space: nowrap;">TOTAL COST</th>
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
            <p style="font-size: 8pt; font-style: italic; margin-top: 6px; color: #475569;">
                *All costs indicated in this section are based on the market research conducted by {agency_name_clean}
            </p>
        </div>
        """

    part4a_html = "".join(
        render_part_iv_a_table(idx + 1, yr, f"sec-part4-a{idx + 1}")
        for idx, yr in enumerate(years_range)
    )

    # --- 8. PART IV.B: SUMMARY OF INVESTMENTS ---
    def render_matrix_table(title: str, matrix_dict: dict):
        col_headers_th = "".join(f'<th class="right" style="width:12%;">{y}</th>' for y in year_headers)
        table_rows = ""
        for key, row_vals in matrix_dict.items():
            is_grand = (key == "GRAND TOTAL")
            style = 'style="background:#e2e8f0; font-weight:bold;"' if is_grand else ""
            cells_td = "".join(f'<td class="right font-mono">{fmt_currency(row_vals.get(y, 0))}</td>' for y in year_headers)

            table_rows += f"""
            <tr {style}>
                <td class="bold">{key}</td>
                {cells_td}
                <td class="right font-mono bold">{fmt_currency(row_vals.get('Total', 0))}</td>
            </tr>
            """
        return f"""
        <div style="margin-top: 15px; page-break-inside: avoid; break-inside: avoid;">
            <div class="bold" style="font-size: 9.5pt; color: #1e3a8a; margin-bottom: 4px;">{title}</div>
            <table>
                <thead><tr><th style="width:36%;">Category / Classification</th>{col_headers_th}<th class="right font-bold" style="width:15%;">Total Amount (PHP)</th></tr></thead>
                <tbody>{table_rows}</tbody>
            </table>
        </div>
        """

    part4b_html = f"""
    <div class="page-break" id="sec-part4-b">
        <div class="section-header">PART IV.B: SUMMARY OF INVESTMENTS (FINANCIAL CERTIFICATION)</div>
        <p style="font-size: 8.5pt; color: #475569;">
            In strict compliance with DBM guidelines, the Grand Total across General Summary (B.1),
            Fund Source (B.2), Statement of Expenditure (B.3), and Object of Expenditure (B.4) are identical down to the centavo across all {len(years_range)} planning years.
        </p>
        {render_matrix_table("B.1. GENERAL SUMMARY", parity_data["b1_general_summary"])}
        {render_matrix_table("B.2. FUND SOURCE", parity_data["b2_fund_source"])}
    </div>
    <div class="page-break">
        <div class="section-header">PART IV.B: SUMMARY OF INVESTMENTS (CONTINUED)</div>
        {render_matrix_table("B.3. STATEMENT OF EXPENDITURE", parity_data["b3_statement_of_expenditure"])}
        {render_matrix_table("B.4. OBJECT OF EXPENDITURE (UACS ACCOUNT CODES)", parity_data["b4_object_of_expenditure"])}
        <div style="margin-top: 25px; padding: 12px; background: #ecfdf5; border: 1px solid #10b981; border-radius: 4px; text-align: center; page-break-inside: avoid;">
            <span class="bold" style="color: #047857; font-size: 11pt;">
                ★ CERTIFIED BALANCED: Total Multi-Year Strategic Investment is {fmt_currency(parity_data['certified_grand_total'])} ★
            </span>
        </div>
    </div>
    """

    # --- 9. ANNEX 1: STRICT CATEGORIZATION & 5-COLUMN ALIGNMENT ---
    std_equipment = ["Servers", "Desktop", "Laptop", "Mobile Phone", "Tablet", "Printer", "Network Switch"]

    def match_eq_category(item, target_cat):
        if item.is_software:
            return False
        cat_val = getattr(item, 'dict_category', None)
        if cat_val:
            val_str = getattr(cat_val, "value", str(cat_val))
            return val_str.strip().lower() == target_cat.strip().lower()
        name_clean = (item.item_name or "").strip().lower()
        return target_cat.lower() in name_clean

    eq_rows_html = ""
    for cat in std_equipment:
        c_items = [i for i in inventory if match_eq_category(i, cat)]
        
        c_ops = sum(i.quantity for i in c_items if i.is_central_office and not i.is_end_of_life and getattr(i.status, "name", str(i.status)).upper() == "FUNCTIONAL")
        c_eol = sum(i.quantity for i in c_items if i.is_central_office and (i.is_end_of_life or getattr(i.status, "name", str(i.status)).upper() == "CONDEMNED"))
        c_bak = sum(i.quantity for i in c_items if i.is_central_office and i.is_backup)

        f_ops = sum(i.quantity for i in c_items if not i.is_central_office and not i.is_end_of_life and getattr(i.status, "name", str(i.status)).upper() == "FUNCTIONAL")
        f_eol = sum(i.quantity for i in c_items if not i.is_central_office and (i.is_end_of_life or getattr(i.status, "name", str(i.status)).upper() == "CONDEMNED"))
        f_bak = sum(i.quantity for i in c_items if not i.is_central_office and i.is_backup)

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
    other_eq_summary = ", ".join(f"{i.other_category_name or i.item_name} ({i.quantity})" for i in other_eq_items) if other_eq_items else ""

    o_c_ops = sum(i.quantity for i in other_eq_items if i.is_central_office and not i.is_end_of_life and getattr(i.status, "name", str(i.status)).upper() == "FUNCTIONAL")
    o_c_eol = sum(i.quantity for i in other_eq_items if i.is_central_office and (i.is_end_of_life or getattr(i.status, "name", str(i.status)).upper() == "CONDEMNED"))
    o_c_bak = sum(i.quantity for i in other_eq_items if i.is_central_office and i.is_backup)

    o_f_ops = sum(i.quantity for i in other_eq_items if not i.is_central_office and not i.is_end_of_life and getattr(i.status, "name", str(i.status)).upper() == "FUNCTIONAL")
    o_f_eol = sum(i.quantity for i in other_eq_items if not i.is_central_office and (i.is_end_of_life or getattr(i.status, "name", str(i.status)).upper() == "CONDEMNED"))
    o_f_bak = sum(i.quantity for i in other_eq_items if not i.is_central_office and i.is_backup)

    other_eq_title_ext = f'<br/><span style="font-size:7.5pt; font-style:italic; font-weight:normal; color:#475569;">({other_eq_summary})</span>' if other_eq_summary else ''

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
    """

    std_software = ["Office Productivity Tool", "Grammar checker", "Graphics and Simulation Software", "Antivirus", "IT Help Desk Tool", "Photo and Video Editing Software", "Web Application Firewall"]

    def match_sw_category(item, target_cat):
        if not item.is_software:
            return False
        cat_val = getattr(item, 'dict_category', None)
        if cat_val:
            val_str = getattr(cat_val, "value", str(cat_val))
            return val_str.strip().lower() == target_cat.strip().lower()
        name_clean = (item.item_name or "").strip().lower()
        return target_cat.lower() in name_clean

    sw_rows_html = ""
    for scat in std_software:
        s_items = [i for i in inventory if match_sw_category(i, scat)]
        c_perp = sum(i.quantity for i in s_items if i.is_central_office and i.is_perpetual)
        c_sub = sum(i.quantity for i in s_items if i.is_central_office and not i.is_perpetual)
        f_perp = sum(i.quantity for i in s_items if not i.is_central_office and i.is_perpetual)
        f_sub = sum(i.quantity for i in s_items if not i.is_central_office and not i.is_perpetual)

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
    other_sw_summary = ", ".join(f"{i.other_category_name or i.item_name} ({i.quantity})" for i in other_sw_items) if other_sw_items else ""

    o_sw_c_perp = sum(i.quantity for i in other_sw_items if i.is_central_office and i.is_perpetual)
    o_sw_c_sub = sum(i.quantity for i in other_sw_items if i.is_central_office and not i.is_perpetual)
    o_sw_f_perp = sum(i.quantity for i in other_sw_items if not i.is_central_office and i.is_perpetual)
    o_sw_f_sub = sum(i.quantity for i in other_sw_items if not i.is_central_office and not i.is_perpetual)

    other_sw_title_ext = f'<br/><span style="font-size:7.5pt; font-style:italic; font-weight:normal; color:#475569;">({other_sw_summary})</span>' if other_sw_summary else ''

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
        <div class="section-header">ANNEX 1: EXISTING INFORMATION & COMMUNICATIONS TECHNOLOGY (ICT) ASSET INVENTORY</div>
        <div class="sub-header">1. ICT Equipment Inventory</div>
        <table>
            <thead><tr><th style="width:30%;">ICT RESOURCES</th><th style="width:30%;">OFFICE LOCATION</th><th class="center" style="width:13%;">OPERATIONAL</th><th class="center" style="width:14%;">END OF LIFE</th><th class="center" style="width:13%;">BACKUP</th></tr></thead>
            <tbody>{eq_rows_html}</tbody>
        </table>

        <div class="sub-header" style="margin-top: 15px;">2. ICT Software Inventory</div>
        <table>
            <thead><tr><th style="width:40%;">ICT RESOURCES</th><th style="width:30%;">OFFICE LOCATION</th><th class="center" style="width:15%;">PERPETUAL</th><th class="center" style="width:15%;">SUBSCRIPTION</th></tr></thead>
            <tbody>{sw_rows_html}</tbody>
        </table>
    </div>
    """

    # --- 10. ANNEX 2: DYNAMIC DRBCP (SECTIONS 1 TO 6 COMPLETE) ---
    drt_rows = "".join(f"""
        <tr>
            <td class="bold">{m.role}</td>
            <td>{m.responsibility}</td>
            <td class="bold">{m.contact_person} ({m.contact_details})</td>
        </tr>
    """ for m in dr_teams)

    bia_rows = "".join(f"""
        <tr>
            <td class="bold">{b.system_name}</td>
            <td>{b.classification}</td>
            <td class="center font-mono">{getattr(b, 'mtpd_hours', 24)}h</td>
            <td class="center bold font-mono" style="color:#1e3a8a;">{b.rto_hours}h</td>
            <td class="center bold font-mono" style="color:#0d9488;">{b.rpo_hours}h</td>
        </tr>
    """ for b in dr_bias)

    dr_kpi_rows = "".join(f"""
        <tr><td class="bold">{k.indicator}</td><td class="bold">{k.target_metric}</td></tr>
    """ for k in dr_metrics)

    affected_assets_data = getattr(narrative, 'drbcp_affected_assets_json', None)
    if affected_assets_data and isinstance(affected_assets_data, list) and len(affected_assets_data) > 0:
        affected_assets_html = "".join(
            f"<li><strong>{a.get('asset_group', 'Component')}:</strong> {a.get('details', '')}</li>"
            if isinstance(a, dict) else f"<li>{a}</li>"
            for a in affected_assets_data
        )
    else:
        affected_assets_html = "<li>None recorded. Configure affected components in the Narrative Studio.</li>"

    dr_recovery_strategy_text = narrative.drbcp_recovery_strategy_html or "<p>Configure technical recovery strategy in the Narrative Studio.</p>"
    dr_sop_phases_text = narrative.drbcp_sop_phases_html or "<p>Configure SOP response phases in the Narrative Studio.</p>"

    sec6_compliance_html = getattr(narrative, 'drbcp_compliance_narrative_html', None)
    if not sec6_compliance_html or len(sec6_compliance_html.strip()) < 10:
        sec6_compliance_html = """
        <ul style="font-size: 8.5pt; line-height: 1.6; margin-bottom: 10px;">
            <li><strong>Cybersecurity Integration:</strong> Formal cyber-incident response and ransomware recovery procedures are established to sanitize compromised clusters before restoration.</li>
            <li><strong>Testing and Maintenance:</strong> Mandates at least one (1) full-scale disaster recovery drill per calendar year and semi-annual tabletop walk-throughs.</li>
            <li><strong>Audit and Review:</strong> Annual review schedule or immediate audit trigger upon significant infrastructure migration.</li>
            <li><strong>UACS and Budgeting:</strong> Continuing costs for GovCloud standby compute, off-site storage, and leased circuits are allocated in Part IV.A.</li>
        </ul>
        """

    drbcp_approval_date = getattr(narrative, 'drbcp_approval_date', None) or 'Approved upon Plan Effectivity'

    annex2_html = f"""
    <div class="page-break" id="sec-annex2">
        <div class="section-header">ANNEX 2: DISASTER RECOVERY AND BUSINESS CONTINUITY PLAN (DRBCP)</div>
        <p style="font-size:8.5pt; color:#475569;" class="keep-with-next">Governed under DICT Standards, ISO 22301, and MITHI Resolution 2025-01.</p>
        
        <div class="sub-header">1. Plan Overview & Governance</div>
        <p style="margin:2px 0;"><strong>Agency:</strong> {agency_name_clean} &nbsp;|&nbsp; <strong>Version:</strong> {narrative.issp_period}.1 &nbsp;|&nbsp; <strong>Approval Date:</strong> {drbcp_approval_date}</p>
        <table>
            <thead><tr><th style="width:25%;">Role</th><th style="width:45%;">Responsibility</th><th style="width:30%;">Contact</th></tr></thead>
            <tbody>{drt_rows or '<tr><td colspan="3" class="center">No DRT personnel configured.</td></tr>'}</tbody>
        </table>

        <div class="sub-header" style="margin-top:12px;">2. Business Impact Analysis (BIA) Summary</div>
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
            <tbody>{bia_rows or '<tr><td colspan="5" class="center">No mission-critical BIA metrics defined.</td></tr>'}</tbody>
        </table>

        <div class="sub-header" style="margin-top:12px;">3. ICT Component Inventory & Affected Assets</div>
        <ul>{affected_assets_html}</ul>

        <div class="sub-header" style="margin-top:12px;">4. Technical Recovery Strategy</div>
        {dr_recovery_strategy_text}

        <div class="sub-header" style="margin-top:12px;">5. Standard Operating Procedures (SOP)</div>
        {dr_sop_phases_text}

        <div class="sub-header" style="margin-top:12px;">6. Compliance, Scalability, and Sustainability (MITHI Resolution 2025-01 & SPAR Reporting)</div>
        {sec6_compliance_html}

        <table style="page-break-inside: avoid; break-inside: avoid;">
            <thead><tr><th style="width:50%;">Indicator</th><th style="width:50%;">Target Metric</th></tr></thead>
            <tbody>{dr_kpi_rows or '<tr><td colspan="2" class="center">No DR KPIs defined.</td></tr>'}</tbody>
        </table>
    </div>
    """

    return f"<!DOCTYPE html><html><head><meta charset='utf-8'><title>ISSP Compilation</title>{css}</head><body>{cover_html}{toc_html}{defs_html}{part1_html}{part2_html}{part3_html}{part4a_html}{part4b_html}{annex1_html}{annex2_html}</body></html>"
