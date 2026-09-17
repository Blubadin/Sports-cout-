"""
test_player_count.py — Unit tests for Phase 2 Real Dynamic 1-4 Player Tracking.
Covers:
- Dynamic player profiles (1, 2, 3, 4 players)
- No phantom profiles generated
- Validation of player count (1 <= count <= 4)
- Deterministic initial auto-seeding (top/far before bottom/near, then left-to-right)
- Observed team side inference for irregular player counts
- Session API lifecycle with tracked_player_count
"""

import unittest
import numpy as np
import sys
from pathlib import Path
from unittest.mock import Mock

# Add ai_service to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from analyzer_v2 import BadmintonAnalyzerV2, PlayerProfile
from server import app, tracking_sessions
from fastapi.testclient import TestClient


class TestDynamicPlayerCount(unittest.TestCase):
    def test_analyzer_player_count_support(self):
        """Analyzer must support exactly 1, 2, 3, or 4 players without phantom profiles."""
        for count in [1, 2, 3, 4]:
            analyzer = BadmintonAnalyzerV2(game_type="doubles", max_players=count)
            self.assertEqual(analyzer.max_players, count)
            self.assertEqual(len(analyzer.profiles), count)
            self.assertEqual(list(analyzer.profiles.keys()), list(range(1, count + 1)))

    def test_invalid_player_count_rejected(self):
        """Player counts < 1 or > 4 must be rejected with ValueError."""
        with self.assertRaises(ValueError):
            BadmintonAnalyzerV2(max_players=0)
        with self.assertRaises(ValueError):
            BadmintonAnalyzerV2(max_players=5)
        with self.assertRaises(ValueError):
            BadmintonAnalyzerV2(max_players=-1)

    def test_doubles_and_singles_defaults(self):
        """Singles defaults to 2 players, Doubles defaults to 4 players when max_players is None."""
        singles = BadmintonAnalyzerV2(game_type="singles")
        self.assertEqual(singles.max_players, 2)
        self.assertEqual(len(singles.profiles), 2)

        doubles = BadmintonAnalyzerV2(game_type="doubles")
        self.assertEqual(doubles.max_players, 4)
        self.assertEqual(len(doubles.profiles), 4)

    def test_deterministic_auto_seeding_order(self):
        """
        Unassigned profiles must be seeded deterministically:
        1. Top/far court (y < 6.70m) before bottom/near court (y >= 6.70m)
        2. Within each court half, left-to-right (ascending X)
        """
        analyzer = BadmintonAnalyzerV2(game_type="doubles", max_players=4)
        analyzer.set_court_corners([[0, 0], [1280, 0], [1280, 720], [0, 720]])

        # 4 detections scattered on court:
        # D1: Bottom court, right side (x=5.0m, y=10.0m)
        # D2: Top court, right side (x=4.0m, y=2.0m)
        # D3: Bottom court, left side (x=1.5m, y=11.0m)
        # D4: Top court, left side (x=1.0m, y=3.0m)
        # Expected deterministic order:
        # P1 -> D4 (top, x=1.0m)
        # P2 -> D2 (top, x=4.0m)
        # P3 -> D3 (bottom, x=1.5m)
        # P4 -> D1 (bottom, x=5.0m)
        mock_detections = [
            {"bbox": [0, 0, 50, 50], "center": analyzer.mapper.real_to_pixel((5.0, 10.0)), "conf": 0.9, "track_id": 10},
            {"bbox": [0, 0, 50, 50], "center": analyzer.mapper.real_to_pixel((4.0, 2.0)), "conf": 0.85, "track_id": 20},
            {"bbox": [0, 0, 50, 50], "center": analyzer.mapper.real_to_pixel((1.5, 11.0)), "conf": 0.88, "track_id": 30},
            {"bbox": [0, 0, 50, 50], "center": analyzer.mapper.real_to_pixel((1.0, 3.0)), "conf": 0.92, "track_id": 40},
        ]
        analyzer.detect_and_track = Mock(return_value=mock_detections)

        frame = np.zeros((720, 1280, 3), dtype=np.uint8)
        telemetry = analyzer.process_frame(frame)
        players = telemetry["players"]
        self.assertEqual(len(players), 4)

        p1 = next(p for p in players if p["playerId"] == "P1")
        p2 = next(p for p in players if p["playerId"] == "P2")
        p3 = next(p for p in players if p["playerId"] == "P3")
        p4 = next(p for p in players if p["playerId"] == "P4")

        self.assertEqual(p1["trackId"], 40)
        self.assertEqual(p1["courtPosition"]["xM"], 1.0)
        self.assertEqual(p1["teamCode"], "team1")

        self.assertEqual(p2["trackId"], 20)
        self.assertEqual(p2["courtPosition"]["xM"], 4.0)
        self.assertEqual(p2["teamCode"], "team1")

        self.assertEqual(p3["trackId"], 30)
        self.assertEqual(p3["courtPosition"]["xM"], 1.5)
        self.assertEqual(p3["teamCode"], "team2")

        self.assertEqual(p4["trackId"], 10)
        self.assertEqual(p4["courtPosition"]["xM"], 5.0)
        self.assertEqual(p4["teamCode"], "team2")

    def test_irregular_player_count_dynamic_side_inference(self):
        """For 3-player tracking, sides are inferred dynamically from observed court coordinates."""
        analyzer = BadmintonAnalyzerV2(game_type="doubles", max_players=3)
        analyzer.set_court_corners([[0, 0], [1280, 0], [1280, 720], [0, 720]])

        # 3 detections: 2 top court, 1 bottom court
        mock_detections = [
            {"bbox": [0, 0, 50, 50], "center": analyzer.mapper.real_to_pixel((2.0, 2.0)), "conf": 0.9, "track_id": 1},
            {"bbox": [0, 0, 50, 50], "center": analyzer.mapper.real_to_pixel((4.0, 2.0)), "conf": 0.9, "track_id": 2},
            {"bbox": [0, 0, 50, 50], "center": analyzer.mapper.real_to_pixel((3.0, 10.0)), "conf": 0.9, "track_id": 3},
        ]
        analyzer.detect_and_track = Mock(return_value=mock_detections)

        frame = np.zeros((720, 1280, 3), dtype=np.uint8)
        telemetry = analyzer.process_frame(frame)
        self.assertEqual(len(telemetry["players"]), 3)

        p1 = telemetry["players"][0]
        p2 = telemetry["players"][1]
        p3 = telemetry["players"][2]

        self.assertEqual(p1["teamCode"], "team1")
        self.assertEqual(p2["teamCode"], "team1")
        self.assertEqual(p3["teamCode"], "team2")


