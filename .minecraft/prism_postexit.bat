@echo off
REM ============================================================================
REM PrismLauncher post-exit hook for IridescentCraft.
REM ============================================================================
REM
REM Set as PrismLauncher's PostExitCommand:
REM   "$INST_MC_DIR/prism_postexit.bat"
REM
REM Companion to prism_prelaunch.bat. Runs after the Minecraft client exits.
REM
REM   1. Identifies the launching account from latest.log line 1
REM      (the --username, <name> arg ModLauncher logs at startup).
REM   2. Mirrors session logs into .minecraft/TesterLogs/<username>/ +
REM      .minecraft/TesterLogs/<username>/kubejs/, plus any crash reports
REM      created during this session (latest.log creation time as the
REM      session-start anchor).
REM   3. git add + commit + push the WHOLE TesterLogs/ tree so server-side
REM      logs deposited via Z: by push_crash_logs.bat ride along.
REM
REM Always pushes latest.log + debug.log + kubejs/{client,server,startup}.log,
REM regardless of clean exit or crash. Failure modes are quiet -- this script
REM never blocks PrismLauncher from finishing the exit.
REM
REM Set automatically by kubejs/client_scripts/auto_fix_prism_prelaunch.js on
REM first login; no manual config needed.
REM ============================================================================

setlocal enabledelayedexpansion
set "MC_DIR=%~dp0"
if "%MC_DIR:~-1%"=="\" set "MC_DIR=%MC_DIR:~0,-1%"
set "INSTANCE_DIR=%MC_DIR%\.."

if not exist "%MC_DIR%\logs\latest.log" (
    echo [postexit] No latest.log; nothing to push
    exit /b 0
)

REM ── Username extraction ─────────────────────────────────────────────────────
REM ModLauncher logs `--username, <name>` in args[] on line 1 of latest.log.
REM Write the captured name to a temp file then read it back; this avoids the
REM bat for-loop quoting traps with embedded PowerShell single-quotes.
set "USERTMP=%MC_DIR%\.icraft_user.tmp"
powershell -NoProfile -Command "$line = Get-Content '%MC_DIR%\logs\latest.log' -TotalCount 1 -ErrorAction SilentlyContinue; if ($line -match '--username,\s*([A-Za-z0-9_]+)') { Set-Content -Path '%USERTMP%' -Value $matches[1] -NoNewline -Encoding ASCII }"
set "USERNAME=unknown"
if exist "%USERTMP%" (
    set /p USERNAME=<"%USERTMP%"
    del "%USERTMP%" >nul 2>&1
)
if "%USERNAME%"=="" set "USERNAME=unknown"

set "DEST=%MC_DIR%\TesterLogs\%USERNAME%"
if not exist "%DEST%" mkdir "%DEST%"
if not exist "%DEST%\kubejs" mkdir "%DEST%\kubejs"

echo [postexit] Mirroring logs to TesterLogs\%USERNAME%\

copy /y "%MC_DIR%\logs\latest.log"         "%DEST%\latest.log"         >nul 2>&1
copy /y "%MC_DIR%\logs\debug.log"          "%DEST%\debug.log"          >nul 2>&1
copy /y "%MC_DIR%\logs\kubejs\client.log"  "%DEST%\kubejs\client.log"  >nul 2>&1
copy /y "%MC_DIR%\logs\kubejs\server.log"  "%DEST%\kubejs\server.log"  >nul 2>&1
copy /y "%MC_DIR%\logs\kubejs\startup.log" "%DEST%\kubejs\startup.log" >nul 2>&1

REM Crash reports created during this session only. latest.log creation time
REM is the session-start anchor (Forge rotates the prior latest.log on launch).
if exist "%MC_DIR%\crash-reports" (
    if not exist "%DEST%\crash-reports" mkdir "%DEST%\crash-reports"
    powershell -NoProfile -Command "$session = (Get-Item '%MC_DIR%\logs\latest.log' -ErrorAction SilentlyContinue).CreationTime; if ($session) { Get-ChildItem '%MC_DIR%\crash-reports\*.txt' -ErrorAction SilentlyContinue | Where-Object { $_.LastWriteTime -ge $session } | Copy-Item -Destination '%DEST%\crash-reports\' -Force -ErrorAction SilentlyContinue }"
)

REM ── git add + commit + push ─────────────────────────────────────────────────
REM Add the entire TesterLogs/ tree, not just %USERNAME%/, so server logs
REM that landed via push_crash_logs.bat (Z: mirror) ride along on this push.
pushd "%INSTANCE_DIR%"
git add ".minecraft/TesterLogs/" >nul 2>&1
git diff --cached --quiet
if errorlevel 1 (
    git commit -m "TesterLogs: session logs (%USERNAME%)" >nul 2>&1
    git push >nul 2>&1
    echo [postexit] Logs pushed
) else (
    echo [postexit] No changes to push
)
popd

endlocal
exit /b 0
