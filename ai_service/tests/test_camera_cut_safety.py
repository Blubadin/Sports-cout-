import sys
import unittest
from pathlib import Path
from unittest.mock import MagicMock

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).parent.parent))

from analyzer_v2 import BadmintonAnalyzerV2
from camera_cut_detector import CameraCutDetector
from fastapi.testclient import TestClient
from server import app, tracking_sessions


def court_frame(player_x: int | None = None) -> np.ndarray:
    frame = np.full((480, 640, 3), (60, 115, 35), dtype=np.uint8)
    for x in (70, 130, 320, 510, 570):
        cv2.line(frame, (x, 35), (x, 445), (230, 230, 230), 3)
    for y in (35, 155, 240, 325, 445):
        cv2.line(frame, (70, y), (570, y), (230, 230, 230), 3)
    if player_x is not None:
        cv2.rectangle(frame, (player_x, 170), (player_x + 28, 270), (20, 20, 210), -1)
    return frame


def replay_frame() -> np.ndarray:
    frame = np.full((480, 640, 3), (175, 45, 90), dtype=np.uint8)
    for offset in range(-480, 640, 36):
        cv2.line(frame, (offset, 0), (offset + 480, 479), (20, 220, 230), 5)
    return frame


class TestCameraCutDetector(unittest.TestCase):
    def test_normal_player_motion_and_static_video_do_not_cut(self):
        detector = CameraCutDetector()
        self.assertFalse(detector.observe(court_frame(100)))
        for x in (115, 130, 145, 160, 175, 190):
            self.assertFalse(detector.observe(court_frame(x)))
        for _ in range(12):
            self.assertFalse(detector.observe(court_frame()))

    def test_hard_cut_changes_segment_once_despite_unstable_frames(self):
        detector = CameraCutDetector()
        detector.observe(court_frame())
        self.assertTrue(detector.observe(replay_frame()))
        for frame in (np.roll(replay_frame(), 12, axis=1), replay_frame(),
                      np.roll(replay_frame(), 24, axis=0)):
            self.assertFalse(detector.observe(frame))

    def test_distinct_later_cut_rearms_after_cooldown(self):
        detector = CameraCutDetector(cooldown_frames=3)
        detector.observe(court_frame())
        self.assertTrue(detector.observe(replay_frame()))
        for _ in range(4):
            self.assertFalse(detector.observe(replay_frame()))
        self.assertTrue(detector.observe(court_frame()))

    def test_return_to_prior_view_during_cooldown_is_another_segment(self):
        detector = CameraCutDetector()
        self.assertFalse(detector.observe(court_frame()))
        self.assertTrue(detector.observe(replay_frame()))
        self.assertTrue(detector.observe(court_frame()))

    def test_major_viewpoint_shift_with_same_court_colors_is_a_cut(self):
        detector = CameraCutDetector()
        detector.observe(court_frame())
        shifted = cv2.warpAffine(
            court_frame(), np.float32([[1, 0, 85], [0, 1, 0]]), (640, 480),
            borderValue=(60, 115, 35),
        )
        self.assertTrue(detector.observe(shifted))

    def test_brightness_change_with_same_structure_is_not_a_cut(self):
        detector = CameraCutDetector()
        detector.observe(court_frame())
        brighter = cv2.convertScaleAbs(court_frame(), alpha=1.0, beta=75)
        self.assertFalse(detector.observe(brighter))

    def test_full_frame_black_to_white_hard_cut(self):
        detector = CameraCutDetector()
        self.assertFalse(detector.observe(np.zeros((480, 640, 3), dtype=np.uint8)))
        self.assertTrue(detector.observe(np.full((480, 640, 3), 255, dtype=np.uint8)))

    def test_large_local_player_motion_is_not_a_cut(self):
        detector = CameraCutDetector()
        first = np.full((480, 640, 3), (60, 115, 35), dtype=np.uint8)
        second = first.copy()
        cv2.rectangle(first, (65, 130), (265, 350), (235, 235, 235), -1)
        cv2.rectangle(second, (285, 130), (485, 350), (235, 235, 235), -1)
        detector.observe(first)
        self.assertFalse(detector.observe(second))


