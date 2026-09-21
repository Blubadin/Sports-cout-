"""SportsScout Phase 1.3 local detector benchmark matrix runner.

The runner never downloads models or copies videos. It records every attempted
clip/configuration pair and keeps unavailable inputs distinct from inference
failures. Missing measurements remain ``None`` throughout JSON persistence.
"""

from __future__ import annotations

from dataclasses import dataclass, field, replace
from datetime import datetime, timezone
import argparse
import csv
import json
import math
import os
from pathlib import Path
import tempfile
import time
from typing import Any, Callable, Literal
import uuid

try:
    from .benchmark_schema import (
        BenchmarkClipEntry,
        BenchmarkIdentityFailureExample,
        BenchmarkManifest,
        generate_benchmark_run_id,
    )
    from .model_registry import get_candidate
    from .tracker_candidates import get_baseline_tracker_candidate, get_tracker_candidate
except ImportError:  # Direct script execution from ai_service/.
    from benchmark_schema import (
        BenchmarkClipEntry,
        BenchmarkIdentityFailureExample,
        BenchmarkManifest,
        generate_benchmark_run_id,
    )
    from model_registry import get_candidate
    from tracker_candidates import get_baseline_tracker_candidate, get_tracker_candidate


RunStatus = Literal["SUCCESS", "FAILED", "UNAVAILABLE"]


def _utc_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%fZ")


def _new_run_group_id() -> str:
    return uuid.uuid4().hex[:12]


@dataclass(frozen=True)
class BenchmarkCommonConfig:
    tracker: str = "bytetrack"
    tracker_config: str | None = None
    reid_enabled: bool = False
    reid_model: str | None = None
    pose_model: str | None = "yolov8n-pose.pt"
    pose_architecture: str = "roi_pose"
    runtime: str = "pytorch"
    precision: str = "fp32"
    model_artifact_reference: str | None = None
    device: str = "cpu"
    frame_stride: int = 1
    pose_stride: int = 1
    confidence_threshold: float = 0.35
    court_roi_enabled: bool = False


@dataclass(frozen=True)
class BenchmarkRunConfig:
    config_id: str
    candidate_id: str
    detector: str
    detector_family: str
    input_size: int
    tracker: str
    tracker_config: str | None
    reid_enabled: bool
    reid_model: str | None
    pose_model: str | None
    pose_architecture: str
    runtime: str
    precision: str
    device: str
    frame_stride: int
    pose_stride: int
    confidence_threshold: float
    court_roi_enabled: bool
    model_artifact_reference: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "configId": self.config_id,
            "candidateId": self.candidate_id,
            "detector": self.detector,
            "detectorFamily": self.detector_family,
            "inputSize": self.input_size,
            "tracker": self.tracker,
            "trackerConfig": self.tracker_config,
            "reidEnabled": self.reid_enabled,
            "reidModel": self.reid_model,
            "poseModel": self.pose_model,
            "poseArchitecture": self.pose_architecture,
            "runtime": self.runtime,
            "precision": self.precision,
            "modelArtifactReference": self.model_artifact_reference,
            "device": self.device,
            "frameStride": self.frame_stride,
            "poseStride": self.pose_stride,
            "confidenceThreshold": self.confidence_threshold,
            "courtRoiEnabled": self.court_roi_enabled,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "BenchmarkRunConfig":
        return cls(
            config_id=data["configId"],
            candidate_id=data["candidateId"],
            detector=data["detector"],
            detector_family=data["detectorFamily"],
            input_size=int(data["inputSize"]),
            tracker=data["tracker"],
            tracker_config=data.get("trackerConfig"),
            reid_enabled=data.get("reidEnabled") is True,
            reid_model=data.get("reidModel"),
            pose_model=data.get("poseModel"),
            pose_architecture=data.get("poseArchitecture", "roi_pose"),
            runtime=data["runtime"],
            precision=data["precision"],
            model_artifact_reference=data.get("modelArtifactReference"),
            device=data["device"],
            frame_stride=int(data["frameStride"]),
            pose_stride=int(data["poseStride"]),
            confidence_threshold=float(data["confidenceThreshold"]),
            court_roi_enabled=data["courtRoiEnabled"] is True,
        )


@dataclass
class BenchmarkRunMetrics:
    player_coverage: dict[str, dict[str, float | None]] = field(default_factory=dict)
    mean_target_coverage: float | None = None
    simultaneous_target_coverage: float | None = None
    predicted_percent: float | None = None
    lost_percent: float | None = None
    mean_observed_confidence: float | None = None
    analysis_fps: float | None = None
    elapsed_seconds: float | None = None
    processing_ratio: float | None = None
    effective_telemetry_hz: float | None = None
    peak_vram_mb: float | None = None
    mean_court_position_error: float | None = None
    median_court_position_error: float | None = None
    p95_court_position_error: float | None = None
    distance_error: float | None = None
    identity_accuracy: float | None = None
    identity_continuity: float | None = None
    id_switch_count: int | None = None
    fresh_pose_coverage: float | None = None
    pose_reuse_percent: float | None = None
    pose_unavailable_percent: float | None = None
    pose_inference_calls: int | None = None
    raw_tracker_id_switches: int | None = None
    semantic_player_id_switches: int | None = None
    reacquisition_duration_sec: float | None = None
    failure_examples: list[BenchmarkIdentityFailureExample] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "playerCoverage": self.player_coverage,
            "meanTargetCoverage": self.mean_target_coverage,
            "simultaneousTargetCoverage": self.simultaneous_target_coverage,
            "predictedPercent": self.predicted_percent,
            "lostPercent": self.lost_percent,
            "meanObservedConfidence": self.mean_observed_confidence,
            "analysisFps": self.analysis_fps,
            "elapsedSeconds": self.elapsed_seconds,
            "processingRatio": self.processing_ratio,
            "effectiveTelemetryHz": self.effective_telemetry_hz,
            "freshPoseCoverage": self.fresh_pose_coverage,
            "poseReusePercent": self.pose_reuse_percent,
            "poseUnavailablePercent": self.pose_unavailable_percent,
            "poseInferenceCalls": self.pose_inference_calls,
            "peakVramMb": self.peak_vram_mb,
            "rawTrackerIdSwitches": self.raw_tracker_id_switches,
            "semanticPlayerIdSwitches": self.semantic_player_id_switches,
            "reacquisitionDurationSec": self.reacquisition_duration_sec,
            "failureExamples": [
                ex.to_dict() if hasattr(ex, "to_dict") else ex
                for ex in self.failure_examples
            ],
            "groundTruth": {
                "meanCourtPositionError": self.mean_court_position_error,
                "medianCourtPositionError": self.median_court_position_error,
                "p95CourtPositionError": self.p95_court_position_error,
                "distanceError": self.distance_error,
                "identityAccuracy": self.identity_accuracy,
                "identityContinuity": self.identity_continuity,
                "idSwitchCount": self.id_switch_count,
            },
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any] | None) -> "BenchmarkRunMetrics":
        data = data or {}
        ground_truth = data.get("groundTruth") or {}
        raw_examples = data.get("failureExamples") or []
        examples = [
            BenchmarkIdentityFailureExample.from_dict(ex) if isinstance(ex, dict) else ex
            for ex in raw_examples
        ]
        return cls(
            player_coverage=data.get("playerCoverage") or {},
            mean_target_coverage=data.get("meanTargetCoverage"),
            simultaneous_target_coverage=data.get("simultaneousTargetCoverage"),
            predicted_percent=data.get("predictedPercent"),
            lost_percent=data.get("lostPercent"),
            mean_observed_confidence=data.get("meanObservedConfidence"),
            analysis_fps=data.get("analysisFps"),
            elapsed_seconds=data.get("elapsedSeconds"),
            processing_ratio=data.get("processingRatio"),
            effective_telemetry_hz=data.get("effectiveTelemetryHz"),
            fresh_pose_coverage=data.get("freshPoseCoverage"),
            pose_reuse_percent=data.get("poseReusePercent"),
            pose_unavailable_percent=data.get("poseUnavailablePercent"),
            pose_inference_calls=data.get("poseInferenceCalls"),
            peak_vram_mb=data.get("peakVramMb"),
            raw_tracker_id_switches=data.get("rawTrackerIdSwitches"),
            semantic_player_id_switches=data.get("semanticPlayerIdSwitches"),
            reacquisition_duration_sec=data.get("reacquisitionDurationSec"),
            failure_examples=examples,
            mean_court_position_error=ground_truth.get("meanCourtPositionError"),
            median_court_position_error=ground_truth.get("medianCourtPositionError"),
            p95_court_position_error=ground_truth.get("p95CourtPositionError"),
            distance_error=ground_truth.get("distanceError"),
            identity_accuracy=ground_truth.get("identityAccuracy"),
            identity_continuity=ground_truth.get("identityContinuity"),
            id_switch_count=ground_truth.get("idSwitchCount"),
        )


