"""
test_inference_runtime.py — Unit tests for Phase 1.6A Configurable Inference Runtime.

Verifies:
1. Runtime selection (pytorch, tensorrt) and precision (fp32, fp16).
2. Baseline defaults remain PyTorch FP32 with modelArtifactReference=None.
3. Explicit rejection of INT8 (not implemented).
4. Unavailable TensorRT raises RuntimeUnavailableError explicitly.
5. No silent fallback: TensorRT failure never secretly degrades to PyTorch.
6. Provenance truthfully records runtime, precision, actualModel, device, and modelArtifactReference.
"""

from __future__ import annotations
import unittest
from unittest.mock import MagicMock, patch
from pathlib import Path
import sys
import numpy as np

ai_service_dir = Path(__file__).parent.parent
if str(ai_service_dir) not in sys.path:
    sys.path.insert(0, str(ai_service_dir))

from engine_config import (
    TrackingEngineConfig,
    create_baseline_engine_config,
    validate_engine_config,
    validate_runtime_and_precision,
    is_tensorrt_available,
    RuntimeUnavailableError,
    InvalidEngineConfigError,
)
from detector_adapter import UltralyticsDetectorAdapter
from analyzer_v2 import BadmintonAnalyzerV2
from benchmark_schema import BenchmarkModelConfig, create_benchmark_run_from_session_dict
from benchmark_runner import (
    BenchmarkCommonConfig,
    BenchmarkRunConfig,
    _default_availability,
    build_detector_matrix,
    POSE_PAIR_INVARIANTS,
    TRACKER_PAIR_INVARIANTS,
)


