# Phase 2.9C Shuttle Runtime Diagnostics Design

## Scope

Make the existing local shuttle runtime observable without changing model
contracts, detection thresholds, authentication, shot recognition, or player
tracking. The normal coach interface stays compact; detailed diagnostics live in
the existing Advanced section.

## Backend contract

`ProductionShuttlePipeline.get_provenance()` remains the canonical runtime
diagnostic source. It exposes:

- `enabled`, `active`, `status`, `model`, `provider`, `runtime`, `precision`,
  `device`, and `lastFailure`;
- measured tracker counters `framesReceived`, `validFrames`, `inferenceCalls`,
  `meanInferenceMs`, `observedCount`, `predictedCount`, `lostCount`, and
  `unknownCount`;
- `null`, never a fabricated zero, when a counter is unavailable because no
  temporal tracker exists or the requested metric has not been measured.

The temporal tracker owns frame/inference timing counters. The production
pipeline owns canonical observation-state counters because it sees the final
observation after optional recovery. Warm-up frames count as `unknown`; missing
candidates after a prior observation count as `lost`. Prediction is counted only
when the final canonical state is explicitly `predicted`.

Disabled and failed pipeline instances expose identity/configuration fields but
all measured counters as `null`. An active tracker legitimately reports zero
for a measured count before or after processing frames.

## Status semantics

Backend status and safe failure fields support these distinct UI outcomes:

1. `DISABLED`: Tracking disabled.
2. `MODEL_UNAVAILABLE` with no model: No model configured.
3. `MODEL_UNAVAILABLE` or `INITIALIZATION_ERROR` with a configured model: Model
   failed to load.
4. `RUNTIME_UNAVAILABLE`: Runtime unavailable.
5. `AVAILABLE`, active, inference calls greater than zero, observed count zero:
   Model active but no shuttle candidates.
6. `AVAILABLE`, active, observed count greater than zero: Model active and
   shuttle observed.

Before any inference, an available active model is shown as active/ready rather
than falsely claiming either successful observation or no candidates.

## Tracking Lab

The existing Shuttle Tracking Engine row keeps one compact status badge and a
short status explanation. The expanded Advanced section shows a small diagnostic
grid for model filename, provider, runtime/precision/device, received/valid
frames, inference calls, mean inference time, four observation-state counts and
last failure. Every unavailable value renders as an em dash, preserving the
backend distinction between `null` and measured zero.

The status mapper is a pure exported function so all required states have
deterministic unit tests. The API TypeScript types explicitly represent nullable
counters.

## Overlay integrity

Shuttle Point mode renders a current dot only for a fresh canonical
`state="observed"` observation with finite coordinates. It never renders a
predicted, interpolated, lost, or unknown current dot. Trail/debug history is
built only from valid observed observations. A lost sample at the current time
suppresses any stale prior point.

## Real-video smoke test

Use a short decoded segment from
`C:\Users\Sport-Science-R3909\Desktop\AI\Vedio Bad\Badminton test.mp4` with the
already audited local RallyLens temporal checkpoint. The smoke test runs through
the production pipeline and records source dimensions, FPS, analyzed frames,
inference calls, observed/lost/unknown counts and observed confidence summary
(count/min/median/max when available; otherwise `null`). It does not download
assets, commit video/model files, fabricate detections, or make an accuracy claim.

The report states the actual selected segment and whether it produced candidates.
All temporary clips and uploaded session-owned files are deleted.

## Tests and validation

Test-first coverage includes:

- backend measured counters and nullable unavailable counters;
- active model with zero candidates and active model with observations;
- disabled, no-model, load-failure and runtime-unavailable status mapping;
- Advanced diagnostics rendering zero versus em dash correctly;
- Point overlay renders observed only and a lost sample hides the current point;
- real-artifact smoke test with the selected badminton segment;
- full Python unittest discovery, TypeScript checking and Vitest regression runs.

ESLint is attempted and reported truthfully; the repository currently has no
`eslint.config.*`, so this phase does not expand scope by inventing a new lint
configuration.
