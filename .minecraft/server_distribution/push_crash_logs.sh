#!/usr/bin/env bash
# =============================================================================
# IridescentCraft — Collect + auto-push server logs
# Copies last 3 crash reports, ALL kubejs/*.log files, and logs/latest.log
# into TesterLogs/Server Logs/, then git adds + commits + pushes.
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

# --- logs/latest.log (full vanilla server log) ---
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
echo "[Logs] Files copied to $DEST"

# --- Auto git add + commit + push (only if in a git repo with git on PATH) ---
if ! command -v git >/dev/null 2>&1; then
    echo ""
    echo "[Logs] git not on PATH — skipping auto-push. Commit manually."
    exit 0
fi

if ! git rev-parse --git-dir >/dev/null 2>&1; then
    echo ""
    echo "[Logs] Not inside a git repo — skipping auto-push."
    exit 0
fi

echo ""
echo "[Logs] Auto-pushing to remote..."
git add "$DEST"
STAMP="$(date +%Y-%m-%d_%H:%M)"
if git commit -m "Push server logs $STAMP" 2>/dev/null; then
    if git push; then
        echo "  [Logs] Pushed."
    else
        echo "  [Logs] git push FAILED — fix credentials or resolve manually."
    fi
else
    echo "  Nothing to commit (files unchanged) — skipping push."
fi

echo ""
