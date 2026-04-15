# =============================================================================
# IridescentCraft Client Installer v6
# =============================================================================
# Fully self-contained -- downloads all mods directly, no mrpack import.
# Creates the PrismLauncher instance with everything ready to launch.
# =============================================================================

$ErrorActionPreference = "Continue"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

# -- Banner --
try {
    Add-Type -MemberDefinition '[DllImport("kernel32.dll")]public static extern bool SetConsoleMode(IntPtr h,int m);[DllImport("kernel32.dll")]public static extern IntPtr GetStdHandle(int h);' -Name W -Namespace C
    $h = [C.W]::GetStdHandle(-11); [C.W]::SetConsoleMode($h, 7) | Out-Null
    $B = "$([char]27)[38;2;91;206;250m"; $P = "$([char]27)[38;2;245;169;184m"; $W = "$([char]27)[38;2;255;255;255m"; $R = "$([char]27)[0m"
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

# -- Phase 1: Get distribution files --
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$distDir = $scriptDir

if (-not (Test-Path "$distDir\mods\.index")) {
    Write-Host "  [1/5] Downloading distribution from GitHub..." -ForegroundColor Cyan
    Write-Host ""

    $distDir = "$env:TEMP\IridescentCraft-dist"
    $repoZip = "$env:TEMP\IridescentCraft-repo.zip"
    $repoExtract = "$env:TEMP\IridescentCraft-repo-extract"

    try {
        $wc = New-Object System.Net.WebClient
        Write-Host "    Downloading repository (~1.3 GB, please wait)..."
        Write-Host "    This is a one-time download. Future updates are much smaller." -ForegroundColor DarkGray
        $wc.DownloadFile('https://github.com/silvariasereneblossom/IridescentCraft/archive/refs/heads/main.zip', $repoZip)
        $wc.Dispose()

        if (-not (Test-Path $repoZip) -or (Get-Item $repoZip).Length -lt 1000000) {
            throw "Download failed or file too small"
        }

        $zipSize = [math]::Round((Get-Item $repoZip).Length / 1MB, 0)
        Write-Host "    Downloaded: $zipSize MB"
        Write-Host "    Extracting client distribution..."

        if (Test-Path $repoExtract) { Remove-Item $repoExtract -Recurse -Force }
        Add-Type -AssemblyName System.IO.Compression.FileSystem
        [System.IO.Compression.ZipFile]::ExtractToDirectory($repoZip, $repoExtract)

        $subDir = (Get-ChildItem $repoExtract -Directory | Select-Object -First 1).FullName
        $srcDir = "$subDir\.minecraft\distribution\client"

        if (-not (Test-Path "$srcDir\mods\.index")) {
            throw "Could not find client distribution in downloaded repo"
        }

        # Copy client distribution to temp location
        if (Test-Path $distDir) { Remove-Item $distDir -Recurse -Force }
        Copy-Item $srcDir $distDir -Recurse -Force

        # Cleanup repo download
        Remove-Item $repoZip -Force -ErrorAction SilentlyContinue
        Remove-Item $repoExtract -Recurse -Force -ErrorAction SilentlyContinue

        $fileCount = (Get-ChildItem $distDir -Recurse -File).Count
        Write-Host "    [OK] Distribution ready ($fileCount files)." -ForegroundColor Green
    } catch {
        Write-Host "  ERROR: $($_.Exception.Message)" -ForegroundColor Red
        Write-Host ""
        Write-Host "  If download fails, try cloning the repo manually:" -ForegroundColor Yellow
        Write-Host "  https://github.com/silvariasereneblossom/IridescentCraft" -ForegroundColor Yellow
        # Cleanup partial downloads
        Remove-Item $repoZip -Force -ErrorAction SilentlyContinue
        Remove-Item $repoExtract -Recurse -Force -ErrorAction SilentlyContinue
        Read-Host "  Press Enter to exit"
        exit 1
    }
} else {
    Write-Host "  [1/5] Using local distribution files." -ForegroundColor Green
}
Write-Host ""

# -- Phase 2: Find or create PrismLauncher data directory --
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

# -- Phase 3: Create instance --
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
MaxMemAlloc=12288
MinMemAlloc=4096
OverrideJavaArgs=true
JvmArgs=-noverify
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
foreach ($dir in @('config', 'defaultconfigs', 'kubejs')) {
    if (Test-Path "$distDir\$dir") {
        Copy-Item "$distDir\$dir" "$mcDir\$dir" -Recurse -Force
        Write-Host "    $dir... OK"
    }
}

# Copy sync_client scripts into the instance so PrismLauncher's pre-launch
# command can find them via $INST_MC_DIR. Users set the pre-launch command
# in PrismLauncher manually — see wiki/protocols/8-client-sync.md
foreach ($syncFile in @('sync_client.ps1', 'sync_client.bat')) {
    if (Test-Path "$distDir\$syncFile") {
        Copy-Item "$distDir\$syncFile" "$mcDir\$syncFile" -Force
        Write-Host "    $syncFile... OK"
    }
}

# Copy custom JARs
$customJars = Get-ChildItem "$distDir\mods\*.jar" -ErrorAction SilentlyContinue
if ($customJars) {
    foreach ($jar in $customJars) { Copy-Item $jar.FullName "$modsDir\" -Force }
    Write-Host "    Custom JARs ($($customJars.Count))... OK"
}

Write-Host ""

# -- Phase 4: Download ALL mods --
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

# -- Cleanup: remove JARs that no longer have a matching TOML --
# Build list of expected filenames from TOMLs
$expectedFiles = @{}
foreach ($toml in $tomlFiles) {
    $fn = ''
    foreach ($line in Get-Content $toml.FullName) {
        if ($line.Trim() -match "^filename\s*=\s*$quotePattern(.+)$quotePattern") { $fn = $matches[1]; break }
    }
    if ($fn) { $expectedFiles[$fn] = $true }
}
# Add custom JARs (not in TOMLs)
$customJarFiles = Get-ChildItem "$distDir\mods\*.jar" -ErrorAction SilentlyContinue
foreach ($cj in $customJarFiles) { $expectedFiles[$cj.Name] = $true }

$orphaned = @()
$existingJars = Get-ChildItem "$modsDir\*.jar" -ErrorAction SilentlyContinue
foreach ($jar in $existingJars) {
    if (-not $expectedFiles.ContainsKey($jar.Name)) {
        $orphaned += $jar
    }
}
if ($orphaned.Count -gt 0) {
    Write-Host ""
    Write-Host "    Removing $($orphaned.Count) orphaned mods (no longer in pack):" -ForegroundColor Yellow
    foreach ($o in $orphaned) {
        Remove-Item $o.FullName -Force
        Write-Host "      - $($o.Name)" -ForegroundColor DarkYellow
    }
}

$totalJars = (Get-ChildItem "$modsDir\*.jar" -ErrorAction SilentlyContinue).Count
Write-Host ""
Write-Host "    Total mods installed: $totalJars" -ForegroundColor Cyan
Write-Host ""

# -- Phase 5: Launch --
Write-Host "  [5/5] Ready!" -ForegroundColor Green
Write-Host ""

if ($prismExe) {
    Write-Host "  Launching PrismLauncher..."
    Start-Process $prismExe
    Write-Host ""
    Write-Host "  Select 'IridescentCraft' from the instance list and click Launch."
    Write-Host "  First launch downloads Forge -- takes a few minutes."
} else {
    Write-Host "  Install PrismLauncher from https://prismlauncher.org/download/"
    Write-Host "  Then open it -- IridescentCraft will appear in the instance list."
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
