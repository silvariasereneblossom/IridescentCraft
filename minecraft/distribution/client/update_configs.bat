@echo off
title IridescentCraft Config Updater
cd /d "%~dp0"

REM v2 — Downloads latest update_configs.ps1 from GitHub (cache-busted) and runs it.

set "PS1=%TEMP%\icraft_update_%RANDOM%.ps1"

echo Downloading latest updater...
powershell -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; (New-Object System.Net.WebClient).DownloadFile('https://raw.githubusercontent.com/silvariasereneblossom/IridescentCraft/main/minecraft/distribution/client/update_configs.ps1?v=' + [DateTimeOffset]::UtcNow.ToUnixTimeSeconds(), '%PS1%')"

if exist "%PS1%" (
    powershell -ExecutionPolicy Bypass -File "%PS1%"
    del "%PS1%" 2>nul
) else (
    echo ERROR: Failed to download updater script.
    echo Check your internet connection.
)

pause
