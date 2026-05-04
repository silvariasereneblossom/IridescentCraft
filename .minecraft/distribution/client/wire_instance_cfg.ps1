# =============================================================================
# wire_instance_cfg.ps1
# =============================================================================
# Spawned from kubejs/client_scripts/auto_fix_prism_prelaunch.js on first
# in-world login. Rewrites PrismLauncher's instance.cfg to point at our
# pre-launch + post-exit hooks:
#
#   PreLaunchCommand  -> .minecraft/prism_prelaunch.bat (git pull + cleanup)
#   PostExitCommand   -> .minecraft/prism_postexit.bat  (TesterLogs auto-push)
#
# This lives outside KubeJS because KubeJS' Rhino class filter blocks
# java.io.File / java.nio.file.Files (security default), so the auto_fix
# script can't read/write instance.cfg directly. ProcessBuilder IS allowed,
# so we delegate filesystem work to PowerShell.
#
# Rules (mirror what auto_fix_prism_prelaunch.js used to enforce inline):
#   - PreLaunchCommand: rewrite ONLY if it matches the legacy bare
#     `git pull --ff-only` pattern. Custom values are left alone.
#   - PostExitCommand: only set if missing or present-but-empty. Never
#     overwrites a tester's custom value.
#   - Skip silently when both are already wired (no spam on every login).
#
# Memory: feedback_powershell_traps.md (em-dash in strings -> CP1252 parse-bomb)
# =============================================================================

param([string]$GameDir)

if (-not $GameDir) {
    Write-Host "[wire_cfg] No -GameDir argument; bailing"
    exit 0
}

$instanceCfg = Join-Path $GameDir '..\instance.cfg'
if (-not (Test-Path $instanceCfg)) {
    Write-Host "[wire_cfg] No instance.cfg at $instanceCfg; not a Prism instance"
    exit 0
}

$cfg = Get-Content -Path $instanceCfg -Raw -Encoding UTF8

$hasPrelaunch = $cfg -match 'prism_prelaunch\.bat'
$hasPostexit  = $cfg -match 'prism_postexit\.bat'

# Both already wired? Skip silently.
if ($hasPrelaunch -and $hasPostexit) {
    exit 0
}

$changed = $false

# ---- PreLaunchCommand ------------------------------------------------------
if (-not $hasPrelaunch) {
    $prePattern = '(?m)^PreLaunchCommand=.*\bgit\b.*\bpull\b.*--ff-only.*$'
    if ($cfg -match $prePattern) {
        $cfg = $cfg -replace $prePattern, 'PreLaunchCommand="$INST_MC_DIR/prism_prelaunch.bat"'
        $changed = $true
        Write-Host "[wire_cfg] Rewrote PreLaunchCommand: legacy git-pull-only -> prism_prelaunch.bat"
    }
    # Other custom commands left alone.
}

# ---- PostExitCommand -------------------------------------------------------
if (-not $hasPostexit) {
    $postLineMatch = [regex]::Match($cfg, '(?m)^PostExitCommand=(.*)$')
    if ($postLineMatch.Success) {
        if ($postLineMatch.Groups[1].Value.Trim() -eq '') {
            $cfg = $cfg -replace '(?m)^PostExitCommand=.*$', 'PostExitCommand="$INST_MC_DIR/prism_postexit.bat"'
            $changed = $true
            Write-Host "[wire_cfg] Set empty PostExitCommand -> prism_postexit.bat"
        } else {
            Write-Host "[wire_cfg] PostExitCommand has custom value; leaving alone"
        }
    } else {
        if (-not $cfg.EndsWith("`n")) { $cfg += "`n" }
        $cfg += 'PostExitCommand="$INST_MC_DIR/prism_postexit.bat"' + "`n"
        $changed = $true
        Write-Host "[wire_cfg] Added PostExitCommand -> prism_postexit.bat"
    }
}

if ($changed) {
    # -NoNewline because we already manage trailing newlines above.
    Set-Content -Path $instanceCfg -Value $cfg -NoNewline -Encoding UTF8
    Write-Host "[wire_cfg] instance.cfg updated"
}

exit 0
