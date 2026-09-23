# Shuttle Runtime Diagnostics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose truthful shuttle runtime measurements, show compact Advanced diagnostics, enforce observed-only point overlays, and record a real badminton-video smoke test.

**Architecture:** `ProductionShuttlePipeline` aggregates the final canonical observation states while `TemporalShuttleTracker` remains authoritative for frame and inference timing. The REST provenance object transports nullable metrics to a pure frontend status mapper and a compact Advanced diagnostic grid. Existing overlay resolution is tightened at the rendering boundary so non-observed states never produce a current point.

**Tech Stack:** Python 3.11, FastAPI, NumPy/OpenCV/PyTorch, unittest, React 19, TypeScript 5.8, Vitest/Testing Library.

## Global Constraints

- Unavailable counters are `null`; measured zero remains `0`.
- Do not alter model preprocessing, thresholds, player tracking, authentication, or shot recognition.
- Do not claim accuracy without ground truth.
- Do not commit model/video artifacts.
- Finish with commit `feat(shuttle): expose runtime diagnostics`.

---

### Task 1: Backend measured diagnostic contract

**Files:**
- Modify: `ai_service/shuttle_pipeline.py`
- Test: `ai_service/tests/test_shuttle_runtime_diagnostics.py`

**Interfaces:**
- Consumes: `TemporalShuttleTracker.metrics() -> ShuttleTrackerMetrics` and final `ShuttleObservation.state`.
- Produces: `ProductionShuttlePipeline.get_provenance() -> dict` with nullable `framesReceived`, `validFrames`, `inferenceCalls`, `meanInferenceMs`, `observedCount`, `predictedCount`, `lostCount`, `unknownCount`, and `lastFailure`.

- [ ] **Step 1: Write failing backend tests**

Create deterministic provider tests asserting a disabled/missing-model pipeline returns `None` for every measured counter, an active zero-frame pipeline returns measured zero counts and `meanInferenceMs=None`, an empty heatmap increments inference/unknown and reports `NO SHUTTLE CANDIDATE`, and a valid heatmap increments observed.

- [ ] **Step 2: Verify RED**

Run: `python -m unittest ai_service.tests.test_shuttle_runtime_diagnostics -q`

Expected: failures because state counters are absent and unavailable inference is currently reported as zero.

- [ ] **Step 3: Implement the smallest aggregation**

Initialize final state counts only when a tracker exists, add one private observation-recording method, use it for normal and inference-failure observations, and return tracker metrics only when measured. Resolve `lastFailure` from pipeline failure first, then temporal tracker state.

- [ ] **Step 4: Verify GREEN**

Run the same unittest command and expect all tests to pass.

### Task 2: Explicit frontend status and Advanced diagnostics

**Files:**
- Modify: `src/types.ts`
- Modify: `src/components/labs/BadmintonTrackingLab.tsx`
- Test: `src/__tests__/badminton/shuttleRuntimeDiagnostics.test.tsx`

**Interfaces:**
- Consumes: nullable runtime fields in `ShuttleProvenance`.
- Produces: `deriveShuttleEngineStatus(...)` returning `status`, `displayText`, `detailText`, and `badgeClass`; Advanced UI test ids `shuttle-runtime-diagnostics` and metric-specific terms.

- [ ] **Step 1: Write failing status/rendering tests**

Cover disabled, missing model path, configured model load failure, runtime unavailable, active before inference, active with zero observed candidates, and active with observations. Render the Advanced section and assert `null` is an em dash while measured zero is `0`.

- [ ] **Step 2: Verify RED**

Run: `npm test -- --run src/__tests__/badminton/shuttleRuntimeDiagnostics.test.tsx`

Expected: failures for missing detail text, missing diagnostic grid, and missing nullable counter types.

- [ ] **Step 3: Implement types, pure mapping, and compact grid**

Add optional nullable counter fields to `ShuttleProvenance`; derive the six explicit runtime meanings without guessing from absent data; render model/provider/runtime/precision/device, frame/inference/state metrics and last failure only inside Advanced.

- [ ] **Step 4: Verify GREEN**

Run the same Vitest command and expect all tests to pass.

### Task 3: Observed-only Shuttle Point overlay

**Files:**
- Modify: `src/components/labs/ShuttleOverlay.tsx`
- Modify: `src/__tests__/badminton/shuttleOverlay.test.tsx`

**Interfaces:**
- Consumes: canonical `ShuttleObservation` state and position.
- Produces: current and historical dots exclusively for finite, in-bounds `observed` observations.

- [ ] **Step 1: Write failing overlay tests**

Assert Point renders observed, does not render predicted/interpolated, and the latest lost sample suppresses a preceding observed dot. Assert trail history excludes non-observed positions.

- [ ] **Step 2: Verify RED**

Run: `npm test -- --run src/__tests__/badminton/shuttleOverlay.test.tsx`

Expected: predicted/interpolated current-dot tests fail against current rendering.

- [ ] **Step 3: Restrict the render predicate**

Make the positioned/valid predicate require `state === 'observed'` and update control legend copy to describe the truthful overlay.

- [ ] **Step 4: Verify GREEN**

Run the same Vitest command and expect all tests to pass.

### Task 4: Real badminton video smoke evidence

**Files:**
- Create: `scripts/run_real_shuttle_smoke.py`
- Create: `docs/PHASE-2.9C-shuttle-runtime-diagnostics.md`
- Test: `ai_service/tests/test_real_shuttle_smoke_report.py`

**Interfaces:**
- Consumes: a local real-video path, verified RallyLens model path, start frame and bounded frame count.
- Produces: JSON containing video filename/dimensions/FPS, analyzed frames, inference calls, state counts and nullable observed-confidence `{count,min,median,max}`.

- [ ] **Step 1: Write failing report-shape test**

Test the report summarizer with canonical observations, including an empty observed-confidence distribution returning `null` values rather than fake zeroes.

- [ ] **Step 2: Verify RED**

Run: `python -m unittest ai_service.tests.test_real_shuttle_smoke_report -q`

Expected: import failure because the smoke report module does not exist.

- [ ] **Step 3: Implement bounded production-pipeline runner**

Decode a selected contiguous segment from `Badminton test.mp4`, feed unmodified frames to `create_shuttle_pipeline` using the pinned local adapter, emit JSON, fail if the artifact is unavailable, and never label output as accuracy.

- [ ] **Step 4: Verify GREEN and run real smoke**

Run the unit test, then run the script with the ignored local checkpoint and a bounded real segment. Save only the JSON report under `test-results/phase29c/` and copy measured values into the phase report.

### Task 5: Regression validation, review, and commit

**Files:**
- Modify only files required by review findings.

**Interfaces:**
- Consumes: Tasks 1–4.
- Produces: verified phase commit.

- [ ] **Step 1: Run focused tests**

Run the new Python tests plus shuttle pipeline/tracker tests and the two frontend diagnostic/overlay files.

- [ ] **Step 2: Run repository gates**

Run `python -m unittest discover -s ai_service/tests -q`, `npm run lint`, `npm test -- --reporter=dot`, and attempt ESLint. Report the existing missing-config condition if unchanged.

- [ ] **Step 3: Request independent code review**

Review requirements, nullable semantics, status wording, observed-only overlay, real-video evidence, and accidental model/video inclusion. Fix all Critical/Important findings and rerun affected tests.

- [ ] **Step 4: Commit and verify**

Run `git diff --check`, confirm the worktree contains no model/video file, commit with `feat(shuttle): expose runtime diagnostics`, then report SHA and exact evidence.
