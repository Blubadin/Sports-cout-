"""
ai_service/tests/test_phase3_benchmark_gates.py — Comprehensive Unit & Regression Tests for Phase 3 Safety Gates

Validates:
1. thresholds not approved
2. missing source SHA
3. source SHA mismatch
4. missing reviewer
5. same primary/independent reviewer
6. prediction blinding missing
7. incomplete annotations
8. missing scenario
9. UNKNOWN handling
10. development data passed as holdout
11. split leakage
12. unsupported required metric
13. missing shuttle metrics
14. valid synthetic evaluator fixture
15. deterministic repeat evaluation
Plus:
- Capability-level independent outcomes (position VALIDATED while shuttle NOT VALIDATED)
- Optional experimental capability does not fail mandatory certification
"""

from __future__ import annotations
import copy
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from benchmark_schema import (
    BenchmarkClipEntry,
    Phase3QualityThresholds,
    THRESHOLD_STATUS_PROPOSED,
    THRESHOLD_STATUS_APPROVED,
    THRESHOLD_STATUS_UNSET,
    CAPABILITY_STATUS_VALIDATED,
    CAPABILITY_STATUS_NOT_VALIDATED,
    CAPABILITY_STATUS_EXPERIMENTAL,
    CAPABILITY_STATUS_BLOCKED,
    ShuttleCloseoutProvenance,
    ShuttleCloseoutMetrics,
    SCENARIO_BUCKETS,
)
from phase3_benchmark import (
    evaluate_phase3_closeout,
    evaluate_shuttle_closeout,
    validate_phase3_certification_gates,
)


def _create_valid_fixture_clip(**overrides) -> BenchmarkClipEntry:
    sha = "84160d026a350716e227cb2f6f4c4c3d35cf52ab6aac6977d8e787b0299a6817"
    defaults = {
        "id": "fixture_test_clip_01",
        "name": "Fixture Test Clip",
        "sport": "badminton",
        "game_type": "singles",
        "player_count": 2,
        "camera_type": "static_rear",
        "camera_motion": "static",
        "split": "holdout",
        "recording_group": f"sha256:{sha}",
        "source_media_sha256": sha,
        "gt_media_sha256": sha,
        "primary_reviewer_id": "auditor_primary@sportscout.local",
        "independent_second_reviewer": "auditor_secondary@sportscout.local",
        "prediction_blinding_status": "BLINDED",
        "annotation_interval_complete": True,
        "ground_truth_available": True,
        "calibration_ground_truth_available": True,
        "player_identity_ground_truth_available": True,
        "ground_position_ground_truth_available": True,
        "camera_cut_ground_truth_available": True,
        "shuttle_ground_truth_available": True,
        "is_synthetic_fixture": True,
        "is_development_data": False,
        "model_predictions_used_as_gt": False,
        "unknown_converted_to_absent": False,
        "scenario_buckets": list(SCENARIO_BUCKETS),
    }
    defaults.update(overrides)
    return BenchmarkClipEntry(**defaults)


def _create_approved_thresholds(**overrides) -> Phase3QualityThresholds:
    defaults = {
        "status": THRESHOLD_STATUS_APPROVED,
        "approved_by": "product_owner@sportscout.local",
        "approval_date": "2026-10-06T12:00:00Z",
        "max_reprojection_error_px": 12.0,
        "max_court_position_error_m": 0.35,
        "min_camera_cut_f1": 0.90,
        "min_camera_cut_precision": 0.90,
        "min_camera_cut_recall": 0.90,
        "max_camera_cut_latency_sec": 0.50,
        "max_relock_latency_sec": 1.00,
        "max_false_valid_calibration_count": 0,
        "max_id_switches_per_10_min": 2.0,
        "min_shuttle_precision": 0.85,
        "min_shuttle_recall": 0.85,
        "max_shuttle_false_positives_per_1000": 5.0,
        "max_reacquisition_duration_sec": 1.50,
    }
    defaults.update(overrides)
    return Phase3QualityThresholds(**defaults)


