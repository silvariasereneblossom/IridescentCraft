# =============================================================================
# verify-custom-jars.ps1 - custom-jar deployment consistency gate
# =============================================================================
# The custom (force-committed) jars listed in custom_jars_manifest.json must be
# byte-identical across the distro mods/ folders they belong in, and match the
# manifest SHA-256 (the single source of truth). This catches a "half-deployed
# rebuild" (a distro copy left on old content) and the forgot-to-regen-the-
# manifest footgun BEFORE a push ships it - a divergence that otherwise only
# surfaces consumer-side (cleanup_stale_jars.ps1) on the next sync, or never if
# a client/instance does not re-sync (the 2026-06-14 stale-codex-jar incident).
#
# CANONICAL SOURCE = .minecraft/mods/<jar> (the main copy the manifest is
# generated from). Distro copies must equal it.
#
# SIDE-AWARE: each jar is only required in the distros matching its packwiz
# `side` (both -> main+server+client; client -> main+client; server ->
# main+server), read from mods/.index/<marker>.pw.toml. This avoids false
# positives on legitimately client-only / server-only jars.
#
# Also flags STALE PACKWIZ MARKERS: a mods/.index/*.pw.toml whose [download]
# hash != the manifest SHA (the marker-drift class fixed 2026-06-14). Markers
# and the manifest are owned by regen_custom_jars_manifest.ps1, so marker/
# manifest staleness is REPORTED with a pointer to regen rather than auto-fixed.
#
# Usage (from anywhere inside the repo):
#   pwsh .minecraft\dev\verify-custom-jars.ps1            # report; exit 1 on any issue
#   pwsh .minecraft\dev\verify-custom-jars.ps1 -Check     # alias of default (for the gate)
#   pwsh .minecraft\dev\verify-custom-jars.ps1 -Fix       # re-copy canonical jar to diverging/missing distro copies
#   pwsh .minecraft\dev\verify-custom-jars.ps1 -Instance "<PrismLauncher>\instances\IridescentCraft" [-Fix]
#                                                          # verify/replace a deployed INSTANCE's custom jars vs the repo canonical
#
# Exit codes: 0 = all consistent (or -Fix fully resolved); 1 = issues remain.
# Windows PowerShell 5.1 compatible (no ternary / ?. ), runs under pwsh 7 too.
# =============================================================================

[CmdletBinding()]
param(
    [switch]$Fix,
    [switch]$Check,  # accepted for symmetry with the other gates; default already reports
    [string]$Instance  # verify/fix a deployed INSTANCE's mods/ vs the repo canonical instead of the 3 distros
)

$ErrorActionPreference = 'Stop'

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Mc = (Resolve-Path (Join-Path $ScriptDir '..')).Path           # .minecraft
$ManifestPath = Join-Path $Mc 'custom_jars_manifest.json'
if (-not (Test-Path $ManifestPath)) {
    Write-Error "[verify-custom-jars] manifest not found: $ManifestPath"
    exit 2
}

# Distro roots relative to .minecraft. 'main' is .minecraft itself (canonical).
$DistroRel = @{
    'main'   = '.'
    'server' = 'server_distribution'
    'client' = 'distribution\client'
}

function Get-ShaOrNull {
    param([string]$Path)
    if (Test-Path -LiteralPath $Path -PathType Leaf) {
        return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLower()
    }
    return $null
}

# --- Build filename -> side map from main's packwiz index (default 'both') ---
$sideOf = @{}
$mainIndex = Join-Path $Mc 'mods\.index'
if (Test-Path $mainIndex) {
    Get-ChildItem -LiteralPath $mainIndex -Filter *.pw.toml -File | ForEach-Object {
        $txt = Get-Content -Raw -LiteralPath $_.FullName
        if ($txt -match "(?m)^\s*filename\s*=\s*'([^']+)'") {
            $fn = $Matches[1]
            $side = 'both'
            if ($txt -match "(?m)^\s*side\s*=\s*'([^']+)'") { $side = $Matches[1] }
            $sideOf[$fn] = $side
        }
    }
}

$manifest = Get-Content -Raw $ManifestPath | ConvertFrom-Json
$jarNames = @($manifest.jars.PSObject.Properties.Name)

