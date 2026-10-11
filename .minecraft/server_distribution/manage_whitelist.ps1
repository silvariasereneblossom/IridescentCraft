# =============================================================================
# manage_whitelist.ps1 - add / remove / list / check whitelist entries on an
# OFFLINE-MODE server (online-mode=false)
# =============================================================================
# Why this exists: on an offline-mode server the console command
# `whitelist add <name>` does NOT produce an entry that lets the player in.
#
#   - A player who joins an offline-mode server gets the OFFLINE UUID of the
#     exact name the client sends: a version-3 UUID of "OfflinePlayer:<name>"
#     (case matters). The whitelist is checked by that UUID, not by the name.
#   - `whitelist add <name>` asks Mojang for the name first, even in offline
#     mode. Every paid account is found, so the entry gets the ACCOUNT's UUID.
#     It never matches, and the player is told
#         "You are not white-listed on this server!"
#   - For a name Mojang does not know, the command computes the offline UUID
#     from the LOWERCASED name, which only matches an all-lowercase name.
#   - The command only works for a player still in usercache.json, i.e. one
#     who joined this server within the last month.
#   (Read from the 1.20.1 server's GameProfileCache.get / lookupGameProfile,
#   ServerLoginPacketListenerImpl.createFakeProfile and UserWhiteList.)
#
# So on an offline-mode server the entry is written here, with the UUID the
# player will really have. In ONLINE mode (online-mode=true) this script
# refuses to add: there `whitelist add <name>` is the right tool, and an
# offline UUID would be the wrong one.
#
# Usage (on the server, from this folder; or from another PC with -ServerRoot):
#   .\manage_whitelist.ps1 -List
#   .\manage_whitelist.ps1 -Add ExactName              # the in-game name, capitals included
#   .\manage_whitelist.ps1 -Add NameOne,NameTwo
#   .\manage_whitelist.ps1 -Remove ExactName
#   .\manage_whitelist.ps1 -Check                      # every entry's UUID against its name
#   .\manage_whitelist.ps1 -SelfTest                   # the UUID arithmetic, against a known value
#   ... -ServerRoot "Z:\Users\<user>\Desktop\IridescentCraft Dedicated Server"
#
# A change takes effect when the server next reads the file: type
#   whitelist reload
# in the launcher's console box, or wait for the next restart. Nothing here
# talks to the running server.
#
# whitelist.json is this server's own file: it is not in the pack repository
# and no sync writes or deletes it. Never commit one.
#
# Exit codes: 0 done / nothing to do; 1 refused, or -Check found a bad entry;
#             2 setup error (no server there, unreadable file).
# Windows PowerShell 5.1 and pwsh 7. ASCII only.
# =============================================================================

[CmdletBinding()]
param(
    [string[]]$Add,
    [string[]]$Remove,
    [switch]$List,
    [switch]$Check,
    [switch]$SelfTest,
    [string]$ServerRoot
)

$ErrorActionPreference = 'Stop'
# Default: the folder this script is in. ($PSScriptRoot is still empty while
# Windows PowerShell 5.1 binds parameter defaults under -File.)
if (-not $ServerRoot) { $ServerRoot = $PSScriptRoot }
if (-not $ServerRoot) { $ServerRoot = Split-Path -Parent $MyInvocation.MyCommand.Path }
# `powershell -File ... -Add One,Two` arrives as ONE string: split it here.
$Add    = @($Add    | ForEach-Object { "$_" -split ',' } | ForEach-Object { $_.Trim() } | Where-Object { $_ })
$Remove = @($Remove | ForEach-Object { "$_" -split ',' } | ForEach-Object { $_.Trim() } | Where-Object { $_ })

# The UUID an offline-mode server gives a player of this exact name:
# java.util.UUID.nameUUIDFromBytes(("OfflinePlayer:" + name).getBytes(UTF_8)).
function Get-OfflineUuid {
    param([Parameter(Mandatory = $true)][string]$Name)
    $md5 = [System.Security.Cryptography.MD5]::Create()
    try {
        $h = $md5.ComputeHash([System.Text.Encoding]::UTF8.GetBytes("OfflinePlayer:$Name"))
    } finally {
        $md5.Dispose()
    }
    $h[6] = ($h[6] -band 0x0f) -bor 0x30      # version 3
    $h[8] = ($h[8] -band 0x3f) -bor 0x80      # IETF variant
    $hex = -join ($h | ForEach-Object { $_.ToString('x2') })
    return ('{0}-{1}-{2}-{3}-{4}' -f $hex.Substring(0, 8), $hex.Substring(8, 4), $hex.Substring(12, 4), $hex.Substring(16, 4), $hex.Substring(20, 12))
}

if ($SelfTest) {
    # "Notch" is the textbook example; its offline UUID is published widely.
    $want = 'b50ad385-829d-3141-a216-7e7d7539ba7f'
    $got = Get-OfflineUuid 'Notch'
    if ($got -ne $want) {
        Write-Host "[whitelist] SELF-TEST FAILED: offline UUID of Notch = $got, expected $want" -ForegroundColor Red
        exit 1
    }
    if ((Get-OfflineUuid 'notch') -eq $want) {
        Write-Host "[whitelist] SELF-TEST FAILED: the UUID ignores capitals" -ForegroundColor Red
        exit 1
    }
    Write-Host "[whitelist] self-test ok: offline UUID of Notch = $got; capitals change it." -ForegroundColor Green
    exit 0
}

