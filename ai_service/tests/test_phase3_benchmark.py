"""
ai_service/tests/test_phase3_benchmark.py — Comprehensive Unit Tests for Phase 3.4

Validates:
1. Cut metrics exact case
2. Duplicate cut handling (repeated detections do not inflate TP)
3. Measured zero false cuts (distinct from unavailable)
4. Missing cut GT -> status UNAVAILABLE
5. Reprojection metrics calculation (mean, median, P95)
6. Missing calibration GT -> status UNAVAILABLE
7. Ground-position error (pixel & meter error, provenance breakdown)
8. Missing foot GT -> status UNAVAILABLE
9. ID switch count calculation
10. IDF1 supported case
11. HOTA unavailable report (insufficient implementation/GT)
12. Venue/camera split grouping
13. Adjacent-frame leakage guard
14. Provenance output with path sanitization
15. Backward compatibility: old manifests without Phase 3 fields still load
"""

from __future__ import annotations
import math
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from benchmark_schema import (
    BenchmarkClipEntry,
    BenchmarkManifest,
    CameraCutBenchmarkMetrics,
    CalibrationBenchmarkMetrics,
    GroundPositionBenchmarkMetrics,
    TrackingIdentityBenchmarkMetrics,
    Phase3BenchmarkReport,
    validate_split_leakage,
    partition_clips_by_group,
)
from phase3_benchmark import (
    evaluate_camera_cuts,
    evaluate_calibration,
    evaluate_ground_position,
    evaluate_identity,
    evaluate_phase3_benchmark,
    sanitize_path_reference,
)


class TestCameraCutEvaluation(unittest.TestCase):
    def test_cut_metrics_exact_case(self):
        """Exact matched cuts produce precision=1.0, recall=1.0, F1=1.0."""
        gt_cuts = [1.5, 4.0, 8.2]
        pred_cuts = [1.52, 4.01, 8.19]
        metrics = evaluate_camera_cuts(gt_cuts, pred_cuts, tolerance_sec=0.2)
        self.assertEqual(metrics.status, "MEASURED")
        self.assertEqual(metrics.tp_cuts, 3)
        self.assertEqual(metrics.fp_cuts, 0)
        self.assertEqual(metrics.fn_cuts, 0)
        self.assertEqual(metrics.duplicate_cut_count, 0)
        self.assertEqual(metrics.precision, 1.0)
        self.assertEqual(metrics.recall, 1.0)
        self.assertEqual(metrics.f1, 1.0)
        self.assertIsNotNone(metrics.mean_detection_latency_sec)
        self.assertLess(metrics.mean_detection_latency_sec, 0.05)

    def test_duplicate_cut_handling(self):
        """Repeated detections from the same real cut window must NOT inflate TP."""
        gt_cuts = [5.0]
        # Two predictions for the single real cut at 5.0s, plus an FP at 12.0s
        pred_cuts = [5.05, 5.12, 12.0]
        metrics = evaluate_camera_cuts(gt_cuts, pred_cuts, tolerance_sec=0.3)
        self.assertEqual(metrics.status, "MEASURED")
        self.assertEqual(metrics.tp_cuts, 1)  # Only 1 TP, NOT 2!
        self.assertEqual(metrics.duplicate_cut_count, 1)
        self.assertEqual(metrics.fp_cuts, 1)
        self.assertEqual(metrics.fn_cuts, 0)
        self.assertAlmostEqual(metrics.precision, 0.50, places=2)
        self.assertAlmostEqual(metrics.recall, 1.0, places=2)

    def test_measured_zero_false_cuts(self):
        """When GT has 0 cuts and system detects 0 cuts, it is a measured zero (not unavailable)."""
        gt_cuts = []
        pred_cuts = []
        metrics = evaluate_camera_cuts(gt_cuts, pred_cuts)
        self.assertEqual(metrics.status, "MEASURED")
        self.assertEqual(metrics.tp_cuts, 0)
        self.assertEqual(metrics.fp_cuts, 0)
        self.assertEqual(metrics.fn_cuts, 0)
        self.assertEqual(metrics.precision, 1.0)
        self.assertEqual(metrics.recall, 1.0)
        self.assertEqual(metrics.f1, 1.0)

    def test_missing_cut_gt_is_unavailable(self):
        """When GT is None, status is UNAVAILABLE and values are None (never fake 0)."""
        metrics = evaluate_camera_cuts(None, [1.0, 5.0])
        self.assertEqual(metrics.status, "UNAVAILABLE")
        self.assertIn("not available", metrics.status_reason.lower())
        self.assertIsNone(metrics.precision)
        self.assertIsNone(metrics.recall)
        self.assertIsNone(metrics.f1)
        self.assertIsNone(metrics.tp_cuts)


