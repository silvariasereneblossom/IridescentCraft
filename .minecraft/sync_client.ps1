# =============================================================================
# IridescentCraft Client Sync - PrismLauncher pre-launch hook
# =============================================================================
# Keeps the local instance's configs/kubejs/datapacks/mods in sync with the
# GitHub main branch via a SHA-based check. Designed to run as PrismLauncher's
# per-instance pre-launch command.
#
# Behavior:
#   1. Find the instance .minecraft directory (prefers $env:INST_MC_DIR which
#      PrismLauncher provides automatically, falls back to detecting by script
#      location, then searching the PrismLauncher instances folder)
#   2. Query GitHub API for the latest main commit SHA
#   3. Compare against .icraft_last_sha in the instance root
#   4. If match: print "Up to date" and exit 0 (no download)
#   5. If mismatch or first run: download the repo zip, overlay non-runtime
#      files onto the instance, write the new SHA, invoke download_mods.ps1
#      to grab any new JARs (skips existing via filename check)
#
# Network failure handling: short timeouts on both the API call and zip
# download. On any failure, prints a warning and exits 0 so PrismLauncher
# still launches Minecraft - "continuing with existing files" is always
# safer than blocking play.
#
# Install as pre-launch command in PrismLauncher:
#   Instance → Settings → Custom Commands → Pre-launch command:
#   powershell -ExecutionPolicy Bypass -File "$INST_MC_DIR/sync_client.ps1"
# =============================================================================

$ErrorActionPreference = "Continue"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

# -- Step 1: Locate the instance .minecraft directory --
$instanceMC = $null

if ($env:INST_MC_DIR -and (Test-Path $env:INST_MC_DIR)) {
    $instanceMC = $env:INST_MC_DIR
} elseif ($PSScriptRoot -and (Test-Path (Join-Path $PSScriptRoot 'kubejs'))) {
    # Script lives inside the instance's .minecraft
    $instanceMC = $PSScriptRoot
} else {
    # Fallback: hunt for it in PrismLauncher instances
    foreach ($dataDir in @("$env:APPDATA\PrismLauncher", "$env:LOCALAPPDATA\PrismLauncher")) {
        if (-not (Test-Path $dataDir)) { continue }
        $searchDirs = @($dataDir)
        if (Test-Path "$dataDir\instances") { $searchDirs += "$dataDir\instances" }
        foreach ($searchDir in $searchDirs) {
            $found = Get-ChildItem $searchDir -Directory -ErrorAction SilentlyContinue |
                Where-Object { $_.Name -like "IridescentCraft*" -and (Test-Path "$($_.FullName)\.minecraft\kubejs") } |
                Select-Object -First 1
            if ($found) {
                $instanceMC = "$($found.FullName)\.minecraft"
                break
            }
        }
        if ($instanceMC) { break }
    }
}

if (-not $instanceMC) {
    Write-Host "[IridescentCraft Sync] Could not find instance directory. Skipping sync." -ForegroundColor Yellow
    exit 0
}

Write-Host "[IridescentCraft Sync] Instance: $instanceMC" -ForegroundColor DarkGray

# -- Step 2: Query GitHub API for latest commit SHA --
$apiUrl = 'https://api.github.com/repos/silvariasereneblossom/IridescentCraft/commits/main'
$shaFile = Join-Path $instanceMC '.icraft_last_sha'
$localSha = ''
if (Test-Path $shaFile) { $localSha = (Get-Content $shaFile -Raw).Trim() }

$remoteSha = $null
try {
    $headers = @{ 'User-Agent' = 'IridescentCraft-Client-Sync' }
    $resp = Invoke-RestMethod -Uri $apiUrl -Headers $headers -TimeoutSec 10
    $remoteSha = $resp.sha
} catch {
    Write-Host "[IridescentCraft Sync] GitHub API unreachable: $($_.Exception.Message)" -ForegroundColor Yellow
    Write-Host "[IridescentCraft Sync] Continuing with existing files..." -ForegroundColor Yellow
    exit 0
}

if ($remoteSha -eq $localSha) {
    Write-Host "[IridescentCraft Sync] Up to date (commit $($remoteSha.Substring(0,7)))." -ForegroundColor Green
    exit 0
}

# -- Step 3: Diff-based sync or full zip fallback --
$owner = 'silvariasereneblossom'
$repo = 'IridescentCraft'
$prefix = '.minecraft/'
$exclude = @('world', 'logs', 'crash-reports', 'backups', 'libraries', '.cache', 'TesterLogs', 'journeymap')
$overlayDirs = @('config', 'kubejs', 'global_packs', 'datapack_sources', 'defaultconfigs', 'patchouli_books', 'resourcepacks', 'shaderpacks')
$mirrorList = @()

