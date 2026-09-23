"""Phase 2.2 temporal shuttlecock tracking baseline.

This module is deliberately independent from the player tracking engine. It
maintains an ordered rolling frame window, delegates temporal inference to a
provider, validates the returned probability map, and emits the Phase 2.1
canonical ``ShuttleObservation`` in native image coordinates.

No model is bundled or downloaded. ``OpenCvOnnxShuttleTrackerProvider`` only
loads an explicitly configured local ONNX artifact and reports
``MODEL UNAVAILABLE`` when that artifact is absent.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from collections import deque
from dataclasses import dataclass
import math
from pathlib import Path
import time
from typing import Sequence

import numpy as np

try:
    from ai_service.shuttle_telemetry import ShuttleObservation, ShuttlePositionPx
except ImportError:  # pragma: no cover - supports direct ai_service script execution
    from shuttle_telemetry import ShuttleObservation, ShuttlePositionPx


class ShuttleTrackerError(RuntimeError):
    """Base error for the temporal shuttle tracker."""


class ModelUnavailableError(ShuttleTrackerError):
    """Raised when the explicitly configured local model does not exist."""


class RuntimeUnavailableError(ShuttleTrackerError):
    """Raised when the configured inference runtime cannot be used."""


class ShuttleInferenceError(ShuttleTrackerError):
    """Raised when a provider fails during model execution."""


@dataclass(frozen=True)
class ProviderAvailability:
    available: bool
    status: str
    reason: str


@dataclass(frozen=True)
class TemporalFrame:
    """One source frame plus its presentation identity."""

    image: np.ndarray
    timestamp_sec: float
    frame_index: int


@dataclass(frozen=True)
class TemporalModelOutput:
    """Vendor-neutral temporal model result.

    The probability map may be at model resolution. Candidate coordinates are
    normalized back to the latest source frame by ``TemporalShuttleTracker``.
    """

    probability_map: np.ndarray | None


@dataclass(frozen=True)
class ShuttleCandidate:
    x_heatmap: float
    y_heatmap: float
    confidence: float


@dataclass(frozen=True)
class ShuttleTrackerConfig:
    window_size: int = 3
    input_width: int = 512
    input_height: int = 288
    confidence_threshold: float = 0.5
    centroid_relative_threshold: float = 0.8
    candidate_mode: str = "centroid"
    device: str = "cpu"
    runtime: str = "opencv_dnn"
    precision: str = "fp32"

    def __post_init__(self) -> None:
        if not isinstance(self.window_size, int) or self.window_size < 2:
            raise ValueError("window_size must be an integer >= 2")
        if not isinstance(self.input_width, int) or self.input_width <= 0:
            raise ValueError("input_width must be a positive integer")
        if not isinstance(self.input_height, int) or self.input_height <= 0:
            raise ValueError("input_height must be a positive integer")
        if not math.isfinite(self.confidence_threshold) or not 0.0 <= self.confidence_threshold <= 1.0:
            raise ValueError("confidence_threshold must be finite and in [0, 1]")
        if not math.isfinite(self.centroid_relative_threshold) or not 0.0 < self.centroid_relative_threshold <= 1.0:
            raise ValueError("centroid_relative_threshold must be finite and in (0, 1]")
        if self.candidate_mode not in {"centroid", "peak"}:
            raise ValueError("candidate_mode must be 'centroid' or 'peak'")


@dataclass(frozen=True)
class ShuttleTrackerMetrics:
    frames_received: int
    valid_frames: int
    invalid_frames: int
    inference_calls: int
    total_inference_ms: float
    mean_inference_ms: float | None
    analysis_fps: float | None
    window_size: int
    input_resolution: tuple[int, int]
    device: str
    runtime: str
    precision: str
    last_failure: str | None
    candidate_extraction_calls: int = 0


class ShuttleTrackerProvider(ABC):
    """Provider seam for temporal shuttle models.

    Providers receive frames in chronological order from oldest to newest and
    must not invent observations when inference cannot run.
    """

    def availability(self) -> ProviderAvailability:
        return ProviderAvailability(True, "AVAILABLE", "Provider is ready")

    def scale_coordinate(self, value: float, heatmap_extent: int, source_extent: int) -> float:
        return _scale_coordinate(value, heatmap_extent, source_extent)

    @abstractmethod
    def infer(self, frames: Sequence[TemporalFrame]) -> TemporalModelOutput:
        raise NotImplementedError


class OpenCvOnnxShuttleTrackerProvider(ShuttleTrackerProvider):
    """Local-only ONNX temporal provider using OpenCV DNN.

    Frames are resized and concatenated chronologically on the channel axis,
    producing input shape ``[1, window_size * 3, H, W]``. This explicit layout
    supports common TrackNet-style exported models without embedding any
    third-party implementation or weights.
    """

    def __init__(
        self,
        model_path: str | Path,
        *,
        input_width: int = 512,
        input_height: int = 288,
        scale: float = 1.0 / 255.0,
        swap_rb: bool = True,
        device: str = "cpu",
        precision: str = "fp32",
    ) -> None:
        self.model_path = Path(model_path)
        self.input_width = input_width
        self.input_height = input_height
        self.scale = scale
        self.swap_rb = swap_rb
        self.device = device
        self.precision = precision
        self._network = None

    def availability(self) -> ProviderAvailability:
        if not self.model_path.is_file():
            return ProviderAvailability(
                False,
                "MODEL UNAVAILABLE",
                f"local ONNX artifact not found: {self.model_path}",
            )
        if self.device != "cpu":
            return ProviderAvailability(
                False,
                "RUNTIME UNAVAILABLE",
                f"OpenCV DNN temporal baseline currently supports device='cpu', got '{self.device}'",
            )
        if self.precision != "fp32":
            return ProviderAvailability(
                False,
                "RUNTIME UNAVAILABLE",
                f"OpenCV DNN temporal baseline currently supports precision='fp32', got '{self.precision}'",
            )
        try:
            import cv2  # noqa: F401
        except Exception as error:
            return ProviderAvailability(False, "RUNTIME UNAVAILABLE", f"OpenCV import failed: {error}")
        return ProviderAvailability(True, "AVAILABLE", f"local ONNX artifact: {self.model_path}")

    def _load_network(self):  # type: ignore[no-untyped-def]
        if self._network is not None:
            return self._network
        availability = self.availability()
        if not availability.available:
            _raise_availability_error(availability)
        try:
            import cv2

            self._network = cv2.dnn.readNetFromONNX(str(self.model_path))
            self._network.setPreferableBackend(cv2.dnn.DNN_BACKEND_OPENCV)
            self._network.setPreferableTarget(cv2.dnn.DNN_TARGET_CPU)
        except Exception as error:
            raise RuntimeUnavailableError(f"RUNTIME UNAVAILABLE: failed to load local ONNX model: {error}") from error
        return self._network

    def infer(self, frames: Sequence[TemporalFrame]) -> TemporalModelOutput:
        if not frames:
            raise ShuttleInferenceError("Temporal provider received an empty frame window")
        network = self._load_network()
        try:
            import cv2

            channels = []
            for temporal_frame in frames:
                resized = cv2.resize(
                    temporal_frame.image,
                    (self.input_width, self.input_height),
                    interpolation=cv2.INTER_LINEAR,
                )
                if self.swap_rb:
                    resized = cv2.cvtColor(resized, cv2.COLOR_BGR2RGB)
                chw = resized.astype(np.float32).transpose(2, 0, 1) * self.scale
                channels.append(chw)
            tensor = np.concatenate(channels, axis=0)[np.newaxis, ...]
            network.setInput(tensor)
            output = network.forward()
            return TemporalModelOutput(probability_map=np.asarray(output))
        except ShuttleTrackerError:
            raise
        except Exception as error:
            raise ShuttleInferenceError(f"Temporal ONNX inference failed: {error}") from error


def _raise_availability_error(availability: ProviderAvailability) -> None:
    message = f"{availability.status}: {availability.reason}"
    if availability.status == "MODEL UNAVAILABLE":
        raise ModelUnavailableError(message)
    raise RuntimeUnavailableError(message)


def _validated_heatmap(probability_map: np.ndarray | None) -> np.ndarray | None:
    if probability_map is None:
        return None
    heatmap = np.asarray(probability_map)
    if heatmap.size == 0 or not np.issubdtype(heatmap.dtype, np.number):
        raise ValueError("empty or non-numeric probability map")
    if not np.all(np.isfinite(heatmap)):
        raise ValueError("probability map contains NaN or infinite values")
    if float(np.min(heatmap)) < 0.0 or float(np.max(heatmap)) > 1.0:
        raise ValueError("probability map values must be in [0, 1]")
    if heatmap.ndim == 2:
        normalized = heatmap
    else:
        normalized = np.squeeze(heatmap)
        if normalized.ndim == 0 and heatmap.size == 1:
            normalized = normalized.reshape(1, 1)
    if normalized.ndim != 2 or normalized.shape[0] < 1 or normalized.shape[1] < 1:
        raise ValueError(f"probability map must resolve to HxW, got shape {heatmap.shape}")
    return normalized.astype(np.float32, copy=False)


def extract_shuttle_candidate(
    probability_map: np.ndarray | None,
    *,
    confidence_threshold: float,
    mode: str = "centroid",
    centroid_relative_threshold: float = 0.8,
) -> ShuttleCandidate | None:
    """Extract one thresholded candidate from a finite 2D probability map."""

    heatmap = _validated_heatmap(probability_map)
    if heatmap is None:
        return None
    peak_flat_index = int(np.argmax(heatmap))
    peak_y, peak_x = np.unravel_index(peak_flat_index, heatmap.shape)
    confidence = float(heatmap[peak_y, peak_x])
    if confidence < confidence_threshold:
        return None
    if mode == "peak":
        return ShuttleCandidate(float(peak_x), float(peak_y), confidence)

    component_threshold = max(confidence_threshold, confidence * centroid_relative_threshold)
    active = heatmap >= component_threshold
    component = _connected_component(active, peak_y, peak_x)
    if not component:
        return None
    weights = np.asarray([float(heatmap[y, x]) for y, x in component], dtype=np.float64)
    if not np.all(np.isfinite(weights)) or float(weights.sum()) <= 0.0:
        return None
    xs = np.asarray([x for _, x in component], dtype=np.float64)
    ys = np.asarray([y for y, _ in component], dtype=np.float64)
    return ShuttleCandidate(
        x_heatmap=float(np.average(xs, weights=weights)),
        y_heatmap=float(np.average(ys, weights=weights)),
        confidence=confidence,
    )


def _connected_component(mask: np.ndarray, start_y: int, start_x: int) -> list[tuple[int, int]]:
    if not bool(mask[start_y, start_x]):
        return []
    height, width = mask.shape
    pending = [(start_y, start_x)]
    visited = {(start_y, start_x)}
    component: list[tuple[int, int]] = []
    while pending:
        y, x = pending.pop()
        component.append((y, x))
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                if dx == 0 and dy == 0:
                    continue
                ny, nx = y + dy, x + dx
                if 0 <= ny < height and 0 <= nx < width and bool(mask[ny, nx]):
                    point = (ny, nx)
                    if point not in visited:
                        visited.add(point)
                        pending.append(point)
    return component


class TemporalShuttleTracker:
    """Stateful rolling-window tracker emitting canonical observations."""

    def __init__(self, provider: ShuttleTrackerProvider, config: ShuttleTrackerConfig) -> None:
        self.provider = provider
        self.config = config
        self._frames: deque[TemporalFrame] = deque(maxlen=config.window_size)
        self._has_observed = False
        self._last_frame_index: int | None = None
        self._last_timestamp_sec: float | None = None
        self._frames_received = 0
        self._valid_frames = 0
        self._invalid_frames = 0
        self._inference_calls = 0
        self._candidate_extraction_calls = 0
        self._inference_seconds = 0.0
        self._processing_seconds = 0.0
        self._last_failure: str | None = None

    @property
    def buffered_frame_count(self) -> int:
        return len(self._frames)

    def process_frame(
        self,
        image: np.ndarray,
        timestamp_sec: float,
        frame_index: int,
    ) -> ShuttleObservation:
        started = time.perf_counter()
        self._frames_received += 1

        def finish(observation: ShuttleObservation) -> ShuttleObservation:
            self._processing_seconds += time.perf_counter() - started
            return observation

        if not self._valid_input(image, timestamp_sec, frame_index):
            self._invalid_frames += 1
            self._last_failure = "BAD FRAME"
            # A missing frame breaks temporal continuity. Never bridge the gap
            # as though the provider had received a contiguous frame sequence.
            self._frames.clear()
            return finish(self._missing_observation(timestamp_sec, frame_index))

        if self._last_frame_index is not None and frame_index > self._last_frame_index + 1:
            # A caller may omit a frame entirely rather than submit a bad image.
            # Restart the window so the temporal model never sees a hidden gap.
            self._frames.clear()

        current = TemporalFrame(image=image.copy(), timestamp_sec=float(timestamp_sec), frame_index=frame_index)
        self._frames.append(current)
        self._valid_frames += 1
        self._last_frame_index = frame_index
        self._last_timestamp_sec = float(timestamp_sec)

        if len(self._frames) < self.config.window_size:
            self._last_failure = "WINDOW INITIALIZING"
            return finish(self._missing_observation(timestamp_sec, frame_index, force_unknown=True))

        availability = self.provider.availability()
        if not availability.available:
            self._last_failure = availability.status
            self._processing_seconds += time.perf_counter() - started
            _raise_availability_error(availability)

        inference_started = time.perf_counter()
        self._inference_calls += 1
        try:
            output = self.provider.infer(tuple(self._frames))
        except Exception:
            self._inference_seconds += time.perf_counter() - inference_started
            self._processing_seconds += time.perf_counter() - started
            raise
        self._inference_seconds += time.perf_counter() - inference_started

        try:
            self._candidate_extraction_calls += 1
            candidate = extract_shuttle_candidate(
                output.probability_map,
                confidence_threshold=self.config.confidence_threshold,
                mode=self.config.candidate_mode,
                centroid_relative_threshold=self.config.centroid_relative_threshold,
            )
        except (TypeError, ValueError):
            self._last_failure = "INVALID MODEL OUTPUT"
            return finish(self._missing_observation(timestamp_sec, frame_index))

        if candidate is None:
            self._last_failure = "NO SHUTTLE CANDIDATE"
            return finish(self._missing_observation(timestamp_sec, frame_index))

        source_height, source_width = image.shape[:2]
        heatmap = _validated_heatmap(output.probability_map)
        assert heatmap is not None
        x_px = self.provider.scale_coordinate(candidate.x_heatmap, heatmap.shape[1], source_width)
        y_px = self.provider.scale_coordinate(candidate.y_heatmap, heatmap.shape[0], source_height)
        observation = ShuttleObservation(
            timestamp_sec=float(timestamp_sec),
            frame_index=frame_index,
            state="observed",
            source="temporal_tracker",
            position_px=ShuttlePositionPx(x=x_px, y=y_px),
            confidence=candidate.confidence,
            trajectory_id=None,
        )
        self._has_observed = True
        self._last_failure = None
        return finish(observation)

    def end_stream(self) -> ShuttleTrackerMetrics:
        """Finish a stream without padding or fabricating trailing observations."""

        self._frames.clear()
        return self.metrics()

    def metrics(self) -> ShuttleTrackerMetrics:
        mean_ms = (
            self._inference_seconds * 1000.0 / self._inference_calls
            if self._inference_calls
            else None
        )
        analysis_fps = (
            self._frames_received / self._processing_seconds
            if self._processing_seconds > 0.0
            else None
        )
        return ShuttleTrackerMetrics(
            frames_received=self._frames_received,
            valid_frames=self._valid_frames,
            invalid_frames=self._invalid_frames,
            inference_calls=self._inference_calls,
            total_inference_ms=self._inference_seconds * 1000.0,
            mean_inference_ms=mean_ms,
            analysis_fps=analysis_fps,
            window_size=self.config.window_size,
            input_resolution=(self.config.input_width, self.config.input_height),
            device=self.config.device,
            runtime=self.config.runtime,
            precision=self.config.precision,
            last_failure=self._last_failure,
            candidate_extraction_calls=self._candidate_extraction_calls,
        )

    def _valid_input(self, image: np.ndarray, timestamp_sec: float, frame_index: int) -> bool:
        if not isinstance(image, np.ndarray) or image.ndim != 3:
            return False
        if image.shape[0] <= 0 or image.shape[1] <= 0 or image.shape[2] != 3:
            return False
        if image.dtype != np.uint8:
            return False
        if not isinstance(frame_index, int) or isinstance(frame_index, bool) or frame_index < 0:
            return False
        if not isinstance(timestamp_sec, (int, float)) or not math.isfinite(float(timestamp_sec)) or timestamp_sec < 0:
            return False
        if self._last_frame_index is not None and frame_index <= self._last_frame_index:
            return False
        if self._last_timestamp_sec is not None and timestamp_sec < self._last_timestamp_sec:
            return False
        return True

    def _missing_observation(
        self,
        timestamp_sec: float,
        frame_index: int,
        *,
        force_unknown: bool = False,
    ) -> ShuttleObservation:
        safe_timestamp = float(timestamp_sec) if isinstance(timestamp_sec, (int, float)) and math.isfinite(float(timestamp_sec)) and timestamp_sec >= 0 else 0.0
        safe_frame_index = frame_index if isinstance(frame_index, int) and not isinstance(frame_index, bool) and frame_index >= 0 else 0
        return ShuttleObservation(
            timestamp_sec=safe_timestamp,
            frame_index=safe_frame_index,
            state="unknown" if force_unknown or not self._has_observed else "lost",
            source="temporal_tracker",
            position_px=None,
            confidence=None,
            trajectory_id=None,
        )


def _scale_coordinate(value: float, heatmap_extent: int, source_extent: int) -> float:
    if heatmap_extent <= 1 or source_extent <= 1:
        return 0.0
    normalized = min(1.0, max(0.0, value / float(heatmap_extent - 1)))
    return normalized * float(source_extent - 1)
