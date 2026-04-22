#!/usr/bin/env bash
# =============================================================================
# Iridescent Biomes — Build + deploy to all three distros
# =============================================================================
# Uses ForgeGradle (net.minecraftforge.gradle plugin 6.0.16+) to compile
# against real Minecraft + Forge + TerraBlender classpath. On first run
# Gradle will download the Forge toolchain and MC remapped jars (~500MB),
# then subsequent builds are fast.
#
# Output: build/libs/iridescent_biomes-1.0.0.jar → copied to:
#   - .minecraft/mods/
#   - .minecraft/server_distribution/mods/
#   - .minecraft/distribution/client/mods/
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
MC="$PROJECT_ROOT/.minecraft"

JAR_NAME="iridescent_biomes-1.0.0.jar"
OUT="$SCRIPT_DIR/build/libs/$JAR_NAME"

cd "$SCRIPT_DIR"

echo "[Biomes Build] Pre-check: feature-order cycle detector ..."
# Fails fast if our biome JSONs would produce a server-crash at world load.
# First run downloads vanilla + BoP reference jars into tools/.cache/; later
# runs are sub-second from cache.
if ! python3 tools/check_feature_cycles.py; then
  echo ""
  echo "[Biomes Build] ABORTED: cycle detector reported conflicts."
  echo "[Biomes Build] Fix the biome JSONs above before rebuilding."
  exit 1
fi
echo ""

echo "[Biomes Build] Running ./gradlew build ..."
./gradlew build --no-daemon

if [ ! -f "$OUT" ]; then
  echo "ERROR: Expected output jar not found at $OUT"
  exit 1
fi

echo "[Biomes Build] Deploying $JAR_NAME to all 3 distros ..."
for d in "$MC/mods" "$MC/server_distribution/mods" "$MC/distribution/client/mods"; do
  mkdir -p "$d"
  cp -f "$OUT" "$d/$JAR_NAME"
  echo "  -> $d/$JAR_NAME"
done

echo "[Biomes Build] Done."
echo ""
echo "IMPORTANT: Add 'iridescent_biomes-1.0.0.jar' to the custom-JAR allowlists in:"
echo "  - server_distribution/iridescentserver.bat"
echo "  - distribution/client/sync_from_repo.bat"
echo "  - update_mods.sh"
echo "Otherwise the self-updater will treat it as stale and delete it on next sync."
