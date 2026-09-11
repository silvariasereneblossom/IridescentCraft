#Requires -Version 5.1
<#
.SYNOPSIS
    IridescentCraft dedicated-server nightly restart: asks icraft-gui to Cycle.

.DESCRIPTION
    Restarts the Minecraft server once a night to reset accumulated heap (the
    recurring slow-leak -> GC death-spiral -> OOM failure mode).

    The server runs under icraft-gui now. The NSSM service `IridescentMC` this
    script used to bounce no longer exists (every run after the GUI took over
    failed with "Cannot find any service"), and only the GUI holds the server's
    console. So this script does not stop anything itself: it drops a
    timestamped request file (.icraft_cycle_request) next to server.properties.
    icraft-gui picks it up within ~10 s and runs a Cycle like the button:
      1. in-game warnings at 60 s and 10 s,
      2. a graceful `stop` with a 120 s save grace (then escalates),
      3. launcher self-update + repo sync + start (the heartbeat supervisor).
    The GUI answers in .icraft_cycle_request.result, which this script logs.

    NOTE: unlike the old NSSM bounce, a Cycle also syncs repo HEAD and applies a
    staged launcher update -- the nightly restart now deploys whatever is pushed.

    The GUI skips (and says why) when the server was stopped on purpose, is not
    fully up, or is already restarting; it ignores requests older than 10 min.

    Exit codes (Task Scheduler "Last Run Result"):
      0 = accepted -- the Cycle is running
      2 = skipped by the GUI (the reason is in the log)
      1 = the GUI never answered (not running, or a launcher without the
          request watcher) -- the request is withdrawn so a later start can't
          act on it

    Registered as a Scheduled Task by register_nightly_restart.ps1 (run once,
    elevated, on the server box). Deployed via the normal server_distribution
    sync; lives beside server.properties in the live runtime root.

.NOTES
    Windows PowerShell 5.1 compatible (no ternary / null-coalescing).
#>

# ============================ CONFIG (edit here) ============================
# Restart time, server-local. This is the SINGLE SOURCE OF TRUTH for the hour:
# register_nightly_restart.ps1 parses this line to build the Scheduled Task
# trigger, so changing it here + re-running the register script is all it takes.
$RestartTime   = '05:00'          # 24h HH:mm, server-local

$AnswerWaitSec = 60               # how long to wait for icraft-gui to answer
# ===========================================================================

$ErrorActionPreference = 'Continue'

$ServerRoot = $PSScriptRoot       # runtime root (server.properties, world/, logs/)
$LogDir     = Join-Path $ServerRoot 'logs'
$LogFile    = Join-Path $LogDir 'nightly_restart.log'
$ReqFile    = Join-Path $ServerRoot '.icraft_cycle_request'
$ResFile    = Join-Path $ServerRoot '.icraft_cycle_request.result'
if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Path $LogDir -Force | Out-Null }

function Write-RestartLog {
    param([string]$Message, [string]$Level = 'INFO')
    $stamp = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss')
    $line  = "[$stamp] [$Level] $Message"
    try { Add-Content -Path $LogFile -Value $line -Encoding UTF8 } catch { }
    Write-Host $line
}

function Exit-Run([bool]$Success, [int]$Code) {
    Write-RestartLog "================ nightly restart run end (success=$Success) ================"
    exit $Code
}

# =========================== main ===========================
Write-RestartLog '================ nightly restart run start ================'
Write-RestartLog "ServerRoot=$ServerRoot  ScheduledFor=$RestartTime  Mode=icraft-gui Cycle request"

if (-not (Get-Process -Name 'icraft-gui' -ErrorAction SilentlyContinue)) {
    Write-RestartLog 'icraft-gui.exe is not running -- nothing holds the server console, so nothing can Cycle it.' 'ERROR'
    Exit-Run $false 1
}

if (Test-Path $ResFile) { Remove-Item -Path $ResFile -Force -ErrorAction SilentlyContinue }
$epoch = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
try {
    [System.IO.File]::WriteAllText($ReqFile, "$epoch nightly-restart`n")
} catch {
    Write-RestartLog "Could not write the Cycle request ($ReqFile): $($_.Exception.Message)" 'ERROR'
    Exit-Run $false 1
}
Write-RestartLog "Wrote Cycle request ($epoch); waiting up to ${AnswerWaitSec}s for icraft-gui to answer."

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
    Write-RestartLog "icraft-gui did not answer within ${AnswerWaitSec}s (a launcher without the request watcher, or hung). Request withdrawn." 'ERROR'
    Exit-Run $false 1
}

# Answer format: "<unix-secs> accepted" | "<unix-secs> skipped: <why>"
$text = ($answer.Trim() -replace '^\d+\s+', '')
if ($text -like 'accepted*') {
    Write-RestartLog 'icraft-gui accepted: warning players, then stop (120s save grace) + Cycle (self-update + sync + start).'
    Exit-Run $true 0
}
Write-RestartLog "icraft-gui declined the Cycle: $text" 'WARN'
Exit-Run $false 2
