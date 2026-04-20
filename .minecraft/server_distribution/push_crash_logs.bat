@echo off
setlocal enabledelayedexpansion
REM =============================================================================
REM IridescentCraft — Collect server logs for transfer to repo
REM Copies last 3 crash reports, ALL kubejs/*.log files, logs/latest.log, and
REM logs/debug.log into TesterLogs/Server Logs/ for manual transfer to the
REM dev machine's repo copy (server is not itself a git repo).
REM =============================================================================

cd /d "%~dp0"

set "DEST=TesterLogs\Server Logs"
if not exist "%DEST%" mkdir "%DEST%"

echo.
echo [Logs] Collecting server logs...
echo.

REM --- Last 3 crash reports (sorted newest first) ---
set crashCount=0
if exist "crash-reports" (
    for /f "delims=" %%F in ('dir /b /o-d "crash-reports\*.txt" 2^>nul') do (
        if !crashCount! LSS 3 (
            copy /Y "crash-reports\%%F" "%DEST%\%%F" >nul
            echo   Crash: %%F
            set /a crashCount=!crashCount!+1
        )
    )
)

REM --- ALL files in logs\kubejs\ (server.log, startup.log, client.log, and
REM     any rotated .log / .log.gz files). Flattens into DEST with kubejs-
REM     prefix so filenames don't collide with other logs.
if exist "logs\kubejs" (
    for %%F in ("logs\kubejs\*.log" "logs\kubejs\*.log.gz") do (
        if exist "%%F" (
            copy /Y "%%F" "%DEST%\kubejs-%%~nxF" >nul
            echo   KubeJS: %%~nxF
        )
    )
)

REM --- logs\latest.log (vanilla server log) ---
if exist "logs\latest.log" (
    copy /Y "logs\latest.log" "%DEST%\latest.log" >nul
    echo   Server: latest.log
)

REM --- logs\debug.log if present (Forge debug output) ---
if exist "logs\debug.log" (
    copy /Y "logs\debug.log" "%DEST%\debug.log" >nul
    echo   Server: debug.log
)

echo.
echo [Logs] Files copied to: %~dp0%DEST%
echo.
echo [Logs] To share with the dev machine:
echo   1. Copy the "%DEST%" folder contents back to your
echo      repo's server_distribution\TesterLogs\Server Logs\ folder
echo   2. git add + commit + push from the dev machine
echo.
pause
exit /b 0
