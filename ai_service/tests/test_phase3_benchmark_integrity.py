"""
Integrity tests for scripts/run_phase3_heldout_benchmark.py.

The runner must never produce a valid certification from predictions derived from
ground truth, from ground truth that is not human-reviewed, or without measured
pipeline predictions. A positive control proves the gate can still pass when every
requirement is genuinely met.
"""

import contextlib
import importlib.util
import io
import json
import random
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
RUNNER_PATH = REPO_ROOT / "scripts" / "run_phase3_heldout_benchmark.py"
REPO_DATASET = REPO_ROOT / "datasets" / "badminton"

_spec = importlib.util.spec_from_file_location("phase3_heldout_runner", RUNNER_PATH)
runner = importlib.util.module_from_spec(_spec)
sys.modules["phase3_heldout_runner"] = runner
_spec.loader.exec_module(runner)

APPROVED_THRESHOLDS = {
    "status": "APPROVED_FROZEN",
    "approvedBy": "test-owner",
    "approvalDate": "2026-11-06T00:00:00Z",
    "maxReprojectionErrorPx": 12.0,
    "maxCourtPositionErrorM": 0.35,
    "minCameraCutF1": 0.90,
    "maxIdSwitchesPer10Min": 2.0,
}


def _load(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def _noisy_predictions(dataset_root: Path, out_dir: Path, seed: int = 7, sha_override: str | None = None,
                       constant_offset: bool = False) -> None:
    """Write per-clip predictions that look like detector output: small, varying error."""
    rng = random.Random(seed)
    manifest = _load(dataset_root / "manifest.json")
    out_dir.mkdir(parents=True, exist_ok=True)
    for clip in manifest["clips"]:
        refs = clip["groundTruth"]
        cuts = _load(dataset_root / refs["cuts"]).get("cuts", [])
        cal = _load(dataset_root / refs["calibration"])
        positions = _load(dataset_root / refs["positions"]).get("positions", [])
        tracks = _load(dataset_root / refs["identity"]).get("tracks", [])

        def jitter(scale: float) -> float:
            return 0.0 if constant_offset else rng.uniform(-scale, scale)

        cal_frames = []
        for start, end in cal.get("validIntervals", [[0.0, clip.get("durationSec") or 10.0]]):
            mid = (start + end) / 2.0
            cal_frames.append({
                "frameIndex": int(mid * 30),
                "timestampSec": round(mid, 3),
                "cameraSegmentId": "segment-1",
                "calibrationState": "CALIBRATED",
                "calibration": {
                    "cornersPx": [[x + jitter(0.8), y + jitter(0.8)] for x, y in cal["cornersPx"]],
                    "cornersCourtM": cal.get("cornersCourtM"),
                },
            })
        doc = {
            "clipId": clip["id"],
            "sourceMediaSha256": sha_override or clip["sourceMediaSha256"],
            "pipeline": {"engineVersion": "test", "detectorModel": "yolov8n.pt", "trackerModel": "bytetrack",
                         "runtime": "pytorch", "device": "cpu"},
            "cuts": [round(t + jitter(0.03), 3) for t in cuts],
            "calibrationFrames": cal_frames,
            "positions": [
                {**p,
                 "groundPx": {"x": p["groundPx"]["x"] + 1.0 + jitter(1.5), "y": p["groundPx"]["y"] - 1.0 + jitter(1.5)},
                 "courtPositionM": {"xM": p["courtPositionM"]["xM"] + jitter(0.05),
                                    "yM": p["courtPositionM"]["yM"] + jitter(0.05)}}
                for p in positions
            ],
            "tracks": [{**t, "bbox": [v + jitter(1.0) for v in t.get("bbox", [0, 0, 10, 10])]} for t in tracks],
        }
        (out_dir / f"{clip['id']}.predictions.json").write_text(json.dumps(doc), encoding="utf-8")


def _make_human_reviewed_copy(dest: Path) -> Path:
    """Copy the repo dataset and mark it as if named humans had reviewed it (positive control only)."""
    shutil.copytree(REPO_DATASET, dest)
    manifest_path = dest / "manifest.json"
    manifest = _load(manifest_path)
    for clip in manifest["clips"]:
        clip.update({
            "primaryReviewerId": "annotator.alpha",
            "independentSecondReviewer": "annotator.bravo",
            "predictionBlindingStatus": "BLINDED",
            "annotationIntervalComplete": True,
            "groundTruthAvailable": True,
            "calibrationGroundTruthAvailable": True,
            "playerIdentityGroundTruthAvailable": True,
            "groundPositionGroundTruthAvailable": True,
            "cameraCutGroundTruthAvailable": True,
        })
        for rel in clip["groundTruth"].values():
            stream_path = dest / rel
            doc = _load(stream_path)
            doc.update({"provenance": "HUMAN_REVIEWED", "reviewerId": "annotator.alpha",
                        "independentSecondReviewer": "annotator.bravo", "predictionBlindingStatus": "BLINDED"})
            stream_path.write_text(json.dumps(doc), encoding="utf-8")
    manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
    return manifest_path


class TestPhase3RunnerIntegrity(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.tmp = Path(self._tmp.name)
        self.out = self.tmp / "out"
        self.thresholds = self.tmp / "thresholds.json"
        self.thresholds.write_text(json.dumps(APPROVED_THRESHOLDS), encoding="utf-8")

    def tearDown(self):
        self._tmp.cleanup()

    def _run(self, **kwargs) -> dict:
        kwargs.setdefault("manifest_path", REPO_DATASET / "manifest.json")
        with contextlib.redirect_stdout(io.StringIO()):
            return runner.run_benchmark(output_dir=self.out, **kwargs)

    def test_without_predictions_every_clip_is_not_run(self):
        result = self._run()
        self.assertEqual(result["evidenceKind"], runner.EVIDENCE_KIND_NOT_RUN)
        self.assertFalse(result["certificationValid"])
        self.assertFalse(result["overallHoldoutCertified"])
        self.assertTrue(all(c["status"] == "NOT_RUN" for c in result["clips"].values()))
        self.assertTrue((self.out / runner.REPORT_FILENAME).is_file())
        self.assertFalse(result["runnerPerformsInference"])

    def test_selftest_is_labelled_and_never_certifies(self):
        result = self._run(selftest_synthetic=True, thresholds_path=self.thresholds)
        self.assertEqual(result["evidenceKind"], runner.EVIDENCE_KIND_SELFTEST)
        self.assertFalse(result["certificationValid"])
        self.assertTrue((self.out / runner.SELFTEST_REPORT_FILENAME).is_file())
        self.assertFalse((self.out / runner.REPORT_FILENAME).exists())

    def test_selftest_never_certifies_even_on_human_reviewed_data(self):
        manifest = _make_human_reviewed_copy(self.tmp / "dataset")
        result = self._run(manifest_path=manifest, selftest_synthetic=True, thresholds_path=self.thresholds)
        self.assertFalse(result["certificationValid"])

    def test_predictions_and_selftest_are_mutually_exclusive(self):
        with self.assertRaises(ValueError):
            self._run(predictions_dir=self.tmp, selftest_synthetic=True)

    def test_repository_ground_truth_cannot_certify(self):
        preds = self.tmp / "preds"
        _noisy_predictions(REPO_DATASET, preds)
        result = self._run(predictions_dir=preds, thresholds_path=self.thresholds)
        self.assertEqual(result["evidenceKind"], runner.EVIDENCE_KIND_MEASURED)
        self.assertFalse(result["certificationValid"])
        self.assertTrue(any("HUMAN_REVIEWED" in b for b in result["certificationBlockers"]))

    def test_default_thresholds_are_proposed_and_block_certification(self):
        manifest = _make_human_reviewed_copy(self.tmp / "dataset")
        preds = self.tmp / "preds"
        _noisy_predictions(manifest.parent, preds)
        result = self._run(manifest_path=manifest, predictions_dir=preds)
        self.assertEqual(result["thresholds"]["status"], "PROPOSED_FOR_OWNER_REVIEW")
        self.assertIsNone(result["thresholds"]["approvedBy"])
        self.assertFalse(result["certificationValid"])

    def test_source_media_mismatch_is_not_run(self):
        manifest = _make_human_reviewed_copy(self.tmp / "dataset")
        preds = self.tmp / "preds"
        _noisy_predictions(manifest.parent, preds, sha_override="0" * 64)
        result = self._run(manifest_path=manifest, predictions_dir=preds, thresholds_path=self.thresholds)
        self.assertFalse(result["certificationValid"])
        self.assertTrue(all(c["status"] == "NOT_RUN" for c in result["clips"].values()))

    def test_constant_offset_predictions_are_rejected(self):
        manifest = _make_human_reviewed_copy(self.tmp / "dataset")
        preds = self.tmp / "preds"
        _noisy_predictions(manifest.parent, preds, constant_offset=True)
        result = self._run(manifest_path=manifest, predictions_dir=preds, thresholds_path=self.thresholds)
        self.assertFalse(result["certificationValid"])
        reasons = [c.get("reason", "") for c in result["clips"].values()]
        self.assertTrue(all("constant offset" in r for r in reasons), reasons)

    def test_positive_control_certifies_when_every_requirement_is_met(self):
        manifest = _make_human_reviewed_copy(self.tmp / "dataset")
        preds = self.tmp / "preds"
        _noisy_predictions(manifest.parent, preds)
        result = self._run(manifest_path=manifest, predictions_dir=preds, thresholds_path=self.thresholds)
        self.assertEqual(result["certificationBlockers"], [])
        self.assertTrue(result["certificationValid"])


if __name__ == "__main__":
    unittest.main()
