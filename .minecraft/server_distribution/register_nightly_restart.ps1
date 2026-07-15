#Requires -Version 5.1
<#
.SYNOPSIS
    One-time installer for the IridescentCraft nightly graceful restart.

.DESCRIPTION
    Registers a Windows Scheduled Task that runs nightly_restart.ps1 (its
    sibling) every day at the configured time, as SYSTEM, whether or not a user
    is logged on. Also bumps the NSSM service's graceful console-stop timeout so
    a `nssm restart` gives the modded server time to run its shutdown hook and
    save the world instead of being hard-killed.

    RUN THIS ONCE, ON THE SERVER BOX, FROM AN ELEVATED PowerShell. It is not run
    by the sync and is safe to re-run (idempotent -- it re-registers the task).

.PARAMETER Time
    Override the schedule time (HH:mm, 24h, server-local). Default: parsed from
    nightly_restart.ps1's $RestartTime so there is one source of truth.

.PARAMETER ServiceName
    NSSM service name. Default: parsed from nightly_restart.ps1 ($ServiceName),
    else 'IridescentMC'.

.PARAMETER StopTimeoutMs
    Graceful console-stop wait (ms) written to NSSM AppStopMethodConsole.
    Default 120000 (2 min) -- generous headroom for a ~450-mod world save.

.PARAMETER SkipNssmStopConfig
    Register the task only; do not touch the NSSM service configuration.

.PARAMETER Unregister
    Remove the scheduled task and exit (does not touch NSSM).

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
    [string]$ServiceName,
    [int]$StopTimeoutMs = 120000,
    [string]$TaskName = 'IridescentCraft Nightly Restart',
    [switch]$SkipNssmStopConfig,
    [switch]$Unregister
)

$ErrorActionPreference = 'Stop'
$scriptDir  = $PSScriptRoot
$restartPs1 = Join-Path $scriptDir 'nightly_restart.ps1'

function Fail($msg) { Write-Host "[ERROR] $msg" -ForegroundColor Red; exit 1 }

# --- Must be elevated (Scheduled Task as SYSTEM + NSSM config need admin) ---
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

# --- Single source of truth: read time + service name out of nightly_restart.ps1 ---
$rcontent = Get-Content $restartPs1 -Raw
if (-not $Time) {
    if ($rcontent -match '\$RestartTime\s*=\s*''(\d{1,2}:\d{2})''') { $Time = $Matches[1] }
    else { $Time = '05:00'; Write-Host "[WARN] Could not parse `$RestartTime; defaulting to $Time." -ForegroundColor Yellow }
}
if (-not $ServiceName) {
    if ($rcontent -match '\$ServiceName\s*=\s*''([^'']+)''') { $ServiceName = $Matches[1] }
    else { $ServiceName = 'IridescentMC' }
}
try { $at = [DateTime]::ParseExact($Time, 'HH:mm', [System.Globalization.CultureInfo]::InvariantCulture) }
catch { Fail "-Time '$Time' is not valid HH:mm (24h). Example: 05:00" }

Write-Host "=== IridescentCraft nightly restart installer ===" -ForegroundColor Cyan
Write-Host "  Task name : $TaskName"
Write-Host "  Runs      : daily at $Time (server-local), as SYSTEM"
Write-Host "  Action    : $restartPs1"
Write-Host "  Service   : $ServiceName"
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
    -Settings $settings -Description 'Nightly graceful restart of the IridescentCraft dedicated server (heap reset). See nightly_restart.ps1.' | Out-Null
Write-Host "[OK] Scheduled task registered." -ForegroundColor Green

$info = Get-ScheduledTaskInfo -TaskName $TaskName -ErrorAction SilentlyContinue
if ($info) { Write-Host ("       Next run time: {0}" -f $info.NextRunTime) }

# --- NSSM graceful-stop config (so `nssm restart` doesn't hard-kill mid-save) ---
if (-not $SkipNssmStopConfig) {
    $nssm = $null
    $gc = Get-Command nssm.exe -ErrorAction SilentlyContinue
    if ($gc) { $nssm = $gc.Source }
    if (-not $nssm) {
        foreach ($p in @("$env:ProgramFiles\nssm\win64\nssm.exe","$env:ProgramFiles\nssm\nssm.exe",
                         "${env:ProgramFiles(x86)}\nssm\win64\nssm.exe","C:\nssm\win64\nssm.exe","C:\tools\nssm\nssm.exe")) {
            if ($p -and (Test-Path $p)) { $nssm = $p; break }
        }
    }
    if (-not $nssm) {
        Write-Host "[WARN] nssm.exe not found; skipping graceful-stop config. If the service is NSSM-managed, run manually:" -ForegroundColor Yellow
        Write-Host "         nssm set $ServiceName AppStopMethodConsole $StopTimeoutMs"
    } elseif (-not (Get-Service -Name $ServiceName -ErrorAction SilentlyContinue)) {
        Write-Host "[WARN] Service '$ServiceName' not found; skipping NSSM stop config (task is still registered)." -ForegroundColor Yellow
    } else {
        Write-Host ""
        Write-Host "NSSM stop config for '$ServiceName' (graceful = console Ctrl+C, then wait):"
        foreach ($k in 'AppStopMethodSkip','AppStopMethodConsole','AppStopMethodWindow','AppStopMethodThreads') {
            $cur = (& $nssm get $ServiceName $k) 2>$null
            Write-Host ("   before  {0,-22} = {1}" -f $k, ($cur -join ' '))
        }
        try {
            & $nssm set $ServiceName AppStopMethodConsole $StopTimeoutMs | Out-Null
            $now = (& $nssm get $ServiceName AppStopMethodConsole) 2>$null
            Write-Host ("[OK] Set AppStopMethodConsole = {0} ms (was above)." -f ($now -join ' ')) -ForegroundColor Green
            $skip = (& $nssm get $ServiceName AppStopMethodSkip) 2>$null
            if ("$skip".Trim() -match '^\d+$' -and ([int]"$skip".Trim() -band 1)) {
                Write-Host "[WARN] AppStopMethodSkip has the console bit (1) set -> the graceful Ctrl+C stop is being SKIPPED." -ForegroundColor Yellow
                Write-Host "         Consider: nssm set $ServiceName AppStopMethodSkip 0   (try console stop first)"
            }
        } catch {
            Write-Host "[WARN] Could not set NSSM stop config: $($_.Exception.Message)" -ForegroundColor Yellow
        }
    }
}

Write-Host ""
Write-Host "=== Verify / operate ===" -ForegroundColor Cyan
Write-Host "  Show it:        schtasks /Query /TN `"$TaskName`" /V /FO LIST"
Write-Host "  Next run:       Get-ScheduledTaskInfo -TaskName `"$TaskName`""
Write-Host "  Test it NOW:    Start-ScheduledTask -TaskName `"$TaskName`"    (bounces the server -- do it when empty)"
Write-Host "  Watch it work:  Get-Content `"$(Join-Path $scriptDir 'logs\nightly_restart.log')`" -Tail 40 -Wait"
Write-Host "  Change time:    edit `$RestartTime in nightly_restart.ps1, then re-run this installer"
Write-Host "  Remove it:      .\register_nightly_restart.ps1 -Unregister"
Write-Host ""
Write-Host "[DONE] Nightly restart installed for $Time server-local." -ForegroundColor Green
