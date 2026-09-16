# app/utils/helpers.py
import os
import uuid
import html
import logging
import posixpath
import importlib
import json
from decimal import Decimal
from typing import List, Optional, Any, Dict, Tuple
from urllib.parse import urlparse
from sqlalchemy import func, or_, cast, String
from sqlalchemy.orm import Session
from fastapi import HTTPException, status

from app.config import settings
from app.database.models import (
    MasterNarrative,
    Proposal,
    ExistingInventory,
    InformationSystem,
    IctProject,
    BusinessImpactAnalysis,
    ProjectCategory,
    ProposalCategory,
    ExpenditureClass,
    FundSource,
    OfficeLocation,
    UacsObjectCode,
    AssetStatus,
    SystemStatus,
    AuditTrail
)

logger = logging.getLogger("app.utils.helpers")


# ==========================================================
# 1. FILE & STORAGE SECURITY UTILITIES
# ==========================================================

def secure_filename(filename: str) -> str:
    """
    Sanitizes a filename by stripping directory traversals, path separators,
    and preserving only alphanumeric characters, underscores, dashes, and dots.
    """
    if not filename:
        return f"upload_{uuid.uuid4().hex}.bin"
    
    # Strip directory components across Windows and POSIX boundaries
    base = os.path.basename(filename.replace("\\", "/"))
    sanitized = "".join(c for c in base if c.isalnum() or c in "._-").strip()
    
    if not sanitized or sanitized in (".", ".."):
        ext = os.path.splitext(base)[1]
        sanitized = f"upload_{uuid.uuid4().hex}{ext if ext else '.bin'}"
        
    return sanitized


def get_s3_key_from_url(url: Optional[str]) -> Optional[str]:
    """
    Extracts the normalized S3 object storage key from an asset URL.
    Safely handles virtual-host buckets, legacy fallback buckets, path traversal,
    and local filesystem emulator prefixes.
    """
    if not url:
        return None
    try:
        parsed = urlparse(url)
        
        if parsed.scheme and parsed.scheme not in ("http", "https"):
            logger.warning(f"Rejected unauthorized storage URL scheme: {parsed.scheme}")
            return None

        raw_path = parsed.path.replace("\\", "/")
        path_parts = [p for p in raw_path.split("/") if p]
        
        if ".." in path_parts or "." in path_parts:
            logger.warning(f"Security Alert: Directory traversal detected in URL: {url}")
            return None

        normalized_path = posixpath.normpath(raw_path).lstrip("/")

        # Handle local emulator static storage prefix
        static_prefix = "static/uploads"
        if normalized_path.startswith(static_prefix):
            return normalized_path[len(static_prefix):].lstrip("/")

        expected_bucket = getattr(settings, "AWS_STORAGE_BUCKET_NAME", None)
        region = getattr(settings, "AWS_S3_REGION_NAME", "ap-southeast-1")

        allowed_buckets = [expected_bucket] if expected_bucket else []
        fallback_buckets = getattr(settings, "AWS_FALLBACK_BUCKETS", [])
        if fallback_buckets:
            allowed_buckets.extend([b for b in fallback_buckets if b])

        allowed_hosts = set()
        for b in allowed_buckets:
            if b:
                allowed_hosts.add(f"{b}.s3.amazonaws.com")
                allowed_hosts.add(f"{b}.s3.{region}.amazonaws.com")
                allowed_hosts.add(f"{b}.s3-control.amazonaws.com")

        # Dynamically append configured API base URL host to avoid blocking local emulator downloads
        api_base_host = urlparse(settings.API_BASE_URL).netloc or urlparse(settings.API_BASE_URL).hostname
        if api_base_host:
            allowed_hosts.add(api_base_host)
            if ":" in api_base_host:
                allowed_hosts.add(api_base_host.split(":")[0])

        is_valid_domain = (
            not parsed.netloc 
            or parsed.netloc in ["localhost", "127.0.0.1", "localhost:8000", "127.0.0.1:8000"]
            or parsed.netloc in allowed_hosts
            or any(b and b in parsed.netloc for b in allowed_buckets)
        )

        if not is_valid_domain:
            logger.warning(f"Unsanitized hostname detected during key extraction: {parsed.netloc}")
            return None

        for b in allowed_buckets:
            if b and normalized_path.startswith(f"{b}/"):
                normalized_path = normalized_path[len(f"{b}/"):].lstrip("/")
                break

        return normalized_path if normalized_path else None
    except Exception as e:
        logger.error(f"Error parsing storage key from URL: {str(e)}")
        return None


