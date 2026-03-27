# =============================================================================
# IridescentCraft Client Installer v6
# =============================================================================
# Fully self-contained — downloads all mods directly, no mrpack import.
# Creates the PrismLauncher instance with everything ready to launch.
# =============================================================================

$ErrorActionPreference = "Continue"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

# ── Banner ──
try {
    Add-Type -MemberDefinition '[DllImport("kernel32.dll")]public static extern bool SetConsoleMode(IntPtr h,int m);[DllImport("kernel32.dll")]public static extern IntPtr GetStdHandle(int h);' -Name W -Namespace C
    $h = [C.W]::GetStdHandle(-11); [C.W]::SetConsoleMode($h, 7) | Out-Null
    $B = "`e[38;2;91;206;250m"; $P = "`e[38;2;245;169;184m"; $W = "`e[38;2;255;255;255m"; $R = "`e[0m"
    [Console]::Write("${B}  ==========================================${R}`n")
    [Console]::Write("${P}  IridescentCraft Client Installer${R}`n")
    [Console]::Write("${W}  Forge 1.20.1-47.4.6  ~450 mods${R}`n")
    [Console]::Write("${P}  Iridescent Edition${R}`n")
    [Console]::Write("${B}  ==========================================${R}`n")
} catch {
    Write-Host "  =========================================="
    Write-Host "  IridescentCraft Client Installer"
    Write-Host "  Forge 1.20.1-47.4.6  ~450 mods"
    Write-Host "  =========================================="
}
Write-Host ""

# ── Phase 1: Get distribution files ──
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$distDir = $scriptDir

if (-not (Test-Path "$distDir\mods\.index")) {
    Write-Host "  [1/5] Downloading distribution from GitHub..." -ForegroundColor Cyan
    Write-Host ""

    $distDir = "$env:TEMP\IridescentCraft-dist"
    $apiUrl = "https://api.github.com/repos/silvariasereneblossom/IridescentCraft/git/trees/main?recursive=1"

    try {
        $wc = New-Object System.Net.WebClient
        $wc.Headers.Add("User-Agent", "IridescentCraft-Installer")
        Write-Host "    Fetching file listing..."
        $treeJson = $wc.DownloadString($apiUrl)

        $prefix = "minecraft/distribution/client/"
        $files = @()
        foreach ($match in [regex]::Matches($treeJson, '"path"\s*:\s*"([^"]+)"')) {
            $path = $match.Groups[1].Value
            if ($path.StartsWith($prefix) -and -not $path.EndsWith('/')) {
                $files += $path.Substring($prefix.Length)
            }
        }

        Write-Host "    Found $($files.Count) files to download."
        if ($files.Count -lt 10) { throw "Too few files found" }

        $dlCount = 0
        foreach ($file in $files) {
            $dlCount++
            $localPath = Join-Path $distDir $file
            $localDir = Split-Path $localPath -Parent
            if (-not (Test-Path $localDir)) { New-Item -ItemType Directory -Path $localDir -Force | Out-Null }
            $fileUrl = "https://raw.githubusercontent.com/silvariasereneblossom/IridescentCraft/main/$prefix$($file -replace '\\','/')"
            try { $wc.DownloadFile($fileUrl, $localPath) } catch {}
            if ($dlCount % 50 -eq 0) {
                $pct = [math]::Round(($dlCount / $files.Count) * 100)
                Write-Host "    [$pct%] $dlCount / $($files.Count)..." -ForegroundColor DarkGray
            }
        }
        $wc.Dispose()
        Write-Host "    [OK] Distribution ready." -ForegroundColor Green
    } catch {
        Write-Host "  ERROR: $($_.Exception.Message)" -ForegroundColor Red
        Read-Host "  Press Enter to exit"
        exit 1
    }
} else {
    Write-Host "  [1/5] Using local distribution files." -ForegroundColor Green
}
Write-Host ""

# ── Phase 2: Find or create PrismLauncher data directory ──
Write-Host "  [2/5] Locating PrismLauncher..." -ForegroundColor Cyan

# Find PrismLauncher and its data directory
$prismExe = $null
$prismDataDir = $null

$searchPaths = @(
    "$env:LOCALAPPDATA\Programs\PrismLauncher\prismlauncher.exe",
    "$env:ProgramFiles\PrismLauncher\prismlauncher.exe",
    "${env:ProgramFiles(x86)}\PrismLauncher\prismlauncher.exe",
    "$env:LOCALAPPDATA\PrismLauncher\prismlauncher.exe",
    "$env:APPDATA\PrismLauncher\prismlauncher.exe"
)
foreach ($p in $searchPaths) {
    if (Test-Path $p) { $prismExe = $p; break }
}
if (-not $prismExe) {
    $found = Get-Command prismlauncher.exe -ErrorAction SilentlyContinue
    if ($found) { $prismExe = $found.Source }
}
if (-not $prismExe) {
    $found = Get-ChildItem -Path $env:LOCALAPPDATA, $env:APPDATA, $env:USERPROFILE -Filter 'prismlauncher.exe' -Recurse -Depth 4 -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($found) { $prismExe = $found.FullName }
}

