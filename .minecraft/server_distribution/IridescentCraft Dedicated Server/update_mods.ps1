# =============================================================================
# IridescentCraft Server -- Mod Update Script
# =============================================================================
# Run AFTER sync_from_repo to update mod JARs when .pw.toml files change.
#
# What it does:
#   1. Reads all .pw.toml files in mods/.index/
#   2. For each TOML, checks if the expected filename exists in mods/
#   3. If missing (new version), downloads it
#   4. Finds and removes old versions of the same mod (by mod-id match)
#   5. Reports what changed
#
# This handles the case where you update a mod in the repo (new .pw.toml
# with different filename/version) -- the old JAR gets cleaned up and the
# new one gets downloaded automatically.
# =============================================================================

param(
    [string]$ModsDir = "mods"
)

$ErrorActionPreference = "Continue"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

Write-Host ""
Write-Host "  ==========================================" -ForegroundColor Cyan
Write-Host "  IridescentCraft Mod Updater" -ForegroundColor Cyan
Write-Host "  ==========================================" -ForegroundColor Cyan
Write-Host ""

$indexDir = "$ModsDir\.index"
if (-not (Test-Path $indexDir)) {
    Write-Host "  ERROR: $indexDir not found." -ForegroundColor Red
    Read-Host "  Press Enter to exit"
    exit 1
}

# Client-only and server-incompatible mods to skip
$forceSkip = @(
    "embeddium", "oculus", "immediatelyfast", "rubidium-extra",
    "kubejsoffline", "light-overlay", "equipment-compare", "chat_heads",
    "BetterAnimations", "transmog", "probejs", "irons_spells_js",
    "gh_classes", "cherryvillage", "rechiseled", "supermartijn642",
    "connectedglass", "trashcans",
    "ftbbackups", "ftbchunks", "ftbessentials", "ftblibrary",
    "ftbquests", "ftbranks", "ftbteams", "ftbultimine",
    "mca-social"
)

# -- Phase 1: Build expected mod map from TOMLs --
Write-Host "  [1/3] Reading mod index..."

$tomlFiles = Get-ChildItem "$indexDir\*.pw.toml"
Write-Host "    Found $($tomlFiles.Count) .pw.toml files."

# Map: expected filename -> TOML data
$expectedMods = @{}
# Map: mod-id -> expected filename (for old version detection)
$modIdToFilename = @{}
$quotePattern = "['" + '"]'

foreach ($toml in $tomlFiles) {
    $filename = ''; $side = 'both'; $mode = ''; $url = ''; $projectId = ''; $fileId = ''
    $modrinthId = ''; $curseforgeId = ''

    foreach ($line in Get-Content $toml.FullName) {
        $line = $line.Trim()
        if ($line -match "^filename\s*=\s*$quotePattern(.+)$quotePattern") { $filename = $matches[1] }
        if ($line -match "^side\s*=\s*$quotePattern(.+)$quotePattern") { $side = $matches[1] }
        if ($line -match "^mode\s*=\s*$quotePattern(.+)$quotePattern") { $mode = $matches[1] }
        if ($line -match "^url\s*=\s*$quotePattern(.+)$quotePattern") { $url = $matches[1] }
        if ($line -match '^project-id\s*=\s*(\d+)') { $projectId = $matches[1] }
        if ($line -match '^file-id\s*=\s*(\d+)') { $fileId = $matches[1] }
        if ($line -match "^mod-id\s*=\s*$quotePattern(.+)$quotePattern") { $modrinthId = $matches[1] }
    }

    if ([string]::IsNullOrEmpty($filename)) { continue }
    if ($side -eq 'client') { continue }

    # Check force-skip
    $skip = $false
    foreach ($pattern in $forceSkip) {
        if ($filename -like "*$pattern*") { $skip = $true; break }
    }
    if ($skip) { continue }

    # Build candidate download URLs (tried in order)
    $dlUrls = @()
    if ($mode -eq 'url' -and $url) {
        $dlUrls += $url
    } elseif ($mode -eq 'metadata:curseforge' -and $fileId) {
        # Prefer direct forgecdn CDN - no auth, no 403 from api/v1
        $idStr = $fileId.ToString()
        $part1 = $idStr.Substring(0, 4)
        $part2 = $idStr.Substring(4).TrimStart('0')
        if (-not $part2) { $part2 = '0' }
        $dlUrls += "https://edge.forgecdn.net/files/$part1/$part2/$([uri]::EscapeDataString($filename))"
        # Fallback: CurseForge API endpoint (may 403 without auth but sometimes works)
        if ($projectId) {
            $dlUrls += "https://www.curseforge.com/api/v1/mods/$projectId/files/$fileId/download"
        }
    }

    $expectedMods[$filename] = @{
        Urls = $dlUrls
        ModrinthId = $modrinthId
        CurseforgeId = $projectId
        TomlName = $toml.Name
    }

    # Track mod-id -> filename for old version detection
    $modKey = ''
    if ($modrinthId) { $modKey = "mr:$modrinthId" }
    elseif ($projectId) { $modKey = "cf:$projectId" }
    else { $modKey = "file:$($toml.BaseName)" }

    $modIdToFilename[$modKey] = $filename
}

