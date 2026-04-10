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

REM Block running directly in system user folders
for %%D in (Desktop Documents Downloads Music Pictures Videos) do (
    echo "%~dp0" | findstr /I /C:"\%%D\" >nul 2>&1
    if not errorlevel 1 (
        echo.
        echo ERROR: Do not run the server directly in your %%D folder!
        echo Please move iridescentserver.bat to its own folder first,
        echo or just run it and it will create a dedicated server directory.
        echo.
        pause
        exit /b 1
    )
)

REM Create a dedicated server directory so files don't scatter
REM The .icraft_server marker file indicates we're already in the server dir
if not exist "%~dp0.icraft_server" (
    set "SERVER_DIR=%~dp0IridescentCraft Dedicated Server"
    setlocal enabledelayedexpansion
    if not exist "!SERVER_DIR!" mkdir "!SERVER_DIR!"
    copy /y "%~f0" "!SERVER_DIR!\iridescentserver.bat" >nul
    echo. > "!SERVER_DIR!\.icraft_server"
    echo [SETUP] Created server directory. Launching from there...
    start "" "!SERVER_DIR!\iridescentserver.bat"
    endlocal
    exit /b
)

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
REM Phase 0: Self-Update from GitHub
REM -------------------------------------------------------------------
REM Downloads latest server distribution from GitHub every launch.
REM Overlays configs, scripts, datapacks, .index metadata.
REM Preserves: world/, logs/, crash-reports/, backups/, libraries/, mods/*.jar
echo [UPDATE] Checking for updates from GitHub...
powershell -ExecutionPolicy Bypass -Command ^
  "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12;" ^
  "$zipUrl = 'https://github.com/silvariasereneblossom/IridescentCraft/archive/refs/heads/main.zip';" ^
  "$zipFile = $env:TEMP + '\IridescentCraft-server-update.zip';" ^
  "$extractDir = $env:TEMP + '\IridescentCraft-server-update';" ^
  "try {" ^
  "  Write-Host '  Downloading latest from GitHub...';" ^
  "  Invoke-WebRequest -Uri $zipUrl -OutFile $zipFile -UseBasicParsing -TimeoutSec 30;" ^
  "  if (-not (Test-Path $zipFile) -or (Get-Item $zipFile).Length -lt 100000) { throw 'Download too small or failed' };" ^
  "  Write-Host '  Extracting...';" ^
  "  if (Test-Path $extractDir) { Remove-Item $extractDir -Recurse -Force };" ^
  "  Expand-Archive -Path $zipFile -DestinationPath $extractDir -Force;" ^
  "  $src = (Get-ChildItem $extractDir -Directory | Select-Object -First 1).FullName + '\minecraft\server_distribution';" ^
  "  $dest = '%~dp0';" ^
  "  $exclude = @('world','logs','crash-reports','backups','libraries','.cache');" ^
  "  Write-Host '  Syncing configs, scripts, datapacks...';" ^
  "  foreach ($item in Get-ChildItem $src) {" ^
  "    if ($item.PSIsContainer -and $exclude -contains $item.Name) { continue };" ^
  "    if ($item.Name -eq 'mods') {" ^
  "      if (-not (Test-Path \"$dest\mods\.index\")) { New-Item -ItemType Directory -Path \"$dest\mods\.index\" -Force | Out-Null };" ^
  "      Copy-Item \"$($item.FullName)\.index\*\" \"$dest\mods\.index\" -Recurse -Force;" ^
  "      Get-ChildItem $item.FullName -Filter '*.jar' | ForEach-Object { Copy-Item $_.FullName \"$dest\mods\" -Force };" ^
  "    } elseif ($item.Name -eq 'iridescentserver.bat' -or $item.Name -eq 'iridescentserver.sh') {" ^
  "      continue;" ^
  "    } else {" ^
  "      Copy-Item $item.FullName $dest -Recurse -Force;" ^
  "    }" ^
  "  };" ^
  "  Remove-Item $zipFile -Force -ErrorAction SilentlyContinue;" ^
  "  Remove-Item $extractDir -Recurse -Force -ErrorAction SilentlyContinue;" ^
  "  Write-Host '  [OK] Update complete.' -ForegroundColor Green;" ^
  "} catch {" ^
  "  Write-Host ('  [WARN] Update check failed: ' + $_.Exception.Message) -ForegroundColor Yellow;" ^
  "  Write-Host '  Continuing with existing files...' -ForegroundColor Yellow;" ^
  "  Remove-Item $zipFile -Force -ErrorAction SilentlyContinue;" ^
  "  Remove-Item $extractDir -Recurse -Force -ErrorAction SilentlyContinue;" ^
  "}"
echo.

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
  "$customJars = @('iridescent_codex_data.jar','iridescent_origins-1.0.0.jar','mek_walkable_cables-1.0.1.jar','offlineskins-1.20.1-v1.jar','zeta_racefix-1.0.0.jar');" ^
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
