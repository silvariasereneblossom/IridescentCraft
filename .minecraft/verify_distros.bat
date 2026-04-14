@echo off
REM =============================================================================
REM IridescentCraft Distribution Verification
REM =============================================================================
REM Checks that all critical files exist in server_distribution/ and
REM distribution/client/ with matching sizes. Run before pushing.
REM =============================================================================

setlocal enabledelayedexpansion
set "ERRORS=0"
set "SCRIPT_DIR=%~dp0"
if "!SCRIPT_DIR:~-1!"=="\" set "SCRIPT_DIR=!SCRIPT_DIR:~0,-1!"

echo [Verify] Checking distribution sync...

for %%D in (server_distribution distribution\client) do (
    echo.
    echo   --- %%D ---

    REM Paxi datapacks
    for %%Z in (
        iridescent_codex.zip
        icraft_skills.zip
        icraft_apotheosis_affixes.zip
        icraft_botania_overrides.zip
        icraft_tetra_materials.zip
        icraft_tetra_overrides.zip
        icraft_aethersteel_overrides.zip
        icraft_progdiff_overrides.zip
        improvedmobs_datapack.zip
        icraft_loot_overrides.zip
        icraft_dungeon_crawl_overrides.zip
    ) do (
        if exist "!SCRIPT_DIR!\config\paxi\datapacks\%%Z" (
            if not exist "!SCRIPT_DIR!\%%D\config\paxi\datapacks\%%Z" (
                echo   MISSING: %%D\config\paxi\datapacks\%%Z
                set /a ERRORS+=1
            )
        )
    )

    REM Custom JARs
    for %%J in (
        iridescent_codex_data.jar
        iridescent_origins-1.0.0.jar
        offlineskins-1.20.1-v1.jar
        Patchouli-1.20.1-85-FORGE.jar
    ) do (
        if exist "!SCRIPT_DIR!\mods\%%J" (
            if not exist "!SCRIPT_DIR!\%%D\mods\%%J" (
                echo   MISSING: %%D\mods\%%J
                set /a ERRORS+=1
            )
        )
    )

    REM Critical KubeJS scripts
    for %%S in (
        kubejs\server_scripts\loot\lootjs_overhaul.js
        kubejs\server_scripts\gates\milestone_detection.js
        kubejs\server_scripts\gates\astages_restrictions.js
        kubejs\server_scripts\scaling\mob_scaling_unified.js
        kubejs\server_scripts\death_penalty.js
        kubejs\data\forge\loot_modifiers\global_loot_modifiers.json
    ) do (
        if exist "!SCRIPT_DIR!\%%S" (
            if not exist "!SCRIPT_DIR!\%%D\%%S" (
                echo   MISSING: %%D\%%S
                set /a ERRORS+=1
            )
        )
    )

    REM Critical configs
    for %%C in (
        config\dungeon_crawl.toml
        config\lootr-common.toml
        config\tectonic.json
        config\sereneseasons\seasons.toml
        config\everydayxp\rpgseteffects\rpgseteffects.toml
        config\chunky\config.json
        config\paxi\datapack_load_order.json
    ) do (
        if exist "!SCRIPT_DIR!\%%C" (
            if not exist "!SCRIPT_DIR!\%%D\%%C" (
                echo   MISSING: %%D\%%C
                set /a ERRORS+=1
            )
        )
    )
)

echo.
if !ERRORS! GTR 0 (
    echo [Verify] FAILED: !ERRORS! file(s) missing
    echo [Verify] Run sync or copy the missing files to fix.
    exit /b 1
) else (
    echo [Verify] All critical files present.
    exit /b 0
)
