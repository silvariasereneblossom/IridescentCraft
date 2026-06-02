#!/usr/bin/env bash
# =============================================================================
# wsl-build.sh -- Build iridescent_relics-1.0.0.jar from inside WSL2.
#
# Workaround for task #39: gradle fails on the Windows dev host with
# "Unable to establish loopback connection" (WEPollSelectorImpl AF_UNIX
# init EINVAL). WSL2 runs a real Linux kernel where AF_UNIX works.
#
# Prereqs (one-time, inside WSL Ubuntu): sudo apt install -y openjdk-17-jdk
#
# Usage (from WSL bash):
#   ./wsl-build.sh             # build + deploy jar to the 3 repo distros
#   ./wsl-build.sh --no-deploy # build only (jar at build/libs/)
#   ./wsl-build.sh --clean     # ./gradlew clean first
# =============================================================================
set -euo pipefail

MOD_ROOT="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(dirname "$MOD_ROOT")"
JAR_NAME="iridescent_relics-1.0.0.jar"

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

# --- stage the compileOnly libs (Curios + Relics framework + OctoLib) ---------
# These are deobf-resolved via flatDir libs/. The real filenames carry version/'+'
# suffixes that break Gradle coordinate parsing, so we copy + rename to stable names
# (curios-forge.jar / relics.jar / octolib.jar). They live in the instance mods dir;
# curios additionally has a couple of sibling-mod cache fallbacks.
mkdir -p libs
INSTANCE_MODS="/mnt/c/Users/silvariazemaitis/AppData/Roaming/PrismLauncher/instances/IridescentCraft/.minecraft/mods"

stage_lib() {  # <dest-name> <glob1> [glob2 ...] searched across the cache dirs below
  local dest="$1"; shift
  [ -f "libs/$dest" ] && return 0
  local cache hit pat
  for cache in \
      "$INSTANCE_MODS" \
      "$REPO_ROOT/iridescent-biomes-mod/tools/.cache/all-mods" \
      "$REPO_ROOT/iridescent-tetra-expansion-mod/libs"; do
    for pat in "$@"; do
      hit="$(ls "$cache"/$pat 2>/dev/null | head -n1 || true)"
      if [ -n "$hit" ]; then echo "[wsl-build] stage libs/$dest <- $hit"; cp "$hit" "libs/$dest"; return 0; fi
    done
  done
  echo "[wsl-build] ERROR: could not find a source jar for libs/$dest (patterns: $*)"; return 1
}

stage_lib curios-forge.jar 'curios-forge*.jar'
stage_lib relics.jar       'relics-*.jar' 'relics*.jar'
stage_lib octolib.jar      'OctoLib*.jar' 'octolib*.jar'

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
BUILT="$(ls build/libs/$JAR_NAME build/libs/iridescent_relics-*.jar 2>/dev/null | head -n1 || true)"
if [ -z "$BUILT" ]; then echo "[wsl-build] ERROR: jar not found under build/libs/"; ls -la build/libs/ 2>/dev/null || true; exit 1; fi
echo "[wsl-build] Built: $BUILT"

if [ "$DEPLOY" = 1 ]; then
  for d in "$REPO_ROOT/.minecraft/mods" "$REPO_ROOT/.minecraft/server_distribution/mods" "$REPO_ROOT/.minecraft/distribution/client/mods"; do
    if [ -d "$d" ]; then
      find "$d" -maxdepth 1 -name 'iridescent_relics-*.jar' -not -name "$JAR_NAME" -delete 2>/dev/null || true
      cp "$BUILT" "$d/$JAR_NAME"; echo "  -> $d/$JAR_NAME"
    fi
  done
fi
echo "[wsl-build] Done."
