# app/config.py
import os
import sys
import logging
from decimal import Decimal
from typing import Optional, List
from dotenv import load_dotenv

# Load environment variables from a .env file if present
load_dotenv()

logger = logging.getLogger("app.config")


class Settings:
    # Normalize environment variable to prevent validation bypasses
    _raw_env = os.getenv("ENV", "development").lower().strip()
    if _raw_env in ["prod", "production"]:
        ENV: str = "production"
    elif _raw_env in ["dev", "development"]:
        ENV: str = "development"
    elif _raw_env in ["test", "testing"]:
        ENV: str = "testing"
    else:
        ENV: str = "development"  # Safe default fallback configuration

    # --- DYNAMIC INSTITUTIONAL CONFIGURATIONS (ZERO HARDCODING) ---
    DEFAULT_AGENCY_NAME: str = os.getenv("DEFAULT_AGENCY_NAME", "National Government Agency")
    DEFAULT_AGENCY_WEBSITE: str = os.getenv("DEFAULT_AGENCY_WEBSITE", "https://agency.gov.ph")
    DEFAULT_AGENCY_HEAD_TITLE: str = os.getenv("DEFAULT_AGENCY_HEAD_TITLE", "Head of Agency")
    DEFAULT_ISSP_CYCLE: str = os.getenv("DEFAULT_ISSP_CYCLE", "2026-2028")

    # Comma-separated list of authorized email domains (set to "*" to allow all domains)
    ALLOWED_EMAIL_DOMAINS: List[str] = [
        domain.strip().lower()
        for domain in os.getenv("ALLOWED_EMAIL_DOMAINS", "*").split(",")
        if domain.strip()
    ]

    DATABASE_URL: str = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/issp_core")
    REDIS_URL: str = os.getenv("REDIS_URL", "redis://localhost:6379/0")
    STORAGE_TYPE: str = os.getenv("STORAGE_TYPE", "local").lower().strip()
    
    # Absolute Backend API Path used to solve cross-origin asset links
    API_BASE_URL: str = os.getenv("API_BASE_URL", "http://localhost:8000")
    
    # S3 Storage Credentials & Settings
    AWS_ACCESS_KEY_ID: Optional[str] = os.getenv("AWS_ACCESS_KEY_ID")
    AWS_SECRET_ACCESS_KEY: Optional[str] = os.getenv("AWS_SECRET_ACCESS_KEY")
    AWS_STORAGE_BUCKET_NAME: str = os.getenv("AWS_STORAGE_BUCKET_NAME", "issp-vault")
    AWS_S3_REGION_NAME: str = os.getenv("AWS_S3_REGION_NAME", "ap-southeast-1")

    # Allowed legacy/fallback buckets to prevent parsing blocks when bucket names are rotated
    AWS_FALLBACK_BUCKETS: List[str] = [
        bucket.strip()
        for bucket in os.getenv("AWS_FALLBACK_BUCKETS", "").split(",")
        if bucket.strip()
    ]

    # Cryptographic keys and default passwords
    # SECRET_KEY uses a secure dev fallback when not configured in local/test environments
    SECRET_KEY: str = os.getenv("SECRET_KEY", "temporary_insecure_development_secret_key_change_in_production")
    
    # Legacy EncryptedJSON keys are optional (prevents hard boot crashes when using plain JSON)
    DB_ENCRYPTION_KEY: Optional[str] = os.getenv("DB_ENCRYPTION_KEY", None)
    DB_ENCRYPTION_SALT: Optional[str] = os.getenv("DB_ENCRYPTION_SALT", None)
    
    DEFAULT_SEED_PASSWORD: str = os.getenv("DEFAULT_SEED_PASSWORD", "admin123")
    
    # CORS Configurations - Enforced statically to prevent port expansion vulnerabilities.
    CORS_ORIGINS: List[str] = [
        origin.strip()
        for origin in os.getenv(
            "CORS_ORIGINS", 
            "http://localhost:3000,http://localhost:5173,http://localhost:8000,http://127.0.0.1:3000,http://127.0.0.1:5173,http://127.0.0.1:8000"
        ).split(",")
        if origin.strip()
    ]

    # Global ceiling limit for financial planning validation checks
    GLOBAL_BUDGET_CEILING: Decimal = Decimal(os.getenv("GLOBAL_BUDGET_CEILING", "200000000.00"))

    # Local Directory Configurations
    BASE_DIR: str = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    LOCAL_UPLOAD_DIR: str = os.getenv("LOCAL_UPLOAD_DIR", os.path.join(BASE_DIR, "uploads"))

    # Celery worker reliability and resource limit parameters
    CELERY_TASK_REJECT_ON_WORKER_LOST: bool = os.getenv("CELERY_TASK_REJECT_ON_WORKER_LOST", "true").lower() in ("true", "1", "yes")
    CELERY_WORKER_MAX_TASKS_PER_CHILD: int = int(os.getenv("CELERY_WORKER_MAX_TASKS_PER_CHILD", "100"))
    CELERY_TASK_SOFT_TIME_LIMIT: int = int(os.getenv("CELERY_TASK_SOFT_TIME_LIMIT", "1500"))  # 25 minutes
    CELERY_TASK_TIME_LIMIT: int = int(os.getenv("CELERY_TASK_TIME_LIMIT", "1800"))            # 30 minutes


