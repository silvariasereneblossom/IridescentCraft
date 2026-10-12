@echo off
REM =============================================================================
REM push_crash_logs.bat - RETIRED 2026-10-11. Does nothing.
REM
REM It used to copy the server's logs into the pack repository
REM (server_distribution\TesterLogs\Server Logs\) and, with --silent, commit and
REM push them. The pack repository is public, and server logs carry player
REM names, chat and addresses, so that mirror was taken out of it.
REM
REM Server logs are now mirrored by the server launcher (icraft-gui) to the
REM PRIVATE repository IridescentCraft-logs, folder server\: staged at every
REM server exit, pushed once the server is back up. Nothing is run by hand; the
REM launcher's "Push crash logs" button pushes on demand.
REM
REM The file is kept because iridescentserver.bat calls it on exit.
REM =============================================================================
if /i "%~1"=="--silent" exit /b 0
if /i "%~1"=="-s" exit /b 0
echo [Logs] push_crash_logs.bat is retired: nothing was copied or pushed.
echo [Logs] The server launcher (icraft-gui) mirrors the server's logs to the
echo [Logs] private IridescentCraft-logs repository; use its "Push crash logs"
echo [Logs] button to push now.
exit /b 0
