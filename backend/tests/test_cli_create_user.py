import os
import unittest
from unittest.mock import patch
from app import create_app
from app.extensions import db
from app.models import User, Role


class TestCreateUserCLI(unittest.TestCase):
    def setUp(self):
        self.app = create_app({"TESTING": True})
        self.runner = self.app.test_cli_runner()

    def test_create_user_success_with_env_password(self):
        """Creates a manager user successfully using NEW_USER_PASSWORD env variable."""
        with patch.dict(os.environ, {"NEW_USER_PASSWORD": "SuperSecretPassword123"}):
            result = self.runner.invoke(
                args=["create-user", "--email", "cli_mgr@gearvault.com", "--full-name", "CLI Manager", "--role", "manager"]
            )
            self.assertEqual(result.exit_code, 0, msg=result.output)
            self.assertIn("Success: Created user 'cli_mgr@gearvault.com'", result.output)

        with self.app.app_context():
            user = User.query.filter_by(email="cli_mgr@gearvault.com").first()
            self.assertIsNotNone(user)
            self.assertEqual(user.full_name, "CLI Manager")
            self.assertEqual(user.role, "manager")
            self.assertTrue(user.check_password("SuperSecretPassword123"))

    def test_create_user_fails_if_email_exists(self):
        """Fails with clear error message if email already exists."""
        with self.app.app_context():
            user = User(email="existing@gearvault.com", full_name="Existing User", role_id=1)
            user.set_password("pass1234")
            db.session.add(user)
            db.session.commit()

        with patch.dict(os.environ, {"NEW_USER_PASSWORD": "NewPassword123"}):
            result = self.runner.invoke(
                args=["create-user", "--email", "existing@gearvault.com", "--full-name", "Existing User", "--role", "customer"]
            )
            self.assertNotEqual(result.exit_code, 0)
            self.assertIn("already exists", result.output)

    def test_create_user_fails_with_invalid_role(self):
        """Fails if role is not one of manager|staff|customer."""
        result = self.runner.invoke(
            args=["create-user", "--email", "badrole@gearvault.com", "--full-name", "Bad Role", "--role", "superadmin"]
        )
        self.assertNotEqual(result.exit_code, 0)
        self.assertIn("Invalid value for '--role'", result.output)


if __name__ == "__main__":
    unittest.main()
