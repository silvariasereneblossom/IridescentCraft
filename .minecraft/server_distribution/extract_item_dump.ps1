# =============================================================================
# extract_item_dump.ps1 — pull [ITEM_DUMP] lines from kubejs-server.log
# =============================================================================
# Companion to kubejs/server_scripts/dump_items.js. KubeJS's class filter
# blocks java.io.FileWriter, so dump_items.js logs each item with prefix
# [ITEM_DUMP] via console.log(). This script extracts those lines from
# kubejs-server.log and writes a clean TSV at kubejs/exports/all_items.tsv.
#
# Modes:
#   -Watch     : Get-Content -Wait the log; extract as soon as dump completes.
#                Used by iridescentserver.bat as a background process.
#   (default)  : One-shot. Read the existing log, extract, exit.
#
# Output: <ServerDir>/kubejs/exports/all_items.tsv
# =============================================================================

param(
    [string]$ServerDir = (Get-Location).Path,
    [switch]$Watch
)

$ServerDir = $ServerDir.TrimEnd('\', '/', '"')
$LogFile = Join-Path $ServerDir 'kubejs-server.log'
$ExportDir = Join-Path $ServerDir 'kubejs/exports'
$ExportFile = Join-Path $ExportDir 'all_items.tsv'

$ErrorActionPreference = 'Continue'

# Ensure exports/ exists
if (-not (Test-Path $ExportDir)) {
    New-Item -ItemType Directory -Path $ExportDir -Force | Out-Null
}

function Extract-Once {
    param([string]$Source)
    if (-not (Test-Path $Source)) {
        Write-Host "[extract_item_dump] log not found: $Source" -ForegroundColor Yellow
        return $false
    }

    $rawLines = Select-String -Path $Source -Pattern '\[ITEM_DUMP\] ' -SimpleMatch
    if (-not $rawLines -or $rawLines.Count -eq 0) {
        Write-Host "[extract_item_dump] no [ITEM_DUMP] lines in log yet" -ForegroundColor Yellow
        return $false
    }

    # Strip everything up through the prefix
    $clean = $rawLines | ForEach-Object {
        $line = $_.Line
        $idx = $line.IndexOf('[ITEM_DUMP] ')
        if ($idx -ge 0) {
            $line.Substring($idx + '[ITEM_DUMP] '.Length)
        }
    } | Where-Object { $_ }

    Set-Content -Path $ExportFile -Value $clean -Encoding UTF8
    Write-Host "[extract_item_dump] wrote $($clean.Count) lines to $ExportFile" -ForegroundColor Green
    return $true
}

if ($Watch) {
    Write-Host "[extract_item_dump] watching $LogFile for [ITEM_DUMP] completion marker..." -ForegroundColor Cyan

    # Spin until the log file exists
    $waitedSeconds = 0
    while (-not (Test-Path $LogFile)) {
        if ($waitedSeconds -ge 600) {
            Write-Host "[extract_item_dump] log file never appeared after 600s. Exiting." -ForegroundColor Red
            exit 1
        }
        Start-Sleep -Seconds 5
        $waitedSeconds += 5
    }

    # Tail the log; on completion marker, extract and exit.
    Get-Content -Path $LogFile -Wait -Tail 0 | ForEach-Object {
        if ($_ -match '\[icraft/dump_items\] === ITEM DUMP COMPLETE:') {
            Write-Host "[extract_item_dump] dump complete marker detected" -ForegroundColor Cyan
            $extracted = Extract-Once -Source $LogFile
            if ($extracted) {
                Write-Host "[extract_item_dump] extraction successful — exiting watcher" -ForegroundColor Green
                exit 0
            }
        }
    }
} else {
    # One-shot mode (default)
    $extracted = Extract-Once -Source $LogFile
    if (-not $extracted) {
        Write-Host "[extract_item_dump] no items extracted. Did dump_items.js run?" -ForegroundColor Yellow
        exit 1
    }
}
