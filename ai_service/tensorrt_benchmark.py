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
from dataclasses import dataclass, field, replace
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
    BenchmarkAttempt,
    BenchmarkBundle,
    BenchmarkCommonConfig,
    BenchmarkRunConfig,
    BenchmarkRunMetrics,
    RUNTIME_PAIR_INVARIANTS,
    _default_availability,
    _make_attempt,
    _new_run_group_id,
    _utc_now,
    build_runtime_comparison_pair,
    execute_tracking_run,
    resolve_local_model_path,
    run_benchmark_matrix,
    validate_runtime_comparison_pair,
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


@dataclass
class RuntimeComparisonSummary:
    """Summary of fair runtime comparison between PyTorch baseline and TensorRT FP16."""
    candidate_id: str
    input_size: int
    clip_id: str | None = None

    # Performance / Timing
    pytorch_fps: float | None = None
    tensorrt_fps: float | None = None
    fps_difference: float | None = None
    speedup_ratio: float | None = None

    pytorch_elapsed: float | None = None
    tensorrt_elapsed: float | None = None
    elapsed_difference: float | None = None

    pytorch_processing_ratio: float | None = None
    tensorrt_processing_ratio: float | None = None
    processing_ratio_difference: float | None = None

    # Memory / Resources (only if actually measurable; never fabricated)
    pytorch_vram_mb: float | None = None
    tensorrt_vram_mb: float | None = None
    vram_difference_mb: float | None = None

    # Correctness / Tracking Integrity
    pytorch_observed_coverage: float | None = None
    tensorrt_observed_coverage: float | None = None
    coverage_difference: float | None = None

    pytorch_simultaneous_coverage: float | None = None
    tensorrt_simultaneous_coverage: float | None = None
    simultaneous_coverage_difference: float | None = None

    pytorch_lost_percent: float | None = None
    tensorrt_lost_percent: float | None = None
    lost_difference_percent: float | None = None

    pytorch_raw_switches: int | None = None
    tensorrt_raw_switches: int | None = None
    raw_switches_difference: int | None = None

    pytorch_semantic_switches: int | None = None
    tensorrt_semantic_switches: int | None = None
    semantic_switches_difference: int | None = None

    pytorch_court_position_error: float | None = None
    tensorrt_court_position_error: float | None = None
    court_position_error_diff: float | None = None

    pytorch_distance_error: float | None = None
    tensorrt_distance_error: float | None = None
    distance_error_diff: float | None = None

    # Quality regression evaluation
    quality_regression: bool = False
    quality_regression_notes: list[str] = field(default_factory=list)


