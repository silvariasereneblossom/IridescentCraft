#Requires -Version 5.1
<#
.SYNOPSIS
    Pull the dedicated server's verified world backups onto THIS PC (the off-box copy).

.DESCRIPTION
    The launcher on the server box (icraft-gui) zips the world twice a day into
    <runtime root>\backups\ and lists every verified zip in backups\backups.json
    (deployment guide, section 11). Those zips sit on the same disk as the world,
    so they do not survive a disk or VM loss. This script is the second copy: it
    runs on the operator's PC every 2 hours and PULLS the newest ones over the
    admin share.

    One run:
      1. Reads backups.json over the UNC path (never a drive letter: a scheduled
         task has no mapped drives).
      2. Works out the newest -Keep (2) backups across what the server lists and
         what is already here, and copies the ones that are missing: streamed to
         .partial-<name>, read back from the local disk, SHA-256 and size checked
         against the manifest, and only then renamed to the real name.
      3. Prunes its own older copies down to the newest -Keep. It deletes ONLY
         zips it copied itself (listed in pulled.json with "owned": true) and its
         own .partial- leftovers. Anything else in the folder is never touched.
      4. Appends to pull.log (rolled to pull.log.1 at 1 MiB) and rewrites
         pulled.json (what is here, the last result).

    Retention is decided from the LOCAL copies, never from what the server says:
    if the server loses every backup, nothing here is deleted.

    Manual (pinned) backups are listed in backups.json too, so by default they are
    pulled like any other while they are among the newest -Keep, and rotate out
    as newer ones arrive. -ScheduledOnly mirrors only the rotating
    world-YYYYmmdd-HHMM.zip pair.

    If backups.json is missing (an older launcher) the script falls back to the
    world-/manual-YYYYmmdd-HHMM.zip files in the folder and trusts one only after
    testing it itself: the zip must hold <world>/level.dat and bsdtar must read
    every entry to its end with its CRC (tar.exe; .NET's ZipArchive checks none).

    PRIVACY: world backups hold player data. They stay on the operator's
    machines. The script refuses a destination inside a git working tree, under a
    cloud-synced folder (OneDrive, Dropbox, Google Drive, iCloud, ...) or on the
    server itself, and nothing here ever uploads anything.

.PARAMETER Destination
    Where the copies land. Default: %USERPROFILE%\IridescentCraft-ServerBackups.
    Once a task is registered, its destination is the default for every mode.

.PARAMETER ServerBackups
    The server's backups folder as a UNC path.

.PARAMETER Keep
    How many verified local copies to keep (default 2).

.PARAMETER MinFreeGB
    Free space that must remain on the destination disk after a copy (default 5).

.PARAMETER ScheduledOnly
    Pull only the rotating scheduled backups; leave pinned (manual) ones on the server.

.PARAMETER Status
    One line: newest local copy, newest server backup, last pull, task. Exit 0
    healthy, 3 needs attention.

.PARAMETER Verify
    Re-hash every local copy against the SHA-256 recorded when it was pulled.

.PARAMETER Register
    Copy this script beside the backups (<Destination>\pull-server-backups.ps1)
    and create the Scheduled Task that runs that copy every -EveryHours (2), then
    start it once and wait for the run to be recorded. Re-run after the script
    changes, or with a new -Destination to move the copies.

.PARAMETER Unregister
    Remove the Scheduled Task and the installed script. The backups stay.

.EXAMPLE
    powershell -NoProfile -ExecutionPolicy Bypass -File .minecraft\dev\pull-server-backups.ps1 -Register
    powershell -NoProfile -ExecutionPolicy Bypass -File .minecraft\dev\pull-server-backups.ps1 -Register -Destination D:\IridescentCraft-ServerBackups
    powershell -NoProfile -ExecutionPolicy Bypass -File "$env:USERPROFILE\IridescentCraft-ServerBackups\pull-server-backups.ps1" -Status

.NOTES
    Exit codes (pull):
      0 = done, nothing new, the server is unreachable, there are no backups yet,
          or another pull is running. All logged; none of them is an alarm.
      1 = a pull failed for a reason other than a hash: not enough free space, a
          local write error, access to the share denied, a foreign file in the way.
      2 = setup error (unsafe or unusable destination, bad parameter).
      4 = MISMATCH: a copy does not match the manifest's SHA-256 or size (after
          one retry), or a zip without a manifest failed its own test read. The
          bad copy is deleted; the older good copies are kept.
    -Status: 0 healthy, 3 needs attention.   -Verify: 0 all match, 4 mismatch.

    THE TASK'S IDENTITY (decided 2026-10-11): "run only when the user is logged
    on" (LogonType Interactive). The share authenticates as the operator's domain
    account; an interactive task runs inside the operator's logon session and
    uses that session's network credentials, so NO PASSWORD IS STORED anywhere.
    The cost: nothing is pulled while the operator is logged off (a locked screen
    is fine). The server keeps each scheduled backup about 24 h, a missed start
    runs as soon as the operator is back (StartWhenAvailable), and -Status flags a
    copy that falls behind. "Run whether logged on or not" would need the password
    stored by Task Scheduler (S4U, the passwordless variant, has no network
    credentials and cannot read the share); if that is ever wanted, set it in
    Task Scheduler's own dialog, never in a script or the repo.

    The task starts PowerShell through "conhost.exe --headless" so no console
    window flashes over a full-screen game. That host returns 0 whatever the
    script returned, so Task Scheduler's "Last Run Result" is NOT the alarm:
    pulled.json / -Status / pull.log are.

    Windows PowerShell 5.1 compatible (no ternary / null-coalescing). ASCII only:
    5.1 reads a BOM-less script as ANSI.
#>
[CmdletBinding(DefaultParameterSetName = 'Pull')]
param(
    [string]$Destination,
    [string]$ServerBackups,
    [int]$Keep,
    [int]$MinFreeGB,
    [switch]$ScheduledOnly,

    [Parameter(ParameterSetName = 'Status')]     [switch]$Status,
    [Parameter(ParameterSetName = 'Verify')]     [switch]$Verify,
    [Parameter(ParameterSetName = 'Register')]   [switch]$Register,
    [Parameter(ParameterSetName = 'Register')]   [int]$EveryHours = 2,
    [Parameter(ParameterSetName = 'Register')]   [switch]$NoFirstRun,
    [Parameter(ParameterSetName = 'Unregister')] [switch]$Unregister
)

$ErrorActionPreference = 'Continue'

# --- constants ----------------------------------------------------------------
$TaskName      = 'IridescentCraft Pull Server Backups'
# The task runs a copy of this script kept BESIDE the backups, not one in a git
# checkout (worktrees vanish, clones fall behind) and not one under %LOCALAPPDATA%:
# a packaged app (the Claude desktop app is one) has its AppData writes redirected
# to a private store, so a script "installed" there from such a session does not
# exist for Task Scheduler. Found the hard way on 2026-10-11.
$InstalledName = 'pull-server-backups.ps1'
$StateName     = 'pulled.json'
$LogName       = 'pull.log'
$LockName      = '.pull.lock'
$ReadmeName    = 'README.txt'
$PartialPrefix = '.partial-'
$LogMaxBytes   = 1MB
$BehindAfterH  = 6      # a server backup this old and still not here = the copy is behind (3 missed pulls)
$NoContactH    = 26     # this long without reading the server's manifest = say so
$Utf8NoBom     = New-Object System.Text.UTF8Encoding($false)
# A backup's name as it may appear in the manifest: a plain leaf, never a path.
$SafeNameRx    = '^[A-Za-z0-9][A-Za-z0-9._-]*\.zip$'
# What the launcher itself writes; the only names trusted when there is no manifest.
$ManagedNameRx = '^(world|manual)-\d{8}-\d{4}\.zip$'

$DefaultServerBackups = '\\Sereneblossomns\c$\Users\silvariazemaitis\Desktop\IridescentCraft Dedicated Server\backups'
$DefaultDestination   = Join-Path $env:USERPROFILE 'IridescentCraft-ServerBackups'

