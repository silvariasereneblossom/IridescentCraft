#Requires -Version 5.1
<#
.SYNOPSIS
    Ask icraft-gui for a protection report / chunk-regeneration DRY-RUN.

.DESCRIPTION
    READ-ONLY. Nothing is deleted and nothing inside the world folder is
    written, so this is safe to run while the server is up and players are
    online. (Executing a regeneration is a later phase and is not built.)

    icraft-gui works out which chunks a regeneration would KEEP -- beds (the
    bed chunk and its 8 neighbours), Open Parties and Claims claims, the area
    around world spawn, waystones, lived-in chunks (InhabitedTime), and the
    manual lists in .icraft_regen_policy -- and which chunks the chosen scope
    would reset. It writes:

        regen-reports\<YYYYmmdd-HHMMSS>-<scope>\
            report.txt     the whole story (per dimension, per player, warnings)
            chunks.csv     one row per chunk on disk: keep / regenerate / untouched
            warnings.csv   every warning
            plan.json      the chunks to regenerate, with the hash an execution
                           will have to match
            map-<dim>.png  overview map

    This script drops a request file (.icraft_regen_request) next to
    server.properties; icraft-gui picks it up within ~10 s and answers in
    .icraft_regen_request.result. The run is also logged to
    logs\regen_dryrun.log.

    On the box or over remoting:

      Invoke-Command -ComputerName Sereneblossomns -ScriptBlock {
          & 'C:\Users\silvariazemaitis\Desktop\IridescentCraft Dedicated Server\request_regen_report.ps1' -Scope ring:8
      }

    Exit codes:
      0 = done -- the report folder is named in the answer
      2 = rejected or FAILED (the reason is in the answer and in the log)
      1 = icraft-gui never answered (not running, hung, or an older launcher),
          or the report did not finish in time

.PARAMETER Scope
    What a regeneration would select (protected chunks are always kept):
      report            nothing: the protection map on its own (default)
      ring:N            every chunk within N chunks of a bed chunk
      all               every chunk of the selected dimensions
      box:x1,z1,x2,z2   a box of chunks (chunk coordinates)

.PARAMETER Dims
    Dimensions to analyse: comma-separated ids, or 'all'.
    Default: minecraft:overworld.

.PARAMETER Set
    Protection settings for this run only, as key=value (the keys of the
    .icraft_regen_policy file), e.g.
      -Set inhabited_min_ticks=72000, waystones=activated

.PARAMETER Reason
    One word recorded with the request.

.PARAMETER AnswerWaitSec
    How long to wait for icraft-gui to pick the request up.

.PARAMETER RunWaitSec
    How long to wait for a report that started to finish.

.NOTES
    Windows PowerShell 5.1 compatible (no ternary / null-coalescing).
#>
[CmdletBinding()]
param(
    [string]$Scope = 'report',
    [string]$Dims = 'minecraft:overworld',
    [string[]]$Set = @(),
    [string]$Reason = 'manual',
    [int]$AnswerWaitSec = 60,
    [int]$RunWaitSec = 900
)

$ErrorActionPreference = 'Continue'

$ServerRoot = $PSScriptRoot       # runtime root (server.properties, world/, logs/)
$ReqFile    = Join-Path $ServerRoot '.icraft_regen_request'
$ResFile    = Join-Path $ServerRoot '.icraft_regen_request.result'

# The request line is "<unix-secs> <reason> key=value ...": one token each.
$Reason = ($Reason.Trim() -replace '[\s=]+', '-')
if (-not $Reason) { $Reason = 'manual' }
$tokens = @("scope=$(($Scope -replace '\s', ''))", "dims=$(($Dims -replace '\s', ''))")
foreach ($kv in $Set) {
    $kv = ($kv -replace '\s', '')
    if ($kv -notmatch '^[A-Za-z_]+=.+$') {
        Write-Host "[regen] -Set takes key=value, not '$kv'"
        exit 2
    }
    $tokens += $kv
}
$options = $tokens -join ' '

# Answer format: "<unix-secs> <text>". Returns the text, or $null when there
# is no answer yet.
function Read-Answer {
    if (-not (Test-Path $ResFile)) { return $null }
    $raw = Get-Content -Path $ResFile -Raw -ErrorAction SilentlyContinue
    if (-not $raw) { return $null }
    return ($raw.Trim() -replace '^\d+\s+', '')
}

if (-not (Get-Process -Name 'icraft-gui' -ErrorAction SilentlyContinue)) {
    Write-Host '[regen] icraft-gui.exe is not running -- nothing is watching for the request.'
    exit 1
}

if (Test-Path $ResFile) { Remove-Item -Path $ResFile -Force -ErrorAction SilentlyContinue }
$epoch = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
try {
    [System.IO.File]::WriteAllText($ReqFile, "$epoch $Reason $options`n")
} catch {
    Write-Host "[regen] could not write the request ($ReqFile): $($_.Exception.Message)"
    exit 1
}
Write-Host "[regen] requested: $options  (read-only; waiting up to ${AnswerWaitSec}s for icraft-gui)"

$answer   = $null
$deadline = (Get-Date).AddSeconds($AnswerWaitSec)
while ((Get-Date) -lt $deadline) {
    $answer = Read-Answer
    if ($answer) { break }
    Start-Sleep -Seconds 2
}
if (-not $answer) {
    # Withdraw the request so a GUI started later can't act on a leftover file.
    if (Test-Path $ReqFile) { Remove-Item -Path $ReqFile -Force -ErrorAction SilentlyContinue }
    Write-Host "[regen] icraft-gui did not answer within ${AnswerWaitSec}s (hung, or an older launcher without the dry-run). Request withdrawn."
    exit 1
}

if ($answer -like 'started*') {
    $deadline = (Get-Date).AddSeconds($RunWaitSec)
    while ((Get-Date) -lt $deadline) {
        Start-Sleep -Seconds 2
        $now = Read-Answer
        if ($now -and ($now -notlike 'started*')) { $answer = $now; break }
    }
    if ($answer -like 'started*') {
        Write-Host "[regen] the report had not finished after ${RunWaitSec}s. It may still be running: read logs\regen_dryrun.log."
        exit 1
    }
}

Write-Host "[regen] $answer"
if ($answer -like 'done*') { exit 0 }
exit 2
