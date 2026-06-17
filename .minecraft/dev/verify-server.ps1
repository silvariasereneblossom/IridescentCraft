# =============================================================================
# verify-server.ps1 - LIVE dedicated-server <-> origin/main parity checker
# =============================================================================
# Answers the one question the operator cares about after a deploy cycle:
#   "did my push actually LAND on the live dedicated server?"
#
# THE KEY LESSON (why this tool reads origin, never the local working tree):
#   The correct comparison is  LIVE SERVER  vs  origin/main  (the canonical
#   PUSHED state) - NOT live vs the local working-tree clone. A stale local
#   checkout gives false STALE/OK verdicts: on 2026-06-16 the local tree was
#   9 commits BEHIND origin, which would have made a current server look stale
#   (and could make a stale server look fine). So every canonical value here is
#   read from a freshly-fetched origin/main via `git show` / `git ls-tree`, run
#   from PowerShell so the `origin/main:path` ref is NOT MSYS path-mangled
#   (that bit us during the original diagnosis).
#
# Sibling tool: verify-custom-jars.ps1 (same dir) checks distro/instance jar
#   consistency against the LOCAL repo canonical. THIS tool is the orthogonal
#   LIVE-vs-ORIGIN axis; it reuses the same hashing/compare approach
#   (Get-FileHash SHA-256, side/tree-aware skip, atomic temp+move on -Fix).
#
# What it checks
#   1. Custom-jar parity - every jar committed to origin's
#      server_distribution/mods/ tree must exist on the live server with the
#      manifest's SHA-256. Manifest jars NOT in that tree (the per-distro
#      manifest is a SUPERSET copy of main's and carries client-side jars like
#      mek_walkable_cables) are skipped: they are not deployed to a server.
#   2. Git-marker parity - the server's .icraft_last_sha vs origin/main:
#      commits-behind, classified NOISE (only .icraft_head_sha / .icraft_last_sha
#      / TesterLogs/** / "stamp HEAD [skip ci]" auto-mirror commits) vs real
#      content drift (anything else).
#
# Usage (run from PowerShell - pwsh 7 or Windows PowerShell 5.1):
#   pwsh .minecraft\dev\verify-server.ps1                       # report; exit 0 parity / 1 real drift
#   pwsh .minecraft\dev\verify-server.ps1 -Verbose             # + likely-cause hint per finding
#   pwsh .minecraft\dev\verify-server.ps1 -ServerRoot "<path>" # non-default live server root
#   pwsh .minecraft\dev\verify-server.ps1 -NoPull              # skip the step-0 working-tree pull (still fetches origin)
#   pwsh .minecraft\dev\verify-server.ps1 -Fix                 # STOP THE SERVER FIRST: copy correct jar(s) onto live
#
# Exit codes: 0 = parity (or noise-only lag); 1 = real drift; 2 = setup error.
# Read-only by default. -Fix is the only mutating mode and only ever WRITES to
# the live server root (never the repo). It surfaces drift; it does NOT fix the
# underlying launcher cause (manifest-blind GUI cleanup / marker short-circuit /
# fail-open API) - that is a separate launcher-hardening job.
# =============================================================================

[CmdletBinding()]
param(
    [string]$ServerRoot = "Z:\Users\silvariazemaitis\Desktop\IridescentCraft Dedicated Server",
    [switch]$Fix,
    [switch]$NoPull
)

# Continue (not Stop): this script makes many native `git` calls, several with
# `2>$null` to tolerate expected failures (unknown marker, missing ref). Under
# 'Stop', a redirected native stderr line becomes a terminating NativeCommandError
# in Windows PowerShell 5.1 - so we run Continue and put explicit -ErrorAction Stop
# only on the cmdlets where we actually depend on catch/abort.
$ErrorActionPreference = 'Continue'
$IsVerbose = ($VerbosePreference -ne 'SilentlyContinue')

