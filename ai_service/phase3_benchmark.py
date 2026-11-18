"""
ai_service/phase3_benchmark.py — Phase 3.4 Court, Position & Identity Benchmark Evaluator

Evaluates:
- Camera Cut detection quality (TP, FP, FN, precision, recall, F1, latency, duplicate suppression)
- Court Calibration accuracy (reprojection error, meter error, availability, false valid count, relock latency)
- Ground Position & Feet mapping (pixel error, court position meter error, coverage, provenance breakdown)
- MOT Tracking Identity (ID switches, ID switches / 10 min, IDF1, HOTA unavailable report)
- Split safety and data leakage validation
"""

from __future__ import annotations
import math
import os
import re
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence, Tuple
import numpy as np
from scipy.optimize import linear_sum_assignment

try:
    from .benchmark_schema import (
        BenchmarkClipEntry,
        CameraCutBenchmarkMetrics,
        CalibrationBenchmarkMetrics,
        GroundPositionBenchmarkMetrics,
        GroundProvenanceSubMetrics,
        TrackingIdentityBenchmarkMetrics,
        Phase3BenchmarkProvenance,
        Phase3BenchmarkReport,
        validate_split_leakage,
        partition_clips_by_group,
        SCENARIO_BUCKETS,
        GT_VISIBILITY_STATES,
        BENCHMARK_SPLITS,
        Phase3QualityThresholds,
        ScenarioBenchmarkMetrics,
        THRESHOLD_STATUS_UNSET,
        THRESHOLD_STATUS_PROPOSED,
        THRESHOLD_STATUS_APPROVED,
        CAPABILITY_STATUS_VALIDATED,
        CAPABILITY_STATUS_NOT_VALIDATED,
        CAPABILITY_STATUS_EXPERIMENTAL,
        CAPABILITY_STATUS_BLOCKED,
        ShuttleCloseoutProvenance,
        ShuttleCloseoutMetrics,
        REQUIRED_GT_STREAMS,
    )
except ImportError:
    from benchmark_schema import (
        BenchmarkClipEntry,
        CameraCutBenchmarkMetrics,
        CalibrationBenchmarkMetrics,
        GroundPositionBenchmarkMetrics,
        GroundProvenanceSubMetrics,
        TrackingIdentityBenchmarkMetrics,
        Phase3BenchmarkProvenance,
        Phase3BenchmarkReport,
        validate_split_leakage,
        partition_clips_by_group,
        SCENARIO_BUCKETS,
        GT_VISIBILITY_STATES,
        BENCHMARK_SPLITS,
        Phase3QualityThresholds,
        ScenarioBenchmarkMetrics,
        THRESHOLD_STATUS_UNSET,
        THRESHOLD_STATUS_PROPOSED,
        THRESHOLD_STATUS_APPROVED,
        CAPABILITY_STATUS_VALIDATED,
        CAPABILITY_STATUS_NOT_VALIDATED,
        CAPABILITY_STATUS_EXPERIMENTAL,
        CAPABILITY_STATUS_BLOCKED,
        ShuttleCloseoutProvenance,
        ShuttleCloseoutMetrics,
        REQUIRED_GT_STREAMS,
    )

try:
    from .shuttle_benchmark import evaluate_shuttle_tracking, ShuttleBenchmarkConfig
except ImportError:
    try:
        from shuttle_benchmark import evaluate_shuttle_tracking, ShuttleBenchmarkConfig
    except ImportError:
        evaluate_shuttle_tracking = None
        ShuttleBenchmarkConfig = None


try:
    from .path_utils import sanitize_path_reference
except ImportError:
    try:
        from path_utils import sanitize_path_reference
    except ImportError:
        def sanitize_path_reference(path_or_str: Any) -> Optional[str]:
            if path_or_str is None or isinstance(path_or_str, (bool, dict, list, set, tuple)):
                return None
            raw = str(path_or_str).strip()
            if not raw:
                return None
            normalized = raw.replace("\\", "/")
            if normalized.startswith("//") or re.match(r"^[a-zA-Z]:", normalized) or normalized.startswith("/"):
                parts = [p for p in normalized.split("/") if p]
                return parts[-1] if parts else None
            lower_norm = normalized.lower()
            if "/home/" in lower_norm or "/users/" in lower_norm:
                parts = [p for p in normalized.split("/") if p]
                return parts[-1] if parts else None
            segments = [s for s in normalized.split("/") if s and s != "."]
            if any(s == ".." for s in segments):
                valid_segments = [s for s in segments if s != ".."]
                return valid_segments[-1] if valid_segments else None
            return "/".join(segments) if segments else None



def _percentile(values: Sequence[float], q: float) -> Optional[float]:
    """Safe percentile calculation without external dependencies."""
    clean = sorted(v for v in values if math.isfinite(v))
    if not clean:
        return None
    if len(clean) == 1:
        return round(float(clean[0]), 3)
    k = (len(clean) - 1) * (q / 100.0)
    f = math.floor(k)
    c = math.ceil(k)
    if f == c:
        return round(float(clean[int(k)]), 3)
    d0 = clean[int(f)] * (c - k)
    d1 = clean[int(c)] * (k - f)
    return round(float(d0 + d1), 3)


def evaluate_camera_cuts(
    ground_truth_cuts: Optional[Sequence[float]],
    predicted_cuts: Optional[Sequence[float]],
    tolerance_sec: float = 0.5,
) -> CameraCutBenchmarkMetrics:
    """
    Evaluates camera cut detection against ground truth timestamps.

    Rules:
    - If ground_truth_cuts is None: status is UNAVAILABLE (never report fake 0).
    - If ground_truth_cuts exists and predicted_cuts is empty: TP=0, FP=0, FN=len(GT).
    - If ground_truth_cuts is empty and predicted_cuts is empty: TP=0, FP=0, FN=0, precision=1.0, recall=1.0, F1=1.0 (measured 0 false cuts).
    - Repeated detections from the same real cut must not inflate TP; duplicates are tracked separately.
    """
    if ground_truth_cuts is None:
        return CameraCutBenchmarkMetrics(
            status="UNAVAILABLE",
            status_reason="Camera cut ground truth not available",
        )

    gt_list = sorted(float(t) for t in ground_truth_cuts if math.isfinite(float(t)))
    pred_list = sorted(float(t) for t in (predicted_cuts or []) if math.isfinite(float(t)))

    if not gt_list and not pred_list:
        return CameraCutBenchmarkMetrics(
            status="MEASURED",
            tp_cuts=0,
            fp_cuts=0,
            fn_cuts=0,
            duplicate_cut_count=0,
            precision=1.0,
            recall=1.0,
            f1=1.0,
            mean_detection_latency_sec=None,
        )

    matched_gt: set[int] = set()
    matched_preds: set[int] = set()
    latencies: list[float] = []
    duplicate_count = 0

    # Match each predicted cut to the nearest unassigned GT cut within tolerance
    for pred_idx, p_time in enumerate(pred_list):
        best_gt_idx = None
        best_diff = float("inf")
        is_duplicate = False

        for gt_idx, g_time in enumerate(gt_list):
            diff = abs(p_time - g_time)
            if diff <= tolerance_sec:
                if gt_idx in matched_gt:
                    is_duplicate = True
                elif diff < best_diff:
                    best_diff = diff
                    best_gt_idx = gt_idx

        if best_gt_idx is not None:
            matched_gt.add(best_gt_idx)
            matched_preds.add(pred_idx)
            latencies.append(best_diff)
        elif is_duplicate:
            duplicate_count += 1
            matched_preds.add(pred_idx)

    tp = len(matched_gt)
    fp = len(pred_list) - len(matched_preds)
    fn = len(gt_list) - tp

    precision = round(tp / (tp + fp), 4) if (tp + fp) > 0 else (1.0 if not gt_list else 0.0)
    recall = round(tp / (tp + fn), 4) if (tp + fn) > 0 else 1.0
    f1 = (
        round(2.0 * precision * recall / (precision + recall), 4)
        if (precision + recall) > 0
        else 0.0
    )
    mean_latency = round(float(np.mean(latencies)), 4) if latencies else None

    return CameraCutBenchmarkMetrics(
        status="MEASURED",
        tp_cuts=tp,
        fp_cuts=fp,
        fn_cuts=fn,
        duplicate_cut_count=duplicate_count,
        precision=precision,
        recall=recall,
        f1=f1,
        mean_detection_latency_sec=mean_latency,
    )


