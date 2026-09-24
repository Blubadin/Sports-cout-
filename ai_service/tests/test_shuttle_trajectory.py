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
    source: str = "temporal_tracker",
) -> ShuttleObservation:
    return ShuttleObservation(
        timestamp_sec=timestamp_sec,
        frame_index=frame_index,
        state=state,
        source=source,
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
        result = ShuttleTrajectoryBuilder(TrajectoryConfig(max_continuity_gap_seconds=0.1)).build([
            observation(0, 0.0, x=0, y=0),
            observation(1, 0.04, "lost"),
            observation(2, 0.08, x=80, y=40),
        ])

        point = next(point for point in result.points if point.frame_index == 1)
        self.assertEqual(point.state, "interpolated")
        self.assertEqual((point.position_px.x, point.position_px.y), (40.0, 20.0))

    def test_long_gap_remains_unbridged(self):
        result = ShuttleTrajectoryBuilder(TrajectoryConfig(max_continuity_gap_seconds=0.1)).build([
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

    def test_short_gap_stays_in_one_segment(self):
        result = ShuttleTrajectoryBuilder(TrajectoryConfig(max_continuity_gap_seconds=0.1)).build([
            observation(0, 0.0, x=0, y=0),
            observation(1, 0.04, "lost"),
            observation(2, 0.08, x=80, y=40),
        ])

        self.assertEqual({point.segment_id for point in result.points}, {0})
        self.assertEqual([point.frame_index for point in result.points], [0, 1, 2])

    def test_long_gap_starts_new_segment_and_velocity_is_unavailable(self):
        result = ShuttleTrajectoryBuilder(TrajectoryConfig(max_continuity_gap_seconds=0.1)).build([
            observation(0, 0.0, x=0, y=0),
            observation(1, 0.2, "lost"),
            observation(2, 0.4, "lost"),
            observation(3, 0.6, x=60, y=0),
        ])

        self.assertEqual([point.segment_id for point in result.points], [0, 1])
        self.assertIsNone(result.points[1].image_space_velocity_px_per_sec)

    def test_velocity_is_timestamp_based_within_one_segment(self):
        result = ShuttleTrajectoryBuilder(TrajectoryConfig(
            max_continuity_gap_seconds=0.2,
            smoothing_time_constant_seconds=1e-9,
        )).build([
            observation(0, 0.0, x=0, y=0),
            observation(1, 0.05, x=10, y=5),
        ])

        velocity = result.points[1].image_space_velocity_px_per_sec
        self.assertIsNotNone(velocity)
        self.assertAlmostEqual(velocity.vx, 200.0)
        self.assertAlmostEqual(velocity.vy, 100.0)

    def test_predicted_and_interpolated_provenance_are_preserved(self):
        result = ShuttleTrajectoryBuilder(TrajectoryConfig(max_continuity_gap_seconds=0.1)).build([
            observation(0, 0.0, x=0, y=0, source="temporal_tracker"),
            observation(1, 0.04, "predicted", x=40, y=4, source="model_assisted"),
            observation(2, 0.08, x=80, y=8, source="temporal_tracker"),
            observation(3, 0.12, "lost"),
            observation(4, 0.16, x=160, y=16, source="auxiliary_detector"),
        ])

        by_frame = {point.frame_index: point for point in result.points}
        self.assertEqual(by_frame[1].state, "predicted")
        self.assertEqual(by_frame[1].source, "model_assisted")
        self.assertEqual(by_frame[3].state, "interpolated")
        self.assertEqual(by_frame[3].source, "model_assisted")

    def test_very_small_dt_is_finite_and_rapid_reversal_is_preserved(self):
        result = ShuttleTrajectoryBuilder(TrajectoryConfig(smoothing_time_constant_seconds=0.05)).build([
            observation(0, 0.0, x=0, y=0),
            observation(1, 1e-12, x=100, y=0),
            observation(2, 0.04, x=0, y=0),
        ])

        final = result.points[-1]
        self.assertEqual(final.position_px.x, 0.0)
        for point in result.points:
            self.assertTrue(math.isfinite(point.position_px.x))
            self.assertTrue(math.isfinite(point.position_px.y))
            if point.image_space_velocity_px_per_sec is not None:
                self.assertTrue(math.isfinite(point.image_space_velocity_px_per_sec.vx))
                self.assertTrue(math.isfinite(point.image_space_velocity_px_per_sec.vy))

    def test_empty_and_one_point_trajectories_are_valid(self):
        empty = ShuttleTrajectoryBuilder().build([])
        self.assertEqual(empty.points, [])

        one = ShuttleTrajectoryBuilder().build([observation(0, 0.0, x=4, y=8)])
        self.assertEqual(one.points[0].segment_id, 0)
        self.assertIsNone(one.points[0].image_space_velocity_px_per_sec)

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
        result = ShuttleTrajectoryBuilder(TrajectoryConfig(smoothing_time_constant_seconds=0.04)).build([
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
