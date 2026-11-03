@echo off
setlocal
cd /d "%~dp0"
title SportsScout Workstation Launcher

echo =====================================================================
echo SportsScout Workstation - Match Scouting & Video Analysis
echo =====================================================================
echo.

powershell -NoProfile -ExecutionPolicy Bypass -Command "& {
    $projectRoot = '%~dp0'.TrimEnd('\');
    $python = Join-Path $projectRoot '.local-services\python\Scripts\python.exe';
    if (-not (Test-Path $python)) { $python = 'python' }
    
    function Test-Port {
        try {
            $res = Invoke-WebRequest -Uri 'http://127.0.0.1:8000/api/status' -UseBasicParsing -TimeoutSec 1;
            return $res.StatusCode -eq 200;
        } catch { return $false }
    }

    if (-not (Test-Port)) {
        Write-Host '[SportsScout] Starting AI Backend Service...' -ForegroundColor Cyan;
        Start-Process -FilePath $python -ArgumentList 'ai_service/server.py' -WorkingDirectory $projectRoot -WindowStyle Hidden;
        $retries = 0;
        while (-not (Test-Port) -and $retries -lt 30) {
            Start-Sleep -Milliseconds 500;
            $retries++;
        }
        if (-not (Test-Port)) {
            Write-Host '[SportsScout] Warning: AI Service took longer than expected to respond.' -ForegroundColor Yellow;
        } else {
            Write-Host '[SportsScout] AI Backend Service is online.' -ForegroundColor Green;
        }
    } else {
        Write-Host '[SportsScout] AI Backend Service is already running.' -ForegroundColor Green;
    }

    $edgePaths = @(
        'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',
        'C:\Program Files\Microsoft\Edge\Application\msedge.exe'
    );
    $edgeExe = $edgePaths | Where-Object { Test-Path $_ } | Select-Object -First 1;

    if ($edgeExe) {
        Write-Host '[SportsScout] Launching Workstation Standalone Window...' -ForegroundColor Green;
        Start-Process -FilePath $edgeExe -ArgumentList '--app=http://127.0.0.1:8000', '--window-size=1440,900';
    } else {
        Write-Host '[SportsScout] Opening default browser...' -ForegroundColor Green;
        Start-Process 'http://127.0.0.1:8000';
    }
}"
