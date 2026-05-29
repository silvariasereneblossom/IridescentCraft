@echo off
title IridescentCraft Dev Client Sync
setlocal enabledelayedexpansion

REM ============================================================================
REM dev_sync_from_repo.bat
REM
REM Dev-machine pre-launch sync from the local IridescentCraft repo into the
REM PrismLauncher instance's .minecraft. Mirrors the server's sync_from_repo.bat
REM pattern (robocopy /MIR + explicit mod jar sync + custom-jar whitelist
REM cleanup) but with client-side exclusions (user prefs + runtime dirs).
REM
REM Why not git pull on the instance?
REM   The instance dir is a git checkout, but the working tree accumulates
REM   dirty runtime files (configs, log gzips, mixin output, JEI bookmarks)
REM   that make `git pull --ff-only` and the autostash-rebase fallback both
REM   fail silently. Result: instance freezes at whatever commit it was on
REM   the day the first dirty config landed, and new jars never sync.
REM
REM Why not sync_client.ps1?
REM   That path downloads a GitHub zip and overlays. Fine for testers but
REM   wasteful when the operator already has a local checkout that's
REM   git-pulled by their normal dev workflow. Also has a remove-then-copy
REM   data-loss bug (#42) we're side-stepping until that's fixed.
REM
REM Source: dev repo's published client distribution
REM Dest:   the PrismLauncher instance's .minecraft (this script's dir)
REM
REM Until the pack is publicly distributed, wire this as PrismLauncher's
REM PreLaunchCommand for the dev workstation. After publication, switch to
REM sync_client.bat (zip overlay) for distributable testers.
REM ============================================================================

set "REPO=C:\Users\silvariazemaitis\IridescentcraftDev\IridescentCraft\.minecraft\distribution\client"
set "LOCAL=%~dp0"
if "!LOCAL:~-1!"=="\" set "LOCAL=!LOCAL:~0,-1!"

echo.
echo [dev-sync] Source: %REPO%
echo [dev-sync] Dest:   %LOCAL%
echo.

if not exist "%REPO%" (
    echo [dev-sync] ERROR: dev repo not found at %REPO%
    echo [dev-sync]        Check that the repo path is mounted/cloned, then
    echo [dev-sync]        re-launch. Continuing with current instance state.
    endlocal
    exit /b 0
)

REM ----------------------------------------------------------------------------
REM Phase 1: per-subdir /MIR for ONLY pack-managed dirs
REM
REM Earlier draft did /MIR at the root with /XD exclusions. That deletes ANY
REM root-level dir in the instance that isn't in the pack source -- including
REM unpredictable per-mod state dirs (.boss_checklist_data, .probe, NVIDIA,
REM voicechat caches, etc.). Lost .boss_checklist_data on first dev-sync run
REM 2026-05-28. Lesson: client has WAY more user state at root than server.
REM
REM New approach: /MIR each pack-managed subdir explicitly. Everything else
REM at root of the instance .minecraft is left untouched.
REM
REM Per-subdir /MIR still uses /XF to preserve user-pref files INSIDE those
REM dirs (e.g., config\voicechat\voicechat-client.properties is user-only).
REM
REM Pack-managed dirs we /MIR:
REM   config\          -- mod configs we ship
REM   defaultconfigs\  -- Forge default fallback configs
REM   kubejs\          -- KubeJS scripts (recipes, events, server scripts)
REM   shaderpacks\     -- shipped shaders
REM ----------------------------------------------------------------------------
echo [dev-sync] Phase 1: /MIR pack-managed subdirs (config, defaultconfigs, kubejs, shaderpacks)...
set ROBOCOPY_EXIT=0
REM /XD libraries: KubeJS auto-downloads native libs into kubejs/libraries/
REM   at boot. Re-deleting them every sync forces a redownload at next launch
REM   (wasteful startup-time penalty). Same /XD applies broadly enough to
REM   skip any "libraries/" subtree under config/ too if a mod uses that
REM   convention.
REM /XD world: some packs ship example worlds; the live save lives under
REM   the same name in saves/ and isn't reached by per-subdir scan anyway,
REM   but be defensive.
for %%D in (config defaultconfigs kubejs shaderpacks) do (
    if exist "%REPO%\%%D" (
        if not exist "%LOCAL%\%%D" mkdir "%LOCAL%\%%D"
        robocopy "%REPO%\%%D" "%LOCAL%\%%D" /MIR /MT:4 /NJH /NJS /NDL /NP ^
            /XD libraries world ^
            /XF "voicechat-client.properties" "voicechat-microphone-test.ogg" "bookmarks.ini" "lookupHistory.ini" "cached.dat" "indigo-renderer.properties" "packetfixer.properties" "oculus.properties" "libraryferret_*.properties" "*-client.properties" "*.local"
        if errorlevel 8 set /a ROBOCOPY_EXIT=8
        echo   %%D: synced
    )
)

