@echo off
setlocal
title SportsScout Workstation
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\launch-workstation.ps1" %*
if errorlevel 1 (
    echo.
    echo [SportsScout] Launcher encountered an error.
    pause
)
exit /b %ERRORLEVEL%
