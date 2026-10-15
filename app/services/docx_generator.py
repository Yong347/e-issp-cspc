# app/services/docx_generator.py
"""
=============================================================================
DICT ISSP v.2026 COMPLIANCE ENGINE — WORD (.DOCX) DOCUMENT GENERATOR
=============================================================================
Strictly adheres to official DICT ISSP v.2026 Guidelines and statutory order:
- Single Central Institutional Emblem (No Secondary Side Logos)
- First-Page Section Isolation (Strict 1-Page Cover Page, No Spillover)
- Running 3-Column Header Table starting at Table of Contents through to Document End
- Running Footer with Dynamic Page Numbering (Page X of Y) using valid w:fldSimple
- Dynamic Table of Contents with Accurate Sequential Page Numbers
- Completely Dynamic Planning Horizon (Derived from Active Cycle, Zero Hardcoding)
- Dynamic Inflation Rates & UACS Accounting (Synced with System Policies)
- Full Statutory Structure:
    * Cover Page (Page 1)
    * Table of Contents (Starting with Section 2 Running Headers)
    * Preliminary: Definition of Terms (Glossary with Fallback Seeding)
    * Part I: Agency Profile & Strategic Context (A, B.1, B.2, C)
    * Part II: Current ICT Assessment (A, B1, B2, C, D)
    * Part III: Proposed ICT Strategy (A1, A2, B, C, D, E1/E2 Charters, F1/F2/F3 PMF)
      - Information System Cards render Target Implementation Year and UACS Code & Class
      - ICT Project Charters reflect linked line items and full computed costs
    * Part IV: Resource Requirements (A. Detailed Annual Deployments, B. Parity Tables B.1-B.4)
      - Systems flow directly into Part IV.A annual tables and Part IV.B Tables B.1–B.4
    * Annex 1: Existing ICT Asset Inventory (1. Equipment, 2. Software - Real Aggregations)
    * Annex 2: Disaster Recovery & Business Continuity Plan (DRBCP Sections 1-6 + KPIs)
=============================================================================
"""

import io
import os
import re
import json
import base64
import logging
import urllib.request
from decimal import Decimal
from typing import List, Dict, Any, Optional, Union

from docx import Document
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_TAB_ALIGNMENT
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_ALIGN_VERTICAL
from docx.enum.section import WD_ORIENTATION, WD_SECTION_START
from docx.oxml import OxmlElement, parse_xml
from docx.oxml.ns import qn, nsdecls
from docx.text.paragraph import Paragraph
from sqlalchemy.orm import object_session

from app.config import settings
from app.services.issp_outline import flatten_outline, get_default_issp_outline
from app.utils.helpers import (
    get_adjusted_unit_cost_for_year,
    get_cycle_year_range,
    calculate_financial_summaries
)

logger = logging.getLogger("app.services.docx_generator")


DOCX_OUTLINE_LABELS = {
    "definitions": ("DEFINITION OF TERMS",),
    "part1": ("PART I. AGENCY PROFILE & STRATEGIC CONTEXT",),
    "part1-a": ("A. Mandate, Vision, Mission",),
    "part1-a1": ("A.1. Mandate",),
    "part1-a2": ("A.2. Vision Statement",),
    "part1-a3": ("A.3. Mission Statement",),
    "part1-a4": ("A.4. Organizational Outcomes", "A.4. Organizational Outcome"),
    "part1-b": ("B. Organizational Structure",),
    "part1-b1": ("B.1. Chief Information Officer",),
    "part1-b2": ("B.2. Human Capital",),
    "part1-c": ("C. Stakeholder Analysis",),
    "part2": ("PART II. CURRENT ICT ASSESSMENT",),
    "part2-a": ("A. Strategic Concerns",),
    "part2-b": ("B. Existing Network Infrastructure",),
    "part2-b1": ("B1. LAN/WAN Set-Up", "B1. LAN/WAN SET-UP"),
    "part2-b2": ("B2. CYBERSECURITY CONTROL CHECKLIST", "B2. Cybersecurity"),
    "part2-c": ("C. Existing / Operational Information Systems", "C. Existing/Operational Information Systems"),
    "part2-d": ("D. E-Government Programs",),
    "part3": ("PART III. PROPOSED ICT STRATEGY",),
    "part3-a": ("A. Proposed Network Infrastructure",),
    "part3-a1": ("A.1. LAN/WAN Set-Up", "A.1. LAN/WAN SET-UP"),
    "part3-a2": ("A.2. CYBERSECURITY CONTROL CHECKLIST", "A.2. Cybersecurity"),
    "part3-b": ("B. ENTERPRISE ARCHITECTURE", "B. Enterprise Architecture"),
    "part3-c": ("C. Proposed ICT Human Capital",),
    "part3-d": ("D. Proposed Information Systems",),
    "part3-e": ("E. Strategic ICT Projects Portfolio", "E. ICT Projects"),
    "part3-e1": ("E.1. INTERNAL ICT PROJECTS", "E.1. Internal ICT Projects"),
    "part3-e2": ("E.2. CROSS-AGENCY ICT PROJECTS", "E.2. Cross-Agency ICT Projects"),
    "part3-f": ("F. Performance Measurement Framework",),
    "part3-f1": ("F.1. INTERNAL ICT PROJECTS", "F.1. Internal ICT Projects"),
    "part3-f2": ("F.2. CROSS-AGENCY ICT PROJECTS", "F.2. Cross-Agency ICT Projects"),
    "part3-f3": ("F.3. INSTITUTIONAL ICT GOVERNANCE KPIS", "F.3. Institutional ICT Governance KPIs"),
    "part4": ("PART IV. RESOURCE REQUIREMENTS", "PART IV. RESOURCE REQUIREMENTS & SUMMARY OF INVESTMENTS"),
    "part4-a": ("A. Detailed Resource Deployment",),
    "part4-b": ("B. Summary of Investments",),
    "part4-b1": ("B.1. General Summary",),
    "part4-b2": ("B.2. Fund Source",),
    "part4-b3": ("B.3. Statement of Expenditure",),
    "part4-b4": ("B.4. Object of Expenditure",),
    "annex1": ("ANNEX 1: EXISTING INFORMATION & COMMUNICATIONS TECHNOLOGY",),
    "annex1-equipment": ("1. ICT Equipment Inventory",),
    "annex1-software": ("2. ICT Software Inventory",),
    "annex2": ("ANNEX 2: DISASTER RECOVERY", "ANNEX 2: DISASTER RECOVERY & BUSINESS CONTINUITY PLAN"),
    "annex2-overview": ("1. Plan Overview",),
    "annex2-bia": ("2. Business Impact Analysis",),
    "annex2-assets": ("3. ICT Component Inventory",),
    "annex2-recovery": ("4. Technical Recovery Strategy",),
    "annex2-sop": ("5. Standard Operating Procedures",),
    "annex2-compliance": ("6. Compliance, Scalability",),
    "annex2-kpis": ("Key Performance Indicators for DRBCP",),
}


def _apply_docx_outline_overrides(
    doc,
    issp_period: str,
    year_count: int,
    settings_json: Dict[str, Any],
    supplemental_sections: Optional[List[Dict[str, Any]]] = None,
) -> None:
    sections = get_default_issp_outline(issp_period, year_count)
    overrides = settings_json or {}

    def sort_nodes(nodes):
        nodes[:] = [
            node for _, node in sorted(
                enumerate(nodes),
                key=lambda item: (
                    overrides.get(item[1]["key"], {}).get("order")
                    if isinstance(overrides.get(item[1]["key"], {}).get("order"), (int, float))
                    else item[0],
                    item[0],
                )
            )
        ]
        for node in nodes:
            sort_nodes(node["children"])

    sort_nodes(sections)
    flat = flatten_outline(sections)
    by_key = {node["key"]: node for node in flat}
    visibility = {}
    source_visibility = {}
    display_titles = {}

    def resolve_visibility(nodes, parent_visible=True):
        for node in nodes:
            setting = overrides.get(node["key"], {})
            replacement_id = setting.get("replacement_section_id")
            local_visible = setting.get("visible", True)
            visibility[node["key"]] = parent_visible and (local_visible or bool(replacement_id))
            source_visibility[node["key"]] = parent_visible and local_visible and not replacement_id
            replacement_title = next((
                section.get("title") for section in (supplemental_sections or [])
                if section.get("id") == replacement_id
            ), None)
            display_titles[node["key"]] = str(setting.get("title") or replacement_title or node["title"]).strip()
            resolve_visibility(node["children"], visibility[node["key"]] and not replacement_id)

    resolve_visibility(sections)

    body = doc.element.body
    body_blocks = list(body)
    start_index = 0
    for index, block in enumerate(body_blocks):
        if block.tag == qn("w:p") and Paragraph(block, doc._body).text.strip().upper() == "DEFINITION OF TERMS":
            start_index = index
            break

    markers = {}
    marker_paragraphs = {}
    marker_blocks = {}
    for block_index in range(start_index, len(body_blocks)):
        block = body_blocks[block_index]
        paragraphs = [Paragraph(block, doc._body)] if block.tag == qn("w:p") else [
            Paragraph(paragraph, doc._body) for paragraph in block.findall(".//" + qn("w:p"))
        ]
        for paragraph in paragraphs:
            text = paragraph.text.strip()
            if not text:
                continue
            for key, aliases in DOCX_OUTLINE_LABELS.items():
                if key not in by_key or key in markers:
                    continue
                alias = next((value for value in aliases if text.casefold().startswith(value.casefold())), None)
                if alias:
                    markers[key] = block_index
                    marker_paragraphs[key] = (paragraph, alias)
                    marker_blocks[key] = block

    replacement_ids = {
        setting.get("replacement_section_id")
        for setting in overrides.values()
        if setting.get("replacement_section_id")
    }
    section_boundaries = {}
    replacement_anchors = {}
    for section_index, section in enumerate(supplemental_sections or []):
        start_name = f"issp_custom_section_start_{section_index}"
        end_name = f"issp_custom_section_end_{section_index}"
        start_block = end_block = None
        for block in list(body):
            names = [marker.get(qn("w:name")) for marker in block.findall(".//" + qn("w:bookmarkStart"))]
            if start_name in names:
                start_block = block
            if end_name in names:
                end_block = block
        if start_block is not None and end_block is not None:
            section_boundaries[section["id"]] = (start_block, end_block)

    for node in flat:
        setting = overrides.get(node["key"], {})
        replacement_id = setting.get("replacement_section_id")
        if not replacement_id or replacement_id not in section_boundaries or node["key"] not in marker_blocks:
            continue
        start_block, end_block = section_boundaries[replacement_id]
        current_blocks = list(body)
        start_index = current_blocks.index(start_block)
        end_index = current_blocks.index(end_block)
        moved_blocks = _drop_leading_page_break(current_blocks[start_index + 1:end_index])
        destination = marker_blocks[node["key"]]
        insertion_index = current_blocks.index(destination)
        for block in current_blocks[start_index:end_index + 1]:
            if block.getparent() is body:
                body.remove(block)
        for offset, block in enumerate(moved_blocks):
            body.insert(insertion_index + offset, block)
        if moved_blocks:
            replacement_anchors[node["key"]] = moved_blocks[0]
        section_boundaries.pop(replacement_id, None)

    for section in supplemental_sections or []:
        parent_key = section.get("parent_official_key")
        if not parent_key or section["id"] not in section_boundaries or parent_key not in marker_blocks:
            continue
        start_block, end_block = section_boundaries[section["id"]]
        current_blocks = list(body)
        start_index = current_blocks.index(start_block)
        end_index = current_blocks.index(end_block)
        moved_blocks = _drop_leading_page_break(current_blocks[start_index + 1:end_index])
        parent_anchor = replacement_anchors.get(parent_key, marker_blocks[parent_key])
        insertion_index = current_blocks.index(parent_anchor) + 1
        for block in current_blocks[start_index:end_index + 1]:
            if block.getparent() is body:
                body.remove(block)
        for offset, block in enumerate(moved_blocks):
            body.insert(insertion_index + offset, block)
        section_boundaries.pop(section["id"], None)

    placed_first_blocks = {}
    for section in supplemental_sections or []:
        target_key = section.get("insert_before_official_key")
        if (
            section.get("parent_official_key")
            or not target_key
            or section["id"] not in section_boundaries
            or target_key not in marker_blocks
            or target_key not in by_key
            or not visibility.get(target_key, True)
            or marker_blocks[target_key].getparent() is not body
        ):
            continue
        start_block, end_block = section_boundaries[section["id"]]
        current_blocks = list(body)
        start_pos = current_blocks.index(start_block)
        end_pos = current_blocks.index(end_block)
        moved_blocks = _drop_leading_page_break(current_blocks[start_pos + 1:end_pos])
        moved_blocks.append(_make_page_break_block())
        for block in current_blocks[start_pos:end_pos + 1]:
            if block.getparent() is body:
                body.remove(block)
        target_block = replacement_anchors.get(target_key, marker_blocks[target_key])
        insertion_index = list(body).index(target_block)
        for offset, block in enumerate(moved_blocks):
            body.insert(insertion_index + offset, block)
        if moved_blocks:
            placed_first_blocks.setdefault(target_key, moved_blocks[0])
        section_boundaries.pop(section["id"], None)

    body_blocks = list(body)
    markers = {
        key: body_blocks.index(marker_blocks[key])
        for key in marker_blocks
        if marker_blocks[key].getparent() is body
    }

    def content_end_index() -> int:
        # Sections left at the end of the document are not part of the reorderable official content.
        leftover = [
            list(body).index(start_block)
            for start_block, _ in section_boundaries.values()
            if start_block.getparent() is body
        ]
        return min(leftover) if leftover else len(list(body)) - 1

    for year_index in range(year_count):
        key = f"part4-a-year-{year_index + 1}"
        alias = f"A.{year_index + 1}. [YEAR #{year_index + 1}]"
        for block_index in range(start_index, len(body_blocks)):
            block = body_blocks[block_index]
            paragraphs = [Paragraph(block, doc._body)] if block.tag == qn("w:p") else [
                Paragraph(paragraph, doc._body) for paragraph in block.findall(".//" + qn("w:p"))
            ]
            paragraph = next((item for item in paragraphs if item.text.strip().startswith(alias)), None)
            if paragraph:
                markers[key] = block_index
                marker_paragraphs[key] = (paragraph, alias)
                marker_blocks[key] = block
                break

    for key, (paragraph, alias) in marker_paragraphs.items():
        setting_title = overrides.get(key, {}).get("title")
        if not setting_title:
            continue
        replacement = str(setting_title).strip()
        for run in paragraph.runs:
            if run.text.casefold().startswith(alias.casefold()):
                run.text = replacement + run.text[len(alias):]
                break

    root_keys = [node["key"] for node in sections if node["key"] in marker_blocks]
    natural_roots = sorted(
        (body.index(placed_first_blocks.get(key, replacement_anchors.get(key, marker_blocks[key]))), key)
        for key in root_keys
    )
    if len(natural_roots) > 1 and [key for _, key in natural_roots] != root_keys:
        body_blocks = list(body)
        content_start = natural_roots[0][0]
        content_end = content_end_index()
        chunks = {}
        for index, (position, key) in enumerate(natural_roots):
            end_position = natural_roots[index + 1][0] if index + 1 < len(natural_roots) else content_end
            chunks[key] = body_blocks[position:end_position]
        for block in body_blocks[content_start:content_end]:
            if block.getparent() is body:
                body.remove(block)
        insertion_index = content_start
        last_key = root_keys[-1]
        for key in root_keys:
            chunk = list(chunks.get(key, []))
            if chunk:
                if key != last_key and not _is_page_break_block(chunk[-1]):
                    chunk.append(_make_page_break_block())
                elif key == last_key and _is_page_break_block(chunk[-1]):
                    chunk.pop()
            for block in chunk:
                body.insert(insertion_index, block)
                insertion_index += 1
        body_blocks = list(body)
        markers = {key: body_blocks.index(marker_blocks[key]) for key in marker_blocks if marker_blocks[key].getparent() is body}

    hidden_ranges = []
    # A section placed before an official section must not be removed with the preceding hidden section.
    boundary_markers = dict(markers)
    for placed_key, placed_block in placed_first_blocks.items():
        if placed_block.getparent() is body and placed_key in markers:
            boundary_markers[placed_key] = body_blocks.index(placed_block)
    for node in flat:
        key = node["key"]
        if source_visibility.get(key, visibility.get(key, True)) or key not in markers:
            continue
        parent_key = node.get("parent_key")
        if parent_key and not visibility.get(parent_key, True):
            continue
        start = markers[key]
        end = next((
            boundary_markers[candidate["key"]]
            for candidate in flat[flat.index(node) + 1:]
            if candidate["depth"] <= node["depth"]
            and candidate["key"] in markers
            and markers[candidate["key"]] > start
        ), content_end_index())
        hidden_ranges.append((start, end))

    for start, end in sorted(hidden_ranges, reverse=True):
        for block in body_blocks[start:end]:
            if block.getparent() is body:
                body.remove(block)

    # Bookmarks let the table of contents show real page numbers once Word updates its fields.
    for index, (key, (paragraph, _alias)) in enumerate(marker_paragraphs.items()):
        paragraph_element = paragraph._p
        if body not in paragraph_element.iterancestors():
            continue
        bookmark_id = str(5000 + index)
        start_mark = OxmlElement("w:bookmarkStart")
        start_mark.set(qn("w:id"), bookmark_id)
        start_mark.set(qn("w:name"), docx_toc_bookmark_name(key))
        end_mark = OxmlElement("w:bookmarkEnd")
        end_mark.set(qn("w:id"), bookmark_id)
        properties = paragraph_element.find(qn("w:pPr"))
        paragraph_element.insert(1 if properties is not None else 0, start_mark)
        paragraph_element.append(end_mark)

    # Fall back to the estimated number where a heading could not be bookmarked.
    existing_bookmarks = {mark.get(qn("w:name")) for mark in body.iter(qn("w:bookmarkStart"))}
    for instruction in list(body.iter(qn("w:instrText"))):
        match = re.search(r"PAGEREF\s+(\S+)", instruction.text or "")
        if not match or match.group(1) in existing_bookmarks:
            continue
        instruction_run = instruction.getparent()
        begin_run = instruction_run.getprevious()
        separate_run = instruction_run.getnext()
        text_run = separate_run.getnext() if separate_run is not None else None
        end_run = text_run.getnext() if text_run is not None else None
        for stale in (begin_run, instruction_run, separate_run, end_run):
            if stale is not None and stale.getparent() is not None:
                stale.getparent().remove(stale)

    settings_element = doc.settings.element
    if settings_element.find(qn("w:updateFields")) is None:
        update_fields = OxmlElement("w:updateFields")
        update_fields.set(qn("w:val"), "true")
        settings_element.append(update_fields)


