import unittest
from types import SimpleNamespace

import cv2
import numpy as np

from ai_service.server import _analyze_captured_frames


class DuplicateTimestampCapture:
    def __init__(self):
        self.frames = [np.zeros((8, 8, 3), dtype=np.uint8) for _ in range(3)]

    def isOpened(self):
        return True

    def get(self, prop):
        if prop == cv2.CAP_PROP_FRAME_COUNT:
            return 3
        if prop == cv2.CAP_PROP_FPS:
            return 30.0
        if prop == cv2.CAP_PROP_POS_MSEC:
            return 33.333333
        return 0.0

    def read(self):
        if not self.frames:
            return False, None
        return True, self.frames.pop(0)


class StrictTimestampAnalyzer:
    def __init__(self):
        self.fps = 30.0
        self.dist_tracker = SimpleNamespace(fps=30.0)
        self.timestamps = []

    def process_frame(self, frame, timestamp_sec):
        if self.timestamps and timestamp_sec <= self.timestamps[-1]:
            raise ValueError("frames and timestamps must be strictly ordered")
        self.timestamps.append(timestamp_sec)
        return {"frameIndex": len(self.timestamps), "timestampSec": timestamp_sec}


class TestCapturedVideoTimestampOrder(unittest.TestCase):
    def test_repeated_decoder_pts_falls_back_to_monotonic_source_frame_time(self):
        analyzer = StrictTimestampAnalyzer()
        session = SimpleNamespace(
            session_id="duplicate-pts-session",
            analyzer=analyzer,
            source_fps=30.0,
            total_frames=0,
            duration_sec=0.0,
            frame_stride=1,
            _cancel=False,
            current_frame=0,
            progress_pct=0.0,
            analyzed_frames=0,
            elapsed_sec=0.0,
            results=[],
            status="PROCESSING",
        )

        _analyze_captured_frames(session, DuplicateTimestampCapture(), start_time=0.0)

        self.assertEqual(session.status, "COMPLETED")
        self.assertEqual(session.analyzed_frames, 3)
        self.assertTrue(all(
            later > earlier
            for earlier, later in zip(analyzer.timestamps, analyzer.timestamps[1:])
        ))
        for actual, expected in zip(analyzer.timestamps, [1 / 30, 2 / 30, 3 / 30]):
            self.assertAlmostEqual(actual, expected, places=7)


if __name__ == "__main__":
    unittest.main()
