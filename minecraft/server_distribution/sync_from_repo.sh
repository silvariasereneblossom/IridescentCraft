#!/usr/bin/env bash
# IridescentCraft Server — Sync from Repo to Local Server (Linux)
# Mirrors the repo's server_distribution to the local server folder.
#
# Usage: ./sync_from_repo.sh [REPO_PATH]
#   REPO_PATH defaults to the script's own directory (for when running
#   from the repo). Override to sync from a remote/mounted path.
#
# Excludes runtime data: world, logs, crash-reports, backups, libraries, mods (downloaded JARs)

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Source = repo server_distribution (default: this script's directory)
REPO="${1:-$SCRIPT_DIR}"

# Destination = local server (override with second argument or env var)
LOCAL="${2:-${ICRAFT_SERVER_DIR:-$SCRIPT_DIR}}"

# If source and dest are the same, nothing to sync
if [ "$(realpath "$REPO")" = "$(realpath "$LOCAL")" ]; then
    echo "Source and destination are the same directory. Nothing to sync."
    echo "Usage: ./sync_from_repo.sh /path/to/repo/server_distribution /path/to/local/server"
    exit 0
fi

TF_BLUE='\033[38;2;91;206;250m'
TF_PINK='\033[38;2;245;169;184m'
TF_WHITE='\033[38;2;255;255;255m'
RESET='\033[0m'

echo ""
echo -e "${TF_BLUE}  ==========================================${RESET}"
echo -e "${TF_PINK}  IridescentCraft Server Sync${RESET}"
echo -e "${TF_WHITE}  Repo to Local Server${RESET}"
echo -e "${TF_PINK}  Iridescent Edition${RESET}"
echo -e "${TF_BLUE}  ==========================================${RESET}"
echo ""
echo "  Source: $REPO"
echo "  Dest:   $LOCAL"
echo ""

# Verify paths
if [ ! -d "$REPO" ]; then
    echo "ERROR: Repo path not found: $REPO"
    exit 1
fi

if [ ! -d "$LOCAL" ]; then
    echo "ERROR: Local server path not found: $LOCAL"
    exit 1
fi

echo "[SYNC] Syncing server files..."

# Main sync — exclude runtime data and mods (downloaded JARs)
rsync -av --delete \
    --exclude='world/' \
    --exclude='logs/' \
    --exclude='crash-reports/' \
    --exclude='backups/' \
    --exclude='libraries/' \
    --exclude='.cache/' \
    --exclude='mods/' \
    --exclude='server_output.log' \
    --exclude='crash-*.log' \
    --exclude='usercache.json' \
    --exclude='banned-ips.json' \
    --exclude='banned-players.json' \
    --exclude='ops.json' \
    --exclude='whitelist.json' \
    --exclude='installer.log' \
    "$REPO/" "$LOCAL/"

# Sync mods/.index metadata (mirror — track added/removed mods)
echo "[SYNC] Syncing mod metadata..."
rsync -av --delete "$REPO/mods/.index/" "$LOCAL/mods/.index/"

# Copy custom JARs only (don't delete downloaded mods)
echo "[SYNC] Syncing custom mod JARs..."
rsync -av --include='*.jar' --exclude='*' "$REPO/mods/" "$LOCAL/mods/"

echo ""
echo "[OK] Sync complete."

# Check for mod updates
echo ""
echo "[UPDATE] Checking for mod version changes..."
pushd "$LOCAL" > /dev/null
bash "$LOCAL/update_mods.sh" "mods"
popd > /dev/null

# Check if server is running
if pgrep -f "forge.*nogui" > /dev/null 2>&1 || pgrep -f "minecraft_server" > /dev/null 2>&1; then
    echo "[NOTE] Minecraft server appears to be running. Restart to pick up changes."
fi

echo ""
