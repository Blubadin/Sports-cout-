# Phase 3 evidence inventory and annotation plan

Updated 2026-10-05 (Asia/Bangkok). This is a **data and evidence preparation**
artifact. The companion [plan manifest](../../src/benchmarks/phase3AnnotationPlan.json)
is not a prediction file, GT file, or evaluator input. It adds no labels and
does not certify Phase 3.

## Evidence state

The latest open handoff is
[`PHASE-3-remaining-findings-handoff.md`](../PHASE-3-remaining-findings-handoff.md),
dated 2026-10-02. It reports no held-out per-scenario identity/shuttle
evaluation with independently reviewed GT, and calls the 10/30/60-minute runs
not validated. The 2026-10-01 Phase 3.4 analysis-job handoff also records the
old 10-minute attempt as interrupted. These remain open findings.

| Evidence class | Evidence found | What it supports |
| --- | --- | --- |
| Protocol/example fixtures | `visionBenchmarkManifest.json`, `shuttleBenchmarkManifest.json`, protocol docs, and the S01 sample labels | Schema and annotation examples only. The referenced B/S videos are absent locally. Vision B01–B05 have no split; shuttle S01/S02 are development, S03 is legacy `validation`, and S04/S05 are legacy `test`. S01 has 5 labels for a declared 15 s / 450-frame clip, no source binary/hash, and no reviewer identity. It is incomplete, not a reviewed real dataset. |
| Manually reviewed real GT | `reviewedRealShuttleGt.json`, frames 180–209 of `Asian Double Men 2026.mp4` | A 30-frame / 1-second development interval: 20 visible shuttle centroids and 10 `unknown`; no `absent` or `occluded` labels. Review before examining model output is documented, but reviewer identity and an independent second review are not. |
| Real model execution | RallyLens run on that exact source interval, CPU/FP32, checkpoint SHA `08b7e904dae4fd5250d51cd82c4d58d1663351f32037df6aed77547065f026a5`; 30 inference calls plus warm-up | Genuine model execution on real decoded frames. It remains a scoped development run; GPU and held-out execution are not validated. |
| Completed evaluation | Recorded 30 px shuttle match evaluation on those same 30 source frames: 20 TP, 0 FP, 0 FN among visible labels; 10 unknown frames unscored | A completed one-second result only. No reviewed absent/occluded frame or reacquisition event exists in that interval, so those behaviors are unmeasured. The 30 px value reproduces this result; it is not an approved Phase 3 acceptance threshold. |
| Real-model execution/recovery smoke | `docs/evidence/phase3-analysis-job-short-real.json`; two completed 5-second real-video jobs, YOLOv8n detector/pose, CPU reference profile, FP32, frame stride 2, pose stride 1, shuttle disabled | Short-run recovery/canonical parity smoke. No calibration GT, Phase 3 scenario GT, or checkpoint SHA is recorded there. It is not an accuracy evaluation. |
| Interrupted attempt | `docs/evidence/phase3-analysis-job-10min-attempt.json` | Explicitly `NOT VALIDATED`; interrupted before ten minutes of source completed. It is not a completed long-video run. Its `01 Badminton.mp4` is not one of the three currently inventoried files. |
| Completed held-out Phase 3 evaluation | None found | No current held-out bucket has qualifying GT and model output provenance. |

Do not automatically map legacy `validation` or `test` to the Phase 3 `holdout`
or `blind_test` splits. Confirm match/recording groups and split policy first.

The `groundTruthAvailable` and per-frame `reviewed` booleans are schema fields,
not provenance. They do not supply a media hash, complete frame coverage,
reviewer identity, independence record, or held-out split. The current one-second
GT is real and manually reviewed, but stays development-only and has limited
reviewer provenance. Do not widen its claim to a full match or multiple views.

## Verified source media

The files below are in the user-provided `C:\Users\sport\OneDrive\Documents\Vedio Bad`
folder. SHA-256 and stream metadata were checked with OpenCV; decoding the first
frame succeeded. The whole videos have **not** been visually screened for the
listed scenarios, so a present file is only a candidate until a reviewer records
an exact source interval.

