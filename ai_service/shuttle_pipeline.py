"""Production shuttlecock tracking pipeline integration (Phase 2.8).

Wires the canonical Phase-2 shuttlecock tracking architecture (TemporalShuttleTracker,
RecoveringShuttleTracker, optional derived trajectory processor) into the SportsScout
production video-analysis pipeline.

Lifecycle:
- Session-scoped instantiation via create_shuttle_pipeline(config)
- Single-pass frame analysis matching player tracking cadence and identity
- Strict canonical ShuttleObservation contract
- Truthful provenance and graceful failure handling without corrupting player tracking
"""

from __future__ import annotations

try:
    from ai_service.resource_limits import validate_processing_numbers, validate_shuttle_numbers
except ImportError:
    from resource_limits import validate_processing_numbers, validate_shuttle_numbers

from dataclasses import dataclass
from collections import deque
import os
import logging
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence, Union

import numpy as np

try:
    from ai_service.shuttle_telemetry import (
        ShuttleObservation,
        ShuttlePositionPx,
        ShuttleVelocityPx,
        ShuttleRunConfig,
    )
    from ai_service.shuttle_tracker import (
        TemporalShuttleTracker,
        ShuttleTrackerConfig,
        ShuttleTrackerProvider,
        OpenCvOnnxShuttleTrackerProvider,
        ProviderAvailability,
        ModelUnavailableError,
        RuntimeUnavailableError,
        ShuttleInferenceError,
        ShuttleTrackerError,
    )
    from ai_service.shuttle_reacquisition import (
        RecoveringShuttleTracker,
        RecoveryConfig,
        AuxiliaryShuttleDetector,
    )
    from ai_service.shuttle_trajectory import (
        ShuttleTrajectoryBuilder,
        TrajectoryConfig,
        ShuttleTrajectory,
    )
except ImportError:  # pragma: no cover - supports direct execution within ai_service
    from shuttle_telemetry import (
        ShuttleObservation,
        ShuttlePositionPx,
        ShuttleVelocityPx,
        ShuttleRunConfig,
    )
    from shuttle_tracker import (
        TemporalShuttleTracker,
        ShuttleTrackerConfig,
        ShuttleTrackerProvider,
        OpenCvOnnxShuttleTrackerProvider,
        ProviderAvailability,
        ModelUnavailableError,
        RuntimeUnavailableError,
        ShuttleInferenceError,
        ShuttleTrackerError,
    )
    from shuttle_reacquisition import (
        RecoveringShuttleTracker,
        RecoveryConfig,
        AuxiliaryShuttleDetector,
    )
    from shuttle_trajectory import (
        ShuttleTrajectoryBuilder,
        TrajectoryConfig,
        ShuttleTrajectory,
    )


# Pipeline Status Constants
STATUS_DISABLED = "DISABLED"
STATUS_AVAILABLE = "AVAILABLE"
STATUS_MODEL_UNAVAILABLE = "MODEL_UNAVAILABLE"
STATUS_RUNTIME_UNAVAILABLE = "RUNTIME_UNAVAILABLE"
STATUS_INITIALIZATION_ERROR = "INITIALIZATION_ERROR"
logger = logging.getLogger(__name__)


def _to_bool(val: Any, default: bool = False) -> bool:
    if val is None:
        return default
    if isinstance(val, bool):
        return val
    str_val = str(val).strip().lower()
    return str_val in ("true", "1", "yes", "on")


