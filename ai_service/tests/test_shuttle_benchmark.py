"""
ai_service/tests/test_shuttle_benchmark.py

Comprehensive tests for Phase 2.6 Shuttle Quality Benchmark:
1. perfect prediction
2. known pixel offset
3. false positive
4. missed visible shuttle
5. occluded GT
6. lost gap
7. reacquisition time
8. resolution normalization
9. missing GT
10. unknown coordinates
11. no NaN/Infinity
12. configuration comparison (Temporal only vs Temporal + Auxiliary)
13. incomplete ground truth reporting (GROUND TRUTH DATASET INCOMPLETE)
"""

import math
from pathlib import Path
import unittest

from ai_service.shuttle_benchmark import (
    ShuttleBenchmarkConfig,
    ShuttleQualityMetrics,
    align_predictions_and_ground_truth,
    evaluate_shuttle_tracking,
    format_benchmark_report,
    run_benchmark_on_manifest,
)
from ai_service.shuttle_benchmark_schema import (
    ShuttleBenchmarkClip,
    ShuttleBenchmarkManifest,
    ShuttleGroundTruthFrame,
)
from ai_service.shuttle_telemetry import (
    ShuttleObservation,
    ShuttlePositionPx,
)


class TestShuttleQualityBenchmark(unittest.TestCase):
    def test_perfect_prediction(self):
        """1. Perfect prediction: exactly matching coordinates, 100% recall, 0 pixel error."""
        gt_frames = [
            ShuttleGroundTruthFrame(
                frame_index=i,
                timestamp_sec=i * 0.033,
                visibility="visible",
                x_px=500.0 + i * 10.0,
                y_px=300.0 + i * 5.0,
            )
            for i in range(10)
        ]
        predictions = [
            ShuttleObservation(
                frame_index=i,
                timestamp_sec=i * 0.033,
                state="observed",
                position_px=ShuttlePositionPx(500.0 + i * 10.0, 300.0 + i * 5.0),
                confidence=0.95,
            )
            for i in range(10)
        ]

        pairs = align_predictions_and_ground_truth(gt_frames, predictions)
        self.assertEqual(len(pairs), 10)

        metrics = evaluate_shuttle_tracking(
            pairs,
            source_width=1920,
            source_height=1080,
            source_fps=30.0,
        )

        self.assertEqual(metrics.dataset_status, "COMPLETE")
        self.assertEqual(metrics.visible_frame_recall, 1.0)
        self.assertEqual(metrics.precision, 1.0)
        self.assertEqual(metrics.true_positives_count, 10)
        self.assertEqual(metrics.false_positives_count, 0)
        self.assertEqual(metrics.false_negatives_count, 0)
        self.assertEqual(metrics.false_positives_per_minute, 0.0)
        self.assertAlmostEqual(metrics.mean_pixel_error, 0.0, places=4)
        self.assertAlmostEqual(metrics.median_pixel_error, 0.0, places=4)
        self.assertAlmostEqual(metrics.p95_pixel_error, 0.0, places=4)
        self.assertAlmostEqual(metrics.mean_normalized_error, 0.0, places=6)
        self.assertEqual(metrics.track_continuity, 1.0)
        self.assertEqual(metrics.longest_continuous_track_frames, 10)
        self.assertEqual(metrics.track_fragmentation_count, 0)
        self.assertEqual(metrics.lost_percent, 0.0)
        self.assertEqual(metrics.observed_percent, 100.0)

    def test_known_pixel_offset(self):
        """2. Known pixel offset: dx=3.0, dy=4.0 -> distance=5.0 pixels."""
        gt_frames = [
            ShuttleGroundTruthFrame(
                frame_index=i,
                timestamp_sec=i * 0.033,
                visibility="visible",
                x_px=100.0,
                y_px=100.0,
            )
            for i in range(5)
        ]
        # Offset by dx=3.0, dy=4.0 -> distance = sqrt(9 + 16) = 5.0
        predictions = [
            ShuttleObservation(
                frame_index=i,
                timestamp_sec=i * 0.033,
                state="observed",
                position_px=ShuttlePositionPx(103.0, 104.0),
                confidence=0.9,
            )
            for i in range(5)
        ]

        pairs = align_predictions_and_ground_truth(gt_frames, predictions)
        metrics = evaluate_shuttle_tracking(
            pairs,
            source_width=1920,
            source_height=1080,
            source_fps=30.0,
        )

        self.assertAlmostEqual(metrics.mean_pixel_error, 5.0, places=4)
        self.assertAlmostEqual(metrics.median_pixel_error, 5.0, places=4)
        self.assertAlmostEqual(metrics.p95_pixel_error, 5.0, places=4)

        diag = math.hypot(1920, 1080)
        self.assertAlmostEqual(metrics.mean_normalized_error, 5.0 / diag, places=6)

    def test_false_positive(self):
        """3. False positive: model observed shuttle when GT states not_visible."""
        gt_frames = [
            ShuttleGroundTruthFrame(
                frame_index=0,
                timestamp_sec=0.0,
                visibility="visible",
                x_px=100.0,
                y_px=100.0,
            ),
            ShuttleGroundTruthFrame(
                frame_index=1,
                timestamp_sec=0.033,
                visibility="not_visible",
                x_px=None,
                y_px=None,
            ),
        ]
        predictions = [
            ShuttleObservation(
                frame_index=0,
                timestamp_sec=0.0,
                state="observed",
                position_px=ShuttlePositionPx(100.0, 100.0),
            ),
            # Hallucinated observed shuttle on not_visible frame
            ShuttleObservation(
                frame_index=1,
                timestamp_sec=0.033,
                state="observed",
                position_px=ShuttlePositionPx(200.0, 200.0),
            ),
        ]

        pairs = align_predictions_and_ground_truth(gt_frames, predictions)
        metrics = evaluate_shuttle_tracking(
            pairs,
            source_width=1920,
            source_height=1080,
            source_fps=30.0,
        )

        self.assertEqual(metrics.true_positives_count, 1)
        self.assertEqual(metrics.false_positives_count, 1)
        # Precision: 1 / (1 + 1) = 0.5
        self.assertAlmostEqual(metrics.precision, 0.5, places=4)
        self.assertGreater(metrics.false_positives_per_minute, 0.0)

    def test_missed_visible_shuttle(self):
        """4. Missed visible shuttle: GT is visible, but prediction is lost."""
        gt_frames = [
            ShuttleGroundTruthFrame(
                frame_index=i,
                timestamp_sec=i * 0.033,
                visibility="visible",
                x_px=100.0,
                y_px=100.0,
            )
            for i in range(4)
        ]
        # Frame 0 and 1 tracked; frame 2 and 3 lost
        predictions = [
            ShuttleObservation(
                frame_index=0,
                timestamp_sec=0.0,
                state="observed",
                position_px=ShuttlePositionPx(100.0, 100.0),
            ),
            ShuttleObservation(
                frame_index=1,
                timestamp_sec=0.033,
                state="observed",
                position_px=ShuttlePositionPx(100.0, 100.0),
            ),
            ShuttleObservation(
                frame_index=2,
                timestamp_sec=0.066,
                state="lost",
                position_px=None,
            ),
            ShuttleObservation(
                frame_index=3,
                timestamp_sec=0.099,
                state="lost",
                position_px=None,
            ),
        ]

        pairs = align_predictions_and_ground_truth(gt_frames, predictions)
        metrics = evaluate_shuttle_tracking(pairs)

        self.assertEqual(metrics.gt_visible_count, 4)
        self.assertEqual(metrics.true_positives_count, 2)
        self.assertEqual(metrics.false_negatives_count, 2)
        # Recall: 2 / 4 = 0.5
        self.assertAlmostEqual(metrics.visible_frame_recall, 0.5, places=4)

    def test_occluded_gt(self):
        """5. Occluded GT: does NOT count as false negative for Visible-Frame Recall."""
        gt_frames = [
            ShuttleGroundTruthFrame(
                frame_index=0,
                timestamp_sec=0.0,
                visibility="visible",
                x_px=100.0,
                y_px=100.0,
            ),
            ShuttleGroundTruthFrame(
                frame_index=1,
                timestamp_sec=0.033,
                visibility="occluded",
                x_px=None,
                y_px=None,
            ),
        ]
        # Prediction lost on frame 1
        predictions = [
            ShuttleObservation(
                frame_index=0,
                timestamp_sec=0.0,
                state="observed",
                position_px=ShuttlePositionPx(100.0, 100.0),
            ),
            ShuttleObservation(
                frame_index=1,
                timestamp_sec=0.033,
                state="lost",
                position_px=None,
            ),
        ]

        pairs = align_predictions_and_ground_truth(gt_frames, predictions)
        metrics = evaluate_shuttle_tracking(pairs)

        self.assertEqual(metrics.gt_visible_count, 1)
        self.assertEqual(metrics.gt_occluded_count, 1)
        self.assertEqual(metrics.true_positives_count, 1)
        self.assertEqual(metrics.false_negatives_count, 0)
        # Recall remains 1.0 because frame 1 was occluded, not visible
        self.assertEqual(metrics.visible_frame_recall, 1.0)

    def test_lost_gap(self):
        """6. Lost gap: consecutive lost frames counted accurately."""
        # 10 frames total, frames 2-6 (5 frames) are lost
        predictions = []
        for i in range(10):
            if 2 <= i <= 6:
                predictions.append(
                    ShuttleObservation(frame_index=i, timestamp_sec=i * 0.033, state="lost", position_px=None)
                )
            else:
                predictions.append(
                    ShuttleObservation(
                        frame_index=i,
                        timestamp_sec=i * 0.033,
                        state="observed",
                        position_px=ShuttlePositionPx(100.0, 100.0),
                    )
                )

        gt_frames = [
            ShuttleGroundTruthFrame(frame_index=i, timestamp_sec=i * 0.033, visibility="visible", x_px=100.0, y_px=100.0)
            for i in range(10)
        ]

        pairs = align_predictions_and_ground_truth(gt_frames, predictions)
        metrics = evaluate_shuttle_tracking(pairs, source_fps=30.0)

        self.assertEqual(metrics.lost_frames_count, 5)
        self.assertEqual(metrics.lost_percent, 50.0)
        self.assertEqual(metrics.longest_lost_gap_frames, 5)
        self.assertAlmostEqual(metrics.longest_lost_gap_sec, 0.165, places=3)

    def test_reacquisition_time(self):
        """7. Reacquisition time: measures time/frames after visible period resumes."""
        # Sequence:
        # Frames 0-2: visible & tracked
        # Frames 3-5: occluded / lost
        # Frame 6: GT visible resumes! Tracker reacquires at Frame 8 (2 frames / 0.066s latency)
        gt_frames = [
            ShuttleGroundTruthFrame(0, 0.0, "visible", 100.0, 100.0),
            ShuttleGroundTruthFrame(1, 0.033, "visible", 100.0, 100.0),
            ShuttleGroundTruthFrame(2, 0.066, "visible", 100.0, 100.0),
            ShuttleGroundTruthFrame(3, 0.099, "occluded", None, None),
            ShuttleGroundTruthFrame(4, 0.132, "occluded", None, None),
            ShuttleGroundTruthFrame(5, 0.165, "occluded", None, None),
            ShuttleGroundTruthFrame(6, 0.198, "visible", 100.0, 100.0),
            ShuttleGroundTruthFrame(7, 0.231, "visible", 100.0, 100.0),
            ShuttleGroundTruthFrame(8, 0.264, "visible", 100.0, 100.0),
            ShuttleGroundTruthFrame(9, 0.297, "visible", 100.0, 100.0),
        ]
        predictions = [
            ShuttleObservation(frame_index=0, timestamp_sec=0.0, state="observed", position_px=ShuttlePositionPx(100.0, 100.0)),
            ShuttleObservation(frame_index=1, timestamp_sec=0.033, state="observed", position_px=ShuttlePositionPx(100.0, 100.0)),
            ShuttleObservation(frame_index=2, timestamp_sec=0.066, state="observed", position_px=ShuttlePositionPx(100.0, 100.0)),
            ShuttleObservation(frame_index=3, timestamp_sec=0.099, state="lost", position_px=None),
            ShuttleObservation(frame_index=4, timestamp_sec=0.132, state="lost", position_px=None),
            ShuttleObservation(frame_index=5, timestamp_sec=0.165, state="lost", position_px=None),
            ShuttleObservation(frame_index=6, timestamp_sec=0.198, state="lost", position_px=None),
            ShuttleObservation(frame_index=7, timestamp_sec=0.231, state="predicted", position_px=ShuttlePositionPx(99.0, 99.0)),
            ShuttleObservation(frame_index=8, timestamp_sec=0.264, state="observed", position_px=ShuttlePositionPx(100.0, 100.0)),
            ShuttleObservation(frame_index=9, timestamp_sec=0.297, state="observed", position_px=ShuttlePositionPx(100.0, 100.0)),
        ]


        pairs = align_predictions_and_ground_truth(gt_frames, predictions)
        metrics = evaluate_shuttle_tracking(pairs, source_fps=30.0)

        self.assertEqual(metrics.reacquisition_events_count, 1)
        # GT visible resumed at frame 6 (t=0.198). Observed reacquired at frame 8 (t=0.264).
        # Frames latency: 8 - 6 = 2 frames. Time latency: 0.264 - 0.198 = 0.066s.
        self.assertEqual(metrics.mean_reacquisition_frames, 2.0)
        self.assertAlmostEqual(metrics.mean_reacquisition_time_sec, 0.066, places=3)
        self.assertEqual(metrics.p95_reacquisition_frames, 2.0)

    def test_resolution_normalization(self):
        """8. Resolution normalization: compares 1920x1080 and 1280x720 diagonals."""
        # 1920x1080 diagonal = sqrt(1920^2 + 1080^2) = 2202.907 px
        gt_1080 = [ShuttleGroundTruthFrame(0, 0.0, "visible", 100.0, 100.0)]
        pred_1080 = [ShuttleObservation(0, 0.0, "observed", position_px=ShuttlePositionPx(122.02907, 100.0))]

        pairs_1080 = align_predictions_and_ground_truth(gt_1080, pred_1080)
        m_1080 = evaluate_shuttle_tracking(pairs_1080, source_width=1920, source_height=1080)

        self.assertAlmostEqual(m_1080.mean_pixel_error, 22.02907, places=3)
        # 22.02907 / 2202.907 = 0.01 (1.0% of diagonal)
        self.assertAlmostEqual(m_1080.mean_normalized_error, 0.01, places=4)
        self.assertIn("sqrt(source_width^2 + source_height^2)", m_1080.normalization_formula)

        # 1280x720 diagonal = sqrt(1280^2 + 720^2) = 1468.605 px
        gt_720 = [ShuttleGroundTruthFrame(0, 0.0, "visible", 100.0, 100.0)]
        pred_720 = [ShuttleObservation(0, 0.0, "observed", position_px=ShuttlePositionPx(114.68605, 100.0))]

        pairs_720 = align_predictions_and_ground_truth(gt_720, pred_720)
        m_720 = evaluate_shuttle_tracking(pairs_720, source_width=1280, source_height=720)

        self.assertAlmostEqual(m_720.mean_pixel_error, 14.68605, places=3)
        # 14.68605 / 1468.605 = 0.01 (1.0% of diagonal)
        self.assertAlmostEqual(m_720.mean_normalized_error, 0.01, places=4)

    def test_missing_gt_dataset_incomplete(self):
        """9. Missing GT: reports GROUND TRUTH DATASET INCOMPLETE without crashing or fabricating numbers."""
        predictions = [
            ShuttleObservation(0, 0.0, "observed", position_px=ShuttlePositionPx(100.0, 100.0)),
            ShuttleObservation(1, 0.033, "lost", position_px=None),
        ]
        # No GT frames
        pairs = align_predictions_and_ground_truth([], predictions)
        metrics = evaluate_shuttle_tracking(pairs, is_dataset_complete=False)

        self.assertEqual(metrics.dataset_status, "GROUND TRUTH DATASET INCOMPLETE")
        self.assertIsNone(metrics.visible_frame_recall)
        self.assertIsNone(metrics.precision)
        self.assertIsNone(metrics.mean_pixel_error)
        self.assertIsNone(metrics.median_pixel_error)
        self.assertIsNone(metrics.p95_pixel_error)
        self.assertIsNone(metrics.mean_normalized_error)
        self.assertIsNone(metrics.track_continuity)

        report = format_benchmark_report("S02_unannotated", "Temporal Tracker", metrics)
        self.assertIn("GROUND TRUTH DATASET INCOMPLETE", report)
        self.assertIn("NOTICE: Benchmark clips have not actually been fully annotated", report)

    def test_unknown_coordinates(self):
        """10. Unknown coordinates: handles None without coercing to (0, 0)."""
        gt_frames = [
            ShuttleGroundTruthFrame(frame_index=0, timestamp_sec=0.0, visibility="unknown", x_px=None, y_px=None),
            ShuttleGroundTruthFrame(frame_index=1, timestamp_sec=0.033, visibility="visible", x_px=500.0, y_px=500.0),
        ]
        predictions = [
            ShuttleObservation(frame_index=0, timestamp_sec=0.0, state="unknown", position_px=None),
            ShuttleObservation(frame_index=1, timestamp_sec=0.033, state="observed", position_px=ShuttlePositionPx(500.0, 500.0)),
        ]

        pairs = align_predictions_and_ground_truth(gt_frames, predictions)
        metrics = evaluate_shuttle_tracking(pairs)

        self.assertEqual(metrics.gt_unknown_count, 1)
        self.assertEqual(metrics.gt_visible_count, 1)
        self.assertEqual(metrics.position_evaluated_count, 1)
        self.assertEqual(metrics.mean_pixel_error, 0.0)

    def test_no_nan_or_infinity(self):
        """11. No NaN or Infinity: edge cases with empty arrays, zero duration, zero detections."""
        # Completely empty
        empty_metrics = evaluate_shuttle_tracking([])
        empty_dict = empty_metrics.to_dict()
        for k, v in empty_dict.items():
            if isinstance(v, float):
                self.assertTrue(math.isfinite(v), f"Key {k} has non-finite float: {v}")

        # Zero duration, only not_visible GT
        gt_not_vis = [ShuttleGroundTruthFrame(frame_index=0, timestamp_sec=0.0, visibility="not_visible", x_px=None, y_px=None)]
        pred_lost = [ShuttleObservation(frame_index=0, timestamp_sec=0.0, state="lost", position_px=None)]
        pairs = align_predictions_and_ground_truth(gt_not_vis, pred_lost)
        m = evaluate_shuttle_tracking(pairs)

        d = m.to_dict()
        for k, v in d.items():
            if isinstance(v, float):
                self.assertTrue(math.isfinite(v), f"Key {k} has non-finite float: {v}")

    def test_compare_configurations(self):
        """12. Configuration comparison: compare temporal tracker vs temporal + reacquisition."""
        gt_frames = [
            ShuttleGroundTruthFrame(frame_index=0, timestamp_sec=0.0, visibility="visible", x_px=100.0, y_px=100.0),
            ShuttleGroundTruthFrame(frame_index=1, timestamp_sec=0.033, visibility="visible", x_px=110.0, y_px=100.0),
            ShuttleGroundTruthFrame(frame_index=2, timestamp_sec=0.066, visibility="occluded", x_px=None, y_px=None),
            ShuttleGroundTruthFrame(frame_index=3, timestamp_sec=0.099, visibility="visible", x_px=130.0, y_px=100.0),
            ShuttleGroundTruthFrame(frame_index=4, timestamp_sec=0.132, visibility="visible", x_px=140.0, y_px=100.0),
        ]

        # Config A: Temporal tracker only (misses frame 3 after occlusion, recovers frame 4)
        pred_temporal_only = [
            ShuttleObservation(frame_index=0, timestamp_sec=0.0, state="observed", position_px=ShuttlePositionPx(100.0, 100.0)),
            ShuttleObservation(frame_index=1, timestamp_sec=0.033, state="observed", position_px=ShuttlePositionPx(110.0, 100.0)),
            ShuttleObservation(frame_index=2, timestamp_sec=0.066, state="lost", position_px=None),
            ShuttleObservation(frame_index=3, timestamp_sec=0.099, state="lost", position_px=None),
            ShuttleObservation(frame_index=4, timestamp_sec=0.132, state="observed", position_px=ShuttlePositionPx(140.0, 100.0)),
        ]

        # Config B: Temporal + auxiliary reacquisition (immediately recovers frame 3)
        pred_with_aux = [
            ShuttleObservation(frame_index=0, timestamp_sec=0.0, state="observed", position_px=ShuttlePositionPx(100.0, 100.0)),
            ShuttleObservation(frame_index=1, timestamp_sec=0.033, state="observed", position_px=ShuttlePositionPx(110.0, 100.0)),
            ShuttleObservation(frame_index=2, timestamp_sec=0.066, state="lost", position_px=None),
            ShuttleObservation(frame_index=3, timestamp_sec=0.099, state="observed", position_px=ShuttlePositionPx(130.0, 100.0), source="auxiliary_detector"),
            ShuttleObservation(frame_index=4, timestamp_sec=0.132, state="observed", position_px=ShuttlePositionPx(140.0, 100.0)),
        ]


        pairs_a = align_predictions_and_ground_truth(gt_frames, pred_temporal_only)
        m_a = evaluate_shuttle_tracking(pairs_a, source_width=1920, source_height=1080)

        pairs_b = align_predictions_and_ground_truth(gt_frames, pred_with_aux)
        m_b = evaluate_shuttle_tracking(pairs_b, source_width=1920, source_height=1080)

        # Config A missed 1 visible frame: recall = 3/4 = 0.75
        self.assertAlmostEqual(m_a.visible_frame_recall, 0.75, places=4)
        # Config B recovered immediately: recall = 4/4 = 1.0
        self.assertAlmostEqual(m_b.visible_frame_recall, 1.0, places=4)

        # Reacquisition latency is shorter in Config B
        self.assertLess(m_b.mean_reacquisition_frames, m_a.mean_reacquisition_frames)

    def test_alignment_rejects_same_frame_with_conflicting_timestamp(self):
        gt = [ShuttleGroundTruthFrame(frame_index=10, timestamp_sec=1.0, visibility="visible", x_px=10.0, y_px=10.0)]
        pred = [ShuttleObservation(frame_index=10, timestamp_sec=101.0, state="observed", position_px=ShuttlePositionPx(10.0, 10.0))]

        pairs = align_predictions_and_ground_truth(gt, pred)

        self.assertEqual(len(pairs), 2)
        self.assertTrue(all(pair.gt is None or pair.pred is None for pair in pairs))

    def test_alignment_accepts_timestamp_within_tolerance(self):
        gt = [ShuttleGroundTruthFrame(frame_index=10, timestamp_sec=1.0, visibility="visible", x_px=10.0, y_px=10.0)]
        pred = [ShuttleObservation(frame_index=10, timestamp_sec=1.015, state="observed", position_px=ShuttlePositionPx(10.0, 10.0))]

        pairs = align_predictions_and_ground_truth(gt, pred)

        self.assertEqual(len(pairs), 1)
        self.assertIsNotNone(pairs[0].gt)
        self.assertIsNotNone(pairs[0].pred)

    def test_alignment_does_not_override_conflicting_frame_indices_with_timestamp(self):
        gt = [ShuttleGroundTruthFrame(frame_index=10, timestamp_sec=1.0, visibility="visible", x_px=10.0, y_px=10.0)]
        pred = [ShuttleObservation(frame_index=11, timestamp_sec=1.0, state="observed", position_px=ShuttlePositionPx(10.0, 10.0))]

        pairs = align_predictions_and_ground_truth(gt, pred)

        self.assertEqual(len(pairs), 2)
        self.assertTrue(all(pair.gt is None or pair.pred is None for pair in pairs))

    def test_alignment_rejects_duplicate_ground_truth_and_prediction_frames(self):
        duplicate_gt = [
            ShuttleGroundTruthFrame(frame_index=1, timestamp_sec=0.0, visibility="visible", x_px=1.0, y_px=1.0),
            ShuttleGroundTruthFrame(frame_index=1, timestamp_sec=0.033, visibility="visible", x_px=2.0, y_px=2.0),
        ]
        duplicate_pred = [
            ShuttleObservation(frame_index=1, timestamp_sec=0.0, state="observed", position_px=ShuttlePositionPx(1.0, 1.0)),
            ShuttleObservation(frame_index=1, timestamp_sec=0.033, state="observed", position_px=ShuttlePositionPx(2.0, 2.0)),
        ]

        with self.assertRaises(ValueError):
            align_predictions_and_ground_truth(duplicate_gt, [])
        with self.assertRaises(ValueError):
            align_predictions_and_ground_truth([], duplicate_pred)

    def test_incomplete_ground_truth_keeps_accuracy_unavailable(self):
        pred = [ShuttleObservation(frame_index=0, timestamp_sec=0.0, state="observed", position_px=ShuttlePositionPx(10.0, 10.0))]

        metrics = evaluate_shuttle_tracking(
            align_predictions_and_ground_truth([], pred),
            is_dataset_complete=False,
        )

        self.assertIsNone(metrics.true_positives_count)
        self.assertIsNone(metrics.false_positives_count)
        self.assertIsNone(metrics.false_negatives_count)
        self.assertIsNone(metrics.false_positives_per_minute)

    def test_spatial_match_is_required_for_default_accuracy(self):
        gt = [ShuttleGroundTruthFrame(frame_index=0, timestamp_sec=0.0, visibility="visible", x_px=100.0, y_px=100.0)]
        wrong = [ShuttleObservation(frame_index=0, timestamp_sec=0.0, state="observed", position_px=ShuttlePositionPx(1000.0, 1000.0))]
        correct = [ShuttleObservation(frame_index=0, timestamp_sec=0.0, state="observed", position_px=ShuttlePositionPx(110.0, 100.0))]

        wrong_metrics = evaluate_shuttle_tracking(align_predictions_and_ground_truth(gt, wrong))
        correct_metrics = evaluate_shuttle_tracking(align_predictions_and_ground_truth(gt, correct))

        self.assertEqual((wrong_metrics.true_positives_count, wrong_metrics.false_positives_count, wrong_metrics.false_negatives_count), (0, 1, 1))
        self.assertEqual((correct_metrics.true_positives_count, correct_metrics.false_positives_count, correct_metrics.false_negatives_count), (1, 0, 0))

    def test_spatially_wrong_observed_points_do_not_count_as_continuity(self):
        gt = [
            ShuttleGroundTruthFrame(frame_index=i, timestamp_sec=i / 30, visibility="visible", x_px=100.0, y_px=100.0)
            for i in range(2)
        ]
        pred = [
            ShuttleObservation(frame_index=i, timestamp_sec=i / 30, state="observed", position_px=ShuttlePositionPx(1000.0, 1000.0))
            for i in range(2)
        ]

        metrics = evaluate_shuttle_tracking(align_predictions_and_ground_truth(gt, pred))

        self.assertEqual(metrics.track_continuity, 0.0)
        self.assertEqual(metrics.longest_continuous_track_frames, 0)

    def test_normalized_spatial_tolerance_is_supported(self):
        gt = [ShuttleGroundTruthFrame(frame_index=0, timestamp_sec=0.0, visibility="visible", x_px=100.0, y_px=100.0)]
        pred = [ShuttleObservation(frame_index=0, timestamp_sec=0.0, state="observed", position_px=ShuttlePositionPx(110.0, 100.0))]

        metrics = evaluate_shuttle_tracking(
            align_predictions_and_ground_truth(gt, pred),
            source_width=100,
            source_height=100,
            config=ShuttleBenchmarkConfig(
                match_distance_threshold_px=None,
                match_distance_threshold_normalized=0.08,
            ),
        )

        self.assertEqual(metrics.true_positives_count, 1)

    def test_serialization_preserves_precision_metric_and_runtime_mode(self):
        gt = [ShuttleGroundTruthFrame(frame_index=0, timestamp_sec=0.0, visibility="visible", x_px=100.0, y_px=100.0)]
        pred = [ShuttleObservation(frame_index=0, timestamp_sec=0.0, state="observed", position_px=ShuttlePositionPx(100.0, 100.0))]
        metrics = evaluate_shuttle_tracking(
            align_predictions_and_ground_truth(gt, pred),
            performance_metrics={"precision": "fp32"},
        )

        data = metrics.to_dict()

        self.assertEqual(data["precision"], 1.0)
        self.assertEqual(data["precisionMode"], "fp32")

    def test_sparse_ground_truth_does_not_create_continuous_transition(self):
        gt = [
            ShuttleGroundTruthFrame(frame_index=100, timestamp_sec=10.0, visibility="visible", x_px=100.0, y_px=100.0),
            ShuttleGroundTruthFrame(frame_index=130, timestamp_sec=13.0, visibility="visible", x_px=110.0, y_px=100.0),
        ]
        pred = [
            ShuttleObservation(frame_index=100, timestamp_sec=10.0, state="observed", position_px=ShuttlePositionPx(100.0, 100.0)),
            ShuttleObservation(frame_index=130, timestamp_sec=13.0, state="observed", position_px=ShuttlePositionPx(110.0, 100.0)),
        ]

        metrics = evaluate_shuttle_tracking(align_predictions_and_ground_truth(gt, pred))

        self.assertIsNone(metrics.track_continuity)
        self.assertEqual(metrics.longest_continuous_track_frames, 1)

    def test_irregular_lost_timestamps_are_not_derived_from_list_position(self):
        pred = [
            ShuttleObservation(frame_index=10, timestamp_sec=1.0, state="observed", position_px=ShuttlePositionPx(10.0, 10.0)),
            ShuttleObservation(frame_index=11, timestamp_sec=1.1, state="lost", position_px=None),
            ShuttleObservation(frame_index=12, timestamp_sec=1.5, state="lost", position_px=None),
            ShuttleObservation(frame_index=13, timestamp_sec=1.6, state="observed", position_px=ShuttlePositionPx(12.0, 10.0)),
        ]

        metrics = evaluate_shuttle_tracking(align_predictions_and_ground_truth([], pred), is_dataset_complete=False)

        self.assertAlmostEqual(metrics.longest_lost_gap_sec, 0.5, places=4)

    def test_sparse_lost_samples_do_not_form_one_continuous_gap(self):
        pred = [
            ShuttleObservation(frame_index=10, timestamp_sec=1.0, state="lost", position_px=None),
            ShuttleObservation(frame_index=12, timestamp_sec=1.2, state="lost", position_px=None),
        ]

        metrics = evaluate_shuttle_tracking(
            align_predictions_and_ground_truth([], pred),
            is_dataset_complete=False,
            source_fps=30.0,
        )

        self.assertEqual(metrics.longest_lost_gap_frames, 1)
        self.assertAlmostEqual(metrics.longest_lost_gap_sec, 1.0 / 30.0, places=5)

    def test_non_finite_candidate_does_not_leak_into_metrics(self):
        gt = [ShuttleGroundTruthFrame(frame_index=0, timestamp_sec=0.0, visibility="visible", x_px=1.0, y_px=1.0)]
        pred = [ShuttleObservation(frame_index=0, timestamp_sec=float("nan"), state="observed", position_px=ShuttlePositionPx(float("nan"), 1.0))]

        metrics = evaluate_shuttle_tracking(align_predictions_and_ground_truth(gt, pred))

        for value in metrics.to_dict().values():
            if isinstance(value, float):
                self.assertTrue(math.isfinite(value))
        self.assertEqual(metrics.true_positives_count, 0)
        self.assertEqual(metrics.false_positives_count, 0)
        self.assertEqual(metrics.false_negatives_count, 1)

    def test_false_reacquisition_requires_spatial_match(self):
        gt = [
            ShuttleGroundTruthFrame(frame_index=0, timestamp_sec=0.0, visibility="visible", x_px=100.0, y_px=100.0),
            ShuttleGroundTruthFrame(frame_index=1, timestamp_sec=0.1, visibility="occluded", x_px=None, y_px=None),
            ShuttleGroundTruthFrame(frame_index=2, timestamp_sec=0.2, visibility="visible", x_px=100.0, y_px=100.0),
        ]
        pred = [
            ShuttleObservation(frame_index=0, timestamp_sec=0.0, state="observed", position_px=ShuttlePositionPx(100.0, 100.0)),
            ShuttleObservation(frame_index=1, timestamp_sec=0.1, state="lost", position_px=None),
            ShuttleObservation(frame_index=2, timestamp_sec=0.2, state="observed", position_px=ShuttlePositionPx(1000.0, 1000.0)),
        ]

        metrics = evaluate_shuttle_tracking(align_predictions_and_ground_truth(gt, pred))

        self.assertEqual(metrics.reacquisition_events_count, 0)

    def test_manifest_runner_returns_complete_and_incomplete_clips(self):
        complete_clip = ShuttleBenchmarkClip(
            id="complete",
            name="Complete",
            category="S01",
            duration_sec=2.0 / 30.0,
            source_fps=30.0,
            ground_truth_available=True,
            ground_truth_frames=[
                ShuttleGroundTruthFrame(frame_index=0, timestamp_sec=0.0, visibility="visible", x_px=10.0, y_px=10.0, reviewed=True),
                ShuttleGroundTruthFrame(frame_index=1, timestamp_sec=1.0 / 30.0, visibility="visible", x_px=11.0, y_px=10.0, reviewed=True),
            ],
        )
        incomplete_clip = ShuttleBenchmarkClip(id="incomplete", name="Incomplete", category="S02")
        manifest = ShuttleBenchmarkManifest(schema_version=1, manifest_id="test", updated_at="2026-09-24", clips=[complete_clip, incomplete_clip])

        results = run_benchmark_on_manifest(manifest)

        self.assertEqual(results["complete"]["status"], "COMPLETE")
        self.assertEqual(results["incomplete"]["status"], "GROUND TRUTH DATASET INCOMPLETE")

    def test_run_manifest_reports_incomplete_dataset(self):
        """13. Running benchmark on bundled manifest accurately reports incomplete dataset."""
        manifest_path = Path(__file__).resolve().parent.parent.parent / "src" / "benchmarks" / "shuttleBenchmarkManifest.json"
        results = run_benchmark_on_manifest(manifest_path)

        self.assertIn("S01_singles_clear_rally", results)
        self.assertEqual(results["S01_singles_clear_rally"]["status"], "GROUND TRUTH DATASET INCOMPLETE")
        self.assertIn("GROUND TRUTH DATASET INCOMPLETE", results["S01_singles_clear_rally"]["report"])


if __name__ == "__main__":
    unittest.main()
