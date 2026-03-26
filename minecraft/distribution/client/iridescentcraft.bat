@echo off
title IridescentCraft Client Installer
cd /d "%~dp0"

REM v4 — Single file installer
REM Downloads install.ps1 from GitHub (cache-busted), runs it.
REM If running from full distribution folder, uses local install.ps1 instead.

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

set "PS1=%TEMP%\icraft_install_%RANDOM%.ps1"
powershell -ExecutionPolicy Bypass -Command ^
  "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12;" ^
  "$url = 'https://raw.githubusercontent.com/silvariasereneblossom/IridescentCraft/main/minecraft/distribution/client/install.ps1?nocache=' + [guid]::NewGuid();" ^
  "try {" ^
  "  (New-Object System.Net.WebClient).DownloadFile($url, '%PS1%');" ^
  "  if ((Test-Path '%PS1%') -and (Get-Item '%PS1%').Length -gt 100) {" ^
  "    & '%PS1%'" ^
  "  } else {" ^
  "    throw 'Download produced empty file'" ^
  "  }" ^
  "} catch {" ^
  "  Write-Host ('ERROR: ' + $_.Exception.Message) -ForegroundColor Red;" ^
  "  Write-Host '';" ^
  "  Write-Host 'Alternative: download the full repo and run from distribution\client\ folder:' -ForegroundColor Yellow;" ^
  "  Write-Host 'https://github.com/silvariasereneblossom/IridescentCraft' -ForegroundColor Yellow;" ^
  "  Write-Host '';" ^
  "  Read-Host 'Press Enter to exit'" ^
  "}"

del "%PS1%" 2>nul
pause
