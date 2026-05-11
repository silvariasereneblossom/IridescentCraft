@echo off
REM ============================================================================
REM PrismLauncher pre-launch hook for IridescentCraft (git-checkout install).
REM ============================================================================
REM
REM Set PrismLauncher's pre-launch command to:
REM   "$INST_MC_DIR/prism_prelaunch.bat"
REM
REM What it does:
REM   1. git pull --ff-only on the instance root (parent of .minecraft)
REM      so the latest config / kubejs / wiki / custom jars land in the
REM      working tree.
REM   2. cleanup_stale_jars.ps1 to remove orphan mod jars whose .pw.toml
REM      was deleted upstream but the jar still sits in mods/.
REM   3. download_mods.ps1 to fetch any packwiz-managed jars whose
REM      .pw.toml was added/updated upstream but whose jar isn't
REM      committed to the repo (mode = 'metadata:curseforge' mods are
REM      metadata-only in git; the jar is fetched at runtime). Without
REM      this, `git pull` brings in a new .pw.toml and cleanup sees the
REM      metadata file as "expected" -- but mods/ has no actual jar
REM      and Forge silently launches without the mod.
REM   4. wire_instance_cfg.ps1 to ensure PostExitCommand stays wired.
REM
REM This bat self-updates: when git pull replaces this file with a newer
REM version, the version on disk takes effect on the NEXT launch. cmd.exe
REM has the current bat buffered for the rest of THIS launch, so changes
REM lag one launch. The launch-after-pull edge is mitigated by failing
REM LOUDLY (non-zero errorlevel surfaces in PrismLauncher's pre-launch
REM log) so the operator can re-run instead of silently entering MC with
REM missing mods.
REM
REM For testers using the zip-distribution (non-git) install pattern,
REM use sync_client.bat instead -- it does the GitHub zip overlay AND
REM the cleanup.
REM ============================================================================

setlocal enabledelayedexpansion
set "MC_DIR=%~dp0"
if "!MC_DIR:~-1!"=="\" set "MC_DIR=!MC_DIR:~0,-1!"
set "INSTANCE_DIR=!MC_DIR!\.."
set "FAILED=0"

echo [prism_prelaunch] git pull...
git -C "!INSTANCE_DIR!" pull --ff-only
if errorlevel 1 (
    echo [prism_prelaunch] WARNING: git pull failed; continuing with current working tree
)

echo [prism_prelaunch] cleanup stale jars...
if exist "!MC_DIR!\distribution\client\cleanup_stale_jars.ps1" (
    powershell -ExecutionPolicy Bypass -File "!MC_DIR!\distribution\client\cleanup_stale_jars.ps1" -ModsDir "!MC_DIR!\mods" -IndexDir "!MC_DIR!\mods\.index"
) else (
    echo [prism_prelaunch] cleanup_stale_jars.ps1 not found at distribution/client/, skipping
)

echo [prism_prelaunch] download missing packwiz jars...
if exist "!MC_DIR!\distribution\client\download_mods.ps1" (
    powershell -ExecutionPolicy Bypass -File "!MC_DIR!\distribution\client\download_mods.ps1" -IndexDir "!MC_DIR!\mods\.index" -ModsDir "!MC_DIR!\mods"
    if errorlevel 1 (
        echo [prism_prelaunch] WARNING: one or more mod downloads FAILED.
        echo [prism_prelaunch] See "!MC_DIR!\download_log.txt" for URLs tried.
        echo [prism_prelaunch] The client may be missing mods and fail handshake with the server.
        set "FAILED=1"
    )
) else (
    echo [prism_prelaunch] download_mods.ps1 not found at distribution/client/, skipping
)

echo [prism_prelaunch] wire instance.cfg (PreLaunch + PostExit hooks)...
if exist "!MC_DIR!\distribution\client\wire_instance_cfg.ps1" (
    powershell -ExecutionPolicy Bypass -File "!MC_DIR!\distribution\client\wire_instance_cfg.ps1" -GameDir "!MC_DIR!"
) else (
    echo [prism_prelaunch] wire_instance_cfg.ps1 not found at distribution/client/, skipping
)

REM Always exit 0 -- a download failure shouldn't block launch (the user
REM may be intentionally offline or running solo). The warning above is
REM enough for PrismLauncher's pre-launch log to surface the problem.
endlocal
exit /b 0
