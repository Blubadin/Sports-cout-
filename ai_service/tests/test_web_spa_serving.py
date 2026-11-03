"""
Tests for Standalone Web Workstation Static Asset Serving & SPA Routing in FastAPI.
"""

import os
import unittest
from pathlib import Path
from fastapi.testclient import TestClient

from ai_service.server import app, _get_web_dist_dir


class TestWebSpaServing(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)

    def test_status_endpoint_still_functions(self):
        """Ensure /api/status continues to return valid JSON status and is not captured by SPA."""
        res = self.client.get("/api/status")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data.get("status"), "online")
        self.assertIn("device", data)

    def test_unknown_api_endpoint_returns_404_or_401_not_html(self):
        """Ensure unknown /api/* endpoints are NOT redirected to SPA index.html."""
        res = self.client.get("/api/nonexistent_route_12345")
        # Should be 401 (due to bearer security) or 404, never 200 with HTML
        self.assertNotEqual(res.status_code, 200)
        content_type = res.headers.get("content-type", "")
        self.assertNotIn("text/html", content_type)

    def test_root_serves_html_when_dist_exists(self):
        """When dist/ exists, GET / should return 200 with text/html."""
        dist_dir = _get_web_dist_dir()
        if dist_dir and (dist_dir / "index.html").is_file():
            res = self.client.get("/")
            self.assertEqual(res.status_code, 200)
            self.assertIn("text/html", res.headers.get("content-type", ""))
            self.assertIn("<html", res.text.lower())

    def test_client_side_route_serves_index_html(self):
        """When dist/ exists, GET /review or /scout should return 200 with index.html."""
        dist_dir = _get_web_dist_dir()
        if dist_dir and (dist_dir / "index.html").is_file():
            res = self.client.get("/review")
            self.assertEqual(res.status_code, 200)
            self.assertIn("text/html", res.headers.get("content-type", ""))
            self.assertIn("<html", res.text.lower())


if __name__ == "__main__":
    unittest.main()
