# =============================================================================
# kubejs-log-digest.ps1 - summarize script problems from a server's KubeJS logs
#
# Reads <server root>\logs\kubejs\{startup,server}.log and prints every
# ERROR/WARN line normalized (timestamps and volatile numbers stripped) with a
# count, grouped by script file. Save one run before a deploy and one after to
# see exactly which problems are NEW:
#
#   powershell -File kubejs-log-digest.ps1 -Out before.txt
#   ... deploy + restart ...
#   powershell -File kubejs-log-digest.ps1 -Out after.txt -Baseline before.txt
#
# Read-only. Default root = the live box over Z:.
# =============================================================================
[CmdletBinding()]
param(
    [string]$ServerRoot = 'Z:\Users\silvariazemaitis\Desktop\IridescentCraft Dedicated Server',
    [string]$Out,
    [string]$Baseline
)
$ErrorActionPreference = 'Stop'

function Read-Shared([string]$path) {
    $fs = [IO.File]::Open($path, 'Open', 'Read', 'ReadWrite')
    try { (New-Object IO.StreamReader($fs)).ReadToEnd() } finally { $fs.Close() }
}

$digest = New-Object 'System.Collections.Generic.Dictionary[string,int]'
$loaded = 0
foreach ($name in 'startup.log', 'server.log') {
    $p = Join-Path $ServerRoot "logs\kubejs\$name"
    if (-not (Test-Path -LiteralPath $p)) { continue }
    foreach ($line in ((Read-Shared $p) -split "`r?`n")) {
        if ($line -match 'Loaded script ') { $loaded++ }
        if ($line -notmatch '\[(ERROR|WARN)\]|\bError\b|Exception|TypeError|ReferenceError|is not defined|Cannot find function|redeclaration') { continue }
        $norm = $line -replace '^\[\d\d:\d\d:\d\d\]\s*', ''
        $norm = $norm -replace '\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b', '<uuid>'
        $norm = $norm -replace '-?\d+\.\d+', '<n>'
        $norm = $norm -replace '(?<![#\w.])-?\d{3,}\b', '<n>'
        if ($norm.Length -gt 260) { $norm = $norm.Substring(0, 260) + ' ...' }
        $key = "[$($name -replace '\.log$','')] $norm"
        if ($digest.ContainsKey($key)) { $digest[$key]++ } else { $digest[$key] = 1 }
    }
}

$rows = $digest.GetEnumerator() | Sort-Object Key | ForEach-Object { '{0,5}x  {1}' -f $_.Value, $_.Key }
Write-Host "[kubejs-digest] $ServerRoot : $loaded 'Loaded script' lines, $($digest.Count) distinct problem line(s)"
if ($Out) { [IO.File]::WriteAllLines($Out, [string[]]@($rows)) ; Write-Host "[kubejs-digest] wrote $Out" }

if ($Baseline) {
    $old = New-Object 'System.Collections.Generic.HashSet[string]'
    foreach ($l in [IO.File]::ReadAllLines($Baseline)) { [void]$old.Add(($l -replace '^\s*\d+x\s+', '')) }
    $new = $digest.Keys | Where-Object { -not $old.Contains($_) } | Sort-Object
    $nowSet = New-Object 'System.Collections.Generic.HashSet[string]'
    foreach ($k in $digest.Keys) { [void]$nowSet.Add($k) }
    $gone = $old | Where-Object { -not $nowSet.Contains($_) } | Sort-Object
    Write-Host "[kubejs-digest] NEW since baseline: $(@($new).Count)   GONE since baseline: $(@($gone).Count)"
    foreach ($k in $new) { Write-Host ("  NEW  {0,4}x  {1}" -f $digest[$k], $k) }
    foreach ($k in $gone) { Write-Host "  gone        $k" }
} else {
    $rows | ForEach-Object { Write-Host $_ }
}
