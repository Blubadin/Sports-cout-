"""
pose_association.py — Deterministic Pose-to-Track Association for SportsScout Tracking Lab.

Invariants:
- Pose candidates never dictate player identities (P1..P4).
- Deterministic 1-to-1 matching via Hungarian algorithm (linear_sum_assignment).
- Each pose candidate matches at most one athlete.
- Each athlete matches at most one fresh pose per frame.
- Unmatched pose candidates remain unassigned (do not force assignment).
- Unmatched athletes retain their existing tracking/pose reuse state.
- Spectators, officials, or persons outside valid court context are filtered out.
- Pose presence never mutates tracking state (predicted stays predicted, lost stays lost).
"""

from __future__ import annotations
import math
from typing import Sequence
import numpy as np
from scipy.optimize import linear_sum_assignment

from pose_adapter import FullFramePoseCandidate


def compute_bbox_iou(box_a: Sequence[float], box_b: Sequence[float]) -> float:
    """Compute Intersection-over-Union (IoU) between two bounding boxes [x1, y1, x2, y2]."""
    ax1, ay1, ax2, ay2 = box_a[:4]
    bx1, by1, bx2, by2 = box_b[:4]

    ix1 = max(ax1, bx1)
    iy1 = max(ay1, by1)
    ix2 = min(ax2, bx2)
    iy2 = min(ay2, by2)

    iw = max(0.0, ix2 - ix1)
    ih = max(0.0, iy2 - iy1)
    inter = iw * ih
    if inter <= 0.0:
        return 0.0

    area_a = max(0.0, (ax2 - ax1) * (ay2 - ay1))
    area_b = max(0.0, (bx2 - bx1) * (by2 - by1))
    union = area_a + area_b - inter
    return float(inter / union) if union > 0.0 else 0.0


def compute_containment(box_a: Sequence[float], box_b: Sequence[float]) -> float:
    """
    Compute containment (Intersection-over-Min-Area) between two bounding boxes.
    Particularly useful when player lunges, crouches, or box scales differ between detector and pose.
    """
    ax1, ay1, ax2, ay2 = box_a[:4]
    bx1, by1, bx2, by2 = box_b[:4]

    ix1 = max(ax1, bx1)
    iy1 = max(ay1, by1)
    ix2 = min(ax2, bx2)
    iy2 = min(ay2, by2)

    iw = max(0.0, ix2 - ix1)
    ih = max(0.0, iy2 - iy1)
    inter = iw * ih
    if inter <= 0.0:
        return 0.0

    area_a = max(0.0, (ax2 - ax1) * (ay2 - ay1))
    area_b = max(0.0, (bx2 - bx1) * (by2 - by1))
    min_area = min(area_a, area_b)
    return float(inter / min_area) if min_area > 0.0 else 0.0


def compute_pose_association_cost(
    athlete_box: Sequence[float],
    candidate_box: Sequence[float],
) -> float:
    """
    Compute pairwise matching cost between an athlete track bbox and a pose candidate bbox.
    Lower cost represents a closer, higher-confidence match.
    Signals used:
    1. Bounding Box IoU
    2. Containment / IoA
    3. Normalized center distance
    4. Normalized feet/ground point distance
    """
    ax1, ay1, ax2, ay2 = athlete_box[:4]
    bx1, by1, bx2, by2 = candidate_box[:4]

    iou = compute_bbox_iou(athlete_box, candidate_box)
    containment = compute_containment(athlete_box, candidate_box)

    acx = (ax1 + ax2) / 2.0
    acy = (ay1 + ay2) / 2.0
    bcx = (bx1 + bx2) / 2.0
    bcy = (by1 + by2) / 2.0

    afx = acx
    afy = ay2
    bfx = bcx
    bfy = by2

    scale = max(1.0, math.hypot(ax2 - ax1, ay2 - ay1))
    norm_center_dist = math.hypot(acx - bcx, acy - bcy) / scale
    norm_feet_dist = math.hypot(afx - bfx, afy - bfy) / scale

    cost = (
        0.40 * (1.0 - iou)
        + 0.20 * (1.0 - containment)
        + 0.20 * min(2.0, norm_center_dist)
        + 0.20 * min(2.0, norm_feet_dist)
    )
    return float(cost)


def associate_poses_to_athletes(
    tracked_athletes: dict[int, Sequence[float]],
    candidates: Sequence[FullFramePoseCandidate],
    max_cost: float = 0.85,
) -> dict[int, FullFramePoseCandidate]:
    """
    Deterministically associate full-frame pose candidates to tracked athlete bboxes
    using Hungarian matching (linear_sum_assignment).

    Parameters:
    - tracked_athletes: dict mapping player_id (int) -> [x1, y1, x2, y2]
    - candidates: sequence of FullFramePoseCandidate objects
    - max_cost: gating threshold above which assignments are rejected

    Returns:
    - dict mapping player_id (int) -> FullFramePoseCandidate
      (Each candidate is assigned to at most one athlete; unmatched candidates are excluded).
    """
    if not tracked_athletes or not candidates:
        return {}

    pids = sorted(tracked_athletes.keys())
    n_athletes = len(pids)
    n_candidates = len(candidates)

    cost_matrix = np.zeros((n_athletes, n_candidates), dtype=np.float32)

    for i, pid in enumerate(pids):
        a_box = tracked_athletes[pid]
        ax1, ay1, ax2, ay2 = a_box[:4]
        acx = (ax1 + ax2) / 2.0
        acy = (ay1 + ay2) / 2.0
        scale = max(1.0, math.hypot(ax2 - ax1, ay2 - ay1))

        for j, cand in enumerate(candidates):
            c_box = cand.bbox
            cost = compute_pose_association_cost(a_box, c_box)

            # Strict spatial gating: if completely disjoint and far apart, prevent false match
            iou = compute_bbox_iou(a_box, c_box)
            containment = compute_containment(a_box, c_box)
            bcx = (c_box[0] + c_box[2]) / 2.0
            bcy = (c_box[1] + c_box[3]) / 2.0
            norm_dist = math.hypot(acx - bcx, acy - bcy) / scale

            if iou <= 0.0 and containment <= 0.0 and norm_dist > 0.6:
                cost = 1e6

            cost_matrix[i, j] = cost

    row_ind, col_ind = linear_sum_assignment(cost_matrix)

    assignments: dict[int, FullFramePoseCandidate] = {}
    for r, c in zip(row_ind, col_ind):
        if cost_matrix[r, c] <= max_cost:
            pid = pids[r]
            assignments[pid] = candidates[c]

    return assignments
