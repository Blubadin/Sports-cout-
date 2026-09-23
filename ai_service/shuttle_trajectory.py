"""Provenance-safe derived image-space shuttle trajectories (Phase 2.4)."""

from __future__ import annotations

from copy import deepcopy
from dataclasses import dataclass
import math
from typing import Iterable

from ai_service.shuttle_telemetry import ShuttleObservation, ShuttlePositionPx, ShuttleVelocityPx


@dataclass(frozen=True)
class TrajectoryConfig:
    """Conservative display-trajectory controls in source image coordinates."""

    max_interpolation_gap_seconds: float = 0.12
    max_smoothing_gap_seconds: float = 0.10
    smoothing_alpha: float = 0.15

    def __post_init__(self) -> None:
        for name in ("max_interpolation_gap_seconds", "max_smoothing_gap_seconds", "smoothing_alpha"):
            value = getattr(self, name)
            if not isinstance(value, (int, float)) or not math.isfinite(float(value)) or value < 0:
                raise ValueError(f"{name} must be a non-negative finite number")
        if self.smoothing_alpha > 0.5:
            raise ValueError("smoothing_alpha must be <= 0.5 for conservative smoothing")


@dataclass(frozen=True)
class DerivedTrajectoryPoint:
    timestamp_sec: float
    frame_index: int
    state: str
    position_px: ShuttlePositionPx
    source: str
    image_space_velocity_px_per_sec: ShuttleVelocityPx | None = None


@dataclass(frozen=True)
class TrajectoryAnalytics:
    raw_observed_count: int
    raw_predicted_count: int
    raw_position_count: int
    derived_point_count: int
    derived_interpolated_count: int
    detection_recall_numerator: int


@dataclass(frozen=True)
class ShuttleTrajectory:
    """Raw snapshots and derived visualization points are intentionally separate."""

    raw_observations: list[ShuttleObservation]
    points: list[DerivedTrajectoryPoint]
    analytics: TrajectoryAnalytics


