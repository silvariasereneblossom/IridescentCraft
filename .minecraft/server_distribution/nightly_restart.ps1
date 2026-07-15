#Requires -Version 5.1
<#
.SYNOPSIS
    IridescentCraft dedicated-server nightly graceful restart.

.DESCRIPTION
    Bounces the Minecraft server process once a night to reset accumulated heap
    (the recurring slow-leak -> GC death-spiral -> OOM failure mode). This is a
    MEMORY RESET ONLY -- it does NOT pull repo HEAD. In service mode the restart
    already skips the sync phases, so nothing is re-synced here; the operator
    re-syncs deliberately when they mean to ship a change.

    Sequence (all pre-stop steps are BEST-EFFORT and never block the restart):
      1. If RCON is enabled in server.properties: warn online players at ~60s
         and ~10s, then `save-all flush` so the world is guaranteed on disk
         BEFORE anything stops it. (0 players online -> skip the countdown.)
      2. `nssm restart <service>` -- an EXTERNAL bounce (Windows Task Scheduler
         calls this script), so it recovers even a hung / near-OOM server that
         would ignore an in-game `/stop`. Falls back to Restart-Service.

    WHY RCON is only best-effort: RCON is disabled by default on this pack
    (enable-rcon=false). When it is off, or the server is hung and won't answer,
    the script logs that and proceeds straight to the restart. The world is then
    saved by the server's own graceful shutdown hook (triggered by NSSM's
    console-stop). Enable RCON (see deployment-and-utility-guide.md section 9)
    to additionally get the player warning + an explicit pre-stop save, which is
    the reliable save path when NSSM launches the .bat wrapper rather than java
    directly.

    Registered as a Scheduled Task by register_nightly_restart.ps1 (run once on
    the server box). This script only performs a restart; it never installs
    anything.

.NOTES
    Windows PowerShell 5.1 compatible (no ternary / null-coalescing). Deployed
    via the normal server_distribution sync; lives beside server.properties in
    the live runtime root.
#>

# ============================ CONFIG (edit here) ============================
# Restart time, server-local. This is the SINGLE SOURCE OF TRUTH for the hour:
# register_nightly_restart.ps1 parses this line to build the Scheduled Task
# trigger, so changing it here + re-running the register script is all it takes.
$RestartTime   = '05:00'          # 24h HH:mm, server-local

$ServiceName   = 'IridescentMC'   # NSSM service name (see: nssm dump IridescentMC)
$ServerRoot    = $PSScriptRoot    # runtime root (server.properties, world/, logs/)
$WarnLeadSec   = 60               # first "restarting" warning this far ahead
$SecondWarnSec = 10               # second warning this far ahead
$SaveWaitSec   = 12               # wait after `save-all flush` for chunks to land
$RconHost      = '127.0.0.1'      # RCON is localhost-only; never talk to it remotely
$RconTimeoutMs = 5000             # per-connect / per-read RCON timeout
# ===========================================================================

$ErrorActionPreference = 'Continue'

# ---------------------------------------------------------------------------
# Logging: timestamped, appended to logs\nightly_restart.log (+ console).
# ---------------------------------------------------------------------------
$LogDir  = Join-Path $ServerRoot 'logs'
$LogFile = Join-Path $LogDir 'nightly_restart.log'
if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Path $LogDir -Force | Out-Null }

function Write-RestartLog {
    param([string]$Message, [string]$Level = 'INFO')
    $stamp = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss')
    $line  = "[$stamp] [$Level] $Message"
    try { Add-Content -Path $LogFile -Value $line -Encoding UTF8 } catch { }
    Write-Host $line
}

# ---------------------------------------------------------------------------
# server.properties reader (sibling of this script in the runtime root).
# ---------------------------------------------------------------------------
function Get-ServerProperty {
    param([string]$Name, [string]$Default = '')
    $propsPath = Join-Path $ServerRoot 'server.properties'
    if (-not (Test-Path $propsPath)) { return $Default }
    foreach ($raw in (Get-Content -Path $propsPath -ErrorAction SilentlyContinue)) {
        $l = $raw.Trim()
        if ($l.StartsWith('#') -or -not $l.Contains('=')) { continue }
        $k = $l.Substring(0, $l.IndexOf('=')).Trim()
        if ($k -eq $Name) { return $l.Substring($l.IndexOf('=') + 1).Trim() }
    }
    return $Default
}

