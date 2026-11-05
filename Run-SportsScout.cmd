@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\launch-workstation.ps1" %*
exit /b %ERRORLEVEL%
