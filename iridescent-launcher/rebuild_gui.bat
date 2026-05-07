@echo off
setlocal enabledelayedexpansion
REM ============================================================================
REM IridescentCraft - Build icraft-gui.exe.
REM
REM DEFAULT MODE: just build, print the path, exit. Move the binary into
REM your server's .minecraft\server_distribution\ folder yourself. This is
REM the right choice when iterating locally on a standalone iridescent-
REM launcher checkout, or when the deploy target lives somewhere unusual.
REM
REM --push        After build, also copy the binary into
REM               <repo>\.minecraft\server_distribution\, then git add +
REM               commit + push from the repo root. Use when the launcher
REM               folder lives inside the full IridescentCraft repo (or
REM               when ICRAFT_REPO_ROOT points at one).
REM
REM --relaunch    Implies --push, and additionally re-spawns the deployed
REM               icraft-gui.exe at the end. Used by the in-app
REM               "Rebuild + Push GUI" button: GUI exits to release its
REM               file lock, bat does the work, bat brings GUI back up.
REM
REM Override deploy target via env var:
REM   set ICRAFT_REPO_ROOT=C:\path\to\IridescentCraft
REM (only needed for --push / --relaunch when the launcher is not a
REM sibling of .minecraft\ inside the same repo).
REM ============================================================================

set "PUSH=0"
set "RELAUNCH=0"
:parse_args
if "%~1"=="" goto args_done
if /i "%~1"=="--push" set "PUSH=1"
if /i "%~1"=="--relaunch" ( set "PUSH=1" & set "RELAUNCH=1" )
shift
goto parse_args
:args_done

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
REM or a default target triple (which adds a triple subdir). Ask cargo
REM where things actually went via `cargo metadata`.
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

if "%PUSH%"=="0" (
    echo.
    echo [rebuild_gui] Build done. Binary at:
    echo [rebuild_gui]   !BUILT_EXE!
    echo.
    echo [rebuild_gui] Copy it manually into your server's
    echo [rebuild_gui]   .minecraft\server_distribution\icraft-gui.exe
    echo.
    echo [rebuild_gui] Pass --push to deploy + commit + push automatically.
    echo.
    pause
    exit /b 0
)

REM ----- --push / --relaunch path -----

if defined ICRAFT_REPO_ROOT (
    set "DEST_DIR=%ICRAFT_REPO_ROOT%\.minecraft\server_distribution"
) else (
    set "DEST_DIR=%~dp0..\.minecraft\server_distribution"
)
set "DEST=!DEST_DIR!\icraft-gui.exe"

if not exist "!DEST_DIR!" (
    echo.
    echo [rebuild_gui] ERROR: deploy directory does not exist:
    echo [rebuild_gui]   !DEST_DIR!
    echo.
    echo [rebuild_gui] Set ICRAFT_REPO_ROOT to your IridescentCraft repo root, e.g.:
    echo [rebuild_gui]   set ICRAFT_REPO_ROOT=C:\path\to\IridescentCraft
    echo [rebuild_gui]   rebuild_gui.bat --push
    pause
    exit /b 1
)

echo.
echo [rebuild_gui] Found:    !BUILT_EXE!
echo [rebuild_gui] Deploying to !DEST!
copy /Y "!BUILT_EXE!" "!DEST!" >nul
if errorlevel 1 (
    echo [rebuild_gui] ERROR: copy failed (target may be locked by a running
    echo [rebuild_gui]        icraft-gui.exe; close it and re-run).
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
    if exist "!DEST!" (
        REM `start "" "<exe>"` -- empty title arg, then the exe path,
        REM detaches the new process from this cmd window.
        start "" "!DEST!"
        exit /b 0
    ) else (
        echo [rebuild_gui] WARN: could not find !DEST!; not relaunching.
    )
)

echo.
pause
exit /b 0
