# Bounded Analysis Job Recovery

## Goal

Bound long-session memory and persist enough backend job/result state to detect interruption, page committed results, and resume from an explicit safe boundary without claiming exact temporal recovery when analyzer state cannot be restored.

## Scope and constraints

- Keep the current CPU shuttle/player pipeline, models, sampling, and runtime dependencies unchanged.
- Reuse local filesystem storage; add no queue, database, or production dependency.
- Keep frontend telemetry bounded and consume server result pages with a maximum size.
- Treat durable chunk sequence/checksum as commit evidence; progress and decoded frame cursor alone are not commits.
- Retain media needed for resume until explicit session deletion.
- Preserve pre-existing unrelated working-tree changes.

## Implementation steps

1. Add a file-backed analysis job store with atomic journal replacement, idempotent bounded result chunks, checksums, committed sequence, cursor paging, recovery inspection, tombstones, and orphan detection.
2. Add store tests first for bounded paging, duplicate/mismatched sequence, checksum/corruption, interrupted journal, and interrupted delete.
3. Integrate the store into tracking session create/upload/config/start/worker/status/results/delete. Persist identity/config/media/calibration and checkpoint metadata, commit results in bounded batches, recover interrupted jobs on startup, and expose cancel/resume/error state. Resume must validate identity and state whether it restores or re-warms temporal state.
4. Add lifecycle/API tests for cancellation, crash/restart, repeated resume, idempotent results, and storage faults. Keep worker concurrency bounded and surface write failures as job errors.
5. Bound frontend session telemetry, consume bounded result pages without scanning full history to deduplicate, and add cursor/index-based IndexedDB chunk reads while retaining persisted data required for recovery.
6. Run focused backend/frontend tests, then repository-mandated TypeScript, ESLint, Vitest, and Python unittest checks. Inspect local real video durations and report 10/30/60-minute evidence only where suitable media exists; report output parity and recovery scope honestly.

## Evidence limits

Synthetic/demo or fixture tests do not count as real-video long-run evidence. Exact resume will not be claimed unless temporal tracker state is demonstrably restored. Any duration without suitable real video remains NOT VALIDATED.
