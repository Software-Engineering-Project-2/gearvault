import csv
import io
import json
import math
import os
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from functools import wraps
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from flask import Blueprint, g, jsonify, request, Response
from flask_jwt_extended import decode_token
from sqlalchemy import func, or_

from app.extensions import db
from app.models import (
    Booking,
    Category,
    Item,
    Rental,
    Payment,
    ItemConditionLog,
    DamageType,
    DamageAssessment,
    Notification,
)
from app.services.pricing_engine import (
    calculate_depreciated_value,
    calculate_rental_pricing,
    get_item_daily_rate,
)
from app.services.damage_engine import (
    evaluate_return_settlement,
    calculate_damage_deduction,
    calculate_late_penalty,
)
from app.services.notification_service import (
    notify_hold_expired,
    notify_booking_confirmed,
    notify_dispatch_and_due_date,
    notify_damage_assessment_outcome,
    notify_dispute_resolved,
)

catalog_bp = Blueprint("catalog", __name__, url_prefix="/api")
BLOCKING_BOOKING_STATES = ("held", "confirmed")
ACTIVE_RENTAL_STATES = ("active", "checkedout")
BOOKING_STATUS_HELD = "Held"
BOOKING_STATUS_CONFIRMED = "Confirmed"
BOOKING_STATUS_CANCELLED = "Cancelled"
BOOKING_STATUS_EXPIRED = "Expired"


from app.rbac import (
    customer_required,
    staff_required,
    manager_required,
    jwt_required_custom,
    roles_required,
)


def utcnow():
    return datetime.now(timezone.utc)


def parse_time(value):
    if not value:
        raise ValueError("start_ts and end_ts are required")
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    return (
        parsed.replace(tzinfo=timezone.utc)
        if parsed.tzinfo is None
        else parsed.astimezone(timezone.utc)
    )


def expire_holds():
    """FR024: Auto-expire unpaid soft holds after 15 minutes and notify customers."""
    expired_bookings = Booking.query.filter(
        func.lower(Booking.status) == BOOKING_STATUS_HELD.lower(),
        Booking.hold_expires_at <= utcnow(),
    ).all()
    if expired_bookings:
        for b in expired_bookings:
            b.status = BOOKING_STATUS_EXPIRED
            notify_hold_expired(b)
        db.session.commit()


def has_overlap(item_id, start, end):
    booking = Booking.query.filter(
        Booking.item_id == item_id,
        func.lower(Booking.status).in_(BLOCKING_BOOKING_STATES),
        Booking.start_ts < end,
        Booking.end_ts > start,
    ).first()
    rental = Rental.query.filter(
        Rental.item_id == item_id,
        func.lower(Rental.status).in_(ACTIVE_RENTAL_STATES),
        Rental.checkout_at < end,
        Rental.due_at > start,
    ).first()
    return bool(booking or rental)


def availability(item, start, end):
    return item.active and not has_overlap(item.id, start, end)


@catalog_bp.get("/categories")
def categories():
    return jsonify(
        {
            "categories": [
                category.to_dict()
                for category in Category.query.order_by(Category.name)
            ]
        }
    )


@catalog_bp.get("/items")
def list_items():
    expire_holds()
    query = Item.query.filter_by(active=True)
    term, category_id = (
        request.args.get("search", "").strip(),
        request.args.get("category_id"),
    )
    if term:
        query = query.filter(
            or_(Item.name.ilike(f"%{term}%"), Item.description.ilike(f"%{term}%"))
        )
    if category_id:
        query = query.filter(Item.category_id == category_id)
    try:
        start = (
            parse_time(request.args.get("start_ts"))
            if request.args.get("start_ts")
            else None
        )
        end = (
            parse_time(request.args.get("end_ts"))
            if request.args.get("end_ts")
            else None
        )
        if (
            (start and not end)
            or (end and not start)
            or (start and end and start >= end)
        ):
            raise ValueError("Provide a valid availability window")
    except ValueError as error:
        return jsonify({"error": str(error)}), 400
    result = []
    for item in query.order_by(Item.name):
        data = item.to_dict()
        data["available"] = availability(item, start, end) if start else True
        if start and end:
            cat_name = item.category.name if item.category else None
            pricing = calculate_rental_pricing(
                purchase_price=item.purchase_price,
                purchase_date=item.purchase_date,
                start_ts=start,
                end_ts=end,
                category_name=cat_name,
                replacement_price=item.replacement_price,
            )
            data["pricing"] = pricing
            data["estimated_price"] = pricing["rental_price"]
            data["estimated_deposit"] = pricing["deposit_amount"]
            data["duration_days"] = pricing["duration_days"]
            data["duration_tier"] = pricing["duration_tier"]
        result.append(data)
    return jsonify({"items": result})


