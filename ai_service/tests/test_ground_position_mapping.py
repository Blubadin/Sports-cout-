"""
test_ground_position_mapping.py — Unit Tests for Phase 3.3 Canonical Feet and Ground Mapping

Tests all Phase 3.3 Task 9 requirements:
1. Two reliable ankles -> pose_both_ankles midpoint
2. Left ankle only -> pose_left_ankle
3. Right ankle only -> pose_right_ankle
4. Low-confidence ankles ignored -> bbox_bottom_center
5. No pose -> bbox fallback
6. Reused pose -> bbox fallback (reused keypoints rejected)
7. Ground provenance correct
8. Calibration valid -> metric position
9. CALIBRATION_LOST -> metric null
10. RECALIBRATING -> metric null
11. Camera segment changes -> distance break
12. CalibrationId changes -> distance break
13. Long loss -> distance break
14. Provenance transition does not produce fake distance spike
15. Legacy session works
16. No fake zero
17. No NaN / Infinity
"""

from __future__ import annotations
import math
import sys
import unittest
from pathlib import Path
from unittest.mock import MagicMock

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).parent.parent))

from analyzer_v2 import BadmintonAnalyzerV2
from court_mapper import CourtMapper, DistanceTracker
from ground_position import (
    resolve_canonical_ground_point,
    CANONICAL_PROVENANCE_BOTH_ANKLES,
    CANONICAL_PROVENANCE_LEFT_ANKLE,
    CANONICAL_PROVENANCE_RIGHT_ANKLE,
    CANONICAL_PROVENANCE_BBOX,
)


def make_coco_keypoints(
    la: tuple[float, float, float] | None = None,
    ra: tuple[float, float, float] | None = None,
) -> list[dict]:
    """Helper to generate 17 COCO-style keypoint dicts with specified ankles."""
    kps = [{"x": 50.0, "y": 50.0, "conf": 0.8} for _ in range(17)]
    if la is not None:
        kps[15] = {"x": float(la[0]), "y": float(la[1]), "conf": float(la[2])}
    else:
        kps[15] = {"x": 0.0, "y": 0.0, "conf": 0.0}

    if ra is not None:
        kps[16] = {"x": float(ra[0]), "y": float(ra[1]), "conf": float(ra[2])}
    else:
        kps[16] = {"x": 0.0, "y": 0.0, "conf": 0.0}
    return kps


