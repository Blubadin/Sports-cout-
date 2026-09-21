"""Phase 1.3 detector benchmark matrix runner behavior tests."""

from __future__ import annotations

import csv
import json
import sys
import tempfile
import unittest
from pathlib import Path

ai_service_dir = Path(__file__).parent.parent
if str(ai_service_dir) not in sys.path:
    sys.path.insert(0, str(ai_service_dir))

from benchmark_schema import BenchmarkClipEntry, BenchmarkManifest
from benchmark_runner import (
    BenchmarkCommonConfig,
    BenchmarkExecutionError,
    BenchmarkRunMetrics,
    build_detector_matrix,
    compute_phase_zero_metrics,
    execute_tracking_run,
    load_benchmark_manifest,
    load_benchmark_bundle,
    main,
    resolve_local_model_path,
    run_benchmark_matrix,
    save_benchmark_bundle,
)


FIXED_TIME = "2026-09-21T14:05:00Z"


def make_manifest(video_reference: str = "clips/B01.mp4") -> BenchmarkManifest:
    return BenchmarkManifest(
        schema_version=1,
        manifest_id="phase-1-3-test",
        updated_at=FIXED_TIME,
        clips=[
            BenchmarkClipEntry(
                id="B01",
                name="Local clip",
                sport="badminton",
                game_type="singles",
                player_count=2,
                camera_type="static_rear",
                camera_motion="static",
                video_reference=video_reference,
                duration_sec=10.0,
                source_width=1920,
                source_height=1080,
                source_fps=30.0,
                court_calibration_reference="calibration_rear",
            )
        ],
    )


def measured_metrics() -> BenchmarkRunMetrics:
    return BenchmarkRunMetrics(
        player_coverage={
            "P1": {
                "observedCoverage": 1.0,
                "predictedPercent": 0.0,
                "lostPercent": 0.0,
                "meanObservedConfidence": 0.91,
            }
        },
        mean_target_coverage=1.0,
        simultaneous_target_coverage=1.0,
        predicted_percent=0.0,
        lost_percent=0.0,
        mean_observed_confidence=0.91,
        analysis_fps=12.5,
        elapsed_seconds=4.0,
        processing_ratio=0.4,
        effective_telemetry_hz=15.0,
        peak_vram_mb=None,
    )


