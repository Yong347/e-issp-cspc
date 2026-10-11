# app/config.py
import os
import sys
import logging
from decimal import Decimal
from typing import Optional, List
from datetime import datetime, timezone
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

    # Dynamically compute default 3-year statutory cycle from active calendar year (Y -> Y + 2)
    _current_year: int = datetime.now(timezone.utc).year
    DEFAULT_ISSP_CYCLE: str = os.getenv("DEFAULT_ISSP_CYCLE", f"{_current_year}-{_current_year + 2}")

    # Comma-separated list of authorized email domains (set to "*" to allow all domains)
    ALLOWED_EMAIL_DOMAINS: List[str] = [
        domain.strip().lower()
        for domain in os.getenv("ALLOWED_EMAIL_DOMAINS", "*").split(",")
        if domain.strip()
    ]

    # Normalize DATABASE_URL to avoid "No module named 'psycopg'" dialect mismatches across drivers
    _raw_db_url = os.getenv(
        "DATABASE_URL", 
        "postgresql+psycopg2://postgres:postgres@localhost:5432/issp_core"
    ).strip()
    if _raw_db_url.startswith("postgres://"):
        _raw_db_url = _raw_db_url.replace("postgres://", "postgresql+psycopg2://", 1)
    elif _raw_db_url.startswith("postgresql://") and not _raw_db_url.startswith("postgresql+"):
        _raw_db_url = _raw_db_url.replace("postgresql://", "postgresql+psycopg2://", 1)

    # Azure PostgreSQL Flexible Server strictly requires SSL
    if "postgres.database.azure.com" in _raw_db_url and "sslmode=" not in _raw_db_url:
        _sep = "&" if "?" in _raw_db_url else "?"
        _raw_db_url = f"{_raw_db_url}{_sep}sslmode=require"

    DATABASE_URL: str = _raw_db_url

    # Celery Broker / Result Backend URL
    REDIS_URL: str = os.getenv("REDIS_URL", "redis://localhost:6379/0").strip()
    STORAGE_TYPE: str = os.getenv("STORAGE_TYPE", "local").lower().strip()
    
    # Cloud / Azure Environment Detection
    _website_host = os.getenv("WEBSITE_HOSTNAME")
    _default_api_base = f"https://{_website_host}" if _website_host else "http://localhost:8000"

    # Absolute Backend API Path used to solve cross-origin asset links
    API_BASE_URL: str = os.getenv("API_BASE_URL", _default_api_base).rstrip("/")
    
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
    SECRET_KEY: str = os.getenv("SECRET_KEY", "temporary_insecure_development_secret_key_change_in_production")
    
    # Legacy EncryptedJSON keys are optional (prevents hard boot crashes when using plain JSON)
    DB_ENCRYPTION_KEY: Optional[str] = os.getenv("DB_ENCRYPTION_KEY", None)
    DB_ENCRYPTION_SALT: Optional[str] = os.getenv("DB_ENCRYPTION_SALT", None)
    
    DEFAULT_SEED_PASSWORD: str = os.getenv("DEFAULT_SEED_PASSWORD", "admin123")
    
    # Dynamic CORS Configurations (Automatically whitelists current Azure App Service domain)
    _default_cors = [
        "http://localhost:3000",
        "http://localhost:5173",
        "http://localhost:8000",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:8000"
    ]
    if _website_host:
        _default_cors.extend([
            f"https://{_website_host}",
            f"http://{_website_host}"
        ])

    _raw_cors = os.getenv("CORS_ORIGINS", ",".join(_default_cors))
    CORS_ORIGINS: List[str] = [
        origin.strip()
        for origin in _raw_cors.split(",")
        if origin.strip()
    ]
    if _website_host:
        for proto in ["https://", "http://"]:
            h = f"{proto}{_website_host}"
            if h not in CORS_ORIGINS:
                CORS_ORIGINS.append(h)

    # Global ceiling limit for financial planning validation checks
    GLOBAL_BUDGET_CEILING: Decimal = Decimal(os.getenv("GLOBAL_BUDGET_CEILING", "200000000.00"))

    # Local Directory Configurations
    # On Azure App Service Linux, /home is persistent storage mounted across restarts
    BASE_DIR: str = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    _is_azure = bool(_website_host or os.getenv("WEBSITE_SITE_NAME") or os.getenv("HOME") == "/home")
    _default_upload_dir = "/home/uploads" if (_is_azure and os.path.exists("/home")) else os.path.join(BASE_DIR, "uploads")
    LOCAL_UPLOAD_DIR: str = os.getenv("LOCAL_UPLOAD_DIR", _default_upload_dir)

    # Celery Worker Reliability, Fail-Fast & Resource Parameters
    CELERY_ALWAYS_EAGER: bool = os.getenv("CELERY_ALWAYS_EAGER", "false").lower() in ("true", "1", "yes")
    CELERY_BROKER_MAX_RETRIES: int = int(os.getenv("CELERY_BROKER_MAX_RETRIES", "2"))
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
    elif "postgres:postgres@localhost:5432/issp_core" in settings.DATABASE_URL:
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