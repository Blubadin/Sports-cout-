"""
ground_position.py — Canonical Ground Point and Feet Resolution (Phase 3.3)

Resolves canonical player ground point proxy from current-frame pose keypoints
or bounding box bottom center. Preserves provenance and individual feet observations.
"""

from __future__ import annotations

from dataclasses import dataclass
from math import isfinite
from numbers import Integral, Real
from typing import Any
import numpy as np

from pose_coordinate_space import (
    POSE_COORDINATE_SPACE_NORMALIZED_PERCENT,
    POSE_COORDINATE_SPACE_SOURCE_FRAME_PIXELS,
    SUPPORTED_POSE_COORDINATE_SPACES,
)

CANONICAL_PROVENANCE_BOTH_ANKLES = "pose_both_ankles"
CANONICAL_PROVENANCE_LEFT_ANKLE = "pose_left_ankle"
CANONICAL_PROVENANCE_RIGHT_ANKLE = "pose_right_ankle"
CANONICAL_PROVENANCE_BBOX = "bbox_bottom_center"

ALLOWED_GROUND_PROVENANCES = {
    CANONICAL_PROVENANCE_BOTH_ANKLES,
    CANONICAL_PROVENANCE_LEFT_ANKLE,
    CANONICAL_PROVENANCE_RIGHT_ANKLE,
    CANONICAL_PROVENANCE_BBOX,
}

COCO_LEFT_ANKLE_INDEX = 15
COCO_RIGHT_ANKLE_INDEX = 16
DEFAULT_ANKLE_CONFIDENCE_THRESHOLD = 0.40


@dataclass(frozen=True)
class FootObservation:
    """Observation of a single foot."""
    position_px: tuple[float, float] | None = None
    position_pct: tuple[float, float] | None = None
    confidence: float | None = None
    court_position_m: tuple[float, float] | None = None
    source: str = "detected"  # "detected" | "reused" | "none"
    age_frames: int = 0
    age_sec: float = 0.0
    is_stale: bool = False
    stale_reason: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "positionPx": (
                {"x": round(self.position_px[0], 1), "y": round(self.position_px[1], 1)}
                if self.position_px is not None
                else None
            ),
            "positionPct": (
                {"x": round(self.position_pct[0], 2), "y": round(self.position_pct[1], 2)}
                if self.position_pct is not None
                else None
            ),
            "confidence": self.confidence,
            "courtPositionM": (
                {"xM": round(self.court_position_m[0], 2), "yM": round(self.court_position_m[1], 2)}
                if self.court_position_m is not None
                else None
            ),
            "source": self.source,
            "ageFrames": self.age_frames,
            "ageSec": round(self.age_sec, 3),
            "isStale": self.is_stale,
            "staleReason": self.stale_reason,
        }


