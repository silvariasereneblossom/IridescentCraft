@echo off
title IridescentCraft Client Installer
cd /d "%~dp0"

REM v5 — Downloads install.ps1 then runs it as -File (not inside -Command)
REM This ensures proper error handling and Read-Host works correctly.

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

set "PS1=%TEMP%\icraft_install.ps1"

powershell -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; (New-Object System.Net.WebClient).DownloadFile('https://raw.githubusercontent.com/silvariasereneblossom/IridescentCraft/main/minecraft/distribution/client/install.ps1?nocache=' + [guid]::NewGuid(), '%PS1%')"

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
