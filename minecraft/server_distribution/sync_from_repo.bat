@echo off
echo === SYNC FROM REPO DEBUG ===
echo Step 1: Script started
echo Step 2: CD is %CD%
echo Step 3: dp0 is %~dp0
pause

echo Step 4: Setting variables
set "REPO=Z:\Users\Silvaria Zemaitis\AppData\Roaming\PrismLauncher\instances\IridescentCraft\minecraft\server_distribution"
set "LOCAL=%~dp0"
echo Step 5: REPO=%REPO%
echo Step 6: LOCAL=%LOCAL%
pause

echo Step 7: Checking repo path
if not exist "%REPO%" (
    echo Step 8: Repo not found, would download from GitHub
) else (
    echo Step 8: Repo found
)
pause

echo Step 9: Done
pause