@catalog_bp.get("/items/<int:item_id>")
def get_item(item_id):
    expire_holds()
    item = Item.query.filter_by(id=item_id, active=True).first()
    if not item:
        return jsonify({"error": "Item not found"}), 404

    try:
        start = (
            parse_time(request.args.get("start_ts"))
            if request.args.get("start_ts")
            else None
        )
        end = (
            parse_time(request.args.get("end_ts"))
            if request.args.get("end_ts")
            else None
        )
        if (
            (start and not end)
            or (end and not start)
            or (start and end and start >= end)
        ):
            raise ValueError("Provide a valid availability window")
    except ValueError as error:
        return jsonify({"error": str(error)}), 400

    data = item.to_dict()
    data["available"] = availability(item, start, end) if start else True
    if start and end:
        cat_name = item.category.name if item.category else None
        pricing = calculate_rental_pricing(
            purchase_price=item.purchase_price,
            purchase_date=item.purchase_date,
            start_ts=start,
            end_ts=end,
            category_name=cat_name,
            replacement_price=item.replacement_price,
        )
        data["pricing"] = pricing
        data["estimated_price"] = pricing["rental_price"]
        data["estimated_deposit"] = pricing["deposit_amount"]
        data["duration_days"] = pricing["duration_days"]
        data["duration_tier"] = pricing["duration_tier"]

    return jsonify({"item": data})



@catalog_bp.post("/bookings/hold")
@roles_required("customer")
def create_hold():
    expire_holds()
    data = request.get_json() or {}
    try:
        start, end = parse_time(data.get("start_ts")), parse_time(data.get("end_ts"))
        if start >= end or start < utcnow():
            raise ValueError("Choose a future end time after the start time")
        # Lock the inventory row while checking and writing the hold.  On databases
        # supporting row locks this serializes competing holds for the same item.
        item = (
            Item.query.filter_by(id=data.get("item_id"), active=True)
            .with_for_update()
            .first()
        )
        if not item:
            return jsonify({"error": "Item not found"}), 404
        if has_overlap(item.id, start, end):
            return jsonify(
                {"error": "This item is no longer available for that window"}
            ), 409

        cat_name = item.category.name if item.category else None
        pricing = calculate_rental_pricing(
            purchase_price=item.purchase_price,
            purchase_date=item.purchase_date,
            start_ts=start,
            end_ts=end,
            category_name=cat_name,
            replacement_price=item.replacement_price,
        )

        booking = Booking(
            customer_id=g.customer_id,
            item_id=item.id,
            start_ts=start,
            end_ts=end,
            status=BOOKING_STATUS_HELD,
            hold_expires_at=utcnow() + timedelta(minutes=15),
            deposit_amount=Decimal(str(pricing["deposit_amount"])),
        )
        db.session.add(booking)
        db.session.commit()
        return jsonify({"booking": booking.to_dict()}), 201
    except ValueError as error:
        return jsonify({"error": str(error)}), 400


@catalog_bp.post("/bookings/<int:booking_id>/confirm-payment")
@roles_required("customer")
def confirm_payment(booking_id):
    expire_holds()
    booking = db.session.get(Booking, booking_id)
    if not booking:
        return jsonify({"error": "Booking not found"}), 404
    if str(booking.customer_id) != str(g.customer_id) and getattr(g, "user_role", "") != "manager":
        return jsonify({"error": "You do not have permission to access this booking"}), 403
    if (booking.status or "").lower() != BOOKING_STATUS_HELD.lower():
        return jsonify({"error": "Only an active hold can be confirmed"}), 409
    
    data = request.get_json() or {}
    provider = data.get("provider", "simulated_card")

    # Record the deposit payment in the payments table
    payment = Payment(
        user_id=g.customer_id,
        amount=booking.deposit_amount,
        payment_type="deposit",
        provider=provider,
    )
    db.session.add(payment)

    booking.status = BOOKING_STATUS_CONFIRMED
    booking.hold_expires_at = None
    notify_booking_confirmed(booking)
    db.session.commit()
    return jsonify(
        {
            "booking": booking.to_dict(),
            "payment": payment.to_dict(),
            "message": "Deposit received; booking confirmed.",
        }
    )



