@echo off
setlocal enabledelayedexpansion
REM ============================================================================
REM IridescentCraft - Rebuild icraft-gui.exe, deploy to repo, commit + push.
REM
REM Run this on the Windows build host (the only place the GUI compiles --
REM eframe + wayland/x11 deps don't cross-compile cleanly from Linux per
REM iridescent-launcher\BUILD.md).
REM
REM Steps:
REM   1. cargo build -p icraft-gui --release
REM   2. copy target\release\icraft-gui.exe into
REM      .minecraft\server_distribution\icraft-gui.exe
REM   3. git add + commit + push from the repo root
REM
REM This is the bootstrap step. After the new exe is on the repo, future GUI
REM updates can ship via the in-app "Update Launcher" button -- the GitHub
REM diff sync stages icraft-gui.exe.new and apply_and_relaunch_gui swaps it
REM in. So once-per-build-host manual run, then self-propagating.
REM
REM Run interactively (pauses at end on success and on any error so the
REM operator can read messages before the cmd window closes).
REM
REM Flags:
REM   --relaunch   After a successful push, re-spawn the deployed
REM                icraft-gui.exe. Used by the in-app "Rebuild + Push
REM                GUI" button: GUI exits to release its file lock,
REM                bat does the work, bat brings GUI back up.
REM ============================================================================

set "RELAUNCH=0"
if /i "%1"=="--relaunch" set "RELAUNCH=1"

cd /d "%~dp0"

echo.
echo [rebuild_gui] cargo build -p icraft-gui --release
echo.
cargo build -p icraft-gui --release
if errorlevel 1 (
    echo.
    echo [rebuild_gui] ERROR: cargo build failed. See output above.
    pause
    exit /b 1
)

REM Cargo's actual target dir may differ from .\target if the user has
REM CARGO_TARGET_DIR set, [build] target-dir in ~\.cargo\config.toml,
REM or a default target triple (which adds a triple subdir like
REM target\x86_64-pc-windows-msvc\release). Ask cargo where things
REM actually went via `cargo metadata`, then dir-walk to find the
REM freshest icraft-gui.exe under that root.
echo.
echo [rebuild_gui] Locating built binary via cargo metadata...
set "TARGET_DIR=target"
powershell -NoProfile -Command "(cargo metadata --format-version=1 --no-deps | ConvertFrom-Json).target_directory" > "%TEMP%\icraft_target.txt" 2>nul
if not errorlevel 1 (
    set /p TARGET_DIR=<"%TEMP%\icraft_target.txt"
)
del "%TEMP%\icraft_target.txt" 2>nul

set "BUILT_EXE="
for /f "delims=" %%E in ('dir /s /b /o-d "!TARGET_DIR!\icraft-gui.exe" 2^>nul') do (
    if not defined BUILT_EXE set "BUILT_EXE=%%E"
)
if not defined BUILT_EXE (
    echo.
    echo [rebuild_gui] ERROR: could not locate icraft-gui.exe under !TARGET_DIR!.
    echo [rebuild_gui]        cargo reported "Finished" but the binary isn't on disk.
    pause
    exit /b 1
)

set "DEST=..\.minecraft\server_distribution\icraft-gui.exe"
echo [rebuild_gui] Found:    !BUILT_EXE!
echo [rebuild_gui] Deploying to %DEST%
copy /Y "!BUILT_EXE!" "%DEST%" >nul
if errorlevel 1 (
    echo [rebuild_gui] ERROR: copy failed.
    pause
    exit /b 1
)

REM Stage + commit + push from the repo root.
cd /d "%~dp0.."

where git >nul 2>&1
if errorlevel 1 (
    echo [rebuild_gui] ERROR: git not on PATH. Install Git for Windows or
    echo [rebuild_gui]        commit + push manually from GitHub Desktop.
    pause
    exit /b 1
)

git add ".minecraft/server_distribution/icraft-gui.exe"
git diff --cached --quiet
if errorlevel 1 (
    git commit -m "icraft-gui: rebuild"
    if errorlevel 1 (
        echo.
        echo [rebuild_gui] ERROR: git commit failed.
        pause
        exit /b 1
    )
    git push
    if errorlevel 1 (
        echo.
        echo [rebuild_gui] ERROR: git push failed. Fix auth ^(GitHub Desktop
        echo [rebuild_gui]        credential helper, or set ICRAFT_GH_TOKEN^) and
        echo [rebuild_gui]        retry `git push` manually -- the commit is local.
        pause
        exit /b 1
    )
    echo.
    echo [rebuild_gui] Done. New icraft-gui.exe committed + pushed.
    echo [rebuild_gui] Other server boxes will pick it up on their next sync as
    echo [rebuild_gui] icraft-gui.exe.new; operators click "Update Launcher" in
    echo [rebuild_gui] the running GUI to apply.
) else (
    echo.
    echo [rebuild_gui] No changes to commit -- exe is byte-identical to the
    echo [rebuild_gui] copy already in the repo. Nothing to push.
)

if "%RELAUNCH%"=="1" (
    echo.
    echo [rebuild_gui] Relaunching icraft-gui.exe...
    set "GUI_EXE=%~dp0..\.minecraft\server_distribution\icraft-gui.exe"
    if exist "!GUI_EXE!" (
        REM `start "" "<exe>"` -- empty title arg, then the exe path,
        REM detaches the new process from this cmd window.
        start "" "!GUI_EXE!"
        exit /b 0
    ) else (
        echo [rebuild_gui] WARN: could not find !GUI_EXE!; not relaunching.
    )
)

echo.
pause
exit /b 0
