"""
ai_service/shuttle_benchmark.py — Phase 2.6 Shuttle Quality Benchmark

Evaluates Phase-2 shuttlecock tracking predictions against ground truth.
Invariants:
1. NO FAKE ZEROES: Missing coordinates remain None. (0, 0) is never coerced for missing coordinates.
2. GROUND-TRUTH ALIGNMENT: Predictions align to GT via frameIndex or timestamp with explicit tolerance.
3. SEPARATE STATE METRICS: observed, predicted, interpolated, and lost states are tracked separately.
4. HONEST COMPLETENESS: If benchmark clips have not actually been annotated, reports
   "GROUND TRUTH DATASET INCOMPLETE" and refuses to generate fake accuracy numbers.
5. NO SCIENTIFIC INFLATION: Raw pixel errors and diagonal-normalized errors are preserved together.
"""

from __future__ import annotations

from dataclasses import dataclass, field
import json
import math
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple, Union

try:
    from ai_service.shuttle_benchmark_schema import (
        ShuttleBenchmarkClip,
        ShuttleBenchmarkManifest,
        ShuttleGroundTruthFrame,
    )
    from ai_service.shuttle_telemetry import (
        ShuttleObservation,
        ShuttlePositionPx,
    )
except ImportError:  # Direct execution support
    from shuttle_benchmark_schema import (
        ShuttleBenchmarkClip,
        ShuttleBenchmarkManifest,
        ShuttleGroundTruthFrame,
    )
    from shuttle_telemetry import (
        ShuttleObservation,
        ShuttlePositionPx,
    )


def _safe_float(value: Any) -> Optional[float]:
    if value is None:
        return None
    try:
        val = float(value)
        return val if math.isfinite(val) else None
    except (TypeError, ValueError):
        return None


def _safe_percentile(values: Sequence[float], percentile: float) -> Optional[float]:
    """Calculates percentile in [0, 100] without third-party library dependencies."""
    if not values:
        return None
    clean = sorted(v for v in values if math.isfinite(v))
    if not clean:
        return None
    if len(clean) == 1:
        return clean[0]
    rank = (percentile / 100.0) * (len(clean) - 1)
    low = int(math.floor(rank))
    high = int(math.ceil(rank))
    if low == high:
        return clean[low]
    weight = rank - low
    return clean[low] * (1.0 - weight) + clean[high] * weight


@dataclass(frozen=True)
class ShuttleBenchmarkConfig:
    """Controls for pairing predictions to ground truth and spatial matching."""

    timestamp_tolerance_sec: float = 0.02
    match_distance_threshold_px: Optional[float] = None

    def __post_init__(self) -> None:
        if not math.isfinite(self.timestamp_tolerance_sec) or self.timestamp_tolerance_sec < 0:
            raise ValueError("timestamp_tolerance_sec must be a non-negative finite number")
        if self.match_distance_threshold_px is not None:
            if not math.isfinite(self.match_distance_threshold_px) or self.match_distance_threshold_px <= 0:
                raise ValueError("match_distance_threshold_px must be a positive finite number or None")


@dataclass
class ShuttleAlignedPair:
    """Temporally aligned ground truth frame and tracker prediction."""

    frame_index: int
    timestamp_sec: float
    gt: Optional[ShuttleGroundTruthFrame] = None
    pred: Optional[ShuttleObservation] = None


