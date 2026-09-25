"""
court_mapper.py — Perspective Transform + 2D Zone Calculator + Distance/Speed Tracker
Supports Singles (6.10m) and Doubles (6.71m) with 4-player tracking.
"""

from __future__ import annotations
import numpy as np
import cv2

COURT_LENGTH_M = 13.40
COURT_WIDTH_DOUBLES_M = 6.10
COURT_WIDTH_SINGLES_M = 5.18
SINGLES_SIDE_ALLEY_M = (COURT_WIDTH_DOUBLES_M - COURT_WIDTH_SINGLES_M) / 2.0  # 0.46m

# BWF Standard Dimensions (Meters)
NET_Y_M = COURT_LENGTH_M / 2.0  # 6.70m
SHORT_SERVICE_DIST_FROM_NET_M = 1.98
FRONT_BOUNDARY_TOP_M = NET_Y_M - SHORT_SERVICE_DIST_FROM_NET_M  # 4.72m
FRONT_BOUNDARY_BOT_M = NET_Y_M + SHORT_SERVICE_DIST_FROM_NET_M  # 8.68m
DOUBLES_LONG_SERVICE_OFFSET_M = 0.76  # 0.76m from back line
MID_BOUNDARY_TOP_M = 2.36  # Halfway between back line (0.0) and front service line (4.72m)
MID_BOUNDARY_BOT_M = 11.04  # 8.68m + 2.36m


