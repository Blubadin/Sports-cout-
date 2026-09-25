"""
engine_config.py — Vision Tracking Engine Configuration Seam

Defines configurable parameters for:
- Person detector model and family
- Athlete pose model and family
- Tracker algorithm and configuration
- Input resolution
- Inference runtime provider (PyTorch, future ONNX, TensorRT)
- Precision (fp32, fp16, int8)

Rules:
- Baseline is strictly YOLOv8n + YOLOv8n-pose + ByteTrack @ 640px PyTorch FP32.
- No silent fallbacks: Invalid configs or missing models must fail explicitly.
- Immutable defaults preserve backwards compatibility.
"""

from __future__ import annotations
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

VALID_RUNTIMES = {"pytorch", "tensorrt"}
VALID_PRECISIONS = {"fp32", "fp16"}
VALID_POSE_ARCHITECTURES = {"roi_pose", "full_frame_pose"}
KNOWN_TRACKERS = {
    "bytetrack": "bytetrack.yaml",
    "botsort": "botsort.yaml",
    "botsort_reid": "botsort.yaml",
}


class InvalidEngineConfigError(ValueError):
    """Raised when tracking engine configuration contains invalid or unsupported options."""
    pass


class ModelNotFoundError(FileNotFoundError):
    """Raised when a requested model file cannot be found or loaded."""
    pass


class RuntimeUnavailableError(RuntimeError):
    """Raised when a requested inference runtime (e.g. TensorRT) is unavailable on the host."""
    pass


class CUDAIncompatibilityError(RuntimeUnavailableError):
    """Raised when CUDA is not available or incompatible for TensorRT execution."""
    pass


class TensorRTExportError(RuntimeError):
    """Raised when export of a model to TensorRT engine fails."""
    pass


class EngineLoadError(RuntimeError):
    """Raised when loading a TensorRT engine artifact fails."""
    pass


class RuntimeInferenceError(RuntimeError):
    """Raised when inference on a runtime engine fails."""
    pass


