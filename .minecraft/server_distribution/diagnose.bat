@echo off
REM IridescentCraft Diagnostic Wrapper
REM Runs diagnose.ps1 with error catching and pauses the window so output stays visible.
REM
REM Usage: Double-click, or from cmd:  diagnose.bat

setlocal
cd /d "%~dp0"

echo.
echo ========================================================================
echo   IridescentCraft Diagnostic Wrapper
echo ========================================================================
echo.
echo Script dir: %~dp0
echo.

REM Verify diagnose.ps1 is present
if not exist "%~dp0diagnose.ps1" (
    echo ERROR: diagnose.ps1 not found in %~dp0
    echo Pull the latest from GitHub or re-run sync.
    echo.
    pause
    exit /b 1
)

REM Invoke via `& { try { ... } catch { ... } }` so any exception is printed
REM instead of failing silently. `-NoProfile` avoids $PROFILE slowdowns.
powershell -ExecutionPolicy Bypass -NoProfile -Command ^
    "try { & '%~dp0diagnose.ps1' } catch { Write-Host ''; Write-Host 'EXCEPTION CAUGHT BY WRAPPER:' -ForegroundColor Red; Write-Host $_.Exception.Message -ForegroundColor Red; Write-Host $_.ScriptStackTrace -ForegroundColor Red; exit 3 }"

set "PS_EXIT=%errorlevel%"
echo.
echo ========================================================================
echo   Exit code: %PS_EXIT%
echo ========================================================================
echo.
echo If icraft_diagnostic.txt was created, copy it into your local repo and push.
echo.
pause
