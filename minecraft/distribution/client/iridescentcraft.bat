@echo off
REM IridescentCraft Client Installer (Windows)
REM One-click: finds/downloads PrismLauncher, sets up instance, downloads mods
REM
REM Requirements:
REM   - Windows 10/11 (64-bit)
REM   - Java 17+ (PrismLauncher will prompt if missing)
REM   - Minecraft account (Microsoft, Ely.by, or offline)

title IridescentCraft Client Installer
setlocal enabledelayedexpansion
cd /d "%~dp0"

echo.
powershell -Command ^
  "Add-Type -MemberDefinition '[DllImport(\"kernel32.dll\")]public static extern bool SetConsoleMode(IntPtr h,int m);[DllImport(\"kernel32.dll\")]public static extern IntPtr GetStdHandle(int h);' -Name W -Namespace C;" ^
  "$h=[C.W]::GetStdHandle(-11);[C.W]::SetConsoleMode($h,7)|Out-Null;" ^
  "$B=\"`e[38;2;91;206;250m\";$P=\"`e[38;2;245;169;184m\";$W=\"`e[38;2;255;255;255m\";$R=\"`e[0m\";" ^
  "[Console]::Write(\"${B}  ==========================================`n\");" ^
  "[Console]::Write(\"${P}  IridescentCraft Client Installer`n\");" ^
  "[Console]::Write(\"${W}  Forge 1.20.1-47.4.6  ~420 mods`n\");" ^
  "[Console]::Write(\"${P}  Iridescent Edition`n\");" ^
  "[Console]::Write(\"${B}  ==========================================`n\");" ^
  "[Console]::Write(\"${R}\")"
echo.

REM -------------------------------------------------------------------
REM Phase 1: Find or download PrismLauncher
REM -------------------------------------------------------------------
set PRISM_EXE=

REM Check common install locations
for %%P in (
    "%LocalAppData%\Programs\PrismLauncher\prismlauncher.exe"
    "%ProgramFiles%\PrismLauncher\prismlauncher.exe"
    "%ProgramFiles(x86)%\PrismLauncher\prismlauncher.exe"
    "%LocalAppData%\PrismLauncher\prismlauncher.exe"
    "%AppData%\PrismLauncher\prismlauncher.exe"
    "%~dp0PrismLauncher\prismlauncher.exe"
) do (
    if exist "%%~P" (
        set "PRISM_EXE=%%~P"
    )
)

REM Check PATH
if not defined PRISM_EXE (
    where prismlauncher.exe >nul 2>&1
    if !errorlevel! equ 0 (
        for /f "delims=" %%P in ('where prismlauncher.exe') do set "PRISM_EXE=%%P"
    )
)

REM Search user profile as last resort
if not defined PRISM_EXE (
    for /f "delims=" %%F in ('powershell -Command "Get-ChildItem -Path $env:LOCALAPPDATA,$env:APPDATA,$env:USERPROFILE -Filter 'prismlauncher.exe' -Recurse -Depth 4 -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty FullName" 2^>nul') do (
        set "PRISM_EXE=%%F"
    )
)

if defined PRISM_EXE (
    echo [OK] PrismLauncher found: %PRISM_EXE%
    echo.
    goto :setup_instance
)

REM Ask user to locate it manually before downloading
echo   PrismLauncher not found in standard locations.
echo   If you already have it installed, enter the path to prismlauncher.exe
echo   or press Enter to download a fresh copy.
echo.
set /p "USER_PRISM=  Path (or Enter to download): "
if defined USER_PRISM (
    if exist "!USER_PRISM!" (
        set "PRISM_EXE=!USER_PRISM!"
        echo [OK] Using: !PRISM_EXE!
        echo.
        goto :setup_instance
    ) else (
        echo   File not found. Downloading fresh copy...
        echo.
    )
)

echo [INSTALL] Downloading PrismLauncher...
echo.

set "PRISM_INSTALL=%AppData%\PrismLauncher"
set "PRISM_ZIP=%TEMP%\PrismLauncher-Portable.zip"

mkdir "%PRISM_INSTALL%" 2>nul

powershell -Command ^
  "try {" ^
  "  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12;" ^
  "  $release = Invoke-RestMethod -Uri 'https://api.github.com/repos/PrismLauncher/PrismLauncher/releases/latest' -UseBasicParsing;" ^
  "  $asset = $release.assets | Where-Object { $_.name -match 'Windows-MSVC-Portable.*\.zip$' -and $_.name -notmatch 'arm' } | Select-Object -First 1;" ^
  "  if ($asset) {" ^
  "    Write-Host ('  Downloading: ' + $asset.name);" ^
  "    Invoke-WebRequest -Uri $asset.browser_download_url -OutFile '%PRISM_ZIP%' -UseBasicParsing;" ^
  "  } else {" ^
  "    Write-Host 'ERROR: Could not find download' -ForegroundColor Red; exit 1;" ^
  "  }" ^
  "} catch { Write-Host ('ERROR: ' + $_.Exception.Message) -ForegroundColor Red; exit 1; }"

