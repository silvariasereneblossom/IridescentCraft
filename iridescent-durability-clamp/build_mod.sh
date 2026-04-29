#!/usr/bin/env bash
# =============================================================================
# Iridescent Durability Clamp -- Build + deploy to all three distros
# =============================================================================
# Output: build/libs/iridescent_durability_clamp-<version>.jar -> copied to:
#   - .minecraft/mods/
#   - .minecraft/server_distribution/mods/
#   - .minecraft/distribution/client/mods/
#
# After bumping mod_version in gradle.properties, also update the custom-JAR
# allowlists in:
#   - .minecraft/server_distribution/iridescentserver.bat ($customJars)
#   - .minecraft/distribution/client/sync_from_repo.bat ($customJars)
#   - .minecraft/server_distribution/update_mods.sh + .ps1 ($CUSTOM_JARS)
#   - .minecraft/distribution/client/update_mods.sh + .ps1
#   - .minecraft/server_distribution/server_install.ps1 (if used)
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
MC="$PROJECT_ROOT/.minecraft"

VERSION=$(grep '^mod_version=' "$SCRIPT_DIR/gradle.properties" | cut -d= -f2 | tr -d '[:space:]')
JAR_NAME="iridescent_durability_clamp-${VERSION}.jar"
OUT="$SCRIPT_DIR/build/libs/$JAR_NAME"

cd "$SCRIPT_DIR"

echo "[DurabilityClamp Build] Running ./gradlew build (version=$VERSION) ..."
./gradlew build --no-daemon

if [ ! -f "$OUT" ]; then
  echo "ERROR: Expected output jar not found at $OUT"
  echo "Look in build/libs/ for what actually got produced:"
  ls -la build/libs/ 2>/dev/null || true
  exit 1
fi

echo "[DurabilityClamp Build] Deploying $JAR_NAME to all 3 distros ..."
for d in "$MC/mods" "$MC/server_distribution/mods" "$MC/distribution/client/mods"; do
  mkdir -p "$d"
  # Remove any previous version of this jar so the load order doesn't
  # accidentally pick up an old build alongside the new one.
  find "$d" -maxdepth 1 -type f -name "iridescent_durability_clamp-*.jar" \
    -not -name "$JAR_NAME" -delete 2>/dev/null || true
  cp "$OUT" "$d/"
  echo "  -> $d/$JAR_NAME"
done

echo "[DurabilityClamp Build] Done."
echo
echo "Reminder: confirm the JAR is in the custom-JAR allowlists if this is a new"
echo "filename (CLAUDE.md / wiki/CLAUDE.md lists the files to update)."
