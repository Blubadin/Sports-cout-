"""Integration test suite for SportsScout Tracking Lab.

Tests end-to-end real YOLO person detection, ByteTrack MOT tracking,
and YOLO Pose estimation pipeline. Requires Ultralytics and local model weights.
Skips cleanly when dependencies or weights are not present.
"""

from pathlib import Path
import sys
import tempfile
import unittest

import cv2
import numpy as np

# Ensure ai_service is in sys.path
sys.path.insert(0, str(Path(__file__).parent.parent))

from analyzer_v2 import BadmintonAnalyzerV2


class IntegrationTrackingTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        try:
            import ultralytics
            from ultralytics import YOLO
            cls.ultralytics_available = True
        except ImportError:
            cls.ultralytics_available = False

        detector_path = Path("yolov8n.pt")
        pose_path = Path("yolov8n-pose.pt")
        cls.weights_available = detector_path.exists() and pose_path.exists()

    def setUp(self):
        if not self.ultralytics_available:
            self.skipTest("Ultralytics library is not installed in this environment.")
        if not self.weights_available:
            self.skipTest("Local YOLO weights (yolov8n.pt / yolov8n-pose.pt) not found.")

    def test_end_to_end_real_video_inference(self):
        """Run full real inference pipeline through BadmintonAnalyzerV2."""
        analyzer = BadmintonAnalyzerV2(game_type="singles", max_players=2, device="cpu")
        court_corners = [
            [50.0, 50.0],
            [670.0, 50.0],
            [670.0, 350.0],
            [50.0, 350.0],
        ]
        analyzer.set_court_corners(court_corners)

        # Look for real video in downloads or create temporary synthetic frame with real textures
        sample_path = Path("C:/Users/Sport-Science-R3909/Downloads/1.mp4")
        if sample_path.exists():
            cap = cv2.VideoCapture(str(sample_path))
            ret, frame = cap.read()
            cap.release()
            self.assertTrue(ret, "Failed to read first frame from real video")
        else:
            # Fallback to rendered test frame
            frame = np.full((400, 720, 3), 120, dtype=np.uint8)

        # Run process_frame with real YOLO and ByteTrack
        telemetry = analyzer.process_frame(frame, timestamp_sec=0.033)

        self.assertFalse(telemetry.get("isSynthetic"), "Real tracking must report isSynthetic: False")
        self.assertEqual(telemetry.get("source"), "real_tracking")
        self.assertIn("players", telemetry)
        self.assertEqual(len(telemetry["players"]), 2)

        # Validate coordinate integrity (no NaN / no Infinity)
        for player in telemetry["players"]:
            court_pos = player.get("courtPosition")
            if court_pos is not None:
                self.assertFalse(np.isnan(court_pos["xM"]))
                self.assertFalse(np.isinf(court_pos["xM"]))
                self.assertFalse(np.isnan(court_pos["yM"]))
                self.assertFalse(np.isinf(court_pos["yM"]))


if __name__ == "__main__":
    unittest.main()
