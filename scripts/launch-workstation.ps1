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

    if ($edgeExe) {
        Write-Host "[SportsScout] Launching Workstation Standalone Window..." -ForegroundColor Green
        Start-Process -FilePath $edgeExe -ArgumentList "--app=http://127.0.0.1:8000", "--window-size=1440,900"
    } else {
        Write-Host "[SportsScout] Opening default browser..." -ForegroundColor Green
        Start-Process "http://127.0.0.1:8000"
    }
}
