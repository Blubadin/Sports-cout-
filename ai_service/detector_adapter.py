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
from engine_config import ModelNotFoundError, resolve_tracker_config


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

    def __init__(self, model_path: str = "yolov8n.pt", device: str | None = None):
        self._model_path = str(model_path)
        self._device = device
        self._model = None

    @property
    def model_name(self) -> str:
        return self._model_path

    def _init_model(self):
        """
        Initialize the underlying YOLO model.
        Fails explicitly if the model file is not found locally or fails to load.
        """
        if self._model is not None:
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
                f"Detection model '{self._model_path}' not found in local filesystem or cache. Remote downloads are prohibited in benchmark protocol."
            )

        from ultralytics import YOLO
        try:
            target = resolved_path if resolved_path else self._model_path
            self._model = YOLO(target)
        except Exception as e:
            raise ModelNotFoundError(
                f"Failed to load detection model '{self._model_path}': {e}"
            ) from e

    def detect_and_track(
        self,
        frame: np.ndarray,
        conf: float = 0.35,
        imgsz: int = 640,
        device: str = "cpu",
        tracker_name: str = "bytetrack",
        tracker_config_path: str | None = None,
        classes: list[int] | None = None,
        offset_x: int = 0,
        offset_y: int = 0,
    ) -> list[dict[str, Any]]:
        self._init_model()
        tracker_cfg = resolve_tracker_config(tracker_name, tracker_config_path)
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
                cx = (src_x1 + src_x2) / 2.0
                cy = src_y2  # Feet level on ground for court position
                detections.append({
                    "bbox": [src_x1, src_y1, src_x2, src_y2],
                    "center": (cx, cy),
                    "conf": float(confidence),
                    "track_id": int(track_id) if track_id is not None else None,
                })
        return detections
