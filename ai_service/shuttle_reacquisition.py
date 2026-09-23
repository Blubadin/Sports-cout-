"""Controlled shuttle recovery layered over the Phase 2.2 temporal provider."""
from dataclasses import dataclass
from enum import Enum
from typing import Protocol, Sequence
import math

from ai_service.shuttle_telemetry import ShuttleObservation, ShuttlePositionPx
from ai_service.shuttle_tracker import TemporalShuttleTracker


class TrackingState(str, Enum):
    TRACKING = 'TRACKING'
    WEAK = 'WEAK'
    LOST = 'LOST'
    REACQUIRING = 'REACQUIRING'


@dataclass(frozen=True)
class RecoveryConfig:
    lost_after_frames: int = 3
    confirmation_frames: int = 2
    confidence_threshold: float = 0.6
    prediction_frames: int = 2
    prediction_seconds: float = 0.1
    full_frame_after_seconds: float = 0.3
    local_radius_px: float = 160.0
    max_speed_px_sec: float = 6000.0
    position_tolerance_px: float = 40.0

    def __post_init__(self):
        for name in ('lost_after_frames', 'confirmation_frames'):
            value = getattr(self, name)
            if type(value) is not int or value < 2:
                raise ValueError(name)
        if type(self.prediction_frames) is not int or self.prediction_frames < 0:
            raise ValueError('prediction_frames')
        for name in ('prediction_seconds', 'full_frame_after_seconds', 'local_radius_px',
                     'max_speed_px_sec', 'position_tolerance_px', 'confidence_threshold'):
            value = getattr(self, name)
            if not math.isfinite(value) or value < 0:
                raise ValueError(name)
        if not 0 < self.confidence_threshold <= 1:
            raise ValueError('confidence_threshold')


@dataclass(frozen=True)
class AuxiliaryCandidate:
    """Coordinates are always native full-image pixels, including ROI searches."""
    x: float
    y: float
    confidence: float


class AuxiliaryShuttleDetector(Protocol):
    def detect(self, image, timestamp_sec: float, frame_index: int,
               region: tuple[float, float, float, float] | None) -> Sequence[AuxiliaryCandidate]:
        """None region requests full-frame search. Missing models must raise explicitly."""
        ...


