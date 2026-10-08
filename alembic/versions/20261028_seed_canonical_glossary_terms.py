# alembic/versions/20261028_seed_canonical_glossary_terms.py
"""seed_canonical_glossary_terms

Revision ID: 20261028_seed_glossary
Revises: 99cab26d1039
Create Date: 2026-10-28 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic (<= 32 characters).
revision: str = '20261028_seed_glossary'
# Down revision: chained to the active migration head '99cab26d1039'.
down_revision: Union[str, Sequence[str], None] = '99cab26d1039'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """
    Permanently seeds canonical statutory DICT definitions into the `glossary_terms`
    table across PostgreSQL and SQLite databases:
    1. Defensively creates `glossary_terms` if it does not yet exist.
    2. Deduplicates any existing glossary records case-insensitively.
    3. Idempotently inserts or updates the 12 canonical statutory definitions
       (DICT, MITHI, ISSP, PeGIF, GovNet, GovCloud, PNPKI, DPA, UACS, CO, MOOE, DRBCP)
       so that both PDF and DOCX export generators compile complete preliminary tables.
    """
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = inspector.get_table_names()
    is_sqlite = bind.dialect.name == "sqlite"

    # ==========================================================
    # 1. DEFENSIVELY ENSURE TABLE EXISTS
    # ==========================================================
    if 'glossary_terms' not in tables:
        op.create_table(
            'glossary_terms',
            sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column('term', sa.String(length=100), nullable=False),
            sa.Column('definition', sa.Text(), nullable=False),
            sa.Column('order_index', sa.Integer(), server_default='0', nullable=False),
            sa.PrimaryKeyConstraint('id', name='pk_glossary_terms'),
            sa.UniqueConstraint('term', name='uq_glossary_terms_term')
        )
        op.create_index('ix_glossary_terms_term', 'glossary_terms', ['term'], unique=True)

    # ==========================================================
    # 2. DEDUPLICATE EXISTING TERMS (PREVENT DUPLICATE ROWS)
    # ==========================================================
    if not is_sqlite:
        bind.execute(sa.text("""
            DELETE FROM glossary_terms a USING glossary_terms b
            WHERE a.id > b.id
              AND LOWER(TRIM(a.term)) = LOWER(TRIM(b.term));
        """))
    else:
        bind.execute(sa.text("""
            DELETE FROM glossary_terms
            WHERE id NOT IN (
                SELECT MIN(id)
                FROM glossary_terms
                GROUP BY LOWER(TRIM(term))
            );
        """))

    # ==========================================================
    # 3. CANONICAL DICT v.2026 STATUTORY DEFINITIONS
    # ==========================================================
    canonical_terms = [
        (
            1,
            "DICT",
            "Department of Information and Communications Technology – The executive department of the Philippine government responsible for the planning, development, and promotion of the national ICT agenda in support of national development."
        ),
        (
            2,
            "MITHI",
            "Medium-Term Information and Technology Harmonization Initiative – An inter-agency initiative (DBM, DICT, NEDA) aimed at harmonizing government ICT investments to optimize public resources and eliminate redundancies."
        ),
        (
            3,
            "ISSP",
            "Information Systems Strategic Plan – A statutory three-year strategic blueprint that outlines an agency's overall ICT strategy, operational information systems, infrastructure roadmaps, and budgetary requirements."
        ),
        (
            4,
            "PeGIF",
            "Philippine e-Government Interoperability Framework – Technical, organizational, and semantic specifications designed to enable seamless data exchange, unified digital identity, and API interconnectivity among government agencies."
        ),
        (
            5,
            "GovNet",
            "Government Network – High-speed fiber-optic network infrastructure deployed by DICT to interconnect national government agencies, state universities, and field offices for secure digital communications."
        ),
        (
            6,
            "GovCloud",
            "Government Cloud – Secure, multi-tenant cloud hosting infrastructure managed by DICT, providing scalable virtual compute, containerized clusters, and offsite disaster recovery storage for public sector services."
        ),
        (
            7,
            "PNPKI",
            "Philippine National Public Key Infrastructure – The national cryptographic certification authority operated by DICT that issues digital certificates ensuring confidentiality, integrity, authenticity, and non-repudiation in electronic transactions."
        ),
        (
            8,
            "DPA",
            "Data Privacy Act of 2012 (Republic Act No. 10173) – Comprehensive statutory law mandating the protection and security of personal and sensitive personal information processed by government agencies and private entities."
        ),
        (
            9,
            "UACS",
            "Unified Accounts Code Structure – Standardized government-wide coding framework jointly developed by DBM, COA, and DOF to harmonize budget classification, expenditure monitoring, and accounting across the bureaucracy."
        ),
        (
            10,
            "CO",
            "Capital Outlay – Budgetary appropriation classification for expenditures intended for the acquisition of physical assets, IT infrastructure, perpetual software licenses, and systems whose utility extends beyond one fiscal year."
        ),
        (
            11,
            "MOOE",
            "Maintenance and Other Operating Expenses – Budgetary classification covering recurrent operational expenditures necessary for day-to-day government operations, including software-as-a-service subscriptions, utilities, and maintenance contracts."
        ),
        (
            12,
            "DRBCP",
            "Disaster Recovery and Business Continuity Plan – Mandatory institutional protocol establishing emergency procedures, technical failovers, Recovery Time Objectives (RTO), and Recovery Point Objectives (RPO) to safeguard government data and services."
        )
    ]

    # ==========================================================
    # 4. IDEMPOTENT INSERT / BACKFILL SEEDING
    # ==========================================================
    for order_idx, term_name, definition_text in canonical_terms:
        existing = bind.execute(
            sa.text("SELECT id, definition, order_index FROM glossary_terms WHERE LOWER(TRIM(term)) = LOWER(:term) LIMIT 1"),
            {"term": term_name.strip()}
        ).fetchone()

        if existing is None:
            bind.execute(
                sa.text("""
                    INSERT INTO glossary_terms (term, definition, order_index)
                    VALUES (:term, :definition, :order_index)
                """),
                {
                    "term": term_name,
                    "definition": definition_text,
                    "order_index": order_idx
                }
            )
        else:
            existing_id = existing[0]
            existing_def = (existing[1] or "").strip()
            existing_order = existing[2]

            # Backfill if definition is empty or a dummy placeholder
            if not existing_def or existing_def.lower() in ("test", "dummy", "none", "null") or len(existing_def) < 10:
                bind.execute(
                    sa.text("""
                        UPDATE glossary_terms
                        SET definition = :definition, order_index = :order_index
                        WHERE id = :id
                    """),
                    {
                        "definition": definition_text,
                        "order_index": order_idx,
                        "id": existing_id
                    }
                )
            elif existing_order is None or existing_order == 0:
                bind.execute(
                    sa.text("""
                        UPDATE glossary_terms
                        SET order_index = :order_index
                        WHERE id = :id
                    """),
                    {
                        "order_index": order_idx,
                        "id": existing_id
                    }
                )


def downgrade() -> None:
    """
    Downgrade schema: rolls back seeded canonical statutory DICT definitions.
    """
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = inspector.get_table_names()

    if 'glossary_terms' in tables:
        bind.execute(
            sa.text("""
                DELETE FROM glossary_terms
                WHERE UPPER(TRIM(term)) IN (
                    'DICT', 'MITHI', 'ISSP', 'PeGIF', 'GovNet', 'GovCloud',
                    'PNPKI', 'DPA', 'UACS', 'CO', 'MOOE', 'DRBCP'
                );
            """)
        )