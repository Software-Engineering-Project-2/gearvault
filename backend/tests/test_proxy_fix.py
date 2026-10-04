import os
import unittest
from flask import request, jsonify
from flask_limiter.util import get_remote_address
from app import create_app


class TestProxyFixConfiguration(unittest.TestCase):
    def setUp(self):
        self.app = create_app({"TESTING": True})
        self.client = self.app.test_client()

    def test_proxy_fix_resolves_client_ip_from_x_forwarded_for(self):
        """ProxyFix with x_for=2 correctly resolves client IP when 2 hops are present."""
        @self.app.route("/api/test-ip")
        def test_ip():
            return jsonify({
                "remote_addr": request.remote_addr,
                "limiter_key": get_remote_address(),
            })

        # Client IP: 203.0.113.195, ALB IP: 10.0.0.1
        response = self.client.get(
            "/api/test-ip",
            headers={"X-Forwarded-For": "203.0.113.195, 10.0.0.1"},
            environ_base={"REMOTE_ADDR": "127.0.0.1"},
        )
        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertEqual(data["remote_addr"], "203.0.113.195")
        self.assertEqual(data["limiter_key"], "203.0.113.195")


if __name__ == "__main__":
    unittest.main()