class TestSessionPlayerCountAPI(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)
        tracking_sessions.clear()

    def test_session_creation_with_tracked_player_count(self):
        """Session creation accepts tracked_player_count and validates 1-4."""
        # Valid 3-player session
        res = self.client.post("/api/tracking/sessions", json={
            "video_source": "demo",
            "game_type": "doubles",
            "tracked_player_count": 3,
        })
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["trackedPlayerCount"], 3)
        sid = data["sessionId"]

        # Status exposes trackedPlayerCount
        status_res = self.client.get(f"/api/tracking/sessions/{sid}/status")
        self.assertEqual(status_res.status_code, 200)
        self.assertEqual(status_res.json()["trackedPlayerCount"], 3)

        # List exposes trackedPlayerCount
        list_res = self.client.get("/api/tracking/sessions")
        self.assertEqual(list_res.status_code, 200)
        session_item = next(s for s in list_res.json()["sessions"] if s["sessionId"] == sid)
        self.assertEqual(session_item["trackedPlayerCount"], 3)

    def test_invalid_session_player_count_rejected(self):
        res = self.client.post("/api/tracking/sessions", json={
            "video_source": "demo",
            "game_type": "singles",
            "tracked_player_count": 5,
        })
        self.assertEqual(res.status_code, 422)


if __name__ == "__main__":
    unittest.main()
