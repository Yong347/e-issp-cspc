# alembic/versions/20260916_remove_legacy_sias_columns.py
"""remove_legacy_sias_columns

Revision ID: 20260916_rm_legacy_sias
Revises: 20260915_sync_columns
Create Date: 2026-09-16 00:00:00.000000

"""
import json
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic (<= 32 characters).
revision: str = '20260916_rm_legacy_sias'
down_revision: Union[str, Sequence[str], None] = '20260915_sync_columns'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """
    Normalizes 'master_narratives' schema for DICT ISSP v.2026 compliance:
    1. Ensures 'subsystem_network_layouts_json' column exists.
    2. Migrates any non-null legacy URLs into 'subsystem_network_layouts_json'.
    3. Migrates 'b_3_a_ict_org_url' into 'existing_ict_org_url' if unpopulated.
    4. Drops the 10 legacy institution-specific physical columns.
    """
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    table_names = inspector.get_table_names()

    if 'master_narratives' not in table_names:
        return

    cols = [c['name'] for c in inspector.get_columns('master_narratives')]

    # -------------------------------------------------------------
    # 1. Ensure dynamic JSON store column exists
    # -------------------------------------------------------------
    if 'subsystem_network_layouts_json' not in cols:
        with op.batch_alter_table('master_narratives', schema=None) as batch_op:
            batch_op.add_column(
                sa.Column(
                    'subsystem_network_layouts_json', 
                    sa.JSON(), 
                    server_default=sa.text("'[]'"), 
                    nullable=False
                )
            )
        cols.append('subsystem_network_layouts_json')

    # -------------------------------------------------------------
    # 2. Data Migration: Preserve legacy diagram URLs into JSON
    # -------------------------------------------------------------
    legacy_col_system_map = {
        'net_layout_sias_url': 'Core Frontline Operations IS',
        'net_layout_sias_upgrade_url': 'Public Online Portals & E-Payment Gateways',
        'net_layout_extension_url': 'Regional Extension & Field Branch Linkages',
        'net_layout_library_url': 'Records & Knowledge Repository IS',
        'net_layout_security_url': 'Security Operations & Access Control',
        'net_layout_hris_url': 'Human Resource Information System (HRIS)',
        'net_layout_dms_url': 'Electronic Document Management System (EDMS)',
        'net_layout_supplies_url': 'Property, Supply & Asset Management IS',
        'net_layout_budget_url': 'Financial, Budget & Accounting IS',
    }

    existing_legacy_cols = [col for col in legacy_col_system_map.keys() if col in cols]

    if existing_legacy_cols:
        select_sql = (
            f"SELECT issp_period, subsystem_network_layouts_json, "
            f"{', '.join(existing_legacy_cols)} FROM master_narratives"
        )
        rows = bind.execute(sa.text(select_sql)).fetchall()

        for row in rows:
            issp_period = row[0]
            raw_layouts = row[1]

            if isinstance(raw_layouts, str):
                try:
                    layouts = json.loads(raw_layouts)
                except Exception:
                    layouts = []
            elif isinstance(raw_layouts, list):
                layouts = list(raw_layouts)
            else:
                layouts = []

            existing_names = {
                l.get('system_name', '').lower(): l 
                for l in layouts if isinstance(l, dict)
            }

            modified = False
            for col_idx, col_name in enumerate(existing_legacy_cols, start=2):
                col_val = row[col_idx]
                if col_val and str(col_val).strip():
                    url_clean = str(col_val).strip()
                    sys_name = legacy_col_system_map[col_name]
                    
                    if sys_name.lower() not in existing_names:
                        layouts.append({
                            'system_name': sys_name,
                            'diagram_url': url_clean,
                            'legacy_column': col_name
                        })
                        modified = True
                    elif not existing_names[sys_name.lower()].get('diagram_url'):
                        existing_names[sys_name.lower()]['diagram_url'] = url_clean
                        modified = True

            if modified:
                bind.execute(
                    sa.text(
                        "UPDATE master_narratives "
                        "SET subsystem_network_layouts_json = :layouts "
                        "WHERE issp_period = :period"
                    ),
                    {"layouts": json.dumps(layouts), "period": issp_period}
                )

    # -------------------------------------------------------------
    # 3. Preserve Org Chart if unpopulated in standard column
    # -------------------------------------------------------------
    if 'b_3_a_ict_org_url' in cols and 'existing_ict_org_url' in cols:
        bind.execute(sa.text("""
            UPDATE master_narratives 
            SET existing_ict_org_url = b_3_a_ict_org_url 
            WHERE (existing_ict_org_url IS NULL OR existing_ict_org_url = '') 
              AND b_3_a_ict_org_url IS NOT NULL 
              AND b_3_a_ict_org_url <> ''
        """))

    # -------------------------------------------------------------
    # 4. Drop legacy institution-specific physical columns
    # -------------------------------------------------------------
    all_drop_cols = [
        'net_layout_sias_url',
        'net_layout_sias_upgrade_url',
        'net_layout_extension_url',
        'net_layout_library_url',
        'net_layout_security_url',
        'net_layout_hris_url',
        'net_layout_dms_url',
        'net_layout_supplies_url',
        'net_layout_budget_url',
        'b_3_a_ict_org_url'
    ]

    cols_to_drop = [c for c in all_drop_cols if c in cols]
    if cols_to_drop:
        with op.batch_alter_table('master_narratives', schema=None) as batch_op:
            for col_name in cols_to_drop:
                batch_op.drop_column(col_name)