if not exist "%PRISM_ZIP%" (
    echo ERROR: Failed to download PrismLauncher.
    echo Please download manually from https://prismlauncher.org/download/
    pause
    exit /b 1
)

echo   Extracting to %PRISM_INSTALL%...
powershell -Command "Expand-Archive -Path '%PRISM_ZIP%' -DestinationPath '%PRISM_INSTALL%' -Force"
del "%PRISM_ZIP%" 2>nul

for /f "delims=" %%F in ('powershell -Command "Get-ChildItem -Path '%PRISM_INSTALL%' -Filter 'prismlauncher.exe' -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty FullName"') do (
    set "PRISM_EXE=%%F"
)

if not defined PRISM_EXE (
    echo ERROR: Extraction failed. Check %PRISM_INSTALL%
    pause
    exit /b 1
)

echo   [OK] PrismLauncher installed.
echo.

:setup_instance
REM -------------------------------------------------------------------
REM Phase 2: Set up instance
REM -------------------------------------------------------------------
REM PrismLauncher OneSix layout:
REM   instances/IridescentCraft/
REM     instance.cfg          <- PrismLauncher metadata
REM     mmc-pack.json         <- component list (MC + Forge versions)
REM     .minecraft/           <- actual game directory
REM       mods/               <- Forge loads mods from here
REM       config/
REM       kubejs/
REM       global_packs/
REM -------------------------------------------------------------------

echo [SETUP] Preparing IridescentCraft instance...
echo.

set "INSTANCES_DIR=%AppData%\PrismLauncher\instances"
set "INSTANCE_DIR=%INSTANCES_DIR%\IridescentCraft"
set "MC_DIR=%INSTANCE_DIR%\.minecraft"

mkdir "%INSTANCES_DIR%" 2>nul
mkdir "%INSTANCE_DIR%" 2>nul
mkdir "%MC_DIR%" 2>nul
mkdir "%MC_DIR%\mods" 2>nul

REM Always sync configs/scripts/datapacks (supports updates on re-run)
echo   Syncing game files...

if exist "%~dp0config" (
    REM Local distribution available — copy from here
    xcopy /s /e /y /q "%~dp0config" "%MC_DIR%\config\" >nul 2>&1
    echo     config... OK
    if exist "%~dp0defaultconfigs" (
        xcopy /s /e /y /q "%~dp0defaultconfigs" "%MC_DIR%\defaultconfigs\" >nul 2>&1
        echo     defaultconfigs... OK
    )
    xcopy /s /e /y /q "%~dp0kubejs" "%MC_DIR%\kubejs\" >nul 2>&1
    echo     kubejs... OK
    xcopy /s /e /y /q "%~dp0global_packs" "%MC_DIR%\global_packs\" >nul 2>&1
    echo     global_packs... OK

    REM Copy custom mod JARs (coremods, compat patches — NOT downloaded mods)
    if exist "%~dp0mods\*.jar" (
        copy /y "%~dp0mods\*.jar" "%MC_DIR%\mods\" >nul 2>&1
        echo     custom JARs... OK
    )

    REM Copy mod index for download phase
    if exist "%~dp0mods\.index" (
        mkdir "%MC_DIR%\mods\.index" 2>nul
        xcopy /s /e /y /q "%~dp0mods\.index" "%MC_DIR%\mods\.index\" >nul 2>&1
        echo     mod index... OK
    )
) else (
    echo   No local distribution — downloading from GitHub...
    powershell -Command ^
      "try {" ^
      "  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12;" ^
      "  $zipUrl = 'https://github.com/silvariasereneblossom/IridescentCraft/archive/refs/heads/main.zip';" ^
      "  $zipFile = $env:TEMP + '\IridescentCraft-main.zip';" ^
      "  $extractDir = $env:TEMP + '\IridescentCraft-extract';" ^
      "  Write-Host '  Downloading repository...';" ^
      "  Invoke-WebRequest -Uri $zipUrl -OutFile $zipFile -UseBasicParsing;" ^
      "  Write-Host '  Extracting...';" ^
      "  if (Test-Path $extractDir) { Remove-Item $extractDir -Recurse -Force };" ^
      "  Expand-Archive -Path $zipFile -DestinationPath $extractDir -Force;" ^
      "  $src = (Get-ChildItem $extractDir -Directory | Select-Object -First 1).FullName + '\minecraft\distribution\client';" ^
      "  $mc = '%MC_DIR%';" ^
      "  Write-Host '  Copying game files...';" ^
      "  if (Test-Path \"$src\config\") { Copy-Item \"$src\config\" \"$mc\config\" -Recurse -Force };" ^
      "  if (Test-Path \"$src\defaultconfigs\") { Copy-Item \"$src\defaultconfigs\" \"$mc\defaultconfigs\" -Recurse -Force };" ^
      "  if (Test-Path \"$src\kubejs\") { Copy-Item \"$src\kubejs\" \"$mc\kubejs\" -Recurse -Force };" ^
      "  if (Test-Path \"$src\global_packs\") { Copy-Item \"$src\global_packs\" \"$mc\global_packs\" -Recurse -Force };" ^
      "  if (Test-Path \"$src\mods\.index\") { New-Item -ItemType Directory -Path \"$mc\mods\.index\" -Force | Out-Null; Copy-Item \"$src\mods\.index\*\" \"$mc\mods\.index\" -Recurse -Force };" ^
      "  if (Test-Path \"$src\mods\*.jar\") { Copy-Item \"$src\mods\*.jar\" \"$mc\mods\" -Force };" ^
      "  Remove-Item $zipFile -Force -ErrorAction SilentlyContinue;" ^
      "  Remove-Item $extractDir -Recurse -Force -ErrorAction SilentlyContinue;" ^
      "  Write-Host '  Done.';" ^
      "} catch { Write-Host ('ERROR: ' + $_.Exception.Message) -ForegroundColor Red; exit 1; }"
)

