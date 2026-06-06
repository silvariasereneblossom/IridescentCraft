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
REM   Phase 1 (top of file): FORCE-SYNC only (git fetch + reset --hard
REM     origin/main -- NOT git pull; see the rationale block below). Then
REM     `call SELF --post-pull` and exit. cmd.exe re-opens the bat on every
REM     `call`, so the inner invocation reads whatever bat content is on disk
REM     after the sync. This means an update to this bat itself takes effect
REM     on the SAME launch, not the next one (subject to NTFS +
REM     FILE_SHARE_DELETE semantics for the in-place replacement, which Git
REM     for Windows and cmd.exe both honour).
REM
REM   Phase 2 (after :post_pull label): reconcile index + cleanup +
REM     download_mods + wire.
REM     These run from the just-synced bat content -- new hooks, new
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
set "SENTINEL=!MC_DIR!\.icraft_sync_status.json"

REM H1: never let a missing credential hang the launch on a TTY-less prompt.
REM With GIT_TERMINAL_PROMPT=0 an auth failure on a private repo fails FAST
REM (errorlevel 1, caught below) instead of blocking forever waiting for input
REM that can never arrive in the pre-launch context. No effect when auth works.
set "GIT_TERMINAL_PROMPT=0"

REM --- Phase 1: force-sync, then re-exec into Phase 2 ---
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
        echo [prism_prelaunch] Skipping git force-sync; continuing with existing files.
        call "%~f0" --post-pull
        endlocal & exit /b 0
    )

    REM H2/F2: git itself must be on PATH for any of the calls below to work.
    REM A fresh Windows box with git installed user-only (or Prism started
    REM before the post-install PATH refresh) has no git for the launch process;
    REM every git call would "fail open" and launch stale with no signal. Probe
    REM once, record git-missing in the sentinel, and skip the git phase.
    git --version >nul 2>&1
    if errorlevel 1 (
        echo [prism_prelaunch] WARNING: git not found on PATH -- cannot sync.
        echo [prism_prelaunch] Tell Silvaria: install Git for Windows ^(machine-wide^) and restart PrismLauncher.
        call :write_fail git-missing 0
        call "%~f0" --post-pull
        endlocal & exit /b 0
    )

    REM Clear a stale .git\index.lock left by a git operation that was killed
    REM mid-run (e.g. PrismLauncher / the machine shut down during a prior
    REM sync). Git refuses EVERY subsequent operation while index.lock exists,
    REM so without this the fetch/reset below fails on every launch until the
    REM user manually deletes it. We only remove the bare index.lock (cheap,
    REM safe to recreate); any in-progress merge state is discarded by the
    REM `reset --hard origin/main` below.
    if exist "!INSTANCE_DIR!\.git\index.lock" (
        echo [prism_prelaunch] WARNING: stale .git\index.lock found -- removing it.
        echo [prism_prelaunch] ^(A prior git operation was likely interrupted.^)
        del /f /q "!INSTANCE_DIR!\.git\index.lock" >nul 2>&1
    )

    REM ----------------------------------------------------------------------
    REM FORCE-SYNC to origin/main -- NOT `git pull`.
    REM
    REM This instance is a PURE CONSUMER of pushed origin/main. A plain
    REM `git pull --ff-only` dies on ANY local divergence and then leaves the
    REM tree SILENTLY STALE -- which is exactly how this instance drifted 120
    REM commits behind: a stray local commit (402c9625) made every ff-only
    REM pull fail, the rebase --autostash fallback couldn't absorb it either,
    REM so the working tree froze at an old HEAD for weeks while every launch
    REM cheerfully reported "continuing." A stale tree keeps mods origin has
    REM since REMOVED: a dropped both-sides mod (Marium's Soulslike) stayed
    REM installed -> client/server registry mismatch (soulsweapons:ghostly
    REM "Registry Object not present") -> NPE -> DC on join. (Same pull-stale
    REM class as task #43, which recurred precisely because `pull` can stick.)
    REM
    REM `git fetch` + `git reset --hard origin/main` can NEVER get stuck: it
    REM unconditionally DISCARDS local commits and tracked-file edits and
    REM mirrors pushed HEAD every launch. The player's worlds are SAFE --
    REM saves/, logs/, configs and other runtime state are git-ignored or
    REM untracked, and `reset --hard` only rewrites TRACKED files. A
    REM removed-in-origin tracked file (a dropped mod's .pw.toml) is deleted
    REM from the working tree by the reset -- exactly what we want. Untracked
    REM leftovers (e.g. an overlaid stale .pw.toml) survive the reset and are
    REM purged by the Phase 2 index reconcile + cleanup pass.
    echo [prism_prelaunch] git fetch origin...
    git -C "!INSTANCE_DIR!" fetch origin --prune
    if errorlevel 1 (
        echo [prism_prelaunch] WARNING: git fetch failed ^(offline/auth?^) -- continuing with current tree.
        echo [prism_prelaunch] If this persists, pushes are NOT arriving. Tell Silvaria.
        REM F2: fetch failed -> record a fail sentinel so the next in-game login
        REM (and the diagnostic) can SEE that this launch did not update. We do
        REM not know the true behind-count when fetch fails, so report 0.
        call :write_fail fetch-failed 0
    ) else (
        REM How far is the local tree behind pushed HEAD, as of this fetch?
        REM Done in a subroutine (not inline) to keep this if/else from nesting
        REM a third level of parens + set /p redirection, which is fragile.
        call :get_behind
        echo [prism_prelaunch] behind origin/main by !BEHIND! commit^(s^) before sync.
        echo [prism_prelaunch] force-sync: reset --hard origin/main ^(discard local divergence^)...
        git -C "!INSTANCE_DIR!" reset --hard origin/main
        if errorlevel 1 (
            echo [prism_prelaunch] WARNING: reset --hard failed -- continuing with current tree.
            echo [prism_prelaunch] Pushes are NOT arriving. Tell Silvaria.
            REM F2: fetch worked but reset failed -> still behind by BEHIND.
            call :write_fail behind !BEHIND!
        ) else (
            echo [prism_prelaunch] instance now mirrors origin/main.
            REM F2: success -> clear any stale fail sentinel from a prior launch.
            call :write_ok !BEHIND!
        )
    )
    REM Re-execute the bat. cmd.exe re-opens the file from disk, so any
    REM sync-applied update to THIS bat takes effect right now.
    REM
    REM Force exit /b 0: PrismLauncher aborts the launch if the pre-launch
    REM command returns non-zero, and a sync hiccup must never block
    REM play. Phase 2 already surfaces any problems via echo'd warnings, so
    REM discarding its exit code hides nothing from the operator. (The old
    REM bare `exit /b` propagated Phase 2's code; pinning to 0 makes the
    REM "launch anyway" contract explicit and immune to future Phase-2 edits.)
    call "%~f0" --post-pull
    endlocal & exit /b 0
)

REM ===================================================================
REM Phase 2 -- post-sync hooks. Everything below runs from the bat
REM content as it exists on disk AFTER the force-sync. Adding new hooks
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

REM Reconcile mods\.index against the canonical sources BEFORE cleanup, so a
REM .pw.toml that origin removed cannot survive as an untracked leftover and
REM fool cleanup_stale_jars into KEEPING the removed jar (cleanup builds its
REM "expected" set from mods\.index\*.pw.toml). `reset --hard` already fixed
REM the TRACKED index; this purges UNTRACKED stale tomls while preserving the
REM client-only overlay (fancymenu/konkrete/melody/fastback -- present only in
REM distribution\client\mods\.index, never in origin's main index).
echo [prism_prelaunch] reconcile mods\.index ^(origin main + client-only overlay^)...
if exist "!MC_DIR!\distribution\client\reconcile_client_index.ps1" (
    powershell -ExecutionPolicy Bypass -File "!MC_DIR!\distribution\client\reconcile_client_index.ps1" -McDir "!MC_DIR!" -InstanceDir "!INSTANCE_DIR!"
) else (
    echo [prism_prelaunch] reconcile_client_index.ps1 not found at distribution/client/, skipping
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

REM ===================================================================
REM Sentinel writers (H2/F2). Reached ONLY via `call :write_fail` /
REM `call :write_ok` from Phase 1; the `exit /b 0` above guarantees we
REM never fall through into them. `call :label` does NOT start a new
REM scope, so the enclosing setlocal/enabledelayedexpansion is still in
REM effect and !SENTINEL! resolves. We deliberately do NOT use a nested
REM setlocal here (nested-setlocal-in-if is a known cmd trap).
REM
REM The sentinel is a one-line JSON object the in-game/diagnostic layer
REM reads. JSON needs { } " : -- all literal-safe in cmd echo. We keep
REM the line free of > < | & ^ % so no escaping/redirection trap fires.
REM Args:  %1 = reason (fetch-failed|behind|git-missing)   %2 = behind count
REM ===================================================================
REM Sets BEHIND to the commit count HEAD..origin/main (0 on any uncertainty).
REM Captured via a temp file rather than `for /f` to dodge for-loop quoting
REM traps; the count is a bare integer so no special-char handling is needed.
:get_behind
set "BEHIND=0"
git -C "!INSTANCE_DIR!" rev-list --count HEAD..origin/main > "!MC_DIR!\.icraft_behind.tmp" 2>nul
if exist "!MC_DIR!\.icraft_behind.tmp" set /p BEHIND=<"!MC_DIR!\.icraft_behind.tmp"
del /f /q "!MC_DIR!\.icraft_behind.tmp" >nul 2>&1
if "!BEHIND!"=="" set "BEHIND=0"
exit /b 0

:write_fail
set "TS=!DATE! !TIME!"
set "FBEHIND=%~2"
if "!FBEHIND!"=="" set "FBEHIND=0"
REM Redirection FIRST (>"file" echo ...) so no trailing char before > can be
REM mis-parsed as a stream number (the classic `...1>` redirection trap).
>"!SENTINEL!" echo {"ok":false,"reason":"%~1","behind":!FBEHIND!,"ts":"!TS!"}
exit /b 0

REM Arg:  %1 = behind count (the value seen before the successful reset)
:write_ok
set "TS=!DATE! !TIME!"
set "OKBEHIND=%~1"
if "!OKBEHIND!"=="" set "OKBEHIND=0"
>"!SENTINEL!" echo {"ok":true,"reason":"","behind":!OKBEHIND!,"ts":"!TS!"}
exit /b 0
