# SportsScout Phase 3 Final Runtime & Durability Validation Report

**Document Date:** October 6, 2026  
**Auditor / Engineering Role:** Senior Engineering Auditor & Validation Architect  
**Branch:** `fix/phase3-final-remediation`  
**Current HEAD SHA:** `e6569b5f4999966f05bdc15cc87ab165c583cf38`  
**Evaluation Protocol:** `docs/evidence/PHASE_3_GT_PROTOCOL.md` & `ai_service/evaluate_phase3_real.py`  

---

## 1. Executive Summary

This report documents the final runtime endurance, continuous execution durability, journal recovery, resource stability, browser storage integrity, and hardware execution backend validation for SportsScout Phase 3.

All tests were performed strictly on the current audited Phase 3 implementation without architectural redesign. Frozen configurations, real source video, and observed worker metrics were recorded without data synthesis or heuristic threshold approval.

### Capability Validation Outcomes

| Capability / Test Suite | Outcome | Evidence Reference | Notes |
| :--- | :---: | :--- | :--- |
| **10-Minute Continuous Baseline** | **VALIDATED** | `phase3-real-2026-10-05-10min-report.json` | 9,000 analyzed frames (600s), 0 duplicate/order/gap/schema violations |
| **10-Minute Cancel → Resume** | **VALIDATED** | `phase3-real-2026-10-05-10min-report.json` | 100% committed prefix retained, exact 9,000 row completion, 0 violations |
| **10-Minute Process Kill → Resume** | **VALIDATED** | `phase3-real-2026-10-05-10min-process-kill-report.json` | Ungraceful kill @ frame 9,000; journal reconstructed; 9,000 rows, 0 leaks |
| **30-Minute Continuous Duration** | **NOT VALIDATED** | `MISSING_MEDIA` | Max continuous single-take video is 16m 18s; artificial looping forbidden |
| **60-Minute Continuous Duration** | **NOT VALIDATED** | `MISSING_MEDIA` | Continuous 60m media unavailable locally; looping forbidden |
| **NVIDIA CUDA GPU Inference** | **VALIDATED** | Worker CUDA telemetry & model provenance | RTX 4050 Laptop GPU (CUDA 12.4), FP32 YOLOv8n + YOLOv8n-pose, 0 CPU fallbacks |
| **AMD ROCm / DirectML GPU** | **NOT VALIDATED** | Hardware scan & runtime probe | AMD Radeon 680M iGPU detected, but no Windows ROCm/DirectML PyTorch backend |
| **Browser Storage Durability** | **VALIDATED** | Playwright E2E (18/18) & Vitest (32/32) | Native IndexedDB durability, chunk paging, rollback, 0 synthetic frame leaks |
| **Full Shuttle Pipeline** | **NOT VALIDATED** | Reduced configuration record | Pinned TrackNet artifact (`08b7e904...`) missing; shuttle disabled in run |
| **Phase 3 Acceptance Certification** | **BLOCKED** | Gate rules in `PHASE_3_GT_PROTOCOL.md` | Held-out human GT and frozen acceptance thresholds remain required |

---

## 2. Frozen Environment & Hardware

Every baseline, cancel-restart, and process-kill run executed under an identical frozen configuration. Settings were locked in preflight and never tuned between runs.

### Host Machine Hardware
- **Operating System:** Windows 11 Pro 64-bit (Build 26200.5050)
- **Host CPU:** AMD Ryzen (AMD64 Family 25 Model 68 Stepping 1, AuthenticAMD, 8 Physical Cores / 16 Logical Threads)
- **Discrete GPU:** NVIDIA GeForce RTX 4050 Laptop GPU (6,141 MiB dedicated VRAM, Compute Capability 8.9, Driver Version 32.0.15.8205 / NVIDIA 577.09)
- **Integrated GPU:** AMD Radeon(TM) 680M (PCI\VEN_1002&DEV_1681, 512 MiB dedicated VRAM, shared system memory, DirectX 12 / Vulkan display adapter)

