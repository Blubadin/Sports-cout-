"""
ai_service/shuttle_benchmark_schema.py — Shuttlecock Benchmark Protocol & Ground Truth Contract (Phase 2.0)

Defines the standardized, vendor-neutral representation for badminton shuttlecock tracking
experiments and ground-truth evaluation.

Key Invariants:
1. IMAGE SPACE FIRST: Shuttlecock ground-truth coordinates (xPx, yPx) are recorded in native
   2D pixel space. Projecting airborne shuttle image coordinates directly through the 2D
   court-floor homography matrix (Z=0) is mathematically invalid due to 3D parallax error.
2. NO FAKE ZEROES: Invisible or unknown shuttlecock positions MUST remain None.
   Representing an unseen shuttle as (0, 0) is strictly rejected.
3. LOGICAL REFERENCES ONLY: Benchmark manifest stores relative logical video paths; large video
   binaries are never committed to Git.
4. PROVENANCE & REVIEW: Frames track source ('manual', 'semi_automatic', 'model_assisted') and
   verification status ('reviewed': bool).
"""

from __future__ import annotations
from dataclasses import dataclass, field
import json
import math
from pathlib import Path
from typing import Any, Dict, List, Optional, Union


VALID_SHUTTLE_VISIBILITIES = ("visible", "occluded", "not_visible", "unknown")
VALID_SHUTTLE_ANNOTATION_SOURCES = ("manual", "semi_automatic", "model_assisted")
VALID_SHUTTLE_SPLITS = ("development", "validation", "test")

STANDARD_SHUTTLE_DIFFICULT_TAGS = (
    "smash",
    "motion_blur",
    "shuttle_near_player",
    "body_occlusion",
    "net_occlusion",
    "camera_motion",
    "far_court",
    "white_background",
    "crowd_background",
    "lost_reacquisition",
)


def _optional_float(value: Any) -> Optional[float]:
    if value is None:
        return None
    try:
        val = float(value)
        return val if math.isfinite(val) else None
    except (TypeError, ValueError):
        return None


def _optional_int(value: Any) -> Optional[int]:
    val = _optional_float(value)
    return int(val) if val is not None else None


@dataclass
class ShuttleDifficultSegment:
    """Temporally bounded interval presenting specific detection/tracking challenges."""

    start_sec: float
    end_sec: float
    tags: List[str] = field(default_factory=list)
    description: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "startSec": self.start_sec,
            "endSec": self.end_sec,
            "tags": list(self.tags),
            "description": self.description,
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> ShuttleDifficultSegment:
        return cls(
            start_sec=float(data.get("startSec", 0.0)),
            end_sec=float(data.get("endSec", 0.0)),
            tags=list(data.get("tags", [])),
            description=data.get("description"),
        )

    def validate(self) -> List[str]:
        errors = []
        if not math.isfinite(self.start_sec) or self.start_sec < 0:
            errors.append("startSec must be a non-negative finite number")
        if not math.isfinite(self.end_sec) or self.end_sec < 0:
            errors.append("endSec must be a non-negative finite number")
        if self.end_sec < self.start_sec:
            errors.append("endSec must be greater than or equal to startSec")
        if not self.tags or not all(isinstance(t, str) and t.strip() for t in self.tags):
            errors.append("tags must be a non-empty list of non-empty strings")
        return errors


