# app/database/session.py
import logging
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker, scoped_session
from sqlalchemy.engine import Engine
from app.config import settings

logger = logging.getLogger("app.database.session")

# Safely parse the database URL from settings with fallback
raw_db_url = getattr(settings, "DATABASE_URL", None) or "postgresql+psycopg2://postgres:postgres@localhost:5432/issp_core"
db_url = raw_db_url.strip() if isinstance(raw_db_url, str) else "postgresql+psycopg2://postgres:postgres@localhost:5432/issp_core"

# Auto-normalize Postgres driver to avoid "No module named 'psycopg'" dialect mismatches
if db_url.startswith("postgres://"):
    db_url = db_url.replace("postgres://", "postgresql+psycopg2://", 1)
elif db_url.startswith("postgresql://") and not db_url.startswith("postgresql+"):
    db_url = db_url.replace("postgresql://", "postgresql+psycopg2://", 1)

connect_args = {}
pool_args = {
    "pool_pre_ping": True,
}

if "sqlite" in db_url.lower():
    # Allow multi-threaded connection handling on local SQLite instances safely
    connect_args["check_same_thread"] = False
else:
    # Production connection pool parameters for PostgreSQL
    pool_args["pool_size"] = int(getattr(settings, "DB_POOL_SIZE", 10))
    pool_args["max_overflow"] = int(getattr(settings, "DB_MAX_OVERFLOW", 20))
    pool_args["pool_recycle"] = 1800  # Recycle connections after 30 minutes to prevent stale sockets
    pool_args["pool_timeout"] = 30    # Maximum seconds to wait before timing out on pool exhaustion

    # Set explicit connection timeout for psycopg2 to prevent worker lockups on network lag/cold boot
    connect_args["connect_timeout"] = int(getattr(settings, "DB_CONNECT_TIMEOUT", 10))

    # Azure PostgreSQL Flexible Server SSL enforcement:
    # Azure strictly mandates SSL. If connecting to an Azure host and sslmode is not present, enforce it.
    is_azure_pg = "postgres.database.azure.com" in db_url.lower()
    has_sslmode_in_url = "sslmode=" in db_url.lower()

    if is_azure_pg and not has_sslmode_in_url:
        connect_args["sslmode"] = "require"
        logger.info("Enforced connect_args['sslmode'] = 'require' for Azure PostgreSQL Flexible Server.")

# Establish engine connection with real-time ping validations
engine = create_engine(
    db_url,
    connect_args=connect_args,
    **pool_args
)

# Register global hook listener on Engine to enforce SQLite cascade foreign keys
@event.listens_for(Engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
    """
    Enforces foreign key constraint checks and cascade parameters 
    specifically on SQLite database engine connections.
    """
    if "sqlite" in db_url.lower():
        cursor = dbapi_connection.cursor()
        try:
            cursor.execute("PRAGMA foreign_keys=ON")
        except Exception as e:
            logger.warning(f"Failed to set PRAGMA foreign_keys=ON on SQLite connection: {str(e)}")
        finally:
            cursor.close()

# Configure thread-safe, non-autocommit session creator
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# db_session is maintained as a scoped session proxy to prevent import errors in other modules
db_session = scoped_session(SessionLocal)


def get_db():
    """
    Generator yielding thread-safe request-scoped database session contexts.
    Ensures safe rollback on unhandled exceptions and closes connections cleanly.
    """
    db = SessionLocal()
    try:
        yield db
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()