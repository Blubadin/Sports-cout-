# GPU and Tracking Performance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce real-video analysis time and use an available accelerator without sacrificing honest tracking metadata or overlay timing.

**Current evidence:** The running Python service uses `torch 2.14.0+cpu`; CUDA is unavailable; the current NVIDIA GT 730 is not a practical target for the installed YOLO/PyTorch stack. The service currently runs YOLO person detection and YOLO pose on CPU, samples every second frame, and the Lab polls partial results.

**IndexedDB root-cause evidence:** `src/services/storage/trackingStorage.ts` creates three `idb-keyval.createStore` handles with the same database name but different object-store names. `createStore` opens the database without an explicit version and only creates its own store during `onupgradeneeded`; the first open can therefore leave the shared database without the other stores. The completion save then fails when a transaction targets a missing store, producing `Failed to execute 'transaction' on 'IDBDatabase': One of the specified object stores was not found.`

**Implementation progress (2026-09-16):** IndexedDB schema repair, safe completed-result writes, backend session discovery, browser reconnect polling, runtime device/capability reporting, the Labs processing-mode selector, and a visible video-file picker button are implemented and verified. Durable disk checkpoints, accelerator benchmarks, and desktop sidecar packaging remain staged below.

**Architecture:** Keep Tauri/React as the user interface and keep Python as the inference worker. Add runtime device selection and a visible capability report. Select CUDA on supported NVIDIA machines, MPS on Apple Silicon, and CPU otherwise. Keep a CPU-safe fallback and never label CPU output as GPU output. Optimize model work separately from packaging.

**Tech Stack:** FastAPI, Ultralytics YOLO, PyTorch, OpenCV, React/Vite, Tauri sidecar packaging.

## Global Constraints

- Real video results must remain `isSynthetic: false` and must contain measured confidence values.
- Browser mode remains an explicitly labeled demonstration path.
- Do not claim 3D biomechanics, force, torque, jump height, or other unsupported measurements.
- Do not interrupt or delete an active analysis session during implementation or verification.
- Preserve the existing TrackingTelemetryV1 shape and local IndexedDB result format.

---

### Task 1: Add a capability and device diagnostic

**Files:**
- Modify: `ai_service/analyzer_v2.py`
- Modify: `ai_service/server.py`
- Modify: `src/services/aiTrackingService.ts`
- Modify: `src/components/labs/BadmintonTrackingLab.tsx`
- Test: `ai_service/tests/test_device_selection.py`

- [x] Write failing tests for selecting `cuda`, `mps`, or `cpu`, and for reporting the selected device plus model names.
- [x] Run the tests and confirm they fail because device selection is currently fixed to CPU.
- [x] Implement a resolver that checks CUDA first, then MPS, then CPU, with an explicit environment override for diagnostics.
- [x] Add a read-only `/api/capabilities` response and show the result in Labs before analysis starts.
- [x] Run the new tests and typecheck.

### Task 2: Make inference device-aware and model-load safe

**Files:**
- Modify: `ai_service/analyzer_v2.py`
- Modify: `ai_service/pose_detector.py`
- Modify: `ai_service/server.py`
- Test: `ai_service/tests/test_device_selection.py`
- Test: `ai_service/tests/test_real_tracking.py`

- [ ] Add tests that a supported device is passed to detector and pose inference, while CPU remains the deterministic fallback.
- [ ] Implement one runtime device value shared by detector and pose detector; reject unavailable explicit overrides with a useful error.
- [ ] Warm models once per service and expose warm-up status so the first frame does not look stalled.
- [ ] Verify real telemetry still reports measured confidence, track IDs, pose scores, and `isSynthetic: false`.

### Task 3: Reduce CPU/GPU work without changing the telemetry contract

**Files:**
- Modify: `ai_service/server.py`
- Modify: `ai_service/analyzer_v2.py`
- Modify: `ai_service/pose_detector.py`
- Test: `ai_service/tests/test_sampling_policy.py`

- [ ] Write failing tests for configurable frame stride, inference image size, and pose cadence.
- [ ] Implement configuration defaults appropriate for CPU and accelerator paths: detector stride 2 on CPU, stride 1 on GPU when measured throughput supports it, and pose cadence no faster than the detector cadence.
- [ ] Resize inference inputs while preserving source-frame coordinates in telemetry.
- [ ] Keep timestamps based on source video time and document the effective sample rate in session status.
- [ ] Benchmark a short representative badminton clip on CPU and each available accelerator.

### Task 4: Improve progressive results and user feedback

**Files:**
- Modify: `src/components/labs/BadmintonTrackingLab.tsx`
- Modify: `src/components/labs/TrackingVideoOverlay.tsx`
- Modify: `src/services/aiTrackingService.ts`
- Test: `src/components/labs/BadmintonTrackingLab.test.tsx`

