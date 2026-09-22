"""
ai_service/shuttle_telemetry.py — Canonical Shuttlecock Telemetry Contract (Phase 2.1)

Defines the Python data contract for shuttlecock observations, state semantics,
provenance tracking, and unified tracking frames.

Invariants:
1. State distinctness: observed != predicted != interpolated != lost != unknown.
2. Coordinate honesty: Unknown/lost coordinates MUST remain None. No coordinate
   may silently become (0, 0).
3. Measured zeroes: Measured coordinate (0, 0) at the top-left pixel IS VALID
   when explicitly measured under observed, predicted, or interpolated states.
4. Separate stream: Shuttle telemetry is tracked in a dedicated 'shuttle' field,
   never mixed into athlete player arrays.
"""

from __future__ import annotations
from dataclasses import dataclass, field
import json
import math
from typing import Any, Dict, List, Optional, Union


VALID_SHUTTLE_STATES = ("observed", "predicted", "interpolated", "lost", "unknown")
VALID_SHUTTLE_SOURCES = (
    "temporal_tracker",
    "auxiliary_detector",
    "manual",
    "model_assisted",
    "unknown",
)


def _optional_float(value: Any) -> Optional[float]:
    if value is None:
        return None
    try:
        val = float(value)
        return val if math.isfinite(val) else None
    except (TypeError, ValueError):
        return None


def _optional_int(value: Any) -> Optional[int]:
    val = _optional_float(value)
    return int(val) if val is not None else None


@dataclass
class ShuttlePositionPx:
    """2D pixel coordinates in native video frame space."""

    x: float
    y: float

    def to_dict(self) -> Dict[str, float]:
        return {"x": self.x, "y": self.y}

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> ShuttlePositionPx:
        return cls(
            x=float(data["x"]),
            y=float(data["y"]),
        )


@dataclass
class ShuttleVelocityPx:
    """2D pixel velocity in pixels per second."""

    vx: float
    vy: float

    def to_dict(self) -> Dict[str, float]:
        return {"vx": self.vx, "vy": self.vy}

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> ShuttleVelocityPx:
        return cls(
            vx=float(data["vx"]),
            vy=float(data["vy"]),
        )


@dataclass
class ShuttleObservation:
    """
    Canonical shuttlecock observation for a single frame.

    Rules:
    - observed: position_px must be valid non-None coordinate.
    - predicted / interpolated: position_px can be coordinate or None.
    - lost / unknown: position_px MUST be None. (0, 0) is forbidden.
    - Measured (0, 0) is valid only when actually measured in observed/predicted/interpolated.
    """

    timestamp_sec: float
    frame_index: int
    state: str
    source: str = "unknown"
    position_px: Optional[ShuttlePositionPx] = None
    confidence: Optional[float] = None
    trajectory_id: Optional[Union[str, int]] = None
    velocity_px_per_sec: Optional[ShuttleVelocityPx] = None
    speed_px_per_sec: Optional[float] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "timestampSec": self.timestamp_sec,
            "frameIndex": self.frame_index,
            "state": self.state,
            "source": self.source,
            "positionPx": self.position_px.to_dict() if self.position_px is not None else None,
            "confidence": self.confidence,
            "trajectoryId": self.trajectory_id,
            "velocityPxPerSec": self.velocity_px_per_sec.to_dict()
            if self.velocity_px_per_sec is not None
            else None,
            "speedPxPerSec": self.speed_px_per_sec,
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> ShuttleObservation:
        pos_data = data.get("positionPx")
        pos = ShuttlePositionPx.from_dict(pos_data) if pos_data is not None else None

        vel_data = data.get("velocityPxPerSec")
        vel = ShuttleVelocityPx.from_dict(vel_data) if vel_data is not None else None

        return cls(
            timestamp_sec=float(data["timestampSec"]),
            frame_index=int(data["frameIndex"]),
            state=str(data.get("state", "unknown")),
            source=str(data.get("source", "unknown")),
            position_px=pos,
            confidence=_optional_float(data.get("confidence")),
            trajectory_id=data.get("trajectoryId"),
            velocity_px_per_sec=vel,
            speed_px_per_sec=_optional_float(data.get("speedPxPerSec")),
        )

    def validate(self) -> List[str]:
        errors = []

        if not math.isfinite(self.timestamp_sec) or self.timestamp_sec < 0:
            errors.append("timestampSec must be a non-negative finite number")

        if not isinstance(self.frame_index, int) or self.frame_index < 0:
            errors.append("frameIndex must be a non-negative integer")

        if self.state not in VALID_SHUTTLE_STATES:
            errors.append(
                f"state must be one of: {', '.join(VALID_SHUTTLE_STATES)} (got: {self.state})"
            )

        if self.source not in VALID_SHUTTLE_SOURCES:
            errors.append(
                f"source must be one of: {', '.join(VALID_SHUTTLE_SOURCES)} (got: {self.source})"
            )

        if self.confidence is not None:
            if not math.isfinite(self.confidence) or self.confidence < 0.0 or self.confidence > 1.0:
                errors.append("confidence must be a number between 0.0 and 1.0 or None")

        if self.state == "observed":
            if self.position_px is None:
                errors.append("observed state requires a valid positionPx {x, y}")
            else:
                if not math.isfinite(self.position_px.x):
                    errors.append("positionPx.x must be a finite number")
                if not math.isfinite(self.position_px.y):
                    errors.append("positionPx.y must be a finite number")

        elif self.state in ("lost", "unknown"):
            if self.position_px is not None:
                if self.position_px.x == 0 and self.position_px.y == 0:
                    errors.append(
                        f"{self.state} shuttle must not represent missing coordinates as fake zero (0, 0); positionPx must be None"
                    )
                else:
                    errors.append(f"{self.state} shuttle must have None positionPx")

        elif self.state in ("predicted", "interpolated"):
            if self.position_px is not None:
                if not math.isfinite(self.position_px.x):
                    errors.append("positionPx.x must be a finite number")
                if not math.isfinite(self.position_px.y):
                    errors.append("positionPx.y must be a finite number")

        if self.velocity_px_per_sec is not None:
            if not math.isfinite(self.velocity_px_per_sec.vx):
                errors.append("velocityPxPerSec.vx must be a finite number")
            if not math.isfinite(self.velocity_px_per_sec.vy):
                errors.append("velocityPxPerSec.vy must be a finite number")

        if self.speed_px_per_sec is not None:
            if not math.isfinite(self.speed_px_per_sec) or self.speed_px_per_sec < 0:
                errors.append("speedPxPerSec must be a non-negative finite number or None")

        return errors


