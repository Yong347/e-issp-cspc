# app/utils/helpers.py
"""
=============================================================================
DICT ISSP v.2026 COMPLIANCE ENGINE — CENTRAL UTILITIES & GOVERNANCE HELPERS
=============================================================================
Core Capabilities:
- Document Security, Traversal Guards & Transparent Archive Key Resolution
- Dialect-Agnostic GUID/UUID & Native JSON Sanitization for COA Audit Trails
- Dynamic Planning Cycle & Statutory 3-Year Horizon (Zero Hardcoding)
- Compounded Multi-Year Annual Inflation Rate & Unit Cost Calculation
- DBM Capitalization Thresholding & Dynamic UACS Accounting Engine
- Information System & Resource Proposal Bi-Directional Synchronization
- Annex 1 Hardware Obsolescence Quota & Anti-Loop Replacement Enforcement
- Section 8.0 Needs Assessment, Multi-Pathway Resolution & PIA Audit Checks
- Strict Project-Governed Rollup & Multi-Pathway Strategic Concern Validation
=============================================================================
"""

import os
import io
import re
import uuid
import html
import logging
import posixpath
import importlib
import json
from decimal import Decimal, ROUND_HALF_UP
from datetime import datetime, date, timezone
from typing import List, Optional, Any, Dict, Tuple
from urllib.parse import urlparse

from sqlalchemy import func, or_, and_, cast, String, text
from sqlalchemy.orm import Session
from fastapi import HTTPException, status

from app.config import settings

logger = logging.getLogger("app.utils.helpers")


# =========================================================================
# 1. DOCUMENT VAULT & STORAGE SECURITY UTILITIES
# =========================================================================

def secure_filename(filename: str) -> str:
    """
    Sanitizes an uploaded filename by stripping path traversals and directory
    separators across Windows and POSIX boundaries, retaining only alphanumeric
    characters, dots, underscores, and dashes.
    """
    if not filename:
        return f"document_{uuid.uuid4().hex}.bin"

    base = os.path.basename(str(filename).replace("\\", "/"))
    sanitized = "".join(c for c in base if c.isalnum() or c in "._-").strip()

    if not sanitized or sanitized in (".", ".."):
        ext = os.path.splitext(base)[1]
        sanitized = f"document_{uuid.uuid4().hex}{ext if ext else '.bin'}"

    return sanitized


def get_storage_key_from_url(url: Optional[str]) -> Optional[str]:
    """
    Extracts the normalized repository storage key from an asset URL.
    Safely resolves virtual-host bucket endpoints, legacy buckets,
    and local filesystem emulator prefixes without path traversal risk.
    """
    if not url:
        return None
    try:
        parsed = urlparse(url)

        if parsed.scheme and parsed.scheme not in ("http", "https"):
            logger.warning(f"Storage Security Block: Rejected unauthorized URL scheme '{parsed.scheme}'")
            return None

        raw_path = parsed.path.replace("\\", "/")
        path_parts = [p for p in raw_path.split("/") if p]

        if ".." in path_parts or "." in path_parts:
            logger.warning(f"Security Alert: Path traversal pattern intercepted in URL: {url}")
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

        # Dynamically append backend API host to permit local emulator downloads
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
            logger.warning(f"Unsanitized hostname intercepted during key extraction: {parsed.netloc}")
            return None

        for b in allowed_buckets:
            if b and normalized_path.startswith(f"{b}/"):
                normalized_path = normalized_path[len(f"{b}/"):].lstrip("/")
                break

        return normalized_path if normalized_path else None
    except Exception as e:
        logger.error(f"Error parsing storage key from URL: {str(e)}")
        return None


# Backward-compatible alias for existing service calls
get_s3_key_from_url = get_storage_key_from_url


def validate_pdf_content(file_bytes: bytes) -> bool:
    """
    Validates binary file headers to ensure documents are authentic PDF files
    and prevents Content-Type spoofing vulnerabilities.
    """
    if not file_bytes:
        return False
    try:
        magic = importlib.import_module("magic")
        mime = magic.Magic(mime=True)
        detected_type = mime.from_buffer(file_bytes[:2048])
        return detected_type == "application/pdf"
    except (ImportError, AttributeError, Exception):
        # Fallback binary magic-number header validation (%PDF-)
        return file_bytes.startswith(b"%PDF-")


def optimize_uploaded_image(file_bytes: bytes, max_width: int = 1920, max_height: int = 1200) -> bytes:
    """
    Downsamples high-resolution visual exhibits to web-standard print resolutions.
    Prevents worker memory exhaustion and bloated compilation payloads.
    """
    try:
        from PIL import Image
        img = Image.open(io.BytesIO(file_bytes))

        # Preserve SVG and vector files untouched
        if img.format not in ("PNG", "JPEG", "JPG", "WEBP"):
            return file_bytes

        if img.width > max_width or img.height > max_height:
            img.thumbnail((max_width, max_height), Image.Resampling.LANCZOS)
            output = io.BytesIO()
            if img.format == "PNG":
                img.save(output, format="PNG", optimize=True)
            else:
                img.save(output, format="JPEG", quality=85, optimize=True)
            return output.getvalue()
    except Exception as e:
        logger.warning(f"Image optimization note: {e}")
    return file_bytes


def is_datetime_expired(dt: Optional[datetime]) -> bool:
    """
    Safely determines if a given datetime has expired, gracefully handling
    both timezone-aware and timezone-naive timestamps without TypeError.
    """
    if not dt:
        return False
    if dt.tzinfo is not None:
        return dt < datetime.now(timezone.utc)
    return dt < datetime.utcnow()


def check_and_update_archive_metadata(db: Session, target: Any, canvas_url: Optional[str]) -> Tuple[str, bool]:
    """
    Inspects document vault archival metadata and initiates automated
    transparent background retrieval when an item is stored in deep cold storage tiers.
    Operates without commercial vendor branding, ensuring immediate document availability.
    """
    if getattr(settings, "STORAGE_TYPE", "local").lower() != "s3":
        return "STANDARD", False

    storage_class = getattr(target, "s3_storage_class", "STANDARD")
    is_retrieving = getattr(target, "is_restoring", False)

    if canvas_url:
        key = get_storage_key_from_url(canvas_url)
        if key:
            try:
                from app.storage.s3_client import storage_client

                # Inspect metadata dynamically using available client methods
                if hasattr(storage_client, "check_archive_metadata"):
                    metadata = storage_client.check_archive_metadata(key)
                elif hasattr(storage_client, "check_glacier_metadata"):
                    metadata = storage_client.check_glacier_metadata(key)
                else:
                    metadata = {}

                detected_class = metadata.get("storage_class", storage_class)
                detected_retrieving = metadata.get("is_restoring", is_retrieving)
                restore_completed = metadata.get("restore_completed", False)

                if restore_completed:
                    storage_class = "STANDARD"
                    is_retrieving = False
                elif detected_class in ["GLACIER", "DEEP_ARCHIVE", "ARCHIVE"]:
                    storage_class = detected_class
                    if not detected_retrieving and hasattr(storage_client, "restore_object"):
                        storage_client.restore_object(key, days=7)
                        is_retrieving = True
                    else:
                        is_retrieving = True
                else:
                    storage_class = "STANDARD"
                    is_retrieving = False
            except Exception as e:
                logger.error(f"Failed to refresh archive storage status for key '{key}': {str(e)}")

    return storage_class, is_retrieving