def docx_toc_bookmark_name(key: str) -> str:
    return "toc_" + re.sub(r"[^A-Za-z0-9]", "_", str(key))[:30]


def _is_page_break_block(block) -> bool:
    return block.tag == qn("w:p") and any(
        br.get(qn("w:type")) == "page" for br in block.iter(qn("w:br"))
    )


def _make_page_break_block():
    paragraph = OxmlElement("w:p")
    run = OxmlElement("w:r")
    page_break = OxmlElement("w:br")
    page_break.set(qn("w:type"), "page")
    run.append(page_break)
    paragraph.append(run)
    return paragraph


def _drop_leading_page_break(blocks):
    return blocks[1:] if blocks and _is_page_break_block(blocks[0]) else list(blocks)

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
        "Information Systems Strategic Plan – A statutory multi-year strategic blueprint that outlines an agency's overall ICT strategy, operational information systems, infrastructure roadmaps, and budgetary requirements."
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
# UNIVERSAL IMAGE RETRIEVAL & BYTE STREAM RESOLUTION
# =========================================================================

def get_image_bytes(url: Optional[str]) -> Optional[bytes]:
    """
    Universally resolves an image URL or local file path into raw bytes.
    Accepts valid user-provided image data without arbitrary keyword dropping.
    """
    if not url or not isinstance(url, str):
        return None
    url_clean = url.strip()
    if not url_clean:
        return None

    # 1. Direct local disk path
    if os.path.exists(url_clean) and os.path.isfile(url_clean):
        try:
            with open(url_clean, "rb") as f:
                return f.read()
        except Exception:
            pass

    # 2. Extract relative path and check multiple candidate directories
    rel = None
    if "/static/uploads/" in url_clean:
        rel = url_clean.split("/static/uploads/")[-1].lstrip("/")
    elif "uploads/" in url_clean:
        rel = url_clean.split("uploads/")[-1].lstrip("/")
    else:
        rel = url_clean.lstrip("/")

    candidate_dirs = [
        getattr(settings, "LOCAL_UPLOAD_DIR", "uploads"),
        os.path.join(getattr(settings, "BASE_DIR", "."), "uploads"),
        os.path.join(getattr(settings, "BASE_DIR", "."), "uploads", "diagrams"),
        "/home/site/wwwroot/uploads",
        "/home/uploads",
        "/code/uploads",
        "./uploads",
        "uploads"
    ]

    for cdir in candidate_dirs:
        if cdir:
            cand_path = os.path.join(cdir, rel)
            if os.path.exists(cand_path) and os.path.isfile(cand_path):
                try:
                    with open(cand_path, "rb") as f:
                        return f.read()
                except Exception:
                    pass

    # 3. Use storage_client if initialized
    try:
        from app.storage.s3_client import storage_client
        data_uri = storage_client.get_as_base64_uri(url_clean)
        if data_uri and data_uri.startswith("data:") and "," in data_uri:
            b64_str = data_uri.split(",", 1)[1]
            return base64.b64decode(b64_str)
    except Exception as e:
        logger.debug(f"storage_client image extraction note: {e}")

    # 4. Fetch via HTTP/HTTPS URL
    if url_clean.startswith(("http://", "https://")):
        try:
            req = urllib.request.Request(
                url_clean,
                headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) docx-generator/5.0'}
            )
            with urllib.request.urlopen(req, timeout=5) as resp:
                return resp.read()
        except Exception as net_err:
            logger.debug(f"HTTP image fetch note: {net_err}")

    return None


def get_agency_logo_bytes(narrative: Any) -> Optional[bytes]:
    """
    Resolves the official institutional agency logo bytes with disk search fallback.
    """
    raw_url = getattr(narrative, "agency_logo_url", None)
    if raw_url:
        data = get_image_bytes(raw_url)
        if data:
            return data

    search_dirs = [
        os.path.join(getattr(settings, "LOCAL_UPLOAD_DIR", "uploads"), "diagrams", "agency_logo"),
        os.path.join(getattr(settings, "BASE_DIR", "."), "uploads"),
        os.path.join(getattr(settings, "BASE_DIR", "."), "uploads", "diagrams"),
        "/home/site/wwwroot/uploads/diagrams/agency_logo",
        "/home/uploads/diagrams/agency_logo",
        "/code/uploads/diagrams/agency_logo",
        "./uploads/diagrams/agency_logo",
        "uploads/diagrams/agency_logo"
    ]
    for sdir in search_dirs:
        if os.path.exists(sdir) and os.path.isdir(sdir):
            for fname in os.listdir(sdir):
                if fname.lower().endswith((".png", ".jpg", ".jpeg", ".webp", ".svg")):
                    fpath = os.path.join(sdir, fname)
                    try:
                        with open(fpath, "rb") as f:
                            return f.read()
                    except Exception:
                        pass
    return None


# =========================================================================
# XML FORMATTING HELPERS FOR WORD TABLES, CELLS & FIELDS
# =========================================================================

def add_xml_field(paragraph, field_name: str):
    """Inserts a valid native Word field (PAGE, NUMPAGES) using w:fldSimple."""
    fldSimple = parse_xml(
        r'<w:fldSimple %s w:instr="%s"><w:r><w:rPr><w:rFonts w:ascii="Palatino Linotype" w:hAnsi="Palatino Linotype"/><w:sz w:val="15"/><w:color w:val="94A3B8"/></w:rPr><w:t>1</w:t></w:r></w:fldSimple>'
        % (nsdecls('w'), field_name)
    )
    paragraph._p.append(fldSimple)


def set_cell_shading(cell, color_hex: str = "F1F5F9"):
    """Applies a solid background shading color to a Word table cell."""
    shading_elm = parse_xml(f'<w:shd {nsdecls("w")} w:fill="{color_hex}"/>')
    cell._tc.get_or_add_tcPr().append(shading_elm)


def set_cell_margins(cell, top: int = 60, bottom: int = 60, left: int = 100, right: int = 100):
    """Sets internal cell margins in dxa (20 dxa = 1 pt)."""
    tcPr = cell._tc.get_or_add_tcPr()
    tcMar = OxmlElement('w:tcMar')
    for m, val in [('w:top', top), ('w:bottom', bottom), ('w:left', left), ('w:right', right)]:
        node = OxmlElement(m)
        node.set(qn('w:w'), str(val))
        node.set(qn('w:type'), 'dxa')
        tcMar.append(node)
    tcPr.append(tcMar)


def set_table_borders(table, color: str = "334155", sz: str = "4", val: str = "single"):
    """Applies clean borders to all edges and inside grid lines of a Word table."""
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


