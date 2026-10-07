"""
runtime_doctor.py — SportsScout Windows Development & AI Runtime Doctor

Evaluates the workstation environment against the Phase 3 tracking stack requirements:
- System hardware & OS (Windows 11, CPU, RAM, GPUs)
- Development toolchain (Git, Node 22.x, npm, Python 3.12)
- AI accelerator & CUDA runtime (PyTorch CUDA, real tensor execution)
- Core vision models (YOLOv8n detector, YOLOv8n-pose, RallyLens TrackNet shuttle)
- Module imports & initialization (ByteTrack, Semantic Identity, Court Calibration, Shuttle)
- Local services (Port 8000 AI service, status, capabilities)

Outputs structured diagnosis and returns 0 on success or 1 on blocking failure.
"""

from __future__ import annotations

import sys
import os
import platform
import subprocess
import hashlib
import time
from pathlib import Path
from typing import Any

# Ensure project root and ai_service are on path
REPO_ROOT = Path(__file__).resolve().parent.parent
AI_SERVICE_DIR = Path(__file__).resolve().parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))
if str(AI_SERVICE_DIR) not in sys.path:
    sys.path.insert(0, str(AI_SERVICE_DIR))


def _cmd_version(cmd: list[str]) -> str | None:
    import shutil
    try:
        binary = shutil.which(cmd[0]) or shutil.which(f"{cmd[0]}.cmd") or cmd[0]
        exec_cmd = [binary] + cmd[1:]
        res = subprocess.run(exec_cmd, capture_output=True, text=True, timeout=5, shell=False)
        if res.returncode == 0:
            return res.stdout.strip()
    except Exception:
        pass
    return None


