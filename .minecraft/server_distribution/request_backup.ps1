#Requires -Version 5.1
<#
.SYNOPSIS
    Ask icraft-gui for a pinned world backup (backups\manual-YYYYmmdd-HHMM.zip).

.DESCRIPTION
    Scheduled backups need none of this: icraft-gui zips the world to
    backups\world-YYYYmmdd-HHMM.zip in a Cycle's stopped window whenever the
    newest one is 12 h old, and keeps the newest 2 (see logs\backup.log).

    This script is for the extra backup taken on purpose, e.g. before a risky
    change. It drops a timestamped request file (.icraft_backup_request) next
    to server.properties; icraft-gui picks it up within ~10 s:

      - server STOPPED : the backup is taken at once. The script waits for it
                         and reports the verified zip.
      - server RUNNING : a consistent copy needs the world files closed, so the
                         request is QUEUED for the next Cycle's stopped window
                         (the launcher restarts the server on its own every
                         4 h when empty, 12 h with players on). To take it
                         now, follow up with request_cycle.ps1 -- but not while
                         players are online.

    The result is a PINNED backup: retention never deletes a manual-*.zip. It
    is listed in backups\backups.json like the scheduled ones (so the off-box
    pull job copies it too) and it stays until someone deletes it. Each one is
    the size of the world, so remove it once it has served its purpose.

    On the box or over remoting:

      Invoke-Command -ComputerName Sereneblossomns -ScriptBlock {
          & 'C:\Users\silvariazemaitis\Desktop\IridescentCraft Dedicated Server\request_backup.ps1' -Reason pre-update
      }

    Exit codes:
      0 = done -- the zip was written, verified and listed
      3 = queued -- the server is running; taken in the next Cycle's stopped window
      2 = skipped, rejected or FAILED (the reason is in the log)
      1 = icraft-gui never answered (not running, or hung) -- the request is
          withdrawn so a later start can't act on it

    Deployed via the normal server_distribution sync; lives beside
    server.properties in the live runtime root.

.PARAMETER Reason
    One word recorded with the request (logs\backup.log, backups.json).

.PARAMETER AnswerWaitSec
    How long to wait for icraft-gui to pick the request up.

.PARAMETER BackupWaitSec
    How long to wait for a backup that started to finish.

.NOTES
    Windows PowerShell 5.1 compatible (no ternary / null-coalescing).
#>
[CmdletBinding()]
param(
    [string]$Reason = 'manual',
    [int]$AnswerWaitSec = 60,
    [int]$BackupWaitSec = 1500
)

$ErrorActionPreference = 'Continue'

$ServerRoot = $PSScriptRoot       # runtime root (server.properties, world/, logs/)
$LogDir     = Join-Path $ServerRoot 'logs'
$LogFile    = Join-Path $LogDir 'backup_requests.log'
$ReqFile    = Join-Path $ServerRoot '.icraft_backup_request'
$ResFile    = Join-Path $ServerRoot '.icraft_backup_request.result'
if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Path $LogDir -Force | Out-Null }

# The request line is "<unix-secs> <reason>": keep the reason to one token.
$Reason = ($Reason.Trim() -replace '\s+', '-')
if (-not $Reason) { $Reason = 'manual' }

function Write-BackupLog {
    param([string]$Message, [string]$Level = 'INFO')
    $stamp = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss')
    $line  = "[$stamp] [$Level] $Message"
    try { Add-Content -Path $LogFile -Value $line -Encoding UTF8 } catch { }
    Write-Host $line
}

function Exit-Run([bool]$Success, [int]$Code) {
    Write-BackupLog "================ backup request end (success=$Success) ================"
    exit $Code
}

# Answer format: "<unix-secs> <text>". Returns the text, or $null when there
# is no answer yet.
function Read-Answer {
    if (-not (Test-Path $ResFile)) { return $null }
    $raw = Get-Content -Path $ResFile -Raw -ErrorAction SilentlyContinue
    if (-not $raw) { return $null }
    return ($raw.Trim() -replace '^\d+\s+', '')
}

# =========================== main ===========================
Write-BackupLog '================ backup request start ================'
Write-BackupLog "ServerRoot=$ServerRoot  Reason=$Reason  RequestedBy=$env:USERDOMAIN\$env:USERNAME"

if (-not (Get-Process -Name 'icraft-gui' -ErrorAction SilentlyContinue)) {
    Write-BackupLog 'icraft-gui.exe is not running -- nothing is watching for the request. (With the launcher closed, a request file would only be taken by its next serve.)' 'ERROR'
    Exit-Run $false 1
}

if (Test-Path $ResFile) { Remove-Item -Path $ResFile -Force -ErrorAction SilentlyContinue }
$epoch = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
try {
    [System.IO.File]::WriteAllText($ReqFile, "$epoch $Reason`n")
} catch {
    Write-BackupLog "Could not write the backup request ($ReqFile): $($_.Exception.Message)" 'ERROR'
    Exit-Run $false 1
}
Write-BackupLog "Wrote backup request ($epoch); waiting up to ${AnswerWaitSec}s for icraft-gui to answer."

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
    Write-BackupLog "icraft-gui did not answer within ${AnswerWaitSec}s (hung, or an older launcher without world backups). Request withdrawn." 'ERROR'
    Exit-Run $false 1
}

if ($answer -like 'queued*') {
    Write-BackupLog "icraft-gui queued it: $answer"
    Write-BackupLog 'The request file stays in place until the next Cycle takes it. To take it now: request_cycle.ps1 (not while players are online).'
    Exit-Run $true 3
}

if ($answer -like 'started*') {
    Write-BackupLog "icraft-gui started the backup; waiting up to ${BackupWaitSec}s for it to finish."
    $deadline = (Get-Date).AddSeconds($BackupWaitSec)
    while ((Get-Date) -lt $deadline) {
        Start-Sleep -Seconds 3
        $now = Read-Answer
        if ($now -and ($now -notlike 'started*')) { $answer = $now; break }
    }
    if ($answer -like 'started*') {
        Write-BackupLog "The backup had not finished after ${BackupWaitSec}s. It may still be running: read logs\backup.log." 'WARN'
        Exit-Run $false 2
    }
}

if ($answer -like 'done*') {
    Write-BackupLog "icraft-gui: $answer"
    Exit-Run $true 0
}
Write-BackupLog "icraft-gui: $answer" 'WARN'
Exit-Run $false 2
