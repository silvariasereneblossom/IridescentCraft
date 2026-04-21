#!/usr/bin/env bash
# =============================================================================
# IridescentCraft — Push server logs directly to the repo via network drive
# Primary destination: Z:/.../PrismLauncher/instances/IridescentCraft/.minecraft/
#                       server_distribution/TesterLogs/Server Logs/
# (network drive on Windows Server — on Linux equivalent, set REMOTE_DEST env)
# Fallback: local server_distribution/TesterLogs/Server Logs/ if repo path
# isn't mounted.
# =============================================================================

set -euo pipefail
cd "$(dirname "$0")"

# On Linux there's no Z: drive; user can override via env. Default fallback
# is local.
REMOTE_DEST="${REMOTE_DEST:-/z/Users/Silvaria Zemaitis/AppData/Roaming/PrismLauncher/instances/IridescentCraft/.minecraft/server_distribution/TesterLogs/Server Logs}"
REMOTE_ROOT="${REMOTE_ROOT:-/z/Users/Silvaria Zemaitis/AppData/Roaming/PrismLauncher/instances/IridescentCraft/.minecraft/server_distribution}"
LOCAL_DEST="TesterLogs/Server Logs"

if [ -d "$REMOTE_ROOT" ]; then
    DEST="$REMOTE_DEST"
    MODE="repo"
    mkdir -p "$REMOTE_DEST"
    echo ""
    echo "[Logs] Pushing directly to repo via mapped drive"
    echo "[Logs]   -> $REMOTE_DEST"
else
    DEST="$LOCAL_DEST"
    MODE="local"
    mkdir -p "$LOCAL_DEST"
    echo ""
    echo "[Logs] Repo path not mounted — falling back to local:"
    echo "[Logs]   -> $(pwd)/$LOCAL_DEST"
    echo "[Logs] (You'll need to transfer this folder back to the repo manually.)"
fi
echo ""

# --- Last 3 crash reports (sorted newest first) ---
if [ -d "crash-reports" ]; then
    ls -t crash-reports/*.txt 2>/dev/null | head -n 3 | while IFS= read -r F; do
        cp -f "$F" "$DEST/$(basename "$F")"
        echo "  Crash: $(basename "$F")"
    done
fi

# --- ALL files in logs/kubejs/ — flattened into DEST with kubejs- prefix ---
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
if [ "$MODE" = "repo" ]; then
    echo "[Logs] Done. Files are now on the repo drive — commit + push from"
    echo "[Logs] the dev machine."
else
    echo "[Logs] Done. Files are in the local server_distribution folder."
    echo "[Logs] Copy them to the repo and commit there."
fi
echo ""
