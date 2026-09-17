"""
test_canonical_provenance.py — Unit tests for Phase 1 canonical tracking data provenance.
Verifies:
1. Unobserved players receive courtPosition: None, never artificial (3.05, 6.70).
2. Missed / lost players receive detectionConfidence: None, not fake confidences.
3. trackId comes strictly from MOT and is never fabricated from playerId.
4. DistanceTracker.get_stats returns None for positions when unobserved.
5. Observed state coverage honesty.
"""

import unittest
from pathlib import Path
import sys
import numpy as np

sys.path.insert(0, str(Path(__file__).parent.parent))

from analyzer_v2 import BadmintonAnalyzerV2
from court_mapper import CourtMapper, DistanceTracker


class TestCanonicalProvenance(unittest.TestCase):
    def setUp(self):
        self.analyzer = BadmintonAnalyzerV2(game_type="singles", max_players=2)
        self.corners = [[100, 100], [700, 100], [700, 500], [100, 500]]
        self.analyzer.set_court_corners(self.corners)

    def test_unobserved_player_court_position_is_none(self):
        """Unobserved players must receive None for courtPosition, never (3.05, 6.70)."""
        frame = np.zeros((600, 800, 3), dtype=np.uint8)
        # Process frame with empty detections (no players observed)
        self.analyzer.detect_and_track = lambda f: []
        telemetry = self.analyzer.process_frame(frame)
        
        self.assertEqual(len(telemetry["players"]), 2)
        for p in telemetry["players"]:
            self.assertIsNone(p["courtPosition"], f"Unobserved player {p['playerId']} must have courtPosition: None")
            self.assertIsNone(p["court_pos_m"])
            self.assertIsNone(p["court_pos_pct"])

    def test_unobserved_player_detection_confidence_is_none(self):
        """Unobserved / missed players must receive None for detectionConfidence, never 0.9, 0.95, or 1.0."""
        frame = np.zeros((600, 800, 3), dtype=np.uint8)
        self.analyzer.detect_and_track = lambda f: []
        telemetry = self.analyzer.process_frame(frame)

        for p in telemetry["players"]:
            self.assertIsNone(p["detectionConfidence"], f"Unobserved player {p['playerId']} must have detectionConfidence: None")

    def test_live_player_statuses_unobserved_integrity(self):
        """get_live_player_statuses must also expose None for unobserved position and confidence."""
        statuses = self.analyzer.get_live_player_statuses()
        self.assertEqual(len(statuses), 2)
        for s in statuses:
            self.assertIsNone(s["courtPosition"], "Live status must have courtPosition: None before first observation")
            self.assertIsNone(s["detectionConfidence"], "Live status must have detectionConfidence: None before first observation")

    def test_track_id_never_fabricated_from_player_id(self):
        """trackId must be None when no MOT trackId exists, never substituted by pid."""
        frame = np.zeros((600, 800, 3), dtype=np.uint8)
        # Detector returns detection without track_id
        self.analyzer.detect_and_track = lambda f: [{
            "bbox": [200, 150, 260, 300],
            "center": (230, 290),
            "conf": 0.88,
            "track_id": None,
            "real_pos": (2.0, 3.0),
        }]
        telemetry = self.analyzer.process_frame(frame)
        p1 = telemetry["players"][0]
        self.assertEqual(p1["playerId"], "P1")
        self.assertIsNone(p1["trackId"], "trackId must remain None if MOT did not provide one; never substitute pid")

    def test_distance_tracker_stats_empty_positions(self):
        """DistanceTracker.get_stats must return None for positions when no updates have occurred."""
        tracker = DistanceTracker(CourtMapper(game_type="doubles"))
        stats = tracker.get_stats(1)
        self.assertEqual(stats, {})

        # After adding entry with no positions
        tracker._data[1] = {
            "positions_m": [],
            "positions_pct": [],
            "speeds_ms": [],
            "raw_speeds": [],
            "total_dist_m": 0.0,
            "max_speed_ms": 0.0,
            "current_speed_ms": 0.0,
            "prev_real": None,
            "prev_time": None,
            "current_zone": "UNKNOWN",
            "zone_dist": {},
        }
        stats = tracker.get_stats(1)
        self.assertIsNone(stats["court_pos_m"])
        self.assertIsNone(stats["court_pos_pct"])
        self.assertEqual(stats["current_zone"], "UNKNOWN")


if __name__ == "__main__":
    unittest.main()
