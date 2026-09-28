#!/usr/bin/env bash
# =============================================================================
# Build iridescent_codex_data.jar from source
# =============================================================================
# Compiles the minimal @Mod class (javafml entrypoint so Patchouli's
# BookRegistry scanner sees our data/), mirrors data/ -> assets/ (Patchouli
# 1.20.1-85 reads book CONTENT only from assets/ -- book.json stays in data/),
# packs everything into the JAR, validates the packed JAR with
# validate_codex.py (every entry/category/link/keybind must resolve the way
# Patchouli loads it), and only then deploys to all three distributions.
#
# Run from any directory — paths are relative to this script's location.
# After a content change, finish the release via the custom-jar-release skill
# (regen_custom_jars_manifest.ps1 -> commit jars + manifests + markers).
# =============================================================================

set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
MC="$REPO_ROOT/.minecraft"
BUILD_DIR="$SCRIPT_DIR/build_classes"
STAGE="$SCRIPT_DIR/build_stage"
JAR="$SCRIPT_DIR/iridescent_codex_data.jar"

for cmd in javac jar python3; do
    if ! command -v "$cmd" >/dev/null 2>&1; then
        echo "ERROR: '$cmd' not found. WSL: sudo apt install -y openjdk-17-jdk python3"
        exit 1
    fi
done

# Temp dirs + the undeployed jar go away on ANY exit, including a failed
# validation, so nothing half-built lingers in the source tree.
cleanup() {
    rm -rf "$BUILD_DIR" "$STAGE"
    rm -f "$JAR"
}
trap cleanup EXIT

cd "$SCRIPT_DIR"

echo "[Codex Build] Compiling @Mod entrypoint..."
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
# assets/ is a generated, git-ignored mirror: rebuild it whole every time so a
# file left over from an older build can never ride along into the jar. Every
# language folder is mirrored (en_us/{categories,entries,templates}, ...).
BOOK_DATA="data/icraft/patchouli_books/iridescent_codex"
BOOK_ASSETS="assets/icraft/patchouli_books/iridescent_codex"
rm -rf assets
mkdir -p "$BOOK_ASSETS"
for lang_dir in "$BOOK_DATA"/*/; do
    cp -r "$lang_dir" "$BOOK_ASSETS/"
done

DATA_COUNT=$(find data -type f | wc -l)
ASSET_COUNT=$(find assets -type f | wc -l)
echo "[Codex Build] data/ has $DATA_COUNT files, assets/ has $ASSET_COUNT files"

echo "[Codex Build] Verifying book.json has use_resource_pack: true ..."
if ! grep -q '"use_resource_pack"' "$BOOK_DATA/book.json"; then
    echo "ERROR: book.json is missing use_resource_pack flag!"
    echo "Add '\"use_resource_pack\": true' to book.json before building."
    exit 1
fi

# Stage content + compiled class into a clean pack dir so the jar doesn't
# accidentally include src/, stub/, or build_classes/.
rm -rf "$STAGE"
mkdir -p "$STAGE"
cp -r META-INF "$STAGE/"
cp -r assets "$STAGE/"
cp -r data "$STAGE/"
cp pack.mcmeta "$STAGE/"
cp -r "$BUILD_DIR/com" "$STAGE/"

echo "[Codex Build] Packing JAR ..."
jar cf "$JAR" -C "$STAGE" .
echo "[Codex Build] Built: $JAR ($(du -h "$JAR" | cut -f1))"

echo "[Codex Build] Validating the packed JAR (Patchouli 1.20.1-85 load rules) ..."
if ! python3 "$SCRIPT_DIR/validate_codex.py" "$JAR" --repo "$REPO_ROOT"; then
    echo "ERROR: Codex validation failed -- NOT deploying. Fix the errors above in data/ and rebuild."
    exit 1
fi

echo "[Codex Build] Deploying to all distributions ..."
cp -f "$JAR" "$MC/mods/iridescent_codex_data.jar"
cp -f "$JAR" "$MC/server_distribution/mods/iridescent_codex_data.jar"
cp -f "$JAR" "$MC/distribution/client/mods/iridescent_codex_data.jar"

NEW_SHA=$(sha256sum "$MC/mods/iridescent_codex_data.jar" | cut -d' ' -f1)
if ! grep -q "$NEW_SHA" "$MC/custom_jars_manifest.json"; then
    echo "[Codex Build] NOTE: jar content changed -- custom_jars_manifest.json (x3) and the packwiz"
    echo "              markers are stale until you finish the release (custom-jar-release skill):"
    echo "              pwsh .minecraft/dev/regen_custom_jars_manifest.ps1"
fi
echo "[Codex Build] Done."
