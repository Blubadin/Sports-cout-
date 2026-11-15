"""Phase 0 regression tests for video timestamp progression and WebSocket cleanup."""

import sys
import unittest
from pathlib import Path
from unittest.mock import patch

import cv2
import numpy as np
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).parent.parent))

import server


class _StalledPtsCapture:
    """Fake VideoCapture returning a stalled CAP_PROP_POS_MSEC across multiple frames."""

    def __init__(self, frame_count: int = 3, fps: float = 20.0, stalled_msec: float = 500.0):
        self._frame_count = frame_count
        self._fps = fps
        self._stalled_msec = stalled_msec
        self._read_calls = 0

    def isOpened(self) -> bool:
        return True

    def get(self, prop_id: int) -> float:
        if prop_id == cv2.CAP_PROP_FPS:
            return self._fps
        if prop_id == cv2.CAP_PROP_POS_MSEC:
            return self._stalled_msec
        return 0.0

    def read(self):
        if self._read_calls >= self._frame_count:
            server.is_tracking = False
            return False, None
        self._read_calls += 1
        return True, np.zeros((16, 16, 3), dtype=np.uint8)

    def release(self) -> None:
        return None


class _DummyLoop:
    pass


class Phase0BackendRegressionTests(unittest.TestCase):
    def setUp(self):
        server.connected_websockets.clear()
        server.is_tracking = False
        server.tracking_mode = "idle"
        self.addCleanup(server.connected_websockets.clear)

    def test_video_tracking_worker_updates_last_timestamp_sec_when_pts_stalls(self):
        observed_timestamps: list[float] = []
        fake_cap = _StalledPtsCapture(frame_count=3, fps=20.0, stalled_msec=500.0)

        def fake_process_frame(_frame, timestamp_sec: float | None = None):
            assert timestamp_sec is not None
            observed_timestamps.append(timestamp_sec)
            return {"players": [], "timestampSec": timestamp_sec}

        server.is_tracking = True
        with (
            patch.object(server.cv2, "VideoCapture", return_value=fake_cap),
            patch.object(server.analyzer, "process_frame", side_effect=fake_process_frame),
            patch.object(server.asyncio, "run_coroutine_threadsafe", side_effect=lambda coro, _loop: coro.close()),
        ):
            server._video_tracking_worker("dummy.mp4", _DummyLoop())

        self.assertEqual(len(observed_timestamps), 3)
        self.assertAlmostEqual(observed_timestamps[0], 0.50, places=4)
        self.assertGreater(observed_timestamps[1], observed_timestamps[0])
        self.assertGreater(observed_timestamps[2], observed_timestamps[1])

    def test_websocket_cleanup_discards_without_keyerror_or_leaks(self):
        client = TestClient(server.app)
        self.addCleanup(client.close)

        # Case 1: Socket already evicted by broadcast_telemetry before client disconnects
        with client.websocket_connect("/ws/telemetry") as ws:
            ack = ws.receive_json()
            self.assertEqual(ack["type"], "connection_ack")
            self.assertEqual(len(server.connected_websockets), 1)
            server.connected_websockets.clear()
        self.assertEqual(len(server.connected_websockets), 0)

        # Case 2: Non-WebSocketDisconnect error inside loop still discards websocket in finally block
        try:
            with client.websocket_connect("/ws/telemetry") as ws:
                _ = ws.receive_json()
                self.assertEqual(len(server.connected_websockets), 1)
                ws.send_text("{invalid-json")
        except Exception:
            pass
        self.assertEqual(len(server.connected_websockets), 0)


if __name__ == "__main__":
    unittest.main()
