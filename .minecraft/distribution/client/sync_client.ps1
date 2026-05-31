# =============================================================================
# IridescentCraft Client Sync - PrismLauncher pre-launch hook
# =============================================================================
# Keeps the local instance's configs/kubejs/datapacks/mods in sync with the
# GitHub main branch via a SHA-based check. Designed to run as PrismLauncher's
# per-instance pre-launch command. Mirrors server_distribution/phase0_sync.ps1
# behavior — same diff-vs-full-zip strategy, same error-gated SHA marker,
# same self-update staging.
#
# Behavior:
#   1. Find the instance .minecraft directory (prefers $env:INST_MC_DIR which
#      PrismLauncher provides automatically, falls back to detecting by script
#      location, then searching the PrismLauncher instances folder)
#   2. Query GitHub API for the latest main commit SHA
#   3. Compare against .icraft_last_sha in the instance root
#   4. If match: skip the network sync but STILL run local cleanup
#   5. If mismatch or first run: diff-sync changed files (when feasible) OR
#      full-zip overlay; write the new SHA only if every download succeeded;
#      reconcile orphan .pw.toml files from mods/.index/
#   6. ALWAYS (regardless of SHA match): run cleanup_stale_jars to prune
#      orphan jars from mods/, run download_mods to fetch any missing pw.toml
#      jars, ensure instance.cfg has -noverify and the .bat-form
#      PreLaunchCommand. This catches manually-dropped stale mods + legacy
#      jars that would otherwise sit in mods/ until the next repo bump.
#
# Network failure handling: short timeouts on both the API call and zip
# download. On any failure, prints a warning and exits 0 so PrismLauncher
# still launches Minecraft — "continuing with existing files" is always
# safer than blocking play.
#
# Self-update: sync_client.ps1, sync_client.bat, download_mods.ps1, and
# cleanup_stale_jars.ps1 are staged as <name>.new during sync. The .bat
# wrapper finalizes them on the NEXT launch before calling this script
# (PS1 + BAT files are locked while running, so we can't overwrite the
# script that's currently executing).
#
# Force flag: pass -Force to delete .icraft_last_sha and force a full
# re-sync. Useful when the SHA marker is out of sync with disk state.
#
# Install as pre-launch command in PrismLauncher:
#   Instance → Settings → Custom Commands → Pre-launch command:
#   "%INST_MC_DIR%\sync_client.bat"            (preferred; finalizes .new files)
#   powershell -ExecutionPolicy Bypass -File "$INST_MC_DIR/sync_client.ps1"
# =============================================================================

param(
    [switch]$Force
)

$ErrorActionPreference = "Continue"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

# -- Step 1: Locate the instance .minecraft directory --
$instanceMC = $null

if ($env:INST_MC_DIR -and (Test-Path $env:INST_MC_DIR)) {
    $instanceMC = $env:INST_MC_DIR
} elseif ($PSScriptRoot -and (Test-Path (Join-Path $PSScriptRoot 'kubejs'))) {
    # Script lives inside the instance's .minecraft
    $instanceMC = $PSScriptRoot
} else {
    # Fallback: hunt for it in PrismLauncher instances
    foreach ($dataDir in @("$env:APPDATA\PrismLauncher", "$env:LOCALAPPDATA\PrismLauncher")) {
        if (-not (Test-Path $dataDir)) { continue }
        $searchDirs = @($dataDir)
        if (Test-Path "$dataDir\instances") { $searchDirs += "$dataDir\instances" }
        foreach ($searchDir in $searchDirs) {
            $found = Get-ChildItem $searchDir -Directory -ErrorAction SilentlyContinue |
                Where-Object { $_.Name -like "IridescentCraft*" -and (Test-Path "$($_.FullName)\.minecraft\kubejs") } |
                Select-Object -First 1
            if ($found) {
                $instanceMC = "$($found.FullName)\.minecraft"
                break
            }
        }
        if ($instanceMC) { break }
    }
}

if (-not $instanceMC) {
    Write-Host "[IridescentCraft Sync] Could not find instance directory. Skipping sync." -ForegroundColor Yellow
    exit 0
}

