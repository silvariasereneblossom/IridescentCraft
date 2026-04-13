#!/usr/bin/env bash
# =============================================================================
# Build iridescent_codex_data.jar from source
# =============================================================================
# Mirrors data/ categories+entries into assets/ (Patchouli 1.20+ reads content
# from assets/ when use_resource_pack is true in book.json), then packs
# everything into the JAR and deploys to all three distributions.
#
# Run from any directory — paths are relative to this script's location.
# =============================================================================

set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
MC="$REPO_ROOT/.minecraft"

cd "$SCRIPT_DIR"

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

JAR="$SCRIPT_DIR/iridescent_codex_data.jar"
echo "[Codex Build] Packing JAR ..."
jar cf "$JAR" -C . .
echo "[Codex Build] Built: $JAR ($(du -h "$JAR" | cut -f1))"

echo "[Codex Build] Deploying to all distributions ..."
cp -f "$JAR" "$MC/mods/iridescent_codex_data.jar"
cp -f "$JAR" "$MC/server_distribution/mods/iridescent_codex_data.jar"
cp -f "$JAR" "$MC/distribution/client/mods/iridescent_codex_data.jar"

rm -f "$JAR"
echo "[Codex Build] Done."