@dataclass
class ShuttleQualityMetrics:
    """Standardized Phase 2.6 Shuttlecock Quality Benchmark Metrics."""

    dataset_status: str
    total_frames: int
    evaluated_duration_sec: float
    gt_visible_count: int
    gt_occluded_count: int
    gt_not_visible_count: int
    gt_unknown_count: int

    # Primary Accuracy Metrics
    visible_frame_recall: Optional[float]
    precision: Optional[float]
    true_positives_count: int
    false_positives_count: int
    false_negatives_count: int
    false_positives_per_minute: float

    # Spatial Error Metrics (Raw Image Pixels)
    position_evaluated_count: int
    mean_pixel_error: Optional[float]
    median_pixel_error: Optional[float]
    p95_pixel_error: Optional[float]

    # Normalized Position Error Metrics
    image_diagonal_px: Optional[float]
    normalization_formula: str
    mean_normalized_error: Optional[float]
    median_normalized_error: Optional[float]
    p95_normalized_error: Optional[float]

    # Track Continuity & Fragmentation
    track_continuity: Optional[float]
    longest_continuous_track_frames: int
    track_fragmentation_count: int

    # Lost & Gap Metrics
    lost_percent: float
    lost_frames_count: int
    longest_lost_gap_frames: int
    longest_lost_gap_sec: float

    # Reacquisition Metrics
    reacquisition_events_count: int
    mean_reacquisition_time_sec: Optional[float]
    p95_reacquisition_time_sec: Optional[float]
    mean_reacquisition_frames: Optional[float]
    p95_reacquisition_frames: Optional[float]

    # State Distribution (Reported Separately)
    observed_percent: float
    predicted_percent: float
    interpolated_percent: float
    unknown_percent: float
    observed_count: int
    predicted_count: int
    interpolated_count: int
    unknown_count: int

    # Performance Telemetry
    analysis_fps: Optional[float] = None
    processing_ratio: Optional[float] = None
    mean_inference_ms: Optional[float] = None
    device: Optional[str] = None
    runtime: Optional[str] = None
    precision_mode: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "datasetStatus": self.dataset_status,
            "totalFrames": self.total_frames,
            "evaluatedDurationSec": self.evaluated_duration_sec,
            "gtVisibleCount": self.gt_visible_count,
            "gtOccludedCount": self.gt_occluded_count,
            "gtNotVisibleCount": self.gt_not_visible_count,
            "gtUnknownCount": self.gt_unknown_count,
            "visibleFrameRecall": self.visible_frame_recall,
            "precision": self.precision,
            "truePositivesCount": self.true_positives_count,
            "falsePositivesCount": self.false_positives_count,
            "falseNegativesCount": self.false_negatives_count,
            "falsePositivesPerMinute": self.false_positives_per_minute,
            "positionEvaluatedCount": self.position_evaluated_count,
            "meanPixelError": self.mean_pixel_error,
            "medianPixelError": self.median_pixel_error,
            "p95PixelError": self.p95_pixel_error,
            "imageDiagonalPx": self.image_diagonal_px,
            "normalizationFormula": self.normalization_formula,
            "meanNormalizedError": self.mean_normalized_error,
            "medianNormalizedError": self.median_normalized_error,
            "p95NormalizedError": self.p95_normalized_error,
            "trackContinuity": self.track_continuity,
            "longestContinuousTrackFrames": self.longest_continuous_track_frames,
            "trackFragmentationCount": self.track_fragmentation_count,
            "lostPercent": self.lost_percent,
            "lostFramesCount": self.lost_frames_count,
            "longestLostGapFrames": self.longest_lost_gap_frames,
            "longestLostGapSec": self.longest_lost_gap_sec,
            "reacquisitionEventsCount": self.reacquisition_events_count,
            "meanReacquisitionTimeSec": self.mean_reacquisition_time_sec,
            "p95ReacquisitionTimeSec": self.p95_reacquisition_time_sec,
            "meanReacquisitionFrames": self.mean_reacquisition_frames,
            "p95ReacquisitionFrames": self.p95_reacquisition_frames,
            "observedPercent": self.observed_percent,
            "predictedPercent": self.predicted_percent,
            "interpolatedPercent": self.interpolated_percent,
            "unknownPercent": self.unknown_percent,
            "observedCount": self.observed_count,
            "predictedCount": self.predicted_count,
            "interpolatedCount": self.interpolated_count,
            "unknownCount": self.unknown_count,
            "analysisFps": self.analysis_fps,
            "processingRatio": self.processing_ratio,
            "meanInferenceMs": self.mean_inference_ms,
            "device": self.device,
            "runtime": self.runtime,
            "precision": self.precision_mode,
        }


