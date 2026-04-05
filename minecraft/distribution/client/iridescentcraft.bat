@echo off
title IridescentCraft Client Installer
cd /d "%~dp0"

REM v6 — Clean download every time, no caching possible

if exist "%~dp0install.ps1" (
    echo Using local install.ps1...
    powershell -ExecutionPolicy Bypass -File "%~dp0install.ps1"
    pause
    exit /b
)

powershell -Command ^
  "Add-Type -MemberDefinition '[DllImport(\"kernel32.dll\")]public static extern bool SetConsoleMode(IntPtr h,int m);[DllImport(\"kernel32.dll\")]public static extern IntPtr GetStdHandle(int h);' -Name W -Namespace C;" ^
  "$h=[C.W]::GetStdHandle(-11);[C.W]::SetConsoleMode($h,7)|Out-Null;" ^
  "$B=\"$([char]27)[38;2;91;206;250m\";$P=\"$([char]27)[38;2;245;169;184m\";$W=\"$([char]27)[38;2;255;255;255m\";$R=\"$([char]27)[0m\";" ^
  "[Console]::Write(\"${B}  ==========================================${R}`n\");" ^
  "[Console]::Write(\"${P}  IridescentCraft Client Installer${R}`n\");" ^
  "[Console]::Write(\"${W}  Forge 1.20.1-47.4.6  ~450 mods${R}`n\");" ^
  "[Console]::Write(\"${P}  Iridescent Edition${R}`n\");" ^
  "[Console]::Write(\"${B}  ==========================================${R}`n\")"
echo.

REM Delete ALL old cached ps1 files
del "%TEMP%\icraft_install_*.ps1" 2>nul

set "PS1=%TEMP%\icraft_install_%TIME:~6,2%%RANDOM%.ps1"

powershell -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; (New-Object System.Net.WebClient).DownloadFile('https://raw.githubusercontent.com/silvariasereneblossom/IridescentCraft/main/minecraft/distribution/client/install.ps1?v=' + [DateTimeOffset]::UtcNow.ToUnixTimeSeconds(), '%PS1%')"

if not exist "%PS1%" (
    echo ERROR: Failed to download installer script.
    echo Download the repo manually: https://github.com/silvariasereneblossom/IridescentCraft
    pause
    exit /b 1
)

echo Running installer...
echo.
powershell -ExecutionPolicy Bypass -File "%PS1%"

del "%PS1%" 2>nul
pause
