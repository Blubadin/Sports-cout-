"""
test_tracking_session.py — Unit tests for Tracking Session API lifecycle (PDF §53-55).
"""

import unittest
import sys
import time
from pathlib import Path

# Add ai_service to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from fastapi.testclient import TestClient
from server import app, tracking_sessions


class TestTrackingSessionAPI(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)
        tracking_sessions.clear()

    def test_session_full_lifecycle_demo(self):
        """Verify session creation, calibration, player assignment, processing, and results."""
        # 1. Create Session
        res_create = self.client.post("/api/tracking/sessions", json={"video_source": "demo", "game_type": "singles"})
        self.assertEqual(res_create.status_code, 200)
        data = res_create.json()
        session_id = data["sessionId"]
        self.assertEqual(data["status"], "READY")
        self.assertEqual(data["gameType"], "singles")

        # 2. Calibration
        corners = [[200.0, 100.0], [1080.0, 100.0], [1080.0, 650.0], [200.0, 650.0]]
        res_cal = self.client.post(f"/api/tracking/sessions/{session_id}/calibration", json={"corners": corners, "game_type": "singles"})
        self.assertEqual(res_cal.status_code, 200)
        self.assertEqual(res_cal.json()["sessionStatus"], "ASSIGNING_PLAYERS")

        # 3. Assign Players
        players = [
            {"player_id": 1, "bbox": [300, 150, 360, 250], "name": "Player 1"},
            {"player_id": 2, "bbox": [700, 450, 760, 580], "name": "Player 2"},
        ]
        res_players = self.client.post(f"/api/tracking/sessions/{session_id}/players", json={"players": players})
        self.assertEqual(res_players.status_code, 200)
        self.assertEqual(res_players.json()["sessionStatus"], "READY_TO_ANALYZE")

        # 4. Start Analysis
        res_start = self.client.post(f"/api/tracking/sessions/{session_id}/start")
        self.assertEqual(res_start.status_code, 200)
        self.assertEqual(res_start.json()["status"], "started")

        # Wait a moment for demo worker to complete or make progress
        time.sleep(0.5)

        # 5. Check Status
        res_status = self.client.get(f"/api/tracking/sessions/{session_id}/status")
        self.assertEqual(res_status.status_code, 200)
        status_data = res_status.json()
        self.assertIn(status_data["status"], ["PROCESSING", "COMPLETED"])
        self.assertGreaterEqual(status_data["progressPct"], 0.0)

        # Wait for completion
        max_wait = 10.0
        start_wait = time.time()
        while time.time() - start_wait < max_wait:
            s_data = self.client.get(f"/api/tracking/sessions/{session_id}/status").json()
            if s_data["status"] == "COMPLETED":
                break
            time.sleep(0.1)

        # 6. Results
        res_results = self.client.get(f"/api/tracking/sessions/{session_id}/results")
        self.assertEqual(res_results.status_code, 200)
        results_data = res_results.json()
        self.assertEqual(results_data["status"], "COMPLETED")
        self.assertGreater(results_data["sampleCount"], 0)
        first_frame = results_data["telemetry"][0]
        self.assertEqual(first_frame["schemaVersion"], 1)
        self.assertTrue(first_frame["isSynthetic"])

        # 7. Delete Session
        res_del = self.client.delete(f"/api/tracking/sessions/{session_id}")
        self.assertEqual(res_del.status_code, 200)
        self.assertEqual(res_del.json()["status"], "deleted")

    def test_session_nonexistent_video_reports_error(self):
        """Session with non-existent video must report ERROR status and message, not fake AI."""
        res_create = self.client.post("/api/tracking/sessions", json={"video_source": "missing_video_9999.mp4", "game_type": "doubles"})
        session_id = res_create.json()["sessionId"]

        res_start = self.client.post(f"/api/tracking/sessions/{session_id}/start")
        self.assertEqual(res_start.status_code, 200)

        time.sleep(0.2)
        res_status = self.client.get(f"/api/tracking/sessions/{session_id}/status")
        status_data = res_status.json()
        self.assertEqual(status_data["status"], "ERROR")
        self.assertIn("Video file not found", status_data["error"])

    def test_list_sessions_exposes_a_session_for_browser_resume(self):
        """A reopened Lab can discover its existing backend session."""
        res_create = self.client.post("/api/tracking/sessions", json={
            "video_source": "demo",
            "game_type": "singles",
            "project_id": "project_resume",
            "video_fingerprint": "rally.mp4:123:456",
        })
        self.assertEqual(res_create.status_code, 200)
        session_id = res_create.json()["sessionId"]

        res_list = self.client.get("/api/tracking/sessions", params={"project_id": "project_resume"})
        self.assertEqual(res_list.status_code, 200)
        payload = res_list.json()
        self.assertEqual(len(payload["sessions"]), 1)
        self.assertEqual(payload["sessions"][0]["sessionId"], session_id)
        self.assertEqual(payload["sessions"][0]["videoFingerprint"], "rally.mp4:123:456")

    def test_unavailable_gpu_request_is_rejected_explicitly(self):
        res = self.client.post("/api/tracking/sessions", json={
            "video_source": "demo",
            "game_type": "singles",
            "device": "cuda",
        })
        self.assertEqual(res.status_code, 422)
        self.assertIn("cuda", res.json()["detail"])


if __name__ == "__main__":
    unittest.main()
