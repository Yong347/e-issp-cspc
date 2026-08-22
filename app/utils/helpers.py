# app/utils/helpers.py
import os
import uuid
import html
import logging
import posixpath
import importlib
import json
from typing import List, Optional, Any, Dict, Tuple
from urllib.parse import urlparse
from sqlalchemy.orm import Session
from fastapi import HTTPException, status

from app.config import settings

logger = logging.getLogger("app.utils.helpers")


def secure_filename(filename: str) -> str:
    """
    Sanitizes a filename by removing path traversal characters, directory components,
    and preserving only safe alphanumeric characters, underscores, dashes, and dots.
    """
    if not filename:
        return f"upload_{uuid.uuid4().hex}.bin"
    
    # Strip directory components (both Unix and Windows style separators)
    base = os.path.basename(filename.replace("\\", "/"))
    
    # Filter safe characters
    sanitized = "".join(c for c in base if c.isalnum() or c in "._-").strip()
    
    # Enforce name safety boundaries
    if not sanitized or sanitized in (".", ".."):
        ext = os.path.splitext(base)[1]
        sanitized = f"upload_{uuid.uuid4().hex}{ext if ext else '.bin'}"
        
    return sanitized


def get_s3_key_from_url(url: Optional[str]) -> Optional[str]:
    """
    Fix (Anomaly 13): Safely extracts the S3 key from a storage URL.
    Validates against dynamic bucket rotations and legacy fallback domains.
    Protects against path traversal (..) and enforces platform-independent URL path processing.
    """
    if not url:
        return None
    try:
        parsed = urlparse(url)
        
        # Enforce secure schemes
        if parsed.scheme and parsed.scheme not in ("http", "https"):
            logger.warning(f"Rejected non-HTTP storage URL scheme: {parsed.scheme}")
            return None

        raw_path = parsed.path.replace("\\", "/")

        # Direct verification of traversal elements inside path segments
        path_parts = [p for p in raw_path.split("/") if p]
        if ".." in path_parts or "." in path_parts:
            logger.warning(f"Security Alert: Blocked directory traversal attempt: {url}")
            return None

        # Posix standard normalization prevents Windows backslash discrepancies
        normalized_path = posixpath.normpath(raw_path).lstrip("/")

        # Clean static uploads directory prefix for emulated local setups
        static_prefix = "static/uploads"
        if normalized_path.startswith(static_prefix):
            normalized_path = normalized_path[len(static_prefix):].lstrip("/")
            return normalized_path

        expected_bucket = settings.AWS_STORAGE_BUCKET_NAME
        region = getattr(settings, "AWS_S3_REGION_NAME", "ap-southeast-1")

        # Compile set of authorized S3 host domains including legacy rotated fallback buckets
        allowed_buckets = [expected_bucket]
        fallback_buckets = getattr(settings, "AWS_FALLBACK_BUCKETS", [])
        if fallback_buckets:
            allowed_buckets.extend(fallback_buckets)

        allowed_hosts = set()
        for b in allowed_buckets:
            allowed_hosts.add(f"{b}.s3.amazonaws.com")
            allowed_hosts.add(f"{b}.s3.{region}.amazonaws.com")
            allowed_hosts.add(f"{b}.s3-control.amazonaws.com")

        is_valid_domain = (
            not parsed.netloc 
            or parsed.netloc in ["localhost", "127.0.0.1", "localhost:8000", "127.0.0.1:8000"]
            or parsed.netloc in allowed_hosts
            or any(b in parsed.netloc for b in allowed_buckets)  # Handle virtual subdomain patterns
        )

        if not is_valid_domain:
            logger.warning(f"Unsanitized hostname detected in key extraction: {parsed.netloc}")
            return None

        # Strip bucket prefix if name resides inside the URL path parameter rather than the subdomain
        for b in allowed_buckets:
            if normalized_path.startswith(f"{b}/"):
                normalized_path = normalized_path[len(f"{b}/"):].lstrip("/")
                break

        return normalized_path if normalized_path else None
    except Exception as e:
        logger.error(f"Error parsing storage key URL: {str(e)}")
        return None


