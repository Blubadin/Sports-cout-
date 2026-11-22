"""
test_reid_camera_cut_change_of_ends.py — Unit tests for Track 3:
1. Re-ID reacquisition after camera cuts and occlusions without stuck LOST state.
2. Appearance grace period retention and expiration.
3. Change-of-ends detection and seamless court-side topology transition.
4. AGENTS.md Rule 3: Distinct MOT trackId vs SportsScout playerId (P1..P4).
5. dGPU (CUDA) Re-ID acceleration seams.
"""

from __future__ import annotations
import sys
from pathlib import Path
import unittest
from unittest.mock import MagicMock
import cv2
import numpy as np

ai_service_dir = Path(__file__).parent.parent
if str(ai_service_dir) not in sys.path:
    sys.path.insert(0, str(ai_service_dir))

from analyzer_v2 import BadmintonAnalyzerV2, PlayerProfile
from reid_adapter import (
    BaseReIDAdapter,
    SpatialFeatureReIDAdapter,
    MockReIDAdapter,
    create_reid_provider,
)
from semantic_identity import (
    compute_identity_association_cost,
    match_tracks_to_profiles_with_reid,
)
from topology_tracker import CourtSideTopologyTracker, ChangeOfEndsEvent


def make_court_frame() -> np.ndarray:
    frame = np.full((480, 640, 3), (60, 115, 35), dtype=np.uint8)
    for x in (70, 130, 320, 510, 570):
        cv2.line(frame, (x, 35), (x, 445), (230, 230, 230), 3)
    for y in (35, 155, 240, 325, 445):
        cv2.line(frame, (70, y), (570, y), (230, 230, 230), 3)
    return frame


