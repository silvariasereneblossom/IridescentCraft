# =============================================================================
# loud-check.ps1 - the deterministic half of the loud-failure watcher
# =============================================================================
# Reads one boot's logs and answers "is anything broken that nobody was told
# about?". The pack ran for four months with `Error in 'LootJS.modifiers'` and
# `... with 1 errors` in every boot log (twelve loot scripts dead) because
# nothing read the logs. This is the reader. No network, no key, no Python:
# it runs on the server box, on the dev PC and on a CI runner alike.
#
# WHAT IT CHECKS
#   1. KubeJS failure lines (kubejs/server.log, kubejs/startup.log). These three
#      can NEVER be baselined - a baseline hides whatever was broken the day it
#      was taken:
#        - Error in '<handler>'            (the handler aborted; all it had left to do is dead)
#        - a summary line `Loaded N/M KubeJS ... scripts ... E errors` with N != M or E > 0
#        - any ERROR-level line
#   2. LOADED tier: every script of the deployed tree (expected_state.json) has a
#      `Loaded script` line; a script that loaded and is NOT in the tree is STALE.
#   3. ARMED tier: every line of liveness_manifest.json is present (a feature got
#      to the end of its registration), none of its `must_not` lines is, and its
#      count is not below its floor. Judged only after `Done (..s)!`.
#   4. Failure patterns in latest.log / debug.log: mixin apply failures, missing
#      mandatory dependencies, server tick loop exceptions, OutOfMemoryError,
#      saved crash reports. debug.log is read when it is there (a copy of the
#      logs carries it only after a crash); when it is not, the report says so.
#   5. NEW signatures against baseline.json (next to this script, or -Baseline):
#      ERROR / FATAL lines of latest.log and WARN lines of the KubeJS logs that
#      nobody has looked at yet, and accepted ones seen 3x as often as accepted
#      (per load pass: a /reload prints every load-time line again). WARN lines
#      of latest.log are NOT in the tier (several hundred a boot, not triaged).
#      The baseline has two lists:
#        signatures  accepted, each with a reason and the date;
#        defects     reviewed and deliberately NOT accepted: they stay findings
#                    (KNOWN DEFECT) until fixed, then the entry is deleted.
#      A baseline hides what was broken the day it was taken, so nothing gets in
#      without being read: -ProposeBaseline <file> writes the current list with
#      reason and date empty, and such a file is refused. -NoBaseline switches
#      the tier off (for old boots); it is then reported NOT RUN, never "0 new".
#      The file is public: no entry may carry a player name, chat or an address.
#
# USAGE (Windows PowerShell 5.1 or PowerShell 7)
#   loud-check.ps1 -LogsDir "Z:\...\IridescentCraft Dedicated Server\logs"
#   loud-check.ps1 -LogsDir <any copy of that directory> -ExpectedState <file>
#   loud-check.ps1 -LogsDir <dir> -Sources kubejs/server.log         # only that log
#   loud-check.ps1 -LogsDir <dir> -Write                             # also record (see OUTPUT)
#
#   -ExpectedState  expected_state.json of the deployed tree. Default: next to the
#                   logs directory (the box), then one level further up.
#   -Manifest       default liveness_manifest.json next to this script.
#   -Sources        subset of: kubejs/server.log kubejs/startup.log latest.log debug.log
#                   (default: the first three, and debug.log when it exists)
#   -Sha / -Boot    override what is read from .icraft_last_sha / the first latest.log line.
#
# OUTPUT
#   The report goes to the console. Nothing is written unless -Write is given
#   (verify-server.ps1 and a look at a copy of the logs must not leave files behind):
#     -FindingsPath  default <LogsDir>\loud\findings.jsonl. Append-only, one JSON
#                    object per line; a finding closes with a later line carrying
#                    the same id and "state":"closed". Rolled to findings.jsonl.1
#                    above 1 MiB (everything under logs\ is committed by the
#                    launcher's log mirror); findings still open are carried into
#                    the new file.
#     -StatusPath    default <LogsDir>\..\.icraft_watch_status, key=value:
#                    ts, boot, sha, worst (GREEN / AMBER / RED), open, summary.
#                    The reader applies the age rule (ts older than three
#                    intervals = RED): a stopped watcher must not look healthy.
#
# EXIT CODE   0 clean, 1 findings, 2 could not check (and found nothing else).
#   A check that cannot run is a CHECK-FAILED finding, printed in red; it is never
#   reported as zero findings. Findings win over "could not check" for the exit
#   code, and both are listed.
#
# Finding kinds: ERROR (failure line / pattern), MISSING (liveness), STALE (script
# on the box, not in the tree), NEW (signature not in the baseline, or a known
# defect that is not fixed; severity AMBER), CHECK-FAILED.
# The launcher will own the on-box watcher; this script is its reference and the
# post-deploy check (verify-server.ps1). ASCII only: Windows PowerShell 5.1 reads a
# BOM-less script as ANSI.
# =============================================================================

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true, Position = 0)][string]$LogsDir,
    [string]$Manifest,
    [string]$ExpectedState,
    [string]$Baseline,
    [switch]$NoBaseline,
    [string]$ProposeBaseline,
    [string[]]$Sources,
    [string]$Sha,
    [string]$Boot,
    [switch]$Write,
    [string]$FindingsPath,
    [string]$StatusPath,
    [int]$MaxShow = 40,
    [switch]$Quiet
)

$ErrorActionPreference = 'Stop'
$AllSources    = @('kubejs/server.log', 'kubejs/startup.log', 'latest.log', 'debug.log')
$RollBytes     = 1048576
$MaxPerFamily  = 25
$Utf8NoBom     = New-Object System.Text.UTF8Encoding($false)
$ScriptDir     = Split-Path -Parent $MyInvocation.MyCommand.Path
# .NET file calls resolve a relative path against the process directory, not the
# PowerShell location: make every path parameter absolute once, here.
function Resolve-FullPath { param([string]$Path) if (-not $Path) { return $Path }; return $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($Path) }
$Manifest        = Resolve-FullPath $Manifest
$ExpectedState   = Resolve-FullPath $ExpectedState
$Baseline        = Resolve-FullPath $Baseline
$ProposeBaseline = Resolve-FullPath $ProposeBaseline
$FindingsPath    = Resolve-FullPath $FindingsPath
$StatusPath      = Resolve-FullPath $StatusPath

