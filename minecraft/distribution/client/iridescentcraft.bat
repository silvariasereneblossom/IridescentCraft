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
set PRISM_DIR=

REM Check common install locations
for %%P in (
    "%LocalAppData%\Programs\PrismLauncher\prismlauncher.exe"
    "%ProgramFiles%\PrismLauncher\prismlauncher.exe"
    "%ProgramFiles(x86)%\PrismLauncher\prismlauncher.exe"
    "%~dp0PrismLauncher\prismlauncher.exe"
    "%LocalAppData%\PrismLauncher\prismlauncher.exe"
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

REM Search common user folders as last resort
if not defined PRISM_EXE (
    for /f "delims=" %%F in ('powershell -Command "Get-ChildItem -Path $env:LOCALAPPDATA,$env:APPDATA,$env:USERPROFILE -Filter 'prismlauncher.exe' -Recurse -Depth 4 -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty FullName" 2^>nul') do (
        set "PRISM_EXE=%%F"
        for %%D in ("%%~dpF.") do set "PRISM_DIR=%%~fD\"
    )
)

if defined PRISM_EXE (
    echo [OK] PrismLauncher found: %PRISM_EXE%
    echo.
    goto :setup_instance
)

REM Ask user to locate it manually
echo   PrismLauncher not found in standard locations.
echo   If you already have it installed, enter the path to prismlauncher.exe
echo   or press Enter to download a fresh portable copy.
echo.
set /p "USER_PRISM=  Path (or Enter to download): "
if defined USER_PRISM (
    if exist "!USER_PRISM!" (
        set "PRISM_EXE=!USER_PRISM!"
        for %%D in ("!USER_PRISM!") do set "PRISM_DIR=%%~dpD"
        echo [OK] Using: !PRISM_EXE!
        echo.
        goto :setup_instance
    ) else (
        echo   File not found: !USER_PRISM!
        echo   Downloading fresh copy instead...
        echo.
    )
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
REM Priority: portable.txt next to exe > portable.txt in parent > %AppData%
set "PRISM_DATA="

REM Check portable mode — portable.txt next to prismlauncher.exe
if exist "%PRISM_DIR%portable.txt" (
    set "PRISM_DATA=%PRISM_DIR%"
)
REM Check parent dir for portable.txt (ZIP subfolder structures)
if not defined PRISM_DATA (
    for %%D in ("%PRISM_DIR%..") do (
        if exist "%%~fD\portable.txt" set "PRISM_DATA=%%~fD\"
    )
)
REM Fall back to %AppData%\PrismLauncher
if not defined PRISM_DATA (
    set "PRISM_DATA=%AppData%\PrismLauncher"
)

REM Find the actual instances directory
REM Try multiple known locations until we find one that exists
set "INSTANCES_DIR="

REM 1. Check prismlauncher.cfg for custom InstanceDir
for %%C in ("%PRISM_DATA%\prismlauncher.cfg" "%PRISM_DIR%prismlauncher.cfg") do (
    if exist "%%~C" (
        for /f "usebackq tokens=1,* delims==" %%A in ("%%~C") do (
            if "%%A"=="InstanceDir" (
                if not "%%B"=="" (
                    if exist "%%B" set "INSTANCES_DIR=%%B"
                )
            )
        )
    )
)

REM 2. Check standard locations
if not defined INSTANCES_DIR (
    if exist "%PRISM_DATA%\instances" (
        set "INSTANCES_DIR=%PRISM_DATA%\instances"
    ) else if exist "%AppData%\PrismLauncher\instances" (
        set "INSTANCES_DIR=%AppData%\PrismLauncher\instances"
    ) else if exist "%LocalAppData%\PrismLauncher\instances" (
        set "INSTANCES_DIR=%LocalAppData%\PrismLauncher\instances"
    ) else (
        REM Create default location
        set "INSTANCES_DIR=%PRISM_DATA%\instances"
        mkdir "%PRISM_DATA%\instances" 2>nul
    )
)

echo   PrismLauncher data: %PRISM_DATA%
echo   Instances folder: %INSTANCES_DIR%

set "INSTANCE_DIR=%INSTANCES_DIR%\IridescentCraft"

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
mkdir "%INSTANCE_DIR%\.minecraft" 2>nul

REM Copy instance metadata
copy /y "%~dp0instance.cfg" "%INSTANCE_DIR%\instance.cfg" >nul
copy /y "%~dp0mmc-pack.json" "%INSTANCE_DIR%\mmc-pack.json" >nul

REM Copy game files into the instance's .minecraft folder
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

REM Register instance in instgroups.json if it doesn't exist
if not exist "%INSTANCES_DIR%\instgroups.json" (
    echo {"formatVersion":1,"groups":{}} > "%INSTANCES_DIR%\instgroups.json"
)

echo.
echo   [OK] Instance created at: %INSTANCE_DIR%
echo   PrismLauncher will download mods on first launch.
echo.
echo   If the instance doesn't appear, try closing and reopening PrismLauncher.
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
