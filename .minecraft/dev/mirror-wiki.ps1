# =============================================================================
# mirror-wiki.ps1  -  mirror pack-side wiki to GitHub Wiki repo
# =============================================================================
# The pack-side wiki lives at .minecraft/wiki/ with a nested folder structure
# (classes/, design/, mods/, etc.). GitHub Wiki uses a flat namespace with
# hyphenated filenames. This script applies a curated path mapping so the
# right pack-side .md ends up at the right GitHub Wiki filename.
#
# Source: .minecraft/wiki/**/*.md  (pack-side, primary)
# Target: ../IridescentCraft.wiki/<Mapped-Name>.md  (GitHub Wiki clone)
#
# Files NOT in the mapping table are skipped (e.g., CLAUDE.md is dev-internal).
# Files in the wiki target NOT mapped are LEFT ALONE (e.g., _Sidebar.md,
# Tester-Installation-Guide.md if it has no pack-side equivalent yet).
#
# Run from any directory:
#   pwsh .minecraft/dev/mirror-wiki.ps1
#
# Wire into pre-push hook for auto-propagation. After mirroring, commit + push
# the wiki repo manually (or wire that into the same workflow).
# =============================================================================

[CmdletBinding()]
param(
    [string]$RepoRoot,
    [switch]$DryRun
)

$ErrorActionPreference = 'Stop'

if (-not $RepoRoot) {
    $scriptDir = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Definition }
    $RepoRoot = (Resolve-Path (Join-Path $scriptDir '..\..')).Path
}

$packWiki  = Join-Path $RepoRoot '.minecraft\wiki'
# The GitHub wiki clone is a sibling of the main repo at IridescentcraftDev\IridescentCraft.wiki
$wikiRepo  = Resolve-Path (Join-Path $RepoRoot '..\IridescentCraft.wiki') -ErrorAction SilentlyContinue

if (-not $wikiRepo) {
    Write-Error "GitHub wiki repo not found at $(Join-Path $RepoRoot '..\IridescentCraft.wiki'). Clone it first: gh repo clone silvariasereneblossom/IridescentCraft.wiki"
    exit 1
}

# Curated mapping: pack-side relative path -> GitHub Wiki filename.
# Add new entries here when new pack-side pages are added.
$mapping = @{
    'home.md'                                              = 'Home.md'
    'LICENSE.md'                                           = 'License.md'
    'Mod-List.md'                                          = 'Mod-List.md'
    'classes/overview.md'                                  = 'Classes-and-Races.md'
    'design/changelog.md'                                  = 'Design-Changelog.md'
    'design/master.md'                                     = 'Master-Design-Document.md'
    'design/master-appendix.md'                            = 'Master-Design-Appendix.md'
    'design/iridescent-modular-spells-tetra-migration.md'  = 'Iridescent-Modular-Spells-Tetra-Migration.md'
    'known-issues/tracker.md'                              = 'Known-Issues.md'
    'kubejs/overview.md'                                   = 'KubeJS-Overview.md'
    'meta/credits.md'                                      = 'Credits.md'
    'meta/style-guide.md'                                  = 'Style-Guide.md'
    'mods/custom.md'                                       = 'Custom-Mods.md'
    'mods/overview.md'                                     = 'Mod-Overview.md'
    'progression/overview.md'                              = 'Progression-Overview.md'
    'protocols/8-client-sync.md'                           = 'Client-Sync-Protocol.md'
    'systems/icraft-launcher.md'                           = 'Iridescent-Launcher.md'
    'systems/overview.md'                                  = 'Systems-Overview.md'
    'systems/tetra-materials.md'                           = 'Tetra-Materials.md'
}

$copied  = 0
$skipped = 0
$missing = @()

foreach ($entry in $mapping.GetEnumerator()) {
    $src = Join-Path $packWiki $entry.Key
    $dst = Join-Path $wikiRepo $entry.Value

    if (-not (Test-Path $src)) {
        $missing += $entry.Key
        continue
    }

    # Only copy if content differs (avoid no-op commits in the wiki repo)
    $srcHash = (Get-FileHash $src -Algorithm SHA256).Hash
    $dstHash = if (Test-Path $dst) { (Get-FileHash $dst -Algorithm SHA256).Hash } else { '' }

    if ($srcHash -eq $dstHash) {
        $skipped++
        continue
    }

    if ($DryRun) {
        Write-Host ("  [DRY] would copy: {0} -> {1}" -f $entry.Key, $entry.Value)
    } else {
        Copy-Item -Path $src -Destination $dst -Force
        Write-Host ("  copied: {0} -> {1}" -f $entry.Key, $entry.Value)
    }
    $copied++
}

# Surface untracked pack-side .md files (potential new content not in the mapping)
$packMds = Get-ChildItem -Path $packWiki -Filter '*.md' -Recurse |
    ForEach-Object { $_.FullName.Substring($packWiki.Length + 1) -replace '\\','/' }
$unmapped = $packMds | Where-Object { $_ -notin $mapping.Keys -and $_ -ne 'CLAUDE.md' }

Write-Host ""
Write-Host ("[mirror-wiki] copied {0}, unchanged {1}, missing {2}, unmapped {3}" -f `
    $copied, $skipped, $missing.Count, ($unmapped | Measure-Object).Count) -ForegroundColor Green

if ($missing.Count -gt 0) {
    Write-Host ""
    Write-Host "[mirror-wiki] WARNING: mapped pack-side paths that don't exist:" -ForegroundColor Yellow
    foreach ($m in $missing) { Write-Host "  - $m" -ForegroundColor Yellow }
}

if ($unmapped) {
    Write-Host ""
    Write-Host "[mirror-wiki] INFO: pack-side .md files NOT in the mapping (skipped):" -ForegroundColor Cyan
    foreach ($u in $unmapped) { Write-Host "  - $u" -ForegroundColor Cyan }
    Write-Host "  (add to `$mapping in this script if they should appear on the GitHub Wiki)"
}

# Exit code: 0 if any mirroring happened OR no-op, 1 only on hard errors
exit 0
