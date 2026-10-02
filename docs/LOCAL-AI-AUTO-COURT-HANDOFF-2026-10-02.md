# Local AI repair handoff — 2026-10-02

Branch: `feat/phase-three-camera-cut`.
Baseline: `9040a2b42626303bbc42c4633b90068087f81221`; initially clean working tree.
Scope: user-authorized Localhost Auto Court/shuttle repair, followed by the two
missing-weights CI test corrections. This is not a Phase 3 closeout.

## Changes and boundaries

- Lab now sends the existing `autoCourtCalibrationEnabled` configuration. Auto
  starts uploaded video without submitting manual/fabricated corners. Manual
  startup still requires four corners. Existing prepared/resumable jobs keep
  their configuration and can resume without asking for fresh initial corners.
- Backend allows Auto startup from `VIDEO_READY` only when the existing automatic
  calibration provider is configured. It does not mark calibration valid at
  startup or open metric gates early.
- Court outline uses fresh canonical calibration geometry with matching segment
  and calibration identities; lost/stale/invalid/out-of-frame geometry is hidden.
  Manual selection remains available for recovery.
- Local launcher recognizes the existing audited `.local-models` artifact only
  when provider/path are otherwise unset. Explicit settings reuse the existing
  environment contract. It reports missing/readiness failures and does not
  download weights. Logs moved to ignored `.local-services` because active log
  handles under Playwright's `test-results` directory blocked output cleanup.
- No detector/pose/shuttle model family, precision, thresholds, production
  dependencies, or runtime vendor changed. The existing nine-frame adapter's
  required frame stride remains explicitly advertised in the Lab.

## Local artifact and real execution

The existing artifact was recovered from the `phase-0-4-overlay-timing` worktree
(artifact committed at `f46f8be` on that branch), without changing branches or
committing the binary to this branch. SHA-256 verified:
`08b7e904dae4fd5250d51cd82c4d58d1663351f32037df6aed77547065f026a5`.

Opt-in real execution used
`C:/Users/Sport-Science-R3909/Desktop/AI/Vedio Bad/Badminton test.mp4`.
The real uploaded ten-frame smoke now exercises Auto startup directly. It passed
with real CPU detector/pose/shuttle execution, 8 temporal warm-up frames,
2 model inference calls, 2 observed candidates, no synthetic telemetry and
output shape `[1,8,288,512]`. This proves execution, not independently measured
court or shuttle accuracy. Evidence:
`.local-services/autocourt-real-model.log` and
`.local-services/auto-court-real-model-report.json`.

## Checks actually run

| Command/evidence | Result |
| --- | --- |
| `npm run typecheck` | PASS; final log `.local-services/autocourt-typescript.log` |
| `npm run lint` | PASS, but this repo script is TypeScript, not ESLint |
| `npm ls eslint --depth=0` | Empty/exit 1; ESLint not installed, not validated |
| `npm test -- --reporter=dot` | 105 files, 990 tests passed |
| Final Lab Vitest after defensive geometry guard | 13 passed |
| `python -m unittest discover -s ai_service/tests -p 'test_*.py' -q` | 628 run, 625 passed, 3 skipped; 81.488s |
| Opt-in `python -m unittest ai_service.tests.test_rallylens_model -q` with supplied local model/video env | 9 passed, 57.495s |
| Playwright Auto Court + shuttle provenance + overlay segment + completion recovery + storage delete + paged consumers (`--workers=1 --output=.local-services/playwright`) | 21 passed; 1.3m |
| Native UI Auto Court TH/EN, Space key, reduced motion, rapid double click | Passed; one job/start, no manual calibration request |
| Missing-weight reproduction before corrections | One ModelNotFoundError and one availability assertion failure |
| Missing-weight reproduction after corrections | 2 passed |
| Detector candidate + dynamic calibration focused Python | 27 passed |
| Full suite with developer/cached weight files hidden by filesystem fault injection | 628 run, 624 passed, 4 skipped; 62.386s; simulation, not fresh GitHub runner |
| Repeated cancel/restart/resume test, 5 independent executions | 5 passed; 55.678s, original assertions/deadlines unchanged |
| Launcher against configured service | Real capability probe AVAILABLE, RallyLens window 9 / required stride 1 |
| Launcher with missing explicit model path | Exit 1 before launching services |
| `git diff --check` | PASS |

Logs and temporary evaluation artifacts live in ignored `.local-services`.
Browser screenshots there are fixture UI evidence, not model accuracy evidence.
Initial red tests caught absent Auto UI/config propagation and backend 409 on
Auto startup; their fixes passed without fabricated calibration.

## CI corrections and remaining evidence gaps

The calibration lifecycle unit test now disconnects detector execution explicitly,
retaining segment/calibration assertions. Candidate availability uses isolated
workspace/home presence fixtures plus empty-store and cached-candidate cases;
it no longer assumes a baseline artifact exists on CI. Empty marker files verify
presence reporting only, not model loadability. Production availability semantics
and missing-model errors remain unchanged.

The user's attached CI log ends in KeyboardInterrupt/cancellation during
`test_repeated_cancel_restart_resume_is_idempotent`; it does not itself show the
two missing-weight failures. Both weight-dependent failures were reproduced
locally independently. Five repeated recovery runs passed locally. A diagnostic
snapshot during the stress check caught model hashing, not a proven deadlock;
this does not establish the cause of the cancelled hosted job. Hosted CI rerun
is still NOT VALIDATED; no push or remote job execution was performed.

The user's in-app browser control timed out, so its source video was not
automatically reconnected or a full analysis launched. Use localhost Lab:
reconnect the real source file, enable Automatic Court and Shuttle Tracking,
start analysis, and choose Shuttle Point/Trail for display (inference and display
remain distinct). Existing in-memory browser inputs/project data were preserved.

Held-out per-scenario quality, full court accuracy, 10/30/60-minute runs and real
GPU/vendor validation remain NOT VALIDATED by this task. Do not declare Phase 3
complete from the fixtures or ten-frame real smoke.