# ---------------------------------------------------------------------------
# Minimal Source-RCON protocol (dependency-free). Packet on the wire:
#   int32 length | int32 requestId | int32 type | ASCII body | 0x00 0x00
# `length` counts every byte AFTER the length field (id+type+body+2 nulls).
# All integers are little-endian, which BitConverter is on Windows.
# ---------------------------------------------------------------------------
function Write-RconPacket {
    param($Stream, [int]$Id, [int]$Type, [string]$Body)
    $bodyBytes = [System.Text.Encoding]::ASCII.GetBytes($Body)
    $len = 4 + 4 + $bodyBytes.Length + 2
    $ms = New-Object System.IO.MemoryStream
    $bw = New-Object System.IO.BinaryWriter($ms)
    $bw.Write([int]$len); $bw.Write([int]$Id); $bw.Write([int]$Type)
    $bw.Write($bodyBytes); $bw.Write([byte]0); $bw.Write([byte]0); $bw.Flush()
    $bytes = $ms.ToArray()
    $Stream.Write($bytes, 0, $bytes.Length); $Stream.Flush()
}
function Read-RconExact {
    param($Stream, [int]$Count)
    $buf = New-Object byte[] $Count; $off = 0
    while ($off -lt $Count) {
        $n = $Stream.Read($buf, $off, $Count - $off)
        if ($n -le 0) { throw 'RCON stream closed' }
        $off += $n
    }
    return ,$buf
}
function Read-RconPacket {
    param($Stream)
    $lenBuf = Read-RconExact $Stream 4
    $len = [BitConverter]::ToInt32($lenBuf, 0)
    if ($len -lt 10 -or $len -gt 65536) { throw "bad RCON packet length $len" }
    $buf  = Read-RconExact $Stream $len
    $id   = [BitConverter]::ToInt32($buf, 0)
    $type = [BitConverter]::ToInt32($buf, 4)
    $body = [System.Text.Encoding]::ASCII.GetString($buf, 8, $len - 10)
    return [pscustomobject]@{ Id = $id; Type = $type; Body = $body }
}

# Connect, authenticate, run each command; return the array of response bodies.
# Throws on connect/auth/framing failure so the caller can degrade gracefully.
function Invoke-Rcon {
    param(
        [string]$RHost, [int]$Port, [string]$Password, [string[]]$Commands, [int]$TimeoutMs = 5000
    )
    $client = New-Object System.Net.Sockets.TcpClient
    $client.SendTimeout    = $TimeoutMs
    $client.ReceiveTimeout = $TimeoutMs
    try {
        $iar = $client.BeginConnect($RHost, $Port, $null, $null)
        if (-not $iar.AsyncWaitHandle.WaitOne($TimeoutMs)) { throw "connect timeout to ${RHost}:$Port" }
        $client.EndConnect($iar)
        $stream = $client.GetStream()
        $stream.ReadTimeout  = $TimeoutMs
        $stream.WriteTimeout = $TimeoutMs

        # Auth (type 3). Success echoes our id; failure returns id -1. Some
        # servers emit an empty RESPONSE_VALUE (type 0) first -- skip it.
        Write-RconPacket $stream 1 3 $Password
        $resp = Read-RconPacket $stream
        if ($resp.Type -eq 0) { $resp = Read-RconPacket $stream }
        if ($resp.Id -eq -1) { throw 'RCON auth failed (wrong rcon.password)' }

        $results = @(); $cid = 10
        foreach ($cmd in $Commands) {
            Write-RconPacket $stream $cid 2 $cmd
            Start-Sleep -Milliseconds 120
            $r = Read-RconPacket $stream
            $results += $r.Body
            $cid++
        }
        return $results
    } finally {
        try { $client.Close() } catch { }
    }
}

# ---------------------------------------------------------------------------
# Restart the service. Prefer `nssm restart` (matches the documented op),
# fall back to Restart-Service. NSSM registers a real Windows service, so both
# work; nssm's staged console-stop is the graceful path.
# ---------------------------------------------------------------------------
function Restart-IridescentService {
    $nssm = $null
    $cmd = Get-Command nssm.exe -ErrorAction SilentlyContinue
    if ($cmd) { $nssm = $cmd.Source }
    if (-not $nssm) {
        foreach ($p in @("$env:ProgramFiles\nssm\win64\nssm.exe",
                         "$env:ProgramFiles\nssm\nssm.exe",
                         "${env:ProgramFiles(x86)}\nssm\win64\nssm.exe",
                         "C:\nssm\win64\nssm.exe", "C:\tools\nssm\nssm.exe")) {
            if ($p -and (Test-Path $p)) { $nssm = $p; break }
        }
    }

    if ($nssm) {
        Write-RestartLog "Restarting service '$ServiceName' via $nssm ..."
        & $nssm restart $ServiceName
        $code = $LASTEXITCODE
        if ($code -eq 0) { Write-RestartLog "nssm restart returned 0 (OK)."; return $true }
        Write-RestartLog "nssm restart returned exit code $code; trying Restart-Service." 'WARN'
    } else {
        Write-RestartLog "nssm.exe not found on PATH or common locations; using Restart-Service." 'WARN'
    }

    try {
        $svc = Get-Service -Name $ServiceName -ErrorAction Stop
        Write-RestartLog "Restart-Service '$ServiceName' (current: $($svc.Status)) ..."
        Restart-Service -Name $ServiceName -Force -ErrorAction Stop
        Write-RestartLog 'Restart-Service completed.'
        return $true
    } catch {
        Write-RestartLog "FAILED to restart service '$ServiceName': $($_.Exception.Message)" 'ERROR'
        return $false
    }
}

