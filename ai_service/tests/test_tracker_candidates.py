"""Behavior tests for the Phase 1.5B BoT-SORT benchmark candidate."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

ai_service_dir = Path(__file__).parent.parent
if str(ai_service_dir) not in sys.path:
    sys.path.insert(0, str(ai_service_dir))

from benchmark_runner import (
    BenchmarkCommonConfig,
    build_detector_matrix,
    build_tracker_benchmark_config,
    validate_tracker_comparison_pair,
)
from engine_config import InvalidEngineConfigError, create_baseline_engine_config, resolve_tracker_config
from tracker_candidates import get_baseline_tracker_candidate, get_tracker_candidate, list_tracker_candidates


class TestTrackerCandidates(unittest.TestCase):
    def test_bytetrack_remains_the_explicit_baseline(self):
        baseline = get_baseline_tracker_candidate()

        self.assertEqual(baseline.id, "bytetrack")
        self.assertTrue(baseline.baseline)
        self.assertEqual(create_baseline_engine_config().tracker_name, "bytetrack")
        self.assertFalse(create_baseline_engine_config().reid_enabled)

    def test_botsort_is_a_non_reid_explicit_candidate(self):
        candidate = get_tracker_candidate("botsort")

        self.assertEqual(candidate.id, "botsort")
        self.assertFalse(candidate.baseline)
        self.assertFalse(candidate.reid_enabled)
        self.assertIsNone(candidate.reid_model)
        self.assertEqual(resolve_tracker_config(candidate.tracker_name, candidate.tracker_config), "botsort.yaml")
        self.assertEqual([item.id for item in list_tracker_candidates()], ["bytetrack", "botsort", "botsort_reid"])

    def test_botsort_reid_is_an_explicit_reid_candidate(self):
        candidate = get_tracker_candidate("botsort_reid")

        self.assertEqual(candidate.id, "botsort_reid")
        self.assertFalse(candidate.baseline)
        self.assertTrue(candidate.reid_enabled)
        self.assertEqual(candidate.reid_model, "spatial_multi_zone_v1")
        self.assertEqual(resolve_tracker_config(candidate.tracker_name, candidate.tracker_config), "botsort.yaml")

    def test_paired_tracker_config_changes_only_tracker_provenance(self):
        baseline = build_detector_matrix(BenchmarkCommonConfig(device="cpu"))[0]
        bytetrack, botsort = build_tracker_benchmark_config(baseline, "botsort")

        self.assertEqual(bytetrack.tracker, "bytetrack")
        self.assertEqual(botsort.tracker, "botsort")
        self.assertFalse(botsort.reid_enabled)
        self.assertIsNone(botsort.reid_model)
        self.assertEqual(botsort.to_dict()["tracker"], "botsort")
        self.assertEqual(botsort.to_dict()["reidEnabled"], False)
        validate_tracker_comparison_pair([bytetrack, botsort])

    def test_unknown_candidate_fails_without_bytetrack_fallback(self):
        with self.assertRaisesRegex(InvalidEngineConfigError, "Unknown tracker candidate"):
            get_tracker_candidate("not-a-tracker")

        baseline = build_detector_matrix(BenchmarkCommonConfig(device="cpu"))[0]
        with self.assertRaisesRegex(InvalidEngineConfigError, "Unknown tracker candidate"):
            build_tracker_benchmark_config(baseline, "not-a-tracker")


if __name__ == "__main__":
    unittest.main()
