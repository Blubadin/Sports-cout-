<#
.SYNOPSIS
    SportsScout Windows Development & AI Runtime Bootstrap Script
.DESCRIPTION
    Prepares a clean or existing Windows environment for the SPORTSCOUT Phase 3 tracking stack:
    1. Verifies Windows OS and environment
    2. Verifies Node.js (v22.x recommended) and npm
    3. Verifies Python 3.12 interpreter
    4. Creates project-local Python virtual environment in .local-services/python
    5. Installs frontend dependencies (npm ci)
    6. Installs CUDA-enabled PyTorch & torchvision if NVIDIA GPU detected
    7. Installs AI service Python requirements
    8. Downloads and verifies audited Shuttle TrackNet checkpoint
    9. Populates local YOLO weights (.local-models)
    10. Executes runtime doctor verification
#>

param(
    [switch]$SkipFrontendInstall,
    [switch]$SkipModelDownload,
    [string]$CustomPython = ''
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot

Write-Output "======================================================================"
Write-Output " SPORTSCOUT WINDOWS RUNTIME BOOTSTRAP"
Write-Output "======================================================================"

# 1. Verify Windows
if ($PSVersionTable.PSVersion.Major -lt 5) {
    throw "PowerShell 5.1 or newer is required."
}
if (-not $IsWindows -and $env:OS -notlike "*Windows*") {
    throw "This bootstrap script is designed for Windows 10/11 environments."
}
Write-Output "[1/10] Operating System: Windows detected."

# Refresh PATH from Registry
$env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")

# 2. Verify Node.js & npm
Write-Output "[2/10] Checking Node.js and npm..."
$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
$npmCmd = Get-Command npm -ErrorAction SilentlyContinue
if (-not $nodeCmd) {
    throw "Node.js is not found on PATH. Please install Node.js (version 22.x recommended)."
}
$nodeVersion = & node --version
Write-Output "       Found Node.js: $nodeVersion"

# 3. Locate Python 3.12
Write-Output "[3/10] Locating Python interpreter..."
$pythonExe = $CustomPython
if (-not $pythonExe) {
    # Check py launcher for 3.12
    $pyLauncher = Get-Command py -ErrorAction SilentlyContinue
    if ($pyLauncher) {
        $foundPy312 = & py -3.12 -c "import sys; print(sys.executable)" 2>$null
        if ($LASTEXITCODE -eq 0 -and $foundPy312) {
            $pythonExe = $foundPy312.Trim()
        }
    }
}
if (-not $pythonExe) {
    $systemPython = Get-Command python -ErrorAction SilentlyContinue
    if ($systemPython) {
        $pythonExe = $systemPython.Source
    }
}
if (-not $pythonExe) {
    # Search common user install paths
    $defaultPy312 = "$env:LOCALAPPDATA\Programs\Python\Python312\python.exe"
    if (Test-Path -LiteralPath $defaultPy312 -PathType Leaf) {
        $pythonExe = $defaultPy312
    }
}
if (-not $pythonExe) {
    throw "Python interpreter not found. Please install Python 3.12."
}
$pyVersion = & $pythonExe -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}')"
Write-Output "       Found Python: $pyVersion at $pythonExe"

# 4. Project-Local Python Virtual Environment
$venvPath = Join-Path $projectRoot '.local-services/python'
$venvPython = Join-Path $venvPath 'Scripts/python.exe'

Write-Output "[4/10] Setting up project-local virtualenv (.local-services/python)..."
if (-not (Test-Path -LiteralPath $venvPython -PathType Leaf)) {
    Write-Output "       Creating new venv..."
    & $pythonExe -m venv $venvPath
    if ($LASTEXITCODE -ne 0) { throw "Failed to create Python virtual environment." }
} else {
    Write-Output "       Existing virtual environment verified."
}

Write-Output "       Upgrading pip, setuptools, wheel..."
& $venvPython -m pip install --upgrade pip setuptools wheel --quiet

# 5. Frontend Dependencies
if (-not $SkipFrontendInstall) {
    Write-Output "[5/10] Checking frontend dependencies..."
    $nodeModules = Join-Path $projectRoot 'node_modules'
    if (-not (Test-Path -LiteralPath $nodeModules -PathType Container)) {
        Write-Output "       Running npm ci..."
        & npm ci
        if ($LASTEXITCODE -ne 0) { throw "npm ci failed." }
    } else {
        Write-Output "       node_modules present. (Run 'npm ci' manually if updating packages)."
    }
} else {
    Write-Output "[5/10] Skipping frontend dependencies (--SkipFrontendInstall)."
}

