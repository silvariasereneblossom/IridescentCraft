@echo off
title IridescentCraft Config Updater
cd /d "%~dp0"

REM Downloads latest configs/kubejs/datapacks from GitHub and updates
REM the existing PrismLauncher instance. Does NOT touch mods.

set "PS1=%TEMP%\icraft_update.ps1"

powershell -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; (New-Object System.Net.WebClient).DownloadFile('https://raw.githubusercontent.com/silvariasereneblossom/IridescentCraft/main/minecraft/distribution/client/update_configs.ps1?nocache=' + [guid]::NewGuid(), '%PS1%')"

if exist "%PS1%" (
    powershell -ExecutionPolicy Bypass -File "%PS1%"
    del "%PS1%" 2>nul
) else (
    echo ERROR: Failed to download updater script.
    echo Check your internet connection.
)

pause
