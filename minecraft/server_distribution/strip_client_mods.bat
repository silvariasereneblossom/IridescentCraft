@echo off
title IridescentCraft — Strip Client/Crash Mods
echo.
powershell -Command ^
  "Add-Type -MemberDefinition '[DllImport(\"kernel32.dll\")]public static extern bool SetConsoleMode(IntPtr h,int m);[DllImport(\"kernel32.dll\")]public static extern IntPtr GetStdHandle(int h);' -Name W -Namespace C;" ^
  "$h=[C.W]::GetStdHandle(-11);[C.W]::SetConsoleMode($h,7)|Out-Null;" ^
  "$B=\"$([char]27)[38;2;91;206;250m\";$P=\"$([char]27)[38;2;245;169;184m\";$W=\"$([char]27)[38;2;255;255;255m\";$R=\"$([char]27)[0m\";" ^
  "[Console]::Write(\"${B}  ==========================================${R}`n\");" ^
  "[Console]::Write(\"${P}  IridescentCraft: Strip Client-Only Mods${R}`n\");" ^
  "[Console]::Write(\"${W}  Server Utility${R}`n\");" ^
  "[Console]::Write(\"${P}  Iridescent Edition${R}`n\");" ^
  "[Console]::Write(\"${B}  ==========================================${R}`n\")"
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

REM --- Disabled mods that may linger from manual copies ---
call :delete "*gh_classes*"
call :delete "*champions*"
REM --- Removed FTB mods ---
call :delete "*ftbbackups*"
call :delete "*ftbchunks*"
call :delete "*ftbessentials*"
call :delete "*ftblibrary*"
call :delete "*ftbquests*"
call :delete "*ftbranks*"
call :delete "*ftbteams*"
call :delete "*ftbultimine*"
call :delete "*mca-social*"
call :delete "*mcasocial*"

REM --- Removed mods (worldgen crash) ---
call :delete "*cherryvillage*"
call :delete "*CherryVillage*"

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