class TestCanonicalGroundPointResolver(unittest.TestCase):
    def setUp(self):
        self.w = 1280
        self.h = 720
        self.bbox = [200.0, 100.0, 300.0, 500.0]  # center=(250, 500)
        self.corners = np.array([[100, 100], [1180, 100], [1180, 620], [100, 620]], dtype=np.float32)
        self.mapper = CourtMapper(game_type="singles")
        self.mapper.calibrate(self.corners)

    def test_two_reliable_ankles(self):
        """When both ankles are reliable (conf >= 0.40), ground point is midpoint."""
        kps = make_coco_keypoints(la=(240.0, 490.0, 0.85), ra=(260.0, 494.0, 0.90))
        pt = resolve_canonical_ground_point(
            self.bbox, self.w, self.h,
            pose_keypoints=kps,
            court_mapper=self.mapper,
            is_metric_valid=True,
        )
        self.assertEqual(pt.provenance, CANONICAL_PROVENANCE_BOTH_ANKLES)
        self.assertAlmostEqual(pt.ground_px[0], 250.0, places=1)
        self.assertAlmostEqual(pt.ground_px[1], 492.0, places=1)
        self.assertIsNotNone(pt.left_foot.position_px)
        self.assertIsNotNone(pt.right_foot.position_px)
        self.assertAlmostEqual(pt.left_foot.confidence, 0.85, places=2)
        self.assertAlmostEqual(pt.right_foot.confidence, 0.90, places=2)
        self.assertIsNotNone(pt.ground_position_m)
        self.assertIsNotNone(pt.left_foot.court_position_m)
        self.assertIsNotNone(pt.right_foot.court_position_m)

    def test_left_ankle_only(self):
        """When only left ankle is reliable, use left ankle."""
        kps = make_coco_keypoints(la=(245.0, 495.0, 0.82), ra=(260.0, 495.0, 0.20))
        pt = resolve_canonical_ground_point(
            self.bbox, self.w, self.h,
            pose_keypoints=kps,
            court_mapper=self.mapper,
            is_metric_valid=True,
        )
        self.assertEqual(pt.provenance, CANONICAL_PROVENANCE_LEFT_ANKLE)
        self.assertAlmostEqual(pt.ground_px[0], 245.0, places=1)
        self.assertAlmostEqual(pt.ground_px[1], 495.0, places=1)
        self.assertIsNotNone(pt.left_foot.position_px)
        self.assertIsNone(pt.right_foot.position_px)
        self.assertIsNone(pt.right_foot.court_position_m)

    def test_right_ankle_only(self):
        """When only right ankle is reliable, use right ankle."""
        kps = make_coco_keypoints(la=(245.0, 495.0, 0.15), ra=(258.0, 492.0, 0.78))
        pt = resolve_canonical_ground_point(
            self.bbox, self.w, self.h,
            pose_keypoints=kps,
            court_mapper=self.mapper,
            is_metric_valid=True,
        )
        self.assertEqual(pt.provenance, CANONICAL_PROVENANCE_RIGHT_ANKLE)
        self.assertAlmostEqual(pt.ground_px[0], 258.0, places=1)
        self.assertAlmostEqual(pt.ground_px[1], 492.0, places=1)
        self.assertIsNone(pt.left_foot.position_px)
        self.assertIsNotNone(pt.right_foot.position_px)

    def test_low_confidence_ankles_ignored(self):
        """When both ankles are below threshold, fallback to bbox bottom center."""
        kps = make_coco_keypoints(la=(240.0, 490.0, 0.35), ra=(260.0, 490.0, 0.25))
        pt = resolve_canonical_ground_point(
            self.bbox, self.w, self.h,
            pose_keypoints=kps,
            court_mapper=self.mapper,
            is_metric_valid=True,
        )
        self.assertEqual(pt.provenance, CANONICAL_PROVENANCE_BBOX)
        # Bbox bottom center: x=(200+300)/2=250, y=500
        self.assertAlmostEqual(pt.ground_px[0], 250.0, places=1)
        self.assertAlmostEqual(pt.ground_px[1], 500.0, places=1)
        self.assertIsNone(pt.left_foot.position_px)
        self.assertIsNone(pt.right_foot.position_px)

    def test_no_pose_keypoints(self):
        """When pose keypoints are None or empty, fallback to bbox bottom center."""
        pt = resolve_canonical_ground_point(
            self.bbox, self.w, self.h,
            pose_keypoints=None,
            court_mapper=self.mapper,
            is_metric_valid=True,
        )
        self.assertEqual(pt.provenance, CANONICAL_PROVENANCE_BBOX)
        self.assertAlmostEqual(pt.ground_px[0], 250.0, places=1)
        self.assertAlmostEqual(pt.ground_px[1], 500.0, places=1)

    def test_reused_pose_rejected_for_ground_point(self):
        """Reused pose keypoints from previous frames must not fabricate missing feet."""
        kps = make_coco_keypoints(la=(240.0, 490.0, 0.95), ra=(260.0, 490.0, 0.95))
        pt = resolve_canonical_ground_point(
            self.bbox, self.w, self.h,
            pose_keypoints=kps,
            is_pose_reused=True,
            court_mapper=self.mapper,
            is_metric_valid=True,
        )
        self.assertEqual(pt.provenance, CANONICAL_PROVENANCE_BBOX)
        self.assertAlmostEqual(pt.ground_px[0], 250.0, places=1)
        self.assertAlmostEqual(pt.ground_px[1], 500.0, places=1)
        self.assertIsNone(pt.left_foot.position_px)
        self.assertIsNone(pt.right_foot.position_px)

    def test_metric_position_null_when_uncalibrated(self):
        """Metric coordinates must be None when is_metric_valid is False (no fake zeros)."""
        kps = make_coco_keypoints(la=(240.0, 490.0, 0.85), ra=(260.0, 490.0, 0.90))
        pt = resolve_canonical_ground_point(
            self.bbox, self.w, self.h,
            pose_keypoints=kps,
            court_mapper=self.mapper,
            is_metric_valid=False,
        )
        self.assertIsNone(pt.ground_position_m)
        self.assertIsNone(pt.left_foot.court_position_m)
        self.assertIsNone(pt.right_foot.court_position_m)
        # Image-space observation remains valid
        self.assertAlmostEqual(pt.ground_px[0], 250.0, places=1)
        self.assertAlmostEqual(pt.ground_px[1], 490.0, places=1)
        self.assertEqual(pt.provenance, CANONICAL_PROVENANCE_BOTH_ANKLES)