def evaluate_calibration(
    ground_truth_calibration: Optional[Dict[str, Any]],
    predicted_frames: Optional[Sequence[Dict[str, Any]]],
) -> CalibrationBenchmarkMetrics:
    """
    Evaluates dynamic court calibration quality.
    ground_truth_calibration may specify:
    - 'cornersPx': 4 reference court corners [[x, y], ...]
    - 'validIntervals': list of (startSec, endSec) when court is visible
    """
    if ground_truth_calibration is None or not predicted_frames:
        return CalibrationBenchmarkMetrics(
            status="UNAVAILABLE",
            status_reason="Court calibration ground truth not available",
        )

    gt_corners = ground_truth_calibration.get("cornersPx")
    if not gt_corners or len(gt_corners) < 4:
        return CalibrationBenchmarkMetrics(
            status="UNAVAILABLE",
            status_reason="Ground truth reference court corners not provided",
        )

    gt_arr = np.array(gt_corners, dtype=np.float32)
    valid_intervals = ground_truth_calibration.get("validIntervals")

    reproj_errors: list[float] = []
    meter_errors: list[float] = []
    available_frames = 0
    total_frames = len(predicted_frames)
    false_valid_count = 0
    relock_latencies: list[float] = []
    segment_consistencies: list[float] = []

    last_segment_id = None
    segment_start_sec = None
    relock_achieved = False

    for frame in predicted_frames:
        t_sec = float(frame.get("timestampSec", 0.0))
        seg_id = frame.get("cameraSegmentId")
        cal_state = frame.get("calibrationState")
        is_calibrated = (cal_state == "CALIBRATED")

        # Ground truth visibility check
        gt_visible = True
        if valid_intervals is not None:
            gt_visible = any(start <= t_sec <= end for start, end in valid_intervals)

        if not gt_visible and is_calibrated:
            false_valid_count += 1

        if is_calibrated:
            available_frames += 1

        # Track relock latency per segment
        if seg_id != last_segment_id:
            last_segment_id = seg_id
            segment_start_sec = t_sec
            relock_achieved = False

        if gt_visible and not relock_achieved:
            if is_calibrated and segment_start_sec is not None:
                relock_latencies.append(max(0.0, t_sec - segment_start_sec))
                relock_achieved = True

        # Calculate reprojection error if predicted corners exist
        pred_corners = frame.get("calibration", {}).get("cornersPx") if isinstance(frame.get("calibration"), dict) else None
        if pred_corners and len(pred_corners) >= 4:
            pred_arr = np.array(pred_corners, dtype=np.float32)
            dists = np.linalg.norm(pred_arr - gt_arr, axis=1)
            mean_dist = float(np.mean(dists))
            if math.isfinite(mean_dist):
                reproj_errors.append(mean_dist)

        # Court meter errors if provided
        pred_court_corners_m = frame.get("calibration", {}).get("cornersCourtM") if isinstance(frame.get("calibration"), dict) else None
        gt_court_corners_m = ground_truth_calibration.get("cornersCourtM")
        if pred_court_corners_m and gt_court_corners_m:
            pm = np.array(pred_court_corners_m, dtype=np.float32)
            gm = np.array(gt_court_corners_m, dtype=np.float32)
            dists_m = np.linalg.norm(pm - gm, axis=1)
            mean_m = float(np.mean(dists_m))
            if math.isfinite(mean_m):
                meter_errors.append(mean_m)

    if not reproj_errors and not meter_errors and available_frames == 0:
        return CalibrationBenchmarkMetrics(
            status="UNAVAILABLE",
            status_reason="No comparable calibration frames found",
        )

    avail_pct = round((available_frames / total_frames) * 100.0, 2) if total_frames > 0 else 0.0

    return CalibrationBenchmarkMetrics(
        status="MEASURED",
        reprojection_error_px_mean=round(float(np.mean(reproj_errors)), 3) if reproj_errors else None,
        reprojection_error_px_median=_percentile(reproj_errors, 50),
        reprojection_error_px_p95=_percentile(reproj_errors, 95),
        court_position_error_m_mean=round(float(np.mean(meter_errors)), 3) if meter_errors else None,
        court_position_error_m_median=_percentile(meter_errors, 50),
        court_position_error_m_p95=_percentile(meter_errors, 95),
        calibration_availability_pct=avail_pct,
        false_valid_calibration_count=false_valid_count,
        relock_latency_sec=round(float(np.mean(relock_latencies)), 3) if relock_latencies else None,
        camera_segment_calibration_consistency=1.0 if not reproj_errors or np.std(reproj_errors) < 5.0 else round(float(1.0 / (1.0 + np.std(reproj_errors))), 3),
    )


