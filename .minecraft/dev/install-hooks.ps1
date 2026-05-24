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
# Three-distro sync gate. Installed by .minecraft/dev/install-hooks.ps1.
# Fails the push if main, server_distribution, and distribution/client have
# diverged on any watched path. Bypass for emergencies: git push --no-verify.

REPO_ROOT="$(git rev-parse --show-toplevel)"
SCRIPT="$REPO_ROOT/.minecraft/dev/sync-distros.ps1"

if [ ! -f "$SCRIPT" ]; then
    echo "[pre-push] WARN: sync-distros.ps1 not found at $SCRIPT - skipping gate"
    exit 0
fi

# Prefer pwsh (PowerShell 7); fall back to Windows PowerShell 5.1.
if command -v pwsh >/dev/null 2>&1; then
    pwsh -NoProfile -File "$SCRIPT"
else
    powershell.exe -NoProfile -File "$SCRIPT"
fi
RESULT=$?

if [ $RESULT -ne 0 ]; then
    echo ""
    echo "[pre-push] three-distro sync FAILED. Fix with:"
    echo "    pwsh .minecraft/dev/sync-distros.ps1 -Fix"
    echo "  then re-stage and re-push. Bypass: git push --no-verify"
    exit 1
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