def compare_runtime_metrics(
    pytorch_metrics: BenchmarkRunMetrics,
    tensorrt_metrics: BenchmarkRunMetrics,
    candidate_id: str = "yolov8n",
    input_size: int = 640,
    clip_id: str | None = None,
) -> RuntimeComparisonSummary:
    """
    Fairly evaluate speed, correctness, and resource differences between PyTorch and TensorRT FP16.
    Enforces that fastest runtime does not automatically win by detecting and flagging quality regressions.
    Never fabricates missing metrics or VRAM measurements.
    """
    # Speed & timing
    pt_fps = pytorch_metrics.analysis_fps
    trt_fps = tensorrt_metrics.analysis_fps
    fps_diff = round(trt_fps - pt_fps, 2) if trt_fps is not None and pt_fps is not None else None
    speedup = round(trt_fps / pt_fps, 2) if trt_fps is not None and pt_fps is not None and pt_fps > 0 else None

    pt_elapsed = pytorch_metrics.elapsed_seconds
    trt_elapsed = tensorrt_metrics.elapsed_seconds
    elapsed_diff = round(trt_elapsed - pt_elapsed, 4) if trt_elapsed is not None and pt_elapsed is not None else None

    pt_pr = pytorch_metrics.processing_ratio
    trt_pr = tensorrt_metrics.processing_ratio
    pr_diff = round(trt_pr - pt_pr, 4) if trt_pr is not None and pt_pr is not None else None

    # Peak VRAM (truthfully recorded only if measurable)
    pt_vram = pytorch_metrics.peak_vram_mb
    trt_vram = tensorrt_metrics.peak_vram_mb
    vram_diff = round(trt_vram - pt_vram, 2) if trt_vram is not None and pt_vram is not None else None

    # Correctness / Tracking Integrity
    pt_cov = pytorch_metrics.mean_target_coverage
    trt_cov = tensorrt_metrics.mean_target_coverage
    cov_diff = round(trt_cov - pt_cov, 4) if trt_cov is not None and pt_cov is not None else None

    pt_sim = pytorch_metrics.simultaneous_target_coverage
    trt_sim = tensorrt_metrics.simultaneous_target_coverage
    sim_diff = round(trt_sim - pt_sim, 4) if trt_sim is not None and pt_sim is not None else None

    pt_lost = pytorch_metrics.lost_percent
    trt_lost = tensorrt_metrics.lost_percent
    lost_diff = round(trt_lost - pt_lost, 2) if trt_lost is not None and pt_lost is not None else None

    pt_raw_sw = pytorch_metrics.raw_tracker_id_switches
    trt_raw_sw = tensorrt_metrics.raw_tracker_id_switches
    raw_sw_diff = (trt_raw_sw - pt_raw_sw) if trt_raw_sw is not None and pt_raw_sw is not None else None

    pt_sem_sw = pytorch_metrics.semantic_player_id_switches
    trt_sem_sw = tensorrt_metrics.semantic_player_id_switches
    sem_sw_diff = (trt_sem_sw - pt_sem_sw) if trt_sem_sw is not None and pt_sem_sw is not None else None

    pt_cp_err = pytorch_metrics.mean_court_position_error
    trt_cp_err = tensorrt_metrics.mean_court_position_error
    cp_err_diff = round(trt_cp_err - pt_cp_err, 4) if trt_cp_err is not None and pt_cp_err is not None else None

    pt_dist_err = pytorch_metrics.distance_error
    trt_dist_err = tensorrt_metrics.distance_error
    dist_err_diff = round(trt_dist_err - pt_dist_err, 4) if trt_dist_err is not None and pt_dist_err is not None else None

    # Regression detection
    regressions: list[str] = []
    if cov_diff is not None and cov_diff < -0.02:
        regressions.append(f"Observed coverage dropped by {abs(cov_diff)*100:.1f}%")
    if sim_diff is not None and sim_diff < -0.02:
        regressions.append(f"Simultaneous coverage dropped by {abs(sim_diff)*100:.1f}%")
    if lost_diff is not None and lost_diff > 2.0:
        regressions.append(f"Lost percent increased by {lost_diff:.1f}%")
    if sem_sw_diff is not None and sem_sw_diff > 0:
        regressions.append(f"Semantic identity switches increased by {sem_sw_diff}")
    if cp_err_diff is not None and cp_err_diff > 0.05:
        regressions.append(f"Court-position error increased by {cp_err_diff:.3f}m")
    if dist_err_diff is not None and dist_err_diff > 0.5:
        regressions.append(f"Distance error increased by {dist_err_diff:.2f}m")

    return RuntimeComparisonSummary(
        candidate_id=candidate_id,
        input_size=input_size,
        clip_id=clip_id,
        pytorch_fps=pt_fps,
        tensorrt_fps=trt_fps,
        fps_difference=fps_diff,
        speedup_ratio=speedup,
        pytorch_elapsed=pt_elapsed,
        tensorrt_elapsed=trt_elapsed,
        elapsed_difference=elapsed_diff,
        pytorch_processing_ratio=pt_pr,
        tensorrt_processing_ratio=trt_pr,
        processing_ratio_difference=pr_diff,
        pytorch_vram_mb=pt_vram,
        tensorrt_vram_mb=trt_vram,
        vram_difference_mb=vram_diff,
        pytorch_observed_coverage=pt_cov,
        tensorrt_observed_coverage=trt_cov,
        coverage_difference=cov_diff,
        pytorch_simultaneous_coverage=pt_sim,
        tensorrt_simultaneous_coverage=trt_sim,
        simultaneous_coverage_difference=sim_diff,
        pytorch_lost_percent=pt_lost,
        tensorrt_lost_percent=trt_lost,
        lost_difference_percent=lost_diff,
        pytorch_raw_switches=pt_raw_sw,
        tensorrt_raw_switches=trt_raw_sw,
        raw_switches_difference=raw_sw_diff,
        pytorch_semantic_switches=pt_sem_sw,
        tensorrt_semantic_switches=trt_sem_sw,
        semantic_switches_difference=sem_sw_diff,
        pytorch_court_position_error=pt_cp_err,
        tensorrt_court_position_error=trt_cp_err,
        court_position_error_diff=cp_err_diff,
        pytorch_distance_error=pt_dist_err,
        tensorrt_distance_error=trt_dist_err,
        distance_error_diff=dist_err_diff,
        quality_regression=len(regressions) > 0,
        quality_regression_notes=regressions,
    )


