# Phase 3 Evidence & Documentation Index

This index provides an authoritative classification of all Phase 3 evidence, evaluation reports, and design documentation across the SportsScout repository.

In accordance with SportsScout engineering rules:
- **Historical integrity is preserved**: historical reports remain unmodified as timestamped records of their respective test cycles.
- **Stale claims are resolved here**: ambiguities in older documents (outdated SHAs, earlier test counts, historical process-kill interruptions, prior lint setups, and shuttle checkpoint availability) are explicitly cross-referenced to current authoritative documents.
- **Evidence levels are strictly enforced**: runtime execution is never conflated with held-out Ground Truth (GT) accuracy.

---

## 1. Classification Taxonomy

Each document or artifact is classified into exactly one category:

| Category | Definition |
| :--- | :--- |
| **CURRENT** | Active, authoritative document reflecting current system contracts, current main baseline (`bf4f5bc15a3ca4e22a4efdf830230692e8038bdc`), and active verification gates. |
| **SUPERSEDED** | Historical handoff or progress report whose conclusions, test counts, or operational states have been superseded by newer completed runs or authoritative audits. |
| **HISTORICAL** | Immutable empirical record, execution protocol, raw telemetry report, or defect reproduction artifact from a specific evaluation run. |
| **NOT VALIDATED** | Declared capability, experimental boundary, or held-out metric where production evidence or independent Ground Truth is currently absent or incomplete. |

---

## 2. Document Master Index