# Determine data directory
foreach ($candidate in @("$env:APPDATA\PrismLauncher", "$env:LOCALAPPDATA\PrismLauncher")) {
    if (Test-Path "$candidate\instances") { $prismDataDir = $candidate; break }
}
# Check portable (next to exe)
if (-not $prismDataDir -and $prismExe) {
    $exeDir = Split-Path $prismExe -Parent
    if (Test-Path "$exeDir\instances") { $prismDataDir = $exeDir }
}

if (-not $prismDataDir) {
    # Default to AppData\Roaming (most common)
    $prismDataDir = "$env:APPDATA\PrismLauncher"
}

if (-not $prismExe) {
    Write-Host "    PrismLauncher not found. Downloading..." -ForegroundColor Yellow
    try {
        $prismDir = "$env:LOCALAPPDATA\PrismLauncher"
        $prismZip = "$env:TEMP\PrismLauncher-Portable.zip"
        New-Item -ItemType Directory -Path $prismDir -Force | Out-Null
        $release = Invoke-RestMethod -Uri 'https://api.github.com/repos/PrismLauncher/PrismLauncher/releases/latest' -UseBasicParsing
        $asset = $release.assets | Where-Object { $_.name -match 'Windows-MSVC-Portable.*\.zip$' -and $_.name -notmatch 'arm' } | Select-Object -First 1
        if ($asset) {
            Write-Host "    Downloading: $($asset.name)"
            Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $prismZip -UseBasicParsing
            Expand-Archive -Path $prismZip -DestinationPath $prismDir -Force
            Remove-Item $prismZip -Force -ErrorAction SilentlyContinue
            $found = Get-ChildItem -Path $prismDir -Filter 'prismlauncher.exe' -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
            if ($found) { $prismExe = $found.FullName; $prismDataDir = $prismDir }
            Write-Host "    [OK] PrismLauncher installed." -ForegroundColor Green
        }
    } catch {
        Write-Host "    WARNING: $($_.Exception.Message)" -ForegroundColor Yellow
    }
}

$instancesDir = "$prismDataDir\instances"
New-Item -ItemType Directory -Path $instancesDir -Force | Out-Null
Write-Host "    PrismLauncher data: $prismDataDir" -ForegroundColor DarkGray
Write-Host "    Instances: $instancesDir" -ForegroundColor DarkGray
Write-Host ""

# ── Phase 3: Create instance ──
Write-Host "  [3/5] Creating IridescentCraft instance..." -ForegroundColor Cyan

$instanceDir = "$instancesDir\IridescentCraft"
$mcDir = "$instanceDir\.minecraft"
$modsDir = "$mcDir\mods"

New-Item -ItemType Directory -Path $modsDir -Force | Out-Null

# instance.cfg
@"
[General]
ConfigVersion=1.3
InstanceType=OneSix
MCLaunchMethod=LauncherPart
OverrideMemory=true
MaxMemAlloc=10240
MinMemAlloc=4096
iconKey=default
name=IridescentCraft
"@ | Set-Content "$instanceDir\instance.cfg" -Encoding UTF8

# mmc-pack.json
@"
{
    "components": [
        {"cachedName":"Minecraft","cachedVersion":"1.20.1","important":true,"uid":"net.minecraft","version":"1.20.1"},
        {"cachedName":"Forge","cachedVersion":"47.4.6","uid":"net.minecraftforge","version":"47.4.6"}
    ],
    "formatVersion": 1
}
"@ | Set-Content "$instanceDir\mmc-pack.json" -Encoding UTF8

# instgroups.json
if (-not (Test-Path "$instancesDir\instgroups.json")) {
    '{"formatVersion":1,"groups":{}}' | Set-Content "$instancesDir\instgroups.json" -Encoding UTF8
}

# Copy configs, kubejs, datapacks
foreach ($dir in @('config', 'defaultconfigs', 'kubejs', 'global_packs')) {
    if (Test-Path "$distDir\$dir") {
        Copy-Item "$distDir\$dir" "$mcDir\$dir" -Recurse -Force
        Write-Host "    $dir... OK"
    }
}

