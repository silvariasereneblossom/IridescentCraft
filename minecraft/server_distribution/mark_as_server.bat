@echo off
echo.
echo This marks the current directory as an IridescentCraft Dedicated Server.
echo The server launcher will run in-place instead of creating a subfolder.
echo.
echo Directory: %CD%
echo.
set /p confirm=Are you sure? (Y/N):
if /I not "%confirm%"=="Y" (
    echo Cancelled.
    pause
    exit /b
)
echo. > "%~dp0.icraft_server"
echo.
echo [OK] Marked as IridescentCraft Dedicated Server.
echo You can now run iridescentserver.bat from this directory.
echo.
pause