@dataclass(frozen=True)
class CanonicalGroundPoint:
    """Canonical ground position proxy and individual foot observations."""
    ground_px: tuple[float, float]
    ground_pct: tuple[float, float]
    provenance: str
    left_foot: FootObservation
    right_foot: FootObservation
    ground_position_m: tuple[float, float] | None = None
    confidence: float = 1.0
    pose_source: str = "fresh"  # "fresh" | "reused" | "stale_fallback" | "none"
    pose_age_frames: int = 0
    pose_age_sec: float = 0.0
    is_stale: bool = False
    stale_reason: str | None = None

    def __post_init__(self) -> None:
        if self.provenance not in ALLOWED_GROUND_PROVENANCES:
            raise ValueError(f"Unknown ground point provenance: {self.provenance}")
        if not (isfinite(self.ground_px[0]) and isfinite(self.ground_px[1])):
            raise ValueError("Ground point pixels must be finite")
        if not (isfinite(self.ground_pct[0]) and isfinite(self.ground_pct[1])):
            raise ValueError("Ground point percentages must be finite")

    @property
    def metric_eligible(self) -> bool:
        return (self.ground_position_m is not None and not self.is_stale
                and self.pose_age_frames == 0 and self.pose_source == "fresh"
                and self.provenance != CANONICAL_PROVENANCE_BBOX
                and self.confidence >= DEFAULT_ANKLE_CONFIDENCE_THRESHOLD)

    @property
    def quality(self) -> str:
        if not self.metric_eligible:
            return "VISUAL_ONLY"
        return "BOTH_ANKLES" if self.provenance == CANONICAL_PROVENANCE_BOTH_ANKLES else "SINGLE_ANKLE"

    def to_dict(self) -> dict[str, Any]:
        return {
            "groundPx": {"x": round(self.ground_px[0], 1), "y": round(self.ground_px[1], 1)},
            "groundPct": {"x": round(self.ground_pct[0], 2), "y": round(self.ground_pct[1], 2)},
            "provenance": self.provenance,
            "validity": "STALE" if self.is_stale else "OBSERVED",
            "metricEligible": self.metric_eligible,
            "metricQuality": self.quality,
            "confidence": round(self.confidence, 3),
            "poseSource": self.pose_source,
            "poseAgeFrames": self.pose_age_frames,
            "poseAgeSec": round(self.pose_age_sec, 3),
            "isStale": self.is_stale,
            "staleReason": self.stale_reason,
            "leftFoot": self.left_foot.to_dict(),
            "rightFoot": self.right_foot.to_dict(),
            "groundPositionM": (
                {"xM": round(self.ground_position_m[0], 2), "yM": round(self.ground_position_m[1], 2)}
                if self.ground_position_m is not None
                else None
            ),
        }


def _extract_keypoint(kp: Any) -> tuple[float, float, float] | None:
    """Extract (x, y, score) from a keypoint entry."""
    if kp is None:
        return None
    if isinstance(kp, dict):
        x = kp.get("x")
        y = kp.get("y")
        score = kp.get("score", kp.get("conf", 0.0))
    elif isinstance(kp, (list, tuple)) and len(kp) >= 3:
        x, y, score = kp[0], kp[1], kp[2]
    elif isinstance(kp, (list, tuple)) and len(kp) == 2:
        x, y, score = kp[0], kp[1], 1.0
    else:
        return None

    values = (x, y, score)
    if any(value is None or isinstance(value, bool) or not isinstance(value, Real) for value in values):
        return None

    x, y, score = (float(value) for value in values)
    if not (isfinite(x) and isfinite(y) and isfinite(score)) or not 0.0 <= score <= 1.0:
        return None
    return x, y, score


def _positive_frame_dimension(value: Any, name: str) -> int:
    if isinstance(value, bool) or not isinstance(value, Real):
        raise ValueError(f"{name} must be a positive integer")
    numeric_value = float(value)
    if not isfinite(numeric_value) or numeric_value <= 0 or not numeric_value.is_integer():
        raise ValueError(f"{name} must be a positive integer")
    return int(numeric_value)


def _keypoint_to_source_pixels(
    x: float,
    y: float,
    coordinate_space: str,
    frame_width: int,
    frame_height: int,
) -> tuple[float, float] | None:
    """Convert one explicitly labeled keypoint into source-frame pixel units."""
    if coordinate_space == POSE_COORDINATE_SPACE_SOURCE_FRAME_PIXELS:
        px_x, px_y = x, y
    elif coordinate_space == POSE_COORDINATE_SPACE_NORMALIZED_PERCENT:
        if not (0.0 <= x < 100.0 and 0.0 <= y < 100.0):
            return None
        px_x, px_y = (x / 100.0) * frame_width, (y / 100.0) * frame_height
    else:
        raise ValueError(f"Unsupported pose coordinate space: {coordinate_space!r}")

    if not (0.0 <= px_x < frame_width and 0.0 <= px_y < frame_height):
        return None
    return px_x, px_y


