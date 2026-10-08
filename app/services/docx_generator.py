# app/services/docx_generator.py
"""
=============================================================================
DICT ISSP v.2026 COMPLIANCE ENGINE — WORD (.DOCX) DOCUMENT GENERATOR
=============================================================================
Strictly adheres to official DICT ISSP v.2026 Guidelines and statutory order:
- Single Central Institutional Emblem (No Secondary Side Logos)
- First-Page Header/Footer Suppression (Cover Page Clean Mode)
- Full Statutory Structure:
    * Cover Page (Page 1)
    * Table of Contents (2-Column Format with Statutorily Mapped Page Numbers)
    * Preliminary: Definition of Terms (Glossary with Fallback Seeding)
    * Part I: Agency Profile & Strategic Context (A, B.1, B.2, C)
    * Part II: Current ICT Assessment (A, B1, B2, C, D)
    * Part III: Proposed ICT Strategy (A1, A2, B, C, D, E1/E2 Charters, F1/F2/F3 PMF)
    * Part IV: Resource Requirements (A. Detailed Annual Deployments, B. Parity Tables B.1-B.4)
    * Annex 1: Existing ICT Asset Inventory (1. Equipment, 2. Software - Real Aggregations)
    * Annex 2: Disaster Recovery & Business Continuity Plan (DRBCP Sections 1-6 + KPIs)
=============================================================================
"""

import io
import os
import re
import json
import logging
from decimal import Decimal
from typing import List, Dict, Any, Optional, Union

from docx import Document
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_ALIGN_VERTICAL
from docx.enum.section import WD_ORIENTATION
from docx.oxml import OxmlElement, parse_xml
from docx.oxml.ns import qn, nsdecls

from app.config import settings

logger = logging.getLogger("app.services.docx_generator")


# =========================================================================
# CANONICAL DICT STATUTORY GLOSSARY FALLBACK
# =========================================================================

DEFAULT_CANONICAL_GLOSSARY = [
    (
        "DICT",
        "Department of Information and Communications Technology – The executive department of the Philippine government responsible for the planning, development, and promotion of the national ICT agenda in support of national development."
    ),
    (
        "MITHI",
        "Medium-Term Information and Technology Harmonization Initiative – An inter-agency initiative (DBM, DICT, NEDA) aimed at harmonizing government ICT investments to optimize public resources and eliminate redundancies."
    ),
    (
        "ISSP",
        "Information Systems Strategic Plan – A statutory three-year strategic blueprint that outlines an agency's overall ICT strategy, operational information systems, infrastructure roadmaps, and budgetary requirements."
    ),
    (
        "PeGIF",
        "Philippine e-Government Interoperability Framework – Technical, organizational, and semantic specifications designed to enable seamless data exchange, unified digital identity, and API interconnectivity among government agencies."
    ),
    (
        "GovNet",
        "Government Network – High-speed fiber-optic network infrastructure deployed by DICT to interconnect national government agencies, state universities, and field offices for secure digital communications."
    ),
    (
        "GovCloud",
        "Government Cloud – Secure, multi-tenant cloud hosting infrastructure managed by DICT, providing scalable virtual compute, containerized clusters, and offsite disaster recovery storage for public sector services."
    ),
    (
        "PNPKI",
        "Philippine National Public Key Infrastructure – The national cryptographic certification authority operated by DICT that issues digital certificates ensuring confidentiality, integrity, authenticity, and non-repudiation in electronic transactions."
    ),
    (
        "DPA",
        "Data Privacy Act of 2012 (Republic Act No. 10173) – Comprehensive statutory law mandating the protection and security of personal and sensitive personal information processed by government agencies and private entities."
    ),
    (
        "UACS",
        "Unified Accounts Code Structure – Standardized government-wide coding framework jointly developed by DBM, COA, and DOF to harmonize budget classification, expenditure monitoring, and accounting across the bureaucracy."
    ),
    (
        "CO",
        "Capital Outlay – Budgetary appropriation classification for expenditures intended for the acquisition of physical assets, IT infrastructure, perpetual software licenses, and systems whose utility extends beyond one fiscal year."
    ),
    (
        "MOOE",
        "Maintenance and Other Operating Expenses – Budgetary classification covering recurrent operational expenditures necessary for day-to-day government operations, including software-as-a-service subscriptions, utilities, and maintenance contracts."
    ),
    (
        "DRBCP",
        "Disaster Recovery and Business Continuity Plan – Mandatory institutional protocol establishing emergency procedures, technical failovers, Recovery Time Objectives (RTO), and Recovery Point Objectives (RPO) to safeguard government data and services."
    )
]


# =========================================================================
# XML FORMATTING HELPERS FOR WORD TABLES & CELL STYLING
# =========================================================================

def set_cell_shading(cell, color_hex: str = "F1F5F9"):
    """Applies a solid background shading color to a Word table cell."""
    shading_elm = parse_xml(f'<w:shd {nsdecls("w")} w:fill="{color_hex}"/>')
    cell._tc.get_or_add_tcPr().append(shading_elm)


def set_cell_margins(cell, top: int = 80, bottom: int = 80, left: int = 120, right: int = 120):
    """Sets internal padding (in dxa: 20 dxa = 1 pt) for a table cell."""
    tcPr = cell._tc.get_or_add_tcPr()
    tcMar = OxmlElement('w:tcMar')
    for m, val in [('w:top', top), ('w:bottom', bottom), ('w:left', left), ('w:right', right)]:
        node = OxmlElement(m)
        node.set(qn('w:w'), str(val))
        node.set(qn('w:type'), 'dxa')
        tcMar.append(node)
    tcPr.append(tcMar)


def set_table_borders(table, color: str = "334155", sz: str = "4", val: str = "single"):
    """Applies clean, standard borders to all edges and inside grid lines of a Word table."""
    tblPr = table._tbl.tblPr
    borders = parse_xml(
        f'<w:tblBorders {nsdecls("w")}>'
        f'  <w:top w:val="{val}" w:sz="{sz}" w:space="0" w:color="{color}"/>'
        f'  <w:bottom w:val="{val}" w:sz="{sz}" w:space="0" w:color="{color}"/>'
        f'  <w:insideH w:val="{val}" w:sz="{sz}" w:space="0" w:color="{color}"/>'
        f'  <w:insideV w:val="{val}" w:sz="{sz}" w:space="0" w:color="{color}"/>'
        f'  <w:left w:val="{val}" w:sz="{sz}" w:space="0" w:color="{color}"/>'
        f'  <w:right w:val="{val}" w:sz="{sz}" w:space="0" w:color="{color}"/>'
        f'</w:tblBorders>'
    )
    tblPr.append(borders)


def make_header_row_repeat(row):
    """Ensures a table header row repeats at the top of subsequent pages."""
    trPr = row._tr.get_or_add_trPr()
    trPr.append(OxmlElement('w:tblHeader'))


def prevent_row_split(row):
    """Prevents a table row from awkwardly breaking across pages."""
    trPr = row._tr.get_or_add_trPr()
    trPr.append(OxmlElement('w:cantSplit'))


def fmt_currency(val: Any) -> str:
    """Formats numeric and decimal currency values to standard Philippine Peso format."""
    if val is None:
        return "PHP 0.00"
    try:
        dec = Decimal(str(val))
        return f"PHP {dec:,.2f}"
    except Exception:
        return "PHP 0.00"


def clean_str(val: Any, default: str = "") -> str:
    """Extracts a clean, non-null string value safely from objects or enums."""
    if val is None:
        return default
    s = str(getattr(val, "value", val) or "").strip()
    return s if s else default


def strip_html_tags(text_val: Any) -> str:
    """Converts HTML strings into clean, structured plain text paragraphs."""
    if not text_val:
        return ""
    clean = re.sub(r'</?(p|br|li|h[1-6]|tr|div)[^>]*>', '\n', str(text_val), flags=re.IGNORECASE)
    clean = re.sub(r'<[^>]+>', '', clean)
    clean = clean.replace('&amp;', '&').replace('&lt;', '<').replace('&gt;', '>').replace('&quot;', '"').replace('&#39;', "'")
    clean = re.sub(r'\n\s*\n+', '\n\n', clean).strip()
    return clean


def clean_uacs_title(uacs_str: str) -> str:
    """Strips numeric UACS accounting prefixes, displaying solely the clean account title."""
    if not uacs_str:
        return ""
    val = str(uacs_str).strip()
    if " - " in val:
        return val.split(" - ", 1)[1].strip()
    cleaned = re.sub(r'^\d{8}(?:\s+\d{2})?\s*[-–]?\s*', '', val).strip()
    return cleaned or val


def resolve_diagram_path(url: Optional[str]) -> Optional[str]:
    """Resolves local file path on disk if available for direct insertion into Word .docx."""
    if not url or not isinstance(url, str):
        return None
    url_clean = url.strip()
    if os.path.exists(url_clean) and os.path.isfile(url_clean):
        return url_clean
    if "/static/uploads/" in url_clean:
        try:
            rel = url_clean.split("/static/uploads/")[-1]
            candidate = os.path.join(getattr(settings, "LOCAL_UPLOAD_DIR", "uploads"), rel)
            if os.path.exists(candidate) and os.path.isfile(candidate):
                return candidate
        except Exception:
            pass
    return None


def render_schematic_box(doc, title: str, subtitle: str, section_label: str, img_url: Optional[str] = None):
    """
    Renders an official schematic exhibit in Word format.
    If the image exists locally on disk, inserts the actual picture.
    Otherwise, renders the official DICT statutory schematic container box.
    """
    local_path = resolve_diagram_path(img_url)
    if local_path:
        try:
            p_img = doc.add_paragraph()
            p_img.alignment = WD_ALIGN_PARAGRAPH.CENTER
            p_img.paragraph_format.space_before = Pt(6)
            p_img.paragraph_format.space_after = Pt(6)
            r_img = p_img.add_run()
            r_img.add_picture(local_path, width=Inches(9.5))
            return
        except Exception as e:
            logger.debug(f"Direct schematic image insertion note for {title}: {e}")

    tbl = doc.add_table(rows=1, cols=1)
    tbl.alignment = WD_TABLE_ALIGNMENT.CENTER
    tbl.autofit = False

    cell = tbl.rows[0].cells[0]
    cell.width = Inches(10.2)
    set_cell_shading(cell, "F8FAFC")
    set_cell_margins(cell, top=200, bottom=200, left=240, right=240)

    tblPr = tbl._tbl.tblPr
    borders = parse_xml(
        f'<w:tblBorders {nsdecls("w")}>'
        f'  <w:top w:val="dashed" w:sz="8" w:space="0" w:color="94A3B8"/>'
        f'  <w:bottom w:val="dashed" w:sz="8" w:space="0" w:color="94A3B8"/>'
        f'  <w:insideH w:val="none"/>'
        f'  <w:insideV w:val="none"/>'
        f'  <w:left w:val="dashed" w:sz="8" w:space="0" w:color="94A3B8"/>'
        f'  <w:right w:val="dashed" w:sz="8" w:space="0" w:color="94A3B8"/>'
        f'</w:tblBorders>'
    )
    tblPr.append(borders)

    p = cell.paragraphs[0]
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER

    r_hdr = p.add_run("OFFICIAL SCHEMATIC SPECIFICATION FRAMEWORK\n")
    r_hdr.font.name = "Palatino Linotype"
    r_hdr.font.size = Pt(10)
    r_hdr.font.bold = True
    r_hdr.font.color.rgb = RGBColor(30, 58, 138)

    r_title = p.add_run(f"{section_label}: {title.upper()}\n")
    r_title.font.name = "Palatino Linotype"
    r_title.font.size = Pt(9)
    r_title.font.bold = True
    r_title.font.color.rgb = RGBColor(15, 23, 42)

    r_sub = p.add_run(f"{subtitle}\n\n")
    r_sub.font.name = "Palatino Linotype"
    r_sub.font.size = Pt(8)
    r_sub.font.italic = True
    r_sub.font.color.rgb = RGBColor(100, 116, 139)

    r_note = p.add_run("Physical and logical architecture diagram maintained under institutional repository.\nApproved under DICT ISSP Guidelines • Reference Exhibit for Planning Horizon.")
    r_note.font.name = "Palatino Linotype"
    r_note.font.size = Pt(7.5)
    r_note.font.color.rgb = RGBColor(71, 85, 105)


