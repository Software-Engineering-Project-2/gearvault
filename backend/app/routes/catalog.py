import json
import os
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from functools import wraps
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from flask import Blueprint, g, jsonify, request
from sqlalchemy import func, or_

from app.extensions import db
from app.models import Booking, Category, Item, Rental

catalog_bp = Blueprint("catalog", __name__, url_prefix="/api")
BLOCKING_BOOKING_STATES = ("held", "confirmed")
ACTIVE_RENTAL_STATES = ("active", "checkedout")
BOOKING_STATUS_HELD = "Held"
BOOKING_STATUS_CONFIRMED = "Confirmed"
BOOKING_STATUS_CANCELLED = "Cancelled"
BOOKING_STATUS_EXPIRED = "Expired"


def customer_required(view):
    """Validate a Supabase access token and expose auth.users UUID to routes."""

    @wraps(view)
    def wrapped(*args, **kwargs):
        token = request.headers.get("Authorization", "").removeprefix("Bearer ").strip()
        supabase_url = os.getenv("SUPABASE_URL")
        supabase_key = os.getenv("SUPABASE_ANON_KEY")
        if not token or not supabase_url or not supabase_key:
            return jsonify({"error": "A valid Supabase session is required"}), 401
        try:
            auth_request = Request(
                f"{supabase_url.rstrip('/')}/auth/v1/user",
                headers={"apikey": supabase_key, "Authorization": f"Bearer {token}"},
            )
            with urlopen(auth_request, timeout=5) as response:
                g.customer_id = json.loads(response.read().decode("utf-8"))["id"]
        except (HTTPError, URLError, KeyError, ValueError):
            return jsonify({"error": "Your session is invalid or has expired"}), 401
        return view(*args, **kwargs)

    return wrapped


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
    Booking.query.filter(
        func.lower(Booking.status) == BOOKING_STATUS_HELD.lower(),
        Booking.hold_expires_at <= utcnow(),
    ).update({Booking.status: BOOKING_STATUS_EXPIRED}, synchronize_session=False)
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
        result.append(data)
    return jsonify({"items": result})


@catalog_bp.post("/bookings/hold")
@customer_required
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
        booking = Booking(
            customer_id=g.customer_id,
            item_id=item.id,
            start_ts=start,
            end_ts=end,
            status=BOOKING_STATUS_HELD,
            hold_expires_at=utcnow() + timedelta(minutes=15),
            # Items have no deposit field in the supplied schema; use the
            # configured 20% replacement-value deposit until pricing is added.
            deposit_amount=item.replacement_price * Decimal("0.20"),
        )
        db.session.add(booking)
        db.session.commit()
        return jsonify({"booking": booking.to_dict()}), 201
    except ValueError as error:
        return jsonify({"error": str(error)}), 400


@catalog_bp.post("/bookings/<int:booking_id>/confirm-payment")
@customer_required
def confirm_payment(booking_id):
    expire_holds()
    booking = Booking.query.filter_by(id=booking_id, customer_id=g.customer_id).first()
    if not booking:
        return jsonify({"error": "Booking not found"}), 404
    if (booking.status or "").lower() != BOOKING_STATUS_HELD.lower():
        return jsonify({"error": "Only an active hold can be confirmed"}), 409
    booking.status = BOOKING_STATUS_CONFIRMED
    booking.hold_expires_at = None
    db.session.commit()
    return jsonify(
        {
            "booking": booking.to_dict(),
            "message": "Deposit received; booking confirmed.",
        }
    )


@catalog_bp.delete("/bookings/<int:booking_id>")
@customer_required
def cancel_hold(booking_id):
    expire_holds()
    booking = Booking.query.filter_by(id=booking_id, customer_id=g.customer_id).first()
    if not booking:
        return jsonify({"error": "Booking not found"}), 404
    if (booking.status or "").lower() != BOOKING_STATUS_HELD.lower():
        return jsonify(
            {"error": "Only a soft hold may be cancelled before checkout"}
        ), 409
    booking.status = BOOKING_STATUS_CANCELLED
    db.session.commit()
    return jsonify({"message": "Hold cancelled and availability released."})


@catalog_bp.get("/bookings/mine")
@customer_required
def my_bookings():
    expire_holds()
    bookings = Booking.query.filter_by(customer_id=g.customer_id).order_by(
        Booking.created_at.desc()
    )
    return jsonify({"bookings": [booking.to_dict() for booking in bookings]})
