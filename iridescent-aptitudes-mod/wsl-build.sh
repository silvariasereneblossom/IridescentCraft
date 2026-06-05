#!/usr/bin/env bash
# =============================================================================
# wsl-build.sh -- Build justlevelingfork-<version>.jar (Iridescent Aptitudes)
# from inside WSL2 and deploy it to all three distro mods/ folders.
#
# Host (Windows) gradle is dead (#39: AF_UNIX EINVAL on Win11 / JDK17). WSL2 has
# a real Linux kernel where the loopback works. This is the canonical build
# script for this mod (supersedes build_mod.sh, which did NOT stage libs/ and
# fails from a clean checkout).
#
# build.gradle resolves its compileOnly integration deps from flatDir libs/ as
# `<name>-<version>.jar`; this script auto-stages them from the live PrismLauncher
# instance mods (renaming where the instance filename differs, e.g. curios '+').
#
# Usage (from WSL bash, or `wsl bash -lc "cd <mod> && ./wsl-build.sh"`):
#   ./wsl-build.sh             # stage libs + build + deploy to 3 distros
#   ./wsl-build.sh --no-deploy # build only (jar at build/libs/)
#   ./wsl-build.sh --clean     # ./gradlew clean first
# =============================================================================
set -euo pipefail

MOD_ROOT="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(dirname "$MOD_ROOT")"
MC="$REPO_ROOT/.minecraft"
VERSION="$(grep '^mod_version=' "$MOD_ROOT/gradle.properties" | cut -d= -f2 | tr -d '[:space:]')"
JAR_NAME="justlevelingfork-${VERSION}.jar"

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

# --- stage compileOnly libs into libs/ (flatDir deobf names) ------------------
mkdir -p libs
INSTANCE_MODS="/mnt/c/Users/silvariazemaitis/AppData/Roaming/PrismLauncher/instances/IridescentCraft/.minecraft/mods"

stage_lib() {  # <dest-name> <glob1> [glob2 ...] searched in the instance mods
  local dest="$1"; shift
  [ -f "libs/$dest" ] && return 0
  local hit pat
  for pat in "$@"; do
    hit="$(ls "$INSTANCE_MODS"/$pat 2>/dev/null | head -n1 || true)"
    if [ -n "$hit" ]; then echo "[wsl-build] stage libs/$dest <- $(basename "$hit")"; cp "$hit" "libs/$dest"; return 0; fi
  done
  echo "[wsl-build] ERROR: no source jar for libs/$dest (patterns: $*)"; return 1
}

stage_lib curios-forge-5.14.1-1.20.1.jar                   'curios-forge-5.14.1*.jar' 'curios-forge-*.jar'
stage_lib tetra-1.20.1-6.12.0.jar                          'tetra-1.20.1-6.12.0.jar' 'tetra-1.20.1-*.jar'
stage_lib mutil-1.20.1-6.3.0.jar                           'mutil-1.20.1-6.3.0.jar' 'mutil-1.20.1-*.jar'
stage_lib irons_spellbooks-1.20.1-3.15.5.1.jar             'irons_spellbooks-1.20.1-3.15.5.1.jar' 'irons_spellbooks-1.20.1-*.jar'
stage_lib yet_another_config_lib_v3-3.6.6+1.20.1-forge.jar 'yet_another_config_lib_v3-3.6.6+1.20.1-forge.jar' 'yet_another_config_lib_v3-*.jar'
stage_lib Patchouli-1.20.1-85-FORGE.jar                    'Patchouli-1.20.1-85-FORGE.jar' 'Patchouli-1.20.1-*.jar'

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
      find "$d" -maxdepth 1 -type f -name 'justlevelingfork-*.jar' -not -name "$JAR_NAME" -delete 2>/dev/null || true
      cp "$OUT" "$d/$JAR_NAME"; echo "  -> $d/$JAR_NAME"
    fi
  done
fi
echo "[wsl-build] Done."
