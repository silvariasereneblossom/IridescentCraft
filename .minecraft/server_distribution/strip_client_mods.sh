#!/usr/bin/env bash
# IridescentCraft — Strip Client/Crash Mods (Linux)
# Removes mods from mods/ that are known to crash or serve no purpose
# on a dedicated server.

set -euo pipefail
cd "$(dirname "$0")"

# Trans flag colors
TF_BLUE='\033[38;2;91;206;250m'
TF_PINK='\033[38;2;245;169;184m'
TF_WHITE='\033[38;2;255;255;255m'
RESET='\033[0m'

echo ""
echo -e "${TF_BLUE}  ==========================================${RESET}"
echo -e "${TF_PINK}  IridescentCraft: Strip Client-Only Mods${RESET}"
echo -e "${TF_WHITE}  Server Utility${RESET}"
echo -e "${TF_PINK}  Iridescent Edition${RESET}"
echo -e "${TF_BLUE}  ==========================================${RESET}"
echo ""

echo "This script removes mods from mods/ that are known to crash"
echo "or serve no purpose on a dedicated server."
echo ""

if [ ! -d "mods" ]; then
    echo "ERROR: mods/ folder not found. Run this from the server root."
    exit 1
fi

removed=0

delete_mod() {
    local pattern="$1"
    for f in mods/$pattern; do
        if [ -f "$f" ]; then
            echo "  Removing: $(basename "$f")"
            rm -f "$f"
            removed=$((removed + 1))
        fi
    done
}

# --- Rendering / client-only mods that crash on dedicated server ---
delete_mod "embeddium*"
delete_mod "oculus*"
delete_mod "immediatelyfast*"
delete_mod "*rubidium-extra*"

# --- Client GUI / display mods ---
delete_mod "*kubejsoffline*"
delete_mod "*light-overlay*"
delete_mod "*equipment-compare*"
delete_mod "*EquipmentCompare*"
delete_mod "*chat_heads*"
delete_mod "*BetterAnimations*"
delete_mod "*transmog*"

# --- Dev tools that crash on server ---
delete_mod "*probejs*"
delete_mod "*ProbeJS*"

# --- References client classes ---
delete_mod "*irons_spells_js*"

# --- Crashes with Create (BlockStarLightEngine.initNibble ISE) ---
delete_mod "*starlight*"

# --- Disabled mods that may linger from manual copies ---
delete_mod "*gh_classes*"

# --- Removed mods (worldgen crash) ---
delete_mod "*cherryvillage*"
delete_mod "*CherryVillage*"

# --- Removed mods (SuperMartijn642 lib incompatibility) ---
delete_mod "*rechiseled*"
delete_mod "*supermartijn642*"

# --- Removed (dedicated-server ClientLevel dist cascade; bundled Fabric-port ranged_weapon_api breaks dist-cleaning) ---
delete_mod "*soulslike-weaponry*"

# --- Client-side-only mods (side='client' in metadata) ---
delete_mod "*auudio*"
delete_mod "*BetterAdvancements*"
delete_mod "*biomemusic*"
delete_mod "*CTM-*"
delete_mod "*CutThrough*"
delete_mod "*fallingleaves*"
delete_mod "*Highlighter*"
delete_mod "*inventoryhud*"
delete_mod "*jeed-*"
delete_mod "*jmi-forge*"
delete_mod "*lazyDFU*"
delete_mod "*libIPN*"
delete_mod "*MouseTweaks*"
delete_mod "*Prism-*"

echo ""
echo "Removed $removed mod file(s)."
echo ""
