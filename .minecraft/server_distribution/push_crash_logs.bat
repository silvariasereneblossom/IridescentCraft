@echo off
REM =============================================================================
REM IridescentCraft — Collect server logs for push
REM Copies crash reports + kubejs logs to TesterLogs/Server Logs/
REM Then stages for git commit. Run from server directory.
REM =============================================================================

cd /d "%~dp0"

set "DEST=TesterLogs\Server Logs"
if not exist "%DEST%" mkdir "%DEST%"

echo [Logs] Collecting server logs...

REM Latest crash report
if exist "crash-reports" (
    for /f "delims=" %%F in ('dir /b /o-d "crash-reports\*.txt" 2^>nul') do (
        copy /Y "crash-reports\%%F" "%DEST%\%%F" >nul
        echo   Crash: %%F
        goto :got_crash
    )
)
:got_crash

REM KubeJS server log
if exist "logs\kubejs\server.log" (
    copy /Y "logs\kubejs\server.log" "%DEST%\server.log" >nul
    echo   KubeJS: server.log
)

REM Startup log
if exist "logs\kubejs\startup.log" (
    copy /Y "logs\kubejs\startup.log" "%DEST%\startup.log" >nul
    echo   KubeJS: startup.log
)

REM Server latest.log
if exist "logs\latest.log" (
    copy /Y "logs\latest.log" "%DEST%\latest.log" >nul
    echo   Server: latest.log
)

echo.
echo [Logs] Files copied to %DEST%
echo [Logs] Push from your git client to upload to repo.
echo.
pause
