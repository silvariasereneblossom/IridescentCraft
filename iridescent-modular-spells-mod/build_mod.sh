#!/usr/bin/env bash
# =============================================================================
# Iridescent Modular Spells -- Build + deploy to all three distros
# =============================================================================
# Output: build/libs/iridescent_modular_spells-<version>.jar -> copied to:
#   - .minecraft/mods/
#   - .minecraft/server_distribution/mods/
#   - .minecraft/distribution/client/mods/
#
# After adding a new version, also update the custom-JAR allowlists in
# server_distribution/iridescentserver.bat, distribution/client/sync_from_repo.bat,
# and update_mods.sh -- the script reminds at the end if it runs cleanly.
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
MC="$PROJECT_ROOT/.minecraft"

# Read mod_version from gradle.properties so we don't drift
VERSION=$(grep '^mod_version=' "$SCRIPT_DIR/gradle.properties" | cut -d= -f2 | tr -d '[:space:]')
JAR_NAME="iridescent_modular_spells-${VERSION}.jar"
OUT="$SCRIPT_DIR/build/libs/$JAR_NAME"

cd "$SCRIPT_DIR"

echo "[ModSpells Build] Running ./gradlew build (version=$VERSION) ..."
./gradlew build --no-daemon

if [ ! -f "$OUT" ]; then
  echo "ERROR: Expected output jar not found at $OUT"
  echo "Look in build/libs/ for what actually got produced:"
  ls -la build/libs/ 2>/dev/null || true
  exit 1
fi

echo "[ModSpells Build] Deploying $JAR_NAME to all 3 distros ..."
for d in "$MC/mods" "$MC/server_distribution/mods" "$MC/distribution/client/mods"; do
  mkdir -p "$d"
  cp -f "$OUT" "$d/$JAR_NAME"
  echo "  -> $d/$JAR_NAME"
done

echo "[ModSpells Build] Done."
echo ""
echo "REMINDER: Add '$JAR_NAME' to the custom-JAR allowlists in:"
echo "  - server_distribution/iridescentserver.bat"
echo "  - distribution/client/sync_from_repo.bat"
echo "  - update_mods.sh"
echo "and the pattern '!**/mods/iridescent_modular_spells-*.jar' to .gitignore"
echo "if not already present, or the self-updater will treat this jar as"
echo "stale and delete it on next sync."
