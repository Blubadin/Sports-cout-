#!/usr/bin/env python3
"""
scripts/run_phase3_heldout_benchmark.py — Phase 3 held-out evaluator runner.

Scores predictions that the real tracking pipeline produced (YOLO + ByteTrack on
decoded video) against the ground-truth streams referenced by a benchmark
manifest. This runner performs no inference itself.

Modes:
  --predictions DIR       Evaluate ``DIR/<clipId>.predictions.json`` for each clip.
  --selftest-synthetic    Plumbing self-test only. Predictions are derived from
                          ground truth, so the report is always labelled
                          SYNTHETIC_SELFTEST with certificationValid=false and is
                          written to a separate SELFTEST_* file.
  (neither)               Every clip is reported NOT_RUN and certification fails.

Certification requires all of: measured predictions for every held-out clip whose
source-media SHA-256 matches the manifest, ground-truth streams whose provenance
is HUMAN_REVIEWED, owner-approved thresholds (--thresholds), every required
capability validated by the evaluator, and all mandatory scenario buckets covered.
"""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import sys
import time
from typing import Any, Optional

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT / "ai_service"))

from benchmark_schema import (  # noqa: E402
    BenchmarkManifest,
    BenchmarkClipEntry,
    Phase3QualityThresholds,
    validate_split_leakage,
    THRESHOLD_STATUS_PROPOSED,
    SCENARIO_BUCKETS,
)
from phase3_benchmark import evaluate_phase3_closeout  # noqa: E402

EVIDENCE_KIND_MEASURED = "MEASURED_PIPELINE_PREDICTIONS"
EVIDENCE_KIND_SELFTEST = "SYNTHETIC_SELFTEST"
EVIDENCE_KIND_NOT_RUN = "NOT_RUN"

GT_PROVENANCE_HUMAN = "HUMAN_REVIEWED"
GT_PROVENANCE_UNVERIFIED = "UNVERIFIED"

REPORT_FILENAME = "phase3_heldout_benchmark_report.json"
SELFTEST_REPORT_FILENAME = "SELFTEST_synthetic_phase3_report.json"

GT_STREAMS = ("cuts", "calibration", "positions", "identity")
REQUIRED_CAPABILITIES = ["camera_cuts", "calibration", "ground_position", "identity"]
EXPERIMENTAL_CAPABILITIES = ["shuttle_tracking"]


def proposed_thresholds() -> Phase3QualityThresholds:
    """Default thresholds. PROPOSED status: they never certify until an owner-approved file is supplied."""
    return Phase3QualityThresholds(status=THRESHOLD_STATUS_PROPOSED, approved_by=None, approval_date=None)


def load_thresholds(path: Optional[Path]) -> Phase3QualityThresholds:
    if path is None:
        return proposed_thresholds()
    return Phase3QualityThresholds.from_dict(json.loads(path.read_text(encoding="utf-8")))


def _read_json(path: Path) -> Optional[dict[str, Any]]:
    if not path.is_file():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def load_ground_truth(dataset_root: Path, gt_refs: dict[str, str]) -> dict[str, Optional[dict[str, Any]]]:
    return {stream: (_read_json(dataset_root / gt_refs[stream]) if gt_refs.get(stream) else None) for stream in GT_STREAMS}


def gt_provenance(gt_doc: Optional[dict[str, Any]]) -> str:
    if gt_doc is None:
        return "MISSING"
    return str(gt_doc.get("provenance") or GT_PROVENANCE_UNVERIFIED)


def _constant_offset(gt_positions: list[dict], pred_positions: list[dict]) -> bool:
    """True when every matched prediction differs from GT by one identical pixel vector.

    Real detector output never does this; a constant offset means predictions
    were derived from ground truth rather than measured.
    """
    gt_index = {(p["frameIndex"], p["playerId"]): p["groundPx"] for p in gt_positions if p.get("groundPx")}
    deltas = set()
    for pred in pred_positions:
        gt_px = gt_index.get((pred.get("frameIndex"), pred.get("playerId")))
        if gt_px is None or not pred.get("groundPx"):
            continue
        deltas.add((round(pred["groundPx"]["x"] - gt_px["x"], 3), round(pred["groundPx"]["y"] - gt_px["y"], 3)))
        if len(deltas) > 1:
            return False
    return len(deltas) == 1 and len(gt_index) >= 3