class TestCalibrationEvaluation(unittest.TestCase):
    def test_reprojection_metrics(self):
        """Evaluates reprojection error mean, median, P95 on calibrated frames."""
        gt_corners = [[100.0, 50.0], [540.0, 50.0], [540.0, 430.0], [100.0, 430.0]]
        gt_cal = {
            "cornersPx": gt_corners,
            "validIntervals": [(0.0, 10.0)],
        }
        pred_frames = [
            {
                "timestampSec": 1.0,
                "cameraSegmentId": "seg-0",
                "calibrationState": "CALIBRATED",
                "calibration": {"cornersPx": [[102.0, 51.0], [541.0, 50.0], [539.0, 431.0], [101.0, 429.0]]},
            },
            {
                "timestampSec": 2.0,
                "cameraSegmentId": "seg-0",
                "calibrationState": "CALIBRATED",
                "calibration": {"cornersPx": [[101.0, 50.0], [540.0, 51.0], [540.0, 430.0], [100.0, 430.0]]},
            },
        ]
        metrics = evaluate_calibration(gt_cal, pred_frames)
        self.assertEqual(metrics.status, "MEASURED")
        self.assertIsNotNone(metrics.reprojection_error_px_mean)
        self.assertIsNotNone(metrics.reprojection_error_px_median)
        self.assertIsNotNone(metrics.reprojection_error_px_p95)
        self.assertAlmostEqual(metrics.calibration_availability_pct, 100.0)
        self.assertEqual(metrics.false_valid_calibration_count, 0)

    def test_missing_calibration_gt_is_unavailable(self):
        """Missing calibration GT returns status UNAVAILABLE with all values None."""
        metrics = evaluate_calibration(None, [{"timestampSec": 1.0}])
        self.assertEqual(metrics.status, "UNAVAILABLE")
        self.assertIn("not available", metrics.status_reason.lower())
        self.assertIsNone(metrics.reprojection_error_px_mean)
        self.assertIsNone(metrics.calibration_availability_pct)


class TestGroundPositionEvaluation(unittest.TestCase):
    def test_ground_position_error_and_provenance(self):
        """Calculates pixel and court meter error broken down by provenance."""
        gt_positions = [
            {"frameIndex": 1, "playerId": "P1", "groundPx": {"x": 200, "y": 400}, "courtPositionM": {"xM": 2.0, "yM": 4.0}},
            {"frameIndex": 2, "playerId": "P1", "groundPx": {"x": 210, "y": 405}, "courtPositionM": {"xM": 2.1, "yM": 4.1}},
            {"frameIndex": 3, "playerId": "P1", "groundPx": {"x": 220, "y": 410}, "courtPositionM": {"xM": 2.2, "yM": 4.2}},
        ]
        pred_positions = [
            {"frameIndex": 1, "playerId": "P1", "groundPx": {"x": 202, "y": 401}, "courtPositionM": {"xM": 2.02, "yM": 4.01}, "groundPointProvenance": "pose_both_ankles"},
            {"frameIndex": 2, "playerId": "P1", "groundPx": {"x": 214, "y": 406}, "courtPositionM": {"xM": 2.15, "yM": 4.12}, "groundPointProvenance": "pose_left_ankle"},
            {"frameIndex": 3, "playerId": "P1", "groundPx": {"x": 228, "y": 412}, "courtPositionM": {"xM": 2.30, "yM": 4.25}, "groundPointProvenance": "bbox_bottom_center"},
        ]
        metrics = evaluate_ground_position(gt_positions, pred_positions)
        self.assertEqual(metrics.status, "MEASURED")
        self.assertIsNotNone(metrics.pixel_error_mean)
        self.assertIsNotNone(metrics.court_position_error_m_mean)
        self.assertAlmostEqual(metrics.coverage_pct, 100.0)

        # Check provenance breakdowns
        self.assertIn("pose_both_ankles", metrics.by_provenance)
        self.assertIn("pose_left_ankle", metrics.by_provenance)
        self.assertIn("bbox_bottom_center", metrics.by_provenance)
        self.assertEqual(metrics.by_provenance["pose_both_ankles"].sample_count, 1)

    def test_missing_ground_position_gt_is_unavailable(self):
        """Missing foot/ground GT returns status UNAVAILABLE."""
        metrics = evaluate_ground_position(None, [{"frameIndex": 1}])
        self.assertEqual(metrics.status, "UNAVAILABLE")
        self.assertIsNone(metrics.pixel_error_mean)
        self.assertIsNone(metrics.court_position_error_m_mean)


