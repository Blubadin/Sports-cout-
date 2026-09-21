"""
ai_service/benchmark_schema.py — Tracking Benchmark Foundation Schema

Provides a standardized, vendor-neutral, and reusable benchmark representation
for tracking experiments across different model architectures (YOLOv8, YOLO11, YOLO26),
trackers (ByteTrack, Norfair, OC-SORT, custom), resolutions, strides, and execution runtimes.

Rules:
- ByteTrack is the baseline configuration only; future trackers fit without changing the schema.
- Missing / unmeasured values MUST remain None (never fabricate fake zeros).
- Measured zero (0, 0.0) is strictly distinct from None (unknown/unmeasured).
"""

from __future__ import annotations
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
import json
import math
from typing import Any, Dict, Optional


def _first_not_none(*values: Any) -> Any:
    return next((value for value in values if value is not None), None)


def _optional_float(value: Any) -> float | None:
    if value is None:
        return None
    try:
        result = float(value)
    except (TypeError, ValueError):
        return None
    return result if math.isfinite(result) else None


def _optional_int(value: Any) -> int | None:
    number = _optional_float(value)
    return int(number) if number is not None else None


def _positive_float(value: Any) -> float | None:
    number = _optional_float(value)
    return number if number is not None and number > 0 else None


def _positive_int(value: Any) -> int | None:
    number = _optional_int(value)
    return number if number is not None and number > 0 else None


def calculate_processing_ratio(
    elapsed_seconds: float | None,
    duration_seconds: float | None,
) -> float | None:
    """
    Computes processing ratio:
    processing_ratio = elapsed_seconds / duration_seconds

    Example:
    60-minute video (3600s) processed in 30 real minutes (1800s)
    processing_ratio = 1800 / 3600 = 0.5 (< 1.0 indicates faster than real-time).

    Returns None if duration_seconds <= 0 or if either value is invalid/None.
    Does not fabricate unavailable values.
    """
    if (
        elapsed_seconds is None
        or duration_seconds is None
        or not math.isfinite(elapsed_seconds)
        or not math.isfinite(duration_seconds)
        or duration_seconds <= 0
        or elapsed_seconds < 0
    ):
        return None
    return round(float(elapsed_seconds) / float(duration_seconds), 6)


@dataclass
class BenchmarkRunIdentity:
    run_id: str
    created_at: str
    sport: str
    tracking_mode: Optional[str]
    processing_profile: Optional[str]
    video_fingerprint: Optional[str] = None
    video_reference: Optional[str] = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "runId": self.run_id,
            "createdAt": self.created_at,
            "sport": self.sport,
            "videoFingerprint": self.video_fingerprint,
            "videoReference": self.video_reference,
            "trackingMode": self.tracking_mode,
            "processingProfile": self.processing_profile,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> BenchmarkRunIdentity:
        return cls(
            run_id=data["runId"],
            created_at=data["createdAt"],
            sport=data["sport"],
            tracking_mode=data["trackingMode"],
            processing_profile=data["processingProfile"],
            video_fingerprint=data.get("videoFingerprint"),
            video_reference=data.get("videoReference"),
        )