def evaluate_ground_position(
    ground_truth_positions: Optional[Sequence[Dict[str, Any]]],
    predicted_positions: Optional[Sequence[Dict[str, Any]]],
) -> GroundPositionBenchmarkMetrics:
    """
    Evaluates canonical player ground and feet positioning against ground truth.
    Supports breaking down error by provenance:
    - pose_both_ankles
    - pose_left_ankle / pose_right_ankle (single ankle)
    - bbox_bottom_center (bbox fallback)
    """
    if ground_truth_positions is None or not predicted_positions:
        return GroundPositionBenchmarkMetrics(
            status="UNAVAILABLE",
            status_reason="Ground position ground truth not available",
        )

    # Key GT records by (frameIndex or timestamp, playerId)
    gt_map: dict[tuple[int, str], dict[str, Any]] = {}
    for gt in ground_truth_positions:
        f_idx = int(gt.get("frameIndex", gt.get("frame", 0)))
        p_id = str(gt.get("playerId", gt.get("player_id", "P1")))
        gt_map[(f_idx, p_id)] = gt

    all_px_errors: list[float] = []
    all_meter_errors: list[float] = []
    prov_errors: dict[str, list[float]] = {}
    prov_m_errors: dict[str, list[float]] = {}

    matched_gt_keys: set[tuple[int, str]] = set()

    for pred in predicted_positions:
        f_idx = int(pred.get("frameIndex", pred.get("frame", 0)))
        p_id = str(pred.get("playerId", pred.get("player_id", "P1")))
        key = (f_idx, p_id)
        if key not in gt_map:
            continue

        gt = gt_map[key]
        matched_gt_keys.add(key)
        prov = str(pred.get("groundPointProvenance", "bbox_bottom_center"))

        # Calculate pixel distance
        gt_px = gt.get("groundPx")
        pred_px = pred.get("groundPx")
        if gt_px and pred_px:
            dx = float(gt_px["x"]) - float(pred_px["x"])
            dy = float(gt_px["y"]) - float(pred_px["y"])
            dist_px = math.sqrt(dx * dx + dy * dy)
            if math.isfinite(dist_px):
                all_px_errors.append(dist_px)
                prov_errors.setdefault(prov, []).append(dist_px)

        # Calculate meter distance if courtPositionM is available
        gt_m = gt.get("courtPositionM")
        pred_m = pred.get("courtPositionM")
        if gt_m and pred_m:
            dm_x = float(gt_m["xM"]) - float(pred_m["xM"])
            dm_y = float(gt_m["yM"]) - float(pred_m["yM"])
            dist_m = math.sqrt(dm_x * dm_x + dm_y * dm_y)
            if math.isfinite(dist_m):
                all_meter_errors.append(dist_m)
                prov_m_errors.setdefault(prov, []).append(dist_m)

    if not all_px_errors and not all_meter_errors:
        return GroundPositionBenchmarkMetrics(
            status="UNAVAILABLE",
            status_reason="No overlapping frames found for ground position evaluation",
        )

    # Build provenance sub-metrics
    by_prov: dict[str, GroundProvenanceSubMetrics] = {}
    for prov, errs in prov_errors.items():
        m_errs = prov_m_errors.get(prov, [])
        by_prov[prov] = GroundProvenanceSubMetrics(
            sample_count=len(errs),
            pixel_error_mean=round(float(np.mean(errs)), 2) if errs else None,
            pixel_error_median=_percentile(errs, 50),
            pixel_error_p95=_percentile(errs, 95),
            court_position_error_m_mean=round(float(np.mean(m_errs)), 3) if m_errs else None,
            court_position_error_m_median=_percentile(m_errs, 50),
            court_position_error_m_p95=_percentile(m_errs, 95),
        )

    coverage = round((len(matched_gt_keys) / len(gt_map)) * 100.0, 2) if gt_map else 0.0

    return GroundPositionBenchmarkMetrics(
        status="MEASURED",
        pixel_error_mean=round(float(np.mean(all_px_errors)), 2) if all_px_errors else None,
        pixel_error_median=_percentile(all_px_errors, 50),
        pixel_error_p95=_percentile(all_px_errors, 95),
        court_position_error_m_mean=round(float(np.mean(all_meter_errors)), 3) if all_meter_errors else None,
        court_position_error_m_median=_percentile(all_meter_errors, 50),
        court_position_error_m_p95=_percentile(all_meter_errors, 95),
        coverage_pct=coverage,
        by_provenance=by_prov,
    )


def evaluate_identity(
    ground_truth_tracks: Optional[Sequence[Dict[str, Any]]],
    predicted_tracks: Optional[Sequence[Dict[str, Any]]],
    duration_sec: Optional[float] = None,
) -> TrackingIdentityBenchmarkMetrics:
    """
    Evaluates tracking identity using standard MOT semantics.
    Calculates ID switches, ID switches / 10 min, and IDF1.
    Reports HOTA as strictly UNAVAILABLE (never approximates HOTA from detector metrics).
    """
    if ground_truth_tracks is None or not predicted_tracks:
        return TrackingIdentityBenchmarkMetrics(
            status="UNAVAILABLE",
            status_reason="Player identity ground truth not available",
            hota_status="UNAVAILABLE",
            hota_reason="insufficient implementation/GT",
            hota=None,
        )

    # Group by frame index
    gt_by_frame: dict[int, dict[str, Any]] = {}
    for gt in ground_truth_tracks:
        f_idx = int(gt.get("frameIndex", gt.get("frame", 0)))
        gt_by_frame.setdefault(f_idx, {})[gt["playerId"]] = gt

    pred_by_frame: dict[int, dict[int, Any]] = {}
    total_pred_count = 0
    all_pred_track_ids: set[int] = set()
    all_gt_player_ids: set[str] = set()

    for p in predicted_tracks:
        f_idx = int(p.get("frameIndex", p.get("frame", 0)))
        tid = p.get("trackId")
        if tid is not None:
            pred_by_frame.setdefault(f_idx, {})[int(tid)] = p
            total_pred_count += 1
            all_pred_track_ids.add(int(tid))

    total_gt_count = sum(len(gts) for gts in gt_by_frame.values())
    for gts in gt_by_frame.values():
        all_gt_player_ids.update(gts.keys())

    if not all_gt_player_ids or not all_pred_track_ids:
        return TrackingIdentityBenchmarkMetrics(
            status="UNAVAILABLE",
            status_reason="No overlapping tracked identities found",
            hota_status="UNAVAILABLE",
            hota_reason="insufficient implementation/GT",
            hota=None,
        )

    gt_id_list = sorted(all_gt_player_ids)
    pred_id_list = sorted(all_pred_track_ids)

    # Compute overlap matrix between each GT identity and predicted trackId
    cost_matrix = np.zeros((len(gt_id_list), len(pred_id_list)), dtype=np.int32)
    for f_idx, gts in gt_by_frame.items():
        preds = pred_by_frame.get(f_idx, {})
        for g_idx, g_id in enumerate(gt_id_list):
            if g_id in gts:
                g_box = gts[g_id].get("bbox")
                for p_idx, p_tid in enumerate(pred_id_list):
                    if p_tid in preds:
                        p_box = preds[p_tid].get("bbox")
                        if g_box and p_box:
                            # Check bounding box IoU >= 0.3
                            ix1 = max(g_box[0], p_box[0])
                            iy1 = max(g_box[1], p_box[1])
                            ix2 = min(g_box[2], p_box[2])
                            iy2 = min(g_box[3], p_box[3])
                            iw = max(0.0, ix2 - ix1)
                            ih = max(0.0, iy2 - iy1)
                            inter = iw * ih
                            area_g = (g_box[2] - g_box[0]) * (g_box[3] - g_box[1])
                            area_p = (p_box[2] - p_box[0]) * (p_box[3] - p_box[1])
                            union = area_g + area_p - inter
                            if union > 0 and (inter / union) >= 0.3:
                                cost_matrix[g_idx, p_idx] += 1
                        else:
                            # Co-occurrence in frame
                            cost_matrix[g_idx, p_idx] += 1

    # Optimal bipartite matching for IDF1
    row_ind, col_ind = linear_sum_assignment(-cost_matrix)
    idtp = int(sum(cost_matrix[r, c] for r, c in zip(row_ind, col_ind)))
    idfp = total_pred_count - idtp
    idfn = total_gt_count - idtp
    denom = 2 * idtp + idfp + idfn
    idf1 = round((2.0 * idtp / denom), 4) if denom > 0 else 0.0

    # Calculate ID switches: count of times assigned track changes for a ground truth trajectory
    id_switches = 0
    for g_id in gt_id_list:
        last_matched_tid = None
        for f_idx in sorted(gt_by_frame.keys()):
            gts = gt_by_frame[f_idx]
            if g_id not in gts:
                continue
            preds = pred_by_frame.get(f_idx, {})
            # Find closest/best matching pred in this frame
            matched_tid = None
            g_box = gts[g_id].get("bbox")
            for p_tid, p_data in preds.items():
                p_box = p_data.get("bbox")
                if g_box and p_box:
                    ix1 = max(g_box[0], p_box[0])
                    iy1 = max(g_box[1], p_box[1])
                    ix2 = min(g_box[2], p_box[2])
                    iy2 = min(g_box[3], p_box[3])
                    inter = max(0.0, ix2 - ix1) * max(0.0, iy2 - iy1)
                    union = (g_box[2] - g_box[0]) * (g_box[3] - g_box[1]) + (p_box[2] - p_box[0]) * (p_box[3] - p_box[1]) - inter
                    if union > 0 and (inter / union) >= 0.3:
                        matched_tid = p_tid
                        break
                else:
                    matched_tid = p_tid
                    break

            if matched_tid is not None:
                if last_matched_tid is not None and matched_tid != last_matched_tid:
                    id_switches += 1
                last_matched_tid = matched_tid

    # Rate per 10 minutes (600s)
    switches_per_10m = None
    if duration_sec is not None and duration_sec > 0:
        switches_per_10m = round(float(id_switches) * (600.0 / float(duration_sec)), 2)

    return TrackingIdentityBenchmarkMetrics(
        status="MEASURED",
        id_switch_count=id_switches,
        id_switches_per_10_min=switches_per_10m,
        idf1=idf1,
        idtp=idtp,
        idfp=idfp,
        idfn=idfn,
        hota_status="UNAVAILABLE",
        hota_reason="insufficient implementation/GT",
        hota=None,
    )