# --- locate repo root (this script lives in .minecraft\dev) -------------------
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
try {
    $Mc       = (Resolve-Path (Join-Path $ScriptDir '..') -ErrorAction Stop).Path   # .minecraft
    $RepoRoot = (Resolve-Path (Join-Path $Mc '..') -ErrorAction Stop).Path          # repo root (.git)
} catch {
    Write-Error "[verify-server] cannot resolve repo paths from script location: $($_.Exception.Message)"
    exit 2
}

# --- helpers -----------------------------------------------------------------
function Get-ShaOrNull {
    param([string]$Path)
    if (Test-Path -LiteralPath $Path -PathType Leaf) {
        return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLower()
    }
    return $null
}
function Short12 {
    param([string]$s)
    if ([string]::IsNullOrEmpty($s)) { return '(none)' }
    if ($s.Length -le 12) { return $s }
    return $s.Substring(0, 12)
}
# A changed path that does NOT represent real content drift: the sync/stamp
# auto-mirror files the CI bot and the server itself write back to the repo.
# Matched by LEAF (the sha markers) and by SEGMENT (TesterLogs) because these
# live nested, not at repo root - e.g. the "server logs auto-mirror" commits
# touch .minecraft/server_distribution/TesterLogs/Server Logs/*.log[.gz], and
# the stamp commits touch a top-level (or nested) .icraft_head_sha.
function Test-NoisePath {
    param([string]$p)
    if ([string]::IsNullOrWhiteSpace($p)) { return $true }
    $leaf = $p.Split('/')[-1]
    if ($leaf -eq '.icraft_head_sha') { return $true }
    if ($leaf -eq '.icraft_last_sha') { return $true }
    if ($p -match '(^|/)TesterLogs/')  { return $true }
    return $false
}

# --- sanity: git present + this is a repo -------------------------------------
try { $null = & git --version 2>$null } catch {
    Write-Error "[verify-server] git not found on PATH."
    exit 2
}
& git -C $RepoRoot rev-parse --git-dir 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Error "[verify-server] not a git repo at $RepoRoot"
    exit 2
}

# --- sanity: live server root reachable --------------------------------------
if (-not (Test-Path -LiteralPath $ServerRoot)) {
    Write-Error "[verify-server] -ServerRoot not found / not reachable: $ServerRoot`n(Is the Z: drive / network share mapped?)"
    exit 2
}
$ServerMods = Join-Path $ServerRoot 'mods'
if (-not (Test-Path -LiteralPath $ServerMods)) {
    Write-Error "[verify-server] live mods/ not found under server root: $ServerMods"
    exit 2
}

Write-Host "[verify-server] canonical = freshly-fetched origin/main (NOT the local working tree)." -ForegroundColor DarkGray

# --- step 0: bring the local tree current (best-effort; non-fatal) -----------
# The verdict reads from origin/main directly, so a failed pull never affects
# correctness - it only means -Fix's repo-side source jars might be stale (which
# -Fix guards against by sha anyway).
if (-not $NoPull) {
    Write-Host "[verify-server] step 0: git pull --ff-only origin main" -ForegroundColor DarkGray
    & git -C $RepoRoot pull --ff-only origin main
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[verify-server] note: local pull --ff-only did not succeed (dirty / diverged / non-main branch). Continuing - canonical is read from origin/main directly." -ForegroundColor Yellow
    }
}

# --- fetch origin so origin/main is fresh ------------------------------------
& git -C $RepoRoot fetch origin --quiet
if ($LASTEXITCODE -ne 0) {
    Write-Host "[verify-server] warning: git fetch origin failed (offline?). Using last-known origin/main." -ForegroundColor Yellow
}

$originHead = "$(& git -C $RepoRoot rev-parse origin/main 2>$null)".Trim()
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($originHead)) {
    Write-Error "[verify-server] cannot resolve origin/main (remote ref never fetched?)."
    exit 2
}

