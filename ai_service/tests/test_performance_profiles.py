"""
test_performance_profiles.py — Unit tests for Phase 5 controlled processing performance experiments.

Validates:
- Court ROI calculation & margin clamping
- Inverse coordinate transformations for bounding box and ground points
- Source coordinate preservation across crop offsets
- ProcessingConfig resolution (reference defaults unchanged, quality, balanced, fast, custom, auto)
- Frame stride and timestamp-aware speed
- Pose stride and pose reuse honesty (isReused, ageFrames)
- TrackingSession integration (status, performance metrics, quality metrics)
- CPU and CUDA device handling
"""

import sys
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch
import numpy as np

# Ensure ai_service is on sys.path
sys.path.insert(0, str(Path(__file__).parent.parent))

from court_roi import (
    calculate_court_roi,
    inverse_transform_bbox,
    inverse_transform_point,
)
from analyzer_v2 import BadmintonAnalyzerV2, PlayerProfile
from server import (
    resolve_processing_config,
    compute_session_quality_metrics,
    TrackingSession,
)


class TestCourtRoiAndCoordinates(unittest.TestCase):
    def test_calculate_court_roi_standard(self):
        # 4 corners in 1280x720 frame
        corners = [[200, 150], [1080, 150], [1150, 600], [130, 600]]
        roi_x1, roi_y1, roi_x2, roi_y2 = calculate_court_roi(corners, 1280, 720, margin_px=50)
        # min_x = 130 -> 130 - 50 = 80
        # min_y = 150 -> 150 - 50 = 100
        # max_x = 1150 -> 1150 + 50 = 1200
        # max_y = 600 -> 600 + 50 = 650
        self.assertEqual(roi_x1, 80)
        self.assertEqual(roi_y1, 100)
        self.assertEqual(roi_x2, 1200)
        self.assertEqual(roi_y2, 650)

    def test_calculate_court_roi_boundary_clamping(self):
        # Corners near frame boundaries
        corners = [[10, 10], [1270, 10], [1270, 710], [10, 710]]
        roi_x1, roi_y1, roi_x2, roi_y2 = calculate_court_roi(corners, 1280, 720, margin_px=60)
        self.assertEqual(roi_x1, 0)
        self.assertEqual(roi_y1, 0)
        self.assertEqual(roi_x2, 1280)
        self.assertEqual(roi_y2, 720)

    def test_calculate_court_roi_invalid_corners(self):
        # None or insufficient corners
        self.assertEqual(calculate_court_roi(None, 1280, 720), (0, 0, 1280, 720))
        self.assertEqual(calculate_court_roi([[10, 10], [20, 20]], 1280, 720), (0, 0, 1280, 720))

    def test_inverse_transform_bbox_and_point(self):
        # Crop offset (100, 200)
        offset_x, offset_y = 100, 200
        cropped_bbox = [10.0, 20.0, 60.0, 120.0]
        src_bbox = inverse_transform_bbox(cropped_bbox, offset_x, offset_y)
        self.assertEqual(src_bbox, [110.0, 220.0, 160.0, 320.0])

        src_pt = inverse_transform_point((35.0, 120.0), offset_x, offset_y)
        self.assertEqual(src_pt, (135.0, 320.0))

    def test_detection_source_coordinates_with_roi(self):
        """Verify that when use_court_roi is active, detections are transformed back to source coords."""
        analyzer = BadmintonAnalyzerV2(
            game_type="singles",
            max_players=2,
            use_court_roi=True,
            court_roi_margin_px=50,
            detector_input_size=512,
        )
        corners = [[100, 100], [500, 100], [500, 500], [100, 500]]
        analyzer.set_court_corners(corners)

        # Mock detector track results on the cropped ROI
        mock_detector = MagicMock()
        mock_result = MagicMock()
        mock_boxes = MagicMock()

        # Crop offset for corners [100, 100, 500, 500] with margin 50 in 640x640:
        # roi is [50, 50, 550, 550], offset is (50, 50)
        # Mock detection in crop coordinates: [20, 30, 80, 150]
        mock_boxes.xyxy.cpu().numpy.return_value = np.array([[20.0, 30.0, 80.0, 150.0]])
        mock_boxes.conf.cpu().numpy.return_value = np.array([0.92])
        mock_boxes.id.cpu().numpy.return_value = np.array([1])
        mock_result.boxes = mock_boxes
        mock_detector.track.return_value = [mock_result]
        analyzer._detector = mock_detector

        frame = np.zeros((640, 640, 3), dtype=np.uint8)
        detections = analyzer.detect_and_track(frame)

        self.assertEqual(len(detections), 1)
        # In crop coords: [20, 30, 80, 150] + offset (50, 50) -> [70, 80, 130, 200]
        self.assertEqual(detections[0]["bbox"], [70.0, 80.0, 130.0, 200.0])
        self.assertEqual(detections[0]["center"], (100.0, 200.0))
        # Verify detector called with imgsz=512
        mock_detector.track.assert_called_once()
        call_kwargs = mock_detector.track.call_args[1]
        self.assertEqual(call_kwargs["imgsz"], 512)


