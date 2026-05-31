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
    REM This is the git-checkout install path. If there's no .git at the
    REM instance root, the operator is on the zip-distribution install --
    REM there's nothing to pull, so skip the whole git phase cleanly rather
    REM than letting every git call below fail with "not a repository" noise.
    REM (sync_client.bat is the hook for that install pattern.)
    if not exist "!INSTANCE_DIR!\.git" (
        echo [prism_prelaunch] No .git at instance root -- not a git-checkout install.
        echo [prism_prelaunch] Skipping git pull; continuing with existing files.
        call "%~f0" --post-pull
        endlocal & exit /b 0
    )

    REM Clear a stale .git\index.lock left by a git operation that was killed
    REM mid-run (e.g. PrismLauncher / the machine shut down during a prior
    REM pull). Git refuses EVERY subsequent operation while index.lock exists,
    REM so without this the pull below fails on every launch until the user
    REM manually deletes it. We only remove the bare index.lock (cheap, safe
    REM to recreate); in-progress merge/rebase state is handled by the
    REM rebase --abort fallback further down.
    if exist "!INSTANCE_DIR!\.git\index.lock" (
        echo [prism_prelaunch] WARNING: stale .git\index.lock found -- removing it.
        echo [prism_prelaunch] ^(A prior git operation was likely interrupted.^)
        del /f /q "!INSTANCE_DIR!\.git\index.lock" >nul 2>&1
    )

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
        REM ff-only fails when local main has commits ahead of origin -- the
        REM classic divergence pattern is unpushed TesterLogs commits stacked
        REM up from a prior failed postexit push. Try rebase fallback so the
        REM next postexit can push the accumulated stack. autostash protects
        REM unrelated working-tree edits. If THIS also fails (real conflict
        REM with origin), abort cleanly and continue with the existing tree.
        echo [prism_prelaunch] ff-only failed; trying rebase fallback to absorb upstream...
        git -C "!INSTANCE_DIR!" pull --rebase --autostash
        if errorlevel 1 (
            echo [prism_prelaunch] WARNING: rebase fallback also failed -- aborting.
            git -C "!INSTANCE_DIR!" rebase --abort >nul 2>&1
            echo [prism_prelaunch] Continuing with current working tree.
            echo [prism_prelaunch] If logs keep failing to mirror, check:
            echo [prism_prelaunch]   cd /d "!INSTANCE_DIR!" ^&^& git status
        ) else (
            echo [prism_prelaunch] rebase fallback succeeded; tree is now aligned with origin
        )
    )
    REM Re-execute the bat. cmd.exe re-opens the file from disk, so any
    REM pull-applied update to THIS bat takes effect right now.
    REM
    REM Force exit /b 0: PrismLauncher aborts the launch if the pre-launch
    REM command returns non-zero, and a sync/pull hiccup must never block
    REM play. Phase 2 already surfaces any problems via echo'd warnings, so
    REM discarding its exit code hides nothing from the operator. (The old
    REM bare `exit /b` propagated Phase 2's code; pinning to 0 makes the
    REM "launch anyway" contract explicit and immune to future Phase-2 edits.)
    call "%~f0" --post-pull
    endlocal & exit /b 0
)

REM ===================================================================
REM Phase 2 -- post-pull hooks. Everything below runs from the bat
REM content as it exists on disk AFTER the pull. Adding new hooks
REM upstream takes effect immediately.
REM ===================================================================

:post_pull

REM ===================================================================
REM Instance hygiene -- sweep stale state left behind by an interrupted
REM prior run (PrismLauncher closed mid-sync, machine shut down during a
REM download, a killed postexit, etc.). All of these are safe to delete:
REM they're either staging/temp scratch or orphan markers that get
REM regenerated on demand. Each delete is `if exist`-guarded + 2>nul so a
REM missing file never spams the log or trips errorlevel. Hygiene failures
REM are non-fatal by construction; we never block launch on cleanup.
REM ===================================================================
echo [prism_prelaunch] instance hygiene -- sweeping stale state...

REM (a) Orphaned self-update staging files. sync_client.bat downloads
REM launcher-script updates as "<name>.new" and renames them into place on
REM the NEXT launch. If that finalize step never ran (crash between stage
REM and swap), the .new files linger forever. They're stale the moment a
REM real sync lands, so clear them here.
for %%F in (sync_client.ps1 sync_client.bat download_mods.ps1 cleanup_stale_jars.ps1) do (
    if exist "!MC_DIR!\%%F.new" (
        echo [prism_prelaunch]   removing orphan staging file %%F.new
        del /f /q "!MC_DIR!\%%F.new" >nul 2>&1
    )
)

REM (b) Orphan username temp marker from a killed prism_postexit.bat. It
REM writes .icraft_user.tmp, reads it back, then deletes it -- a postexit
REM killed in that window leaves it behind. Harmless but tidy to remove.
if exist "!MC_DIR!\.icraft_user.tmp" (
    echo [prism_prelaunch]   removing orphan .icraft_user.tmp
    del /f /q "!MC_DIR!\.icraft_user.tmp" >nul 2>&1
)

REM (c) Partial zip-overlay downloads from sync_client.ps1. It extracts the
REM repo archive under %TEMP%; on a clean run it removes both, but a process
REM killed mid-download/extract leaves a truncated zip and/or a half-written
REM extract tree that the next overlay must Expand-Archive over. Clear them
REM so the next zip-path sync starts from a clean slate.
if exist "%TEMP%\IridescentCraft-client-sync.zip" (
    echo [prism_prelaunch]   removing partial sync zip in TEMP
    del /f /q "%TEMP%\IridescentCraft-client-sync.zip" >nul 2>&1
)
if exist "%TEMP%\IridescentCraft-client-sync-extract" (
    echo [prism_prelaunch]   removing partial sync extract dir in TEMP
    rd /s /q "%TEMP%\IridescentCraft-client-sync-extract" >nul 2>&1
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