@dataclass
class ShuttleGroundTruthFrame:
    """
    Ground truth position and state for a single video frame.

    Rules:
    - visible: x_px and y_px must be valid finite floats.
    - not_visible or unknown: x_px and y_px MUST be None. (0, 0) is forbidden.
    - occluded: x_px and y_px may be known/estimated or None.
    """

    frame_index: int
    timestamp_sec: float
    visibility: str
    x_px: Optional[float] = None
    y_px: Optional[float] = None
    x_normalized: Optional[float] = None
    y_normalized: Optional[float] = None
    annotation_source: Optional[str] = "manual"
    reviewed: Optional[bool] = False
    notes: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "frameIndex": self.frame_index,
            "timestampSec": self.timestamp_sec,
            "visibility": self.visibility,
            "xPx": self.x_px,
            "yPx": self.y_px,
            "xNormalized": self.x_normalized,
            "yNormalized": self.y_normalized,
            "annotationSource": self.annotation_source,
            "reviewed": self.reviewed,
            "notes": self.notes,
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> ShuttleGroundTruthFrame:
        return cls(
            frame_index=int(data["frameIndex"]),
            timestamp_sec=float(data["timestampSec"]),
            visibility=str(data["visibility"]),
            x_px=_optional_float(data.get("xPx")),
            y_px=_optional_float(data.get("yPx")),
            x_normalized=_optional_float(data.get("xNormalized")),
            y_normalized=_optional_float(data.get("yNormalized")),
            annotation_source=data.get("annotationSource", "manual"),
            reviewed=bool(data.get("reviewed", False)) if data.get("reviewed") is not None else None,
            notes=data.get("notes"),
        )

    def validate(
        self,
        image_width: Optional[int] = None,
        image_height: Optional[int] = None,
    ) -> List[str]:
        errors = []

        if not isinstance(self.frame_index, int) or self.frame_index < 0:
            errors.append("frameIndex must be a non-negative integer")

        if not math.isfinite(self.timestamp_sec) or self.timestamp_sec < 0:
            errors.append("timestampSec must be a non-negative finite number")

        if self.visibility not in VALID_SHUTTLE_VISIBILITIES:
            errors.append(
                f"visibility must be one of: {', '.join(VALID_SHUTTLE_VISIBILITIES)} (got: {self.visibility})"
            )

        if self.visibility == "visible":
            if self.x_px is None or not math.isfinite(self.x_px) or self.x_px < 0:
                errors.append("visible shuttle must have a non-negative finite xPx coordinate")
            if self.y_px is None or not math.isfinite(self.y_px) or self.y_px < 0:
                errors.append("visible shuttle must have a non-negative finite yPx coordinate")

            if image_width is not None and self.x_px is not None and self.x_px > image_width:
                errors.append(f"xPx ({self.x_px}) exceeds source width ({image_width})")
            if image_height is not None and self.y_px is not None and self.y_px > image_height:
                errors.append(f"yPx ({self.y_px}) exceeds source height ({image_height})")

        elif self.visibility in ("not_visible", "unknown"):
            if self.x_px is not None:
                if self.x_px == 0 and (self.y_px is None or self.y_px == 0):
                    errors.append(
                        f"{self.visibility} shuttle must not represent missing coordinate as fake zero (0, 0); coordinates must be None"
                    )
                else:
                    errors.append(f"{self.visibility} shuttle must have None xPx coordinate")
            if self.y_px is not None:
                if not any("fake zero (0, 0)" in err for err in errors):
                    errors.append(f"{self.visibility} shuttle must have None yPx coordinate")

        elif self.visibility == "occluded":
            has_x = self.x_px is not None
            has_y = self.y_px is not None
            if has_x != has_y:
                errors.append("occluded shuttle must specify both xPx and yPx or leave both None")
            if has_x and (not math.isfinite(self.x_px) or self.x_px < 0):  # type: ignore[arg-type]
                errors.append("occluded xPx coordinate when provided must be a non-negative finite number")
            if has_y and (not math.isfinite(self.y_px) or self.y_px < 0):  # type: ignore[arg-type]
                errors.append("occluded yPx coordinate when provided must be a non-negative finite number")

        if self.x_normalized is not None:
            if not math.isfinite(self.x_normalized) or self.x_normalized < 0.0 or self.x_normalized > 1.0:
                errors.append("xNormalized must be between 0.0 and 1.0")

        if self.y_normalized is not None:
            if not math.isfinite(self.y_normalized) or self.y_normalized < 0.0 or self.y_normalized > 1.0:
                errors.append("yNormalized must be between 0.0 and 1.0")

        if self.annotation_source is not None and self.annotation_source not in VALID_SHUTTLE_ANNOTATION_SOURCES:
            errors.append(
                f"annotationSource must be one of: {', '.join(VALID_SHUTTLE_ANNOTATION_SOURCES)} (got: {self.annotation_source})"
            )

        if self.reviewed is not None and not isinstance(self.reviewed, bool):
            errors.append("reviewed must be a boolean or None")

        return errors