# --- canonical manifest from origin (NOT the working-tree copy) --------------
$manifestRel = '.minecraft/server_distribution/custom_jars_manifest.json'
$mfRaw = (& git -C $RepoRoot show "origin/main:$manifestRel") -join "`n"
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($mfRaw)) {
    Write-Error "[verify-server] cannot read $manifestRel from origin/main."
    exit 2
}
$mfRaw = $mfRaw -replace '^﻿', ''   # strip a leading BOM that breaks ConvertFrom-Json on PS 5.1
try { $manifest = $mfRaw | ConvertFrom-Json } catch {
    Write-Error "[verify-server] origin manifest is not valid JSON: $($_.Exception.Message)"
    exit 2
}
$jarNames = @($manifest.jars.PSObject.Properties.Name)

# --- the set of jars actually DEPLOYED to the server distro (origin tree) -----
# This is the authoritative "expected on a dedicated server" set. A manifest jar
# absent from this tree is a client-side superset entry, not server drift.
$serverTreeRaw = & git -C $RepoRoot ls-tree -r --name-only origin/main -- ".minecraft/server_distribution/mods"
$serverJars = @()
foreach ($line in $serverTreeRaw) {
    if ($line -like '*.jar') { $serverJars += (Split-Path $line -Leaf) }
}
if ($serverJars.Count -eq 0) {
    Write-Error "[verify-server] origin server_distribution/mods tree is empty/unreadable - aborting rather than reporting a false PARITY OK."
    exit 2
}
$serverJarSet = @{}
foreach ($j in $serverJars) { $serverJarSet[$j] = $true }
$manifestSet = @{}
foreach ($j in $jarNames) { $manifestSet[$j] = $true }

# =============================================================================
# 1. CUSTOM-JAR PARITY  (live SHA-256 vs origin manifest)
# =============================================================================
$ok             = New-Object System.Collections.Generic.List[object]
$stale          = New-Object System.Collections.Generic.List[object]
$missing        = New-Object System.Collections.Generic.List[object]
$expectedAbsent = New-Object System.Collections.Generic.List[object]

foreach ($jar in $jarNames) {
    $manSha = ([string]$manifest.jars.$jar.sha256).ToLower()
    if (-not $serverJarSet.ContainsKey($jar)) {
        $livePresent = Test-Path -LiteralPath (Join-Path $ServerMods $jar)
        $expectedAbsent.Add([pscustomobject]@{ Jar = $jar; LivePresent = $livePresent }) | Out-Null
        continue
    }
    $liveSha = Get-ShaOrNull (Join-Path $ServerMods $jar)
    if ($null -eq $liveSha) {
        $missing.Add([pscustomobject]@{ Jar = $jar; ManSha = $manSha }) | Out-Null
    } elseif ($liveSha -ne $manSha) {
        $stale.Add([pscustomobject]@{ Jar = $jar; ManSha = $manSha; LiveSha = $liveSha }) | Out-Null
    } else {
        $ok.Add([pscustomobject]@{ Jar = $jar }) | Out-Null
    }
}

# orphan = a CUSTOM jar physically on live (in the force-committed server set,
# or an iridescent_* mod) that the origin manifest does not track.
$orphans = New-Object System.Collections.Generic.List[string]
Get-ChildItem -LiteralPath $ServerMods -Filter *.jar -File | ForEach-Object {
    $name = $_.Name
    $isCustom = $serverJarSet.ContainsKey($name) -or ($name -like 'iridescent_*')
    if ($isCustom -and -not $manifestSet.ContainsKey($name)) {
        $orphans.Add($name) | Out-Null
    }
}

# =============================================================================
# 2. GIT-MARKER PARITY  (.icraft_last_sha vs origin/main)
# =============================================================================
$markerPath = Join-Path $ServerRoot '.icraft_last_sha'
$marker = $null
if (Test-Path -LiteralPath $markerPath) {
    $marker = ("$(Get-Content -LiteralPath $markerPath -Raw)").Trim()
}

$markerProblem  = $null
$totalBehind    = 0
$contentCommits = 0
$realChanged    = @()
$noiseOnly      = $false

