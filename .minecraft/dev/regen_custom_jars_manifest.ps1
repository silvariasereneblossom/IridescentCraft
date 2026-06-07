# =============================================================================
# regen_custom_jars_manifest.ps1 - regenerate custom_jars_manifest.json
# =============================================================================
# Run AFTER rebuilding any custom jar (iridescent_tetra_expansion,
# iridescent_codex_data, etc.) where the file CONTENT changes without the
# filename changing.
#
# What it does:
#   1. Walks .minecraft/mods/ for each jar listed in $customJars (mirrors the
#      allowlist in cleanup_stale_jars.ps1)
#   2. Computes SHA-256 + size for each
#   3. Writes/overwrites .minecraft/custom_jars_manifest.json
#   4. Mirrors the manifest to server_distribution/ + distribution/client/
#
# Why this matters:
#   The cleanup_stale_jars.ps1 hash-verify layer reads this manifest. If a
#   tester's local custom jar SHA differs from the manifest, the cleanup
#   removes it and the next sync re-fetches the canonical one. Without
#   regenerating after a rebuild, the manifest goes stale and the deny
#   propagation breaks - testers keep the old jar forever.
#
# Manual trigger after every custom-jar rebuild. Could be wired into
# build_mod.sh / build_mod.ps1 as a post-build step (TODO).
#
# Run from repo root:
#   pwsh .minecraft/dev/regen_custom_jars_manifest.ps1
# =============================================================================

param(
    [string]$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
)

$ErrorActionPreference = 'Stop'

# Custom-jar discovery is GIT-DERIVED (2026-06-07): a jar is custom IFF git
# will commit it (mods/*.jar is gitignored except the negated customs). This
# kills the hardcoded-filename lockstep -- version bumps self-track. NOTE:
# `git add` a brand-new jar (or rely on the gitignore negation making it
# untracked-unignored, which is also picked up) BEFORE running this script.
# cleanup_stale_jars.ps1's $customJars literal stays as the manifest-missing
# fallback only (manifest-as-keep is the primary mechanism, #70).
$tracked   = & git -C $RepoRoot ls-files '.minecraft/mods/*.jar'
$untracked = & git -C $RepoRoot ls-files --others --exclude-standard '.minecraft/mods/*.jar'
$customJars = @($tracked) + @($untracked) |
    Where-Object { $_ } | ForEach-Object { Split-Path $_ -Leaf } | Sort-Object -Unique
if (-not $customJars -or $customJars.Count -eq 0) {
    Write-Host "ERROR: git-derived custom jar list is EMPTY - refusing to write an empty manifest." -ForegroundColor Red
    exit 1
}
Write-Host "[regen] git-derived custom jar list: $($customJars.Count) jar(s)"

$modsDir = Join-Path $RepoRoot '.minecraft\mods'
if (-not (Test-Path $modsDir)) {
    Write-Host "ERROR: mods dir not found at $modsDir" -ForegroundColor Red
    exit 1
}

$manifest = [ordered]@{
    generated_at = (Get-Date -Format 'yyyy-MM-ddTHH:mm:ssZ')
    generated_by = "regen_custom_jars_manifest.ps1 on $env:COMPUTERNAME by $env:USERNAME"
    algorithm    = 'SHA-256'
    jars         = [ordered]@{}
}

$missing = @()
foreach ($j in $customJars) {
    $p = Join-Path $modsDir $j
    if (Test-Path $p) {
        $h = (Get-FileHash $p -Algorithm SHA256).Hash.ToLower()
        $sz = (Get-Item $p).Length
        $manifest.jars[$j] = [ordered]@{ sha256 = $h; size = $sz }
        Write-Host "  $($h.Substring(0,12))...  ${sz,12} bytes  $j" -ForegroundColor Green
    } else {
        $missing += $j
        Write-Host "  MISSING in mods/ : $j" -ForegroundColor Yellow
    }
}

if ($missing.Count -gt 0) {
    Write-Host ""
    Write-Host "WARNING: $($missing.Count) jar(s) listed in customJars but not found in $modsDir." -ForegroundColor Yellow
    Write-Host "  Either remove them from the customJars allowlist in this script + cleanup_stale_jars.ps1,"
    Write-Host "  OR drop the missing jars into $modsDir before regenerating."
}

$json = $manifest | ConvertTo-Json -Depth 4

# Write to all three locations: main, server_distribution, distribution/client
$targets = @(
    (Join-Path $RepoRoot '.minecraft\custom_jars_manifest.json'),
    (Join-Path $RepoRoot '.minecraft\server_distribution\custom_jars_manifest.json'),
    (Join-Path $RepoRoot '.minecraft\distribution\client\custom_jars_manifest.json')
)

foreach ($t in $targets) {
    $parent = Split-Path $t -Parent
    if (-not (Test-Path $parent)) {
        Write-Host "  Skipping (parent missing): $t" -ForegroundColor Yellow
        continue
    }
    [System.IO.File]::WriteAllText($t, $json)
    Write-Host "  -> $t" -ForegroundColor Cyan
}

Write-Host ""
Write-Host "Manifest regen complete. $($manifest.jars.Count) jars hashed across 3 distros." -ForegroundColor Green
Write-Host "Commit the manifest changes + any rebuilt jars + push."
