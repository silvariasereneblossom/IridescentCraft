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

# ── Phase 1: Build .mrpack (Modrinth pack format) ──
# PrismLauncher natively imports .mrpack files and downloads all mods
# from the modrinth.index.json automatically.

$outputZip = "$env:TEMP\IridescentCraft.mrpack"

# Use build_mrpack.ps1 if available alongside this script, otherwise inline
$buildScript = Join-Path $scriptDir "build_mrpack.ps1"
if (Test-Path $buildScript) {
    & $buildScript -DistDir $distDir -OutputFile $outputZip
} else {
    # Inline mrpack builder (same logic as build_mrpack.ps1)
    Write-Host "  [BUILD] Building Modrinth pack (.mrpack)..."
    Write-Host ""

    $indexDir = "$distDir\mods\.index"
    $tomlFiles = Get-ChildItem "$indexDir\*.pw.toml"
    $quotePattern = "['" + '"]'
    $mrFiles = @()
    $cfMods = @()

    foreach ($toml in $tomlFiles) {
        $filename = ''; $side = 'both'; $mode = ''; $url = ''; $hash = ''; $hashFormat = ''
        $fileId = ''

        foreach ($line in Get-Content $toml.FullName) {
            $line = $line.Trim()
            if ($line -match "^filename\s*=\s*$quotePattern(.+)$quotePattern") { $filename = $matches[1] }
            if ($line -match "^side\s*=\s*$quotePattern(.+)$quotePattern") { $side = $matches[1] }
            if ($line -match "^mode\s*=\s*$quotePattern(.+)$quotePattern") { $mode = $matches[1] }
            if ($line -match "^url\s*=\s*$quotePattern(.+)$quotePattern") { $url = $matches[1] }
            if ($line -match "^hash\s*=\s*$quotePattern(.+)$quotePattern") { $hash = $matches[1] }
            if ($line -match "^hash-format\s*=\s*$quotePattern(.+)$quotePattern") { $hashFormat = $matches[1] }
            if ($line -match '^file-id\s*=\s*(\d+)') { $fileId = $matches[1] }
        }

        if ([string]::IsNullOrEmpty($filename)) { continue }

        $dlUrl = ''
        if ($mode -eq 'url' -and $url) { $dlUrl = $url }
        elseif ($mode -eq 'metadata:curseforge' -and $fileId) {
            $idStr = $fileId.ToString()
            $part1 = $idStr.Substring(0, 4)
            $part2 = $idStr.Substring(4).TrimStart('0')
            if (-not $part2) { $part2 = '0' }
            $dlUrl = "https://edge.forgecdn.net/files/$part1/$part2/$filename"
        }
        if ([string]::IsNullOrEmpty($dlUrl)) { continue }

        $envClient = "required"; $envServer = "required"
        if ($side -eq 'client') { $envServer = "unsupported" }
        if ($side -eq 'server') { $envClient = "unsupported" }

        # PrismLauncher requires sha512 in hashes for every file entry.
        # Only Modrinth mods have sha512 — skip CurseForge mods from index
        # (they'll need to be downloaded separately or added as overrides)
        if (-not ($hash -and $hashFormat -eq 'sha512')) {
            # CurseForge mod — add to separate download list
            $cfMods += [ordered]@{ filename = $filename; url = $dlUrl }
            continue
        }

        $entry = [ordered]@{
            path = "mods/$filename"
            hashes = [ordered]@{ sha512 = $hash }
            env = [ordered]@{ client = $envClient; server = $envServer }
            downloads = @($dlUrl)
            fileSize = 0
        }
        $mrFiles += $entry
    }

    Write-Host "    $($mrFiles.Count) Modrinth mods (auto-download via PrismLauncher)"
    Write-Host "    $($cfMods.Count) CurseForge mods (will download after import)"

    $staging = "$env:TEMP\IridescentCraft-mrpack"
    if (Test-Path $staging) { Remove-Item $staging -Recurse -Force }
    New-Item -ItemType Directory -Path "$staging\overrides\mods" -Force | Out-Null

    # modrinth.index.json — build manually to avoid PowerShell's
    # ConvertTo-Json collapsing single-element arrays to bare values
    $filesJson = @()
    foreach ($f in $mrFiles) {
        $escapedPath = $f.path -replace '\\', '/' -replace '"', '\"'
        $escapedUrl = $f.downloads[0] -replace '"', '\"'
        $escapedHash = $f.hashes.sha512 -replace '"', '\"'
        $envC = $f.env.client
        $envS = $f.env.server
        $filesJson += "    {`n      `"path`": `"$escapedPath`",`n      `"hashes`": {`"sha512`": `"$escapedHash`"},`n      `"env`": {`"client`": `"$envC`", `"server`": `"$envS`"},`n      `"downloads`": [`"$escapedUrl`"],`n      `"fileSize`": 0`n    }"
    }
    $indexContent = @"
{
  "formatVersion": 1,
  "game": "minecraft",
  "versionId": "1.0.0-alpha",
  "name": "IridescentCraft",
  "summary": "Progression-focused RPG modpack with 420+ mods.",
  "files": [
$($filesJson -join ",`n")
  ],
  "dependencies": {
    "minecraft": "1.20.1",
    "forge": "47.4.6"
  }
}
"@
    $indexContent | Set-Content "$staging\modrinth.index.json" -Encoding UTF8
    # Save a debug copy on Desktop for inspection
    $indexContent | Set-Content ([IO.Path]::Combine([Environment]::GetFolderPath('Desktop'), 'debug_modrinth_index.json')) -Encoding UTF8
    Write-Host "    modrinth.index.json... OK"
    Write-Host "    (debug copy saved to Desktop\debug_modrinth_index.json)" -ForegroundColor DarkGray

    # Save CurseForge mod list for post-import download
    if ($cfMods.Count -gt 0) {
        $cfMods | ConvertTo-Json -Depth 5 | Set-Content "$staging\overrides\curseforge_mods.json" -Encoding UTF8
        Write-Host "    curseforge_mods.json ($($cfMods.Count) mods)... OK"
    }

    # Overrides
    foreach ($dir in @('config', 'defaultconfigs', 'kubejs', 'global_packs')) {
        if (Test-Path "$distDir\$dir") {
            Copy-Item "$distDir\$dir" "$staging\overrides\$dir" -Recurse -Force
            Write-Host "    overrides/$dir... OK"
        }
    }
    $customJars = Get-ChildItem "$distDir\mods\*.jar" -ErrorAction SilentlyContinue
    if ($customJars) {
        foreach ($jar in $customJars) { Copy-Item $jar.FullName "$staging\overrides\mods\" -Force }
        Write-Host "    overrides/mods/ ($($customJars.Count) custom JARs)... OK"
    }

    if (Test-Path $outputZip) { Remove-Item $outputZip -Force }
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    [System.IO.Compression.ZipFile]::CreateFromDirectory($staging, $outputZip)
    Remove-Item $staging -Recurse -Force -ErrorAction SilentlyContinue
}

$zipSize = [math]::Round((Get-Item $outputZip).Length / 1MB, 1)
Write-Host ""
Write-Host "  [OK] .mrpack created ($zipSize MB)" -ForegroundColor Green
Write-Host ""

# ── Phase 2: Save location ──
$defaultSave = [IO.Path]::Combine([Environment]::GetFolderPath('Desktop'), 'IridescentCraft.mrpack')
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
    Write-Host "    PrismLauncher will download Forge + Modrinth mods automatically."
    Write-Host ""

    # Wait for PrismLauncher to finish, then prompt with beep
    Write-Host ""
    Write-Host "  ============================================================" -ForegroundColor Yellow
    Write-Host "  =                                                          =" -ForegroundColor Yellow
    Write-Host "  =   WAITING: PrismLauncher is downloading mods.            =" -ForegroundColor Yellow
    Write-Host "  =                                                          =" -ForegroundColor Yellow
    Write-Host "  =   1. Click OK in PrismLauncher's import dialog           =" -ForegroundColor Yellow
    Write-Host "  =   2. Wait for ALL mods to finish downloading             =" -ForegroundColor Yellow
    Write-Host "  =   3. Come back to THIS window and press Enter            =" -ForegroundColor Yellow
    Write-Host "  =                                                          =" -ForegroundColor Yellow
    Write-Host "  =   This will download ~95 remaining CurseForge mods.      =" -ForegroundColor Yellow
    Write-Host "  =                                                          =" -ForegroundColor Yellow
    Write-Host "  ============================================================" -ForegroundColor Yellow
    Write-Host ""
    [Console]::Beep(800, 300); [Console]::Beep(1000, 300)
    $host.UI.RawUI.WindowTitle = "*** IridescentCraft - PRESS ENTER WHEN READY ***"
    Read-Host "    >>> Press Enter AFTER PrismLauncher import is fully complete <<<"
    $host.UI.RawUI.WindowTitle = "IridescentCraft Client Installer"

  try {
    Write-Host ""
    Write-Host "  [VERIFY] Searching for instance mods folder..." -ForegroundColor Cyan

    # ── Find instance mods folder ──
    $instanceMods = ""
    $dataDirs = @(
        "$env:APPDATA\PrismLauncher",
        "$env:LOCALAPPDATA\PrismLauncher",
        "$env:LOCALAPPDATA\Programs\PrismLauncher"
    )
    if ($prismExe) {
        $prismParent = Split-Path $prismExe -Parent
        $dataDirs += $prismParent
    }

    foreach ($dataDir in $dataDirs) {
        if (-not (Test-Path $dataDir)) { continue }
        $searchPaths = @($dataDir)
        if (Test-Path "$dataDir\instances") { $searchPaths += "$dataDir\instances" }
        foreach ($searchDir in $searchPaths) {
            $instances = Get-ChildItem $searchDir -Directory -ErrorAction SilentlyContinue | Where-Object { $_.Name -like "IridescentCraft*" }
            foreach ($inst in $instances) {
                if (Test-Path "$($inst.FullName)\.minecraft\mods") { $instanceMods = "$($inst.FullName)\.minecraft\mods"; break }
                elseif (Test-Path "$($inst.FullName)\minecraft\mods") { $instanceMods = "$($inst.FullName)\minecraft\mods"; break }
                elseif (Test-Path "$($inst.FullName)\mods") { $instanceMods = "$($inst.FullName)\mods"; break }
            }
            if ($instanceMods) { break }
        }
        if ($instanceMods) { break }
    }

    if ($instanceMods) {
        Write-Host "    Found: $instanceMods" -ForegroundColor Green
    } else {
        Write-Host "    Not found automatically. Searched:" -ForegroundColor Yellow
        foreach ($d in $dataDirs) { Write-Host "      $d" -ForegroundColor DarkGray }
        Write-Host ""
        Write-Host "  In PrismLauncher: right-click instance -> Folder -> .minecraft" -ForegroundColor Yellow
        Write-Host ""
        $manualPath = Read-Host "  Paste the .minecraft\mods path here (or Enter to skip)"
        if ($manualPath -and (Test-Path $manualPath)) {
            $instanceMods = $manualPath
        } elseif ($manualPath -and (Test-Path (Split-Path $manualPath))) {
            New-Item -ItemType Directory -Path $manualPath -Force | Out-Null
            $instanceMods = $manualPath
        }
    }

    if (-not $instanceMods) {
        Write-Host "  Skipping mod verification — could not find mods folder." -ForegroundColor Red
    } else {
        Write-Host ""
        Write-Host "  Instance mods: $instanceMods" -ForegroundColor DarkGray
        $existingCount = (Get-ChildItem "$instanceMods\*.jar" -ErrorAction SilentlyContinue).Count
        Write-Host "  JARs found: $existingCount" -ForegroundColor DarkGray
        Write-Host ""

        # ── Build complete expected mod list (Modrinth + CurseForge) ──
        $allExpected = @()

        # Add all Modrinth mods from mrFiles
        foreach ($mr in $mrFiles) {
            $fn = $mr.path -replace '^mods/', ''
            $allExpected += [ordered]@{ filename = $fn; url = $mr.downloads[0] }
        }

        # Add CurseForge mods
        foreach ($cf in $cfMods) {
            $allExpected += $cf
        }

        Write-Host "  [VERIFY] Checking $($allExpected.Count) expected mods..." -ForegroundColor Cyan
        Write-Host ""

        $present = 0; $missing = @(); $dlOK = 0; $dlFail = 0

        foreach ($mod in $allExpected) {
            $modPath = Join-Path $instanceMods $mod.filename
            if (Test-Path -LiteralPath $modPath) {
                $present++
            } else {
                $missing += $mod
            }
        }

        Write-Host "    Present: $present / $($allExpected.Count)"
        if ($missing.Count -eq 0) {
            Write-Host "    All mods verified!" -ForegroundColor Green
        } else {
            Write-Host "    Missing: $($missing.Count) — downloading now..." -ForegroundColor Yellow
            Write-Host ""

            foreach ($mod in $missing) {
                if ([string]::IsNullOrEmpty($mod.url)) {
                    Write-Host "    $($mod.filename) — no URL" -ForegroundColor DarkYellow
                    $dlFail++
                    continue
                }

                Write-Host "    $($mod.filename)" -NoNewline

                $tmp = Join-Path $instanceMods "_verify_dl.tmp"
                $modPath = Join-Path $instanceMods $mod.filename
                $success = $false

                for ($retry = 0; $retry -lt 3; $retry++) {
                    try {
                        $wc = New-Object System.Net.WebClient
                        $wc.DownloadFile($mod.url, $tmp)
                        $wc.Dispose()
                        if ((Test-Path $tmp) -and (Get-Item $tmp).Length -gt 1000) {
                            Move-Item -LiteralPath $tmp -Destination $modPath -Force
                            $success = $true; break
                        } else {
                            if (Test-Path $tmp) { Remove-Item $tmp -Force }
                        }
                    } catch {
                        if (Test-Path $tmp) { Remove-Item $tmp -Force }
                        if ($retry -lt 2) { Start-Sleep -Seconds 2 }
                    }
                }

                if ($success) {
                    Write-Host " OK" -ForegroundColor Green
                    $dlOK++
                } else {
                    Write-Host " FAILED" -ForegroundColor Red
                    $dlFail++
                }
            }

            Write-Host ""
            Write-Host "    Downloaded: $dlOK" -ForegroundColor Green
            if ($dlFail -gt 0) {
                Write-Host "    Still missing: $dlFail (re-run installer to retry)" -ForegroundColor Red
            }
        }

        # Final count
        $finalCount = (Get-ChildItem "$instanceMods\*.jar" -ErrorAction SilentlyContinue).Count
        Write-Host ""
        Write-Host "  Total mods installed: $finalCount" -ForegroundColor Cyan
    }
  } catch {
    Write-Host ""
    Write-Host "  ERROR during verification: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "  Line: $($_.InvocationInfo.ScriptLineNumber)" -ForegroundColor DarkGray
    Write-Host ""
  }
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
    Write-Host "    7. PrismLauncher will download Forge + Modrinth mods"
    Write-Host "    8. Add your Minecraft account in Settings if needed"
    Write-Host "    9. Launch!"
    Write-Host ""
}

# Cleanup
if ($distDir -like "*TEMP*") { Remove-Item $distDir -Recurse -Force -ErrorAction SilentlyContinue }

Write-Host ""
Write-Host "  Done!" -ForegroundColor Green
Write-Host ""
Read-Host "  Press Enter to exit"
