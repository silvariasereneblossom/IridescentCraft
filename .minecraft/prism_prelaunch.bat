@echo off
REM ============================================================================
REM PrismLauncher pre-launch hook for IridescentCraft (git-checkout install).
REM ============================================================================
REM
REM Set PrismLauncher's pre-launch command to:
REM   "$INST_MC_DIR/prism_prelaunch.bat"
REM
REM Two-phase self-relaunch design:
REM
REM   Phase 1 (top of file): git pull only. Then `call SELF --post-pull`
REM     and exit. cmd.exe re-opens the bat on every `call`, so the inner
REM     invocation reads whatever bat content is on disk after the pull.
REM     This means an update to this bat itself takes effect on the SAME
REM     launch, not the next one (subject to NTFS + FILE_SHARE_DELETE
REM     semantics for the in-place replacement, which Git for Windows
REM     and cmd.exe both honour).
REM
REM   Phase 2 (after :post_pull label): cleanup + download_mods + wire.
REM     These run from the just-pulled bat content -- new hooks, new
REM     defaults, new arg lists all in effect.
REM
REM Result: when we add a new pre-launch step upstream, the operator's
REM very next launch picks it up, no manual intervention or second
REM launch required.
REM
REM For testers using the zip-distribution (non-git) install pattern,
REM use sync_client.bat instead -- it does the GitHub zip overlay AND
REM the cleanup, with its own .new staging mechanism for self-updates.
REM ============================================================================

setlocal enabledelayedexpansion
set "MC_DIR=%~dp0"
if "!MC_DIR:~-1!"=="\" set "MC_DIR=!MC_DIR:~0,-1!"
set "INSTANCE_DIR=!MC_DIR!\.."

REM --- Phase 1: pull, then re-exec into Phase 2 ---
REM
REM Re-exec is gated on the --post-pull arg so we don't recurse forever.
REM On the SECOND entry (with --post-pull set), this block is skipped
REM and control flows straight to :post_pull.
if /i not "%~1"=="--post-pull" (
    REM Restore any working-tree-deleted .pw.toml files in mods/.index/
    REM before pulling. PrismLauncher 11's Mod manager (and any similar
    REM packwiz-aware tool) sweeps mods/.index/*.pw.toml and removes
    REM entries whose matching jar isn't on disk yet. Without restoring
    REM them, `git pull --ff-only` succeeds ("up to date") but leaves
    REM the deletions in place -- download_mods.ps1 then can't see the
    REM tomls and never fetches the jars. Infinite loop.
    REM
    REM `git restore` only undoes working-tree deletions of files still
    REM tracked in HEAD; intentional removals (via `git rm` + commit)
    REM are recorded in the index and unaffected. Safe to run every
    REM launch.
    echo [prism_prelaunch] restore deleted .pw.toml index entries...
    git -C "!INSTANCE_DIR!" restore -- .minecraft/mods/.index/ 2>nul

    echo [prism_prelaunch] git pull...
    git -C "!INSTANCE_DIR!" pull --ff-only
    if errorlevel 1 (
        echo [prism_prelaunch] WARNING: git pull failed; continuing with current working tree
    )
    REM Re-execute the bat. cmd.exe re-opens the file from disk, so any
    REM pull-applied update to THIS bat takes effect right now.
    REM
    REM Propagating exit code through endlocal: errorlevel is process-
    REM scoped (not part of setlocal scope) so `exit /b` with no arg
    REM uses the post-call errorlevel.
    call "%~f0" --post-pull
    endlocal & exit /b
)

REM ===================================================================
REM Phase 2 -- post-pull hooks. Everything below runs from the bat
REM content as it exists on disk AFTER the pull. Adding new hooks
REM upstream takes effect immediately.
REM ===================================================================

:post_pull

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

REM Always exit 0 -- a download failure shouldn't block launch (operator
REM may be intentionally offline / running solo). Warnings emitted above
REM are surfaced in PrismLauncher's pre-launch log.
endlocal
exit /b 0