def render_cybersecurity_checklist(doc, cyber_list: List[Any], is_proposed: bool = False):
    """Renders the official DICT Cybersecurity Control Checklist grouped by standard security domains."""
    standard_domains = [
        "PHYSICAL SECURITY",
        "PERIMETER SECURITY",
        "NETWORK SECURITY",
        "ENDPOINT SECURITY",
        "DATA SECURITY",
        "APPLICATION SECURITY",
        "OTHER MEASURES"
    ]

    active_controls = [c for c in cyber_list if getattr(c, "is_proposed", False) == is_proposed]

    tbl = doc.add_table(rows=1, cols=3)
    tbl.style = 'Table Grid'
    set_table_borders(tbl)
    make_header_row_repeat(tbl.rows[0])
    prevent_row_split(tbl.rows[0])

    headers = ["Security Domain", "MANDATORY CONTROLS", "OPTIONAL CONTROLS"]
    widths = [Inches(2.5), Inches(4.5), Inches(3.2)]

    for idx, h in enumerate(headers):
        c = tbl.rows[0].cells[idx]
        c.width = widths[idx]
        set_cell_shading(c, "F1F5F9")
        r = c.paragraphs[0].add_run(h)
        r.font.name = "Palatino Linotype"
        r.font.bold = True
        r.font.size = Pt(8)

    for domain in standard_domains:
        d_controls = [c for c in active_controls if clean_str(getattr(c, "control_domain", "")).upper() == domain]
        mandatory = [c for c in d_controls if getattr(c, "is_mandatory", True)]
        optional = [c for c in d_controls if not getattr(c, "is_mandatory", True)]

        row = tbl.add_row()
        prevent_row_split(row)

        c0 = row.cells[0]
        c0.width = widths[0]
        set_cell_shading(c0, "F8FAFC")
        r0 = c0.paragraphs[0].add_run(domain)
        r0.font.name = "Palatino Linotype"
        r0.font.bold = True
        r0.font.size = Pt(7.5)

        c1 = row.cells[1]
        c1.width = widths[1]
        p1 = c1.paragraphs[0]
        if mandatory:
            for c in mandatory:
                is_impl = getattr(c, "is_implemented", False)
                r = p1.add_run(f"[{'X' if is_impl else ' '}] {clean_str(c.control_name)}\n")
                r.font.name = "Palatino Linotype"
                r.font.size = Pt(7)
        else:
            r = p1.add_run("No mandatory controls registered")
            r.font.name = "Palatino Linotype"
            r.font.size = Pt(7)
            r.font.italic = True
            r.font.color.rgb = RGBColor(148, 163, 184)

        c2 = row.cells[2]
        c2.width = widths[2]
        p2 = c2.paragraphs[0]
        if optional:
            for c in optional:
                is_impl = getattr(c, "is_implemented", False)
                r = p2.add_run(f"[{'X' if is_impl else ' '}] {clean_str(c.control_name)}\n")
                r.font.name = "Palatino Linotype"
                r.font.size = Pt(7)
        else:
            r = p2.add_run("None specified")
            r.font.name = "Palatino Linotype"
            r.font.size = Pt(7)
            r.font.italic = True
            r.font.color.rgb = RGBColor(148, 163, 184)


def render_information_system_card_docx(doc, sys_obj: Any, is_proposed: bool = False, projects: List[Any] = None):
    """
    Renders an official DICT Information System Specification Card in Word format
    (Parts II.C & III.D). Captures all statutory parameters.
    """
    tbl = doc.add_table(rows=1, cols=2)
    tbl.style = 'Table Grid'
    set_table_borders(tbl)
    prevent_row_split(tbl.rows[0])

    c_hdr = tbl.rows[0].cells[0]
    c_hdr_merge = tbl.rows[0].cells[1]
    c_hdr.merge(c_hdr_merge)
    set_cell_shading(c_hdr, "1E3A8A")
    set_cell_margins(c_hdr, top=100, bottom=100, left=140, right=140)

    p_hdr = c_hdr.paragraphs[0]
    r_hdr = p_hdr.add_run(f"INFORMATION SYSTEM: {clean_str(sys_obj.name).upper()}")
    r_hdr.font.name = "Palatino Linotype"
    r_hdr.font.bold = True
    r_hdr.font.size = Pt(9)
    r_hdr.font.color.rgb = RGBColor(255, 255, 255)

    def add_card_row(label: str, content: str, is_mono: bool = False, is_highlight: bool = False):
        row = tbl.add_row()
        prevent_row_split(row)
        c0, c1 = row.cells[0], row.cells[1]
        c0.width = Inches(2.8)
        c1.width = Inches(7.4)
        set_cell_shading(c0, "F8FAFC")
        set_cell_margins(c0, top=70, bottom=70, left=120, right=120)
        set_cell_margins(c1, top=70, bottom=70, left=120, right=120)

        r0 = c0.paragraphs[0].add_run(label)
        r0.font.name = "Palatino Linotype"
        r0.font.bold = True
        r0.font.size = Pt(8)

        r1 = c1.paragraphs[0].add_run(content)
        r1.font.name = "Courier New" if is_mono else "Palatino Linotype"
        r1.font.size = Pt(8)
        if is_highlight:
            r1.font.bold = True
            r1.font.color.rgb = RGBColor(4, 120, 87)

    class_str = clean_str(getattr(sys_obj, "classification", "")).lower()
    is_supp = getattr(sys_obj, "is_support_to_operations", False) or "support" in class_str
    is_adm = getattr(sys_obj, "is_general_administrative", False) or "admin" in class_str
    is_ops = getattr(sys_obj, "is_operations", False) or "operations" in class_str or (not is_supp and not is_adm)
    is_front = getattr(sys_obj, "is_frontline_service", False) or ("frontline" in class_str and "non-frontline" not in class_str)
    is_non_front = getattr(sys_obj, "is_non_frontline_service", False) or "non-frontline" in class_str

    hosting = clean_str(getattr(sys_obj, "frontline_hosting_type", None) or getattr(sys_obj, "hosting_type", "Online"))
    url = clean_str(getattr(sys_obj, "online_url", None))
    front_details = f" [{'X' if hosting == 'Online' else ' '}] Online [{'X' if hosting == 'On-premise' else ' '}] On-premise [{'X' if hosting == 'Hybrid' else ' '}] Hybrid" + (f" (URL: {url})" if url else "")

    class_text = (
        f"[{'X' if is_supp else ' '}] Support to Operations\n"
        f"[{'X' if is_adm else ' '}] General Administrative Systems\n"
        f"[{'X' if is_ops else ' '}] Operations\n"
        f"    [{'X' if is_front else ' '}] Frontline Service (Direct public/client delivery):{front_details}\n"
        f"    [{'X' if is_non_front else ' '}] Non-Frontline Service (Core mandate back-office)"
    )
    add_card_row("CLASSIFICATION", class_text)
    add_card_row("DESCRIPTION & PURPOSE", clean_str(sys_obj.description_and_purpose))

    status_val = clean_str(getattr(sys_obj, "status", "Operational"))
    add_card_row("LIFECYCLE STATUS", status_val)

    if is_proposed:
        cost_val = fmt_currency(getattr(sys_obj, "proposed_cost", 0))
        add_card_row("ESTIMATED PROPOSED COST", cost_val, is_mono=True, is_highlight=True)

        proj_title = None
        if getattr(sys_obj, "project_parent", None):
            proj_title = sys_obj.project_parent.project_title
        elif getattr(sys_obj, "project_id", None) and projects:
            p_obj = next((p for p in projects if str(p.id) == str(sys_obj.project_id)), None)
            if p_obj:
                proj_title = p_obj.project_title
        if proj_title:
            add_card_row("LINKED ICT PROJECT (PART III.E)", proj_title)

        if "enhancement" in status_val.lower() and getattr(sys_obj, "enhancement_details", None):
            add_card_row("ENHANCEMENT DETAILS", clean_str(sys_obj.enhancement_details))

    strat = clean_str(getattr(sys_obj, "development_strategy", "Outsourced"))
    add_card_row("DEVELOPMENT STRATEGY", strat)
    add_card_row("DEVELOPMENT PLATFORM", clean_str(sys_obj.development_platform))
    add_card_row("DATABASE NAME", clean_str(sys_obj.database_name), is_mono=True)
    add_card_row("DATA STORAGE", clean_str(sys_obj.data_storage_type))
    add_card_row("INTERNAL USERS", clean_str(sys_obj.internal_users))
    add_card_row("EXTERNAL USERS", clean_str(sys_obj.external_users))
    add_card_row("SYSTEM OWNER OFFICE", clean_str(sys_obj.system_owner_office))

    is_integ = getattr(sys_obj, "is_integrated_with_others", False)
    integ_text = (
        f"[{'X' if is_integ else ' '}] Integrated with another system\n"
        f"    Internal: {clean_str(sys_obj.internal_integrated_systems, 'None')} | External: {clean_str(sys_obj.external_integrated_systems, 'None')}\n"
        f"[{'X' if getattr(sys_obj, 'generates_data_for_others', False) else ' '}] Generates data utilized by other systems\n"
        f"[{'X' if getattr(sys_obj, 'processes_data_from_others', False) else ' '}] Processes data generated by other systems\n"
        f"[{'X' if getattr(sys_obj, 'is_deployed_on_shared_platform', False) else ' '}] Deployed on a shared platform"
    )
    add_card_row("INTEROPERABILITY", integ_text)

    proc_pii = getattr(sys_obj, "processes_personal_information", False)
    pia_done = getattr(sys_obj, "has_undergone_pia", False)
    pia_target = clean_str(getattr(sys_obj, "pia_target_date_text", None))
    pia_text = (
        f"Processes Personal Information: [{'X' if proc_pii else ' '}] Yes  [{'X' if not proc_pii else ' '}] No\n"
        f"Undergone PIA Audit: [{'X' if pia_done else ' '}] Yes  [{'X' if (proc_pii and not pia_done) else ' '}] No" +
        (f" (Target Completion Date: {pia_target})" if (proc_pii and not pia_done and pia_target) else "")
    )
    add_card_row("PRIVACY IMPACT ASSESSMENT (PIA)", pia_text)

    doc.add_paragraph()


def render_project_charter_card(doc, proj: Any, is_cross: bool = False, planning_years: List[int] = None):
    """
    Renders an official DICT Project Charter Card in Word format (Parts III.E.1 & III.E.2)
    matching DICT ISSP Guidelines & Templates.
    """
    tbl = doc.add_table(rows=1, cols=2)
    tbl.style = 'Table Grid'
    set_table_borders(tbl)
    prevent_row_split(tbl.rows[0])

    c_hdr = tbl.rows[0].cells[0]
    c_hdr_merge = tbl.rows[0].cells[1]
    c_hdr.merge(c_hdr_merge)
    set_cell_shading(c_hdr, "1E3A8A")
    set_cell_margins(c_hdr, top=100, bottom=100, left=140, right=140)

    p_hdr = c_hdr.paragraphs[0]
    sec_prefix = "E.2. CROSS-AGENCY ICT PROJECT" if is_cross else "E.1. INTERNAL ICT PROJECT"
    r_hdr = p_hdr.add_run(f"{sec_prefix}: {clean_str(proj.project_title).upper()}")
    r_hdr.font.name = "Palatino Linotype"
    r_hdr.font.bold = True
    r_hdr.font.size = Pt(9)
    r_hdr.font.color.rgb = RGBColor(255, 255, 255)

    def add_charter_row(label: str, content: str, is_mono: bool = False, is_highlight: bool = False):
        row = tbl.add_row()
        prevent_row_split(row)
        c0, c1 = row.cells[0], row.cells[1]
        c0.width = Inches(2.8)
        c1.width = Inches(7.4)
        set_cell_shading(c0, "F8FAFC")
        set_cell_margins(c0, top=70, bottom=70, left=120, right=120)
        set_cell_margins(c1, top=70, bottom=70, left=120, right=120)

        r0 = c0.paragraphs[0].add_run(label)
        r0.font.name = "Palatino Linotype"
        r0.font.bold = True
        r0.font.size = Pt(8)

        r1 = c1.paragraphs[0].add_run(content)
        r1.font.name = "Courier New" if is_mono else "Palatino Linotype"
        r1.font.size = Pt(8)
        if is_highlight:
            r1.font.bold = True
            r1.font.color.rgb = RGBColor(4, 120, 87)

    add_charter_row("PROJECT TITLE", clean_str(proj.project_title))
    add_charter_row("DESCRIPTION", clean_str(proj.description))
    add_charter_row("OBJECTIVES", clean_str(proj.objectives))

    aligns_others_specify = clean_str(getattr(proj, "aligns_others_specify", None))
    others_text = f" ({aligns_others_specify})" if getattr(proj, "aligns_others", False) and aligns_others_specify else ""
    align_text = (
        f"[{'X' if getattr(proj, 'aligns_pip', False) else ' '}] Public Investment Program (PIP)\n"
        f"[{'X' if getattr(proj, 'aligns_ncsp', False) else ' '}] National Cybersecurity Plan (NCSP)\n"
        f"[{'X' if getattr(proj, 'aligns_egmp', False) else ' '}] E-Government Master Plan (EGMP)\n"
        f"[{'X' if getattr(proj, 'aligns_pcb', False) else ' '}] Program Convergence Budgeting (PCB)\n"
        f"[{'X' if getattr(proj, 'aligns_others', False) else ' '}] Others{others_text}"
    )
    add_charter_row("STRATEGIC ALIGNMENT", align_text)

    harm_map = getattr(proj, "harmonization_criteria", None)
    if isinstance(harm_map, str):
        try: harm_map = json.loads(harm_map)
        except Exception: harm_map = None

    if isinstance(harm_map, dict) and len(harm_map) > 0:
        harm_lines = [f"[{'X' if val else ' '}] {crit}" for crit, val in harm_map.items()]
        harm_text = "\n".join(harm_lines)
    else:
        harm_text = (
            f"[{'X' if getattr(proj, 'harmonizes_national_priority', False) else ' '}] National Prioritization (PDP 2023-2028)\n"
            f"[{'X' if getattr(proj, 'harmonizes_resource_optimization', False) else ' '}] Resource Optimization (GovNet, GovCloud)\n"
            f"[{'X' if getattr(proj, 'harmonizes_pegif', False) else ' '}] PeGIF Standardized APIs & Interoperability\n"
            f"[{'X' if getattr(proj, 'harmonizes_cross_collaboration', False) else ' '}] Cross-Agency Collaboration (JMC / MOA)\n"
            f"[{'X' if getattr(proj, 'harmonizes_scalability', False) else ' '}] Scalability and Sustainability (SPAR / PREXC)"
        )
    add_charter_row("HARMONIZATION FRAMEWORK", harm_text)

    p_start = getattr(proj, "duration_start_year", None) or 2028
    p_end = getattr(proj, "duration_end_year", None) or (p_start + 2)
    add_charter_row("DURATION", f"FY {p_start} to FY {p_end} ({max(1, p_end - p_start + 1)} Years)")

    annual_map = getattr(proj, "annual_deliverables", None) or {}
    if isinstance(annual_map, str):
        try: annual_map = json.loads(annual_map)
        except Exception: annual_map = {}

    p_years = list(range(p_start, p_end + 1)) if p_end >= p_start else [p_start]
    for idx, yr in enumerate(p_years):
        m_text = annual_map.get(str(yr)) or annual_map.get(f"Year {idx + 1}")
        if not m_text:
            if idx == 0: m_text = getattr(proj, "year_1_deliverables", "N/A")
            elif idx == 1: m_text = getattr(proj, "year_2_deliverables", "N/A")
            elif idx == 2: m_text = getattr(proj, "year_3_deliverables", "N/A")
            else: m_text = "N/A"
        add_charter_row(f"YEAR {idx + 1} DELIVERABLES (FY {yr})", clean_str(m_text, "N/A"))

    add_charter_row("IMPLEMENTING UNIT", clean_str(proj.implementing_unit, "ICT Management Office"))
    add_charter_row("TOTAL PROJECT COST", fmt_currency(proj.computed_total_project_cost), is_mono=True, is_highlight=True)
    add_charter_row("FUNDING SOURCE", clean_str(getattr(proj.funding_source, 'value', proj.funding_source), "GAA"))

    if is_cross:
        add_charter_row("LEAD AGENCY", clean_str(getattr(proj, "lead_agency", None), "DICT"))
        add_charter_row("PARTNER AGENCIES", clean_str(getattr(proj, "partner_agencies", None), "None"))

    doc.add_paragraph()


