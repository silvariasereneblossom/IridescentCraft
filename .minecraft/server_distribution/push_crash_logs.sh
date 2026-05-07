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

# --- Silent-mode tail: best-effort git push from a discoverable git root. ---
# Two topologies (mirrors the .bat):
#   A. dev host IS the test server; local instance root has .git.
#   B. dedicated test server with REMOTE_ROOT mounted to the dev host's repo.
#      Server has no local .git; the dev host's .git is reachable via the
#      mount path. Server-side git push uses dev host's stored credentials.
if [ "$SILENT" -eq 1 ]; then
    if ! command -v git >/dev/null 2>&1; then
        echo "[postexit] git not installed; logs mirrored only"
        exit 0
    fi

    GIT_ROOT=""
    LOCAL_INSTANCE="$(cd "$(dirname "$0")/../.." && pwd)"
    if [ -d "$LOCAL_INSTANCE/.git" ]; then
        GIT_ROOT="$LOCAL_INSTANCE"
    elif [ -d "$REMOTE_ROOT/../../.git" ]; then
        GIT_ROOT="$(cd "$REMOTE_ROOT/../.." && pwd)"
    fi

    if [ -n "$GIT_ROOT" ]; then
        # PAT auth: prefer ICRAFT_GH_TOKEN env, fall back to .icraft_token
        # next to this script. Same pattern as the .bat counterpart.
        GIT_PAT="${ICRAFT_GH_TOKEN:-}"
        TOKEN_FILE="$(dirname "$0")/.icraft_token"
        if [ -z "$GIT_PAT" ] && [ -f "$TOKEN_FILE" ]; then
            GIT_PAT="$(head -n1 "$TOKEN_FILE" | tr -d '[:space:]')"
        fi

        git -C "$GIT_ROOT" add ".minecraft/server_distribution/TesterLogs/Server Logs/" 2>&1 || true
        if ! git -C "$GIT_ROOT" diff --cached --quiet 2>/dev/null; then
            git -C "$GIT_ROOT" commit -m "Server Logs: session logs" 2>&1 || true
            # Push errors NOT silenced -- previous version hid them.
            if [ -n "$GIT_PAT" ]; then
                if git -C "$GIT_ROOT" -c "http.extraHeader=AUTHORIZATION: bearer $GIT_PAT" push 2>&1; then
                    echo "[postexit] Server logs pushed (via $GIT_ROOT)"
                else
                    echo "[postexit] ERROR: git push failed (see above). Logs mirrored only."
                fi
            else
                echo "[postexit] WARN: no PAT (set ICRAFT_GH_TOKEN or drop a .icraft_token next to this script); attempting unauthenticated push"
                if git -C "$GIT_ROOT" push 2>&1; then
                    echo "[postexit] Server logs pushed (via $GIT_ROOT)"
                else
                    echo "[postexit] ERROR: git push failed (see above). Logs mirrored only."
                fi
            fi
        else
            echo "[postexit] No log changes to push"
        fi
    else
        echo "[postexit] No git tree at local or remote instance root; logs mirrored only"
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
