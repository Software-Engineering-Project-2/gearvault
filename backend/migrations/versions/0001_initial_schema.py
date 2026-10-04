"""initial_schema

Revision ID: 0001_initial_schema
Revises: 
Create Date: 2026-10-04 19:55:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '0001_initial_schema'
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    # 1. roles
    op.create_table(
        'roles',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=50), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('name')
    )

    # 2. users
    op.create_table(
        'users',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('email', sa.String(length=255), nullable=False),
        sa.Column('password_hash', sa.String(length=255), nullable=False),
        sa.Column('full_name', sa.String(length=255), nullable=True),
        sa.Column('phone', sa.String(length=50), nullable=True),
        sa.Column('role_id', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['role_id'], ['roles.id']),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_users_email'), 'users', ['email'], unique=True)

    # 3. item_categories
    op.create_table(
        'item_categories',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=100), nullable=False),
        sa.Column('description', sa.String(length=255), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('name')
    )

    # 4. items
    op.create_table(
        'items',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('sku', sa.Text(), nullable=True),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('image_path', sa.Text(), nullable=True),
        sa.Column('purchase_price', sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column('purchase_date', sa.Date(), nullable=True),
        sa.Column('replacement_price', sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column('category_id', sa.Integer(), nullable=True),
        sa.Column('active', sa.Boolean(), nullable=True, server_default=sa.text('true')),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['category_id'], ['item_categories.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('sku')
    )
    op.create_index(op.f('ix_items_name'), 'items', ['name'], unique=False)
    op.create_index(op.f('ix_items_category_id'), 'items', ['category_id'], unique=False)

    # 5. bookings
    op.create_table(
        'bookings',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('customer_id', sa.String(length=36), nullable=False),
        sa.Column('item_id', sa.Integer(), nullable=False),
        sa.Column('start_ts', sa.DateTime(timezone=True), nullable=False),
        sa.Column('end_ts', sa.DateTime(timezone=True), nullable=False),
        sa.Column('status', sa.String(length=20), nullable=False, server_default='Held'),
        sa.Column('hold_expires_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('deposit_amount', sa.Numeric(precision=10, scale=2), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['customer_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['item_id'], ['items.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_bookings_customer_id'), 'bookings', ['customer_id'], unique=False)
    op.create_index(op.f('ix_bookings_item_id'), 'bookings', ['item_id'], unique=False)
    op.create_index(op.f('ix_bookings_start_ts'), 'bookings', ['start_ts'], unique=False)
    op.create_index(op.f('ix_bookings_end_ts'), 'bookings', ['end_ts'], unique=False)
    op.create_index(op.f('ix_bookings_status'), 'bookings', ['status'], unique=False)
    op.create_index('bookings_item_period_idx', 'bookings', ['item_id', 'start_ts', 'end_ts'], unique=False)

    # 6. rentals
    op.create_table(
        'rentals',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('booking_id', sa.Integer(), nullable=True),
        sa.Column('item_id', sa.Integer(), nullable=True),
        sa.Column('customer_id', sa.String(length=36), nullable=True),
        sa.Column('checkout_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('due_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('returned_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('status', sa.Text(), nullable=False, server_default='active'),
        sa.Column('total_price', sa.Numeric(precision=12, scale=2), nullable=True),
        sa.Column('deposit_held', sa.Numeric(precision=12, scale=2), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['booking_id'], ['bookings.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['customer_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['item_id'], ['items.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_rentals_item_id'), 'rentals', ['item_id'], unique=False)
    op.create_index('rentals_item_due_idx', 'rentals', ['item_id', 'due_at'], unique=False)

    # 7. item_condition_log
    op.create_table(
        'item_condition_log',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('item_id', sa.Integer(), nullable=False),
        sa.Column('rental_id', sa.Integer(), nullable=True),
        sa.Column('captured_by', sa.String(length=36), nullable=True),
        sa.Column('photo_url', sa.Text(), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('captured_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['captured_by'], ['users.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['item_id'], ['items.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['rental_id'], ['rentals.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_item_condition_log_item_id'), 'item_condition_log', ['item_id'], unique=False)
    op.create_index(op.f('ix_item_condition_log_rental_id'), 'item_condition_log', ['rental_id'], unique=False)

    # 8. damage_types
    op.create_table(
        'damage_types',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=100), nullable=False),
        sa.Column('weight', sa.Numeric(precision=4, scale=2), nullable=False, server_default='1.0'),
        sa.Column('description', sa.String(length=255), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('name')
    )

    # 9. damage_assessments
    op.create_table(
        'damage_assessments',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('rental_id', sa.Integer(), nullable=False),
        sa.Column('assessed_by', sa.String(length=36), nullable=True),
        sa.Column('damage_type_id', sa.Integer(), nullable=True),
        sa.Column('severity', sa.Integer(), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('damage_deduction', sa.Numeric(precision=12, scale=2), nullable=False, server_default='0.0'),
        sa.Column('late_penalty', sa.Numeric(precision=12, scale=2), nullable=False, server_default='0.0'),
        sa.Column('replacement_charge', sa.Numeric(precision=12, scale=2), nullable=False, server_default='0.0'),
        sa.Column('total_deduction', sa.Numeric(precision=12, scale=2), nullable=False, server_default='0.0'),
        sa.Column('deposit_refunded', sa.Numeric(precision=12, scale=2), nullable=False, server_default='0.0'),
        sa.Column('status', sa.String(length=50), nullable=False, server_default='assessed'),
        sa.Column('dispute_reason', sa.Text(), nullable=True),
        sa.Column('disputed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('manager_override_amount', sa.Numeric(precision=12, scale=2), nullable=True),
        sa.Column('manager_notes', sa.Text(), nullable=True),
        sa.Column('resolved_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint('severity >= 1 AND severity <= 5', name='ck_damage_assessment_severity'),
        sa.ForeignKeyConstraint(['assessed_by'], ['users.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['damage_type_id'], ['damage_types.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['rental_id'], ['rentals.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('rental_id')
    )
    op.create_index(op.f('ix_damage_assessments_rental_id'), 'damage_assessments', ['rental_id'], unique=True)
    op.create_index(op.f('ix_damage_assessments_damage_type_id'), 'damage_assessments', ['damage_type_id'], unique=False)

    # 10. payments
    op.create_table(
        'payments',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.String(length=36), nullable=False),
        sa.Column('rental_id', sa.Integer(), nullable=True),
        sa.Column('amount', sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column('payment_type', sa.String(length=50), nullable=False, server_default='deposit'),
        sa.Column('provider', sa.String(length=50), nullable=True, server_default='simulated'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['rental_id'], ['rentals.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_payments_user_id'), 'payments', ['user_id'], unique=False)
    op.create_index(op.f('ix_payments_rental_id'), 'payments', ['rental_id'], unique=False)

    # 11. notifications
    op.create_table(
        'notifications',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.String(length=36), nullable=False),
        sa.Column('type', sa.String(length=50), nullable=False),
        sa.Column('title', sa.String(length=255), nullable=False),
        sa.Column('message', sa.Text(), nullable=False),
        sa.Column('payload', sa.JSON(), nullable=True),
        sa.Column('read', sa.Boolean(), nullable=False, server_default=sa.text('false')),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_notifications_user_id'), 'notifications', ['user_id'], unique=False)

    # 12. financial_audit_log
    op.create_table(
        'financial_audit_log',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.String(length=36), nullable=True),
        sa.Column('action', sa.Text(), nullable=False),
        sa.Column('amount', sa.Numeric(precision=12, scale=2), nullable=True),
        sa.Column('metadata', sa.JSON(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_financial_audit_log_user_id'), 'financial_audit_log', ['user_id'], unique=False)


def downgrade():
    op.drop_table('financial_audit_log')
    op.drop_table('notifications')
    op.drop_table('payments')
    op.drop_table('damage_assessments')
    op.drop_table('damage_types')
    op.drop_table('item_condition_log')
    op.drop_table('rentals')
    op.drop_table('bookings')
    op.drop_table('items')
    op.drop_table('item_categories')
    op.drop_table('users')
    op.drop_table('roles')
