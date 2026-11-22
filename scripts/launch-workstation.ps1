<#
.SYNOPSIS
    SportsScout Workstation Launcher
.DESCRIPTION
    Starts the local SportsScout FastAPI AI service in the background, waits for /api/status,
    and opens the standalone web workstation in Microsoft Edge App Mode or the default browser.
.PARAMETER NoBrowser
    If specified, launches the AI service without opening a browser window (useful for automation/tests).
#>
param(
    [switch]$NoBrowser
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot

Write-Host "=====================================================================" -ForegroundColor Cyan
Write-Host "SportsScout Workstation - Match Scouting & Video Analysis" -ForegroundColor Cyan
Write-Host "=====================================================================" -ForegroundColor Cyan
Write-Host ""

# 1. Locate isolated Python runtime (never fallback to system python)
$pythonCandidates = @(
    (Join-Path $projectRoot "payload\python\python.exe"),
    (Join-Path $projectRoot ".local-services\python\Scripts\python.exe")
)

$pythonExe = $null
foreach ($cand in $pythonCandidates) {
    if (Test-Path -LiteralPath $cand -PathType Leaf) {
        $pythonExe = $cand
        break
    }
}

if (-not $pythonExe) {
    Write-Host "[SportsScout] ERROR: Isolated Python runtime not found." -ForegroundColor Red
    Write-Host "Checked locations:" -ForegroundColor Yellow
    foreach ($cand in $pythonCandidates) {
        Write-Host "  - $cand" -ForegroundColor Gray
    }
    Write-Host "Please run Setup-SportsScout.cmd or scripts\bootstrap-windows.ps1 first." -ForegroundColor Yellow
    exit 1
}

# 2. Configure environment
$distDir = Join-Path $projectRoot "dist"
if (Test-Path -LiteralPath (Join-Path $distDir "index.html")) {
    $env:SPORTSCOUT_WEB_DIST = $distDir
} else {
    Write-Host "[SportsScout] Warning: Pre-built web assets not found in dist/. Frontend will serve 404 until built." -ForegroundColor Yellow
}
$env:SPORTSCOUT_AI_HOST = "127.0.0.1"

# Optional shuttle model: only use a file that actually exists (never invent a path).
if (-not $env:SHUTTLE_MODEL_PATH) {
    foreach ($m in @(
        (Join-Path $projectRoot "payload\models\rallylens-shuttle-tracknet.pth"),
        (Join-Path $projectRoot ".local-models\rallylens-shuttle-tracknet.pth")
    )) {
        if (Test-Path -LiteralPath $m) {
            $env:SHUTTLE_MODEL_PATH = $m
            if (-not $env:SHUTTLE_PROVIDER) { $env:SHUTTLE_PROVIDER = "rallylens_tracknet" }
            break
        }
    }
}

# 3. Helper to verify SportsScout status on port 8000
function Test-SportsScoutStatus {
    try {
        $res = Invoke-RestMethod -Uri "http://127.0.0.1:8000/api/status" -TimeoutSec 2 -ErrorAction Stop
        if ($res.status -eq "online" -and $null -ne $res.game_type -and $null -ne $res.is_tracking) {
            return @{ Running = $true; IsSportsScout = $true }
        }
        return @{ Running = $true; IsSportsScout = $false }
    } catch {
        return @{ Running = $false; IsSportsScout = $false }
    }
}

# 4. Check whether service is already running or if port is occupied
$initialStatus = Test-SportsScoutStatus
if ($initialStatus.Running) {
    if (-not $initialStatus.IsSportsScout) {
        Write-Host "[SportsScout] ERROR: Port 8000 is occupied by a foreign service that is not SportsScout." -ForegroundColor Red
        Write-Host "Please terminate the process on port 8000 or change its port before launching SportsScout." -ForegroundColor Yellow
        exit 1
    }
    Write-Host "[SportsScout] AI Backend Service is already running." -ForegroundColor Green
} else {
    # Clean up any orphaned python processes from this workspace running server.py
    $orphanProcs = Get-CimInstance Win32_Process -Filter "Name like 'python%'" -ErrorAction SilentlyContinue | Where-Object {
        $_.CommandLine -and ($_.CommandLine -like "*ai_service/server.py*" -or $_.CommandLine -like "*ai_service\server.py*")
    }
    if ($orphanProcs) {
        Write-Host "[SportsScout] Releasing stale AI backend process..." -ForegroundColor Yellow
        foreach ($p in $orphanProcs) {
            try {
                Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue
            } catch {}
        }
        Start-Sleep -Milliseconds 500
    }

    Write-Host "[SportsScout] Starting AI Backend Service..." -ForegroundColor Cyan

    $logsDir = Join-Path $projectRoot "data\logs"
    if (-not (Test-Path -LiteralPath $logsDir)) {
        New-Item -ItemType Directory -Path $logsDir -Force | Out-Null
    }
    $stdoutLog = Join-Path $logsDir "ai-service.out.log"
    $stderrLog = Join-Path $logsDir "ai-service.err.log"
    $pidFile = Join-Path $logsDir "ai-service.pid"

    $proc = Start-Process -FilePath $pythonExe `
        -ArgumentList "ai_service/server.py" `
        -WorkingDirectory $projectRoot `
        -WindowStyle Hidden `
        -RedirectStandardOutput $stdoutLog `
        -RedirectStandardError $stderrLog `
        -PassThru

    $proc.Id | Out-File -FilePath $pidFile -Encoding ascii -Force

    $retries = 0
    $online = $false
    while ($retries -lt 60) {
        Start-Sleep -Milliseconds 500
        $retries++
        $check = Test-SportsScoutStatus
        if ($check.Running -and $check.IsSportsScout) {
            $online = $true
            break
        }
        if ($proc.HasExited) {
            Write-Host "[SportsScout] ERROR: AI Backend process exited prematurely with code $($proc.ExitCode)." -ForegroundColor Red
            if (Test-Path -LiteralPath $stderrLog) {
                Get-Content -Path $stderrLog -Tail 20 | Write-Host -ForegroundColor Red
            }
            exit 1
        }
    }

    if (-not $online) {
        Write-Host "[SportsScout] ERROR: AI Backend Service failed to respond within 30 seconds." -ForegroundColor Red
        if (Test-Path -LiteralPath $stderrLog) {
            Get-Content -Path $stderrLog -Tail 20 | Write-Host -ForegroundColor Red
        }
        exit 1
    }
    Write-Host "[SportsScout] AI Backend Service is online (PID $($proc.Id))." -ForegroundColor Green
}

# 5. Launch browser if requested
if (-not $NoBrowser) {
    $edgePaths = @(
        "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
        "C:\Program Files\Microsoft\Edge\Application\msedge.exe"
    )
    $edgeExe = $edgePaths | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1

    $launched = $false
    if ($edgeExe) {
        try {
            Write-Host "[SportsScout] Launching Workstation Standalone Window (Edge App Mode)..." -ForegroundColor Green
            Start-Process -FilePath $edgeExe -ArgumentList "--app=http://127.0.0.1:8000", "--new-window", "--window-size=1440,900"
            $launched = $true
        } catch {
            Write-Host "[SportsScout] Note: Edge app mode launch failed, opening default browser..." -ForegroundColor Yellow
        }
    }

    if (-not $launched) {
        Write-Host "[SportsScout] Opening default browser at http://127.0.0.1:8000 ..." -ForegroundColor Green
        Start-Process "http://127.0.0.1:8000"
    }
}

Write-Host ""
Write-Host "=====================================================================" -ForegroundColor Green
Write-Host " SportsScout Workstation is now running!" -ForegroundColor Green
Write-Host " URL: http://127.0.0.1:8000" -ForegroundColor Cyan
Write-Host " To stop the service, double-click Stop-SportsScout.cmd" -ForegroundColor Gray
Write-Host "=====================================================================" -ForegroundColor Green
Write-Host ""
Start-Sleep -Seconds 2