Write-Host "[IridescentCraft Sync] Instance: $instanceMC" -ForegroundColor DarkGray

# -- Step 2: Query GitHub API for latest commit SHA --
$apiUrl = 'https://api.github.com/repos/silvariasereneblossom/IridescentCraft/commits/main'
$shaFile = Join-Path $instanceMC '.icraft_last_sha'
$localSha = ''
if (Test-Path $shaFile) { $localSha = (Get-Content $shaFile -Raw).Trim() }

if ($Force) {
    if ($localSha) {
        Write-Host "[IridescentCraft Sync] -Force: clearing .icraft_last_sha to trigger full re-sync." -ForegroundColor Yellow
        Remove-Item $shaFile -Force -ErrorAction SilentlyContinue
        $localSha = ''
    } else {
        Write-Host "[IridescentCraft Sync] -Force: no SHA marker present (already a full-sync run)." -ForegroundColor Yellow
    }
}

$remoteSha = $null
try {
    $headers = @{ 'User-Agent' = 'IridescentCraft-Client-Sync' }
    $resp = Invoke-RestMethod -Uri $apiUrl -Headers $headers -TimeoutSec 10
    $remoteSha = $resp.sha
} catch {
    Write-Host "[IridescentCraft Sync] GitHub API unreachable: $($_.Exception.Message)" -ForegroundColor Yellow
    Write-Host "[IridescentCraft Sync] Continuing with existing files..." -ForegroundColor Yellow
    exit 0
}

# SHA match = no network sync needed, but we STILL want to run the local
# cleanup/download/instance.cfg passes below — testers can manually drop
# stale jars into mods/, or have legacy jars from older pack versions
# that need pruning. Skipping cleanup on the fast path lets stale jars
# accumulate indefinitely while the repo is steady.
$skipNetworkSync = $false
if ($remoteSha -eq $localSha) {
    Write-Host "[IridescentCraft Sync] Up to date (commit $($remoteSha.Substring(0,7))) - running local cleanup pass." -ForegroundColor Green
    $skipNetworkSync = $true
}

