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
#   RECORD   Nothing is written without -Write; the findings log rolls above 1 MiB
#            and carries what is open; every line of it is valid JSON.
#
#   powershell -File .minecraft\dev\loud\replay-test.ps1            # all three parts
#   pwsh       -File .minecraft\dev\loud\replay-test.ps1 -Newer     # + boots mirrored after the anchor
#
# Exit 0 pass, 1 fail, 2 could not run (history not available: a shallow clone, or
# the history of this repo was rewritten). The boots are read from git HISTORY, so
# the test does not need the mirror folder on the tip (it left the public tip when
# the launcher began mirroring to the private logs repo); -RepoRoot runs it against
# another checkout. The checker's own baseline.json describes today's boots, so old
# boots are replayed with -NoBaseline; the baseline cases build their own file.
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
$LogRel    = '.minecraft/server_distribution/TesterLogs/Server Logs'
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
$listed = @(& git -C $RepoRoot log "-$Count" '--format=%h|%ad' '--date=format:%Y-%m-%d %H:%M' $Anchor -- "$LogRel/kubejs/server.log")
if ($listed.Count -lt $Count) { Stop-CannotRun "only $($listed.Count) mirrored versions of kubejs/server.log up to $Anchor, expected $Count" }
$boots = New-Object System.Collections.Generic.List[object]
for ($i = $listed.Count - 1; $i -ge 0; $i--) { $t = $listed[$i].Split('|'); $boots.Add([pscustomobject]@{ Hash = $t[0]; Date = $t[1]; Set = 'measured' }) }
if ($Newer) {
    $more = @(& git -C $RepoRoot log '--format=%h|%ad' '--date=format:%Y-%m-%d %H:%M' "$Anchor..HEAD" -- "$LogRel/kubejs/server.log")
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
    $def = @($Defects | Where-Object { $_ } | ForEach-Object { ($_.TrimEnd(',') -replace ',"count":\d+,"reason":"","accepted":""', ',"what":"planted defect","listed":"2026-10-11"') })
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
