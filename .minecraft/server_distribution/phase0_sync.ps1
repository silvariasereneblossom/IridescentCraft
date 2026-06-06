# =============================================================================
# IridescentCraft Server - Phase 0 Diff-Based Sync
# =============================================================================
# Called by iridescentserver.bat on every launch. Compares the local SHA
# against the latest main commit on GitHub. If they differ:
#   - Uses the GitHub compare API to get the list of changed files
#   - Downloads only the changed files via raw.githubusercontent.com
#   - Handles deletions, self-update staging, and excluded paths
#   - Falls back to full zip download on first run or truncated diffs
#
# Typical sync: 3-10 files, 50-200KB, 5-10 seconds.
# Full zip fallback: 100-200MB, 10-15 minutes (first run only).
# =============================================================================

param(
    [string]$ServerDir = (Get-Location).Path
)

# Strip trailing backslash - %~dp0 includes one, which combined with
# the closing double-quote in the bat creates \" that PS interprets as
# a literal quote, corrupting the path.
$ServerDir = $ServerDir.TrimEnd('\', '/', '"')

$ErrorActionPreference = "Continue"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$owner = "silvariasereneblossom"
$repo = "IridescentCraft"
$branch = "main"
$prefix = ".minecraft/server_distribution/"
$headers = @{ 'User-Agent' = 'IridescentCraft-Server' }
$shaFile = Join-Path $ServerDir '.icraft_last_sha'
$exclude = @('world', 'logs', 'crash-reports', 'backups', 'libraries', '.cache')
$selfUpdateFiles = @('iridescentserver.bat', 'iridescentserver.sh', 'phase0_sync.ps1')

# =============================================================================
# Expected-state deletion/repair pass (shared logic; pasted verbatim into
# distribution/client/sync_client.ps1 - kept self-contained per distro root,
# NOT dot-sourced).
# =============================================================================
# The full-zip overlay above is NON-DELETING: it copies new/changed files over
# the live tree but never removes a file that was deleted in the repo. So repo
# deletions strand on consumers forever (proven 2026-06-06: 8 stale affixes
# aborted the live magic_weapon pool; packetfixer/tier_skip/probe lived on).
# This pass closes that gap using expected_state.json as the single source of
# authority for what SHOULD exist under the MANAGED ROOTS (kubejs, config,
# mods/.index). It runs AFTER the overlay and BEFORE the extract dir is removed
# (repairs source from the just-extracted copy).
#
# Behavior (post-overlay):
#   - on disk under a managed root but NOT in the manifest    -> DELETE
#   - in the manifest but MISSING on disk                     -> repair (copy
#                                                                from extract)
#   - in the manifest, hash MISMATCH, not volatile            -> repair
#                                                                (overwrite from
#                                                                extract; a
#                                                                mismatch right
#                                                                after an overlay
#                                                                means a local
#                                                                write failure /
#                                                                lock - log it)
#   - in the manifest, hash MISMATCH, "volatile":true         -> KEEP LOCAL (the
#                                                                mod rewrites this
#                                                                config at runtime)
#
# FAIL-KEEP: manifest missing/unparseable/empty -> delete NOTHING, warn loudly.
# DRY-RUN: defaults to dry-run in this first shipped version (report-only). Flip
# $ExpectedStateDryRun to $false (or set env ICRAFT_EXPECTED_STATE_DRY=0) to go
# live, AFTER the operator compares the report to the 2026-06-06 census.
#
# PS 5.1 compatible: no ternary, no null-coalescing; ConvertFrom-Json iterated
# via .PSObject.Properties (no -AsHashtable). Get-FileHash is 5.1-OK.
# =============================================================================

# DRY-RUN default for this first shipped version. Going live = flip to $false
# (or pass ICRAFT_EXPECTED_STATE_DRY=0 in the environment).
$ExpectedStateDryRun = $true

# Volatile runtime DIRS under managed roots: present only at runtime on a
# consumer, never authored in the repo (so never in the manifest). The delete
# pass MUST NOT touch them even though they are absent from the manifest. Keep
# in lockstep with $VolatileDirs in generate_expected_state.ps1.
$ExpectedStateVolatileDirs = @('kubejs/exported', 'kubejs/logs', 'kubejs/libraries', 'kubejs/.cache')
$ExpectedStateCacheDirName = '.cache'

function Invoke-ExpectedStatePass {
    param(
        [string]$DestRoot,    # live distro root on disk (deletions/repairs land here)
        [string]$ExtractSrc,  # freshly-extracted distro root (repair source); '' if gone
        [string]$LogPrefix    # prepended to every log line
    )

    # Honor ICRAFT_EXPECTED_STATE_DRY=1 in addition to the in-script default.
    $dry = $ExpectedStateDryRun
    if ($env:ICRAFT_EXPECTED_STATE_DRY -eq '1') { $dry = $true }
    if ($env:ICRAFT_EXPECTED_STATE_DRY -eq '0') { $dry = $false }

    if ($dry) {
        Write-Host "$LogPrefix [expected-state] DRY-RUN mode (report-only). To go live: set `$ExpectedStateDryRun=`$false in this script (or ICRAFT_EXPECTED_STATE_DRY=0)." -ForegroundColor Yellow
    } else {
        Write-Host "$LogPrefix [expected-state] LIVE mode (deletions/repairs WILL be applied)." -ForegroundColor Yellow
    }

    $manifestPath = Join-Path $DestRoot 'expected_state.json'
    if (-not (Test-Path $manifestPath)) {
        Write-Host "$LogPrefix [expected-state] manifest missing - skipping deletion pass" -ForegroundColor Yellow
        return
    }

    $manifest = $null
    try {
        $raw = Get-Content -Raw $manifestPath
        if (-not $raw -or $raw.Trim().Length -eq 0) { throw 'empty manifest' }
        $manifest = $raw | ConvertFrom-Json
    } catch {
        Write-Host "$LogPrefix [expected-state] manifest unparseable ($($_.Exception.Message)) - skipping deletion pass" -ForegroundColor Yellow
        return
    }
    if (-not $manifest -or -not $manifest.files -or -not $manifest.roots) {
        Write-Host "$LogPrefix [expected-state] manifest empty/malformed (no files/roots) - skipping deletion pass" -ForegroundColor Yellow
        return
    }

    # Build a lookup of expected relpaths -> entry. ConvertFrom-Json gives a
    # PSCustomObject; iterate .PSObject.Properties (5.1 has no -AsHashtable).
    $expected = @{}
    foreach ($prop in $manifest.files.PSObject.Properties) {
        $expected[$prop.Name] = $prop.Value
    }

    $managedRoots = @()
    foreach ($r in $manifest.roots) { $managedRoots += [string]$r }

    $isVolatileDir = {
        param([string]$rel)
        foreach ($v in $ExpectedStateVolatileDirs) {
            if ($rel -eq $v -or $rel.StartsWith("$v/")) { return $true }
        }
        foreach ($seg in ($rel -split '/')) {
            if ($seg -eq $ExpectedStateCacheDirName) { return $true }
        }
        return $false
    }

    $toDelete = New-Object System.Collections.Generic.List[string]
    $toRepair = New-Object System.Collections.Generic.List[string]
    $keptVolatile = 0
    $fetchNeeded = 0

    # -- Pass 1: walk the live managed roots, find on-disk files NOT in manifest --
    foreach ($root in $managedRoots) {
        $rootFsRel = $root -replace '/', '\'
        $rootPath = Join-Path $DestRoot $rootFsRel
        if (-not (Test-Path $rootPath)) { continue }
        $base = (Resolve-Path $DestRoot).Path
        Get-ChildItem -LiteralPath $rootPath -Recurse -File -Force -ErrorAction SilentlyContinue | ForEach-Object {
            $rel = $_.FullName.Substring($base.Length + 1) -replace '\\', '/'
            if (& $isVolatileDir $rel) { return }       # never delete runtime dirs
            if (-not $expected.ContainsKey($rel)) {
                $toDelete.Add($rel) | Out-Null
            }
        }
    }

    # -- Pass 2: walk the manifest, find missing-on-disk + hash-mismatch --
    foreach ($rel in $expected.Keys) {
        $entry = $expected[$rel]
        $relFs = $rel -replace '/', '\'
        $target = Join-Path $DestRoot $relFs
        $isVol = $false
        if ($entry.PSObject.Properties.Name -contains 'volatile') { $isVol = [bool]$entry.volatile }

        if (-not (Test-Path $target)) {
            $toRepair.Add($rel) | Out-Null
            continue
        }
        $localHash = (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLower()
        if ($localHash -ne ([string]$entry.sha256).ToLower()) {
            if ($isVol) {
                # Mod rewrites this config in place at runtime - the divergence is
                # expected. KEEP the local copy; do NOT overwrite from the zip.
                $keptVolatile++
            } else {
                $toRepair.Add($rel) | Out-Null
            }
        }
    }

    # -- Apply deletions --
    foreach ($rel in $toDelete) {
        $relFs = $rel -replace '/', '\'
        $target = Join-Path $DestRoot $relFs
        if ($dry) {
            Write-Host "$LogPrefix [expected-state]   would-delete $rel" -ForegroundColor DarkYellow
        } else {
            Remove-Item -LiteralPath $target -Force -ErrorAction SilentlyContinue
            Write-Host "$LogPrefix [expected-state]   deleted $rel" -ForegroundColor Yellow
        }
    }

    # -- Apply repairs (source from the just-extracted copy) --
    foreach ($rel in $toRepair) {
        $relFs = $rel -replace '/', '\'
        $target = Join-Path $DestRoot $relFs
        $srcFile = ''
        if ($ExtractSrc) { $srcFile = Join-Path $ExtractSrc $relFs }
        if ($dry) {
            Write-Host "$LogPrefix [expected-state]   would-repair $rel" -ForegroundColor DarkYellow
        } else {
            if ($srcFile -and (Test-Path $srcFile)) {
                $targetDir = Split-Path $target -Parent
                if (-not (Test-Path $targetDir)) { New-Item -ItemType Directory -Path $targetDir -Force | Out-Null }
                Copy-Item -LiteralPath $srcFile -Destination $target -Force -ErrorAction SilentlyContinue
                Write-Host "$LogPrefix [expected-state]   repaired $rel" -ForegroundColor Yellow
            } else {
                $fetchNeeded++
                Write-Host "$LogPrefix [expected-state]   fetch-needed $rel (not in extract; re-run sync)" -ForegroundColor Red
            }
        }
    }

    $verb = 'deleted'
    $verb2 = 'repaired'
    if ($dry) { $verb = 'would-delete'; $verb2 = 'would-repair' }
    $summary = "$LogPrefix expected-state: ${verb} $($toDelete.Count), ${verb2} $($toRepair.Count)"
    if ($keptVolatile -gt 0) { $summary += ", kept-volatile $keptVolatile" }
    if ($fetchNeeded -gt 0) { $summary += ", fetch-needed $fetchNeeded" }
    Write-Host $summary -ForegroundColor Green
}

# -- Step 1: Get remote SHA --
$localSha = ''
if (Test-Path $shaFile) { $localSha = (Get-Content $shaFile -Raw).Trim() }

$remoteSha = $null
try {
    $resp = Invoke-RestMethod -Uri "https://api.github.com/repos/$owner/$repo/commits/$branch" -Headers $headers -TimeoutSec 15
    $remoteSha = $resp.sha
} catch {
    Write-Host "  [WARN] GitHub API unreachable: $($_.Exception.Message)" -ForegroundColor Yellow
    Write-Host "  Continuing with existing files..." -ForegroundColor Yellow
    exit 0
}

if ($remoteSha -eq $localSha) {
    Write-Host "  [OK] Up to date (commit $($remoteSha.Substring(0,7)))." -ForegroundColor Green
    exit 0
}

# -- Step 2: Decide between diff sync and full zip --
$useDiff = $false
if ($localSha -and $localSha.Length -eq 40) {
    try {
        $compareUrl = "https://api.github.com/repos/$owner/$repo/compare/${localSha}...${remoteSha}"
        $compare = Invoke-RestMethod -Uri $compareUrl -Headers $headers -TimeoutSec 30

        # GitHub's compare API caps the .files array at 300. If we're AT the
        # cap, the response is silently truncated and we MUST fall back to
        # full-zip or we'll silently miss files (the bug that left the 2026-04-17
        # config changes stale on the server for days).
        if ($compare.files -and $compare.files.Count -gt 0 -and $compare.files.Count -lt 300) {
            $useDiff = $true
            $changedFiles = $compare.files
            Write-Host "  New commit: $($remoteSha.Substring(0,7)) (was $($localSha.Substring(0,7))). $($changedFiles.Count) files changed." -ForegroundColor Cyan
        } elseif ($compare.files -and $compare.files.Count -ge 300) {
            Write-Host "  $($compare.files.Count) files changed (API caps at 300 = truncated) - falling back to full download." -ForegroundColor Yellow
        } else {
            Write-Host "  Compare returned no files - falling back to full download." -ForegroundColor Yellow
        }
    } catch {
        Write-Host "  Compare API failed ($($_.Exception.Message)) - falling back to full download." -ForegroundColor Yellow
    }
}

if (-not $useDiff) {
    if (-not $localSha) {
        Write-Host "  First run. Downloading full repository..." -ForegroundColor Cyan
    }
}

# -- Step 3A: Diff-based sync (fast path) --
if ($useDiff) {
    $rawBase = "https://raw.githubusercontent.com/$owner/$repo/$remoteSha"
    $synced = 0; $removed = 0; $skipped = 0; $staged = 0; $errors = 0

    foreach ($file in $changedFiles) {
        $path = $file.filename

        # Only process files under our prefix
        if (-not $path.StartsWith($prefix)) { $skipped++; continue }
        $relPath = $path.Substring($prefix.Length)

        # Skip excluded directories
        $skip = $false
        foreach ($ex in $exclude) {
            if ($relPath.StartsWith("$ex/") -or $relPath -eq $ex) { $skip = $true; break }
        }
        if ($skip) { $skipped++; continue }

        $target = Join-Path $ServerDir $relPath

        # Handle deletions
        if ($file.status -eq 'removed') {
            if (Test-Path $target) {
                Remove-Item $target -Force -ErrorAction SilentlyContinue
                $removed++
            }
            continue
        }

        # Handle self-update files (stage as .new)
        if ($selfUpdateFiles -contains $relPath) {
            $stageTarget = "$target.new"
            try {
                $targetDir = Split-Path $stageTarget -Parent
                if (-not (Test-Path $targetDir)) { New-Item -ItemType Directory -Path $targetDir -Force | Out-Null }
                Invoke-WebRequest -Uri "$rawBase/$path" -OutFile $stageTarget -UseBasicParsing -TimeoutSec 30
                $staged++
                Write-Host "    [staged] $relPath" -ForegroundColor Cyan
            } catch {
                Write-Host "    [FAIL] $relPath : $($_.Exception.Message)" -ForegroundColor Red
                $errors++
            }
            continue
        }

        # Download changed/added file
        try {
            $targetDir = Split-Path $target -Parent
            if (-not (Test-Path $targetDir)) { New-Item -ItemType Directory -Path $targetDir -Force | Out-Null }
            # Crash-safe write: download to a sidecar .icrafttmp first, then
            # atomically replace the live file once the download is fully on
            # disk. Invoke-WebRequest -OutFile truncates its target as the
            # response stream opens, so writing straight to $target would leave
            # a partial/empty file if the download is interrupted (network drop,
            # crash, kill) - destroying the only copy. Writing to a temp and
            # Move-Item -Force'ing into place (a rename on the same volume) means
            # the existing file is only removed once a complete replacement exists.
            $tmpTarget = "$target.icrafttmp"
            Remove-Item $tmpTarget -Force -ErrorAction SilentlyContinue
            Invoke-WebRequest -Uri "$rawBase/$path" -OutFile $tmpTarget -UseBasicParsing -TimeoutSec 30
            Move-Item -Path $tmpTarget -Destination $target -Force
            $synced++
        } catch {
            Remove-Item "$target.icrafttmp" -Force -ErrorAction SilentlyContinue
            Write-Host "    [FAIL] $relPath : $($_.Exception.Message)" -ForegroundColor Red
            $errors++
        }
    }

    # Only write SHA if EVERY file downloaded successfully. If any failed,
    # leaving .icraft_last_sha unchanged forces the next run to retry the
    # same diff (or fall back to full-zip if >= 300 files).
    if ($errors -eq 0) {
        $remoteSha | Out-File -FilePath $shaFile -Encoding ASCII -NoNewline
    } else {
        Write-Host "  [WARN] $errors file(s) failed to download - NOT writing SHA marker. Next run will retry." -ForegroundColor Yellow
    }

    $summary = "  [OK] Synced $synced file(s)"
    if ($removed -gt 0) { $summary += ", removed $removed" }
    if ($staged -gt 0) { $summary += ", staged $staged self-update(s)" }
    if ($errors -gt 0) { $summary += ", $errors error(s)" }
    Write-Host $summary -ForegroundColor Green
    exit 0
}

# -- Step 3B: Full zip download (slow fallback) --
$zipUrl = "https://github.com/$owner/$repo/archive/refs/heads/$branch.zip"
$zipFile = Join-Path $env:TEMP 'IridescentCraft-server-update.zip'
$extractDir = Join-Path $env:TEMP 'IridescentCraft-server-update'

try {
    Write-Host "  Downloading full repository zip..." -ForegroundColor Yellow
    Invoke-WebRequest -Uri $zipUrl -OutFile $zipFile -UseBasicParsing -TimeoutSec 120
    if (-not (Test-Path $zipFile) -or (Get-Item $zipFile).Length -lt 100000) { throw 'Download too small or failed' }

    Write-Host "  Extracting..."
    if (Test-Path $extractDir) { Remove-Item $extractDir -Recurse -Force }
    Expand-Archive -Path $zipFile -DestinationPath $extractDir -Force

    $src = (Get-ChildItem $extractDir -Directory | Select-Object -First 1).FullName + "\.minecraft\server_distribution"
    $dest = $ServerDir

    Write-Host "  Syncing configs, scripts, datapacks..."
    foreach ($item in Get-ChildItem $src) {
        if ($item.PSIsContainer -and $exclude -contains $item.Name) { continue }
        if ($item.Name -eq 'mods') {
            if (-not (Test-Path "$dest\mods\.index")) { New-Item -ItemType Directory -Path "$dest\mods\.index" -Force | Out-Null }
            # Mirror .index: copy new/changed, DELETE stale pw.toml files
            Copy-Item "$($item.FullName)\.index\*" "$dest\mods\.index" -Recurse -Force
            Get-ChildItem "$dest\mods\.index" -Filter '*.pw.toml' -ErrorAction SilentlyContinue | ForEach-Object {
                $srcToml = Join-Path "$($item.FullName)\.index" $_.Name
                if (-not (Test-Path $srcToml)) {
                    Remove-Item $_.FullName -Force
                    Write-Host "    [cleanup] Removed stale: $($_.Name)" -ForegroundColor Yellow
                }
            }
            Get-ChildItem $item.FullName -Filter '*.jar' | ForEach-Object {
                $jarSrc = $_.FullName
                $jarDst = Join-Path "$dest\mods" $_.Name
                # Crash-safe replace with retry. AV (Defender) sometimes locks
                # bytecode-patched jars (ars_nouveau, Patchouli) momentarily
                # during scan. PermissionDenied here was crashing the whole
                # sync mid-run. Copy to a sidecar .icrafttmp then atomically
                # rename over the live JAR: Copy-Item -Force truncates the
                # destination as it opens it, so a copy interrupted mid-write
                # would leave a truncated JAR while the only intact copy is the
                # extract dir we delete during cleanup. Staging + Move-Item
                # -Force means the existing JAR survives until a complete
                # replacement is on disk.
                $copied = $false
                for ($attempt = 1; $attempt -le 3 -and -not $copied; $attempt++) {
                    try {
                        $jarTmp = "$jarDst.icrafttmp"
                        Remove-Item $jarTmp -Force -ErrorAction SilentlyContinue
                        Copy-Item $jarSrc $jarTmp -Force -ErrorAction Stop
                        Move-Item -Path $jarTmp -Destination $jarDst -Force -ErrorAction Stop
                        $copied = $true
                    } catch {
                        Remove-Item "$jarDst.icrafttmp" -Force -ErrorAction SilentlyContinue
                        if ($attempt -lt 3) {
                            Start-Sleep -Milliseconds 500
                        } else {
                            Write-Host "    [WARN] Could not write $($_.Name): $($_.Exception.Message)" -ForegroundColor Yellow
                            Write-Host "    [HINT] Whitelist the server folder in Windows Defender if this persists." -ForegroundColor Yellow
                        }
                    }
                }
            }
        } elseif ($selfUpdateFiles -contains $item.Name) {
            $current = Join-Path $dest $item.Name
            $srcHash = (Get-FileHash $item.FullName -Algorithm SHA1).Hash
            $destHash = if (Test-Path $current) { (Get-FileHash $current -Algorithm SHA1).Hash } else { '' }
            if ($srcHash -ne $destHash) {
                Copy-Item $item.FullName "$current.new" -Force
                Write-Host "    [staged] $($item.Name)" -ForegroundColor Cyan
            }
        } else {
            # Use robocopy for directories to guarantee overwriting existing
            # files reliably (PowerShell 5.1's Copy-Item -Recurse -Force has
            # quirks with pre-existing directory trees). Robocopy exit codes
            # 0-7 are success; 8+ is error.
            if ($item.PSIsContainer) {
                $destSubdir = Join-Path $dest $item.Name
                if (-not (Test-Path $destSubdir)) { New-Item -ItemType Directory -Path $destSubdir -Force | Out-Null }
                & robocopy $item.FullName $destSubdir /E /NFL /NDL /NJH /NJS /R:2 /W:2 | Out-Null
                if ($LASTEXITCODE -gt 7) {
                    throw "robocopy failed for $($item.Name) -> $destSubdir (exit $LASTEXITCODE)"
                }
                Write-Host "    [robocopy] $($item.Name)" -ForegroundColor Green
            } else {
                Copy-Item $item.FullName $dest -Force
                Write-Host "    [copy]     $($item.Name)" -ForegroundColor Green
            }
        }
    }

    # Verify paxi datapacks
    $paxiSrc = Join-Path $src 'config\paxi\datapacks'
    $paxiDest = Join-Path $dest 'config\paxi\datapacks'
    if ((Test-Path $paxiSrc) -and (Test-Path $paxiDest)) {
        Get-ChildItem $paxiSrc -Filter '*.zip' | ForEach-Object {
            $target = Join-Path $paxiDest $_.Name
            if ((-not (Test-Path $target)) -or ((Get-Item $target).Length -ne $_.Length)) {
                # Crash-safe replace: stage to a sidecar .icrafttmp then
                # atomically rename over the live datapack zip. Copy-Item -Force
                # truncates the destination as it opens it, so an interrupted
                # copy would leave a truncated zip while the only intact copy is
                # the extract dir we delete during cleanup.
                $zipTmp = "$target.icrafttmp"
                Remove-Item $zipTmp -Force -ErrorAction SilentlyContinue
                Copy-Item $_.FullName $zipTmp -Force
                Move-Item -Path $zipTmp -Destination $target -Force
                Write-Host "    [sync] $($_.Name)" -ForegroundColor Yellow
            }
        }
        $paxiOrder = Join-Path $src 'config\paxi\datapack_load_order.json'
        if (Test-Path $paxiOrder) { Copy-Item $paxiOrder (Join-Path $dest 'config\paxi\datapack_load_order.json') -Force }
    }

    # Verify custom mod JARs
    $modsSrc = Join-Path $src 'mods'
    if (Test-Path $modsSrc) {
        Get-ChildItem $modsSrc -Filter '*.jar' | ForEach-Object {
            $target = Join-Path "$dest\mods" $_.Name
            if ((-not (Test-Path $target)) -or ((Get-Item $target).Length -ne $_.Length)) {
                # Crash-safe replace: stage to a sidecar .icrafttmp then
                # atomically rename over the live JAR (see the mods/.index
                # block above for the rationale).
                $jarTmp = "$target.icrafttmp"
                Remove-Item $jarTmp -Force -ErrorAction SilentlyContinue
                Copy-Item $_.FullName $jarTmp -Force
                Move-Item -Path $jarTmp -Destination $target -Force
                Write-Host "    [sync] $($_.Name)" -ForegroundColor Yellow
            }
        }
    }

    # Expected-state deletion/repair pass: runs AFTER the non-deleting overlay
    # and BEFORE the extract dir is removed (repairs source from $src). Closes
    # the strand-on-delete gap. Dry-run by default in this first shipped version.
    Invoke-ExpectedStatePass -DestRoot $dest -ExtractSrc $src -LogPrefix '  '

    $remoteSha | Out-File -FilePath $shaFile -Encoding ASCII -NoNewline
    Remove-Item $zipFile -Force -ErrorAction SilentlyContinue
    Remove-Item $extractDir -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host "  [OK] Full sync to $($remoteSha.Substring(0,7))." -ForegroundColor Green
} catch {
    Write-Host "  [WARN] Full sync failed: $($_.Exception.Message)" -ForegroundColor Yellow
    Write-Host "  Continuing with existing files..." -ForegroundColor Yellow
    Remove-Item $zipFile -Force -ErrorAction SilentlyContinue
    Remove-Item $extractDir -Recurse -Force -ErrorAction SilentlyContinue
}