def validate_pdf_content(file_bytes: bytes) -> bool:
    """
    Inspects binary headers of uploaded documents to verify genuine PDF MIME types
    and prevent Content-Type spoofing attacks.
    """
    try:
        magic = importlib.import_module("magic")
        mime = magic.Magic(mime=True)
        detected_type = mime.from_buffer(file_bytes[:2048])
        return detected_type == "application/pdf"
    except (ImportError, AttributeError, Exception):
        # Fallback binary magic-number validation (%PDF-)
        return file_bytes.startswith(b"%PDF-")


def check_and_update_glacier_metadata(db: Session, target: Any, canvas_url: Optional[str]) -> Tuple[str, bool]:
    """Queries S3 storage properties to resolve lifecycle metrics on cold retrieved objects."""
    if getattr(settings, "STORAGE_TYPE", "local").lower() != "s3":
        return "STANDARD", False

    s3_storage_class = getattr(target, "s3_storage_class", "STANDARD")
    is_restoring = getattr(target, "is_restoring", False)

    if canvas_url:
        key = get_s3_key_from_url(canvas_url)
        if key:
            try:
                from app.storage.s3_client import storage_client
                metadata = storage_client.check_glacier_metadata(key)
                s3_storage_class = metadata.get("storage_class", s3_storage_class)
                is_restoring = metadata.get("is_restoring", is_restoring)
                if metadata.get("restore_completed", False):
                    s3_storage_class = "STANDARD"
                    is_restoring = False
            except Exception as e:
                logger.error(f"Failed to refresh Glacier restore status for key '{key}': {str(e)}")
    return s3_storage_class, is_restoring


def get_dict_from_payload(payload: Any) -> dict:
    """
    Defensively parses and returns a dictionary from database payload fields.
    Handles strings, doubly-serialized JSON, and null types cleanly.
    """
    if not payload:
        return {}
    if isinstance(payload, dict):
        return payload
    if isinstance(payload, str):
        try:
            parsed = json.loads(payload)
            if isinstance(parsed, dict):
                return parsed
            if isinstance(parsed, str):
                double_parsed = json.loads(parsed)
                if isinstance(double_parsed, dict):
                    return double_parsed
        except Exception as e:
            logger.warning(f"Failed to parse payload string: {str(e)}")
    return {}


# ==========================================================
# 2. DYNAMIC PLANNING CYCLE & YEAR ALIGNMENT UTILITIES
# ==========================================================

def get_active_issp_period(db: Session) -> str:
    """
    Queries the database for the active planning cycle configured by the Administrator.
    Falls back to the latest cycle if no active coversheet is explicitly flagged.
    """
    try:
        active_narrative = db.query(MasterNarrative).filter(MasterNarrative.is_active == True).first()
        if active_narrative:
            return active_narrative.issp_period
    except Exception as e:
        db.rollback()
        logger.warning(f"Query check: Failed to fetch active MasterNarrative issp_period: {str(e)}")
        
    try:
        latest_narrative = db.query(MasterNarrative).order_by(MasterNarrative.issp_period.desc()).first()
        if latest_narrative:
            return latest_narrative.issp_period
    except Exception as e:
        db.rollback()
        logger.warning(f"Query check: Failed to fetch latest MasterNarrative issp_period: {str(e)}")
        
    return getattr(settings, "DEFAULT_ISSP_CYCLE", "2026-2028")


