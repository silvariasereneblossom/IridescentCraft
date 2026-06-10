#!/usr/bin/env bash
# =============================================================================
# wsl-build.sh -- Build iridescent_grand_compass-1.0.0.jar from inside WSL2.
#
# Workaround for task #39 (native Windows gradle is dead). WSL2 + JDK17.
# Prereqs (one-time): sudo apt install -y openjdk-17-jdk
#
# Usage (from WSL bash):
#   ./wsl-build.sh                # build + deploy jar to the 3 repo distros
#   ./wsl-build.sh --distros-only # same (alias; this mod has no Z: live target)
#   ./wsl-build.sh --no-deploy    # build only (jar at build/libs/)
#   ./wsl-build.sh --clean        # ./gradlew clean first
# Flags mirror iridescent-tetra-expansion's wsl-build.sh so muscle-memory
# carries across mods (a tetra flag passed here used to abort with "unknown
# arg" before the build, which reads as a no-op if the error is filtered out).
# =============================================================================
set -euo pipefail

MOD_ROOT="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(dirname "$MOD_ROOT")"
JAR_NAME="iridescent_grand_compass-1.0.0.jar"

DEPLOY=1; CLEAN=0
for arg in "$@"; do
  case "$arg" in
    --no-deploy)    DEPLOY=0 ;;
    --distros-only) DEPLOY=1 ;;   # alias: only deploy target here is the 3 distros
    --clean)        CLEAN=1 ;;
    -h|--help)      sed -n '/^#/p' "$0" | head -20; exit 0 ;;
    *) echo "[wsl-build] unknown arg: $arg"; exit 2 ;;
  esac
done

echo "[wsl-build] MOD_ROOT  = $MOD_ROOT"
echo "[wsl-build] REPO_ROOT = $REPO_ROOT"
command -v java >/dev/null 2>&1 || { echo "[wsl-build] ERROR: java missing -- sudo apt install -y openjdk-17-jdk"; exit 1; }

cd "$MOD_ROOT"

# --- stage compileOnly libs (Explorer's + Nature's Compass) -------------------
# Renamed to stable artifact names (no version) so flatDir's [artifact].[ext]
# pattern resolves them for fg.deobf.
mkdir -p libs
INSTANCE_MODS="/mnt/c/Users/silvariazemaitis/AppData/Roaming/PrismLauncher/instances/IridescentCraft/.minecraft/mods"

stage_lib() {  # <dest-name> <glob1> [glob2 ...]
  local dest="$1"; shift
  [ -f "libs/$dest" ] && return 0
  local cache hit pat
  for cache in "$INSTANCE_MODS"; do
    for pat in "$@"; do
      hit="$(ls "$cache"/$pat 2>/dev/null | head -n1 || true)"
      if [ -n "$hit" ]; then echo "[wsl-build] stage libs/$dest <- $hit"; cp "$hit" "libs/$dest"; return 0; fi
    done
  done
  echo "[wsl-build] ERROR: could not find a source jar for libs/$dest (patterns: $*)"; return 1
}

stage_lib explorerscompass.jar 'ExplorersCompass*.jar' 'explorerscompass*.jar'
stage_lib naturescompass.jar   'NaturesCompass*.jar'   'naturescompass*.jar'

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
BUILT="$(ls build/libs/$JAR_NAME build/libs/iridescent_grand_compass-*.jar 2>/dev/null | grep -v sources | head -n1 || true)"
if [ -z "$BUILT" ]; then echo "[wsl-build] ERROR: jar not found under build/libs/"; ls -la build/libs/ 2>/dev/null || true; exit 1; fi
echo "[wsl-build] Built: $BUILT"

if [ "$DEPLOY" = 1 ]; then
  for d in "$REPO_ROOT/.minecraft/mods" "$REPO_ROOT/.minecraft/server_distribution/mods" "$REPO_ROOT/.minecraft/distribution/client/mods"; do
    if [ -d "$d" ]; then
      find "$d" -maxdepth 1 -name 'iridescent_grand_compass-*.jar' -not -name "$JAR_NAME" -delete 2>/dev/null || true
      cp "$BUILT" "$d/$JAR_NAME"; echo "  -> $d/$JAR_NAME"
    fi
  done
fi
echo "[wsl-build] Done."