class CourtMapper:
    def __init__(self, game_type: str = "doubles"):
        self.game_type = game_type
        # Physical court calibration lines visible on camera are always the outer doubles boundary (6.10m x 13.40m)
        self.court_w = COURT_WIDTH_DOUBLES_M
        self.court_l = COURT_LENGTH_M
        self.court_real_size = (self.court_l, self.court_w)
        self.H: np.ndarray | None = None
        self.H_inv: np.ndarray | None = None

        # Real court corners: [Top-Left, Top-Right, Bottom-Right, Bottom-Left]
        self.real_corners = np.array([
            [0.0, 0.0],
            [COURT_WIDTH_DOUBLES_M, 0.0],
            [COURT_WIDTH_DOUBLES_M, COURT_LENGTH_M],
            [0.0, COURT_LENGTH_M],
        ], dtype=np.float32)

    @property
    def is_calibrated(self) -> bool:
        """Returns True if valid perspective homography matrices exist."""
        return self.H is not None and self.H_inv is not None

    def invalidate(self) -> None:
        self.H = None
        self.H_inv = None

    def apply_calibration(
        self,
        corners: np.ndarray | list,
        H: np.ndarray | None = None,
        H_inv: np.ndarray | None = None,
    ) -> None:
        """Consume an accepted, validated calibration result."""
        if H is not None and H_inv is not None:
            self.H = np.asarray(H, dtype=np.float32)
            self.H_inv = np.asarray(H_inv, dtype=np.float32)
        else:
            self.calibrate(corners)

    def apply_candidate(self, candidate) -> None:
        """Consume an accepted CourtCalibrationCandidate."""
        if hasattr(candidate, "h_matrix") and candidate.h_matrix is not None and hasattr(candidate, "h_inv_matrix") and candidate.h_inv_matrix is not None:
            self.apply_calibration(candidate.corners_px, candidate.h_matrix, candidate.h_inv_matrix)
        elif hasattr(candidate, "corners_px"):
            self.calibrate(candidate.corners_px)
        elif hasattr(candidate, "cornersPx"):
            self.calibrate(candidate.cornersPx)
        else:
            self.calibrate(candidate)

    def calibrate(self, image_corners: np.ndarray | list):
        """
        Calibrate using 4 image corners matching [TL, TR, BR, BL] of outer court boundary.
        Validates: exactly 4 points, finite values, non-duplicate coordinates,
        minimum polygon area (>= 10 px²), and non-singular homography rank.
        """
        corners = np.asarray(image_corners, dtype=np.float32)
        if corners.shape != (4, 2):
            raise ValueError(f"Calibration requires exactly 4 corner points (TL, TR, BR, BL), got shape {corners.shape}")

        if not np.all(np.isfinite(corners)):
            raise ValueError("Calibration points contain NaN or Inf values")

        # Reject duplicate or near-coincident points
        for i in range(4):
            for j in range(i + 1, 4):
                if float(np.linalg.norm(corners[i] - corners[j])) < 1.0:
                    raise ValueError("Calibration points contain duplicate or degenerate coordinates")

        # Reject degenerate polygon (minimum 10 px² contour area)
        area = abs(float(cv2.contourArea(corners)))
        if area < 10.0:
            raise ValueError(f"Degenerate calibration polygon: area is {area:.2f} px² (must be >= 10 px²)")

        H, _ = cv2.findHomography(corners, self.real_corners, method=0)
        H_inv, _ = cv2.findHomography(self.real_corners, corners, method=0)

        if H is None or H_inv is None:
            raise ValueError("Failed to compute perspective homography matrix")

        if np.linalg.matrix_rank(H) < 3 or np.linalg.matrix_rank(H_inv) < 3 or abs(float(np.linalg.det(H))) < 1e-9:
            raise ValueError("Computed homography matrix is singular or degenerate")

        self.H = H
        self.H_inv = H_inv

    def pixel_to_real(self, point_px: tuple[float, float]) -> tuple[float, float]:
        """Convert pixel (x, y) to real court (x_m, y_m). Requires calibration."""
        if not self.is_calibrated:
            raise RuntimeError("CourtMapper is not calibrated. Call calibrate() first.")
        p = np.array([[[float(point_px[0]), float(point_px[1])]]], dtype=np.float32)
        real = cv2.perspectiveTransform(p, self.H)
        return float(real[0][0][0]), float(real[0][0][1])

    def real_to_pixel(self, point_m: tuple[float, float]) -> tuple[int, int]:
        """Convert real court (x_m, y_m) to pixel (x, y). Requires calibration."""
        if not self.is_calibrated:
            raise RuntimeError("CourtMapper is not calibrated. Call calibrate() first.")
        p = np.array([[[float(point_m[0]), float(point_m[1])]]], dtype=np.float32)
        px = cv2.perspectiveTransform(p, self.H_inv)
        return int(px[0][0][0]), int(px[0][0][1])

    def real_to_pixel_subpixel(self, point_m: tuple[float, float]) -> tuple[float, float]:
        """Convert real court (x_m, y_m) to subpixel float (x, y). Requires calibration."""
        if not self.is_calibrated:
            raise RuntimeError("CourtMapper is not calibrated. Call calibrate() first.")
        p = np.array([[[float(point_m[0]), float(point_m[1])]]], dtype=np.float32)
        px = cv2.perspectiveTransform(p, self.H_inv)
        return float(px[0][0][0]), float(px[0][0][1])

    def real_to_percent(self, point_m: tuple[float, float]) -> tuple[float, float]:
        """
        Convert real court meters (x_m, y_m) to normalized percentage (0..100%).
        Normalized to outer doubles court boundary (6.10m x 13.40m).
        x_pct: 0% (Left) to 100% (Right)
        y_pct: 0% (Top / Far Court) to 100% (Bottom / Near Court)
        """
        x_pct = np.clip((point_m[0] / COURT_WIDTH_DOUBLES_M) * 100.0, 0.0, 100.0)
        y_pct = np.clip((point_m[1] / COURT_LENGTH_M) * 100.0, 0.0, 100.0)
        return float(x_pct), float(y_pct)

    def is_within_outer_court(self, point_m: tuple[float, float], margin: float = 0.0) -> bool:
        """Check if point is within outer court bounds (6.10m x 13.40m)."""
        x, y = point_m
        return (-margin <= x <= COURT_WIDTH_DOUBLES_M + margin) and (-margin <= y <= COURT_LENGTH_M + margin)

    def is_within_singles_bounds(self, point_m: tuple[float, float], margin: float = 0.0) -> bool:
        """Check if point is within singles side boundaries (0.46m to 5.64m) and length (0 to 13.40m)."""
        x, y = point_m
        min_x = SINGLES_SIDE_ALLEY_M
        max_x = COURT_WIDTH_DOUBLES_M - SINGLES_SIDE_ALLEY_M
        return (min_x - margin <= x <= max_x + margin) and (-margin <= y <= COURT_LENGTH_M + margin)

    def get_zone_2d(self, point_m: tuple[float, float], is_shuttle: bool = False) -> str:
        """
        Map real court meters (x_m, y_m) to SportsScout 6 badminton zones:
        FL (Front-Left), FR (Front-Right),
        ML (Mid-Left),   MR (Mid-Right),
        BL (Back-Left),  BR (Back-Right).
        Also detects out of bounds (SIDE_OUT, LONG_OUT, NET_ERR).
        """
        x, y = point_m
        margin = 0.15

        # Determine effective side boundaries for singles vs doubles
        if self.game_type == "singles" and abs(self.court_w - COURT_WIDTH_DOUBLES_M) < 1e-3:
            # Calibrated on outer doubles lines, but playing singles
            min_x = SINGLES_SIDE_ALLEY_M
            max_x = COURT_WIDTH_DOUBLES_M - SINGLES_SIDE_ALLEY_M
        else:
            min_x = 0.0
            max_x = self.court_w

        if x < min_x - margin or x > max_x + margin:
            return "SIDE_OUT"
        if y < -margin or y > self.court_l + margin:
            return "LONG_OUT"
        if is_shuttle and abs(y - NET_Y_M) < 0.20:
            return "NET_ERR"

        mid_x = (min_x + max_x) / 2.0
        is_left = x < mid_x

        # Top Court (y < 6.70m) vs Bottom Court (y >= 6.70m)
        if y < NET_Y_M:
            if y >= FRONT_BOUNDARY_TOP_M:
                return "FL" if is_left else "FR"
            elif y >= MID_BOUNDARY_TOP_M:
                return "ML" if is_left else "MR"
            else:
                return "BL" if is_left else "BR"
        else:
            if y <= FRONT_BOUNDARY_BOT_M:
                return "FL" if is_left else "FR"
            elif y <= MID_BOUNDARY_BOT_M:
                return "ML" if is_left else "MR"
            else:
                return "BL" if is_left else "BR"

    def get_relative_zone_2d(self, point_m: tuple[float, float], team: int) -> str:
        """
        Player-relative zone normalized so player always faces the net (PDF §65).
        Returns FL, FR, ML, MR, RL, RR.
        team 1 = Top court (y < 6.70m, faces +y towards net)
        team 2 = Bottom court (y >= 6.70m, faces -y towards net)
        """
        abs_zone = self.get_zone_2d(point_m)
        if abs_zone in ("SIDE_OUT", "LONG_OUT", "NET_ERR"):
            return abs_zone

        depth = "F" if "F" in abs_zone else ("M" if "M" in abs_zone else "R")
        is_screen_left = "L" in abs_zone
        if team == 1:
            side = "R" if is_screen_left else "L"
        else:
            side = "L" if is_screen_left else "R"
        return f"{depth}{side}"

    @staticmethod
    def euclidean_distance(p1: tuple[float, float], p2: tuple[float, float]) -> float:
        return float(np.sqrt((p2[0] - p1[0])**2 + (p2[1] - p1[1])**2))


