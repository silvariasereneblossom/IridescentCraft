@echo off
REM IridescentCraft Server Installation Script (Windows)
REM STANDALONE — works without the rest of the modpack repo.
REM
REM This script:
REM   1. Checks for Java 17
REM   2. Runs the included Forge installer
REM   3. Downloads all server-side mods from .pw.toml metadata
REM   4. Everything else (config, kubejs, defaultconfigs, global_packs) is already included
REM
REM Usage: Double-click server_install.bat
REM After running, use start.bat to launch the server.

title IridescentCraft Server Installer
setlocal enabledelayedexpansion

set FORGE_VERSION=1.20.1-47.4.0
set FORGE_INSTALLER=forge-%FORGE_VERSION%-installer.jar

echo ==========================================
echo   IridescentCraft Server Installer
echo   Forge %FORGE_VERSION%
echo   Standalone Edition
echo ==========================================
echo.

REM -------------------------------------------------------------------
REM Step 1: Check Java 17
REM -------------------------------------------------------------------
echo [1/4] Checking Java installation...
java -version >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Java not found. Please install Java 17.
    echo Download from: https://adoptium.net/
    pause
    exit /b 1
)
echo   Java found.

REM -------------------------------------------------------------------
REM Step 2: Install Forge
REM -------------------------------------------------------------------
echo.
echo [2/4] Setting up Forge server...

if exist "libraries\net\minecraftforge\forge\%FORGE_VERSION%" (
    echo   Forge libraries already present, skipping installation.
) else (
    if exist "%FORGE_INSTALLER%" (
        echo   Found Forge installer.
    ) else (
        echo ERROR: Forge installer not found.
        echo Please ensure %FORGE_INSTALLER% is in this directory.
        pause
        exit /b 1
    )

    echo   Running Forge installer (--installServer)...
    java -jar "%FORGE_INSTALLER%" --installServer
    echo   Forge installed successfully.
)

REM -------------------------------------------------------------------
REM Step 3: Download mods from .pw.toml metadata
REM -------------------------------------------------------------------
echo.
echo [3/4] Downloading mods...

if not exist "mods\.index" (
    echo ERROR: mods\.index\ directory not found.
    echo This folder should contain .pw.toml metadata files.
    pause
    exit /b 1
)

if not exist mods mkdir mods

set DOWNLOADED=0
set SKIPPED_CLIENT=0
set SKIPPED_EXISTS=0
set FAILED=0