@dataclass
class BenchmarkAttempt:
    run_id: str
    timestamp: str
    clip_id: str
    video_reference: str | None
    court_calibration_reference: str | None
    ground_truth_available: bool
    status: RunStatus
    config: BenchmarkRunConfig
    metrics: BenchmarkRunMetrics = field(default_factory=BenchmarkRunMetrics)
    failure_stage: str | None = None
    error_summary: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "runId": self.run_id,
            "timestamp": self.timestamp,
            "clipId": self.clip_id,
            "videoReference": self.video_reference,
            "courtCalibrationReference": self.court_calibration_reference,
            "groundTruthAvailable": self.ground_truth_available,
            "status": self.status,
            **self.config.to_dict(),
            "metrics": self.metrics.to_dict(),
            "failureStage": self.failure_stage,
            "errorSummary": self.error_summary,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "BenchmarkAttempt":
        return cls(
            run_id=data["runId"],
            timestamp=data["timestamp"],
            clip_id=data["clipId"],
            video_reference=data.get("videoReference"),
            court_calibration_reference=data.get("courtCalibrationReference"),
            ground_truth_available=data.get("groundTruthAvailable") is True,
            status=data["status"],
            config=BenchmarkRunConfig.from_dict(data),
            metrics=BenchmarkRunMetrics.from_dict(data.get("metrics")),
            failure_stage=data.get("failureStage"),
            error_summary=data.get("errorSummary"),
        )