| Media | SHA-256 | Duration / frames | Properties | Group and split |
| --- | --- | --- | --- | --- |
| `Asian Double Men 2026.mp4` | `84160d026a350716e227cb2f6f4c4c3d35cf52ab6aac6977d8e787b0299a6817` | 978.633333 s / 29,359 | 1280×720, 30 fps, H.264, 124,951,301 bytes | Hash-keyed recording group; **development**, because frames 180–209 are already development GT. |
| `Watanabe _ All England 2020.mp4` | `1ac8b3d811f5a5d42e419902b6ebbe2aab3fd8bb1b509cdb8b13da4308508074` | 811.166667 s / 24,335 | 1280×720, 30 fps, H.264, 123,251,424 bytes | Hash-keyed provisional group; split unassigned pending match/alternate-cut audit. |
| `Badminton test.mp4` | `e7c5581bdf88f622aff88901bab139133fea50f93c25c0a928056294a2bc9a4e` | 295.633333 s / 8,869 | 1280×720, 30 fps, H.264, 43,799,902 bytes | Hash-keyed provisional group; match identity and split unassigned. |

Hash-keyed groups prevent windows from a single source video leaking across
splits. Before assigning a held-out split, check whether files are alternate
cuts, replays, or recordings of the same match; merge related files into one
group and keep that group in one split. The Watanabe and `Badminton test` names
do not establish their relationship or split. Until this audit is recorded,
neither is held-out data.

## Scenario coverage and annotation work

`SCREENING_REQUIRED` means a real source file is present, but no verified
scenario interval or GT is recorded yet. `NO_QUALIFYING_GT` means no Phase 3
labels currently qualify for that bucket. Candidate media references resolve
through the manifest's `mediaInventory`; timestamps stay null until a human
screens the original video. No sample window or annotation is invented here.

| Phase 3 scenario | Current coverage | Annotation task / media |
| --- | --- | --- |
| Rear court | Partial, development shuttle GT only | `annotate-rear-court`: Asian source frames 180–209. Existing labels cover shuttle position only; any player/court labels require a separate review. |
| Rear-low | No qualifying GT | `annotate-rear-low`: screen Watanabe and Badminton test; split pending match-group audit. |
| Side / low angle | No qualifying GT | `annotate-side-low`: screen Watanabe and Badminton test; split pending match-group audit. |
| Camera cut | No qualifying GT | `annotate-camera-cut`: screen all three present sources; record both sides of every selected cut. |
| Pan / zoom | No qualifying GT | `annotate-pan-zoom`: screen all three sources and label source-frame motion interval. |
| Close-up | No qualifying GT | `annotate-close-up`: screen all three sources; record where player/court/shuttle visibility changes. |
| Replay | No qualifying GT | `annotate-replay`: screen all three sources; keep replay and live-play intervals explicit. |
| Return to court | No qualifying GT | `annotate-return-to-court`: screen all three sources; record transition and first confirmed live-court frame. |
| Spectators / officials | No qualifying GT | `annotate-spectator-official`: screen all three sources; annotate visible people separately from players. |
| Player outside court | No qualifying GT | `annotate-player-outside-court`: screen all three sources; retain image-space visibility and court location as separate labels. |
| Doubles crossing | No qualifying GT | `annotate-doubles-crossing`: screen all three sources; preserve stable human-reviewed player identity separately from MOT IDs. |
| Bright background | No qualifying GT | `annotate-bright-background`: screen all three sources; record the visual evidence and exact interval. Existing `crowd_background` tags do not establish this scenario. |
| Shuttle false positives | Prediction-seeded visual lead only | `annotate-shuttle-fp`: Asian frames 499–508; frames 507–508 were selected after model outputs and are a development-only lead. A separate reviewer must relabel the full interval with model output hidden. |
| Shuttle lost / reacquisition | No reviewed event GT | `annotate-lost-reacquisition`: screen all three sources; mark observed, lost, unknown, and first confirmed reacquisition frames from human review. |

All coverage-matrix entries currently have `heldOutReady: false`. The Asian
one-second labels can support only reproduction in their existing development
scope. The other sources have actual media references, but scenario membership
must be verified first. The repository's logical B/S clip references are
`MISSING_MEDIA` in the current local inventory; do not copy their tags onto the
user-provided videos without screening them.

