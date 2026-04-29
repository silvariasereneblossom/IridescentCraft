#!/usr/bin/env bash
# =============================================================================
# Iridescent Aptitudes -- Build + deploy to all three distros
# =============================================================================
# Output: build/libs/justlevelingfork-<version>.jar -> copied to:
#   - .minecraft/mods/
#   - .minecraft/server_distribution/mods/
#   - .minecraft/distribution/client/mods/
#
# Removes the upstream justlevelingfork-1.2.1.jar from each distro since
# our fork ships with the same modid 'justlevelingfork' (NBT compat) and
# can't coexist with upstream.
#
# After bumping mod_version in gradle.properties, also update the custom-JAR
# allowlists per CLAUDE.md.
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
MC="$PROJECT_ROOT/.minecraft"

VERSION=$(grep '^mod_version=' "$SCRIPT_DIR/gradle.properties" | cut -d= -f2 | tr -d '[:space:]')
JAR_NAME="justlevelingfork-${VERSION}.jar"
OUT="$SCRIPT_DIR/build/libs/$JAR_NAME"

cd "$SCRIPT_DIR"

echo "[Aptitudes Build] Running ./gradlew build (version=$VERSION) ..."
./gradlew build --no-daemon

if [ ! -f "$OUT" ]; then
  echo "ERROR: Expected output jar not found at $OUT"
  ls -la build/libs/ 2>/dev/null || true
  exit 1
fi

echo "[Aptitudes Build] Deploying $JAR_NAME to all 3 distros ..."
for d in "$MC/mods" "$MC/server_distribution/mods" "$MC/distribution/client/mods"; do
  mkdir -p "$d"
  # Remove any previous version of this jar (and the upstream JLFork)
  find "$d" -maxdepth 1 -type f -name "justlevelingfork-*.jar" \
    -not -name "$JAR_NAME" -delete 2>/dev/null || true
  cp "$OUT" "$d/"
  echo "  -> $d/$JAR_NAME"
done

echo "[Aptitudes Build] Done."
echo
echo "Reminder: confirm the JAR is in the custom-JAR allowlists if the"
echo "filename changed (CLAUDE.md / wiki/CLAUDE.md lists the files to update)."
