# =============================================================================
# IridescentCraft Config Updater
# Downloads latest configs/kubejs/datapacks and updates existing instance.
# Does NOT touch mods — only game configuration files.
# =============================================================================

$ErrorActionPreference = "Continue"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

Write-Host ""
Write-Host "  ==========================================" -ForegroundColor Cyan
Write-Host "  IridescentCraft Config Updater" -ForegroundColor Cyan
Write-Host "  ==========================================" -ForegroundColor Cyan
Write-Host ""

# ── Step 1: Find the instance ──
Write-Host "  [1/3] Finding IridescentCraft instance..." -ForegroundColor Cyan

$instanceMods = ""
$instanceMC = ""

foreach ($dataDir in @("$env:APPDATA\PrismLauncher", "$env:LOCALAPPDATA\PrismLauncher")) {
    if (-not (Test-Path $dataDir)) { continue }
    $searchDirs = @($dataDir)
    if (Test-Path "$dataDir\instances") { $searchDirs += "$dataDir\instances" }

    foreach ($searchDir in $searchDirs) {
        $instances = Get-ChildItem $searchDir -Directory -ErrorAction SilentlyContinue | Where-Object { $_.Name -like "IridescentCraft*" }
        foreach ($inst in $instances) {
            if (Test-Path "$($inst.FullName)\.minecraft") {
                $instanceMC = "$($inst.FullName)\.minecraft"
                break
            }
        }
        if ($instanceMC) { break }
    }
    if ($instanceMC) { break }
}

if (-not $instanceMC) {
    Write-Host "    Could not find instance automatically." -ForegroundColor Yellow
    Write-Host "    In PrismLauncher: right-click instance -> Folder -> .minecraft" -ForegroundColor Yellow
    Write-Host ""
    $manualPath = Read-Host "    Paste the .minecraft path here"
    if ($manualPath -and (Test-Path $manualPath)) {
        $instanceMC = $manualPath
    } else {
        Write-Host "    Invalid path. Exiting." -ForegroundColor Red
        Read-Host "  Press Enter to exit"
        exit 1
    }
}

Write-Host "    Found: $instanceMC" -ForegroundColor Green
Write-Host ""

# ── Step 2: Download latest configs from GitHub ──
Write-Host "  [2/3] Downloading latest configs from GitHub..." -ForegroundColor Cyan
Write-Host ""

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$distDir = $scriptDir

# Check if we have local distribution files
if (-not (Test-Path "$distDir\config")) {
    $distDir = "$env:TEMP\IridescentCraft-update"
    $apiUrl = "https://api.github.com/repos/silvariasereneblossom/IridescentCraft/git/trees/main?recursive=1"

    try {
        $wc = New-Object System.Net.WebClient
        $wc.Headers.Add("User-Agent", "IridescentCraft-Updater")
        $treeJson = $wc.DownloadString($apiUrl)

        $prefix = "minecraft/distribution/client/"
        # Only download config, kubejs, defaultconfigs (not mods)
        # Datapacks are inside config/paxi/datapacks/ — no separate global_packs needed
        $configDirs = @('config/', 'kubejs/', 'defaultconfigs/')
        $files = @()

        foreach ($match in [regex]::Matches($treeJson, '"path"\s*:\s*"([^"]+)"')) {
            $path = $match.Groups[1].Value
            if ($path.StartsWith($prefix)) {
                $relPath = $path.Substring($prefix.Length)
                foreach ($dir in $configDirs) {
                    if ($relPath.StartsWith($dir)) {
                        $files += $relPath
                        break
                    }
                }
            }
        }

        Write-Host "    Found $($files.Count) config files to download."

        $dlCount = 0
        foreach ($file in $files) {
            $dlCount++
            $localPath = Join-Path $distDir $file
            $localDir = Split-Path $localPath -Parent
            if (-not (Test-Path $localDir)) { New-Item -ItemType Directory -Path $localDir -Force | Out-Null }
            $fileUrl = "https://raw.githubusercontent.com/silvariasereneblossom/IridescentCraft/main/$prefix$($file -replace '\\','/')"
            try { $wc.DownloadFile($fileUrl, $localPath) } catch {}
            if ($dlCount % 50 -eq 0) {
                Write-Host "    Downloaded $dlCount / $($files.Count)..." -ForegroundColor DarkGray
            }
        }
        $wc.Dispose()
        Write-Host "    [OK] Config files downloaded." -ForegroundColor Green
    } catch {
        Write-Host "    ERROR: $($_.Exception.Message)" -ForegroundColor Red
        Read-Host "  Press Enter to exit"
        exit 1
    }
}

Write-Host ""

# ── Step 3: Copy configs to instance ──
Write-Host "  [3/3] Updating instance configs..." -ForegroundColor Cyan

$updated = 0
foreach ($dir in @('config', 'defaultconfigs', 'kubejs')) {
    if (Test-Path "$distDir\$dir") {
        # Overlay copy — overwrite existing files, add new ones
        if (-not (Test-Path "$instanceMC\$dir")) {
            New-Item -ItemType Directory -Path "$instanceMC\$dir" -Force | Out-Null
        }
        Copy-Item "$distDir\$dir\*" "$instanceMC\$dir" -Recurse -Force -ErrorAction SilentlyContinue
        $count = (Get-ChildItem "$distDir\$dir" -Recurse -File -ErrorAction SilentlyContinue).Count
        Write-Host "    $dir ($count files)... OK"
        $updated += $count

        # Verify critical subdirectories
        if ($dir -eq 'config') {
            $paxiDP = Join-Path $instanceMC 'config\paxi\datapacks'
            $dpCount = (Get-ChildItem "$paxiDP\*.zip" -ErrorAction SilentlyContinue).Count
            if ($dpCount -gt 0) {
                Write-Host "      paxi datapacks: $dpCount zips" -ForegroundColor DarkGray
            } else {
                Write-Host "      WARNING: No Paxi datapacks found!" -ForegroundColor Red
                # Try copying specifically
                if (Test-Path "$distDir\config\paxi\datapacks") {
                    New-Item -ItemType Directory -Path $paxiDP -Force | Out-Null
                    Copy-Item "$distDir\config\paxi\datapacks\*" "$paxiDP\" -Force -ErrorAction SilentlyContinue
                    $dpCount = (Get-ChildItem "$paxiDP\*.zip" -ErrorAction SilentlyContinue).Count
                    Write-Host "      Retry: $dpCount zips copied" -ForegroundColor Yellow
                }
            }
        }
    }
}

# Cleanup temp download
if ($distDir -like "*TEMP*") { Remove-Item $distDir -Recurse -Force -ErrorAction SilentlyContinue }

Write-Host ""
Write-Host "  Updated $updated files." -ForegroundColor Green
Write-Host ""
Write-Host "  Restart the game to apply changes." -ForegroundColor Yellow
Write-Host ""
Read-Host "  Press Enter to exit"
