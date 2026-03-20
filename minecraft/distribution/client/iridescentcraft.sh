#!/usr/bin/env bash
# =============================================================================
# IridescentCraft Client Installer (Linux)
# Builds a PrismLauncher-importable instance zip.
# PrismLauncher handles Forge download + mod downloads from .index metadata.
#
# Requirements:
#   - Linux x86_64
#   - PrismLauncher installed
#   - Java 17+
#   - zip, curl
#   - Minecraft account (Microsoft, Ely.by, or offline)
# =============================================================================

set -euo pipefail
cd "$(dirname "$0")"
SCRIPT_DIR="$(pwd)"

# ── Colors ──
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
echo -e "${TF_PINK}  IridescentCraft Client Installer${RESET}"
echo -e "${TF_WHITE}  Forge 1.20.1-47.4.6  ~420 mods${RESET}"
echo -e "${TF_PINK}  Iridescent Edition${RESET}"
echo -e "${TF_BLUE}  ==========================================${RESET}"
echo ""

# -------------------------------------------------------------------
# Phase 0: Ensure distribution files are available
# -------------------------------------------------------------------
DIST_DIR="$SCRIPT_DIR"

if [ ! -d "$DIST_DIR/mods/.index" ]; then
    echo "  [DOWNLOAD] Distribution files not found locally. Downloading from GitHub..."
    echo ""

    REPO_ZIP="/tmp/IridescentCraft-repo.zip"
    REPO_EXTRACT="/tmp/IridescentCraft-repo-extract"

    curl -sL "https://github.com/silvariasereneblossom/IridescentCraft/archive/refs/heads/main.zip" -o "$REPO_ZIP"
    rm -rf "$REPO_EXTRACT"
    unzip -qo "$REPO_ZIP" -d "$REPO_EXTRACT"

    DIST_DIR="$(find "$REPO_EXTRACT" -maxdepth 1 -type d | tail -1)/minecraft/distribution/client"

    if [ ! -d "$DIST_DIR/mods/.index" ]; then
        echo -e "  ${RED}ERROR: Could not find client distribution in downloaded repo.${RESET}"
        exit 1
    fi

    echo -e "  ${GREEN}[OK]${RESET} Distribution files ready."
    echo ""
fi

# -------------------------------------------------------------------
# Phase 1: Build instance staging directory
# -------------------------------------------------------------------
echo "  [BUILD] Assembling IridescentCraft instance package..."
echo ""

STAGING="/tmp/IridescentCraft-staging"
STAGE_MC="$STAGING/.minecraft"
STAGE_MODS="$STAGING/.minecraft/mods"
OUTPUT_ZIP="/tmp/IridescentCraft-instance.zip"

rm -rf "$STAGING"
mkdir -p "$STAGING" "$STAGE_MC" "$STAGE_MODS"

# Write instance.cfg
cat > "$STAGING/instance.cfg" << 'INSTCFG'
[General]
ConfigVersion=1.3
InstanceType=OneSix
MCLaunchMethod=LauncherPart
OverrideMemory=true
MaxMemAlloc=10240
MinMemAlloc=4096
iconKey=default
name=IridescentCraft
INSTCFG
echo "    instance.cfg... OK"

# Write mmc-pack.json
cat > "$STAGING/mmc-pack.json" << 'MMCPACK'
{
    "components": [
        {
            "cachedName": "Minecraft",
            "cachedVersion": "1.20.1",
            "important": true,
            "uid": "net.minecraft",
            "version": "1.20.1"
        },
        {
            "cachedName": "Forge",
            "cachedVersion": "47.4.6",
            "uid": "net.minecraftforge",
            "version": "47.4.6"
        }
    ],
    "formatVersion": 1
}
MMCPACK
echo "    mmc-pack.json... OK"

# Copy game files
if [ -d "$DIST_DIR/config" ]; then
    cp -r "$DIST_DIR/config" "$STAGE_MC/"
    echo "    config... OK"
fi
if [ -d "$DIST_DIR/defaultconfigs" ]; then
    cp -r "$DIST_DIR/defaultconfigs" "$STAGE_MC/"
    echo "    defaultconfigs... OK"
fi
if [ -d "$DIST_DIR/kubejs" ]; then
    cp -r "$DIST_DIR/kubejs" "$STAGE_MC/"
    echo "    kubejs... OK"
