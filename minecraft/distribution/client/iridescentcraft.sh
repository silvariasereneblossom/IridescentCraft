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
# Phase 1: Build .mrpack (Modrinth pack format)
# -------------------------------------------------------------------
# PrismLauncher natively imports .mrpack and downloads all mods.
echo "  [BUILD] Building Modrinth pack (.mrpack)..."
echo ""

STAGING="/tmp/IridescentCraft-mrpack"
OUTPUT_MRPACK="/tmp/IridescentCraft.mrpack"

rm -rf "$STAGING"
mkdir -p "$STAGING/overrides/mods"

# Parse .pw.toml files and build modrinth.index.json
INDEX_DIR="$DIST_DIR/mods/.index"
TOML_COUNT=$(ls "$INDEX_DIR"/*.pw.toml 2>/dev/null | wc -l)
echo "    Parsing $TOML_COUNT .pw.toml files..."

# Build JSON files array
FILES_JSON="["
FIRST=true
MOD_COUNT=0

for toml in "$INDEX_DIR"/*.pw.toml; do
    [ -f "$toml" ] || continue

    FILENAME="" SIDE="both" MODE="" URL="" HASH="" HASH_FMT="" FILE_ID=""

    while IFS= read -r line; do
        line="$(echo "$line" | sed 's/^[[:space:]]*//')"
        case "$line" in
            filename\ =\ *) FILENAME="$(echo "$line" | sed "s/^filename[[:space:]]*=[[:space:]]*['\"]//;s/['\"]$//")" ;;
            side\ =\ *)     SIDE="$(echo "$line" | sed "s/^side[[:space:]]*=[[:space:]]*['\"]//;s/['\"]$//")" ;;
            mode\ =\ *)     MODE="$(echo "$line" | sed "s/^mode[[:space:]]*=[[:space:]]*['\"]//;s/['\"]$//")" ;;
            url\ =\ *)      URL="$(echo "$line" | sed "s/^url[[:space:]]*=[[:space:]]*['\"]//;s/['\"]$//")" ;;
            hash\ =\ *)     HASH="$(echo "$line" | sed "s/^hash[[:space:]]*=[[:space:]]*['\"]//;s/['\"]$//")" ;;
            hash-format\ =\ *) HASH_FMT="$(echo "$line" | sed "s/^hash-format[[:space:]]*=[[:space:]]*['\"]//;s/['\"]$//")" ;;
            file-id\ =\ *)  FILE_ID="$(echo "$line" | sed 's/^file-id[[:space:]]*=[[:space:]]*//')" ;;
        esac
    done < "$toml"

    [ -z "$FILENAME" ] && continue

    # Build download URL
    DL_URL=""
    if [ "$MODE" = "url" ] && [ -n "$URL" ]; then
        DL_URL="$URL"
    elif [ "$MODE" = "metadata:curseforge" ] && [ -n "$FILE_ID" ]; then
        PART1="${FILE_ID:0:4}"
        PART2="${FILE_ID:4}"
        PART2="$(echo "$PART2" | sed 's/^0*//')"
        [ -z "$PART2" ] && PART2="0"
        DL_URL="https://edge.forgecdn.net/files/$PART1/$PART2/$FILENAME"
    fi
    [ -z "$DL_URL" ] && continue

    # Env mapping
    ENV_CLIENT="required"; ENV_SERVER="required"
    [ "$SIDE" = "client" ] && ENV_SERVER="unsupported"
    [ "$SIDE" = "server" ] && ENV_CLIENT="unsupported"

    # Build hashes object
    HASHES_JSON="{}"
    if [ -n "$HASH" ] && [ -n "$HASH_FMT" ]; then
        HASHES_JSON="{\"$HASH_FMT\":\"$HASH\"}"
    fi

    # Append to files array
    if [ "$FIRST" = true ]; then FIRST=false; else FILES_JSON="$FILES_JSON,"; fi
    FILES_JSON="$FILES_JSON
    {\"path\":\"mods/$FILENAME\",\"downloads\":[\"$DL_URL\"],\"fileSize\":0,\"hashes\":$HASHES_JSON,\"env\":{\"client\":\"$ENV_CLIENT\",\"server\":\"$ENV_SERVER\"}}"
    MOD_COUNT=$((MOD_COUNT + 1))
done

FILES_JSON="$FILES_JSON
  ]"

echo "    $MOD_COUNT mods indexed."