class TestTrackingIdentityEvaluation(unittest.TestCase):
    def test_id_switch_and_idf1_supported_case(self):
        """Computes ID switches and standard MOT IDF1."""
        gt_tracks = [
            {"frameIndex": 1, "playerId": "P1", "bbox": [100, 100, 150, 200]},
            {"frameIndex": 2, "playerId": "P1", "bbox": [105, 100, 155, 200]},
            {"frameIndex": 3, "playerId": "P1", "bbox": [110, 100, 160, 200]},
            {"frameIndex": 4, "playerId": "P1", "bbox": [115, 100, 165, 200]},
        ]
        # Track ID switches from 10 to 20 at frame 3
        pred_tracks = [
            {"frameIndex": 1, "trackId": 10, "bbox": [100, 100, 150, 200]},
            {"frameIndex": 2, "trackId": 10, "bbox": [105, 100, 155, 200]},
            {"frameIndex": 3, "trackId": 20, "bbox": [110, 100, 160, 200]},
            {"frameIndex": 4, "trackId": 20, "bbox": [115, 100, 165, 200]},
        ]
        metrics = evaluate_identity(gt_tracks, pred_tracks, duration_sec=10.0)
        self.assertEqual(metrics.status, "MEASURED")
        self.assertEqual(metrics.id_switch_count, 1)
        self.assertEqual(metrics.id_switches_per_10_min, 60.0)  # 1 switch in 10s -> 60 in 10 min
        self.assertIsNotNone(metrics.idf1)
        self.assertGreater(metrics.idf1, 0.0)

    def test_hota_strictly_reported_unavailable(self):
        """HOTA must be explicitly reported as UNAVAILABLE (never approximated)."""
        metrics = evaluate_identity([{"frameIndex": 1, "playerId": "P1"}], [{"frameIndex": 1, "trackId": 1}])
        self.assertEqual(metrics.hota_status, "UNAVAILABLE")
        self.assertEqual(metrics.hota_reason, "insufficient implementation/GT")
        self.assertIsNone(metrics.hota)