def set_header_table_bottom_border(table, color: str = "CBD5E1", sz: str = "12", val: str = "single"):
    """Applies solely a clean horizontal dividing border to the bottom of the running header table."""
    tblPr = table._tbl.tblPr
    borders = parse_xml(
        f'<w:tblBorders {nsdecls("w")}>'
        f'  <w:top w:val="none"/>'
        f'  <w:bottom w:val="{val}" w:sz="{sz}" w:space="0" w:color="{color}"/>'
        f'  <w:insideH w:val="none"/>'
        f'  <w:insideV w:val="none"/>'
        f'  <w:left w:val="none"/>'
        f'  <w:right w:val="none"/>'
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
    """Formats numeric and decimal currency values to Philippine Peso representation."""
    if val is None:
        return "PHP 0.00"
    try:
        dec = Decimal(str(val))
        return f"PHP {dec:,.2f}"
    except Exception:
        return "PHP 0.00"


def clean_str(val: Any, default: str = "") -> str:
    """Extracts clean non-null string value safely without dropping valid entries."""
    if val is None:
        return default
    s = str(getattr(val, "value", val) or "").strip()
    return s if s else default


def strip_html_tags(text_val: Any) -> str:
    """Converts HTML strings into clean plain-text paragraphs."""
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


def normalize_category_name(cat_str: str) -> str:
    """Normalizes category variations for consistent grouping."""
    c_lower = str(cat_str or "").strip().lower()
    if "continuing" in c_lower:
        return "Continuing Costs/Expenses"
    if "internal" in c_lower and "project" in c_lower:
        return "Internal ICT Projects"
    if "cross" in c_lower and "project" in c_lower:
        return "Cross-Agency ICT Projects"
    if "office" in c_lower or "productivity" in c_lower:
        return "Office Productivity"
    return cat_str.strip() if cat_str else "Office Productivity"


def resolve_proposal_category(itm: Any, proj_lookup: Optional[Dict[str, Any]] = None) -> str:
    """
    In DICT ISSP methodology, categorization is governed strictly by the 
    parent ICT Project charter in Part III.E.
    """
    proj = getattr(itm, "project_rel", None)
    if not proj and getattr(itm, "project_id", None) and proj_lookup:
        proj = proj_lookup.get(str(itm.project_id))

    if proj and getattr(proj, "project_category", None):
        return normalize_category_name(clean_str(getattr(proj.project_category, "value", proj.project_category)))
    
    strat = clean_str(getattr(itm, "strategic_category", ""))
    if strat:
        return normalize_category_name(strat)

    cat_lower = clean_str(getattr(itm, "category", "")).lower()
    if cat_lower in ["subscription", "services"]:
        return "Continuing Costs/Expenses"

    return "Office Productivity"


def render_schematic_box(doc, title: str, subtitle: str, section_label: str, img_url: Optional[str] = None):
    """
    Renders an official schematic exhibit in Word format.
    If an authentic image exists, inserts it cleanly.
    Otherwise, renders the official statutory DICT schematic container box.
    """
    img_data = get_image_bytes(img_url)
    if img_data:
        try:
            p_img = doc.add_paragraph()
            p_img.alignment = WD_ALIGN_PARAGRAPH.CENTER
            p_img.paragraph_format.space_before = Pt(4)
            p_img.paragraph_format.space_after = Pt(6)
            r_img = p_img.add_run()
            r_img.add_picture(io.BytesIO(img_data), width=Inches(9.2))
            return
        except Exception as e:
            logger.debug(f"Direct schematic image insertion note for {title}: {e}")

    tbl = doc.add_table(rows=1, cols=1)
    tbl.alignment = WD_TABLE_ALIGNMENT.CENTER
    tbl.autofit = False

    cell = tbl.rows[0].cells[0]
    cell.width = Inches(10.2)
    set_cell_shading(cell, "F8FAFC")
    set_cell_margins(cell, top=160, bottom=160, left=200, right=200)

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
    p.paragraph_format.space_before = Pt(0)
    p.paragraph_format.space_after = Pt(0)

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
        set_cell_margins(c, top=60, bottom=60, left=80, right=80)
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
        set_cell_margins(c0, top=50, bottom=50, left=80, right=80)
        r0 = c0.paragraphs[0].add_run(domain)
        r0.font.name = "Palatino Linotype"
        r0.font.bold = True
        r0.font.size = Pt(7.5)

        c1 = row.cells[1]
        c1.width = widths[1]
        set_cell_margins(c1, top=50, bottom=50, left=80, right=80)
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
        set_cell_margins(c2, top=50, bottom=50, left=80, right=80)
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
    Renders an official DICT Information System Specification Card in Word format.
    Renders Target Implementation Year, UACS Object Code & Class, and Linked ICT Project.
    """
    tbl = doc.add_table(rows=1, cols=2)
    tbl.style = 'Table Grid'
    set_table_borders(tbl)
    prevent_row_split(tbl.rows[0])

    c_hdr = tbl.rows[0].cells[0]
    c_hdr_merge = tbl.rows[0].cells[1]
    c_hdr.merge(c_hdr_merge)
    set_cell_shading(c_hdr, "1E3A8A")
    set_cell_margins(c_hdr, top=80, bottom=80, left=120, right=120)

    p_hdr = c_hdr.paragraphs[0]
    p_hdr.paragraph_format.space_before = Pt(0)
    p_hdr.paragraph_format.space_after = Pt(0)
    r_hdr = p_hdr.add_run(f"INFORMATION SYSTEM: {clean_str(sys_obj.name).upper()}")
    r_hdr.font.name = "Palatino Linotype"
    r_hdr.font.bold = True
    r_hdr.font.size = Pt(8.5)
    r_hdr.font.color.rgb = RGBColor(255, 255, 255)

    def add_card_row(label: str, content: str, is_mono: bool = False, is_highlight: bool = False):
        row = tbl.add_row()
        prevent_row_split(row)
        c0, c1 = row.cells[0], row.cells[1]
        c0.width = Inches(2.6)
        c1.width = Inches(7.6)
        set_cell_shading(c0, "F8FAFC")
        set_cell_margins(c0, top=50, bottom=50, left=100, right=100)
        set_cell_margins(c1, top=50, bottom=50, left=100, right=100)

        p0 = c0.paragraphs[0]
        p0.paragraph_format.space_before = Pt(0)
        p0.paragraph_format.space_after = Pt(0)
        r0 = p0.add_run(label)
        r0.font.name = "Palatino Linotype"
        r0.font.bold = True
        r0.font.size = Pt(7.5)

        p1 = c1.paragraphs[0]
        p1.paragraph_format.space_before = Pt(0)
        p1.paragraph_format.space_after = Pt(0)
        r1 = p1.add_run(content)
        r1.font.name = "Courier New" if is_mono else "Palatino Linotype"
        r1.font.size = Pt(7.5)
        if is_highlight:
            r1.font.bold = True
            r1.font.color.rgb = RGBColor(4, 120, 87)

    class_str = clean_str(getattr(sys_obj, "classification", "")).lower()
    is_supp = getattr(sys_obj, "is_support_to_operations", False) or "support" in class_str
    is_adm = getattr(sys_obj, "is_general_administrative", False) or "admin" in class_str
    is_ops = getattr(sys_obj, "is_operations", False) or ("operations" in class_str and not is_supp and not is_adm)
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

        target_yr = getattr(sys_obj, "target_year", None)
        if target_yr:
            add_card_row("TARGET IMPLEMENTATION YEAR", f"FY {target_yr}", is_mono=True)

        uacs_val = getattr(sys_obj, "uacs_object_code", None)
        exp_val = getattr(sys_obj, "expenditure_class", None)
        if not uacs_val:
            cost_dec = Decimal(str(getattr(sys_obj, "proposed_cost", 0) or 0))
            uacs_val = (
                "50604070 01 - ICT Software (Perpetual CO)" 
                if cost_dec >= Decimal("50000.00") 
                else "50211030 00 - Consulting/Outsourced Development (MOOE)"
            )
        if not exp_val:
            exp_val = "Capital Outlay" if "(CO)" in str(uacs_val) else "Maintenance and Other Operating Expenses"
        add_card_row("UACS OBJECT CODE & CLASS", f"{clean_str(uacs_val)} ({clean_str(exp_val)})")

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
        f"[{'X' if getattr(sys_obj, 'generates_data_for_others', False) else ' '}] Generates data that is utilized by other systems\n"
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

    p_spacer = doc.add_paragraph()
    p_spacer.paragraph_format.space_before = Pt(0)
    p_spacer.paragraph_format.space_after = Pt(4)


def render_project_charter_card(doc, proj: Any, is_cross: bool = False, planning_years: List[int] = None):
    """Renders an official DICT Project Charter Card in Word format (Parts III.E.1 & III.E.2)."""
    tbl = doc.add_table(rows=1, cols=2)
    tbl.style = 'Table Grid'
    set_table_borders(tbl)
    prevent_row_split(tbl.rows[0])

    c_hdr = tbl.rows[0].cells[0]
    c_hdr_merge = tbl.rows[0].cells[1]
    c_hdr.merge(c_hdr_merge)
    set_cell_shading(c_hdr, "1E3A8A")
    set_cell_margins(c_hdr, top=80, bottom=80, left=120, right=120)

    p_hdr = c_hdr.paragraphs[0]
    p_hdr.paragraph_format.space_before = Pt(0)
    p_hdr.paragraph_format.space_after = Pt(0)
    sec_prefix = "E.2. CROSS-AGENCY ICT PROJECT" if is_cross else "E.1. INTERNAL ICT PROJECT"
    r_hdr = p_hdr.add_run(f"{sec_prefix}: {clean_str(proj.project_title).upper()}")
    r_hdr.font.name = "Palatino Linotype"
    r_hdr.font.bold = True
    r_hdr.font.size = Pt(8.5)
    r_hdr.font.color.rgb = RGBColor(255, 255, 255)

    def add_charter_row(label: str, content: str, is_mono: bool = False, is_highlight: bool = False):
        row = tbl.add_row()
        prevent_row_split(row)
        c0, c1 = row.cells[0], row.cells[1]
        c0.width = Inches(2.6)
        c1.width = Inches(7.6)
        set_cell_shading(c0, "F8FAFC")
        set_cell_margins(c0, top=50, bottom=50, left=100, right=100)
        set_cell_margins(c1, top=50, bottom=50, left=100, right=100)

        p0 = c0.paragraphs[0]
        p0.paragraph_format.space_before = Pt(0)
        p0.paragraph_format.space_after = Pt(0)
        r0 = p0.add_run(label)
        r0.font.name = "Palatino Linotype"
        r0.font.bold = True
        r0.font.size = Pt(7.5)

        p1 = c1.paragraphs[0]
        p1.paragraph_format.space_before = Pt(0)
        p1.paragraph_format.space_after = Pt(0)
        r1 = p1.add_run(content)
        r1.font.name = "Courier New" if is_mono else "Palatino Linotype"
        r1.font.size = Pt(7.5)
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

    # Dynamic duration derived from active planning span
    base_start = planning_years[0] if (planning_years and len(planning_years) > 0) else 2026
    base_end = planning_years[-1] if (planning_years and len(planning_years) > 0) else (base_start + 2)
    p_start = getattr(proj, "duration_start_year", None) or base_start
    p_end = getattr(proj, "duration_end_year", None) or base_end
    p_years = list(range(p_start, p_end + 1)) if p_end >= p_start else [p_start]
    add_charter_row("DURATION", f"FY {p_start} to FY {p_end} ({len(p_years)} Years)")

    annual_map = getattr(proj, "annual_deliverables", None) or {}
    if isinstance(annual_map, str):
        try: annual_map = json.loads(annual_map)
        except Exception: annual_map = {}

    for idx, yr in enumerate(p_years):
        m_text = annual_map.get(str(yr)) or annual_map.get(f"Year {idx + 1}") or annual_map.get(yr)
        if not m_text:
            if idx == 0: m_text = getattr(proj, "year_1_deliverables", "N/A")
            elif idx == 1: m_text = getattr(proj, "year_2_deliverables", "N/A")
            elif idx == 2: m_text = getattr(proj, "year_3_deliverables", "N/A")
            else: m_text = "N/A"
        add_charter_row(f"YEAR {idx + 1} DELIVERABLES (FY {yr})", clean_str(m_text, "N/A"))

    add_charter_row("IMPLEMENTING UNIT", clean_str(proj.implementing_unit, "ICT Management Office"))

    # Linked Project Components (Part IV.A line items & systems)
    linked_props = [
        itm for itm in getattr(proj, "resource_items", []) 
        if not getattr(itm, "is_archived", False) 
        and str(getattr(itm, "status", "")).lower() == "approved"
        and (str(getattr(itm, "project_id", "")) == str(proj.id))
    ]
    linked_sys = list(getattr(proj, "linked_systems", []) or [])
    if getattr(proj, "information_system", None) and proj.information_system not in linked_sys:
        linked_sys.append(proj.information_system)

    components_lines = []
    for s in linked_sys:
        s_cost = fmt_currency(getattr(s, "proposed_cost", 0))
        components_lines.append(f"• [SYSTEM] {clean_str(s.name)} - 1 unit - {s_cost}")
    for itm in linked_props:
        if itm.system_id and any(str(s.id).lower() == str(itm.system_id).lower() for s in linked_sys):
            continue
        itm_cost = fmt_currency(getattr(itm, "total_cost", 0))
        components_lines.append(f"• {clean_str(itm.item_name)} ({clean_str(getattr(itm, 'category', 'Hardware'))}) - {getattr(itm, 'total_qty', 1)} units - {itm_cost}")

    if components_lines:
        add_charter_row("PROJECT COMPONENTS (PART IV.A)", "\n".join(components_lines))

    add_charter_row("TOTAL PROJECT COST", fmt_currency(proj.computed_total_project_cost), is_mono=True, is_highlight=True)
    add_charter_row("FUNDING SOURCE", clean_str(getattr(proj.funding_source, 'value', proj.funding_source), "GAA"))

    if is_cross:
        add_charter_row("LEAD AGENCY", clean_str(getattr(proj, "lead_agency", None), "DICT"))
        add_charter_row("PARTNER AGENCIES", clean_str(getattr(proj, "partner_agencies", None), "None"))

    p_spacer = doc.add_paragraph()
    p_spacer.paragraph_format.space_before = Pt(0)
    p_spacer.paragraph_format.space_after = Pt(4)


# ==========================================================
# CORE DOCUMENT GENERATOR PIPELINE
# ==========================================================

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
    document_composition: Optional[Dict[str, Any]] = None,
    **kwargs
) -> io.BytesIO:
    """
    Builds a fully formatted, editable Microsoft Word (.docx) document
    representing the complete DICT ISSP v.2026 statutory blueprint.
    Guarantees strict single-page cover sheet layout, running headers/footers with
    dynamic page numbers starting on Table of Contents through to document end,
    and dynamically renders all user data without artificial blacklists.
    """
    doc = Document()

    # Resolve database session if available for dynamic inflation rates
    db_session = kwargs.get("db") or (object_session(narrative) if narrative is not None else None)

    # Resolve dynamic planning years from narrative or kwargs
    issp_period = clean_str(getattr(narrative, "issp_period", None), "2026-2028")
    
    planning_years = kwargs.get("planning_years")
    if not planning_years:
        planning_years = get_cycle_year_range(narrative, issp_period)
    
    start_year = planning_years[0]
    end_year = planning_years[-1]

    # Quick lookup for projects to ensure robust category and fund source resolution
    proj_lookup = {str(p.id): p for p in projects if getattr(p, "id", None)}

    # Resolve Project groupings for PMF and TOC chapters
    internal_projects = [p for p in projects if "cross" not in clean_str(getattr(p, "project_category", "")).lower()]
    cross_projects = [p for p in projects if "cross" in clean_str(getattr(p, "project_category", "")).lower()]
    internal_pids = {str(p.id) for p in internal_projects if getattr(p, "id", None)}
    cross_pids = {str(p.id) for p in cross_projects if getattr(p, "id", None)}
    internal_titles = {clean_str(p.project_title).lower() for p in internal_projects if getattr(p, "project_title", None)}
    cross_titles = {clean_str(p.project_title).lower() for p in cross_projects if getattr(p, "project_title", None)}

    pmf_metrics = performance_metrics or []

    # Initialize PMF groupings at outer scope so they are available for both TOC and Body
    pmf_f1 = [
        m for m in pmf_metrics 
        if (getattr(m, "project_id", None) and str(m.project_id) in internal_pids) or 
           (clean_str(getattr(m, "project_title", "")).lower() in internal_titles)
    ]
    pmf_f2 = [
        m for m in pmf_metrics 
        if (getattr(m, "project_id", None) and str(m.project_id) in cross_pids) or 
           (clean_str(getattr(m, "project_title", "")).lower() in cross_titles)
    ]
    pmf_f1_ids = {id(m) for m in pmf_f1}
    pmf_f2_ids = {id(m) for m in pmf_f2}
    pmf_f3 = [
        m for m in pmf_metrics 
        if id(m) not in pmf_f1_ids and id(m) not in pmf_f2_ids
    ]

    # =========================================================================
    # SECTION 1: COVER PAGE SETUP (NO HEADER, NO FOOTER, STRICT 1-PAGE)
    # =========================================================================
    sec1 = doc.sections[0]
    sec1.orientation = WD_ORIENTATION.LANDSCAPE
    sec1.page_width = Inches(11.69)
    sec1.page_height = Inches(8.27)
    sec1.top_margin = Inches(0.55)
    sec1.bottom_margin = Inches(0.55)
    sec1.left_margin = Inches(0.7)
    sec1.right_margin = Inches(0.7)

    # Detach headers and footers completely for Section 1
    sec1.header.is_linked_to_previous = False
    sec1.footer.is_linked_to_previous = False
    sec1.header.paragraphs[0].text = ""
    sec1.footer.paragraphs[0].text = ""

    agency_name = clean_str(narrative.agency_name, getattr(settings, "DEFAULT_AGENCY_NAME", "National Government Agency"))

    # Resolve Signatories cleanly (preserving user-entered names without hardcoded human names)
    raw_cio = clean_str(getattr(narrative, "signatory_prepared_by", None) or getattr(narrative, "cio_name", None))
    cio_name = raw_cio if raw_cio else "CHIEF INFORMATION OFFICER"

    raw_head = clean_str(getattr(narrative, "signatory_approved_by", None) or getattr(narrative, "head_of_agency_name", None))
    head_name = raw_head if raw_head else clean_str(getattr(narrative, "agency_head_position", None), getattr(settings, "DEFAULT_AGENCY_HEAD_TITLE", "Head of Agency")).upper()

    head_title = clean_str(getattr(narrative, "agency_head_position", None), getattr(settings, "DEFAULT_AGENCY_HEAD_TITLE", "Head of Agency"))

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

    # MERGE STATUTORY GLOSSARY: Guarantee official terms exist alongside user custom definitions
    glossary_dict = {}
    for term, definition in DEFAULT_CANONICAL_GLOSSARY:
        glossary_dict[term.upper()] = (term, definition)

    if glossary:
        for g in glossary:
            if isinstance(g, (list, tuple)) and len(g) >= 2:
                t, d = str(g[0]).strip(), str(g[1]).strip()
            else:
                t = clean_str(getattr(g, "term", ""))
                d = clean_str(getattr(g, "definition", ""))
            if t and d:
                glossary_dict[t.upper()] = (t, d)

    glossary_list = list(glossary_dict.values())

    # -------------------------------------------------------------
    # BUILD COVER PAGE CONTENT (STRICT COMPACT 1-PAGE FIT)
    # -------------------------------------------------------------
    agency_logo_data = get_agency_logo_bytes(narrative)
    if agency_logo_data:
        try:
            p_logo = doc.add_paragraph()
            p_logo.alignment = WD_ALIGN_PARAGRAPH.CENTER
            p_logo.paragraph_format.space_before = Pt(0)
            p_logo.paragraph_format.space_after = Pt(2)
            p_logo.add_run().add_picture(io.BytesIO(agency_logo_data), width=Inches(1.2))
        except Exception as e:
            logger.debug(f"Cover logo insertion note: {e}")

    p_rep = doc.add_paragraph()
    p_rep.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p_rep.paragraph_format.space_before = Pt(0)
    p_rep.paragraph_format.space_after = Pt(4)
    p_rep.paragraph_format.line_spacing = 1.12

    r_rep = p_rep.add_run("Republic of the Philippines\n")
    r_rep.font.name = "Palatino Linotype"
    r_rep.font.size = Pt(8.5)
    r_rep.font.color.rgb = RGBColor(71, 85, 105)

    r_agency = p_rep.add_run(f"{agency_name.upper()}\n")
    r_agency.font.name = "Palatino Linotype"
    r_agency.font.size = Pt(13)
    r_agency.font.bold = True
    r_agency.font.color.rgb = RGBColor(15, 23, 42)

    agency_addr = clean_str(getattr(narrative, 'agency_address', None), "")
    if agency_addr:
        r_loc = p_rep.add_run(f"{agency_addr}\n")
        r_loc.font.name = "Palatino Linotype"
        r_loc.font.size = Pt(8.0)
        r_loc.font.color.rgb = RGBColor(100, 116, 139)

    r_plan = p_rep.add_run("INFORMATION SYSTEMS STRATEGIC PLAN (ISSP)\n")
    r_plan.font.name = "Palatino Linotype"
    r_plan.font.size = Pt(17)
    r_plan.font.bold = True
    r_plan.font.color.rgb = RGBColor(30, 58, 138)

    is_amend = bool(getattr(narrative, "is_amendment", False))
    amend_num = getattr(narrative, "amendment_number", "1st") or "1st"
    type_str = f"[X] AMENDMENT <{amend_num}>     [ ] REGULAR ISSP" if is_amend else "[X] REGULAR ISSP     [ ] AMENDMENT"

    r_type = p_rep.add_run(f"{type_str}\n")
    r_type.font.name = "Palatino Linotype"
    r_type.font.size = Pt(9.5)
    r_type.font.bold = True

    r_period = p_rep.add_run(f"For the period {start_year} to {end_year}\n")
    r_period.font.name = "Palatino Linotype"
    r_period.font.size = Pt(10)
    r_period.font.color.rgb = RGBColor(71, 85, 105)

    if narrative.agency_website_url:
        r_url = p_rep.add_run(f"<{narrative.agency_website_url}>\n")
        r_url.font.name = "Palatino Linotype"
        r_url.font.size = Pt(8.5)
        r_url.font.italic = True
        r_url.font.color.rgb = RGBColor(100, 116, 139)

    # Cover Table: Signatories & Scope
    cov_table = doc.add_table(rows=1, cols=2)
    cov_table.alignment = WD_TABLE_ALIGNMENT.CENTER
    cov_table.autofit = False
    set_table_borders(cov_table, color="FFFFFF")
    prevent_row_split(cov_table.rows[0])

    # Left Cell: Signatories structured cleanly without excessive vertical newlines
    c_left = cov_table.rows[0].cells[0]
    c_left.width = Inches(5.1)
    set_cell_margins(c_left, top=30, bottom=30, left=80, right=80)

    p_prep = c_left.paragraphs[0]
    p_prep.paragraph_format.space_before = Pt(0)
    p_prep.paragraph_format.space_after = Pt(20)
    r_prep = p_prep.add_run("PREPARED BY:")
    r_prep.font.name = "Palatino Linotype"
    r_prep.font.size = Pt(8.5)
    r_prep.font.bold = True
    r_prep.font.color.rgb = RGBColor(30, 58, 138)

    p_cio = c_left.add_paragraph()
    p_cio.paragraph_format.space_before = Pt(0)
    p_cio.paragraph_format.space_after = Pt(1)
    r_cio = p_cio.add_run(f"    {cio_name.upper()}")
    r_cio.font.name = "Palatino Linotype"
    r_cio.font.size = Pt(9.5)
    r_cio.font.bold = True

    p_cio_line = c_left.add_paragraph()
    p_cio_line.paragraph_format.space_before = Pt(0)
    p_cio_line.paragraph_format.space_after = Pt(1)
    r_cline = p_cio_line.add_run("    _________________________________________")
    r_cline.font.name = "Palatino Linotype"
    r_cline.font.size = Pt(8.5)

    p_cio_tit = c_left.add_paragraph()
    p_cio_tit.paragraph_format.space_before = Pt(0)
    p_cio_tit.paragraph_format.space_after = Pt(18)
    r_ctit = p_cio_tit.add_run(f"    Name & Signature of Chief Information Officer\n    ({clean_str(getattr(narrative, 'preparer_position', None) or getattr(narrative, 'cio_plantilla_position', None), 'Chief Information Officer')})")
    r_ctit.font.name = "Palatino Linotype"
    r_ctit.font.size = Pt(7.5)
    r_ctit.font.color.rgb = RGBColor(71, 85, 105)

    p_app = c_left.add_paragraph()
    p_app.paragraph_format.space_before = Pt(0)
    p_app.paragraph_format.space_after = Pt(20)
    r_app = p_app.add_run("APPROVED BY:")
    r_app.font.name = "Palatino Linotype"
    r_app.font.size = Pt(8.5)
    r_app.font.bold = True
    r_app.font.color.rgb = RGBColor(30, 58, 138)

    p_head = c_left.add_paragraph()
    p_head.paragraph_format.space_before = Pt(0)
    p_head.paragraph_format.space_after = Pt(1)
    r_head = p_head.add_run(f"    {head_name.upper()}")
    r_head.font.name = "Palatino Linotype"
    r_head.font.size = Pt(9.5)
    r_head.font.bold = True

    p_head_line = c_left.add_paragraph()
    p_head_line.paragraph_format.space_before = Pt(0)
    p_head_line.paragraph_format.space_after = Pt(1)
    r_hline = p_head_line.add_run("    _________________________________________")
    r_hline.font.name = "Palatino Linotype"
    r_hline.font.size = Pt(8.5)

    p_head_tit = c_left.add_paragraph()
    p_head_tit.paragraph_format.space_before = Pt(0)
    p_head_tit.paragraph_format.space_after = Pt(0)
    r_htit = p_head_tit.add_run(f"    Name & Signature of Agency Head\n    ({head_title})")
    r_htit.font.name = "Palatino Linotype"
    r_htit.font.size = Pt(7.5)
    r_htit.font.color.rgb = RGBColor(71, 85, 105)

    # Right Cell: Scope Checklist Box
    c_right = cov_table.rows[0].cells[1]
    c_right.width = Inches(5.1)
    set_cell_shading(c_right, "F8FAFC")
    set_cell_margins(c_right, top=60, bottom=60, left=120, right=120)

    p_scope = c_right.paragraphs[0]
    p_scope.paragraph_format.space_before = Pt(0)
    p_scope.paragraph_format.space_after = Pt(0)
    p_scope.paragraph_format.line_spacing = 1.12

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
    is_dept_co_only = is_dept_co and not has_reg and not has_bur
    is_agency_wide = "agency-wide" in scope_choice_clean
    is_agency_co_only = is_agency_wide and not has_reg
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
        r_sc.font.size = Pt(7.5)

    # =========================================================================
    # SECTION 2: BODY & ANNEXES (STARTING WITH TABLE OF CONTENTS TO END)
    # =========================================================================
    sec2 = doc.add_section(WD_SECTION_START.NEW_PAGE)
    sec2.orientation = WD_ORIENTATION.LANDSCAPE
    sec2.page_width = Inches(11.69)
    sec2.page_height = Inches(8.27)
    sec2.top_margin = Inches(0.7)
    sec2.bottom_margin = Inches(0.7)
    sec2.left_margin = Inches(0.7)
    sec2.right_margin = Inches(0.7)

    # Detach headers & footers from cover page
    sec2.header.is_linked_to_previous = False
    sec2.footer.is_linked_to_previous = False

    # -------------------------------------------------------------
    # RUNNING 2/3-COLUMN HEADER TABLE (FROM TOC TO END OF DOCUMENT)
    # -------------------------------------------------------------
    sec2_header = sec2.header
    
    p_init_hdr = sec2_header.paragraphs[0]
    p_init_hdr.text = ""
    p_init_hdr.paragraph_format.space_before = Pt(0)
    p_init_hdr.paragraph_format.space_after = Pt(0)
    p_init_hdr.paragraph_format.line_spacing = Pt(1)

    has_logo = bool(agency_logo_data)
    cols_count = 3 if has_logo else 2
    header_table = sec2_header.add_table(rows=1, cols=cols_count, width=Inches(10.29))
    header_table.alignment = WD_TABLE_ALIGNMENT.CENTER
    header_table.autofit = False
    set_header_table_bottom_border(header_table, color="CBD5E1", sz="12", val="single")

    try:
        header_table._tbl.addnext(p_init_hdr._p)
    except Exception as e:
        logger.debug(f"Header paragraph reorder note: {e}")

    agency_header_name = clean_str(narrative.agency_name, getattr(settings, "DEFAULT_AGENCY_NAME", "National Government Agency")).upper()

    if has_logo:
        c_logo = header_table.rows[0].cells[0]
        c_inst = header_table.rows[0].cells[1]
        c_right = header_table.rows[0].cells[2]

        c_logo.width = Inches(0.60)
        c_inst.width = Inches(4.69)
        c_right.width = Inches(5.00)

        c_logo.vertical_alignment = WD_ALIGN_VERTICAL.CENTER
        c_inst.vertical_alignment = WD_ALIGN_VERTICAL.CENTER
        c_right.vertical_alignment = WD_ALIGN_VERTICAL.CENTER

        set_cell_margins(c_logo, top=20, bottom=40, left=0, right=20)
        set_cell_margins(c_inst, top=20, bottom=40, left=20, right=40)
        set_cell_margins(c_right, top=20, bottom=40, left=40, right=0)

        # Column 0: Circular Institutional Logo
        try:
            p_logo_hdr = c_logo.paragraphs[0]
            p_logo_hdr.alignment = WD_ALIGN_PARAGRAPH.LEFT
            p_logo_hdr.paragraph_format.space_before = Pt(0)
            p_logo_hdr.paragraph_format.space_after = Pt(0)
            p_logo_hdr.paragraph_format.line_spacing = 1.0
            r_lpic = p_logo_hdr.add_run()
            r_lpic.add_picture(io.BytesIO(agency_logo_data), width=Inches(0.48))
        except Exception as e:
            logger.debug(f"Running header logo add note: {e}")

        # Column 1: Institutional Name
        p_inst = c_inst.paragraphs[0]
        p_inst.alignment = WD_ALIGN_PARAGRAPH.LEFT
        p_inst.paragraph_format.space_before = Pt(0)
        p_inst.paragraph_format.space_after = Pt(0)
        p_inst.paragraph_format.line_spacing = 1.05
        r_inst = p_inst.add_run(agency_header_name)
        r_inst.font.name = "Palatino Linotype"
        r_inst.font.size = Pt(8.5)
        r_inst.font.bold = True
        r_inst.font.color.rgb = RGBColor(15, 23, 42)

        # Column 2: Active Planning Cycle Span
        p_span = c_right.paragraphs[0]
        p_span.alignment = WD_ALIGN_PARAGRAPH.RIGHT
        p_span.paragraph_format.space_before = Pt(0)
        p_span.paragraph_format.space_after = Pt(0)
        p_span.paragraph_format.line_spacing = 1.05
        r_span = p_span.add_run(f"INFORMATION SYSTEMS STRATEGIC PLAN {start_year} - {end_year}")
        r_span.font.name = "Palatino Linotype"
        r_span.font.size = Pt(9.0)
        r_span.font.bold = True
        r_span.font.color.rgb = RGBColor(15, 23, 42)
    else:
        c_inst = header_table.rows[0].cells[0]
        c_right = header_table.rows[0].cells[1]

        c_inst.width = Inches(5.29)
        c_right.width = Inches(5.00)

        c_inst.vertical_alignment = WD_ALIGN_VERTICAL.CENTER
        c_right.vertical_alignment = WD_ALIGN_VERTICAL.CENTER

        set_cell_margins(c_inst, top=20, bottom=40, left=0, right=40)
        set_cell_margins(c_right, top=20, bottom=40, left=40, right=0)

        p_inst = c_inst.paragraphs[0]
        p_inst.alignment = WD_ALIGN_PARAGRAPH.LEFT
        p_inst.paragraph_format.space_before = Pt(0)
        p_inst.paragraph_format.space_after = Pt(0)
        p_inst.paragraph_format.line_spacing = 1.05
        r_inst = p_inst.add_run(agency_header_name)
        r_inst.font.name = "Palatino Linotype"
        r_inst.font.size = Pt(8.5)
        r_inst.font.bold = True
        r_inst.font.color.rgb = RGBColor(15, 23, 42)

        p_span = c_right.paragraphs[0]
        p_span.alignment = WD_ALIGN_PARAGRAPH.RIGHT
        p_span.paragraph_format.space_before = Pt(0)
        p_span.paragraph_format.space_after = Pt(0)
        p_span.paragraph_format.line_spacing = 1.05
        r_span = p_span.add_run(f"INFORMATION SYSTEMS STRATEGIC PLAN {start_year} - {end_year}")
        r_span.font.name = "Palatino Linotype"
        r_span.font.size = Pt(9.0)
        r_span.font.bold = True
        r_span.font.color.rgb = RGBColor(15, 23, 42)

    # Running Footer: Left title + Right Page {PAGE} of {NUMPAGES}
    fp = sec2.footer.paragraphs[0]
    fp.text = ""
    fp.alignment = WD_ALIGN_PARAGRAPH.LEFT
    fp.paragraph_format.tab_stops.add_tab_stop(Inches(10.29), WD_TAB_ALIGNMENT.RIGHT)
    frun1 = fp.add_run("OFFICIAL GOVERNMENT DOCUMENT — DICT ISSP v.2026 STANDARD\tPage ")
    frun1.font.name = "Palatino Linotype"
    frun1.font.size = Pt(7.5)
    frun1.font.color.rgb = RGBColor(148, 163, 184)
    add_xml_field(fp, "PAGE")
    frun2 = fp.add_run(" of ")
    frun2.font.name = "Palatino Linotype"
    frun2.font.size = Pt(7.5)
    frun2.font.color.rgb = RGBColor(148, 163, 184)
    add_xml_field(fp, "NUMPAGES")

    # =========================================================================
    # TABLE OF CONTENTS (STARTS IMMEDIATELY UNDER SECTION 2 HEADER)
    # =========================================================================
    h_toc = doc.add_heading(level=1)
    h_toc.paragraph_format.space_before = Pt(0)
    h_toc.paragraph_format.space_after = Pt(4)
    r_toc = h_toc.add_run("TABLE OF CONTENTS")
    r_toc.font.name = "Palatino Linotype"
    r_toc.font.size = Pt(13)
    r_toc.font.bold = True
    r_toc.font.color.rgb = RGBColor(30, 58, 138)

    # Dynamic Page Numbers Computed According to Section Layout
    plan_span = len(planning_years)
    page_toc = 2
    page_defs = 3
    page_part1 = 4
    page_part2 = 5
    page_part2_cyber = 6
    page_part2_sys = 7
    page_part2_egov = 8
    page_part3 = 9
    page_part3_cyber = 10
    page_part3_ea = 11
    page_part3_hc = 12
    page_part3_sys = 13
    page_part3_projs = 14
    page_part3_pmf = 15
    page_part4_a = 16
    page_part4_b = 16 + plan_span
    page_annex1 = 17 + plan_span
    page_annex2 = 19 + plan_span

    toc_items = [
        ("DEFINITION OF TERMS", 0, True, str(page_defs)),
        ("PART I. AGENCY PROFILE & STRATEGIC CONTEXT", 0, True, str(page_part1)),
        ("A. Mandate, Vision, Mission, and Organizational Outcome", 1, False, str(page_part1)),
        ("A.1. Mandate", 2, False, str(page_part1)),
        ("A.2. Vision Statement", 2, False, str(page_part1)),
        ("A.3. Mission Statement", 2, False, str(page_part1)),
        ("A.4. Organizational Outcomes", 2, False, str(page_part1)),
        ("B. Organizational Structure", 1, False, str(page_part1)),
        ("B.1. Chief Information Officer (CIO) & ISSP Focal Person", 2, False, str(page_part1)),
        ("B.2. Human Capital", 2, False, str(page_part1)),
        ("C. Stakeholder Analysis", 1, False, str(page_part1)),
        ("PART II. CURRENT ICT ASSESSMENT", 0, True, str(page_part2)),
        ("A. Strategic Concerns for ICT Use", 1, False, str(page_part2)),
        ("B. Existing Network Infrastructure", 1, False, str(page_part2)),
        ("B1. LAN/WAN Set-Up and Connectivity Specifications", 2, False, str(page_part2)),
        ("B2. Cybersecurity Control Checklist", 2, False, str(page_part2_cyber)),
        ("C. Existing / Operational Information Systems (IS) Inventory", 1, False, str(page_part2_sys)),
        ("D. E-Government Programs (EGP) Checklist", 1, False, str(page_part2_egov)),
        ("PART III. PROPOSED ICT STRATEGY", 0, True, str(page_part3)),
        ("A. Proposed Network Infrastructure", 1, False, str(page_part3)),
        ("A.1. LAN/WAN Set-Up and Connectivity Specifications", 2, False, str(page_part3)),
        ("A.2. Cybersecurity Control Checklist", 2, False, str(page_part3_cyber)),
        ("B. Enterprise Architecture", 1, False, str(page_part3_ea)),
        ("C. Proposed ICT Human Capital", 1, False, str(page_part3_hc)),
        ("D. Proposed Information Systems", 1, False, str(page_part3_sys)),
        ("E. ICT Projects Portfolio", 1, True, str(page_part3_projs)),
        ("E.1. Internal ICT Projects", 2, False, str(page_part3_projs)),
        ("E.2. Cross-Agency ICT Projects", 2, False, str(page_part3_projs)),
        ("F. Performance Measurement Framework", 1, True, str(page_part3_pmf)),
        ("F.1. Internal ICT Projects Scorecard", 2, False, str(page_part3_pmf)),
        ("F.2. Cross-Agency ICT Projects Scorecard", 2, False, str(page_part3_pmf)),
    ]

    if pmf_f3:
        toc_items.append(("F.3. Institutional ICT Governance KPIs", 2, False, str(page_part3_pmf)))

    toc_items.extend([
        ("PART IV. RESOURCE REQUIREMENTS", 0, True, str(page_part4_a)),
        ("A. Detailed Resource Deployment and Cost Breakdown", 1, False, str(page_part4_a)),
    ])

    for y_idx, y_val in enumerate(planning_years):
        toc_items.append((f"A.{y_idx + 1}. Year {y_idx + 1} Resource Deployment (FY {y_val})", 2, False, str(page_part4_a + y_idx)))

    toc_items.extend([
        ("B. Summary of Investments", 1, True, str(page_part4_b)),
        ("B.1. General Summary", 2, False, str(page_part4_b)),
        ("B.2. Fund Source", 2, False, str(page_part4_b)),
        ("B.3. Statement of Expenditure", 2, False, str(page_part4_b)),
        ("B.4. Object of Expenditure", 2, False, str(page_part4_b)),
        ("ANNEX 1: EXISTING INFORMATION & COMMUNICATIONS TECHNOLOGY (ICT) ASSET INVENTORY", 0, True, str(page_annex1)),
        ("1. ICT Equipment Inventory", 1, False, str(page_annex1)),
        ("2. ICT Software Inventory", 1, False, str(page_annex1 + 1)),
        ("ANNEX 2: DISASTER RECOVERY & BUSINESS CONTINUITY PLAN (DRBCP) FOR ICT RESOURCES", 0, True, str(page_annex2)),
        ("1. Plan Overview & Disaster Recovery Team", 1, False, str(page_annex2)),
        ("2. Business Impact Analysis (BIA) Summary", 1, False, str(page_annex2)),
        ("3. ICT Component Inventory & Affected Assets", 1, False, str(page_annex2)),
        ("4. Technical Recovery Strategy", 1, False, str(page_annex2)),
        ("5. Standard Operating Procedures (SOP)", 1, False, str(page_annex2)),
        ("6. Compliance, Scalability and Sustainability (MITHI Res. 2025-01)", 1, False, str(page_annex2))
    ])

    outline_tree = get_default_issp_outline(issp_period, len(planning_years))
    outline_settings = (document_composition or {}).get("official_sections", {})

    def sort_outline_settings(nodes):
        nodes[:] = [
            node for _, node in sorted(
                enumerate(nodes),
                key=lambda item: (
                    outline_settings.get(item[1]["key"], {}).get("order")
                    if isinstance(outline_settings.get(item[1]["key"], {}).get("order"), (int, float))
                    else item[0],
                    item[0],
                )
            )
        ]
        for node in nodes:
            sort_outline_settings(node["children"])

    sort_outline_settings(outline_tree)
    outline_nodes = flatten_outline(outline_tree)
    toc_keys = [
        node["key"] for node in outline_nodes
        if node["key"] != "annex2-kpis" and (node["key"] != "part3-f3" or pmf_f3)
    ]
    natural_toc_keys = [
        node["key"] for node in flatten_outline(get_default_issp_outline(issp_period, len(planning_years)))
        if node["key"] != "annex2-kpis" and (node["key"] != "part3-f3" or pmf_f3)
    ]
    toc_row_keys: List[Optional[str]] = []
    if len(toc_keys) == len(toc_items) == len(natural_toc_keys):
        # toc_items are in the default document order; the outline may be reordered.
        toc_item_by_key = dict(zip(natural_toc_keys, toc_items))
        toc_items = [toc_item_by_key[key] for key in toc_keys]
        visible_by_key = {}

        def resolve_toc_settings(nodes, parent_visible=True):
            for node in nodes:
                setting = outline_settings.get(node["key"], {})
                replacement_id = setting.get("replacement_section_id")
                section_visible = parent_visible and (setting.get("visible", True) or bool(replacement_id))
                visible_by_key[node["key"]] = section_visible
                resolve_toc_settings(node["children"], section_visible and not replacement_id)

        resolve_toc_settings(outline_tree)
        configured_toc_items = []
        configured_toc_keys = []
        custom_sections = (document_composition or {}).get("sections", [])
        replacement_ids = {
            setting.get("replacement_section_id")
            for setting in outline_settings.values()
            if setting.get("replacement_section_id")
        }

        def append_custom_toc(section, depth: int, page_ref: str) -> None:
            configured_toc_items.append((
                clean_str(section.get("title"), "Untitled section"),
                min(depth, 3),
                depth == 0,
                page_ref
            ))
            configured_toc_keys.append("custom:" + str(section.get("id")))
            for child in section.get("children", []):
                append_custom_toc(child, depth + 1, page_ref)

        for section_key, item in zip(toc_keys, toc_items):
            if not visible_by_key.get(section_key, True):
                continue
            title, indent_level, is_bold, section_ref = item
            if indent_level == 0:
                for placed in custom_sections:
                    if (
                        placed.get("insert_before_official_key") == section_key
                        and not placed.get("parent_official_key")
                        and placed.get("id") not in replacement_ids
                    ):
                        append_custom_toc(placed, 0, section_ref)
            section_setting = outline_settings.get(section_key, {})
            setting_title = section_setting.get("title")
            replacement_id = section_setting.get("replacement_section_id")
            replacement_section = next((
                section for section in (document_composition or {}).get("sections", [])
                if section.get("id") == replacement_id
            ), None)
            if not setting_title and replacement_section:
                setting_title = replacement_section.get("title")
            if setting_title:
                title = str(setting_title).strip()
            configured_toc_items.append((title, indent_level, is_bold, section_ref))
            configured_toc_keys.append(section_key)
            linked_custom_sections = [
                section for section in custom_sections
                if section.get("parent_official_key") == section_key
                or outline_settings.get(section_key, {}).get("replacement_section_id") == section.get("id")
            ]
            for custom_section in linked_custom_sections:
                append_custom_toc(custom_section, indent_level + 1, section_ref)

        unplaced_sections = [
            section for section in custom_sections
            if not section.get("parent_official_key") and section.get("id") not in replacement_ids
            and not visible_by_key.get(section.get("insert_before_official_key"), False)
        ]
        for section in unplaced_sections:
            append_custom_toc(section, 0, str(page_annex2))
        toc_items = configured_toc_items
        toc_row_keys = configured_toc_keys

    toc_table = doc.add_table(rows=len(toc_items), cols=2)
    toc_table.style = 'Table Grid'
    set_table_borders(toc_table, color="FFFFFF")

    for idx, (title, indent_level, is_bold, section_ref) in enumerate(toc_items):
        row = toc_table.rows[idx]
        prevent_row_split(row)
        c0, c1 = row.cells[0], row.cells[1]
        c0.width = Inches(9.2)
        c1.width = Inches(1.0)
        set_cell_margins(c0, top=8, bottom=8, left=40, right=40)
        set_cell_margins(c1, top=8, bottom=8, left=40, right=40)

        p0 = c0.paragraphs[0]
        p0.paragraph_format.space_before = Pt(0)
        p0.paragraph_format.space_after = Pt(0)
        p0.paragraph_format.left_indent = Inches(indent_level * 0.22)
        run0 = p0.add_run(title)
        run0.font.name = "Palatino Linotype"
        run0.font.size = Pt(8.0 if indent_level == 0 else 7.5)
        run0.font.bold = is_bold
        run0.font.color.rgb = RGBColor(30, 58, 138) if is_bold else RGBColor(15, 23, 42)

        p1 = c1.paragraphs[0]
        p1.paragraph_format.space_before = Pt(0)
        p1.paragraph_format.space_after = Pt(0)
        p1.alignment = WD_ALIGN_PARAGRAPH.RIGHT
        row_key = toc_row_keys[idx] if idx < len(toc_row_keys) else None
        if section_ref:
            if row_key:
                # Real page-number field; Word refreshes it when the document opens.
                bookmark_name = docx_toc_bookmark_name(row_key)
                for step in ("begin", "instr", "separate", "text", "end"):
                    field_run = p1.add_run()
                    field_run.font.name = "Palatino Linotype"
                    field_run.font.size = Pt(7.5)
                    field_run.font.bold = is_bold
                    field_run.font.color.rgb = RGBColor(30, 58, 138) if is_bold else RGBColor(71, 85, 105)
                    if step == "instr":
                        instruction = OxmlElement("w:instrText")
                        instruction.set(qn("xml:space"), "preserve")
                        instruction.text = f" PAGEREF {bookmark_name} \\h "
                        field_run._r.append(instruction)
                    elif step == "text":
                        field_run.text = section_ref
                    else:
                        field_char = OxmlElement("w:fldChar")
                        field_char.set(qn("w:fldCharType"), step)
                        field_run._r.append(field_char)
            else:
                run1 = p1.add_run(section_ref)
                run1.font.name = "Palatino Linotype"
                run1.font.size = Pt(7.5)
                run1.font.bold = is_bold
                run1.font.color.rgb = RGBColor(30, 58, 138) if is_bold else RGBColor(71, 85, 105)

    doc.add_page_break()

    # =========================================================================
    # PRELIMINARY: DEFINITION OF TERMS (GLOSSARY)
    # =========================================================================
    h_defs = doc.add_heading(level=1)
    h_defs.paragraph_format.space_before = Pt(0)
    h_defs.paragraph_format.space_after = Pt(4)
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
    c0.width, c1.width = Inches(2.8), Inches(7.4)
    set_cell_shading(c0, "F1F5F9")
    set_cell_shading(c1, "F1F5F9")
    set_cell_margins(c0, top=60, bottom=60, left=80, right=80)
    set_cell_margins(c1, top=60, bottom=60, left=80, right=80)
    r0 = c0.paragraphs[0].add_run("ACRONYM / KEYWORD")
    r0.font.bold = True
    r0.font.size = Pt(8.5)
    r1 = c1.paragraphs[0].add_run("STATUTORY / OPERATIONAL DEFINITION")
    r1.font.bold = True
    r1.font.size = Pt(8.5)

    for term_title, def_text in sorted(glossary_list, key=lambda x: x[0].lower()):
        row = g_table.add_row()
        prevent_row_split(row)
        cell0, cell1 = row.cells[0], row.cells[1]
        cell0.width, cell1.width = Inches(2.8), Inches(7.4)
        set_cell_margins(cell0, top=40, bottom=40, left=80, right=80)
        set_cell_margins(cell1, top=40, bottom=40, left=80, right=80)
        rg0 = cell0.paragraphs[0].add_run(term_title)
        rg0.font.bold = True
        rg0.font.size = Pt(7.5)
        rg1 = cell1.paragraphs[0].add_run(def_text)
        rg1.font.size = Pt(7.5)

    doc.add_page_break()

    # =========================================================================
    # PART I. AGENCY PROFILE & STRATEGIC CONTEXT
    # =========================================================================
    h1 = doc.add_heading(level=1)
    h1.paragraph_format.space_before = Pt(0)
    h1.paragraph_format.space_after = Pt(4)
    hrun1 = h1.add_run("PART I. AGENCY PROFILE & STRATEGIC CONTEXT")
    hrun1.font.name = "Palatino Linotype"
    hrun1.font.size = Pt(13)
    hrun1.font.bold = True
    hrun1.font.color.rgb = RGBColor(30, 58, 138)

    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(0)
    p.paragraph_format.space_after = Pt(4)
    p.add_run("A. Mandate, Vision, Mission, and Organizational Outcome\n").font.bold = True
    p.add_run("A.1. Mandate:\n").font.bold = True
    p.add_run(f"Legal Basis: {strip_html_tags(narrative.mandate_text or getattr(narrative, 'mandate_html', '')) or 'Enabling law / statutory charter establishing institutional mandate.'}\n")
    p.add_run(f"Functions: {strip_html_tags(narrative.functions) or 'Provide higher professional, technical instructions and deliver responsive community research and frontline public services.'}\n\n")

    p.add_run("A.2. Vision Statement:\n").font.bold = True
    p.add_run(f"{strip_html_tags(narrative.vision_text or getattr(narrative, 'vision_html', '')) or 'A premier institution transforming lives and communities through excellence in education, research, and digital innovation.'}\n\n")

    p.add_run("A.3. Mission Statement:\n").font.bold = True
    p.add_run(f"{strip_html_tags(narrative.mission_text or getattr(narrative, 'mission_html', '')) or 'Produce globally competent professionals and generate responsive technologies to foster sustainable development.'}\n\n")

    p.add_run("A.4. Organizational Outcomes:\n").font.bold = True
    if outcomes:
        for oo in outcomes:
            p_oo = doc.add_paragraph(style='List Bullet')
            p_oo.paragraph_format.space_before = Pt(0)
            p_oo.paragraph_format.space_after = Pt(2)
            title_oo = clean_str(oo.outcome_name or oo.program_name, f"Outcome #{oo.id}")
            r_oo = p_oo.add_run(f"[{oo.type_label}] {title_oo}: ")
            r_oo.font.bold = True
            p_oo.add_run(strip_html_tags(oo.description) or "")
    else:
        doc.add_paragraph("No Organizational Outcomes mapped for this cycle.")

    # B. Leadership & Human Capital
    p_b = doc.add_paragraph()
    p_b.paragraph_format.space_before = Pt(6)
    p_b.paragraph_format.space_after = Pt(2)
    p_b.add_run("B. Organizational Structure\n").font.bold = True
    p_b.add_run("B.1. Chief Information Officer (CIO) & ISSP Focal Person\n").font.bold = True

    cio_tel = clean_str(getattr(narrative, "preparer_tel", None) or getattr(narrative, "cio_contact_no", None), "N/A")
    cio_email_val = clean_str(getattr(narrative, "preparer_email", None) or getattr(narrative, "cio_email", None), "cio@agency.gov.ph")
    cio_pos_val = clean_str(getattr(narrative, "preparer_position", None) or getattr(narrative, "cio_plantilla_position", None), "Chief Information Officer")
    cio_unit_val = clean_str(getattr(narrative, "cio_organizational_unit", None), "ICT Management Office")

    cio_table = doc.add_table(rows=5, cols=2)
    cio_table.style = 'Table Grid'
    set_table_borders(cio_table)
    cio_rows = [
        ("Chief Information Officer (CIO):", cio_name),
        ("Plantilla Position:", cio_pos_val),
        ("Organizational Unit:", cio_unit_val),
        ("Email Address:", cio_email_val),
        ("Contact Telephone:", cio_tel)
    ]
    for idx, (label, val) in enumerate(cio_rows):
        row = cio_table.rows[idx]
        prevent_row_split(row)
        c0, c1 = row.cells[0], row.cells[1]
        c0.width, c1.width = Inches(2.8), Inches(7.4)
        set_cell_shading(c0, "F8FAFC")
        set_cell_margins(c0, top=40, bottom=40, left=80, right=80)
        set_cell_margins(c1, top=40, bottom=40, left=80, right=80)
        c0.paragraphs[0].add_run(label).font.bold = True
        c1.paragraphs[0].add_run(val)

    # Render Alternate Focal Person Card if available
    focal_name = clean_str(getattr(narrative, 'focal_name', None), "")
    if focal_name:
        p_focal = doc.add_paragraph()
        p_focal.paragraph_format.space_before = Pt(4)
        p_focal.paragraph_format.space_after = Pt(2)
        p_focal.add_run("Alternate ISSP Focal Person Profile\n").font.bold = True

        focal_table = doc.add_table(rows=5, cols=2)
        focal_table.style = 'Table Grid'
        set_table_borders(focal_table)
        focal_rows = [
            ("Name of ISSP Focal:", focal_name),
            ("Designated Position:", clean_str(getattr(narrative, 'focal_position', None), "Head, Systems and Infrastructure Administration")),
            ("Organizational Unit:", clean_str(getattr(narrative, 'focal_organizational_unit', None), "ICT Management Service")),
            ("Email Address:", clean_str(getattr(narrative, 'focal_email', None), "focal@agency.gov.ph")),
            ("Contact Number:", clean_str(getattr(narrative, 'focal_contact_no', None), "N/A"))
        ]
        for idx, (label, val) in enumerate(focal_rows):
            row = focal_table.rows[idx]
            prevent_row_split(row)
            c0, c1 = row.cells[0], row.cells[1]
            c0.width, c1.width = Inches(2.8), Inches(7.4)
            set_cell_shading(c0, "F8FAFC")
            set_cell_margins(c0, top=40, bottom=40, left=80, right=80)
            set_cell_margins(c1, top=40, bottom=40, left=80, right=80)
            c0.paragraphs[0].add_run(label).font.bold = True
            c1.paragraphs[0].add_run(val)

    # B.2 Human Capital Staffing Matrix
    p_hc = doc.add_paragraph()
    p_hc.paragraph_format.space_before = Pt(6)
    p_hc.paragraph_format.space_after = Pt(2)
    p_hc.add_run("B.2. Human Capital (Current Personnel)\n").font.bold = True

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
            set_cell_margins(c, top=50, bottom=50, left=80, right=80)
            c.paragraphs[0].add_run(h).font.bold = True

        total_it = sum(getattr(h, "it_positions_count", 0) or 0 for h in hc_current)
        total_non_it = sum(getattr(h, "non_it_positions_count", 0) or 0 for h in hc_current)
        total_male = sum(getattr(h, "male_count", 0) or 0 for h in hc_current)
        total_female = sum(getattr(h, "female_count", 0) or 0 for h in hc_current)

        for h in hc_current:
            r = hc_table.add_row()
            prevent_row_split(r)
            for c_i in range(5):
                set_cell_margins(r.cells[c_i], top=40, bottom=40, left=80, right=80)
            r.cells[0].paragraphs[0].add_run(clean_str(h.employment_status)).font.bold = True
            r.cells[1].paragraphs[0].add_run(str(h.it_positions_count or 0))
            r.cells[2].paragraphs[0].add_run(str(h.non_it_positions_count or 0))
            r.cells[3].paragraphs[0].add_run(str(h.male_count or 0))
            r.cells[4].paragraphs[0].add_run(str(h.female_count or 0))

        r_tot = hc_table.add_row()
        prevent_row_split(r_tot)
        for c_i in range(5):
            set_cell_shading(r_tot.cells[c_i], "E2E8F0")
            set_cell_margins(r_tot.cells[c_i], top=50, bottom=50, left=80, right=80)
        r_tot.cells[0].paragraphs[0].add_run("Grand Total").font.bold = True
        for i, val in enumerate([total_it, total_non_it, total_male, total_female], start=1):
            r_tot.cells[i].paragraphs[0].add_run(str(val)).font.bold = True
    else:
        doc.add_paragraph("Baseline staffing matrix not recorded.")

    # C. Stakeholder Analysis
    p_sh = doc.add_paragraph()
    p_sh.paragraph_format.space_before = Pt(6)
    p_sh.paragraph_format.space_after = Pt(2)
    p_sh.add_run("C. Stakeholder Analysis\n").font.bold = True

    if sh_list:
        sh_table = doc.add_table(rows=1, cols=3)
        sh_table.style = 'Table Grid'
        set_table_borders(sh_table)
        make_header_row_repeat(sh_table.rows[0])
        prevent_row_split(sh_table.rows[0])

        headers_sh = ["Stakeholder Group", "Transaction Processed", "Complexity Level"]
        widths_sh = [Inches(2.6), Inches(5.6), Inches(2.0)]
        for i, h in enumerate(headers_sh):
            c = sh_table.rows[0].cells[i]
            c.width = widths_sh[i]
            set_cell_shading(c, "F1F5F9")
            set_cell_margins(c, top=50, bottom=50, left=80, right=80)
            c.paragraphs[0].add_run(h).font.bold = True

        for s in sh_list:
            r = sh_table.add_row()
            prevent_row_split(r)
            for c_i in range(3):
                set_cell_margins(r.cells[c_i], top=40, bottom=40, left=80, right=80)
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
    h2.paragraph_format.space_before = Pt(0)
    h2.paragraph_format.space_after = Pt(4)
    hrun2 = h2.add_run("PART II. CURRENT ICT ASSESSMENT")
    hrun2.font.name = "Palatino Linotype"
    hrun2.font.size = Pt(13)
    hrun2.font.bold = True
    hrun2.font.color.rgb = RGBColor(30, 58, 138)

    # II.A Strategic Concerns
    p_ca = doc.add_paragraph()
    p_ca.paragraph_format.space_before = Pt(0)
    p_ca.paragraph_format.space_after = Pt(2)
    p_ca.add_run("A. Strategic Concerns for ICT Use (Table II.A)\n").font.bold = True

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
            set_cell_margins(cell, top=50, bottom=50, left=80, right=80)
            r = cell.paragraphs[0].add_run(h)
            r.font.bold = True
            r.font.size = Pt(8.0)

        for c in concerns:
            row = c_table.add_row()
            prevent_row_split(row)
            vals = [clean_str(c.mfo), clean_str(c.critical_system), clean_str(c.problems), clean_str(c.intended_use)]
            for i, v in enumerate(vals):
                cell = row.cells[i]
                cell.width = widths_c[i]
                set_cell_margins(cell, top=40, bottom=40, left=80, right=80)
                cell.paragraphs[0].add_run(v).font.size = Pt(7.5)
    else:
        doc.add_paragraph("No Strategic Concerns registered for this cycle.")

    # II.B Existing Network Infrastructure & Cybersecurity (B1 Text -> B1 Diagram -> B2 Controls)
    p_bnet = doc.add_paragraph()
    p_bnet.paragraph_format.space_before = Pt(6)
    p_bnet.paragraph_format.space_after = Pt(2)
    p_bnet.add_run("B. Existing Network Infrastructure & Cybersecurity Controls\n").font.bold = True

    existing_infra = [n for n in net_list if not getattr(n, "is_proposed", False)]
    if existing_infra:
        p_net = doc.add_paragraph()
        p_net.paragraph_format.space_before = Pt(0)
        p_net.paragraph_format.space_after = Pt(2)
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

    # Render B2 Cybersecurity Control Checklist on Next Page
    doc.add_page_break()
    p_b2 = doc.add_paragraph()
    p_b2.paragraph_format.space_before = Pt(0)
    p_b2.paragraph_format.space_after = Pt(2)
    p_b2.add_run("B2. Cybersecurity Control Checklist (Existing Baseline):\n").font.bold = True
    render_cybersecurity_checklist(doc, cyber_list, is_proposed=False)

    # II.C Existing Information Systems
    doc.add_page_break()
    p_c = doc.add_paragraph()
    p_c.paragraph_format.space_before = Pt(0)
    p_c.paragraph_format.space_after = Pt(2)
    p_c.add_run("C. Existing / Operational Information Systems (Part II.C)\n").font.bold = True

    operational_systems = [s for s in systems if clean_str(getattr(s.status, 'value', s.status)).lower() == "operational"]
    if operational_systems:
        for s in operational_systems:
            render_information_system_card_docx(doc, s, is_proposed=False)
    else:
        doc.add_paragraph("No operational Information Systems cataloged.")

    # II.D E-Government Programs (EGP) Checklist
    doc.add_page_break()
    p_d = doc.add_paragraph()
    p_d.paragraph_format.space_before = Pt(0)
    p_d.paragraph_format.space_after = Pt(2)
    p_d.add_run("D. E-Government Programs (EGP) Checklist (Part II.D)\n").font.bold = True

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
        set_cell_margins(c, top=50, bottom=50, left=80, right=80)
        r = c.paragraphs[0].add_run(eh)
        r.font.bold = True
        r.font.size = Pt(7.5)

    for key, display_label in CANONICAL_EGOV_SPECS:
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
        for c_i in range(3):
            set_cell_margins(row.cells[c_i], top=40, bottom=40, left=80, right=80)
        r0 = row.cells[0].paragraphs[0].add_run(display_label)
        r0.font.bold = True
        r0.font.size = Pt(7.0)

        row.cells[1].paragraphs[0].add_run("[X] Yes" if is_used else "[X] No (Equivalent or Manual)").font.size = Pt(7.0)
        row.cells[2].paragraphs[0].add_run(details_str).font.size = Pt(7.0)

    doc.add_page_break()

    # =========================================================================
    # PART III. PROPOSED ICT STRATEGY
    # =========================================================================
    h3 = doc.add_heading(level=1)
    h3.paragraph_format.space_before = Pt(0)
    h3.paragraph_format.space_after = Pt(4)
    hrun3 = h3.add_run("PART III. PROPOSED ICT STRATEGY")
    hrun3.font.name = "Palatino Linotype"
    hrun3.font.size = Pt(13)
    hrun3.font.bold = True
    hrun3.font.color.rgb = RGBColor(30, 58, 138)

    # III.A Proposed Network Infrastructure
    p_pa = doc.add_paragraph()
    p_pa.paragraph_format.space_before = Pt(0)
    p_pa.paragraph_format.space_after = Pt(2)
    p_pa.add_run("A. Proposed Network Infrastructure & Cyber Defense\n").font.bold = True

    proposed_infra = [n for n in net_list if getattr(n, "is_proposed", False)]
    if proposed_infra:
        p_pnet = doc.add_paragraph()
        p_pnet.paragraph_format.space_before = Pt(0)
        p_pnet.paragraph_format.space_after = Pt(2)
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

    # Render A.2 Cybersecurity Control Checklist on Next Page
    doc.add_page_break()
    p_a2 = doc.add_paragraph()
    p_a2.paragraph_format.space_before = Pt(0)
    p_a2.paragraph_format.space_after = Pt(2)
    p_a2.add_run("A.2. Cybersecurity Control Checklist (Proposed Expansion):\n").font.bold = True
    render_cybersecurity_checklist(doc, cyber_list, is_proposed=True)

    # III.B Enterprise Architecture Narrative & Schematic Box
    doc.add_page_break()
    p_ea = doc.add_paragraph()
    p_ea.paragraph_format.space_before = Pt(0)
    p_ea.paragraph_format.space_after = Pt(2)
    p_ea.add_run("B. Enterprise Architecture (Target Blueprint)\n").font.bold = True

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
    doc.add_page_break()
    p_hc_prop = doc.add_paragraph()
    p_hc_prop.paragraph_format.space_before = Pt(0)
    p_hc_prop.paragraph_format.space_after = Pt(2)
    p_hc_prop.add_run("C. Proposed ICT Human Capital (Staffing Registry)\n").font.bold = True

    if staff_list:
        st_table = doc.add_table(rows=1, cols=3)
        st_table.style = 'Table Grid'
        set_table_borders(st_table)
        make_header_row_repeat(st_table.rows[0])
        prevent_row_split(st_table.rows[0])

        st_table.rows[0].cells[0].paragraphs[0].add_run("Proposed Position Title").font.bold = True
        st_table.rows[0].cells[1].paragraphs[0].add_run("Employment Status").font.bold = True
        st_table.rows[0].cells[2].paragraphs[0].add_run("Target Count").font.bold = True

        for c_i in range(3):
            set_cell_margins(st_table.rows[0].cells[c_i], top=50, bottom=50, left=80, right=80)
            set_cell_shading(st_table.rows[0].cells[c_i], "F1F5F9")

        total_staff_count = sum(getattr(st, "count", 1) or 1 for st in staff_list)

        for st in staff_list:
            r = st_table.add_row()
            prevent_row_split(r)
            for c_i in range(3):
                set_cell_margins(r.cells[c_i], top=40, bottom=40, left=80, right=80)
            r.cells[0].paragraphs[0].add_run(clean_str(st.position_title)).font.bold = True
            r.cells[1].paragraphs[0].add_run(clean_str(st.status))
            r.cells[2].paragraphs[0].add_run(str(st.count or 1))

        r_tot = st_table.add_row()
        prevent_row_split(r_tot)
        for c_i in range(3):
            set_cell_shading(r_tot.cells[c_i], "E2E8F0")
            set_cell_margins(r_tot.cells[c_i], top=50, bottom=50, left=80, right=80)
        r_tot.cells[0].paragraphs[0].add_run("Grand Total").font.bold = True
        r_tot.cells[2].paragraphs[0].add_run(str(total_staff_count)).font.bold = True
    else:
        doc.add_paragraph("Proposed staffing targets documented in administrative HR registry.")

    # III.D Proposed Information Systems
    doc.add_page_break()
    p_prop_sys = doc.add_paragraph()
    p_prop_sys.paragraph_format.space_before = Pt(0)
    p_prop_sys.paragraph_format.space_after = Pt(2)
    p_prop_sys.add_run("D. Proposed Information Systems & Major Enhancements (Table III.D)\n").font.bold = True

    proposed_systems = [s for s in systems if clean_str(getattr(s.status, 'value', s.status)).lower() != "operational"]
    if proposed_systems:
        for s in proposed_systems:
            render_information_system_card_docx(doc, s, is_proposed=True, projects=projects)
    else:
        doc.add_paragraph("No proposed Information Systems logged for this cycle.")

    # III.E Strategic ICT Projects Portfolio
    doc.add_page_break()
    p_proj = doc.add_paragraph()
    p_proj.paragraph_format.space_before = Pt(0)
    p_proj.paragraph_format.space_after = Pt(2)
    p_proj.add_run("E. Strategic ICT Projects Portfolio (Table III.E)\n").font.bold = True

    p_e1 = doc.add_paragraph()
    p_e1.paragraph_format.space_before = Pt(2)
    p_e1.paragraph_format.space_after = Pt(2)
    r_e1 = p_e1.add_run("E.1. Internal ICT Projects Portfolio")
    r_e1.font.bold = True
    r_e1.font.size = Pt(9.5)
    r_e1.font.color.rgb = RGBColor(30, 58, 138)

    if internal_projects:
        for pr in internal_projects:
            render_project_charter_card(doc, pr, is_cross=False, planning_years=planning_years)
    else:
        doc.add_paragraph("No internal ICT projects registered for this cycle.")

    p_e2 = doc.add_paragraph()
    p_e2.paragraph_format.space_before = Pt(4)
    p_e2.paragraph_format.space_after = Pt(2)
    r_e2 = p_e2.add_run("E.2. Cross-Agency ICT Projects Portfolio")
    r_e2.font.bold = True
    r_e2.font.size = Pt(9.5)
    r_e2.font.color.rgb = RGBColor(30, 58, 138)

    if cross_projects:
        for pr in cross_projects:
            render_project_charter_card(doc, pr, is_cross=True, planning_years=planning_years)
    else:
        doc.add_paragraph("No cross-agency ICT projects registered for this cycle.")

    # III.F Performance Measurement Framework (PMF Scorecard)
    doc.add_page_break()
    p_pmf = doc.add_paragraph()
    p_pmf.paragraph_format.space_before = Pt(0)
    p_pmf.paragraph_format.space_after = Pt(2)
    p_pmf.add_run("F. Performance Measurement Framework (PMF Scorecard)\n").font.bold = True

    def render_pmf_subtable(metrics_subset: List[Any], subheader: str):
        p_sub = doc.add_paragraph()
        p_sub.paragraph_format.space_before = Pt(4)
        p_sub.paragraph_format.space_after = Pt(2)
        r_sub = p_sub.add_run(subheader)
        r_sub.font.bold = True
        r_sub.font.size = Pt(8.5)
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
            set_cell_margins(cell, top=50, bottom=50, left=60, right=60)
            r = cell.paragraphs[0].add_run(h)
            r.font.bold = True
            r.font.size = Pt(7.5)

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
                set_cell_margins(cell, top=40, bottom=40, left=60, right=60)
                r = cell.paragraphs[0].add_run(v)
                r.font.size = Pt(7.0)
                if i in [3, 4]:
                    cell.paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.CENTER

    render_pmf_subtable(pmf_f1, "F.1. Internal ICT Projects Scorecard")
    render_pmf_subtable(pmf_f2, "F.2. Cross-Agency ICT Projects Scorecard")
    if pmf_f3:
        render_pmf_subtable(pmf_f3, "F.3. Institutional ICT Governance KPIs")

    doc.add_page_break()

    # =========================================================================
    # PART IV. RESOURCE REQUIREMENTS & FOUR-WAY PARITY
    # =========================================================================
    h4 = doc.add_heading(level=1)
    h4.paragraph_format.space_before = Pt(0)
    h4.paragraph_format.space_after = Pt(4)
    hrun4 = h4.add_run("PART IV. RESOURCE REQUIREMENTS & SUMMARY OF INVESTMENTS")
    hrun4.font.name = "Palatino Linotype"
    hrun4.font.size = Pt(13)
    hrun4.font.bold = True
    hrun4.font.color.rgb = RGBColor(30, 58, 138)

    # IV.A Resource Deployments
    p_iv_a = doc.add_paragraph()
    p_iv_a.paragraph_format.space_before = Pt(0)
    p_iv_a.paragraph_format.space_after = Pt(2)
    p_iv_a.add_run("A. Detailed Resource Deployment and Cost Breakdown (Part IV.A)\n").font.bold = True

    raw_items = items or []
    prop_items = []
    for itm in raw_items:
        if getattr(itm, "is_archived", False):
            continue
        status_str = clean_str(getattr(itm, "status", "")).lower()
        if status_str and status_str not in ["approved", "submitted"]:
            continue
        # Strict rule: All proposals must be bound to an ICT Project
        if getattr(itm, "project_id", None) is None:
            continue
        prop_items.append(itm)

    # Defensively ensure any approved systems with proposed_cost > 0 bound to a project are represented
    existing_sys_ids = {str(getattr(itm, "system_id", "")).lower() for itm in prop_items if getattr(itm, "system_id", None)}
    existing_prop_names = {clean_str(getattr(itm, "item_name", "")).lower() for itm in prop_items}
    for s in (systems or []):
        sub_status = clean_str(getattr(s, "submission_status", "Approved")).lower()
        cost_val = Decimal(str(getattr(s, "proposed_cost", 0) or 0))
        p_id = getattr(s, "project_id", None)
        s_id_str = str(s.id).lower()
        s_name_clean = clean_str(s.name).lower()

        if (
            sub_status == "approved" 
            and cost_val > Decimal("0.00") 
            and p_id 
            and s_id_str not in existing_sys_ids
            and f"system development: {s_name_clean}" not in existing_prop_names
            and f"system enhancement: {s_name_clean}" not in existing_prop_names
            and s_name_clean not in existing_prop_names
        ):
            t_year = getattr(s, "target_year", None) or start_year
            t_idx = t_year - start_year + 1
            if t_idx < 1: t_idx = 1
            
            p_obj = proj_lookup.get(str(p_id))
            strat_cat = clean_str(getattr(p_obj, "project_category", "Internal ICT Projects")) if p_obj else "Internal ICT Projects"
            f_source = clean_str(getattr(p_obj, "funding_source", "General Appropriations Act (GAA)")) if p_obj else "General Appropriations Act (GAA)"

            class SyntheticSystemProposal:
                def __init__(self, sys, cost, t_yr, t_i, strat, fund, prj):
                    self.id = sys.id
                    self.system_id = sys.id
                    self.project_id = prj.id if prj else None
                    self.project_rel = prj
                    sys_st = clean_str(getattr(sys, "status", "For Development"))
                    prefix = "System Enhancement" if "enhancement" in sys_st.lower() else "System Development"
                    self.item_name = f"{prefix}: {clean_str(sys.name)}"
                    self.category = "Software"
                    self.strategic_category = strat
                    self.fund_source = fund
                    self.office_location = clean_str(getattr(sys, "system_owner_office", "Central Office"))
                    self.target_office_automated = self.office_location
                    self.unit_cost = cost
                    self.total_cost = cost
                    self.total_qty = 1
                    self.status = "Approved"
                    self.is_archived = False
                    self.uacs_object_code = getattr(sys, "uacs_object_code", None) or ("50604070 01 - ICT Software (Perpetual CO)" if cost >= Decimal("50000.00") else "50211030 00 - Consulting/Outsourced Development (MOOE)")
                    self.expenditure_class = getattr(sys, "expenditure_class", None) or ("Capital Outlay" if "(CO)" in self.uacs_object_code else "Maintenance and Other Operating Expenses")
                    self.yearly_quantities = {str(t_yr): 1, f"Year {t_i}": 1}
                    self.year_1_qty = 1 if t_i == 1 else 0
                    self.year_2_qty = 1 if t_i == 2 else 0
                    self.year_3_qty = 1 if t_i == 3 else 0

            synth = SyntheticSystemProposal(s, cost_val, t_year, t_idx, strat_cat, f_source, p_obj)
            prop_items.append(synth)
            existing_sys_ids.add(s_id_str)
            existing_prop_names.add(synth.item_name.lower())

    # Dynamically determine categories list from strategic categories or defaults
    canonical_categories = [
        ("Office Productivity", False),
        ("Internal ICT Projects", True),
        ("Cross-Agency ICT Projects", True),
        ("Continuing Costs/Expenses", False)
    ]

    active_categories_list = []
    if db_session:
        try:
            from app.database.models import StrategicCategory
            db_cats = db_session.query(StrategicCategory).filter(
                StrategicCategory.is_active == True
            ).order_by(StrategicCategory.order_index.asc()).all()
            for c in db_cats:
                active_categories_list.append((c.name, bool(c.is_project_linked)))
        except Exception:
            pass

    if not active_categories_list:
        active_categories_list = list(canonical_categories)

    # Preserve all categories present on active line items without dropping custom ones
    seen_cats = {normalize_category_name(c[0]).lower() for c in active_categories_list}
    for itm in prop_items:
        resolved_c = resolve_proposal_category(itm, proj_lookup)
        if resolved_c and normalize_category_name(resolved_c).lower() not in seen_cats:
            seen_cats.add(normalize_category_name(resolved_c).lower())
            active_categories_list.append((resolved_c, True))

    for yr_idx, yr in enumerate(planning_years):
        if yr_idx > 0:
            doc.add_page_break()

        p_yr = doc.add_paragraph()
        p_yr.paragraph_format.space_before = Pt(2)
        p_yr.paragraph_format.space_after = Pt(2)
        p_yr.add_run(f"A.{yr_idx + 1}. [YEAR #{yr_idx + 1}] (FY {yr})\n").font.bold = True

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
            set_cell_margins(cell, top=50, bottom=50, left=60, right=60)
            r = cell.paragraphs[0].add_run(h)
            r.font.bold = True
            r.font.size = Pt(7.5)

        total_yr_cost = Decimal("0.00")

        year_cat_items = {}
        for cat_name, is_proj_linked in active_categories_list:
            matched_items = []
            for itm in prop_items:
                strat_name = normalize_category_name(resolve_proposal_category(itm, proj_lookup)).lower()
                is_match = (normalize_category_name(cat_name).lower() == strat_name)

                if is_match:
                    q_map = itm.yearly_quantities or {}
                    if isinstance(q_map, str):
                        try: q_map = json.loads(q_map)
                        except Exception: q_map = {}

                    qty = None
                    for candidate_key in [str(yr), yr, f"Year {yr_idx + 1}", f"year {yr_idx + 1}", f"Year{yr_idx + 1}", f"year_{yr_idx + 1}", str(yr_idx + 1)]:
                        if candidate_key in q_map and q_map[candidate_key] is not None:
                            qty = q_map[candidate_key]
                            break

                    if qty is None:
                        if yr_idx == 0: qty = getattr(itm, "year_1_qty", 0) or 0
                        elif yr_idx == 1: qty = getattr(itm, "year_2_qty", 0) or 0
                        elif yr_idx == 2: qty = getattr(itm, "year_3_qty", 0) or 0
                        else: qty = 0

                    try: qty_int = int(qty)
                    except Exception: qty_int = 0

                    if qty_int > 0:
                        matched_items.append((itm, qty_int))

            if matched_items:
                year_cat_items[cat_name] = (is_proj_linked, matched_items)

        for cat_name, (is_proj_linked, cat_items) in year_cat_items.items():
            cat_subtotal = Decimal("0.00")
            for itm, q in cat_items:
                u_cost = Decimal(str(itm.unit_cost or 0))
                adj_unit = get_adjusted_unit_cost_for_year(db_session, u_cost, yr, start_year)
                cat_subtotal += Decimal(q) * adj_unit

            r_cat = iv_a_table.add_row()
            prevent_row_split(r_cat)
            for c_i in range(6):
                set_cell_shading(r_cat.cells[c_i], "E2E8F0")
                set_cell_margins(r_cat.cells[c_i], top=40, bottom=40, left=60, right=60)
            r_cat.cells[0].paragraphs[0].add_run(cat_name.upper()).font.bold = True
            r_cat.cells[5].paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.RIGHT
            r_cat.cells[5].paragraphs[0].add_run(fmt_currency(cat_subtotal)).font.bold = True

            if is_proj_linked:
                # Group items by their parent project
                project_groups = {}
                for itm, q in cat_items:
                    pid = str(itm.project_id) if itm.project_id else "unassigned"
                    if pid not in project_groups:
                        p_obj = proj_lookup.get(pid) if pid != "unassigned" else None
                        p_title = clean_str(getattr(p_obj, "project_title", None)) or (f"Project #{pid[:8]}" if pid != "unassigned" else "General Project Outlays")
                        project_groups[pid] = (p_title, [])
                    project_groups[pid][1].append((itm, q))

                for pid, (p_title, p_items) in project_groups.items():
                    p_subtotal = sum(
                        Decimal(q) * get_adjusted_unit_cost_for_year(db_session, Decimal(str(itm.unit_cost or 0)), yr, start_year)
                        for itm, q in p_items
                    )

                    r_proj = iv_a_table.add_row()
                    prevent_row_split(r_proj)
                    for c_i in range(6):
                        set_cell_shading(r_proj.cells[c_i], "F1F5F9")
                        set_cell_margins(r_proj.cells[c_i], top=35, bottom=35, left=60, right=60)
                    r_proj.cells[0].paragraphs[0].paragraph_format.left_indent = Inches(0.12)
                    run_pr = r_proj.cells[0].paragraphs[0].add_run(f"[{p_title.upper()}]")
                    run_pr.font.bold = True
                    run_pr.font.size = Pt(7.2)
                    run_pr.font.color.rgb = RGBColor(30, 58, 138)
                    r_proj.cells[5].paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.RIGHT
                    run_pr_tot = r_proj.cells[5].paragraphs[0].add_run(fmt_currency(p_subtotal))
                    run_pr_tot.font.bold = True
                    run_pr_tot.font.size = Pt(7.2)

                    for exp_class_name in ["Capital Outlay", "Maintenance and Other Operating Expenses"]:
                        is_co_target = "capital" in exp_class_name.lower()
                        exp_items = [
                            (itm, q) for itm, q in p_items
                            if ("capital" in clean_str(getattr(itm, "expenditure_class", "")).lower()) == is_co_target
                        ]
                        if not exp_items:
                            continue

                        exp_subtotal = sum(
                            Decimal(q) * get_adjusted_unit_cost_for_year(db_session, Decimal(str(itm.unit_cost or 0)), yr, start_year)
                            for itm, q in exp_items
                        )

                        r_exp = iv_a_table.add_row()
                        prevent_row_split(r_exp)
                        for c_i in range(6):
                            set_cell_shading(r_exp.cells[c_i], "F8FAFC")
                            set_cell_margins(r_exp.cells[c_i], top=30, bottom=30, left=60, right=60)
                        r_exp.cells[0].paragraphs[0].paragraph_format.left_indent = Inches(0.22)
                        run_exp = r_exp.cells[0].paragraphs[0].add_run(exp_class_name.upper())
                        run_exp.font.bold = True
                        run_exp.font.size = Pt(7.0)
                        r_exp.cells[5].paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.RIGHT
                        run_exp_tot = r_exp.cells[5].paragraphs[0].add_run(fmt_currency(exp_subtotal))
                        run_exp_tot.font.bold = True
                        run_exp_tot.font.size = Pt(7.0)

                        for itm, qty_int in exp_items:
                            u_cost = Decimal(str(itm.unit_cost or 0))
                            adj_unit = get_adjusted_unit_cost_for_year(db_session, u_cost, yr, start_year)
                            line_cost = Decimal(qty_int) * adj_unit
                            total_yr_cost += line_cost

                            proj = getattr(itm, "project_rel", None)
                            if not proj and getattr(itm, "project_id", None):
                                proj = proj_lookup.get(str(itm.project_id))
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
                                set_cell_margins(cell, top=30, bottom=30, left=60, right=60)
                                p_cell = cell.paragraphs[0]
                                p_cell.paragraph_format.space_before = Pt(0)
                                p_cell.paragraph_format.space_after = Pt(0)
                                if i == 0:
                                    p_cell.paragraph_format.left_indent = Inches(0.32)
                                r = p_cell.add_run(v)
                                r.font.size = Pt(7.0)
                                if i in [3, 5]:
                                    p_cell.alignment = WD_ALIGN_PARAGRAPH.RIGHT
                                elif i == 4:
                                    p_cell.alignment = WD_ALIGN_PARAGRAPH.CENTER
            else:
                # Non-project-linked categories
                for exp_class_name in ["Capital Outlay", "Maintenance and Other Operating Expenses"]:
                    is_co_target = "capital" in exp_class_name.lower()
                    exp_items = [
                        (itm, q) for itm, q in cat_items
                        if ("capital" in clean_str(getattr(itm, "expenditure_class", "")).lower()) == is_co_target
                    ]
                    if not exp_items:
                        continue

                    exp_subtotal = sum(
                        Decimal(q) * get_adjusted_unit_cost_for_year(db_session, Decimal(str(itm.unit_cost or 0)), yr, start_year)
                        for itm, q in exp_items
                    )

                    r_exp = iv_a_table.add_row()
                    prevent_row_split(r_exp)
                    for c_i in range(6):
                        set_cell_shading(r_exp.cells[c_i], "F8FAFC")
                        set_cell_margins(r_exp.cells[c_i], top=30, bottom=30, left=60, right=60)
                    r_exp.cells[0].paragraphs[0].paragraph_format.left_indent = Inches(0.15)
                    run_exp = r_exp.cells[0].paragraphs[0].add_run(exp_class_name.upper())
                    run_exp.font.bold = True
                    run_exp.font.size = Pt(7.0)
                    r_exp.cells[5].paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.RIGHT
                    run_exp_tot = r_exp.cells[5].paragraphs[0].add_run(fmt_currency(exp_subtotal))
                    run_exp_tot.font.bold = True
                    run_exp_tot.font.size = Pt(7.0)

                    for itm, qty_int in exp_items:
                        u_cost = Decimal(str(itm.unit_cost or 0))
                        adj_unit = get_adjusted_unit_cost_for_year(db_session, u_cost, yr, start_year)
                        line_cost = Decimal(qty_int) * adj_unit
                        total_yr_cost += line_cost

                        proj = getattr(itm, "project_rel", None)
                        if not proj and getattr(itm, "project_id", None):
                            proj = proj_lookup.get(str(itm.project_id))
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
                            set_cell_margins(cell, top=30, bottom=30, left=60, right=60)
                            p_cell = cell.paragraphs[0]
                            p_cell.paragraph_format.space_before = Pt(0)
                            p_cell.paragraph_format.space_after = Pt(0)
                            if i == 0:
                                p_cell.paragraph_format.left_indent = Inches(0.25)
                            r = p_cell.add_run(v)
                            r.font.size = Pt(7.0)
                            if i in [3, 5]:
                                p_cell.alignment = WD_ALIGN_PARAGRAPH.RIGHT
                            elif i == 4:
                                p_cell.alignment = WD_ALIGN_PARAGRAPH.CENTER

        gr_row = iv_a_table.add_row()
        prevent_row_split(gr_row)
        for i in range(6):
            set_cell_shading(gr_row.cells[i], "E2E8F0")
            set_cell_margins(gr_row.cells[i], top=40, bottom=40, left=60, right=60)
        gr_row.cells[0].paragraphs[0].add_run(f"GRAND TOTAL (FY {yr})").font.bold = True

        last_cell = gr_row.cells[5]
        last_cell.paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.RIGHT
        r_tot = last_cell.paragraphs[0].add_run(fmt_currency(total_yr_cost))
        r_tot.font.bold = True

        p_note = doc.add_paragraph()
        p_note.paragraph_format.space_before = Pt(2)
        p_note.paragraph_format.space_after = Pt(4)
        r_fn = p_note.add_run(f"*All costs indicated in this section are based on market research conducted by {agency_name} (inclusive of administrative inflation buffer adjustments).")
        r_fn.font.size = Pt(6.5)
        r_fn.font.italic = True
        r_fn.font.color.rgb = RGBColor(100, 116, 139)

    doc.add_page_break()

    # IV.B Four-Way Parity Tables B.1 to B.4
    p_bhead = doc.add_paragraph()
    p_bhead.paragraph_format.space_before = Pt(0)
    p_bhead.paragraph_format.space_after = Pt(2)
    p_bhead.add_run("B. Summary of Investments (Four-Way Parity Matrices)\n").font.bold = True

    p_data = parity_data
    if not p_data and db_session:
        try:
            p_data = calculate_financial_summaries(db_session, issp_period, only_approved=True)
        except Exception as p_err:
            logger.debug(f"Parity calculation in docx generator note: {p_err}")
    if not p_data:
        p_data = {}

    year_cols = p_data.get("year_columns", [f"FY {y}" for y in planning_years])

    tables_to_render = [
        ("B.1. GENERAL SUMMARY (BY STRATEGIC PROCUREMENT CATEGORY)", p_data.get("b1_general_summary", {}), "Category / Spending Bucket"),
        ("B.2. FINANCING SOURCE SUMMARY", p_data.get("b2_fund_source", {}), "Funding Source"),
        ("B.3. STATEMENT OF EXPENDITURE (CAPEX VS. MOOE)", p_data.get("b3_statement_of_expenditure", {}), "Expenditure Class"),
        ("B.4. OBJECT OF EXPENDITURE (UACS ACCOUNT LEDGER)", p_data.get("b4_object_of_expenditure", {}), "UACS Account Title")
    ]

    total_col_header = f"{len(planning_years)}-Year Total (PHP)" if len(planning_years) > 0 else "Total Outlay"

    for title_mat, matrix_dict, col_label in tables_to_render:
        p_t = doc.add_paragraph()
        p_t.paragraph_format.space_before = Pt(4)
        p_t.paragraph_format.space_after = Pt(2)
        r_t = p_t.add_run(f"{title_mat}\n")
        r_t.font.bold = True
        r_t.font.size = Pt(8.5)
        r_t.font.color.rgb = RGBColor(30, 58, 138)

        if matrix_dict:
            cols_count = len(year_cols) + 2
            m_table = doc.add_table(rows=1, cols=cols_count)
            m_table.style = 'Table Grid'
            set_table_borders(m_table)
            make_header_row_repeat(m_table.rows[0])
            prevent_row_split(m_table.rows[0])

            hdr_cells = m_table.rows[0].cells
            hdr_cells[0].text = col_label
            set_cell_shading(hdr_cells[0], "F1F5F9")
            set_cell_margins(hdr_cells[0], top=40, bottom=40, left=60, right=60)
            hdr_cells[0].paragraphs[0].runs[0].font.bold = True
            hdr_cells[0].paragraphs[0].runs[0].font.size = Pt(7.5)

            for i, y_col in enumerate(year_cols):
                hdr_cells[i + 1].text = y_col
                set_cell_shading(hdr_cells[i + 1], "F1F5F9")
                set_cell_margins(hdr_cells[i + 1], top=40, bottom=40, left=60, right=60)
                hdr_cells[i + 1].paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.RIGHT
                hdr_cells[i + 1].paragraphs[0].runs[0].font.bold = True
                hdr_cells[i + 1].paragraphs[0].runs[0].font.size = Pt(7.5)

            hdr_cells[-1].text = total_col_header
            set_cell_shading(hdr_cells[-1], "F1F5F9")
            set_cell_margins(hdr_cells[-1], top=40, bottom=40, left=60, right=60)
            hdr_cells[-1].paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.RIGHT
            hdr_cells[-1].paragraphs[0].runs[0].font.bold = True
            hdr_cells[-1].paragraphs[0].runs[0].font.size = Pt(7.5)

            for cat_name, row_vals in matrix_dict.items():
                is_grand = (cat_name.upper() == "GRAND TOTAL")
                row_cells = m_table.add_row().cells
                prevent_row_split(m_table.rows[-1])

                display_title = clean_uacs_title(cat_name) if "B.4" in title_mat else cat_name
                row_cells[0].text = display_title
                row_cells[0].paragraphs[0].runs[0].font.size = Pt(7.0)
                set_cell_margins(row_cells[0], top=35, bottom=35, left=60, right=60)
                if is_grand:
                    set_cell_shading(row_cells[0], "E2E8F0")
                    row_cells[0].paragraphs[0].runs[0].font.bold = True

                for idx, y_col in enumerate(year_cols):
                    amount = Decimal(str(row_vals.get(y_col, row_vals.get(y_col.replace("FY ", ""), 0.0))))
                    row_cells[idx + 1].text = fmt_currency(amount)
                    row_cells[idx + 1].paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.RIGHT
                    row_cells[idx + 1].paragraphs[0].runs[0].font.size = Pt(7.0)
                    set_cell_margins(row_cells[idx + 1], top=35, bottom=35, left=60, right=60)
                    if is_grand:
                        set_cell_shading(row_cells[idx + 1], "E2E8F0")
                        row_cells[idx + 1].paragraphs[0].runs[0].font.bold = True

                tot = Decimal(str(row_vals.get("Total", row_vals.get("total", 0.0))))
                row_cells[-1].text = fmt_currency(tot)
                row_cells[-1].paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.RIGHT
                row_cells[-1].paragraphs[0].runs[0].font.size = Pt(7.0)
                set_cell_margins(row_cells[-1], top=35, bottom=35, left=60, right=60)
                if is_grand:
                    set_cell_shading(row_cells[-1], "E2E8F0")
                    row_cells[idx + 1].paragraphs[0].runs[0].font.bold = True
        else:
            doc.add_paragraph("Table matrix not generated.")

    p_cert = doc.add_paragraph()
    p_cert.paragraph_format.space_before = Pt(4)
    p_cert.paragraph_format.space_after = Pt(4)
    r_cert = p_cert.add_run(f"★ FOUR-WAY PARITY CERTIFIED: Certified Grand Total = {fmt_currency(p_data.get('certified_grand_total', 0))} ★\n")
    r_cert.font.bold = True
    r_cert.font.size = Pt(8.5)
    r_cert.font.color.rgb = RGBColor(5, 150, 105)

    doc.add_page_break()

    # =========================================================================
    # ANNEX 1: MASTER ASSET INVENTORY (EQUIPMENT & SOFTWARE)
    # =========================================================================
    h5 = doc.add_heading(level=1)
    h5.paragraph_format.space_before = Pt(0)
    h5.paragraph_format.space_after = Pt(4)
    hrun5 = h5.add_run("ANNEX 1: EXISTING INFORMATION & COMMUNICATIONS TECHNOLOGY (ICT) ASSET INVENTORY")
    hrun5.font.name = "Palatino Linotype"
    hrun5.font.size = Pt(13)
    hrun5.font.bold = True
    hrun5.font.color.rgb = RGBColor(30, 58, 138)

    inv_items = inventory or []

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

    p_a1 = doc.add_paragraph()
    p_a1.paragraph_format.space_before = Pt(0)
    p_a1.paragraph_format.space_after = Pt(2)
    p_a1.add_run("1. ICT Equipment Inventory (Central vs. Field Offices)\n").font.bold = True

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
        set_cell_margins(c, top=40, bottom=40, left=60, right=60)
        c.paragraphs[0].add_run(h).font.bold = True

    eq_categories = [
        "Servers", 
        "Desktop", 
        "Laptop", 
        "Mobile Phone", 
        "Tablet", 
        "Printer", 
        "Network Switch", 
        "Others, please specify"
    ]
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

        r_c = eq_table.add_row()
        prevent_row_split(r_c)
        for c_i in range(5):
            set_cell_margins(r_c.cells[c_i], top=30, bottom=30, left=60, right=60)
        r_c.cells[0].paragraphs[0].add_run(cat).font.bold = True
        r_c.cells[1].paragraphs[0].add_run("Central Office")
        r_c.cells[2].paragraphs[0].add_run(str(cOps))
        r_c.cells[3].paragraphs[0].add_run(str(cEol))
        r_c.cells[4].paragraphs[0].add_run(str(cBak))

        r_f = eq_table.add_row()
        prevent_row_split(r_f)
        for c_i in range(5):
            set_cell_margins(r_f.cells[c_i], top=30, bottom=30, left=60, right=60)
        r_f.cells[1].paragraphs[0].add_run("Field/Regional Office")
        r_f.cells[2].paragraphs[0].add_run(str(fOps))
        r_f.cells[3].paragraphs[0].add_run(str(fEol))
        r_f.cells[4].paragraphs[0].add_run(str(fBak))

        r_sub = eq_table.add_row()
        prevent_row_split(r_sub)
        for c_i in range(5):
            set_cell_margins(r_sub.cells[c_i], top=30, bottom=30, left=60, right=60)
            set_cell_shading(r_sub.cells[c_i], "F8FAFC")
        r_sub.cells[1].paragraphs[0].add_run("Subtotal").font.bold = True
        r_sub.cells[2].paragraphs[0].add_run(str(cOps + fOps)).font.bold = True
        r_sub.cells[3].paragraphs[0].add_run(str(cEol + fEol)).font.bold = True
        r_sub.cells[4].paragraphs[0].add_run(str(cBak + fBak)).font.bold = True

    r_eq_tot = eq_table.add_row()
    prevent_row_split(r_eq_tot)
    for c_i in range(5):
        set_cell_shading(r_eq_tot.cells[c_i], "E2E8F0")
        set_cell_margins(r_eq_tot.cells[c_i], top=40, bottom=40, left=60, right=60)
    r_eq_tot.cells[0].paragraphs[0].add_run("GRAND TOTAL (EQUIPMENT)").font.bold = True
    r_eq_tot.cells[1].paragraphs[0].add_run("All Locations").font.bold = True
    r_eq_tot.cells[2].paragraphs[0].add_run(str(tot_c_ops + tot_f_ops)).font.bold = True
    r_eq_tot.cells[3].paragraphs[0].add_run(str(tot_c_eol + tot_f_eol)).font.bold = True
    r_eq_tot.cells[4].paragraphs[0].add_run(str(tot_c_bak + tot_f_bak)).font.bold = True

    # Dedicated Section Break: Ensures 2. ICT Software Inventory starts on page_annex1 + 1
    doc.add_page_break()

    p_a2 = doc.add_paragraph()
    p_a2.paragraph_format.space_before = Pt(6)
    p_a2.paragraph_format.space_after = Pt(2)
    p_a2.add_run("2. ICT Software Inventory (Perpetual vs. Subscription)\n").font.bold = True

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
        set_cell_margins(c, top=40, bottom=40, left=60, right=60)
        c.paragraphs[0].add_run(h).font.bold = True

    sw_categories = [
        "Office Productivity Tool", 
        "Grammar checker", 
        "Graphics and Simulation Software", 
        "Antivirus", 
        "IT Help Desk Tool", 
        "Photo and Video Editing Software",
        "Web Application Firewall",
        "Others, please specify"
    ]
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

        r_sc = sw_table.add_row()
        prevent_row_split(r_sc)
        for c_i in range(4):
            set_cell_margins(r_sc.cells[c_i], top=30, bottom=30, left=60, right=60)
        r_sc.cells[0].paragraphs[0].add_run(scat).font.bold = True
        r_sc.cells[1].paragraphs[0].add_run("Central Office")
        r_sc.cells[2].paragraphs[0].add_run(str(cPerp))
        r_sc.cells[3].paragraphs[0].add_run(str(cSub))

        r_sf = sw_table.add_row()
        prevent_row_split(r_sf)
        for c_i in range(4):
            set_cell_margins(r_sf.cells[c_i], top=30, bottom=30, left=60, right=60)
        r_sf.cells[1].paragraphs[0].add_run("Field/Regional Office")
        r_sf.cells[2].paragraphs[0].add_run(str(fPerp))
        r_sf.cells[3].paragraphs[0].add_run(str(fSub))

        r_ssub = sw_table.add_row()
        prevent_row_split(r_ssub)
        for c_i in range(4):
            set_cell_margins(r_ssub.cells[c_i], top=30, bottom=30, left=60, right=60)
            set_cell_shading(r_ssub.cells[c_i], "F8FAFC")
        r_ssub.cells[1].paragraphs[0].add_run("Subtotal").font.bold = True
        r_ssub.cells[2].paragraphs[0].add_run(str(cPerp + fPerp)).font.bold = True
        r_ssub.cells[3].paragraphs[0].add_run(str(cSub + fSub)).font.bold = True

    r_sw_tot = sw_table.add_row()
    prevent_row_split(r_sw_tot)
    for c_i in range(4):
        set_cell_shading(r_sw_tot.cells[c_i], "E2E8F0")
        set_cell_margins(r_sw_tot.cells[c_i], top=40, bottom=40, left=60, right=60)
    r_sw_tot.cells[0].paragraphs[0].add_run("GRAND TOTAL (SOFTWARE)").font.bold = True
    r_sw_tot.cells[1].paragraphs[0].add_run("All Locations").font.bold = True
    r_sw_tot.cells[2].paragraphs[0].add_run(str(tot_c_perp + tot_f_perp)).font.bold = True
    r_sw_tot.cells[3].paragraphs[0].add_run(str(tot_c_sub + tot_f_sub)).font.bold = True

    doc.add_page_break()

    # =========================================================================
    # ANNEX 2: DISASTER RECOVERY & BUSINESS CONTINUITY PLAN (DRBCP)
    # =========================================================================
    h6 = doc.add_heading(level=1)
    h6.paragraph_format.space_before = Pt(0)
    h6.paragraph_format.space_after = Pt(4)
    hrun6 = h6.add_run("ANNEX 2: DISASTER RECOVERY & BUSINESS CONTINUITY PLAN (DRBCP) FOR ICT RESOURCES")
    hrun6.font.name = "Palatino Linotype"
    hrun6.font.size = Pt(13)
    hrun6.font.bold = True
    hrun6.font.color.rgb = RGBColor(30, 58, 138)

    p_d1 = doc.add_paragraph()
    p_d1.paragraph_format.space_before = Pt(0)
    p_d1.paragraph_format.space_after = Pt(2)
    p_d1.add_run("1. Plan Overview & Disaster Recovery Team (DRT)\n").font.bold = True
    app_date = clean_str(getattr(narrative, "drbcp_approval_date", None), "Approved upon Plan Effectivity")
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

        for c_i in range(3):
            set_cell_shading(drt_table.rows[0].cells[c_i], "F1F5F9")
            set_cell_margins(drt_table.rows[0].cells[c_i], top=40, bottom=40, left=60, right=60)

        for dt in drt_list:
            r = drt_table.add_row()
            prevent_row_split(r)
            for c_i in range(3):
                set_cell_margins(r.cells[c_i], top=35, bottom=35, left=60, right=60)
            r.cells[0].paragraphs[0].add_run(clean_str(dt.role)).font.bold = True
            r.cells[1].paragraphs[0].add_run(clean_str(dt.responsibility))
            r.cells[2].paragraphs[0].add_run(f"{clean_str(dt.contact_person)} ({clean_str(dt.contact_details)})")
    else:
        doc.add_paragraph("DRT roster defined under administrative continuity protocol.")

    p_d2 = doc.add_paragraph()
    p_d2.paragraph_format.space_before = Pt(4)
    p_d2.paragraph_format.space_after = Pt(2)
    p_d2.add_run("2. Business Impact Analysis (BIA) Summary\n").font.bold = True

    real_bias = [b for b in bia_list if b.system_name and clean_str(b.system_name)]
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
            set_cell_margins(c, top=40, bottom=40, left=60, right=60)
            c.paragraphs[0].add_run(h).font.bold = True

        for b in real_bias:
            r = bia_table.add_row()
            prevent_row_split(r)
            for c_i in range(5):
                set_cell_margins(r.cells[c_i], top=35, bottom=35, left=60, right=60)
            r.cells[0].paragraphs[0].add_run(clean_str(b.system_name)).font.bold = True
            r.cells[1].paragraphs[0].add_run(clean_str(b.classification))
            r.cells[2].paragraphs[0].add_run(f"{getattr(b, 'mtpd_hours', 24)}h")
            r.cells[3].paragraphs[0].add_run(f"{b.rto_hours}h")
            r.cells[4].paragraphs[0].add_run(f"{b.rpo_hours}h")
    else:
        doc.add_paragraph("Mission-critical systems evaluated for business continuity.")

    p_d3 = doc.add_paragraph()
    p_d3.paragraph_format.space_before = Pt(4)
    p_d3.paragraph_format.space_after = Pt(2)
    p_d3.add_run("3. ICT Component Inventory & Affected Assets\n").font.bold = True

    raw_assets = getattr(narrative, "drbcp_affected_assets_json", None) or []
    if isinstance(raw_assets, str):
        try: raw_assets = json.loads(raw_assets)
        except Exception: raw_assets = []

    if raw_assets:
        for a in raw_assets:
            if isinstance(a, dict):
                p_a = doc.add_paragraph(style='List Bullet')
                p_a.paragraph_format.space_before = Pt(0)
                p_a.paragraph_format.space_after = Pt(1)
                p_a.add_run(f"{a.get('asset_group', 'Asset Group')}: ").font.bold = True
                p_a.add_run(clean_str(a.get("details", "")))
    else:
        doc.add_paragraph("Primary Data Center: Physical Enterprise Servers, Core Network Switches, Dedicated Campus Backbone.")

    p_d4 = doc.add_paragraph()
    p_d4.paragraph_format.space_before = Pt(4)
    p_d4.paragraph_format.space_after = Pt(2)
    p_d4.add_run("4. Technical Recovery Strategy\n").font.bold = True

    strat_text = strip_html_tags(getattr(narrative, "drbcp_recovery_strategy_text", None) or getattr(narrative, "drbcp_recovery_strategy_html", None)) or (
        "Daily database snapshots transferred to an off-site secondary facility (>30km). Real-time operational failover configured for mission-critical frontline citizen and administrative services."
    )
    doc.add_paragraph(strat_text)

    p_d5 = doc.add_paragraph()
    p_d5.paragraph_format.space_before = Pt(4)
    p_d5.paragraph_format.space_after = Pt(2)
    p_d5.add_run("5. Standard Operating Procedures (SOP Operational Phases)\n").font.bold = True

    sop_text = strip_html_tags(getattr(narrative, "drbcp_sop_phases_text", None) or getattr(narrative, "drbcp_sop_phases_html", None)) or (
        "Phase I (Detection & Declaration): Monitoring alerts evaluated; Incident Commander activates DRBCP within 1 hour.\nPhase II (Activation): Operations shifted to secondary standby instances.\nPhase III (Failback): Primary infrastructure restored and delta synchronized."
    )
    doc.add_paragraph(sop_text)

    p_d6 = doc.add_paragraph()
    p_d6.paragraph_format.space_before = Pt(4)
    p_d6.paragraph_format.space_after = Pt(2)
    p_d6.add_run("6. Compliance, Scalability & Sustainability (MITHI Resolution 2025-01)\n").font.bold = True

    comp_text = strip_html_tags(getattr(narrative, "drbcp_compliance_narrative_text", None) or getattr(narrative, "drbcp_compliance_narrative_html", None)) or (
        "Cybersecurity controls isolate compromised nodes prior to snapshot mounting. Full simulation drill conducted annually. Continuing infrastructure costs budgeted under Part IV."
    )
    doc.add_paragraph(comp_text)

    p_dkpi = doc.add_paragraph()
    p_dkpi.paragraph_format.space_before = Pt(4)
    p_dkpi.paragraph_format.space_after = Pt(2)
    p_dkpi.add_run("Key Performance Indicators for DRBCP\n").font.bold = True

    if drm_list:
        drm_table = doc.add_table(rows=1, cols=2)
        drm_table.style = 'Table Grid'
        set_table_borders(drm_table)
        make_header_row_repeat(drm_table.rows[0])
        prevent_row_split(drm_table.rows[0])

        drm_table.rows[0].cells[0].paragraphs[0].add_run("Indicator").font.bold = True
        drm_table.rows[0].cells[1].paragraphs[0].add_run("Target Metric").font.bold = True
        for c_i in range(2):
            set_cell_shading(drm_table.rows[0].cells[c_i], "F1F5F9")
            set_cell_margins(drm_table.rows[0].cells[c_i], top=40, bottom=40, left=60, right=60)

        for dm in drm_list:
            r = drm_table.add_row()
            prevent_row_split(r)
            for c_i in range(2):
                set_cell_margins(r.cells[c_i], top=35, bottom=35, left=60, right=60)
            r.cells[0].paragraphs[0].add_run(clean_str(dm.indicator)).font.bold = True
            r.cells[1].paragraphs[0].add_run(clean_str(dm.target_metric))

    supplemental_sections = (document_composition or {}).get("sections", [])
    if supplemental_sections:
        def add_section_bookmark(name: str, bookmark_id: int) -> None:
            marker = doc.add_paragraph()
            start = OxmlElement("w:bookmarkStart")
            start.set(qn("w:id"), str(bookmark_id))
            start.set(qn("w:name"), name)
            marker._p.append(start)
            end = OxmlElement("w:bookmarkEnd")
            end.set(qn("w:id"), str(bookmark_id))
            marker._p.append(end)

        def add_attachment_link(paragraph, label: str, url: str) -> None:
            relationship_id = paragraph.part.relate_to(
                url,
                "http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink",
                is_external=True
            )
            hyperlink = OxmlElement("w:hyperlink")
            hyperlink.set(qn("r:id"), relationship_id)
            run = OxmlElement("w:r")
            run_properties = OxmlElement("w:rPr")
            color = OxmlElement("w:color")
            color.set(qn("w:val"), "0563C1")
            run_properties.append(color)
            underline = OxmlElement("w:u")
            underline.set(qn("w:val"), "single")
            run_properties.append(underline)
            run.append(run_properties)
            text_node = OxmlElement("w:t")
            text_node.text = label
            run.append(text_node)
            hyperlink.append(run)
            paragraph._p.append(hyperlink)

        def render_composition_section(section: Dict[str, Any], level: int = 2) -> None:
            heading = doc.add_heading(clean_str(section.get("title"), "Untitled section"), level=min(level, 3))
            bookmark_id = 9000 + len(list(doc.element.body.iter(qn("w:bookmarkStart"))))
            heading_start = OxmlElement("w:bookmarkStart")
            heading_start.set(qn("w:id"), str(bookmark_id))
            heading_start.set(qn("w:name"), docx_toc_bookmark_name("custom:" + str(section.get("id"))))
            heading_end = OxmlElement("w:bookmarkEnd")
            heading_end.set(qn("w:id"), str(bookmark_id))
            heading._p.insert(1 if heading._p.find(qn("w:pPr")) is not None else 0, heading_start)
            heading._p.append(heading_end)
            for block in section.get("blocks", []):
                block_title = clean_str(block.get("title"), "")
                if block_title:
                    doc.add_heading(block_title, level=min(level + 1, 4))
                block_type = block.get("type")
                if block_type == "paragraph":
                    doc.add_paragraph(clean_str(block.get("content"), ""))
                elif block_type in ("bullet_list", "numbered_list", "survey"):
                    entries = block.get("questions", []) if block_type == "survey" else block.get("items", [])
                    style = "List Number" if block_type in ("numbered_list", "survey") else "List Bullet"
                    for entry in entries:
                        doc.add_paragraph(clean_str(entry), style=style)
                elif block_type == "table":
                    columns = block.get("columns", [])
                    if columns:
                        table = doc.add_table(rows=1, cols=len(columns))
                        table.style = "Table Grid"
                        for index, column in enumerate(columns):
                            table.rows[0].cells[index].text = clean_str(column)
                        for row in block.get("rows", []):
                            cells = table.add_row().cells
                            for index, cell in enumerate(row):
                                cells[index].text = clean_str(cell)
                elif block_type == "attachment":
                    file_name = clean_str(block.get("file_name"), "Uploaded file")
                    file_url = clean_str(block.get("file_url"), "")
                    image_uri = str(block.get("image_data_uri") or "")
                    picture_added = False
                    if image_uri.startswith("data:image") and "," in image_uri:
                        try:
                            picture_stream = io.BytesIO(base64.b64decode(image_uri.split(",", 1)[1]))
                            picture_paragraph = doc.add_paragraph()
                            picture_paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER
                            picture_paragraph.add_run().add_picture(picture_stream, height=Inches(4.2))
                            picture_added = True
                        except Exception as picture_error:
                            logger.warning(f"Could not embed attachment image {file_name}: {picture_error}")
                    if not picture_added:
                        paragraph = doc.add_paragraph()
                        if file_url:
                            add_attachment_link(paragraph, file_name, file_url)
                        else:
                            paragraph.add_run(file_name)
            for child in section.get("children", []):
                render_composition_section(child, level + 1)

        for section_index, section in enumerate(supplemental_sections):
            add_section_bookmark(f"issp_custom_section_start_{section_index}", section_index * 2 + 1)
            if not section.get("parent_official_key"):
                doc.add_page_break()
            render_composition_section(section, 1 if not section.get("parent_official_key") else 2)
            add_section_bookmark(f"issp_custom_section_end_{section_index}", section_index * 2 + 2)

    _apply_docx_outline_overrides(
        doc,
        issp_period,
        len(planning_years),
        (document_composition or {}).get("official_sections", {}),
        supplemental_sections
    )

    # Save Word document to byte buffer
    buf = io.BytesIO()
    doc.save(buf)
    buf.seek(0)
    return buf
