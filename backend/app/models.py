from datetime import datetime, timezone

from app.extensions import bcrypt, db


class User(db.Model):
    __tablename__ = "users"

    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(255), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(255), nullable=False)
    full_name = db.Column(db.String(255), nullable=True)
    role = db.Column(db.String(50), default="customer", nullable=False)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    def set_password(self, password: str):
        self.password_hash = bcrypt.generate_password_hash(password).decode("utf-8")

    def check_password(self, password: str) -> bool:
        return bcrypt.check_password_hash(self.password_hash, password)

    def to_dict(self):
        return {
            "id": self.id,
            "email": self.email,
            "full_name": self.full_name,
            "role": self.role,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class Category(db.Model):
    __tablename__ = "item_categories"
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), unique=True, nullable=False)
    description = db.Column(db.String(255))
    items = db.relationship("Item", back_populates="category")

    def to_dict(self):
        return {"id": self.id, "name": self.name, "description": self.description}


class Item(db.Model):
    __tablename__ = "items"
    id = db.Column(db.Integer, primary_key=True)
    sku = db.Column(db.Text, unique=True, nullable=True)
    name = db.Column(db.String(255), nullable=False, index=True)
    description = db.Column(db.Text)
    # Path within the Supabase Storage bucket, not a full URL.
    image_path = db.Column(db.Text, nullable=True)
    purchase_price = db.Column(db.Numeric(12, 2), nullable=False)
    purchase_date = db.Column(db.Date, nullable=True)
    replacement_price = db.Column(db.Numeric(12, 2), nullable=False)
    category_id = db.Column(
        db.Integer, db.ForeignKey("item_categories.id"), nullable=True, index=True
    )
    active = db.Column(db.Boolean, nullable=True, default=True)
    created_at = db.Column(
        db.DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    category = db.relationship("Category", back_populates="items")

    def to_dict(self):
        from app.services.pricing_engine import calculate_depreciated_value, get_item_daily_rate
        cat_name = self.category.name if self.category else None
        dep_val = calculate_depreciated_value(self.purchase_price, self.purchase_date, category_name=cat_name)
        daily_rate = get_item_daily_rate(self.purchase_price, self.purchase_date, category_name=cat_name)
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "image_path": self.image_path,
            "sku": self.sku,
            "category": self.category.to_dict() if self.category else None,
            "purchase_price": float(self.purchase_price),
            "purchase_date": self.purchase_date.isoformat() if self.purchase_date else None,
            "replacement_price": float(self.replacement_price),
            "depreciated_value": dep_val,
            "daily_rate": daily_rate,
            "active": self.active,
        }


