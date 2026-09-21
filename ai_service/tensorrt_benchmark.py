"""
tensorrt_benchmark.py — TensorRT FP16 Benchmark Execution and Export Pathway

Enables TensorRT FP16 benchmark execution for qualified Phase-1 detector candidates.
Enforces SportsScout Phase 1.6 rules:
1. Do NOT export every model: only export finalists supported by measured Phase 1.3 evidence.
2. If finalists have not been established, STOP and report: NO QUALIFIED DETECTOR FINALISTS.
3. FP16 ONLY: INT8 is strictly prohibited and rejected.
4. Explicit failure states:
   - export failure -> TensorRTExportError
   - engine load failure -> EngineLoadError
   - CUDA incompatibility -> CUDAIncompatibilityError
   - runtime inference failure -> RuntimeInferenceError
5. Large binaries (.engine, .onnx, .pt) must never be committed to repository (stored in local cache).
6. No silent fallback: TensorRT errors never silently degrade to PyTorch.
"""

from __future__ import annotations
from dataclasses import dataclass, replace
from pathlib import Path
import json
import os
import sys
from typing import Any, Callable

# Ensure ai_service is on sys.path
ai_service_dir = Path(__file__).parent
if str(ai_service_dir) not in sys.path:
    sys.path.insert(0, str(ai_service_dir))

from engine_config import (
    CUDAIncompatibilityError,
    EngineLoadError,
    InvalidEngineConfigError,
    ModelNotFoundError,
    RuntimeInferenceError,
    RuntimeUnavailableError,
    TensorRTExportError,
    is_tensorrt_available,
)
from benchmark_schema import BenchmarkManifest, generate_benchmark_run_id
from benchmark_runner import (
    BenchmarkBundle,
    BenchmarkCommonConfig,
    BenchmarkRunConfig,
    _default_availability,
    _make_attempt,
    _new_run_group_id,
    _utc_now,
    resolve_local_model_path,
    run_benchmark_matrix,
    execute_tracking_run,
)


DEFAULT_CACHE_DIR = Path.home() / ".cache" / "sportsscout" / "tensorrt"


def check_tensorrt_environment(device: str = "auto") -> dict[str, Any]:
    """
    Perform a truthful inspection of host environment for TensorRT FP16 execution:
    - NVIDIA GPU
    - CUDA support
    - TensorRT library support
    - Export capability

    Never attempts global driver, CUDA, PyTorch, or Ultralytics upgrades.
    """
    env: dict[str, Any] = {
        "cuda_available": False,
        "device_count": 0,
        "device_name": None,
        "cuda_version": None,
        "tensorrt_available": False,
        "tensorrt_version": None,
        "export_capable": False,
        "reason": None,
    }

    try:
        import torch
        env["cuda_available"] = bool(torch.cuda.is_available())
        if env["cuda_available"]:
            env["device_count"] = torch.cuda.device_count()
            env["device_name"] = torch.cuda.get_device_name(0) if env["device_count"] > 0 else None
            env["cuda_version"] = getattr(torch.version, "cuda", None)
    except Exception as e:
        env["reason"] = f"PyTorch CUDA check error: {e}"
        return env

    if not env["cuda_available"]:
        env["reason"] = "CUDA is not available on this host. TensorRT requires an NVIDIA GPU with CUDA support."
        return env

    trt_available, trt_reason = is_tensorrt_available(device=device)
    env["tensorrt_available"] = trt_available
    if not trt_available:
        env["reason"] = f"TensorRT runtime unavailable: {trt_reason}"
        return env

    try:
        import tensorrt
        env["tensorrt_version"] = getattr(tensorrt, "__version__", "unknown")
    except Exception:
        env["tensorrt_version"] = None

    # Check export capability (requires ultralytics and onnx)
    try:
        import ultralytics  # noqa: F401
        import onnx  # noqa: F401
        env["export_capable"] = True
    except ImportError as e:
        env["export_capable"] = False
        env["reason"] = f"Export dependency missing: {e}"
        return env

    env["export_capable"] = True
    return env


def get_qualified_detector_finalists(
    benchmark_results_dir: Path | str = "benchmark_results",
) -> tuple[list[str], str]:
    """
    Inspect existing benchmark results from Phase 1.3 to identify qualified detector finalists.

    Rules:
    - Finalists MUST be supported by measured Phase 1.3 evidence (successful runs with real telemetry).
    - If no measured results exist (e.g. dataset was unavailable or runs failed), finalists cannot be established.
    - If finalists have not been established, returns ([], "NO QUALIFIED DETECTOR FINALISTS").
    """
    results_path = Path(benchmark_results_dir)
    if not results_path.exists():
        return [], "NO QUALIFIED DETECTOR FINALISTS"

    json_files = sorted(results_path.glob("*.json"))
    if not json_files:
        return [], "NO QUALIFIED DETECTOR FINALISTS"

    candidate_success_counts: dict[str, int] = {}
    for jf in json_files:
        try:
            data = json.loads(jf.read_text(encoding="utf-8"))
        except Exception:
            continue

        if not data.get("datasetAvailable", False):
            continue

        results = data.get("results", [])
        for attempt in results:
            if attempt.get("status") == "SUCCESS":
                cfg = attempt.get("config", {})
                cand_id = cfg.get("candidateId") or cfg.get("candidate_id")
                if cand_id:
                    candidate_success_counts[cand_id] = candidate_success_counts.get(cand_id, 0) + 1

    if not candidate_success_counts:
        return [], "NO QUALIFIED DETECTOR FINALISTS"

    # Candidates that achieved successful benchmark measurements qualify as finalists
    finalists = sorted(candidate_success_counts.keys())
    return finalists, f"QUALIFIED DETECTOR FINALISTS: {', '.join(finalists)}"


