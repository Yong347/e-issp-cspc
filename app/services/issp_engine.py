# app/services/issp_engine.py
"""
=============================================================================
DICT ISSP v.2026 COMPLIANCE ENGINE — SINGULARITY GRAPH & FOUR-WAY PARITY
=============================================================================
Core Capabilities:
- End-to-End Relational Singularity Validation (Part I through Annex 2)
- Multi-Pathway Strategic Concern Resolution Verification (Systems, Projects,
  Hardware Deployments, Network Infrastructure, and Needs Assessments)
- Plan-Committed Proposals Governance & Strict Project-Governed Rollup:
  Every proposal must bind to an ICT Project charter in Part III.E. No proposals
  stand alone without a project, as all costs belong to an ICT Project.
- Categorization Per Project: Table B.1 (Category) and Table B.2 (Fund Source)
  inherit strictly from the parent ICT Project charter in Part III.E.
- Strict Four-Way Financial Parity Engine (Tables B.1, B.2, B.3, and B.4)
- Zero-Leakage Rollup: Reconciles all four investment matrices to 0.00 centavo discrepancy
- Dynamic Multi-Year Horizon Support: Scales dynamically to 1, 2, 3, 4, 5+ year spans
=============================================================================
"""

import re
import json
import logging
from decimal import Decimal
from typing import Dict, Any, List, Tuple, Optional
from sqlalchemy import func, or_, and_, cast, String, text
from sqlalchemy.orm import Session, joinedload
from fastapi import HTTPException, status

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
    IctStaffPosition,
    StakeholderAnalysis,
    EGovernmentChecklist,
    BusinessImpactAnalysis,
    DisasterRecoveryTeam,
    DRBCPMetric,
    StrategicCategory,
    UacsCatalogItem,
    SystemTaxonomy,
    SystemSetting,
    AssetStatus,
    NeedsAssessment,
    NetworkInfrastructure,
    CybersecurityControl
)

logger = logging.getLogger("app.services.issp_engine")


def normalize_token(val: Any) -> str:
    """
    Produces a clean, lowercase, alphanumeric-only token for flexible comparisons.
    Strips trailing plural suffixes to allow seamless matching between singular
    and plural database entries (e.g., 'project' vs. 'projects').
    """
    if val is None:
        return ""
    raw = str(getattr(val, "value", val) or "").strip().lower()
    cleaned = re.sub(r'[^a-z0-9]', '', raw)
    if cleaned.endswith('projects'):
        cleaned = cleaned[:-1]
    elif cleaned.endswith('expenses'):
        cleaned = cleaned[:-2]
    elif cleaned.endswith('costs'):
        cleaned = cleaned[:-1]
    return cleaned


def find_matching_key(grid: dict, candidate_val: Any) -> Optional[str]:
    """
    Dynamically matches candidate strings or enums against financial matrix row keys.
    Normalizes casing, whitespace, hyphens, and UACS code prefixes to prevent
    unmapped row anomalies and ensure centavo-perfect reconciliation.
    """
    if candidate_val is None:
        return None
    cand_str = str(getattr(candidate_val, "value", candidate_val) or "").strip()
    if not cand_str:
        return None

    cand_norm = normalize_token(cand_str)

    # 1. Exact or normalized string match
    for k in grid.keys():
        if k == "GRAND TOTAL":
            continue
        k_norm = normalize_token(k)
        if k.lower() == cand_str.lower() or k_norm == cand_norm:
            return k

    # 2. Match by UACS code numerical prefix (e.g., '50604050 03')
    cand_code_prefix = cand_str.split(" - ")[0].strip().lower()
    if cand_code_prefix:
        for k in grid.keys():
            if k == "GRAND TOTAL":
                continue
            k_code_prefix = k.split(" - ")[0].strip().lower()
            if cand_code_prefix == k_code_prefix:
                return k

    # 3. Containment fallback
    for k in grid.keys():
        if k == "GRAND TOTAL":
            continue
        k_norm = normalize_token(k)
        if cand_norm and (cand_norm in k_norm or k_norm in cand_norm):
            return k

    return None


