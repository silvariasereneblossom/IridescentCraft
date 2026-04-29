@echo off
title IridescentCraft Server Sync
setlocal enabledelayedexpansion

set "REPO=Z:\Users\Silvaria Zemaitis\AppData\Roaming\PrismLauncher\instances\IridescentCraft\.minecraft\server_distribution"
REM Get script directory without trailing backslash
set "LOCAL=%~dp0"
if "!LOCAL:~-1!"=="\" set "LOCAL=!LOCAL:~0,-1!"

echo.
powershell -Command ^
    "$e=[char]27;" ^
    "[Console]::Write(\"${e}[38;2;91;206;250m  ==========================================${e}[0m`n\");" ^
    "[Console]::Write(\"${e}[38;2;245;169;184m  IridescentCraft Server Sync${e}[0m`n\");" ^
    "[Console]::Write(\"${e}[38;2;255;255;255m  Repo to Local Server${e}[0m`n\");" ^
    "[Console]::Write(\"${e}[38;2;245;169;184m  Iridescent Edition${e}[0m`n\");" ^
    "[Console]::Write(\"${e}[38;2;91;206;250m  ==========================================${e}[0m`n\")"
echo.
echo   Source: %REPO%
echo   Server: %LOCAL%
echo.

REM Check if repo is available -- fall back to GitHub if not
if not exist "%REPO%" (
    echo [INFO] Repo path not found. Downloading from GitHub instead...
    echo.
    powershell -ExecutionPolicy Bypass -Command ^
        "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12;" ^
        "$zipUrl = 'https://github.com/silvariasereneblossom/IridescentCraft/archive/refs/heads/main.zip';" ^
        "$zipFile = $env:TEMP + '\IridescentCraft-sync.zip';" ^
        "$extractDir = $env:TEMP + '\IridescentCraft-sync-extract';" ^
        "try {" ^
        "  Write-Host '  Downloading repository...';" ^
        "  Invoke-WebRequest -Uri $zipUrl -OutFile $zipFile -UseBasicParsing -TimeoutSec 60;" ^
        "  if (-not (Test-Path $zipFile) -or (Get-Item $zipFile).Length -lt 100000) { throw 'Download failed' };" ^
        "  Write-Host '  Extracting...';" ^
        "  if (Test-Path $extractDir) { Remove-Item $extractDir -Recurse -Force };" ^
        "  Expand-Archive -Path $zipFile -DestinationPath $extractDir -Force;" ^
        "  $src = (Get-ChildItem $extractDir -Directory | Select-Object -First 1).FullName + '\.minecraft\server_distribution';" ^
        "  $dest = '%LOCAL%';" ^
        "  $exclude = @('world','logs','crash-reports','backups','libraries','.cache');" ^
        "  Write-Host '  Syncing files...';" ^
        "  foreach ($item in Get-ChildItem $src) {" ^
        "    if ($item.PSIsContainer -and $exclude -contains $item.Name) { continue };" ^
        "    if ($item.Name -eq 'mods') {" ^
        "      if (-not (Test-Path (Join-Path $dest 'mods\.index'))) { New-Item -ItemType Directory -Path (Join-Path $dest 'mods\.index') -Force | Out-Null };" ^
        "      Copy-Item (Join-Path $item.FullName '.index\*') (Join-Path $dest 'mods\.index') -Recurse -Force;" ^
        "      Get-ChildItem $item.FullName -Filter '*.jar' | ForEach-Object { Copy-Item $_.FullName (Join-Path $dest 'mods') -Force };" ^
        "    } else {" ^
        "      Copy-Item $item.FullName $dest -Recurse -Force;" ^
        "    }" ^
        "  };" ^
        "  Remove-Item $zipFile -Force -ErrorAction SilentlyContinue;" ^
        "  Remove-Item $extractDir -Recurse -Force -ErrorAction SilentlyContinue;" ^
        "  Write-Host '  [OK] Sync from GitHub complete.' -ForegroundColor Green;" ^
        "} catch {" ^
        "  Write-Host ('  ERROR: ' + $_.Exception.Message) -ForegroundColor Red;" ^
        "  Remove-Item $zipFile -Force -ErrorAction SilentlyContinue;" ^
        "  Remove-Item $extractDir -Recurse -Force -ErrorAction SilentlyContinue;" ^
        "}"
    goto :post_sync
)

REM Verify destination exists
if not exist "%LOCAL%\mods" (
    echo [SETUP] Creating mods directory...
    mkdir "%LOCAL%\mods"
)

echo [SYNC] Syncing from local repo...
echo.

