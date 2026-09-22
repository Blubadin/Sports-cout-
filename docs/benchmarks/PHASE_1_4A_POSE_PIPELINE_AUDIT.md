# Phase 1.4A — Current Pose Pipeline Audit and Benchmark Contract

## Scope and evidence

This is a local, Phase 1.4A audit. It documents the current ROI pose path and
defines the compatibility contract for a later pose-architecture benchmark. It
does not add a pose model, alter tracking/identity behaviour, or implement
full-frame pose inference.

Directly inspected implementation seams:

- `ai_service/analyzer_v2.py`
- `ai_service/pose_adapter.py`
- `ai_service/pose_detector.py`
- `ai_service/engine_config.py`
- `src/types.ts`
- `src/services/trackingSessionApi.ts`

## Current pipeline

```
person detector -> raw MOT track -> semantic P1/P2/P3/P4 assignment
    -> matched player bbox -> ROI pose -> players[].pose telemetry
```

`BadmintonAnalyzerV2.process_frame()` increments `analyzed_frame_count` once
for every frame passed to it. `poseStride` is clamped to at least one, and a
fresh pose pass is scheduled only where:

```
analyzed_frame_count % poseStride == 0
```

The session frame stride controls which source frames reach the analyzer; it
does not change this separate pose-stride rule.

On a scheduled pose frame, inference is called once for each player that has a
semantic match in `matched_players`. There is no single full-frame pose call.
Thus calls per analyzed frame are `0..N`, where `N` is the number of matched
semantic players (up to the configured player count). On non-scheduled frames,
an already cached pose is copied only for a currently matched player; it is
marked `isReused: true` and its `ageFrames` is incremented. A first
non-scheduled frame has no pose to reuse.

The ROI detector crops the matched source-frame bbox, runs the pose model on
that crop, maps its keypoints back to source-frame pixels, and then the
analyzer normalizes `x` and `y` to source-frame percentages. Each keypoint has
`x`, `y`, and the model-reported `score`. The detector currently takes the
first pose result inside an ROI; result ordering is therefore a pose-association
risk in overlapping ROIs, but is not used to decide P1/P2/P3/P4 identity.

### State and availability behaviour

| Semantic player state | Matched in current analysis frame | Pose action | Telemetry effect |
| --- | --- | --- | --- |
| observed | yes, scheduled pose frame | ROI inference | fresh pose if keypoints are returned (`isReused: false`, `ageFrames: 0`) |
| observed | yes, non-scheduled pose frame | no inference | cached pose only, marked reused and aged |
| predicted | no | no inference or reuse attachment | no new pose; tracking state remains predicted |
| lost | no for 15+ missed frames | no inference | cached pose is cleared; no pose is emitted |
| any | yes, but disabled/no keypoints | no usable result | `pose` is absent; no zero-filled keypoints or confidence are invented |

Disabled pose returns empty keypoints. A missing configured local model or a
runtime inference failure is explicit (`ModelNotFoundError` / `RuntimeError`),
not a silent synthetic pose. Current run provenance is supplied by
`get_provenance()` and includes `poseModel`, `poseFamily`, `poseStride`,
runtime, device, detector, tracker, and frame stride.

Pose happens after detector/tracker/semantic matching and after court and
movement state have been built. It does not feed the matcher, detection
confidence, coverage state, court position, or distance/speed calculation.

## Architectures to compare later

### Architecture A — existing baseline

```
Detector -> Tracker -> Semantic identity -> player ROI -> ROI pose
```

The semantic player and its bbox select the ROI before pose runs. It keeps
compute approximately proportional to matched athletes on scheduled frames.

### Architecture B — proposal only; not implemented in Phase 1.4A

```
Full-frame pose -> multiple person-pose detections -> associate to tracked athletes
    -> Semantic P1/P2/P3/P4 -> canonical pose telemetry
```