def align_predictions_and_ground_truth(
    gt_frames: Sequence[Union[ShuttleGroundTruthFrame, Dict[str, Any]]],
    predictions: Sequence[Union[ShuttleObservation, Dict[str, Any]]],
    config: Optional[ShuttleBenchmarkConfig] = None,
) -> List[ShuttleAlignedPair]:
    """
    Aligns prediction observations to ground truth frames strictly.

    Primary alignment: by frame_index.
    Secondary alignment: by timestamp_sec within explicit small tolerance.
    Do not compare unrelated frames.
    """
    cfg = config or ShuttleBenchmarkConfig()

    parsed_gt: List[ShuttleGroundTruthFrame] = []
    for f in gt_frames:
        if isinstance(f, ShuttleGroundTruthFrame):
            parsed_gt.append(f)
        elif isinstance(f, dict):
            parsed_gt.append(ShuttleGroundTruthFrame.from_dict(f))

    parsed_pred: List[ShuttleObservation] = []
    for p in predictions:
        if isinstance(p, ShuttleObservation):
            parsed_pred.append(p)
        elif isinstance(p, dict):
            parsed_pred.append(ShuttleObservation.from_dict(p))

    # Fast indexed lookup by frameIndex
    gt_by_frame: Dict[int, ShuttleGroundTruthFrame] = {f.frame_index: f for f in parsed_gt}
    pred_by_frame: Dict[int, ShuttleObservation] = {p.frame_index: p for p in parsed_pred}

    all_frame_indices = sorted(set(gt_by_frame.keys()) | set(pred_by_frame.keys()))
    pairs: List[ShuttleAlignedPair] = []

    # Case 1: Both sets have matching or overlapping frame indices
    if any(idx in gt_by_frame and idx in pred_by_frame for idx in all_frame_indices) or not parsed_gt or not parsed_pred:
        for idx in all_frame_indices:
            gt_item = gt_by_frame.get(idx)
            pred_item = pred_by_frame.get(idx)
            t_sec = (
                gt_item.timestamp_sec
                if gt_item is not None
                else (pred_item.timestamp_sec if pred_item is not None else 0.0)
            )
            pairs.append(
                ShuttleAlignedPair(
                    frame_index=idx,
                    timestamp_sec=t_sec,
                    gt=gt_item,
                    pred=pred_item,
                )
            )
        return pairs

    # Case 2: Frame indices do not match (e.g. mismatched offset), align by timestamp tolerance
    sorted_gt = sorted(parsed_gt, key=lambda f: f.timestamp_sec)
    sorted_pred = sorted(parsed_pred, key=lambda p: p.timestamp_sec)

    pred_matched = set()
    for gt_item in sorted_gt:
        best_pred = None
        best_delta = float("inf")
        best_idx = None
        for p_idx, p in enumerate(sorted_pred):
            if p_idx in pred_matched:
                continue
            delta = abs(p.timestamp_sec - gt_item.timestamp_sec)
            if delta <= cfg.timestamp_tolerance_sec and delta < best_delta:
                best_delta = delta
                best_pred = p
                best_idx = p_idx

        if best_pred is not None and best_idx is not None:
            pred_matched.add(best_idx)
            pairs.append(
                ShuttleAlignedPair(
                    frame_index=gt_item.frame_index,
                    timestamp_sec=gt_item.timestamp_sec,
                    gt=gt_item,
                    pred=best_pred,
                )
            )
        else:
            pairs.append(
                ShuttleAlignedPair(
                    frame_index=gt_item.frame_index,
                    timestamp_sec=gt_item.timestamp_sec,
                    gt=gt_item,
                    pred=None,
                )
            )

    # Add unaligned predictions as well
    for p_idx, p in enumerate(sorted_pred):
        if p_idx not in pred_matched:
            pairs.append(
                ShuttleAlignedPair(
                    frame_index=p.frame_index,
                    timestamp_sec=p.timestamp_sec,
                    gt=None,
                    pred=p,
                )
            )

    pairs.sort(key=lambda item: (item.frame_index, item.timestamp_sec))
    return pairs


