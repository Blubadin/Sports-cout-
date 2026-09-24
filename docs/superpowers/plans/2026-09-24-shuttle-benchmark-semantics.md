# Phase 2.10B Shuttle Benchmark Semantics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Correct Python and TypeScript shuttle benchmark evaluation so identifiers, completeness, spatial correctness, temporal continuity, reacquisition, and manifest results remain measured and honest.

**Architecture:** Keep the existing public evaluator entry points, but add shared semantic helpers in each implementation for duplicate validation, strict frame/timestamp alignment, spatial matching, and source-frame adjacency. Accuracy-dependent values become nullable when the dataset cannot measure them; state/runtime metrics remain measurable. The manifest runner evaluates every clip and reports `COMPLETE` or `GROUND TRUTH DATASET INCOMPLETE` explicitly.

**Tech Stack:** Python standard library/unittest, TypeScript, Vitest, existing shuttle benchmark schema and telemetry types.

## Global Constraints

- UNKNOWN / UNMEASURED != ZERO.
- When frameIndex and timestamp are both present, conflicting identifiers must not match.
- Duplicate GT/prediction frame keys must fail deterministically; they must never be silently collapsed.
- Spatial accuracy uses a configured pixel or normalized tolerance; observed state alone is insufficient.
- Continuity, lost duration, and reacquisition use source frame/time values, never array position.
- Python and TypeScript semantics remain equivalent.
- Do not modify neural model, player tracker, semantic identity, court mapper, Scout events, or Phase 3 systems.

---

### Task 1: Add failing semantic regression tests

**Files:**
- Modify: `ai_service/tests/test_shuttle_benchmark.py`
- Modify: `src/__tests__/badminton/shuttleBenchmark.test.ts`
- Modify: `ai_service/tests/test_shuttle_benchmark_protocol.py`

- [x] Add tests for timestamp conflict at the same frame, timestamp-within-tolerance matching, duplicate GT/prediction keys, missing GT nullable accuracy, measured zero false positives, wrong/correct spatial candidates, sparse source frames, irregular lost timestamps, true/false reacquisition, complete/incomplete manifest results, and finite outputs.
- [x] Run the focused Python and Vitest tests and confirm the new assertions fail against the current evaluator.

### Task 2: Correct Python evaluator and manifest runner

**Files:**
- Modify: `ai_service/shuttle_benchmark.py`
- Modify: `ai_service/shuttle_benchmark_schema.py`

- [x] Add deterministic duplicate-key validation and strict same-frame timestamp matching; conflicting frame indices do not pair by timestamp.
- [x] Use a default 30 px spatial tolerance plus optional normalized tolerance, and require spatially valid observed predictions for TP, continuity, and reacquisition.
- [x] Restrict continuity/lost-gap transitions to adjacent source frame indices and derive lost duration from timestamps or trusted FPS/frame indices.
- [x] Return nullable accuracy/reacquisition fields for incomplete GT and keep measured zeros for complete GT.
- [x] Make `run_benchmark_on_manifest` emit a result for every clip, including complete clips evaluated with supplied predictions or explicit empty predictions.

### Task 3: Mirror semantics in TypeScript

**Files:**
- Modify: `src/types/shuttleBenchmark.ts`
- Modify: `src/utils/shuttleBenchmark.ts`
- Modify: `src/benchmarks/shuttleBenchmarkManifest.ts`

- [x] Mirror Python config defaults, nullable accuracy fields, duplicate handling, alignment, spatial matching, source adjacency, lost duration, and reacquisition behavior.
- [x] Update report formatting to render unavailable values as `N/A` without coercing them to zero.
- [x] Validate duplicate ground-truth frame indices in manifest validation.

### Task 4: Verification and commit

**Files:**
- Modify: only the files above and the plan document.

- [x] Run targeted Python benchmark tests and targeted TypeScript benchmark tests.
- [x] Run Python full test suite, TypeScript checks, Vitest, and production build required by `AGENTS.md`. (No ESLint executable/script is configured in this checkout.)
- [x] Inspect `git diff --check` and ensure unrelated pre-existing changes remain untouched.
- [ ] Commit exactly `fix(shuttle): correct benchmark semantics` and report the SHA.
