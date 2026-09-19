"""add financial_audit_log

Revision ID: 0824435def03
Revises: 59c7850d89cd
Create Date: 2026-09-19 12:48:11.911674

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '0824435def03'
down_revision = '59c7850d89cd'
branch_labels = None
depends_on = None


def upgrade():
    # Only create if table doesn't already exist
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    if 'financial_audit_log' not in inspector.get_table_names():
        op.create_table(
            'financial_audit_log',
            sa.Column('id', sa.Integer(), primary_key=True),
            sa.Column('user_id', sa.String(length=36), nullable=True, index=True),
            sa.Column('action', sa.Text(), nullable=False),
            sa.Column('amount', sa.Numeric(precision=12, scale=2), nullable=True),
            sa.Column('metadata', sa.JSON(), nullable=True),
            sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        )


def downgrade():
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    if 'financial_audit_log' in inspector.get_table_names():
        op.drop_table('financial_audit_log')
