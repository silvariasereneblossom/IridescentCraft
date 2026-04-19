# =============================================================================
# IridescentCraft Server Diagnostic Dump
# =============================================================================
# Captures everything needed to diagnose sync / script / config issues into a
# single file: icraft_diagnostic.txt. Push that file to the repo so Claude
# can read it without back-and-forth round trips.
#
# Usage (from the server directory):
#   powershell -ExecutionPolicy Bypass -File diagnose.ps1
#
# Or from anywhere:
#   powershell -ExecutionPolicy Bypass -File diagnose.ps1 -ServerDir "<path>"
#
# Output: <ServerDir>\icraft_diagnostic.txt
# =============================================================================

param(
    [string]$ServerDir = (Get-Location).Path
)

$ServerDir = $ServerDir.TrimEnd('\', '/', '"')

# Auto-detect nested "IridescentCraft Dedicated Server" subfolder — the bat
# relaunches inside a subfolder on first run, so from outside we need to walk in.
$nested = Join-Path $ServerDir 'IridescentCraft Dedicated Server'
if ((Test-Path (Join-Path $nested '.icraft_server')) -and (-not (Test-Path (Join-Path $ServerDir '.icraft_server')))) {
    $ServerDir = $nested
    Write-Host "[diag] Auto-detected nested server dir: $ServerDir" -ForegroundColor Cyan
}

$OutFile = Join-Path $ServerDir 'icraft_diagnostic.txt'
if (Test-Path $OutFile) { Remove-Item $OutFile -Force }

function Log([string]$msg = '') { Add-Content -Path $OutFile -Value $msg -Encoding UTF8 }
function Section([string]$title) {
    Log ''
    Log '========================================================================'
    Log "  $title"
    Log '========================================================================'
}
function DumpFile([string]$path, [int]$head = 30, [int]$tail = 30) {
    if (-not (Test-Path $path)) { Log "  (MISSING: $path)"; return }
    $item = Get-Item $path
    $hash = (Get-FileHash $path -Algorithm SHA256 -ErrorAction SilentlyContinue).Hash
    Log "  path:   $path"
    Log "  size:   $($item.Length) bytes"
    Log "  mtime:  $($item.LastWriteTime)"
    Log "  sha256: $hash"
    Log ''
    $content = Get-Content $path -ErrorAction SilentlyContinue
    if (-not $content) { Log '  (empty or unreadable)'; return }
    if ($content.Count -le ($head + $tail + 5)) {
        Log '  -- full content --'
        $content | ForEach-Object { Log $_ }
    } else {
        Log "  -- first $head lines --"
        $content[0..($head - 1)] | ForEach-Object { Log $_ }
        Log "  ... ($($content.Count - $head - $tail) lines truncated) ..."
        Log "  -- last $tail lines --"
        $content[-$tail..-1] | ForEach-Object { Log $_ }
    }
}
function Grep([string]$path, [string]$pattern) {
    if (-not (Test-Path $path)) { Log "  (MISSING: $path)"; return }
    $m = Select-String -Path $path -Pattern $pattern -AllMatches -ErrorAction SilentlyContinue
    if (-not $m) { Log "  NO MATCHES for /$pattern/ in $(Split-Path $path -Leaf)" }
    else {
        Log "  $(@($m).Count) match(es) for /$pattern/:"
        foreach ($hit in $m) { Log "    L$($hit.LineNumber): $($hit.Line.TrimStart())" }
    }
}

# -----------------------------------------------------------------------------
Section 'ENVIRONMENT'
Log "server_dir:      $ServerDir"
Log "diagnostic_time: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss zzz')"
Log "hostname:        $env:COMPUTERNAME"
Log "user:            $env:USERNAME"
Log "ps_version:      $($PSVersionTable.PSVersion)"
Log "dir_exists:      $(Test-Path $ServerDir)"
$marker = Join-Path $ServerDir '.icraft_server'
Log ".icraft_server:  $(Test-Path $marker)"

# -----------------------------------------------------------------------------
Section 'SYNC MARKER'
$shaFile = Join-Path $ServerDir '.icraft_last_sha'
if (Test-Path $shaFile) {
    Log "  .icraft_last_sha: $((Get-Content $shaFile -Raw).Trim())"
    Log "  marker_mtime:     $((Get-Item $shaFile).LastWriteTime)"
} else {
    Log '  .icraft_last_sha: MISSING (will trigger full zip download next sync)'
}

# -----------------------------------------------------------------------------
Section 'CODEX JAR (iridescent_codex_data.jar)'
$codexJar = Join-Path $ServerDir 'mods\iridescent_codex_data.jar'
if (Test-Path $codexJar) {
    $item = Get-Item $codexJar
    $hash = (Get-FileHash $codexJar -Algorithm SHA256).Hash
    Log "  size:   $($item.Length) bytes"
    Log "  mtime:  $($item.LastWriteTime)"
    Log "  sha256: $hash"
    Log ''
    try {
        Add-Type -AssemblyName System.IO.Compression.FileSystem -ErrorAction SilentlyContinue
        $zip = [System.IO.Compression.ZipFile]::OpenRead($codexJar)
        Log '  -- key entries --'
        foreach ($e in $zip.Entries) {
            if ($e.FullName -match '^(META-INF/(MANIFEST\.MF|mods\.toml)|.*\.class|data/icraft/patchouli_books/iridescent_codex/book\.json|pack\.mcmeta)$') {
                Log "    $($e.FullName)  ($($e.Length) bytes)"
            }
        }
        $tomlEntry = $zip.Entries | Where-Object { $_.FullName -eq 'META-INF/mods.toml' } | Select-Object -First 1
        if ($tomlEntry) {
            Log ''
            Log '  -- mods.toml content --'
            $stream = $tomlEntry.Open()
            $reader = New-Object System.IO.StreamReader($stream)
            ($reader.ReadToEnd() -split "`r?`n") | ForEach-Object { Log "    $_" }
            $reader.Close(); $stream.Close()
        }
        $zip.Dispose()
    } catch {
        Log "  (jar inspection error: $($_.Exception.Message))"
    }
} else {
    Log '  mods/iridescent_codex_data.jar: MISSING'
}

# -----------------------------------------------------------------------------
Section 'LOOTJS_OVERHAUL.JS (enchanted book re-add path)'
$lootScript = Join-Path $ServerDir 'kubejs\server_scripts\loot\lootjs_overhaul.js'
if (Test-Path $lootScript) {
    $item = Get-Item $lootScript
    $hash = (Get-FileHash $lootScript -Algorithm SHA256).Hash
    Log "  size:   $($item.Length) bytes"
    Log "  mtime:  $($item.LastWriteTime)"
    Log "  sha256: $hash"
    Log "  lines:  $((Get-Content $lootScript).Count)"
    Log ''
    Grep $lootScript 'icraft-loot'
    Log ''
    Log '  -- lines 115-180 (enchanted book re-add section) --'
    $content = Get-Content $lootScript
    $start = [Math]::Max(0, 114)
    $end = [Math]::Min($content.Count - 1, 179)
    for ($i = $start; $i -le $end; $i++) { Log ("  L{0,4}: {1}" -f ($i + 1), $content[$i]) }
} else {
    Log '  kubejs/server_scripts/loot/lootjs_overhaul.js: MISSING'
}

# -----------------------------------------------------------------------------
Section 'MOB_EQUIPMENT.JS (Necromancer guard)'
$mobEquip = Join-Path $ServerDir 'kubejs\server_scripts\scaling\mob_equipment.js'
if (Test-Path $mobEquip) {
    $item = Get-Item $mobEquip
    $hash = (Get-FileHash $mobEquip -Algorithm SHA256).Hash
    Log "  size:   $($item.Length) bytes"
    Log "  mtime:  $($item.LastWriteTime)"
    Log "  sha256: $hash"
    Log ''
    Grep $mobEquip 'MOB_EQUIP_BROKEN_ENTITIES|necromancer'
} else {
    Log '  kubejs/server_scripts/scaling/mob_equipment.js: MISSING'
}

# -----------------------------------------------------------------------------
Section 'CODEX DELIVERY SCRIPT'
$delivery = Join-Path $ServerDir 'kubejs\server_scripts\codex_delivery.js'
if (Test-Path $delivery) {
    $item = Get-Item $delivery
    Log "  mtime: $($item.LastWriteTime)"
    Log "  sha256: $((Get-FileHash $delivery -Algorithm SHA256).Hash)"
} else {
    Log '  MISSING'
}

# -----------------------------------------------------------------------------
Section 'LOOTR CONFIG'
$lootr = Join-Path $ServerDir 'config\lootr-common.toml'
if (Test-Path $lootr) {
    Log "  mtime: $((Get-Item $lootr).LastWriteTime)"
    Grep $lootr '^(aggressive_mode|disable|convert_wooden_chests)\s*='
} else { Log '  MISSING' }

# -----------------------------------------------------------------------------
Section 'MAJRUSZ CONFIG (damage_bonus block)'
$maj = Join-Path $ServerDir 'config\majruszsdifficulty.json'
if (Test-Path $maj) {
    Log "  mtime: $((Get-Item $maj).LastWriteTime)"
    $content = Get-Content $maj
    for ($i = 0; $i -lt $content.Count; $i++) {
        if ($content[$i] -match 'mobs_spawn_stronger') {
            $end = [Math]::Min($content.Count - 1, $i + 14)
            for ($j = $i; $j -le $end; $j++) { Log ("  L{0,4}: {1}" -f ($j + 1), $content[$j]) }
            break
        }
    }
} else { Log '  MISSING' }

# -----------------------------------------------------------------------------
Section 'SCALINGMOBS CONFIG'
$sm = Join-Path $ServerDir 'config\scaling_mobs\main.toml'
if (Test-Path $sm) {
    Log "  mtime: $((Get-Item $sm).LastWriteTime)"
    Grep $sm '(Damage Scale Rate|Max Scaled Damage)'
} else { Log '  MISSING' }

# -----------------------------------------------------------------------------
Section 'IMPROVEDMOBS CONFIG'
$im = Join-Path $ServerDir 'config\improvedmobs\common.toml'
if (Test-Path $im) {
    Log "  mtime: $((Get-Item $im).LastWriteTime)"
    Grep $im '(Equipment Addition|Damage Increase Multiplier)'
} else { Log '  MISSING' }

# -----------------------------------------------------------------------------
Section 'CUSTOM JARS IN mods/'
$modsDir = Join-Path $ServerDir 'mods'
if (Test-Path $modsDir) {
    $customJars = @(
        'iridescent_codex_data.jar', 'iridescent_origins-1.0.0.jar',
        'mek_walkable_cables-1.0.1.jar', 'offlineskins-1.20.1-v1.jar',
        'zeta_racefix-1.0.0.jar', 'Patchouli-1.20.1-85-FORGE.jar',
        'ars_nouveau-1.20.1-4.12.7-all.jar'
    )
    foreach ($c in $customJars) {
        $p = Join-Path $modsDir $c
        if (Test-Path $p) {
            $i = Get-Item $p
            Log ("  {0,-50} size={1,8} mtime={2}" -f $c, $i.Length, $i.LastWriteTime)
        } else {
            Log ("  {0,-50} MISSING" -f $c)
        }
    }
    $jarCount = (Get-ChildItem $modsDir -Filter '*.jar' -ErrorAction SilentlyContinue).Count
    Log ''
    Log "  total jars in mods/: $jarCount"
} else { Log '  mods/ MISSING' }

# -----------------------------------------------------------------------------
Section 'KUBEJS STARTUP LOG (full)'
$startupLog = Join-Path $ServerDir 'logs\kubejs\startup.log'
DumpFile $startupLog 500 500

# -----------------------------------------------------------------------------
Section 'KUBEJS SERVER LOG (last 300 lines)'
$serverLog = Join-Path $ServerDir 'logs\kubejs\server.log'
if (Test-Path $serverLog) {
    $item = Get-Item $serverLog
    Log "  path:  $serverLog"
    Log "  size:  $($item.Length) bytes"
    Log "  mtime: $($item.LastWriteTime)"
    Log ''
    Log '  -- last 300 lines --'
    Get-Content $serverLog -Tail 300 -ErrorAction SilentlyContinue | ForEach-Object { Log $_ }
} else { Log '  MISSING' }

# -----------------------------------------------------------------------------
Section 'DONE'
Log "Diagnostic complete. Push this file to the repo so Claude can read it."

Write-Host ''
Write-Host '[diag] Diagnostic written to:' -ForegroundColor Green
Write-Host "       $OutFile" -ForegroundColor Cyan
Write-Host ''
Write-Host '[diag] Push this file to the repo (any path works, e.g. place it in' -ForegroundColor Yellow
Write-Host '       .minecraft\TesterLogs\ or the repo root) and commit + push.' -ForegroundColor Yellow
Write-Host ''
