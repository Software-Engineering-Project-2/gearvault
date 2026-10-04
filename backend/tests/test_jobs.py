import unittest
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from app import create_app, db
from app.models import Booking, Category, Item, Rental, User, Role
from app.jobs import expire_holds, escalate_overdue_rentals


class TestJobs(unittest.TestCase):
    def setUp(self):
        self.app = create_app({
            "TESTING": True,
            "SQLALCHEMY_DATABASE_URI": "sqlite:///:memory:",
            "JWT_SECRET_KEY": "gearvault-test-secret-key-32-chars-minimum",
        })
        self.ctx = self.app.app_context()
        self.ctx.push()

        db.create_all()
        for r_id, r_name in [(1, "customer"), (2, "staff"), (3, "manager")]:
            if not db.session.get(Role, r_id):
                db.session.add(Role(id=r_id, name=r_name))

        self.user = User(email="job_user@gearvault.com", role_id=1)
        self.user.set_password("pass123")
        self.cat = Category(name="Gear")
        db.session.add_all([self.user, self.cat])
        db.session.commit()

        self.item = Item(
            sku="JOB-001",
            name="Job Item",
            purchase_price=Decimal("50000.00"),
            replacement_price=Decimal("60000.00"),
            category_id=self.cat.id,
        )
        db.session.add(self.item)
        db.session.commit()

    def tearDown(self):
        db.session.remove()
        db.drop_all()
        self.ctx.pop()

    def test_expire_holds_job(self):
        now = datetime.now(timezone.utc)
        # Create an expired booking
        expired_b = Booking(
            customer_id=str(self.user.id),
            item_id=self.item.id,
            start_ts=now + timedelta(days=1),
            end_ts=now + timedelta(days=2),
            status="Held",
            hold_expires_at=now - timedelta(minutes=5),
            deposit_amount=Decimal("5000.00"),
        )
        # Create an active (unexpired) booking
        active_b = Booking(
            customer_id=str(self.user.id),
            item_id=self.item.id,
            start_ts=now + timedelta(days=3),
            end_ts=now + timedelta(days=4),
            status="Held",
            hold_expires_at=now + timedelta(minutes=10),
            deposit_amount=Decimal("5000.00"),
        )
        db.session.add_all([expired_b, active_b])
        db.session.commit()

        count = expire_holds()
        self.assertEqual(count, 1)

        db.session.refresh(expired_b)
        db.session.refresh(active_b)
        self.assertEqual(expired_b.status, "Expired")
        self.assertEqual(active_b.status, "Held")

        # Second run is idempotent (0 expired)
        count_again = expire_holds()
        self.assertEqual(count_again, 0)

    def test_escalate_overdue_rentals_job(self):
        now = datetime.now(timezone.utc)
        # Rental overdue by 8 days (> 7 days)
        overdue_r = Rental(
            item_id=self.item.id,
            customer_id=str(self.user.id),
            checkout_at=now - timedelta(days=15),
            due_at=now - timedelta(days=8),
            status="active",
            total_price=Decimal("10000.00"),
            deposit_held=Decimal("70000.00"),
        )
        # Rental overdue by 2 days (< 7 days)
        recent_r = Rental(
            item_id=self.item.id,
            customer_id=str(self.user.id),
            checkout_at=now - timedelta(days=5),
            due_at=now - timedelta(days=2),
            status="active",
            total_price=Decimal("5000.00"),
            deposit_held=Decimal("70000.00"),
        )
        db.session.add_all([overdue_r, recent_r])
        db.session.commit()

        count = escalate_overdue_rentals()
        self.assertEqual(count, 1)

        db.session.refresh(overdue_r)
        db.session.refresh(recent_r)
        self.assertEqual(overdue_r.status, "presumed_lost")
        self.assertEqual(recent_r.status, "active")

        # Second run is idempotent (0 escalated)
        count_again = escalate_overdue_rentals()
        self.assertEqual(count_again, 0)
