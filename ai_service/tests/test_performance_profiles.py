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
    _positive_finite,
    resolve_processing_config,
    compute_session_quality_metrics,
    TrackingSession,
)


class TestRateMetadataValidation(unittest.TestCase):
    def test_positive_finite_rejects_missing_zero_nan_and_infinity(self):
        self.assertEqual(_positive_finite(29.97), 29.97)
        self.assertIsNone(_positive_finite(None))
        self.assertIsNone(_positive_finite(0))
        self.assertIsNone(_positive_finite(-1))
        self.assertIsNone(_positive_finite(float("nan")))
        self.assertIsNone(_positive_finite(float("inf")))


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

    def test_production_profiles_explicit_contract(self):
        """Verify explicit resolution contract for FAST, BALANCED, QUALITY, and REFERENCE profiles."""
        for prof_name in ["reference", "fast", "balanced", "quality"]:
            cfg = resolve_processing_config({"profile": prof_name})
            self.assertEqual(cfg["requestedProfile"], prof_name)
            self.assertEqual(cfg["effectiveProfile"], prof_name)
            self.assertEqual(cfg["detectorModel"], "yolov8n.pt")
            self.assertEqual(cfg["detectorFamily"], "yolov8")
            self.assertEqual(cfg["poseModel"], "yolov8n-pose.pt")
            self.assertEqual(cfg["poseArchitecture"], "roi_pose")
            self.assertEqual(cfg["trackerName"], "bytetrack")
            self.assertFalse(cfg["reidEnabled"])
            self.assertIsNone(cfg["reidModel"])
            self.assertEqual(cfg["runtime"], "pytorch")
            self.assertEqual(cfg["precision"], "fp32")
            self.assertEqual(cfg["confidenceThreshold"], 0.35)

        # Fast profile
        fast = resolve_processing_config({"profile": "fast"})
        self.assertEqual(fast["detectorInputSize"], 416)
        self.assertEqual(fast["frameStride"], 3)
        self.assertEqual(fast["poseStride"], 2)
        self.assertTrue(fast["useCourtRoi"])

        # Balanced profile
        balanced = resolve_processing_config({"profile": "balanced"})
        self.assertEqual(balanced["detectorInputSize"], 512)
        self.assertEqual(balanced["frameStride"], 2)
        self.assertEqual(balanced["poseStride"], 1)
        self.assertTrue(balanced["useCourtRoi"])

        # Quality profile
        quality = resolve_processing_config({"profile": "quality"})
        self.assertEqual(quality["detectorInputSize"], 640)
        self.assertEqual(quality["frameStride"], 1)
        self.assertEqual(quality["poseStride"], 1)
        self.assertFalse(quality["useCourtRoi"])

        # Reference profile (baseline)
        reference = resolve_processing_config({"profile": "reference"})
        self.assertEqual(reference["detectorInputSize"], 640)
        self.assertEqual(reference["frameStride"], 2)
        self.assertEqual(reference["poseStride"], 1)
        self.assertFalse(reference["useCourtRoi"])


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


