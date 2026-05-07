@echo off
setlocal enabledelayedexpansion
REM =============================================================================
REM IridescentCraft - Push server logs directly to the repo via network drive
REM Primary destination: Z:\...\PrismLauncher\instances\IridescentCraft\.minecraft\
REM                      server_distribution\TesterLogs\Server Logs\
REM (network drive on the Windows Server mapped to the dev machine's repo copy)
REM
REM Fallback: local server_distribution\TesterLogs\Server Logs\ if Z: isn't
REM mounted, so the script still works offline. Historically everything went
REM to the local path and the user had to manually transfer - which is why
REM logs kept appearing stale in the repo.
REM
REM Modes:
REM   push_crash_logs.bat              interactive (manual failsafe; pauses
REM                                    at end so the operator can read the
REM                                    summary before the cmd window closes)
REM   push_crash_logs.bat --silent     non-interactive (called by Phase 5 of
REM                                    iridescentserver.bat on every server
REM                                    exit; suppresses pause + most echos
REM                                    and additionally tries a git push if
REM                                    the parent dir is a git working tree)
REM =============================================================================

set "SILENT=0"
if /i "%1"=="--silent" set "SILENT=1"
if /i "%1"=="-s"       set "SILENT=1"

cd /d "%~dp0"

set "REMOTE_DEST=Z:\Users\Silvaria Zemaitis\AppData\Roaming\PrismLauncher\instances\IridescentCraft\.minecraft\server_distribution\TesterLogs\Server Logs"
set "LOCAL_DEST=TesterLogs\Server Logs"

REM Detect whether Z: is mounted and the repo TesterLogs folder exists.
REM We check for the server_distribution directory root under the mapped
REM PrismLauncher instance - if that's there, the repo is accessible.
set "REPO_ROOT=Z:\Users\Silvaria Zemaitis\AppData\Roaming\PrismLauncher\instances\IridescentCraft\.minecraft\server_distribution"
if exist "%REPO_ROOT%" (
    set "DEST=%REMOTE_DEST%"
    set "MODE=repo"
    if not exist "%REMOTE_DEST%" mkdir "%REMOTE_DEST%"
    if "%SILENT%"=="0" (
        echo.
        echo [Logs] Pushing directly to repo via Z: ^(mapped network drive^)
        echo [Logs]   -^> %REMOTE_DEST%
    )
) else (
    set "DEST=%LOCAL_DEST%"
    set "MODE=local"
    if not exist "%LOCAL_DEST%" mkdir "%LOCAL_DEST%"
    if "%SILENT%"=="0" (
        echo.
        echo [Logs] Z: not mounted or repo path not found - falling back to local:
        echo [Logs]   -^> %~dp0%LOCAL_DEST%
        echo [Logs] ^(You'll need to transfer this folder back to the repo manually.^)
    )
)
if "%SILENT%"=="0" echo.

REM --- Last 3 crash reports (sorted newest first) ---
set crashCount=0
if exist "crash-reports" (
    for /f "delims=" %%F in ('dir /b /o-d "crash-reports\*.txt" 2^>nul') do (
        if !crashCount! LSS 3 (
            copy /Y "crash-reports\%%F" "%DEST%\%%F" >nul
            if "%SILENT%"=="0" echo   Crash: %%F
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
            if "%SILENT%"=="0" echo   KubeJS: %%~nxF
        )
    )
)

REM --- logs\latest.log (vanilla server log) ---
if exist "logs\latest.log" (
    copy /Y "logs\latest.log" "%DEST%\latest.log" >nul
    if "%SILENT%"=="0" echo   Server: latest.log
)

REM --- logs\debug.log if present (Forge debug output) ---
if exist "logs\debug.log" (
    copy /Y "logs\debug.log" "%DEST%\debug.log" >nul
    if "%SILENT%"=="0" echo   Server: debug.log
)

REM --- Silent-mode tail: best-effort git push from a discoverable git root. ---
REM Only fires when invoked as `push_crash_logs.bat --silent`. Two topologies:
REM
REM   A. dev PC IS the server. Local instance root is the git working tree.
REM      Push directly.
REM
REM   B. Dedicated Windows Server with Z: mapped to the dev PC's repo. Server
REM      has NO local .git, but Z:\...\IridescentCraft\.git IS the dev PC's
REM      working tree. Push from there - server-side `git push` reads creds
REM      from the dev PC's .git/config (HTTPS+PAT remote URL pattern).
REM
REM Try local first, then Z:-mapped. If neither is a git tree (or git itself
REM isn't on PATH), the logs are still mirrored - the dev PC's next session
REM will pick them up via prism_postexit, but with delay.
if "%SILENT%"=="1" (
    where git >nul 2>&1
    if errorlevel 1 (
        echo [postexit] git not on PATH; logs mirrored only
        exit /b 0
    )

    set "GIT_ROOT="
    if exist "%~dp0..\..\.git" set "GIT_ROOT=%~dp0..\.."
    if not defined GIT_ROOT if exist "!REPO_ROOT!\..\..\.git" set "GIT_ROOT=!REPO_ROOT!\..\.."

    REM PAT auth: prefer ICRAFT_GH_TOKEN env var; fall back to a
    REM .icraft_token file next to this script (one line, the PAT only).
    REM Both should be a fine-grained PAT scoped to Contents:write on
    REM the IridescentCraft repo. Without one, plain `git push` runs
    REM and likely fails silently if no credential helper is set up.
    set "GIT_PAT="
    if defined ICRAFT_GH_TOKEN set "GIT_PAT=!ICRAFT_GH_TOKEN!"
    if not defined GIT_PAT if exist "%~dp0.icraft_token" (
        set /p GIT_PAT=<"%~dp0.icraft_token"
    )

    if defined GIT_ROOT (
        pushd "!GIT_ROOT!"
        git add ".minecraft/server_distribution/TesterLogs/Server Logs/" 2>&1
        git diff --cached --quiet
        if errorlevel 1 (
            git commit -m "Server Logs: session logs" 2>&1
            REM Push errors deliberately NOT silenced -- previous version
            REM redirected stderr to nul which hid PAT/network failures.
            if defined GIT_PAT (
                git -c http.extraHeader="AUTHORIZATION: bearer !GIT_PAT!" push 2>&1
            ) else (
                echo [postexit] WARN: no PAT configured ^(set ICRAFT_GH_TOKEN or drop a .icraft_token next to this script^); attempting unauthenticated push
                git push 2>&1
            )
            if errorlevel 1 (
                echo [postexit] ERROR: git push failed ^(see message above^). Logs mirrored only.
            ) else (
                echo [postexit] Server logs pushed ^(via !GIT_ROOT!^)
            )
        ) else (
            echo [postexit] No log changes to push
        )
        popd
    ) else (
        echo [postexit] No git tree at local or Z: instance root; logs mirrored only
    )
    exit /b 0
)

echo.
if "%MODE%"=="repo" (
    echo [Logs] Done. Files are now on the repo drive - commit + push from
    echo [Logs] the dev machine.
) else (
    echo [Logs] Done. Files are in the local server_distribution folder.
    echo [Logs] Copy them to the repo and commit there.
)
echo.
pause
exit /b 0
