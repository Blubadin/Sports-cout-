"""
test_vision_engine_seams.py — Unit tests for Phase 1.1 Configurable Vision Engine Seams.

Verifies:
1. Baseline config reproduces current default values
2. Detector model is configurable
3. Pose model is configurable and can be cleanly disabled
4. Tracker name and custom tracker configs are configurable
5. Benchmark and session provenance records actual configured runtime values
6. Invalid configuration fails explicitly with clear exceptions
7. No silent model fallback (missing models fail explicitly, never degrade silently)
8. Output schema remains compliant with TrackingTelemetryV1
"""

from __future__ import annotations
import unittest
from unittest.mock import MagicMock, patch
from pathlib import Path
import sys
import numpy as np

# Ensure ai_service is on sys.path
ai_service_dir = Path(__file__).parent.parent
if str(ai_service_dir) not in sys.path:
    sys.path.insert(0, str(ai_service_dir))

from engine_config import (
    TrackingEngineConfig,
    create_baseline_engine_config,
    validate_engine_config,
    resolve_tracker_config,
    InvalidEngineConfigError,
    ModelNotFoundError,
)
from detector_adapter import BaseDetectorAdapter, UltralyticsDetectorAdapter
from tracker_adapter import NormalizedTrackResult, TrackerProvenance
from pose_adapter import (
    BasePoseAdapter,
    UltralyticsPoseAdapter,
    DisabledPoseAdapter,
    PoseArchitectureNotImplementedError,
)
from analyzer_v2 import BadmintonAnalyzerV2
from server import TrackingSession, _build_session_metrics, resolve_processing_config


