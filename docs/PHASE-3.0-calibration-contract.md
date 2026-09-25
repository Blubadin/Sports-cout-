# Phase 3.0: court calibration contract

SportsScout extends `TrackingTelemetryV1` (`schemaVersion: 1`) with optional temporal calibration fields. Older V1 frames and saved analyses remain readable. New production frames carry `cameraSegmentId`, `calibrationId`, `calibrationState`, `calibrationConfidence`, and a validated `calibration` provenance object. A calibration belongs to one camera segment. Every accepted calibration receives a new ID, including a correction in the same segment.

The states are `UNCALIBRATED`, `CALIBRATED`, `CALIBRATION_LOST`, and `RECALIBRATING`. The provenance source is `manual`, `automatic`, or `corrected`, with the frame and video timestamp at acceptance. Manual four-corner calibration reports `confidence: null` and `reprojectionErrorPx: null`; four selected corners alone do not establish an accuracy estimate.

`start_camera_segment()` is an explicit future integration hook. It creates a new segment ID, invalidates `CourtMapper.H` and `H_inv`, clears the active calibration ID, and pauses metric tracking. This phase does not detect cuts or perform dynamic homography updates.

For new temporal telemetry, only a frame with valid `CALIBRATED` provenance and matching segment/calibration IDs may produce court coordinates, mapped speed, or metric zones. During other states those fields and current calibration confidence are null. Historical quality remains in provenance for a lost calibration in the same segment. Previously accumulated distance remains available but does not increase; before any metric observation it is null. Image-space boxes, 2D poses, MOT IDs, and shuttle observations continue independently. Raw image observations are not rewritten when calibration changes. Browser conversion repeats the metric gate before display or storage.

IndexedDB keeps calibration transitions in `TrackingAnalysis.calibrationTimeline`, and metric samples retain segment and calibration IDs. Metric movement summaries do not bridge across an invalid interval or a calibration change. Legacy analyses lack the optional timeline and continue loading without migration.

The existing IndexedDB analysis format stores metric samples, not full frame telemetry. Image-space boxes, poses, MOT IDs, and shuttle observations remain in the live/results telemetry stream during calibration loss; this phase does not add raw-frame persistence.

The existing `engineVersion` and `modelVersion` telemetry fields remain in place. Session `runtimeProvenance` already identifies detector, tracker, pose, ReID, and shuttle models; saved analysis model fields now copy that provenance rather than hard-coded labels. A second model bundle field would duplicate this information.