class TestCutCalibrationSafety(unittest.TestCase):
    def setUp(self):
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
        self.shuttle = MagicMock()
        self.shuttle.process_frame.return_value.to_dict.return_value = {
            "positionPx": {"x": 300, "y": 200}, "state": "observed",
        }
        self.analyzer.shuttle_pipeline = self.shuttle
        self.corners = [[70, 35], [570, 35], [570, 445], [70, 445]]

    def test_cut_invalidates_h_before_mapping_and_preserves_image_observations(self):
        self.analyzer.set_court_corners(self.corners)
        first = self.analyzer.process_frame(court_frame(100), timestamp_sec=0.0)
        self.assertEqual(first["cameraSegmentId"], "segment-0")
        self.assertIsNotNone(first["players"][0]["courtPosition"])
        old_calibration = first["calibrationId"]

        lost = self.analyzer.process_frame(replay_frame(), timestamp_sec=0.1)
        self.assertEqual(lost["cameraSegmentId"], "segment-1")
        self.assertEqual(lost["calibrationState"], "CALIBRATION_LOST")
        self.assertIsNone(lost["calibrationId"])
        self.assertIsNone(self.analyzer.mapper.H)
        self.assertIsNone(self.analyzer.mapper.H_inv)
        self.assertEqual(self.analyzer.calibration_context.history[-1].calibration_id, old_calibration)
        player = lost["players"][0]
        self.assertEqual(player["trackId"], 42)
        self.assertIsNotNone(player["bboxPct"])
        self.assertIsNotNone(player["pose"])
        self.assertIsNone(player["courtPosition"])
        self.assertIsNone(player["speedMps"])
        self.assertIsNone(player["absoluteZone"])
        self.assertIsNone(player["playerRelativeZone"])
        self.assertIsNone(player["court_pos_m"])
        self.assertIsNone(player["court_pos_pct"])
        self.assertEqual(lost["shuttle"]["positionPx"], {"x": 300, "y": 200})

        for _ in range(5):
            later = self.analyzer.process_frame(replay_frame(), timestamp_sec=0.2)
            self.assertEqual(later["cameraSegmentId"], "segment-1")

    def test_manual_recalibration_creates_new_identity_without_distance_bridge(self):
        self.analyzer.set_court_corners(self.corners)
        first = self.analyzer.process_frame(court_frame(), timestamp_sec=0.0)
        self.feet_x = 200
        moved = self.analyzer.process_frame(court_frame(), timestamp_sec=1.0)
        previous_distance = moved["players"][0]["totalDistanceM"]
        self.assertGreater(previous_distance, 0)

        self.analyzer.process_frame(replay_frame(), timestamp_sec=2.0)
        lost = self.analyzer.process_frame(replay_frame(), timestamp_sec=3.0)
        self.assertEqual(lost["players"][0]["totalDistanceM"], previous_distance)
        self.feet_x = 470
        self.analyzer.set_court_corners(self.corners)
        restored = self.analyzer.process_frame(replay_frame(), timestamp_sec=4.0)
        self.assertEqual(restored["calibrationState"], "CALIBRATED")
        self.assertEqual(restored["cameraSegmentId"], lost["cameraSegmentId"])
        self.assertNotEqual(restored["calibrationId"], first["calibrationId"])
        self.assertIsNotNone(restored["players"][0]["courtPosition"])
        self.assertEqual(restored["players"][0]["totalDistanceM"], previous_distance)

    def test_cut_discards_pose_reuse_from_previous_view(self):
        self.analyzer.pose_stride = 3
        self.analyzer.set_court_corners(self.corners)
        for index in range(3):
            before = self.analyzer.process_frame(court_frame(), timestamp_sec=index / 30)
        self.assertIsNotNone(before["players"][0]["pose"])
        cut = self.analyzer.process_frame(replay_frame(), timestamp_sec=0.1)
        self.assertEqual(cut["calibrationState"], "CALIBRATION_LOST")
        self.assertIsNone(cut["players"][0].get("pose"))

    def test_cut_with_no_detection_does_not_predict_old_view_bbox(self):
        self.analyzer.set_court_corners(self.corners)
        first = self.analyzer.process_frame(court_frame(), timestamp_sec=0.0)
        self.assertIsNotNone(first["players"][0]["bboxPct"])
        self.analyzer.detect_and_track = lambda frame: []
        cut = self.analyzer.process_frame(replay_frame(), timestamp_sec=0.1)
        player = cut["players"][0]
        self.assertEqual(player["playerId"], "P1")
        self.assertEqual(player["state"], "lost")
        self.assertIsNone(player["bboxPct"])
        self.assertIsNone(player.get("pose"))
        self.assertIsNone(player["trackId"])

    def test_recalibration_rearms_cut_guard_within_cooldown(self):
        self.analyzer.set_court_corners(self.corners)
        self.analyzer.process_frame(court_frame(), timestamp_sec=0.0)
        first_cut = self.analyzer.process_frame(replay_frame(), timestamp_sec=0.1)
        self.assertEqual(first_cut["cameraSegmentId"], "segment-1")
        self.analyzer.set_court_corners(self.corners)
        second_cut = self.analyzer.process_frame(court_frame(), timestamp_sec=0.2)
        self.assertEqual(second_cut["cameraSegmentId"], "segment-2")
        self.assertEqual(second_cut["calibrationState"], "CALIBRATION_LOST")
        self.assertIsNone(second_cut["calibrationId"])

    def test_rapid_second_cut_advances_segment_even_without_recalibration(self):
        self.analyzer.set_court_corners(self.corners)
        self.analyzer.process_frame(court_frame(), timestamp_sec=0.0)
        self.analyzer.process_frame(replay_frame(), timestamp_sec=0.1)
        second_cut = self.analyzer.process_frame(court_frame(), timestamp_sec=0.2)
        self.assertEqual(second_cut["cameraSegmentId"], "segment-2")
        self.assertEqual(second_cut["calibrationState"], "CALIBRATION_LOST")

    def test_static_camera_keeps_calibration_identity(self):
        self.analyzer.set_court_corners(self.corners)
        identities = []
        for index, x in enumerate((100, 115, 130, 145, 160, 175)):
            frame = self.analyzer.process_frame(court_frame(x), timestamp_sec=index / 30)
            identities.append((frame["cameraSegmentId"], frame["calibrationId"], frame["calibrationState"]))
        self.assertEqual(len(set(identities)), 1)

    def test_manual_api_can_recalibrate_lost_processing_session(self):
        tracking_sessions.clear()
        client = TestClient(app)
        try:
            session_id = client.post('/api/tracking/sessions', json={
                "video_source": "demo", "game_type": "singles",
            }).json()["sessionId"]
            session = tracking_sessions[session_id]
            session.analyzer.set_court_corners(self.corners)
            session.analyzer.start_camera_segment()
            session.status = "PROCESSING"
            session.results.append({
                "frameIndex": 1, "timestampSec": 0.1,
                "cameraSegmentId": "segment-1", "calibrationState": "CALIBRATION_LOST",
            })
            stale = client.post(
                f'/api/tracking/sessions/{session_id}/calibration',
                json={"corners": self.corners, "game_type": "singles",
                      "camera_segment_id": "segment-0",
                      "selected_at_frame_index": 1, "selected_at_timestamp_sec": 0.1},
            )
            self.assertEqual(stale.status_code, 409)
            self.assertEqual(session.analyzer.calibration_context.state.value, "CALIBRATION_LOST")
            missing_frame = client.post(
                f'/api/tracking/sessions/{session_id}/calibration',
                json={"corners": self.corners, "game_type": "singles",
                      "camera_segment_id": "segment-1"},
            )
            self.assertEqual(missing_frame.status_code, 409)
            response = client.post(
                f'/api/tracking/sessions/{session_id}/calibration',
                json={"corners": self.corners, "game_type": "singles",
                      "camera_segment_id": "segment-1",
                      "selected_at_frame_index": 1, "selected_at_timestamp_sec": 0.1},
            )
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json()["calibrationState"], "CALIBRATED")
            self.assertEqual(response.json()["cameraSegmentId"], "segment-1")
            self.assertEqual(session.status, "PROCESSING")
        finally:
            tracking_sessions.clear()

    def test_manual_api_recovers_recalibrating_segment_and_rejects_stale_view(self):
        tracking_sessions.clear()
        client = TestClient(app)
        try:
            session_id = client.post('/api/tracking/sessions', json={
                "video_source": "demo", "game_type": "singles",
                "processing_config": {"autoCourtCalibrationEnabled": True},
            }).json()["sessionId"]
            session = tracking_sessions[session_id]
            session.analyzer.set_court_corners(self.corners)
            old_id = session.analyzer.calibration_context.provenance.calibration_id
            session.analyzer.start_camera_segment()
            session.analyzer.calibration_context.begin_recalibration()
            session.status = "PROCESSING"
            session.results.append({
                "frameIndex": 7, "timestampSec": 0.233,
                "cameraSegmentId": "segment-0", "calibrationState": "CALIBRATED",
            })
            session.results.append({
                "frameIndex": 8, "timestampSec": 0.267,
                "cameraSegmentId": "segment-1", "calibrationState": "RECALIBRATING",
            })
            endpoint = f'/api/tracking/sessions/{session_id}/calibration'
            request = {
                "corners": self.corners, "game_type": "singles",
                "camera_segment_id": "segment-1",
                "selected_at_frame_index": 8, "selected_at_timestamp_sec": 0.267,
            }
            stale = client.post(endpoint, json={**request, "camera_segment_id": "segment-0"})
            self.assertEqual(stale.status_code, 409)
            wrong_frame = client.post(endpoint, json={
                **request, "selected_at_frame_index": 7, "selected_at_timestamp_sec": 0.233,
            })
            self.assertEqual(wrong_frame.status_code, 409)
            wrong_time = client.post(endpoint, json={**request, "selected_at_timestamp_sec": 0.5})
            self.assertEqual(wrong_time.status_code, 409)
            self.assertEqual(session.analyzer.calibration_context.state.value, "RECALIBRATING")

            response = client.post(endpoint, json=request)
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json()["calibrationState"], "CALIBRATED")
            self.assertEqual(response.json()["cameraSegmentId"], "segment-1")
            self.assertNotEqual(response.json()["calibrationId"], old_id)
            self.assertEqual(session.status, "PROCESSING")
        finally:
            tracking_sessions.clear()

    def test_manual_override_clears_pending_automatic_streak_and_breaks_distance(self):
        analyzer = BadmintonAnalyzerV2(game_type="singles", max_players=1, auto_calibrate=True)
        analyzer._detector = "dummy"
        analyzer.detect_and_track = lambda frame: [{
            "bbox": [150, 150, 190, 260], "center": (170, 260),
            "conf": 0.9, "track_id": 42,
        }]
        analyzer.set_court_corners(self.corners)
        before = analyzer.process_frame(court_frame(), timestamp_sec=0.0)
        old_id = before["calibrationId"]
        analyzer.start_camera_segment()
        analyzer.begin_recalibration()
        pending = analyzer.auto_calibration_provider.get_candidate(court_frame())
        self.assertIsNotNone(pending)
        self.assertIsNone(analyzer.temporal_stability_validator.observe(pending, "segment-1"))
        self.assertEqual(len(analyzer.temporal_stability_validator.streak), 1)
        analyzer.set_court_corners(self.corners)
        self.assertEqual(analyzer.temporal_stability_validator.streak, [])
        restored = analyzer.process_frame(court_frame(), timestamp_sec=0.1)
        self.assertEqual(restored["calibrationState"], "CALIBRATED")
        self.assertEqual(restored["cameraSegmentId"], "segment-1")
        self.assertNotEqual(restored["calibrationId"], old_id)
        self.assertEqual(restored["players"][0]["totalDistanceM"], before["players"][0]["totalDistanceM"])


if __name__ == "__main__":
    unittest.main()
