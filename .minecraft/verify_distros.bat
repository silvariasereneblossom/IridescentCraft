@echo off
REM IridescentCraft Distribution Verification
REM Run from .minecraft/ before pushing
cd /d "%~dp0"
powershell -ExecutionPolicy Bypass -File "%~dp0verify_distros.ps1"
pause