@catalog_bp.delete("/bookings/<int:booking_id>")
@customer_required
def cancel_hold(booking_id):
    expire_holds()
    booking = db.session.get(Booking, booking_id)
    if not booking:
        return jsonify({"error": "Booking not found"}), 404
    if str(booking.customer_id) != str(g.customer_id) and getattr(g, "user_role", "") != "manager":
        return jsonify({"error": "You do not have permission to access this booking"}), 403
    if (booking.status or "").lower() != BOOKING_STATUS_HELD.lower():
        return jsonify(
            {"error": "Only a soft hold may be cancelled before checkout"}
        ), 409
    booking.status = BOOKING_STATUS_CANCELLED
    db.session.commit()
    return jsonify({"message": "Hold cancelled and availability released."})


@catalog_bp.get("/bookings/mine")
@jwt_required_custom
def my_bookings():
    expire_holds()
    bookings = Booking.query.filter_by(customer_id=g.customer_id).order_by(
        Booking.created_at.desc()
    )
    return jsonify({"bookings": [booking.to_dict() for booking in bookings]})


@catalog_bp.get("/rentals/mine")
@jwt_required_custom
def my_rentals():
    rentals = Rental.query.filter_by(customer_id=g.customer_id).order_by(
        Rental.created_at.desc()
    ).all()
    return jsonify({"rentals": [rental.to_dict() for rental in rentals]})


@catalog_bp.get("/bookings/<int:booking_id>")
@jwt_required_custom
def get_booking(booking_id):
    expire_holds()
    booking = db.session.get(Booking, booking_id)
    if not booking:
        return jsonify({"error": "Booking not found"}), 404
    # Customers can only view their own bookings; Staff and Manager can view any booking for operational pickup/audit
    if getattr(g, "user_role", "") == "customer" and str(booking.customer_id) != str(g.customer_id):
        return jsonify({"error": "You do not have permission to access this booking"}), 403
    return jsonify({"booking": booking.to_dict()})


# ==========================================
# STAFF & MANAGER OPERATIONS ENDPOINTS
# ==========================================

@catalog_bp.get("/staff/bookings/confirmed")
@staff_required
def staff_confirmed_bookings():
    expire_holds()
    # Returns all confirmed bookings ready for equipment pickup
    bookings = Booking.query.filter(
        func.lower(Booking.status) == BOOKING_STATUS_CONFIRMED.lower()
    ).order_by(Booking.start_ts.asc()).all()
    return jsonify({"bookings": [b.to_dict() for b in bookings]})


@catalog_bp.get("/staff/rentals/active")
@staff_required
def staff_active_rentals():
    # Returns all active rentals currently checked out to customers
    rentals = Rental.query.filter(
        func.lower(Rental.status) == "active"
    ).order_by(Rental.due_at.asc()).all()
    return jsonify({"rentals": [r.to_dict() for r in rentals]})


@catalog_bp.post("/staff/bookings/<int:booking_id>/handover")
@staff_required
def staff_process_handover(booking_id):
    expire_holds()
    booking = Booking.query.filter_by(id=booking_id).first()
    if not booking:
        return jsonify({"error": "Booking not found"}), 404
    if (booking.status or "").lower() != BOOKING_STATUS_CONFIRMED.lower():
        return jsonify({"error": "Only confirmed bookings can be handed over"}), 400


    data = request.get_json() or {}
    condition_notes = data.get("notes", "").strip()
    photo_url = data.get("photo_url", "").strip()

    # Optional: Log pre-rental condition if notes or photo provided
    condition_log = None
    if condition_notes or photo_url:
        condition_log = ItemConditionLog(
            item_id=booking.item_id,
            captured_by=g.customer_id,
            notes=condition_notes or "Pre-rental condition check OK",
            photo_url=photo_url or None,
        )
        db.session.add(condition_log)
        db.session.flush()

    # Calculate final rental total price using pricing engine
    cat_name = booking.item.category.name if booking.item and booking.item.category else None
    pricing = calculate_rental_pricing(
        purchase_price=booking.item.purchase_price if booking.item else 0,
        purchase_date=booking.item.purchase_date if booking.item else None,
        start_ts=booking.start_ts,
        end_ts=booking.end_ts,
        category_name=cat_name,
        replacement_price=booking.item.replacement_price if booking.item else None,
    )

    # Create active rental record
    rental = Rental(
        booking_id=booking.id,
        item_id=booking.item_id,
        customer_id=booking.customer_id,
        checkout_at=utcnow(),
        due_at=booking.end_ts,
        status="active",
        total_price=Decimal(str(pricing["rental_price"])),
        deposit_held=booking.deposit_amount,
    )
    db.session.add(rental)

    # Link condition log to rental if created
    if condition_log:
        condition_log.rental_id = rental.id

    # Update booking status
    booking.status = "Checked Out"
    notify_dispatch_and_due_date(rental)
    db.session.commit()

    return jsonify({
        "message": f"Handover complete. Rental for {booking.item.name if booking.item else 'item'} is now Active.",
        "rental": rental.to_dict()
    }), 200


