#!/usr/bin/env bash
# =============================================================================
# IridescentCraft — Collect server logs for transfer to repo
# Copies last 3 crash reports, ALL kubejs/*.log files, logs/latest.log, and
# logs/debug.log into TesterLogs/Server Logs/ for manual transfer to the
# dev machine's repo copy (server is not itself a git repo).
# =============================================================================

set -euo pipefail
cd "$(dirname "$0")"

DEST="TesterLogs/Server Logs"
mkdir -p "$DEST"

echo ""
echo "[Logs] Collecting server logs..."
echo ""

# --- Last 3 crash reports (sorted newest first) ---
if [ -d "crash-reports" ]; then
    ls -t crash-reports/*.txt 2>/dev/null | head -n 3 | while IFS= read -r F; do
        cp -f "$F" "$DEST/$(basename "$F")"
        echo "  Crash: $(basename "$F")"
    done
fi

# --- ALL files in logs/kubejs/ (server.log, startup.log, client.log, any
#     rotated .log / .log.gz). Flattens into DEST with kubejs- prefix so
#     filenames don't collide with other logs.
if [ -d "logs/kubejs" ]; then
    for F in logs/kubejs/*.log logs/kubejs/*.log.gz; do
        [ -f "$F" ] || continue
        cp -f "$F" "$DEST/kubejs-$(basename "$F")"
        echo "  KubeJS: $(basename "$F")"
    done
fi

# --- logs/latest.log (vanilla server log) ---
if [ -f "logs/latest.log" ]; then
    cp -f "logs/latest.log" "$DEST/latest.log"
    echo "  Server: latest.log"
fi

# --- logs/debug.log if present (Forge debug output) ---
if [ -f "logs/debug.log" ]; then
    cp -f "logs/debug.log" "$DEST/debug.log"
    echo "  Server: debug.log"
fi

echo ""
echo "[Logs] Files copied to: $(pwd)/$DEST"
echo ""
echo "[Logs] To share with the dev machine:"
echo "  1. Copy the \"$DEST\" folder contents back to your"
echo "     repo's server_distribution/TesterLogs/Server Logs/ folder"
echo "  2. git add + commit + push from the dev machine"
echo ""