def get_cycle_year_range(narrative: Optional[MasterNarrative], issp_period: Optional[str] = None) -> List[int]:
    """
    Resolves the exact sequence of calendar years [from_year, ..., to_year] 
    for any configured cycle horizon (1 to N years).
    """
    start_year = None
    end_year = None

    if narrative:
        start_year = narrative.issp_period_from
        end_year = narrative.issp_period_to
        if not issp_period:
            issp_period = narrative.issp_period

    if not start_year or not end_year:
        period_str = str(issp_period or "2026-2028").strip()
        parts = period_str.split("-")
        if len(parts) == 2 and parts[0].isdigit() and parts[1].isdigit():
            start_year = int(parts[0])
            end_year = int(parts[1])
        elif len(parts) == 1 and parts[0].isdigit():
            start_year = int(parts[0])
            end_year = int(parts[0])
        else:
            start_year, end_year = 2026, 2028

    if start_year > end_year:
        start_year, end_year = end_year, start_year

    return list(range(start_year, end_year + 1))


def validate_active_years_alignment(db: Session, submitted_years: List[Any]) -> str:
    """
    Validates that the keys of a submitted year-by-year dictionary 
    match the active planning period years exactly across any horizon span (1 to N years).
    """
    active_narrative = db.query(MasterNarrative).filter(MasterNarrative.is_active == True).first()
    if not active_narrative:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No active ISSP planning cycle has been configured by the system administrator."
        )

    year_range = get_cycle_year_range(active_narrative)
    expected_years = [str(y) for y in year_range]
    submitted_years_str = [str(y).strip() for y in submitted_years]

    if sorted(submitted_years_str) != sorted(expected_years):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Validation Failed: Submitted years {submitted_years_str} do not match active cycle horizon {expected_years}."
        )
    return active_narrative.issp_period


def align_and_validate_years(db: Session, yearly_data: Dict[str, int], is_submitting: bool = False) -> Tuple[str, Dict[str, int]]:
    """
    Standardizes inputs to use string keys, aligns them dynamically with the active cycle
    horizon (1 to N years), and backfills missing years with zero counts.
    """
    active_narrative = db.query(MasterNarrative).filter(MasterNarrative.is_active == True).first()
    if not active_narrative:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No active ISSP planning cycle has been configured by the system administrator."
        )

    year_range = get_cycle_year_range(active_narrative)
    expected_years = [str(y) for y in year_range]
    
    sanitized_input = {}
    if yearly_data and isinstance(yearly_data, dict):
        for k, v in yearly_data.items():
            try:
                sanitized_input[str(k).strip()] = int(v) if v is not None else 0
            except (ValueError, TypeError):
                sanitized_input[str(k).strip()] = 0

    aligned_data = {year: sanitized_input.get(year, 0) for year in expected_years}

    # Shift sequential data if cycle keys shifted (e.g., rollover to a new planning horizon)
    original_sorted_keys = sorted([k for k in sanitized_input.keys() if k.isdigit()])
    if not any(y in sanitized_input for y in expected_years) and original_sorted_keys:
        for idx, year in enumerate(expected_years):
            if idx < len(original_sorted_keys):
                orig_key = original_sorted_keys[idx]
                aligned_data[year] = sanitized_input[orig_key]
            
    if is_submitting:
        original_keys = set(sanitized_input.keys())
        expected_set = set(expected_years)
        if original_keys != expected_set and not all(k in expected_set for k in original_keys):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Validation Failed: Submitted years {sorted(list(original_keys))} do not match active cycle {expected_years}."
            )
    return active_narrative.issp_period, aligned_data


# ==========================================================
# 3. DBM CAPITALIZATION & UACS AUTOMATIC RESOLUTION
# ==========================================================

