# Image-space hit-estimation readiness contract

`canEstimateHit` reports whether a future hit estimator has fresh image-space
inputs for the current frame. It is a readiness capability only: it does not
mean that a racket contact or hit was detected, and it does not create a hit,
contact, skill, or statistics record.

Readiness requires at least one player with a current `observed` state, a fresh
non-reused/non-stale COCO pose, known pose coordinate units, in-frame finite
keypoints and measured player confidence. It also requires a shuttle in the
`observed` state with an in-frame finite source-frame pixel position and measured
confidence. Both observations must name the current frame and camera segment.
Predicted/interpolated shuttle positions, stale poses, missing confidence,
unknown units, and mismatched frame/segment provenance leave the capability
unavailable with a reason.

Player poses may use the existing `pixel` or `normalized_percent` coordinate
space labels. Shuttle positions use source-frame pixels. These image-space
inputs do not require a homography. `canUseCourtMetric`, heatmap accumulation,
court position, distance, speed, and zones retain their existing calibration
and measurement gates and cannot be opened by hit readiness.

`UNKNOWN`, `CAMERA_TRANSITION`, and a detected cut fail closed. A cut or segment
mismatch cannot carry evidence across camera segments. Fresh image observations
in a replay may make the readiness capability true, but replay canonical match
writes remain prohibited by `canWriteCanonicalMatchData`.

The gate confidence is derived only from measured player detection, pose
keypoint, and shuttle observation confidences. It is input-evidence confidence,
not a hit/contact probability. The structured `capabilities.canEstimateHit`
gate is canonical. A legacy boolean-only payload cannot prove fresh current-frame
observations, so TypeScript normalization treats it as unavailable. Python
telemetry, TypeScript parsing, and consumers preserve that meaning.