Architecture B must make association explicit (for example by spatial overlap
with the already tracked bbox), before writing telemetry. It must not derive a
semantic player ID from result-array position.

## Canonical pose contract

Both architectures must write the existing optional `players[].pose` shape:

```ts
{
  keypoints: Array<{ x: number; y: number; score: number }>;
  metrics?: PoseMetrics2D;
  isReused: boolean;
  ageFrames: number;
}
```

`x` and `y` are full-source-frame percentages, not ROI-relative coordinates;
`score` is the pose model score and is never substituted with detection
confidence. `isReused: false, ageFrames: 0` means a fresh inference result.
`isReused: true` means it is display/telemetry reuse and cannot be counted as
fresh pose. An unavailable pose is represented by absence of `pose`, not an
empty-looking successful sample.

For a future schema revision, provenance belongs at run/frame provenance scope,
not inside every keypoint:

```ts
poseModel: string | null;
poseArchitecture: 'roi-per-tracked-player' | 'full-frame-associated';
```

The current persisted provenance already has `poseModel`; it does **not** yet
persist `poseArchitecture`. Add that single optional provenance field together
with Architecture B/its benchmark writer, preserving old sessions where it is
unknown. No second pose telemetry schema is needed.

## Later benchmark metrics

Record these without allowing pose to change the tracking-quality denominator:

| Metric | Honest definition |
| --- | --- |
| `freshPoseCoverage` | fresh, non-reused pose player-frame opportunities divided by the configured semantic target player-frame opportunities; unknown denominator stays unavailable |
| `poseReusePercent` | reused pose samples divided by pose-present samples; unavailable if no pose-present samples |
| `poseUnavailablePercent` | target player-frame opportunities with absent pose divided by known target opportunities |
| `poseInferenceCalls` | counted calls to the pose adapter, not inferred from keypoint count |
| `poseInferenceTime` | measured wall-clock time around those calls, otherwise unavailable |
| `analysisFps`, `elapsedSeconds`, `processingRatio` | existing measured processing metrics, retained separately from pose cadence |
| `meanTargetCoverage`, `simultaneousTargetCoverage`, `identity continuity` | existing detector/tracker/semantic-identity metrics; report alongside pose metrics but never recompute them from pose availability |

## Correctness invariants

- Pose result ordering must not assign P1/P2/P3/P4.
- A predicted player remains predicted; pose cannot make it observed.
- Pose presence, reuse, or absence cannot change detection coverage, movement,
  speed, court position, or detection confidence.
- Reused pose stays explicitly reused and aged; it never becomes fresh data.
- Missing pose, missing scores, and missing timing remain unavailable rather
  than zero or a fabricated confidence.

## Risks to address in the later benchmark/implementation phase

- **Overlap and doubles:** a player ROI may contain both athletes; selecting
  the first pose result can attach the other athlete's skeleton to the correct
  semantic player.
- **Far court/small athletes:** ROI pose can return incomplete or low-quality
  keypoints. A missing pose must remain missing, not count as a zero-score pose.
- **Extra people:** officials, coaches, or spectators can enter a full-frame
  result set; Architecture B needs explicit tracker-to-pose association.
- **Pose reuse:** a cached pose may become visually stale between fresh passes;
  consumers must retain and display reuse/age provenance.
- **Compute scaling:** Architecture A scales with matched athletes; Architecture
  B scales with whole-frame pose workload and association. Compare measured
  inference calls/time and processing ratio on the same clips.
- **Model failures:** the current adapter fails explicitly for unavailable local
  models. A future benchmark must record this as unavailable/failed, not a
  successful zero-quality pose result.

## Test coverage status

Existing targeted tests verify pose-stride reuse (`isReused`, `ageFrames`),
canonical frontend provenance preservation, and the fact that fresh pose
coverage excludes reused samples. No behaviour changes were made in this audit,
so no production test was added. The later implementation should add tests for
predicted/lost pose absence, result-association under overlapping people, and
`poseArchitecture` provenance migration.
