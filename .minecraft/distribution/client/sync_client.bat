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

setlocal
set "SCRIPT_DIR=%~dp0"
powershell -ExecutionPolicy Bypass -File "%SCRIPT_DIR%sync_client.ps1"
exit /b 0