class RecoveringShuttleTracker:
    """Use this pipeline to add recovery to TemporalShuttleTracker.

    Internal control state is separate from canonical observation state. Initial
    lock and recovery require consecutive spatially consistent measurements.
    Predictions never feed the measurement history or confirmation counters.
    """
    def __init__(self, temporal: TemporalShuttleTracker, auxiliary: AuxiliaryShuttleDetector | None = None,
                 config: RecoveryConfig = RecoveryConfig()):
        self.temporal, self.auxiliary, self.config = temporal, auxiliary, config
        self.state = TrackingState.LOST
        self.events: list[dict] = []
        self.reacquisition_attempts = 0
        self.auxiliary_calls = 0
        self._last = None
        self._previous = None
        self._pending = None
        self._confirmations = 0
        self._weak = 0
        self._lost_start = None
        self._last_input = None
        self._closed = False

    def _consistent(self, candidate, reference):
        dt = candidate.timestamp_sec - reference.timestamp_sec
        return dt > 0 and math.hypot(candidate.position_px.x - reference.position_px.x,
                                    candidate.position_px.y - reference.position_px.y) <= (
            self.config.position_tolerance_px + self.config.max_speed_px_sec * dt)

    def search_region(self, timestamp_sec, width, height):
        if self._last is None or timestamp_sec - self._last.timestamp_sec >= self.config.full_frame_after_seconds:
            return None
        p, r = self._last.position_px, self.config.local_radius_px
        return (max(0, p.x-r), max(0, p.y-r), min(width-1, p.x+r), min(height-1, p.y+r))

    def process_frame(self, image, timestamp_sec, frame_index):
        if self._closed:
            raise ValueError('stream has ended')
        if (type(frame_index) is not int or frame_index < 0 or not math.isfinite(timestamp_sec)
                or timestamp_sec < 0 or (self._last_input is not None and
                (frame_index <= self._last_input[0] or timestamp_sec <= self._last_input[1]))):
            raise ValueError('frames and timestamps must be strictly ordered')
        if self._last_input and frame_index != self._last_input[0] + 1:
            self._pending = None
            self._confirmations = 0
        self._last_input = (frame_index, timestamp_sec)
        raw = self.temporal.process_frame(image, timestamp_sec, frame_index)
        valid_image = getattr(image, 'ndim', 0) == 3 and image.shape[2] == 3 and min(image.shape[:2]) > 0
        height, width = image.shape[:2] if valid_image else (0, 0)
        candidate = raw if (raw.state == 'observed' and raw.confidence is not None
                            and raw.confidence >= self.config.confidence_threshold) else None
        if self.state in (TrackingState.TRACKING, TrackingState.WEAK):
            if candidate and self._consistent(candidate, self._last):
                return self._accept(candidate)
            candidate = None
            self._weak += 1
            self.state = TrackingState.WEAK
            if self._weak >= self.config.lost_after_frames:
                self.state = TrackingState.LOST
                self._lost_start = timestamp_sec
                self.events.append({'type': 'lostStart', 'timestampSec': timestamp_sec, 'frameIndex': frame_index})

        if self.state in (TrackingState.LOST, TrackingState.REACQUIRING):
            if candidate is None and self.auxiliary is not None and valid_image:
                region = self.search_region(timestamp_sec, width, height)
                self.auxiliary_calls += 1
                found = self.auxiliary.detect(image, timestamp_sec, frame_index, region)
                valid = [c for c in found if all(math.isfinite(v) for v in (c.x, c.y, c.confidence))
                         and self.config.confidence_threshold <= c.confidence <= 1
                         and 0 <= c.x < width and 0 <= c.y < height
                         and (region is None or region[0] <= c.x <= region[2] and region[1] <= c.y <= region[3])]
                if valid:
                    c = max(valid, key=lambda item: item.confidence)
                    candidate = ShuttleObservation(timestamp_sec, frame_index, 'observed',
                                                   'auxiliary_detector', ShuttlePositionPx(c.x, c.y), c.confidence)
            if candidate:
                if self._pending and candidate.frame_index == self._pending.frame_index + 1 and self._consistent(candidate, self._pending):
                    self._confirmations += 1
                else:
                    self._confirmations = 1
                    self.reacquisition_attempts += 1
                self._pending = candidate
                self.state = TrackingState.REACQUIRING
                if self._confirmations >= self.config.confirmation_frames:
                    return self._accept(candidate)
            else:
                self._pending = None
                self._confirmations = 0
                self.state = TrackingState.LOST
        return self._missing(timestamp_sec, frame_index, width, height)

    def _accept(self, candidate):
        if self._lost_start is not None:
            duration = candidate.timestamp_sec - self._lost_start
            self.events.append({'type': 'lostEnd', 'timestampSec': candidate.timestamp_sec,
                                'frameIndex': candidate.frame_index, 'lostStart': self._lost_start,
                                'lostEnd': candidate.timestamp_sec, 'lostDuration': duration,
                                'reacquisitionTime': duration, 'reacquisitionSource': candidate.source,
                                'reacquisitionAttempts': self.reacquisition_attempts})
            self._lost_start = None
        self._previous = self._last if self.state in (TrackingState.TRACKING, TrackingState.WEAK) else None
        self._last = candidate
        self._weak = self._confirmations = 0
        self._pending = None
        self.state = TrackingState.TRACKING
        return candidate

    def _missing(self, timestamp, index, width, height):
        result = ShuttleObservation(timestamp, index, 'lost' if self._last else 'unknown')
        if self._last and self._previous and self.state == TrackingState.WEAK:
            age = timestamp - self._last.timestamp_sec
            if 0 < age <= self.config.prediction_seconds and index - self._last.frame_index <= self.config.prediction_frames:
                dt = self._last.timestamp_sec - self._previous.timestamp_sec
                a, b = self._previous.position_px, self._last.position_px
                x, y = b.x + (b.x-a.x)*age/dt, b.y + (b.y-a.y)*age/dt
                if 0 <= x < width and 0 <= y < height:
                    result.state = 'predicted'
                    result.source = self._last.source
                    result.position_px = ShuttlePositionPx(x, y)
        return result

    def metrics(self):
        return {'trackingState': self.state.value, 'reacquisitionAttempts': self.reacquisition_attempts,
                'auxiliaryCalls': self.auxiliary_calls, 'lostStart': self._lost_start,
                'events': [dict(event) for event in self.events]}

    def end_stream(self):
        self._closed = True
        self._pending = None
        self.temporal.end_stream()
        return self.metrics()