class DistanceTracker:
    def __init__(self, mapper: CourtMapper, fps: float = 30.0, smooth_k: int = 5, max_tracking_gap: float = 1.5):
        self.mapper = mapper
        self.fps = fps
        self.smooth_k = smooth_k
        self.max_tracking_gap = max_tracking_gap
        self._data: dict[int, dict] = {}
        self.metric_segment_index = 0

    def _get_or_create(self, player_id: int) -> dict:
        if player_id not in self._data:
            self._data[player_id] = {
                "player_id": player_id,
                "total_dist_m": 0.0,
                "prev_real": None,
                "prev_time": None,
                "positions_px": [],
                "positions_m": [],
                "positions_pct": [],
                "speeds_ms": [],
                "raw_speeds": [],
                "zone_dist": {"FL": 0.0, "FR": 0.0, "ML": 0.0, "MR": 0.0, "BL": 0.0, "BR": 0.0},
                "max_speed_ms": 0.0,
                "current_speed_ms": 0.0,
                "current_zone": "ML",
            }
        return self._data[player_id]

    def pause_metric_tracking(self) -> None:
        """Keep accumulated distance but never bridge across an invalid interval."""
        self.break_metric_segment()

    def break_metric_segment(self) -> None:
        """End the current metric trajectory without clearing accumulated totals."""
        self.metric_segment_index += 1
        for data in self._data.values():
            data["prev_real"] = None
            data["prev_time"] = None
            data["positions_m"].clear()
            data["positions_pct"].clear()
            data["raw_speeds"].clear()
            data["current_speed_ms"] = None
            data["current_zone"] = "UNKNOWN"

    def has_metric_observation(self, player_id: int) -> bool:
        return bool(self._data.get(player_id, {}).get("positions_px"))

    def update(
        self,
        player_id: int,
        center_px: tuple[float, float],
        timestamp_sec: float | None = None,
        camera_segment_id: str | None = None,
        calibration_id: str | None = None,
        provenance: str | None = None,
    ) -> dict:
        d = self._get_or_create(player_id)
        if not self.mapper.is_calibrated:
            self.break_metric_segment()
            return d

        if center_px is None or not (np.isfinite(center_px[0]) and np.isfinite(center_px[1])):
            d["prev_real"] = None
            d["prev_time"] = None
            d["current_speed_ms"] = 0.0
            return d

        # Segment continuity checks (Task 5: never connect across cut or calibration change)
        last_segment = d.get("last_camera_segment_id")
        if last_segment is not None and camera_segment_id is not None and last_segment != camera_segment_id:
            d["prev_real"] = None
            d["prev_time"] = None
            d["current_speed_ms"] = 0.0
        d["last_camera_segment_id"] = camera_segment_id

        last_cal = d.get("last_calibration_id")
        if last_cal is not None and calibration_id is not None and last_cal != calibration_id:
            d["prev_real"] = None
            d["prev_time"] = None
            d["current_speed_ms"] = 0.0
        d["last_calibration_id"] = calibration_id

        # Long tracking loss continuity check (Task 5: long gap breaks distance continuity)
        if d["prev_real"] is not None and timestamp_sec is not None and d.get("prev_time") is not None:
            gap = timestamp_sec - d["prev_time"]
            if gap > self.max_tracking_gap:
                d["prev_real"] = None
                d["prev_time"] = None
                d["current_speed_ms"] = 0.0

        real = self.mapper.pixel_to_real(center_px)
        pct = self.mapper.real_to_percent(real)
        zone = self.mapper.get_zone_2d(real)

        d["positions_px"].append(center_px)
        d["positions_m"].append(real)
        d["positions_pct"].append(pct)
        d["current_zone"] = zone

        if d["prev_real"] is None:
            # Initial observation establishes position without distance increment
            d["prev_real"] = real
            d["prev_time"] = timestamp_sec
            d["last_provenance"] = provenance
            d["speeds_ms"].append(0.0)
            d["current_speed_ms"] = 0.0
            return d

        # Compute deltaTime
        if timestamp_sec is not None and d.get("prev_time") is not None:
            delta_t = timestamp_sec - d["prev_time"]
        elif self.fps > 0:
            delta_t = 1.0 / self.fps
        else:
            delta_t = 0.0

        # Reject deltaTime <= 0 without NaN/Inf/negative speed
        if delta_t <= 0.0 or not np.isfinite(delta_t):
            d["speeds_ms"].append(0.0)
            d["current_speed_ms"] = 0.0
            d["prev_real"] = real
            d["last_provenance"] = provenance
            if timestamp_sec is not None:
                d["prev_time"] = timestamp_sec
            return d

        dist = CourtMapper.euclidean_distance(d["prev_real"], real)
        speed_ms = dist / delta_t

        # Task 6: Provenance change continuity check (suppress fake spikes from anchor shifts)
        last_prov = d.get("last_provenance")
        if last_prov is not None and provenance is not None and last_prov != provenance:
            is_implausible_jump = (dist > 0.35 and speed_ms > 7.0) or (speed_ms > 10.0)
            if is_implausible_jump:
                d["prev_real"] = real
                d["prev_time"] = timestamp_sec
                d["last_provenance"] = provenance
                d["speeds_ms"].append(0.0)
                d["current_speed_ms"] = 0.0
                return d

        d["last_provenance"] = provenance

        # Filter spatial jitter (< 0.03m / 3cm) and impossible speeds (> 11.0 m/s)
        if dist >= 0.03 and speed_ms <= 11.0:
            d["total_dist_m"] += dist
            if zone in d["zone_dist"]:
                d["zone_dist"][zone] += dist

            d["raw_speeds"].append(speed_ms)
            if len(d["raw_speeds"]) > self.smooth_k:
                d["raw_speeds"].pop(0)
            smooth_speed = float(np.mean(d["raw_speeds"]))
            d["speeds_ms"].append(smooth_speed)
            d["current_speed_ms"] = round(smooth_speed, 2)
            if smooth_speed > d["max_speed_ms"]:
                d["max_speed_ms"] = round(smooth_speed, 2)
        else:
            d["speeds_ms"].append(0.0)
            d["current_speed_ms"] = 0.0

        d["prev_real"] = real
        if timestamp_sec is not None:
            d["prev_time"] = timestamp_sec
        elif d.get("prev_time") is not None:
            d["prev_time"] += delta_t
        else:
            d["prev_time"] = 0.0

        return d

    def get_stats(self, player_id: int) -> dict:
        if player_id not in self._data:
            return {}
        d = self._data[player_id]
        speeds = d["speeds_ms"]
        last_pos_pct = d["positions_pct"][-1] if d["positions_pct"] else None
        last_pos_m = d["positions_m"][-1] if d["positions_m"] else None
        return {
            "player_id": player_id,
            "total_dist_m": round(d["total_dist_m"], 2),
            "max_speed_ms": round(d["max_speed_ms"], 2),
            "current_speed_ms": d["current_speed_ms"],
            "avg_speed_ms": round(float(np.mean(speeds)) if speeds else 0.0, 2),
            "current_zone": d["current_zone"] if last_pos_m else "UNKNOWN",
            "court_pos_pct": {"x": round(last_pos_pct[0], 2), "y": round(last_pos_pct[1], 2)} if last_pos_pct else None,
            "court_pos_m": {"x": round(last_pos_m[0], 2), "y": round(last_pos_m[1], 2)} if last_pos_m else None,
            "zone_dist": {k: round(v, 2) for k, v in d["zone_dist"].items()},
        }

    def all_stats(self) -> list[dict]:
        return [self.get_stats(pid) for pid in sorted(self._data.keys())]