@dataclass
class TrackingEngineConfig:
    """
    Vendor-neutral configuration for the SportsScout Tracking vision pipeline.
    Decouples model architectures, tracker configurations, and runtime engines
    from the domain tracking logic.
    """
    detector_model: str = "yolov8n.pt"
    detector_family: str = "yolov8"
    pose_model: str | None = "yolov8n-pose.pt"
    pose_family: str = "yolov8"
    pose_architecture: str = "roi_pose"
    tracker_name: str = "bytetrack"
    tracker_config_path: str | None = None
    tracker_config: str | None = None
    reid_enabled: bool = False
    reid_model: str | None = None
    runtime: str = "pytorch"
    precision: str = "fp32"
    model_artifact_reference: str | None = None
    detector_input_size: int = 640
    confidence_threshold: float = 0.35
    frame_stride: int = 1
    pose_stride: int = 1
    use_court_roi: bool = False
    court_roi_margin_px: int = 60
    court_roi_margin_m: float = 0.5
    auto_court_calibration_enabled: bool = False
    device: str = "auto"
    extra_options: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        """Serialize configuration to a camelCase dictionary."""
        return {
            "detectorModel": self.detector_model,
            "detectorFamily": self.detector_family,
            "poseModel": self.pose_model,
            "poseFamily": self.pose_family,
            "poseArchitecture": self.pose_architecture,
            "trackerName": self.tracker_name,
            "trackerConfigPath": self.tracker_config_path,
            "trackerConfig": self.tracker_config,
            "reidEnabled": self.reid_enabled,
            "reidModel": self.reid_model,
            "runtime": self.runtime,
            "precision": self.precision,
            "modelArtifactReference": self.model_artifact_reference,
            "detectorInputSize": self.detector_input_size,
            "confidenceThreshold": self.confidence_threshold,
            "frameStride": self.frame_stride,
            "poseStride": self.pose_stride,
            "useCourtRoi": self.use_court_roi,
            "courtRoiMarginPx": self.court_roi_margin_px,
            "courtRoiMarginM": self.court_roi_margin_m,
            "autoCourtCalibrationEnabled": self.auto_court_calibration_enabled,
            "device": self.device,
            **self.extra_options,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> TrackingEngineConfig:
        """Construct configuration from a camelCase or snake_case dictionary."""
        known_keys = {
            "detectorModel", "detector_model",
            "detectorFamily", "detector_family",
            "poseModel", "pose_model",
            "poseFamily", "pose_family",
            "poseArchitecture", "pose_architecture",
            "trackerName", "tracker_name",
            "trackerConfigPath", "tracker_config_path",
            "trackerConfig", "tracker_config",
            "reidEnabled", "reid_enabled",
            "reidModel", "reid_model",
            "runtime", "precision",
            "modelArtifactReference", "model_artifact_reference",
            "detectorInputSize", "detector_input_size",
            "confidenceThreshold", "confidence_threshold",
            "frameStride", "frame_stride",
            "poseStride", "pose_stride",
            "useCourtRoi", "use_court_roi",
            "courtRoiMarginPx", "court_roi_margin_px",
            "courtRoiMarginM", "court_roi_margin_m",
            "autoCourtCalibrationEnabled", "auto_court_calibration_enabled",
            "device",
        }
        extra = {k: v for k, v in data.items() if k not in known_keys}

        pose_val = data.get("poseModel") if "poseModel" in data else data.get("pose_model", "yolov8n-pose.pt")
        auto_calib = bool(data.get("autoCourtCalibrationEnabled") if "autoCourtCalibrationEnabled" in data else data.get("auto_court_calibration_enabled", False))

        cfg = cls(
            detector_model=data.get("detectorModel") or data.get("detector_model", "yolov8n.pt"),
            detector_family=data.get("detectorFamily") or data.get("detector_family", "yolov8"),
            pose_model=pose_val,
            pose_family=data.get("poseFamily") or data.get("pose_family", "yolov8"),
            pose_architecture=data.get("poseArchitecture") or data.get("pose_architecture", "roi_pose"),
            tracker_name=data.get("trackerName") or data.get("tracker_name", "bytetrack"),
            tracker_config_path=data.get("trackerConfigPath") or data.get("tracker_config_path"),
            tracker_config=data.get("trackerConfig") or data.get("tracker_config"),
            reid_enabled=bool(data.get("reidEnabled") if "reidEnabled" in data else data.get("reid_enabled", False)),
            reid_model=data.get("reidModel") if "reidModel" in data else data.get("reid_model"),
            runtime=data.get("runtime", "pytorch"),
            precision=data.get("precision", "fp32"),
            model_artifact_reference=data.get("modelArtifactReference") or data.get("model_artifact_reference"),
            detector_input_size=int(data.get("detectorInputSize") or data.get("detector_input_size", 640)),
            confidence_threshold=float(data.get("confidenceThreshold") or data.get("confidence_threshold", 0.35)),
            frame_stride=max(1, int(data.get("frameStride") or data.get("frame_stride", 1))),
            pose_stride=max(1, int(data.get("poseStride") or data.get("pose_stride", 1))),
            use_court_roi=bool(data.get("useCourtRoi") if "useCourtRoi" in data else data.get("use_court_roi", False)),
            court_roi_margin_px=int(data.get("courtRoiMarginPx") or data.get("court_roi_margin_px", 60)),
            court_roi_margin_m=float(data.get("courtRoiMarginM") or data.get("court_roi_margin_m", 0.5)),
            auto_court_calibration_enabled=auto_calib,
            device=data.get("device", "auto"),
            extra_options=extra,
        )
        validate_engine_config(cfg)
        return cfg


def is_tensorrt_available(device: str = "auto") -> tuple[bool, str]:
    """Check if TensorRT execution environment is available.

    Requirements:
    1. CUDA must be available on the host.
    2. TensorRT Python module (`tensorrt`) must be importable.
    """
    try:
        import torch
        if not torch.cuda.is_available():
            return False, "CUDA is not available on this device; TensorRT requires NVIDIA CUDA"
    except Exception as e:
        return False, f"PyTorch CUDA check failed: {e}"

    try:
        import tensorrt  # noqa: F401
        return True, "TensorRT is available"
    except ImportError:
        return False, "TensorRT module ('tensorrt') is not installed or importable"
    except Exception as e:
        return False, f"TensorRT initialization failed: {e}"


def validate_runtime_and_precision(
    runtime: str,
    precision: str,
    device: str = "auto",
    model_artifact_reference: str | None = None,
) -> None:
    """Validate runtime and precision settings, failing explicitly if unavailable.

    Guarantees no silent fallback: if tensorrt is requested and unavailable,
    raises RuntimeUnavailableError immediately.
    """
    if runtime not in VALID_RUNTIMES:
        raise InvalidEngineConfigError(
            f"Unsupported runtime: '{runtime}'. Supported runtimes: {sorted(VALID_RUNTIMES)}"
        )
    if precision == "int8":
        raise InvalidEngineConfigError(
            "Unsupported precision: 'int8'. INT8 is not implemented. Supported precisions: ['fp16', 'fp32']"
        )
    if precision not in VALID_PRECISIONS:
        raise InvalidEngineConfigError(
            f"Unsupported precision: '{precision}'. Supported precisions: {sorted(VALID_PRECISIONS)}"
        )

    if runtime == "tensorrt":
        available, reason = is_tensorrt_available(device=device)
        if not available:
            msg = (
                f"Requested TensorRT runtime is unavailable: {reason}. "
                "Silent fallback to PyTorch is prohibited by SportsScout protocol."
            )
            if "CUDA" in reason:
                raise CUDAIncompatibilityError(msg)
            raise RuntimeUnavailableError(msg)
        if model_artifact_reference is not None:
            artifact_path = Path(model_artifact_reference)
            if not artifact_path.exists():
                raise RuntimeUnavailableError(
                    f"Model artifact file not found: {model_artifact_reference}"
                )


def validate_engine_config(config: TrackingEngineConfig) -> None:
    """
    Validate tracking engine configuration schema.
    Raises InvalidEngineConfigError on violation.
    """
    if not config.detector_model or not isinstance(config.detector_model, str) or not config.detector_model.strip():
        raise InvalidEngineConfigError("detector_model must be a non-empty string")

    validate_runtime_and_precision(
        runtime=config.runtime,
        precision=config.precision,
        device=config.device,
        model_artifact_reference=config.model_artifact_reference,
    )

    if config.detector_input_size <= 0:
        raise InvalidEngineConfigError(f"detector_input_size must be positive, got {config.detector_input_size}")

    if not (0.0 < config.confidence_threshold <= 1.0):
        raise InvalidEngineConfigError(
            f"confidence_threshold must be in (0, 1], got {config.confidence_threshold}"
        )

    if config.frame_stride < 1:
        raise InvalidEngineConfigError(f"frame_stride must be >= 1, got {config.frame_stride}")

    if config.pose_stride < 1:
        raise InvalidEngineConfigError(f"pose_stride must be >= 1, got {config.pose_stride}")

    if config.pose_architecture not in VALID_POSE_ARCHITECTURES:
        raise InvalidEngineConfigError(
            f"Unsupported pose architecture: '{config.pose_architecture}'. "
            f"Supported architectures: {sorted(VALID_POSE_ARCHITECTURES)}"
        )


def resolve_tracker_config(tracker_name: str, tracker_config_path: str | None = None) -> str:
    """
    Resolve tracker configuration string/path for Ultralytics tracking.
    Raises ModelNotFoundError if a specified custom tracker file does not exist.
    Raises InvalidEngineConfigError if tracker name is unrecognized.
    """
    if tracker_config_path is not None:
        configured = str(tracker_config_path).strip().lower()
        if configured in KNOWN_TRACKERS.values():
            return configured
        p = Path(tracker_config_path)
        if not p.exists():
            raise ModelNotFoundError(f"Custom tracker config file not found: {tracker_config_path}")
        return str(p)

    norm_name = tracker_name.strip().lower()
    if norm_name in KNOWN_TRACKERS:
        return KNOWN_TRACKERS[norm_name]

    if norm_name.endswith((".yaml", ".yml")):
        p = Path(tracker_name)
        if p.exists():
            return str(p)
        raise ModelNotFoundError(f"Tracker configuration file '{tracker_name}' not found")

    raise InvalidEngineConfigError(
        f"Unsupported tracker: '{tracker_name}'. Supported built-in trackers: {sorted(KNOWN_TRACKERS.keys())}"
    )


def create_baseline_engine_config(**overrides: Any) -> TrackingEngineConfig:
    """
    Factory helper returning the verified Phase 0 / 1.0 baseline engine configuration.
    Default: YOLOv8n + YOLOv8n-pose + ByteTrack @ 640px PyTorch FP32.
    """
    cfg = TrackingEngineConfig(
        detector_model="yolov8n.pt",
        detector_family="yolov8",
        pose_model="yolov8n-pose.pt",
        pose_family="yolov8",
        pose_architecture="roi_pose",
        tracker_name="bytetrack",
        tracker_config_path=None,
        tracker_config=None,
        reid_enabled=False,
        reid_model=None,
        runtime="pytorch",
        precision="fp32",
        model_artifact_reference=None,
        detector_input_size=640,
        confidence_threshold=0.35,
        frame_stride=1,
        pose_stride=1,
        use_court_roi=False,
        court_roi_margin_px=60,
        court_roi_margin_m=0.5,
        device="auto",
    )
    for k, v in overrides.items():
        if hasattr(cfg, k):
            setattr(cfg, k, v)
        else:
            cfg.extra_options[k] = v
    validate_engine_config(cfg)
    return cfg
