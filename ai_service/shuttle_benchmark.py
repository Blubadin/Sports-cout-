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
from typing import Any, Dict, Iterable, List, Mapping, Optional, Sequence, Tuple, Union

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


DEFAULT_MATCH_DISTANCE_THRESHOLD_PX = 30.0


class DuplicateBenchmarkFrameError(ValueError):
    """Raised when a benchmark input contains more than one entry for a source frame."""


@dataclass(frozen=True)
class ShuttleBenchmarkConfig:
    """Controls for pairing predictions to ground truth and spatial matching."""

    timestamp_tolerance_sec: float = 0.02
    match_distance_threshold_px: Optional[float] = DEFAULT_MATCH_DISTANCE_THRESHOLD_PX
    match_distance_threshold_normalized: Optional[float] = None

    def __post_init__(self) -> None:
        if not math.isfinite(self.timestamp_tolerance_sec) or self.timestamp_tolerance_sec < 0:
            raise ValueError("timestamp_tolerance_sec must be a non-negative finite number")
        if self.match_distance_threshold_px is not None:
            if not math.isfinite(self.match_distance_threshold_px) or self.match_distance_threshold_px <= 0:
                raise ValueError("match_distance_threshold_px must be a positive finite number or None")
        if self.match_distance_threshold_normalized is not None:
            if (
                not math.isfinite(self.match_distance_threshold_normalized)
                or self.match_distance_threshold_normalized <= 0
            ):
                raise ValueError(
                    "match_distance_threshold_normalized must be a positive finite number or None"
                )


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
    true_positives_count: Optional[int]
    false_positives_count: Optional[int]
    false_negatives_count: Optional[int]
    false_positives_per_minute: Optional[float]

    # Spatial Error Metrics (Raw Image Pixels)
    position_evaluated_count: Optional[int]
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
    longest_lost_gap_sec: Optional[float]

    # Reacquisition Metrics
    reacquisition_events_count: Optional[int]
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
            "precisionMode": self.precision_mode,
        }


def _assert_unique_frame_indices(items: Sequence[Any], label: str) -> None:
    seen = set()
    for item in items:
        frame_index = item.frame_index
        if frame_index in seen:
            raise DuplicateBenchmarkFrameError(
                f"duplicate {label} frameIndex: {frame_index}"
            )
        seen.add(frame_index)


def _is_source_adjacent(previous: ShuttleAlignedPair, current: ShuttleAlignedPair) -> bool:
    """Checks source-frame adjacency without treating list position as time."""
    if current.frame_index != previous.frame_index + 1:
        return False
    return (
        math.isfinite(previous.timestamp_sec)
        and math.isfinite(current.timestamp_sec)
        and current.timestamp_sec >= previous.timestamp_sec
    )


def _effective_match_distance_px(
    config: ShuttleBenchmarkConfig,
    source_width: Optional[int],
    source_height: Optional[int],
) -> float:
    if config.match_distance_threshold_px is not None:
        return config.match_distance_threshold_px
    if (
        config.match_distance_threshold_normalized is not None
        and source_width
        and source_height
        and source_width > 0
        and source_height > 0
    ):
        return config.match_distance_threshold_normalized * math.hypot(source_width, source_height)
    return DEFAULT_MATCH_DISTANCE_THRESHOLD_PX


def _is_spatial_match(
    pred: Optional[ShuttleObservation],
    gt: Optional[ShuttleGroundTruthFrame],
    config: ShuttleBenchmarkConfig,
    source_width: Optional[int] = None,
    source_height: Optional[int] = None,
) -> bool:
    if (
        pred is None
        or pred.state != "observed"
        or pred.position_px is None
        or gt is None
        or gt.x_px is None
        or gt.y_px is None
    ):
        return False
    distance = math.hypot(pred.position_px.x - gt.x_px, pred.position_px.y - gt.y_px)
    return math.isfinite(distance) and distance <= _effective_match_distance_px(
        config, source_width, source_height
    )


def _has_finite_observed_position(pred: Optional[ShuttleObservation]) -> bool:
    return bool(
        pred is not None
        and pred.state == "observed"
        and pred.position_px is not None
        and math.isfinite(pred.position_px.x)
        and math.isfinite(pred.position_px.y)
    )


