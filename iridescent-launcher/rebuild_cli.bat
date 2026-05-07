@echo off
setlocal enabledelayedexpansion
REM ============================================================================
REM IridescentCraft - Build icraft.exe (CLI). Sibling of rebuild_gui.bat.
REM
REM DEFAULT MODE: just build, print the path, exit. Move the binary into
REM your server's .minecraft\server_distribution\ folder yourself.
REM
REM --push        After build, copy the binary into
REM               <repo>\.minecraft\server_distribution\, then git add +
REM               commit + push from the repo root.
REM
REM Override deploy target via env var:
REM   set ICRAFT_REPO_ROOT=C:\path\to\IridescentCraft
REM
REM No --relaunch flag (unlike rebuild_gui.bat). icraft.exe is a one-shot
REM CLI -- nothing to relaunch into after a build.
REM
REM Note on file locks: if `icraft.exe serve` is actively running while
REM you run this bat, Windows will block the copy step. Stop the server.
REM ============================================================================

set "PUSH=0"
:parse_args
if "%~1"=="" goto args_done
if /i "%~1"=="--push" set "PUSH=1"
shift
goto parse_args
:args_done

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

echo.
echo [rebuild_cli] Locating built binary via cargo metadata...
set "TARGET_DIR=target"
powershell -NoProfile -Command "(cargo metadata --format-version=1 --no-deps | ConvertFrom-Json).target_directory" > "%TEMP%\icraft_target.txt" 2>nul
if not errorlevel 1 (
    set /p TARGET_DIR=<"%TEMP%\icraft_target.txt"
)
del "%TEMP%\icraft_target.txt" 2>nul

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

if "%PUSH%"=="0" (
    echo.
    echo [rebuild_cli] Build done. Binary at:
    echo [rebuild_cli]   !BUILT_EXE!
    echo.
    echo [rebuild_cli] Copy it manually into your server's
    echo [rebuild_cli]   .minecraft\server_distribution\icraft.exe
    echo.
    echo [rebuild_cli] Pass --push to deploy + commit + push automatically.
    echo.
    pause
    exit /b 0
)

REM ----- --push path -----

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
    echo [rebuild_cli] Set ICRAFT_REPO_ROOT to your IridescentCraft repo root, e.g.:
    echo [rebuild_cli]   set ICRAFT_REPO_ROOT=C:\path\to\IridescentCraft
    echo [rebuild_cli]   rebuild_cli.bat --push
    pause
    exit /b 1
)

echo.
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
) else (
    echo.
    echo [rebuild_cli] No changes to commit -- exe is byte-identical to the
    echo [rebuild_cli] copy already in the repo. Nothing to push.
)

echo.
pause
exit /b 0
