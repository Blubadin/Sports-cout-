"""
test_full_frame_pose_association.py — Unit tests for Phase 1.4C Full-Frame Pose Association.

Verifies:
1. Reversed pose result ordering does NOT define player identity (poseResult[0] != P1).
2. Two-player crossing with overlapping bboxes matches deterministically.
3. Outside extra person (spectator/official) is left unassigned and never becomes P1..P4.
4. Missing pose leaves player unmatched and falls back to existing pose reuse behavior.
5. Ambiguous overlap results in optimal 1-to-1 matching without duplicate assignment.
6. Four-player doubles matches all 4 athletes against scrambled pose candidates.
7. Single-player scenario works cleanly.
8. Pose reuse age increments correctly and resets upon fresh detection.
9. Predicted tracker remains predicted (pose never turns predicted -> observed).
10. Unavailable full-frame model raises ModelNotFoundError explicitly.
11. No duplicate pose assignment (each candidate at most one athlete).
"""

from __future__ import annotations
import unittest
from unittest.mock import MagicMock
from pathlib import Path
import sys
import numpy as np

# Ensure ai_service is on sys.path
ai_service_dir = Path(__file__).parent.parent
if str(ai_service_dir) not in sys.path:
    sys.path.insert(0, str(ai_service_dir))

from pose_adapter import (
    FullFramePoseCandidate,
    UltralyticsFullFramePoseAdapter,
    DisabledPoseAdapter,
    create_pose_provider,
)
from pose_association import (
    compute_bbox_iou,
    compute_containment,
    compute_pose_association_cost,
    associate_poses_to_athletes,
)
from engine_config import (
    create_baseline_engine_config,
    ModelNotFoundError,
)
from analyzer_v2 import BadmintonAnalyzerV2


def _make_dummy_keypoints(cx: float, cy: float) -> list[list[float]]:
    """Helper to generate standard 17 COCO keypoints centered near (cx, cy)."""
    kpts = []
    for i in range(17):
        kpts.append([round(cx + (i - 8) * 2.0, 1), round(cy + (i - 8) * 5.0, 1), 0.90])
    return kpts