### Reviewer checklist

1. Confirm source SHA-256, dimensions, FPS, frame count, and match/recording
   identity. Record an exact source-frame interval; do not use model output to
   create a label.
2. Have the primary reviewer inspect original decoded frames with predictions
   hidden. Record reviewer ID, method, date, blinding status, and any
   adjudication. Use a second independent reviewer for GT that will be described
   as independently reviewed.
3. Mark each target's visibility as exactly `visible`, `absent`, `occluded`, or
   `unknown`. `unknown` means unresolved and must never become `absent`.
   `visible` requires reviewed image coordinates; `unknown`, `absent`, and
   `occluded` carry no fabricated point. Record the evidence for each scenario
   and each cut/transition boundary.
4. Annotate every source frame in the selected interval for the required GT
   stream. Preserve separate labels for shuttle, player image boxes/identity,
   court calibration, camera transitions, and ground position; do not infer an
   unavailable stream from another one.
5. Keep model predictions in a separate artifact with model/config/checkpoint
   SHA, runtime, device, sampling, precision, thresholds, and source hash.
   Freeze GT before joining predictions. Never use a predicted track or
   prediction-seeded interval as its own independent GT.
6. Assign split by match/recording group before windowing. All adjacent frames,
   excerpts, replays, and alternate cuts from one group stay in one split. Keep
   unresolved relationships unassigned; do not move a group between development
   and held-out after seeing its predictions.
7. Keep Phase 3 visibility values distinct from the legacy shuttle schema's
   `not_visible`. Add a human-reviewed semantic mapping before conversion to
   Phase 3 `absent`; never map `unknown` to either term.

## Long-video source availability

| Requested duration | Verified continuous source available? | State |
| --- | --- | --- |
| 10 minutes | Yes: Asian source is 16:18.633; Watanabe source is 13:31.167 | Source available; no new 10-minute analysis run has been completed. The old attempt remains interrupted. |
| 30 minutes | No single source found | `MISSING_MEDIA`: obtain one continuous source at least 30 minutes long. |
| 60 minutes | No single source found | `MISSING_MEDIA`: obtain one continuous source at least 60 minutes long. |

No loop, duplicated segment, or concatenated short clip counts as the requested
long source.

## Thresholds and evaluator preparation

`Phase3QualityThresholds` has executable defaults in
`ai_service/benchmark_schema.py` (12 px reprojection, 0.35 m court position,
0.90 cut F1, 0.50 s cut latency, 1.00 s relock latency, zero false-valid
calibrations, 2 ID switches/10 min, 0.85 shuttle precision/recall, 1.50 s
reacquisition). No approval/freezing record was found in the current Phase 3
handoff or benchmark documentation. The plan records status **UNSET**; code
defaults must not be reported as approved thresholds. Do not claim pass/fail
until the owner freezes the values. The existing 30 px shuttle matching
tolerance belongs only to reproducing the documented one-second result.

There are two evaluator limits to carry into the next handoff. First,
`evaluate_phase3_benchmark` accepts cut, calibration, ground-position, and
identity inputs, but no shuttle GT/prediction inputs. It hardcodes shuttle
precision, recall, and reacquisition duration to `null`; the
`shuttle_false_positives` bucket has no metric branch, and `lost_reacquisition`
is treated as an identity-switch bucket only. Its `overallPassed` result cannot
certify shuttle quality. Use the separate shuttle harness for shuttle metrics
and compare those results externally with approved thresholds.

Second, the Phase 3 API's annotation gate trusts clip-level GT booleans and
reuses that single result across scenario buckets. It cannot validate reviewer,
media hash, or per-bucket/per-stream GT provenance. A true flag alone can make
an unsupported bucket look passed. Run an external provenance and scenario
coverage preflight before calling it; do not pass this annotation-plan manifest
as evaluator input.

`evaluate_phase3_benchmark` is a Python API, not a CLI. Once there is a reviewed
held-out annotation/prediction bundle and approved thresholds, the existing
harness can be called from PowerShell like this (the input file does not exist
yet; this is a prepared invocation, not a claimed run):

