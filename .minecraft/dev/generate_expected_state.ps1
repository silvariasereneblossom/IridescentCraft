# =============================================================================
# generate_expected_state.ps1 - generate per-distro expected_state.json manifests
# =============================================================================
# PURPOSE
#   Emit a GENERATED, never-hand-written expected-state manifest per distro that
#   is the single source of authority for WHICH files SHOULD exist under each
#   distro's MANAGED ROOTS, with a sha256 + size per file. The non-git sync legs
#   (server phase0_sync full-zip path; client sync_client full-zip path; the Rust
#   full_zip_sync) consume this to decide delete-vs-keep-vs-refetch AFTER a
#   non-deleting full-zip overlay, closing the "repo deletions strand forever on
#   consumers" gap (proven 2026-06-06: 8 stale affixes aborted the live
#   magic_weapon pool; packetfixer/tier_skip/probe lived on).
#
#   Modeled on the proven docket-#70 "manifest-as-keep" pattern
#   (custom_jars_manifest.json + regen_custom_jars_manifest.ps1). Difference:
#   custom_jars_manifest.json is the authority for the JARS (mods/*.jar);
#   expected_state.json is the authority for the MANAGED CONFIG/SCRIPT TREE
#   (kubejs/, config/, mods/.index/). The two are complementary and never
#   overlap: mods/*.jar is deliberately EXCLUDED here.
#
# MANAGED ROOTS (per distro, relative to that distro's root)
#   kubejs       - synced KubeJS trees (startup/server/client scripts, data,
#                  assets, config, README).
#   config       - mod configs.
#   mods/.index  - packwiz .pw.toml index (NOT mods/*.jar: the jars remain the
#                  authority of custom_jars_manifest.json + packwiz; listing them
#                  here would double-authority and risk deleting packwiz mods).
#   NOTE: world/, logs/, TesterLogs/, server.properties, backups/, crash-reports/
#   etc. are OUTSIDE the manifest universe -> structurally undeletable by the
#   consumer (a file the consumer never lists can never be flagged for deletion).
#
# OUTPUT (one manifest per distro, relpaths relative to ITS distro root)
#   .minecraft/server_distribution/expected_state.json
#   .minecraft/distribution/client/expected_state.json
#   Shape:
#     {"version":1,"generated_from":"<git short sha>",
#      "roots":["kubejs","config","mods/.index"],
#      "files":{"<forward/slash/relpath>":{"sha256":"...","size":N[,"volatile":true]}, ...}}
#   Stable key ordering (paths sorted ordinal); forward-slash relpaths;
#   UTF-8 no BOM; LF line endings (matches *.json eol=lf in .gitattributes so the
#   gate's byte-compare is deterministic across pwsh / Windows PS / platforms).
#
# -----------------------------------------------------------------------------
# EXCLUSION CHOICES (documented per house rule #4)
# -----------------------------------------------------------------------------
# A. STRUCTURALLY OUTSIDE THE UNIVERSE (not even walked)
#    - .icraft_sync_status.json: lives at the .minecraft / distro ROOT, NOT under
#      a managed root -> never enumerated, never deletable. Confirmed 2026-06-06
#      (prism_prelaunch.bat writes !MC_DIR!\.icraft_sync_status.json; client
#      sync_client.ps1 writes it at $McDir). No action needed; noted for clarity.
#    - mods/*.jar: deliberately NOT a managed root (see above).
#
# B. VOLATILE DIRS UNDER MANAGED ROOTS (skipped entirely - present only at
#    runtime on a consumer, never authored in the repo; must NEVER be deleted or
#    flagged). Matched as a leading path segment of the forward-slash relpath:
#      kubejs/exported   - ProbeJS / KubeJS dump output (runtime).
#      kubejs/logs       - KubeJS per-run logs (runtime).
#      kubejs/libraries  - KubeJS IDE autocomplete stubs (runtime; already
#                          EXCLUDED in sync-distros.config.json).
#      kubejs/.cache     - KubeJS cache (runtime).
#      .cache            - generic cache dir, wherever it appears under a root.
#    These do not exist in the repo working tree today (verified 2026-06-06: disk
#    file count == git ls-files count under each managed root, both distros), so
#    excluding them is a no-op now and a guard against future runtime dirt
#    breaking the freshness gate or stranding a delete on a consumer.
#
# C. VOLATILE TRACKED CONFIGS (LISTED + flagged "volatile":true, NOT skipped)
#    Some mods REWRITE their tracked config in place at runtime on the live
#    server, so the consumer's on-disk copy legitimately diverges from the repo
#    hash. These MUST stay listed (so they are never deleted as "not in
#    manifest") BUT the consumer's hash-mismatch action must be KEEP-LOCAL, not
#    overwrite-from-zip. The "volatile":true flag signals that to the consumer.
#    Census-named (sync audit 2026-06-06): Apocalypse Rebooted,
#    Bosses_Scale_With_Player_Count. Matched as path prefixes under config/.
#    The .bak sibling (apocalypse-common-1.toml.bak) corroborates in-place
#    rewriting; the flat config/apocalypse-*.toml files belong to the SAME mod
#    and are covered too (the .bak is the mod's own runtime backup of
#    apocalypse-common.toml). Maintain $VolatilePrefixes below as more are
#    identified.
#
# -----------------------------------------------------------------------------
# COMPAT / HOUSE RULES
#   - Windows PowerShell 5.1 compatible (consumers are 5.1): NO ternary, NO
#     null-coalescing, NO ?. operators. Runs dev-side under pwsh 7.4.6 too.
#   - ASCII only (CP1252 trap).
#   - Run from anywhere; defaults to repo root via $PSScriptRoot.
#
# USAGE
#   pwsh .minecraft/dev/generate_expected_state.ps1            # write manifests
#   pwsh .minecraft/dev/generate_expected_state.ps1 -Check     # exit 1 if stale
#   (the pre-push gate sync-distros.ps1 invokes -Check for its freshness check)
# =============================================================================