# =============================================================================
# -Instance mode: verify (and -Fix) a deployed PrismLauncher INSTANCE's custom
# jars against this repo's canonical (committed jars + manifest). Catches an
# off-git / stale jar in an instance WITHOUT a full relaunch. Pass the instance
# root OR its .minecraft; -Fix copies the repo's canonical jar over a stale/
# missing one (atomic temp+move). Server-only jars are skipped (a client
# instance is not expected to carry them).
# =============================================================================
if ($Instance) {
    $instMc = $null
    if (Test-Path (Join-Path $Instance '.minecraft\mods')) { $instMc = (Resolve-Path (Join-Path $Instance '.minecraft')).Path }
    elseif (Test-Path (Join-Path $Instance 'mods'))        { $instMc = (Resolve-Path $Instance).Path }
    if (-not $instMc) {
        Write-Error "[verify-custom-jars] no mods/ found under -Instance '$Instance' (pass the instance root or its .minecraft)."
        exit 2
    }
    $instMods = Join-Path $instMc 'mods'
    Write-Host "[verify-custom-jars] -Instance target: $instMc  (canonical = this repo)" -ForegroundColor DarkGray

    $instStale = New-Object System.Collections.Generic.List[object]
    foreach ($jar in $jarNames) {
        $side = 'both'
        if ($sideOf.ContainsKey($jar)) { $side = $sideOf[$jar] }
        if ($side -eq 'server') { continue }   # server-only jar not expected in a client instance

        $manSha  = ([string]$manifest.jars.$jar.sha256).ToLower()
        $repoJar = Join-Path (Join-Path $Mc 'mods') $jar
        $instJar = Join-Path $instMods $jar
        $instSha = Get-ShaOrNull $instJar
        if ($null -eq $instSha) {
            $instStale.Add([pscustomobject]@{ Kind='MISSING'; Jar=$jar; ManSha=$manSha; Src=$repoJar; Dst=$instJar }) | Out-Null
        } elseif ($instSha -ne $manSha) {
            $instStale.Add([pscustomobject]@{ Kind='STALE';   Jar=$jar; ManSha=$manSha; Src=$repoJar; Dst=$instJar }) | Out-Null
        }
    }

    if ($instStale.Count -eq 0) {
        Write-Host "[verify-custom-jars] OK - the instance's custom jars all match the repo canonical." -ForegroundColor Green
        exit 0
    }
    Write-Host ""
    Write-Host "[verify-custom-jars] $($instStale.Count) instance jar(s) off-git / out of date vs the repo:" -ForegroundColor Yellow
    $instStale | Format-Table Kind, Jar -AutoSize | Out-String | Write-Host

    if (-not $Fix) {
        Write-Host "[verify-custom-jars] Re-run with -Fix to copy the repo's canonical jar(s) into the instance." -ForegroundColor Yellow
        exit 1
    }
    $fixed = 0; $failed = 0
    foreach ($s in $instStale) {
        $srcSha = Get-ShaOrNull $s.Src
        if ($null -eq $srcSha) {
            Write-Host "  [skip] $($s.Jar): repo canonical jar missing - rebuild it in the repo first." -ForegroundColor Yellow
            $failed++; continue
        }
        if ($srcSha -ne $s.ManSha) {
            Write-Host "  [skip] $($s.Jar): repo jar != manifest - run regen_custom_jars_manifest.ps1 / rebuild first." -ForegroundColor Yellow
            $failed++; continue
        }
        try {
            $parent = Split-Path $s.Dst -Parent
            if (-not (Test-Path $parent)) { New-Item -ItemType Directory -Force -Path $parent | Out-Null }
            $tmp = "$($s.Dst).icrafttmp"
            Remove-Item $tmp -Force -ErrorAction SilentlyContinue
            Copy-Item -LiteralPath $s.Src -Destination $tmp -Force
            Move-Item -LiteralPath $tmp -Destination $s.Dst -Force
            Write-Host "  fix $($s.Kind): $($s.Jar)" -ForegroundColor Green
            $fixed++
        } catch {
            Write-Host "  [FAIL] $($s.Jar): $($_.Exception.Message)" -ForegroundColor Red
            $failed++
        }
    }
    Write-Host ""
    Write-Host "[verify-custom-jars] instance fix: $fixed replaced, $failed unresolved." -ForegroundColor Cyan
    if ($failed -gt 0) { exit 1 }
    exit 0
}

$copyIssues   = New-Object System.Collections.Generic.List[object]   # fixable: distro jar MISSING/DIVERGED
$manifestStale = New-Object System.Collections.Generic.List[string]  # main jar != manifest -> regen
$mainMissing   = New-Object System.Collections.Generic.List[string]  # canonical jar absent -> rebuild

foreach ($jar in $jarNames) {
    $manSha = ([string]$manifest.jars.$jar.sha256).ToLower()
    $side = 'both'
    if ($sideOf.ContainsKey($jar)) { $side = $sideOf[$jar] }

    # which distros this jar belongs in
    $targets = @('main')
    if ($side -eq 'both')   { $targets = @('main','server','client') }
    elseif ($side -eq 'client') { $targets = @('main','client') }
    elseif ($side -eq 'server') { $targets = @('main','server') }

    $mainPath = Join-Path $Mc 'mods'
    $mainPath = Join-Path $mainPath $jar
    $mainSha = Get-ShaOrNull $mainPath
    if ($null -eq $mainSha) {
        $mainMissing.Add($jar) | Out-Null
        continue   # no canonical source to compare/copy from
    }
    if ($mainSha -ne $manSha) { $manifestStale.Add($jar) | Out-Null }

    foreach ($t in $targets) {
        if ($t -eq 'main') { continue }
        $dPath = Join-Path (Join-Path $Mc $DistroRel[$t]) 'mods'
        $dPath = Join-Path $dPath $jar
        $dSha = Get-ShaOrNull $dPath
        if ($null -eq $dSha) {
            $copyIssues.Add([pscustomobject]@{ Kind='MISSING'; Jar=$jar; Distro=$t; Path=$dPath; Source=$mainPath; CanCopy=($mainSha -eq $manSha) }) | Out-Null
        } elseif ($dSha -ne $manSha) {
            $copyIssues.Add([pscustomobject]@{ Kind='DIVERGED'; Jar=$jar; Distro=$t; Path=$dPath; Source=$mainPath; CanCopy=($mainSha -eq $manSha) }) | Out-Null
        }
    }
}

