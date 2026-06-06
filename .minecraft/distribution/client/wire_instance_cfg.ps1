# =============================================================================
# wire_instance_cfg.ps1
# =============================================================================
# Invoked from Phase 2 of prism_prelaunch.bat (the kubejs auto_fix that used to
# spawn this was DELETED in 642399e8 -- KubeJS' Rhino class filter now blocks
# java.io.File AND java.lang.ProcessBuilder, so that delegation path is dead).
# The bat already runs every launch with full process privileges (no class
# filter) BEFORE the JVM starts, so it is the right place to self-heal the
# instance.cfg wiring. This script keeps PrismLauncher's instance.cfg pointed
# at our pre-launch + post-exit hooks:
#
#   OverrideCommands  -> true   (gate: without it Prism IGNORES the commands)
#   PreLaunchCommand  -> .minecraft/prism_prelaunch.bat (force-sync + cleanup)
#   PostExitCommand   -> .minecraft/prism_postexit.bat  (TesterLogs auto-push)
#
# NOTE: this self-heals on the SECOND+ launch only -- it can't fix the
# first-run chicken-and-egg, because the bat that runs it must ALREADY be
# wired as PreLaunchCommand for Prism to call it. The one-time manual wiring
# step is documented in container-backup/windows-migration.md.
#
# Rules:
#   - OverrideCommands: assert =true (flip false->true; add if missing). A
#     false value silently disables the very PreLaunchCommand we write.
#   - PreLaunchCommand: rewrite ONLY the two known stale seeds -- the legacy
#     bare `git pull --ff-only` and the zip-path `sync_client.bat` -- up to
#     prism_prelaunch.bat. Any other custom value is left alone.
#   - PostExitCommand: only set if missing or present-but-empty. Never
#     overwrites a tester's custom value.
#   - Skip silently when everything is already wired (no spam on every login).
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

$hasPrelaunch       = $cfg -match 'prism_prelaunch\.bat'
$hasPostexit        = $cfg -match 'prism_postexit\.bat'
$overrideCommandsOk = $cfg -match '(?m)^OverrideCommands=true'

# Everything already wired? Skip silently (no log spam on every launch).
if ($hasPrelaunch -and $hasPostexit -and $overrideCommandsOk) {
    exit 0
}

$changed = $false

# ---- OverrideCommands ------------------------------------------------------
# The gate that makes PrismLauncher actually honor PreLaunchCommand /
# PostExitCommand. A False (or absent) value silently disables BOTH, so the
# bat we wire below would never run. Flip false->true; add under [General]
# if the key is missing entirely. Anchored (?m)^ so we never touch a
# substring elsewhere.
if (-not $overrideCommandsOk) {
    if ($cfg -match '(?m)^OverrideCommands=false') {
        $cfg = $cfg -replace '(?m)^OverrideCommands=false', 'OverrideCommands=true'
        $changed = $true
        Write-Host "[wire_cfg] Flipped OverrideCommands=false -> true (was disabling the pre/post hooks)"
    } elseif ($cfg -notmatch '(?m)^OverrideCommands=') {
        $cfg = $cfg -replace '(\[General\])', "`$1`nOverrideCommands=true"
        $changed = $true
        Write-Host "[wire_cfg] Added missing OverrideCommands=true"
    }
}

# ---- PreLaunchCommand ------------------------------------------------------
# Upgrade the two known stale seeds to prism_prelaunch.bat:
#   (a) legacy bare `git pull --ff-only`  -- wedge-prone, never self-upgraded
#   (b) zip-path `sync_client.bat`        -- wrong path for a git clone
# Any other custom PreLaunchCommand value is left untouched.
if (-not $hasPrelaunch) {
    $preLegacy = '(?m)^PreLaunchCommand=.*\bgit\b.*\bpull\b.*--ff-only.*$'
    $preZip    = '(?m)^PreLaunchCommand=.*sync_client\.bat.*$'
    if ($cfg -match $preLegacy) {
        $cfg = $cfg -replace $preLegacy, 'PreLaunchCommand="$INST_MC_DIR/prism_prelaunch.bat"'
        $changed = $true
        Write-Host "[wire_cfg] Rewrote PreLaunchCommand: legacy git-pull-only -> prism_prelaunch.bat"
    } elseif ($cfg -match $preZip) {
        $cfg = $cfg -replace $preZip, 'PreLaunchCommand="$INST_MC_DIR/prism_prelaunch.bat"'
        $changed = $true
        Write-Host "[wire_cfg] Rewrote PreLaunchCommand: sync_client.bat -> prism_prelaunch.bat"
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