def classify_uacs_and_expenditure(
    item_name: str, 
    unit_cost: Decimal, 
    strategic_category: ProjectCategory,
    category: Optional[ProposalCategory] = None,
    created_by_students: bool = False
) -> Tuple[UacsObjectCode, ExpenditureClass]:
    """
    Enforces DBM capitalization thresholds (₱50,000.00), student-developed software
    capitalization rules, and assigns the correct Unified Accounts Code Structure (UACS)
    Object Code automatically.
    - Systems created by students are always Capital Outlay (50604070 01 - ICT Software).
    - ICT Training/Seminars are always MOOE (50202010 00 - Training Expenses) per DICT Guidelines Page 24.
    - Consulting and contractor services are categorized as MOOE under UACS 50211030 00.
    - Recurring software licenses and cloud services are MOOE under UACS 50299070 00.
    """
    # Rule 1: Student-created software systems are Capital Outlay (ICT Software)
    if created_by_students:
        return UacsObjectCode.ICT_SOFTWARE, ExpenditureClass.CAPITAL_OUTLAY

    cat_val = getattr(category, "value", str(category or ""))
    if cat_val in [ProposalCategory.SUBSCRIPTION.value, "Subscription"]:
        return UacsObjectCode.ICT_SOFTWARE_SUBSCRIPTION, ExpenditureClass.MOOE

    CAPITALIZATION_THRESHOLD = Decimal("50000.00")
    item_lower = (item_name or "").lower().strip()
    strat_cat_val = getattr(strategic_category, "value", str(strategic_category or ""))

    # Mandated by DICT Guidelines Page 24: Training Expenses under UACS 50202010 00
    if any(k in item_lower for k in ["training", "seminar", "workshop"]):
        return UacsObjectCode.ICT_TRAINING, ExpenditureClass.MOOE

    # Contractor / Consulting services are always MOOE (DICT Template Page 29, UACS 50211030 00)
    if any(k in item_lower for k in ["contractor", "consultant", "consulting"]):
        return UacsObjectCode.ICT_CONSULTING_DEVELOPMENT, ExpenditureClass.MOOE

    # Continuing Costs are always MOOE (Recurring subscriptions, maintenance, internet)
    if strat_cat_val in [ProjectCategory.CONTINUING_COSTS.value, "Continuing Costs/Expenses"]:
        if any(k in item_lower for k in ["software", "subscription", "cloud", "internet", "license"]):
            return UacsObjectCode.ICT_SOFTWARE_SUBSCRIPTION, ExpenditureClass.MOOE
        return UacsObjectCode.ICT_CONSULTING_DEVELOPMENT, ExpenditureClass.MOOE

    # Rule 3 & 4: General DBM Threshold Rule: >= ₱50,000 is CO; < ₱50,000 is MOOE
    if unit_cost >= CAPITALIZATION_THRESHOLD:
        exp_class = ExpenditureClass.CAPITAL_OUTLAY
        if any(k in item_lower for k in ["printer", "scanner", "plotter"]):
            uacs = UacsObjectCode.PRINTING_EQUIPMENT
        elif any(k in item_lower for k in ["software", "system", "platform"]) and not any(k in item_lower for k in ["subscription", "cloud"]):
            uacs = UacsObjectCode.ICT_SOFTWARE
        else:
            uacs = UacsObjectCode.ICT_EQUIPMENT
    else:
        exp_class = ExpenditureClass.MOOE
        if any(k in item_lower for k in ["printer", "scanner", "plotter"]):
            uacs = UacsObjectCode.SEMI_EXPENDABLE_PRINTING
        elif any(k in item_lower for k in ["suite", "license", "subscription", "cloud"]):
            uacs = UacsObjectCode.ICT_SOFTWARE_SUBSCRIPTION
        elif any(k in item_lower for k in ["development"]):
            uacs = UacsObjectCode.ICT_CONSULTING_DEVELOPMENT
        else:
            uacs = UacsObjectCode.SEMI_EXPENDABLE_ICT

    return uacs, exp_class


# ==========================================================
# 4. PART IV.B DYNAMIC FOUR-WAY FINANCIAL PARITY CALCULATOR
# ==========================================================

