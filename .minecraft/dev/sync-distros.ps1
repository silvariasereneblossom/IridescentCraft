# =============================================================================
# sync-distros.ps1 - three-distro mirror enforcer
#
# IridescentCraft ships three Forge distributions that must stay byte-identical
# for the watched paths (kubejs, config, datapack_sources). This script
# compares main `.minecraft/` against `server_distribution/` and
# `distribution/client/` and either reports mismatches (default) or fixes them
# (-Fix).
#
# Usage (from anywhere inside the repo):
#   pwsh .minecraft\dev\sync-distros.ps1                      # detect-only, exit 1 on mismatch
#   pwsh .minecraft\dev\sync-distros.ps1 -Fix                 # main -> distros, keep orphans
#   pwsh .minecraft\dev\sync-distros.ps1 -Fix -DeleteOrphans  # also delete orphan files
#
# Exit codes:
#   0 = all three distros in sync (or -Fix applied successfully)
#   1 = mismatches found and -Fix was not requested
# =============================================================================

[CmdletBinding()]
param(
    [switch]$Fix,
    [switch]$DeleteOrphans
)

$ErrorActionPreference = 'Stop'

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$MinecraftRoot = (Resolve-Path (Join-Path $ScriptDir "..")).Path
$Main = $MinecraftRoot
$Distros = @(
    (Join-Path $MinecraftRoot "server_distribution"),
    (Join-Path $MinecraftRoot "distribution\client")
)

# Watched paths + exclusion patterns come from sync-distros.config.json.
# Tune that file as the project evolves (it's tracked alongside this script).
$ConfigPath = Join-Path $ScriptDir "sync-distros.config.json"
if (-not (Test-Path $ConfigPath)) {
    Write-Error "[sync-distros] missing config: $ConfigPath"
    exit 2
}
$Config = Get-Content -Raw $ConfigPath | ConvertFrom-Json
$Watched = $Config.WATCHED
$ExcludePatterns = $Config.EXCLUDE_PATTERNS
$ExtraMirrors = @()
if ($Config.PSObject.Properties.Name -contains 'EXTRA_MIRRORS') { $ExtraMirrors = $Config.EXTRA_MIRRORS }

function Test-Excluded {
    param([string]$Rel)
    foreach ($pat in $ExcludePatterns) {
        # PowerShell -like uses * = any chars (incl. /); good enough for this.
        if ($Rel -like $pat) { return $true }
    }
    return $false
}

function Get-FileHashOrNull {
    param([string]$Path)
    if (Test-Path $Path -PathType Leaf) {
        return (Get-FileHash $Path -Algorithm SHA256).Hash
    }
    return $null
}

# Enumerate the files to compare under a WATCHED entry. Supports BOTH a directory
# (recurse) AND a single file. NOTE: a plain `Get-ChildItem -Path <file> -Recurse`
# mis-globs - it treats the leaf as a recursive name filter and returns EVERY
# same-named file in the tree - so single-file entries MUST be handled explicitly.
function Get-FilesUnder {
    param([string]$Root)
    if (Test-Path -LiteralPath $Root -PathType Leaf)      { return @(Get-Item -LiteralPath $Root) }
    if (Test-Path -LiteralPath $Root -PathType Container) { return @(Get-ChildItem -LiteralPath $Root -Recurse -File) }
    return @()
}

$mismatches = New-Object System.Collections.Generic.List[object]

