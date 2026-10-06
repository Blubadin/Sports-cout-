# Phase 3 Closeout

**Document Date:** October 6, 2026  
**Auditor / Engineering Role:** Final Independent Reviewer for SportsScout Phase 3  
**Audited Branch:** `fix/phase3-final-remediation`  
**Current Branch HEAD SHA:** `22c623dc90f68ab3ef89922325947fc929675757`  
**Main Reference SHA:** `bf4f5bc15a3ca4e22a4efdf830230692e8038bdc`  

---

## 1. Baseline

- **Repository:** `Blubadin/Sports-cout-`
- **Main Baseline SHA:** `bf4f5bc15a3ca4e22a4efdf830230692e8038bdc`
- **Audit Target Branch:** `fix/phase3-final-remediation`
- **Audit Target HEAD SHA:** `22c623dc90f68ab3ef89922325947fc929675757`
- **Commits Ahead of Main:**
  1. `0b8060c`: fix(phase3): resolve engineering reproducibility, GPU test setup, and evidence index
  2. `e6569b5`: feat(benchmark): implement Phase 3 benchmark safety gates and certification protocol
  3. `22c623d`: docs(evidence): record Phase 3 final runtime and durability validation
- **Working Tree State:** Clean across all production source files, tests, and evidence contracts. Local developer setup scripts (`scripts/bootstrap-windows.ps1`, `scripts/doctor.ps1`, `ai_service/runtime_doctor.py`) present as untracked tooling.
- **Operating System:** Windows 11 Pro 64-bit (Build 26200.5050)
- **Host Hardware:** AMD Ryzen 7 (8 Cores / 16 Threads), NVIDIA GeForce RTX 4050 Laptop GPU (6,141 MiB VRAM), AMD Radeon 680M iGPU.

---

## 2. Engineering Implementation

Phase 3 introduces automated player tracking, dynamic court calibration, scene boundary detection, and analysis job durability to the Badminton Tracking Lab without compromising the core scouting workstation architecture.

### Phase 3.3: Calibration → Feet → Eligibility → Semantic Identity
- **Explicit Pose Coordinate Spaces:** Implemented in `ai_service/pose_coordinate_space.py`. Rejects heuristic numeric magnitude guessing; explicitly requires and validates coordinate spaces (`source_pixel`, `normalized_percentage`, `court_meters`).
- **Canonical Ground Point & Provenance:** Ground contact is derived strictly in order of provenance: `pose_both_ankles` → `pose_single_ankle` → `bbox_bottom_center` fallback. Over 10,000 real feet observations verified within image bounds.
- **Court Eligibility & Spectator Gating:** Spectators, referees, and coaches on court margins are filtered out by persistent bounding boxes and proximity rules; spectators are never silently promoted to player slots.
- **Semantic Identity vs MOT Track ID:** ByteTrack MOT tracking identifiers are strictly quarantined from SportsScout semantic player identifiers (`P1`..`P4`). Track re-identification or ID switches do not overwrite athlete identity slots without spatial evidence.
- **Metric Invalidation & Missing != Zero:** Uncalibrated frames, invalid camera angles, and occlusions emit `None`/`null` for tactical court coordinates and speed; missing data is never converted to `0.0`.

### Phase 3.4: Benchmark → Data → Recovery → GT Foundation
- **Durable Analysis Job Store:** Implemented in `ai_service/analysis_job_store.py`. Every analyzed frame chunk is written atomically with SHA-256 checksums, atomic file replacement (`os.replace` with Windows retry loop), and a durable WAL journal.
- **Monotonic Resumption:** Analysis jobs resume strictly from the last committed cursor. Decoder PTS 0.0 is properly handled as the origin, avoiding 1-frame offset drifts upon seeked resume.
- **Safety Gates & Protocol:** Implemented in `ai_service/phase3_benchmark.py` and `ai_service/benchmark_schema.py`. Enforces 18 hard safety gates blocking certification whenever evidence is synthetic, unblinded, self-predicted, or missing independent review.

### Phase 3.5A: Scene Lifecycle
- **Transition Classification:** Classifies camera cuts, pans, close-ups, and replays via visual histogram and optical flow analysis.
- **Boundary Metric Freezing:** On camera cuts, cross-segment speed and distance metric integration is severed; no false movement vectors bridge across camera switches.