class ISSPSingularityEngine:
    """
    Enforces absolute semantic, operational, and financial integrity 
    across all interrelated sections of the DICT ISSP v.2026 framework.
    Supports dynamic N-year horizons (1, 2, 3, 4, 5+ years) and dynamic criteria.
    """

    @staticmethod
    def validate_complete_issp_graph(db: Session, issp_period: str) -> Dict[str, Any]:
        """
        Traverses the full end-to-end dependency graph for the planning cycle:
        1. Legal Mandate & Leadership (Part I.A & I.B)
        2. Outcomes (Part I.A.4) -> Strategic Concerns (Part II.A)
        3. Strategic Concerns (Part II.A) -> Multi-Pathway Resolutions:
           - Validates resolution through Information Systems, Strategic Projects,
             Hardware Proposals, Network Infrastructures, or Needs Assessments.
        4. Information Systems -> ICT Projects (Part III.E)
        5. ICT Projects -> PMF Scorecard (Parts III.F.1 & III.F.2)
        6. Project & Proposal Integrity:
           - Verifies all approved proposals are bound to an ICT Project charter.
           - Enforces that no proposals stand alone without a project, as all proposals have costs
             and their categorizations (Internal, Cross-Agency, Continuing, Office Productivity)
             are strictly defined by their parent project.
           - Enforces that project-linked proposals have assigned outcomes and UACS object codes.
        7. Resource Deployments -> Tables B.1, B.2, B.3, B.4 Four-Way Parity (Part IV.B)
        8. Cross-Sectional Baselines (Annex 1 Hardware Obsolescence & Annex 2 DRBCP Continuity Funding)

        Raises an HTTPException with an itemized breakdown of any broken links.
        """
        from app.utils.helpers import get_cycle_year_range, get_governance_policy

        violations: List[str] = []

        # -------------------------------------------------------------
        # 1. ROOT NARRATIVE & STATUTORY MANDATE AUDIT (Part I.A & I.B)
        # -------------------------------------------------------------
        narrative = db.query(MasterNarrative).filter(MasterNarrative.issp_period == issp_period).first()
        if not narrative:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Planning cycle '{issp_period}' has not been configured in the database."
            )

        agency_label = getattr(narrative, "agency_name", None) or "Agency"
        mandate_text = (
            getattr(narrative, "mandate_text", None) or 
            getattr(narrative, "mandate_html", None) or 
            getattr(narrative, "legal_basis", None) or 
            ""
        )
        if len(mandate_text.strip()) < 15:
            violations.append("Part I.A.1 Legal Mandate: Missing statutory legal basis (Republic Act, BP, or Enabling Charter).")

        cio_signatory = (
            getattr(narrative, "cio_name", None) or 
            getattr(narrative, "signatory_prepared_by", None) or 
            ""
        )
        head_signatory = (
            getattr(narrative, "head_of_agency_name", None) or 
            getattr(narrative, "signatory_approved_by", None) or 
            ""
        )

        if not str(cio_signatory).strip() or not str(head_signatory).strip():
            violations.append("Part I.B Leadership: Both Chief Information Officer (CIO) and Head of Agency signatories are required.")

        # Dynamic Year Horizon Range (supports arbitrary 1 to N-year spans)
        year_range = get_cycle_year_range(narrative, issp_period)
        if not year_range and "-" in issp_period:
            try:
                parts = issp_period.split("-")
                start_year = int(parts[0])
                end_year = int(parts[1])
                year_range = list(range(start_year, end_year + 1))
            except Exception:
                year_range = [2026, 2027, 2028]
        start_year = year_range[0] if year_range else 2026
        end_year = year_range[-1] if year_range else 2028

        # -------------------------------------------------------------
        # 2. OUTCOMES -> STRATEGIC CONCERNS (Part I.A.4 -> Part II.A)
        # -------------------------------------------------------------
        outcomes = db.query(OrganizationalOutcome).filter(OrganizationalOutcome.issp_period == issp_period).all()
        if not outcomes:
            violations.append("Part I.A.4 Organizational Outcomes: No statutory outcomes (OO/MFO/SO) registered for this cycle.")

        for oo in outcomes:
            oo_title = getattr(oo, "outcome_name", None) or getattr(oo, "program_name", None) or f"Outcome ID {oo.id}"
            linked_concerns = db.query(StrategicConcern).filter(
                StrategicConcern.issp_period == issp_period,
                or_(
                    StrategicConcern.outcome_id == oo.id,
                    func.lower(func.trim(StrategicConcern.mfo)) == func.lower(func.trim(oo_title))
                )
            ).count()

            if linked_concerns == 0:
                violations.append(
                    f"Part II.A Strategic Disconnect: Outcome '{oo_title}' has no critical business systems "
                    "or operational bottlenecks mapped in Table II.A."
                )

        # -------------------------------------------------------------
        # 3. STRATEGIC CONCERNS -> RESOLUTION PATHWAYS (Part II.A -> 5 Valid Pathways)
        # -------------------------------------------------------------
        concerns = db.query(StrategicConcern).filter(StrategicConcern.issp_period == issp_period).all()
        systems = db.query(InformationSystem).filter(InformationSystem.issp_period == issp_period).all()

        for concern in concerns:
            c_text = (concern.critical_system or "").strip().lower()
            c_intended = (concern.intended_use or "").strip().lower()
            c_prob = (concern.problems or "").strip().lower()
            c_id = concern.id
            c_id_str = str(c_id).strip() if c_id else ""

            stop_words = {"system", "with", "from", "that", "this", "agency", "department", "user", "core", "into", "online", "office"}
            keywords = [
                w for w in re.split(r'[^a-z0-9]+', f"{c_text} {c_intended}") 
                if len(w) > 3 and w not in stop_words
            ]

            # Pathway 1: Information Systems
            sys_filters = []
            if c_id:
                sys_filters.append(InformationSystem.strategic_concern_id == c_id)
                sys_filters.append(cast(InformationSystem.strategic_concern_id, String) == c_id_str)
            if c_text:
                sys_filters.append(func.lower(func.trim(InformationSystem.name)) == c_text)
                sys_filters.append(func.lower(func.trim(InformationSystem.name)).contains(c_text))
            if keywords:
                sys_filters.extend([func.lower(InformationSystem.name).contains(kw) for kw in keywords])

            linked_systems = db.query(InformationSystem).filter(
                InformationSystem.issp_period == issp_period,
                or_(*sys_filters)
            ).count() if sys_filters else 0

            # Pathway 2: Strategic ICT Projects
            project_filters = []
            if hasattr(IctProject, "strategic_concern_id") and c_id:
                project_filters.append(getattr(IctProject, "strategic_concern_id") == c_id)
            if hasattr(IctProject, "outcome_id") and concern.outcome_id:
                project_filters.append(getattr(IctProject, "outcome_id") == concern.outcome_id)

            if c_text:
                project_filters.extend([
                    func.lower(func.trim(IctProject.project_title)).contains(c_text),
                    func.lower(func.trim(IctProject.description)).contains(c_text),
                    func.lower(func.trim(IctProject.objectives)).contains(c_text)
                ])
            if keywords:
                project_filters.extend([func.lower(IctProject.project_title).contains(kw) for kw in keywords])

            linked_projects = db.query(IctProject).filter(
                IctProject.issp_period == issp_period,
                or_(*project_filters)
            ).count() if project_filters else 0

            # Pathway 3: Hardware / Resource Proposals
            prop_filters = []
            if hasattr(Proposal, "strategic_concern_id") and c_id:
                prop_filters.append(getattr(Proposal, "strategic_concern_id") == c_id)
            if hasattr(Proposal, "outcome_id") and concern.outcome_id:
                prop_filters.append(Proposal.outcome_id == concern.outcome_id)

            if c_text:
                prop_filters.extend([
                    func.lower(func.trim(Proposal.item_name)).contains(c_text),
                    func.lower(func.trim(Proposal.justification)).contains(c_text)
                ])
            if keywords:
                prop_filters.extend([func.lower(Proposal.item_name).contains(kw) for kw in keywords])

            linked_proposals = db.query(Proposal).filter(
                Proposal.issp_period == issp_period,
                or_(*prop_filters)
            ).count() if prop_filters else 0

            # Pathway 4: Section 8.0 Department Needs Assessments
            needs_filters = []
            if c_id:
                needs_filters.append(NeedsAssessment.strategic_concern_id == c_id)
                needs_filters.append(cast(NeedsAssessment.strategic_concern_id, String) == c_id_str)
            if c_text:
                needs_filters.append(func.lower(func.trim(NeedsAssessment.title)).contains(c_text))
                needs_filters.append(func.lower(func.trim(NeedsAssessment.proposed_solution)).contains(c_text))
            if keywords:
                needs_filters.extend([func.lower(NeedsAssessment.title).contains(kw) for kw in keywords])

            linked_needs = db.query(NeedsAssessment).filter(
                or_(*needs_filters)
            ).count() if needs_filters else 0

            # Pathway 5: Network Infrastructure
            linked_network = 0
            is_network_related = any(
                kw in f"{c_text} {c_intended} {c_prob}" 
                for kw in ["network", "bandwidth", "fiber", "lan", "wan", "internet", "connectivity", "switch", "router", "datacenter", "data center", "ups", "generator", "power"]
            )
            if is_network_related:
                linked_network = db.query(NetworkInfrastructure).filter(
                    NetworkInfrastructure.issp_period == issp_period
                ).count()

            total_resolving_elements = linked_systems + linked_projects + linked_proposals + linked_needs + linked_network
            if total_resolving_elements == 0:
                violations.append(
                    f"Part II.A Strategic Disconnect: Strategic Concern '{concern.critical_system}' "
                    f"(OO: {concern.mfo}) is not addressed by any Information System, ICT Project, "
                    f"Hardware Deployment, Network Infrastructure, or Needs Assessment."
                )

        # Technical Staffing Feasibility
        filled_it_plantilla = db.query(func.sum(HumanCapital.it_positions_count)).filter(
            HumanCapital.issp_period == issp_period,
            HumanCapital.is_proposed == False,
            HumanCapital.employment_status.ilike("%filled%")
        ).scalar() or 0

        total_it_staff_positions = db.query(func.sum(IctStaffPosition.count)).filter(
            IctStaffPosition.issp_period == issp_period
        ).scalar() or 0

        total_available_it = filled_it_plantilla + total_it_staff_positions

        for sys in systems:
            # Check 3.0: Department Proposed System Review Status Gate
            if hasattr(sys, "submission_status"):
                sys_sub_status = str(getattr(sys, "submission_status", "Approved") or "Approved").strip().lower()
                if sys_sub_status in ["draft", "submitted", "returned"]:
                    violations.append(
                        f"Part III.D Pending System Proposal: System '{sys.name}' is currently in '{sys_sub_status.title()}' status. "
                        "All department-proposed systems must be reviewed and approved by the MIS Administrator prior to plan certification."
                    )
                    continue

            sys_status_val = str(getattr(sys.status, "value", sys.status or "")).strip()
            sys_status_lower = sys_status_val.lower()

            # Check 3.1: Multi-Classification Check
            is_support = bool(getattr(sys, "is_support_to_operations", False))
            is_admin = bool(getattr(sys, "is_general_administrative", False))
            is_operations = bool(getattr(sys, "is_operations", False))
            class_str = str(getattr(sys.classification, "value", sys.classification or "")).lower()

            if not (is_support or is_admin or is_operations):
                if "support" in class_str: is_support = True
                if "administrative" in class_str or "general administrative" in class_str: is_admin = True
                if "operations" in class_str and "support" not in class_str: is_operations = True

            if not (is_support or is_admin or is_operations):
                violations.append(
                    f"Parts II.C / III.D System Classification Missing: System '{sys.name}' must have at least one "
                    "classification selected (Support to Operations, General Administrative Systems, or Operations)."
                )

            # Check 3.2: Operations Sub-Classification
            if is_operations and (is_support or is_admin) and not getattr(sys, "is_frontline_service", False) and not getattr(sys, "is_non_frontline_service", False) and "frontline" not in class_str:
                is_operations = False

            if is_operations:
                is_front = bool(getattr(sys, "is_frontline_service", False)) or ("frontline" in class_str and "non-frontline" not in class_str)
                is_non_front = bool(getattr(sys, "is_non_frontline_service", False)) or ("non-frontline" in class_str)
                if not (is_front or is_non_front):
                    violations.append(
                        f"Parts II.C / III.D Operations Classification Incomplete: System '{sys.name}' is categorized under Operations "
                        "but specifies neither Frontline Service nor Non-Frontline Service."
                    )

            # Check 3.3: Enhancement Details Mandate
            if "enhancement" in sys_status_lower:
                enhancement_details = getattr(sys, "enhancement_details", None)
                if not enhancement_details or len(enhancement_details.strip()) < 10:
                    violations.append(
                        f"Part III.D Specification Incomplete: System '{sys.name}' has status 'For Enhancement' "
                        "but is missing mandatory enhancement details (DICT ISSP Guidelines p. 13)."
                    )

            # Check 3.4: Data Privacy Act / PIA Enforcement
            if sys.processes_personal_information and not sys.has_undergone_pia:
                has_pia_target = bool(getattr(sys, "pia_target_date_text", None) and str(sys.pia_target_date_text).strip())
                has_pia_milestone = False
                for proj in getattr(sys, "projects", []):
                    deliverables_corpus = []
                    annual_delivs = getattr(proj, "annual_deliverables", None)
                    if isinstance(annual_delivs, dict):
                        deliverables_corpus.extend([str(v) for v in annual_delivs.values() if v])

                    deliverables_corpus.extend([
                        getattr(proj, "year_1_deliverables", "") or "",
                        getattr(proj, "year_2_deliverables", "") or "",
                        getattr(proj, "year_3_deliverables", "") or ""
                    ])

                    milestones_text = " ".join(deliverables_corpus).lower()
                    if "pia" in milestones_text or "privacy impact" in milestones_text:
                        has_pia_milestone = True
                        break

                if not has_pia_milestone and not has_pia_target:
                    violations.append(
                        f"Part III.D Privacy Act Violation: System '{sys.name}' processes personal information (PIA=Yes) "
                        "without a completed audit, but no Target Audit Date is recorded and no milestone in Part III.E schedules a PIA."
                    )

            # Check 3.5: In-House Development Talent Feasibility
            sys_dev_strat = str(getattr(sys.development_strategy, "value", sys.development_strategy or "")).lower()
            if sys_status_lower in ("for development", "for_development"):
                if "in-house" in sys_dev_strat or "in_house" in sys_dev_strat:
                    if total_available_it == 0:
                        violations.append(
                            f"Part III.D Staffing Discrepancy: System '{sys.name}' is scheduled for 'In-House Development', "
                            f"but {agency_label} records 0 technical IT personnel across Part I.B.2 and Part III.C."
                        )

        # -------------------------------------------------------------
        # 4. INFORMATION SYSTEMS -> ICT PROJECTS (Parts II.C/III.D -> III.E)
        # -------------------------------------------------------------
        projects = db.query(IctProject).filter(IctProject.issp_period == issp_period).all()

        for sys in systems:
            sys_status_lower = str(getattr(sys.status, "value", sys.status or "")).lower()
            if sys_status_lower in ("for development", "for enhancement", "for_development", "for_enhancement"):
                s_name_clean = (sys.name or "").strip().lower()
                conditions = [
                    IctProject.system_id == sys.id,
                    func.lower(func.trim(IctProject.project_title)).contains(s_name_clean) if s_name_clean else False
                ]
                if getattr(sys, "project_id", None):
                    conditions.append(IctProject.id == sys.project_id)

                linked_proj = db.query(IctProject).filter(
                    IctProject.issp_period == issp_period,
                    or_(*conditions)
                ).first()

                if not linked_proj:
                    violations.append(
                        f"Part III.E Project Disconnect: Proposed Information System '{sys.name}' (Status: {sys.status}) "
                        "has no corresponding ICT Project registered under Part III.E to implement or upgrade it."
                    )

        # -------------------------------------------------------------
        # 5. ICT PROJECTS -> PMF SCORECARD & PROPOSALS (Part III.E -> Part III.F & IV.A)
        # -------------------------------------------------------------
        total_pmf_metrics = db.query(PerformanceMetric).filter(PerformanceMetric.issp_period == issp_period).count()
        if total_pmf_metrics == 0:
            violations.append("Part III.F PMF Scorecard: No Key Performance Indicators (KPIs) configured for this cycle.")

        for proj in projects:
            proj_title_clean = str(proj.project_title or "").strip()
            proj_cat_val = str(getattr(proj.project_category, "value", proj.project_category or "")).lower()

            metrics_count = db.query(PerformanceMetric).filter(
                PerformanceMetric.issp_period == issp_period,
                or_(
                    PerformanceMetric.project_id == proj.id,
                    func.lower(func.trim(PerformanceMetric.project_title)) == func.lower(proj_title_clean)
                )
            ).count()

            # Check 5.1: PMF Scorecard presence
            if metrics_count == 0:
                violations.append(
                    f"Part III.F PMF Disconnect: Project '{proj.project_title}' has no verifiable Key Performance Indicators in the PMF Scorecard."
                )

            # Check 5.2: Dynamic Multi-Year Milestones Completeness across Planning Span
            annual_delivs = getattr(proj, "annual_deliverables", None) or {}
            if isinstance(annual_delivs, str):
                try:
                    annual_delivs = json.loads(annual_delivs)
                except Exception:
                    annual_delivs = {}

            missing_years = []
            for idx, cal_year in enumerate(year_range):
                yr_label = f"Year {idx + 1}"
                deliverable = ""

                if isinstance(annual_delivs, dict):
                    deliverable = (
                        annual_delivs.get(yr_label) or 
                        annual_delivs.get(str(cal_year)) or 
                        annual_delivs.get(cal_year) or 
                        ""
                    )

                if not str(deliverable).strip():
                    if idx == 0:
                        deliverable = getattr(proj, "year_1_deliverables", "") or ""
                    elif idx == 1:
                        deliverable = getattr(proj, "year_2_deliverables", "") or ""
                    elif idx == 2:
                        deliverable = getattr(proj, "year_3_deliverables", "") or ""

                if not str(deliverable).strip():
                    missing_years.append(f"{yr_label} (FY {cal_year})")

            if missing_years:
                violations.append(
                    f"Part III.E Milestones Incomplete: Project '{proj.project_title}' must specify concrete deliverables for {', '.join(missing_years)}."
                )

            # Check 5.3: Strategic Alignment "Others (Specify)"
            if getattr(proj, "aligns_others", False):
                specify_text = (getattr(proj, "aligns_others_specify", "") or "").strip()
                if not specify_text:
                    violations.append(
                        f"Part III.E Strategic Alignment: Project '{proj.project_title}' has 'Others' flagged under Strategic Alignment but no specific directive was specified."
                    )

            # Check 5.4: Cross-Agency Leadership Accountability
            if "cross" in proj_cat_val:
                if not getattr(proj, "lead_agency", None) or not proj.lead_agency.strip():
                    violations.append(
                        f"Part III.E.2 Cross-Agency Accountability: Project '{proj.project_title}' must specify a designated Lead Agency."
                    )

            # Check 5.5: Project Funding Line Items exist in Part IV.A OR via linked system proposed costs
            line_items_count = db.query(Proposal).filter(
                Proposal.issp_period == issp_period,
                Proposal.project_id == proj.id,
                or_(Proposal.is_archived == False, Proposal.is_archived.is_(None)),
                func.lower(cast(Proposal.status, String)) == "approved"
            ).count()

            has_linked_system_cost = (
                proj.information_system and getattr(proj.information_system, 'proposed_cost', 0) > 0
            ) or any(
                getattr(s, 'proposed_cost', 0) > 0 for s in (proj.linked_systems or [])
            )

            if line_items_count == 0 and not has_linked_system_cost and "cross" not in proj_cat_val:
                violations.append(
                    f"Part IV.A Funding Disconnect: Project '{proj.project_title}' has no approved resource line items allocated in Part IV.A. "
                    "Link approved proposals to this project in the Projects Portfolio before compiling."
                )

        # -------------------------------------------------------------
        # 5.6 & 5.7: PLAN-COMMITTED PROPOSALS GOVERNANCE INTEGRITY
        # -------------------------------------------------------------
        # In DICT methodology, all proposals must bind to an authorized ICT Project.
        # No proposals stand alone without an ICT Project, since all outlays belong to a project charter.
        unlinked_approved_proposals = db.query(Proposal).filter(
            Proposal.issp_period == issp_period,
            func.lower(cast(Proposal.status, String)) == "approved",
            Proposal.project_id.is_(None),
            or_(Proposal.is_archived == False, Proposal.is_archived.is_(None))
        ).all()

        if unlinked_approved_proposals:
            sample_names = ", ".join(f"'{p.item_name}'" for p in unlinked_approved_proposals[:3])
            violations.append(
                f"Part IV.A Project Binding Required: There are {len(unlinked_approved_proposals)} approved proposal line item(s) "
                f"in the Intake Pool that are not yet bound to an ICT Project ({sample_names}). All proposals must be bound "
                "to an ICT Project in the Projects Portfolio (Part III.E) to establish their official categorization "
                "(Internal, Cross-Agency, Continuing Costs, Office Productivity, etc.) and be compiled into the plan."
            )

        active_plan_proposals = db.query(Proposal).filter(
            Proposal.issp_period == issp_period,
            func.lower(cast(Proposal.status, String)) == "approved",
            Proposal.project_id.isnot(None),
            or_(Proposal.is_archived == False, Proposal.is_archived.is_(None))
        ).all()

        unassigned_outcome_proposals = [p for p in active_plan_proposals if not p.outcome_id]
        if unassigned_outcome_proposals:
            violations.append(
                f"Part IV.A Governance Incomplete: There are {len(unassigned_outcome_proposals)} approved proposal line item(s) "
                "without an assigned Organizational Outcome (Part I.A.4). Administrators must assign program outcomes before final plan certification."
            )

        unassigned_uacs_proposals = [p for p in active_plan_proposals if not p.uacs_object_code or not str(p.uacs_object_code).strip()]
        if unassigned_uacs_proposals:
            violations.append(
                f"Part IV.A Accounting Incomplete: There are {len(unassigned_uacs_proposals)} approved proposal line item(s) "
                "without an assigned UACS Object Code (Table B.4). Administrators must verify UACS classifications prior to plan certification."
            )

        # -------------------------------------------------------------
        # 6. ANNEX 1 HARDWARE OBSOLESCENCE (Annex 1 -> Part IV.A)
        # -------------------------------------------------------------
        policy = get_governance_policy(db)
        buffer_units = policy.get("hardware_replacement_buffer_units", 3)
        status_col = cast(ExistingInventory.status, String)
        
        justified_replacement_capacity = db.query(func.sum(ExistingInventory.quantity)).filter(
            ExistingInventory.is_software == False,
            or_(
                ExistingInventory.issp_period == issp_period,
                ExistingInventory.issp_period.is_(None)
            ),
            ExistingInventory.replacement_proposal_id.is_(None),
            or_(
                ExistingInventory.is_end_of_life == True,
                ExistingInventory.status == AssetStatus.CONDEMNED,
                func.lower(status_col) == "condemned",
                func.lower(status_col) == "needs repair"
            )
        ).scalar() or 0

        proposals_to_check = db.query(Proposal).filter(
            Proposal.issp_period == issp_period,
            Proposal.is_expansion == False,
            Proposal.created_by_students == False,
            Proposal.is_in_house_turnover == False,
            func.lower(cast(Proposal.status, String)) == "approved",
            Proposal.project_id.isnot(None),
            or_(Proposal.is_archived == False, Proposal.is_archived.is_(None))
        ).all()

        replacement_hardware_requested = 0
        for p in proposals_to_check:
            strat_val = str(getattr(p.project_rel, "project_category", p.strategic_category or "")).lower()
            cat_val = str(getattr(p.category, "value", p.category or "")).lower()
            exp_val = str(getattr(p.expenditure_class, "value", p.expenditure_class or "")).lower()

            if "office productivity" in strat_val and ("hardware" in cat_val or "capital" in exp_val):
                qty = 0
                if p.yearly_quantities and isinstance(p.yearly_quantities, dict):
                    qty = (
                        p.yearly_quantities.get(str(start_year)) or
                        p.yearly_quantities.get(start_year) or
                        p.yearly_quantities.get("Year 1") or
                        0
                    )
                if qty == 0:
                    qty = getattr(p, "year_1_qty", 0) or 0
                replacement_hardware_requested += int(qty)

        if int(replacement_hardware_requested) > (int(justified_replacement_capacity) + buffer_units):
            violations.append(
                f"Annex 1 Obsolescence Breach: Requesting {replacement_hardware_requested} replacement hardware units in Year 1, "
                f"but Annex 1 records only {justified_replacement_capacity} unconsumed End of Life (EOL) or Condemned assets. "
                "Mark uncataloged additions as 'Expansion Projects' or update Annex 1 inventory."
            )

        # -------------------------------------------------------------
        # 7. ANNEX 2 DRBCP CONTINUITY FUNDING & GOVERNANCE
        # -------------------------------------------------------------
        drt_count = db.query(DisasterRecoveryTeam).filter(DisasterRecoveryTeam.issp_period == issp_period).count()
        if drt_count == 0:
            violations.append("Annex 2 DRBCP Disconnect: No Disaster Recovery Team (DRT) personnel configured.")

        critical_bias = db.query(BusinessImpactAnalysis).filter(
            BusinessImpactAnalysis.issp_period == issp_period,
            BusinessImpactAnalysis.rto_hours <= 4
        ).all()

        if critical_bias:
            cloud_backup_funding = db.query(func.sum(Proposal.total_cost)).filter(
                Proposal.issp_period == issp_period,
                func.lower(cast(Proposal.status, String)) == "approved",
                Proposal.project_id.isnot(None),
                or_(
                    func.lower(cast(Proposal.uacs_object_code, String)).like("%subscription%"),
                    func.lower(Proposal.item_name).like("%cloud%"),
                    func.lower(Proposal.item_name).like("%dr%"),
                    func.lower(Proposal.item_name).like("%backup%"),
                    func.lower(Proposal.item_name).like("%disaster%"),
                    func.lower(Proposal.item_name).like("%failover%"),
                    func.lower(Proposal.item_name).like("%replication%")
                ),
                or_(Proposal.is_archived == False, Proposal.is_archived.is_(None))
            ).scalar() or Decimal("0.00")

            if Decimal(str(cloud_backup_funding)) <= Decimal("0.00"):
                violations.append(
                    "Annex 2 DRBCP Funding Violation: Mission-critical systems have an RTO <= 4 hours "
                    "(mandating GovCloud / off-site mirror failover), but Part IV.A allocates ₱0.00 under an approved ICT Project for Cloud/DR Subscriptions."
                )

        # -------------------------------------------------------------
        # 8. FOUR-WAY PARITY ASSERTION (Part IV.A -> Part IV.B)
        # -------------------------------------------------------------
        parity_summary = ISSPSingularityEngine.calculate_part_iv_b_matrices(db, issp_period, only_approved=True)
        if not parity_summary["is_parity_valid"]:
            violations.append(
                f"Part IV.B Parity Mismatch: Four-Way reconciliation failed by ₱{parity_summary['parity_discrepancy']:,.2f}."
            )

        if violations:
            logger.error(f"ISSP Graph Singularity Validation Failed with {len(violations)} violations.")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    "error": "ISSP Singularity Integrity Check Failed",
                    "violations_count": len(violations),
                    "violations": violations
                }
            )

        logger.info("ISSP Graph Singularity successfully certified. End-to-end provenance guaranteed.")
        return {
            "status": "SUCCESS",
            "message": "Graph singularity certified. All relational chains and parity tables are sound.",
            "issp_period": issp_period,
            "certified_grand_total": str(parity_summary["certified_grand_total"]),
            "year_columns": parity_summary.get("year_columns", [])
        }

    @staticmethod
    def calculate_part_iv_b_matrices(db: Session, issp_period: str, only_approved: bool = False) -> Dict[str, Any]:
        """
        Dynamically calculates Part IV.B Summary of Investments across all four dimensions:
          B.1 General Summary (Dynamic Strategic Categories governed strictly per project)
          B.2 Fund Source (Dynamic Taxonomies inherited from parent project)
          B.3 Statement of Expenditure (Capital Outlay vs MOOE via UACS catalog & threshold)
          B.4 Object of Expenditure (Dynamic UACS Catalog from DB)

        Zero Discrepancy & Per-Project Categorization Guarantee:
          - Categorizations in Table B.1 and Fund Sources in Table B.2 are determined strictly
            by the parent ICT Project charter in Part III.E, NOT arbitrarily guessed per proposal.
          - In certified plan mode (`only_approved=True`), only proposals that are officially
            bound to an ICT Project (`Proposal.project_id IS NOT NULL`) are included.
            Unlinked proposals remain quarantined in the Intake Pool to prevent Table B.1 distortion.
          - Supports arbitrary multi-year spans (1 to N years) dynamically without static year assumptions.
        """
        from app.utils.helpers import get_cycle_year_range, get_adjusted_unit_cost_for_year, get_governance_policy

        narrative = db.query(MasterNarrative).filter(MasterNarrative.issp_period == issp_period).first()
        year_range = get_cycle_year_range(narrative, issp_period)
        if not year_range and "-" in issp_period:
            try:
                parts = issp_period.split("-")
                start_year = int(parts[0])
                end_year = int(parts[1])
                year_range = list(range(start_year, end_year + 1))
            except Exception:
                year_range = [2026, 2027, 2028]
        start_year = year_range[0] if year_range else 2026
        all_year_keys = [f"FY {y}" for y in year_range]

        policy = get_governance_policy(db)
        cap_threshold = policy.get("capitalization_threshold", Decimal("50000.00"))

        # -------------------------------------------------------------
        # 1. READ DYNAMIC STRATEGIC CATEGORIES (TABLE B.1) FROM DATABASE
        # -------------------------------------------------------------
        b1_keys: List[str] = []
        try:
            db_cats = db.query(StrategicCategory.name).filter(
                StrategicCategory.is_active == True
            ).order_by(StrategicCategory.order_index.asc()).all()
            for c in db_cats:
                if c[0] and c[0] not in b1_keys:
                    b1_keys.append(c[0])
        except Exception as e:
            logger.debug(f"Strategic categories query note: {e}")

        # Append any active categories present on ICT Projects in the portfolio
        proj_cats = db.query(IctProject.project_category).filter(
            IctProject.issp_period == issp_period
        ).distinct().all()
        for pc in proj_cats:
            cat_name = str(getattr(pc[0], 'value', pc[0]) or '').strip()
            if cat_name and not find_matching_key({k: 1 for k in b1_keys}, cat_name):
                b1_keys.append(cat_name)

        if not b1_keys:
            b1_keys = [
                "Office Productivity",
                "Internal ICT Projects",
                "Cross-Agency ICT Projects",
                "Continuing Costs/Expenses"
            ]

        # -------------------------------------------------------------
        # 2. READ DYNAMIC FUND SOURCES (TABLE B.2) FROM DATABASE
        # -------------------------------------------------------------
        b2_keys: List[str] = []
        try:
            db_funds = db.query(SystemTaxonomy.display_name).filter(
                SystemTaxonomy.taxonomy_type == "FUND_SOURCE",
                SystemTaxonomy.is_active == True
            ).order_by(SystemTaxonomy.order_index.asc()).all()
            for f in db_funds:
                if f[0] and f[0] not in b2_keys:
                    b2_keys.append(f[0])
        except Exception as e:
            logger.debug(f"Fund sources query note: {e}")

        proj_funds = db.query(IctProject.funding_source).filter(
            IctProject.issp_period == issp_period
        ).distinct().all()
        for pf in proj_funds:
            fund_name = str(getattr(pf[0], 'value', pf[0]) or '').strip()
            if fund_name and not find_matching_key({k: 1 for k in b2_keys}, fund_name):
                b2_keys.append(fund_name)

        if not b2_keys:
            b2_keys = [
                "General Appropriations Act (GAA)",
                "Foreign-Assisted Projects (FAP)",
                "Locally Funded",
                "Other Income Generating Sources"
            ]

        # -------------------------------------------------------------
        # 3. READ DYNAMIC EXPENDITURE CLASSES (TABLE B.3) FROM DATABASE
        # -------------------------------------------------------------
        b3_keys: List[str] = []
        try:
            db_exp_classes = db.query(UacsCatalogItem.expenditure_class).filter(
                UacsCatalogItem.is_active == True
            ).distinct().all()
            for ec in db_exp_classes:
                if ec[0] and ec[0] not in b3_keys:
                    b3_keys.append(ec[0])
        except Exception:
            pass

        if not b3_keys:
            b3_keys = ["Capital Outlay", "Maintenance and Other Operating Expenses"]

        # -------------------------------------------------------------
        # 4. READ DYNAMIC UACS CATALOG (TABLE B.4) FROM DATABASE
        # -------------------------------------------------------------
        b4_keys: List[str] = []
        uacs_dict: Dict[str, Any] = {}
        try:
            db_uacs = db.query(UacsCatalogItem).filter(
                UacsCatalogItem.is_active == True
            ).order_by(UacsCatalogItem.id.asc()).all()
            for u in db_uacs:
                full_title = f"{u.uacs_code} - {u.account_title}"
                if full_title not in b4_keys:
                    b4_keys.append(full_title)
                uacs_dict[u.uacs_code] = u
                uacs_dict[full_title] = u
        except Exception as e:
            logger.debug(f"UACS catalog query note: {e}")

        if not b4_keys:
            b4_keys = [
                "50604050 03 - ICT Equipment (CO)",
                "50604050 07 - Printing Equipment (CO)",
                "50604070 01 - ICT Software (Perpetual CO)",
                "50203210 03 - Semi-Expendable ICT Equipment (MOOE)",
                "50203210 07 - Semi-Expendable Printing Equipment (MOOE)",
                "50299070 00 - ICT Software Subscription (MOOE)",
                "50202010 00 - Training Expenses (MOOE)",
                "50211030 00 - Consulting/Outsourced Development (MOOE)"
            ]
        # Ensure all systems with an active proposed cost are synchronized into proposals before running the pivot
        try:
            from app.utils.helpers import sync_system_proposal
            systems_with_cost = db.query(InformationSystem).filter(
                InformationSystem.issp_period == issp_period,
                InformationSystem.proposed_cost > 0
            ).all()
            for s_cost_item in systems_with_cost:
                sync_system_proposal(db, s_cost_item)
            db.flush()
        except Exception as sync_err:
            logger.debug(f"Pre-parity system sync note: {sync_err}")

        # -------------------------------------------------------------
        # 5. QUERY PROPOSAL LINE ITEMS (ACTIVE/NON-ARCHIVED)
        # -------------------------------------------------------------
        query = db.query(Proposal).options(
            joinedload(Proposal.project_rel),
            joinedload(Proposal.strategic_category_rel),
            joinedload(Proposal.outcome)
        ).filter(
            Proposal.issp_period == issp_period,
            or_(Proposal.is_archived == False, Proposal.is_archived.is_(None))
        )

        if only_approved:
            # Categorization is strictly per project.
            # In certified plan compilation (only_approved=True):
            # Only approved proposals bound to an ICT Project are compiled into the official plan.
            # Unlinked proposals remain in the intake pool and are quarantined from the official plan.
            query = query.filter(
                func.lower(cast(Proposal.status, String)) == "approved",
                Proposal.project_id.isnot(None)
            )

        items = query.all()

        # Dynamically append any custom project categories, fund sources, or UACS codes
        for itm in items:
            proj = itm.project_rel
            if not proj and itm.project_id:
                proj = db.query(IctProject).filter(IctProject.id == itm.project_id).first()

            proj_cat = getattr(proj.project_category, "value", proj.project_category) if proj and getattr(proj, "project_category", None) else None
            item_cat = getattr(itm.strategic_category, "value", itm.strategic_category)
            sc = str(proj_cat or item_cat or "").strip()
            if sc and sc not in b1_keys and sc != "GRAND TOTAL":
                if not find_matching_key({k: 1 for k in b1_keys}, sc):
                    b1_keys.append(sc)

            proj_fund = getattr(proj.funding_source, "value", proj.funding_source) if proj and getattr(proj, "funding_source", None) else None
            item_fund = getattr(itm.fund_source, "value", itm.fund_source)
            fs = str(proj_fund or item_fund or "").strip()
            if fs and fs not in b2_keys and fs != "GRAND TOTAL":
                if not find_matching_key({k: 1 for k in b2_keys}, fs):
                    b2_keys.append(fs)

            u_code = str(getattr(itm.uacs_object_code, "value", itm.uacs_object_code or "")).strip()
            if u_code and u_code not in b4_keys and u_code != "GRAND TOTAL":
                if not find_matching_key({k: 1 for k in b4_keys}, u_code):
                    b4_keys.append(u_code)

        def make_grid_row():
            row = {y: Decimal("0.00") for y in all_year_keys}
            row["Total"] = Decimal("0.00")
            return row

        b1 = {cat: make_grid_row() for cat in b1_keys}
        b1["GRAND TOTAL"] = make_grid_row()

        b2 = {src: make_grid_row() for src in b2_keys}
        b2["GRAND TOTAL"] = make_grid_row()

        b3 = {exp: make_grid_row() for exp in b3_keys}
        b3["GRAND TOTAL"] = make_grid_row()

        b4 = {code: make_grid_row() for code in b4_keys}
        b4["GRAND TOTAL"] = make_grid_row()

        # -------------------------------------------------------------
        # 6. ACCUMULATE PROPOSAL LINE ITEMS (EXACT PIVOT OF PART IV.A)
        # -------------------------------------------------------------
        for item in items:
            base_unit_cost = item.unit_cost if item.unit_cost is not None else Decimal("0.00")
            line_total = Decimal("0.00")
            year_costs: Dict[str, Decimal] = {}

            # Parse yearly_quantities safely
            y_quantities = item.yearly_quantities
            if isinstance(y_quantities, str):
                try:
                    y_quantities = json.loads(y_quantities)
                except Exception:
                    y_quantities = {}
            if not isinstance(y_quantities, dict):
                y_quantities = {}

            for yr in year_range:
                y_header = f"FY {yr}"
                qty = None

                # Search by calendar year key, integer key, or ordinal 'Year X'
                if str(yr) in y_quantities:
                    qty = y_quantities[str(yr)]
                elif yr in y_quantities:
                    qty = y_quantities[yr]
                else:
                    idx = yr - start_year + 1
                    for possible_key in [f"Year {idx}", f"year {idx}", f"Year{idx}", f"year_{idx}", str(idx)]:
                        if possible_key in y_quantities:
                            qty = y_quantities[possible_key]
                            break

                if qty is None or qty == 0:
                    idx = yr - start_year + 1
                    if idx == 1:
                        qty = getattr(item, "year_1_qty", 0) or 0
                    elif idx == 2:
                        qty = getattr(item, "year_2_qty", 0) or 0
                    elif idx == 3:
                        qty = getattr(item, "year_3_qty", 0) or 0

                try:
                    qty_int = int(qty) if qty is not None else 0
                except (ValueError, TypeError):
                    qty_int = 0

                adj_unit = get_adjusted_unit_cost_for_year(db, base_unit_cost, yr, start_year)
                c_yr = Decimal(qty_int) * adj_unit
                year_costs[y_header] = c_yr
                line_total += c_yr

            # Fallback: if line_total is zero but item has total_cost > 0, allocate to base year
            if line_total == Decimal("0.00") and item.total_cost and item.total_cost > Decimal("0.00"):
                first_hdr = f"FY {start_year}"
                year_costs[first_hdr] = Decimal(str(item.total_cost))
                line_total = Decimal(str(item.total_cost))

            # Resolve project relationship and strict inheritance
            proj = item.project_rel
            if not proj and item.project_id:
                proj = db.query(IctProject).filter(IctProject.id == item.project_id).first()

            # 6.1 Table B.1 (General Summary) - Strictly Inherits Parent Project Category
            if proj and getattr(proj, "project_category", None):
                resolved_cat = str(getattr(proj.project_category, "value", proj.project_category)).strip()
            else:
                resolved_cat = str(getattr(item.strategic_category, "value", item.strategic_category or "Office Productivity")).strip()

            cat_key = find_matching_key(b1, resolved_cat) or b1_keys[0]
            if cat_key not in b1:
                b1[cat_key] = make_grid_row()
            for y_header, c_yr in year_costs.items():
                b1[cat_key][y_header] += c_yr
            b1[cat_key]["Total"] += line_total

            # 6.2 Table B.2 (Fund Source) - Strictly Inherits Parent Project Fund Source
            if proj and getattr(proj, "funding_source", None):
                resolved_fund = str(getattr(proj.funding_source, "value", proj.funding_source)).strip()
            else:
                resolved_fund = str(getattr(item.fund_source, "value", item.fund_source or "General Appropriations Act (GAA)")).strip()

            fund_key = find_matching_key(b2, resolved_fund) or b2_keys[0]
            if fund_key not in b2:
                b2[fund_key] = make_grid_row()
            for y_header, c_yr in year_costs.items():
                b2[fund_key][y_header] += c_yr
            b2[fund_key]["Total"] += line_total

            # 6.3 Table B.3 (Statement of Expenditure - Capital Outlay vs MOOE)
            exp_val = str(getattr(item.expenditure_class, "value", item.expenditure_class or "")).strip()
            cat_val = str(getattr(item.category, "value", item.category or "")).strip().lower()
            item_name_lower = (item.item_name or "").lower()
            uacs_val = str(getattr(item.uacs_object_code, "value", item.uacs_object_code or "")).strip()

            if "subscription" in cat_val or any(k in item_name_lower for k in ["subscription", "cloud license", "saas", "recurring license"]):
                exp_key = "Maintenance and Other Operating Expenses"
            elif getattr(item, "created_by_students", False) or getattr(item, "is_in_house_turnover", False):
                exp_key = "Capital Outlay"
            else:
                matched_uacs = None
                if uacs_val:
                    prefix = uacs_val.split(" - ")[0].strip()
                    matched_uacs = uacs_dict.get(prefix) or uacs_dict.get(uacs_val)
                    if not matched_uacs:
                        matched_uacs = db.query(UacsCatalogItem).filter(
                            or_(UacsCatalogItem.uacs_code == prefix, UacsCatalogItem.uacs_code == uacs_val)
                        ).first()

                if matched_uacs and matched_uacs.expenditure_class:
                    exp_key = find_matching_key(b3, matched_uacs.expenditure_class)
                else:
                    exp_key = find_matching_key(b3, exp_val)

                if not exp_key:
                    exp_key = "Capital Outlay" if (
                        exp_val.lower().startswith("capital") or base_unit_cost >= cap_threshold
                    ) else "Maintenance and Other Operating Expenses"

            if exp_key not in b3:
                exp_key = "Capital Outlay" if "capital" in exp_key.lower() else "Maintenance and Other Operating Expenses"
            for y_header, c_yr in year_costs.items():
                b3[exp_key][y_header] += c_yr
            b3[exp_key]["Total"] += line_total

            # 6.4 Table B.4 (Object of Expenditure / UACS)
            uacs_key = find_matching_key(b4, uacs_val)
            if not uacs_key:
                code_prefix = uacs_val.split(" - ")[0].strip() if uacs_val else ""
                uacs_key = next((k for k in b4_keys if k.startswith(code_prefix)), None)
                if not uacs_key:
                    uacs_key = uacs_val if uacs_val else b4_keys[0]
                    if uacs_key not in b4:
                        b4[uacs_key] = make_grid_row()
                        b4_keys.append(uacs_key)

            if uacs_key not in b4:
                b4[uacs_key] = make_grid_row()
            for y_header, c_yr in year_costs.items():
                b4[uacs_key][y_header] += c_yr
            b4[uacs_key]["Total"] += line_total

        # -------------------------------------------------------------
        # 7. GRAND TOTALS CALCULATION (ZERO DISCREPANCY GUARANTEE)
        # -------------------------------------------------------------
        for k in b1.keys():
            if k not in b1_keys and k != "GRAND TOTAL": b1_keys.append(k)
        for k in b2.keys():
            if k not in b2_keys and k != "GRAND TOTAL": b2_keys.append(k)
        for k in b3.keys():
            if k not in b3_keys and k != "GRAND TOTAL": b3_keys.append(k)
        for k in b4.keys():
            if k not in b4_keys and k != "GRAND TOTAL": b4_keys.append(k)

        for yr_col in all_year_keys + ["Total"]:
            b1["GRAND TOTAL"][yr_col] = sum((b1[k][yr_col] for k in b1.keys() if k != "GRAND TOTAL"), Decimal("0.00")).quantize(Decimal("0.01"))
            b2["GRAND TOTAL"][yr_col] = sum((b2[k][yr_col] for k in b2.keys() if k != "GRAND TOTAL"), Decimal("0.00")).quantize(Decimal("0.01"))
            b3["GRAND TOTAL"][yr_col] = sum((b3[k][yr_col] for k in b3.keys() if k != "GRAND TOTAL"), Decimal("0.00")).quantize(Decimal("0.01"))
            b4["GRAND TOTAL"][yr_col] = sum((b4[k][yr_col] for k in b4.keys() if k != "GRAND TOTAL"), Decimal("0.00")).quantize(Decimal("0.01"))

        t_b1 = b1["GRAND TOTAL"]["Total"].quantize(Decimal("0.01"))
        t_b2 = b2["GRAND TOTAL"]["Total"].quantize(Decimal("0.01"))
        t_b3 = b3["GRAND TOTAL"]["Total"].quantize(Decimal("0.01"))
        t_b4 = b4["GRAND TOTAL"]["Total"].quantize(Decimal("0.01"))

        is_parity_valid = (t_b1 == t_b2 == t_b3 == t_b4)
        parity_discrepancy = max(abs(t_b1 - t_b2), abs(t_b1 - t_b3), abs(t_b1 - t_b4))

        return {
            "b1_general_summary": b1,
            "b2_fund_source": b2,
            "b3_statement_of_expenditure": b3,
            "b4_object_of_expenditure": b4,
            "certified_grand_total": t_b1,
            "is_parity_valid": is_parity_valid,
            "parity_discrepancy": parity_discrepancy,
            "year_columns": all_year_keys
        }