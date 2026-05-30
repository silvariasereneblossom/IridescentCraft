# =============================================================================
# lessons-pre-push.ps1 -- hook step that tracks lessons-learned freshness.
#
# Called from .git/hooks/pre-push (the bash hook chain installed by
# install-hooks.ps1). Two things:
#
# 1. Maintains a state file (`.minecraft/dev/.lessons-state.json`) recording
#    the last-scanned SHA and a push counter.
#
# 2. If commits-since-last-scan crosses CAPTURE_THRESHOLD, attempts to invoke
#    `scan-lessons.ps1` -- either directly (if -BlockOnScan is set) or as a
#    detached background process so the push doesn't wait on it.
#
# 3. If push-count-since-last-QA crosses QA_THRESHOLD, attempts to invoke
#    `qa-lessons.ps1` similarly.
#
# 4. Auto-invocation requires ANTHROPIC_API_KEY in env. Without the key, the
#    script just prints a reminder line and continues. The push never blocks
#    on lessons capture -- it's best-effort instrumentation, not a gate.
#
# Exit codes: always 0. Lessons capture is never a push blocker.
# =============================================================================

[CmdletBinding()]
param(
    [int]$CaptureThreshold = 5,   # auto-scan after N new commits
    [int]$QaThreshold = 20,       # QA review after N pushes
    [switch]$BlockOnScan          # debug: run scan synchronously rather than detached
)

$ErrorActionPreference = 'Continue'  # never abort the push

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = (Resolve-Path (Join-Path $ScriptDir "..\..")).Path
$StateFile = Join-Path $ScriptDir ".lessons-state.json"
$ScanScript = Join-Path $ScriptDir "scan-lessons.ps1"
$QaScript = Join-Path $ScriptDir "qa-lessons.ps1"

# ---- Read or initialize state -------------------------------------------

$state = $null
if (Test-Path $StateFile) {
    try {
        $state = Get-Content $StateFile -Raw | ConvertFrom-Json
    } catch {
        Write-Host "[lessons] state file corrupt; reinitializing"
        $state = $null
    }
}
if (-not $state) {
    # First run: anchor state to current HEAD so we don't sweep entire history.
    $head = (& git -C $RepoRoot rev-parse HEAD 2>$null)
    $state = [PSCustomObject]@{
        last_scanned_sha = $head
        last_qa_sha      = $head
        pushes_since_qa  = 0
        scans_run        = 0
        qa_runs          = 0
    }
}

# ---- Compute deltas ------------------------------------------------------

$currentHead = (& git -C $RepoRoot rev-parse HEAD 2>$null)
if (-not $currentHead) {
    Write-Host "[lessons] could not read HEAD; skipping"
    exit 0
}

$commitsSinceScan = 0
$commitsSinceQa = 0
try {
    $commitsSinceScan = [int](& git -C $RepoRoot rev-list --count "$($state.last_scanned_sha)..$currentHead" 2>$null)
    $commitsSinceQa = [int](& git -C $RepoRoot rev-list --count "$($state.last_qa_sha)..$currentHead" 2>$null)
} catch {
    # last_scanned_sha may have been GC'd if very old; that's OK, treat as fresh
    $commitsSinceScan = $CaptureThreshold + 1
    $commitsSinceQa = $QaThreshold + 1
}

$state.pushes_since_qa = [int]$state.pushes_since_qa + 1

# ---- Detect API key availability ----------------------------------------

$haveApiKey = -not [string]::IsNullOrEmpty($env:ANTHROPIC_API_KEY)
$canAutoInvoke = $haveApiKey -and (Test-Path $ScanScript)

# ---- Decide what to do --------------------------------------------------

$didScan = $false
$didQa = $false

if ($commitsSinceScan -ge $CaptureThreshold) {
    Write-Host ""
    Write-Host "[lessons] $commitsSinceScan commits since last scan (threshold=$CaptureThreshold)"
    if ($canAutoInvoke) {
        Write-Host "[lessons]   auto-invoking scan-lessons.ps1 (background)"
        if ($BlockOnScan) {
            & pwsh -NoProfile -ExecutionPolicy Bypass -File $ScanScript -SinceSha $state.last_scanned_sha
        } else {
            # Detach: spawn a new pwsh process that outlives the push.
            Start-Process -WindowStyle Hidden -FilePath pwsh -ArgumentList @(
                "-NoProfile", "-ExecutionPolicy", "Bypass",
                "-File", $ScanScript,
                "-SinceSha", $state.last_scanned_sha
            )
        }
        $state.last_scanned_sha = $currentHead
        $state.scans_run = [int]$state.scans_run + 1
        $didScan = $true
    } else {
        Write-Host "[lessons]   set ANTHROPIC_API_KEY env var to enable auto-capture"
        Write-Host "[lessons]   or run manually: pwsh $ScanScript -SinceSha $($state.last_scanned_sha)"
    }
}

if ($state.pushes_since_qa -ge $QaThreshold) {
    Write-Host ""
    Write-Host "[lessons] $($state.pushes_since_qa) pushes since last QA review (threshold=$QaThreshold)"
    if ($canAutoInvoke -and (Test-Path $QaScript)) {
        Write-Host "[lessons]   auto-invoking qa-lessons.ps1 (background)"
        Start-Process -WindowStyle Hidden -FilePath pwsh -ArgumentList @(
            "-NoProfile", "-ExecutionPolicy", "Bypass",
            "-File", $QaScript
        )
        $state.last_qa_sha = $currentHead
        $state.pushes_since_qa = 0
        $state.qa_runs = [int]$state.qa_runs + 1
        $didQa = $true
    } else {
        Write-Host "[lessons]   run manually: pwsh $QaScript"
    }
}

# ---- Write state back ----------------------------------------------------

try {
    $state | ConvertTo-Json -Depth 4 | Set-Content $StateFile -Encoding UTF8
} catch {
    Write-Host "[lessons] could not write state file: $($_.Exception.Message)"
}

# Always exit 0 -- lessons capture must NEVER block a push.
exit 0
