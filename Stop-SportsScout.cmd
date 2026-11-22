@echo off
setlocal
title Stop SportsScout Workstation
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\stop-workstation.ps1" %*
if errorlevel 1 (
    echo.
    echo [SportsScout] Shutdown encountered an error.
    pause
)
exit /b %ERRORLEVEL%
