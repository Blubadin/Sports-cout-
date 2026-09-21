"""
detector_adapter.py — Abstraction seam for detection and multi-object tracking.

Provides:
- BaseDetectorAdapter: contract for person detection and MOT tracking
- UltralyticsDetectorAdapter: implementation wrapping Ultralytics YOLO models

Rules:
- Never silently fall back on load failures (fail explicitly with ModelNotFoundError).
- Preserve court ground contact convention: center = ((x1 + x2) / 2, y2).
- Return clean python types (list[dict]) matching SportsScout detection format.
"""

from __future__ import annotations
from abc import ABC, abstractmethod
from typing import Any
import numpy as np

from court_roi import inverse_transform_bbox
from engine_config import (
    ModelNotFoundError,
    resolve_tracker_config,
    validate_runtime_and_precision,
    RuntimeUnavailableError,
)
from tracker_adapter import NormalizedTrackResult, TrackerProvenance


class BaseDetectorAdapter(ABC):
    """Abstract base class for person detection and tracking."""

    @property
    @abstractmethod
    def model_name(self) -> str:
        """Return the detection model name or path."""
        pass

    @abstractmethod
    def detect_and_track(
        self,
        frame: np.ndarray,
        conf: float = 0.35,
        imgsz: int = 640,
        device: str = "cpu",
        tracker_name: str = "bytetrack",
        tracker_config_path: str | None = None,
        tracker_config: str | None = None,
        reid_enabled: bool = False,
        reid_model: str | None = None,
        classes: list[int] | None = None,
        offset_x: int = 0,
        offset_y: int = 0,
    ) -> list[dict[str, Any]]:
        """
        Execute detection and tracking on a full frame or ROI subframe.
        Returns detections mapped to full-source frame coordinates.
        """
        pass


class UltralyticsDetectorAdapter(BaseDetectorAdapter):
    """
    Adapter wrapping Ultralytics YOLO person detection and tracking.
    """

    def __init__(
        self,
        model_path: str = "yolov8n.pt",
        device: str | None = None,
        runtime: str = "pytorch",
        precision: str = "fp32",
        model_artifact_reference: str | None = None,
    ):
        self._model_path = str(model_path)
        self._device = device
        self._runtime = runtime
        self._precision = precision
        self._model_artifact_reference = model_artifact_reference
        self._model = None

    @property
    def model_name(self) -> str:
        return self._model_path

    @property
    def runtime(self) -> str:
        return self._runtime

    @property
    def precision(self) -> str:
        return self._precision

    @property
    def actual_model(self) -> str:
        return (
            self._model_artifact_reference
            if self._model_artifact_reference is not None
            else self._model_path
        )

    def _init_model(self):
        """
        Initialize the underlying YOLO model.
        Fails explicitly if the runtime is unavailable, or model file is not found locally.
        Prohibits silent fallback from TensorRT to PyTorch.
        """
        if self._model is not None:
            return

        validate_runtime_and_precision(
            runtime=self._runtime,
            precision=self._precision,
            device=self._device or "cpu",
            model_artifact_reference=self._model_artifact_reference,
        )

        from pathlib import Path
        target_path = (
            self._model_artifact_reference
            if self._model_artifact_reference is not None
            else self._model_path
        )
        p = Path(target_path)
        cache_locations = [
            p,
            Path.home() / "AppData" / "Roaming" / "Ultralytics" / target_path,
            Path.home() / ".cache" / "ultralytics" / target_path,
        ]
        resolved_path = None
        for loc in cache_locations:
            if loc.exists():
                resolved_path = str(loc)
                break

        if resolved_path is None and not p.is_absolute():
            raise ModelNotFoundError(
                f"Detection model '{target_path}' not found in local filesystem or cache. Remote downloads are prohibited in benchmark protocol."
            )

        from ultralytics import YOLO
        try:
            target = resolved_path if resolved_path else target_path
            self._model = YOLO(target)
        except Exception as e:
            raise ModelNotFoundError(
                f"Failed to load detection model '{target_path}': {e}"
            ) from e

    def detect_and_track(
        self,
        frame: np.ndarray,
        conf: float = 0.35,
        imgsz: int = 640,
        device: str = "cpu",
        tracker_name: str = "bytetrack",
        tracker_config_path: str | None = None,
        tracker_config: str | None = None,
        reid_enabled: bool = False,
        reid_model: str | None = None,
        classes: list[int] | None = None,
        offset_x: int = 0,
        offset_y: int = 0,
    ) -> list[dict[str, Any]]:
        self._init_model()
        tracker_cfg = resolve_tracker_config(tracker_name, tracker_config_path or tracker_config)
        provenance = TrackerProvenance(tracker_name, tracker_config or tracker_config_path, reid_enabled, reid_model)
        target_classes = classes if classes is not None else [0]  # Person class

        try:
            results = self._model.track(
                frame,
                persist=True,
                tracker=tracker_cfg,
                classes=target_classes,
                conf=conf,
                device=device,
                imgsz=imgsz,
                verbose=False,
            )
        except Exception as e:
            raise RuntimeError(
                f"Detection/tracking failed with model '{self._model_path}' and tracker '{tracker_cfg}': {e}"
            ) from e

        detections: list[dict[str, Any]] = []
        for r in results:
            boxes = r.boxes.xyxy.cpu().numpy()
            confs = r.boxes.conf.cpu().numpy()
            track_ids = r.boxes.id.cpu().numpy() if r.boxes.id is not None else [None] * len(boxes)
            for box, confidence, track_id in zip(boxes, confs, track_ids):
                x1, y1, x2, y2 = box.tolist()
                src_x1, src_y1, src_x2, src_y2 = inverse_transform_bbox(
                    [x1, y1, x2, y2], offset_x, offset_y
                )
                detections.append(NormalizedTrackResult(
                    bbox=(src_x1, src_y1, src_x2, src_y2),
                    confidence=float(confidence),
                    raw_track_id=int(track_id) if track_id is not None else None,
                    provenance=provenance,
                ).to_detection())
        return detections