def evaluate_scenario_breakdown(
    clip: BenchmarkClipEntry,
    cut_metrics: CameraCutBenchmarkMetrics,
    cal_metrics: CalibrationBenchmarkMetrics,
    ground_metrics: GroundPositionBenchmarkMetrics,
    id_metrics: TrackingIdentityBenchmarkMetrics,
    thresholds: Phase3QualityThresholds,
    shuttle_metrics: Optional[ShuttleCloseoutMetrics] = None,
) -> tuple[dict[str, ScenarioBenchmarkMetrics], list[str]]:
    """
    Evaluates scenario-specific quality metrics against frozen baseline thresholds.
    Ensures missing human GT triggers an explicit annotation manifest blocker,
    and aggregate scores cannot mask individual bucket failures.
    """
    by_scenario: dict[str, ScenarioBenchmarkMetrics] = {}
    blockers: list[str] = []

    buckets_to_evaluate = list(clip.scenario_buckets)
    if not buckets_to_evaluate:
        for tag in clip.difficulty_tags:
            if tag in SCENARIO_BUCKETS and tag not in buckets_to_evaluate:
                buckets_to_evaluate.append(tag)
        if not buckets_to_evaluate:
            buckets_to_evaluate.append("rear_court")

    has_human_gt = (
        clip.ground_truth_available
        or clip.calibration_ground_truth_available
        or clip.player_identity_ground_truth_available
        or clip.ground_position_ground_truth_available
        or clip.camera_cut_ground_truth_available
        or clip.shuttle_ground_truth_available
    )

    if not has_human_gt:
        blockers.append(
            f"Clip '{clip.id}' missing human ground truth annotations (blocked from baseline certification)"
        )

    for bucket in buckets_to_evaluate:
        failures: list[str] = []
        bucket_has_gt = has_human_gt
        sample_count = 1

        # Check relevant metric domain based on bucket nature
        if bucket in ("camera_cut", "replay", "pan_zoom", "close_up", "return_to_court"):
            if cut_metrics.status == "MEASURED":
                if cut_metrics.f1 is not None and cut_metrics.f1 < thresholds.min_camera_cut_f1:
                    failures.append(f"Camera Cut F1 {cut_metrics.f1:.3f} < threshold {thresholds.min_camera_cut_f1}")
                if cut_metrics.mean_detection_latency_sec is not None and cut_metrics.mean_detection_latency_sec > thresholds.max_camera_cut_latency_sec:
                    failures.append(f"Cut latency {cut_metrics.mean_detection_latency_sec:.3f}s > threshold {thresholds.max_camera_cut_latency_sec}s")
            elif cut_metrics.status == "FAILED_VALIDATION":
                failures.append("Camera cut validation failed")
            else:
                bucket_has_gt = False

        if bucket in ("rear_court", "rear_low", "side_low_angle", "bright_lights_background"):
            if cal_metrics.status == "MEASURED":
                if cal_metrics.reprojection_error_px_mean is not None and cal_metrics.reprojection_error_px_mean > thresholds.max_reprojection_error_px:
                    failures.append(f"Reprojection error {cal_metrics.reprojection_error_px_mean:.2f}px > threshold {thresholds.max_reprojection_error_px}px")
                if cal_metrics.false_valid_calibration_count is not None and cal_metrics.false_valid_calibration_count > thresholds.max_false_valid_calibration_count:
                    failures.append(f"False valid calibration count {cal_metrics.false_valid_calibration_count} > threshold {thresholds.max_false_valid_calibration_count}")
                if cal_metrics.relock_latency_sec is not None and cal_metrics.relock_latency_sec > thresholds.max_relock_latency_sec:
                    failures.append(f"Relock latency {cal_metrics.relock_latency_sec:.2f}s > threshold {thresholds.max_relock_latency_sec}s")
            elif cal_metrics.status == "FAILED_VALIDATION":
                failures.append("Calibration validation failed")
            else:
                bucket_has_gt = False

            if ground_metrics.status == "MEASURED":
                if ground_metrics.court_position_error_m_mean is not None and ground_metrics.court_position_error_m_mean > thresholds.max_court_position_error_m:
                    failures.append(f"Court position error {ground_metrics.court_position_error_m_mean:.3f}m > threshold {thresholds.max_court_position_error_m}m")
            elif ground_metrics.status == "FAILED_VALIDATION":
                failures.append("Ground position validation failed")

        if bucket in ("doubles_crossing", "spectator_official", "player_outside_court", "lost_reacquisition"):
            if id_metrics.status == "MEASURED":
                if id_metrics.id_switches_per_10_min is not None and id_metrics.id_switches_per_10_min > thresholds.max_id_switches_per_10_min:
                    failures.append(f"ID switches / 10m {id_metrics.id_switches_per_10_min:.2f} > threshold {thresholds.max_id_switches_per_10_min}")
            elif id_metrics.status == "FAILED_VALIDATION":
                failures.append("Tracking identity validation failed")
            else:
                bucket_has_gt = False

        if bucket == "shuttle_false_positives":
            if shuttle_metrics and shuttle_metrics.status in ("MEASURED", "VALIDATED"):
                bucket_has_gt = True
                if (
                    shuttle_metrics.false_positive_rate_per_1000 is not None
                    and shuttle_metrics.false_positive_rate_per_1000 > thresholds.max_shuttle_false_positives_per_1000
                ):
                    failures.append(
                        f"Shuttle FP rate {shuttle_metrics.false_positive_rate_per_1000:.2f} > threshold {thresholds.max_shuttle_false_positives_per_1000}"
                    )
            elif shuttle_metrics and shuttle_metrics.status in ("FAILED_VALIDATION", "BLOCKED"):
                failures.append("Shuttle false positives validation failed")
            else:
                bucket_has_gt = False

        if bucket == "lost_reacquisition":
            if shuttle_metrics and shuttle_metrics.status in ("MEASURED", "VALIDATED"):
                if (
                    shuttle_metrics.reacquisition_duration_sec is not None
                    and shuttle_metrics.reacquisition_duration_sec > thresholds.max_reacquisition_duration_sec
                ):
                    failures.append(
                        f"Shuttle reacquisition duration {shuttle_metrics.reacquisition_duration_sec:.2f}s > threshold {thresholds.max_reacquisition_duration_sec}s"
                    )

        is_blocker = not bucket_has_gt
        if is_blocker:
            failures.append(f"Missing human ground truth annotation for scenario '{bucket}'")
            passed = False
        else:
            passed = len(failures) == 0

        sh_prec = shuttle_metrics.precision if shuttle_metrics and shuttle_metrics.status in ("MEASURED", "VALIDATED") else None
        sh_rec = shuttle_metrics.recall if shuttle_metrics and shuttle_metrics.status in ("MEASURED", "VALIDATED") else None
        sh_reacq = shuttle_metrics.reacquisition_duration_sec if shuttle_metrics and shuttle_metrics.status in ("MEASURED", "VALIDATED") else None

        by_scenario[bucket] = ScenarioBenchmarkMetrics(
            bucket=bucket,
            sample_count=sample_count,
            coverage_pct=ground_metrics.coverage_pct if ground_metrics.status == "MEASURED" else None,
            reprojection_error_px_mean=cal_metrics.reprojection_error_px_mean if cal_metrics.status == "MEASURED" else None,
            court_position_error_m_mean=ground_metrics.court_position_error_m_mean if ground_metrics.status == "MEASURED" else None,
            id_switches_per_10_min=id_metrics.id_switches_per_10_min if id_metrics.status == "MEASURED" else None,
            false_valid_calibration_count=cal_metrics.false_valid_calibration_count if cal_metrics.status == "MEASURED" else None,
            cut_latency_sec=cut_metrics.mean_detection_latency_sec if cut_metrics.status == "MEASURED" else None,
            relock_latency_sec=cal_metrics.relock_latency_sec if cal_metrics.status == "MEASURED" else None,
            shuttle_precision=sh_prec,
            shuttle_recall=sh_rec,
            reacquisition_duration_sec=sh_reacq,
            passed_thresholds=passed,
            failure_reasons=failures,
            human_gt_available=bucket_has_gt,
            annotation_blocker=is_blocker,
        )

    return by_scenario, blockers