foreach ($w in $Watched) {
    $mainRoot = Join-Path $Main $w
    if (-not (Test-Path $mainRoot)) {
        Write-Host "[sync-distros] skip: $w not present under main"
        continue
    }

    # Forward pass: every file under main must exist with same hash in each distro
    foreach ($mainFile in (Get-FilesUnder $mainRoot)) {
        $rel = $mainFile.FullName.Substring($Main.Length + 1)
        # Normalise path separators so EXCLUDE_PATTERNS (written with /) match
        $relForwardSlash = $rel -replace '\\', '/'
        if (Test-Excluded $relForwardSlash) { continue }
        $mainHash = (Get-FileHash $mainFile.FullName -Algorithm SHA256).Hash
        foreach ($d in $Distros) {
            $distroFile = Join-Path $d $rel
            $distroHash = Get-FileHashOrNull $distroFile
            if ($null -eq $distroHash) {
                $mismatches.Add([pscustomobject]@{
                    Kind = 'MISSING'; Distro = $d; Rel = $rel; Source = $mainFile.FullName
                }) | Out-Null
            } elseif ($distroHash -ne $mainHash) {
                $mismatches.Add([pscustomobject]@{
                    Kind = 'DIVERGED'; Distro = $d; Rel = $rel; Source = $mainFile.FullName
                }) | Out-Null
            }
        }
    }

    # Reverse pass: orphans (files in distro but not in main)
    foreach ($d in $Distros) {
        $distroRoot = Join-Path $d $w
        if (-not (Test-Path $distroRoot)) { continue }
        foreach ($distroFile in (Get-FilesUnder $distroRoot)) {
            $rel = $distroFile.FullName.Substring($d.Length + 1)
            $relForwardSlash = $rel -replace '\\', '/'
            if (Test-Excluded $relForwardSlash) { continue }
            $mainCounterpart = Join-Path $Main $rel
            if (-not (Test-Path $mainCounterpart)) {
                $mismatches.Add([pscustomobject]@{
                    Kind = 'ORPHAN'; Distro = $d; Rel = $rel; Source = $distroFile.FullName
                }) | Out-Null
            }
        }
    }
}

# -----------------------------------------------------------------------------
# EXTRA_MIRRORS: explicit (source -> target) file pairs outside the distro-root
# model (e.g. the dedicated-server runtime SEED copy of cleanup_stale_jars.ps1,
# #74a). Source is main-relative; target is .minecraft-relative.
# -----------------------------------------------------------------------------
foreach ($pair in $ExtraMirrors) {
    $srcPath = Join-Path $Main $pair.source
    $dstPath = Join-Path $Main $pair.target
    if (-not (Test-Path $srcPath)) {
        Write-Host "[sync-distros] skip extra-mirror: source missing: $($pair.source)"
        continue
    }
    $srcHash = (Get-FileHash $srcPath -Algorithm SHA256).Hash
    $dstHash = Get-FileHashOrNull $dstPath
    if ($null -eq $dstHash -or $dstHash -ne $srcHash) {
        $mismatches.Add([pscustomobject]@{
            Kind = 'SEED'; Distro = (Split-Path $dstPath -Parent); Rel = $pair.target; Source = $srcPath; Target = $dstPath
        }) | Out-Null
    }
}

# =============================================================================
# Expected-state manifest freshness gate
# -----------------------------------------------------------------------------
# expected_state.json (one per distro, GENERATED by generate_expected_state.ps1)
# is the single source of authority the NON-GIT sync legs use to delete files a
# repo deletion removed (see that script's header). It must never ship stale, so
# this gate regenerates it and fails the push if the committed copy drifted -
# mirroring how the gate treats custom_jars_manifest.json (which is enforced via
# the WATCHED single-file parity passes above; the per-distro manifests can't use
# those passes because each has distro-relative relpaths and is NOT byte-
# identical across distros, so they get this dedicated freshness check instead).
#
# Behaviour:
#   default : regenerate in-memory and byte-compare (-Check); stale -> exit 1.
#   -Fix    : regenerate the manifests in place (then the byte-compare passes).
$GeneratorPath = Join-Path $ScriptDir 'generate_expected_state.ps1'
$expectedStateStale = $false
if (-not (Test-Path $GeneratorPath)) {
    Write-Host "[sync-distros] WARN: generate_expected_state.ps1 not found - skipping expected-state freshness check." -ForegroundColor Yellow
} else {
    if ($Fix) {
        Write-Host "[sync-distros] -Fix: regenerating expected_state.json manifests in place..."
        & $GeneratorPath
    } else {
        & $GeneratorPath -Check
        if ($LASTEXITCODE -ne 0) { $expectedStateStale = $true }
    }
}

# =============================================================================
# Custom-jar deployment consistency gate
# -----------------------------------------------------------------------------
# Every force-committed custom jar (custom_jars_manifest.json) must be byte-
# identical to the manifest SHA across the distros it belongs in (side-aware),
# plus our packwiz markers. Catches a half-deployed rebuild / stale distro copy
# / stale marker BEFORE the push ships it - a divergence that otherwise only
# surfaces consumer-side on the next sync, or never if an instance never
# re-syncs (the 2026-06-14 stale-codex-jar incident). verify-custom-jars.ps1
# owns the logic; -Fix re-copies the canonical jar to diverging/missing copies.
$CustomJarScript = Join-Path $ScriptDir 'verify-custom-jars.ps1'
$customJarBad = $false
if (-not (Test-Path $CustomJarScript)) {
    Write-Host "[sync-distros] WARN: verify-custom-jars.ps1 not found - skipping custom-jar gate." -ForegroundColor Yellow
} else {
    if ($Fix) { & $CustomJarScript -Fix } else { & $CustomJarScript -Check }
    if ($LASTEXITCODE -ne 0) { $customJarBad = $true }
}

