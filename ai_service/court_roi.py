"""
court_roi.py — Pure court ROI calculation and coordinate inversion utilities.

Ensures that when running object detection on an expanded court bounding box,
all output detections, bounding boxes, feet coordinates, and pose keypoints
are transformed back to full source frame pixel coordinates before homography,
storage, or visualization.
"""

from __future__ import annotations
import numpy as np


def calculate_court_roi(
    court_corners_px: np.ndarray | list[list[float]] | None,
    frame_width: int,
    frame_height: int,
    margin_px: int = 60,
) -> tuple[int, int, int, int]:
    """
    Calculate an expanded bounding box (ROI) around the calibrated court corners.

    Args:
        court_corners_px: 4 court corners [[x0, y0], ...].
        frame_width: Full source frame width in pixels.
        frame_height: Full source frame height in pixels.
        margin_px: Safety margin in pixels around the court boundary to account
                   for athletes moving outside the lines.

    Returns:
        (roi_x1, roi_y1, roi_x2, roi_y2) clamped to source frame bounds.
        If corners are invalid, returns (0, 0, frame_width, frame_height).
    """
    if court_corners_px is None:
        return 0, 0, frame_width, frame_height

    pts = np.asarray(court_corners_px, dtype=np.float32)
    if pts.shape[0] < 4 or pts.ndim != 2:
        return 0, 0, frame_width, frame_height

    min_x = float(np.min(pts[:, 0]))
    max_x = float(np.max(pts[:, 0]))
    min_y = float(np.min(pts[:, 1]))
    max_y = float(np.max(pts[:, 1]))

    margin = max(0, int(margin_px))
    roi_x1 = max(0, int(min_x - margin))
    roi_y1 = max(0, int(min_y - margin))
    roi_x2 = min(frame_width, int(max_x + margin))
    roi_y2 = min(frame_height, int(max_y + margin))

    # Reject degenerate or inverted ROI
    if (roi_x2 - roi_x1) < 50 or (roi_y2 - roi_y1) < 50:
        return 0, 0, frame_width, frame_height

    return roi_x1, roi_y1, roi_x2, roi_y2


def inverse_transform_bbox(
    bbox: list[float] | tuple[float, float, float, float],
    offset_x: int,
    offset_y: int,
) -> list[float]:
    """
    Transform a bounding box from ROI crop coordinates back to full source coordinates.
    [x1, y1, x2, y2] -> [x1 + offset_x, y1 + offset_y, x2 + offset_x, y2 + offset_y]
    """
    x1, y1, x2, y2 = bbox
    return [
        float(x1 + offset_x),
        float(y1 + offset_y),
        float(x2 + offset_x),
        float(y2 + offset_y),
    ]


def inverse_transform_point(
    point: tuple[float, float] | list[float],
    offset_x: int,
    offset_y: int,
) -> tuple[float, float]:
    """
    Transform a point (x, y) from ROI crop coordinates back to full source coordinates.
    """
    x, y = point
    return float(x + offset_x), float(y + offset_y)
