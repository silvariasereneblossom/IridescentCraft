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
REM Phase 0: Self-Update from GitHub
REM -------------------------------------------------------------------
REM Checks latest commit SHA via GitHub API. If it matches the stored
REM SHA in .icraft_last_sha, skips the zip download entirely. Otherwise
REM downloads main.zip, overlays configs/scripts/datapacks/.index, and
REM records the new SHA.
REM Preserves: world/, logs/, crash-reports/, backups/, libraries/, mods/*.jar
echo [UPDATE] Checking for updates from GitHub...
powershell -ExecutionPolicy Bypass -Command ^
  "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12;" ^
  "$apiUrl = 'https://api.github.com/repos/silvariasereneblossom/IridescentCraft/commits/main';" ^
  "$zipUrl = 'https://github.com/silvariasereneblossom/IridescentCraft/archive/refs/heads/main.zip';" ^
  "$shaFile = Join-Path '%~dp0' '.icraft_last_sha';" ^
  "$zipFile = $env:TEMP + '\IridescentCraft-server-update.zip';" ^
  "$extractDir = $env:TEMP + '\IridescentCraft-server-update';" ^
  "$localSha = '';" ^
  "if (Test-Path $shaFile) { $localSha = (Get-Content $shaFile -Raw).Trim() };" ^
  "try {" ^
  "  $headers = @{ 'User-Agent' = 'IridescentCraft-Server' };" ^
  "  $resp = Invoke-RestMethod -Uri $apiUrl -Headers $headers -TimeoutSec 15;" ^
  "  $remoteSha = $resp.sha;" ^
  "  if ($remoteSha -eq $localSha) {" ^
  "    Write-Host ('  [OK] Up to date (commit ' + $remoteSha.Substring(0,7) + ').') -ForegroundColor Green;" ^
  "    exit 0;" ^
  "  };" ^
  "  if ($localSha) {" ^
  "    Write-Host ('  New commit: ' + $remoteSha.Substring(0,7) + ' (was ' + $localSha.Substring(0,7) + '). Downloading...');" ^
  "  } else {" ^
  "    Write-Host ('  First run or missing SHA. Downloading ' + $remoteSha.Substring(0,7) + '...');" ^
  "  };" ^
  "  Invoke-WebRequest -Uri $zipUrl -OutFile $zipFile -UseBasicParsing -TimeoutSec 60;" ^
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
  "      $current = Join-Path $dest $item.Name;" ^
  "      $srcHash = (Get-FileHash $item.FullName -Algorithm SHA1).Hash;" ^
  "      $destHash = if (Test-Path $current) { (Get-FileHash $current -Algorithm SHA1).Hash } else { '' };" ^
  "      if ($srcHash -ne $destHash) {" ^
  "        Copy-Item $item.FullName ($current + '.new') -Force;" ^
  "        Write-Host ('  [update] Staged new ' + $item.Name + ' for post-Phase 0 swap') -ForegroundColor Cyan" ^
  "      };" ^
  "      continue;" ^
  "    } else {" ^
  "      Copy-Item $item.FullName $dest -Recurse -Force;" ^
  "    }" ^
  "  };" ^
  "  $paxiSrc = Join-Path $src 'config\paxi\datapacks';" ^
  "  $paxiDest = Join-Path $dest 'config\paxi\datapacks';" ^
  "  if ((Test-Path $paxiSrc) -and (Test-Path $paxiDest)) {" ^
  "    Write-Host '  Verifying paxi datapacks...';" ^
  "    $paxiCopied = 0;" ^
  "    Get-ChildItem $paxiSrc -Filter '*.zip' | ForEach-Object {" ^
  "      $target = Join-Path $paxiDest $_.Name;" ^
  "      if ((-not (Test-Path $target)) -or ((Get-Item $target).Length -ne $_.Length)) {" ^
  "        Copy-Item $_.FullName $target -Force;" ^
  "        $paxiCopied++;" ^
  "        Write-Host ('    [sync] ' + $_.Name)" ^
  "      }" ^
  "    };" ^
  "    $paxiOrder = Join-Path $src 'config\paxi\datapack_load_order.json';" ^
  "    if (Test-Path $paxiOrder) { Copy-Item $paxiOrder (Join-Path $dest 'config\paxi\datapack_load_order.json') -Force };" ^
  "    if ($paxiCopied -gt 0) { Write-Host ('    [sync] ' + $paxiCopied + ' paxi datapack(s) force-copied') -ForegroundColor Yellow }" ^
  "  };" ^
  "  $remoteSha | Out-File -FilePath $shaFile -Encoding ASCII -NoNewline;" ^
  "  Remove-Item $zipFile -Force -ErrorAction SilentlyContinue;" ^
  "  Remove-Item $extractDir -Recurse -Force -ErrorAction SilentlyContinue;" ^
  "  Write-Host ('  [OK] Updated to ' + $remoteSha.Substring(0,7) + '.') -ForegroundColor Green;" ^
  "} catch {" ^
  "  Write-Host ('  [WARN] Update check failed: ' + $_.Exception.Message) -ForegroundColor Yellow;" ^
  "  Write-Host '  Continuing with existing files...' -ForegroundColor Yellow;" ^
  "  Remove-Item $zipFile -Force -ErrorAction SilentlyContinue;" ^
  "  Remove-Item $extractDir -Recurse -Force -ErrorAction SilentlyContinue;" ^
  "}"
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
if exist "%~dp0iridescentserver.bat.new" (
    echo.
    echo [UPDATE] New iridescentserver.bat staged. Applying and relaunching...
    echo.
    powershell -ExecutionPolicy Bypass -Command ^
        "Move-Item -LiteralPath '%~dp0iridescentserver.bat.new' -Destination '%~dp0iridescentserver.bat' -Force;" ^
        "Start-Process -FilePath '%~dp0iridescentserver.bat' -WorkingDirectory '%~dp0'"
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
