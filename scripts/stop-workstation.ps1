<#
.SYNOPSIS
    SportsScout Workstation - Shutdown
.DESCRIPTION
    Safely stops the SportsScout AI backend service by inspecting the PID file,
    verifying the process identity, and terminating its process tree cleanly.
#>

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot

Write-Host "=====================================================================" -ForegroundColor Cyan
Write-Host "SportsScout Workstation - Stopping Services" -ForegroundColor Cyan
Write-Host "=====================================================================" -ForegroundColor Cyan
Write-Host ""

$pidFile = Join-Path $projectRoot "data\logs\ai-service.pid"
if (-not (Test-Path -LiteralPath $pidFile)) {
    Write-Host "[SportsScout] No active PID file detected at $pidFile. AI service is not running or managed externally." -ForegroundColor Gray
    exit 0
}

$rawPid = (Get-Content -Path $pidFile -Raw).Trim()
if (-not $rawPid -or -not ($rawPid -match '^\d+$')) {
    Write-Host "[SportsScout] Warning: Invalid PID found in $pidFile. Removing invalid file." -ForegroundColor Yellow
    Remove-Item -Path $pidFile -Force -ErrorAction SilentlyContinue
    exit 0
}

$targetPid = [int]$rawPid

# Verify process existence and command line identity
$proc = Get-CimInstance Win32_Process -Filter "ProcessId = $targetPid" -ErrorAction SilentlyContinue
if (-not $proc) {
    Write-Host "[SportsScout] Process with PID $targetPid is no longer active." -ForegroundColor Gray
    Remove-Item -Path $pidFile -Force -ErrorAction SilentlyContinue
    exit 0
}

$isSportsScoutAi = $false
$cmdLine = $proc.CommandLine
if ($cmdLine -and ($cmdLine -like "*ai_service/server.py*" -or $cmdLine -like "*ai_service\server.py*")) {
    $isSportsScoutAi = $true
} else {
    # Check if targetPid is a launcher stub whose child is running ai_service/server.py
    $children = Get-CimInstance Win32_Process -Filter "ParentProcessId = $targetPid" -ErrorAction SilentlyContinue
    foreach ($child in $children) {
        if ($child.CommandLine -and ($child.CommandLine -like "*ai_service/server.py*" -or $child.CommandLine -like "*ai_service\server.py*")) {
            $isSportsScoutAi = $true
            break
        }
    }
}

if (-not $isSportsScoutAi) {
    Write-Host "[SportsScout] ERROR: Process with PID $targetPid does not match SportsScout server.py." -ForegroundColor Red
    Write-Host "Command line was: $cmdLine" -ForegroundColor Yellow
    Write-Host "Aborting shutdown to protect unrelated processes." -ForegroundColor Red
    exit 1
}

Write-Host "[SportsScout] Stopping AI Backend Service (PID $targetPid and child processes)..." -ForegroundColor Yellow
& taskkill.exe /PID $targetPid /T /F | Out-Null

Remove-Item -Path $pidFile -Force -ErrorAction SilentlyContinue

# Verify port 8000 is released
$waited = 0
while ($waited -lt 10) {
    $conn = Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue
    if (-not $conn) { break }
    Start-Sleep -Milliseconds 500
    $waited++
}

Write-Host "[SportsScout] Service stopped cleanly. Port 8000 is free." -ForegroundColor Green
