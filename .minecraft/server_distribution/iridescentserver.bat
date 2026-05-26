@echo off
REM IridescentCraft Server - Unified Installer + Launcher (Windows)
REM Forge 1.20.1-47.4.6 with 420+ mods
REM
REM First run:  Installs Forge, downloads mods, then starts the server
REM Later runs: Skips install (mods already present), starts the server
REM
REM Requirements:
REM   - Java 17 (e.g., Adoptium/Temurin JDK 17)
REM   - 8-12 GB RAM available for the server

title IridescentCraft Server

REM One-click bootstrap: when the bat is run from a folder that doesn't
REM contain the install marker (.icraft_server), set up a clean subfolder
REM `IridescentCraft Dedicated Server\`, copy the bat there, and relaunch
REM from there. Marker check is on the *current* folder so the relaunched
REM instance (which lives inside the subfolder, with marker present) falls
REM through to the rest of the script instead of creating a nested folder.
REM
REM Single source of truth: .icraft_server. Earlier versions had a separate
REM "system folder detection" branch (Downloads/Desktop/etc.) with its check
REM pointed at the nested subfolder's marker, which caused infinite folder
REM nesting when the relaunched instance still saw \Downloads\ in its path.
setlocal enabledelayedexpansion
if not exist "%~dp0.icraft_server" (
    set "SERVER_DIR=%~dp0IridescentCraft Dedicated Server"
    if not exist "!SERVER_DIR!" mkdir "!SERVER_DIR!"
    copy /y "%~f0" "!SERVER_DIR!\iridescentserver.bat" >nul
    echo. > "!SERVER_DIR!\.icraft_server"
    echo [SETUP] Created server directory. Launching from there...
    start "" "!SERVER_DIR!\iridescentserver.bat"
    endlocal
    exit /b
)
endlocal

REM We're in the server dir - ensure working directory is correct
cd /d "%~dp0"

echo.
powershell -Command ^
  "Add-Type -MemberDefinition '[DllImport(\"kernel32.dll\")]public static extern bool SetConsoleMode(IntPtr h,int m);[DllImport(\"kernel32.dll\")]public static extern IntPtr GetStdHandle(int h);' -Name W -Namespace C;" ^
  "$h=[C.W]::GetStdHandle(-11);[C.W]::SetConsoleMode($h,7)|Out-Null;" ^
  "$B=\"$([char]27)[38;2;91;206;250m\";$P=\"$([char]27)[38;2;245;169;184m\";$W=\"$([char]27)[38;2;255;255;255m\";$R=\"$([char]27)[0m\";" ^
  "[Console]::Write(\"${B}  ==========================================${R}`n\");" ^
  "[Console]::Write(\"${P}  IridescentCraft Server${R}`n\");" ^
  "[Console]::Write(\"${W}  Forge 1.20.1-47.4.6  ~450 mods${R}`n\");" ^
  "[Console]::Write(\"${P}  Iridescent Edition${R}`n\");" ^
  "[Console]::Write(\"${B}  ==========================================${R}`n\")"
echo.