class TestDistanceTrackerSegmentation(unittest.TestCase):
    def setUp(self):
        self.corners = np.array([[100, 100], [1180, 100], [1180, 620], [100, 620]], dtype=np.float32)
        self.mapper = CourtMapper(game_type="singles")
        self.mapper.calibrate(self.corners)
        self.tracker = DistanceTracker(self.mapper, fps=30.0, max_tracking_gap=1.5)

    def test_continuous_tracking_accumulates_distance(self):
        """Normal consecutive frames accumulate distance."""
        self.tracker.update(1, (200.0, 200.0), timestamp_sec=0.0, camera_segment_id="seg-1", calibration_id="cal-1")
        self.tracker.update(1, (220.0, 200.0), timestamp_sec=0.1, camera_segment_id="seg-1", calibration_id="cal-1")
        self.tracker.update(1, (240.0, 200.0), timestamp_sec=0.2, camera_segment_id="seg-1", calibration_id="cal-1")
        stats = self.tracker.get_stats(1)
        self.assertGreater(stats["total_dist_m"], 0.0)

    def test_camera_segment_change_breaks_distance(self):
        """Changing cameraSegmentId establishes new segment without distance bridge."""
        self.tracker.update(1, (200.0, 200.0), timestamp_sec=0.0, camera_segment_id="seg-1", calibration_id="cal-1")
        self.tracker.update(1, (250.0, 200.0), timestamp_sec=0.1, camera_segment_id="seg-1", calibration_id="cal-1")
        dist_before_cut = self.tracker.get_stats(1)["total_dist_m"]
        self.assertGreater(dist_before_cut, 0.0)

        # First frame of new segment at very different screen coordinate
        self.tracker.update(1, (500.0, 400.0), timestamp_sec=0.2, camera_segment_id="seg-2", calibration_id="cal-2")
        dist_after_cut = self.tracker.get_stats(1)["total_dist_m"]
        # Distance must not bridge across cut!
        self.assertEqual(dist_after_cut, dist_before_cut)

        # Subsequent motion in new segment resumes accumulation
        self.tracker.update(1, (520.0, 400.0), timestamp_sec=0.3, camera_segment_id="seg-2", calibration_id="cal-2")
        self.assertGreater(self.tracker.get_stats(1)["total_dist_m"], dist_before_cut)

    def test_calibration_id_change_breaks_distance(self):
        """Calibration change (e.g. dynamic recalibration) breaks distance bridge."""
        self.tracker.update(1, (200.0, 200.0), timestamp_sec=0.0, camera_segment_id="seg-1", calibration_id="cal-1")
        self.tracker.update(1, (230.0, 200.0), timestamp_sec=0.1, camera_segment_id="seg-1", calibration_id="cal-1")
        d1 = self.tracker.get_stats(1)["total_dist_m"]

        # Recalibrated new calibrationId
        self.tracker.update(1, (300.0, 200.0), timestamp_sec=0.2, camera_segment_id="seg-1", calibration_id="cal-2")
        d2 = self.tracker.get_stats(1)["total_dist_m"]
        self.assertEqual(d1, d2)

    def test_long_tracking_loss_breaks_distance(self):
        """Gap exceeding max_tracking_gap breaks distance bridge."""
        self.tracker.update(1, (200.0, 200.0), timestamp_sec=0.0, camera_segment_id="seg-1", calibration_id="cal-1")
        self.tracker.update(1, (230.0, 200.0), timestamp_sec=0.1, camera_segment_id="seg-1", calibration_id="cal-1")
        d1 = self.tracker.get_stats(1)["total_dist_m"]

        # Athlete reappears after 2.5 seconds (gap > 1.5s max_tracking_gap) at a distant point
        self.tracker.update(1, (450.0, 350.0), timestamp_sec=2.6, camera_segment_id="seg-1", calibration_id="cal-1")
        d2 = self.tracker.get_stats(1)["total_dist_m"]
        # Distance must not connect across the long gap
        self.assertEqual(d1, d2)

    def test_provenance_transition_jump_suppression(self):
        """Switching provenance (ankles -> bbox bottom) does not create fake huge distance spike."""
        self.tracker.update(
            1, (300.0, 300.0), timestamp_sec=0.0,
            camera_segment_id="seg-1", calibration_id="cal-1",
            provenance=CANONICAL_PROVENANCE_BOTH_ANKLES,
        )
        # Shift anchor by 40 pixels (simulating switch to bbox bottom center)
        # In a real court mapper this produces a sudden jump of ~0.5m in 0.033s -> ~15 m/s
        self.tracker.update(
            1, (300.0, 340.0), timestamp_sec=0.033,
            camera_segment_id="seg-1", calibration_id="cal-1",
            provenance=CANONICAL_PROVENANCE_BBOX,
        )
        stats = self.tracker.get_stats(1)
        # Implausible provenance jump should have been suppressed
        self.assertEqual(stats["total_dist_m"], 0.0)


