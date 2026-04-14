@echo off
REM IridescentCraft Distribution Verification
REM Run from .minecraft/ before pushing
REM   verify_distros.bat        = check only
REM   verify_distros.bat fix    = check + auto-copy missing files
cd /d "%~dp0"
if /I "%1"=="fix" (
    powershell -ExecutionPolicy Bypass -File "%~dp0verify_distros.ps1" -Fix
) else if /I "%1"=="-fix" (
    powershell -ExecutionPolicy Bypass -File "%~dp0verify_distros.ps1" -Fix
) else (
    powershell -ExecutionPolicy Bypass -File "%~dp0verify_distros.ps1"
)
pause
