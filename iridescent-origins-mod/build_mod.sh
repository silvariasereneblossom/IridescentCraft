#!/usr/bin/env bash
# =============================================================================
# Iridescent Origins -- Build + deploy to all three distros
# =============================================================================
# Output: build/libs/iridescent_origins-<version>.jar -> copied to:
#   - .minecraft/mods/
#   - .minecraft/server_distribution/mods/
#   - .minecraft/distribution/client/mods/
#
# Source of truth: src/main/resources/. Edit JSONs there directly; the build
# packs them straight into the jar. (An older version of this script
# round-tripped data from the previously-deployed jar back into src/, which
# would silently clobber pending edits — removed.)
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
MC="$PROJECT_ROOT/.minecraft"

VERSION=$(grep '^mod_version=' "$SCRIPT_DIR/gradle.properties" | cut -d= -f2 | tr -d '[:space:]')
JAR_NAME="iridescent_origins-${VERSION}.jar"
OUT="$SCRIPT_DIR/build/libs/$JAR_NAME"

cd "$SCRIPT_DIR"

echo "[Origins Build] Running ./gradlew build (version=$VERSION) ..."
./gradlew build --no-daemon

if [ ! -f "$OUT" ]; then
  echo "ERROR: Expected output jar not found at $OUT"
  ls -la build/libs/ 2>/dev/null || true
  exit 1
fi

echo "[Origins Build] Deploying $JAR_NAME to all 3 distros ..."
for d in "$MC/mods" "$MC/server_distribution/mods" "$MC/distribution/client/mods"; do
  mkdir -p "$d"
  # Strip any older version of this jar so the load order doesn't pick up
  # both alongside each other.
  find "$d" -maxdepth 1 -type f -name "iridescent_origins-*.jar" \
    -not -name "$JAR_NAME" -delete 2>/dev/null || true
  cp "$OUT" "$d/"
  echo "  -> $d/$JAR_NAME"
done

echo "[Origins Build] Done."
echo
echo "Reminder: confirm the JAR is in the custom-JAR allowlists if the"
echo "filename changed (CLAUDE.md / wiki/CLAUDE.md lists the files to update)."