if ($mismatches.Count -eq 0 -and -not $expectedStateStale -and -not $customJarBad) {
    Write-Host "[sync-distros] OK - all three distros in sync across $($Watched -join ', '); expected_state + custom jars consistent."
    exit 0
}

if ($mismatches.Count -gt 0) {
    Write-Host ""
    Write-Host "[sync-distros] $($mismatches.Count) mismatch(es) found:"
    Write-Host ""
    $mismatches | Format-Table Kind, Rel, @{n='Distro';e={Split-Path $_.Distro -Leaf}} -AutoSize
}

if ($expectedStateStale) {
    Write-Host ""
    Write-Host "[sync-distros] expected_state.json is STALE." -ForegroundColor Red
    Write-Host "[sync-distros] Regenerate: pwsh .minecraft/dev/generate_expected_state.ps1" -ForegroundColor Yellow
    Write-Host "[sync-distros] (or re-run this gate with -Fix), then commit the manifest(s)." -ForegroundColor Yellow
}

if (-not $Fix) {
    Write-Host ""
    if ($mismatches.Count -gt 0) {
        Write-Host "[sync-distros] Run with -Fix to copy main -> distros (and regenerate expected_state)."
        Write-Host "[sync-distros] Orphans are skipped by default; add -DeleteOrphans to remove them."
    }
    exit 1
}

if ($mismatches.Count -eq 0) {
    # -Fix was requested but there were no watched-path mismatches to copy.
    # expected_state was regenerated above and the custom-jar gate (-Fix) already
    # re-copied any diverging jars. If the custom-jar gate still fails it needs
    # regen_custom_jars_manifest.ps1 (manifest/marker), which -Fix does not do.
    if ($customJarBad) {
        Write-Host "[sync-distros] custom-jar gate still failing - run regen_custom_jars_manifest.ps1, then re-run." -ForegroundColor Red
        exit 1
    }
    Write-Host "[sync-distros] OK - distros in sync; expected_state regenerated; custom jars consistent."
    exit 0
}

# -Fix path
$fixedCount = 0
$skippedOrphans = 0
foreach ($m in $mismatches) {
    switch ($m.Kind) {
        'MISSING' {
            $dst = Join-Path $m.Distro $m.Rel
            $dstParent = Split-Path $dst -Parent
            if (-not (Test-Path $dstParent)) { New-Item -ItemType Directory -Force -Path $dstParent | Out-Null }
            Copy-Item $m.Source $dst -Force
            Write-Host "  fix MISSING:  $($m.Rel) -> $(Split-Path $m.Distro -Leaf)"
            $fixedCount++
        }
        'DIVERGED' {
            $dst = Join-Path $m.Distro $m.Rel
            Copy-Item $m.Source $dst -Force
            Write-Host "  fix DIVERGED: $($m.Rel) -> $(Split-Path $m.Distro -Leaf)"
            $fixedCount++
        }
        'SEED' {
            $dstParent = Split-Path $m.Target -Parent
            if (-not (Test-Path $dstParent)) { New-Item -ItemType Directory -Force -Path $dstParent | Out-Null }
            Copy-Item $m.Source $m.Target -Force
            Write-Host "  fix SEED:     $($m.Rel)"
            $fixedCount++
        }
        'ORPHAN' {
            if ($DeleteOrphans) {
                Remove-Item $m.Source -Force
                Write-Host "  fix ORPHAN:   deleted $($m.Source)"
                $fixedCount++
            } else {
                $skippedOrphans++
            }
        }
    }
}

Write-Host ""
Write-Host "[sync-distros] fixed $fixedCount; skipped $skippedOrphans orphan(s)."
if ($skippedOrphans -gt 0) {
    Write-Host "[sync-distros] re-run with -DeleteOrphans to remove orphan(s)."
}
if ($customJarBad) {
    Write-Host "[sync-distros] custom-jar gate still failing - run regen_custom_jars_manifest.ps1, then re-run." -ForegroundColor Red
    exit 1
}
exit 0
