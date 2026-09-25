import sys
import unittest
from pathlib import Path
from unittest.mock import MagicMock

import numpy as np

sys.path.insert(0, str(Path(__file__).parent.parent))

from analyzer_v2 import BadmintonAnalyzerV2, PlayerProfile
from calibration_contract import CalibrationProvenance, CalibrationSource
from semantic_identity import match_tracks_to_profiles_with_reid
from fastapi.testclient import TestClient
from server import app, tracking_sessions


class TestCalibrationContract(unittest.TestCase):
    def setUp(self):
        self.analyzer = BadmintonAnalyzerV2(game_type="singles", max_players=1)
        self.analyzer._detector = "dummy"
        pose = MagicMock()
        pose.estimate_pose_in_roi.return_value = {"keypoints": [(25, 30, 0.9)], "metrics": {}}
        self.analyzer.pose_adapter = pose
        self.analyzer.detect_and_track = lambda frame: [{
            "bbox": [100, 100, 150, 200], "center": (125, 200),
            "conf": 0.9, "track_id": 42,
        }]
        self.frame = np.zeros((500, 700, 3), dtype=np.uint8)
        self.corners = [[50, 50], [600, 50], [600, 450], [50, 450]]

    def test_new_calibration_has_segment_identity_and_unknown_quality(self):
        before = self.analyzer.process_frame(self.frame, timestamp_sec=0.0)
        self.assertEqual(before["calibrationState"], "UNCALIBRATED")
        self.assertIsNone(before["players"][0]["courtPosition"])
        self.assertIsNone(before["players"][0]["speedMps"])
        self.assertIsNone(before["players"][0]["totalDistanceM"])
        self.assertEqual(before["players"][0]["state"], "observed")
        self.assertEqual(before["players"][0]["detectionConfidence"], 0.9)
        self.assertIsNone(self.analyzer.profiles[1].last_real_pos)

        self.analyzer.set_court_corners(self.corners, created_at_frame=1, created_at_timestamp_sec=0.1)
        first = self.analyzer.process_frame(self.frame, timestamp_sec=0.1)
        provenance = first["calibration"]
        self.assertEqual(first["calibrationState"], "CALIBRATED")
        self.assertEqual(first["calibrationId"], provenance["calibrationId"])
        self.assertEqual(first["cameraSegmentId"], provenance["cameraSegmentId"])
        self.assertEqual(provenance["source"], "manual")
        self.assertEqual(provenance["createdAtFrame"], 1)
        self.assertEqual(provenance["createdAtTimestampSec"], 0.1)
        self.assertIsNone(provenance["confidence"])
        self.assertIsNone(provenance["reprojectionErrorPx"])
        self.assertIsNotNone(first["players"][0]["courtPosition"])

        self.analyzer.set_court_corners(self.corners)
        second = self.analyzer.process_frame(self.frame, timestamp_sec=0.2)
        self.assertNotEqual(first["calibrationId"], second["calibrationId"])
        self.assertEqual(first["cameraSegmentId"], second["cameraSegmentId"])

    def test_lost_calibration_preserves_image_observations_and_pauses_metrics(self):
        self.analyzer.set_court_corners(self.corners)
        calibrated = self.analyzer.process_frame(self.frame, timestamp_sec=0.1)
        distance = calibrated["players"][0]["totalDistanceM"]
        old_segment = calibrated["cameraSegmentId"]
        old_calibration = calibrated["calibrationId"]

        self.analyzer.start_camera_segment()
        shuttle = MagicMock()
        shuttle.process_frame.return_value.to_dict.return_value = {
            "positionPx": {"x": 120, "y": 80}, "state": "observed",
        }
        self.analyzer.shuttle_pipeline = shuttle
        lost = self.analyzer.process_frame(self.frame, timestamp_sec=0.2)
        player = lost["players"][0]
        self.assertEqual(lost["calibrationState"], "CALIBRATION_LOST")
        self.assertNotEqual(lost["cameraSegmentId"], old_segment)
        self.assertIsNone(lost["calibrationId"])
        self.assertIsNone(player["courtPosition"])
        self.assertIsNone(player["speedMps"])
        self.assertIsNone(player["absoluteZone"])
        self.assertEqual(player["totalDistanceM"], distance)
        self.assertIsNotNone(player["bboxPct"])
        self.assertIsNotNone(player["pose"])
        self.assertEqual(player["trackId"], 42)
        self.assertEqual(lost["shuttle"]["positionPx"], {"x": 120, "y": 80})

        self.analyzer.set_court_corners(self.corners)
        restored = self.analyzer.process_frame(self.frame, timestamp_sec=0.3)
        self.assertNotEqual(restored["calibrationId"], old_calibration)
        self.assertEqual(restored["cameraSegmentId"], lost["cameraSegmentId"])
        self.assertEqual(restored["players"][0]["totalDistanceM"], distance)

    def test_invalid_recalibration_does_not_replace_accepted_identity(self):
        self.analyzer.set_court_corners(self.corners)
        previous = self.analyzer.calibration_context.frame_fields()
        previous_h = self.analyzer.mapper.H.copy()
        shifted = [[x + 10, y] for x, y in self.corners]
        with self.assertRaises(ValueError):
            self.analyzer.set_court_corners(shifted, confidence=2.0)
        self.assertEqual(self.analyzer.calibration_context.frame_fields(), previous)
        np.testing.assert_array_equal(self.analyzer.mapper.H, previous_h)

    def test_lost_state_keeps_historical_provenance_without_current_confidence(self):
        self.analyzer.set_court_corners(self.corners, source='automatic', confidence=0.8)
        accepted_id = self.analyzer.calibration_context.provenance.calibration_id
        self.analyzer.lose_calibration()
        lost = self.analyzer.process_frame(self.frame, timestamp_sec=0.1)
        self.assertEqual(lost["calibrationState"], "CALIBRATION_LOST")
        self.assertEqual(lost["calibrationId"], accepted_id)
        self.assertIsNone(lost["calibrationConfidence"])
        self.assertEqual(lost["calibration"]["confidence"], 0.8)
        self.assertIsNone(lost["players"][0]["courtPosition"])

    def test_api_returns_the_same_identity_as_telemetry(self):
        tracking_sessions.clear()
        client = TestClient(app)
        response = client.post('/api/tracking/sessions', json={"video_source": "demo", "game_type": "singles"})
        session_id = response.json()["sessionId"]
        calibrated = client.post(
            f'/api/tracking/sessions/{session_id}/calibration',
            json={"corners": self.corners, "game_type": "singles"},
        )
        self.assertEqual(calibrated.status_code, 200)
        identity = calibrated.json()
        self.assertEqual(identity["calibrationState"], "CALIBRATED")
        self.assertIsNone(identity["calibrationConfidence"])
        session = tracking_sessions[session_id]
        session.analyzer.detect_and_track = self.analyzer.detect_and_track
        session.analyzer._detector = "dummy"
        session.results.append(session.analyzer.process_frame(self.frame, timestamp_sec=0.0))
        result = client.get(f'/api/tracking/sessions/{session_id}/results').json()
        telemetry = result["telemetry"][0]
        self.assertEqual(telemetry["cameraSegmentId"], identity["cameraSegmentId"])
        self.assertEqual(telemetry["calibrationId"], identity["calibrationId"])
        self.assertEqual(telemetry["calibration"], identity["calibration"])
        tracking_sessions.clear()

    def test_manual_api_rejects_unmeasured_quality_claims(self):
        tracking_sessions.clear()
        client = TestClient(app)
        session_id = client.post('/api/tracking/sessions', json={"video_source": "demo"}).json()["sessionId"]
        response = client.post(
            f'/api/tracking/sessions/{session_id}/calibration',
            json={"corners": self.corners, "confidence": 1.0, "reprojectionErrorPx": 0.0},
        )
        self.assertEqual(response.status_code, 422)
        self.assertEqual(tracking_sessions[session_id].analyzer.calibration_context.state.value, "UNCALIBRATED")
        tracking_sessions.clear()

    def test_manual_analyzer_rejects_unmeasured_quality_claims(self):
        with self.assertRaises(ValueError):
            self.analyzer.set_court_corners(self.corners, source='manual', confidence=1.0)
        self.assertEqual(self.analyzer.calibration_context.state.value, 'UNCALIBRATED')

    def test_provenance_rejects_arbitrary_states(self):
        with self.assertRaises(ValueError):
            CalibrationProvenance(
                calibration_id='cal-1', camera_segment_id='segment-1',
                state='maybe', source=CalibrationSource.MANUAL,
                created_at_frame=0, created_at_timestamp_sec=0.0,
            )
        with self.assertRaises(ValueError):
            CalibrationProvenance(
                calibration_id='cal-1', camera_segment_id='segment-1',
                state=self.analyzer.calibration_context.state,
                source=CalibrationSource.MANUAL,
                created_at_frame=1.5, created_at_timestamp_sec=0.0,
            )
        with self.assertRaises(ValueError):
            CalibrationProvenance(
                calibration_id='cal-1', camera_segment_id='segment-1',
                state=self.analyzer.calibration_context.state,
                source=CalibrationSource.MANUAL,
                created_at_frame=0, created_at_timestamp_sec=0.0,
                confidence=1.0,
            )

    def test_recalibration_keeps_image_identity_when_mot_ids_change(self):
        left = PlayerProfile(1, team=1)
        right = PlayerProfile(2, team=1)
        left.last_bbox = [100, 100, 150, 200]
        right.last_bbox = [500, 100, 550, 200]
        left.track_id = 10
        right.track_id = 20
        detections = [
            {"bbox": [500, 100, 550, 200], "center": (525, 200), "real_pos": (4.0, 2.0), "conf": 0.9, "track_id": 40},
            {"bbox": [100, 100, 150, 200], "center": (125, 200), "real_pos": (1.0, 2.0), "conf": 0.9, "track_id": 30},
        ]
        matched, _, _, _ = match_tracks_to_profiles_with_reid(
            {1: left, 2: right}, detections, self.frame, dist_tracker=None,
        )
        self.assertEqual(matched[1]["track_id"], 30)
        self.assertEqual(matched[2]["track_id"], 40)


if __name__ == "__main__":
    unittest.main()
