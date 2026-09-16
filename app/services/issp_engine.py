# app/services/issp_engine.py
import json
import logging
from decimal import Decimal
from typing import Dict, Any, List, Tuple, Optional
from sqlalchemy import func, or_
from sqlalchemy.orm import Session
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
    ProjectCategory,
    ProposalCategory,
    ExpenditureClass,
    FundSource,
    OfficeLocation,
    UacsObjectCode,
    SystemStatus,
    DevelopmentStrategy,
    AssetStatus
)

logger = logging.getLogger(__name__)


def find_matching_key(grid: dict, candidate_val: Any, enum_cls: Any = None) -> Optional[str]:
    """
    Defensively matches enum instances, string values, or member names to dictionary keys.
    Normalizes whitespace, hyphens, and casing to prevent silent parity drops.
    """
    if candidate_val is None:
        return None
    cand_str = str(getattr(candidate_val, "value", candidate_val) or "").strip()
    cand_norm = cand_str.lower().replace(" ", "").replace("_", "").replace("-", "")

    # 1. Exact, case-insensitive, or normalized match against grid keys
    for k in grid.keys():
        if k == "GRAND TOTAL":
            continue
        k_norm = k.lower().replace(" ", "").replace("_", "").replace("-", "")
        if k == cand_str or k.lower() == cand_str.lower() or k_norm == cand_norm:
            return k

    # 2. Check canonical enum class members if provided
    if enum_cls:
        for member in enum_cls:
            m_name = member.name.lower().replace("_", "")
            m_val = member.value.lower().replace(" ", "").replace("_", "").replace("-", "")
            if (
                member.name == cand_str or 
                member.name.lower() == cand_str.lower() or 
                m_name == cand_norm or
                m_val == cand_norm or
                cand_str.lower() in member.value.lower()
            ):
                if member.value in grid:
                    return member.value

    return None


