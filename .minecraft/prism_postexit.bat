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
REM   3. git add + commit + (fetch + rebase) + push the WHOLE TesterLogs/
REM      tree so server-side logs deposited via Z: by push_crash_logs.bat
REM      ride along.
REM
REM Always pushes latest.log + debug.log + kubejs/{client,server,startup}.log,
REM regardless of clean exit or crash. Failure modes surface error text
REM (previously >nul 2>&1 swallowed git failures, so unpushed local commits
REM silently accumulated for days when push hit auth/network/divergence).
REM This script never blocks PrismLauncher from finishing the exit.
REM
REM Self-healing for divergence: postexit does `git pull --rebase --autostash`
REM before pushing. That way if a prior session's push failed and left a
REM local-only commit, the next postexit absorbs upstream commits and
REM re-pushes the stack -- no manual recovery needed. Prelaunch keeps its
REM `git pull --ff-only` so it never silently rewrites user edits.
REM
REM Wired automatically by distribution/client/wire_instance_cfg.ps1, which is
REM invoked from prism_prelaunch.bat Phase 2 (the kubejs auto_fix that used to
REM do this was deleted in 642399e8). First-run wiring is a one-time manual
REM step -- see container-backup/windows-migration.md.
REM ============================================================================

setlocal enabledelayedexpansion
set "MC_DIR=%~dp0"
if "%MC_DIR:~-1%"=="\" set "MC_DIR=%MC_DIR:~0,-1%"
set "INSTANCE_DIR=%MC_DIR%\.."

if not exist "%MC_DIR%\logs\latest.log" (
    echo [postexit] No latest.log; nothing to push
    exit /b 0
)

REM -- Username extraction -----------------------------------------------------
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

REM -- git add + commit + rebase + push ----------------------------------------
REM Add the entire TesterLogs/ tree, not just %USERNAME%/, so server logs
REM that landed via push_crash_logs.bat (Z: mirror) ride along on this push.
REM Errors are NOT silenced -- they were prior to 2026-05-12 and that masked
REM six days of failed pushes after a single divergence.
pushd "%INSTANCE_DIR%"

git add ".minecraft/TesterLogs/"
if errorlevel 1 echo [postexit] WARN: git add returned non-zero

REM Check if there's anything staged. `git diff --cached --quiet` returns
REM errorlevel 1 when staged changes exist, 0 when clean.
git diff --cached --quiet
if not errorlevel 1 (
    echo [postexit] No changes to push
    popd
    endlocal
    exit /b 0
)

git commit -m "TesterLogs: session logs (%USERNAME%)"
if errorlevel 1 (
    echo [postexit] ERROR: git commit failed. Logs mirrored to disk only.
    popd
    endlocal
    exit /b 0
)

echo [postexit] git fetch + rebase + push ...
git fetch
if errorlevel 1 echo [postexit] WARN: git fetch failed -- offline? Attempting push anyway.

REM Pull-rebase to absorb any upstream commits (likely if previous push
REM failed and origin has since moved forward). --autostash protects any
REM unrelated working-tree edits during the rebase. On conflict, abort
REM cleanly so the working tree is left consistent for the user.
git pull --rebase --autostash
if errorlevel 1 (
    echo [postexit] ERROR: rebase failed; aborting rebase.
    git rebase --abort >nul 2>&1
    echo [postexit] Logs committed locally but NOT pushed. From the instance dir:
    echo [postexit]   git status
    echo [postexit]   git pull --rebase
    echo [postexit]   resolve conflicts, then: git rebase --continue ^&^& git push
    popd
    endlocal
    exit /b 0
)

git push
if errorlevel 1 (
    echo [postexit] ERROR: git push failed. Logs committed locally only.
    echo [postexit] Likely network/auth -- check Windows Credential Manager
    echo [postexit] for a github.com entry. Logs remain in .minecraft\TesterLogs\.
) else (
    echo [postexit] Logs pushed
)

popd
endlocal
exit /b 0