### Software Toolchains & Virtual Environment
- **Python Interpreter:** Python 3.12.14 64-bit (`MSC v.1944 64 bit AMD64`)
- **PyTorch Stack:** `torch 2.5.1+cu124`, `torchvision 0.20.1+cu124`, CUDA 12.4
- **Vision Core:** `ultralytics 8.3.203`, `opencv-python 4.10.0.84`, `numpy 2.1.2`, `psutil 7.0.0`
- **Node.js Environment:** Node.js v24.19.0, npm 11.2.0, Vite 6.4.1, Vitest 4.1.10, Playwright 1.58.2
- **Source Code Repository SHA:** `e6569b5f4999966f05bdc15cc87ab165c583cf38` (`fix/phase3-final-remediation`)

### Source Media Specification
- **File Name:** `Asian Double Men 2026.mp4`
- **Absolute Path:** `C:\Users\sport\OneDrive\Documents\Vedio Bad\Asian Double Men 2026.mp4`
- **SHA-256 Hash:** `84160d026a350716e227cb2f6f4c4c3d35cf52ab6aac6977d8e787b0299a6817`
- **Container Properties:** 124,951,301 bytes, 1280×720 resolution, 30.00 FPS, 29,359 total frames (978.633 seconds / 16m 18s).
- **Evaluated Span:** First 18,000 continuous source frames (600.00 source seconds / 10 minutes).

### Model Checkpoints & Execution Configuration
- **Detector Model:** `yolov8n.pt` (SHA-256: `f59b3d833e2ff32e194b5bb8e08d211dc7c5bdf144b90d2c8412c47ccfc83b36`, 6,549,796 bytes)
- **Pose Model:** `yolov8n-pose.pt` (SHA-256: `c6fa93dd1ee4a2c18c900a45c1d864a1c6f7aba75d84f91648a30b7fb641d212`, 6,832,633 bytes)
- **Multi-Object Tracker:** ByteTrack using Ultralytics default configuration (`bytetrack.yaml`)
- **Execution Class:** `REDUCED_PLAYER_POSE_AUTO_CALIBRATION_NO_SHUTTLE`
  - Detector Input Size: 640×640 letterbox BGR→RGB
  - Detector Confidence Threshold: 0.35
  - Pose Confidence Threshold: 0.40
  - Frame Stride: 2 (decodes all frames consecutively, infers detection every second frame)
  - Pose Stride: 1 (computes pose keypoints on all candidate player detections)
  - Doubles Slots: 4 tracked player identities (P1..P4)
  - Automatic Court Calibration: Enabled
  - Shuttle Tracker: Disabled (pinned RallyLens checkpoint unavailable)
  - Precision: FP32 tensors (no vendor FP16 or TensorRT tuning)
  - CPU Thread Concurrency: Pinned to 1 (`torch.set_num_threads(1)`)

---

## 3. 10-Minute Real Media Durability Results

The 10-minute durability suite was executed across three runs using `ai_service/evaluate_phase3_real.py` and independently verified via `scripts/verify_phase3_real_evidence.py`.

### Comparison of Runs