if (-not $skipNetworkSync) {
# -- Step 3: Diff-based sync or full zip fallback --
$owner = 'silvariasereneblossom'
$repo = 'IridescentCraft'
$prefix = '.minecraft/'
$exclude = @('world', 'logs', 'crash-reports', 'backups', 'libraries', '.cache', 'TesterLogs', 'journeymap')
$overlayDirs = @('config', 'kubejs', 'global_packs', 'datapack_sources', 'defaultconfigs', 'patchouli_books', 'resourcepacks', 'shaderpacks')
$mirrorList = @()

$useDiff = $false
if ($localSha -and $localSha.Length -eq 40) {
    try {
        $compareUrl = "https://api.github.com/repos/$owner/$repo/compare/${localSha}...${remoteSha}"
        $compare = Invoke-RestMethod -Uri $compareUrl -Headers @{ 'User-Agent' = 'IridescentCraft-Client-Sync' } -TimeoutSec 30
        # GitHub's compare API caps the .files array at 300. If we're AT the
        # cap, the response is silently truncated — we MUST fall back to full
        # zip or we'll silently miss files (mirrors the server's same guard).
        if ($compare.files -and $compare.files.Count -gt 0 -and $compare.files.Count -lt 300) {
            $useDiff = $true
            Write-Host "[IridescentCraft Sync] $($compare.files.Count) files changed ($($localSha.Substring(0,7)) -> $($remoteSha.Substring(0,7)))" -ForegroundColor Cyan
        } elseif ($compare.files -and $compare.files.Count -ge 300) {
            Write-Host "[IridescentCraft Sync] $($compare.files.Count) files changed (API caps at 300 = truncated) - full download." -ForegroundColor Yellow
        }
    } catch {
        Write-Host "[IridescentCraft Sync] Compare API failed - full download." -ForegroundColor Yellow
    }
}

if ($useDiff) {
    # -- Fast path: download only changed files --
    # Self-update staging: these scripts can't safely overwrite themselves
    # while running. The .bat wrapper finalizes <name>.new -> <name> on the
    # NEXT pre-launch invocation, before this script is called.
    $selfUpdateFiles = @(
        'distribution/client/sync_client.ps1',
        'distribution/client/sync_client.bat',
        'distribution/client/download_mods.ps1',
        'distribution/client/cleanup_stale_jars.ps1'
    )
    $rawBase = "https://raw.githubusercontent.com/$owner/$repo/$remoteSha"
    $synced = 0; $removed = 0; $staged = 0; $errors = 0

    foreach ($file in $compare.files) {
        if (-not $file.filename.StartsWith($prefix)) { continue }
        $relPath = $file.filename.Substring($prefix.Length)

        # Skip excluded dirs
        $skip = $false
        foreach ($ex in $exclude) {
            if ($relPath.StartsWith("$ex/")) { $skip = $true; break }
        }
        if ($skip) { continue }

        # Pre-compute self-update path BEFORE the overlay filter so launcher
        # scripts under distribution/client/ (which aren't in $overlayDirs)
        # don't get dropped before reaching the staging block at line ~196.
        # Pre-2026-05-12 the filter at "if (-not $inOverlay -and $relPath.Contains('/'))"
        # silently skipped every launcher-script update on the diff path -
        # bat-flow changes only propagated when SHA-compare caps hit and the
        # full-zip path took over. Tester report: Dan's Magic + Simple Staves
        # mod download stayed broken across multiple syncs.
        $relForSelfUpdate = $file.filename.Substring('.minecraft/'.Length)
        $isSelfUpdate = $selfUpdateFiles -contains $relForSelfUpdate

        # Skip non-overlay paths (only sync dirs we care about + mods)
        # but always let self-update files through.
        $inOverlay = $false
        foreach ($dir in ($overlayDirs + @('mods'))) {
            if ($relPath.StartsWith("$dir/") -or $relPath -eq $dir) { $inOverlay = $true; break }
        }
        # Also allow top-level files like sync_client.ps1 + nested self-update scripts
        if (-not $inOverlay -and -not $isSelfUpdate -and $relPath.Contains('/')) { continue }

        $target = Join-Path $instanceMC $relPath

        if ($file.status -eq 'removed') {
            if (Test-Path $target) { Remove-Item $target -Force -ErrorAction SilentlyContinue; $removed++ }
            continue
        }

        # Self-update files: stage as .new in their target location so the
        # .bat wrapper can finalize on next launch. Target for these is the
        # script basename at the instance root, not the nested repo path -
        # the launcher scripts live flat in $instanceMC.
        if ($isSelfUpdate) {
            $scriptName = Split-Path $relForSelfUpdate -Leaf
            $stageTarget = Join-Path $instanceMC "$scriptName.new"
            try {
                $targetDir = Split-Path $stageTarget -Parent
                if (-not (Test-Path $targetDir)) { New-Item -ItemType Directory -Path $targetDir -Force | Out-Null }
                Invoke-WebRequest -Uri "$rawBase/$($file.filename)" -OutFile $stageTarget -UseBasicParsing -TimeoutSec 30
                $staged++
                Write-Host "[IridescentCraft Sync]   [staged] $relPath" -ForegroundColor Cyan
            } catch {
                Write-Host "[IridescentCraft Sync]   [FAIL] $relPath : $($_.Exception.Message)" -ForegroundColor Red
                $errors++
            }
            continue
        }

        try {
            $targetDir = Split-Path $target -Parent
            if (-not (Test-Path $targetDir)) { New-Item -ItemType Directory -Path $targetDir -Force | Out-Null }
            # Crash-safe write: download to a sidecar .icrafttmp first, then
            # atomically replace the live file once the download is fully on
            # disk. Invoke-WebRequest -OutFile truncates its target as the
            # response stream opens, so writing straight to $target would
            # leave a partial/empty file if the download is interrupted
            # (network drop, crash, kill) - destroying the only copy. Writing
            # to a temp and Move-Item -Force'ing into place (a rename on the
            # same volume) means the existing file is only removed once a
            # complete replacement exists.
            $tmpTarget = "$target.icrafttmp"
            Remove-Item $tmpTarget -Force -ErrorAction SilentlyContinue
            Invoke-WebRequest -Uri "$rawBase/$($file.filename)" -OutFile $tmpTarget -UseBasicParsing -TimeoutSec 30
            Move-Item -Path $tmpTarget -Destination $target -Force
            $synced++
        } catch {
            Remove-Item "$target.icrafttmp" -Force -ErrorAction SilentlyContinue
            Write-Host "[IridescentCraft Sync]   [FAIL] $relPath : $($_.Exception.Message)" -ForegroundColor Red
            $errors++
        }
    }

    # Only persist the SHA marker if EVERY file downloaded successfully.
    # Leaving it unchanged on partial failure forces the next run to retry
    # the same diff (or fall back to full-zip if >= 300 files). Server
    # parity — see phase0_sync.ps1 for the same guard.
    if ($errors -eq 0) {
        Set-Content -Path $shaFile -Value $remoteSha -NoNewline -Encoding ASCII
    } else {
        Write-Host "[IridescentCraft Sync] $errors file(s) failed to download - NOT writing SHA marker. Next launch will retry." -ForegroundColor Yellow
    }
    $mirrorList += "$synced file(s) synced"
    if ($removed -gt 0) { $mirrorList += "$removed removed" }
    if ($staged -gt 0)  { $mirrorList += "$staged staged for next launch" }
    if ($errors -gt 0)  { $mirrorList += "$errors error(s)" }
    Write-Host "[IridescentCraft Sync] Diff sync complete: $($mirrorList -join ', ')" -ForegroundColor Green
} else {
    # -- Slow fallback: full zip download --
    if (-not $localSha) {
        Write-Host "[IridescentCraft Sync] First sync. Downloading $($remoteSha.Substring(0,7))..." -ForegroundColor Cyan
    } else {
        Write-Host "[IridescentCraft Sync] Downloading $($remoteSha.Substring(0,7))..." -ForegroundColor Cyan
    }

    $zipUrl = "https://github.com/$owner/$repo/archive/refs/heads/main.zip"
    $zipFile = Join-Path $env:TEMP 'IridescentCraft-client-sync.zip'
    $extractDir = Join-Path $env:TEMP 'IridescentCraft-client-sync-extract'

    try {
        Invoke-WebRequest -Uri $zipUrl -OutFile $zipFile -UseBasicParsing -TimeoutSec 120
        if (-not (Test-Path $zipFile) -or (Get-Item $zipFile).Length -lt 100000) {
            throw 'Download too small or failed'
        }

        if (Test-Path $extractDir) { Remove-Item $extractDir -Recurse -Force }
        Expand-Archive -Path $zipFile -DestinationPath $extractDir -Force

        $srcRoot = (Get-ChildItem $extractDir -Directory | Select-Object -First 1).FullName
        $src = Join-Path $srcRoot '.minecraft'
        if (-not (Test-Path $src)) { throw "Expected .minecraft/ folder not found in archive" }

        foreach ($dir in $overlayDirs) {
            $srcDir = Join-Path $src $dir
            if (Test-Path $srcDir) {
                Copy-Item -Path $srcDir -Destination $instanceMC -Recurse -Force
                $mirrorList += $dir
            }
        }

        # Custom mod JARs — 3-attempt retry because Windows Defender often
        # locks bytecode-patched JARs (Patchouli, Ars Nouveau) momentarily
        # during scan, which causes a single Copy-Item to fail unpredictably.
        # Server parity (phase0_sync.ps1 has the same retry block).
        $srcMods = Join-Path $src 'mods'
        $destMods = Join-Path $instanceMC 'mods'
        if (Test-Path $srcMods) {
            Get-ChildItem $srcMods -Filter '*.jar' -ErrorAction SilentlyContinue | ForEach-Object {
                $jarName = $_.Name
                $target = Join-Path $destMods $jarName
                if ((-not (Test-Path $target)) -or ((Get-Item $target).Length -ne $_.Length)) {
                    $copied = $false
                    for ($attempt = 1; $attempt -le 3 -and -not $copied; $attempt++) {
                        try {
                            # Crash-safe replace: copy to a sidecar .icrafttmp
                            # then atomically rename over the live JAR. Copy-Item
                            # -Force truncates the destination as it opens it, so
                            # a copy interrupted mid-write (kill, or Defender
                            # locking the file) would leave a truncated JAR while
                            # the only intact copy is the extract dir we delete
                            # during cleanup. Staging + Move-Item -Force means the
                            # existing JAR survives intact until a complete
                            # replacement is on disk.
                            $jarTmp = "$target.icrafttmp"
                            Remove-Item $jarTmp -Force -ErrorAction SilentlyContinue
                            Copy-Item $_.FullName $jarTmp -Force -ErrorAction Stop
                            Move-Item -Path $jarTmp -Destination $target -Force -ErrorAction Stop
                            $copied = $true
                            Write-Host "[IridescentCraft Sync]   Custom JAR: $jarName" -ForegroundColor Yellow
                        } catch {
                            Remove-Item "$target.icrafttmp" -Force -ErrorAction SilentlyContinue
                            if ($attempt -lt 3) {
                                Start-Sleep -Milliseconds 500
                            } else {
                                Write-Host "[IridescentCraft Sync]   [WARN] Could not write $jarName : $($_.Exception.Message)" -ForegroundColor Yellow
                                Write-Host "[IridescentCraft Sync]   [HINT] Whitelist the instance .minecraft folder in Windows Defender." -ForegroundColor Yellow
                            }
                        }
                    }
                }
            }
        }

        # mods/.index
        $srcIndex = Join-Path $src 'mods\.index'
        $destIndex = Join-Path $instanceMC 'mods\.index'
        if (Test-Path $srcIndex) {
            if (-not (Test-Path $destIndex)) { New-Item -ItemType Directory -Path $destIndex -Force | Out-Null }
            Get-ChildItem "$destIndex\*.pw.toml" -ErrorAction SilentlyContinue | ForEach-Object {
                $srcFile = Join-Path $srcIndex $_.Name
                if (-not (Test-Path $srcFile)) { Remove-Item $_.FullName -Force }
            }
            Copy-Item -Path "$srcIndex\*" -Destination $destIndex -Recurse -Force
            $mirrorList += 'mods/.index'
        }

    # Self-update files staged from distribution/client/ as <name>.new at
    # the instance root. The .bat wrapper finalizes them on the NEXT
    # launch before invoking this script — same pattern as the server's
    # phase0_sync.ps1 + iridescentserver.bat.
    $srcClientDir = Join-Path $srcRoot '.minecraft\distribution\client'
    if (Test-Path $srcClientDir) {
        foreach ($scriptName in @('sync_client.ps1', 'sync_client.bat', 'download_mods.ps1', 'cleanup_stale_jars.ps1')) {
            $srcScript = Join-Path $srcClientDir $scriptName
            $destScript = Join-Path $instanceMC $scriptName
            if (Test-Path $srcScript) {
                $srcHash = (Get-FileHash $srcScript -Algorithm SHA1).Hash
                $destHash = if (Test-Path $destScript) { (Get-FileHash $destScript -Algorithm SHA1).Hash } else { '' }
                if ($srcHash -ne $destHash) {
                    Copy-Item $srcScript "$destScript.new" -Force
                    Write-Host "[IridescentCraft Sync]   [staged] $scriptName" -ForegroundColor Cyan
                }
            }
        }
    }

    # Selective top-level files: pack.png/icon.png always overlay (these are
    # pack identity, not user state). optionsshaders.txt seeds only when the
    # player doesn't already have one — so first launch auto-enables our
    # default shader, but the player's later choices are preserved.
    foreach ($topFile in @('pack.png', 'icon.png')) {
        $srcFile = Join-Path $src $topFile
        if (Test-Path $srcFile) {
            Copy-Item -Path $srcFile -Destination $instanceMC -Force
        }
    }
    $shaderOptsSrc = Join-Path $src 'optionsshaders.txt'
    $shaderOptsDest = Join-Path $instanceMC 'optionsshaders.txt'
    if ((Test-Path $shaderOptsSrc) -and (-not (Test-Path $shaderOptsDest))) {
        Copy-Item -Path $shaderOptsSrc -Destination $shaderOptsDest -Force
        $mirrorList += 'optionsshaders.txt (seed)'
    }

    Write-Host "[IridescentCraft Sync] Overlaid: $($mirrorList -join ', ')" -ForegroundColor DarkGray

    # Write new SHA
    Set-Content -Path $shaFile -Value $remoteSha -NoNewline -Encoding ASCII

    # Cleanup
    Remove-Item $zipFile -Force -ErrorAction SilentlyContinue
    Remove-Item $extractDir -Recurse -Force -ErrorAction SilentlyContinue

    Write-Host "[IridescentCraft Sync] Overlay complete." -ForegroundColor Green
    } catch {
        Write-Host "[IridescentCraft Sync] Overlay failed: $($_.Exception.Message)" -ForegroundColor Yellow
        Write-Host "[IridescentCraft Sync] Continuing with existing files (cleanup will still run)." -ForegroundColor Yellow
        Remove-Item $zipFile -Force -ErrorAction SilentlyContinue
        Remove-Item $extractDir -Recurse -Force -ErrorAction SilentlyContinue
        # Don't exit — fall through so cleanup_stale_jars + download_mods
        # still run on partial state.
    }
}
} # end if (-not $skipNetworkSync)