```powershell
@'
import json
import math
import re
from ai_service.benchmark_schema import BenchmarkClipEntry, Phase3QualityThresholds
from ai_service.phase3_benchmark import evaluate_phase3_benchmark

with open("docs/evidence/phase3-eval-input.json", encoding="utf-8") as f:
    p = json.load(f)
if p.get("thresholdStatus") != "APPROVED_FROZEN":
    raise SystemExit("Phase 3 thresholds are not approved and frozen")
gt = p.get("gtProvenance", {})
if gt.get("qualification") != "INDEPENDENT_HUMAN_REVIEWED_REAL_GT":
    raise SystemExit("GT provenance has not qualified for independent held-out evaluation")
source_hash = gt.get("sourceMediaSha256")
clip_hash = p.get("clipSourceSha256")
if not isinstance(source_hash, str) or not re.fullmatch(r"[0-9a-f]{64}", source_hash) or source_hash != clip_hash:
    raise SystemExit("GT media hash does not match the evaluated source")
if not all(gt.get(key) for key in ("reviewerId", "independentReviewerId", "reviewMethod", "reviewedAt")):
    raise SystemExit("Reviewer identity, method, and review time are required")
if gt["reviewerId"] == gt["independentReviewerId"]:
    raise SystemExit("Independent reviewer must be a distinct person")
if gt.get("independentReviewStatus") != "PASSED" or gt.get("predictionBlindingStatus") != "BLINDED":
    raise SystemExit("Independent human review and prediction blinding are required")
clip_data = p["clip"]
if clip_data.get("split") not in {"holdout", "blind_test"}:
    raise SystemExit("This invocation requires a held-out split")
if not clip_data.get("recordingGroup"):
    raise SystemExit("An explicit match/recording group is required")
required_pairs = set(p.get("requiredScenarioMetricPairs", []))
qualified_pairs = set(p.get("qualifiedScenarioMetricPairs", []))
if any(not isinstance(pair, str) or pair.count(":") != 1 or not all(pair.split(":")) for pair in required_pairs | qualified_pairs):
    raise SystemExit("Scenario/metric pairs must use non-empty scenario:metric strings")
unsupported_buckets = {"shuttle_false_positives", "lost_reacquisition"}
scenarios = set(clip_data.get("scenarioBuckets", []))
if not scenarios or scenarios & unsupported_buckets:
    raise SystemExit("phase3_benchmark does not score shuttle false positives or reacquisition")
streams_by_scenario = {
    "camera_cut": {"camera_cuts"}, "replay": {"camera_cuts"},
    "pan_zoom": {"camera_cuts"}, "close_up": {"camera_cuts"},
    "return_to_court": {"camera_cuts"},
    "rear_court": {"calibration", "ground_position"},
    "rear_low": {"calibration", "ground_position"},
    "side_low_angle": {"calibration", "ground_position"},
    "bright_lights_background": {"calibration", "ground_position"},
    "doubles_crossing": {"player_identity"},
    "spectator_official": {"player_identity"},
    "player_outside_court": {"player_identity"},
}
if not scenarios <= set(streams_by_scenario):
    raise SystemExit("Every scenario must use a metric stream supported by this harness")
expected_pairs = {
    f"{scenario}:{stream}"
    for scenario in scenarios
    for stream in streams_by_scenario[scenario]
}
if required_pairs != expected_pairs or not expected_pairs <= qualified_pairs:
    raise SystemExit("Every required scenario/metric pair needs qualified reviewed GT")
clip = BenchmarkClipEntry.from_dict(clip_data)
threshold_values = p["thresholds"]
required = {
    "max_reprojection_error_px", "max_court_position_error_m", "min_camera_cut_f1",
    "max_camera_cut_latency_sec", "max_relock_latency_sec",
    "max_false_valid_calibration_count", "max_id_switches_per_10_min",
    "min_shuttle_precision", "min_shuttle_recall", "max_reacquisition_duration_sec",
}
if set(threshold_values) != required:
    raise SystemExit("All ten frozen Phase 3 threshold values are required")
if any(type(v) not in (int, float) or not math.isfinite(v) for v in threshold_values.values()):
    raise SystemExit("Thresholds must all be finite numbers")
if type(threshold_values["max_false_valid_calibration_count"]) is not int:
    raise SystemExit("max_false_valid_calibration_count must be an integer")
thresholds = Phase3QualityThresholds(**threshold_values)
report = evaluate_phase3_benchmark(clip, thresholds=thresholds, **p["inputs"])
result = report.to_dict()
expected_thresholds = {
    "maxReprojectionErrorPx": threshold_values["max_reprojection_error_px"],
    "maxCourtPositionErrorM": threshold_values["max_court_position_error_m"],
    "minCameraCutF1": threshold_values["min_camera_cut_f1"],
    "maxCameraCutLatencySec": threshold_values["max_camera_cut_latency_sec"],
    "maxRelockLatencySec": threshold_values["max_relock_latency_sec"],
    "maxFalseValidCalibrationCount": threshold_values["max_false_valid_calibration_count"],
    "maxIdSwitchesPer10Min": threshold_values["max_id_switches_per_10_min"],
    "minShuttlePrecision": threshold_values["min_shuttle_precision"],
    "minShuttleRecall": threshold_values["min_shuttle_recall"],
    "maxReacquisitionDurationSec": threshold_values["max_reacquisition_duration_sec"],
}
if result["thresholds"] != expected_thresholds:
    raise SystemExit("Evaluator threshold round-trip differs from the frozen record")
print(json.dumps(result, indent=2, allow_nan=False))
'@ | python -
```

