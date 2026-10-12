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
#   3. World-backup health - the newest verified scheduled backup listed in the
#      server's backups\backups.json (written by icraft-gui; see section 11 of
#      the deployment guide) must exist with its recorded size and be recent:
#      GREEN under 13 h, YELLOW under 24 h, RED beyond that, with none, or when
#      the launcher's last attempt failed. Backups died silently for six months
#      once (the backup mod needed git on the PATH; the box's git is on none;
#      nothing alarmed), so
#      every run of this tool now looks. Pinned (manual-*) backups are counted
#      and sized: nothing deletes those but the operator. The same section ends
#      with one line from pull-server-backups.ps1 -Status: the off-box copy on
#      this PC (newest local copy, last pull, task). Informational only.
#   4. Boot-log check - loud\loud-check.ps1 over the server's logs\: KubeJS
#      handler aborts / load errors / ERROR lines, every deployed script loaded
#      and none stale, every "loaded / registered / armed" line of the liveness
#      manifest present, mixin / dependency / tick-loop / OOM / crash patterns.
#      A deploy can land byte-for-byte and still boot broken: `Error in
#      'LootJS.modifiers'` sat in every boot log for four months (twelve loot
#      scripts dead) while this tool said PARITY OK. The manifest is taken from
#      the commit the server is ON (it is versioned with the scripts), or from
#      origin/main when that commit predates it. Nothing is written to the box.
#      Lines of latest.log (ERROR) and of the KubeJS log (WARN) that are not in
#      dev\loud\baseline.json, and the known defects listed there, are AMBER:
#      printed, with no effect on the exit code. Everything else it finds is RED.
#   5. Local config overrides - informational, never changes the exit code. The
#      server's .icraft_config_overrides.json (launcher Customizer tab, or
#      `icraft settings`) lists config values the operator set ON THE SERVER on
#      purpose; the launcher writes them back into the config files before every
#      server start. This tool does not compare config files, but anyone who
#      diffs one against the repo will see them, so every run names them: they
#      are not drift, and "repairing" such a file undoes nothing (the launcher
#      puts the value back at the next start). Change them on the tab instead.
#   6. Launcher / server liveness - the launcher (icraft-gui) rewrites
#      .icraft_launcher_status next to server.properties every 15 s: its state,
#      the phase of a restart and since when, whether a JVM exists and since
#      when not, the log push, and how many frames a minute the window paints.
#      "Launcher up, JVM down for N min" is RED from 10 minutes: on 2026-10-11
#      a routine restart left the server down for 39 minutes behind a stalled
#      log push, the launcher looked alive, and no tool said "the server is
#      down". The launcher's own finding (a restart stage past its 10 minute
#      limit) is RED as well. A status file that has stopped being rewritten
#      (launcher closed, hung, or the box off) is YELLOW: from the share alone
#      this tool cannot tell what the JVM is doing then. A launcher older than
#      this check writes no file; that is reported and not judged.
#   7. Access posture - who can join. Reads server.properties (online-mode,
#      white-list, enforce-whitelist), counts whitelist.json and ops.json (a
#      player name is never printed) and looks for the switch on the
#      launcher's override list. RED when the whitelist is OFF on a public
#      server: until 2026-10-11 the live server ran for months with
#      online-mode=false and white-list=false, because the tracked
#      server.properties carries development values and every tool that
#      looked at the box looked at something else. YELLOW when the switch is
#      only an edit in the file (the next sync that rewrites the file would
#      switch it off), when the list is on and empty (nobody can join), or
#      when an entry carries a UUID the server will never match. Every run
#      says whether names are authenticated (online-mode). RED as well when
#      the launcher has REFUSED to start the server (.icraft_start_refused):
#      it does not start a server whose own whitelist or online-mode switch
#      could not be put back, and leaves the reason in that file.
#
# Usage (run from PowerShell - pwsh 7 or Windows PowerShell 5.1):
#   pwsh .minecraft\dev\verify-server.ps1                       # report; exit 0 parity / 1 real drift
#   pwsh .minecraft\dev\verify-server.ps1 -Verbose             # + likely-cause hint per finding
#   pwsh .minecraft\dev\verify-server.ps1 -ServerRoot "<path>" # non-default live server root
#   pwsh .minecraft\dev\verify-server.ps1 -NoPull              # skip the step-0 working-tree pull (still fetches origin)
#   pwsh .minecraft\dev\verify-server.ps1 -Fix                 # STOP THE SERVER FIRST: copy correct jar(s) onto live
#   pwsh .minecraft\dev\verify-server.ps1 -NotPublic           # a server the internet cannot reach: whitelist off is YELLOW, not RED
#
# Exit codes: 0 = parity (or noise-only lag); 1 = real drift; 2 = setup error;
#             3 = parity, but the world backups are RED (stale / none / failed);
#             4 = parity and backups fine, but the boot-log check is RED: failures
#                 or could not run (server still starting, logs unreadable);
#             5 = parity, but the SERVER IS DOWN or a restart is stuck: the
#                 launcher is up and no JVM has existed for 10 minutes or more.
#                 Reported ahead of 3 and 4 (a down server usually trips 4 too).
#             6 = parity and the server is up, but ACCESS IS RED: the whitelist
#                 is off on a public server (or server.properties is unreadable).
#                 Reported ahead of 3 and 4, behind 5.
# Read-only by default. -Fix is the only mutating mode and only ever WRITES to
# the live server root (never the repo). It surfaces drift; it does NOT fix the
# underlying launcher cause (manifest-blind GUI cleanup / marker short-circuit /
# fail-open API) - that is a separate launcher-hardening job.
# =============================================================================