class TestPhase4PerformanceAndQualityHardening(unittest.TestCase):
    def test_deterministic_auto_and_device_resolution(self):
        """Auto must map deterministically, and requested vs effective devices must be distinct."""
        # Auto on CPU
        cfg_cpu = resolve_processing_config({"profile": "auto", "device": "auto"}, runtime_device="cpu")
        self.assertEqual(cfg_cpu["requestedProfile"], "auto")
        self.assertEqual(cfg_cpu["effectiveProfile"], "fast")
        self.assertEqual(cfg_cpu["requestedDevice"], "auto")
        self.assertEqual(cfg_cpu["effectiveDevice"], "cpu")
        self.assertNotEqual(cfg_cpu["effectiveDevice"], "auto")
        self.assertEqual(cfg_cpu["detectorInputSize"], 416)
        self.assertEqual(cfg_cpu["frameStride"], 3)
        self.assertEqual(cfg_cpu["poseStride"], 2)

        # Auto on CUDA
        cfg_cuda = resolve_processing_config({"profile": "auto", "device": "auto"}, runtime_device="cuda")
        self.assertEqual(cfg_cuda["requestedProfile"], "auto")
        self.assertEqual(cfg_cuda["effectiveProfile"], "balanced")
        self.assertEqual(cfg_cuda["requestedDevice"], "auto")
        self.assertEqual(cfg_cuda["effectiveDevice"], "cuda")
        self.assertNotEqual(cfg_cuda["effectiveDevice"], "auto")
        self.assertEqual(cfg_cuda["detectorInputSize"], 512)
        self.assertEqual(cfg_cuda["frameStride"], 2)
        self.assertEqual(cfg_cuda["poseStride"], 1)

    def test_live_vs_completed_rtf_semantics_and_zero_protection(self):
        """During processing, RTF must use processed video time, not total duration. At completed, use total duration."""
        from server import _build_session_metrics

        session = TrackingSession(
            session_id="test_rtf_session",
            game_type="doubles",
            tracked_player_count=2,
            processing_config={"profile": "balanced"},
        )
        session.source_fps = 30.0
        session.duration_sec = 100.0  # 100s video
        session.frame_stride = 2

        # 1. Processing state: 200 frames analyzed in 5.0 seconds of wall clock
        # Processed video time = 400 source frames / 30.0 fps = 13.33 seconds
        session.status = "PROCESSING"
        session.current_frame = 400
        session.analyzed_frames = 200
        session.elapsed_sec = 5.0

        perf, qual, prov = _build_session_metrics(session)
        self.assertFalse(perf["isFinal"])
        self.assertAlmostEqual(perf["processedVideoTimeSec"], 13.33, places=1)
        # Live RTF = 5.0 / 13.33 = ~0.38, NOT 5.0 / 100.0 = 0.05!
        self.assertAlmostEqual(perf["rtf"], 0.38, places=2)
        # Live Realtime speed = 13.33 / 5.0 = ~2.67x
        self.assertAlmostEqual(perf["realtimeSpeed"], 2.67, places=2)

        # 2. Completed state: total wall clock = 40.0s for 100s video
        session.status = "COMPLETED"
        session.current_frame = 3000
        session.analyzed_frames = 1500
        session.elapsed_sec = 40.0

        perf_comp, _, _ = _build_session_metrics(session)
        self.assertTrue(perf_comp["isFinal"])
        # Final RTF = 40.0 / 100.0 = 0.40
        self.assertEqual(perf_comp["rtf"], 0.40)
        # Final Realtime speed = 100.0 / 40.0 = 2.50x
        self.assertEqual(perf_comp["realtimeSpeed"], 2.50)

        # 3. Zero protection: zero durations or zero elapsed time must not raise ZeroDivisionError
        session.elapsed_sec = 0.0
        session.duration_sec = 0.0
        session.current_frame = 0
        session.analyzed_frames = 0
        session.source_fps = 0.0
        session.frame_stride = 0
        session.status = "PROCESSING"

        perf_zero, _, _ = _build_session_metrics(session)
        self.assertEqual(perf_zero["elapsedSec"], 0.0)
        self.assertIsNone(perf_zero["rtf"])
        self.assertIsNone(perf_zero["realtimeSpeed"])
        self.assertIsNone(perf_zero["analysisFps"])
        self.assertIsNone(perf_zero["samplingFps"])
        self.assertIsNone(perf_zero["processedVideoTimeSec"])

    def test_empty_quality_is_unknown_not_measured_zero(self):
        """No telemetry cannot honestly imply 0% coverage, confidence, or loss."""
        metrics = compute_session_quality_metrics([], 2)

        self.assertIsNone(metrics["observedCoveragePct"])
        self.assertIsNone(metrics["lostFramesPct"])
        self.assertIsNone(metrics["predictedFramesPct"])
        self.assertIsNone(metrics["poseCoveragePct"])
        self.assertEqual(metrics["playerCoverage"], {})

    def test_player_level_coverage_predicted_separation_and_lost_time(self):
        """Player coverage must separate observed vs predicted, calculate mean player coverage, and compute lost time."""
        results = [
            # Frame 0 at t=0.0s: P1 observed, P2 predicted, P3 lost, P4 missing
            {
                "timestampSec": 0.0,
                "players": [
                    {"playerId": "P1", "state": "observed"},
                    {"playerId": "P2", "state": "predicted"},
                    {"playerId": "P3", "state": "lost"},
                ],
            },
            # Frame 1 at t=0.5s (dt=0.5s): P1 observed, P2 observed, P3 lost, P4 missing
            {
                "timestampSec": 0.5,
                "players": [
                    {"playerId": "P1", "state": "observed"},
                    {"playerId": "P2", "state": "observed"},
                    {"playerId": "P3", "state": "lost"},
                ],
            },
        ]
        # Total expected frames = 2
        # P1: 2 observed, 0 predicted, 0 lost -> coverage = 100.0%, lostTime = 0.0s
        # P2: 1 observed, 1 predicted, 0 lost -> coverage = 50.0% (predicted does NOT count as observed!), lostTime = 0.0s
        # P3: 0 observed, 0 predicted, 2 lost -> coverage = 0.0%, lostTime = 1.0s (0.5s + 0.5s)
        # P4: missing from frame -> 0 observed, 2 lost -> coverage = 0.0%, lostTime = 1.0s
        # Mean observed coverage = (100.0 + 50.0 + 0.0 + 0.0) / 4 = 37.5%
        metrics = compute_session_quality_metrics(results, 4)
        cov = metrics["playerCoverage"]

        self.assertEqual(cov["P1"]["observedFrames"], 2)
        self.assertEqual(cov["P1"]["predictedFrames"], 0)
        self.assertEqual(cov["P1"]["observedCoveragePct"], 100.0)
        self.assertEqual(cov["P1"]["lostTimeSec"], 0.0)

        self.assertEqual(cov["P2"]["observedFrames"], 1)
        self.assertEqual(cov["P2"]["predictedFrames"], 1)
        self.assertEqual(cov["P2"]["observedCoveragePct"], 50.0)
        self.assertEqual(cov["P2"]["predictedFramesPct"], 50.0)
        self.assertEqual(cov["P2"]["lostTimeSec"], 0.0)

        self.assertEqual(cov["P3"]["observedFrames"], 0)
        self.assertEqual(cov["P3"]["lostFrames"], 2)
        self.assertEqual(cov["P3"]["observedCoveragePct"], 0.0)
        self.assertEqual(cov["P3"]["lostFramesPct"], 100.0)
        self.assertAlmostEqual(cov["P3"]["lostTimeSec"], 1.0, places=1)

        self.assertEqual(cov["P4"]["observedFrames"], 0)
        self.assertEqual(cov["P4"]["lostFrames"], 2)
        self.assertEqual(cov["P4"]["observedCoveragePct"], 0.0)
        self.assertAlmostEqual(cov["P4"]["lostTimeSec"], 1.0, places=1)

        # Mean player coverage: a 4-player frame is NOT fully covered because 1 player exists
        self.assertEqual(metrics["observedCoveragePct"], 37.5)
        self.assertEqual(metrics["lostFramesPct"], 50.0)
        self.assertEqual(metrics["predictedFramesPct"], 12.5)

    def test_physical_court_margin_filtering(self):
        """Detections must be filtered using physical margin in meters in calibrated court space."""
        analyzer = BadmintonAnalyzerV2(
            game_type="doubles",
            max_players=2,
            court_roi_margin_m=0.5,  # 0.5 meter buffer around 6.10m x 13.40m
        )
        # Synthetic square court: 100,100 to 700,900
        corners = [[100.0, 100.0], [700.0, 100.0], [700.0, 900.0], [100.0, 900.0]]
        analyzer.set_court_corners(corners)
        analyzer._detector = "dummy"

        # Point A: Inside court (center 400, 500) -> accepted
        # Point B: Player 0.2m outside sideline (say x=80, which is 20px outside; 20px * (6.1/600) = 0.203m < 0.5m) -> accepted!
        # Point C: Spectator 1.0m outside sideline (say x=0, which is 100px outside; 100px * (6.1/600) = 1.01m > 0.5m) -> rejected!
        with patch.object(analyzer, "detect_and_track") as mock_det:
            mock_det.return_value = [
                {"bbox": [380, 450, 420, 500], "center": (400.0, 500.0), "conf": 0.9, "track_id": 1},
                {"bbox": [70, 450, 90, 500], "center": (80.0, 500.0), "conf": 0.88, "track_id": 2},
                {"bbox": [0, 450, 20, 500], "center": (0.0, 500.0), "conf": 0.85, "track_id": 3},
            ]
            frame = np.zeros((1000, 1000, 3), dtype=np.uint8)
            res = analyzer.process_frame(frame, timestamp_sec=0.1)

            active_bboxes = [p["bbox"] for p in res["players"] if p["bbox"] is not None]
            self.assertIn([380, 450, 420, 500], active_bboxes)
            self.assertIn([70, 450, 90, 500], active_bboxes)
            self.assertNotIn([0, 450, 20, 500], active_bboxes)

    def test_runtime_provenance_contract(self):
        """Backend must provide runtime provenance with models, devices, and settings."""
        from server import _build_session_metrics

        session = TrackingSession(
            session_id="test_prov_session",
            game_type="doubles",
            tracked_player_count=2,
            processing_config={"profile": "fast", "device": "auto"},
        )
        _, _, prov = _build_session_metrics(session)

        self.assertEqual(prov["detectorModel"], "yolov8n.pt")
        self.assertEqual(prov["trackerModel"], "bytetrack")
        self.assertEqual(prov["poseModel"], "yolov8n-pose.pt")
        self.assertEqual(prov["requestedProfile"], "fast")
        self.assertEqual(prov["effectiveProfile"], "fast")
        self.assertEqual(prov["requestedDevice"], "auto")
        self.assertIn(prov["effectiveDevice"], ["cpu", "cuda", "mps"])
        self.assertEqual(prov["detectorInputSize"], 416)
        self.assertEqual(prov["frameStride"], 3)
        self.assertEqual(prov["poseStride"], 2)
        self.assertTrue(prov["useCourtRoi"])
        self.assertEqual(prov["courtRoiMarginM"], 0.5)
        self.assertEqual(prov["runtime"], "pytorch")
        self.assertEqual(prov["precision"], "fp32")
        self.assertEqual(prov["poseArchitecture"], "roi_pose")
        self.assertFalse(prov["reidEnabled"])
        self.assertEqual(prov["confidenceThreshold"], 0.35)


if __name__ == "__main__":
    unittest.main()