REM Mirror configs, scripts, datapacks (exclude runtime data + mods)
REM Note: LOCAL has no trailing backslash so paths with spaces are safe
robocopy "%REPO%" "%LOCAL%" /MIR /MT:4 /NJH /NJS /NDL /NP ^
    /XD "%LOCAL%\world" "%LOCAL%\logs" "%LOCAL%\crash-reports" "%LOCAL%\backups" "%LOCAL%\libraries" "%LOCAL%\.cache" "%LOCAL%\mods" ^
    /XF "server_output.log" "crash-*.log" "usercache.json" "banned-ips.json" "banned-players.json" "ops.json" "whitelist.json" "installer.log" ".icraft_last_sha" ".icraft_server"

set ROBOCOPY_EXIT=%errorlevel%

REM Sync mod index and custom JARs
echo [SYNC] Syncing mod metadata and custom JARs...
robocopy "%REPO%\mods\.index" "%LOCAL%\mods\.index" /MIR /NJH /NJS /NDL /NP >nul
robocopy "%REPO%\mods" "%LOCAL%\mods" *.jar /NJH /NJS /NDL /NP >nul

echo.
if %ROBOCOPY_EXIT% LEQ 3 (
    if %ROBOCOPY_EXIT% EQU 0 (
        echo [OK] No changes detected. Server is up to date.
    ) else (
        echo [OK] Sync complete. Changes applied.
    )
) else (
    echo [WARN] Sync completed with warnings. Exit code: %ROBOCOPY_EXIT%
)

:post_sync
echo.

REM Update mods (download new, remove old versions)
if exist "%LOCAL%\mods\.index" (
    echo [UPDATE] Checking for mod version changes...
    pushd "%LOCAL%"
    powershell -ExecutionPolicy Bypass -File "%LOCAL%\update_mods.ps1" -ModsDir "mods"
    popd
)

REM Clean stale mod JARs
echo.
echo [CLEANUP] Removing stale mod JARs...
powershell -ExecutionPolicy Bypass -Command ^
    "$indexDir = '%LOCAL%\mods\.index';" ^
    "$modsDir = '%LOCAL%\mods';" ^
    "if (-not (Test-Path $indexDir)) { exit };" ^
    "$expected = @{};" ^
    "Get-ChildItem $indexDir\*.pw.toml | ForEach-Object {" ^
    "  foreach ($line in Get-Content $_.FullName) {" ^
    "    if ($line -match '^\s*filename\s*=\s*[''\""](.+)[''\""]') { $expected[$matches[1]] = $true }" ^
    "  }" ^
    "};" ^
    "$customJars = @('iridescent_codex_data.jar','iridescent_origins-1.0.0.jar','iridescent_biomes-1.0.0.jar','iridescent_modular_spells-0.2.0.jar','iridescent_reforging-0.1.0.jar','iridescent_durability_clamp-0.1.0.jar','justlevelingfork-1.2.1-iridescent.1.jar','mek_walkable_cables-1.0.1.jar','offlineskins-1.20.1-v1.jar','zeta_racefix-1.0.0.jar','Patchouli-1.20.1-85-FORGE.jar','ars_nouveau-1.20.1-4.12.7-all.jar');" ^
    "foreach ($c in $customJars) { $expected[$c] = $true };" ^
    "$removed = 0;" ^
    "Get-ChildItem $modsDir\*.jar -ErrorAction SilentlyContinue | ForEach-Object {" ^
    "  if (-not $expected.ContainsKey($_.Name)) {" ^
    "    Write-Host ('  Removing stale: ' + $_.Name) -ForegroundColor DarkYellow;" ^
    "    Remove-Item $_.FullName -Force;" ^
    "    $removed++;" ^
    "  }" ^
    "};" ^
    "if ($removed -gt 0) { Write-Host ('  Removed ' + $removed + ' stale JAR(s)') -ForegroundColor Yellow }" ^
    "else { Write-Host '  No stale JARs found.' -ForegroundColor Green }"

REM Strip client-only mods
if exist "%LOCAL%\strip_client_mods.bat" (
    echo.
    echo [CLEANUP] Stripping client-only mods...
    pushd "%LOCAL%"
    call strip_client_mods.bat >nul 2>&1
    popd
)

REM Check if server is running
tasklist /FI "IMAGENAME eq java.exe" 2>nul | find /I "java.exe" >nul
if %errorlevel% equ 0 (
    echo.
    echo [NOTE] Java is running -- if this is the MC server, restart it
    echo        to pick up the changes.
)

echo.
echo Done. Press any key to close.
pause >nul