REM Phase 1b: per-file copy for root-level scripts + pack-config files that
REM ship in the dev repo. Plain Copy-Item (no /MIR delete) so user-added
REM files at root stay put.
echo.
echo [dev-sync] Phase 1b: refresh root-level scripts + pack files...
for %%F in (
    cleanup_stale_jars.ps1
    custom_jars_manifest.json
    download_mods.ps1
    install.ps1
    pack.toml
    sync_client.bat
    sync_client.ps1
    update_configs.bat
    update_configs.ps1
    update_configs.sh
    wire_instance_cfg.ps1
    dev_sync_from_repo.bat
) do (
    if exist "%REPO%\%%F" (
        copy /Y "%REPO%\%%F" "%LOCAL%\%%F" >nul
    )
)

REM ----------------------------------------------------------------------------
REM Phase 2: explicit mod jar sync (custom + bytecode-patched + perf-additions)
REM
REM Do NOT /MIR mods/. The instance has ~440+ packwiz-downloaded mods that
REM the dev repo's client distro doesn't ship inline. /MIR would purge them.
REM Instead:
REM   - Copy each .jar from repo's mods/ to instance mods/ (size-mismatch-only
REM     by default, robocopy skips identical files).
REM   - Mirror mods/.index (packwiz toml manifest) so update_mods sees the
REM     correct expected set.
REM ----------------------------------------------------------------------------
echo.
echo [dev-sync] Phase 2: custom + special jars from repo mods/ -> instance mods/...
if not exist "%LOCAL%\mods" mkdir "%LOCAL%\mods"
robocopy "%REPO%\mods" "%LOCAL%\mods" *.jar /NJH /NJS /NDL /NP

echo.
echo [dev-sync] Phase 2b: packwiz index mirror...
if exist "%REPO%\mods\.index" (
    if not exist "%LOCAL%\mods\.index" mkdir "%LOCAL%\mods\.index"
    robocopy "%REPO%\mods\.index" "%LOCAL%\mods\.index" /MIR /NJH /NJS /NDL /NP >nul
)

REM ----------------------------------------------------------------------------
REM Phase 3: packwiz downloads (fetch newly-added remote mods)
REM ----------------------------------------------------------------------------
if exist "%LOCAL%\download_mods.ps1" (
    echo.
    echo [dev-sync] Phase 3: download_mods.ps1...
    powershell -ExecutionPolicy Bypass -File "%LOCAL%\download_mods.ps1" -IndexDir "%LOCAL%\mods\.index" -ModsDir "%LOCAL%\mods"
    if errorlevel 1 (
        echo [dev-sync] WARNING: one or more packwiz mod downloads FAILED.
        echo [dev-sync] See "%LOCAL%\download_log.txt" for details.
    )
)

REM ----------------------------------------------------------------------------
REM Phase 4: cleanup stale mod jars (preserve custom + packwiz expected set)
REM
REM The hardcoded $customJars list MUST stay in sync with the custom JARs
REM shipped in distribution/client/mods/. When a new custom jar is added or
REM renamed upstream, update this list AND the matching list in
REM .minecraft/sync_from_repo.bat (server-side) and cleanup_stale_jars.ps1.
REM ----------------------------------------------------------------------------
echo.
echo [dev-sync] Phase 4: cleanup stale mod jars (preserve custom + packwiz)...
powershell -ExecutionPolicy Bypass -Command ^
    "$indexDir = '%LOCAL%\mods\.index';" ^
    "$modsDir = '%LOCAL%\mods';" ^
    "if (-not (Test-Path $indexDir)) { Write-Host '  no index dir; skipping'; exit };" ^
    "$expected = @{};" ^
    "Get-ChildItem $indexDir\*.pw.toml | ForEach-Object {" ^
    "  foreach ($line in Get-Content $_.FullName) {" ^
    "    if ($line -match '^\s*filename\s*=\s*[''\""](.+)[''\""]') { $expected[$matches[1]] = $true }" ^
    "  }" ^
    "};" ^
    "$customJars = @(" ^
    "  'iridescent_codex_data.jar', 'iridescent_origins-1.0.0.jar'," ^
    "  'iridescent_biomes-1.0.0.jar', 'iridescent_tetra_expansion-1.0.0.jar'," ^
    "  'iridescent_durability_clamp-0.1.0.jar', 'iridescent_difficulty-0.1.0.jar'," ^
    "  'justlevelingfork-1.2.1-iridescent.1.jar', 'mek_walkable_cables-1.0.1.jar'," ^
    "  'offlineskins-1.20.1-v1.jar', 'Patchouli-1.20.1-85-FORGE.jar'," ^
    "  'ars_nouveau-1.20.1-4.12.7-all.jar', 'class-artifacts-forge-2.0.5.jar'," ^
    "  'saturn-mc1.20.1-0.1.3.jar', 'async-locator-forge-1.20-1.3.0.jar'," ^
    "  'krypton-0.2.3.jar', 'noisium-forge-2.3.0+mc1.20-1.20.1.jar'" ^
    ");" ^
    "foreach ($c in $customJars) { $expected[$c] = $true };" ^
    "$removed = 0;" ^
    "Get-ChildItem $modsDir\*.jar -ErrorAction SilentlyContinue | ForEach-Object {" ^
    "  if (-not $expected.ContainsKey($_.Name)) {" ^
    "    Write-Host ('  removing stale: ' + $_.Name) -ForegroundColor DarkYellow;" ^
    "    Remove-Item $_.FullName -Force;" ^
    "    $removed++;" ^
    "  }" ^
    "};" ^
    "if ($removed -gt 0) { Write-Host ('  removed ' + $removed + ' stale jar(s)') -ForegroundColor Yellow }" ^
    "else { Write-Host '  no stale jars'; }"