# --- options: explicit > the registered task's > default ------------------------
function Get-RegisteredTask {
    try { return (Get-ScheduledTask -TaskName $TaskName -ErrorAction Stop) } catch { return $null }
}
function Get-RegisteredOptions {
    $o = @{}
    $t = Get-RegisteredTask
    if ($null -eq $t) { return $o }
    $a = [string](@($t.Actions)[0].Arguments)
    if ($a -match '-Destination\s+"([^"]+)"')   { $o['Destination']   = $matches[1] }
    if ($a -match '-ServerBackups\s+"([^"]+)"') { $o['ServerBackups'] = $matches[1] }
    if ($a -match '-Keep\s+(\d+)')              { $o['Keep']          = [int]$matches[1] }
    if ($a -match '-MinFreeGB\s+(\d+)')         { $o['MinFreeGB']     = [int]$matches[1] }
    if ($a -match '-ScheduledOnly(\s|$)')       { $o['ScheduledOnly'] = $true }
    return $o
}
$reg = Get-RegisteredOptions
if (-not $PSBoundParameters.ContainsKey('Destination')) {
    if ($reg.ContainsKey('Destination')) { $Destination = $reg['Destination'] } else { $Destination = $DefaultDestination }
}
if (-not $PSBoundParameters.ContainsKey('ServerBackups')) {
    if ($reg.ContainsKey('ServerBackups')) { $ServerBackups = $reg['ServerBackups'] } else { $ServerBackups = $DefaultServerBackups }
}
if (-not $PSBoundParameters.ContainsKey('Keep')) {
    if ($reg.ContainsKey('Keep')) { $Keep = $reg['Keep'] } else { $Keep = 2 }
}
if (-not $PSBoundParameters.ContainsKey('MinFreeGB')) {
    if ($reg.ContainsKey('MinFreeGB')) { $MinFreeGB = $reg['MinFreeGB'] } else { $MinFreeGB = 5 }
}
if (-not $PSBoundParameters.ContainsKey('ScheduledOnly') -and $reg.ContainsKey('ScheduledOnly')) { $ScheduledOnly = $true }

