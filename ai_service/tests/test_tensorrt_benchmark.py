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
from dataclasses import replace
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
from benchmark_runner import (
    BenchmarkRunConfig,
    BenchmarkCommonConfig,
    BenchmarkRunMetrics,
    RUNTIME_PAIR_INVARIANTS,
    build_detector_matrix,
    build_runtime_comparison_pair,
    validate_runtime_comparison_pair,
)
from tensorrt_benchmark import (
    check_tensorrt_environment,
    get_qualified_detector_finalists,
    export_detector_to_tensorrt_fp16,
    build_tensorrt_run_config,
    run_tensorrt_fp16_benchmark,
    RuntimeComparisonSummary,
    compare_runtime_metrics,
    format_runtime_comparison_output,
    run_runtime_comparison_benchmark,
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

    def test_build_runtime_comparison_pair_fairness(self):
        """build_runtime_comparison_pair creates a strictly fair pair varying only runtime/precision."""
        baseline = build_detector_matrix(BenchmarkCommonConfig(device="cpu"))[0]
        pt_cfg, trt_cfg = build_runtime_comparison_pair(baseline)

        # Runtimes & Precisions
        self.assertEqual(pt_cfg.runtime, "pytorch")
        self.assertEqual(pt_cfg.precision, "fp32")
        self.assertIsNone(pt_cfg.model_artifact_reference)

        self.assertEqual(trt_cfg.runtime, "tensorrt")
        self.assertEqual(trt_cfg.precision, "fp16")

        # Invariants must strictly match across both
        for field_name in RUNTIME_PAIR_INVARIANTS:
            self.assertEqual(
                getattr(pt_cfg, field_name),
                getattr(trt_cfg, field_name),
                f"Field {field_name} must match exactly between PyTorch and TensorRT configs"
            )

    def test_validate_runtime_comparison_pair_enforces_invariants(self):
        """validate_runtime_comparison_pair rejects pairs with altered pipeline variables or invalid precision."""
        baseline = build_detector_matrix(BenchmarkCommonConfig(device="cpu"))[0]
        pt_cfg, trt_cfg = build_runtime_comparison_pair(baseline)

        # Count must be exactly 2
        with self.assertRaises(ValueError):
            validate_runtime_comparison_pair([pt_cfg])
        with self.assertRaises(ValueError):
            validate_runtime_comparison_pair([pt_cfg, trt_cfg, pt_cfg])

        # Must have one pytorch and one tensorrt
        with self.assertRaises(ValueError):
            validate_runtime_comparison_pair([pt_cfg, pt_cfg])

        # Modifying an invariant must fail
        altered_trt = replace(trt_cfg, tracker="botsort")
        with self.assertRaises(ValueError) as ctx:
            validate_runtime_comparison_pair([pt_cfg, altered_trt])
        self.assertIn("tracker", str(ctx.exception))

        altered_size = replace(trt_cfg, input_size=960)
        with self.assertRaises(ValueError) as ctx:
            validate_runtime_comparison_pair([pt_cfg, altered_size])
        self.assertIn("input_size", str(ctx.exception))

        # Precision must be fp16 for TensorRT
        altered_prec = replace(trt_cfg, precision="fp32")
        with self.assertRaises(ValueError) as ctx:
            validate_runtime_comparison_pair([pt_cfg, altered_prec])
        self.assertIn("fp16", str(ctx.exception))

    def test_compare_runtime_metrics_speedup_and_vram(self):
        """compare_runtime_metrics accurately evaluates speed and resource differences without fabricating VRAM."""
        pt_metrics = BenchmarkRunMetrics(
            analysis_fps=30.0,
            elapsed_seconds=10.0,
            processing_ratio=0.5,
            peak_vram_mb=1200.0,
            mean_target_coverage=0.96,
            simultaneous_target_coverage=0.92,
            lost_percent=4.0,
            raw_tracker_id_switches=1,
            semantic_player_id_switches=0,
        )
        trt_metrics = BenchmarkRunMetrics(
            analysis_fps=60.0,
            elapsed_seconds=5.0,
            processing_ratio=0.25,
            peak_vram_mb=800.0,
            mean_target_coverage=0.96,
            simultaneous_target_coverage=0.92,
            lost_percent=4.0,
            raw_tracker_id_switches=1,
            semantic_player_id_switches=0,
        )

        summary = compare_runtime_metrics(pt_metrics, trt_metrics, candidate_id="yolov8n", input_size=640)
        self.assertEqual(summary.fps_difference, 30.0)
        self.assertEqual(summary.speedup_ratio, 2.0)
        self.assertEqual(summary.elapsed_difference, -5.0)
        self.assertEqual(summary.processing_ratio_difference, -0.25)
        self.assertEqual(summary.vram_difference_mb, -400.0)
        self.assertFalse(summary.quality_regression)

        # When VRAM is not measurable, it remains None and is never fabricated
        pt_no_vram = replace(pt_metrics, peak_vram_mb=None)
        trt_no_vram = replace(trt_metrics, peak_vram_mb=None)
        summary_no_vram = compare_runtime_metrics(pt_no_vram, trt_no_vram)
        self.assertIsNone(summary_no_vram.vram_difference_mb)
        self.assertIsNone(summary_no_vram.pytorch_vram_mb)
        self.assertIsNone(summary_no_vram.tensorrt_vram_mb)

    def test_compare_runtime_metrics_quality_regression_detection(self):
        """compare_runtime_metrics flags regression when faster runtime degrades tracking correctness."""
        pt_metrics = BenchmarkRunMetrics(
            analysis_fps=25.0,
            elapsed_seconds=12.0,
            processing_ratio=0.6,
            mean_target_coverage=0.95,
            simultaneous_target_coverage=0.90,
            lost_percent=5.0,
            semantic_player_id_switches=0,
        )

        # Case 1: Faster FPS, but observed coverage drops by 4%
        trt_lower_cov = BenchmarkRunMetrics(
            analysis_fps=55.0,
            elapsed_seconds=5.5,
            processing_ratio=0.27,
            mean_target_coverage=0.91,
            simultaneous_target_coverage=0.85,
            lost_percent=9.0,
            semantic_player_id_switches=0,
        )
        s1 = compare_runtime_metrics(pt_metrics, trt_lower_cov)
        self.assertTrue(s1.quality_regression)
        self.assertTrue(any("coverage dropped" in n for n in s1.quality_regression_notes))
        self.assertTrue(any("Lost percent increased" in n for n in s1.quality_regression_notes))

        # Case 2: Faster FPS, but semantic ID switches occur
        trt_switches = BenchmarkRunMetrics(
            analysis_fps=55.0,
            elapsed_seconds=5.5,
            processing_ratio=0.27,
            mean_target_coverage=0.95,
            simultaneous_target_coverage=0.90,
            lost_percent=5.0,
            semantic_player_id_switches=2,
        )
        s2 = compare_runtime_metrics(pt_metrics, trt_switches)
        self.assertTrue(s2.quality_regression)
        self.assertTrue(any("Semantic identity switches increased" in n for n in s2.quality_regression_notes))

        # Case 3: Preserved quality -> No regression flag
        trt_good = BenchmarkRunMetrics(
            analysis_fps=55.0,
            elapsed_seconds=5.5,
            processing_ratio=0.27,
            mean_target_coverage=0.95,
            simultaneous_target_coverage=0.90,
            lost_percent=5.0,
            semantic_player_id_switches=0,
        )
        s3 = compare_runtime_metrics(pt_metrics, trt_good)
        self.assertFalse(s3.quality_regression)
        self.assertEqual(len(s3.quality_regression_notes), 0)

    def test_compare_runtime_metrics_ground_truth_errors(self):
        """Ground truth errors (court-position error, distance error) are evaluated when available."""
        pt_metrics = BenchmarkRunMetrics(
            analysis_fps=30.0,
            mean_court_position_error=0.10,
            distance_error=1.5,
        )
        trt_metrics = BenchmarkRunMetrics(
            analysis_fps=60.0,
            mean_court_position_error=0.12,
            distance_error=1.6,
        )
        summary = compare_runtime_metrics(pt_metrics, trt_metrics)
        self.assertAlmostEqual(summary.court_position_error_diff, 0.02, places=3)
        self.assertAlmostEqual(summary.distance_error_diff, 0.1, places=2)

        # When unavailable, remain None
        empty_pt = BenchmarkRunMetrics(analysis_fps=30.0)
        empty_trt = BenchmarkRunMetrics(analysis_fps=60.0)
        s_none = compare_runtime_metrics(empty_pt, empty_trt)
        self.assertIsNone(s_none.court_position_error_diff)
        self.assertIsNone(s_none.distance_error_diff)

    def test_format_runtime_comparison_output_has_required_sections(self):
        """format_runtime_comparison_output produces exact 5 sections required by Phase 1.6C."""
        pt_metrics = BenchmarkRunMetrics(
            analysis_fps=32.5,
            elapsed_seconds=9.8,
            processing_ratio=0.49,
            peak_vram_mb=1150.0,
            mean_target_coverage=0.94,
            simultaneous_target_coverage=0.88,
            lost_percent=6.0,
            raw_tracker_id_switches=2,
            semantic_player_id_switches=0,
            mean_court_position_error=0.15,
            distance_error=2.1,
        )
        trt_metrics = BenchmarkRunMetrics(
            analysis_fps=65.0,
            elapsed_seconds=4.9,
            processing_ratio=0.245,
            peak_vram_mb=780.0,
            mean_target_coverage=0.94,
            simultaneous_target_coverage=0.88,
            lost_percent=6.0,
            raw_tracker_id_switches=2,
            semantic_player_id_switches=0,
            mean_court_position_error=0.15,
            distance_error=2.1,
        )
        summary = compare_runtime_metrics(
            pt_metrics, trt_metrics, candidate_id="yolov8n", input_size=640, clip_id="B01_singles"
        )
        output = format_runtime_comparison_output(summary)

        self.assertIn("PYTORCH:", output)
        self.assertIn("TENSORRT:", output)
        self.assertIn("SPEED DIFFERENCE:", output)
        self.assertIn("QUALITY DIFFERENCE:", output)
        self.assertIn("RESOURCE DIFFERENCE:", output)
        self.assertIn("65.00", output)
        self.assertIn("2.00x speedup", output)
        self.assertIn("NONE", output)

    def test_run_runtime_comparison_benchmark_workflow(self):
        """run_runtime_comparison_benchmark runs only qualified finalists and generates comparison summaries."""
        with tempfile.TemporaryDirectory() as tmp_dir:
            tmp_path = Path(tmp_dir)
            # Setup measured finalist in results
            measured_bundle = {
                "datasetAvailable": True,
                "datasetStatus": "AVAILABLE",
                "results": [
                    {
                        "status": "SUCCESS",
                        "config": {"candidateId": "yolov8n"},
                        "metrics": {"meanTargetCoverage": 0.95},
                    },
                ],
            }
            (tmp_path / "run1.json").write_text(json.dumps(measured_bundle), encoding="utf-8")

            manifest = BenchmarkManifest(
                schema_version=1,
                manifest_id="test-manifest",
                updated_at="2026-09-21T00:00:00Z",
                clips=[
                    BenchmarkClipEntry(
                        id="C01",
                        name="Clip 01",
                        sport="badminton",
                        game_type="singles",
                        player_count=2,
                        camera_type="static",
                        camera_motion="static",
                        video_reference="clips/C01.mp4",
                        duration_sec=10.0,
                    )
                ],
            )
            clip_file = tmp_path / "clips" / "C01.mp4"
            clip_file.parent.mkdir(parents=True)
            clip_file.touch()

            baseline = build_detector_matrix(BenchmarkCommonConfig(device="cpu"))[0]

            def mock_execute(clip, config, video_path, root):
                if config.runtime == "tensorrt":
                    return BenchmarkRunMetrics(
                        analysis_fps=70.0,
                        elapsed_seconds=4.0,
                        processing_ratio=0.4,
                        mean_target_coverage=0.96,
                        simultaneous_target_coverage=0.92,
                        lost_percent=4.0,
                        semantic_player_id_switches=0,
                    )
                return BenchmarkRunMetrics(
                    analysis_fps=35.0,
                    elapsed_seconds=8.0,
                    processing_ratio=0.8,
                    mean_target_coverage=0.96,
                    simultaneous_target_coverage=0.92,
                    lost_percent=4.0,
                    semantic_player_id_switches=0,
                )

            bundle, summaries, status_msg = run_runtime_comparison_benchmark(
                manifest,
                workspace_root=tmp_path,
                baseline=baseline,
                benchmark_results_dir=tmp_dir,
                availability_checker=lambda _cfg, _root: (True, "Mock available"),
                execute_one=mock_execute,
            )

            self.assertTrue(bundle.dataset_available)
            self.assertEqual(len(summaries), 1)
            summary = summaries[0]
            self.assertEqual(summary.candidate_id, "yolov8n")
            self.assertEqual(summary.speedup_ratio, 2.0)
            self.assertFalse(summary.quality_regression)
            self.assertIn("TENSORRT", format_runtime_comparison_output(summary))


if __name__ == "__main__":
    unittest.main()
