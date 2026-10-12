# =============================================================================
# generate_modlist.ps1  -  auto-generate the canonical pack mod list
# =============================================================================
# Output: .minecraft/wiki/Mod-List.md
#
# Sources of truth:
#   1. .minecraft/mods/.index/*.pw.toml  -- the pack's mod index (the one source
#      the distro indexes are generated from, see dev/mods/mod_index.py)
#   2. custom_jars_manifest.json  -- custom-bundled jars with no metafile (the
#      same registry cleanup_stale_jars.ps1 keeps by)
#
# Side = the metafile's `side` (both / client / server), nothing else. It says
# where the pack installs the jar; `mod_index.py check` refuses any other value.
# A mod the server must not load is `side = 'client'`: there is no second list.
#
# 2026-10-12: the parser before this one read single-quoted values only and
# grouped on the raw text. The 52 metafiles with `side = ''` were counted in
# the total and then printed under no heading at all; a name in double quotes
# fell back to the file name; and client_only_mods.txt (two stale names)
# overrode the index.
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
$manifestPath = Join-Path $mcRoot   'custom_jars_manifest.json'
$wikiOut      = Join-Path $mcRoot   'wiki\Mod-List.md'

if (-not (Test-Path $indexDir)) {
    Write-Error "mods/.index not found at $indexDir"
    exit 1
}

# ---- One value of a metafile: key = '...' or key = "..." ----
# A value that holds an apostrophe is written in double quotes
# ("YUNG's Better Mineshafts"), so both forms are read. $null when absent.
$valueSingle = "'([^']*)'"
$valueDouble = '"((?:[^"\\]|\\.)*)"'
function Get-MetaValue {
    param([string]$Text, [string]$Key)
    $k = '(?m)^[ \t]*' + [regex]::Escape($Key) + '[ \t]*=[ \t]*'
    $m = [regex]::Match($Text, $k + $valueSingle + '[ \t]*\r?$')
    if ($m.Success) { return $m.Groups[1].Value }
    $m = [regex]::Match($Text, $k + $valueDouble + '[ \t]*\r?$')
    if ($m.Success) { return $m.Groups[1].Value.Replace('\"', '"').Replace('\\', '\') }
    return $null
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
    # Metafiles are UTF-8; Get-Content -Raw reads them as ANSI on Windows PowerShell 5.1.
    $content = [System.IO.File]::ReadAllText($_.FullName, [System.Text.Encoding]::UTF8)
    # Packwiz BaseName is "modname.pw" (file is modname.pw.toml). Strip the .pw suffix for display.
    $fallbackName = $_.BaseName -replace '\.pw$', ''
    $name     = Get-MetaValue $content 'name'
    $filename = Get-MetaValue $content 'filename'
    $side     = Get-MetaValue $content 'side'
    $modrinth = Get-MetaValue $content 'mod-id'
    if (-not $name)     { $name = $fallbackName }
    if (-not $filename) { $filename = '(no filename in .pw.toml)' }
    # mod_index.py check refuses a side that is not both / client / server. A list
    # that silently drops a mod is worse than one that says so: any other value is
    # listed under "both" and reported.
    if (@('both', 'client', 'server') -notcontains $side) {
        Write-Warning ("[modlist] {0}: side = '{1}' is not both / client / server; listed under both" -f $_.Name, $side)
        $side = 'both'
    }

    $mods += [PSCustomObject]@{
        Name      = $name
        Filename  = $filename
        Side      = $side
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
$both   = @($mods | Where-Object { $_.Side -eq 'both' }   | Sort-Object Name)
$client = @($mods | Where-Object { $_.Side -eq 'client' } | Sort-Object Name)
$server = @($mods | Where-Object { $_.Side -eq 'server' } | Sort-Object Name)

# ---- Render Markdown ----
$lines = [System.Collections.Generic.List[string]]::new()
$lines.Add('# IridescentCraft Mod List')
$lines.Add('')
$lines.Add('> Auto-generated by `.minecraft/dev/generate_modlist.ps1` from the pack''s mod index (`mods/.index/`) and the custom-jar manifest.')
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
$lines.Add('Installed on players'' clients, never on the dedicated server. Client-only typically because:')
$lines.Add('- rendering / GUI mod with no server logic, OR')
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
