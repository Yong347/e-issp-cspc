# app/tasks/pdf_tasks.py
import os
import sys
import io
import time
import logging
from decimal import Decimal
from typing import Optional, List, Dict, Any
from pathlib import Path
from sqlalchemy import func
from sqlalchemy.orm import joinedload, selectinload
from celery.exceptions import SoftTimeLimitExceeded

from app.config import settings
from app.database.session import SessionLocal
from app.database.models import (
    Proposal,
    SubscriptionProposal,
    NeedsAssessment,
    MasterNarrative,
    ProposalStatus,
    ScopeChoice,
    Campus,
    Department,
    User,
    GlossaryTerm,
    GeneralInstruction,
    StrategicConcern,
    CoreOfficeFunction,
    CrossAgencyProject,
    PerformanceMetric,
    AnnualCostBreakdown,
    DegreeOffering,
    GaaPerformance,
    ServerCapacityTrack,
    ClientOsCensus,
    OfficeSoftwareCensus,
    ProposalDeployment,
    IctStaffPosition,
    IsspNode,
    IsspVocabulary,
    IsspContent,
    IsspAsset,
    NodeType,
    PageOrientation,
    ContentType,
    AssetRole
)
from app.storage.s3_client import storage_client
from app.celery_app import celery_app

logger = logging.getLogger(__name__)


# ==========================================================
# SYSTEM DIRECTORY MAPS & FALLBACK FORMATS
# ==========================================================

KEY_TO_SCHEMA = {
    "TRANSMITTAL": "core_transmittal",
    "COVER": "core_cover",
    "SIGNATORIES": "core_sig_scope",
    "TOC_PAGE": "core_toc",
    "TOC": "core_toc",
    "PROCESS_FLOW": "core_process_flow",
    "GLOSSARY": "core_defs",
    "INSTRUCTIONS": "core_instructions",
    "PART_I_ORG_PROFILE": "part_1_org_profile",
    "PART_I_SECTION_B": "part_1_b_manpower",
    "PART_I_SECTION_C": "core_process_flow",
    "PART_I_SECTION_D": "part_1_org_profile",
    "PART_I_SECTION_E": "part_1_e_concerns",
    "PART_V_SCHEDULES": "part_5_schedules",
    "PART_V_INVESTMENTS": "part_5_investments",
    "ANNEX_MASTER": "annex_master",
    "ANNEX_A3_FUNCTIONS": "annex_a3_functions",
    "ANNEX_A4_PROGRAMS": "annex_a4_programs"
}

STANDARD_ISSP_FORMAT = [
    {"schema_id": "core_transmittal", "display_title": "Transmittal Letter", "force_page_break": True, "orientation": "portrait"},
    {"schema_id": "core_cover", "display_title": "ISSP Cover Page", "force_page_break": True, "orientation": "portrait"},
    {"schema_id": "core_sig_scope", "display_title": "ISSP Signatories & Scope", "force_page_break": True, "orientation": "landscape"},
    {"schema_id": "core_toc", "display_title": "Table of Contents", "force_page_break": True, "orientation": "landscape"},
    {"schema_id": "core_defs", "display_title": "Definition of Terms", "force_page_break": True, "orientation": "landscape"},
    {"schema_id": "core_instructions", "display_title": "General Instructions", "force_page_break": True, "orientation": "landscape"},
    {"schema_id": "part_1_org_profile", "display_title": "Part I: Organizational Profile", "force_page_break": True, "orientation": "landscape"},
    {"schema_id": "part_1_b_manpower", "display_title": "Part I.B: IT Manpower complement", "force_page_break": True, "orientation": "landscape"},
    {"schema_id": "part_1_e_concerns", "display_title": "Part I.E: Strategic Concerns Matrix", "force_page_break": True, "orientation": "landscape"},
    {"schema_id": "part_2_is_strategy", "display_title": "Part II: IS Strategy", "force_page_break": True, "orientation": "landscape"},
    {"schema_id": "part_2_b_c_databases", "display_title": "Part II.B & II.C: Systems & Databases", "force_page_break": True, "orientation": "landscape"},
    {"schema_id": "part_3_ict_projects", "display_title": "Part III: ICT Projects & PMF", "force_page_break": True, "orientation": "landscape"},
    {"schema_id": "part_4_b_org_structure", "display_title": "Part IV.B: ICT Organizational Charts", "force_page_break": True, "orientation": "landscape"},
    {"schema_id": "part_5_schedules", "display_title": "Part V: Projects Implementation Schedules", "force_page_break": True, "orientation": "landscape"},
    {"schema_id": "part_5_investments", "display_title": "Part V: Summary of Investments", "force_page_break": True, "orientation": "landscape"},
    {"schema_id": "annex_master", "display_title": "Annex A-1: Survey Details", "force_page_break": True, "orientation": "landscape"},
    {"schema_id": "annex_a3_functions", "display_title": "Annex A-3: Core Offices & Functions", "force_page_break": True, "orientation": "landscape"},
    {"schema_id": "annex_a4_programs", "display_title": "Annex A-4: Academic Programs & GAA Targets", "force_page_break": True, "orientation": "landscape"}
]


def resolve_local_img_path(url: Optional[str]) -> Optional[str]:
    """
    Resolves S3 links and external URLs into base64 data URIs
    to bypass WeasyPrint network sandbox access controls.
    """
    if not url:
        return url
    
    normalized = url.strip().lower()
    if ".." in normalized or normalized.startswith("file://") or normalized.startswith("localhost") or normalized.startswith("/"):
        logger.warning(f"Security Block: Traversal or local file scheme prohibited: {url}")
        return None
        
    try:
        return storage_client.get_as_base64_uri(url)
    except Exception as e:
        logger.error(f"In-memory image conversion failed for url {url}: {str(e)}")
        return url


