#!/usr/bin/env bash
# =============================================================================
# Build iridescent_codex_data.jar from source
# =============================================================================
# Compiles the minimal @Mod class (javafml entrypoint so Patchouli's
# BookRegistry scanner sees our data/), mirrors data/ -> assets/ (Patchouli
# 1.20+ reads content from assets/ when use_resource_pack is true), then packs
# everything into the JAR and deploys to all three distributions.
#
# Run from any directory — paths are relative to this script's location.
# =============================================================================

set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
MC="$REPO_ROOT/.minecraft"

cd "$SCRIPT_DIR"

echo "[Codex Build] Compiling @Mod entrypoint..."
BUILD_DIR="$SCRIPT_DIR/build_classes"
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR"
# Compile the stub annotation + our Mod class together. Only our class ends
# up in the jar; the stub is just so javac can resolve the annotation.
javac -encoding UTF-8 -d "$BUILD_DIR" -source 17 -target 17 \
    stub/net/minecraftforge/fml/common/Mod.java \
    src/com/iridescentcraft/codex/IridescentCodex.java

if [ ! -f "$BUILD_DIR/com/iridescentcraft/codex/IridescentCodex.class" ]; then
    echo "ERROR: IridescentCodex.class was not produced"
    exit 1
fi

echo "[Codex Build] Mirroring data/ -> assets/ ..."
rm -rf assets/icraft/patchouli_books/iridescent_codex/en_us/categories
rm -rf assets/icraft/patchouli_books/iridescent_codex/en_us/entries
mkdir -p assets/icraft/patchouli_books/iridescent_codex/en_us
cp -rf data/icraft/patchouli_books/iridescent_codex/en_us/categories \
       assets/icraft/patchouli_books/iridescent_codex/en_us/
cp -rf data/icraft/patchouli_books/iridescent_codex/en_us/entries \
       assets/icraft/patchouli_books/iridescent_codex/en_us/

DATA_COUNT=$(find data -type f | wc -l)
ASSET_COUNT=$(find assets -type f | wc -l)
echo "[Codex Build] data/ has $DATA_COUNT files, assets/ has $ASSET_COUNT files"

echo "[Codex Build] Verifying book.json has use_resource_pack: true ..."
if ! grep -q '"use_resource_pack"' data/icraft/patchouli_books/iridescent_codex/book.json; then
    echo "ERROR: book.json is missing use_resource_pack flag!"
    echo "Add '\"use_resource_pack\": true' to book.json before building."
    exit 1
fi

# Stage content + compiled class into a clean pack dir so the jar doesn't
# accidentally include src/, stub/, or build_classes/.
STAGE="$SCRIPT_DIR/build_stage"
rm -rf "$STAGE"
mkdir -p "$STAGE"
cp -r META-INF "$STAGE/"
cp -r assets "$STAGE/"
cp -r data "$STAGE/"
cp pack.mcmeta "$STAGE/"
cp -r "$BUILD_DIR/com" "$STAGE/"

JAR="$SCRIPT_DIR/iridescent_codex_data.jar"
echo "[Codex Build] Packing JAR ..."
jar cf "$JAR" -C "$STAGE" .
echo "[Codex Build] Built: $JAR ($(du -h "$JAR" | cut -f1))"

echo "[Codex Build] Deploying to all distributions ..."
cp -f "$JAR" "$MC/mods/iridescent_codex_data.jar"
cp -f "$JAR" "$MC/server_distribution/mods/iridescent_codex_data.jar"
cp -f "$JAR" "$MC/distribution/client/mods/iridescent_codex_data.jar"

# Cleanup
rm -f "$JAR"
rm -rf "$BUILD_DIR" "$STAGE"
echo "[Codex Build] Done."
