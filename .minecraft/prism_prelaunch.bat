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
REM      working tree
REM   2. cleanup_stale_jars.ps1 to remove orphan mod jars whose .pw.toml
REM      was deleted upstream but the jar still sits in mods/ (e.g.,
REM      ScalingMobs / ImprovedMobs / Azukaars after the 2026-05-03
REM      deprecation of those 3 mods, or Truly-Modular-* after the
REM      2026-05 tetra-expansion replaced them).
REM   3. download_mods.ps1 to fetch any packwiz-managed jars whose
REM      .pw.toml was added/updated upstream but whose jar isn't
REM      committed to the repo (mode = 'metadata:curseforge' mods are
REM      metadata-only in git; the jar is fetched at runtime). Without
REM      this, `git pull` brings in a new .pw.toml and cleanup sees the
REM      metadata file as "expected" -- but mods/ has no actual jar
REM      and Forge silently launches without the mod. Added 2026-05-11
REM      after dans-magic + simple-staves landed via .pw.toml only and
REM      the client failed to load them.
REM   4. wire_instance_cfg.ps1 to ensure PostExitCommand stays wired to
REM      prism_postexit.bat. Self-heals if instance.cfg ever drifts
REM      (e.g., PrismLauncher version upgrade resets the field) and is
REM      a no-op when both fields are already set correctly. Replaces
REM      the kubejs auto_fix_prism_prelaunch.js path which is now
REM      blocked by KubeJS' tightened class filter (java.io.File and
REM      java.lang.ProcessBuilder both denied as of recent versions).
REM
REM Prior to 2026-05-03 the pre-launch was just `git pull` — which left
REM removed packwiz-managed jars as orphans. Cleanup has to run after
REM every pull because every fresh deprecation produces new orphans.
REM
REM For testers using the zip-distribution (non-git) install pattern,
REM use sync_client.bat instead — it does the GitHub zip overlay AND
REM the cleanup.
REM ============================================================================

setlocal
set "MC_DIR=%~dp0"
if "%MC_DIR:~-1%"=="\" set "MC_DIR=%MC_DIR:~0,-1%"
set "INSTANCE_DIR=%MC_DIR%\.."

echo [prism_prelaunch] git pull...
git -C "%INSTANCE_DIR%" pull --ff-only
if errorlevel 1 (
    echo [prism_prelaunch] WARNING: git pull failed; continuing with current working tree
)

echo [prism_prelaunch] cleanup stale jars...
if exist "%MC_DIR%\distribution\client\cleanup_stale_jars.ps1" (
    powershell -ExecutionPolicy Bypass -File "%MC_DIR%\distribution\client\cleanup_stale_jars.ps1" -ModsDir "%MC_DIR%\mods" -IndexDir "%MC_DIR%\mods\.index"
) else (
    echo [prism_prelaunch] cleanup_stale_jars.ps1 not found at distribution/client/, skipping
)

echo [prism_prelaunch] download missing packwiz jars...
if exist "%MC_DIR%\distribution\client\download_mods.ps1" (
    powershell -ExecutionPolicy Bypass -File "%MC_DIR%\distribution\client\download_mods.ps1" -IndexDir "%MC_DIR%\mods\.index" -ModsDir "%MC_DIR%\mods"
) else (
    echo [prism_prelaunch] download_mods.ps1 not found at distribution/client/, skipping
)

echo [prism_prelaunch] wire instance.cfg (PreLaunch + PostExit hooks)...
if exist "%MC_DIR%\distribution\client\wire_instance_cfg.ps1" (
    powershell -ExecutionPolicy Bypass -File "%MC_DIR%\distribution\client\wire_instance_cfg.ps1" -GameDir "%MC_DIR%"
) else (
    echo [prism_prelaunch] wire_instance_cfg.ps1 not found at distribution/client/, skipping
)

endlocal
exit /b 0