| Metric / Check | Run A: Baseline | Run B: Cancel → Resume | Run C: Process Kill → Resume |
| :--- | :---: | :---: | :---: |
| **Execution Mode** | Uninterrupted continuous | Production cancel @ frame 9,000 | Abrupt OS `kill()` @ frame 9,000 |
| **Job Status** | `COMPLETED` | `COMPLETED` | `COMPLETED` |
| **Completion Gate** | **PASS** | **PASS** | **PASS** |
| **Recovery Gate** | `NOT APPLICABLE` | **PASS** | **PASS** |
| **Source Decoded Frames** | 18,000 / 18,000 | 18,000 / 18,000 | 18,000 / 18,000 |
| **Canonical Analyzed Rows** | 9,000 | 9,000 | 9,000 |
| **Expected Row Count** | 9,000 | 9,000 | 9,000 |
| **Committed Prefix Retained** | N/A | **True** (all prior chunks identical) | **True** (all prior chunks identical) |
| **Duplicate / Reordered Rows** | **0** | **0** | **0** |
| **Frame Index Gaps** | **0** | **0** | **0** |
| **Timestamp Alignment Violations** | **0** | **0** | **0** |
| **Schema / Synthetic Violations** | **0** | **0** | **0** |
| **Heatmap Without Metric Gate** | **0** | **0** | **0** |
| **Hit Readiness Without Shuttle** | **0** | **0** | **0** |
| **Invalid Calibration Metric Leaks** | **0** | **0** | **0** |
| **Invalid Feet Pixel Bounds** | **0** (10,361 checked) | **0** (9,241 checked) | **0** (9,220 checked) |
| **Feet Pixel/Percent Mismatches** | **0** | **0** | **0** |
| **Unknown Transition Gate Leaks** | **0** (69 checked) | **0** (69 checked) | **0** (69 checked) |
| **Wall Clock Elapsed (s)** | 1,845.25 s | 1,845.48 s | 2,127.03 s |
| **Throughput (Wall / Video Time)** | 3.08× (4.88 fps) | 3.08× (4.88 fps) | 3.55× (4.23 fps) |

### Key Durability Findings
1. **Zero Row Duplication or Gaps:** Neither graceful cancellation nor sudden process termination duplicated a single canonical frame index or dropped any intermediate observation.
2. **Deterministic Source Timing:** Every row index $i \in [1, 9000]$ aligned precisely with timestamp $(2i - 1) / 30.0$ seconds within a 1 ns tolerance. Zero PTS drift occurred upon seeked resume.
3. **Strict Calibration Gating:** Over 9,000 frames evaluated, court calibration remained unconfirmed under strict multi-line acceptance criteria. In all 9,000 frames across all three runs, `isMetricValid = False` and `canUseCourtMetric = False` were enforced. **Zero court-space metrics (`courtPositionM`, `speedMps`, `totalDistanceM`) leaked into uncalibrated rows.**
4. **Continuity Integrity Across Resume:** In accordance with tracking integrity rules, resuming an interrupted job does NOT fabricate continuous metric lines across the interruption. MOT tracker warmup was initiated, and metric continuity was broken safely at the resume boundary.
5. **Human Correction Persistence:** Truthfully recorded as **NOT VALIDATED** for live video inference, as no human operator adjustments were provided during automated execution. (Isolated component behavior is certified by unit tests).

---

## 4. 30-Minute and 60-Minute Duration Checks

An exhaustive inventory of available continuous real badminton video recordings in local storage was performed:

| Media File Name | SHA-256 Digest | Frames | Duration | Status |
| :--- | :--- | :---: | :---: | :---: |
| `Asian Double Men 2026.mp4` | `84160d026a350716e227cb2f6f4c4c3d35cf52ab6aac6977d8e787b0299a6817` | 29,359 | 978.63 s (16m 18s) | Available (used for 10m) |
| `Watanabe _ All England 2020.mp4` | `1ac8b3d811f5a5d42e419902b6ebbe2aab3fd8bb1b509cdb8b13da4308508074` | 24,335 | 811.17 s (13m 31s) | Available |
| `Badminton test.mp4` | `e7c5581bdf88f622aff88901bab139133fea50f93c25c0a928056294a2bc9a4e` | 8,869 | 295.63 s (4m 55s) | Available |

### Audit Determination
- **30-Minute Continuous Duration:** **NOT VALIDATED — MISSING_MEDIA**
- **60-Minute Continuous Duration:** **NOT VALIDATED — MISSING_MEDIA**

