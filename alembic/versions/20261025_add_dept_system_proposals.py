# alembic/versions/20261025_add_dept_system_proposals.py
"""add_dept_system_proposals

Revision ID: 20261025_dept_sys_proposals
Revises: 20261020_purge_sigs_diagrams
Create Date: 2026-10-25 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic (<= 32 characters).
revision: str = '20261025_dept_sys_proposals'
down_revision: Union[str, Sequence[str], None] = '20261020_purge_sigs_diagrams'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """
    Upgrades database schema to support Department User Information System proposals (Part III.D):
    1. Adds 'department_id' foreign key to 'information_systems' (links proposed system to department).
    2. Adds 'needs_assessment_id' foreign key to 'information_systems' (provenance link to Section 8.0).
    3. Adds 'submission_status' ('Draft', 'Submitted', 'Approved', 'Returned') with default 'Approved'.
    4. Adds 'rejection_reason' text field for administrative return feedback.
    5. Backfills existing legacy/admin systems as 'Approved'.
    6. Automatically links existing systems to departments where 'system_owner_office' matches department name.
    """
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    table_names = inspector.get_table_names()

    if 'information_systems' not in table_names:
        return

    cols = [c['name'] for c in inspector.get_columns('information_systems')]
    indexes = [ix['name'] for ix in inspector.get_indexes('information_systems')]

    with op.batch_alter_table('information_systems', schema=None) as batch_op:
        # 1. Department ID linkage
        if 'department_id' not in cols:
            batch_op.add_column(sa.Column('department_id', sa.Integer(), nullable=True))
            if 'ix_information_systems_department_id' not in indexes:
                batch_op.create_index(
                    batch_op.f('ix_information_systems_department_id'),
                    ['department_id'],
                    unique=False
                )
            batch_op.create_foreign_key(
                'fk_info_sys_department_id',
                'departments',
                ['department_id'],
                ['id'],
                ondelete='SET NULL'
            )

        # 2. Section 8.0 Needs Assessment provenance linkage
        if 'needs_assessment_id' not in cols:
            batch_op.add_column(sa.Column('needs_assessment_id', sa.CHAR(length=36), nullable=True))
            if 'ix_information_systems_needs_assessment_id' not in indexes:
                batch_op.create_index(
                    batch_op.f('ix_information_systems_needs_assessment_id'),
                    ['needs_assessment_id'],
                    unique=False
                )
            batch_op.create_foreign_key(
                'fk_info_sys_needs_assessment_id',
                'needs_assessments',
                ['needs_assessment_id'],
                ['id'],
                ondelete='SET NULL'
            )

        # 3. Department review lifecycle workflow status
        if 'submission_status' not in cols:
            batch_op.add_column(
                sa.Column(
                    'submission_status',
                    sa.String(length=50),
                    server_default=sa.text("'Approved'"),
                    nullable=False
                )
            )
            if 'ix_information_systems_submission_status' not in indexes:
                batch_op.create_index(
                    batch_op.f('ix_information_systems_submission_status'),
                    ['submission_status'],
                    unique=False
                )

        # 4. Action feedback for returned proposals
        if 'rejection_reason' not in cols:
            batch_op.add_column(sa.Column('rejection_reason', sa.Text(), nullable=True))

    # Data Synchronization & Backfill
    op.execute(
        sa.text(
            "UPDATE information_systems "
            "SET submission_status = 'Approved' "
            "WHERE submission_status IS NULL OR submission_status = ''"
        )
    )

    if 'departments' in table_names:
        op.execute(
            sa.text("""
                UPDATE information_systems
                SET department_id = (
                    SELECT id FROM departments
                    WHERE LOWER(TRIM(departments.name)) = LOWER(TRIM(information_systems.system_owner_office))
                    LIMIT 1
                )
                WHERE department_id IS NULL 
                  AND system_owner_office IS NOT NULL 
                  AND system_owner_office <> '';
            """)
        )


def downgrade() -> None:
    """Downgrade schema cleanly back to 20261020_purge_sigs_diagrams."""
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    table_names = inspector.get_table_names()

    if 'information_systems' not in table_names:
        return

    cols = [c['name'] for c in inspector.get_columns('information_systems')]
    indexes = [ix['name'] for ix in inspector.get_indexes('information_systems')]

    with op.batch_alter_table('information_systems', schema=None) as batch_op:
        if 'rejection_reason' in cols:
            batch_op.drop_column('rejection_reason')

        if 'submission_status' in cols:
            if 'ix_information_systems_submission_status' in indexes:
                batch_op.drop_index(batch_op.f('ix_information_systems_submission_status'))
            batch_op.drop_column('submission_status')

        if 'needs_assessment_id' in cols:
            try:
                batch_op.drop_constraint('fk_info_sys_needs_assessment_id', type_='foreignkey')
            except Exception:
                pass
            if 'ix_information_systems_needs_assessment_id' in indexes:
                batch_op.drop_index(batch_op.f('ix_information_systems_needs_assessment_id'))
            batch_op.drop_column('needs_assessment_id')

        if 'department_id' in cols:
            try:
                batch_op.drop_constraint('fk_info_sys_department_id', type_='foreignkey')
            except Exception:
                pass
            if 'ix_information_systems_department_id' in indexes:
                batch_op.drop_index(batch_op.f('ix_information_systems_department_id'))
            batch_op.drop_column('department_id')