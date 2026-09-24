"""
test_analyzer.py — Unit tests for analyzer_v2 and server.py safety constraints.
"""

import unittest
import os
from unittest.mock import patch
import numpy as np
import sys
from pathlib import Path

# Add ai_service to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from analyzer_v2 import BadmintonAnalyzerV2, PlayerProfile
from fastapi.testclient import TestClient
from server import app


class TestBadmintonAnalyzerV2(unittest.TestCase):
    def setUp(self):
        self.analyzer = BadmintonAnalyzerV2(game_type="doubles")
        # Set a synthetic court polygon (in pixels: 100x100 to 700x900)
        self.court_corners = [
            [100.0, 100.0],
            [700.0, 100.0],
            [700.0, 900.0],
            [100.0, 900.0],
        ]
        self.analyzer.set_court_corners(self.court_corners)

    def test_assign_initial_players_feet_contact(self):
        """Initial player assignment must use bottom of bounding box (feet)."""
        frame = np.zeros((1000, 1000, 3), dtype=np.uint8)
        # Bounding box: [x1=200, y1=300, x2=250, y2=450]
        # Bottom edge should be y2 = 450.0 (feet level)
        assignments = [
            {"player_id": 1, "bbox": [200, 300, 250, 450], "name": "Player 1"}
        ]
        self.analyzer.assign_initial_players(frame, assignments)
        
        # Verify tracker center was updated with feet (cx=225, cy=450)
        p1 = self.analyzer.profiles[1]
        self.assertIsNotNone(p1.last_real_pos)
        expected_real = self.analyzer.mapper.pixel_to_real((225.0, 450.0))
        self.assertAlmostEqual(p1.last_real_pos[0], expected_real[0], places=3)
        self.assertAlmostEqual(p1.last_real_pos[1], expected_real[1], places=3)

    def test_point_polygon_rejection(self):
        """Detections far outside court polygon must be rejected by pointPolygonTest."""
        frame = np.zeros((1000, 1000, 3), dtype=np.uint8)
        
        # Mock detect_and_track to return one inside detection and one far outside
        self.analyzer.detect_and_track = lambda f: [
            # Inside court: center (300, 300)
            {"bbox": [280, 200, 320, 300], "center": (300.0, 300.0), "conf": 0.9},
            # Far outside court (e.g. spectator or bench): center (50, 50) is >50px outside [100, 100]
            {"bbox": [40, 20, 60, 50], "center": (50.0, 50.0), "conf": 0.85},
        ]
        
        telemetry = self.analyzer.process_frame(frame)
        self.assertIn("players", telemetry)
        
        # Out of bounds detection should have been rejected from Hungarian matching
        # Profile 1 last position should match the inside detection if matched
        matched_inside = False
        for p in telemetry["players"]:
            if p["bbox"] == [280, 200, 320, 300]:
                matched_inside = True
            # Spectator bbox must NEVER appear in active players
            self.assertNotEqual(p["bbox"], [40, 20, 60, 50])
        self.assertTrue(matched_inside)


class TestServerSafetyEndpoints(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)
        self.client.post("/api/stop")

    def tearDown(self):
        self.client.post("/api/stop")

    def test_status_endpoint(self):
        res = self.client.get("/api/status")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["status"], "online")
        self.assertIn("mode", data)
        self.assertIn("game_type", data)

    def test_capabilities_endpoint_reports_real_runtime_device(self):
        res = self.client.get("/api/capabilities")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertIn(data["selectedDevice"], {"cpu", "cuda", "mps"})
        self.assertIn("cudaAvailable", data)
        self.assertIn("mpsAvailable", data)
        self.assertIn("detectorModel", data)
        self.assertIn("poseModel", data)

    def test_nonexistent_video_does_not_silently_fallback(self):
        """An explicitly enabled direct source still rejects missing files."""
        with patch.dict(os.environ, {"SPORTSCOUT_AI_LEGACY_DIRECT_SOURCES": "true"}):
            res = self.client.post(
                "/api/start",
                json={"video_source": "non_existent_fake_video_12345.mp4", "game_type": "doubles"},
            )
        self.assertEqual(res.status_code, 404)
        self.assertIn("Video file not found", res.json()["detail"])

    def test_explicit_demo_endpoint(self):
        """Explicit demo endpoint must indicate synthetic demo mode."""
        res = self.client.post("/api/demo")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["mode"], "demo")
        self.assertTrue(data["is_synthetic"])

        # Stop tracking
        stop_res = self.client.post("/api/stop")
        self.assertEqual(stop_res.status_code, 200)
        self.assertEqual(stop_res.json()["mode"], "idle")


if __name__ == "__main__":
    unittest.main()