- [ ] Add tests proving partial telemetry renders during `PROCESSING` and that stale frames are not shown after completion.
- [ ] Poll a bounded recent telemetry window instead of repeatedly transferring the full growing result set.
- [ ] Show processed frame count, effective sample rate, selected device, and last telemetry timestamp beside progress.
- [ ] Keep skeleton points hidden below the confidence threshold and show a clear “waiting for observed pose” state when no valid pose exists.

### Task 5: Make analysis resumable after leaving the web app

**Files:**
- Modify: `ai_service/server.py`
- Modify: `ai_service/session_store.py`
- Modify: `src/services/aiTrackingService.ts`
- Modify: `src/components/labs/BadmintonTrackingLab.tsx`
- Test: `ai_service/tests/test_session_resume.py`
- Test: `src/components/labs/BadmintonTrackingLab.test.tsx`

- [ ] Write failing tests for durable checkpoints, session discovery after a page reload, and resuming from the last completed source-frame checkpoint without duplicating telemetry.
- [ ] Persist each session's source-video identity (stable local-file hash or managed copy), configuration/model version, status, last completed frame, source timestamp, and a bounded telemetry checkpoint outside the React page state.
- [ ] Keep the Python worker independent from the browser tab: closing or navigating away from the web page must not cancel a running session; the next page load must discover `PROCESSING`, `PAUSED`, `COMPLETED`, and `FAILED` sessions.
- [ ] Add a resume endpoint/command that validates the source identity and configuration before continuing, seeks to the next unprocessed frame, restores tracker state when supported, and safely skips already persisted results.
- [ ] Make checkpoint writes atomic and recoverable after a service or computer restart; mark an interrupted session as resumable instead of silently starting over or reporting it as complete.
- [ ] Add Lab actions for “ดำเนินการต่อ”, “เริ่มใหม่”, and “ดูผลลัพธ์ที่บันทึกไว้”, with clear progress recovered from the checkpoint. Keep real-video results `isSynthetic: false` and preserve the existing telemetry shape.

### Task 6: Repair and version IndexedDB storage before saving completed results

**Files:**
- Modify: `src/services/storage/trackingStorage.ts`
- Modify: `src/components/labs/BadmintonTrackingLab.tsx`
- Test: `src/services/storage/trackingStorage.test.ts`
- Test: `src/components/labs/BadmintonTrackingLab.test.tsx`

- [x] Add a failing regression test that opens the tracking database from a clean profile and verifies all required object stores exist before `saveTrackingAnalysis` writes the analysis, chunks, and candidates.
- [x] Replace the three same-name `idb-keyval.createStore` handles with one versioned database opener/driver. In `onupgradeneeded`, create or preserve `trackingAnalyses`, `trackingSampleChunks`, and `trackingCandidates` in the same schema upgrade; serialize concurrent opens and recover cleanly from a closed connection.
- [x] Add a non-destructive migration from existing `sportscout-tracking-v1` data. Never delete a user's saved analysis just because one store is missing; surface a repairable storage error if an upgrade is blocked or the browser denies IndexedDB access.
- [x] Make completion persistence atomic at the application level: write the analysis record and its chunks with an idempotent analysis ID, then mark the record `completed` only after all required writes succeed. A failed write must remain retryable and must not show a false completed state.
- [ ] Add a startup/storage-health check and a clear Thai/English recovery message with a retry action, while keeping the in-memory driver available for tests and non-browser environments.
- [ ] Verify the exact reported error is gone in a fresh browser profile and in a profile containing the previous partial database, then rerun the full storage and Lab test suites.

### Task 7: Package the desktop app only after inference is fast enough

**Files:**
- Create: `src-tauri/tauri.conf.json`
- Create: `src-tauri/src-tauri/main.rs`
- Create: `src-tauri/binaries/README.md`
- Modify: `package.json`
- Test: `scripts/check-tauri-sidecar.mjs`

- [ ] Package the Python service as a platform-specific sidecar with PyInstaller; keep the web UI and API contract unchanged.
- [ ] Add startup/health supervision and clean shutdown for the sidecar.
- [ ] Build separate Apple Silicon, Intel, and Windows artifacts; use a Universal macOS target only when bundle size is acceptable.
- [ ] Verify the desktop app launches the sidecar, detects its device capability, runs a short real clip, and exits cleanly.

### Task 8: Final verification after the current session is complete

- [ ] Run frontend lint, targeted Lab tests, full frontend tests, Python unit tests, build, and desktop smoke checks.
- [ ] Compare CPU and accelerator benchmark results with the same clip, resolution, stride, and model versions.
- [ ] Confirm no active-session data was interrupted and no synthetic result was stored for a real video.
- [ ] Close and reopen the browser during a controlled test, then verify the same session is discovered and resumes from its checkpoint without reprocessing completed frames.
- [ ] Commit the verified changes and push only after GitHub credentials are available.
