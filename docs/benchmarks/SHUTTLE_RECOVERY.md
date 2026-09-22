# Phase 2.3 shuttle recovery

Construct `RecoveringShuttleTracker(temporal, auxiliary, RecoveryConfig(...))`
and feed ordered native video frames through `process_frame`. This is a Python
pipeline entry point; no player engine or UI integration is changed.

The auxiliary provider is optional and family-independent. Its `detect` method
receives the image, timestamp, frame index and an image-space search rectangle
(or None for full frame). Returned candidate coordinates must always refer to
the full image. Implementations must report unavailable models explicitly.
No detector implementation or external weights are bundled in this phase.

Control states are distinct from canonical observation states:

- Initial LOST has unknown telemetry until lock is confirmed.
- TRACKING accepts a current temporal measurement above the confidence threshold
  and within a configurable speed-plus-position-tolerance gate.
- One rejected/missing measurement enters WEAK. Three consecutive failures enter
  LOST and emit lostStart. A reliable temporal measurement can restore WEAK.
- LOST candidates enter REACQUIRING. Two consecutive, spatially consistent
  measurements confirm lock; missing evidence clears the pending candidate.
  Frame gaps break confirmation. Temporal evidence is preferred; auxiliary
  evidence is used when temporal evidence is absent.
- Auxiliary lock retains auxiliary_detector provenance. Subsequent temporal
  measurements carry temporal_tracker provenance.

WEAK predictions require two accepted observations and use constant image-space
velocity. They are explicitly predicted and limited to both two frames and
100 ms since the last measurement. Out-of-image predictions are rejected.
LOST and pending reacquisition have null positions. Predictions never confirm
candidates or refresh history.

Auxiliary search uses a 160 px radius around recent reliable coordinates, then
full frame after 300 ms since the last reliable observation. All thresholds are
configurable baseline heuristics; they require validation on real footage.

`metrics()` exposes control state, auxiliary calls, candidate-sequence attempts
(including initial lock), and events. lostEnd records lostStart, lostEnd,
lostDuration and reacquisitionTime in seconds (both measured from entry to LOST),
reacquisitionSource and cumulative attempt count. An unfinished loss has no
invented end or duration. `end_stream()` closes the pipeline without fabricating
an observation or recovery event. Runtime/model errors propagate explicitly.

Local video Badminton test.mp4 was found and decoded (30 FPS, 8869 frames).
No compatible temporal ONNX artifact is configured locally, so real shuttle
inference and accuracy evaluation remain unavailable. Deterministic provider
fixtures test control logic only and are not production detections.
