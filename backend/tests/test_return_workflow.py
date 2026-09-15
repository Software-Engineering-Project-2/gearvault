import unittest
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from app import create_app, db
from app.models import User, Category, Item, Booking, Rental, DamageType, DamageAssessment, Payment


class TestReturnAndDisputeWorkflow(unittest.TestCase):
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
        self.user = User(email="test@gearvault.com", full_name="Test Customer", role="customer")
        self.user.set_password("password123")
        db.session.add(self.user)
        db.session.commit()

        # Login to get JWT
        res = self.client.post("/api/auth/login", json={"email": "test@gearvault.com", "password": "password123"})
        self.token = res.get_json()["access_token"]
        self.auth_headers = {"Authorization": f"Bearer {self.token}"}

        # Seed category and item
        self.cat = Category(name="Cameras", description="Photo gear")
        db.session.add(self.cat)
        db.session.commit()

        self.item = Item(
            sku="CAM-TEST",
            name="Sony FX3",
            description="Cinema Line Full-frame Camera",
            purchase_price=Decimal("300000.00"),
            purchase_date=datetime.now(timezone.utc).date() - timedelta(days=365),
            replacement_price=Decimal("320000.00"),
            category_id=self.cat.id,
            active=True,
        )
        db.session.add(self.item)
        db.session.commit()

    def tearDown(self):
        db.session.remove()
        db.drop_all()
        self.ctx.pop()

    def test_damage_types_seeded_and_retrievable(self):
        """Verify GET /api/damage-types returns seeded damage types."""
        res = self.client.get("/api/damage-types")
        self.assertEqual(res.status_code, 200)
        types = res.get_json().get("damage_types", [])
        self.assertGreaterEqual(len(types), 3)
        names = [t["name"] for t in types]
        self.assertIn("Cosmetic", names)
        self.assertIn("Functional", names)
        self.assertIn("Major/Total Loss", names)

    def test_on_time_undamaged_return_full_refund(self):
        """Returning on time with no damage refunds 100% deposit and closes rental."""
        now = datetime.now(timezone.utc)
        rental = Rental(
            item_id=self.item.id,
            customer_id=str(self.user.id),
            checkout_at=now - timedelta(days=2),
            due_at=now + timedelta(days=1),
            status="active",
            total_price=Decimal("15000.00"),
            deposit_held=Decimal("20000.00"),
        )
        db.session.add(rental)
        db.session.commit()

        res = self.client.post(
            f"/api/staff/rentals/{rental.id}/return",
            headers=self.auth_headers,
            json={
                "notes": "Returned in mint condition with lens cap.",
                "has_damage": False,
            },
        )
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertEqual(data["rental"]["status"], "closed")
        self.assertEqual(data["settlement"]["damage_deduction"], 0.0)
        self.assertEqual(data["settlement"]["late_penalty"], 0.0)
        self.assertEqual(data["settlement"]["deposit_refunded"], 20000.0)

        # Check Payment record
        payment = Payment.query.filter_by(rental_id=rental.id, payment_type="deposit_refund").first()
        self.assertIsNotNone(payment)
        self.assertEqual(float(payment.amount), 20000.0)

    def test_overdue_damaged_return_and_dispute_override_flow(self):
        """
        Complete end-to-end flow:
        1. Return overdue with functional damage (severity 2).
        2. Deductions calculated; rental marked 'under_assessment'.
        3. Customer disputes assessment.
        4. Manager reviews disputes and applies direct override deduction.
        """
        now = datetime.now(timezone.utc)
        # Rental due 2 days ago
        rental = Rental(
            item_id=self.item.id,
            customer_id=str(self.user.id),
            checkout_at=now - timedelta(days=5),
            due_at=now - timedelta(days=2),
            status="active",
            total_price=Decimal("25000.00"),
            deposit_held=Decimal("30000.00"),
        )
        db.session.add(rental)
        db.session.commit()

        functional_dt = DamageType.query.filter_by(name="Functional").first()

        # 1. Staff processes return with damage
        res = self.client.post(
            f"/api/staff/rentals/{rental.id}/return",
            headers=self.auth_headers,
            json={
                "notes": "Top dial stiff, slight mount play.",
                "has_damage": True,
                "damage_type_id": functional_dt.id,
                "severity": 2,
            },
        )
        self.assertEqual(res.status_code, 200)
        ret_data = res.get_json()
        self.assertEqual(ret_data["rental"]["status"], "under_assessment")
        self.assertEqual(ret_data["assessment"]["status"], "assessed")
        self.assertTrue(ret_data["settlement"]["is_overdue"])
        self.assertEqual(ret_data["settlement"]["overdue_days"], 2)
        self.assertEqual(ret_data["settlement"]["late_penalty"], 1000.0)  # 2 * 500

        assessment_id = ret_data["assessment"]["id"]

        # 2. Customer submits dispute (FR019)
        disp_res = self.client.post(
            f"/api/rentals/{rental.id}/dispute",
            headers=self.auth_headers,
            json={"reason": "Dial was already slightly stiff during handover pickup."},
        )
        self.assertEqual(disp_res.status_code, 200)
        self.assertEqual(disp_res.get_json()["assessment"]["status"], "disputed")
        self.assertEqual(disp_res.get_json()["rental"]["status"], "disputed")

        # 3. List disputes for manager
        list_res = self.client.get("/api/staff/disputes", headers=self.auth_headers)
        self.assertEqual(list_res.status_code, 200)
        disputes = list_res.get_json().get("disputes", [])
        self.assertEqual(len(disputes), 1)
        self.assertEqual(disputes[0]["id"], assessment_id)

        # 4. Manager overrides dispute (FR020, BR3)
        override_res = self.client.post(
            f"/api/manager/disputes/{assessment_id}/override",
            headers=self.auth_headers,
            json={
                "override_amount": 2500.0,
                "manager_notes": "Agreed to partial concession as customer noted pre-existing stiffness.",
            },
        )
        self.assertEqual(override_res.status_code, 200)
        ov_data = override_res.get_json()
        self.assertEqual(ov_data["assessment"]["status"], "resolved")
        self.assertEqual(ov_data["assessment"]["manager_override_amount"], 2500.0)
        self.assertEqual(ov_data["rental"]["status"], "closed")
        # Deposit was 30,000. New deduction = 2500 (override) + 1000 (late) = 3500. Refund = 26500.
        self.assertEqual(ov_data["assessment"]["deposit_refunded"], 26500.0)


if __name__ == "__main__":
    unittest.main()