### Phase 3.5B: Calibration Modes
- **Automatic Court Calibration:** Implemented in `ai_service/court_calibration.py`. Detects court line segments via Hough transform, fits lines with robust Huber loss (`DIST_HUBER`), matches badminton landmarks, and computes court homography $H$. Requires at least 3 longitudinal and 3 transverse lines and outer boundary support ($\ge 0.65$).
- **Anti-Churn Temporal Validator:** Prevents lock churn on single-frame anomalies and resets immediately on camera segment changes.
- **Manual Calibration & Recovery:** Allows manual 4-corner homography override and recovery when automatic detection is unavailable.

### Phase 3.5C: Shuttle + Runtime
- **Shuttle Pipeline Architecture:** Implemented in `ai_service/shuttle_pipeline.py` and `ai_service/shuttle_tracker.py` for RallyLens TrackNet temporal heatmaps.
- **Explicit Checkpoint Installation:** Rejects silent background weight downloads; enforces SHA-256 checksum verification (`08b7e904...`).
- **Device Selection & Execution:** Automatically targets NVIDIA CUDA when available, falling back cleanly to CPU with explicit provenance telemetry.

### Phase 3.5D: Integration + Recovery + Closeout
- **Durability Harness:** Implemented in `ai_service/evaluate_phase3_real.py` and `scripts/verify_phase3_real_evidence.py`. Validates real long-running video jobs against contract violations and memory leaks.

---

## 3. Automated Verification

Every automated verification suite in the repository has been executed and confirmed clean at the current baseline SHA:

| Verification Suite | Tool / Command | Result | Details |
| :--- | :--- | :---: | :--- |
| **Python Unit & Contract Tests** | `python -m unittest discover -s ai_service/tests` | **PASS** | **679 passed**, 4 skipped, 0 failures, 0 errors in 22.72s. |
| **Phase 3 Benchmark Safety Gates** | `python -m unittest ai_service.tests.test_phase3_benchmark_gates` | **PASS** | **17 passed**, 0 failures. Proves all 18 certification gates block unreviewed/invalid runs. |
| **Frontend Unit & Component Tests** | `npx vitest run` | **PASS** | **105 files passed**, **1,005 tests passed**, 0 failures in 35.81s. |
| **TypeScript Typecheck** | `npx tsc --noEmit` | **PASS** | Zero compile errors across the entire codebase. |
| **ESLint Static Analysis** | `node scripts/lint-with-baseline.mjs` | **PASS** | 432 errors, 30 warnings; 462/462 findings within declared historical debt baseline. Zero new violations. |
| **Playwright Browser E2E** | `npx playwright test e2e/tracking-*.spec.ts` | **PASS** | **18 tests passed** in headless Chromium with native IndexedDB. |
| **PWA Icon & Bundle Build** | `npm run build` (`vite build`) | **PASS** | All 57 production assets built in 13.99s. Service worker generated cleanly. |
| **GitHub Actions CI Configuration** | `.github/workflows/quality.yml` | **PASS** | Dual-OS matrix (`ubuntu-latest`, `windows-latest`) covering all suites above. |

---

## 4. Real Runtime Evidence

The durability and endurance of the production analysis engine were verified on authentic 720p continuous broadcast video (`Asian Double Men 2026.mp4`, SHA-256: `84160d02...`, 30 FPS) across three 10-minute evaluations (600s / 18,000 source frames decoded / 9,000 analyzed rows at stride 2):

### 10-Minute Durability Metrics

| Metric / Check | Run A: Baseline | Run B: Cancel → Resume | Run C: Process Kill → Resume |
| :--- | :---: | :---: | :---: |
| **Execution Mode** | Uninterrupted continuous | Production cancel @ frame 9,000 | Ungraceful OS `kill()` @ frame 9,000 |
| **Completion Gate** | **PASS** | **PASS** | **PASS** |
| **Recovery Gate** | `NOT APPLICABLE` | **PASS** | **PASS** |
| **Decoded Source Frames** | 18,000 / 18,000 | 18,000 / 18,000 | 18,000 / 18,000 |
| **Canonical Analyzed Rows** | 9,000 / 9,000 | 9,000 / 9,000 | 9,000 / 9,000 |
| **Committed Prefix Retained** | N/A | **True** (100% chunk SHA match) | **True** (100% chunk SHA match) |
| **Duplicate / Reordered Rows** | **0** | **0** | **0** |
| **Frame Index Gaps** | **0** | **0** | **0** |
| **Timestamp Alignment Violations** | **0** (within 1 ns) | **0** (within 1 ns) | **0** (within 1 ns) |
| **Schema / Synthetic Violations** | **0** | **0** | **0** |
| **Invalid Calibration Metric Leaks** | **0** | **0** | **0** |
| **Feet Pixel/Percent Mismatches** | **0** (10,361 checked) | **0** (9,241 checked) | **0** (9,220 checked) |
| **Unknown Transition Gate Leaks** | **0** (69 checked) | **0** (69 checked) | **0** (69 checked) |
| **Wall Clock Elapsed (s)** | 1,845.25 s | 1,845.48 s | 2,127.03 s |
| **Throughput (Wall / Video Time)** | 3.08× (4.88 fps) | 3.08× (4.88 fps) | 3.55× (4.23 fps) |