[CmdletBinding()]
param(
    # -Check: regenerate in-memory, byte-compare to the on-disk manifests, and
    # exit 1 if any distro's manifest is stale (without rewriting it). Used by
    # the pre-push gate. Default (no -Check) writes the manifests to disk.
    [switch]$Check,
    [string]$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
)

$ErrorActionPreference = 'Stop'

# Managed roots - the ONLY trees this manifest governs. Keep in lockstep with
# the consumers' managed-roots arrays (phase0_sync.ps1, sync_client.ps1,
# iridescentserver.sh, sync.rs).
$ManagedRoots = @('kubejs', 'config', 'mods/.index')

# Distro roots (relative to .minecraft) that each get their own manifest.
$Distros = @(
    'server_distribution',
    'distribution/client'
)

# Volatile DIR prefixes: skip entirely (never listed). Forward-slash, no
# trailing slash; matched as a leading path segment of the relpath.
$VolatileDirs = @(
    'kubejs/exported',
    'kubejs/logs',
    'kubejs/libraries',
    'kubejs/.cache'
)
# Generic cache dir name to skip wherever it appears as a path segment.
$CacheDirName = '.cache'

# Volatile FILE prefixes: LIST but flag "volatile":true (keep-local on
# hash-mismatch). Forward-slash, relative to distro root; matched as a leading
# prefix on the relpath. See exclusion note C above.
$VolatilePrefixes = @(
    'config/Apocalypse Rebooted/',
    'config/apocalypse-',
    'config/Bosses_Scale_With_Player_Count/'
)

$mcRoot = Join-Path $RepoRoot '.minecraft'

# git short sha for provenance (generated_from). Best-effort: if git is
# unavailable we still emit a manifest, just with an 'unknown' marker.
$gitSha = 'unknown'
try {
    Push-Location $RepoRoot
    $sha = (& git rev-parse --short HEAD 2>$null)
    Pop-Location
    if ($LASTEXITCODE -eq 0 -and $sha) { $gitSha = $sha.Trim() }
} catch {
    # leave $gitSha = 'unknown'
}

# True if any path segment of $Rel exactly equals $Seg.
function Test-PathHasSegment {
    param([string]$Rel, [string]$Seg)
    foreach ($p in ($Rel -split '/')) {
        if ($p -eq $Seg) { return $true }
    }
    return $false
}

# True if $Rel is inside a volatile DIR (skip entirely).
function Test-VolatileDir {
    param([string]$Rel)
    foreach ($v in $VolatileDirs) {
        if ($Rel -eq $v -or $Rel.StartsWith("$v/")) { return $true }
    }
    if (Test-PathHasSegment -Rel $Rel -Seg $CacheDirName) { return $true }
    return $false
}

# True if $Rel is a volatile FILE (list but flag keep-local).
function Test-VolatileFile {
    param([string]$Rel)
    foreach ($p in $VolatilePrefixes) {
        if ($Rel.StartsWith($p)) { return $true }
    }
    return $false
}