def _longest_lost_gap(
    aligned_pairs: Sequence[ShuttleAlignedPair],
    source_fps: Optional[float] = None,
) -> Tuple[int, Optional[float]]:
    longest_frames = 0
    longest_seconds: Optional[float] = 0.0
    current: List[ShuttleAlignedPair] = []

    def finish(run: List[ShuttleAlignedPair], boundary: Optional[ShuttleAlignedPair] = None) -> None:
        nonlocal longest_frames, longest_seconds
        if not run:
            return
        if len(run) > longest_frames:
            longest_frames = len(run)
            timestamps = [p.timestamp_sec for p in run if math.isfinite(p.timestamp_sec)]
            if (
                timestamps
                and boundary is not None
                and _is_source_adjacent(run[-1], boundary)
            ):
                longest_seconds = max(0.0, boundary.timestamp_sec - min(timestamps))
            elif source_fps is not None and math.isfinite(source_fps) and source_fps > 0:
                longest_seconds = len(run) / source_fps
            else:
                longest_seconds = max(timestamps) - min(timestamps) if len(timestamps) > 1 else None

    for pair in aligned_pairs:
        if pair.pred is not None and pair.pred.state == "lost":
            if current and not _is_source_adjacent(current[-1], pair):
                finish(current)
                current = []
            current.append(pair)
        else:
            finish(current, pair)
            current = []
    finish(current)
    return longest_frames, longest_seconds


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

    _assert_unique_frame_indices(parsed_gt, "ground truth")
    _assert_unique_frame_indices(parsed_pred, "prediction")

    # Fast indexed lookup by frameIndex
    gt_by_frame: Dict[int, ShuttleGroundTruthFrame] = {f.frame_index: f for f in parsed_gt}
    pred_by_frame: Dict[int, ShuttleObservation] = {p.frame_index: p for p in parsed_pred}

    all_frame_indices = sorted(set(gt_by_frame.keys()) | set(pred_by_frame.keys()))
    pairs: List[ShuttleAlignedPair] = []

    # The frame index is the source identity. Timestamp tolerance validates that
    # identity; it cannot override a conflicting frame index.
    for idx in all_frame_indices:
        gt_item = gt_by_frame.get(idx)
        pred_item = pred_by_frame.get(idx)
        if gt_item is not None and pred_item is not None:
            if (
                math.isfinite(gt_item.timestamp_sec)
                and math.isfinite(pred_item.timestamp_sec)
                and abs(gt_item.timestamp_sec - pred_item.timestamp_sec) <= cfg.timestamp_tolerance_sec
            ):
                pairs.append(ShuttleAlignedPair(idx, gt_item.timestamp_sec, gt_item, pred_item))
            else:
                pairs.extend([
                    ShuttleAlignedPair(idx, gt_item.timestamp_sec, gt_item, None),
                    ShuttleAlignedPair(idx, pred_item.timestamp_sec, None, pred_item),
                ])
        elif gt_item is not None:
            pairs.append(ShuttleAlignedPair(idx, gt_item.timestamp_sec, gt_item, None))
        elif pred_item is not None:
            pairs.append(ShuttleAlignedPair(idx, pred_item.timestamp_sec, None, pred_item))
    pairs.sort(key=lambda item: (item.frame_index, item.timestamp_sec, 0 if item.gt is not None else 1))
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

    pred_obs = sum(1 for p in aligned_pairs if p.pred and p.pred.state == "observed")
    pred_extrap = sum(1 for p in aligned_pairs if p.pred and p.pred.state == "predicted")
    pred_interp = sum(1 for p in aligned_pairs if p.pred and p.pred.state == "interpolated")
    pred_lost = sum(1 for p in aligned_pairs if p.pred and p.pred.state == "lost")
    pred_unk = sum(1 for p in aligned_pairs if not p.pred or p.pred.state == "unknown")
    longest_lost_gap_frames, longest_lost_gap_sec = _longest_lost_gap(aligned_pairs, source_fps)

    # Check completeness
    if not is_dataset_complete or len(gt_frames) == 0:
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
            true_positives_count=None,
            false_positives_count=None,
            false_negatives_count=None,
            false_positives_per_minute=None,
            position_evaluated_count=None,
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
            longest_lost_gap_frames=longest_lost_gap_frames,
            longest_lost_gap_sec=longest_lost_gap_sec,
            reacquisition_events_count=None,
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
            if _has_finite_observed_position(pred) and gt.x_px is not None and gt.y_px is not None:
                dist = math.hypot(pred.position_px.x - gt.x_px, pred.position_px.y - gt.y_px)
                if math.isfinite(dist):
                    pixel_errors.append(dist)

                if _is_spatial_match(pred, gt, cfg, source_width, source_height):
                    tp_count += 1
                else:
                    # A candidate at the wrong location is both a false positive
                    # and a miss for the visible GT target.
                    fn_count += 1
                    fp_count += 1
            else:
                # Missed visible shuttle (prediction is lost, unknown, predicted, or null)
                fn_count += 1

        # Not-visible ground truth evaluation
        elif gt is not None and gt.visibility == "not_visible":
            if _has_finite_observed_position(pred):
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
                if math.isfinite(dist):
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
    fp_per_min = (fp_count / duration_min) if duration_min > 0 else None

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

    # 6. Track Continuity & Fragmentation
    # Evaluated only over adjacent source frames where GT is visible.
    consecutive_visible_transitions = 0
    consecutive_observed_transitions = 0
    longest_continuous_track = 0
    current_continuous_track = 0
    fragmentation_count = 0
    was_observed_in_visible = False

    for idx in range(len(aligned_pairs)):
        pair = aligned_pairs[idx]
        is_gt_vis = pair.gt is not None and pair.gt.visibility == "visible"
        is_pred_obs = _is_spatial_match(
            pair.pred, pair.gt, cfg, source_width, source_height
        )

        if is_gt_vis:
            adjacent_visible = (
                idx > 0
                and aligned_pairs[idx - 1].gt is not None
                and aligned_pairs[idx - 1].gt.visibility == "visible"
                and _is_source_adjacent(aligned_pairs[idx - 1], pair)
            )
            if not adjacent_visible:
                current_continuous_track = 0
                was_observed_in_visible = False

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

            if adjacent_visible:
                prev_pair = aligned_pairs[idx - 1]
                consecutive_visible_transitions += 1
                if (
                    _is_spatial_match(
                        prev_pair.pred, prev_pair.gt, cfg, source_width, source_height
                    )
                    and is_pred_obs
                ):
                    consecutive_observed_transitions += 1
        else:
            was_observed_in_visible = False
            current_continuous_track = 0

    if consecutive_visible_transitions > 0:
        track_continuity = consecutive_observed_transitions / consecutive_visible_transitions
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
                if _is_spatial_match(s_pair.pred, s_pair.gt, cfg, source_width, source_height):
                    reacquired_idx = search_idx
                    reacquired_time = s_pair.timestamp_sec
                    break

            if reacquired_idx is not None and reacquired_time is not None:
                delta_frames = aligned_pairs[reacquired_idx].frame_index - pair.frame_index
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
    fp_min_str = (
        f"{metrics.false_positives_per_minute:.2f}"
        if metrics.false_positives_per_minute is not None
        else "N/A"
    )

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

    longest_gap_sec_str = (
        f"{metrics.longest_lost_gap_sec:.2f}s"
        if metrics.longest_lost_gap_sec is not None
        else "N/A"
    )
    lost_str = f"{metrics.lost_percent:.1f}% ({metrics.lost_frames_count} frames, longest gap: {metrics.longest_lost_gap_frames} frames / {longest_gap_sec_str})"

    if metrics.reacquisition_events_count is not None and metrics.reacquisition_events_count > 0:
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
    predictions_by_clip: Optional[Mapping[str, Sequence[Union[ShuttleObservation, Dict[str, Any]]]]] = None,
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

    results: Dict[str, Any] = {}
    for clip in manifest.clips:
        clip_gt = clip.ground_truth_frames or []
        expected_frames = None
        if clip.duration_sec and clip.duration_sec > 0 and clip.source_fps and clip.source_fps > 0:
            expected_frames = max(1, int(round(clip.duration_sec * clip.source_fps)))
        sorted_indices = sorted(frame.frame_index for frame in clip_gt)
        contiguous = bool(sorted_indices) and all(
            right == left + 1 for left, right in zip(sorted_indices, sorted_indices[1:])
        )
        has_complete_gt = bool(
            clip.ground_truth_available
            and expected_frames is not None
            and len(clip_gt) == expected_frames
            and contiguous
            and sorted_indices[0] == 0
            and sorted_indices[-1] == expected_frames - 1
            and all(frame.reviewed is True for frame in clip_gt)
        )
        predictions = list((predictions_by_clip or {}).get(clip.id, []))
        aligned_pairs = align_predictions_and_ground_truth(clip_gt if has_complete_gt else [], predictions)

        if not has_complete_gt:
            metrics = evaluate_shuttle_tracking(
                aligned_pairs=aligned_pairs,
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
        else:
            metrics = evaluate_shuttle_tracking(
                aligned_pairs=aligned_pairs,
                source_width=clip.source_width,
                source_height=clip.source_height,
                source_fps=clip.source_fps,
                is_dataset_complete=True,
            )
            report = format_benchmark_report(
                clip_id=clip.id,
                configuration_name="Temporal Tracker Baseline (Phase 2.2)",
                metrics=metrics,
            )
            results[clip.id] = {
                "status": "COMPLETE",
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
