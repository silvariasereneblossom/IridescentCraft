@echo off
REM IridescentCraft Client Installer (Windows)
REM Builds a PrismLauncher-importable instance zip, then imports it.
REM PrismLauncher handles Forge download + mod downloads from .index metadata.
REM
REM Requirements:
REM   - Windows 10/11 (64-bit)
REM   - PrismLauncher installed (will help find/download if missing)
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
REM Phase 0: Ensure distribution files are available
REM -------------------------------------------------------------------
REM If run standalone (no config/ folder nearby), download from GitHub
set "DIST_DIR=%~dp0"

if not exist "%DIST_DIR%mods\.index" (
    echo [DOWNLOAD] Distribution files not found locally. Downloading from GitHub...
    echo.

    set "REPO_ZIP=%TEMP%\IridescentCraft-repo.zip"
    set "REPO_EXTRACT=%TEMP%\IridescentCraft-repo-extract"

    powershell -Command ^
      "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12;" ^
      "Write-Host '  Downloading repository...';" ^
      "Invoke-WebRequest -Uri 'https://github.com/silvariasereneblossom/IridescentCraft/archive/refs/heads/main.zip' -OutFile '%REPO_ZIP%' -UseBasicParsing;" ^
      "Write-Host '  Extracting...';" ^
      "if (Test-Path '%REPO_EXTRACT%') { Remove-Item '%REPO_EXTRACT%' -Recurse -Force };" ^
      "Expand-Archive -Path '%REPO_ZIP%' -DestinationPath '%REPO_EXTRACT%' -Force;" ^
      "Write-Host '  Done.'"

    if not exist "!REPO_EXTRACT!" (
        echo   ERROR: Download failed. Check your internet connection.
        echo.
        pause
        exit /b 1
    )

    REM Find the extracted client distribution folder
    for /f "delims=" %%D in ('dir /b /ad "!REPO_EXTRACT!"') do (
        set "DIST_DIR=!REPO_EXTRACT!\%%D\minecraft\distribution\client\"
    )

    if not exist "!DIST_DIR!mods\.index" (
        echo   ERROR: Could not find client distribution in downloaded repo.
        echo.
        pause
        exit /b 1
    )

    echo   [OK] Distribution files ready.
    echo.
)

REM -------------------------------------------------------------------
REM Phase 1: Build instance zip
REM -------------------------------------------------------------------
echo [BUILD] Assembling IridescentCraft instance package...
echo.

set "STAGING=%TEMP%\IridescentCraft-staging"
set "STAGE_MC=%STAGING%\.minecraft"
set "STAGE_MODS=%STAGING%\.minecraft\mods"
set "OUTPUT_ZIP=%TEMP%\IridescentCraft-instance.zip"

REM Clean previous staging
if exist "%STAGING%" rmdir /s /q "%STAGING%"
mkdir "%STAGING%"
mkdir "%STAGE_MC%"
mkdir "%STAGE_MODS%"

REM Write instance.cfg
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
) > "%STAGING%\instance.cfg"
echo   instance.cfg... OK

REM Write mmc-pack.json (tells PrismLauncher which MC + Forge to use)
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
) > "%STAGING%\mmc-pack.json"
echo   mmc-pack.json... OK

REM Copy game files from local distribution
if exist "%DIST_DIR%config" (
    xcopy /s /e /y /q "%DIST_DIR%config" "%STAGE_MC%\config\" >nul 2>&1
    echo   config... OK
)
if exist "%DIST_DIR%defaultconfigs" (
    xcopy /s /e /y /q "%DIST_DIR%defaultconfigs" "%STAGE_MC%\defaultconfigs\" >nul 2>&1
    echo   defaultconfigs... OK
)
if exist "%DIST_DIR%kubejs" (
    xcopy /s /e /y /q "%DIST_DIR%kubejs" "%STAGE_MC%\kubejs\" >nul 2>&1
    echo   kubejs... OK
)
if exist "%DIST_DIR%global_packs" (
    xcopy /s /e /y /q "%DIST_DIR%global_packs" "%STAGE_MC%\global_packs\" >nul 2>&1
    echo   global_packs... OK
)

REM Copy mod index (.pw.toml files — PrismLauncher downloads mods from these)
if exist "%DIST_DIR%mods\.index" (
    mkdir "%STAGE_MODS%\.index" 2>nul
    xcopy /s /e /y /q "%DIST_DIR%mods\.index" "%STAGE_MODS%\.index\" >nul 2>&1
    echo   mod index (.pw.toml)... OK
)