def _create_passing_shuttle_metrics(sha: str) -> ShuttleCloseoutMetrics:
    prov = ShuttleCloseoutProvenance(
        provider="RallyLens",
        checkpoint_sha="08b7e904dae4fd5250d51cd82c4d58d1663351f32037df6aed77547065f026a5",
        source_media_sha=sha,
        gt_version="1.0",
        model_version="1.0.0",
        runtime_version="pytorch-2.4",
        device="cpu",
        precision="fp32",
        sampling_configuration="stride_1",
        frame_stride=1,
        visibility_semantics="strict_4_state",
        matching_tolerance_px=30.0,
        matching_rule="euclidean_2d_px <= 30.0",
    )
    return ShuttleCloseoutMetrics(
        status="MEASURED",
        provenance=prov,
        precision=0.95,
        recall=0.92,
        false_positive_count=1,
        false_positive_rate_per_1000=2.0,
        reacquisition_duration_sec=0.45,
        passed_thresholds=True,
        failure_reasons=[],
        dataset_status="COMPLETE",
    )


class TestPhase3BenchmarkSafetyGates(unittest.TestCase):
    def test_gate_1_thresholds_not_approved(self):
        """Evaluation must block certification when thresholds are not APPROVED_FROZEN."""
        clip = _create_valid_fixture_clip()
        thresholds = Phase3QualityThresholds(status=THRESHOLD_STATUS_PROPOSED)
        report = evaluate_phase3_closeout(
            clip=clip,
            thresholds=thresholds,
            is_synthetic_fixture=True,
            require_all_scenarios=True,
        )
        self.assertFalse(report.certification_passed)
        self.assertFalse(report.overall_passed)
        self.assertFalse(report.gate_checks.get("thresholds_approved", True))
        self.assertTrue(any("Threshold status is 'PROPOSED_FOR_OWNER_REVIEW'" in b for b in report.certification_blockers))

    def test_gate_2_missing_source_sha(self):
        """Evaluation must block certification when source media SHA is missing."""
        clip = _create_valid_fixture_clip(
            source_media_sha256=None,
            recording_group="provisional_group",
            video_reference="clip.mp4",
        )
        thresholds = _create_approved_thresholds()
        report = evaluate_phase3_closeout(
            clip=clip,
            thresholds=thresholds,
            is_synthetic_fixture=False,
        )
        self.assertFalse(report.certification_passed)
        self.assertFalse(report.gate_checks.get("source_sha_present", True))
        self.assertTrue(any("Source media SHA-256 is missing" in b for b in report.certification_blockers))

    def test_gate_3_source_sha_mismatch(self):
        """Evaluation must block certification when GT media SHA does not match evaluated media."""
        clip = _create_valid_fixture_clip()
        thresholds = _create_approved_thresholds()
        wrong_eval_sha = "1111111111111111111111111111111111111111111111111111111111111111"
        report = evaluate_phase3_closeout(
            clip=clip,
            thresholds=thresholds,
            evaluated_media_sha=wrong_eval_sha,
            is_synthetic_fixture=True,
        )
        self.assertFalse(report.certification_passed)
        self.assertFalse(report.gate_checks.get("media_sha_parity", True))
        self.assertTrue(any("does not match evaluated media SHA-256" in b for b in report.certification_blockers))

    def test_gate_4_missing_reviewer(self):
        """Evaluation must block certification when required human reviewer ID is missing."""
        clip = _create_valid_fixture_clip(primary_reviewer_id=None)
        thresholds = _create_approved_thresholds()
        report = evaluate_phase3_closeout(
            clip=clip,
            thresholds=thresholds,
            is_synthetic_fixture=True,
        )
        self.assertFalse(report.certification_passed)
        self.assertFalse(report.gate_checks.get("primary_reviewer_present", True))
        self.assertTrue(any("Missing or invalid primary human reviewer ID" in b for b in report.certification_blockers))

    def test_gate_5_same_primary_and_independent_reviewer(self):
        """Evaluation must block certification when independent reviewer equals primary reviewer."""
        clip = _create_valid_fixture_clip(
            primary_reviewer_id="reviewer_sam@sportscout.local",
            independent_second_reviewer="reviewer_sam@sportscout.local",
        )
        thresholds = _create_approved_thresholds()
        report = evaluate_phase3_closeout(
            clip=clip,
            thresholds=thresholds,
            is_synthetic_fixture=False,
            require_independent_review=True,
        )
        self.assertFalse(report.certification_passed)
        self.assertFalse(report.gate_checks.get("independent_reviewer_present", True))
        self.assertTrue(any("Independent second reviewer equals primary reviewer" in b for b in report.certification_blockers))

    def test_gate_6_prediction_blinding_missing(self):
        """Evaluation must block certification when prediction blinding is not satisfied."""
        clip = _create_valid_fixture_clip(prediction_blinding_status="UNBLINDED")
        thresholds = _create_approved_thresholds()
        report = evaluate_phase3_closeout(
            clip=clip,
            thresholds=thresholds,
            is_synthetic_fixture=True,
        )
        self.assertFalse(report.certification_passed)
        self.assertFalse(report.gate_checks.get("prediction_blinding", True))
        self.assertTrue(any("Prediction blinding requirement not satisfied" in b for b in report.certification_blockers))

    def test_gate_7_incomplete_annotations(self):
        """Evaluation must block certification when annotation interval is incomplete."""
        clip = _create_valid_fixture_clip(annotation_interval_complete=False)
        thresholds = _create_approved_thresholds()
        report = evaluate_phase3_closeout(
            clip=clip,
            thresholds=thresholds,
            is_synthetic_fixture=True,
        )
        self.assertFalse(report.certification_passed)
        self.assertFalse(report.gate_checks.get("annotation_complete", True))
        self.assertTrue(any("Annotation interval is incomplete" in b for b in report.certification_blockers))

    def test_gate_8_missing_scenario(self):
        """Evaluation must block certification when mandatory scenario coverage is missing."""
        clip = _create_valid_fixture_clip(scenario_buckets=["rear_court", "camera_cut"])
        thresholds = _create_approved_thresholds()
        report = evaluate_phase3_closeout(
            clip=clip,
            thresholds=thresholds,
            is_synthetic_fixture=True,
            require_all_scenarios=True,
        )
        self.assertFalse(report.certification_passed)
        self.assertFalse(report.gate_checks.get("all_scenarios_covered", True))
        self.assertTrue(any("Missing required scenario coverage" in b for b in report.certification_blockers))

    def test_gate_9_unknown_handling(self):
        """Evaluation must block certification when UNKNOWN frames are silently coerced to ABSENT."""
        clip = _create_valid_fixture_clip(unknown_converted_to_absent=True)
        thresholds = _create_approved_thresholds()
        report = evaluate_phase3_closeout(
            clip=clip,
            thresholds=thresholds,
            unknown_converted_to_absent=True,
            is_synthetic_fixture=True,
        )
        self.assertFalse(report.certification_passed)
        self.assertFalse(report.gate_checks.get("no_unknown_as_absent", True))
        self.assertTrue(any("UNKNOWN ground truth frames were silently converted into ABSENT" in b for b in report.certification_blockers))

    def test_gate_10_development_data_passed_as_holdout(self):
        """Evaluation must block certification when development data is claimed as held-out."""
        clip = _create_valid_fixture_clip(is_development_data=True, split="holdout")
        thresholds = _create_approved_thresholds()
        report = evaluate_phase3_closeout(
            clip=clip,
            thresholds=thresholds,
            is_synthetic_fixture=False,
        )
        self.assertFalse(report.certification_passed)
        self.assertFalse(report.gate_checks.get("no_dev_data_as_holdout", True))
        self.assertTrue(any("flagged as development data but claimed as held-out" in b for b in report.certification_blockers))

    def test_gate_11_split_leakage(self):
        """Evaluation must block certification when recording/match leakage exists across splits."""
        sha = "84160d026a350716e227cb2f6f4c4c3d35cf52ab6aac6977d8e787b0299a6817"
        clip_dev = _create_valid_fixture_clip(id="clip_dev", split="development", recording_group=f"sha256:{sha}")
        clip_holdout = _create_valid_fixture_clip(id="clip_holdout", split="holdout", recording_group=f"sha256:{sha}")
        splits = {"development": [clip_dev], "holdout": [clip_holdout]}

        thresholds = _create_approved_thresholds()
        report = evaluate_phase3_closeout(
            clip=clip_holdout,
            thresholds=thresholds,
            all_splits=splits,
            is_synthetic_fixture=True,
        )
        self.assertFalse(report.certification_passed)
        self.assertFalse(report.gate_checks.get("split_leakage_free", True))
        self.assertTrue(any("Split leakage detected" in b for b in report.certification_blockers))

    def test_gate_12_unsupported_required_metric(self):
        """Evaluation must block certification when a required metric is unsupported or returns unavailable."""
        clip = _create_valid_fixture_clip()
        thresholds = _create_approved_thresholds()
        # camera cuts are required, but ground_truth_cuts is None -> UNAVAILABLE
        report = evaluate_phase3_closeout(
            clip=clip,
            thresholds=thresholds,
            ground_truth_cuts=None,
            predicted_cuts=[1.0, 5.0],
            is_synthetic_fixture=True,
            required_capabilities=["camera_cuts"],
        )
        self.assertFalse(report.certification_passed)
        self.assertEqual(report.capability_outcomes.get("camera_cuts"), CAPABILITY_STATUS_NOT_VALIDATED)
        self.assertTrue(any("Required capability 'camera_cuts' is 'NOT VALIDATED'" in b for b in report.certification_blockers))

    def test_gate_13_missing_shuttle_metrics(self):
        """Evaluation must block certification when required shuttle metrics are missing."""
        clip = _create_valid_fixture_clip()
        thresholds = _create_approved_thresholds()
        report = evaluate_phase3_closeout(
            clip=clip,
            thresholds=thresholds,
            shuttle_closeout_metrics=None,
            is_synthetic_fixture=True,
            required_capabilities=["shuttle_tracking"],
        )
        self.assertFalse(report.certification_passed)
        self.assertEqual(report.capability_outcomes.get("shuttle_tracking"), CAPABILITY_STATUS_NOT_VALIDATED)
        self.assertTrue(any("Required capability 'shuttle_tracking' is 'NOT VALIDATED'" in b for b in report.certification_blockers))

    def test_gate_14_valid_synthetic_evaluator_fixture(self):
        """A valid synthetic fixture passes certification logic while explicitly flagging synthetic status."""
        sha = "84160d026a350716e227cb2f6f4c4c3d35cf52ab6aac6977d8e787b0299a6817"
        clip = _create_valid_fixture_clip()
        thresholds = _create_approved_thresholds()
        shuttle_m = _create_passing_shuttle_metrics(sha)

        report = evaluate_phase3_closeout(
            clip=clip,
            thresholds=thresholds,
            ground_truth_cuts=[2.0, 5.0],
            predicted_cuts=[2.01, 4.99],
            ground_truth_calibration={
                "cornersPx": [[100.0, 100.0], [1180.0, 100.0], [1180.0, 620.0], [100.0, 620.0]]
            },
            predicted_calibration_frames=[
                {
                    "frameIndex": 0,
                    "timestampSec": 0.0,
                    "calibrationState": "CALIBRATED",
                    "calibration": {
                        "cornersPx": [[101.0, 101.0], [1179.0, 101.0], [1179.0, 619.0], [101.0, 619.0]]
                    },
                }
            ],
            ground_truth_positions=[
                {"frameIndex": 0, "playerId": "P1", "courtPositionM": {"xM": 3.0, "yM": 6.0}, "groundPx": {"x": 200, "y": 300}}
            ],
            predicted_positions=[
                {"frameIndex": 0, "playerId": "P1", "courtPositionM": {"xM": 3.05, "yM": 6.02}, "groundPx": {"x": 201, "y": 301}}
            ],
            ground_truth_tracks=[
                {"frameIndex": 0, "playerId": "P1", "trackId": 1},
                {"frameIndex": 1, "playerId": "P1", "trackId": 1},
            ],
            predicted_tracks=[
                {"frameIndex": 0, "playerId": "P1", "trackId": 1},
                {"frameIndex": 1, "playerId": "P1", "trackId": 1},
            ],
            shuttle_closeout_metrics=shuttle_m,
            evaluated_media_sha=sha,
            is_synthetic_fixture=True,
            require_all_scenarios=True,
            require_independent_review=True,
        )

        self.assertTrue(report.certification_passed)
        self.assertTrue(report.overall_passed)
        self.assertTrue(report.is_synthetic_fixture)
        self.assertEqual(len(report.certification_blockers), 0)
        self.assertEqual(report.capability_outcomes["camera_cuts"], CAPABILITY_STATUS_VALIDATED)
        self.assertEqual(report.capability_outcomes["calibration"], CAPABILITY_STATUS_VALIDATED)
        self.assertEqual(report.capability_outcomes["ground_position"], CAPABILITY_STATUS_VALIDATED)
        self.assertEqual(report.capability_outcomes["identity"], CAPABILITY_STATUS_VALIDATED)
        self.assertEqual(report.capability_outcomes["shuttle_tracking"], CAPABILITY_STATUS_VALIDATED)

        summary = report.format_text_summary()
        self.assertIn("Synthetic test fixture", summary)
        self.assertIn("never valid as real-data accuracy", summary)

    def test_gate_15_deterministic_repeat_evaluation(self):
        """Evaluating identical inputs must produce bit-for-bit identical reports."""
        sha = "84160d026a350716e227cb2f6f4c4c3d35cf52ab6aac6977d8e787b0299a6817"
        clip = _create_valid_fixture_clip()
        thresholds = _create_approved_thresholds()
        shuttle_m = _create_passing_shuttle_metrics(sha)

        kwargs = {
            "clip": clip,
            "thresholds": thresholds,
            "ground_truth_cuts": [2.0, 5.0],
            "predicted_cuts": [2.01, 4.99],
            "shuttle_closeout_metrics": shuttle_m,
            "evaluated_media_sha": sha,
            "is_synthetic_fixture": True,
            "require_all_scenarios": False,
        }

        report1 = evaluate_phase3_closeout(**kwargs)
        report2 = evaluate_phase3_closeout(**kwargs)

        self.assertEqual(report1.to_dict(), report2.to_dict())
        self.assertEqual(report1.format_text_summary(), report2.format_text_summary())

    def test_capability_level_independent_outcomes(self):
        """Tracking position could be validated while shuttle accuracy remains NOT VALIDATED."""
        sha = "84160d026a350716e227cb2f6f4c4c3d35cf52ab6aac6977d8e787b0299a6817"
        clip = _create_valid_fixture_clip()
        thresholds = _create_approved_thresholds()

        report = evaluate_phase3_closeout(
            clip=clip,
            thresholds=thresholds,
            ground_truth_positions=[{"frameIndex": 0, "playerId": "P1", "courtPositionM": {"xM": 3.0, "yM": 6.0}, "groundPx": {"x": 200, "y": 300}}],
            predicted_positions=[{"frameIndex": 0, "playerId": "P1", "courtPositionM": {"xM": 3.05, "yM": 6.02}, "groundPx": {"x": 201, "y": 301}}],
            shuttle_closeout_metrics=None,  # Shuttle not evaluated
            evaluated_media_sha=sha,
            is_synthetic_fixture=True,
            require_all_scenarios=False,
            required_capabilities=["ground_position", "shuttle_tracking"],
        )

        self.assertEqual(report.capability_outcomes["ground_position"], CAPABILITY_STATUS_VALIDATED)
        self.assertEqual(report.capability_outcomes["shuttle_tracking"], CAPABILITY_STATUS_NOT_VALIDATED)
        # Because shuttle is a required capability and is NOT VALIDATED, overall certification is blocked:
        self.assertFalse(report.certification_passed)

    def test_optional_experimental_capability_does_not_fail_mandatory(self):
        """An optional experimental capability must not automatically fail unrelated mandatory capabilities."""
        sha = "84160d026a350716e227cb2f6f4c4c3d35cf52ab6aac6977d8e787b0299a6817"
        clip = _create_valid_fixture_clip()
        thresholds = _create_approved_thresholds()

        report = evaluate_phase3_closeout(
            clip=clip,
            thresholds=thresholds,
            ground_truth_positions=[{"frameIndex": 0, "playerId": "P1", "courtPositionM": {"xM": 3.0, "yM": 6.0}, "groundPx": {"x": 200, "y": 300}}],
            predicted_positions=[{"frameIndex": 0, "playerId": "P1", "courtPositionM": {"xM": 3.05, "yM": 6.02}, "groundPx": {"x": 201, "y": 301}}],
            evaluated_media_sha=sha,
            is_synthetic_fixture=True,
            require_all_scenarios=False,
            required_capabilities=["ground_position"],
            experimental_capabilities=["experimental_3d_biomechanics"],
        )

        self.assertEqual(report.capability_outcomes["ground_position"], CAPABILITY_STATUS_VALIDATED)
        self.assertEqual(report.capability_outcomes["experimental_3d_biomechanics"], CAPABILITY_STATUS_EXPERIMENTAL)
        self.assertTrue(report.certification_passed)


if __name__ == "__main__":
    unittest.main()
