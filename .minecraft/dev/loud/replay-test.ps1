# =============================================================================
# replay-test.ps1 - prove loud-check.ps1 against the boots we already know
# =============================================================================
# Three parts, all read-only for the repo (everything is extracted to a temp dir):
#
#   REPLAY   Every mirrored version of logs/kubejs/server.log in git history is one
#            JVM exit. The 45 versions up to f1e9c511 (2026-07-06 .. 2026-10-11) are
#            the measured set: 41 boots with `Error in 'LootJS.modifiers'`, 2 with
#            `1 errors` after the first fix batch, 2 healthy. Each one is checked out
#            together with the expected_state.json of its commit and run through the
#            checker, oldest first, into ONE findings log. The checker must be RED on
#            the 43 and GREEN on the 2, and the verdict of every boot must agree with
#            a plain grep done here (so the test does not grade the checker with the
#            checker). After the last, healthy boot the findings log must have
#            nothing open: everything the bad boots opened was closed.
#   PLANTED  The full logs of the healthy anchor boot, with one defect planted at a
#            time (an ARMED line removed, a script not loaded, a stale script, a
#            must_not line, a count under its floor, no `Done`, an OutOfMemoryError,
#            a signature missing from a baseline). Each must produce exactly its
#            finding. The replay alone would not prove these: the bad boots are RED
#            for their ERROR lines whatever the liveness tiers do.
#            Then STALE baseline entries (check 6): entries whose line is gone, with
#            earlier boots written next to the log as rotated files. Stale only after
#            two complete boots without the line; never on a short or partial log;
#            never a finding, so no exit code and no `open` count moves.
#            Then a latest.log ROLLED AT MIDNIGHT (the tail of a run): the boot is read
#            from the rotated log before it and judged as one boot; an unfinished boot
#            stays unfinished; a tail whose boot cannot be read back is "not
#            judgeable", reported NOT RUN and never red.
#   RECORD   Nothing is written without -Write; the findings log rolls above 1 MiB
#            and carries what is open; every line of it is valid JSON.
#
#   powershell -File .minecraft\dev\loud\replay-test.ps1            # all three parts
#   pwsh       -File .minecraft\dev\loud\replay-test.ps1 -Newer     # + boots mirrored after the anchor
#
# Exit 0 pass, 1 fail, 2 could not run (history not available: a shallow clone, or
# the history of this repo was rewritten).
#
# WHERE THE BOOTS COME FROM: pinned commits of THIS repository. The corpus is the
# anchor commit and the 44 log-mirror commits before it, read with `git show
# <commit>:<path>` under the path the mirror had then ($LogRel below). Nothing is
# read from the working tree, so the test runs the same now that the mirror folder
# has left the tip (since 2026-10-12 the launcher mirrors to the private repository
# IridescentCraft-logs). That repository cannot be the corpus: it starts on
# 2026-10-12 and carries neither the 45 successive versions nor the
# expected_state.json of each boot's commit. -RepoRoot runs the test against
# another checkout of this repository. -Newer adds the versions mirrored here after
# the anchor (none after the mirror moved; the commit that deletes the folder is
# not a boot and is skipped).
# The checker's own baseline.json describes today's boots, so old boots are
# replayed with -NoBaseline; the baseline cases build their own file.
# Prints dates, commits, verdicts and finding ids only - never log content: the
# mirrored logs can hold player names and chat.
#
# The manifest in the working tree is used. It was seeded from these very boots;
# when ARMED entries are added later (the scripts that print nothing yet), the old
# healthy boots will rightly miss them: pass -Manifest with the manifest of that
# time (git show <rev>:.minecraft/dev/loud/liveness_manifest.json), or retire PART 1.
# =============================================================================

[CmdletBinding()]
param(
    [string]$Anchor = 'f1e9c511',
    [int]$Count = 45,
    [switch]$Newer,
    [string]$Manifest,
    [string]$RepoRoot,
    [string]$WorkDir,
    [switch]$Keep
)

$ErrorActionPreference = 'Stop'
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Checker   = Join-Path $ScriptDir 'loud-check.ps1'
$PsExe     = (Get-Process -Id $PID).Path
$LogRel    = '.minecraft/server_distribution/TesterLogs/Server Logs'      # the mirror's path in HISTORY (see the header); not needed on the tip
$StateRel  = '.minecraft/server_distribution/expected_state.json'
$Utf8      = New-Object System.Text.UTF8Encoding($false)
$fail      = New-Object System.Collections.Generic.List[string]

function Stop-CannotRun { param([string]$Why) Write-Host "[replay-test] COULD NOT RUN: $Why" -ForegroundColor Red; exit 2 }

if (-not $RepoRoot) { $RepoRoot = "$(& git -C $ScriptDir rev-parse --show-toplevel 2>$null)".Trim() }
if (-not $RepoRoot) { Stop-CannotRun 'not inside a git checkout' }
& git -C $RepoRoot cat-file -e "$Anchor^{commit}" 2>$null
if ($LASTEXITCODE -ne 0) { Stop-CannotRun "anchor commit $Anchor is not in this clone (shallow clone, or history was rewritten)" }

if (-not $WorkDir) { $WorkDir = Join-Path ([System.IO.Path]::GetTempPath()) ('loud-replay-' + [Guid]::NewGuid().ToString('N').Substring(0, 8)) }
[void](New-Item -ItemType Directory -Force -Path $WorkDir)

# byte-exact `git show <spec>` into a file (a PowerShell redirect would re-encode it)
function Export-GitBlob {
    param([string]$Spec, [string]$OutFile)
    $dir = Split-Path -Parent $OutFile
    if (-not (Test-Path -LiteralPath $dir)) { [void](New-Item -ItemType Directory -Force -Path $dir) }
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = 'git'
    $psi.Arguments = '-C "' + $RepoRoot + '" show "' + $Spec + '"'
    $psi.UseShellExecute = $false; $psi.RedirectStandardOutput = $true; $psi.RedirectStandardError = $true; $psi.CreateNoWindow = $true
    $p = [System.Diagnostics.Process]::Start($psi)
    $errTask = $p.StandardError.ReadToEndAsync()
    $fs = [System.IO.File]::Create($OutFile)
    try { $p.StandardOutput.BaseStream.CopyTo($fs) } finally { $fs.Dispose() }
    $p.WaitForExit()
    [void]$errTask.Result
    if ($p.ExitCode -ne 0) { Remove-Item -LiteralPath $OutFile -Force -ErrorAction SilentlyContinue; return $false }
    return $true
}
function Invoke-Checker {
    param([string[]]$Arguments)
    $base = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $Checker)
    if ($Manifest) { $Arguments += @('-Manifest', $Manifest) }
    # baseline.json next to the checker describes today's boots, not the ones replayed here: only the
    # baseline cases (which name their own file) run the NEW tier
    if ($Arguments -notcontains '-Baseline') { $Arguments += '-NoBaseline' }
    $out = & $PsExe @base @Arguments
    return [pscustomobject]@{ Exit = $LASTEXITCODE; Out = @($out | ForEach-Object { "$_" }) }
}
function Get-Field { param([string]$Line, [string]$Name) $m = [regex]::Match($Line, '"' + $Name + '":"((?:[^"\\]|\\.)*)"'); if ($m.Success) { return $m.Groups[1].Value }; return $null }
# open findings according to a findings log: the last line per id wins
function Get-OpenIds {
    param([string]$Path)
    $open = New-Object 'System.Collections.Generic.Dictionary[string,string]'
    if (Test-Path -LiteralPath $Path) {
        foreach ($l in [System.IO.File]::ReadAllLines($Path)) {
            $id = Get-Field $l 'id'; if (-not $id) { continue }
            if ((Get-Field $l 'state') -eq 'closed') { [void]$open.Remove($id) } else { $open[$id] = (Get-Field $l 'kind') }
        }
    }
    return $open
}
function Read-Status {
    param([string]$Path)
    $h = @{}
    if (Test-Path -LiteralPath $Path) { foreach ($l in [System.IO.File]::ReadAllLines($Path)) { $i = $l.IndexOf('='); if ($i -gt 0) { $h[$l.Substring(0, $i)] = $l.Substring($i + 1) } } }
    return $h
}
function Assert-That { param([bool]$Ok, [string]$What) if ($Ok) { Write-Host "  ok    $What" -ForegroundColor DarkGreen } else { Write-Host "  FAIL  $What" -ForegroundColor Red; $script:fail.Add($What) } }

