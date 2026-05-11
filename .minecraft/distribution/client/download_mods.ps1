# =============================================================================
# IridescentCraft Client Mod Downloader (v2)
# =============================================================================
# Called from prism_prelaunch.bat / sync_client.ps1 after git pull or zip
# overlay. Diff-syncs mods/ against mods/.index/*.pw.toml -- downloads new
# entries, removes old versions of the same mod.
#
# v2 (2026-05-11) mirrors the server-side update_mods.ps1 hardening
# (which mirrors icraft-core/src/mods.rs). The v1 client downloader was
# missing four critical robustness features that caused silent failures
# on newly-added CurseForge mods (dans-magic, simple-staves):
#
#   1. User-Agent header on every request. edge.forgecdn.net now 403s
#      unauthenticated requests with no UA -- the failure landed in
#      download_log.txt but the bat caller never saw it.
#   2. Fallback URL: when the CDN fails, retry via the curseforge.com
#      api/v1 download endpoint (slower but auth-less).
#   3. Filename percent-encoding in the CDN URL path.
#   4. Non-zero exit code on any failure so the caller can surface it.
#
# Plus: old-version removal by base-name match (when packwiz bumps a
# mod, the new filename is downloaded and the old one cleaned up so we
# don't accumulate dupes).
#
# Side filtering: skips side = 'server' entries (server-only mods).
# =============================================================================

param(
    [string]$IndexDir,
    [string]$ModsDir
)

$ErrorActionPreference = 'Continue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$UserAgent = 'Mozilla/5.0 IridescentCraft-Updater'
$MinBytes  = 1000
$logFile = Join-Path (Split-Path $IndexDir -Parent) 'download_log.txt'
"=== IridescentCraft client mod sync: $(Get-Date) ===" | Out-File $logFile

function Log-Both {
    param([string]$Msg, [string]$Color = 'Gray')
    Write-Host "  $Msg" -ForegroundColor $Color
    $Msg | Out-File $logFile -Append
}

# Force-skip substring list -- mods that should never end up in mods/
# even when present in .pw.toml. Mirror of FORCE_SKIP in mods.rs but
# scoped to the FTB suite migration (kept client-side too in case any
# stale .pw.toml entries linger).
$forceSkip = @(
    'ftbbackups', 'ftbchunks', 'ftbessentials', 'ftblibrary',
    'ftbquests', 'ftbranks', 'ftbteams', 'ftbultimine',
    'mca-social'
)

function Test-ForceSkip([string]$name) {
    foreach ($p in $forceSkip) {
        if ($name -like "*$p*") { return $true }
    }
    return $false
}

# Strip a 'mod-1.2.3.jar' filename to its base name 'mod' so we can
# detect old versions of the same mod when packwiz bumps the version.
# Mirrors mods.rs::strip_version and update_mods.ps1's regex.
function Strip-Version([string]$filename) {
    $stem = $filename -replace '\.jar$', ''
    return ($stem -replace '-[\d\.]+.*$', '')
}

# Try one URL with retries. Returns $true on success (file at $Dest,
# size >= $MinBytes), $false otherwise. Uses WebClient with explicit
# User-Agent header -- the v1 omission of this header is what caused
# the silent 403 failures from edge.forgecdn.net.
function Try-DownloadUrl {
    param([string]$Url, [string]$Dest, [int]$Attempts = 2)
    for ($i = 1; $i -le $Attempts; $i++) {
        try {
            $wc = New-Object System.Net.WebClient
            $wc.Headers.Add('User-Agent', $UserAgent)
            $wc.DownloadFile($Url, $Dest)
            $wc.Dispose()
            if ((Test-Path $Dest) -and (Get-Item $Dest).Length -ge $MinBytes) {
                return $true
            }
            if (Test-Path $Dest) { Remove-Item $Dest -Force -ErrorAction SilentlyContinue }
        } catch {
            "  attempt $i error: $($_.Exception.Message)" | Out-File $logFile -Append
            if (Test-Path $Dest) { Remove-Item $Dest -Force -ErrorAction SilentlyContinue }
            if ($i -lt $Attempts) { Start-Sleep -Seconds 1 }
        }
    }
    return $false
}

# ---- Phase 1: parse .pw.toml index ----------------------------------
Write-Host ''
Log-Both '[1/3] Reading mod index...' Cyan
$tomlFiles = Get-ChildItem "$IndexDir\*.pw.toml" -ErrorAction SilentlyContinue
Log-Both "  Found $($tomlFiles.Count) .pw.toml files."

# Map filename -> ordered list of candidate URLs.
$expectedMods = @{}
$quotePattern = "['" + '"]'

