# IridescentCraft Server Installation Script (PowerShell)
# Standalone -- works without the rest of the modpack repo.
#
# This script:
#   1. Checks for Java 17
#   2. Runs the included Forge installer
#   3. Downloads all server-side mods from .pw.toml metadata
#   4. Everything else (config, kubejs, etc.) is already included

$ErrorActionPreference = "Continue"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$ForgeVersion = "1.20.1-47.4.6"
$ForgeInstaller = "forge-$ForgeVersion-installer.jar"

Write-Host ""

# -------------------------------------------------------------------
# Step 1: Check Java
# -------------------------------------------------------------------
Write-Host "[1/4] Checking Java installation..." -ForegroundColor Yellow

try {
    $javaOut = & java -version 2>&1 | Select-Object -First 1
    Write-Host "  $javaOut" -ForegroundColor Green
} catch {
    Write-Host "  ERROR: Java not found. Please install Java 17." -ForegroundColor Red
    Write-Host "  Download: https://adoptium.net/" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

# -------------------------------------------------------------------
# Step 2: Install Forge
# -------------------------------------------------------------------
Write-Host ""
Write-Host "[2/4] Setting up Forge server..." -ForegroundColor Yellow

if (Test-Path "libraries\net\minecraftforge\forge\$ForgeVersion") {
    Write-Host "  Forge libraries already present, skipping." -ForegroundColor Green
} else {
    if (-not (Test-Path $ForgeInstaller)) {
        Write-Host "  ERROR: $ForgeInstaller not found in this directory." -ForegroundColor Red
        Read-Host "Press Enter to exit"
        exit 1
    }
    Write-Host "  Running Forge installer (--installServer)..."
    & java -jar $ForgeInstaller --installServer
    Write-Host "  Forge installed." -ForegroundColor Green
}

# -------------------------------------------------------------------
# Step 3: Download mods from .pw.toml metadata
# -------------------------------------------------------------------
Write-Host ""
Write-Host "[3/4] Downloading mods..." -ForegroundColor Yellow

$indexDir = "mods\.index"
if (-not (Test-Path $indexDir)) {
    Write-Host "  ERROR: mods\.index\ not found." -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

if (-not (Test-Path "mods")) { New-Item -ItemType Directory -Path "mods" | Out-Null }

$downloaded = 0
$skippedClient = 0
$skippedExists = 0
$failed = 0
$total = 0

# Jar-name patterns a dedicated server must never download: retired mods and the
# pack's client-only mods (those are not in this index at all; the patterns are a
# second line). The reason for each one is in the pack repository:
# .minecraft/dev/mods/mod_index.policy.json
# >>> mod_index.py: ps-array (GENERATED from mods/.index + dev/mods/mod_index.policy.json. Do not edit: run mod_index.py generate)
$forceSkip = @(
    'embeddium',
    'oculus',
    'immediatelyfast',
    'rubidium-extra',
    'kubejsoffline',
    'light-overlay',
    'equipment-compare',
    'chat_heads',
    'BetterAnimations',
    'transmog',
    'probejs',
    'irons_spells_js',
    'gh_classes',
    'cherryvillage',
    'rechiseled',
    'supermartijn642',
    'connectedglass',
    'trashcans',
    'ftbbackups',
    'ftbchunks',
    'ftbessentials',
    'ftblibrary',
    'ftbquests',
    'ftbranks',
    'ftbteams',
    'ftbultimine',
    'mca-social',
    'starlight',
    'EquipmentCompare',
    'mcasocial',
    'champions',
    'soulslike-weaponry',
    'AmbientSounds_',
    'athena-',
    'auudio_',
    'BadOptimizations-',
    'BEB-',
    'BetterAdvancements-',
    'biomemusic-',
    'configured-',
    'Controlling-',
    'CTM-',
    'CutThrough-',
    'defaultoptions-',
    'EnchantmentDescriptions-',
    'entity_model_features_',
    'entity_texture_features_',
    'entityculling-',
    'fallingleaves-',
    'fancymenu_',
    'Highlighter-',
    'inventoryhud.',
    'jeed-',
    'jmi-',
    'JustEnoughMekanismMultiblocks-',
    'konkrete_',
    'lazyDFU-',
    'libIPN-',
    'mek_walkable_cables-',
    'melody_',
    'MouseTweaks-',
    'OverflowingBars-',
    'Prism-',
    'Searchables-',
    'tenshilib-',
    'ToolStats-',
    'TravelersTitles-',
    'treasuredistance-'
)
# <<< mod_index.py

$tomlFiles = Get-ChildItem "$indexDir\*.pw.toml"
$totalFiles = $tomlFiles.Count
Write-Host "  Found $totalFiles mod metadata files."

foreach ($toml in $tomlFiles) {
    $total++
    $filename = ""
    $side = "both"
    $mode = ""
    $url = ""
    $projectId = ""
    $fileId = ""

    # Parse TOML file
    foreach ($line in Get-Content $toml.FullName) {
        $line = $line.Trim()
        if ($line -match "^filename\s*=\s*['""](.+)['""]") { $filename = $matches[1] }
        if ($line -match "^side\s*=\s*['""](.+)['""]") { $side = $matches[1] }
        if ($line -match "^mode\s*=\s*['""](.+)['""]") { $mode = $matches[1] }
        if ($line -match "^url\s*=\s*['""](.+)['""]") { $url = $matches[1] }
        if ($line -match "^project-id\s*=\s*(\d+)") { $projectId = $matches[1] }
        if ($line -match "^file-id\s*=\s*(\d+)") { $fileId = $matches[1] }
    }

    if ([string]::IsNullOrEmpty($filename)) { continue }

    # Skip client-only mods
    if ($side -eq "client") {
        $skippedClient++
        continue
    }

    # Skip force-excluded mods
    $skip = $false
    foreach ($pattern in $forceSkip) {
        if ($filename -like "*$pattern*") { $skip = $true; break }
    }
    if ($skip) { $skippedClient++; continue }

    # Use -LiteralPath for filenames with special chars like [0-4]
    $modPath = "mods\$filename"

    # Skip if already downloaded
    if (Test-Path -LiteralPath $modPath) {
        $skippedExists++
        continue
    }

    # Determine download URLs (candidates tried in order)
    $downloadUrls = @()
    if ($mode -eq "url" -and -not [string]::IsNullOrEmpty($url)) {
        $downloadUrls += $url
    } elseif ($mode -eq "metadata:curseforge" -and $fileId) {
        # Prefer direct forgecdn CDN -- no auth, avoids 403 from api/v1
        $idStr = $fileId.ToString()
        $part1 = $idStr.Substring(0, 4)
        $part2 = $idStr.Substring(4).TrimStart('0')
        if (-not $part2) { $part2 = '0' }
        $downloadUrls += "https://edge.forgecdn.net/files/$part1/$part2/$([uri]::EscapeDataString($filename))"
        # Fallback: CurseForge api/v1 (requires projectId, may 403)
        if ($projectId) {
            $downloadUrls += "https://www.curseforge.com/api/v1/mods/$projectId/files/$fileId/download"
        }
    }

    if ($downloadUrls.Count -eq 0) {
        Write-Host "  WARNING: No URL for $filename" -ForegroundColor DarkYellow
        $failed++
        continue
    }

    # Download -- use Invoke-WebRequest which follows all redirects (307->302->200)
    # This is critical for CurseForge which does multiple redirects
    $pct = [math]::Round(($total / $totalFiles) * 100)
    Write-Host "  [$pct%] Downloading: $filename" -NoNewline

    $downloadSuccess = $false
    $tempFile = "mods\_download_temp_$total.jar"
    :urlloop foreach ($downloadUrl in $downloadUrls) {
        try {
            Invoke-WebRequest -Uri $downloadUrl -OutFile $tempFile -MaximumRedirection 10 -UseBasicParsing -UserAgent 'Mozilla/5.0 IridescentCraft-Installer'

            if ((Test-Path $tempFile) -and (Get-Item $tempFile).Length -gt 1000) {
                [System.IO.File]::Move((Resolve-Path $tempFile).Path, (Join-Path (Get-Location) $modPath))
                Write-Host " OK" -ForegroundColor Green
                $downloaded++
                $downloadSuccess = $true
                break urlloop
            } else {
                if (Test-Path $tempFile) { Remove-Item $tempFile -Force }
            }
        } catch {
            if (Test-Path $tempFile) { Remove-Item $tempFile -Force }
        }
    }

    if (-not $downloadSuccess) {
        Write-Host " FAILED (all URLs)" -ForegroundColor Red
        $failed++
    }
}

Write-Host ""
Write-Host "  Downloaded: $downloaded mods" -ForegroundColor Green
Write-Host "  Skipped (client-only): $skippedClient" -ForegroundColor Cyan
Write-Host "  Skipped (already present): $skippedExists" -ForegroundColor Cyan
if ($failed -gt 0) {
    Write-Host "  Failed: $failed mods" -ForegroundColor Red
}

Write-Host ""
Write-Host "  Mod download complete." -ForegroundColor Green
Write-Host ""

if ($failed -gt 0) {
    Write-Host "WARNING: $failed mod(s) failed to download." -ForegroundColor Red
    Write-Host "You may need to download them manually." -ForegroundColor Red
    Write-Host ""
    exit 1
}

exit 0
