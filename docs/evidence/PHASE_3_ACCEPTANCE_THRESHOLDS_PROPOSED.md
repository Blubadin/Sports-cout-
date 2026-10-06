# Phase 3 Proposed Acceptance Thresholds

**STATUS: PROPOSED_FOR_OWNER_REVIEW**
*Note: These are proposed values derived from engineering limits and prior design discussions. They are not approved acceptance criteria. Do not use these values to mark a capability as "PASS" until explicitly approved and frozen by the product owner.*

---

## 1. Court Calibration
**METRIC NAME**: Calibration Reprojection Error
- **DEFINITION**: Average pixel distance between model-estimated court corners and human-reviewed corner locations when calibration is `VALID`.
- **UNIT**: Pixels (px)
- **MATCHING RULE**: Euclidean distance in 720p image space.
- **RATIONALE**: Ensures the camera matrix maps player tracking coordinates to the tactical 2D court without tactical distortion.
- **PROPOSED THRESHOLD**: ≤ 12.0 px
- **HARD FAIL CONDITION**: Any sequence where active play continues with > 25.0 px average error.
- **REQUIRED GT STREAM**: Calibration GT

**METRIC NAME**: False-Valid Calibration Count
- **DEFINITION**: Occurrences where the model asserts `VALID` calibration, but human review confirms the court is out of frame, obscured, or grossly misaligned.
- **UNIT**: Count (absolute)
- **MATCHING RULE**: Model emits `isValid: true` against GT `is_court_visible: false` or reprojection error > 30 px.
- **RATIONALE**: Prevents garbage coordinate projections during close-ups, replays, and spectator cuts.
- **PROPOSED THRESHOLD**: 0
- **HARD FAIL CONDITION**: > 0 false-valid assertions during any continuous tracking segment.
- **REQUIRED GT STREAM**: Scene/Camera Transition GT & Calibration GT

**METRIC NAME**: Calibration Relock Latency
- **DEFINITION**: The time taken to restore a `VALID` calibration state after a return to the live court view.
- **UNIT**: Seconds (s)
- **MATCHING RULE**: Difference between first GT live-court frame and first model `VALID` calibration frame.
- **RATIONALE**: Players returning to live action must be located tactically before a rally starts.
- **PROPOSED THRESHOLD**: ≤ 1.00 s
- **HARD FAIL CONDITION**: > 3.00 s latency.
- **REQUIRED GT STREAM**: Scene/Camera Transition GT

---

## 2. Player Tracking & Identity
**METRIC NAME**: Ground-Position Error
- **DEFINITION**: Spatial error between model-projected player ground contact and human-reviewed ground contact in real-world court units.
- **UNIT**: Meters (m)
- **MATCHING RULE**: Euclidean distance on the 2D physical court plane.
- **RATIONALE**: Accurate spatial heatmaps and movement speed metrics require sub-meter precision.
- **PROPOSED THRESHOLD**: ≤ 0.35 m
- **HARD FAIL CONDITION**: > 0.75 m sustained for > 1 second.
- **REQUIRED GT STREAM**: Player Ground Position GT

**METRIC NAME**: Semantic Identity Switches
- **DEFINITION**: Instances where a player correctly identified (e.g., P1) is incorrectly swapped to another identity (e.g., P2) during a continuous camera segment or after a brief occlusion.
- **UNIT**: Count per 10 minutes
- **MATCHING RULE**: Model semantic ID (P1-P4) vs GT semantic ID. Excludes ByteTrack internal MOT track ID changes as long as semantic ID recovers.
- **RATIONALE**: Tracking stats must belong to the correct player without requiring coach manual override.
- **PROPOSED THRESHOLD**: ≤ 2.0 switches per 10 min
- **HARD FAIL CONDITION**: Any identity switch that is not recovered within 2.0 seconds.
- **REQUIRED GT STREAM**: Player Identity GT

**METRIC NAME**: Identity Reacquisition Latency
- **DEFINITION**: Time required to correctly relock semantic identities (P1-P4) following a camera cut returning to live play.
- **UNIT**: Seconds (s)
- **MATCHING RULE**: From first GT return-to-court frame to first frame where all visible players have correct model semantic IDs.
- **RATIONALE**: Fast rally starts demand immediate identity relock.
- **PROPOSED THRESHOLD**: ≤ 1.50 s
- **HARD FAIL CONDITION**: Failure to reacquire correct identities before a rally serve.
- **REQUIRED GT STREAM**: Scene/Camera Transition GT & Player Identity GT

---

