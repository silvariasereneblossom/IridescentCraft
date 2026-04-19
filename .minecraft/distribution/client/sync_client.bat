@echo off
REM IridescentCraft Client Sync — PrismLauncher pre-launch hook
REM
REM This bat is a thin wrapper around sync_client.ps1 for users who prefer
REM a .bat pre-launch command. You can point PrismLauncher directly at the
REM .ps1 instead if you want.
REM
REM PrismLauncher pre-launch command (using this bat):
REM   "%INST_MC_DIR%\sync_client.bat"
REM
REM Or directly (using PowerShell):
REM   powershell -ExecutionPolicy Bypass -File "%INST_MC_DIR%\sync_client.ps1"
REM
REM -Force: delete .icraft_last_sha so the next sync does a full-zip
REM download. Use after a drift is detected:
REM   sync_client.bat -Force

setlocal
set "SCRIPT_DIR=%~dp0"

set "FORCE_ARG="
if /i "%1"=="-Force"  set "FORCE_ARG=-Force"
if /i "%1"=="--force" set "FORCE_ARG=-Force"
if /i "%1"=="/force"  set "FORCE_ARG=-Force"

powershell -ExecutionPolicy Bypass -File "%SCRIPT_DIR%sync_client.ps1" %FORCE_ARG%
exit /b 0
