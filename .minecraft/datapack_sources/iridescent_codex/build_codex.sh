#!/usr/bin/env bash
# =============================================================================
# Recompile the Codex jar's @Mod class (only when src/ changes)
# =============================================================================
# Since 2026-10-17 the jar is built by .minecraft/dev/codex/codex.py (Python, no
# JDK, the same bytes on every machine): it fills the book's facts from the
# registries, configs and scripts, writes data/ and assets/, styles the titles
# (style_codex.py), packs the jar, validates it (validate_codex.py) and deploys
# it with the manifests, markers and expected_state:
#
#     python .minecraft/dev/codex/codex.py release
#
# The jar's one compiled file, classes/com/iridescentcraft/codex/IridescentCodex.class,
# is committed. This script remakes it from src/ with javac (WSL: openjdk-17-jdk),
# for the rare change to the Java source; then run the release above.
# =============================================================================

set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BUILD_DIR="$SCRIPT_DIR/build_classes"

if ! command -v javac >/dev/null 2>&1; then
    echo "ERROR: 'javac' not found. WSL: sudo apt install -y openjdk-17-jdk"
    exit 1
fi
trap 'rm -rf "$BUILD_DIR"' EXIT

cd "$SCRIPT_DIR"
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR"
# The stub annotation is compiled with the class only so javac can resolve it; only our class is kept.
javac -encoding UTF-8 -d "$BUILD_DIR" --release 17 \
    stub/net/minecraftforge/fml/common/Mod.java \
    src/com/iridescentcraft/codex/IridescentCodex.java
mkdir -p classes/com/iridescentcraft/codex
cp "$BUILD_DIR/com/iridescentcraft/codex/IridescentCodex.class" classes/com/iridescentcraft/codex/
echo "[Codex] classes/com/iridescentcraft/codex/IridescentCodex.class rebuilt."
echo "        Now: python .minecraft/dev/codex/codex.py release   (then commit what it lists)"