REM Write instance.cfg and mmc-pack.json (always overwrite for updates)
echo   Writing instance metadata...
(
echo [General]
echo ConfigVersion=1.3
echo InstanceType=OneSix
echo MCLaunchMethod=LauncherPart
echo OverrideMemory=true
echo MaxMemAlloc=10240
echo MinMemAlloc=4096
echo iconKey=default
echo name=IridescentCraft
) > "%INSTANCE_DIR%\instance.cfg"

(
echo {
echo     "components": [
echo         {
echo             "cachedName": "Minecraft",
echo             "cachedVersion": "1.20.1",
echo             "important": true,
echo             "uid": "net.minecraft",
echo             "version": "1.20.1"
echo         },
echo         {
echo             "cachedName": "Forge",
echo             "cachedVersion": "47.4.6",
echo             "uid": "net.minecraftforge",
echo             "version": "47.4.6"
echo         }
echo     ],
echo     "formatVersion": 1
echo }
) > "%INSTANCE_DIR%\mmc-pack.json"

REM Ensure instgroups.json exists (PrismLauncher needs this)
if not exist "%INSTANCES_DIR%\instgroups.json" (
    powershell -Command "'{\"formatVersion\":1,\"groups\":{}}' | Set-Content -Path '%INSTANCES_DIR%\instgroups.json' -Encoding UTF8"
)

echo.
echo   [OK] Instance ready.
echo.

REM -------------------------------------------------------------------
REM Phase 3: Download mods from .pw.toml metadata
REM -------------------------------------------------------------------
set "INDEX_DIR=%MC_DIR%\mods\.index"
set "MODS_DIR=%MC_DIR%\mods"

if not exist "%INDEX_DIR%" (
    echo [WARN] No mod index found. Mods must be downloaded manually.
    echo.
    goto :launch
)

REM Count existing mods
set "JAR_COUNT=0"
for /f %%A in ('powershell -Command "(Get-ChildItem '%MODS_DIR%\*.jar' -ErrorAction SilentlyContinue).Count"') do set "JAR_COUNT=%%A"

echo [MODS] Found %JAR_COUNT% mods installed, checking for missing...
echo.

REM Use external PS1 script to avoid bat escaping issues with regex
powershell -ExecutionPolicy Bypass -File "%~dp0download_mods.ps1" -IndexDir "%INDEX_DIR%" -ModsDir "%MODS_DIR%"

echo.
echo   Mod sync complete.
echo.

:launch
REM -------------------------------------------------------------------
REM Phase 4: Launch PrismLauncher
REM -------------------------------------------------------------------
echo [LAUNCH] Starting PrismLauncher...
echo.
echo   NOTE: If this is your first time:
echo     1. Add your account (Accounts section in Settings)
echo        - Microsoft, Ely.by, or offline accounts supported
echo     2. Select "IridescentCraft" from the instance list
echo     3. Click "Launch"
echo     4. First launch takes 5-15 minutes (Forge downloads + 420 mods load)
echo.

start "" "%PRISM_EXE%"

echo PrismLauncher launched. You can close this window.
echo.
pause
