# app/utils/helpers.py
import os
import uuid
import html
import logging
import posixpath
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
    Safely extracts the S3 key from a storage URL. Protects against
    path traversal (..) and enforces platform-independent URL path processing.
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
        path_parts = raw_path.split("/")
        if ".." in path_parts or "." in path_parts:
            logger.warning(f"Security Alert: Blocked directory traversal attempt: {url}")
            return None

        # Posix standard normalization prevents Windows backslash discrepancies
        normalized_path = posixpath.normpath(raw_path).lstrip("/")

        # Clean static uploads directory prefix for emulated local setups
        static_prefix = "static/uploads"
        if normalized_path.startswith(static_prefix):
            normalized_path = normalized_path[len(static_prefix):].lstrip("/")

        expected_bucket = settings.AWS_STORAGE_BUCKET_NAME
        region = getattr(settings, "AWS_S3_REGION_NAME", "ap-southeast-1")

        allowed_hosts = {
            f"{expected_bucket}.s3.amazonaws.com",
            f"{expected_bucket}.s3.{region}.amazonaws.com",
        }

        if settings.STORAGE_TYPE == "s3":
            is_valid_domain = parsed.netloc in allowed_hosts
        else:
            is_valid_domain = (
                not parsed.netloc 
                or parsed.netloc in ["localhost", "127.0.0.1", "localhost:8000", "127.0.0.1:8000"]
                or parsed.netloc in allowed_hosts
            )

        if not is_valid_domain:
            logger.warning(f"Unsanitized hostname detected in key extraction: {parsed.netloc}")
            return None

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
    active_narrative = db.query(MasterNarrative).filter(MasterNarrative.is_active == True).first()
    if active_narrative:
        return active_narrative.issp_period
    latest_narrative = db.query(MasterNarrative).order_by(MasterNarrative.issp_period.desc()).first()
    if latest_narrative:
        return latest_narrative.issp_period
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
    Standardizes inputs to use string keys, aligns them with cycle expectations,
    and backfills missing planning years.
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
    
    # Map and align with planning bounds
    aligned_data = {year: sanitized_input.get(year, 0) for year in expected_years}
            
    if is_submitting:
        original_keys = set(sanitized_input.keys())
        expected_set = set(expected_years)
        if original_keys != expected_set:
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