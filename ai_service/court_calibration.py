"""
court_calibration.py — Dynamic Court Calibration Foundation (Phase 3.2)

Provides:
- CourtCalibrationCandidate: Immutable candidate model with measured provenance.
- validate_court_geometry: Fail-closed court geometry and homography validator.
- CourtCalibrationProvider: Protocol for calibration candidate generators.
- ManualCourtCalibrationProvider: User-guided manual 4-corner provider.
- AutomaticCourtCalibrationProvider: Deterministic classical-CV court detector.
- TemporalStabilityValidator: Multi-frame temporal confirmation and anti-churn lock.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from math import isfinite
from typing import Any, Protocol, runtime_checkable
import cv2
import numpy as np

from calibration_contract import CalibrationSource
from court_mapper import COURT_LENGTH_M, COURT_WIDTH_DOUBLES_M

# Standard real-world outer court corners: [TL, TR, BR, BL]
STANDARD_REAL_CORNERS = np.array([
    [0.0, 0.0],
    [COURT_WIDTH_DOUBLES_M, 0.0],
    [COURT_WIDTH_DOUBLES_M, COURT_LENGTH_M],
    [0.0, COURT_LENGTH_M],
], dtype=np.float32)


@dataclass(frozen=True)
class CourtCalibrationCandidate:
    """A perspective court candidate with measured quality evidence."""
    corners_px: tuple[tuple[float, float], ...]  # [TL, TR, BR, BL]
    source: CalibrationSource
    confidence: float | None = None
    supporting_evidence: dict[str, Any] = field(default_factory=dict)
    reprojection_error_px: float | None = None
    h_matrix: tuple[tuple[float, ...], ...] | None = None
    h_inv_matrix: tuple[tuple[float, ...], ...] | None = None

    def __post_init__(self) -> None:
        if len(self.corners_px) != 4:
            raise ValueError(f"Candidate must have exactly 4 corners, got {len(self.corners_px)}")
        for pt in self.corners_px:
            if len(pt) != 2 or not isfinite(pt[0]) or not isfinite(pt[1]):
                raise ValueError("Corner coordinates must be 2D finite numbers")
        if self.confidence is not None and (
            not isinstance(self.confidence, (int, float))
            or not isfinite(self.confidence)
            or not 0 <= self.confidence <= 1
        ):
            raise ValueError("Confidence must be a finite float in [0, 1]")
        if self.reprojection_error_px is not None and (
            not isinstance(self.reprojection_error_px, (int, float))
            or not isfinite(self.reprojection_error_px)
            or self.reprojection_error_px < 0
        ):
            raise ValueError("Reprojection error must be a finite nonnegative float")
        if self.source is CalibrationSource.MANUAL and (
            self.confidence is not None or self.reprojection_error_px is not None
        ):
            raise ValueError("Manual four-corner calibration has no measured quality")

    @property
    def cornersPx(self) -> list[list[float]]:
        return [list(pt) for pt in self.corners_px]

    @property
    def supportingEvidence(self) -> dict[str, Any]:
        return self.supporting_evidence

    @property
    def reprojectionErrorPx(self) -> float | None:
        return self.reprojection_error_px


def validate_court_geometry(
    corners: np.ndarray | list[list[float]] | tuple[tuple[float, float], ...],
    image_shape: tuple[int, int] | None = None,
    min_area_px: float = 100.0,
    min_corner_dist_px: float = 15.0,
    min_edge_len_px: float = 10.0,
    aspect_ratio_range: tuple[float, float] = (0.35, 5.0),
) -> tuple[bool, str | None]:
    """
    Validate court boundary candidate geometry.
    Fails closed on:
    - Non-4 or non-finite points
    - Duplicated or collapsed corners
    - Contour area below threshold
    - Non-convex or incorrectly ordered corners [TL, TR, BR, BL]
    - Ill-conditioned or singular homography
    - Out-of-frame or implausible aspect ratio
    """
    try:
        arr = np.asarray(corners, dtype=np.float32)
    except Exception as exc:
        return False, f"Could not convert corners to float32 array: {exc}"

    if arr.shape != (4, 2):
        return False, f"Court geometry must have shape (4, 2), got {arr.shape}"

    if not np.all(np.isfinite(arr)):
        return False, "Corners contain NaN or Inf values"

    # Check pairwise corner distances (reject duplicates / collapses)
    for i in range(4):
        for j in range(i + 1, 4):
            dist = float(np.linalg.norm(arr[i] - arr[j]))
            if dist < min_corner_dist_px:
                return False, f"Corners {i} and {j} collapsed (dist={dist:.2f}px < {min_corner_dist_px}px)"

    # Check polygon area
    area = abs(float(cv2.contourArea(arr)))
    if area < min_area_px:
        return False, f"Polygon area too small ({area:.1f}px² < {min_area_px}px²)"

    p0, p1, p2, p3 = arr[0], arr[1], arr[2], arr[3]

    # Canonical court ordering check: TL, TR, BR, BL
    # Left vs Right
    if not (p0[0] < p1[0] and p3[0] < p2[0]):
        return False, "Invalid horizontal ordering (TL must be left of TR, BL must be left of BR)"
    # Top vs Bottom
    if not (p0[1] < p3[1] and p1[1] < p2[1]):
        return False, "Invalid vertical ordering (TL must be above BL, TR must be above BR)"
    if not (max(p0[1], p1[1]) < min(p3[1], p2[1])):
        return False, "Top boundary must be entirely above bottom boundary"

    # Convexity & orientation check (cross products of consecutive edges must all have same sign)
    edges = [arr[(i + 1) % 4] - arr[i] for i in range(4)]
    cps = [float(edges[i][0] * edges[(i + 1) % 4][1] - edges[i][1] * edges[(i + 1) % 4][0]) for i in range(4)]
    if not (all(cp > 1e-4 for cp in cps) or all(cp < -1e-4 for cp in cps)):
        return False, "Court polygon is not strictly convex or is self-intersecting"

    # Check edge lengths
    lengths = [float(np.linalg.norm(e)) for e in edges]
    if any(l < min_edge_len_px for l in lengths):
        return False, f"Court edge too short (min length={min(lengths):.1f}px < {min_edge_len_px}px)"

    # Aspect ratio check
    top_w, right_h, bot_w, left_h = lengths[0], lengths[1], lengths[2], lengths[3]
    avg_w = (top_w + bot_w) / 2.0
    avg_h = (left_h + right_h) / 2.0
    aspect_ratio = avg_h / max(avg_w, 1e-3)
    if not (aspect_ratio_range[0] <= aspect_ratio <= aspect_ratio_range[1]):
        return False, f"Implausible aspect ratio {aspect_ratio:.2f} (allowed {aspect_ratio_range})"

    # Image boundary check (if image dimensions provided)
    if image_shape is not None:
        h_img, w_img = image_shape[:2]
        margin = 60.0
        for i, pt in enumerate(arr):
            if not (-margin <= pt[0] <= w_img + margin and -margin <= pt[1] <= h_img + margin):
                return False, f"Corner {i} ({pt[0]:.1f}, {pt[1]:.1f}) is far outside frame bounds ({w_img}x{h_img})"
        center = np.mean(arr, axis=0)
        if not (0 <= center[0] <= w_img and 0 <= center[1] <= h_img):
            return False, "Court center is outside frame"

    # Homography stability check
    h_mat, _ = cv2.findHomography(arr, STANDARD_REAL_CORNERS, method=0)
    h_inv, _ = cv2.findHomography(STANDARD_REAL_CORNERS, arr, method=0)
    if h_mat is None or h_inv is None:
        return False, "Homography calculation failed"

    if np.linalg.matrix_rank(h_mat) < 3 or np.linalg.matrix_rank(h_inv) < 3:
        return False, "Singular homography matrix"

    det = abs(float(np.linalg.det(h_mat)))
    if det < 1e-12:
        return False, f"Degenerate homography determinant: {det}"

    s = np.linalg.svd(h_mat, compute_uv=False)
    if s[2] < 1e-9 or (s[0] / s[2]) > 1e7:
        return False, "Ill-conditioned homography matrix"

    return True, None


def intersect_lines(l1: tuple[float, float, float], l2: tuple[float, float, float]) -> tuple[float, float] | None:
    """Intersect two normalized 2D lines ax + by + c = 0 via cross product."""
    a1, b1, c1 = l1
    a2, b2, c2 = l2
    w = a1 * b2 - a2 * b1
    if abs(w) < 1e-6:
        return None
    x = (b1 * c2 - b2 * c1) / w
    y = (c1 * a2 - c2 * a1) / w
    if not (isfinite(x) and isfinite(y)):
        return None
    return float(x), float(y)


@runtime_checkable
class CourtCalibrationProvider(Protocol):
    """Protocol for court calibration generators."""
    def get_candidate(
        self,
        frame: np.ndarray | None,
        frame_index: int = 0,
        timestamp_sec: float = 0.0,
        camera_segment_id: str = "segment-0",
        *,
        frameIndex: int | None = None,
        timestampSec: float | None = None,
        cameraSegmentId: str | None = None,
    ) -> CourtCalibrationCandidate | None:
        """Produce a calibration candidate or None if unavailable/unstable."""
        ...


class ManualCourtCalibrationProvider:
    """Provider for manual user-specified four-corner calibration."""
    def __init__(self) -> None:
        self._candidate: CourtCalibrationCandidate | None = None
        self._segment_id: str | None = None

    def set_corners(
        self,
        corners: list[list[float]] | np.ndarray | tuple,
        camera_segment_id: str | None = None,
    ) -> CourtCalibrationCandidate:
        arr = np.asarray(corners, dtype=np.float32)
        valid, reason = validate_court_geometry(arr)
        if not valid:
            raise ValueError(f"Invalid court geometry: {reason}")

        pts = tuple(tuple(float(c) for c in pt) for pt in arr)
        h_mat, _ = cv2.findHomography(arr, STANDARD_REAL_CORNERS, method=0)
        h_inv, _ = cv2.findHomography(STANDARD_REAL_CORNERS, arr, method=0)

        cand = CourtCalibrationCandidate(
            corners_px=pts,
            source=CalibrationSource.MANUAL,
            confidence=None,
            supporting_evidence={"mode": "manual"},
            reprojection_error_px=None,
            h_matrix=tuple(tuple(float(v) for v in row) for row in h_mat) if h_mat is not None else None,
            h_inv_matrix=tuple(tuple(float(v) for v in row) for row in h_inv) if h_inv is not None else None,
        )
        self._candidate = cand
        self._segment_id = camera_segment_id
        return cand

    def invalidate(self) -> None:
        self._candidate = None
        self._segment_id = None

    def get_candidate(
        self,
        frame: np.ndarray | None,
        frame_index: int = 0,
        timestamp_sec: float = 0.0,
        camera_segment_id: str = "segment-0",
        *,
        frameIndex: int | None = None,
        timestampSec: float | None = None,
        cameraSegmentId: str | None = None,
    ) -> CourtCalibrationCandidate | None:
        seg = cameraSegmentId or camera_segment_id
        if self._candidate is None:
            return None
        if self._segment_id is not None and self._segment_id != seg:
            return None
        return self._candidate


class AutomaticCourtCalibrationProvider:
    """
    Deterministic classical-CV court detector baseline.
    Uses edge and line detection, line grouping, line intersection,
    aspect ratio & interior line correspondence verification.
    """
    def __init__(
        self,
        canny_low: int = 50,
        canny_high: int = 150,
        hough_threshold: int = 40,
        min_line_length: int = 25,
        max_line_gap: int = 15,
        cluster_threshold_px: float = 18.0,
        transverse_max_angle_deg: float = 35.0,
        longitudinal_min_angle_deg: float = 45.0,
        min_court_area_px: float = 500.0,
    ) -> None:
        self.canny_low = canny_low
        self.canny_high = canny_high
        self.hough_threshold = hough_threshold
        self.min_line_length = min_line_length
        self.max_line_gap = max_line_gap
        self.cluster_threshold_px = cluster_threshold_px
        self.transverse_max_angle_deg = transverse_max_angle_deg
        self.longitudinal_min_angle_deg = longitudinal_min_angle_deg
        self.min_court_area_px = min_court_area_px

    def get_candidate(
        self,
        frame: np.ndarray | None,
        frame_index: int = 0,
        timestamp_sec: float = 0.0,
        camera_segment_id: str = "segment-0",
        *,
        frameIndex: int | None = None,
        timestampSec: float | None = None,
        cameraSegmentId: str | None = None,
    ) -> CourtCalibrationCandidate | None:
        if frame is None or frame.size == 0 or len(frame.shape) != 3:
            return None

        h_img, w_img = frame.shape[:2]
        if h_img < 60 or w_img < 60:
            return None

        # Preprocessing: Grayscale & Edge detection
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        blurred = cv2.GaussianBlur(gray, (5, 5), 0)
        edges = cv2.Canny(blurred, self.canny_low, self.canny_high)

        # Hough probabilistic line segment detection
        raw_lines = cv2.HoughLinesP(
            edges, 1, np.pi / 180,
            threshold=self.hough_threshold,
            minLineLength=self.min_line_length,
            maxLineGap=self.max_line_gap,
        )
        if raw_lines is None or len(raw_lines) < 4:
            return None

        transverse_segs = []
        longitudinal_segs = []

        for line in raw_lines:
            x1, y1, x2, y2 = [float(v) for v in line.reshape(-1)[:4]]
            dx, dy = x2 - x1, y2 - y1
            length = np.hypot(dx, dy)
            if length < float(self.min_line_length):
                continue
            angle = float(np.degrees(np.arctan2(abs(dy), abs(dx))))
            if angle <= self.transverse_max_angle_deg:
                mid_y = (y1 + y2) / 2.0
                transverse_segs.append((mid_y, (x1, y1, x2, y2)))
            elif angle >= self.longitudinal_min_angle_deg:
                mid_x = (x1 + x2) / 2.0
                longitudinal_segs.append((mid_x, (x1, y1, x2, y2)))

        if len(transverse_segs) < 2 or len(longitudinal_segs) < 2:
            return None

        # Cluster segments by coordinate position
        def cluster_segments(segs: list[tuple[float, tuple[float, float, float, float]]]) -> list[list]:
            sorted_segs = sorted(segs, key=lambda s: s[0])
            clusters = []
            cur = [sorted_segs[0]]
            for s in sorted_segs[1:]:
                if abs(s[0] - cur[-1][0]) <= self.cluster_threshold_px:
                    cur.append(s)
                else:
                    clusters.append(cur)
                    cur = [s]
            if cur:
                clusters.append(cur)
            return clusters

        t_clusters = cluster_segments(transverse_segs)
        l_clusters = cluster_segments(longitudinal_segs)

        if len(t_clusters) < 2 or len(l_clusters) < 2:
            return None

        def fit_line(cluster: list) -> tuple[tuple[float, float, float], float]:
            pts = []
            for _, (x1, y1, x2, y2) in cluster:
                pts.append([x1, y1])
                pts.append([x2, y2])
            pts_arr = np.array(pts, dtype=np.float32)
            [vx, vy, x0, y0] = cv2.fitLine(pts_arr, cv2.DIST_L2, 0, 0.01, 0.01).flatten()
            a = float(-vy)
            b = float(vx)
            c = float(vy * x0 - vx * y0)
            norm = np.hypot(a, b)
            if norm > 1e-7:
                a, b, c = a / norm, b / norm, c / norm
            return (a, b, c), float(np.mean([s[0] for s in cluster]))

        t_lines = [fit_line(c) for c in t_clusters]
        l_lines = [fit_line(c) for c in l_clusters]

        t_lines.sort(key=lambda x: x[1])
        l_lines.sort(key=lambda x: x[1])

        top_line = t_lines[0][0]
        bot_line = t_lines[-1][0]
        left_line = l_lines[0][0]
        right_line = l_lines[-1][0]

        tl = intersect_lines(top_line, left_line)
        tr = intersect_lines(top_line, right_line)
        br = intersect_lines(bot_line, right_line)
        bl = intersect_lines(bot_line, left_line)

        if None in (tl, tr, br, bl):
            return None

        candidate_corners = np.array([tl, tr, br, bl], dtype=np.float32)
        valid, _ = validate_court_geometry(candidate_corners, image_shape=(h_img, w_img), min_area_px=self.min_court_area_px)
        if not valid:
            return None

        # Compute homography to standard court
        h_mat, _ = cv2.findHomography(candidate_corners, STANDARD_REAL_CORNERS, method=0)
        h_inv, _ = cv2.findHomography(STANDARD_REAL_CORNERS, candidate_corners, method=0)
        if h_mat is None or h_inv is None:
            return None

        # Evaluate supporting evidence & internal correspondences
        # Interior transverse lines: service lines, net line
        # Interior longitudinal lines: singles sidelines, center line
        interior_t_clusters = t_clusters[1:-1]
        interior_l_clusters = l_clusters[1:-1]

        reprojection_error_px: float | None = None
        evidence = {
            "num_transverse_clusters": len(t_clusters),
            "num_longitudinal_clusters": len(l_clusters),
            "interior_transverse_count": len(interior_t_clusters),
            "interior_longitudinal_count": len(interior_l_clusters),
        }

        # If interior lines exist, measure reprojection error against standard court landmarks
        # Known landmarks: net line y=6.70m, service lines y=4.72m / 8.68m, center line x=3.05m
        if interior_t_clusters and interior_l_clusters:
            internal_pts_detected = []
            internal_pts_expected = []

            # Match center-line cluster (closest to width / 2) with net cluster (closest to length / 2)
            c_line = l_lines[len(l_lines) // 2][0]
            net_line = t_lines[len(t_lines) // 2][0]
            net_center_det = intersect_lines(net_line, c_line)
            if net_center_det is not None:
                internal_pts_detected.append(net_center_det)
                internal_pts_expected.append((COURT_WIDTH_DOUBLES_M / 2.0, COURT_LENGTH_M / 2.0))

            if internal_pts_detected:
                exp_arr = np.array(internal_pts_expected, dtype=np.float32).reshape(-1, 1, 2)
                proj = cv2.perspectiveTransform(exp_arr, h_inv).reshape(-1, 2)
                det_arr = np.array(internal_pts_detected, dtype=np.float32)
                diffs = np.linalg.norm(proj - det_arr, axis=1)
                reprojection_error_px = round(float(np.mean(diffs)), 2)
                evidence["reprojection_points_count"] = len(diffs)

        # Defensibly measured confidence:
        # Based on interior cluster coverage (up to 6 interior lines), boundary line strength, and reprojection error
        interior_score = min(1.0, (len(interior_t_clusters) + len(interior_l_clusters)) / 4.0)
        if reprojection_error_px is not None:
            # Excessive reprojection error rejects candidate immediately (fail-closed, B4)
            if reprojection_error_px > 25.0:
                return None
            reproj_score = max(0.0, 1.0 - (reprojection_error_px / 12.0))
            confidence = round(float(0.55 * interior_score + 0.35 * reproj_score + 0.10), 3)
        else:
            # Reprojection unmeasured: do NOT convert unavailable to 1.0 (Part B3)
            # Confidence represents strictly measured interior structural support
            if (len(interior_t_clusters) + len(interior_l_clusters)) >= 2:
                confidence = round(float(0.40 * interior_score + 0.20), 3)
            else:
                confidence = None

        if confidence is not None:
            confidence = float(np.clip(confidence, 0.0, 1.0))

        corners_tuple = tuple(tuple(float(c) for c in pt) for pt in candidate_corners)
        return CourtCalibrationCandidate(
            corners_px=corners_tuple,
            source=CalibrationSource.AUTOMATIC,
            confidence=confidence,
            supporting_evidence=evidence,
            reprojection_error_px=reprojection_error_px,
            h_matrix=tuple(tuple(float(v) for v in row) for row in h_mat),
            h_inv_matrix=tuple(tuple(float(v) for v in row) for row in h_inv),
        )


def validate_automatic_candidate_acceptance(
    candidate: CourtCalibrationCandidate | None,
    max_reprojection_error_px: float = 12.0,
    min_confidence: float = 0.55,
    min_interior_clusters: int = 1,
) -> tuple[bool, str | None]:
    """
    Strict fail-closed gate for automatic court calibration acceptance (Phase 3.5).
    Guarantees that a stable candidate is not accepted as a valid court without verifiable evidence.
    """
    if candidate is None:
        return False, "Candidate is None"
    if candidate.source is not CalibrationSource.AUTOMATIC:
        return False, f"Expected AUTOMATIC candidate, got {candidate.source}"

    geom_valid, reason = validate_court_geometry(candidate.corners_px)
    if not geom_valid:
        return False, f"Geometry validation failed: {reason}"

    evidence = candidate.supporting_evidence or {}
    interior_t = int(evidence.get("interior_transverse_count", 0))
    interior_l = int(evidence.get("interior_longitudinal_count", 0))
    total_interior = interior_t + interior_l

    if candidate.reprojection_error_px is not None:
        if candidate.reprojection_error_px > max_reprojection_error_px:
            return False, f"Reprojection error {candidate.reprojection_error_px:.2f}px exceeds {max_reprojection_error_px}px"
    else:
        # Reprojection unmeasured: require stronger alternative interior evidence (B4)
        if total_interior < max(2, min_interior_clusters):
            return False, f"Insufficient interior line evidence ({total_interior} lines, unmeasured reprojection)"

    if candidate.confidence is None or candidate.confidence < min_confidence:
        return False, f"Confidence {candidate.confidence} below acceptance threshold {min_confidence}"

    return True, None


class TemporalStabilityValidator:
    """
    Temporal confirmation buffer and anti-churn stabilizer.
    Requires a candidate to remain spatially consistent across N consecutive frames
    before locking. Once locked, maintains calibration until invalidated or segment changes.
    """
    def __init__(
        self,
        required_consecutive_frames: int = 3,
        max_corner_drift_px: float = 8.0,
        max_reprojection_error_px: float = 12.0,
        min_confidence: float = 0.55,
    ) -> None:
        self.required_consecutive_frames = max(1, required_consecutive_frames)
        self.max_corner_drift_px = float(max_corner_drift_px)
        self.max_reprojection_error_px = float(max_reprojection_error_px)
        self.min_confidence = float(min_confidence)
        self.current_segment_id: str | None = None
        self.streak: list[CourtCalibrationCandidate] = []
        self.is_locked: bool = False
        self.locked_candidate: CourtCalibrationCandidate | None = None

    def reset(self) -> None:
        self.streak.clear()
        self.is_locked = False
        self.locked_candidate = None
        self.current_segment_id = None

    def invalidate(self) -> None:
        self.streak.clear()
        self.is_locked = False
        self.locked_candidate = None

    def observe(
        self,
        candidate: CourtCalibrationCandidate | None,
        camera_segment_id: str,
    ) -> CourtCalibrationCandidate | None:
        """
        Observe candidate for temporal confirmation.
        Returns locked candidate once stability is confirmed, or None if unconfirmed.
        """
        # Segment change immediately resets all stability and lock state
        if self.current_segment_id != camera_segment_id:
            self.current_segment_id = camera_segment_id
            self.streak.clear()
            self.is_locked = False
            self.locked_candidate = None

        if candidate is None:
            # If already locked, do not drop lock on temporary single-frame glitch (Task 9)
            if self.is_locked:
                return self.locked_candidate
            self.streak.clear()
            return None

        # Check candidate acceptance gate before accumulating temporal streak (Part B)
        accepted, _ = validate_automatic_candidate_acceptance(
            candidate,
            max_reprojection_error_px=self.max_reprojection_error_px,
            min_confidence=self.min_confidence,
        )
        if not accepted:
            if self.is_locked:
                return self.locked_candidate
            self.streak.clear()
            return None

        if self.is_locked:
            # Already locked in this segment; retain locked candidate to prevent churn (Task 9)
            return self.locked_candidate

        # Check spatial consistency with the previous candidate in current streak
        if self.streak:
            prev_corners = self.streak[-1].corners_px
            curr_corners = candidate.corners_px
            max_drift = max(
                np.hypot(prev_corners[i][0] - curr_corners[i][0], prev_corners[i][1] - curr_corners[i][1])
                for i in range(4)
            )
            if max_drift > self.max_corner_drift_px:
                # Drift exceeded threshold: reset streak with the new candidate
                self.streak = [candidate]
                return None

        self.streak.append(candidate)
        if len(self.streak) >= self.required_consecutive_frames:
            self.is_locked = True
            self.locked_candidate = candidate
            return candidate

        return None
