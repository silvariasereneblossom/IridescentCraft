@echo off
REM IridescentCraft Server — Sync from Repo to Local Server
REM Run this on the Windows Server to pull latest changes from the
REM network-mapped repo into the local server distribution.
REM
REM Usage: Double-click or run from command prompt.
REM        Can also be scheduled via Task Scheduler for automatic sync.
REM
REM Source: Z:\Users\Silvaria Zemaitis\AppData\Roaming\PrismLauncher\instances\IridescentCraft\minecraft\server_distribution
REM Dest:   C:\Users\silvariazemaitis\Desktop\server_distribution

title IridescentCraft Server Sync
setlocal enabledelayedexpansion

set "REPO=Z:\Users\Silvaria Zemaitis\AppData\Roaming\PrismLauncher\instances\IridescentCraft\minecraft\server_distribution"
set "LOCAL=C:\Users\silvariazemaitis\Desktop\server_distribution"

echo.
powershell -Command ^
  "Add-Type -MemberDefinition '[DllImport(\"kernel32.dll\")]public static extern bool SetConsoleMode(IntPtr h,int m);[DllImport(\"kernel32.dll\")]public static extern IntPtr GetStdHandle(int h);' -Name W -Namespace C;" ^
  "$h=[C.W]::GetStdHandle(-11);[C.W]::SetConsoleMode($h,7)|Out-Null;" ^
  "$B=\"$([char]27)[38;2;91;206;250m\";$P=\"$([char]27)[38;2;245;169;184m\";$W=\"$([char]27)[38;2;255;255;255m\";$R=\"$([char]27)[0m\";" ^
  "[Console]::Write(\"${B}  ==========================================${R}`n\");" ^
  "[Console]::Write(\"${P}  IridescentCraft Server Sync${R}`n\");" ^
  "[Console]::Write(\"${W}  Repo to Local Server${R}`n\");" ^
  "[Console]::Write(\"${P}  Iridescent Edition${R}`n\");" ^
  "[Console]::Write(\"${B}  ==========================================${R}`n\")"
echo.
echo   Source: %REPO%
echo   Dest:   %LOCAL%
echo.

REM Verify source exists
if not exist "%REPO%" (
    echo ERROR: Repo path not found. Is the network drive mapped?
    echo   Expected: %REPO%
    pause
    exit /b 1
)

REM Verify destination exists
if not exist "%LOCAL%" (
    echo ERROR: Local server path not found.
    echo   Expected: %LOCAL%
    pause
    exit /b 1
)

echo [SYNC] Checking for changes...
echo.

REM Use robocopy to sync — mirrors source to dest
REM /MIR = mirror (copy new/changed, delete removed)
REM /XD = exclude directories (world, logs, crash-reports, backups — server runtime data)
REM /XF = exclude files (server runtime files that shouldn't be overwritten)
REM /NJH /NJS = no job header/summary clutter
REM /NDL = no directory listing
REM /NP = no progress percentage (cleaner output)
REM /MT:4 = 4 threads for faster copy

robocopy "%REPO%" "%LOCAL%" /MIR /MT:4 /NJH /NJS /NDL /NP ^
    /XD "%LOCAL%\world" "%LOCAL%\logs" "%LOCAL%\crash-reports" "%LOCAL%\backups" "%LOCAL%\libraries" "%LOCAL%\.cache" "%LOCAL%\mods" ^
    /XF "server_output.log" "crash-*.log" "usercache.json" "banned-ips.json" "banned-players.json" "ops.json" "whitelist.json" "installer.log"

set ROBOCOPY_EXIT=%errorlevel%

REM Sync mods/.index and custom JARs separately (don't delete downloaded mods)
echo [SYNC] Syncing mod metadata and custom JARs...
robocopy "%REPO%\mods\.index" "%LOCAL%\mods\.index" /MIR /NJH /NJS /NDL /NP >nul
robocopy "%REPO%\mods" "%LOCAL%\mods" *.jar /NJH /NJS /NDL /NP >nul

echo.

REM Robocopy exit codes: 0=no changes, 1=files copied, 2=extra files deleted
REM 3=both, 4+=errors
if %ROBOCOPY_EXIT% LEQ 3 (
    if %ROBOCOPY_EXIT% EQU 0 (
        echo [OK] No changes detected. Server is up to date.
    ) else (
        echo [OK] Sync complete. Changes applied.
    )
) else (
    echo [WARN] Sync completed with warnings. Exit code: %ROBOCOPY_EXIT%
    echo Check output above for details.
)

echo.

REM Check for mod updates (new .pw.toml versions → download new JARs, remove old)
echo.
echo [UPDATE] Checking for mod version changes...
pushd "%LOCAL%"
powershell -ExecutionPolicy Bypass -File "%LOCAL%\update_mods.ps1" -ModsDir "mods"
popd

REM Clean stale mod JARs not referenced by any .pw.toml
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

REM Run strip_client_mods to clean any remaining client-only mods
if exist "%LOCAL%\strip_client_mods.bat" (
    echo.
    echo [CLEANUP] Stripping client-only mods...
    pushd "%LOCAL%"
    call strip_client_mods.bat >nul 2>&1
    popd
)

REM Check if server is running — warn if so
tasklist /FI "IMAGENAME eq java.exe" 2>nul | find /I "java.exe" >nul
if %errorlevel% equ 0 (
    echo [NOTE] Java is running — if this is the MC server, restart it
    echo        to pick up the changes.
)

echo.
echo Done. Press any key to close.
pause >nul
