"""
court_mapper.py — Perspective Transform + 2D Zone Calculator + Distance/Speed Tracker
Supports Singles (6.10m) and Doubles (6.71m) with 4-player tracking.
"""

from __future__ import annotations
import numpy as np
import cv2

COURT_LENGTH_M = 13.40
COURT_WIDTH_SINGLES_M = 6.10
COURT_WIDTH_DOUBLES_M = 6.71

# BWF Standard Dimensions (Meters)
NET_Y_M = COURT_LENGTH_M / 2.0  # 6.70m
SHORT_SERVICE_DIST_FROM_NET_M = 1.98
FRONT_BOUNDARY_TOP_M = NET_Y_M - SHORT_SERVICE_DIST_FROM_NET_M  # 4.72m
FRONT_BOUNDARY_BOT_M = NET_Y_M + SHORT_SERVICE_DIST_FROM_NET_M  # 8.68m
DOUBLES_LONG_SERVICE_OFFSET_M = 0.76


class CourtMapper:
    def __init__(self, game_type: str = "doubles"):
        self.game_type = game_type
        self.court_w = COURT_WIDTH_DOUBLES_M if game_type == "doubles" else COURT_WIDTH_SINGLES_M
        self.court_l = COURT_LENGTH_M
        self.court_real_size = (self.court_l, self.court_w)
        self.H: np.ndarray | None = None
        self.H_inv: np.ndarray | None = None

        # Real court corners: [Top-Left, Top-Right, Bottom-Right, Bottom-Left]
        self.real_corners = np.array([
            [0.0, 0.0],
            [self.court_w, 0.0],
            [self.court_w, self.court_l],
            [0.0, self.court_l],
        ], dtype=np.float32)

    def calibrate(self, image_corners: np.ndarray):
        """Calibrate using 4 image corners matching [TL, TR, BR, BL] of court."""
        image_corners = np.array(image_corners, dtype=np.float32)
        self.H, _ = cv2.findHomography(image_corners, self.real_corners)
        self.H_inv, _ = cv2.findHomography(self.real_corners, image_corners)

    def pixel_to_real(self, point_px: tuple[float, float]) -> tuple[float, float]:
        """Convert pixel (x, y) to real court (x_m, y_m)."""
        if self.H is None:
            return (0.0, 0.0)
        p = np.array([[[float(point_px[0]), float(point_px[1])]]], dtype=np.float32)
        real = cv2.perspectiveTransform(p, self.H)
        return float(real[0][0][0]), float(real[0][0][1])

    def real_to_pixel(self, point_m: tuple[float, float]) -> tuple[int, int]:
        """Convert real court (x_m, y_m) to pixel (x, y)."""
        if self.H_inv is None:
            return (0, 0)
        p = np.array([[[float(point_m[0]), float(point_m[1])]]], dtype=np.float32)
        px = cv2.perspectiveTransform(p, self.H_inv)
        return int(px[0][0][0]), int(px[0][0][1])

    def real_to_percent(self, point_m: tuple[float, float]) -> tuple[float, float]:
        """
        Convert real court meters (x_m, y_m) to normalized percentage (0..100%).
        x_pct: 0% (Left) to 100% (Right)
        y_pct: 0% (Top / Far Court) to 100% (Bottom / Near Court)
        """
        x_pct = np.clip((point_m[0] / self.court_w) * 100.0, 0.0, 100.0)
        y_pct = np.clip((point_m[1] / self.court_l) * 100.0, 0.0, 100.0)
        return float(x_pct), float(y_pct)

    def get_zone_2d(self, point_m: tuple[float, float]) -> str:
        """
        Map real court meters (x_m, y_m) to SportsScout 6 badminton zones:
        FL (Front-Left), FR (Front-Right),
        ML (Mid-Left),   MR (Mid-Right),
        BL (Back-Left),  BR (Back-Right).
        Also detects out of bounds (SIDE_OUT, LONG_OUT, NET_ERR).
        """
        x, y = point_m
        
        # Out of bounds check with 0.15m margin
        if x < -0.15 or x > self.court_w + 0.15:
            return "SIDE_OUT"
        if y < -0.15 or y > self.court_l + 0.15:
            return "LONG_OUT"
        if abs(y - NET_Y_M) < 0.20:
            return "NET_ERR"

        mid_x = self.court_w / 2.0
        is_left = x < mid_x

        # Top Court (y < 6.70m) vs Bottom Court (y >= 6.70m)
        if y < NET_Y_M:
            if y >= FRONT_BOUNDARY_TOP_M:
                return "FL" if is_left else "FR"
            elif y >= 2.36:
                return "ML" if is_left else "MR"
            else:
                return "BL" if is_left else "BR"
        else:
            if y <= FRONT_BOUNDARY_BOT_M:
                return "FL" if is_left else "FR"
            elif y <= 11.04:
                return "ML" if is_left else "MR"
            else:
                return "BL" if is_left else "BR"

    @staticmethod
    def euclidean_distance(p1: tuple[float, float], p2: tuple[float, float]) -> float:
        return float(np.sqrt((p2[0] - p1[0])**2 + (p2[1] - p1[1])**2))


class DistanceTracker:
    def __init__(self, mapper: CourtMapper, fps: float = 30.0, smooth_k: int = 5):
        self.mapper = mapper
        self.fps = fps
        self.smooth_k = smooth_k
        self._data: dict[int, dict] = {}

    def _get_or_create(self, player_id: int) -> dict:
        if player_id not in self._data:
            self._data[player_id] = {
                "player_id": player_id,
                "total_dist_m": 0.0,
                "prev_real": None,
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

    def update(self, player_id: int, center_px: tuple[float, float]) -> dict:
        d = self._get_or_create(player_id)
        real = self.mapper.pixel_to_real(center_px)
        pct = self.mapper.real_to_percent(real)
        zone = self.mapper.get_zone_2d(real)

        d["positions_px"].append(center_px)
        d["positions_m"].append(real)
        d["positions_pct"].append(pct)
        d["current_zone"] = zone

        if d["prev_real"] is not None:
            dist = CourtMapper.euclidean_distance(d["prev_real"], real)
            speed_ms = dist * self.fps

            # Filter noise jitter (< 0.04m) and impossible speeds (> 11.0 m/s)
            if dist > 0.04 and speed_ms < 11.0:
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
        else:
            d["speeds_ms"].append(0.0)
            d["current_speed_ms"] = 0.0

        d["prev_real"] = real
        return d

    def get_stats(self, player_id: int) -> dict:
        if player_id not in self._data:
            return {}
        d = self._data[player_id]
        speeds = d["speeds_ms"]
        last_pos_pct = d["positions_pct"][-1] if d["positions_pct"] else (50.0, 50.0)
        last_pos_m = d["positions_m"][-1] if d["positions_m"] else (3.35, 6.70)
        return {
            "player_id": player_id,
            "total_dist_m": round(d["total_dist_m"], 2),
            "max_speed_ms": round(d["max_speed_ms"], 2),
            "current_speed_ms": d["current_speed_ms"],
            "avg_speed_ms": round(float(np.mean(speeds)) if speeds else 0.0, 2),
            "current_zone": d["current_zone"],
            "court_pos_pct": {"x": round(last_pos_pct[0], 2), "y": round(last_pos_pct[1], 2)},
            "court_pos_m": {"x": round(last_pos_m[0], 2), "y": round(last_pos_m[1], 2)},
            "zone_dist": {k: round(v, 2) for k, v in d["zone_dist"].items()},
        }

    def all_stats(self) -> list[dict]:
        return [self.get_stats(pid) for pid in sorted(self._data.keys())]
