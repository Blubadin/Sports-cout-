"""
model_registry.py — Phase 1.2 Benchmark Detector Candidate Registry

Defines the initial Phase-1 detector candidate matrix:
- YOLOv8n (baseline)
- YOLO11s
- YOLO11m
- YOLO26s
- YOLO26m

Rules:
- Baseline is strictly YOLOv8n.
- Standard input sizes: [640, 960].
- Consistent baseline confidence threshold: 0.35.
- Model availability reflects current local runtime and filesystem capabilities.
- Remote downloads during benchmark registration are explicitly prohibited.
- No accuracy claims encoded in configuration.
"""

from __future__ import annotations
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Literal
import sys

from engine_config import (
    TrackingEngineConfig,
    create_baseline_engine_config,
    InvalidEngineConfigError,
    ModelNotFoundError,
)

BENCHMARK_INPUT_SIZES: list[int] = [640, 960]
BASELINE_CONFIDENCE_THRESHOLD: float = 0.35

ModelAvailabilityStatus = Literal["AVAILABLE", "UNAVAILABLE / RUNTIME INCOMPATIBLE"]


@dataclass
class DetectorCandidate:
    """
    Metadata representation of a candidate object detector in the benchmark suite.
    """
    id: str
    display_name: str
    family: str
    model_file: str
    task: str = "detect"
    supported_input_sizes: list[int] = field(default_factory=lambda: list(BENCHMARK_INPUT_SIZES))
    baseline: bool = False
    confidence_threshold: float = BASELINE_CONFIDENCE_THRESHOLD
    runtime: str = "pytorch"
    precision: str = "fp32"
    description: str = ""

    def check_availability(self, workspace_root: Path | str | None = None) -> tuple[ModelAvailabilityStatus, str]:
        """
        Check whether this candidate model is available locally in the environment.
        Never triggers remote downloads or network requests.
        """
        root = Path(workspace_root) if workspace_root else Path.cwd()
        local_path = root / self.model_file

        # 1. Local workspace root
        if local_path.exists():
            return "AVAILABLE", f"Weight file found locally at {local_path.name}"

        # 2. Local user cache locations
        cache_locations = [
            Path.home() / "AppData" / "Roaming" / "Ultralytics" / self.model_file,
            Path.home() / ".cache" / "ultralytics" / self.model_file,
        ]
        for loc in cache_locations:
            if loc.exists():
                return "AVAILABLE", f"Weight file found in local cache at {loc}"

        return (
            "UNAVAILABLE / RUNTIME INCOMPATIBLE",
            f"Weight file '{self.model_file}' not found in local workspace or cache; automated remote fetch is disabled",
        )

    def to_engine_config(
        self,
        input_size: int = 640,
        device: str = "auto",
        frame_stride: int = 1,
        pose_model: str | None = "yolov8n-pose.pt",
        **overrides: Any,
    ) -> TrackingEngineConfig:
        """
        Construct an independent TrackingEngineConfig for this candidate.
        Does not mutate the baseline or global configurations.
        """
        if input_size not in self.supported_input_sizes:
            raise InvalidEngineConfigError(
                f"Input size {input_size} not in supported candidate sizes: {self.supported_input_sizes}"
            )

        conf_thresh = overrides.pop("confidence_threshold", self.confidence_threshold)
        return TrackingEngineConfig(
            detector_model=self.model_file,
            detector_family=self.family,
            pose_model=pose_model,
            pose_family="yolov8",
            tracker_name="bytetrack",
            runtime=self.runtime,
            precision=self.precision,
            detector_input_size=input_size,
            confidence_threshold=conf_thresh,
            frame_stride=frame_stride,
            device=device,
            **overrides,
        )

    def to_dict(self, workspace_root: Path | str | None = None) -> dict[str, Any]:
        """Convert candidate metadata to JSON-serializable dictionary."""
        status, reason = self.check_availability(workspace_root)
        return {
            "id": self.id,
            "displayName": self.display_name,
            "family": self.family,
            "modelFile": self.model_file,
            "task": self.task,
            "supportedInputSizes": list(self.supported_input_sizes),
            "baseline": self.baseline,
            "confidenceThreshold": self.confidence_threshold,
            "runtime": self.runtime,
            "precision": self.precision,
            "availability": status,
            "availabilityReason": reason,
            "description": self.description,
        }


