#!/usr/bin/env bash
# =============================================================================
# IridescentCraft Config Updater (Linux)
# Downloads latest configs/kubejs/datapacks and updates existing instance.
# Does NOT touch mods — only game configuration files.
# =============================================================================

set -euo pipefail
cd "$(dirname "$0")"
SCRIPT_DIR="$(pwd)"

# Trans flag colors
TF_BLUE='\033[38;2;91;206;250m'
TF_PINK='\033[38;2;245;169;184m'
TF_WHITE='\033[38;2;255;255;255m'
RESET='\033[0m'
GREEN='\033[32m'
CYAN='\033[36m'
RED='\033[31m'
YELLOW='\033[33m'

echo ""
echo -e "${TF_BLUE}  ==========================================${RESET}"
echo -e "${TF_PINK}  IridescentCraft Config Updater${RESET}"
echo -e "${TF_WHITE}  Forge 1.20.1-47.4.6  ~450 mods${RESET}"
echo -e "${TF_PINK}  Iridescent Edition${RESET}"
echo -e "${TF_BLUE}  ==========================================${RESET}"
echo ""

# ── Step 1: Find the instance ──
echo -e "  ${CYAN}[1/3] Finding IridescentCraft instance...${RESET}"

INSTANCE_MC=""

# Search common PrismLauncher data dirs
for DATA_DIR in \
    "$HOME/.local/share/PrismLauncher" \
    "$HOME/.var/app/org.prismlauncher.PrismLauncher/data/PrismLauncher" \
    "${XDG_DATA_HOME:-$HOME/.local/share}/PrismLauncher"; do

    if [ ! -d "$DATA_DIR/instances" ]; then continue; fi

    for INST_DIR in "$DATA_DIR/instances"/IridescentCraft*; do
        if [ -d "$INST_DIR/.minecraft" ]; then
            INSTANCE_MC="$INST_DIR/.minecraft"
            break 2
        fi
        if [ -d "$INST_DIR/minecraft" ]; then
            INSTANCE_MC="$INST_DIR/minecraft"
            break 2
        fi
    done
done

if [ -z "$INSTANCE_MC" ]; then
    echo -e "    ${YELLOW}Could not find instance automatically.${RESET}"
    echo "    In PrismLauncher: right-click instance -> Folder -> .minecraft"
    echo ""
    read -rp "    Paste the .minecraft path here: " MANUAL_PATH
    if [ -n "$MANUAL_PATH" ] && [ -d "$MANUAL_PATH" ]; then
        INSTANCE_MC="$MANUAL_PATH"
    else
        echo -e "    ${RED}Invalid path. Exiting.${RESET}"
        exit 1
    fi
fi

echo -e "    ${GREEN}Found: $INSTANCE_MC${RESET}"
echo ""

# ── Step 2: Download latest configs from GitHub ──
echo -e "  ${CYAN}[2/3] Downloading latest configs from GitHub...${RESET}"
echo ""

DIST_DIR="$SCRIPT_DIR"

# Check if we have local distribution files
if [ ! -d "$DIST_DIR/config" ]; then
    DIST_DIR="/tmp/IridescentCraft-update"
    REPO_ZIP="/tmp/IridescentCraft-update-repo.zip"
    REPO_EXTRACT="/tmp/IridescentCraft-update-extract"

    echo "    Downloading repository..."
    curl -sL "https://github.com/silvariasereneblossom/IridescentCraft/archive/refs/heads/main.zip" -o "$REPO_ZIP"

    if [ ! -f "$REPO_ZIP" ] || [ "$(stat -c%s "$REPO_ZIP" 2>/dev/null || stat -f%z "$REPO_ZIP" 2>/dev/null)" -lt 1000000 ]; then
        echo -e "    ${RED}ERROR: Download failed.${RESET}"
        rm -f "$REPO_ZIP"
        exit 1
    fi

    echo "    Extracting configs..."
    rm -rf "$REPO_EXTRACT"
    unzip -qo "$REPO_ZIP" -d "$REPO_EXTRACT"

    SRC_DIR="$(find "$REPO_EXTRACT" -maxdepth 1 -type d | tail -1)/minecraft/distribution/client"

    rm -rf "$DIST_DIR"
    mkdir -p "$DIST_DIR"

    for dir in config defaultconfigs kubejs; do
        if [ -d "$SRC_DIR/$dir" ]; then
            cp -r "$SRC_DIR/$dir" "$DIST_DIR/$dir"
        fi
    done

    rm -f "$REPO_ZIP"
    rm -rf "$REPO_EXTRACT"
    echo -e "    ${GREEN}[OK] Config files ready.${RESET}"
fi

echo ""

# ── Step 3: Copy configs to instance ──
echo -e "  ${CYAN}[3/3] Updating instance configs...${RESET}"

updated=0
for dir in config defaultconfigs kubejs; do
    if [ -d "$DIST_DIR/$dir" ]; then
        mkdir -p "$INSTANCE_MC/$dir"
        cp -r "$DIST_DIR/$dir/." "$INSTANCE_MC/$dir/"
        count=$(find "$DIST_DIR/$dir" -type f | wc -l)
        echo "    $dir ($count files)... OK"
        updated=$((updated + count))
    fi
done

# Cleanup temp download
if [[ "$DIST_DIR" == /tmp/* ]]; then
    rm -rf "$DIST_DIR"
fi

echo ""
echo -e "  ${GREEN}Updated $updated files.${RESET}"
echo ""
echo -e "  ${YELLOW}Restart the game to apply changes.${RESET}"
echo ""