def load_measured_predictions(predictions_dir: Path, clip: BenchmarkClipEntry) -> tuple[Optional[dict[str, Any]], Optional[str]]:
    """Return (predictions, None) or (None, reason) when the clip cannot be evaluated."""
    path = predictions_dir / f"{clip.id}.predictions.json"
    doc = _read_json(path)
    if doc is None:
        return None, f"No pipeline predictions file at {path.name}"
    if doc.get("clipId") != clip.id:
        return None, f"Predictions clipId '{doc.get('clipId')}' does not match '{clip.id}'"
    expected_sha = (clip.source_media_sha256 or "").lower().strip()
    actual_sha = str(doc.get("sourceMediaSha256") or "").lower().strip()
    if not expected_sha or actual_sha != expected_sha:
        return None, "Predictions sourceMediaSha256 does not match the manifest source media"
    if not isinstance(doc.get("pipeline"), dict):
        return None, "Predictions are missing pipeline provenance"
    return doc, None


def synthesize_selftest_predictions(gt: dict[str, Optional[dict[str, Any]]], clip: BenchmarkClipEntry) -> dict[str, Any]:
    """Derive predictions from ground truth for evaluator plumbing tests ONLY. Never evidence."""
    cuts = (gt["cuts"] or {}).get("cuts")
    calibration_frames = []
    cal = gt["calibration"]
    if cal and "cornersPx" in cal:
        for start, end in cal.get("validIntervals", [[0.0, clip.duration_sec or 10.0]]):
            mid = (start + end) / 2.0
            calibration_frames.append({
                "frameIndex": int(mid * 30),
                "timestampSec": round(mid, 3),
                "cameraSegmentId": "segment-1",
                "calibrationState": "CALIBRATED",
                "calibration": {
                    "cornersPx": [[pt[0] + 0.5, pt[1] - 0.5] for pt in cal["cornersPx"]],
                    "cornersCourtM": cal.get("cornersCourtM"),
                },
            })
    positions = [
        {
            **p,
            "groundPx": {"x": round(p["groundPx"]["x"] + 1.2, 1), "y": round(p["groundPx"]["y"] - 0.8, 1)},
            "courtPositionM": {"xM": round(p["courtPositionM"]["xM"] + 0.03, 2), "yM": round(p["courtPositionM"]["yM"] - 0.02, 2)},
        }
        for p in (gt["positions"] or {}).get("positions", [])
    ]
    tracks = [
        {**t, "bbox": [v + 1.0 for v in t.get("bbox", [0, 0, 10, 10])]}
        for t in (gt["identity"] or {}).get("tracks", [])
    ]
    return {
        "clipId": clip.id,
        "sourceMediaSha256": clip.source_media_sha256,
        "pipeline": {"kind": EVIDENCE_KIND_SELFTEST, "device": "none"},
        "cuts": [round(t + 0.02, 3) for t in cuts] if cuts is not None else None,
        "calibrationFrames": calibration_frames,
        "positions": positions,
        "tracks": tracks,
    }


def _not_run(reason: str) -> dict[str, Any]:
    return {"status": "NOT_RUN", "reason": reason, "overallPassed": False, "certificationPassed": False}