class TestVisionEngineSeams(unittest.TestCase):

    def test_baseline_config_reproduces_defaults(self):
        """Baseline config must preserve YOLOv8n + YOLOv8n-pose + ByteTrack @ 640px PyTorch FP32."""
        cfg = create_baseline_engine_config()
        self.assertEqual(cfg.detector_model, "yolov8n.pt")
        self.assertEqual(cfg.detector_family, "yolov8")
        self.assertEqual(cfg.pose_model, "yolov8n-pose.pt")
        self.assertEqual(cfg.pose_family, "yolov8")
        self.assertEqual(cfg.tracker_name, "bytetrack")
        self.assertIsNone(cfg.tracker_config_path)
        self.assertIsNone(cfg.tracker_config)
        self.assertFalse(cfg.reid_enabled)
        self.assertIsNone(cfg.reid_model)
        self.assertEqual(cfg.runtime, "pytorch")
        self.assertEqual(cfg.precision, "fp32")
        self.assertEqual(cfg.detector_input_size, 640)
        self.assertEqual(cfg.confidence_threshold, 0.35)
        self.assertEqual(cfg.frame_stride, 1)
        self.assertEqual(cfg.pose_stride, 1)
        self.assertEqual(cfg.pose_architecture, "roi_pose")
        self.assertEqual(cfg.to_dict()["poseArchitecture"], "roi_pose")

    def test_full_frame_pose_configuration_is_supported(self):
        """Full frame pose architecture can be configured and truthfully recorded."""
        cfg = create_baseline_engine_config(pose_architecture="full_frame_pose", pose_model=None)
        self.assertEqual(cfg.pose_architecture, "full_frame_pose")
        self.assertEqual(cfg.to_dict()["poseArchitecture"], "full_frame_pose")

        analyzer = BadmintonAnalyzerV2(engine_config=cfg)
        self.assertEqual(analyzer.pose_architecture, "full_frame_pose")
        self.assertEqual(analyzer.get_provenance()["poseArchitecture"], "full_frame_pose")

    def test_unknown_pose_architecture_is_rejected(self):
        """Only registered pose architectures may be configured."""
        with self.assertRaises(InvalidEngineConfigError):
            create_baseline_engine_config(pose_architecture="unknown_pose")

    def test_detector_model_configurable(self):
        """Detector model name must be configurable and reflected in analyzer and provenance."""
        custom_cfg = create_baseline_engine_config(
            detector_model="yolo11n.pt",
            detector_family="yolo11",
        )
        analyzer = BadmintonAnalyzerV2(engine_config=custom_cfg)
        self.assertEqual(analyzer.model_path, "yolo11n.pt")
        self.assertEqual(analyzer.engine_config.detector_family, "yolo11")

        prov = analyzer.get_provenance()
        self.assertEqual(prov["detectorModel"], "yolo11n.pt")
        self.assertEqual(prov["detectorFamily"], "yolo11")

    def test_pose_model_configurable_and_disabled(self):
        """Pose model can be configured or set to None/disabled with DisabledPoseAdapter."""
        disabled_cfg = create_baseline_engine_config(pose_model=None)
        analyzer = BadmintonAnalyzerV2(engine_config=disabled_cfg)

        frame = np.zeros((480, 640, 3), dtype=np.uint8)
        bbox = [100.0, 100.0, 200.0, 300.0]
        pose_res = analyzer._estimate_pose(frame, bbox)

        self.assertIsInstance(analyzer.pose_adapter, DisabledPoseAdapter)
        self.assertEqual(pose_res, {"keypoints": [], "metrics": {}})
        self.assertIsNone(analyzer.get_provenance()["poseModel"])

    def test_tracker_name_and_custom_config_resolution(self):
        """Tracker resolution maps known trackers and validates custom configs."""
        self.assertEqual(resolve_tracker_config("bytetrack"), "bytetrack.yaml")
        self.assertEqual(resolve_tracker_config("botsort"), "botsort.yaml")
        self.assertEqual(resolve_tracker_config("botsort_reid"), "botsort.yaml")
        self.assertEqual(resolve_tracker_config("botsort", "botsort.yaml"), "botsort.yaml")

        with self.assertRaises(InvalidEngineConfigError):
            resolve_tracker_config("unknown_magic_tracker")

        with self.assertRaises(ModelNotFoundError):
            resolve_tracker_config("bytetrack", tracker_config_path="nonexistent_tracker.yaml")

    def test_normalized_raw_track_id_never_becomes_semantic_player_id(self):
        track = NormalizedTrackResult(
            bbox=(10.0, 20.0, 30.0, 60.0),
            confidence=0.91,
            raw_track_id=17,
            provenance=TrackerProvenance("botsort", None, False, None),
        )
        detection = track.to_detection()

        self.assertEqual(detection["rawTrackId"], 17)
        self.assertEqual(detection["track_id"], 17)
        self.assertNotIn("playerId", detection)
        self.assertEqual(detection["trackerProvenance"]["trackerName"], "botsort")

    def test_tracker_reid_provenance_is_explicit(self):
        cfg = create_baseline_engine_config(
            tracker_name="botsort_reid",
            reid_enabled=False,
            reid_model=None,
        )
        analyzer = BadmintonAnalyzerV2(engine_config=cfg)
        provenance = analyzer.get_provenance()

        self.assertEqual(provenance["trackerName"], "botsort_reid")
        self.assertFalse(provenance["reidEnabled"])
        self.assertIsNone(provenance["reidModel"])

    def test_invalid_engine_config_fails_explicitly(self):
        """Invalid runtime, precision, or parameter ranges must raise InvalidEngineConfigError."""
        with self.assertRaises(InvalidEngineConfigError):
            cfg = create_baseline_engine_config(runtime="unsupported_runtime")

        with self.assertRaises(InvalidEngineConfigError):
            cfg = create_baseline_engine_config(precision="int4")

        with self.assertRaises(InvalidEngineConfigError):
            cfg = create_baseline_engine_config(detector_input_size=-100)

        with self.assertRaises(InvalidEngineConfigError):
            cfg = create_baseline_engine_config(confidence_threshold=1.5)

        with self.assertRaises(InvalidEngineConfigError):
            cfg = create_baseline_engine_config(frame_stride=0)

    def test_no_silent_model_fallback(self):
        """Missing or corrupt model files must raise ModelNotFoundError, never silently fall back."""
        adapter = UltralyticsDetectorAdapter(model_path="completely_nonexistent_model_xyz.pt")
        frame = np.zeros((480, 640, 3), dtype=np.uint8)

        with self.assertRaises(ModelNotFoundError):
            adapter.detect_and_track(frame)

        pose_adapter = UltralyticsPoseAdapter(model_path="completely_nonexistent_pose_xyz.pt")
        with self.assertRaises(ModelNotFoundError):
            pose_adapter.estimate_pose_in_roi(frame, [10, 10, 50, 100])

    def test_benchmark_provenance_records_actual_configuration(self):
        """Session metrics and benchmark adapter record truthful vision configuration."""
        session = TrackingSession(
            session_id="test_vision_seams_session",
            game_type="doubles",
            tracked_player_count=2,
            processing_config={
                "profile": "custom",
                "detectorModel": "yolo11n_custom.pt",
                "detectorFamily": "yolo11",
                "poseModel": "yolo11n-pose_custom.pt",
                "poseFamily": "yolo11",
                "trackerName": "botsort",
                "trackerConfig": "botsort.yaml",
                "reidEnabled": False,
                "reidModel": None,
                "runtime": "pytorch",
                "precision": "fp16",
                "detectorInputSize": 512,
            },
        )
        _, _, prov = _build_session_metrics(session)

        self.assertEqual(prov["detectorModel"], "yolo11n_custom.pt")
        self.assertEqual(prov["detectorFamily"], "yolo11")
        self.assertEqual(prov["poseModel"], "yolo11n-pose_custom.pt")
        self.assertEqual(prov["poseFamily"], "yolo11")
        self.assertEqual(prov["poseArchitecture"], "roi_pose")
        self.assertEqual(prov["trackerName"], "botsort")
        self.assertEqual(prov["trackerModel"], "botsort")
        self.assertEqual(prov["trackerConfig"], "botsort.yaml")
        self.assertFalse(prov["reidEnabled"])
        self.assertIsNone(prov["reidModel"])
        self.assertEqual(prov["runtime"], "pytorch")
        self.assertEqual(prov["precision"], "fp16")
        self.assertEqual(prov["detectorInputSize"], 512)

    def test_tracking_telemetry_shape_preserved(self):
        """Output of BadmintonAnalyzerV2 with engine_config preserves TrackingTelemetryV1 schema."""
        cfg = create_baseline_engine_config(pose_model=None)
        analyzer = BadmintonAnalyzerV2(engine_config=cfg)
        analyzer._detector = "dummy"

        frame = np.zeros((480, 640, 3), dtype=np.uint8)
        telemetry = analyzer.process_frame(frame, timestamp_sec=0.033)

        self.assertIn("frameIndex", telemetry)
        self.assertIn("timestampSec", telemetry)
        self.assertIn("players", telemetry)
        self.assertEqual(telemetry["schemaVersion"], 1)
        self.assertIsInstance(telemetry["players"], list)
        self.assertEqual(len(telemetry["players"]), 4)  # doubles default


if __name__ == "__main__":
    unittest.main()
