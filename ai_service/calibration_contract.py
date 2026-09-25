"""Temporal identity and validity for the existing court homography."""

from __future__ import annotations

from dataclasses import dataclass, replace
from enum import Enum
from math import isfinite
from uuid import uuid4


class CalibrationState(str, Enum):
    UNCALIBRATED = "UNCALIBRATED"
    CALIBRATED = "CALIBRATED"
    CALIBRATION_LOST = "CALIBRATION_LOST"
    RECALIBRATING = "RECALIBRATING"


class CalibrationSource(str, Enum):
    MANUAL = "manual"
    AUTOMATIC = "automatic"
    CORRECTED = "corrected"


@dataclass(frozen=True)
class CalibrationProvenance:
    calibration_id: str
    camera_segment_id: str
    state: CalibrationState
    source: CalibrationSource
    created_at_frame: int
    created_at_timestamp_sec: float
    confidence: float | None = None
    reprojection_error_px: float | None = None

    def __post_init__(self) -> None:
        if not isinstance(self.state, CalibrationState) or not isinstance(self.source, CalibrationSource):
            raise ValueError("Calibration state and source must use the canonical enums")
        if not self.calibration_id or not self.camera_segment_id:
            raise ValueError("Calibration and camera segment IDs are required")
        if (type(self.created_at_frame) is not int or self.created_at_frame < 0 or
                not isinstance(self.created_at_timestamp_sec, (int, float)) or
                not isfinite(self.created_at_timestamp_sec) or self.created_at_timestamp_sec < 0):
            raise ValueError("Calibration creation frame and time must be nonnegative and finite")
        if self.confidence is not None and (not isinstance(self.confidence, (int, float)) or
                                            not isfinite(self.confidence) or not 0 <= self.confidence <= 1):
            raise ValueError("Calibration confidence must be in [0, 1]")
        if self.reprojection_error_px is not None and (
                not isinstance(self.reprojection_error_px, (int, float)) or
                not isfinite(self.reprojection_error_px) or self.reprojection_error_px < 0):
            raise ValueError("Reprojection error must be nonnegative and finite")
        if self.source is CalibrationSource.MANUAL and (
                self.confidence is not None or self.reprojection_error_px is not None):
            raise ValueError("Manual four-corner calibration has no measured quality")

    def to_dict(self) -> dict:
        return {
            "calibrationId": self.calibration_id,
            "cameraSegmentId": self.camera_segment_id,
            "state": self.state.value,
            "source": self.source.value,
            "createdAtFrame": self.created_at_frame,
            "createdAtTimestampSec": self.created_at_timestamp_sec,
            "confidence": self.confidence,
            "reprojectionErrorPx": self.reprojection_error_px,
        }


class CalibrationContext:
    def __init__(self) -> None:
        self.camera_segment_id = f"segment-{uuid4().hex}"
        self.state = CalibrationState.UNCALIBRATED
        self.provenance: CalibrationProvenance | None = None

    @property
    def is_metric_valid(self) -> bool:
        return (
            self.state is CalibrationState.CALIBRATED
            and self.provenance is not None
            and self.provenance.camera_segment_id == self.camera_segment_id
        )

    def accept(self, *, source: CalibrationSource, frame: int, timestamp_sec: float,
               confidence: float | None = None, reprojection_error_px: float | None = None) -> CalibrationProvenance:
        provenance = CalibrationProvenance(
            calibration_id=f"cal-{uuid4().hex}",
            camera_segment_id=self.camera_segment_id,
            state=CalibrationState.CALIBRATED,
            source=source,
            created_at_frame=frame,
            created_at_timestamp_sec=timestamp_sec,
            confidence=confidence,
            reprojection_error_px=reprojection_error_px,
        )
        self.provenance = provenance
        self.state = CalibrationState.CALIBRATED
        return provenance

    def lose(self) -> None:
        self.state = CalibrationState.CALIBRATION_LOST
        if self.provenance is not None:
            self.provenance = replace(self.provenance, state=self.state)

    def begin_recalibration(self) -> None:
        self.state = CalibrationState.RECALIBRATING
        if self.provenance is not None:
            self.provenance = replace(self.provenance, state=self.state)

    def start_camera_segment(self) -> None:
        self.camera_segment_id = f"segment-{uuid4().hex}"
        self.state = CalibrationState.CALIBRATION_LOST
        self.provenance = None

    def frame_fields(self) -> dict:
        provenance = self.provenance if self.provenance and self.provenance.camera_segment_id == self.camera_segment_id else None
        return {
            "cameraSegmentId": self.camera_segment_id,
            "calibrationId": provenance.calibration_id if provenance else None,
            "calibrationState": self.state.value,
            "calibrationConfidence": provenance.confidence if provenance and self.is_metric_valid else None,
            "calibration": provenance.to_dict() if provenance else None,
        }
