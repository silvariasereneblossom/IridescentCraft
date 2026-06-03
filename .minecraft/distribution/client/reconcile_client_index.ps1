# =============================================================================
# reconcile_client_index.ps1 - canonical mods\.index rebuild for the
# git-checkout client instance (called from prism_prelaunch.bat Phase 2).
# =============================================================================
# WHY THIS EXISTS
#
# The instance's live mods\.index\ is a MIX of two layers:
#   - TRACKED main index   -- the packwiz tomls committed at .minecraft/mods/
#     .index/. `git reset --hard origin/main` (Phase 1) already forces these
#     to match origin exactly, INCLUDING deleting any toml origin removed.
#   - UNTRACKED client-only overlay -- fancymenu / konkrete / melody / fastback
#     live ONLY in distribution\client\mods\.index\ (they are NOT in origin's
#     main index). They are dropped into mods\.index\ as untracked files so the
#     client downloads + keeps them. `reset --hard` never touches untracked
#     files, so they survive a force-sync (good).
#
# THE BUG THIS CLOSES
#
# Untracked files also ACCUMULATE. When a both-sides mod is removed from origin
# (e.g. Marium's Soulslike, git-rm'd from every index to fix a server crash),
# its .pw.toml can linger in the instance's mods\.index\ as an untracked
# leftover that `reset --hard` cannot purge. cleanup_stale_jars then sees that
# toml, adds its filename to the "expected" set, and KEEPS the removed jar ->
# the client ships a mod the server no longer has -> registry mismatch
# (soulsweapons:ghostly "Registry Object not present") -> NPE -> DC on join.
#
# THE RECONCILE (matches the canonical-source spec exactly)
#
# Keep a .pw.toml iff it is in origin's MAIN index OR the client-distro index;
# drop it iff it is in NEITHER. We express this on the UNTRACKED layer only, so
# a tracked main-index mod can NEVER be deleted here:
#
#   1. For each UNTRACKED *.pw.toml in mods\.index\ (git ls-files --others):
#        keep   if it exists in distribution\client\mods\.index\  (overlay)
#        DELETE otherwise                                         (stale leftover)
#      Tracked tomls are excluded by --others, so they are untouchable -- their
#      correctness is already guaranteed by `reset --hard origin/main`.
#
#   2. Re-apply the overlay: copy any distribution\client\mods\.index\*.pw.toml
#      missing from mods\.index\ back in. Guarantees the 4 client-only mods are
#      present even on a brand-new checkout (where reset placed only the main
#      index) or if one was deleted out-of-band.
#
# CAUTION (learned the hard way): do NOT `git clean` mods\.index\ -- a blind
# clean nukes the untracked client-only overlay along with the leftovers. This
# script deletes ONLY untracked tomls absent from the client-distro index.
#
# Non-fatal by construction: every step is guarded; the script always exits 0
# so a reconcile hiccup never blocks launch.
# =============================================================================

param(
    [string]$McDir,        # the instance .minecraft directory
    [string]$InstanceDir   # the repo root (parent of .minecraft; holds .git)
)

$ErrorActionPreference = 'Continue'

if (-not $McDir)       { $McDir = Split-Path -Parent $PSScriptRoot }   # best-effort
if (-not $InstanceDir) { $InstanceDir = Split-Path -Parent $McDir }

$liveIndex   = Join-Path $McDir 'mods\.index'
$clientIndex = Join-Path $McDir 'distribution\client\mods\.index'

# The client-distro overlay is the authority on "what client-only tomls are
# legitimate." Without it we cannot tell an overlay file from a stale leftover,
# so skip the drop step entirely rather than risk nuking the overlay.
if (-not (Test-Path $clientIndex)) {
    Write-Host "  [reconcile] client-distro index not found at $clientIndex - skipping (cannot classify overlay)." -ForegroundColor Yellow
    exit 0
}

# Set of legitimate client-only overlay filenames (case-insensitive).
$overlaySet = @{}
Get-ChildItem "$clientIndex\*.pw.toml" -ErrorAction SilentlyContinue | ForEach-Object {
    $overlaySet[$_.Name.ToLower()] = $true
}

$dropped  = 0
$overlaid = 0

# --- Step 1: drop UNTRACKED stale leftovers (untracked AND not an overlay) ---
# `git ls-files --others --exclude-standard` lists ONLY untracked, non-ignored
# files -- so tracked main-index tomls are never even candidates for deletion.
if (Test-Path $liveIndex) {
    $untracked = @()
    try {
        $untracked = & git -C $InstanceDir ls-files --others --exclude-standard -- '.minecraft/mods/.index/' 2>$null
    } catch {
        Write-Host "  [reconcile] git ls-files failed ($($_.Exception.Message)) - skipping stale drop, overlay restore still runs." -ForegroundColor Yellow
        $untracked = @()
    }

    foreach ($rel in $untracked) {
        if (-not $rel) { continue }
        $leaf = ($rel -split '[\\/]')[-1]
        if ($leaf -notlike '*.pw.toml') { continue }
        if ($overlaySet.ContainsKey($leaf.ToLower())) { continue }   # legit overlay -> keep

        $target = Join-Path $liveIndex $leaf
        if (Test-Path -LiteralPath $target) {
            Remove-Item -LiteralPath $target -Force -ErrorAction SilentlyContinue
            Write-Host "  [reconcile] dropped stale untracked index entry: $leaf" -ForegroundColor DarkYellow
            $dropped++
        }
    }
}

# --- Step 2: re-apply the client-only overlay (copy any missing) -------------
if (-not (Test-Path $liveIndex)) {
    New-Item -ItemType Directory -Path $liveIndex -Force | Out-Null
}
Get-ChildItem "$clientIndex\*.pw.toml" -ErrorAction SilentlyContinue | ForEach-Object {
    $dest = Join-Path $liveIndex $_.Name
    if (-not (Test-Path -LiteralPath $dest)) {
        Copy-Item -LiteralPath $_.FullName -Destination $dest -Force -ErrorAction SilentlyContinue
        Write-Host "  [reconcile] restored client-only overlay entry: $($_.Name)" -ForegroundColor Cyan
        $overlaid++
    }
}

if ($dropped -gt 0 -or $overlaid -gt 0) {
    Write-Host "  [reconcile] dropped $dropped stale, restored $overlaid overlay entries." -ForegroundColor Yellow
} else {
    Write-Host "  [reconcile] index already canonical; no changes." -ForegroundColor Green
}

exit 0