$findings   = New-Object System.Collections.Generic.List[object]
$findingIds = New-Object 'System.Collections.Generic.HashSet[string]'
$evaluated  = New-Object 'System.Collections.Generic.HashSet[string]'   # "<family>|<src>" judged in this pass
$notRun     = New-Object System.Collections.Generic.List[string]
$info       = New-Object System.Collections.Generic.List[string]

function Add-Finding {
    param([string]$Kind, [string]$Sev, [string]$Id, [string]$Src, [string]$Detail)
    if (-not $script:findingIds.Add($Id)) { return }
    $script:findings.Add([pscustomobject]@{ kind = $Kind; sev = $Sev; id = $Id; src = $Src; detail = $Detail })
}
function Get-Family {
    param([string]$Id)
    $p = $Id.Split(':')[0]
    switch ($p) {
        'handler'          { return 'kjs' }
        'summary'          { return 'kjs' }
        'summary-warnings' { return 'kjs' }
        'kjs-error'        { return 'kjs' }
        'loaded'           { return 'loaded' }
        'stale'            { return 'loaded' }
        'armed'            { return 'armed' }
        'mustnot'          { return 'armed' }
        'pattern'          { return 'pattern' }
        'new'              { return 'new' }
        'grew'             { return 'new' }
        'defect'           { return 'new' }
        default            { return 'check' }
    }
}
# Shared read: the running server holds these files open for writing.
function Read-LogLines {
    param([string]$Path)
    $share = [System.IO.FileShare]::ReadWrite -bor [System.IO.FileShare]::Delete
    $fs = New-Object System.IO.FileStream($Path, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, $share)
    try {
        $sr = New-Object System.IO.StreamReader($fs, [System.Text.Encoding]::UTF8)
        $list = New-Object System.Collections.Generic.List[string]
        while ($true) {
            $line = $sr.ReadLine()
            if ($null -eq $line) { break }
            $list.Add($line)
        }
        return , $list
    } finally { $fs.Dispose() }
}
function Get-Hash8 {
    param([string]$Text)
    $sha1 = [System.Security.Cryptography.SHA1]::Create()
    try { $b = $sha1.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($Text)) } finally { $sha1.Dispose() }
    return ('{0:x2}{1:x2}{2:x2}{3:x2}' -f $b[0], $b[1], $b[2], $b[3])
}
# One line -> the text that identifies its kind: no clock, ids, addresses or counts.
$rxSigUuid = New-Object regex '\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b'
$rxSigAddr = New-Object regex '\b\d{1,3}(?:\.\d{1,3}){3}(?::\d+)?\b'
$rxSigLine = New-Object regex '(\.js)#\d+'
$rxSigFlt  = New-Object regex '-?\d+\.\d+'
$rxSigInt  = New-Object regex '(?<![#\w.])-?\d{2,}\b'
function Get-Signature {
    param([string]$Text)
    $s = $rxSigUuid.Replace($Text, '<uuid>')
    $s = $rxSigAddr.Replace($s, '<addr>')
    $s = $rxSigLine.Replace($s, '$1#<n>')
    $s = $rxSigFlt.Replace($s, '<n>')
    $s = $rxSigInt.Replace($s, '<n>')
    if ($s.Length -gt 200) { $s = $s.Substring(0, 200) }
    return $s
}
function ConvertTo-JsonString {
    param([string]$Text)
    $sb = New-Object System.Text.StringBuilder
    [void]$sb.Append('"')
    if ($null -ne $Text) {
        foreach ($ch in $Text.ToCharArray()) {
            $c = [int]$ch
            if     ($c -eq 34) { [void]$sb.Append('\"') }
            elseif ($c -eq 92) { [void]$sb.Append('\\') }
            elseif ($c -eq 10) { [void]$sb.Append('\n') }
            elseif ($c -eq 13) { [void]$sb.Append('\r') }
            elseif ($c -eq 9)  { [void]$sb.Append('\t') }
            elseif ($c -lt 32 -or $c -gt 126) { [void]$sb.Append('\u' + $c.ToString('x4')) }
            else { [void]$sb.Append($ch) }
        }
    }
    [void]$sb.Append('"')
    return $sb.ToString()
}
# The findings file is written by this script only, so its lines are read back with a
# field extractor rather than ConvertFrom-Json (which turns the timestamps into
# [datetime] on PowerShell 7 and leaves them strings on 5.1).
$rxUnesc = New-Object regex '\\(u[0-9a-fA-F]{4}|.)'
function Get-JsonField {
    param([string]$Line, [string]$Name)
    $m = [regex]::Match($Line, '"' + [regex]::Escape($Name) + '":"((?:[^"\\]|\\.)*)"')
    if (-not $m.Success) { return $null }
    return $rxUnesc.Replace($m.Groups[1].Value, {
        param($x)
        $t = $x.Groups[1].Value
        if ($t.Length -eq 5) { return [string][char][Convert]::ToInt32($t.Substring(1), 16) }
        switch -CaseSensitive ($t) { 'n' { return "`n" } 'r' { return "`r" } 't' { return "`t" } default { return $t } }
    })
}
function Format-FindingLine {
    param([string]$Ts, [string]$BootAt, [string]$ShaAt, $F, [string]$State, [bool]$Carried)
    # one string, built left to right (a comma inside `a + b, c + d` would bind before the plus)
    $s = '{"ts":' + (ConvertTo-JsonString $Ts)
    $s += ',"boot":' + (ConvertTo-JsonString $BootAt)
    $s += ',"sha":' + (ConvertTo-JsonString $ShaAt)
    $s += ',"kind":' + (ConvertTo-JsonString $F.kind)
    $s += ',"sev":' + (ConvertTo-JsonString $F.sev)
    $s += ',"id":' + (ConvertTo-JsonString $F.id)
    $s += ',"src":' + (ConvertTo-JsonString $F.src)
    $s += ',"detail":' + (ConvertTo-JsonString $F.detail)
    $s += ',"state":' + (ConvertTo-JsonString $State)
    if ($Carried) { $s += ',"carried":true' }
    return $s + '}'
}