### Resource Stability & Telemetry
- **Worker Process Max RSS:** Flat at 1,399.46 MB (baseline), 1,409.79 MB (cancel-resume), 1,407.73 MB (process-kill).
- **RSS Drift Trajectory:** Initial 20% median = 1,374.52 MB; Final 20% median = 1,265.28 MB. Memory shows zero upward drift across 9,000 analyzed frames.
- **CUDA VRAM Footprint:** Allocated memory was 41.55–70.51 MB; reserved memory was static at exactly 136.00 MB.
- **Queue Bounds:** All internal buffers (Result Window $\le 128$, Pending Chunks $\le 64$, Semantic Owners $\le 4,096$, Transition History $\le 128$) remained within hard capacity limits throughout all runs.

### 30-Minute and 60-Minute Duration Evaluation
- **Local Media Inventory:** Continuous single-take recordings in local storage are limited to 16m 18s (`Asian Double Men 2026.mp4`), 13m 31s (`Watanabe _ All England 2020.mp4`), and 4m 55s (`Badminton test.mp4`).
- **Audit Finding:** In strict accordance with AGENTS.md Section 3, synthetic looping or artificial concatenation is forbidden. Therefore, 30-minute and 60-minute continuous execution is truthfully classified as **NOT VALIDATED — MISSING_MEDIA**.

---

## 5. Ground Truth Evidence

- **Authoritative Protocol:** Formally defined in `docs/evidence/PHASE_3_GT_PROTOCOL.md`.
- **Current GT Status:** **UNAVAILABLE / NOT QUALIFIED FOR HELDOUT VALIDATION**.
- **Existing Repository GT:** The repository contains a single development-only 1-second sample (frames 180–209) consisting of 20 visible and 10 unknown annotations.
- **Deficiencies Preventing Qualification:**
  1. No recorded primary human reviewer identifier.
  2. No independent second reviewer signature.
  3. Prediction blinding was unrecorded.
  4. Evaluated frames are flagged as development data.
  5. 14 mandatory scenario buckets have 0 qualified held-out coverage.

---

## 6. Accuracy Validation

- **Accuracy Status:** **UNRATED / NOT VALIDATED**.
- **Quality Acceptance Thresholds:** Documented in `docs/evidence/PHASE_3_ACCEPTANCE_THRESHOLDS_PROPOSED.md`. The status is formally set to `PROPOSED_FOR_OWNER_REVIEW`. Under Gate 1 of the safety protocol, unapproved thresholds block certification.
- **Measured Accuracy Metrics:**
  - Ground-Position Error: `null` (no held-out GT)
  - Calibration Reprojection Error: `null` (no held-out GT)
  - Semantic ID Switches vs GT: `null` (no held-out GT)
  - Camera-Cut F1 Score: `null` (no held-out GT)
  - Shuttle Precision / Recall: `null` (no held-out GT)
- **Principle Enforced:** Runtime endurance and contract compliance were validated on real data; accuracy against ground truth remains completely unproven. Accuracy must not be assumed from green runtime tests.

---

## 7. Hardware Validation

| Backend / Hardware | Detected | Verified Pipeline | Direct Real Inference | Audit Status |
| :--- | :---: | :--- | :---: | :---: |
| **NVIDIA GeForce RTX 4050 Laptop GPU** | **YES** | YOLOv8n + YOLOv8n-pose via PyTorch 2.5.1+cu124 (CUDA 12.4), FP32 | **YES** (9,000 frames @ 640px, 0 CPU fallbacks) | **VALIDATED** (for player/pose; shuttle unvalidated) |
| **AMD Radeon(TM) 680M iGPU** | **YES** | Windows PyTorch lacks ROCm for RDNA2 iGPUs; DirectML unconfigured | **NO** (falls back to CPU) | **NOT VALIDATED** (detected only) |
| **AMD Ryzen CPU (AuthenticAMD)** | **YES** | PyTorch CPU / OpenCV DNN reference execution | **YES** (120 real frames smoke, 679 unittests) | **VALIDATED** (functional/smoke scope) |