class TestInferenceRuntime(unittest.TestCase):

    def test_baseline_runtime_defaults(self):
        """Baseline configuration must remain PyTorch FP32 with no model artifact override."""
        cfg = create_baseline_engine_config()
        self.assertEqual(cfg.runtime, "pytorch")
        self.assertEqual(cfg.precision, "fp32")
        self.assertIsNone(cfg.model_artifact_reference)

        serialized = cfg.to_dict()
        self.assertEqual(serialized["runtime"], "pytorch")
        self.assertEqual(serialized["precision"], "fp32")
        self.assertIsNone(serialized.get("modelArtifactReference"))

        round_trip = TrackingEngineConfig.from_dict(serialized)
        self.assertEqual(round_trip.runtime, "pytorch")
        self.assertEqual(round_trip.precision, "fp32")
        self.assertIsNone(round_trip.model_artifact_reference)

    def test_precision_validation(self):
        """Supported precisions are fp32 and fp16; int8 must be explicitly rejected."""
        validate_runtime_and_precision("pytorch", "fp32", device="cpu")
        validate_runtime_and_precision("pytorch", "fp16", device="cpu")

        with self.assertRaises(InvalidEngineConfigError) as ctx:
            validate_runtime_and_precision("pytorch", "int8", device="cpu")
        self.assertIn("INT8 is not implemented", str(ctx.exception))

        with self.assertRaises(InvalidEngineConfigError):
            validate_runtime_and_precision("pytorch", "fp64", device="cpu")

    def test_int8_rejected_in_engine_config(self):
        """TrackingEngineConfig validation must reject int8 precision explicitly."""
        cfg = TrackingEngineConfig(
            detector_model="yolov8n.pt",
            precision="int8",
        )
        with self.assertRaises(InvalidEngineConfigError) as ctx:
            validate_engine_config(cfg)
        self.assertIn("INT8 is not implemented", str(ctx.exception))

    def test_invalid_runtime_rejected(self):
        """Unsupported runtimes (e.g. openvino, onnx) must raise InvalidEngineConfigError."""
        with self.assertRaises(InvalidEngineConfigError):
            validate_runtime_and_precision("openvino", "fp32", device="cpu")

        with self.assertRaises(InvalidEngineConfigError):
            validate_runtime_and_precision("onnx", "fp32", device="cpu")

    def test_tensorrt_unavailable_fails_explicitly(self):
        """When TensorRT is requested and unavailable, it must raise RuntimeUnavailableError."""
        with patch("engine_config.is_tensorrt_available", return_value=(False, "TensorRT library (tensorrt) not installed")):
            cfg = TrackingEngineConfig(
                detector_model="yolov8n.pt",
                runtime="tensorrt",
                precision="fp16",
                device="cuda:0",
            )
            with self.assertRaises(RuntimeUnavailableError) as ctx:
                validate_engine_config(cfg)
            self.assertIn("TensorRT runtime is unavailable", str(ctx.exception))

    def test_no_silent_fallback_in_adapter(self):
        """UltralyticsDetectorAdapter must fail explicitly with RuntimeUnavailableError if TensorRT is unavailable."""
        with patch("engine_config.is_tensorrt_available", return_value=(False, "CUDA is not available on this system")):
            adapter = UltralyticsDetectorAdapter(
                model_path="yolov8n.pt",
                device="cpu",
                runtime="tensorrt",
                precision="fp16",
            )
            with self.assertRaises(RuntimeUnavailableError):
                adapter._init_model()

            # Ensure adapter did NOT fall back silently to PyTorch
            self.assertIsNone(adapter._model)
            self.assertEqual(adapter.runtime, "tensorrt")

    def test_tensorrt_available_without_artifact_fails_explicitly(self):
        """TensorRT runtime requires a valid TensorRT model artifact (.engine)."""
        with patch("engine_config.is_tensorrt_available", return_value=(True, "TensorRT is available")):
            cfg = TrackingEngineConfig(
                detector_model="yolov8n.pt",
                runtime="tensorrt",
                precision="fp16",
                device="cuda:0",
                model_artifact_reference="nonexistent.engine",
            )
            with self.assertRaises(RuntimeUnavailableError) as ctx:
                validate_engine_config(cfg)
            self.assertIn("Model artifact file not found", str(ctx.exception))

    def test_provenance_truthfulness_in_analyzer(self):
        """BadmintonAnalyzerV2 provenance and telemetry must faithfully record runtime, precision, device, and actualModel."""
        cfg = create_baseline_engine_config(
            runtime="pytorch",
            precision="fp16",
        )
        analyzer = BadmintonAnalyzerV2(engine_config=cfg)
        analyzer._detector = "dummy"

        prov = analyzer.get_provenance()
        self.assertEqual(prov["runtime"], "pytorch")
        self.assertEqual(prov["precision"], "fp16")
        self.assertEqual(prov["actualModel"], "yolov8n.pt")
        self.assertIsNone(prov["modelArtifactReference"])
        self.assertEqual(prov["device"], analyzer.device)

        # Telemetry per-frame provenance
        frame = np.zeros((480, 640, 3), dtype=np.uint8)
        telemetry = analyzer.process_frame(frame, timestamp_sec=0.0)
        self.assertEqual(telemetry["runtime"], "pytorch")
        self.assertEqual(telemetry["precision"], "fp16")
        self.assertEqual(telemetry["actualModel"], "yolov8n.pt")
        self.assertEqual(telemetry["device"], analyzer.device)

    def test_benchmark_schema_provenance(self):
        """Benchmark schema must serialize and deserialize runtime, precision, actualModel, and modelArtifactReference."""
        model_cfg = BenchmarkModelConfig(
            detector_name="yolov8n",
            pose_model="yolov8n-pose",
            tracker_name="bytetrack",
            detector_input_size=640,
            confidence_threshold=0.35,
            frame_stride=1,
            pose_stride=1,
            max_players=4,
            device="cuda:0",
            runtime="tensorrt",
            precision="fp16",
            model_artifact_reference="models/yolov8n_fp16.engine",
            actual_model="yolov8n_fp16.engine",
        )
        data = model_cfg.to_dict()
        self.assertEqual(data["runtime"], "tensorrt")
        self.assertEqual(data["precision"], "fp16")
        self.assertEqual(data["modelArtifactReference"], "models/yolov8n_fp16.engine")
        self.assertEqual(data["actualModel"], "yolov8n_fp16.engine")

        restored = BenchmarkModelConfig.from_dict(data)
        self.assertEqual(restored.runtime, "tensorrt")
        self.assertEqual(restored.precision, "fp16")
        self.assertEqual(restored.model_artifact_reference, "models/yolov8n_fp16.engine")
        self.assertEqual(restored.actual_model, "yolov8n_fp16.engine")

    def test_benchmark_runner_availability_checks_tensorrt(self):
        """Benchmark runner _default_availability must report UNAVAILABLE if TensorRT runtime is not ready."""
        config = BenchmarkRunConfig(
            config_id="trt_test",
            candidate_id="yolov8n",
            detector="yolov8n.pt",
            detector_family="yolov8",
            input_size=640,
            tracker="bytetrack",
            tracker_config=None,
            reid_enabled=False,
            reid_model=None,
            pose_model="yolov8n-pose.pt",
            pose_architecture="roi_pose",
            runtime="tensorrt",
            precision="fp16",
            device="cuda:0",
            frame_stride=1,
            pose_stride=1,
            confidence_threshold=0.35,
            court_roi_enabled=False,
        )
        with patch("engine_config.is_tensorrt_available", return_value=(False, "TensorRT library not installed")):
            avail, reason = _default_availability(config, workspace_root=Path.cwd())
            self.assertFalse(avail)
            self.assertIn("TensorRT runtime unavailable", reason)

    def test_benchmark_invariants_include_runtime_and_precision(self):
        """Both POSE_PAIR_INVARIANTS and TRACKER_PAIR_INVARIANTS must include runtime, precision, and model_artifact_reference."""
        for inv in ("runtime", "precision", "model_artifact_reference"):
            self.assertIn(inv, POSE_PAIR_INVARIANTS)
            self.assertIn(inv, TRACKER_PAIR_INVARIANTS)


if __name__ == "__main__":
    unittest.main()
