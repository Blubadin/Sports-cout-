@echo off
setlocal
cd /d "%~dp0"
title SportsScout Workstation - Shutdown

echo =====================================================================
echo SportsScout Workstation - Stopping Services
echo =====================================================================
echo.

powershell -NoProfile -ExecutionPolicy Bypass -Command "& {
    Write-Host '[SportsScout] Stopping AI Backend Service...' -ForegroundColor Yellow;
    $conn = Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1;
    if ($conn) {
        Stop-Process -Id $conn.OwningProcess -Force -ErrorAction SilentlyContinue;
        Write-Host '[SportsScout] Service stopped cleanly.' -ForegroundColor Green;
    } else {
        Write-Host '[SportsScout] No active service detected on port 8000.' -ForegroundColor Gray;
    }
}"
timeout /t 2 /nobreak >nul
