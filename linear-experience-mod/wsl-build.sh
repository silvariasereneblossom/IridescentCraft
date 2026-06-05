#!/usr/bin/env bash
# =============================================================================
# wsl-build.sh -- Build linearxp-1.0.0.jar (Linear Experience) from inside WSL2.
#
# Third-party MIT mod (github.com/seliaYYDS/Linear-Experience, modid 'linearxp')
# vendored into IridescentCraft and managed as a custom jar because there is no
# published release (not on CurseForge/Modrinth). Flattens the vanilla XP curve;
# the pack runs it in STATIC mode (config/linear-xp.toml) so every level costs a
# flat staticModeXpNeeded raw XP. Foundation for the aptitude-cost rework (#76).
#
# Workaround for task #39: native Windows gradle fails on this host (AF_UNIX
# EINVAL, JDK17/Win11). WSL2 runs a real Linux kernel where AF_UNIX works.
#
# Prereqs (one-time, inside WSL Ubuntu): sudo apt install -y openjdk-17-jdk
#
# Usage (from WSL bash):
#   ./wsl-build.sh             # build + deploy jar to the 3 repo distros
#   ./wsl-build.sh --no-deploy # build only (jar at build/libs/)
#   ./wsl-build.sh --clean     # ./gradlew clean first
#
# No external mod dependencies (mods.toml declares only forge + minecraft), so
# unlike the iridescent_* mods there is NO compileOnly lib-staging step.
# =============================================================================
set -euo pipefail

MOD_ROOT="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(dirname "$MOD_ROOT")"
JAR_NAME="linearxp-1.0.0-iridescent.1.jar"

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
command -v java >/dev/null 2>&1 || { echo "[wsl-build] ERROR: java missing -- sudo apt install -y openjdk-17-jdk"; exit 1; }

cd "$MOD_ROOT"

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
BUILT="$(ls build/libs/$JAR_NAME 2>/dev/null | head -n1 || true)"
if [ -z "$BUILT" ]; then
  BUILT="$(ls build/libs/linearxp-*.jar 2>/dev/null | grep -vE 'sources|javadoc' | head -n1 || true)"
fi
if [ -z "$BUILT" ]; then echo "[wsl-build] ERROR: jar not found under build/libs/"; ls -la build/libs/ 2>/dev/null || true; exit 1; fi
echo "[wsl-build] Built: $BUILT"

if [ "$DEPLOY" = 1 ]; then
  for d in "$REPO_ROOT/.minecraft/mods" "$REPO_ROOT/.minecraft/server_distribution/mods" "$REPO_ROOT/.minecraft/distribution/client/mods"; do
    if [ -d "$d" ]; then
      find "$d" -maxdepth 1 -name 'linearxp-*.jar' -not -name "$JAR_NAME" -delete 2>/dev/null || true
      cp "$BUILT" "$d/$JAR_NAME"; echo "  -> $d/$JAR_NAME"
    fi
  done
fi
echo "[wsl-build] Done."
