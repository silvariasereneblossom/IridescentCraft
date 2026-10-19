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

# Jar-name patterns a dedicated server must never keep: the pack's client-only
# mods and retired mods. The reason for each one is in the pack repository:
# .minecraft/dev/mods/mod_index.policy.json
# >>> mod_index.py: sh-delete (GENERATED from mods/.index + dev/mods/mod_index.policy.json. Do not edit: run mod_index.py generate)
delete_mod "*embeddium*"
delete_mod "*oculus*"
delete_mod "*immediatelyfast*"
delete_mod "*rubidium-extra*"
delete_mod "*kubejsoffline*"
delete_mod "*light-overlay*"
delete_mod "*equipment-compare*"
delete_mod "*chat_heads*"
delete_mod "*BetterAnimations*"
delete_mod "*transmog*"
delete_mod "*probejs*"
delete_mod "*irons_spells_js*"
delete_mod "*gh_classes*"
delete_mod "*cherryvillage*"
delete_mod "*rechiseled*"
delete_mod "*supermartijn642*"
delete_mod "*connectedglass*"
delete_mod "*trashcans*"
delete_mod "*ftbbackups*"
delete_mod "*ftbchunks*"
delete_mod "*ftbessentials*"
delete_mod "*ftblibrary*"
delete_mod "*ftbquests*"
delete_mod "*ftbranks*"
delete_mod "*ftbteams*"
delete_mod "*ftbultimine*"
delete_mod "*mca-social*"
delete_mod "*starlight*"
delete_mod "*EquipmentCompare*"
delete_mod "*ProbeJS*"
delete_mod "*CherryVillage*"
delete_mod "*ImmediatelyFast*"
delete_mod "*mcasocial*"
delete_mod "*champions*"
delete_mod "*soulslike-weaponry*"
delete_mod "*AmbientSounds_*"
delete_mod "*athena-*"
delete_mod "*auudio_*"
delete_mod "*BadOptimizations-*"
delete_mod "*BEB-*"
delete_mod "*BetterAdvancements-*"
delete_mod "*biomemusic-*"
delete_mod "*configured-*"
delete_mod "*Controlling-*"
delete_mod "*CTM-*"
delete_mod "*CutThrough-*"
delete_mod "*defaultoptions-*"
delete_mod "*EnchantmentDescriptions-*"
delete_mod "*entity_model_features_*"
delete_mod "*entity_texture_features_*"
delete_mod "*entityculling-*"
delete_mod "*fallingleaves-*"
delete_mod "*fancymenu_*"
delete_mod "*Highlighter-*"
delete_mod "*inventoryhud.*"
delete_mod "*jeed-*"
delete_mod "*jmi-*"
delete_mod "*JustEnoughMekanismMultiblocks-*"
delete_mod "*konkrete_*"
delete_mod "*lazyDFU-*"
delete_mod "*libIPN-*"
delete_mod "*mek_walkable_cables-*"
delete_mod "*melody_*"
delete_mod "*MouseTweaks-*"
delete_mod "*OverflowingBars-*"
delete_mod "*Prism-*"
delete_mod "*Searchables-*"
delete_mod "*tenshilib-*"
delete_mod "*ToolStats-*"
delete_mod "*TravelersTitles-*"
delete_mod "*treasuredistance-*"
# <<< mod_index.py

echo ""
echo "Removed $removed mod file(s)."
echo ""