# =========================== main ===========================
Write-RestartLog '================ nightly restart run start ================'
Write-RestartLog "ServerRoot=$ServerRoot  Service=$ServiceName  ScheduledFor=$RestartTime"

# ---- Best-effort in-game warning + guaranteed save via RCON --------------
$rconEnabled = ((Get-ServerProperty 'enable-rcon' 'false').ToLower() -eq 'true')
$rconPass    = Get-ServerProperty 'rcon.password' ''
# Password may instead live in an untracked per-host file (survives repo sync).
if ([string]::IsNullOrEmpty($rconPass)) {
    $passFile = Join-Path $ServerRoot '.icraft_rcon_password'
    if (Test-Path $passFile) { $rconPass = (Get-Content $passFile -Raw -ErrorAction SilentlyContinue).Trim() }
}
$rconPortStr = Get-ServerProperty 'rcon.port' '25575'
$rconPort = 25575; [void][int]::TryParse($rconPortStr, [ref]$rconPort)

if ($rconEnabled -and -not [string]::IsNullOrEmpty($rconPass)) {
    Write-RestartLog "RCON enabled (port $rconPort) -- announcing + flushing save."
    try {
        # How many players online? Skip the countdown if nobody's on.
        $players = 1
        try {
            $listOut = Invoke-Rcon -RHost $RconHost -Port $rconPort -Password $rconPass -Commands @('list') -TimeoutMs $RconTimeoutMs
            if ($listOut -and $listOut[0] -match 'are (\d+)') { $players = [int]$Matches[1] }
            Write-RestartLog "Players online: $players ('$($listOut[0])')."
        } catch { Write-RestartLog "RCON /list failed: $($_.Exception.Message)" 'WARN' }

        if ($players -gt 0) {
            # Plain ASCII on purpose -- avoids any RCON charset ambiguity with
            # section-sign color codes. Colorize later if your server round-trips UTF-8.
            $msg1 = "say [Auto-Restart] Server restarting in $WarnLeadSec seconds for scheduled maintenance."
            [void](Invoke-Rcon -RHost $RconHost -Port $rconPort -Password $rconPass -Commands @($msg1) -TimeoutMs $RconTimeoutMs)
            Start-Sleep -Seconds ($WarnLeadSec - $SecondWarnSec)
            $msg2 = "say [Auto-Restart] Server restarting in $SecondWarnSec seconds. Hold tight!"
            [void](Invoke-Rcon -RHost $RconHost -Port $rconPort -Password $rconPass -Commands @($msg2) -TimeoutMs $RconTimeoutMs)
            Start-Sleep -Seconds $SecondWarnSec
        } else {
            Write-RestartLog 'No players online -- skipping countdown.'
        }

        Write-RestartLog 'Sending save-all flush ...'
        [void](Invoke-Rcon -RHost $RconHost -Port $rconPort -Password $rconPass `
                 -Commands @('say [Auto-Restart] Saving world and restarting now...', 'save-all flush') -TimeoutMs $RconTimeoutMs)
        Write-RestartLog "save-all flush sent; waiting ${SaveWaitSec}s for chunks to hit disk."
        Start-Sleep -Seconds $SaveWaitSec
    } catch {
        Write-RestartLog "RCON pre-stop sequence failed ($($_.Exception.Message)); proceeding to restart anyway." 'WARN'
    }
} else {
    Write-RestartLog 'RCON disabled or no password -- skipping in-game warning; the graceful service stop will save the world.' 'WARN'
}

# ---- The actual memory-reset bounce (always runs) ------------------------
$ok = Restart-IridescentService
Write-RestartLog "================ nightly restart run end (success=$ok) ================"
if (-not $ok) { exit 1 }
exit 0
