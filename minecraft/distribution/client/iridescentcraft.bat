@echo off
title IridescentCraft Client Installer
cd /d "%~dp0"

REM If install.ps1 exists locally, use it. Otherwise download it.
if exist "%~dp0install.ps1" (
    powershell -ExecutionPolicy Bypass -File "%~dp0install.ps1"
) else (
    echo Downloading installer...
    powershell -ExecutionPolicy Bypass -Command ^
      "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12;" ^
      "$url = 'https://raw.githubusercontent.com/silvariasereneblossom/IridescentCraft/main/minecraft/distribution/client/install.ps1';" ^
      "$ps1 = \"$env:TEMP\icraft_install.ps1\";" ^
      "Invoke-WebRequest -Uri $url -OutFile $ps1 -UseBasicParsing;" ^
      "& $ps1"
)

pause
