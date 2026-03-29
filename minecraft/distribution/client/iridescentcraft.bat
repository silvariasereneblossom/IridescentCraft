@echo off
title IridescentCraft Client Installer
cd /d "%~dp0"

REM v6 — Clean download every time, no caching possible

if exist "%~dp0install.ps1" (
    echo Using local install.ps1...
    powershell -ExecutionPolicy Bypass -File "%~dp0install.ps1"
    pause
    exit /b
)

echo ==========================================
echo   IridescentCraft Client Installer
echo   Downloading installer script...
echo ==========================================
echo.

REM Delete ALL old cached ps1 files
del "%TEMP%\icraft_install_*.ps1" 2>nul

set "PS1=%TEMP%\icraft_install_%TIME:~6,2%%RANDOM%.ps1"

powershell -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; (New-Object System.Net.WebClient).DownloadFile('https://raw.githubusercontent.com/silvariasereneblossom/IridescentCraft/main/minecraft/distribution/client/install.ps1?v=' + [DateTimeOffset]::UtcNow.ToUnixTimeSeconds(), '%PS1%')"

if not exist "%PS1%" (
    echo ERROR: Failed to download installer script.
    echo Download the repo manually: https://github.com/silvariasereneblossom/IridescentCraft
    pause
    exit /b 1
)

echo Running installer...
echo.
powershell -ExecutionPolicy Bypass -File "%PS1%"

del "%PS1%" 2>nul
pause
