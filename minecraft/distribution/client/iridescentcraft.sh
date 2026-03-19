#!/usr/bin/env bash
# =============================================================================
# IridescentCraft Client Installer (Linux)
# One-click: finds/downloads PrismLauncher, sets up instance, downloads mods
#
# Requirements:
#   - Linux x86_64
#   - Java 17+
#   - curl, unzip
#   - Minecraft account (Microsoft, Ely.by, or offline)
# =============================================================================

set -euo pipefail
cd "$(dirname "$0")"

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
# Phase 1: Find or download PrismLauncher
# -------------------------------------------------------------------
PRISM_EXE=""

# Check common locations
for p in \
    "$HOME/.local/bin/prismlauncher" \
    "$HOME/.local/share/PrismLauncher/prismlauncher" \
    "/usr/bin/prismlauncher" \
    "/usr/local/bin/prismlauncher" \
    "/opt/prismlauncher/prismlauncher" \
    "$HOME/Applications/PrismLauncher/prismlauncher" \
    "$(dirname "$0")/PrismLauncher/prismlauncher"; do
    if [ -x "$p" ] 2>/dev/null; then
        PRISM_EXE="$p"
        break
    fi
done

# Check PATH
if [ -z "$PRISM_EXE" ]; then
    if command -v prismlauncher &>/dev/null; then
        PRISM_EXE="$(command -v prismlauncher)"
    fi
fi

# Check flatpak
if [ -z "$PRISM_EXE" ]; then
    if flatpak list 2>/dev/null | grep -qi prismlauncher; then
        PRISM_EXE="flatpak run org.prismlauncher.PrismLauncher"
    fi
fi

# Check AppImage in common locations
if [ -z "$PRISM_EXE" ]; then
    for f in "$HOME"/Downloads/PrismLauncher*.AppImage "$HOME"/Applications/PrismLauncher*.AppImage; do
        if [ -x "$f" ] 2>/dev/null; then
            PRISM_EXE="$f"
            break
        fi
    done
fi

if [ -n "$PRISM_EXE" ]; then
    echo -e "  ${GREEN}[OK]${RESET} PrismLauncher found: $PRISM_EXE"
    echo ""
else
    echo "  PrismLauncher not found."
    echo "  Enter the path to prismlauncher, or press Enter to download."
    echo ""
    read -rp "  Path (or Enter to download): " USER_PRISM
    if [ -n "$USER_PRISM" ] && [ -x "$USER_PRISM" ]; then
        PRISM_EXE="$USER_PRISM"
        echo -e "  ${GREEN}[OK]${RESET} Using: $PRISM_EXE"
        echo ""
    else
        echo ""
        echo "  [INSTALL] Downloading PrismLauncher AppImage..."
        echo ""

        PRISM_DIR="$HOME/.local/share/PrismLauncher"
        mkdir -p "$PRISM_DIR"

        # Get latest AppImage URL from GitHub
        DL_URL=$(curl -sL "https://api.github.com/repos/PrismLauncher/PrismLauncher/releases/latest" \
            | grep -oP '"browser_download_url":\s*"\K[^"]*Linux-x86_64\.AppImage(?=")' \
            | head -1)

        if [ -z "$DL_URL" ]; then
            echo -e "  ${RED}ERROR:${RESET} Could not find AppImage download URL."
            echo "  Please install PrismLauncher from https://prismlauncher.org/download/"
            exit 1
        fi

        APPIMAGE_PATH="$PRISM_DIR/PrismLauncher.AppImage"
        echo "  Downloading: $(basename "$DL_URL")"
        curl -L "$DL_URL" -o "$APPIMAGE_PATH"
        chmod +x "$APPIMAGE_PATH"

        PRISM_EXE="$APPIMAGE_PATH"
        echo -e "  ${GREEN}[OK]${RESET} PrismLauncher installed."
        echo ""
    fi
fi

# -------------------------------------------------------------------
# Phase 2: Set up instance
# -------------------------------------------------------------------
# PrismLauncher data directory varies:
#   - Standard: ~/.local/share/PrismLauncher
#   - Flatpak:  ~/.var/app/org.prismlauncher.PrismLauncher/data/PrismLauncher
# -------------------------------------------------------------------

echo "  [SETUP] Preparing IridescentCraft instance..."
echo ""

# Detect data directory
if echo "$PRISM_EXE" | grep -q flatpak; then
    DATA_DIR="$HOME/.var/app/org.prismlauncher.PrismLauncher/data/PrismLauncher"
