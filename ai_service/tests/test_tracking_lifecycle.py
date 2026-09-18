import unittest
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient
from server import app, tracking_sessions

class TestTrackingLifecycle(unittest.TestCase):
    def setUp(self):
        tracking_sessions.clear()
        self.client = TestClient(app)

    @patch("server.cv2.VideoCapture")
    def test_upload_raw_bytes(self, mock_cv2):
        # mock cv2
        mock_cap = MagicMock()
        mock_cap.isOpened.return_value = True
        mock_cap.read.return_value = (True, MagicMock(shape=(720, 1280, 3)))
        mock_cap.get.return_value = 30.0
        mock_cv2.return_value = mock_cap

        res_create = self.client.post("/api/tracking/sessions", json={"game_type": "singles"})
        session_id = res_create.json()["sessionId"]

        # 7. multipart upload is rejected clearly
        res_multipart = self.client.post(
            f"/api/tracking/sessions/{session_id}/video?filename=test.mp4",
            headers={"Content-Type": "multipart/form-data; boundary=---123"},
            content=b"some bytes"
        )
        self.assertEqual(res_multipart.status_code, 400)
        self.assertIn("Multipart upload not supported", res_multipart.json()["detail"])

        # 8. empty upload fails
        res_empty = self.client.post(
            f"/api/tracking/sessions/{session_id}/video?filename=test.mp4",
            headers={"Content-Type": "video/mp4"},
            content=b""
        )
        self.assertEqual(res_empty.status_code, 400)
        self.assertIn("Empty upload", res_empty.json()["detail"])

        # 9. invalid bytes fail decode cleanly (mock isOpened = False)
        mock_cap.isOpened.return_value = False
        res_invalid = self.client.post(
            f"/api/tracking/sessions/{session_id}/video?filename=test.mp4",
            headers={"Content-Type": "video/mp4"},
            content=b"invalid video bytes"
        )
        self.assertEqual(res_invalid.status_code, 422)
        self.assertIn("Container cannot be opened", res_invalid.json()["detail"])

        # 6. raw upload path, 3. upload sets VIDEO_READY
        mock_cap.isOpened.return_value = True
        res_valid = self.client.post(
            f"/api/tracking/sessions/{session_id}/video?filename=test.mp4",
            headers={"Content-Type": "video/mp4"},
            content=b"valid video bytes"
        )
        self.assertEqual(res_valid.status_code, 200)
        
        session = tracking_sessions[session_id]
        self.assertEqual(session.status, "VIDEO_READY")

    @patch("server.cv2.VideoCapture")
    def test_lifecycle_state_transitions(self, mock_cv2):
        # mock cv2 for upload
        mock_cap = MagicMock()
        mock_cap.isOpened.return_value = True
        mock_cap.read.return_value = (True, MagicMock(shape=(720, 1280, 3)))
        mock_cap.get.return_value = 30.0
        mock_cv2.return_value = mock_cap

        # 1. session lifecycle state transitions
        res_create = self.client.post("/api/tracking/sessions", json={"game_type": "singles"})
        session_id = res_create.json()["sessionId"]
        
        # 2. start rejected before calibration
        res_start_early = self.client.post(f"/api/tracking/sessions/{session_id}/start")
        self.assertEqual(res_start_early.status_code, 409)
        self.assertIn("Must calibrate", res_start_early.json()["detail"])

        # upload
        self.client.post(
            f"/api/tracking/sessions/{session_id}/video?filename=test.mp4",
            content=b"valid"
        )

        # 4. calibration sets READY_TO_ANALYZE
        res_cal = self.client.post(
            f"/api/tracking/sessions/{session_id}/calibration",
            json={"game_type": "singles", "corners": [[200.0, 100.0], [1080.0, 100.0], [1080.0, 650.0], [200.0, 650.0]]}
        )
        self.assertEqual(res_cal.status_code, 200)
        self.assertEqual(res_cal.json()["sessionStatus"], "READY_TO_ANALYZE")
        self.assertEqual(tracking_sessions[session_id].status, "READY_TO_ANALYZE")

        # 5. optional player assignment still works
        res_assign = self.client.post(
            f"/api/tracking/sessions/{session_id}/players",
            json={"players": []}
        )
        self.assertEqual(res_assign.status_code, 200)
        self.assertEqual(tracking_sessions[session_id].status, "READY_TO_ANALYZE")

        # start
        res_start = self.client.post(f"/api/tracking/sessions/{session_id}/start")
        self.assertEqual(res_start.status_code, 200)
        
    def test_demo_provenance(self):
        # 10. existing demo/synthetic provenance remains correct
        res_create = self.client.post("/api/tracking/sessions", json={"video_source": "demo", "game_type": "doubles"})
        session_id = res_create.json()["sessionId"]
        
        session = tracking_sessions[session_id]
        self.assertEqual(session.video_source, "demo")
        
        # Should be able to calibrate demo without upload
        res_cal = self.client.post(
            f"/api/tracking/sessions/{session_id}/calibration",
            json={"game_type": "doubles", "corners": [[200.0, 100.0], [1080.0, 100.0], [1080.0, 650.0], [200.0, 650.0]]}
        )
        self.assertEqual(res_cal.status_code, 200)
        self.assertEqual(session.status, "READY_TO_ANALYZE")