@dataclass
class BenchmarkBundle:
    manifest_id: str
    run_group_id: str
    created_at: str
    dataset_available: bool
    dataset_status: str
    configurations: list[BenchmarkRunConfig]
    configuration_availability: dict[str, dict[str, Any]]
    selected_clip_ids: list[str]
    results: list[BenchmarkAttempt]
    follow_up_1280: Literal["Yes", "No", "Cannot determine"] = "Cannot determine"

    def to_dict(self) -> dict[str, Any]:
        return {
            "schemaVersion": 1,
            "manifestId": self.manifest_id,
            "runGroupId": self.run_group_id,
            "createdAt": self.created_at,
            "datasetAvailable": self.dataset_available,
            "datasetStatus": self.dataset_status,
            "configurations": [config.to_dict() for config in self.configurations],
            "configurationAvailability": self.configuration_availability,
            "selectedClipIds": self.selected_clip_ids,
            "results": [result.to_dict() for result in self.results],
            "followUp1280": self.follow_up_1280,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "BenchmarkBundle":
        return cls(
            manifest_id=data["manifestId"],
            run_group_id=data.get("runGroupId", "legacy"),
            created_at=data["createdAt"],
            dataset_available=data["datasetAvailable"] is True,
            dataset_status=data["datasetStatus"],
            configurations=[BenchmarkRunConfig.from_dict(item) for item in data.get("configurations", [])],
            configuration_availability=data.get("configurationAvailability") or {},
            selected_clip_ids=list(data.get("selectedClipIds") or []),
            results=[BenchmarkAttempt.from_dict(item) for item in data.get("results", [])],
            follow_up_1280=data.get("followUp1280", "Cannot determine"),
        )


class BenchmarkExecutionError(RuntimeError):
    def __init__(self, stage: str, message: str):
        super().__init__(message)
        self.stage = stage


def build_detector_matrix(common: BenchmarkCommonConfig) -> list[BenchmarkRunConfig]:
    """Build the fixed Phase 1.3 matrix in stable execution order."""
    matrix = [
        ("yolov8n", 640),
        ("yolo11s", 640),
        ("yolo11s", 960),
        ("yolo11m", 640),
        ("yolo11m", 960),
        ("yolo26s", 640),
        ("yolo26s", 960),
        ("yolo26m", 640),
        ("yolo26m", 960),
    ]
    configs = []
    for candidate_id, input_size in matrix:
        candidate = get_candidate(candidate_id)
        configs.append(BenchmarkRunConfig(
            config_id=f"{candidate_id}_{input_size}",
            candidate_id=candidate.id,
            detector=candidate.model_file,
            detector_family=candidate.family,
            input_size=input_size,
            tracker=common.tracker,
            tracker_config=common.tracker_config,
            reid_enabled=common.reid_enabled,
            reid_model=common.reid_model,
            pose_model=common.pose_model,
            pose_architecture=common.pose_architecture,
            runtime=common.runtime,
            precision=common.precision,
            model_artifact_reference=common.model_artifact_reference,
            device=common.device,
            frame_stride=common.frame_stride,
            pose_stride=common.pose_stride,
            confidence_threshold=common.confidence_threshold,
            court_roi_enabled=common.court_roi_enabled,
        ))
    return configs


POSE_PAIR_INVARIANTS = (
    "candidate_id", "detector", "detector_family", "input_size", "tracker", "tracker_config",
    "reid_enabled", "reid_model",
    "runtime", "precision", "model_artifact_reference", "device", "frame_stride", "pose_stride",
    "confidence_threshold", "court_roi_enabled",
)

TRACKER_PAIR_INVARIANTS = (
    "candidate_id", "detector", "detector_family", "input_size",
    "pose_model", "pose_architecture", "runtime", "precision", "model_artifact_reference", "device",
    "frame_stride", "pose_stride", "confidence_threshold", "court_roi_enabled",
)

RUNTIME_PAIR_INVARIANTS = (
    "candidate_id", "detector", "detector_family", "input_size",
    "pose_model", "pose_architecture", "tracker", "tracker_config",
    "reid_enabled", "reid_model", "device", "frame_stride", "pose_stride",
    "confidence_threshold", "court_roi_enabled",
)


def build_tracker_benchmark_config(
    baseline: BenchmarkRunConfig,
    candidate_id: str = "botsort",
) -> tuple[BenchmarkRunConfig, BenchmarkRunConfig]:
    """Create a ByteTrack/candidate pair that differs only in raw MOT settings.

    Semantic identity is deliberately outside this function and remains a
    shared downstream pipeline component for both runs.
    """
    baseline_candidate = get_baseline_tracker_candidate()
    candidate = get_tracker_candidate(candidate_id)
    bytetrack = replace(
        baseline,
        config_id=f"{baseline.config_id}__{baseline_candidate.id}",
        tracker=baseline_candidate.tracker_name,
        tracker_config=baseline_candidate.tracker_config,
        reid_enabled=baseline_candidate.reid_enabled,
        reid_model=baseline_candidate.reid_model,
    )
    tracker_candidate = replace(
        baseline,
        config_id=f"{baseline.config_id}__{candidate.id}",
        tracker=candidate.tracker_name,
        tracker_config=candidate.tracker_config,
        reid_enabled=candidate.reid_enabled,
        reid_model=candidate.reid_model,
    )
    validate_tracker_comparison_pair([bytetrack, tracker_candidate])
    return bytetrack, tracker_candidate


def validate_tracker_comparison_pair(configs: list[BenchmarkRunConfig]) -> None:
    """Reject tracker comparisons with changes outside raw MOT provenance."""
    if len(configs) != 2:
        raise ValueError("Tracker comparison requires exactly two configurations")
    first, second = configs
    for field_name in TRACKER_PAIR_INVARIANTS:
        if getattr(first, field_name) != getattr(second, field_name):
            raise ValueError(f"Tracker comparison requires matching {field_name}")

    first_candidate = get_tracker_candidate(first.tracker)
    second_candidate = get_tracker_candidate(second.tracker)
    if first_candidate.id != "bytetrack":
        raise ValueError("Tracker comparison baseline must use bytetrack")
    if second_candidate.id == "bytetrack":
        raise ValueError("Tracker comparison requires a non-baseline tracker candidate")


def build_tracker_reid_trio(
    baseline: BenchmarkRunConfig,
) -> tuple[BenchmarkRunConfig, BenchmarkRunConfig, BenchmarkRunConfig]:
    """Create a fair 3-way tracker/ReID comparison trio from one fixed configuration.

    Varies ONLY tracker, tracker_config, reid_enabled, and reid_model:
      A: ByteTrack + SportsScout identity (reid_enabled=False)
      B: BoT-SORT + SportsScout identity (reid_enabled=False)
      C: BoT-SORT + ReID + SportsScout identity (reid_enabled=True, spatial_multi_zone_v1)
    """
    cand_a = get_tracker_candidate("bytetrack")
    cand_b = get_tracker_candidate("botsort")
    cand_c = get_tracker_candidate("botsort_reid")

    config_a = replace(
        baseline,
        config_id=f"{baseline.config_id}__{cand_a.id}",
        tracker=cand_a.tracker_name,
        tracker_config=cand_a.tracker_config,
        reid_enabled=cand_a.reid_enabled,
        reid_model=cand_a.reid_model,
    )
    config_b = replace(
        baseline,
        config_id=f"{baseline.config_id}__{cand_b.id}",
        tracker=cand_b.tracker_name,
        tracker_config=cand_b.tracker_config,
        reid_enabled=cand_b.reid_enabled,
        reid_model=cand_b.reid_model,
    )
    config_c = replace(
        baseline,
        config_id=f"{baseline.config_id}__{cand_c.id}",
        tracker=cand_c.tracker_name,
        tracker_config=cand_c.tracker_config,
        reid_enabled=cand_c.reid_enabled,
        reid_model=cand_c.reid_model,
    )
    validate_tracker_reid_trio([config_a, config_b, config_c])
    return config_a, config_b, config_c


def validate_tracker_reid_trio(configs: list[BenchmarkRunConfig]) -> None:
    """Reject a comparison trio when any non-tracker/ReID pipeline variable differs."""
    if len(configs) != 3:
        raise ValueError("Tracker ReID comparison requires exactly three configurations")

    first = configs[0]
    for other in configs[1:]:
        for field_name in TRACKER_PAIR_INVARIANTS:
            if getattr(first, field_name) != getattr(other, field_name):
                raise ValueError(f"Tracker ReID comparison requires matching {field_name}")

    signatures = [(c.tracker, c.reid_enabled, c.reid_model) for c in configs]
    expected_signatures = {
        ("bytetrack", False, None),
        ("botsort", False, None),
        ("botsort", True, "spatial_multi_zone_v1"),
    }
    if set(signatures) != expected_signatures:
        raise ValueError(
            "Tracker ReID trio requires one ByteTrack (no ReID), "
            "one BoT-SORT (no ReID), and one BoT-SORT (with ReID) configuration"
        )


def run_tracker_reid_stability_benchmark(
    manifest: BenchmarkManifest,
    workspace_root: Path,
    *,
    baseline: BenchmarkRunConfig,
    execute_one: Callable[[BenchmarkClipEntry, BenchmarkRunConfig, Path, Path], BenchmarkRunMetrics],
    clip_ids: list[str] | None = None,
    availability_checker: Callable[[BenchmarkRunConfig, Path], tuple[bool, str]] | None = None,
    timestamp_factory: Callable[[], str] = _utc_now,
    run_group_id_factory: Callable[[], str] = _new_run_group_id,
) -> BenchmarkBundle:
    """Run one fair 3-way tracker/ReID comparison through the normal result schema."""
    trio = list(build_tracker_reid_trio(baseline))
    bundle = run_benchmark_matrix(
        manifest,
        workspace_root,
        configs=trio,
        clip_ids=clip_ids,
        execute_one=execute_one,
        availability_checker=availability_checker or _default_availability,
        timestamp_factory=timestamp_factory,
        run_group_id_factory=run_group_id_factory,
    )
    if not bundle.dataset_available:
        bundle.dataset_status = "TRACKER BENCHMARK DATASET NOT AVAILABLE"
    return bundle


def build_pose_architecture_pair(
    baseline: BenchmarkRunConfig,
    *,
    roi_pose_model: str | None = None,
    full_frame_pose_model: str | None = None,
) -> tuple[BenchmarkRunConfig, BenchmarkRunConfig]:
    """Create a fair ROI/full-frame pair from one fixed tracking configuration."""
    roi = replace(
        baseline,
        config_id=f"{baseline.config_id}__roi_pose",
        pose_architecture="roi_pose",
        pose_model=baseline.pose_model if roi_pose_model is None else roi_pose_model,
    )
    full_frame = replace(
        baseline,
        config_id=f"{baseline.config_id}__full_frame_pose",
        pose_architecture="full_frame_pose",
        pose_model=baseline.pose_model if full_frame_pose_model is None else full_frame_pose_model,
    )
    validate_pose_architecture_pair([roi, full_frame])
    return roi, full_frame


def validate_pose_architecture_pair(configs: list[BenchmarkRunConfig]) -> None:
    """Reject a comparison pair when any non-pose pipeline variable differs."""
    if len(configs) != 2:
        raise ValueError("Pose architecture comparison requires exactly two configurations")
    architectures = {config.pose_architecture for config in configs}
    if architectures != {"roi_pose", "full_frame_pose"}:
        raise ValueError("Pose architecture comparison requires one roi_pose and one full_frame_pose configuration")
    first, second = configs
    for field_name in POSE_PAIR_INVARIANTS:
        if getattr(first, field_name) != getattr(second, field_name):
            raise ValueError(f"Pose architecture comparison requires matching {field_name}")


def run_pose_architecture_benchmark(
    manifest: BenchmarkManifest,
    workspace_root: Path,
    *,
    baseline: BenchmarkRunConfig,
    execute_one: Callable[[BenchmarkClipEntry, BenchmarkRunConfig, Path, Path], BenchmarkRunMetrics],
    roi_pose_model: str | None = None,
    full_frame_pose_model: str | None = None,
    clip_ids: list[str] | None = None,
    availability_checker: Callable[[BenchmarkRunConfig, Path], tuple[bool, str]] | None = None,
    timestamp_factory: Callable[[], str] = _utc_now,
    run_group_id_factory: Callable[[], str] = _new_run_group_id,
) -> BenchmarkBundle:
    """Run one fair ROI/full-frame pose pair through the normal result schema."""
    pair = list(build_pose_architecture_pair(
        baseline,
        roi_pose_model=roi_pose_model,
        full_frame_pose_model=full_frame_pose_model,
    ))
    bundle = run_benchmark_matrix(
        manifest,
        workspace_root,
        configs=pair,
        clip_ids=clip_ids,
        execute_one=execute_one,
        availability_checker=availability_checker or _default_availability,
        timestamp_factory=timestamp_factory,
        run_group_id_factory=run_group_id_factory,
    )
    if not bundle.dataset_available:
        bundle.dataset_status = "POSE BENCHMARK DATASET NOT AVAILABLE"
    return bundle


def build_runtime_comparison_pair(
    baseline: BenchmarkRunConfig,
    engine_artifact_path: str | Path | None = None,
) -> tuple[BenchmarkRunConfig, BenchmarkRunConfig]:
    """Create a fair PyTorch vs TensorRT FP16 comparison pair from one fixed configuration.

    Varies ONLY runtime, precision, and model_artifact_reference:
      - PyTorch baseline: runtime='pytorch', precision='fp32'
      - TensorRT candidate: runtime='tensorrt', precision='fp16'
    """
    pytorch_cfg = replace(
        baseline,
        config_id=f"{baseline.config_id}__pytorch",
        runtime="pytorch",
        precision="fp32",
        model_artifact_reference=None,
    )
    tensorrt_cfg = replace(
        baseline,
        config_id=f"{baseline.config_id}__tensorrt_fp16",
        runtime="tensorrt",
        precision="fp16",
        model_artifact_reference=str(engine_artifact_path) if engine_artifact_path else None,
    )
    validate_runtime_comparison_pair([pytorch_cfg, tensorrt_cfg])
    return pytorch_cfg, tensorrt_cfg


def validate_runtime_comparison_pair(configs: list[BenchmarkRunConfig]) -> None:
    """Reject a runtime comparison pair when any non-runtime pipeline variable differs."""
    if len(configs) != 2:
        raise ValueError("Runtime comparison requires exactly two configurations")
    runtimes = {config.runtime for config in configs}
    if runtimes != {"pytorch", "tensorrt"}:
        raise ValueError("Runtime comparison requires one pytorch and one tensorrt configuration")
    first, second = configs
    for field_name in RUNTIME_PAIR_INVARIANTS:
        if getattr(first, field_name) != getattr(second, field_name):
            raise ValueError(f"Runtime comparison requires matching {field_name}")
    trt_config = first if first.runtime == "tensorrt" else second
    if trt_config.precision != "fp16":
        raise ValueError(
            f"TensorRT configuration must use fp16 precision, got '{trt_config.precision}'"
        )


def resolve_local_model_path(model_reference: str, workspace_root: Path) -> Path | None:
    """Resolve a model from explicit local locations without network access."""
    model_path = Path(model_reference)
    candidates = [
        model_path if model_path.is_absolute() else workspace_root / model_path,
        Path.home() / "AppData" / "Roaming" / "Ultralytics" / model_path.name,
        Path.home() / ".cache" / "ultralytics" / model_path.name,
    ]
    for candidate in candidates:
        if candidate.is_file():
            return candidate.resolve()
    return None


def _default_availability(config: BenchmarkRunConfig, workspace_root: Path) -> tuple[bool, str]:
    if config.runtime == "tensorrt":
        try:
            from .engine_config import is_tensorrt_available
        except ImportError:
            from engine_config import is_tensorrt_available
        trt_ok, trt_reason = is_tensorrt_available(device=config.device)
        if not trt_ok:
            return False, f"TensorRT runtime unavailable: {trt_reason}"
    if config.model_artifact_reference and resolve_local_model_path(config.model_artifact_reference, workspace_root) is None:
        return False, f"Model artifact '{config.model_artifact_reference}' is not available locally"
    if resolve_local_model_path(config.detector, workspace_root) is None:
        return False, f"Detector model '{config.detector}' is not available locally"
    if config.pose_model and resolve_local_model_path(config.pose_model, workspace_root) is None:
        return False, f"Pose model '{config.pose_model}' is not available locally"
    return True, "Required detector and pose models are available locally"


def _make_attempt(
    clip: BenchmarkClipEntry,
    config: BenchmarkRunConfig,
    timestamp: str,
    status: RunStatus,
    metrics: BenchmarkRunMetrics | None = None,
    failure_stage: str | None = None,
    error_summary: str | None = None,
    run_group_id: str = "legacy",
) -> BenchmarkAttempt:
    full_config_id = "_".join([
        config.config_id,
        config.tracker,
        config.tracker_config or "default-tracker-config",
        "reid" if config.reid_enabled else "no-reid",
        config.reid_model or "default-reid-model",
        config.pose_model or "pose-disabled",
        config.runtime,
        config.precision,
        config.device,
        f"fs{config.frame_stride}",
        f"ps{config.pose_stride}",
        f"conf{config.confidence_threshold:g}",
        "roi" if config.court_roi_enabled else "fullframe",
    ])
    run_id = generate_benchmark_run_id(
        clip_id=clip.id,
        experiment_id=full_config_id,
        timestamp=timestamp,
    )
    run_id = f"{run_id}__{run_group_id}"
    return BenchmarkAttempt(
        run_id=run_id,
        timestamp=timestamp,
        clip_id=clip.id,
        video_reference=clip.video_reference,
        court_calibration_reference=clip.court_calibration_reference,
        ground_truth_available=clip.ground_truth_available,
        status=status,
        config=config,
        metrics=metrics or BenchmarkRunMetrics(),
        failure_stage=failure_stage,
        error_summary=error_summary,
    )


def _assess_1280(results: list[BenchmarkAttempt], clips: list[BenchmarkClipEntry]) -> Literal["Yes", "No", "Cannot determine"]:
    difficult_ids = {
        clip.id for clip in clips
        if "far_court_small_scale" in clip.difficulty_tags
    }
    measured = [
        result for result in results
        if result.status == "SUCCESS"
        and result.config.input_size == 960
        and result.clip_id in difficult_ids
        and result.metrics.mean_target_coverage is not None
    ]
    if not measured:
        return "Cannot determine"
    if any(result.metrics.mean_target_coverage < 0.8 for result in measured):
        return "Yes"
    if all(result.metrics.mean_target_coverage >= 0.95 for result in measured):
        return "No"
    return "Cannot determine"


def run_benchmark_matrix(
    manifest: BenchmarkManifest,
    workspace_root: Path,
    *,
    configs: list[BenchmarkRunConfig] | None = None,
    clip_ids: list[str] | None = None,
    execute_one: Callable[[BenchmarkClipEntry, BenchmarkRunConfig, Path, Path], BenchmarkRunMetrics],
    availability_checker: Callable[[BenchmarkRunConfig, Path], tuple[bool, str]] = _default_availability,
    timestamp_factory: Callable[[], str] = _utc_now,
    run_group_id_factory: Callable[[], str] = _new_run_group_id,
) -> BenchmarkBundle:
    """Run every selected clip/config pair while retaining failures."""
    workspace_root = workspace_root.resolve()
    if clip_ids is not None:
        if not clip_ids:
            raise ValueError("At least one benchmark clip ID must be selected")
        known_clip_ids = {clip.id for clip in manifest.clips}
        unknown_clip_ids = sorted(set(clip_ids) - known_clip_ids)
        if unknown_clip_ids:
            raise ValueError(
                f"Unknown benchmark clip IDs: {', '.join(unknown_clip_ids)}. "
                f"Valid IDs: {', '.join(sorted(known_clip_ids))}"
            )
    selected = [clip for clip in manifest.clips if clip_ids is None or clip.id in set(clip_ids)]
    selected_configs = configs if configs is not None else build_detector_matrix(BenchmarkCommonConfig())
    created_at = timestamp_factory()
    run_group_id = run_group_id_factory()
    configuration_availability: dict[str, dict[str, Any]] = {}
    for config in selected_configs:
        available, reason = availability_checker(config, workspace_root)
        configuration_availability[config.config_id] = {
            "available": available,
            "reason": reason,
        }
    existing_clips = [
        clip for clip in selected
        if clip.video_reference and (workspace_root / clip.video_reference).is_file()
    ]
    if not existing_clips:
        return BenchmarkBundle(
            manifest_id=manifest.manifest_id,
            run_group_id=run_group_id,
            created_at=created_at,
            dataset_available=False,
            dataset_status="BENCHMARK DATASET NOT AVAILABLE LOCALLY",
            configurations=selected_configs,
            configuration_availability=configuration_availability,
            selected_clip_ids=[clip.id for clip in selected],
            results=[],
        )

    results: list[BenchmarkAttempt] = []
    for clip in selected:
        video_path = workspace_root / clip.video_reference if clip.video_reference else None
        for config in selected_configs:
            timestamp = timestamp_factory()
            if video_path is None or not video_path.is_file():
                results.append(_make_attempt(
                    clip,
                    config,
                    timestamp,
                    "UNAVAILABLE",
                    failure_stage="clip_availability",
                    error_summary=f"Local benchmark clip not found: {clip.video_reference}",
                    run_group_id=run_group_id,
                ))
                continue
            availability = configuration_availability[config.config_id]
            available = availability["available"] is True
            reason = str(availability["reason"])
            if not available:
                results.append(_make_attempt(
                    clip,
                    config,
                    timestamp,
                    "UNAVAILABLE",
                    failure_stage="model_availability",
                    error_summary=reason,
                    run_group_id=run_group_id,
                ))
                continue
            try:
                metrics = execute_one(clip, config, video_path, workspace_root)
                if not isinstance(metrics, BenchmarkRunMetrics):
                    raise BenchmarkExecutionError("metrics", "Executor did not return BenchmarkRunMetrics")
                results.append(_make_attempt(
                    clip, config, timestamp, "SUCCESS", metrics=metrics, run_group_id=run_group_id
                ))
            except BenchmarkExecutionError as error:
                results.append(_make_attempt(
                    clip,
                    config,
                    timestamp,
                    "UNAVAILABLE" if error.stage == "model_availability" else "FAILED",
                    failure_stage=error.stage,
                    error_summary=str(error),
                    run_group_id=run_group_id,
                ))
            except Exception as error:
                results.append(_make_attempt(
                    clip, config, timestamp, "FAILED",
                    failure_stage="inference",
                    error_summary=str(error),
                    run_group_id=run_group_id,
                ))

    return BenchmarkBundle(
        manifest_id=manifest.manifest_id,
        run_group_id=run_group_id,
        created_at=created_at,
        dataset_available=True,
        dataset_status="AVAILABLE",
        configurations=selected_configs,
        configuration_availability=configuration_availability,
        selected_clip_ids=[clip.id for clip in selected],
        results=results,
        follow_up_1280=_assess_1280(results, selected),
    )


COMPARISON_COLUMNS = [
    "runId", "timestamp", "status", "failureStage", "errorSummary", "clipId",
    "configId", "candidateId", "detector", "inputSize", "tracker", "trackerConfig", "reidEnabled", "reidModel", "poseModel", "poseArchitecture",
    "runtime", "precision", "device", "frameStride", "poseStride",
    "confidenceThreshold", "courtRoiEnabled", "meanTargetCoverage", "simultaneousTargetCoverage",
    "predictedPercent", "lostPercent", "meanObservedConfidence", "analysisFps",
    "elapsedSeconds", "processingRatio", "effectiveTelemetryHz", "peakVramMb",
    "freshPoseCoverage", "poseReusePercent", "poseUnavailablePercent", "poseInferenceCalls",
    "rawTrackerIdSwitches", "semanticPlayerIdSwitches", "reacquisitionDurationSec",
    "meanCourtPositionError", "medianCourtPositionError", "p95CourtPositionError",
    "distanceError", "identityAccuracy",
    "identityContinuity", "idSwitchCount",
]


def _comparison_row(result: BenchmarkAttempt) -> dict[str, Any]:
    metrics = result.metrics
    return {
        "runId": result.run_id,
        "timestamp": result.timestamp,
        "status": result.status,
        "failureStage": result.failure_stage,
        "errorSummary": result.error_summary,
        "clipId": result.clip_id,
        "configId": result.config.config_id,
        "candidateId": result.config.candidate_id,
        "detector": result.config.detector,
        "inputSize": result.config.input_size,
        "tracker": result.config.tracker,
        "trackerConfig": result.config.tracker_config,
        "reidEnabled": result.config.reid_enabled,
        "reidModel": result.config.reid_model,
        "poseModel": result.config.pose_model,
        "poseArchitecture": result.config.pose_architecture,
        "runtime": result.config.runtime,
        "precision": result.config.precision,
        "device": result.config.device,
        "frameStride": result.config.frame_stride,
        "poseStride": result.config.pose_stride,
        "confidenceThreshold": result.config.confidence_threshold,
        "courtRoiEnabled": result.config.court_roi_enabled,
        "meanTargetCoverage": metrics.mean_target_coverage,
        "simultaneousTargetCoverage": metrics.simultaneous_target_coverage,
        "predictedPercent": metrics.predicted_percent,
        "lostPercent": metrics.lost_percent,
        "meanObservedConfidence": metrics.mean_observed_confidence,
        "analysisFps": metrics.analysis_fps,
        "elapsedSeconds": metrics.elapsed_seconds,
        "processingRatio": metrics.processing_ratio,
        "effectiveTelemetryHz": metrics.effective_telemetry_hz,
        "freshPoseCoverage": metrics.fresh_pose_coverage,
        "poseReusePercent": metrics.pose_reuse_percent,
        "poseUnavailablePercent": metrics.pose_unavailable_percent,
        "poseInferenceCalls": metrics.pose_inference_calls,
        "peakVramMb": metrics.peak_vram_mb,
        "rawTrackerIdSwitches": metrics.raw_tracker_id_switches,
        "semanticPlayerIdSwitches": metrics.semantic_player_id_switches,
        "reacquisitionDurationSec": metrics.reacquisition_duration_sec,
        "meanCourtPositionError": metrics.mean_court_position_error,
        "medianCourtPositionError": metrics.median_court_position_error,
        "p95CourtPositionError": metrics.p95_court_position_error,
        "distanceError": metrics.distance_error,
        "identityAccuracy": metrics.identity_accuracy,
        "identityContinuity": metrics.identity_continuity,
        "idSwitchCount": metrics.id_switch_count,
    }


def save_benchmark_bundle(bundle: BenchmarkBundle, output_dir: Path) -> tuple[Path, Path]:
    output_dir.mkdir(parents=True, exist_ok=True)
    compact_time = bundle.created_at.replace(":", "").replace("-", "")
    stem = f"{bundle.manifest_id}__{compact_time}__{bundle.run_group_id}"
    json_path = output_dir / f"{stem}.json"
    csv_path = output_dir / f"{stem}.csv"
    if json_path.exists() or csv_path.exists():
        raise FileExistsError(f"Benchmark artifacts already exist for run group {bundle.run_group_id}")

    json_temp: Path | None = None
    csv_temp: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(
            "w", delete=False, dir=output_dir, encoding="utf-8", suffix=".json.tmp"
        ) as handle:
            json_temp = Path(handle.name)
            json.dump(bundle.to_dict(), handle, indent=2, ensure_ascii=False)
            handle.flush()
            os.fsync(handle.fileno())
        with tempfile.NamedTemporaryFile(
            "w", delete=False, dir=output_dir, encoding="utf-8", newline="", suffix=".csv.tmp"
        ) as handle:
            csv_temp = Path(handle.name)
            writer = csv.DictWriter(handle, fieldnames=COMPARISON_COLUMNS, extrasaction="ignore")
            writer.writeheader()
            for result in bundle.results:
                writer.writerow(_comparison_row(result))
            handle.flush()
            os.fsync(handle.fileno())
        json_temp.replace(json_path)
        csv_temp.replace(csv_path)
    finally:
        if json_temp is not None and json_temp.exists():
            json_temp.unlink()
        if csv_temp is not None and csv_temp.exists():
            csv_temp.unlink()
    return json_path, csv_path


def load_benchmark_bundle(path: Path) -> BenchmarkBundle:
    return BenchmarkBundle.from_dict(json.loads(path.read_text(encoding="utf-8")))


def load_benchmark_manifest(path: Path) -> BenchmarkManifest:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise ValueError("Benchmark manifest root must be a JSON object")
    return BenchmarkManifest.from_dict(payload)


def _finite_number(value: Any) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) else None


