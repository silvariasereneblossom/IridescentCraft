#!/usr/bin/env bash
# =============================================================================
# wsl-build.sh -- Build iridescent_durability_clamp-<version>.jar from inside
# WSL2.
#
# Workaround for task #39: native Windows gradle fails on this host (AF_UNIX
# EINVAL, JDK17/Win11). WSL2 runs a real Linux kernel where AF_UNIX works.
# Modeled on linear-experience-mod/wsl-build.sh. Supersedes build_mod.sh (the
# host-gradle era script, kept for its custom-JAR allowlist notes).
#
# Prereqs (one-time, inside WSL Ubuntu): sudo apt install -y openjdk-17-jdk
#
# Usage (from WSL bash, or `wsl bash -lc "cd <mod> && ./wsl-build.sh"`):
#   ./wsl-build.sh                # build + verify + deploy jar to the repo distros
#   ./wsl-build.sh --distros-only # same (alias; this mod has no Z: live target)
#   ./wsl-build.sh --no-deploy    # build + verify only (jar at build/libs/)
#   ./wsl-build.sh --clean        # ./gradlew clean first
#
# This is a MIXIN mod: the jar must carry iridescent_durability_clamp.mixins.json,
# its refmap, and every mixin class the config lists -- the config is
# `"required": true`, so a listed-but-missing class is a hard crash on load and a
# missing refmap silently un-clamps durability. The post-build check below
# refuses to deploy a jar that fails any of those. No external mod dependencies,
# so there is NO compileOnly lib-staging step.
#
# The jar carries a SECOND config, iridescent_durability_clamp.emptylevel.mixins.json
# (the empty-level prune backstop, `"required": false`): same checks, plus both
# must be named in the manifest's MixinConfigs. A jar that changes that mixin
# must boot an offline Forge server before it is pushed -- main is deployed to
# the live server unattended.
#
# And a THIRD, iridescent_durability_clamp.lootr.mixins.json (Lootr's tick
# without its per-tick copy, `"required": true`; its plugin applies it to
# Lootr 0.7.35.94 only and skips it for any other Lootr or none): same checks.
# It targets Lootr by name, so Lootr is not a compile dependency either.
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
MOD_ID="iridescent_durability_clamp"
JAR_GLOB="${MOD_ID}-*.jar"
VERSION="$(grep '^mod_version=' "$MOD_ROOT/gradle.properties" | cut -d= -f2 | tr -d '[:space:]')"
JAR_NAME="${MOD_ID}-${VERSION}.jar"

DEPLOY=1; CLEAN=0
for arg in "$@"; do
  case "$arg" in
    --no-deploy)    DEPLOY=0 ;;
    --distros-only) DEPLOY=1 ;;   # alias: the only deploy target here is the repo distros
    --clean)        CLEAN=1 ;;
    -h|--help)      sed -n '2,/^# ====.*$/p' "$0" | sed -n '1,45p'; exit 0 ;;
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
  for sib in iridescent-grand-compass-mod iridescent-aptitudes-mod iridescent-relics-mod linear-experience-mod iridescent-tetra-expansion-mod; do
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

# --- locate -------------------------------------------------------------------
OUT="build/libs/$JAR_NAME"
[ -f "$OUT" ] || { echo "[wsl-build] ERROR: $OUT not found"; ls -la build/libs/ 2>/dev/null || true; exit 1; }
echo "[wsl-build] Built: $OUT"

# --- verify the mixin payload (see header) ------------------------------------
# Two configs: the clamp's ("required": true) and the empty-level prune
# backstop's ("required": false). Both must be in the jar AND named in the
# manifest's MixinConfigs -- a config the manifest does not name is never loaded.
MIXIN_CFGS=("${MOD_ID}.mixins.json" "${MOD_ID}.emptylevel.mixins.json" "${MOD_ID}.lootr.mixins.json")
REFMAP="${MOD_ID}.refmap.json"
LISTING="$(unzip -Z1 "$OUT")"
# (Manifest lines wrap at 72 bytes; a continuation line starts with one space.)
MANIFEST_CFGS="$(unzip -p "$OUT" META-INF/MANIFEST.MF | tr -d '\r' | awk '/^ /{printf "%s", substr($0,2); next} {printf "\n%s", $0} END{print ""}' | sed -n 's/^MixinConfigs: //p')"
grep -qxF "$REFMAP" <<<"$LISTING" || { echo "[wsl-build] ERROR: $REFMAP missing from $OUT -- NOT deploying"; exit 1; }
for MIXIN_CFG in "${MIXIN_CFGS[@]}"; do
  grep -qxF "$MIXIN_CFG" <<<"$LISTING" || { echo "[wsl-build] ERROR: $MIXIN_CFG missing from $OUT -- NOT deploying"; exit 1; }
  grep -qF ",$MIXIN_CFG," <<<",$MANIFEST_CFGS," || { echo "[wsl-build] ERROR: manifest MixinConfigs ($MANIFEST_CFGS) does not name $MIXIN_CFG -- NOT deploying"; exit 1; }
  MIXIN_PKG="$(unzip -p "$OUT" "$MIXIN_CFG" | sed -n 's/.*"package"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n1)"
  [ -n "$MIXIN_PKG" ] || { echo "[wsl-build] ERROR: no \"package\" in $MIXIN_CFG -- NOT deploying"; exit 1; }
  # Every quoted *Mixin name in the config's mixins/client/server arrays.
  MIXIN_CLASSES="$(unzip -p "$OUT" "$MIXIN_CFG" | tr -d '\r' | grep -oE '"[A-Za-z0-9_.$]*Mixin"' | tr -d '"' | sort -u)"
  [ -n "$MIXIN_CLASSES" ] || { echo "[wsl-build] ERROR: $MIXIN_CFG lists no mixin classes -- NOT deploying"; exit 1; }
  while IFS= read -r cls; do
    path="$(tr '.' '/' <<<"$MIXIN_PKG.$cls").class"
    grep -qxF "$path" <<<"$LISTING" || { echo "[wsl-build] ERROR: $MIXIN_CFG lists $cls but $path is not in $OUT -- NOT deploying"; exit 1; }
    echo "[wsl-build] mixin ok: $MIXIN_CFG -> $path"
  done <<<"$MIXIN_CLASSES"
done

# --- deploy -------------------------------------------------------------------
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