def evaluate_shuttle_tracking(
    aligned_pairs: Sequence[ShuttleAlignedPair],
    *,
    source_width: Optional[int] = None,
    source_height: Optional[int] = None,
    source_fps: Optional[float] = None,
    is_dataset_complete: bool = True,
    config: Optional[ShuttleBenchmarkConfig] = None,
    performance_metrics: Optional[Dict[str, Any]] = None,
) -> ShuttleQualityMetrics:
    """
    Evaluates tracking observations against ground truth according to Phase 2.6 specifications.

    If is_dataset_complete is False or aligned_pairs has no GT frames, sets
    dataset_status to 'GROUND TRUTH DATASET INCOMPLETE' and leaves accuracy values as None.
    """
    cfg = config or ShuttleBenchmarkConfig()
    perf = performance_metrics or {}

    total_frames = len(aligned_pairs)
    if total_frames > 0:
        timestamps = [p.timestamp_sec for p in aligned_pairs if math.isfinite(p.timestamp_sec)]
        duration_sec = max(timestamps) - min(timestamps) if timestamps else 0.0
        # If timestamps are identical (or single frame), estimate duration via FPS or frames
        if duration_sec <= 0.0 and source_fps and source_fps > 0:
            duration_sec = total_frames / source_fps
    else:
        duration_sec = 0.0

    # Counts by GT visibility
    gt_frames = [p.gt for p in aligned_pairs if p.gt is not None]
    gt_visible = [f for f in gt_frames if f.visibility == "visible"]
    gt_occluded = [f for f in gt_frames if f.visibility == "occluded"]
    gt_not_visible = [f for f in gt_frames if f.visibility == "not_visible"]
    gt_unknown = [f for f in gt_frames if f.visibility == "unknown"]

    gt_visible_count = len(gt_visible)
    gt_occluded_count = len(gt_occluded)
    gt_not_visible_count = len(gt_not_visible)
    gt_unknown_count = len(gt_unknown)

    # Check completeness
    if not is_dataset_complete or len(gt_frames) == 0:
        # State distribution on predictions alone is still computable
        pred_obs = sum(1 for p in aligned_pairs if p.pred and p.pred.state == "observed")
        pred_extrap = sum(1 for p in aligned_pairs if p.pred and p.pred.state == "predicted")
        pred_interp = sum(1 for p in aligned_pairs if p.pred and p.pred.state == "interpolated")
        pred_lost = sum(1 for p in aligned_pairs if p.pred and p.pred.state == "lost")
        pred_unk = sum(1 for p in aligned_pairs if not p.pred or p.pred.state == "unknown")

        return ShuttleQualityMetrics(
            dataset_status="GROUND TRUTH DATASET INCOMPLETE",
            total_frames=total_frames,
            evaluated_duration_sec=duration_sec,
            gt_visible_count=gt_visible_count,
            gt_occluded_count=gt_occluded_count,
            gt_not_visible_count=gt_not_visible_count,
            gt_unknown_count=gt_unknown_count,
            visible_frame_recall=None,
            precision=None,
            true_positives_count=0,
            false_positives_count=0,
            false_negatives_count=0,
            false_positives_per_minute=0.0,
            position_evaluated_count=0,
            mean_pixel_error=None,
            median_pixel_error=None,
            p95_pixel_error=None,
            image_diagonal_px=math.hypot(source_width or 0, source_height or 0)
            if (source_width and source_height)
            else None,
            normalization_formula="normalized_error = raw_pixel_error / sqrt(source_width^2 + source_height^2)",
            mean_normalized_error=None,
            median_normalized_error=None,
            p95_normalized_error=None,
            track_continuity=None,
            longest_continuous_track_frames=0,
            track_fragmentation_count=0,
            lost_percent=(pred_lost / total_frames * 100.0) if total_frames > 0 else 0.0,
            lost_frames_count=pred_lost,
            longest_lost_gap_frames=0,
            longest_lost_gap_sec=0.0,
            reacquisition_events_count=0,
            mean_reacquisition_time_sec=None,
            p95_reacquisition_time_sec=None,
            mean_reacquisition_frames=None,
            p95_reacquisition_frames=None,
            observed_percent=(pred_obs / total_frames * 100.0) if total_frames > 0 else 0.0,
            predicted_percent=(pred_extrap / total_frames * 100.0) if total_frames > 0 else 0.0,
            interpolated_percent=(pred_interp / total_frames * 100.0) if total_frames > 0 else 0.0,
            unknown_percent=(pred_unk / total_frames * 100.0) if total_frames > 0 else 0.0,
            observed_count=pred_obs,
            predicted_count=pred_extrap,
            interpolated_count=pred_interp,
            unknown_count=pred_unk,
            analysis_fps=_safe_float(perf.get("analysis_fps")),
            processing_ratio=_safe_float(perf.get("processing_ratio")),
            mean_inference_ms=_safe_float(perf.get("mean_inference_ms")),
            device=perf.get("device"),
            runtime=perf.get("runtime"),
            precision_mode=perf.get("precision"),
        )

    # 1. Primary Classification (TP, FP, FN) and Pixel Distance Errors
    tp_count = 0
    fp_count = 0
    fn_count = 0
    pixel_errors: List[float] = []

    for pair in aligned_pairs:
        gt = pair.gt
        pred = pair.pred

        # Visible ground truth evaluation
        if gt is not None and gt.visibility == "visible":
            # Target is visible in GT
            if (
                pred is not None
                and pred.state == "observed"
                and pred.position_px is not None
                and gt.x_px is not None
                and gt.y_px is not None
            ):
                dist = math.hypot(pred.position_px.x - gt.x_px, pred.position_px.y - gt.y_px)
                pixel_errors.append(dist)

                if cfg.match_distance_threshold_px is not None:
                    if dist <= cfg.match_distance_threshold_px:
                        tp_count += 1
                    else:
                        # Spatial mismatch beyond distance threshold
                        fn_count += 1
                        fp_count += 1
                else:
                    tp_count += 1
            else:
                # Missed visible shuttle (prediction is lost, unknown, predicted, or null)
                fn_count += 1

        # Not-visible ground truth evaluation
        elif gt is not None and gt.visibility == "not_visible":
            if pred is not None and pred.state == "observed" and pred.position_px is not None:
                # Model-generated observed shuttle when GT states no visible shuttle -> False Positive
                fp_count += 1

        # Occluded ground truth evaluation
        elif gt is not None and gt.visibility == "occluded":
            # Per prompt: Occluded/not-visible GT should not become false negative.
            # However if GT has known estimated coordinates and prediction is observed, we can evaluate pixel error.
            if (
                pred is not None
                and pred.state == "observed"
                and pred.position_px is not None
                and gt.x_px is not None
                and gt.y_px is not None
            ):
                dist = math.hypot(pred.position_px.x - gt.x_px, pred.position_px.y - gt.y_px)
                pixel_errors.append(dist)

        # Missing GT frames but observed prediction (when GT not present in sequence)
        elif gt is None:
            pass

    # Visible-Frame Recall: TP / gt_visible_count
    visible_frame_recall = (tp_count / gt_visible_count) if gt_visible_count > 0 else None

    # Precision: TP / (TP + FP)
    precision = (tp_count / (tp_count + fp_count)) if (tp_count + fp_count) > 0 else None

    # False Positives Per Minute
    duration_min = duration_sec / 60.0
    fp_per_min = (fp_count / duration_min) if duration_min > 0 else 0.0

    # 2. Pixel Error Metrics (Mean, Median, P95)
    mean_pixel_error = (sum(pixel_errors) / len(pixel_errors)) if pixel_errors else None
    median_pixel_error = _safe_percentile(pixel_errors, 50.0)
    p95_pixel_error = _safe_percentile(pixel_errors, 95.0)

    # 3. Normalized Position Error
    image_diagonal = None
    mean_norm_error = None
    median_norm_error = None
    p95_norm_error = None
    formula_str = "normalized_error = raw_pixel_error / sqrt(source_width^2 + source_height^2)"

    if source_width and source_height and source_width > 0 and source_height > 0:
        image_diagonal = math.hypot(source_width, source_height)
        if image_diagonal > 0 and pixel_errors:
            norm_errors = [e / image_diagonal for e in pixel_errors]
            mean_norm_error = sum(norm_errors) / len(norm_errors)
            median_norm_error = _safe_percentile(norm_errors, 50.0)
            p95_norm_error = _safe_percentile(norm_errors, 95.0)

    # 4. State Metrics (Reported Separately!)
    observed_count = sum(1 for p in aligned_pairs if p.pred and p.pred.state == "observed")
    predicted_count = sum(1 for p in aligned_pairs if p.pred and p.pred.state == "predicted")
    interpolated_count = sum(1 for p in aligned_pairs if p.pred and p.pred.state == "interpolated")
    lost_count = sum(1 for p in aligned_pairs if p.pred and p.pred.state == "lost")
    unknown_count = sum(1 for p in aligned_pairs if not p.pred or p.pred.state == "unknown")

    observed_pct = (observed_count / total_frames * 100.0) if total_frames > 0 else 0.0
    predicted_pct = (predicted_count / total_frames * 100.0) if total_frames > 0 else 0.0
    interpolated_pct = (interpolated_count / total_frames * 100.0) if total_frames > 0 else 0.0
    lost_pct = (lost_count / total_frames * 100.0) if total_frames > 0 else 0.0
    unknown_pct = (unknown_count / total_frames * 100.0) if total_frames > 0 else 0.0

    # 5. Lost Gaps
    longest_lost_gap_frames = 0
    current_lost_run = 0
    for p in aligned_pairs:
        if p.pred and p.pred.state == "lost":
            current_lost_run += 1
            if current_lost_run > longest_lost_gap_frames:
                longest_lost_gap_frames = current_lost_run
        else:
            current_lost_run = 0

    longest_lost_gap_sec = 0.0
    if longest_lost_gap_frames > 0:
        if source_fps and source_fps > 0:
            longest_lost_gap_sec = longest_lost_gap_frames / source_fps
        elif total_frames > 1 and duration_sec > 0:
            longest_lost_gap_sec = longest_lost_gap_frames * (duration_sec / (total_frames - 1))

    # 6. Track Continuity & Fragmentation
    # Evaluated over consecutive frames where GT is visible
    consecutive_visible_transitions = 0
    consecutive_observed_transitions = 0
    longest_continuous_track = 0
    current_continuous_track = 0
    fragmentation_count = 0
    was_observed_in_visible = False

    for idx in range(len(aligned_pairs)):
        pair = aligned_pairs[idx]
        is_gt_vis = pair.gt is not None and pair.gt.visibility == "visible"
        is_pred_obs = pair.pred is not None and pair.pred.state == "observed"

        if is_gt_vis:
            if is_pred_obs:
                current_continuous_track += 1
                if current_continuous_track > longest_continuous_track:
                    longest_continuous_track = current_continuous_track
                was_observed_in_visible = True
            else:
                if was_observed_in_visible:
                    fragmentation_count += 1
                current_continuous_track = 0
                was_observed_in_visible = False

            if idx > 0:
                prev_pair = aligned_pairs[idx - 1]
                if prev_pair.gt is not None and prev_pair.gt.visibility == "visible":
                    consecutive_visible_transitions += 1
                    if (
                        prev_pair.pred is not None
                        and prev_pair.pred.state == "observed"
                        and is_pred_obs
                    ):
                        consecutive_observed_transitions += 1
        else:
            was_observed_in_visible = False
            current_continuous_track = 0

    if consecutive_visible_transitions > 0:
        track_continuity = consecutive_observed_transitions / consecutive_visible_transitions
    elif gt_visible_count == 1:
        track_continuity = 1.0 if longest_continuous_track == 1 else 0.0
    else:
        track_continuity = None

    # 7. Reacquisition Metrics
    # Defined per prompt: After a GT-visible period resumes following loss/occlusion,
    # measure time/frames until a valid observed track is reacquired.
    reacquisition_times_sec: List[float] = []
    reacquisition_frames_list: List[int] = []

    had_prior_loss_or_occlusion = False
    for idx in range(len(aligned_pairs)):
        pair = aligned_pairs[idx]
        gt = pair.gt

        if gt is not None and gt.visibility in ("not_visible", "occluded"):
            had_prior_loss_or_occlusion = True
        elif had_prior_loss_or_occlusion and gt is not None and gt.visibility == "visible":
            # A GT-visible period has resumed following loss/occlusion!
            resume_idx = idx
            resume_time = pair.timestamp_sec

            reacquired_idx = None
            reacquired_time = None

            for search_idx in range(resume_idx, len(aligned_pairs)):
                s_pair = aligned_pairs[search_idx]
                if s_pair.gt is not None and s_pair.gt.visibility != "visible":
                    # GT became non-visible before tracker reacquired
                    break
                if (
                    s_pair.pred is not None
                    and s_pair.pred.state == "observed"
                    and s_pair.pred.position_px is not None
                ):
                    reacquired_idx = search_idx
                    reacquired_time = s_pair.timestamp_sec
                    break

            if reacquired_idx is not None and reacquired_time is not None:
                delta_frames = reacquired_idx - resume_idx
                delta_sec = max(0.0, reacquired_time - resume_time)
                reacquisition_frames_list.append(delta_frames)
                reacquisition_times_sec.append(delta_sec)

            had_prior_loss_or_occlusion = False


    reacq_count = len(reacquisition_times_sec)
    mean_reacq_sec = (sum(reacquisition_times_sec) / reacq_count) if reacq_count > 0 else None
    p95_reacq_sec = _safe_percentile(reacquisition_times_sec, 95.0)
    mean_reacq_frames = (sum(reacquisition_frames_list) / reacq_count) if reacq_count > 0 else None
    p95_reacq_frames = _safe_percentile(reacquisition_frames_list, 95.0)

    # Performance
    analysis_fps = _safe_float(perf.get("analysis_fps"))
    processing_ratio = _safe_float(perf.get("processing_ratio"))
    if processing_ratio is None and analysis_fps is not None and source_fps and source_fps > 0:
        processing_ratio = analysis_fps / source_fps

    return ShuttleQualityMetrics(
        dataset_status="COMPLETE",
        total_frames=total_frames,
        evaluated_duration_sec=duration_sec,
        gt_visible_count=gt_visible_count,
        gt_occluded_count=gt_occluded_count,
        gt_not_visible_count=gt_not_visible_count,
        gt_unknown_count=gt_unknown_count,
        visible_frame_recall=visible_frame_recall,
        precision=precision,
        true_positives_count=tp_count,
        false_positives_count=fp_count,
        false_negatives_count=fn_count,
        false_positives_per_minute=fp_per_min,
        position_evaluated_count=len(pixel_errors),
        mean_pixel_error=mean_pixel_error,
        median_pixel_error=median_pixel_error,
        p95_pixel_error=p95_pixel_error,
        image_diagonal_px=image_diagonal,
        normalization_formula=formula_str,
        mean_normalized_error=mean_norm_error,
        median_normalized_error=median_norm_error,
        p95_normalized_error=p95_norm_error,
        track_continuity=track_continuity,
        longest_continuous_track_frames=longest_continuous_track,
        track_fragmentation_count=fragmentation_count,
        lost_percent=lost_pct,
        lost_frames_count=lost_count,
        longest_lost_gap_frames=longest_lost_gap_frames,
        longest_lost_gap_sec=longest_lost_gap_sec,
        reacquisition_events_count=reacq_count,
        mean_reacquisition_time_sec=mean_reacq_sec,
        p95_reacquisition_time_sec=p95_reacq_sec,
        mean_reacquisition_frames=mean_reacq_frames,
        p95_reacquisition_frames=p95_reacq_frames,
        observed_percent=observed_pct,
        predicted_percent=predicted_pct,
        interpolated_percent=interpolated_pct,
        unknown_percent=unknown_pct,
        observed_count=observed_count,
        predicted_count=predicted_count,
        interpolated_count=interpolated_count,
        unknown_count=unknown_count,
        analysis_fps=analysis_fps,
        processing_ratio=processing_ratio,
        mean_inference_ms=_safe_float(perf.get("mean_inference_ms")),
        device=perf.get("device"),
        runtime=perf.get("runtime"),
        precision_mode=perf.get("precision"),
    )


