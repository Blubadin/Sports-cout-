"""
ground_position.py — Canonical Ground Point and Feet Resolution (Phase 3.3)

Resolves canonical player ground point proxy from current-frame pose keypoints
or bounding box bottom center. Preserves provenance and individual feet observations.
"""

from __future__ import annotations

from dataclasses import dataclass
from math import isfinite
from typing import Any
import numpy as np

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

    def __post_init__(self) -> None:
        if self.provenance not in ALLOWED_GROUND_PROVENANCES:
            raise ValueError(f"Unknown ground point provenance: {self.provenance}")
        if not (isfinite(self.ground_px[0]) and isfinite(self.ground_px[1])):
            raise ValueError("Ground point pixels must be finite")
        if not (isfinite(self.ground_pct[0]) and isfinite(self.ground_pct[1])):
            raise ValueError("Ground point percentages must be finite")


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

    if x is None or y is None or score is None:
        return None
    if not (isfinite(x) and isfinite(y) and isfinite(score)):
        return None
    return float(x), float(y), float(score)


def resolve_canonical_ground_point(
    bbox: list[float] | tuple[float, float, float, float] | np.ndarray,
    frame_width: int,
    frame_height: int,
    pose_keypoints: list[Any] | None = None,
    is_pose_reused: bool = False,
    conf_threshold: float = DEFAULT_ANKLE_CONFIDENCE_THRESHOLD,
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

    Reused pose keypoints from prior frames are rejected to avoid fabricating missing feet.
    Individual foot court meter positions are calculated ONLY when is_metric_valid is True.
    """
    w = max(1, int(frame_width))
    h = max(1, int(frame_height))

    x1, y1, x2, y2 = [float(v) for v in bbox[:4]]
    bbox_bottom_center_x = (x1 + x2) / 2.0
    bbox_bottom_center_y = float(y2)

    la_valid = False
    ra_valid = False
    la_x, la_y, la_conf = 0.0, 0.0, 0.0
    ra_x, ra_y, ra_conf = 0.0, 0.0, 0.0

    # Only current-frame (non-reused) keypoints are eligible for ankle ground positioning
    if not is_pose_reused and pose_keypoints and len(pose_keypoints) >= 17:
        la_raw = _extract_keypoint(pose_keypoints[COCO_LEFT_ANKLE_INDEX])
        if la_raw is not None:
            raw_x, raw_y, score = la_raw
            if score >= conf_threshold:
                # If keypoints were passed in percentage coordinates (<= 100), convert to pixels
                if raw_x <= 100.0 and raw_y <= 100.0 and w > 100:
                    px_x = (raw_x / 100.0) * w
                    px_y = (raw_y / 100.0) * h
                else:
                    px_x, px_y = raw_x, raw_y
                la_x, la_y, la_conf = px_x, px_y, score
                la_valid = True

        ra_raw = _extract_keypoint(pose_keypoints[COCO_RIGHT_ANKLE_INDEX])
        if ra_raw is not None:
            raw_x, raw_y, score = ra_raw
            if score >= conf_threshold:
                if raw_x <= 100.0 and raw_y <= 100.0 and w > 100:
                    px_x = (raw_x / 100.0) * w
                    px_y = (raw_y / 100.0) * h
                else:
                    px_x, px_y = raw_x, raw_y
                ra_x, ra_y, ra_conf = px_x, px_y, score
                ra_valid = True

    # Determine ground point and provenance
    if la_valid and ra_valid:
        gx = (la_x + ra_x) / 2.0
        gy = (la_y + ra_y) / 2.0
        provenance = CANONICAL_PROVENANCE_BOTH_ANKLES
    elif la_valid:
        gx = la_x
        gy = la_y
        provenance = CANONICAL_PROVENANCE_LEFT_ANKLE
    elif ra_valid:
        gx = ra_x
        gy = ra_y
        provenance = CANONICAL_PROVENANCE_RIGHT_ANKLE
    else:
        gx = bbox_bottom_center_x
        gy = bbox_bottom_center_y
        provenance = CANONICAL_PROVENANCE_BBOX

    gx_pct = round((gx / w) * 100.0, 2)
    gy_pct = round((gy / h) * 100.0, 2)

    # Metric court projections exist ONLY when metric calibration is valid
    can_project_metric = bool(is_metric_valid and court_mapper and getattr(court_mapper, "is_calibrated", False))

    ground_m: tuple[float, float] | None = None
    if can_project_metric:
        try:
            rx, ry = court_mapper.pixel_to_real((gx, gy))
            ground_m = (round(float(rx), 2), round(float(ry), 2))
        except Exception:
            ground_m = None

    left_foot: FootObservation
    if la_valid:
        la_pct = (round((la_x / w) * 100.0, 2), round((la_y / h) * 100.0, 2))
        la_m = None
        if can_project_metric:
            try:
                rx, ry = court_mapper.pixel_to_real((la_x, la_y))
                la_m = (round(float(rx), 2), round(float(ry), 2))
            except Exception:
                la_m = None
        left_foot = FootObservation(
            position_px=(round(la_x, 1), round(la_y, 1)),
            position_pct=la_pct,
            confidence=round(la_conf, 3),
            court_position_m=la_m,
        )
    else:
        left_foot = FootObservation()

    right_foot: FootObservation
    if ra_valid:
        ra_pct = (round((ra_x / w) * 100.0, 2), round((ra_y / h) * 100.0, 2))
        ra_m = None
        if can_project_metric:
            try:
                rx, ry = court_mapper.pixel_to_real((ra_x, ra_y))
                ra_m = (round(float(rx), 2), round(float(ry), 2))
            except Exception:
                ra_m = None
        right_foot = FootObservation(
            position_px=(round(ra_x, 1), round(ra_y, 1)),
            position_pct=ra_pct,
            confidence=round(ra_conf, 3),
            court_position_m=ra_m,
        )
    else:
        right_foot = FootObservation()

    return CanonicalGroundPoint(
        ground_px=(round(gx, 1), round(gy, 1)),
        ground_pct=(gx_pct, gy_pct),
        provenance=provenance,
        left_foot=left_foot,
        right_foot=right_foot,
        ground_position_m=ground_m,
    )
