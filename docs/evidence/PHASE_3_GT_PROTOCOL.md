# Phase 3 Ground Truth & Acceptance Protocol

## 1. Overview
This document defines the final Ground Truth (GT) and acceptance protocol required to legitimately close SportsScout Phase 3. The protocol strictly enforces the separation of development and held-out data, requires independent human review blinded to model predictions, and ensures all metrics are computed against verified, uncompromised real-world data.

## 2. Non-Negotiable Validation Rules
- **No Invented Accuracy**: GT must be created by human reviewers inspecting original frames. Model predictions must never be used as GT.
- **Blinded Review**: All GT must be annotated with model predictions hidden.
- **Strict Leakage Prevention**: Frames or windows from the same match/recording group must never cross between development and held-out splits.
- **No `UNKNOWN` Coercion**: The `UNKNOWN` state means a human could not determine the answer. It must never be mapped automatically to `ABSENT`.
- **Threshold Freezing**: Evaluation thresholds must not be adjusted after observing held-out performance to force a pass.

## 3. Data Split Policy
- **Boundary**: The fundamental split boundary is the `recording/match group`.
- **Leakage Prevention**: Adjacent clips, alternate cuts, replay segments, exported excerpts, and re-encoded copies of the same match must remain strictly in the same assigned split.
- **Assignment**: Each group is deterministically assigned to either `development` or `held-out` before any frame intervals are sampled.

## 4. Required Scenario Coverage
The held-out dataset must contain verified intervals for all 14 mandatory tracking scenarios:
1. Rear court
2. Rear / low angle
3. Side / low angle
4. Camera cut
5. Pan / zoom
6. Close-up
7. Replay
8. Return to court
9. Spectators / officials
10. Player outside court
11. Doubles crossing
12. Difficult / bright background
13. Shuttle false positives
14. Shuttle lost / reacquisition

## 5. Ground Truth Streams
Each capability requires an explicit, separate annotation stream:
- **Scene/Camera Transition**: Frame-precise labels for cuts, zoom, and live-play segments.
- **Calibration**: Manual 2D pixel coordinates of known court landmarks.
- **Player Ground Position**: Estimated court foot-contact points.
- **Player Identity**: Semantic identity (P1-P4) maintained independently of the tracking engine's MOT ID.
- **Eligibility**: Classification of humans as active players vs. spectators/officials.
- **Shuttle Visibility**: Exactly one of `VISIBLE`, `ABSENT`, `OCCLUDED`, or `UNKNOWN`.
- **Shuttle Image-Position**: Pixel coordinates (only allowed when visibility is `VISIBLE`).
- **Shuttle Reacquisition**: Exact frame of re-entry following a loss or cut.

## 6. Human Review & Certification Process
To qualify for Phase 3 certification, every annotated interval must record:
1. **Source Media SHA-256**: Cryptographic hash of the unedited source file.
2. **Recording/Match Group**: Unique identifier for the match.
3. **Exact Source-Frame Interval**: Start and end frame indices.
4. **Primary Reviewer ID**: Identity of the first annotator.
5. **Review Date**: ISO 8601 timestamp.
6. **Annotation Method**: Tooling used (e.g., `manual_point_click`).
7. **Prediction-Blinding Status**: Must be `BLINDED`.
8. **Independent Second Reviewer**: Identity of the secondary reviewer verifying the labels.
9. **Adjudication Record**: Conflict resolution notes between reviewers.
10. **Annotation Version**: Schema or dataset version.
11. **Split Assignment**: `held-out` or `development`.

*Note: AI tools may assist in data formatting or UI presentation, but an AI must never act as or claim to be the human reviewer.*
