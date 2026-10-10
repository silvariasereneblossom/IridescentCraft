# =============================================================================
# preview-expected-state-prune.ps1 - what would the launcher's delete pass remove?
#
# icraft-gui's `expected_state_pass` (iridescent-launcher/icraft-core/src/sync.rs)
# deletes every file under the manifest's managed roots that is NOT listed in
# `<server root>/expected_state.json`, except inside volatile runtime dirs. It
# ships in DRY-RUN (report-only, printed to the GUI console, which has no log
# file). This script reproduces that would-delete list READ-ONLY so the operator
# can review it before setting ICRAFT_EXPECTED_STATE_DRY=0.
#
# Usage:
#   powershell -File preview-expected-state-prune.ps1                 # live box over Z:
#   powershell -File preview-expected-state-prune.ps1 -ServerRoot <path>
#
# Exit code: 0 = nothing would be deleted, 1 = would-delete list is non-empty,
#            2 = manifest missing/unreadable (the real pass deletes nothing then).
# =============================================================================
[CmdletBinding()]
param(
    [string]$ServerRoot = 'Z:\Users\silvariazemaitis\Desktop\IridescentCraft Dedicated Server'
)
$ErrorActionPreference = 'Stop'

# Keep in lockstep with EXPECTED_STATE_VOLATILE_DIRS / EXPECTED_STATE_CACHE_DIR in sync.rs.
$VolatileDirs = @('kubejs/exported', 'kubejs/logs', 'kubejs/libraries', 'kubejs/.cache')
$CacheSegment = '.cache'

$manifestPath = Join-Path $ServerRoot 'expected_state.json'
if (-not (Test-Path -LiteralPath $manifestPath)) {
    Write-Host "[prune-preview] no expected_state.json at $ServerRoot (FAIL-KEEP: the pass deletes nothing)."
    exit 2
}
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
if (-not $manifest.files -or -not $manifest.roots) {
    Write-Host '[prune-preview] manifest has no roots/files (FAIL-KEEP).'
    exit 2
}
$listed = New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::OrdinalIgnoreCase)
foreach ($p in $manifest.files.PSObject.Properties.Name) { [void]$listed.Add($p) }

function Test-Volatile([string]$rel) {
    foreach ($v in $VolatileDirs) { if ($rel -eq $v -or $rel.StartsWith("$v/")) { return $true } }
    return (($rel -split '/') -contains $CacheSegment)
}

Write-Host "[prune-preview] server root : $ServerRoot"
Write-Host "[prune-preview] manifest    : generated_from=$($manifest.generated_from), $($listed.Count) files, roots: $($manifest.roots -join ', ')"

$would = @()
$rootFull = (Resolve-Path -LiteralPath $ServerRoot).Path.TrimEnd('\')
foreach ($root in $manifest.roots) {
    $dir = Join-Path $rootFull ($root -replace '/', '\')
    if (-not (Test-Path -LiteralPath $dir)) { continue }
    Get-ChildItem -LiteralPath $dir -Recurse -File -Force | ForEach-Object {
        $rel = $_.FullName.Substring($rootFull.Length + 1) -replace '\\', '/'
        if (Test-Volatile $rel) { return }
        if (-not $listed.Contains($rel)) {
            $would += [pscustomobject]@{ Rel = $rel; Size = $_.Length; Modified = $_.LastWriteTime }
        }
    }
}

if ($would.Count -eq 0) {
    Write-Host '[prune-preview] would-delete: 0 files.'
    exit 0
}
Write-Host "[prune-preview] would-delete: $($would.Count) file(s):"
$would | Sort-Object Rel | ForEach-Object {
    Write-Host ("  {0,-90} {1,9:N0} B  {2:yyyy-MM-dd}" -f $_.Rel, $_.Size, $_.Modified)
}
Write-Host ''
Write-Host '[prune-preview] by top folder:'
$would | Group-Object { ($_.Rel -split '/')[0..1] -join '/' } | Sort-Object Count -Descending | ForEach-Object {
    Write-Host ("  {0,5}  {1}" -f $_.Count, $_.Name)
}
exit 1
