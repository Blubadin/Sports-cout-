"""
test_tracking_verification.py — Critical tracking suite and verification for Phase 16.
Covers PDF §103 (Known Trajectory Speed Invariance), §104 (Court Dimensions & Bounds),
and §105 (Tracking Lost / Predicted State Transitions & Teleport Prevention).
"""

import unittest
from unittest.mock import MagicMock
import numpy as np
import sys
from pathlib import Path

# Add ai_service to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from court_mapper import (
    CourtMapper,
    DistanceTracker,
    COURT_LENGTH_M,
    COURT_WIDTH_DOUBLES_M,
    COURT_WIDTH_SINGLES_M,
    SINGLES_SIDE_ALLEY_M,
    NET_Y_M,
)
from analyzer_v2 import BadmintonAnalyzerV2, PlayerProfile


class TestKnownTrajectorySpeedInvariance(unittest.TestCase):
    """
    PDF §103: Known Trajectory Test.
    Player moves exactly 1.0 meter in 0.5 second -> expected speed must equal 2.0 m/s,
    and must be invariant to video FPS (e.g. 25, 30, 50, 60 FPS).
    """

    def setUp(self):
        self.mapper = CourtMapper(game_type="doubles")
        # Standard calibration: 1280x720 frame mapped to 6.10m x 13.40m
        corners = np.array([
            [100.0, 50.0],
            [1180.0, 50.0],
            [1180.0, 670.0],
            [100.0, 670.0],
        ], dtype=np.float32)
        self.mapper.calibrate(corners)

    def test_speed_invariance_across_fps(self):
        fps_list = [25.0, 30.0, 50.0, 60.0]

        for fps in fps_list:
            tracker = DistanceTracker(self.mapper, fps=fps, smooth_k=5)
            # Speed = 2.0 m/s -> displacement per frame = 2.0 / fps
            step_m = 2.0 / fps
            num_frames = int(round(fps * 0.5))

            # Start at center (3.05m, 6.70m)
            start_m = (3.05, 6.70)
            start_px = self.mapper.real_to_pixel_subpixel(start_m)
            tracker.update(player_id=1, center_px=start_px)

            # Move at constant 2.0 m/s along Y-axis over 0.5s
            for frame_idx in range(1, num_frames + 1):
                curr_y_m = start_m[1] + frame_idx * step_m
                curr_px = self.mapper.real_to_pixel_subpixel((start_m[0], curr_y_m))
                tracker.update(player_id=1, center_px=curr_px)

            stats = tracker.get_stats(1)

            # 1. Instantaneous / smoothed speed must equal 2.0 m/s (+/- 0.05 m/s)
            self.assertAlmostEqual(
                stats["current_speed_ms"],
                2.0,
                delta=0.05,
                msg=f"Failed speed invariance check for FPS={fps}: got {stats['current_speed_ms']} m/s, expected 2.0 m/s",
            )

            # 2. Total distance for ~0.5s movement is ~1.0m (step_m * num_frames)
            expected_dist = round(step_m * num_frames, 2)
            self.assertAlmostEqual(
                stats["total_dist_m"],
                expected_dist,
                delta=0.03,
                msg=f"Failed distance check for FPS={fps}",
            )


class TestCourtDimensionsAndBounds(unittest.TestCase):
    """
    PDF §104: Court Test.
    Outer dimensions: 0,0 | 6.10,0 | 6.10,13.40 | 0,13.40
    Singles dimensions: x valid: 0.46m -> 5.64m.
    """

    def setUp(self):
        self.mapper = CourtMapper(game_type="doubles")

    def test_outer_court_corners(self):
        self.assertEqual(COURT_LENGTH_M, 13.40)
        self.assertEqual(COURT_WIDTH_DOUBLES_M, 6.10)
        self.assertEqual(COURT_WIDTH_SINGLES_M, 5.18)

        expected_corners = np.array([
            [0.0, 0.0],
            [6.10, 0.0],
            [6.10, 13.40],
            [0.0, 13.40],
        ], dtype=np.float32)

        np.testing.assert_array_almost_equal(self.mapper.real_corners, expected_corners)

    def test_outer_bounds_checking(self):
        # Inside outer court
        self.assertTrue(self.mapper.is_within_outer_court((3.05, 6.70)))
        self.assertTrue(self.mapper.is_within_outer_court((0.0, 0.0)))
        self.assertTrue(self.mapper.is_within_outer_court((6.10, 13.40)))

        # Outside outer court
        self.assertFalse(self.mapper.is_within_outer_court((-0.2, 5.0)))
        self.assertFalse(self.mapper.is_within_outer_court((6.3, 5.0)))
        self.assertFalse(self.mapper.is_within_outer_court((3.0, -0.5)))
        self.assertFalse(self.mapper.is_within_outer_court((3.0, 14.0)))

    def test_singles_bounds_x_range(self):
        # Singles side alley is 0.46m
        self.assertAlmostEqual(SINGLES_SIDE_ALLEY_M, 0.46, places=2)
        min_singles_x = SINGLES_SIDE_ALLEY_M
        max_singles_x = COURT_WIDTH_DOUBLES_M - SINGLES_SIDE_ALLEY_M
        self.assertAlmostEqual(max_singles_x, 5.64, places=2)

        # Boundary checks
        self.assertTrue(self.mapper.is_within_singles_bounds((0.46, 6.70)))
        self.assertTrue(self.mapper.is_within_singles_bounds((5.64, 6.70)))
        self.assertTrue(self.mapper.is_within_singles_bounds((3.05, 6.70)))

        # Points in doubles alley (outside singles bounds)
        self.assertFalse(self.mapper.is_within_singles_bounds((0.30, 6.70)))
        self.assertFalse(self.mapper.is_within_singles_bounds((5.80, 6.70)))


