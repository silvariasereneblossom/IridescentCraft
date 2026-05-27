# =============================================================================
# Wait-IridescentMCReady.ps1  -  poll MC log for canonical "Done" marker
# =============================================================================
# Returns success when latest.log shows `Done (X.Xs)! For help, type "help"`.
# Times out after $TimeoutMinutes minutes (default 15).
#
# Usage (interactive):
#   pwsh .minecraft\dev\Wait-IridescentMCReady.ps1
#
# Usage (after restarting the service):
#   Stop-Service IridescentMC
#   Start-Service IridescentMC
#   pwsh .minecraft\dev\Wait-IridescentMCReady.ps1 -TimeoutMinutes 20
#   if ($?) { Write-Host 'ready' } else { Write-Host 'timed out' }
#
# The script tracks file mtime so it picks up the BAR-NEW Done event (not a
# leftover from a previous run that already had Done in the tail).
# =============================================================================

[CmdletBinding()]
param(
    [string]$LogPath = 'Z:\Users\silvariazemaitis\Desktop\IridescentCraft Dedicated Server\logs\latest.log',
    [int]$TimeoutMinutes = 15,
    [int]$PollSeconds = 3
)

$startTime = Get-Date
$deadline = $startTime.AddMinutes($TimeoutMinutes)

# Snapshot the log's current size so we only consider lines written AFTER we
# started waiting. Avoids matching a stale "Done" from a previous startup.
$startOffset = 0
if (Test-Path $LogPath) {
    $startOffset = (Get-Item $LogPath).Length
    Write-Host ('[wait-ready] watching {0} (starting at offset {1:N0} bytes)' -f $LogPath, $startOffset)
} else {
    Write-Host ('[wait-ready] log does not yet exist: {0}' -f $LogPath)
}

$donePattern = 'Done \([0-9.]+s\)! For help'

while ((Get-Date) -lt $deadline) {
    if (Test-Path $LogPath) {
        $currentSize = (Get-Item $LogPath).Length
        if ($currentSize -gt $startOffset) {
            # Read only the newly-appended bytes (not the whole file each poll)
            $fs = [System.IO.File]::Open($LogPath, 'Open', 'Read', 'ReadWrite')
            try {
                $fs.Seek($startOffset, 'Begin') | Out-Null
                $reader = New-Object System.IO.StreamReader($fs)
                $newContent = $reader.ReadToEnd()
                $reader.Close()
            } finally {
                $fs.Close()
            }
            if ($newContent -match $donePattern) {
                $elapsed = ((Get-Date) - $startTime).TotalSeconds
                $match = ($newContent -split "`n" | Where-Object { $_ -match $donePattern } | Select-Object -First 1).Trim()
                Write-Host ('[wait-ready] READY after {0:N1}s: {1}' -f $elapsed, $match)
                exit 0
            }
            $startOffset = $currentSize
        }
    }
    Start-Sleep -Seconds $PollSeconds
}

$elapsed = ((Get-Date) - $startTime).TotalSeconds
Write-Host ('[wait-ready] TIMEOUT after {0:N1}s; Done marker not seen' -f $elapsed) -ForegroundColor Yellow
exit 1