fi
if [ -d "$DIST_DIR/global_packs" ]; then
    cp -r "$DIST_DIR/global_packs" "$STAGE_MC/"
    echo "    global_packs... OK"
fi

# Copy mod index
if [ -d "$DIST_DIR/mods/.index" ]; then
    mkdir -p "$STAGE_MODS/.index"
    cp -r "$DIST_DIR/mods/.index/"* "$STAGE_MODS/.index/"
    echo "    mod index (.pw.toml)... OK"
fi

# Copy custom JARs
if ls "$DIST_DIR"/mods/*.jar &>/dev/null; then
    cp "$DIST_DIR"/mods/*.jar "$STAGE_MODS/"
    echo "    custom JARs... OK"
fi

echo ""
echo -e "  ${GREEN}[OK]${RESET} Instance package assembled."
echo ""

# -------------------------------------------------------------------
# Phase 2: Zip it
# -------------------------------------------------------------------
echo "  [ZIP] Creating importable archive..."

rm -f "$OUTPUT_ZIP"
(cd "$STAGING" && zip -r "$OUTPUT_ZIP" . -x "*.DS_Store" > /dev/null 2>&1)

if [ ! -f "$OUTPUT_ZIP" ]; then
    echo -e "  ${RED}ERROR: Failed to create zip.${RESET}"
    exit 1
fi

ZIP_SIZE=$(du -h "$OUTPUT_ZIP" | cut -f1)
echo "    Created: $OUTPUT_ZIP ($ZIP_SIZE)"
echo ""

# -------------------------------------------------------------------
# Phase 3: Choose save location
# -------------------------------------------------------------------
DEFAULT_SAVE="$HOME/Desktop/IridescentCraft-instance.zip"

# Try GUI file picker if available
SAVE_PATH=""
if command -v zenity &>/dev/null; then
    SAVE_PATH=$(zenity --file-selection --save --confirm-overwrite \
        --title="Save IridescentCraft Instance" \
        --filename="$DEFAULT_SAVE" \
        --file-filter="ZIP Archive|*.zip" 2>/dev/null) || true
elif command -v kdialog &>/dev/null; then
    SAVE_PATH=$(kdialog --getsavefilename "$DEFAULT_SAVE" "*.zip" 2>/dev/null) || true
fi

if [ -z "$SAVE_PATH" ]; then
    # No GUI or cancelled — use default
    SAVE_PATH="$DEFAULT_SAVE"
    echo "  Saving to default location: $SAVE_PATH"
fi

cp "$OUTPUT_ZIP" "$SAVE_PATH"
echo -e "  ${GREEN}Saved to: $SAVE_PATH${RESET}"
echo ""

# -------------------------------------------------------------------
# Phase 4: Try to auto-import via PrismLauncher CLI
# -------------------------------------------------------------------
PRISM_EXE=""
if command -v prismlauncher &>/dev/null; then
    PRISM_EXE="prismlauncher"
elif flatpak list 2>/dev/null | grep -qi prismlauncher; then
    PRISM_EXE="flatpak run org.prismlauncher.PrismLauncher"
fi

if [ -n "$PRISM_EXE" ]; then
    echo "  [IMPORT] Launching PrismLauncher with instance import..."
    echo ""
    $PRISM_EXE --import "$SAVE_PATH" &
    echo "    PrismLauncher should open with the import dialog."
    echo "    Click OK to import, then launch the instance."
    echo ""
    echo "    First launch will download Forge + ~420 mods."
    echo "    This takes 5-15 minutes depending on your internet."
    echo ""
else
    echo "  ==================================================================="
    echo "    HOW TO IMPORT:"
    echo "  ==================================================================="
    echo ""
    echo "    1. Open PrismLauncher"
    echo "    2. Click 'Add Instance' (top left)"
    echo "    3. Select 'Import' tab"
    echo "    4. Browse to: $SAVE_PATH"
    echo "    5. Click OK"
    echo "    6. PrismLauncher will download Forge + all mods automatically"
    echo "    7. Add your Minecraft account in Settings if needed"
    echo "    8. Launch!"
    echo ""
    echo "    First launch takes 5-15 minutes (Forge + 420 mods)."
    echo ""
fi

# Cleanup
rm -rf "$STAGING"
[ -n "${REPO_EXTRACT:-}" ] && rm -rf "$REPO_EXTRACT"
[ -n "${REPO_ZIP:-}" ] && rm -f "$REPO_ZIP"

echo "  Done!"
echo ""