Write-Host "[replay-test] checker $Checker" -ForegroundColor DarkGray
Write-Host "[replay-test] engine  PowerShell $($PSVersionTable.PSVersion) ($PsExe)" -ForegroundColor DarkGray
Write-Host "[replay-test] work    $WorkDir" -ForegroundColor DarkGray

# =============================================================================
# PART 1 - REPLAY
# =============================================================================
# --diff-filter=AM: only commits that wrote the file. The one that removes the mirror folder from the tip is not a boot.
$listed = @(& git -C $RepoRoot log "-$Count" '--diff-filter=AM' '--format=%h|%ad' '--date=format:%Y-%m-%d %H:%M' $Anchor -- "$LogRel/kubejs/server.log")
if ($listed.Count -lt $Count) { Stop-CannotRun "only $($listed.Count) mirrored versions of kubejs/server.log up to $Anchor, expected $Count" }
$boots = New-Object System.Collections.Generic.List[object]
for ($i = $listed.Count - 1; $i -ge 0; $i--) { $t = $listed[$i].Split('|'); $boots.Add([pscustomobject]@{ Hash = $t[0]; Date = $t[1]; Set = 'measured' }) }
if ($Newer) {
    $more = @(& git -C $RepoRoot log '--diff-filter=AM' '--format=%h|%ad' '--date=format:%Y-%m-%d %H:%M' "$Anchor..HEAD" -- "$LogRel/kubejs/server.log")
    for ($i = $more.Count - 1; $i -ge 0; $i--) { $t = $more[$i].Split('|'); $boots.Add([pscustomobject]@{ Hash = $t[0]; Date = $t[1]; Set = 'newer' }) }
}

Write-Host ""
Write-Host "== PART 1: replay of $($boots.Count) mirrored boots (kubejs/server.log), oldest first ==" -ForegroundColor Cyan
Write-Host ("  {0,-16} {1,-9} {2,-6} {3,-6} {4,-4} {5,-5} {6}" -f 'mirrored', 'commit', 'grep', 'check', 'exit', 'open', 'open findings by kind / why')
$findingsLog = Join-Path $WorkDir 'replay-findings.jsonl'
$rows = New-Object System.Collections.Generic.List[object]
foreach ($b in $boots) {
    $dir = Join-Path $WorkDir $b.Hash
    $logs = Join-Path $dir 'logs'
    if (-not (Export-GitBlob "$($b.Hash):$LogRel/kubejs/server.log" (Join-Path (Join-Path $logs 'kubejs') 'server.log'))) { Stop-CannotRun "cannot read kubejs/server.log at $($b.Hash)" }
    $hasState = Export-GitBlob "$($b.Hash):$StateRel" (Join-Path $dir 'expected_state.json')

    # the plain-grep ground truth
    $text = [System.IO.File]::ReadAllText((Join-Path (Join-Path $logs 'kubejs') 'server.log'))
    $aborts = @([regex]::Matches($text, "Error in '([^']+)'") | ForEach-Object { $_.Groups[1].Value } | Sort-Object -Unique)
    $sm = [regex]::Match($text, 'Loaded (\d+)/(\d+) KubeJS server scripts in .*? with (\d+) errors?')
    $errLines = [regex]::Matches($text, '(?m)^\[[\d:]+\] \[ERROR\]').Count
    $want = 'GREEN'
    if ($aborts.Count -gt 0 -or -not $sm.Success -or $sm.Groups[1].Value -ne $sm.Groups[2].Value -or [int]$sm.Groups[3].Value -gt 0 -or $errLines -gt 0) { $want = 'RED' }

    $statusFile = Join-Path $dir '.icraft_watch_status'
    $r = Invoke-Checker @('-LogsDir', $logs, '-Sources', 'kubejs/server.log', '-Sha', $b.Hash, '-Boot', ($b.Date.Replace(' ', 'T') + ':00'), '-Write', '-FindingsPath', $findingsLog, '-StatusPath', $statusFile, '-Quiet')
    $st = Read-Status $statusFile
    $open = Get-OpenIds $findingsLog
    $kinds = @($open.Values | Group-Object | Sort-Object Name | ForEach-Object { "$($_.Count) $($_.Name)" }) -join ', '
    $why = @()
    if ($open.ContainsKey('handler:LootJS.modifiers')) { $why += "Error in 'LootJS.modifiers'" }
    foreach ($a in $aborts) { if ($a -ne 'LootJS.modifiers') { $why += "Error in '$a'" } }
    if ($open.ContainsKey('summary:server')) { $why += ('summary ' + $sm.Groups[1].Value + '/' + $sm.Groups[2].Value + ', ' + $sm.Groups[3].Value + ' errors') }
    $row = [pscustomobject]@{ Hash = $b.Hash; Date = $b.Date; Set = $b.Set; Want = $want; Got = [string]$st['worst']; Exit = $r.Exit; Open = $open.Count
        Abort = $open.ContainsKey('handler:LootJS.modifiers'); Summary = $open.ContainsKey('summary:server'); Handlers = @($open.Keys | Where-Object { $_.StartsWith('handler:') }).Count
        Stale = @($open.Keys | Where-Object { $_.StartsWith('stale:') }).Count; NotLoaded = @($open.Keys | Where-Object { $_.StartsWith('loaded:') }).Count
        Armed = @($open.Keys | Where-Object { $_.StartsWith('armed:') }).Count; CheckFailed = @($open.Keys | Where-Object { $_.StartsWith('check:') }).Count; HasState = $hasState; StatusOpen = [string]$st['open'] }
    $rows.Add($row)
    $color = 'Gray'
    if ($row.Want -ne $row.Got) { $color = 'Red' } elseif ($row.Got -eq 'GREEN') { $color = 'Green' }
    Write-Host ("  {0,-16} {1,-9} {2,-6} {3,-6} {4,-4} {5,-5} {6}{7}" -f $b.Date, $b.Hash, $want, $row.Got, $r.Exit, $open.Count, $kinds, $(if ($why.Count) { '  <- ' + ($why -join '; ') } else { '' })) -ForegroundColor $color
}

