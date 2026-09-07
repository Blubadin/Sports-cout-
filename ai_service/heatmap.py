"""
heatmap.py — 4-Player Badminton Heatmap Generator
Supports Gaussian density smoothing for Singles & Doubles.
"""

from __future__ import annotations
import numpy as np
import cv2
from scipy.ndimage import gaussian_filter

COURT_L = 13.40
COURT_W_DOUBLES = 6.71
COURT_W_SINGLES = 6.10


class HeatmapGenerator:
    def __init__(self, court_length_m: float = COURT_L, court_width_m: float = COURT_W_DOUBLES, resolution: int = 50, sigma: float = 0.8):
        self.L = court_length_m
        self.W = court_width_m
        self.res = resolution
        self.sigma = sigma

        self.grid_h = int(court_length_m * resolution)
        self.grid_w = int(court_width_m * resolution)
        self._grids: dict[int, np.ndarray] = {}

    def _get_grid(self, player_id: int) -> np.ndarray:
        if player_id not in self._grids:
            self._grids[player_id] = np.zeros((self.grid_h, self.grid_w), dtype=np.float32)
        return self._grids[player_id]

    def add_position(self, player_id: int, x_m: float, y_m: float):
        grid = self._get_grid(player_id)
        gx = int(np.clip((x_m / self.W) * self.grid_w, 0, self.grid_w - 1))
        gy = int(np.clip((y_m / self.L) * self.grid_h, 0, self.grid_h - 1))
        grid[gy, gx] += 1.0

    def get_heatmap(self, player_id: int) -> np.ndarray:
        grid = self._get_grid(player_id).copy()
        sigma_px = self.sigma * self.res
        blurred = gaussian_filter(grid, sigma=sigma_px)
        if blurred.max() > 0:
            blurred /= blurred.max()
        return blurred

    def get_heatmap_grid_points(self, player_id: int, threshold: float = 0.15) -> list[dict]:
        """
        Return downsampled grid points with normalized intensity (0..1)
        suitable for JSON transmission to frontend SVG/Canvas rendering.
        """
        hm = self.get_heatmap(player_id)
        # Downsample to 20x40 grid
        step_x = max(1, self.grid_w // 20)
        step_y = max(1, self.grid_h // 40)
        
        points = []
        for gy in range(0, self.grid_h, step_y):
            for gx in range(0, self.grid_w, step_x):
                val = float(hm[gy, gx])
                if val >= threshold:
                    x_pct = round((gx / self.grid_w) * 100.0, 1)
                    y_pct = round((gy / self.grid_h) * 100.0, 1)
                    points.append({"x": x_pct, "y": y_pct, "weight": round(val, 2)})
        return points

    def reset(self, player_id: int | None = None):
        if player_id is not None:
            self._grids.pop(player_id, None)
        else:
            self._grids.clear()