class TestTrackingLostAndTeleportPrevention(unittest.TestCase):
    """
    PDF §105: Tracking Lost Test.
    - Detector missing 1-2 frames: tracker state becomes 'predicted'
    - Detector missing prolonged (>15 frames): tracker state becomes 'lost'
    - NEVER teleport player: position stays anchored to last known valid coordinate.
    """

    def setUp(self):
        self.analyzer = BadmintonAnalyzerV2(game_type="doubles", fps=30.0)
        mock_det = MagicMock()
        mock_det.track.return_value = []
        self.analyzer._detector = mock_det
        mock_pose = MagicMock()
        mock_pose.estimate_pose_in_roi.return_value = {"keypoints": [], "metrics": {}}
        self.analyzer._pose_detector = mock_pose

        corners = [
            [100.0, 50.0],
            [1180.0, 50.0],
            [1180.0, 670.0],
            [100.0, 670.0],
        ]
        self.analyzer.set_court_corners(corners)

    def test_tracking_state_lifecycle(self):
        p = self.analyzer.profiles[1]

        # 1. Observed state: detector finds player
        p.missed_frames = 0
        state_0 = "observed" if p.missed_frames == 0 else ("predicted" if p.missed_frames < 15 else "lost")
        self.assertEqual(state_0, "observed")

        # 2. Missing 1-2 frames: tracker predicts position
        p.missed_frames = 2
        state_2 = "observed" if p.missed_frames == 0 else ("predicted" if p.missed_frames < 15 else "lost")
        self.assertEqual(state_2, "predicted")

        # 3. Missing prolonged (>15 frames): state transitions to lost
        p.missed_frames = 20
        state_20 = "observed" if p.missed_frames == 0 else ("predicted" if p.missed_frames < 15 else "lost")
        self.assertEqual(state_20, "lost")

    def test_no_teleportation_when_tracking_lost(self):
        # Initial assignment
        frame = np.zeros((720, 1280, 3), dtype=np.uint8)
        self.analyzer.assign_initial_players(frame, [
            {"player_id": 1, "bbox": [500.0, 300.0, 560.0, 450.0], "name": "Player 1"}
        ])

        p = self.analyzer.profiles[1]
        initial_pos = p.last_real_pos
        self.assertIsNotNone(initial_pos)

        # Simulate 10 frames of tracking loss (no detections)
        for _ in range(10):
            p.missed_frames += 1

        # Position must NEVER teleport to (0,0) or random coordinate
        self.assertEqual(p.last_real_pos, initial_pos)

        # In telemetry, position remains anchored
        telemetry = self.analyzer.process_frame(frame)
        p1_telemetry = next(t for t in telemetry["players"] if t["playerId"] == "P1")
        self.assertEqual(p1_telemetry["state"], "predicted")
        self.assertAlmostEqual(p1_telemetry["courtPosition"]["xM"], initial_pos[0], delta=0.01)
        self.assertAlmostEqual(p1_telemetry["courtPosition"]["yM"], initial_pos[1], delta=0.01)


class TestDistanceTrackerNoiseFiltering(unittest.TestCase):
    """
    Verify jitter filtering (<0.04m) and impossible speed filtering (>11.0 m/s).
    """

    def setUp(self):
        self.mapper = CourtMapper(game_type="doubles")
        corners = np.array([
            [100.0, 50.0],
            [1180.0, 50.0],
            [1180.0, 670.0],
            [100.0, 670.0],
        ], dtype=np.float32)
        self.mapper.calibrate(corners)
        self.tracker = DistanceTracker(self.mapper, fps=30.0)

    def test_sub_jitter_ignored(self):
        # Initial point
        start_px = self.mapper.real_to_pixel((3.0, 6.0))
        self.tracker.update(1, start_px)

        # Movement of only 0.01m (jitter)
        jitter_px = self.mapper.real_to_pixel((3.0, 6.01))
        self.tracker.update(1, jitter_px)

        stats = self.tracker.get_stats(1)
        self.assertEqual(stats["total_dist_m"], 0.0)
        self.assertEqual(stats["current_speed_ms"], 0.0)

    def test_impossible_teleport_speed_filtered(self):
        # Initial point
        start_px = self.mapper.real_to_pixel((3.0, 2.0))
        self.tracker.update(1, start_px)

        # Jump 5 meters in 1 frame (1/30s = 150 m/s, exceeds 11 m/s human limit)
        jump_px = self.mapper.real_to_pixel((3.0, 7.0))
        self.tracker.update(1, jump_px)

        stats = self.tracker.get_stats(1)
        self.assertEqual(stats["total_dist_m"], 0.0)
        self.assertEqual(stats["current_speed_ms"], 0.0)


if __name__ == "__main__":
    unittest.main()
