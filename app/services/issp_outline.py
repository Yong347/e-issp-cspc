import html
import json
from typing import Any, Dict, List, Optional

from lxml import etree, html as lxml_html
from sqlalchemy import String, cast, func, or_
from sqlalchemy.orm import Session

from app.database.models import (
    BusinessImpactAnalysis,
    CybersecurityControl,
    DisasterRecoveryTeam,
    DRBCPMetric,
    EGovernmentChecklist,
    ExistingInventory,
    GlossaryTerm,
    HumanCapital,
    IctProject,
    IctStaffPosition,
    InformationSystem,
    MasterNarrative,
    NetworkInfrastructure,
    OrganizationalOutcome,
    PerformanceMetric,
    Proposal,
    StakeholderAnalysis,
    StrategicConcern,
)


def _node(
    key: str,
    title: str,
    anchor: str,
    source: str,
    children: Optional[List[Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    return {
        "key": key,
        "title": title,
        "anchor": anchor,
        "source": source,
        "record_count": 0,
        "children": children or [],
    }


def _build_outline(issp_period: str, year_count: int) -> List[Dict[str, Any]]:
    period_parts = issp_period.split("-")
    start_year = int(period_parts[0]) if period_parts and period_parts[0].isdigit() else 2026
    return [
        _node("definitions", "Definition of Terms", "sec-defs", "Glossary terms", []),
        _node("part1", "PART I. AGENCY PROFILE & STRATEGIC CONTEXT", "sec-part1", "Master narrative and planning records", [
            _node("part1-a", "A. Mandate, Vision, Mission, and Organizational Outcome", "sec-part1-a", "Master narrative and organizational outcomes", [
                _node("part1-a1", "A.1. Mandate", "sec-part1-a1", "Master narrative"),
                _node("part1-a2", "A.2. Vision Statement", "sec-part1-a2", "Master narrative"),
                _node("part1-a3", "A.3. Mission Statement", "sec-part1-a3", "Master narrative"),
                _node("part1-a4", "A.4. Organizational Outcomes", "sec-part1-a4", "Organizational outcomes"),
            ]),
            _node("part1-b", "B. Organizational Structure", "sec-part1-b", "Agency signatories and organizational records", [
                _node("part1-b1", "B.1. Chief Information Officer and ISSP Focal Person", "sec-part1-b1", "Master narrative"),
                _node("part1-b2", "B.2. Human Capital", "sec-part1-b2", "Human capital records"),
            ]),
            _node("part1-c", "C. Stakeholder Analysis", "sec-part1-c", "Stakeholder analysis records"),
        ]),
        _node("part2", "PART II. CURRENT ICT ASSESSMENT", "sec-part2", "Current assessment records", [
            _node("part2-a", "A. Strategic Concerns for ICT Use", "sec-part2-a", "Strategic concerns"),
            _node("part2-b", "B. Existing Network Infrastructure", "sec-part2-b", "Existing network infrastructure", [
                _node("part2-b1", "B.1. LAN/WAN Set-up and Connectivity", "sec-part2-b1", "Existing network infrastructure"),
                _node("part2-b2", "B.2. Cybersecurity Control Checklist", "sec-part2-b2", "Cybersecurity controls"),
            ]),
            _node("part2-c", "C. Existing/Operational Information Systems Inventory", "sec-part2-c", "Operational information systems"),
            _node("part2-d", "D. E-Government Programs Checklist", "sec-part2-d", "E-government checklist records"),
        ]),
        _node("part3", "PART III. PROPOSED ICT STRATEGY", "sec-part3", "Proposed ICT strategy records", [
            _node("part3-a", "A. Proposed Network Infrastructure", "sec-part3-a", "Proposed network infrastructure", [
                _node("part3-a1", "A.1. LAN/WAN Set-up and Connectivity", "sec-part3-a1", "Proposed network infrastructure"),
                _node("part3-a2", "A.2. Cybersecurity Control Checklist", "sec-part3-a2", "Proposed cybersecurity controls"),
            ]),
            _node("part3-b", "B. Enterprise Architecture", "sec-part3-b", "Master narrative and architecture diagrams"),
            _node("part3-c", "C. Proposed ICT Human Capital", "sec-part3-c", "Proposed ICT staff positions"),
            _node("part3-d", "D. Proposed Information Systems", "sec-part3-d", "Proposed information systems"),
            _node("part3-e", "E. ICT Projects Portfolio", "sec-part3-e", "ICT projects", [
                _node("part3-e1", "E.1. Internal ICT Projects", "sec-part3-e1", "Internal ICT projects"),
                _node("part3-e2", "E.2. Cross-Agency ICT Projects", "sec-part3-e2", "Cross-agency projects"),
            ]),
            _node("part3-f", "F. Performance Measurement Framework", "sec-part3-f", "Performance metrics and ICT projects", [
                _node("part3-f1", "F.1. Internal ICT Projects Scorecard", "sec-part3-f1", "Internal project metrics"),
                _node("part3-f2", "F.2. Cross-Agency ICT Projects Scorecard", "sec-part3-f2", "Cross-agency project metrics"),
                _node("part3-f3", "F.3. Institutional ICT Governance KPIs", "sec-part3-f3", "Performance metrics"),
            ]),
        ]),
        _node("part4", "PART IV. RESOURCE REQUIREMENTS", "sec-part4", "Approved proposals and derived parity tables", [
            _node("part4-a", "A. Detailed Resource Deployment and Cost Breakdown", "sec-part4-a", "Approved proposal resource items", [
                _node(f"part4-a-year-{index + 1}", f"A.{index + 1}. Resource Deployment (FY {start_year + index})", f"sec-part4-a{index + 1}", "Approved proposal yearly quantities")
                for index in range(year_count)
            ]),
            _node("part4-b", "B. Summary of Investments", "sec-part4-b", "Derived financial parity tables", [
                _node("part4-b1", "B.1. General Summary", "sec-part4-b1", "Derived financial parity table"),
                _node("part4-b2", "B.2. Fund Source", "sec-part4-b2", "Derived financial parity table"),
                _node("part4-b3", "B.3. Statement of Expenditure", "sec-part4-b3", "Derived financial parity table"),
                _node("part4-b4", "B.4. Object of Expenditure", "sec-part4-b4", "Derived financial parity table"),
            ]),
        ]),
        _node("annex1", "ANNEX 1: EXISTING ICT ASSET INVENTORY", "sec-annex1", "Existing inventory records", [
            _node("annex1-equipment", "1. ICT Equipment Inventory", "sec-annex1-equipment", "Non-software existing inventory"),
            _node("annex1-software", "2. ICT Software Inventory", "sec-annex1-software", "Software existing inventory"),
        ]),
        _node("annex2", "ANNEX 2: DISASTER RECOVERY AND BUSINESS CONTINUITY PLAN", "sec-annex2", "Disaster recovery records", [
            _node("annex2-overview", "1. Plan Overview and Disaster Recovery Team", "sec-annex2-overview", "Disaster recovery team and master narrative"),
            _node("annex2-bia", "2. Business Impact Analysis Summary", "sec-annex2-bia", "Business impact analysis"),
            _node("annex2-assets", "3. ICT Component Inventory and Affected Assets", "sec-annex2-assets", "Master narrative affected assets"),
            _node("annex2-recovery", "4. Technical Recovery Strategy", "sec-annex2-recovery", "Master narrative recovery strategy"),
            _node("annex2-sop", "5. Standard Operating Procedures", "sec-annex2-sop", "Master narrative recovery procedures"),
            _node("annex2-compliance", "6. Compliance, Scalability, and Sustainability", "sec-annex2-compliance", "Master narrative compliance content"),
            _node("annex2-kpis", "DRBCP Key Performance Indicators", "sec-annex2-kpis", "DRBCP metrics"),
        ]),
    ]


def get_default_issp_outline(issp_period: str, year_count: int) -> List[Dict[str, Any]]:
    return _build_outline(issp_period, year_count)


def flatten_outline(
    sections: List[Dict[str, Any]],
    parent_key: Optional[str] = None,
    depth: int = 0
) -> List[Dict[str, Any]]:
    flattened = []
    for section in sections:
        current = {key: value for key, value in section.items() if key != "children"}
        current["parent_key"] = parent_key
        current["depth"] = depth
        flattened.append(current)
        flattened.extend(flatten_outline(section.get("children", []), section["key"], depth + 1))
    return flattened


def _normalize_official_settings(settings: Optional[Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
    normalized: Dict[str, Dict[str, Any]] = {}
    for key, value in (settings or {}).items():
        if hasattr(value, "model_dump"):
            value = value.model_dump()
        normalized[key] = value if isinstance(value, dict) else {}
    return normalized


def get_issp_outline(
    db: Session,
    issp_period: str,
    year_count: int,
    settings: Optional[Dict[str, Any]] = None,
) -> List[Dict[str, Any]]:
    sections = get_default_issp_outline(issp_period, year_count)
    record_counts = {
        "definitions": db.query(GlossaryTerm).count(),
        "part1-a4": db.query(OrganizationalOutcome).filter(OrganizationalOutcome.issp_period == issp_period).count(),
        "part1-b2": db.query(HumanCapital).filter(HumanCapital.issp_period == issp_period).count(),
        "part1-c": db.query(StakeholderAnalysis).filter(StakeholderAnalysis.issp_period == issp_period).count(),
        "part2-a": db.query(StrategicConcern).filter(StrategicConcern.issp_period == issp_period).count(),
        "part2-b": db.query(NetworkInfrastructure).filter(NetworkInfrastructure.issp_period == issp_period, NetworkInfrastructure.is_proposed.is_(False)).count(),
        "part2-b2": db.query(CybersecurityControl).filter(CybersecurityControl.issp_period == issp_period, CybersecurityControl.is_proposed.is_(False)).count(),
        "part2-c": db.query(InformationSystem).filter(InformationSystem.issp_period == issp_period).count(),
        "part2-d": db.query(EGovernmentChecklist).filter(EGovernmentChecklist.issp_period == issp_period).count(),
        "part3-a": db.query(NetworkInfrastructure).filter(NetworkInfrastructure.issp_period == issp_period, NetworkInfrastructure.is_proposed.is_(True)).count(),
        "part3-a2": db.query(CybersecurityControl).filter(CybersecurityControl.issp_period == issp_period, CybersecurityControl.is_proposed.is_(True)).count(),
        "part3-c": db.query(IctStaffPosition).filter(IctStaffPosition.issp_period == issp_period).count(),
        "part3-d": db.query(InformationSystem).filter(InformationSystem.issp_period == issp_period).count(),
        "part3-e": db.query(IctProject).filter(IctProject.issp_period == issp_period).count(),
        "part3-f": db.query(PerformanceMetric).filter(PerformanceMetric.issp_period == issp_period).count(),
        "annex1": db.query(ExistingInventory).filter(or_(ExistingInventory.issp_period == issp_period, ExistingInventory.issp_period.is_(None))).count(),
        "annex1-equipment": db.query(ExistingInventory).filter(or_(ExistingInventory.issp_period == issp_period, ExistingInventory.issp_period.is_(None)), ExistingInventory.is_software.is_(False)).count(),
        "annex1-software": db.query(ExistingInventory).filter(or_(ExistingInventory.issp_period == issp_period, ExistingInventory.issp_period.is_(None)), ExistingInventory.is_software.is_(True)).count(),
        "annex2-bia": db.query(BusinessImpactAnalysis).filter(BusinessImpactAnalysis.issp_period == issp_period).count(),
        "annex2-overview": db.query(DisasterRecoveryTeam).filter(DisasterRecoveryTeam.issp_period == issp_period).count(),
        "annex2-kpis": db.query(DRBCPMetric).filter(DRBCPMetric.issp_period == issp_period).count(),
    }
    record_models = {
        "definitions": GlossaryTerm,
        "part1-a1": MasterNarrative,
        "part1-a2": MasterNarrative,
        "part1-a3": MasterNarrative,
        "part1-a4": OrganizationalOutcome,
        "part1-b1": MasterNarrative,
        "part1-b2": HumanCapital,
        "part1-c": StakeholderAnalysis,
        "part2-a": StrategicConcern,
        "part2-b": NetworkInfrastructure,
        "part2-b1": NetworkInfrastructure,
        "part2-b2": CybersecurityControl,
        "part2-c": InformationSystem,
        "part2-d": EGovernmentChecklist,
        "part3-a": NetworkInfrastructure,
        "part3-a1": NetworkInfrastructure,
        "part3-a2": CybersecurityControl,
        "part3-b": MasterNarrative,
        "part3-c": IctStaffPosition,
        "part3-d": InformationSystem,
        "part3-e": IctProject,
        "part3-e1": IctProject,
        "part3-e2": IctProject,
        "part3-f": PerformanceMetric,
        "part3-f1": PerformanceMetric,
        "part3-f2": PerformanceMetric,
        "part3-f3": PerformanceMetric,
        "part4-a": Proposal,
        "part4-b": Proposal,
        "part4-b1": Proposal,
        "part4-b2": Proposal,
        "part4-b3": Proposal,
        "part4-b4": Proposal,
        "annex1-equipment": ExistingInventory,
        "annex1-software": ExistingInventory,
        "annex2-overview": DisasterRecoveryTeam,
        "annex2-bia": BusinessImpactAnalysis,
        "annex2-assets": MasterNarrative,
        "annex2-recovery": MasterNarrative,
        "annex2-sop": MasterNarrative,
        "annex2-compliance": MasterNarrative,
        "annex2-kpis": DRBCPMetric,
    }
    narrative_fields = {
        "part1-a1": ["mandate_text", "functions"],
        "part1-a2": ["vision_text"],
        "part1-a3": ["mission_text"],
        "part1-b1": [
            "signatory_prepared_by", "preparer_position", "cio_organizational_unit",
            "preparer_email", "preparer_tel", "focal_name", "focal_position",
            "focal_organizational_unit", "focal_email", "focal_contact_no"
        ],
        "part3-b": ["enterprise_architecture_narrative", "system_architecture_url"],
        "annex2-assets": ["drbcp_affected_assets_json"],
        "annex2-recovery": ["drbcp_recovery_strategy_text"],
        "annex2-sop": ["drbcp_sop_phases_text"],
        "annex2-compliance": ["drbcp_compliance_narrative_text"],
    }
    record_filters = {
        "part2-b": False,
        "part2-b1": False,
        "part2-b2": False,
        "part3-a": True,
        "part3-a1": True,
        "part3-a2": True,
    }
    source_records: Dict[str, List[Dict[str, Any]]] = {}
    for key, model in record_models.items():
        query = db.query(model)
        if key in narrative_fields:
            query = query.filter(MasterNarrative.issp_period == issp_period)
        elif hasattr(model, "issp_period"):
            if model is ExistingInventory:
                query = query.filter(or_(ExistingInventory.issp_period == issp_period, ExistingInventory.issp_period.is_(None)))
            else:
                query = query.filter(model.issp_period == issp_period)
        if model in (NetworkInfrastructure, CybersecurityControl) and key in record_filters:
            query = query.filter(model.is_proposed.is_(record_filters[key]))
        if model is InformationSystem and key == "part2-c" and hasattr(InformationSystem, "submission_status"):
            query = query.filter(or_(
                InformationSystem.submission_status == "Approved",
                InformationSystem.submission_status.is_(None),
                func.lower(cast(InformationSystem.submission_status, String)) == "approved"
            ))
        if model is InformationSystem and key == "part3-d":
            query = query.filter(or_(
                InformationSystem.status.is_(None),
                func.lower(cast(InformationSystem.status, String)) != "operational"
            ))
        if model is ExistingInventory:
            if key == "annex1-equipment":
                query = query.filter(ExistingInventory.is_software.is_(False))
            elif key == "annex1-software":
                query = query.filter(ExistingInventory.is_software.is_(True))
        if model is IctProject and key in ("part3-e1", "part3-e2"):
            cross_agency = key == "part3-e2"
            query = query.filter(func.lower(cast(IctProject.project_category, String)).contains("cross") == cross_agency)
        if model is PerformanceMetric and key in ("part3-f1", "part3-f2"):
            cross_agency = key == "part3-f2"
            query = query.join(IctProject, PerformanceMetric.project_id == IctProject.id).filter(
                func.lower(cast(IctProject.project_category, String)).contains("cross") == cross_agency
            )
        if model is PerformanceMetric and key == "part3-f3":
            query = query.filter(PerformanceMetric.project_id.is_(None))
        if model is Proposal:
            query = query.filter(
                func.lower(cast(Proposal.status, String)) == "approved",
                Proposal.project_id.isnot(None),
                or_(Proposal.is_archived.is_(False), Proposal.is_archived.is_(None))
            )

        rows = query.all()
        fields = narrative_fields.get(key)
        if fields is None:
            fields = [column.key for column in model.__table__.columns]
        source_records[key] = [
            {
                field: json.loads(json.dumps(getattr(row, field, None), default=str))
                for field in fields
                if hasattr(row, field)
            }
            for row in rows
        ]

    source_records["annex1"] = source_records.get("annex1-equipment", []) + source_records.get("annex1-software", [])
    source_records["part1-a"] = source_records.get("part1-a4", [])
    source_records["part1-b"] = source_records.get("part1-b2", [])
    source_records["part2"] = source_records.get("part2-a", [])
    source_records["part3"] = source_records.get("part3-e", [])
    source_records["annex2"] = (
        source_records.get("annex2-overview", [])
        + source_records.get("annex2-bia", [])
        + source_records.get("annex2-kpis", [])
    )
    period_parts = issp_period.split("-")
    first_year = int(period_parts[0]) if period_parts and period_parts[0].isdigit() else 2026
    for year_index in range(year_count):
        year = first_year + year_index
        key = f"part4-a-year-{year_index + 1}"
        source_records[key] = [
            record for record in source_records.get("part4-a", [])
            if int((record.get("yearly_quantities") or {}).get(str(year), 0) or 0) > 0
        ]
        record_counts[key] = len(source_records[key])
    overrides = _normalize_official_settings(settings)

    def apply_settings(nodes: List[Dict[str, Any]]) -> None:
        for index, node in enumerate(nodes):
            override = overrides.get(node["key"], {})
            node["record_count"] = len(source_records[node["key"]]) if node["key"] in source_records else record_counts.get(node["key"], 0)
            node["records"] = source_records.get(node["key"], [])
            node["visible"] = override.get("visible", True)
            node["title_override"] = override.get("title")
            node["order"] = override.get("order") if override.get("order") is not None else index
            node["replacement_section_id"] = override.get("replacement_section_id")
            apply_settings(node["children"])
        nodes.sort(key=lambda node: (node["order"], node["key"]))

    apply_settings(sections)
    return sections


def _effective_outline(
    sections: List[Dict[str, Any]],
    settings: Dict[str, Any],
    replacement_titles: Optional[Dict[str, str]] = None,
    parent_visible: bool = True
) -> List[Dict[str, Any]]:
    replacement_titles = replacement_titles or {}
    resolved = []
    ordered_sections = sorted(
        enumerate(sections),
        key=lambda item: (settings.get(item[1]["key"], {}).get("order", item[0]), item[0])
    )
    for _, node in ordered_sections:
        override = settings.get(node["key"], {})
        replacement_id = override.get("replacement_section_id")
        visible = parent_visible and (override.get("visible", True) or bool(replacement_id))
        source_visible = parent_visible and override.get("visible", True) and not replacement_id
        title = override.get("title")
        replacement_title = replacement_titles.get(replacement_id) if replacement_id else None
        resolved_node = {
            **node,
            "visible": visible,
            "source_visible": source_visible,
            "replacement_section_id": replacement_id,
            "title_override": title,
            "display_title": str(title or replacement_title or node["title"]).strip(),
            "children": _effective_outline(
                node.get("children", []),
                settings,
                replacement_titles,
                visible and not replacement_id
            ),
        }
        resolved.append(resolved_node)
    return resolved


def _set_outline_heading(element, title: str, depth: int) -> None:
    if depth == 0:
        headings = element.xpath(
            ".//*[contains(concat(' ', normalize-space(@class), ' '), ' section-header ')]"
        )
        if headings:
            headings[0].text = title
        return

    classes = f" {element.get('class', '')} "
    if " sub-header " in classes:
        element.text = title
        return

    headings = element.xpath(
        ".//*[contains(concat(' ', normalize-space(@class), ' '), ' sub-header ')]"
    )
    if headings:
        headings[0].text = title
        return

    strong = element.xpath(".//strong[1]")
    if strong:
        strong[0].text = title.rstrip(":") + ":"
        return

    if element.tag.lower() in {"h1", "h2", "h3", "h4", "h5", "h6"}:
        element.text = title


def _element_positions(root) -> tuple[Dict[Any, int], Dict[Any, int]]:
    starts: Dict[Any, int] = {}
    ends: Dict[Any, int] = {}
    position = 0

    def visit(element) -> None:
        nonlocal position
        starts[element] = position
        position += 1
        for child in element:
            if isinstance(child.tag, str):
                visit(child)
        ends[element] = position - 1

    visit(root)
    return starts, ends


def _remove_html_interval(body, start_element, end_element) -> None:
    starts, ends = _element_positions(body)
    start_position = starts.get(start_element)
    if start_position is None:
        return
    end_position = starts.get(end_element, float("inf")) if end_element is not None else float("inf")

    def prune(element) -> None:
        for child in list(element):
            if not isinstance(child.tag, str):
                continue
            child_start = starts[child]
            child_end = ends[child]
            if start_position <= child_start and child_end < end_position:
                element.remove(child)
            elif child_start < end_position and child_end >= start_position:
                prune(child)

    prune(body)


def _reorder_pdf_root_sections(body, outline: List[Dict[str, Any]], anchors: Dict[str, List[Any]]) -> None:
    direct_children = list(body)
    child_positions = {child: index for index, child in enumerate(direct_children)}
    positioned_roots = []

    for node in outline:
        if not node["visible"] or node["key"] not in anchors:
            continue
        element = next((item for item in anchors[node["key"]] if item.getparent() is not None), None)
        if element is None:
            continue
        while element.getparent() is not body and element.getparent() is not None:
            element = element.getparent()
        if element in child_positions:
            positioned_roots.append((child_positions[element], node))

    natural_roots = sorted(positioned_roots, key=lambda item: item[0])
    if len(natural_roots) < 2:
        return

    start_position = natural_roots[0][0]
    supplemental_nodes = body.xpath(".//*[@id='sec-supplemental']")
    supplemental_position = None
    if supplemental_nodes:
        supplemental_root = supplemental_nodes[0]
        while supplemental_root.getparent() is not body and supplemental_root.getparent() is not None:
            supplemental_root = supplemental_root.getparent()
        supplemental_position = child_positions.get(supplemental_root)
    content_end = supplemental_position if supplemental_position is not None else len(direct_children)

    chunks = {}
    for index, (position, node) in enumerate(natural_roots):
        end_position = natural_roots[index + 1][0] if index + 1 < len(natural_roots) else content_end
        chunks[node["key"]] = direct_children[position:end_position]

    if [node["key"] for _, node in natural_roots] == [node["key"] for node in outline if node["visible"] and node["key"] in chunks]:
        return

    for child in direct_children[start_position:content_end]:
        if child.getparent() is body:
            body.remove(child)

    insertion_index = start_position
    for node in outline:
        if node["key"] not in chunks:
            continue
        for child in chunks[node["key"]]:
            body.insert(insertion_index, child)
            insertion_index += 1


def apply_pdf_outline_overrides(
    document_html: str,
    issp_period: str,
    year_count: int,
    official_settings: Optional[Dict[str, Any]] = None,
    custom_sections: Optional[List[Dict[str, Any]]] = None,
) -> str:
    settings = _normalize_official_settings(official_settings)
    custom_sections = custom_sections or []
    custom_titles = {}

    def collect_custom_titles(sections):
        for section in sections:
            custom_titles[section["id"]] = str(section.get("title") or "Untitled section")
            collect_custom_titles(section.get("children", []))

    collect_custom_titles(custom_sections)
    outline = _effective_outline(
        get_default_issp_outline(issp_period, year_count),
        settings,
        custom_titles
    )
    flat_nodes = flatten_outline(outline)
    document = lxml_html.fromstring(document_html)
    body = document.find("body")
    if body is None:
        return document_html

    anchors: Dict[str, List[Any]] = {}
    source_anchors: Dict[str, List[Any]] = {}
    for node in flat_nodes:
        found = document.xpath("//*[@id=$anchor]", anchor=node["anchor"])
        if found:
            anchors[node["key"]] = found
            source_anchors[node["key"]] = found
            if node["title_override"]:
                for element in found:
                    _set_outline_heading(element, node["display_title"], node["depth"])

    replacement_paths = {}

    def collect_replacement_paths(sections, path=()):
        for index, section in enumerate(sections):
            section_path = path + (index,)
            replacement_paths[section["id"]] = section_path
            collect_replacement_paths(section.get("children", []), section_path)

    collect_replacement_paths(custom_sections)
    replacement_ids = {
        node.get("replacement_section_id") for node in flat_nodes
        if node.get("replacement_section_id")
    }
    for node in flat_nodes:
        replacement_id = node.get("replacement_section_id")
        if not replacement_id or replacement_id not in replacement_paths or node["key"] not in source_anchors:
            continue
        replacement_nodes = document.xpath("//*[@data-composition-section-id=$section_id]", section_id=replacement_id)
        if not replacement_nodes:
            continue
        replacement_element = replacement_nodes[0]
        source_element = source_anchors[node["key"]][0]
        replacement_element.set("id", node["anchor"])
        replacement_heading = replacement_element.xpath(".//h1 | .//h2 | .//h3 | .//h4 | .//h5 | .//h6")
        if replacement_heading:
            replacement_heading[0].attrib.pop("id", None)
            replacement_heading[0].text = node["display_title"]
        source_element.addprevious(replacement_element)
        anchors[node["key"]] = [replacement_element]

    nodes_by_key = {node["key"]: node for node in flat_nodes}
    placed_sections: Dict[str, List[tuple[Dict[str, Any], tuple[int, ...]]]] = {}
    for section_index, section in enumerate(custom_sections):
        parent_key = section.get("parent_official_key")
        parent_node = nodes_by_key.get(parent_key)
        if not parent_node or section["id"] in replacement_ids:
            continue
        custom_wrapper = document.xpath("//*[@data-composition-section-id=$section_id]", section_id=section["id"])
        parent_anchor = anchors.get(parent_key, [None])[0]
        if not custom_wrapper or parent_anchor is None:
            continue
        heading = parent_anchor
        if parent_node["depth"] == 0:
            headings = parent_anchor.xpath(
                ".//*[contains(concat(' ', normalize-space(@class), ' '), ' section-header ')]"
            )
            if headings:
                heading = headings[0]
        elif " sub-header " not in f" {parent_anchor.get('class', '')} ":
            headings = parent_anchor.xpath(
                ".//*[contains(concat(' ', normalize-space(@class), ' '), ' sub-header ')]"
            )
            if headings:
                heading = headings[0]
        heading.addnext(custom_wrapper[0])
        placed_sections.setdefault(parent_key, []).append((section, (section_index,)))

    present_nodes = [
        node for node in flat_nodes
        if node["key"] in anchors
    ]
    initial_positions, _ = _element_positions(body)
    present_nodes.sort(key=lambda node: min(initial_positions.get(element, 0) for element in anchors[node["key"]]))

    for node in present_nodes:
        parent_hidden = node["parent_key"] and not next(
            (parent["visible"] for parent in flat_nodes if parent["key"] == node["parent_key"]),
            True
        )
        if node.get("source_visible", node["visible"]) or parent_hidden:
            continue
        start_element = source_anchors[node["key"]][0]
        start_index = present_nodes.index(node)
        end_node = next(
            (candidate for candidate in present_nodes[start_index + 1:] if candidate["depth"] <= node["depth"]),
            None
        )
        end_element = source_anchors[end_node["key"]][0] if end_node else None
        supplemental_anchor = document.xpath("//*[@id='sec-supplemental']")
        if end_element is None and supplemental_anchor:
            end_element = supplemental_anchor[0]
        _remove_html_interval(body, start_element, end_element)

    _reorder_pdf_root_sections(body, outline, anchors)

    toc_body = document.xpath("//*[@id='sec-toc']//tbody")
    if toc_body:
        toc_body = toc_body[0]
        replacement_prefixes = {
            "supplement-" + "-".join(str(index) for index in replacement_paths[section_id])
            for section_id in replacement_ids
            if section_id in replacement_paths and len(replacement_paths[section_id]) == 1
        }
        placed_prefixes = {
            "supplement-" + "-".join(str(index) for index in path)
            for sections_for_parent in placed_sections.values()
            for _, path in sections_for_parent
        }
        supplemental_rows = []
        for row in list(toc_body):
            links = row.xpath(".//a")
            href = links[0].get("href", "") if links else ""
            if href == "#sec-supplemental":
                handled_custom_ids = replacement_ids | {
                    section["id"] for section in custom_sections if section.get("parent_official_key")
                }
                if custom_sections and all(section["id"] in handled_custom_ids for section in custom_sections):
                    continue
                supplemental_rows.append(row)
            elif href.startswith("#supplement"):
                if any(href == f"#{prefix}" for prefix in replacement_prefixes | placed_prefixes):
                    continue
                supplemental_rows.append(row)
            toc_body.remove(row)

        def append_node(node: Dict[str, Any], depth: int) -> None:
            if not node["visible"] or node["key"] not in anchors:
                return
            row = etree.SubElement(toc_body, "tr")
            cell = etree.SubElement(row, "td", attrib={"class": "toc-title"})
            if depth:
                cell.set("style", f"padding-left: {min(depth, 3) * 14}px;")
            link = etree.SubElement(cell, "a", href=f"#{node['anchor']}")
            if depth == 0:
                link.set("style", "font-weight: bold; color: #1e3a8a;")
            else:
                link.set("style", "color: #0f172a;")
            link.text = node["display_title"]
            page_cell = etree.SubElement(row, "td", attrib={"class": "toc-page"})
            etree.SubElement(page_cell, "a", href=f"#{node['anchor']}")

        def append_custom_node(section: Dict[str, Any], path: tuple[int, ...], depth: int) -> None:
            title = html.escape(str(section.get("title") or "Untitled section"))
            anchor = "supplement-" + "-".join(str(index) for index in path)
            row = etree.SubElement(toc_body, "tr")
            cell = etree.SubElement(row, "td", attrib={"class": "toc-title", "style": f"padding-left: {min(depth, 3) * 14}px;"})
            link = etree.SubElement(cell, "a", href=f"#{anchor}", style="color: #0f172a;")
            link.text = title
            page_cell = etree.SubElement(row, "td", attrib={"class": "toc-page"})
            etree.SubElement(page_cell, "a", href=f"#{anchor}")
            for index, child in enumerate(section.get("children", [])):
                append_custom_node(child, path + (index,), depth + 1)

        def append_tree(nodes: List[Dict[str, Any]], depth: int = 0) -> None:
            for node in nodes:
                append_node(node, depth)
                for section, path in placed_sections.get(node["key"], []):
                    append_custom_node(section, path, depth + 1)
                if node["visible"]:
                    append_tree(node["children"], depth + 1)

        append_tree(outline)

        for row in supplemental_rows:
            toc_body.append(row)

    supplemental_root = document.xpath("//*[@id='sec-supplemental']")
    if supplemental_root and not supplemental_root[0].xpath(".//*[@data-composition-section-id]"):
        parent = supplemental_root[0].getparent()
        parent.remove(supplemental_root[0])

    return lxml_html.tostring(document, encoding="unicode", method="html", doctype="<!DOCTYPE html>")