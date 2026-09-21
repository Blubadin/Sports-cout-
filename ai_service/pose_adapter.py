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
from typing import Any
import numpy as np

from engine_config import ModelNotFoundError
from pose_detector import YoloPoseDetector


class BasePoseAdapter(ABC):
    """Abstract base class for athlete pose estimation."""

    @property
    @abstractmethod
    def model_name(self) -> str | None:
        """Return the pose model name/path, or None if disabled."""
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

    def _init_detector(self):
        """
        Initialize the underlying YoloPoseDetector.
        Fails explicitly if model loading raises an exception.
        """
        if self._detector is not None:
            return
        try:
            self._detector = YoloPoseDetector(
                model_path=self._model_path,
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

    def estimate_pose_in_roi(
        self,
        frame: np.ndarray,
        player_bbox: list[float] | tuple[float, float, float, float],
    ) -> dict[str, Any]:
        return {"keypoints": [], "metrics": {}}
