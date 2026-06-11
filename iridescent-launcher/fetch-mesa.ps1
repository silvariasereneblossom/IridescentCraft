# =============================================================================
# fetch-mesa.ps1 -- download Mesa3D software-OpenGL DLLs for icraft-gui
#
# Why this exists:
#   icraft-gui.exe uses eframe's `glow` renderer, which needs OpenGL 2.0+
#   at runtime. The IridescentCraft server VM has no GPU passthrough; the
#   RDP basic display driver exposes only OpenGL 1.1, so glow exits at
#   init with a "requires opengl 2.0+" error and the GUI silently fails.
#
#   Fix: drop Mesa3D's `opengl32.dll` + `libgallium_wgl.dll` next to
#   icraft-gui.exe. Windows resolves opengl32.dll from the exe directory
#   *before* system32, so Mesa intercepts. The pure-CPU llvmpipe backend
#   inside libgallium_wgl.dll renders egui frames without any GPU.
#
# Why not commit the DLLs:
#   libgallium_wgl.dll is 59 MB and Mesa releases monthly. Not worth
#   blowing up the repo's pack files for a binary every server install
#   can fetch on demand.
#
# Usage:
#   .\fetch-mesa.ps1                            # drop next to .\target\release\icraft-gui.exe
#   .\fetch-mesa.ps1 -Dest "Z:\Users\...\IridescentCraft Dedicated Server"
#   .\fetch-mesa.ps1 -Version 26.1.1            # pin a specific Mesa release
#   .\fetch-mesa.ps1 -Force                     # re-download even if files exist
#
# Source: https://github.com/pal1000/mesa-dist-win (community Windows builds
# of upstream Mesa3D, MIT-licensed). The release-msvc variant matches the
# MSVC toolchain icraft-gui itself builds with.
# =============================================================================

[CmdletBinding()]
param(
    [string]$Dest,
    [string]$Version,
    [switch]$Force
)

$ErrorActionPreference = 'Stop'

# --- Resolve destination directory ---------------------------------------
if (-not $Dest) {
    $scriptDir = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Definition }
    $Dest = Join-Path $scriptDir 'target\release'
}
if (-not (Test-Path $Dest)) {
    throw "Destination directory does not exist: $Dest"
}
$Dest = (Resolve-Path $Dest).Path

$openglDll  = Join-Path $Dest 'opengl32.dll'
$galliumDll = Join-Path $Dest 'libgallium_wgl.dll'

if ((-not $Force) -and (Test-Path $openglDll) -and (Test-Path $galliumDll)) {
    Write-Host "[fetch-mesa] Mesa DLLs already present at $Dest -- skipping. Use -Force to re-fetch."
    exit 0
}

# --- Resolve which Mesa release to pull ----------------------------------
if (-not $Version) {
    Write-Host "[fetch-mesa] Querying latest pal1000/mesa-dist-win release..."
    try {
        $api = Invoke-RestMethod -Uri 'https://api.github.com/repos/pal1000/mesa-dist-win/releases/latest' -UseBasicParsing
    } catch {
        throw "GitHub API call failed: $($_.Exception.Message). Pass -Version <tag> to skip the lookup."
    }
    $Version = $api.tag_name
    Write-Host "[fetch-mesa] Latest is $Version (published $($api.published_at))."
}

$assetName = "mesa3d-$Version-release-msvc.7z"
$assetUrl  = "https://github.com/pal1000/mesa-dist-win/releases/download/$Version/$assetName"

# --- Download to a tmp dir ------------------------------------------------
$tmpDir = Join-Path $env:TEMP "icraft-mesa-$Version"
if (-not (Test-Path $tmpDir)) { New-Item -ItemType Directory -Path $tmpDir | Out-Null }
$archive = Join-Path $tmpDir $assetName

if ((-not (Test-Path $archive)) -or $Force) {
    Write-Host "[fetch-mesa] Downloading $assetUrl ..."
    Invoke-WebRequest -Uri $assetUrl -OutFile $archive -UseBasicParsing
}
$bytes = (Get-Item $archive).Length
Write-Host "[fetch-mesa] Archive: $archive ($([math]::Round($bytes/1MB, 1)) MB)"

# --- Locate 7-Zip ---------------------------------------------------------
$sevenZip = $null
$candidates = @(
    'C:\Program Files\7-Zip\7z.exe',
    'C:\Program Files (x86)\7-Zip\7z.exe',
    "$env:LOCALAPPDATA\Programs\7-Zip\7z.exe"
)
foreach ($p in $candidates) {
    if (Test-Path $p) { $sevenZip = $p; break }
}
if (-not $sevenZip) {
    $cmd = Get-Command 7z -ErrorAction SilentlyContinue
    if ($cmd) { $sevenZip = $cmd.Source }
}
if (-not $sevenZip) {
    throw "7-Zip not found. Install from https://www.7-zip.org and retry, or extract $archive manually and copy x64\opengl32.dll + x64\libgallium_wgl.dll into $Dest."
}

# --- Extract just the two DLLs we need ------------------------------------
Write-Host "[fetch-mesa] Extracting x64\opengl32.dll + x64\libgallium_wgl.dll..."
$extractDir = Join-Path $tmpDir 'extracted'
if (Test-Path $extractDir) { Remove-Item -Recurse -Force $extractDir }
New-Item -ItemType Directory -Path $extractDir | Out-Null

& $sevenZip x -y "-o$extractDir" $archive 'x64\opengl32.dll' 'x64\libgallium_wgl.dll' | Out-Null
if ($LASTEXITCODE -ne 0) {
    throw "7-Zip extraction failed with exit code $LASTEXITCODE."
}

$srcOpengl  = Join-Path $extractDir 'x64\opengl32.dll'
$srcGallium = Join-Path $extractDir 'x64\libgallium_wgl.dll'
if ((-not (Test-Path $srcOpengl)) -or (-not (Test-Path $srcGallium))) {
    throw "Extraction succeeded but expected DLLs are missing under $extractDir."
}

# --- Copy into destination ------------------------------------------------
Copy-Item -Force $srcOpengl  $openglDll
Copy-Item -Force $srcGallium $galliumDll

$ogSize = [math]::Round((Get-Item $openglDll).Length / 1KB, 0)
$gSize  = [math]::Round((Get-Item $galliumDll).Length / 1MB, 1)
Write-Host ""
Write-Host "[fetch-mesa] Done. Mesa $Version DLLs at ${Dest}:"
Write-Host "[fetch-mesa]   opengl32.dll        ${ogSize} KB"
Write-Host "[fetch-mesa]   libgallium_wgl.dll  ${gSize} MB"
Write-Host ""
Write-Host "[fetch-mesa] icraft-gui.exe will now find Mesa on launch. The exe"
Write-Host "[fetch-mesa] sets GALLIUM_DRIVER=llvmpipe + MESA_GL_VERSION_OVERRIDE=4.6"
Write-Host "[fetch-mesa] internally, so no extra env setup is needed."
