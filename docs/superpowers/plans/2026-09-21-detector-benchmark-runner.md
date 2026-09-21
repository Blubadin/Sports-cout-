# Detector Benchmark Runner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and validate a repeatable local runner for the fixed Phase 1.3 detector benchmark matrix without fabricating unavailable results.

**Architecture:** A focused Python CLI composes the existing manifest, detector registry, configurable engine, and Phase 0 benchmark schema. An injectable single-run executor isolates orchestration from heavy inference, while JSON and CSV writers preserve complete and sortable results.

**Tech Stack:** Python standard library, existing OpenCV/Ultralytics tracking pipeline, `unittest`, JSON, CSV.

## Global Constraints

- Use current local files only; do not fetch GitHub.
- Keep clips, tracker, semantic identity, calibration, threshold, pose configuration, stride, runtime, and device constant.
- Vary only detector model and input size across the prescribed nine configurations.
- Do not add 1280, new model families, ReID changes, TensorRT, shuttle tracking, pose benchmarking, or a detector winner.
- Preserve missing values as `None`/`null`; never fabricate video, quality, performance, ground-truth, or VRAM measurements.
- Produce exactly one final commit named `feat(tracking): add detector benchmark runner`.

---

### Task 1: Deterministic Matrix and Result Contracts

**Files:**
- Create: `ai_service/tests/test_benchmark_runner.py`
- Create: `ai_service/benchmark_runner.py`

**Interfaces:**
- Produces: `build_detector_matrix(common: BenchmarkCommonConfig) -> list[BenchmarkRunConfig]`
- Produces: serializable run configuration and result dataclasses with explicit nullable metrics.

- [ ] Write failing tests asserting the exact nine detector/input-size pairs, stable ordering, common-variable equality, required identity fields, and preservation of measured zero versus missing values.
- [ ] Run `python -m unittest ai_service.tests.test_benchmark_runner -v` and confirm failures because the runner module is absent.
- [ ] Implement the minimum dataclasses and matrix builder using the existing candidate registry.
- [ ] Re-run the targeted test and confirm the matrix/contract tests pass.

### Task 2: Failure-Isolated Orchestration

**Files:**
- Modify: `ai_service/tests/test_benchmark_runner.py`
- Modify: `ai_service/benchmark_runner.py`

**Interfaces:**
- Consumes: manifest clips, deterministic configurations, candidate availability checks, and an injected `execute_one` callable.
- Produces: `run_benchmark_matrix(...) -> BenchmarkBundle` containing all successful, failed, and unavailable attempts.

- [ ] Add failing tests where one executor call raises, a model is unavailable, and later configurations still complete.
- [ ] Run the targeted test and confirm the missing orchestration behavior fails.
- [ ] Implement clip resolution, availability classification, per-run exception capture, and continuation.
- [ ] Re-run the targeted tests and confirm all attempts remain represented.

### Task 3: Real Pipeline Metrics and Persistence

**Files:**
- Modify: `ai_service/tests/test_benchmark_runner.py`
- Modify: `ai_service/benchmark_runner.py`

**Interfaces:**
- Produces: `execute_tracking_run(...)` using the existing analyzer and Phase 0 metric semantics.
- Produces: `save_benchmark_bundle(...)` and `load_benchmark_bundle(...)` for JSON plus a flat comparison CSV.

- [ ] Add failing tests for JSON reload, CSV comparison fields, nullable metrics, and the explicit no-dataset result.
- [ ] Run the targeted test and confirm persistence behavior is absent.
- [ ] Implement the existing-pipeline adapter, honest metric extraction, optional measured CUDA peak memory, atomic JSON writing, and CSV generation.
- [ ] Re-run targeted tests and confirm persistence and no-dataset behavior pass.

### Task 4: CLI, Documentation, and Full Verification

**Files:**
- Modify: `ai_service/benchmark_runner.py`
- Modify: `.gitignore`
- Modify: `docs/benchmarks/VISION_BENCHMARK_PROTOCOL.md`

**Interfaces:**
- Produces: `python ai_service/benchmark_runner.py --manifest ... --output-dir ...`.

- [ ] Add a CLI test for manifest loading, selection filters, deterministic output directory handling, and no automatic 1280 configuration.
- [ ] Implement the CLI and document its local-only usage and result schema.
- [ ] Run targeted runner tests first.
- [ ] If all referenced clips exist locally, execute the configured matrix; otherwise report `BENCHMARK DATASET NOT AVAILABLE LOCALLY` and do not fabricate results.
- [ ] Run the full Python suite, frontend suite, lint/TypeScript validation, and production build.
- [ ] Inspect `git diff --check` and staged scope, then create the single required commit.
