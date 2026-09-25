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
    )


def sanitize_path_reference(path_or_str: Any) -> Optional[str]:
    """
    Strips sensitive local absolute paths (e.g. C:\\Users\\... or /home/...)
    preserving only relative logical model references or file basenames.
    """
    if path_or_str is None:
        return None
    raw = str(path_or_str).strip()
    if not raw:
        return None
    # If absolute Windows or Unix path, keep only logical basename or relative path
    if re.match(r"^[a-zA-Z]:[\\/]", raw) or raw.startswith("/") or "\\Users\\" in raw or "/home/" in raw:
        return Path(raw).name
    return raw


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
) -> Phase3BenchmarkReport:
    """
    Evaluates complete Phase 3 benchmark suite against ground truth, enforcing
    safe reporting invariants and path sanitization.
    """
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

    return Phase3BenchmarkReport(
        provenance=prov,
        camera_cuts=cut_metrics,
        calibration=cal_metrics,
        ground_position=ground_metrics,
        identity=id_metrics,
    )