$measured = @($rows | Where-Object { $_.Set -eq 'measured' })
$red   = @($measured | Where-Object { $_.Got -eq 'RED' })
$green = @($measured | Where-Object { $_.Got -eq 'GREEN' })
Write-Host ""
Assert-That (@($rows | Where-Object { $_.Want -ne $_.Got }).Count -eq 0) 'every boot: the checker verdict equals the plain-grep verdict'
Assert-That (@($rows | Where-Object { ($_.Got -eq 'RED' -and $_.Exit -ne 1) -or ($_.Got -eq 'GREEN' -and $_.Exit -ne 0) }).Count -eq 0) 'every boot: exit code 1 when RED, 0 when GREEN (never 2)'
Assert-That (@($rows | Where-Object { [string]$_.Open -ne $_.StatusOpen }).Count -eq 0) 'every boot: `open` in the status file equals what the findings log says is open'
Assert-That (@($rows | Where-Object { $_.CheckFailed -gt 0 }).Count -eq 0) 'no boot had a check that could not run'
if ($Anchor -eq 'f1e9c511' -and $Count -eq 45) {
    Assert-That ($red.Count -eq 43) "measured set: 43 unhealthy boots are RED (got $($red.Count))"
    Assert-That ($green.Count -eq 2) "measured set: 2 healthy boots are GREEN (got $($green.Count))"
    Assert-That (@($red | Where-Object { $_.Abort }).Count -eq 41) ("measured set: 41 RED boots carry Error in 'LootJS.modifiers' (got " + @($red | Where-Object { $_.Abort }).Count + ')')
    Assert-That (@($red | Where-Object { -not $_.Abort -and $_.Summary -and $_.Handlers -eq 0 }).Count -eq 2) ("measured set: 2 RED boots have no handler abort and a summary line with errors (got " + @($red | Where-Object { -not $_.Abort -and $_.Summary -and $_.Handlers -eq 0 }).Count + ')')
    Assert-That ($measured[$measured.Count - 1].Got -eq 'GREEN' -and $measured[$measured.Count - 2].Got -eq 'GREEN') 'measured set: the two GREEN boots are the last two'
    Assert-That ($measured[$measured.Count - 1].Open -eq 0) 'after the last healthy boot nothing is open: every finding of the bad boots was closed'
}
$staleBoots = @($measured | Where-Object { $_.Stale -gt 0 })
Write-Host ("  note  {0} of {1} measured boots loaded scripts that were not in the tree of their commit (STALE); most in one boot: {2}" -f $staleBoots.Count, $measured.Count, (@($measured | ForEach-Object { $_.Stale }) | Measure-Object -Maximum).Maximum) -ForegroundColor DarkGray
Write-Host ("  note  {0} of {1} measured boots had deployed scripts with no 'Loaded script' line; {2} had ARMED lines missing" -f @($measured | Where-Object { $_.NotLoaded -gt 0 }).Count, $measured.Count, @($measured | Where-Object { $_.Armed -gt 0 }).Count) -ForegroundColor DarkGray

# every line of the findings log is one JSON object with the agreed fields
$badJson = 0; $n = 0
foreach ($l in [System.IO.File]::ReadAllLines($findingsLog)) {
    $n++
    try { $o = $l | ConvertFrom-Json; foreach ($k in 'ts', 'boot', 'sha', 'kind', 'sev', 'id', 'src', 'detail', 'state') { if ($null -eq $o.PSObject.Properties[$k]) { throw "no $k" } } } catch { $badJson++ }
}
Assert-That ($badJson -eq 0 -and $n -gt 0) "findings log: $n lines, each one JSON object with ts, boot, sha, kind, sev, id, src, detail, state"

