#!/usr/bin/env bash
# IridescentCraft Server — Unified Installer + Launcher (Linux/macOS)
# Forge 1.20.1-47.4.6 with 420+ mods
#
# First run:  Installs Forge, downloads mods, then starts the server
# Later runs: Skips install (mods already present), starts the server
#
# Requirements:
#   - Java 17 (e.g., Adoptium/Temurin JDK 17)
#   - 8-12 GB RAM available for the server
#
# Usage:
#   chmod +x iridescentserver.sh
#   ./iridescentserver.sh

FORGE_VERSION="1.20.1-47.4.6"
FORGE_INSTALLER="forge-${FORGE_VERSION}-installer.jar"
FORGE_INSTALLER_URL="https://maven.minecraftforge.net/net/minecraftforge/forge/${FORGE_VERSION}/forge-${FORGE_VERSION}-installer.jar"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# ANSI 24-bit RGB color codes
# Trans flag: #5BCEFA (blue), #F5A9B8 (pink), #FFFFFF (white)
TF_BLUE='\033[38;2;91;206;250m'
TF_PINK='\033[38;2;245;169;184m'
TF_WHITE='\033[38;2;255;255;255m'

RESET='\033[0m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo ""
echo -e "${TF_BLUE}  ==========================================${RESET}"
echo -e "${TF_PINK}  IridescentCraft Server${RESET}"
echo -e "${TF_WHITE}  Forge ${FORGE_VERSION}  ~450 mods${RESET}"
echo -e "${TF_PINK}  Iridescent Edition${RESET}"
echo -e "${TF_BLUE}  ==========================================${RESET}"
echo ""

