"""Tests for safe CORS configuration in SportsScout AI Service."""

import unittest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).parent.parent))

from server import (
    get_cors_configuration,
    DEFAULT_ALLOWED_ORIGINS,
    DEFAULT_ORIGIN_REGEX,
    app,
)
from starlette.testclient import TestClient


class TestCorsConfiguration(unittest.TestCase):
    def test_default_cors_configuration(self):
        origins, regex = get_cors_configuration()
        self.assertEqual(origins, DEFAULT_ALLOWED_ORIGINS)
        self.assertEqual(regex, DEFAULT_ORIGIN_REGEX)

    def test_explicit_cors_origins_appended(self):
        origins, regex = get_cors_configuration(
            cors_origins="http://10.23.9.219:3000, https://scout.example.com",
        )
        self.assertIn("http://10.23.9.219:3000", origins)
        self.assertIn("https://scout.example.com", origins)
        self.assertIn("http://localhost:3000", origins)
        self.assertEqual(regex, DEFAULT_ORIGIN_REGEX)

    def test_custom_origin_regex_override(self):
        origins, regex = get_cors_configuration(
            cors_origin_regex=r"^https?://.*\.internal:\d+$",
        )
        self.assertEqual(regex, r"^https?://.*\.internal:\d+$")

    def test_localhost_origin_allowed(self):
        client = TestClient(app)
        res = client.get(
            "/api/status",
            headers={"Origin": "http://localhost:3000"},
        )
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.headers.get("access-control-allow-origin"), "http://localhost:3000")

    def test_untrusted_origin_rejected(self):
        client = TestClient(app)
        res = client.get(
            "/api/status",
            headers={"Origin": "http://evil-attacker.com"},
        )
        self.assertEqual(res.status_code, 200)
        # Untrusted origins must NOT receive an Access-Control-Allow-Origin header
        self.assertNotIn("access-control-allow-origin", res.headers)

    def test_pna_header_on_private_network_request(self):
        client = TestClient(app)
        res = client.get(
            "/api/status",
            headers={
                "Origin": "http://localhost:3000",
                "Access-Control-Request-Private-Network": "true",
            },
        )
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.headers.get("access-control-allow-private-network"), "true")

    def test_pna_header_not_added_when_not_requested(self):
        client = TestClient(app)
        res = client.get(
            "/api/status",
            headers={"Origin": "http://localhost:3000"},
        )
        self.assertEqual(res.status_code, 200)
        self.assertNotIn("access-control-allow-private-network", res.headers)


if __name__ == "__main__":
    unittest.main()