def format_runtime_comparison_output(s: RuntimeComparisonSummary) -> str:
    """Format runtime comparison summary matching Phase 1.6C specification."""
    lines: list[str] = []

    # PYTORCH
    lines.append("PYTORCH:")
    lines.append(f"  Candidate: {s.candidate_id} @ {s.input_size}px")
    if s.clip_id:
        lines.append(f"  Clip: {s.clip_id}")
    lines.append(f"  Analysis FPS: {f'{s.pytorch_fps:.2f}' if s.pytorch_fps is not None else 'Unavailable'}")
    lines.append(f"  Elapsed Time: {f'{s.pytorch_elapsed:.2f}s' if s.pytorch_elapsed is not None else 'Unavailable'}")
    lines.append(f"  Processing Ratio: {f'{s.pytorch_processing_ratio:.3f}' if s.pytorch_processing_ratio is not None else 'Unavailable'}")
    lines.append(f"  Peak VRAM: {f'{s.pytorch_vram_mb:.1f} MB' if s.pytorch_vram_mb is not None else 'Unavailable (not measurable / CPU)'}")
    lines.append(f"  Observed Coverage: {f'{s.pytorch_observed_coverage * 100:.1f}%' if s.pytorch_observed_coverage is not None else 'Unavailable'}")
    lines.append(f"  Simultaneous Coverage: {f'{s.pytorch_simultaneous_coverage * 100:.1f}%' if s.pytorch_simultaneous_coverage is not None else 'Unavailable'}")
    lines.append(f"  Lost %: {f'{s.pytorch_lost_percent:.1f}%' if s.pytorch_lost_percent is not None else 'Unavailable'}")
    lines.append(f"  Identity Continuity: raw switches = {s.pytorch_raw_switches if s.pytorch_raw_switches is not None else 'N/A'}, semantic switches = {s.pytorch_semantic_switches if s.pytorch_semantic_switches is not None else 'N/A'}")
    lines.append(f"  Court-Position Error: {f'{s.pytorch_court_position_error:.3f}m' if s.pytorch_court_position_error is not None else 'Unavailable'}")
    lines.append(f"  Distance Error: {f'{s.pytorch_distance_error:.2f}m' if s.pytorch_distance_error is not None else 'Unavailable'}")
    lines.append("")

    # TENSORRT
    lines.append("TENSORRT:")
    lines.append(f"  Candidate: {s.candidate_id} @ {s.input_size}px (FP16)")
    if s.clip_id:
        lines.append(f"  Clip: {s.clip_id}")
    lines.append(f"  Analysis FPS: {f'{s.tensorrt_fps:.2f}' if s.tensorrt_fps is not None else 'Unavailable'}")
    lines.append(f"  Elapsed Time: {f'{s.tensorrt_elapsed:.2f}s' if s.tensorrt_elapsed is not None else 'Unavailable'}")
    lines.append(f"  Processing Ratio: {f'{s.tensorrt_processing_ratio:.3f}' if s.tensorrt_processing_ratio is not None else 'Unavailable'}")
    lines.append(f"  Peak VRAM: {f'{s.tensorrt_vram_mb:.1f} MB' if s.tensorrt_vram_mb is not None else 'Unavailable (not measurable / CPU)'}")
    lines.append(f"  Observed Coverage: {f'{s.tensorrt_observed_coverage * 100:.1f}%' if s.tensorrt_observed_coverage is not None else 'Unavailable'}")
    lines.append(f"  Simultaneous Coverage: {f'{s.tensorrt_simultaneous_coverage * 100:.1f}%' if s.tensorrt_simultaneous_coverage is not None else 'Unavailable'}")
    lines.append(f"  Lost %: {f'{s.tensorrt_lost_percent:.1f}%' if s.tensorrt_lost_percent is not None else 'Unavailable'}")
    lines.append(f"  Identity Continuity: raw switches = {s.tensorrt_raw_switches if s.tensorrt_raw_switches is not None else 'N/A'}, semantic switches = {s.tensorrt_semantic_switches if s.tensorrt_semantic_switches is not None else 'N/A'}")
    lines.append(f"  Court-Position Error: {f'{s.tensorrt_court_position_error:.3f}m' if s.tensorrt_court_position_error is not None else 'Unavailable'}")
    lines.append(f"  Distance Error: {f'{s.tensorrt_distance_error:.2f}m' if s.tensorrt_distance_error is not None else 'Unavailable'}")
    lines.append("")

    # SPEED DIFFERENCE
    lines.append("SPEED DIFFERENCE:")
    if s.speedup_ratio is not None and s.fps_difference is not None:
        lines.append(f"  Analysis FPS Delta: {s.fps_difference:+.2f} FPS ({s.speedup_ratio:.2f}x speedup)")
    else:
        lines.append("  Analysis FPS Delta: Unavailable")
    if s.elapsed_difference is not None:
        lines.append(f"  Elapsed Time Delta: {s.elapsed_difference:+.2f}s")
    else:
        lines.append("  Elapsed Time Delta: Unavailable")
    if s.processing_ratio_difference is not None:
        lines.append(f"  Processing Ratio Delta: {s.processing_ratio_difference:+.3f}")
    else:
        lines.append("  Processing Ratio Delta: Unavailable")
    lines.append("")

    # QUALITY DIFFERENCE
    lines.append("QUALITY DIFFERENCE:")
    if s.coverage_difference is not None:
        lines.append(f"  Observed Coverage Delta: {s.coverage_difference * 100:+.1f}%")
    else:
        lines.append("  Observed Coverage Delta: Unavailable")
    if s.simultaneous_coverage_difference is not None:
        lines.append(f"  Simultaneous Coverage Delta: {s.simultaneous_coverage_difference * 100:+.1f}%")
    else:
        lines.append("  Simultaneous Coverage Delta: Unavailable")
    if s.lost_difference_percent is not None:
        lines.append(f"  Lost % Delta: {s.lost_difference_percent:+.1f}%")
    else:
        lines.append("  Lost % Delta: Unavailable")
    raw_delta = f"{s.raw_switches_difference:+d}" if s.raw_switches_difference is not None else "N/A"
    sem_delta = f"{s.semantic_switches_difference:+d}" if s.semantic_switches_difference is not None else "N/A"
    lines.append(f"  Identity Switches Delta: raw = {raw_delta}, semantic = {sem_delta}")
    lines.append(f"  Court-Position Error Delta: {f'{s.court_position_error_diff:+.3f}m' if s.court_position_error_diff is not None else 'Unavailable'}")
    lines.append(f"  Distance Error Delta: {f'{s.distance_error_diff:+.2f}m' if s.distance_error_diff is not None else 'Unavailable'}")
    if s.quality_regression:
        lines.append(f"  Quality Regression: FLAGGED ({'; '.join(s.quality_regression_notes)})")
    else:
        lines.append("  Quality Regression: NONE (No significant quality degradation detected)")
    lines.append("")

    # RESOURCE DIFFERENCE
    lines.append("RESOURCE DIFFERENCE:")
    if s.vram_difference_mb is not None:
        lines.append(f"  Peak VRAM Delta: {s.vram_difference_mb:+.1f} MB (PyTorch: {s.pytorch_vram_mb:.1f} MB, TensorRT: {s.tensorrt_vram_mb:.1f} MB)")
    else:
        lines.append("  Peak VRAM Delta: Unavailable (VRAM not measurable / CUDA unavailable)")

    return "\n".join(lines)