REM -------------------------------------------------------------------
REM Phase -1: Z:-mounted dev-PC mirror (preferred when reachable)
REM -------------------------------------------------------------------
REM sync_from_repo.bat copies the whole server_distribution/ tree from
REM Z: (dev PC's repo working tree). When Z: is mounted this is
REM faster + more reliable than phase0_sync's GitHub diff-API:
REM   - no GitHub API rate limits
REM   - no truncated-diff edge cases (>=300 changed files -> full zip)
REM   - sees uncommitted local edits the dev PC has on the working tree
REM Falls back internally to a GitHub zip download if Z: isn't mounted.
REM
REM Phase 0 (phase0_sync.ps1) still runs after as a finer diff-based
REM check; if this phase brought everything current, Phase 0 is a
REM no-op. If this phase silently failed, Phase 0 acts as the safety
REM net. Belt and suspenders.
if exist "%~dp0sync_from_repo.bat" (
    echo [SYNC] Phase -1: Z: / GitHub zip mirror...
    call "%~dp0sync_from_repo.bat"
    echo.
) else (
    echo [SYNC] Phase -1 skipped: sync_from_repo.bat not found.
    echo.
)

REM -------------------------------------------------------------------
REM Phase 0: Self-Update from GitHub (diff-based)
REM -------------------------------------------------------------------
REM Uses phase0_sync.ps1 for diff-based updates: compares commit SHAs,
REM then downloads ONLY the changed files via GitHub compare API +
REM raw.githubusercontent.com. Typical sync: 5-10 seconds for 3-10 files.
REM Falls back to full zip download on first run or when >=300 files changed.
REM
REM If phase0_sync.ps1 doesn't exist yet (first ever deploy), download it
REM from raw.githubusercontent.com before calling it.

REM -Force flag: delete the SHA marker to trigger a full re-sync. Use this
REM when the server state doesn't match the repo despite the marker saying
REM "up to date" (e.g., after a diff-sync missed files silently).
if /i "%1"=="-Force"     set "FORCE_SYNC=1"
if /i "%1"=="--force"    set "FORCE_SYNC=1"
if /i "%1"=="/force"     set "FORCE_SYNC=1"
if defined FORCE_SYNC (
    if exist "%~dp0.icraft_last_sha" (
        del /f /q "%~dp0.icraft_last_sha" >nul 2>&1
        echo [FORCE] Deleted .icraft_last_sha - next sync will download the full repo zip.
    ) else (
        echo [FORCE] No .icraft_last_sha present - already a full-sync run.
    )
    echo.
)

echo [UPDATE] Checking for updates from GitHub...

if not exist "%~dp0phase0_sync.ps1" (
    echo   [SETUP] Downloading sync script...
    powershell -ExecutionPolicy Bypass -Command ^
        "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12;" ^
        "try {" ^
        "  Invoke-WebRequest -Uri 'https://raw.githubusercontent.com/silvariasereneblossom/IridescentCraft/main/.minecraft/server_distribution/phase0_sync.ps1' -OutFile '%~dp0phase0_sync.ps1' -UseBasicParsing -TimeoutSec 30" ^
        "} catch {" ^
        "  Write-Host ('  [WARN] Could not download sync script: ' + $_.Exception.Message) -ForegroundColor Yellow" ^
        "}"
)

if exist "%~dp0phase0_sync.ps1" (
    powershell -ExecutionPolicy Bypass -File "%~dp0phase0_sync.ps1" -ServerDir "%~dp0"
) else (
    echo   [WARN] phase0_sync.ps1 not found. Skipping update check.
)
echo.

REM -------------------------------------------------------------------
REM Phase 0.5: Self-update swap (if Phase 0 staged a new bat)
REM -------------------------------------------------------------------
REM Phase 0 stages iridescentserver.bat.new when a new version is pulled.
REM Move-overwrites the running .bat (Win10+ supports FILE_SHARE_DELETE),
REM then exit /b lets cmd.exe release the handle so the relaunched cmd
REM reads the NEW content.
REM
REM Diagnostic-friendly: errors from move and start are NOT silenced -
REM if the swap fails, you'll see it in the console (helps catch perms
REM issues, file-lock conflicts, or path quoting problems).
set "SDIR=%~dp0"
if "%SDIR:~-1%"=="\" set "SDIR=%SDIR:~0,-1%"
set "NEED_RELAUNCH=0"
set "SWAP_ERROR=0"
for %%F in (iridescentserver.bat phase0_sync.ps1) do (
    if exist "%SDIR%\%%F.new" (
        echo   [STAGE] Applying staged update: %%F
        move /y "%SDIR%\%%F.new" "%SDIR%\%%F"
        if errorlevel 1 (
            echo   [STAGE] ERROR: move failed for %%F. File may be locked or in use.
            set "SWAP_ERROR=1"
        ) else (
            echo   [STAGE] Swap OK: %%F
            set "NEED_RELAUNCH=1"
        )
    )
)
if "%SWAP_ERROR%"=="1" (
    echo.
    echo [UPDATE] One or more staged updates FAILED to apply. Continuing with old version.
    echo [UPDATE] Re-run with: iridescentserver.bat -Force  to retry the full sync.
    echo.
)
REM Cross-platform counterpart cleanup - apply iridescentserver.sh.new
REM if phase0_sync staged it. The .sh isn't used on Windows but we keep it
REM up-to-date so testers who push from a Windows server-host don't ship
REM stale .sh content. No relaunch needed for .sh changes.
if exist "%SDIR%\iridescentserver.sh.new" (
    echo   [STAGE] Cleaning up cross-platform counterpart: iridescentserver.sh
    move /y "%SDIR%\iridescentserver.sh.new" "%SDIR%\iridescentserver.sh" >nul
)