def export_detector_to_tensorrt_fp16(
    model_path: str | Path,
    imgsz: int = 640,
    device: str = "cuda:0",
    output_dir: Path | None = None,
    half: bool = True,
) -> Path:
    """
    Export a detector PyTorch model checkpoint to a TensorRT FP16 engine artifact.

    Rules:
    - FP16 ONLY: half must be True. Rejects INT8 explicitly.
    - Explicit failure states:
      - CUDA missing -> CUDAIncompatibilityError
      - TensorRT missing -> RuntimeUnavailableError
      - Model checkpoint missing -> ModelNotFoundError
      - Export command failure -> TensorRTExportError
    - Engine artifact is saved in a local cache directory, never in the git working tree.
    """
    if not half:
        raise InvalidEngineConfigError("Only FP16 precision is supported for TensorRT export. INT8 is not implemented.")

    env = check_tensorrt_environment(device=device)
    if not env["cuda_available"]:
        raise CUDAIncompatibilityError(
            f"Cannot export to TensorRT: CUDA is unavailable on this host. {env.get('reason')}"
        )
    if not env["tensorrt_available"]:
        raise RuntimeUnavailableError(
            f"Cannot export to TensorRT: TensorRT environment unavailable. {env.get('reason')}"
        )

    model_p = Path(model_path)
    if not model_p.is_file():
        raise ModelNotFoundError(f"Detector checkpoint '{model_path}' not found locally for export.")

    cache_dir = output_dir if output_dir is not None else DEFAULT_CACHE_DIR
    cache_dir.mkdir(parents=True, exist_ok=True)

    expected_engine_name = f"{model_p.stem}_{imgsz}_fp16.engine"
    expected_engine_path = cache_dir / expected_engine_name

    # If engine already exists in cache, return existing artifact
    if expected_engine_path.is_file():
        return expected_engine_path

    try:
        from ultralytics import YOLO
        model = YOLO(str(model_p))
        exported_path_str = model.export(
            format="engine",
            half=True,
            dynamic=False,
            imgsz=imgsz,
            device=device,
        )
        exported_path = Path(exported_path_str)
        if not exported_path.is_file():
            raise TensorRTExportError(
                f"Export succeeded but output file not found at '{exported_path_str}'"
            )
        # Move or symlink into cache_dir if not already there
        if exported_path.resolve() != expected_engine_path.resolve():
            import shutil
            shutil.copy2(str(exported_path), str(expected_engine_path))
            return expected_engine_path
        return exported_path
    except (CUDAIncompatibilityError, RuntimeUnavailableError, ModelNotFoundError):
        raise
    except Exception as e:
        raise TensorRTExportError(
            f"Failed to export detector model '{model_path}' to TensorRT FP16: {e}"
        ) from e


def build_tensorrt_run_config(
    baseline: BenchmarkRunConfig,
    engine_artifact_path: str | Path | None = None,
) -> BenchmarkRunConfig:
    """Build a TensorRT FP16 BenchmarkRunConfig from a baseline PyTorch config."""
    return replace(
        baseline,
        config_id=f"{baseline.config_id}__tensorrt_fp16",
        runtime="tensorrt",
        precision="fp16",
        model_artifact_reference=str(engine_artifact_path) if engine_artifact_path else None,
    )


def run_tensorrt_fp16_benchmark(
    manifest: BenchmarkManifest,
    workspace_root: Path,
    *,
    baseline: BenchmarkRunConfig,
    benchmark_results_dir: Path | str = "benchmark_results",
    clip_ids: list[str] | None = None,
    availability_checker: Callable[[BenchmarkRunConfig, Path], tuple[bool, str]] | None = None,
    execute_one: Callable[..., Any] = execute_tracking_run,
    timestamp_factory: Callable[[], str] = _utc_now,
    run_group_id_factory: Callable[[], str] = _new_run_group_id,
) -> tuple[BenchmarkBundle, str]:
    """
    Execute TensorRT FP16 benchmark for qualified detector finalists.

    If finalists have not been established from measured Phase 1.3 evidence:
    STOPS and reports: NO QUALIFIED DETECTOR FINALISTS
    """
    finalists, finalist_status = get_qualified_detector_finalists(benchmark_results_dir)
    created_at = timestamp_factory()
    run_group_id = run_group_id_factory()

    if not finalists:
        status_msg = "NO QUALIFIED DETECTOR FINALISTS"
        empty_bundle = BenchmarkBundle(
            manifest_id=manifest.manifest_id,
            run_group_id=run_group_id,
            created_at=created_at,
            dataset_available=False,
            dataset_status=status_msg,
            configurations=[build_tensorrt_run_config(baseline)],
            configuration_availability={
                f"{baseline.config_id}__tensorrt_fp16": {
                    "available": False,
                    "reason": status_msg,
                }
            },
            selected_clip_ids=clip_ids or [c.id for c in manifest.clips],
            results=[],
            follow_up_1280="Cannot determine",
        )
        return empty_bundle, status_msg

    # Qualified finalists established: create TensorRT FP16 configurations
    configs = [
        build_tensorrt_run_config(
            replace(baseline, candidate_id=f_id, detector=f"{f_id}.pt")
        )
        for f_id in finalists
    ]

    bundle = run_benchmark_matrix(
        manifest,
        workspace_root,
        configs=configs,
        clip_ids=clip_ids,
        execute_one=execute_one,
        availability_checker=availability_checker or _default_availability,
        timestamp_factory=timestamp_factory,
        run_group_id_factory=run_group_id_factory,
    )
    return bundle, f"TENSORRT FP16 BENCHMARK EXECUTED FOR FINALISTS: {', '.join(finalists)}"
