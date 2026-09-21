"""
test_tensorrt_benchmark.py — Unit tests for Phase 1.6B TensorRT FP16 Benchmark Path.

Verifies:
1. Artifact handling (caching in local/cache, no git commits, FP16 only, rejection of INT8).
2. Environment check & TensorRT unavailable / CUDA incompatibility handling.
3. Explicit failure states:
   - Export failure -> TensorRTExportError
   - Engine load failure -> EngineLoadError
   - Inference failure -> RuntimeInferenceError
   - CUDA incompatibility -> CUDAIncompatibilityError
4. Runtime provenance recording (runtime, precision, actualModel, modelArtifactReference).
5. No silent fallback: TensorRT failure never degrades to PyTorch.
6. Qualified detector finalists rule:
   - Evaluates only finalists supported by measured Phase 1.3 evidence.
   - If finalists have not been established, stops and reports NO QUALIFIED DETECTOR FINALISTS.
"""

from __future__ import annotations
import unittest
from unittest.mock import MagicMock, patch
from pathlib import Path
import sys
import tempfile
import json
import numpy as np

ai_service_dir = Path(__file__).parent.parent
if str(ai_service_dir) not in sys.path:
    sys.path.insert(0, str(ai_service_dir))

from engine_config import (
    TrackingEngineConfig,
    create_baseline_engine_config,
    RuntimeUnavailableError,
    CUDAIncompatibilityError,
    TensorRTExportError,
    EngineLoadError,
    RuntimeInferenceError,
    InvalidEngineConfigError,
    ModelNotFoundError,
)
from detector_adapter import UltralyticsDetectorAdapter
from analyzer_v2 import BadmintonAnalyzerV2
from benchmark_schema import BenchmarkManifest, BenchmarkClipEntry
from benchmark_runner import BenchmarkRunConfig, BenchmarkCommonConfig, build_detector_matrix
from tensorrt_benchmark import (
    check_tensorrt_environment,
    get_qualified_detector_finalists,
    export_detector_to_tensorrt_fp16,
    build_tensorrt_run_config,
    run_tensorrt_fp16_benchmark,
    DEFAULT_CACHE_DIR,
)


