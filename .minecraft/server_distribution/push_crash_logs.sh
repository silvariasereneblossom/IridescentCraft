#!/usr/bin/env bash
# =============================================================================
# IridescentCraft - Push server logs directly to the repo via network drive
# Primary destination: Z:/.../PrismLauncher/instances/IridescentCraft/.minecraft/
#                       server_distribution/TesterLogs/Server Logs/
# (network drive on Windows Server - on Linux equivalent, set REMOTE_DEST env)
# Fallback: local server_distribution/TesterLogs/Server Logs/ if repo path
# isn't mounted.
#
# Modes:
#   push_crash_logs.sh              interactive (manual failsafe; verbose
#                                   per-file echo lines for the operator)
#   push_crash_logs.sh --silent     non-interactive (called by Phase 5 of
#                                   iridescentserver.sh on every server exit;
#                                   suppresses per-file echos and additionally
#                                   tries a git push if the parent dir is a
#                                   git working tree)
# =============================================================================

set -euo pipefail

SILENT=0
case "${1:-}" in
    --silent|-s) SILENT=1 ;;
esac

say() {
    [ "$SILENT" -eq 0 ] && echo "$@" || true
}

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
    say ""
    say "[Logs] Pushing directly to repo via mapped drive"
    say "[Logs]   -> $REMOTE_DEST"
else
    DEST="$LOCAL_DEST"
    MODE="local"
    mkdir -p "$LOCAL_DEST"
    say ""
    say "[Logs] Repo path not mounted - falling back to local:"
    say "[Logs]   -> $(pwd)/$LOCAL_DEST"
    say "[Logs] (You'll need to transfer this folder back to the repo manually.)"
fi
say ""

# --- Last 3 crash reports (sorted newest first) ---
if [ -d "crash-reports" ]; then
    ls -t crash-reports/*.txt 2>/dev/null | head -n 3 | while IFS= read -r F; do
        cp -f "$F" "$DEST/$(basename "$F")"
        say "  Crash: $(basename "$F")"
    done
fi

# --- ALL files in logs/kubejs/ - flattened into DEST with kubejs- prefix ---
if [ -d "logs/kubejs" ]; then
    for F in logs/kubejs/*.log logs/kubejs/*.log.gz; do
        [ -f "$F" ] || continue
        cp -f "$F" "$DEST/kubejs-$(basename "$F")"
        say "  KubeJS: $(basename "$F")"
    done
fi

# --- logs/latest.log (vanilla server log) ---
if [ -f "logs/latest.log" ]; then
    cp -f "logs/latest.log" "$DEST/latest.log"
    say "  Server: latest.log"
fi

# --- logs/debug.log if present (Forge debug output) ---
if [ -f "logs/debug.log" ]; then
    cp -f "logs/debug.log" "$DEST/debug.log"
    say "  Server: debug.log"
fi

# --- Silent-mode tail: best-effort git push from instance root. ---
if [ "$SILENT" -eq 1 ]; then
    INSTANCE_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
    if git -C "$INSTANCE_ROOT" rev-parse --git-dir >/dev/null 2>&1; then
        git -C "$INSTANCE_ROOT" add ".minecraft/server_distribution/TesterLogs/Server Logs/" >/dev/null 2>&1 || true
        if ! git -C "$INSTANCE_ROOT" diff --cached --quiet 2>/dev/null; then
            git -C "$INSTANCE_ROOT" commit -m "Server Logs: session logs" >/dev/null 2>&1 || true
            git -C "$INSTANCE_ROOT" push >/dev/null 2>&1 || true
            echo "[postexit] Server logs pushed"
        else
            echo "[postexit] No log changes to push"
        fi
    else
        echo "[postexit] Logs mirrored (no git tree at parent; manual sync in effect)"
    fi
    exit 0
fi

echo ""
if [ "$MODE" = "repo" ]; then
    echo "[Logs] Done. Files are now on the repo drive - commit + push from"
    echo "[Logs] the dev machine."
else
    echo "[Logs] Done. Files are in the local server_distribution folder."
    echo "[Logs] Copy them to the repo and commit there."
fi
echo ""
