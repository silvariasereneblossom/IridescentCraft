#!/usr/bin/env bash
# IridescentCraft Server Installation Script (Linux/macOS)
# STANDALONE — works without the rest of the modpack repo.
#
# This script:
#   1. Checks for Java 17
#   2. Runs the included Forge installer
#   3. Downloads all server-side mods from .pw.toml metadata
#   4. Everything else (config, kubejs, defaultconfigs, global_packs) is already included
#
# Usage:
#   cd server_distribution/
#   chmod +x server_install.sh
#   ./server_install.sh
#
# After running, use ./start.sh to launch the server.

set -e

FORGE_VERSION="1.20.1-47.4.6"
FORGE_INSTALLER="forge-${FORGE_VERSION}-installer.jar"
FORGE_INSTALLER_URL="https://maven.minecraftforge.net/net/minecraftforge/forge/${FORGE_VERSION}/forge-${FORGE_VERSION}-installer.jar"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

TF_BLUE='\033[38;2;91;206;250m'
TF_PINK='\033[38;2;245;169;184m'
TF_WHITE='\033[38;2;255;255;255m'
RESET='\033[0m'

echo ""
echo -e "${TF_BLUE}  ==========================================${RESET}"
echo -e "${TF_PINK}  IridescentCraft Server Installer${RESET}"
echo -e "${TF_WHITE}  Forge ${FORGE_VERSION}  ~450 mods${RESET}"
echo -e "${TF_PINK}  Iridescent Edition${RESET}"
echo -e "${TF_BLUE}  ==========================================${RESET}"
echo ""

# -------------------------------------------------------------------
# Step 1: Check Java 17
# -------------------------------------------------------------------
echo "[1/4] Checking Java installation..."
if ! command -v java &> /dev/null; then
    echo "ERROR: Java not found. Please install Java 17 (Adoptium/Temurin recommended)."
    echo "  Download: https://adoptium.net/"
    exit 1
fi

JAVA_VER=$(java -version 2>&1 | head -1 | cut -d'"' -f2 | cut -d'.' -f1)
if [ "$JAVA_VER" != "17" ]; then
    echo "WARNING: Java $JAVA_VER detected. Java 17 is required for Forge 1.20.1."
    read -p "Continue anyway? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
else
    echo "  Java 17 found."
fi

# -------------------------------------------------------------------
# Step 2: Install Forge
# -------------------------------------------------------------------
echo ""
echo "[2/4] Setting up Forge server..."

if [ -d "libraries/net/minecraftforge/forge/${FORGE_VERSION}" ]; then
    echo "  Forge libraries already present, skipping installation."
else
    if [ -f "./${FORGE_INSTALLER}" ]; then
        echo "  Found Forge installer."
    else
        echo "  Downloading Forge installer..."
        if command -v curl &> /dev/null; then
            curl -L -o "./${FORGE_INSTALLER}" "$FORGE_INSTALLER_URL"
        elif command -v wget &> /dev/null; then
            wget -O "./${FORGE_INSTALLER}" "$FORGE_INSTALLER_URL"
        else
            echo "ERROR: Neither curl nor wget found. Please install one."
            exit 1
        fi
    fi

    echo "  Running Forge installer (--installServer)..."
    java -jar "./${FORGE_INSTALLER}" --installServer
    echo "  Forge installed successfully."
fi

# -------------------------------------------------------------------
# Step 3: Download mods from .pw.toml metadata
# -------------------------------------------------------------------
echo ""
echo "[3/4] Downloading mods..."

INDEX_DIR="mods/.index"
mkdir -p mods

if [ ! -d "$INDEX_DIR" ]; then
    echo "ERROR: mods/.index/ directory not found."
    echo "This folder should contain .pw.toml metadata files."
    exit 1
fi

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