@dataclass(frozen=True)
class ShuttlePipelineConfig:
    """Production runtime configuration for the badminton shuttlecock tracking pipeline."""

    enabled: bool = False
    provider: str = "opencv_onnx"
    model_path: Optional[str] = None
    window_size: int = 3
    input_width: int = 512
    input_height: int = 288
    confidence_threshold: float = 0.5
    centroid_relative_threshold: float = 0.8
    candidate_mode: str = "centroid"
    device: str = "cpu"
    runtime: str = "opencv_dnn"
    precision: str = "fp32"
    recovery_enabled: bool = True
    auxiliary_detector: Optional[str] = None
    build_trajectory: bool = False
    trajectory_history_limit: int = 4096

    def __post_init__(self):
        validate_shuttle_numbers(self)
        if (
            not isinstance(self.trajectory_history_limit, int)
            or isinstance(self.trajectory_history_limit, bool)
            or self.trajectory_history_limit < 1
        ):
            raise ValueError("trajectory_history_limit must be a positive integer")
        if self.provider == 'rallylens_tracknet' and (
            self.window_size, self.input_width, self.input_height, self.runtime, self.precision, self.device
        ) != (9, 512, 288, 'pytorch', 'fp32', 'cpu'):
            raise ValueError('rallylens_tracknet requires 9 frames, 512x288, pytorch/fp32/cpu')

    @classmethod
    def from_dict(
        cls,
        data: Optional[Dict[str, Any]] = None,
        default_device: str = "cpu",
    ) -> ShuttlePipelineConfig:
        """Construct configuration from optional dict overrides and environment defaults."""
        raw = dict(data or {})
        validate_processing_numbers(raw)

        # 1. Environment variable defaults
        env_enabled = os.getenv("SHUTTLE_ENABLED")
        default_enabled = _to_bool(env_enabled, default=False) if env_enabled is not None else False
        default_provider = os.getenv("SHUTTLE_PROVIDER", "opencv_onnx")
        provider = str(raw.get('shuttle_provider', raw.get('shuttleProvider', default_provider)))
        is_rallylens = provider == 'rallylens_tracknet'
        default_model = os.getenv("SHUTTLE_MODEL_PATH")
        default_ws = int(os.getenv("SHUTTLE_WINDOW_SIZE", "9" if is_rallylens else "3"))
        default_w = int(os.getenv("SHUTTLE_INPUT_WIDTH", "512"))
        default_h = int(os.getenv("SHUTTLE_INPUT_HEIGHT", "288"))
        default_conf = float(os.getenv("SHUTTLE_CONFIDENCE_THRESHOLD", "0.5"))
        default_dev = os.getenv("SHUTTLE_DEVICE", 'cpu' if is_rallylens else default_device)
        default_rt = os.getenv("SHUTTLE_RUNTIME", "pytorch" if is_rallylens else "opencv_dnn")
        default_prec = os.getenv("SHUTTLE_PRECISION", "fp32")
        env_rec = os.getenv("SHUTTLE_RECOVERY_ENABLED")
        default_rec = _to_bool(env_rec, default=True) if env_rec is not None else True

        # 2. Extract from raw config (supporting both snake_case and camelCase)
        enabled_val = raw.get("shuttle_enabled", raw.get("shuttleEnabled"))
        enabled = _to_bool(enabled_val, default=default_enabled) if enabled_val is not None else default_enabled

        provider = str(raw.get("shuttle_provider", raw.get("shuttleProvider", default_provider)))
        model_path = raw.get("shuttle_model_path", raw.get("shuttleModelPath", default_model))
        model_path = str(model_path) if model_path else None

        window_size = int(raw.get("shuttle_window_size", raw.get("shuttleWindowSize", default_ws)))
        input_width = int(raw.get("shuttle_input_width", raw.get("shuttleInputWidth", default_w)))
        input_height = int(raw.get("shuttle_input_height", raw.get("shuttleInputHeight", default_h)))
        confidence_threshold = float(
            raw.get("shuttle_confidence_threshold", raw.get("shuttleConfidenceThreshold", default_conf))
        )
        centroid_rel_thresh = float(
            raw.get("shuttle_centroid_relative_threshold", raw.get("shuttleCentroidRelativeThreshold", 0.8))
        )
        candidate_mode = str(raw.get("shuttle_candidate_mode", raw.get("shuttleCandidateMode", "centroid")))

        device = str(raw.get("shuttle_device", raw.get("shuttleDevice", default_dev if is_rallylens else raw.get("device", default_dev))))
        runtime = str(raw.get("shuttle_runtime", raw.get("shuttleRuntime", default_rt)))
        precision = str(raw.get("shuttle_precision", raw.get("shuttlePrecision", default_prec)))

        recovery_val = raw.get("shuttle_recovery_enabled", raw.get("shuttleRecoveryEnabled"))
        recovery_enabled = (
            _to_bool(recovery_val, default=default_rec) if recovery_val is not None else default_rec
        )

        aux_detector = raw.get("shuttle_auxiliary_detector", raw.get("shuttleAuxiliaryDetector"))
        build_trajectory = _to_bool(
            raw.get("shuttle_build_trajectory", raw.get("shuttleBuildTrajectory", False))
        )
        trajectory_history_limit = int(
            raw.get(
                "shuttle_trajectory_history_limit",
                raw.get("shuttleTrajectoryHistoryLimit", 4096),
            )
        )

        return cls(
            enabled=enabled,
            provider=provider,
            model_path=model_path,
            window_size=window_size,
            input_width=input_width,
            input_height=input_height,
            confidence_threshold=confidence_threshold,
            centroid_relative_threshold=centroid_rel_thresh,
            candidate_mode=candidate_mode,
            device=device,
            runtime=runtime,
            precision=precision,
            recovery_enabled=recovery_enabled,
            auxiliary_detector=str(aux_detector) if aux_detector else None,
            build_trajectory=build_trajectory,
            trajectory_history_limit=trajectory_history_limit,
        )