if "%NEED_RELAUNCH%"=="1" (
    echo.
    echo [UPDATE] Self-update applied. Relaunching from "%SDIR%\iridescentserver.bat" ...
    echo.
    start "" "%SDIR%\iridescentserver.bat"
    if errorlevel 1 (
        echo [UPDATE] ERROR: start command failed. Run iridescentserver.bat manually.
        pause
    )
    exit /b 0
)

REM -------------------------------------------------------------------
REM Phase 1: Check Java
REM -------------------------------------------------------------------
java -version >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Java not found. Please install Java 17.
    echo Download from: https://adoptium.net/
    pause
    exit /b 1
)

REM -------------------------------------------------------------------
REM Phase 2: Install if needed (Forge + mods)
REM -------------------------------------------------------------------
if not exist "libraries\cpw\mods\bootstraplauncher" (
    echo [INSTALL] Forge not found - running first-time setup...
    echo.
    if not exist "forge-1.20.1-47.4.6-installer.jar" (
        echo [INSTALL] Downloading Forge installer...
        powershell -Command "Invoke-WebRequest -Uri 'https://maven.minecraftforge.net/net/minecraftforge/forge/1.20.1-47.4.6/forge-1.20.1-47.4.6-installer.jar' -OutFile 'forge-1.20.1-47.4.6-installer.jar' -UseBasicParsing"
        if not exist "forge-1.20.1-47.4.6-installer.jar" (
            echo ERROR: Failed to download Forge installer.
            pause
            exit /b 1
        )
        echo [INSTALL] Forge installer downloaded.
    )
    java -jar forge-1.20.1-47.4.6-installer.jar --installServer
    echo.
)

REM Download mods if .index exists and mods folder has fewer than 50 jars
setlocal enabledelayedexpansion
set NEED_MODS=0
if not exist "mods" set NEED_MODS=1
if exist "mods\.index" (
    set JAR_COUNT=0
    for %%F in (mods\*.jar) do set /a JAR_COUNT+=1
    if !JAR_COUNT! LSS 10 set NEED_MODS=1
)

if "!NEED_MODS!"=="1" if exist "mods\.index" (
    echo [INSTALL] Downloading mods via PowerShell...
    echo.
    powershell -Command ^
      "$null = Add-Type -MemberDefinition '[DllImport(\"kernel32.dll\")]public static extern IntPtr GetStdHandle(int n);[DllImport(\"kernel32.dll\")]public static extern bool GetConsoleMode(IntPtr h,out uint m);[DllImport(\"kernel32.dll\")]public static extern bool SetConsoleMode(IntPtr h,uint m);' -Name C -Namespace W -PassThru -EA SilentlyContinue;" ^
      "try{$h=[W.C]::GetStdHandle(-11);$m=0;[W.C]::GetConsoleMode($h,[ref]$m)|Out-Null;[W.C]::SetConsoleMode($h,$m -bor 4)|Out-Null}catch{};" ^
      "$e=[char]27;" ^
      "$blue=\"${e}[38;2;91;206;250m\";$pink=\"${e}[38;2;245;169;184m\";$white=\"${e}[38;2;255;255;255m\";$rs=\"${e}[0m\";" ^
      "[Console]::Write(\"${blue}  ==========================================${rs}\");[Console]::WriteLine();" ^
      "[Console]::Write(\"${pink}  IridescentCraft Server Installer${rs}\");[Console]::WriteLine();" ^
      "[Console]::Write(\"${white}  Forge 1.20.1-47.4.6${rs}\");[Console]::WriteLine();" ^
      "[Console]::Write(\"${pink}  Standalone Edition${rs}\");[Console]::WriteLine();" ^
      "[Console]::Write(\"${blue}  ==========================================${rs}\");[Console]::WriteLine()"
    echo.
    powershell -ExecutionPolicy Bypass -File "%~dp0server_install.ps1"
    if %errorlevel% neq 0 (
        echo.
        echo ERROR: Mod installation failed.
        pause
        exit /b 1
    )
    echo.
    echo Mod download complete. Press Enter to continue to server launch...
    pause >nul
    echo.
)
endlocal