class TestProcessingConfigAndPresets(unittest.TestCase):
    def test_reference_preset_defaults_unchanged(self):
        """Reference configuration must strictly preserve production defaults."""
        cfg = resolve_processing_config(None)
        self.assertEqual(cfg["profile"], "reference")
        self.assertEqual(cfg["detectorInputSize"], 640)
        self.assertFalse(cfg["useCourtRoi"])
        self.assertEqual(cfg["courtRoiMarginPx"], 60)
        self.assertEqual(cfg["frameStride"], 2)
        self.assertEqual(cfg["poseStride"], 1)

        cfg_ref = resolve_processing_config({"profile": "reference"})
        self.assertEqual(cfg_ref["profile"], "reference")
        self.assertEqual(cfg_ref["detectorInputSize"], 640)
        self.assertFalse(cfg_ref["useCourtRoi"])
        self.assertEqual(cfg_ref["frameStride"], 2)
        self.assertEqual(cfg_ref["poseStride"], 1)

    def test_quality_preset(self):
        cfg = resolve_processing_config({"profile": "quality"})
        self.assertEqual(cfg["profile"], "quality")
        self.assertEqual(cfg["detectorInputSize"], 640)
        self.assertFalse(cfg["useCourtRoi"])
        self.assertEqual(cfg["frameStride"], 1)
        self.assertEqual(cfg["poseStride"], 1)

    def test_balanced_preset(self):
        cfg = resolve_processing_config({"profile": "balanced"})
        self.assertEqual(cfg["profile"], "balanced")
        self.assertEqual(cfg["detectorInputSize"], 512)
        self.assertTrue(cfg["useCourtRoi"])
        self.assertEqual(cfg["frameStride"], 2)
        self.assertEqual(cfg["poseStride"], 1)

    def test_fast_preset(self):
        cfg = resolve_processing_config({"profile": "fast"})
        self.assertEqual(cfg["profile"], "fast")
        self.assertEqual(cfg["detectorInputSize"], 416)
        self.assertTrue(cfg["useCourtRoi"])
        self.assertEqual(cfg["frameStride"], 3)
        self.assertEqual(cfg["poseStride"], 2)

    def test_auto_preset_cpu_vs_cuda(self):
        cfg_cpu = resolve_processing_config({"profile": "auto"}, runtime_device="cpu")
        self.assertEqual(cfg_cpu["detectorInputSize"], 416)
        self.assertEqual(cfg_cpu["frameStride"], 3)
        self.assertEqual(cfg_cpu["poseStride"], 2)

        cfg_cuda = resolve_processing_config({"profile": "auto"}, runtime_device="cuda")
        self.assertEqual(cfg_cuda["detectorInputSize"], 512)
        self.assertEqual(cfg_cuda["frameStride"], 2)
        self.assertEqual(cfg_cuda["poseStride"], 1)

    def test_custom_overrides(self):
        cfg = resolve_processing_config({
            "profile": "custom",
            "detectorInputSize": 512,
            "useCourtRoi": True,
            "frameStride": 4,
            "poseStride": 3,
        })
        self.assertEqual(cfg["profile"], "custom")
        self.assertEqual(cfg["detectorInputSize"], 512)
        self.assertTrue(cfg["useCourtRoi"])
        self.assertEqual(cfg["frameStride"], 4)
        self.assertEqual(cfg["poseStride"], 3)


