# =============================================================================
# IridescentCraft Distribution Verification
# Checks critical files exist in server_distribution/ and distribution/client/
# Run with -Fix to auto-copy missing/stale files
# =============================================================================

param([switch]$Fix)

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$errors = 0
$fixed = 0

Write-Host "[Verify] Checking distribution sync..." -ForegroundColor Cyan
Write-Host ""

$paxiZips = @(
    "iridescent_codex.zip", "icraft_skills.zip", "icraft_apotheosis_affixes.zip",
    "icraft_botania_overrides.zip", "icraft_tetra_materials.zip", "icraft_tetra_overrides.zip",
    "icraft_aethersteel_overrides.zip", "icraft_progdiff_overrides.zip",
    "improvedmobs_datapack.zip", "icraft_loot_overrides.zip", "icraft_dungeon_crawl_overrides.zip"
)

$customJars = @(
    "iridescent_codex_data.jar", "iridescent_origins-1.0.0.jar",
    "iridescent_biomes-1.0.0.jar", "iridescent_modular_spells-0.2.0.jar','iridescent_reforging-0.1.0.jar",
    "offlineskins-1.20.1-v1.jar", "Patchouli-1.20.1-85-FORGE.jar"
)

$kubeScripts = @(
    "kubejs\server_scripts\loot\lootjs_overhaul.js",
    "kubejs\server_scripts\gates\milestone_detection.js",
    "kubejs\server_scripts\gates\astages_restrictions.js",
    "kubejs\server_scripts\scaling\mob_scaling_unified.js",
    "kubejs\server_scripts\death_penalty.js",
    "kubejs\data\forge\loot_modifiers\global_loot_modifiers.json",
    "kubejs\data\ars_nouveau\loot_modifiers\dungeon_loot.json"
)

$configs = @(
    "config\dungeon_crawl.toml", "config\lootr-common.toml", "config\tectonic.json",
    "config\sereneseasons\seasons.toml", "config\everydayxp\rpgseteffects\rpgseteffects.toml",
    "config\chunky\config.json", "config\paxi\datapack_load_order.json"
)

$distros = @("server_distribution", "distribution\client")

foreach ($distro in $distros) {
    Write-Host "  --- $distro ---" -ForegroundColor White

    # Helper: check + optionally fix
    function Check-And-Fix($src, $dst, $label) {
        if (-not (Test-Path $src)) { return }
        $needsFix = $false
        if (-not (Test-Path $dst)) {
            Write-Host "  MISSING: $label" -ForegroundColor Red
            $needsFix = $true
        } elseif ((Get-Item $src).Length -ne (Get-Item $dst).Length) {
            Write-Host "  STALE:   $label" -ForegroundColor Yellow
            $needsFix = $true
        }
        if ($needsFix) {
            $script:errors++
            if ($Fix) {
                $dstDir = Split-Path $dst -Parent
                if (-not (Test-Path $dstDir)) { New-Item -ItemType Directory -Path $dstDir -Force | Out-Null }
                Copy-Item $src $dst -Force
                Write-Host "    FIXED" -ForegroundColor Green
                $script:fixed++
            }
        }
    }

    foreach ($zip in $paxiZips) {
        $src = Join-Path $scriptDir "config\paxi\datapacks\$zip"
        $dst = Join-Path $scriptDir "$distro\config\paxi\datapacks\$zip"
        Check-And-Fix $src $dst "$distro\config\paxi\datapacks\$zip"
    }

    foreach ($jar in $customJars) {
        $src = Join-Path $scriptDir "mods\$jar"
        $dst = Join-Path $scriptDir "$distro\mods\$jar"
        Check-And-Fix $src $dst "$distro\mods\$jar"
    }

    foreach ($script in $kubeScripts) {
        $src = Join-Path $scriptDir $script
        $dst = Join-Path $scriptDir "$distro\$script"
        Check-And-Fix $src $dst "$distro\$script"
    }

    foreach ($cfg in $configs) {
        $src = Join-Path $scriptDir $cfg
        $dst = Join-Path $scriptDir "$distro\$cfg"
        Check-And-Fix $src $dst "$distro\$cfg"
    }

    Write-Host ""
}

if ($errors -gt 0) {
    if ($Fix) {
        Write-Host "[Verify] Fixed $fixed of $errors issue(s)." -ForegroundColor Yellow
    } else {
        Write-Host "[Verify] FAILED: $errors file(s) missing or stale" -ForegroundColor Red
        Write-Host "[Verify] Run with -Fix to auto-copy: verify_distros.bat -Fix" -ForegroundColor Yellow
    }
    exit 1
} else {
    Write-Host "[Verify] All critical files present." -ForegroundColor Green
    exit 0
}
