"""
Tests for Standalone Web Workstation Static Asset Serving & SPA Routing in FastAPI.
"""

import os
import tempfile
import unittest
from pathlib import Path
from fastapi import FastAPI
from fastapi.testclient import TestClient

from ai_service.server import (
    UnsafeWebPathError,
    app,
    _get_web_dist_dir,
    register_web_spa_routes,
    resolve_web_asset,
)

SECRET_MARKER = "SPORTSCOUT_TRAVERSAL_SECRET"


class TestWebSpaPathConfinement(unittest.TestCase):
    """The SPA catch-all must never serve a file outside the web dist directory."""

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        base = Path(self._tmp.name)
        self.dist = base / "dist"
        (self.dist / "assets").mkdir(parents=True)
        (self.dist / "index.html").write_text("<html><body>index</body></html>", encoding="utf-8")
        (self.dist / "assets" / "app.js").write_text("console.log('app');", encoding="utf-8")
        (self.dist / "manifest.webmanifest").write_text("{}", encoding="utf-8")
        (base / "secret.txt").write_text(SECRET_MARKER, encoding="utf-8")

        spa_app = FastAPI()
        register_web_spa_routes(spa_app, self.dist)
        self.client = TestClient(spa_app)

    def tearDown(self):
        self._tmp.cleanup()

    def test_encoded_traversal_requests_are_rejected(self):
        for path in (
            "/..%2fsecret.txt",
            "/%2e%2e/secret.txt",
            "/%2e%2e%2fsecret.txt",
            "/..%5csecret.txt",
            "/nested/..%2f..%2fsecret.txt",
            "/assets/..%2f..%2fsecret.txt",
        ):
            with self.subTest(path=path):
                res = self.client.get(path)
                self.assertEqual(res.status_code, 404)
                self.assertNotIn(SECRET_MARKER, res.text)
                self.assertNotIn("index", res.text)

    def test_absolute_and_drive_paths_are_rejected(self):
        secret = Path(self._tmp.name) / "secret.txt"
        for path in ("/C:%5cWindows%5cwin.ini", "/" + str(secret).replace("\\", "/")):
            with self.subTest(path=path):
                res = self.client.get(path)
                self.assertNotIn(SECRET_MARKER, res.text)

    def test_files_inside_dist_are_served(self):
        res = self.client.get("/manifest.webmanifest")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.text, "{}")
        res = self.client.get("/assets/app.js")
        self.assertEqual(res.status_code, 200)
        self.assertIn("console.log", res.text)

    def test_client_side_routes_fall_back_to_index(self):
        for path in ("/", "/review", "/scout/session/42"):
            with self.subTest(path=path):
                res = self.client.get(path)
                self.assertEqual(res.status_code, 200)
                self.assertIn("index", res.text)

    def test_api_and_ws_paths_are_not_captured(self):
        for path in ("/api/unknown", "/ws", "/ws/other"):
            with self.subTest(path=path):
                res = self.client.get(path)
                self.assertEqual(res.status_code, 404)
                self.assertNotIn("text/html", res.headers.get("content-type", ""))

    def test_resolve_web_asset_contract(self):
        self.assertEqual(resolve_web_asset(self.dist, "assets/app.js"), (self.dist / "assets" / "app.js").resolve())
        self.assertIsNone(resolve_web_asset(self.dist, "missing/route"))
        self.assertIsNone(resolve_web_asset(self.dist, ""))
        for unsafe in ("../secret.txt", "a/../../secret.txt", "..\\secret.txt", "C:/Windows/win.ini", "x\x00y"):
            with self.subTest(path=unsafe):
                with self.assertRaises(UnsafeWebPathError):
                    resolve_web_asset(self.dist, unsafe)

    def test_symlink_escaping_dist_is_rejected(self):
        link = self.dist / "escape.txt"
        try:
            os.symlink(Path(self._tmp.name) / "secret.txt", link)
        except (OSError, NotImplementedError):
            self.skipTest("symlinks are not permitted for this user")
        res = self.client.get("/escape.txt")
        self.assertEqual(res.status_code, 404)
        self.assertNotIn(SECRET_MARKER, res.text)


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
