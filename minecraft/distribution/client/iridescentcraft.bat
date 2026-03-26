@echo off
title IridescentCraft Client Installer
cd /d "%~dp0"

REM v3 — Modrinth .mrpack format
REM If install.ps1 exists locally, use it. Otherwise download it from GitHub.
if exist "%~dp0install.ps1" (
    powershell -ExecutionPolicy Bypass -File "%~dp0install.ps1"
) else (
    echo Downloading installer script...
    powershell -ExecutionPolicy Bypass -Command ^
      "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12;" ^
      "$url = 'https://raw.githubusercontent.com/silvariasereneblossom/IridescentCraft/main/minecraft/distribution/client/install.ps1';" ^
      "$ps1 = Join-Path $env:TEMP 'icraft_install.ps1';" ^
      "(New-Object System.Net.WebClient).DownloadFile($url, $ps1);" ^
      "& $ps1"
)

pause