class TestReIDCameraCutChangeOfEnds(unittest.TestCase):
    def setUp(self):
        self.frame = make_court_frame()
        self.corners = [[70, 35], [570, 35], [570, 445], [70, 445]]

    def test_01_reid_reacquisition_after_camera_cut_on_court(self):
        """
        Scenario 1: Camera cut occurs; appearance profile is maintained during grace period.
        When camera cuts back to the court, player is reacquired immediately (no stuck LOST state).
        """
        analyzer = BadmintonAnalyzerV2(game_type="singles", max_players=2)
        analyzer._detector = "dummy"
        mock_reid = MockReIDAdapter()
        analyzer.reid_adapter = mock_reid
        analyzer.set_court_corners(self.corners)

        emb_p1 = np.zeros(128, dtype=np.float32)
        emb_p1[10] = 1.0
        emb_p2 = np.zeros(128, dtype=np.float32)
        emb_p2[20] = 1.0

        # Frame 1: Establish P1 and P2 on court
        analyzer.detect_and_track = lambda _: [
            {"bbox": [150, 150, 190, 260], "center": (170, 260), "conf": 0.95, "track_id": 11},
            {"bbox": [350, 250, 390, 360], "center": (370, 360), "conf": 0.95, "track_id": 22},
        ]
        analyzer.reid_adapter.extract = lambda frame, bbox: (
            emb_p1 if bbox[0] < 250 else emb_p2
        )

        res1 = analyzer.process_frame(self.frame, timestamp_sec=0.0)
        self.assertEqual(res1["players"][0]["playerId"], "P1")
        self.assertEqual(res1["players"][0]["trackId"], 11)
        self.assertEqual(res1["players"][0]["observationState"], "observed")

        # Player profiles now have established appearance
        self.assertTrue(analyzer.profiles[1].identity_established)
        self.assertTrue(analyzer.profiles[1].is_appearance_valid(frame_index=1, timestamp_sec=0.0))

        # Camera Cut (e.g. replay or audience reaction)
        analyzer.start_camera_segment()
        self.assertTrue(analyzer.profiles[1].identity_needs_reacquisition)
        self.assertTrue(analyzer.profiles[1].is_appearance_valid())

        # Camera cuts back to court view with fresh calibration
        analyzer.set_court_corners(self.corners)
        # Tracker returns a new MOT track ID (e.g. 77 instead of 11), but ReID embedding matches P1
        analyzer.detect_and_track = lambda _: [
            {"bbox": [155, 155, 195, 265], "center": (175, 265), "conf": 0.94, "track_id": 77},
        ]
        analyzer.reid_adapter.extract = lambda frame, bbox: emb_p1

        # Process frames until confirmed (camera cut boundary + confirmation frames)
        res_back = None
        for step in range(4):
            res_back = analyzer.process_frame(self.frame, timestamp_sec=1.5 + step * 0.1)

        self.assertIsNotNone(res_back)
        p1_res = res_back["players"][0]
        self.assertEqual(p1_res["playerId"], "P1")
        # Rule 3: MOT trackId (77) is distinct from playerId ("P1")
        self.assertEqual(p1_res["trackId"], 77)
        self.assertNotEqual(p1_res["trackId"], p1_res["playerId"])
        # Crucial: Player is NOT stuck in "lost"
        self.assertEqual(p1_res["observationState"], "observed")
        self.assertEqual(p1_res["state"], "observed")
        self.assertIsNotNone(p1_res["courtPosition"])

    def test_02_appearance_grace_period_retention_and_expiration(self):
        """
        Scenario 2: Appearance profile is valid within grace period (60s / 1800 frames)
        and expires when grace period is exceeded.
        """
        profile = PlayerProfile(player_id=1, team=1)
        profile.identity_established = True
        profile.reid_embedding = np.ones(128, dtype=np.float32) / np.sqrt(128)
        profile.last_seen_frame = 100
        profile.last_seen_timestamp_sec = 10.0
        profile.appearance_grace_frames = 1800
        profile.appearance_grace_sec = 60.0

        # Within grace period: 10s + 30s = 40s (within 60s)
        self.assertTrue(profile.is_appearance_valid(frame_index=1000, timestamp_sec=40.0))

        # Grace period expired: 10s + 75s = 85s (> 60s)
        self.assertFalse(profile.is_appearance_valid(frame_index=1000, timestamp_sec=85.0))
        # Frame limit exceeded: frame 100 + 2000 = 2100 (> 1900)
        self.assertFalse(profile.is_appearance_valid(frame_index=2100, timestamp_sec=40.0))

    def test_03_singles_change_of_ends_topology_tracking(self):
        """
        Scenario 3: Singles match change-of-ends (swapping ends of court).
        P1 and P2 switch sides of the net. Topology tracker detects the inversion,
        updates team/side mapping, and prevents false semantic ID switches.
        """
        analyzer = BadmintonAnalyzerV2(game_type="singles", max_players=2)
        analyzer._detector = "dummy"
        mock_reid = MockReIDAdapter()
        analyzer.reid_adapter = mock_reid
        analyzer.set_court_corners(self.corners)

        emb_p1 = np.zeros(128, dtype=np.float32)
        emb_p1[5] = 1.0
        emb_p2 = np.zeros(128, dtype=np.float32)
        emb_p2[95] = 1.0

        # Initial play: P1 on Top court (Side 1: y ~ 3.0m), P2 on Bottom court (Side 2: y ~ 10.0m)
        analyzer.detect_and_track = lambda _: [
            {"bbox": [150, 80, 190, 180], "center": (170, 180), "conf": 0.95, "track_id": 1, "real_pos": (2.5, 3.0)},
            {"bbox": [150, 300, 190, 400], "center": (170, 400), "conf": 0.95, "track_id": 2, "real_pos": (2.5, 10.0)},
        ]
        analyzer.reid_adapter.extract = lambda frame, bbox: (
            emb_p1 if bbox[1] < 200 else emb_p2
        )

        frame1 = analyzer.process_frame(self.frame, timestamp_sec=0.0)
        self.assertEqual(analyzer.profiles[1].team, 1)
        self.assertEqual(analyzer.profiles[2].team, 2)
        self.assertEqual(frame1["players"][0]["teamCode"], "team1")
        self.assertEqual(frame1["players"][1]["teamCode"], "team2")

        # Now, Change-of-ends occurs!
        # P1 (emb_p1) is now on Bottom court (y ~ 10.0m, track 88)
        # P2 (emb_p2) is now on Top court (y ~ 3.0m, track 99)
        analyzer.detect_and_track = lambda _: [
            {"bbox": [150, 80, 190, 180], "center": (170, 180), "conf": 0.95, "track_id": 99, "real_pos": (2.5, 3.0)},
            {"bbox": [150, 300, 190, 400], "center": (170, 400), "conf": 0.95, "track_id": 88, "real_pos": (2.5, 10.0)},
        ]
        analyzer.reid_adapter.extract = lambda frame, bbox: (
            emb_p2 if bbox[1] < 200 else emb_p1
        )

        initial_sem_switches = analyzer.semantic_player_id_switches

        # Process frames across the swap
        res = None
        any_change_of_ends = False
        for step in range(5):
            res = analyzer.process_frame(self.frame, timestamp_sec=1.0 + step * 0.1)
            if res.get("changeOfEnds"):
                any_change_of_ends = True

        self.assertIsNotNone(res)
        # Verify Change of Ends was detected
        self.assertTrue(any_change_of_ends)
        self.assertGreaterEqual(res["changeOfEndsCount"], 1)

        # P1 is now team2 (Bottom court), P2 is now team1 (Top court)
        p1_data = next(p for p in res["players"] if p["playerId"] == "P1")
        p2_data = next(p for p in res["players"] if p["playerId"] == "P2")
        self.assertEqual(p1_data["teamCode"], "team2")
        self.assertEqual(p2_data["teamCode"], "team1")
        self.assertEqual(p1_data["trackId"], 88)
        self.assertEqual(p2_data["trackId"], 99)

        # Zero accumulated false semantic ID switches
        self.assertEqual(analyzer.semantic_player_id_switches, initial_sem_switches)

    def test_04_doubles_change_of_ends_topology(self):
        """
        Scenario 4: Doubles match (4 players). Team 1 {P1, P2} and Team 2 {P3, P4} switch ends.
        Topology tracker updates player sides without ID switch churn.
        """
        tracker = CourtSideTopologyTracker(game_type="doubles", max_players=4, min_confirmation_frames=2)
        profiles = {
            1: PlayerProfile(1, team=1),
            2: PlayerProfile(2, team=1),
            3: PlayerProfile(3, team=2),
            4: PlayerProfile(4, team=2),
        }

        # Initially: P1, P2 on Side 1; P3, P4 on Side 2
        initial_dets = {
            1: {"real_pos": (1.5, 3.0)},
            2: {"real_pos": (4.0, 3.0)},
            3: {"real_pos": (1.5, 10.0)},
            4: {"real_pos": (4.0, 10.0)},
        }
        event = tracker.observe_and_update(profiles, initial_dets, frame_index=1, timestamp_sec=0.1)
        self.assertIsNone(event)
        self.assertEqual(tracker.player_sides[1], 1)
        self.assertEqual(tracker.player_sides[3], 2)

        # Inverted detections (Change of Ends)
        inverted_dets = {
            1: {"real_pos": (1.5, 10.5)},
            2: {"real_pos": (4.0, 10.5)},
            3: {"real_pos": (1.5, 3.0)},
            4: {"real_pos": (4.0, 3.0)},
        }
        # Frame 1 of inversion: streak = 1 (< 2)
        event1 = tracker.observe_and_update(profiles, inverted_dets, frame_index=2, timestamp_sec=0.2)
        self.assertIsNone(event1)
        # Frame 2 of inversion: streak = 2 (triggers change of ends)
        event2 = tracker.observe_and_update(profiles, inverted_dets, frame_index=3, timestamp_sec=0.3)
        self.assertIsNotNone(event2)
        self.assertEqual(event2.side_mapping[1], 2)
        self.assertEqual(event2.side_mapping[2], 2)
        self.assertEqual(event2.side_mapping[3], 1)
        self.assertEqual(event2.side_mapping[4], 1)
        self.assertEqual(profiles[1].team, 2)
        self.assertEqual(profiles[3].team, 1)

    def test_05_reid_batch_acceleration_and_device(self):
        """
        Scenario 5: SpatialFeatureReIDAdapter batch extraction and similarity batch.
        Verifies batch extraction returns normalized 128-D vectors and handles device cleanly.
        """
        adapter = SpatialFeatureReIDAdapter(model_name="spatial_multi_zone_v1", device="cpu")
        self.assertEqual(adapter.device, "cpu")
        self.assertTrue(adapter.is_enabled)

        bboxes = [
            [50, 50, 120, 200],
            [150, 100, 220, 280],
            [250, 80, 310, 220],
        ]
        embs = adapter.extract_batch(self.frame, bboxes)
        self.assertEqual(len(embs), 3)
        for emb in embs:
            self.assertIsNotNone(emb)
            self.assertEqual(len(emb), 128)
            norm = np.linalg.norm(emb)
            self.assertAlmostEqual(norm, 1.0, places=4)

        # Batch similarity matrix
        stacked = np.stack(embs)
        sim_matrix = adapter.compute_similarity_batch(stacked, stacked)
        self.assertEqual(sim_matrix.shape, (3, 3))
        # Diagonal elements must be ~1.0 (self-similarity)
        for i in range(3):
            self.assertAlmostEqual(sim_matrix[i, i], 1.0, places=3)

    def test_06_rule3_mot_vs_player_id_invariants(self):
        """
        Scenario 6: Invariant verification that MOT trackId is NEVER substituted for playerId.
        trackId must remain distinct from P1..P4 across continuous tracking.
        """
        analyzer = BadmintonAnalyzerV2(game_type="singles", max_players=2)
        analyzer._detector = "dummy"
        analyzer.set_court_corners(self.corners)

        # Detections with MOT track IDs that happen to be numbers
        analyzer.detect_and_track = lambda _: [
            {"bbox": [150, 80, 190, 180], "center": (170, 180), "conf": 0.95, "track_id": 101, "real_pos": (2.5, 3.0)},
            {"bbox": [150, 300, 190, 400], "center": (170, 400), "conf": 0.95, "track_id": 202, "real_pos": (2.5, 10.0)},
        ]
        res = analyzer.process_frame(self.frame, timestamp_sec=0.0)
        p1 = res["players"][0]
        p2 = res["players"][1]

        self.assertEqual(p1["playerId"], "P1")
        self.assertEqual(p1["trackId"], 101)
        self.assertNotEqual(p1["playerId"], p1["trackId"])

        self.assertEqual(p2["playerId"], "P2")
        self.assertEqual(p2["trackId"], 202)
        self.assertNotEqual(p2["playerId"], p2["trackId"])


if __name__ == "__main__":
    unittest.main()