def _rounded(value: float | None, digits: int = 6) -> float | None:
    return round(value, digits) if value is not None and math.isfinite(value) else None


def compute_phase_zero_metrics(
    telemetry: list[dict[str, Any]],
    *,
    expected_player_count: int,
    elapsed_seconds: float | None,
    video_duration_seconds: float | None,
    peak_vram_mb: float | None,
    pose_inference_calls: int | None = None,
    raw_tracker_id_switches: int | None = None,
    semantic_player_id_switches: int | None = None,
) -> BenchmarkRunMetrics:
    """Compute Phase 0 & 1.5 metrics without treating unknown values as measured zero."""
    elapsed = _finite_number(elapsed_seconds)
    duration = _finite_number(video_duration_seconds)
    if not telemetry:
        return BenchmarkRunMetrics(
            peak_vram_mb=_rounded(_finite_number(peak_vram_mb), 3),
            elapsed_seconds=_rounded(elapsed, 6) if elapsed is not None and elapsed >= 0 else None,
            raw_tracker_id_switches=raw_tracker_id_switches,
            semantic_player_id_switches=semantic_player_id_switches,
        )

    player_ids = [f"P{i}" for i in range(1, max(1, int(expected_player_count)) + 1)]
    frame_count = len(telemetry)
    observed = {player_id: 0 for player_id in player_ids}
    predicted = {player_id: 0 for player_id in player_ids}
    lost = {player_id: 0 for player_id in player_ids}
    confidences = {player_id: [] for player_id in player_ids}
    fresh_pose_samples = 0
    reused_pose_samples = 0
    unavailable_pose_samples = 0
    fully_observed_frames = 0
    timestamps: set[float] = set()

    detected_raw_switches = 0
    detected_sem_switches = 0
    prev_player_track: dict[str, int] = {}
    track_ownership: dict[int, tuple[str, int]] = {}
    lost_start_time: dict[str, float] = {}
    lost_start_frame: dict[str, int] = {}
    reacquisition_durations: list[float] = []
    failure_examples: list[BenchmarkIdentityFailureExample] = []
    reacq_failure_logged: set[str] = set()

    for frame_idx, frame in enumerate(telemetry):
        timestamp = _finite_number(frame.get("timestampSec", frame.get("timestamp_sec")))
        if timestamp is not None:
            timestamps.add(timestamp)
        ts = timestamp if timestamp is not None else float(frame_idx)
        states: dict[str, dict[str, Any]] = {}
        for index, player in enumerate(frame.get("players") or []):
            player_id = player.get("playerId")
            if not player_id and player.get("id") is not None:
                player_id = f"P{player['id']}"
            if not player_id and index < len(player_ids):
                player_id = player_ids[index]
            if player_id in observed:
                states[player_id] = player

        frame_is_fully_observed = True
        for player_id in player_ids:
            player = states.get(player_id)
            state = player.get("state") if player else "lost"
            if state == "observed":
                observed[player_id] += 1
                confidence = _finite_number(player.get("detectionConfidence"))
                if confidence is not None:
                    confidences[player_id].append(confidence)

                # Track reacquisition
                if player_id in lost_start_time:
                    reacq_duration = ts - lost_start_time[player_id]
                    if reacq_duration >= 0:
                        reacquisition_durations.append(reacq_duration)
                    del lost_start_time[player_id]
                    del lost_start_frame[player_id]
                    reacq_failure_logged.discard(player_id)

                # Check raw track id and semantic switches
                tid_raw = player.get("trackId") if player else None
                tid = int(tid_raw) if tid_raw is not None else None
                if tid is not None:
                    if player_id in prev_player_track and prev_player_track[player_id] != tid:
                        detected_raw_switches += 1
                        failure_examples.append(BenchmarkIdentityFailureExample(
                            failure_type="raw_id_reset",
                            timestamp_sec=ts,
                            player_id=player_id,
                            track_id=tid,
                            description=f"{player_id} raw MOT track ID reset from {prev_player_track[player_id]} to {tid}",
                        ))
                    if tid in track_ownership:
                        prior_pid, prior_fidx = track_ownership[tid]
                        if prior_pid != player_id and (frame_idx - prior_fidx) < 30:
                            detected_sem_switches += 1
                            failure_examples.append(BenchmarkIdentityFailureExample(
                                failure_type="semantic_id_switch",
                                timestamp_sec=ts,
                                player_id=player_id,
                                track_id=tid,
                                description=f"Semantic swap: track ID {tid} reassigned from {prior_pid} to {player_id}",
                            ))
                    prev_player_track[player_id] = tid
                    track_ownership[tid] = (player_id, frame_idx)

                # Check for ambiguity and cross-boundary in costs
                if player and isinstance(player.get("identityCosts"), dict):
                    costs = player["identityCosts"]
                    if costs.get("isAmbiguous") is True:
                        failure_examples.append(BenchmarkIdentityFailureExample(
                            failure_type="ambiguous_identity",
                            timestamp_sec=ts,
                            player_id=player_id,
                            track_id=tid,
                            description=f"{player_id} ReID ambiguity guard triggered",
                        ))
                    if costs.get("courtSidePenalty", 0) > 0:
                        failure_examples.append(BenchmarkIdentityFailureExample(
                            failure_type="cross_player_assignment",
                            timestamp_sec=ts,
                            player_id=player_id,
                            track_id=tid,
                            description=f"{player_id} court side penalty triggered ({costs['courtSidePenalty']})",
                        ))
            elif state == "predicted":
                predicted[player_id] += 1
                frame_is_fully_observed = False
                if player_id not in lost_start_time:
                    lost_start_time[player_id] = ts
                    lost_start_frame[player_id] = frame_idx
            else:
                lost[player_id] += 1
                frame_is_fully_observed = False
                if player_id not in lost_start_time:
                    lost_start_time[player_id] = ts
                    lost_start_frame[player_id] = frame_idx

            if player_id in lost_start_frame and player_id not in reacq_failure_logged:
                if (frame_idx - lost_start_frame[player_id]) >= 30:
                    reacq_failure_logged.add(player_id)
                    failure_examples.append(BenchmarkIdentityFailureExample(
                        failure_type="reacquisition_failure",
                        timestamp_sec=lost_start_time[player_id],
                        player_id=player_id,
                        track_id=None,
                        description=f"{player_id} unrecovered after 30+ frames",
                    ))

            pose = player.get("pose") if player else None
            if isinstance(pose, dict):
                if pose.get("isReused") is True:
                    reused_pose_samples += 1
                else:
                    fresh_pose_samples += 1
            else:
                unavailable_pose_samples += 1
        if frame_is_fully_observed:
            fully_observed_frames += 1

    player_coverage: dict[str, dict[str, float | None]] = {}
    all_observed_confidences: list[float] = []
    for player_id in player_ids:
        player_confidences = confidences[player_id]
        all_observed_confidences.extend(player_confidences)
        player_coverage[player_id] = {
            "observedCoverage": _rounded(observed[player_id] / frame_count),
            "predictedPercent": _rounded(predicted[player_id] / frame_count * 100.0),
            "lostPercent": _rounded(lost[player_id] / frame_count * 100.0),
            "meanObservedConfidence": (
                _rounded(sum(player_confidences) / len(player_confidences))
                if player_confidences else None
            ),
        }

    target_samples = frame_count * len(player_ids)
    ordered_timestamps = sorted(timestamps)
    telemetry_hz = None
    if len(ordered_timestamps) >= 2:
        telemetry_span = ordered_timestamps[-1] - ordered_timestamps[0]
        if telemetry_span > 0:
            telemetry_hz = (len(ordered_timestamps) - 1) / telemetry_span

    analysis_fps = frame_count / elapsed if elapsed is not None and elapsed > 0 else None
    processing_ratio = elapsed / duration if elapsed is not None and elapsed >= 0 and duration is not None and duration > 0 else None

    final_raw_switches = raw_tracker_id_switches if raw_tracker_id_switches is not None else detected_raw_switches
    final_sem_switches = semantic_player_id_switches if semantic_player_id_switches is not None else detected_sem_switches

    mean_reacq_duration = (
        _rounded(sum(reacquisition_durations) / len(reacquisition_durations), 4)
        if reacquisition_durations else None
    )

    return BenchmarkRunMetrics(
        player_coverage=player_coverage,
        mean_target_coverage=_rounded(sum(observed.values()) / target_samples),
        simultaneous_target_coverage=_rounded(fully_observed_frames / frame_count),
        predicted_percent=_rounded(sum(predicted.values()) / target_samples * 100.0),
        lost_percent=_rounded(sum(lost.values()) / target_samples * 100.0),
        mean_observed_confidence=(
            _rounded(sum(all_observed_confidences) / len(all_observed_confidences))
            if all_observed_confidences else None
        ),
        analysis_fps=_rounded(analysis_fps),
        elapsed_seconds=_rounded(elapsed) if elapsed is not None and elapsed >= 0 else None,
        processing_ratio=_rounded(processing_ratio),
        effective_telemetry_hz=_rounded(telemetry_hz),
        peak_vram_mb=_rounded(_finite_number(peak_vram_mb), 3),
        fresh_pose_coverage=_rounded(fresh_pose_samples / target_samples),
        pose_reuse_percent=(
            _rounded(reused_pose_samples / (fresh_pose_samples + reused_pose_samples) * 100.0)
            if fresh_pose_samples + reused_pose_samples > 0 else None
        ),
        pose_unavailable_percent=_rounded(unavailable_pose_samples / target_samples * 100.0),
        pose_inference_calls=(
            int(pose_inference_calls)
            if isinstance(pose_inference_calls, int) and pose_inference_calls >= 0 else None
        ),
        raw_tracker_id_switches=final_raw_switches,
        semantic_player_id_switches=final_sem_switches,
        reacquisition_duration_sec=mean_reacq_duration,
        failure_examples=failure_examples,
        id_switch_count=final_sem_switches,
    )