else
    DATA_DIR="$HOME/.local/share/PrismLauncher"
fi

INSTANCES_DIR="$DATA_DIR/instances"
INSTANCE_DIR="$INSTANCES_DIR/IridescentCraft"
MC_DIR="$INSTANCE_DIR/.minecraft"

mkdir -p "$INSTANCES_DIR" "$INSTANCE_DIR" "$MC_DIR/mods"

# Always sync configs/scripts/datapacks (supports updates on re-run)
echo "  Syncing game files..."

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

if [ -d "$SCRIPT_DIR/config" ]; then
    cp -r "$SCRIPT_DIR/config" "$MC_DIR/"
    echo "    config... OK"
    [ -d "$SCRIPT_DIR/defaultconfigs" ] && cp -r "$SCRIPT_DIR/defaultconfigs" "$MC_DIR/" && echo "    defaultconfigs... OK"
    cp -r "$SCRIPT_DIR/kubejs" "$MC_DIR/"
    echo "    kubejs... OK"
    cp -r "$SCRIPT_DIR/global_packs" "$MC_DIR/"
    echo "    global_packs... OK"

    # Copy custom mod JARs
    if ls "$SCRIPT_DIR"/mods/*.jar &>/dev/null; then
        cp "$SCRIPT_DIR"/mods/*.jar "$MC_DIR/mods/"
        echo "    custom JARs... OK"
    fi

    # Copy mod index
    if [ -d "$SCRIPT_DIR/mods/.index" ]; then
        mkdir -p "$MC_DIR/mods/.index"
        cp -r "$SCRIPT_DIR/mods/.index/"* "$MC_DIR/mods/.index/"
        echo "    mod index... OK"
    fi
else
    echo "  No local distribution — downloading from GitHub..."
    ZIPFILE="/tmp/IridescentCraft-main.zip"
    EXTRACTDIR="/tmp/IridescentCraft-extract"

    curl -sL "https://github.com/silvariasereneblossom/IridescentCraft/archive/refs/heads/main.zip" -o "$ZIPFILE"
    rm -rf "$EXTRACTDIR"
    unzip -qo "$ZIPFILE" -d "$EXTRACTDIR"

    SRC="$(find "$EXTRACTDIR" -maxdepth 1 -type d | tail -1)/minecraft/distribution/client"

    [ -d "$SRC/config" ] && cp -r "$SRC/config" "$MC_DIR/"
    [ -d "$SRC/defaultconfigs" ] && cp -r "$SRC/defaultconfigs" "$MC_DIR/"
    [ -d "$SRC/kubejs" ] && cp -r "$SRC/kubejs" "$MC_DIR/"
    [ -d "$SRC/global_packs" ] && cp -r "$SRC/global_packs" "$MC_DIR/"
    if [ -d "$SRC/mods/.index" ]; then
        mkdir -p "$MC_DIR/mods/.index"
        cp -r "$SRC/mods/.index/"* "$MC_DIR/mods/.index/"
    fi
    ls "$SRC"/mods/*.jar &>/dev/null && cp "$SRC"/mods/*.jar "$MC_DIR/mods/"

    rm -f "$ZIPFILE"
    rm -rf "$EXTRACTDIR"
    echo "  Done."
fi

# Write instance metadata
echo "  Writing instance metadata..."

cat > "$INSTANCE_DIR/instance.cfg" << 'INSTCFG'
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

cat > "$INSTANCE_DIR/mmc-pack.json" << 'MMCPACK'
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

# Ensure instgroups.json exists
if [ ! -f "$INSTANCES_DIR/instgroups.json" ]; then
    echo '{"formatVersion":1,"groups":{}}' > "$INSTANCES_DIR/instgroups.json"
fi

echo ""
echo -e "  ${GREEN}[OK]${RESET} Instance ready."
echo ""

# -------------------------------------------------------------------
# Phase 3: Download mods from .pw.toml metadata
# -------------------------------------------------------------------
INDEX_DIR="$MC_DIR/mods/.index"
MODS_DIR="$MC_DIR/mods"

if [ ! -d "$INDEX_DIR" ]; then
    echo -e "  ${YELLOW}[WARN]${RESET} No mod index found. Mods must be downloaded manually."
    echo ""
else
    # Quick check: if 400+ jars already present, skip download
    JAR_COUNT=$(ls "$MODS_DIR"/*.jar 2>/dev/null | wc -l)
    if [ "$JAR_COUNT" -ge 400 ]; then
        echo -e "  [MODS] ${GREEN}$JAR_COUNT mods already present. Skipping download.${RESET}"
        echo "  To force re-download, delete mods folder and re-run."
        echo ""
    else

    echo "  [MODS] Found $JAR_COUNT mods, checking for missing..."
    echo ""

    TOTAL=$(ls "$INDEX_DIR"/*.pw.toml 2>/dev/null | wc -l)
    echo "  Found $TOTAL mod metadata files."
    echo ""

    DOWNLOADED=0
    SKIPPED=0
    FAILED=0
    COUNT=0

    for toml in "$INDEX_DIR"/*.pw.toml; do
        [ -f "$toml" ] || continue
        COUNT=$((COUNT + 1))

        FILENAME=""
        SIDE="both"
        MODE=""
        URL=""
        PROJECT_ID=""
        FILE_ID=""

        while IFS= read -r line; do
            line="$(echo "$line" | sed 's/^[[:space:]]*//')"
            case "$line" in
                filename\ =\ *)
                    FILENAME="$(echo "$line" | sed "s/^filename[[:space:]]*=[[:space:]]*['\"]//;s/['\"]$//")"
                    ;;
                side\ =\ *)
                    SIDE="$(echo "$line" | sed "s/^side[[:space:]]*=[[:space:]]*['\"]//;s/['\"]$//")"
                    ;;
                mode\ =\ *)
                    MODE="$(echo "$line" | sed "s/^mode[[:space:]]*=[[:space:]]*['\"]//;s/['\"]$//")"
                    ;;
                url\ =\ *)
                    URL="$(echo "$line" | sed "s/^url[[:space:]]*=[[:space:]]*['\"]//;s/['\"]$//")"
                    ;;
                project-id\ =\ *)
                    PROJECT_ID="$(echo "$line" | sed 's/^project-id[[:space:]]*=[[:space:]]*//')"
                    ;;
                file-id\ =\ *)
                    FILE_ID="$(echo "$line" | sed 's/^file-id[[:space:]]*=[[:space:]]*//')"
                    ;;
            esac
        done < "$toml"

        [ -z "$FILENAME" ] && continue
        [ "$SIDE" = "server" ] && { SKIPPED=$((SKIPPED + 1)); continue; }

        MOD_PATH="$MODS_DIR/$FILENAME"
        [ -f "$MOD_PATH" ] && { SKIPPED=$((SKIPPED + 1)); continue; }

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

        if [ -z "$DL_URL" ]; then
            FAILED=$((FAILED + 1))
            continue
        fi

        PCT=$(( (COUNT * 100) / TOTAL ))
        printf "  [%3d%%] %s" "$PCT" "$FILENAME"

        TMPFILE="$MODS_DIR/_dl_$COUNT.tmp"
        if curl -sL "$DL_URL" -o "$TMPFILE" --max-redirs 10 && \
           [ -f "$TMPFILE" ] && [ "$(stat -c%s "$TMPFILE" 2>/dev/null || stat -f%z "$TMPFILE" 2>/dev/null)" -gt 1000 ]; then
            mv "$TMPFILE" "$MOD_PATH"
            echo -e " ${GREEN}OK${RESET}"
            DOWNLOADED=$((DOWNLOADED + 1))
        else
            rm -f "$TMPFILE"
            echo -e " ${RED}FAILED${RESET}"
            FAILED=$((FAILED + 1))
        fi
    done

    echo ""
    echo -e "  ${GREEN}Downloaded: $DOWNLOADED${RESET}"
    echo -e "  ${CYAN}Already present: $SKIPPED${RESET}"
    [ "$FAILED" -gt 0 ] && echo -e "  ${RED}Failed: $FAILED (re-run to retry)${RESET}"

    fi  # end of JAR_COUNT < 400 check
fi

echo ""
echo "  Mod sync complete."
echo ""

# -------------------------------------------------------------------
# Phase 4: Launch PrismLauncher
# -------------------------------------------------------------------
echo "  [LAUNCH] Starting PrismLauncher..."
echo ""
echo "  NOTE: If this is your first time:"
echo "    1. Add your account (Accounts section in Settings)"
echo "       - Microsoft, Ely.by, or offline accounts supported"
echo "    2. Select 'IridescentCraft' from the instance list"
echo "    3. Click 'Launch'"
echo "    4. First launch takes 5-15 minutes (Forge downloads + 420 mods load)"
echo ""

$PRISM_EXE &

echo "  PrismLauncher launched. You can close this terminal."
echo ""