for %%t in (mods\.index\*.pw.toml) do (
    set "FILENAME="
    set "SIDE="
    set "MODE="
    set "URL="
    set "PROJECT_ID="
    set "FILE_ID="

    REM Parse the TOML file line by line
    for /f "usebackq tokens=1,* delims==" %%a in ("%%t") do (
        set "KEY=%%a"
        set "VAL=%%b"

        REM Trim spaces from key
        for /f "tokens=*" %%k in ("!KEY!") do set "KEY=%%k"

        REM Handle each field
        if "!KEY!"=="filename " (
            set "VAL=!VAL: =!"
            set "VAL=!VAL:'=!"
            set "FILENAME=!VAL!"
        )
        if "!KEY!"=="filename" (
            set "VAL=!VAL: =!"
            set "VAL=!VAL:'=!"
            set "FILENAME=!VAL!"
        )
        if "!KEY!"=="side " (
            set "VAL=!VAL: =!"
            set "VAL=!VAL:'=!"
            set "SIDE=!VAL!"
        )
        if "!KEY!"=="side" (
            set "VAL=!VAL: =!"
            set "VAL=!VAL:'=!"
            set "SIDE=!VAL!"
        )
        if "!KEY!"=="mode " (
            set "VAL=!VAL: =!"
            set "VAL=!VAL:'=!"
            set "MODE=!VAL!"
        )
        if "!KEY!"=="mode" (
            set "VAL=!VAL: =!"
            set "VAL=!VAL:'=!"
            set "MODE=!VAL!"
        )
        if "!KEY!"=="url " (
            set "VAL=!VAL: =!"
            set "VAL=!VAL:'=!"
            set "URL=!VAL!"
        )
        if "!KEY!"=="url" (
            set "VAL=!VAL: =!"
            set "VAL=!VAL:'=!"
            set "URL=!VAL!"
        )
        if "!KEY!"=="project-id " (
            set "VAL=!VAL: =!"
            set "PROJECT_ID=!VAL!"
        )
        if "!KEY!"=="project-id" (
            set "VAL=!VAL: =!"
            set "PROJECT_ID=!VAL!"
        )
        if "!KEY!"=="file-id " (
            set "VAL=!VAL: =!"
            set "FILE_ID=!VAL!"
        )
        if "!KEY!"=="file-id" (
            set "VAL=!VAL: =!"
            set "FILE_ID=!VAL!"
        )
    )

    REM Skip client-only mods (by metadata or force-exclude list)
    REM Embeddium is marked 'both' but is a rendering mod that crashes headless servers
    set "FORCE_SKIP=0"
    echo !FILENAME! | findstr /i "embeddium" >nul 2>&1
    if !errorlevel! equ 0 set "FORCE_SKIP=1"

    if "!SIDE!"=="client" (
        set /a SKIPPED_CLIENT+=1
    ) else if "!FORCE_SKIP!"=="1" (
        set /a SKIPPED_CLIENT+=1
    ) else (
        REM Skip if already downloaded
        if exist "mods\!FILENAME!" (
            set /a SKIPPED_EXISTS+=1
        ) else if "!FILENAME!"=="" (
            echo   WARNING: No filename in %%t
            set /a FAILED+=1
        ) else (
            REM Determine download URL
            set "DOWNLOAD_URL="

            if "!MODE!"=="url" (
                if not "!URL!"=="" (
                    set "DOWNLOAD_URL=!URL!"
                )
            )
            if "!MODE!"=="metadata:curseforge" (
                if not "!PROJECT_ID!"=="" if not "!FILE_ID!"=="" (
                    set "DOWNLOAD_URL=https://www.curseforge.com/api/v1/mods/!PROJECT_ID!/files/!FILE_ID!/download"
                )
            )

            if "!DOWNLOAD_URL!"=="" (
                echo   WARNING: No download URL for !FILENAME!
                set /a FAILED+=1
            ) else (
                echo   Downloading: !FILENAME!
                powershell -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; (New-Object Net.WebClient).DownloadFile('!DOWNLOAD_URL!', 'mods\!FILENAME!')" >nul 2>&1
                if exist "mods\!FILENAME!" (
                    set /a DOWNLOADED+=1
                ) else (
                    echo     FAILED to download !FILENAME!
                    set /a FAILED+=1
                )
            )
        )
    )
)

echo.
echo   Downloaded: !DOWNLOADED! mods
echo   Skipped (client-only): !SKIPPED_CLIENT! mods
echo   Skipped (already present): !SKIPPED_EXISTS! mods
if !FAILED! gtr 0 (
    echo   Failed: !FAILED! mods (check warnings above)
)

REM -------------------------------------------------------------------
REM Step 4: Final setup
REM -------------------------------------------------------------------
echo.
echo [4/4] Final setup...

echo.
echo ==========================================
echo   Installation complete!
echo ==========================================
echo.
echo To start the server: double-click start.bat
echo.
echo The server will listen on port 25565 by default.
echo Edit server.properties to change settings.
echo.
echo IMPORTANT: First startup will take 5-15 minutes with 420+ mods.
echo Wait until you see 'Done' in the console before connecting.
echo.
if !FAILED! gtr 0 (
    echo WARNING: !FAILED! mod(s) failed to download. You may need to
    echo download them manually. Check the warnings above for details.
    echo.
)
pause