# -- Step 4a: Stale-JAR cleanup --
# Removes mods/*.jar files that are neither in mods/.index/*.pw.toml nor in
# the cleanup script's hardcoded custom-JAR allowlist. Catches orphans from
# previously-managed packwiz entries (e.g., upstream justlevelingfork-1.2.1.jar
# after the iridescent fork replaced it; legacy mod versions after a bump).
$cleanupScript = Join-Path $instanceMC 'cleanup_stale_jars.ps1'
if (Test-Path $cleanupScript) {
    Write-Host "[IridescentCraft Sync] Cleaning stale JARs..." -ForegroundColor Cyan
    try {
        $modsDir = Join-Path $instanceMC 'mods'
        $indexDir = Join-Path $modsDir '.index'
        & $cleanupScript -ModsDir $modsDir -IndexDir $indexDir 2>&1 | Where-Object {
            $_ -match 'cleanup'
        }
    } catch {
        Write-Host "[IridescentCraft Sync] Cleanup step failed (non-fatal): $($_.Exception.Message)" -ForegroundColor Yellow
    }
}

# -- Step 4b: Download any new mod JARs --
# download_mods.ps1 is diff-aware - it skips JARs that already exist by filename,
# so this only hits the network for actually-new mods.
$downloadScript = Join-Path $instanceMC 'download_mods.ps1'
if (-not (Test-Path $downloadScript)) {
    # Downloaded fresh from the archive overlay
    $downloadScript = Join-Path $src 'distribution\client\download_mods.ps1'
}