class ProductionShuttlePipeline:
    """Session-scoped production shuttlecock tracking pipeline.

    Maintains tracker state across consecutive frames of a single analysis session,
    enforcing honest telemetry states, zero frame duplication outside bounded windows,
    and safe isolation from player tracking.
    """

    def __init__(
        self,
        config: ShuttlePipelineConfig,
        provider: Optional[ShuttleTrackerProvider] = None,
        auxiliary: Optional[AuxiliaryShuttleDetector] = None,
        status: str = STATUS_AVAILABLE,
        status_reason: str = "Ready",
    ) -> None:
        self.config = config
        self.status = status
        self.status_reason = status_reason
        self.failure_reason: Optional[str] = None if status == STATUS_AVAILABLE else status_reason
        self.last_failure: Optional[str] = None
        self.provider = provider
        self.auxiliary = auxiliary

        self.temporal_tracker: Optional[TemporalShuttleTracker] = None
        self.recovery_tracker: Optional[RecoveringShuttleTracker] = None
        self.trajectory_builder: Optional[ShuttleTrajectoryBuilder] = None
        self._trajectory_working_history: deque[ShuttleObservation] | None = None
        self._derived_trajectory: Optional[ShuttleTrajectory] = None
        self._stream_ended: bool = False
        self._observation_counts: Optional[Dict[str, int]] = None

        if not self.config.enabled:
            self.status = STATUS_DISABLED
            self.status_reason = "Shuttle tracking disabled by configuration"
            return

        if self.status != STATUS_AVAILABLE or self.provider is None:
            return

        # Instantiate temporal tracker
        tracker_cfg = ShuttleTrackerConfig(
            window_size=config.window_size,
            input_width=config.input_width,
            input_height=config.input_height,
            confidence_threshold=config.confidence_threshold,
            centroid_relative_threshold=config.centroid_relative_threshold,
            candidate_mode=config.candidate_mode,
            device=config.device,
            runtime=config.runtime,
            precision=config.precision,
        )
        self.temporal_tracker = TemporalShuttleTracker(self.provider, tracker_cfg)
        self._observation_counts = {
            "observed": 0,
            "predicted": 0,
            "lost": 0,
            "unknown": 0,
        }

        if self.config.recovery_enabled:
            self.recovery_tracker = RecoveringShuttleTracker(
                self.temporal_tracker,
                auxiliary=self.auxiliary,
                config=RecoveryConfig(),
            )

        if self.config.build_trajectory:
            trajectory_config = TrajectoryConfig(max_runtime_history_points=self.config.trajectory_history_limit)
            self.trajectory_builder = ShuttleTrajectoryBuilder(trajectory_config)
            self._trajectory_working_history = deque(maxlen=trajectory_config.max_runtime_history_points)

    @property
    def is_active(self) -> bool:
        """True if shuttle tracking is requested, enabled, and operational."""
        return self.config.enabled and self.status == STATUS_AVAILABLE

    def process_frame(
        self,
        image: np.ndarray,
        timestamp_sec: float,
        frame_index: int,
    ) -> Optional[ShuttleObservation]:
        """Process a single analyzed video frame and emit canonical ShuttleObservation.

        Returns None if shuttle tracking is disabled or permanently unavailable,
        ensuring frame.shuttle = null without fabricating missing coordinates.
        """
        if not self.config.enabled:
            return None

        if self.status != STATUS_AVAILABLE:
            return None

        if self._stream_ended:
            raise RuntimeError("Cannot process frames after end_stream() has been called")

        active_tracker: Union[RecoveringShuttleTracker, TemporalShuttleTracker, None] = (
            self.recovery_tracker if self.recovery_tracker is not None else self.temporal_tracker
        )
        if active_tracker is None:
            return None

        try:
            observation = active_tracker.process_frame(image, timestamp_sec, frame_index)
            self.last_failure = None
            return self._record_observation(observation)
        except ModelUnavailableError:
            logger.error('Shuttle model unavailable')
            self.status = STATUS_MODEL_UNAVAILABLE
            self.status_reason = 'Shuttle model unavailable; see local service logs'
            self.failure_reason = self.status_reason
            self.last_failure = "MODEL UNAVAILABLE"
            return None
        except RuntimeUnavailableError:
            logger.error('Shuttle runtime unavailable')
            self.status = STATUS_RUNTIME_UNAVAILABLE
            self.status_reason = 'Shuttle runtime unavailable; see local service logs'
            self.failure_reason = self.status_reason
            self.last_failure = "RUNTIME UNAVAILABLE"
            return None
        except ShuttleInferenceError:
            logger.error('Shuttle inference failed')
            self.last_failure = 'Shuttle inference failed; see local service logs'
            # Recoverable inference failure: emit canonical lost observation
            return self._record_observation(
                ShuttleObservation(
                    timestamp_sec=float(timestamp_sec),
                    frame_index=int(frame_index),
                    state="lost",
                    source="temporal_tracker",
                    position_px=None,
                )
            )
        except Exception as err:
            logger.error('Shuttle processing failed (%s)', type(err).__name__)
            # Check if this error was caused by missing model
            if "MODEL UNAVAILABLE" in str(err) or "not found" in str(err).lower():
                self.status = STATUS_MODEL_UNAVAILABLE
                self.status_reason = 'Shuttle model unavailable; see local service logs'
                self.failure_reason = self.status_reason
                self.last_failure = "MODEL UNAVAILABLE"
                return None
            self.last_failure = 'Shuttle processing failed; see local service logs'
            raise

    def _record_observation(self, observation: ShuttleObservation) -> ShuttleObservation:
        if self._observation_counts is not None:
            self._observation_counts[observation.state] += 1
        if self.trajectory_builder is not None:
            assert self._trajectory_working_history is not None
            self._trajectory_working_history.append(observation)
        return observation

    def end_stream(self) -> Dict[str, Any]:
        """Finalize the video session stream and release frame window buffers."""
        self._stream_ended = True
        metrics: Dict[str, Any] = {
            "status": self.status,
            "failureReason": self.failure_reason,
        }

        if self.recovery_tracker is not None:
            rec_metrics = self.recovery_tracker.end_stream()
            metrics["recovery"] = rec_metrics
        elif self.temporal_tracker is not None:
            temp_metrics = self.temporal_tracker.end_stream()
            metrics["temporal"] = {
                "framesReceived": temp_metrics.frames_received,
                "validFrames": temp_metrics.valid_frames,
                "invalidFrames": temp_metrics.invalid_frames,
                "inferenceCalls": temp_metrics.inference_calls,
                "totalInferenceMs": temp_metrics.total_inference_ms,
                "meanInferenceMs": temp_metrics.mean_inference_ms,
                "analysisFps": temp_metrics.analysis_fps,
            }

        if self.trajectory_builder is not None and self._trajectory_working_history:
            try:
                self._derived_trajectory = self.trajectory_builder.build(list(self._trajectory_working_history))
                metrics["derivedTrajectoryPoints"] = len(self._derived_trajectory.points)
            except Exception as err:
                metrics["trajectoryBuildError"] = str(err)

        return metrics

    def get_derived_trajectory(self) -> Optional[ShuttleTrajectory]:
        """Return derived trajectory points, kept strictly separate from raw observations."""
        return self._derived_trajectory

    def get_trajectory_working_history_size(self) -> int:
        """Return the bounded runtime trajectory buffer size for diagnostics/tests."""
        return len(self._trajectory_working_history) if self._trajectory_working_history is not None else 0

    def get_provenance(self) -> Dict[str, Any]:
        """Expose truthful, sanitized provenance information without machine-sensitive paths."""
        model_name: Optional[str] = None
        if self.config.model_path:
            model_name = Path(self.config.model_path).name

        execution = self.provider.get_provenance() if self.provider is not None and hasattr(self.provider, 'get_provenance') else {}
        metrics = self.temporal_tracker.metrics() if self.temporal_tracker else None
        counts = self._observation_counts
        last_failure = self.last_failure if self.last_failure is not None else (
            metrics.last_failure if metrics is not None else None
        )
        return {
            "enabled": self.config.enabled,
            "requested": self.config.enabled,
            "active": self.is_active,
            "status": self.status,
            "provider": self.config.provider,
            "model": model_name,
            "runtime": self.config.runtime,
            "precision": self.config.precision,
            "device": self.config.device,
            "windowSize": self.config.window_size,
            "confidenceThreshold": self.config.confidence_threshold,
            "recoveryEnabled": self.config.recovery_enabled,
            "auxiliaryDetectorAvailable": (
                self.auxiliary is not None
                if self.config.recovery_enabled
                else False
            ),
            "failureReason": self.failure_reason,
            "lastFailure": last_failure,
            'inputWidth': self.config.input_width,
            'inputHeight': self.config.input_height,
            'requiredFrameStride': 1 if self.config.provider == 'rallylens_tracknet' else None,
            'framesReceived': metrics.frames_received if metrics is not None else None,
            'validFrames': metrics.valid_frames if metrics is not None else None,
            'inferenceCalls': metrics.inference_calls if metrics is not None else None,
            'meanInferenceMs': metrics.mean_inference_ms if metrics is not None else None,
            'observedCount': counts['observed'] if counts is not None else None,
            'predictedCount': counts['predicted'] if counts is not None else None,
            'lostCount': counts['lost'] if counts is not None else None,
            'unknownCount': counts['unknown'] if counts is not None else None,
            'candidateExtractionCalls': metrics.candidate_extraction_calls if metrics is not None else None,
            **execution,
        }


