"""Phase 2.4 provenance-safe shuttle trajectory processing tests."""

from __future__ import annotations

import copy
import math
import unittest

from ai_service.shuttle_telemetry import ShuttleObservation, ShuttlePositionPx
from ai_service.shuttle_trajectory import ShuttleTrajectoryBuilder, TrajectoryConfig


def observation(
    frame_index: int,
    timestamp_sec: float,
    state: str = "observed",
    x: float | None = None,
    y: float | None = None,
) -> ShuttleObservation:
    return ShuttleObservation(
        timestamp_sec=timestamp_sec,
        frame_index=frame_index,
        state=state,
        source="temporal_tracker",
        position_px=ShuttlePositionPx(x, y) if x is not None and y is not None else None,
        confidence=0.9 if x is not None else None,
    )


class TestShuttleTrajectoryBuilder(unittest.TestCase):
    def test_raw_observations_are_unchanged(self):
        raw = [observation(0, 0.0, x=10, y=20), observation(1, 0.04, "lost")]
        before = copy.deepcopy(raw)

        result = ShuttleTrajectoryBuilder().build(raw)

        self.assertEqual(raw, before)
        self.assertIsNot(result.raw_observations[0], raw[0])
        self.assertEqual(result.raw_observations, before)

    def test_single_short_missing_frame_is_interpolated(self):
        result = ShuttleTrajectoryBuilder(TrajectoryConfig(max_interpolation_gap_seconds=0.1)).build([
            observation(0, 0.0, x=0, y=0),
            observation(1, 0.04, "lost"),
            observation(2, 0.08, x=80, y=40),
        ])

        point = next(point for point in result.points if point.frame_index == 1)
        self.assertEqual(point.state, "interpolated")
        self.assertEqual((point.position_px.x, point.position_px.y), (40.0, 20.0))

    def test_long_gap_remains_unbridged(self):
        result = ShuttleTrajectoryBuilder(TrajectoryConfig(max_interpolation_gap_seconds=0.1)).build([
            observation(0, 0.0, x=0, y=0),
            observation(1, 0.2, "lost"),
            observation(2, 0.4, "lost"),
            observation(3, 0.6, x=60, y=0),
        ])

        self.assertEqual([point.frame_index for point in result.points], [0, 3])

    def test_predicted_and_observed_states_are_preserved(self):
        result = ShuttleTrajectoryBuilder().build([
            observation(0, 0.0, x=0, y=0),
            observation(1, 0.04, "predicted", x=20, y=4),
            observation(2, 0.08, x=40, y=8),
        ])

        states = {point.frame_index: point.state for point in result.points}
        self.assertEqual(states, {0: "observed", 1: "predicted", 2: "observed"})

    def test_points_and_image_space_velocity_are_finite_for_irregular_timestamps(self):
        result = ShuttleTrajectoryBuilder().build([
            observation(0, 0.0, x=0, y=0),
            observation(4, 0.13, x=13, y=26),
            observation(7, 0.31, x=31, y=62),
        ])

        for point in result.points:
            self.assertTrue(math.isfinite(point.position_px.x))
            self.assertTrue(math.isfinite(point.position_px.y))
            if point.image_space_velocity_px_per_sec is not None:
                self.assertTrue(math.isfinite(point.image_space_velocity_px_per_sec.vx))
                self.assertTrue(math.isfinite(point.image_space_velocity_px_per_sec.vy))

    def test_rapid_direction_reversal_is_not_flattened(self):
        result = ShuttleTrajectoryBuilder(TrajectoryConfig(smoothing_alpha=0.2)).build([
            observation(0, 0.0, x=0, y=0),
            observation(1, 0.04, x=100, y=0),
            observation(2, 0.08, x=0, y=0),
        ])

        final = next(point for point in result.points if point.frame_index == 2)
        self.assertEqual(final.position_px.x, 0.0)

    def test_analytics_counts_raw_observations_separately_from_derived_points(self):
        result = ShuttleTrajectoryBuilder().build([
            observation(0, 0.0, x=0, y=0),
            observation(1, 0.04, "lost"),
            observation(2, 0.08, x=80, y=0),
            observation(3, 0.12, "predicted", x=120, y=0),
        ])

        self.assertEqual(result.analytics.raw_observed_count, 2)
        self.assertEqual(result.analytics.raw_predicted_count, 1)
        self.assertEqual(result.analytics.derived_interpolated_count, 1)
        self.assertEqual(result.analytics.detection_recall_numerator, 2)

    def test_invalid_or_unordered_observations_are_rejected(self):
        with self.assertRaises(ValueError):
            ShuttleTrajectoryBuilder().build([
                observation(1, 0.1, x=1, y=1),
                observation(0, 0.2, x=2, y=2),
            ])
        with self.assertRaises(ValueError):
            ShuttleTrajectoryBuilder().build([observation(0, 0.0, x=float("nan"), y=0)])


if __name__ == "__main__":
    unittest.main()
