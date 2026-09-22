# Phase 2.4 provenance-safe shuttle trajectory

`ShuttleTrajectoryBuilder` converts ordered canonical `ShuttleObservation`
records into a `ShuttleTrajectory` containing two separate collections:

- `raw_observations` is a deep-copied snapshot of the source telemetry.
- `points` is derived data for overlays, debug views, and visual trails.

Derived points retain `observed`, `predicted`, or `interpolated` state. Raw
`lost` and `unknown` samples produce no point unless a short, bounded sequence
of missing samples is bracketed by two observed positions. Such points are
labelled `interpolated` and sourced as `model_assisted`.

The default interpolation limit is 120 ms. Gaps beyond that limit have no
derived bridge. Predicted inputs retain their positions and `predicted` state;
they are never relabelled from later evidence.

Smoothing is a conservative, time-aware image-space blend for adjacent observed
points only. It is skipped over larger time gaps and when the raw direction
reverses, preserving abrupt smash acceleration, descent, and net-shot changes.
It never mutates raw telemetry.

`image_space_velocity_px_per_sec` describes pixel motion per second. It is not
physical shuttle speed and must not be presented as metres per second or 3D
kinematics. `analytics.detection_recall_numerator` is based only on raw
`observed` samples; predicted and interpolated points never raise detection
recall.
