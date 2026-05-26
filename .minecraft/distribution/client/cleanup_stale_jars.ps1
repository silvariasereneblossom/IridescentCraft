# =============================================================================
# cleanup_stale_jars.ps1 - UNIFIED (kept identical across server_distribution +
# distribution/client + main .minecraft via sync-distros).
# =============================================================================
# THREE LAYERS of mod folder hygiene:
#
#   1. DENY-LIST (force-remove): known-removed mods that must NEVER be present.
#      Substring match against filename. Highest priority - runs first.
#      Catches Truly-Modular-* jars in tester installs after we removed the
#      suite, and other mods we've intentionally pulled from the pack.
#
#   2. HASH-VERIFY: custom jars matched by filename AND SHA-256. If a custom jar
#      is locally present with the right filename but a DIFFERENT hash than the
#      canonical manifest, REMOVE it (next sync re-fetches the correct one).
#      This catches the "same-version-string-different-content" drift bug -
#      the failure mode where iridescent_tetra_expansion-1.0.0.jar locally has
#      old item registrations and the server has new ones, both claim '1.0.0',
#      and Forge rejects the connect with "Failed to synchronize registry data".
#
#   3. ALLOWLIST-or-PURGE: any jar not in packwiz mods/.index/*.pw.toml AND not
#      in the customJars allowlist below gets removed as stale.
#
# Edit this file when:
#   - retiring a mod from the pack -> add a substring pattern to $denyList
#   - adding/bumping a custom jar -> update $customJars + regen the manifest
#     via tools/regen_custom_jars_manifest.ps1
#
# Manifest auto-detected as <ModsDir>/../custom_jars_manifest.json. Missing
# manifest skips hash-verify only - deny-list + allowlist still run.
# =============================================================================

param(
    [string]$ModsDir = 'mods',
    [string]$IndexDir = 'mods\.index',
    [string]$ManifestPath = $null
)

$ErrorActionPreference = 'Continue'

# Auto-detect manifest path if not passed: <ModsDir>/../custom_jars_manifest.json
if (-not $ManifestPath) {
    if (Test-Path $ModsDir) {
        $modsParent = Split-Path -Parent (Resolve-Path $ModsDir).Path
        if ($modsParent) {
            $ManifestPath = Join-Path $modsParent 'custom_jars_manifest.json'
        }
    }
}

# --- DENY-LIST: substring patterns. Any jar filename containing these gets force-removed.
# Use lowercase substring; comparison is case-insensitive. One entry catches all variants
# (e.g. 'truly_modular' or 'truly-modular' catches archery/armory/arsenal/miapi/create_compat).
$denyList = @(
    'truly_modular',     # Truly-Modular suite (replaced by iridescent_reforging)
    'truly-modular',     # hyphenated variant of same
    'rechiseled',        # removed - SuperMartijn642 dep removed
    'supermartijn642',   # removed - dep chain incompat
    'connectedglass',    # removed - SuperMartijn642 dep
    'trashcans'          # removed - SuperMartijn642 dep
)

# --- ALLOWLIST: custom jars not declared in packwiz mods/.index/. Edit on add/bump/remove.
$customJars = @(
    'iridescent_codex_data.jar',
    'iridescent_origins-1.0.0.jar',
    'iridescent_biomes-1.0.0.jar',
    'iridescent_tetra_expansion-1.0.0.jar',
    'iridescent_durability_clamp-0.1.0.jar',
    'iridescent_difficulty-0.1.0.jar',
    'justlevelingfork-1.2.1-iridescent.1.jar',
    'mek_walkable_cables-1.0.1.jar',
    'offlineskins-1.20.1-v1.jar',
    'Patchouli-1.20.1-85-FORGE.jar',
    'ars_nouveau-1.20.1-4.12.7-all.jar',
    'class-artifacts-forge-2.0.5.jar'
)