def format_benchmark_report(
    clip_id: str,
    configuration_name: str,
    metrics: ShuttleQualityMetrics,
    limitations: Sequence[str] = (),
) -> str:
    """Formats the standardized PHASE 2.6 BENCHMARK REPORT."""
    lines: List[str] = [
        "PHASE 2.6 BENCHMARK REPORT",
        "",
        f"DATASET: {clip_id}",
    ]

    if metrics.dataset_status == "GROUND TRUTH DATASET INCOMPLETE":
        lines.extend([
            "STATUS: GROUND TRUTH DATASET INCOMPLETE",
            "",
            "NOTICE: Benchmark clips have not actually been fully annotated in the repository manifest.",
            "In accordance with Phase 2.6 protocol, no synthetic accuracy metrics were fabricated.",
            "",
            f"CONFIGURATIONS: {configuration_name}",
            f"TOTAL FRAMES: {metrics.total_frames}",
            f"OBSERVED: {metrics.observed_percent:.1f}% ({metrics.observed_count})",
            f"PREDICTED: {metrics.predicted_percent:.1f}% ({metrics.predicted_count})",
            f"INTERPOLATED: {metrics.interpolated_percent:.1f}% ({metrics.interpolated_count})",
            f"LOST: {metrics.lost_percent:.1f}% ({metrics.lost_frames_count})",
            f"UNKNOWN: {metrics.unknown_percent:.1f}% ({metrics.unknown_count})",
            "",
            "LIMITATIONS:",
            "- Ground truth dataset is incomplete for official accuracy benchmarking",
        ])
        for lim in limitations:
            lines.append(f"- {lim}")
        return "\n".join(lines)

    # Complete dataset report
    recall_str = f"{metrics.visible_frame_recall * 100.0:.1f}%" if metrics.visible_frame_recall is not None else "N/A"
    prec_str = f"{metrics.precision * 100.0:.1f}%" if metrics.precision is not None else "N/A"
    fp_min_str = f"{metrics.false_positives_per_minute:.2f}"

    mean_err_str = f"{metrics.mean_pixel_error:.2f} px" if metrics.mean_pixel_error is not None else "N/A"
    if metrics.mean_normalized_error is not None:
        mean_err_str += f" ({metrics.mean_normalized_error * 100.0:.2f}% diag)"

    med_err_str = f"{metrics.median_pixel_error:.2f} px" if metrics.median_pixel_error is not None else "N/A"
    if metrics.median_normalized_error is not None:
        med_err_str += f" ({metrics.median_normalized_error * 100.0:.2f}% diag)"

    p95_err_str = f"{metrics.p95_pixel_error:.2f} px" if metrics.p95_pixel_error is not None else "N/A"
    if metrics.p95_normalized_error is not None:
        p95_err_str += f" ({metrics.p95_normalized_error * 100.0:.2f}% diag)"

    continuity_str = (
        f"{metrics.track_continuity * 100.0:.1f}% (longest: {metrics.longest_continuous_track_frames} frames, fragments: {metrics.track_fragmentation_count})"
        if metrics.track_continuity is not None
        else f"N/A (longest: {metrics.longest_continuous_track_frames} frames)"
    )

    lost_str = f"{metrics.lost_percent:.1f}% ({metrics.lost_frames_count} frames, longest gap: {metrics.longest_lost_gap_frames} frames / {metrics.longest_lost_gap_sec:.2f}s)"

    if metrics.reacquisition_events_count > 0:
        reacq_str = (
            f"Mean: {metrics.mean_reacquisition_time_sec:.3f}s ({metrics.mean_reacquisition_frames:.1f} frames) | "
            f"P95: {metrics.p95_reacquisition_time_sec:.3f}s ({metrics.p95_reacquisition_frames:.1f} frames) | "
            f"Events: {metrics.reacquisition_events_count}"
        )
    else:
        reacq_str = "No reacquisition events during clip"

    fps_str = f"{metrics.analysis_fps:.1f}" if metrics.analysis_fps is not None else "N/A"
    ratio_str = f"{metrics.processing_ratio:.2f}x" if metrics.processing_ratio is not None else "N/A"
    inf_ms_str = f"{metrics.mean_inference_ms:.2f} ms" if metrics.mean_inference_ms is not None else "N/A"
    dev_str = metrics.device or "CPU"
    run_str = metrics.runtime or "N/A"
    prec_mode_str = metrics.precision_mode or "fp32"

    perf_str = f"FPS: {fps_str} | Ratio: {ratio_str} | Inference: {inf_ms_str} | Device: {dev_str} | Runtime: {run_str} ({prec_mode_str})"

    lines.extend([
        f"CONFIGURATIONS: {configuration_name}",
        "",
        f"VISIBLE-FRAME RECALL: {recall_str} (TP: {metrics.true_positives_count} / Visible: {metrics.gt_visible_count})",
        f"PRECISION: {prec_str}",
        f"FALSE POSITIVES/MIN: {fp_min_str} ({metrics.false_positives_count} FP across {metrics.evaluated_duration_sec:.1f}s)",
        "",
        f"MEAN ERROR: {mean_err_str}",
        f"MEDIAN ERROR: {med_err_str}",
        f"P95 ERROR: {p95_err_str}",
        f"NORMALIZATION FORMULA: {metrics.normalization_formula}",
        "",
        f"TRACK CONTINUITY: {continuity_str}",
        f"LOST: {lost_str}",
        f"REACQUISITION: {reacq_str}",
        "",
        "STATE DISTRIBUTION:",
        f"- Observed:     {metrics.observed_percent:.1f}% ({metrics.observed_count})",
        f"- Predicted:    {metrics.predicted_percent:.1f}% ({metrics.predicted_count})",
        f"- Interpolated: {metrics.interpolated_percent:.1f}% ({metrics.interpolated_count})",
        f"- Lost:         {metrics.lost_percent:.1f}% ({metrics.lost_frames_count})",
        f"- Unknown:      {metrics.unknown_percent:.1f}% ({metrics.unknown_count})",
        "",
        f"PERFORMANCE: {perf_str}",
        "",
        "LIMITATIONS:",
    ])

    if not limitations:
        lines.append("- Monocular 2D pixel estimates only; no 3D trajectory claims")
        lines.append("- Benchmarked on development test sequences; real match blur may vary")
    else:
        for lim in limitations:
            lines.append(f"- {lim}")

    return "\n".join(lines)


