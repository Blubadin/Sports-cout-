"""Provenance-safe derived image-space shuttle trajectories (Phase 2.10A)."""

from __future__ import annotations

from copy import deepcopy
from dataclasses import dataclass
import math
from typing import Iterable

from ai_service.shuttle_telemetry import ShuttleObservation, ShuttlePositionPx, ShuttleVelocityPx


@dataclass(frozen=True)
class TrajectoryConfig:
    """Controls for derived trajectory processing in source image coordinates.

    ``max_interpolation_gap_seconds`` is retained as a compatibility override for
    callers of the Phase 2.4 API. The effective continuity threshold is the
    stricter of that value and ``max_continuity_gap_seconds``.
    """

    max_continuity_gap_seconds: float = 0.12
    max_interpolation_gap_seconds: float | None = None
    smoothing_time_constant_seconds: float = 0.05
    max_runtime_history_points: int = 4096

    def __post_init__(self) -> None:
        for name in (
            "max_continuity_gap_seconds",
            "smoothing_time_constant_seconds",
        ):
            value = getattr(self, name)
            if not isinstance(value, (int, float)) or not math.isfinite(float(value)) or value < 0:
                raise ValueError(f"{name} must be a non-negative finite number")
        if self.smoothing_time_constant_seconds <= 0:
            raise ValueError("smoothing_time_constant_seconds must be greater than zero")
        if self.max_interpolation_gap_seconds is not None:
            value = self.max_interpolation_gap_seconds
            if not isinstance(value, (int, float)) or not math.isfinite(float(value)) or value < 0:
                raise ValueError("max_interpolation_gap_seconds must be a non-negative finite number")
        if (
            not isinstance(self.max_runtime_history_points, int)
            or isinstance(self.max_runtime_history_points, bool)
            or self.max_runtime_history_points < 1
        ):
            raise ValueError("max_runtime_history_points must be a positive integer")

    @property
    def continuity_gap_seconds(self) -> float:
        """Return the single threshold used for segmentation and interpolation."""

        if self.max_interpolation_gap_seconds is None:
            return float(self.max_continuity_gap_seconds)
        return min(float(self.max_continuity_gap_seconds), float(self.max_interpolation_gap_seconds))