REM Strip any client-only / crash-causing mods
if exist "mods" (
    call "%~dp0strip_client_mods.bat" >nul 2>&1
)

REM Update mods (download new, remove old versions)
if exist "mods\.index" (
    echo [UPDATE] Syncing mod JARs...
    powershell -ExecutionPolicy Bypass -File "%~dp0update_mods.ps1" -ModsDir "mods"
)

REM Clean stale mod JARs not in any .pw.toml. The full logic lives in
REM cleanup_stale_jars.ps1 - moved out of inline cmd because the inline
REM ^-continued PowerShell with embedded `\""` was hitting cmd quote-
REM escape edge cases that occasionally dropped customJars entries
REM (deleting our own custom-bundled jars: ars_nouveau, iridescent_biomes,
REM iridescent_modular_spells were being wiped, causing the next launch
REM to crash with "no existing paths" for the missing custom jar).
echo [CLEANUP] Removing stale mod JARs...
if not exist "%~dp0cleanup_stale_jars.ps1" (
    echo   [SETUP] Downloading cleanup script...
    powershell -ExecutionPolicy Bypass -Command ^
        "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12;" ^
        "try { Invoke-WebRequest -Uri 'https://raw.githubusercontent.com/silvariasereneblossom/IridescentCraft/main/.minecraft/server_distribution/cleanup_stale_jars.ps1' -OutFile '%~dp0cleanup_stale_jars.ps1' -UseBasicParsing -TimeoutSec 30 } catch {}"
)
if exist "%~dp0cleanup_stale_jars.ps1" (
    powershell -ExecutionPolicy Bypass -File "%~dp0cleanup_stale_jars.ps1"
) else (
    echo   [WARN] cleanup_stale_jars.ps1 not found, skipping cleanup.
)
echo.

REM -------------------------------------------------------------------
REM Phase 3: Accept EULA
REM -------------------------------------------------------------------
if not exist "eula.txt" (
    echo eula=true> eula.txt
    echo [SETUP] EULA accepted.
)
findstr /C:"eula=true" eula.txt >nul 2>&1
if %errorlevel% neq 0 (
    echo [SETUP] Accepting EULA...
    echo eula=true> eula.txt
)

REM -------------------------------------------------------------------
REM Phase 4: Launch server
REM -------------------------------------------------------------------
echo.
powershell -Command ^
  "$null = Add-Type -MemberDefinition '[DllImport(\"kernel32.dll\")]public static extern IntPtr GetStdHandle(int n);[DllImport(\"kernel32.dll\")]public static extern bool GetConsoleMode(IntPtr h,out uint m);[DllImport(\"kernel32.dll\")]public static extern bool SetConsoleMode(IntPtr h,uint m);' -Name C -Namespace W -PassThru -EA SilentlyContinue;" ^
  "try{$h=[W.C]::GetStdHandle(-11);$m=0;[W.C]::GetConsoleMode($h,[ref]$m)|Out-Null;[W.C]::SetConsoleMode($h,$m -bor 4)|Out-Null}catch{};" ^
  "$e=[char]27;" ^
  "$blue=\"${e}[38;2;91;206;250m\";$pink=\"${e}[38;2;245;169;184m\";$white=\"${e}[38;2;255;255;255m\";$rs=\"${e}[0m\";" ^
  "[Console]::Write(\"${blue}  ==========================================${rs}\");[Console]::WriteLine();" ^
  "[Console]::Write(\"${pink}  Welcome to IridescentCraft!${rs}\");[Console]::WriteLine();" ^
  "[Console]::Write(\"${white}  Starting server (8-10 GB RAM)${rs}\");[Console]::WriteLine();" ^
  "[Console]::Write(\"${pink}  First startup may take 5-15 minutes${rs}\");[Console]::WriteLine();" ^
  "[Console]::Write(\"${blue}  ==========================================${rs}\");[Console]::WriteLine()"
