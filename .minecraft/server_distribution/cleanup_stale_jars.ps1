# =============================================================================
# cleanup_stale_jars.ps1 - remove mods/*.jar files not declared in
# mods/.index/*.pw.toml or in the custom-JAR allowlist.
# =============================================================================
# Replaces the inline PowerShell that lived in iridescentserver.bat. The
# inline version was deleting our custom jars (ars_nouveau, iridescent_biomes,
# iridescent_modular_spells) - likely due to cmd-side quote-escape edge
# cases breaking the array literal. A proper .ps1 file avoids that entirely
# and lets us print diagnostics if the issue recurs.
#
# Custom jars list MUST stay in sync with:
#   - .gitignore allowlist patterns
#   - server_distribution/update_mods.ps1 / .sh
#   - distribution/client/sync_*  (where applicable)
#   - main .minecraft/verify_distros.sh / .ps1
# =============================================================================

param(
    [string]$ModsDir = 'mods',
    [string]$IndexDir = 'mods\.index'
)

$ErrorActionPreference = 'Continue'

if (-not (Test-Path $IndexDir)) {
    Write-Host "  [cleanup] $IndexDir not found - skipping." -ForegroundColor Yellow
    exit 0
}

$expected = @{}

# Pull every filename = '...' line out of every .pw.toml.
Get-ChildItem "$IndexDir\*.pw.toml" -ErrorAction SilentlyContinue | ForEach-Object {
    foreach ($line in Get-Content $_.FullName) {
        if ($line -match "^\s*filename\s*=\s*['""](.+)['""]") {
            $expected[$matches[1]] = $true
        }
    }
}

$pwTomlCount = $expected.Count

# Custom jars not in packwiz metadata. Edit here when adding/removing/bumping.
$customJars = @(
    'iridescent_codex_data.jar',
    'iridescent_origins-1.0.0.jar',
    'iridescent_biomes-1.0.0.jar',
    'iridescent_modular_spells-0.2.0.jar',
    'iridescent_durability_clamp-0.1.0.jar',
    'mek_walkable_cables-1.0.1.jar',
    'offlineskins-1.20.1-v1.jar',
    'zeta_racefix-1.0.0.jar',
    'Patchouli-1.20.1-85-FORGE.jar',
    'ars_nouveau-1.20.1-4.12.7-all.jar'
)

foreach ($c in $customJars) {
    $expected[$c] = $true
}

Write-Host "  [cleanup] $pwTomlCount mod(s) from .pw.toml + $($customJars.Count) custom jar(s) = $($expected.Count) expected entries"

$removed = 0
$kept = 0
Get-ChildItem "$ModsDir\*.jar" -ErrorAction SilentlyContinue | ForEach-Object {
    if ($expected.ContainsKey($_.Name)) {
        $kept++
    } else {
        Write-Host "  [cleanup] Removing: $($_.Name)" -ForegroundColor DarkYellow
        Remove-Item $_.FullName -Force -ErrorAction SilentlyContinue
        $removed++
    }
}

if ($removed -gt 0) {
    Write-Host "  [cleanup] Removed $removed stale JAR(s); kept $kept." -ForegroundColor Yellow
} else {
    Write-Host "  [cleanup] No stale JARs; kept $kept." -ForegroundColor Green
}
