#!/usr/bin/env bash
# =============================================================================
# wsl-build.sh -- Build lovely_sparkle_pieces-<version>.jar (Iridescent Lovely
# Pieces, the managed fork of roylinglrl's Lovely Sparkle Pieces) from inside
# WSL2 and deploy it to all three distro mods/ folders.
#
# Host (Windows) gradle is dead (#39: AF_UNIX EINVAL on Win11 / JDK17). WSL2 has
# a real Linux kernel where the loopback works. This is the canonical build
# script for this mod (modeled on iridescent-aptitudes-mod/wsl-build.sh).
#
# Differences from the aptitudes script, both forced by this fork's layout:
#   * NO libs/ staging. build.gradle resolves its compileOnly deps (Curios API
#     5.4.7, JEI API 15.2.0.27) from their remote mavens via fg.deobf, not from a
#     flatDir -- so the build needs network, and there is no libs/ dir.
#   * gradle-wrapper.jar is NOT tracked for this mod (the repo-root `*.jar`
#     ignore swallowed it at fork intake), so a clean checkout has ./gradlew but
#     no wrapper jar. It is bootstrapped from a sibling mod (every tracked
#     wrapper jar in this repo is the same file); the copy stays git-ignored.
#     The wrapper then fetches the Gradle named in gradle-wrapper.properties.
#
# The jar is a plain ForgeGradle build (`jar` finalizedBy `reobfJar`): SRG-named
# classes, NO Mixin gradle plugin, no refmap, no MixinConfigs manifest entry.
# Keep it that way -- the output filename must stay exactly
# lovely_sparkle_pieces-<mod_version>.jar (base.archivesName = mod_id).
#
# Deploys ONLY to the three repo distro mods/ dirs -- never to the live server.
#
# Usage (from WSL bash, or `wsl bash -lc "cd <mod> && ./wsl-build.sh"`):
#   ./wsl-build.sh             # build + deploy to 3 distros
#   ./wsl-build.sh --no-deploy # build only (jar at build/libs/)
#   ./wsl-build.sh --clean     # ./gradlew clean first
# =============================================================================
set -euo pipefail

MOD_ROOT="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(dirname "$MOD_ROOT")"
MC="$REPO_ROOT/.minecraft"
VERSION="$(grep '^mod_version=' "$MOD_ROOT/gradle.properties" | cut -d= -f2 | tr -d '[:space:]')"
JAR_NAME="lovely_sparkle_pieces-${VERSION}.jar"

DEPLOY=1; CLEAN=0
for arg in "$@"; do
  case "$arg" in
    --no-deploy) DEPLOY=0 ;;
    --clean)     CLEAN=1 ;;
    *) echo "[wsl-build] unknown arg: $arg"; exit 2 ;;
  esac
done

echo "[wsl-build] MOD_ROOT  = $MOD_ROOT"
echo "[wsl-build] REPO_ROOT = $REPO_ROOT"
echo "[wsl-build] VERSION   = $VERSION"
command -v java >/dev/null 2>&1 || { echo "[wsl-build] ERROR: java missing -- sudo apt install -y openjdk-17-jdk"; exit 1; }

cd "$MOD_ROOT"

# --- gradle wrapper jar (untracked for this mod; borrow a sibling's) ----------
WRAPPER_JAR="gradle/wrapper/gradle-wrapper.jar"
if [ ! -f "$WRAPPER_JAR" ]; then
  for sib in iridescent-aptitudes-mod iridescent-relics-mod iridescent-tetra-expansion-mod linear-experience-mod; do
    if [ -f "$REPO_ROOT/$sib/$WRAPPER_JAR" ]; then
      echo "[wsl-build] bootstrap $WRAPPER_JAR <- $sib"
      cp "$REPO_ROOT/$sib/$WRAPPER_JAR" "$WRAPPER_JAR"
      break
    fi
  done
  [ -f "$WRAPPER_JAR" ] || { echo "[wsl-build] ERROR: no gradle-wrapper.jar here or in any sibling mod"; exit 1; }
fi

# --- gradle (CRLF-strip gradlew first; Windows checkout) ----------------------
if grep -q $'\r' gradlew 2>/dev/null; then
  echo "[wsl-build] Stripping CRLF from gradlew"; sed -i 's/\r$//' gradlew
fi
chmod +x ./gradlew
[ "$CLEAN" = 1 ] && ./gradlew clean
echo "[wsl-build] ./gradlew build"
./gradlew build --no-daemon --console=plain

OUT="build/libs/$JAR_NAME"
[ -f "$OUT" ] || { echo "[wsl-build] ERROR: $OUT not found"; ls -la build/libs/ 2>/dev/null || true; exit 1; }
echo "[wsl-build] Built: $OUT"

if [ "$DEPLOY" = 1 ]; then
  for d in "$MC/mods" "$MC/server_distribution/mods" "$MC/distribution/client/mods"; do
    if [ -d "$d" ]; then
      find "$d" -maxdepth 1 -type f -name 'lovely_sparkle_pieces-*.jar' -not -name "$JAR_NAME" -delete 2>/dev/null || true
      cp "$OUT" "$d/$JAR_NAME"; echo "  -> $d/$JAR_NAME"
    fi
  done
fi
echo "[wsl-build] Done."
