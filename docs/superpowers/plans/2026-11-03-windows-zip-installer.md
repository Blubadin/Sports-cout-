# Implementation Plan: SportsScout Windows 10/11 ZIP & Self-Installer Edition

> **Status:** APPROVED & PLANNED  
> **Target OS:** Windows 10 & Windows 11 (64-bit x64)  
> **Distribution:** Standalone `.zip` archive (Flash Drive / Offline Distribution)  
> **Execution Model:** Two-stage deployment (`Setup-SportsScout.cmd` -> Auto-provisioning -> Auto-launch web app -> Desktop Shortcut)  
> **Engineering Governance:** Strictly adheres to [AGENTS.md](../../../AGENTS.md) (One phase at a time, verification gates, zero regressions)

---

## 1. Goal & Architecture Overview

The goal is to deliver a zero-hassle, self-contained distribution package for SportsScout that can be copied onto a standard USB flash drive and executed on any standard Windows 10 or 11 workstation without requiring prior installation of Node.js, Git, or administrative privileges.

```mermaid
flowchart TD
    Zip["📦 SportsScout-v0.11-Windows.zip (in Flash Drive)"] --> Extract["📂 Extracted Folder"]
    
    subgraph FirstRun ["Stage 1: First Run Setup"]
        Extract --> SetupCmd["🚀 Setup-SportsScout.cmd"]
        SetupCmd --> Check["installer/check-prerequisites.ps1<br/>• Windows 10/11 x64 verified<br/>• RAM & Disk space verified<br/>• NVIDIA CUDA / CPU mode detected"]
        Check --> Provision["installer/setup-isolated-env.ps1<br/>• Isolated Python 3.12 unpacked<br/>• Offline wheels installed<br/>• Weights SHA-256 verified<br/>• Runtime doctor passes"]
        Provision --> Shortcut["installer/create-shortcuts.vbs<br/>• Desktop shortcut created"]
    end

    subgraph ServiceLaunch ["Stage 2: Web Workstation Launch"]
        Provision --> Server["FastAPI AI Service<br/>• Serves API on /api & /ws<br/>• Serves Web UI from pre-built dist/<br/>• Port 8000 (Loopback only)"]
        Server --> Browser["Edge / Default Browser<br/>• msedge.exe --app=http://127.0.0.1:8000<br/>• Clean standalone window"]
    end

    subgraph SubsequentRuns ["Subsequent Runs"]
        DesktopIcon["🏸 Desktop Shortcut or Run-SportsScout.cmd"] --> Server
    end
```

### Implementation Status Matrix (Updated 2026-11-06)

| Phase | Description | Status | Evidence / Notes |
|---|---|---|---|
| **ZIP-1** | Web SPA Serving in FastAPI | **DONE** | Path traversal vulnerability remediated (`is_relative_to`, dot-segment blocking, static 404 handler) in TASK 2. |
| **ZIP-2** | Prerequisite Probe & Isolated Python Installer | **NOT STARTED** | Requires architecture approval and requirement audit before creating installer scripts. |
| **ZIP-3** | Launch Orchestration & Desktop Shortcuts | **PARTIAL / FIXED LAUNCHER** | `.cmd` multi-line parse bug fixed by delegating to `scripts/launch-workstation.ps1` and `scripts/stop-workstation.ps1` in TASK 3. Shortcut generation and clean-machine launch pending ZIP-5. |
| **ZIP-4** | Automated ZIP Package Generator | **HARDENED** | Automated verification gates (typecheck, lint, vitest, unittest), model SHA-256 validation via `scripts/models.sha256`, and venv bundling prevention added in TASK 5. Portable ZIP verified. |
| **ZIP-5** | Clean-System Validation & Quality Audit | **NOT STARTED** | Pending clean Windows Sandbox verification once isolated installer (ZIP-2) is ready. |

### Key Architectural Pillars

1. **Eliminate Node.js Runtime Requirement:**
   - The web frontend is pre-built into production static files (`dist/`) using `npm run build` during package generation.
   - FastAPI in [server.py](../../../ai_service/server.py) serves the compiled web assets directly using `StaticFiles` with SPA fallback routing.
   - Target machines need **zero Node.js/npm installations**.

2. **Isolated, Zero-Admin Python Runtime:**
   - Bundles an isolated/embedded CPython 3.12 distribution with pre-downloaded wheels in `payload/wheels/`.
   - Setup operates purely in user-space (local folder or `%LOCALAPPDATA%\SportsScout`), requiring **zero Administrator (UAC) elevation**.
   - Completely decoupled from any system Python or registry keys.

3. **Intelligent Hardware Acceleration & Fallback:**
   - Detects NVIDIA GeForce / RTX GPUs and configures CUDA 12.4 acceleration.
   - If running on Intel / AMD graphics or non-CUDA machines, seamlessly defaults to CPU inference with transparent logging per [PYTHON_RUNTIME.md](../../../docs/PYTHON_RUNTIME.md).

4. **Self-Contained Data Management:**
   - User projects, analysis jobs, and exports are organized under `data/` within the folder or portable path, ensuring user data is preserved across app updates.

---

## 2. Package Folder Structure (`.ZIP` Archive)