class TestDetectorBenchmarkRunner(unittest.TestCase):
    def test_builds_exact_deterministic_matrix_with_fair_common_variables(self):
        common = BenchmarkCommonConfig(device="cpu")
        first = build_detector_matrix(common)
        second = build_detector_matrix(common)

        expected = [
            ("yolov8n", 640),
            ("yolo11s", 640),
            ("yolo11s", 960),
            ("yolo11m", 640),
            ("yolo11m", 960),
            ("yolo26s", 640),
            ("yolo26s", 960),
            ("yolo26m", 640),
            ("yolo26m", 960),
        ]
        self.assertEqual([(c.candidate_id, c.input_size) for c in first], expected)
        self.assertEqual([c.to_dict() for c in first], [c.to_dict() for c in second])
        self.assertNotIn(1280, [c.input_size for c in first])

        invariant_fields = (
            "tracker",
            "pose_model",
            "runtime",
            "precision",
            "device",
            "frame_stride",
            "pose_stride",
            "confidence_threshold",
        )
        for field_name in invariant_fields:
            self.assertEqual(len({getattr(c, field_name) for c in first}), 1)

    def test_failure_is_recorded_without_erasing_later_results(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            clip_path = root / "clips" / "B01.mp4"
            clip_path.parent.mkdir(parents=True)
            clip_path.touch()
            configs = build_detector_matrix(BenchmarkCommonConfig(device="cpu"))[:3]

            calls = []

            def executor(clip, config, _video_path, _root):
                calls.append(config.config_id)
                if config.input_size == 640 and config.candidate_id == "yolo11s":
                    raise RuntimeError("deliberate inference failure")
                return measured_metrics()

            bundle = run_benchmark_matrix(
                make_manifest(),
                root,
                configs=configs,
                execute_one=executor,
                availability_checker=lambda _config, _root: (True, "available"),
                timestamp_factory=lambda: FIXED_TIME,
            )

            self.assertEqual([r.status for r in bundle.results], ["SUCCESS", "FAILED", "SUCCESS"])
            self.assertEqual(bundle.results[1].failure_stage, "inference")
            self.assertIn("deliberate inference failure", bundle.results[1].error_summary)
            self.assertEqual(len(calls), 3)

    def test_unavailable_model_is_distinct_and_never_executed(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            clip_path = root / "clips" / "B01.mp4"
            clip_path.parent.mkdir(parents=True)
            clip_path.touch()
            config = build_detector_matrix(BenchmarkCommonConfig(device="cpu"))[1]
            calls = []

            bundle = run_benchmark_matrix(
                make_manifest(),
                root,
                configs=[config],
                execute_one=lambda *_args: calls.append(True),
                availability_checker=lambda _config, _root: (False, "weight missing locally"),
                timestamp_factory=lambda: FIXED_TIME,
            )

            self.assertEqual(len(calls), 0)
            self.assertEqual(bundle.results[0].status, "UNAVAILABLE")
            self.assertEqual(bundle.results[0].failure_stage, "model_availability")
            self.assertIsNone(bundle.results[0].metrics.analysis_fps)

    def test_missing_metrics_remain_null_while_measured_zero_survives(self):
        metrics = BenchmarkRunMetrics(predicted_percent=0.0, lost_percent=0.0)
        payload = metrics.to_dict()

        self.assertEqual(payload["predictedPercent"], 0.0)
        self.assertEqual(payload["lostPercent"], 0.0)
        self.assertIsNone(payload["analysisFps"])
        self.assertIsNone(payload["meanTargetCoverage"])

    def test_run_identity_contains_required_detector_metadata(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            clip_path = root / "clips" / "B01.mp4"
            clip_path.parent.mkdir(parents=True)
            clip_path.touch()
            config = build_detector_matrix(BenchmarkCommonConfig(device="cpu"))[0]
            bundle = run_benchmark_matrix(
                make_manifest(),
                root,
                configs=[config],
                execute_one=lambda *_args: measured_metrics(),
                availability_checker=lambda _config, _root: (True, "available"),
                timestamp_factory=lambda: FIXED_TIME,
            )
            result = bundle.results[0].to_dict()

            self.assertEqual(result["clipId"], "B01")
            self.assertEqual(result["detector"], "yolov8n.pt")
            self.assertEqual(result["inputSize"], 640)
            self.assertEqual(result["tracker"], "bytetrack")
            self.assertEqual(result["poseModel"], "yolov8n-pose.pt")
            self.assertEqual(result["runtime"], "pytorch")
            self.assertEqual(result["device"], "cpu")
            self.assertEqual(result["frameStride"], 1)
            self.assertEqual(result["timestamp"], FIXED_TIME)
            self.assertIn("yolov8n_640", result["runId"])

    def test_run_identity_changes_with_common_pipeline_config_and_invocation(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            clip_path = root / "clips" / "B01.mp4"
            clip_path.parent.mkdir(parents=True)
            clip_path.touch()
            cpu_config = build_detector_matrix(BenchmarkCommonConfig(device="cpu"))[0]
            cuda_config = build_detector_matrix(BenchmarkCommonConfig(device="cuda"))[0]

            cpu_bundle = run_benchmark_matrix(
                make_manifest(), root, configs=[cpu_config],
                execute_one=lambda *_args: measured_metrics(),
                availability_checker=lambda _config, _root: (True, "available"),
                timestamp_factory=lambda: FIXED_TIME,
                run_group_id_factory=lambda: "group-a",
            )
            cuda_bundle = run_benchmark_matrix(
                make_manifest(), root, configs=[cuda_config],
                execute_one=lambda *_args: measured_metrics(),
                availability_checker=lambda _config, _root: (True, "available"),
                timestamp_factory=lambda: FIXED_TIME,
                run_group_id_factory=lambda: "group-b",
            )

            cpu_id = cpu_bundle.results[0].run_id
            cuda_id = cuda_bundle.results[0].run_id
            self.assertNotEqual(cpu_id, cuda_id)
            self.assertIn("cpu", cpu_id)
            self.assertIn("cuda", cuda_id)
            self.assertIn("group-a", cpu_id)
            self.assertIn("group-b", cuda_id)

    def test_saved_results_reload_and_comparison_csv_is_sortable(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            clip_path = root / "clips" / "B01.mp4"
            clip_path.parent.mkdir(parents=True)
            clip_path.touch()
            config = build_detector_matrix(BenchmarkCommonConfig(device="cpu"))[0]
            bundle = run_benchmark_matrix(
                make_manifest(),
                root,
                configs=[config],
                execute_one=lambda *_args: measured_metrics(),
                availability_checker=lambda _config, _root: (True, "available"),
                timestamp_factory=lambda: FIXED_TIME,
            )

            json_path, csv_path = save_benchmark_bundle(bundle, root / "results")
            loaded = load_benchmark_bundle(json_path)

            self.assertEqual(loaded.to_dict(), bundle.to_dict())
            with csv_path.open(newline="", encoding="utf-8") as handle:
                rows = list(csv.DictReader(handle))
            self.assertEqual(len(rows), 1)
            self.assertEqual(rows[0]["detector"], "yolov8n.pt")
            for column in (
                "meanTargetCoverage",
                "simultaneousTargetCoverage",
                "analysisFps",
                "processingRatio",
                "inputSize",
                "peakVramMb",
            ):
                self.assertIn(column, rows[0])
            self.assertEqual(rows[0]["predictedPercent"], "0.0")
            self.assertEqual(rows[0]["peakVramMb"], "")
            for column in (
                "configId", "candidateId", "precision", "poseStride",
                "confidenceThreshold", "courtRoiEnabled",
                "medianCourtPositionError", "p95CourtPositionError",
            ):
                self.assertIn(column, rows[0])

            with self.assertRaises(FileExistsError):
                save_benchmark_bundle(bundle, root / "results")
            self.assertEqual(load_benchmark_bundle(json_path).to_dict(), bundle.to_dict())

    def test_absent_local_dataset_produces_no_fabricated_runs(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            calls = []
            bundle = run_benchmark_matrix(
                make_manifest(),
                Path(temp_dir),
                configs=build_detector_matrix(BenchmarkCommonConfig(device="cpu"))[:1],
                execute_one=lambda *_args: calls.append(True),
                availability_checker=lambda _config, _root: (True, "available"),
                timestamp_factory=lambda: FIXED_TIME,
            )

            self.assertFalse(bundle.dataset_available)
            self.assertEqual(bundle.dataset_status, "BENCHMARK DATASET NOT AVAILABLE LOCALLY")
            self.assertEqual(bundle.results, [])
            self.assertEqual(calls, [])
            self.assertTrue(bundle.configuration_availability["yolov8n_640"]["available"])
            self.assertEqual(bundle.follow_up_1280, "Cannot determine")

    def test_model_unavailability_is_reported_even_when_dataset_is_absent(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            config = build_detector_matrix(BenchmarkCommonConfig(device="cpu"))[1]
            bundle = run_benchmark_matrix(
                make_manifest(),
                Path(temp_dir),
                configs=[config],
                execute_one=lambda *_args: measured_metrics(),
                availability_checker=lambda _config, _root: (False, "weight missing locally"),
                timestamp_factory=lambda: FIXED_TIME,
            )

            availability = bundle.configuration_availability[config.config_id]
            self.assertFalse(availability["available"])
            self.assertEqual(availability["reason"], "weight missing locally")
            self.assertEqual(bundle.results, [])

    def test_missing_pose_model_is_unavailable_before_inference(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            (root / "yolov8n.pt").touch()
            video_path = root / "clips" / "B01.mp4"
            video_path.parent.mkdir(parents=True)
            video_path.touch()
            config = build_detector_matrix(BenchmarkCommonConfig(device="cpu"))[0]
            calls = []

            bundle = run_benchmark_matrix(
                make_manifest(), root, configs=[config],
                execute_one=lambda *_args: calls.append(True),
                timestamp_factory=lambda: FIXED_TIME,
            )

            self.assertEqual(calls, [])
            self.assertEqual(bundle.results[0].status, "UNAVAILABLE")
            self.assertEqual(bundle.results[0].failure_stage, "model_availability")
            self.assertIn("Pose model", bundle.results[0].error_summary)

    def test_model_resolution_uses_workspace_root_and_returns_absolute_path(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            weight = root / "yolov8n.pt"
            weight.touch()
            resolved = resolve_local_model_path("yolov8n.pt", root)
            self.assertEqual(resolved, weight.resolve())

    def test_unknown_clip_selection_fails_instead_of_claiming_dataset_missing(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            with self.assertRaisesRegex(ValueError, "Unknown benchmark clip IDs"):
                run_benchmark_matrix(
                    make_manifest(),
                    Path(temp_dir),
                    configs=build_detector_matrix(BenchmarkCommonConfig(device="cpu"))[:1],
                    clip_ids=["TYPO_CLIP"],
                    execute_one=lambda *_args: measured_metrics(),
                    availability_checker=lambda _config, _root: (True, "available"),
                    timestamp_factory=lambda: FIXED_TIME,
                )

    def test_phase_zero_metrics_keep_multi_target_quality_honest(self):
        telemetry = [
            {
                "timestampSec": 0.0,
                "players": [
                    {"playerId": "P1", "state": "observed", "detectionConfidence": 0.8},
                    {"playerId": "P2", "state": "predicted", "detectionConfidence": None},
                ],
            },
            {
                "timestampSec": 0.5,
                "players": [
                    {"playerId": "P1", "state": "observed", "detectionConfidence": 1.0},
                    {"playerId": "P2", "state": "lost", "detectionConfidence": None},
                ],
            },
        ]

        metrics = compute_phase_zero_metrics(
            telemetry,
            expected_player_count=2,
            elapsed_seconds=1.0,
            video_duration_seconds=2.0,
            peak_vram_mb=None,
        )

        self.assertEqual(metrics.player_coverage["P1"]["observedCoverage"], 1.0)
        self.assertEqual(metrics.player_coverage["P2"]["observedCoverage"], 0.0)
        self.assertEqual(metrics.mean_target_coverage, 0.5)
        self.assertEqual(metrics.simultaneous_target_coverage, 0.0)
        self.assertEqual(metrics.predicted_percent, 25.0)
        self.assertEqual(metrics.lost_percent, 25.0)
        self.assertEqual(metrics.mean_observed_confidence, 0.9)
        self.assertEqual(metrics.analysis_fps, 2.0)
        self.assertEqual(metrics.processing_ratio, 0.5)
        self.assertEqual(metrics.effective_telemetry_hz, 2.0)

    def test_empty_telemetry_does_not_manufacture_quality_or_rates(self):
        metrics = compute_phase_zero_metrics(
            [],
            expected_player_count=2,
            elapsed_seconds=0.0,
            video_duration_seconds=None,
            peak_vram_mb=None,
        )

        self.assertEqual(metrics.player_coverage, {})
        self.assertIsNone(metrics.mean_target_coverage)
        self.assertIsNone(metrics.simultaneous_target_coverage)
        self.assertIsNone(metrics.predicted_percent)
        self.assertIsNone(metrics.lost_percent)
        self.assertIsNone(metrics.mean_observed_confidence)
        self.assertIsNone(metrics.analysis_fps)
        self.assertEqual(metrics.elapsed_seconds, 0.0)
        self.assertIsNone(metrics.processing_ratio)
        self.assertIsNone(metrics.effective_telemetry_hz)

    def test_manifest_load_and_cli_write_dataset_unavailable_bundle(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            manifest_path = root / "manifest.json"
            manifest_path.write_text(json.dumps(make_manifest().to_dict()), encoding="utf-8")
            loaded = load_benchmark_manifest(manifest_path)
            self.assertEqual(loaded.manifest_id, "phase-1-3-test")

            output_dir = root / "results"
            exit_code = main([
                "--manifest", str(manifest_path),
                "--workspace-root", str(root),
                "--output-dir", str(output_dir),
                "--device", "cpu",
            ])
            self.assertEqual(exit_code, 0)
            json_files = list(output_dir.glob("*.json"))
            self.assertEqual(len(json_files), 1)
            saved = load_benchmark_bundle(json_files[0])
            self.assertFalse(saved.dataset_available)
            self.assertEqual(saved.results, [])

    def test_cli_filters_clips_detectors_and_sizes_without_expanding_matrix(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            manifest_path = root / "manifest.json"
            manifest_path.write_text(json.dumps(make_manifest().to_dict()), encoding="utf-8")
            output_dir = root / "results"

            exit_code = main([
                "--manifest", str(manifest_path),
                "--workspace-root", str(root),
                "--output-dir", str(output_dir),
                "--clips", "B01",
                "--detectors", "yolo11s",
                "--input-sizes", "640",
                "--device", "cpu",
            ])

            self.assertEqual(exit_code, 0)
            saved = load_benchmark_bundle(next(output_dir.glob("*.json")))
            self.assertEqual(saved.selected_clip_ids, ["B01"])
            self.assertEqual(
                [(config.candidate_id, config.input_size) for config in saved.configurations],
                [("yolo11s", 640)],
            )

    def test_missing_named_calibration_fails_before_inference(self):
        clip = make_manifest().clips[0]
        config = build_detector_matrix(BenchmarkCommonConfig(device="cpu"))[0]
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            video_path = root / "clip.mp4"
            video_path.touch()
            with self.assertRaises(BenchmarkExecutionError) as context:
                execute_tracking_run(clip, config, video_path, root)
            self.assertEqual(context.exception.stage, "calibration")

    def test_1280_follow_up_uses_only_measured_960_far_court_evidence(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            clip_path = root / "clips" / "B01.mp4"
            clip_path.parent.mkdir(parents=True)
            clip_path.touch()
            manifest = make_manifest()
            manifest.clips[0].difficulty_tags = ["far_court_small_scale"]
            config_960 = build_detector_matrix(BenchmarkCommonConfig(device="cpu"))[2]

            weak = measured_metrics()
            weak.mean_target_coverage = 0.79
            weak_bundle = run_benchmark_matrix(
                manifest, root, configs=[config_960],
                execute_one=lambda *_args: weak,
                availability_checker=lambda _config, _root: (True, "available"),
                timestamp_factory=lambda: FIXED_TIME,
            )
            self.assertEqual(weak_bundle.follow_up_1280, "Yes")

            strong = measured_metrics()
            strong.mean_target_coverage = 0.95
            strong_bundle = run_benchmark_matrix(
                manifest, root, configs=[config_960],
                execute_one=lambda *_args: strong,
                availability_checker=lambda _config, _root: (True, "available"),
                timestamp_factory=lambda: FIXED_TIME,
            )
            self.assertEqual(strong_bundle.follow_up_1280, "No")

            config_640 = build_detector_matrix(BenchmarkCommonConfig(device="cpu"))[1]
            no_960_bundle = run_benchmark_matrix(
                manifest, root, configs=[config_640],
                execute_one=lambda *_args: weak,
                availability_checker=lambda _config, _root: (True, "available"),
                timestamp_factory=lambda: FIXED_TIME,
            )
            self.assertEqual(no_960_bundle.follow_up_1280, "Cannot determine")


if __name__ == "__main__":
    unittest.main()
