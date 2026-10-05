# Phase 3 remaining findings: R01 / R03 / R05

Date: 2026-10-02 (Asia/Bangkok). Branch: `feat/phase-three-camera-cut`.
Baseline: `7cd3d86336f762104faafd1a81768fd3bf493234` (clean worktree).
Scope: these three findings and their regression coverage. Await independent
re-review; this is not a Phase 3 closeout or a real-data quality certification.

## R01: initial identity seeding versus reacquisition

Initial automatic seeding remains available for an empty initial session. A cut
marks every sports profile as requiring reacquisition, including never-observed
slots. Raw MOT detections and fresh poses continue in `rawPlayerDetections`.
Calibration recovery does not prove a person's identity.

After a cut, matching requires retained HSV appearance distance <= 0.20 or
ReID similarity >= 0.75, with a 0.10 margin over competing profiles for that
signal. Ambiguous or contradictory ReID evidence prevents promotion. Three
consecutive eligible frames with distinctive evidence and the same raw MOT ID
are required. Missing detections, failed evidence or a changed MOT ID restart
confirmation. Spatial proximity and expected player counts cannot seed a
profile again. Appearance updates occur only after confirmation.

These are explicit conservative association rules, not measured held-out
identity accuracy. People with indistinguishable evidence remain unresolved;
appearance resemblance is not athlete registration identity. Thresholds were
chosen before these regressions, not adjusted to a held-out outcome.

The checkpoint retains `needsReacquisition` and appearance, but not MOT IDs,
positions or pending confirmation counts. An older checkpoint in a later
camera segment also requires reacquisition. Restored appearance without spatial
continuity requires fresh confirmation. Resume remains warm-up based, not exact
temporal restoration; aggregate and committed-boundary handling are unchanged.

## R03: measured scene evidence in the existing shuttle seam

The analyzer passes the same `SceneEvidence.to_dict()` recorded on the frame
through `ProductionShuttlePipeline` and recovery to the temporal tracker.
`is_pan_tilt_zoom` removes local pixel-motion and image-trajectory bonuses when
camera motion makes them unreliable. Appearance and persistence continue to
participate. Scene labels, absent court visibility and calibration do not
disable this detector. No model, confidence threshold, precision, sampling or
provider selection was changed.

Per-frame `evidenceFusion` records appearance confidence, motion reliability,
fused score and whether scene context was supplied. It describes temporal
candidate evidence, including a rejected candidate; it does not convert that
candidate into an observed recovery output. Existing static persistence decay
and the short stationary allowance remain active.

## R05 contract decision: observation versus lifecycle

The requested five-state vocabulary mixes measurement state (`OBSERVED`,
`PREDICTED`, `LOST`, `UNKNOWN`) with model initialization (`WARMING_UP`). The
existing canonical measurement contract additionally includes `interpolated`,
and the existing recovery lifecycle already includes `WEAK` and `REACQUIRING`.
This patch uses the user's allowed split rather than replacing those contracts:

- `state` remains the canonical measurement state. Predictions/interpolations
  never become observations; missing coordinates stay null.
- `trackingState` is the existing lifecycle enum captured **on every production
  observation at emission**, not read from a later runtime snapshot.
- `warmupRemainingFrames` counts additional decoded inputs needed by the
  temporal model. Zero means temporal input readiness, not confirmed tracking.
- `validity: { positionValid, reason }` describes this frame's image position.
  It does not certify homography, ground landing or a 3D measurement.

| Lifecycle / measurement | Validity and transition |
| --- | --- |
| WARMING_UP / unknown (or lost after interrupted continuity) | null position, false validity, `warming_up`; incomplete temporal input |
| REACQUIRING / unknown or lost | null position, false validity, `no_reliable_position`; await recovery confirmation |
| TRACKING / observed | fresh position, true validity, `observed_measurement` |
| WEAK / predicted | bounded estimate, true validity, `predicted_estimate`; not a fresh measurement |
| WEAK or LOST / lost, LOST / unknown | null position, false validity, `no_reliable_position` |
| LOST after recoverable inference error | null position, false validity, `inference_failure` |
| interpolated (existing derived stream) | explicit derived position, `interpolated_estimate`; never an observed measurement |

A fresh auxiliary detection may be confirmed while the temporal model still
has missing inputs: lifecycle is TRACKING, source is `auxiliary_detector`, and
`warmupRemainingFrames` remains positive. WARMING_UP itself cannot claim a valid
position. Python and TS validation enforce these distinctions. Legacy rows
without these additive fields remain readable; absence means metadata unknown,
not zero remaining frames or a inferred lifecycle.