# Copy custom JARs
$customJars = Get-ChildItem "$distDir\mods\*.jar" -ErrorAction SilentlyContinue
if ($customJars) {
    foreach ($jar in $customJars) { Copy-Item $jar.FullName "$modsDir\" -Force }
    Write-Host "    Custom JARs ($($customJars.Count))... OK"
}

Write-Host ""

# ── Phase 4: Download ALL mods ──
Write-Host "  [4/5] Downloading mods..." -ForegroundColor Cyan
Write-Host ""

$indexDir = "$distDir\mods\.index"
$tomlFiles = Get-ChildItem "$indexDir\*.pw.toml"
$total = $tomlFiles.Count
$quotePattern = "['" + '"]'

Write-Host "    $total mods to check."

$downloaded = 0; $skipped = 0; $failed = 0; $count = 0; $failedNames = @()

foreach ($toml in $tomlFiles) {
    $count++
    $filename = ''; $side = 'both'; $mode = ''; $url = ''; $fileId = ''

    foreach ($line in Get-Content $toml.FullName) {
        $line = $line.Trim()
        if ($line -match "^filename\s*=\s*$quotePattern(.+)$quotePattern") { $filename = $matches[1] }
        if ($line -match "^side\s*=\s*$quotePattern(.+)$quotePattern") { $side = $matches[1] }
        if ($line -match "^mode\s*=\s*$quotePattern(.+)$quotePattern") { $mode = $matches[1] }
        if ($line -match "^url\s*=\s*$quotePattern(.+)$quotePattern") { $url = $matches[1] }
        if ($line -match '^file-id\s*=\s*(\d+)') { $fileId = $matches[1] }
    }

    if ([string]::IsNullOrEmpty($filename)) { continue }
    if ($side -eq 'server') { $skipped++; continue }

    $modPath = Join-Path $modsDir $filename
    if (Test-Path -LiteralPath $modPath) { $skipped++; continue }

    # Build download URL
    $dlUrl = ''
    if ($mode -eq 'url' -and $url) {
        $dlUrl = $url
    } elseif ($mode -eq 'metadata:curseforge' -and $fileId) {
        $idStr = $fileId.ToString()
        $part1 = $idStr.Substring(0, 4)
        $part2 = $idStr.Substring(4).TrimStart('0')
        if (-not $part2) { $part2 = '0' }
        $dlUrl = "https://edge.forgecdn.net/files/$part1/$part2/$filename"
    }

    if ([string]::IsNullOrEmpty($dlUrl)) { $failed++; $failedNames += "$filename (no URL)"; continue }

    $pct = [math]::Round(($count / $total) * 100)
    Write-Host "    [$pct%] $filename" -NoNewline

    $tmp = Join-Path $modsDir "_dl_$count.tmp"
    $success = $false

    for ($retry = 0; $retry -lt 3; $retry++) {
        try {
            $wc = New-Object System.Net.WebClient
            $wc.DownloadFile($dlUrl, $tmp)
            $wc.Dispose()
            if ((Test-Path $tmp) -and (Get-Item $tmp).Length -gt 1000) {
                Move-Item -LiteralPath $tmp -Destination $modPath -Force
                $success = $true; break
            } else {
                if (Test-Path $tmp) { Remove-Item $tmp -Force }
            }
        } catch {
            if (Test-Path $tmp) { Remove-Item $tmp -Force }
            if ($retry -lt 2) { Start-Sleep -Seconds 1 }
        }
    }

    if ($success) {
        Write-Host " OK" -ForegroundColor Green
        $downloaded++
    } else {
        Write-Host " FAILED" -ForegroundColor Red
        $failed++
        $failedNames += $filename
    }
}

Write-Host ""
Write-Host "    Downloaded: $downloaded" -ForegroundColor Green
Write-Host "    Already present: $skipped" -ForegroundColor Cyan
if ($failed -gt 0) {
    Write-Host "    Failed: $failed (re-run to retry)" -ForegroundColor Red
    foreach ($fn in $failedNames) { Write-Host "      - $fn" -ForegroundColor DarkRed }
}

$totalJars = (Get-ChildItem "$modsDir\*.jar" -ErrorAction SilentlyContinue).Count
Write-Host ""
Write-Host "    Total mods installed: $totalJars" -ForegroundColor Cyan
Write-Host ""

# ── Phase 5: Launch ──
Write-Host "  [5/5] Ready!" -ForegroundColor Green
Write-Host ""

if ($prismExe) {
    Write-Host "  Launching PrismLauncher..."
    Start-Process $prismExe
    Write-Host ""
    Write-Host "  Select 'IridescentCraft' from the instance list and click Launch."
    Write-Host "  First launch downloads Forge — takes a few minutes."
} else {
    Write-Host "  Install PrismLauncher from https://prismlauncher.org/download/"
    Write-Host "  Then open it — IridescentCraft will appear in the instance list."
}

if ($failed -gt 0) {
    Write-Host ""
    Write-Host "  Some mods failed to download. Re-run this installer to retry." -ForegroundColor Yellow
}

# Cleanup
if ($distDir -like "*TEMP*") { Remove-Item $distDir -Recurse -Force -ErrorAction SilentlyContinue }

Write-Host ""
Write-Host "  Done!" -ForegroundColor Green
Write-Host ""
Read-Host "  Press Enter to exit"