# --- Stale packwiz markers: main mods/.index/*.pw.toml hash vs manifest sha ---
# ONLY our own jars carry a restamped sha256 marker pointing at the raw-GitHub
# committed copy; third-party packwiz markers hold the UPSTREAM hash (sha1 /
# curseforge / modrinth) with different semantics, so skip those (they would
# always "mismatch" the sha256 manifest - a false positive).
$markerStale = New-Object System.Collections.Generic.List[string]
if (Test-Path $mainIndex) {
    Get-ChildItem -LiteralPath $mainIndex -Filter *.pw.toml -File | ForEach-Object {
        $txt = Get-Content -Raw -LiteralPath $_.FullName
        $isOurs = ($txt -match 'raw\.githubusercontent\.com/silvariasereneblossom') -and ($txt -match "(?m)^\s*hash-format\s*=\s*'sha256'")
        if ($isOurs -and $txt -match "(?m)^\s*filename\s*=\s*'([^']+)'") {
            $fn = $Matches[1]
            if ($jarNames -contains $fn) {
                $manSha = ([string]$manifest.jars.$fn.sha256).ToLower()
                if ($txt -match "(?m)^\s*hash\s*=\s*'([0-9a-fA-F]+)'") {
                    if ($Matches[1].ToLower() -ne $manSha) { $markerStale.Add("$($_.Name) ($fn)") | Out-Null }
                }
            }
        }
    }
}

$issueCount = $copyIssues.Count + $manifestStale.Count + $mainMissing.Count + $markerStale.Count
if ($issueCount -eq 0) {
    Write-Host "[verify-custom-jars] OK - $($jarNames.Count) custom jars consistent across their distros (jars + markers match the manifest)." -ForegroundColor Green
    exit 0
}

Write-Host ""
Write-Host "[verify-custom-jars] $issueCount issue(s):" -ForegroundColor Yellow
if ($mainMissing.Count -gt 0) {
    Write-Host "  CANONICAL JAR MISSING from .minecraft/mods/ (rebuild it):" -ForegroundColor Red
    $mainMissing | ForEach-Object { Write-Host "    - $_" }
}
if ($copyIssues.Count -gt 0) {
    $copyIssues | Format-Table Kind, Jar, Distro -AutoSize | Out-String | Write-Host
}
if ($manifestStale.Count -gt 0) {
    Write-Host "  MAIN JAR != MANIFEST (rebuilt without regen, or manifest stale) -> run regen_custom_jars_manifest.ps1:" -ForegroundColor Red
    $manifestStale | ForEach-Object { Write-Host "    - $_" }
}
if ($markerStale.Count -gt 0) {
    Write-Host "  STALE PACKWIZ MARKER hash (mods/.index) -> run regen_custom_jars_manifest.ps1:" -ForegroundColor Red
    $markerStale | ForEach-Object { Write-Host "    - $_" }
}

if (-not $Fix) {
    Write-Host ""
    Write-Host "[verify-custom-jars] Run with -Fix to re-copy the canonical jar to diverging/missing distro copies." -ForegroundColor Yellow
    Write-Host "[verify-custom-jars] (manifest/marker staleness is fixed by regen_custom_jars_manifest.ps1, not -Fix.)" -ForegroundColor Yellow
    exit 1
}

# --- -Fix: re-copy canonical main jar to diverging/missing distro copies ---
$fixed = 0
foreach ($c in $copyIssues) {
    if (-not $c.CanCopy) {
        Write-Host "  skip $($c.Jar) -> $($c.Distro): main jar != manifest; regen first." -ForegroundColor Yellow
        continue
    }
    $parent = Split-Path $c.Path -Parent
    if (-not (Test-Path $parent)) { New-Item -ItemType Directory -Force -Path $parent | Out-Null }
    Copy-Item -LiteralPath $c.Source -Destination $c.Path -Force
    Write-Host "  fix $($c.Kind): $($c.Jar) -> $($c.Distro)"
    $fixed++
}
Write-Host ""
Write-Host "[verify-custom-jars] re-copied $fixed distro jar copy(ies)."

# Did anything that -Fix can't resolve remain?
$unresolved = $mainMissing.Count + $manifestStale.Count + $markerStale.Count + (@($copyIssues | Where-Object { -not $_.CanCopy }).Count)
if ($unresolved -gt 0) {
    Write-Host "[verify-custom-jars] $unresolved issue(s) need regen_custom_jars_manifest.ps1 / a rebuild (not -Fix)." -ForegroundColor Yellow
    exit 1
}
exit 0
