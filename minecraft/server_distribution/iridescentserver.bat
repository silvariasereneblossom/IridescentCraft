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

REM Ensure working directory is where the bat lives
cd /d "%~dp0"

echo.
powershell -Command ^
  "$r='Red';$o='DarkYellow';$y='Yellow';$g='Green';$c='Cyan';$b='Blue';$m='Magenta';" ^
  "$colors=@($r,$o,$y,$g,$c,$b,$m);" ^
  "Write-Host '  ==========================================' -ForegroundColor Cyan;" ^
  "$text='  IridescentCraft Server';" ^
  "for($i=0;$i -lt $text.Length;$i++){Write-Host $text[$i] -NoNewline -ForegroundColor $colors[$i %% $colors.Length]};" ^
  "Write-Host '';" ^
  "$text='  Forge 1.20.1-47.4.6';" ^
  "for($i=0;$i -lt $text.Length;$i++){Write-Host $text[$i] -NoNewline -ForegroundColor $colors[$i %% $colors.Length]};" ^
  "Write-Host '';" ^
  "Write-Host '  ==========================================' -ForegroundColor Cyan"
echo.

REM -------------------------------------------------------------------
REM Phase 0: Download server files from GitHub if not present
REM -------------------------------------------------------------------
REM If config/ or global_packs/ is missing, download the full server
REM distribution from the GitHub repo.
set "NEED_DOWNLOAD=0"
if not exist "%~dp0config" set "NEED_DOWNLOAD=1"
if not exist "%~dp0global_packs" set "NEED_DOWNLOAD=1"
if "%NEED_DOWNLOAD%"=="1" (
    echo [SETUP] Server files not found — downloading from GitHub...
    echo.
    powershell -ExecutionPolicy Bypass -Command ^
      "try {" ^
      "  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12;" ^
      "  $zipUrl = 'https://github.com/silvariasereneblossom/IridescentCraft/archive/refs/heads/main.zip';" ^
      "  $zipFile = $env:TEMP + '\IridescentCraft-server.zip';" ^
      "  $extractDir = $env:TEMP + '\IridescentCraft-server-extract';" ^
      "  Write-Host '  Downloading repository...';" ^
      "  Invoke-WebRequest -Uri $zipUrl -OutFile $zipFile -UseBasicParsing;" ^
      "  Write-Host '  Extracting server distribution...';" ^
      "  if (Test-Path $extractDir) { Remove-Item $extractDir -Recurse -Force };" ^
      "  Expand-Archive -Path $zipFile -DestinationPath $extractDir -Force;" ^
      "  $src = (Get-ChildItem $extractDir -Directory | Select-Object -First 1).FullName + '\minecraft\server_distribution';" ^
      "  $dest = '%~dp0';" ^
      "  Write-Host '  Copying server files...';" ^
      "  Get-ChildItem $src -Exclude 'iridescentserver.bat','iridescentserver.sh' | ForEach-Object {" ^
      "    if ($_.PSIsContainer) {" ^
      "      Copy-Item $_.FullName $dest -Recurse -Force;" ^
      "    } else {" ^
      "      Copy-Item $_.FullName $dest -Force;" ^
      "    }" ^
      "  };" ^
      "  Remove-Item $zipFile -Force -ErrorAction SilentlyContinue;" ^
      "  Remove-Item $extractDir -Recurse -Force -ErrorAction SilentlyContinue;" ^
      "  Write-Host '  Done.' -ForegroundColor Green;" ^
      "} catch { Write-Host ('ERROR: ' + $_.Exception.Message) -ForegroundColor Red; exit 1; }"
    if not exist "%~dp0global_packs" (
        echo ERROR: Failed to download server files.
        pause
        exit /b 1
    )
    echo.
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
    if !JAR_COUNT! LSS 50 set NEED_MODS=1
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
