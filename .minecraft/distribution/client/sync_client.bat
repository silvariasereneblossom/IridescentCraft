@echo off
REM IridescentCraft Client Sync — PrismLauncher pre-launch hook
REM
REM This bat is a thin wrapper around sync_client.ps1 for users who prefer
REM a .bat pre-launch command. You can point PrismLauncher directly at the
REM .ps1 instead, but the .bat is PREFERRED because it ALSO finalizes any
REM <script>.new files staged during the previous sync — PowerShell can't
REM safely overwrite the .ps1 it's currently running, so we stage updates
REM and rename here on the NEXT launch.
REM
REM PrismLauncher pre-launch command (using this bat):
REM   "%INST_MC_DIR%\sync_client.bat"
REM
REM Or directly (using PowerShell, no self-update finalization):
REM   powershell -ExecutionPolicy Bypass -File "%INST_MC_DIR%\sync_client.ps1"
REM
REM -Force: delete .icraft_last_sha so the next sync does a full-zip
REM download. Use after a drift is detected:
REM   sync_client.bat -Force

setlocal enabledelayedexpansion
set "SCRIPT_DIR=%~dp0"
if "%SCRIPT_DIR:~-1%"=="\" set "SCRIPT_DIR=%SCRIPT_DIR:~0,-1%"

REM ── Phase 0: finalize any staged <name>.new files from previous sync ──
REM Mirrors server-side iridescentserver.bat lines 100-145. Self-update
REM staging exists because PowerShell holds an exclusive read-handle on
REM .ps1 files while they execute, and Windows file-locks block
REM overwriting them mid-script. By staging downloads as .new and
REM finalizing here BEFORE invoking the .ps1, we sidestep the lock.
REM
REM Quirk: this .bat itself can be staged as sync_client.bat.new, in
REM which case the running shell is reading the OLD bat. We move-replace
REM it anyway and the new content takes effect on the *next* invocation —
REM not the current one. Acceptable: at most one launch's lag for bat
REM updates.
for %%F in (sync_client.ps1 sync_client.bat download_mods.ps1 cleanup_stale_jars.ps1) do (
    if exist "%SCRIPT_DIR%\%%F.new" (
        echo   [STAGE] Applying staged update: %%F
        move /y "%SCRIPT_DIR%\%%F.new" "%SCRIPT_DIR%\%%F" >nul
        if errorlevel 1 (
            echo   [STAGE] ERROR: move failed for %%F. File may be locked or in use.
        ) else (
            echo   [STAGE] Swap OK: %%F
        )
    )
)

set "FORCE_ARG="
if /i "%1"=="-Force"  set "FORCE_ARG=-Force"
if /i "%1"=="--force" set "FORCE_ARG=-Force"
if /i "%1"=="/force"  set "FORCE_ARG=-Force"

powershell -ExecutionPolicy Bypass -File "%SCRIPT_DIR%\sync_client.ps1" %FORCE_ARG%

REM Stale-JAR cleanup (safety net — mirrors server's iridescentserver.bat).
REM sync_client.ps1 ALSO invokes cleanup_stale_jars.ps1 internally at step 4a,
REM but if that script bails early (network error during overlay, stale local
REM copy missing the inner call, etc.) the cleanup never runs and removed
REM packwiz mods (ScalingMobs, ImprovedMobs, AzukaarsFairDifficulty) linger as
REM orphan jars in the user's mods folder. This explicit invocation is the
REM same safety net the server has had since 2026-04-something.
REM cleanup_stale_jars.ps1 is idempotent (only removes jars not in .pw.toml or
REM custom-allowlist), so being called twice in one launch is harmless.
if not exist "%SCRIPT_DIR%\cleanup_stale_jars.ps1" (
    echo   [SETUP] Downloading cleanup script...
    powershell -ExecutionPolicy Bypass -Command ^
        "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12;" ^
        "try { Invoke-WebRequest -Uri 'https://raw.githubusercontent.com/silvariasereneblossom/IridescentCraft/main/.minecraft/distribution/client/cleanup_stale_jars.ps1' -OutFile '%SCRIPT_DIR%\cleanup_stale_jars.ps1' -UseBasicParsing -TimeoutSec 30 } catch {}"
)
if exist "%SCRIPT_DIR%\cleanup_stale_jars.ps1" (
    echo [CLEANUP] Removing stale mod JARs...
    powershell -ExecutionPolicy Bypass -File "%SCRIPT_DIR%\cleanup_stale_jars.ps1" -ModsDir "%SCRIPT_DIR%\mods" -IndexDir "%SCRIPT_DIR%\mods\.index"
) else (
    echo   [WARN] cleanup_stale_jars.ps1 not found, skipping cleanup.
)

exit /b 0