REM Copy custom JARs (coremods, patches — not in .index)
if exist "%DIST_DIR%mods\*.jar" (
    copy /y "%DIST_DIR%mods\*.jar" "%STAGE_MODS%\" >nul 2>&1
    echo   custom JARs... OK
)

echo.
echo   [OK] Instance package assembled.
echo.

REM -------------------------------------------------------------------
REM Phase 2: Zip it
REM -------------------------------------------------------------------
echo [ZIP] Creating importable archive...

if exist "%OUTPUT_ZIP%" del "%OUTPUT_ZIP%"
powershell -Command "Compress-Archive -Path '%STAGING%\*' -DestinationPath '%OUTPUT_ZIP%' -Force"

if not exist "%OUTPUT_ZIP%" (
    echo   ERROR: Failed to create zip.
    pause
    exit /b 1
)

for /f %%S in ('powershell -Command "(Get-Item '%OUTPUT_ZIP%').Length / 1MB" ') do set "ZIP_SIZE=%%S"
echo   Created: %OUTPUT_ZIP% (%ZIP_SIZE% MB)
echo.

REM -------------------------------------------------------------------
REM Phase 3: Save dialog — let user choose where to save
REM -------------------------------------------------------------------
echo [SAVE] Choose where to save the instance zip...
echo.

REM Default to Desktop, offer save dialog
set "DEFAULT_SAVE=%USERPROFILE%\Desktop\IridescentCraft-instance.zip"
set "SAVE_PATH="

echo   Default save location: %DEFAULT_SAVE%
echo   Press Enter to save there, or type a custom path:
echo.
set /p "CUSTOM_PATH=  Path (or Enter for Desktop): "

if defined CUSTOM_PATH (
    set "SAVE_PATH=!CUSTOM_PATH!"
) else (
    set "SAVE_PATH=%DEFAULT_SAVE%"
)

copy /y "%OUTPUT_ZIP%" "%SAVE_PATH%" >nul 2>&1
if not exist "%SAVE_PATH%" (
    echo   ERROR: Failed to save to %SAVE_PATH%
    echo   The zip is still at: %OUTPUT_ZIP%
    echo.
    goto :import_instructions
)
echo   Saved to: %SAVE_PATH%
echo.

REM -------------------------------------------------------------------
REM Phase 4: Try to auto-import via PrismLauncher CLI
REM -------------------------------------------------------------------
set PRISM_EXE=

REM Check common install locations
for %%P in (
    "%LocalAppData%\Programs\PrismLauncher\prismlauncher.exe"
    "%ProgramFiles%\PrismLauncher\prismlauncher.exe"
    "%ProgramFiles(x86)%\PrismLauncher\prismlauncher.exe"
    "%LocalAppData%\PrismLauncher\prismlauncher.exe"
    "%AppData%\PrismLauncher\prismlauncher.exe"
) do (
    if exist "%%~P" set "PRISM_EXE=%%~P"
)

if not defined PRISM_EXE (
    where prismlauncher.exe >nul 2>&1
    if !errorlevel! equ 0 (
        for /f "delims=" %%P in ('where prismlauncher.exe') do set "PRISM_EXE=%%P"
    )
)

if defined PRISM_EXE (
    echo [IMPORT] Launching PrismLauncher with instance import...
    echo.
    if defined SAVE_PATH (
        start "" "%PRISM_EXE%" --import "%SAVE_PATH%"
    ) else (
        start "" "%PRISM_EXE%" --import "%OUTPUT_ZIP%"
    )
    echo   PrismLauncher should open with the import dialog.
    echo   Click OK to import, then launch the instance.
    echo.
    echo   First launch will download Forge + ~420 mods.
    echo   This takes 5-15 minutes depending on your internet.
    echo.
    goto :done
)

:import_instructions
echo ===================================================================
echo   HOW TO IMPORT:
echo ===================================================================
echo.
echo   1. Open PrismLauncher
echo   2. Click "Add Instance" (top left)
echo   3. Select "Import" tab
echo   4. Browse to the zip file:
if defined SAVE_PATH (
    echo      %SAVE_PATH%
) else (
    echo      %OUTPUT_ZIP%
)
echo   5. Click OK
echo   6. PrismLauncher will download Forge + all mods automatically
echo   7. Add your Minecraft account in Settings if needed
echo   8. Launch!
echo.
echo   First launch takes 5-15 minutes (Forge + 420 mods).
echo.

:done
REM Cleanup staging and downloaded repo
rmdir /s /q "%STAGING%" 2>nul
if defined REPO_EXTRACT rmdir /s /q "%REPO_EXTRACT%" 2>nul
if defined REPO_ZIP del "%REPO_ZIP%" 2>nul

echo Done! You can close this window.
echo.
pause