if (-not ($Add -or $Remove -or $List -or $Check)) {
    Write-Host "Usage: manage_whitelist.ps1 -List | -Check | -Add <Name>[,<Name>] | -Remove <Name>[,<Name>]  [-ServerRoot <folder>]"
    Write-Host "       Read the header of this file for why the console's 'whitelist add' is not used on an offline-mode server."
    exit 1
}

# --- the server ---------------------------------------------------------------
$propsPath = Join-Path $ServerRoot 'server.properties'
if (-not (Test-Path -LiteralPath $propsPath -PathType Leaf)) {
    Write-Host "[whitelist] no server.properties in $ServerRoot : not a server folder (use -ServerRoot)." -ForegroundColor Red
    exit 2
}
$props = @{}
foreach ($line in (Get-Content -LiteralPath $propsPath)) {
    if ($line -match '^\s*#' -or $line -notmatch '=') { continue }
    $kv = $line -split '=', 2
    $props[$kv[0].Trim()] = $kv[1].Trim()
}
$levelName = 'world'
if ($props.ContainsKey('level-name') -and $props['level-name']) { $levelName = $props['level-name'] }
# A pack checkout has a server.properties too. Writing a real whitelist there
# would put player names one `git add` away from a public repository.
if (-not (Test-Path -LiteralPath (Join-Path $ServerRoot $levelName) -PathType Container)) {
    Write-Host "[whitelist] $ServerRoot has no '$levelName' folder: this is not a server that has run (a pack checkout?). Nothing was read or written." -ForegroundColor Red
    Write-Host "            On a new server, start it once first. From another PC, pass -ServerRoot." -ForegroundColor Red
    exit 2
}
$online   = ($props['online-mode'] -eq 'true')
$listOn   = ($props['white-list'] -eq 'true')
$enforced = ($props['enforce-whitelist'] -eq 'true')

# --- the file -----------------------------------------------------------------
$path = Join-Path $ServerRoot 'whitelist.json'
$entries = New-Object System.Collections.Generic.List[object]
if (Test-Path -LiteralPath $path -PathType Leaf) {
    try {
        $raw = [System.IO.File]::ReadAllText($path, [System.Text.Encoding]::UTF8)
        $raw = $raw.TrimStart([char]0xFEFF)
        if ($raw.Trim()) {
            # Two steps: Windows PowerShell 5.1 hands a JSON array down the
            # pipeline as ONE object, and @() around the pipeline would keep it so.
            $parsed = $raw | ConvertFrom-Json
            foreach ($e in @($parsed)) {
                if ($null -eq $e) { continue }
                $entries.Add([pscustomobject]@{ uuid = [string]$e.uuid; name = [string]$e.name }) | Out-Null
            }
        }
    } catch {
        Write-Host "[whitelist] whitelist.json does not parse: $($_.Exception.Message)" -ForegroundColor Red
        Write-Host "            Nothing was changed. Repair or remove the file first." -ForegroundColor Red
        exit 2
    }
}

function Write-Posture {
    $mode = 'OFFLINE (names are not authenticated: anyone who knows a listed name can use it)'
    if ($online) { $mode = 'online (accounts are authenticated)' }
    $state = 'OFF: the entries below have NO effect, anyone may join'
    $color = 'Red'
    if ($listOn) { $state = 'on'; $color = 'Green' }
    Write-Host ("[whitelist] {0}" -f $ServerRoot) -ForegroundColor DarkGray
    Write-Host ("[whitelist] white-list is {0}; enforce-whitelist={1}; online-mode: {2}" -f $state, $enforced.ToString().ToLower(), $mode) -ForegroundColor $color
}

