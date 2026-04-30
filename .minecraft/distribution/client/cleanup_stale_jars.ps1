# =============================================================================
# cleanup_stale_jars.ps1 (client) — remove mods/*.jar files not declared in
# mods/.index/*.pw.toml or in the custom-JAR allowlist.
# =============================================================================
# Mirrors the server-distribution version. Invoked from sync_client.ps1 after
# overlay so testers don't accumulate orphan JARs from previously-managed
# packwiz entries (e.g., upstream justlevelingfork-1.2.1.jar after the fork
# replaced it).
#
# Custom jars list MUST stay in sync with:
#   - .gitignore allowlist patterns
#   - server_distribution/cleanup_stale_jars.ps1 (parallel file)
#   - server_distribution/update_mods.ps1 / .sh
#   - main .minecraft/verify_distros.sh / .ps1
#   - distribution/client/sync_client.ps1 (this file's caller)
#   - wiki/CLAUDE.md "Current custom JARs" section
# =============================================================================

param(
    [string]$ModsDir = 'mods',
    [string]$IndexDir = 'mods\.index'
)

$ErrorActionPreference = 'Continue'

if (-not (Test-Path $IndexDir)) {
    Write-Host "  [cleanup] $IndexDir not found — skipping." -ForegroundColor Yellow
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
    'iridescent_reforging-0.1.0.jar',
    'iridescent_durability_clamp-0.1.0.jar',
    'justlevelingfork-1.2.1-iridescent.1.jar',
    'mek_walkable_cables-1.0.1.jar',
    'offlineskins-1.20.1-v1.jar',
    'zeta_racefix-1.0.0.jar',
    'Patchouli-1.20.1-85-FORGE.jar',
    'ars_nouveau-1.20.1-4.12.7-all.jar',
    'class-artifacts-forge-2.0.5.jar'
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
        Write-Host "  [cleanup] Removing stale: $($_.Name)" -ForegroundColor DarkYellow
        Remove-Item $_.FullName -Force -ErrorAction SilentlyContinue
        $removed++
    }
}

if ($removed -gt 0) {
    Write-Host "  [cleanup] Removed $removed stale JAR(s); kept $kept." -ForegroundColor Yellow
} else {
    Write-Host "  [cleanup] No stale JARs; kept $kept." -ForegroundColor Green
}