if ([string]::IsNullOrWhiteSpace($marker)) {
    $markerProblem = "marker file .icraft_last_sha is missing or empty"
} else {
    & git -C $RepoRoot cat-file -e "$marker^{commit}" 2>$null
    if ($LASTEXITCODE -ne 0) {
        $markerProblem = "marker SHA $marker is not a commit in origin history (force-push, or a corrupted/foreign marker)"
    } elseif ($marker -ne $originHead) {
        $totalBehind = [int]("$(& git -C $RepoRoot rev-list --count "$marker..origin/main")".Trim())
        $aheadOfOrigin = [int]("$(& git -C $RepoRoot rev-list --count "origin/main..$marker")".Trim())
        if ($aheadOfOrigin -gt 0) {
            $markerProblem = "marker is $aheadOfOrigin commit(s) AHEAD of origin/main (the server synced to an unpushed commit?)"
        }
        $overall = & git -C $RepoRoot diff --name-only "$marker..origin/main"
        $realChanged = @($overall | Where-Object { $_ -and -not (Test-NoisePath $_) })
        foreach ($h in (& git -C $RepoRoot log --format="%H" "$marker..origin/main")) {
            if ([string]::IsNullOrWhiteSpace($h)) { continue }
            $hasReal = $false
            foreach ($f in (& git -C $RepoRoot diff-tree --no-commit-id --name-only -r $h)) {
                if ($f -and -not (Test-NoisePath $f)) { $hasReal = $true; break }
            }
            if ($hasReal) { $contentCommits++ }
        }
        if ($totalBehind -gt 0 -and $contentCommits -eq 0) { $noiseOnly = $true }
    }
}

# =============================================================================
# REPORT
# =============================================================================
Write-Host ""
Write-Host "===================== verify-server: LIVE vs origin/main =====================" -ForegroundColor Cyan
Write-Host ("  origin/main : {0}" -f $originHead)
Write-Host ("  server root : {0}" -f $ServerRoot)
Write-Host ("  live marker : {0}" -f $(if ($marker) { $marker } else { '(absent)' }))
Write-Host ""

Write-Host "-- custom-jar parity (origin manifest -> live SHA-256) --" -ForegroundColor Cyan
Write-Host ("  OK: {0}/{1} server-deployed jars match origin." -f $ok.Count, $serverJars.Count) -ForegroundColor Green
foreach ($s in $stale) {
    Write-Host ("  STALE            {0}  repo={1} live={2}" -f $s.Jar, (Short12 $s.ManSha), (Short12 $s.LiveSha)) -ForegroundColor Red
    if ($IsVerbose) { Write-Host "                     cause: stale custom jar => the GUI Cycle's manifest-blind cleanup (copies by filename, not hash, so a rebuilt same-name jar is never refreshed)." -ForegroundColor DarkYellow }
}
foreach ($m in $missing) {
    Write-Host ("  MISSING-ON-LIVE  {0}  (expected; repo={1})" -f $m.Jar, (Short12 $m.ManSha)) -ForegroundColor Red
    if ($IsVerbose) { Write-Host "                     cause: deploy never copied it, or cleanup removed it as 'unknown' (manifest-blind)." -ForegroundColor DarkYellow }
}
foreach ($o in $orphans) {
    Write-Host ("  ORPHAN           {0}  (custom jar on live, not in origin manifest)" -f $o) -ForegroundColor Yellow
    if ($IsVerbose) { Write-Host "                     cause: manifest regen skipped after an add/remove, or a manual jar drop on the server." -ForegroundColor DarkYellow }
}
if ($expectedAbsent.Count -gt 0) {
    Write-Host ("  ({0} manifest jar(s) skipped: client-side, not deployed to the server distro)" -f $expectedAbsent.Count) -ForegroundColor DarkGray
    if ($IsVerbose) {
        foreach ($e in $expectedAbsent) {
            $note = if ($e.LivePresent) { 'present on live but harmless (client-side, not server-managed)' } else { 'absent on live (correct - client-side)' }
            Write-Host ("     skip {0}  {1}" -f $e.Jar, $note) -ForegroundColor DarkGray
        }
    }
}

