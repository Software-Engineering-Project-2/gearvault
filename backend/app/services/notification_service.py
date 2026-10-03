"""
GearVault — In-App Notification Service
Implements SRS FR024, FR025, FR026.
"""

from typing import Optional
from app.extensions import db
from app.models import Notification


def send_notification(
    user_id: str,
    notif_type: str,
    title: str,
    message: str,
) -> Optional[Notification]:
    """Creates an in-app notification record for the target user."""
    if not user_id or not title:
        return None
    notif = Notification(
        user_id=str(user_id),
        type=notif_type,
        title=title,
        message=message,
        read=False,
    )
    db.session.add(notif)
    return notif


def notify_hold_expired(booking) -> Optional[Notification]:
    """FR024: The system shall notify a customer when their soft hold expires."""
    item_name = booking.item.name if booking.item else "Reserved Gear"
    return send_notification(
        user_id=booking.customer_id,
        notif_type="hold_expired",
        title=f"Reservation Expired — {item_name}",
        message=f"Your 15-minute soft reservation hold on {item_name} has expired and the equipment slot has been released.",
    )


def notify_booking_confirmed(booking) -> Optional[Notification]:
    """FR025: The system shall notify a customer upon booking confirmation."""
    item_name = booking.item.name if booking.item else "Gear"
    dep_str = f"₹{float(booking.deposit_amount):,.2f}" if booking.deposit_amount else "deposit"
    return send_notification(
        user_id=booking.customer_id,
        notif_type="booking_confirmed",
        title=f"Booking Confirmed — {item_name}",
        message=f"Your security deposit of {dep_str} was received! Your gear reservation is confirmed and ready for counter collection.",
    )


def notify_dispatch_and_due_date(rental) -> Optional[Notification]:
    """FR025: The system shall notify a customer upon upcoming return due date."""
    item_name = rental.item.name if rental.item else "Equipment"
    due_str = rental.due_at.strftime("%b %d, %Y %I:%M %p") if rental.due_at else "scheduled time"
    return send_notification(
        user_id=rental.customer_id,
        notif_type="return_due",
        title=f"Gear Dispatched — {item_name}",
        message=f"Handover complete! Equipment is now in your active care. Return is scheduled for {due_str}.",
    )


def notify_damage_assessment_outcome(rental, assessment) -> Optional[Notification]:
    """FR026: The system shall notify a customer of the outcome of a damage assessment on their rental."""
    item_name = rental.item.name if rental.item else "Equipment"
    refund_str = f"₹{float(assessment.deposit_refunded):,.2f}"
    deduct_str = f"₹{float(assessment.total_deduction):,.2f}"
    
    if float(assessment.damage_deduction) > 0:
        msg = f"Return check-in complete for {item_name}. Damage deductions of {deduct_str} were assessed. Net refund of {refund_str} authorized. You may dispute this deduction in your Reservations tab if contested."
    else:
        msg = f"Return check-in complete for {item_name}. No damage identified. Full deposit refund of {refund_str} has been authorized."

    return send_notification(
        user_id=rental.customer_id,
        notif_type="damage_assessed",
        title=f"Return Settled — {item_name}",
        message=msg,
    )


def notify_dispute_resolved(rental, assessment) -> Optional[Notification]:
    """FR026: The system shall notify a customer of the outcome of a disputed assessment."""
    item_name = rental.item.name if rental.item else "Equipment"
    override_str = f"₹{float(assessment.manager_override_amount):,.2f}" if assessment.manager_override_amount is not None else "adjusted"
    refund_str = f"₹{float(assessment.deposit_refunded):,.2f}"
    return send_notification(
        user_id=rental.customer_id,
        notif_type="dispute_resolved",
        title=f"Dispute Resolved by Manager — {item_name}",
        message=f"A manager reviewed your damage dispute. Final deduction adjusted to {override_str}. Final deposit refund of {refund_str} authorized.",
    )


def notify_managers_of_dispute(rental, assessment) -> list:
    """Notifies all manager accounts that a customer has disputed a damage assessment."""
    from app.models import User, Role
    from sqlalchemy import text

    item_name = rental.item.name if rental.item else "Equipment"
    deduct_str = (
        f"₹{float(assessment.damage_deduction):,.2f}"
        if assessment.damage_deduction is not None
        else "the assessed deduction"
    )
    title = f"New Damage Dispute — {item_name}"
    reason_snippet = (
        assessment.dispute_reason.strip()
        if assessment.dispute_reason
        else "No rationale provided"
    )
    if len(reason_snippet) > 80:
        reason_snippet = reason_snippet[:77] + "..."
    message = (
        f"A customer disputed {deduct_str} for {item_name} (Rental #{rental.id}). "
        f"Reason: \"{reason_snippet}\". Please review and resolve in Disputes."
    )

    manager_uids = set()
    # 1. Query local users table
    try:
        managers = User.query.join(Role).filter(Role.name == "manager").all()
        for mgr in managers:
            manager_uids.add(str(mgr.id))
            try:
                auth_user_row = db.session.execute(
                    text("SELECT id FROM auth.users WHERE lower(email) = lower(:email) LIMIT 1"),
                    {"email": mgr.email},
                ).fetchone()
                if auth_user_row and auth_user_row[0]:
                    manager_uids.add(str(auth_user_row[0]))
            except Exception:
                pass
    except Exception:
        pass

    # 2. Query Supabase profiles if available
    try:
        prof_rows = db.session.execute(
            text("SELECT p.id FROM profiles p JOIN roles r ON p.role_id = r.id WHERE r.name = 'manager'")
        ).fetchall()
        for prow in prof_rows:
            if prow and prow[0]:
                manager_uids.add(str(prow[0]))
    except Exception:
        pass

    created_notifs = []
    for uid in manager_uids:
        n = send_notification(
            user_id=uid,
            notif_type="dispute_filed",
            title=title,
            message=message,
        )
        if n:
            created_notifs.append(n)

    return created_notifs