def evaluate_shuttle_closeout(
    provenance: ShuttleCloseoutProvenance,
    thresholds: Phase3QualityThresholds,
    shuttle_metrics: Optional[ShuttleCloseoutMetrics] = None,
    aligned_pairs: Optional[Sequence[Any]] = None,
    source_width: Optional[int] = None,
    source_height: Optional[int] = None,
    source_fps: Optional[float] = None,
    is_dataset_complete: bool = True,
    reacquisition_duration_sec: Optional[float] = None,
    false_positive_count: Optional[int] = None,
    false_positive_rate_per_1000: Optional[float] = None,
) -> ShuttleCloseoutMetrics:
    """
    Evaluates shuttle tracking quality for Phase 3 closeout using Option B:
    Keeping shuttle evaluation independent and providing a closeout aggregation layer
    without duplicating conflicting metric logic.
    """
    failures: list[str] = []

    # Verify required provenance fields
    if not provenance.checkpoint_sha:
        failures.append("Missing required shuttle checkpoint SHA-256 in provenance")
    if not provenance.source_media_sha:
        failures.append("Missing required shuttle source media SHA-256 in provenance")

    if shuttle_metrics is not None:
        status = shuttle_metrics.status
        prec = shuttle_metrics.precision
        rec = shuttle_metrics.recall
        fp_count = shuttle_metrics.false_positive_count
        fp_rate = shuttle_metrics.false_positive_rate_per_1000
        reacq = (
            reacquisition_duration_sec
            if reacquisition_duration_sec is not None
            else shuttle_metrics.reacquisition_duration_sec
        )
        ds_status = shuttle_metrics.dataset_status
    elif aligned_pairs is not None and evaluate_shuttle_tracking is not None:
        cfg = ShuttleBenchmarkConfig(
            match_distance_threshold_px=provenance.matching_tolerance_px
        ) if ShuttleBenchmarkConfig else None
        base_metrics = evaluate_shuttle_tracking(
            aligned_pairs=aligned_pairs,
            source_width=source_width,
            source_height=source_height,
            source_fps=source_fps,
            is_dataset_complete=is_dataset_complete,
            config=cfg,
        )
        ds_status = base_metrics.dataset_status
        if ds_status == "GROUND TRUTH DATASET INCOMPLETE" or not is_dataset_complete:
            status = "UNAVAILABLE"
            prec = None
            rec = None
            fp_count = None
            fp_rate = None
            reacq = None
        else:
            status = "MEASURED"
            prec = base_metrics.visible_precision
            rec = base_metrics.visible_recall
            fp_count = base_metrics.false_positive_count
            not_vis = base_metrics.gt_not_visible_count
            fp_rate = (
                (fp_count / max(1, not_vis)) * 1000.0
                if not_vis and not_vis > 0 and fp_count is not None
                else (false_positive_rate_per_1000 or 0.0)
            )
            reacq = (
                reacquisition_duration_sec
                if reacquisition_duration_sec is not None
                else getattr(base_metrics, "reacquisition_latency_sec", None)
            )
    else:
        return ShuttleCloseoutMetrics(
            status="UNAVAILABLE",
            provenance=provenance,
            dataset_status="GROUND TRUTH DATASET INCOMPLETE",
            failure_reasons=["Shuttle ground truth or alignment data not available"],
        )

    # Check thresholds if measured
    if status == "MEASURED":
        if prec is not None and prec < thresholds.min_shuttle_precision:
            failures.append(f"Shuttle precision {prec:.3f} < threshold {thresholds.min_shuttle_precision}")
        if rec is not None and rec < thresholds.min_shuttle_recall:
            failures.append(f"Shuttle recall {rec:.3f} < threshold {thresholds.min_shuttle_recall}")
        if reacq is not None and reacq > thresholds.max_reacquisition_duration_sec:
            failures.append(f"Shuttle reacquisition {reacq:.2f}s > threshold {thresholds.max_reacquisition_duration_sec}s")
        if fp_rate is not None and fp_rate > thresholds.max_shuttle_false_positives_per_1000:
            failures.append(f"Shuttle FP rate {fp_rate:.2f} > threshold {thresholds.max_shuttle_false_positives_per_1000}")

    passed = (len(failures) == 0) if status == "MEASURED" else False
    final_status = "VALIDATED" if (status == "MEASURED" and passed) else ("BLOCKED" if failures else status)

    return ShuttleCloseoutMetrics(
        status=final_status,
        provenance=provenance,
        precision=prec,
        recall=rec,
        false_positive_count=fp_count,
        false_positive_rate_per_1000=fp_rate,
        reacquisition_duration_sec=reacq,
        passed_thresholds=passed,
        failure_reasons=failures,
        dataset_status=ds_status,
    )


