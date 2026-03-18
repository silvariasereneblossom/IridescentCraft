@echo off
REM IridescentCraft Client Installer (Windows)
REM One-click: downloads PrismLauncher if needed, sets up instance, launches
REM
REM Requirements:
REM   - Windows 10/11 (64-bit)
REM   - Java 17 (PrismLauncher will prompt if missing)
REM   - Microsoft account for Minecraft login

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
set PRISM_DIR=

REM Check common install locations
for %%P in (
    "%LocalAppData%\Programs\PrismLauncher\prismlauncher.exe"
    "%ProgramFiles%\PrismLauncher\prismlauncher.exe"
    "%ProgramFiles(x86)%\PrismLauncher\prismlauncher.exe"
    "%~dp0PrismLauncher\prismlauncher.exe"
) do (
    if exist "%%~P" (
        set "PRISM_EXE=%%~P"
        set "PRISM_DIR=%%~dpP"
    )
)

REM Check PATH
if not defined PRISM_EXE (
    where prismlauncher.exe >nul 2>&1
    if !errorlevel! equ 0 (
        for /f "delims=" %%P in ('where prismlauncher.exe') do (
            set "PRISM_EXE=%%P"
            set "PRISM_DIR=%%~dpP"
        )
    )
)

if defined PRISM_EXE (
    echo [OK] PrismLauncher found: %PRISM_EXE%
    echo.
    goto :setup_instance
)

echo [INSTALL] PrismLauncher not found. Downloading portable version...
echo.

REM Download PrismLauncher portable ZIP
set PRISM_URL=https://github.com/PrismLauncher/PrismLauncher/releases/latest/download/PrismLauncher-Windows-MSVC-Portable-8.4.zip
set PRISM_ZIP=%~dp0PrismLauncher-Portable.zip
set PRISM_DIR=%~dp0PrismLauncher

powershell -Command ^
  "try {" ^
  "  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12;" ^
  "  $latestUrl = 'https://api.github.com/repos/PrismLauncher/PrismLauncher/releases/latest';" ^
  "  $release = Invoke-RestMethod -Uri $latestUrl -UseBasicParsing;" ^
  "  $asset = $release.assets | Where-Object { $_.name -match 'Windows-MSVC-Portable.*\.zip$' -and $_.name -notmatch 'arm' } | Select-Object -First 1;" ^
  "  if ($asset) {" ^
  "    Write-Host ('  Downloading: ' + $asset.name);" ^
  "    Invoke-WebRequest -Uri $asset.browser_download_url -OutFile '%PRISM_ZIP%' -UseBasicParsing;" ^
  "  } else {" ^
  "    Write-Host 'ERROR: Could not find PrismLauncher download' -ForegroundColor Red;" ^
  "    exit 1;" ^
  "  }" ^
  "} catch {" ^
  "  Write-Host ('ERROR: ' + $_.Exception.Message) -ForegroundColor Red;" ^
  "  exit 1;" ^
  "}"

if not exist "%PRISM_ZIP%" (
    echo ERROR: Failed to download PrismLauncher.
    echo Please download manually from https://prismlauncher.org/download/
    pause
    exit /b 1
)

echo   Extracting PrismLauncher...
powershell -Command "Expand-Archive -Path '%PRISM_ZIP%' -DestinationPath '%PRISM_DIR%' -Force"
del "%PRISM_ZIP%" 2>nul

REM Find the exe — ZIP may extract into a subfolder
REM Use PowerShell for reliable recursive search with spaces in paths
for /f "delims=" %%F in ('powershell -Command "Get-ChildItem -Path '%PRISM_DIR%' -Filter 'prismlauncher.exe' -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty FullName"') do (
    set "PRISM_EXE=%%F"
    for %%D in ("%%~dpF.") do set "PRISM_DIR=%%~fD\"
)

if not defined PRISM_EXE (
    echo ERROR: PrismLauncher extraction failed.
    echo Check: %~dp0PrismLauncher\
    pause
    exit /b 1
)

REM Create portable.txt so PrismLauncher stores data next to itself
if not exist "%PRISM_DIR%portable.txt" (
    echo. > "%PRISM_DIR%portable.txt"
)

echo   [OK] PrismLauncher installed to: %PRISM_DIR%
echo.

:setup_instance
REM -------------------------------------------------------------------
REM Phase 2: Set up instance
REM -------------------------------------------------------------------
echo [SETUP] Preparing IridescentCraft instance...
echo.

REM Determine PrismLauncher data directory
set "PRISM_DATA=%AppData%\PrismLauncher"
if exist "%PRISM_DIR%portable.txt" (
    REM Portable mode — data is next to the exe
    set "PRISM_DATA=%PRISM_DIR%"
)
REM Also check parent dir for portable.txt (some ZIP structures)
for %%D in ("%PRISM_DIR%..") do (
    if exist "%%~fD\portable.txt" set "PRISM_DATA=%%~fD\"
)

set INSTANCE_DIR=%PRISM_DATA%\instances\IridescentCraft

REM Check if instance already exists
if exist "%INSTANCE_DIR%\instance.cfg" (
    echo   Instance already exists at: %INSTANCE_DIR%
    echo   Skipping setup.
    echo.
    goto :launch
)

REM Create instance directory structure
echo   Creating instance at: %INSTANCE_DIR%
mkdir "%INSTANCE_DIR%" 2>nul
mkdir "%INSTANCE_DIR%\minecraft" 2>nul
mkdir "%INSTANCE_DIR%\.minecraft" 2>nul

REM Copy instance metadata
copy /y "%~dp0instance.cfg" "%INSTANCE_DIR%\instance.cfg" >nul
copy /y "%~dp0mmc-pack.json" "%INSTANCE_DIR%\mmc-pack.json" >nul

REM Copy game files into the instance's minecraft folder
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
echo     1. Log in with your Microsoft account
echo     2. Select "IridescentCraft" from the instance list
echo     3. Click "Launch" — mods will download automatically
echo     4. First launch takes 5-15 minutes with 420+ mods
echo.

start "PrismLauncher" "%PRISM_EXE%"

echo PrismLauncher launched. You can close this window.
echo.
pause