---

## 8. Capability Matrix

| Capability Category | Specific Feature / Contract | Status Classification | Evidence Basis |
| :--- | :--- | :---: | :--- |
| **Coordinate Space** | Explicit coordinate spaces (`source_pixel`, `normalized_pct`, `court_m`) | **VERIFIED ON FIXTURES** | `test_pose_coordinate_space.py` (23 tests) |
| | Source-frame pixel bounds & scaling | **VALIDATED ON REAL DATA** | 10,361 feet observations in 10m real run |
| | Feet percent conversion accuracy | **VALIDATED ON REAL DATA** | 0 conversion mismatches in 10m real run |
| | Rejection of ambiguous magnitude guessing | **VERIFIED ON FIXTURES** | `ai_service/pose_coordinate_space.py` |
| **Player Ground Point** | Left/right foot contact estimation | **VALIDATED ON REAL DATA** | 10,361 real foot observations |
| | Provenance chain (`pose_both` → `single` → `bbox`) | **VALIDATED ON REAL DATA** | Tracked in real telemetry chunks |
| **Identity & Eligibility** | Semantic `P1`..`P4` separate from MOT `trackId` | **VALIDATED ON REAL DATA** | Verified across 9,000 real frames |
| | Court eligibility gating (spectator rejection) | **VERIFIED ON FIXTURES** | `test_court_eligibility_gating` |
| | Player-outside-court grace handling | **VERIFIED ON FIXTURES** | `test_player_outside_court` |
| | Identity reacquisition after camera cut | **VERIFIED ON FIXTURES** | `test_cut_identity_gate_survives_checkpoint` |
| **Scene & Lifecycle** | Camera cut detection & segmentation | **VALIDATED ON REAL DATA** | 69 transitions detected in 10m video |
| | Metric invalidation on scene transitions | **VALIDATED ON REAL DATA** | 0 transition gate leaks in 10m video |
| **Court Calibration** | Automatic court line detection & homography | **VALIDATED ON REAL DATA** | Executed across 9,000 real frames |
| | Strict multi-line acceptance criteria | **VALIDATED ON REAL DATA** | Correctly rejected ambiguous frames |
| | Zero metric leaks on uncalibrated frames | **VALIDATED ON REAL DATA** | 0 court metric leaks across 9,000 frames |
| | Manual calibration override & recovery | **VERIFIED ON FIXTURES** | `test_manual_calibration_recovery` |
| **Analysis Job Engine** | Uninterrupted 10-minute baseline | **VALIDATED ON REAL DATA** | 9,000 rows completed, 0 errors |
| | Cancel → Restart → Monotonic Resume | **VALIDATED ON REAL DATA** | 100% prefix retained, 9,000 rows completed |
| | Ungraceful Process Kill → Resume | **VALIDATED ON REAL DATA** | Reconstructed WAL, 9,000 rows completed |
| | 30-minute / 60-minute duration runs | **NOT IMPLEMENTED** | `MISSING_MEDIA` (no long source video) |
| | Bounded worker process RAM & VRAM | **VALIDATED ON REAL DATA** | 1.4 GB RSS flat, 136 MB VRAM static |
| **Browser Storage** | Native Chromium IndexedDB multi-store persistence | **VALIDATED ON REAL DATA** | 18 Playwright E2E tests passed |
| | Chunk paging and cursor gap repair | **VALIDATED ON REAL DATA** | Native IndexedDB cursor repair verified |
| | Multi-store atomic transaction rollback | **VALIDATED ON REAL DATA** | Playwright delete rollback verified |
| | Zero synthetic frame leakage to IndexedDB | **VALIDATED ON REAL DATA** | `saveTrackingTelemetryPage` filter verified |
| **Shuttle Tracking** | Temporal TrackNet inference pipeline | **VERIFIED ON FIXTURES** | `test_shuttle_pipeline_integration.py` |
| | Pinned RallyLens model checkpoint | **NOT IMPLEMENTED** | Checkpoint `08b7e904...` missing locally |
| | Real shuttle accuracy evaluation | **NOT IMPLEMENTED** | Blocked by missing model & GT |
| **Acceptance Gates** | Evaluator certification safety gates (1-18) | **VERIFIED ON FIXTURES** | `test_phase3_benchmark_gates.py` (17 tests) |
| | 14 mandatory scenario bucket coverage | **NOT IMPLEMENTED** | 0/14 buckets covered in held-out GT |
| | Owner-approved frozen thresholds | **NOT IMPLEMENTED** | Status: `PROPOSED_FOR_OWNER_REVIEW` |