def run_doctor() -> int:
    blocking_failures: list[str] = []
    warnings: list[str] = []

    print("=" * 70)
    print(" SPORTSCOUT RUNTIME DOCTOR — Phase 3 Workstation Environment Check")
    print("=" * 70)

    # 1. System Inventory
    print("\n[1] SYSTEM INVENTORY")
    os_name = platform.platform()
    py_arch = platform.architecture()[0]
    cpu_name = platform.processor() or "Unknown CPU"
    print(f"  OS:           {os_name} ({py_arch})")
    print(f"  CPU:          {cpu_name}")

    # Memory Check
    ram_gb = None
    free_ram_gb = None
    try:
        import psutil
        vm = psutil.virtual_memory()
        ram_gb = round(vm.total / (1024**3), 2)
        free_ram_gb = round(vm.available / (1024**3), 2)
        print(f"  RAM:          {ram_gb} GB total, {free_ram_gb} GB available")
    except Exception:
        print("  RAM:          Information unavailable (psutil not installed)")

    # GPU Detection
    nvidia_found = False
    amd_found = False
    try:
        wmic = subprocess.run(
            ["powershell", "-NoProfile", "-Command",
             "Get-CimInstance Win32_VideoController | Select-Object -ExpandProperty Name"],
            capture_output=True, text=True, timeout=5
        )
        if wmic.returncode == 0:
            gpu_lines = [line.strip() for line in wmic.stdout.splitlines() if line.strip()]
            for g in gpu_lines:
                print(f"  GPU Adapter:  {g}")
                if "nvidia" in g.lower():
                    nvidia_found = True
                if "radeon" in g.lower() or "amd" in g.lower():
                    amd_found = True
    except Exception:
        pass

    # nvidia-smi
    smi_out = _cmd_version(["nvidia-smi", "--query-gpu=name,driver_version,memory.total", "--format=csv,noheader"])
    if smi_out:
        print(f"  NVIDIA-SMI:   {smi_out}")
    else:
        print("  NVIDIA-SMI:   Not available or no NVIDIA device responded")

    # 2. Development Tooling
    print("\n[2] DEVELOPMENT TOOLING")
    git_ver = _cmd_version(["git", "--version"])
    if git_ver:
        print(f"  Git:          PASS ({git_ver})")
    else:
        warnings.append("Git is not found on system PATH")
        print("  Git:          WARN (Not in PATH)")

    node_ver = _cmd_version(["node", "--version"])
    if node_ver:
        if node_ver.startswith("v22."):
            print(f"  Node.js:      PASS ({node_ver} - recommended 22.x)")
        else:
            warnings.append(f"Node.js version {node_ver} is installed, but 22.x is recommended")
            print(f"  Node.js:      WARN ({node_ver})")
    else:
        blocking_failures.append("Node.js is not found on PATH")
        print("  Node.js:      FAIL (Missing)")

    npm_ver = _cmd_version(["npm", "--version"])
    if npm_ver:
        print(f"  npm:          PASS (v{npm_ver})")
    else:
        warnings.append("npm is not found on PATH")
        print("  npm:          WARN (Missing)")

    py_ver = f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}"
    py_path = sys.executable
    is_local_venv = ".local-services" in py_path.lower()
    print(f"  Python:       PASS ({py_ver} at {py_path})")
    if is_local_venv:
        print("  Environment:  PASS (Project-local venv .local-services/python)")
    else:
        warnings.append("Python is running from outside .local-services/python")
        print("  Environment:  WARN (Not project-local venv)")

    # 3. AI Accelerator & CUDA Runtime
    print("\n[3] AI ACCELERATOR & CUDA RUNTIME")
    torch_installed = False
    cuda_available = False
    cuda_executed = False

    try:
        import torch
        torch_installed = True
        torch_ver = torch.__version__
        cuda_build = torch.version.cuda
        cuda_available = torch.cuda.is_available()
        print(f"  PyTorch:      PASS ({torch_ver}, CUDA build: {cuda_build})")
        print(f"  CUDA Device:  {'PASS (cuda.is_available() == True)' if cuda_available else 'FAIL (cuda.is_available() == False)'}")

        if cuda_available:
            dev_name = torch.cuda.get_device_name(0)
            print(f"  GPU Name:     {dev_name}")
            # Real tensor execution
            try:
                x = torch.randn((1024, 1024), device="cuda")
                y = x @ x
                torch.cuda.synchronize()
                if y.device.type == "cuda":
                    cuda_executed = True
                    print(f"  CUDA MatMul:  PASS (Executed 1024x1024 on {y.device})")
                else:
                    print("  CUDA MatMul:  FAIL (Output device is not CUDA)")
            except Exception as e:
                print(f"  CUDA MatMul:  FAIL ({e})")
        else:
            blocking_failures.append("PyTorch CUDA is not available on host with NVIDIA GPU")
    except Exception as e:
        blocking_failures.append(f"PyTorch import failed: {e}")
        print(f"  PyTorch:      FAIL ({e})")

    if not cuda_executed:
        blocking_failures.append("Real CUDA tensor execution failed")

    # Torchvision, Ultralytics, OpenCV
    try:
        import torchvision
        print(f"  Torchvision:  PASS ({torchvision.__version__})")
    except Exception as e:
        blocking_failures.append(f"torchvision missing: {e}")
        print(f"  Torchvision:  FAIL ({e})")

    try:
        import ultralytics
        print(f"  Ultralytics:  PASS (v{ultralytics.__version__})")
    except Exception as e:
        blocking_failures.append(f"ultralytics missing: {e}")
        print(f"  Ultralytics:  FAIL ({e})")

    try:
        import cv2
        print(f"  OpenCV:       PASS (v{cv2.__version__})")
    except Exception as e:
        blocking_failures.append(f"opencv missing: {e}")
        print(f"  OpenCV:       FAIL ({e})")

    # 4. Models & Weights
    print("\n[4] MODELS & WEIGHTS")
    expected_models = {
        "yolov8n.pt": "Player Detector",
        "yolov8n-pose.pt": "Athlete Pose",
        "rallylens-shuttle-tracknet.pth": "Shuttle TrackNet (RallyLens)",
    }
    model_paths = [
        REPO_ROOT / ".local-models",
        Path.home() / ".cache" / "ultralytics",
    ]

    for model_name, desc in expected_models.items():
        found = False
        target_file: Path | None = None
        for base in model_paths:
            candidate = base / model_name
            if candidate.is_file():
                found = True
                target_file = candidate
                break
        if found and target_file:
            size_mb = round(target_file.stat().st_size / (1024**2), 2)
            print(f"  {model_name:<30} AVAILABLE ({desc}, {size_mb} MB)")
            if model_name == "rallylens-shuttle-tracknet.pth":
                # Validate exact hash
                with target_file.open("rb") as f:
                    actual_sha = hashlib.file_digest(f, "sha256").hexdigest()
                expected_sha = "08b7e904dae4fd5250d51cd82c4d58d1663351f32037df6aed77547065f026a5"
                if actual_sha.lower() == expected_sha.lower():
                    print("    SHA-256:                     PASS (Hash matches audited RallyLens checkpoint)")
                else:
                    blocking_failures.append("Shuttle checkpoint SHA-256 hash mismatch")
                    print(f"    SHA-256:                     FAIL (Got {actual_sha}, expected {expected_sha})")
        else:
            blocking_failures.append(f"Model {model_name} is missing")
            print(f"  {model_name:<30} FAIL (Missing)")

    # 5. Real Model Inference Verification
    print("\n[5] REAL MODEL INFERENCE ON ACCELERATOR")
    # Detector
    try:
        import numpy as np
        from ai_service.detector_adapter import UltralyticsDetectorAdapter
        detector = UltralyticsDetectorAdapter(model_path="yolov8n.pt", device="cuda")
        detector._init_model()
        dummy_frame = np.zeros((720, 1280, 3), dtype=np.uint8)
        det_res = detector.detect_and_track(frame=dummy_frame, conf=0.35, imgsz=640, device="cuda")
        eff_dev = detector.execution.device
        if eff_dev == "cuda":
            print(f"  YOLO Detector:                 EXECUTED (PASS, device=cuda:0, detections={len(det_res)})")
        else:
            warnings.append(f"Detector executed on fallback device: {eff_dev}")
            print(f"  YOLO Detector:                 EXECUTED (WARN, device={eff_dev})")
    except Exception as e:
        blocking_failures.append(f"Detector inference failed: {e}")
        print(f"  YOLO Detector:                 FAIL ({e})")

    # Pose
    try:
        from ai_service.pose_adapter import UltralyticsPoseAdapter
        pose = UltralyticsPoseAdapter(model_path="yolov8n-pose.pt", device="cuda")
        pose._init_detector()
        dummy_frame = np.zeros((720, 1280, 3), dtype=np.uint8)
        dummy_frame[100:400, 100:300] = 128
        pose_res = pose.estimate_pose_in_roi(dummy_frame, [100.0, 100.0, 300.0, 400.0])
        pose_dev = pose.get_provenance().get("effectiveDevice") if pose.get_provenance() else None
        if pose_dev == "cuda":
            print(f"  YOLO Pose:                     EXECUTED (PASS, device=cuda:0)")
        else:
            warnings.append(f"Pose executed on fallback device: {pose_dev}")
            print(f"  YOLO Pose:                     EXECUTED (WARN, device={pose_dev})")
    except Exception as e:
        blocking_failures.append(f"Pose inference failed: {e}")
        print(f"  YOLO Pose:                     FAIL ({e})")

    # Shuttle TrackNet
    try:
        from ai_service.rallylens_adapter import RallyLensTemporalModelAdapter
        from ai_service.shuttle_tracker import TemporalFrame
        shuttle_path = REPO_ROOT / ".local-models" / "rallylens-shuttle-tracknet.pth"
        if shuttle_path.is_file():
            shuttle_adapter = RallyLensTemporalModelAdapter(str(shuttle_path), device="cuda")
            shuttle_adapter.load()
            dummy_frames = [
                TemporalFrame(image=np.zeros((720, 1280, 3), dtype=np.uint8), timestamp_sec=i * 0.033, frame_index=i)
                for i in range(9)
            ]
            shuttle_out = shuttle_adapter.infer(dummy_frames)
            sh_dev = shuttle_adapter.execution.device
            sh_shape = shuttle_adapter.last_output_shape
            if sh_dev == "cuda" and sh_shape == [1, 8, 288, 512]:
                print(f"  Shuttle TrackNet:              EXECUTED (PASS, device=cuda:0, shape={sh_shape})")
            else:
                warnings.append(f"Shuttle TrackNet executed with device={sh_dev}, shape={sh_shape}")
                print(f"  Shuttle TrackNet:              EXECUTED (WARN, device={sh_dev}, shape={sh_shape})")
        else:
            blocking_failures.append("Shuttle model file missing for forward pass test")
            print("  Shuttle TrackNet:              FAIL (Model missing)")
    except Exception as e:
        blocking_failures.append(f"Shuttle TrackNet inference failed: {e}")
        print(f"  Shuttle TrackNet:              FAIL ({e})")

    # 6. Tracking Stack Component Imports & Runtime
    print("\n[6] TRACKING STACK RUNTIME MODULES")
    try:
        from ai_service.engine_config import resolve_tracker_config
        from ai_service.tracker_adapter import TrackerProvenance
        cfg = resolve_tracker_config("bytetrack")
        TrackerProvenance("bytetrack", cfg, False, None)
        print(f"  ByteTrack:                     PASS (Runtime ready, config={cfg})")
    except Exception as e:
        blocking_failures.append(f"ByteTrack init failed: {e}")
        print(f"  ByteTrack:                     FAIL ({e})")

    try:
        from ai_service.semantic_identity import compute_identity_association_cost, match_tracks_to_profiles_with_reid
        print("  Semantic Identity:             PASS (Runtime ready)")
    except Exception as e:
        blocking_failures.append(f"Semantic identity import failed: {e}")
        print(f"  Semantic Identity:             FAIL ({e})")

    try:
        from ai_service.court_calibration import AutomaticCourtCalibrationProvider, TemporalStabilityValidator
        from ai_service.court_mapper import CourtMapper
        AutomaticCourtCalibrationProvider()
        TemporalStabilityValidator()
        CourtMapper()
        print("  Court Calibration Runtime:     RUNTIME READY (Classical CV Auto-Court & Validator ready)")
    except Exception as e:
        blocking_failures.append(f"Court calibration init failed: {e}")
        print(f"  Court Calibration Runtime:     FAIL ({e})")

    try:
        from ai_service.shuttle_pipeline import create_shuttle_pipeline, ShuttlePipelineConfig
        s_cfg = ShuttlePipelineConfig(
            enabled=True,
            provider="rallylens_tracknet",
            model_path=str(REPO_ROOT / ".local-models" / "rallylens-shuttle-tracknet.pth"),
            window_size=9,
            input_width=512,
            input_height=288,
            runtime="pytorch",
            precision="fp32",
            device="cuda",
        )
        create_shuttle_pipeline(s_cfg)
        print("  Shuttle Pipeline Integration:  PASS (Pipeline factory ready)")
    except Exception as e:
        blocking_failures.append(f"Shuttle pipeline init failed: {e}")
        print(f"  Shuttle Pipeline Integration:  FAIL ({e})")

    # 7. Local Services & Ports
    print("\n[7] LOCAL SERVICE & PORT STATUS")
    try:
        import urllib.request
        import json
        req = urllib.request.Request("http://127.0.0.1:8000/api/status", headers={"User-Agent": "SportsScoutDoctor"})
        with urllib.request.urlopen(req, timeout=1.5) as resp:
            st = json.loads(resp.read().decode())
            print(f"  AI Service (:8000):            RUNNING (Status: {st.get('status')}, Device: {st.get('device')})")
        req_cap = urllib.request.Request("http://127.0.0.1:8000/api/capabilities", headers={"User-Agent": "SportsScoutDoctor"})
        with urllib.request.urlopen(req_cap, timeout=2.0) as resp:
            cap = json.loads(resp.read().decode())
            print(f"  Capabilities:                  READY (Selected: {cap.get('selectedDevice')}, CUDA: {cap.get('cudaAvailable')}, Shuttle: {cap.get('shuttle', {}).get('probeStatus')})")
    except Exception:
        print("  AI Service (:8000):            NOT RUNNING (Start with 'npm run start:local')")

    # Summary
    print("\n" + "=" * 70)
    print(" DOCTOR SUMMARY")
    print("=" * 70)
    if warnings:
        print("WARNINGS:")
        for w in warnings:
            print(f"  - {w}")

    if blocking_failures:
        print("BLOCKING FAILURES:")
        for f in blocking_failures:
            print(f"  - {f}")
        print("\nOVERALL STATUS: FAIL — ENVIRONMENT BLOCKED")
        return 1
    else:
        print("ALL CRITICAL CHECKS PASSED: ZERO BLOCKERS DETECTED.")
        print("OVERALL STATUS: PASS — ENVIRONMENT READY FOR PHASE 3 VALIDATION")
        return 0


if __name__ == "__main__":
    sys.exit(run_doctor())
