# PHASE 2.9C — Shuttle Runtime Diagnostics and Real-Video Smoke Test Report

**Execution Date:** 2026-09-24  
**Target Branch:** `refactor/scouting-core-tracking-lab`  
**Worktree:** `phase-0-4-overlay-timing`  

---

## 1. Executive Summary

Phase 2.9C completes the truthful runtime diagnostics and real-video validation for the Badminton Shuttle Tracking Engine:
1. **Measured Diagnostic Contract:** Exposes truthful, non-zero-faked runtime metrics from `ProductionShuttlePipeline` and `TemporalShuttleTracker`.
2. **Explicit Frontend Status & Advanced Diagnostics:** Displays 6 distinct engine statuses and a compact diagnostic grid under the Advanced drawer in `BadmintonTrackingLab`.
3. **Observed-Only Point Overlay:** Restricts the Shuttle Point overlay predicate to finite, in-bounds `observed` states only.
4. **Real Video Smoke Test:** Successfully processed a 60-frame segment of real badminton footage (`Badminton test.mp4`) using the pinned local RallyLens TrackNet model (`rallylens-shuttle-tracknet.pth`), recording measured counters without ground-truth claims.

---

## 2. Key Changes by Component

### Task 1: Backend Measured Diagnostic Contract
- **File:** `ai_service/shuttle_pipeline.py`
  - Added `_observation_counts` to track `observed`, `predicted`, `lost`, and `unknown` observations.
  - Added `_record_observation()` helper to ensure all emitted observations are counted.
  - Updated `get_provenance()` to return measured numbers or `None` (JSON `null`) for unmeasured counters:
    - `framesReceived`, `validFrames`, `inferenceCalls`, `meanInferenceMs`
    - `observedCount`, `predictedCount`, `lostCount`, `unknownCount`
    - `lastFailure`
- **Tests:** `ai_service/tests/test_shuttle_runtime_diagnostics.py`
  - Verifies missing/disabled tracker returns `None` for all measured metrics.
  - Verifies zero-frame active tracker returns measured zero counts and `None` for mean inference time.
  - Verifies empty heatmaps record `inferenceCalls`, `unknownCount`, and report `NO SHUTTLE CANDIDATE`.
  - Verifies peak heatmaps record `observedCount`.

### Task 2: Explicit Frontend Status & Advanced Diagnostics
- **Files:** `src/types.ts`, `src/components/labs/BadmintonTrackingLab.tsx`
  - Extended `ShuttleProvenance` with nullable measured counter fields.
  - Updated `deriveShuttleEngineStatus(...)` to return `detailText` covering all 6 core engine states:
    1. `DISABLED` → "Tracking disabled"
    2. Missing model path → "No model configured"
    3. Model load failure → "Model failed to load"
    4. `RUNTIME_UNAVAILABLE` → "Runtime unavailable"
    5. Active with no observed shuttle → "Model active but no shuttle candidates"
    6. Active with observed shuttle → "Model active and shuttle observed"
    (plus "Model ready" / "Model active" pre-inference).
  - Added `<div data-testid="shuttle-runtime-diagnostics">` in the Advanced settings drawer.
  - Implemented `formatDiagnosticCount`: strictly renders `'0'` for measured zero and `'—'` for null/undefined.
- **Tests:** `src/__tests__/badminton/shuttleRuntimeDiagnostics.test.tsx`
  - Covers all 6 status mapping outcomes.
  - Asserts diagnostic grid renders `'0'` for measured zeros and `'—'` for null/undefined fields.

### Task 3: Observed-Only Shuttle Point Overlay
- **Files:** `src/components/labs/ShuttleOverlay.tsx`
  - Restricted `positioned(s)` predicate: requires `s.state === 'observed'`.
  - Updated `ShuttleControls` legend: "Solid: observed shuttle only".
- **Tests:** `src/__tests__/badminton/shuttleOverlay.test.tsx`
  - Verifies `point` overlay renders observed positions and suppresses predicted/interpolated positions.
  - Verifies trail history excludes non-observed positions.
  - Verifies lost observations suppress previous point.

### Task 4: Real Badminton Video Smoke Test
- **Files:**
  - `scripts/run_real_shuttle_smoke.py`
  - `ai_service/tests/test_real_shuttle_smoke_report.py`
  - `test-results/phase29c/real_shuttle_smoke_report.json`

---

## 3. Real Badminton Video Smoke Test Evidence

Executed `scripts/run_real_shuttle_smoke.py` against local real video file and pinned model checkpoint:
- **Video Path:** `C:\Users\Sport-Science-R3909\Desktop\AI\Vedio Bad\Badminton test.mp4`
- **Resolution:** 1280 x 720 px
- **Frame Rate:** 30.0 FPS
- **Total Video Frames:** 8,869 frames (295.63s)
- **Model Checkpoint:** `.local-models/rallylens-shuttle-tracknet.pth` (45,431,245 bytes)
- **Evaluated Segment:** Frames 100 to 159 (60 consecutive frames, 2.0s)
- **Hardware Device:** CPU (PyTorch fp32)

### Measured Runtime Metrics

| Metric | Measured Value | Unit / Format |
|---|---|---|
| Frames Received | 60 | frames |
| Valid Frames | 60 | frames |
| Inference Calls | 52 | calls (9-frame window, 8 warmup) |
| Mean Inference Latency | 2005.80 | ms / call (CPU) |
| Wall Clock Elapsed Time | 104.71 | seconds |
| Observed Count | 13 | observations |
| Predicted Count | 0 | observations |
| Lost Count | 39 | observations |
| Unknown / Warmup Count | 8 | observations |
| Observed Confidence Count | 13 | detections |
| Observed Confidence Min | 0.5462 | probability |
| Observed Confidence Median | 0.6641 | probability |
| Observed Confidence Max | 0.6922 | probability |
| Final Engine Failure State | NO SHUTTLE CANDIDATE | string |

### Scientific & Biomechanical Disclaimer
Monocular 2D pixel estimates from runtime smoke execution without ground truth. Not a claim of detection accuracy, recall, or 3D trajectory.標準 monocular 2D video does not measure true 3D spatial flight or aerodynamic forces.

---

## 4. Verification & Gate Checks

1. **Python Unit Tests:**
   ```bash
   python -m unittest discover -s ai_service/tests -p "test_*.py"
   ```
   Result: **387 tests passed (2 skipped), 0 failures, 0 errors**.

2. **Frontend Vitest Suites:**
   ```bash
   npm test src/__tests__/badminton/
   ```
   Result: **All tests passed** (`shuttleRuntimeDiagnostics.test.tsx`, `shuttleOverlay.test.tsx`, `shuttleRuntimeActivation.test.tsx`, `performanceProfiles.test.tsx`, `trackingAnalyticsHonesty.test.tsx`, `trackingNavigationPersistence.test.tsx`).

3. **TypeScript / Production Build:**
   ```bash
   npm run build
   ```
   Result: **Zero TypeScript errors, production bundle built successfully**.
