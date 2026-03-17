@echo off
title IridescentCraft — Strip Client/Crash Mods
echo.
echo ==========================================
echo   IridescentCraft: Strip Client-Only Mods
echo ==========================================
echo.
echo This script removes mods from mods\ that are known to crash
echo or serve no purpose on a dedicated server.
echo.

if not exist "mods\" (
    echo ERROR: mods\ folder not found. Run this from the server root.
    pause
    exit /b 1
)

set removed=0

REM --- Rendering / client-only mods that crash on dedicated server ---
call :delete "embeddium*"
call :delete "oculus*"
call :delete "immediatelyfast*"
call :delete "*rubidium-extra*"

REM --- Client GUI / display mods ---
call :delete "*kubejsoffline*"
call :delete "*light-overlay*"
call :delete "*equipment-compare*"
call :delete "*EquipmentCompare*"
call :delete "*chat_heads*"
call :delete "*BetterAnimations*"
call :delete "*transmog*"

REM --- Dev tools that crash on server ---
call :delete "*probejs*"
call :delete "*ProbeJS*"

REM --- References client classes ---
call :delete "*irons_spells_js*"

REM --- Removed mods (SuperMartijn642 lib incompatibility) ---
call :delete "*rechiseled*"
call :delete "*supermartijn642*"
call :delete "*connectedglass*"
call :delete "*trashcans*"

REM --- Client-side-only mods (side='client' in metadata) ---
call :delete "*auudio*"
call :delete "*BetterAdvancements*"
call :delete "*biomemusic*"
call :delete "*CTM-*"
call :delete "*CutThrough*"
call :delete "*fallingleaves*"
call :delete "*Highlighter*"
call :delete "*inventoryhud*"
call :delete "*jeed-*"
call :delete "*jmi-forge*"
call :delete "*lazyDFU*"
call :delete "*libIPN*"
call :delete "*MouseTweaks*"
call :delete "*Prism-*"

echo.
echo Removed %removed% mod file(s).
echo.
pause
exit /b 0

:delete
for %%F in ("mods\%~1") do (
    if exist "%%F" (
        echo   Removing: %%~nxF
        del "%%F"
        set /a removed+=1
    )
)
exit /b