def _load_calibration_corners(
    clip: BenchmarkClipEntry,
    workspace_root: Path,
) -> list[list[float]] | None:
    reference = clip.court_calibration_reference
    if not reference:
        return None
    direct_path = workspace_root / reference
    standard_path = workspace_root / "benchmarks" / "calibrations" / f"{reference}.json"
    calibration_path = direct_path if direct_path.is_file() else standard_path
    if not calibration_path.is_file():
        raise BenchmarkExecutionError(
            "calibration",
            f"Court calibration not found locally: {reference}",
        )
    try:
        payload = json.loads(calibration_path.read_text(encoding="utf-8"))
        corners = payload.get("corners") if isinstance(payload, dict) else payload
        if not isinstance(corners, list) or len(corners) != 4:
            raise ValueError("expected four court corners")
        return [[float(point[0]), float(point[1])] for point in corners]
    except BenchmarkExecutionError:
        raise
    except Exception as error:
        raise BenchmarkExecutionError(
            "calibration",
            f"Invalid court calibration '{calibration_path}': {error}",
        ) from error


def _start_cuda_peak_measurement(device: str) -> Any:
    if device != "cuda":
        return None
    try:
        import torch
        if not torch.cuda.is_available():
            return None
        torch.cuda.reset_peak_memory_stats()
        return torch
    except Exception:
        return None