class Booking(db.Model):
    __tablename__ = "bookings"
    id = db.Column(db.Integer, primary_key=True)
    # Supabase auth.users uses UUID primary keys.
    customer_id = db.Column(db.String(36), nullable=False, index=True)
    item_id = db.Column(
        db.Integer, db.ForeignKey("items.id"), nullable=False, index=True
    )
    start_ts = db.Column(db.DateTime(timezone=True), nullable=False, index=True)
    end_ts = db.Column(db.DateTime(timezone=True), nullable=False, index=True)
    status = db.Column(db.String(20), nullable=False, default="Held", index=True)
    hold_expires_at = db.Column(db.DateTime(timezone=True))
    deposit_amount = db.Column(db.Numeric(10, 2), nullable=False)
    created_at = db.Column(
        db.DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    item = db.relationship("Item")

    def to_dict(self):
        def as_utc(value):
            if value and value.tzinfo is None:
                value = value.replace(tzinfo=timezone.utc)
            return value.isoformat() if value else None

        status_value = (self.status or "").strip()
        pricing_data = None
        if self.item and self.start_ts and self.end_ts:
            from app.services.pricing_engine import calculate_rental_pricing
            cat_name = self.item.category.name if self.item.category else None
            pricing_data = calculate_rental_pricing(
                purchase_price=self.item.purchase_price,
                purchase_date=self.item.purchase_date,
                start_ts=self.start_ts,
                end_ts=self.end_ts,
                category_name=cat_name,
                replacement_price=self.item.replacement_price,
            )

        return {
            "id": self.id,
            "item": self.item.to_dict() if self.item else None,
            "start_ts": as_utc(self.start_ts),
            "end_ts": as_utc(self.end_ts),
            "status": status_value.capitalize() if status_value else status_value,
            "hold_expires_at": as_utc(self.hold_expires_at),
            "deposit_amount": float(self.deposit_amount),
            "pricing": pricing_data,
            "rental_price": pricing_data["rental_price"] if pricing_data else None,
            "duration_tier": pricing_data["duration_tier"] if pricing_data else None,
            "duration_days": pricing_data["duration_days"] if pricing_data else None,
        }


class Rental(db.Model):
    __tablename__ = "rentals"
    id = db.Column(db.Integer, primary_key=True)
    booking_id = db.Column(db.Integer, db.ForeignKey("bookings.id"), nullable=True)
    item_id = db.Column(
        db.Integer, db.ForeignKey("items.id"), nullable=True, index=True
    )
    customer_id = db.Column(db.String(36), nullable=True)
    checkout_at = db.Column(db.DateTime(timezone=True), nullable=True)
    due_at = db.Column(db.DateTime(timezone=True), nullable=True)
    returned_at = db.Column(db.DateTime(timezone=True), nullable=True)
    status = db.Column(db.Text, nullable=False, default="active")
    total_price = db.Column(db.Numeric(12, 2), nullable=True)
    deposit_held = db.Column(db.Numeric(12, 2), nullable=True)
    created_at = db.Column(
        db.DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    item = db.relationship("Item")
    booking = db.relationship("Booking")

    def to_dict(self):
        return {
            "id": self.id,
            "booking_id": self.booking_id,
            "item_id": self.item_id,
            "item": self.item.to_dict() if self.item else None,
            "customer_id": self.customer_id,
            "checkout_at": self.checkout_at.isoformat() if self.checkout_at else None,
            "due_at": self.due_at.isoformat() if self.due_at else None,
            "returned_at": self.returned_at.isoformat() if self.returned_at else None,
            "status": self.status,
            "total_price": float(self.total_price) if self.total_price else None,
            "deposit_held": float(self.deposit_held) if self.deposit_held else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }



class Payment(db.Model):
    __tablename__ = "payments"
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.String(36), nullable=False, index=True)
    rental_id = db.Column(db.Integer, db.ForeignKey("rentals.id"), nullable=True, index=True)
    amount = db.Column(db.Numeric(12, 2), nullable=False)
    payment_type = db.Column(db.String(50), nullable=False, default="deposit")
    provider = db.Column(db.String(50), nullable=True, default="simulated")
    created_at = db.Column(
        db.DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    def to_dict(self):
        return {
            "id": self.id,
            "user_id": self.user_id,
            "rental_id": self.rental_id,
            "amount": float(self.amount),
            "payment_type": self.payment_type,
            "provider": self.provider,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class ItemConditionLog(db.Model):
    __tablename__ = "item_condition_log"
    id = db.Column(db.Integer, primary_key=True)
    item_id = db.Column(db.Integer, db.ForeignKey("items.id"), nullable=False, index=True)
    rental_id = db.Column(db.Integer, db.ForeignKey("rentals.id"), nullable=True, index=True)
    captured_by = db.Column(db.String(36), nullable=True)
    photo_url = db.Column(db.Text, nullable=True)
    notes = db.Column(db.Text, nullable=True)
    captured_at = db.Column(
        db.DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    def to_dict(self):
        return {
            "id": self.id,
            "item_id": self.item_id,
            "rental_id": self.rental_id,
            "captured_by": self.captured_by,
            "photo_url": self.photo_url,
            "notes": self.notes,
            "captured_at": self.captured_at.isoformat() if self.captured_at else None,
        }

