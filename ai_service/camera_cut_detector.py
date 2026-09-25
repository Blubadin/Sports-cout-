"""Deterministic, frame-level camera discontinuity guard.

This deliberately detects only strong global changes. Ambiguous changes leave
calibration untouched; a future court-geometry provider can supply stronger
evidence for less obvious viewpoint changes.
"""

from __future__ import annotations

import cv2
import numpy as np


class CameraCutDetector:
    def __init__(self, cooldown_frames: int = 8) -> None:
        if cooldown_frames < 0:
            raise ValueError("cooldown_frames must be nonnegative")
        self.cooldown_frames = cooldown_frames
        self._cooldown_remaining = 0
        self._previous: np.ndarray | None = None
        self._pre_cut: np.ndarray | None = None

    def reset(self) -> None:
        """Discard comparisons spanning an externally declared segment cut."""
        self._previous = None
        self._pre_cut = None
        self._cooldown_remaining = 0

    def rearm_after_calibration(self) -> None:
        """A newly accepted H must be guarded against the very next frame."""
        self._cooldown_remaining = 0

    def observe(self, frame: np.ndarray) -> bool:
        """Return true for a strong frame-wide visual discontinuity."""
        if frame is None or frame.ndim != 3 or frame.shape[2] != 3 or frame.size == 0:
            raise ValueError("Camera cut detection requires a nonempty BGR frame")

        small = cv2.resize(frame, (96, 72), interpolation=cv2.INTER_AREA)
        small = cv2.GaussianBlur(small, (5, 5), 0)
        previous = self._previous
        self._previous = small
        if previous is None:
            return False

        difference = cv2.absdiff(previous, small)
        mean_change = float(np.mean(difference)) / 255.0
        changed_fraction = float(np.mean(np.max(difference, axis=2) >= 45))

        old_edges = cv2.Canny(cv2.cvtColor(previous, cv2.COLOR_BGR2GRAY), 35, 90) > 0
        new_edges = cv2.Canny(cv2.cvtColor(small, cv2.COLOR_BGR2GRAY), 35, 90) > 0
        edge_union = old_edges | new_edges
        edge_coverage = float(np.mean(edge_union))
        changed_edges = old_edges ^ new_edges
        edge_disagreement = float(np.mean(changed_edges) / edge_coverage) if edge_coverage else 0.0
        changed_cells = int(np.count_nonzero(
            changed_edges.reshape(4, 18, 4, 24).mean(axis=(1, 3)) >= 0.015
        ))

        if self._cooldown_remaining:
            self._cooldown_remaining -= 1
            returns_to_prior_view = (
                self._pre_cut is not None
                and float(np.mean(cv2.absdiff(small, self._pre_cut))) / 255.0 <= 0.04
            )
            strongly_distinct = (mean_change >= 0.35 and changed_fraction >= 0.75
                                 and changed_cells >= 10)
            if not (returns_to_prior_view or strongly_distinct):
                return False

        # Color alone can change under lighting. Court line structure provides
        # an independent cue; a large viewpoint shift can also alter structure
        # while retaining the same overall palette.
        color_cut = (mean_change >= 0.18 and changed_fraction >= 0.50
                     and edge_disagreement >= 0.55 and changed_cells >= 10)
        geometry_cut = (edge_coverage >= 0.025 and edge_disagreement >= 0.68
                        and changed_cells >= 10)
        featureless_cut = (edge_coverage < 0.025 and mean_change >= 0.65
                           and changed_fraction >= 0.95)
        if color_cut or geometry_cut or featureless_cut:
            self._pre_cut = previous
            self._cooldown_remaining = self.cooldown_frames
            return True
        return False