# =========================================================================
# CORE DOCUMENT GENERATOR PIPELINE
# =========================================================================

def create_issp_docx(
    narrative: Any,
    outcomes: List[Any],
    concerns: List[Any],
    systems: List[Any],
    projects: List[Any],
    performance_metrics: Optional[List[Any]] = None,
    items: Optional[List[Any]] = None,
    inventory: Optional[List[Any]] = None,
    parity_data: Optional[Dict[str, Any]] = None,
    human_capitals: Optional[List[Any]] = None,
    staff_positions: Optional[List[Any]] = None,
    stakeholders: Optional[List[Any]] = None,
    egov_checklists: Optional[List[Any]] = None,
    glossary: Optional[List[Any]] = None,
    network_infra: Optional[List[Any]] = None,
    cyber_controls: Optional[List[Any]] = None,
    dr_teams: Optional[List[Any]] = None,
    dr_bias: Optional[List[Any]] = None,
    dr_metrics: Optional[List[Any]] = None,
    **kwargs
) -> io.BytesIO:
    """
    Builds a fully formatted, editable Microsoft Word (.docx) document
    representing the complete DICT ISSP v.2026 statutory blueprint.
    Strictly follows the official DICT ISSP section-by-section order and
    enforces single-agency branding, correct signatories, and unlinked proposal quarantine.
    """
    doc = Document()

    # 1. SETUP PAGE DIMENSIONS & MARGINS (A4 LANDSCAPE)
    for section in doc.sections:
        section.orientation = WD_ORIENTATION.LANDSCAPE
        section.page_width = Inches(11.69)
        section.page_height = Inches(8.27)
        section.top_margin = Inches(0.7)
        section.bottom_margin = Inches(0.7)
        section.left_margin = Inches(0.7)
        section.right_margin = Inches(0.7)

        # CLEAN FIRST PAGE: Suppress Running Header & Footer on Cover Page
        section.different_first_page_header_footer = True

        # Running Header for subsequent pages
        header = section.header
        hp = header.paragraphs[0]
        hp.alignment = WD_ALIGN_PARAGRAPH.RIGHT
        hrun = hp.add_run(f"REPUBLIC OF THE PHILIPPINES | {clean_str(narrative.agency_name, 'AGENCY').upper()} — ISSP FY {narrative.issp_period}")
        hrun.font.name = "Palatino Linotype"
        hrun.font.size = Pt(7.5)
        hrun.font.color.rgb = RGBColor(100, 116, 139)

        # Running Footer for subsequent pages
        footer = section.footer
        fp = footer.paragraphs[0]
        fp.alignment = WD_ALIGN_PARAGRAPH.LEFT
        frun = fp.add_run("OFFICIAL GOVERNMENT DOCUMENT — DICT ISSP v.2026 STANDARD")
        frun.font.name = "Palatino Linotype"
        frun.font.size = Pt(7)
        frun.font.color.rgb = RGBColor(148, 163, 184)

    issp_period = clean_str(narrative.issp_period, "2028-2030")
    agency_name = clean_str(narrative.agency_name, "National Government Agency")
    start_year = getattr(narrative, "issp_period_from", None) or 2028
    end_year = getattr(narrative, "issp_period_to", None) or (start_year + 2)
    planning_years = list(range(start_year, end_year + 1))

    # Resolve Signatories cleanly (preserving actual human names)
    raw_cio = clean_str(getattr(narrative, "signatory_prepared_by", None) or getattr(narrative, "cio_name", None))
    if not raw_cio or raw_cio.lower() in ["chief information officer", "cio", "none", "null"]:
        cio_name = "REY T. CORTEZ, MIT"
    else:
        cio_name = raw_cio

    raw_head = clean_str(getattr(narrative, "signatory_approved_by", None) or getattr(narrative, "head_of_agency_name", None))
    if not raw_head or raw_head.lower() in ["head of agency", "agency head", "college president", "president", "none", "null"]:
        head_name = "AMADO A. OLIVA JR, PhD."
    else:
        head_name = raw_head

    head_title = clean_str(getattr(narrative, "agency_head_position", None), "Head of Agency")

    # Resolve relationships defensively if optional lists are omitted
    hc_list = human_capitals or getattr(narrative, "human_capitals_relation", []) or []
    sh_list = stakeholders or getattr(narrative, "stakeholder_analyses_relation", []) or []
    net_list = network_infra or getattr(narrative, "network_infrastructures", []) or []
    cyber_list = cyber_controls or getattr(narrative, "cybersecurity_controls", []) or []
    egov_list = egov_checklists or getattr(narrative, "egov_checklists_relation", []) or []
    staff_list = staff_positions or getattr(narrative, "staff_positions_relation", []) or []
    drt_list = dr_teams or getattr(narrative, "dr_team_relation", []) or []
    bia_list = dr_bias or getattr(narrative, "dr_bia_relation", []) or []
    drm_list = dr_metrics or getattr(narrative, "dr_metrics_relation", []) or []

    # FALLBACK SEEDING: Guarantee Definition of Terms is NEVER empty
    glossary_list = glossary or []
    if not glossary_list:
        glossary_list = DEFAULT_CANONICAL_GLOSSARY

    # =========================================================================
    # SECTION 1: COVER PAGE (Page 1) — PROMINENT SINGLE AGENCY EMBLEM (1.65 IN)
    # =========================================================================
    agency_logo_path = resolve_diagram_path(getattr(narrative, "agency_logo_url", None))
    if agency_logo_path:
        try:
            p_logo = doc.add_paragraph()
            p_logo.alignment = WD_ALIGN_PARAGRAPH.CENTER
            p_logo.add_run().add_picture(agency_logo_path, width=Inches(1.65))
        except Exception as e:
            logger.debug(f"Cover logo insertion note: {e}")

    p_rep = doc.add_paragraph()
    p_rep.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r_rep = p_rep.add_run("Republic of the Philippines\n")
    r_rep.font.name = "Palatino Linotype"
    r_rep.font.size = Pt(9.5)
    r_rep.font.color.rgb = RGBColor(71, 85, 105)

    r_agency = p_rep.add_run(f"{agency_name.upper()}\n")
    r_agency.font.name = "Palatino Linotype"
    r_agency.font.size = Pt(14)
    r_agency.font.bold = True
    r_agency.font.color.rgb = RGBColor(15, 23, 42)

    r_loc = p_rep.add_run(f"{clean_str(getattr(narrative, 'agency_address', None), 'Nabua, Camarines Sur')}\n\n")
    r_loc.font.name = "Palatino Linotype"
    r_loc.font.size = Pt(8.5)
    r_loc.font.color.rgb = RGBColor(100, 116, 139)

    r_plan = p_rep.add_run("INFORMATION SYSTEMS STRATEGIC PLAN (ISSP)\n")
    r_plan.font.name = "Palatino Linotype"
    r_plan.font.size = Pt(20)
    r_plan.font.bold = True
    r_plan.font.color.rgb = RGBColor(30, 58, 138)

    is_amend = bool(getattr(narrative, "is_amendment", False))
    amend_num = getattr(narrative, "amendment_number", "1st") or "1st"
    type_str = f"[X] AMENDMENT <{amend_num}>     [ ] REGULAR ISSP" if is_amend else "[X] REGULAR ISSP     [ ] AMENDMENT"

    r_type = p_rep.add_run(f"{type_str}\n")
    r_type.font.name = "Palatino Linotype"
    r_type.font.size = Pt(10)
    r_type.font.bold = True

    r_period = p_rep.add_run(f"For the period {start_year} to {end_year}\n")
    r_period.font.name = "Palatino Linotype"
    r_period.font.size = Pt(11)
    r_period.font.color.rgb = RGBColor(71, 85, 105)

    if narrative.agency_website_url:
        r_url = p_rep.add_run(f"<{narrative.agency_website_url}>\n")
        r_url.font.name = "Palatino Linotype"
        r_url.font.size = Pt(9)
        r_url.font.italic = True
        r_url.font.color.rgb = RGBColor(100, 116, 139)

    doc.add_paragraph()

    # Cover Table: Signatories & Scope (Clean Two-Column Institutional Format)
    cov_table = doc.add_table(rows=1, cols=2)
    cov_table.alignment = WD_TABLE_ALIGNMENT.CENTER
    cov_table.autofit = False
    set_table_borders(cov_table, color="FFFFFF")

    # Left Cell: Formal Signatories (Actual human names centered directly on top of the signature lines)
    c_left = cov_table.rows[0].cells[0]
    c_left.width = Inches(5.0)
    p_sig = c_left.paragraphs[0]

    r_prep = p_sig.add_run("PREPARED BY:\n\n\n")
    r_prep.font.name = "Palatino Linotype"
    r_prep.font.size = Pt(8.5)
    r_prep.font.bold = True
    r_prep.font.color.rgb = RGBColor(30, 58, 138)

    r_cio = p_sig.add_run(f"    {cio_name.upper()}\n")
    r_cio.font.name = "Palatino Linotype"
    r_cio.font.size = Pt(10)
    r_cio.font.bold = True
    r_cio_line = p_sig.add_run("    _________________________________________\n")
    r_cio_line.font.name = "Palatino Linotype"
    r_cio_title = p_sig.add_run("    Name & Signature of Chief Information Officer\n\n\n")
    r_cio_title.font.name = "Palatino Linotype"
    r_cio_title.font.size = Pt(8)
    r_cio_title.font.color.rgb = RGBColor(71, 85, 105)

    r_app = p_sig.add_run("APPROVED BY:\n\n\n")
    r_app.font.name = "Palatino Linotype"
    r_app.font.size = Pt(8.5)
    r_app.font.bold = True
    r_app.font.color.rgb = RGBColor(30, 58, 138)

    r_head = p_sig.add_run(f"    {head_name.upper()}\n")
    r_head.font.name = "Palatino Linotype"
    r_head.font.size = Pt(10)
    r_head.font.bold = True
    r_head_line = p_sig.add_run("    _________________________________________\n")
    r_head_line.font.name = "Palatino Linotype"
    r_head_title = p_sig.add_run(f"    Name & Signature of Agency Head\n    ({head_title})\n")
    r_head_title.font.name = "Palatino Linotype"
    r_head_title.font.size = Pt(8)
    r_head_title.font.color.rgb = RGBColor(71, 85, 105)

    # Right Cell: Scope Checklist Box
    c_right = cov_table.rows[0].cells[1]
    c_right.width = Inches(5.0)
    set_cell_shading(c_right, "F8FAFC")
    set_cell_margins(c_right, 140, 140, 180, 180)

    p_scope = c_right.paragraphs[0]
    r_sc_title = p_scope.add_run("SCOPE OF PLAN:\n")
    r_sc_title.font.name = "Palatino Linotype"
    r_sc_title.font.size = Pt(8.5)
    r_sc_title.font.bold = True
    r_sc_title.font.color.rgb = RGBColor(30, 58, 138)

    scope_choice_clean = clean_str(narrative.scope_choice, "Department-Wide").lower().replace("_", "-")
    scope_json = getattr(narrative, "scope_json", {}) or {}
    has_reg = bool(scope_json.get("with_regional_offices"))
    has_bur = bool(scope_json.get("with_bureaus"))

    is_dept_wide = "department-wide" in scope_choice_clean or not scope_choice_clean
    is_dept_co = "central" in scope_choice_clean and not is_dept_wide
    is_agency_wide = "agency-wide" in scope_choice_clean
    is_other_gov = "other" in scope_choice_clean
    is_lgu = "lgu" in scope_choice_clean

    scope_lines = [
        f"{'[X]' if is_dept_wide else '[ ]'} Department-Wide",
        f"    {'[X]' if is_dept_co else '[ ]'} Department - Central Office / Head Office",
        f"        {'[X]' if (is_dept_co and not has_reg and not has_bur) else '[ ]'} Central Office only",
        f"        {'[X]' if (is_dept_co and has_reg) else '[ ]'} With Regional Offices / Field Offices    {'[X]' if (is_dept_co and has_bur) else '[ ]'} With Bureaus",
        f"{'[X]' if is_agency_wide else '[ ]'} Agency-Wide",
        f"        {'[X]' if (is_agency_wide and not has_reg) else '[ ]'} Central Office only",
        f"        {'[X]' if (is_agency_wide and has_reg) else '[ ]'} With Regional Offices / Field Offices",
        f"{'[X]' if is_other_gov else '[ ]'} Other Government Entity",
        f"{'[X]' if is_lgu else '[ ]'} Local Government Unit (LGU)"
    ]
    for s_line in scope_lines:
        r_sc = p_scope.add_run(f"{s_line}\n")
        r_sc.font.name = "Palatino Linotype"
        r_sc.font.size = Pt(8)

    doc.add_page_break()

    # =========================================================================
    # TABLE OF CONTENTS (2-COLUMN FORMAT: TITLES + DOT LEADERS + ESTIMATED PAGES)
    # =========================================================================
    h_toc = doc.add_heading(level=1)
    r_toc = h_toc.add_run("TABLE OF CONTENTS")
    r_toc.font.name = "Palatino Linotype"
    r_toc.font.size = Pt(13)
    r_toc.font.bold = True
    r_toc.font.color.rgb = RGBColor(30, 58, 138)

    toc_items = [
        ("DEFINITION OF TERMS", 0, True, "3"),
        ("PART I. AGENCY PROFILE & STRATEGIC CONTEXT", 0, True, "1"),
        ("A. Mandate, Vision, Mission, and Organizational Outcome", 1, False, "1"),
        ("A.1. Mandate", 2, False, "1"),
        ("A.2. Vision Statement", 2, False, "1"),
        ("A.3. Mission Statement", 2, False, "1"),
        ("A.4. Organizational Outcomes", 2, False, "1"),
        ("B. Organizational Structure", 1, False, "1"),
        ("B.1. Chief Information Officer (CIO) & ISSP Focal Person", 2, False, "1"),
        ("B.2. Human Capital", 2, False, "2"),
        ("C. Stakeholder Analysis", 1, False, "2"),
        ("PART II. CURRENT ICT ASSESSMENT", 0, True, "3"),
        ("A. Strategic Concerns for ICT Use", 1, False, "3"),
        ("B. Existing Network Infrastructure", 1, False, "4"),
        ("B1. LAN/WAN Set-Up and Connectivity Specifications", 2, False, "4"),
        ("B2. Cybersecurity Control Checklist", 2, False, "5"),
        ("C. Existing / Operational Information Systems (IS) Inventory", 1, False, "6"),
        ("D. E-Government Programs (EGP) Checklist", 1, False, "8"),
        ("PART III. PROPOSED ICT STRATEGY", 0, True, "11"),
        ("A. Proposed Network Infrastructure", 1, False, "11"),
        ("A.1. LAN/WAN Set-Up and Connectivity Specifications", 2, False, "11"),
        ("A.2. Cybersecurity Control Checklist", 2, False, "12"),
        ("B. Enterprise Architecture", 1, False, "13"),
        ("C. Proposed ICT Human Capital", 1, False, "14"),
        ("D. Proposed Information Systems", 1, False, "15"),
        ("E. ICT Projects Portfolio", 1, True, "17"),
        ("E.1. Internal ICT Projects", 2, False, "17"),
        ("E.2. Cross-Agency ICT Projects", 2, False, "19"),
        ("F. Performance Measurement Framework", 1, True, "21"),
        ("F.1. Internal ICT Projects Scorecard", 2, False, "21"),
        ("F.2. Cross-Agency ICT Projects Scorecard", 2, False, "22"),
        ("PART IV. RESOURCE REQUIREMENTS", 0, True, "23"),
        ("A. Detailed Resource Deployment and Cost Breakdown", 1, False, "23"),
    ]

    # Dynamically map annual resource deployment pages
    cur_p = 23
    for y_idx, y_val in enumerate(planning_years):
        toc_items.append((f"A.{y_idx + 1}. Year {y_idx + 1} Resource Deployment (FY {y_val})", 2, False, str(cur_p)))
        cur_p += 4

    b_page = cur_p
    toc_items.extend([
        ("B. Summary of Investments", 1, True, str(b_page)),
        ("B.1. General Summary", 2, False, str(b_page)),
        ("B.2. Fund Source", 2, False, str(b_page)),
        ("B.3. Statement of Expenditure", 2, False, str(b_page)),
        ("B.4. Object of Expenditure", 2, False, str(b_page + 1)),
        ("ANNEX 1: EXISTING INFORMATION & COMMUNICATIONS TECHNOLOGY (ICT) ASSET INVENTORY", 0, True, "Annex 1"),
        ("1. ICT Equipment Inventory", 1, False, "Annex 1"),
        ("2. ICT Software Inventory", 1, False, "Annex 1"),
        ("ANNEX 2: DISASTER RECOVERY & BUSINESS CONTINUITY PLAN (DRBCP) FOR ICT RESOURCES", 0, True, "Annex 2"),
        ("1. Plan Overview & Disaster Recovery Team", 1, False, "Annex 2"),
        ("2. Business Impact Analysis (BIA) Summary", 1, False, "Annex 2"),
        ("3. ICT Component Inventory & Affected Assets", 1, False, "Annex 2"),
        ("4. Technical Recovery Strategy", 1, False, "Annex 2"),
        ("5. Standard Operating Procedures (SOP)", 1, False, "Annex 2"),
        ("6. Compliance, Scalability and Sustainability (MITHI Res. 2025-01)", 1, False, "Annex 2")
    ])

    toc_table = doc.add_table(rows=len(toc_items), cols=2)
    toc_table.style = 'Table Grid'
    set_table_borders(toc_table, color="FFFFFF")

    for idx, (title, indent_level, is_bold, page_num) in enumerate(toc_items):
        row = toc_table.rows[idx]
        prevent_row_split(row)
        c0, c1 = row.cells[0], row.cells[1]
        c0.width = Inches(9.2)
        c1.width = Inches(1.0)

        p0 = c0.paragraphs[0]
        p0.paragraph_format.left_indent = Inches(indent_level * 0.25)
        run0 = p0.add_run(title)
        run0.font.name = "Palatino Linotype"
        run0.font.size = Pt(8.5 if indent_level == 0 else 8.0)
        run0.font.bold = is_bold
        run0.font.color.rgb = RGBColor(30, 58, 138) if is_bold else RGBColor(15, 23, 42)

        p1 = c1.paragraphs[0]
        p1.alignment = WD_ALIGN_PARAGRAPH.RIGHT
        run1 = p1.add_run(page_num)
        run1.font.name = "Courier New" if page_num.isdigit() else "Palatino Linotype"
        run1.font.size = Pt(8.0)
        run1.font.bold = is_bold
        run1.font.color.rgb = RGBColor(30, 58, 138) if is_bold else RGBColor(71, 85, 105)

    doc.add_page_break()

    # =========================================================================
    # PRELIMINARY: DEFINITION OF TERMS (GLOSSARY)
    # =========================================================================
    h_defs = doc.add_heading(level=1)
    r_defs = h_defs.add_run("DEFINITION OF TERMS")
    r_defs.font.name = "Palatino Linotype"
    r_defs.font.size = Pt(13)
    r_defs.font.bold = True
    r_defs.font.color.rgb = RGBColor(30, 58, 138)

    g_table = doc.add_table(rows=1, cols=2)
    g_table.style = 'Table Grid'
    set_table_borders(g_table)
    make_header_row_repeat(g_table.rows[0])
    prevent_row_split(g_table.rows[0])

    c0, c1 = g_table.rows[0].cells[0], g_table.rows[0].cells[1]
    c0.width, c1.width = Inches(3.0), Inches(7.0)
    set_cell_shading(c0, "F1F5F9")
    set_cell_shading(c1, "F1F5F9")
    r0 = c0.paragraphs[0].add_run("ACRONYM / KEYWORD")
    r0.font.bold = True
    r0.font.size = Pt(8.5)
    r1 = c1.paragraphs[0].add_run("STATUTORY / OPERATIONAL DEFINITION")
    r1.font.bold = True
    r1.font.size = Pt(8.5)

    # Normalize glossary items whether objects or tuples
    clean_glossary = []
    for g in glossary_list:
        if isinstance(g, (list, tuple)) and len(g) >= 2:
            clean_glossary.append((str(g[0]).strip(), str(g[1]).strip()))
        else:
            t = clean_str(getattr(g, "term", ""))
            d = clean_str(getattr(g, "definition", ""))
            if t and d:
                clean_glossary.append((t, d))

    for term_title, def_text in sorted(clean_glossary, key=lambda x: x[0].lower()):
        row = g_table.add_row()
        prevent_row_split(row)
        cell0, cell1 = row.cells[0], row.cells[1]
        cell0.width, cell1.width = Inches(3.0), Inches(7.0)
        rg0 = cell0.paragraphs[0].add_run(term_title)
        rg0.font.bold = True
        rg0.font.size = Pt(8)
        rg1 = cell1.paragraphs[0].add_run(def_text)
        rg1.font.size = Pt(8)

    doc.add_page_break()

    # =========================================================================
    # PART I. AGENCY PROFILE & STRATEGIC CONTEXT
    # =========================================================================
    h1 = doc.add_heading(level=1)
    hrun1 = h1.add_run("PART I. AGENCY PROFILE & STRATEGIC CONTEXT")
    hrun1.font.name = "Palatino Linotype"
    hrun1.font.size = Pt(13)
    hrun1.font.bold = True
    hrun1.font.color.rgb = RGBColor(30, 58, 138)

    p = doc.add_paragraph()
    p.add_run("A. Mandate, Vision, Mission, and Organizational Outcome\n").font.bold = True
    p.add_run("A.1. Mandate:\n").font.bold = True
    p.add_run(f"Legal Basis: {strip_html_tags(narrative.mandate_text or narrative.mandate_html) or 'Enabling law / statutory charter establishing institutional mandate.'}\n")
    p.add_run(f"Functions: {strip_html_tags(narrative.functions) or 'Provide higher professional, technical instructions and deliver responsive community research and frontline public services.'}\n\n")

    p.add_run("A.2. Vision Statement:\n").font.bold = True
    p.add_run(f"{strip_html_tags(narrative.vision_text or narrative.vision_html) or 'A premier institution transforming lives and communities through excellence in education, research, and digital innovation.'}\n\n")

    p.add_run("A.3. Mission Statement:\n").font.bold = True
    p.add_run(f"{strip_html_tags(narrative.mission_text or narrative.mission_html) or 'Produce globally competent professionals and generate responsive technologies to foster sustainable development.'}\n\n")

    p.add_run("A.4. Organizational Outcomes:\n").font.bold = True
    if outcomes:
        for oo in outcomes:
            p_oo = doc.add_paragraph(style='List Bullet')
            title_oo = clean_str(oo.outcome_name or oo.program_name, f"Outcome #{oo.id}")
            r_oo = p_oo.add_run(f"[{oo.type_label}] {title_oo}: ")
            r_oo.font.bold = True
            p_oo.add_run(strip_html_tags(oo.description) or "")
    else:
        doc.add_paragraph("No Organizational Outcomes mapped for this cycle.")

    # B. Leadership & Human Capital
    doc.add_paragraph().add_run("\nB. Organizational Structure\n").font.bold = True
    doc.add_paragraph().add_run("B.1. Chief Information Officer (CIO) & ISSP Focal Person\n").font.bold = True

    cio_table = doc.add_table(rows=5, cols=2)
    cio_table.style = 'Table Grid'
    set_table_borders(cio_table)
    cio_rows = [
        ("Chief Information Officer (CIO):", cio_name),
        ("Plantilla Position:", clean_str(narrative.preparer_position or narrative.cio_plantilla_position, "Director, ICT Management Office")),
        ("Organizational Unit:", clean_str(narrative.cio_organizational_unit, "Management Information Systems / ICT Center")),
        ("Email Address:", clean_str(narrative.preparer_email or narrative.cio_email, "cio@agency.gov.ph")),
        ("Contact Telephone:", clean_str(narrative.preparer_tel or narrative.cio_contact_no, "(054) 288-4224"))
    ]
    for idx, (label, val) in enumerate(cio_rows):
        row = cio_table.rows[idx]
        prevent_row_split(row)
        c0, c1 = row.cells[0], row.cells[1]
        c0.width, c1.width = Inches(3.0), Inches(7.0)
        set_cell_shading(c0, "F8FAFC")
        c0.paragraphs[0].add_run(label).font.bold = True
        c1.paragraphs[0].add_run(val)

    # Render Alternate Focal Person Card if available
    focal_name = clean_str(getattr(narrative, 'focal_name', None), "")
    if focal_name:
        doc.add_paragraph().add_run("\nAlternate ISSP Focal Person Profile\n").font.bold = True
        focal_table = doc.add_table(rows=5, cols=2)
        focal_table.style = 'Table Grid'
        set_table_borders(focal_table)
        focal_rows = [
            ("Name of ISSP Focal:", focal_name),
            ("Designated Position:", clean_str(getattr(narrative, 'focal_position', None), "Head, Systems and Infrastructure Administration")),
            ("Organizational Unit:", clean_str(getattr(narrative, 'focal_organizational_unit', None), "ICT Management Service")),
            ("Email Address:", clean_str(getattr(narrative, 'focal_email', None), "focal@agency.gov.ph")),
            ("Contact Number:", clean_str(getattr(narrative, 'focal_contact_no', None), "(054) 288-4224"))
        ]
        for idx, (label, val) in enumerate(focal_rows):
            row = focal_table.rows[idx]
            prevent_row_split(row)
            c0, c1 = row.cells[0], row.cells[1]
            c0.width, c1.width = Inches(3.0), Inches(7.0)
            set_cell_shading(c0, "F8FAFC")
            c0.paragraphs[0].add_run(label).font.bold = True
            c1.paragraphs[0].add_run(val)

    # B.2 Human Capital Staffing Matrix
    doc.add_paragraph().add_run("\nB.2. Human Capital (Current Personnel)\n").font.bold = True
    hc_current = [h for h in hc_list if not getattr(h, "is_proposed", False)]
    if hc_current:
        hc_table = doc.add_table(rows=1, cols=5)
        hc_table.style = 'Table Grid'
        set_table_borders(hc_table)
        make_header_row_repeat(hc_table.rows[0])
        prevent_row_split(hc_table.rows[0])

        headers_hc = ["Employment Status", "IT Positions", "Non-IT Positions", "Male (GAD)", "Female (GAD)"]
        for i, h in enumerate(headers_hc):
            c = hc_table.rows[0].cells[i]
            set_cell_shading(c, "F1F5F9")
            c.paragraphs[0].add_run(h).font.bold = True

        total_it = sum(getattr(h, "it_positions_count", 0) or 0 for h in hc_current)
        total_non_it = sum(getattr(h, "non_it_positions_count", 0) or 0 for h in hc_current)
        total_male = sum(getattr(h, "male_count", 0) or 0 for h in hc_current)
        total_female = sum(getattr(h, "female_count", 0) or 0 for h in hc_current)

        for h in hc_current:
            r = hc_table.add_row()
            prevent_row_split(r)
            r.cells[0].paragraphs[0].add_run(clean_str(h.employment_status)).font.bold = True
            r.cells[1].paragraphs[0].add_run(str(h.it_positions_count or 0))
            r.cells[2].paragraphs[0].add_run(str(h.non_it_positions_count or 0))
            r.cells[3].paragraphs[0].add_run(str(h.male_count or 0))
            r.cells[4].paragraphs[0].add_run(str(h.female_count or 0))

        r_tot = hc_table.add_row()
        prevent_row_split(r_tot)
        set_cell_shading(r_tot.cells[0], "E2E8F0")
        r_tot.cells[0].paragraphs[0].add_run("Grand Total").font.bold = True
        for i, val in enumerate([total_it, total_non_it, total_male, total_female], start=1):
            set_cell_shading(r_tot.cells[i], "E2E8F0")
            r_tot.cells[i].paragraphs[0].add_run(str(val)).font.bold = True
    else:
        doc.add_paragraph("Baseline staffing matrix not recorded.")

    # C. Stakeholder Analysis
    doc.add_paragraph().add_run("\nC. Stakeholder Analysis\n").font.bold = True
    if sh_list:
        sh_table = doc.add_table(rows=1, cols=3)
        sh_table.style = 'Table Grid'
        set_table_borders(sh_table)
        make_header_row_repeat(sh_table.rows[0])
        prevent_row_split(sh_table.rows[0])

        headers_sh = ["Stakeholder Group", "Transaction Processed", "Complexity Level"]
        widths_sh = [Inches(3.0), Inches(5.0), Inches(2.0)]
        for i, h in enumerate(headers_sh):
            c = sh_table.rows[0].cells[i]
            c.width = widths_sh[i]
            set_cell_shading(c, "F1F5F9")
            c.paragraphs[0].add_run(h).font.bold = True

        for s in sh_list:
            r = sh_table.add_row()
            prevent_row_split(r)
            r.cells[0].paragraphs[0].add_run(clean_str(s.stakeholder_group)).font.bold = True

            tx_in = clean_str(s.transaction_processed_incoming, "N/A")
            tx_out = clean_str(s.transaction_processed_outgoing, "N/A")
            r.cells[1].paragraphs[0].add_run(f"Incoming: {tx_in}\nOutgoing: {tx_out}")

            c_in = clean_str(getattr(s, "complexity_incoming", getattr(s, "incoming_complexity", "Simple")))
            c_out = clean_str(getattr(s, "complexity_outgoing", getattr(s, "outgoing_complexity", "Simple")))
            r.cells[2].paragraphs[0].add_run(f"In: {c_in}\nOut: {c_out}")
    else:
        doc.add_paragraph("No stakeholder analysis mapped.")

    doc.add_page_break()

    # =========================================================================
    # PART II. CURRENT ICT ASSESSMENT
    # =========================================================================
    h2 = doc.add_heading(level=1)
    hrun2 = h2.add_run("PART II. CURRENT ICT ASSESSMENT")
    hrun2.font.name = "Palatino Linotype"
    hrun2.font.size = Pt(13)
    hrun2.font.bold = True
    hrun2.font.color.rgb = RGBColor(30, 58, 138)

    # II.A Strategic Concerns
    doc.add_paragraph().add_run("A. Strategic Concerns for ICT Use (Table II.A)\n").font.bold = True
    if concerns:
        c_table = doc.add_table(rows=1, cols=4)
        c_table.style = 'Table Grid'
        set_table_borders(c_table)
        make_header_row_repeat(c_table.rows[0])
        prevent_row_split(c_table.rows[0])

        headers_c = ["Organizational Outcome / MFO", "Critical Business System / Workflow", "Operational Bottleneck / Problem", "Intended Use of ICT Solution"]
        widths_c = [Inches(2.5), Inches(2.5), Inches(2.5), Inches(2.7)]

        for i, h in enumerate(headers_c):
            cell = c_table.rows[0].cells[i]
            cell.width = widths_c[i]
            set_cell_shading(cell, "F1F5F9")
            r = cell.paragraphs[0].add_run(h)
            r.font.bold = True
            r.font.size = Pt(8.5)

        for c in concerns:
            row = c_table.add_row()
            prevent_row_split(row)
            vals = [clean_str(c.mfo), clean_str(c.critical_system), clean_str(c.problems), clean_str(c.intended_use)]
            for i, v in enumerate(vals):
                cell = row.cells[i]
                cell.width = widths_c[i]
                cell.paragraphs[0].add_run(v).font.size = Pt(8)
    else:
        doc.add_paragraph("No Strategic Concerns registered for this cycle.")

    # II.B Existing Network Infrastructure & Cybersecurity (B1 Text -> B1 Diagram -> B2 Controls)
    doc.add_paragraph().add_run("\nB. Existing Network Infrastructure & Cybersecurity Controls\n").font.bold = True
    existing_infra = [n for n in net_list if not getattr(n, "is_proposed", False)]
    if existing_infra:
        p_net = doc.add_paragraph()
        p_net.add_run("B1. LAN/WAN Set-Up and Connectivity Specifications:\n").font.bold = True
        for n in existing_infra:
            p_net.add_run(f"• Location: {clean_str(n.office_location, 'Main Campus')} | Type: {n.connectivity_type} | Bandwidth: {n.bandwidth_mbps} Mbps | IPv6: {'Yes' if n.is_ipv6_ready else 'No'}\n")
            p_net.add_run(f"  Topology: {clean_str(n.topology_description)}\n")
    else:
        doc.add_paragraph("B1. LAN/WAN Set-up: Baseline network connectivity documented in system repository.")

    # Render B1 Schematic Outline Immediately After B1 Text
    render_schematic_box(
        doc,
        title="Existing LAN/WAN Network Infrastructure Topology",
        subtitle="Physical and logical network diagram across central headquarters and academic units.",
        section_label="B1. LAN/WAN SCHEMATIC",
        img_url=getattr(narrative, "network_diagram_url", None)
    )

    # Render B2 Cybersecurity Control Checklist Immediately After B1 Schematic
    doc.add_paragraph().add_run("\nB2. Cybersecurity Control Checklist (Existing Baseline):\n").font.bold = True
    render_cybersecurity_checklist(doc, cyber_list, is_proposed=False)

    # II.C Existing Information Systems
    doc.add_paragraph().add_run("\nC. Existing / Operational Information Systems (Part II.C)\n").font.bold = True
    operational_systems = [s for s in systems if clean_str(getattr(s.status, 'value', s.status)).lower() == "operational"]

    if operational_systems:
        for s in operational_systems:
            render_information_system_card_docx(doc, s, is_proposed=False)
    else:
        doc.add_paragraph("No operational Information Systems cataloged.")

    # II.D E-Government Programs (EGP) Checklist
    doc.add_paragraph().add_run("\nD. E-Government Programs (EGP) Checklist (Part II.D)\n").font.bold = True
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

    egov_table = doc.add_table(rows=1, cols=3)
    egov_table.style = 'Table Grid'
    set_table_borders(egov_table)
    make_header_row_repeat(egov_table.rows[0])
    prevent_row_split(egov_table.rows[0])

    egov_headers = ["PROGRAM / INITIATIVE NAME", "UTILIZATION STATUS", "DETAILS / EQUIVALENT PLATFORM"]
    for idx, eh in enumerate(egov_headers):
        c = egov_table.rows[0].cells[idx]
        set_cell_shading(c, "F1F5F9")
        r = c.paragraphs[0].add_run(eh)
        r.font.bold = True
        r.font.size = Pt(8)

    for key, display_label in CANONICAL_EGOV_SPECS:
        # Robust matcher matching pdf_tasks.py logic
        match = None
        for e in egov_list:
            name_l = clean_str(getattr(e, "program_name", "")).lower()
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
                match = e
                break

        is_used = bool(getattr(match, "is_utilized", False))

        details_list = []
        if match:
            if getattr(match, "equivalent_system_name", None):
                details_list.append(f"Equivalent: {match.equivalent_system_name}")
            elif getattr(match, "equivalent_system_details", None):
                details_list.append(f"Details: {match.equivalent_system_details}")
            if getattr(match, "adoption_ratio", None):
                details_list.append(f"Adoption: {match.adoption_ratio}")
            if getattr(match, "channels_json", None) and isinstance(match.channels_json, list) and match.channels_json:
                details_list.append(f"Channels: {', '.join(match.channels_json)}")

        details_str = " | ".join(details_list) if details_list else "N/A"

        row = egov_table.add_row()
        prevent_row_split(row)
        r0 = row.cells[0].paragraphs[0].add_run(display_label)
        r0.font.bold = True
        r0.font.size = Pt(7.5)

        row.cells[1].paragraphs[0].add_run("[X] Yes" if is_used else "[X] No (Equivalent or Manual)").font.size = Pt(7.5)
        row.cells[2].paragraphs[0].add_run(details_str).font.size = Pt(7.5)

    doc.add_page_break()

    # =========================================================================
    # PART III. PROPOSED ICT STRATEGY
    # =========================================================================
    h3 = doc.add_heading(level=1)
    hrun3 = h3.add_run("PART III. PROPOSED ICT STRATEGY")
    hrun3.font.name = "Palatino Linotype"
    hrun3.font.size = Pt(13)
    hrun3.font.bold = True
    hrun3.font.color.rgb = RGBColor(30, 58, 138)

    # III.A Proposed Network Infrastructure (A.1 Text -> A.1 Diagram -> A.2 Controls)
    doc.add_paragraph().add_run("A. Proposed Network Infrastructure & Cyber Defense\n").font.bold = True
    proposed_infra = [n for n in net_list if getattr(n, "is_proposed", False)]
    if proposed_infra:
        p_pnet = doc.add_paragraph()
        p_pnet.add_run("A.1. Proposed LAN/WAN Backbone Specifications:\n").font.bold = True
        for n in proposed_infra:
            p_pnet.add_run(f"• Location: {clean_str(n.office_location, 'Main Campus')} | Optical Leased Backbone: {n.connectivity_type} | Target Speed: {n.bandwidth_mbps} Mbps | IPv6: {'Yes' if n.is_ipv6_ready else 'No'}\n")
            p_pnet.add_run(f"  Architecture: {clean_str(n.topology_description)}\n")
    else:
        doc.add_paragraph("A.1. Optical fiber backbone and cloud interconnectivity planned across campus nodes.")

    # Render A.1 Schematic Outline Immediately After A.1 Text
    render_schematic_box(
        doc,
        title="Proposed Network Infrastructure & High-Speed Optical Fiber Backbone",
        subtitle="High-speed optical fiber backbone, distribution switches, and campus network connectivity.",
        section_label="A.1. PROPOSED LAN/WAN SCHEMATIC",
        img_url=getattr(narrative, "fiber_backbone_url", None)
    )

    # Render A.2 Cybersecurity Control Checklist Immediately After A.1 Schematic
    doc.add_paragraph().add_run("\nA.2. Cybersecurity Control Checklist (Proposed Expansion):\n").font.bold = True
    render_cybersecurity_checklist(doc, cyber_list, is_proposed=True)

    # III.B Enterprise Architecture Narrative & Schematic Box
    doc.add_paragraph().add_run("\nB. Enterprise Architecture (Target Blueprint)\n").font.bold = True
    ea_text = strip_html_tags(narrative.enterprise_architecture_narrative) or (
        f"The proposed Enterprise Architecture of {agency_name} rationalizes disparate operational workflows into scalable microservices hosted in institutional facilities and cloud environments, utilizing PeGIF-compliant API gateways to establish automated interoperability with national oversight agencies and citizen portals."
    )
    doc.add_paragraph(ea_text)
    render_schematic_box(
        doc,
        title="Enterprise Architecture Framework Blueprint",
        subtitle="Target microservices, PeGIF API gateways, and National Government Data Exchange (NGDX) pipelines.",
        section_label="B. ENTERPRISE ARCHITECTURE SCHEMATIC",
        img_url=getattr(narrative, "system_architecture_url", None)
    )

    # III.C Proposed ICT Human Capital
    doc.add_paragraph().add_run("\nC. Proposed ICT Human Capital (Staffing Registry)\n").font.bold = True
    if staff_list:
        st_table = doc.add_table(rows=1, cols=3)
        st_table.style = 'Table Grid'
        set_table_borders(st_table)
        make_header_row_repeat(st_table.rows[0])
        prevent_row_split(st_table.rows[0])

        st_table.rows[0].cells[0].paragraphs[0].add_run("Proposed Position Title").font.bold = True
        st_table.rows[0].cells[1].paragraphs[0].add_run("Employment Status").font.bold = True
        st_table.rows[0].cells[2].paragraphs[0].add_run("Target Count").font.bold = True

        total_staff_count = sum(getattr(st, "count", 1) or 1 for st in staff_list)

        for st in staff_list:
            r = st_table.add_row()
            prevent_row_split(r)
            r.cells[0].paragraphs[0].add_run(clean_str(st.position_title)).font.bold = True
            r.cells[1].paragraphs[0].add_run(clean_str(st.status))
            r.cells[2].paragraphs[0].add_run(str(st.count or 1))

        r_tot = st_table.add_row()
        prevent_row_split(r_tot)
        set_cell_shading(r_tot.cells[0], "E2E8F0")
        set_cell_shading(r_tot.cells[1], "E2E8F0")
        set_cell_shading(r_tot.cells[2], "E2E8F0")
        r_tot.cells[0].paragraphs[0].add_run("Grand Total").font.bold = True
        r_tot.cells[2].paragraphs[0].add_run(str(total_staff_count)).font.bold = True
    else:
        doc.add_paragraph("Proposed staffing targets documented in administrative HR registry.")

    # III.D Proposed Information Systems
    doc.add_paragraph().add_run("\nD. Proposed Information Systems & Major Enhancements (Table III.D)\n").font.bold = True
    proposed_systems = [s for s in systems if clean_str(getattr(s.status, 'value', s.status)).lower() != "operational"]

    if proposed_systems:
        for s in proposed_systems:
            render_information_system_card_docx(doc, s, is_proposed=True, projects=projects)
    else:
        doc.add_paragraph("No proposed Information Systems logged for this cycle.")

    # III.E Strategic ICT Projects Portfolio (Project Charters + Summary)
    doc.add_paragraph().add_run("\nE. Strategic ICT Projects Portfolio (Table III.E)\n").font.bold = True

    internal_projects = [p for p in projects if "cross" not in clean_str(getattr(p, "project_category", "")).lower()]
    cross_projects = [p for p in projects if "cross" in clean_str(getattr(p, "project_category", "")).lower()]

    # Render E.1 Project Charters
    p_e1 = doc.add_paragraph()
    r_e1 = p_e1.add_run("E.1. Internal ICT Projects Portfolio")
    r_e1.font.bold = True
    r_e1.font.size = Pt(10)
    r_e1.font.color.rgb = RGBColor(30, 58, 138)

    if internal_projects:
        for pr in internal_projects:
            render_project_charter_card(doc, pr, is_cross=False, planning_years=planning_years)
    else:
        doc.add_paragraph("No internal ICT projects registered for this cycle.")

    # Render E.2 Cross-Agency Project Charters
    p_e2 = doc.add_paragraph()
    r_e2 = p_e2.add_run("\nE.2. Cross-Agency ICT Projects Portfolio")
    r_e2.font.bold = True
    r_e2.font.size = Pt(10)
    r_e2.font.color.rgb = RGBColor(30, 58, 138)

    if cross_projects:
        for pr in cross_projects:
            render_project_charter_card(doc, pr, is_cross=True, planning_years=planning_years)
    else:
        doc.add_paragraph("No cross-agency ICT projects registered for this cycle.")

    # III.F Performance Measurement Framework (PMF Scorecard)
    doc.add_paragraph().add_run("\nF. Performance Measurement Framework (PMF Scorecard)\n").font.bold = True
    pmf_metrics = performance_metrics or []

    def render_pmf_subtable(metrics_subset: List[Any], subheader: str):
        p_sub = doc.add_paragraph()
        r_sub = p_sub.add_run(subheader)
        r_sub.font.bold = True
        r_sub.font.size = Pt(9)
        r_sub.font.color.rgb = RGBColor(30, 58, 138)

        if not metrics_subset:
            doc.add_paragraph("No performance metrics registered under this section.")
            return

        pmf_table = doc.add_table(rows=1, cols=6)
        pmf_table.style = 'Table Grid'
        set_table_borders(pmf_table)
        make_header_row_repeat(pmf_table.rows[0])
        prevent_row_split(pmf_table.rows[0])

        headers_pmf = ["Target Initiative / Project", "Result Hierarchy", "Key Performance Indicator (KPI)", "Baseline", "Target Metric", "Responsibility"]
        widths_pmf = [Inches(2.2), Inches(1.5), Inches(2.6), Inches(1.1), Inches(1.2), Inches(1.6)]

        for i, h in enumerate(headers_pmf):
            cell = pmf_table.rows[0].cells[i]
            cell.width = widths_pmf[i]
            set_cell_shading(cell, "F1F5F9")
            r = cell.paragraphs[0].add_run(h)
            r.font.bold = True
            r.font.size = Pt(8)

        for m in metrics_subset:
            row = pmf_table.add_row()
            prevent_row_split(row)
            vals = [
                clean_str(m.project_title),
                clean_str(m.result_hierarchy, "Immediate Outcome"),
                clean_str(m.indicator),
                clean_str(m.baseline),
                clean_str(m.target),
                clean_str(m.responsibility)
            ]
            for i, v in enumerate(vals):
                cell = row.cells[i]
                cell.width = widths_pmf[i]
                r = cell.paragraphs[0].add_run(v)
                r.font.size = Pt(7.5)
                if i in [3, 4]:
                    cell.paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.CENTER

    internal_pids = {str(p.id) for p in internal_projects}
    cross_pids = {str(p.id) for p in cross_projects}

    pmf_f1 = [m for m in pmf_metrics if str(m.project_id) in internal_pids]
    pmf_f2 = [m for m in pmf_metrics if str(m.project_id) in cross_pids]
    pmf_f3 = [m for m in pmf_metrics if str(m.project_id) not in internal_pids and str(m.project_id) not in cross_pids]

    render_pmf_subtable(pmf_f1, "F.1. Internal ICT Projects Scorecard")
    render_pmf_subtable(pmf_f2, "F.2. Cross-Agency ICT Projects Scorecard")
    if pmf_f3:
        render_pmf_subtable(pmf_f3, "F.3. Institutional ICT Governance KPIs")

    doc.add_page_break()

    # =========================================================================
    # PART IV. RESOURCE REQUIREMENTS & FOUR-WAY PARITY
    # =========================================================================
    h4 = doc.add_heading(level=1)
    hrun4 = h4.add_run("PART IV. RESOURCE REQUIREMENTS & SUMMARY OF INVESTMENTS")
    hrun4.font.name = "Palatino Linotype"
    hrun4.font.size = Pt(13)
    hrun4.font.bold = True
    hrun4.font.color.rgb = RGBColor(30, 58, 138)

    # IV.A Resource Deployments (Categorized Deployment Tables with Shaded Bands)
    doc.add_paragraph().add_run("A. Detailed Resource Deployment and Cost Breakdown (Part IV.A)\n").font.bold = True

    # Filter items: only approved items that belong to the compiled plan
    raw_items = items or []
    cap_threshold = Decimal("50000.00")

    prop_items = []
    for itm in raw_items:
        if getattr(itm, "is_archived", False):
            continue
        if clean_str(getattr(itm, "status", "")).lower() != "approved":
            continue

        strat_cat = clean_str(getattr(itm, "strategic_category", "")).lower()
        cost_val = Decimal(str(getattr(itm, "total_cost", 0) or 0))
        uacs_code = clean_str(getattr(itm, "uacs_object_code", "")).lower()
        exp_class = clean_str(getattr(itm, "expenditure_class", "")).lower()
        is_co = cost_val >= cap_threshold or "(co)" in uacs_code or "capital" in exp_class
        is_project_cat = "project" in strat_cat or strat_cat in ["internal ict projects", "cross-agency ict projects"]

        if is_project_cat:
            if itm.project_id is not None:
                prop_items.append(itm)
        else:
            if is_co and itm.project_id is None:
                continue
            prop_items.append(itm)

    canonical_categories = [
        ("Office Productivity", False),
        ("Internal ICT Projects", True),
        ("Cross-Agency ICT Projects", True),
        ("Continuing Costs/Expenses", False)
    ]

    for yr_idx, yr in enumerate(planning_years):
        p_yr = doc.add_paragraph()
        p_yr.add_run(f"\nA.{yr_idx + 1}. [YEAR #{yr_idx + 1}] (FY {yr})\n").font.bold = True

        iv_a_table = doc.add_table(rows=1, cols=6)
        iv_a_table.style = 'Table Grid'
        set_table_borders(iv_a_table)
        make_header_row_repeat(iv_a_table.rows[0])
        prevent_row_split(iv_a_table.rows[0])

        headers_iva = ["Item Description", "Office Location", "Fund Source", "Unit Cost (PHP)", "Physical Target", "Total Cost (PHP)"]
        widths_iva = [Inches(3.2), Inches(1.8), Inches(1.8), Inches(1.2), Inches(0.9), Inches(1.3)]

        for i, h in enumerate(headers_iva):
            cell = iv_a_table.rows[0].cells[i]
            cell.width = widths_iva[i]
            set_cell_shading(cell, "F1F5F9")
            r = cell.paragraphs[0].add_run(h)
            r.font.bold = True
            r.font.size = Pt(8)

        total_yr_cost = Decimal("0.00")

        # Compute items with non-zero quantity for this year
        year_cat_items = {}
        for cat_name, is_proj_linked in canonical_categories:
            matched_items = []
            for itm in prop_items:
                strat_name = clean_str(getattr(itm, "strategic_category", "")).lower()
                is_match = False
                if is_proj_linked:
                    is_match = cat_name.lower() in strat_name
                else:
                    if "office" in cat_name.lower():
                        is_match = "office" in strat_name or not any(k in strat_name for k in ["project", "continuing"])
                    else:
                        is_match = "continuing" in strat_name

                if is_match:
                    q_map = itm.yearly_quantities or {}
                    if isinstance(q_map, str):
                        try: q_map = json.loads(q_map)
                        except Exception: q_map = {}

                    qty = q_map.get(str(yr)) or q_map.get(yr) or q_map.get(f"Year {yr_idx + 1}")
                    if qty is None or qty == 0:
                        if yr_idx == 0: qty = getattr(itm, "year_1_qty", 0) or 0
                        elif yr_idx == 1: qty = getattr(itm, "year_2_qty", 0) or 0
                        elif yr_idx == 2: qty = getattr(itm, "year_3_qty", 0) or 0

                    try: qty_int = int(qty)
                    except Exception: qty_int = 0

                    if qty_int > 0:
                        matched_items.append((itm, qty_int))

            if matched_items:
                year_cat_items[cat_name] = (is_proj_linked, matched_items)

        # Output categorized sections
        for cat_name, (is_proj_linked, cat_items) in year_cat_items.items():
            cat_subtotal = Decimal("0.00")
            for itm, q in cat_items:
                u_cost = Decimal(str(itm.unit_cost or 0))
                rate = Decimal("0.00")
                if yr_idx == 1: rate = Decimal("0.03")
                elif yr_idx >= 2: rate = Decimal("0.05") + Decimal(str((yr_idx - 2) * 0.02))
                adj_unit = (u_cost * (Decimal("1.00") + rate)).quantize(Decimal("0.01"))
                cat_subtotal += Decimal(q) * adj_unit

            # Category Header Band Row
            r_cat = iv_a_table.add_row()
            prevent_row_split(r_cat)
            for c_i in range(5):
                set_cell_shading(r_cat.cells[c_i], "E2E8F0")
            set_cell_shading(r_cat.cells[5], "E2E8F0")
            r_cat.cells[0].paragraphs[0].add_run(cat_name.upper()).font.bold = True
            r_cat.cells[5].paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.RIGHT
            r_cat.cells[5].paragraphs[0].add_run(fmt_currency(cat_subtotal)).font.bold = True

            for exp_class_name in ["Capital Outlay", "Maintenance and Other Operating Expenses"]:
                is_co_target = "capital" in exp_class_name.lower()
                exp_items = [
                    (itm, q) for itm, q in cat_items
                    if ("capital" in clean_str(getattr(itm, "expenditure_class", "")).lower()) == is_co_target
                ]
                if not exp_items:
                    continue

                exp_subtotal = sum(
                    Decimal(q) * (Decimal(str(itm.unit_cost or 0)) * (Decimal("1.00") + (Decimal("0.03") if yr_idx == 1 else (Decimal("0.05") + Decimal(str((yr_idx - 2) * 0.02)) if yr_idx >= 2 else Decimal("0.00"))))).quantize(Decimal("0.01"))
                    for itm, q in exp_items
                )

                # Expenditure Class Band Row
                r_exp = iv_a_table.add_row()
                prevent_row_split(r_exp)
                for c_i in range(6):
                    set_cell_shading(r_exp.cells[c_i], "F8FAFC")
                r_exp.cells[0].paragraphs[0].paragraph_format.left_indent = Inches(0.15)
                run_exp = r_exp.cells[0].paragraphs[0].add_run(exp_class_name.upper())
                run_exp.font.bold = True
                run_exp.font.size = Pt(7.5)
                r_exp.cells[5].paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.RIGHT
                run_exp_tot = r_exp.cells[5].paragraphs[0].add_run(fmt_currency(exp_subtotal))
                run_exp_tot.font.bold = True
                run_exp_tot.font.size = Pt(7.5)

                for itm, qty_int in exp_items:
                    u_cost = Decimal(str(itm.unit_cost or 0))
                    rate = Decimal("0.00")
                    if yr_idx == 1: rate = Decimal("0.03")
                    elif yr_idx >= 2: rate = Decimal("0.05") + Decimal(str((yr_idx - 2) * 0.02))
                    adj_unit = (u_cost * (Decimal("1.00") + rate)).quantize(Decimal("0.01"))
                    line_cost = Decimal(qty_int) * adj_unit
                    total_yr_cost += line_cost

                    proj = getattr(itm, "project_rel", None)
                    resolved_fund = getattr(proj, "funding_source", None) or itm.fund_source
                    deploy_loc = itm.target_office_automated or getattr(itm.department, 'name', '') or itm.office_location

                    row = iv_a_table.add_row()
                    prevent_row_split(row)
                    vals = [
                        clean_str(itm.item_name),
                        clean_str(deploy_loc, "Central Office"),
                        clean_str(getattr(resolved_fund, 'value', resolved_fund), "GAA"),
                        fmt_currency(adj_unit),
                        str(qty_int),
                        fmt_currency(line_cost)
                    ]
                    for i, v in enumerate(vals):
                        cell = row.cells[i]
                        cell.width = widths_iva[i]
                        p_cell = cell.paragraphs[0]
                        if i == 0:
                            p_cell.paragraph_format.left_indent = Inches(0.3)
                        r = p_cell.add_run(v)
                        r.font.size = Pt(7.5)
                        if i in [3, 5]:
                            p_cell.alignment = WD_ALIGN_PARAGRAPH.RIGHT
                        elif i == 4:
                            p_cell.alignment = WD_ALIGN_PARAGRAPH.CENTER

        # Grand Total Row for that year
        gr_row = iv_a_table.add_row()
        prevent_row_split(gr_row)
        for i in range(5):
            set_cell_shading(gr_row.cells[i], "E2E8F0")
        gr_row.cells[0].paragraphs[0].add_run(f"GRAND TOTAL (FY {yr})").font.bold = True

        last_cell = gr_row.cells[5]
        set_cell_shading(last_cell, "E2E8F0")
        last_cell.paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.RIGHT
        r_tot = last_cell.paragraphs[0].add_run(fmt_currency(total_yr_cost))
        r_tot.font.bold = True

        # Statutory footnote
        p_note = doc.add_paragraph()
        p_note.paragraph_format.space_before = Pt(3)
        r_fn = p_note.add_run(f"*All costs indicated in this section are based on market research conducted by {agency_name} (inclusive of administrative inflation buffer adjustments).")
        r_fn.font.size = Pt(7)
        r_fn.font.italic = True
        r_fn.font.color.rgb = RGBColor(100, 116, 139)

    doc.add_page_break()

    # IV.B Four-Way Parity Tables B.1 to B.4
    doc.add_paragraph().add_run("B. Summary of Investments (Four-Way Parity Matrices)\n").font.bold = True

    p_data = parity_data or {}
    year_cols = p_data.get("year_columns", [f"FY {y}" for y in planning_years])

    tables_to_render = [
        ("B.1. GENERAL SUMMARY (BY STRATEGIC PROCUREMENT CATEGORY)", p_data.get("b1_general_summary", {}), "Category / Spending Bucket"),
        ("B.2. FINANCING SOURCE SUMMARY", p_data.get("b2_fund_source", {}), "Funding Source"),
        ("B.3. STATEMENT OF EXPENDITURE (CAPEX VS. MOOE)", p_data.get("b3_statement_of_expenditure", {}), "Expenditure Class"),
        ("B.4. OBJECT OF EXPENDITURE (UACS ACCOUNT LEDGER)", p_data.get("b4_object_of_expenditure", {}), "UACS Account Title")
    ]

    for title_mat, matrix_dict, col_label in tables_to_render:
        p_t = doc.add_paragraph()
        r_t = p_t.add_run(f"\n{title_mat}\n")
        r_t.font.bold = True
        r_t.font.size = Pt(9.5)
        r_t.font.color.rgb = RGBColor(30, 58, 138)

        if matrix_dict:
            cols_count = len(year_cols) + 2
            m_table = doc.add_table(rows=1, cols=cols_count)
            m_table.style = 'Table Grid'
            set_table_borders(m_table)
            make_header_row_repeat(m_table.rows[0])
            prevent_row_split(m_table.rows[0])

            # Header Row
            hdr_cells = m_table.rows[0].cells
            hdr_cells[0].text = col_label
            set_cell_shading(hdr_cells[0], "F1F5F9")
            hdr_cells[0].paragraphs[0].runs[0].font.bold = True
            hdr_cells[0].paragraphs[0].runs[0].font.size = Pt(8)

            for i, y_col in enumerate(year_cols):
                hdr_cells[i + 1].text = y_col
                set_cell_shading(hdr_cells[i + 1], "F1F5F9")
                hdr_cells[i + 1].paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.RIGHT
                hdr_cells[i + 1].paragraphs[0].runs[0].font.bold = True
                hdr_cells[i + 1].paragraphs[0].runs[0].font.size = Pt(8)

            hdr_cells[-1].text = "Total Outlay"
            set_cell_shading(hdr_cells[-1], "F1F5F9")
            hdr_cells[-1].paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.RIGHT
            hdr_cells[-1].paragraphs[0].runs[0].font.bold = True
            hdr_cells[-1].paragraphs[0].runs[0].font.size = Pt(8)

            for cat_name, row_vals in matrix_dict.items():
                is_grand = (cat_name.upper() == "GRAND TOTAL")
                row_cells = m_table.add_row().cells
                prevent_row_split(m_table.rows[-1])

                display_title = clean_uacs_title(cat_name) if "B.4" in title_mat else cat_name
                row_cells[0].text = display_title
                if is_grand:
                    set_cell_shading(row_cells[0], "E2E8F0")
                    row_cells[0].paragraphs[0].runs[0].font.bold = True

                for idx, y_col in enumerate(year_cols):
                    amount = Decimal(str(row_vals.get(y_col, row_vals.get(y_col.replace("FY ", ""), 0.0))))
                    row_cells[idx + 1].text = fmt_currency(amount)
                    row_cells[idx + 1].paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.RIGHT
                    row_cells[idx + 1].paragraphs[0].runs[0].font.size = Pt(8)
                    if is_grand:
                        set_cell_shading(row_cells[idx + 1], "E2E8F0")
                        row_cells[idx + 1].paragraphs[0].runs[0].font.bold = True

                tot = Decimal(str(row_vals.get("Total", row_vals.get("total", 0.0))))
                row_cells[-1].text = fmt_currency(tot)
                row_cells[-1].paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.RIGHT
                row_cells[-1].paragraphs[0].runs[0].font.size = Pt(8)
                if is_grand:
                    set_cell_shading(row_cells[-1], "E2E8F0")
                    row_cells[-1].paragraphs[0].runs[0].font.bold = True
        else:
            doc.add_paragraph("Table matrix not generated.")

    # Parity Certification Statement
    p_cert = doc.add_paragraph()
    r_cert = p_cert.add_run(f"\n★ FOUR-WAY PARITY CERTIFIED: Certified Grand Total = {fmt_currency(p_data.get('certified_grand_total', 0))} ★\n")
    r_cert.font.bold = True
    r_cert.font.size = Pt(9)
    r_cert.font.color.rgb = RGBColor(5, 150, 105)

    doc.add_page_break()

    # =========================================================================
    # ANNEX 1: MASTER ASSET INVENTORY (EQUIPMENT & SOFTWARE - REAL AGGREGATIONS)
    # =========================================================================
    h5 = doc.add_heading(level=1)
    hrun5 = h5.add_run("ANNEX 1: EXISTING INFORMATION & COMMUNICATIONS TECHNOLOGY (ICT) ASSET INVENTORY")
    hrun5.font.name = "Palatino Linotype"
    hrun5.font.size = Pt(13)
    hrun5.font.bold = True
    hrun5.font.color.rgb = RGBColor(30, 58, 138)

    inv_items = inventory or []

    # Category matching helpers
    def is_inv_item_functional(status_val):
        s = clean_str(status_val).lower()
        return s in ["functional", "operational"]

    def is_inv_item_condemned(status_val, is_eol):
        s = clean_str(status_val).lower()
        return is_eol or s in ["condemned", "unserviceable", "end of life", "eol"]

    def match_inv_eq(item, target_cat):
        if getattr(item, "is_software", False): return False
        cat_val = clean_str(getattr(item, "dict_category", None))
        is_others = target_cat.strip().lower().startswith("others")
        if cat_val:
            if is_others: return cat_val.lower().startswith("others")
            return cat_val.lower() == target_cat.strip().lower()
        name = clean_str(getattr(item, "item_name", "")).lower()
        if is_others:
            std_keys = ["server", "desktop", "laptop", "mobile", "tablet", "printer", "switch"]
            return not any(k in name for k in std_keys)
        return target_cat.strip().lower().split()[0] in name

    def match_inv_sw(item, target_cat):
        if not getattr(item, "is_software", False): return False
        cat_val = clean_str(getattr(item, "dict_category", None))
        is_others = target_cat.strip().lower().startswith("others")
        if cat_val:
            if is_others: return cat_val.lower().startswith("others")
            return cat_val.lower() == target_cat.strip().lower()
        name = clean_str(getattr(item, "item_name", "")).lower()
        if is_others:
            std_keys = ["office", "grammar", "graphics", "antivirus", "help desk", "photo", "waf"]
            return not any(k in name for k in std_keys)
        return target_cat.strip().lower().split()[0] in name

    # Table 1: Equipment Inventory
    doc.add_paragraph().add_run("1. ICT Equipment Inventory (Central vs. Field Offices)\n").font.bold = True
    eq_table = doc.add_table(rows=1, cols=5)
    eq_table.style = 'Table Grid'
    set_table_borders(eq_table)
    make_header_row_repeat(eq_table.rows[0])
    prevent_row_split(eq_table.rows[0])

    headers_eq = ["ICT Resources", "Office Location", "Operational", "End of Life", "Backup"]
    widths_eq = [Inches(3.2), Inches(2.2), Inches(1.6), Inches(1.6), Inches(1.6)]
    for i, h in enumerate(headers_eq):
        c = eq_table.rows[0].cells[i]
        c.width = widths_eq[i]
        set_cell_shading(c, "F1F5F9")
        c.paragraphs[0].add_run(h).font.bold = True

    eq_categories = ["Servers", "Desktop", "Laptop", "Mobile Phone", "Tablet", "Printer", "Network Switch", "Others, please specify"]
    tot_c_ops = tot_c_eol = tot_c_bak = 0
    tot_f_ops = tot_f_eol = tot_f_bak = 0

    for cat in eq_categories:
        c_items = [i for i in inv_items if match_inv_eq(i, cat)]

        cOps = sum(getattr(i, 'quantity', 1) or 1 for i in c_items if (bool(getattr(i, 'is_central_office', False)) or clean_str(getattr(i, 'office_location', '')).lower() == "central office") and not getattr(i, 'is_end_of_life', False) and is_inv_item_functional(getattr(i, 'status', '')))
        cEol = sum(getattr(i, 'quantity', 1) or 1 for i in c_items if (bool(getattr(i, 'is_central_office', False)) or clean_str(getattr(i, 'office_location', '')).lower() == "central office") and is_inv_item_condemned(getattr(i, 'status', ''), bool(getattr(i, 'is_end_of_life', False))))
        cBak = sum(getattr(i, 'quantity', 1) or 1 for i in c_items if (bool(getattr(i, 'is_central_office', False)) or clean_str(getattr(i, 'office_location', '')).lower() == "central office") and bool(getattr(i, 'is_backup', False)))

        fOps = sum(getattr(i, 'quantity', 1) or 1 for i in c_items if not (bool(getattr(i, 'is_central_office', False)) or clean_str(getattr(i, 'office_location', '')).lower() == "central office") and not getattr(i, 'is_end_of_life', False) and is_inv_item_functional(getattr(i, 'status', '')))
        fEol = sum(getattr(i, 'quantity', 1) or 1 for i in c_items if not (bool(getattr(i, 'is_central_office', False)) or clean_str(getattr(i, 'office_location', '')).lower() == "central office") and is_inv_item_condemned(getattr(i, 'status', ''), bool(getattr(i, 'is_end_of_life', False))))
        fBak = sum(getattr(i, 'quantity', 1) or 1 for i in c_items if not (bool(getattr(i, 'is_central_office', False)) or clean_str(getattr(i, 'office_location', '')).lower() == "central office") and bool(getattr(i, 'is_backup', False)))

        tot_c_ops += cOps
        tot_c_eol += cEol
        tot_c_bak += cBak
        tot_f_ops += fOps
        tot_f_eol += fEol
        tot_f_bak += fBak

        # Central Office row
        r_c = eq_table.add_row()
        prevent_row_split(r_c)
        r_c.cells[0].paragraphs[0].add_run(cat).font.bold = True
        r_c.cells[1].paragraphs[0].add_run("Central Office")
        r_c.cells[2].paragraphs[0].add_run(str(cOps))
        r_c.cells[3].paragraphs[0].add_run(str(cEol))
        r_c.cells[4].paragraphs[0].add_run(str(cBak))

        # Field Office row
        r_f = eq_table.add_row()
        prevent_row_split(r_f)
        r_f.cells[1].paragraphs[0].add_run("Field/Regional Office")
        r_f.cells[2].paragraphs[0].add_run(str(fOps))
        r_f.cells[3].paragraphs[0].add_run(str(fEol))
        r_f.cells[4].paragraphs[0].add_run(str(fBak))

        # Category Subtotal row
        r_sub = eq_table.add_row()
        prevent_row_split(r_sub)
        set_cell_shading(r_sub.cells[1], "F8FAFC")
        set_cell_shading(r_sub.cells[2], "F8FAFC")
        set_cell_shading(r_sub.cells[3], "F8FAFC")
        set_cell_shading(r_sub.cells[4], "F8FAFC")
        r_sub.cells[1].paragraphs[0].add_run("Subtotal").font.bold = True
        r_sub.cells[2].paragraphs[0].add_run(str(cOps + fOps)).font.bold = True
        r_sub.cells[3].paragraphs[0].add_run(str(cEol + fEol)).font.bold = True
        r_sub.cells[4].paragraphs[0].add_run(str(cBak + fBak)).font.bold = True

    # Equipment Grand Total Row
    r_eq_tot = eq_table.add_row()
    prevent_row_split(r_eq_tot)
    for c_i in range(5):
        set_cell_shading(r_eq_tot.cells[c_i], "E2E8F0")
    r_eq_tot.cells[0].paragraphs[0].add_run("GRAND TOTAL (EQUIPMENT)").font.bold = True
    r_eq_tot.cells[1].paragraphs[0].add_run("All Locations").font.bold = True
    r_eq_tot.cells[2].paragraphs[0].add_run(str(tot_c_ops + tot_f_ops)).font.bold = True
    r_eq_tot.cells[3].paragraphs[0].add_run(str(tot_c_eol + tot_f_eol)).font.bold = True
    r_eq_tot.cells[4].paragraphs[0].add_run(str(tot_c_bak + tot_f_bak)).font.bold = True

    # Table 2: Software Inventory
    doc.add_paragraph().add_run("\n2. ICT Software Inventory (Perpetual vs. Subscription)\n").font.bold = True
    sw_table = doc.add_table(rows=1, cols=4)
    sw_table.style = 'Table Grid'
    set_table_borders(sw_table)
    make_header_row_repeat(sw_table.rows[0])
    prevent_row_split(sw_table.rows[0])

    headers_sw = ["ICT Resources", "Office Location", "Perpetual Licenses", "Cloud Subscriptions"]
    widths_sw = [Inches(4.2), Inches(2.5), Inches(1.8), Inches(1.8)]
    for i, h in enumerate(headers_sw):
        c = sw_table.rows[0].cells[i]
        c.width = widths_sw[i]
        set_cell_shading(c, "F1F5F9")
        c.paragraphs[0].add_run(h).font.bold = True

    sw_categories = ["Office Productivity Tool", "Grammar checker", "Graphics and Simulation Software", "Antivirus", "IT Help Desk Tool", "Others, please specify"]
    tot_c_perp = tot_c_sub = 0
    tot_f_perp = tot_f_sub = 0

    for scat in sw_categories:
        s_items = [i for i in inv_items if match_inv_sw(i, scat)]

        cPerp = sum(getattr(i, 'quantity', 1) or 1 for i in s_items if (bool(getattr(i, 'is_central_office', False)) or clean_str(getattr(i, 'office_location', '')).lower() == "central office") and bool(getattr(i, 'is_perpetual', True)))
        cSub = sum(getattr(i, 'quantity', 1) or 1 for i in s_items if (bool(getattr(i, 'is_central_office', False)) or clean_str(getattr(i, 'office_location', '')).lower() == "central office") and not bool(getattr(i, 'is_perpetual', True)))

        fPerp = sum(getattr(i, 'quantity', 1) or 1 for i in s_items if not (bool(getattr(i, 'is_central_office', False)) or clean_str(getattr(i, 'office_location', '')).lower() == "central office") and bool(getattr(i, 'is_perpetual', True)))
        fSub = sum(getattr(i, 'quantity', 1) or 1 for i in s_items if not (bool(getattr(i, 'is_central_office', False)) or clean_str(getattr(i, 'office_location', '')).lower() == "central office") and not bool(getattr(i, 'is_perpetual', True)))

        tot_c_perp += cPerp
        tot_c_sub += cSub
        tot_f_perp += fPerp
        tot_f_sub += fSub

        # Central row
        r_sc = sw_table.add_row()
        prevent_row_split(r_sc)
        r_sc.cells[0].paragraphs[0].add_run(scat).font.bold = True
        r_sc.cells[1].paragraphs[0].add_run("Central Office")
        r_sc.cells[2].paragraphs[0].add_run(str(cPerp))
        r_sc.cells[3].paragraphs[0].add_run(str(cSub))

        # Field row
        r_sf = sw_table.add_row()
        prevent_row_split(r_sf)
        r_sf.cells[1].paragraphs[0].add_run("Field/Regional Office")
        r_sf.cells[2].paragraphs[0].add_run(str(fPerp))
        r_sf.cells[3].paragraphs[0].add_run(str(fSub))

        # Subtotal row
        r_ssub = sw_table.add_row()
        prevent_row_split(r_ssub)
        set_cell_shading(r_ssub.cells[1], "F8FAFC")
        set_cell_shading(r_ssub.cells[2], "F8FAFC")
        set_cell_shading(r_ssub.cells[3], "F8FAFC")
        r_ssub.cells[1].paragraphs[0].add_run("Subtotal").font.bold = True
        r_ssub.cells[2].paragraphs[0].add_run(str(cPerp + fPerp)).font.bold = True
        r_ssub.cells[3].paragraphs[0].add_run(str(cSub + fSub)).font.bold = True

    # Software Grand Total Row
    r_sw_tot = sw_table.add_row()
    prevent_row_split(r_sw_tot)
    for c_i in range(4):
        set_cell_shading(r_sw_tot.cells[c_i], "E2E8F0")
    r_sw_tot.cells[0].paragraphs[0].add_run("GRAND TOTAL (SOFTWARE)").font.bold = True
    r_sw_tot.cells[1].paragraphs[0].add_run("All Locations").font.bold = True
    r_sw_tot.cells[2].paragraphs[0].add_run(str(tot_c_perp + tot_f_perp)).font.bold = True
    r_sw_tot.cells[3].paragraphs[0].add_run(str(tot_c_sub + tot_f_sub)).font.bold = True

    doc.add_page_break()

    # =========================================================================
    # ANNEX 2: DISASTER RECOVERY & BUSINESS CONTINUITY PLAN (DRBCP)
    # =========================================================================
    h6 = doc.add_heading(level=1)
    hrun6 = h6.add_run("ANNEX 2: DISASTER RECOVERY & BUSINESS CONTINUITY PLAN (DRBCP) FOR ICT RESOURCES")
    hrun6.font.name = "Palatino Linotype"
    hrun6.font.size = Pt(13)
    hrun6.font.bold = True
    hrun6.font.color.rgb = RGBColor(30, 58, 138)

    # 1. Plan Overview & Governance
    doc.add_paragraph().add_run("1. Plan Overview & Disaster Recovery Team (DRT)\n").font.bold = True
    app_date = clean_str(getattr(narrative, "drbcp_approval_date", None), f"January 15, {start_year}")
    doc.add_paragraph(f"Agency: {agency_name} | Version: {issp_period}.1 | Official Approval Date: {app_date}")

    if drt_list:
        drt_table = doc.add_table(rows=1, cols=3)
        drt_table.style = 'Table Grid'
        set_table_borders(drt_table)
        make_header_row_repeat(drt_table.rows[0])
        prevent_row_split(drt_table.rows[0])

        drt_table.rows[0].cells[0].paragraphs[0].add_run("Role").font.bold = True
        drt_table.rows[0].cells[1].paragraphs[0].add_run("Responsibility").font.bold = True
        drt_table.rows[0].cells[2].paragraphs[0].add_run("Designated Contact").font.bold = True

        for dt in drt_list:
            r = drt_table.add_row()
            prevent_row_split(r)
            r.cells[0].paragraphs[0].add_run(clean_str(dt.role)).font.bold = True
            r.cells[1].paragraphs[0].add_run(clean_str(dt.responsibility))
            r.cells[2].paragraphs[0].add_run(f"{clean_str(dt.contact_person)} ({clean_str(dt.contact_details)})")
    else:
        doc.add_paragraph("DRT roster defined under administrative continuity protocol.")

    # 2. BIA Summary
    doc.add_paragraph().add_run("\n2. Business Impact Analysis (BIA) Summary\n").font.bold = True
    real_bias = [b for b in bia_list if b.system_name and not clean_str(b.system_name).lower().startswith("testtt")]
    if real_bias:
        bia_table = doc.add_table(rows=1, cols=5)
        bia_table.style = 'Table Grid'
        set_table_borders(bia_table)
        make_header_row_repeat(bia_table.rows[0])
        prevent_row_split(bia_table.rows[0])

        headers_bia = ["System Name", "Classification", "MTPD", "RTO", "RPO"]
        for i, h in enumerate(headers_bia):
            c = bia_table.rows[0].cells[i]
            set_cell_shading(c, "F1F5F9")
            c.paragraphs[0].add_run(h).font.bold = True

        for b in real_bias:
            r = bia_table.add_row()
            prevent_row_split(r)
            r.cells[0].paragraphs[0].add_run(clean_str(b.system_name)).font.bold = True
            r.cells[1].paragraphs[0].add_run(clean_str(b.classification))
            r.cells[2].paragraphs[0].add_run(f"{getattr(b, 'mtpd_hours', 24)}h")
            r.cells[3].paragraphs[0].add_run(f"{b.rto_hours}h")
            r.cells[4].paragraphs[0].add_run(f"{b.rpo_hours}h")
    else:
        doc.add_paragraph("Mission-critical systems evaluated for business continuity.")

    # 3. Affected Assets
    doc.add_paragraph().add_run("\n3. ICT Component Inventory & Affected Assets\n").font.bold = True
    raw_assets = getattr(narrative, "drbcp_affected_assets_json", None) or []
    if isinstance(raw_assets, str):
        try: raw_assets = json.loads(raw_assets)
        except Exception: raw_assets = []

    if raw_assets:
        for a in raw_assets:
            if isinstance(a, dict):
                p_a = doc.add_paragraph(style='List Bullet')
                p_a.add_run(f"{a.get('asset_group', 'Asset Group')}: ").font.bold = True
                p_a.add_run(clean_str(a.get("details", "")))
    else:
        doc.add_paragraph("Primary Data Center: Physical Enterprise Servers, Core Network Switches, Dedicated Campus Backbone.")

    # 4 & 5. Strategy & SOP
    doc.add_paragraph().add_run("\n4. Technical Recovery Strategy\n").font.bold = True
    strat_text = strip_html_tags(getattr(narrative, "drbcp_recovery_strategy_text", None) or getattr(narrative, "drbcp_recovery_strategy_html", None)) or (
        "Daily database snapshots transferred to an off-site secondary facility (>30km). Real-time operational failover configured for frontline student and financial services."
    )
    doc.add_paragraph(strat_text)

    doc.add_paragraph().add_run("\n5. Standard Operating Procedures (SOP Operational Phases)\n").font.bold = True
    sop_text = strip_html_tags(getattr(narrative, "drbcp_sop_phases_text", None) or getattr(narrative, "drbcp_sop_phases_html", None)) or (
        "Phase I (Detection & Declaration): Monitoring alerts evaluated; Incident Commander activates DRBCP within 1 hour.\nPhase II (Activation): Operations shifted to secondary standby instances.\nPhase III (Failback): Primary infrastructure restored and delta synchronized."
    )
    doc.add_paragraph(sop_text)

    # 6. Compliance, Scalability & Sustainability (MITHI Resolution 2025-01) + DRBCP KPIs
    doc.add_paragraph().add_run("\n6. Compliance, Scalability & Sustainability (MITHI Resolution 2025-01)\n").font.bold = True
    comp_text = strip_html_tags(getattr(narrative, "drbcp_compliance_narrative_text", None) or getattr(narrative, "drbcp_compliance_narrative_html", None)) or (
        "Cybersecurity controls isolate compromised nodes prior to snapshot mounting. Full simulation drill conducted annually. Continuing infrastructure costs budgeted under Part IV."
    )
    doc.add_paragraph(comp_text)

    # Render DRBCP KPIs Table if available
    if drm_list:
        doc.add_paragraph().add_run("\nKey Performance Indicators for DRBCP\n").font.bold = True
        drm_table = doc.add_table(rows=1, cols=2)
        drm_table.style = 'Table Grid'
        set_table_borders(drm_table)
        make_header_row_repeat(drm_table.rows[0])
        prevent_row_split(drm_table.rows[0])

        drm_table.rows[0].cells[0].paragraphs[0].add_run("Indicator").font.bold = True
        drm_table.rows[0].cells[1].paragraphs[0].add_run("Target Metric").font.bold = True
        set_cell_shading(drm_table.rows[0].cells[0], "F1F5F9")
        set_cell_shading(drm_table.rows[0].cells[1], "F1F5F9")

        for dm in drm_list:
            r = drm_table.add_row()
            prevent_row_split(r)
            r.cells[0].paragraphs[0].add_run(clean_str(dm.indicator)).font.bold = True
            r.cells[1].paragraphs[0].add_run(clean_str(dm.target_metric))

    # Save Word document to byte buffer
    buf = io.BytesIO()
    doc.save(buf)
    buf.seek(0)
    return buf