## 3. Scene & Camera Transitions
**METRIC NAME**: Camera-Cut Precision
- **DEFINITION**: Ratio of true detected cuts to all predicted cuts.
- **UNIT**: Ratio (0.0 - 1.0)
- **MATCHING RULE**: Detected cut within ± 0.50 s of GT cut.
- **RATIONALE**: False cuts break track continuity unnecessarily.
- **PROPOSED THRESHOLD**: ≥ 0.90
- **HARD FAIL CONDITION**: Precision < 0.75.
- **REQUIRED GT STREAM**: Scene/Camera Transition GT

**METRIC NAME**: Camera-Cut Recall
- **DEFINITION**: Ratio of true detected cuts to all GT cuts.
- **UNIT**: Ratio (0.0 - 1.0)
- **MATCHING RULE**: Detected cut within ± 0.50 s of GT cut.
- **RATIONALE**: Missed cuts bridge invalid trajectories and create massive artifact lines on heatmaps.
- **PROPOSED THRESHOLD**: ≥ 0.90
- **HARD FAIL CONDITION**: Recall < 0.80.
- **REQUIRED GT STREAM**: Scene/Camera Transition GT

**METRIC NAME**: Camera-Cut F1 Score
- **DEFINITION**: Harmonic mean of Precision and Recall for camera cuts.
- **UNIT**: Ratio (0.0 - 1.0)
- **MATCHING RULE**: Standard F1 formula.
- **RATIONALE**: Balances false positives and false negatives for transition detection.
- **PROPOSED THRESHOLD**: ≥ 0.90
- **HARD FAIL CONDITION**: F1 < 0.85.
- **REQUIRED GT STREAM**: Scene/Camera Transition GT

**METRIC NAME**: Camera-Cut Latency
- **DEFINITION**: Maximum delay between the true visual cut and the model invalidating metrics.
- **UNIT**: Seconds (s)
- **MATCHING RULE**: Model cut detection frame - GT cut frame.
- **RATIONALE**: Slower detection leaks garbage data into tracking telemetry.
- **PROPOSED THRESHOLD**: ≤ 0.50 s
- **HARD FAIL CONDITION**: Latency > 1.00 s.
- **REQUIRED GT STREAM**: Scene/Camera Transition GT

---

## 4. Shuttle Tracking (RallyLens)
**METRIC NAME**: Shuttle Precision
- **DEFINITION**: Ratio of true positive shuttle locations to all predicted shuttle locations.
- **UNIT**: Ratio (0.0 - 1.0)
- **MATCHING RULE**: Predicted 2D pixel coordinate within 30 px Euclidean distance of GT visible shuttle coordinate.
- **RATIONALE**: False positives corrupt stroke detection and shuttle speed calculations.
- **PROPOSED THRESHOLD**: ≥ 0.85
- **HARD FAIL CONDITION**: Precision < 0.70.
- **REQUIRED GT STREAM**: Shuttle Visibility GT & Shuttle Image-Position GT

**METRIC NAME**: Shuttle Recall
- **DEFINITION**: Ratio of true positive shuttle locations to all GT `VISIBLE` shuttle frames.
- **UNIT**: Ratio (0.0 - 1.0)
- **MATCHING RULE**: Predicted 2D pixel coordinate within 30 px Euclidean distance of GT visible shuttle coordinate.
- **RATIONALE**: Missed shuttles break rally trajectory reconstruction.
- **PROPOSED THRESHOLD**: ≥ 0.85
- **HARD FAIL CONDITION**: Recall < 0.70.
- **REQUIRED GT STREAM**: Shuttle Visibility GT & Shuttle Image-Position GT

**METRIC NAME**: Shuttle False Positives
- **DEFINITION**: Rate of false shuttle detections during frames where GT is `ABSENT`.
- **UNIT**: Count per 1,000 absent frames
- **MATCHING RULE**: Model predicts a shuttle when GT visibility is `ABSENT`.
- **RATIONALE**: Ensures the network doesn't hallucinate shuttles in crowds or empty courts.
- **PROPOSED THRESHOLD**: ≤ 5 per 1,000 absent frames
- **HARD FAIL CONDITION**: > 20 per 1,000 absent frames.
- **REQUIRED GT STREAM**: Shuttle Visibility GT

**METRIC NAME**: Shuttle Reacquisition Duration
- **DEFINITION**: Time required to recover the true shuttle track following an occlusion or return to frame.
- **UNIT**: Seconds (s)
- **MATCHING RULE**: From first GT `VISIBLE` frame after an `ABSENT`/`OCCLUDED` period to the first valid prediction.
- **RATIONALE**: The temporal model must quickly bootstrap its trajectory window to capture fast exchanges.
- **PROPOSED THRESHOLD**: ≤ 1.50 s
- **HARD FAIL CONDITION**: > 3.00 s duration.
- **REQUIRED GT STREAM**: Shuttle Visibility GT & Shuttle Image-Position GT
