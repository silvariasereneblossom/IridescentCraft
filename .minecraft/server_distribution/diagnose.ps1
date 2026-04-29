param(
    [string]$ServerDir = ''
)

# =============================================================================
# IridescentCraft Server Diagnostic Dump
# =============================================================================
# Captures server state into icraft_diagnostic.txt.
#
# Run from the server directory:
#   powershell -ExecutionPolicy Bypass -NoProfile -File diagnose.ps1
# Or use the diagnose.bat wrapper which captures errors:
#   diagnose.bat
# =============================================================================

# --- Force unbuffered output + immediate startup banner ---------------------
$ErrorActionPreference = 'Continue'
$ProgressPreference    = 'SilentlyContinue'

Write-Host ''
Write-Host '========================================================================' -ForegroundColor Cyan
Write-Host '  IridescentCraft Diagnostic Starting' -ForegroundColor Cyan
Write-Host '========================================================================' -ForegroundColor Cyan
Write-Host ''
Write-Host "  PowerShell version: $($PSVersionTable.PSVersion)" -ForegroundColor Yellow
Write-Host "  Running from:       $(Get-Location)" -ForegroundColor Yellow
Write-Host "  Script location:    $PSScriptRoot" -ForegroundColor Yellow
Write-Host "  ServerDir arg:      '$ServerDir'" -ForegroundColor Yellow
Write-Host ''