`phase3-eval-input.json` must supply a manifest clip with explicit split and
recording group; a `gtProvenance` record with matching source SHA, primary and
independent reviewer IDs, review method/time, passed independent review, and
prediction blinding; and exact
required/qualified `scenario:metric` pairs (for example,
`camera_cut:camera_cuts`);
all ten finite threshold values using the dataclass's snake_case field names;
distinct human GT and real model prediction arrays for each measured stream;
and model/config/checkpoint SHA, runtime, device, and source provenance. The
snippet constructs the threshold dataclass directly because
`Phase3QualityThresholds.from_dict` fills missing/falsy values with defaults and
can turn an explicit zero ID-switch limit into `2.0`. Review the report's `provenance`,
`cameraCuts`, `calibration`, `groundPosition`, `identity`, `byScenario`,
`annotationManifestBlockers`, `thresholds`, and `overallPassed`. `overallPassed`
only describes the implemented streams and cannot certify shuttle FP/recall or
shuttle reacquisition. It is not an authorized acceptance claim while
thresholds are UNSET.

For the existing shuttle harness, once a real prediction JSON exists with a
`clip_id` key mapped to that clip's real model observations, the programmatic
runner is:

```powershell
python -c "import json; from ai_service.shuttle_benchmark import run_benchmark_on_manifest; p=json.load(open('docs/evidence/phase3-shuttle-predictions.json', encoding='utf-8')); r=run_benchmark_on_manifest('src/benchmarks/reviewedRealShuttleGt.json', predictions_by_clip=p); print(json.dumps(r, indent=2, allow_nan=False))"
```

The prediction file must use the harness's `ShuttleObservation`/observation
dictionary fields, keyed by clip ID and aligned to original clip-local frame
indices. It needs complete independently reviewed labels for that exact clip.
Preserve its `status`, `metrics`, and `report`, plus an external run record
with source SHA, model/checkpoint SHA, configuration, device/runtime, and GT
review provenance. The harness reports metrics but does not certify Phase 3
thresholds; compare against an approved threshold record externally. Do not
invoke the CLI without predictions and treat empty-output metrics as a model
run. The checked-in one-second file is development evidence, not held-out
input.

## Readiness decision

Coverage gaps and real source references are now enumerated, but **no
held-out Phase 3 evaluation is ready to score yet**. Required next work is
scenario screening, independent human annotation with reviewer provenance,
match/recording group resolution, an approved frozen threshold record, and a
separately saved real-model prediction artifact. The 10-minute duration
availability supports planning a future source run; 30- and 60-minute media
remain missing.
