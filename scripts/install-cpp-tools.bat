@echo off
title SportsScout - Visual Studio C++ Build Tools Installer
echo =====================================================================
echo SportsScout: Installing Visual Studio 2022 C++ Build Tools for Tauri
echo =====================================================================
echo.
echo Please click "Yes" when Windows asks for Administrator permission.
echo Downloading and installing required C++ compiler components...
echo.
powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process 'C:\Users\sport\AppData\Local\Temp\WinGet\Microsoft.VisualStudio.2022.BuildTools.17.14.44\vs_BuildTools.exe' -ArgumentList '--passive --norestart --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended' -Verb RunAs -Wait"
echo.
echo =====================================================================
echo Installation complete! You can now close this window.
echo =====================================================================
pause