function Format-Json {
    param($Items)
    if ($Items.Count -eq 0) { return "[]`n" }
    $esc = { param([string]$s) $s.Replace('\', '\\').Replace('"', '\"') }
    $blocks = foreach ($e in $Items) {
        "  {`n    `"uuid`": `"$(& $esc $e.uuid)`",`n    `"name`": `"$(& $esc $e.name)`"`n  }"
    }
    return "[`n" + ($blocks -join ",`n") + "`n]`n"
}

function Save-Whitelist {
    $tmp = "$path.icrafttmp"
    $text = Format-Json $entries
    [System.IO.File]::WriteAllText($tmp, $text, (New-Object System.Text.UTF8Encoding $false))
    if (Test-Path -LiteralPath $path) {
        Copy-Item -LiteralPath $path -Destination "$path.bak" -Force
    }
    Move-Item -LiteralPath $tmp -Destination $path -Force
}

$bad = 0
$changed = $false

# --- -Add ---------------------------------------------------------------------
if ($Add) {
    if ($online) {
        Write-Host "[whitelist] REFUSED: this server has online-mode=true. Type  whitelist add <name>  in the launcher's console box instead:" -ForegroundColor Red
        Write-Host "            there the entry must carry the account's UUID, and an offline UUID would lock the player out." -ForegroundColor Red
        exit 1
    }
    foreach ($name in $Add) {
        $name = "$name".Trim()
        if ($name -notmatch '^[A-Za-z0-9_]{3,16}$') {
            Write-Host "[whitelist] REFUSED '$name': a Minecraft name is 3 to 16 letters, digits or underscores." -ForegroundColor Red
            $bad++; continue
        }
        $uuid = Get-OfflineUuid $name
        $same = @($entries | Where-Object { $_.name -ceq $name })
        $caseOnly = @($entries | Where-Object { $_.name -ieq $name -and $_.name -cne $name })
        if ($caseOnly.Count -gt 0) {
            Write-Host "[whitelist] REFUSED '$name': '$($caseOnly[0].name)' is already listed and differs only in capitals." -ForegroundColor Red
            Write-Host "            Capitals matter here (they change the UUID). If the listed one is a typo, -Remove it first." -ForegroundColor Red
            $bad++; continue
        }
        if ($same.Count -gt 0 -and $same[0].uuid -eq $uuid) {
            Write-Host "[whitelist] $name is already listed ($uuid)." -ForegroundColor DarkGray
            continue
        }
        if ($same.Count -gt 0) {
            Write-Host "[whitelist] $name was listed with $($same[0].uuid), which is not the UUID an offline-mode server gives that name (an entry made by 'whitelist add'?). Replaced." -ForegroundColor Yellow
            foreach ($old in $same) { $entries.Remove($old) | Out-Null }
        }
        $entries.Add([pscustomobject]@{ uuid = $uuid; name = $name }) | Out-Null
        $changed = $true
        Write-Host "[whitelist] added $name ($uuid)" -ForegroundColor Green
    }
}

# --- -Remove ------------------------------------------------------------------
if ($Remove) {
    foreach ($name in $Remove) {
        $name = "$name".Trim()
        $hit = @($entries | Where-Object { $_.name -ceq $name })
        if ($hit.Count -eq 0) {
            $near = @($entries | Where-Object { $_.name -ieq $name })
            if ($near.Count -gt 0) {
                Write-Host "[whitelist] '$name' is not listed; '$($near[0].name)' is. Capitals matter: repeat with that spelling." -ForegroundColor Red
            } else {
                Write-Host "[whitelist] '$name' is not listed." -ForegroundColor Red
            }
            $bad++; continue
        }
        foreach ($old in $hit) { $entries.Remove($old) | Out-Null }
        $changed = $true
        Write-Host "[whitelist] removed $name" -ForegroundColor Green
    }
}

if ($changed) {
    try {
        Save-Whitelist
    } catch {
        Write-Host "[whitelist] whitelist.json could NOT be written: $($_.Exception.Message)" -ForegroundColor Red
        exit 2
    }
    Write-Host ("[whitelist] whitelist.json written: {0} entr{1} (the previous file is whitelist.json.bak)." -f $entries.Count, $(if ($entries.Count -eq 1) { 'y' } else { 'ies' })) -ForegroundColor Green
    Write-Host "[whitelist] NOT ACTIVE YET: type  whitelist reload  in the launcher's console box, or wait for the next restart." -ForegroundColor Yellow
    if ($Remove -and -not $enforced) {
        Write-Host "[whitelist] enforce-whitelist is false: a removed player who is online now stays until they leave." -ForegroundColor Yellow
    }
    if (-not $listOn) {
        Write-Host "[whitelist] WARNING: white-list is OFF in server.properties, so the list has no effect at all." -ForegroundColor Red
    }
}

# --- -List / -Check -----------------------------------------------------------
if ($List -or $Check) {
    Write-Posture
    if ($entries.Count -eq 0) {
        $note = 'whitelist.json has no entries.'
        if ($listOn) { $note += ' With white-list on, NOBODY can join (operators excepted).' }
        Write-Host "[whitelist] $note" -ForegroundColor Yellow
    }
    $seen = @{}
    foreach ($e in $entries) {
        $verdict = 'ok'
        $color = 'Gray'
        if (-not $online) {
            if ($e.uuid -ne (Get-OfflineUuid $e.name)) {
                $verdict = "WRONG UUID for offline mode: this player is refused. Made by 'whitelist add'? Fix: -Add " + $e.name
                $color = 'Red'
                $bad++
            }
        } else {
            $verdict = 'not checked (online mode: the UUID is the account''s)'
        }
        $key = $e.name.ToLowerInvariant()
        if ($seen.ContainsKey($key)) {
            $verdict += '; DUPLICATE name'
            $color = 'Red'
            $bad++
        }
        $seen[$key] = $true
        Write-Host ("  {0,-16} {1}  {2}" -f $e.name, $e.uuid, $verdict) -ForegroundColor $color
    }
    Write-Host ("[whitelist] {0} entr{1}." -f $entries.Count, $(if ($entries.Count -eq 1) { 'y' } else { 'ies' }))
}

if ($bad -gt 0) { exit 1 }
exit 0