@dataclass
class ShuttleBenchmarkClip:
    """Metadata entry representing a standardized shuttlecock benchmark video clip."""

    id: str
    name: str
    category: str
    sport: str = "badminton"
    game_type: str = "singles"
    split: str = "development"
    player_count: int = 2
    video_reference: Optional[str] = None
    duration_sec: Optional[float] = None
    source_width: Optional[int] = None
    source_height: Optional[int] = None
    source_fps: Optional[float] = None
    camera_type: str = "static_rear"
    camera_motion: str = "static"
    difficulty_tags: List[str] = field(default_factory=list)
    court_calibration_reference: Optional[str] = None
    ground_truth_available: bool = False
    notes: Optional[str] = None
    known_difficult_segments: List[ShuttleDifficultSegment] = field(default_factory=list)
    ground_truth_frames: Optional[List[ShuttleGroundTruthFrame]] = None
    ground_truth_path: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "name": self.name,
            "category": self.category,
            "sport": self.sport,
            "gameType": self.game_type,
            "split": self.split,
            "playerCount": self.player_count,
            "videoReference": self.video_reference,
            "durationSec": self.duration_sec,
            "sourceWidth": self.source_width,
            "sourceHeight": self.source_height,
            "sourceFps": self.source_fps,
            "cameraType": self.camera_type,
            "cameraMotion": self.camera_motion,
            "difficultyTags": list(self.difficulty_tags),
            "courtCalibrationReference": self.court_calibration_reference,
            "groundTruthAvailable": self.ground_truth_available,
            "notes": self.notes,
            "knownDifficultSegments": [seg.to_dict() for seg in self.known_difficult_segments],
            "groundTruthFrames": [f.to_dict() for f in self.ground_truth_frames]
            if self.ground_truth_frames is not None
            else None,
            "groundTruthPath": self.ground_truth_path,
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> ShuttleBenchmarkClip:
        segments = [
            ShuttleDifficultSegment.from_dict(seg)
            for seg in data.get("knownDifficultSegments", [])
        ]
        raw_frames = data.get("groundTruthFrames")
        frames = (
            [ShuttleGroundTruthFrame.from_dict(f) for f in raw_frames]
            if raw_frames is not None
            else None
        )

        return cls(
            id=str(data["id"]),
            name=str(data["name"]),
            category=str(data.get("category", "S01")),
            sport=str(data.get("sport", "badminton")),
            game_type=str(data.get("gameType", "singles")),
            split=str(data.get("split", "development")),
            player_count=int(data.get("playerCount", 2)),
            video_reference=data.get("videoReference"),
            duration_sec=_optional_float(data.get("durationSec")),
            source_width=_optional_int(data.get("sourceWidth")),
            source_height=_optional_int(data.get("sourceHeight")),
            source_fps=_optional_float(data.get("sourceFps")),
            camera_type=str(data.get("cameraType", "static_rear")),
            camera_motion=str(data.get("cameraMotion", "static")),
            difficulty_tags=list(data.get("difficultyTags", [])),
            court_calibration_reference=data.get("courtCalibrationReference"),
            ground_truth_available=bool(data.get("groundTruthAvailable", False)),
            notes=data.get("notes"),
            known_difficult_segments=segments,
            ground_truth_frames=frames,
            ground_truth_path=data.get("groundTruthPath"),
        )

    def validate(self) -> List[str]:
        errors = []
        if not self.id or not self.id.strip():
            errors.append("id must be a non-empty string")
        if not self.name or not self.name.strip():
            errors.append("name must be a non-empty string")
        if not self.category or not self.category.strip():
            errors.append("category must be a non-empty string")
        if not self.sport or not self.sport.strip():
            errors.append("sport must be a non-empty string")
        if not self.game_type or not self.game_type.strip():
            errors.append("gameType must be a non-empty string")

        if self.split not in VALID_SHUTTLE_SPLITS:
            errors.append(
                f"split must be one of: {', '.join(VALID_SHUTTLE_SPLITS)} (got: {self.split})"
            )

        if not isinstance(self.player_count, int) or self.player_count <= 0:
            errors.append("playerCount must be a positive integer")

        if not isinstance(self.difficulty_tags, list) or any(
            not isinstance(t, str) for t in self.difficulty_tags
        ):
            errors.append("difficultyTags must be a list of strings")

        if self.duration_sec is not None and (
            not math.isfinite(self.duration_sec) or self.duration_sec <= 0
        ):
            errors.append("durationSec must be a positive finite number or None")

        if self.source_width is not None and self.source_width <= 0:
            errors.append("sourceWidth must be a positive integer or None")
        if self.source_height is not None and self.source_height <= 0:
            errors.append("sourceHeight must be a positive integer or None")
        if self.source_fps is not None and (
            not math.isfinite(self.source_fps) or self.source_fps <= 0
        ):
            errors.append("sourceFps must be a positive finite number or None")

        for idx, seg in enumerate(self.known_difficult_segments):
            seg_errors = seg.validate()
            if seg_errors:
                errors.append(f"knownDifficultSegments[{idx}]: {'; '.join(seg_errors)}")

        if self.ground_truth_frames is not None:
            for idx, frame in enumerate(self.ground_truth_frames):
                frame_errors = frame.validate(self.source_width, self.source_height)
                if frame_errors:
                    errors.append(f"groundTruthFrames[{idx}]: {'; '.join(frame_errors)}")

        return errors


