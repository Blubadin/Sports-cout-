"""Mode-aware execution doctor; inspect the configured artifacts, never download weights."""
from __future__ import annotations
import argparse
import json
from pathlib import Path
import sys

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT / "ai_service"))


def accelerator_probe(mode, torch_module):
    """CPU workflows never require a CUDA driver. CUDA needs a real operation."""
    from device_runtime import resolve_device
    device = resolve_device(mode, torch_module=torch_module)
    tensor = torch_module.ones((16, 16), device=device)
    result = tensor @ tensor
    if device == "cuda":
        torch_module.cuda.synchronize()
    if result.device.type != device or not bool(torch_module.isfinite(result).all().item()):
        raise RuntimeError("Tensor execution did not validate the selected device")
    return device


def configured_path(value):
    path = Path(value)
    if path.is_file():
        return path.resolve()
    local = REPO_ROOT / ".local-models" / path
    if local.is_file():
        return local.resolve()
    raise FileNotFoundError(f"Configured model missing: {value}")


def run_doctor(mode="auto", engine_config=None, shuttle_model=None):
    import numpy as np
    from engine_config import TrackingEngineConfig
    report = {"mode": mode, "executionValidated": False, "models": {}, "errors": []}
    config = TrackingEngineConfig.from_dict(engine_config) if engine_config else TrackingEngineConfig()
    try:
        import torch
        report["effectiveDevice"] = accelerator_probe(mode, torch)
        report["torchVersion"] = torch.__version__
        report["cudaAvailable"] = torch.cuda.is_available()
        report["executionValidated"] = True
        report["fallbackReason"] = "CUDA unavailable; CPU selected" if mode == "auto" and report["effectiveDevice"] == "cpu" else None
    except Exception as error:
        report["errors"].append(f"Accelerator execution: {error}")
        print(json.dumps(report, indent=2))
        return 1
    from detector_adapter import UltralyticsDetectorAdapter
    from pose_adapter import create_pose_provider
    frame = np.zeros((720, 1280, 3), dtype=np.uint8)
    try:
        path = configured_path(config.model_artifact_reference or config.detector_model)
        detector = UltralyticsDetectorAdapter(str(path), device=mode, runtime=config.runtime, precision=config.precision)
        detector.detect_and_track(frame, conf=config.confidence_threshold, imgsz=config.detector_input_size, device=report["effectiveDevice"])
        report["models"]["detector"] = {"path": str(path), **detector.get_provenance()}
    except Exception as error:
        report["errors"].append(f"Detector execution: {error}")
    if config.pose_model:
        try:
            path = configured_path(config.pose_model)
            pose = create_pose_provider(model_path=str(path), device=mode, architecture=config.pose_architecture)
            pose.estimate_pose_in_roi(frame, [100., 100., 300., 400.])
            report["models"]["pose"] = {"path": str(path), **pose.get_provenance()}
        except Exception as error:
            report["errors"].append(f"Pose execution: {error}")
    if shuttle_model:
        try:
            from rallylens_adapter import RallyLensTemporalModelAdapter
            from shuttle_tracker import TemporalFrame
            path = configured_path(shuttle_model)
            shuttle = RallyLensTemporalModelAdapter(str(path), device=mode)
            shuttle.infer([TemporalFrame(image=frame, timestamp_sec=i/30, frame_index=i) for i in range(9)])
            report["models"]["shuttle"] = {"path": str(path), **shuttle.get_provenance()}
        except Exception as error:
            report["errors"].append(f"Shuttle execution: {error}")
    report["status"] = "FAIL" if report["errors"] else "PASS"
    print(json.dumps(report, indent=2))
    return int(bool(report["errors"]))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--mode", choices=("auto", "cuda", "cpu"), default="auto")
    parser.add_argument("--engine-config", type=Path, help="JSON using TrackingEngineConfig production schema")
    parser.add_argument("--shuttle-model", help="Configured RallyLens artifact; omitted when shuttle disabled")
    args = parser.parse_args()
    sys.exit(run_doctor(args.mode, json.loads(args.engine_config.read_text()) if args.engine_config else None, args.shuttle_model))
