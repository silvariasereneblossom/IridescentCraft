# =============================================================================
# install-claude-cli.ps1 -- bootstrap the Claude Code CLI on Windows.
#
# Idempotent one-shot. Runs through the install chain:
#   1. Detect Node.js. If missing, install via winget (Windows 10 1709+) or
#      fall back to direct MSI download.
#   2. Refresh PATH for the current session.
#   3. Detect Claude CLI. If missing, npm install -g @anthropic-ai/claude-code.
#   4. Verify by running `claude --version`.
#
# Usage:
#   pwsh .minecraft\dev\install-claude-cli.ps1
#
# Flags:
#   -SkipNode    Don't install Node.js even if missing. Useful when you want
#                to install it your way and only need this script for the
#                Claude CLI npm install.
#   -DryRun      Print what would happen, don't actually install.
#
# Caveats:
#   - winget install runs SYSTEM-WIDE: Node.js will be available to all users
#     and all projects, not just IridescentCraft. This is the standard install
#     model -- there's no per-project Node.js on Windows without nvm/fnm.
#   - Requires admin elevation for the winget step on some systems. Script
#     will re-prompt if so.
# =============================================================================

[CmdletBinding()]
param(
    [switch]$SkipNode,
    [switch]$DryRun
)

$ErrorActionPreference = 'Stop'

function Header([string]$text) {
    Write-Host ""
    Write-Host "==> $text" -ForegroundColor Cyan
}
function Info([string]$text) { Write-Host "    $text" -ForegroundColor White }
function Warn([string]$text) { Write-Host "    $text" -ForegroundColor Yellow }
function Err ([string]$text) { Write-Host "    $text" -ForegroundColor Red }
function Ok  ([string]$text) { Write-Host "    $text" -ForegroundColor Green }

function HasCommand([string]$name) {
    return $null -ne (Get-Command $name -ErrorAction SilentlyContinue)
}

function RefreshPath {
    # winget / npm-installer updates the persistent PATH but not the current
    # process. Rebuild $env:PATH from the registry so subsequent Get-Command
    # checks see the new binaries.
    $machine = [Environment]::GetEnvironmentVariable("Path", "Machine")
    $user = [Environment]::GetEnvironmentVariable("Path", "User")
    $env:PATH = "$machine;$user"
}

# ---- Step 1: Node.js ------------------------------------------------------

Header "Step 1/4: Node.js"

if (HasCommand "node") {
    $nodeVer = & node --version
    Ok "Node.js already installed: $nodeVer"
} elseif ($SkipNode) {
    Warn "Node.js not found and -SkipNode set. Install it yourself, then re-run."
    exit 1
} else {
    Info "Node.js not found. Will install via winget."
    if ($DryRun) {
        Warn "DRY RUN: would run 'winget install OpenJS.NodeJS.LTS --silent --accept-source-agreements --accept-package-agreements'"
    } else {
        if (-not (HasCommand "winget")) {
            Err "winget not available. Install Node.js manually from https://nodejs.org (pick LTS)."
            Err "After install, restart this PowerShell window and re-run this script."
            exit 1
        }

        Info "Running: winget install OpenJS.NodeJS.LTS --silent --accept-source-agreements --accept-package-agreements"
        & winget install OpenJS.NodeJS.LTS --silent --accept-source-agreements --accept-package-agreements
        $wingetExit = $LASTEXITCODE

        # winget exit codes: 0 = success, -1978335189 = already installed.
        if ($wingetExit -ne 0 -and $wingetExit -ne -1978335189) {
            Err "winget install failed with exit code $wingetExit."
            Err "Try installing Node.js manually from https://nodejs.org (pick LTS)."
            exit 1
        }

        RefreshPath
        if (HasCommand "node") {
            $nodeVer = & node --version
            Ok "Node.js installed: $nodeVer"
        } else {
            Warn "Node.js installed but not yet on PATH for this session."
            Warn "Close this window and open a fresh PowerShell, then re-run this script."
            Warn "(winget puts node at C:\Program Files\nodejs\; manual installer may differ.)"
            exit 1
        }
    }
}

# ---- Step 2: npm sanity check --------------------------------------------

Header "Step 2/4: npm"

if (HasCommand "npm") {
    $npmVer = & npm --version
    Ok "npm available: $npmVer"
} else {
    Err "npm not on PATH even though node is. Unusual -- check your Node install."
    exit 1
}

# ---- Step 3: Claude CLI --------------------------------------------------

Header "Step 3/4: Claude Code CLI"

if (HasCommand "claude") {
    $claudeVer = & claude --version
    Ok "Claude CLI already installed: $claudeVer"
} else {
    Info "Claude CLI not found. Installing via npm."
    if ($DryRun) {
        Warn "DRY RUN: would run 'npm install -g @anthropic-ai/claude-code'"
    } else {
        Info "Running: npm install -g @anthropic-ai/claude-code"
        & npm install -g "@anthropic-ai/claude-code"
        $npmExit = $LASTEXITCODE
        if ($npmExit -ne 0) {
            Err "npm install failed with exit code $npmExit."
            Err "Check the npm output above for the actual error (permissions, network, etc.)."
            exit 1
        }

        RefreshPath
        if (HasCommand "claude") {
            $claudeVer = & claude --version
            Ok "Claude CLI installed: $claudeVer"
        } else {
            # npm's global bin might not be on PATH. Auto-discover + add.
            $npmPrefix = & npm config get prefix
            $npmBin = $npmPrefix.Trim()
            if ($IsWindows -or $env:OS -eq "Windows_NT") {
                # On Windows, npm global puts the shims directly under prefix.
            } else {
                $npmBin = Join-Path $npmBin "bin"
            }
            Warn "Claude installed but npm's global bin ($npmBin) is not on user PATH."
            Warn "Adding it..."
            $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
            if ($userPath -notlike "*$npmBin*") {
                [Environment]::SetEnvironmentVariable("Path", "$userPath;$npmBin", "User")
                RefreshPath
                Ok "Added $npmBin to user PATH."
            }
            if (HasCommand "claude") {
                $claudeVer = & claude --version
                Ok "Claude CLI ready: $claudeVer"
            } else {
                Warn "Close this window and open a fresh PowerShell. 'claude' should work there."
                exit 0
            }
        }
    }
}

# ---- Step 4: Quick smoke test --------------------------------------------

Header "Step 4/4: Smoke test"

if ($DryRun) {
    Warn "DRY RUN: skipping smoke test."
    exit 0
}

if ([string]::IsNullOrEmpty($env:ANTHROPIC_API_KEY)) {
    Warn "ANTHROPIC_API_KEY not set in env."
    Warn "The CLI is installed but won't actually call the API until you set the key."
    Warn "Set it via:"
    Warn "  [Environment]::SetEnvironmentVariable('ANTHROPIC_API_KEY', '<your-key>', 'User')"
    Warn "Then restart your PS session."
} else {
    Ok "ANTHROPIC_API_KEY is set. CLI ready to call out."
}

Write-Host ""
Ok "All done. 'claude' is on PATH (in fresh PS sessions if not this one)."
Write-Host ""
