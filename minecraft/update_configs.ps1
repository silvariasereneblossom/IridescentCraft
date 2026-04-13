# =============================================================================
# IridescentCraft Config Updater
# Downloads latest configs/kubejs/datapacks and updates existing instance.
# Does NOT touch mods -- only game configuration files.
# =============================================================================

$ErrorActionPreference = "Continue"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

try {
    Add-Type -MemberDefinition '[DllImport("kernel32.dll")]public static extern bool SetConsoleMode(IntPtr h,int m);[DllImport("kernel32.dll")]public static extern IntPtr GetStdHandle(int h);' -Name W -Namespace C
    $h = [C.W]::GetStdHandle(-11); [C.W]::SetConsoleMode($h, 7) | Out-Null
    $B = "$([char]27)[38;2;91;206;250m"; $P = "$([char]27)[38;2;245;169;184m"; $W = "$([char]27)[38;2;255;255;255m"; $R = "$([char]27)[0m"
    [Console]::Write("${B}  ==========================================${R}`n")
    [Console]::Write("${P}  IridescentCraft Config Updater${R}`n")
    [Console]::Write("${W}  Forge 1.20.1-47.4.6  ~450 mods${R}`n")
    [Console]::Write("${P}  Iridescent Edition${R}`n")
    [Console]::Write("${B}  ==========================================${R}`n")
} catch {
    Write-Host "  =========================================="
    Write-Host "  IridescentCraft Config Updater"
    Write-Host "  Forge 1.20.1-47.4.6  ~450 mods"
    Write-Host "  =========================================="
}
Write-Host ""

# -- Step 1: Find the instance --
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

# -- Step 2: Download latest configs from GitHub --
Write-Host "  [2/3] Downloading latest configs from GitHub..." -ForegroundColor Cyan
Write-Host ""

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$distDir = $scriptDir

# Check if we have local distribution files
if (-not (Test-Path "$distDir\config")) {
    $distDir = "$env:TEMP\IridescentCraft-update"
    $repoZip = "$env:TEMP\IridescentCraft-update-repo.zip"
    $repoExtract = "$env:TEMP\IridescentCraft-update-extract"

    try {
        $wc = New-Object System.Net.WebClient
        Write-Host "    Downloading repository..."
        $wc.DownloadFile('https://github.com/silvariasereneblossom/IridescentCraft/archive/refs/heads/main.zip', $repoZip)
        $wc.Dispose()

        if (-not (Test-Path $repoZip) -or (Get-Item $repoZip).Length -lt 1000000) {
            throw "Download failed"
        }

        Write-Host "    Extracting configs..."
        if (Test-Path $repoExtract) { Remove-Item $repoExtract -Recurse -Force }
        Add-Type -AssemblyName System.IO.Compression.FileSystem
        [System.IO.Compression.ZipFile]::ExtractToDirectory($repoZip, $repoExtract)

        $subDir = (Get-ChildItem $repoExtract -Directory | Select-Object -First 1).FullName
        $srcDir = "$subDir\minecraft\distribution\client"

        if (Test-Path $distDir) { Remove-Item $distDir -Recurse -Force }
        New-Item -ItemType Directory -Path $distDir -Force | Out-Null

        # Copy only config dirs (not mods)
        foreach ($dir in @('config', 'defaultconfigs', 'kubejs')) {
            if (Test-Path "$srcDir\$dir") {
                Copy-Item "$srcDir\$dir" "$distDir\$dir" -Recurse -Force
            }
        }

        Remove-Item $repoZip -Force -ErrorAction SilentlyContinue
        Remove-Item $repoExtract -Recurse -Force -ErrorAction SilentlyContinue
        Write-Host "    [OK] Config files ready." -ForegroundColor Green
    } catch {
        Write-Host "    ERROR: $($_.Exception.Message)" -ForegroundColor Red
        Remove-Item $repoZip -Force -ErrorAction SilentlyContinue
        Remove-Item $repoExtract -Recurse -Force -ErrorAction SilentlyContinue
        Read-Host "  Press Enter to exit"
        exit 1
    }
}

Write-Host ""

# -- Step 3: Copy configs to instance --
Write-Host "  [3/3] Updating instance configs..." -ForegroundColor Cyan

$updated = 0
foreach ($dir in @('config', 'defaultconfigs', 'kubejs')) {
    if (Test-Path "$distDir\$dir") {
        # Overlay copy -- overwrite existing files, add new ones
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
