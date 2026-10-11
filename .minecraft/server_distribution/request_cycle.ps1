#Requires -Version 5.1
<#
.SYNOPSIS
    Ask icraft-gui to Cycle the IridescentCraft dedicated server (restart + deploy HEAD).

.DESCRIPTION
    The server runs under icraft-gui, and only the GUI holds the server's
    console. So this script does not stop anything itself: it drops a
    timestamped request file (.icraft_cycle_request) next to server.properties.
    icraft-gui picks it up within ~10 s and runs a Cycle like the button:
      1. in-game warnings at 60 s and 10 s,
      2. a graceful `stop` with a 120 s save grace (then escalates),
      3. launcher self-update + repo sync + start (the heartbeat supervisor).
    The GUI answers in .icraft_cycle_request.result, which this script logs.

    A Cycle syncs repo HEAD and applies a staged launcher update, so this is
    also how a push is deployed on demand.

    Routine restarts need none of this: icraft-gui restarts the server on its
    own uptime (4 h when empty, 12 h with players online -- see
    logs\restart_policy.log). This script replaced nightly_restart.ps1 and its
    05:00 scheduled task when that policy shipped; it is for the on-demand
    case, on the box or over remoting:

      Invoke-Command -ComputerName Sereneblossomns -ScriptBlock {
          & 'C:\Users\silvariazemaitis\Desktop\IridescentCraft Dedicated Server\request_cycle.ps1' -Reason deploy
      }

    The GUI skips (and says why) when the server was stopped on purpose, is not
    fully up, or is already restarting; it ignores requests older than 10 min.

    Exit codes:
      0 = accepted -- the Cycle is running
      2 = skipped by the GUI (the reason is in the log)
      1 = the GUI never answered (not running, or hung) -- the request is
          withdrawn so a later start can't act on it

    Deployed via the normal server_distribution sync; lives beside
    server.properties in the live runtime root.

.PARAMETER Reason
    One word recorded with the request (GUI log + logs\cycle_requests.log).

.PARAMETER AnswerWaitSec
    How long to wait for icraft-gui to answer.

.NOTES
    Windows PowerShell 5.1 compatible (no ternary / null-coalescing).
#>
[CmdletBinding()]
param(
    [string]$Reason = 'manual',
    [int]$AnswerWaitSec = 60
)

$ErrorActionPreference = 'Continue'

$ServerRoot = $PSScriptRoot       # runtime root (server.properties, world/, logs/)
$LogDir     = Join-Path $ServerRoot 'logs'
$LogFile    = Join-Path $LogDir 'cycle_requests.log'
$ReqFile    = Join-Path $ServerRoot '.icraft_cycle_request'
$ResFile    = Join-Path $ServerRoot '.icraft_cycle_request.result'
if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Path $LogDir -Force | Out-Null }

# The request line is "<unix-secs> <reason>": keep the reason to one token.
$Reason = ($Reason.Trim() -replace '\s+', '-')
if (-not $Reason) { $Reason = 'manual' }

function Write-CycleLog {
    param([string]$Message, [string]$Level = 'INFO')
    $stamp = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss')
    $line  = "[$stamp] [$Level] $Message"
    try { Add-Content -Path $LogFile -Value $line -Encoding UTF8 } catch { }
    Write-Host $line
}

function Exit-Run([bool]$Success, [int]$Code) {
    Write-CycleLog "================ cycle request end (success=$Success) ================"
    exit $Code
}

# =========================== main ===========================
Write-CycleLog '================ cycle request start ================'
Write-CycleLog "ServerRoot=$ServerRoot  Reason=$Reason  RequestedBy=$env:USERDOMAIN\$env:USERNAME"

if (-not (Get-Process -Name 'icraft-gui' -ErrorAction SilentlyContinue)) {
    Write-CycleLog 'icraft-gui.exe is not running -- nothing holds the server console, so nothing can Cycle it.' 'ERROR'
    Exit-Run $false 1
}

if (Test-Path $ResFile) { Remove-Item -Path $ResFile -Force -ErrorAction SilentlyContinue }
$epoch = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
try {
    [System.IO.File]::WriteAllText($ReqFile, "$epoch $Reason`n")
} catch {
    Write-CycleLog "Could not write the Cycle request ($ReqFile): $($_.Exception.Message)" 'ERROR'
    Exit-Run $false 1
}
Write-CycleLog "Wrote Cycle request ($epoch); waiting up to ${AnswerWaitSec}s for icraft-gui to answer."

$answer   = $null
$deadline = (Get-Date).AddSeconds($AnswerWaitSec)
while ((Get-Date) -lt $deadline) {
    if (Test-Path $ResFile) {
        $answer = Get-Content -Path $ResFile -Raw -ErrorAction SilentlyContinue
        if ($answer) { break }
    }
    Start-Sleep -Seconds 2
}

if (-not $answer) {
    # Withdraw the request so a GUI started later can't act on a leftover file.
    if (Test-Path $ReqFile) { Remove-Item -Path $ReqFile -Force -ErrorAction SilentlyContinue }
    Write-CycleLog "icraft-gui did not answer within ${AnswerWaitSec}s (hung, or its request watcher is not running). Request withdrawn." 'ERROR'
    Exit-Run $false 1
}

# Answer format: "<unix-secs> accepted" | "<unix-secs> skipped: <why>"
$text = ($answer.Trim() -replace '^\d+\s+', '')
if ($text -like 'accepted*') {
    Write-CycleLog 'icraft-gui accepted: warning players, then stop (120s save grace) + Cycle (self-update + sync + start).'
    Exit-Run $true 0
}
Write-CycleLog "icraft-gui declined the Cycle: $text" 'WARN'
Exit-Run $false 2
