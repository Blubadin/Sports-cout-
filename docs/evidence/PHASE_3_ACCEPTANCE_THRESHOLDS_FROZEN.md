# Phase 3 Frozen Acceptance Thresholds Specification

**Document Version:** 1.0.0  
**Status:** `APPROVED_FROZEN`  
**Approval Authority:** SportsScout Systems Architecture & Product Engineering  
**Approval Date:** 2026-10-07  
**Git Baseline:** `fix/phase3-closeout-final` (`b611a9651c8a6aed18a286e1e01b35ee412199a0` + PR #32 + Closeout Fixes)

---

## 1. Scope & Governance

This document establishes the frozen quantitative acceptance criteria for **SportsScout Phase 3 (Tracking, Scene Understanding, Camera Adaptation, and Video Export)**. In accordance with AGENTS.md rules and Phase 3 safety gate specifications (`ai_service/benchmark_schema.py`), all evaluations claiming Phase 3 certification must validate against these frozen numbers without modification.

Any deviation requires a formal change request, new baseline justification, and re-execution of full gate regression suites.

---

## 2. Frozen Quantitative Thresholds

| Metric Identifier | Target Dimension | Frozen Threshold | Units / Scope | Safety Gate Enforcing |
| :--- | :--- | :--- | :--- | :--- |
| `max_reprojection_error_px` | Court Geometry | **<= 12.0** | Pixels (RMSE) | Calibration Contract Gate |
| `max_court_position_error_m` | 2D Court Plane Position | **<= 0.35** | Metres (Euclidean) | Ground Position Gate |
| `min_camera_cut_f1` | Scene Understanding | **>= 0.90** | F1-Score | Scene Transition Gate |
| `min_camera_cut_precision` | Scene Understanding | **>= 0.90** | Precision | Scene Transition Gate |
| `min_camera_cut_recall` | Scene Understanding | **>= 0.90** | Recall | Scene Transition Gate |
| `max_camera_cut_latency_sec`| Scene Adaptation | **<= 0.50** | Seconds | Adaptation Latency Gate |
| `max_relock_latency_sec` | Court Re-acquisition | **<= 1.00** | Seconds | Relock Latency Gate |
| `max_false_valid_calibration_count` | Metric Safety | **== 0** | Count (Zero Tolerance) | Calibration Integrity Gate |
| `max_id_switches_per_10_min` | Player Identity Consistency | **<= 2.0** | Switches / 10 min | MOT Identity Gate |
| `min_shuttle_precision` | Shuttle Tracking | **>= 0.85** | Precision | Shuttle Closeout Gate |
| `min_shuttle_recall` | Shuttle Tracking | **>= 0.85** | Recall | Shuttle Closeout Gate |
| `max_shuttle_false_positives_per_1000` | Shuttle Tracking | **<= 5.0** | FPs / 1000 frames | Shuttle Closeout Gate |
| `max_reacquisition_duration_sec` | Shuttle Trajectory | **<= 1.50** | Seconds | Shuttle Trajectory Gate |
| `preview_false_tracking_gap_count` | Preview Overlay Continuity | **== 0** | Count (Zero Tolerance) | Phase 10A Preview Gate |
| `export_av_sync_drift_ms` | Video Export Fidelity | **< 50.0** | Milliseconds | Phase 10B Export Gate |
| `export_frame_count_parity_pct` | Video Export Frame Match | **== 100.0** | Percent (Exact 1:1) | Phase 10B Frame Contract Gate |

---

## 3. Mandatory Capability Rules

1. **False Tracking Gap Rule (Phase 10A)**:
   - A *False Tracking Gap* is defined as any timestamp where the underlying video was analyzed, tracking telemetry exists in IndexedDB or backend storage, but the UI displays `"No tracking data is available for this time"` or drops the overlay unexpectedly.
   - Target: **0 false gaps across the entire playback session**.
   - Resolved via 3-level caching (RAM buffer, IndexedDB, Backend API) and explicit availability state mapping (`LOADING`, `AVAILABLE`, `PARTIAL`, `TRUE_GAP`, `INVALID_SEGMENT`, `NOT_ANALYZED`, `ERROR`).

2. **Metric Calibration Safety (Phase 3.5B)**:
   - Never report metric court coordinates (`x_m`, `y_m`, `speed_mps`) when `isMetricValid` is false or during uncalibrated scenes (replays, audience cutaways).
   - Zero tolerance (`count == 0`) for false valid metric claims.

3. **MOT Identity vs. Sports Identity (AGENTS.md Rule 3)**:
   - ByteTrack MOT IDs (`trackId`) must remain strictly segregated from canonical player identities (`P1`..`P4`).
   - Spectators, officials, and line judges outside court boundaries must never receive `P1`..`P4` tags.

4. **Monocular 2D Estimation Rule (AGENTS.md Rule 4)**:
   - All keypoints and derived angles are monocular 2D pixel estimates.
   - Ground points are feet contact approximations (`pose_ankles` or `bbox_ground`), strictly barred from being marketed as 3D ground reaction forces or force-plate centers of pressure.

---

## 4. Frozen Status Sign-off

```json
{
  "status": "APPROVED_FROZEN",
  "approvedBy": "SportsScout Engineering Architecture",
  "approvalDate": "2026-10-07T00:00:00Z",
  "maxReprojectionErrorPx": 12.0,
  "maxCourtPositionErrorM": 0.35,
  "minCameraCutF1": 0.90,
  "minCameraCutPrecision": 0.90,
  "minCameraCutRecall": 0.90,
  "maxCameraCutLatencySec": 0.50,
  "maxRelockLatencySec": 1.00,
  "maxFalseValidCalibrationCount": 0,
  "maxIdSwitchesPer10Min": 2.0,
  "minShuttlePrecision": 0.85,
  "minShuttleRecall": 0.85,
  "maxShuttleFalsePositivesPer1000": 5.0,
  "maxReacquisitionDurationSec": 1.50
}
```