def downgrade() -> None:
    """
    Downgrade schema: re-adds legacy physical columns and backfills
    from 'subsystem_network_layouts_json' if available.
    """
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    table_names = inspector.get_table_names()

    if 'master_narratives' not in table_names:
        return

    cols = [c['name'] for c in inspector.get_columns('master_narratives')]
    re_add_cols = {
        'net_layout_sias_url': sa.String(length=500),
        'net_layout_sias_upgrade_url': sa.String(length=500),
        'net_layout_extension_url': sa.String(length=500),
        'net_layout_library_url': sa.String(length=500),
        'net_layout_security_url': sa.String(length=500),
        'net_layout_hris_url': sa.String(length=500),
        'net_layout_dms_url': sa.String(length=500),
        'net_layout_supplies_url': sa.String(length=500),
        'net_layout_budget_url': sa.String(length=500),
        'b_3_a_ict_org_url': sa.String(length=500),
    }

    cols_to_add = {name: col_type for name, col_type in re_add_cols.items() if name not in cols}

    if cols_to_add:
        with op.batch_alter_table('master_narratives', schema=None) as batch_op:
            for col_name, col_type in cols_to_add.items():
                batch_op.add_column(sa.Column(col_name, col_type, nullable=True))

    # Reverse populate from subsystem_network_layouts_json
    reverse_system_col_map = {
        'Core Frontline Operations IS': 'net_layout_sias_url',
        'Public Online Portals & E-Payment Gateways': 'net_layout_sias_upgrade_url',
        'Regional Extension & Field Branch Linkages': 'net_layout_extension_url',
        'Records & Knowledge Repository IS': 'net_layout_library_url',
        'Security Operations & Access Control': 'net_layout_security_url',
        'Human Resource Information System (HRIS)': 'net_layout_hris_url',
        'Electronic Document Management System (EDMS)': 'net_layout_dms_url',
        'Property, Supply & Asset Management IS': 'net_layout_supplies_url',
        'Financial, Budget & Accounting IS': 'net_layout_budget_url',
    }

    if 'subsystem_network_layouts_json' in cols:
        rows = bind.execute(sa.text("SELECT issp_period, subsystem_network_layouts_json FROM master_narratives")).fetchall()
        for row in rows:
            issp_period = row[0]
            raw_layouts = row[1]
            if isinstance(raw_layouts, str):
                try:
                    layouts = json.loads(raw_layouts)
                except Exception:
                    layouts = []
            elif isinstance(raw_layouts, list):
                layouts = list(raw_layouts)
            else:
                layouts = []

            for item in layouts:
                if isinstance(item, dict):
                    sys_name = item.get('system_name')
                    url = item.get('diagram_url')
                    target_col = item.get('legacy_column') or reverse_system_col_map.get(sys_name)
                    if target_col and url:
                        bind.execute(
                            sa.text(f"UPDATE master_narratives SET {target_col} = :url WHERE issp_period = :period"),
                            {"url": url, "period": issp_period}
                        )