def validate_phase3_certification_gates(
    clip: BenchmarkClipEntry,
    thresholds: Phase3QualityThresholds,
    cut_metrics: CameraCutBenchmarkMetrics,
    cal_metrics: CalibrationBenchmarkMetrics,
    ground_metrics: GroundPositionBenchmarkMetrics,
    id_metrics: TrackingIdentityBenchmarkMetrics,
    shuttle_metrics: Optional[ShuttleCloseoutMetrics] = None,
    by_scenario: Optional[dict[str, ScenarioBenchmarkMetrics]] = None,
    evaluated_media_sha: Optional[str] = None,
    all_splits: Optional[dict[str, list[BenchmarkClipEntry]]] = None,
    model_predictions_as_gt: bool = False,
    unknown_converted_to_absent: bool = False,
    is_synthetic_fixture: bool = False,
    require_all_scenarios: bool = True,
    require_independent_review: bool = True,
    experimental_capabilities: Optional[Sequence[str]] = None,
    required_capabilities: Optional[Sequence[str]] = None,
) -> tuple[bool, dict[str, str], list[str], dict[str, bool]]:
    """
    Evaluates all Phase 3 benchmark safety gates and returns:
    (certification_passed, capability_outcomes, blockers, gate_checks).
    """
    blockers: list[str] = []
    gate_checks: dict[str, bool] = {}
    capability_outcomes: dict[str, str] = {}

    req_caps = list(required_capabilities or ["camera_cuts", "calibration", "ground_position", "identity", "shuttle_tracking"])
    exp_caps = set(experimental_capabilities or [])

    # Gate 1: Threshold status must be APPROVED_FROZEN
    if thresholds.status != THRESHOLD_STATUS_APPROVED:
        blockers.append(
            f"Threshold status is '{thresholds.status}', not '{THRESHOLD_STATUS_APPROVED}'; "
            "certification is blocked until thresholds are approved by product owner."
        )
        gate_checks["thresholds_approved"] = False
    else:
        gate_checks["thresholds_approved"] = True

    # Gate 2: Source media SHA-256 present
    source_sha = clip.source_media_sha256
    if not source_sha and clip.recording_group and clip.recording_group.startswith("sha256:"):
        source_sha = clip.recording_group.split("sha256:")[1].strip()
    if not source_sha and clip.video_reference and len(clip.video_reference.strip()) == 64 and all(c in "0123456789abcdefABCDEF" for c in clip.video_reference.strip()):
        source_sha = clip.video_reference.strip()
    if not source_sha and evaluated_media_sha and is_synthetic_fixture:
        source_sha = evaluated_media_sha

    if not source_sha:
        blockers.append(f"Source media SHA-256 is missing for clip '{clip.id}'.")
        gate_checks["source_sha_present"] = False
    else:
        gate_checks["source_sha_present"] = True

    # Gate 3: GT media SHA parity with evaluated media
    gt_sha = clip.gt_media_sha256 or source_sha
    if evaluated_media_sha and gt_sha:
        if gt_sha.lower().strip() != evaluated_media_sha.lower().strip():
            blockers.append(
                f"GT media SHA-256 ('{gt_sha}') does not match evaluated media SHA-256 ('{evaluated_media_sha}') for clip '{clip.id}'."
            )
            gate_checks["media_sha_parity"] = False
        else:
            gate_checks["media_sha_parity"] = True
    elif evaluated_media_sha is not None and not gt_sha:
        blockers.append(f"Missing GT media SHA-256 for parity check against evaluated media on clip '{clip.id}'.")
        gate_checks["media_sha_parity"] = False
    else:
        gate_checks["media_sha_parity"] = True

    # Gate 4: recordingGroup present
    rec_group = str(clip.recording_group or "").strip()
    if not rec_group or rec_group.startswith("ungrouped_"):
        blockers.append(f"Missing recordingGroup for clip '{clip.id}' (required for split isolation).")
        gate_checks["recording_group_present"] = False
    else:
        gate_checks["recording_group_present"] = True

    # Gate 5: Data split validity & development vs holdout
    split_name = clip.split
    if not split_name or split_name not in BENCHMARK_SPLITS or split_name.startswith("UNASSIGNED"):
        blockers.append(f"Data split for clip '{clip.id}' is invalid or unassigned: '{split_name}'.")
        gate_checks["valid_data_split"] = False
    else:
        gate_checks["valid_data_split"] = True

    if clip.is_development_data and split_name in ("holdout", "blind_test"):
        blockers.append(f"Clip '{clip.id}' is flagged as development data but claimed as held-out split '{split_name}'.")
        gate_checks["no_dev_data_as_holdout"] = False
    elif split_name == "development" and not is_synthetic_fixture and (clip.ground_truth_available or clip.camera_cut_ground_truth_available or clip.calibration_ground_truth_available):
        blockers.append(f"Clip '{clip.id}' is in 'development' split; cannot be used for held-out certification.")
        gate_checks["no_dev_data_as_holdout"] = False
    else:
        gate_checks["no_dev_data_as_holdout"] = True

    # Gate 6: Required primary human reviewer ID
    reviewer_id = str(clip.primary_reviewer_id or "").strip()
    if not reviewer_id or reviewer_id.lower() in ("ai", "assistant", "system", "model", "none", "unknown"):
        blockers.append(f"Missing or invalid primary human reviewer ID for clip '{clip.id}' (got '{clip.primary_reviewer_id}').")
        gate_checks["primary_reviewer_present"] = False
    else:
        gate_checks["primary_reviewer_present"] = True

    # Gate 7: Independent second reviewer
    is_heldout = split_name in ("holdout", "blind_test")
    if (is_heldout or require_independent_review) and not is_synthetic_fixture:
        second_reviewer = str(clip.independent_second_reviewer or "").strip()
        if not second_reviewer or second_reviewer.lower() in ("ai", "assistant", "system", "model", "none", "unknown"):
            blockers.append(f"Independent second review is required for held-out certification but missing for clip '{clip.id}'.")
            gate_checks["independent_reviewer_present"] = False
        elif second_reviewer.lower() == reviewer_id.lower():
            blockers.append(
                f"Independent second reviewer equals primary reviewer ('{reviewer_id}') for clip '{clip.id}'; independent review requirement violated."
            )
            gate_checks["independent_reviewer_present"] = False
        else:
            gate_checks["independent_reviewer_present"] = True
    else:
        gate_checks["independent_reviewer_present"] = True

    # Gate 8: Prediction blinding requirement
    blinding = str(clip.prediction_blinding_status or "").strip().upper()
    if blinding != "BLINDED":
        blockers.append(
            f"Prediction blinding requirement not satisfied for clip '{clip.id}' (status: '{clip.prediction_blinding_status}'); "
            "Ground Truth must be annotated with model predictions hidden."
        )
        gate_checks["prediction_blinding"] = False
    else:
        gate_checks["prediction_blinding"] = True

    # Gate 9: No self-prediction as GT
    if model_predictions_as_gt or clip.model_predictions_used_as_gt:
        blockers.append(f"Model predictions were used as their own Ground Truth for clip '{clip.id}'.")
        gate_checks["no_self_prediction_as_gt"] = False
    else:
        gate_checks["no_self_prediction_as_gt"] = True

    # Gate 10: UNKNOWN conversion protection
    if unknown_converted_to_absent or clip.unknown_converted_to_absent:
        blockers.append(f"UNKNOWN ground truth frames were silently converted into ABSENT for clip '{clip.id}'.")
        gate_checks["no_unknown_as_absent"] = False
    else:
        gate_checks["no_unknown_as_absent"] = True

    # Gate 11: Annotation completeness
    if clip.annotation_interval_complete is False:
        blockers.append(f"Annotation interval is incomplete for clip '{clip.id}'.")
        gate_checks["annotation_complete"] = False
    else:
        gate_checks["annotation_complete"] = True

    # Gate 12: Split leakage
    if all_splits:
        no_leakage, leakage_errors = validate_split_leakage(all_splits)
        if not no_leakage:
            for err in leakage_errors:
                blockers.append(f"Split leakage detected: {err}")
            gate_checks["split_leakage_free"] = False
        else:
            gate_checks["split_leakage_free"] = True
    else:
        gate_checks["split_leakage_free"] = True

    # Gate 13: Required scenario coverage (all 14 buckets)
    if require_all_scenarios:
        covered_buckets = set()
        if by_scenario:
            covered_buckets.update(by_scenario.keys())
        if clip.scenario_buckets:
            covered_buckets.update(clip.scenario_buckets)
        missing_buckets = [b for b in SCENARIO_BUCKETS if b not in covered_buckets]
        if missing_buckets:
            blockers.append(f"Missing required scenario coverage ({len(missing_buckets)}/14 missing): {sorted(missing_buckets)}.")
            gate_checks["all_scenarios_covered"] = False
        else:
            gate_checks["all_scenarios_covered"] = True
    else:
        gate_checks["all_scenarios_covered"] = True

    # Gate 14: Capability-level validation
    # Camera cuts
    if cut_metrics.status == "FAILED_VALIDATION":
        capability_outcomes["camera_cuts"] = CAPABILITY_STATUS_BLOCKED
    elif cut_metrics.status == "MEASURED":
        pass_f1 = cut_metrics.f1 is not None and cut_metrics.f1 >= thresholds.min_camera_cut_f1
        pass_prec = cut_metrics.precision is None or cut_metrics.precision >= thresholds.min_camera_cut_precision
        pass_rec = cut_metrics.recall is None or cut_metrics.recall >= thresholds.min_camera_cut_recall
        pass_lat = cut_metrics.mean_detection_latency_sec is None or cut_metrics.mean_detection_latency_sec <= thresholds.max_camera_cut_latency_sec
        if pass_f1 and pass_prec and pass_rec and pass_lat:
            capability_outcomes["camera_cuts"] = CAPABILITY_STATUS_VALIDATED
        else:
            capability_outcomes["camera_cuts"] = CAPABILITY_STATUS_BLOCKED
    else:
        capability_outcomes["camera_cuts"] = CAPABILITY_STATUS_NOT_VALIDATED

    # Calibration
    if cal_metrics.status == "FAILED_VALIDATION":
        capability_outcomes["calibration"] = CAPABILITY_STATUS_BLOCKED
    elif cal_metrics.status == "MEASURED":
        pass_rep = cal_metrics.reprojection_error_px_mean is None or cal_metrics.reprojection_error_px_mean <= thresholds.max_reprojection_error_px
        pass_fv = cal_metrics.false_valid_calibration_count is None or cal_metrics.false_valid_calibration_count <= thresholds.max_false_valid_calibration_count
        pass_relock = cal_metrics.relock_latency_sec is None or cal_metrics.relock_latency_sec <= thresholds.max_relock_latency_sec
        if pass_rep and pass_fv and pass_relock:
            capability_outcomes["calibration"] = CAPABILITY_STATUS_VALIDATED
        else:
            capability_outcomes["calibration"] = CAPABILITY_STATUS_BLOCKED
    else:
        capability_outcomes["calibration"] = CAPABILITY_STATUS_NOT_VALIDATED

    # Ground position
    if ground_metrics.status == "FAILED_VALIDATION":
        capability_outcomes["ground_position"] = CAPABILITY_STATUS_BLOCKED
    elif ground_metrics.status == "MEASURED":
        pass_pos = ground_metrics.court_position_error_m_mean is None or ground_metrics.court_position_error_m_mean <= thresholds.max_court_position_error_m
        if pass_pos:
            capability_outcomes["ground_position"] = CAPABILITY_STATUS_VALIDATED
        else:
            capability_outcomes["ground_position"] = CAPABILITY_STATUS_BLOCKED
    else:
        capability_outcomes["ground_position"] = CAPABILITY_STATUS_NOT_VALIDATED

    # Tracking identity
    if id_metrics.status == "FAILED_VALIDATION":
        capability_outcomes["identity"] = CAPABILITY_STATUS_BLOCKED
    elif id_metrics.status == "MEASURED":
        pass_sw = id_metrics.id_switches_per_10_min is None or id_metrics.id_switches_per_10_min <= thresholds.max_id_switches_per_10_min
        if pass_sw:
            capability_outcomes["identity"] = CAPABILITY_STATUS_VALIDATED
        else:
            capability_outcomes["identity"] = CAPABILITY_STATUS_BLOCKED
    else:
        capability_outcomes["identity"] = CAPABILITY_STATUS_NOT_VALIDATED

    # Shuttle tracking
    if shuttle_metrics is None or shuttle_metrics.status == "UNAVAILABLE":
        capability_outcomes["shuttle_tracking"] = CAPABILITY_STATUS_NOT_VALIDATED
    elif shuttle_metrics.status in ("FAILED_VALIDATION", "BLOCKED"):
        capability_outcomes["shuttle_tracking"] = CAPABILITY_STATUS_BLOCKED
    elif shuttle_metrics.status in ("MEASURED", "VALIDATED"):
        if shuttle_metrics.passed_thresholds is True or (shuttle_metrics.passed_thresholds is None and len(shuttle_metrics.failure_reasons) == 0):
            capability_outcomes["shuttle_tracking"] = CAPABILITY_STATUS_VALIDATED
        else:
            capability_outcomes["shuttle_tracking"] = CAPABILITY_STATUS_BLOCKED
    else:
        capability_outcomes["shuttle_tracking"] = CAPABILITY_STATUS_NOT_VALIDATED

    # Mark experimental capabilities
    for cap in exp_caps:
        capability_outcomes[cap] = CAPABILITY_STATUS_EXPERIMENTAL

    # Check required capabilities
    for cap in req_caps:
        if cap in exp_caps:
            continue
        outcome = capability_outcomes.get(cap, CAPABILITY_STATUS_NOT_VALIDATED)
        if outcome != CAPABILITY_STATUS_VALIDATED:
            blockers.append(f"Required capability '{cap}' is '{outcome}', not '{CAPABILITY_STATUS_VALIDATED}'.")

    certification_passed = (
        len(blockers) == 0
        and all(capability_outcomes.get(c) == CAPABILITY_STATUS_VALIDATED for c in req_caps if c not in exp_caps)
        and gate_checks.get("thresholds_approved", False)
    )

    return certification_passed, capability_outcomes, blockers, gate_checks