# Write modrinth.index.json
cat > "$STAGING/modrinth.index.json" << MRINDEX
{
  "formatVersion": 1,
  "game": "minecraft",
  "versionId": "1.0.0-alpha",
  "name": "IridescentCraft",
  "summary": "Progression-focused RPG modpack with 420+ mods.",
  "files": $FILES_JSON,
  "dependencies": {
    "minecraft": "1.20.1",
    "forge": "47.4.6"
  }
}
MRINDEX
echo "    modrinth.index.json... OK"

# Copy overrides
for dir in config defaultconfigs kubejs global_packs; do
    if [ -d "$DIST_DIR/$dir" ]; then
        cp -r "$DIST_DIR/$dir" "$STAGING/overrides/"
        echo "    overrides/$dir... OK"
    fi
done

# Custom JARs
if ls "$DIST_DIR"/mods/*.jar &>/dev/null; then
    cp "$DIST_DIR"/mods/*.jar "$STAGING/overrides/mods/"
    CUSTOM_COUNT=$(ls "$DIST_DIR"/mods/*.jar | wc -l)
    echo "    overrides/mods/ ($CUSTOM_COUNT custom JARs)... OK"
fi

# Create .mrpack
rm -f "$OUTPUT_MRPACK"
(cd "$STAGING" && zip -r "$OUTPUT_MRPACK" . -x "*.DS_Store" > /dev/null 2>&1)

if [ ! -f "$OUTPUT_MRPACK" ]; then
    echo -e "  ${RED}ERROR: Failed to create .mrpack.${RESET}"
    exit 1
fi

MRPACK_SIZE=$(du -h "$OUTPUT_MRPACK" | cut -f1)
echo ""
echo -e "  ${GREEN}[OK]${RESET} .mrpack created ($MRPACK_SIZE)"
echo ""

# -------------------------------------------------------------------
# Phase 2: Choose save location
# -------------------------------------------------------------------
DEFAULT_SAVE="$HOME/Desktop/IridescentCraft.mrpack"

# Try GUI file picker if available
SAVE_PATH=""
if command -v zenity &>/dev/null; then
    SAVE_PATH=$(zenity --file-selection --save --confirm-overwrite \
        --title="Save IridescentCraft Instance" \
        --filename="$DEFAULT_SAVE" \
        --file-filter="Modrinth Pack|*.mrpack" 2>/dev/null) || true
elif command -v kdialog &>/dev/null; then
    SAVE_PATH=$(kdialog --getsavefilename "$DEFAULT_SAVE" "*.mrpack" 2>/dev/null) || true
fi

if [ -z "$SAVE_PATH" ]; then
    # No GUI or cancelled — use default
    SAVE_PATH="$DEFAULT_SAVE"
    echo "  Saving to default location: $SAVE_PATH"
fi

cp "$OUTPUT_MRPACK" "$SAVE_PATH"
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
else
    # Check AppImage in common locations
    for f in "$HOME"/Downloads/PrismLauncher*.AppImage "$HOME"/Applications/PrismLauncher*.AppImage "$HOME"/.local/share/PrismLauncher/PrismLauncher*.AppImage; do
        if [ -x "$f" ] 2>/dev/null; then
            PRISM_EXE="$f"
            break
        fi
    done
fi

# Download if not found
if [ -z "$PRISM_EXE" ]; then
    echo "  [INSTALL] PrismLauncher not found. Downloading AppImage..."
    echo ""

    PRISM_DIR="$HOME/.local/share/PrismLauncher"
    mkdir -p "$PRISM_DIR"

    DL_URL=$(curl -sL "https://api.github.com/repos/PrismLauncher/PrismLauncher/releases/latest" \
        | grep -oP '"browser_download_url":\s*"\K[^"]*Linux-x86_64\.AppImage(?=")' \
        | head -1)

    if [ -n "$DL_URL" ]; then
        APPIMAGE_PATH="$PRISM_DIR/PrismLauncher.AppImage"
        echo "    Downloading: $(basename "$DL_URL")"
        curl -L "$DL_URL" -o "$APPIMAGE_PATH"
        chmod +x "$APPIMAGE_PATH"
        PRISM_EXE="$APPIMAGE_PATH"
        echo -e "  ${GREEN}[OK]${RESET} PrismLauncher installed."
        echo ""
    else
        echo -e "  ${YELLOW}WARNING: Could not download PrismLauncher.${RESET}"
        echo "    Install manually from https://prismlauncher.org/download/"
        echo ""
    fi
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
