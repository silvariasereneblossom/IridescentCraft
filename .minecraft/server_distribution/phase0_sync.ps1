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