@dataclass
class BenchmarkModelConfig:
    detector_name: Optional[str]
    pose_model: Optional[str]
    tracker_name: Optional[str]
    detector_input_size: Optional[int]
    confidence_threshold: Optional[float]
    frame_stride: Optional[int]
    pose_stride: Optional[int]
    max_players: Optional[int]
    device: Optional[str]
    detector_version: Optional[str] = None
    tracker_version: Optional[str] = None
    runtime: Optional[str] = None
    precision: Optional[str] = None
    court_roi_enabled: Optional[bool] = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "detectorName": self.detector_name,
            "detectorVersion": self.detector_version,
            "poseModel": self.pose_model,
            "trackerName": self.tracker_name,
            "trackerVersion": self.tracker_version,
            "detectorInputSize": self.detector_input_size,
            "confidenceThreshold": self.confidence_threshold,
            "frameStride": self.frame_stride,
            "poseStride": self.pose_stride,
            "maxPlayers": self.max_players,
            "device": self.device,
            "runtime": self.runtime,
            "precision": self.precision,
            "courtRoiEnabled": self.court_roi_enabled,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> BenchmarkModelConfig:
        return cls(
            detector_name=data.get("detectorName"),
            pose_model=data.get("poseModel"),
            tracker_name=data.get("trackerName"),
            detector_input_size=_positive_int(data.get("detectorInputSize")),
            confidence_threshold=_optional_float(data.get("confidenceThreshold")),
            frame_stride=_positive_int(data.get("frameStride")),
            pose_stride=_positive_int(data.get("poseStride")),
            max_players=_positive_int(data.get("maxPlayers")),
            device=data.get("device"),
            detector_version=data.get("detectorVersion"),
            tracker_version=data.get("trackerVersion"),
            runtime=data.get("runtime"),
            precision=data.get("precision"),
            court_roi_enabled=data.get("courtRoiEnabled") if isinstance(data.get("courtRoiEnabled"), bool) else None,
        )


@dataclass
class BenchmarkVideoMetadata:
    source_width: Optional[int]
    source_height: Optional[int]
    source_fps: Optional[float]
    duration_seconds: Optional[float]
    total_source_frames: Optional[int] = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "sourceWidth": self.source_width,
            "sourceHeight": self.source_height,
            "sourceFps": self.source_fps,
            "durationSeconds": self.duration_seconds,
            "totalSourceFrames": self.total_source_frames,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> BenchmarkVideoMetadata:
        return cls(
            source_width=_positive_int(data.get("sourceWidth")),
            source_height=_positive_int(data.get("sourceHeight")),
            source_fps=_positive_float(data.get("sourceFps")),
            duration_seconds=_positive_float(data.get("durationSeconds")),
            total_source_frames=data.get("totalSourceFrames"),
        )