REM ----------------------------------------------------------------------------
REM Phase 5: assert JVM-verification-disable invariant on instance.cfg
REM
REM Patchouli + Ars Nouveau ship bytecode-patched JARs that fail JVM class
REM verification at load. Without -noverify (set via JvmArgs + the gating
REM OverrideJavaArgs=true), AN's classes fail to load -> mods that depend
REM on AN fail to register their items -> server registry-sync handshake
REM fails with "client missing items" even though the mod jar IS present.
REM
REM Lost this on 2026-05-28: instance.cfg had drifted to OverrideJavaArgs=false
REM (PrismLauncher writes it on certain UI interactions), the JvmArgs line
REM was ignored, AN failed verification, and Vestment/Runed couldn't register.
REM
REM Idempotent: only writes instance.cfg when correction is needed.
REM Preserves user-added JVM args (only INSERTS -noverify if missing).
REM ----------------------------------------------------------------------------
echo.
echo [dev-sync] Phase 5: assert -noverify JVM arg for Patchouli + Ars Nouveau...
set "INSTANCE_CFG=%LOCAL%\..\instance.cfg"
if exist "%INSTANCE_CFG%" (
    powershell -ExecutionPolicy Bypass -Command ^
        "$cfg = Get-Content -Raw -Encoding UTF8 -Path '%INSTANCE_CFG%';" ^
        "$changed = $false;" ^
        "if ($cfg -match '(?m)^OverrideJavaArgs=false') {" ^
        "  $cfg = $cfg -replace '(?m)^OverrideJavaArgs=false', 'OverrideJavaArgs=true';" ^
        "  $changed = $true;" ^
        "  Write-Host '  flipped OverrideJavaArgs=false -> true';" ^
        "} elseif ($cfg -notmatch '(?m)^OverrideJavaArgs=') {" ^
        "  if (-not $cfg.EndsWith([Environment]::NewLine)) { $cfg += [Environment]::NewLine };" ^
        "  $cfg += 'OverrideJavaArgs=true' + [Environment]::NewLine;" ^
        "  $changed = $true;" ^
        "  Write-Host '  added missing OverrideJavaArgs=true';" ^
        "};" ^
        "if ($cfg -notmatch '(?m)^JvmArgs=.*-noverify') {" ^
        "  if ($cfg -match '(?m)^JvmArgs=(.*)$') {" ^
        "    $cfg = $cfg -replace '(?m)^JvmArgs=(.*)$', 'JvmArgs=$1 -noverify';" ^
        "    Write-Host '  appended -noverify to existing JvmArgs';" ^
        "  } else {" ^
        "    if (-not $cfg.EndsWith([Environment]::NewLine)) { $cfg += [Environment]::NewLine };" ^
        "    $cfg += 'JvmArgs=-noverify' + [Environment]::NewLine;" ^
        "    Write-Host '  added missing JvmArgs=-noverify';" ^
        "  };" ^
        "  $changed = $true;" ^
        "};" ^
        "if ($changed) {" ^
        "  Set-Content -Path '%INSTANCE_CFG%' -Value $cfg -NoNewline -Encoding UTF8;" ^
        "  Write-Host '  instance.cfg updated';" ^
        "} else {" ^
        "  Write-Host '  ok - already wired';" ^
        "}"
) else (
    echo   instance.cfg not found at %INSTANCE_CFG%; skipping
)

REM ----------------------------------------------------------------------------
REM Final status. Always exit 0 -- pre-launch warnings shouldn't block the
REM launch (operator may be intentionally offline or running solo).
REM ----------------------------------------------------------------------------
echo.
if %ROBOCOPY_EXIT% LEQ 3 (
    if %ROBOCOPY_EXIT% EQU 0 (
        echo [dev-sync] OK - no changes detected.
    ) else (
        echo [dev-sync] OK - changes applied.
    )
) else (
    echo [dev-sync] WARN - sync completed with warnings. robocopy exit=%ROBOCOPY_EXIT%
)

endlocal
exit /b 0