def calculate_financial_summaries(db: Session, issp_period: str) -> Dict[str, Any]:
    """
    Dynamically computes Part IV.B Summary of Investments (B.1, B.2, B.3, B.4)
    from atomic line items for any planning horizon span (1 to N years)
    and strictly asserts the Four-Way Parity Constraint down to the centavo.
    """
    narrative = db.query(MasterNarrative).filter(MasterNarrative.issp_period == issp_period).first()
    if not narrative:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Active cycle narrative for '{issp_period}' not found."
        )

    # Resolve dynamic year sequence: [FY_1, FY_2, ..., FY_N]
    year_range = get_cycle_year_range(narrative, issp_period)
    all_year_keys = [f"FY {y}" for y in year_range]

    items = db.query(Proposal).filter(
        Proposal.issp_period == issp_period,
        or_(Proposal.is_archived == False, Proposal.is_archived.is_(None))
    ).all()

    def create_row():
        row = {y_key: Decimal("0.00") for y_key in all_year_keys}
        row["Total"] = Decimal("0.00")
        return row

    # Table B.1: General Summary
    b1 = {cat.value: create_row() for cat in ProjectCategory}
    b1["GRAND TOTAL"] = create_row()

    # Table B.2: Fund Source
    b2 = {source.value: create_row() for source in FundSource}
    b2["GRAND TOTAL"] = create_row()

    # Table B.3: Statement of Expenditure
    b3 = {exp.value: create_row() for exp in ExpenditureClass}
    b3["GRAND TOTAL"] = create_row()

    # Table B.4: Object of Expenditure (UACS)
    b4 = {code.value: create_row() for code in UacsObjectCode}
    b4["GRAND TOTAL"] = create_row()

    def find_matching_key(grid: dict, candidate_val: Any, enum_cls: Any = None) -> Optional[str]:
        if candidate_val is None:
            return None
        cand_str = str(getattr(candidate_val, "value", candidate_val) or "").strip()
        cand_norm = cand_str.lower().replace(" ", "").replace("_", "").replace("-", "")

        for k in grid.keys():
            if k == "GRAND TOTAL":
                continue
            k_norm = k.lower().replace(" ", "").replace("_", "").replace("-", "")
            if k == cand_str or k.lower() == cand_str.lower() or k_norm == cand_norm:
                return k

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

    for item in items:
        unit_price = item.unit_cost if item.unit_cost is not None else Decimal("0.00")
        line_total = Decimal("0.00")

        cat_key = find_matching_key(b1, item.strategic_category, ProjectCategory)
        fund_key = find_matching_key(b2, item.fund_source, FundSource)
        exp_key = find_matching_key(b3, item.expenditure_class, ExpenditureClass)
        uacs_key = find_matching_key(b4, item.uacs_object_code, UacsObjectCode)

        # Parse yearly_quantities defensively if stored as a raw JSON string
        y_quantities = item.yearly_quantities
        if isinstance(y_quantities, str):
            try:
                y_quantities = json.loads(y_quantities)
            except Exception:
                y_quantities = {}

        # Dynamic loop across all active planning years in the horizon
        for idx, yr in enumerate(year_range):
            y_key = f"FY {yr}"
            qty = 0

            # 1. Primary lookup: direct year string/int key from yearly_quantities
            if y_quantities and isinstance(y_quantities, dict):
                qty = y_quantities.get(str(yr))
                if qty is None:
                    qty = y_quantities.get(yr)
                if qty is None:
                    qty = y_quantities.get(f"Year {idx + 1}")

            # 2. Legacy fallback: fallback to static year columns if yearly_quantities is unpopulated
            if qty is None or qty == 0:
                if idx == 0:
                    qty = item.year_1_qty or 0
                elif idx == 1:
                    qty = item.year_2_qty or 0
                elif idx == 2:
                    qty = item.year_3_qty or 0

            try:
                qty_int = int(qty) if qty is not None else 0
            except (ValueError, TypeError):
                qty_int = 0

            cost_for_year = Decimal(qty_int) * unit_price
            line_total += cost_for_year

            # Accumulate into each dynamic year column
            if cat_key in b1:
                b1[cat_key][y_key] += cost_for_year
            if fund_key in b2:
                b2[fund_key][y_key] += cost_for_year
            if exp_key in b3:
                b3[exp_key][y_key] += cost_for_year
            if uacs_key in b4:
                b4[uacs_key][y_key] += cost_for_year

        # Accumulate line totals
        if cat_key in b1:
            b1[cat_key]["Total"] += line_total
        if fund_key in b2:
            b2[fund_key]["Total"] += line_total
        if exp_key in b3:
            b3[exp_key]["Total"] += line_total
        if uacs_key in b4:
            b4[uacs_key]["Total"] += line_total

    # Compute Grand Totals across all dynamic year columns and the Total column
    for col_key in all_year_keys + ["Total"]:
        b1["GRAND TOTAL"][col_key] = sum((b1[cat.value][col_key] for cat in ProjectCategory), Decimal("0.00"))
        b2["GRAND TOTAL"][col_key] = sum((b2[source.value][col_key] for source in FundSource), Decimal("0.00"))
        b3["GRAND TOTAL"][col_key] = sum((b3[exp.value][col_key] for exp in ExpenditureClass), Decimal("0.00"))
        b4["GRAND TOTAL"][col_key] = sum((b4[code.value][col_key] for code in UacsObjectCode), Decimal("0.00"))

    # Four-Way Parity Verification down to the exact centavo
    t_b1 = b1["GRAND TOTAL"]["Total"].quantize(Decimal("0.01"))
    t_b2 = b2["GRAND TOTAL"]["Total"].quantize(Decimal("0.01"))
    t_b3 = b3["GRAND TOTAL"]["Total"].quantize(Decimal("0.01"))
    t_b4 = b4["GRAND TOTAL"]["Total"].quantize(Decimal("0.01"))

    is_parity_valid = (t_b1 == t_b2 == t_b3 == t_b4)
    discrepancy = max(abs(t_b1 - t_b2), abs(t_b1 - t_b3), abs(t_b1 - t_b4))

    return {
        "b1_general_summary": b1,
        "b2_fund_source": b2,
        "b3_statement_of_expenditure": b3,
        "b4_object_of_expenditure": b4,
        "certified_grand_total": t_b1,
        "is_parity_valid": is_parity_valid,
        "parity_discrepancy": discrepancy,
        "year_columns": all_year_keys
    }