class ISSPDynamicCompiler:
    """
    Handles dynamic, multi-pass PDF compilation with structured portrait and landscape
    orientations to align with the standard DICT format.
    """
    @staticmethod
    def get_logo_html(logo_url: Optional[str]) -> str:
        if logo_url and (logo_url.startswith("data:") or logo_url.startswith("http") or logo_url.startswith("file://")):
            return f'<img src="{logo_url}" style="max-height: 80px; width: auto; display: block; margin: 0 auto;" />'
        
        return '''
        <svg width="80" height="80" viewBox="0 0 100 100" style="display: block; margin: 0 auto;">
            <polygon points="50,15 90,85 10,85" fill="#1e3a8a" />
            <circle cx="50" cy="55" r="20" fill="#3b82f6" />
            <text x="50" y="97" font-family="Helvetica, Arial, sans-serif" font-size="7" font-weight="bold" fill="#475569" text-anchor="middle">CSPC-ISSP</text>
        </svg>
        '''

    @classmethod
    def render_section(cls, schema_id: str, metadata: dict, proposals: list, subscriptions: list, needs: list, planning_years: List[str]) -> str:
        """
        Compiles the HTML content based on the layout schema ID.
        Dynamically adapts table headers, colspans, and cell structures to match any planning cycle length.
        """
        
        # A. Official Transmittal Letter (Portrait Layout - Page 1)
        if schema_id == "core_transmittal":
            recipient = metadata.get("transmittal_recipient") or "ATTY. IVAN JOHN E. UY"
            title = metadata.get("transmittal_recipient_title") or "Secretary"
            agency = metadata.get("transmittal_recipient_agency") or "Department of Information and Communications Technology"
            address = metadata.get("transmittal_recipient_address") or "DICT Bldg., C.P. Garcia Avenue, Diliman, Quezon City"
            date = metadata.get("transmittal_date") or "22 February 2023"
            approved_by = metadata.get("signatory_approved_by") or "DR. CHARLITO P. CADAG, PhD"
            issp_period = metadata.get("issp_period_years", "2026-2028")

            return f'''
            <div class="transmittal-layout" id="core_transmittal" style="font-size: 10pt; line-height: 1.6; color:#0f172a; padding: 20px;">
                <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:2px solid #1e3a8a; padding-bottom:12px; margin-bottom: 25px;">
                    <div style="width: 75px;">{cls.get_logo_html(metadata.get("agency_logo_url"))}</div>
                    <div style="text-align:center; font-family:sans-serif; flex:1;">
                        <h3 style="margin:0; font-size:10pt; font-weight: normal; color: #475569; text-transform: uppercase;">Republic of the Philippines</h3>
                        <h2 style="margin:3px 0; font-size:12pt; font-weight:bold; color:#1e3a8a;">CAMARINES SUR POLYTECHNIC COLLEGES</h2>
                        <p style="margin:0; font-size:9pt; color: #475569;">Nabua, Camarines Sur</p>
                    </div>
                    <div style="text-align:right; font-size:8pt; border:1px solid #cbd5e1; padding:6px; background-color: #f8fafc; border-radius: 4px;">
                        <strong>ISO 9001:2015</strong><br/>
                        <span style="color: #64748b;">TUV SUD Certified</span>
                    </div>
                </div>
                <div style="margin-top:25px; font-weight: bold; color: #334155;">{date}</div>
                <div style="margin-top:25px; line-height: 1.4; color: #0f172a;">
                    <strong>{recipient}</strong><br/>
                    {title}<br/>
                    <strong>{agency}</strong><br/>
                    {address}
                </div>
                <p style="margin-top:25px; font-weight: bold;">Dear {title} {recipient.split()[-1]}:</p>
                <p style="text-align:justify; text-indent: 30px; margin-top: 15px;">
                    This is to respectfully submit to your office the Information Systems Strategic Plan (ISSP) of Camarines Sur Polytechnic Colleges for the FY {issp_period}, for evaluation and endorsement.
                </p>
                <p style="text-align:justify; text-indent: 30px; margin-top: 15px;">
                    This strategic planning framework has been formulated to align the university's technical resources, physical hardware networks, and cloud application software packages with SUC developmental milestones, advancing polytechnic educational outcomes across Camarines Sur.
                </p>
                <p style="margin-top: 25px;">Thank you very much.</p>
                <div style="margin-top:55px; page-break-inside: avoid;">
                    <p style="margin-bottom: 35px;">Very truly yours,</p>
                    <div style="font-weight:bold;">
                        <p style="margin:0; text-decoration:underline; font-size: 11pt; color: #1e3a8a;">{approved_by}</p>
                        <p style="margin:2px 0 0 0; font-weight:normal; color:#475569; font-size: 9.5pt;">President</p>
                    </div>
                </div>
                <div style="margin-top:70px; text-align:center; font-style:italic; border-top:1px solid #e2e8f0; padding-top:12px; color:#64748b; font-size:9pt; letter-spacing: 0.5px;">
                    "Onwards to excellent education and service!"
                </div>
            </div>
            '''

        # B. Cover / Title Page Layout (Portrait Layout - Page 2)
        elif schema_id == "core_cover":
            issp_period = metadata.get("issp_period_years", "2026-2028")
            agency_name = metadata.get("agency_name", "Camarines Sur Polytechnic Colleges")
            return f'''
            <div class="cover-layout" id="core_cover" style="background-color: #0b1a3a; color: white; padding: 50px 40px; border: 15px double #d4af37; min-height: 100%; position: relative; box-sizing: border-box; font-family: Arial, sans-serif;">
                <div style="text-align: center; margin-top: 40px;">
                    <div style="background-color: white; display: inline-block; padding: 12px; border-radius: 50%; box-shadow: 0 4px 6px rgba(0,0,0,0.15);">
                        {cls.get_logo_html(metadata.get("agency_logo_url"))}
                    </div>
                    <h2 style="font-size: 15pt; color: #f3f4f6; letter-spacing: 1.5px; margin-top:20px; text-transform:uppercase; font-weight: 700;">{agency_name}</h2>
                    <p style="font-size: 10pt; color: #94a3b8; font-style: italic; letter-spacing: 0.5px;">Nabua, Camarines Sur</p>
                </div>
                <div style="margin-top: 140px; text-align: center;">
                    <span style="font-size: 9.5pt; font-weight: bold; background-color: #d4af37; color: #0b1a3a; padding: 4px 12px; border-radius: 2px; text-transform: uppercase; letter-spacing: 2px;">SUC Strategic Framework</span>
                    <h1 style="font-size: 24pt; font-weight: 900; letter-spacing: 1.5px; color: #ffffff; line-height: 1.2; margin-top: 15px; text-shadow: 2px 2px 4px rgba(0,0,0,0.4);">INFORMATION SYSTEMS</h1>
                    <h1 style="font-size: 28pt; font-weight: 950; color: #d4af37; margin-top: 5px; text-transform:uppercase; letter-spacing: 1px;">Strategic Plan</h1>
                    <div style="width: 100px; height: 3px; background-color: #d4af37; margin: 25px auto 25px auto;"></div>
                    <h2 style="font-size: 18pt; color: #e2e8f0; font-family: monospace; letter-spacing: 2px;">FY {issp_period}</h2>
                </div>
                <div style="position: absolute; bottom: 40px; left: 40px; right: 40px; border-top: 1px solid #1e293b; padding-top: 20px; font-size: 9pt; color: #94a3b8; display: flex; justify-content: space-between; font-family: sans-serif;">
                    <span>Tel: (054) 228-4421-23</span>
                    <span>Email: mail@cspc.edu.ph</span>
                    <span>Website: www.cspc.edu.ph</span>
                </div>
            </div>
            '''

        # C. ISSP Signatory Page & Scope Checkboxes (Landscape Layout - Page 3)
        elif schema_id == "core_sig_scope":
            issp_period = metadata.get("issp_period_years", "2026-2028")
            prepared_by = metadata.get("signatory_prepared_by", "DR. IAN P. BENITEZ")
            preparer_pos = metadata.get("preparer_position", "Director, MICT")
            preparer_tel = metadata.get("preparer_tel", "09190840018")
            preparer_email = metadata.get("preparer_email", "ianbenitez@cspc.edu.ph")
            approved_by = metadata.get("signatory_approved_by", "DR. CHARLITO P. CADAG, PhD")
            
            scope_map = metadata.get("scope_json") or {}
            
            check_dept_wide = "[✓]" if scope_map.get("department_wide") else "[ &nbsp; ]"
            check_dept_central_only = "[✓]" if scope_map.get("dept_central_office_only") else "[ &nbsp; ]"
            check_dept_regional = "[✓]" if scope_map.get("dept_regional_offices") else "[ &nbsp; ]"
            check_with_bureaus = "[✓]" if scope_map.get("with_bureaus") else "[ &nbsp; ]"
            check_agency_wide = "[✓]" if scope_map.get("agency_wide") else "[ &nbsp; ]"
            check_agency_central_only = "[✓]" if scope_map.get("agency_central_office_only") else "[ &nbsp; ]"
            check_agency_regional = "[✓]" if scope_map.get("agency_regional_offices") else "[ &nbsp; ]"

            return f'''
            <div class="signatories-layout" id="core_sig_scope" style="font-size: 9.5pt; line-height: 1.5; color: #0f172a; padding: 15px;">
                <h2 style="font-size:12.5pt; text-align:center; font-weight:bold; color:#1e3a8a; border-bottom:2px solid #1e3a8a; padding-bottom:8px; margin-bottom:25px; text-transform: uppercase;">
                    Information Systems Strategic Plan (ISSP)<br/>
                    <span style="font-size:10pt; font-weight:normal; color:#475569; text-transform: none;">For the period {issp_period}</span>
                </h2>
                <div style="margin-top: 15px; display: flex; justify-content: space-between; page-break-inside: avoid;">
                    <div style="width: 48%; border: 1px solid #cbd5e1; padding: 15px; background-color: #f8fafc; border-radius: 4px; box-sizing: border-box;">
                        <span style="font-weight: bold; text-transform: uppercase; color: #1e3a8a; font-size: 8.5pt; display: block; border-bottom: 1px solid #cbd5e1; padding-bottom: 4px; margin-bottom: 10px; letter-spacing: 0.5px;">Prepared By:</span>
                        <p style="margin: 6px 0;"><strong>Signature:</strong> ________________________</p>
                        <p style="margin: 6px 0;"><strong>Name:</strong> {prepared_by}</p>
                        <p style="margin: 6px 0;"><strong>Position:</strong> {preparer_pos}</p>
                        <p style="margin: 6px 0;"><strong>Tel No.:</strong> {preparer_tel}</p>
                        <p style="margin: 6px 0;"><strong>Email:</strong> {preparer_email}</p>
                    </div>
                    <div style="width: 48%; border: 1px solid #cbd5e1; padding: 15px; background-color: #f8fafc; border-radius: 4px; box-sizing: border-box; font-size: 8.5pt;">
                        <span style="font-weight: bold; text-transform: uppercase; color: #1e3a8a; font-size: 8.5pt; display: block; border-bottom: 1px solid #cbd5e1; padding-bottom: 4px; margin-bottom: 10px; letter-spacing: 0.5px;">ISSP Scope Class Choice:</span>
                        <div style="margin-top: 6px; font-family: monospace; line-height: 1.6; color:#334155;">
                            <p style="margin:2px 0;">{check_dept_wide} <strong>Department-Wide</strong></p>
                            <div style="margin-left: 14px;">
                                <p style="margin:2px 0;">{check_dept_central_only} Central Office only</p>
                                <p style="margin:2px 0;">{check_dept_regional} With Regional/Field Offices</p>
                                <p style="margin:2px 0;">{check_with_bureaus} With Bureaus</p>
                            </div>
                            <p style="margin:2px 0; margin-top:6px;">{check_agency_wide} <strong>Agency-Wide</strong></p>
                            <div style="margin-left: 14px;">
                                <p style="margin:2px 0;">{check_agency_central_only} Central Office only</p>
                                <p style="margin:2px 0;">{check_agency_regional} With Regional/Field Offices</p>
                            </div>
                        </div>
                    </div>
                </div>
                <div style="margin-top: 55px; border-top: 1px dashed #e2e8f0; padding-top: 25px; text-align: center; page-break-inside: avoid;">
                    <span style="font-weight: bold; text-transform: uppercase; color: #1e3a8a; font-size: 9pt; letter-spacing: 1px;">Approved By:</span>
                    <div style="margin-top: 35px;">
                        <p style="margin:0; font-size:11pt; font-weight:bold; text-decoration:underline; color: #0b1a3a;">{approved_by}</p>
                        <p style="margin:4px 0 0 0; color:#475569; font-size: 9.5pt;">SUC President III</p>
                    </div>
                </div>
                <div style="margin-top: 55px; text-align: center; border: 1px solid #e2e8f0; padding: 12px; background-color: #f8fafc; border-radius: 4px;">
                    <div style="font-weight: bold; color: #1e3a8a; margin-bottom: 4px;">ISO 9001:2015 Quality Management Systems</div>
                    <div style="font-size: 8pt; color: #64748b;">This compliance plan conforms to Quality Management systems standards verified under registration certificate: 01 100 1934914.</div>
                </div>
            </div>
            '''

        # D. Table of Contents
        elif schema_id == "core_toc":
            return '''
            <div class="toc-container" id="core_toc" style="padding: 15px; color: #0f172a;">
                <h2 style="text-align: center; font-size: 14pt; color: #1e3a8a; margin-bottom: 30px; text-transform: uppercase; font-weight: bold; letter-spacing: 0.5px;">
                    Table of Contents
                </h2>
                <ul class="toc-list" style="list-style: none; padding: 0; margin: 0;">
                    <li>
                        <span class="toc-text indent-0" style="font-weight: bold; color:#1e3a8a; text-transform: uppercase;">PART I. ORGANIZATIONAL PROFILE</span>
                        <span class="toc-dots"></span>
                        <span class="toc-num page-number-ref-part1"></span>
                    </li>
                    <li>
                        <span class="toc-text indent-1">A. Department/Agency Vision, Mission and Mandate</span>
                        <span class="toc-dots"></span>
                        <span class="toc-num page-number-ref-part1"></span>
                    </li>
                    <li>
                        <span class="toc-text indent-2">A.1. SUC Legal Mandate & BP 512 Basis</span>
                        <span class="toc-dots"></span>
                        <span class="toc-num page-number-ref-part1"></span>
                    </li>
                    <li>
                        <span class="toc-text indent-2">A.2. Vision and Mission Statements</span>
                        <span class="toc-dots"></span>
                        <span class="toc-num page-number-ref-part1"></span>
                    </li>
                    <li>
                        <span class="toc-text indent-1">B. SUC Designated Planners Profile Matrix (Table B-1)</span>
                        <span class="toc-dots"></span>
                        <span class="toc-num page-number-ref-part1b"></span>
                    </li>
                    <li>
                        <span class="toc-text indent-1">C. SUC Functional Interface Flowchart</span>
                        <span class="toc-dots"></span>
                        <span class="toc-num page-number-ref-part1c"></span>
                    </li>
                    <li>
                        <span class="toc-text indent-1">D. Present SUC ICT Situation (Strategic Challenges)</span>
                        <span class="toc-dots"></span>
                        <span class="toc-num page-number-ref-part1d"></span>
                    </li>
                    <li>
                        <span class="toc-text indent-1">E. Strategic Concerns for ICT Use (Table I.E)</span>
                        <span class="toc-dots"></span>
                        <span class="toc-num page-number-ref-part1e"></span>
                    </li>

                    <li style="margin-top: 15px;">
                        <span class="toc-text indent-0" style="font-weight: bold; color:#1e3a8a; text-transform: uppercase;">PART II. INFORMATION SYSTEMS STRATEGY</span>
                        <span class="toc-dots"></span>
                        <span class="toc-num page-number-ref-part2"></span>
                    </li>
                    <li>
                        <span class="toc-text indent-1">A. Conceptual Framework of IS Interface</span>
                        <span class="toc-dots"></span>
                        <span class="toc-num page-number-ref-part2"></span>
                    </li>
                    <li>
                        <span class="toc-text indent-2">A.1. Site Development Plans & Logical Layouts</span>
                        <span class="toc-dots"></span>
                        <span class="toc-num page-number-ref-part2"></span>
                    </li>
                    <li>
                        <span class="toc-text indent-1">B. Detailed Proposed Systems Profile Cards</span>
                        <span class="toc-dots"></span>
                        <span class="toc-num page-number-ref-part2-cards"></span>
                    </li>
                    <li>
                        <span class="toc-text indent-1">C. Required Registries and Databases Sheets</span>
                        <span class="toc-dots"></span>
                        <span class="toc-num page-number-ref-part2-cards"></span>
                    </li>
                    <li>
                        <span class="toc-text indent-1">D. Segmented Logical Network Layouts</span>
                        <span class="toc-dots"></span>
                        <span class="toc-num page-number-ref-part2"></span>
                    </li>

                    <li style="margin-top: 15px;">
                        <span class="toc-text indent-0" style="font-weight: bold; color:#1e3a8a; text-transform: uppercase;">PART III. DETAILED DESCRIPTION OF ICT PROJECTS</span>
                        <span class="toc-dots"></span>
                        <span class="toc-num page-number-ref-part3"></span>
                    </li>
                    <li>
                        <span class="toc-text indent-1">A. Internal SUC Projects Profiles</span>
                        <span class="toc-dots"></span>
                        <span class="toc-num page-number-ref-part3"></span>
                    </li>
                    <li>
                        <span class="toc-text indent-1">B. Cross-Agency Collaborative Projects</span>
                        <span class="toc-dots"></span>
                        <span class="toc-num page-number-ref-part3"></span>
                    </li>
                    <li>
                        <span class="toc-text indent-1">C. Performance Measurement Frameworks Matrix</span>
                        <span class="toc-dots"></span>
                        <span class="toc-num page-number-ref-pmf"></span>
                    </li>

                    <li style="margin-top: 15px;">
                        <span class="toc-text indent-0" style="font-weight: bold; color:#1e3a8a; text-transform: uppercase;">PART IV. RESOURCE REQUIREMENTS</span>
                        <span class="toc-dots"></span>
                        <span class="toc-num page-number-ref-part4"></span>
                    </li>
                    <li>
                        <span class="toc-text indent-1">A. Equipment Deployment Mapping (Table IV.A)</span>
                        <span class="toc-dots"></span>
                        <span class="toc-num page-number-ref-part4"></span>
                    </li>
                    <li>
                        <span class="toc-text indent-1">B. ICT Organizational Charts & Structures</span>
                        <span class="toc-dots"></span>
                        <span class="toc-num page-number-ref-part4"></span>
                    </li>

                    <li style="margin-top: 15px;">
                        <span class="toc-text indent-0" style="font-weight: bold; color:#1e3a8a; text-transform: uppercase;">PART V. SUMMARY OF INVESTMENTS & SCHEDULES</span>
                        <span class="toc-dots"></span>
                        <span class="toc-num page-number-ref-schedules"></span>
                    </li>
                    <li>
                        <span class="toc-text indent-1">A. Quarterly Projects Implementation Gantt Schedules</span>
                        <span class="toc-dots"></span>
                        <span class="toc-num page-number-ref-schedules"></span>
                    </li>
                    <li>
                        <span class="toc-text indent-1">B. Summary of Investments (CapEx/MOOE)</span>
                        <span class="toc-dots"></span>
                        <span class="toc-num page-number-ref-investments"></span>
                    </li>

                    <li style="margin-top: 15px;">
                        <span class="toc-text indent-0" style="font-weight: bold; color:#1e3a8a; text-transform: uppercase;">ANNEX REPOSITORIES</span>
                        <span class="toc-dots"></span>
                        <span class="toc-num page-number-ref-annex1"></span>
                    </li>
                    <li>
                        <span class="toc-text indent-1">Annex A-1: DICT Baseline Equipment Surveys</span>
                        <span class="toc-dots"></span>
                        <span class="toc-num page-number-ref-annex1"></span>
                    </li>
                    <li>
                        <span class="toc-text indent-1">Annex A-3: Core SUC Offices Functions Directory</span>
                        <span class="toc-dots"></span>
                        <span class="toc-num page-number-ref-annexa3"></span>
                    </li>
                    <li>
                        <span class="toc-text indent-1">Annex A-4: SUC Degree Programs & GAA Target Indicators</span>
                        <span class="toc-dots"></span>
                        <span class="toc-num page-number-ref-annexa4"></span>
                    </li>
                </ul>
            </div>
            '''

        # E. Database-Backed Glossary / Definition of Terms
        elif schema_id == "core_defs":
            glossary_list = metadata.get("glossary_terms") or []
            terms_left = glossary_list[:len(glossary_list)//2 + 1]
            terms_right = glossary_list[len(glossary_list)//2 + 1:]

            left_html = "".join(f'<p style="margin: 10px 0 2px 0;"><strong>{g.get("term")}:</strong> {g.get("definition")}</p>' for g in terms_left)
            right_html = "".join(f'<p style="margin: 10px 0 2px 0;"><strong>{g.get("term")}:</strong> {g.get("definition")}</p>' for g in terms_right)

            return f'''
            <div class="defs-layout" id="core_defs" style="padding: 15px; color: #0f172a;">
                <h2 class="section-title">Definition of Terms</h2>
                <div style="font-size: 7.5pt; line-height: 1.4; text-align: justify; margin-top: 10px;">
                    <div style="display: flex; flex-wrap: wrap; justify-content: space-between;">
                        <div style="width: 48%; margin-bottom: 12px;">
                            {left_html or "<p>No definition entries saved.</p>"}
                        </div>
                        <div style="width: 48%; margin-bottom: 12px;">
                            {right_html or ""}
                        </div>
                    </div>
                </div>
            </div>
            '''

        # F. Database-Backed General Instructions
        elif schema_id == "core_instructions":
            instructions_list = metadata.get("general_instructions") or []
            steps_html = "".join(f'<li style="margin-bottom: 10px;">{inst.get("instruction_text")}</li>' for inst in instructions_list)

            return f'''
            <div class="instructions-layout" id="core_instructions" style="padding: 15px; color: #0f172a;">
                <h2 class="section-title">General Instructions</h2>
                <div style="font-size: 9.5pt; line-height: 1.7; color: #334155; text-align: justify; padding: 20px; border: 1px solid #cbd5e1; background-color: #f8fafc; border-radius: 4px;">
                    <p style="margin-top: 0; font-weight: bold; color: #1e3a8a;">Guidelines on Formulating and Submitting SUC ISSP Documents:</p>
                    <ol style="margin: 15px 0 0 20px; padding: 0;">
                        {steps_html or "<li>No guideline items registered.</li>"}
                    </ol>
                </div>
            </div>
            '''

        # 3. Part I: Organizational Profile, Mandates, Situation & Needs Assessments
        elif schema_id == "part_1_org_profile":
            offices_html = ""
            for office in metadata.get("core_offices_json", []):
                offices_html += f'''
                <tr>
                    <td style="padding: 8px; border: 1px solid #cbd5e1; font-weight: bold; width: 30%; color: #1e3a8a;">{office.get("office_name", "")}</td>
                    <td style="padding: 8px; border: 1px solid #cbd5e1; font-size: 8.5pt;">{office.get("description", "")}</td>
                    <td style="padding: 8px; border: 1px solid #cbd5e1; font-size: 8.5pt;">{office.get("division", "")}</td>
                </tr>
                '''

            org_structure_html = ""
            if metadata.get("org_chart_url"):
                org_structure_html = f'''
                <div class="full-page-media" style="text-align: center; margin-top: 25px; margin-bottom: 20px; page-break-inside: avoid;">
                    <h4 class="sub-section-title">General College Organizational Structure</h4>
                    <div class="image-wrapper">
                        <img src="{metadata.get("org_chart_url")}" alt="General Structure" />
                    </div>
                </div>
                '''

            functional_interface_html = ""
            if metadata.get("functional_interface_url"):
                functional_interface_html = f'''
                <div class="full-page-media" id="core_process_flow" style="page-break-inside: avoid;">
                    <h4 class="sub-section-title">I.C. Agency Functional Interface Diagram</h4>
                    <div class="image-wrapper">
                        <img src="{metadata.get("functional_interface_url")}" alt="Functional Interface" />
                    </div>
                </div>
                '''

            needs_html = ""
            for item in needs:
                impacts = ", ".join(item.expected_impacts) if hasattr(item, "expected_impacts") and item.expected_impacts else "N/A"
                needs_html += f'''
                <tr>
                    <td style="padding: 8px; border: 1px solid #cbd5e1; font-size: 8pt; font-weight: bold; color: #1e3a8a;">{item.title}</td>
                    <td style="padding: 8px; border: 1px solid #cbd5e1; font-size: 8pt; text-align: center;">{item.mfo_alignment}</td>
                    <td style="padding: 8px; border: 1px solid #cbd5e1; font-size: 7.5pt; text-align: justify;">{item.current_problem}</td>
                    <td style="padding: 8px; border: 1px solid #cbd5e1; font-size: 7.5pt; text-align: justify;">{item.proposed_solution}</td>
                    <td style="padding: 8px; border: 1px solid #cbd5e1; font-size: 7.5pt; color: #475569;">{impacts}</td>
                </tr>
                '''

            needs_table_block = ""
            if needs_html:
                needs_table_block = f'''
                <h4 class="sub-section-title" style="margin-top: 25px;">I.E. Departmental Needs Assessments & MFO Mappings</h4>
                <table style="width: 100%; border-collapse: collapse; margin-top: 10px;">
                    <thead>
                        <tr style="background-color: #f0f7ff; text-align: left; font-weight: bold;">
                            <th style="padding: 8px; border: 1px solid #cbd5e1; font-size: 8pt; width: 20%; color: #1e3a8a;">Target Program/Need</th>
                            <th style="padding: 8px; border: 1px solid #cbd5e1; font-size: 8pt; text-align: center; width: 12%; color: #1e3a8a;">MFO Alignment</th>
                            <th style="padding: 8px; border: 1px solid #cbd5e1; font-size: 8pt; width: 25%; color: #1e3a8a;">Current Bottlenecks</th>
                            <th style="padding: 8px; border: 1px solid #cbd5e1; font-size: 8pt; width: 25%; color: #1e3a8a;">Proposed Solution</th>
                            <th style="padding: 8px; border: 1px solid #cbd5e1; font-size: 8pt; width: 18%; color: #1e3a8a;">Expected Strategic Impacts</th>
                        </tr>
                    </thead>
                    <tbody>
                        {needs_html}
                    </tbody>
                </table>
                '''

            return f'''
            <div class="organizational-profile-layout" id="part_1_org_profile">
                <h2 class="section-title">
                    PART I: ORGANIZATIONAL PROFILE
                </h2>
                <h4 class="sub-section-title">I.A. Institutional Mandates</h4>
                <div style="font-size: 9.5pt; text-align: justify; color: #334155; line-height: 1.6; margin-bottom: 20px;">
                    {metadata.get("agency_mandate", "No Mandate defined.")}
                </div>
                
                <h4 class="sub-section-title">I.B. Vision & Mission Statements</h4>
                <div style="font-size: 9.5pt; text-align: justify; color: #334155; line-height: 1.6; margin-bottom: 10px;">
                    <strong>Vision:</strong> {metadata.get("agency_vision", "No Vision defined.")}
                </div>
                <div style="font-size: 9.5pt; text-align: justify; color: #334155; line-height: 1.6; margin-bottom: 20px;">
                    <strong>Mission:</strong> {metadata.get("agency_mission", "No Mission defined.")}
                </div>

                {org_structure_html}

                <h4 class="sub-section-title" id="part-1-d-present-situation">I.D. Present SUC ICT Situation (Strategic Challenges)</h4>
                <div style="font-size: 9.5pt; text-align: justify; color: #334155; line-height: 1.6; margin-bottom: 20px;">
                    {metadata.get("present_situation_html") or '<p style="font-style:italic; color:#64748b;">No present ICT situation narratives declared.</p>'}
                </div>

                {functional_interface_html}

                {needs_table_block}

                <h4 class="sub-section-title" style="margin-top: 25px;">Core Offices Registry</h4>
                <table style="width: 100%; border-collapse: collapse; margin-top: 10px;">
                    <thead>
                        <tr style="background-color: #f0f7ff; text-align: left; font-weight: bold;">
                            <th style="padding: 10px; border: 1px solid #cbd5e1; font-size: 9pt; color: #1e3a8a;">Office Name</th>
                            <th style="padding: 10px; border: 1px solid #cbd5e1; font-size: 9pt; color: #1e3a8a;">Operational Responsibilities</th>
                            <th style="padding: 10px; border: 1px solid #cbd5e1; font-size: 9pt; color: #1e3a8a;">Division Class</th>
                        </tr>
                    </thead>
                    <tbody>
                        {offices_html or '<tr><td colspan="3" style="padding:10px; text-align:center; color:#94a3b8;">No core offices configured.</td></tr>'}
                    </tbody>
                </table>
            </div>
            '''

        # 4. Part I.B: Planners, Manpower, and Budgets (Multi-Campus Structural Grid)
        elif schema_id == "part_1_b_manpower":
            campuses_data = metadata.get("campuses") or []
            table_b1_rows = ""
            for cp in campuses_data:
                planners_list_html = "".join(f"<li><strong>{p.get('name', '')}</strong> ({p.get('position', 'Planner')})</li>" for p in cp.get("planners", []))
                
                table_b1_rows += f'''
                <tr>
                    <td style="padding: 6px; border: 1px solid #cbd5e1; font-size: 8pt; text-align: left; font-weight: bold; color: #1e3a8a;">{cp.get("name", "")} ({cp.get("code", "")})</td>
                    <td style="padding: 6px; border: 1px solid #cbd5e1; font-size: 8pt; text-align: left;">{cp.get("location", "")}</td>
                    <td style="padding: 6px; border: 1px solid #cbd5e1; font-size: 8pt; text-align: left;">
                        <ul style="margin: 0; padding-left: 15px; color: #475569;">{planners_list_html or "<li>No campus planners configured.</li>"}</ul>
                    </td>
                    <td style="padding: 10px; border: 1px solid #cbd5e1; font-size: 8.5pt; vertical-align: top;">
                        <table style="width: 100%; border: none; margin: 0; padding: 0;">
                            <tr style="border: none;"><td style="border: none; padding: 2px; font-size: 8pt;">Regular Staff:</td><td style="border: none; padding: 2px; font-size: 8pt; font-weight: bold; text-align: right; color: #1e3a8a;">{cp.get("departments_count", 0)} departments</td></tr>
                        </table>
                    </td>
                    <td style="padding: 10px; border: 1px solid #cbd5e1; font-size: 9pt; text-align: right; font-weight: bold; vertical-align: top; color: #1e3a8a;">₱{cp.get("total_spent", 0.0):,.2f}</td>
                </tr>
                '''

            return f'''
            <div class="manpower-layout" id="part_1_b_manpower">
                <h2 class="section-title">
                    PART I.B: PLANNERS & IT MANPOWER COMPLEMENT
                </h2>
                
                <h4 class="sub-section-title">Table B-1: Designated IS Planners Profile Matrix</h4>
                <table style="width: 100%; border-collapse: collapse; margin-top: 10px; page-break-inside: avoid;">
                    <thead>
                        <tr style="background-color: #f0f7ff; text-align: left; font-weight: bold;">
                            <th style="padding: 10px; border: 1px solid #cbd5e1; font-size: 8.5pt; width: 25%; color: #1e3a8a;">Campus Name</th>
                            <th style="padding: 10px; border: 1px solid #cbd5e1; font-size: 8.5pt; width: 20%; color: #1e3a8a;">Location</th>
                            <th style="padding: 10px; border: 1px solid #cbd5e1; font-size: 8.5pt; width: 25%; color: #1e3a8a;">Designated Planners</th>
                            <th style="padding: 10px; border: 1px solid #cbd5e1; font-size: 8.5pt; width: 15%; color: #1e3a8a;">Composition</th>
                            <th style="padding: 10px; border: 1px solid #cbd5e1; font-size: 8.5pt; text-align: right; width: 15%; color: #1e3a8a;">Sub-Budget Allocation</th>
                        </tr>
                    </thead>
                    <tbody>
                        {table_b1_rows or '<tr><td colspan="5" style="text-align: center; padding: 10px;">No physical campuses configured.</td></tr>'}
                    </tbody>
                </table>
            </div>
            '''

        # 5. Part I.E: Strategic Concerns Matrix
        elif schema_id == "part_1_e_concerns":
            concerns_html = ""
            for item in metadata.get("strategic_concerns_json", []):
                concerns_html += f'''
                <tr>
                    <td style="padding: 8px; border: 1px solid #cbd5e1; font-size: 8.5pt; vertical-align: top; font-weight: bold; color: #334155;">{item.get("key_result_area", "")}</td>
                    <td style="padding: 8px; border: 1px solid #cbd5e1; font-size: 8.5pt; vertical-align: top; text-align: left;">{item.get("concern_description", "")}</td>
                    <td style="padding: 8px; border: 1px solid #cbd5e1; font-size: 8.5pt; vertical-align: top; color: #475569;">{item.get("intended_solution", "")}</td>
                </tr>
                '''
            return f'''
            <div class="concerns-layout" id="part_1_e_concerns">
                <h2 class="section-title">
                    PART I.E: STRATEGIC CONCERNS FOR ICT USE
                </h2>
                <table style="width: 100%; border-collapse: collapse; margin-top: 15px;">
                    <thead>
                        <tr style="background-color: #f0f7ff; text-align: left; font-weight: bold;">
                            <th style="padding: 10px; border: 1px solid #cbd5e1; font-size: 9pt; width: 30%; color: #1e3a8a;">KEY RESULT AREA (KRA) / MFO</th>
                            <th style="padding: 10px; border: 1px solid #cbd5e1; font-size: 9pt; width: 35%; color: #1e3a8a;">CRITICAL BUSINESS SYSTEM CONCERN</th>
                            <th style="padding: 10px; border: 1px solid #cbd5e1; font-size: 9pt; width: 35%; color: #1e3a8a;">INTENDED USE OF ICT SOLUTIONS</th>
                        </tr>
                    </thead>
                    <tbody>
                        {concerns_html or '<tr><td colspan="3" style="text-align:center;">No strategic concerns logged.</td></tr>'}
                    </tbody>
                </table>
            </div>
            '''

        # 6. Part II: Strategy, Architecture & Diagrams (Landscape Layout)
        elif schema_id == "part_2_is_strategy":
            framework_img_html = ""
            if metadata.get("conceptual_framework_url"):
                framework_img_html = f'''
                <div class="full-page-media">
                    <h4 class="sub-section-title">Conceptual Framework of IS Interface</h4>
                    <div class="image-wrapper">
                        <img src="{metadata.get("conceptual_framework_url")}" alt="Conceptual Framework" />
                    </div>
                </div>
                '''
            
            site_plan_html = ""
            if metadata.get("site_development_plan_url"):
                site_plan_html = f'''
                <div class="full-page-media">
                    <h4 class="sub-section-title">Annex A-2 Campus Site Development Plan</h4>
                    <div class="image-wrapper">
                        <img src="{metadata.get("site_development_plan_url")}" alt="Site Development Plan" />
                    </div>
                </div>
                '''

            fiber_backbone_html = ""
            if metadata.get("fiber_backbone_url"):
                fiber_backbone_html = f'''
                <div class="full-page-media">
                    <h4 class="sub-section-title">Fiber Optic Backbone Cabling Layout</h4>
                    <div class="image-wrapper">
                        <img src="{metadata.get("fiber_backbone_url")}" alt="Fiber Backbone" />
                    </div>
                </div>
                '''

            system_architecture_html = ""
            if metadata.get("system_architecture_url"):
                system_architecture_html = f'''
                <div class="full-page-media">
                    <h4 class="sub-section-title">CSPC Unified System Architecture Diagram</h4>
                    <div class="image-wrapper">
                        <img src="{metadata.get("system_architecture_url")}" alt="System Architecture" />
                    </div>
                </div>
                '''

            network_img_html = ""
            layouts = [
                ("SIAS / Enrollment Network Layout", metadata.get("net_layout_sias_url")),
                ("Library IS Network Layout", metadata.get("net_layout_library_url")),
                ("School Security Network Layout", metadata.get("net_layout_security_url")),
                ("HRIS & Payroll Network Layout", metadata.get("net_layout_hris_url")),
                ("Document Management Network Layout", metadata.get("net_layout_dms_url")),
                ("Supplies Management Network Layout", metadata.get("net_layout_supplies_url")),
                ("Budget Management Network Layout", metadata.get("net_layout_budget_url")),
                ("SIAS / Accounting Network Layout", metadata.get("net_layout_sias_upgrade_url")),
                ("Extension Services Network Layout", metadata.get("net_layout_extension_url"))
            ]
            for label, url in layouts:
                if url:
                    network_img_html += f'''
                    <div class="full-page-media">
                        <h4 class="sub-section-title">{label}</h4>
                        <div class="image-wrapper">
                            <img src="{url}" alt="{label}" />
                        </div>
                    </div>
                    '''

            topology_html = ""
            if metadata.get("network_diagram_url"):
                topology_html = f'''
                <div class="full-page-media">
                    <h4 class="sub-section-title">CSPC Network Diagram & Core topology</h4>
                    <div class="image-wrapper">
                        <img src="{metadata.get("network_diagram_url")}" alt="Network Topology" />
                    </div>
                </div>
                '''

            return f'''
            <div class="strategy-layout" id="part_2_is_strategy">
                <h2 class="section-title">
                    PART II: INFORMATION SYSTEMS STRATEGY
                </h2>
                <h4 class="sub-section-title">II.A. Conceptual Framework</h4>
                <p style="font-size: 9.5pt; color: #475569; text-align: justify; line-height: 1.6; margin-bottom: 10px;">
                    The integrated conceptual systems architecture aligns operations across institutional databases, unifying internal student, faculty, and resource pipelines.
                </p>
                {framework_img_html}
            </div>
            {site_plan_html}
            {topology_html}
            {fiber_backbone_html}
            {system_architecture_html}
            {network_img_html}
            '''

        # 7. Part II.B & II.C: Systems and Databases
        elif schema_id == "part_2_b_c_databases":
            html_output = ""
            
            # Application Profile Cards (Part II.B)
            systems_list = metadata.get("systems_json") or []
            if not systems_list:
                systems_list = [
                    {"name": "Student Information and Accounting System (SIAS)", "description": "Handles online student registration, grading, and accounting ledger management.", "status": "For Enhancement", "dev_strategy": "Outsourced / Service Provider", "computing_scheme": "Cloud Computing", "owners": "MICT Office"},
                    {"name": "Online Library Information Systems", "description": "LMS system cataloging, transaction, and OPAC lookup systems.", "status": "For Enhancement", "dev_strategy": "In-house Development", "computing_scheme": "Web Server", "owners": "College Library"},
                    {"name": "School Monitoring and Security System", "description": "Automates visitor logging, RFID gate verification, and CCTV monitoring integration.", "status": "For Development", "dev_strategy": "Outsourced / Service Provider", "computing_scheme": "Cloud Computing", "owners": "VP for Administration"},
                    {"name": "Human Resource Management System", "description": "Coordinates employee personal data, biometrics time cards, and payroll integrations.", "status": "For Enhancement", "dev_strategy": "Outsourced / Service Provider", "computing_scheme": "Cloud Computing", "owners": "HRMO"}
                ]

            for idx, sys_item in enumerate(systems_list):
                anchor_tag = 'id="part-2-b-c-databases"' if idx == 0 else ""
                html_output += f'''
                <div class="databases-layout" style="page-break-after: always; padding-top: 10px;" {anchor_tag}>
                    <h2 class="section-title">
                        PART II.B: DETAILED DESCRIPTION OF PROPOSED SYSTEM
                    </h2>
                    <table style="width: 100%; border-collapse: collapse; margin-top: 15px; border-left: 4px solid #3b82f6;">
                        <tr>
                            <th colspan="2" style="font-size: 9.5pt; padding: 8px 12px; background-color: #1e3a8a; color: white;">APPLICATION PROFILE CARD</th>
                        </tr>
                        <tr>
                            <td style="width: 30%; font-weight: bold; background-color: #f8fafc; font-size: 9pt; border: 1px solid #e2e8f0;">Name of System / Sub-System</td>
                            <td style="font-size: 9pt; font-weight: bold; color: #1e3a8a; border: 1px solid #e2e8f0;">{sys_item.get("name", "")}</td>
                        </tr>
                        <tr>
                            <td style="font-weight: bold; background-color: #f8fafc; font-size: 9pt; border: 1px solid #e2e8f0;">Target Functional Scope</td>
                            <td style="font-size: 8.5pt; text-align: justify; border: 1px solid #e2e8f0; line-height: 1.5;">{sys_item.get("description", "")}</td>
                        </tr>
                        <tr>
                            <td style="font-weight: bold; background-color: #f8fafc; font-size: 9pt; border: 1px solid #e2e8f0;">Development Status</td>
                            <td style="font-size: 8.5pt; border: 1px solid #e2e8f0;">{sys_item.get("status", "")}</td>
                        </tr>
                        <tr>
                            <td style="font-weight: bold; background-color: #f8fafc; font-size: 9pt; border: 1px solid #e2e8f0;">Development Strategy</td>
                            <td style="font-size: 8.5pt; border: 1px solid #e2e8f0;">{sys_item.get("dev_strategy", "")}</td>
                        </tr>
                        <tr>
                            <td style="font-weight: bold; background-color: #f8fafc; font-size: 9pt; border: 1px solid #e2e8f0;">Computing Scheme / Hosting</td>
                            <td style="font-size: 8.5pt; border: 1px solid #e2e8f0;">{sys_item.get("computing_scheme", "")}</td>
                        </tr>
                        <tr>
                            <td style="font-weight: bold; background-color: #f8fafc; font-size: 9pt; border: 1px solid #e2e8f0;">Responsible Business Owner</td>
                            <td style="font-size: 8.5pt; font-weight: bold; color: #1e3a8a; border: 1px solid #e2e8f0;">{sys_item.get("owners", "")}</td>
                        </tr>
                    </table>
                </div>
                '''

            # Database Specification Sheets (Part II.C)
            databases_list = metadata.get("databases_json") or []
            if not databases_list:
                databases_list = [
                    {"name": "Student Information and Accounting System (SIAS) Database", "description": "Student academic demographics, transaction records, and enrollment indexes.", "status": "Existing", "is_served": "Student Information and Accounting System (SIAS)", "storage_media": "High-End Data Storage Server"},
                    {"name": "Online Library Information Systems Database", "description": "Catalogs of academic book indexes, borrowing transaction logs, and fine matrices.", "status": "Existing", "is_served": "Online Library Information Systems", "storage_media": "High-End Data Storage Server"},
                    {"name": "School Monitoring and Security Database", "description": "Security logs, gate visitor entries, and smart card permissions registries.", "status": "Proposed", "is_served": "School Monitoring and Security System", "storage_media": "High-End Data Storage Server"},
                    {"name": "Human Resource Management Database", "description": "Facilitates employee biometrics logs, payroll files, and tax matrices.", "status": "Proposed", "is_served": "School Monitoring and Security System", "storage_media": "High-End Data Storage Server"},
                    {"name": "Human Resource Management Database", "description": "Stores employee profiles, biometric signatures, tax records, and payroll sheets.", "status": "Proposed", "is_served": "Human Resource Management System", "storage_media": "High-End Data Storage Server"}
                ]

            for idx, db_item in enumerate(databases_list):
                html_output += f'''
                <div class="databases-layout" style="page-break-after: always; padding-top: 10px;">
                    <h2 class="section-title">
                        PART II.C: REQUIRED DATABASES & REGISTRIES
                    </h2>
                    <table style="width: 100%; border-collapse: collapse; margin-top: 15px; border-left: 4px solid #0d9488;">
                        <tr>
                            <th colspan="2" style="font-size: 9.5pt; padding: 8px 12px; background-color: #0d9488; color: white;">DATABASE SPECIFICATION SHEET</th>
                        </tr>
                        <tr>
                            <td style="width: 30%; font-weight: bold; background-color: #f8fafc; font-size: 9pt; border: 1px solid #e2e8f0;">Database / Registry Title</td>
                            <td style="font-size: 9pt; font-weight: bold; color: #0d9488; border: 1px solid #e2e8f0;">{db_item.get("name", "")}</td>
                        </tr>
                        <tr>
                            <td style="font-weight: bold; background-color: #f8fafc; font-size: 9pt; border: 1px solid #e2e8f0;">Information Contained</td>
                            <td style="font-size: 8.5pt; text-align: justify; border: 1px solid #e2e8f0; line-height: 1.5;">{db_item.get("description", "")}</td>
                        </tr>
                        <tr>
                            <td style="font-weight: bold; background-color: #f8fafc; font-size: 9pt; border: 1px solid #e2e8f0;">Operational Status</td>
                            <td style="font-size: 8.5pt; border: 1px solid #e2e8f0;">{db_item.get("status", "")}</td>
                        </tr>
                        <tr>
                            <td style="font-weight: bold; background-color: #f8fafc; font-size: 9pt; border: 1px solid #e2e8f0;">Application Systems Served</td>
                            <td style="font-size: 8.5pt; font-weight: bold; color: #1e3a8a; border: 1px solid #e2e8f0;">{db_item.get("is_served", "")}</td>
                        </tr>
                        <tr>
                            <td style="font-weight: bold; background-color: #f8fafc; font-size: 9pt; border: 1px solid #e2e8f0;">Storage & Backup Media</td>
                            <td style="font-size: 8.5pt; border: 1px solid #e2e8f0;">{db_item.get("storage_media", "")}</td>
                        </tr>
                    </table>
                </div>
                '''

            return html_output

        # 8. Part III: Detailed Description of ICT Projects & PMF
        elif schema_id == "part_3_ict_projects":
            int_projects = metadata.get("internal_projects_json") or []
            cross_projects = metadata.get("cross_projects_json") or []
            
            if not int_projects:
                int_projects = [
                    {"name": "Deployment of Moodle-Based Learning Management System", "duration": "2026 - 2028", "deliverables": "Online Learning Space (LeOnS)", "objectives": "To allow online distance teaching and learning\\nTo automate grading class record computations"},
                    {"name": "Upgrade Leased Line Bandwidth", "duration": "2026 - 2028", "deliverables": "Leased Line Internet", "objectives": "To provide more efficient online transactions\\nTo support online distance learning"},
                    {"name": "WiFi Campus Network Installation", "duration": "2026 - 2028", "deliverables": "WiFi Campus Network", "objectives": "To ensure availability of wireless connection\\nTo help students and teachers in fast access"}
                ]

            projects_html = ""
            for proj in int_projects:
                objs = proj.get("objectives", "").split("\\n")
                objectives_list = "".join(f"<li>{obj.strip()}</li>" for obj in objs if obj.strip())
                objectives_list_html = f'<ul style="margin: 15px 0 0 15px; padding: 0; font-size: 9.5pt; color: #475569; line-height:1.5;">{objectives_list}</ul>' if objectives_list else ""
                
                projects_html += f'''
                <div class="projects-layout" style="page-break-after: always; padding: 20px; border: 1px solid #e2e8f0; border-top: 4px solid #1e3a8a; border-radius: 8px; background-color: #f8fafc; box-sizing: border-box;">
                    <div style="font-weight: bold; color: #1e3a8a; font-size: 11pt; margin-bottom: 8px; text-transform: uppercase;">[INTERNAL PROJECT CARD] {proj.get("name", "")}</div>
                    <div style="font-size: 9.5pt; color: #475569; margin-bottom: 6px;"><strong>Duration Cycle:</strong> {proj.get("duration", "2026 - 2028")}</div>
                    <div style="font-size: 9.5pt; color: #334155; margin-bottom: 12px;"><strong>Target Deliverables:</strong> {proj.get("deliverables", "")}</div>
                    <h5 style="margin: 0; font-size: 9.5pt; font-weight: bold; color: #1e3a8a; border-bottom: 1px dashed #cbd5e1; padding-bottom: 4px;">Project Objectives</h5>
                    {objectives_list_html}
                </div>
                '''

            for proj in cross_projects:
                objs = proj.get("objectives", "").split("\\n")
                objectives_list = "".join(f"<li>{obj.strip()}</li>" for obj in objs if obj.strip())
                objectives_list_html = f'<ul style="margin: 15px 0 0 15px; padding: 0; font-size: 9.5pt; color: #475569; line-height:1.5;">{objectives_list}</ul>' if objectives_list else ""
                
                projects_html += f'''
                <div class="projects-layout" style="page-break-after: always; padding: 20px; border: 1px solid #0d9488; border-top: 4px solid #0d9488; border-radius: 8px; background-color: #f8fafc; box-sizing: border-box;">
                    <div style="font-weight: bold; color: #0d9488; font-size: 11pt; margin-bottom: 8px; text-transform: uppercase;">[CROSS-AGENCY PROJECT CARD] {proj.get("name", "")}</div>
                    <div style="font-size: 9.5pt; color: #334155; margin-6px;"><strong>Lead Entity:</strong> {proj.get("lead_agency", "CSPC")}</div>
                    <div style="font-size: 9.5pt; color: #334155; margin-bottom: 12px;"><strong>Target Deliverables:</strong> {proj.get("deliverables", "")}</div>
                    <h5 style="margin: 0; font-size: 9.5pt; font-weight: bold; color: #0d9488; border-bottom: 1px dashed #cbd5e1; padding-bottom: 4px;">Project Objectives</h5>
                    {objectives_list_html}
                </div>
                '''

            pmf_metrics = metadata.get("pmf_matrix_json") or []
            if not pmf_metrics:
                pmf_metrics = [
                    {"project_title": "Deployment of Moodle LMS", "result_hierarchy": "Immediate outcome", "indicator": "Percentage of courses using the LMS", "baseline": "10% of courses", "target": "100% adoption", "collection_method": "Survey/Logs", "responsibility": "MICT Office"},
                    {"project_title": "Upgrade Leased Line Internet Bandwidth", "result_hierarchy": "Immediate outcome", "indicator": "Average bandwidth speed in administrative offices", "baseline": "20 Mbps", "target": "100 Mbps", "collection_method": "Speed test logs", "responsibility": "MICT Office"}
                ]

            grouped_pmf: Dict[str, List[Any]] = {}
            for row in pmf_metrics:
                grouped_pmf.setdefault(row.get("project_title", "General Operations"), []).append(row)

            pmf_page_html = ""
            for idx, (project_title, rows) in enumerate(grouped_pmf.items()):
                pmf_rows = ""
                for pmf in rows:
                    pmf_rows += f'''
                    <tr>
                        <td style="padding: 8px; border: 1px solid #cbd5e1; font-size: 8pt; vertical-align: top; font-weight: bold; color: #1e3a8a;">{pmf.get("result_hierarchy", "")}</td>
                        <td style="padding: 8px; border: 1px solid #cbd5e1; font-size: 8pt; vertical-align: top;">{pmf.get("indicator", "")}</td>
                        <td style="padding: 8px; border: 1px solid #cbd5e1; font-size: 8pt; text-align: center; vertical-align: top;">{pmf.get("baseline", "")}</td>
                        <td style="padding: 8px; border: 1px solid #cbd5e1; font-size: 8pt; text-align: center; vertical-align: top; font-weight: bold; color: #1e3a8a;">{pmf.get("target", "")}</td>
                        <td style="padding: 8px; border: 1px solid #cbd5e1; font-size: 8pt; vertical-align: top;">{pmf.get("collection_method", "")}</td>
                        <td style="padding: 8px; border: 1px solid #cbd5e1; font-size: 8pt; vertical-align: top; color: #475569;">{pmf.get("responsibility", "")}</td>
                    </tr>
                    '''

                anchor_attr = 'id="pmf-anchor"' if idx == 0 else ""
                pmf_page_html += f'''
                <div style="page-break-after: always; padding-top: 10px;" {anchor_attr}>
                    <h4 class="sub-section-title">III.C. Performance Measurement Framework (PMF)</h4>
                    <div style="font-size: 9.5pt; color: #475569; font-weight: bold; margin-bottom: 8px; text-transform: uppercase;">PROJECT: {project_title}</div>
                    <table style="width: 100%; border-collapse: collapse; margin-top: 5px;">
                        <thead>
                            <tr style="background-color: #f0f7ff; text-align: left; font-weight: bold;">
                                <th style="padding: 8px; border: 1px solid #cbd5e1; font-size: 8.5pt; width: 15%; color: #1e3a8a;">Result Hierarchy</th>
                                <th style="padding: 8px; border: 1px solid #cbd5e1; font-size: 8.5pt; width: 30%; color: #1e3a8a;">Verifiable Indicator (OVI)</th>
                                <th style="padding: 8px; border: 1px solid #cbd5e1; font-size: 8.5pt; text-align: center; width: 10%; color: #1e3a8a;">Baseline</th>
                                <th style="padding: 8px; border: 1px solid #cbd5e1; font-size: 8.5pt; text-align: center; width: 10%; color: #1e3a8a;">Target</th>
                                <th style="padding: 8px; border: 1px solid #cbd5e1; font-size: 8.5pt; width: 20%; color: #1e3a8a;">Collection Method</th>
                                <th style="padding: 8px; border: 1px solid #cbd5e1; font-size: 8.5pt; width: 15%; color: #1e3a8a;">Responsibility</th>
                            </tr>
                        </thead>
                        <tbody>
                            {pmf_rows}
                        </tbody>
                    </table>
                </div>
                '''

            return f'''
            <div class="projects-layout" id="part_3_ict_projects">
                <h2 class="section-title">
                    PART III: DETAILED DESCRIPTION OF ICT PROJECTS
                </h2>
                
                <h4 class="sub-section-title">III.A & III.B. Proposed Project Profiles</h4>
                {projects_html or '<p style="font-size: 9.5pt; color: #94a3b8; font-style: italic;">No project profiles configured.</p>'}
            </div>
            {pmf_page_html}
            '''

        # 9. Part IV.B: ICT Organizational Charts (Landscape Layout)
        elif schema_id == "part_4_b_org_structure":
            existing_img = metadata.get("existing_ict_org_url")
            proposed_img = metadata.get("proposed_ict_org_url")
            placement_img = metadata.get("placement_ict_org_url")

            staff_rows = ""
            for sp in metadata.get("staff_positions_json", []):
                staff_rows += f'''
                <tr>
                    <td style="padding: 6px; border: 1px solid #cbd5e1; font-weight: bold; color: #1e3a8a;">{sp.get("position_title", "")}</td>
                    <td style="padding: 6px; border: 1px solid #cbd5e1; text-align: center;">{sp.get("status", "")}</td>
                    <td style="padding: 6px; border: 1px solid #cbd5e1; text-align: center; font-weight: bold;">{sp.get("count", 1)}</td>
                </tr>
                '''

            staff_table_html = ""
            if staff_rows:
                staff_table_html = f'''
                <h4 class="sub-section-title" style="margin-top: 25px;">IV.B Relational Staffing Headcounts and Classifications</h4>
                <table style="width: 100%; border-collapse: collapse; margin-top: 10px;">
                    <thead>
                        <tr style="background-color: #f0f7ff; text-align: left; font-weight: bold;">
                            <th style="padding: 6px; border: 1px solid #cbd5e1; font-size: 8.5pt; color: #1e3a8a;">Official Position Title</th>
                            <th style="padding: 6px; border: 1px solid #cbd5e1; font-size: 8.5pt; text-align: center; color: #1e3a8a;">Classification Status</th>
                            <th style="padding: 6px; border: 1px solid #cbd5e1; font-size: 8.5pt; text-align: center; color: #1e3a8a;">Total Headcount Count</th>
                        </tr>
                    </thead>
                    <tbody>
                        {staff_rows}
                    </tbody>
                </table>
                '''

            html_out = '<div class="org-structure-layout" id="part_4_b_org_structure">'
            html_out += '<h2 class="section-title">PART IV.B: ICT ORGANIZATIONAL STRUCTURE</h2>'
            
            if existing_img:
                html_out += f'''
                <div class="full-page-media" style="page-break-inside: avoid; page-break-after: always;">
                    <h4 class="sub-section-title">Existing ICT Organizational Structure</h4>
                    <div class="image-wrapper">
                        <img src="{existing_img}" alt="Existing ICT Org Chart" />
                    </div>
                </div>
                '''
            if proposed_img:
                html_out += f'''
                <div class="full-page-media" style="page-break-inside: avoid; page-break-after: always;">
                    <h4 class="sub-section-title">Proposed ICT Organizational Structure</h4>
                    <div class="image-wrapper">
                        <img src="{proposed_img}" alt="Proposed ICT Org Chart" />
                    </div>
                </div>
                '''
            if placement_img:
                html_out += f'''
                <div class="full-page-media" style="page-break-inside: avoid; page-break-after: always;">
                    <h4 class="sub-section-title">Placement of Proposed Structure in Institutional Chart</h4>
                    <div class="image-wrapper">
                        <img src="{placement_img}" alt="Placement in Institutional Chart" />
                    </div>
                </div>
                '''

            html_out += staff_table_html

            if not existing_img and not proposed_img and not placement_img and not staff_rows:
                html_out += '<p style="color: #64748b; font-style: italic; text-align: center; margin-top: 50px;">No organizational structure charts configured.</p>'
                
            html_out += '</div>'
            return html_out

        # 10. Part V.A & V.B: Gantt Milestones Schedules (Landscape Layout)
        elif schema_id == "part_5_schedules":
            year_colspan_headers = "".join(f'<th colspan="4" style="font-size: 8pt; padding: 6px; color: #ffffff; border: 1px solid #cbd5e1;">FY {year}</th>' for year in planning_years)
            
            dynamic_q_width = 65 / (4 * len(planning_years)) if planning_years else 5
            quarters_headers = "".join(
                "".join(f'<th style="padding: 4px; color: #ffffff; border: 1px solid #cbd5e1; width: {dynamic_q_width}%;">{q}</th>' for q in ["Q1", "Q2", "Q3", "Q4"])
                for year in planning_years
            )
            
            schedule_rows = ""
            for sched in metadata.get("implementation_schedules", []):
                milestones = sched.get("milestones") or {}
                milestones_cells = ""
                for year in planning_years:
                    for q in ["Q1", "Q2", "Q3", "Q4"]:
                        key = f"{year}_{q}"
                        bg_style = f'style="border: 1px solid #cbd5e1; background-color: #3b82f6; width: {dynamic_q_width}%;"' if milestones.get(key) else f'style="border: 1px solid #cbd5e1; width: {dynamic_q_width}%;"'
                        milestones_cells += f'<td {bg_style}>{"&nbsp;" if milestones.get(key) else ""}</td>'

                schedule_rows += f'''
                <tr>
                    <td style="font-weight: bold; font-size: 8pt; text-align: left; padding: 6px; border: 1px solid #cbd5e1; color: #1e3a8a;">{sched.get("project_name", "")}</td>
                    {milestones_cells}
                </tr>
                '''
            total_cols = 1 + (4 * len(planning_years))
            fallback_rows_html = f'<tr><td colspan="{total_cols}" style="padding:12px; color:#64748b;">No schedule timeline parameters defined.</td></tr>'
            
            return f'''
            <div class="schedules-layout" id="part_5_schedules">
                <h2 class="section-title">
                    Part V: DEVELOPMENT & IMPLEMENTATION PROGRAM SCHEDULES
                </h2>
                <h4 class="sub-section-title">V.A & V.B. ICT Projects and IS Implementation Schedules</h4>
                <table style="width: 100%; border-collapse: collapse; text-align: center; margin-top: 10px;">
                    <thead>
                        <tr style="background-color: #1e3a8a; color: white;">
                            <th rowspan="2" style="font-size: 8.5pt; padding: 8px; width: 35%; color: #ffffff; border: 1px solid #cbd5e1;">Project Name / IS Module</th>
                            {year_colspan_headers}
                        </tr>
                        <tr style="background-color: #334155; color: white; font-size: 7.5pt;">
                            {quarters_headers}
                        </tr>
                    </thead>
                    <tbody>
                        {schedule_rows or fallback_rows_html}
                    </tbody>
                </table>
            </div>
            '''

        # 11. Part V: Detailed Summary of Investments (Landscape Layout)
        elif schema_id in ["part_4_5_resources", "part_5_investments"]:
            dynamic_col_width = 18 / len(planning_years) if planning_years else 6
            
            capex_year_headers = "".join(f'<th style="padding: 6px; border: 1px solid #cbd5e1; font-size: 8pt; text-align: center; color: #1e3a8a; width: {dynamic_col_width}%;">FY {year} Qty</th>' for year in planning_years)
            mooe_year_headers = "".join(f'<th style="padding: 6px; border: 1px solid #cbd5e1; font-size: 8pt; text-align: center; color: #0d9488; width: {dynamic_col_width}%;">FY {year} Users</th>' for year in planning_years)
            
            # --- CAPEX (HARDWARE) SECTION GROUPED BY PROJECT KEY ---
            capex_groups: Dict[str, List[Any]] = {}
            for p in proposals:
                pkey = p.project_key or "General SUC Operations"
                capex_groups.setdefault(pkey, []).append(p)

            capex_rows = ""
            capex_total = Decimal("0.00")
            
            for project_key, items in capex_groups.items():
                project_label = project_key.replace("_", " ").upper()
                
                project_label_tr_html = f'''
                <tr style="background-color: #f8fafc; font-weight: bold; border-left: 3px solid #1e3a8a;">
                    <td colspan="{5 + len(planning_years)}" style="padding: 6px; border: 1px solid #cbd5e1; font-size: 8.5pt; text-align: left; color: #1e3a8a;">
                        PROJECT OUTLAY: {project_label}
                    </td>
                </tr>
                '''
                
                capex_rows += project_label_tr_html
                for idx, p in enumerate(items):
                    total_qty = p.total_qty if p.total_qty else sum(p.yearly_quantities.values())
                    subtotal = p.unit_cost * total_qty
                    capex_total += subtotal
                    
                    deployments = getattr(p, "deployments_relation", []) or []
                    offices_str = ", ".join([f"{d.office_name} ({d.quantity})" for d in deployments]) if deployments else "General Allocation"
                    
                    qty_cells = "".join(f'<td style="padding: 6px; border: 1px solid #cbd5e1; font-size: 8pt; text-align: center; width: {dynamic_col_width}%;">{p.yearly_quantities.get(str(year), 0)}</td>' for year in planning_years)
                    
                    capex_rows += f'''
                    <tr>
                        <td style="padding: 6px; border: 1px solid #cbd5e1; font-size: 8pt; text-align: center;">{idx + 1}</td>
                        <td style="padding: 6px; border: 1px solid #cbd5e1; font-size: 8pt; font-weight: bold; color: #334155;">{p.department.name if p.department else "Admin"}</td>
                        <td style="padding: 6px; border: 1px solid #cbd5e1; font-size: 8pt;">{p.item_name}</td>
                        <td style="padding: 6px; border: 1px solid #cbd5e1; font-size: 7.5pt; color: #475569;">{offices_str}</td>
                        {qty_cells}
                        <td style="padding: 6px; border: 1px solid #cbd5e1; font-size: 8pt; text-align: right;">₱{p.unit_cost:,.2f}</td>
                        <td style="padding: 6px; border: 1px solid #cbd5e1; font-size: 8pt; text-align: right; font-weight: bold; color: #1e3a8a;">₱{subtotal:,.2f}</td>
                    </tr>
                    '''

            # --- MOOE (SOFTWARE) SECTION GROUPED BY PROJECT KEY ---
            mooe_groups: Dict[str, List[Any]] = {}
            for s in subscriptions:
                pkey = s.project_key or "General SUC Operations"
                mooe_groups.setdefault(pkey, []).append(s)

            mooe_rows = ""
            mooe_total = Decimal("0.00")
            
            for project_key, items in mooe_groups.items():
                project_label = project_key.replace("_", " ").upper()
                
                project_label_tr_html = f'''
                <tr style="background-color: #f0fdfa; font-weight: bold; border-left: 3px solid #0d9488;">
                    <td colspan="{5 + len(planning_years)}" style="padding: 6px; border: 1px solid #cbd5e1; font-size: 8.5pt; text-align: left; color: #0d9488;">
                        PROJECT OUTLAY: {project_label}
                    </td>
                </tr>
                '''
                
                mooe_rows += project_label_tr_html
                for idx, sub in enumerate(items):
                    total_seats = sum(sub.yearly_users.values())
                    subtotal = total_seats * sub.annual_cost_per_user
                    mooe_total += subtotal
                    
                    offices_str = ", ".join(sub.target_offices_json) if sub.target_offices_json else "General Allocation"
                    user_cells = "".join(f'<td style="padding: 6px; border: 1px solid #cbd5e1; font-size: 8pt; text-align: center; width: {dynamic_col_width}%;">{sub.yearly_users.get(str(year), 0)}</td>' for year in planning_years)
                    
                    mooe_rows += f'''
                    <tr>
                        <td style="padding: 6px; border: 1px solid #cbd5e1; font-size: 8pt; text-align: center;">{idx + 1}</td>
                        <td style="padding: 6px; border: 1px solid #cbd5e1; font-size: 8pt; font-weight: bold; color: #334155;">{sub.department.name if sub.department else "Admin"}</td>
                        <td style="padding: 6px; border: 1px solid #cbd5e1; font-size: 8pt;">{sub.software_name}</td>
                        <td style="padding: 6px; border: 1px solid #cbd5e1; font-size: 7.5pt; color: #475569;">{offices_str}</td>
                        {user_cells}
                        <td style="padding: 6px; border: 1px solid #cbd5e1; font-size: 8pt; text-align: right;">₱{sub.annual_cost_per_user:,.2f}</td>
                        <td style="padding: 6px; border: 1px solid #cbd5e1; font-size: 8pt; text-align: right; font-weight: bold; color: #0d9488;">₱{subtotal:,.2f}</td>
                    </tr>
                    '''

            # --- CONTINUING COSTS SECTION ---
            continuing_costs = metadata.get("annual_costs_breakdown") or []
            continuing_rows = ""
            continuing_total = Decimal("0.00")
            
            for idx, cc in enumerate(continuing_costs):
                cc_unit_cost = Decimal(str(cc.get("unit_cost", "0.00")))
                yearly_qty = cc.get("yearly_quantities") or {}
                total_qty = sum(int(q) for q in yearly_qty.values())
                subtotal = cc_unit_cost * total_qty
                continuing_total += subtotal
                
                qty_cells = "".join(f'<td style="padding: 6px; border: 1px solid #cbd5e1; font-size: 8pt; text-align: center; width: {dynamic_col_width}%;">{yearly_qty.get(str(year), 0)}</td>' for year in planning_years)
                
                continuing_rows += f'''
                <tr>
                    <td style="padding: 6px; border: 1px solid #cbd5e1; font-size: 8pt; text-align: center;">{idx + 1}</td>
                    <td style="padding: 6px; border: 1px solid #cbd5e1; font-size: 8pt; font-weight: bold; color: #334155;">{cc.get("project_key", "")}</td>
                    <td style="padding: 6px; border: 1px solid #cbd5e1; font-size: 8pt;">{cc.get("item_description", "")}</td>
                    <td style="padding: 6px; border: 1px solid #cbd5e1; font-size: 7.5pt; color: #475569;">SUC Utilities</td>
                    {qty_cells}
                    <td style="padding: 6px; border: 1px solid #cbd5e1; font-size: 8pt; text-align: right;">₱{cc_unit_cost:,.2f}</td>
                    <td style="padding: 6px; border: 1px solid #cbd5e1; font-size: 8pt; text-align: right; font-weight: bold; color: #475569;">₱{subtotal:,.2f}</td>
                </tr>
                '''

            grand_total = capex_total + mooe_total + continuing_total
            total_cols_span = 5 + len(planning_years)
            
            capex_rows_fallback_html = f'<tr><td colspan="{5 + len(planning_years)}" style="padding:10px; text-align:center; color:#94a3b8;">No capital outlay proposals approved.</td></tr>'
            mooe_rows_fallback_html = f'<tr><td colspan="{5 + len(planning_years)}" style="padding:10px; text-align:center; color:#94a3b8;">No software subscription proposals approved.</td></tr>'
            continuing_rows_fallback_html = f'<tr><td colspan="{5 + len(planning_years)}" style="padding:10px; text-align:center; color:#94a3b8;">No continuing SUC operational costs logged.</td></tr>'

            return f'''
            <div class="investments-layout" id="part_5_investments">
                <h2 class="section-title">
                    PART V: COMPREHENSIVE SUMMARY OF INVESTMENTS
                </h2>

                <h4 class="sub-section-title">Capital Outlay - Hardware Acquisitions (CapEx Grouped by Project)</h4>
                <table style="width: 100%; border-collapse: collapse; margin-bottom: 25px;">
                    <thead>
                        <tr style="background-color: #f0f7ff; text-align: left; font-weight: bold;">
                            <th style="padding: 6px; border: 1px solid #cbd5e1; font-size: 8pt; width: 3%; text-align: center; color: #1e3a8a;">#</th>
                            <th style="padding: 6px; border: 1px solid #cbd5e1; font-size: 8pt; width: 15%; color: #1e3a8a;">Department</th>
                            <th style="padding: 6px; border: 1px solid #cbd5e1; font-size: 8pt; width: 22%; color: #1e3a8a;">Hardware Description</th>
                            <th style="padding: 6px; border: 1px solid #cbd5e1; font-size: 8pt; width: 20%; color: #1e3a8a;">Deployment Target Units</th>
                            {capex_year_headers}
                            <th style="padding: 6px; border: 1px solid #cbd5e1; font-size: 8pt; text-align: right; width: 10%; color: #1e3a8a;">Unit Cost</th>
                            <th style="padding: 6px; border: 1px solid #cbd5e1; font-size: 8pt; text-align: right; width: 12%; color: #1e3a8a;">CapEx Subtotal</th>
                        </tr>
                    </thead>
                    <tbody>
                        {capex_rows or capex_rows_fallback_html}
                        <tr style="background-color: #f8fafc; font-weight: bold;">
                            <td colspan="{total_cols_span}" style="padding: 8px; border: 1px solid #cbd5e1; font-size: 8.5pt; text-align: right; color: #1e3a8a;">TOTAL CAPEX VALUE:</td>
                            <td style="padding: 8px; border: 1px solid #cbd5e1; font-size: 8.5pt; text-align: right; color: #1e3a8a;">₱{capex_total:,.2f}</td>
                        </tr>
                    </tbody>
                </table>

                <h4 class="sub-section-title">Software/Cloud Subscriptions (MOOE Grouped by Project)</h4>
                <table style="width: 100%; border-collapse: collapse; margin-bottom: 25px;">
                    <thead>
                        <tr style="background-color: #f0f7ff; text-align: left; font-weight: bold;">
                            <th style="padding: 6px; border: 1px solid #cbd5e1; font-size: 8pt; width: 3%; text-align: center; color: #0d9488;">#</th>
                            <th style="padding: 6px; border: 1px solid #cbd5e1; font-size: 8pt; width: 15%; color: #0d9488;">Department</th>
                            <th style="padding: 6px; border: 1px solid #cbd5e1; font-size: 8pt; width: 22%; color: #0d9488;">Software & Service Profile</th>
                            <th style="padding: 6px; border: 1px solid #cbd5e1; font-size: 8pt; width: 20%; color: #0d9488;">Deployment Target Units</th>
                            {mooe_year_headers}
                            <th style="padding: 6px; border: 1px solid #cbd5e1; font-size: 8pt; text-align: right; width: 10%; color: #0d9488;">Unit Rate/Yr</th>
                            <th style="padding: 6px; border: 1px solid #cbd5e1; font-size: 8pt; text-align: right; width: 12%; color: #0d9488;">MOOE Subtotal</th>
                        </tr>
                    </thead>
                    <tbody>
                        {mooe_rows or mooe_rows_fallback_html}
                        <tr style="background-color: #f8fafc; font-weight: bold;">
                            <td colspan="{total_cols_span}" style="padding: 8px; border: 1px solid #cbd5e1; font-size: 8.5pt; text-align: right; color: #0d9488;">TOTAL MOOE VALUE:</td>
                            <td style="padding: 8px; border: 1px solid #cbd5e1; font-size: 8.5pt; text-align: right; color: #0d9488;">₱{mooe_total:,.2f}</td>
                        </tr>
                    </tbody>
                </table>

                <h4 class="sub-section-title">Continuing Institutional Costs</h4>
                <table style="width: 100%; border-collapse: collapse; margin-bottom: 25px;">
                    <thead>
                        <tr style="background-color: #f8fafc; text-align: left; font-weight: bold;">
                            <th style="padding: 6px; border: 1px solid #cbd5e1; font-size: 8pt; width: 3%; text-align: center;">#</th>
                            <th style="padding: 6px; border: 1px solid #cbd5e1; font-size: 8pt; width: 15%;">Project Key</th>
                            <th style="padding: 6px; border: 1px solid #cbd5e1; font-size: 8pt; width: 22%;">Operational Description</th>
                            <th style="padding: 6px; border: 1px solid #cbd5e1; font-size: 8pt; width: 20%;">Deployment Target</th>
                            {capex_year_headers}
                            <th style="padding: 6px; border: 1px solid #cbd5e1; font-size: 8pt; text-align: right;">Unit Rate</th>
                            <th style="padding: 6px; border: 1px solid #cbd5e1; font-size: 8pt; text-align: right;">Subtotal</th>
                        </tr>
                    </thead>
                    <tbody>
                        {continuing_rows or continuing_rows_fallback_html}
                        <tr style="background-color: #f8fafc; font-weight: bold;">
                            <td colspan="{total_cols_span}" style="padding: 8px; border: 1px solid #cbd5e1; font-size: 8.5pt; text-align: right;">TOTAL CONTINUING VALUE:</td>
                            <td style="padding: 8px; border: 1px solid #cbd5e1; font-size: 8.5pt; text-align: right;">₱{continuing_total:,.2f}</td>
                        </tr>
                    </tbody>
                </table>

                <div style="padding: 12px; background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 4px; text-align: right; font-weight: bold; display: flex; justify-content: flex-end; align-items: center;">
                    <span style="font-size: 10pt; color: #166534; text-transform: uppercase; margin-right: 15px;">Combined Multi-Year Budget Footprint:</span>
                    <span style="font-size: 13pt; color: #14532d;">₱{grand_total:,.2f}</span>
                </div>
            </div>
            '''
            
        # 12. Annex A-1: Technical Surveys & Equipment Inventories (Landscape Layout)
        elif schema_id == "annex_master":
            dynamic_inv_width = 60 / (2 * len(planning_years)) if planning_years else 10
            
            year_colspan_headers = "".join(f'<th colspan="2" style="padding: 6px; border: 1px solid #cbd5e1; font-size: 7.5pt; text-align: center; color: #1e3a8a; width: {dynamic_inv_width * 2}%;">FY {year}</th>' for year in planning_years)
            sub_year_headers = "".join(
                f'<th style="padding: 5px; border: 1px solid #cbd5e1; font-size: 7pt; color: #475569; width: {dynamic_inv_width}%;">Owned</th>'
                f'<th style="padding: 5px; border: 1px solid #cbd5e1; font-size: 7pt; color: #475569; width: {dynamic_inv_width}%;">Leased</th>'
                for year in planning_years
            )
            
            hardware_rows = ""
            for item in metadata.get("mithi_hardware_inventory", []):
                owned_map = item.get("yearly_owned") or {}
                leased_map = item.get("yearly_leased") or {}
                
                inventory_cells = "".join(f'<td style="padding: 5px; border: 1px solid #cbd5e1; font-size: 7.5pt; text-align: center;">{owned_map.get(str(year), 0)}</td><td style="padding: 5px; border: 1px solid #cbd5e1; font-size: 7.5pt; text-align: center;">{leased_map.get(str(year), 0)}</td>' for year in planning_years)
                
                hardware_rows += f'''
                <tr>
                    <td style="padding: 5px; border: 1px solid #cbd5e1; font-size: 7.5pt; font-weight: bold; color: #334155;">{item.get("device_type", "")}</td>
                    {inventory_cells}
                    <td style="padding: 5px; border: 1px solid #cbd5e1; font-size: 7.5pt; text-align: center;">{item.get("older_than_3_years", 0)}</td>
                </tr>
                '''
            
            lan_status = "YES" if metadata.get("mithi_network_profile", {}).get("has_lan") else "NO"
            intranet_status = "YES" if metadata.get("mithi_network_profile", {}).get("has_intranet") else "NO"
            vpn_status = "YES" if metadata.get("mithi_network_profile", {}).get("has_vpn") else "NO"
            internet_status = "YES" if metadata.get("mithi_network_profile", {}).get("is_connected_to_internet") else "NO"

            network_block = f'''
            <div style="margin-top: 15px; font-size: 8.5pt;">
                <h5 style="margin-bottom: 5px; color: #1e3a8a; font-weight: bold;">DICT Annex A-1 Connectivity Profile</h5>
                <p>LAN Active: <strong>{lan_status}</strong> | Intranet Portal: <strong>{intranet_status}</strong> | VPN Tunneling: <strong>{vpn_status}</strong> | Global Internet Connected: <strong>{internet_status}</strong></p>
            </div>
            '''

            server_capacities_html = ""
            for cap in metadata.get("server_capacities_json", []):
                server_capacities_html += f'''
                <tr>
                    <td style="padding: 5px; border: 1px solid #cbd5e1;">{cap.get("tier", "")}</td>
                    <td style="padding: 5px; border: 1px solid #cbd5e1;">{cap.get("location", "")}</td>
                    <td style="padding: 5px; border: 1px solid #cbd5e1; text-align: center; font-weight: bold; color: #1e3a8a;">{cap.get("quantity", 0)}</td>
                </tr>
                '''

            os_census_html = ""
            for osc in metadata.get("os_census_json", []):
                os_census_html += f'''
                <tr>
                    <td style="padding: 5px; border: 1px solid #cbd5e1;">{osc.get("os_name", "")}</td>
                    <td style="padding: 5px; border: 1px solid #cbd5e1; text-align: center;">{osc.get("workstations_count", 0)}</td>
                    <td style="padding: 5px; border: 1px solid #cbd5e1; text-align: center;">{osc.get("servers_count", 0)}</td>
                </tr>
                '''

            software_census_html = ""
            for swc in metadata.get("office_software_census_json", []):
                software_census_html += f'''
                <tr>
                    <td style="padding: 5px; border: 1px solid #cbd5e1;">{swc.get("software_name", "")}</td>
                    <td style="padding: 5px; border: 1px solid #cbd5e1; text-align: center; font-weight: bold; color: #0d9488;">{swc.get("license_count", 0)}</td>
                </tr>
                '''

            sec_dr = metadata.get("mithi_security_dr") or {}
            sec_list = [
                ("Security Policy / Guidelines", sec_dr.get("has_security_policy", False)),
                ("Disaster Recovery Plan", sec_dr.get("has_dr_plan", False)),
                ("Back-up Power Unit", sec_dr.get("has_back_up_power", False)),
                ("Digital Signatures", sec_dr.get("has_digital_signatures", False)),
                ("Symmetric Encryption", sec_dr.get("has_encryption", False)),
                ("Off-site Backups", sec_dr.get("has_offsite_backup", False)),
                ("Hardware Firewall", sec_dr.get("has_hardware_firewall", False)),
                ("Physical Access Controls", sec_dr.get("has_physical_access_control", False)),
                ("Software Firewall", sec_dr.get("has_software_firewall", False)),
                ("Secure Database Servers", sec_dr.get("has_secure_servers", False))
            ]
            
            sec_html = ""
            for label, checked in sec_list:
                chk_icon = "[✓]" if checked else "[ &nbsp; ]"
                sec_html += f'<div style="width: 48%; padding: 4px; font-family: monospace;">{chk_icon} {label}</div>'

            arch = metadata.get("mithi_data_archiving") or {}
            arch_status = "YES" if arch.get("has_archiving_system", False) else "NO"
            mode_val = arch.get("archiving_mode", "Manual")
            media_list = ", ".join(arch.get("archiving_medium", [])) if arch.get("archiving_medium") else "None"
            info_list = ", ".join(arch.get("archived_information", [])) if arch.get("archived_information") else "None"

            issues = metadata.get("mithi_ict_issues") or {}
            issues_list = [
                ("No budget or insufficient budget", issues.get("has_budget_issues", False)),
                ("Delay in release of funds", issues.get("has_procurement_issues", False)),
                ("Opposition or reluctance of stakeholders", issues.get("has_reluctant_stakeholders", False)),
                ("Lack of support by management", issues.get("has_management_support_issues", False)),
                ("Difficulty recruiting qualified personnel", issues.get("has_personnel_recruitment_issues", False)),
                ("Low level of ICT skills among employees", issues.get("has_employee_skills_issues", False)),
                ("Unavailability of required bandwidth", issues.get("has_bandwidth_issues", False)),
                ("Problems in contract/vendor management", issues.get("has_contract_management_issues", False))
            ]
            
            issues_html = ""
            for label, checked in issues_list:
                chk_icon = "[✓]" if checked else "[ &nbsp; ]"
                issues_html += f'<div style="width: 48%; padding: 4px; font-family: monospace;">{chk_icon} {label}</div>'

            # Build detailed landscape Annex structure
            annex_p1_html = f'''
            <div class="annex-master-layout" id="annex_master" style="page-break-after: always; padding-top: 10px;">
                <h2 class="section-title">DICT ANNEX A-1: 1.1 Computing Devices & Peripherals (Inventory Baseline)</h2>
                <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
                    <thead>
                        <tr style="background-color: #f0f7ff; text-align: left; font-weight: bold; border: 1px solid #cbd5e1;">
                            <th rowspan="2" style="padding: 6px; border: 1px solid #cbd5e1; font-size: 7.5pt; vertical-align: middle; color: #1e3a8a;">Equipment Classification</th>
                            {year_colspan_headers}
                            <th rowspan="2" style="padding: 6px; border: 1px solid #cbd5e1; font-size: 7.5pt; text-align: center; vertical-align: middle; color: #dc2626;">Obsolete (>3 Yrs)</th>
                        </tr>
                        <tr style="background-color: #f8fafc; font-weight: bold; text-align: center;">
                            {sub_year_headers}
                        </tr>
                    </thead>
                    <tbody>
                        {hardware_rows or f'<tr><td colspan="{2 + 2 * len(planning_years)}" style="text-align:center;">No equipment inventories catalogued.</td></tr>'}
                    </tbody>
                </table>
            </div>
            '''

            annex_p2_html = f'''
            <div style="page-break-after: always; padding-top: 10px;">
                <h2 class="section-title">DICT ANNEX A-1: 1.2 Computing Devices & Peripherals by Usage</h2>
                <p style="font-size: 9.5pt; line-height: 1.6; color:#475569;">Detailed breakdown mapping computing devices to specific operational usage profiles.</p>
                <table style="width:100%; border-collapse:collapse; margin-top:15px;">
                    <thead>
                        <tr style="background-color: #f0f7ff; font-weight:bold;">
                            <th style="padding:8px; border:1px solid #cbd5e1;">Equipment Type</th>
                            <th style="padding:8px; border:1px solid #cbd5e1; text-align:center;">Operations Staff</th>
                            <th style="padding:8px; border:1px solid #cbd5e1; text-align:center;">Training Classrooms</th>
                            <th style="padding:8px; border:1px solid #cbd5e1; text-align:center;">Frontline Services</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td style="padding:8px; border:1px solid #cbd5e1; font-weight:bold;">Desktop Computer Workstations</td>
                            <td style="padding:8px; border:1px solid #cbd5e1; text-align:center;">120 units</td>
                            <td style="padding:8px; border:1px solid #cbd5e1; text-align:center;">180 units</td>
                            <td style="padding:8px; border:1px solid #cbd5e1; text-align:center;">45 units</td>
                        </tr>
                        <tr>
                            <td style="padding:8px; border:1px solid #cbd5e1; font-weight:bold;">Faculty Workstation Laptops</td>
                            <td style="padding:8px; border:1px solid #cbd5e1; text-align:center;">40 units</td>
                            <td style="padding:8px; border:1px solid #cbd5e1; text-align:center;">50 units</td>
                            <td style="padding:8px; border:1px solid #cbd5e1; text-align:center;">10 units</td>
                        </tr>
                    </tbody>
                </table>
            </div>
            '''

            annex_p3_html = f'''
            <div style="page-break-after: always; padding-top: 10px;">
                <h2 class="section-title">DICT ANNEX A-1: 1.3 Server Hosting Storage Profile Census</h2>
                <table style="width: 100%; border-collapse: collapse; margin-top: 15px;">
                    <thead>
                        <tr style="background-color: #f0f7ff; font-weight: bold;">
                            <th style="padding:8px; border:1px solid #cbd5e1;">Capacity Tier Grouping</th>
                            <th style="padding:8px; border:1px solid #cbd5e1;">Physical Location</th>
                            <th style="padding:8px; border:1px solid #cbd5e1; text-align:center;">Active Server Headcount</th>
                        </tr>
                    </thead>
                    <tbody>
                        {server_capacities_html or '<tr><td colspan="3" style="text-align:center; padding:10px;">No server storage configurations recorded.</td></tr>'}
                    </tbody>
                </table>
            </div>
            '''

            annex_p4_html = f'''
            <div style="page-break-after: always; padding-top: 10px;">
                <h2 class="section-title">DICT ANNEX A-1: 2.1 Client OS Census & 2.2 Office Automation Software</h2>
                <div style="display:flex; gap:20px; justify-content:space-between; margin-top:15px;">
                    <div style="width:48%;">
                        <h5 style="margin:0 0 8px 0; color:#1e3a8a; font-size:9pt; font-weight:bold;">Operating System License Census</h5>
                        <table style="width:100%; border-collapse:collapse;">
                            <thead>
                                <tr style="background-color: #f1f5f9;">
                                    <th style="padding:6px; border:1px solid #cbd5e1;">OS Platform</th>
                                    <th style="padding:6px; border:1px solid #cbd5e1; text-align:center;">Workstations</th>
                                    <th style="padding:6px; border:1px solid #cbd5e1; text-align:center;">Servers</th>
                                </tr>
                            </thead>
                            <tbody>
                                {os_census_html or '<tr><td colspan="3" style="text-align:center;">No platform audits.</td></tr>'}
                            </tbody>
                        </table>
                    </div>
                    <div style="width:48%;">
                        <h5 style="margin:0 0 8px 0; color:#0d9488; font-size:9pt; font-weight:bold;">Office Automation Software Census</h5>
                        <table style="width:100%; border-collapse:collapse;">
                            <thead>
                                <tr style="background-color: #f1f5f9;">
                                    <th style="padding:6px; border:1px solid #cbd5e1;">Office Suite Name</th>
                                    <th style="padding:6px; border:1px solid #cbd5e1; text-align:center;">Licenses Active</th>
                                </tr>
                            </thead>
                            <tbody>
                                {software_census_html or '<tr><td colspan="2" style="text-align:center;">No license profiles.</td></tr>'}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
            '''

            annex_p5_html = f'''
            <div style="page-break-after: always; padding-top: 10px;">
                <h2 class="section-title">DICT ANNEX A-1: 3. Network Connectivity Profile</h2>
                {network_block}
                <table style="width: 100%; border-collapse: collapse; margin-top: 15px;">
                    <thead>
                        <tr style="background-color:#f0f7ff; font-weight:bold;">
                            <th style="padding:8px; border:1px solid #cbd5e1;">Internet Service Provider</th>
                            <th style="padding:8px; border:1px solid #cbd5e1; text-align:center;">Connection Type</th>
                            <th style="padding:8px; border:1px solid #cbd5e1; text-align:center;">Bandwidth Allocation</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td style="padding:8px; border:1px solid #cbd5e1; font-weight:bold; color:#1e3a8a;">PLDT Enterprise Leased Line</td>
                            <td style="padding:8px; border:1px solid #cbd5e1; text-align:center;">Fiber Optic</td>
                            <td style="padding:8px; border:1px solid #cbd5e1; text-align:center; font-weight:bold; color:#10b981;">100 Mbps Dedicated</td>
                        </tr>
                    </tbody>
                </table>
            </div>
            '''

            annex_p6_html = f'''
            <div style="page-break-after: always; padding-top: 10px;">
                <h2 class="section-title">DICT ANNEX A-1: 4. Security, Disaster Recovery & 5. Data Archiving</h2>
                <div style="border: 1px solid #cbd5e1; border-radius: 4px; padding: 12px; background-color: #f8fafc; margin-top:15px; page-break-inside:avoid;">
                    <div style="font-weight: bold; font-size: 8.5pt; color: #1e3a8a; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; margin-bottom: 8px;">Security, Disaster Recovery & Backup Protection Scheme Checklist</div>
                    <div style="display: flex; flex-wrap: wrap; justify-content: space-between; font-size: 7.5pt; line-height: 1.5; color: #334155;">
                        {sec_html}
                    </div>
                </div>
                <div style="border: 1px solid #cbd5e1; border-radius: 4px; padding: 12px; background-color: #f8fafc; margin-top:15px; page-break-inside:avoid;">
                    <div style="font-weight: bold; font-size: 8.5pt; color: #0d9488; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; margin-bottom: 8px;">SUC Data Archiving Systems Setup</div>
                    <div style="font-size: 7.5pt; line-height: 1.6; color: #334155; font-family: monospace;">
                        <p style="margin: 2px 0;">Active Archiving System: <strong>{arch_status}</strong></p>
                        <p style="margin: 2px 0;">Archiving Operational Mode: <strong>{mode_val}</strong></p>
                        <p style="margin: 2px 0;">Storage Media: <strong>{media_list}</strong></p>
                        <p style="margin: 2px 0;">Archived Data Classifications: <strong>{info_list}</strong></p>
                    </div>
                </div>
            </div>
            '''

            annex_p7_html = f'''
            <div style="padding-top: 10px;">
                <h2 class="section-title">DICT ANNEX A-1: 8.2 Issues & Bottlenecks Encountered in SUC ICT Implementations</h2>
                <div style="border: 1px solid #cbd5e1; border-radius: 4px; padding: 12px; background-color: #f8fafc; margin-top:15px;">
                    <div style="font-weight: bold; font-size: 8.5pt; color: #dc2626; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; margin-bottom: 8px;">8.2 Issues & Bottlenecks Checklist</div>
                    <div style="display: flex; flex-wrap: wrap; justify-content: space-between; font-size: 7.5pt; line-height: 1.5; color: #334155;">
                        {issues_html}
                    </div>
                </div>
            </div>
            '''

            return annex_p1_html + annex_p2_html + annex_p3_html + annex_p4_html + annex_p5_html + annex_p6_html + annex_p7_html

        # 13. Annex A-3: Core SUC Offices and Description of Functions (Landscape Layout)
        elif schema_id == "annex_a3_functions":
            offices_html = ""
            for office in metadata.get("core_offices_json", []):
                offices_html += f'''
                <div style="margin-bottom: 12px; page-break-inside: avoid; background-color: #f8fafc; padding: 12px; border: 1px solid #e2e8f0; border-left: 3px solid #3b82f6; border-radius: 4px;">
                    <h4 style="font-size: 10pt; color: #1e3a8a; margin-bottom: 4px; text-transform: uppercase; font-weight: bold;">
                        {office.get("office_name", "")} ({office.get("division", "Administration")})
                    </h4>
                    <p style="font-size: 8.5pt; text-align: justify; line-height: 1.5; color: #334155; margin: 0;">
                        {office.get("description", "")}
                    </p>
                </div>
                '''
            return f'''
            <div class="annex-a3-layout" id="annex_a3_functions" style="padding-top: 10px;">
                <h2 class="section-title">
                    ANNEX A-3: CORE OFFICES AND DESCRIPTION OF FUNCTIONS
                </h2>
                <div style="margin-top: 15px;">
                    {offices_html or '<p style="color:#64748b; font-style:italic;">No core offices or functions configured.</p>'}
                </div>
            </div>
            '''

        # 14. Annex A-4: SUC degree programs & GAA target indicators (Landscape Layout)
        elif schema_id == "annex_a4_programs":
            degrees_html = ""
            for deg in metadata.get("degree_offerings", []):
                degrees_html += f'''
                <tr>
                    <td style="padding: 6px; border: 1px solid #cbd5e1; font-weight: bold; color: #1e3a8a;">{deg.get("department", "")}</td>
                    <td style="padding: 6px; border: 1px solid #cbd5e1;">{deg.get("degree", "")}</td>
                    <td style="padding: 6px; border: 1px solid #cbd5e1; text-align: center;">{deg.get("level", "")}</td>
                    <td style="padding: 6px; border: 1px solid #cbd5e1; text-align: center; font-weight: bold; color: #10b981;">{deg.get("accreditation", "N/A")}</td>
                </tr>
                '''

            gaa_html = ""
            for target in metadata.get("gaa_performance", []):
                gaa_html += f'''
                <tr>
                    <td style="padding: 6px; border: 1px solid #cbd5e1;">{target.get("indicator", "")}</td>
                    <td style="padding: 6px; border: 1px solid #cbd5e1; text-align: center; font-weight: bold; color: #1e3a8a;">{target.get("target", "")}</td>
                </tr>
                '''

            return f'''
            <div class="annex-a4-layout" id="annex_a4_programs" style="padding-top: 10px;">
                <h2 class="section-title">
                    ANNEX A-4: SUC PROGRAM OFFERINGS & LEGISLATIVE GAA OUTCOMES
                </h2>

                <h4 class="sub-section-title">Active Degree Programs & CHED-Recognized Accreditation Levels</h4>
                <table style="width: 100%; border-collapse: collapse; margin-bottom: 25px;">
                    <thead>
                        <tr style="background-color: #f0f7ff; text-align: left; font-weight: bold;">
                            <th style="padding: 8px; border: 1px solid #cbd5e1; font-size: 8.5pt; width: 25%;">College / Department</th>
                            <th style="padding: 8px; border: 1px solid #cbd5e1; font-size: 8.5pt; width: 45%;">Academic Degree Offered</th>
                            <th style="padding: 8px; border: 1px solid #cbd5e1; font-size: 8.5pt; text-align: center; width: 15%;">Level</th>
                            <th style="padding: 8px; border: 1px solid #cbd5e1; font-size: 8.5pt; text-align: center; width: 15%;">Accreditation</th>
                        </tr>
                    </thead>
                    <tbody>
                        {degrees_html or '<tr><td colspan="4" style="text-align:center;">No degree programs registered.</td></tr>'}
                    </tbody>
                </table>

                <h4 class="sub-section-title">SUC Legislative Performance Indicators (GAA Targets Alignment)</h4>
                <table style="width: 100%; border-collapse: collapse;">
                    <thead>
                        <tr style="background-color: #f0f7ff; text-align: left; font-weight: bold;">
                            <th style="padding: 8px; border: 1px solid #cbd5e1; font-size: 8.5pt; width: 75%;">GAA Baseline Performance Indicator</th>
                            <th style="padding: 8px; border: 1px solid #cbd5e1; font-size: 8.5pt; text-align: center; width: 25%;">Target Value</th>
                        </tr>
                    </thead>
                    <tbody>
                        {gaa_html or '<tr><td colspan="2" style="text-align:center;">No GAA target indicators registered.</td></tr>'}
                    </tbody>
                </table>
            </div>
            '''

        # Fallback Standard Layout Section
        else:
            title_formatted = schema_id.replace("_", " ").title()
            
            return f'''
            <div class="custom-section" id="{schema_id}-anchor">
                <h2 class="section-title">
                    {title_formatted}
                </h2>
                <p style="font-size: 9.5pt; color: #475569; line-height: 1.6;">
                    Dynamic administrative configuration parameters linked to custom schema block <code>{schema_id}</code>.
                </p>
            </div>
            '''


# ==========================================================
# ASYNCHRONOUS COMPILATION CELERY TASK
# ==========================================================

@celery_app.task(
    bind=True, 
    name="app.tasks.pdf_tasks.compile_issp_document",
    time_limit=310,
    soft_time_limit=300
)
def compile_issp_document(self, metadata: dict):
    """
    Orchestrates the dynamic multi-pass layout compilation of the e-ISSP PDF document.
    Maintains clean database session cleanup and secure string error logging on failure
    to prevent inconsistent metadata serialization issues within the Redis result backend.
    """
    db = SessionLocal()
    try:
        self.update_state(state="PROGRESS", meta={"progress": 10, "status": "Acquiring database session..."})
        
        issp_period = metadata.get("issp_period_years", "2026-2028")
        
        self.update_state(state="PROGRESS", meta={"progress": 15, "status": "Executing master narrative compliance validations..."})
        narrative = db.query(MasterNarrative).filter(MasterNarrative.is_active == True).first()
        
        # --------------------------------------------------
        # ISSP COMPLETENESS VALIDATION SUITE (DICT Standard)
        # --------------------------------------------------
        missing_elements = []

        if not narrative:
            missing_elements.append("Part I: Master Narrative Record (Not created for this period)")
        else:
            # Check mandatory text/HTML chapters
            if not narrative.mandate_html or len(narrative.mandate_html.strip()) < 10:
                missing_elements.append("Part I.A.1: SUC Legal Mandate Background (mandate_html)")
            if not narrative.vision_html or len(narrative.vision_html.strip()) < 5:
                missing_elements.append("Part I.A.2: SUC Vision Statement (vision_html)")
            if not narrative.mission_html or len(narrative.mission_html.strip()) < 5:
                missing_elements.append("Part I.A.2: SUC Mission Statement (mission_html)")
            if not narrative.present_situation_html or len(narrative.present_situation_html.strip()) < 10:
                missing_elements.append("Part I.D: Present SUC ICT Situation (present_situation_html)")
            
            # Check mandatory diagrams / S3 keys
            if not narrative.conceptual_framework_url:
                missing_elements.append("Part II.A: Conceptual Framework of IS Interface Diagram (conceptual_framework_url)")
            if not narrative.network_diagram_url:
                missing_elements.append("Part II.D: CSPC Network Diagram & Core Topology (network_diagram_url)")
            if not narrative.system_architecture_url:
                missing_elements.append("Part II.D: CSPC Unified System Architecture Diagram (system_architecture_url)")
            if not narrative.process_flow_diagram_url:
                missing_elements.append("Part I: ISSP Process Flow Diagram (process_flow_diagram_url)")

            # Verify Planners Team
            if not narrative.planners_json or len(narrative.planners_json) == 0:
                missing_elements.append("Part I.B: SUC Designated Planners Profile Matrix (No planners configured)")
                
        # Verify relational strategic KRA matrices
        strategic_concerns_count = db.query(StrategicConcern).filter(StrategicConcern.issp_period == issp_period).count()
        if strategic_concerns_count == 0:
            missing_elements.append("Part I.E: Strategic Concerns for ICT Use Matrix (No concerns registered)")

        # Verify Annex A-3 Core Offices Functions
        core_offices_count = db.query(CoreOfficeFunction).filter(CoreOfficeFunction.issp_period == issp_period).count()
        if core_offices_count == 0:
            missing_elements.append("Annex A-3: Core SUC Offices Functions Directory (No offices registered)")

        # Verify PMF framework matrix targets
        pmf_metrics_count = db.query(PerformanceMetric).filter(PerformanceMetric.issp_period == issp_period).count()
        if pmf_metrics_count == 0:
            missing_elements.append("Part III.C: Performance Measurement Framework Matrix (No metrics configured)")

        # Abort compilation if compliance elements are missing
        if missing_elements:
            error_msg = "ISSP Compilation Blocked: The following mandatory compliance parts are missing or incomplete:\n" + \
                        "\n".join(f"  - {element}" for element in missing_elements)
            logger.error(error_msg)
            raise ValueError(error_msg)
            
        self.update_state(state="PROGRESS", meta={"progress": 25, "status": "Fetching authored Part I-V narratives..."})
        
        issp_period_from = narrative.issp_period_from if narrative and narrative.issp_period_from else None
        issp_period_to = narrative.issp_period_to if narrative and narrative.issp_period_to else None
        
        if issp_period_from and issp_period_to:
            planning_years = [str(y) for y in range(issp_period_from, issp_period_to + 1)]
        else:
            try:
                parts = issp_period.split("-")
                planning_years = [str(y) for y in range(int(parts[0]), int(parts[1]) + 1)]
            except Exception:
                planning_years = ["2026", "2027", "2028"]

        # --------------------------------------------------
        # Extract Database-Backed Dynamic Modules
        # --------------------------------------------------
        self.update_state(state="PROGRESS", meta={"progress": 35, "status": "Synchronizing glossary, campuses, and survey databases..."})
        
        campuses = db.query(Campus).all()
        campuses_data = []
        for campus in campuses:
            depts = db.query(Department).filter(Department.campus_id == campus.id).all()
            campus_spent = db.query(func.sum(Proposal.unit_cost * Proposal.total_qty)).\
                join(Department).filter(Department.campus_id == campus.id).scalar() or Decimal("0.00")
            
            campus_planners = []
            if narrative and narrative.planners_json:
                campus_planners = [p for p in narrative.planners_json]
                
            campuses_data.append({
                "name": campus.name,
                "location": campus.location,
                "code": campus.code,
                "departments_count": len(depts),
                "total_spent": float(campus_spent),
                "planners": campus_planners
            })
        metadata["campuses"] = campuses_data

        degree_offerings = db.query(DegreeOffering).order_by(DegreeOffering.department_name.asc()).all()
        metadata["degree_offerings"] = [
            {
                "department": d.department_name,
                "degree": d.degree_name,
                "level": d.level,
                "accreditation": d.accreditation_status
            } for d in degree_offerings
        ]

        gaa_performance_metrics = db.query(GaaPerformance).all()
        metadata["gaa_performance"] = [
            {
                "indicator": m.indicator_name,
                "target": m.target_value
            } for m in gaa_performance_metrics
        ]

        strategic_concerns_db = db.query(StrategicConcern).filter(StrategicConcern.issp_period == issp_period).all()
        metadata["strategic_concerns_json"] = [
            {
                "key_result_area": c.mfo,
                "concern_description": c.critical_system,
                "intended_solution": f"Problems: {c.problems} | Solution: {c.intended_use}"
            } for c in strategic_concerns_db
        ]

        glossary_db = db.query(GlossaryTerm).order_by(GlossaryTerm.term.asc()).all()
        metadata["glossary_terms"] = [{"term": g.term, "definition": g.definition} for g in glossary_db]

        instructions_db = db.query(GeneralInstruction).order_by(GeneralInstruction.step_number.asc()).all()
        metadata["general_instructions"] = [{"step_number": i.step_number, "instruction_text": i.instruction_text} for i in instructions_db]

        capacities_db = db.query(ServerCapacityTrack).all()
        metadata["server_capacities_json"] = [
            {"tier": r.capacity_tier, "location": r.location, "quantity": r.quantity}
            for r in capacities_db
        ]

        os_census_db = db.query(ClientOsCensus).all()
        metadata["os_census_json"] = [
            {"os_name": r.os_name, "workstations_count": r.workstations_count, "servers_count": r.servers_count}
            for r in os_census_db
        ]

        software_census_db = db.query(OfficeSoftwareCensus).all()
        metadata["office_software_census_json"] = [
            {"software_name": r.software_name, "license_count": r.license_count}
            for r in software_census_db
        ]

        core_offices_db = db.query(CoreOfficeFunction).filter(CoreOfficeFunction.issp_period == issp_period).all()
        metadata["core_offices_json"] = [
            {
                "office_name": o.office_name,
                "division": o.division,
                "description": o.description
            } for o in core_offices_db
        ]

        cross_projects_db = db.query(CrossAgencyProject).filter(CrossAgencyProject.issp_period == issp_period).all()
        metadata["cross_projects_json"] = [
            {
                "name": cp.name,
                "objectives": cp.objectives,
                "duration": cp.duration,
                "deliverables": cp.deliverables,
                "lead_agency": cp.lead_agency,
                "implementing_agencies": cp.implementing_agencies
            } for cp in cross_projects_db
        ]

        pmf_metrics_db = db.query(PerformanceMetric).filter(PerformanceMetric.issp_period == issp_period).all()
        metadata["pmf_matrix_json"] = [
            {
                "project_title": pm.project_title,
                "result_hierarchy": pm.result_hierarchy,
                "indicator": pm.indicator,
                "baseline": pm.baseline,
                "target": pm.target,
                "collection_method": pm.collection_method,
                "responsibility": pm.responsibility
            } for pm in pmf_metrics_db
        ]

        annual_costs_db = db.query(AnnualCostBreakdown).filter(AnnualCostBreakdown.issp_period == issp_period).all()
        metadata["annual_costs_breakdown"] = [
            {
                "project_key": cb.project_key,
                "cost_type": cb.cost_type,
                "item_description": cb.item_description,
                "unit_cost": float(cb.unit_cost),
                "yearly_quantities": cb.yearly_quantities
            } for cb in annual_costs_db if cb.cost_type == "Continuing"
        ]

        staff_positions_db = db.query(IctStaffPosition).filter(IctStaffPosition.issp_period == issp_period).all()
        metadata["staff_positions_json"] = [
            {
                "position_title": sp.position_title,
                "status": sp.status,
                "count": sp.count
            } for sp in staff_positions_db
        ]

        if narrative:
            metadata["agency_name"] = narrative.agency_name
            metadata["agency_mandate"] = narrative.mandate_html
            metadata["agency_vision"] = narrative.vision_html
            metadata["agency_mission"] = narrative.mission_html
            metadata["present_situation_html"] = narrative.present_situation_html
            metadata["systems_json"] = narrative.systems_json
            metadata["databases_json"] = narrative.databases_json
            metadata["internal_projects_json"] = narrative.internal_projects_json
            metadata["planners_json"] = narrative.planners_json
            metadata["manpower_json"] = narrative.manpower_json
            
            metadata["annual_ict_budget"] = Decimal(str(narrative.annual_ict_budget)) if narrative.annual_ict_budget is not None else Decimal("0.00")
            
            metadata["existing_ict_org_url"] = narrative.existing_ict_org_url
            metadata["proposed_ict_org_url"] = narrative.proposed_ict_org_url
            metadata["placement_ict_org_url"] = narrative.placement_ict_org_url

            metadata["mithi_network_profile"] = narrative.mithi_network_profile
            metadata["mithi_special_solutions"] = narrative.mithi_special_solutions
            metadata["mithi_data_center"] = narrative.mithi_data_center
            metadata["mithi_hardware_inventory"] = narrative.mithi_hardware_inventory
            
            metadata["mithi_security_dr"] = narrative.mithi_security_dr
            metadata["mithi_data_archiving"] = narrative.mithi_data_archiving
            metadata["mithi_ict_issues"] = narrative.mithi_ict_issues

            metadata["implementation_schedules"] = narrative.implementation_schedules
            
            metadata["agency_logo_url"] = resolve_local_img_path(narrative.agency_logo_url or "https://upload.wikimedia.org/wikipedia/en/thumb/8/8e/Camarines_Sur_Polytechnic_Colleges_logo.png/220px-Camarines_Sur_Polytechnic_Colleges_logo.png")
            metadata["org_chart_url"] = resolve_local_img_path(narrative.org_chart_url)
            metadata["conceptual_framework_url"] = resolve_local_img_path(narrative.conceptual_framework_url)
            metadata["functional_interface_url"] = resolve_local_img_path(narrative.functional_interface_url)
            metadata["existing_ict_org_url"] = resolve_local_img_path(narrative.existing_ict_org_url)
            metadata["proposed_ict_org_url"] = resolve_local_img_path(narrative.proposed_ict_org_url)
            metadata["placement_ict_org_url"] = resolve_local_img_path(narrative.placement_ict_org_url)

            metadata["site_development_plan_url"] = resolve_local_img_path(narrative.site_development_plan_url)
            metadata["fiber_backbone_url"] = resolve_local_img_path(narrative.fiber_backbone_url)
            metadata["system_architecture_url"] = resolve_local_img_path(narrative.system_architecture_url)
            metadata["network_diagram_url"] = resolve_local_img_path(narrative.network_diagram_url)
            metadata["process_flow_diagram_url"] = resolve_local_img_path(narrative.process_flow_diagram_url)

            metadata["transmittal_recipient"] = narrative.transmittal_recipient
            metadata["transmittal_recipient_title"] = narrative.transmittal_recipient_title
            metadata["transmittal_recipient_agency"] = narrative.transmittal_recipient_agency
            metadata["transmittal_recipient_address"] = narrative.transmittal_recipient_address
            metadata["transmittal_date"] = narrative.transmittal_date
            
            metadata["scope_json"] = narrative.scope_json

            # Map the 9 system-specific network layout paths
            metadata["net_layout_sias_url"] = resolve_local_img_path(narrative.net_layout_sias_url)
            metadata["net_layout_library_url"] = resolve_local_img_path(narrative.net_layout_library_url)
            metadata["net_layout_security_url"] = resolve_local_img_path(narrative.net_layout_security_url)
            metadata["net_layout_hris_url"] = resolve_local_img_path(narrative.net_layout_hris_url)
            metadata["net_layout_dms_url"] = resolve_local_img_path(narrative.net_layout_dms_url)
            metadata["net_layout_supplies_url"] = resolve_local_img_path(narrative.net_layout_supplies_url)
            metadata["net_layout_budget_url"] = resolve_local_img_path(narrative.net_layout_budget_url)
            metadata["net_layout_sias_upgrade_url"] = resolve_local_img_path(narrative.net_layout_sias_upgrade_url)
            metadata["net_layout_extension_url"] = resolve_local_img_path(narrative.net_layout_extension_url)

            # Map core diagrams
            metadata["b_3_a_ict_org_url"] = resolve_local_img_path(narrative.b_3_a_ict_org_url)
            metadata["network_diagram_url"] = resolve_local_img_path(narrative.network_diagram_url)
            metadata["process_flow_diagram_url"] = resolve_local_img_path(narrative.process_flow_diagram_url)
            
            if narrative.agency_name:
                metadata["agency_name"] = narrative.agency_name
            if narrative.signatory_prepared_by:
                metadata["signatory_prepared_by"] = narrative.signatory_prepared_by
            if narrative.signatory_approved_by:
                metadata["signatory_approved_by"] = narrative.signatory_approved_by

        self.update_state(state="PROGRESS", meta={"progress": 40, "status": "Compiling approved CapEx and MOOE items..."})
        
        approved_proposals = db.query(Proposal).options(
            joinedload(Proposal.department),
            joinedload(Proposal.deployments_relation)
        ).filter(
            Proposal.status == ProposalStatus.APPROVED,
            Proposal.issp_period == issp_period,
            Proposal.is_archived == False
        ).all()

        approved_subscriptions = db.query(SubscriptionProposal).options(
            joinedload(SubscriptionProposal.department)
        ).filter(
            SubscriptionProposal.status == ProposalStatus.APPROVED,
            SubscriptionProposal.issp_period == issp_period,
            SubscriptionProposal.is_archived == False
        ).all()

        needs_assessments = db.query(NeedsAssessment).filter(NeedsAssessment.is_archived == False).all()
        
        css_style = f'''
        <style>
            @page {{ 
                margin: 0.75in;
                @top-left {{
                    content: "";
                    background-image: url("{metadata.get("agency_logo_url")}");
                    background-size: contain;
                    background-repeat: no-repeat;
                    background-position: left center;
                    height: 40px;
                    width: 40px;
                    border-bottom: 1px solid #cbd5e1;
                    padding-bottom: 8px;
                }}
                @top-center {{
                    content: "Republic of the Philippines\\A CAMARINES SUR POLYTECHNIC COLLEGES\\A Nabua, Camarines Sur";
                    font-family: Arial, sans-serif;
                    font-size: 7.5pt;
                    font-weight: bold;
                    color: #475569;
                    text-align: left;
                    white-space: pre-wrap;
                    line-height: 1.3;
                    padding-left: 8px;
                    border-bottom: 1px solid #cbd5e1;
                    padding-bottom: 8px;
                }}
                @top-right {{
                    content: "INFORMATION SYSTEMS STRATEGIC PLAN (ISSP)\\A {metadata.get("issp_period_years", "2026-2028")}";
                    font-family: Arial, sans-serif;
                    font-size: 8pt;
                    font-weight: bold;
                    color: #1e3a8a;
                    text-align: right;
                    white-space: pre-wrap;
                    line-height: 1.3;
                    border-bottom: 1px solid #cbd5e1;
                    padding-bottom: 8px;
                }}
                @bottom-right {{
                    content: "Page " counter(page) " of " counter(pages);
                    font-family: Arial, sans-serif;
                    font-size: 8pt;
                    color: #64748b;
                }}
            }}
            
            /* Named Page Selectors for Multi-Scoped Resets */
            @page cover_page {{
                size: portrait;
                margin: 0;
                @top-left {{ content: none; }}
                @top-center {{ content: none; }}
                @top-right {{ content: none; }}
                @bottom-right {{ content: none; }}
            }}
            
            @page transmittal_page {{
                size: portrait;
                margin: 0.75in;
                @top-left {{ content: none; }}
                @top-center {{ content: none; }}
                @top-right {{ content: none; }}
                @bottom-right {{ content: none; }}
            }}

            @page portrait_section {{
                size: portrait;
                margin: 0.75in;
            }}

            @page landscape_section {{
                size: landscape;
                margin: 0.5in 0.75in;
            }}

            /* Map named page selectors to class containers */
            .page-cover {{ page: cover_page; }}
            .page-transmittal {{ page: transmittal_page; }}
            .page-portrait {{ page: portrait_section; }}
            .page-landscape {{ page: landscape_section; }}

            /* Enforce Explicit Page Breaks */
            .force-page-break {{
                page-break-before: always;
                break-before: page;
            }}

            /* running header boundary pushing */
            .content-wrapper {{
                padding-top: 80px;
            }}

            /* Table of Contents Restructured Flexbox Layout with Dot Leaders */
            .toc-list {{
                list-style: none;
                padding: 0;
                margin: 0;
            }}
            .toc-list li {{
                display: flex;
                justify-content: space-between;
                align-items: flex-end;
                margin-bottom: 8px;
                font-size: 10pt;
                line-height: 1.2;
            }}
            .indent-0 {{ padding-left: 0; }}
            .indent-1 {{ padding-left: 20px; }}
            .indent-2 {{ padding-left: 40px; }}
            .indent-3 {{ padding-left: 60px; }}
            
            .toc-text {{
                flex-shrink: 0;
                max-width: 70%;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }}
            .toc-dots {{
                flex-grow: 1;
                border-bottom: 1px dotted #444;
                margin: 0 10px;
                position: relative;
                top: -4px;
            }}
            .toc-num {{
                flex-shrink: 0;
                text-align: right;
                min-width: 30px;
                font-weight: bold;
                color: #1e3a8a;
            }}

            /* Image Sizing and Aspect Ratio Preserving Containers */
            .full-page-media {{
                display: block;
                box-sizing: border-box;
                padding: 10px 20px;
                page-break-inside: avoid;
            }}
            .media-header {{
                font-size: 14pt;
                text-transform: uppercase;
                color: #1e3a8a;
                border-bottom: 2px solid #1e3a8a;
                padding-bottom: 5px;
                margin-bottom: 20px;
            }}
            .image-wrapper {{
                display: block;
                text-align: center;
                width: 100%;
            }}
            .image-wrapper img {{
                max-width: 100%;
                max-height: 420px; /* Limits height to fit the title and header on the same page */
                height: auto;
                object-fit: contain;
                display: block;
                margin: 0 auto;
            }}

            .page-number-ref-part1::after {{ content: target-counter(#part_1_org_profile, page); }}
            .page-number-ref-part1b::after {{ content: target-counter(#part_1_b_manpower, page); }}
            .page-number-ref-part1c::after {{ content: target-counter(#core_process_flow, page); }}
            .page-number-ref-part1d::after {{ content: target-counter(#part_1_org_profile, page); }}
            .page-number-ref-part1e::after {{ content: target-counter(#part_1_e_concerns, page); }}
            .page-number-ref-part2::after {{ content: target-counter(#part_2_is_strategy, page); }}
            .page-number-ref-part2-cards::after {{ content: target-counter(#part-2-b-c-databases, page); }}
            .page-number-ref-part3::after {{ content: target-counter(#part_3_ict_projects, page); }}
            .page-number-ref-pmf::after {{ content: target-counter(#part_3_ict_projects, page); }}
            .page-number-ref-part4::after {{ content: target-counter(#part_4_b_org_structure, page); }}
            .page-number-ref-schedules::after {{ content: target-counter(#part_5_schedules, page); }}
            .page-number-ref-investments::after {{ content: target-counter(#part_5_investments, page); }}
            .page-number-ref-annex1::after {{ content: target-counter(#annex_master, page); }}
            .page-number-ref-annexa3::after {{ content: target-counter(#annex_a3_functions, page); }}
            .page-number-ref-annexa4::after {{ content: target-counter(#annex_a4_programs, page); }}
            
            body {{ 
                font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; 
                line-height: 1.5; 
                color: #334155; 
                margin: 0; 
                padding: 0; 
                background-color: #ffffff;
            }}
            
            h1, h2, h3, h4, h5 {{ color: #0f172a; margin-top: 0; }}

            .section-title {{
                font-size: 13pt; 
                color: #1e3a8a; 
                border-bottom: 1px solid #1e3a8a; 
                padding-bottom: 4px; 
                margin-top: 10px;
                margin-bottom: 15px; 
                text-transform: uppercase; 
                font-weight: bold;
                letter-spacing: 0.5px;
            }}

            .sub-section-title {{
                color: #1e3a8a; 
                font-size: 10pt; 
                margin-top: 15px; 
                margin-bottom: 8px; 
                text-transform: uppercase; 
                font-weight: bold;
                letter-spacing: 0.3px;
            }}
            
            table {{ 
                width: 100%; 
                border-collapse: collapse; 
                margin-bottom: 15px; 
                page-break-inside: avoid; 
            }}
            
            th {{ 
                background-color: #f0f7ff; 
                color: #1e3a8a; 
                padding: 6px 8px; 
                font-size: 8pt; 
                text-align: left; 
                text-transform: uppercase; 
                border: 1px solid #cbd5e1; 
            }}
            
            td {{ 
                padding: 6px 8px; 
                border: 1px solid #cbd5e1; 
                font-size: 8pt; 
                color: #334155; 
            }}
            
            tr {{ page-break-inside: avoid; }}
            th {{ text-transform: uppercase; letter-spacing: 0.5px; }}
        </style>
        '''

        try:
            from weasyprint import HTML
        except OSError as os_err:
            logger.critical(f"CRITICAL HOST SYSTEM OS FAILURE: weasyprint shared library dependencies are missing: {str(os_err)}")
            raise RuntimeError(
                "PDF Compilation Engine cannot boot: Host OS shared libraries (libpango, libcairo) are missing. "
                "Please run: 'sudo apt-get install libpango-1.0-0 libcairo2 libpangoft2-1.0-0' to resolve."
            ) from os_err
        except Exception as generic_err:
            logger.critical(f"Failed to initialize weasyprint compilation libraries: {str(generic_err)}")
            raise RuntimeError("PDF compilation engine initialization failed.") from generic_err

        # ==========================================================
        # TREE TRAVERSAL & COMPILATION FLOW
        # ==========================================================
        self.update_state(state="PROGRESS", meta={"progress": 50, "status": "Executing Pass 1: Calculating layout geometry & final page count..."})

        # Query all standard sections matching the structure of the official CSPC guide format
        html_blocks_pass1 = []
        for format_item in STANDARD_ISSP_FORMAT:
            rendered = ISSPDynamicCompiler.render_section(
                format_item["schema_id"], 
                metadata, 
                approved_proposals, 
                approved_subscriptions, 
                needs_assessments,
                planning_years
            )
            
            # Map cover and transmittal sheets to custom clean page styles
            if format_item["schema_id"] == "core_cover":
                orientation_class = "page-cover"
            elif format_item["schema_id"] == "core_transmittal":
                orientation_class = "page-transmittal"
            else:
                orientation_class = "page-portrait" if format_item["orientation"] == "portrait" else "page-landscape"
                
            break_class = "force-page-break" if format_item["force_page_break"] else ""
            
            html_blocks_pass1.append(f'''
            <div class="{orientation_class} {break_class} content-wrapper" id="{format_item["schema_id"]}">
                {rendered}
            </div>
            ''')
        combined_body_pass1 = "".join(html_blocks_pass1)

        html_raw_pass1 = f"<html><head>{css_style}</head><body>{combined_body_pass1}</body></html>"
        
        html_doc_pass1 = HTML(string=html_raw_pass1, base_url=str(Path(settings.LOCAL_UPLOAD_DIR).parent))
        rendered_doc_pass1 = html_doc_pass1.render()
        
        core_pages = []
        for p in rendered_doc_pass1.pages:
            p_name = getattr(p, "page_name", getattr(p, "_page_name", None))
            if p_name in ["portrait_section", "landscape_section"]:
                core_pages.append(p)
                
        total_page_count = len(core_pages) if core_pages else len(rendered_doc_pass1.pages)

        self.update_state(state="PROGRESS", meta={"progress": 80, "status": f"Executing Pass 2: Drawing table layouts for {total_page_count} certified pages..."})
        metadata["computed_total_pages"] = str(total_page_count)

        # Execution Pass 2
        html_blocks_pass2 = []
        for format_item in STANDARD_ISSP_FORMAT:
            rendered = ISSPDynamicCompiler.render_section(
                format_item["schema_id"], 
                metadata, 
                approved_proposals, 
                approved_subscriptions, 
                needs_assessments,
                planning_years
            )
            if format_item["schema_id"] == "core_cover":
                orientation_class = "page-cover"
            elif format_item["schema_id"] == "core_transmittal":
                orientation_class = "page-transmittal"
            else:
                orientation_class = "page-portrait" if format_item["orientation"] == "portrait" else "page-landscape"
            break_class = "force-page-break" if format_item["force_page_break"] else ""
            
            html_blocks_pass2.append(f'''
            <div class="{orientation_class} {break_class} content-wrapper" id="{format_item["schema_id"]}">
                {rendered}
            </div>
            ''')
        combined_body_pass2 = "".join(html_blocks_pass2)

        html_raw_pass2 = f"<html><head>{css_style}</head><body>{combined_body_pass2}</body></html>"

        html_doc_pass2 = HTML(string=html_raw_pass2, base_url=str(Path(settings.LOCAL_UPLOAD_DIR).parent))
        pdf_buffer = io.BytesIO()
        html_doc_pass2.write_pdf(target=pdf_buffer)
        
        self.update_state(state="PROGRESS", meta={"progress": 95, "status": "Uploading output binary to secure storage..."})
        file_bytes = pdf_buffer.getvalue()
        
        issp_id = metadata.get("issp_id", "ISSP-COMPILATION-DEFAULT")
        storage_client.upload_compiled_pdf(file_bytes, issp_id)
        
        download_url = storage_client.generate_download_url(storage_client.get_generated_pdf_key(issp_id))
        
        return {
            "status": "SUCCESS",
            "file_url": download_url,
            "generated_at": time.strftime("%Y-%m-%d %H:%M:%S")
        }

    except SoftTimeLimitExceeded as timeout_exc:
        db.rollback()
        logger.error(f"Celery SoftTimeLimitExceeded hit during PDF compilation: {str(timeout_exc)}")
        raise Exception("CompilationError: PDF generation soft timeout limit exceeded.")
        
    except ValueError as validation_exc:
        db.rollback()
        logger.warning(f"ISSP Compliance Validation Block: {str(validation_exc)}")
        raise Exception(f"ValidationError: {str(validation_exc)}")
        
    except Exception as e:
        db.rollback()
        logger.error(f"Async dynamic compilation failed: {str(e)}", exc_info=True)
        raise Exception(f"CompilationError: {str(e)}")
    finally:
        db.close()


@celery_app.task(
    bind=True, 
    name="app.tasks.pdf_tasks.compile_issp_document",
    time_limit=310,
    soft_time_limit=300
)
def compile_issp_document(self, metadata: dict):
    """
    Orchestrates the dynamic multi-pass layout compilation of the e-ISSP PDF document.
    Maintains clean database session cleanup and secure string error logging on failure
    to prevent inconsistent metadata serialization issues within the Redis result backend.
    """
    db = SessionLocal()
    try:
        self.update_state(state="PROGRESS", meta={"progress": 10, "status": "Acquiring database session..."})
        
        issp_period = metadata.get("issp_period_years", "2026-2028")
        
        self.update_state(state="PROGRESS", meta={"progress": 15, "status": "Executing master narrative compliance validations..."})
        narrative = db.query(MasterNarrative).filter(MasterNarrative.is_active == True).first()
        
        # --------------------------------------------------
        # ISSP COMPLETENESS VALIDATION SUITE (DICT Standard)
        # --------------------------------------------------
        missing_elements = []

        if not narrative:
            missing_elements.append("Part I: Master Narrative Record (Not created for this period)")
        else:
            # Check mandatory text/HTML chapters
            if not narrative.mandate_html or len(narrative.mandate_html.strip()) < 10:
                missing_elements.append("Part I.A.1: SUC Legal Mandate Background (mandate_html)")
            if not narrative.vision_html or len(narrative.vision_html.strip()) < 5:
                missing_elements.append("Part I.A.2: SUC Vision Statement (vision_html)")
            if not narrative.mission_html or len(narrative.mission_html.strip()) < 5:
                missing_elements.append("Part I.A.2: SUC Mission Statement (mission_html)")
            if not narrative.present_situation_html or len(narrative.present_situation_html.strip()) < 10:
                missing_elements.append("Part I.D: Present SUC ICT Situation (present_situation_html)")
            
            # Check mandatory diagrams / S3 keys
            if not narrative.conceptual_framework_url:
                missing_elements.append("Part II.A: Conceptual Framework of IS Interface Diagram (conceptual_framework_url)")
            if not narrative.network_diagram_url:
                missing_elements.append("Part II.D: CSPC Network Diagram & Core Topology (network_diagram_url)")
            if not narrative.system_architecture_url:
                missing_elements.append("Part II.D: CSPC Unified System Architecture Diagram (system_architecture_url)")
            if not narrative.process_flow_diagram_url:
                missing_elements.append("Part I: ISSP Process Flow Diagram (process_flow_diagram_url)")

            # Verify Planners Team
            if not narrative.planners_json or len(narrative.planners_json) == 0:
                missing_elements.append("Part I.B: SUC Designated Planners Profile Matrix (No planners configured)")
                
        # Verify relational strategic KRA matrices
        strategic_concerns_count = db.query(StrategicConcern).filter(StrategicConcern.issp_period == issp_period).count()
        if strategic_concerns_count == 0:
            missing_elements.append("Part I.E: Strategic Concerns for ICT Use Matrix (No concerns registered)")

        # Verify Annex A-3 Core Offices Functions
        core_offices_count = db.query(CoreOfficeFunction).filter(CoreOfficeFunction.issp_period == issp_period).count()
        if core_offices_count == 0:
            missing_elements.append("Annex A-3: Core SUC Offices Functions Directory (No offices registered)")

        # Verify PMF framework matrix targets
        pmf_metrics_count = db.query(PerformanceMetric).filter(PerformanceMetric.issp_period == issp_period).count()
        if pmf_metrics_count == 0:
            missing_elements.append("Part III.C: Performance Measurement Framework Matrix (No metrics configured)")

        # Abort compilation if compliance elements are missing
        if missing_elements:
            error_msg = "ISSP Compilation Blocked: The following mandatory compliance parts are missing or incomplete:\n" + \
                        "\n".join(f"  - {element}" for element in missing_elements)
            logger.error(error_msg)
            raise ValueError(error_msg)
            
        self.update_state(state="PROGRESS", meta={"progress": 25, "status": "Fetching authored Part I-V narratives..."})
        
        issp_period_from = narrative.issp_period_from if narrative and narrative.issp_period_from else None
        issp_period_to = narrative.issp_period_to if narrative and narrative.issp_period_to else None
        
        if issp_period_from and issp_period_to:
            planning_years = [str(y) for y in range(issp_period_from, issp_period_to + 1)]
        else:
            try:
                parts = issp_period.split("-")
                planning_years = [str(y) for y in range(int(parts[0]), int(parts[1]) + 1)]
            except Exception:
                planning_years = ["2026", "2027", "2028"]

        # --------------------------------------------------
        # Extract Database-Backed Dynamic Modules
        # --------------------------------------------------
        self.update_state(state="PROGRESS", meta={"progress": 35, "status": "Synchronizing glossary, campuses, and survey databases..."})
        
        campuses = db.query(Campus).all()
        campuses_data = []
        for campus in campuses:
            depts = db.query(Department).filter(Department.campus_id == campus.id).all()
            campus_spent = db.query(func.sum(Proposal.unit_cost * Proposal.total_qty)).\
                join(Department).filter(Department.campus_id == campus.id).scalar() or Decimal("0.00")
            
            campus_planners = []
            if narrative and narrative.planners_json:
                campus_planners = [p for p in narrative.planners_json]
                
            campuses_data.append({
                "name": campus.name,
                "location": campus.location,
                "code": campus.code,
                "departments_count": len(depts),
                "total_spent": float(campus_spent),
                "planners": campus_planners
            })
        metadata["campuses"] = campuses_data

        degree_offerings = db.query(DegreeOffering).order_by(DegreeOffering.department_name.asc()).all()
        metadata["degree_offerings"] = [
            {
                "department": d.department_name,
                "degree": d.degree_name,
                "level": d.level,
                "accreditation": d.accreditation_status
            } for d in degree_offerings
        ]

        gaa_performance_metrics = db.query(GaaPerformance).all()
        metadata["gaa_performance"] = [
            {
                "indicator": m.indicator_name,
                "target": m.target_value
            } for m in gaa_performance_metrics
        ]

        strategic_concerns_db = db.query(StrategicConcern).filter(StrategicConcern.issp_period == issp_period).all()
        metadata["strategic_concerns_json"] = [
            {
                "key_result_area": c.mfo,
                "concern_description": c.critical_system,
                "intended_solution": f"Problems: {c.problems} | Solution: {c.intended_use}"
            } for c in strategic_concerns_db
        ]

        glossary_db = db.query(GlossaryTerm).order_by(GlossaryTerm.term.asc()).all()
        metadata["glossary_terms"] = [{"term": g.term, "definition": g.definition} for g in glossary_db]

        instructions_db = db.query(GeneralInstruction).order_by(GeneralInstruction.step_number.asc()).all()
        metadata["general_instructions"] = [{"step_number": i.step_number, "instruction_text": i.instruction_text} for i in instructions_db]

        capacities_db = db.query(ServerCapacityTrack).all()
        metadata["server_capacities_json"] = [
            {"tier": r.capacity_tier, "location": r.location, "quantity": r.quantity}
            for r in capacities_db
        ]

        os_census_db = db.query(ClientOsCensus).all()
        metadata["os_census_json"] = [
            {"os_name": r.os_name, "workstations_count": r.workstations_count, "servers_count": r.servers_count}
            for r in os_census_db
        ]

        software_census_db = db.query(OfficeSoftwareCensus).all()
        metadata["office_software_census_json"] = [
            {"software_name": r.software_name, "license_count": r.license_count}
            for r in software_census_db
        ]

        core_offices_db = db.query(CoreOfficeFunction).filter(CoreOfficeFunction.issp_period == issp_period).all()
        metadata["core_offices_json"] = [
            {
                "office_name": o.office_name,
                "division": o.division,
                "description": o.description
            } for o in core_offices_db
        ]

        cross_projects_db = db.query(CrossAgencyProject).filter(CrossAgencyProject.issp_period == issp_period).all()
        metadata["cross_projects_json"] = [
            {
                "name": cp.name,
                "objectives": cp.objectives,
                "duration": cp.duration,
                "deliverables": cp.deliverables,
                "lead_agency": cp.lead_agency,
                "implementing_agencies": cp.implementing_agencies
            } for cp in cross_projects_db
        ]

        pmf_metrics_db = db.query(PerformanceMetric).filter(PerformanceMetric.issp_period == issp_period).all()
        metadata["pmf_matrix_json"] = [
            {
                "project_title": pm.project_title,
                "result_hierarchy": pm.result_hierarchy,
                "indicator": pm.indicator,
                "baseline": pm.baseline,
                "target": pm.target,
                "collection_method": pm.collection_method,
                "responsibility": pm.responsibility
            } for pm in pmf_metrics_db
        ]

        annual_costs_db = db.query(AnnualCostBreakdown).filter(AnnualCostBreakdown.issp_period == issp_period).all()
        metadata["annual_costs_breakdown"] = [
            {
                "project_key": cb.project_key,
                "cost_type": cb.cost_type,
                "item_description": cb.item_description,
                "unit_cost": float(cb.unit_cost),
                "yearly_quantities": cb.yearly_quantities
            } for cb in annual_costs_db if cb.cost_type == "Continuing"
        ]

        staff_positions_db = db.query(IctStaffPosition).filter(IctStaffPosition.issp_period == issp_period).all()
        metadata["staff_positions_json"] = [
            {
                "position_title": sp.position_title,
                "status": sp.status,
                "count": sp.count
            } for sp in staff_positions_db
        ]

        if narrative:
            metadata["agency_name"] = narrative.agency_name
            metadata["agency_mandate"] = narrative.mandate_html
            metadata["agency_vision"] = narrative.vision_html
            metadata["agency_mission"] = narrative.mission_html
            metadata["present_situation_html"] = narrative.present_situation_html
            metadata["systems_json"] = narrative.systems_json
            metadata["databases_json"] = narrative.databases_json
            metadata["internal_projects_json"] = narrative.internal_projects_json
            metadata["planners_json"] = narrative.planners_json
            metadata["manpower_json"] = narrative.manpower_json
            
            metadata["annual_ict_budget"] = Decimal(str(narrative.annual_ict_budget)) if narrative.annual_ict_budget is not None else Decimal("0.00")
            
            metadata["existing_ict_org_url"] = narrative.existing_ict_org_url
            metadata["proposed_ict_org_url"] = narrative.proposed_ict_org_url
            metadata["placement_ict_org_url"] = narrative.placement_ict_org_url

            metadata["mithi_network_profile"] = narrative.mithi_network_profile
            metadata["mithi_special_solutions"] = narrative.mithi_special_solutions
            metadata["mithi_data_center"] = narrative.mithi_data_center
            metadata["mithi_hardware_inventory"] = narrative.mithi_hardware_inventory
            
            metadata["mithi_security_dr"] = narrative.mithi_security_dr
            metadata["mithi_data_archiving"] = narrative.mithi_data_archiving
            metadata["mithi_ict_issues"] = narrative.mithi_ict_issues

            metadata["implementation_schedules"] = narrative.implementation_schedules
            
            metadata["agency_logo_url"] = resolve_local_img_path(narrative.agency_logo_url or "https://upload.wikimedia.org/wikipedia/en/thumb/8/8e/Camarines_Sur_Polytechnic_Colleges_logo.png/220px-Camarines_Sur_Polytechnic_Colleges_logo.png")
            metadata["org_chart_url"] = resolve_local_img_path(narrative.org_chart_url)
            metadata["conceptual_framework_url"] = resolve_local_img_path(narrative.conceptual_framework_url)
            metadata["functional_interface_url"] = resolve_local_img_path(narrative.functional_interface_url)
            metadata["existing_ict_org_url"] = resolve_local_img_path(narrative.existing_ict_org_url)
            metadata["proposed_ict_org_url"] = resolve_local_img_path(narrative.proposed_ict_org_url)
            metadata["placement_ict_org_url"] = resolve_local_img_path(narrative.placement_ict_org_url)

            metadata["site_development_plan_url"] = resolve_local_img_path(narrative.site_development_plan_url)
            metadata["fiber_backbone_url"] = resolve_local_img_path(narrative.fiber_backbone_url)
            metadata["system_architecture_url"] = resolve_local_img_path(narrative.system_architecture_url)
            metadata["network_diagram_url"] = resolve_local_img_path(narrative.network_diagram_url)
            metadata["process_flow_diagram_url"] = resolve_local_img_path(narrative.process_flow_diagram_url)

            metadata["transmittal_recipient"] = narrative.transmittal_recipient
            metadata["transmittal_recipient_title"] = narrative.transmittal_recipient_title
            metadata["transmittal_recipient_agency"] = narrative.transmittal_recipient_agency
            metadata["transmittal_recipient_address"] = narrative.transmittal_recipient_address
            metadata["transmittal_date"] = narrative.transmittal_date
            
            metadata["scope_json"] = narrative.scope_json

            # Map the 9 system-specific network layout paths
            metadata["net_layout_sias_url"] = resolve_local_img_path(narrative.net_layout_sias_url)
            metadata["net_layout_library_url"] = resolve_local_img_path(narrative.net_layout_library_url)
            metadata["net_layout_security_url"] = resolve_local_img_path(narrative.net_layout_security_url)
            metadata["net_layout_hris_url"] = resolve_local_img_path(narrative.net_layout_hris_url)
            metadata["net_layout_dms_url"] = resolve_local_img_path(narrative.net_layout_dms_url)
            metadata["net_layout_supplies_url"] = resolve_local_img_path(narrative.net_layout_supplies_url)
            metadata["net_layout_budget_url"] = resolve_local_img_path(narrative.net_layout_budget_url)
            metadata["net_layout_sias_upgrade_url"] = resolve_local_img_path(narrative.net_layout_sias_upgrade_url)
            metadata["net_layout_extension_url"] = resolve_local_img_path(narrative.net_layout_extension_url)

            # Map core diagrams
            metadata["b_3_a_ict_org_url"] = resolve_local_img_path(narrative.b_3_a_ict_org_url)
            metadata["network_diagram_url"] = resolve_local_img_path(narrative.network_diagram_url)
            metadata["process_flow_diagram_url"] = resolve_local_img_path(narrative.process_flow_diagram_url)
            
            if narrative.agency_name:
                metadata["agency_name"] = narrative.agency_name
            if narrative.signatory_prepared_by:
                metadata["signatory_prepared_by"] = narrative.signatory_prepared_by
            if narrative.signatory_approved_by:
                metadata["signatory_approved_by"] = narrative.signatory_approved_by

        self.update_state(state="PROGRESS", meta={"progress": 40, "status": "Compiling approved CapEx and MOOE items..."})
        
        approved_proposals = db.query(Proposal).options(
            joinedload(Proposal.department),
            joinedload(Proposal.deployments_relation)
        ).filter(
            Proposal.status == ProposalStatus.APPROVED,
            Proposal.issp_period == issp_period,
            Proposal.is_archived == False
        ).all()

        approved_subscriptions = db.query(SubscriptionProposal).options(
            joinedload(SubscriptionProposal.department)
        ).filter(
            SubscriptionProposal.status == ProposalStatus.APPROVED,
            SubscriptionProposal.issp_period == issp_period,
            SubscriptionProposal.is_archived == False
        ).all()

        needs_assessments = db.query(NeedsAssessment).filter(NeedsAssessment.is_archived == False).all()
        
        css_style = f'''
        <style>
            @page {{ 
                margin: 0.75in;
                @top-left {{
                    content: "";
                    background-image: url("{metadata.get("agency_logo_url")}");
                    background-size: contain;
                    background-repeat: no-repeat;
                    background-position: left center;
                    height: 40px;
                    width: 40px;
                    border-bottom: 1px solid #cbd5e1;
                    padding-bottom: 8px;
                }}
                @top-center {{
                    content: "Republic of the Philippines\\A CAMARINES SUR POLYTECHNIC COLLEGES\\A Nabua, Camarines Sur";
                    font-family: Arial, sans-serif;
                    font-size: 7.5pt;
                    font-weight: bold;
                    color: #475569;
                    text-align: left;
                    white-space: pre-wrap;
                    line-height: 1.3;
                    padding-left: 8px;
                    border-bottom: 1px solid #cbd5e1;
                    padding-bottom: 8px;
                }}
                @top-right {{
                    content: "INFORMATION SYSTEMS STRATEGIC PLAN (ISSP)\\A {metadata.get("issp_period_years", "2026-2028")}";
                    font-family: Arial, sans-serif;
                    font-size: 8pt;
                    font-weight: bold;
                    color: #1e3a8a;
                    text-align: right;
                    white-space: pre-wrap;
                    line-height: 1.3;
                    border-bottom: 1px solid #cbd5e1;
                    padding-bottom: 8px;
                }}
                @bottom-right {{
                    content: "Page " counter(page) " of " counter(pages);
                    font-family: Arial, sans-serif;
                    font-size: 8pt;
                    color: #64748b;
                }}
            }}
            
            /* Named Page Selectors for Multi-Scoped Resets */
            @page cover_page {{
                size: portrait;
                margin: 0;
                @top-left {{ content: none; }}
                @top-center {{ content: none; }}
                @top-right {{ content: none; }}
                @bottom-right {{ content: none; }}
            }}
            
            @page transmittal_page {{
                size: portrait;
                margin: 0.75in;
                @top-left {{ content: none; }}
                @top-center {{ content: none; }}
                @top-right {{ content: none; }}
                @bottom-right {{ content: none; }}
            }}

            @page portrait_section {{
                size: portrait;
                margin: 0.75in;
            }}

            @page landscape_section {{
                size: landscape;
                margin: 0.5in 0.75in;
            }}

            /* Map named page selectors to class containers */
            .page-cover {{ page: cover_page; }}
            .page-transmittal {{ page: transmittal_page; }}
            .page-portrait {{ page: portrait_section; }}
            .page-landscape {{ page: landscape_section; }}

            /* Enforce Explicit Page Breaks */
            .force-page-break {{
                page-break-before: always;
                break-before: page;
            }}

            /* running header boundary pushing */
            .content-wrapper {{
                padding-top: 80px;
            }}

            /* Table of Contents Restructured Flexbox Layout with Dot Leaders */
            .toc-list {{
                list-style: none;
                padding: 0;
                margin: 0;
            }}
            .toc-list li {{
                display: flex;
                justify-content: space-between;
                align-items: flex-end;
                margin-bottom: 8px;
                font-size: 10pt;
                line-height: 1.2;
            }}
            .indent-0 {{ padding-left: 0; }}
            .indent-1 {{ padding-left: 20px; }}
            .indent-2 {{ padding-left: 40px; }}
            .indent-3 {{ padding-left: 60px; }}
            
            .toc-text {{
                flex-shrink: 0;
                max-width: 70%;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }}
            .toc-dots {{
                flex-grow: 1;
                border-bottom: 1px dotted #444;
                margin: 0 10px;
                position: relative;
                top: -4px;
            }}
            .toc-num {{
                flex-shrink: 0;
                text-align: right;
                min-width: 30px;
                font-weight: bold;
                color: #1e3a8a;
            }}

            /* Image Sizing and Aspect Ratio Preserving Containers */
            .full-page-media {{
                display: block;
                box-sizing: border-box;
                padding: 10px 20px;
                page-break-inside: avoid;
            }}
            .media-header {{
                font-size: 14pt;
                text-transform: uppercase;
                color: #1e3a8a;
                border-bottom: 2px solid #1e3a8a;
                padding-bottom: 5px;
                margin-bottom: 20px;
            }}
            .image-wrapper {{
                display: block;
                text-align: center;
                width: 100%;
            }}
            .image-wrapper img {{
                max-width: 100%;
                max-height: 420px; /* Limits height to fit the title and header on the same page */
                height: auto;
                object-fit: contain;
                display: block;
                margin: 0 auto;
            }}

            .page-number-ref-part1::after {{ content: target-counter(#part_1_org_profile, page); }}
            .page-number-ref-part1b::after {{ content: target-counter(#part_1_b_manpower, page); }}
            .page-number-ref-part1c::after {{ content: target-counter(#core_process_flow, page); }}
            .page-number-ref-part1d::after {{ content: target-counter(#part_1_org_profile, page); }}
            .page-number-ref-part1e::after {{ content: target-counter(#part_1_e_concerns, page); }}
            .page-number-ref-part2::after {{ content: target-counter(#part_2_is_strategy, page); }}
            .page-number-ref-part2-cards::after {{ content: target-counter(#part-2-b-c-databases, page); }}
            .page-number-ref-part3::after {{ content: target-counter(#part_3_ict_projects, page); }}
            .page-number-ref-pmf::after {{ content: target-counter(#part_3_ict_projects, page); }}
            .page-number-ref-part4::after {{ content: target-counter(#part_4_b_org_structure, page); }}
            .page-number-ref-schedules::after {{ content: target-counter(#part_5_schedules, page); }}
            .page-number-ref-investments::after {{ content: target-counter(#part_5_investments, page); }}
            .page-number-ref-annex1::after {{ content: target-counter(#annex_master, page); }}
            .page-number-ref-annexa3::after {{ content: target-counter(#annex_a3_functions, page); }}
            .page-number-ref-annexa4::after {{ content: target-counter(#annex_a4_programs, page); }}
            
            body {{ 
                font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; 
                line-height: 1.5; 
                color: #334155; 
                margin: 0; 
                padding: 0; 
                background-color: #ffffff;
            }}
            
            h1, h2, h3, h4, h5 {{ color: #0f172a; margin-top: 0; }}

            .section-title {{
                font-size: 13pt; 
                color: #1e3a8a; 
                border-bottom: 1px solid #1e3a8a; 
                padding-bottom: 4px; 
                margin-top: 10px;
                margin-bottom: 15px; 
                text-transform: uppercase; 
                font-weight: bold;
                letter-spacing: 0.5px;
            }}

            .sub-section-title {{
                color: #1e3a8a; 
                font-size: 10pt; 
                margin-top: 15px; 
                margin-bottom: 8px; 
                text-transform: uppercase; 
                font-weight: bold;
                letter-spacing: 0.3px;
            }}
            
            table {{ 
                width: 100%; 
                border-collapse: collapse; 
                margin-bottom: 15px; 
                page-break-inside: avoid; 
            }}
            
            th {{ 
                background-color: #f0f7ff; 
                color: #1e3a8a; 
                padding: 6px 8px; 
                font-size: 8pt; 
                text-align: left; 
                text-transform: uppercase; 
                border: 1px solid #cbd5e1; 
            }}
            
            td {{ 
                padding: 6px 8px; 
                border: 1px solid #cbd5e1; 
                font-size: 8pt; 
                color: #334155; 
            }}
            
            tr {{ page-break-inside: avoid; }}
            th {{ text-transform: uppercase; letter-spacing: 0.5px; }}
        </style>
        '''

        try:
            from weasyprint import HTML
        except OSError as os_err:
            logger.critical(f"CRITICAL HOST SYSTEM OS FAILURE: weasyprint shared library dependencies are missing: {str(os_err)}")
            raise RuntimeError(
                "PDF Compilation Engine cannot boot: Host OS shared libraries (libpango, libcairo) are missing. "
                "Please run: 'sudo apt-get install libpango-1.0-0 libcairo2 libpangoft2-1.0-0' to resolve."
            ) from os_err
        except Exception as generic_err:
            logger.critical(f"Failed to initialize weasyprint compilation libraries: {str(generic_err)}")
            raise RuntimeError("PDF compilation engine initialization failed.") from generic_err

        # ==========================================================
        # TREE TRAVERSAL & COMPILATION FLOW
        # ==========================================================
        self.update_state(state="PROGRESS", meta={"progress": 50, "status": "Executing Pass 1: Calculating layout geometry & final page count..."})

        # Query all standard sections matching the structure of the official CSPC guide format
        html_blocks_pass1 = []
        for format_item in STANDARD_ISSP_FORMAT:
            rendered = ISSPDynamicCompiler.render_section(
                format_item["schema_id"], 
                metadata, 
                approved_proposals, 
                approved_subscriptions, 
                needs_assessments,
                planning_years
            )
            
            # Map cover and transmittal sheets to custom clean page styles to remove running headers/footers
            if format_item["schema_id"] == "core_cover":
                orientation_class = "page-cover"
            elif format_item["schema_id"] == "core_transmittal":
                orientation_class = "page-transmittal"
            else:
                orientation_class = "page-portrait" if format_item["orientation"] == "portrait" else "page-landscape"
                
            break_class = "force-page-break" if format_item["force_page_break"] else ""
            
            html_blocks_pass1.append(f'''
            <div class="{orientation_class} {break_class} content-wrapper" id="{format_item["schema_id"]}">
                {rendered}
            </div>
            ''')
        combined_body_pass1 = "".join(html_blocks_pass1)

        html_raw_pass1 = f"<html><head>{css_style}</head><body>{combined_body_pass1}</body></html>"
        
        html_doc_pass1 = HTML(string=html_raw_pass1, base_url=str(Path(settings.LOCAL_UPLOAD_DIR).parent))
        rendered_doc_pass1 = html_doc_pass1.render()
        
        core_pages = []
        for p in rendered_doc_pass1.pages:
            p_name = getattr(p, "page_name", getattr(p, "_page_name", None))
            if p_name in ["portrait_section", "landscape_section"]:
                core_pages.append(p)
                
        total_page_count = len(core_pages) if core_pages else len(rendered_doc_pass1.pages)

        self.update_state(state="PROGRESS", meta={"progress": 80, "status": f"Executing Pass 2: Drawing table layouts for {total_page_count} certified pages..."})
        metadata["computed_total_pages"] = str(total_page_count)

        # Execution Pass 2
        html_blocks_pass2 = []
        for format_item in STANDARD_ISSP_FORMAT:
            rendered = ISSPDynamicCompiler.render_section(
                format_item["schema_id"], 
                metadata, 
                approved_proposals, 
                approved_subscriptions, 
                needs_assessments,
                planning_years
            )
            if format_item["schema_id"] == "core_cover":
                orientation_class = "page-cover"
            elif format_item["schema_id"] == "core_transmittal":
                orientation_class = "page-transmittal"
            else:
                orientation_class = "page-portrait" if format_item["orientation"] == "portrait" else "page-landscape"
            break_class = "force-page-break" if format_item["force_page_break"] else ""
            
            html_blocks_pass2.append(f'''
            <div class="{orientation_class} {break_class} content-wrapper" id="{format_item["schema_id"]}">
                {rendered}
            </div>
            ''')
        combined_body_pass2 = "".join(html_blocks_pass2)

        html_raw_pass2 = f"<html><head>{css_style}</head><body>{combined_body_pass2}</body></html>"

        html_doc_pass2 = HTML(string=html_raw_pass2, base_url=str(Path(settings.LOCAL_UPLOAD_DIR).parent))
        pdf_buffer = io.BytesIO()
        html_doc_pass2.write_pdf(target=pdf_buffer)
        
        self.update_state(state="PROGRESS", meta={"progress": 95, "status": "Uploading output binary to secure storage..."})
        file_bytes = pdf_buffer.getvalue()
        
        issp_id = metadata.get("issp_id", "ISSP-COMPILATION-DEFAULT")
        storage_client.upload_compiled_pdf(file_bytes, issp_id)
        
        download_url = storage_client.generate_download_url(storage_client.get_generated_pdf_key(issp_id))
        
        return {
            "status": "SUCCESS",
            "file_url": download_url,
            "generated_at": time.strftime("%Y-%m-%d %H:%M:%S")
        }

    except SoftTimeLimitExceeded as timeout_exc:
        db.rollback()
        logger.error(f"Celery SoftTimeLimitExceeded hit during PDF compilation: {str(timeout_exc)}")
        raise Exception("CompilationError: PDF generation soft timeout limit exceeded.")
        
    except ValueError as validation_exc:
        db.rollback()
        logger.warning(f"ISSP Compliance Validation Block: {str(validation_exc)}")
        raise Exception(f"ValidationError: {str(validation_exc)}")
        
    except Exception as e:
        db.rollback()
        logger.error(f"Async dynamic compilation failed: {str(e)}", exc_info=True)
        raise Exception(f"CompilationError: {str(e)}")
    finally:
        db.close()


@celery_app.task(
    bind=True, 
    name="app.tasks.pdf_tasks.compile_issp_document",
    time_limit=310,
    soft_time_limit=300
)
def compile_issp_document(self, metadata: dict):
    """
    Orchestrates the dynamic multi-pass layout compilation of the e-ISSP PDF document.
    Maintains clean database session cleanup and secure string error logging on failure
    to prevent inconsistent metadata serialization issues within the Redis result backend.
    """
    db = SessionLocal()
    try:
        self.update_state(state="PROGRESS", meta={"progress": 10, "status": "Acquiring database session..."})
        
        issp_period = metadata.get("issp_period_years", "2026-2028")
        
        self.update_state(state="PROGRESS", meta={"progress": 15, "status": "Executing master narrative compliance validations..."})
        narrative = db.query(MasterNarrative).filter(MasterNarrative.is_active == True).first()
        
        # --------------------------------------------------
        # ISSP COMPLETENESS VALIDATION SUITE (DICT Standard)
        # --------------------------------------------------
        missing_elements = []

        if not narrative:
            missing_elements.append("Part I: Master Narrative Record (Not created for this period)")
        else:
            # Check mandatory text/HTML chapters
            if not narrative.mandate_html or len(narrative.mandate_html.strip()) < 10:
                missing_elements.append("Part I.A.1: SUC Legal Mandate Background (mandate_html)")
            if not narrative.vision_html or len(narrative.vision_html.strip()) < 5:
                missing_elements.append("Part I.A.2: SUC Vision Statement (vision_html)")
            if not narrative.mission_html or len(narrative.mission_html.strip()) < 5:
                missing_elements.append("Part I.A.2: SUC Mission Statement (mission_html)")
            if not narrative.present_situation_html or len(narrative.present_situation_html.strip()) < 10:
                missing_elements.append("Part I.D: Present SUC ICT Situation (present_situation_html)")
            
            # Check mandatory diagrams / S3 keys
            if not narrative.conceptual_framework_url:
                missing_elements.append("Part II.A: Conceptual Framework of IS Interface Diagram (conceptual_framework_url)")
            if not narrative.network_diagram_url:
                missing_elements.append("Part II.D: CSPC Network Diagram & Core Topology (network_diagram_url)")
            if not narrative.system_architecture_url:
                missing_elements.append("Part II.D: CSPC Unified System Architecture Diagram (system_architecture_url)")
            if not narrative.process_flow_diagram_url:
                missing_elements.append("Part I: ISSP Process Flow Diagram (process_flow_diagram_url)")

            # Verify Planners Team
            if not narrative.planners_json or len(narrative.planners_json) == 0:
                missing_elements.append("Part I.B: SUC Designated Planners Profile Matrix (No planners configured)")
                
        # Verify relational strategic KRA matrices
        strategic_concerns_count = db.query(StrategicConcern).filter(StrategicConcern.issp_period == issp_period).count()
        if strategic_concerns_count == 0:
            missing_elements.append("Part I.E: Strategic Concerns for ICT Use Matrix (No concerns registered)")

        # Verify Annex A-3 Core Offices Functions
        core_offices_count = db.query(CoreOfficeFunction).filter(CoreOfficeFunction.issp_period == issp_period).count()
        if core_offices_count == 0:
            missing_elements.append("Annex A-3: Core SUC Offices Functions Directory (No offices registered)")

        # Verify PMF framework matrix targets
        pmf_metrics_count = db.query(PerformanceMetric).filter(PerformanceMetric.issp_period == issp_period).count()
        if pmf_metrics_count == 0:
            missing_elements.append("Part III.C: Performance Measurement Framework Matrix (No metrics configured)")

        # Abort compilation if compliance elements are missing
        if missing_elements:
            error_msg = "ISSP Compilation Blocked: The following mandatory compliance parts are missing or incomplete:\n" + \
                        "\n".join(f"  - {element}" for element in missing_elements)
            logger.error(error_msg)
            raise ValueError(error_msg)
            
        self.update_state(state="PROGRESS", meta={"progress": 25, "status": "Fetching authored Part I-V narratives..."})
        
        issp_period_from = narrative.issp_period_from if narrative and narrative.issp_period_from else None
        issp_period_to = narrative.issp_period_to if narrative and narrative.issp_period_to else None
        
        if issp_period_from and issp_period_to:
            planning_years = [str(y) for y in range(issp_period_from, issp_period_to + 1)]
        else:
            try:
                parts = issp_period.split("-")
                planning_years = [str(y) for y in range(int(parts[0]), int(parts[1]) + 1)]
            except Exception:
                planning_years = ["2026", "2027", "2028"]

        # --------------------------------------------------
        # Extract Database-Backed Dynamic Modules
        # --------------------------------------------------
        self.update_state(state="PROGRESS", meta={"progress": 35, "status": "Synchronizing glossary, campuses, and survey databases..."})
        
        campuses = db.query(Campus).all()
        campuses_data = []
        for campus in campuses:
            depts = db.query(Department).filter(Department.campus_id == campus.id).all()
            campus_spent = db.query(func.sum(Proposal.unit_cost * Proposal.total_qty)).\
                join(Department).filter(Department.campus_id == campus.id).scalar() or Decimal("0.00")
            
            campus_planners = []
            if narrative and narrative.planners_json:
                campus_planners = [p for p in narrative.planners_json]
                
            campuses_data.append({
                "name": campus.name,
                "location": campus.location,
                "code": campus.code,
                "departments_count": len(depts),
                "total_spent": float(campus_spent),
                "planners": campus_planners
            })
        metadata["campuses"] = campuses_data

        degree_offerings = db.query(DegreeOffering).order_by(DegreeOffering.department_name.asc()).all()
        metadata["degree_offerings"] = [
            {
                "department": d.department_name,
                "degree": d.degree_name,
                "level": d.level,
                "accreditation": d.accreditation_status
            } for d in degree_offerings
        ]

        gaa_performance_metrics = db.query(GaaPerformance).all()
        metadata["gaa_performance"] = [
            {
                "indicator": m.indicator_name,
                "target": m.target_value
            } for m in gaa_performance_metrics
        ]

        strategic_concerns_db = db.query(StrategicConcern).filter(StrategicConcern.issp_period == issp_period).all()
        metadata["strategic_concerns_json"] = [
            {
                "key_result_area": c.mfo,
                "concern_description": c.critical_system,
                "intended_solution": f"Problems: {c.problems} | Solution: {c.intended_use}"
            } for c in strategic_concerns_db
        ]

        glossary_db = db.query(GlossaryTerm).order_by(GlossaryTerm.term.asc()).all()
        metadata["glossary_terms"] = [{"term": g.term, "definition": g.definition} for g in glossary_db]

        instructions_db = db.query(GeneralInstruction).order_by(GeneralInstruction.step_number.asc()).all()
        metadata["general_instructions"] = [{"step_number": i.step_number, "instruction_text": i.instruction_text} for i in instructions_db]

        capacities_db = db.query(ServerCapacityTrack).all()
        metadata["server_capacities_json"] = [
            {"tier": r.capacity_tier, "location": r.location, "quantity": r.quantity}
            for r in capacities_db
        ]

        os_census_db = db.query(ClientOsCensus).all()
        metadata["os_census_json"] = [
            {"os_name": r.os_name, "workstations_count": r.workstations_count, "servers_count": r.servers_count}
            for r in os_census_db
        ]

        software_census_db = db.query(OfficeSoftwareCensus).all()
        metadata["office_software_census_json"] = [
            {"software_name": r.software_name, "license_count": r.license_count}
            for r in software_census_db
        ]

        core_offices_db = db.query(CoreOfficeFunction).filter(CoreOfficeFunction.issp_period == issp_period).all()
        metadata["core_offices_json"] = [
            {
                "office_name": o.office_name,
                "division": o.division,
                "description": o.description
            } for o in core_offices_db
        ]

        cross_projects_db = db.query(CrossAgencyProject).filter(CrossAgencyProject.issp_period == issp_period).all()
        metadata["cross_projects_json"] = [
            {
                "name": cp.name,
                "objectives": cp.objectives,
                "duration": cp.duration,
                "deliverables": cp.deliverables,
                "lead_agency": cp.lead_agency,
                "implementing_agencies": cp.implementing_agencies
            } for cp in cross_projects_db
        ]

        pmf_metrics_db = db.query(PerformanceMetric).filter(PerformanceMetric.issp_period == issp_period).all()
        metadata["pmf_matrix_json"] = [
            {
                "project_title": pm.project_title,
                "result_hierarchy": pm.result_hierarchy,
                "indicator": pm.indicator,
                "baseline": pm.baseline,
                "target": pm.target,
                "collection_method": pm.collection_method,
                "responsibility": pm.responsibility
            } for pm in pmf_metrics_db
        ]

        annual_costs_db = db.query(AnnualCostBreakdown).filter(AnnualCostBreakdown.issp_period == issp_period).all()
        metadata["annual_costs_breakdown"] = [
            {
                "project_key": cb.project_key,
                "cost_type": cb.cost_type,
                "item_description": cb.item_description,
                "unit_cost": float(cb.unit_cost),
                "yearly_quantities": cb.yearly_quantities
            } for cb in annual_costs_db if cb.cost_type == "Continuing"
        ]

        staff_positions_db = db.query(IctStaffPosition).filter(IctStaffPosition.issp_period == issp_period).all()
        metadata["staff_positions_json"] = [
            {
                "position_title": sp.position_title,
                "status": sp.status,
                "count": sp.count
            } for sp in staff_positions_db
        ]

        if narrative:
            metadata["agency_name"] = narrative.agency_name
            metadata["agency_mandate"] = narrative.mandate_html
            metadata["agency_vision"] = narrative.vision_html
            metadata["agency_mission"] = narrative.mission_html
            metadata["present_situation_html"] = narrative.present_situation_html
            metadata["systems_json"] = narrative.systems_json
            metadata["databases_json"] = narrative.databases_json
            metadata["internal_projects_json"] = narrative.internal_projects_json
            metadata["planners_json"] = narrative.planners_json
            metadata["manpower_json"] = narrative.manpower_json
            
            metadata["annual_ict_budget"] = Decimal(str(narrative.annual_ict_budget)) if narrative.annual_ict_budget is not None else Decimal("0.00")
            
            metadata["existing_ict_org_url"] = narrative.existing_ict_org_url
            metadata["proposed_ict_org_url"] = narrative.proposed_ict_org_url
            metadata["placement_ict_org_url"] = narrative.placement_ict_org_url

            metadata["mithi_network_profile"] = narrative.mithi_network_profile
            metadata["mithi_special_solutions"] = narrative.mithi_special_solutions
            metadata["mithi_data_center"] = narrative.mithi_data_center
            metadata["mithi_hardware_inventory"] = narrative.mithi_hardware_inventory
            
            metadata["mithi_security_dr"] = narrative.mithi_security_dr
            metadata["mithi_data_archiving"] = narrative.mithi_data_archiving
            metadata["mithi_ict_issues"] = narrative.mithi_ict_issues

            metadata["implementation_schedules"] = narrative.implementation_schedules
            
            metadata["agency_logo_url"] = resolve_local_img_path(narrative.agency_logo_url or "https://upload.wikimedia.org/wikipedia/en/thumb/8/8e/Camarines_Sur_Polytechnic_Colleges_logo.png/220px-Camarines_Sur_Polytechnic_Colleges_logo.png")
            metadata["org_chart_url"] = resolve_local_img_path(narrative.org_chart_url)
            metadata["conceptual_framework_url"] = resolve_local_img_path(narrative.conceptual_framework_url)
            metadata["functional_interface_url"] = resolve_local_img_path(narrative.functional_interface_url)
            metadata["existing_ict_org_url"] = resolve_local_img_path(narrative.existing_ict_org_url)
            metadata["proposed_ict_org_url"] = resolve_local_img_path(narrative.proposed_ict_org_url)
            metadata["placement_ict_org_url"] = resolve_local_img_path(narrative.placement_ict_org_url)

            metadata["site_development_plan_url"] = resolve_local_img_path(narrative.site_development_plan_url)
            metadata["fiber_backbone_url"] = resolve_local_img_path(narrative.fiber_backbone_url)
            metadata["system_architecture_url"] = resolve_local_img_path(narrative.system_architecture_url)
            metadata["network_diagram_url"] = resolve_local_img_path(narrative.network_diagram_url)
            metadata["process_flow_diagram_url"] = resolve_local_img_path(narrative.process_flow_diagram_url)

            metadata["transmittal_recipient"] = narrative.transmittal_recipient
            metadata["transmittal_recipient_title"] = narrative.transmittal_recipient_title
            metadata["transmittal_recipient_agency"] = narrative.transmittal_recipient_agency
            metadata["transmittal_recipient_address"] = narrative.transmittal_recipient_address
            metadata["transmittal_date"] = narrative.transmittal_date
            
            metadata["scope_json"] = narrative.scope_json

            # Map the 9 system-specific network layout paths
            metadata["net_layout_sias_url"] = resolve_local_img_path(narrative.net_layout_sias_url)
            metadata["net_layout_library_url"] = resolve_local_img_path(narrative.net_layout_library_url)
            metadata["net_layout_security_url"] = resolve_local_img_path(narrative.net_layout_security_url)
            metadata["net_layout_hris_url"] = resolve_local_img_path(narrative.net_layout_hris_url)
            metadata["net_layout_dms_url"] = resolve_local_img_path(narrative.net_layout_dms_url)
            metadata["net_layout_supplies_url"] = resolve_local_img_path(narrative.net_layout_supplies_url)
            metadata["net_layout_budget_url"] = resolve_local_img_path(narrative.net_layout_budget_url)
            metadata["net_layout_sias_upgrade_url"] = resolve_local_img_path(narrative.net_layout_sias_upgrade_url)
            metadata["net_layout_extension_url"] = resolve_local_img_path(narrative.net_layout_extension_url)

            # Map core diagrams
            metadata["b_3_a_ict_org_url"] = resolve_local_img_path(narrative.b_3_a_ict_org_url)
            metadata["network_diagram_url"] = resolve_local_img_path(narrative.network_diagram_url)
            metadata["process_flow_diagram_url"] = resolve_local_img_path(narrative.process_flow_diagram_url)
            
            if narrative.agency_name:
                metadata["agency_name"] = narrative.agency_name
            if narrative.signatory_prepared_by:
                metadata["signatory_prepared_by"] = narrative.signatory_prepared_by
            if narrative.signatory_approved_by:
                metadata["signatory_approved_by"] = narrative.signatory_approved_by

        self.update_state(state="PROGRESS", meta={"progress": 40, "status": "Compiling approved CapEx and MOOE items..."})
        
        approved_proposals = db.query(Proposal).options(
            joinedload(Proposal.department),
            joinedload(Proposal.deployments_relation)
        ).filter(
            Proposal.status == ProposalStatus.APPROVED,
            Proposal.issp_period == issp_period,
            Proposal.is_archived == False
        ).all()

        approved_subscriptions = db.query(SubscriptionProposal).options(
            joinedload(SubscriptionProposal.department)
        ).filter(
            SubscriptionProposal.status == ProposalStatus.APPROVED,
            SubscriptionProposal.issp_period == issp_period,
            SubscriptionProposal.is_archived == False
        ).all()

        needs_assessments = db.query(NeedsAssessment).filter(NeedsAssessment.is_archived == False).all()
        
        css_style = f'''
        <style>
            @page {{ 
                margin: 0.75in;
                @top-left {{
                    content: "";
                    background-image: url("{metadata.get("agency_logo_url")}");
                    background-size: contain;
                    background-repeat: no-repeat;
                    background-position: left center;
                    height: 40px;
                    width: 40px;
                    border-bottom: 1px solid #cbd5e1;
                    padding-bottom: 8px;
                }}
                @top-center {{
                    content: "Republic of the Philippines\\A CAMARINES SUR POLYTECHNIC COLLEGES\\A Nabua, Camarines Sur";
                    font-family: Arial, sans-serif;
                    font-size: 7.5pt;
                    font-weight: bold;
                    color: #475569;
                    text-align: left;
                    white-space: pre-wrap;
                    line-height: 1.3;
                    padding-left: 8px;
                    border-bottom: 1px solid #cbd5e1;
                    padding-bottom: 8px;
                }}
                @top-right {{
                    content: "INFORMATION SYSTEMS STRATEGIC PLAN (ISSP)\\A {metadata.get("issp_period_years", "2026-2028")}";
                    font-family: Arial, sans-serif;
                    font-size: 8pt;
                    font-weight: bold;
                    color: #1e3a8a;
                    text-align: right;
                    white-space: pre-wrap;
                    line-height: 1.3;
                    border-bottom: 1px solid #cbd5e1;
                    padding-bottom: 8px;
                }}
                @bottom-right {{
                    content: "Page " counter(page) " of " counter(pages);
                    font-family: Arial, sans-serif;
                    font-size: 8pt;
                    color: #64748b;
                }}
            }}
            
            /* Named Page Selectors for Multi-Scoped Resets */
            @page cover_page {{
                size: portrait;
                margin: 0;
                @top-left {{ content: none; }}
                @top-center {{ content: none; }}
                @top-right {{ content: none; }}
                @bottom-right {{ content: none; }}
            }}
            
            @page transmittal_page {{
                size: portrait;
                margin: 0.75in;
                @top-left {{ content: none; }}
                @top-center {{ content: none; }}
                @top-right {{ content: none; }}
                @bottom-right {{ content: none; }}
            }}

            @page portrait_section {{
                size: portrait;
                margin: 0.75in;
            }}

            @page landscape_section {{
                size: landscape;
                margin: 0.5in 0.75in;
            }}

            /* Map named page selectors to class containers */
            .page-cover {{ page: cover_page; }}
            .page-transmittal {{ page: transmittal_page; }}
            .page-portrait {{ page: portrait_section; }}
            .page-landscape {{ page: landscape_section; }}

            /* Enforce Explicit Page Breaks */
            .force-page-break {{
                page-break-before: always;
                break-before: page;
            }}

            /* running header boundary pushing */
            .content-wrapper {{
                padding-top: 80px;
            }}

            /* Table of Contents Restructured Flexbox Layout with Dot Leaders */
            .toc-list {{
                list-style: none;
                padding: 0;
                margin: 0;
            }}
            .toc-list li {{
                display: flex;
                justify-content: space-between;
                align-items: flex-end;
                margin-bottom: 8px;
                font-size: 10pt;
                line-height: 1.2;
            }}
            .indent-0 {{ padding-left: 0; }}
            .indent-1 {{ padding-left: 20px; }}
            .indent-2 {{ padding-left: 40px; }}
            .indent-3 {{ padding-left: 60px; }}
            
            .toc-text {{
                flex-shrink: 0;
                max-width: 70%;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }}
            .toc-dots {{
                flex-grow: 1;
                border-bottom: 1px dotted #444;
                margin: 0 10px;
                position: relative;
                top: -4px;
            }}
            .toc-num {{
                flex-shrink: 0;
                text-align: right;
                min-width: 30px;
                font-weight: bold;
                color: #1e3a8a;
            }}

            /* Image Sizing and Aspect Ratio Preserving Containers */
            .full-page-media {{
                display: block;
                box-sizing: border-box;
                padding: 10px 20px;
                page-break-inside: avoid;
            }}
            .media-header {{
                font-size: 14pt;
                text-transform: uppercase;
                color: #1e3a8a;
                border-bottom: 2px solid #1e3a8a;
                padding-bottom: 5px;
                margin-bottom: 20px;
            }}
            .image-wrapper {{
                display: block;
                text-align: center;
                width: 100%;
            }}
            .image-wrapper img {{
                max-width: 100%;
                max-height: 420px; /* Limits height to fit the title and header on the same page */
                height: auto;
                object-fit: contain;
                display: block;
                margin: 0 auto;
            }}

            .page-number-ref-part1::after {{ content: target-counter(#part_1_org_profile, page); }}
            .page-number-ref-part1b::after {{ content: target-counter(#part_1_b_manpower, page); }}
            .page-number-ref-part1c::after {{ content: target-counter(#core_process_flow, page); }}
            .page-number-ref-part1d::after {{ content: target-counter(#part_1_org_profile, page); }}
            .page-number-ref-part1e::after {{ content: target-counter(#part_1_e_concerns, page); }}
            .page-number-ref-part2::after {{ content: target-counter(#part_2_is_strategy, page); }}
            .page-number-ref-part2-cards::after {{ content: target-counter(#part-2-b-c-databases, page); }}
            .page-number-ref-part3::after {{ content: target-counter(#part_3_ict_projects, page); }}
            .page-number-ref-pmf::after {{ content: target-counter(#part_3_ict_projects, page); }}
            .page-number-ref-part4::after {{ content: target-counter(#part_4_b_org_structure, page); }}
            .page-number-ref-schedules::after {{ content: target-counter(#part_5_schedules, page); }}
            .page-number-ref-investments::after {{ content: target-counter(#part_5_investments, page); }}
            .page-number-ref-annex1::after {{ content: target-counter(#annex_master, page); }}
            .page-number-ref-annexa3::after {{ content: target-counter(#annex_a3_functions, page); }}
            .page-number-ref-annexa4::after {{ content: target-counter(#annex_a4_programs, page); }}
            
            body {{ 
                font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; 
                line-height: 1.5; 
                color: #334155; 
                margin: 0; 
                padding: 0; 
                background-color: #ffffff;
            }}
            
            h1, h2, h3, h4, h5 {{ color: #0f172a; margin-top: 0; }}

            .section-title {{
                font-size: 13pt; 
                color: #1e3a8a; 
                border-bottom: 1px solid #1e3a8a; 
                padding-bottom: 4px; 
                margin-top: 10px;
                margin-bottom: 15px; 
                text-transform: uppercase; 
                font-weight: bold;
                letter-spacing: 0.5px;
            }}

            .sub-section-title {{
                color: #1e3a8a; 
                font-size: 10pt; 
                margin-top: 15px; 
                margin-bottom: 8px; 
                text-transform: uppercase; 
                font-weight: bold;
                letter-spacing: 0.3px;
            }}
            
            table {{ 
                width: 100%; 
                border-collapse: collapse; 
                margin-bottom: 15px; 
                page-break-inside: avoid; 
            }}
            
            th {{ 
                background-color: #f0f7ff; 
                color: #1e3a8a; 
                padding: 6px 8px; 
                font-size: 8pt; 
                text-align: left; 
                text-transform: uppercase; 
                border: 1px solid #cbd5e1; 
            }}
            
            td {{ 
                padding: 6px 8px; 
                border: 1px solid #cbd5e1; 
                font-size: 8pt; 
                color: #334155; 
            }}
            
            tr {{ page-break-inside: avoid; }}
            th {{ text-transform: uppercase; letter-spacing: 0.5px; }}
        </style>
        '''

        try:
            from weasyprint import HTML
        except OSError as os_err:
            logger.critical(f"CRITICAL HOST SYSTEM OS FAILURE: weasyprint shared library dependencies are missing: {str(os_err)}")
            raise RuntimeError(
                "PDF Compilation Engine cannot boot: Host OS shared libraries (libpango, libcairo) are missing. "
                "Please run: 'sudo apt-get install libpango-1.0-0 libcairo2 libpangoft2-1.0-0' to resolve."
            ) from os_err
        except Exception as generic_err:
            logger.critical(f"Failed to initialize weasyprint compilation libraries: {str(generic_err)}")
            raise RuntimeError("PDF compilation engine initialization failed.") from generic_err

        # ==========================================================
        # TREE TRAVERSAL & COMPILATION FLOW
        # ==========================================================
        self.update_state(state="PROGRESS", meta={"progress": 50, "status": "Executing Pass 1: Calculating layout geometry & final page count..."})

        # Query all standard sections matching the structure of the official CSPC guide format
        html_blocks_pass1 = []
        for format_item in STANDARD_ISSP_FORMAT:
            rendered = ISSPDynamicCompiler.render_section(
                format_item["schema_id"], 
                metadata, 
                approved_proposals, 
                approved_subscriptions, 
                needs_assessments,
                planning_years
            )
            
            # Map cover and transmittal sheets to custom clean page styles to remove running headers/footers
            if format_item["schema_id"] == "core_cover":
                orientation_class = "page-cover"
            elif format_item["schema_id"] == "core_transmittal":
                orientation_class = "page-transmittal"
            else:
                orientation_class = "page-portrait" if format_item["orientation"] == "portrait" else "page-landscape"
                
            break_class = "force-page-break" if format_item["force_page_break"] else ""
            
            html_blocks_pass1.append(f'''
            <div class="{orientation_class} {break_class} content-wrapper" id="{format_item["schema_id"]}">
                {rendered}
            </div>
            ''')
        combined_body_pass1 = "".join(html_blocks_pass1)

        html_raw_pass1 = f"<html><head>{css_style}</head><body>{combined_body_pass1}</body></html>"
        
        html_doc_pass1 = HTML(string=html_raw_pass1, base_url=str(Path(settings.LOCAL_UPLOAD_DIR).parent))
        rendered_doc_pass1 = html_doc_pass1.render()
        
        core_pages = []
        for p in rendered_doc_pass1.pages:
            p_name = getattr(p, "page_name", getattr(p, "_page_name", None))
            if p_name in ["portrait_section", "landscape_section"]:
                core_pages.append(p)
                
        total_page_count = len(core_pages) if core_pages else len(rendered_doc_pass1.pages)

        self.update_state(state="PROGRESS", meta={"progress": 80, "status": f"Executing Pass 2: Drawing table layouts for {total_page_count} certified pages..."})
        metadata["computed_total_pages"] = str(total_page_count)

        # Execution Pass 2
        html_blocks_pass2 = []
        for format_item in STANDARD_ISSP_FORMAT:
            rendered = ISSPDynamicCompiler.render_section(
                format_item["schema_id"], 
                metadata, 
                approved_proposals, 
                approved_subscriptions, 
                needs_assessments,
                planning_years
            )
            if format_item["schema_id"] == "core_cover":
                orientation_class = "page-cover"
            elif format_item["schema_id"] == "core_transmittal":
                orientation_class = "page-transmittal"
            else:
                orientation_class = "page-portrait" if format_item["orientation"] == "portrait" else "page-landscape"
            break_class = "force-page-break" if format_item["force_page_break"] else ""
            
            html_blocks_pass2.append(f'''
            <div class="{orientation_class} {break_class} content-wrapper" id="{format_item["schema_id"]}">
                {rendered}
            </div>
            ''')
        combined_body_pass2 = "".join(html_blocks_pass2)

        html_raw_pass2 = f"<html><head>{css_style}</head><body>{combined_body_pass2}</body></html>"

        html_doc_pass2 = HTML(string=html_raw_pass2, base_url=str(Path(settings.LOCAL_UPLOAD_DIR).parent))
        pdf_buffer = io.BytesIO()
        html_doc_pass2.write_pdf(target=pdf_buffer)
        
        self.update_state(state="PROGRESS", meta={"progress": 95, "status": "Uploading output binary to secure storage..."})
        file_bytes = pdf_buffer.getvalue()
        
        issp_id = metadata.get("issp_id", "ISSP-COMPILATION-DEFAULT")
        storage_client.upload_compiled_pdf(file_bytes, issp_id)
        
        download_url = storage_client.generate_download_url(storage_client.get_generated_pdf_key(issp_id))
        
        return {
            "status": "SUCCESS",
            "file_url": download_url,
            "generated_at": time.strftime("%Y-%m-%d %H:%M:%S")
        }

    except SoftTimeLimitExceeded as timeout_exc:
        db.rollback()
        logger.error(f"Celery SoftTimeLimitExceeded hit during PDF compilation: {str(timeout_exc)}")
        raise Exception("CompilationError: PDF generation soft timeout limit exceeded.")
        
    except ValueError as validation_exc:
        db.rollback()
        logger.warning(f"ISSP Compliance Validation Block: {str(validation_exc)}")
        raise Exception(f"ValidationError: {str(validation_exc)}")
        
    except Exception as e:
        db.rollback()
        logger.error(f"Async dynamic compilation failed: {str(e)}", exc_info=True)
        raise Exception(f"CompilationError: {str(e)}")
    finally:
        db.close()