Write-Host ""
Write-Host "-- git-marker parity (.icraft_last_sha -> origin/main) --" -ForegroundColor Cyan
if ($markerProblem) {
    Write-Host ("  PROBLEM: {0}" -f $markerProblem) -ForegroundColor Red
} elseif ($totalBehind -eq 0) {
    Write-Host "  marker == origin/main (server is on the canonical commit)." -ForegroundColor Green
} elseif ($noiseOnly) {
    Write-Host ("  {0} commit(s) behind - ALL auto-mirror/stamp NOISE; server content is current." -f $totalBehind) -ForegroundColor Green
    if ($IsVerbose) { Write-Host "    (changed paths are only .icraft_head_sha / .icraft_last_sha / TesterLogs/** / 'stamp HEAD [skip ci]' commits.)" -ForegroundColor DarkGray }
} else {
    Write-Host ("  {0} commit(s) behind, of which {1} carry real content:" -f $totalBehind, $contentCommits) -ForegroundColor Red
    foreach ($f in ($realChanged | Select-Object -First 40)) { Write-Host ("    + {0}" -f $f) }
    if ($realChanged.Count -gt 40) { Write-Host ("    ... and {0} more changed path(s)" -f ($realChanged.Count - 40)) }
    if ($IsVerbose) { Write-Host "    cause: content commits behind => the server's sync short-circuited - ICRAFT_SERVICE_MODE skips phase0 sync, or the GUI blind-trusts .icraft_last_sha and never pulled (phase0 also fails OPEN on the 60/hr GitHub API limit)." -ForegroundColor DarkYellow }
}

# =============================================================================
# -Fix (opt-in): copy the correct repo jar onto live for STALE / MISSING jars
# =============================================================================
$fixableCount = $stale.Count + $missing.Count
if ($Fix -and $fixableCount -gt 0) {
    Write-Host ""
    Write-Host "-- -Fix: copy correct jar(s) from the repo onto the live server --" -ForegroundColor Cyan
    Write-Host "  WARNING: STOP THE DEDICATED SERVER FIRST. Jars held open by the running JVM" -ForegroundColor Yellow
    Write-Host "           cannot be replaced and will be reported LOCKED (skipped)." -ForegroundColor Yellow
    $srcDir = Join-Path (Join-Path $Mc 'server_distribution') 'mods'
    $fixed = 0; $unresolved = 0
    $toFix = @()
    foreach ($s in $stale)   { $toFix += [pscustomobject]@{ Jar = $s.Jar; ManSha = $s.ManSha; Kind = 'STALE' } }
    foreach ($m in $missing) { $toFix += [pscustomobject]@{ Jar = $m.Jar; ManSha = $m.ManSha; Kind = 'MISSING' } }
    foreach ($t in $toFix) {
        $src = Join-Path $srcDir $t.Jar
        $srcSha = Get-ShaOrNull $src
        if ($null -eq $srcSha) {
            Write-Host ("  [skip] {0}: repo source jar absent ({1}). git pull / rebuild first." -f $t.Jar, $src) -ForegroundColor Yellow
            $unresolved++; continue
        }
        if ($srcSha -ne $t.ManSha) {
            Write-Host ("  [skip] {0}: repo jar (sha {1}) != origin manifest (sha {2}); local tree is behind - git pull, then -Fix." -f $t.Jar, (Short12 $srcSha), (Short12 $t.ManSha)) -ForegroundColor Yellow
            $unresolved++; continue
        }
        $dst = Join-Path $ServerMods $t.Jar
        $tmp = "$dst.icrafttmp"
        try {
            Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue
            Copy-Item -LiteralPath $src -Destination $tmp -Force -ErrorAction Stop
            Move-Item -LiteralPath $tmp -Destination $dst -Force -ErrorAction Stop
            Write-Host ("  fixed {0,-8} {1}" -f $t.Kind, $t.Jar) -ForegroundColor Green
            $fixed++
        } catch {
            Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue
            $msg = $_.Exception.Message
            if ($msg -match 'being used by another process' -or $msg -match 'denied' -or $msg -match 'cannot access the file') {
                Write-Host ("  [LOCKED] {0}: jar in use - STOP THE SERVER and re-run -Fix." -f $t.Jar) -ForegroundColor Red
            } else {
                Write-Host ("  [FAIL] {0}: {1}" -f $t.Jar, $msg) -ForegroundColor Red
            }
            $unresolved++
        }
    }
    Write-Host ""
    Write-Host ("  -Fix: {0} jar(s) replaced, {1} unresolved (locked / source stale)." -f $fixed, $unresolved) -ForegroundColor Cyan
    if ($contentCommits -gt 0) {
        Write-Host ("  note: -Fix only repairs jars; the {0} content commit(s) behind need a server RE-SYNC (icraft-gui Cycle / phase0_sync) to pull origin/main." -f $contentCommits) -ForegroundColor Yellow
    }
    # recompute post-fix so the summary/exit reflect reality
    if ($fixed -gt 0) {
        $newStale = New-Object System.Collections.Generic.List[object]
        foreach ($s in $stale)   { if ((Get-ShaOrNull (Join-Path $ServerMods $s.Jar)) -ne $s.ManSha) { $newStale.Add($s)   | Out-Null } }
        $stale = $newStale
        $newMissing = New-Object System.Collections.Generic.List[object]
        foreach ($m in $missing) { if ($null -eq (Get-ShaOrNull (Join-Path $ServerMods $m.Jar)))     { $newMissing.Add($m) | Out-Null } }
        $missing = $newMissing
    }
} elseif ($Fix -and $fixableCount -eq 0) {
    Write-Host ""
    Write-Host "[verify-server] -Fix: no stale/missing jars to repair." -ForegroundColor DarkGray
}

