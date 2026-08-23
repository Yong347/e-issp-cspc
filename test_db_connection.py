# test_db_connection.py
import os
import sys
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

# Add current directory to path
sys.path.append(os.path.abspath(os.path.dirname(__file__)))

print("=" * 60)
print("STARTING E-ISSP DATABASE DIAGNOSTICS")
print("=" * 60)

# 1. Load Configurations
try:
    from app.config import settings
    print(f"[1] CONFIG: DATABASE_URL is configured as:\n    -> {settings.DATABASE_URL}")
except Exception as e:
    print(f"\n[!] CONFIG ERROR: Failed to load configuration settings: {e}")
    sys.exit(1)

# 2. Test Connection
try:
    engine = create_engine(settings.DATABASE_URL)
    with engine.connect() as conn:
        result = conn.execute(text("SELECT 1"))
        print(f"[2] CONNECTION: SELECT 1 succeeded (Returned: {result.scalar()})")
except Exception as e:
    print("\n[!] CONNECTION ERROR: Could not connect to the database server.")
    import traceback
    traceback.print_exc()
    sys.exit(1)

# 3. Check Database Tables
try:
    from sqlalchemy import inspect
    inspector = inspect(engine)
    tables = inspector.get_table_names()
    print(f"[3] SCHEMA: Existing tables found in database:\n    -> {tables}")
    
    mandatory_tables = ["master_narratives", "users", "issp_nodes", "budget_ceilings"]
    missing = [t for t in mandatory_tables if t not in tables]
    if missing:
        print(f"    [!] WARNING: Missing mandatory tables: {missing}")
    else:
        print("    [✓] All core tables exist in the schema.")
except Exception as e:
    print("\n[!] SCHEMA ERROR: Failed to inspect database tables.")
    import traceback
    traceback.print_exc()
    sys.exit(1)

# 4. Attempt MasterNarrative Query
try:
    from app.database.models import MasterNarrative
    SessionLocal = sessionmaker(bind=engine)
    db = SessionLocal()
    
    print("[4] QUERY: Executing active cycle query on 'master_narratives'...")
    active_cycle = db.query(MasterNarrative).filter(MasterNarrative.is_active == True).first()
    if active_cycle:
        print(f"    [✓] Query Succeeded. Active cycle period found: '{active_cycle.issp_period}'")
    else:
        print("    [!] Query Succeeded, but no active cycle is flagged in the table.")
except Exception as e:
    print("\n[!] QUERY ERROR: Execution failed when reading 'master_narratives' table.")
    import traceback
    traceback.print_exc()
    sys.exit(1)

print("\n" + "=" * 60)
print("DIAGNOSTICS COMPLETED SUCCESSFULLY")
print("=" * 60)