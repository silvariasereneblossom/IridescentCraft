@echo off
setlocal enabledelayedexpansion
REM ============================================================================
REM IridescentCraft - Rebuild icraft.exe (CLI), deploy to repo, commit + push.
REM
REM Sibling of rebuild_gui.bat. Same flow, target is the headless CLI
REM binary (used by NSSM service installs, scheduled tasks, and operators
REM who SSH to the server box).
REM
REM Steps:
REM   1. cargo build -p icraft-cli --release
REM   2. copy target\release\icraft.exe into
REM      .minecraft\server_distribution\icraft.exe
REM   3. git add + commit + push from the repo root
REM
REM No --relaunch flag (unlike rebuild_gui.bat). icraft.exe is a one-shot
REM CLI invoked from a console -- there's nothing to "relaunch into" after
REM a build the way there is for the persistent GUI window.
REM
REM Note on file locks: if `icraft.exe serve` is actively running while
REM you run this bat (a server is up), Windows will block the copy step.
REM Stop the server first.
REM
REM Run interactively (pauses at end on success and on any error so the
REM operator can read messages before the cmd window closes).
REM ============================================================================

cd /d "%~dp0"

echo.
echo [rebuild_cli] cargo build -p icraft-cli --release
echo.
cargo build -p icraft-cli --release
if errorlevel 1 (
    echo.
    echo [rebuild_cli] ERROR: cargo build failed. See output above.
    pause
    exit /b 1
)

REM Cargo's actual target dir may differ from .\target if the user has
REM CARGO_TARGET_DIR set, [build] target-dir in ~\.cargo\config.toml,
REM or a default target triple (which adds a triple subdir like
REM target\x86_64-pc-windows-msvc\release). Ask cargo where things
REM actually went via `cargo metadata`, then dir-walk to find the
REM freshest icraft.exe under that root.
echo.
echo [rebuild_cli] Locating built binary via cargo metadata...
set "TARGET_DIR=target"
powershell -NoProfile -Command "(cargo metadata --format-version=1 --no-deps | ConvertFrom-Json).target_directory" > "%TEMP%\icraft_target.txt" 2>nul
if not errorlevel 1 (
    set /p TARGET_DIR=<"%TEMP%\icraft_target.txt"
)
del "%TEMP%\icraft_target.txt" 2>nul

REM Match icraft.exe specifically (not icraft-gui.exe). dir /s /b /o-d
REM lists newest first, but we still filter by exact name to be safe.
set "BUILT_EXE="
for /f "delims=" %%E in ('dir /s /b /o-d "!TARGET_DIR!\icraft.exe" 2^>nul') do (
    if not defined BUILT_EXE set "BUILT_EXE=%%E"
)
if not defined BUILT_EXE (
    echo.
    echo [rebuild_cli] ERROR: could not locate icraft.exe under !TARGET_DIR!.
    echo [rebuild_cli]        cargo reported success but the binary isn't on disk.
    pause
    exit /b 1
)

REM Destination assumes iridescent-launcher\ is a sibling of .minecraft\
REM inside the full IridescentCraft repo. Set ICRAFT_REPO_ROOT to override
REM (e.g. when running from a standalone iridescent-launcher checkout).
if defined ICRAFT_REPO_ROOT (
    set "DEST_DIR=%ICRAFT_REPO_ROOT%\.minecraft\server_distribution"
) else (
    set "DEST_DIR=%~dp0..\.minecraft\server_distribution"
)
set "DEST=!DEST_DIR!\icraft.exe"

if not exist "!DEST_DIR!" (
    echo.
    echo [rebuild_cli] ERROR: deploy directory does not exist:
    echo [rebuild_cli]   !DEST_DIR!
    echo.
    echo [rebuild_cli] This bat assumes iridescent-launcher\ sits inside the
    echo [rebuild_cli] full IridescentCraft repo (sibling of .minecraft\). If
    echo [rebuild_cli] you cloned only the launcher folder standalone, set
    echo [rebuild_cli] ICRAFT_REPO_ROOT to your IridescentCraft repo root, e.g.:
    echo [rebuild_cli]   set ICRAFT_REPO_ROOT=C:\path\to\IridescentCraft
    echo [rebuild_cli]   rebuild_cli.bat
    pause
    exit /b 1
)

echo [rebuild_cli] Found:    !BUILT_EXE!
echo [rebuild_cli] Deploying to !DEST!
copy /Y "!BUILT_EXE!" "!DEST!" >nul
if errorlevel 1 (
    echo [rebuild_cli] ERROR: copy failed. Is icraft.exe running ^(server up^)?
    echo [rebuild_cli]        Stop the server and re-run this bat.
    pause
    exit /b 1
)

REM Stage + commit + push from the repo root.
if defined ICRAFT_REPO_ROOT (
    cd /d "%ICRAFT_REPO_ROOT%"
) else (
    cd /d "%~dp0.."
)

where git >nul 2>&1
if errorlevel 1 (
    echo [rebuild_cli] ERROR: git not on PATH. Install Git for Windows or
    echo [rebuild_cli]        commit + push manually from GitHub Desktop.
    pause
    exit /b 1
)

git add ".minecraft/server_distribution/icraft.exe"
git diff --cached --quiet
if errorlevel 1 (
    git commit -m "icraft: rebuild"
    if errorlevel 1 (
        echo.
        echo [rebuild_cli] ERROR: git commit failed.
        pause
        exit /b 1
    )
    git push
    if errorlevel 1 (
        echo.
        echo [rebuild_cli] ERROR: git push failed. Fix auth ^(GitHub Desktop
        echo [rebuild_cli]        credential helper, or set ICRAFT_GH_TOKEN^) and
        echo [rebuild_cli]        retry `git push` manually -- the commit is local.
        pause
        exit /b 1
    )
    echo.
    echo [rebuild_cli] Done. New icraft.exe committed + pushed.
    echo [rebuild_cli] Other server boxes pick it up on next sync as
    echo [rebuild_cli] icraft.exe.new; the existing self-update flow
    echo [rebuild_cli] (icraft serve runs apply_staged on next launch)
    echo [rebuild_cli] swaps it in.
) else (
    echo.
    echo [rebuild_cli] No changes to commit -- exe is byte-identical to the
    echo [rebuild_cli] copy already in the repo. Nothing to push.
)

echo.
pause
exit /b 0