# =============================================================================
# PART 2 - PLANTED DEFECTS on the healthy anchor boot (all four logs)
# =============================================================================
Write-Host ""
Write-Host "== PART 2: planted defects on the healthy boot mirrored at $Anchor ==" -ForegroundColor Cyan
$baseDir = Join-Path $WorkDir 'healthy'
$baseLogs = Join-Path $baseDir 'logs'
foreach ($f in 'kubejs/server.log', 'kubejs/startup.log', 'latest.log', 'debug.log') {
    if (-not (Export-GitBlob "${Anchor}:$LogRel/$f" (Join-Path $baseLogs $f.Replace('/', '\')))) { Stop-CannotRun "cannot read $f at $Anchor" }
}
if (-not (Export-GitBlob "${Anchor}:$StateRel" (Join-Path $baseDir 'expected_state.json'))) { Stop-CannotRun "cannot read expected_state.json at $Anchor" }

# a fresh copy of the healthy logs, with one log rewritten line by line
function New-Case {
    param([string]$Name, [string]$Log, [scriptblock]$Edit)
    $dir = Join-Path $WorkDir ('case-' + $Name)
    if (Test-Path -LiteralPath $dir) { Remove-Item -LiteralPath $dir -Recurse -Force }
    Copy-Item -LiteralPath $baseDir -Destination $dir -Recurse
    if ($Log) {
        $p = Join-Path (Join-Path $dir 'logs') $Log.Replace('/', '\')
        $in = [System.IO.File]::ReadAllLines($p, [System.Text.Encoding]::UTF8)
        $outLines = New-Object System.Collections.Generic.List[string]
        foreach ($l in $in) { foreach ($x in @(& $Edit $l)) { if ($null -ne $x) { $outLines.Add([string]$x) } } }
        [System.IO.File]::WriteAllLines($p, $outLines, $Utf8)
    }
    return (Join-Path $dir 'logs')
}
function Get-Ids {   # finding ids printed by a report run: "  RED   KIND   id"
    param($Run)
    return @($Run.Out | ForEach-Object { $m = [regex]::Match($_, '^\s+(RED|AMBER)\s+(\S+)\s+(\S+)\s*$'); if ($m.Success) { $m.Groups[2].Value + ' ' + $m.Groups[3].Value } })
}
function Test-Case {
    param([string]$Name, [string]$Logs, [string[]]$Extra, [int]$Exit, [string[]]$Expect)
    $r = Invoke-Checker (@('-LogsDir', $Logs) + $Extra)
    $ids = @(Get-Ids $r | Sort-Object)
    $wantIds = @($Expect | Sort-Object)
    Assert-That ($r.Exit -eq $Exit -and (($ids -join ' | ') -eq ($wantIds -join ' | '))) ("$Name -> exit $Exit, findings: " + $(if ($wantIds.Count) { $wantIds -join ' | ' } else { '(none)' }) + $(if ($r.Exit -ne $Exit -or (($ids -join ' | ') -ne ($wantIds -join ' | '))) { "   GOT exit $($r.Exit): " + ($ids -join ' | ') } else { '' }))
}

Test-Case 'healthy boot, all four logs' (New-Case 'clean' $null $null) @() 0 @()
Test-Case 'ARMED line removed (twilight_boss_drops)' (New-Case 'armed' 'kubejs/server.log' { param($l) if ($l -notmatch '\[twilight_boss_drops\] registered') { $l } }) @() 1 @('MISSING armed:loot/twilight_boss_drops.js')
Test-Case 'script not loaded (loot/planetary_loot.js)' (New-Case 'notloaded' 'kubejs/server.log' { param($l) if ($l -notmatch 'Loaded script server_scripts:loot/planetary_loot\.js ') { $l } }) @() 1 @('MISSING loaded:server_scripts/loot/planetary_loot.js')
Test-Case 'stale script loaded (zz_left_behind.js)' (New-Case 'stale' 'kubejs/server.log' { param($l) $l; if ($l -match 'Loaded script server_scripts:example\.js ') { '[00:00:00] [INFO] Loaded script server_scripts:zz_left_behind.js in 0.0 s' } }) @() 1 @('STALE stale:server_scripts/zz_left_behind.js')
Test-Case 'must_not line printed (entity id validator)' (New-Case 'mustnot' 'kubejs/server.log' { param($l) $l; if ($l -match '\[ENTITY-ID-VALIDATOR\] all entity ids resolve') { '[00:00:00] [WARN] loot/0_entity_id_validator.js#145: [ENTITY-ID-VALIDATOR] 2 UNRESOLVABLE ENTITY ID(S), their modifiers were skipped: a:b, c:d' } }) @() 1 @('ERROR mustnot:loot/0_entity_id_validator.js')
Test-Case 'tick count under its floor' (New-Case 'floor' 'kubejs/server.log' { param($l) $l -replace 'Registered \d+ server tick functions', 'Registered 7 server tick functions' }) @() 1 @('MISSING armed:0_tick_master.js:server')
Test-Case 'handler abort + summary with 1 errors' (New-Case 'abort' 'kubejs/server.log' { param($l) if ($l -match 'Loaded \d+/\d+ KubeJS server scripts') { "[00:00:00] [ERROR] ! loot/x.js#1: Error in 'LootJS.modifiers': TypeError: planted"; ($l -replace 'with 0 errors', 'with 1 errors') } else { $l } }) @() 1 @('ERROR handler:LootJS.modifiers', 'ERROR summary:server')
Test-Case 'boot not finished (no Done line)' (New-Case 'nodone' 'latest.log' { param($l) if ($l -notmatch 'Done \(\d+\.\d+s\)!') { $l } }) @() 2 @('CHECK-FAILED check:boot-incomplete')
Test-Case 'boot not finished AND an ARMED line missing (not judged)' (New-Case 'nodone2' 'latest.log' { param($l) if ($l -notmatch 'Done \(\d+\.\d+s\)!|LSP-Mixin/\]: FishingHookMixin') { $l } }) @() 2 @('CHECK-FAILED check:boot-incomplete')
Test-Case 'in-house mixin did not apply (FishingHookMixin)' (New-Case 'mixin' 'latest.log' { param($l) if ($l -notmatch 'LSP-Mixin/\]: FishingHookMixin') { $l } }) @() 1 @('MISSING armed:mixin:lovely_sparkle_pieces:FishingHookMixin')
Test-Case 'OutOfMemoryError in latest.log' (New-Case 'oom' 'latest.log' { param($l) $l; if ($l -match 'Done \(\d+\.\d+s\)!') { '[11Oct2026 09:00:00.000] [Server thread/ERROR] [net.minecraft.server.MinecraftServer/]: Encountered an unexpected exception'; 'java.lang.OutOfMemoryError: Java heap space' } }) @() 1 @('ERROR pattern:oom', 'ERROR pattern:tick-loop')
Test-Case 'mixin apply failure in debug.log only' (New-Case 'mixinfail' 'debug.log' { param($l) $l; if ($l -match 'ModLauncher running') { '[11Oct2026 09:00:00.000] [main/DEBUG] [mixin/]: org.spongepowered.asm.mixin.transformer.throwables.InvalidMixinException: planted' } }) @() 1 @('ERROR pattern:mixin-apply')
Test-Case 'startup log missing' (New-Case 'nostartup' 'kubejs/startup.log' { param($l) $l } | ForEach-Object { Remove-Item -LiteralPath (Join-Path $_ 'kubejs\startup.log') -Force; $_ }) @() 2 @('CHECK-FAILED check:read:kubejs/startup.log')
Test-Case 'debug.log absent, as in a copy of the logs (reported NOT RUN, not a failure)' (New-Case 'nodebug' $null $null | ForEach-Object { Remove-Item -LiteralPath (Join-Path $_ 'debug.log') -Force; $_ }) @() 0 @()
$nd = Invoke-Checker @('-LogsDir', (Join-Path (Join-Path $WorkDir 'case-nodebug') 'logs'))
Assert-That (@($nd.Out | Where-Object { $_ -match 'NOT RUN : debug\.log' }).Count -eq 1) '   and the report says so: NOT RUN : debug.log'
Test-Case 'debug.log asked for by name and absent' (Join-Path (Join-Path $WorkDir 'case-nodebug') 'logs') @('-Sources', 'latest.log,debug.log') 2 @('CHECK-FAILED check:read:debug.log')
Test-Case 'startup script not loaded' (New-Case 'startup' 'kubejs/startup.log' { param($l) if ($l -notmatch 'Loaded script startup_scripts:virtual_gold_clamp\.js ') { $l } }) @() 1 @('MISSING loaded:startup_scripts/virtual_gold_clamp.js')

# baseline (NEW tier): ERROR / FATAL lines of latest.log and WARN lines of the KubeJS logs. The proposal is taken from
# the healthy boot itself, so with every row accepted it must come out clean; then one signature is withheld, one is
# moved to the defects list, one is recorded at a third of what is seen, and the server is "reloaded" twice.
$caseLogs = New-Case 'baseline' $null $null
$noFile = Invoke-Checker @('-LogsDir', $caseLogs, '-Baseline', (Join-Path $WorkDir 'no-such-baseline.json'))
Assert-That ($noFile.Exit -eq 2 -and (@(Get-Ids $noFile) -join '|') -eq 'CHECK-FAILED check:baseline') 'baseline named but missing -> exit 2, CHECK-FAILED check:baseline (never "0 new")'
$proposal = Join-Path $WorkDir 'proposed-baseline.json'
$prop = Invoke-Checker @('-LogsDir', $caseLogs, '-ProposeBaseline', $proposal)
$propRows = @()
if (Test-Path -LiteralPath $proposal) { $propRows = @([System.IO.File]::ReadAllLines($proposal) | Where-Object { $_ -match '^\s+\{"log":' }) }
Assert-That ($prop.Exit -eq 0 -and $propRows.Count -gt 10) "-ProposeBaseline writes the list to triage ($($propRows.Count) signatures of the healthy boot)"
Assert-That (@($propRows | Where-Object { $_ -match '"log":"latest\.log","sig":"WARN ' }).Count -eq 0 -and @($propRows | Where-Object { $_ -match '"log":"latest\.log","sig":"ERROR ' }).Count -gt 0 -and @($propRows | Where-Object { $_ -match '"log":"kubejs/server\.log","sig":"WARN ' }).Count -gt 0) 'the tier is latest.log ERROR + KubeJS WARN: no latest.log WARN line is in the list'
$asIs = Invoke-Checker @('-LogsDir', $caseLogs, '-Baseline', $proposal)
Assert-That ($asIs.Exit -eq 2 -and (@(Get-Ids $asIs) -join '|') -eq 'CHECK-FAILED check:baseline') 'the proposal as written (no reason, no date) is refused -> exit 2, CHECK-FAILED check:baseline'
function Write-Baseline {
    param([string]$Path, [string[]]$Rows, [string[]]$Defects)
    $filled = @($Rows | ForEach-Object { $_.TrimEnd(',').Replace('"reason":"","accepted":""', '"reason":"test fixture","accepted":"2026-10-11"') })
    $def = @($Defects | Where-Object { $_ } | ForEach-Object { ($_.TrimEnd(',') -replace ',"count":\d+((?:,"runtime":true)?),"reason":"","accepted":""', '$1,"what":"planted defect","listed":"2026-10-11"') })
    [System.IO.File]::WriteAllText($Path, '{"version":1,"signatures":[' + "`n" + ($filled -join ",`n") + "`n" + '],"defects":[' + "`n" + ($def -join ",`n") + "`n]}", $Utf8)
    return $Path
}
Test-Case 'baseline with every signature accepted' $caseLogs @('-Baseline', (Write-Baseline (Join-Path $WorkDir 'full-baseline.json') $propRows @())) 0 @()
$one = Invoke-Checker @('-LogsDir', $caseLogs, '-Baseline', (Write-Baseline (Join-Path $WorkDir 'minus-one.json') @($propRows | Select-Object -Skip 1) @()))
$oneIds = @(Get-Ids $one)
Assert-That ($one.Exit -eq 1 -and $oneIds.Count -eq 1 -and $oneIds[0] -match '^NEW new:[0-9a-f]{8}$' -and (@($one.Out | Where-Object { $_ -match '\] AMBER - ' }).Count -eq 1)) 'one signature withheld from the baseline -> exit 1, AMBER, exactly one NEW finding'
$dfc = Invoke-Checker @('-LogsDir', $caseLogs, '-Baseline', (Write-Baseline (Join-Path $WorkDir 'one-defect.json') @($propRows | Select-Object -Skip 1) @($propRows[0])))
$dfcIds = @(Get-Ids $dfc)
Assert-That ($dfc.Exit -eq 1 -and $dfcIds.Count -eq 1 -and $dfcIds[0] -match '^NEW defect:[0-9a-f]{8}$' -and (@($dfc.Out | Where-Object { $_ -match 'KNOWN DEFECT, reviewed and not baselined \(planted defect\)' }).Count -eq 1)) 'a signature on the defects list stays a finding (defect:), with what was written about it'
$both = Invoke-Checker @('-LogsDir', $caseLogs, '-Baseline', (Write-Baseline (Join-Path $WorkDir 'both.json') $propRows @($propRows[0])))
Assert-That ($both.Exit -eq 2 -and (@(Get-Ids $both) -join '|') -eq 'CHECK-FAILED check:baseline') 'a signature both accepted and listed as a defect -> the baseline is refused'
$repeat = @($propRows | Where-Object { $m = [regex]::Match($_, '"count":(\d+)'); $m.Success -and [int]$m.Groups[1].Value -ge 3 } | Select-Object -First 1)
$single = @($propRows | Where-Object { $_ -match '"log":"kubejs/server\.log".*"count":1,' } | Select-Object -First 1)
if ($repeat.Count -eq 1) {
    $grown = @($propRows | ForEach-Object { if ($_ -eq $repeat[0]) { $_ -replace '"count":\d+', '"count":1' } else { $_ } })
    $g = Invoke-Checker @('-LogsDir', $caseLogs, '-Baseline', (Write-Baseline (Join-Path $WorkDir 'grown.json') $grown @()))
    $gIds = @(Get-Ids $g)
    Assert-That ($g.Exit -eq 1 -and $gIds.Count -eq 1 -and $gIds[0] -match '^NEW grew:[0-9a-f]{8}$') 'a signature seen 3x as often as it was accepted -> exactly one NEW finding (grew:)'
} elseif ($single.Count -eq 1) {
    # no line repeats in this boot: print one KubeJS WARN line three times instead
    $sigText = [regex]::Match($single[0], '"sig":"WARN ((?:[^"\\]|\\.){20})').Groups[1].Value -replace '\\(.)', '$1'
    $script:tripled = $false
    $caseGrow = New-Case 'grow' 'kubejs/server.log' { param($l) $l; if (-not $script:tripled -and $l -match '\[WARN\]' -and $l.Contains($sigText)) { $script:tripled = $true; $l; $l } }
    $g = Invoke-Checker @('-LogsDir', $caseGrow, '-Baseline', (Join-Path $WorkDir 'full-baseline.json'))
    $gIds = @(Get-Ids $g)
    Assert-That ($g.Exit -eq 1 -and $gIds.Count -eq 1 -and $gIds[0] -match '^NEW grew:[0-9a-f]{8}$') 'a line printed 3x as often as it was accepted -> exactly one NEW finding (grew:)'
} else { Assert-That $false 'growth rule: no signature in this boot to exercise it with' }
# a /reload prints every load-time line again; two reloads make three passes, and nothing "grew"
$caseReload = New-Case 'reload' $null $null
$kjs = Join-Path (Join-Path $caseReload 'kubejs') 'server.log'
$once = [System.IO.File]::ReadAllText($kjs)
[System.IO.File]::WriteAllText($kjs, $once + $once + $once, $Utf8)
$rl = Invoke-Checker @('-LogsDir', $caseReload, '-Sources', 'kubejs/server.log', '-Baseline', (Join-Path $WorkDir 'full-baseline.json'))
Assert-That ($rl.Exit -eq 0 -and @(Get-Ids $rl).Count -eq 0 -and @($rl.Out | Where-Object { $_ -match '3 script load passes' }).Count -eq 1) 'the KubeJS log of a server reloaded twice (every line three times) -> nothing grew, the report says 3 load passes'

# STALE baseline entries (check 6). The baseline is the healthy boot's own list plus four entries for lines it does not
# print: a defect, an accepted latest.log line, an accepted line marked "runtime", an accepted KubeJS line. Earlier boots
# are the healthy boot again with its clock moved back by whole days, written next to latest.log as rotated logs.
function Get-StaleIds {   # entries reported stale by a report run: "  STALE DEFECT   defect:<id>"
    param($Run)
    return @($Run.Out | ForEach-Object { $m = [regex]::Match($_, '^\s+STALE\s+(DEFECT|ACCEPTED)\s+(\S+)\s*$'); if ($m.Success) { $m.Groups[1].Value + ' ' + $m.Groups[2].Value } })
}
function Get-Id8 {        # the id the checker gives "<log>|<sig>", computed here and not asked of the checker
    param([string]$Text)
    $sha1 = [System.Security.Cryptography.SHA1]::Create()
    try { $b = $sha1.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($Text)) } finally { $sha1.Dispose() }
    return ('{0:x2}{1:x2}{2:x2}{3:x2}' -f $b[0], $b[1], $b[2], $b[3])
}
function Test-Stale {
    param([string]$Name, [string]$Logs, [string[]]$Extra, [int]$Exit, [string[]]$Expect, [string[]]$Stale, [string[]]$Say)
    $r = Invoke-Checker (@('-LogsDir', $Logs) + $Extra)
    $ids = (@(Get-Ids $r | Sort-Object) -join ' | ');           $wantIds = (@($Expect | Sort-Object) -join ' | ')
    $st  = (@(Get-StaleIds $r | Sort-Object) -join ' | ');      $wantSt  = (@($Stale | Sort-Object) -join ' | ')
    $unsaid = @($Say | Where-Object { $rx = $_; @($r.Out | Where-Object { $_ -match $rx }).Count -eq 0 })
    $ok = ($r.Exit -eq $Exit) -and ($ids -eq $wantIds) -and ($st -eq $wantSt) -and ($unsaid.Count -eq 0)
    $text = "$Name -> exit $Exit, findings: " + $(if ($wantIds) { $wantIds } else { '(none)' }) + '; stale: ' + $(if ($wantSt) { $wantSt } else { '(none)' })
    if (-not $ok) { $text += "   GOT exit $($r.Exit), findings: $ids; stale: $st" + $(if ($unsaid.Count) { '; the report does not say: ' + ($unsaid -join ' ;; ') } else { '' }) }
    Assert-That $ok $text
}
$inv = [System.Globalization.CultureInfo]::InvariantCulture
$healthyLatest = [System.IO.File]::ReadAllLines((Join-Path $baseLogs 'latest.log'), [System.Text.Encoding]::UTF8)
$day0 = [regex]::Match($healthyLatest[0], '^\[(\d{2}[A-Za-z]{3}\d{4}) ').Groups[1].Value
if (-not $day0) { Stop-CannotRun "the healthy boot's latest.log at $Anchor does not start with a clock" }
$date0 = [datetime]::ParseExact($day0, 'ddMMMyyyy', $inv)
function Get-RolledName { param([int]$Days) return ($date0.AddDays($Days).ToString('yyyy-MM-dd', $inv) + '-1.log.gz') }
function Get-RolledClock { param([int]$Days) return [regex]::Escape($date0.AddDays($Days).ToString('yyyy-MM-dd', $inv) + 'T') }
# the healthy boot as a rotated log of another day ($Days back or forward), with its lines rewritten by $Edit
function New-RolledLog {
    param([string]$Logs, [int]$Days, [scriptblock]$Edit, [int]$From = 0, [int]$To = -1)
    if ($To -lt 0) { $To = $healthyLatest.Count - 1 }
    $stamp = '[' + $date0.AddDays($Days).ToString('ddMMMyyyy', $inv) + ' '
    $outLines = New-Object System.Collections.Generic.List[string]
    for ($i = $From; $i -le $To; $i++) {
        $x = $healthyLatest[$i]
        if ($x.StartsWith('[' + $day0 + ' ')) { $x = $stamp + $x.Substring($day0.Length + 2) }
        if ($Edit) { foreach ($y in @(& $Edit $x)) { if ($null -ne $y) { $outLines.Add([string]$y) } } } else { $outLines.Add($x) }
    }
    $bytes = $Utf8.GetBytes(($outLines -join "`n") + "`n")
    $fs = [System.IO.File]::Create((Join-Path $Logs (Get-RolledName $Days)))
    try {
        $gz = New-Object System.IO.Compression.GZipStream($fs, [System.IO.Compression.CompressionMode]::Compress)
        $gz.Write($bytes, 0, $bytes.Length)
        $gz.Dispose()
    } finally { $fs.Dispose() }
}
function Clear-Rolled { param([string]$Logs) Get-ChildItem -LiteralPath $Logs -Filter '*.log.gz' | Remove-Item -Force }
$rxDone = 'Done \(\d+\.\d+s\)!'
$sigDef = 'ERROR [planted/]: a defect that was fixed'
$sigAcc = 'ERROR [planted/]: an accepted line that is gone'
$sigRun = 'ERROR [planted/]: a line printed only now and then'
$sigKjs = 'WARN planted: a recipe line that is gone'
$idDef  = 'DEFECT defect:' + (Get-Id8 "latest.log|$sigDef")
$idAcc  = 'ACCEPTED accepted:' + (Get-Id8 "latest.log|$sigAcc")
$idKjs  = 'ACCEPTED accepted:' + (Get-Id8 "kubejs/server.log|$sigKjs")
$newDef = 'NEW defect:' + (Get-Id8 "latest.log|$sigDef")
function New-Row { param([string]$Log, [string]$Sig, [string]$More) return ('    {"log":"' + $Log + '","sig":"' + $Sig + '","count":1' + $More + ',"reason":"","accepted":""}') }
# a line of the given signature, with the clock of the line it is put next to
function New-PlantedLine { param([string]$Line, [string]$Sig) return ($Line.Substring(0, $Line.IndexOf(']') + 1) + ' [main/' + $Sig.Substring(0, $Sig.IndexOf(' ')) + '] ' + $Sig.Substring($Sig.IndexOf(' ') + 1)) }
$withDefectLine = { param($l) if ($l -match $rxDone) { New-PlantedLine $l $sigDef }; $l }
$noDone         = { param($l) if ($l -notmatch $rxDone) { $l } }
$noStart        = { param($l) if ($l -notmatch 'ModLauncher running: args') { $l } }
$sb = Write-Baseline (Join-Path $WorkDir 'stale-baseline.json') (@($propRows) + @((New-Row 'latest.log' $sigAcc ''), (New-Row 'latest.log' $sigRun ',"runtime":true'), (New-Row 'kubejs/server.log' $sigKjs ''))) @((New-Row 'latest.log' $sigDef ''))
$logsE = New-Case 'entries' $null $null
$kjsNote = '1 baseline entry of the KubeJS logs not seen in this boot \(' + [regex]::Escape($idKjs.Split(' ')[1]) + '\): not called stale'

Test-Stale 'entries whose line is gone, no earlier boot next to the log' $logsE @('-Baseline', $sb) 0 @() @() @('2 baseline entries not seen in this boot .*not called stale yet, 0 of the 1 earlier complete boot', $kjsNote)
Test-Stale '   -StaleBoots 1: this boot alone decides (the "runtime" entry is still not stale)' $logsE @('-Baseline', $sb, '-StaleBoots', '1') 0 @() @($idDef, $idAcc, $idKjs) @('GREEN - nothing found; 3 stale baseline entries to prune')
New-RolledLog $logsE -1 $null
Test-Stale 'gone from this boot and from the complete boot before it -> STALE, and still GREEN, exit 0' $logsE @('-Baseline', $sb) 0 @() @($idDef, $idAcc) @(('not in the complete boot before it \(' + (Get-RolledClock -1)), 'GREEN - nothing found; 2 stale baseline entries to prune', $kjsNote)
$quiet = Invoke-Checker @('-LogsDir', $logsE, '-Baseline', $sb, '-Quiet')
Assert-That ($quiet.Exit -eq 0 -and $quiet.Out.Count -eq 1 -and $quiet.Out[0] -match 'GREEN - nothing found; 2 stale baseline entries to prune') '   -Quiet: the one line it prints carries the count'
$stFind = Join-Path $WorkDir 'stale-findings.jsonl'; $stStat = Join-Path $WorkDir 'stale-status'
$wr = Invoke-Checker @('-LogsDir', $logsE, '-Baseline', $sb, '-Write', '-FindingsPath', $stFind, '-StatusPath', $stStat, '-Quiet')
$st = Read-Status $stStat
Assert-That ($wr.Exit -eq 0 -and $st['worst'] -eq 'GREEN' -and $st['open'] -eq '0' -and $st['summary'] -match 'stale baseline entries: 2' -and -not (Test-Path -LiteralPath $stFind)) '   -Write: not a finding (worst=GREEN, open=0, nothing in the findings log); the status summary carries the count'
New-RolledLog $logsE -1 $withDefectLine
Test-Stale 'the boot before printed the defect line (a fix one boot old) -> that entry is NOT stale' $logsE @('-Baseline', $sb) 0 @() @($idAcc) @(('1 baseline entry not seen in this boot, printed in an earlier log within the last 2 boots \(' + [regex]::Escape($idDef.Split(' ')[1]) + '\): not stale'))
$logsBack = New-Case 'entries-back' 'latest.log' $withDefectLine
New-RolledLog $logsBack -1 $null
Test-Stale 'this boot prints it again after a boot without it (a fix that held one boot) -> a defect finding, not stale' $logsBack @('-Baseline', $sb) 1 @($newDef) @($idAcc) @()
Clear-Rolled $logsE; New-RolledLog $logsE -1 $noDone; New-RolledLog $logsE -2 $null
Test-Stale 'a rotated log without Done in between is skipped; the complete boot behind it decides' $logsE @('-Baseline', $sb) 0 @() @($idDef, $idAcc) @(('not in the complete boot before it \(' + (Get-RolledClock -2)))
New-RolledLog $logsE -1 { param($l) if ($l -match $rxDone) { New-PlantedLine $l $sigDef } else { $l } }
Test-Stale '   but a line printed in that partial log is a line still printed -> not stale' $logsE @('-Baseline', $sb) 0 @() @($idAcc) @()
Clear-Rolled $logsE; New-RolledLog $logsE -1 $noStart
Test-Stale 'the only earlier log starts mid-boot (rolled at midnight): no complete boot before -> nothing stale' $logsE @('-Baseline', $sb) 0 @() @() @('not called stale yet, 0 of the 1 earlier complete boot')
Clear-Rolled $logsE; New-RolledLog $logsE 1 $null
Test-Stale 'a rotated log NEWER than the boot checked is not "the boot before" -> nothing stale' $logsE @('-Baseline', $sb) 0 @() @() @('not called stale yet, 0 of the 1 earlier complete boot')
Clear-Rolled $logsE; New-RolledLog $logsE -1 $null
Test-Stale '-StaleBoots 3 with one earlier complete boot -> not yet' $logsE @('-Baseline', $sb, '-StaleBoots', '3') 0 @() @() @('not called stale yet, 1 of the 2 earlier complete boot')
New-RolledLog $logsE -2 $null
Test-Stale '-StaleBoots 3 with two -> STALE' $logsE @('-Baseline', $sb, '-StaleBoots', '3') 0 @() @($idDef, $idAcc) @('not in the 2 complete boots before it')
$logsNoDone = New-Case 'entries-nodone' 'latest.log' $noDone
New-RolledLog $logsNoDone -1 $null
Test-Stale 'the boot checked did not reach Done -> no stale line at all, one note with the count' $logsNoDone @('-Baseline', $sb) 2 @('CHECK-FAILED check:boot-incomplete') @() @('3 baseline entries not seen in this log; none is called stale: this boot has no Done line')
$logsMid = New-Case 'entries-midboot' 'latest.log' $noStart
New-RolledLog $logsMid -1 $null
Test-Stale 'the log checked starts mid-boot -> no stale line at all' $logsMid @('-Baseline', $sb) 0 @() @() @('3 baseline entries not seen in this log; none is called stale: latest.log does not start at a JVM start')
Test-Stale 'only the KubeJS log is read -> nothing is known about the boot, nothing stale' $logsE @('-Baseline', $sb, '-Sources', 'kubejs/server.log') 0 @() @() @('1 baseline entry not seen in this log; none is called stale: latest.log was not read')
# the proposal marks what is first printed after Done, and a baseline made from it is accepted
$logsRun = New-Case 'entries-runtime' 'latest.log' { param($l) $l; if ($l -match $rxDone) { New-PlantedLine $l $sigRun } }
$propRun = Join-Path $WorkDir 'proposed-runtime.json'
[void](Invoke-Checker @('-LogsDir', $logsRun, '-ProposeBaseline', $propRun))
$runRows = @([System.IO.File]::ReadAllLines($propRun) | Where-Object { $_ -match '^\s+\{"log":' })
$planted = @($runRows | Where-Object { $_.Contains('"sig":"' + $sigRun + '"') })
Assert-That ($planted.Count -eq 1 -and $planted[0].Contains('"count":1,"runtime":true,"reason":""') -and -not $runRows[0].Contains('"runtime"')) '-ProposeBaseline marks a latest.log signature first printed after Done as "runtime": true (and not a load-time one)'
Test-Case '   and that proposal, filled in, is a baseline the checker takes' $logsRun @('-Baseline', (Write-Baseline (Join-Path $WorkDir 'runtime-baseline.json') $runRows @())) 0 @()

# A latest.log ROLLED AT MIDNIGHT. log4j starts a new latest.log at the first line after the box's midnight: the file is
# then the tail of the run, and the boot is in the rotated log of the day before. Built here from the healthy boot: its
# first lines as a rotated log dated one day back, the rest as latest.log. (Test-Stale also serves here: it checks the
# exit code, the findings, the stale entries and what the report must say.)
function Set-LatestTail {      # latest.log = the healthy boot from line $From on, rewritten by $Edit
    param([string]$Logs, [int]$From, [scriptblock]$Edit)
    $outLines = New-Object System.Collections.Generic.List[string]
    for ($i = $From; $i -lt $healthyLatest.Count; $i++) {
        if ($Edit) { foreach ($y in @(& $Edit $healthyLatest[$i])) { if ($null -ne $y) { $outLines.Add([string]$y) } } } else { $outLines.Add($healthyLatest[$i]) }
    }
    [System.IO.File]::WriteAllLines((Join-Path $Logs 'latest.log'), $outLines, $Utf8)
}
function Get-CutAt { param([int]$Ix) while (-not $healthyLatest[$Ix].StartsWith('[' + $day0 + ' ')) { $Ix++ }; return $Ix }   # a roll never splits a stack trace
$doneIx = -1
for ($i = 0; $i -lt $healthyLatest.Count; $i++) { if ($healthyLatest[$i] -match $rxDone) { $doneIx = $i; break } }
$stopIx = -1
for ($i = 0; $i -lt $healthyLatest.Count; $i++) { if ($healthyLatest[$i] -match 'MinecraftServer/\]: Stopping server') { $stopIx = $i; break } }
$cutAfter  = Get-CutAt ($doneIx + 10)            # the roll came after Done: the whole boot is in the rotated log
$cutBefore = Get-CutAt ([int]($doneIx / 2))      # the roll came while the server was loading: Done is in latest.log
Assert-That ($doneIx -gt 100 -and $stopIx -gt $cutAfter -and $cutBefore -gt 700) 'the healthy boot can stand in for a rolled one (Done, then a server stop well after it)'
$rolledNote = 'latest\.log was rolled at midnight .*this boot is read from ' + [regex]::Escape((Get-RolledName -1)) + ' \+ latest\.log'
$notJudged  = 'NOT RUN : ARMED tier and whether the boot finished \(boot not judgeable: log rolled'

$logsR = New-Case 'rolled' $null $null
New-RolledLog $logsR -1 $null -From 0 -To ($cutAfter - 1); Set-LatestTail $logsR $cutAfter $null
Test-Stale 'latest.log rolled at midnight, the boot complete in the log before it -> judged as one boot, clean' $logsR @() 0 @() @() @($rolledNote, ('boot    : ' + (Get-RolledClock -1)), 'ARMED   : \d+/\d+ lines present')
New-RolledLog $logsR -1 { param($l) if ($l -notmatch 'LSP-Mixin/\]: FishingHookMixin') { $l } } -From 0 -To ($cutAfter - 1)
Test-Stale '   and a line the boot must print, missing from the ROTATED part, is found' $logsR @() 1 @('MISSING armed:mixin:lovely_sparkle_pieces:FishingHookMixin') @() @($rolledNote)
New-RolledLog $logsR -1 $null -From 0 -To ($cutAfter - 1); New-RolledLog $logsR -2 $null
Test-Stale '   and stale entries are judged on the joined boot (the boot before it lacks the lines too)' $logsR @('-Baseline', $sb) 0 @() @($idDef, $idAcc) @($rolledNote, ('not in the complete boot before it \(' + (Get-RolledClock -2)))
Clear-Rolled $logsR; New-RolledLog $logsR -1 $null -From 0 -To ($cutBefore - 1); Set-LatestTail $logsR $cutBefore $null
Test-Stale 'rolled while the server was still loading (JVM start in the rotated log, Done in latest.log) -> clean' $logsR @() 0 @() @() @($rolledNote, 'ARMED   : \d+/\d+ lines present')
Set-LatestTail $logsR $cutBefore $noDone
Test-Stale 'rolled, and the boot really never reached Done -> an unfinished boot, as red as a fresh one' $logsR @() 2 @('CHECK-FAILED check:boot-incomplete') @() @($rolledNote)
Clear-Rolled $logsR; New-RolledLog $logsR -2 $null -From 0 -To ($cutBefore - 1); New-RolledLog $logsR -1 $null -From $cutBefore -To ($cutAfter - 1); Set-LatestTail $logsR $cutAfter $null
Test-Stale 'an uptime across two midnights (two rotated logs before latest.log) -> joined from all three' $logsR @() 0 @() @() @(('this boot is read from ' + [regex]::Escape((Get-RolledName -2)) + ' \+ ' + [regex]::Escape((Get-RolledName -1)) + ' \+ latest\.log'), ('boot    : ' + (Get-RolledClock -2)))
Clear-Rolled $logsR
Test-Stale 'rolled, and the log before it is not in the directory -> NOT RUN "boot not judgeable: log rolled", not red, exit 0' $logsR @() 0 @() @() @($notJudged, 'the rotated log before it is not in this directory', 'ARMED   : not judged \(log rolled', 'GREEN - nothing found \(2 check not run')
Set-LatestTail $logsR $cutBefore $null
Test-Stale '   the same when Done IS in the tail: lines printed before the roll are in the missing log, so none is called MISSING' $logsR @() 0 @() @() @($notJudged, 'ARMED   : not judged \(log rolled')
Set-LatestTail $logsR $cutAfter $null
New-RolledLog $logsR -1 $null
Test-Stale 'the log before it ends with a server stop (another run) -> not joined to it, not judgeable, not red' $logsR @() 0 @() @() @($notJudged, 'ends with a server stop: it is another run')
Clear-Rolled $logsR; New-RolledLog $logsR 0 $null -From 0 -To ($cutAfter - 1)
Test-Stale 'the log before it ends on the same day (no change of date, so no roll at midnight) -> not joined, not judgeable' $logsR @() 0 @() @() @($notJudged, 'does not end on an earlier day')
Test-Stale 'a FRESH latest.log (JVM start, no Done) next to a complete earlier boot -> still an unfinished boot, red' $logsNoDone @() 2 @('CHECK-FAILED check:boot-incomplete') @() @()
$rolledOut = Invoke-Checker @('-LogsDir', $logsNoDone)
Assert-That (@($rolledOut.Out | Where-Object { $_ -match 'rolled at midnight|log rolled' }).Count -eq 0) '   and nothing in that report speaks of a rolled log'

# =============================================================================
# PART 3 - RECORD (findings log + status file)
# =============================================================================
Write-Host ""
Write-Host "== PART 3: what gets written ==" -ForegroundColor Cyan
$caseLogs = New-Case 'record' 'kubejs/server.log' { param($l) if ($l -notmatch '\[twilight_boss_drops\] registered') { $l } }
$before = @(Get-ChildItem -LiteralPath (Split-Path -Parent $caseLogs) -Recurse -Force | ForEach-Object { $_.FullName })
[void](Invoke-Checker @('-LogsDir', $caseLogs))
$after = @(Get-ChildItem -LiteralPath (Split-Path -Parent $caseLogs) -Recurse -Force | ForEach-Object { $_.FullName })
Assert-That (($before -join '|') -eq ($after -join '|')) 'without -Write nothing is created next to the logs'
$r1 = Invoke-Checker @('-LogsDir', $caseLogs, '-Write', '-Quiet')
$fl = Join-Path (Join-Path $caseLogs 'loud') 'findings.jsonl'
$sf = Join-Path (Split-Path -Parent $caseLogs) '.icraft_watch_status'
$st = Read-Status $sf
Assert-That ((Test-Path -LiteralPath $fl) -and (Test-Path -LiteralPath $sf)) 'with -Write: logs\loud\findings.jsonl and ..\.icraft_watch_status appear at their default places'
Assert-That ((@($st.Keys | Sort-Object) -join ',') -eq 'boot,open,sha,summary,ts,worst' -and $st['worst'] -eq 'RED' -and $st['open'] -eq '1' -and $st['ts'] -match '^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$') 'status file: exactly ts, boot, sha, worst, open, summary; worst=RED open=1'
$r2 = Invoke-Checker @('-LogsDir', $caseLogs, '-Write', '-Quiet')
Assert-That (@([System.IO.File]::ReadAllLines($fl)).Count -eq 1) 'a second pass over the same boot appends nothing (the finding is already open)'
# roll: pad the log past 1 MiB with closed history, then one more pass
$pad = New-Object System.Text.StringBuilder
$padLine = '{"ts":"2026-01-01T00:00:00Z","boot":"x","sha":"x","kind":"ERROR","sev":"RED","id":"kjs-error:padding","src":"kubejs/server.log","detail":"' + ('p' * 400) + '","state":"closed"}'
while ($pad.Length -lt 1100000) { [void]$pad.Append($padLine).Append("`n") }
[System.IO.File]::AppendAllText($fl, $pad.ToString(), $Utf8)
$r3 = Invoke-Checker @('-LogsDir', $caseLogs, '-Write', '-Quiet')
$rolledLines = @([System.IO.File]::ReadAllLines($fl))
Assert-That ((Test-Path -LiteralPath ($fl + '.1')) -and (Get-Item -LiteralPath $fl).Length -lt 4096 -and $rolledLines.Count -eq 1 -and $rolledLines[0] -match '"id":"armed:loot/twilight_boss_drops\.js"' -and $rolledLines[0] -match '"carried":true') 'above 1 MiB the log rolls to findings.jsonl.1 and the new file starts with the one open finding, marked carried'
# heal the boot: the finding closes, the status goes green
Copy-Item -LiteralPath (Join-Path $baseLogs 'kubejs\server.log') -Destination (Join-Path $caseLogs 'kubejs\server.log') -Force
$r4 = Invoke-Checker @('-LogsDir', $caseLogs, '-Write', '-Quiet')
$st = Read-Status $sf
$last = @([System.IO.File]::ReadAllLines($fl))[-1]
Assert-That ($r4.Exit -eq 0 -and $st['worst'] -eq 'GREEN' -and $st['open'] -eq '0' -and $last -match '"state":"closed"' -and $last -match '"id":"armed:loot/twilight_boss_drops\.js"') 'when the line is back the finding closes with a later line of the same id; status GREEN, open=0'

# =============================================================================
Write-Host ""
if (-not $Keep) { Remove-Item -LiteralPath $WorkDir -Recurse -Force -ErrorAction SilentlyContinue } else { Write-Host "[replay-test] kept $WorkDir" -ForegroundColor DarkGray }
if ($fail.Count -gt 0) {
    Write-Host ("[replay-test] FAIL - {0} assertion(s) failed" -f $fail.Count) -ForegroundColor Red
    exit 1
}
Write-Host ("[replay-test] PASS - {0} RED / {1} GREEN over the {2} measured boots, planted defects and record checks all as expected (PowerShell {3})" -f $red.Count, $green.Count, $measured.Count, $PSVersionTable.PSVersion) -ForegroundColor Green
exit 0