if (Test-Path $downloadScript) {
    $modsDir = Join-Path $instanceMC 'mods'
    $indexDir = Join-Path $modsDir '.index'
    if ((Test-Path $indexDir) -and (Test-Path $modsDir)) {
        Write-Host "[IridescentCraft Sync] Checking for new mod JARs..." -ForegroundColor Cyan
        try {
            & $downloadScript -IndexDir $indexDir -ModsDir $modsDir 2>&1 | Where-Object {
                $_ -match 'Downloaded|Failed|^\s*\[' -or $_ -match '^\s{2}\S'
            } | Select-Object -First 50
        } catch {
            Write-Host "[IridescentCraft Sync] Mod download step failed (non-fatal): $($_.Exception.Message)" -ForegroundColor Yellow
        }
    }
}

# Ensure instance.cfg has the right pre-launch + JVM settings.
# Two corrections we apply if missing:
#   (1) PreLaunchCommand pointing at sync_client.bat (NOT .ps1 directly).
#       The .bat finalizes any <name>.new self-update files BEFORE invoking
#       this script. PrismLauncher hooks installed before 2026-05-01 wired
#       the .ps1 directly, which blocks self-update. We auto-rewrite.
#   (2) -noverify in JvmArgs. Required for our bytecode-patched JARs
#       (Patchouli, ars_nouveau) which fail JVM verification otherwise.
$instDir = if ($env:INST_DIR) { $env:INST_DIR } elseif ($instanceMC) { Split-Path $instanceMC -Parent } else { $null }
if ($instDir) {
    $cfgPath = Join-Path $instDir 'instance.cfg'
    if (Test-Path $cfgPath) {
        $cfg = Get-Content $cfgPath -Raw
        $cfgChanged = $false

        # (1) PreLaunchCommand: fix legacy ".ps1 directly" form to the .bat
        # form. -replace would interpret literal $INST_MC_DIR as a regex
        # backreference, so we rewrite line-by-line instead.
        $desiredPLC = 'PreLaunchCommand=cmd.exe /c "$INST_MC_DIR/sync_client.bat"'
        if ($cfg -match 'PreLaunchCommand=.*sync_client\.ps1' -and $cfg -notmatch 'PreLaunchCommand=.*sync_client\.bat') {
            $cfg = ($cfg -split "`r?`n" | ForEach-Object {
                if ($_ -match '^PreLaunchCommand=') { $desiredPLC } else { $_ }
            }) -join "`n"
            if ($cfg -notmatch '(?m)^OverrideCommands=true') {
                $cfg = $cfg -replace '(?m)^OverrideCommands=false', 'OverrideCommands=true'
                if ($cfg -notmatch '(?m)^OverrideCommands=') {
                    $cfg = $cfg -replace '(\[General\])', "`$1`nOverrideCommands=true"
                }
            }
            $cfgChanged = $true
            Write-Host "[IridescentCraft Sync] Rewrote PreLaunchCommand to use sync_client.bat (was .ps1 direct)." -ForegroundColor Yellow
        }

        # (2) -noverify in JvmArgs.
        #
        # Two independent invariants:
        #   (2a) OverrideJavaArgs=true  (gate that makes PrismLauncher actually
        #        read JvmArgs; PrismLauncher's UI flips this to false on certain
        #        save paths, silently dropping -noverify even when the JvmArgs
        #        line still has it -- caught 2026-05-28).
        #   (2b) JvmArgs contains -noverify  (the arg itself, for bytecode-
        #        patched Patchouli + Ars Nouveau which fail JVM class
        #        verification otherwise).
        # Check both independently; fixing only one if the other already holds
        # would have masked today's bug.
        if ($cfg -match '(?m)^OverrideJavaArgs=false') {
            $cfg = $cfg -replace '(?m)^OverrideJavaArgs=false', 'OverrideJavaArgs=true'
            $cfgChanged = $true
            Write-Host "[IridescentCraft Sync] Flipped OverrideJavaArgs=false -> true (was silently dropping JvmArgs)" -ForegroundColor Yellow
        } elseif ($cfg -notmatch '(?m)^OverrideJavaArgs=') {
            $cfg = $cfg -replace '(\[General\])', "`$1`nOverrideJavaArgs=true"
            $cfgChanged = $true
            Write-Host "[IridescentCraft Sync] Added missing OverrideJavaArgs=true" -ForegroundColor Yellow
        }
        if ($cfg -notmatch '(?m)^JvmArgs=.*-noverify') {
            if ($cfg -match '(?m)^JvmArgs=(.*)$') {
                $existing = $matches[1].Trim()
                if ($existing) {
                    $cfg = $cfg -replace "(?m)^JvmArgs=.*$", "JvmArgs=-noverify $existing"
                } else {
                    $cfg = $cfg -replace "(?m)^JvmArgs=.*$", "JvmArgs=-noverify"
                }
            } else {
                $cfg = $cfg -replace '(\[General\])', "`$1`nJvmArgs=-noverify"
            }
            $cfgChanged = $true
            Write-Host "[IridescentCraft Sync] Added -noverify to JVM args (required for patched mods)" -ForegroundColor Yellow
        }

        if ($cfgChanged) {
            Set-Content $cfgPath $cfg -NoNewline
        }
    }
}

Write-Host "[IridescentCraft Sync] Done - launching..." -ForegroundColor Green
exit 0
