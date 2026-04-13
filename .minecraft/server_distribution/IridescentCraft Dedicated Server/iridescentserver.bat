@echo off
REM IridescentCraft Server — Unified Installer + Launcher (Windows)
REM Forge 1.20.1-47.4.6 with 420+ mods
REM
REM First run:  Installs Forge, downloads mods, then starts the server
REM Later runs: Skips install (mods already present), starts the server
REM
REM Requirements:
REM   - Java 17 (e.g., Adoptium/Temurin JDK 17)
REM   - 8-12 GB RAM available for the server

title IridescentCraft Server

REM Check if we're in a system user folder — never run in-place there
set "IN_SYSTEM_FOLDER=0"
setlocal enabledelayedexpansion
for %%D in (Desktop Documents Downloads Music Pictures Videos) do (
    echo "%~dp0" | findstr /I /C:"\%%D\" >nul 2>&1
    if not errorlevel 1 set "IN_SYSTEM_FOLDER=1"
)

REM If in system folder: always create subfolder (ignore .icraft_server)
REM If not in system folder: create subfolder only if no .icraft_server marker
if "!IN_SYSTEM_FOLDER!"=="1" (
    if not exist "%~dp0IridescentCraft Dedicated Server\.icraft_server" (
        set "SERVER_DIR=%~dp0IridescentCraft Dedicated Server"
        if not exist "!SERVER_DIR!" mkdir "!SERVER_DIR!"
        copy /y "%~f0" "!SERVER_DIR!\iridescentserver.bat" >nul
        echo. > "!SERVER_DIR!\.icraft_server"
        echo [SETUP] Created server directory. Launching from there...
        start "" "!SERVER_DIR!\iridescentserver.bat"
        endlocal
        exit /b
    ) else (
        REM Subfolder already exists — launch from there
        start "" "%~dp0IridescentCraft Dedicated Server\iridescentserver.bat"
        endlocal
        exit /b
    )
)

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

REM We're in the server dir — ensure working directory is correct
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
REM Phase 0: Self-Update from GitHub (diff-based)
REM -------------------------------------------------------------------
REM Uses phase0_sync.ps1 for diff-based updates: compares commit SHAs,
REM then downloads ONLY the changed files via GitHub compare API +
REM raw.githubusercontent.com. Typical sync: 5-10 seconds for 3-10 files.
REM Falls back to full zip download on first run or when >300 files changed.
REM
REM If phase0_sync.ps1 doesn't exist yet (first ever deploy), download it
REM from raw.githubusercontent.com before calling it.
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
REM We use PowerShell Move-Item to atomically replace the bat, then
REM exit this cmd.exe and let a fresh one pick up the new version.
REM
REM Safety: cmd.exe holds the current .bat open with FILE_SHARE_DELETE
REM (Win10+), so Move-Item can rename-over the running file. After
REM exit /b here, cmd.exe releases the handle; the freshly-launched
REM cmd reads the NEW bat content from disk.
REM Check for staged self-updates (.new files) from Phase 0
REM Use SDIR without trailing backslash to avoid %~dp0 + quote breaking PS
set "SDIR=%~dp0"
if "%SDIR:~-1%"=="\" set "SDIR=%SDIR:~0,-1%"
set "NEED_RELAUNCH=0"
for %%F in (iridescentserver.bat phase0_sync.ps1) do (
    if exist "%SDIR%\%%F.new" (
        echo   Applying staged update: %%F
        powershell -ExecutionPolicy Bypass -Command "Move-Item -LiteralPath '%SDIR%\%%F.new' -Destination '%SDIR%\%%F' -Force"
        set "NEED_RELAUNCH=1"
    )
)
if "%NEED_RELAUNCH%"=="1" (
    echo.
    echo [UPDATE] Self-update applied. Relaunching...
    echo.
    start "" "%SDIR%\iridescentserver.bat"
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
if not exist "libraries\net\minecraftforge\forge\1.20.1-47.4.6" (
    echo [INSTALL] Forge not found — running first-time setup...
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

REM Clean stale mod JARs not in any .pw.toml
echo [CLEANUP] Removing stale mod JARs...
powershell -ExecutionPolicy Bypass -Command ^
  "$indexDir = 'mods\.index';" ^
  "$modsDir = 'mods';" ^
  "if (-not (Test-Path $indexDir)) { exit };" ^
  "$expected = @{};" ^
  "Get-ChildItem $indexDir\*.pw.toml | ForEach-Object {" ^
  "  foreach ($line in Get-Content $_.FullName) {" ^
  "    if ($line -match '^\s*filename\s*=\s*[''\""](.+)[''\""]') { $expected[$matches[1]] = $true }" ^
  "  }" ^
  "};" ^
  "$customJars = @('iridescent_codex_data.jar','iridescent_origins-1.0.0.jar','mek_walkable_cables-1.0.1.jar','offlineskins-1.20.1-v1.jar','zeta_racefix-1.0.0.jar','Patchouli-1.20.1-85-FORGE.jar');" ^
  "foreach ($c in $customJars) { $expected[$c] = $true };" ^
  "$removed = 0;" ^
  "Get-ChildItem $modsDir\*.jar -ErrorAction SilentlyContinue | ForEach-Object {" ^
  "  if (-not $expected.ContainsKey($_.Name)) {" ^
  "    Write-Host ('  Removing: ' + $_.Name) -ForegroundColor DarkYellow;" ^
  "    Remove-Item $_.FullName -Force; $removed++;" ^
  "  }" ^
  "};" ^
  "if ($removed -gt 0) { Write-Host ('  Removed ' + $removed + ' stale JAR(s)') -ForegroundColor Yellow }" ^
  "else { Write-Host '  No stale JARs.' -ForegroundColor Green }"
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
    -Xmx10G ^
    -Xms8G ^
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
REM Phase 5: Post-exit crash log
REM -------------------------------------------------------------------
set EXIT_CODE=%errorlevel%

if %EXIT_CODE% neq 0 (
    echo.
    echo ==========================================
    echo   SERVER CRASHED — Exit code: %EXIT_CODE%
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
pause