if ($Keep -lt 1)      { Write-Host '[pull-server-backups] -Keep must be 1 or more.' -ForegroundColor Red; exit 2 }
if ($MinFreeGB -lt 0) { Write-Host '[pull-server-backups] -MinFreeGB cannot be negative.' -ForegroundColor Red; exit 2 }
if ($EveryHours -lt 1 -or $EveryHours -gt 12) { Write-Host '[pull-server-backups] -EveryHours must be between 1 and 12.' -ForegroundColor Red; exit 2 }
try { $Destination = [IO.Path]::GetFullPath($Destination).TrimEnd('\') } catch {
    Write-Host "[pull-server-backups] -Destination is not a usable path: $Destination" -ForegroundColor Red; exit 2
}
if ($Destination -match '^[A-Za-z]:$') { Write-Host '[pull-server-backups] -Destination must be a folder, not the root of a drive.' -ForegroundColor Red; exit 2 }
$ServerBackups = $ServerBackups.TrimEnd('\')
$InstalledPath = Join-Path $Destination $InstalledName

# --- small helpers --------------------------------------------------------------
$script:LogFile = $null
function Write-Log {
    param([string]$Message, [string]$Level = 'INFO')
    $line = ('{0} [{1}] {2}' -f (Get-Date).ToString('yyyy-MM-dd HH:mm:ss'), $Level, $Message)
    if ($script:LogFile) {
        try {
            $fi = New-Object IO.FileInfo($script:LogFile)
            if ($fi.Exists -and $fi.Length -gt $LogMaxBytes) {
                $old = $script:LogFile + '.1'
                if ([IO.File]::Exists($old)) { [IO.File]::Delete($old) }
                [IO.File]::Move($script:LogFile, $old)
            }
            [IO.File]::AppendAllText($script:LogFile, $line + "`r`n", $Utf8NoBom)
        } catch { }
    }
    $color = 'Gray'
    if ($Level -eq 'WARN')  { $color = 'Yellow' }
    if ($Level -eq 'ERROR') { $color = 'Red' }
    Write-Host $line -ForegroundColor $color
}
function Format-Span {
    param([double]$Seconds)
    if ($Seconds -lt 0) { $Seconds = 0 }
    $d = [int][math]::Floor($Seconds / 86400)
    $h = [int][math]::Floor(($Seconds % 86400) / 3600)
    $m = [int][math]::Floor(($Seconds % 3600) / 60)
    if ($d -gt 0) { return ('{0}d{1:00}h' -f $d, $h) }
    if ($h -gt 0) { return ('{0}h{1:00}m' -f $h, $m) }
    return ('{0}m' -f $m)
}
function Format-Bytes {
    param([double]$Bytes)
    if ($Bytes -ge 1GB) { return ('{0:n2} GiB' -f ($Bytes / 1GB)) }
    return ('{0:n1} MiB' -f ($Bytes / 1MB))
}
# created_utc is an ISO-8601 string in Windows PowerShell 5.1, but pwsh 7's
# ConvertFrom-Json hands the same value back as a [datetime]. Take either.
function ConvertTo-UtcDate {
    param($Value)
    if ($null -eq $Value) { return $null }
    if ($Value -is [datetime]) { return $Value.ToUniversalTime() }
    try {
        return [DateTimeOffset]::Parse([string]$Value, [Globalization.CultureInfo]::InvariantCulture).UtcDateTime
    } catch { return $null }
}
function Format-Iso {
    param($Value)
    $d = ConvertTo-UtcDate $Value
    if ($null -eq $d) { return $null }
    return $d.ToString("yyyy-MM-dd'T'HH:mm:ss'Z'", [Globalization.CultureInfo]::InvariantCulture)
}
function Get-Sha256 {
    param([string]$Path)
    return (Get-FileHash -LiteralPath $Path -Algorithm SHA256 -ErrorAction Stop).Hash.ToLower()
}
function Test-IsUnder {
    param([string]$Path, [string]$Root)
    if ([string]::IsNullOrWhiteSpace($Root)) { return $false }
    try {
        $p = [IO.Path]::GetFullPath($Path).TrimEnd('\') + '\'
        $r = [IO.Path]::GetFullPath($Root).TrimEnd('\') + '\'
    } catch { return $false }
    return $p.StartsWith($r, [StringComparison]::OrdinalIgnoreCase)
}
function Get-UncHost {
    param([string]$Path)
    if ($Path -match '^\\\\([^\\]+)\\') { return $matches[1] }
    return $null
}
function Get-FreeBytes {
    param([string]$Path)
    try {
        $root = [IO.Path]::GetPathRoot([IO.Path]::GetFullPath($Path))
        if ($root -match '^[A-Za-z]:\\$') { return (New-Object IO.DriveInfo($root)).AvailableFreeSpace }
    } catch { }
    try {
        $fso = New-Object -ComObject Scripting.FileSystemObject
        return [int64]($fso.GetDrive($fso.GetDriveName($Path)).AvailableSpace)
    } catch { }
    return $null
}

# --- the destination must not leak player data -----------------------------------
function Get-CloudSyncRoots {
    $roots = New-Object System.Collections.Generic.List[object]
    foreach ($n in 'OneDrive', 'OneDriveConsumer', 'OneDriveCommercial') {
        $v = [Environment]::GetEnvironmentVariable($n)
        if ($v) { $roots.Add([pscustomobject]@{ Name = 'OneDrive'; Path = $v }) }
    }
    try {
        foreach ($k in @(Get-ChildItem 'HKCU:\Software\Microsoft\OneDrive\Accounts' -ErrorAction Stop)) {
            $uf = (Get-ItemProperty -LiteralPath $k.PSPath -ErrorAction SilentlyContinue).UserFolder
            if ($uf) { $roots.Add([pscustomobject]@{ Name = 'OneDrive'; Path = [string]$uf }) }
        }
    } catch { }
    foreach ($info in @((Join-Path $env:APPDATA 'Dropbox\info.json'), (Join-Path $env:LOCALAPPDATA 'Dropbox\info.json'))) {
        if (-not [IO.File]::Exists($info)) { continue }
        try {
            $j = [IO.File]::ReadAllText($info) | ConvertFrom-Json
            foreach ($acct in $j.PSObject.Properties) {
                if ($acct.Value.path) { $roots.Add([pscustomobject]@{ Name = 'Dropbox'; Path = [string]$acct.Value.path }) }
            }
        } catch { }
    }
    foreach ($pair in @(@('iCloud Drive', 'iCloudDrive'), @('Google Drive', 'Google Drive'), @('Dropbox', 'Dropbox'))) {
        $p = Join-Path $env:USERPROFILE $pair[1]
        if ([IO.Directory]::Exists($p)) { $roots.Add([pscustomobject]@{ Name = $pair[0]; Path = $p }) }
    }
    return $roots
}
function Get-DestinationProblems {
    param([string]$Path, [string]$SourceUnc)
    $problems = New-Object System.Collections.Generic.List[string]

    # 1. Never inside a git working tree: one `git add -A` away from a commit.
    $d = $Path
    while ($d) {
        if (Test-Path -LiteralPath (Join-Path $d '.git')) {
            $problems.Add("it is inside a git working tree ($d). World backups hold player data and must never be committed.")
            break
        }
        $parent = $null
        try { $parent = [IO.Path]::GetDirectoryName($d) } catch { }
        if (-not $parent -or $parent -eq $d) { break }
        $d = $parent
    }

    # 2. Never under a cloud-synced folder: that would upload them.
    $hit = $false
    foreach ($r in (Get-CloudSyncRoots)) {
        if (Test-IsUnder $Path $r.Path) {
            $problems.Add("it is under the $($r.Name) folder ($($r.Path)), which syncs to the cloud. World backups must stay on the operator's machines.")
            $hit = $true
            break
        }
    }
    if (-not $hit) {
        foreach ($seg in $Path.Split('\')) {
            if ($seg -match '^(OneDrive( - .+)?|Dropbox( \(.+\))?|Google ?Drive|My Drive|iCloudDrive|MEGA|MEGAsync|pCloudDrive|Nextcloud)$') {
                $problems.Add("its path has a folder named '$seg', which looks cloud-synced. Pick a folder that no sync client watches.")
                break
            }
        }
        try {
            $root = [IO.Path]::GetPathRoot($Path)
            if ($root -match '^[A-Za-z]:\\$') {
                $di = New-Object IO.DriveInfo($root)
                if ($di.IsReady -and $di.VolumeLabel -match '^(Google Drive|iCloud|Dropbox|OneDrive)') {
                    $problems.Add("drive $root is a '$($di.VolumeLabel)' volume, which syncs to the cloud.")
                }
            }
        } catch { }
    }

    # 3. Never on the server itself: that is not an off-box copy.
    $srcHost = Get-UncHost $SourceUnc
    if ($srcHost) {
        $dstHost = Get-UncHost $Path
        if (-not $dstHost -and $Path -match '^([A-Za-z]:)') {
            try {
                $ld = Get-CimInstance -ClassName Win32_LogicalDisk -Filter ("DeviceID='{0}'" -f $matches[1]) -ErrorAction Stop
                if ($ld -and $ld.DriveType -eq 4 -and $ld.ProviderName) { $dstHost = Get-UncHost ([string]$ld.ProviderName) }
            } catch { }
        }
        if ($dstHost -and ($dstHost -ieq $srcHost)) {
            $problems.Add("it is on the server itself (\\$dstHost). An off-box copy has to live on another machine.")
        }
    }
    return $problems
}
function Assert-Destination {
    $problems = @(Get-DestinationProblems -Path $Destination -SourceUnc $ServerBackups)
    if ($problems.Count -gt 0) {
        Write-Host "[pull-server-backups] REFUSING destination $Destination" -ForegroundColor Red
        foreach ($p in $problems) { Write-Host "    - $p" -ForegroundColor Red }
        Write-Host '    Pass -Destination <folder> on a local disk that no git repo or sync client covers.' -ForegroundColor Yellow
        exit 2
    }
    if (-not [IO.Directory]::Exists($Destination)) {
        try { [void][IO.Directory]::CreateDirectory($Destination) } catch {
            Write-Host "[pull-server-backups] cannot create $Destination : $($_.Exception.Message)" -ForegroundColor Red
            exit 2
        }
    }
}
function Write-Readme {
    $path = Join-Path $Destination $ReadmeName
    $text = @"
IridescentCraft - off-box copies of the dedicated server's world backups
========================================================================

What this is
  The newest $Keep verified world backups of the dedicated server, pulled
  regularly (every 2 hours unless registered otherwise) from
    $ServerBackups
  by the Scheduled Task "$TaskName"
  (script: $InstalledPath;
   source of truth: .minecraft\dev\pull-server-backups.ps1 in the modpack repo).

PRIVACY
  These zips hold player data. Keep them on your own machines. Do not move this
  folder into OneDrive / Dropbox / Google Drive or into a git repository, and do
  not upload or share the zips.

Files
  world-YYYYmmdd-HHMM.zip    a scheduled backup (name = server-local time)
  manual-YYYYmmdd-HHMM.zip   a pinned backup someone asked for
  pulled.json                what is here (size, SHA-256, when) + the last result
  pull.log / pull.log.1      every run
  pull-server-backups.ps1    the copy of the script the Scheduled Task runs
  The script rotates only the zips listed in pulled.json with "owned": true.
  To keep one for good, COPY it to another name (for example keep-2026-10-11.zip).
  Anything else you put in this folder is never touched.

Status
  powershell -NoProfile -ExecutionPolicy Bypass -File "$InstalledPath" -Status
  Re-hash every copy:   ... -Verify
  Pull right now:       ... (no switch)

Restore the server from a copy in this folder
  1. Check the copy:  run -Verify (above); it must say every copy matches.
  2. Put it back on the server under a name the launcher's rotation ignores:
       Copy-Item "$Destination\world-YYYYmmdd-HHMM.zip" "$ServerBackups\restore-source-YYYYmmdd-HHMM.zip"
     and compare its hash with "sha256" in pulled.json:
       (Get-FileHash "$ServerBackups\restore-source-YYYYmmdd-HHMM.zip" -Algorithm SHA256).Hash.ToLower()
  3. At the server box, in the server folder (the one holding server.properties):
       - Stop the server in icraft-gui and wait for "idle (ready)".
       - Rename-Item world world-before-restore
       - tar -xf backups\restore-source-YYYYmmdd-HHMM.zip      (recreates world\)
       - Test-Path world\level.dat                              (True)
       - Serve (full) or Cycle in icraft-gui.
       - Once the restored world is confirmed good in game, delete
         world-before-restore\ and the restore-source zip.
  If the server box itself was lost: rebuild it first (deployment guide), let the
  launcher create the server folder, then do step 3 with the zip copied into
  backups\ by any means. Full detail: deployment guide, section 11.
"@
    try {
        $now = $null
        if ([IO.File]::Exists($path)) { $now = [IO.File]::ReadAllText($path) }
        if ($now -ne $text) { [IO.File]::WriteAllText($path, $text, $Utf8NoBom) }
    } catch { }
}

# --- local state (pulled.json) ---------------------------------------------------
function Read-State {
    param([string]$Path)
    if (-not [IO.File]::Exists($Path)) { return $null }
    $raw = [IO.File]::ReadAllText($Path).TrimStart([char]0xFEFF)
    return ($raw | ConvertFrom-Json -ErrorAction Stop)
}
function Get-StateCopies {
    param($State)
    $out = New-Object System.Collections.Generic.List[object]
    if ($null -eq $State) { return $out }
    foreach ($c in @($State.copies)) {
        if ($null -eq $c) { continue }
        $name = [string]$c.file
        $when = ConvertTo-UtcDate $c.created_utc
        if ($name -notmatch $SafeNameRx -or $null -eq $when) { continue }
        $out.Add([pscustomobject]@{
            File       = $name
            Kind       = [string]$c.kind
            Size       = [int64]$c.size
            Sha256     = ([string]$c.sha256).ToLower()
            Created    = $when
            WorldFiles = $c.world_files
            PulledUtc  = (Format-Iso $c.pulled_utc)
            VerifiedBy = [string]$c.verified_by
            Owned      = ($c.owned -eq $true)
        })
    }
    return $out
}
function Save-State {
    param([string]$Path, $Copies, $Prev, [string]$Result, [string]$Note, [int]$ExitCode, $ServerNewest, [bool]$Contact)
    $list = @()
    foreach ($c in @($Copies | Sort-Object Created -Descending)) {
        $list += [ordered]@{
            file = $c.File; kind = $c.Kind; size = $c.Size; sha256 = $c.Sha256
            created_utc = (Format-Iso $c.Created); world_files = $c.WorldFiles
            pulled_utc = $c.PulledUtc; verified_by = $c.VerifiedBy; owned = $c.Owned
        }
    }
    $nowIso = Format-Iso ([DateTime]::UtcNow)
    $contactIso = $null
    if ($Contact) { $contactIso = $nowIso } elseif ($null -ne $Prev) { $contactIso = Format-Iso $Prev.last_contact_utc }
    $newest = $null
    if ($null -ne $ServerNewest) {
        $newest = [ordered]@{ file = $ServerNewest.File; kind = $ServerNewest.Kind; created_utc = (Format-Iso $ServerNewest.Created) }
    } elseif ($null -ne $Prev -and $null -ne $Prev.server_newest) {
        $newest = [ordered]@{ file = [string]$Prev.server_newest.file; kind = [string]$Prev.server_newest.kind; created_utc = (Format-Iso $Prev.server_newest.created_utc) }
    }
    $doc = [ordered]@{
        version          = 1
        updated_utc      = $nowIso
        source           = $ServerBackups
        last_run         = [ordered]@{ at_utc = $nowIso; result = $Result; exit_code = $ExitCode; note = $Note }
        last_contact_utc = $contactIso
        server_newest    = $newest
        copies           = $list
    }
    $json = ConvertTo-Json -InputObject $doc -Depth 6
    $tmp = $Path + '.tmp'
    [IO.File]::WriteAllText($tmp, $json + "`r`n", $Utf8NoBom)
    # [NullString]: a plain $null becomes "" for a .NET string parameter, and Replace rejects that.
    if ([IO.File]::Exists($Path)) { [IO.File]::Replace($tmp, $Path, [NullString]::Value) } else { [IO.File]::Move($tmp, $Path) }
}

# --- the server side -------------------------------------------------------------
function Test-TcpPort {
    param([string]$HostName, [int]$Port, [int]$TimeoutMs)
    $c = New-Object Net.Sockets.TcpClient
    try {
        $ar = $c.BeginConnect($HostName, $Port, $null, $null)
        if (-not $ar.AsyncWaitHandle.WaitOne($TimeoutMs)) { return $false }
        $c.EndConnect($ar)
        return $true
    } catch { return $false } finally { $c.Close() }
}
# State: ok | unreachable | denied | no-folder | bad-manifest. Entries are the
# backups this run may pull (already filtered by -ScheduledOnly), each with
# File / Kind / Size / Sha256 (null = no manifest: test it yourself) / Created.
function Get-ServerListing {
    param([int]$TimeoutMs = 5000)
    $r = [pscustomobject]@{ State = 'ok'; Note = ''; Entries = @(); FromManifest = $true; Skipped = @() }
    $srvHost = Get-UncHost $ServerBackups
    if ($srvHost -and -not (Test-TcpPort $srvHost 445 $TimeoutMs)) {
        $r.State = 'unreachable'; $r.Note = "no answer from $srvHost on the file-sharing port"
        return $r
    }
    $items = $null
    try {
        $items = @(Get-ChildItem -LiteralPath $ServerBackups -Force -ErrorAction Stop)
    } catch {
        $ex = $_.Exception
        $msg = $ex.Message
        if ($ex -is [UnauthorizedAccessException] -or $msg -match 'denied|logon failure|user name or password|not have permission') {
            $r.State = 'denied'; $r.Note = "access denied as $([Security.Principal.WindowsIdentity]::GetCurrent().Name): $msg"
            return $r
        }
        # Missing folder on a share that answers, or the share itself not answering?
        $shareUp = $false
        if ($ServerBackups -match '^(\\\\[^\\]+\\[^\\]+)') {
            try { $shareUp = [IO.Directory]::Exists($matches[1]) } catch { }
        } else {
            try { $shareUp = [IO.Directory]::Exists([IO.Path]::GetPathRoot($ServerBackups)) } catch { }
        }
        if ($shareUp) { $r.State = 'no-folder'; $r.Note = 'the server has no backups folder yet' }
        else          { $r.State = 'unreachable'; $r.Note = $msg }
        return $r
    }

    $entries = New-Object System.Collections.Generic.List[object]
    $skipped = New-Object System.Collections.Generic.List[string]
    $manifestPath = Join-Path $ServerBackups 'backups.json'
    if ([IO.File]::Exists($manifestPath)) {
        $bm = $null
        try {
            $bm = [IO.File]::ReadAllText($manifestPath).TrimStart([char]0xFEFF) | ConvertFrom-Json -ErrorAction Stop
        } catch {
            $r.State = 'bad-manifest'; $r.Note = "backups.json does not parse: $($_.Exception.Message)"
            return $r
        }
        if ([string]$bm.version -ne '1') {
            $r.State = 'bad-manifest'; $r.Note = "backups.json is version '$($bm.version)', this script reads version 1 -- update pull-server-backups.ps1"
            return $r
        }
        foreach ($b in @($bm.backups)) {
            if ($null -eq $b) { continue }
            $name = [string]$b.file
            $sha  = ([string]$b.sha256).ToLower()
            $when = ConvertTo-UtcDate $b.created_utc
            $size = [int64]0
            try { $size = [int64]$b.size } catch { }
            if ($name -notmatch $SafeNameRx -or $sha -notmatch '^[0-9a-f]{64}$' -or $null -eq $when -or $size -le 0) {
                $skipped.Add("manifest entry '$name' is malformed (name, sha256, size or created_utc)")
                continue
            }
            $kind = [string]$b.kind
            if ($ScheduledOnly -and $kind -ne 'scheduled') { continue }
            $entries.Add([pscustomobject]@{ File = $name; Kind = $kind; Size = $size; Sha256 = $sha; Created = $when; WorldFiles = $b.world_files })
        }
    } else {
        # No manifest (a launcher older than 2026-10-11): only the launcher's own
        # names, and each one is tested here before it is trusted.
        $r.FromManifest = $false
        foreach ($it in $items) {
            if ($it.PSIsContainer -or $it.Name -notmatch $ManagedNameRx) { continue }
            $kind = 'scheduled'
            if ($it.Name -like 'manual-*') { $kind = 'manual' }
            if ($ScheduledOnly -and $kind -ne 'scheduled') { continue }
            $entries.Add([pscustomobject]@{ File = $it.Name; Kind = $kind; Size = [int64]$it.Length; Sha256 = $null; Created = $it.LastWriteTimeUtc; WorldFiles = $null })
        }
    }
    $r.Entries = $entries.ToArray()
    $r.Skipped = $skipped.ToArray()
    return $r
}
function Get-Newest {
    param($Items)
    # Piped, never @($Items): Windows PowerShell 5.1 throws "Argument types do not
    # match" on @() around a generic List handed in as a parameter.
    return ($Items | Where-Object { $null -ne $_ } | Sort-Object @{ Expression = { $_.Created }; Descending = $true }, @{ Expression = { $_.File }; Descending = $true } | Select-Object -First 1)
}

# --- copy + verify ---------------------------------------------------------------
# Side = 'read' (the server went away) or 'write' (this PC's disk): the caller
# treats the first as "unreachable", the second as a failure.
function Copy-FileStreamed {
    param([string]$Source, [string]$Target)
    $res = @{ Ok = $false; Side = ''; Message = ''; Bytes = [int64]0 }
    $in = $null; $out = $null
    try {
        try {
            # Share Delete too: the launcher's own prune must never fail because of this reader.
            $in = New-Object IO.FileStream($Source, [IO.FileMode]::Open, [IO.FileAccess]::Read, ([IO.FileShare]'ReadWrite, Delete'), 1048576, [IO.FileOptions]::SequentialScan)
        } catch { $res.Side = 'read'; $res.Message = $_.Exception.Message; return $res }
        try {
            $out = New-Object IO.FileStream($Target, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None, 1048576)
        } catch { $res.Side = 'write'; $res.Message = $_.Exception.Message; return $res }
        $buf = New-Object byte[] (4MB)
        while ($true) {
            $n = 0
            try { $n = $in.Read($buf, 0, $buf.Length) } catch { $res.Side = 'read'; $res.Message = $_.Exception.Message; return $res }
            if ($n -le 0) { break }
            try { $out.Write($buf, 0, $n) } catch { $res.Side = 'write'; $res.Message = $_.Exception.Message; return $res }
            $res.Bytes += $n
        }
        try { $out.Flush($true) } catch { $res.Side = 'write'; $res.Message = $_.Exception.Message; return $res }
        $res.Ok = $true
        return $res
    } finally {
        if ($null -ne $out) { $out.Dispose() }
        if ($null -ne $in)  { $in.Dispose() }
    }
}
# For a zip no manifest vouches for: it must hold <world>/level.dat, and every
# entry must read to its end with its CRC. bsdtar (tar.exe) checks CRCs; .NET's
# ZipArchive does not, so a flipped byte in a stored .mca would pass it.
function Test-ZipSelf {
    param([string]$Path)
    $res = @{ Ok = $false; Message = ''; Files = 0 }
    try {
        Add-Type -AssemblyName System.IO.Compression, System.IO.Compression.FileSystem -ErrorAction Stop
        $hasLevel = $false
        $z = [IO.Compression.ZipFile]::OpenRead($Path)
        try {
            foreach ($e in $z.Entries) {
                if (-not $e.FullName.EndsWith('/')) { $res.Files++ }
                if ($e.FullName -match '^[^/]+/level\.dat$') { $hasLevel = $true }
            }
        } finally { $z.Dispose() }
        if (-not $hasLevel) { $res.Message = 'no <world>/level.dat inside: not a world backup'; return $res }
    } catch { $res.Message = "not a readable zip: $($_.Exception.Message)"; return $res }

    $tar = Join-Path $env:SystemRoot 'System32\tar.exe'
    if (-not [IO.File]::Exists($tar)) { $res.Message = 'tar.exe not found, so the entries cannot be test-read'; return $res }
    try {
        $psi = New-Object Diagnostics.ProcessStartInfo
        $psi.FileName = $tar
        $psi.Arguments = '-xOf "' + $Path + '"'
        $psi.UseShellExecute = $false
        $psi.CreateNoWindow = $true
        $psi.RedirectStandardOutput = $true
        $psi.RedirectStandardError = $true
        $p = [Diagnostics.Process]::Start($psi)
        $errTask = $p.StandardError.ReadToEndAsync()
        $p.StandardOutput.BaseStream.CopyTo([IO.Stream]::Null)
        $p.WaitForExit()
        if ($p.ExitCode -ne 0) {
            $first = (([string]$errTask.Result) -split "`r?`n" | Where-Object { $_ } | Select-Object -First 1)
            $res.Message = "test read failed (tar exit $($p.ExitCode)): $first"
            return $res
        }
    } catch { $res.Message = "test read could not run: $($_.Exception.Message)"; return $res }
    $res.Ok = $true
    return $res
}

# =============================================================================
# PULL
# =============================================================================
$script:PullExit = 0
function Set-PullExit {
    param([int]$Code)
    if ($Code -eq 4) { $script:PullExit = 4 }
    elseif ($script:PullExit -eq 0) { $script:PullExit = $Code }
}
function Invoke-PullLocked {
    try { [Diagnostics.Process]::GetCurrentProcess().PriorityClass = 'BelowNormal' } catch { }
    $statePath = Join-Path $Destination $StateName

    # ---- what this PC already holds ---------------------------------------------
    $state = $null
    try { $state = Read-State $statePath } catch {
        $aside = $statePath + '.unreadable-' + (Get-Date).ToString('yyyyMMdd-HHmmss')
        try { [IO.File]::Move($statePath, $aside) } catch { }
        Write-Log "pulled.json does not parse ($($_.Exception.Message)); moved aside as $(Split-Path $aside -Leaf). Zips already here are no longer known to be this script's and will not be pruned." 'WARN'
    }
    $copies = New-Object System.Collections.Generic.List[object]
    foreach ($c in (Get-StateCopies $state)) {
        $fi = New-Object IO.FileInfo((Join-Path $Destination $c.File))
        if (-not $fi.Exists) {
            Write-Log "$($c.File) is listed in pulled.json but is no longer in the folder (moved or deleted by hand) -- forgetting it" 'WARN'
            continue
        }
        if ($fi.Length -ne $c.Size) {
            Write-Log "$($c.File) changed size since it was verified ($($fi.Length) B, was $($c.Size) B) -- no longer counted as a verified copy and not pruned; delete or rename it by hand" 'WARN'
            continue
        }
        $copies.Add($c)
    }
    foreach ($stale in @(Get-ChildItem -LiteralPath $Destination -Force -File -ErrorAction SilentlyContinue | Where-Object { $_.Name -like ($PartialPrefix + '*') })) {
        if ($stale.Name.Substring($PartialPrefix.Length) -notmatch $SafeNameRx) { continue }
        try { [IO.File]::Delete($stale.FullName); Write-Log "removed a leftover from an interrupted pull: $($stale.Name)" } catch { }
    }

    # ---- what the server offers --------------------------------------------------
    $listing = Get-ServerListing
    if ($listing.State -eq 'unreachable') {
        Write-Log "server unreachable ($($listing.Note)) -- nothing pulled; $($copies.Count) verified cop$(if ($copies.Count -eq 1) {'y'} else {'ies'}) here"
        Save-State -Path $statePath -Copies $copies -Prev $state -Result 'unreachable' -Note $listing.Note -ExitCode 0 -ServerNewest $null -Contact $false
        return
    }
    if ($listing.State -eq 'denied') {
        Write-Log "CANNOT READ THE SHARE: $($listing.Note). The task must run as the account the share accepts, inside that user's logon session (see .NOTES in the script)." 'ERROR'
        Set-PullExit 1
        Save-State -Path $statePath -Copies $copies -Prev $state -Result 'denied' -Note $listing.Note -ExitCode 1 -ServerNewest $null -Contact $false
        return
    }
    if ($listing.State -eq 'no-folder') {
        Write-Log "$($listing.Note) ($ServerBackups) -- nothing to pull"
        Save-State -Path $statePath -Copies $copies -Prev $state -Result 'no-backups-yet' -Note $listing.Note -ExitCode 0 -ServerNewest $null -Contact $true
        return
    }
    if ($listing.State -eq 'bad-manifest') {
        Write-Log "$($listing.Note) -- nothing pulled this run" 'WARN'
        Save-State -Path $statePath -Copies $copies -Prev $state -Result 'manifest-unreadable' -Note $listing.Note -ExitCode 0 -ServerNewest $null -Contact $false
        return
    }
    foreach ($s in $listing.Skipped) { Write-Log $s 'WARN' }
    $serverEntries = @($listing.Entries)
    $serverNewest = Get-Newest $serverEntries
    if (-not $listing.FromManifest -and $serverEntries.Count -gt 0) {
        Write-Log 'the server has no backups.json; falling back to its world-/manual- zips, each tested here before it is trusted' 'WARN'
    }
    if ($serverEntries.Count -eq 0) {
        Write-Log "the server lists no backup yet -- nothing to pull; $($copies.Count) verified cop$(if ($copies.Count -eq 1) {'y'} else {'ies'}) here"
        Save-State -Path $statePath -Copies $copies -Prev $state -Result 'no-backups-yet' -Note 'the server lists no backup' -ExitCode 0 -ServerNewest $null -Contact $true
        return
    }

    # ---- the newest $Keep across both sides; pull the ones that are not here ------
    $byName = @{}
    foreach ($c in $copies) { $byName[$c.File] = [pscustomobject]@{ File = $c.File; Created = $c.Created; Local = $true; Entry = $null } }
    foreach ($e in $serverEntries) {
        if ($byName.ContainsKey($e.File)) {
            $mine = $copies | Where-Object { $_.File -eq $e.File } | Select-Object -First 1
            if ($e.Sha256 -and $mine.Sha256 -and $e.Sha256 -ne $mine.Sha256) {
                Write-Log "MISMATCH: the server now lists $($e.File) with sha256 $($e.Sha256), but the copy pulled earlier is $($mine.Sha256). The local copy is kept as it is; find out which side changed." 'ERROR'
                Set-PullExit 4
            }
            continue
        }
        $byName[$e.File] = [pscustomobject]@{ File = $e.File; Created = $e.Created; Local = $false; Entry = $e }
    }
    $wanted = @($byName.Values | Sort-Object @{ Expression = { $_.Created }; Descending = $true }, @{ Expression = { $_.File }; Descending = $true } | Select-Object -First $Keep)
    $toPull = @($wanted | Where-Object { -not $_.Local })

    $pulled = New-Object System.Collections.Generic.List[string]
    $interrupted = $false
    foreach ($w in $toPull) {
        $e = $w.Entry
        $src   = Join-Path $ServerBackups $e.File
        $final = Join-Path $Destination $e.File
        $tmp   = Join-Path $Destination ($PartialPrefix + $e.File)

        # A file of that name this script did not put here: adopt it if it is the same bytes, never overwrite it.
        if ([IO.File]::Exists($final)) {
            $fi = New-Object IO.FileInfo($final)
            $same = $false
            if ($e.Sha256 -and $fi.Length -eq $e.Size) {
                try { $same = ((Get-Sha256 $final) -eq $e.Sha256) } catch { }
            }
            if ($same) {
                Write-Log "$($e.File) is already in the folder and matches the manifest (not copied by this script): counted as a verified copy, never pruned"
                $copies.Add([pscustomobject]@{ File = $e.File; Kind = $e.Kind; Size = $e.Size; Sha256 = $e.Sha256; Created = $e.Created; WorldFiles = $e.WorldFiles; PulledUtc = (Format-Iso ([DateTime]::UtcNow)); VerifiedBy = 'manifest sha256 (file was already here)'; Owned = $false })
                Save-State -Path $statePath -Copies $copies -Prev $state -Result 'pulling' -Note '' -ExitCode 0 -ServerNewest $serverNewest -Contact $true
            } else {
                Write-Log "BLOCKED: a file named $($e.File) is already in the folder and does not match the server's backup of that name. It is not this script's, so it is left alone and that backup is NOT pulled. Rename or remove it." 'ERROR'
                Set-PullExit 1
            }
            continue
        }

        $srcInfo = New-Object IO.FileInfo($src)
        if (-not $srcInfo.Exists) {
            Write-Log "$($e.File) is listed but no longer on the server (rotated out a moment ago?) -- skipped" 'WARN'
            continue
        }
        if ($e.Sha256 -and $srcInfo.Length -ne $e.Size) {
            Write-Log "MISMATCH: $($e.File) is $($srcInfo.Length) B on the server but the manifest says $($e.Size) B. Not copied. Check the server's backups (verify-server.ps1, logs\backup.log)." 'ERROR'
            Set-PullExit 4
            continue
        }
        $free = Get-FreeBytes $Destination
        $need = [int64]$srcInfo.Length + ([int64]$MinFreeGB * 1GB)
        if ($null -eq $free) {
            Write-Log "could not read the free space of $Destination -- copying anyway" 'WARN'
        } elseif ($free -lt $need) {
            Write-Log "NOT ENOUGH FREE SPACE on $([IO.Path]::GetPathRoot($Destination)): $(Format-Bytes $free) free, $($e.File) needs $(Format-Bytes $srcInfo.Length) plus $MinFreeGB GiB left over. Nothing copied. Free some space or re-register with another -Destination." 'ERROR'
            Set-PullExit 1
            break
        }

        # One retry: a first mismatch may be the transfer, a second one is the file.
        $ok = $false; $giveUp = $false; $mismatch = $false
        $sha = $null
        $verifiedBy = 'manifest sha256'
        for ($attempt = 1; $attempt -le 2 -and -not $ok -and -not $giveUp; $attempt++) {
            if ([IO.File]::Exists($tmp)) { try { [IO.File]::Delete($tmp) } catch { } }
            Write-Log "pulling $($e.File) ($(Format-Bytes $srcInfo.Length))$(if ($attempt -gt 1) {' -- second attempt'})"
            $sw = [Diagnostics.Stopwatch]::StartNew()
            $cp = Copy-FileStreamed -Source $src -Target $tmp
            if (-not $cp.Ok) {
                if ([IO.File]::Exists($tmp)) { try { [IO.File]::Delete($tmp) } catch { } }
                if ($cp.Side -eq 'read') {
                    Write-Log "the server went away while $($e.File) was being read ($($cp.Message)) -- partial copy removed, will retry next run" 'WARN'
                    $interrupted = $true
                } else {
                    Write-Log "could not write $($e.File) to $Destination ($($cp.Message)) -- partial copy removed" 'ERROR'
                    Set-PullExit 1
                }
                $giveUp = $true
                continue
            }
            $copySecs = $sw.Elapsed.TotalSeconds
            # Verify what LANDED: read the local file back, not the stream that was copied.
            try { $sha = Get-Sha256 $tmp } catch { $sha = $null }
            $len = (New-Object IO.FileInfo($tmp)).Length
            if ($e.Sha256) {
                if ($len -eq $e.Size -and $sha -eq $e.Sha256) {
                    $ok = $true
                } else {
                    Write-Log "MISMATCH on $($e.File) (attempt $attempt): copied $len B sha256 $sha, manifest says $($e.Size) B sha256 $($e.Sha256). The copy is deleted." $(if ($attempt -eq 1) {'WARN'} else {'ERROR'})
                    try { [IO.File]::Delete($tmp) } catch { }
                    $mismatch = $true
                }
            } else {
                $t = Test-ZipSelf $tmp
                if ($t.Ok -and $sha) {
                    $ok = $true
                    $verifiedBy = 'own test read (no manifest on the server)'
                    $e.WorldFiles = $t.Files
                } else {
                    Write-Log "MISMATCH: $($e.File) has no manifest entry and failed its own test: $($t.Message). The copy is deleted." 'ERROR'
                    try { [IO.File]::Delete($tmp) } catch { }
                    $mismatch = $true
                    $giveUp = $true
                }
            }
            if ($ok) {
                $rate = 0
                if ($copySecs -gt 0) { $rate = ($len / 1MB) / $copySecs }
                Write-Log ("verified {0}: {1}, sha256 {2} ({3}); copied in {4:n0} s at {5:n0} MiB/s, checked in {6:n0} s" -f $e.File, (Format-Bytes $len), $sha, $verifiedBy, $copySecs, $rate, ($sw.Elapsed.TotalSeconds - $copySecs))
            }
        }
        if ($interrupted) { break }
        if (-not $ok) {
            if ($mismatch) { Set-PullExit 4 }
            continue
        }
        try {
            [IO.File]::Move($tmp, $final)
            try { [IO.File]::SetLastWriteTimeUtc($final, $e.Created) } catch { }
        } catch {
            Write-Log "could not rename the verified copy to $($e.File): $($_.Exception.Message)" 'ERROR'
            Set-PullExit 1
            continue
        }
        $size = (New-Object IO.FileInfo($final)).Length
        $copies.Add([pscustomobject]@{ File = $e.File; Kind = $e.Kind; Size = [int64]$size; Sha256 = $sha; Created = $e.Created; WorldFiles = $e.WorldFiles; PulledUtc = (Format-Iso ([DateTime]::UtcNow)); VerifiedBy = $verifiedBy; Owned = $true })
        $pulled.Add($e.File)
        # Record ownership at once: a crash after this point must not orphan the zip.
        Save-State -Path $statePath -Copies $copies -Prev $state -Result 'pulling' -Note '' -ExitCode 0 -ServerNewest $serverNewest -Contact $true
    }

    # ---- keep the newest $Keep verified copies; prune only this script's own ------
    $ordered = @($copies | Sort-Object @{ Expression = { $_.Created }; Descending = $true }, @{ Expression = { $_.File }; Descending = $true })
    $kept = New-Object System.Collections.Generic.List[object]
    for ($i = 0; $i -lt $ordered.Count; $i++) {
        $c = $ordered[$i]
        if ($i -lt $Keep) { $kept.Add($c); continue }
        if (-not $c.Owned) {
            Write-Log "$($c.File) is older than the newest $Keep but was not copied by this script: left in the folder, no longer tracked"
            continue
        }
        $path = Join-Path $Destination $c.File
        $fi = New-Object IO.FileInfo($path)
        if ($c.File -notmatch $SafeNameRx -or -not $fi.Exists -or $fi.Length -ne $c.Size) {
            Write-Log "$($c.File) is due for pruning but is not as this script left it -- left alone, no longer tracked" 'WARN'
            continue
        }
        try {
            [IO.File]::Delete($path)
            Write-Log "pruned $($c.File) (older than the newest $Keep verified copies)"
        } catch {
            Write-Log "could not prune $($c.File): $($_.Exception.Message) -- will retry next run" 'WARN'
            $kept.Add($c)
        }
    }

    # ---- result -------------------------------------------------------------------
    $newestLocal = Get-Newest $kept
    $result = 'nothing-new'; $note = ''
    if ($script:PullExit -eq 4)     { $result = 'mismatch'; $note = 'a copy did not match the manifest -- read pull.log' }
    elseif ($script:PullExit -ne 0) { $result = 'failed';   $note = 'a pull failed -- read pull.log' }
    elseif ($interrupted)           { $result = 'interrupted'; $note = 'the server went away mid-copy' }
    elseif ($pulled.Count -gt 0)    { $result = 'pulled'; $note = ($pulled -join ', ') }
    if ($result -eq 'nothing-new') {
        $age = ''
        if ($null -ne $newestLocal) { $age = "; newest here is $($newestLocal.File), $(Format-Span (([DateTime]::UtcNow) - $newestLocal.Created).TotalSeconds) old" }
        $note = "$($kept.Count) verified cop$(if ($kept.Count -eq 1) {'y'} else {'ies'}) here"
        Write-Log "nothing new ($note$age)"
    } else {
        Write-Log "run finished: $result$(if ($note) { " ($note)" }); $($kept.Count) verified cop$(if ($kept.Count -eq 1) {'y'} else {'ies'}) here" $(if ($script:PullExit -ne 0) {'ERROR'} else {'INFO'})
    }
    Save-State -Path $statePath -Copies $kept -Prev $state -Result $result -Note $note -ExitCode $script:PullExit -ServerNewest $serverNewest -Contact $true
}
function Invoke-Pull {
    Assert-Destination
    $script:LogFile = Join-Path $Destination $LogName
    Write-Readme
    $lock = $null
    try {
        $lock = New-Object IO.FileStream((Join-Path $Destination $LockName), [IO.FileMode]::OpenOrCreate, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None, 1, [IO.FileOptions]::DeleteOnClose)
    } catch {
        $base = $_.Exception.GetBaseException()
        if (($base.HResult -band 0xFFFF) -eq 32) {      # ERROR_SHARING_VIOLATION
            Write-Log 'another pull is already running against this folder -- skipping this run'
            exit 0
        }
        Write-Log "cannot write to $Destination ($($base.Message))" 'ERROR'
        exit 1
    }
    try {
        Invoke-PullLocked
    } catch {
        Write-Log "UNEXPECTED ERROR: $($_.Exception.Message) @ $($_.InvocationInfo.ScriptLineNumber)" 'ERROR'
        if ($script:PullExit -eq 0) { $script:PullExit = 1 }
    }
    $lock.Dispose()
    exit $script:PullExit
}

# =============================================================================
# STATUS  (one line; exit 0 healthy, 3 needs attention)
# =============================================================================
function Show-Status {
    $now = [DateTime]::UtcNow
    $problems = New-Object System.Collections.Generic.List[string]
    $parts = New-Object System.Collections.Generic.List[string]

    $state = $null
    if (-not [IO.Directory]::Exists($Destination)) {
        $problems.Add("destination $Destination does not exist")
    } else {
        try { $state = Read-State (Join-Path $Destination $StateName) } catch { $problems.Add('pulled.json does not parse') }
    }

    # local
    $local = New-Object System.Collections.Generic.List[object]
    foreach ($c in (Get-StateCopies $state)) {
        $fi = New-Object IO.FileInfo((Join-Path $Destination $c.File))
        if ($fi.Exists -and $fi.Length -eq $c.Size) { $local.Add($c) } else { $problems.Add("$($c.File) is missing or resized") }
    }
    $newestLocal = Get-Newest $local
    if ($null -eq $newestLocal) {
        $parts.Add("local: none in $Destination")
    } else {
        $bytes = [double]0
        foreach ($c in $local) { $bytes += [double]$c.Size }
        $parts.Add(("local: {0}, {1} old ({2} kept, {3}, {4})" -f $newestLocal.File, (Format-Span ($now - $newestLocal.Created).TotalSeconds), $local.Count, (Format-Bytes $bytes), $Destination))
    }

    # server (live if it answers, else what the last pull saw)
    $serverNewest = $null
    $listing = Get-ServerListing -TimeoutMs 2000
    if ($listing.State -eq 'ok') {
        $serverNewest = Get-Newest $listing.Entries
        if ($null -eq $serverNewest) { $parts.Add('server: no backup listed') }
        else { $parts.Add(("server: {0}, {1} old" -f $serverNewest.File, (Format-Span ($now - $serverNewest.Created).TotalSeconds))) }
    } else {
        $seen = $null
        if ($null -ne $state -and $null -ne $state.server_newest) {
            $when = ConvertTo-UtcDate $state.server_newest.created_utc
            if ($null -ne $when) { $serverNewest = [pscustomobject]@{ File = [string]$state.server_newest.file; Created = $when }; $seen = $serverNewest }
        }
        $why = $listing.State
        if ($listing.State -eq 'denied') { $problems.Add('access to the share is denied') }
        if ($null -ne $seen) { $parts.Add(("server: {0} now (last seen: {1}, {2} old)" -f $why, $seen.File, (Format-Span ($now - $seen.Created).TotalSeconds))) }
        else { $parts.Add("server: $why now") }
    }
    if ($null -ne $serverNewest) {
        $behind = ($null -eq $newestLocal) -or ($newestLocal.Created -lt $serverNewest.Created)
        $serverAgeH = ($now - $serverNewest.Created).TotalHours
        if ($behind -and $serverAgeH -gt $BehindAfterH) {
            $problems.Add(("BEHIND: {0} has been on the server {1} and is not here" -f $serverNewest.File, (Format-Span ($serverAgeH * 3600))))
        }
    }

    # last pull
    if ($null -eq $state -or $null -eq $state.last_run) {
        $parts.Add('last pull: never')
        if ($problems.Count -eq 0 -and $null -eq $newestLocal) { $problems.Add('no pull has run yet') }
    } else {
        $at = ConvertTo-UtcDate $state.last_run.at_utc
        $res = [string]$state.last_run.result
        $note = [string]$state.last_run.note
        $when = '?'
        if ($null -ne $at) { $when = ("{0} ({1} ago)" -f $at.ToLocalTime().ToString('MM-dd HH:mm'), (Format-Span ($now - $at).TotalSeconds)) }
        $tail = $res
        if ($note -and $res -ne 'nothing-new') { $tail = "$res - $note" }
        $parts.Add("last pull: $when $tail")
        if ($res -eq 'mismatch' -or $res -eq 'failed' -or $res -eq 'denied') { $problems.Add("the last pull ended '$res' (read pull.log)") }
        $contact = ConvertTo-UtcDate $state.last_contact_utc
        if ($null -ne $contact -and ($now - $contact).TotalHours -gt $NoContactH) {
            $problems.Add(("no contact with the server's backups for {0}" -f (Format-Span ($now - $contact).TotalSeconds)))
        }
    }

    # task
    $t = Get-RegisteredTask
    if ($null -eq $t) {
        $parts.Add('task: NOT REGISTERED')
        $problems.Add('the Scheduled Task is not registered (run -Register)')
    } else {
        $next = ''
        try {
            $info = Get-ScheduledTaskInfo -TaskName $TaskName -ErrorAction Stop
            if ($info.NextRunTime) { $next = ", next $($info.NextRunTime.ToString('HH:mm'))" }
        } catch { }
        $parts.Add("task: $($t.State)$next")
        if ([string]$t.State -eq 'Disabled') { $problems.Add('the Scheduled Task is disabled') }
    }

    # a repo copy newer than the installed one?
    # (Compared without line endings: a checkout is CRLF or LF depending on git's settings.)
    if ($PSCommandPath -and [IO.File]::Exists($InstalledPath) -and ($PSCommandPath -ine $InstalledPath)) {
        try {
            $mine = [IO.File]::ReadAllText($PSCommandPath).Replace("`r", '')
            $theirs = [IO.File]::ReadAllText($InstalledPath).Replace("`r", '')
            if ($mine -cne $theirs) { $parts.Add('note: the installed script differs from this one (re-run -Register to update it)') }
        } catch { }
    }

    $head = '[OK]'; $color = 'Green'
    if ($problems.Count -gt 0) { $head = '[ATTENTION: ' + ($problems -join '; ') + ']'; $color = 'Red' }
    Write-Host ("{0} off-box world backups | {1}" -f $head, ($parts -join ' | ')) -ForegroundColor $color
    if ($problems.Count -gt 0) { exit 3 }
    exit 0
}

# =============================================================================
# VERIFY  (re-hash every local copy)
# =============================================================================
function Invoke-Verify {
    if (-not [IO.Directory]::Exists($Destination)) { Write-Host "[pull-server-backups] destination $Destination does not exist." -ForegroundColor Red; exit 2 }
    $script:LogFile = Join-Path $Destination $LogName
    $state = $null
    try { $state = Read-State (Join-Path $Destination $StateName) } catch { Write-Log "pulled.json does not parse: $($_.Exception.Message)" 'ERROR'; exit 2 }
    $copies = @(Get-StateCopies $state)
    if ($copies.Count -eq 0) { Write-Log 'verify: no tracked copy to check'; exit 0 }
    $bad = 0
    foreach ($c in $copies) {
        $path = Join-Path $Destination $c.File
        if (-not [IO.File]::Exists($path)) { Write-Log "verify: $($c.File) is MISSING" 'ERROR'; $bad++; continue }
        $sha = $null
        try { $sha = Get-Sha256 $path } catch { }
        if ($sha -eq $c.Sha256) { Write-Log "verify: $($c.File) matches ($(Format-Bytes $c.Size), sha256 $sha)" }
        else { Write-Log "verify: MISMATCH on $($c.File): now $sha, recorded $($c.Sha256). Do not restore from it." 'ERROR'; $bad++ }
    }
    if ($bad -gt 0) { exit 4 }
    exit 0
}

# =============================================================================
# REGISTER / UNREGISTER
# =============================================================================
function Invoke-Register {
    Assert-Destination
    $script:LogFile = Join-Path $Destination $LogName
    Write-Host "[pull-server-backups] destination: $Destination" -ForegroundColor Cyan
    Write-Host '    checked: not in a git working tree, not under a cloud-synced folder, not on the server.' -ForegroundColor DarkGray
    foreach ($r in (Get-CloudSyncRoots | Sort-Object Path -Unique)) { Write-Host "    ($($r.Name) is at $($r.Path); the destination is outside it)" -ForegroundColor DarkGray }
    $free = Get-FreeBytes $Destination
    if ($null -ne $free) { Write-Host "    free space on that disk: $(Format-Bytes $free) (each backup is about 1.2 GiB; $($Keep + 1) are on disk while one rotates)" -ForegroundColor DarkGray }

    # The task runs the copy beside the backups (see $InstalledName above for why).
    try {
        if ($PSCommandPath -ine $InstalledPath) { Copy-Item -LiteralPath $PSCommandPath -Destination $InstalledPath -Force -ErrorAction Stop }
    } catch {
        Write-Host "[pull-server-backups] cannot install the script to $InstalledPath : $($_.Exception.Message)" -ForegroundColor Red
        exit 2
    }
    Write-Readme

    $me  = [Security.Principal.WindowsIdentity]::GetCurrent().Name
    $ps  = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
    $con = Join-Path $env:SystemRoot 'System32\conhost.exe'
    $argLine = '--headless "{0}" -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "{1}" -Destination "{2}" -ServerBackups "{3}" -Keep {4} -MinFreeGB {5}' -f $ps, $InstalledPath, $Destination, $ServerBackups, $Keep, $MinFreeGB
    if ($ScheduledOnly) { $argLine += ' -ScheduledOnly' }
    try {
        $action    = New-ScheduledTaskAction -Execute $con -Argument $argLine
        # Anchored at 00:10 so the runs fall at fixed clock times whenever this is registered.
        $trigger   = New-ScheduledTaskTrigger -Once -At ((Get-Date).Date.AddMinutes(10)) -RepetitionInterval (New-TimeSpan -Hours $EveryHours)
        $settings  = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Hours 1)
        # Interactive = "run only when the user is logged on": the session's own network credentials, no stored password.
        $principal = New-ScheduledTaskPrincipal -UserId $me -LogonType Interactive -RunLevel Limited
        $task = New-ScheduledTask -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Description "Pulls the dedicated server's verified world backups to $Destination every $EveryHours h (off-box copy). Source of truth: .minecraft\dev\pull-server-backups.ps1 in the IridescentCraft repo. Status: run the installed script with -Status."
        Register-ScheduledTask -TaskName $TaskName -InputObject $task -Force -ErrorAction Stop | Out-Null
    } catch {
        Write-Host "[pull-server-backups] could not register the Scheduled Task: $($_.Exception.Message)" -ForegroundColor Red
        exit 2
    }
    Write-Log "registered the Scheduled Task '$TaskName' (every $EveryHours h, as $me, only while logged on; script $InstalledPath; keep $Keep$(if ($ScheduledOnly) {'; scheduled backups only'}))"

    if (-not $NoFirstRun) {
        Write-Host '[pull-server-backups] starting the task once (a first pull copies about 1.2 GiB per backup)...' -ForegroundColor Cyan
        $t0 = [DateTime]::UtcNow.AddSeconds(-2)
        try { Start-ScheduledTask -TaskName $TaskName -ErrorAction Stop } catch {
            Write-Host "[pull-server-backups] could not start the task: $($_.Exception.Message)" -ForegroundColor Red
            exit 2
        }
        # Proof is a finished run recorded in pulled.json by the TASK. Its state and
        # its "last result" prove nothing: the hidden-window host reports 0 even when
        # PowerShell could not find the script.
        $statePath = Join-Path $Destination $StateName
        $deadline = (Get-Date).AddMinutes(30)
        $recorded = $false; $idleSince = $null
        while ((Get-Date) -lt $deadline -and -not $recorded) {
            Start-Sleep -Seconds 2
            try {
                $s = Read-State $statePath
                if ($null -ne $s -and $null -ne $s.last_run) {
                    $at = ConvertTo-UtcDate $s.last_run.at_utc
                    if ($null -ne $at -and $at -ge $t0 -and [string]$s.last_run.result -ne 'pulling') { $recorded = $true }
                }
            } catch { }
            if ($recorded) { break }
            if ([string](Get-RegisteredTask).State -eq 'Running') { $idleSince = $null }
            elseif ($null -eq $idleSince) { $idleSince = Get-Date }
            elseif (((Get-Date) - $idleSince).TotalSeconds -gt 20) { break }
        }
        if (-not $recorded) {
            Write-Host "[pull-server-backups] THE TASK RAN BUT RECORDED NO PULL. It could not run $InstalledPath (is that folder visible outside this session? a packaged app's AppData is not), or the run died before its first log line. Start it by hand to see the error:" -ForegroundColor Red
            Write-Host "    powershell -NoProfile -ExecutionPolicy Bypass -File `"$InstalledPath`"" -ForegroundColor Yellow
            exit 1
        }
    }
    Show-Status
}
function Invoke-Unregister {
    $t = Get-RegisteredTask
    if ($null -eq $t) {
        Write-Host "[pull-server-backups] no Scheduled Task named '$TaskName'." -ForegroundColor Yellow
    } else {
        try { Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction Stop } catch {
            Write-Host "[pull-server-backups] could not remove the task: $($_.Exception.Message)" -ForegroundColor Red
            exit 2
        }
        Write-Host "[pull-server-backups] removed the Scheduled Task '$TaskName'." -ForegroundColor Green
    }
    if ([IO.File]::Exists($InstalledPath) -and ($PSCommandPath -ine $InstalledPath)) {
        try { [IO.File]::Delete($InstalledPath) } catch { }
    }
    Write-Host "    The backups in $Destination were not touched." -ForegroundColor DarkGray
    exit 0
}

switch ($PSCmdlet.ParameterSetName) {
    'Status'     { Show-Status }
    'Verify'     { Invoke-Verify }
    'Register'   { Invoke-Register }
    'Unregister' { Invoke-Unregister }
    default      { Invoke-Pull }
}