$useDiff = $false
if ($localSha -and $localSha.Length -eq 40) {
    try {
        $compareUrl = "https://api.github.com/repos/$owner/$repo/compare/${localSha}...${remoteSha}"
        $compare = Invoke-RestMethod -Uri $compareUrl -Headers @{ 'User-Agent' = 'IridescentCraft-Client-Sync' } -TimeoutSec 30
        if ($compare.files -and $compare.files.Count -gt 0 -and $compare.files.Count -le 300) {
            $useDiff = $true
            Write-Host "[IridescentCraft Sync] $($compare.files.Count) files changed ($($localSha.Substring(0,7)) -> $($remoteSha.Substring(0,7)))" -ForegroundColor Cyan
        } elseif ($compare.files -and $compare.files.Count -gt 300) {
            Write-Host "[IridescentCraft Sync] $($compare.files.Count) files changed (>300) - full download." -ForegroundColor Yellow
        }
    } catch {
        Write-Host "[IridescentCraft Sync] Compare API failed - full download." -ForegroundColor Yellow
    }
}

if ($useDiff) {
    # -- Fast path: download only changed files --
    $rawBase = "https://raw.githubusercontent.com/$owner/$repo/$remoteSha"
    $synced = 0; $removed = 0

    foreach ($file in $compare.files) {
        if (-not $file.filename.StartsWith($prefix)) { continue }
        $relPath = $file.filename.Substring($prefix.Length)

        # Skip excluded dirs
        $skip = $false
        foreach ($ex in $exclude) {
            if ($relPath.StartsWith("$ex/")) { $skip = $true; break }
        }
        if ($skip) { continue }

        # Skip non-overlay paths (only sync dirs we care about + mods)
        $inOverlay = $false
        foreach ($dir in ($overlayDirs + @('mods'))) {
            if ($relPath.StartsWith("$dir/") -or $relPath -eq $dir) { $inOverlay = $true; break }
        }
        # Also allow top-level files like sync_client.ps1
        if (-not $inOverlay -and $relPath.Contains('/')) { continue }

        $target = Join-Path $instanceMC $relPath

        if ($file.status -eq 'removed') {
            if (Test-Path $target) { Remove-Item $target -Force -ErrorAction SilentlyContinue; $removed++ }
            continue
        }

        try {
            $targetDir = Split-Path $target -Parent
            if (-not (Test-Path $targetDir)) { New-Item -ItemType Directory -Path $targetDir -Force | Out-Null }
            Invoke-WebRequest -Uri "$rawBase/$($file.filename)" -OutFile $target -UseBasicParsing -TimeoutSec 30
            $synced++
        } catch {
            Write-Host "[IridescentCraft Sync]   [FAIL] $relPath" -ForegroundColor Red
        }
    }

    Set-Content -Path $shaFile -Value $remoteSha -NoNewline -Encoding ASCII
    $mirrorList += "$synced file(s) synced"
    if ($removed -gt 0) { $mirrorList += "$removed removed" }
    Write-Host "[IridescentCraft Sync] Diff sync complete: $($mirrorList -join ', ')" -ForegroundColor Green
} else {
    # -- Slow fallback: full zip download --
    if (-not $localSha) {
        Write-Host "[IridescentCraft Sync] First sync. Downloading $($remoteSha.Substring(0,7))..." -ForegroundColor Cyan
    } else {
        Write-Host "[IridescentCraft Sync] Downloading $($remoteSha.Substring(0,7))..." -ForegroundColor Cyan
    }

    $zipUrl = "https://github.com/$owner/$repo/archive/refs/heads/main.zip"
    $zipFile = Join-Path $env:TEMP 'IridescentCraft-client-sync.zip'
    $extractDir = Join-Path $env:TEMP 'IridescentCraft-client-sync-extract'

    try {
        Invoke-WebRequest -Uri $zipUrl -OutFile $zipFile -UseBasicParsing -TimeoutSec 120
        if (-not (Test-Path $zipFile) -or (Get-Item $zipFile).Length -lt 100000) {
            throw 'Download too small or failed'
        }

        if (Test-Path $extractDir) { Remove-Item $extractDir -Recurse -Force }
        Expand-Archive -Path $zipFile -DestinationPath $extractDir -Force

        $srcRoot = (Get-ChildItem $extractDir -Directory | Select-Object -First 1).FullName
        $src = Join-Path $srcRoot '.minecraft'
        if (-not (Test-Path $src)) { throw "Expected .minecraft/ folder not found in archive" }

        foreach ($dir in $overlayDirs) {
            $srcDir = Join-Path $src $dir
            if (Test-Path $srcDir) {
                Copy-Item -Path $srcDir -Destination $instanceMC -Recurse -Force
                $mirrorList += $dir
            }
        }

        # Custom mod JARs
        $srcMods = Join-Path $src 'mods'
        $destMods = Join-Path $instanceMC 'mods'
        if (Test-Path $srcMods) {
            Get-ChildItem $srcMods -Filter '*.jar' -ErrorAction SilentlyContinue | ForEach-Object {
                $target = Join-Path $destMods $_.Name
                if ((-not (Test-Path $target)) -or ((Get-Item $target).Length -ne $_.Length)) {
                    Copy-Item $_.FullName $target -Force
                    Write-Host "[IridescentCraft Sync]   Custom JAR: $($_.Name)" -ForegroundColor Yellow
                }
            }
        }

        # mods/.index
        $srcIndex = Join-Path $src 'mods\.index'
        $destIndex = Join-Path $instanceMC 'mods\.index'
        if (Test-Path $srcIndex) {
            if (-not (Test-Path $destIndex)) { New-Item -ItemType Directory -Path $destIndex -Force | Out-Null }
            Get-ChildItem "$destIndex\*.pw.toml" -ErrorAction SilentlyContinue | ForEach-Object {
                $srcFile = Join-Path $srcIndex $_.Name
                if (-not (Test-Path $srcFile)) { Remove-Item $_.FullName -Force }
            }
            Copy-Item -Path "$srcIndex\*" -Destination $destIndex -Recurse -Force
            $mirrorList += 'mods/.index'
        }

    # Selective top-level files (options.txt only if user hasn't customized)
    foreach ($topFile in @('pack.png', 'icon.png')) {
        $srcFile = Join-Path $src $topFile
        if (Test-Path $srcFile) {
            Copy-Item -Path $srcFile -Destination $instanceMC -Force
        }
    }

    Write-Host "[IridescentCraft Sync] Overlaid: $($mirrorList -join ', ')" -ForegroundColor DarkGray

    # Write new SHA
    Set-Content -Path $shaFile -Value $remoteSha -NoNewline -Encoding ASCII

    # Cleanup
    Remove-Item $zipFile -Force -ErrorAction SilentlyContinue
    Remove-Item $extractDir -Recurse -Force -ErrorAction SilentlyContinue

    Write-Host "[IridescentCraft Sync] Overlay complete." -ForegroundColor Green
} catch {
    Write-Host "[IridescentCraft Sync] Overlay failed: $($_.Exception.Message)" -ForegroundColor Yellow
    Write-Host "[IridescentCraft Sync] Continuing with existing files..." -ForegroundColor Yellow
    Remove-Item $zipFile -Force -ErrorAction SilentlyContinue
    Remove-Item $extractDir -Recurse -Force -ErrorAction SilentlyContinue
    exit 0
}

# -- Step 4: Download any new mod JARs --
# download_mods.ps1 is diff-aware - it skips JARs that already exist by filename,
# so this only hits the network for actually-new mods.
$downloadScript = Join-Path $instanceMC 'download_mods.ps1'
if (-not (Test-Path $downloadScript)) {
    # Downloaded fresh from the archive overlay
    $downloadScript = Join-Path $src 'distribution\client\download_mods.ps1'
}

if (Test-Path $downloadScript) {
    $modsDir = Join-Path $instanceMC 'mods'
    $indexDir = Join-Path $modsDir '.index'
    if ((Test-Path $indexDir) -and (Test-Path $modsDir)) {
        Write-Host "[IridescentCraft Sync] Checking for new mod JARs..." -ForegroundColor Cyan
        try {
            & $downloadScript -IndexDir $indexDir -ModsDir $modsDir 2>&1 | Where-Object {
                $_ -match 'Downloaded|Failed|^\s*\[' -or $_ -match '^\s{2}\S'
            } | Select-Object -First 50
        } catch {
            Write-Host "[IridescentCraft Sync] Mod download step failed (non-fatal): $($_.Exception.Message)" -ForegroundColor Yellow
        }
    }
}

# Ensure -noverify is set in instance.cfg (required for bytecode-patched JARs)
$instDir = if ($env:INST_DIR) { $env:INST_DIR } elseif ($instanceMC) { Split-Path $instanceMC -Parent } else { $null }
if ($instDir) {
    $cfgPath = Join-Path $instDir 'instance.cfg'
    if (Test-Path $cfgPath) {
        $cfg = Get-Content $cfgPath -Raw
        if ($cfg -notmatch 'JvmArgs=.*-noverify') {
            $cfg = $cfg -replace 'OverrideJavaArgs=false', 'OverrideJavaArgs=true'
            if ($cfg -match 'JvmArgs=(.*)') {
                $existing = $matches[1].Trim()
                if ($existing) {
                    $cfg = $cfg -replace "JvmArgs=.*", "JvmArgs=-noverify $existing"
                } else {
                    $cfg = $cfg -replace "JvmArgs=.*", "JvmArgs=-noverify"
                }
            } elseif ($cfg -notmatch 'JvmArgs=') {
                $cfg = $cfg -replace '(\[General\])', "`$1`nOverrideJavaArgs=true`nJvmArgs=-noverify"
            }
            Set-Content $cfgPath $cfg -NoNewline
            Write-Host "[IridescentCraft Sync] Added -noverify to JVM args (required for patched mods)" -ForegroundColor Yellow
        }
    }
}

Write-Host "[IridescentCraft Sync] Done - launching..." -ForegroundColor Green
exit 0
