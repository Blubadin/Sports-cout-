# Reviewed real-video shuttle check (2026-09-24)

Source: `Asian Double Men 2026.mp4`, local-only, SHA-256
`84160d026a350716e227cb2f6f4c4c3d35cf52ab6aac6977d8e787b0299a6817`.
The broadcast is 1280×720 at 30 FPS, from a fixed elevated end-court camera.
The rally context was reviewed around 6–10 seconds; the complete annotation
scope is **only source frames 180–209 (6.000–6.967 seconds)**. The 1-second
scope is shorter than the preferred 5–10 seconds so that every source frame in
the evaluated interval can be marked and benchmark completeness stays honest.
The metadata lives in `src/benchmarks/reviewedRealShuttleGt.json`; no video or
frame images are committed.

The 30 frames were reviewed visually from decoded originals and enlarged
crops before examining RallyLens outputs. A video-frame motion-difference list
helped locate the moving bright object, but the neural-model predictions did
not supply the annotations. Twenty frames have manually reviewed approximate
centroids (~5 px review uncertainty). Ten frames where the shuttle could not
be confidently located are `unknown`, never `not_visible` or fake `(0,0)`.
The clearly visible white object rises from about (520,80) to (517,18) and
descends to (521,58), matching the overhead play; this is moving image evidence,
not a fixed graphic.

RallyLens checkpoint SHA-256
`08b7e904dae4fd5250d51cd82c4d58d1663351f32037df6aed77547065f026a5`
ran as the real CPU/FP32, 9-frame production-compatible shuttle pipeline.
Frames 172–179 warmed the temporal window. It decoded 38 source frames, made
30 real forward inference calls, and used no synthetic provider. The pinned
input/output tensor contracts were `[1,27,288,512]` and `[1,8,288,512]`.

Phase 2.10B evaluator at 30 px match tolerance for this **one complete
interval**: 20 TP, 0 FP, 0 FN, visible-frame recall 1.0, conditional precision
1.0, mean/median/P95 pixel error 2.78/1.71/6.22 px. Spatial track continuity
was 1.0 over the 20 visible frames. The model emitted 27 observed, 2 lost,
and 1 unknown states; seven observed states fell on `unknown` GT frames and
were *not* scored as true or false positives. There was no reviewed
`not_visible` frame, so absent-shuttle false-positive behavior is **not
measured** by these aggregate metrics. No reacquisition event was present;
latency is unavailable. These values must not be generalized to the match.

The replay took 69.452 seconds for the 30 inference calls plus temporal
warm-up/decode, 0.432 inference calls per wall-clock second and a 0.0144×
real-time ratio; mean inference time was 2304.47 ms. GPU was not validated.

Separate from the scored GT interval, a direct real-model replay of source
frames 499–508 found `observed` candidates at (150.4,677.5) and (151.0,678.2)
on frames 507–508, with confidences 0.625/0.575. Visual inspection of source
frame 507 places those coordinates inside the lower-left broadcast scoreboard,
not on a shuttle. These are **confirmed broadcast-overlay false positives**,
but they are not inserted into the 1-second GT metric or counted as a measured
whole-match false-positive rate. A longer reviewed sample with explicit
not-visible/occluded frames is needed before claiming broad precision. No
unsafe scoreboard mask or other unvalidated production heuristic was added.

Quality classification: **WORKS WITH SIGNIFICANT LIMITATIONS**. The system
demonstrably detects a genuine moving shuttle in real footage, while the
scoreboard false positive and slow CPU runtime preclude a broad quality claim.
