"""
pose_adapter.py — Abstraction seam for athlete pose keypoint estimation.

Provides:
- BasePoseAdapter: contract for athlete ROI keypoint estimation
- UltralyticsPoseAdapter: implementation wrapping YoloPoseDetector
- DisabledPoseAdapter: no-op implementation when pose estimation is turned off

Rules:
- Never silently fall back on load failures.
- Return standardized dict with "keypoints" and "metrics".
- DisabledPoseAdapter returns empty keypoints/metrics safely.
"""

from __future__ import annotations
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any
import numpy as np

from engine_config import ModelNotFoundError
from pose_detector import YoloPoseDetector


class PoseArchitectureNotImplementedError(RuntimeError):
    """Raised when a configured pose architecture has no production provider."""


@dataclass(frozen=True)
class FullFramePoseCandidate:
    """Future full-frame pose result, expressed in source-frame coordinates."""

    bbox: tuple[float, float, float, float]
    keypoints: list[list[float]]
    metrics: dict[str, Any]


class BasePoseAdapter(ABC):
    """Abstract base class for athlete pose estimation."""

    @property
    @abstractmethod
    def model_name(self) -> str | None:
        """Return the pose model name/path, or None if disabled."""
        pass

    @property
    @abstractmethod
    def architecture(self) -> str:
        """Return the configured pose architecture identifier."""
        pass

    @abstractmethod
    def estimate_pose_in_roi(
        self,
        frame: np.ndarray,
        player_bbox: list[float] | tuple[float, float, float, float],
    ) -> dict[str, Any]:
        """
        Estimate 17 keypoints and biomechanical metrics for an athlete ROI.
        Must return: {"keypoints": [...], "metrics": {...}}
        """
        pass

    def estimate_full_frame(self, frame: np.ndarray) -> list[FullFramePoseCandidate]:
        """Future full-frame interface; ROI providers must not emulate it."""
        raise PoseArchitectureNotImplementedError(
            f"Pose architecture '{self.architecture}' does not provide full-frame candidates"
        )


class UltralyticsPoseAdapter(BasePoseAdapter):
    """
    Pose adapter wrapping YoloPoseDetector (YOLOv8n-pose / YOLO11n-pose).
    """

    def __init__(
        self,
        model_path: str = "yolov8n-pose.pt",
        conf_threshold: float = 0.4,
        device: str = "cpu",
    ):
        self._model_path = str(model_path)
        self._conf_threshold = conf_threshold
        self._device = device
        self._detector: YoloPoseDetector | None = None

    @property
    def model_name(self) -> str:
        return self._model_path

    @property
    def architecture(self) -> str:
        return "roi_pose"

    def _init_detector(self):
        """
        Initialize the underlying YoloPoseDetector.
        Fails explicitly if model loading raises an exception or file is not found locally.
        """
        if self._detector is not None:
            return

        from pathlib import Path
        p = Path(self._model_path)
        cache_locations = [
            p,
            Path.home() / "AppData" / "Roaming" / "Ultralytics" / self._model_path,
            Path.home() / ".cache" / "ultralytics" / self._model_path,
        ]
        resolved_path = None
        for loc in cache_locations:
            if loc.exists():
                resolved_path = str(loc)
                break

        if resolved_path is None and not p.is_absolute():
            raise ModelNotFoundError(
                f"Pose model '{self._model_path}' not found in local filesystem or cache. Remote downloads are prohibited in benchmark protocol."
            )

        try:
            target = resolved_path if resolved_path else self._model_path
            self._detector = YoloPoseDetector(
                model_path=target,
                conf_threshold=self._conf_threshold,
                device=self._device,
            )
            self._detector._init_model()
        except Exception as e:
            raise ModelNotFoundError(
                f"Failed to load pose model '{self._model_path}': {e}"
            ) from e

    def estimate_pose_in_roi(
        self,
        frame: np.ndarray,
        player_bbox: list[float] | tuple[float, float, float, float],
    ) -> dict[str, Any]:
        self._init_detector()
        try:
            return self._detector.estimate_pose_in_roi(frame, player_bbox)
        except Exception as e:
            raise RuntimeError(
                f"Pose estimation failed with model '{self._model_path}': {e}"
            ) from e


class DisabledPoseAdapter(BasePoseAdapter):
    """
    No-op pose adapter used when pose estimation is explicitly disabled.
    """

    @property
    def model_name(self) -> str | None:
        return None

    @property
    def architecture(self) -> str:
        return "roi_pose"

    def estimate_pose_in_roi(
        self,
        frame: np.ndarray,
        player_bbox: list[float] | tuple[float, float, float, float],
    ) -> dict[str, Any]:
        return {"keypoints": [], "metrics": {}}


def create_pose_provider(
    architecture: str,
    model_path: str | None,
    conf_threshold: float,
    device: str,
) -> BasePoseAdapter:
    """Create the selected provider without silently changing architecture."""
    if architecture == "roi_pose":
        if not model_path or str(model_path).strip().lower() in ("none", "disabled", ""):
            return DisabledPoseAdapter()
        return UltralyticsPoseAdapter(
            model_path=str(model_path),
            conf_threshold=conf_threshold,
            device=device,
        )
    if architecture == "full_frame_pose":
        raise PoseArchitectureNotImplementedError(
            "poseArchitecture 'full_frame_pose' is configured but has no provider implementation"
        )
    raise ValueError(f"Unsupported pose architecture: {architecture}")