# =============================================================================
# SUMMARY + EXIT CODE
# =============================================================================
$staleN   = $stale.Count
$missingN = $missing.Count
$orphanN  = $orphans.Count
$jarDrift = $staleN + $missingN + $orphanN
$realDrift = ($jarDrift -gt 0) -or ($contentCommits -gt 0) -or ($null -ne $markerProblem)

Write-Host ""
if (-not $realDrift) {
    Write-Host "=== PARITY OK ===" -ForegroundColor Green
    $mk = if ($totalBehind -eq 0) { 'current' } elseif ($noiseOnly) { "$totalBehind noise-only commit(s) behind" } else { 'current' }
    Write-Host ("    {0}/{1} server jars match origin/main; marker {2}." -f $ok.Count, $serverJars.Count, $mk) -ForegroundColor Green
    exit 0
}

if ($jarDrift -eq 0 -and $contentCommits -eq 0 -and $markerProblem) {
    Write-Host "=== DRIFT: marker unverifiable (jars match origin) ===" -ForegroundColor Red
    Write-Host ("    {0}" -f $markerProblem) -ForegroundColor Red
    exit 1
}

Write-Host ("=== DRIFT: {0} stale, {1} missing, {2} orphan jar(s) + {3} content commit(s) behind ===" -f $staleN, $missingN, $orphanN, $contentCommits) -ForegroundColor Red
if ($markerProblem) { Write-Host ("    marker problem: {0}" -f $markerProblem) -ForegroundColor Red }
if (-not $Fix -and ($staleN + $missingN) -gt 0) {
    Write-Host "    -> re-run with -Fix (STOP THE SERVER FIRST) to copy the correct jar(s) onto live." -ForegroundColor Yellow
}
if ($contentCommits -gt 0) {
    Write-Host "    -> content commits behind: RE-SYNC the server (icraft-gui Cycle / phase0_sync) to pull origin/main." -ForegroundColor Yellow
}
exit 1