# Build the manifest JSON text for one distro root. Returns the exact string we
# would write to disk (also used for the -Check byte-compare). LF-normalised.
function Build-ManifestJson {
    param([string]$DistroRel)

    $distroRoot = Join-Path $mcRoot $DistroRel
    $base = (Resolve-Path $distroRoot).Path

    # Collect relpath -> sha/size/volatile. Sort relpaths so the output is
    # deterministic (byte-stable) - the -Check freshness compare depends on it.
    $fileEntries = New-Object System.Collections.Generic.List[object]

    foreach ($root in $ManagedRoots) {
        # $root may contain a forward slash (mods/.index); normalise to the
        # platform separator for filesystem access.
        $rootFsRel = $root -replace '/', [string][System.IO.Path]::DirectorySeparatorChar
        $rootPath = Join-Path $distroRoot $rootFsRel
        if (-not (Test-Path -LiteralPath $rootPath)) { continue }

        Get-ChildItem -LiteralPath $rootPath -Recurse -File -Force -ErrorAction SilentlyContinue | ForEach-Object {
            $full = $_.FullName
            # relpath relative to THIS distro root, forward-slash normalised so
            # the manifest is portable across Windows (consumer) and Linux
            # (dev/server). substring length+1 drops the leading separator.
            $rel = $full.Substring($base.Length + 1) -replace '\\', '/'

            if (Test-VolatileDir -Rel $rel) { return }   # continue the pipeline

            $hash = (Get-FileHash -LiteralPath $full -Algorithm SHA256).Hash.ToLower()
            $size = [int64]$_.Length
            $vol = Test-VolatileFile -Rel $rel
            $fileEntries.Add([pscustomobject]@{ Rel = $rel; Sha = $hash; Size = $size; Volatile = $vol }) | Out-Null
        }
    }

    # ORDINAL (codepoint) sort for cross-environment-stable ordering. NOTE:
    # Sort-Object -CaseSensitive is still CULTURE-AWARE (locale-dependent), which
    # would let the byte-compare in the gate diverge between the dev host and CI
    # or another locale. [StringComparer]::Ordinal gives pure codepoint order
    # that is identical everywhere (and matches a plain JSON-tooling sort).
    # Build a relpath->entry lookup, then sort the keys ordinally.
    $entryByRel = @{}
    foreach ($e in $fileEntries) {
        $entry = [ordered]@{ sha256 = $e.Sha; size = $e.Size }
        if ($e.Volatile) { $entry['volatile'] = $true }
        $entryByRel[$e.Rel] = $entry
    }
    $relKeys = New-Object 'System.Collections.Generic.List[string]'
    foreach ($e in $fileEntries) { $relKeys.Add($e.Rel) }
    $relKeys.Sort([System.StringComparer]::Ordinal)
    $files = [ordered]@{}
    foreach ($k in $relKeys) { $files[$k] = $entryByRel[$k] }

    $manifest = [ordered]@{
        version        = 1
        generated_from = $gitSha
        roots          = $ManagedRoots
        files          = $files
    }

    # Depth 6: version/generated_from/roots/files -> <relpath> -> {sha256,size,volatile}
    $json = ($manifest | ConvertTo-Json -Depth 6)
    # LF line endings (matches *.json eol=lf so the gate byte-compare is stable).
    return ($json -replace "`r`n", "`n")
}

# Write text as UTF-8 no BOM (LF already normalised by Build-ManifestJson).
function Write-Utf8NoBom {
    param([string]$Path, [string]$Text)
    $enc = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($Path, $Text, $enc)
}

$stale = @()
$written = 0

foreach ($d in $Distros) {
    $distroRoot = Join-Path $mcRoot $d
    if (-not (Test-Path -LiteralPath $distroRoot)) {
        Write-Host "  [skip] distro root not present: $d" -ForegroundColor Yellow
        continue
    }

    $json = Build-ManifestJson -DistroRel $d
    $manifestPath = Join-Path $distroRoot 'expected_state.json'
    $fileCount = ([regex]::Matches($json, '"sha256"')).Count
    $volCount = ([regex]::Matches($json, '"volatile"')).Count

    if ($Check) {
        $current = ''
        if (Test-Path -LiteralPath $manifestPath) {
            $current = [System.IO.File]::ReadAllText($manifestPath) -replace "`r`n", "`n"
        }
        if ($current.TrimEnd("`n") -ne $json.TrimEnd("`n")) {
            $stale += $d
            Write-Host "  [STALE] $d/expected_state.json differs from regenerated content" -ForegroundColor Red
        } else {
            Write-Host "  [ok]    $d/expected_state.json fresh ($fileCount files, $volCount volatile)" -ForegroundColor Green
        }
    } else {
        Write-Utf8NoBom -Path $manifestPath -Text $json
        Write-Host "  -> $manifestPath ($fileCount files, $volCount volatile)" -ForegroundColor Cyan
        $written++
    }
}

if ($Check) {
    if ($stale.Count -gt 0) {
        Write-Host ""
        Write-Host "[expected-state] STALE manifest(s): $($stale -join ', ')" -ForegroundColor Red
        Write-Host "[expected-state] Run: pwsh .minecraft/dev/generate_expected_state.ps1" -ForegroundColor Yellow
        Write-Host "[expected-state] then commit the updated expected_state.json file(s)." -ForegroundColor Yellow
        exit 1
    }
    Write-Host ""
    Write-Host "[expected-state] all manifests fresh." -ForegroundColor Green
    exit 0
}

Write-Host ""
Write-Host "[expected-state] generated_from=$gitSha. wrote $written manifest(s). Commit them alongside any config/kubejs/.index changes + push (consumers read them after a full-zip overlay)." -ForegroundColor Green
exit 0