@catalog_bp.post("/pricing/estimate")
def estimate_price():
    """
    Public / customer endpoint to calculate dynamic pricing for any item and date window.
    """
    data = request.get_json() or {}
    item_id = data.get("item_id")
    start_val = data.get("start_ts")
    end_val = data.get("end_ts")
    if not item_id or not start_val or not end_val:
        return jsonify({"error": "item_id, start_ts, and end_ts are required"}), 400
    
    item = db.session.get(Item, item_id)
    if not item:
        return jsonify({"error": "Item not found"}), 404
        
    try:
        start, end = parse_time(start_val), parse_time(end_val)
        if start >= end:
            raise ValueError("End date must be after start date")
            
        cat_name = item.category.name if item.category else None
        pricing = calculate_rental_pricing(
            purchase_price=item.purchase_price,
            purchase_date=item.purchase_date,
            start_ts=start,
            end_ts=end,
            category_name=cat_name,
            replacement_price=item.replacement_price,
        )
        return jsonify({
            "item_id": item.id,
            "item_name": item.name,
            "pricing": pricing,
        })
    except ValueError as error:
        return jsonify({"error": str(error)}), 400


# =========================================================
# INCREMENT 4: RETURN & DAMAGE ASSESSMENT ENDPOINTS (FR015–FR023)
# =========================================================

@catalog_bp.get("/damage-types")
def get_damage_types():
    """Returns all available damage categories and deduction weights."""
    types = DamageType.query.order_by(DamageType.id).all()
    return jsonify({"damage_types": [dt.to_dict() for dt in types]})


@catalog_bp.post("/damage/estimate-deduction")
def estimate_damage_deduction():
    """
    Simulates / calculates damage deduction and overdue penalties for return preview.
    """
    data = request.get_json() or {}
    depreciated_value = float(data.get("depreciated_value", 0.0))
    replacement_price = float(data.get("replacement_price", 0.0))
    deposit_held = float(data.get("deposit_held", 0.0))
    due_at_str = data.get("due_at")
    severity = data.get("severity")
    damage_type_id = data.get("damage_type_id")
    force_presumed_lost = bool(data.get("force_presumed_lost", False))

    if not due_at_str:
        return jsonify({"error": "due_at is required"}), 400

    try:
        due_at = parse_time(due_at_str)
        weight = 0.0
        if damage_type_id:
            dt = db.session.get(DamageType, damage_type_id)
            if dt:
                weight = float(dt.weight)

        settlement = evaluate_return_settlement(
            depreciated_value=depreciated_value,
            replacement_price=replacement_price,
            deposit_held=deposit_held,
            due_at=due_at,
            returned_at=utcnow(),
            severity=int(severity) if severity else None,
            damage_type_weight=weight,
            force_presumed_lost=force_presumed_lost,
        )
        return jsonify({"settlement": settlement})
    except Exception as e:
        return jsonify({"error": str(e)}), 400


