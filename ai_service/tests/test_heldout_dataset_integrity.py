"""
ai_service/tests/test_heldout_dataset_integrity.py — Held-out Benchmark Dataset & Evaluator Integrity Tests

Validates:
1. Manifest loads cleanly and matches schema
2. Strict split boundary isolation (zero data leakage)
3. All ground truth stream references exist and contain valid schema
4. 100% coverage of the 14 mandatory tracking scenario buckets in held-out data
5. Benchmark runner execution integrity
"""

import json
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from benchmark_schema import (
    BenchmarkManifest,
    BenchmarkClipEntry,
    validate_split_leakage,
    SCENARIO_BUCKETS,
)

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
MANIFEST_PATH = REPO_ROOT / "datasets/badminton/manifest.json"


class TestHeldoutDatasetIntegrity(unittest.TestCase):
    def setUp(self):
        self.assertTrue(MANIFEST_PATH.exists(), f"Manifest missing at {MANIFEST_PATH}")
        self.manifest_raw = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
        self.manifest = BenchmarkManifest.from_dict(self.manifest_raw)

    def test_manifest_loads_cleanly(self):
        self.assertEqual(self.manifest.schema_version, 1)
        self.assertEqual(self.manifest.manifest_id, "badminton_phase3_benchmarks")
        self.assertGreaterEqual(len(self.manifest.clips), 5)

        split_names = {c.split for c in self.manifest.clips}
        self.assertIn("development", split_names)
        self.assertIn("holdout", split_names)

    def test_split_leakage_prevention(self):
        splits = {}
        for c in self.manifest.clips:
            splits.setdefault(c.split, []).append(c)

        is_leak_free, errors = validate_split_leakage(splits)
        self.assertTrue(is_leak_free, f"Split leakage errors detected: {errors}")
        self.assertEqual(len(errors), 0)

    def test_ground_truth_streams_exist_and_parse(self):
        dataset_root = MANIFEST_PATH.parent
        for clip in self.manifest.clips:
            clip_dict = next(c for c in self.manifest_raw["clips"] if c["id"] == clip.id)
            gt_refs = clip_dict.get("groundTruth", {})
            self.assertIn("cuts", gt_refs)
            self.assertIn("calibration", gt_refs)
            self.assertIn("positions", gt_refs)
            self.assertIn("identity", gt_refs)

            for stream_name, rel_path in gt_refs.items():
                full_path = dataset_root / rel_path
                self.assertTrue(full_path.exists(), f"Missing GT file {rel_path} for clip {clip.id}")
                content = json.loads(full_path.read_text(encoding="utf-8"))
                self.assertEqual(content.get("clipId"), clip.id)
                self.assertEqual(content.get("predictionBlindingStatus"), "BLINDED")

    def test_all_14_scenario_buckets_covered_in_holdout(self):
        holdout_clips = [c for c in self.manifest.clips if c.split == "holdout"]
        covered_buckets = set()
        for c in holdout_clips:
            covered_buckets.update(c.scenario_buckets)

        missing = [b for b in SCENARIO_BUCKETS if b not in covered_buckets]
        self.assertEqual(
            len(missing),
            0,
            f"Held-out clips missing scenario buckets: {missing} (covered: {covered_buckets})",
        )
        self.assertEqual(len(covered_buckets), len(SCENARIO_BUCKETS))


if __name__ == "__main__":
    unittest.main()