**Integrity Rule Enforcement:** Under Section 3 of `AGENTS.md` and `PHASE_3_GT_PROTOCOL.md`, synthetic duplication, video looping, or concatenating distinct clips to simulate continuous long-take recordings is strictly forbidden. Without authentic 30-minute and 60-minute single-take match sources, these duration gates remain uncertified.

---

## 5. Resource Telemetry & Stability

Resource metrics were recorded at 2-second worker intervals and 5-second controller snapshots throughout the 9,000-frame runs:

### Memory Trajectory

```
Worker RSS (MB)
 1500 |   ┌────────────────────────────────────────────────────────┐
      |   │░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░│  Peak: 1,409.79 MB
 1000 |───┴────────────────────────────────────────────────────────┴── First 20% Median: 1,374.52 MB
      |                                                                Last 20% Median:  1,265.28 MB
  500 |   CUDA VRAM: Allocated 41.55–70.51 MB | Reserved Flat @ 136.00 MB
    0 └─────────────────────────────────────────────────────────────────
      Frame 0                        Frame 4500              Frame 9000
```

### Resource Metric Summary

| Resource Metric | Baseline Run | Cancel → Resume | Process Kill → Resume | Stability Limit | Status |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **Worker Process Max RSS** | 1,399.46 MB | 1,409.79 MB | 1,407.73 MB | Unset (Monitored) | **STABLE** |
| **First 20% Median RSS** | 1,374.52 MB | 1,383.86 MB | 1,384.28 MB | N/A | **STABLE** |
| **Last 20% Median RSS** | 1,265.28 MB | 1,268.50 MB | 1,376.86 MB | N/A | **STABLE (No Leak)** |
| **CUDA Allocated Memory (Max)**| 56.31 MB | 70.51 MB | 41.55 MB | Bounded | **STABLE** |
| **CUDA Reserved Memory (Max)** | 136.00 MB | 136.00 MB | 136.00 MB | Bounded | **STABLE** |
| **Host CPU Utilization** | ~12% – 18% | ~12% – 18% | ~12% – 18% | 1 Worker Thread | **NORMAL** |
| **Result Window Buffer Max** | 128 items | 128 items | 128 items | $\le 128$ | **PASS** |
| **Pending Chunk Queue Max** | 64 items | 64 items | 64 items | $\le 64$ | **PASS** |
| **Semantic Owner Map Max** | 26 tracks | 26 tracks | 26 tracks | $\le 4,096$ | **PASS** |
| **Transition History Max** | 128 events | 128 events | 128 events | $\le 128$ | **PASS** |

### Stability Evaluation
1. **Bounded Ring Buffers:** All internal queues (in-flight results, pending chunks, semantic owners, and scene transitions) maintained strictly bounded capacity.
2. **Absence of Memory Leaks:** Worker process RSS showed zero monotonically increasing growth. The final 20% median RSS was equal to or lower than the initial 20% median RSS, confirming proper garbage collection of PyTorch tensor graphs and OpenCV frame allocations.
3. **Static VRAM Footprint:** PyTorch CUDA reserved memory remained static at exactly 136.00 MB throughout all 9,000 frames.

---

## 6. Browser Storage Durability

Client-side durability was verified across 18 automated Playwright end-to-end tests executing in headless Chromium with native IndexedDB, complemented by 32 Vitest contract tests.

### Verified Durability Guarantees

| Invariant / Feature | Verification Result | Verified Mechanism |
| :--- | :---: | :--- |
| **Native IndexedDB Multi-Store Creation** | **PASS** | Single-version schema upgrade creates `trackingAnalyses`, `trackingSampleChunks`, `trackingCandidates`, and `trackingTelemetryPages`. |
| **Client-Side Telemetry Persistence** | **PASS** | Pages of 250 rows are stored idempotently by cursor key `sessionId:cursor`. |
| **Reload Durability Without Refetching** | **PASS** | Completed analyses reload directly from IndexedDB without repeating expensive backend queries or overwriting manual analyst corrections. |
| **Cursor Gap & Boundary Repair** | **PASS** | Reconnect repairs missing pages across cursor boundaries without double-appending prefix frames. |
| **Storage Failure / Quota Handling** | **PASS** | Chunk write failures abort completion, keeping analysis status in `processing` so operations remain retryable without data loss. |
| **Multi-Store Atomic Rollback** | **PASS** | Aborted deletion transactions atomically roll back across all four object stores. |
| **Synthetic Frame Isolation** | **PASS** | Frames with `isSynthetic: true` or `source: 'synthetic_demo'` are strictly filtered and **never written to IndexedDB**. Mixed pages throw explicit runtime errors. |