def create_shuttle_pipeline(
    config: Optional[Union[ShuttlePipelineConfig, Dict[str, Any]]] = None,
    *,
    custom_provider: Optional[ShuttleTrackerProvider] = None,
    custom_auxiliary: Optional[AuxiliaryShuttleDetector] = None,
    default_device: str = "cpu",
) -> ProductionShuttlePipeline:
    """Factory creating a production shuttle tracking pipeline with truthful status reporting."""
    if isinstance(config, ShuttlePipelineConfig):
        cfg = config
    else:
        cfg = ShuttlePipelineConfig.from_dict(config, default_device=default_device)

    if not cfg.enabled:
        return ProductionShuttlePipeline(
            cfg,
            status=STATUS_DISABLED,
            status_reason="Shuttle tracking disabled by configuration",
        )

    # 1. Check custom provider injection (used for deterministic testing and mocks)
    if custom_provider is not None:
        avail = custom_provider.availability()
        if not avail.available:
            status = (
                STATUS_MODEL_UNAVAILABLE
                if "MODEL" in avail.status
                else STATUS_RUNTIME_UNAVAILABLE
            )
            return ProductionShuttlePipeline(
                cfg,
                provider=custom_provider,
                auxiliary=custom_auxiliary,
                status=status,
                status_reason=avail.reason,
            )
        return ProductionShuttlePipeline(
            cfg,
            provider=custom_provider,
            auxiliary=custom_auxiliary,
            status=STATUS_AVAILABLE,
            status_reason=avail.reason,
        )

    if cfg.provider == 'rallylens_tracknet':
        if not cfg.model_path or not Path(cfg.model_path).is_file():
            return ProductionShuttlePipeline(cfg, status=STATUS_MODEL_UNAVAILABLE,
                                             status_reason='Verified local RallyLens checkpoint not found')
        try:
            try:
                from ai_service.rallylens_adapter import RallyLensTemporalModelAdapter
            except ImportError:
                from rallylens_adapter import RallyLensTemporalModelAdapter
            provider = RallyLensTemporalModelAdapter(cfg.model_path)
            provider.availability()
            return ProductionShuttlePipeline(cfg, provider=provider)
        except Exception as error:
            logger.error('Verified RallyLens model initialization failed (%s)', type(error).__name__)
            return ProductionShuttlePipeline(cfg, status=STATUS_INITIALIZATION_ERROR,
                                             status_reason='RallyLens checkpoint failed verification/loading; see local service logs')

    # 2. OpenCv ONNX provider
    if cfg.provider == "opencv_onnx":
        if not cfg.model_path:
            return ProductionShuttlePipeline(
                cfg,
                status=STATUS_MODEL_UNAVAILABLE,
                status_reason="No local ONNX model artifact path configured",
            )

        model_file = Path(cfg.model_path)
        if not model_file.is_file():
            return ProductionShuttlePipeline(
                cfg,
                status=STATUS_MODEL_UNAVAILABLE,
                status_reason=f"Configured model artifact not found: {model_file.name}",
            )

        try:
            provider = OpenCvOnnxShuttleTrackerProvider(
                model_path=str(model_file),
                input_width=cfg.input_width,
                input_height=cfg.input_height,
                device=cfg.device,
                precision=cfg.precision,
            )
            avail = provider.availability()
            if not avail.available:
                status = (
                    STATUS_MODEL_UNAVAILABLE
                    if "MODEL" in avail.status
                    else STATUS_RUNTIME_UNAVAILABLE
                )
                return ProductionShuttlePipeline(
                    cfg,
                    provider=provider,
                    auxiliary=custom_auxiliary,
                    status=status,
                    status_reason=avail.reason,
                )
            return ProductionShuttlePipeline(
                cfg,
                provider=provider,
                auxiliary=custom_auxiliary,
                status=STATUS_AVAILABLE,
                status_reason=avail.reason,
            )
        except Exception as error:
            logger.error('Shuttle provider initialization failed (%s)', type(error).__name__)
            return ProductionShuttlePipeline(
                cfg,
                status=STATUS_INITIALIZATION_ERROR,
                status_reason='Failed to initialize OpenCV ONNX shuttle provider; see local service logs',
            )

    return ProductionShuttlePipeline(
        cfg,
        status=STATUS_INITIALIZATION_ERROR,
        status_reason=f"Unsupported shuttle tracking provider: {cfg.provider}",
    )