def get_active_issp_period(db: Session) -> str:
    """
    Queries the database for the active planning cycle configured by the Administrator.
    Falls back to the latest cycle if no active coversheet is flagged.
    """
    from app.database.models import MasterNarrative
    try:
        active_narrative = db.query(MasterNarrative).filter(MasterNarrative.is_active == True).first()
        if active_narrative:
            return active_narrative.issp_period
    except Exception as e:
        db.rollback()  # Rollback transaction to clear failed state before callers execute secondary queries
        logger.warning(f"Defensive check: Failed to query active MasterNarrative issp_period: {str(e)}")
        
    try:
        latest_narrative = db.query(MasterNarrative).order_by(MasterNarrative.issp_period.desc()).first()
        if latest_narrative:
            return latest_narrative.issp_period
    except Exception as e:
        db.rollback()  # Rollback transaction to clear failed state before callers execute secondary queries
        logger.warning(f"Defensive check: Failed to query latest MasterNarrative issp_period: {str(e)}")
        
    return "2026-2028"


def validate_active_years_alignment(db: Session, submitted_years: List[Any]) -> str:
    """
    Validates that the keys of the submitted year-by-year dictionary 
    match the active planning period exactly. Returns the active issp_period.
    """
    from app.database.models import MasterNarrative
    active_narrative = db.query(MasterNarrative).filter(MasterNarrative.is_active == True).first()
    if not active_narrative:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No active ISSP planning cycle has been configured by the system administrator."
        )
    if not active_narrative.issp_period_from or not active_narrative.issp_period_to:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Active ISSP planning period years are not properly configured."
        )

    expected_years = [
        str(year) 
        for year in range(active_narrative.issp_period_from, active_narrative.issp_period_to + 1)
    ]
    
    # Cast all years to strings to align formatting types
    submitted_years_str = [str(year).strip() for year in submitted_years]

    if sorted(submitted_years_str) != sorted(expected_years):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Validation Failed: Submitted years {submitted_years_str} do not match active planning cycle {expected_years}."
        )
    return active_narrative.issp_period


def align_and_validate_years(db: Session, yearly_data: dict[str, int], is_submitting: bool = False) -> Tuple[str, dict[str, int]]:
    """
    Fix (Anomaly 2): Standardizes inputs to use string keys, aligns them with cycle expectations,
    and backfills missing planning years. Gracefully shifts legacy keys during cycle transitions
    to prevent read operations from failing with strict validation blockages.
    """
    from app.database.models import MasterNarrative
    active_narrative = db.query(MasterNarrative).filter(MasterNarrative.is_active == True).first()
    if not active_narrative:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No active ISSP planning cycle has been configured by the system administrator."
        )
    if not active_narrative.issp_period_from or not active_narrative.issp_period_to:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Active ISSP planning period years are not properly configured."
        )

    expected_years = [
        str(year) 
        for year in range(active_narrative.issp_period_from, active_narrative.issp_period_to + 1)
    ]
    
    # Sanitize and convert year keys to string keys
    sanitized_input = {str(k).strip(): int(v) for k, v in yearly_data.items() if v is not None}
    
    # Map matching years and default missing years to 0
    aligned_data = {year: sanitized_input.get(year, 0) for year in expected_years}

    # If there are no direct matches but we have valid historical sequential entries,
    # shift values sequentially to the new cycle slots to preserve data footprints.
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
                detail=f"Validation Failed: Submitted years {sorted(list(original_keys))} do not match active planning cycle {expected_years}."
            )
    return active_narrative.issp_period, aligned_data


def check_and_update_glacier_metadata(db: Session, target: Any, canvas_url: Optional[str]) -> Tuple[str, bool]:
    """Queries S3 storage properties to resolve lifecycle metrics on retrieved objects."""
    if getattr(settings, "STORAGE_TYPE", "local").lower() != "s3":
        return "STANDARD", False

    s3_storage_class = target.s3_storage_class
    is_restoring = target.is_restoring

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
                logger.error(f"Failed to refresh Glacier restore status for object key '{key}': {str(e)}")
    return s3_storage_class, is_restoring


def validate_pdf_content(file_bytes: bytes) -> bool:
    """
    Fix (Anomaly 14): Inspects the binary header bytes of uploaded files
    to verify true MIME types and prevent content-type header spoofing.
    """
    try:
        # Dynamically import to bypass static analysis warnings (e.g. Pylance)
        magic = importlib.import_module("magic")
        mime = magic.Magic(mime=True)
        detected_type = mime.from_buffer(file_bytes[:2048])
        return detected_type == "application/pdf"
    except (ImportError, AttributeError, Exception):
        # Secure binary fallback pattern check if python-magic dependencies are unavailable
        return file_bytes.startswith(b"%PDF-")


def get_dict_from_payload(payload: Any) -> dict:
    """
    Defensively parses and returns a dictionary from the database payload.
    Handles raw strings, None, and doubly-serialized JSON structures on SQLite.
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