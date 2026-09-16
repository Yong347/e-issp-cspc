# app/database/session.py
import logging
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker, scoped_session
from sqlalchemy.engine import Engine
from app.config import settings

logger = logging.getLogger("app.database.session")

# Parse the database URL to configure dialect-specific parameters
db_url = settings.DATABASE_URL
connect_args = {}
pool_args = {
    "pool_pre_ping": True,
}

if "sqlite" in db_url.lower():
    # Allow multi-threaded connection handling on local SQLite instances safely
    connect_args["check_same_thread"] = False
else:
    # Ensure production-grade connection pooling configurations on PostgreSQL
    pool_args["pool_size"] = 10
    pool_args["max_overflow"] = 20
    pool_args["pool_recycle"] = 1800  # Recycle connections after 30 minutes to avoid stale sockets

# Establish engine connection with real-time ping validations
engine = create_engine(
    db_url,
    connect_args=connect_args,
    **pool_args
)

# Fix (Anomaly 7): Register global hook listener on Engine to enforce SQLite cascade deletions
@event.listens_for(Engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
    """
    Enforces foreign key constraint checks and cascade parameters 
    specifically on SQLite database engine connections.
    """
    # Fix: Safely verify the connection dialect is SQLite using the connection string
    if "sqlite" in settings.DATABASE_URL.lower():
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
    """
    db = SessionLocal()
    try:
        yield db
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()