# --- Resolve ServerDir ------------------------------------------------------
if (-not $ServerDir) {
    # Prefer the script's own directory, since that's where diagnose.ps1 lives
    if ($PSScriptRoot) { $ServerDir = $PSScriptRoot }
    else                { $ServerDir = (Get-Location).Path }
}
$ServerDir = $ServerDir.TrimEnd('\', '/', '"', ' ')

# Auto-detect the nested "IridescentCraft Dedicated Server" subdir
$nested = Join-Path $ServerDir 'IridescentCraft Dedicated Server'
if ((Test-Path (Join-Path $nested '.icraft_server')) -and (-not (Test-Path (Join-Path $ServerDir '.icraft_server')))) {
    Write-Host "  Auto-detected nested server subdir" -ForegroundColor Cyan
    $ServerDir = $nested
}

Write-Host "  Resolved ServerDir: $ServerDir" -ForegroundColor Green
Write-Host ''

if (-not (Test-Path $ServerDir)) {
    Write-Host "ERROR: ServerDir does not exist: $ServerDir" -ForegroundColor Red
    Write-Host 'Pass a valid path via -ServerDir or run from the server directory.' -ForegroundColor Red
    exit 1
}

$OutFile = Join-Path $ServerDir 'icraft_diagnostic.txt'
Write-Host "  Output file:        $OutFile" -ForegroundColor Green
Write-Host ''

# Wrap everything below in try/catch so any error is surfaced instead of failing silently
try {

if (Test-Path $OutFile) { Remove-Item $OutFile -Force -ErrorAction SilentlyContinue }

function Log([string]$msg = '') {
    Add-Content -Path $OutFile -Value $msg -Encoding ASCII -ErrorAction Continue
}
function Section([string]$title) {
    Write-Host "[diag] $title" -ForegroundColor Cyan
    Log ''
    Log '========================================================================'
    Log "  $title"
    Log '========================================================================'
}
function DumpFile([string]$path, [int]$head = 30, [int]$tail = 30) {
    if (-not (Test-Path $path)) { Log "  (MISSING: $path)"; return }
    $item = Get-Item $path
    $hash = ''
    try { $hash = (Get-FileHash $path -Algorithm SHA256).Hash } catch {}
    Log "  path:   $path"
    Log "  size:   $($item.Length) bytes"
    Log "  mtime:  $($item.LastWriteTime)"
    Log "  sha256: $hash"
    Log ''
    $content = @(Get-Content $path -ErrorAction SilentlyContinue)
    if (-not $content -or $content.Count -eq 0) { Log '  (empty or unreadable)'; return }
    if ($content.Count -le ($head + $tail + 5)) {
        Log '  -- full content --'
        foreach ($l in $content) { Log $l }
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
    $m = @(Select-String -Path $path -Pattern $pattern -AllMatches -ErrorAction SilentlyContinue)
    if (-not $m -or $m.Count -eq 0) {
        Log "  NO MATCHES for /$pattern/ in $(Split-Path $path -Leaf)"
    } else {
        Log "  $($m.Count) match(es) for /$pattern/:"
        foreach ($hit in $m) { Log "    L$($hit.LineNumber): $($hit.Line.TrimStart())" }
    }
}

# ---------------------------------------------------------------------------
Section 'ENVIRONMENT'
Log "server_dir:      $ServerDir"
Log "diagnostic_time: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss zzz')"
Log "hostname:        $env:COMPUTERNAME"
Log "user:            $env:USERNAME"
Log "ps_version:      $($PSVersionTable.PSVersion)"
Log "dir_exists:      $(Test-Path $ServerDir)"
Log ".icraft_server:  $(Test-Path (Join-Path $ServerDir '.icraft_server'))"

# ---------------------------------------------------------------------------
Section 'SYNC MARKER'
$shaFile = Join-Path $ServerDir '.icraft_last_sha'
if (Test-Path $shaFile) {
    Log "  .icraft_last_sha: $((Get-Content $shaFile -Raw -ErrorAction SilentlyContinue).Trim())"
    Log "  marker_mtime:     $((Get-Item $shaFile).LastWriteTime)"
} else {
    Log '  .icraft_last_sha: MISSING (would trigger full zip download next sync)'
}

# ---------------------------------------------------------------------------
Section 'CODEX JAR'
$codexJar = Join-Path $ServerDir 'mods\iridescent_codex_data.jar'
if (Test-Path $codexJar) {
    $item = Get-Item $codexJar
    $hash = ''
    try { $hash = (Get-FileHash $codexJar -Algorithm SHA256).Hash } catch {}
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
    Log "  MISSING: $codexJar"
}

# ---------------------------------------------------------------------------
Section 'LOOTJS_OVERHAUL.JS'
$lootScript = Join-Path $ServerDir 'kubejs\server_scripts\loot\lootjs_overhaul.js'
if (Test-Path $lootScript) {
    $item = Get-Item $lootScript
    $hash = ''
    try { $hash = (Get-FileHash $lootScript -Algorithm SHA256).Hash } catch {}
    Log "  size:   $($item.Length) bytes"
    Log "  mtime:  $($item.LastWriteTime)"
    Log "  sha256: $hash"
    $content = @(Get-Content $lootScript)
    Log "  lines:  $($content.Count)"
    Log ''
    Grep $lootScript 'icraft-loot'
    Log ''
    Log '  -- lines 115-180 --'
    $start = [Math]::Max(0, 114)
    $end = [Math]::Min($content.Count - 1, 179)
    for ($i = $start; $i -le $end; $i++) { Log ("  L{0,4}: {1}" -f ($i + 1), $content[$i]) }
} else {
    Log "  MISSING: $lootScript"
}

# ---------------------------------------------------------------------------
Section 'MOB_EQUIPMENT.JS'
$mobEquip = Join-Path $ServerDir 'kubejs\server_scripts\scaling\mob_equipment.js'
if (Test-Path $mobEquip) {
    $item = Get-Item $mobEquip
    $hash = ''
    try { $hash = (Get-FileHash $mobEquip -Algorithm SHA256).Hash } catch {}
    Log "  size:   $($item.Length) bytes"
    Log "  mtime:  $($item.LastWriteTime)"
    Log "  sha256: $hash"
    Log ''
    Grep $mobEquip 'MOB_EQUIP_BROKEN_ENTITIES|necromancer'
} else {
    Log "  MISSING: $mobEquip"
}

# ---------------------------------------------------------------------------
Section 'LOOTR CONFIG'
$lootr = Join-Path $ServerDir 'config\lootr-common.toml'
if (Test-Path $lootr) {
    Log "  mtime: $((Get-Item $lootr).LastWriteTime)"
    Grep $lootr '^(aggressive_mode|disable|convert_wooden_chests)\s*='
} else { Log "  MISSING: $lootr" }

# ---------------------------------------------------------------------------
Section 'MAJRUSZ CONFIG (mobs_spawn_stronger)'
$maj = Join-Path $ServerDir 'config\majruszsdifficulty.json'
if (Test-Path $maj) {
    Log "  mtime: $((Get-Item $maj).LastWriteTime)"
    $content = @(Get-Content $maj)
    for ($i = 0; $i -lt $content.Count; $i++) {
        if ($content[$i] -match 'mobs_spawn_stronger') {
            $end = [Math]::Min($content.Count - 1, $i + 14)
            for ($j = $i; $j -le $end; $j++) { Log ("  L{0,4}: {1}" -f ($j + 1), $content[$j]) }
            break
        }
    }
} else { Log "  MISSING: $maj" }

# ---------------------------------------------------------------------------
Section 'SCALINGMOBS CONFIG'
$sm = Join-Path $ServerDir 'config\scaling_mobs\main.toml'
if (Test-Path $sm) {
    Log "  mtime: $((Get-Item $sm).LastWriteTime)"
    Grep $sm '(Damage Scale Rate|Max Scaled Damage)'
} else { Log "  MISSING: $sm" }

# ---------------------------------------------------------------------------
Section 'IMPROVEDMOBS CONFIG'
$im = Join-Path $ServerDir 'config\improvedmobs\common.toml'
if (Test-Path $im) {
    Log "  mtime: $((Get-Item $im).LastWriteTime)"
    Grep $im '(Equipment Addition|Damage Increase Multiplier)'
} else { Log "  MISSING: $im" }

# ---------------------------------------------------------------------------
Section 'CUSTOM JARS IN mods/'
$modsDir = Join-Path $ServerDir 'mods'
if (Test-Path $modsDir) {
    $customJars = @(
        'iridescent_codex_data.jar', 'iridescent_origins-1.0.0.jar',
        'iridescent_biomes-1.0.0.jar', 'iridescent_modular_spells-0.2.0.jar',
        'iridescent_durability_clamp-0.1.0.jar',
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
    $jarCount = @(Get-ChildItem $modsDir -Filter '*.jar' -ErrorAction SilentlyContinue).Count
    Log ''
    Log "  total jars in mods/: $jarCount"
} else { Log "  MISSING: $modsDir" }

# ---------------------------------------------------------------------------
Section 'KUBEJS STARTUP LOG (full)'
DumpFile (Join-Path $ServerDir 'logs\kubejs\startup.log') 500 500

# ---------------------------------------------------------------------------
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
} else { Log "  MISSING: $serverLog" }

# ---------------------------------------------------------------------------
Section 'DONE'
Log "Diagnostic complete. Push this file to the repo so Claude can read it."

Write-Host ''
Write-Host '[diag] Diagnostic complete.' -ForegroundColor Green
Write-Host "[diag] Output written to: $OutFile" -ForegroundColor Cyan
Write-Host ''
Write-Host '[diag] Next: copy icraft_diagnostic.txt into your local repo,' -ForegroundColor Yellow
Write-Host '[diag] commit, and push. Place anywhere (e.g. .minecraft\TesterLogs\).' -ForegroundColor Yellow
Write-Host ''

} catch {
    Write-Host ''
    Write-Host '========================================================================' -ForegroundColor Red
    Write-Host '  DIAGNOSTIC SCRIPT ERROR' -ForegroundColor Red
    Write-Host '========================================================================' -ForegroundColor Red
    Write-Host "Exception: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "Stack:" -ForegroundColor Red
    Write-Host $_.ScriptStackTrace -ForegroundColor Red
    Write-Host ''
    # Also try to write the error into the output file
    if ($OutFile) {
        "DIAGNOSTIC SCRIPT ERROR: $($_.Exception.Message)" | Out-File -Append -FilePath $OutFile -Encoding ASCII -ErrorAction SilentlyContinue
        $_.ScriptStackTrace | Out-File -Append -FilePath $OutFile -Encoding ASCII -ErrorAction SilentlyContinue
    }
    exit 2
}
