# =============================================================================
# generate_modlist.ps1  -  auto-generate the canonical pack mod list
# =============================================================================
# Output: .minecraft/wiki/Mod-List.md
#
# Sources of truth (in this order of precedence for side classification):
#   1. .minecraft/mods/.index/*.pw.toml  -- packwiz-managed mods (most)
#   2. .minecraft/server_distribution/client_only_mods.txt  -- strip list
#   3. custom_jars_manifest.json  -- custom-bundled jars not in packwiz (the
#      single source of truth; same registry cleanup_stale_jars.ps1 keeps by)
#
# Side resolution:
#   - "client" if .pw.toml side='client' OR filename in client_only_mods.txt
#   - "server" if .pw.toml side='server'
#   - "both"   otherwise (default; covers most pack mods)
#
# Run from repo root:
#   pwsh .minecraft/dev/generate_modlist.ps1
#
# Tip: wire as a pre-push hook step so the wiki always reflects the deployed
# pack state.
# =============================================================================

param(
    [string]$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
)

$ErrorActionPreference = 'Stop'

$mcRoot       = Join-Path $RepoRoot '.minecraft'
$indexDir     = Join-Path $mcRoot   'mods\.index'
$clientStrip  = Join-Path $mcRoot   'server_distribution\client_only_mods.txt'
$manifestPath = Join-Path $mcRoot   'custom_jars_manifest.json'
$wikiOut      = Join-Path $mcRoot   'wiki\Mod-List.md'

if (-not (Test-Path $indexDir)) {
    Write-Error "mods/.index not found at $indexDir"
    exit 1
}

# ---- Load the client-strip list (filenames that get removed from server) ----
$clientStripSet = [System.Collections.Generic.HashSet[string]]::new(
    [StringComparer]::OrdinalIgnoreCase)
if (Test-Path $clientStrip) {
    Get-Content $clientStrip | ForEach-Object {
        $line = $_.Trim()
        if ($line -and -not $line.StartsWith('#')) {
            [void]$clientStripSet.Add($line)
        }
    }
}

# ---- Custom-jar list: read from custom_jars_manifest.json (single source of truth) ----
# The manifest is the authoritative custom-jar registry (regen_custom_jars_manifest.ps1)
# and what cleanup_stale_jars.ps1 keeps by. Reading it here (instead of re-parsing the
# $customJars PowerShell literal) keeps the wiki in lockstep and avoids the old
# one-jar-per-regex-line trap that silently dropped jars sharing a source line.
$customJars = @()
if (Test-Path $manifestPath) {
    try {
        $mf = Get-Content $manifestPath -Raw | ConvertFrom-Json
        if ($mf.jars) { $customJars = @($mf.jars.PSObject.Properties.Name) }
    } catch {
        Write-Warning "[modlist] failed to parse $manifestPath : $($_.Exception.Message)"
    }
}

# ---- Parse all .pw.toml files ----
$mods = @()
Get-ChildItem "$indexDir\*.pw.toml" -ErrorAction SilentlyContinue | ForEach-Object {
    $content = Get-Content $_.FullName -Raw
    # Packwiz BaseName is "modname.pw" (file is modname.pw.toml). Strip the .pw suffix for display.
    $fallbackName = $_.BaseName -replace '\.pw$', ''
    $name     = if ($content -match "(?m)^\s*name\s*=\s*'([^']*)'")     { $matches[1] } else { $fallbackName }
    $filename = if ($content -match "(?m)^\s*filename\s*=\s*'([^']*)'") { $matches[1] } else { '(no filename in .pw.toml)' }
    $sideRaw  = if ($content -match "(?m)^\s*side\s*=\s*'([^']*)'")     { $matches[1] } else { 'both' }
    $modrinth = if ($content -match "(?m)^\s*mod-id\s*=\s*'([^']*)'")   { $matches[1] } else { $null }

    # Effective side: client_only_mods.txt overrides .pw.toml 'both' to 'client'
    $effective = $sideRaw
    if ($clientStripSet.Contains($filename)) { $effective = 'client' }

    $mods += [PSCustomObject]@{
        Name      = $name
        Filename  = $filename
        Side      = $effective
        Modrinth  = $modrinth
    }
}