[CmdletBinding()]
param(
    [string]$ServerRoot = "Z:\Users\silvariazemaitis\Desktop\IridescentCraft Dedicated Server",
    [switch]$Fix,
    [switch]$NoPull,
    [switch]$NotPublic
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
# 3. WORLD-BACKUP HEALTH  (backups\backups.json, written by icraft-gui)
# =============================================================================
# Reads only the manifest and file sizes - never the zips themselves (1+ GB each
# over the share). The launcher verified each zip (CRC + size + entry set) before
# listing it; this check answers "is there a recent one, and is it still there?".
function Format-Span {
    param([double]$Seconds)
    if ($Seconds -lt 0) { $Seconds = 0 }
    $h = [int][math]::Floor($Seconds / 3600)
    $m = [int][math]::Floor(($Seconds % 3600) / 60)
    if ($h -gt 0) { return ('{0}h{1:00}m' -f $h, $m) }
    return ('{0}m' -f $m)
}
function Format-Bytes {
    param([double]$Bytes)
    if ($Bytes -ge 1GB) { return ('{0:n2} GiB' -f ($Bytes / 1GB)) }
    return ('{0:n1} MiB' -f ($Bytes / 1MB))
}
# created_utc is an ISO-8601 string in Windows PowerShell 5.1, but pwsh 7's
# ConvertFrom-Json hands the same value back as a [datetime]. Take either.
function ConvertTo-UtcDate {
    param($Value)
    if ($Value -is [datetime]) { return $Value.ToUniversalTime() }
    try {
        return [DateTimeOffset]::Parse([string]$Value, [Globalization.CultureInfo]::InvariantCulture).UtcDateTime
    } catch { return $null }
}

$backupDir    = Join-Path $ServerRoot 'backups'
$backupState  = 'RED'      # GREEN | YELLOW | RED
$backupLine   = $null
$backupNotes  = New-Object System.Collections.Generic.List[string]
$backupHours  = 12         # launcher default; .icraft_backup_policy may override
$backupPolicy = Join-Path $ServerRoot '.icraft_backup_policy'
if (Test-Path -LiteralPath $backupPolicy) {
    foreach ($pl in (Get-Content -LiteralPath $backupPolicy)) {
        $t = ($pl -replace '#.*$', '').Trim()
        if ($t -match '^interval_hours\s*=\s*(\d+)$') { $backupHours = [int]$matches[1] }
        if ($t -match '^mode\s*=\s*off$') { $backupNotes.Add('scheduled backups are switched OFF in .icraft_backup_policy') | Out-Null }
    }
}
$greenBelow  = ($backupHours + 1) * 3600
$yellowBelow = [math]::Max($backupHours * 2 * 3600, $greenBelow)

$backupManifestPath = Join-Path $backupDir 'backups.json'
if (-not (Test-Path -LiteralPath $backupManifestPath)) {
    $backupLine = "no backups\backups.json on the server - no managed world backup has been taken yet (the launcher takes the first one on its next Cycle)"
} else {
    $bm = $null
    try {
        $bmRaw = (Get-Content -LiteralPath $backupManifestPath -Raw) -replace "^﻿", ''
        $bm = $bmRaw | ConvertFrom-Json
    } catch {
        $backupLine = "backups\backups.json does not parse: $($_.Exception.Message)"
    }
    if ($null -ne $bm) {
        $scheduled = New-Object System.Collections.Generic.List[object]
        $pinnedCount = 0; $pinnedBytes = [double]0
        foreach ($b in @($bm.backups)) {
            if ($null -eq $b) { continue }
            $bPath = Join-Path $backupDir ([string]$b.file)
            $onDisk = Get-Item -LiteralPath $bPath -ErrorAction SilentlyContinue
            if ($null -eq $onDisk -or $onDisk.Length -ne [int64]$b.size) {
                $backupNotes.Add("listed but missing or resized on disk: $($b.file)") | Out-Null
                continue
            }
            if ([string]$b.file -like 'manual-*') {
                $pinnedCount++; $pinnedBytes += [double]$b.size
                continue
            }
            $when = ConvertTo-UtcDate $b.created_utc
            if ($null -eq $when) { $backupNotes.Add("unreadable created_utc on $($b.file)") | Out-Null; continue }
            $scheduled.Add([pscustomobject]@{ File = [string]$b.file; When = $when; Size = [double]$b.size; Files = $b.world_files }) | Out-Null
        }
        if ($pinnedCount -gt 0) {
            $backupNotes.Add(("{0} pinned (manual) backup(s), {1} - never pruned; delete them when they have served their purpose" -f $pinnedCount, (Format-Bytes $pinnedBytes))) | Out-Null
        }
        if ($scheduled.Count -eq 0) {
            $backupLine = "backups.json lists no scheduled backup that is still on disk"
        } else {
            $newest = $scheduled | Sort-Object When -Descending | Select-Object -First 1
            $ageSec = ((Get-Date).ToUniversalTime() - $newest.When).TotalSeconds
            $desc = ("newest scheduled backup {0} is {1} old ({2} files, {3}; {4} kept)" -f $newest.File, (Format-Span $ageSec), $newest.Files, (Format-Bytes $newest.Size), $scheduled.Count)
            if ($ageSec -lt $greenBelow)      { $backupState = 'GREEN' }
            elseif ($ageSec -lt $yellowBelow) { $backupState = 'YELLOW' }
            $backupLine = $desc
        }
        if ($null -ne $bm.last_attempt -and $bm.last_attempt.ok -eq $false) {
            $backupState = 'RED'
            $backupNotes.Add("the launcher's LAST ATTEMPT FAILED ($($bm.last_attempt.at_utc)): $($bm.last_attempt.note)") | Out-Null
        }
    }
}

# =============================================================================
# 4. BOOT-LOG CHECK  (loud\loud-check.ps1 over the live logs; run in the report)
# =============================================================================
# The checker runs as its own process (its `exit` and error settings stay its
# own) and prints straight to the console. Its exit code: 0 clean, 1 findings,
# 2 could not check.
$loudScript   = Join-Path (Join-Path $ScriptDir 'loud') 'loud-check.ps1'
$loudLogs     = Join-Path $ServerRoot 'logs'
$loudExit     = $null      # stays $null when the checker could not even be started
$loudWorst    = $null      # GREEN / AMBER / RED as the checker's status file states it
$loudOpen     = 0
$loudNote     = $null
$loudManifest = $null      # temp copy of the manifest the server's commit carries
$loudFrom     = 'the working tree'
if (-not (Test-Path -LiteralPath $loudScript -PathType Leaf)) {
    $loudNote = "loud-check.ps1 not found at $loudScript"
} else {
    $loudRel = '.minecraft/dev/loud/liveness_manifest.json'
    $revs = @()
    if (-not [string]::IsNullOrWhiteSpace($marker) -and -not $markerProblem) { $revs += $marker }
    $revs += 'origin/main'
    foreach ($rev in $revs) {
        $txt = (& git -C $RepoRoot show "${rev}:$loudRel" 2>$null) -join "`n"
        if ($LASTEXITCODE -eq 0 -and -not [string]::IsNullOrWhiteSpace($txt)) {
            $loudManifest = Join-Path ([System.IO.Path]::GetTempPath()) ('icraft-liveness-' + [Guid]::NewGuid().ToString('N').Substring(0, 8) + '.json')
            [System.IO.File]::WriteAllText($loudManifest, $txt, (New-Object System.Text.UTF8Encoding $false))
            $loudFrom = if ($rev -eq 'origin/main') { 'origin/main (the commit the server is on has none)' } else { "the server's commit $(Short12 $rev)" }
            break
        }
    }
}

# =============================================================================
# 6. LAUNCHER / SERVER LIVENESS  (.icraft_launcher_status, written by icraft-gui)
# =============================================================================
# >>> liveness
function Get-LauncherLiveness {
    param([string]$Root, [int64]$NowUnix)
    $downRedMin = 10      # launcher up + no JVM for this long = RED
    $staleMin   = 3       # a status older than this is not being rewritten any more
    $r = [pscustomobject]@{ State = 'NONE'; Line = $null; Notes = (New-Object System.Collections.Generic.List[string]) }
    $statusPath = Join-Path $Root '.icraft_launcher_status'
    if (-not (Test-Path -LiteralPath $statusPath)) {
        $r.Line = 'no .icraft_launcher_status on the server: the launcher there predates this check (or has never run). Liveness is not judged.'
        return $r
    }
    $st = @{}
    try {
        foreach ($sl in (Get-Content -LiteralPath $statusPath -ErrorAction Stop)) {
            if ($sl -match '^\s*#' -or $sl -notmatch '=') { continue }
            $kv = $sl -split '=', 2
            $st[$kv[0].Trim()] = $kv[1].Trim()
        }
    } catch {
        $r.State = 'YELLOW'
        $r.Line = "the launcher status file is unreadable: $($_.Exception.Message)"
        return $r
    }
    $num = {
        param($key)
        $n = [int64]0
        if ([int64]::TryParse([string]$st[$key], [ref]$n)) { return $n }
        return [int64]0
    }
    $written = & $num 'written_unix'
    $span = {
        param([int64]$from)
        if ($from -le 0) { return '?' }
        $s = [math]::Max([int64]0, $NowUnix - $from)
        if ($s -ge 3600) { return ('{0}h{1:00}m' -f [int][math]::Floor($s / 3600), [int][math]::Floor(($s % 3600) / 60)) }
        return ('{0} min' -f [int][math]::Floor($s / 60))
    }
    $push = [string]$st['log_push']
    if ($push) {
        $r.Notes.Add("log push: $push") | Out-Null
    }
    $fpm = & $num 'frames_per_min'
    if ($fpm -gt 120) {
        $r.Notes.Add("the launcher window paints $fpm frames a minute: it is repainting continuously (a full core on the server's software renderer)") | Out-Null
    }
    if ($written -le 0) {
        $r.State = 'YELLOW'
        $r.Line = 'the launcher status file carries no timestamp'
        return $r
    }
    $ageSec = $NowUnix - $written
    if ($ageSec -gt ($staleMin * 60)) {
        $r.State = 'YELLOW'
        $r.Line = ("the launcher has not rewritten its status for {0} (last: {1}, server {2}). It is closed or hung, or the box is off; this tool cannot tell from the share whether the server is up." -f (& $span $written), $st['written'], $st['server_state'])
        return $r
    }
    $phase = [string]$st['phase']
    $why = "phase: $phase"
    if ($st['heartbeat']) { $why += "; heartbeat: $($st['heartbeat'])" }
    if ($st['stuck']) {
        $r.State = 'RED'
        $r.Line = "launcher up, restart $($st['stuck'])"
        return $r
    }
    if ($st['jvm_running'] -ne 'true') {
        $downSince = & $num 'jvm_down_since_unix'
        $downMin = if ($downSince -gt 0) { [int][math]::Floor([math]::Max([int64]0, $NowUnix - $downSince) / 60) } else { 0 }
        if ($downMin -ge $downRedMin) {
            $r.State = 'RED'
            $r.Line = "launcher up, JVM down for $downMin min ($why)"
        } else {
            $r.State = 'YELLOW'
            $r.Line = "launcher up, JVM down for $downMin min ($why). A restart takes a few minutes: run this again; it turns RED at $downRedMin."
        }
        return $r
    }
    if ($st['server_state'] -eq 'Started') {
        $r.State = 'GREEN'
        $r.Line = "launcher up, server up (Started for $(& $span (& $num 'phase_since_unix')))"
    } else {
        $r.State = 'YELLOW'
        $r.Line = "launcher up, JVM running, server $($st['server_state']) for $(& $span (& $num 'phase_since_unix')) ($why)"
    }
    return $r
}
# <<< liveness
$live = Get-LauncherLiveness -Root $ServerRoot -NowUnix ([DateTimeOffset]::UtcNow.ToUnixTimeSeconds())

# =============================================================================
# 7. ACCESS POSTURE  (server.properties, whitelist.json, the override list)
# =============================================================================
# >>> access
# The UUID an offline-mode server gives a player of this exact name (the same
# arithmetic as server_distribution\manage_whitelist.ps1, which has the why).
function Get-OfflineUuid {
    param([string]$Name)
    $md5 = [System.Security.Cryptography.MD5]::Create()
    try { $h = $md5.ComputeHash([System.Text.Encoding]::UTF8.GetBytes("OfflinePlayer:$Name")) } finally { $md5.Dispose() }
    $h[6] = ($h[6] -band 0x0f) -bor 0x30
    $h[8] = ($h[8] -band 0x3f) -bor 0x80
    $hex = -join ($h | ForEach-Object { $_.ToString('x2') })
    return ('{0}-{1}-{2}-{3}-{4}' -f $hex.Substring(0, 8), $hex.Substring(8, 4), $hex.Substring(12, 4), $hex.Substring(16, 4), $hex.Substring(20, 12))
}
# Counts only: a player name never appears in this tool's output, which gets
# pasted into reports and into a public repository's issues.
function Get-AccessPosture {
    param([string]$Root, [bool]$Public)
    $r = [pscustomobject]@{ State = 'GREEN'; Line = $null; Notes = (New-Object System.Collections.Generic.List[string]); Refused = $false }
    # The launcher's start guard: a server whose own whitelist / online-mode
    # switch could not be put back is NOT started, and this file says why. It is
    # removed by the next start the launcher allows.
    $refusedPath = Join-Path $Root '.icraft_start_refused'
    if (Test-Path -LiteralPath $refusedPath) {
        $why = '(no reason in the file)'; $when = '?'
        foreach ($l in (Get-Content -LiteralPath $refusedPath -ErrorAction SilentlyContinue)) {
            if ($l -match '^why=(.*)$') { $why = $matches[1] }
            if ($l -match '^refused=(.*)$') { $when = $matches[1] }
        }
        $r.State = 'RED'
        $r.Refused = $true
        $r.Line = "THE LAUNCHER REFUSED TO START THE SERVER ($when): $why"
        $r.Notes.Add('The server is down ON PURPOSE: started as it was, it would have run with its whitelist or online mode off.') | Out-Null
        $r.Notes.Add('On the server: put the value into server.properties (or repair .icraft_config_overrides.json), then press Cycle in the launcher. "icraft settings start-check" repeats the check without starting anything.') | Out-Null
        return $r
    }
    $p = @{}
    try {
        foreach ($l in (Get-Content -LiteralPath (Join-Path $Root 'server.properties') -ErrorAction Stop)) {
            if ($l -match '^\s*#' -or $l -notmatch '=') { continue }
            $kv = $l -split '=', 2
            $p[$kv[0].Trim()] = $kv[1].Trim()
        }
    } catch {
        $r.State = 'RED'
        $r.Line = "server.properties could not be read ($($_.Exception.Message)): who can join this server is unknown"
        return $r
    }
    $online = ($p['online-mode'] -eq 'true')
    $wlOn   = ($p['white-list'] -eq 'true')
    $enf    = ($p['enforce-whitelist'] -eq 'true')

    $readList = {
        param([string]$file)
        $res = [pscustomobject]@{ Present = $false; Items = @(); Error = $null }
        $fp = Join-Path $Root $file
        if (-not (Test-Path -LiteralPath $fp -PathType Leaf)) { return $res }
        $res.Present = $true
        try {
            $raw = ([System.IO.File]::ReadAllText($fp, [System.Text.Encoding]::UTF8)).TrimStart([char]0xFEFF)
            if ($raw.Trim()) {
                # two steps: Windows PowerShell 5.1 hands a JSON array down the pipeline as ONE object
                $parsed = $raw | ConvertFrom-Json
                $res.Items = @($parsed | Where-Object { $null -ne $_ })
            }
        } catch { $res.Error = $_.Exception.Message }
        return $res
    }
    $wl  = & $readList 'whitelist.json'
    $ops = & $readList 'ops.json'
    $entries = @($wl.Items).Count
    $wrong = 0
    if (-not $online) {
        foreach ($e in @($wl.Items)) {
            if ([string]$e.uuid -ne (Get-OfflineUuid ([string]$e.name))) { $wrong++ }
        }
    }

    # Is the switch on the launcher's override list, i.e. put back before every
    # server start whatever a sync did to the file?
    $pin = @{}
    $ovError = $null
    $ovPath = Join-Path $Root '.icraft_config_overrides.json'
    if (Test-Path -LiteralPath $ovPath) {
        try {
            foreach ($o in @((Get-Content -LiteralPath $ovPath -Raw -Encoding UTF8 | ConvertFrom-Json).overrides)) {
                if ($null -eq $o) { continue }
                if (([string]$o.file).ToLower() -eq 'server.properties' -and -not $o.revert) { $pin[[string]$o.key] = [string]$o.value }
            }
        } catch { $ovError = $_.Exception.Message }
    }
    $pinnedOn = ($pin['white-list'] -eq 'true')

    $summary = ('online-mode={0}, white-list={1}, enforce-whitelist={2}; {3} whitelist entr{4}, {5} operator(s)' -f `
        $online.ToString().ToLower(), $wlOn.ToString().ToLower(), $enf.ToString().ToLower(), `
        $entries, $(if ($entries -eq 1) { 'y' } else { 'ies' }), @($ops.Items).Count)

    if (-not $wlOn) {
        if ($pinnedOn) {
            $r.State = 'YELLOW'
            $r.Line = "$summary. The file says white-list=false and the override list puts true back before the next server start (a sync has rewritten the file, or the override was set while the server ran). The RUNNING server keeps what it started with."
        } elseif ($Public) {
            $r.State = 'RED'
            $anyName = ''
            if (-not $online) { $anyName = ', under any name they choose' }
            $r.Line = "$summary. THE WHITELIST IS OFF on a public server: anyone who installs the pack can join$anyName."
        } else {
            $r.State = 'YELLOW'
            $r.Line = "$summary. The whitelist is off; accepted because -NotPublic says this server cannot be reached from the internet."
        }
    } elseif ($entries -eq 0) {
        $r.State = 'YELLOW'
        $r.Line = "$summary. The whitelist is on and empty: NOBODY can join (operators excepted). Add players with manage_whitelist.ps1."
    } elseif (-not $pinnedOn) {
        $r.State = 'YELLOW'
        $r.Line = "$summary. white-list=true is only an edit in the file, not on the override list: the next sync that rewrites server.properties switches the whitelist OFF. Pin it:  icraft settings pin server.properties white-list --pack-value false"
    } else {
        $r.Line = "$summary. The switch is on the override list: the launcher puts it back before every server start."
    }

    if ($wl.Error) {
        if ($r.State -eq 'GREEN') { $r.State = 'YELLOW' }
        $r.Notes.Add("whitelist.json does not parse ($($wl.Error)): the server may start with an empty list") | Out-Null
    }
    if ($wrong -gt 0) {
        if ($r.State -eq 'GREEN') { $r.State = 'YELLOW' }
        $r.Notes.Add("$wrong whitelist entr$(if ($wrong -eq 1) { 'y has' } else { 'ies have' }) a UUID that is not the offline UUID of the name (made by the console's 'whitelist add'?): refused at login. manage_whitelist.ps1 -Check names them.") | Out-Null
    }
    if ($ovError) {
        $r.Notes.Add("the override list is unreadable ($ovError): the launcher applies NO override until it is repaired") | Out-Null
    }
    if ($enf -and $pin['enforce-whitelist'] -ne 'true') {
        $r.Notes.Add('enforce-whitelist=true is not on the override list: a sync that rewrites the file resets it') | Out-Null
    }
    if ($wlOn -and -not $enf) {
        $r.Notes.Add('enforce-whitelist=false: a player taken off the list stays online until they leave') | Out-Null
    }
    if (-not $online) {
        $r.Notes.Add('online-mode=false: names are NOT authenticated. The whitelist keeps strangers out; it does not stop someone who signs in under a listed player''s name. Only online mode closes that.') | Out-Null
    }
    return $r
}
# <<< access
$access = Get-AccessPosture -Root $ServerRoot -Public (-not $NotPublic)

# =============================================================================
# REPORT
# =============================================================================
Write-Host ""
Write-Host "===================== verify-server: LIVE vs origin/main =====================" -ForegroundColor Cyan
Write-Host ("  origin/main : {0}" -f $originHead)
Write-Host ("  server root : {0}" -f $ServerRoot)
Write-Host ("  live marker : {0}" -f $(if ($marker) { $marker } else { '(absent)' }))
Write-Host ""

Write-Host "-- launcher / server liveness (.icraft_launcher_status) --" -ForegroundColor Cyan
$liveColor = 'DarkGray'
if ($live.State -eq 'GREEN')  { $liveColor = 'Green' }
if ($live.State -eq 'YELLOW') { $liveColor = 'Yellow' }
if ($live.State -eq 'RED')    { $liveColor = 'Red' }
Write-Host ("  {0}: {1}" -f $(if ($live.State -eq 'NONE') { 'NOT JUDGED' } else { $live.State }), $live.Line) -ForegroundColor $liveColor
foreach ($n in $live.Notes) { Write-Host ("    - {0}" -f $n) -ForegroundColor $(if ($n -match 'FAILED|continuously') { 'Yellow' } else { 'DarkGray' }) }
if ($IsVerbose -and $live.State -eq 'RED') {
    Write-Host "    cause: the launcher is alive and the server is not. List the launcher's CHILD processes on the box (name, pid, start time, CPU - never command lines) twice, a minute apart: a child with an old start time and no CPU is what it is waiting on. logs\restart_policy.log has the stop time and any WATCHDOG line. See deployment guide section 14." -ForegroundColor DarkYellow
}
Write-Host ""

Write-Host "-- access (server.properties, whitelist.json, the override list) --" -ForegroundColor Cyan
$accessColor = 'Green'
if ($access.State -eq 'YELLOW') { $accessColor = 'Yellow' }
if ($access.State -eq 'RED')    { $accessColor = 'Red' }
Write-Host ("  {0}: {1}" -f $access.State, $access.Line) -ForegroundColor $accessColor
foreach ($n in $access.Notes) { Write-Host ("    - {0}" -f $n) -ForegroundColor DarkYellow }
if ($IsVerbose -and $access.State -eq 'RED') {
    Write-Host "    cause: server.properties in the repo carries the pack's development values (white-list=false). A full-zip sync, or any pack change to that file, puts them back unless the switch is on the launcher's override list. See deployment guide section 15." -ForegroundColor DarkYellow
}
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

Write-Host ""
Write-Host ("-- world-backup health (backups\backups.json; green < {0}, red >= {1}) --" -f (Format-Span $greenBelow), (Format-Span $yellowBelow)) -ForegroundColor Cyan
$backupColor = 'Red'
if ($backupState -eq 'GREEN')  { $backupColor = 'Green' }
if ($backupState -eq 'YELLOW') { $backupColor = 'Yellow' }
Write-Host ("  {0}: {1}" -f $backupState, $backupLine) -ForegroundColor $backupColor
foreach ($n in $backupNotes) { Write-Host ("    - {0}" -f $n) -ForegroundColor DarkYellow }
if ($IsVerbose -and $backupState -ne 'GREEN') {
    Write-Host "    cause: read logs\backup.log on the server (every decision and failure is there). A backup is taken in a Cycle's stopped window once the newest one is older than the interval; 'none yet' right after the launcher shipped just means no Cycle has happened since." -ForegroundColor DarkYellow
}
# The off-box copy: pull-server-backups.ps1 (a Scheduled Task on this PC) reports
# in one line. Printed on every run so a dead pull job cannot go unseen the way
# the backups themselves once did. Informational: it never changes the exit code.
$pullTool = Join-Path $ScriptDir 'pull-server-backups.ps1'
if (Test-Path -LiteralPath $pullTool) {
    try { & $pullTool -Status } catch { Write-Host ("  off-box copy: status unavailable ({0})" -f $_.Exception.Message) -ForegroundColor Yellow }
}

Write-Host ""
Write-Host "-- local config overrides (.icraft_config_overrides.json; informational) --" -ForegroundColor Cyan
$ovPath = Join-Path $ServerRoot '.icraft_config_overrides.json'
if (-not (Test-Path -LiteralPath $ovPath)) {
    Write-Host "  none: no config value on the server was set apart from the pack's." -ForegroundColor Green
} else {
    try {
        $ovList  = @((Get-Content -LiteralPath $ovPath -Raw -Encoding UTF8 | ConvertFrom-Json).overrides)
        $ovFiles = @($ovList | ForEach-Object { $_.file } | Sort-Object -Unique)
        Write-Host ("  INTENTIONAL: {0} value(s) in {1} config file(s) are the operator's own (launcher Customizer tab). NOT drift: the launcher writes them back before every server start, so do not 'repair' these files." -f $ovList.Count, $ovFiles.Count) -ForegroundColor Yellow
        foreach ($o in $ovList) {
            $ovState = 'in the file as of the last server start'
            if ($o.revert) { $ovState = 'being reset to the pack value at the next server start' }
            elseif ([string]$o.written -ne [string]$o.value) { $ovState = 'waiting for the next server start' }
            Write-Host ("    {0} :: {1} = {2}   (the pack's: {3})   {4}" -f $o.file, $o.key, $o.value, $o.base, $ovState)
        }
    } catch {
        Write-Host ("  UNREADABLE: {0}" -f $_.Exception.Message) -ForegroundColor Red
        Write-Host "    The launcher applies no override until that file is repaired or removed." -ForegroundColor Red
    }
}

Write-Host ""
Write-Host ("-- boot-log check (loud-check.ps1 over logs\; liveness manifest from {0}) --" -f $loudFrom) -ForegroundColor Cyan
if ($loudNote) {
    Write-Host ("  COULD NOT CHECK: {0}" -f $loudNote) -ForegroundColor Red
} else {
    # The verdict (GREEN / AMBER / RED) is read from the checker's status file. It is written, with the
    # findings log, to two temp files on THIS PC: nothing lands on the box.
    $loudTmp = Join-Path ([System.IO.Path]::GetTempPath()) ('icraft-loud-' + [Guid]::NewGuid().ToString('N').Substring(0, 8))
    $loudArgs = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $loudScript, '-LogsDir', $loudLogs,
                  '-Write', '-FindingsPath', ($loudTmp + '.findings.jsonl'), '-StatusPath', ($loudTmp + '.status'))
    if ($loudManifest) { $loudArgs += @('-Manifest', $loudManifest) }
    try {
        & (Get-Process -Id $PID).Path @loudArgs
        $loudExit = $LASTEXITCODE
        if (Test-Path -LiteralPath ($loudTmp + '.status')) {
            foreach ($sl in [System.IO.File]::ReadAllLines($loudTmp + '.status')) {
                if ($sl -match '^worst=(\w+)$') { $loudWorst = $matches[1] }
                if ($sl -match '^open=(\d+)$')  { $loudOpen = [int]$matches[1] }
            }
        }
    } catch {
        $loudNote = "loud-check.ps1 could not be started: $($_.Exception.Message)"
        Write-Host ("  COULD NOT CHECK: {0}" -f $loudNote) -ForegroundColor Red
    }
    Remove-Item -LiteralPath ($loudTmp + '.findings.jsonl'), ($loudTmp + '.status') -Force -ErrorAction SilentlyContinue
    if ($loudManifest) { Remove-Item -LiteralPath $loudManifest -Force -ErrorAction SilentlyContinue }
    if ($IsVerbose -and $loudExit -eq 2) {
        Write-Host "    cause: exit 2 = a check could not run. Right after a Cycle the server is still starting (no 'Done' line yet): wait for the banner and run this again." -ForegroundColor DarkYellow
    }
}
# 'GREEN' only on a clean exit, 'AMBER' only when the checker itself says its worst finding is AMBER
# (signatures not in the baseline, known defects that are not fixed): anything else, and any exit code
# the status file does not explain, is RED.
$loudState = 'RED'
if ($loudExit -eq 0) { $loudState = 'GREEN' }
elseif ($loudExit -eq 1 -and $loudWorst -eq 'AMBER') { $loudState = 'AMBER' }
$loudAmberLine = "$loudOpen line(s) in the boot log that are not accepted: new signatures or known defects (listed above). Read them; fix, or accept in dev\loud\baseline.json with a reason"
$loudLine = "the boot-log check found failures (exit $loudExit): see the findings above"
if ($null -eq $loudExit) { $loudLine = "the boot-log check could not run: $loudNote" }
elseif ($loudExit -eq 2) { $loudLine = 'the boot-log check could not judge the boot (exit 2): see the CHECK-FAILED line(s) above' }

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
    if ($live.State -eq 'RED') {
        Write-Host "=== SERVER DOWN ===" -ForegroundColor Red
        Write-Host ("    {0}" -f $live.Line) -ForegroundColor Red
        Write-Host "    -> the deploy is where it should be and nobody can play: find what the launcher is waiting on (deployment guide section 14) before anything else." -ForegroundColor Yellow
        if ($access.State -eq 'RED') {
            Write-Host "=== ACCESS RED (as well) ===" -ForegroundColor Red
            Write-Host ("    {0}" -f $access.Line) -ForegroundColor Red
        }
        if ($backupState -eq 'RED') {
            Write-Host "=== BACKUPS RED (as well) ===" -ForegroundColor Red
            Write-Host ("    {0}" -f $backupLine) -ForegroundColor Red
        }
        if ($loudState -eq 'RED') {
            Write-Host "=== BOOT LOG RED (as well) ===" -ForegroundColor Red
            Write-Host ("    {0}" -f $loudLine) -ForegroundColor Red
        }
        exit 5
    }
    if ($live.State -eq 'YELLOW') {
        Write-Host ("    liveness YELLOW: {0}" -f $live.Line) -ForegroundColor Yellow
    }
    if ($access.State -eq 'RED') {
        Write-Host "=== ACCESS RED ===" -ForegroundColor Red
        Write-Host ("    {0}" -f $access.Line) -ForegroundColor Red
        if ($access.Refused) {
            Write-Host "    -> the server was NOT started, rather than started open. Fix the cause on the server, then press Cycle in the launcher (a remote Cycle request is declined while no server is up). Deployment guide section 15j." -ForegroundColor Yellow
        } else {
            Write-Host "    -> the deploy is fine and the door is open. On the server: white-list=true in server.properties, pin it (icraft settings pin server.properties white-list --pack-value false), restart. Deployment guide section 15." -ForegroundColor Yellow
        }
        if ($backupState -eq 'RED') {
            Write-Host "=== BACKUPS RED (as well) ===" -ForegroundColor Red
            Write-Host ("    {0}" -f $backupLine) -ForegroundColor Red
        }
        if ($loudState -eq 'RED') {
            Write-Host "=== BOOT LOG RED (as well) ===" -ForegroundColor Red
            Write-Host ("    {0}" -f $loudLine) -ForegroundColor Red
        }
        exit 6
    }
    if ($access.State -eq 'YELLOW') {
        Write-Host ("    access YELLOW: {0}" -f $access.Line) -ForegroundColor Yellow
    }
    if ($backupState -eq 'RED') {
        Write-Host "=== BACKUPS RED ===" -ForegroundColor Red
        Write-Host ("    {0}" -f $backupLine) -ForegroundColor Red
        Write-Host "    -> the deploy is fine, the world backups are not: see logs\backup.log on the server." -ForegroundColor Yellow
        if ($loudState -eq 'RED') {
            Write-Host "=== BOOT LOG RED (as well) ===" -ForegroundColor Red
            Write-Host ("    {0}" -f $loudLine) -ForegroundColor Red
        }
        exit 3
    }
    if ($backupState -eq 'YELLOW') {
        Write-Host ("    backups YELLOW: {0}" -f $backupLine) -ForegroundColor Yellow
    }
    if ($loudState -eq 'AMBER') {
        Write-Host ("    boot log AMBER: {0}" -f $loudAmberLine) -ForegroundColor Yellow
    }
    if ($loudState -eq 'RED') {
        Write-Host "=== BOOT LOG RED ===" -ForegroundColor Red
        Write-Host ("    {0}" -f $loudLine) -ForegroundColor Red
        Write-Host "    -> the deploy landed, and the server is not healthy on it. Fix at the repo source, push, Cycle; a server that is still starting needs a few minutes and a second run." -ForegroundColor Yellow
        exit 4
    }
    exit 0
}
if ($live.State -eq 'RED') {
    Write-Host "=== SERVER DOWN (as well as the drift below) ===" -ForegroundColor Red
    Write-Host ("    {0}" -f $live.Line) -ForegroundColor Red
}
if ($access.State -eq 'RED') {
    Write-Host "=== ACCESS RED (as well as the drift below) ===" -ForegroundColor Red
    Write-Host ("    {0}" -f $access.Line) -ForegroundColor Red
}
if ($backupState -eq 'RED') {
    Write-Host "=== BACKUPS RED (as well as the drift below) ===" -ForegroundColor Red
    Write-Host ("    {0}" -f $backupLine) -ForegroundColor Red
}
if ($loudState -eq 'RED') {
    Write-Host "=== BOOT LOG RED (as well as the drift below) ===" -ForegroundColor Red
    Write-Host ("    {0}" -f $loudLine) -ForegroundColor Red
}
if ($loudState -eq 'AMBER') {
    Write-Host ("    boot log AMBER: {0}" -f $loudAmberLine) -ForegroundColor Yellow
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
