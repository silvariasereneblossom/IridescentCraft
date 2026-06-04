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

if ($mismatches.Count -eq 0) {
    Write-Host "[sync-distros] OK - all three distros in sync across $($Watched -join ', ')"
    exit 0
}

Write-Host ""
Write-Host "[sync-distros] $($mismatches.Count) mismatch(es) found:"
Write-Host ""
$mismatches | Format-Table Kind, Rel, @{n='Distro';e={Split-Path $_.Distro -Leaf}} -AutoSize

if (-not $Fix) {
    Write-Host ""
    Write-Host "[sync-distros] Run with -Fix to copy main -> distros."
    Write-Host "[sync-distros] Orphans are skipped by default; add -DeleteOrphans to remove them."
    exit 1
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
exit 0