function Invoke-Check {
    # ---- inputs ---------------------------------------------------------------
    if (-not (Test-Path -LiteralPath $LogsDir -PathType Container)) {
        Add-Finding 'CHECK-FAILED' 'RED' 'check:logs-dir' '' ("logs directory not found or not reachable: $LogsDir")
        return
    }
    $logsRoot = (Resolve-Path -LiteralPath $LogsDir).ProviderPath
    $parent   = Split-Path -Parent $logsRoot

    $srcList = @()
    if ($Sources) { foreach ($s in $Sources) { foreach ($t in ($s -split ',')) { if ($t.Trim()) { $srcList += $t.Trim().Replace('\', '/') } } } }
    if ($srcList.Count -eq 0) {
        # debug.log is checked when it is there. A copy of the logs carries it only after a crash; the one
        # pattern it adds is also read from latest.log, and its absence is reported, not passed over.
        $srcList = @($AllSources | Where-Object { $_ -ne 'debug.log' })
        if (Test-Path -LiteralPath (Join-Path $logsRoot 'debug.log') -PathType Leaf) { $srcList += 'debug.log' }
        else { $notRun.Add('debug.log (it is not in this directory): its mixin-failure pattern was read from latest.log only') }
    }
    foreach ($s in $srcList) {
        if ($AllSources -cnotcontains $s) {
            Add-Finding 'CHECK-FAILED' 'RED' 'check:sources' '' ("unknown source '$s' (known: " + ($AllSources -join ', ') + ')')
            return
        }
    }
    $script:srcList = $srcList

    $lines = @{}
    foreach ($s in $srcList) {
        $p = $logsRoot
        foreach ($seg in $s.Split('/')) { $p = Join-Path $p $seg }
        try {
            if (-not (Test-Path -LiteralPath $p -PathType Leaf)) { throw 'file not found' }
            $lines[$s] = Read-LogLines $p
        } catch {
            Add-Finding 'CHECK-FAILED' 'RED' ("check:read:$s") $s ("cannot read $s (" + $_.Exception.Message + '): nothing in it was checked')
        }
    }

    # sha / boot
    $script:shaAt = 'unknown'
    if ($Sha) { $script:shaAt = $Sha }
    else {
        $marker = Join-Path $parent '.icraft_last_sha'
        if (Test-Path -LiteralPath $marker -PathType Leaf) {
            $v = ([System.IO.File]::ReadAllText($marker)).Trim()
            if ($v) { $script:shaAt = $v }
        }
    }
    if ($script:shaAt.Length -gt 8 -and $script:shaAt -match '^[0-9a-fA-F]+$') { $script:shaAt = $script:shaAt.Substring(0, 8) }
    $script:bootAt = 'unknown'
    if ($Boot) { $script:bootAt = $Boot }
    elseif ($lines.ContainsKey('latest.log')) {
        $months = @{ Jan = 1; Feb = 2; Mar = 3; Apr = 4; May = 5; Jun = 6; Jul = 7; Aug = 8; Sep = 9; Oct = 10; Nov = 11; Dec = 12 }
        foreach ($l in $lines['latest.log']) {
            $m = [regex]::Match($l, '^\[(\d{2})([A-Za-z]{3})(\d{4}) (\d{2}:\d{2}:\d{2})')
            if ($m.Success -and $months.ContainsKey($m.Groups[2].Value)) {
                # the log's own clock (the box's local time), so no zone designator
                $script:bootAt = '{0}-{1:00}-{2}T{3}' -f $m.Groups[3].Value, $months[$m.Groups[2].Value], $m.Groups[1].Value, $m.Groups[4].Value
                break
            }
        }
    }

    # ---- 1. KubeJS failure lines + what loaded -------------------------------
    $rxHandler = New-Object regex "Error in '([^']+)'"
    $rxSummary = New-Object regex 'Loaded (\d+)/(\d+) KubeJS (\w+) scripts in .*? with (\d+) errors? and (\d+) warnings?'
    $rxErrLine = New-Object regex '^\[[\d:]+\] \[ERROR\] ?!? ?(.*)$'
    $rxLoaded  = New-Object regex 'Loaded script (\w+_scripts):(\S+) in '
    $loaded      = @{}     # kind -> HashSet of relative script paths
    $summaryOk   = @{}     # kind -> $true when a summary line exists
    $summaryText = @{}
    $kjsErrors = 0; $kjsAborts = 0
    foreach ($pair in @(@('kubejs/server.log', 'server'), @('kubejs/startup.log', 'startup'))) {
        $src = $pair[0]; $kind = $pair[1]
        if (-not $lines.ContainsKey($src)) { continue }
        [void]$evaluated.Add("kjs|$src")
        $set = New-Object 'System.Collections.Generic.HashSet[string]'
        $handlers = @{}; $sigs = @{}; $sigOrder = New-Object System.Collections.Generic.List[string]
        $bad = $null; $warned = $null; $seenSummary = $false
        foreach ($l in $lines[$src]) {
            $m = $rxLoaded.Match($l)
            if ($m.Success) { if ($m.Groups[1].Value -eq ($kind + '_scripts')) { [void]$set.Add($m.Groups[2].Value) }; continue }
            $m = $rxSummary.Match($l)
            if ($m.Success -and $m.Groups[3].Value -eq $kind) {
                $seenSummary = $true
                $n = [int]$m.Groups[1].Value; $of = [int]$m.Groups[2].Value; $e = [int]$m.Groups[4].Value; $w = [int]$m.Groups[5].Value
                $summaryText[$kind] = "$n/$of, $e errors, $w warnings"
                if ($n -ne $of -or $e -gt 0) { $bad = "Loaded $n/$of KubeJS $kind scripts with $e errors and $w warnings" }
                elseif ($w -gt 0) { $warned = "Loaded $n/$of KubeJS $kind scripts with 0 errors and $w warnings" }
                continue
            }
            $h = $rxHandler.Match($l)
            if ($h.Success) {
                $name = $h.Groups[1].Value
                if ($handlers.ContainsKey($name)) { $handlers[$name]++ } else { $handlers[$name] = 1 }
                continue
            }
            $m = $rxErrLine.Match($l)
            if ($m.Success) {
                $sig = Get-Signature $m.Groups[1].Value
                if ($sigs.ContainsKey($sig)) { $sigs[$sig]++ } else { $sigs[$sig] = 1; $sigOrder.Add($sig) }
            }
        }
        $loaded[$kind] = $set
        $summaryOk[$kind] = $seenSummary
        foreach ($name in ($handlers.Keys | Sort-Object)) {
            $kjsAborts += $handlers[$name]
            Add-Finding 'ERROR' 'RED' ("handler:$name") $src ("Error in '$name' x" + $handlers[$name] + ': the handler aborted, whatever it had left to register is dead')
        }
        if ($bad)    { Add-Finding 'ERROR' 'RED'   ("summary:$kind") $src $bad }
        if ($warned) { Add-Finding 'ERROR' 'AMBER' ("summary-warnings:$kind") $src $warned }
        if (-not $seenSummary) {
            Add-Finding 'MISSING' 'RED' ("loaded:summary:$kind") $src ("no 'Loaded N/N KubeJS $kind scripts' line: the script load did not finish (or this is not a boot log)")
        }
        $shown = 0; $restLines = 0; $restSigs = 0
        foreach ($sig in $sigOrder) {
            $kjsErrors += $sigs[$sig]
            if ($shown -lt $MaxPerFamily) {
                $shown++
                Add-Finding 'ERROR' 'RED' ('kjs-error:' + (Get-Hash8 ($src + '|' + $sig))) $src ('ERROR line x' + $sigs[$sig] + ': ' + $sig)
            } else { $restSigs++; $restLines += $sigs[$sig] }
        }
        if ($restSigs -gt 0) { Add-Finding 'ERROR' 'RED' ("kjs-error:more:$kind") $src ("$restSigs more distinct ERROR lines ($restLines in all) not listed one by one") }
    }
    $script:kjsErrors = $kjsErrors; $script:kjsAborts = $kjsAborts

    # ---- 2. LOADED tier -------------------------------------------------------
    $expected = $null   # kind -> HashSet
    $needLoaded = $lines.ContainsKey('kubejs/server.log') -or $lines.ContainsKey('kubejs/startup.log')
    if ($needLoaded) {
        $esPath = $null
        if ($ExpectedState) { $esPath = $ExpectedState }
        else {
            foreach ($c in @((Join-Path $parent 'expected_state.json'), (Join-Path (Split-Path -Parent $parent) 'expected_state.json'))) {
                if (Test-Path -LiteralPath $c -PathType Leaf) { $esPath = $c; break }
            }
        }
        try {
            if (-not $esPath) { throw 'no expected_state.json next to the logs directory or one level up (pass -ExpectedState)' }
            if (-not (Test-Path -LiteralPath $esPath -PathType Leaf)) { throw "not found: $esPath" }
            $raw = [System.IO.File]::ReadAllText($esPath)
            # key scan, not ConvertFrom-Json: the file is close to the 2 MB limit of the 5.1 parser
            $expected = @{ server = (New-Object 'System.Collections.Generic.HashSet[string]'); startup = (New-Object 'System.Collections.Generic.HashSet[string]') }
            foreach ($m in [regex]::Matches($raw, '"kubejs/(server|startup)_scripts/([^"]+\.js)"\s*:\s*\{')) {
                [void]$expected[$m.Groups[1].Value].Add($m.Groups[2].Value)
            }
            if ($expected['server'].Count -eq 0) { throw "no kubejs/server_scripts entry in $esPath (not an expected_state.json of a server tree?)" }
            $gen = [regex]::Match($raw, '"generated_from"\s*:\s*"([^"]*)"')
            $script:expectedFrom = 'expected_state.json'
            if ($gen.Success) { $script:expectedFrom = 'expected_state.json @' + $gen.Groups[1].Value }
        } catch {
            $expected = $null
            Add-Finding 'CHECK-FAILED' 'RED' 'check:expected-state' '' ('LOADED tier not checked, the deployed script list is unreadable: ' + $_.Exception.Message)
        }
    }
    $script:loadedText = @()
    foreach ($pair in @(@('kubejs/server.log', 'server'), @('kubejs/startup.log', 'startup'))) {
        $src = $pair[0]; $kind = $pair[1]
        if (-not $lines.ContainsKey($src) -or $null -eq $expected) { continue }
        [void]$evaluated.Add("loaded|$src")
        $have = $loaded[$kind]; $want = $expected[$kind]
        $missing = @($want | Where-Object { -not $have.Contains($_) } | Sort-Object)
        $stale   = @($have | Where-Object { -not $want.Contains($_) } | Sort-Object)
        $script:loadedText += ('{0} {1}/{2}' -f $kind, ($want.Count - $missing.Count), $want.Count) + $(if ($stale.Count) { " (+$($stale.Count) stale)" } else { '' })
        # without a summary line the load never finished: the summary finding says so, once
        if ($summaryOk[$kind]) {
            foreach ($s in $missing) { Add-Finding 'MISSING' 'RED' ("loaded:${kind}_scripts/$s") $src ("no 'Loaded script ${kind}_scripts:$s' line: the script is in the deployed tree and did not load") }
        }
        foreach ($s in $stale) { Add-Finding 'STALE' 'RED' ("stale:${kind}_scripts/$s") $src ("the server loaded ${kind}_scripts:$s, which is not in the deployed tree ($($script:expectedFrom)): a stale file on the box") }
    }

    # ---- 3. ARMED tier --------------------------------------------------------
    $mf = $null
    $mfPath = $Manifest
    if (-not $mfPath) { $mfPath = Join-Path $ScriptDir 'liveness_manifest.json' }
    try {
        if (-not (Test-Path -LiteralPath $mfPath -PathType Leaf)) { throw "not found: $mfPath" }
        $mf = [System.IO.File]::ReadAllText($mfPath, [System.Text.Encoding]::UTF8) | ConvertFrom-Json
        if ($null -eq $mf.entries -or @($mf.entries).Count -eq 0) { throw 'no entries' }
        $seen = New-Object 'System.Collections.Generic.HashSet[string]'
        foreach ($e in @($mf.entries)) {
            if (-not $e.id -or -not $e.owner -or -not $e.log -or -not $e.pattern) { throw ('an entry lacks id / owner / log / pattern: ' + ($e | ConvertTo-Json -Compress)) }
            if ($AllSources -cnotcontains [string]$e.log) { throw "entry $($e.id): unknown log '$($e.log)'" }
            if (-not $seen.Add([string]$e.id)) { throw "duplicate id $($e.id)" }
            try {
                [void](New-Object regex ([string]$e.pattern))
                if ($e.PSObject.Properties['must_not']) { foreach ($x in @($e.must_not)) { [void](New-Object regex ([string]$x)) } }
            } catch { throw "entry $($e.id): bad regex ($($_.Exception.Message))" }
        }
    } catch {
        $mf = $null
        Add-Finding 'CHECK-FAILED' 'RED' 'check:manifest' '' ('ARMED tier not checked, the liveness manifest is unusable: ' + $_.Exception.Message)
    }
    $script:armedText = $null
    if ($null -ne $mf) {
        $bootDone = $true
        $bc = $mf.boot_complete
        if ($null -ne $bc -and $lines.ContainsKey([string]$bc.log)) {
            $rx = New-Object regex ([string]$bc.pattern)
            $bootDone = $false
            foreach ($l in $lines[[string]$bc.log]) { if ($rx.IsMatch($l)) { $bootDone = $true; break } }
            if (-not $bootDone) {
                Add-Finding 'CHECK-FAILED' 'RED' 'check:boot-incomplete' ([string]$bc.log) ("no '" + [string]$bc.pattern + "' line: the server is still starting, or it died before it finished. Liveness (ARMED) was not judged")
            }
        }
        $total = 0; $present = 0; $skipped = 0
        $owners = New-Object 'System.Collections.Generic.HashSet[string]'
        foreach ($e in @($mf.entries)) {
            $src = [string]$e.log
            [void]$owners.Add([string]$e.owner)
            if (-not $lines.ContainsKey($src)) { $skipped++; continue }
            $total++
            [void]$evaluated.Add("armed|$src")
            $rx = New-Object regex ([string]$e.pattern)
            $hit = $null
            foreach ($l in $lines[$src]) { $m = $rx.Match($l); if ($m.Success) { $hit = $m; break } }
            $gone = ''
            $own = [string]$e.owner
            if ($null -ne $expected -and $own.StartsWith('kubejs/server_scripts/') -and -not $expected['server'].Contains($own.Substring(22))) {
                $gone = " ($own is not in the deployed tree: remove the entry in the commit that removed the script)"
            }
            if ($null -eq $hit) {
                if ($bootDone) { Add-Finding 'MISSING' 'RED' ([string]$e.id) $src ('no line matching ' + [string]$e.pattern + $gone) }
            } else {
                $ok = $true
                if ($e.PSObject.Properties['min'] -and $hit.Groups.Count -gt 1) {
                    $n = 0
                    if ([int]::TryParse($hit.Groups[1].Value, [ref]$n) -and $n -lt [int]$e.min) {
                        $ok = $false
                        Add-Finding 'MISSING' 'RED' ([string]$e.id) $src ("the line is there, its count $n is below the floor $([int]$e.min): something stopped registering")
                    }
                }
                if ($ok) { $present++ }
            }
            if ($e.PSObject.Properties['must_not']) {
                foreach ($x in @($e.must_not)) {
                    $rxn = New-Object regex ([string]$x)
                    $c = 0
                    foreach ($l in $lines[$src]) { if ($rxn.IsMatch($l)) { $c++ } }
                    if ($c -gt 0) { Add-Finding 'ERROR' 'RED' ('mustnot:' + ([string]$e.id).Substring(([string]$e.id).IndexOf(':') + 1)) $src ("$c line(s) matching $x : the feature reports its own failure") }
                }
            }
        }
        $script:armedText = "$present/$total lines present"
        if (-not $bootDone) { $script:armedText = "not judged (boot incomplete), $total entries" }
        if ($skipped -gt 0) { $script:armedText += ", $skipped entries not checked (their log was not read)" }
        if ($null -ne $expected -and $lines.ContainsKey('kubejs/server.log')) {
            $silent = @($expected['server'] | Where-Object { -not $owners.Contains('kubejs/server_scripts/' + $_) }).Count
            $info.Add("$silent of $($expected['server'].Count) deployed server scripts have no ARMED entry yet (a silent script can die unseen)")
        }
    }

    # ---- 4. failure patterns in latest.log / debug.log -----------------------
    $patterns = @(
        @{ id = 'mixin-apply';  logs = @('latest.log', 'debug.log'); what = 'a mixin failed to apply'
           rx = 'InvalidMixinException|MixinApplyError|MixinTransformerError|InvalidInjectionException|InjectionError|Mixin apply (?:for mod \S+ )?failed|Critical injection failure' },
        @{ id = 'missing-deps'; logs = @('latest.log'); what = 'mod loading stopped on a missing or unsupported dependency'
           rx = 'Missing or unsupported mandatory dependencies|Missing mandatory dependencies' },
        @{ id = 'tick-loop';    logs = @('latest.log'); what = 'the server tick loop threw'
           rx = 'Exception in server tick loop|Encountered an unexpected exception' },
        @{ id = 'oom';          logs = @('latest.log'); what = 'the JVM ran out of memory'
           rx = 'java\.lang\.OutOfMemoryError' },
        @{ id = 'crash-report'; logs = @('latest.log'); what = 'a crash report was written'
           rx = 'This crash report has been saved to|Crash report saved to' }
    )
    $script:patternHits = 0
    foreach ($src in @('latest.log', 'debug.log')) {
        if (-not $lines.ContainsKey($src)) { continue }
        [void]$evaluated.Add("pattern|$src")
        $active = @($patterns | Where-Object { $_.logs -contains $src })
        $rxs = @{}; $count = @{}; $first = @{}
        foreach ($p in $active) { $rxs[$p.id] = New-Object regex $p.rx; $count[$p.id] = 0 }
        $any = New-Object regex (($active | ForEach-Object { $_.rx }) -join '|')
        $i = 0
        foreach ($l in $lines[$src]) {
            $i++
            if (-not $any.IsMatch($l)) { continue }
            foreach ($p in $active) { if ($rxs[$p.id].IsMatch($l)) { $count[$p.id]++; if (-not $first.ContainsKey($p.id)) { $first[$p.id] = $i } } }
        }
        foreach ($p in $active) {
            if ($count[$p.id] -gt 0) {
                $script:patternHits += $count[$p.id]
                Add-Finding 'ERROR' 'RED' ('pattern:' + $p.id) $src ($p.what + ': ' + $count[$p.id] + " line(s) in $src, first at line " + $first[$p.id])
            }
        }
    }

    # ---- 5. NEW signatures against the baseline ------------------------------
    # In the tier (operator ruling 2026-10-11): ERROR / FATAL lines of latest.log and WARN lines of the KubeJS
    # logs. NOT in it: WARN lines of latest.log (several hundred per boot, not triaged) and KubeJS ERROR lines
    # (check 1: never baselined).
    $blPath = $Baseline
    if (-not $blPath -and -not $NoBaseline) {
        $d = Join-Path $ScriptDir 'baseline.json'
        if (Test-Path -LiteralPath $d -PathType Leaf) { $blPath = $d }
    }
    $newSources = @(@('latest.log', 'kubejs/server.log', 'kubejs/startup.log') | Where-Object { $lines.ContainsKey($_) })
    $rxLatest = New-Object regex '^\[[^\]]+\] \[[^\]]*/(ERROR|FATAL)\] (.*)$'
    $rxKjs    = New-Object regex '^\[[\d:]+\] \[(WARN)\] (.*)$'
    $observed = @{}       # src -> @{ counts = sig -> n; order = sigs as first seen }
    if ($blPath -or $ProposeBaseline) {
        foreach ($src in $newSources) {
            $rx = $rxKjs
            if ($src -eq 'latest.log') { $rx = $rxLatest }
            $obs = New-Object 'System.Collections.Generic.Dictionary[string,int]'
            $order = New-Object System.Collections.Generic.List[string]
            foreach ($l in $lines[$src]) {
                $m = $rx.Match($l)
                if (-not $m.Success) { continue }
                $sig = $m.Groups[1].Value + ' ' + (Get-Signature $m.Groups[2].Value)
                if ($obs.ContainsKey($sig)) { $obs[$sig] = $obs[$sig] + 1 } else { $obs[$sig] = 1; $order.Add($sig) }
            }
            $observed[$src] = @{ counts = $obs; order = $order }
        }
    }
    if ($ProposeBaseline) {
        # the list for a triage: every signature of this boot, reason and date left empty on purpose
        $rowsOut = New-Object System.Collections.Generic.List[string]
        foreach ($src in $newSources) {
            foreach ($sig in $observed[$src].order) {
                $rowsOut.Add('    {"log":' + (ConvertTo-JsonString $src) + ',"sig":' + (ConvertTo-JsonString $sig) + ',"count":' + $observed[$src].counts[$sig] + ',"reason":"","accepted":""}')
            }
        }
        [System.IO.File]::WriteAllText($ProposeBaseline, "{`n  `"version`": 1,`n  `"signatures`": [`n" + ($rowsOut -join ",`n") + "`n  ]`n}`n", $Utf8NoBom)
        $info.Add("$($rowsOut.Count) signatures of this boot (latest.log ERROR, KubeJS WARN) written to $ProposeBaseline (give each a reason and a date, or leave it out; read it for names before committing)")
    }
    if ($NoBaseline -and -not $Baseline) {
        if ($newSources.Count -gt 0) { $notRun.Add('NEW-signature check (switched off with -NoBaseline)') }
    } elseif (-not $blPath) {
        if ($newSources.Count -gt 0) { $notRun.Add('NEW-signature check (latest.log ERROR and KubeJS WARN lines against a baseline): there is no baseline.json next to the checker') }
    } else {
        $bl = $null
        $known   = New-Object 'System.Collections.Generic.Dictionary[string,object]'
        $defects = New-Object 'System.Collections.Generic.Dictionary[string,object]'
        try {
            if (-not (Test-Path -LiteralPath $blPath -PathType Leaf)) { throw "not found: $blPath" }
            $bl = [System.IO.File]::ReadAllText($blPath, [System.Text.Encoding]::UTF8) | ConvertFrom-Json
            foreach ($b in @($bl.signatures)) {
                if ($null -eq $b) { continue }
                if (-not $b.log -or -not $b.sig) { throw 'a baseline entry lacks log / sig' }
                if (-not $b.reason -or -not ([string]$b.reason).Trim() -or -not $b.accepted) { throw ("baseline entry without a reason and an accepted date: " + [string]$b.sig) }
                $known[[string]$b.log + '|' + [string]$b.sig] = $b
            }
            # reviewed and deliberately NOT accepted: a defect stays a finding until it is fixed
            if ($bl.PSObject.Properties['defects']) {
                foreach ($b in @($bl.defects)) {
                    if ($null -eq $b) { continue }
                    if (-not $b.log -or -not $b.sig -or -not $b.what) { throw 'a defects entry lacks log / sig / what' }
                    $k = [string]$b.log + '|' + [string]$b.sig
                    if ($known.ContainsKey($k)) { throw ('a signature is both baselined and listed as a defect: ' + [string]$b.sig) }
                    $defects[$k] = $b
                }
            }
        } catch {
            $bl = $null
            Add-Finding 'CHECK-FAILED' 'RED' 'check:baseline' '' ('NEW-signature check not run, the baseline is unusable: ' + $_.Exception.Message)
        }
        if ($null -ne $bl) {
            # A /reload prints every load-time line again: growth is judged per load pass, not per file.
            $passes = 1
            if ($lines.ContainsKey('kubejs/server.log')) {
                $n = 0
                foreach ($l in $lines['kubejs/server.log']) { if ($l -match 'Loaded \d+/\d+ KubeJS server scripts') { $n++ } }
                if ($n -gt 1) { $passes = $n; $info.Add("$n script load passes in this log (the server was reloaded): baseline counts are compared per pass") }
            }
            foreach ($src in $newSources) {
                [void]$evaluated.Add("new|$src")
                $obs = $observed[$src].counts; $order = $observed[$src].order
                $shown = 0; $rest = 0; $grown = 0; $grownRest = 0
                foreach ($sig in $order) {
                    $key = $src + '|' + $sig
                    if ($defects.ContainsKey($key)) {
                        Add-Finding 'NEW' 'AMBER' ('defect:' + (Get-Hash8 $key)) $src ('KNOWN DEFECT, reviewed and not baselined (' + [string]$defects[$key].what + '), x' + $obs[$sig] + ': ' + $sig)
                    } elseif (-not $known.ContainsKey($key)) {
                        if ($shown -lt $MaxPerFamily) { $shown++; Add-Finding 'NEW' 'AMBER' ('new:' + (Get-Hash8 $key)) $src ('not in the baseline, x' + $obs[$sig] + ': ' + $sig) }
                        else { $rest++ }
                    } else {
                        $was = 1
                        if ($known[$key].PSObject.Properties['count'] -and [int]$known[$key].count -gt 0) { $was = [int]$known[$key].count }
                        if ($obs[$sig] -ge 3 * $was * $passes) {
                            if ($grown -lt $MaxPerFamily) { $grown++; Add-Finding 'NEW' 'AMBER' ('grew:' + (Get-Hash8 $key)) $src ("baselined at x$was, now x" + $obs[$sig] + ': ' + $sig) }
                            else { $grownRest++ }
                        }
                    }
                }
                if ($rest -gt 0) { Add-Finding 'NEW' 'AMBER' ("new:more:$src") $src ("$rest more signatures not in the baseline, not listed one by one") }
                if ($grownRest -gt 0) { Add-Finding 'NEW' 'AMBER' ("grew:more:$src") $src ("$grownRest more baselined signatures at 3x their accepted count, not listed one by one") }
            }
            $script:baselineText = "$($known.Count) signatures accepted, $($defects.Count) listed as defects"
        }
    }
}

# ---- run ---------------------------------------------------------------------
$script:srcList = @(); $script:shaAt = 'unknown'; $script:bootAt = 'unknown'
$script:loadedText = @(); $script:armedText = $null; $script:expectedFrom = ''
$script:kjsErrors = 0; $script:kjsAborts = 0; $script:patternHits = 0; $script:baselineText = $null
try {
    Invoke-Check
} catch {
    # a crash of the checker is "could not check", never a clean exit
    Add-Finding 'CHECK-FAILED' 'RED' 'check:crashed' '' ('the checker itself failed: ' + $_.Exception.Message + ' @ ' + $_.InvocationInfo.ScriptLineNumber)
}

# ---- findings log (only with -Write) -------------------------------------------
# $open ends up as everything open after this pass: what it found, plus what an
# earlier pass found in a log this pass did not look at.
$open = New-Object 'System.Collections.Generic.Dictionary[string,object]'
foreach ($f in $findings) { $open[$f.id] = $f }
$recordNote = $null
$recordError = $null
$now = [DateTime]::UtcNow.ToString('yyyy-MM-ddTHH:mm:ssZ')
if ($Write) {
    try {
        $root = $LogsDir
        if (Test-Path -LiteralPath $LogsDir -PathType Container) { $root = (Resolve-Path -LiteralPath $LogsDir).ProviderPath }
        elseif (-not $FindingsPath -or -not $StatusPath) { throw 'the logs directory does not exist, so there is no place next to it to write to' }
        if (-not $FindingsPath) { $FindingsPath = Join-Path (Join-Path $root 'loud') 'findings.jsonl' }
        if (-not $StatusPath)   { $StatusPath = Join-Path (Split-Path -Parent $root) '.icraft_watch_status' }
        $fdir = Split-Path -Parent $FindingsPath
        if ($fdir -and -not (Test-Path -LiteralPath $fdir)) { [void](New-Item -ItemType Directory -Force -Path $fdir) }

        # what the file says is open: the last line per id wins
        $was = New-Object 'System.Collections.Generic.Dictionary[string,object]'
        if (Test-Path -LiteralPath $FindingsPath -PathType Leaf) {
            foreach ($l in [System.IO.File]::ReadAllLines($FindingsPath, [System.Text.Encoding]::UTF8)) {
                $id = Get-JsonField $l 'id'
                if (-not $id) { continue }
                if ((Get-JsonField $l 'state') -eq 'closed') { [void]$was.Remove($id); continue }
                $was[$id] = [pscustomobject]@{ ts = (Get-JsonField $l 'ts'); boot = (Get-JsonField $l 'boot'); sha = (Get-JsonField $l 'sha')
                    kind = (Get-JsonField $l 'kind'); sev = (Get-JsonField $l 'sev'); id = $id; src = (Get-JsonField $l 'src'); detail = (Get-JsonField $l 'detail') }
            }
        }
        $out = New-Object System.Collections.Generic.List[string]
        $carry = New-Object System.Collections.Generic.List[object]
        foreach ($f in $findings) {
            if ($was.ContainsKey($f.id)) { $carry.Add($was[$f.id]) }       # already on record: no second line
            else { $out.Add((Format-FindingLine $now $script:bootAt $script:shaAt $f 'open' $false)) }
        }
        foreach ($id in @($was.Keys)) {
            if ($findingIds.Contains($id)) { continue }
            $o = $was[$id]
            $fam = Get-Family $id
            if ($fam -eq 'check' -or $evaluated.Contains("$fam|$($o.src)")) {
                # this pass judged that log and no longer sees it
                $c = [pscustomobject]@{ kind = $o.kind; sev = $o.sev; id = $id; src = $o.src; detail = 'no longer seen' }
                $out.Add((Format-FindingLine $now $script:bootAt $script:shaAt $c 'closed' $false))
            } else {
                $open[$id] = $o          # not looked at in this pass: stays open
                $carry.Add($o)
            }
        }
        if ((Test-Path -LiteralPath $FindingsPath -PathType Leaf) -and (Get-Item -LiteralPath $FindingsPath).Length -gt $RollBytes) {
            $rolled = $FindingsPath + '.1'
            if (Test-Path -LiteralPath $rolled) { Remove-Item -LiteralPath $rolled -Force }
            Move-Item -LiteralPath $FindingsPath -Destination $rolled
            # the new file starts with everything still open, so it can be read on its own
            $head = New-Object System.Collections.Generic.List[string]
            foreach ($o in $carry) { $head.Add((Format-FindingLine $o.ts $o.boot $o.sha $o 'open' $true)) }
            $out.InsertRange(0, $head)
            $recordNote = "findings log rolled to $(Split-Path -Leaf $rolled), $($carry.Count) open finding(s) carried over"
        }
        if ($out.Count -gt 0) { [System.IO.File]::AppendAllText($FindingsPath, (($out -join "`n") + "`n"), $Utf8NoBom) }
    } catch {
        $recordError = 'could not write the findings log: ' + $_.Exception.Message
    }
}

function Get-Verdict {
    $w = 'GREEN'
    foreach ($o in $open.Values) { if ($o.sev -eq 'RED') { $w = 'RED' } elseif ($o.sev -eq 'AMBER' -and $w -eq 'GREEN') { $w = 'AMBER' } }
    $kinds = @($open.Values | Group-Object kind | Sort-Object Name | ForEach-Object { "$($_.Count) $($_.Name)" }) -join ', '
    $s = $w
    if ($kinds) { $s += ': ' + $kinds }
    if ($script:loadedText.Count) { $s += '; loaded ' + ($script:loadedText -join ', ') }
    if ($script:armedText) { $s += '; armed ' + $script:armedText }
    $s += '; sources ' + ($script:srcList -join ',')
    if ($notRun.Count) { $s += '; not run: ' + (($notRun | ForEach-Object { $_.Split('(')[0].Trim() }) -join ', ') }
    return [pscustomobject]@{ worst = $w; kinds = $kinds; summary = ($s -replace '[\r\n]+', ' ') }
}

# ---- status file = the heartbeat (only with -Write) ----------------------------
if ($Write -and -not $recordError) {
    try {
        $v = Get-Verdict
        $status = @("ts=$now", "boot=$($script:bootAt)", "sha=$($script:shaAt)", "worst=$($v.worst)", "open=$($open.Count)", "summary=$($v.summary)") -join "`n"
        $tmp = $StatusPath + '.tmp'
        [System.IO.File]::WriteAllText($tmp, $status + "`n", $Utf8NoBom)
        if (Test-Path -LiteralPath $StatusPath) { Remove-Item -LiteralPath $StatusPath -Force }
        Move-Item -LiteralPath $tmp -Destination $StatusPath
    } catch {
        $recordError = 'could not write the status file: ' + $_.Exception.Message
    }
}
if ($recordError) {
    # a watcher that cannot write its heartbeat has not checked in
    $f = [pscustomobject]@{ kind = 'CHECK-FAILED'; sev = 'RED'; id = 'check:record'; src = ''; detail = $recordError }
    $findings.Add($f); $open[$f.id] = $f
}
$v = Get-Verdict
# findings win over "could not check"; both are listed
$real   = @($open.Values | Where-Object { $_.kind -ne 'CHECK-FAILED' })
$failed = @($open.Values | Where-Object { $_.kind -eq 'CHECK-FAILED' })
$exitCode = 0
if ($real.Count -gt 0) { $exitCode = 1 } elseif ($failed.Count -gt 0) { $exitCode = 2 }

# ---- report --------------------------------------------------------------------
if (-not $Quiet) {
    Write-Host ("[loud-check] logs    : {0}" -f $LogsDir)
    Write-Host ("[loud-check] boot    : {0}   sha: {1}   sources: {2}" -f $script:bootAt, $script:shaAt, ($script:srcList -join ', '))
    if ($script:loadedText.Count) { Write-Host ("[loud-check] LOADED  : {0}  ({1})" -f ($script:loadedText -join ', '), $script:expectedFrom) }
    if ($script:armedText)        { Write-Host ("[loud-check] ARMED   : {0}" -f $script:armedText) }
    Write-Host ("[loud-check] FAILURES: {0} KubeJS ERROR line(s), {1} handler abort(s), {2} failure-pattern line(s) in latest.log / debug.log" -f $script:kjsErrors, $script:kjsAborts, $script:patternHits)
    if ($script:baselineText)     { Write-Host ("[loud-check] BASELINE: {0}" -f $script:baselineText) }
    foreach ($n in $info)   { Write-Host ("[loud-check] note    : {0}" -f $n) -ForegroundColor DarkGray }
    foreach ($n in $notRun) { Write-Host ("[loud-check] NOT RUN : {0}" -f $n) -ForegroundColor Yellow }
    $shown = 0
    $sorted = @($open.Values | Sort-Object @{ Expression = { if ($_.kind -eq 'CHECK-FAILED') { 0 } elseif ($_.sev -eq 'RED') { 1 } else { 2 } } }, kind, id)
    foreach ($f in $sorted) {
        if ($shown -ge $MaxShow) { Write-Host ("  ... and {0} more (raise -MaxShow)" -f ($sorted.Count - $shown)) -ForegroundColor DarkYellow; break }
        $shown++
        $color = 'Red'
        if ($f.sev -eq 'AMBER') { $color = 'Yellow' }
        $d = [string]$f.detail
        if ($d.Length -gt 230) { $d = $d.Substring(0, 230) + '...' }
        $where = ''
        if ($f.src) { $where = "[$($f.src)] " }
        if (-not $findingIds.Contains([string]$f.id) -and $f.id -ne 'check:record') { $where = '(from an earlier pass, not re-checked) ' + $where }
        Write-Host ("  {0,-5} {1,-12} {2}" -f $f.sev, $f.kind, $f.id) -ForegroundColor $color
        Write-Host ("        {0}{1}" -f $where, $d) -ForegroundColor DarkGray
    }
    if ($recordNote) { Write-Host ("[loud-check] {0}" -f $recordNote) -ForegroundColor DarkGray }
}
$verdictColor = 'Green'
if ($v.worst -eq 'AMBER') { $verdictColor = 'Yellow' }
if ($v.worst -eq 'RED')   { $verdictColor = 'Red' }
$tail = 'nothing found'
if ($open.Count -gt 0) { $tail = $v.kinds }
if ($failed.Count -gt 0 -and $real.Count -eq 0) { $tail = 'COULD NOT CHECK: ' + $v.kinds }
if ($notRun.Count -gt 0) { $tail += " ($($notRun.Count) check not run, see above)" }
Write-Host ("[loud-check] {0} - {1}  (exit {2})" -f $v.worst, $tail, $exitCode) -ForegroundColor $verdictColor
exit $exitCode