@catalog_bp.post("/staff/rentals/<int:rental_id>/return")
@staff_required
def staff_process_return(rental_id):
    """
    Processes counter return for an active rental:
    - Logs post-rental condition notes and photo URL to ItemConditionLog (FR015, FR016).
    - If damage is reported, calculates deduction with severity and damage type (FR017, FR018).
    - Calculates late penalties and checks Presumed Lost threshold (FR021–FR023).
    - Persists DamageAssessment and adjusts deposit refund (atomic financial integrity).
    """
    rental = db.session.get(Rental, rental_id)
    if not rental:
        return jsonify({"error": "Rental not found"}), 404
    if (rental.status or "").lower() not in ("active", "checkedout", "under_assessment"):
        return jsonify({"error": f"Rental is currently '{rental.status}'; only active rentals can be returned"}), 400

    data = request.get_json() or {}
    condition_notes = data.get("notes", "").strip()
    photo_url = data.get("photo_url", "").strip()
    has_damage = bool(data.get("has_damage", False))
    damage_type_id = data.get("damage_type_id")
    severity = data.get("severity")
    force_presumed_lost = bool(data.get("force_presumed_lost", False))

    item = rental.item
    cat_name = item.category.name if item and item.category else None
    purchase_price = float(item.purchase_price) if item and item.purchase_price else 0.0
    purchase_date = item.purchase_date if item else None
    replacement_price = float(item.replacement_price) if item and item.replacement_price else 0.0
    depreciated_val = calculate_depreciated_value(purchase_price, purchase_date, category_name=cat_name)

    damage_type_weight = 0.0
    selected_damage_type = None
    if has_damage and damage_type_id:
        selected_damage_type = db.session.get(DamageType, damage_type_id)
        if selected_damage_type:
            damage_type_weight = float(selected_damage_type.weight)

    # Compute financial return settlement
    now = utcnow()
    settlement = evaluate_return_settlement(
        depreciated_value=depreciated_val,
        replacement_price=replacement_price,
        deposit_held=float(rental.deposit_held or 0.0),
        due_at=rental.due_at or now,
        returned_at=now,
        severity=int(severity) if (has_damage and severity) else None,
        damage_type_weight=damage_type_weight,
        force_presumed_lost=force_presumed_lost,
    )

    # 1. Post-rental condition log (FR015, FR016)
    condition_log = ItemConditionLog(
        item_id=rental.item_id,
        rental_id=rental.id,
        captured_by=g.customer_id,
        notes=condition_notes or ("Post-return check: item in good condition" if not has_damage else "Damage noted upon return"),
        photo_url=photo_url or None,
        captured_at=now,
    )
    db.session.add(condition_log)

    # 2. Damage Assessment persistence (FR018)
    assessment = DamageAssessment.query.filter_by(rental_id=rental.id).first()
    if not assessment:
        assessment = DamageAssessment(rental_id=rental.id)
        db.session.add(assessment)

    assessment.assessed_by = g.customer_id
    assessment.damage_type_id = selected_damage_type.id if selected_damage_type else None
    assessment.severity = int(severity) if (has_damage and severity) else None
    assessment.notes = condition_notes or None
    assessment.damage_deduction = Decimal(str(settlement["damage_deduction"]))
    assessment.late_penalty = Decimal(str(settlement["late_penalty"]))
    assessment.replacement_charge = Decimal(str(settlement["replacement_charge"]))
    assessment.total_deduction = Decimal(str(settlement["total_deduction"]))
    assessment.deposit_refunded = Decimal(str(settlement["deposit_refunded"]))
    
    # Status: if damage deduction exists, customer may dispute -> 'assessed'; otherwise 'finalized'
    assessment.status = "assessed" if (has_damage and settlement["damage_deduction"] > 0) else "finalized"

    # 3. Update Rental record
    rental.returned_at = now
    if settlement["is_presumed_lost"]:
        rental.status = "presumed_lost"
    elif has_damage and settlement["damage_deduction"] > 0:
        rental.status = "under_assessment"
    else:
        rental.status = "closed"

    # 4. Record financial payment events
    if settlement["deposit_refunded"] > 0:
        refund_payment = Payment(
            user_id=rental.customer_id,
            rental_id=rental.id,
            amount=Decimal(str(settlement["deposit_refunded"])),
            payment_type="deposit_refund",
            provider="simulated_counter",
        )
        db.session.add(refund_payment)

    if settlement["total_deduction"] > 0:
        deduction_payment = Payment(
            user_id=rental.customer_id,
            rental_id=rental.id,
            amount=Decimal(str(settlement["total_deduction"])),
            payment_type="damage_deduction",
            provider="simulated_counter",
        )
        db.session.add(deduction_payment)

    notify_damage_assessment_outcome(rental, assessment)
    db.session.commit()

    return jsonify({
        "message": f"Return processed successfully. Deposit refund of ₹{settlement['deposit_refunded']:,.2f} authorized.",
        "rental": rental.to_dict(),
        "settlement": settlement,
        "assessment": assessment.to_dict(),
    }), 200


