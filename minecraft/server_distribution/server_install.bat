@echo off
REM IridescentCraft Server Installation Script (Windows)
REM Delegates to PowerShell for reliable TOML parsing and mod downloads.
REM
REM Usage: Double-click server_install.bat

title IridescentCraft Server Installer
echo ==========================================
echo   IridescentCraft Server Installer
echo   Forge 1.20.1-47.4.0
echo ==========================================
echo.
echo Launching PowerShell installer...
echo.

powershell -ExecutionPolicy Bypass -File "%~dp0server_install.ps1"

echo.
pause
