@echo off
REM IridescentCraft Distribution Verification
REM Run from .minecraft/ before pushing
REM   verify_distros.bat        = check only
REM   verify_distros.bat -Fix   = check + auto-copy missing files
cd /d "%~dp0"
powershell -ExecutionPolicy Bypass -File "%~dp0verify_distros.ps1" %*
pause
