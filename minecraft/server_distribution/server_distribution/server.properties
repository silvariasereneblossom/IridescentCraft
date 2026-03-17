#!/usr/bin/env bash
# IridescentCraft Server Installation Script
# Automates Forge 1.20.1-47.4.0 server setup
#
# This script should be run from inside the server_distribution/ directory.
# It will set up the server in the CURRENT directory.
#
# Usage:
#   cd server_distribution/
#   chmod +x server_install.sh
#   ./server_install.sh
#
# After running, use ./start.sh (Linux) or start.bat (Windows) to launch.

set -e

FORGE_VERSION="1.20.1-47.4.0"
FORGE_INSTALLER="forge-${FORGE_VERSION}-installer.jar"
FORGE_INSTALLER_URL="https://maven.minecraftforge.net/net/minecraftforge/forge/${FORGE_VERSION}/forge-${FORGE_VERSION}-installer.jar"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PACK_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "=========================================="
echo "  IridescentCraft Server Installer"
echo "  Forge ${FORGE_VERSION}"
echo "=========================================="
echo ""

# -------------------------------------------------------------------
# Step 0: Check Java 17
# -------------------------------------------------------------------
echo "[1/5] Checking Java installation..."
if ! command -v java &> /dev/null; then
    echo "ERROR: Java not found. Please install Java 17 (Adoptium/Temurin recommended)."
    echo "  Download: https://adoptium.net/"
    exit 1
fi

JAVA_VER=$(java -version 2>&1 | head -1 | cut -d'"' -f2 | cut -d'.' -f1)
if [ "$JAVA_VER" != "17" ]; then
    echo "WARNING: Java $JAVA_VER detected. Java 17 is required."
    read -p "Continue anyway? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
else
    echo "  Java 17 found."
fi

# -------------------------------------------------------------------
# Step 1: Download and run Forge installer
# -------------------------------------------------------------------
echo ""
echo "[2/5] Setting up Forge server..."

if [ -d "libraries/net/minecraftforge/forge/${FORGE_VERSION}" ]; then
    echo "  Forge libraries already present, skipping installation."
else
    # Check if the installer exists in the pack directory
    if [ -f "$PACK_DIR/${FORGE_INSTALLER}" ]; then
        echo "  Found Forge installer in modpack directory."
        cp "$PACK_DIR/${FORGE_INSTALLER}" "./${FORGE_INSTALLER}"
    elif [ -f "./${FORGE_INSTALLER}" ]; then
        echo "  Found Forge installer in current directory."
    else
        echo "  Downloading Forge installer..."
        if command -v curl &> /dev/null; then
            curl -L -o "./${FORGE_INSTALLER}" "$FORGE_INSTALLER_URL"
        elif command -v wget &> /dev/null; then
            wget -O "./${FORGE_INSTALLER}" "$FORGE_INSTALLER_URL"
        else
            echo "ERROR: Neither curl nor wget found. Please download manually:"
            echo "  $FORGE_INSTALLER_URL"
            echo "Place it in this directory and re-run the script."
            exit 1
        fi
    fi

    echo "  Running Forge installer (--installServer)..."
    java -jar "./${FORGE_INSTALLER}" --installServer
    echo "  Forge installed successfully."
fi

# -------------------------------------------------------------------
# Step 2: Copy/symlink mods (excluding client-only mods)
# -------------------------------------------------------------------
echo ""
echo "[3/5] Setting up mods..."

# Determine the modpack's mods source directory
# If we're inside the repo, use the relative path. Otherwise ask.
MODS_SOURCE=""
if [ -d "$PACK_DIR/mods" ]; then
    MODS_SOURCE="$PACK_DIR/mods"
    echo "  Found modpack mods directory: $MODS_SOURCE"
else
    echo "  Could not find the modpack mods directory."
    echo "  Please enter the full path to your IridescentCraft/minecraft/ directory"
    echo "  (the one containing the mods/, config/, kubejs/ folders):"
    read -r MODS_SOURCE
    MODS_SOURCE="${MODS_SOURCE}/mods"
    PACK_DIR="$(dirname "$MODS_SOURCE")"
fi