def _finish_cuda_peak_measurement(torch_module: Any) -> float | None:
    if torch_module is None:
        return None
    try:
        torch_module.cuda.synchronize()
        return float(torch_module.cuda.max_memory_allocated()) / (1024.0 * 1024.0)
    except Exception:
        return None


def execute_tracking_run(
    clip: BenchmarkClipEntry,
    config: BenchmarkRunConfig,
    video_path: Path,
    workspace_root: Path,
) -> BenchmarkRunMetrics:
    """Execute one real clip through the existing SportsScout analyzer."""
    corners = _load_calibration_corners(clip, workspace_root)
    detector_path = resolve_local_model_path(config.detector, workspace_root)
    if detector_path is None:
        raise BenchmarkExecutionError("model_availability", f"Detector model '{config.detector}' is not available locally")
    pose_path = None
    if config.pose_model:
        pose_path = resolve_local_model_path(config.pose_model, workspace_root)
        if pose_path is None:
            raise BenchmarkExecutionError("model_availability", f"Pose model '{config.pose_model}' is not available locally")
    try:
        import cv2
        try:
            from .analyzer_v2 import BadmintonAnalyzerV2
            from .engine_config import TrackingEngineConfig, validate_engine_config
        except ImportError:
            from analyzer_v2 import BadmintonAnalyzerV2
            from engine_config import TrackingEngineConfig, validate_engine_config
    except Exception as error:
        raise BenchmarkExecutionError("runtime", f"Tracking runtime unavailable: {error}") from error

    capture = cv2.VideoCapture(str(video_path))
    if not capture.isOpened():
        raise BenchmarkExecutionError("video_open", f"Unable to open benchmark clip: {video_path}")
    source_fps = _finite_number(capture.get(cv2.CAP_PROP_FPS))
    source_frames = _finite_number(capture.get(cv2.CAP_PROP_FRAME_COUNT))
    if source_fps is None or source_fps <= 0:
        capture.release()
        raise BenchmarkExecutionError("video_metadata", "Source FPS is unavailable")
    duration = source_frames / source_fps if source_frames is not None and source_frames > 0 else None

    engine_config = TrackingEngineConfig(
        detector_model=str(detector_path),
        detector_family=config.detector_family,
        pose_model=str(pose_path) if pose_path is not None else None,
        pose_architecture=config.pose_architecture,
        pose_family="yolov8",
        tracker_name=config.tracker,
        tracker_config=config.tracker_config,
        reid_enabled=config.reid_enabled,
        reid_model=config.reid_model,
        runtime=config.runtime,
        precision=config.precision,
        model_artifact_reference=config.model_artifact_reference,
        detector_input_size=config.input_size,
        confidence_threshold=config.confidence_threshold,
        frame_stride=config.frame_stride,
        pose_stride=config.pose_stride,
        use_court_roi=config.court_roi_enabled,
        device=config.device,
    )
    validate_engine_config(engine_config)
    analyzer = BadmintonAnalyzerV2(
        game_type=clip.game_type,
        max_players=clip.player_count,
        fps=source_fps,
        engine_config=engine_config,
    )
    analyzer.analysis_id = f"benchmark_{clip.id}_{config.config_id}"
    if corners is not None:
        try:
            analyzer.set_court_corners(corners)
        except Exception as error:
            capture.release()
            raise BenchmarkExecutionError("calibration", f"Court calibration failed: {error}") from error

    telemetry: list[dict[str, Any]] = []
    frame_index = 0
    torch_module = _start_cuda_peak_measurement(config.device)
    started = time.perf_counter()
    try:
        while True:
            ok, frame = capture.read()
            if not ok:
                break
            frame_index += 1
            if frame_index % config.frame_stride != 0:
                continue
            position_ms = _finite_number(capture.get(cv2.CAP_PROP_POS_MSEC))
            timestamp = position_ms / 1000.0 if position_ms is not None and position_ms > 0 else frame_index / source_fps
            telemetry.append(analyzer.process_frame(frame, timestamp_sec=timestamp))
    except Exception as error:
        raise BenchmarkExecutionError("inference", str(error)) from error
    finally:
        capture.release()
    elapsed = time.perf_counter() - started
    peak_vram_mb = _finish_cuda_peak_measurement(torch_module)
    return compute_phase_zero_metrics(
        telemetry,
        expected_player_count=clip.player_count,
        elapsed_seconds=elapsed,
        video_duration_seconds=duration,
        peak_vram_mb=peak_vram_mb,
        pose_inference_calls=getattr(analyzer, "pose_inference_calls", None),
        raw_tracker_id_switches=getattr(analyzer, "raw_tracker_id_switches", None),
        semantic_player_id_switches=getattr(analyzer, "semantic_player_id_switches", None),
    )