Write-Host "    $($expectedMods.Count) server-side mods expected."
Write-Host ""

# -- Phase 2: Compare with existing JARs --
Write-Host "  [2/3] Checking installed mods..."

$existingJars = Get-ChildItem "$ModsDir\*.jar" -ErrorAction SilentlyContinue
$existingNames = @{}
foreach ($jar in $existingJars) { $existingNames[$jar.Name] = $true }

$toDownload = @()
$toRemove = @()
$upToDate = 0

foreach ($expected in $expectedMods.Keys) {
    if ($existingNames.ContainsKey($expected)) {
        $upToDate++
    } else {
        $toDownload += $expected

        # Check if an OLD version of this mod exists
        # Strategy: find JARs with similar base name (strip version numbers)
        $baseName = $expected -replace '-[\d\.]+.*\.jar$', ''
        if ($baseName.Length -gt 3) {
            foreach ($existing in $existingJars) {
                $existBase = $existing.Name -replace '-[\d\.]+.*\.jar$', ''
                if ($existBase -eq $baseName -and $existing.Name -ne $expected) {
                    $toRemove += $existing.Name
                }
            }
        }
    }
}

# Also find orphaned JARs -- in mods/ but NOT in any .pw.toml and not a custom JAR
$customJars = @('iridescent_codex_data.jar', 'iridescent_origins-1.0.0.jar','iridescent_biomes-1.0.0.jar', 'iridescent_modular_spells-0.2.0.jar', 'iridescent_durability_clamp-0.1.0.jar', 'justlevelingfork-1.2.1-iridescent.1.jar', 'mek_walkable_cables-1.0.1.jar', 'offlineskins-1.20.1-v1.jar', 'zeta_racefix-1.0.0.jar', 'Patchouli-1.20.1-85-FORGE.jar', 'ars_nouveau-1.20.1-4.12.7-all.jar')
$orphaned = @()
foreach ($jar in $existingJars) {
    if (-not $expectedMods.ContainsKey($jar.Name) -and $customJars -notcontains $jar.Name) {
        # Check if it's a known old version being replaced
        if ($toRemove -contains $jar.Name) { continue }
        $orphaned += $jar.Name
    }
}

Write-Host "    Up to date: $upToDate"
Write-Host "    To download: $($toDownload.Count)"
Write-Host "    Old versions to remove: $($toRemove.Count)"
if ($orphaned.Count -gt 0) {
    Write-Host "    Orphaned JARs (not in any TOML): $($orphaned.Count)" -ForegroundColor DarkYellow
}
Write-Host ""