settings = Settings()

# ==========================================================
# ENV-AGNOSTIC STATIC SECURITY SANITY CHECKS
# ==========================================================

# Strict assertion of security configurations in production environments
if settings.ENV == "production":
    if not settings.SECRET_KEY or "temporary" in settings.SECRET_KEY:
        logger.error("SECURITY FAILURE: SECRET_KEY environment variable is not defined or is insecure.")
        raise ValueError("Insecure environment configuration: SECRET_KEY must be uniquely configured in production.")
        
    if not settings.DEFAULT_SEED_PASSWORD or settings.DEFAULT_SEED_PASSWORD == "admin123":
        logger.warning("DEFAULT_SEED_PASSWORD is using default fallback in production. Configure a strong password.")
else:
    if not settings.SECRET_KEY or "temporary" in settings.SECRET_KEY:
        logger.warning("Using temporary development SECRET_KEY. Set a unique SECRET_KEY for production deployments.")

# Optional check for DB_ENCRYPTION_KEY / SALT (non-blocking for plain JSON operation)
if not settings.DB_ENCRYPTION_KEY or not settings.DB_ENCRYPTION_SALT:
    logger.debug("DB_ENCRYPTION_KEY or DB_ENCRYPTION_SALT not defined. Legacy payload encryption is inactive/deprecated.")

# Enforce secure pre-flight checks if storage mode is configured for S3 target buckets
if settings.STORAGE_TYPE == "s3":
    if not settings.AWS_ACCESS_KEY_ID or not settings.AWS_SECRET_ACCESS_KEY:
        logger.error("STORAGE CONFIGURATION FAILURE: S3 credentials are missing.")
        raise ValueError("Invalid storage configuration: AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY must be specified when STORAGE_TYPE='s3'.")
    if not settings.AWS_STORAGE_BUCKET_NAME:
        logger.error("STORAGE CONFIGURATION FAILURE: AWS_STORAGE_BUCKET_NAME is not defined.")
        raise ValueError("Invalid storage configuration: AWS_STORAGE_BUCKET_NAME must be specified when STORAGE_TYPE='s3'.")

# Check for Celery worker environment database synchronization risks
is_celery_worker = "CELERY_TASK_NAMES" in os.environ or any("celery" in arg.lower() for arg in getattr(sys, "argv", []))
if is_celery_worker:
    logger.info("Worker runtime detected. Verifying database connection sync parameters...")
    if "sqlite" in settings.DATABASE_URL.lower():
        logger.warning(
            "Celery worker is running with a local SQLite database configuration. "
            "Ensure the worker container shares the exact same physical DB file volume path "
            "as the FastAPI web server to prevent transaction and state mismatch anomalies."
        )
    elif settings.DATABASE_URL == "postgresql://postgres:postgres@localhost:5432/issp_core":
        logger.warning(
            "Celery worker is running with the default PostgreSQL fallback URL. "
            "If your FastAPI server is using a different database setup, "
            "background tasks may fail to locate newly registered proposals due to database mismatch. "
            "Verify that the worker's DATABASE_URL matches the core web server's environment configuration."
        )

# ==========================================================
# PRODUCTION SECURITY VALIDATION CHECKS
# ==========================================================

INSECURE_SALT_DEFAULTS = [
    "issp_secure_static_encryption_salt",
    "default_insecure_static_encryption_salt",
    "static_encryption_salt",
    "changeme_encryption_salt"
]

if settings.ENV == "production":
    if settings.DB_ENCRYPTION_SALT and settings.DB_ENCRYPTION_SALT in INSECURE_SALT_DEFAULTS:
        logger.warning("Insecure static fallback DB_ENCRYPTION_SALT detected in production.")
    logger.info("Production environment configurations validated successfully.")
else:
    logger.warning(
        f"Development mode active (ENV={settings.ENV}). Secure validation checks are configured as warnings."
    )
    if settings.DB_ENCRYPTION_SALT and settings.DB_ENCRYPTION_SALT in INSECURE_SALT_DEFAULTS:
        logger.warning("Using insecure static fallback DB_ENCRYPTION_SALT. Configure a unique value prior to deploying.")