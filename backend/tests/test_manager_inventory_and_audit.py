import unittest
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from app import create_app, db
from app.models import User, Category, Item, Booking, Rental, FinancialAuditLog, DamageAssessment
from app.routes.catalog import escalate_overdue_rentals


class TestManagerInventoryAndAudit(unittest.TestCase):
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

        # Seed customer
        self.customer = User(email="customer@gearvault.com", full_name="Customer User", role="customer")
        self.customer.set_password("password123")
        db.session.add(self.customer)

        # Seed manager
        self.manager = User(email="manager@gearvault.com", full_name="Manager User", role="manager")
        self.manager.set_password("password123")
        db.session.add(self.manager)
        db.session.commit()

        # Tokens
        res_c = self.client.post("/api/auth/login", json={"email": "customer@gearvault.com", "password": "password123"})
        cust_token = res_c.get_json()["access_token"]
        self.cust_headers = {"Authorization": f"Bearer {cust_token}"}

        res_m = self.client.post("/api/auth/login", json={"email": "manager@gearvault.com", "password": "password123"})
        mgr_token = res_m.get_json()["access_token"]
        self.mgr_headers = {"Authorization": f"Bearer {mgr_token}"}

        # Seed category
        self.cat = Category(name="Cameras", description="Cinema gear")
        db.session.add(self.cat)
        db.session.commit()

    def tearDown(self):
        db.session.remove()
        db.drop_all()
        self.ctx.pop()

    def test_manager_can_create_item_and_customer_forbidden(self):
        """Manager can add new product (SRS §2.3), customer receives 403."""
        item_payload = {
            "name": "Sony FX6 Cinema Camera",
            "sku": "CAM-FX6",
            "category_id": self.cat.id,
            "purchase_price": 550000.0,
            "replacement_price": 600000.0,
            "purchase_date": "2025-01-10",
            "description": "Full-frame cinema line 4K camera.",
            "image_path": "product_images/Sony FX6.png",
        }

        # 1. Customer attempt -> 403
        c_res = self.client.post("/api/items", json=item_payload, headers=self.cust_headers)
        self.assertEqual(c_res.status_code, 403)

        # 2. Manager attempt -> 201 Created
        m_res = self.client.post("/api/items", json=item_payload, headers=self.mgr_headers)
        self.assertEqual(m_res.status_code, 201)
        created_item = m_res.get_json()["item"]
        self.assertEqual(created_item["name"], "Sony FX6 Cinema Camera")
        self.assertEqual(created_item["sku"], "CAM-FX6")
        self.assertIsNotNone(created_item["daily_rate"])

        # 3. Visible in public catalog
        cat_res = self.client.get("/api/items")
        self.assertEqual(cat_res.status_code, 200)
        items = cat_res.get_json()["items"]
        self.assertTrue(any(i["sku"] == "CAM-FX6" for i in items))

    def test_manager_can_update_and_deactivate_item(self):
        """Manager can update item specs and soft-delete/decommission item."""
        item = Item(
            sku="CAM-FX3",
            name="Sony FX3",
            purchase_price=Decimal("300000.00"),
            replacement_price=Decimal("350000.00"),
            category_id=self.cat.id,
            active=True,
        )
        db.session.add(item)
        db.session.commit()

        # Update
        u_res = self.client.put(
            f"/api/items/{item.id}",
            json={"replacement_price": 380000.0, "name": "Sony FX3 V2"},
            headers=self.mgr_headers,
        )
        self.assertEqual(u_res.status_code, 200)
        self.assertEqual(u_res.get_json()["item"]["name"], "Sony FX3 V2")
        self.assertEqual(u_res.get_json()["item"]["replacement_price"], 380000.0)

        # Deactivate (delete)
        d_res = self.client.delete(f"/api/items/{item.id}", headers=self.mgr_headers)
        self.assertEqual(d_res.status_code, 200)
        self.assertFalse(db.session.get(Item, item.id).active)

    def test_presumed_lost_auto_escalation(self):
        """FR023: Unreturned rentals overdue past 7 days escalate to Presumed Lost."""
        item = Item(
            sku="LENS-50",
            name="50mm Lens",
            purchase_price=Decimal("80000.00"),
            replacement_price=Decimal("95000.00"),
            category_id=self.cat.id,
            active=True,
        )
        db.session.add(item)
        db.session.commit()

        now = datetime.now(timezone.utc)
        # Rental due 8 days ago
        rental = Rental(
            item_id=item.id,
            customer_id=str(self.customer.id),
            checkout_at=now - timedelta(days=12),
            due_at=now - timedelta(days=8),
            status="active",
            total_price=Decimal("5000.00"),
            deposit_held=Decimal("20000.00"),
        )
        db.session.add(rental)
        db.session.commit()

        # Run automated escalation
        escalate_overdue_rentals()

        updated_rental = db.session.get(Rental, rental.id)
        self.assertEqual(updated_rental.status, "presumed_lost")
        assessment = DamageAssessment.query.filter_by(rental_id=rental.id).first()
        self.assertIsNotNone(assessment)
        self.assertEqual(float(assessment.replacement_charge), 95000.0)

        # Check audit log
        audit = FinancialAuditLog.query.filter_by(action="presumed_lost_charge").first()
        self.assertIsNotNone(audit)
        self.assertEqual(float(audit.amount), 95000.0)


if __name__ == "__main__":
    unittest.main()