@catalog_bp.post("/rentals/<int:rental_id>/dispute")
@customer_required
def submit_damage_dispute(rental_id):
    """
    FR019: Allows a customer to submit a dispute for a damage assessment deduction.
    """
    rental = db.session.get(Rental, rental_id)
    if not rental:
        return jsonify({"error": "Rental not found"}), 404

    # Ownership check: customers can only dispute their own rentals
    if str(rental.customer_id) != str(g.customer_id) and getattr(g, "user_role", "") != "manager":
        return jsonify({"error": "You do not have permission to dispute this rental"}), 403

    assessment = DamageAssessment.query.filter_by(rental_id=rental.id).first()
    if not assessment:
        return jsonify({"error": "No damage assessment exists for this rental"}), 404

    if assessment.status != "assessed":
        return jsonify({"error": f"Assessment cannot be disputed in '{assessment.status}' status"}), 400

    data = request.get_json() or {}
    dispute_reason = data.get("reason", "").strip()
    if not dispute_reason:
        return jsonify({"error": "Please provide a reason for disputing the damage assessment"}), 400

    assessment.status = "disputed"
    assessment.dispute_reason = dispute_reason
    assessment.disputed_at = utcnow()
    rental.status = "disputed"

    db.session.commit()

    return jsonify({
        "message": "Dispute submitted successfully. A manager will review your dispute.",
        "assessment": assessment.to_dict(),
        "rental": rental.to_dict(),
    }), 200


@catalog_bp.get("/staff/disputes")
@staff_required
def list_disputes():
    """
    Returns all assessments currently flagged as 'disputed' for Staff / Manager review.
    """
    assessments = DamageAssessment.query.filter_by(status="disputed").order_by(DamageAssessment.disputed_at.desc()).all()
    results = []
    for a in assessments:
        r_dict = a.rental.to_dict() if a.rental else None
        data = a.to_dict()
        data["rental"] = r_dict
        results.append(data)
    return jsonify({"disputes": results})


@catalog_bp.post("/manager/disputes/<int:assessment_id>/override")
@manager_required
def manager_override_dispute(assessment_id):

    """
    FR020 & BR3: Only a manager can override or finalize a disputed deduction without
    an intermediate formal review state.
    """
    assessment = db.session.get(DamageAssessment, assessment_id)
    if not assessment:
        return jsonify({"error": "Assessment not found"}), 404
    if assessment.status != "disputed":
        return jsonify({"error": f"Assessment is '{assessment.status}', not in disputed status"}), 400

    data = request.get_json() or {}
    override_amount_val = data.get("override_amount")
    manager_notes = data.get("manager_notes", "").strip()

    if override_amount_val is None:
        return jsonify({"error": "override_amount is required"}), 400

    try:
        override_amount = round(float(override_amount_val), 2)
        if override_amount < 0:
            raise ValueError("Override deduction cannot be negative")
    except ValueError as e:
        return jsonify({"error": str(e)}), 400

    rental = assessment.rental
    deposit_held = float(rental.deposit_held or 0.0)
    late_penalty = float(assessment.late_penalty or 0.0)

    # Recalculate totals with override
    new_total_deduction = round(override_amount + late_penalty, 2)
    new_deposit_refund = max(0.0, round(deposit_held - new_total_deduction, 2))

    assessment.manager_override_amount = Decimal(str(override_amount))
    assessment.manager_notes = manager_notes or "Manager direct override applied."
    assessment.damage_deduction = Decimal(str(override_amount))
    assessment.total_deduction = Decimal(str(new_total_deduction))
    assessment.deposit_refunded = Decimal(str(new_deposit_refund))
    assessment.status = "resolved"
    assessment.resolved_at = utcnow()

    if rental:
        rental.status = "closed"

    # Record adjustment payment if net refund increased
    adjustment_payment = Payment(
        user_id=rental.customer_id if rental else g.customer_id,
        rental_id=rental.id if rental else None,
        amount=Decimal(str(new_deposit_refund)),
        payment_type="deposit_refund_override",
        provider="simulated_manager",
    )
    db.session.add(adjustment_payment)

    if rental:
        notify_dispute_resolved(rental, assessment)
    db.session.commit()

    return jsonify({
        "message": f"Dispute resolved. Final deduction adjusted to ₹{override_amount:,.2f}; net refund ₹{new_deposit_refund:,.2f} finalized.",
        "assessment": assessment.to_dict(),
        "rental": rental.to_dict() if rental else None,
    }), 200


