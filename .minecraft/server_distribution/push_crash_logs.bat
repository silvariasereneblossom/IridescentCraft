@echo off
setlocal enabledelayedexpansion
REM =============================================================================
REM IridescentCraft — Collect + auto-push server logs
REM Copies last 3 crash reports, ALL kubejs/*.log files, and logs/latest.log
REM into TesterLogs/Server Logs/, then git adds + commits + pushes.
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
REM     any rotated .log / .log.gz files). Flattens into DEST with kubejs- prefix
REM     so filenames don't collide with other logs.
if exist "logs\kubejs" (
    for %%F in ("logs\kubejs\*.log" "logs\kubejs\*.log.gz") do (
        if exist "%%F" (
            copy /Y "%%F" "%DEST%\kubejs-%%~nxF" >nul
            echo   KubeJS: %%~nxF
        )
    )
)

REM --- logs\latest.log (full vanilla server log) ---
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
echo [Logs] Files copied to %DEST%

REM --- Auto git add + commit + push (only if in a git repo with git on PATH) ---
where git >nul 2>&1
if errorlevel 1 (
    echo.
    echo [Logs] git not on PATH — skipping auto-push. Commit manually.
    echo.
    pause
    exit /b 0
)

git rev-parse --git-dir >nul 2>&1
if errorlevel 1 (
    echo.
    echo [Logs] Not inside a git repo — skipping auto-push.
    echo.
    pause
    exit /b 0
)

echo.
echo [Logs] Auto-pushing to remote...
git add "%DEST%"
for /f "tokens=*" %%T in ('powershell -NoProfile -Command "Get-Date -Format yyyy-MM-dd_HH:mm"') do set STAMP=%%T
git commit -m "Push server logs %STAMP%"
if errorlevel 1 (
    echo   Nothing to commit ^(files unchanged^) — skipping push.
) else (
    git push
    if errorlevel 1 (
        echo   [Logs] git push FAILED — fix credentials or resolve manually.
    ) else (
        echo   [Logs] Pushed.
    )
)

echo.
pause
exit /b 0
