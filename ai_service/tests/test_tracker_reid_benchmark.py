"""Tests for Phase 1.5D tracker and ReID identity stability benchmark."""

from __future__ import annotations

import copy
import sys
import tempfile
import unittest
from pathlib import Path

ai_service_dir = Path(__file__).parent.parent
if str(ai_service_dir) not in sys.path:
    sys.path.insert(0, str(ai_service_dir))

from benchmark_schema import (
    BenchmarkClipEntry,
    BenchmarkIdentityFailureExample,
    BenchmarkManifest,
)
from benchmark_runner import (
    BenchmarkAttempt,
    BenchmarkCommonConfig,
    BenchmarkRunConfig,
    BenchmarkRunMetrics,
    _comparison_row,
    build_detector_matrix,
    build_tracker_reid_trio,
    compute_phase_zero_metrics,
    run_tracker_reid_stability_benchmark,
    validate_tracker_reid_trio,
)


def make_test_manifest() -> BenchmarkManifest:
    return BenchmarkManifest(
        schema_version=1,
        manifest_id="tracker-benchmark-test-manifest",
        updated_at="2026-09-21T00:00:00Z",
        clips=[
            BenchmarkClipEntry(
                id="B04_doubles_occlusion",
                name="Doubles Occlusion",
                sport="badminton",
                game_type="doubles",
                player_count=4,
                camera_type="static_rear",
                camera_motion="static",
                video_reference="benchmarks/videos/nonexistent_B04.mp4",
                duration_sec=30.0,
                source_width=1920,
                source_height=1080,
                source_fps=30.0,
                court_calibration_reference="calibration_rear",
            )
        ],
    )


