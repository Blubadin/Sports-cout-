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
# Container-shaped payload for lifecycle tests that mock the actual decoder.
MOCK_VIDEO_BYTES = b'RIFF\x20\x00\x00\x00AVI ' + b'mocked video body'


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
                content=MOCK_VIDEO_BYTES
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
            content=MOCK_VIDEO_BYTES
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

    def test_double_start_creates_one_worker(self):
        """Use true concurrency to test double /start race protection without TestClient deadlock."""
        import concurrent.futures
        import threading
        from server import start_session_analysis, tracking_sessions

        session_id = self._create_session(video_source="demo", game_type="singles")
        res = self._calibrate(session_id)
        self.assertEqual(res.status_code, 200)

        session = tracking_sessions[session_id]
        
        # Track thread start calls
        start_calls = []
        original_start = threading.Thread.start

        def mock_start(self_obj, *args, **kwargs):
            if hasattr(self_obj, "_target") and self_obj._target and getattr(self_obj._target, "__name__", "") == "_run_session_analysis":
                start_calls.append(self_obj)
            return original_start(self_obj, *args, **kwargs)

        def make_request():
            try:
                return start_session_analysis(session_id)
            except Exception as e:
                # FastAPI raises HTTPException, return it to check status
                return e

        with patch("threading.Thread.start", side_effect=mock_start, autospec=True):
            # Fire 5 concurrent requests directly to the handler
            with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
                futures = [executor.submit(make_request) for _ in range(5)]
                results = [f.result() for f in futures]

        started_count = sum(1 for r in results if isinstance(r, dict) and r.get("status") == "started")
        already_processing_count = sum(1 for r in results if isinstance(r, dict) and r.get("status") == "already_processing")
        
        # If the state changed so fast, some might raise 409
        from fastapi import HTTPException
        conflict_count = sum(1 for r in results if isinstance(r, HTTPException) and r.status_code == 409)

        self.assertEqual(started_count, 1)
        self.assertEqual(already_processing_count + conflict_count, 4)
        self.assertEqual(len(start_calls), 1, "Exactly one worker thread should be started")

    def test_calibration_vs_start_race(self):
        """Verify calibration is rejected if a start transition happens concurrently."""
        import concurrent.futures
        from server import calibrate_session, SessionCalibrationRequest, tracking_sessions

        session_id = self._create_session(video_source="demo", game_type="singles")
        res = self._calibrate(session_id)
        self.assertEqual(res.status_code, 200)

        session = tracking_sessions[session_id]
        
        def slow_calibrate():
            from fastapi import HTTPException
            try:
                req = SessionCalibrationRequest(game_type="singles", corners=CORNERS)
                return calibrate_session(session_id, req)
            except HTTPException as e:
                return e

        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as executor:
            # By taking the lock artificially and changing state, we can simulate
            # what happens if start wins the race before calibration gets the lock
            with session._state_lock:
                # Calibrate request blocked waiting for lock
                cal_future = executor.submit(slow_calibrate)
                time.sleep(0.1) # Let it block
                session.status = "PROCESSING" # Start wins and changes state
            
            cal_res = cal_future.result()
            from fastapi import HTTPException
            self.assertIsInstance(cal_res, HTTPException)
            self.assertEqual(cal_res.status_code, 409)
            self.assertIn("PROCESSING", str(cal_res.detail))

    # ── Demo provenance ──

    def test_real_video_ingestion_smoke_test(self):
        """End-to-end smoke test for real video ingestion without mocking VideoCapture."""
        import cv2
        import tempfile
        import os
        import numpy as np

        # Check if MJPG encoder is available by attempting to create a dummy writer
        # If it fails, we skip
        test_path = tempfile.mktemp(suffix=".avi")
        fourcc = cv2.VideoWriter_fourcc(*'MJPG')
        writer = cv2.VideoWriter(test_path, fourcc, 30.0, (320, 240))
        if not writer.isOpened():
            self.skipTest("cv2.VideoWriter with MJPG not available in this environment")
        
        # Write 5 frames of black to the dummy video
        frame = np.zeros((240, 320, 3), dtype=np.uint8)
        for _ in range(5):
            writer.write(frame)
        writer.release()

        try:
            with open(test_path, "rb") as f:
                video_bytes = f.read()

            session_id = self._create_session(game_type="singles")
            
            res = self.client.post(
                f"/api/tracking/sessions/{session_id}/video?filename=test.avi",
                headers={"Content-Type": "video/avi"},
                content=video_bytes
            )
            
            self.assertEqual(res.status_code, 200)
            self.assertEqual(res.json()["width"], 320)
            self.assertEqual(res.json()["height"], 240)
            
            session = tracking_sessions[session_id]
            self.assertEqual(session.status, "VIDEO_READY")
            self.assertIsNotNone(session.owned_video_path)
            self.assertTrue(session.owned_video_path.exists())
            
        finally:
            if os.path.exists(test_path):
                os.remove(test_path)

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