if ($toDownload.Count -eq 0 -and $toRemove.Count -eq 0) {
    Write-Host "  [OK] All mods are up to date!" -ForegroundColor Green
    Write-Host ""
    Read-Host "  Press Enter to exit"
    exit 0
}

# -- Phase 3: Apply changes --
Write-Host "  [3/3] Applying updates..."
Write-Host ""

# Remove old versions first
foreach ($old in $toRemove) {
    $oldPath = Join-Path $ModsDir $old
    if (Test-Path -LiteralPath $oldPath) {
        Remove-Item -LiteralPath $oldPath -Force
        Write-Host "    REMOVED: $old" -ForegroundColor Yellow
    }
}

# Download new versions
$dlSuccess = 0
$dlFailed = 0

foreach ($mod in $toDownload) {
    $info = $expectedMods[$mod]
    $dlUrls = $info.Urls

    if (-not $dlUrls -or $dlUrls.Count -eq 0) {
        Write-Host "    SKIP (no URL): $mod" -ForegroundColor DarkYellow
        $dlFailed++
        continue
    }

    Write-Host "    Downloading: $mod" -NoNewline

    $modPath = Join-Path $ModsDir $mod
    $tempFile = Join-Path $ModsDir "_update_temp.jar"
    $success = $false

    # Walk candidate URLs in order; each URL gets up to 2 attempts
    :urlloop foreach ($dlUrl in $dlUrls) {
        for ($retry = 0; $retry -lt 2; $retry++) {
            try {
                $wc = New-Object System.Net.WebClient
                $wc.Headers.Add('User-Agent', 'Mozilla/5.0 IridescentCraft-Updater')
                $wc.DownloadFile($dlUrl, $tempFile)
                $wc.Dispose()

                if ((Test-Path $tempFile) -and (Get-Item $tempFile).Length -gt 1000) {
                    [System.IO.File]::Move((Resolve-Path $tempFile).Path, (Join-Path (Get-Location) $modPath))
                    $success = $true
                    break urlloop
                } else {
                    if (Test-Path $tempFile) { Remove-Item $tempFile -Force }
                }
            } catch {
                if (Test-Path $tempFile) { Remove-Item $tempFile -Force }
                if ($retry -lt 1) { Start-Sleep -Seconds 1 }
            }
        }
    }

    if ($success) {
        Write-Host " OK" -ForegroundColor Green
        $dlSuccess++
    } else {
        Write-Host " FAILED" -ForegroundColor Red
        $dlFailed++
    }
}

# Report orphans
if ($orphaned.Count -gt 0) {
    Write-Host ""
    Write-Host "  Orphaned JARs (no matching TOML -- may be outdated):" -ForegroundColor DarkYellow
    foreach ($o in $orphaned | Select-Object -First 20) {
        Write-Host "    ? $o" -ForegroundColor DarkGray
    }
    if ($orphaned.Count -gt 20) {
        Write-Host "    ... and $($orphaned.Count - 20) more" -ForegroundColor DarkGray
    }
    Write-Host "  Run with -CleanOrphans to remove these." -ForegroundColor DarkYellow
}

# Summary
Write-Host ""
Write-Host "  ==========================================" -ForegroundColor Cyan
Write-Host "  Summary:" -ForegroundColor Cyan
Write-Host "    Downloaded: $dlSuccess" -ForegroundColor Green
Write-Host "    Removed old: $($toRemove.Count)" -ForegroundColor Yellow
if ($dlFailed -gt 0) {
    Write-Host "    Failed: $dlFailed" -ForegroundColor Red
}
Write-Host "  ==========================================" -ForegroundColor Cyan
Write-Host ""

if ($dlSuccess -gt 0 -or $toRemove.Count -gt 0) {
    Write-Host "  Restart the server to load the updated mods." -ForegroundColor Yellow
    Write-Host ""
}

Read-Host "  Press Enter to exit"
