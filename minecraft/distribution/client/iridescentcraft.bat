@echo off
REM IridescentCraft Client Installer (Windows)
REM One-click: downloads PrismLauncher if needed, sets up instance, launches
REM
REM Requirements:
REM   - Windows 10/11 (64-bit)
REM   - Java 17 (PrismLauncher will prompt if missing)
REM   - Minecraft account (Microsoft, Ely.by, or offline)

title IridescentCraft Client Installer
setlocal enabledelayedexpansion

echo.
powershell -Command ^
  "$r='Red';$o='DarkYellow';$y='Yellow';$g='Green';$c='Cyan';$b='Blue';$m='Magenta';" ^
  "$colors=@($r,$o,$y,$g,$c,$b,$m);" ^
  "Write-Host '  ==========================================' -ForegroundColor Cyan;" ^
  "$text='  IridescentCraft Client Installer';" ^
  "for($i=0;$i -lt $text.Length;$i++){Write-Host $text[$i] -NoNewline -ForegroundColor $colors[$i %% $colors.Length]};" ^
  "Write-Host '';" ^
  "$text='  Forge 1.20.1-47.4.6  ~420 mods';" ^
  "for($i=0;$i -lt $text.Length;$i++){Write-Host $text[$i] -NoNewline -ForegroundColor $colors[$i %% $colors.Length]};" ^
  "Write-Host '';" ^
  "Write-Host '  ==========================================' -ForegroundColor Cyan"
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

REM Download and extract to %AppData%\PrismLauncher (standard location)
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

REM Find prismlauncher.exe (ZIP may have a subfolder)
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
REM Phase 2: Set up instance in %AppData%\PrismLauncher\instances
REM -------------------------------------------------------------------
REM PrismLauncher defaults to %AppData%\PrismLauncher for data.
REM Always create the instance there — works for installed and portable.
REM -------------------------------------------------------------------
echo [SETUP] Preparing IridescentCraft instance...
echo.

set "INSTANCES_DIR=%AppData%\PrismLauncher\instances"
mkdir "%INSTANCES_DIR%" 2>nul

set "INSTANCE_DIR=%INSTANCES_DIR%\IridescentCraft"

echo   Instances folder: %INSTANCES_DIR%

REM Check if instance already exists
if exist "%INSTANCE_DIR%\instance.cfg" (
    echo   Instance already exists. Skipping setup.
    echo.
    goto :launch
)

REM Create instance
echo   Creating instance...
mkdir "%INSTANCE_DIR%" 2>nul
mkdir "%INSTANCE_DIR%\.minecraft" 2>nul

REM Download instance metadata from GitHub
set "REPO_RAW=https://raw.githubusercontent.com/silvariasereneblossom/IridescentCraft/main/minecraft/distribution/client"

echo   Downloading instance.cfg...
powershell -Command "Invoke-WebRequest -Uri '%REPO_RAW%/instance.cfg' -OutFile '%INSTANCE_DIR%\instance.cfg' -UseBasicParsing"
echo   Downloading mmc-pack.json...
powershell -Command "Invoke-WebRequest -Uri '%REPO_RAW%/mmc-pack.json' -OutFile '%INSTANCE_DIR%\mmc-pack.json' -UseBasicParsing"

if not exist "%INSTANCE_DIR%\instance.cfg" (
    echo   ERROR: Failed to download instance.cfg
    pause
    exit /b 1
)

REM Copy game files from local distribution if available, otherwise download
if exist "%~dp0config" (
    echo   Copying configs...
    xcopy /s /e /y /q "%~dp0config" "%INSTANCE_DIR%\.minecraft\config\" >nul 2>&1
    echo   Copying default configs...
    xcopy /s /e /y /q "%~dp0defaultconfigs" "%INSTANCE_DIR%\.minecraft\defaultconfigs\" >nul 2>&1
    echo   Copying KubeJS scripts...
    xcopy /s /e /y /q "%~dp0kubejs" "%INSTANCE_DIR%\.minecraft\kubejs\" >nul 2>&1
    echo   Copying datapacks...
    xcopy /s /e /y /q "%~dp0global_packs" "%INSTANCE_DIR%\.minecraft\global_packs\" >nul 2>&1
    echo   Copying mod metadata...
    xcopy /s /e /y /q "%~dp0mods" "%INSTANCE_DIR%\.minecraft\mods\" >nul 2>&1
) else (
    echo   No local distribution folder found — downloading from GitHub...
    echo   Cloning mod index and configs...
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
      "  $dest = '%INSTANCE_DIR%\.minecraft';" ^
      "  Write-Host '  Copying game files...';" ^
      "  if (Test-Path \"$src\config\") { Copy-Item \"$src\config\" \"$dest\config\" -Recurse -Force };" ^
      "  if (Test-Path \"$src\defaultconfigs\") { Copy-Item \"$src\defaultconfigs\" \"$dest\defaultconfigs\" -Recurse -Force };" ^
      "  if (Test-Path \"$src\kubejs\") { Copy-Item \"$src\kubejs\" \"$dest\kubejs\" -Recurse -Force };" ^
      "  if (Test-Path \"$src\global_packs\") { Copy-Item \"$src\global_packs\" \"$dest\global_packs\" -Recurse -Force };" ^
      "  if (Test-Path \"$src\mods\") { Copy-Item \"$src\mods\" \"$dest\mods\" -Recurse -Force };" ^
      "  Remove-Item $zipFile -Force -ErrorAction SilentlyContinue;" ^
      "  Remove-Item $extractDir -Recurse -Force -ErrorAction SilentlyContinue;" ^
      "  Write-Host '  Done.';" ^
      "} catch { Write-Host ('ERROR: ' + $_.Exception.Message) -ForegroundColor Red; exit 1; }"
)

REM Ensure instgroups.json exists
if not exist "%INSTANCES_DIR%\instgroups.json" (
    echo {"formatVersion":1,"groups":{}} > "%INSTANCES_DIR%\instgroups.json"
)

echo.
echo   [OK] Instance created. PrismLauncher will download mods on first launch.
echo.

:launch
REM -------------------------------------------------------------------
REM Phase 3: Launch PrismLauncher
REM -------------------------------------------------------------------
echo [LAUNCH] Starting PrismLauncher...
echo.
echo   NOTE: If this is your first time:
echo     1. Add your account (Accounts section in Settings)
echo        - Microsoft, Ely.by, or offline accounts supported
echo     2. Select "IridescentCraft" from the instance list
echo     3. Click "Launch" — mods will download automatically
echo     4. First launch takes 5-15 minutes with 420+ mods
echo.

start "PrismLauncher" "%PRISM_EXE%"

echo PrismLauncher launched. You can close this window.
echo.
pause
