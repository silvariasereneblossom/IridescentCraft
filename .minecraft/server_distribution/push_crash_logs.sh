#!/usr/bin/env bash
# =============================================================================
# push_crash_logs.sh - RETIRED 2026-10-11. Does nothing.
#
# It used to copy the server's logs into the pack repository
# (server_distribution/TesterLogs/Server Logs/) and, with --silent, commit and
# push them. The pack repository is public, and server logs carry player
# names, chat and addresses, so that mirror was taken out of it.
#
# Server logs are now mirrored by the server launcher (icraft-gui) to the
# PRIVATE repository IridescentCraft-logs, folder server/: staged at every
# server exit, pushed once the server is back up. Nothing is run by hand; the
# launcher's "Push crash logs" button pushes on demand.
#
# The file is kept because iridescentserver.sh calls it on exit.
# =============================================================================
case "${1:-}" in
    --silent|-s) exit 0 ;;
esac
echo "[Logs] push_crash_logs.sh is retired: nothing was copied or pushed."
echo "[Logs] The server launcher (icraft-gui) mirrors the server's logs to the"
echo "[Logs] private IridescentCraft-logs repository; use its \"Push crash logs\""
echo "[Logs] button to push now."
exit 0
