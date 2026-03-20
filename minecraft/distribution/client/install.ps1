# =============================================================================
# IridescentCraft Client Installer
# Builds a PrismLauncher-importable instance zip, then imports it.
# PrismLauncher handles Forge download + mod downloads from .index metadata.
# =============================================================================

[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

# ── Banner ──
try {
    Add-Type -MemberDefinition '[DllImport("kernel32.dll")]public static extern bool SetConsoleMode(IntPtr h,int m);[DllImport("kernel32.dll")]public static extern IntPtr GetStdHandle(int h);' -Name W -Namespace C
    $h = [C.W]::GetStdHandle(-11); [C.W]::SetConsoleMode($h, 7) | Out-Null
    $B = "`e[38;2;91;206;250m"; $P = "`e[38;2;245;169;184m"; $W = "`e[38;2;255;255;255m"; $R = "`e[0m"
    [Console]::Write("${B}  ==========================================${R}`n")
    [Console]::Write("${P}  IridescentCraft Client Installer${R}`n")
    [Console]::Write("${W}  Forge 1.20.1-47.4.6  ~420 mods${R}`n")
    [Console]::Write("${P}  Iridescent Edition${R}`n")
    [Console]::Write("${B}  ==========================================${R}`n")
} catch {
    Write-Host "  =========================================="
    Write-Host "  IridescentCraft Client Installer"
    Write-Host "  Forge 1.20.1-47.4.6  ~420 mods"
    Write-Host "  Iridescent Edition"
    Write-Host "  =========================================="
}
Write-Host ""

# ── Phase 0: Ensure distribution files are available ──
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$distDir = $scriptDir

if (-not (Test-Path "$distDir\mods\.index")) {
    Write-Host "  [DOWNLOAD] Distribution files not found. Downloading from GitHub..."
    Write-Host ""

    # Use GitHub API to download just the client distribution (~16 MB)
    # via git sparse checkout simulation — download tree listing then fetch files
    $distDir = "$env:TEMP\IridescentCraft-dist"
    $baseUrl = "https://raw.githubusercontent.com/silvariasereneblossom/IridescentCraft/main/minecraft/distribution/client"
    $apiUrl = "https://api.github.com/repos/silvariasereneblossom/IridescentCraft/git/trees/main?recursive=1"

    try {
        Write-Host "    Fetching file listing..."
        $wc = New-Object System.Net.WebClient
        $wc.Headers.Add("User-Agent", "IridescentCraft-Installer")
        $treeJson = $wc.DownloadString($apiUrl)

        # Parse file paths under distribution/client/
        $prefix = "minecraft/distribution/client/"
        $files = @()
        # Simple JSON parsing — extract paths
        foreach ($match in [regex]::Matches($treeJson, '"path"\s*:\s*"([^"]+)"')) {
            $path = $match.Groups[1].Value
            if ($path.StartsWith($prefix) -and -not $path.EndsWith('/')) {
                $files += $path.Substring($prefix.Length)
            }
        }

        # Filter to only tree entries that are blobs (files)
        # Also filter by the type field that comes before each path
        Write-Host "    Found $($files.Count) files to download."

        if ($files.Count -lt 10) {
            throw "Too few files found — API may have changed or repo is empty"
        }

        $dlCount = 0
        $total = $files.Count
        foreach ($file in $files) {
            $dlCount++
            $localPath = Join-Path $distDir $file
            $localDir = Split-Path $localPath -Parent
            if (-not (Test-Path $localDir)) { New-Item -ItemType Directory -Path $localDir -Force | Out-Null }

            $fileUrl = "$baseUrl/$($file -replace '\\','/')"
            try {
                $wc.DownloadFile($fileUrl, $localPath)
            } catch {
                # Skip failures silently — some paths from tree may be dirs
            }

            if ($dlCount % 50 -eq 0) {
                $pct = [math]::Round(($dlCount / $total) * 100)
                Write-Host "    [$pct%] Downloaded $dlCount / $total files..." -ForegroundColor DarkGray
            }
        }
        $wc.Dispose()

        if (-not (Test-Path "$distDir\mods\.index")) {
            throw "Distribution files incomplete after download"
        }

        Write-Host "    [OK] Distribution files ready ($dlCount files)."
        Write-Host ""
    } catch {
        Write-Host "  ERROR: Download failed." -ForegroundColor Red
        Write-Host "  Detail: $($_.Exception.Message)" -ForegroundColor DarkGray
        Write-Host ""
        Write-Host "  Alternative: clone the repo and run from distribution\client\ folder:" -ForegroundColor Yellow
        Write-Host "  https://github.com/silvariasereneblossom/IridescentCraft" -ForegroundColor Yellow
        Write-Host ""
        Read-Host "  Press Enter to exit"
        exit 1
    }
}

# ── Phase 1: Build instance zip ──
Write-Host "  [BUILD] Assembling IridescentCraft instance package..."
Write-Host ""

$staging = "$env:TEMP\IridescentCraft-staging"
$stageMC = "$staging\.minecraft"
$stageMods = "$staging\.minecraft\mods"
$outputZip = "$env:TEMP\IridescentCraft-instance.zip"

if (Test-Path $staging) { Remove-Item $staging -Recurse -Force }
New-Item -ItemType Directory -Path $stageMods -Force | Out-Null

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
"@ | Set-Content "$staging\instance.cfg" -Encoding UTF8
Write-Host "    instance.cfg... OK"

# mmc-pack.json
@"
{
    "components": [
        {
            "cachedName": "Minecraft",
            "cachedVersion": "1.20.1",
            "important": true,
            "uid": "net.minecraft",
            "version": "1.20.1"
        },
        {
            "cachedName": "Forge",
            "cachedVersion": "47.4.6",
            "uid": "net.minecraftforge",
            "version": "47.4.6"
        }
    ],
    "formatVersion": 1
}
"@ | Set-Content "$staging\mmc-pack.json" -Encoding UTF8
Write-Host "    mmc-pack.json... OK"

# Copy game files
$dirs = @('config', 'defaultconfigs', 'kubejs', 'global_packs')
foreach ($dir in $dirs) {
    if (Test-Path "$distDir\$dir") {
        Copy-Item "$distDir\$dir" "$stageMC\$dir" -Recurse -Force
        Write-Host "    $dir... OK"
    }
}

# Copy mod index
if (Test-Path "$distDir\mods\.index") {
    New-Item -ItemType Directory -Path "$stageMods\.index" -Force | Out-Null
    Copy-Item "$distDir\mods\.index\*" "$stageMods\.index\" -Recurse -Force
    $tomlCount = (Get-ChildItem "$stageMods\.index\*.pw.toml").Count
    Write-Host "    mod index ($tomlCount .pw.toml files)... OK"
}

# Copy custom JARs
$customJars = Get-ChildItem "$distDir\mods\*.jar" -ErrorAction SilentlyContinue
if ($customJars) {
    Copy-Item "$distDir\mods\*.jar" "$stageMods\" -Force
    Write-Host "    custom JARs ($($customJars.Count))... OK"
}

Write-Host ""
Write-Host "  [OK] Instance package assembled." -ForegroundColor Green
Write-Host ""

# ── Phase 2: Zip ──
Write-Host "  [ZIP] Creating importable archive..."
if (Test-Path $outputZip) { Remove-Item $outputZip -Force }
Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::CreateFromDirectory($staging, $outputZip)
$zipSize = [math]::Round((Get-Item $outputZip).Length / 1MB, 1)
Write-Host "    Created: $outputZip ($zipSize MB)"
Write-Host ""

# ── Phase 3: Save location ──
$defaultSave = [IO.Path]::Combine([Environment]::GetFolderPath('Desktop'), 'IridescentCraft-instance.zip')
Write-Host "  Default save: $defaultSave"
$customPath = Read-Host "  Press Enter to save to Desktop, or type a custom path"

if ([string]::IsNullOrWhiteSpace($customPath)) {
    $savePath = $defaultSave
} else {
    $savePath = $customPath
}

Copy-Item $outputZip $savePath -Force
Write-Host ""
Write-Host "  Saved to: $savePath" -ForegroundColor Green
Write-Host ""

# ── Phase 4: Find or download PrismLauncher ──
$prismExe = $null

# Check common locations
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

# Check PATH
if (-not $prismExe) {
    $found = Get-Command prismlauncher.exe -ErrorAction SilentlyContinue
    if ($found) { $prismExe = $found.Source }
}

# Deep search
if (-not $prismExe) {
    Write-Host "  Searching for PrismLauncher..."
    $found = Get-ChildItem -Path $env:LOCALAPPDATA, $env:APPDATA, $env:USERPROFILE -Filter 'prismlauncher.exe' -Recurse -Depth 4 -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($found) { $prismExe = $found.FullName }
}

# Download if not found
if (-not $prismExe) {
    Write-Host "  [INSTALL] PrismLauncher not found. Downloading..." -ForegroundColor Yellow
    Write-Host ""

    try {
        $prismDir = "$env:LOCALAPPDATA\PrismLauncher"
        $prismZip = "$env:TEMP\PrismLauncher-Portable.zip"
        New-Item -ItemType Directory -Path $prismDir -Force | Out-Null

        $release = Invoke-RestMethod -Uri 'https://api.github.com/repos/PrismLauncher/PrismLauncher/releases/latest' -UseBasicParsing
        $asset = $release.assets | Where-Object { $_.name -match 'Windows-MSVC-Portable.*\.zip$' -and $_.name -notmatch 'arm' } | Select-Object -First 1

        if ($asset) {
            Write-Host "    Downloading: $($asset.name)"
            Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $prismZip -UseBasicParsing
            Write-Host "    Extracting..."
            Expand-Archive -Path $prismZip -DestinationPath $prismDir -Force
            Remove-Item $prismZip -Force -ErrorAction SilentlyContinue

            $found = Get-ChildItem -Path $prismDir -Filter 'prismlauncher.exe' -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
            if ($found) {
                $prismExe = $found.FullName
                Write-Host "    [OK] PrismLauncher installed to $prismDir" -ForegroundColor Green
            }
        }
    } catch {
        Write-Host "    WARNING: Download failed: $($_.Exception.Message)" -ForegroundColor Yellow
    }
    Write-Host ""
}

# ── Phase 5: Import ──
if ($prismExe) {
    Write-Host "  [IMPORT] Launching PrismLauncher with instance import..." -ForegroundColor Cyan
    Write-Host ""
    Start-Process $prismExe -ArgumentList "--import", $savePath
    Write-Host "    PrismLauncher should open with the import dialog."
    Write-Host "    Click OK to import, then launch the instance."
    Write-Host ""
    Write-Host "    First launch will download Forge + ~420 mods."
    Write-Host "    This takes 5-15 minutes depending on your internet."
} else {
    Write-Host "  ==================================================================="
    Write-Host "    HOW TO IMPORT:"
    Write-Host "  ==================================================================="
    Write-Host ""
    Write-Host "    1. Install PrismLauncher from https://prismlauncher.org/download/"
    Write-Host "    2. Open PrismLauncher"
    Write-Host "    3. Click 'Add Instance' (top left)"
    Write-Host "    4. Select 'Import' tab"
    Write-Host "    5. Browse to: $savePath"
    Write-Host "    6. Click OK"
    Write-Host "    7. PrismLauncher will download Forge + all mods automatically"
    Write-Host "    8. Add your Minecraft account in Settings if needed"
    Write-Host "    9. Launch!"
    Write-Host ""
    Write-Host "    First launch takes 5-15 minutes (Forge + 420 mods)."
}

# Cleanup
Remove-Item $staging -Recurse -Force -ErrorAction SilentlyContinue
if ($distDir -like "*TEMP*") { Remove-Item $distDir -Recurse -Force -ErrorAction SilentlyContinue }

Write-Host ""
Write-Host "  Done!" -ForegroundColor Green
Write-Host ""
Read-Host "  Press Enter to exit"
