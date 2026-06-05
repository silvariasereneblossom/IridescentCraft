# =============================================================================
# cleanup_stale_jars.ps1 - UNIFIED (kept byte-identical across main .minecraft +
# server_distribution + distribution/client; parity ENFORCED by the pre-push
# `sync-distros.ps1` gate. This main-root copy is the canonical source the two
# distro copies are mirrored from - DO NOT edit one copy in isolation.)
# (A 4th copy seeds the server runtime at server_distribution/IridescentCraft
#  Dedicated Server/; it is outside the sync-distros distro-root model, so keep
#  it in parity by hand - but Layer 2.5 below makes drift there non-fatal too.)
# =============================================================================
# THE KEEP AUTHORITY IS THE MANIFEST. A custom jar is "expected" (kept) if it is
# in custom_jars_manifest.json - the single, tool-generated, 3-distro-synced
# source of truth (regen_custom_jars_manifest.ps1). The hand-maintained
# $customJars list below + the packwiz mods/.index/*.pw.toml markers are now
# only FALLBACKS (used when the manifest can't be loaded, or for the rare jar
# not in the manifest). This is what stops the "a new custom jar got purged on
# one distro because its allowlist/marker entry was missed" class of bug: as
# long as the jar is in the manifest, no distro will ever purge it.
#
# FOUR LAYERS of mod folder hygiene:
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
#   2.5 MANIFEST-as-KEEP: every jar named in the manifest is added to the
#      expected set, so a hash-matching custom jar is always kept even if its
#      $customJars / .pw.toml entry was never added on this distro.
#
#   3. ALLOWLIST-or-PURGE: any jar not in packwiz mods/.index/*.pw.toml AND not
#      in the manifest AND not in the $customJars fallback gets removed as stale.
#
# Edit this file when:
#   - retiring a mod from the pack -> add a substring pattern to $denyList
#   - adding/bumping a custom jar  -> the manifest (regen_custom_jars_manifest.ps1)
#     is the keep authority; update the $customJars fallback here too for the
#     manifest-missing case. Edit the MAIN copy; `sync-distros.ps1 -Fix` mirrors
#     it to the two distro copies (the pre-push gate verifies parity).
#
# Manifest auto-detected as <ModsDir>/../custom_jars_manifest.json. Missing
# manifest skips hash-verify + manifest-keep - deny-list + $customJars fallback
# + packwiz markers still run.
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

# --- ALLOWLIST FALLBACK: custom jars not declared in packwiz mods/.index/.
# The manifest (custom_jars_manifest.json) is the real keep authority (Layer 2.5);
# this list is the floor used when the manifest can't be loaded. Keep it current
# so a manifest-less run still protects every custom. One entry per line.
$customJars = @(
    'iridescent_codex_data.jar',
    'iridescent_origins-1.0.0.jar',
    'iridescent_biomes-1.0.0.jar',
    'iridescent_tetra_expansion-1.0.0.jar',
    'iridescent_durability_clamp-0.1.0.jar',
    'iridescent_difficulty-0.1.0.jar',
    'iridescent_grand_compass-1.0.0.jar',
    'justlevelingfork-1.2.1-iridescent.1.jar',
    'mek_walkable_cables-1.0.1.jar',
    'offlineskins-1.20.1-v1.jar',
    'Patchouli-1.20.1-85-FORGE.jar',
    'ars_nouveau-1.20.1-4.12.7-all.jar',
    'class-artifacts-forge-2.0.5.jar',
    'iridescent_relics-1.0.0.jar',
    'linearxp-1.0.0.jar'
)

# --- Load manifest (optional) for layer 2 hash verification + layer 2.5 keep ---
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

# Build expected set from packwiz + manifest (keep authority) + customJars fallback
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
# Layer 2.5: every manifest jar is a keep authority (single source of truth).
foreach ($h in $hashes.Keys) { $expected[$h] = $true }
# Fallback allowlist (manifest-missing / non-manifest jars).
foreach ($c in $customJars) { $expected[$c] = $true }

Write-Host "  [cleanup] $pwTomlCount packwiz + $($hashes.Count) manifest + $($customJars.Count) fallback = $($expected.Count) expected | $($hashes.Count) hashed | $($denyList.Count) deny-patterns"

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

    # --- Layer 3: ALLOWLIST or purge (manifest + packwiz + fallback) ---
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