# Backward-compatible alias
check_and_update_glacier_metadata = check_and_update_archive_metadata


def get_dict_from_payload(payload: Any) -> dict:
    """
    Defensively parses and returns a dictionary from database payload fields.
    Gracefully handles dicts, JSON strings, and double-serialized string payloads.
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


# =========================================================================
# 2. DYNAMIC PLANNING CYCLE & STATUTORY 3-YEAR HORIZON UTILITIES
# =========================================================================

def get_default_dynamic_cycle() -> str:
    """
    Computes a statutory 3-year ISSP cycle starting from the current calendar year.
    Example: 2027 -> '2027-2029'. Eliminates static hardcoded strings.
    """
    current_year = datetime.now(timezone.utc).year
    return f"{current_year}-{current_year + 2}"


def get_active_issp_period(db: Optional[Session] = None) -> str:
    """
    Queries the database for the active planning cycle configured by the Administrator.
    Priority:
    1. Active MasterNarrative (is_active == True)
    2. system_settings (key == 'issp_active_cycle')
    3. Latest configured MasterNarrative
    4. Dynamically calculated 3-year cycle from current calendar year
    """
    from app.database.models import MasterNarrative, SystemSetting

    session = db
    close_session = False
    if session is None:
        try:
            from app.database.session import SessionLocal
            session = SessionLocal()
            close_session = True
        except Exception:
            session = None

    if session is not None:
        try:
            active_narrative = session.query(MasterNarrative).filter(MasterNarrative.is_active == True).first()
            if active_narrative and active_narrative.issp_period:
                return active_narrative.issp_period

            setting_period = session.query(SystemSetting.value).filter(SystemSetting.key == "issp_active_cycle").scalar()
            if setting_period and str(setting_period).strip():
                return str(setting_period).strip()

            latest_narrative = session.query(MasterNarrative).order_by(MasterNarrative.issp_period_to.desc()).first()
            if latest_narrative and latest_narrative.issp_period:
                return latest_narrative.issp_period
        except Exception as e:
            session.rollback()
            logger.debug(f"Query check: Failed to fetch active issp_period: {str(e)}")
        finally:
            if close_session:
                try:
                    session.close()
                except Exception:
                    pass

    return getattr(settings, "DEFAULT_ISSP_CYCLE", None) or get_default_dynamic_cycle()


def get_cycle_year_range(narrative: Optional[Any], issp_period: Optional[str] = None) -> List[int]:
    """
    Resolves the exact sequence of calendar years [Y1, Y2, Y3] for the active statutory 3-year cycle.
    Enforces start_year <= end_year and defaults dynamically if unconfigured.
    """
    start_year = None
    end_year = None

    if narrative:
        start_year = getattr(narrative, "issp_period_from", None)
        end_year = getattr(narrative, "issp_period_to", None)
        if not issp_period:
            issp_period = getattr(narrative, "issp_period", None)

    if not start_year or not end_year:
        period_str = str(issp_period or get_active_issp_period()).strip()
        parts = period_str.split("-")
        if len(parts) == 2 and parts[0].isdigit() and parts[1].isdigit():
            start_year = int(parts[0])
            end_year = int(parts[1])
        elif len(parts) == 1 and parts[0].isdigit():
            start_year = int(parts[0])
            end_year = start_year + 2
        else:
            current_year = datetime.now(timezone.utc).year
            start_year, end_year = current_year, current_year + 2

    if start_year > end_year:
        start_year, end_year = end_year, start_year

    return list(range(start_year, end_year + 1))


def validate_active_years_alignment(db: Optional[Session], submitted_years: List[Any]) -> str:
    """
    Validates that the keys of a submitted year-by-year dictionary 
    match the active planning period years exactly across the 3-year horizon.
    """
    from app.database.models import MasterNarrative

    session = db
    close_session = False
    if session is None:
        try:
            from app.database.session import SessionLocal
            session = SessionLocal()
            close_session = True
        except Exception:
            session = None

    active_narrative = None
    if session is not None:
        try:
            active_narrative = session.query(MasterNarrative).filter(MasterNarrative.is_active == True).first()
            if not active_narrative:
                active_narrative = session.query(MasterNarrative).order_by(MasterNarrative.issp_period_to.desc()).first()
        except Exception as e:
            logger.debug(f"MasterNarrative query note in validate_active_years_alignment: {e}")
        finally:
            if close_session:
                try:
                    session.close()
                except Exception:
                    pass

    target_period = active_narrative.issp_period if active_narrative else get_active_issp_period(session)
    year_range = get_cycle_year_range(active_narrative, issp_period=target_period)
    expected_years = [str(y) for y in year_range]
    submitted_years_str = [str(y).strip() for y in submitted_years]

    if sorted(submitted_years_str) != sorted(expected_years):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Validation Failed: Submitted years {submitted_years_str} do not match active cycle horizon {expected_years}."
        )
    return target_period


def align_and_validate_years(db: Optional[Session], yearly_data: Dict[str, Any], is_submitting: bool = False) -> Tuple[str, Dict[str, int]]:
    """
    Standardizes physical target inputs across the statutory 3-year planning horizon without zeroing out user data.
    Maps:
      Year 1 -> Y_start
      Year 2 -> Y_start + 1
      Year 3 -> Y_start + 2
    Maintains both calendar year and ordinal keys in the returned dictionary for downstream compatibility.
    """
    from app.database.models import MasterNarrative

    session = db
    close_session = False
    if session is None:
        try:
            from app.database.session import SessionLocal
            session = SessionLocal()
            close_session = True
        except Exception:
            session = None

    active_narrative = None
    if session is not None:
        try:
            active_narrative = session.query(MasterNarrative).filter(MasterNarrative.is_active == True).first()
            if not active_narrative:
                active_narrative = session.query(MasterNarrative).order_by(MasterNarrative.issp_period_to.desc()).first()
        except Exception as e:
            logger.debug(f"MasterNarrative lookup note in align_and_validate_years: {e}")
        finally:
            if close_session:
                try:
                    session.close()
                except Exception:
                    pass

    if active_narrative:
        start_y = active_narrative.issp_period_from or datetime.now(timezone.utc).year
        period = active_narrative.issp_period
    else:
        period = get_active_issp_period(session)
        try:
            start_y = int(period.split("-")[0].strip())
        except Exception:
            start_y = datetime.now(timezone.utc).year

    # Statutory 3-year sequence
    y1_str = str(start_y)
    y2_str = str(start_y + 1)
    y3_str = str(start_y + 2)
    expected_years = [y1_str, y2_str, y3_str]

    aligned_data = {
        y1_str: 0,
        y2_str: 0,
        y3_str: 0,
        "Year 1": 0,
        "Year 2": 0,
        "Year 3": 0
    }
    valid_mapped_keys = set()

    sanitized_input: Dict[str, int] = {}
    if yearly_data and isinstance(yearly_data, dict):
        for k, v in yearly_data.items():
            k_str = str(k).strip()
            try:
                qty_val = int(v) if v is not None else 0
            except (ValueError, TypeError):
                qty_val = 0
            sanitized_input[k_str] = max(0, qty_val)

    # 1. Direct calendar year matches
    if y1_str in sanitized_input:
        aligned_data[y1_str] = sanitized_input[y1_str]
        valid_mapped_keys.add(y1_str)
    if y2_str in sanitized_input:
        aligned_data[y2_str] = sanitized_input[y2_str]
        valid_mapped_keys.add(y2_str)
    if y3_str in sanitized_input:
        aligned_data[y3_str] = sanitized_input[y3_str]
        valid_mapped_keys.add(y3_str)

    # 2. Parse ordinal keys ("Year 1", "Year 2", "Year 3", "Y1", etc.) if calendar years were 0
    if aligned_data[y1_str] == 0:
        for k_alt in ["Year 1", "year 1", "year_1", "Y1", "1"]:
            if k_alt in sanitized_input:
                aligned_data[y1_str] = sanitized_input[k_alt]
                valid_mapped_keys.add(k_alt)
                break

    if aligned_data[y2_str] == 0:
        for k_alt in ["Year 2", "year 2", "year_2", "Y2", "2"]:
            if k_alt in sanitized_input:
                aligned_data[y2_str] = sanitized_input[k_alt]
                valid_mapped_keys.add(k_alt)
                break

    if aligned_data[y3_str] == 0:
        for k_alt in ["Year 3", "year 3", "year_3", "Y3", "3"]:
            if k_alt in sanitized_input:
                aligned_data[y3_str] = sanitized_input[k_alt]
                valid_mapped_keys.add(k_alt)
                break

    # 3. Fallback: Sequential 4-digit years matching
    submitted_4digit_years = sorted([int(d[0]) for d in [re.findall(r'^\d{4}$', k) for k in sanitized_input.keys()] if d])
    if not any(aligned_data[y] > 0 for y in expected_years) and submitted_4digit_years:
        for idx, year in enumerate(expected_years):
            if idx < len(submitted_4digit_years):
                orig_key = str(submitted_4digit_years[idx])
                aligned_data[year] = sanitized_input.get(orig_key, 0)
                valid_mapped_keys.add(orig_key)

    # Mirror ordinal labels ('Year 1', 'Year 2', 'Year 3') for compilation templates
    aligned_data["Year 1"] = aligned_data[y1_str]
    aligned_data["Year 2"] = aligned_data[y2_str]
    aligned_data["Year 3"] = aligned_data[y3_str]

    if is_submitting:
        if sanitized_input and not valid_mapped_keys and not any(k in expected_years for k in sanitized_input):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Validation Failed: Submitted years {list(sanitized_input.keys())} do not match active 3-year cycle {expected_years}."
            )

    return period, aligned_data


# ==========================================================
# 3. DYNAMIC POLICY & INFLATION BUFFER RESOLVERS
# ==========================================================

def get_governance_policy(db_or_conn: Optional[Any] = None) -> Dict[str, Any]:
    """
    Retrieves dynamic administrative thresholds, inflation rate maps, and review gates from system_settings.
    Operates seamlessly in SQLAlchemy Session, Connection, or standalone execution contexts.
    """
    cfg = {}
    session_to_close = None
    target = db_or_conn

    if target is None:
        try:
            from app.database.session import SessionLocal
            target = SessionLocal()
            session_to_close = target
        except Exception:
            target = None

    if target is not None:
        try:
            if hasattr(target, "query"):
                from app.database.models import SystemSetting
                settings_rows = target.query(SystemSetting).all()
                cfg = {s.key: s.value for s in settings_rows}
            else:
                res = target.execute(text("SELECT key, value FROM system_settings")).fetchall()
                cfg = {row[0]: row[1] for row in res}
        except Exception as e:
            logger.debug(f"Governance policy extraction note: {e}")
        finally:
            if session_to_close:
                try:
                    session_to_close.close()
                except Exception:
                    pass

    rates_map = {}
    if "inflation_rates_by_year" in cfg:
        try:
            parsed = json.loads(cfg["inflation_rates_by_year"])
            if isinstance(parsed, dict):
                rates_map = parsed
        except Exception:
            rates_map = {}

    return {
        "capitalization_threshold": Decimal(str(cfg.get("capitalization_threshold", "50000.00"))),
        "major_outlay_review_threshold": Decimal(str(cfg.get("major_outlay_review_threshold", "2000000.00"))),
        "inflation_rates_by_year": rates_map,
        "hardware_replacement_buffer_units": int(cfg.get("hardware_replacement_buffer_units", "3")),
        "canvas_expiration_warning_days": int(cfg.get("canvas_expiration_warning_days", "14")),
    }


def get_inflation_rate_for_year(connection_or_db: Any, cal_year: int, start_year: int) -> Decimal:
    """
    Determines the inflation percentage multiplier for any specific calendar year.
    Year 1 (cal_year <= start_year) is unadjusted (0.00%).
    Year 2 (idx = 1) is 3.0% by standard, Year 3 (idx = 2) is 5.0% by standard.
    """
    if cal_year <= start_year:
        return Decimal("0.00")

    rate_percent = Decimal("0.00")
    try:
        policy = get_governance_policy(connection_or_db)
        rates_map = policy.get("inflation_rates_by_year", {})

        if str(cal_year) in rates_map:
            rate_percent = Decimal(str(rates_map[str(cal_year)]))
        else:
            # DICT Guidelines standard: 3% for Y2, 5% for Y3, +2% compounding per year thereafter
            idx = cal_year - start_year
            if idx == 1:
                rate_percent = Decimal("3.0")
            elif idx == 2:
                rate_percent = Decimal("5.0")
            else:
                rate_percent = Decimal("5.0") + Decimal(str((idx - 2) * 2.0))
    except Exception as err:
        logger.debug(f"Inflation lookup fallback applied: {err}")
        idx = cal_year - start_year
        rate_percent = Decimal("3.0") if idx == 1 else Decimal("5.0")

    if rate_percent <= Decimal("0.00"):
        return Decimal("0.00")
    return (rate_percent / Decimal("100.0")).quantize(Decimal("0.0001"))


def get_adjusted_unit_cost_for_year(connection_or_db: Any, base_cost: Decimal, cal_year: int, start_year: int) -> Decimal:
    """
    Calculates the inflation-adjusted unit price for a given year.
    Used consistently across models, Part IV.A tables, and Part IV.B matrices to maintain exact centavo parity.
    """
    if base_cost is None:
        return Decimal("0.00")
    base_dec = Decimal(str(base_cost))
    if base_dec <= Decimal("0.00") or cal_year <= start_year:
        return base_dec.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

    rate = get_inflation_rate_for_year(connection_or_db, cal_year, start_year)
    multiplier = Decimal("1.00") + rate
    return (base_dec * multiplier).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


# ==========================================================
# 4. DYNAMIC CAPITALIZATION & UACS RESOLUTION
# ==========================================================

def classify_uacs_and_expenditure(
    item_name: str,
    unit_cost: Decimal,
    strategic_category: Optional[Any] = None,
    category: Optional[Any] = None,
    created_by_students: bool = False,
    is_in_house_turnover: Optional[bool] = None,
    db: Optional[Session] = None
) -> Tuple[str, str]:
    """
    Classifies expenditure using the admin-managed UACS database catalog and dynamic policy thresholds.
    Enforces DBM thresholds, in-house software capitalization, and mandatory MOOE subscriptions:
    - In-house developed software is always Capital Outlay (50604070 01 - ICT Software Perpetual CO).
    - Subscriptions / Cloud licenses are ALWAYS MOOE (50299070 00 - ICT Software Subscription MOOE).
    - Training/Seminars are always MOOE (50202010 00 - Training Expenses MOOE) per DICT Guidelines [2].
    - Consulting / Contractors are always MOOE (50211030 00 - Consulting/Outsourced Development MOOE).
    - Physical hardware: >= capitalization threshold is Capital Outlay; < threshold is Semi-Expendable MOOE.
    """
    session = db
    close_session = False
    if session is None:
        try:
            from app.database.session import SessionLocal
            session = SessionLocal()
            close_session = True
        except Exception:
            session = None

    try:
        is_turnover = bool(created_by_students or is_in_house_turnover)

        # 1. In-house developed / non-commercial asset developments are Capital Outlay (ICT Software)
        if is_turnover:
            if session:
                try:
                    from app.database.models import UacsCatalogItem
                    sw_co = session.query(UacsCatalogItem).filter(
                        UacsCatalogItem.uacs_code.like("50604070%"),
                        UacsCatalogItem.is_active == True
                    ).first()
                    if sw_co:
                        return f"{sw_co.uacs_code} - {sw_co.account_title}", sw_co.expenditure_class
                except Exception:
                    pass
            return "50604070 01 - ICT Software (Perpetual CO)", "Capital Outlay"

        cat_val = getattr(category, "value", str(category or "")).strip().lower()
        item_lower = (item_name or "").lower().strip()
        strat_val = getattr(strategic_category, "value", str(strategic_category or "")).strip().lower()

        # Rule: Subscriptions and cloud licenses are ALWAYS MOOE
        if "subscription" in cat_val or any(k in item_lower for k in ["subscription", "cloud license", "saas", "recurring license"]):
            if session:
                try:
                    from app.database.models import UacsCatalogItem
                    sub_uacs = session.query(UacsCatalogItem).filter(
                        UacsCatalogItem.is_subscription_default == True,
                        UacsCatalogItem.is_active == True
                    ).first()
                    if sub_uacs:
                        return f"{sub_uacs.uacs_code} - {sub_uacs.account_title}", sub_uacs.expenditure_class
                except Exception:
                    pass
            return "50299070 00 - ICT Software Subscription (MOOE)", "Maintenance and Other Operating Expenses"

        # Mandated by DICT Guidelines: Training Expenses under UACS 50202010 00 [2]
        if "training" in cat_val or any(k in item_lower for k in ["training", "seminar", "workshop", "certification course"]):
            if session:
                try:
                    from app.database.models import UacsCatalogItem
                    tr_uacs = session.query(UacsCatalogItem).filter(
                        UacsCatalogItem.uacs_code.like("50202010%"),
                        UacsCatalogItem.is_active == True
                    ).first()
                    if tr_uacs:
                        return f"{tr_uacs.uacs_code} - {tr_uacs.account_title}", tr_uacs.expenditure_class
                except Exception:
                    pass
            return "50202010 00 - Training Expenses (MOOE)", "Maintenance and Other Operating Expenses"

        # Contractor / Consulting / Technical Services are always MOOE (UACS 50211030 00)
        if "services" in cat_val or any(k in item_lower for k in ["contractor", "consultant", "consulting", "outsourced service"]):
            if session:
                try:
                    from app.database.models import UacsCatalogItem
                    co_uacs = session.query(UacsCatalogItem).filter(
                        UacsCatalogItem.uacs_code.like("50211030%"),
                        UacsCatalogItem.is_active == True
                    ).first()
                    if co_uacs:
                        return f"{co_uacs.uacs_code} - {co_uacs.account_title}", co_uacs.expenditure_class
                except Exception:
                    pass
            return "50211030 00 - Consulting/Outsourced Development (MOOE)", "Maintenance and Other Operating Expenses"

        # Continuing Costs are recurring operational expenses (MOOE)
        if "continuing" in strat_val:
            if any(k in item_lower for k in ["software", "subscription", "cloud", "internet", "license", "bandwidth"]):
                return "50299070 00 - ICT Software Subscription (MOOE)", "Maintenance and Other Operating Expenses"
            return "50211030 00 - Consulting/Outsourced Development (MOOE)", "Maintenance and Other Operating Expenses"

        # Dynamic Capitalization Threshold Lookup directly from database system_settings
        policy = get_governance_policy(session)
        cap_threshold = policy.get("capitalization_threshold", Decimal("50000.00"))
        cost_val = Decimal(str(unit_cost or 0))

        # Explicit Software Category handling (COTS packages vs Semi-Expendable)
        if "software" in cat_val:
            if cost_val >= cap_threshold:
                exp_class = "Capital Outlay"
                uacs = "50604070 01 - ICT Software (Perpetual CO)"
            else:
                exp_class = "Maintenance and Other Operating Expenses"
                if any(k in item_lower for k in ["development", "consulting", "engineering", "programming"]):
                    uacs = "50211030 00 - Consulting/Outsourced Development (MOOE)"
                else:
                    uacs = "50299070 00 - ICT Software Subscription (MOOE)"
        elif cost_val >= cap_threshold:
            exp_class = "Capital Outlay"
            if any(k in item_lower for k in ["printer", "scanner", "plotter"]):
                uacs = "50604050 07 - Printing Equipment (CO)"
            elif any(k in item_lower for k in ["software", "system", "platform"]) and not any(k in item_lower for k in ["subscription", "cloud"]):
                uacs = "50604070 01 - ICT Software (Perpetual CO)"
            else:
                uacs = "50604050 03 - ICT Equipment (CO)"
        else:
            exp_class = "Maintenance and Other Operating Expenses"
            if any(k in item_lower for k in ["printer", "scanner", "plotter"]):
                uacs = "50203210 07 - Semi-Expendable Printing Equipment (MOOE)"
            elif any(k in item_lower for k in ["suite", "license", "subscription", "cloud"]):
                uacs = "50299070 00 - ICT Software Subscription (MOOE)"
            elif any(k in item_lower for k in ["development", "consulting"]):
                uacs = "50211030 00 - Consulting/Outsourced Development (MOOE)"
            else:
                uacs = "50203210 03 - Semi-Expendable ICT Equipment (MOOE)"

        # Check for dynamic database catalog match if active
        if session:
            try:
                from app.database.models import UacsCatalogItem
                code_prefix = uacs.split(" - ")[0].strip()
                db_item = session.query(UacsCatalogItem).filter(
                    UacsCatalogItem.uacs_code.like(f"{code_prefix}%"),
                    UacsCatalogItem.is_active == True
                ).first()
                if db_item:
                    return f"{db_item.uacs_code} - {db_item.account_title}", db_item.expenditure_class
            except Exception:
                pass

        return uacs, exp_class
    finally:
        if close_session and session:
            try:
                session.close()
            except Exception:
                pass


def classify_uacs_and_expenditure_dynamic(
    db: Optional[Session] = None,
    item_name: str = "",
    unit_cost: Decimal = Decimal("0.00"),
    category: Optional[Any] = None,
    strategic_category: Optional[Any] = None,
    created_by_students: bool = False,
    is_in_house_turnover: Optional[bool] = None
) -> Tuple[str, str]:
    """
    Dynamic alias for classify_uacs_and_expenditure resolving parameters directly
    from active database thresholds and UACS catalog tables.
    """
    return classify_uacs_and_expenditure(
        item_name=item_name,
        unit_cost=unit_cost,
        strategic_category=strategic_category,
        category=category,
        created_by_students=created_by_students,
        is_in_house_turnover=is_in_house_turnover,
        db=db
    )


# =========================================================================
# 5. DYNAMIC HARMONIZATION & TAXONOMY ACCESSORS
# =========================================================================

def get_active_harmonization_criteria(db: Session) -> List[Dict[str, Any]]:
    """
    Retrieves dynamic Harmonization Framework criteria registered by the Administrator.
    Provides standard fallback if no custom database criteria exist.
    """
    from app.database.models import DynamicChecklistCriteria
    rows = db.query(DynamicChecklistCriteria).filter(
        DynamicChecklistCriteria.checklist_type == "HARMONIZATION_FRAMEWORK",
        DynamicChecklistCriteria.is_active == True
    ).order_by(DynamicChecklistCriteria.order_index.asc()).all()

    if rows:
        return [
            {
                "id": r.id,
                "name": r.criteria_name,
                "is_mandatory": r.is_mandatory,
                "description": r.description
            }
            for r in rows
        ]

    # Canonical DICT v.2026 default framework criteria
    return [
        {"id": 1, "name": "National Prioritization (PDP 2023-2028)", "is_mandatory": False},
        {"id": 2, "name": "Resource Optimization (GovNet, GovCloud)", "is_mandatory": False},
        {"id": 3, "name": "PeGIF Standardized APIs & Interoperability", "is_mandatory": True},
        {"id": 4, "name": "Cross-Agency Collaboration (JMC / MOA)", "is_mandatory": False},
        {"id": 5, "name": "Scalability and Sustainability (SPAR / PREXC)", "is_mandatory": True}
    ]


def get_active_development_strategies(db: Session) -> List[Dict[str, str]]:
    """
    Retrieves customizable development strategies registered in system_taxonomies.
    """
    from app.database.models import SystemTaxonomy
    rows = db.query(SystemTaxonomy).filter(
        SystemTaxonomy.taxonomy_type == "DEVELOPMENT_STRATEGY",
        SystemTaxonomy.is_active == True
    ).order_by(SystemTaxonomy.order_index.asc()).all()

    if rows:
        return [{"code": r.code, "display_name": r.display_name} for r in rows]

    return [
        {"code": "IN_HOUSE", "display_name": "In-House Development"},
        {"code": "OUTSOURCED", "display_name": "Outsourced"},
        {"code": "COTS", "display_name": "Commercial Off-The-Shelf (COTS)"},
        {"code": "COMBINATION", "display_name": "Combination / Hybrid"}
    ]


# =========================================================================
# 6. CANONICAL FINANCIAL PARITY ENGINE ACCESSOR
# =========================================================================

def calculate_financial_summaries(db: Session, issp_period: str, only_approved: bool = False) -> Dict[str, Any]:
    """
    Direct accessor to the single canonical 4-Way Parity Engine in issp_engine.py.
    Eliminates calculation discrepancies and ensures exact centavo parity.
    Supports only_approved filtering for compilation pipeline verification.
    """
    from app.services.issp_engine import ISSPSingularityEngine
    return ISSPSingularityEngine.calculate_part_iv_b_matrices(db, issp_period, only_approved=only_approved)


# =========================================================================
# 7. INFORMATION SYSTEM & PROPOSAL SYNCHRONIZATION HELPER
# =========================================================================

def sync_system_proposal(db: Session, system: Any) -> Optional[Any]:
    """
    Synchronizes an Information System (Part III.D) with a corresponding
    Proposal in issp_core (Part IV.A).
    Ensures that when an Information System is proposed or for development/enhancement
    with proposed_cost > 0:
    1. It has an exact Proposal in Part IV.A with matching target_year and UACS code.
    2. It rolls up into the parent ICT project's total cost (computed_total_project_cost).
    3. It flows into 4-way parity (Tables B.1, B.2, B.3, B.4) under the target fiscal year.
    4. It appears in the compiled PDF, DOCX, and DBM CSV export.
    """
    from app.database.models import (
        Proposal, IctProject, StrategicCategory, StrategicConcern, 
        OrganizationalOutcome
    )

    if not system or not getattr(system, "id", None):
        return None

    cost = Decimal(str(getattr(system, "proposed_cost", 0) or 0))
    is_operational = str(getattr(system, "status", "")).strip().lower() == "operational"

    # Search for an existing linked proposal by system_id or naming pattern
    prop = db.query(Proposal).filter(
        Proposal.issp_period == system.issp_period,
        or_(
            Proposal.system_id == system.id,
            func.lower(Proposal.item_name) == func.lower(f"System Development: {system.name}"),
            func.lower(Proposal.item_name) == func.lower(f"System Enhancement: {system.name}"),
            func.lower(Proposal.item_name) == func.lower(f"Software Development: {system.name}"),
            func.lower(Proposal.item_name) == func.lower(f"Software Engineering: {system.name}"),
            func.lower(Proposal.item_name) == func.lower(system.name)
        )
    ).first()

    # If operational or zero cost, retire any proposal
    if (is_operational and cost <= Decimal("0.00")) or cost <= Decimal("0.00"):
        if prop:
            prop.is_archived = True
            db.flush()
        return None

    # Determine start_year of the cycle and target_year
    start_yr = 2026
    if system.issp_period and "-" in system.issp_period:
        try:
            start_yr = int(system.issp_period.split("-")[0].strip())
        except Exception:
            start_yr = 2026

    target_yr = getattr(system, "target_year", None)
    if not target_yr:
        target_yr = start_yr
        system.target_year = target_yr

    try:
        target_yr = int(target_yr)
    except Exception:
        target_yr = start_yr

    yr_idx = target_yr - start_yr + 1
    if yr_idx < 1:
        yr_idx = 1

    yearly_quantities = {
        str(target_yr): 1,
        f"Year {yr_idx}": 1
    }

    # UACS and expenditure class
    uacs_code = getattr(system, "uacs_object_code", None)
    exp_class = getattr(system, "expenditure_class", None)
    if not uacs_code:
        uacs_code = "50604070 01 - ICT Software (Perpetual CO)" if cost >= Decimal("50000.00") else "50211030 00 - Consulting/Outsourced Development (MOOE)"
        system.uacs_object_code = uacs_code
    if not exp_class:
        exp_class = "Capital Outlay" if "(CO)" in uacs_code else "Maintenance and Other Operating Expenses"
        system.expenditure_class = exp_class

    # Project, strategic category, and funding source
    project_id = getattr(system, "project_id", None)
    strat_cat = "Internal ICT Projects"
    fund_source = "General Appropriations Act (GAA)"
    strat_cat_id = None

    if project_id:
        proj = db.query(IctProject).filter(IctProject.id == project_id).first()
        if proj:
            strat_cat = str(getattr(proj.project_category, "value", proj.project_category) or "Internal ICT Projects")
            fund_source = str(getattr(proj.funding_source, "value", proj.funding_source) or "General Appropriations Act (GAA)")
            sc_obj = db.query(StrategicCategory).filter(func.lower(StrategicCategory.name) == func.lower(strat_cat)).first()
            if sc_obj:
                strat_cat_id = sc_obj.id

    # Organizational Outcome
    outcome_id = None
    if getattr(system, "strategic_concern_id", None):
        concern = db.query(StrategicConcern).filter(StrategicConcern.id == system.strategic_concern_id).first()
        if concern and concern.outcome_id:
            outcome_id = concern.outcome_id

    if not outcome_id:
        default_oo = db.query(OrganizationalOutcome).filter(OrganizationalOutcome.issp_period == system.issp_period).first()
        if default_oo:
            outcome_id = default_oo.id

    # Status mapping
    sub_status = str(getattr(system, "submission_status", "Approved") or "Approved").lower()
    if sub_status == "approved":
        prop_status = "Approved"
    elif sub_status == "submitted":
        prop_status = "Submitted"
    elif sub_status == "returned":
        prop_status = "Returned"
    else:
        prop_status = "Draft"

    sys_status_str = str(getattr(system, "status", "For Development") or "For Development")
    prefix = "System Enhancement" if "enhancement" in sys_status_str.lower() else "System Development"
    item_name = f"{prefix}: {system.name}"

    if not prop:
        prop = Proposal(
            id=uuid.uuid4(),
            system_id=system.id,
            department_id=system.department_id or 1,
            issp_period=system.issp_period,
            outcome_id=outcome_id,
            project_id=project_id,
            needs_assessment_id=getattr(system, "needs_assessment_id", None),
            strategic_category_id=strat_cat_id,
            category="Software",
            strategic_category=strat_cat,
            office_location=system.system_owner_office or "Central Office",
            fund_source=fund_source,
            uacs_object_code=uacs_code,
            expenditure_class=exp_class,
            status=prop_status,
            item_key="other",
            item_name=item_name,
            unit_cost=cost,
            yearly_quantities=yearly_quantities,
            total_qty=1,
            total_cost=cost,
            justification=system.description_and_purpose or f"Approved system outlay for {system.name}.",
            system_development_status=sys_status_str,
            target_office_automated=system.system_owner_office or "Central Office",
            is_archived=False
        )
        db.add(prop)
    else:
        prop.system_id = system.id
        prop.project_id = project_id
        prop.department_id = system.department_id or prop.department_id or 1
        prop.issp_period = system.issp_period
        if outcome_id:
            prop.outcome_id = outcome_id
        if getattr(system, "needs_assessment_id", None):
            prop.needs_assessment_id = system.needs_assessment_id
        prop.item_name = item_name
        prop.category = "Software"
        prop.strategic_category = strat_cat
        if strat_cat_id:
            prop.strategic_category_id = strat_cat_id
        prop.fund_source = fund_source
        prop.uacs_object_code = uacs_code
        prop.expenditure_class = exp_class
        prop.unit_cost = cost
        prop.total_cost = cost
        prop.total_qty = 1
        prop.yearly_quantities = yearly_quantities
        prop.status = prop_status
        prop.system_development_status = sys_status_str
        prop.target_office_automated = system.system_owner_office or prop.target_office_automated or "Central Office"
        prop.justification = system.description_and_purpose or prop.justification
        prop.is_archived = False

    if hasattr(prop, "sync_payload"):
        prop.sync_payload()

    db.flush()
    return prop


# =========================================================================
# 8. CROSS-SECTIONAL DEPENDENCY AUDITORS
# =========================================================================

def verify_canvas_compliance(
    item_select: Optional[str] = "other",
    is_in_house_turnover: bool = False,
    canvas_url: Optional[str] = None,
    canvas_expiry: Optional[datetime] = None
) -> Tuple[bool, str]:
    """
    Centralized validation for quotation canvas compliance against DBM and DICT rules:
    1. Pre-approved catalog items (item_select != 'other') are institutional standard references;
       department users bypass external market canvassing.
    2. In-house / Non-commercial systems are internally developed; commercial market quotation is exempt.
    3. Custom commercial requests require a non-expired verified quotation PDF.
    """
    is_catalog = bool(item_select and str(item_select).strip().lower() != "other")
    if is_catalog:
        return True, "Pre-approved catalog item; verified institutional quotation inherited."

    if is_in_house_turnover:
        return True, "In-house non-commercial development; market quotation canvas is exempt."

    if not canvas_url or not str(canvas_url).strip():
        return False, "Submission locked: A verified quotation canvas PDF is required for custom procurement requests."

    if is_datetime_expired(canvas_expiry):
        return False, "Submission locked: The linked canvas quotation has expired. Please attach an updated quotation proof."

    return True, "Quotation canvas verified."


def verify_annex1_obsolescence_link(
    db: Session,
    issp_period: str,
    item_name: str,
    requested_qty: int,
    department_id: Optional[int] = None,
    category: Optional[Any] = None,
    strategic_category: Optional[Any] = None,
    is_expansion: bool = False,
    is_in_house_turnover: bool = False,
    project_category: Optional[Any] = None
) -> Tuple[bool, str]:
    """
    Asserts that replacement hardware requested is justified by an equivalent 
    or greater volume of physical End of Life (EOL) or Condemned units in Annex 1.

    Exemptions:
    - Expansion proposals bypass EOL matching (adds new capacity).
    - In-house / Non-commercial projects bypass EOL matching.
    - Software, Subscriptions, and Services bypass physical EOL matching.
    - Strategic projects (Part III.E) and continuing costs bypass office equipment EOL quotas.
    """
    if is_expansion:
        return True, "Expansion proposal adds new capacity; exempt from Annex 1 obsolescence retirement matching."
    if is_in_house_turnover:
        return True, "In-house non-commercial asset; exempt from Annex 1 obsolescence retirement matching."

    cat_str = str(getattr(category, "value", category or "")).strip().lower()
    strat_str = str(getattr(strategic_category, "value", strategic_category or "")).strip().lower()
    if project_category:
        strat_str = str(getattr(project_category, "value", project_category or "")).strip().lower()

    # Non-hardware procurement is exempt from physical hardware retirement quotas
    if cat_str and not any(k in cat_str for k in ["hardware", "equipment"]):
        return True, "Non-hardware procurement; exempt from physical obsolescence quota."

    # Strategic project outlays (Internal, Cross-Agency) and continuing expenses are exempt from Office Productivity EOL quotas
    if strat_str and "office productivity" not in strat_str:
        return True, "Project or operational expenditure; exempt from office equipment obsolescence quota."

    from app.database.models import ExistingInventory

    policy = get_governance_policy(db)
    buffer_units = policy.get("hardware_replacement_buffer_units", 3)

    status_col = cast(ExistingInventory.status, String)
    unserviceable_filter = or_(
        ExistingInventory.is_end_of_life == True,
        func.lower(status_col) == "condemned",
        func.lower(status_col) == "needs repair",
        func.lower(status_col) == "unserviceable"
    )

    item_clean = (item_name or "").lower().strip()
    core_hardware_keywords = ["desktop", "laptop", "server", "printer", "switch", "router", "tablet", "mobile", "phone"]
    matched_keywords = [kw for kw in core_hardware_keywords if kw in item_clean]

    keyword_filters = [ExistingInventory.item_name.ilike(f"%{kw}%") for kw in matched_keywords]
    if hasattr(ExistingInventory, "dict_category"):
        dict_category_filters = [cast(ExistingInventory.dict_category, String).ilike(f"%{kw}%") for kw in matched_keywords]
        keyword_filters.extend(dict_category_filters)

    name_filter = or_(
        ExistingInventory.item_name.ilike(f"%{item_name}%"),
        ExistingInventory.exact_model.ilike(f"%{item_name}%"),
        *keyword_filters
    ) if keyword_filters else ExistingInventory.item_name.ilike(f"%{item_name}%")

    query = db.query(func.sum(ExistingInventory.quantity)).filter(
        or_(
            ExistingInventory.issp_period == issp_period,
            ExistingInventory.issp_period.is_(None)
        ),
        ExistingInventory.is_software == False,
        ExistingInventory.replacement_proposal_id.is_(None),  # Must be unconsumed
        unserviceable_filter,
        name_filter
    )

    if department_id is not None:
        query = query.filter(ExistingInventory.department_id == department_id)

    eol_units = query.scalar() or 0

    if requested_qty > (int(eol_units) + buffer_units):
        scope_str = f"for department {department_id}" if department_id else "in departmental inventory"
        return False, (
            f"Obsolescence Quota Exceeded: Requesting {requested_qty} replacement units for '{item_name}', "
            f"but Annex 1 records only {int(eol_units)} unconsumed End of Life (EOL) or Condemned physical units {scope_str}. "
            f"Either adjust the requested quantity or mark this proposal as an 'Expansion Project'."
        )
    return True, "Obsolescence quota verified."


def verify_strategic_concern_resolution(db: Session, issp_period: str, concern: Any) -> Tuple[bool, str]:
    """
    Verifies that a Strategic Concern (Part II.A) is actively resolved by ANY valid
    institutional pathway in accordance with DICT methodology:
    1. An Information System (Part II.C or Part III.D)
    2. A Strategic ICT Project (Part III.E)
    3. Hardware / Physical Resource Line Items (Part IV.A)
    4. Network Infrastructure (Part II.B.1 / III.A.1)
    5. Section 8.0 Department Needs Assessments
    """
    from app.database.models import (
        InformationSystem, IctProject, Proposal, NetworkInfrastructure, NeedsAssessment
    )

    c_id = getattr(concern, "id", None)
    c_id_str = str(c_id).strip() if c_id else ""
    c_text = str(getattr(concern, "critical_system", "") or "").strip().lower()
    c_intended = str(getattr(concern, "intended_use", "") or "").strip().lower()
    c_prob = str(getattr(concern, "problems", "") or "").strip().lower()

    # Extract meaningful keywords from critical_system and intended_use
    stop_words = {"system", "with", "from", "that", "this", "agency", "department", "user", "core", "into", "online", "office"}
    keywords = [
        w for w in re.split(r'[^a-z0-9]+', f"{c_text} {c_intended}")
        if len(w) > 3 and w not in stop_words
    ]

    # 1. Check Information Systems (Direct FK, exact name match, or keyword containment)
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

    if linked_systems > 0:
        return True, "Resolved via Information System."

    # 2. Check Strategic ICT Projects (Direct alignment, outcome linkage, or keyword matching)
    project_filters = []
    if hasattr(IctProject, "strategic_concern_id") and c_id:
        project_filters.append(getattr(IctProject, "strategic_concern_id") == c_id)
    if hasattr(IctProject, "outcome_id") and getattr(concern, "outcome_id", None):
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

    if linked_projects > 0:
        return True, "Resolved via Strategic ICT Project."

    # 3. Check Resource Proposals (Hardware, Peripherals, Infrastructure)
    prop_filters = []
    if hasattr(Proposal, "strategic_concern_id") and c_id:
        prop_filters.append(getattr(Proposal, "strategic_concern_id") == c_id)
    if hasattr(Proposal, "outcome_id") and getattr(concern, "outcome_id", None):
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

    if linked_proposals > 0:
        return True, "Resolved via Hardware / Resource Deployment."

    # 4. Check Network Infrastructure Setup (Connectivity, Bandwidth, Topology, or Datacenter facility)
    is_network_related = any(
        kw in f"{c_text} {c_intended} {c_prob}"
        for kw in ["network", "bandwidth", "fiber", "lan", "wan", "internet", "connectivity", "switch", "router", "datacenter", "data center", "ups", "generator", "power"]
    )
    if is_network_related:
        linked_network = db.query(NetworkInfrastructure).filter(
            NetworkInfrastructure.issp_period == issp_period
        ).count()
        if linked_network > 0:
            return True, "Resolved via Network Infrastructure Deployment."

    # 5. Check Section 8.0 Department Needs Assessments
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

    if linked_needs > 0:
        return True, "Resolved via Section 8.0 Needs Assessment."

    return False, f"Strategic Concern '{concern.critical_system}' is not addressed by any system, project, hardware, network, or needs assessment."


def verify_pia_compliance(db: Session, system_id: Any) -> Tuple[bool, str]:
    """
    Enforces Data Privacy Act compliance. If a system handles personal data
    without an audit, a PIA phase must be scheduled in the project milestones or target audit date recorded [1].
    """
    from app.database.models import InformationSystem, IctProject

    sys_id_clean = str(system_id).strip() if system_id else None
    if not sys_id_clean:
        return True, "No system specified."

    system = db.query(InformationSystem).filter(
        or_(
            InformationSystem.id == system_id,
            cast(InformationSystem.id, String) == sys_id_clean
        )
    ).first()

    if not system:
        return False, "Information System record not found."

    if system.processes_personal_information and not system.has_undergone_pia:
        has_pia_milestone = False

        # Check if system itself has scheduled target audit date recorded
        if getattr(system, "pia_target_date_text", None) and str(system.pia_target_date_text).strip():
            has_pia_milestone = True
        else:
            # Check project relationships (project_parent, projects, project_id)
            candidate_projects = list(getattr(system, "projects", []) or [])
            if getattr(system, "project_parent", None) and system.project_parent not in candidate_projects:
                candidate_projects.append(system.project_parent)

            if getattr(system, "project_id", None):
                p_by_id = db.query(IctProject).filter(
                    or_(
                        IctProject.id == system.project_id,
                        cast(IctProject.id, String) == str(system.project_id).strip()
                    )
                ).first()
                if p_by_id and p_by_id not in candidate_projects:
                    candidate_projects.append(p_by_id)

            for proj in candidate_projects:
                deliverables_list = []
                annual_deliv = getattr(proj, "annual_deliverables", {})
                if isinstance(annual_deliv, str):
                    try:
                        annual_deliv = json.loads(annual_deliv)
                    except Exception:
                        annual_deliv = {}
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
                f"Data Privacy Compliance Required: System '{system.name}' processes personal information "
                f"without a completed audit, but no Privacy Impact Assessment (PIA) target date or milestone is scheduled [1]."
            )

    return True, "PIA compliance verified."


def verify_drbcp_funding(db: Session, issp_period: str) -> Tuple[bool, str]:
    """
    Verifies that mission-critical systems in Annex 2 (RTO <= 4 hours) have appropriate
    cloud hosting and offsite backup funding allocated under Continuing Costs or an active ICT Project.
    """
    from app.database.models import BusinessImpactAnalysis, Proposal

    critical_bias = db.query(BusinessImpactAnalysis).filter(
        BusinessImpactAnalysis.issp_period == issp_period,
        BusinessImpactAnalysis.rto_hours <= 4
    ).all()

    if critical_bias:
        uacs_col = cast(Proposal.uacs_object_code, String)

        # In DICT v.2026 methodology, all proposals must be bound to an ICT Project
        cloud_items = db.query(Proposal).filter(
            Proposal.issp_period == issp_period,
            func.lower(cast(Proposal.status, String)) == "approved",
            Proposal.project_id.isnot(None),
            or_(
                func.lower(uacs_col).like("%subscription%"),
                func.lower(Proposal.item_name).like("%cloud%"),
                func.lower(Proposal.item_name).like("%dr%"),
                func.lower(Proposal.item_name).like("%backup%"),
                func.lower(Proposal.item_name).like("%disaster%"),
                func.lower(Proposal.item_name).like("%failover%"),
                func.lower(Proposal.item_name).like("%replication%")
            ),
            or_(Proposal.is_archived == False, Proposal.is_archived.is_(None))
        ).all()

        total_cloud_funding = sum((Decimal(str(item.total_cost or 0)) for item in cloud_items), Decimal("0.00"))
        if total_cloud_funding <= Decimal("0.00"):
            return False, (
                "Disaster Recovery & Continuity Funding Required: Frontline mission-critical systems require an RTO <= 4 hours "
                "(mandating GovCloud real-time failover), but no funding is allocated under an approved ICT Project for Cloud/DR Subscriptions in Part IV.A."
            )

    return True, "DRBCP continuity funding verified."


# =========================================================================
# 9. CENTRALIZED COA AUDIT LOGGING HELPER
# =========================================================================

def sanitize_for_json(obj: Any) -> Any:
    """
    Recursively converts Decimals, UUIDs, datetimes, dates, sets, and Enums
    into JSON-safe primitives. Prevents 'TypeError: Object of type Decimal is not JSON serializable'.
    """
    if isinstance(obj, dict):
        return {str(k): sanitize_for_json(v) for k, v in obj.items()}
    elif isinstance(obj, (list, tuple, set)):
        return [sanitize_for_json(i) for i in obj]
    elif isinstance(obj, Decimal):
        return float(obj)
    elif isinstance(obj, uuid.UUID):
        return str(obj)
    elif isinstance(obj, (datetime, date)):
        return obj.isoformat()
    elif hasattr(obj, "value"):  # Enums and SafeEnumStr
        return obj.value

    try:
        json.dumps(obj)
        return obj
    except (TypeError, OverflowError):
        return str(obj)


def log_audit_event(
    db: Session,
    action: str,
    module: str = "GOVERNANCE",
    user_id: Optional[int] = None,
    department_id: Optional[int] = None,
    proposal_id: Optional[Any] = None,
    ip_address: Optional[str] = None,
    old_value: Optional[Dict[str, Any]] = None,
    new_value: Optional[Dict[str, Any]] = None
):
    """
    Centralized, immutable COA audit logger.
    Recursively sanitizes state payloads, records client IP addresses,
    and logs timestamps without JSON serialization exceptions.
    """
    from app.database.models import AuditTrail

    # Coerce string proposal_id to UUID if string representation is valid
    resolved_pid = proposal_id
    if resolved_pid and isinstance(resolved_pid, str):
        try:
            resolved_pid = uuid.UUID(resolved_pid.strip())
        except Exception:
            pass

    audit = AuditTrail(
        action=action,
        module=module,
        user_id=user_id,
        department_id=department_id,
        proposal_id=resolved_pid,
        ip_address=ip_address,
        old_value=sanitize_for_json(old_value) if old_value else None,
        new_value=sanitize_for_json(new_value) if new_value else None
    )
    db.add(audit)
    try:
        db.flush()
    except Exception as e:
        logger.error(f"Failed to record audit trail event '{action}' in module '{module}': {str(e)}")
    return audit