class TestPoseAssociation(unittest.TestCase):
    """Targeted tests for deterministic pose-to-track association."""

    def test_reversed_pose_result_ordering(self):
        """Pose candidate ordering must NEVER define player identity (poseResult[0] != P1)."""
        tracked_athletes = {
            1: [100.0, 100.0, 200.0, 300.0],  # Left athlete (P1)
            2: [500.0, 100.0, 600.0, 300.0],  # Right athlete (P2)
        }

        cand_left = FullFramePoseCandidate(
            bbox=(102.0, 101.0, 198.0, 299.0),
            keypoints=_make_dummy_keypoints(150.0, 200.0),
            metrics={"trunk_lean_deg": 10.0},
        )
        cand_right = FullFramePoseCandidate(
            bbox=(501.0, 99.0, 599.0, 301.0),
            keypoints=_make_dummy_keypoints(550.0, 200.0),
            metrics={"trunk_lean_deg": 15.0},
        )

        # Standard order: [P1_cand, P2_cand]
        assigned_standard = associate_poses_to_athletes(tracked_athletes, [cand_left, cand_right])
        self.assertEqual(assigned_standard[1], cand_left)
        self.assertEqual(assigned_standard[2], cand_right)

        # Reversed order: [P2_cand, P1_cand] -> MUST yield identical P1/P2 assignments!
        assigned_reversed = associate_poses_to_athletes(tracked_athletes, [cand_right, cand_left])
        self.assertEqual(assigned_reversed[1], cand_left)
        self.assertEqual(assigned_reversed[2], cand_right)

    def test_two_player_crossing(self):
        """Athletes crossing each other with partial overlap match deterministically."""
        # P1 moving right, P2 moving left; boxes partially overlap horizontally
        tracked_athletes = {
            1: [280.0, 200.0, 370.0, 450.0],
            2: [340.0, 200.0, 430.0, 450.0],
        }

        cand_1 = FullFramePoseCandidate(
            bbox=(285.0, 202.0, 372.0, 448.0),
            keypoints=_make_dummy_keypoints(325.0, 325.0),
            metrics={},
        )
        cand_2 = FullFramePoseCandidate(
            bbox=(338.0, 198.0, 432.0, 452.0),
            keypoints=_make_dummy_keypoints(385.0, 325.0),
            metrics={},
        )

        assigned = associate_poses_to_athletes(tracked_athletes, [cand_2, cand_1])
        self.assertEqual(assigned[1], cand_1)
        self.assertEqual(assigned[2], cand_2)

    def test_outside_extra_person(self):
        """Irrelevant outside person (spectator/official) is filtered and never assigned."""
        tracked_athletes = {
            1: [200.0, 300.0, 280.0, 500.0],
            2: [450.0, 300.0, 530.0, 500.0],
        }

        cand_1 = FullFramePoseCandidate(
            bbox=(202.0, 301.0, 279.0, 499.0),
            keypoints=_make_dummy_keypoints(240.0, 400.0),
            metrics={},
        )
        cand_2 = FullFramePoseCandidate(
            bbox=(451.0, 298.0, 529.0, 502.0),
            keypoints=_make_dummy_keypoints(490.0, 400.0),
            metrics={},
        )
        cand_spectator = FullFramePoseCandidate(
            bbox=(1100.0, 50.0, 1180.0, 250.0),  # Far outside court
            keypoints=_make_dummy_keypoints(1140.0, 150.0),
            metrics={},
        )

        assigned = associate_poses_to_athletes(
            tracked_athletes, [cand_spectator, cand_2, cand_1]
        )
        self.assertEqual(len(assigned), 2)
        self.assertEqual(assigned[1], cand_1)
        self.assertEqual(assigned[2], cand_2)
        self.assertNotIn(cand_spectator, assigned.values())

    def test_missing_pose(self):
        """When candidate is missing, detected athlete gets fresh pose; missing athlete remains unassigned."""
        tracked_athletes = {
            1: [150.0, 200.0, 250.0, 400.0],
            2: [450.0, 200.0, 550.0, 400.0],
        }

        cand_1 = FullFramePoseCandidate(
            bbox=(152.0, 198.0, 248.0, 402.0),
            keypoints=_make_dummy_keypoints(200.0, 300.0),
            metrics={},
        )

        # Only cand_1 is detected; P2 pose model missed
        assigned = associate_poses_to_athletes(tracked_athletes, [cand_1])
        self.assertEqual(len(assigned), 1)
        self.assertEqual(assigned[1], cand_1)
        self.assertNotIn(2, assigned)

    def test_ambiguous_overlap(self):
        """Close overlap maintains 1-to-1 matching and avoids ambiguous cross-matching."""
        tracked_athletes = {
            1: [300.0, 250.0, 380.0, 450.0],
            2: [350.0, 250.0, 430.0, 450.0],
        }

        cand_1 = FullFramePoseCandidate(
            bbox=(298.0, 252.0, 382.0, 448.0),
            keypoints=_make_dummy_keypoints(340.0, 350.0),
            metrics={},
        )
        cand_2 = FullFramePoseCandidate(
            bbox=(352.0, 248.0, 428.0, 452.0),
            keypoints=_make_dummy_keypoints(390.0, 350.0),
            metrics={},
        )

        assigned = associate_poses_to_athletes(tracked_athletes, [cand_1, cand_2])
        self.assertEqual(len(assigned), 2)
        self.assertEqual(assigned[1], cand_1)
        self.assertEqual(assigned[2], cand_2)

    def test_no_duplicate_pose_assignment(self):
        """Each candidate matches at most one athlete; second close athlete is left unassigned."""
        tracked_athletes = {
            1: [300.0, 250.0, 380.0, 450.0],
            2: [310.0, 250.0, 390.0, 450.0],  # Close to athlete 1
        }

        # Only one candidate in the vicinity
        single_cand = FullFramePoseCandidate(
            bbox=(302.0, 251.0, 381.0, 449.0),
            keypoints=_make_dummy_keypoints(340.0, 350.0),
            metrics={},
        )

        assigned = associate_poses_to_athletes(tracked_athletes, [single_cand])
        self.assertEqual(len(assigned), 1)
        # Exactly one athlete matched, never both
        self.assertIn(single_cand, assigned.values())

    def test_four_player_doubles(self):
        """Doubles 4-player assignment works correctly with scrambled candidates."""
        tracked_athletes = {
            1: [100.0, 100.0, 180.0, 300.0],
            2: [250.0, 100.0, 330.0, 300.0],
            3: [500.0, 100.0, 580.0, 300.0],
            4: [650.0, 100.0, 730.0, 300.0],
        }

        cand_1 = FullFramePoseCandidate(bbox=(101.0, 99.0, 179.0, 301.0), keypoints=_make_dummy_keypoints(140.0, 200.0), metrics={})
        cand_2 = FullFramePoseCandidate(bbox=(252.0, 101.0, 329.0, 298.0), keypoints=_make_dummy_keypoints(290.0, 200.0), metrics={})
        cand_3 = FullFramePoseCandidate(bbox=(498.0, 100.0, 582.0, 300.0), keypoints=_make_dummy_keypoints(540.0, 200.0), metrics={})
        cand_4 = FullFramePoseCandidate(bbox=(651.0, 98.0, 728.0, 302.0), keypoints=_make_dummy_keypoints(690.0, 200.0), metrics={})

        scrambled = [cand_3, cand_1, cand_4, cand_2]
        assigned = associate_poses_to_athletes(tracked_athletes, scrambled)
        self.assertEqual(len(assigned), 4)
        self.assertEqual(assigned[1], cand_1)
        self.assertEqual(assigned[2], cand_2)
        self.assertEqual(assigned[3], cand_3)
        self.assertEqual(assigned[4], cand_4)

    def test_single_player_singles(self):
        """1-player association works cleanly."""
        tracked_athletes = {
            1: [200.0, 200.0, 300.0, 400.0],
        }
        cand_1 = FullFramePoseCandidate(
            bbox=(205.0, 195.0, 298.0, 402.0),
            keypoints=_make_dummy_keypoints(250.0, 300.0),
            metrics={},
        )
        assigned = associate_poses_to_athletes(tracked_athletes, [cand_1])
        self.assertEqual(len(assigned), 1)
        self.assertEqual(assigned[1], cand_1)


