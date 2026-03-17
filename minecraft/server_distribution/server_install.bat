@echo off
REM IridescentCraft Server Installation Script (Windows)
REM Automates Forge 1.20.1-47.4.0 server setup
REM
REM Usage: Double-click server_install.bat
REM After running, use start.bat to launch the server.

title IridescentCraft Server Installer
setlocal enabledelayedexpansion

set FORGE_VERSION=1.20.1-47.4.0
set FORGE_INSTALLER=forge-%FORGE_VERSION%-installer.jar
set SCRIPT_DIR=%~dp0
set PACK_DIR=%SCRIPT_DIR%..

echo ==========================================
echo   IridescentCraft Server Installer
echo   Forge %FORGE_VERSION%
echo ==========================================
echo.

REM -------------------------------------------------------------------
REM Step 0: Check Java 17
REM -------------------------------------------------------------------
echo [1/5] Checking Java installation...
java -version >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Java not found. Please install Java 17.
    echo Download from: https://adoptium.net/
    pause
    exit /b 1
)
echo   Java found.

REM -------------------------------------------------------------------
REM Step 1: Install Forge
REM -------------------------------------------------------------------
echo.
echo [2/5] Setting up Forge server...

if exist "libraries\net\minecraftforge\forge\%FORGE_VERSION%" (
    echo   Forge libraries already present, skipping installation.
) else (
    if exist "%SCRIPT_DIR%%FORGE_INSTALLER%" (
        echo   Found Forge installer in distribution folder.
        if not "%SCRIPT_DIR%"=="%CD%\" copy "%SCRIPT_DIR%%FORGE_INSTALLER%" ".\%FORGE_INSTALLER%" >nul
    ) else if exist ".\%FORGE_INSTALLER%" (
        echo   Found Forge installer in current directory.
    ) else (
        echo ERROR: Forge installer not found.
        echo Please ensure %FORGE_INSTALLER% is in this directory.
        pause
        exit /b 1
    )

    echo   Running Forge installer (--installServer)...
    java -jar ".\%FORGE_INSTALLER%" --installServer
    echo   Forge installed successfully.
)

REM -------------------------------------------------------------------
REM Step 2: Copy mods (excluding client-only)
REM -------------------------------------------------------------------
echo.
echo [3/5] Setting up mods...

set MODS_SOURCE=
if exist "%PACK_DIR%\mods" (
    set MODS_SOURCE=%PACK_DIR%\mods
    echo   Found modpack mods directory.
) else (
    echo   Could not find modpack mods directory.
    echo   Please enter the full path to your IridescentCraft\minecraft\ directory:
    set /p MODS_SOURCE=
    set MODS_SOURCE=!MODS_SOURCE!\mods
    set PACK_DIR=!MODS_SOURCE!\..
)

if not exist mods mkdir mods

REM Read client-only mods from static list
set COPIED=0
set SKIPPED=0

REM Copy all jars, skip client-only ones from the exclusion list
for %%f in ("%MODS_SOURCE%\*.jar") do (
    set SKIP=0
    set BASENAME=%%~nxf

    REM Check against known client-only mods
    echo !BASENAME! | findstr /i "oculus embeddium ImmediatelyFast fallingleaves MouseTweaks BetterAdvancements inventoryhud jeed lazyDFU libIPN Prism rubidium-extra CTM CutThrough decorative_lgbt Highlighter auudio biomemusic jmi EquipmentCompare" >nul
    if !errorlevel! equ 0 (
        set SKIP=1
        set /a SKIPPED+=1
    )

    if !SKIP! equ 0 (
        copy "%%f" "mods\%%~nxf" >nul
        set /a COPIED+=1
    )
)

echo   Copied !COPIED! mods, skipped !SKIPPED! client-only mods.

REM -------------------------------------------------------------------
REM Step 3: Copy config, kubejs, defaultconfigs, global_packs
REM -------------------------------------------------------------------
echo.
echo [4/5] Copying configuration files...

for %%d in (config kubejs defaultconfigs global_packs) do (
    if exist "%PACK_DIR%\%%d" (
        echo   Copying %%d\...
        xcopy "%PACK_DIR%\%%d" ".\%%d" /E /I /Y /Q >nul
    ) else (
        echo   WARNING: %%d not found, skipping.
    )
)

REM Remove client-side configs not needed on server
if exist ".\config\oculus" rmdir /s /q ".\config\oculus" 2>nul
del ".\config\immediatelyfast.json" 2>nul

REM -------------------------------------------------------------------
REM Step 4: Final setup
REM -------------------------------------------------------------------
echo.
echo [5/5] Final setup...

if exist "%SCRIPT_DIR%eula.txt" (
    copy "%SCRIPT_DIR%eula.txt" ".\eula.txt" >nul
)
if exist "%SCRIPT_DIR%server.properties" (
    copy "%SCRIPT_DIR%server.properties" ".\server.properties" >nul
)

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
pause
