#!/usr/bin/env bash
# =============================================================================
# wsl-build.sh -- Build iridescent_difficulty-<version>.jar from inside WSL2.
#
# Workaround for task #39: native Windows gradle fails on this host (AF_UNIX
# EINVAL, JDK17/Win11). WSL2 runs a real Linux kernel where AF_UNIX works.
# Modeled on linear-experience-mod/wsl-build.sh.
#
# Prereqs (one-time, inside WSL Ubuntu): sudo apt install -y openjdk-17-jdk
#
# Usage (from WSL bash, or `wsl bash -lc "cd <mod> && ./wsl-build.sh"`):
#   ./wsl-build.sh                # build + deploy jar to the repo distros
#   ./wsl-build.sh --distros-only # same (alias; this mod has no Z: live target)
#   ./wsl-build.sh --no-deploy    # build only (jar at build/libs/)
#   ./wsl-build.sh --clean        # ./gradlew clean first
#
# Plain ForgeGradle build (`jar` finalizedBy `reobfJar`): no mixins, no refmap,
# no external mod dependencies (mods.toml declares only forge + minecraft), so
# there is NO compileOnly lib-staging step.
#
# gradle-wrapper.jar is NOT tracked for this mod (the repo-root `*.jar` ignore
# swallowed it), so a clean checkout has ./gradlew but no wrapper jar. It is
# bootstrapped from a sibling mod (every tracked wrapper jar in this repo is
# interchangeable); the copy stays git-ignored. The wrapper then fetches the
# Gradle version named in gradle/wrapper/gradle-wrapper.properties.
#
# Deploys ONLY into the three repo distro mods/ dirs -- never the live server
# -- and only into a distro that ALREADY ships a jar of this mod (not every
# custom mod belongs in all three). After a deploy, route the release through
# the custom-jar-release skill (manifest regen + .pw.toml markers).
# =============================================================================
set -euo pipefail

MOD_ROOT="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(dirname "$MOD_ROOT")"
MC="$REPO_ROOT/.minecraft"
JAR_GLOB='iridescent_difficulty-*.jar'
VERSION="$(grep '^mod_version=' "$MOD_ROOT/gradle.properties" | cut -d= -f2 | tr -d '[:space:]')"
JAR_NAME="iridescent_difficulty-${VERSION}.jar"

DEPLOY=1; CLEAN=0
for arg in "$@"; do
  case "$arg" in
    --no-deploy)    DEPLOY=0 ;;
    --distros-only) DEPLOY=1 ;;   # alias: the only deploy target here is the repo distros
    --clean)        CLEAN=1 ;;
    -h|--help)      sed -n '2,/^# ====.*$/p' "$0" | sed -n '1,40p'; exit 0 ;;
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
  for sib in iridescent-tetra-expansion-mod iridescent-aptitudes-mod iridescent-relics-mod iridescent-grand-compass-mod linear-experience-mod; do
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
  echo "[wsl-build] Stripping CRLF from gradlew"
  sed -i 's/\r$//' gradlew
fi
chmod +x ./gradlew
[ "$CLEAN" = 1 ] && ./gradlew clean
echo "[wsl-build] ./gradlew build"
./gradlew build --no-daemon --console=plain

# --- locate + deploy ----------------------------------------------------------
OUT="build/libs/$JAR_NAME"
[ -f "$OUT" ] || { echo "[wsl-build] ERROR: $OUT not found"; ls -la build/libs/ 2>/dev/null || true; exit 1; }
echo "[wsl-build] Built: $OUT"

if [ "$DEPLOY" = 1 ]; then
  deployed=0
  for d in "$MC/mods" "$MC/server_distribution/mods" "$MC/distribution/client/mods"; do
    # Only refresh a distro that already ships this mod.
    if ! ls "$d"/$JAR_GLOB >/dev/null 2>&1; then
      echo "  -- skip $d (no $JAR_GLOB there: this mod does not ship in that distro)"
      continue
    fi
    find "$d" -maxdepth 1 -type f -name "$JAR_GLOB" -not -name "$JAR_NAME" -delete 2>/dev/null || true
    cp "$OUT" "$d/$JAR_NAME"; echo "  -> $d/$JAR_NAME"
    deployed=$((deployed + 1))
  done
  [ "$deployed" -gt 0 ] || echo "[wsl-build] WARNING: deployed nowhere -- no distro currently ships $JAR_GLOB"
fi
echo "[wsl-build] Done."