def run_benchmark_on_manifest(
    manifest_path_or_obj: Union[str, Path, ShuttleBenchmarkManifest],
) -> Dict[str, Any]:
    """
    Evaluates the clips registered in a manifest.
    When ground truth frames are incomplete or missing, accurately reports
    GROUND TRUTH DATASET INCOMPLETE for each unannotated clip.
    """
    if isinstance(manifest_path_or_obj, ShuttleBenchmarkManifest):
        manifest = manifest_path_or_obj
    else:
        manifest = ShuttleBenchmarkManifest.load_json(manifest_path_or_obj)

    results = {}
    for clip in manifest.clips:
        has_complete_gt = clip.ground_truth_available and bool(clip.ground_truth_frames)
        # S01 in bundled manifest has 5 sample frames for 15s clip (450 frames expected)
        expected_frames = int((clip.duration_sec or 10.0) * (clip.source_fps or 30.0))
        actual_frames = len(clip.ground_truth_frames) if clip.ground_truth_frames else 0
        if actual_frames < expected_frames * 0.8:
            has_complete_gt = False

        if not has_complete_gt:
            metrics = evaluate_shuttle_tracking(
                aligned_pairs=[],
                source_width=clip.source_width,
                source_height=clip.source_height,
                source_fps=clip.source_fps,
                is_dataset_complete=False,
            )
            report = format_benchmark_report(
                clip_id=clip.id,
                configuration_name="Temporal Tracker Baseline (Phase 2.2)",
                metrics=metrics,
                limitations=[
                    f"Clip {clip.id} lacks full frame-by-frame reviewed ground truth in manifest",
                ],
            )
            results[clip.id] = {
                "status": "GROUND TRUTH DATASET INCOMPLETE",
                "metrics": metrics.to_dict(),
                "report": report,
            }

    return results


if __name__ == "__main__":
    import sys

    default_manifest = (
        Path(__file__).resolve().parent.parent
        / "src"
        / "benchmarks"
        / "shuttleBenchmarkManifest.json"
    )

    manifest_path = Path(sys.argv[1]) if len(sys.argv) > 1 else default_manifest
    if not manifest_path.exists():
        print(f"Manifest not found at: {manifest_path}")
        sys.exit(1)

    print(f"Running Shuttle Benchmark on manifest: {manifest_path}\n")
    results = run_benchmark_on_manifest(manifest_path)
    for clip_id, res in results.items():
        print(res["report"])
        print("=" * 70)
