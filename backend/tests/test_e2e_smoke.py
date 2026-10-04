import os
import unittest
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from unittest.mock import patch

from app import create_app
from app.extensions import db
from app.models import Item, Role, User, Category, DamageType


class TestEndToEndSmokeFlow(unittest.TestCase):
    def setUp(self):
        self.app = create_app({"TESTING": True})
        self.client = self.app.test_client()
        self.runner = self.app.test_cli_runner()

    def test_full_end_to_end_lifecycle(self):
        """
        Executes the full end-to-end smoke test sequence:
        1. register
        2. login
        3. create-user manager via CLI
        4. create booking hold
        5. confirm payment
        6. staff handover
        7. presign upload URL
        8. staff return with condition photo & damage
        9. customer dispute
        10. manager override
        11. manager analytics
        12. manager CSV export
        13. flask jobs run
        """
        # Step 1: Register customer
        reg_res = self.client.post(
            "/api/auth/register",
            json={
                "email": "smoke_customer@gearvault.com",
                "password": "Password123!",
                "full_name": "Smoke Customer",
            },
        )
        self.assertEqual(reg_res.status_code, 201, msg=f"Step 1 Register failed: {reg_res.get_json()}")
        customer_token = reg_res.get_json()["access_token"]
        customer_headers = {"Authorization": f"Bearer {customer_token}"}

        # Step 2: Login customer
        login_res = self.client.post(
            "/api/auth/login",
            json={
                "email": "smoke_customer@gearvault.com",
                "password": "Password123!",
            },
        )
        self.assertEqual(login_res.status_code, 200, msg="Step 2 Login failed")
        self.assertIn("access_token", login_res.get_json())

        # Step 3: Create manager user via CLI `flask create-user`
        with patch.dict(os.environ, {"NEW_USER_PASSWORD": "ManagerPassword123!"}):
            cli_res = self.runner.invoke(
                args=[
                    "create-user",
                    "--email",
                    "smoke_mgr@gearvault.com",
                    "--full-name",
                    "Smoke Manager",
                    "--role",
                    "manager",
                ]
            )
            self.assertEqual(cli_res.exit_code, 0, msg=f"Step 3 CLI create-user failed: {cli_res.output}")

        # Login as manager
        mgr_login = self.client.post(
            "/api/auth/login",
            json={"email": "smoke_mgr@gearvault.com", "password": "ManagerPassword123!"},
        )
        self.assertEqual(mgr_login.status_code, 200)
        mgr_token = mgr_login.get_json()["access_token"]
        mgr_headers = {"Authorization": f"Bearer {mgr_token}"}

        # Setup test catalog item
        with self.app.app_context():
            cat = Category.query.first() or Category(name="Cameras", description="Video Gear")
            db.session.add(cat)
            db.session.commit()
            item = Item(
                sku="SMK-CAM-001",
                name="Sony FX6 Camera",
                purchase_price=Decimal("450000.00"),
                replacement_price=Decimal("500000.00"),
                category_id=cat.id,
                active=True,
            )
            db.session.add(item)
            db.session.commit()
            item_id = item.id

        # Step 4: Create booking hold
        start_ts = (datetime.now(timezone.utc) + timedelta(days=1)).isoformat()
        end_ts = (datetime.now(timezone.utc) + timedelta(days=3)).isoformat()
        hold_res = self.client.post(
            "/api/bookings/hold",
            headers=customer_headers,
            json={
                "item_id": item_id,
                "start_ts": start_ts,
                "end_ts": end_ts,
            },
        )
        self.assertEqual(hold_res.status_code, 201, msg=f"Step 4 Hold failed: {hold_res.get_json()}")
        booking_id = hold_res.get_json()["booking"]["id"]

        # Step 5: Confirm payment
        pay_res = self.client.post(
            f"/api/bookings/{booking_id}/confirm-payment",
            headers=customer_headers,
            json={"provider": "stripe_simulated"},
        )
        self.assertEqual(pay_res.status_code, 200, msg="Step 5 Payment failed")

        # Step 6: Staff / manager handover
        handover_res = self.client.post(
            f"/api/staff/bookings/{booking_id}/handover",
            headers=mgr_headers,
            json={"notes": "Equipment handed over in pristine condition."},
        )
        self.assertEqual(handover_res.status_code, 200, msg="Step 6 Handover failed")
        rental_id = handover_res.get_json()["rental"]["id"]

        # Step 7: Presign upload URL
        presign_res = self.client.post(
            "/api/uploads/presign",
            headers=mgr_headers,
            json={
                "type": "condition",
                "content_type": "image/jpeg",
                "rental_id": rental_id,
                "file_size": 1024 * 500,
            },
        )
        self.assertEqual(presign_res.status_code, 200, msg="Step 7 Presign failed")
        presign_data = presign_res.get_json()
        self.assertIn("upload_url", presign_data)
        photo_key = presign_data["key"]

        # Step 8: Return with condition photo & damage assessment
        with self.app.app_context():
            dt = DamageType.query.first() or DamageType(name="Cosmetic", weight=Decimal("0.10"))
            db.session.add(dt)
            db.session.commit()
            dt_id = dt.id

        return_res = self.client.post(
            f"/api/staff/rentals/{rental_id}/return",
            headers=mgr_headers,
            json={
                "notes": "Returned with scuff on housing.",
                "photo_url": photo_key,
                "has_damage": True,
                "damage_type_id": dt_id,
                "severity": 2,
            },
        )
        self.assertEqual(return_res.status_code, 200, msg=f"Step 8 Return failed: {return_res.get_json()}")
        assessment_id = return_res.get_json()["assessment"]["id"]

        # Step 9: Customer submits dispute
        dispute_res = self.client.post(
            f"/api/rentals/{rental_id}/dispute",
            headers=customer_headers,
            json={"reason": "Scuff was already present prior to checkout."},
        )
        self.assertEqual(dispute_res.status_code, 200, msg="Step 9 Dispute failed")

        # Step 10: Manager dispute override
        override_res = self.client.post(
            f"/api/manager/disputes/{assessment_id}/override",
            headers=mgr_headers,
            json={
                "override_amount": 0.0,
                "manager_notes": "Pre-existing wear verified from inventory archives.",
            },
        )
        self.assertEqual(override_res.status_code, 200, msg="Step 10 Override failed")

        # Step 11: Manager analytics API
        analytics_res = self.client.get("/api/manager/analytics", headers=mgr_headers)
        self.assertEqual(analytics_res.status_code, 200, msg="Step 11 Analytics failed")
        adata = analytics_res.get_json()
        self.assertIn("summary", adata)
        self.assertIn("total_revenue", adata["summary"])

        # Step 12: Manager monthly CSV export
        csv_res = self.client.get("/api/manager/reports/monthly-csv", headers=mgr_headers)
        self.assertEqual(csv_res.status_code, 200, msg="Step 12 CSV failed")
        self.assertEqual(csv_res.mimetype, "text/csv")
        csv_text = csv_res.get_data(as_text=True)
        self.assertIn("Rental_ID,Booking_ID,Item_Name", csv_text)
        self.assertIn("SMK-CAM-001", csv_text)

        # Step 13: Background maintenance jobs (`flask jobs run`)
        jobs_res = self.runner.invoke(args=["jobs", "run"])
        self.assertEqual(jobs_res.exit_code, 0, msg=f"Step 13 jobs run failed: {jobs_res.output}")
        self.assertIn("Expired", jobs_res.output)
        self.assertIn("Escalated", jobs_res.output)


if __name__ == "__main__":
    unittest.main()