# The pack's client-only jars, by exact name. They are not in this index at all; the
# list is a second line in case a client index is copied here.
declare -A FORCE_EXCLUDE
# >>> mod_index.py: sh-exact (GENERATED from mods/.index + dev/mods/mod_index.policy.json. Do not edit: run mod_index.py generate)
FORCE_EXCLUDE["AmbientSounds_FORGE_v6.3.4_mc1.20.1.jar"]=1
FORCE_EXCLUDE["athena-forge-1.20.1-3.1.2.jar"]=1
FORCE_EXCLUDE["auudio_forge_1.0.3_MC_1.19.3.jar"]=1
FORCE_EXCLUDE["BadOptimizations-2.4.1-1.20.1.jar"]=1
FORCE_EXCLUDE["BEB-Forge-1.20.1-6.0.0.jar"]=1
FORCE_EXCLUDE["BetterAdvancements-NeoForge-1.20.1-0.4.2.25.jar"]=1
FORCE_EXCLUDE["BetterAnimationsCollection-v8.0.1-1.20.1-Forge.jar"]=1
FORCE_EXCLUDE["biomemusic-1.20.1-3.5.jar"]=1
FORCE_EXCLUDE["chat_heads-0.15.0-forge-1.20.jar"]=1
FORCE_EXCLUDE["configured-forge-1.20.1-2.2.3.jar"]=1
FORCE_EXCLUDE["Controlling-forge-1.20.1-12.0.2.jar"]=1
FORCE_EXCLUDE["CTM-1.20.1-1.1.10.jar"]=1
FORCE_EXCLUDE["CutThrough-v8.0.2-1.20.1-Forge.jar"]=1
FORCE_EXCLUDE["defaultoptions-forge-1.20.1-18.0.5.jar"]=1
FORCE_EXCLUDE["embeddium-0.3.31+mc1.20.1.jar"]=1
FORCE_EXCLUDE["EnchantmentDescriptions-Forge-1.20.1-17.1.21.jar"]=1
FORCE_EXCLUDE["entity_model_features_1.20.1-forge-3.0.17.jar"]=1
FORCE_EXCLUDE["entity_texture_features_1.20.1-forge-7.0.13.jar"]=1
FORCE_EXCLUDE["entityculling-forge-1.10.0-mc1.20.1.jar"]=1
FORCE_EXCLUDE["fallingleaves-1.20.1-2.1.2.jar"]=1
FORCE_EXCLUDE["Highlighter-1.20.1-forge-1.1.9.jar"]=1
FORCE_EXCLUDE["ImmediatelyFast-Forge-1.5.4+1.20.4.jar"]=1
FORCE_EXCLUDE["inventoryhud.forge.1.20.1-3.4.26.jar"]=1
FORCE_EXCLUDE["jeed-1.20-2.2.5.jar"]=1
FORCE_EXCLUDE["jmi-forge-1.20.1-0.14-48.jar"]=1
FORCE_EXCLUDE["JustEnoughMekanismMultiblocks-1.20.1-4.17.jar"]=1
FORCE_EXCLUDE["kubejsoffline-5.2.0.27.jar"]=1
FORCE_EXCLUDE["lazyDFU-[UNOFFICIAL]-1.20.jar"]=1
FORCE_EXCLUDE["libIPN-forge-1.20-4.0.2.jar"]=1
FORCE_EXCLUDE["light-overlay-8.0.0-forge.jar"]=1
FORCE_EXCLUDE["mek_walkable_cables-1.0.1.jar"]=1
FORCE_EXCLUDE["MouseTweaks-forge-mc1.20.1-2.25.1.jar"]=1
FORCE_EXCLUDE["oculus-mc1.20.1-1.8.0.jar"]=1
FORCE_EXCLUDE["OverflowingBars-v8.0.1-1.20.1-Forge.jar"]=1
FORCE_EXCLUDE["Prism-1.20.1-forge-1.0.5.jar"]=1
FORCE_EXCLUDE["probejs-7.0.0-forge.jar"]=1
FORCE_EXCLUDE["rubidium-extra-0.5.4.4+mc1.20.1-build.131.jar"]=1
FORCE_EXCLUDE["Searchables-forge-1.20.1-1.0.3.jar"]=1
FORCE_EXCLUDE["ToolStats-Forge-1.20.1-16.0.10.jar"]=1
FORCE_EXCLUDE["TravelersTitles-1.20-Forge-4.0.2.jar"]=1
FORCE_EXCLUDE["treasuredistance-1.20-1.2.jar"]=1
# <<< mod_index.py

