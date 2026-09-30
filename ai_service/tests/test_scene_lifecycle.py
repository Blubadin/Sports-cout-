import sys
import unittest
from pathlib import Path
from unittest.mock import MagicMock

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).parent.parent))

from analyzer_v2 import BadmintonAnalyzerV2
from calibration_contract import CalibrationContext, CalibrationState
from scene_lifecycle import (
    CameraSegmentLifecycleManager,
    PanTiltZoomDetector,
    SceneEvidence,
    SceneState,
    SceneStateTransition,
)


def court_frame(player_bbox: tuple[int, int, int, int] | None = None) -> np.ndarray:
    """Synthetic court frame with white boundary lines and green surface."""
    frame = np.full((480, 640, 3), (60, 115, 35), dtype=np.uint8)
    for x in (70, 130, 320, 510, 570):
        cv2.line(frame, (x, 35), (x, 445), (230, 230, 230), 3)
    for y in (35, 155, 240, 325, 445):
        cv2.line(frame, (70, y), (570, y), (230, 230, 230), 3)
    if player_bbox is not None:
        x1, y1, x2, y2 = player_bbox
        cv2.rectangle(frame, (x1, y1), (x2, y2), (20, 20, 210), -1)
    return frame


def non_court_frame() -> np.ndarray:
    """Distinct non-court frame simulating a camera cut."""
    frame = np.full((480, 640, 3), (175, 45, 90), dtype=np.uint8)
    for offset in range(-480, 640, 36):
        cv2.line(frame, (offset, 0), (offset + 480, 479), (20, 220, 230), 5)
    return frame


class TestPanTiltZoomDetector(unittest.TestCase):
    def test_static_frame_has_zero_motion(self):
        detector = PanTiltZoomDetector()
        frame = court_frame()
        mag1, is_ptz1, _ = detector.observe(frame)
        self.assertFalse(is_ptz1)
        self.assertEqual(mag1, 0.0)

        mag2, is_ptz2, _ = detector.observe(frame)
        self.assertFalse(is_ptz2)
        self.assertLess(mag2, 0.5)

    def test_moving_player_does_not_trigger_pan_tilt_zoom(self):
        detector = PanTiltZoomDetector()
        detector.observe(court_frame((100, 150, 130, 250)))
        # Player moves across the court while camera is static
        for x in (120, 140, 160, 180, 200):
            mag, is_ptz, reason = detector.observe(court_frame((x, 150, x + 30, 250)))
            self.assertFalse(is_ptz, f"False positive pan/tilt on moving player: {reason}")
            self.assertLess(mag, 1.2)

    def test_horizontal_camera_pan_detected(self):
        detector = PanTiltZoomDetector()
        frame1 = court_frame()
        detector.observe(frame1)

        # Pan camera horizontally by 12 pixels per frame
        M_pan = np.float32([[1, 0, 12], [0, 1, 0]])
        frame2 = cv2.warpAffine(frame1, M_pan, (640, 480))
        mag, is_ptz, reason = detector.observe(frame2)
        self.assertTrue(is_ptz)
        self.assertIn("pan/tilt", reason.lower())
        self.assertGreaterEqual(mag, 1.75)

    def test_camera_zoom_in_detected(self):
        detector = PanTiltZoomDetector()
        frame1 = court_frame()
        detector.observe(frame1)

        # Zoom in by 10% (1.10x)
        M_zoom = cv2.getRotationMatrix2D((320, 240), 0, 1.10)
        frame2 = cv2.warpAffine(frame1, M_zoom, (640, 480))
        mag, is_ptz, reason = detector.observe(frame2)
        self.assertTrue(is_ptz)
        self.assertIn("zoom", reason.lower())