class TestPoseStrideHonesty(unittest.TestCase):
    def test_pose_stride_honesty(self):
        """Reused poses must be flagged with isReused=True and ageFrames."""
        analyzer = BadmintonAnalyzerV2(
            game_type="singles",
            max_players=1,
            pose_stride=2,
        )
        analyzer.set_court_corners([[100, 100], [500, 100], [500, 500], [100, 500]])
        analyzer._detector = "dummy"

        # Mock pose detector
        mock_pose_detector = MagicMock()
        mock_pose_detector.estimate_pose_in_roi.return_value = {
            "keypoints": [(50, 50, 0.9), (60, 60, 0.85)],
            "metrics": {"trunkAngleDeg": 5.0},
        }
        analyzer._pose_detector = mock_pose_detector

        # Mock matched detection
        with patch.object(analyzer, "detect_and_track") as mock_det:
            mock_det.return_value = [{
                "bbox": [100, 100, 200, 300],
                "center": (150, 300),
                "conf": 0.9,
                "track_id": 1,
            }]
            frame = np.zeros((720, 1280, 3), dtype=np.uint8)

            # Frame 1: analyzed_frame_count=1 -> 1 % 2 != 0 -> pose NOT newly estimated
            f1 = analyzer.process_frame(frame, timestamp_sec=0.033)
            # Profile has no previous pose yet
            p1_pose_f1 = f1["players"][0].get("pose")
            self.assertIsNone(p1_pose_f1)

            # Frame 2: analyzed_frame_count=2 -> 2 % 2 == 0 -> pose freshly estimated!
            f2 = analyzer.process_frame(frame, timestamp_sec=0.066)
            p1_pose_f2 = f2["players"][0].get("pose")
            self.assertIsNotNone(p1_pose_f2)
            self.assertFalse(p1_pose_f2["isReused"])
            self.assertEqual(p1_pose_f2["ageFrames"], 0)

            # Frame 3: analyzed_frame_count=3 -> 3 % 2 != 0 -> pose reused!
            f3 = analyzer.process_frame(frame, timestamp_sec=0.099)
            p1_pose_f3 = f3["players"][0].get("pose")
            self.assertIsNotNone(p1_pose_f3)
            self.assertTrue(p1_pose_f3["isReused"])
            self.assertEqual(p1_pose_f3["ageFrames"], 1)


class TestTrackingSessionPerformanceAndQuality(unittest.TestCase):
    def test_session_creation_with_processing_config(self):
        session = TrackingSession(
            session_id="test_perf_session",
            game_type="doubles",
            tracked_player_count=4,
            processing_config={"profile": "fast"},
        )
        self.assertEqual(session.processing_config["profile"], "fast")
        self.assertEqual(session.processing_config["detectorInputSize"], 416)
        self.assertEqual(session.processing_config["frameStride"], 3)
        self.assertEqual(session.frame_stride, 3)
        self.assertEqual(session.analyzer.detector_input_size, 416)
        self.assertTrue(session.analyzer.use_court_roi)
        self.assertEqual(session.analyzer.pose_stride, 2)

    def test_quality_metrics_computation(self):
        results = [
            {
                "players": [
                    {"state": "observed", "pose": {"isReused": False}},
                    {"state": "observed", "pose": {"isReused": True}},
                ]
            },
            {
                "players": [
                    {"state": "observed", "pose": {"isReused": False}},
                    {"state": "lost", "pose": None},
                ]
            },
        ]
        # Total player samples = 4
        # Observed: 3 / 4 = 75.0%
        # Lost: 1 / 4 = 25.0%
        # Newly observed pose: 2 / 4 = 50.0%
        metrics = compute_session_quality_metrics(results, 2)
        self.assertEqual(metrics["observedCoveragePct"], 75.0)
        self.assertEqual(metrics["lostFramesPct"], 25.0)
        self.assertEqual(metrics["poseCoveragePct"], 50.0)


if __name__ == "__main__":
    unittest.main()
