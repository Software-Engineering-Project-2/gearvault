import unittest
from app import create_app, db
from app.models import User, Role


class TestUploadPresign(unittest.TestCase):
    def setUp(self):
        self.app = create_app({
            "TESTING": True,
            "SQLALCHEMY_DATABASE_URI": "sqlite:///:memory:",
            "JWT_SECRET_KEY": "gearvault-test-secret-key-32-chars-minimum",
        })
        self.client = self.app.test_client()
        self.ctx = self.app.app_context()
        self.ctx.push()

        # Seed roles
        db.create_all()
        for r_id, r_name in [(1, "customer"), (2, "staff"), (3, "manager")]:
            if not db.session.get(Role, r_id):
                db.session.add(Role(id=r_id, name=r_name))

        # Seed users
        self.customer = User(email="customer@gearvault.com", role_id=1)
        self.customer.set_password("pass123")
        self.staff = User(email="staff@gearvault.com", role_id=2)
        self.staff.set_password("pass123")
        self.manager = User(email="manager@gearvault.com", role_id=3)
        self.manager.set_password("pass123")
        db.session.add_all([self.customer, self.staff, self.manager])
        db.session.commit()

        # Logins
        res_c = self.client.post("/api/auth/login", json={"email": "customer@gearvault.com", "password": "pass123"})
        self.cust_headers = {"Authorization": f"Bearer {res_c.get_json()['access_token']}"}

        res_s = self.client.post("/api/auth/login", json={"email": "staff@gearvault.com", "password": "pass123"})
        self.staff_headers = {"Authorization": f"Bearer {res_s.get_json()['access_token']}"}

        res_m = self.client.post("/api/auth/login", json={"email": "manager@gearvault.com", "password": "pass123"})
        self.mgr_headers = {"Authorization": f"Bearer {res_m.get_json()['access_token']}"}

    def tearDown(self):
        db.session.remove()
        db.drop_all()
        self.ctx.pop()

    def test_presign_requires_auth(self):
        res = self.client.post("/api/uploads/presign", json={
            "type": "item",
            "content_type": "image/jpeg"
        })
        self.assertEqual(res.status_code, 401)

    def test_customer_cannot_upload_items_or_condition(self):
        res1 = self.client.post("/api/uploads/presign", headers=self.cust_headers, json={
            "type": "item",
            "content_type": "image/jpeg"
        })
        self.assertEqual(res1.status_code, 403)

        res2 = self.client.post("/api/uploads/presign", headers=self.cust_headers, json={
            "type": "condition",
            "rental_id": 1,
            "content_type": "image/jpeg"
        })
        self.assertEqual(res2.status_code, 403)

    def test_staff_cannot_upload_items(self):
        res = self.client.post("/api/uploads/presign", headers=self.staff_headers, json={
            "type": "item",
            "content_type": "image/jpeg"
        })
        self.assertEqual(res.status_code, 403)

    def test_staff_can_presign_condition_photo(self):
        res = self.client.post("/api/uploads/presign", headers=self.staff_headers, json={
            "type": "condition",
            "rental_id": 42,
            "content_type": "image/png"
        })
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertIn("upload_url", data)
        self.assertIn("key", data)
        self.assertTrue(data["key"].startswith("condition/42/"))
        self.assertTrue(data["key"].endswith(".png"))

    def test_manager_can_presign_item_image(self):
        res = self.client.post("/api/uploads/presign", headers=self.mgr_headers, json={
            "type": "item",
            "content_type": "image/webp"
        })
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertIn("upload_url", data)
        self.assertIn("key", data)
        self.assertTrue(data["key"].startswith("items/"))
        self.assertTrue(data["key"].endswith(".webp"))

    def test_invalid_content_type_rejected(self):
        res = self.client.post("/api/uploads/presign", headers=self.mgr_headers, json={
            "type": "item",
            "content_type": "application/pdf"
        })
        self.assertEqual(res.status_code, 400)
        self.assertIn("Allowed types", res.get_json()["error"])

    def test_exceeded_file_size_rejected(self):
        res = self.client.post("/api/uploads/presign", headers=self.mgr_headers, json={
            "type": "item",
            "content_type": "image/jpeg",
            "file_size": 10 * 1024 * 1024  # 10 MB
        })
        self.assertEqual(res.status_code, 400)
        self.assertIn("exceeds", res.get_json()["error"])