def evaluate_phase3_closeout(
    clip: BenchmarkClipEntry,
    engine_version: str = "1.0.0",
    detector_model: Optional[str] = None,
    tracker_model: Optional[str] = None,
    reid_model: Optional[str] = None,
    shuttle_model: Optional[str] = None,
    calibration_provider: Optional[str] = None,
    camera_segment_info: Optional[dict[str, Any]] = None,
    runtime: Optional[str] = "pytorch",
    device: Optional[str] = "cpu",
    ground_truth_cuts: Optional[Sequence[float]] = None,
    predicted_cuts: Optional[Sequence[float]] = None,
    ground_truth_calibration: Optional[Dict[str, Any]] = None,
    predicted_calibration_frames: Optional[Sequence[Dict[str, Any]]] = None,
    ground_truth_positions: Optional[Sequence[Dict[str, Any]]] = None,
    predicted_positions: Optional[Sequence[Dict[str, Any]]] = None,
    ground_truth_tracks: Optional[Sequence[Dict[str, Any]]] = None,
    predicted_tracks: Optional[Sequence[Dict[str, Any]]] = None,
    shuttle_closeout_metrics: Optional[ShuttleCloseoutMetrics] = None,
    thresholds: Optional[Phase3QualityThresholds] = None,
    evaluated_media_sha: Optional[str] = None,
    all_splits: Optional[dict[str, list[BenchmarkClipEntry]]] = None,
    model_predictions_as_gt: bool = False,
    unknown_converted_to_absent: bool = False,
    is_synthetic_fixture: bool = False,
    require_all_scenarios: bool = True,
    require_independent_review: bool = True,
    experimental_capabilities: Optional[Sequence[str]] = None,
    required_capabilities: Optional[Sequence[str]] = None,
) -> Phase3BenchmarkReport:
    """
    Comprehensive Phase 3 Closeout Aggregator combining all capability evaluations,
    shuttle tracking closeout metrics, scenario breakdown, and certification safety gates.
    """
    effective_thresholds = thresholds or Phase3QualityThresholds()

    prov = Phase3BenchmarkProvenance(
        manifest_version=1,
        dataset_id=clip.recording_group or clip.venue_id or "default_dataset",
        clip_id=clip.id,
        engine_version=engine_version,
        detector_model=sanitize_path_reference(detector_model),
        tracker_model=sanitize_path_reference(tracker_model),
        reid_model=sanitize_path_reference(reid_model),
        shuttle_model=sanitize_path_reference(shuttle_model),
        calibration_provider=sanitize_path_reference(calibration_provider),
        camera_segment_info=camera_segment_info,
        runtime=runtime,
        device=device,
    )

    cut_metrics = evaluate_camera_cuts(ground_truth_cuts, predicted_cuts)
    cal_metrics = evaluate_calibration(ground_truth_calibration, predicted_calibration_frames)
    ground_metrics = evaluate_ground_position(ground_truth_positions, predicted_positions)
    id_metrics = evaluate_identity(ground_truth_tracks, predicted_tracks, duration_sec=clip.duration_sec)

    by_scenario, scenario_blockers = evaluate_scenario_breakdown(
        clip=clip,
        cut_metrics=cut_metrics,
        cal_metrics=cal_metrics,
        ground_metrics=ground_metrics,
        id_metrics=id_metrics,
        thresholds=effective_thresholds,
        shuttle_metrics=shuttle_closeout_metrics,
    )

    is_certified, cap_outcomes, cert_blockers, gate_checks = validate_phase3_certification_gates(
        clip=clip,
        thresholds=effective_thresholds,
        cut_metrics=cut_metrics,
        cal_metrics=cal_metrics,
        ground_metrics=ground_metrics,
        id_metrics=id_metrics,
        shuttle_metrics=shuttle_closeout_metrics,
        by_scenario=by_scenario,
        evaluated_media_sha=evaluated_media_sha,
        all_splits=all_splits,
        model_predictions_as_gt=model_predictions_as_gt,
        unknown_converted_to_absent=unknown_converted_to_absent,
        is_synthetic_fixture=is_synthetic_fixture,
        require_all_scenarios=require_all_scenarios,
        require_independent_review=require_independent_review,
        experimental_capabilities=experimental_capabilities,
        required_capabilities=required_capabilities,
    )

    all_blockers = list(scenario_blockers) + list(cert_blockers)

    return Phase3BenchmarkReport(
        provenance=prov,
        camera_cuts=cut_metrics,
        calibration=cal_metrics,
        ground_position=ground_metrics,
        identity=id_metrics,
        by_scenario=by_scenario,
        annotation_manifest_blockers=all_blockers,
        overall_passed=is_certified,
        thresholds=effective_thresholds,
        capability_outcomes=cap_outcomes,
        certification_blockers=cert_blockers,
        shuttle_metrics=shuttle_closeout_metrics,
        is_synthetic_fixture=is_synthetic_fixture,
        certification_passed=is_certified,
        gate_checks=gate_checks,
    )