def _project_to_court(court_mapper: Any, point_px: tuple[float, float]) -> tuple[float, float] | None:
    try:
        x_m, y_m = court_mapper.pixel_to_real(point_px)
        x_m, y_m = float(x_m), float(y_m)
        if not (isfinite(x_m) and isfinite(y_m)):
            return None
        return round(x_m, 2), round(y_m, 2)
    except Exception:
        return None


def resolve_canonical_ground_point(
    bbox: list[float] | tuple[float, float, float, float] | np.ndarray,
    frame_width: int,
    frame_height: int,
    pose_keypoints: list[Any] | None = None,
    pose_coordinate_space: str | None = None,
    is_pose_reused: bool = False,
    pose_age_frames: int = 0,
    pose_age_sec: float = 0.0,
    max_pose_age_frames: int = 5,
    conf_threshold: float = DEFAULT_ANKLE_CONFIDENCE_THRESHOLD,
    bbox_confidence: float | None = None,
    court_mapper: Any | None = None,
    is_metric_valid: bool = False,
) -> CanonicalGroundPoint:
    """
    Resolve canonical ground point proxy for an athlete.

    Hierarchy:
    1. Both ankles reliable -> midpoint of ankles (provenance: pose_both_ankles)
    2. Left ankle only -> left ankle (provenance: pose_left_ankle)
    3. Right ankle only -> right ankle (provenance: pose_right_ankle)
    4. Fallback -> bbox bottom center (provenance: bbox_bottom_center)

    Reused pose keypoints or stale poses exceeding age limits are strictly rejected
    for ankle ground positioning to prevent fabricating missing feet.
    Fresh pose keypoints with at least 17 entries require an explicit
    ``pose_coordinate_space``. ``pixel`` means source-frame pixels; percent
    coordinates are converted only when explicitly labeled. Bounding boxes are
    also source-frame pixels and may end at the frame's right/bottom boundary.
    Individual foot court meter positions are calculated ONLY when is_metric_valid is True.
    """
    w = _positive_frame_dimension(frame_width, "frame_width")
    h = _positive_frame_dimension(frame_height, "frame_height")
    if bbox is None or len(bbox) < 4:
        raise ValueError("bbox must contain four source-frame pixel coordinates")
    bbox_values = bbox[:4]
    if any(isinstance(v, bool) or not isinstance(v, Real) for v in bbox_values):
        raise ValueError("bbox coordinates must be finite source-frame pixels")
    bbox_values = [float(v) for v in bbox_values]
    if not all(isfinite(v) for v in bbox_values):
        raise ValueError("bbox coordinates must be finite source-frame pixels")
    x1, y1, x2, y2 = bbox_values
    if not (0.0 <= x1 < x2 <= w and 0.0 <= y1 < y2 <= h):
        raise ValueError("bbox must be ordered and within source-frame pixel bounds")

    if (
        isinstance(conf_threshold, bool)
        or not isinstance(conf_threshold, Real)
        or not isfinite(float(conf_threshold))
        or not 0.0 <= float(conf_threshold) <= 1.0
    ):
        raise ValueError("conf_threshold must be finite and between 0 and 1")
    if not isinstance(pose_age_frames, Integral) or isinstance(pose_age_frames, bool) or pose_age_frames < 0:
        raise ValueError("pose_age_frames must be a non-negative integer")
    if (
        isinstance(pose_age_sec, bool)
        or not isinstance(pose_age_sec, Real)
        or not isfinite(float(pose_age_sec))
        or pose_age_sec < 0
    ):
        raise ValueError("pose_age_sec must be finite and non-negative")
    if not isinstance(max_pose_age_frames, Integral) or isinstance(max_pose_age_frames, bool) or max_pose_age_frames < 0:
        raise ValueError("max_pose_age_frames must be a non-negative integer")
    base_bbox_confidence = 0.5
    if bbox_confidence is not None:
        if (
            isinstance(bbox_confidence, bool)
            or not isinstance(bbox_confidence, Real)
            or not isfinite(float(bbox_confidence))
            or not 0.0 <= float(bbox_confidence) <= 1.0
        ):
            raise ValueError("bbox_confidence must be finite and between 0 and 1")
        base_bbox_confidence = float(bbox_confidence)
    if pose_keypoints and len(pose_keypoints) >= 17 and not is_pose_reused and pose_age_frames == 0:
        if not isinstance(pose_coordinate_space, str) or pose_coordinate_space not in SUPPORTED_POSE_COORDINATE_SPACES:
            raise ValueError("fresh pose keypoints require a supported pose_coordinate_space")
    elif pose_coordinate_space is not None and (
        not isinstance(pose_coordinate_space, str)
        or pose_coordinate_space not in SUPPORTED_POSE_COORDINATE_SPACES
    ):
        raise ValueError(f"Unsupported pose coordinate space: {pose_coordinate_space!r}")

    bbox_bottom_center_x = (x1 + x2) / 2.0
    bbox_bottom_center_y = float(y2)

    is_stale = False
    stale_reason: str | None = None
    if is_pose_reused:
        is_stale = True
        stale_reason = "reused_pose_cache"
    elif pose_age_frames > max_pose_age_frames:
        is_stale = True
        stale_reason = f"pose_age_exceeded_{pose_age_frames}_frames"
    elif pose_age_frames > 0:
        is_stale = True
        stale_reason = f"stale_pose_{pose_age_frames}_frames"

    la_valid = False
    ra_valid = False
    la_coordinate_invalid = False
    ra_coordinate_invalid = False
    la_x, la_y, la_conf = 0.0, 0.0, 0.0
    ra_x, ra_y, ra_conf = 0.0, 0.0, 0.0

    # Only fresh, non-stale keypoints are eligible for ankle ground positioning
    if not is_stale and pose_keypoints and len(pose_keypoints) >= 17:
        la_raw = _extract_keypoint(pose_keypoints[COCO_LEFT_ANKLE_INDEX])
        if la_raw is not None:
            raw_x, raw_y, score = la_raw
            if score >= conf_threshold:
                pixel_point = _keypoint_to_source_pixels(raw_x, raw_y, pose_coordinate_space, w, h)
                if pixel_point is not None:
                    la_x, la_y = pixel_point
                    la_conf = score
                    la_valid = True
                else:
                    la_coordinate_invalid = True

        ra_raw = _extract_keypoint(pose_keypoints[COCO_RIGHT_ANKLE_INDEX])
        if ra_raw is not None:
            raw_x, raw_y, score = ra_raw
            if score >= conf_threshold:
                pixel_point = _keypoint_to_source_pixels(raw_x, raw_y, pose_coordinate_space, w, h)
                if pixel_point is not None:
                    ra_x, ra_y = pixel_point
                    ra_conf = score
                    ra_valid = True
                else:
                    ra_coordinate_invalid = True

    # Determine ground point, provenance, confidence, and pose source
    if la_valid and ra_valid:
        gx = (la_x + ra_x) / 2.0
        gy = (la_y + ra_y) / 2.0
        provenance = CANONICAL_PROVENANCE_BOTH_ANKLES
        ground_conf = (la_conf + ra_conf) / 2.0
        pose_source = "fresh"
    elif la_valid:
        gx = la_x
        gy = la_y
        provenance = CANONICAL_PROVENANCE_LEFT_ANKLE
        ground_conf = la_conf
        pose_source = "fresh"
    elif ra_valid:
        gx = ra_x
        gy = ra_y
        provenance = CANONICAL_PROVENANCE_RIGHT_ANKLE
        ground_conf = ra_conf
        pose_source = "fresh"
    else:
        gx = bbox_bottom_center_x
        gy = bbox_bottom_center_y
        provenance = CANONICAL_PROVENANCE_BBOX
        base_bbox_conf = base_bbox_confidence
        if is_stale:
            pose_source = "reused" if is_pose_reused else "stale_fallback"
            decay = max(0.2, 1.0 - 0.1 * min(pose_age_frames, 5))
            ground_conf = float(min(1.0, max(0.1, base_bbox_conf * decay)))
        elif pose_keypoints and len(pose_keypoints) >= 17:
            pose_source = "fresh"
            ground_conf = base_bbox_conf
            stale_reason = (
                "ankle_coordinates_out_of_bounds"
                if la_coordinate_invalid or ra_coordinate_invalid
                else "ankles_below_confidence_threshold"
            )
        else:
            pose_source = "none"
            ground_conf = base_bbox_conf
            stale_reason = "no_pose_keypoints"

    gx_pct = round((gx / w) * 100.0, 2)
    gy_pct = round((gy / h) * 100.0, 2)

    # Metric court projections exist ONLY when metric calibration is valid
    can_project_metric = bool(is_metric_valid and court_mapper and getattr(court_mapper, "is_calibrated", False))

    ground_m: tuple[float, float] | None = None
    if can_project_metric:
        ground_m = _project_to_court(court_mapper, (gx, gy))

    left_foot: FootObservation
    if la_valid:
        la_pct = (round((la_x / w) * 100.0, 2), round((la_y / h) * 100.0, 2))
        la_m = None
        if can_project_metric:
            la_m = _project_to_court(court_mapper, (la_x, la_y))
        left_foot = FootObservation(
            position_px=(round(la_x, 1), round(la_y, 1)),
            position_pct=la_pct,
            confidence=round(la_conf, 3),
            court_position_m=la_m,
            source="detected",
            age_frames=0,
            age_sec=0.0,
            is_stale=False,
            stale_reason=None,
        )
    elif is_stale:
        left_foot = FootObservation(
            source="reused" if is_pose_reused else "none",
            age_frames=pose_age_frames,
            age_sec=round(pose_age_sec, 3),
            is_stale=True,
            stale_reason=stale_reason,
        )
    else:
        left_foot = FootObservation(
            source="none",
            age_frames=0,
            age_sec=0.0,
            is_stale=False,
            stale_reason="coordinate_out_of_bounds" if la_coordinate_invalid else "ankle_unobserved_or_low_conf",
        )

    right_foot: FootObservation
    if ra_valid:
        ra_pct = (round((ra_x / w) * 100.0, 2), round((ra_y / h) * 100.0, 2))
        ra_m = None
        if can_project_metric:
            ra_m = _project_to_court(court_mapper, (ra_x, ra_y))
        right_foot = FootObservation(
            position_px=(round(ra_x, 1), round(ra_y, 1)),
            position_pct=ra_pct,
            confidence=round(ra_conf, 3),
            court_position_m=ra_m,
            source="detected",
            age_frames=0,
            age_sec=0.0,
            is_stale=False,
            stale_reason=None,
        )
    elif is_stale:
        right_foot = FootObservation(
            source="reused" if is_pose_reused else "none",
            age_frames=pose_age_frames,
            age_sec=round(pose_age_sec, 3),
            is_stale=True,
            stale_reason=stale_reason,
        )
    else:
        right_foot = FootObservation(
            source="none",
            age_frames=0,
            age_sec=0.0,
            is_stale=False,
            stale_reason="coordinate_out_of_bounds" if ra_coordinate_invalid else "ankle_unobserved_or_low_conf",
        )

    return CanonicalGroundPoint(
        ground_px=(round(gx, 1), round(gy, 1)),
        ground_pct=(gx_pct, gy_pct),
        provenance=provenance,
        left_foot=left_foot,
        right_foot=right_foot,
        ground_position_m=ground_m,
        confidence=round(ground_conf, 3),
        pose_source=pose_source,
        pose_age_frames=pose_age_frames,
        pose_age_sec=round(pose_age_sec, 3),
        is_stale=is_stale,
        stale_reason=stale_reason,
    )
