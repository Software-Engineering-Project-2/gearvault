"""add role_id to users

Revision ID: 4477ce3f48a7
Revises: 
Create Date: 2026-09-17 21:10:30.403780

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '4477ce3f48a7'
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.add_column(sa.Column('role_id', sa.Integer(), nullable=True))
        batch_op.create_foreign_key('fk_users_role_id_roles', 'roles', ['role_id'], ['id'])

    # Migrate any existing records if present
    op.execute(
        "UPDATE users SET role_id = CASE "
        "WHEN LOWER(role) = 'staff' THEN 2 "
        "WHEN LOWER(role) = 'manager' THEN 3 "
        "ELSE 1 END WHERE role_id IS NULL"
    )

    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.alter_column('role_id', nullable=False, server_default='1')
        batch_op.drop_column('role')


def downgrade():
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.add_column(sa.Column('role', sa.String(length=50), nullable=True))

    op.execute(
        "UPDATE users SET role = CASE "
        "WHEN role_id = 2 THEN 'staff' "
        "WHEN role_id = 3 THEN 'manager' "
        "ELSE 'customer' END WHERE role IS NULL"
    )

    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.alter_column('role', nullable=False, server_default='customer')
        batch_op.drop_constraint('fk_users_role_id_roles', type_='foreignkey')
        batch_op.drop_column('role_id')