# =========================================================
# INCREMENT 5: IN-APP NOTIFICATIONS & MANAGER REPORTS (FR024–FR027)
# =========================================================

@catalog_bp.get("/notifications")
@jwt_required_custom
def get_notifications():
    """
    FR024, FR025, FR026: Fetches recent in-app notifications and unread count for user.
    """
    notifications = (
        Notification.query.filter_by(user_id=g.customer_id)
        .order_by(Notification.created_at.desc())
        .limit(30)
        .all()
    )
    unread_count = Notification.query.filter_by(
        user_id=g.customer_id, read=False
    ).count()
    return jsonify({
        "notifications": [n.to_dict() for n in notifications],
        "unread_count": unread_count,
    })


@catalog_bp.post("/notifications/<int:notif_id>/read")
@jwt_required_custom
def mark_notification_read(notif_id):
    """Marks an individual notification as read."""
    notif = db.session.get(Notification, notif_id)
    if not notif:
        return jsonify({"error": "Notification not found"}), 404
    if str(notif.user_id) != str(g.customer_id):
        return jsonify({"error": "You do not have permission to access this notification"}), 403
    notif.read = True
    db.session.commit()
    return jsonify({"message": "Marked as read", "notification": notif.to_dict()})


@catalog_bp.post("/notifications/read-all")
@jwt_required_custom
def mark_all_notifications_read():
    """Marks all notifications for current user as read."""
    Notification.query.filter_by(user_id=g.customer_id, read=False).update(
        {Notification.read: True}, synchronize_session=False
    )
    db.session.commit()
    return jsonify({"message": "All notifications marked as read"})


@catalog_bp.get("/manager/analytics")
@manager_required
def manager_analytics():
    """
    FR027: Aggregates manager dashboard metrics displaying revenue,
    most-rented items, damage-cost trends, and overdue rentals.
    """
    now = utcnow()
    rentals = Rental.query.all()
    items = Item.query.all()
    assessments = DamageAssessment.query.all()

    total_rental_fees = sum(float(r.total_price or 0.0) for r in rentals)
    total_damage_deductions = sum(float(a.damage_deduction or 0.0) for a in assessments)
    total_late_penalties = sum(float(a.late_penalty or 0.0) for a in assessments)
    total_revenue = round(total_rental_fees + total_damage_deductions + total_late_penalties, 2)

    active_rentals = [r for r in rentals if (r.status or "").lower() in ("active", "checkedout")]
    active_rentals_count = len(active_rentals)
    total_deposits_held = round(sum(float(r.deposit_held or 0.0) for r in active_rentals), 2)
    total_refunds_issued = round(sum(float(a.deposit_refunded or 0.0) for a in assessments), 2)

    # Overdue rentals monitoring
    overdue_rentals_list = []
    for r in active_rentals:
        if r.due_at:
            due_at = r.due_at
            if due_at.tzinfo is None:
                due_at = due_at.replace(tzinfo=timezone.utc)
            if due_at < now:
                overdue_sec = (now - due_at).total_seconds()
                overdue_days = max(1, math.ceil((overdue_sec - 60) / 86400.0)) if overdue_sec > 60 else 0
                if overdue_days > 0:
                    overdue_rentals_list.append({
                        "rental_id": r.id,
                        "item_id": r.item_id,
                        "item_name": r.item.name if r.item else f"Item #{r.item_id}",
                        "sku": r.item.sku if r.item else None,
                        "customer_id": r.customer_id,
                        "checkout_at": r.checkout_at.isoformat() if r.checkout_at else None,
                        "due_at": due_at.isoformat(),
                        "overdue_days": overdue_days,
                        "accrued_penalty": round(overdue_days * 500.0, 2),
                        "deposit_held": float(r.deposit_held or 0.0),
                    })

    # Most rented items ranking
    item_rental_counts = {}
    for r in rentals:
        if r.item_id:
            if r.item_id not in item_rental_counts:
                item_rental_counts[r.item_id] = {
                    "item_id": r.item_id,
                    "name": r.item.name if r.item else f"Item #{r.item_id}",
                    "sku": r.item.sku if r.item else "N/A",
                    "category": r.item.category.name if r.item and r.item.category else "General",
                    "rental_count": 0,
                    "total_earned": 0.0,
                }
            item_rental_counts[r.item_id]["rental_count"] += 1
            item_rental_counts[r.item_id]["total_earned"] += float(r.total_price or 0.0)

    most_rented = sorted(
        item_rental_counts.values(), key=lambda x: x["rental_count"], reverse=True
    )[:10]

    # Damage trends by category
    damage_by_category = {}
    for a in assessments:
        cat = (
            a.rental.item.category.name
            if a.rental and a.rental.item and a.rental.item.category
            else "General"
        )
        if cat not in damage_by_category:
            damage_by_category[cat] = {
                "category": cat,
                "incidents": 0,
                "total_damage_cost": 0.0,
            }
        if float(a.damage_deduction or 0.0) > 0:
            damage_by_category[cat]["incidents"] += 1
            damage_by_category[cat]["total_damage_cost"] += float(a.damage_deduction)

    damage_trends = sorted(
        damage_by_category.values(), key=lambda x: x["total_damage_cost"], reverse=True
    )

    return jsonify({
        "summary": {
            "total_revenue": total_revenue,
            "total_rental_fees": round(total_rental_fees, 2),
            "total_damage_deductions": round(total_damage_deductions, 2),
            "total_late_penalties": round(total_late_penalties, 2),
            "active_rentals_count": active_rentals_count,
            "total_deposits_held": total_deposits_held,
            "total_refunds_issued": total_refunds_issued,
            "overdue_count": len(overdue_rentals_list),
            "total_inventory_items": len(items),
            "disputes_count": len([a for a in assessments if a.status == "disputed"]),
        },
        "most_rented_items": most_rented,
        "damage_trends": damage_trends,
        "overdue_rentals": overdue_rentals_list,
    })


