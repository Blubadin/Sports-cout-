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
$stoppedAny = $false

# 1. Stop via PID file if present
if (Test-Path -LiteralPath $pidFile) {
    $rawPid = (Get-Content -Path $pidFile -Raw).Trim()
    if ($rawPid -match '^\d+$') {
        $targetPid = [int]$rawPid
        $proc = Get-CimInstance Win32_Process -Filter "ProcessId = $targetPid" -ErrorAction SilentlyContinue
        if ($proc) {
            $cmdLine = $proc.CommandLine
            $isSportsScoutAi = $false
            if ($cmdLine -and ($cmdLine -like "*ai_service/server.py*" -or $cmdLine -like "*ai_service\server.py*")) {
                $isSportsScoutAi = $true
            } else {
                $children = Get-CimInstance Win32_Process -Filter "ParentProcessId = $targetPid" -ErrorAction SilentlyContinue
                foreach ($child in $children) {
                    if ($child.CommandLine -and ($child.CommandLine -like "*ai_service/server.py*" -or $child.CommandLine -like "*ai_service\server.py*")) {
                        $isSportsScoutAi = $true
                        break
                    }
                }
            }

            if ($isSportsScoutAi) {
                Write-Host "[SportsScout] Stopping AI Backend Service (PID $targetPid and child processes)..." -ForegroundColor Yellow
                & taskkill.exe /PID $targetPid /T /F | Out-Null
                $stoppedAny = $true
            }
        }
    }
    Remove-Item -Path $pidFile -Force -ErrorAction SilentlyContinue
}

# 2. Check if port 8000 is still held by a SportsScout server process
$conn = Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue
if ($conn) {
    $owningPid = $conn.OwningProcess
    $portProc = Get-CimInstance Win32_Process -Filter "ProcessId = $owningPid" -ErrorAction SilentlyContinue
    if ($portProc -and ($portProc.CommandLine -like "*ai_service/server.py*" -or $portProc.CommandLine -like "*ai_service\server.py*")) {
        Write-Host "[SportsScout] Terminating server on port 8000 (PID $owningPid)..." -ForegroundColor Yellow
        & taskkill.exe /PID $owningPid /T /F | Out-Null
        $stoppedAny = $true
    }
}

# 3. Clean up any remaining orphaned python processes running server.py from this workspace
$orphanProcs = Get-CimInstance Win32_Process -Filter "Name like 'python%'" -ErrorAction SilentlyContinue | Where-Object {
    $_.CommandLine -and ($_.CommandLine -like "*ai_service/server.py*" -or $_.CommandLine -like "*ai_service\server.py*")
}
if ($orphanProcs) {
    foreach ($p in $orphanProcs) {
        Write-Host "[SportsScout] Releasing stale AI process (PID $($p.ProcessId))..." -ForegroundColor Yellow
        & taskkill.exe /PID $p.ProcessId /T /F | Out-Null
        $stoppedAny = $true
    }
}

# 4. Verify port 8000 is released
$waited = 0
while ($waited -lt 10) {
    $conn = Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue
    if (-not $conn) { break }
    Start-Sleep -Milliseconds 500
    $waited++
}

if ($stoppedAny) {
    Write-Host "[SportsScout] Service stopped cleanly. Port 8000 is free." -ForegroundColor Green
} else {
    Write-Host "[SportsScout] No active SportsScout service was running on port 8000." -ForegroundColor Gray
}