class TestFullFramePoseAnalyzerIntegration(unittest.TestCase):
    """Integration tests for BadmintonAnalyzerV2 with full_frame_pose architecture."""

    def test_unavailable_full_frame_model(self):
        """Unavailable full frame model raises ModelNotFoundError explicitly."""
        adapter = UltralyticsFullFramePoseAdapter(model_path="completely_nonexistent_fullframe_pose.pt")
        frame = np.zeros((480, 640, 3), dtype=np.uint8)
        with self.assertRaises(ModelNotFoundError):
            adapter.estimate_full_frame(frame)

    def test_pose_reuse_age_and_freshness(self):
        """Full-frame pose respects pose_stride, aging, and fresh resets."""
        cfg = create_baseline_engine_config(
            pose_architecture="full_frame_pose",
            pose_stride=2,
            pose_model=None,
        )
        analyzer = BadmintonAnalyzerV2(engine_config=cfg, game_type="singles", max_players=2)
        analyzer.set_court_corners([
            [50.0, 50.0],
            [600.0, 50.0],
            [600.0, 450.0],
            [50.0, 450.0],
        ])

        # Mock detections for 2 players
        analyzer.detect_and_track = lambda f: [
            {"bbox": [100, 100, 200, 300], "center": (150.0, 300.0), "conf": 0.9, "track_id": 1, "real_pos": (2.0, 3.0)},
            {"bbox": [500, 100, 600, 300], "center": (550.0, 300.0), "conf": 0.9, "track_id": 2, "real_pos": (2.0, 10.0)},
        ]

        # Mock full-frame pose candidates
        analyzer._estimate_full_frame_poses = lambda f: [
            FullFramePoseCandidate(bbox=(102, 101, 198, 299), keypoints=_make_dummy_keypoints(150, 200), metrics={}),
            FullFramePoseCandidate(bbox=(501, 99, 599, 301), keypoints=_make_dummy_keypoints(550, 200), metrics={}),
        ]

        frame = np.zeros((480, 640, 3), dtype=np.uint8)

        # Frame 1: scheduled pose frame (analyzed_frame_count=1 % 2 != 0, wait: pose_stride=2 runs when count % 2 == 0)
        t1 = analyzer.process_frame(frame, timestamp_sec=0.033)
        # On count=1, count % 2 == 1, so should_run_pose is False -> initial frame has no pose to reuse
        p1_t1 = next(p for p in t1["players"] if p["playerId"] == "P1")
        self.assertNotIn("pose", p1_t1)

        # Frame 2: count=2 % 2 == 0 -> should_run_pose is True -> fresh pose!
        t2 = analyzer.process_frame(frame, timestamp_sec=0.066)
        p1_t2 = next(p for p in t2["players"] if p["playerId"] == "P1")
        self.assertIn("pose", p1_t2)
        self.assertFalse(p1_t2["pose"]["isReused"])
        self.assertEqual(p1_t2["pose"]["ageFrames"], 0)

        # Frame 3: count=3 % 2 != 0 -> non-scheduled -> reused pose with ageFrames = 1
        t3 = analyzer.process_frame(frame, timestamp_sec=0.099)
        p1_t3 = next(p for p in t3["players"] if p["playerId"] == "P1")
        self.assertIn("pose", p1_t3)
        self.assertTrue(p1_t3["pose"]["isReused"])
        self.assertEqual(p1_t3["pose"]["ageFrames"], 1)

        # Frame 4: count=4 % 2 == 0 -> fresh pose resets ageFrames to 0
        t4 = analyzer.process_frame(frame, timestamp_sec=0.133)
        p1_t4 = next(p for p in t4["players"] if p["playerId"] == "P1")
        self.assertIn("pose", p1_t4)
        self.assertFalse(p1_t4["pose"]["isReused"])
        self.assertEqual(p1_t4["pose"]["ageFrames"], 0)

    def test_predicted_tracker_remains_predicted(self):
        """Pose must NEVER independently turn predicted -> observed or lost -> observed."""
        cfg = create_baseline_engine_config(
            pose_architecture="full_frame_pose",
            pose_stride=1,
            pose_model=None,
        )
        analyzer = BadmintonAnalyzerV2(engine_config=cfg, game_type="singles", max_players=2)
        analyzer.set_court_corners([
            [50.0, 50.0],
            [600.0, 50.0],
            [600.0, 450.0],
            [50.0, 450.0],
        ])

        # Seed P1 and P2 with real observations
        analyzer.detect_and_track = lambda f: [
            {"bbox": [100, 100, 200, 300], "center": (150.0, 300.0), "conf": 0.9, "track_id": 1, "real_pos": (2.0, 3.0)},
            {"bbox": [500, 100, 600, 300], "center": (550.0, 300.0), "conf": 0.9, "track_id": 2, "real_pos": (2.0, 10.0)},
        ]
        analyzer._estimate_full_frame_poses = lambda f: [
            FullFramePoseCandidate(bbox=(100, 100, 200, 300), keypoints=_make_dummy_keypoints(150, 200), metrics={}),
            FullFramePoseCandidate(bbox=(500, 100, 600, 300), keypoints=_make_dummy_keypoints(550, 200), metrics={}),
        ]
        frame = np.zeros((480, 640, 3), dtype=np.uint8)
        t1 = analyzer.process_frame(frame, timestamp_sec=0.033)
        p1_t1 = next(p for p in t1["players"] if p["playerId"] == "P1")
        self.assertEqual(p1_t1["state"], "observed")

        # Frame 2: Detector loses P1 (only P2 detected)
        analyzer.detect_and_track = lambda f: [
            {"bbox": [500, 100, 600, 300], "center": (550.0, 300.0), "conf": 0.9, "track_id": 2, "real_pos": (2.0, 10.0)},
        ]
        # Full-frame pose STILL sees someone near P1's old position
        analyzer._estimate_full_frame_poses = lambda f: [
            FullFramePoseCandidate(bbox=(100, 100, 200, 300), keypoints=_make_dummy_keypoints(150, 200), metrics={}),
            FullFramePoseCandidate(bbox=(500, 100, 600, 300), keypoints=_make_dummy_keypoints(550, 200), metrics={}),
        ]

        t2 = analyzer.process_frame(frame, timestamp_sec=0.066)
        p1_t2 = next(p for p in t2["players"] if p["playerId"] == "P1")
        p2_t2 = next(p for p in t2["players"] if p["playerId"] == "P2")

        # P1 tracker is predicted; full-frame pose must NOT make it observed!
        self.assertEqual(p1_t2["state"], "predicted")
        self.assertEqual(p2_t2["state"], "observed")


if __name__ == "__main__":
    unittest.main()