---

## 9. Known Limitations

1. **Missing Held-Out Ground Truth:** There is zero qualified, dual-reviewed, blinded human ground truth for any of the 14 mandatory scenario buckets.
2. **Unapproved Quality Thresholds:** Thresholds remain in `PROPOSED_FOR_OWNER_REVIEW` status and cannot certify accuracy.
3. **Missing RallyLens Model Artifact:** The pinned TrackNet checkpoint (`08b7e904...`, 45,431,245 bytes) is absent locally; consecutive-frame shuttle tracking cannot execute in production.
4. **Missing 30-Minute and 60-Minute Source Media:** Continuous single-take match footage exceeding 16m 18s is unavailable locally.
5. **No Windows AMD GPU Support:** AMD Radeon 680M integrated graphics cannot be accelerated under PyTorch on Windows.

---

## 10. Experimental / Deferred Capabilities

The following capabilities are classified as explicitly experimental or deferred and do **NOT** block Phase 3 closeout:
1. **AMD ROCm / DirectML Execution:** Optional vendor hardware acceleration. CPU and NVIDIA CUDA satisfy platform requirements.
2. **Consecutive-Frame Full Shuttle Tracking:** TrackNet shuttle tracking is an experimental extension; tracking players and tactical court positions represents the core workstation mission.
3. **Ultra-Long (60-Minute) Endurance Runs:** 10-minute durability on real video demonstrates bounded queues, leak-free memory, and crash resilience. 60-minute runs are deferred until long-take media is provisioned.

---

## 11. Remaining Blockers

To legitimately achieve **PHASE 3 COMPLETE**, the following **MINIMUM MANDATORY BLOCKERS** must be resolved:

1. **Held-Out Ground Truth Acquisition:** Provide independently reviewed, prediction-blinded human Ground Truth for the 14 mandatory scenario buckets in accordance with `docs/evidence/PHASE_3_GT_PROTOCOL.md`.
2. **Quality Threshold Approval:** Obtain product owner review and formal approval to freeze proposed acceptance criteria in `docs/evidence/PHASE_3_ACCEPTANCE_THRESHOLDS_PROPOSED.md` (`thresholds.status = "APPROVED_FROZEN"`).
3. **Scored Held-Out Evaluation:** Execute `ai_service/phase3_benchmark.py` against the certified held-out dataset and prove all mandatory tracking capabilities meet approved thresholds without gate rejection.

---

## 12. Phase 4 Dependency Decision

Separately evaluating whether SportsScout Phase 4 development may commence:

### **MANUAL-ASSISTED PHASE 4 MAY START**

**Engineering Rationale:**
- **Product Architecture Separation:** As defined in Section 1 of `AGENTS.md`, SportsScout is primarily a match scouting, video review, and tactical workstation (`Scout → Review → Analyze → Report`). AI computer vision auto-tracking is a specialized extension (Badminton Tracking Lab), not the foundation of the core workstation.
- **Manual Foundations Complete:** Match scouting, video playback, rally logging, scorekeeping, court click mapping, player rosters, tactical tables, heatmap rendering, export pipelines, and native IndexedDB persistence are fully implemented and verified by 1,005 passing Vitest tests.
- **No Upstream Dependency for Manual Workflows:** Developing Phase 4 manual scoring assistance, tactical coach reporting, and enhanced scout workflows does **NOT** depend on automated computer vision accuracy.
- **Tracking-Dependent Phase 4 Policy:** Any Phase 4 features that strictly depend on automated tracking (e.g., auto-generating stroke logs from computer vision or auto-detecting rally boundaries from player kinematics) **MUST REMAIN BLOCKED** until the Phase 3 accuracy blockers are certified.

---

## 13. Final Verdict

### **PHASE 3 NOT COMPLETE**

**Justification:**  
While the engineering architecture, mathematical coordinate contracts, crash-recovery mechanisms, browser storage durability, and 10-minute real-video runtime endurance are fully **VALIDATED ON REAL DATA**, SportsScout Phase 3 cannot be certified as complete because:
1. Accuracy validation against held-out Ground Truth has not been performed (0/14 scenario buckets covered).
2. Quality acceptance thresholds remain unapproved.
3. In accordance with the non-negotiable rules of this audit, green unit tests, passing CI, and real runtime endurance cannot substitute for empirical accuracy against human Ground Truth.