echo.

java ^
    -noverify ^
    -Xmx14G ^
    -Xms14G ^
    -XX:+UseG1GC ^
    -XX:+ParallelRefProcEnabled ^
    -XX:MaxGCPauseMillis=200 ^
    -XX:+UnlockExperimentalVMOptions ^
    -XX:+DisableExplicitGC ^
    -XX:+AlwaysPreTouch ^
    -XX:G1NewSizePercent=30 ^
    -XX:G1MaxNewSizePercent=40 ^
    -XX:G1HeapRegionSize=8M ^
    -XX:G1ReservePercent=20 ^
    -XX:G1HeapWastePercent=5 ^
    -XX:G1MixedGCCountTarget=4 ^
    -XX:InitiatingHeapOccupancyPercent=15 ^
    -XX:G1MixedGCLiveThresholdPercent=90 ^
    -XX:G1RSetUpdatingPauseTimePercent=5 ^
    -XX:SurvivorRatio=32 ^
    -XX:+PerfDisableSharedMem ^
    -XX:MaxTenuringThreshold=1 ^
    -Dusing.aikars.flags=https://mcflags.emc.gs ^
    -Daikars.new.flags=true ^
    -XX:+HeapDumpOnOutOfMemoryError ^
    -XX:HeapDumpPath=crash-heapdump.hprof ^
    @libraries/net/minecraftforge/forge/1.20.1-47.4.6/win_args.txt nogui %*

REM -------------------------------------------------------------------
REM Phase 5: Post-exit hooks
REM -------------------------------------------------------------------
set EXIT_CODE=%errorlevel%

if %EXIT_CODE% neq 0 (
    echo.
    echo ==========================================
    echo   SERVER CRASHED - Exit code: %EXIT_CODE%
    echo ==========================================
    echo.

    for /f "tokens=1-3 delims=/ " %%a in ('date /t') do set DATESTAMP=%%c-%%a-%%b
    for /f "tokens=1-2 delims=: " %%a in ('time /t') do set TIMESTAMP=%%a-%%b
    set CRASHLOG=crash-%DATESTAMP%_%TIMESTAMP%.log

    echo IridescentCraft Server Crash Log > "%CRASHLOG%"
    echo ================================ >> "%CRASHLOG%"
    echo Date: %DATE% %TIME% >> "%CRASHLOG%"
    echo Exit Code: %EXIT_CODE% >> "%CRASHLOG%"
    echo. >> "%CRASHLOG%"

    if exist "crash-reports" (
        for /f "delims=" %%F in ('dir /b /o-d "crash-reports\crash-*.txt" 2^>nul') do (
            echo --- Forge Crash Report: %%F --- >> "%CRASHLOG%"
            type "crash-reports\%%F" >> "%CRASHLOG%"
            goto :got_crash
        )
    )
    :got_crash

    echo. >> "%CRASHLOG%"
    echo --- Last 200 lines of server log --- >> "%CRASHLOG%"
    if exist "logs\latest.log" (
        powershell -Command "Get-Content 'logs\latest.log' -Tail 200" >> "%CRASHLOG%"
    )

    echo Crash log saved: %CRASHLOG%
    echo.
) else (
    echo.
    echo Server stopped normally.
)

REM ─────────────────────────────────────────────────────────────────────
REM Auto-mirror session logs to TesterLogs\Server Logs\ on every exit
REM (clean or crash). Calls push_crash_logs.bat --silent which copies
REM logs + does a best-effort git push from instance root if the parent
REM is a git working tree. Topology B (dedicated Windows Server with
REM Z: mirror) falls through to dev PC pickup via prism_postexit.bat.
REM
REM Manual interactive variant (push_crash_logs.bat without flag) is
REM kept as a failsafe for one-off pushes.
REM ─────────────────────────────────────────────────────────────────────
if exist "%~dp0push_crash_logs.bat" (
    call "%~dp0push_crash_logs.bat" --silent
)

pause