class ISSPSingularityEngine:
    """
    Enforces absolute semantic, operational, and financial integrity 
    across all interrelated sections of the DICT ISSP v.2026 framework.
    """

    @staticmethod
    def validate_complete_issp_graph(db: Session, issp_period: str) -> Dict[str, Any]:
        """
        Traverses the full dependency graph for the planning cycle:
        Legal Mandate -> Outcomes -> Strategic Concerns -> Information Systems -> 
        ICT Projects -> PMF Scorecard -> Resource Deployment (Part IV.A) -> Annex 1 & 2.

        Raises an HTTPException with an itemized breakdown of any broken links.
        """
        violations: List[str] = []

        # -------------------------------------------------------------
        # 1. ROOT NARRATIVE & STATUTORY MANDATE AUDIT
        # -------------------------------------------------------------
        narrative = db.query(MasterNarrative).filter(MasterNarrative.issp_period == issp_period).first()
        if not narrative:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Planning cycle '{issp_period}' has not been configured in the database."
            )

        agency_label = getattr(narrative, "agency_name", None) or "Agency"
        mandate_text = getattr(narrative, "mandate_html", None) or getattr(narrative, "legal_basis", None) or ""
        if len(mandate_text.strip()) < 15:
            violations.append("Part I.A.1 Legal Mandate: Missing statutory legal basis (Republic Act, BP, or Charter).")

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

        if not cio_signatory.strip() or not head_signatory.strip():
            violations.append("Part I.B Leadership: Both Chief Information Officer (CIO) and Head of Agency signatories are required.")

        start_year = narrative.issp_period_from or 2026
        end_year = narrative.issp_period_to or (start_year + 2)
        plan_span = max(1, end_year - start_year + 1)

        # -------------------------------------------------------------
        # 2. STRATEGIC PROVENANCE (Outcomes -> Strategic Concerns)
        # -------------------------------------------------------------
        outcomes = db.query(OrganizationalOutcome).filter(OrganizationalOutcome.issp_period == issp_period).all()
        if not outcomes:
            violations.append("Part I.A.4 Organizational Outcomes: No legal outcomes (OO/MFO/SO) registered for this cycle.")

        for oo in outcomes:
            oo_title = getattr(oo, "outcome_name", None) or getattr(oo, "program_name", None) or f"Outcome ID {oo.id}"
            linked_concerns = db.query(StrategicConcern).filter(
                StrategicConcern.issp_period == issp_period,
                or_(
                    StrategicConcern.outcome_id == oo.id,
                    StrategicConcern.mfo == oo_title
                )
            ).count()

            if linked_concerns == 0:
                violations.append(
                    f"Part II.A Strategic Disconnect: Outcome '{oo_title}' has no critical business systems "
                    "or operational bottlenecks mapped in Table II.A."
                )

        # -------------------------------------------------------------
        # 3. INFORMATION SYSTEMS (PIA & Human Capital Feasibility)
        # -------------------------------------------------------------
        systems = db.query(InformationSystem).filter(InformationSystem.issp_period == issp_period).all()
        if not systems:
            violations.append("Parts II.C & III.D: No operational or proposed Information Systems registered.")

        # Aggregate total IT personnel across Part I.B.2 and Part III.C staff tables
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
            # Check 3.1: Data Privacy Act of 2012 / PIA Enforcement
            if sys.processes_personal_information and not sys.has_undergone_pia:
                has_pia_milestone = False
                for proj in sys.projects:
                    # Scan both dynamic deliverables dictionary and legacy fields
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

                if not has_pia_milestone:
                    violations.append(
                        f"Part III.D Privacy Act Violation: System '{sys.name}' processes personal information (PIA=Yes) "
                        "without a completed audit, but no milestone in Part III.E schedules a Privacy Impact Assessment (PIA)."
                    )

            # Check 3.2: In-House Development Talent Feasibility
            sys_status_val = getattr(sys.status, "value", sys.status)
            sys_dev_strat = getattr(sys.development_strategy, "value", sys.development_strategy)
            
            if sys_status_val in [SystemStatus.FOR_DEVELOPMENT.value, "For Development"]:
                if sys_dev_strat in [DevelopmentStrategy.IN_HOUSE.value, "In-House Development"]:
                    if total_available_it == 0:
                        violations.append(
                            f"Part III.D Staffing Discrepancy: System '{sys.name}' is scheduled for 'In-House Development', "
                            f"but {agency_label} records 0 technical IT personnel across Part I.B.2 and Part III.C."
                        )

        # -------------------------------------------------------------
        # 4. ICT PROJECTS & PMF TRACEABILITY (Part III.E -> Part III.F)
        # -------------------------------------------------------------
        projects = db.query(IctProject).filter(IctProject.issp_period == issp_period).all()
        if not projects:
            violations.append("Part III.E: No strategic ICT Projects configured.")

        for proj in projects:
            # Verify PMF Scorecard presence
            metrics_count = db.query(PerformanceMetric).filter(
                PerformanceMetric.issp_period == issp_period,
                or_(
                    PerformanceMetric.project_id == proj.id,
                    PerformanceMetric.project_title == proj.project_title
                )
            ).count()
            if metrics_count == 0:
                violations.append(
                    f"Part III.F PMF Disconnect: Project '{proj.project_title}' has no verifiable Key Performance Indicators in the PMF Scorecard."
                )

            # Dynamically verify Milestones across complete planning horizon span (1 to N Years)
            missing_years = []
            annual_delivs = getattr(proj, "annual_deliverables", None) or {}

            for idx in range(plan_span):
                yr_label = f"Year {idx + 1}"
                cal_year = start_year + idx
                deliverable = ""

                if isinstance(annual_delivs, dict):
                    deliverable = (
                        annual_delivs.get(yr_label) or 
                        annual_delivs.get(str(cal_year)) or 
                        annual_delivs.get(cal_year) or 
                        ""
                    )

                # Fallback to legacy attributes if not defined in annual_deliverables dict
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

            # Verify Strategic Alignment "Others (Specify)" completeness
            if getattr(proj, "aligns_others", False):
                specify_text = (getattr(proj, "aligns_others_specify", "") or "").strip()
                if not specify_text:
                    violations.append(
                        f"Part III.E Strategic Alignment: Project '{proj.project_title}' has 'Others' flagged under Strategic Alignment but no specific program was specified."
                    )

            # Verify Cross-Agency Leadership Accountability
            proj_cat_val = getattr(proj.project_category, "value", str(proj.project_category))
            if "cross" in proj_cat_val.lower():
                if not getattr(proj, "lead_agency", None) or not proj.lead_agency.strip():
                    violations.append(
                        f"Part III.E.2 Cross-Agency Accountability: Project '{proj.project_title}' must specify a designated Lead Agency."
                    )

            # Verify Project Funding Line Items exist in Part IV.A
            line_items_count = db.query(Proposal).filter(
                Proposal.project_id == proj.id,
                or_(Proposal.is_archived == False, Proposal.is_archived.is_(None))
            ).count()
            if line_items_count == 0 and "cross" not in proj_cat_val.lower():
                violations.append(
                    f"Part IV.A Funding Disconnect: Internal project '{proj.project_title}' has no resource line items allocated in the budget tables."
                )

        # -------------------------------------------------------------
        # 5. ANNEX 1 HARDWARE OBSOLESCENCE (Annex 1 -> Part IV.A)
        # -------------------------------------------------------------
        justified_replacement_capacity = db.query(func.sum(ExistingInventory.quantity)).filter(
            ExistingInventory.is_software == False,
            or_(
                ExistingInventory.is_end_of_life == True,
                ExistingInventory.status == AssetStatus.CONDEMNED,
                getattr(ExistingInventory, "status", None) == "Condemned"
            )
        ).scalar() or 0

        proposals_to_check = db.query(Proposal).filter(
            Proposal.issp_period == issp_period,
            Proposal.is_expansion == False,
            or_(Proposal.is_archived == False, Proposal.is_archived.is_(None))
        ).all()

        replacement_hardware_requested = 0
        for p in proposals_to_check:
            # Exclude student software turnover if flag exists
            if getattr(p, "created_by_students", False):
                continue

            strat_val = getattr(p.strategic_category, "value", str(p.strategic_category))
            cat_val = getattr(p.category, "value", str(p.category))
            exp_val = getattr(p.expenditure_class, "value", str(p.expenditure_class))
            if strat_val == ProjectCategory.OFFICE_PRODUCTIVITY.value and (
                cat_val == ProposalCategory.HARDWARE.value or exp_val == ExpenditureClass.CAPITAL_OUTLAY.value
            ):
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

        if int(replacement_hardware_requested) > (int(justified_replacement_capacity) + 5):
            violations.append(
                f"Annex 1 Obsolescence Breach: Requesting {replacement_hardware_requested} replacement hardware units in Year 1, "
                f"but Annex 1 records only {justified_replacement_capacity} End of Life (EOL) or Condemned assets. "
                "Mark uncataloged additions as 'Expansion Projects' or update Annex 1 inventory."
            )

        # -------------------------------------------------------------
        # 6. ANNEX 2 DRBCP CONTINUITY FUNDING & GOVERNANCE
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
                Proposal.strategic_category.in_([ProjectCategory.CONTINUING_COSTS, ProjectCategory.CONTINUING_COSTS.value]),
                Proposal.uacs_object_code.in_([UacsObjectCode.ICT_SOFTWARE_SUBSCRIPTION, UacsObjectCode.ICT_SOFTWARE_SUBSCRIPTION.value]),
                or_(Proposal.is_archived == False, Proposal.is_archived.is_(None))
            ).scalar() or Decimal("0.00")

            if Decimal(str(cloud_backup_funding)) <= Decimal("0.00"):
                violations.append(
                    "Annex 2 DRBCP Funding Violation: Mission-critical systems have an RTO <= 4 hours "
                    "(mandating GovCloud / off-site mirror failover), but Part IV.A allocates ₱0.00 under Continuing Costs for Cloud/DR Subscriptions."
                )

        # -------------------------------------------------------------
        # 7. PARITY VERIFICATION (Pre-Flight Check)
        # -------------------------------------------------------------
        parity_summary = ISSPSingularityEngine.calculate_part_iv_b_matrices(db, issp_period)
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
    def calculate_part_iv_b_matrices(db: Session, issp_period: str) -> Dict[str, Any]:
        """
        Dynamically calculates Part IV.B Summary of Investments across all four dimensions:
          B.1 General Summary
          B.2 Fund Source
          B.3 Statement of Expenditure (Capital Outlay vs MOOE)
          B.4 Object of Expenditure (UACS Account Codes, including ICT_TRAINING)

        Supports arbitrary multi-year spans (1 to N years) and enforces identical grand totals
        ($B.1 == B.2 == B.3 == B.4$) down to the exact centavo.
        """
        narrative = db.query(MasterNarrative).filter(MasterNarrative.issp_period == issp_period).first()
        start_year = narrative.issp_period_from if narrative else None
        end_year = narrative.issp_period_to if narrative else None

        if not start_year or not end_year:
            parts = issp_period.split("-")
            if len(parts) == 2 and parts[0].isdigit() and parts[1].isdigit():
                start_year = int(parts[0])
                end_year = int(parts[1])
            else:
                start_year = 2026
                end_year = 2028

        if end_year < start_year:
            end_year = start_year

        years_range = list(range(start_year, end_year + 1))
        year_headers = [f"FY {y}" for y in years_range]

        items = db.query(Proposal).filter(
            Proposal.issp_period == issp_period,
            or_(Proposal.is_archived == False, Proposal.is_archived.is_(None))
        ).all()

        def make_grid_row():
            row = {y: Decimal("0.00") for y in year_headers}
            row["Total"] = Decimal("0.00")
            return row

        # Table B.1: General Summary
        b1 = {cat.value: make_grid_row() for cat in ProjectCategory}
        b1["GRAND TOTAL"] = make_grid_row()

        # Table B.2: Fund Source
        b2 = {src.value: make_grid_row() for src in FundSource}
        b2["GRAND TOTAL"] = make_grid_row()

        # Table B.3: Statement of Expenditure
        b3 = {exp.value: make_grid_row() for exp in ExpenditureClass}
        b3["GRAND TOTAL"] = make_grid_row()

        # Table B.4: Object of Expenditure (Includes UacsObjectCode.ICT_TRAINING)
        b4 = {code.value: make_grid_row() for code in UacsObjectCode}
        b4["GRAND TOTAL"] = make_grid_row()

        # Compute row values dynamically from atomic proposals across all active years
        for item in items:
            unit_cost = item.unit_cost if item.unit_cost is not None else Decimal("0.00")
            c_total = Decimal("0.00")
            year_costs: Dict[str, Decimal] = {}

            # Parse yearly_quantities defensively if stored as a JSON string
            y_quantities = item.yearly_quantities
            if isinstance(y_quantities, str):
                try:
                    y_quantities = json.loads(y_quantities)
                except Exception:
                    y_quantities = {}

            for yr in years_range:
                y_header = f"FY {yr}"
                qty = 0
                if y_quantities and isinstance(y_quantities, dict):
                    qty = y_quantities.get(str(yr))
                    if qty is None:
                        qty = y_quantities.get(yr)
                    if qty is None:
                        idx = yr - start_year + 1
                        qty = y_quantities.get(f"Year {idx}")

                if qty is None or qty == 0:
                    if yr == start_year:
                        qty = getattr(item, "year_1_qty", 0) or 0
                    elif yr == start_year + 1:
                        qty = getattr(item, "year_2_qty", 0) or 0
                    elif yr == start_year + 2:
                        qty = getattr(item, "year_3_qty", 0) or 0

                try:
                    qty_int = int(qty) if qty is not None else 0
                except (ValueError, TypeError):
                    qty_int = 0

                c_yr = Decimal(qty_int) * unit_cost
                year_costs[y_header] = c_yr
                c_total += c_yr

            # 1. Map into Table B.1 General Summary
            cat_key = find_matching_key(b1, item.strategic_category, ProjectCategory)
            if cat_key:
                for y_header, c_yr in year_costs.items():
                    b1[cat_key][y_header] += c_yr
                b1[cat_key]["Total"] += c_total

            # 2. Map into Table B.2 Fund Source
            src_key = find_matching_key(b2, item.fund_source, FundSource)
            if src_key:
                for y_header, c_yr in year_costs.items():
                    b2[src_key][y_header] += c_yr
                b2[src_key]["Total"] += c_total

            # 3. Map into Table B.3 Statement of Expenditure
            exp_key = find_matching_key(b3, item.expenditure_class, ExpenditureClass)
            if exp_key:
                for y_header, c_yr in year_costs.items():
                    b3[exp_key][y_header] += c_yr
                b3[exp_key]["Total"] += c_total

            # 4. Map into Table B.4 Object of Expenditure (UACS)
            uacs_key = find_matching_key(b4, item.uacs_object_code, UacsObjectCode)
            if uacs_key:
                for y_header, c_yr in year_costs.items():
                    b4[uacs_key][y_header] += c_yr
                b4[uacs_key]["Total"] += c_total

        # Compute Grand Totals across all periods
        for yr in year_headers + ["Total"]:
            b1["GRAND TOTAL"][yr] = sum((b1[cat.value][yr] for cat in ProjectCategory), Decimal("0.00"))
            b2["GRAND TOTAL"][yr] = sum((b2[src.value][yr] for src in FundSource), Decimal("0.00"))
            b3["GRAND TOTAL"][yr] = sum((b3[exp.value][yr] for exp in ExpenditureClass), Decimal("0.00"))
            b4["GRAND TOTAL"][yr] = sum((b4[code.value][yr] for code in UacsObjectCode), Decimal("0.00"))

        # Exact centavo parity verification
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
            "year_columns": year_headers
        }