@dataclass
class ShuttleRunConfig:
    """Execution and benchmark provenance configuration for a shuttle tracking run."""

    tracker_model: str
    tracker_version: Optional[str] = None
    window_size: Optional[int] = None
    input_width: Optional[int] = None
    input_height: Optional[int] = None
    confidence_threshold: Optional[float] = None
    device: Optional[str] = None
    runtime: Optional[str] = None
    precision: Optional[str] = None
    auxiliary_detector: Optional[str] = None
    auxiliary_detector_version: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "trackerModel": self.tracker_model,
            "trackerVersion": self.tracker_version,
            "windowSize": self.window_size,
            "inputWidth": self.input_width,
            "inputHeight": self.input_height,
            "confidenceThreshold": self.confidence_threshold,
            "device": self.device,
            "runtime": self.runtime,
            "precision": self.precision,
            "auxiliaryDetector": self.auxiliary_detector,
            "auxiliaryDetectorVersion": self.auxiliary_detector_version,
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> ShuttleRunConfig:
        return cls(
            tracker_model=str(data["trackerModel"]),
            tracker_version=data.get("trackerVersion"),
            window_size=_optional_int(data.get("windowSize")),
            input_width=_optional_int(data.get("inputWidth")),
            input_height=_optional_int(data.get("inputHeight")),
            confidence_threshold=_optional_float(data.get("confidenceThreshold")),
            device=data.get("device"),
            runtime=data.get("runtime"),
            precision=data.get("precision"),
            auxiliary_detector=data.get("auxiliaryDetector"),
            auxiliary_detector_version=data.get("auxiliaryDetectorVersion"),
        )


@dataclass
class TrackingFrame:
    """
    Unified tracking frame containing athlete tracking data and the dedicated shuttle stream.
    Backward-compatible: if 'shuttle' key is missing from dict, it defaults to None safely.
    """

    timestamp_sec: float
    frame_index: int
    players: List[Dict[str, Any]] = field(default_factory=list)
    shuttle: Optional[ShuttleObservation] = None
    extra_fields: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        d = {
            "timestampSec": self.timestamp_sec,
            "frameIndex": self.frame_index,
            "players": self.players,
            "shuttle": self.shuttle.to_dict() if self.shuttle is not None else None,
        }
        d.update(self.extra_fields)
        return d

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> TrackingFrame:
        shuttle_data = data.get("shuttle")
        shuttle = ShuttleObservation.from_dict(shuttle_data) if shuttle_data is not None else None

        # Extract known keys, put remainder into extra_fields
        known_keys = {"timestampSec", "timestamp", "frameIndex", "frame_idx", "players", "shuttle"}
        extra = {k: v for k, v in data.items() if k not in known_keys}

        t_sec = float(data.get("timestampSec", data.get("timestamp", 0.0)))
        f_idx = int(data.get("frameIndex", data.get("frame_idx", 0)))

        return cls(
            timestamp_sec=t_sec,
            frame_index=f_idx,
            players=list(data.get("players", [])),
            shuttle=shuttle,
            extra_fields=extra,
        )
