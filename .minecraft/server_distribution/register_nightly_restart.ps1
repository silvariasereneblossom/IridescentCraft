#Requires -Version 5.1
<#
.SYNOPSIS
    One-time installer for the IridescentCraft nightly restart.

.DESCRIPTION
    Registers a Windows Scheduled Task that runs nightly_restart.ps1 (its
    sibling) every day at the configured time, as SYSTEM, whether or not a user
    is logged on. nightly_restart.ps1 asks icraft-gui to run a Cycle (see that
    script); the GUI does the warning, the graceful stop and the restart, so
    there is no service configuration to touch here any more (the NSSM
    `IridescentMC` service this used to configure is gone).

    RUN THIS ONCE, ON THE SERVER BOX, FROM AN ELEVATED PowerShell. It is not run
    by the sync and is safe to re-run (idempotent -- it re-registers the task).
    An already-registered task keeps working after a sync: it points at the same
    nightly_restart.ps1 path.

.PARAMETER Time
    Override the schedule time (HH:mm, 24h, server-local). Default: parsed from
    nightly_restart.ps1's $RestartTime so there is one source of truth.

.PARAMETER Unregister
    Remove the scheduled task and exit.

.EXAMPLE
    powershell -NoProfile -ExecutionPolicy Bypass -File .\register_nightly_restart.ps1
.EXAMPLE
    .\register_nightly_restart.ps1 -Time 04:30
.EXAMPLE
    .\register_nightly_restart.ps1 -Unregister
#>
[CmdletBinding()]
param(
    [string]$Time,
    [string]$TaskName = 'IridescentCraft Nightly Restart',
    [switch]$Unregister
)

$ErrorActionPreference = 'Stop'
$scriptDir  = $PSScriptRoot
$restartPs1 = Join-Path $scriptDir 'nightly_restart.ps1'

function Fail($msg) { Write-Host "[ERROR] $msg" -ForegroundColor Red; exit 1 }

# --- Must be elevated (a Scheduled Task running as SYSTEM needs admin) ---
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
             [Security.Principal.WindowsBuiltinRole]::Administrator)
if (-not $isAdmin) {
    Fail "Run this from an ELEVATED PowerShell (right-click -> Run as administrator), then re-run:`n       powershell -NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`""
}

# --- Unregister mode ---
if ($Unregister) {
    $existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    if ($existing) {
        Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
        Write-Host "[OK] Removed scheduled task '$TaskName'." -ForegroundColor Green
    } else {
        Write-Host "[INFO] No scheduled task named '$TaskName' found."
    }
    exit 0
}

if (-not (Test-Path $restartPs1)) {
    Fail "nightly_restart.ps1 not found next to this script ($restartPs1). Place both in the server runtime root and re-run."
}

# --- Single source of truth: read the time out of nightly_restart.ps1 ---
if (-not $Time) {
    $rcontent = Get-Content $restartPs1 -Raw
    if ($rcontent -match '\$RestartTime\s*=\s*''(\d{1,2}:\d{2})''') { $Time = $Matches[1] }
    else { $Time = '05:00'; Write-Host "[WARN] Could not parse `$RestartTime; defaulting to $Time." -ForegroundColor Yellow }
}
try { $at = [DateTime]::ParseExact($Time, 'HH:mm', [System.Globalization.CultureInfo]::InvariantCulture) }
catch { Fail "-Time '$Time' is not valid HH:mm (24h). Example: 05:00" }

Write-Host "=== IridescentCraft nightly restart installer ===" -ForegroundColor Cyan
Write-Host "  Task name : $TaskName"
Write-Host "  Runs      : daily at $Time (server-local), as SYSTEM"
Write-Host "  Action    : $restartPs1  (asks icraft-gui to Cycle)"
Write-Host ""

# --- Register the Scheduled Task (idempotent) ---
$psArgs  = '-NoProfile -ExecutionPolicy Bypass -File "{0}"' -f $restartPs1
$action  = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $psArgs -WorkingDirectory $scriptDir
$trigger = New-ScheduledTaskTrigger -Daily -At $at
$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
$settings  = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew `
               -ExecutionTimeLimit (New-TimeSpan -Minutes 15) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries

if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    Write-Host "[INFO] Replaced existing task '$TaskName'."
}
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Principal $principal `
    -Settings $settings -Description 'Nightly restart of the IridescentCraft dedicated server (heap reset) -- asks icraft-gui to Cycle. See nightly_restart.ps1.' | Out-Null
Write-Host "[OK] Scheduled task registered." -ForegroundColor Green

$info = Get-ScheduledTaskInfo -TaskName $TaskName -ErrorAction SilentlyContinue
if ($info) { Write-Host ("       Next run time: {0}" -f $info.NextRunTime) }

Write-Host ""
Write-Host "=== Verify / operate ===" -ForegroundColor Cyan
Write-Host "  Show it:        schtasks /Query /TN `"$TaskName`" /V /FO LIST"
Write-Host "  Next run:       Get-ScheduledTaskInfo -TaskName `"$TaskName`""
Write-Host "  Test it NOW:    Start-ScheduledTask -TaskName `"$TaskName`"    (restarts the server after a 60s in-game countdown)"
Write-Host "  Watch it work:  Get-Content `"$(Join-Path $scriptDir 'logs\nightly_restart.log')`" -Tail 40 -Wait"
Write-Host "  Change time:    edit `$RestartTime in nightly_restart.ps1, then re-run this installer"
Write-Host "  Remove it:      .\register_nightly_restart.ps1 -Unregister"
Write-Host ""
Write-Host "[DONE] Nightly restart installed for $Time server-local." -ForegroundColor Green
