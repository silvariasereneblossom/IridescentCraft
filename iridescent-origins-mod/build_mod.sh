#!/usr/bin/env bash
# Build script for Iridescent Origins Forge mod
# Extracts current data from the datapack JAR, rebuilds as a proper Forge mod,
# and copies the output to the mods directory.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
RESOURCES="$SCRIPT_DIR/src/main/resources"
SOURCE_JAR="$PROJECT_ROOT/minecraft/mods/iridescent_origins-1.0.0.jar"
OUTPUT_JAR="$SCRIPT_DIR/build/libs/iridescent_origins-1.0.0.jar"

# Mods directories (client + server)
CLIENT_MODS="$PROJECT_ROOT/minecraft/mods"
SERVER_MODS="$PROJECT_ROOT/minecraft/server/mods"

echo "=== Iridescent Origins Mod Builder ==="
echo ""

# Step 1: Extract current data from the datapack JAR
echo "[1/4] Extracting data from existing JAR..."
if [ -f "$SOURCE_JAR" ]; then
    # Clean old data
    rm -rf "$RESOURCES/data" "$RESOURCES/pack.mcmeta"
    # Extract fresh data
    (cd "$RESOURCES" && unzip -qo "$SOURCE_JAR" 'data/*' 'pack.mcmeta')
    echo "  Extracted data files from $SOURCE_JAR"
else
    echo "  WARNING: Source JAR not found at $SOURCE_JAR"
    echo "  Using existing data in src/main/resources/"
fi

# Step 2: Build the mod
echo "[2/4] Building Forge mod..."
(cd "$SCRIPT_DIR" && ./gradlew build)
echo "  Build complete."

# Step 3: Verify output
if [ ! -f "$OUTPUT_JAR" ]; then
    echo "ERROR: Build output not found at $OUTPUT_JAR"
    exit 1
fi
echo "[3/4] Output JAR: $OUTPUT_JAR"

# Step 4: Copy to mods directories
echo "[4/4] Deploying to mods directories..."

# Remove old datapack JAR (replaced by the Forge mod)
if [ -f "$CLIENT_MODS/iridescent_origins-1.0.0.jar" ]; then
    rm "$CLIENT_MODS/iridescent_origins-1.0.0.jar"
    echo "  Removed old datapack JAR from client mods"
fi

cp "$OUTPUT_JAR" "$CLIENT_MODS/"
echo "  Copied to $CLIENT_MODS/"

if [ -d "$SERVER_MODS" ]; then
    if [ -f "$SERVER_MODS/iridescent_origins-1.0.0.jar" ]; then
        rm "$SERVER_MODS/iridescent_origins-1.0.0.jar"
    fi
    cp "$OUTPUT_JAR" "$SERVER_MODS/"
    echo "  Copied to $SERVER_MODS/"
fi

echo ""
echo "=== Build complete! ==="
echo "Output: $OUTPUT_JAR"
