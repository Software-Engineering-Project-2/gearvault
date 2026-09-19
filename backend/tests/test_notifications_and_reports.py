import unittest
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from app import create_app, db
from app.models import User, Category, Item, Booking, Rental, DamageType, DamageAssessment, Notification


class TestNotificationsAndReports(unittest.TestCase):
    def setUp(self):
        self.app = create_app({
            "TESTING": True,
            "SQLALCHEMY_DATABASE_URI": "sqlite:///:memory:",
            "JWT_SECRET_KEY": "gearvault-test-secret-key-32-chars-minimum",
        })
        self.client = self.app.test_client()
        self.ctx = self.app.app_context()
        self.ctx.push()
        db.create_all()

        # Seed test user
        self.user = User(email="customer@gearvault.com", full_name="Alex Customer", role="customer")
        self.user.set_password("password123")
        db.session.add(self.user)
        db.session.commit()

        # Authenticate
        res = self.client.post("/api/auth/login", json={"email": "customer@gearvault.com", "password": "password123"})
        self.token = res.get_json()["access_token"]
        self.auth_headers = {"Authorization": f"Bearer {self.token}"}

        # Seed inventory
        self.cat = Category(name="Audio", description="Sound gear")
        db.session.add(self.cat)
        db.session.commit()

        self.item = Item(
            sku="AUD-001",
            name="Sennheiser MKH 416",
            purchase_price=Decimal("80000.00"),
            purchase_date=datetime.now(timezone.utc).date() - timedelta(days=200),
            replacement_price=Decimal("85000.00"),
            category_id=self.cat.id,
            active=True,
        )
        db.session.add(self.item)
        db.session.commit()

    def tearDown(self):
        db.session.remove()
        db.drop_all()
        self.ctx.pop()

    def test_hold_expired_creates_notification(self):
        """FR024: Expiring soft holds automatically creates a hold_expired in-app notification."""
        now = datetime.now(timezone.utc)
        booking = Booking(
            customer_id=str(self.user.id),
            item_id=self.item.id,
            start_ts=now + timedelta(days=1),
            end_ts=now + timedelta(days=2),
            status="Held",
            hold_expires_at=now - timedelta(minutes=5),  # already expired
            deposit_amount=Decimal("5000.00"),
        )
        db.session.add(booking)
        db.session.commit()

        # Calling items listing or my_bookings triggers expire_holds()
        res = self.client.get("/api/bookings/mine", headers=self.auth_headers)
        self.assertEqual(res.status_code, 200)

        # Check notification table
        notifs = Notification.query.filter_by(user_id=str(self.user.id), type="hold_expired").all()
        self.assertEqual(len(notifs), 1)
        self.assertIn("Expired", notifs[0].title)
        self.assertFalse(notifs[0].read)

    def test_booking_confirmed_creates_notification(self):
        """FR025: Confirming booking payment generates a booking_confirmed notification."""
        now = datetime.now(timezone.utc)
        booking = Booking(
            customer_id=str(self.user.id),
            item_id=self.item.id,
            start_ts=now + timedelta(days=2),
            end_ts=now + timedelta(days=4),
            status="Held",
            hold_expires_at=now + timedelta(minutes=15),
            deposit_amount=Decimal("4000.00"),
        )
        db.session.add(booking)
        db.session.commit()

        res = self.client.post(
            f"/api/bookings/{booking.id}/confirm-payment",
            headers=self.auth_headers,
            json={"provider": "simulated_card"},
        )
        self.assertEqual(res.status_code, 200)

        notifs = Notification.query.filter_by(user_id=str(self.user.id), type="booking_confirmed").all()
        self.assertEqual(len(notifs), 1)
        self.assertIn("Confirmed", notifs[0].title)

    def test_notification_endpoints_and_read_state(self):
        """Verify GET /api/notifications and marking read / read-all."""
        notif1 = Notification(user_id=str(self.user.id), type="test1", title="Notice 1", message="Msg 1")
        notif2 = Notification(user_id=str(self.user.id), type="test2", title="Notice 2", message="Msg 2")
        db.session.add_all([notif1, notif2])
        db.session.commit()

        # Fetch notifications
        res = self.client.get("/api/notifications", headers=self.auth_headers)
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertEqual(data["unread_count"], 2)
        self.assertEqual(len(data["notifications"]), 2)

        # Mark first as read
        read_res = self.client.post(f"/api/notifications/{notif1.id}/read", headers=self.auth_headers)
        self.assertEqual(read_res.status_code, 200)

        res2 = self.client.get("/api/notifications", headers=self.auth_headers)
        self.assertEqual(res2.get_json()["unread_count"], 1)

        # Mark all as read
        all_res = self.client.post("/api/notifications/read-all", headers=self.auth_headers)
        self.assertEqual(all_res.status_code, 200)

        res3 = self.client.get("/api/notifications", headers=self.auth_headers)
        self.assertEqual(res3.get_json()["unread_count"], 0)

    def test_manager_analytics_and_csv_export(self):
        """FR027: Test manager analytics metrics aggregation and monthly CSV export."""
        now = datetime.now(timezone.utc)

        # Create 1 active rental (overdue) and 1 closed rental
        rental_overdue = Rental(
            item_id=self.item.id,
            customer_id=str(self.user.id),
            checkout_at=now - timedelta(days=4),
            due_at=now - timedelta(days=2),
            status="active",
            total_price=Decimal("8000.00"),
            deposit_held=Decimal("10000.00"),
        )
        rental_closed = Rental(
            item_id=self.item.id,
            customer_id=str(self.user.id),
            checkout_at=now - timedelta(days=10),
            due_at=now - timedelta(days=8),
            returned_at=now - timedelta(days=8),
            status="closed",
            total_price=Decimal("12000.00"),
            deposit_held=Decimal("10000.00"),
        )
        db.session.add_all([rental_overdue, rental_closed])
        db.session.commit()

        # Add assessment with damage on the closed rental
        dt = DamageType.query.filter_by(name="Cosmetic").first()
        assessment = DamageAssessment(
            rental_id=rental_closed.id,
            damage_type_id=dt.id if dt else None,
            severity=2,
            damage_deduction=Decimal("1500.00"),
            late_penalty=Decimal("0.00"),
            total_deduction=Decimal("1500.00"),
            deposit_refunded=Decimal("8500.00"),
            status="finalized",
        )
        db.session.add(assessment)
        db.session.commit()

        # Seed and login manager user for manager-only endpoints
        mgr_user = User(email="manager@gearvault.com", full_name="Manager User", role="manager")
        mgr_user.set_password("manager123")
        db.session.add(mgr_user)
        db.session.commit()
        m_login = self.client.post("/api/auth/login", json={"email": "manager@gearvault.com", "password": "manager123"})
        manager_headers = {"Authorization": f"Bearer {m_login.get_json()['access_token']}"}

        # 1. Analytics API
        analytics_res = self.client.get("/api/manager/analytics", headers=manager_headers)
        self.assertEqual(analytics_res.status_code, 200)
        adata = analytics_res.get_json()

        summary = adata["summary"]
        self.assertGreaterEqual(summary["total_revenue"], 21500.0)  # 8000 + 12000 + 1500
        self.assertEqual(summary["active_rentals_count"], 1)
        self.assertEqual(summary["overdue_count"], 1)
        self.assertEqual(len(adata["most_rented_items"]), 1)
        self.assertEqual(adata["most_rented_items"][0]["rental_count"], 2)

        # 2. CSV Export
        csv_res = self.client.get("/api/manager/reports/monthly-csv", headers=manager_headers)
        self.assertEqual(csv_res.status_code, 200)
        self.assertEqual(csv_res.mimetype, "text/csv")
        csv_text = csv_res.get_data(as_text=True)
        self.assertIn("Rental_ID,Booking_ID,Item_Name", csv_text)
        self.assertIn("Sennheiser MKH 416", csv_text)
        self.assertIn("AUD-001", csv_text)


if __name__ == "__main__":
    unittest.main()