# 6. Detect GPU & Install CUDA PyTorch
Write-Output "[6/10] Checking GPU and PyTorch CUDA compatibility..."
$hasNvidia = $false
try {
    $videoControllers = Get-CimInstance Win32_VideoController -ErrorAction SilentlyContinue
    foreach ($vc in $videoControllers) {
        if ($vc.Name -like "*NVIDIA*") {
            $hasNvidia = $true
            Write-Output "       Detected NVIDIA GPU: $($vc.Name)"
        }
    }
} catch {}

# Check if PyTorch with CUDA is already installed
$torchCudaReady = $false
try {
    $checkTorch = & $venvPython -c "import torch; print(torch.cuda.is_available() and torch.version.cuda is not None)" 2>$null
    if ($checkTorch -like "*True*") {
        $torchCudaReady = $true
    }
} catch {}

if ($hasNvidia -and -not $torchCudaReady) {
    Write-Output "       Installing PyTorch 2.5.1 + CUDA 12.4 (cu124)..."
    & $venvPython -m pip install torch==2.5.1 torchvision==0.20.1 --index-url https://download.pytorch.org/whl/cu124
    if ($LASTEXITCODE -ne 0) { throw "Failed to install CUDA PyTorch." }
} elseif ($torchCudaReady) {
    Write-Output "       PyTorch CUDA runtime already installed and functional."
} else {
    Write-Output "       No NVIDIA GPU detected or CUDA runtime bypassed. Using standard PyTorch."
}

# 7. Install Python AI Requirements
Write-Output "[7/10] Installing AI Service dependencies (ai_service/requirements.txt)..."
$reqFile = Join-Path $projectRoot 'ai_service/requirements.txt'
& $venvPython -m pip install -r $reqFile --quiet
if ($LASTEXITCODE -ne 0) { throw "Failed to install Python requirements." }

# 8. Shuttle Checkpoint
if (-not $SkipModelDownload) {
    Write-Output "[8/10] Verifying Shuttle TrackNet checkpoint..."
    $shuttleScript = Join-Path $projectRoot 'scripts/install-shuttle-model.ps1'
    & powershell -NoProfile -ExecutionPolicy Bypass -File $shuttleScript
    if ($LASTEXITCODE -ne 0) { throw "Failed to install/verify shuttle model." }
} else {
    Write-Output "[8/10] Skipping shuttle model verification (--SkipModelDownload)."
}

# 9. Local YOLO Models
Write-Output "[9/10] Checking YOLO detector and pose model files..."
$localModelsDir = Join-Path $projectRoot '.local-models'
New-Item -ItemType Directory -Force -Path $localModelsDir | Out-Null

$cacheDir = Join-Path $env:USERPROFILE '.cache\ultralytics'
foreach ($m in @('yolov8n.pt', 'yolov8n-pose.pt')) {
    $target = Join-Path $localModelsDir $m
    if (-not (Test-Path -LiteralPath $target -PathType Leaf)) {
        $cached = Join-Path $cacheDir $m
        if (Test-Path -LiteralPath $cached -PathType Leaf) {
            Copy-Item -LiteralPath $cached -Destination $target -Force
            Write-Output "       Copied $m from cache to .local-models/"
        }
    }
}

# 10. Execute Runtime Doctor
Write-Output "[10/10] Running Runtime Doctor..."
$doctorScript = Join-Path $projectRoot 'scripts/doctor.ps1'
& powershell -NoProfile -ExecutionPolicy Bypass -File $doctorScript -Python $venvPython
$doctorResult = $LASTEXITCODE

Write-Output "======================================================================"
if ($doctorResult -eq 0) {
    Write-Output " BOOTSTRAP COMPLETE: SUCCESS!"
    Write-Output " Next step to start SPORTSCOUT workstation and AI service:"
    Write-Output "   npm run start:local"
} else {
    Write-Warning "Bootstrap completed with warnings or failures. Review Doctor report above."
}
Write-Output "======================================================================"
exit $doctorResult