Lifecycle, validity and fusion fields survive Python serialization, backend
chunk/journal restart and the results API, the TS normalizer, observation builder,
native IndexedDB raw pages, reload and canonical
JSON serialization. Existing player-only sample/dataset exports do not carry a
shuttle stream; this patch does not introduce a new dataset export feature.

## Verification and evidence boundaries

Environment: Windows, Python 3.11.15, Node v26.4.0, installed repository
dependencies and Playwright Chromium. The package requests Node 22.x; these
checks do not certify a separate Node 22 run. The new regressions use isolated
deterministic providers and synthetic image fixtures;
browser persistence uses Playwright's isolated native Chromium IndexedDB.
They are fixture/contract/integration evidence, not independent model GT.

| Command | Result / evidence level |
| --- | --- |
| `npm run typecheck` | Exit 0; TypeScript |
| `npm run lint` | Exit 0; TypeScript alias only |
| `npm run test` | Exit 0; 105 files, 987 Vitest tests passed |
| `python -m unittest discover -s ai_service/tests` | Final isolated run exit 0; 624 executed, 621 passed, 3 skipped; 41.696s |
| `python -m unittest discover -s ai_service/tests -p test_remaining_tracking_findings.py` | Exit 0; 10 focused regressions passed |
| `python -m unittest discover -s ai_service/tests -p test_analysis_job_calibration_checkpoint.py` | Exit 0; 6 checkpoint/API regressions passed |
| `npx playwright test e2e/tracking-shuttle-provenance.spec.ts e2e/tracking-overlay-segment.spec.ts e2e/tracking-completion-recovery.spec.ts e2e/tracking-storage-delete.spec.ts e2e/tracking-paged-consumers.spec.ts` | Exit 0; 19 native Chromium tests passed |
| `git diff --check` | Exit 0 |
| `npm ls eslint --depth=0` | Exit 1; empty, ESLint unavailable |

The initial concurrent full-suite run had one 8-second wait timeout in
`test_repeated_cancel_restart_resume_is_idempotent` (102.918s total); the same
unmodified test passed when Python ran separately (623-test run, then final
624-test run after adding backend warm-up coverage). This is consistent with
resource contention; keep the timeout observation visible, and avoid claiming
the concurrent run passed. No assertions or timeouts were relaxed.

Focused regressions failed before the fixes: initial seeding after cut, missing
scene seam/consumption, missing per-frame lifecycle, contradictory ReID and
invalid warm-up position acceptance. Existing recovery tests now include genuine
returning-shirt and visible court-edge fixtures and assert an unresolved interval
before confirmation, retaining their no-distance-bridge and calibration checks.

| Finding | Fixture verification | Locations |
| --- | --- | --- |
| R01 | PASS; new person unresolved for 12 frames, distinct returning appearance requires 3 eligible frames, ambiguity/conflicting ReID/missing frames, checkpoint gate retained | `semantic_identity.py`, `analyzer_v2.py`, `server.py`; `test_remaining_tracking_findings.py`, `test_analysis_job_calibration_checkpoint.py`, camera-cut/scene/ReID suites |
| R03 | PASS; recorded scene evidence reaches existing seam, camera motion changes fusion, labels do not stop inference, static-only suppression and short stationary allowance retained | `shuttle_tracker.py`, `shuttle_reacquisition.py`, `shuttle_pipeline.py`; focused and existing shuttle integration suites |
| R05 | PASS; per-frame readiness/validity, invalid combination rejection, backend/API round trip and native browser persistence/reload/JSON | `shuttle_telemetry.py`, `src/types/shuttleTelemetry.ts`, `trackingSessionApi.ts`; checkpoint API, TS contract and `tracking-shuttle-provenance.spec.ts` |

- Held-out per-scenario identity/shuttle precision, recall and reacquisition:
  **NOT VALIDATED**. The checked-in manifests lack sufficient independently
  reviewed held-out GT coverage. Freeze and review GT before evaluation.
- 10-minute real-video recovery/output parity: **NOT VALIDATED**. Existing
  `docs/evidence/phase3-analysis-job-10min-attempt.json` is an interrupted
  attempt, not a completed 10-minute comparison. Suitable local media exists;
  an extended CPU run and resume/parity evaluation are still required.
- 30- and 60-minute real-video results: **NOT VALIDATED**. No completed evidence
  was produced in this scoped correction task; verify suitable source durations
  and run the long-video evaluation separately.
- Real GPU/vendor hardware validation: **NOT VALIDATED**, outside this patch.
- ESLint: repo `lint` is `tsc --noEmit`, and ESLint/config are not installed.
  Report that tooling gap explicitly; do not count the alias as an ESLint pass.

The fixture fixes do not clear these Phase 3 evidence gates or authorize Phase 4.