@dataclass
class ShuttleBenchmarkManifest:
    """Container manifest defining the shuttlecock benchmark suite."""

    schema_version: int
    manifest_id: str
    updated_at: str
    description: Optional[str] = None
    clips: List[ShuttleBenchmarkClip] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "schemaVersion": self.schema_version,
            "manifestId": self.manifest_id,
            "updatedAt": self.updated_at,
            "description": self.description,
            "clips": [clip.to_dict() for clip in self.clips],
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> ShuttleBenchmarkManifest:
        clips = [
            ShuttleBenchmarkClip.from_dict(c)
            for c in data.get("clips", [])
        ]
        return cls(
            schema_version=int(data["schemaVersion"]),
            manifest_id=str(data["manifestId"]),
            updated_at=str(data["updatedAt"]),
            description=data.get("description"),
            clips=clips,
        )

    @classmethod
    def load_json(cls, path_or_str: Union[str, Path]) -> ShuttleBenchmarkManifest:
        p = Path(path_or_str)
        if p.exists() and p.is_file():
            with open(p, "r", encoding="utf-8") as f:
                data = json.load(f)
        else:
            data = json.loads(str(path_or_str))
        return cls.from_dict(data)

    def validate(self) -> List[str]:
        errors = []
        if not isinstance(self.schema_version, int) or self.schema_version <= 0:
            errors.append("schemaVersion must be a positive integer")
        if not self.manifest_id or not self.manifest_id.strip():
            errors.append("manifestId must be a non-empty string")
        if not self.updated_at or not self.updated_at.strip():
            errors.append("updatedAt must be a non-empty string")
        if not self.clips:
            errors.append("clips must be a non-empty list of benchmark clips")

        seen_ids = set()
        for idx, clip in enumerate(self.clips):
            clip_errors = clip.validate()
            if clip_errors:
                errors.append(f"clips[{idx}]: {'; '.join(clip_errors)}")
            if clip.id in seen_ids:
                errors.append(f"duplicate clip id found: {clip.id}")
            seen_ids.add(clip.id)

        return errors


def forbid_court_homography_projection(reason: str = "Airborne 3D parallax distortion") -> None:
    """
    Mathematical guard against projecting airborne shuttlecock image coordinates
    through 2D floor homography.
    """
    raise ValueError(
        f"Direct court homography projection is forbidden for shuttlecock tracking: {reason}. "
        "Court homography assumes points lie on the ground plane (Z=0). Airborne shuttlecock coordinates "
        "must be evaluated in image space (xPx, yPx)."
    )
