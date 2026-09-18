"""
test_tracking_lifecycle.py — Tests for tracking session state machine hardening.
Covers: upload states, calibration locks, player assignment locks,
        double-start race, error/completed reopening, and demo provenance.
"""

import unittest
import sys
import time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient
from server import app, tracking_sessions

CORNERS = [[200.0, 100.0], [1080.0, 100.0], [1080.0, 650.0], [200.0, 650.0]]


def _mock_cv2_cap():
    mock_cap = MagicMock()
    mock_cap.isOpened.return_value = True
    mock_cap.read.return_value = (True, MagicMock(shape=(720, 1280, 3)))
    mock_cap.get.return_value = 30.0
    return mock_cap


class TestTrackingLifecycle(unittest.TestCase):
    def setUp(self):
        tracking_sessions.clear()
        self.client = TestClient(app)

    def _create_session(self, **kwargs):
        payload = {"game_type": "singles"}
        payload.update(kwargs)
        res = self.client.post("/api/tracking/sessions", json=payload)
        self.assertEqual(res.status_code, 200)
        return res.json()["sessionId"]

    def _upload(self, session_id, mock_cap):
        with patch("server.cv2.VideoCapture", return_value=mock_cap):
            return self.client.post(
                f"/api/tracking/sessions/{session_id}/video?filename=test.mp4",
                headers={"Content-Type": "video/mp4"},
                content=b"valid video bytes"
            )

    def _calibrate(self, session_id):
        return self.client.post(
            f"/api/tracking/sessions/{session_id}/calibration",
            json={"game_type": "singles", "corners": CORNERS}
        )

    # ── Upload tests ──

    @patch("server.cv2.VideoCapture")
    def test_upload_raw_bytes(self, mock_cv2):
        mock_cv2.return_value = _mock_cv2_cap()
        session_id = self._create_session()

        # multipart rejected
        res = self.client.post(
            f"/api/tracking/sessions/{session_id}/video?filename=test.mp4",
            headers={"Content-Type": "multipart/form-data; boundary=---123"},
            content=b"some bytes"
        )
        self.assertEqual(res.status_code, 400)
        self.assertIn("Multipart upload not supported", res.json()["detail"])

        # empty upload rejected
        res = self.client.post(
            f"/api/tracking/sessions/{session_id}/video?filename=test.mp4",
            headers={"Content-Type": "video/mp4"},
            content=b""
        )
        self.assertEqual(res.status_code, 400)
        self.assertIn("Empty upload", res.json()["detail"])

        # invalid bytes rejected
        mock_cv2.return_value.isOpened.return_value = False
        res = self.client.post(
            f"/api/tracking/sessions/{session_id}/video?filename=test.mp4",
            headers={"Content-Type": "video/mp4"},
            content=b"invalid video bytes"
        )
        self.assertEqual(res.status_code, 422)
        self.assertIn("Container cannot be opened", res.json()["detail"])

        # valid raw upload sets VIDEO_READY
        mock_cv2.return_value.isOpened.return_value = True
        res = self.client.post(
            f"/api/tracking/sessions/{session_id}/video?filename=test.mp4",
            headers={"Content-Type": "video/mp4"},
            content=b"valid video bytes"
        )
        self.assertEqual(res.status_code, 200)
        self.assertEqual(tracking_sessions[session_id].status, "VIDEO_READY")

    def test_upload_rejected_in_error_state(self):
        """ERROR cannot be reopened by upload."""
        session_id = self._create_session()
        tracking_sessions[session_id].status = "ERROR"
        cap = _mock_cv2_cap()
        res = self._upload(session_id, cap)
        self.assertEqual(res.status_code, 409)
        self.assertIn("ERROR", res.json()["detail"])

    def test_upload_rejected_in_completed_state(self):
        """COMPLETED cannot be reopened by upload."""
        session_id = self._create_session()
        tracking_sessions[session_id].status = "COMPLETED"
        cap = _mock_cv2_cap()
        res = self._upload(session_id, cap)
        self.assertEqual(res.status_code, 409)
        self.assertIn("COMPLETED", res.json()["detail"])

    def test_upload_rejected_in_processing_state(self):
        """PROCESSING sessions block upload."""
        session_id = self._create_session()
        tracking_sessions[session_id].status = "PROCESSING"
        cap = _mock_cv2_cap()
        res = self._upload(session_id, cap)
        self.assertEqual(res.status_code, 409)

    # ── Calibration lock tests ──

    def test_calibration_rejected_while_processing(self):
        session_id = self._create_session()
        tracking_sessions[session_id].status = "PROCESSING"
        res = self._calibrate(session_id)
        self.assertEqual(res.status_code, 409)
        self.assertIn("PROCESSING", res.json()["detail"])

    def test_calibration_rejected_after_completed(self):
        session_id = self._create_session()
        tracking_sessions[session_id].status = "COMPLETED"
        res = self._calibrate(session_id)
        self.assertEqual(res.status_code, 409)
        self.assertIn("COMPLETED", res.json()["detail"])

    def test_calibration_rejected_in_error(self):
        session_id = self._create_session()
        tracking_sessions[session_id].status = "ERROR"
        res = self._calibrate(session_id)
        self.assertEqual(res.status_code, 409)
        self.assertIn("ERROR", res.json()["detail"])

    def test_calibration_rejected_in_ready_for_real_session(self):
        """Real (non-demo) sessions must upload video before calibration."""
        session_id = self._create_session(video_source="my_video.mp4")
        self.assertEqual(tracking_sessions[session_id].status, "READY")
        res = self._calibrate(session_id)
        self.assertEqual(res.status_code, 409)

    # ── Player assignment lock tests ──

    def test_player_assignment_rejected_while_processing(self):
        session_id = self._create_session()
        tracking_sessions[session_id].status = "PROCESSING"
        res = self.client.post(
            f"/api/tracking/sessions/{session_id}/players",
            json={"players": []}
        )
        self.assertEqual(res.status_code, 409)
        self.assertIn("PROCESSING", res.json()["detail"])

    def test_player_assignment_rejected_after_completed(self):
        session_id = self._create_session()
        tracking_sessions[session_id].status = "COMPLETED"
        res = self.client.post(
            f"/api/tracking/sessions/{session_id}/players",
            json={"players": []}
        )
        self.assertEqual(res.status_code, 409)
        self.assertIn("COMPLETED", res.json()["detail"])

    def test_player_assignment_rejected_in_video_ready(self):
        session_id = self._create_session()
        tracking_sessions[session_id].status = "VIDEO_READY"
        res = self.client.post(
            f"/api/tracking/sessions/{session_id}/players",
            json={"players": []}
        )
        self.assertEqual(res.status_code, 409)

    def test_player_assignment_rejected_in_ready(self):
        session_id = self._create_session()
        # status is READY by default
        res = self.client.post(
            f"/api/tracking/sessions/{session_id}/players",
            json={"players": []}
        )
        self.assertEqual(res.status_code, 409)

    # ── Lifecycle flow tests ──

    @patch("server.cv2.VideoCapture")
    def test_lifecycle_state_transitions(self, mock_cv2):
        mock_cv2.return_value = _mock_cv2_cap()

        session_id = self._create_session()

        # start rejected before calibration
        res = self.client.post(f"/api/tracking/sessions/{session_id}/start")
        self.assertEqual(res.status_code, 409)

        # upload -> VIDEO_READY
        self._upload(session_id, mock_cv2.return_value)
        self.assertEqual(tracking_sessions[session_id].status, "VIDEO_READY")

        # calibration -> READY_TO_ANALYZE
        res = self._calibrate(session_id)
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["sessionStatus"], "READY_TO_ANALYZE")
        self.assertEqual(tracking_sessions[session_id].status, "READY_TO_ANALYZE")

        # optional player assignment works
        res = self.client.post(
            f"/api/tracking/sessions/{session_id}/players",
            json={"players": []}
        )
        self.assertEqual(res.status_code, 200)
        self.assertEqual(tracking_sessions[session_id].status, "READY_TO_ANALYZE")

        # start -> PROCESSING (set atomically by endpoint)
        res = self.client.post(f"/api/tracking/sessions/{session_id}/start")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["status"], "started")
        self.assertEqual(tracking_sessions[session_id].status, "PROCESSING")

    # ── Double-start race test ──

    def test_double_start_creates_one_worker(self):
        """Immediate double /start returns already_processing for the second call."""
        session_id = self._create_session(video_source="demo", game_type="singles")
        # Calibrate demo so we can start
        res = self._calibrate(session_id)
        self.assertEqual(res.status_code, 200)
        self.assertEqual(tracking_sessions[session_id].status, "READY_TO_ANALYZE")

        # First start
        res1 = self.client.post(f"/api/tracking/sessions/{session_id}/start")
        self.assertEqual(res1.status_code, 200)
        self.assertEqual(res1.json()["status"], "started")

        # Immediate second start should return already_processing
        res2 = self.client.post(f"/api/tracking/sessions/{session_id}/start")
        self.assertEqual(res2.status_code, 200)
        self.assertEqual(res2.json()["status"], "already_processing")

        # Wait for the demo to complete
        for _ in range(30):
            if tracking_sessions[session_id].status != "PROCESSING":
                break
            time.sleep(0.1)

    # ── Demo provenance ──

    def test_demo_provenance(self):
        """Demo sessions follow a clear equivalent lifecycle."""
        session_id = self._create_session(video_source="demo", game_type="doubles")
        session = tracking_sessions[session_id]
        self.assertEqual(session.video_source, "demo")
        self.assertEqual(session.status, "READY")

        # Demo can calibrate from READY
        res = self.client.post(
            f"/api/tracking/sessions/{session_id}/calibration",
            json={"game_type": "doubles", "corners": CORNERS}
        )
        self.assertEqual(res.status_code, 200)
        self.assertEqual(session.status, "READY_TO_ANALYZE")


if __name__ == "__main__":
    unittest.main()