@dataclass
class BenchmarkPerformance:
    frames_analyzed: Optional[int]
    analysis_fps: Optional[float]
    elapsed_seconds: Optional[float]
    effective_telemetry_hz: Optional[float]
    processing_ratio: Optional[float]

    def to_dict(self) -> dict[str, Any]:
        return {
            "framesAnalyzed": self.frames_analyzed,
            "analysisFps": self.analysis_fps,
            "elapsedSeconds": self.elapsed_seconds,
            "effectiveTelemetryHz": self.effective_telemetry_hz,
            "processingRatio": self.processing_ratio,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> BenchmarkPerformance:
        return cls(
            frames_analyzed=_optional_int(data.get("framesAnalyzed")),
            analysis_fps=_optional_float(data.get("analysisFps")),
            elapsed_seconds=_optional_float(data.get("elapsedSeconds")),
            effective_telemetry_hz=_positive_float(data.get("effectiveTelemetryHz")),
            processing_ratio=data.get("processingRatio"),
        )


@dataclass
class BenchmarkPlayerQuality:
    player_id: str
    observed_coverage: Optional[float]
    predicted_percent: Optional[float]
    lost_percent: Optional[float]
    mean_observed_confidence: Optional[float]

    def to_dict(self) -> dict[str, Any]:
        return {
            "playerId": self.player_id,
            "observedCoverage": self.observed_coverage,
            "predictedPercent": self.predicted_percent,
            "lostPercent": self.lost_percent,
            "meanObservedConfidence": self.mean_observed_confidence,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> BenchmarkPlayerQuality:
        return cls(
            player_id=data["playerId"],
            observed_coverage=_optional_float(data.get("observedCoverage")),
            predicted_percent=_optional_float(data.get("predictedPercent")),
            lost_percent=_optional_float(data.get("lostPercent")),
            mean_observed_confidence=_optional_float(data.get("meanObservedConfidence")),
        )


@dataclass
class BenchmarkQuality:
    mean_target_coverage: Optional[float]
    simultaneous_target_coverage: Optional[float]
    player_coverage: dict[str, BenchmarkPlayerQuality] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "meanTargetCoverage": self.mean_target_coverage,
            "simultaneousTargetCoverage": self.simultaneous_target_coverage,
            "playerCoverage": {
                k: v.to_dict() for k, v in self.player_coverage.items()
            },
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> BenchmarkQuality:
        pc = {}
        if "playerCoverage" in data and isinstance(data["playerCoverage"], dict):
            for k, v in data["playerCoverage"].items():
                pc[k] = BenchmarkPlayerQuality.from_dict(v)
        return cls(
            mean_target_coverage=_optional_float(data.get("meanTargetCoverage")),
            simultaneous_target_coverage=_optional_float(data.get("simultaneousTargetCoverage")),
            player_coverage=pc,
        )


@dataclass
class BenchmarkIdentityAudit:
    id_switch_count: Optional[int] = None
    manual_correction_count: Optional[int] = None
    identity_continuity: Optional[float] = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "idSwitchCount": self.id_switch_count,
            "manualCorrectionCount": self.manual_correction_count,
            "identityContinuity": self.identity_continuity,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> BenchmarkIdentityAudit:
        return cls(
            id_switch_count=data.get("idSwitchCount"),
            manual_correction_count=data.get("manualCorrectionCount"),
            identity_continuity=data.get("identityContinuity"),
        )


@dataclass
class BenchmarkGroundTruth:
    mean_court_position_error: Optional[float] = None
    median_court_position_error: Optional[float] = None
    p95_court_position_error: Optional[float] = None
    distance_error: Optional[float] = None
    identity_accuracy: Optional[float] = None
    identity_continuity: Optional[float] = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "meanCourtPositionError": self.mean_court_position_error,
            "medianCourtPositionError": self.median_court_position_error,
            "p95CourtPositionError": self.p95_court_position_error,
            "distanceError": self.distance_error,
            "identityAccuracy": self.identity_accuracy,
            "identityContinuity": self.identity_continuity,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> BenchmarkGroundTruth:
        return cls(
            mean_court_position_error=data.get("meanCourtPositionError"),
            median_court_position_error=data.get("medianCourtPositionError"),
            p95_court_position_error=data.get("p95CourtPositionError"),
            distance_error=data.get("distanceError"),
            identity_accuracy=data.get("identityAccuracy"),
            identity_continuity=data.get("identityContinuity"),
        )


@dataclass
class TrackingBenchmarkRun:
    identity: BenchmarkRunIdentity
    model_config: BenchmarkModelConfig
    video_metadata: BenchmarkVideoMetadata
    performance: BenchmarkPerformance
    quality: BenchmarkQuality
    identity_audit: Optional[BenchmarkIdentityAudit] = None
    ground_truth: Optional[BenchmarkGroundTruth] = None

    def to_dict(self) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "identity": self.identity.to_dict(),
            "modelConfig": self.model_config.to_dict(),
            "videoMetadata": self.video_metadata.to_dict(),
            "performance": self.performance.to_dict(),
            "quality": self.quality.to_dict(),
        }
        if self.identity_audit is not None:
            payload["identityAudit"] = self.identity_audit.to_dict()
        if self.ground_truth is not None:
            payload["groundTruth"] = self.ground_truth.to_dict()
        return payload

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> TrackingBenchmarkRun:
        identity = BenchmarkRunIdentity.from_dict(data["identity"])
        model_config = BenchmarkModelConfig.from_dict(data["modelConfig"])
        video_metadata = BenchmarkVideoMetadata.from_dict(data["videoMetadata"])
        performance = BenchmarkPerformance.from_dict(data["performance"])
        quality = BenchmarkQuality.from_dict(data["quality"])

        identity_audit = None
        if "identityAudit" in data and data["identityAudit"] is not None:
            identity_audit = BenchmarkIdentityAudit.from_dict(data["identityAudit"])

        ground_truth = None
        if "groundTruth" in data and data["groundTruth"] is not None:
            ground_truth = BenchmarkGroundTruth.from_dict(data["groundTruth"])

        return cls(
            identity=identity,
            model_config=model_config,
            video_metadata=video_metadata,
            performance=performance,
            quality=quality,
            identity_audit=identity_audit,
            ground_truth=ground_truth,
        )


def serialize_benchmark_run(run: TrackingBenchmarkRun) -> str:
    """Serializes a TrackingBenchmarkRun instance into a formatted JSON string."""
    return json.dumps(run.to_dict(), indent=2)


def deserialize_benchmark_run(json_str: str) -> TrackingBenchmarkRun:
    """Deserializes a JSON string into a TrackingBenchmarkRun instance."""
    data = json.loads(json_str)
    return TrackingBenchmarkRun.from_dict(data)


def create_benchmark_run_from_session_dict(
    session_data: dict[str, Any],
    overrides: Optional[dict[str, Any]] = None,
) -> TrackingBenchmarkRun:
    """
    Adapter: Constructs a standardized TrackingBenchmarkRun from an existing session
    status or results dictionary produced by the AI service / server.
    """
    overrides = overrides or {}
    prov = session_data.get("runtimeProvenance") or session_data.get("provenance") or {}
    perf = session_data.get("performance") or {}
    qual = session_data.get("quality") or {}
    vmeta = session_data.get("videoMetadata") or {}
    cfg = session_data.get("processingConfig") or {}

    duration = (
        overrides["durationSeconds"]
        if "durationSeconds" in overrides
        else _first_not_none(vmeta.get("durationSec"), perf.get("videoDurationSec"))
    )
    duration = _positive_float(duration)
    elapsed = (
        overrides["elapsedSeconds"]
        if "elapsedSeconds" in overrides
        else _first_not_none(perf.get("elapsedSec"), session_data.get("elapsedSec"))
    )
    elapsed = _optional_float(elapsed)
    ratio = calculate_processing_ratio(elapsed, duration)

    player_cov = {}
    if "playerCoverage" in qual and isinstance(qual["playerCoverage"], dict):
        for pid, cov in qual["playerCoverage"].items():
            player_cov[pid] = BenchmarkPlayerQuality(
                player_id=pid,
                observed_coverage=(
                    _optional_float(cov.get("observedCoveragePct")) / 100.0
                    if _optional_float(cov.get("observedCoveragePct")) is not None
                    else _optional_float(cov.get("detectionCoverage"))
                ),
                predicted_percent=_optional_float(
                    _first_not_none(cov.get("predictedFramesPct"), cov.get("predictedPercent"))
                ),
                lost_percent=_optional_float(
                    _first_not_none(cov.get("lostFramesPct"), cov.get("lostPercent"))
                ),
                mean_observed_confidence=_optional_float(cov.get("meanObservedConfidence")),
            )

    tracked_player_count = _positive_int(session_data.get("trackedPlayerCount"))
    tracking_mode = (
        "doubles"
        if tracked_player_count == 4
        else "singles"
        if tracked_player_count in (1, 2)
        else None
    )

    identity = BenchmarkRunIdentity(
        run_id=overrides.get("runId", f"benchmark_{session_data.get('sessionId', 'run')}"),
        created_at=overrides.get("createdAt", datetime.now(timezone.utc).isoformat()),
        sport=overrides.get("sport", "badminton"),
        tracking_mode=overrides.get("trackingMode", tracking_mode),
        processing_profile=overrides.get(
            "processingProfile",
            _first_not_none(prov.get("effectiveProfile"), cfg.get("profile")),
        ),
        video_fingerprint=overrides.get("videoFingerprint", session_data.get("videoFingerprint")),
        video_reference=overrides.get("videoReference", vmeta.get("filename")),
    )

    model_config = BenchmarkModelConfig(
        detector_name=overrides.get("detectorName", prov.get("detectorModel")),
        detector_version=overrides.get("detectorVersion"),
        pose_model=overrides.get("poseModel", prov.get("poseModel")),
        tracker_name=overrides.get("trackerName", prov.get("trackerModel")),
        tracker_version=overrides.get("trackerVersion"),
        detector_input_size=_positive_int(overrides.get(
            "detectorInputSize",
            _first_not_none(prov.get("detectorInputSize"), cfg.get("detectorInputSize")),
        )),
        confidence_threshold=_optional_float(overrides.get("confidenceThreshold")),
        frame_stride=_positive_int(overrides.get(
            "frameStride",
            _first_not_none(prov.get("frameStride"), cfg.get("frameStride")),
        )),
        pose_stride=_positive_int(overrides.get(
            "poseStride",
            _first_not_none(prov.get("poseStride"), cfg.get("poseStride")),
        )),
        max_players=_positive_int(overrides.get("maxPlayers", tracked_player_count)),
        device=overrides.get(
            "device",
            _first_not_none(session_data.get("effectiveDevice"), session_data.get("device")),
        ),
    )

    video_metadata = BenchmarkVideoMetadata(
        source_width=_positive_int(overrides.get("sourceWidth", vmeta.get("width"))),
        source_height=_positive_int(overrides.get("sourceHeight", vmeta.get("height"))),
        source_fps=_positive_float(overrides.get(
            "sourceFps",
            _first_not_none(vmeta.get("nominalFps"), session_data.get("sourceFps")),
        )),
        duration_seconds=duration,
        total_source_frames=_optional_int(overrides.get(
            "totalSourceFrames",
            _first_not_none(vmeta.get("reportedFrameCount"), session_data.get("totalFrames")),
        )),
    )

    performance = BenchmarkPerformance(
        frames_analyzed=_optional_int(overrides.get("framesAnalyzed", session_data.get("analyzedFrames"))),
        analysis_fps=_optional_float(overrides.get(
            "analysisFps",
            _first_not_none(perf.get("analysisFps"), session_data.get("analysisFps")),
        )),
        elapsed_seconds=elapsed,
        effective_telemetry_hz=_positive_float(overrides.get(
            "effectiveTelemetryHz",
            _first_not_none(perf.get("effectiveTelemetryHz"), session_data.get("effectiveTelemetryHz")),
        )),
        processing_ratio=ratio,
    )

    observed_coverage_pct = _optional_float(qual.get("observedCoveragePct"))
    mean_cov = (
        observed_coverage_pct / 100.0
        if observed_coverage_pct is not None
        else _optional_float(qual.get("meanTargetCoverage"))
    )
    simultaneous_coverage_pct = _optional_float(qual.get("simultaneousCoveragePct"))
    sim_cov = (
        simultaneous_coverage_pct / 100.0
        if simultaneous_coverage_pct is not None
        else _optional_float(qual.get("simultaneousTargetCoverage"))
    )

    quality = BenchmarkQuality(
        mean_target_coverage=mean_cov,
        simultaneous_target_coverage=sim_cov,
        player_coverage=player_cov,
    )

    identity_audit = None
    if overrides.get("identityAudit") is not None:
        identity_audit = overrides["identityAudit"]
    elif qual.get("idSwitchCount") is not None or qual.get("manualCorrectionCount") is not None:
        identity_audit = BenchmarkIdentityAudit(
            id_switch_count=qual.get("idSwitchCount"),
            manual_correction_count=qual.get("manualCorrectionCount"),
            identity_continuity=qual.get("identityContinuity"),
        )

    ground_truth = overrides.get("groundTruth")

    return TrackingBenchmarkRun(
        identity=identity,
        model_config=model_config,
        video_metadata=video_metadata,
        performance=performance,
        quality=quality,
        identity_audit=identity_audit,
        ground_truth=ground_truth,
    )


# ============================================================================
# Phase 1.0 — Vision Benchmark Protocol Classes & Helpers
# ============================================================================

import re


def _sanitize_slug(val: str) -> str:
    return re.sub(r"[^a-zA-Z0-9_-]", "_", val).lower()


def generate_benchmark_run_id(
    clip_id: str,
    experiment_id: Optional[str] = None,
    detector: Optional[str] = None,
    tracker: Optional[str] = None,
    input_size: Optional[int] = None,
    device: Optional[str] = None,
    runtime: Optional[str] = None,
    precision: Optional[str] = None,
    timestamp: Optional[str] = None,
) -> str:
    """
    Generates a deterministic, structured benchmark run identifier.
    Ensures every result is unambiguously traceable to:
    video ID + experiment configuration + model configuration + runtime/device.

    Forbids unstructured names like 'test1', 'test2', 'best', 'final2'.
    """
    clip = _sanitize_slug(clip_id or "unknown_clip")

    if experiment_id and experiment_id.strip():
        config_slug = _sanitize_slug(experiment_id.strip())
    else:
        parts = [
            _sanitize_slug(detector) if detector else "det",
            _sanitize_slug(tracker) if tracker else "trk",
            f"{input_size}px" if input_size else "defsize",
            _sanitize_slug(device) if device else "cpu",
        ]
        if runtime:
            parts.append(_sanitize_slug(runtime))
        if precision:
            parts.append(_sanitize_slug(precision))
        config_slug = "_".join(parts)

    if timestamp:
        cleaned_time = re.sub(r"[-:]", "", timestamp)
        cleaned_time = re.sub(r"\..+", "Z", cleaned_time)
        if not cleaned_time.endswith("Z"):
            cleaned_time += "Z"
        time_str = cleaned_time
    else:
        time_str = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")

    return f"RUN__{clip}__{config_slug}__{time_str}"


@dataclass
class BenchmarkDifficultSegment:
    start_sec: float
    end_sec: float
    tags: list[str] = field(default_factory=list)
    description: Optional[str] = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "startSec": self.start_sec,
            "endSec": self.end_sec,
            "tags": list(self.tags),
            "description": self.description,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> BenchmarkDifficultSegment:
        start = _optional_float(data.get("startSec")) or 0.0
        end = _optional_float(data.get("endSec")) or start
        tags = data.get("tags") if isinstance(data.get("tags"), list) else []
        return cls(
            start_sec=start,
            end_sec=end,
            tags=[str(t) for t in tags],
            description=data.get("description"),
        )


@dataclass
class BenchmarkClipEntry:
    id: str
    name: str
    sport: str
    game_type: str
    player_count: int
    camera_type: str
    camera_motion: str
    difficulty_tags: list[str] = field(default_factory=list)
    ground_truth_available: bool = False
    video_reference: Optional[str] = None
    duration_sec: Optional[float] = None
    source_width: Optional[int] = None
    source_height: Optional[int] = None
    source_fps: Optional[float] = None
    court_calibration_reference: Optional[str] = None
    notes: Optional[str] = None
    known_difficult_segments: list[BenchmarkDifficultSegment] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "name": self.name,
            "sport": self.sport,
            "gameType": self.game_type,
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
            "knownDifficultSegments": [s.to_dict() for s in self.known_difficult_segments],
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> BenchmarkClipEntry:
        segments_raw = data.get("knownDifficultSegments") or []
        segments = [
            BenchmarkDifficultSegment.from_dict(s)
            for s in segments_raw
            if isinstance(s, dict)
        ]
        tags = data.get("difficultyTags") if isinstance(data.get("difficultyTags"), list) else []
        return cls(
            id=data["id"],
            name=data["name"],
            sport=data.get("sport", "badminton"),
            game_type=data.get("gameType", "singles"),
            player_count=_positive_int(data.get("playerCount")) or 2,
            video_reference=data.get("videoReference"),
            duration_sec=_positive_float(data.get("durationSec")),
            source_width=_positive_int(data.get("sourceWidth")),
            source_height=_positive_int(data.get("sourceHeight")),
            source_fps=_positive_float(data.get("sourceFps")),
            camera_type=data.get("cameraType", "static_rear"),
            camera_motion=data.get("cameraMotion", "static"),
            difficulty_tags=[str(t) for t in tags],
            court_calibration_reference=data.get("courtCalibrationReference"),
            ground_truth_available=data.get("groundTruthAvailable") is True,
            notes=data.get("notes"),
            known_difficult_segments=segments,
        )


@dataclass
class BenchmarkManifest:
    schema_version: int
    manifest_id: str
    updated_at: str
    clips: list[BenchmarkClipEntry] = field(default_factory=list)
    description: Optional[str] = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "schemaVersion": self.schema_version,
            "manifestId": self.manifest_id,
            "updatedAt": self.updated_at,
            "description": self.description,
            "clips": [c.to_dict() for c in self.clips],
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> BenchmarkManifest:
        clips_raw = data.get("clips") or []
        clips = [
            BenchmarkClipEntry.from_dict(c)
            for c in clips_raw
            if isinstance(c, dict)
        ]
        return cls(
            schema_version=_positive_int(data.get("schemaVersion")) or 1,
            manifest_id=data.get("manifestId", "unknown_manifest"),
            updated_at=data.get("updatedAt", datetime.now(timezone.utc).isoformat()),
            description=data.get("description"),
            clips=clips,
        )

    def get_clip(self, clip_id: str) -> Optional[BenchmarkClipEntry]:
        for c in self.clips:
            if c.id == clip_id:
                return c
        return None

    def filter_by_difficulty(self, tag: str) -> list[BenchmarkClipEntry]:
        lower_tag = tag.lower()
        return [c for c in self.clips if any(t.lower() == lower_tag for t in c.difficulty_tags)]

    def filter_by_game_type(self, game_type: str) -> list[BenchmarkClipEntry]:
        lower_type = game_type.lower()
        return [c for c in self.clips if c.game_type.lower() == lower_type]


@dataclass
class VisionBenchmarkExperimentConfig:
    experiment_id: str
    name: str
    detector: str
    tracker: str
    runtime: str
    input_size: int
    confidence_threshold: float
    frame_stride: int
    pose_stride: int
    court_roi_enabled: bool
    device: str
    precision: str
    detector_version: Optional[str] = None
    pose_model: Optional[str] = None
    tracker_version: Optional[str] = None
    processing_profile: Optional[str] = None
    notes: Optional[str] = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "experimentId": self.experiment_id,
            "name": self.name,
            "detector": self.detector,
            "detectorVersion": self.detector_version,
            "poseModel": self.pose_model,
            "tracker": self.tracker,
            "trackerVersion": self.tracker_version,
            "runtime": self.runtime,
            "inputSize": self.input_size,
            "confidenceThreshold": self.confidence_threshold,
            "frameStride": self.frame_stride,
            "poseStride": self.pose_stride,
            "courtRoiEnabled": self.court_roi_enabled,
            "device": self.device,
            "precision": self.precision,
            "processingProfile": self.processing_profile,
            "notes": self.notes,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> VisionBenchmarkExperimentConfig:
        return cls(
            experiment_id=data["experimentId"],
            name=data.get("name", data["experimentId"]),
            detector=data["detector"],
            detector_version=data.get("detectorVersion"),
            pose_model=data.get("poseModel"),
            tracker=data["tracker"],
            tracker_version=data.get("trackerVersion"),
            runtime=data.get("runtime", "pytorch"),
            input_size=_positive_int(data.get("inputSize")) or 640,
            confidence_threshold=_optional_float(data.get("confidenceThreshold")) or 0.25,
            frame_stride=_positive_int(data.get("frameStride")) or 2,
            pose_stride=_positive_int(data.get("poseStride")) or 1,
            court_roi_enabled=data.get("courtRoiEnabled") is True,
            device=data.get("device", "cpu"),
            precision=data.get("precision", "fp32"),
            processing_profile=data.get("processingProfile"),
            notes=data.get("notes"),
        )

    def to_model_config(self) -> BenchmarkModelConfig:
        return BenchmarkModelConfig(
            detector_name=self.detector,
            detector_version=self.detector_version,
            pose_model=self.pose_model,
            tracker_name=self.tracker,
            tracker_version=self.tracker_version,
            detector_input_size=self.input_size,
            confidence_threshold=self.confidence_threshold,
            frame_stride=self.frame_stride,
            pose_stride=self.pose_stride,
            max_players=None,
            device=self.device,
            runtime=self.runtime,
            precision=self.precision,
            court_roi_enabled=self.court_roi_enabled,
        )