def _parse_csv_option(value: str | None) -> list[str] | None:
    if value is None:
        return None
    return [item.strip() for item in value.split(",") if item.strip()]


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Run SportsScout detector, tracker, or pose architecture benchmarks")
    parser.add_argument(
        "--manifest",
        type=Path,
        default=Path("src/benchmarks/visionBenchmarkManifest.json"),
    )
    parser.add_argument("--workspace-root", type=Path, default=Path.cwd())
    parser.add_argument("--output-dir", type=Path, default=Path("benchmark_results"))
    parser.add_argument("--clips", help="Comma-separated manifest clip IDs")
    parser.add_argument("--detectors", help="Comma-separated registered detector IDs")
    parser.add_argument("--input-sizes", help="Comma-separated sizes selected from the fixed matrix")
    parser.add_argument("--device", default="auto", choices=["auto", "cpu", "cuda", "mps"])
    parser.add_argument(
        "--pose-architecture-benchmark",
        action="store_true",
        help="Compare one ROI/full-frame pair; defaults to YOLOv8n at 640 when no detector/size is selected",
    )
    parser.add_argument(
        "--tracker-benchmark",
        action="store_true",
        help="Compare 3-way tracker/ReID trio (ByteTrack vs BoT-SORT vs BoT-SORT + ReID); defaults to YOLOv8n at 640",
    )
    parser.add_argument(
        "--tensorrt-benchmark",
        action="store_true",
        help="Run TensorRT FP16 benchmark on qualified Phase 1.3 detector finalists",
    )
    parser.add_argument(
        "--runtime-benchmark",
        action="store_true",
        help="Compare PyTorch vs TensorRT FP16 runtime on qualified Phase 1.3 detector finalists",
    )
    parser.add_argument("--roi-pose-model", help="Optional local ROI pose model override")
    parser.add_argument("--full-frame-pose-model", help="Optional local full-frame pose model override")
    args = parser.parse_args(argv)

    try:
        try:
            from .device_runtime import resolve_device
        except ImportError:
            from device_runtime import resolve_device
        device = resolve_device(args.device)
        manifest = load_benchmark_manifest(args.manifest.resolve())
        configs = build_detector_matrix(BenchmarkCommonConfig(device=device))
        detector_filter = _parse_csv_option(args.detectors)
        if detector_filter is not None:
            selected_detectors = {get_candidate(item).id for item in detector_filter}
            configs = [config for config in configs if config.candidate_id in selected_detectors]
        size_filter = _parse_csv_option(args.input_sizes)
        if size_filter is not None:
            selected_sizes = {int(item) for item in size_filter}
            if not selected_sizes.issubset({640, 960}):
                raise ValueError("Input sizes must be selected from the fixed Phase 1.3 matrix: 640, 960")
            configs = [config for config in configs if config.input_size in selected_sizes]
        if not configs:
            raise ValueError("Configuration selection produced an empty matrix")
        if args.pose_architecture_benchmark:
            if detector_filter is None and size_filter is None:
                configs = [config for config in configs if config.candidate_id == "yolov8n" and config.input_size == 640]
            if len(configs) != 1:
                raise ValueError("Pose architecture benchmark requires exactly one detector/input-size baseline")
            bundle = run_pose_architecture_benchmark(
                manifest,
                args.workspace_root,
                baseline=configs[0],
                roi_pose_model=args.roi_pose_model,
                full_frame_pose_model=args.full_frame_pose_model,
                clip_ids=_parse_csv_option(args.clips),
                execute_one=execute_tracking_run,
            )
        elif args.tracker_benchmark:
            if detector_filter is None and size_filter is None:
                configs = [config for config in configs if config.candidate_id == "yolov8n" and config.input_size == 640]
            if len(configs) != 1:
                raise ValueError("Tracker benchmark requires exactly one detector/input-size baseline")
            bundle = run_tracker_reid_stability_benchmark(
                manifest,
                args.workspace_root,
                baseline=configs[0],
                clip_ids=_parse_csv_option(args.clips),
                execute_one=execute_tracking_run,
            )
        elif args.tensorrt_benchmark:
            try:
                from .tensorrt_benchmark import run_tensorrt_fp16_benchmark
            except ImportError:
                from tensorrt_benchmark import run_tensorrt_fp16_benchmark
            if detector_filter is None and size_filter is None:
                configs = [config for config in configs if config.candidate_id == "yolov8n" and config.input_size == 640]
            if len(configs) != 1:
                raise ValueError("TensorRT benchmark requires exactly one detector/input-size baseline")
            bundle, trt_status = run_tensorrt_fp16_benchmark(
                manifest,
                args.workspace_root,
                baseline=configs[0],
                benchmark_results_dir=args.output_dir,
                clip_ids=_parse_csv_option(args.clips),
                execute_one=execute_tracking_run,
            )
            if trt_status == "NO QUALIFIED DETECTOR FINALISTS":
                print("NO QUALIFIED DETECTOR FINALISTS")
                return 0
        elif args.runtime_benchmark:
            try:
                from .tensorrt_benchmark import (
                    run_runtime_comparison_benchmark,
                    format_runtime_comparison_output,
                )
            except ImportError:
                from tensorrt_benchmark import (
                    run_runtime_comparison_benchmark,
                    format_runtime_comparison_output,
                )
            if detector_filter is None and size_filter is None:
                configs = [config for config in configs if config.candidate_id == "yolov8n" and config.input_size == 640]
            if len(configs) != 1:
                raise ValueError("Runtime benchmark requires exactly one detector/input-size baseline")
            bundle, summaries, status_msg = run_runtime_comparison_benchmark(
                manifest,
                args.workspace_root,
                baseline=configs[0],
                benchmark_results_dir=args.output_dir,
                clip_ids=_parse_csv_option(args.clips),
                execute_one=execute_tracking_run,
            )
            if status_msg == "NO QUALIFIED DETECTOR FINALISTS":
                print("NO QUALIFIED DETECTOR FINALISTS")
                return 0
            for summary in summaries:
                print(format_runtime_comparison_output(summary))
        else:
            bundle = run_benchmark_matrix(
                manifest,
                args.workspace_root,
                configs=configs,
                clip_ids=_parse_csv_option(args.clips),
                execute_one=execute_tracking_run,
            )
        json_path, csv_path = save_benchmark_bundle(bundle, args.output_dir)
    except Exception as error:
        print(f"BENCHMARK RUNNER ERROR: {error}")
        return 2

    counts = {
        status: sum(1 for result in bundle.results if result.status == status)
        for status in ("SUCCESS", "FAILED", "UNAVAILABLE")
    }
    unavailable_configs = sum(
        1 for availability in bundle.configuration_availability.values()
        if availability.get("available") is not True
    )
    print(bundle.dataset_status)
    print(f"Configurations: {len(bundle.configurations)}")
    print(f"Clips selected: {len(bundle.selected_clip_ids)}")
    print(f"Successful runs: {counts['SUCCESS']}")
    print(f"Failed runs: {counts['FAILED']}")
    print(f"Unavailable runs: {counts['UNAVAILABLE']}")
    print(f"Unavailable configurations: {unavailable_configs}")
    print(f"JSON results: {json_path}")
    print(f"Comparison CSV: {csv_path}")
    print(f"1280 follow-up needed: {bundle.follow_up_1280}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
