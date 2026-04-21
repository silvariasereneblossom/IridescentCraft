@echo off
setlocal enabledelayedexpansion
REM =============================================================================
REM IridescentCraft — Push server logs directly to the repo via network drive
REM Primary destination: Z:\...\PrismLauncher\instances\IridescentCraft\.minecraft\
REM                      server_distribution\TesterLogs\Server Logs\
REM (network drive on the Windows Server mapped to the dev machine's repo copy)
REM
REM Fallback: local server_distribution\TesterLogs\Server Logs\ if Z: isn't
REM mounted, so the script still works offline. Historically everything went
REM to the local path and the user had to manually transfer — which is why
REM logs kept appearing stale in the repo.
REM =============================================================================

cd /d "%~dp0"

set "REMOTE_DEST=Z:\Users\Silvaria Zemaitis\AppData\Roaming\PrismLauncher\instances\IridescentCraft\.minecraft\server_distribution\TesterLogs\Server Logs"
set "LOCAL_DEST=TesterLogs\Server Logs"

REM Detect whether Z: is mounted and the repo TesterLogs folder exists.
REM We check for the server_distribution directory root under the mapped
REM PrismLauncher instance — if that's there, the repo is accessible.
set "REPO_ROOT=Z:\Users\Silvaria Zemaitis\AppData\Roaming\PrismLauncher\instances\IridescentCraft\.minecraft\server_distribution"
if exist "%REPO_ROOT%" (
    set "DEST=%REMOTE_DEST%"
    set "MODE=repo"
    if not exist "%REMOTE_DEST%" mkdir "%REMOTE_DEST%"
    echo.
    echo [Logs] Pushing directly to repo via Z: ^(mapped network drive^)
    echo [Logs]   -^> %REMOTE_DEST%
) else (
    set "DEST=%LOCAL_DEST%"
    set "MODE=local"
    if not exist "%LOCAL_DEST%" mkdir "%LOCAL_DEST%"
    echo.
    echo [Logs] Z: not mounted or repo path not found — falling back to local:
    echo [Logs]   -^> %~dp0%LOCAL_DEST%
    echo [Logs] ^(You'll need to transfer this folder back to the repo manually.^)
)
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
if "%MODE%"=="repo" (
    echo [Logs] Done. Files are now on the repo drive — commit + push from
    echo [Logs] the dev machine.
) else (
    echo [Logs] Done. Files are in the local server_distribution folder.
    echo [Logs] Copy them to the repo and commit there.
)
echo.
pause
exit /b 0