# ==========================================================
# 5. CROSS-SECTIONAL DEPENDENCY AUDITORS
# ==========================================================

def verify_annex1_obsolescence_link(
    db: Session, 
    issp_period: str, 
    item_name: str, 
    requested_qty: int,
    department_id: Optional[int] = None
) -> Tuple[bool, str]:
    """
    Asserts that replacement hardware requested in Part IV.A is justified by an equivalent 
    or greater volume of physical End of Life (EOL) or Condemned units in Annex 1.
    Optionally scopes to a specific department if provided.
    Defensively casts status to String so PostgreSQL doesn't crash with
    'function lower(assetstatus) does not exist'.
    """
    status_str = cast(ExistingInventory.status, String)
    unserviceable_filter = or_(
        ExistingInventory.is_end_of_life == True,
        ExistingInventory.status == AssetStatus.CONDEMNED,
        ExistingInventory.status == AssetStatus.NEEDS_REPAIR,
        func.lower(status_str) == "condemned",
        func.lower(status_str) == "needs repair"
    )

    query = db.query(func.sum(ExistingInventory.quantity)).filter(
        ExistingInventory.is_software == False,
        unserviceable_filter,
        ExistingInventory.item_name.ilike(f"%{item_name}%")
    )
    
    if department_id is not None:
        query = query.filter(ExistingInventory.department_id == department_id)
        
    eol_units = query.scalar() or 0

    if requested_qty > int(eol_units):
        scope_str = f"for department {department_id}" if department_id else "in inventory"
        return False, (
            f"Obsolescence Discrepancy: Requesting {requested_qty} replacement units for '{item_name}', "
            f"but Annex 1 Asset Inventory {scope_str} records only {int(eol_units)} End of Life (EOL) or Condemned physical units."
        )
    return True, "Obsolescence link verified."