```
SportsScout-v0.11-Windows/
├── 🚀 Setup-SportsScout.cmd       # First-time setup & auto launch
├── 🏸 Run-SportsScout.cmd         # Quick launcher for daily use
├── 🛑 Stop-SportsScout.cmd        # Clean shutdown script
├── 📖 คู่มือการติดตั้งและใช้งาน.txt   # User guide for coaches and scouts
│
├── installer/
│   ├── check-prerequisites.ps1   # OS, memory, disk, and GPU hardware probe
│   ├── setup-isolated-env.ps1    # Unpacks isolated python & wheels offline
│   └── create-shortcuts.vbs      # Creates desktop & start menu shortcuts
│
├── payload/
│   ├── python-bundle/            # Isolated CPython 3.12 runtime
│   ├── wheels/                   # Offline wheel packages (.whl)
│   ├── web/                      # Compiled frontend assets (dist/)
│   ├── ai_service/               # FastAPI backend codebase
│   └── models/                   # Cryptographically verified model weights
│       ├── yolov8n.pt
│       ├── yolov8n-pose.pt
│       └── rallylens-shuttle-tracknet.pth
│
└── data/
    ├── analysis-jobs/            # Track analysis outputs
    ├── exports/                  # Video and data exports
    └── logs/                     # Diagnostics and runtime logs
```

---

## 3. Phased Implementation Roadmap

### Phase ZIP-1: Web SPA Serving in FastAPI (Eliminating Node.js Dependency) — [DONE]
- **Target Files:**
  - [ai_service/server.py](../../../ai_service/server.py): Add static web asset mounting and SPA fallback handler for non-API routes when `SPORTSCOUT_WEB_DIST` is configured.
  - [src/services/aiConnection.ts](../../../src/services/aiConnection.ts): Enable same-origin connection detection when hosted on the unified port.
- **Verification Gates:**
  - Unit tests verifying FastAPI serves `index.html` on client-side routes without interfering with `/api` or `/ws`.
  - Frontend TypeScript check (`npm run typecheck`), linting (`npm run lint`), and Vitest (`npm test`).
  - Path traversal vulnerability audit and remediation via strict path boundary enforcement.

### Phase ZIP-2: Prerequisite Probe & Isolated Environment Installer — [NOT STARTED]
- **Target Files:**
  - `installer/check-prerequisites.ps1`: Automated checks for Windows 10/11 (Build 19041+), disk space (>= 10 GB), RAM (>= 8 GB), and GPU.
  - `installer/setup-isolated-env.ps1`: Script to unpack isolated Python, install offline wheels, verify model SHA-256 hashes, and invoke [runtime_doctor.py](../../../ai_service/runtime_doctor.py).
  - `Setup-SportsScout.cmd`: Double-click CMD entrypoint with clear user progress messaging.
- **Verification Gates:**
  - Automated PowerShell test verifying zero-admin execution in non-elevated user contexts.
  - Python runtime doctor exit code 0 under both CUDA and CPU emulation.

### Phase ZIP-3: Launch Orchestration & Desktop Shortcuts — [PARTIAL / FIXED LAUNCHER]
- **Target Files:**
  - `installer/create-shortcuts.vbs`: Non-admin VBScript generating Desktop and Start Menu `.lnk` shortcuts.
  - `Run-SportsScout.cmd`: Checks environment readiness, launches background AI service, polls `/api/status`, and opens Microsoft Edge in App Mode (`msedge.exe --app=http://127.0.0.1:8000`).
  - `Stop-SportsScout.cmd`: Graceful shutdown of the background Python process.
- **Verification Gates:**
  - Verify process lifecycle (clean launch, healthy port detection, clean termination). Multi-line parse bug fixed by moving orchestration to dedicated PowerShell scripts (`launch-workstation.ps1`, `stop-workstation.ps1`).

### Phase ZIP-4: Automated ZIP Package Generator — [HARDENED]
- **Target Files:**
  - `scripts/package-zip.ps1`: Automated developer build script that:
    1. Executes verification suite (`typecheck`, `lint`, `vitest`, `unittest`).
    2. Builds production frontend (`npm run build`).
    3. Stages isolated Python runtime and audited offline wheels (guards against venv copying).
    4. Copies and cryptographically validates model weights using `scripts/models.sha256`.
    5. Compresses the release payload into `SportsScout-v0.11.0-pilot.1-Windows-Portable.zip`.
    6. Emits `SHA256SUMS.txt` for release integrity validation.
- **Verification Gates:**
  - Complete end-to-end packaging dry run producing a valid `.zip` artifact with pre-packaging test gates.

### Phase ZIP-5: Clean-System Validation & Quality Audit — [NOT STARTED]
- **Validation Scope:**
  - Test deployment inside an isolated Windows Sandbox instance (completely clean Windows 10/11 with zero dev tools installed).
  - Verify `Setup-SportsScout.cmd` unpacks and launches cleanly.
  - Perform real-video tracking smoke test to certify end-to-end execution.
  - Confirm Desktop shortcut launches within 3-5 seconds on subsequent runs.

---

## 4. Governance & Rules Compliance

- **No Direct Changes to `main`**: Implemented on designated milestone branch (`feat/desktop-tauri-workstation`).
- **One Phase at a Time**: Each phase (ZIP-1 through ZIP-5) will run full verification, produce clean test logs, commit with clear semantic messages, and report status before proceeding.
- **Integrity First**: No synthetic tracking data in production stores, no unvalidated biomechanics claims, and strict preservation of real-video tracking accuracy standards.