@catalog_bp.get("/manager/reports/monthly-csv")
@manager_required
def manager_export_monthly_csv():
    """
    FR027: Export monthly rental and financial report in CSV format.
    """
    output = io.StringIO()
    writer = csv.writer(output)

    # Standard CSV headers
    writer.writerow([
        "Rental_ID",
        "Booking_ID",
        "Item_Name",
        "SKU",
        "Customer_ID",
        "Checkout_Date",
        "Due_Date",
        "Returned_Date",
        "Rental_Status",
        "Rental_Fee_INR",
        "Deposit_Held_INR",
        "Damage_Type",
        "Damage_Severity",
        "Damage_Deduction_INR",
        "Late_Penalty_INR",
        "Net_Deposit_Refund_INR",
    ])

    rentals = Rental.query.order_by(Rental.created_at.desc()).all()
    for r in rentals:
        a = r.damage_assessment
        writer.writerow([
            r.id,
            r.booking_id or "",
            r.item.name if r.item else "",
            r.item.sku if r.item else "",
            r.customer_id or "",
            r.checkout_at.strftime("%Y-%m-%d %H:%M") if r.checkout_at else "",
            r.due_at.strftime("%Y-%m-%d %H:%M") if r.due_at else "",
            r.returned_at.strftime("%Y-%m-%d %H:%M") if r.returned_at else "",
            r.status,
            f"{float(r.total_price or 0.0):.2f}",
            f"{float(r.deposit_held or 0.0):.2f}",
            a.damage_type.name if a and a.damage_type else "None",
            a.severity if a and a.severity else "0",
            f"{float(a.damage_deduction or 0.0):.2f}" if a else "0.00",
            f"{float(a.late_penalty or 0.0):.2f}" if a else "0.00",
            f"{float(a.deposit_refunded or 0.0):.2f}" if a else "0.00",
        ])

    csv_data = output.getvalue()
    filename = f"gearvault_monthly_report_{utcnow().strftime('%Y_%m')}.csv"
    return Response(
        csv_data,
        mimetype="text/csv",
        headers={
            "Content-Disposition": f"attachment; filename={filename}",
            "Content-Type": "text/csv; charset=utf-8",
        },
    )