# -------------------------------------------------------------------
# Phase 0: Download server files from GitHub if not present
# -------------------------------------------------------------------
if [ ! -d "$SCRIPT_DIR/config" ] || [ ! -d "$SCRIPT_DIR/global_packs" ]; then
    echo "[SETUP] Server files not found — downloading from GitHub..."
    echo ""

    DOWNLOADER=""
    if command -v curl &> /dev/null; then DOWNLOADER="curl"
    elif command -v wget &> /dev/null; then DOWNLOADER="wget"
    else echo "ERROR: Neither curl nor wget found."; exit 1; fi

    ZIP_FILE="/tmp/IridescentCraft-server.zip"
    EXTRACT_DIR="/tmp/IridescentCraft-server-extract"

    echo "  Downloading repository..."
    if [ "$DOWNLOADER" = "curl" ]; then
        curl -L -s -o "$ZIP_FILE" "https://github.com/silvariasereneblossom/IridescentCraft/archive/refs/heads/main.zip"
    else
        wget -q -O "$ZIP_FILE" "https://github.com/silvariasereneblossom/IridescentCraft/archive/refs/heads/main.zip"
    fi

    echo "  Extracting server distribution..."
    rm -rf "$EXTRACT_DIR"
    unzip -q "$ZIP_FILE" -d "$EXTRACT_DIR"
    SRC=$(find "$EXTRACT_DIR" -maxdepth 1 -type d | tail -1)/minecraft/server_distribution

    echo "  Copying server files..."
    for item in "$SRC"/*; do
        base=$(basename "$item")
        [ "$base" = "iridescentserver.bat" ] && continue
        [ "$base" = "iridescentserver.sh" ] && continue
        cp -r "$item" "$SCRIPT_DIR/"
    done

    rm -f "$ZIP_FILE"
    rm -rf "$EXTRACT_DIR"

    if [ ! -d "$SCRIPT_DIR/global_packs" ]; then
        echo "ERROR: Failed to download server files."
        exit 1
    fi
    echo -e "  ${GREEN}Done.${NC}"
    echo ""
fi

# -------------------------------------------------------------------
# Phase 1: Check Java
# -------------------------------------------------------------------
if ! command -v java &> /dev/null; then
    echo "ERROR: Java not found. Please install Java 17."
    echo "  Download: https://adoptium.net/"
    exit 1
fi

JAVA_VER=$(java -version 2>&1 | head -1 | cut -d'"' -f2 | cut -d'.' -f1)
if [ "$JAVA_VER" != "17" ]; then
    echo "WARNING: Java $JAVA_VER detected. Java 17 is required for Forge 1.20.1."
    read -p "Continue anyway? (y/N): " -n 1 -r
    echo
    [[ $REPLY =~ ^[Yy]$ ]] || exit 1
fi

# -------------------------------------------------------------------
# Phase 2: Install if needed (Forge + mods)
# -------------------------------------------------------------------
if [ ! -d "libraries/net/minecraftforge/forge/${FORGE_VERSION}" ]; then
    echo "[INSTALL] Forge not found — running first-time setup..."
    echo ""

    if [ ! -f "./${FORGE_INSTALLER}" ]; then
        echo "[INSTALL] Downloading Forge installer..."
        if command -v curl &> /dev/null; then
            curl -L -o "./${FORGE_INSTALLER}" "$FORGE_INSTALLER_URL"
        elif command -v wget &> /dev/null; then
            wget -O "./${FORGE_INSTALLER}" "$FORGE_INSTALLER_URL"
        else
            echo "ERROR: Neither curl nor wget found."
            exit 1
        fi
        [ -f "./${FORGE_INSTALLER}" ] || { echo "ERROR: Failed to download Forge installer."; exit 1; }
        echo "[INSTALL] Forge installer downloaded."
    fi

    java -jar "./${FORGE_INSTALLER}" --installServer
    echo ""
fi

# Download mods if .index exists
INDEX_DIR="mods/.index"
if [ -d "$INDEX_DIR" ]; then
    mkdir -p mods

    # Pick a download tool
    DOWNLOADER=""
    if command -v curl &> /dev/null; then
        DOWNLOADER="curl"
    elif command -v wget &> /dev/null; then
        DOWNLOADER="wget"
    else
        echo "ERROR: Neither curl nor wget found. Cannot download mods."
        exit 1
    fi

    # Client-only and server-incompatible mods to skip
    FORCE_SKIP=(
        "embeddium"
        "oculus"
        "immediatelyfast"
        "rubidium-extra"
        "kubejsoffline"
        "light-overlay"
        "equipment-compare"
        "EquipmentCompare"
        "chat_heads"
        "BetterAnimations"
        "transmog"
        "probejs"
        "ProbeJS"
        "irons_spells_js"
        "gh_classes"
        "rechiseled"
        "supermartijn642"
        "connectedglass"
        "trashcans"
    )

    DOWNLOADED=0
    SKIPPED_CLIENT=0
    SKIPPED_EXISTS=0
    FAILED=0
    TOTAL_FILES=$(ls -1 "$INDEX_DIR"/*.pw.toml 2>/dev/null | wc -l)

    # Trans flag installer banner
    echo ""
    echo -e "${TF_BLUE}  ==========================================${NC}"
    echo -e "${TF_PINK}  IridescentCraft Server Installer${NC}"
    echo -e "${TF_WHITE}  Forge ${FORGE_VERSION}${NC}"
    echo -e "${TF_PINK}  Standalone Edition${NC}"
    echo -e "${TF_BLUE}  ==========================================${NC}"
    echo ""
    echo "  Found $TOTAL_FILES mod metadata files."

    for toml_file in "$INDEX_DIR"/*.pw.toml; do
        [ -f "$toml_file" ] || continue

        # Parse TOML — handle both single and double quoted values
        filename=$(grep '^filename' "$toml_file" | head -1 | sed "s/^filename = ['\"]//;s/['\"]$//")
        side=$(grep '^side' "$toml_file" | head -1 | sed "s/^side = ['\"]//;s/['\"]$//")
        mode=$(grep '^mode' "$toml_file" | head -1 | sed "s/^mode = ['\"]//;s/['\"]$//")
        url=$(grep '^url' "$toml_file" | head -1 | sed "s/^url = ['\"]//;s/['\"]$//")

        [ -z "$filename" ] && continue

        # Skip client-only mods
        if [ "$side" = "client" ]; then
            SKIPPED_CLIENT=$((SKIPPED_CLIENT + 1))
            continue
        fi

        # Skip force-excluded mods
        skip=false
        for pattern in "${FORCE_SKIP[@]}"; do
            if [[ "$filename" == *"$pattern"* ]]; then
                skip=true
                break
            fi
        done
        if $skip; then
            SKIPPED_CLIENT=$((SKIPPED_CLIENT + 1))
            continue
        fi

        # Skip if already downloaded
        if [ -f "mods/$filename" ]; then
            SKIPPED_EXISTS=$((SKIPPED_EXISTS + 1))
            continue
        fi

        # Determine download URL
        DOWNLOAD_URL=""
        if [ "$mode" = "url" ] && [ -n "$url" ]; then
            DOWNLOAD_URL="$url"
        elif [ "$mode" = "metadata:curseforge" ]; then
            project_id=$(grep '^project-id' "$toml_file" | head -1 | sed 's/^project-id = //')
            file_id=$(grep '^file-id' "$toml_file" | head -1 | sed 's/^file-id = //')
            if [ -n "$project_id" ] && [ -n "$file_id" ]; then
                DOWNLOAD_URL="https://www.curseforge.com/api/v1/mods/${project_id}/files/${file_id}/download"
            fi
        fi

        if [ -z "$DOWNLOAD_URL" ]; then
            echo "  WARNING: No URL for $filename"
            FAILED=$((FAILED + 1))
            continue
        fi

        echo -n "  Downloading: $filename"
        dl_success=false
        if [ "$DOWNLOADER" = "curl" ]; then
            curl -L -s -o "mods/$filename" "$DOWNLOAD_URL" && dl_success=true
        else
            wget -q -O "mods/$filename" "$DOWNLOAD_URL" && dl_success=true
        fi

        if $dl_success && [ -f "mods/$filename" ]; then
            file_size=$(stat -c%s "mods/$filename" 2>/dev/null || stat -f%z "mods/$filename" 2>/dev/null || echo "0")
            if [ "$file_size" -lt 1000 ]; then
                echo -e " ${RED}FAILED (bad response)${NC}"
                rm -f "mods/$filename"
                FAILED=$((FAILED + 1))
            else
                echo -e " ${GREEN}OK${NC}"
                DOWNLOADED=$((DOWNLOADED + 1))
            fi
        else
            echo -e " ${RED}FAILED${NC}"
            rm -f "mods/$filename"
            FAILED=$((FAILED + 1))
        fi
    done

    echo ""
    echo -e "  ${GREEN}Downloaded: $DOWNLOADED mods${NC}"
    echo -e "  ${CYAN}Skipped (client-only): $SKIPPED_CLIENT${NC}"
    echo -e "  ${CYAN}Skipped (already present): $SKIPPED_EXISTS${NC}"
    [ "$FAILED" -gt 0 ] && echo -e "  ${RED}Failed: $FAILED mods${NC}"
    echo ""

    echo "Mod download complete. Press Enter to continue to server launch..."
    read -r
    echo ""
fi

# Strip client-only / crash-causing mods
strip_mod() {
    for pattern in "$@"; do
        for f in mods/$pattern; do
            [ -f "$f" ] && echo "  Stripping: $(basename "$f")" && rm -f "$f"
        done
    done
}

if [ -d "mods" ]; then
    strip_mod "*embeddium*"
    strip_mod "*oculus*"
    strip_mod "*immediatelyfast*" "*ImmediatelyFast*"
    strip_mod "*rubidium-extra*"
    strip_mod "*kubejsoffline*"
    strip_mod "*light-overlay*"
    strip_mod "*equipment-compare*" "*EquipmentCompare*"
    strip_mod "*chat_heads*"
    strip_mod "*BetterAnimations*"
    strip_mod "*transmog*"
    strip_mod "*probejs*" "*ProbeJS*"
    strip_mod "*irons_spells_js*"
    strip_mod "*gh_classes*"
    strip_mod "*cherryvillage*" "*CherryVillage*"
    strip_mod "*rechiseled*"
    strip_mod "*supermartijn642*"
    strip_mod "*connectedglass*"
    strip_mod "*trashcans*"
    strip_mod "*auudio*"
    strip_mod "*BetterAdvancements*"
    strip_mod "*biomemusic*"
    strip_mod "*CTM-*"
    strip_mod "*CutThrough*"
    strip_mod "*fallingleaves*"
    strip_mod "*Highlighter*"
    strip_mod "*inventoryhud*"
    strip_mod "*jeed-*"
    strip_mod "*jmi-forge*"
    strip_mod "*lazyDFU*"
    strip_mod "*libIPN*"
    strip_mod "*MouseTweaks*"
    strip_mod "*Prism-*"
fi

# -------------------------------------------------------------------
# Phase 3: Accept EULA
# -------------------------------------------------------------------
if [ ! -f "eula.txt" ] || ! grep -q "eula=true" eula.txt 2>/dev/null; then
    echo "eula=true" > eula.txt
    echo "[SETUP] EULA accepted."
fi

# -------------------------------------------------------------------
# Phase 4: Launch server
# -------------------------------------------------------------------
echo ""
echo -e "${TF_BLUE}  ==========================================${NC}"
echo -e "${TF_PINK}  Welcome to IridescentCraft!${NC}"
echo -e "${TF_WHITE}  Starting server (8-10 GB RAM)${NC}"
echo -e "${TF_PINK}  First startup may take 5-15 minutes${NC}"
echo -e "${TF_BLUE}  ==========================================${NC}"
echo ""

java \
    -Xmx10G \
    -Xms8G \
    -XX:+UseG1GC \
    -XX:+ParallelRefProcEnabled \
    -XX:MaxGCPauseMillis=200 \
    -XX:+UnlockExperimentalVMOptions \
    -XX:+DisableExplicitGC \
    -XX:+AlwaysPreTouch \
    -XX:G1NewSizePercent=30 \
    -XX:G1MaxNewSizePercent=40 \
    -XX:G1HeapRegionSize=8M \
    -XX:G1ReservePercent=20 \
    -XX:G1HeapWastePercent=5 \
    -XX:G1MixedGCCountTarget=4 \
    -XX:InitiatingHeapOccupancyPercent=15 \
    -XX:G1MixedGCLiveThresholdPercent=90 \
    -XX:G1RSetUpdatingPauseTimePercent=5 \
    -XX:SurvivorRatio=32 \
    -XX:+PerfDisableSharedMem \
    -XX:MaxTenuringThreshold=1 \
    -Dusing.aikars.flags=https://mcflags.emc.gs \
    -Daikars.new.flags=true \
    -XX:+HeapDumpOnOutOfMemoryError \
    -XX:HeapDumpPath=crash-heapdump.hprof \
    @libraries/net/minecraftforge/forge/1.20.1-47.4.6/unix_args.txt nogui "$@"

# -------------------------------------------------------------------
# Phase 5: Post-exit crash log
# -------------------------------------------------------------------
EXIT_CODE=$?

if [ $EXIT_CODE -ne 0 ]; then
    echo ""
    echo "=========================================="
    echo "  SERVER CRASHED — Exit code: $EXIT_CODE"
    echo "=========================================="
    echo ""

    CRASHLOG="crash-$(date +%Y-%m-%d_%H-%M-%S).log"

    echo "IridescentCraft Server Crash Log" > "$CRASHLOG"
    echo "================================" >> "$CRASHLOG"
    echo "Date: $(date)" >> "$CRASHLOG"
    echo "Exit Code: $EXIT_CODE" >> "$CRASHLOG"
    echo "" >> "$CRASHLOG"

    # Append latest Forge crash report if one exists
    LATEST_CRASH=$(ls -t crash-reports/crash-*.txt 2>/dev/null | head -1)
    if [ -n "$LATEST_CRASH" ]; then
        echo "--- Forge Crash Report: $(basename "$LATEST_CRASH") ---" >> "$CRASHLOG"
        cat "$LATEST_CRASH" >> "$CRASHLOG"
    fi

    echo "" >> "$CRASHLOG"
    echo "--- Last 200 lines of server log ---" >> "$CRASHLOG"
    if [ -f "logs/latest.log" ]; then
        tail -200 "logs/latest.log" >> "$CRASHLOG"
    fi

    echo "Crash log saved: $CRASHLOG"
    echo ""
else
    echo ""
    echo "Server stopped normally."
fi

# Copy defaultconfigs to world serverconfig if missing (Champions etc.)
if [ -d "world" ]; then
    mkdir -p "world/serverconfig"
    for cfg in champions-ranks.toml champions-entities.toml champions-affixes.toml; do
        if [ ! -f "world/serverconfig/$cfg" ] && [ -f "defaultconfigs/$cfg" ]; then
            cp "defaultconfigs/$cfg" "world/serverconfig/"
            echo "[SETUP] Copied $cfg to world serverconfig"
        fi
    done
fi