### Real Browser vs Mock Differentiation
- **Real Browser Execution:** Validated in Chromium using real IndexedDB transactions, real IndexedDB schema versions, and real localStorage synchronization (`e2e/tracking-*.spec.ts`).
- **Synthetic/Mock Injection:** Isolated in `MemoryTrackingDriver` for unit tests. In production workstation builds, `IndexedDbTrackingDriver` is enforced.

---

## 7. Hardware Backend Status (NVIDIA vs AMD vs CPU)

### NVIDIA Discrete GPU: VALIDATED
- **Detected Hardware:** NVIDIA GeForce RTX 4050 Laptop GPU (6,141 MiB VRAM, Compute Capability 8.9)
- **Active Backend:** PyTorch 2.5.1 + CUDA 12.4
- **Verified Models:** YOLOv8n object detection and YOLOv8n-pose estimation
- **Telemetry Provenance:** All 9,000 frames report `effectiveDevice: "cuda"` / `effectiveDevice: "cuda:0"`.
- **Tensor Precision:** FP32 tensors verified; 0 CPU fallbacks observed.
- **Pipeline Limitation:** Shuttle tracking remains unvalidated on CUDA due to missing pinned TrackNet model artifact.

### AMD Integrated GPU: NOT VALIDATED
- **Detected Hardware:** AMD Radeon(TM) 680M (PCI\VEN_1002&DEV_1681)
- **Software Runtime Status:** The host environment runs Windows 11. Official Windows PyTorch binaries do not support ROCm for consumer RDNA2 integrated GPUs. DirectML is neither installed nor configured in the Python environment.
- **Inference Probe:** Any attempt to target AMD hardware falls back to CPU or throws a device error.
- **Status Determination:** In strict adherence to AGENTS.md rules, AMD acceleration is truthfully reported as **NOT VALIDATED**.

### CPU Reference Runtime: VALIDATED (Functional / Smoke Scope)
- **Detected Hardware:** AMD Ryzen (8 Cores, 16 Threads)
- **Active Backend:** PyTorch 2.5.1 CPU / OpenCV DNN
- **Verified Operations:** Full coordinate space transformations, wire contracts, and unit tests (679 passing tests). Validated for non-accelerated reference execution.

---

## 8. Known Limitations & Integrity Statement

### Integrity Statement
In accordance with SportsScout Engineering Rules:
1. No synthetic frames were represented as real video evidence.
2. No metric was assumed or filled with placeholder zeros where unobserved.
3. No accuracy or error thresholds were invented post-hoc.
4. Missing long-duration media was truthfully documented rather than simulated.

### Current Blocking Limitations
1. **Absence of 30-min and 60-min Continuous Media:** Continuous long-take single-video sources are required before long-duration certification can be granted.
2. **Missing RallyLens Model Artifact:** The pinned TrackNet checkpoint (`08b7e904...`) is required to validate consecutive-frame shuttle tracking.
3. **Pending Ground Truth & Acceptance Thresholds:** As established in `PHASE_3_GT_PROTOCOL.md`, final Phase 3 closeout requires certified, independently reviewed Ground Truth annotations across the 14 defined scenario buckets and formally approved acceptance thresholds.

**Phase 3 Final Acceptance Status:** **BLOCKED / NOT CERTIFIED** pending Ground Truth acquisition and continuous long-duration media.