class TestTrackerReIDBenchmark(unittest.TestCase):
    def setUp(self) -> None:
        self.baseline = build_detector_matrix(
            BenchmarkCommonConfig(device="cpu")
        )[0]

    def test_build_tracker_reid_trio_generates_three_fair_configs(self) -> None:
        cfg_a, cfg_b, cfg_c = build_tracker_reid_trio(self.baseline)

        # Candidate A: ByteTrack baseline
        self.assertEqual(cfg_a.tracker, "bytetrack")
        self.assertIsNone(cfg_a.tracker_config)
        self.assertFalse(cfg_a.reid_enabled)
        self.assertIsNone(cfg_a.reid_model)

        # Candidate B: BoT-SORT without ReID
        self.assertEqual(cfg_b.tracker, "botsort")
        self.assertEqual(cfg_b.tracker_config, "botsort.yaml")
        self.assertFalse(cfg_b.reid_enabled)
        self.assertIsNone(cfg_b.reid_model)

        # Candidate C: BoT-SORT with ReID
        self.assertEqual(cfg_c.tracker, "botsort")
        self.assertEqual(cfg_c.tracker_config, "botsort.yaml")
        self.assertTrue(cfg_c.reid_enabled)
        self.assertEqual(cfg_c.reid_model, "spatial_multi_zone_v1")

        # Invariants must strictly match across all three
        invariants = [
            "candidate_id", "detector", "detector_family", "input_size",
            "pose_model", "pose_architecture", "runtime", "precision", "device",
            "frame_stride", "pose_stride", "confidence_threshold", "court_roi_enabled",
        ]
        for field_name in invariants:
            val_base = getattr(self.baseline, field_name)
            self.assertEqual(getattr(cfg_a, field_name), val_base)
            self.assertEqual(getattr(cfg_b, field_name), val_base)
            self.assertEqual(getattr(cfg_c, field_name), val_base)

    def test_validate_tracker_reid_trio_rejects_mismatches(self) -> None:
        cfg_a, cfg_b, cfg_c = build_tracker_reid_trio(self.baseline)

        # Rejects fewer or more than 3 configs
        with self.assertRaisesRegex(ValueError, "exactly three"):
            validate_tracker_reid_trio([cfg_a, cfg_b])

        # Rejects differing invariant (e.g. input_size)
        mismatched_c = copy.deepcopy(cfg_c)
        object.__setattr__(mismatched_c, "input_size", 960)
        with self.assertRaisesRegex(ValueError, "matching input_size"):
            validate_tracker_reid_trio([cfg_a, cfg_b, mismatched_c])

        # Rejects differing detector
        mismatched_b = copy.deepcopy(cfg_b)
        object.__setattr__(mismatched_b, "detector", "yolo11n.pt")
        with self.assertRaisesRegex(ValueError, "matching detector"):
            validate_tracker_reid_trio([cfg_a, mismatched_b, cfg_c])

    def test_compute_metrics_raw_tracker_id_switches(self) -> None:
        # P1 tracked as track 1 for 2 frames, then switches to track 5 at frame 2
        telemetry = [
            {
                "timestampSec": 0.0,
                "players": [{"playerId": "P1", "trackId": 1, "state": "observed"}],
            },
            {
                "timestampSec": 0.033,
                "players": [{"playerId": "P1", "trackId": 1, "state": "observed"}],
            },
            {
                "timestampSec": 0.066,
                "players": [{"playerId": "P1", "trackId": 5, "state": "observed"}],
            },
        ]
        metrics = compute_phase_zero_metrics(
            telemetry,
            expected_player_count=1,
            elapsed_seconds=0.1,
            video_duration_seconds=0.1,
            peak_vram_mb=None,
        )
        self.assertEqual(metrics.raw_tracker_id_switches, 1)
        self.assertEqual(metrics.semantic_player_id_switches, 0)
        raw_reset_examples = [
            ex for ex in metrics.failure_examples if ex.failure_type == "raw_id_reset"
        ]
        self.assertEqual(len(raw_reset_examples), 1)
        self.assertEqual(raw_reset_examples[0].player_id, "P1")
        self.assertEqual(raw_reset_examples[0].track_id, 5)

    def test_compute_metrics_semantic_id_switches(self) -> None:
        # Frame 0: P1 has track 10, P2 has track 20
        # Frame 1: track 10 is reassigned to P2 within 30 frames
        telemetry = [
            {
                "timestampSec": 0.0,
                "players": [
                    {"playerId": "P1", "trackId": 10, "state": "observed"},
                    {"playerId": "P2", "trackId": 20, "state": "observed"},
                ],
            },
            {
                "timestampSec": 0.05,
                "players": [
                    {"playerId": "P1", "trackId": 30, "state": "observed"},
                    {"playerId": "P2", "trackId": 10, "state": "observed"},
                ],
            },
        ]
        metrics = compute_phase_zero_metrics(
            telemetry,
            expected_player_count=2,
            elapsed_seconds=0.1,
            video_duration_seconds=0.1,
            peak_vram_mb=None,
        )
        self.assertEqual(metrics.semantic_player_id_switches, 1)
        self.assertEqual(metrics.id_switch_count, 1)
        sem_examples = [
            ex for ex in metrics.failure_examples if ex.failure_type == "semantic_id_switch"
        ]
        self.assertEqual(len(sem_examples), 1)
        self.assertEqual(sem_examples[0].player_id, "P2")
        self.assertEqual(sem_examples[0].track_id, 10)

    def test_compute_metrics_reacquisition_duration(self) -> None:
        # P1: observed at 0.0s -> lost at 1.0s -> observed at 1.5s (duration 0.5s)
        telemetry = [
            {"timestampSec": 0.0, "players": [{"playerId": "P1", "state": "observed"}]},
            {"timestampSec": 1.0, "players": [{"playerId": "P1", "state": "lost"}]},
            {"timestampSec": 1.5, "players": [{"playerId": "P1", "state": "observed"}]},
        ]
        metrics = compute_phase_zero_metrics(
            telemetry,
            expected_player_count=1,
            elapsed_seconds=0.5,
            video_duration_seconds=1.5,
            peak_vram_mb=None,
        )
        self.assertAlmostEqual(metrics.reacquisition_duration_sec, 0.5, places=3)

    def test_reacquisition_duration_none_when_no_reacquisition(self) -> None:
        # No reacquisition events: duration must remain None (never fabricated as 0.0)
        telemetry = [
            {"timestampSec": 0.0, "players": [{"playerId": "P1", "state": "observed"}]},
            {"timestampSec": 0.5, "players": [{"playerId": "P1", "state": "observed"}]},
        ]
        metrics = compute_phase_zero_metrics(
            telemetry,
            expected_player_count=1,
            elapsed_seconds=0.1,
            video_duration_seconds=0.5,
            peak_vram_mb=None,
        )
        self.assertIsNone(metrics.reacquisition_duration_sec)

    def test_compute_metrics_records_ambiguity_and_cross_player_failures(self) -> None:
        telemetry = [
            {
                "timestampSec": 1.25,
                "players": [
                    {
                        "playerId": "P1",
                        "trackId": 3,
                        "state": "observed",
                        "identityCosts": {
                            "isAmbiguous": True,
                            "courtSidePenalty": 15.0,
                        },
                    }
                ],
            }
        ]
        metrics = compute_phase_zero_metrics(
            telemetry,
            expected_player_count=1,
            elapsed_seconds=0.1,
            video_duration_seconds=1.5,
            peak_vram_mb=None,
        )
        ambig = [ex for ex in metrics.failure_examples if ex.failure_type == "ambiguous_identity"]
        cross = [ex for ex in metrics.failure_examples if ex.failure_type == "cross_player_assignment"]
        self.assertEqual(len(ambig), 1)
        self.assertEqual(len(cross), 1)
        self.assertEqual(ambig[0].player_id, "P1")
        self.assertEqual(cross[0].player_id, "P1")

    def test_compute_metrics_records_reacquisition_failure(self) -> None:
        # P1 is lost for 35 frames without reacquisition
        telemetry = [{"timestampSec": 0.0, "players": [{"playerId": "P1", "state": "observed"}]}]
        for i in range(1, 36):
            telemetry.append({
                "timestampSec": round(i * 0.033, 3),
                "players": [{"playerId": "P1", "state": "lost"}],
            })
        metrics = compute_phase_zero_metrics(
            telemetry,
            expected_player_count=1,
            elapsed_seconds=0.2,
            video_duration_seconds=1.2,
            peak_vram_mb=None,
        )
        reacq_failures = [
            ex for ex in metrics.failure_examples if ex.failure_type == "reacquisition_failure"
        ]
        self.assertEqual(len(reacq_failures), 1)
        self.assertEqual(reacq_failures[0].player_id, "P1")

    def test_tracker_benchmark_dataset_unavailable_handles_missing_files(self) -> None:
        manifest = make_test_manifest()
        bundle = run_tracker_reid_stability_benchmark(
            manifest,
            Path(tempfile.mkdtemp()),
            baseline=self.baseline,
            execute_one=lambda *_args: BenchmarkRunMetrics(),
            availability_checker=lambda _config, _root: (True, "available"),
        )
        self.assertFalse(bundle.dataset_available)
        self.assertEqual(bundle.dataset_status, "TRACKER BENCHMARK DATASET NOT AVAILABLE")
        self.assertEqual(len(bundle.configurations), 3)
        trackers = [(c.tracker, c.reid_enabled) for c in bundle.configurations]
        self.assertIn(("bytetrack", False), trackers)
        self.assertIn(("botsort", False), trackers)
        self.assertIn(("botsort", True), trackers)

    def test_metrics_and_comparison_row_serialization(self) -> None:
        example = BenchmarkIdentityFailureExample(
            failure_type="semantic_id_switch",
            timestamp_sec=2.5,
            player_id="P1",
            track_id=7,
            description="Test switch",
        )
        metrics = BenchmarkRunMetrics(
            raw_tracker_id_switches=2,
            semantic_player_id_switches=1,
            reacquisition_duration_sec=0.45,
            failure_examples=[example],
        )
        d = metrics.to_dict()
        self.assertEqual(d["rawTrackerIdSwitches"], 2)
        self.assertEqual(d["semanticPlayerIdSwitches"], 1)
        self.assertEqual(d["reacquisitionDurationSec"], 0.45)
        self.assertEqual(len(d["failureExamples"]), 1)
        self.assertEqual(d["failureExamples"][0]["failureType"], "semantic_id_switch")

        restored = BenchmarkRunMetrics.from_dict(d)
        self.assertEqual(restored.raw_tracker_id_switches, 2)
        self.assertEqual(restored.semantic_player_id_switches, 1)
        self.assertEqual(restored.reacquisition_duration_sec, 0.45)
        self.assertEqual(len(restored.failure_examples), 1)
        self.assertEqual(restored.failure_examples[0].player_id, "P1")

        attempt = BenchmarkAttempt(
            run_id="test_run",
            timestamp="2026-09-21T00:00:00Z",
            clip_id="B04",
            video_reference=None,
            court_calibration_reference=None,
            ground_truth_available=False,
            status="SUCCESS",
            config=self.baseline,
            metrics=metrics,
        )
        row = _comparison_row(attempt)
        self.assertEqual(row["rawTrackerIdSwitches"], 2)
        self.assertEqual(row["semanticPlayerIdSwitches"], 1)
        self.assertEqual(row["reacquisitionDurationSec"], 0.45)


if __name__ == "__main__":
    unittest.main()
