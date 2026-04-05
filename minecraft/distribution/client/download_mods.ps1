# IridescentCraft Mod Downloader
# Called by iridescentcraft.bat -- do not run directly
param(
    [string]$IndexDir,
    [string]$ModsDir
)

[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

# Log file for debugging
$logFile = Join-Path (Split-Path $IndexDir -Parent) "download_log.txt"
"Download started: $(Get-Date)" | Out-File $logFile

Write-Host "  Index: $IndexDir" -ForegroundColor DarkGray
Write-Host "  Mods:  $ModsDir" -ForegroundColor DarkGray
$existingJars = (Get-ChildItem "$ModsDir\*.jar" -ErrorAction SilentlyContinue).Count
Write-Host "  Existing JARs in mods dir: $existingJars" -ForegroundColor DarkGray
Write-Host ''

"Index: $IndexDir" | Out-File $logFile -Append
"Mods:  $ModsDir" | Out-File $logFile -Append
"Existing JARs: $existingJars" | Out-File $logFile -Append
# List first 5 existing jars for verification
Get-ChildItem "$ModsDir\*.jar" -ErrorAction SilentlyContinue | Select-Object -First 5 -ExpandProperty Name | ForEach-Object { "  existing: $_" } | Out-File $logFile -Append
"" | Out-File $logFile -Append

$tomlFiles = Get-ChildItem "$IndexDir\*.pw.toml"
$total = $tomlFiles.Count
Write-Host "  Found $total mod metadata files."
Write-Host ''

$downloaded = 0; $skipped = 0; $failed = 0; $count = 0; $failedNames = @()
$quotePattern = "['"+'"]'

foreach ($toml in $tomlFiles) {
    $count++
    $content = Get-Content $toml.FullName
    $filename = ''; $side = 'both'; $mode = ''; $url = ''; $projectId = ''; $fileId = ''

    foreach ($line in $content) {
        $line = $line.Trim()
        if ($line -match "^filename\s*=\s*$quotePattern(.+)$quotePattern") { $filename = $matches[1] }
        if ($line -match "^side\s*=\s*$quotePattern(.+)$quotePattern") { $side = $matches[1] }
        if ($line -match "^mode\s*=\s*$quotePattern(.+)$quotePattern") { $mode = $matches[1] }
        if ($line -match "^url\s*=\s*$quotePattern(.+)$quotePattern") { $url = $matches[1] }
        if ($line -match '^project-id\s*=\s*(\d+)') { $projectId = $matches[1] }
        if ($line -match '^file-id\s*=\s*(\d+)') { $fileId = $matches[1] }
    }

    if (-not $filename) { continue }
    if ($side -eq 'server') { $skipped++; continue }

    $modPath = Join-Path $ModsDir $filename
    if (Test-Path -LiteralPath $modPath) { $skipped++; continue }

    $dlUrl = ''
    if ($mode -eq 'url' -and $url) {
        $dlUrl = $url
    } elseif ($mode -eq 'metadata:curseforge' -and $fileId) {
        $idStr = $fileId.ToString()
        $part1 = $idStr.Substring(0, 4)
        $part2 = $idStr.Substring(4).TrimStart('0')
        if (-not $part2) { $part2 = '0' }
        $dlUrl = "https://edge.forgecdn.net/files/$part1/$part2/$filename"
    }

    if (-not $dlUrl) {
        $failed++
        $failedNames += "$filename (no download URL)"
        continue
    }

    $pct = [math]::Round(($count / $total) * 100)
    Write-Host "  [$pct%] $filename" -NoNewline

    $tempFile = Join-Path $ModsDir "_dl_$count.tmp"
    $success = $false

    for ($retry = 0; $retry -lt 3; $retry++) {
        try {
            $wc = New-Object System.Net.WebClient
            $wc.DownloadFile($dlUrl, $tempFile)
            $wc.Dispose()
            if ((Test-Path $tempFile) -and (Get-Item $tempFile).Length -gt 1000) {
                Move-Item -LiteralPath $tempFile -Destination $modPath -Force
                $success = $true
                break
            } else {
                if (Test-Path $tempFile) { Remove-Item $tempFile -Force }
            }
        } catch {
            if (Test-Path $tempFile) { Remove-Item $tempFile -Force }
            if ($retry -eq 2) {
                Write-Host " [$($_.Exception.Message)]" -NoNewline -ForegroundColor DarkGray
            }
            if ($retry -lt 2) { Start-Sleep -Seconds 2 }
        }
    }

    if ($success) {
        Write-Host ' OK' -ForegroundColor Green
        $downloaded++
    } else {
        Write-Host ' FAILED' -ForegroundColor Red
        $failed++
        $failedNames += $filename
        "FAILED: $filename | URL: $dlUrl" | Out-File $logFile -Append
    }
}

Write-Host ''
Write-Host "  Downloaded: $downloaded" -ForegroundColor Green
Write-Host "  Already present: $skipped" -ForegroundColor Cyan
if ($failed -gt 0) {
    Write-Host "  Failed: $failed" -ForegroundColor Red
    foreach ($fn in $failedNames) { Write-Host "    - $fn" -ForegroundColor DarkRed }
    Write-Host '  Re-run to retry failed downloads.' -ForegroundColor Yellow
    Write-Host "  Log saved to: $logFile" -ForegroundColor DarkGray
}
"Summary: downloaded=$downloaded skipped=$skipped failed=$failed" | Out-File $logFile -Append
