# Phase 2 final engineering audit — 2026-09-22

Decision: NOT READY for Phase 3. This is an audit of local Phase 2.0–2.6,
including Phase 2.6 commit 51e57ab, not a claim of completed remediation.

## Confirmed blockers

1. `ai_service/shuttle_benchmark.py:258` and the equivalent TypeScript aligner
   accept equal frame indices without verifying timestamps. A reproducible
   example with GT at 0 seconds and prediction at 100 seconds produces recall
   1.0. Duplicate frame indices are silently collapsed by the lookup maps.
2. Missing GT yields false positives/minute 0.0, and uncomputed lost-gap and
   reacquisition counts become zero. Pixel error does correctly remain null.
   These unmeasured values must become unavailable in both implementations.
3. Continuity uses observed state without spatial match; reacquisition accepts
   an observed point without the configured match-distance gate. Sparse samples
   are treated as consecutive frames. Lost duration uses sample count/FPS,
   which is incorrect for irregular/sampled telemetry. Reacquisition frame
   distance uses list indices rather than source frame indices.
4. Manifest evaluation checks an 80% count heuristic, not reviewed unique
   coverage. Fully annotated clips are omitted from the returned results: the
   runner currently only implements the incomplete-dataset branch.
5. Trajectory smoothing is a fixed-weight blend with a time-gap cutoff, not a
   time-scaled filter. Velocity is calculated across long loss. Derived points
   lack segment/break identifiers, so downstream line renderers could bridge
   long gaps. Raw copies are independent, but lists and nested dataclasses are
   mutable; the previous claim of immutable snapshots was incorrect.
6. Recovery prediction is bounded and isolated candidates require confirmation,
   but motion gating is only a permissive displacement/speed bound. Events grow
   without retention limits; attempt count includes initial lock. Exception
   paths can advance input state before inference succeeds.
7. No production worker integration invokes the temporal/recovery/trajectory
   pipeline. Auxiliary detection is an interface, not a shipped model adapter.
   No compatible local temporal ONNX artifact was found in the workspace.

## Corrections made in this audit

Temporal windows previously retained caller-owned image arrays. Reusing one
decode buffer rewrote every stored frame to the newest pixels, destroying
temporal order despite correct indices. The tracker now copies each admitted
frame. It now explicitly requires uint8 BGR input, rejecting NaN/float/object
frames before inference. Two regression tests reproduced the old failures and
pass after the fixes. Frame count remains bounded by configured window size.

## Contract, geometry and UI

Canonical lost/unknown validation rejects positions, including fake zeroes;
predicted and interpolated states remain distinct. Image coordinates remain the
authoritative shuttle position. No shuttle court homography use was found.
Pixel velocity is labelled px/sec, not physical m/s.

UI marks observed/predicted/interpolated distinctly, hides lost/stale current
points, uses canonical time and bounds visible trail to 0.6 seconds/60 samples.
Old sessions remain safe. Model, longest loss and reacquisition diagnostics are
placeholders because those fields are not transported. No real-model browser
acceptance is possible with the current production integration. Source-based
and unit-test verification is not a substitute for visual acceptance.

## Dataset and accuracy

Bundled S01 has five sample annotations for an expected 450 frames; S02–S05
have no frame annotations. This is not a validated GT dataset. The user-provided
Badminton test.mp4 decoded in the preceding phase (30 FPS, 8869 frames), but is
not a reviewed benchmark dataset. Visible recall, false positives, mean/median/
P95 error, continuity, loss and reacquisition quality are all UNAVAILABLE for
real inference. Error normalization uses pixel error / image diagonal in both
languages; percentile interpolation is conventional for valid finite inputs.

## Performance and test quality

Frame storage is O(window size); copying now makes ownership safe but has a
per-frame memory-bandwidth cost. Model CPU/GPU load is unmeasured. Trajectory
processing copies the whole history; recovery events grow with the session.
Overlay/diagnostics filter whole history on video frame updates, so bounded
visible trails do not imply bounded CPU work. One-hour performance is untested.

Existing tests cover null-versus-zero, state provenance, stale overlay hiding,
short interpolation, isolated candidate rejection and raw-copy preservation.
They do not protect against all benchmark alignment/coverage/continuity defects
above. Passing tests therefore do not establish readiness.

## Validation

- Frontend: 852 tests passed across 92 files.
- Python after fixes: 330 tests passed, including tracking, shuttle, benchmark,
  pose, tracker/ReID and runtime tests. Hardware/model cases are not equivalent
  to real GPU or shuttle accuracy measurements.
- TypeScript: npm run lint (tsc --noEmit) passed.
- ESLint: local binary/config unavailable; not claimed passed.
- Production build: passed; existing large-chunk/empty-vendor warnings remain.
- Browser: Playwright full suite and targeted Labs acceptance invoked; no
  completed browser acceptance result obtained. This remains a validation gap.

Phase 0/1 unit regression suites pass and no player engine files were modified.
Phase 3 remains blocked by correctness findings, model/integration readiness,
reviewed GT coverage, and browser/performance validation. No Phase 3 work began.
