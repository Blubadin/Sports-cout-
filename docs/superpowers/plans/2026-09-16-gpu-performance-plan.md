# GPU and Tracking Performance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce real-video analysis time and use an available accelerator without sacrificing honest tracking metadata or overlay timing.

**Current evidence:** The running Python service uses `torch 2.14.0+cpu`; CUDA is unavailable; the current NVIDIA GT 730 is not a practical target for the installed YOLO/PyTorch stack. The service currently runs YOLO person detection and YOLO pose on CPU, samples every second frame, and the Lab polls partial results.

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

- [ ] Write failing tests for selecting `cuda`, `mps`, or `cpu`, and for reporting the selected device plus model names.
- [ ] Run the tests and confirm they fail because device selection is currently fixed to CPU.
- [ ] Implement a resolver that checks CUDA first, then MPS, then CPU, with an explicit environment override for diagnostics.
- [ ] Add a read-only `/api/capabilities` response and show the result in Labs before analysis starts.
- [ ] Run the new tests and typecheck.

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

### Task 5: Package the desktop app only after inference is fast enough

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

### Task 6: Final verification after the current session is complete

- [ ] Run frontend lint, targeted Lab tests, full frontend tests, Python unit tests, build, and desktop smoke checks.
- [ ] Compare CPU and accelerator benchmark results with the same clip, resolution, stride, and model versions.
- [ ] Confirm no active-session data was interrupted and no synthetic result was stored for a real video.
- [ ] Commit the verified changes and push only after GitHub credentials are available.
