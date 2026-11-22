# Python Runtime Reproducibility & Hardware Strategy

**Authoritative Baseline:** Phase 3 Evaluation (2026-10-05)  
**Target Environment:** Windows 11 / Linux x86_64, Python 3.12 64-bit  
**Current remediation branch:** `fix/phase3-sol-correctness-v2`

---

## 1. Strategy & Dependency Architecture

To ensure both developer usability and byte-for-byte evaluation reproducibility, the repository uses a tiered dependency strategy:

1. **Base Requirements (`ai_service/requirements.txt`)**:
   Maintains flexible `>=` ranges for core libraries (e.g., `fastapi>=0.110.0`, `opencv-python>=4.9.0`, `ultralytics>=8.1.0`). This prevents developer installation failure across minor platform differences.
2. **Hardware Runtime Profiles**:
   - **NVIDIA CUDA (`ai_service/requirements-cuda.txt`)**: Declares explicit PyTorch with CUDA 12.4 index (`torch==2.5.1+cu124`, `torchvision==0.20.1+cu124`) chained with `-r requirements.txt`.
   - **CPU Runtime (`ai_service/requirements-cpu.txt`)**: Declares explicit CPU PyTorch index (`torch==2.5.1+cpu`, `torchvision==0.20.1+cpu`) chained with `-r requirements.txt`.
3. **Tested Constraints (`ai_service/constraints-tested.txt`)**:
   Freezes the exact package versions observed during the authoritative 2026-10-05 evaluation run. Use with `-c ai_service/constraints-tested.txt` for exact evaluation replication.

---

## 2. Historical Hardware Validation Matrix

The rows below summarize earlier recorded runs, not correctness certification of the current remediation. Current execution evidence and its limits are in `docs/evidence/PHASE_3_CORRECTNESS_V2_RESULTS.md`.

| Target / Accelerator | Status | Details |
|---|---|---|
| **NVIDIA GeForce RTX (CUDA 12.4)** | **VALIDATED ON REAL DATA** | Tested on NVIDIA RTX 4050 Laptop GPU (Ada Lovelace, Driver 577.09, 6,141 MiB VRAM). PyTorch 2.5.1+cu124, real FP32 tensor execution, YOLOv8n detector, YOLOv8n-pose, and TrackNet shuttle inference verified on real footage. |
| **CPU (Reference Fallback)** | **VALIDATED ON REAL DATA** | Tested with PyTorch 2.5.1+cpu. Evaluated on 8s and 10m real broadcast videos without CUDA. |
| **AMD Radeon (ROCm / DirectML)** | **DETECTED ONLY (NOT VALIDATED)** | Dual-GPU laptops (e.g., AMD Ryzen CPU with integrated Radeon 780M graphics) report the AMD adapter via system query, but **no AMD neural inference backend (ROCm or DirectML) is implemented or validated**. Neural tracking automatically selects NVIDIA CUDA if present or falls back to CPU. AMD must never be reported as validated. |
| **Apple Silicon (MPS)** | **NOT IMPLEMENTED / UNTESTED** | Not part of production deployment targets. |

---

## 3. Model Weights & Artifact Integrity

- **Never Commit Model Weights to Git**: All `.pt`, `.pth`, `.onnx`, and `.engine` files are excluded via `.gitignore`.
- **Explicit Installation Only**: Models are acquired explicitly through verification scripts (`scripts/install-shuttle-model.ps1` or `npm run setup:shuttle`).
- **Cryptographic Verification**:
  - **RallyLens TrackNet Shuttle Checkpoint**:
    - Path: `.local-models/rallylens-shuttle-tracknet.pth`
    - Exact Size: `45,431,245` bytes
    - SHA-256: `08b7e904dae4fd5250d51cd82c4d58d1663351f32037df6aed77547065f026a5`
  - **YOLOv8 Weights**: Downloaded/verified into local cache; never silently fetched during active analysis.
- **No Silent Fallback or Hidden Downloads**: Missing weights result in explicit `MODEL_UNAVAILABLE` or `RuntimeUnavailableError` rather than hidden background downloads during match review.

---

## 4. Installation Recipes

### Reproduce Tested NVIDIA CUDA Environment:
```powershell
python -m venv .venv-cuda
.\.venv-cuda\Scripts\Activate.ps1
pip install --upgrade pip
pip install -r ai_service/requirements-cuda.txt -c ai_service/constraints-tested.txt
```

### Reproduce Tested CPU Environment:
```powershell
python -m venv .venv-cpu
.\.venv-cpu\Scripts\Activate.ps1
pip install --upgrade pip
pip install -r ai_service/requirements-cpu.txt -c ai_service/constraints-tested.txt
```

### General Developer Setup:
```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r ai_service/requirements.txt
```


## 5. Explicit execution modes and doctor

`AUTO` selects an available supported accelerator and may fall back to CPU with a recorded reason. An explicit `CUDA` request fails when CUDA is unavailable or inference fails; it never silently succeeds as CPU analysis. Select CPU explicitly for a CPU workflow. Requested/effective devices, execution validation and per-model provider/device provenance must be inspected rather than inferred from installed torch or GPU hardware.

```powershell
npm run doctor -- -Mode auto
npm run doctor -- -Mode cuda
npm run doctor -- -Mode cpu
# Use the production TrackingEngineConfig JSON and explicitly enabled shuttle:
npm run doctor -- -Mode cuda -EngineConfig path/to/engine.json -ShuttleModel .local-models/rallylens-shuttle-tracknet.pth
```

The Python entrypoint accepts `--mode auto|cuda|cpu`, `--engine-config` and `--shuttle-model`. CPU mode runs real CPU tensor and configured detector/pose inference without requiring CUDA. CUDA mode runs and synchronizes real CUDA tensors and the configured models. The doctor reports actual artifact paths and provider/device facts. Missing weights fail clearly; no weights are downloaded. Shuttle inference is checked only when its configured artifact is explicitly supplied. A successful doctor validates execution on this workstation, not held-out tracking/landing accuracy or an entire CPU-only installation.
