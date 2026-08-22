# app/main.py
import os
import sys
import time
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, status, HTTPException
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.exceptions import RequestValidationError
from fastapi.encoders import jsonable_encoder  # Imported to serialize nested custom Pydantic errors safely

from app.config import settings
from app.auth.router import router as auth_router
from app.dept.router import router as dept_router
from app.admin.router import router as admin_router
from app.database.models import Base, DecryptionError, BusinessRuleViolation
from app.database.session import engine

# Configure diagnostic stdout logging
logging.basicConfig(
    level=logging.INFO,
    format="[E-ISSP SYSTEM] %(asctime)s - %(levelname)s - %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)]
)
logger = logging.getLogger("app.main")

# Resolve allowed CORS origins safely
cors_origins = settings.CORS_ORIGINS
if not cors_origins:
    cors_origins = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000"
    ]
elif isinstance(cors_origins, str):
    cors_origins = [origin.strip() for origin in cors_origins.split(",") if origin.strip()]


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Handles application startup and shutdown procedures.
    Prints all registered endpoints to stdout on boot to verify route structures.
    """
    logger.info("=" * 70)
    logger.info("INITIALIZING CSPC E-ISSP COMPLIANCE ENGINE")
    logger.info("=" * 70)
    
    # Run database migrations/initialization safely
    alembic_ini_path = os.path.join(settings.BASE_DIR, "alembic.ini")
    if os.path.exists(alembic_ini_path):
        try:
            from sqlalchemy import inspect
            import alembic.config
            import alembic.command
            
            alembic_cfg = alembic.config.Config(alembic_ini_path)
            inspector = inspect(engine)
            tables = inspector.get_table_names()
            
            # If the database is completely empty, build the base schema and stamp it
            if not tables:
                logger.info("Fresh database detected. Creating tables via metadata and stamping Alembic head...")
                Base.metadata.create_all(bind=engine)
                alembic.command.stamp(alembic_cfg, "head")
                logger.info("Database initialized and stamped successfully.")
            else:
                logger.info("Existing database detected. Running database migrations via Alembic head upgrade...")
                alembic.command.upgrade(alembic_cfg, "head")
                logger.info("Database schema migrations completed successfully.")
        except Exception as e:
            logger.error(f"Failed to auto-upgrade database schema via Alembic: {str(e)}", exc_info=True)
            try:
                logger.warning("Attempting database metadata creation fallback...")
                Base.metadata.create_all(bind=engine)
                logger.info("Fallback database metadata creation completed successfully.")
            except Exception as fallback_err:
                logger.critical(f"Failed to run database metadata creation fallback: {str(fallback_err)}")
    else:
        try:
            logger.info("alembic.ini not found. Creating tables via metadata...")
            Base.metadata.create_all(bind=engine)
            logger.info("Database base tables verified successfully.")
        except Exception as e:
            logger.critical(f"Failed to initialize metadata tables: {str(e)}")

    # --- DEFENSIVE SCHEMA ALIGNMENT CHECK ---
    try:
        from sqlalchemy import inspect, text
        inspector = inspect(engine)
        
        # Check and fix 'subscription_proposals' table
        if "subscription_proposals" in inspector.get_table_names():
            sub_cols = [c['name'] for c in inspector.get_columns('subscription_proposals')]
            if 'is_archived' not in sub_cols:
                logger.info("Defensive Sync: 'is_archived' column missing in 'subscription_proposals' table. Appending column...")
                with engine.begin() as conn:
                    conn.execute(text("ALTER TABLE subscription_proposals ADD COLUMN is_archived BOOLEAN DEFAULT 0"))
                logger.info("Defensive Sync: 'is_archived' successfully appended to 'subscription_proposals'.")

        # Check and fix 'issp_core' table
        if "issp_core" in inspector.get_table_names():
            core_cols = [c['name'] for c in inspector.get_columns('issp_core')]
            if 'is_archived' not in core_cols:
                logger.info("Defensive Sync: 'is_archived' column missing in 'issp_core' table. Appending column...")
                with engine.begin() as conn:
                    conn.execute(text("ALTER TABLE issp_core ADD COLUMN is_archived BOOLEAN DEFAULT 0"))
                logger.info("Defensive Sync: 'is_archived' successfully appended to 'issp_core'.")
    except Exception as schema_err:
        logger.error(f"Failed to execute defensive schema alignment: {str(schema_err)}")
    
    # Route Diagnosis Table
    logger.info("Scanning and mapping active API routing tables...")
    routes_registered = []
    for route in app.routes:
        methods = getattr(route, "methods", None)
        methods_str = f"[{', '.join(methods)}]" if methods else "[STATIC/WS]"
        routes_registered.append(f"  -> {route.path} {methods_str}")
        
    for r in sorted(routes_registered):
        logger.info(r)
        
    logger.info(f"Scan complete: {len(app.routes)} active routes registered.")
    logger.info("=" * 70)
    yield
    logger.info("De-allocating application system engine instances...")


# Initialize the API engine with lifespan
app = FastAPI(
    title="CSPC e-ISSP Compliance Backend Engine",
    description="Domain-separated backend engine supporting DICT standard compliance, budget sub-ceiling allocations, and automated dual-pass PDF rendering.",
    version="4.3",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan
)

# Standard CORSMiddleware configuration (Primary CORS Engine Layer)
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition"]
)


# ==========================================================
# DIAGNOSTICS & REQUEST TRACKING MIDDLEWARE
# ==========================================================

@app.middleware("http")
async def log_requests(request: Request, call_next):
    """
    Tracks and logs every incoming network request, processing duration, and its matching output status code.
    If requests do not appear here, traffic is reaching a ghost process on Port 8000.
    """
    start_time = time.time()
    logger.info(f"Incoming Request: {request.method} {request.url.path}")
    try:
        response = await call_next(request)
        process_time_ms = (time.time() - start_time) * 1000
        logger.info(
            f"Outgoing Response: {request.method} {request.url.path} - "
            f"Status: {response.status_code} - Latency: {process_time_ms:.2f}ms"
        )
        return response
    except Exception as exc:
        # Fix (Anomaly 15): Roll back and close current database session on unhandled exceptions
        from app.database.session import db_session
        try:
            db_session.rollback()
            logger.info("Uncaught exception intercepted. Scoped database session rolled back cleanly.")
        except Exception as db_exc:
            logger.error(f"Failed to roll back database session on request exception: {str(db_exc)}")
        finally:
            db_session.remove()

        process_time_ms = (time.time() - start_time) * 1000
        logger.error(
            f"Request failed: {request.method} {request.url.path} - "
            f"Latency: {process_time_ms:.2f}ms - Unhandled Exception: {str(exc)}",
            exc_info=True
        )
        raise exc


# ==========================================================
# CORS-SAFE EXCEPTION HANDLERS
# ==========================================================

def get_cors_headers(request: Request) -> dict[str, str]:
    """
    Fix (Anomaly 29): Generates necessary CORS headers to prevent browsers from
    blocking API validation error responses.
    """
    headers = {}
    origin = request.headers.get("origin")
    if origin:
        if origin in cors_origins:
            headers["Access-Control-Allow-Origin"] = origin
            headers["Access-Control-Allow-Credentials"] = "true"
        elif "*" in cors_origins:
            headers["Access-Control-Allow-Origin"] = "*"
    return headers


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """
    Handles payload schema validation failures.
    Recursively maps non-serializable fields through jsonable_encoder to prevent backend crashes.
    """
    logger.warning(f"Request schema validation failed: {exc.errors()}")
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        headers=get_cors_headers(request),
        content={"detail": jsonable_encoder(exc.errors())}
    )


@app.exception_handler(DecryptionError)
async def decryption_exception_handler(request: Request, exc: DecryptionError):
    logger.critical(f"Internal cryptographic failure: {str(exc)}")
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        headers=get_cors_headers(request),
        content={"detail": "An internal system cryptographic error occurred during data processing."}
    )


@app.exception_handler(BusinessRuleViolation)
async def business_rule_exception_handler(request: Request, exc: BusinessRuleViolation):
    logger.warning(f"Business constraint failure intercepted: {str(exc)}")
    return JSONResponse(
        status_code=status.HTTP_400_BAD_REQUEST,
        headers=get_cors_headers(request),
        content={"detail": str(exc)}
    )


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        headers=get_cors_headers(request),
        content={"detail": exc.detail}
    )


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    raw_error_message = str(exc)
    sanitized_error = raw_error_message
    for keyword in ["password", "secret", "token", "key", "private", "database_url"]:
        if keyword in sanitized_error.lower():
            sanitized_error = f"[REDACTED_SENSITIVE_DATA_CONTAINING_{keyword.upper()}]"
            break

    logger.error(f"Unhandled Exception: {sanitized_error}", exc_info=exc)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        headers=get_cors_headers(request),
        content={"detail": "An unexpected internal server error occurred. Please contact the system administrator."}
    )


# ==========================================================
# ROUTER INTEGRATION & STATIC FILE SERVING
# ==========================================================

app.include_router(auth_router)
app.include_router(dept_router)
app.include_router(admin_router)

# Mount local upload file system statically using settings.LOCAL_UPLOAD_DIR
if settings.STORAGE_TYPE == "local":
    try:
        os.makedirs(settings.LOCAL_UPLOAD_DIR, exist_ok=True)
        app.mount(
            "/static/uploads", 
            StaticFiles(directory=settings.LOCAL_UPLOAD_DIR), 
            name="static"
        )
        logger.info(f"Successfully mounted local uploads static directory: {settings.LOCAL_UPLOAD_DIR}")
    except Exception as e:
        logger.error(f"Failed to configure or mount local upload directory: {str(e)}")


# ==========================================================
# DIAGNOSTICS & SYSTEM UTILITY ENDPOINTS
# ==========================================================

@app.get("/api/health", tags=["System Diagnostics"])
async def check_engine_health():
    """ Returns consolidated active engine settings and diagnostic configurations. """
    storage_mode = getattr(settings, "STORAGE_TYPE", "local")
    budget_limit = getattr(settings, "GLOBAL_BUDGET_CEILING", 0.0)
    region = getattr(settings, "AWS_S3_REGION_NAME", "LOCAL_EMULATOR") if storage_mode == "s3" else "LOCAL_EMULATOR"
    
    return JSONResponse(
        content={
            "status": "online",
            "storage_mode": storage_mode,
            "region": region,
            "global_budget_limit": f"PHP {budget_limit:,.2f}" if budget_limit else "Not Configured"
        }
    )