def verify_pia_compliance(db: Session, system_id: uuid.UUID) -> Tuple[bool, str]:
    """
    Enforces Data Privacy Act of 2012 compliance. If a system handles personal data
    without an audit, a PIA phase must be scheduled in the project milestones.
    Inspects both legacy year deliverable fields and dynamic annual_deliverables dicts.
    """
    system = db.query(InformationSystem).filter(InformationSystem.id == system_id).first()
    if not system:
        return False, "Information System record not found."

    if system.processes_personal_information and not system.has_undergone_pia:
        has_pia_milestone = False
        for proj in system.projects:
            deliverables_list = []
            annual_deliv = getattr(proj, "annual_deliverables", {})
            if isinstance(annual_deliv, dict):
                deliverables_list.extend(str(v) for v in annual_deliv.values())

            deliverables_list.extend([
                str(getattr(proj, "year_1_deliverables", "") or ""),
                str(getattr(proj, "year_2_deliverables", "") or ""),
                str(getattr(proj, "year_3_deliverables", "") or "")
            ])
            
            deliverables_text = " ".join(deliverables_list).lower()
            if any(k in deliverables_text for k in ["pia", "privacy impact assessment", "privacy impact", "privacy audit"]):
                has_pia_milestone = True
                break

        if not has_pia_milestone:
            return False, (
                f"Data Privacy Compliance Violation: System '{system.name}' processes personal information (PIA=Yes) "
                f"without a prior audit, but no milestone in Part III.E schedules a PIA phase."
            )

    return True, "PIA compliance verified."


def verify_drbcp_funding(db: Session, issp_period: str) -> Tuple[bool, str]:
    """
    Verifies that mission-critical systems in Annex 2 (RTO <= 4 hours) have appropriate
    cloud hosting and offsite backup funding allocated under Part IV.A Continuing Costs.
    """
    critical_bias = db.query(BusinessImpactAnalysis).filter(
        BusinessImpactAnalysis.issp_period == issp_period,
        BusinessImpactAnalysis.rto_hours <= 4
    ).all()

    if critical_bias:
        cloud_items = db.query(Proposal).filter(
            Proposal.issp_period == issp_period,
            Proposal.strategic_category.in_([ProjectCategory.CONTINUING_COSTS, ProjectCategory.CONTINUING_COSTS.value]),
            Proposal.uacs_object_code.in_([UacsObjectCode.ICT_SOFTWARE_SUBSCRIPTION, UacsObjectCode.ICT_SOFTWARE_SUBSCRIPTION.value]),
            or_(Proposal.is_archived == False, Proposal.is_archived.is_(None))
        ).all()

        total_cloud_funding = sum((Decimal(item.total_cost or 0) for item in cloud_items), Decimal("0.00"))
        if total_cloud_funding <= Decimal("0.00"):
            return False, (
                "Annex 2 DRBCP Funding Violation: Frontline mission-critical systems require an RTO <= 4 hours "
                "(mandating GovCloud real-time failover), but Part IV.A allocates ₱0.00 under Continuing Costs for Cloud Subscriptions."
            )

    return True, "DRBCP continuity funding verified."


# ==========================================================
# 6. CENTRALIZED COA AUDIT LOGGING HELPER
# ==========================================================

def log_audit_event(
    db: Session,
    action: str,
    module: str = "GOVERNANCE",
    user_id: Optional[int] = None,
    department_id: Optional[int] = None,
    proposal_id: Optional[uuid.UUID] = None,
    ip_address: Optional[str] = None,
    old_value: Optional[Dict[str, Any]] = None,
    new_value: Optional[Dict[str, Any]] = None
) -> AuditTrail:
    """
    Centralized, immutable COA audit logger.
    Records user logins, entity mutations (proposals, inventory, narratives, ceilings),
    previous vs. new JSON state deltas, IP addresses, and timestamped operator identities.
    """
    from app.database.models import AuditTrail
    audit = AuditTrail(
        action=action,
        module=module,
        user_id=user_id,
        department_id=department_id,
        proposal_id=proposal_id,
        ip_address=ip_address,
        old_value=old_value,
        new_value=new_value
    )
    db.add(audit)
    try:
        db.flush()
    except Exception as e:
        logger.error(f"Failed to record audit trail event '{action}' in module '{module}': {str(e)}")
    return audit