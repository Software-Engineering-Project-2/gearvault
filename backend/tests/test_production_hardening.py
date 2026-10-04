import os
import unittest
from unittest.mock import patch
from app import create_app
from app.extensions import db


class TestProductionHardening(unittest.TestCase):
    def setUp(self):
        self.app = create_app({"TESTING": True})
        self.client = self.app.test_client()

    def test_liveness_health_endpoint(self):
        """GET /api/health returns 200 without accessing the database."""
        response = self.client.get("/api/health")
        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertEqual(data.get("status"), "ok")
        self.assertEqual(data.get("service"), "GearVault API")

    def test_readiness_health_endpoint(self):
        """GET /api/health/ready returns 200 when database is reachable."""
        response = self.client.get("/api/health/ready")
        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertEqual(data.get("status"), "ready")
        self.assertEqual(data.get("database"), "connected")

    def test_readiness_failure(self):
        """GET /api/health/ready returns 503 when database execution fails."""
        with patch("app.routes.health.db.session.execute", side_effect=Exception("DB connection error")):
            response = self.client.get("/api/health/ready")
            self.assertEqual(response.status_code, 503)
            data = response.get_json()
            self.assertEqual(data.get("status"), "unhealthy")
            self.assertIn("error", data)

    def test_404_json_error_handler(self):
        """Requesting non-existent endpoints returns structured JSON 404."""
        response = self.client.get("/api/nonexistent-route-for-testing")
        self.assertEqual(response.status_code, 404)
        data = response.get_json()
        self.assertEqual(data.get("error"), "Resource not found")

    def test_auth_registration_validation(self):
        """Registration with missing or invalid fields returns 400 validation error."""
        # Missing password
        res = self.client.post("/api/auth/register", json={"email": "valid@email.com"})
        self.assertEqual(res.status_code, 400)
        # Invalid email format
        res = self.client.post("/api/auth/register", json={"email": "not-an-email", "password": "secure123Password!"})
        self.assertEqual(res.status_code, 400)
        # Short password
        res = self.client.post("/api/auth/register", json={"email": "test@test.com", "password": "ab"})
        self.assertEqual(res.status_code, 400)

    def test_auth_login_validation(self):
        """Login with missing fields returns 400 validation error."""
        res = self.client.post("/api/auth/login", json={"email": "test@test.com"})
        self.assertEqual(res.status_code, 400)

    def test_production_missing_jwt_secret_fails(self):
        """Application startup fails if JWT_SECRET_KEY is missing outside testing."""
        with patch.dict(os.environ, {"DATABASE_URL": "postgresql://test:test@localhost:5432/db", "JWT_SECRET_KEY": "", "TESTING": "false"}):
            with self.assertRaises(RuntimeError) as ctx:
                create_app()
            self.assertIn("JWT_SECRET_KEY", str(ctx.exception))

    def test_production_missing_database_url_fails(self):
        """Application startup fails if DATABASE_URL is missing outside testing."""
        with patch.dict(os.environ, {"DATABASE_URL": "", "DATABASE_POOLER_URL": "", "JWT_SECRET_KEY": "secret", "TESTING": "false"}):
            with self.assertRaises(RuntimeError) as ctx:
                create_app()
            self.assertIn("DATABASE_URL", str(ctx.exception))


if __name__ == "__main__":
    unittest.main()
