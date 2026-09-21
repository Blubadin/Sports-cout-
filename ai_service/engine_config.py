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

VALID_RUNTIMES = {"pytorch", "onnx", "tensorrt"}
VALID_PRECISIONS = {"fp32", "fp16", "int8"}
KNOWN_TRACKERS = {
    "bytetrack": "bytetrack.yaml",
    "botsort": "botsort.yaml",
}


class InvalidEngineConfigError(ValueError):
    """Raised when tracking engine configuration contains invalid or unsupported options."""
    pass


class ModelNotFoundError(FileNotFoundError):
    """Raised when a requested model file cannot be found or loaded."""
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
    tracker_name: str = "bytetrack"
    tracker_config_path: str | None = None
    runtime: str = "pytorch"
    precision: str = "fp32"
    detector_input_size: int = 640
    confidence_threshold: float = 0.35
    frame_stride: int = 1
    pose_stride: int = 1
    use_court_roi: bool = False
    court_roi_margin_px: int = 60
    court_roi_margin_m: float = 0.5
    device: str = "auto"
    extra_options: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        """Serialize configuration to a camelCase dictionary."""
        return {
            "detectorModel": self.detector_model,
            "detectorFamily": self.detector_family,
            "poseModel": self.pose_model,
            "poseFamily": self.pose_family,
            "trackerName": self.tracker_name,
            "trackerConfigPath": self.tracker_config_path,
            "runtime": self.runtime,
            "precision": self.precision,
            "detectorInputSize": self.detector_input_size,
            "confidenceThreshold": self.confidence_threshold,
            "frameStride": self.frame_stride,
            "poseStride": self.pose_stride,
            "useCourtRoi": self.use_court_roi,
            "courtRoiMarginPx": self.court_roi_margin_px,
            "courtRoiMarginM": self.court_roi_margin_m,
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
            "trackerName", "tracker_name",
            "trackerConfigPath", "tracker_config_path",
            "runtime", "precision",
            "detectorInputSize", "detector_input_size",
            "confidenceThreshold", "confidence_threshold",
            "frameStride", "frame_stride",
            "poseStride", "pose_stride",
            "useCourtRoi", "use_court_roi",
            "courtRoiMarginPx", "court_roi_margin_px",
            "courtRoiMarginM", "court_roi_margin_m",
            "device",
        }
        extra = {k: v for k, v in data.items() if k not in known_keys}

        pose_val = data.get("poseModel") if "poseModel" in data else data.get("pose_model", "yolov8n-pose.pt")

        cfg = cls(
            detector_model=data.get("detectorModel") or data.get("detector_model", "yolov8n.pt"),
            detector_family=data.get("detectorFamily") or data.get("detector_family", "yolov8"),
            pose_model=pose_val,
            pose_family=data.get("poseFamily") or data.get("pose_family", "yolov8"),
            tracker_name=data.get("trackerName") or data.get("tracker_name", "bytetrack"),
            tracker_config_path=data.get("trackerConfigPath") or data.get("tracker_config_path"),
            runtime=data.get("runtime", "pytorch"),
            precision=data.get("precision", "fp32"),
            detector_input_size=int(data.get("detectorInputSize") or data.get("detector_input_size", 640)),
            confidence_threshold=float(data.get("confidenceThreshold") or data.get("confidence_threshold", 0.35)),
            frame_stride=max(1, int(data.get("frameStride") or data.get("frame_stride", 1))),
            pose_stride=max(1, int(data.get("poseStride") or data.get("pose_stride", 1))),
            use_court_roi=bool(data.get("useCourtRoi") if "useCourtRoi" in data else data.get("use_court_roi", False)),
            court_roi_margin_px=int(data.get("courtRoiMarginPx") or data.get("court_roi_margin_px", 60)),
            court_roi_margin_m=float(data.get("courtRoiMarginM") or data.get("court_roi_margin_m", 0.5)),
            device=data.get("device", "auto"),
            extra_options=extra,
        )
        validate_engine_config(cfg)
        return cfg


def validate_engine_config(config: TrackingEngineConfig) -> None:
    """
    Validate tracking engine configuration.
    Raises InvalidEngineConfigError on violation.
    """
    if not config.detector_model or not isinstance(config.detector_model, str) or not config.detector_model.strip():
        raise InvalidEngineConfigError("detector_model must be a non-empty string")

    if config.runtime not in VALID_RUNTIMES:
        raise InvalidEngineConfigError(
            f"Unsupported runtime: '{config.runtime}'. Supported runtimes: {sorted(VALID_RUNTIMES)}"
        )

    if config.precision not in VALID_PRECISIONS:
        raise InvalidEngineConfigError(
            f"Unsupported precision: '{config.precision}'. Supported precisions: {sorted(VALID_PRECISIONS)}"
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


def resolve_tracker_config(tracker_name: str, tracker_config_path: str | None = None) -> str:
    """
    Resolve tracker configuration string/path for Ultralytics tracking.
    Raises ModelNotFoundError if a specified custom tracker file does not exist.
    Raises InvalidEngineConfigError if tracker name is unrecognized.
    """
    if tracker_config_path is not None:
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
        tracker_name="bytetrack",
        tracker_config_path=None,
        runtime="pytorch",
        precision="fp32",
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