class ShuttleTrajectoryBuilder:
    def __init__(self, config: TrajectoryConfig | None = None) -> None:
        self.config = config or TrajectoryConfig()

    def build(self, observations: Iterable[ShuttleObservation]) -> ShuttleTrajectory:
        raw = [deepcopy(item) for item in observations]
        self._validate_order_and_positions(raw)
        points_by_frame = self._raw_points(raw)
        self._add_short_gap_interpolation(raw, points_by_frame)
        points = [points_by_frame[frame_index] for frame_index in sorted(points_by_frame)]
        points = self._with_image_space_velocity(points)
        raw_observed = sum(item.state == "observed" and item.position_px is not None for item in raw)
        raw_predicted = sum(item.state == "predicted" and item.position_px is not None for item in raw)
        raw_positions = sum(item.position_px is not None for item in raw)
        interpolated = sum(item.state == "interpolated" for item in points)
        return ShuttleTrajectory(
            raw_observations=raw,
            points=points,
            analytics=TrajectoryAnalytics(
                raw_observed_count=raw_observed,
                raw_predicted_count=raw_predicted,
                raw_position_count=raw_positions,
                derived_point_count=len(points),
                derived_interpolated_count=interpolated,
                detection_recall_numerator=raw_observed,
            ),
        )

    def _validate_order_and_positions(self, observations: list[ShuttleObservation]) -> None:
        prior_frame: int | None = None
        prior_timestamp: float | None = None
        for observation in observations:
            errors = observation.validate()
            if errors:
                raise ValueError(f"invalid ShuttleObservation: {'; '.join(errors)}")
            if prior_frame is not None and observation.frame_index <= prior_frame:
                raise ValueError("observations must have strictly increasing frame indices")
            if prior_timestamp is not None and observation.timestamp_sec <= prior_timestamp:
                raise ValueError("observations must have strictly increasing timestamps")
            prior_frame = observation.frame_index
            prior_timestamp = observation.timestamp_sec

    def _raw_points(self, raw: list[ShuttleObservation]) -> dict[int, DerivedTrajectoryPoint]:
        points: dict[int, DerivedTrajectoryPoint] = {}
        previous_observed_raw: ShuttleObservation | None = None
        previous_observed_point: DerivedTrajectoryPoint | None = None
        previous_observed_delta: tuple[float, float] | None = None
        for observation in raw:
            if observation.position_px is None or observation.state not in {"observed", "predicted", "interpolated"}:
                continue
            position = ShuttlePositionPx(observation.position_px.x, observation.position_px.y)
            if observation.state == "observed" and previous_observed_raw and previous_observed_point:
                raw_delta = (
                    position.x - previous_observed_raw.position_px.x,
                    position.y - previous_observed_raw.position_px.y,
                )
                direction_reversed = (
                    previous_observed_delta is not None
                    and raw_delta[0] * previous_observed_delta[0] + raw_delta[1] * previous_observed_delta[1] <= 0
                )
                short_gap = observation.timestamp_sec - previous_observed_raw.timestamp_sec <= self.config.max_smoothing_gap_seconds
                if short_gap and not direction_reversed:
                    alpha = self.config.smoothing_alpha
                    position = ShuttlePositionPx(
                        (1.0 - alpha) * position.x + alpha * previous_observed_point.position_px.x,
                        (1.0 - alpha) * position.y + alpha * previous_observed_point.position_px.y,
                    )
                previous_observed_delta = raw_delta
            points[observation.frame_index] = DerivedTrajectoryPoint(
                timestamp_sec=observation.timestamp_sec,
                frame_index=observation.frame_index,
                state=observation.state,
                position_px=position,
                source=observation.source,
            )
            if observation.state == "observed":
                previous_observed_raw = observation
                previous_observed_point = points[observation.frame_index]
        return points

    def _add_short_gap_interpolation(
        self,
        raw: list[ShuttleObservation],
        points_by_frame: dict[int, DerivedTrajectoryPoint],
    ) -> None:
        for index, observation in enumerate(raw):
            if observation.state not in {"lost", "unknown"} or observation.position_px is not None:
                continue
            start = index
            while index + 1 < len(raw) and raw[index + 1].state in {"lost", "unknown"} and raw[index + 1].position_px is None:
                index += 1
            end = index
            before = raw[start - 1] if start > 0 else None
            after = raw[end + 1] if end + 1 < len(raw) else None
            if not self._observed_endpoint(before) or not self._observed_endpoint(after):
                continue
            assert before is not None and after is not None
            gap = after.timestamp_sec - before.timestamp_sec
            if gap <= 0 or gap > self.config.max_interpolation_gap_seconds:
                continue
            for missing in raw[start : end + 1]:
                fraction = (missing.timestamp_sec - before.timestamp_sec) / gap
                points_by_frame[missing.frame_index] = DerivedTrajectoryPoint(
                    timestamp_sec=missing.timestamp_sec,
                    frame_index=missing.frame_index,
                    state="interpolated",
                    position_px=ShuttlePositionPx(
                        before.position_px.x + fraction * (after.position_px.x - before.position_px.x),
                        before.position_px.y + fraction * (after.position_px.y - before.position_px.y),
                    ),
                    source="model_assisted",
                )

    @staticmethod
    def _observed_endpoint(observation: ShuttleObservation | None) -> bool:
        return observation is not None and observation.state == "observed" and observation.position_px is not None

    @staticmethod
    def _with_image_space_velocity(points: list[DerivedTrajectoryPoint]) -> list[DerivedTrajectoryPoint]:
        output: list[DerivedTrajectoryPoint] = []
        previous: DerivedTrajectoryPoint | None = None
        for point in points:
            velocity = None
            if previous is not None:
                dt = point.timestamp_sec - previous.timestamp_sec
                if dt > 0:
                    velocity = ShuttleVelocityPx(
                        vx=(point.position_px.x - previous.position_px.x) / dt,
                        vy=(point.position_px.y - previous.position_px.y) / dt,
                    )
            output.append(DerivedTrajectoryPoint(
                timestamp_sec=point.timestamp_sec,
                frame_index=point.frame_index,
                state=point.state,
                position_px=point.position_px,
                source=point.source,
                image_space_velocity_px_per_sec=velocity,
            ))
            previous = point
        return output