def run_benchmark(
    manifest_path: Path,
    output_dir: Path,
    predictions_dir: Optional[Path] = None,
    selftest_synthetic: bool = False,
    thresholds_path: Optional[Path] = None,
    target_split: Optional[str] = None,
) -> dict[str, Any]:
    if predictions_dir is not None and selftest_synthetic:
        raise ValueError("--predictions and --selftest-synthetic are mutually exclusive")

    start_time = time.time()
    if selftest_synthetic:
        evidence_kind = EVIDENCE_KIND_SELFTEST
    elif predictions_dir is not None:
        evidence_kind = EVIDENCE_KIND_MEASURED
    else:
        evidence_kind = EVIDENCE_KIND_NOT_RUN

    print("=" * 72)
    print("SportsScout Phase 3 Held-Out Evaluator Runner")
    print(f"Manifest: {manifest_path}")
    print(f"Evidence kind: {evidence_kind}")
    if selftest_synthetic:
        print("WARNING: synthetic self-test. Predictions are derived from ground truth. NOT A CERTIFICATION.")
    print("=" * 72)

    manifest_data = json.loads(manifest_path.read_text(encoding="utf-8"))
    manifest = BenchmarkManifest.from_dict(manifest_data)

    splits: dict[str, list[BenchmarkClipEntry]] = {}
    for clip in manifest.clips:
        splits.setdefault(clip.split or "unassigned", []).append(clip)
    is_leak_free, leak_errors = validate_split_leakage(splits)
    if not is_leak_free:
        raise ValueError(f"Split leakage validation failed: {leak_errors}")

    thresholds = load_thresholds(thresholds_path)
    dataset_root = manifest_path.parent
    clips_to_run = [c for c in manifest.clips if target_split is None or c.split == target_split]

    clip_reports: dict[str, Any] = {}
    covered_scenarios: set[str] = set()
    certification_blockers: list[str] = []
    holdout_clip_count = 0

    if evidence_kind == EVIDENCE_KIND_NOT_RUN:
        certification_blockers.append("No pipeline predictions supplied (--predictions); nothing was evaluated.")
    if evidence_kind == EVIDENCE_KIND_SELFTEST:
        certification_blockers.append("Synthetic self-test: predictions derived from ground truth cannot certify.")

    for clip in clips_to_run:
        is_holdout = clip.split == "holdout"
        holdout_clip_count += int(is_holdout)
        clip_dict = next((c for c in manifest_data["clips"] if c["id"] == clip.id), {})
        gt = load_ground_truth(dataset_root, clip_dict.get("groundTruth", {}))
        provenance = {stream: gt_provenance(doc) for stream, doc in gt.items()}

        if evidence_kind == EVIDENCE_KIND_NOT_RUN:
            clip_reports[clip.id] = {**_not_run("No pipeline predictions supplied"), "gtProvenance": provenance}
            continue

        if selftest_synthetic:
            predictions, reason = synthesize_selftest_predictions(gt, clip), None
        else:
            predictions, reason = load_measured_predictions(predictions_dir, clip)
            if predictions is not None and _constant_offset(
                (gt["positions"] or {}).get("positions", []), predictions.get("positions") or []
            ):
                predictions, reason = None, "Predictions differ from ground truth by one constant offset; rejected as GT-derived"

        if predictions is None:
            clip_reports[clip.id] = {**_not_run(reason or "Predictions unavailable"), "gtProvenance": provenance}
            if is_holdout:
                certification_blockers.append(f"Held-out clip '{clip.id}' NOT_RUN: {reason}")
            continue

        pipeline = predictions["pipeline"]
        report = evaluate_phase3_closeout(
            clip=clip,
            engine_version=str(pipeline.get("engineVersion") or "unknown"),
            detector_model=pipeline.get("detectorModel"),
            tracker_model=pipeline.get("trackerModel"),
            runtime=pipeline.get("runtime"),
            device=str(pipeline.get("device") or "unknown"),
            ground_truth_cuts=(gt["cuts"] or {}).get("cuts"),
            predicted_cuts=predictions.get("cuts"),
            ground_truth_calibration=gt["calibration"],
            predicted_calibration_frames=predictions.get("calibrationFrames") or [],
            ground_truth_positions=(gt["positions"] or {}).get("positions"),
            predicted_positions=predictions.get("positions") or [],
            ground_truth_tracks=(gt["identity"] or {}).get("tracks"),
            predicted_tracks=predictions.get("tracks") or [],
            thresholds=thresholds,
            evaluated_media_sha=predictions.get("sourceMediaSha256"),
            all_splits=splits,
            require_all_scenarios=False,
            require_independent_review=is_holdout,
            required_capabilities=REQUIRED_CAPABILITIES,
            experimental_capabilities=EXPERIMENTAL_CAPABILITIES,
        )
        clip_report = report.to_dict()
        clip_report["status"] = "EVALUATED"
        clip_report["gtProvenance"] = provenance
        clip_reports[clip.id] = clip_report

        if is_holdout:
            covered_scenarios.update(clip.scenario_buckets)
            if not report.certification_passed:
                certification_blockers.append(f"Held-out clip '{clip.id}' failed evaluator certification gates.")
            non_human = [s for s, p in provenance.items() if p != GT_PROVENANCE_HUMAN]
            if non_human:
                certification_blockers.append(
                    f"Held-out clip '{clip.id}' ground truth is not HUMAN_REVIEWED for streams: {non_human}"
                )

    if holdout_clip_count == 0:
        certification_blockers.append("No held-out clips were selected.")
    missing_buckets = [b for b in SCENARIO_BUCKETS if b not in covered_scenarios]
    if missing_buckets:
        certification_blockers.append(f"Mandatory scenario buckets not covered by evaluated held-out clips: {missing_buckets}")

    certification_valid = evidence_kind == EVIDENCE_KIND_MEASURED and not certification_blockers

    suite_summary = {
        "benchmarkSuite": "SportsScout Phase 3 Held-Out Benchmark",
        "evidenceKind": evidence_kind,
        "certificationValid": certification_valid,
        "overallHoldoutCertified": certification_valid,
        "certificationBlockers": certification_blockers,
        "evaluatedAt": datetime.now(timezone.utc).isoformat(),
        "elapsedSec": round(time.time() - start_time, 2),
        "runnerPerformsInference": False,
        "manifestId": manifest.manifest_id,
        "totalClips": len(clips_to_run),
        "splitBreakdown": {s: len(c) for s, c in splits.items()},
        "splitIsolationVerified": is_leak_free,
        "thresholds": thresholds.to_dict(),
        "mandatoryScenarioBucketsTotal": len(SCENARIO_BUCKETS),
        "mandatoryScenarioBucketsCovered": len(covered_scenarios),
        "missingScenarioBuckets": missing_buckets,
        "clips": clip_reports,
    }

    output_dir.mkdir(parents=True, exist_ok=True)
    report_file = output_dir / (SELFTEST_REPORT_FILENAME if selftest_synthetic else REPORT_FILENAME)
    report_file.write_text(json.dumps(suite_summary, indent=2), encoding="utf-8")
    print(f"Certification valid: {certification_valid}")
    for blocker in certification_blockers:
        print(f"  - {blocker}")
    print(f"[Saved] {report_file}")
    return suite_summary


def main(argv: Optional[list[str]] = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--manifest", type=Path, default=REPO_ROOT / "datasets/badminton/manifest.json")
    parser.add_argument("--output-dir", type=Path, default=REPO_ROOT / "benchmark_results")
    parser.add_argument("--predictions", type=Path, default=None, help="Directory of <clipId>.predictions.json from the real pipeline")
    parser.add_argument("--selftest-synthetic", action="store_true", help="Evaluator plumbing self-test; never certifies")
    parser.add_argument("--thresholds", type=Path, default=None, help="Owner-approved thresholds JSON (status APPROVED_FROZEN)")
    parser.add_argument("--split", type=str, default=None, help="Filter by split (e.g. holdout)")
    args = parser.parse_args(argv)

    result = run_benchmark(
        manifest_path=args.manifest,
        output_dir=args.output_dir,
        predictions_dir=args.predictions,
        selftest_synthetic=args.selftest_synthetic,
        thresholds_path=args.thresholds,
        target_split=args.split,
    )
    if args.selftest_synthetic:
        return 0
    return 0 if result["certificationValid"] else 1


if __name__ == "__main__":
    sys.exit(main())
