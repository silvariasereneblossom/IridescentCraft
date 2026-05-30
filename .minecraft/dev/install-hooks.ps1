# =============================================================================
# install-hooks.ps1 - install the pre-push three-distro sync gate
#
# Writes a git pre-push hook that runs sync-distros.ps1 in detect-only mode.
# Push fails if any watched path is out of mirror across the three distros.
# Bypass for emergencies: git push --no-verify.
#
# Run once after cloning the IridescentCraft repo on a new host:
#   pwsh .minecraft\dev\install-hooks.ps1
# =============================================================================

[CmdletBinding()]
param(
    # Explicit opt-in. Without -Install we only print what would happen.
    # Reason: this gate can be noisy on a tree with pre-existing divergence;
    # the user should run sync-distros.ps1 manually first, tune
    # sync-distros.config.json, and only then commit to the hook.
    [switch]$Install
)

$ErrorActionPreference = 'Stop'

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
# .minecraft/dev/install-hooks.ps1 -> repo root is two levels up
$RepoRoot = (Resolve-Path (Join-Path $ScriptDir "..\..")).Path
$HooksDir = Join-Path $RepoRoot ".git\hooks"

if (-not (Test-Path $HooksDir)) {
    Write-Error "[install-hooks] $HooksDir not found. Are you inside a git checkout?"
    exit 1
}

$PrePushPath = Join-Path $HooksDir "pre-push"
$hookContent = @'
#!/usr/bin/env bash
# IridescentCraft pre-push gate. Four checks, in order:
#   1. generate_modlist.ps1   - regenerate wiki/Mod-List.md from packwiz state
#   2. mirror-wiki.ps1        - propagate pack-side wiki/ -> ../IridescentCraft.wiki/
#   3. sync-distros.ps1       - verify the three distros stayed in sync
#   4. lessons-pre-push.ps1   - track commits-since-last-scan + optionally
#                                auto-invoke scan-lessons.ps1 / qa-lessons.ps1
# If steps 1-2 produce uncommitted changes, push is BLOCKED so author commits.
# Step 3 fails on divergence. Step 4 never blocks (best-effort instrumentation).
# Bypass for emergencies: git push --no-verify.

REPO_ROOT="$(git rev-parse --show-toplevel)"
DEV="$REPO_ROOT/.minecraft/dev"

# Prefer pwsh (PowerShell 7); fall back to Windows PowerShell 5.1.
if command -v pwsh >/dev/null 2>&1; then
    PWSH=(pwsh -NoProfile -ExecutionPolicy Bypass)
else
    PWSH=(powershell.exe -NoProfile -ExecutionPolicy Bypass)
fi

# --- Step 1: regenerate Mod-List.md ---
if [ -f "$DEV/generate_modlist.ps1" ]; then
    "${PWSH[@]}" -File "$DEV/generate_modlist.ps1"
fi

# --- Step 2: mirror pack-side wiki to GitHub Wiki repo ---
if [ -f "$DEV/mirror-wiki.ps1" ]; then
    "${PWSH[@]}" -File "$DEV/mirror-wiki.ps1"
fi

# --- Step 1+2 check: did anything change in the main repo? If so, block ---
if ! git diff --quiet -- .minecraft/wiki/Mod-List.md 2>/dev/null; then
    echo ""
    echo "[pre-push] Mod-List.md regenerated and differs from HEAD."
    echo "  Run: git add .minecraft/wiki/Mod-List.md && git commit -m 'modlist: refresh'"
    echo "  Then re-push. Bypass: git push --no-verify"
    exit 1
fi

# --- Step 3: three-distro sync gate ---
SCRIPT="$DEV/sync-distros.ps1"
if [ ! -f "$SCRIPT" ]; then
    echo "[pre-push] WARN: sync-distros.ps1 not found at $SCRIPT - skipping gate"
    exit 0
fi
"${PWSH[@]}" -File "$SCRIPT"
RESULT=$?
if [ $RESULT -ne 0 ]; then
    echo ""
    echo "[pre-push] three-distro sync FAILED. Fix with:"
    echo "    pwsh .minecraft/dev/sync-distros.ps1 -Fix"
    echo "  then re-stage and re-push. Bypass: git push --no-verify"
    exit 1
fi

# --- Step 4: lessons-learned tracker (best-effort, NEVER blocks push) ---
# Tracks commits-since-last-scan + push-count-since-last-QA. If thresholds
# are crossed AND ANTHROPIC_API_KEY is set in env, spawns scan-lessons.ps1
# (and/or qa-lessons.ps1) as a detached background process. The push
# returns immediately; lessons capture finishes asynchronously and writes
# to ../IridescentCraft-internal/dev/lessons-learned*.md.
if [ -f "$DEV/lessons-pre-push.ps1" ]; then
    "${PWSH[@]}" -File "$DEV/lessons-pre-push.ps1" || true  # never block
fi
'@

if (-not $Install) {
    Write-Host "[install-hooks] DRY RUN. Re-run with -Install to commit the hook."
    Write-Host "[install-hooks] would write the following to $PrePushPath :"
    Write-Host ""
    Write-Host "----- hook content -----"
    Write-Host $hookContent
    Write-Host "----- end -----"
    Write-Host ""
    Write-Host "[install-hooks] Before installing, run sync-distros.ps1 once and tune"
    Write-Host "[install-hooks] sync-distros.config.json until detect-only mode returns 0."
    Write-Host "[install-hooks] Otherwise the hook will block every push until baseline drift is resolved."
    exit 0
}

# UTF-8 without BOM (msys bash mis-reads BOM-prefixed shebangs as garbage)
[System.IO.File]::WriteAllText($PrePushPath, $hookContent, (New-Object System.Text.UTF8Encoding $false))

Write-Host "[install-hooks] wrote $PrePushPath"
Write-Host "[install-hooks] verify by running:  pwsh .minecraft\dev\sync-distros.ps1"
Write-Host "[install-hooks] (returns 0 if all 3 distros in sync, 1 otherwise)"