# Build client-only exclusion list dynamically from .index metadata
# This survives mod updates since it reads the actual metadata, not hardcoded filenames
declare -A EXCLUDE_MODS
INDEX_DIR="$MODS_SOURCE/.index"
if [ -d "$INDEX_DIR" ]; then
    while IFS= read -r toml_file; do
        if grep -q "side = 'client'" "$toml_file" 2>/dev/null; then
            fname=$(grep "^filename" "$toml_file" | cut -d"'" -f2)
            [ -n "$fname" ] && EXCLUDE_MODS["$fname"]=1
        fi
    done < <(find "$INDEX_DIR" -name "*.pw.toml" 2>/dev/null)
    # Always exclude rendering mods that are marked 'both' but crash/waste resources on servers
    EXCLUDE_MODS["embeddium-0.3.31+mc1.20.1.jar"]=1
    for emb in "$MODS_SOURCE"/embeddium-*.jar; do
        [ -f "$emb" ] && EXCLUDE_MODS["$(basename "$emb")"]=1
    done
    echo "  Auto-detected ${#EXCLUDE_MODS[@]} client-only mods to exclude."
else
    # Fallback to static list if no .index directory
    CLIENT_ONLY_FILE="$SCRIPT_DIR/client_only_mods.txt"
    if [ -f "$CLIENT_ONLY_FILE" ]; then
        while IFS= read -r line; do
            [[ "$line" =~ ^#.*$ || -z "$line" ]] && continue
            EXCLUDE_MODS["$line"]=1
        done < "$CLIENT_ONLY_FILE"
        echo "  Loaded ${#EXCLUDE_MODS[@]} client-only mods from static list (no .index found)."
    else
        echo "  WARNING: No .index/ metadata and no client_only_mods.txt. All mods will be copied."
    fi
fi

mkdir -p mods

# Copy mod jars, excluding client-only
COPIED=0
SKIPPED=0
for jar in "$MODS_SOURCE"/*.jar; do
    [ -f "$jar" ] || continue
    BASENAME="$(basename "$jar")"
    if [ "${EXCLUDE_MODS[$BASENAME]+_}" ]; then
        SKIPPED=$((SKIPPED + 1))
    else
        cp "$jar" "mods/$BASENAME"
        COPIED=$((COPIED + 1))
    fi
done

# Also copy from subdirectories if the launcher stores downloaded mods elsewhere
# PrismLauncher stores all mods flat in the mods/ dir once downloaded
echo "  Copied $COPIED mods, skipped $SKIPPED client-only mods."

# Copy disabled mods too (but not client-only disabled ones)
for jar in "$MODS_SOURCE"/*.jar.disabled; do
    [ -f "$jar" ] || continue
    BASENAME="$(basename "$jar")"
    cp "$jar" "mods/$BASENAME"
done

# -------------------------------------------------------------------
# Step 3: Copy config, kubejs, defaultconfigs, global_packs
# -------------------------------------------------------------------
echo ""
echo "[4/5] Copying configuration files..."

for DIR_NAME in config kubejs defaultconfigs global_packs; do
    if [ -d "$PACK_DIR/$DIR_NAME" ]; then
        echo "  Copying $DIR_NAME/..."
        # Use rsync if available for better performance, otherwise cp
        if command -v rsync &> /dev/null; then
            rsync -a --delete "$PACK_DIR/$DIR_NAME/" "./$DIR_NAME/"
        else
            rm -rf "./$DIR_NAME"
            cp -r "$PACK_DIR/$DIR_NAME" "./$DIR_NAME"
        fi
    else
        echo "  WARNING: $PACK_DIR/$DIR_NAME not found, skipping."
    fi
done

# Remove client-side config files that are not needed on server
rm -rf ./config/oculus 2>/dev/null
rm -rf ./config/embeddium* 2>/dev/null
rm -f ./config/immediatelyfast.json 2>/dev/null
rm -rf ./journeymap 2>/dev/null

# -------------------------------------------------------------------
# Step 4: Final setup
# -------------------------------------------------------------------
echo ""
echo "[5/5] Final setup..."

# Ensure eula.txt and server.properties are in place
if [ -f "$SCRIPT_DIR/eula.txt" ] && [ "$SCRIPT_DIR" != "$(pwd)" ]; then
    cp "$SCRIPT_DIR/eula.txt" ./eula.txt
fi
if [ -f "$SCRIPT_DIR/server.properties" ] && [ "$SCRIPT_DIR" != "$(pwd)" ]; then
    cp "$SCRIPT_DIR/server.properties" ./server.properties
fi

# Make start scripts executable
chmod +x start.sh 2>/dev/null || true

echo ""
echo "=========================================="
echo "  Installation complete!"
echo "=========================================="
echo ""
echo "To start the server:"
echo "  Linux:   ./start.sh"
echo "  Windows: start.bat"
echo ""
echo "The server will listen on port 25565 by default."
echo "Edit server.properties to change settings."
echo ""
echo "IMPORTANT: First startup will take 5-15 minutes with 420+ mods."
echo "Wait until you see 'Done' in the console before connecting."
echo ""
