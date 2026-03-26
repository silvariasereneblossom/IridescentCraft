# =============================================================================
# Build Modrinth .mrpack from packwiz .pw.toml index
# =============================================================================
# Converts our .pw.toml mod metadata into a modrinth.index.json,
# packages it with configs/kubejs/datapacks into an .mrpack file
# that PrismLauncher can import natively.
# =============================================================================

param(
    [string]$DistDir = ".",
    [string]$OutputFile = "IridescentCraft.mrpack"
)

[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$indexDir = "$DistDir\mods\.index"
if (-not (Test-Path $indexDir)) {
    Write-Host "ERROR: $indexDir not found" -ForegroundColor Red
    exit 1
}

Write-Host "  Building Modrinth pack (.mrpack)..."
Write-Host ""

# ── Parse all .pw.toml files into modrinth index format ──
$tomlFiles = Get-ChildItem "$indexDir\*.pw.toml"
$quotePattern = "['" + '"]'
$files = @()

foreach ($toml in $tomlFiles) {
    $filename = ''; $side = 'both'; $mode = ''; $url = ''; $hash = ''; $hashFormat = ''
    $fileId = ''; $projectId = ''

    foreach ($line in Get-Content $toml.FullName) {
        $line = $line.Trim()
        if ($line -match "^filename\s*=\s*$quotePattern(.+)$quotePattern") { $filename = $matches[1] }
        if ($line -match "^side\s*=\s*$quotePattern(.+)$quotePattern") { $side = $matches[1] }
        if ($line -match "^mode\s*=\s*$quotePattern(.+)$quotePattern") { $mode = $matches[1] }
        if ($line -match "^url\s*=\s*$quotePattern(.+)$quotePattern") { $url = $matches[1] }
        if ($line -match "^hash\s*=\s*$quotePattern(.+)$quotePattern") { $hash = $matches[1] }
        if ($line -match "^hash-format\s*=\s*$quotePattern(.+)$quotePattern") { $hashFormat = $matches[1] }
        if ($line -match '^file-id\s*=\s*(\d+)') { $fileId = $matches[1] }
        if ($line -match '^project-id\s*=\s*(\d+)') { $projectId = $matches[1] }
    }

    if ([string]::IsNullOrEmpty($filename)) { continue }

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

    if ([string]::IsNullOrEmpty($dlUrl)) { continue }

    # Map side to modrinth env format
    $envClient = "required"
    $envServer = "required"
    if ($side -eq 'client') { $envServer = "unsupported" }
    if ($side -eq 'server') { $envClient = "unsupported" }

    # Build file entry
    $fileEntry = @{
        path = "mods/$filename"
        downloads = @($dlUrl)
        env = @{
            client = $envClient
            server = $envServer
        }
    }

    # Add hash if available
    if ($hash -and $hashFormat) {
        $hashes = @{}
        if ($hashFormat -eq 'sha512') { $hashes['sha512'] = $hash }
        elseif ($hashFormat -eq 'sha256') { $hashes['sha256'] = $hash }
        elseif ($hashFormat -eq 'sha1') { $hashes['sha1'] = $hash }
        if ($hashes.Count -gt 0) { $fileEntry['hashes'] = $hashes }
    }

    # Estimate file size (0 = unknown, PrismLauncher will figure it out)
    $fileEntry['fileSize'] = 0

    $files += $fileEntry
}

Write-Host "    $($files.Count) mods indexed."

# ── Build modrinth.index.json ──
$index = @{
    formatVersion = 1
    game = "minecraft"
    versionId = "1.0.0-alpha"
    name = "IridescentCraft"
    summary = "Progression-focused RPG modpack with 420+ mods, custom classes, races, and origins."
    files = $files
    dependencies = @{
        minecraft = "1.20.1"
        forge = "47.4.6"
    }
}

# ── Build .mrpack (zip) ──
$staging = "$env:TEMP\IridescentCraft-mrpack-staging"
if (Test-Path $staging) { Remove-Item $staging -Recurse -Force }
New-Item -ItemType Directory -Path $staging -Force | Out-Null
New-Item -ItemType Directory -Path "$staging\overrides" -Force | Out-Null
New-Item -ItemType Directory -Path "$staging\overrides\mods" -Force | Out-Null

# Write index
$indexJson = $index | ConvertTo-Json -Depth 10
$indexJson | Set-Content "$staging\modrinth.index.json" -Encoding UTF8
Write-Host "    modrinth.index.json... OK"

# Copy overrides (configs, kubejs, datapacks, custom JARs)
$overrideDirs = @('config', 'defaultconfigs', 'kubejs', 'global_packs')
foreach ($dir in $overrideDirs) {
    if (Test-Path "$DistDir\$dir") {
        Copy-Item "$DistDir\$dir" "$staging\overrides\$dir" -Recurse -Force
        Write-Host "    overrides/$dir... OK"
    }
}

# Copy custom JARs to overrides/mods/
$customJars = Get-ChildItem "$DistDir\mods\*.jar" -ErrorAction SilentlyContinue
if ($customJars) {
    foreach ($jar in $customJars) {
        Copy-Item $jar.FullName "$staging\overrides\mods\" -Force
    }
    Write-Host "    overrides/mods/ ($($customJars.Count) custom JARs)... OK"
}

Write-Host ""
Write-Host "    Creating .mrpack..."

if (Test-Path $OutputFile) { Remove-Item $OutputFile -Force }
Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::CreateFromDirectory($staging, $OutputFile)

$size = [math]::Round((Get-Item $OutputFile).Length / 1MB, 1)
Write-Host "    Created: $OutputFile ($size MB)" -ForegroundColor Green

# Cleanup
Remove-Item $staging -Recurse -Force -ErrorAction SilentlyContinue

Write-Host ""