def run_runtime_comparison_benchmark(
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
) -> tuple[BenchmarkBundle, list[RuntimeComparisonSummary], str]:
    """
    Execute PyTorch vs TensorRT FP16 comparison benchmark for qualified detector finalists.

    Rules:
    - If finalists have not been established from measured Phase 1.3 evidence:
      STOPS and reports: NO QUALIFIED DETECTOR FINALISTS
    - For each qualified finalist:
      Creates a strictly fair PyTorch vs TensorRT FP16 pair.
    - Evaluates performance metrics, tracking correctness, resource usage (VRAM if measurable).
    - Flags quality regression (e.g. coverage drops, lost tracking increases, ID swaps).
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
            configurations=list(build_runtime_comparison_pair(baseline)),
            configuration_availability={
                f"{baseline.config_id}__pytorch": {
                    "available": False,
                    "reason": status_msg,
                },
                f"{baseline.config_id}__tensorrt_fp16": {
                    "available": False,
                    "reason": status_msg,
                },
            },
            selected_clip_ids=clip_ids or [c.id for c in manifest.clips],
            results=[],
            follow_up_1280="Cannot determine",
        )
        return empty_bundle, [], status_msg

    # Qualified finalists established: create pairs for each finalist
    pairs: list[BenchmarkRunConfig] = []
    for f_id in finalists:
        f_base = replace(baseline, candidate_id=f_id, detector=f"{f_id}.pt")
        pt_cfg, trt_cfg = build_runtime_comparison_pair(f_base)
        pairs.extend([pt_cfg, trt_cfg])

    bundle = run_benchmark_matrix(
        manifest,
        workspace_root,
        configs=pairs,
        clip_ids=clip_ids,
        execute_one=execute_one,
        availability_checker=availability_checker or _default_availability,
        timestamp_factory=timestamp_factory,
        run_group_id_factory=run_group_id_factory,
    )

    summaries: list[RuntimeComparisonSummary] = []
    if bundle.dataset_available and bundle.results:
        grouped: dict[tuple[str, str, int], dict[str, BenchmarkAttempt]] = {}
        for res in bundle.results:
            if res.status != "SUCCESS":
                continue
            key = (res.clip_id, res.config.candidate_id, res.config.input_size)
            if key not in grouped:
                grouped[key] = {}
            grouped[key][res.config.runtime] = res

        for (c_id, cand_id, in_sz), attempts in grouped.items():
            if "pytorch" in attempts and "tensorrt" in attempts:
                pt_attempt = attempts["pytorch"]
                trt_attempt = attempts["tensorrt"]
                summary = compare_runtime_metrics(
                    pytorch_metrics=pt_attempt.metrics,
                    tensorrt_metrics=trt_attempt.metrics,
                    candidate_id=cand_id,
                    input_size=in_sz,
                    clip_id=c_id,
                )
                summaries.append(summary)

    status_msg = f"RUNTIME BENCHMARK EXECUTED FOR FINALISTS: {', '.join(finalists)}"
    return bundle, summaries, status_msg