class TestSplitSafetyAndLeakageGuard(unittest.TestCase):
    def test_leakage_guard_detects_co_located_adjacent_video(self):
        """Splits sharing the same recordingGroup or videoReference are flagged as leakage."""
        c1 = BenchmarkClipEntry(
            id="clip1", name="Clip 1", sport="badminton", game_type="singles", player_count=2,
            camera_type="static_rear", camera_motion="static",
            recording_group="match_final_session_01", video_reference="videos/match_final.mp4",
        )
        c2 = BenchmarkClipEntry(
            id="clip2", name="Clip 2", sport="badminton", game_type="singles", player_count=2,
            camera_type="static_rear", camera_motion="static",
            recording_group="match_final_session_01", video_reference="videos/match_final.mp4",
        )
        # Attempting to put c1 in train and c2 in test
        splits = {"train": [c1], "test": [c2]}
        valid, errors = validate_split_leakage(splits)
        self.assertFalse(valid)
        self.assertTrue(any("Data leakage detected" in err for err in errors))

    def test_leakage_guard_passes_isolated_splits(self):
        """Independent venues and sessions pass split leakage validation."""
        c1 = BenchmarkClipEntry(
            id="clip1", name="Clip 1", sport="badminton", game_type="singles", player_count=2,
            camera_type="static_rear", camera_motion="static",
            venue_id="venue_A", recording_group="session_A", video_reference="videos/clip_A.mp4",
        )
        c2 = BenchmarkClipEntry(
            id="clip2", name="Clip 2", sport="badminton", game_type="singles", player_count=2,
            camera_type="static_rear", camera_motion="static",
            venue_id="venue_B", recording_group="session_B", video_reference="videos/clip_B.mp4",
        )
        splits = {"train": [c1], "test": [c2]}
        valid, errors = validate_split_leakage(splits)
        self.assertTrue(valid)
        self.assertEqual(len(errors), 0)

    def test_partition_by_group(self):
        """partition_clips_by_group safely groups by venueId or recordingGroup."""
        clips = [
            BenchmarkClipEntry(id="c1", name="C1", sport="b", game_type="s", player_count=2, camera_type="c", camera_motion="m", venue_id="court_1"),
            BenchmarkClipEntry(id="c2", name="C2", sport="b", game_type="s", player_count=2, camera_type="c", camera_motion="m", venue_id="court_1"),
            BenchmarkClipEntry(id="c3", name="C3", sport="b", game_type="s", player_count=2, camera_type="c", camera_motion="m", venue_id="court_2"),
        ]
        grouped = partition_clips_by_group(clips, group_key="venueId")
        self.assertEqual(len(grouped["court_1"]), 2)
        self.assertEqual(len(grouped["court_2"]), 1)


class TestBenchmarkProvenanceAndPathSanitization(unittest.TestCase):
    def test_path_sanitization_strips_sensitive_local_paths(self):
        """Sanitizer preserves relative logical references and strips Windows/Unix user paths."""
        self.assertEqual(sanitize_path_reference("yolov8n.pt"), "yolov8n.pt")
        self.assertEqual(sanitize_path_reference("C:\\Users\\SecretUser\\models\\custom_yolo.engine"), "custom_yolo.engine")
        self.assertEqual(sanitize_path_reference("/home/runner/work/SportsScout/models/weights.pt"), "weights.pt")
        self.assertIsNone(sanitize_path_reference(None))

    def test_phase3_benchmark_provenance_output(self):
        """Full benchmark evaluation produces clean provenance without sensitive paths."""
        clip = BenchmarkClipEntry(
            id="clip_test", name="Clip Test", sport="badminton", game_type="singles", player_count=2,
            camera_type="static_rear", camera_motion="static", duration_sec=5.0,
        )
        report = evaluate_phase3_benchmark(
            clip=clip,
            detector_model="C:\\Users\\User\\weights\\yolov8n.pt",
            tracker_model="bytetrack",
        )
        self.assertEqual(report.provenance.detector_model, "yolov8n.pt")
        self.assertNotIn("Users", report.provenance.detector_model)
        summary = report.format_text_summary()
        self.assertIn("=== PHASE 3.4 BENCHMARK REPORT ===", summary)
        self.assertIn("--- UNAVAILABLE METRICS ---", summary)


class TestBackwardCompatibility(unittest.TestCase):
    def test_old_manifest_without_phase3_fields_still_loads(self):
        """Legacy JSON manifest with only Phase 1.3 fields loads seamlessly."""
        legacy_data = {
            "schemaVersion": 1,
            "manifestId": "legacy_v1_manifest",
            "updatedAt": "2026-09-01T00:00:00Z",
            "clips": [
                {
                    "id": "old_clip_01",
                    "name": "Old Clip",
                    "sport": "badminton",
                    "gameType": "singles",
                    "playerCount": 2,
                    "cameraType": "static_rear",
                    "cameraMotion": "static",
                    "groundTruthAvailable": False,
                }
            ],
        }
        manifest = BenchmarkManifest.from_dict(legacy_data)
        clip = manifest.clips[0]
        self.assertEqual(clip.id, "old_clip_01")
        self.assertIsNone(clip.venue_id)
        self.assertIsNone(clip.camera_id)
        self.assertFalse(clip.calibration_ground_truth_available)
        self.assertFalse(clip.camera_cut_ground_truth_available)


if __name__ == "__main__":
    unittest.main()
