# alembic/env.py
import os
import sys
from logging.config import fileConfig

from sqlalchemy import engine_from_config, pool, text
from alembic import context
from dotenv import load_dotenv

# Load environment configurations prior to importing application modules
load_dotenv()

# Add the project root directory to the system path to resolve app modules
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

# Import target application models and global configurations
from app.database.models import Base
from app.config import settings

# This is the Alembic Config object, which provides access to alembic.ini options
config = context.config

# Interpret the config file for Python logging
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Add the application metadata for autogenerate detection
target_metadata = Base.metadata


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode.

    This configures the context with just a URL
    and not an Engine, though an Engine is acceptable
    here as well. By skipping the Engine creation
    we don't even need a DBAPI to be available.
    """
    # Overwrite static URL with active configuration to prevent environment mismatch
    url = settings.DATABASE_URL
    
    # Reliably detect SQLite in offline mode via URL parsing
    is_sqlite = "sqlite" in url.lower()
    
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        # Conditionally render as batch to prevent table recreation issues on PostgreSQL
        render_as_batch=is_sqlite,
        compare_type=True
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode.

    In this scenario we need to create an Engine
    and associate a connection with the context.
    """
    url = settings.DATABASE_URL
    # Set the url dynamically inside the configuration block (prevents credential exposure)
    config.set_main_option("sqlalchemy.url", url)

    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        # Reliably detect SQLite via the dialect name rather than URL substrings
        is_sqlite = connection.dialect.name == "sqlite"
        
        # Enforce foreign keys during migrations if SQLite is active
        if is_sqlite:
            connection.execute(text("PRAGMA foreign_keys=ON"))

        context.configure(
            connection=connection, 
            target_metadata=target_metadata,
            # Conditionally render as batch to prevent table recreation issues on PostgreSQL
            render_as_batch=is_sqlite,
            # Ensure Alembic detects column type alterations (e.g. String to Text)
            compare_type=True
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()