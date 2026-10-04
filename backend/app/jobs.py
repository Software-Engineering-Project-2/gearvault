"""
GearVault — Background Jobs
Implements hold expiration (FR024) and overdue rental escalation (FR023, BR4).
Designed to be idempotent and safe across concurrent executions via row locking.
"""

from datetime import datetime, timedelta, timezone
from decimal import Decimal
import sys
import click
from flask.cli import with_appcontext
from sqlalchemy import func

from app.extensions import db
from app.models import Booking, Rental, DamageAssessment
from app.services.audit_service import log_financial_action
from app.services.notification_service import notify_hold_expired, send_notification


def utcnow():
    return datetime.now(timezone.utc)


def apply_row_lock(query):
    """Applies SELECT ... FOR UPDATE SKIP LOCKED on PostgreSQL; safe no-op on SQLite."""
    try:
        bind = db.session.get_bind()
        if bind and bind.dialect.name == "postgresql":
            return query.with_for_update(skip_locked=True)
    except Exception:
        pass
    return query


def expire_holds() -> int:
    """
    FR024: Auto-expire unpaid soft holds after 15 minutes and notify customers.
    Idempotent and safe under concurrent job execution.
    Returns the count of expired bookings.
    """
    now = utcnow()
    query = Booking.query.filter(
        func.lower(Booking.status) == "held",
        Booking.hold_expires_at <= now,
    )
    query = apply_row_lock(query)
    expired_bookings = query.all()

    count = 0
    if expired_bookings:
        for b in expired_bookings:
            if (b.status or "").strip().lower() == "held":
                b.status = "Expired"
                notify_hold_expired(b)
                count += 1
        db.session.commit()

    return count


def escalate_overdue_rentals() -> int:
    """
    SRS FR023 & BR4: Automatically flags rentals overdue past 7 days as 'presumed_lost',
    charging full replacement price against deposit and creating audit logs.
    Idempotent and safe under concurrent job execution.
    Returns the count of escalated rentals.
    """
    now = utcnow()
    threshold = now - timedelta(days=7)
    query = Rental.query.filter(
        func.lower(Rental.status) == "active",
        Rental.due_at <= threshold,
    )
    query = apply_row_lock(query)
    overdue_rentals = query.all()

    count = 0
    try:
        for rental in overdue_rentals:
            if (rental.status or "").strip().lower() != "active":
                continue

            rental.status = "presumed_lost"
            replacement_val = (
                float(rental.item.replacement_price)
                if rental.item and rental.item.replacement_price
                else 0.0
            )
            deposit_val = float(rental.deposit_held) if rental.deposit_held else 0.0
            refund = max(0.0, deposit_val - replacement_val)

            assessment = DamageAssessment.query.filter_by(rental_id=rental.id).first()
            if not assessment:
                assessment = DamageAssessment(
                    rental_id=rental.id,
                    assessed_by=None,
                    notes="Automated escalation: rental exceeded 7 days past due date (Presumed Lost, FR023).",
                    replacement_charge=Decimal(str(replacement_val)),
                    total_deduction=Decimal(str(replacement_val)),
                    deposit_refunded=Decimal(str(refund)),
                    status="finalized",
                )
                db.session.add(assessment)
            else:
                assessment.replacement_charge = Decimal(str(replacement_val))
                assessment.total_deduction = Decimal(str(replacement_val))
                assessment.deposit_refunded = Decimal(str(refund))
                assessment.status = "finalized"

            item_name = rental.item.name if rental.item else "Equipment"
            send_notification(
                user_id=rental.customer_id,
                notif_type="presumed_lost",
                title=f"Equipment Presumed Lost — {item_name}",
                message=(
                    f"Your rental for {item_name} is more than 7 days overdue and has been escalated to Presumed Lost. "
                    f"A full replacement charge of ₹{replacement_val:,.2f} has been deducted from your security deposit."
                ),
            )

            log_financial_action(
                action="presumed_lost_charge",
                amount=replacement_val,
                user_id=rental.customer_id,
                metadata={
                    "rental_id": rental.id,
                    "item_name": item_name,
                    "days_overdue": 7,
                },
            )
            count += 1

        if overdue_rentals:
            db.session.commit()
    except Exception as e:
        db.session.rollback()
        raise e

    return count


@click.group("jobs")
def jobs_cli():
    """Manage and trigger background tasks."""
    pass


@jobs_cli.command("run")
@with_appcontext
def run_jobs_command():
    """Runs expire_holds and escalate_overdue_rentals once and exits non-zero on error."""
    try:
        click.echo("Running hold expiration job...")
        expired_count = expire_holds()
        click.echo(f"Expired {expired_count} soft holds.")

        click.echo("Running overdue rentals escalation job...")
        escalated_count = escalate_overdue_rentals()
        click.echo(f"Escalated {escalated_count} rentals to presumed_lost.")

        click.echo("Background jobs completed successfully.")
    except Exception as err:
        click.echo(f"Error executing background jobs: {err}", err=True)
        sys.exit(1)
