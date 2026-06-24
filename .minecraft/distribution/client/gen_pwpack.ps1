# =============================================================================
# gen_pwpack.ps1 - generate an ephemeral FLAT packwiz pack for packwiz-installer
# =============================================================================
# packwiz-installer installs each mod jar IN THE METAFILE'S OWN DIRECTORY and does
# NOT strip a `.index` component (empirically verified, installer v0.5.14). Our
# markers live in mods/.index/, so feeding that layout straight to packwiz-installer
# would drop the jars into mods/.index/ instead of mods/. The fix is a FLAT pack:
# metafiles at <out>/mods/<slug>.pw.toml + index.toml referencing "mods/<slug>.pw.toml",
# then run packwiz-installer with --pack-folder=<instance .minecraft> so jars land in
# mods/. This generates that flat pack from the synced mods/.index/ source.
#
# Generated FRESH from the synced markers each sync, so the index CANNOT drift (a
# rebuilt custom jar's new marker hash flows through automatically -- no committed
# index.toml to keep in lockstep). Mirrors dev/gen_packwiz_index.py (the dev copy).
#
# Usage:
#   gen_pwpack.ps1 -IndexDir <mods\.index> -PackTemplate <pack.toml> -OutDir <.pwcache>
# Windows PowerShell 5.1 compatible (no ternary / ?.). UTF-8 no BOM, LF (TOML).
# =============================================================================
param(
    [Parameter(Mandatory = $true)][string]$IndexDir,      # source: mods\.index with *.pw.toml
    [Parameter(Mandatory = $true)][string]$PackTemplate,  # the synced pack.toml (name/versions/[index])
    [Parameter(Mandatory = $true)][string]$OutDir         # ephemeral flat pack root (regenerated)
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path $IndexDir)) { throw "gen_pwpack: IndexDir not found: $IndexDir" }
if (-not (Test-Path $PackTemplate)) { throw "gen_pwpack: PackTemplate not found: $PackTemplate" }

$outMods = Join-Path $OutDir 'mods'
# Clean + recreate the flat mods dir (stale metafiles must not linger -- a removed
# mod's metafile would otherwise keep getting installed).
if (Test-Path $outMods) { Remove-Item $outMods -Recurse -Force -ErrorAction SilentlyContinue }
New-Item -ItemType Directory -Path $outMods -Force | Out-Null

$metas = Get-ChildItem -LiteralPath $IndexDir -Filter '*.pw.toml' -File |
    Sort-Object -Property Name   # ordinal-stable order -> byte-deterministic index

$sha = [System.Security.Cryptography.SHA256]::Create()
function Get-Sha256Hex([byte[]]$bytes) {
    return -join ($sha.ComputeHash($bytes) | ForEach-Object { $_.ToString('x2') })
}

$sb = New-Object System.Text.StringBuilder
[void]$sb.Append("hash-format = `"sha256`"`n`n")
foreach ($m in $metas) {
    $bytes = [System.IO.File]::ReadAllBytes($m.FullName)
    # copy the metafile FLAT into the pack (packwiz reads it from the literal file path)
    [System.IO.File]::WriteAllBytes((Join-Path $outMods $m.Name), $bytes)
    $h = Get-Sha256Hex $bytes
    [void]$sb.Append("[[files]]`n")
    [void]$sb.Append("file = `"mods/$($m.Name)`"`n")   # NO .index -> jar installs to mods/
    [void]$sb.Append("hash = `"$h`"`n")
    [void]$sb.Append("metafile = true`n`n")
}
$indexText = $sb.ToString()
$enc = New-Object System.Text.UTF8Encoding($false)   # no BOM
$indexBytes = $enc.GetBytes($indexText)
[System.IO.File]::WriteAllBytes((Join-Path $OutDir 'index.toml'), $indexBytes)

# pack.toml from the template, with [index] hash = sha256(index.toml bytes)
$indexHash = Get-Sha256Hex $indexBytes
$packLines = [System.IO.File]::ReadAllLines($PackTemplate)
$inIndex = $false
for ($i = 0; $i -lt $packLines.Count; $i++) {
    $s = $packLines[$i].Trim()
    if ($s -match '^\[.*\]$') { $inIndex = ($s -eq '[index]'); continue }
    if ($inIndex -and $s -match '^hash\s*=') { $packLines[$i] = "hash = `"$indexHash`""; $inIndex = $false }
}
[System.IO.File]::WriteAllText((Join-Path $OutDir 'pack.toml'), (($packLines -join "`n") + "`n"), $enc)
$sha.Dispose()

Write-Host "[gen_pwpack] $($metas.Count) metafiles -> flat pack at $OutDir (index hash $($indexHash.Substring(0,12)))"