# --- Load manifest (optional) for layer 2 hash verification ---
$hashes = @{}
if ($ManifestPath -and (Test-Path $ManifestPath)) {
    try {
        $manifest = Get-Content $ManifestPath -Raw | ConvertFrom-Json
        if ($manifest.jars) {
            foreach ($prop in $manifest.jars.PSObject.Properties) {
                $hashes[$prop.Name] = $prop.Value.sha256.ToLower()
            }
        }
    } catch {
        Write-Host "  [cleanup] WARNING: failed to parse manifest at $ManifestPath - $($_.Exception.Message)" -ForegroundColor Yellow
    }
}

# Build expected set from packwiz + customJars
$expected = @{}
$pwTomlCount = 0
if (Test-Path $IndexDir) {
    Get-ChildItem "$IndexDir\*.pw.toml" -ErrorAction SilentlyContinue | ForEach-Object {
        foreach ($line in Get-Content $_.FullName) {
            if ($line -match "^\s*filename\s*=\s*['""](.+)['""]") {
                $expected[$matches[1]] = $true
            }
        }
    }
    $pwTomlCount = $expected.Count
} else {
    Write-Host "  [cleanup] $IndexDir not found - skipping packwiz check (deny-list + hash-verify still run)." -ForegroundColor Yellow
}
foreach ($c in $customJars) { $expected[$c] = $true }

Write-Host "  [cleanup] $pwTomlCount packwiz + $($customJars.Count) custom = $($expected.Count) expected | $($hashes.Count) hashed | $($denyList.Count) deny-patterns"

$forced  = 0
$drifted = 0
$stale   = 0
$kept    = 0

Get-ChildItem "$ModsDir\*.jar" -ErrorAction SilentlyContinue | ForEach-Object {
    $name = $_.Name
    $path = $_.FullName
    $lowerName = $name.ToLower()

    # --- Layer 1: DENY-LIST (highest priority, substring match, case-insensitive) ---
    $denyHit = $null
    foreach ($pattern in $denyList) {
        if ($lowerName -like "*$pattern*") {
            $denyHit = $pattern
            break
        }
    }
    if ($denyHit) {
        Write-Host "  [cleanup] DENY-LIST removing: $name (matched pattern '$denyHit')" -ForegroundColor Red
        Remove-Item $path -Force -ErrorAction SilentlyContinue
        $forced++
        return
    }

    # --- Layer 2: HASH-VERIFY for custom jars (if manifest loaded) ---
    if ($hashes.ContainsKey($name)) {
        $expectedHash = $hashes[$name]
        $actualHash = $null
        try {
            $actualHash = (Get-FileHash $path -Algorithm SHA256 -ErrorAction Stop).Hash.ToLower()
        } catch {
            Write-Host "  [cleanup] Could not hash $name : $($_.Exception.Message)" -ForegroundColor Yellow
        }
        if ($actualHash -and $actualHash -ne $expectedHash) {
            Write-Host "  [cleanup] HASH MISMATCH removing: $name" -ForegroundColor Magenta
            Write-Host "             local:    $($actualHash.Substring(0,16))..." -ForegroundColor Magenta
            Write-Host "             expected: $($expectedHash.Substring(0,16))..." -ForegroundColor Magenta
            Remove-Item $path -Force -ErrorAction SilentlyContinue
            $drifted++
            return
        }
    }

    # --- Layer 3: ALLOWLIST or purge ---
    if ($expected.ContainsKey($name)) {
        $kept++
    } else {
        Write-Host "  [cleanup] Stale removing: $name" -ForegroundColor DarkYellow
        Remove-Item $path -Force -ErrorAction SilentlyContinue
        $stale++
    }
}

$totalRemoved = $forced + $drifted + $stale
if ($totalRemoved -gt 0) {
    Write-Host "  [cleanup] Removed $totalRemoved (deny=$forced drift=$drifted stale=$stale); kept $kept." -ForegroundColor Yellow
} else {
    Write-Host "  [cleanup] No removals needed; kept $kept." -ForegroundColor Green
}
