"""
test_tracking_protocol.py — Unit tests for Phase 5 TrackingTelemetryV1 protocol contract.
"""

import unittest
import numpy as np
import sys
from pathlib import Path

# Add ai_service to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from unittest.mock import MagicMock
from analyzer_v2 import BadmintonAnalyzerV2
from court_mapper import CourtMapper


class TestTrackingProtocolV1(unittest.TestCase):
    def setUp(self):
        self.analyzer = BadmintonAnalyzerV2(game_type="doubles")
        mock_det = MagicMock()
        mock_det.track.return_value = []
        self.analyzer._detector = mock_det
        mock_pose = MagicMock()
        mock_pose.estimate_pose_in_roi.return_value = {"keypoints": [], "metrics": {}}
        self.analyzer._pose_detector = mock_pose

        # 1280x720 frame coordinate court corners
        self.court_corners = [
            [200.0, 100.0],
            [1080.0, 100.0],
            [1080.0, 650.0],
            [200.0, 650.0],
        ]
        self.analyzer.set_court_corners(self.court_corners)

    def test_schema_version_and_metadata(self):
        """Telemetry must include schemaVersion: 1, analysisId, and timestamps."""
        frame = np.zeros((720, 1280, 3), dtype=np.uint8)
        telemetry = self.analyzer.process_frame(frame, timestamp_sec=5.25)

        self.assertEqual(telemetry.get("schemaVersion"), 1)
        self.assertIn("analysisId", telemetry)
        self.assertEqual(telemetry.get("timestampSec"), 5.25)
        self.assertEqual(telemetry.get("frameIndex"), 1)
        self.assertIn("engineVersion", telemetry)
        self.assertIn("modelVersion", telemetry)
        self.assertFalse(telemetry.get("isSynthetic"))
        self.assertEqual(telemetry.get("source"), "real_tracking")

    def test_player_v1_contract(self):
        """Player telemetry must adhere to TrackingPlayerV1 contract."""
        frame = np.zeros((720, 1280, 3), dtype=np.uint8)
        # Assign player 1 with a known bounding box [x1, y1, x2, y2]
        self.analyzer.assign_initial_players(frame, [
            {"player_id": 1, "bbox": [400, 200, 480, 350], "name": "Player 1"}
        ])

        telemetry = self.analyzer.process_frame(frame, timestamp_sec=1.0)
        players = telemetry["players"]
        self.assertEqual(len(players), 4)

        p1 = next(p for p in players if p["playerId"] == "P1")
        self.assertEqual(p1["playerId"], "P1")
        self.assertEqual(p1["teamCode"], "team1")
        self.assertIn("courtPosition", p1)
        self.assertIn("xM", p1["courtPosition"])
        self.assertIn("yM", p1["courtPosition"])
        self.assertIn("xPct", p1["courtPosition"])
        self.assertIn("yPct", p1["courtPosition"])
        self.assertIn("absoluteZone", p1)
        self.assertIn("playerRelativeZone", p1)
        self.assertIn("detectionConfidence", p1)
        self.assertIn("state", p1)
        self.assertIn(p1["state"], ["observed", "predicted", "lost"])

    def test_tracking_state_transition(self):
        """Missed frames must transition state: observed -> predicted -> lost (PDF §105)."""
        frame = np.zeros((720, 1280, 3), dtype=np.uint8)
        self.analyzer.assign_initial_players(frame, [
            {"player_id": 1, "bbox": [400, 200, 480, 350], "name": "Player 1"}
        ])
        p = self.analyzer.profiles[1]

        # Active matched detection -> observed
        self.analyzer.detect_and_track = lambda f: [
            {"bbox": [400, 200, 480, 350], "center": (440.0, 350.0), "conf": 0.95}
        ]
        t1 = self.analyzer.process_frame(frame)
        p1 = next(x for x in t1["players"] if x["playerId"] == "P1")
        self.assertEqual(p1["state"], "observed")

        # Detection lost for 5 frames -> predicted
        self.analyzer.detect_and_track = lambda f: []
        p.missed_frames = 4  # Next frame will make it 5
        t2 = self.analyzer.process_frame(frame)
        p1 = next(x for x in t2["players"] if x["playerId"] == "P1")
        self.assertEqual(p1["state"], "predicted")

        # Detection lost for >15 frames -> lost
        p.missed_frames = 19
        t3 = self.analyzer.process_frame(frame)
        p1 = next(x for x in t3["players"] if x["playerId"] == "P1")
        self.assertEqual(p1["state"], "lost")

    def test_player_relative_zone_symmetry(self):
        """Relative zone must be normalized from player's perspective facing net (PDF §65)."""
        mapper = CourtMapper(game_type="doubles")
        # Top-Left Back: (x=1.5, y=1.0). Absolute is BL.
        # Team 1 faces +y (down towards net). Their right hand points to screen left.
        # So screen left is their right side -> Rear Right (RR).
        top_rel = mapper.get_relative_zone_2d((1.5, 1.0), team=1)
        self.assertEqual(top_rel, "RR")

        # Bottom-Left Back: (x=1.5, y=12.5). Absolute is BL.
        # Team 2 faces -y (up towards net). Their left hand points to screen left.
        # So screen left is their left side -> Rear Left (RL).
        bot_rel = mapper.get_relative_zone_2d((1.5, 12.5), team=2)
        self.assertEqual(bot_rel, "RL")


if __name__ == "__main__":
    unittest.main()
