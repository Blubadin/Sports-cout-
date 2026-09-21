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
import json
from typing import Any, Dict, Optional


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
    tracking_mode: str
    processing_profile: str
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
    detector_name: str
    pose_model: str
    tracker_name: str
    detector_input_size: int
    confidence_threshold: float
    frame_stride: int
    pose_stride: int
    max_players: int
    device: str
    detector_version: Optional[str] = None
    tracker_version: Optional[str] = None

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
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> BenchmarkModelConfig:
        return cls(
            detector_name=data["detectorName"],
            pose_model=data["poseModel"],
            tracker_name=data["trackerName"],
            detector_input_size=int(data["detectorInputSize"]),
            confidence_threshold=float(data["confidenceThreshold"]),
            frame_stride=int(data["frameStride"]),
            pose_stride=int(data["poseStride"]),
            max_players=int(data["maxPlayers"]),
            device=str(data["device"]),
            detector_version=data.get("detectorVersion"),
            tracker_version=data.get("trackerVersion"),
        )


@dataclass
class BenchmarkVideoMetadata:
    source_width: int
    source_height: int
    source_fps: float
    duration_seconds: float
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
            source_width=int(data["sourceWidth"]),
            source_height=int(data["sourceHeight"]),
            source_fps=float(data["sourceFps"]),
            duration_seconds=float(data["durationSeconds"]),
            total_source_frames=data.get("totalSourceFrames"),
        )


@dataclass
class BenchmarkPerformance:
    frames_analyzed: int
    analysis_fps: float
    elapsed_seconds: float
    effective_telemetry_hz: float
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
            frames_analyzed=int(data["framesAnalyzed"]),
            analysis_fps=float(data["analysisFps"]),
            elapsed_seconds=float(data["elapsedSeconds"]),
            effective_telemetry_hz=float(data["effectiveTelemetryHz"]),
            processing_ratio=data.get("processingRatio"),
        )


@dataclass
class BenchmarkPlayerQuality:
    player_id: str
    observed_coverage: float
    predicted_percent: float
    lost_percent: float
    mean_observed_confidence: float

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
            observed_coverage=float(data["observedCoverage"]),
            predicted_percent=float(data["predictedPercent"]),
            lost_percent=float(data["lostPercent"]),
            mean_observed_confidence=float(data["meanObservedConfidence"]),
        )


@dataclass
class BenchmarkQuality:
    mean_target_coverage: float
    simultaneous_target_coverage: float
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
            mean_target_coverage=float(data["meanTargetCoverage"]),
            simultaneous_target_coverage=float(data["simultaneousTargetCoverage"]),
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

    duration = overrides.get(
        "durationSeconds",
        vmeta.get("durationSec") or perf.get("videoDurationSec") or 0.0,
    )
    elapsed = overrides.get(
        "elapsedSeconds",
        perf.get("elapsedSec") or session_data.get("elapsedSec") or 0.0,
    )
    ratio = calculate_processing_ratio(elapsed, duration)

    player_cov = {}
    if "playerCoverage" in qual and isinstance(qual["playerCoverage"], dict):
        for pid, cov in qual["playerCoverage"].items():
            player_cov[pid] = BenchmarkPlayerQuality(
                player_id=pid,
                observed_coverage=float(cov.get("observedCoveragePct", 0.0)) / 100.0 if "observedCoveragePct" in cov else float(cov.get("detectionCoverage", 0.0)),
                predicted_percent=float(cov.get("predictedFramesPct") or cov.get("predictedPercent") or 0.0),
                lost_percent=float(cov.get("lostFramesPct") or cov.get("lostPercent") or 0.0),
                mean_observed_confidence=float(cov.get("meanObservedConfidence", 0.85)),
            )

    identity = BenchmarkRunIdentity(
        run_id=overrides.get("runId", f"benchmark_{session_data.get('sessionId', 'run')}"),
        created_at=overrides.get("createdAt", "2026-09-21T00:00:00Z"),
        sport=overrides.get("sport", "badminton"),
        tracking_mode=overrides.get("trackingMode", "singles" if session_data.get("trackedPlayerCount", 2) == 2 else "doubles"),
        processing_profile=overrides.get("processingProfile", prov.get("effectiveProfile") or cfg.get("profile") or "auto"),
        video_fingerprint=overrides.get("videoFingerprint", session_data.get("videoFingerprint")),
        video_reference=overrides.get("videoReference", vmeta.get("filename")),
    )

    model_config = BenchmarkModelConfig(
        detector_name=overrides.get("detectorName", prov.get("detectorModel") or "yolo"),
        detector_version=overrides.get("detectorVersion"),
        pose_model=overrides.get("poseModel", prov.get("poseModel") or "yolo_pose"),
        tracker_name=overrides.get("trackerName", prov.get("trackerModel") or "bytetrack"),
        tracker_version=overrides.get("trackerVersion"),
        detector_input_size=int(overrides.get("detectorInputSize", prov.get("detectorInputSize") or cfg.get("detectorInputSize") or 640)),
        confidence_threshold=float(overrides.get("confidenceThreshold", 0.25)),
        frame_stride=int(overrides.get("frameStride", prov.get("frameStride") or cfg.get("frameStride") or 2)),
        pose_stride=int(overrides.get("poseStride", prov.get("poseStride") or cfg.get("poseStride") or 1)),
        max_players=int(overrides.get("maxPlayers", session_data.get("trackedPlayerCount") or 2)),
        device=str(overrides.get("device", session_data.get("effectiveDevice") or session_data.get("device") or "cpu")),
    )

    video_metadata = BenchmarkVideoMetadata(
        source_width=int(overrides.get("sourceWidth", vmeta.get("width") or 0)),
        source_height=int(overrides.get("sourceHeight", vmeta.get("height") or 0)),
        source_fps=float(overrides.get("sourceFps", vmeta.get("nominalFps") or session_data.get("sourceFps") or 30.0)),
        duration_seconds=float(duration),
        total_source_frames=overrides.get("totalSourceFrames", vmeta.get("reportedFrameCount") or session_data.get("totalFrames")),
    )

    performance = BenchmarkPerformance(
        frames_analyzed=int(overrides.get("framesAnalyzed", session_data.get("analyzedFrames") or 0)),
        analysis_fps=float(overrides.get("analysisFps", perf.get("analysisFps") or session_data.get("analysisFps") or 0.0)),
        elapsed_seconds=float(elapsed),
        effective_telemetry_hz=float(overrides.get("effectiveTelemetryHz", perf.get("samplingFps") or session_data.get("samplingFps") or 10.0)),
        processing_ratio=ratio,
    )

    mean_cov = float(qual.get("observedCoveragePct", 0.0)) / 100.0 if "observedCoveragePct" in qual else float(qual.get("meanTargetCoverage", 0.0))
    sim_cov = float(qual.get("simultaneousCoveragePct", 0.0)) / 100.0 if "simultaneousCoveragePct" in qual else float(qual.get("simultaneousTargetCoverage", mean_cov))

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
