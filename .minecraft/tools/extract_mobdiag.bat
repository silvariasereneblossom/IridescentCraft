@echo off
REM Extract [MOBDIAG-...] lines from kubejs server log into mobdiag.log.
REM Usage: extract_mobdiag.bat (or call from .minecraft\tools\)
setlocal

set "SDIR=%~dp0"
if "%SDIR:~-1%"=="\" set "SDIR=%SDIR:~0,-1%"
cd /d "%SDIR%\.."

set "SRC=logs\kubejs\server.log"
if not exist "%SRC%" (
    echo [extract_mobdiag] source not found: %SRC%
    exit /b 1
)

set "OUT=logs\kubejs\mobdiag.log"
set "COPY=logs\mobdiag.log"

findstr /C:"[MOBDIAG" "%SRC%" > "%OUT%"
if not exist "%OUT%" type nul > "%OUT%"
copy /y "%OUT%" "%COPY%" >nul

for /f %%A in ('find /c /v "" ^< "%OUT%"') do set LINES=%%A
echo [extract_mobdiag] wrote %LINES% lines
echo   primary: %OUT%
echo   copy:    %COPY%
endlocal