| Document / Artifact | Category | Date / Cycle | Authoritative Reference & Superseding Context |
| :--- | :--- | :--- | :--- |
| [`docs/evidence/PHASE_3_CURRENT_STATUS.md`](file:///c:/Users/sport/OneDrive/Documents/GitHub/Sports-cout-/docs/evidence/PHASE_3_CURRENT_STATUS.md) | **CURRENT** | 2026-10-06 | **Primary Authoritative Status**. Master audit for `main` baseline `bf4f5bc15a3ca4e22a4efdf830230692e8038bdc`. Details Phase 3.3–3.5D statuses, CI status, and blockers. |
| [`docs/evidence/PHASE_3_FINAL_RUNTIME_VALIDATION.md`](file:///c:/Users/sport/OneDrive/Documents/GitHub/Sports-cout-/docs/evidence/PHASE_3_FINAL_RUNTIME_VALIDATION.md) | **CURRENT** | 2026-10-06 | **Authoritative Final Runtime & Durability Audit**. Master validation report covering 10-minute durability (baseline, cancel, kill), resource telemetry, browser IndexedDB storage durability, hardware backend execution (NVIDIA vs AMD vs CPU), and duration checks. |
| [`docs/evidence/PHASE_3_EVIDENCE_INDEX.md`](file:///c:/Users/sport/OneDrive/Documents/GitHub/Sports-cout-/docs/evidence/PHASE_3_EVIDENCE_INDEX.md) | **CURRENT** | 2026-10-06 | **This Document**. Cross-references all Phase 3 evidence and resolves stale historical statements without rewriting history. |
| [`docs/PYTHON_RUNTIME.md`](file:///c:/Users/sport/OneDrive/Documents/GitHub/Sports-cout-/docs/PYTHON_RUNTIME.md) | **CURRENT** | 2026-10-06 | **Python Reproducibility & Hardware Matrix**. Governs reproducible installation (`constraints-tested.txt`, `requirements-cpu.txt`, `requirements-cuda.txt`), hardware validation matrix, and local model weight policies. |
| [`docs/SHUTTLE-RUNTIME-SETUP.md`](file:///c:/Users/sport/OneDrive/Documents/GitHub/Sports-cout-/docs/SHUTTLE-RUNTIME-SETUP.md) | **CURRENT** | 2026-09-24 | **Shuttle Runtime & Model Setup**. Prescribes local explicit installation for RallyLens / TrackNet weights (SHA-256 `08b7e904dae4fd5250d51cd82c4d58d1663351f32037df6aed77547065f026a5`); forbids hidden downloads in production. |
| [`docs/FRONTEND-VERIFICATION.md`](file:///c:/Users/sport/OneDrive/Documents/GitHub/Sports-cout-/docs/FRONTEND-VERIFICATION.md) | **CURRENT** | 2026-10-02 | **Frontend Contract & Lab Verification Guide**. Details verification steps for Badminton Tracking Lab and review workstation UI. |
| [`docs/evidence/PHASE_3_HANDOFF_ANTIGRAVITY_2026-10-05.md`](file:///c:/Users/sport/OneDrive/Documents/GitHub/Sports-cout-/docs/evidence/PHASE_3_HANDOFF_ANTIGRAVITY_2026-10-05.md) | **SUPERSEDED** | 2026-10-05 | **Superseded by `PHASE_3_CURRENT_STATUS.md`**. Written while long-video execution was in progress. Stale branch reference (`feat/phase-three-camera-cut`), stale baseline SHA (`06d5482b...`), and interrupted `process_kill` note superseded by completed retry. |
| [`docs/evidence/PHASE_3_REAL_EVALUATION_2026-10-05.md`](file:///c:/Users/sport/OneDrive/Documents/GitHub/Sports-cout-/docs/evidence/PHASE_3_REAL_EVALUATION_2026-10-05.md) | **HISTORICAL** | 2026-10-05 | **Empirical Evaluation Log**. Documents PTS zero-origin defect reproduction, 5s CUDA smoke, 8s CPU smoke, and 10m baseline/cancel/retry evaluations. |
| [`docs/evidence/phase3-real-2026-10-05-10min-report.json`](file:///c:/Users/sport/OneDrive/Documents/GitHub/Sports-cout-/docs/evidence/phase3-real-2026-10-05-10min-report.json) | **HISTORICAL** | 2026-10-05 | **10-Minute Baseline & Cancel/Restart Data**. 18,000 real source frames (600s), 9,000 analyzed observations on RTX 4050. Zero contract violations. |
| [`docs/evidence/phase3-real-2026-10-05-10min-protocol.json`](file:///c:/Users/sport/OneDrive/Documents/GitHub/Sports-cout-/docs/evidence/phase3-real-2026-10-05-10min-protocol.json) | **HISTORICAL** | 2026-10-05 | **Frozen Protocol Definition**. Frozen parameters, model SHA, media SHA-256 (`84160d02...`), package hashes for the 10-minute evaluation. |
| [`docs/evidence/phase3-real-2026-10-05-10min-contracts.json`](file:///c:/Users/sport/OneDrive/Documents/GitHub/Sports-cout-/docs/evidence/phase3-real-2026-10-05-10min-contracts.json) | **HISTORICAL** | 2026-10-05 | **Contract Verifier Output**. Offline verification report confirming 0 schema, ordering, or prefix retention failures for baseline/cancel passes. |
| [`docs/evidence/phase3-real-2026-10-05-10min-process-kill-report.json`](file:///c:/Users/sport/OneDrive/Documents/GitHub/Sports-cout-/docs/evidence/phase3-real-2026-10-05-10min-process-kill-report.json) | **HISTORICAL** | 2026-10-05 | **Process-Kill Retry Evaluation Data**. Sibling run (`long-10min-process-kill-retry`) recovering from ungraceful kill after frame 9,000 to frame 18,000. |
| [`docs/evidence/phase3-real-2026-10-05-10min-process-kill-contracts.json`](file:///c:/Users/sport/OneDrive/Documents/GitHub/Sports-cout-/docs/evidence/phase3-real-2026-10-05-10min-process-kill-contracts.json) | **HISTORICAL** | 2026-10-05 | **Process-Kill Retry Contract Verification**. Confirms zero contract violations, perfect prefix retention, and correct monotonic recovery. |
| [`docs/evidence/phase3-real-2026-10-05-timestamp-reproduction.json`](file:///c:/Users/sport/OneDrive/Documents/GitHub/Sports-cout-/docs/evidence/phase3-real-2026-10-05-timestamp-reproduction.json) | **HISTORICAL** | 2026-10-05 | **Timestamp Defect Reproduction**. Empirical decoder evidence on 22 samples establishing zero-PTS vs fallback offset fix. |
| [`docs/evidence/phase3-real-2026-10-05-cuda-smoke-report.json`](file:///c:/Users/sport/OneDrive/Documents/GitHub/Sports-cout-/docs/evidence/phase3-real-2026-10-05-cuda-smoke-report.json) | **HISTORICAL** | 2026-10-05 | **CUDA Smoke Report**. 5-second real inference on NVIDIA RTX 4050 Laptop GPU (driver 577.09, CUDA 12.4). Provenance CUDA/FP32. |
| [`docs/evidence/phase3-real-2026-10-05-cpu-smoke-report.json`](file:///c:/Users/sport/OneDrive/Documents/GitHub/Sports-cout-/docs/evidence/phase3-real-2026-10-05-cpu-smoke-report.json) | **HISTORICAL** | 2026-10-05 | **CPU Smoke Report**. 8-second real inference on CPU (Torch 2.5.1+cpu). 120 observations, zero contract violations. |
| [`docs/evidence/phase3-real-2026-10-05-readiness.json`](file:///c:/Users/sport/OneDrive/Documents/GitHub/Sports-cout-/docs/evidence/phase3-real-2026-10-05-readiness.json) | **HISTORICAL** | 2026-10-05 | **Hardware & Media Readiness Manifest**. Records source media hash, GPU specs, local model hashes, and held-out qualification status. |
| [`docs/evidence/phase3-analysis-job-10min-attempt.json`](file:///c:/Users/sport/OneDrive/Documents/GitHub/Sports-cout-/docs/evidence/phase3-analysis-job-10min-attempt.json) | **SUPERSEDED** | 2026-10-04 | **Superseded by 2026-10-05 Run**. Initial test attempt of analysis job duration; superseded by `phase3-real-2026-10-05-10min-report.json`. |
| [`docs/evidence/phase3-analysis-job-short-real.json`](file:///c:/Users/sport/OneDrive/Documents/GitHub/Sports-cout-/docs/evidence/phase3-analysis-job-short-real.json) | **HISTORICAL** | 2026-10-04 | **Short Real Verification**. Early integration run verifying chunking, cursor, and journal durability. |
| [`docs/evidence/phase3-analysis-job-python-baseline.json`](file:///c:/Users/sport/OneDrive/Documents/GitHub/Sports-cout-/docs/evidence/phase3-analysis-job-python-baseline.json) | **SUPERSEDED** | 2026-10-04 | **Superseded Test Counts**. Recorded 604 passing Python unit tests; superseded by current suite (662 tests). |
| [`docs/evidence/phase3-analysis-job-working-tree-python.json`](file:///c:/Users/sport/OneDrive/Documents/GitHub/Sports-cout-/docs/evidence/phase3-analysis-job-working-tree-python.json) | **SUPERSEDED** | 2026-10-04 | **Superseded Test Counts**. Recorded 648 passing tests; superseded by current suite (662 tests). |
| [`docs/evidence/phase3-analysis-job-frontend-verification.json`](file:///c:/Users/sport/OneDrive/Documents/GitHub/Sports-cout-/docs/evidence/phase3-analysis-job-frontend-verification.json) | **HISTORICAL** | 2026-10-04 | **Frontend Component Verification**. Records UI component test suites for analysis job recovery and status indicators. |
| [`docs/PHASE-3.0-calibration-contract.md`](file:///c:/Users/sport/OneDrive/Documents/GitHub/Sports-cout-/docs/PHASE-3.0-calibration-contract.md) | **HISTORICAL** | 2026-09-28 | **Design Contract**. Specification for Phase 3.0 auto court calibration and camera transition invalidation. |
| [`docs/PHASE-3.1-camera-cut-safety.md`](file:///c:/Users/sport/OneDrive/Documents/GitHub/Sports-cout-/docs/PHASE-3.1-camera-cut-safety.md) | **HISTORICAL** | 2026-09-29 | **Design Contract**. Specification for scene segment classification, cut detection, and cross-segment metric invalidation. |
| [`docs/PHASE-3.4-analysis-job-handoff.md`](file:///c:/Users/sport/OneDrive/Documents/GitHub/Sports-cout-/docs/PHASE-3.4-analysis-job-handoff.md) | **HISTORICAL** | 2026-09-30 | **Design Handoff**. Architecture for durable cursor, chunk storage, journal, and resume capabilities. |
| [`docs/PHASE-3-remaining-findings-handoff.md`](file:///c:/Users/sport/OneDrive/Documents/GitHub/Sports-cout-/docs/PHASE-3-remaining-findings-handoff.md) | **HISTORICAL** | 2026-10-01 | **Resolution Log**. Records resolutions for findings R01–R06 in camera-cut safety and calibration. |
| [`docs/DETECTION-RUNTIME-AUDIT.md`](file:///c:/Users/sport/OneDrive/Documents/GitHub/Sports-cout-/docs/DETECTION-RUNTIME-AUDIT.md) | **HISTORICAL** | 2026-09-23 | **Audit Log**. Evaluation of YOLO detection and ByteTrack MOT tracking runtime limits. |
| [`docs/benchmarks/PHASE_3_ANNOTATION_PLAN.md`](file:///c:/Users/sport/OneDrive/Documents/GitHub/Sports-cout-/docs/benchmarks/PHASE_3_ANNOTATION_PLAN.md) | **CURRENT** | 2026-09-25 | **Held-Out Annotation Protocol**. Governs requirements for independent Ground Truth qualification, dual-reviewer agreement, and held-out test splits. |

---

## 3. Resolution of Stale Historical Statements

Historical documents contain statements that were accurate when written but have since been superseded by engineering progress. These statements are reconciled below:

### 3.1. 10-Minute Long-Video Durability Status
- **Stale Statement**: In `PHASE_3_HANDOFF_ANTIGRAVITY_2026-10-05.md` (lines 8, 24–46), `process_kill` was noted as `INTERRUPTED_BY_USER` at frame 1,067 / cursor 512, with instructions not to mark it PASS.
- **Current Authoritative Resolution**: The original interrupted run is preserved as `INTERRUPTED_BY_USER` in `long-10min`. A dedicated sibling retry run (`long-10min-process-kill-retry`) executed to completion (18,000 source frames, 9,000 observations), recovering monotonically from an abrupt process termination at frame 9,000 with zero duplicate rows, zero order inversions, full committed prefix retention, and 0 contract violations. Uninterrupted baseline, cancel/restart, and process-kill recovery are classified as **VALIDATED ON REAL DATA** for 10 minutes. See [`docs/evidence/phase3-real-2026-10-05-10min-process-kill-report.json`](file:///c:/Users/sport/OneDrive/Documents/GitHub/Sports-cout-/docs/evidence/phase3-real-2026-10-05-10min-process-kill-report.json) and [`docs/evidence/phase3-real-2026-10-05-10min-process-kill-contracts.json`](file:///c:/Users/sport/OneDrive/Documents/GitHub/Sports-cout-/docs/evidence/phase3-real-2026-10-05-10min-process-kill-contracts.json).

### 3.2. ESLint Configuration and Baseline Debt
- **Stale Statement**: Older progress logs described ESLint either as having unaddressed warnings or as passing without qualifying the baseline.
- **Current Authoritative Resolution**: In accordance with the CI/tooling audit rules, repository linting is governed by `node scripts/lint-with-baseline.mjs`. It passes with zero new debt against the established debt baseline. The official evidence classification is **PASS WITH BASELINE DEBT**. It must never be represented as "lint clean".

### 3.3. Shuttle Checkpoint & Local Model Weights
- **Stale Statement**: Older documents noted RallyLens / TrackNet as "unavailable" or "failed to initialize" due to missing checkpoint weights in Git.
- **Current Authoritative Resolution**: In accordance with project policy, binary model checkpoints are never committed to Git. The authoritative setup is specified in [`docs/SHUTTLE-RUNTIME-SETUP.md`](file:///c:/Users/sport/OneDrive/Documents/GitHub/Sports-cout-/docs/SHUTTLE-RUNTIME-SETUP.md) and [`docs/PYTHON_RUNTIME.md`](file:///c:/Users/sport/OneDrive/Documents/GitHub/Sports-cout-/docs/PYTHON_RUNTIME.md). Model weights (`tracknet_best.pt`) are explicitly placed locally in `.local-models/` and verified against SHA-256 `08b7e904dae4fd5250d51cd82c4d58d1663351f32037df6aed77547065f026a5`. Automated hidden downloads during analysis are strictly forbidden. The provider architecture is **IMPLEMENTED / VERIFIED ON FIXTURES**; full held-out accuracy on real matches remains **NOT VALIDATED**.

### 3.4. Git Baseline and Branch References
- **Stale Statement**: Historical documents cite development branches such as `feat/phase-three-camera-cut` and intermediate commits (`06d5482b...`, `0856ba06...`).
- **Current Authoritative Resolution**: The audited and verified main HEAD is `bf4f5bc15a3ca4e22a4efdf830230692e8038bdc`. All Phase 3 final engineering remediation is committed on `fix/phase3-final-remediation` branching directly from `bf4f5bc15a3ca4e22a4efdf830230692e8038bdc`.

### 3.5. Outdated Test Counts
- **Stale Statement**: Early logs cite 604 or 648 passing Python unit tests.
- **Current Authoritative Resolution**: The current Python test suite comprises **662 unit and contract tests** across 28 test modules in `ai_service/tests/`, achieving 100% pass (662 passed, 4 skipped) on both NVIDIA CUDA and CPU environments. Frontend Vitest comprises **1,004 unit/integration tests** across 105 test files.

### 3.6. Environment-Sensitive GPU Test Setup
- **Stale Statement**: `PHASE_3_HANDOFF_ANTIGRAVITY_2026-10-05.md` (lines 83–84) recorded: *"The CUDA Python suite has one known environment-sensitive existing failure because a test assumes CUDA is unavailable; the isolated CUDA_VISIBLE_DEVICES=-1 case passes. Report this rather than changing the test."*
- **Current Authoritative Resolution**: Remediated under Task B without weakening assertions. The test suites (`test_device_selection.py`, `test_tracking_session.py`, `test_analyzer.py`) now explicitly mock and isolate device availability for both cases:
  - **Case 1**: CUDA available → verifies CUDA selection and device report.
  - **Case 2**: CUDA simulated unavailable (`device_runtime._availability` mocked, `analyzer.device = "cpu"`) → verifies CPU fallback behavior and report.
  The entire suite now passes identically with or without physical CUDA hardware.

---

## 4. Hardware and Capability Qualification Summary

| Hardware / Capability | Evidence State | Notes |
| :--- | :--- | :--- |
| **NVIDIA CUDA 12.4 (RTX 4050)** | **VALIDATED ON REAL DATA** | Validated on 18,000 real frames (10m) using PyTorch 2.5.1+cu124. FP32 tensors, zero fallbacks. |
| **CPU (Torch 2.5.1+cpu)** | **VALIDATED ON REAL DATA** | Validated on real video smoke (8s, 120 obs) and contract suites. Reference execution engine. |
| **AMD GPU Acceleration** | **NOT VALIDATED (DETECTED ONLY)** | WMI/Vulkan queries detect AMD hardware (e.g. Radeon 780M), but no ROCm/DirectML/PyTorch AMD backend is validated. |
| **10-Minute Durability** | **VALIDATED ON REAL DATA** | Uninterrupted baseline, cancel/restart, and process-kill recovery verified on 18,000 real frames. |
| **30-Minute / 60-Minute Durability** | **NOT IMPLEMENTED** | No real video sources of this length exist in the benchmark cache. |
| **Held-Out GT Accuracy** | **NOT VALIDATED** | All 14 held-out quality buckets remain unvalidated due to absence of multi-reviewer real Ground Truth. |
| **Human Correction Persistence** | **NOT VALIDATED** | Unit tested on fixtures, but no live human corrections have been recorded on long real tracking sessions. |
