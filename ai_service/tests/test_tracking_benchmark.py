"""
ai_service/tests/test_tracking_benchmark.py — Tests for Tracking Benchmark Foundation
"""

import json
import sys
import unittest
from pathlib import Path

# Add ai_service to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from benchmark_schema import (
    BenchmarkRunIdentity,
    BenchmarkModelConfig,
    BenchmarkVideoMetadata,
    BenchmarkPerformance,
    BenchmarkPlayerQuality,
    BenchmarkQuality,
    BenchmarkIdentityAudit,
    BenchmarkGroundTruth,
    TrackingBenchmarkRun,
    calculate_processing_ratio,
    serialize_benchmark_run,
    deserialize_benchmark_run,
    create_benchmark_run_from_session_dict,
)


class TestTrackingBenchmarkFoundation(unittest.TestCase):
    def setUp(self):
        self.standard_run = TrackingBenchmarkRun(
            identity=BenchmarkRunIdentity(
                run_id="bench_001",
                created_at="2026-09-21T10:00:00Z",
                sport="badminton",
                tracking_mode="singles",
                processing_profile="balanced",
                video_fingerprint="vid_hash_123",
                video_reference="match.mp4",
            ),
            model_config=BenchmarkModelConfig(
                detector_name="yolov8n",
                detector_version="8.2.0",
                pose_model="yolov8n-pose",
                tracker_name="bytetrack",
                tracker_version="0.3.2",
                detector_input_size=512,
                confidence_threshold=0.25,
                frame_stride=2,
                pose_stride=1,
                max_players=2,
                device="cuda",
            ),
            video_metadata=BenchmarkVideoMetadata(
                source_width=1920,
                source_height=1080,
                source_fps=60.0,
                duration_seconds=3600.0,
                total_source_frames=216000,
            ),
            performance=BenchmarkPerformance(
                frames_analyzed=108000,
                analysis_fps=60.0,
                elapsed_seconds=1800.0,
                effective_telemetry_hz=30.0,
                processing_ratio=0.5,
            ),
            quality=BenchmarkQuality(
                mean_target_coverage=0.95,
                simultaneous_target_coverage=0.92,
                player_coverage={
                    "P1": BenchmarkPlayerQuality(
                        player_id="P1",
                        observed_coverage=0.96,
                        predicted_percent=3.5,
                        lost_percent=0.5,
                        mean_observed_confidence=0.88,
                    ),
                    "P2": BenchmarkPlayerQuality(
                        player_id="P2",
                        observed_coverage=0.94,
                        predicted_percent=4.5,
                        lost_percent=1.5,
                        mean_observed_confidence=0.85,
                    ),
                },
            ),
            identity_audit=BenchmarkIdentityAudit(
                id_switch_count=1,
                manual_correction_count=0,
                identity_continuity=0.98,
            ),
            ground_truth=BenchmarkGroundTruth(
                mean_court_position_error=0.15,
                median_court_position_error=0.10,
                p95_court_position_error=0.30,
                distance_error=2.1,
                identity_accuracy=0.99,
                identity_continuity=0.98,
            ),
        )

    def test_complete_benchmark_run_serializes_correctly(self):
        """1. Complete benchmark run serializes and deserializes cleanly."""
        serialized = serialize_benchmark_run(self.standard_run)
        self.assertIsInstance(serialized, str)

        deserialized = deserialize_benchmark_run(serialized)
        self.assertEqual(deserialized.identity.run_id, "bench_001")
        self.assertEqual(deserialized.model_config.detector_name, "yolov8n")
        self.assertEqual(deserialized.performance.processing_ratio, 0.5)
        self.assertEqual(deserialized.quality.mean_target_coverage, 0.95)
        self.assertIn("P1", deserialized.quality.player_coverage)
        self.assertIn("P2", deserialized.quality.player_coverage)

    def test_unavailable_values_remain_unavailable(self):
        """2. Unavailable values remain None, never fabricated."""
        minimal_run = TrackingBenchmarkRun(
            identity=BenchmarkRunIdentity(
                run_id="bench_min",
                created_at="2026-09-21T10:00:00Z",
                sport="badminton",
                tracking_mode="singles",
                processing_profile="reference",
            ),
            model_config=BenchmarkModelConfig(
                detector_name="yolov8n",
                pose_model="yolov8n-pose",
                tracker_name="bytetrack",
                detector_input_size=640,
                confidence_threshold=0.25,
                frame_stride=2,
                pose_stride=1,
                max_players=2,
                device="cpu",
            ),
            video_metadata=BenchmarkVideoMetadata(
                source_width=1280,
                source_height=720,
                source_fps=30.0,
                duration_seconds=60.0,
            ),
            performance=BenchmarkPerformance(
                frames_analyzed=900,
                analysis_fps=15.0,
                elapsed_seconds=60.0,
                effective_telemetry_hz=15.0,
                processing_ratio=1.0,
            ),
            quality=BenchmarkQuality(
                mean_target_coverage=0.90,
                simultaneous_target_coverage=0.85,
            ),
            identity_audit=None,
            ground_truth=None,
        )

        self.assertIsNone(minimal_run.model_config.detector_version)
        self.assertIsNone(minimal_run.model_config.tracker_version)
        self.assertIsNone(minimal_run.video_metadata.total_source_frames)
        self.assertIsNone(minimal_run.identity_audit)
        self.assertIsNone(minimal_run.ground_truth)

        serialized = serialize_benchmark_run(minimal_run)
        parsed = json.loads(serialized)
        self.assertNotIn("identityAudit", parsed)
        self.assertNotIn("groundTruth", parsed)

    def test_measured_zero_remains_different_from_unknown(self):
        """3. Measured zero remains distinct from unknown/None."""
        audit_with_zero = BenchmarkIdentityAudit(
            id_switch_count=0,
            manual_correction_count=0,
            identity_continuity=1.0,
        )
        audit_unknown = BenchmarkIdentityAudit(
            id_switch_count=None,
            manual_correction_count=None,
            identity_continuity=None,
        )

        gt_with_zero = BenchmarkGroundTruth(mean_court_position_error=0.0)
        gt_unknown = BenchmarkGroundTruth(mean_court_position_error=None)

        self.assertEqual(audit_with_zero.id_switch_count, 0)
        self.assertIsNone(audit_unknown.id_switch_count)
        self.assertNotEqual(audit_with_zero.id_switch_count, audit_unknown.id_switch_count)

        self.assertEqual(gt_with_zero.mean_court_position_error, 0.0)
        self.assertIsNone(gt_unknown.mean_court_position_error)
        self.assertNotEqual(gt_with_zero.mean_court_position_error, gt_unknown.mean_court_position_error)

    def test_per_player_quality_stays_separated(self):
        """4. Per-player quality metrics do not collide."""
        qual = self.standard_run.quality
        p1 = qual.player_coverage["P1"]
        p2 = qual.player_coverage["P2"]

        self.assertEqual(p1.player_id, "P1")
        self.assertEqual(p2.player_id, "P2")
        self.assertEqual(p1.observed_coverage, 0.96)
        self.assertEqual(p2.observed_coverage, 0.94)
        self.assertEqual(p1.lost_percent, 0.5)
        self.assertEqual(p2.lost_percent, 1.5)

    def test_detector_tracker_names_configurable(self):
        """5. Detector and tracker names are fully configurable (YOLO11, Norfair, etc.)."""
        cfg = BenchmarkModelConfig(
            detector_name="yolo11n",
            detector_version="11.0.0",
            pose_model="yolo11n-pose",
            tracker_name="norfair",
            tracker_version="2.2.0",
            detector_input_size=640,
            confidence_threshold=0.25,
            frame_stride=1,
            pose_stride=1,
            max_players=4,
            device="tensorrt",
        )
        self.assertEqual(cfg.detector_name, "yolo11n")
        self.assertEqual(cfg.tracker_name, "norfair")
        self.assertEqual(cfg.device, "tensorrt")

    def test_ground_truth_fields_do_not_become_fake_zeros(self):
        """6. Ground truth fields do not default to fake zeros."""
        session_dict = {
            "sessionId": "sess_legacy",
            "status": "COMPLETED",
            "analyzedFrames": 100,
            "performance": {"elapsedSec": 10.0, "videoDurationSec": 20.0, "analysisFps": 10.0},
            "quality": {"observedCoveragePct": 92.0},
            "runtimeProvenance": {
                "detectorModel": "yolov8n",
                "trackerModel": "bytetrack",
                "poseModel": "yolo_pose",
                "effectiveDevice": "cpu",
            },
        }

        run = create_benchmark_run_from_session_dict(session_dict)
        self.assertIsNone(run.ground_truth)

    def test_adapter_keeps_missing_provenance_and_measurements_unknown(self):
        """Missing detector/tracker/rate/quality values must remain None."""
        run = create_benchmark_run_from_session_dict({
            "sessionId": "sess_unknown",
            "quality": {
                "playerCoverage": {
                    "P1": {
                        "observedCoveragePct": 0.0,
                        "predictedFramesPct": 0.0,
                        "lostFramesPct": 100.0,
                    },
                },
            },
        })

        self.assertIsNone(run.model_config.detector_name)
        self.assertIsNone(run.model_config.tracker_name)
        self.assertIsNone(run.model_config.confidence_threshold)
        self.assertIsNone(run.video_metadata.source_fps)
        self.assertIsNone(run.video_metadata.duration_seconds)
        self.assertIsNone(run.performance.analysis_fps)
        self.assertIsNone(run.performance.effective_telemetry_hz)
        self.assertIsNone(run.quality.mean_target_coverage)
        self.assertIsNone(run.quality.simultaneous_target_coverage)
        self.assertIsNone(run.quality.player_coverage["P1"].mean_observed_confidence)

    def test_older_bytetrack_run_populates_schema(self):
        """7. Older ByteTrack run cleanly populates the benchmark schema."""
        session_dict = {
            "sessionId": "sess_bytetrack_01",
            "status": "COMPLETED",
            "trackedPlayerCount": 2,
            "analyzedFrames": 300,
            "sourceFps": 30.0,
            "elapsedSec": 10.0,
            "videoFingerprint": "vid_hash_abc",
            "videoMetadata": {
                "filename": "match.mp4",
                "width": 1920,
                "height": 1080,
                "nominalFps": 30.0,
                "durationSec": 20.0,
                "reportedFrameCount": 600,
            },
            "performance": {
                "elapsedSec": 10.0,
                "videoDurationSec": 20.0,
                "analysisFps": 30.0,
                "samplingFps": 10.0,
            },
            "quality": {
                "observedCoveragePct": 92.0,
                "simultaneousCoveragePct": 88.0,
                "playerCoverage": {
                    "P1": {
                        "observedCoveragePct": 94.0,
                        "predictedFramesPct": 4.0,
                        "lostFramesPct": 2.0,
                        "meanObservedConfidence": 0.88,
                    },
                    "P2": {
                        "observedCoveragePct": 90.0,
                        "predictedFramesPct": 6.0,
                        "lostFramesPct": 4.0,
                        "meanObservedConfidence": 0.84,
                    },
                },
            },
            "runtimeProvenance": {
                "detectorModel": "yolov8n",
                "trackerModel": "bytetrack",
                "poseModel": "yolo_pose",
                "effectiveDevice": "cpu",
                "detectorInputSize": 640,
                "frameStride": 2,
                "poseStride": 1,
            },
        }

        run = create_benchmark_run_from_session_dict(session_dict)
        self.assertEqual(run.identity.run_id, "benchmark_sess_bytetrack_01")
        self.assertEqual(run.identity.video_fingerprint, "vid_hash_abc")
        self.assertEqual(run.identity.video_reference, "match.mp4")
        self.assertEqual(run.model_config.detector_name, "yolov8n")
        self.assertEqual(run.model_config.tracker_name, "bytetrack")
        self.assertEqual(run.performance.processing_ratio, 0.5)
        self.assertEqual(run.quality.mean_target_coverage, 0.92)
        self.assertEqual(run.quality.player_coverage["P1"].observed_coverage, 0.94)

    def test_processing_ratio_calculation(self):
        """8. Processing ratio matches specification: 60m video in 30 real min = 0.5."""
        # 60-minute video (3600s) processed in 30 real minutes (1800s) -> 0.5
        self.assertEqual(calculate_processing_ratio(1800.0, 3600.0), 0.5)
        self.assertEqual(calculate_processing_ratio(60.0, 60.0), 1.0)
        self.assertEqual(calculate_processing_ratio(120.0, 60.0), 2.0)

        # Invalid / missing -> None
        self.assertIsNone(calculate_processing_ratio(None, 3600.0))
        self.assertIsNone(calculate_processing_ratio(1800.0, None))
        self.assertIsNone(calculate_processing_ratio(1800.0, 0.0))
        self.assertIsNone(calculate_processing_ratio(1800.0, -10.0))
        self.assertIsNone(calculate_processing_ratio(-5.0, 60.0))
        self.assertIsNone(calculate_processing_ratio(float("nan"), 60.0))
        self.assertIsNone(calculate_processing_ratio(30.0, float("inf")))


if __name__ == "__main__":
    unittest.main()
