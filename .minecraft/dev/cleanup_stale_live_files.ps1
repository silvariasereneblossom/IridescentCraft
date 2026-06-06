# =============================================================================
# One-time live-box stale-file cleanup (docket #88, censused 2026-06-06)
# =============================================================================
# The sync legs' FULL-ZIP path was a non-deleting overlay, so files deleted
# from the repo stranded on consumers. This script removes the censused stale
# set from a live deployment root. It is the manual companion to the
# expected-state manifest system (which prevents future stranding).
#
# USAGE (PowerShell 5.1-safe, run on the affected box):
#   .\cleanup_stale_live_files.ps1                # DRY RUN - lists what it would delete
#   .\cleanup_stale_live_files.ps1 -Apply         # actually deletes
#   .\cleanup_stale_live_files.ps1 -Root 'D:\...' # override the deployment root
#
# Default root = the dedicated server path confirmed from the 2026-06-05 boot
# log. For a CLIENT instance pass -Root '<instance>\.minecraft'.
# ASCII only. Deletes ONLY the explicit censused paths below - nothing else.
# =============================================================================
param(
  [string]$Root = 'C:\Users\silvariazemaitis\Desktop\IridescentCraft Dedicated Server',
  [switch]$Apply
)

$ErrorActionPreference = 'Continue'
if (-not (Test-Path $Root)) {
  Write-Host "[cleanup] root not found: $Root  (pass -Root)" -ForegroundColor Red
  exit 1
}

# Censused stale paths (repo deletions 2026-06-01 .. 2026-06-06), relative to root.
# Order: highest impact first (item 1 restores the live magic_weapon affix pool).
$staleDirs = @(
  'kubejs\data\apotheosis\affixes',      # 1. BLOCKER: shadow tree aborts 8 fixed affixes
  'config\improvedmobs',                  # 3. dead improvedmobs config dir
  'kubejs\data\improvedmobs'              # 3. dead improvedmobs kubejs data
)
$staleFiles = @(
  'config\paxi\datapacks\infinity_ham_blocker.zip',          # 2. dead datapack
  'config\paxi\datapacks\regular.json',                       # 2. inert loose json
  'config\improvedmobs-common.toml',                          # 3. dead config
  # (4. packetfixer entries REMOVED from this list 2026-06-06: the mod was RESTORED
  #  to the pack - its stringSize/nbtMaxSize patches are load-bearing; vanilla's
  #  32767 readUtf cap broke client joins without it. Do NOT delete packetfixer.)
  'kubejs\server_scripts\recipes\tier_skip.js',               # 5. deleted script (still executing)
  'kubejs\server_scripts\loot\diamond_leak_probe.js',         # 5. retired diagnostic
  'kubejs\assets\justlevelingfork\lang\en_us.json',           # 6. retired lang overlay
  'config\linearxpforge-common.toml'                          # 6. orphan config
)

$mode = 'DRY RUN (pass -Apply to delete)'
if ($Apply) { $mode = 'APPLY' }
Write-Host "[cleanup] root: $Root" -ForegroundColor Cyan
Write-Host "[cleanup] mode: $mode" -ForegroundColor Cyan

$found = 0; $removed = 0
foreach ($rel in ($staleDirs + $staleFiles)) {
  $p = Join-Path $Root $rel
  if (Test-Path $p) {
    $found = $found + 1
    if ($Apply) {
      Remove-Item -Recurse -Force $p
      $removed = $removed + 1
      Write-Host "[cleanup] DELETED  $rel" -ForegroundColor Yellow
    } else {
      Write-Host "[cleanup] would delete  $rel"
    }
  } else {
    Write-Host "[cleanup] absent (ok)   $rel" -ForegroundColor DarkGray
  }
}

# 7. improvedmobs_datapack.zip lives OUTSIDE the synced root (world datapacks /
# openloader) - locate it but NEVER auto-delete a world-folder file.
$dpHits = Get-ChildItem -Path $Root -Recurse -Filter 'improvedmobs_datapack.zip' -ErrorAction SilentlyContinue
foreach ($h in $dpHits) {
  Write-Host "[cleanup] FOUND (delete manually after confirming): $($h.FullName)" -ForegroundColor Magenta
}

Write-Host "[cleanup] stale present: $found  deleted: $removed" -ForegroundColor Cyan
if (-not $Apply -and $found -gt 0) {
  Write-Host "[cleanup] re-run with -Apply to delete the listed items" -ForegroundColor Cyan
}
Write-Host "[cleanup] verify after restart: 0 'Codec failure for type affixes', no packetfixer in mod list, no tier_skip/diamond_leak_probe loads, no 'Missing metadata in pack'"