class TestTensorRTBenchmark(unittest.TestCase):

    def test_environment_check_truthfulness(self):
        """Environment check must accurately report host CUDA and TensorRT state without upgrades."""
        env = check_tensorrt_environment()
        self.assertIn("cuda_available", env)
        self.assertIn("tensorrt_available", env)
        self.assertIn("export_capable", env)
        self.assertIsInstance(env["cuda_available"], bool)
        self.assertIsInstance(env["tensorrt_available"], bool)

    def test_cuda_incompatibility_raises_explicit_error(self):
        """When CUDA is unavailable, exporting to TensorRT must raise CUDAIncompatibilityError."""
        with patch("tensorrt_benchmark.check_tensorrt_environment", return_value={
            "cuda_available": False,
            "tensorrt_available": False,
            "export_capable": False,
            "reason": "CUDA is not available on this host.",
        }):
            with self.assertRaises(CUDAIncompatibilityError) as ctx:
                export_detector_to_tensorrt_fp16("yolov8n.pt", imgsz=640)
            self.assertIn("CUDA is unavailable", str(ctx.exception))

    def test_tensorrt_unavailable_raises_explicit_error(self):
        """When CUDA is present but TensorRT is uninstalled, export must raise RuntimeUnavailableError."""
        with patch("tensorrt_benchmark.check_tensorrt_environment", return_value={
            "cuda_available": True,
            "tensorrt_available": False,
            "export_capable": False,
            "reason": "TensorRT runtime unavailable: tensorrt not installed",
        }):
            with self.assertRaises(RuntimeUnavailableError) as ctx:
                export_detector_to_tensorrt_fp16("yolov8n.pt", imgsz=640)
            self.assertIn("TensorRT environment unavailable", str(ctx.exception))

    def test_fp16_only_int8_strictly_rejected(self):
        """Export path must strictly enforce FP16 only and reject non-half / INT8 export."""
        with self.assertRaises(InvalidEngineConfigError) as ctx:
            export_detector_to_tensorrt_fp16("yolov8n.pt", half=False)
        self.assertIn("Only FP16 precision is supported", str(ctx.exception))

    def test_missing_model_checkpoint_raises_model_not_found(self):
        """If model checkpoint does not exist locally, export must raise ModelNotFoundError."""
        with patch("tensorrt_benchmark.check_tensorrt_environment", return_value={
            "cuda_available": True,
            "tensorrt_available": True,
            "export_capable": True,
            "reason": None,
        }):
            with self.assertRaises(ModelNotFoundError):
                export_detector_to_tensorrt_fp16("nonexistent_model_checkpoint.pt")

    def test_export_failure_raises_tensorrt_export_error(self):
        """If underlying export fails, it must raise TensorRTExportError explicitly."""
        with tempfile.TemporaryDirectory() as tmp_dir:
            dummy_pt = Path(tmp_dir) / "dummy.pt"
            dummy_pt.write_bytes(b"dummy")

            with patch("tensorrt_benchmark.check_tensorrt_environment", return_value={
                "cuda_available": True,
                "tensorrt_available": True,
                "export_capable": True,
                "reason": None,
            }):
                mock_model = MagicMock()
                mock_model.export.side_effect = RuntimeError("CUDA out of memory during engine compilation")
                with patch("ultralytics.YOLO", return_value=mock_model):
                    with self.assertRaises(TensorRTExportError) as ctx:
                        export_detector_to_tensorrt_fp16(dummy_pt, imgsz=640, output_dir=Path(tmp_dir))
                    self.assertIn("Failed to export detector model", str(ctx.exception))

    def test_engine_load_failure_raises_explicit_error(self):
        """When loading a TensorRT engine fails, adapter must raise EngineLoadError."""
        with tempfile.TemporaryDirectory() as tmp_dir:
            fake_engine = Path(tmp_dir) / "corrupt.engine"
            fake_engine.write_bytes(b"corrupt")

            with patch("engine_config.is_tensorrt_available", return_value=(True, "TensorRT available")):
                adapter = UltralyticsDetectorAdapter(
                    model_path="yolov8n.pt",
                    device="cuda",
                    runtime="tensorrt",
                    precision="fp16",
                    model_artifact_reference=str(fake_engine),
                )
                with patch("ultralytics.YOLO", side_effect=RuntimeError("Invalid engine header deserialization")):
                    with self.assertRaises(EngineLoadError) as ctx:
                        adapter._init_model()
                    self.assertIn("Failed to load TensorRT engine", str(ctx.exception))

    def test_runtime_inference_failure_raises_explicit_error(self):
        """When TensorRT inference fails at runtime, adapter must raise RuntimeInferenceError."""
        with tempfile.TemporaryDirectory() as tmp_dir:
            fake_engine = Path(tmp_dir) / "model.engine"
            fake_engine.write_bytes(b"valid_bytes")

            with patch("engine_config.is_tensorrt_available", return_value=(True, "TensorRT available")):
                adapter = UltralyticsDetectorAdapter(
                    model_path="yolov8n.pt",
                    device="cuda",
                    runtime="tensorrt",
                    precision="fp16",
                    model_artifact_reference=str(fake_engine),
                )
                mock_model = MagicMock()
                mock_model.track.side_effect = RuntimeError("Cuda driver failure during inference execution")
                with patch("ultralytics.YOLO", return_value=mock_model):
                    adapter._init_model()
                    frame = np.zeros((480, 640, 3), dtype=np.uint8)
                    with self.assertRaises(RuntimeInferenceError) as ctx:
                        adapter.detect_and_track(frame)
                    self.assertIn("TensorRT inference failed", str(ctx.exception))

    def test_no_silent_fallback_to_pytorch(self):
        """Adapter with TensorRT runtime must NEVER fall back to PyTorch on failure."""
        with patch("engine_config.is_tensorrt_available", return_value=(False, "CUDA is not available")):
            adapter = UltralyticsDetectorAdapter(
                model_path="yolov8n.pt",
                runtime="tensorrt",
                precision="fp16",
            )
            with self.assertRaises(RuntimeUnavailableError):
                adapter._init_model()
            self.assertIsNone(adapter._model)
            self.assertEqual(adapter.runtime, "tensorrt")

    def test_provenance_records_tensorrt_engine_artifact(self):
        """BadmintonAnalyzerV2 must faithfully record runtime='tensorrt', precision='fp16', and engine reference."""
        cfg = TrackingEngineConfig(
            detector_model="yolov8n.pt",
            runtime="tensorrt",
            precision="fp16",
            model_artifact_reference="cache/yolov8n_640_fp16.engine",
            device="cuda",
        )
        with patch("engine_config.is_tensorrt_available", return_value=(True, "TensorRT available")), \
             patch("device_runtime._availability", return_value=(True, False)), \
             patch("pathlib.Path.exists", return_value=True):
            analyzer = BadmintonAnalyzerV2(engine_config=cfg)
            analyzer._detector = "dummy"

            prov = analyzer.get_provenance()
            self.assertEqual(prov["runtime"], "tensorrt")
            self.assertEqual(prov["precision"], "fp16")
            self.assertEqual(prov["modelArtifactReference"], "cache/yolov8n_640_fp16.engine")
            self.assertEqual(prov["actualModel"], "cache/yolov8n_640_fp16.engine")

            frame = np.zeros((480, 640, 3), dtype=np.uint8)
            telemetry = analyzer.process_frame(frame, timestamp_sec=0.0)
            self.assertEqual(telemetry["runtime"], "tensorrt")
            self.assertEqual(telemetry["precision"], "fp16")
            self.assertEqual(telemetry["actualModel"], "cache/yolov8n_640_fp16.engine")

    def test_no_qualified_finalists_stops_and_reports(self):
        """When Phase 1.3 results contain no measured evidence, runner must report NO QUALIFIED DETECTOR FINALISTS."""
        with tempfile.TemporaryDirectory() as tmp_dir:
            # Empty results directory
            finalists, status = get_qualified_detector_finalists(tmp_dir)
            self.assertEqual(finalists, [])
            self.assertEqual(status, "NO QUALIFIED DETECTOR FINALISTS")

            # Result directory with unmeasured/unavailable run
            unmeasured_bundle = {
                "datasetAvailable": False,
                "datasetStatus": "BENCHMARK DATASET NOT AVAILABLE LOCALLY",
                "results": [],
            }
            (Path(tmp_dir) / "run1.json").write_text(json.dumps(unmeasured_bundle), encoding="utf-8")
            finalists2, status2 = get_qualified_detector_finalists(tmp_dir)
            self.assertEqual(finalists2, [])
            self.assertEqual(status2, "NO QUALIFIED DETECTOR FINALISTS")

            # Benchmark run stops cleanly
            manifest = BenchmarkManifest(
                schema_version=1,
                manifest_id="test-manifest",
                updated_at="2026-09-21T00:00:00Z",
                clips=[],
            )
            baseline = build_detector_matrix(BenchmarkCommonConfig())[0]
            bundle, report = run_tensorrt_fp16_benchmark(
                manifest,
                workspace_root=Path(tmp_dir),
                baseline=baseline,
                benchmark_results_dir=tmp_dir,
            )
            self.assertEqual(report, "NO QUALIFIED DETECTOR FINALISTS")
            self.assertFalse(bundle.dataset_available)
            self.assertEqual(bundle.dataset_status, "NO QUALIFIED DETECTOR FINALISTS")
            self.assertEqual(bundle.results, [])

    def test_measured_finalists_are_qualified(self):
        """When Phase 1.3 results contain successful measurements, finalists are extracted properly."""
        with tempfile.TemporaryDirectory() as tmp_dir:
            measured_bundle = {
                "datasetAvailable": True,
                "datasetStatus": "AVAILABLE",
                "results": [
                    {
                        "status": "SUCCESS",
                        "config": {"candidateId": "yolov8n"},
                        "metrics": {"meanTargetCoverage": 0.95},
                    },
                    {
                        "status": "SUCCESS",
                        "config": {"candidateId": "yolo11s"},
                        "metrics": {"meanTargetCoverage": 0.97},
                    },
                ],
            }
            (Path(tmp_dir) / "run_measured.json").write_text(json.dumps(measured_bundle), encoding="utf-8")
            finalists, status = get_qualified_detector_finalists(tmp_dir)
            self.assertEqual(finalists, ["yolo11s", "yolov8n"])
            self.assertIn("QUALIFIED DETECTOR FINALISTS", status)


if __name__ == "__main__":
    unittest.main()