def evaluate_phase3_benchmark(
    clip: BenchmarkClipEntry,
    engine_version: str = "1.0.0",
    detector_model: Optional[str] = None,
    tracker_model: Optional[str] = None,
    reid_model: Optional[str] = None,
    shuttle_model: Optional[str] = None,
    calibration_provider: Optional[str] = None,
    camera_segment_info: Optional[dict[str, Any]] = None,
    runtime: Optional[str] = "pytorch",
    device: Optional[str] = "cpu",
    ground_truth_cuts: Optional[Sequence[float]] = None,
    predicted_cuts: Optional[Sequence[float]] = None,
    ground_truth_calibration: Optional[Dict[str, Any]] = None,
    predicted_calibration_frames: Optional[Sequence[Dict[str, Any]]] = None,
    ground_truth_positions: Optional[Sequence[Dict[str, Any]]] = None,
    predicted_positions: Optional[Sequence[Dict[str, Any]]] = None,
    ground_truth_tracks: Optional[Sequence[Dict[str, Any]]] = None,
    predicted_tracks: Optional[Sequence[Dict[str, Any]]] = None,
    thresholds: Optional[Phase3QualityThresholds] = None,
    shuttle_closeout_metrics: Optional[ShuttleCloseoutMetrics] = None,
    evaluated_media_sha: Optional[str] = None,
    all_splits: Optional[dict[str, list[BenchmarkClipEntry]]] = None,
    model_predictions_as_gt: bool = False,
    unknown_converted_to_absent: bool = False,
    is_synthetic_fixture: bool = False,
    require_all_scenarios: bool = False,
    require_independent_review: bool = False,
) -> Phase3BenchmarkReport:
    """
    Evaluates complete Phase 3 benchmark suite against ground truth, enforcing
    safe reporting invariants, per-scenario breakdown, path sanitization, and frozen thresholds.
    """
    return evaluate_phase3_closeout(
        clip=clip,
        engine_version=engine_version,
        detector_model=detector_model,
        tracker_model=tracker_model,
        reid_model=reid_model,
        shuttle_model=shuttle_model,
        calibration_provider=calibration_provider,
        camera_segment_info=camera_segment_info,
        runtime=runtime,
        device=device,
        ground_truth_cuts=ground_truth_cuts,
        predicted_cuts=predicted_cuts,
        ground_truth_calibration=ground_truth_calibration,
        predicted_calibration_frames=predicted_calibration_frames,
        ground_truth_positions=ground_truth_positions,
        predicted_positions=predicted_positions,
        ground_truth_tracks=ground_truth_tracks,
        predicted_tracks=predicted_tracks,
        shuttle_closeout_metrics=shuttle_closeout_metrics,
        thresholds=thresholds,
        evaluated_media_sha=evaluated_media_sha,
        all_splits=all_splits,
        model_predictions_as_gt=model_predictions_as_gt,
        unknown_converted_to_absent=unknown_converted_to_absent,
        is_synthetic_fixture=is_synthetic_fixture,
        require_all_scenarios=require_all_scenarios,
        require_independent_review=require_independent_review,
    )
