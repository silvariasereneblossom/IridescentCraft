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

REM Jar-name patterns a dedicated server must never keep: the pack's client-only
REM mods and retired mods. The reason for each one is in the pack repository:
REM .minecraft\dev\mods\mod_index.policy.json
REM >>> mod_index.py: bat-delete (GENERATED from mods/.index + dev/mods/mod_index.policy.json. Do not edit: run mod_index.py generate)
call :delete "*embeddium*"
call :delete "*oculus*"
call :delete "*immediatelyfast*"
call :delete "*rubidium-extra*"
call :delete "*kubejsoffline*"
call :delete "*light-overlay*"
call :delete "*equipment-compare*"
call :delete "*chat_heads*"
call :delete "*BetterAnimations*"
call :delete "*transmog*"
call :delete "*probejs*"
call :delete "*irons_spells_js*"
call :delete "*gh_classes*"
call :delete "*cherryvillage*"
call :delete "*rechiseled*"
call :delete "*supermartijn642*"
call :delete "*connectedglass*"
call :delete "*trashcans*"
call :delete "*ftbbackups*"
call :delete "*ftbchunks*"
call :delete "*ftbessentials*"
call :delete "*ftblibrary*"
call :delete "*ftbquests*"
call :delete "*ftbranks*"
call :delete "*ftbteams*"
call :delete "*ftbultimine*"
call :delete "*mca-social*"
call :delete "*starlight*"
call :delete "*EquipmentCompare*"
call :delete "*mcasocial*"
call :delete "*champions*"
call :delete "*soulslike-weaponry*"
call :delete "*AmbientSounds_*"
call :delete "*athena-*"
call :delete "*auudio_*"
call :delete "*BadOptimizations-*"
call :delete "*BEB-*"
call :delete "*BetterAdvancements-*"
call :delete "*biomemusic-*"
call :delete "*configured-*"
call :delete "*Controlling-*"
call :delete "*CTM-*"
call :delete "*CutThrough-*"
call :delete "*defaultoptions-*"
call :delete "*EnchantmentDescriptions-*"
call :delete "*entity_model_features_*"
call :delete "*entity_texture_features_*"
call :delete "*entityculling-*"
call :delete "*fallingleaves-*"
call :delete "*Highlighter-*"
call :delete "*inventoryhud.*"
call :delete "*jeed-*"
call :delete "*jmi-*"
call :delete "*JustEnoughMekanismMultiblocks-*"
call :delete "*mek_walkable_cables-*"
call :delete "*MouseTweaks-*"
call :delete "*OverflowingBars-*"
call :delete "*Prism-*"
call :delete "*Searchables-*"
call :delete "*ToolStats-*"
call :delete "*TravelersTitles-*"
call :delete "*treasuredistance-*"
REM <<< mod_index.py

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
