# Phase 2.10A — Shuttle trajectory correctness hardening

## Scope

Harden only derived shuttle trajectory processing. Preserve canonical `ShuttleObservation` telemetry and leave the temporal model, player tracking, identity, court mapping, Scout events, and Phase 3 systems unchanged.

## Design

1. Use video-domain timestamps to assign an explicit `segment_id` to each derived point. A valid point starts a new segment when its timestamp gap from the preceding valid point exceeds the configured continuity threshold.
2. Permit interpolation only when both observed endpoints are in the same segment and the endpoint gap is within that threshold.
3. Apply time-aware exponential smoothing within a segment only. Use a configurable time constant and skip smoothing across direction reversals so abrupt evidence-backed changes remain visible.
4. Calculate image-space velocity only for adjacent derived points in the same segment. A segment boundary produces unavailable velocity (`None`), never zero.
5. Keep raw observations deep-copied and immutable from derived processing. Bound only the production pipeline's runtime trajectory working buffer with a deque; canonical per-frame telemetry remains emitted/persisted independently.

## Implementation and verification

- Update `ai_service/shuttle_trajectory.py` with segment identity, time-aware smoothing, safe velocity, and finite-value validation.
- Update `ai_service/shuttle_pipeline.py` with an explicit bounded working-history setting and buffer.
- Add focused trajectory and pipeline regression tests for gaps, velocity, irregular timestamps, provenance, immutability, empty/one-point inputs, and bounded history.
- Run targeted trajectory tests, shuttle Python tests excluding expensive model benchmarks, then TypeScript, frontend tests, build, and the repository-required verification checks.
- Commit with `fix(shuttle): harden trajectory segmentation`.