foreach ($toml in $tomlFiles) {
    $filename=''; $side='both'; $mode=''; $url=''; $projId=''; $fileId=''
    foreach ($line in (Get-Content $toml.FullName)) {
        $l = $line.Trim()
        if ($l -match "^filename\s*=\s*$quotePattern(.+)$quotePattern") { $filename = $matches[1] }
        if ($l -match "^side\s*=\s*$quotePattern(.+)$quotePattern")     { $side     = $matches[1] }
        if ($l -match "^mode\s*=\s*$quotePattern(.+)$quotePattern")     { $mode     = $matches[1] }
        if ($l -match "^url\s*=\s*$quotePattern(.+)$quotePattern")      { $url      = $matches[1] }
        if ($l -match '^project-id\s*=\s*(\d+)')                       { $projId   = $matches[1] }
        if ($l -match '^file-id\s*=\s*(\d+)')                          { $fileId   = $matches[1] }
    }
    if (-not $filename) { continue }
    if ($side -eq 'server') { continue }
    if (Test-ForceSkip $filename) { continue }

    # Build candidate URLs in priority order. edge.forgecdn.net is the
    # CDN (fast, no auth); curseforge.com/api/v1 is the fallback (slower
    # but tolerates more headers).
    $urls = @()
    if ($mode -eq 'url' -and $url) {
        $urls += $url
    } elseif ($mode -eq 'metadata:curseforge' -and $fileId) {
        $part1 = $fileId.Substring(0, [Math]::Min(4, $fileId.Length))
        $part2 = $fileId.Substring(4).TrimStart('0')
        if (-not $part2) { $part2 = '0' }
        $encName = [System.Uri]::EscapeDataString($filename)
        $urls += "https://edge.forgecdn.net/files/$part1/$part2/$encName"
        if ($projId) {
            $urls += "https://www.curseforge.com/api/v1/mods/$projId/files/$fileId/download"
        }
    }

    $expectedMods[$filename] = $urls
}
Log-Both "  $($expectedMods.Count) client-side mods expected."

# ---- Phase 2: diff against on-disk jars -----------------------------
Log-Both '[2/3] Checking installed mods...' Cyan
$existingJars  = @(Get-ChildItem "$ModsDir\*.jar" -ErrorAction SilentlyContinue)
$existingNames = @{}
foreach ($j in $existingJars) { $existingNames[$j.Name] = $true }

$toDownload = @()
$toRemove   = @()
$upToDate   = 0

foreach ($exp in $expectedMods.Keys) {
    if ($existingNames.ContainsKey($exp)) { $upToDate++; continue }
    $toDownload += $exp
    $base = Strip-Version $exp
    if ($base.Length -gt 3) {
        foreach ($j in $existingJars) {
            $existBase = Strip-Version $j.Name
            if ($existBase -eq $base -and $j.Name -ne $exp) {
                if ($toRemove -notcontains $j.Name) { $toRemove += $j.Name }
            }
        }
    }
}

Log-Both "  Up to date: $upToDate"
Log-Both "  To download: $($toDownload.Count)"
Log-Both "  Old versions to remove: $($toRemove.Count)"

if ($toDownload.Count -eq 0 -and $toRemove.Count -eq 0) {
    Log-Both '[OK] All mods are up to date.' Green
    exit 0
}

# ---- Phase 3: apply -------------------------------------------------
Log-Both '[3/3] Applying updates...' Cyan

foreach ($old in $toRemove) {
    $p = Join-Path $ModsDir $old
    if (Test-Path -LiteralPath $p) {
        Remove-Item -LiteralPath $p -Force
        Log-Both "  REMOVED: $old" Yellow
    }
}

$dlOk = 0; $dlFail = 0; $failedNames = @()
$counter = 0; $total = $toDownload.Count
foreach ($mod in $toDownload) {
    $counter++
    $urls = $expectedMods[$mod]
    $pct = [Math]::Round(($counter / [Math]::Max(1,$total)) * 100)

    if (-not $urls -or $urls.Count -eq 0) {
        Log-Both "  [$pct%] SKIP (no URL): $mod" DarkYellow
        $dlFail++; $failedNames += "$mod (no URL)"
        continue
    }

    $dest = Join-Path $ModsDir $mod
    $tempFile = Join-Path $ModsDir "_dl_$counter.tmp"
    $success = $false
    $usedUrl = ''

    foreach ($u in $urls) {
        if (Try-DownloadUrl -Url $u -Dest $tempFile -Attempts 2) {
            try {
                Move-Item -LiteralPath $tempFile -Destination $dest -Force
                $success = $true
                $usedUrl = $u
                break
            } catch {
                "  move failed: $($_.Exception.Message)" | Out-File $logFile -Append
                if (Test-Path $tempFile) { Remove-Item $tempFile -Force -ErrorAction SilentlyContinue }
            }
        }
    }

    if ($success) {
        $hostPart = ($usedUrl -replace '^https?://', '') -split '/' | Select-Object -First 1
        Log-Both "  [$pct%] OK: $mod (via $hostPart)" Green
        $dlOk++
    } else {
        Log-Both "  [$pct%] FAILED: $mod" Red
        "  URLs tried for $mod`:" | Out-File $logFile -Append
        foreach ($u in $urls) { "    $u" | Out-File $logFile -Append }
        $dlFail++; $failedNames += $mod
    }
}

Write-Host ''
Log-Both "Summary: downloaded=$dlOk, removed=$($toRemove.Count), failed=$dlFail" Cyan

if ($dlFail -gt 0) {
    Log-Both "$dlFail download(s) failed. See $logFile" Red
    foreach ($fn in $failedNames) { Log-Both "  - $fn" DarkRed }
    exit 1
}
exit 0