DOWNLOADED=0
SKIPPED_CLIENT=0
SKIPPED_EXISTS=0
FAILED=0

for toml_file in "$INDEX_DIR"/*.pw.toml; do
    [ -f "$toml_file" ] || continue

    # Parse fields from the TOML file
    filename=$(grep '^filename' "$toml_file" | head -1 | sed "s/^filename = '//;s/'$//")
    side=$(grep '^side' "$toml_file" | head -1 | sed "s/^side = '//;s/'$//")
    mode=$(grep '^mode' "$toml_file" | head -1 | sed "s/^mode = '//;s/'$//")
    url=$(grep '^url' "$toml_file" | head -1 | sed "s/^url = '//;s/'$//")

    # Skip client-only mods (by metadata or force-exclude list)
    if [ "$side" = "client" ] || [ "${FORCE_EXCLUDE[$filename]+_}" ]; then
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
        # Extract CurseForge project-id and file-id
        project_id=$(grep '^project-id' "$toml_file" | head -1 | sed 's/^project-id = //')
        file_id=$(grep '^file-id' "$toml_file" | head -1 | sed 's/^file-id = //')
        if [ -n "$project_id" ] && [ -n "$file_id" ]; then
            DOWNLOAD_URL="https://www.curseforge.com/api/v1/mods/${project_id}/files/${file_id}/download"
        fi
    fi

    if [ -z "$DOWNLOAD_URL" ]; then
        echo "  WARNING: No download URL for $filename ($(basename "$toml_file"))"
        FAILED=$((FAILED + 1))
        continue
    fi

    echo "  Downloading: $filename"
    if [ "$DOWNLOADER" = "curl" ]; then
        if ! curl -L -s -o "mods/$filename" "$DOWNLOAD_URL"; then
            echo "    FAILED to download $filename"
            rm -f "mods/$filename"
            FAILED=$((FAILED + 1))
            continue
        fi
    else
        if ! wget -q -O "mods/$filename" "$DOWNLOAD_URL"; then
            echo "    FAILED to download $filename"
            rm -f "mods/$filename"
            FAILED=$((FAILED + 1))
            continue
        fi
    fi

    # Verify the download is not an HTML error page (basic check)
    if [ -f "mods/$filename" ]; then
        file_size=$(stat -c%s "mods/$filename" 2>/dev/null || stat -f%z "mods/$filename" 2>/dev/null || echo "0")
        if [ "$file_size" -lt 1000 ]; then
            # Likely an error page, not a real jar
            head -c 100 "mods/$filename" 2>/dev/null | grep -qi "html" && {
                echo "    WARNING: Download for $filename returned HTML (possible error). Removing."
                rm -f "mods/$filename"
                FAILED=$((FAILED + 1))
                continue
            }
        fi
    fi

    DOWNLOADED=$((DOWNLOADED + 1))
done

echo ""
echo "  Downloaded: $DOWNLOADED mods"
echo "  Skipped (client-only): $SKIPPED_CLIENT mods"
echo "  Skipped (already present): $SKIPPED_EXISTS mods"
if [ "$FAILED" -gt 0 ]; then
    echo "  Failed: $FAILED mods (check warnings above)"
fi

# -------------------------------------------------------------------
# Step 4: Final setup
# -------------------------------------------------------------------
echo ""
echo "[4/4] Final setup..."

# Make start scripts executable
chmod +x start.sh 2>/dev/null || true

echo ""
echo "=========================================="
echo "  Installation complete!"
echo "=========================================="
echo ""
echo "To start the server:  ./start.sh"
echo ""
echo "The server will listen on port 25565 by default."
echo "Edit server.properties to change settings."
echo ""
echo "IMPORTANT: First startup will take 5-15 minutes with 420+ mods."
echo "Wait until you see 'Done' in the console before connecting."
echo ""
if [ "$FAILED" -gt 0 ]; then
    echo "WARNING: $FAILED mod(s) failed to download. You may need to"
    echo "download them manually. Check the warnings above for details."
    echo ""
fi