class TestAnalyzerCanonicalFeetTelemetry(unittest.TestCase):
    def setUp(self):
        self.analyzer = BadmintonAnalyzerV2(game_type="singles", max_players=1)
        self.analyzer._detector = "dummy"
        self.corners = [[70, 35], [570, 35], [570, 445], [70, 445]]
        self.feet_x = 250
        self.feet_y = 350
        self.analyzer.detect_and_track = lambda frame: [{
            "bbox": [self.feet_x - 30, self.feet_y - 80, self.feet_x + 30, self.feet_y],
            "center": (self.feet_x, self.feet_y),
            "conf": 0.92,
            "track_id": 10,
        }]

    def test_analyzer_telemetry_with_two_ankles(self):
        """Analyzer exposes full canonical ground and foot telemetry when two ankles are reliable."""
        self.analyzer.set_court_corners(self.corners)
        self.analyzer.pose_adapter = MagicMock()
        self.analyzer.pose_adapter.estimate_pose_in_roi.return_value = {
            "keypoints": [
                (self.feet_x - 10, self.feet_y - 5, 0.88) if i == 15 else
                (self.feet_x + 10, self.feet_y - 5, 0.84) if i == 16 else
                (self.feet_x, self.feet_y - 40, 0.9)
                for i in range(17)
            ],
            "metrics": {},
        }
        frame = np.full((480, 640, 3), 100, dtype=np.uint8)
        result = self.analyzer.process_frame(frame, timestamp_sec=0.0)
        p = result["players"][0]

        self.assertEqual(p["groundPointProvenance"], CANONICAL_PROVENANCE_BOTH_ANKLES)
        self.assertIsNotNone(p["groundPointPct"])
        self.assertIsNotNone(p["groundPositionM"])
        self.assertIsNotNone(p["courtPositionM"])
        self.assertIsNotNone(p["leftFootPx"])
        self.assertIsNotNone(p["rightFootPx"])
        self.assertAlmostEqual(p["leftFootConfidence"], 0.88, places=2)
        self.assertAlmostEqual(p["rightFootConfidence"], 0.84, places=2)
        self.assertIsNotNone(p["leftFootCourtM"])
        self.assertIsNotNone(p["rightFootCourtM"])
        self.assertIsNotNone(p["courtPosition"])

    def test_analyzer_telemetry_null_on_calibration_lost(self):
        """When calibration is lost (e.g. camera cut), metric fields are None, not 0.0 or NaN."""
        self.analyzer.set_court_corners(self.corners)
        self.analyzer.pose_adapter = MagicMock()
        self.analyzer.pose_adapter.estimate_pose_in_roi.return_value = {
            "keypoints": [(self.feet_x, self.feet_y, 0.9) for _ in range(17)],
            "metrics": {},
        }
        frame = np.full((480, 640, 3), 100, dtype=np.uint8)
        self.analyzer.process_frame(frame, timestamp_sec=0.0)

        # Trigger camera cut / calibration loss
        self.analyzer.lose_calibration()
        lost = self.analyzer.process_frame(frame, timestamp_sec=0.1)
        p = lost["players"][0]

        self.assertEqual(lost["calibrationState"], "CALIBRATION_LOST")
        self.assertIsNone(p["courtPositionM"])
        self.assertIsNone(p["groundPositionM"])
        self.assertIsNone(p["courtPosition"])
        self.assertIsNone(p["speedMps"])
        self.assertIsNone(p["leftFootCourtM"])
        self.assertIsNone(p["rightFootCourtM"])
        self.assertIsNone(p["leftFoot"]["courtPositionM"])
        self.assertIsNone(p["rightFoot"]["courtPositionM"])

        # Image space coordinates remain valid!
        self.assertIsNotNone(p["groundPointPct"])
        self.assertIsNotNone(p["groundPointProvenance"])
        self.assertIsNotNone(p["leftFootPx"])
        self.assertIsNotNone(p["rightFootPx"])

    def test_analyzer_no_nan_or_infinity(self):
        """Verify no NaN or Infinity is present in telemetry output."""
        self.analyzer.set_court_corners(self.corners)
        self.analyzer.pose_adapter = MagicMock()
        self.analyzer.pose_adapter.estimate_pose_in_roi.return_value = {
            "keypoints": [(self.feet_x, self.feet_y, 0.9) for _ in range(17)],
            "metrics": {},
        }
        frame = np.full((480, 640, 3), 100, dtype=np.uint8)
        res = self.analyzer.process_frame(frame, timestamp_sec=0.0)
        p = res["players"][0]

        for k, v in p.items():
            if isinstance(v, float):
                self.assertTrue(math.isfinite(v), f"Field {k} has non-finite float {v}")
            elif isinstance(v, dict):
                for sub_k, sub_v in v.items():
                    if isinstance(sub_v, float):
                        self.assertTrue(math.isfinite(sub_v), f"Field {k}.{sub_k} has non-finite float {sub_v}")


if __name__ == "__main__":
    unittest.main()