@dataclass(frozen=True)
class DerivedTrajectoryPoint:
    timestamp_sec: float
    frame_index: int
    state: str
    position_px: ShuttlePositionPx
    source: str
    segment_id: int
    image_space_velocity_px_per_sec: ShuttleVelocityPx | None = None

    @property
    def segmentId(self) -> int:  # noqa: N802 - mirrors the cross-layer contract name
        """Camel-case view for consumers that serialize the derived contract."""

        return self.segment_id


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

        # Segment identity is assigned before any derived smoothing. This keeps
        # continuity decisions tied to source timestamps, not array adjacency or
        # smoothed coordinates.
        points_by_frame = self._raw_points(raw)
        self._add_short_gap_interpolation(raw, points_by_frame)
        points = [points_by_frame[frame_index] for frame_index in sorted(points_by_frame)]
        points = self._with_time_aware_smoothing(raw, points)
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
        previous_valid_timestamp: float | None = None
        segment_id = -1
        for observation in raw:
            if observation.position_px is None or observation.state not in {"observed", "predicted", "interpolated"}:
                continue

            if previous_valid_timestamp is None:
                segment_id = 0
            elif observation.timestamp_sec - previous_valid_timestamp > self.config.continuity_gap_seconds:
                segment_id += 1

            position = ShuttlePositionPx(observation.position_px.x, observation.position_px.y)
            self._validate_finite_position(position)
            points[observation.frame_index] = DerivedTrajectoryPoint(
                timestamp_sec=observation.timestamp_sec,
                frame_index=observation.frame_index,
                state=observation.state,
                position_px=position,
                source=observation.source,
                segment_id=segment_id,
            )
            previous_valid_timestamp = observation.timestamp_sec
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
            before_point = points_by_frame.get(before.frame_index)
            after_point = points_by_frame.get(after.frame_index)
            if before_point is None or after_point is None or before_point.segment_id != after_point.segment_id:
                continue
            gap = after.timestamp_sec - before.timestamp_sec
            if gap <= 0 or gap > self.config.continuity_gap_seconds:
                continue
            for missing in raw[start : end + 1]:
                fraction = (missing.timestamp_sec - before.timestamp_sec) / gap
                position = ShuttlePositionPx(
                    before.position_px.x + fraction * (after.position_px.x - before.position_px.x),
                    before.position_px.y + fraction * (after.position_px.y - before.position_px.y),
                )
                self._validate_finite_position(position)
                points_by_frame[missing.frame_index] = DerivedTrajectoryPoint(
                    timestamp_sec=missing.timestamp_sec,
                    frame_index=missing.frame_index,
                    state="interpolated",
                    position_px=position,
                    source="model_assisted",
                    segment_id=before_point.segment_id,
                )

    def _with_time_aware_smoothing(
        self,
        raw: list[ShuttleObservation],
        points: list[DerivedTrajectoryPoint],
    ) -> list[DerivedTrajectoryPoint]:
        points_by_frame = {point.frame_index: point for point in points}
        previous_observed_raw: ShuttleObservation | None = None
        previous_observed_point: DerivedTrajectoryPoint | None = None
        previous_observed_delta: tuple[float, float] | None = None

        for observation in raw:
            point = points_by_frame.get(observation.frame_index)
            if point is None or observation.state != "observed" or observation.position_px is None:
                continue

            position = point.position_px
            if previous_observed_raw is not None and previous_observed_point is not None:
                raw_delta = (
                    observation.position_px.x - previous_observed_raw.position_px.x,
                    observation.position_px.y - previous_observed_raw.position_px.y,
                )
                same_segment = point.segment_id == previous_observed_point.segment_id
                direction_reversed = (
                    same_segment
                    and previous_observed_delta is not None
                    and raw_delta[0] * previous_observed_delta[0] + raw_delta[1] * previous_observed_delta[1] <= 0
                )
                dt = observation.timestamp_sec - previous_observed_raw.timestamp_sec
                if same_segment and dt > 0 and not direction_reversed:
                    effective_alpha = 1.0 - math.exp(-dt / self.config.smoothing_time_constant_seconds)
                    position = ShuttlePositionPx(
                        previous_observed_point.position_px.x
                        + effective_alpha * (position.x - previous_observed_point.position_px.x),
                        previous_observed_point.position_px.y
                        + effective_alpha * (position.y - previous_observed_point.position_px.y),
                    )
                    self._validate_finite_position(position)
            points_by_frame[observation.frame_index] = DerivedTrajectoryPoint(
                timestamp_sec=point.timestamp_sec,
                frame_index=point.frame_index,
                state=point.state,
                position_px=position,
                source=point.source,
                segment_id=point.segment_id,
            )
            previous_observed_delta = (
                observation.position_px.x - previous_observed_raw.position_px.x,
                observation.position_px.y - previous_observed_raw.position_px.y,
            ) if previous_observed_raw is not None and point.segment_id == previous_observed_point.segment_id else None
            previous_observed_raw = observation
            previous_observed_point = points_by_frame[observation.frame_index]

        return [points_by_frame[point.frame_index] for point in points]

    @staticmethod
    def _observed_endpoint(observation: ShuttleObservation | None) -> bool:
        return observation is not None and observation.state == "observed" and observation.position_px is not None

    @staticmethod
    def _validate_finite_position(position: ShuttlePositionPx) -> None:
        if not math.isfinite(position.x) or not math.isfinite(position.y):
            raise ValueError("derived trajectory position must be finite")

    @classmethod
    def _with_image_space_velocity(cls, points: list[DerivedTrajectoryPoint]) -> list[DerivedTrajectoryPoint]:
        output: list[DerivedTrajectoryPoint] = []
        previous: DerivedTrajectoryPoint | None = None
        for point in points:
            velocity = None
            if previous is not None and point.segment_id == previous.segment_id:
                dt = point.timestamp_sec - previous.timestamp_sec
                if dt > 0 and math.isfinite(dt):
                    vx = (point.position_px.x - previous.position_px.x) / dt
                    vy = (point.position_px.y - previous.position_px.y) / dt
                    if math.isfinite(vx) and math.isfinite(vy):
                        velocity = ShuttleVelocityPx(vx=vx, vy=vy)
            output.append(DerivedTrajectoryPoint(
                timestamp_sec=point.timestamp_sec,
                frame_index=point.frame_index,
                state=point.state,
                position_px=point.position_px,
                source=point.source,
                segment_id=point.segment_id,
                image_space_velocity_px_per_sec=velocity,
            ))
            previous = point
        return output
