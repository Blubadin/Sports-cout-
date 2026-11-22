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

from court_roi import filter_court_bboxes, inverse_transform_bbox
from engine_config import (
    ModelNotFoundError,
    resolve_tracker_config,
    validate_runtime_and_precision,
    RuntimeUnavailableError,
    EngineLoadError,
    RuntimeInferenceError,
)
from tracker_adapter import NormalizedTrackResult, TrackerProvenance
from device_runtime import InferenceExecution, artifact_sha256, package_version
from ultralytics_runtime import runtime_predictor, precision_options


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
        court_filter_active: bool = False,
        image_to_court: np.ndarray | list[list[float]] | None = None,
        court_width_m: float = 6.10,
        court_length_m: float = 13.40,
        court_margin_m: float = 0.5,
    ) -> list[dict[str, Any]]:
        """
        Execute detection and tracking on a full frame or ROI subframe.
        Returns detections mapped to full-source frame coordinates.
        """
        pass


def court_filtered_predictor(base_predictor, court_filter_state: dict, on_counts):
    """Create a predictor that removes off-court person boxes before MOT callbacks run.

    Ultralytics updates ByteTrack from ``Results`` after ``postprocess`` returns,
    so applying this filter here keeps neighboring-court and spectator tracks
    out of the tracker itself. State is mutable because Ultralytics reuses its
    predictor instance across frames.
    """
    class CourtFilteredPredictor(base_predictor):
        def postprocess(self, predictions, tensor, originals, **kwargs):
            results = super().postprocess(predictions, tensor, originals, **kwargs)
            totals = {
                "candidateCount": 0,
                "acceptedCount": 0,
                "rejectedOutsideCourtCount": 0,
            }
            filtered_results = []
            for result in results:
                boxes = result.boxes.xyxy.cpu().numpy()
                totals["candidateCount"] += len(boxes)
                if court_filter_state.get("active"):
                    accepted, counts = filter_court_bboxes(
                        boxes,
                        image_to_court=court_filter_state.get("imageToCourt"),
                        court_width_m=court_filter_state.get("courtWidthM", 6.10),
                        court_length_m=court_filter_state.get("courtLengthM", 13.40),
                        margin_m=court_filter_state.get("marginM", 0.5),
                        offset_x=court_filter_state.get("offsetX", 0),
                        offset_y=court_filter_state.get("offsetY", 0),
                    )
                    totals["acceptedCount"] += counts["acceptedCount"]
                    totals["rejectedOutsideCourtCount"] += counts["rejectedOutsideCourtCount"]
                else:
                    accepted = list(range(len(boxes)))
                    totals["acceptedCount"] += len(accepted)
                filtered_results.append(result[np.asarray(accepted, dtype=np.int64)])

            image_to_court = court_filter_state.get("imageToCourt")
            calibration_available = False
            if image_to_court is not None:
                try:
                    matrix = np.asarray(image_to_court, dtype=np.float64)
                    calibration_available = (
                        matrix.shape == (3, 3)
                        and np.all(np.isfinite(matrix))
                        and abs(float(np.linalg.det(matrix))) >= 1e-12
                    )
                except (TypeError, ValueError, np.linalg.LinAlgError):
                    calibration_available = False
            on_counts({
                **totals,
                "active": bool(court_filter_state.get("active")),
                "calibrationAvailable": calibration_available,
            })
            return filtered_results

    return CourtFilteredPredictor


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
        self.execution = InferenceExecution(device or 'auto', backend=runtime, precision=precision)
        self._artifact_hash = None
        self._court_filter_state = {
            "active": False,
            "imageToCourt": None,
            "courtWidthM": 6.10,
            "courtLengthM": 13.40,
            "marginM": 0.5,
            "offsetX": 0,
            "offsetY": 0,
        }
        self.last_court_filter_counts = {
            "candidateCount": 0,
            "acceptedCount": 0,
            "rejectedOutsideCourtCount": 0,
            "active": False,
            "calibrationAvailable": False,
        }

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
            self._artifact_hash = artifact_sha256(target)
        except Exception as e:
            if self._runtime == "tensorrt":
                raise EngineLoadError(
                    f"Failed to load TensorRT engine '{target_path}': {e}"
                ) from e
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
        court_filter_active: bool = False,
        image_to_court: np.ndarray | list[list[float]] | None = None,
        court_width_m: float = 6.10,
        court_length_m: float = 13.40,
        court_margin_m: float = 0.5,
    ) -> list[dict[str, Any]]:
        self._init_model()
        self._court_filter_state.update({
            "active": bool(court_filter_active),
            "imageToCourt": image_to_court,
            "courtWidthM": float(court_width_m),
            "courtLengthM": float(court_length_m),
            "marginM": float(court_margin_m),
            "offsetX": int(offset_x),
            "offsetY": int(offset_y),
        })
        self.last_court_filter_counts = {
            "candidateCount": 0,
            "acceptedCount": 0,
            "rejectedOutsideCourtCount": 0,
            "active": bool(court_filter_active),
            "calibrationAvailable": image_to_court is not None,
        }
        tracker_cfg = resolve_tracker_config(tracker_name, tracker_config_path or tracker_config)
        provenance = TrackerProvenance(tracker_name, tracker_config or tracker_config_path, reid_enabled, reid_model)
        target_classes = classes if classes is not None else [0]  # Person class

        options = {}
        from ultralytics.models.yolo.detect import DetectionPredictor
        predictor = court_filtered_predictor(
            DetectionPredictor,
            self._court_filter_state,
            lambda counts: setattr(self, "last_court_filter_counts", counts),
        )
        if self._runtime == 'pytorch':
            options['predictor'] = runtime_predictor(predictor, self.execution)
            options.update(precision_options(self._precision))
        else:
            options['predictor'] = predictor
        try:
            results = self._model.track(
                frame,
                persist=True,
                tracker=tracker_cfg,
                classes=target_classes,
                conf=conf,
                device=self.execution.device if self._runtime == 'pytorch' else device,
                imgsz=imgsz,
                verbose=False,
                **options,
            )
        except Exception as e:
            if self._runtime == "tensorrt":
                raise RuntimeInferenceError(
                    f"TensorRT inference failed for model '{self.actual_model}': {e}"
                ) from e
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

    def get_provenance(self):
        return {
            **self.execution.provenance(), 'provider': 'ultralytics',
            'runtime': self._runtime, 'runtimeVersion': package_version('torch' if self._runtime == 'pytorch' else 'tensorrt'),
            'providerVersion': package_version('ultralytics'),
            'modelVersion': self._artifact_hash, 'modelSha256': self._artifact_hash,
            'preprocessVersion': 'ultralytics-letterbox-bgr-rgb-v1',
            'postprocessVersion': 'ultralytics-nms-court-filter-bytetrack-source-bbox-v2',
        }