# Explicit Phase 1 Detector Candidate Matrix
PHASE_1_DETECTOR_CANDIDATES: dict[str, DetectorCandidate] = {
    "yolov8n": DetectorCandidate(
        id="yolov8n",
        display_name="YOLOv8n",
        family="yolov8",
        model_file="yolov8n.pt",
        baseline=True,
        description="Phase 1 Official Baseline Configuration",
    ),
    "yolo11s": DetectorCandidate(
        id="yolo11s",
        display_name="YOLO11s",
        family="yolo11",
        model_file="yolo11s.pt",
        baseline=False,
        description="YOLO11 Small variant",
    ),
    "yolo11m": DetectorCandidate(
        id="yolo11m",
        display_name="YOLO11m",
        family="yolo11",
        model_file="yolo11m.pt",
        baseline=False,
        description="YOLO11 Medium variant",
    ),
    "yolo26s": DetectorCandidate(
        id="yolo26s",
        display_name="YOLO26s",
        family="yolo26",
        model_file="yolo26s.pt",
        baseline=False,
        description="YOLO26 Small variant",
    ),
    "yolo26m": DetectorCandidate(
        id="yolo26m",
        display_name="YOLO26m",
        family="yolo26",
        model_file="yolo26m.pt",
        baseline=False,
        description="YOLO26 Medium variant",
    ),
}


def get_candidate(candidate_id: str) -> DetectorCandidate:
    """
    Resolve a detector candidate by ID or model filename (case-insensitive).
    Raises InvalidEngineConfigError if unknown.
    """
    norm = candidate_id.strip().lower().replace("-", "").replace("_", "")
    for cid, cand in PHASE_1_DETECTOR_CANDIDATES.items():
        clean_cid = cid.replace("-", "").replace("_", "")
        clean_file = cand.model_file.lower().replace(".pt", "").replace("-", "").replace("_", "")
        if norm == clean_cid or norm == clean_file or norm == cand.model_file.lower():
            return cand

    raise InvalidEngineConfigError(
        f"Unknown detector candidate: '{candidate_id}'. Registered candidates: {list(PHASE_1_DETECTOR_CANDIDATES.keys())}"
    )


def get_baseline_candidate() -> DetectorCandidate:
    """Return the official Phase 1 baseline detector candidate (YOLOv8n)."""
    return PHASE_1_DETECTOR_CANDIDATES["yolov8n"]


def list_candidates() -> list[DetectorCandidate]:
    """Return all registered Phase 1 detector candidates."""
    return list(PHASE_1_DETECTOR_CANDIDATES.values())


def get_candidate_registry_report(workspace_root: Path | str | None = None) -> dict[str, Any]:
    """Generate a structured candidate report detailing baseline, available, and unavailable candidates."""
    baseline = get_baseline_candidate()
    candidates = list_candidates()

    available = []
    unavailable = []

    for c in candidates:
        status, reason = c.check_availability(workspace_root)
        entry = {
            "id": c.id,
            "displayName": c.display_name,
            "family": c.family,
            "modelFile": c.model_file,
            "baseline": c.baseline,
            "supportedInputSizes": c.supported_input_sizes,
            "status": status,
            "reason": reason,
        }
        if status == "AVAILABLE":
            available.append(entry)
        else:
            unavailable.append(entry)

    return {
        "baseline": baseline.display_name,
        "baselineModelFile": baseline.model_file,
        "supportedInputSizes": list(BENCHMARK_INPUT_SIZES),
        "availableCandidates": available,
        "unavailableCandidates": unavailable,
    }