# ---- Add custom jars (manifest) as 'both', skipping any already listed via a
#      packwiz .pw.toml marker (that entry carries a better display name and avoids
#      the double-listing / inflated count for customs that have both). ----
$seenFilenames = [System.Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
foreach ($m in $mods) { [void]$seenFilenames.Add($m.Filename) }
foreach ($c in $customJars) {
    if ($seenFilenames.Contains($c)) { continue }   # already listed via its .pw.toml
    # Strip extension + dashes/underscores for a display name
    $display = ($c -replace '\.jar$', '') -replace '[-_]', ' '
    $mods += [PSCustomObject]@{
        Name      = $display
        Filename  = $c
        Side      = 'both'
        Modrinth  = $null
    }
}

# ---- Group + sort ----
$grouped = $mods | Group-Object -Property Side
$both    = ($grouped | Where-Object Name -eq 'both').Group   | Sort-Object Name
$client  = ($grouped | Where-Object Name -eq 'client').Group | Sort-Object Name
$server  = ($grouped | Where-Object Name -eq 'server').Group | Sort-Object Name

# ---- Render Markdown ----
$lines = [System.Collections.Generic.List[string]]::new()
$lines.Add('# IridescentCraft Mod List')
$lines.Add('')
$lines.Add('> Auto-generated by `.minecraft/dev/generate_modlist.ps1` from packwiz `mods/.index/` + `client_only_mods.txt` + custom-jars allowlist.')
$lines.Add('> DO NOT edit manually -- re-run the script after pack changes.')
$lines.Add('')
$lines.Add(("**Total: {0} mods | Both: {1} | Client-only: {2} | Server-only: {3}**" -f `
    $mods.Count, $both.Count, $client.Count, $server.Count))
$lines.Add('')

$lines.Add(("## Both sides ({0} mods)" -f $both.Count))
$lines.Add('')
$lines.Add('Installed on both client and server -- the bulk of the pack.')
$lines.Add('')
foreach ($m in $both) {
    $modrinth = if ($m.Modrinth) { " [(modrinth)](https://modrinth.com/mod/$($m.Modrinth))" } else { '' }
    $lines.Add(("- **{0}** -- ``{1}``{2}" -f $m.Name, $m.Filename, $modrinth))
}
$lines.Add('')

$lines.Add(("## Client-only ({0} mods)" -f $client.Count))
$lines.Add('')
$lines.Add('Stripped from server installs by `strip_client_mods.bat` before launch. Client-only typically because:')
$lines.Add('- rendering / GUI mod with no server logic, OR')
$lines.Add('- declares `side = "client"` in its packwiz entry, OR')
$lines.Add('- crashes the dedicated server when loaded.')
$lines.Add('')
foreach ($m in $client) {
    $modrinth = if ($m.Modrinth) { " [(modrinth)](https://modrinth.com/mod/$($m.Modrinth))" } else { '' }
    $lines.Add(("- **{0}** -- ``{1}``{2}" -f $m.Name, $m.Filename, $modrinth))
}
$lines.Add('')

$lines.Add(("## Server-only ({0} mods)" -f $server.Count))
$lines.Add('')
$lines.Add('Installed on dedicated server but not bundled with client. Typically server-side admin or world-management tools.')
$lines.Add('')
if ($server.Count -eq 0) {
    $lines.Add('*(none currently)*')
} else {
    foreach ($m in $server) {
        $modrinth = if ($m.Modrinth) { " [(modrinth)](https://modrinth.com/mod/$($m.Modrinth))" } else { '' }
        $lines.Add(("- **{0}** -- ``{1}``{2}" -f $m.Name, $m.Filename, $modrinth))
    }
}
$lines.Add('')

# ---- Write ----
$wikiDir = Split-Path $wikiOut -Parent
if (-not (Test-Path $wikiDir)) { New-Item -ItemType Directory -Path $wikiDir -Force | Out-Null }
$content = $lines -join "`n"
[System.IO.File]::WriteAllText($wikiOut, $content)
Write-Host ("[modlist] {0} mods -> {1} (both={2} client={3} server={4})" -f `
    $mods.Count, $wikiOut, $both.Count, $client.Count, $server.Count) -ForegroundColor Green