class TestSceneLifecycleAndSegmentManager(unittest.TestCase):
    def setUp(self):
        self.corners = [[70, 35], [570, 35], [570, 445], [70, 445]]
        self.analyzer = BadmintonAnalyzerV2(game_type="singles", max_players=1)
        self.analyzer._detector = "dummy"
        self.analyzer.pose_adapter = MagicMock()
        self.analyzer.pose_adapter.estimate_pose_in_roi.return_value = {
            "keypoints": [(100, 150, 0.9)], "metrics": {},
        }
        self.feet_x = 170
        self.analyzer.detect_and_track = lambda frame: [{
            "bbox": [self.feet_x - 20, 150, self.feet_x + 20, 260],
            "center": (self.feet_x, 260), "conf": 0.9, "track_id": 42,
        }]

    def test_court_to_cut_to_close_up_to_return_to_court(self):
        """Full lifecycle: COURT_PLAY -> Cut -> CLOSE_UP -> Return to COURT_PLAY."""
        # 1. Active calibrated court play
        self.analyzer.set_court_corners(self.corners)
        frame1 = self.analyzer.process_frame(court_frame((150, 150, 190, 260)), timestamp_sec=0.0)
        self.assertEqual(frame1["sceneState"], SceneState.COURT_PLAY.value)
        self.assertEqual(frame1["cameraSegmentId"], "segment-0")
        self.assertTrue(frame1["isMetricValid"])
        self.assertTrue(frame1["allowCanonicalWrites"])
        self.assertIsNotNone(frame1["players"][0]["courtPosition"])

        # 2. Hard camera cut to non-court view
        cut_frame = self.analyzer.process_frame(non_court_frame(), timestamp_sec=0.1)
        self.assertEqual(cut_frame["sceneState"], SceneState.CAMERA_TRANSITION.value)
        self.assertEqual(cut_frame["cameraSegmentId"], "segment-1")
        self.assertFalse(cut_frame["isMetricValid"])
        self.assertFalse(cut_frame["allowCanonicalWrites"])
        self.assertEqual(cut_frame["calibrationState"], CalibrationState.CALIBRATION_LOST.value)
        self.assertIsNone(cut_frame["players"][0]["courtPosition"])
        self.assertIsNone(self.analyzer.court_corners_px)
        self.assertIsNone(self.analyzer.mapper.H)

        # 3. Close-up frame (player bounding box occupies > 20% of the frame)
        # Mock detector returning a huge bounding box occupying 35% of the frame
        self.analyzer.detect_and_track = lambda frame: [{
            "bbox": [100, 50, 540, 430],  # 440x380 = 167200 px out of 307200 px (~54% area)
            "center": (320, 430), "conf": 0.95, "track_id": 42,
        }]
        close_frame = self.analyzer.process_frame(non_court_frame(), timestamp_sec=0.2)
        self.assertEqual(close_frame["sceneState"], SceneState.CLOSE_UP.value)
        self.assertFalse(close_frame["isMetricValid"])
        self.assertFalse(close_frame["allowCanonicalWrites"])
        self.assertIsNone(close_frame["players"][0]["courtPosition"])
        # 2D tracking preserved
        self.assertIsNotNone(close_frame["players"][0]["bboxPct"])

        # 4. Return to court view (new calibration accepted)
        self.feet_x = 200
        self.analyzer.detect_and_track = lambda frame: [{
            "bbox": [self.feet_x - 20, 150, self.feet_x + 20, 260],
            "center": (self.feet_x, 260), "conf": 0.9, "track_id": 42,
        }]
        # First frame returning to court is a cut from non-court to court
        return_cut = self.analyzer.process_frame(court_frame((180, 150, 220, 260)), timestamp_sec=0.3)
        self.assertEqual(return_cut["cameraSegmentId"], "segment-2")
        self.assertFalse(return_cut["isMetricValid"])

        # Calibrate segment-2
        self.analyzer.set_court_corners(self.corners)
        restored = self.analyzer.process_frame(court_frame((180, 150, 220, 260)), timestamp_sec=0.4)
        self.assertEqual(restored["sceneState"], SceneState.COURT_PLAY.value)
        self.assertEqual(restored["cameraSegmentId"], "segment-2")
        self.assertTrue(restored["isMetricValid"])
        self.assertTrue(restored["allowCanonicalWrites"])
        self.assertIsNotNone(restored["players"][0]["courtPosition"])

        # Exit criteria verification:
        self.assertEqual(
            self.analyzer.scene_lifecycle.false_valid_calibration_count, 0,
            "False-valid calibration count must be exactly 0 across cut, transition, and close-up",
        )

    def test_side_play_preserves_2d_tracking_without_metric_extrapolation(self):
        """SIDE_PLAY must continue 2D tracking and pose keypoints while suppressing court metrics."""
        self.analyzer.is_side_view = True
        frame = self.analyzer.process_frame(court_frame(), timestamp_sec=0.0)

        self.assertEqual(frame["sceneState"], SceneState.SIDE_PLAY.value)
        self.assertFalse(frame["isMetricValid"])
        self.assertFalse(frame["allowCanonicalWrites"])

        player = frame["players"][0]
        # 2D tracking and pose preserved
        self.assertEqual(player["trackId"], 42)
        self.assertIsNotNone(player["bboxPct"])
        self.assertIsNotNone(player["groundPointPct"])
        self.assertIsNotNone(player["pose"])

        # Court metrics strictly suppressed (no extrapolation)
        self.assertIsNone(player["courtPosition"])
        self.assertIsNone(player["courtPositionM"])
        self.assertIsNone(player["groundPositionM"])
        self.assertIsNone(player["speedMps"])
        self.assertIsNone(player["absoluteZone"])
        self.assertIsNone(player["playerRelativeZone"])

    def test_pan_tilt_zoom_drift_suspends_metrics_and_invalidates_h(self):
        """Pan/tilt/zoom drift must invalidate calibration, transition state, and suspend metrics."""
        self.analyzer.set_court_corners(self.corners)
        first = self.analyzer.process_frame(court_frame(), timestamp_sec=0.0)
        self.assertEqual(first["sceneState"], SceneState.COURT_PLAY.value)
        self.assertTrue(first["isMetricValid"])

        # Panned frame (shift 14px horizontally)
        M_pan = np.float32([[1, 0, 14], [0, 1, 0]])
        panned_frame = cv2.warpAffine(court_frame(), M_pan, (640, 480))

        drifted = self.analyzer.process_frame(panned_frame, timestamp_sec=0.1)
        self.assertEqual(drifted["sceneState"], SceneState.CAMERA_TRANSITION.value)
        self.assertFalse(drifted["isMetricValid"])
        self.assertFalse(drifted["allowCanonicalWrites"])
        self.assertEqual(drifted["calibrationState"], CalibrationState.CALIBRATION_LOST.value)
        self.assertIsNone(self.analyzer.mapper.H)
        self.assertIsNone(self.analyzer.court_corners_px)
        self.assertIsNone(drifted["players"][0]["courtPosition"])

    def test_replay_protection_prevents_canonical_statistic_duplication(self):
        """Replay observations must NEVER increment canonical match distance or speed."""
        self.analyzer.set_court_corners(self.corners)
        self.analyzer.process_frame(court_frame(), timestamp_sec=0.0)
        self.feet_x = 220
        moved = self.analyzer.process_frame(court_frame(), timestamp_sec=1.0)
        canonical_distance = moved["players"][0]["totalDistanceM"]
        self.assertGreater(canonical_distance, 0.0)

        # Flag replay with manual override provenance
        self.analyzer.set_manual_scene_override(
            state=SceneState.REPLAY,
            override_by="referee_var",
            reason="Broadcaster slow-motion review of smash",
            timestamp_sec=2.0,
        )

        # Process multiple replay frames where players move rapidly
        for step in range(10):
            self.feet_x = 220 + (step * 25)
            rep_frame = self.analyzer.process_frame(court_frame(), timestamp_sec=2.0 + (step * 0.1))
            self.assertEqual(rep_frame["sceneState"], SceneState.REPLAY.value)
            self.assertFalse(rep_frame["isMetricValid"])
            self.assertFalse(rep_frame["allowCanonicalWrites"])
            self.assertTrue(rep_frame["sceneEvidence"]["manual_override"])
            self.assertEqual(rep_frame["sceneEvidence"]["manual_override_by"], "referee_var")
            # Distance must NOT increment during replay
            self.assertEqual(rep_frame["players"][0]["totalDistanceM"], canonical_distance)

        # Clear replay override
        self.analyzer.clear_manual_scene_override()

    def test_delayed_observation_rejection(self):
        """Observations from an older camera segment must be rejected."""
        lifecycle = CameraSegmentLifecycleManager()
        self.assertEqual(lifecycle.camera_segment_id, "segment-0")
        self.assertTrue(lifecycle.is_observation_accepted("segment-0"))
        self.assertFalse(lifecycle.is_observation_accepted("segment-99"))

        # Cut to segment-1
        lifecycle.notify_cut()
        self.assertEqual(lifecycle.camera_segment_id, "segment-1")
        # Delayed packet from segment-0 arrives late
        self.assertFalse(
            lifecycle.is_observation_accepted("segment-0"),
            "Late observation from previous segment must be rejected",
        )
        self.assertTrue(lifecycle.is_observation_accepted("segment-1"))

    def test_unknown_scene_defaults_safely(self):
        """Uncertain/ambiguous scene defaults to UNKNOWN and suspends metrics."""
        lifecycle = CameraSegmentLifecycleManager()
        empty_black = np.zeros((480, 640, 3), dtype=np.uint8)
        transition = lifecycle.evaluate_frame(
            frame=empty_black,
            frame_index=1,
            timestamp_sec=0.1,
            player_bboxes=[],
        )
        self.assertEqual(transition.to_state, SceneState.UNKNOWN)
        self.assertFalse(transition.is_metric_valid)
        self.assertFalse(transition.allow_canonical_writes)


if __name__ == "__main__":
    unittest.main()
